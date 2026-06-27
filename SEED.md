# SEED.md — Mural

Authoritative record of what Mural is and what has been decided. **Read this first.**
Holds current truth only — when something changes, rewrite in place (see CLAUDE.md → Document
hygiene).

## What Mural is

A standalone **GTK4 / libadwaita** desktop app (GJS, TypeScript) that edits per-monitor
wallpaper assignments by writing `~/.config/per-monitor-wallpaper/config.json`. It shows a
to-scale arrangement of the connected monitors; you pick a wallpaper and a fit-mode per
monitor, and it writes the config. App-id `dev.muy.Mural`.

Mural is **not** a GNOME Shell extension and never runs inside gnome-shell. It is an ordinary
GTK client: **GDK** for monitor geometry, **Glycin/Gdk** for thumbnail decode, plain file I/O
for the config. It is coupled to nothing but the config **schema** (below).

## Why it exists — the decoupling

The `per-monitor-wallpaper@ekthor` GNOME Shell extension
(github.com/raro28/per-monitor-wallpaper) is the **reader**: it runs inside gnome-shell and
paints each monitor its own wallpaper from the config. Painting per-monitor backgrounds is
irreducibly shell-side, so the reader must stay a shell extension.

The editing GUI, by contrast, only needs GDK + Glycin + file I/O — nothing shell-specific.
Today that GUI is bundled inside the extension as its preferences dialog. Mural extracts it
into an independent app, decoupling the GUI from the extension: separate repo, separate
version, separate package, depending only on the config schema.

**End state:** two repos joined only by `config.json` — the extension (reader, shell-bound)
and Mural (writer, standalone). The extension keeps its bundled prefs for now; removing them
once Mural replaces it is an optional later step, out of scope here.

## The contract — `config.json` (the only coupling)

```json
{ "default": "/path.jpg",
  "monitors": { "DP-1": { "file": "/left.jpg", "mode": "zoom" } } }
```

- Keys are **mutter connector names** (`DP-1`, `HDMI-1`, `eDP-1`). GDK exposes the same
  connector names via `Gdk.Monitor.get_connector()`.
- `mode`: `zoom` (cover/crop, default), `fill` (stretch), `fit` (letterbox), `center`.
- `default` paints any monitor not listed under `monitors`.

Mural is one writer of this file among possibly several (and the user may edit it by hand), so
writes must be **tolerant read-modify-write** — never clobber keys Mural doesn't own.

## Decisions locked

- **Shape:** standalone Adwaita app only. No second extension.
- **v1 scope:** strict parity with today's prefs — to-scale arrangement, per-monitor wallpaper
  pick, fit-mode, WYSIWYG thumbnail. New features (folder browse, presets, shuffle) deferred.
- **Config semantics:** immediate write per change (tolerant RMW) + live-watch to reload on
  external edits. No Save button in v1.
- **Code reuse:** copy `prefs/*` + `lib/*` into Mural; no shared package. The only permanently
  shared modules are `lib/config` + `lib/mode` (the schema + fit-mode contract); `lib/layout`
  and `prefs/*` are Mural-exclusive once the extension is trimmed. **Trigger to revisit:** if
  the shared `config`/`mode` files grow in complexity, extract them into a shared package.
- **App shell:** `Adw.Application` + `Adw.ApplicationWindow` with a `HeaderBar`; `ArrangementView`
  as direct content; "Open Display Settings" in the header; non-resizable. Drop the
  `PreferencesPage`/`Group`/`Row` wrapper (a prefs-API artifact). Only the `ExtensionPreferences`
  base, the `fillPreferencesWindow` entry, and the `PreferencesWindow` type need replacing; the
  rest of `prefs.ts` (store/model/cache wiring, `FileDialog` pick, watchers) ports as-is.
- **Packaging:** ship a **prebuilt** esbuild bundle. The mural repo's CI produces a release
  tarball (`mural.js` + `dev.muy.Mural.desktop` + icon + metainfo + `mural` launcher), mirroring
  the extension's release job. App assets (desktop, icon, metainfo, launcher) live in the mural
  repo and ship in the tarball.
  - Install layout: `/usr/bin/mural` → `exec gjs -m /usr/share/mural/mural.js`; desktop, icon
    (`hicolor/scalable/apps/dev.muy.Mural.svg`), metainfo under standard dirs.
  - `Requires`: `gjs`, `gtk4`, `libadwaita`, glycin loaders, GI typelibs.
- **RPM `.spec` location:** the spec lives in the **rpm-specs repo**
  (`~/Projects/rpm-specs/mural/mural.spec`), built in COPR raro28/wdm on Fedora 44. It consumes
  the release tarball as `Source0`, installs the files, and `%check`s with `desktop-file-validate`
  + `appstreamcli validate`. The spec stays thin; `rpmlint` 0/0 gate.
- **Name:** Mural. Repo + binary `mural`, display name "Mural".
- **App-id / desktop / metainfo:** `dev.muy.Mural` (namespace `dev.muy.*`, domain muy.dev).
- **Host / target:** Fedora 44, GNOME 50.2, GTK 4.22.
- **Distribution:** RPM (`.spec` per the operator's rpm-specs conventions). Flatpak possible
  later, not committed.
- **Visibility:** public repo (github.com/raro28/mural).

## Reusable starting point (from the extension)

The extension's GUI is the seed. Directly portable:
- `src/prefs/*` — `arrangement`, `configStore` (tolerant RMW + directory watch), `monitorModel`
  (already pure GDK: `Gdk.Display.get_default().get_monitors()`), `monitorTile`,
  `thumbnailCache` (Glycin decode + Gdk fallback).
- `src/lib/*` — pure, runtime-agnostic `config`, `layout`, `mode` (node-testable).

Toolchain mirrors the extension: TypeScript + esbuild (ESM, externalize `gi://*`), `@girs`
types.

## Future (desirable, deferred)

- **Edit-then-Save** model (dirty-state + explicit commit) as an alternative to immediate write.
- Wallpaper-folder browse, saved presets, shuffle/random.

## Status

Design phase. The design spec lands in `docs/superpowers/specs/`; the implementation plan in
`docs/superpowers/plans/`.
