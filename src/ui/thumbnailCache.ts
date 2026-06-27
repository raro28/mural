import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gly from 'gi://Gly';
import GlyGtk4 from 'gi://GlyGtk4';

// GJS provides console globally; absent from lib ES2022, so declare what we use.
declare const console: { error(...args: unknown[]): void };

export class ThumbnailCache {
  private cache = new Map<string, Gdk.Texture>();

  /** Decode an image to a Gdk.Texture, cached by path + mtime. null on failure. */
  texture(path: string): Gdk.Texture | null {
    const file = Gio.File.new_for_path(path);
    let mtime = 0;
    try {
      const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
      mtime = info.get_attribute_uint64('time::modified');
    } catch {
      return null; // missing/unreadable
    }
    const key = `${path}:${mtime}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const tex = this.decode(file);
    if (tex) this.cache.set(key, tex);
    return tex;
  }

  private decode(file: Gio.File): Gdk.Texture | null {
    // Prefer Glycin (out-of-process decode).
    try {
      const loader = new Gly.Loader({ file });
      const image = loader.load();
      const frame = image.next_frame();
      return GlyGtk4.frame_get_texture(frame);
    } catch (e) {
      console.error(`Mural: Glycin decode failed (${file.get_path()}): ${e}`);
    }
    // Fallback: in-process Gdk decode (acceptable for local user-chosen images).
    try {
      return Gdk.Texture.new_from_filename(file.get_path()!);
    } catch (e) {
      console.error(`Mural: Gdk decode failed (${file.get_path()}): ${e}`);
      return null;
    }
  }
}
