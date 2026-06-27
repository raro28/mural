import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { computeArrangement, type Arrangement, type MonitorGeom } from '../lib/layout.js';

export class MonitorModel {
  private readonly monitors: Gio.ListModel;
  private listSig = 0;
  private monSigs: [GObject.Object, number][] = [];

  constructor() {
    const display = Gdk.Display.get_default()!;
    this.monitors = display.get_monitors();
  }

  private items(): Gdk.Monitor[] {
    const out: Gdk.Monitor[] = [];
    const n = this.monitors.get_n_items();
    for (let i = 0; i < n; i++) out.push(this.monitors.get_item(i) as Gdk.Monitor);
    return out;
  }

  connectors(): { connector: string; label: string }[] {
    return this.items().map((m) => {
      const maker = m.get_manufacturer() ?? '';
      const model = m.get_model() ?? '';
      const label = [maker, model].filter(Boolean).join(' ') || (m.get_connector() ?? '?');
      return { connector: m.get_connector() ?? '?', label };
    });
  }

  arrange(areaW: number, areaH: number): Arrangement {
    const geoms: MonitorGeom[] = this.items().map((m) => {
      const g = m.get_geometry();
      return { connector: m.get_connector() ?? '?', geometry: { x: g.x, y: g.y, width: g.width, height: g.height } };
    });
    return computeArrangement(geoms, areaW, areaH);
  }

  onChanged(cb: () => void): void {
    this.listSig = this.monitors.connect('items-changed', () => {
      this.rewireMonitorSignals(cb);
      cb();
    });
    this.rewireMonitorSignals(cb);
  }

  private rewireMonitorSignals(cb: () => void): void {
    for (const [obj, id] of this.monSigs) {
      try { obj.disconnect(id); } catch { /* gone */ }
    }
    this.monSigs = [];
    for (const m of this.items()) {
      this.monSigs.push([m, m.connect('notify::geometry', () => cb())]);
      this.monSigs.push([m, m.connect('invalidate', () => cb())]);
    }
  }

  destroy(): void {
    if (this.listSig) { try { this.monitors.disconnect(this.listSig); } catch { /* gone */ } this.listSig = 0; }
    for (const [obj, id] of this.monSigs) { try { obj.disconnect(id); } catch { /* gone */ } }
    this.monSigs = [];
  }
}
