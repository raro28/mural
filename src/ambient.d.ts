// Registers the gi:// module declarations for the standalone GJS runtime.
// Each import is a @girs `*-ambient.d.ts` that does `declare module 'gi://Name'`.
import '@girs/gjs/ambient';
import '@girs/glib-2.0/ambient';
import '@girs/gobject-2.0/ambient';
import '@girs/gio-2.0/ambient';
import '@girs/graphene-1.0/ambient';
import '@girs/gdk-4.0/ambient';
import '@girs/gsk-4.0/ambient';
import '@girs/gtk-4.0/ambient';
import '@girs/adw-1/ambient';
