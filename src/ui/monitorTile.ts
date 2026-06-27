import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gsk from 'gi://Gsk';
import Graphene from 'gi://Graphene';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { normalizeMode, type Mode } from '../lib/mode.js';
import type { ThumbnailCache } from './thumbnailCache.js';

const MODES: Mode[] = ['zoom', 'fill', 'fit', 'center'];
const LABELS: Record<Mode, string> = { zoom: 'Zoom', fill: 'Fill', fit: 'Fit', center: 'Center' };

// Childless leaf painter: draws the (optional) texture with a rounded clip via
// Gtk.Snapshot. No children -> no manual size-allocate needed.
const ThumbnailArea = GObject.registerClass(
  { GTypeName: 'MuralThumbnailArea' },
  class extends Gtk.Widget {
    texture: Gdk.Texture | null = null;
    mode: Mode = 'zoom';
    renderScale = 1; // monitor-px -> tile-px (from the arrangement); used by 'center'

    setContent(t: Gdk.Texture | null, mode: Mode): void {
      this.texture = t;
      this.mode = mode;
      this.queue_draw();
    }

    setRenderScale(scale: number): void {
      if (scale > 0 && scale !== this.renderScale) {
        this.renderScale = scale;
        this.queue_draw();
      }
    }

    vfunc_snapshot(snapshot: Gtk.Snapshot): void {
      const w = this.get_width();
      const h = this.get_height();
      if (w <= 0 || h <= 0) return;
      const rect = new Graphene.Rect().init(0, 0, w, h);
      const rounded = new Gsk.RoundedRect();
      rounded.init_from_rect(rect, 8);
      snapshot.push_rounded_clip(rounded);
      // Backdrop shows through the letterbox bars for fit/center.
      const bg = new Gdk.RGBA();
      bg.parse('rgba(127,127,127,0.25)');
      snapshot.append_color(bg, rect);
      if (this.texture) {
        snapshot.append_scaled_texture(this.texture, Gsk.ScalingFilter.TRILINEAR, this.destRect(w, h));
      }
      snapshot.pop();
    }

    // Texture destination reproducing the fit-mode. Overflow (zoom/center) is
    // cropped by the rounded clip; gaps (fit/center) reveal the backdrop.
    private destRect(w: number, h: number): Graphene.Rect {
      const tw = this.texture!.get_width();
      const th = this.texture!.get_height();
      let dw: number;
      let dh: number;
      if (this.mode === 'fill') {
        dw = w; // stretch to fill
        dh = h;
      } else if (this.mode === 'center') {
        dw = tw * this.renderScale; // native size at the tile's scale
        dh = th * this.renderScale;
      } else {
        const scale =
          this.mode === 'fit'
            ? Math.min(w / tw, h / th) // contain (letterbox)
            : Math.max(w / tw, h / th); // zoom: cover (crop)
        dw = tw * scale;
        dh = th * scale;
      }
      return new Graphene.Rect().init((w - dw) / 2, (h - dh) / 2, dw, dh);
    }
  },
);

// Composite tile: thumbnail + fit-mode chip. Gtk.Overlay
// positions the chip via halign/valign, so no manual child allocation.
export const MonitorTile = GObject.registerClass(
  { GTypeName: 'MuralMonitorTile' },
  class extends Gtk.Overlay {
    connector: string;
    private cache: ThumbnailCache;
    private area: InstanceType<typeof ThumbnailArea>;
    private chip: Gtk.MenuButton;
    private pickCb: ((c: string) => void) | null = null;
    private modeCb: ((c: string, m: Mode) => void) | null = null;

    constructor(connector: string, label: string, cache: ThumbnailCache) {
      super();
      this.connector = connector;
      this.cache = cache;
      this.set_focusable(true);
      this.set_size_request(120, 80);
      this.update_property([Gtk.AccessibleProperty.LABEL], [label]);

      this.area = new ThumbnailArea();
      this.area.set_hexpand(true);
      this.area.set_vexpand(true);
      this.set_child(this.area);

      // Body click -> pick image.
      const click = new Gtk.GestureClick();
      click.connect('released', () => this.pickCb?.(this.connector));
      this.area.add_controller(click);

      // Fit-mode chip (bottom-left overlay).
      const menu = new Gio.Menu();
      for (const m of MODES) menu.append(LABELS[m], `tile.mode::${m}`);
      this.chip = new Gtk.MenuButton({
        label: LABELS.zoom,
        halign: Gtk.Align.START,
        valign: Gtk.Align.END,
      });
      this.chip.add_css_class('osd');
      this.chip.set_menu_model(menu);
      this.add_overlay(this.chip);

      const group = new Gio.SimpleActionGroup();
      const action = new Gio.SimpleAction({ name: 'mode', parameter_type: GLib.VariantType.new('s') });
      action.connect('activate', (_a, param) => {
        if (param) this.modeCb?.(this.connector, normalizeMode(param.get_string()[0]));
      });
      group.add_action(action);
      this.insert_action_group('tile', group);

    }

    setEntry(file: string | null, mode: Mode): void {
      this.area.setContent(file ? this.cache.texture(file) : null, mode);
      this.chip.set_label(LABELS[mode]);
    }

    /** Monitor-px -> tile-px scale (from the arrangement); used to render 'center' faithfully. */
    setRenderScale(scale: number): void {
      this.area.setRenderScale(scale);
    }

    onPick(cb: (c: string) => void): void { this.pickCb = cb; }
    onMode(cb: (c: string, m: Mode) => void): void { this.modeCb = cb; }
  },
);
export type MonitorTile = InstanceType<typeof MonitorTile>;
