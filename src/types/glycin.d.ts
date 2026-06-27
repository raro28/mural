// Minimal ambient typings for the Glycin GI modules (no @girs package exists).
// Only the calls this project uses are declared.
declare module 'gi://Gly' {
  import type Gio from 'gi://Gio';
  export class Loader {
    constructor(props: { file: Gio.File });
    load(): Image;
  }
  export class Image {
    next_frame(): Frame;
  }
  export class Frame {}
}

declare module 'gi://GlyGtk4' {
  import type Gdk from 'gi://Gdk';
  import type { Frame } from 'gi://Gly';
  export function frame_get_texture(frame: Frame): Gdk.Texture;
}
