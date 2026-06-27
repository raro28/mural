import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
  parseConfig, setMonitorEntry, type Config,
} from '../lib/config.js';
import type { Mode } from '../lib/mode.js';

declare const TextDecoder: new (encoding?: string) => { decode(input?: Uint8Array): string };
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export class ConfigStore {
  private readonly configDir: string;
  private readonly configPath: string;
  private monitor: Gio.FileMonitor | null = null;

  constructor() {
    this.configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'per-monitor-wallpaper']);
    this.configPath = GLib.build_filenamev([this.configDir, 'config.json']);
    GLib.mkdir_with_parents(this.configDir, 0o755);
  }

  read(): Config {
    try {
      const [ok, bytes] = GLib.file_get_contents(this.configPath);
      if (!ok) return {};
      return parseConfig(new TextDecoder().decode(bytes));
    } catch {
      return {};
    }
  }

  private write(cfg: Config): void {
    const file = Gio.File.new_for_path(this.configPath);
    const text = JSON.stringify(cfg, null, 2) + '\n';
    // Atomic replace: temp + rename, handled by Gio replace_contents with etag/backup off.
    file.replace_contents(
      new TextEncoder().encode(text),
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null,
    );
  }

  setMonitor(connector: string, file: string, mode: Mode): void {
    this.write(setMonitorEntry(this.read(), connector, file, mode));
  }

  watch(onChange: () => void): void {
    this.stop();
    const dir = Gio.File.new_for_path(this.configDir);
    this.monitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    this.monitor.connect('changed', (_m, f, other) => {
      const p = f ? f.get_path() : null;
      const op = other ? other.get_path() : null;
      if (p === this.configPath || op === this.configPath) onChange();
    });
  }

  stop(): void {
    if (this.monitor) {
      this.monitor.cancel();
      this.monitor = null;
    }
  }
}
