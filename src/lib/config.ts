import { normalizeMode, type Mode } from './mode.js';

export interface MonitorEntry {
  file?: string;
  mode?: string;
}

export interface Config {
  monitors?: Record<string, MonitorEntry>;
  default?: string | { file: string; mode?: string };
}

/** A fully-resolved wallpaper choice. */
export interface Entry {
  file: string;
  mode: Mode;
}

/** Tolerant parse: any invalid/non-object JSON yields an empty config. */
export function parseConfig(text: string): Config {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Config)
    : {};
}

/** Resolve the fallback default to {file, mode}; bare string -> mode zoom. */
export function normalizeDefault(cfg: Config): Entry | null {
  const d = cfg.default;
  if (typeof d === 'string') return d === '' ? null : { file: d, mode: 'zoom' };
  if (d !== null && typeof d === 'object' && typeof d.file === 'string' && d.file !== '')
    return { file: d.file, mode: normalizeMode(d.mode) };
  return null;
}

/** Resolve a monitor's explicit entry to {file, mode}, or null when unset. */
export function entryForConnector(cfg: Config, connector: string): Entry | null {
  const e = cfg.monitors?.[connector];
  if (!e || typeof e.file !== 'string' || e.file === '') return null;
  return { file: e.file, mode: normalizeMode(e.mode) };
}

/** Return a new Config with monitors[connector] = {file, mode}, other keys preserved. */
export function setMonitorEntry(cfg: Config, connector: string, file: string, mode: Mode): Config {
  return { ...cfg, monitors: { ...cfg.monitors, [connector]: { file, mode } } };
}
