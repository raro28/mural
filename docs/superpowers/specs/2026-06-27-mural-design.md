# Mural — Design

Date: 2026-06-27. Status: approved, pending implementation plan.
Companion: `SEED.md` (decision record + config contract). This doc is the consolidated design.

## 1. Purpose & scope

Mural is a standalone GTK4/libadwaita app (GJS, TypeScript) that writes
`~/.config/per-monitor-wallpaper/config.json`. It shows a to-scale arrangement of the connected
monitors; the user picks a wallpaper and a fit-mode per monitor, and Mural writes the config.

It decouples the editing GUI from the `per-monitor-wallpaper@ekthor` GNOME Shell extension. The
extension stays the reader (painting backgrounds is shell-side and irreducible). Mural becomes
an independent writer, coupled only to the config schema.

**v1 = strict parity** with the extension's current prefs: arrangement, per-monitor wallpaper
pick, fit-mode, WYSIWYG thumbnail, "Open Display Settings", live refresh, non-resizable window.
No new features in v1.

## 2. Architecture

A single GTK app, seeded from the extension's prefs code.

- `Adw.Application` (application-id `dev.muy.Mural`) → one `Adw.ApplicationWindow` with a
  `HeaderBar`; `ArrangementView` as the window's direct content; "Open Display Settings" in the
  header; non-resizable.
- No GNOME Shell coupling: GDK supplies monitor geometry, Glycin/Gdk decode thumbnails, plain
  file I/O reads and writes the config.
- Toolchain mirrors the extension: TypeScript + esbuild (single ESM bundle, `gi://*`
  externalized), `@girs` types, `tsc --noEmit` type-check, `eslint`, `node --test` for pure lib.

## 3. Components (port map)

Copied from the extension (see SEED → Code reuse; copy, no shared package):

| Source (extension) | In Mural | Change |
|---|---|---|
| `lib/config.ts`, `lib/mode.ts` | `lib/` | none — pure; permanently shared contract |
| `lib/layout.ts` | `lib/` | none — Mural-exclusive after extension trim |
| `prefs/arrangement.ts` | `ui/arrangement.ts` | none |
| `prefs/monitorModel.ts` | `ui/monitorModel.ts` | none — already pure GDK |
| `prefs/monitorTile.ts` | `ui/monitorTile.ts` | none |
| `prefs/configStore.ts` | `ui/configStore.ts` | none — tolerant RMW + directory watch |
| `prefs/thumbnailCache.ts` | `ui/thumbnailCache.ts` | none — Glycin decode + Gdk fallback |
| `types/glycin.d.ts` | `types/glycin.d.ts` | none |
| `prefs.ts` | `mural.ts` (entry) | rewrite: drop `ExtensionPreferences`/`fillPreferencesWindow`; add `Adw.Application` + `ApplicationWindow` bootstrap. Store/model/cache wiring, `FileDialog` pick, and the four watchers port verbatim. |

The extension's `prefs/*` widgets live under `src/ui/` in Mural (renamed; no longer
preferences). `src/lib/*` and `src/types/*` keep their names.

New, Mural-only:
- `mural.ts` — `Adw.Application` entry (the rewritten shell).
- `data/dev.muy.Mural.desktop`, `data/dev.muy.Mural.svg` (icon), `data/dev.muy.Mural.metainfo.xml`.
- `bin/mural` launcher (`exec gjs -m /usr/share/mural/mural.js`).

## 4. Data flow & config semantics

- **Read:** `ConfigStore.read()` → `parseConfig` (tolerant). Missing/invalid file → empty config.
- **Write:** immediate on each change (pick, fit-mode), tolerant read-modify-write — never
  clobber keys Mural does not own. No Save button in v1.
- **Live-watch:** `ConfigStore.watch()` reloads on external edits. Because every change is
  written immediately, there are no unsaved edits, so reload is always safe.
- **Geometry:** `MonitorModel` over `Gdk.Display.get_default().get_monitors()`; connector names
  (`get_connector()`) are the mutter names used as config keys. `model.onChanged` rebuilds tiles
  on monitor hotplug/geometry change.
- **Thumbnails:** `ThumbnailCache` (Glycin decode, Gdk fallback, mtime-keyed); renders the
  selected fit-mode WYSIWYG.

## 5. App lifecycle

- `activate`: build the window (singleton — present the existing one on re-activate); wire
  `store`/`model`/`cache`; `rebuildTiles` + `refresh`; connect `store.watch(refresh)`,
  `arrangement notify::width → placeTiles`, `model.onChanged → rebuildAndRefresh`, window
  `notify::is-active → refresh`.
- `close-request`: `store.stop()` + `model.destroy()`.

## 6. Error handling

- Config parse is tolerant; unknown/extra keys preserved on write.
- Thumbnail decode failure → Gdk fallback; never crashes the tile.
- `FileDialog` cancel → ignored.
- "Open Display Settings" shown only when `gnome-control-center` is on `PATH`; launch failure
  logged, non-fatal.

## 7. Testing & verification

- **Headless (CI-gated):** `lib/config`, `lib/layout`, `lib/mode` keep their `*.test.ts`; run
  under `node --test`. `tsc --noEmit` + `eslint` + `build` must pass.
- **GUI:** requires a real GTK/Wayland session; verified by running Mural on this host and
  observing (pick writes config, fit-mode updates thumbnail, hotplug rebuilds tiles, external
  edit reloads). A green build proves only that the bundle compiles.
- CI mirrors the extension: check → lint → test → build on `v*` tags, then the release job.

## 8. Packaging & distribution

- **Build model:** prebuilt bundle. The mural repo's CI runs `esbuild` and attaches a release
  tarball containing `mural.js` + the `data/` assets + the `bin/mural` launcher. No node in
  `mock`.
- **RPM `.spec`:** lives in the **rpm-specs repo** at `mural/mural.spec` (not in this repo),
  built in COPR raro28/wdm on Fedora 44. It consumes the release tarball as `Source0`, installs:
  - `/usr/bin/mural`, `/usr/share/mural/mural.js`,
  - `/usr/share/applications/dev.muy.Mural.desktop`,
  - `/usr/share/icons/hicolor/scalable/apps/dev.muy.Mural.svg`,
  - `/usr/share/metainfo/dev.muy.Mural.metainfo.xml`.
  - `Requires`: `gjs`, `gtk4`, `libadwaita`, glycin loaders, GI typelibs.
  - `%check`: `desktop-file-validate` + `appstreamcli validate`. `rpmlint` 0 errors / 0 warnings.

## 9. Out of scope / future

- Edit-then-Save model (dirty-state + explicit commit).
- Wallpaper-folder browse, saved presets, shuffle/random.
- Removing the extension's bundled prefs once Mural replaces it.
- Flatpak distribution.
