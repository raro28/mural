# Mural Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mural — a standalone GTK4/libadwaita app (GJS, TypeScript) that edits `~/.config/per-monitor-wallpaper/config.json` by porting the `per-monitor-wallpaper` extension's prefs GUI into an independent `Adw.Application`.

**Architecture:** Copy the extension's pure `lib/*` (config, mode, layout) and prefs widgets (`arrangement`, `monitorModel`, `monitorTile`, `configStore`, `thumbnailCache`) into `src/lib/` + `src/ui/`, unchanged except `GTypeName` renames and import re-homing. Rewrite the prefs entry (`prefs.ts`) into a standalone `Adw.Application` + `Adw.ApplicationWindow` shell (`src/mural.ts`). Ship a prebuilt esbuild bundle plus desktop/icon/metainfo assets and a launcher in a release tarball.

**Tech Stack:** TypeScript, esbuild (single ESM bundle, `gi://*` externalized), standalone `@girs/*` type packages, `tsc --noEmit` / `eslint` / `node --test` for the pure lib, GJS runtime (`gjs -m`), GTK 4 / libadwaita 1, Glycin (`gi://Gly` + `gi://GlyGtk4`) for thumbnail decode.

## Global Constraints

These apply to every task; each task's requirements implicitly include this section.

- **Target host:** Fedora 44, GNOME 50.2, GTK 4.22, libadwaita 1. GUI behavior is only "verified" when reproduced on this host — a green build/typecheck proves the bundle compiles, nothing more.
- **App-id / names:** application-id `dev.muy.Mural`; binary `mural`; display name "Mural". Desktop/icon/metainfo basenames are `dev.muy.Mural.*`.
- **v1 = strict parity** with the extension's current prefs. No new features (no folder browse, presets, shuffle, Save button).
- **Code reuse = copy, no shared package.** Ported files are verbatim copies except: (a) `GTypeName` `Pmw*` → `Mural*`; (b) import paths re-homed `prefs/* → ui/*`; (c) log-message prefixes that named the old app become `Mural:`. No behavior changes.
- **Config writes are immediate + tolerant read-modify-write** (never clobber keys Mural does not own). Live-watch reloads on external edits.
- **Public repo, private-writer redaction:** never name the private automated wallpaper-writer script or any `env/...` path in any file or commit. Describe writers generically.
- **Toolchain mirrors the extension:** `type: module`, esbuild ESM with `--external:gi://*`, `tsc --noEmit`, `eslint`, `node --test` for `src/lib/*.test.ts`.
- **Commit messages:** Conventional Commits with a scope. Commit only the files each task creates/edits.

---

## File Structure

Created by this plan (all paths relative to `~/Projects/mural`):

| Path | Responsibility |
|---|---|
| `package.json` | npm metadata + `build`/`check`/`lint`/`test` scripts |
| `tsconfig.json` | strict TS, ESM, `noEmit`, excludes `*.test.ts` |
| `eslint.config.js` | flat eslint config (mirrors extension) |
| `src/ambient.d.ts` | registers `gi://*` module declarations from `@girs/*/ambient` |
| `src/lib/mode.ts` `+ .test.ts` | fit-mode contract (pure) |
| `src/lib/config.ts` `+ .test.ts` | config schema parse/resolve/RMW (pure) |
| `src/lib/layout.ts` `+ .test.ts` | to-scale arrangement geometry (pure) |
| `src/types/glycin.d.ts` | ambient typings for `gi://Gly` + `gi://GlyGtk4` |
| `src/ui/configStore.ts` | tolerant RMW write + config-directory watch |
| `src/ui/thumbnailCache.ts` | Glycin→Gdk decode to `Gdk.Texture`, cached by `path:mtime` |
| `src/ui/monitorModel.ts` | GDK monitor geometry → connectors + `Arrangement` |
| `src/ui/monitorTile.ts` | per-monitor widget: WYSIWYG thumbnail + fit-mode chip |
| `src/ui/arrangement.ts` | `Gtk.Fixed` that places tiles per the arrangement |
| `src/mural.ts` | `Adw.Application` entry: window, wiring, watchers, file pick |
| `data/dev.muy.Mural.desktop` | desktop entry |
| `data/dev.muy.Mural.metainfo.xml` | AppStream metainfo |
| `data/dev.muy.Mural.svg` | scalable app icon |
| `bin/mural` | launcher: `exec gjs -m /usr/share/mural/mural.js` |
| `scripts/package.sh` | assemble the release tarball |
| `.github/workflows/release.yml` | CI: check→lint→test→build→package on `v*` tags |

`.gitignore` already covers `node_modules/`, `dist/`, `.test-build/`, `*.tar.gz` — no change needed.

---

## Task 1: Toolchain scaffolding

Establishes the build/typecheck/lint toolchain and the `gi://` ambient wiring so later tasks have a working `npm run check` / `npm run lint`.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `src/ambient.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `check` (`tsc --noEmit`), `lint` (`eslint src`), `test`, `build`; the `gi://Adw|Gtk|Gdk|Gsk|Graphene|Gio|GLib|GObject` module declarations (resolvable in all `src/**/*.ts`).

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": [],
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.test-build/', 'node_modules/'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        globalThis: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        console: 'readonly',
      },
    },
  },
);
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "mural",
  "version": "1.0.0",
  "description": "Per-monitor wallpaper editor (GTK4/libadwaita)",
  "type": "module",
  "private": true,
  "license": "GPL-3.0-or-later",
  "scripts": {
    "build": "esbuild src/mural.ts --bundle --format=esm --outfile=dist/mural.js '--external:gi://*'",
    "check": "tsc --noEmit",
    "lint": "eslint src",
    "test": "rm -rf .test-build && esbuild src/lib/*.test.ts --bundle --format=esm --platform=node --outdir=.test-build && node --test '.test-build/*.js'"
  }
}
```

- [ ] **Step 4: Install dev dependencies**

Run (this writes resolved versions into `package.json` `devDependencies` — do not hand-pin):

```bash
npm install -D esbuild typescript eslint @eslint/js typescript-eslint \
  @girs/gjs @girs/glib-2.0 @girs/gobject-2.0 @girs/gio-2.0 \
  @girs/graphene-1.0 @girs/gdk-4.0 @girs/gsk-4.0 @girs/gtk-4.0 @girs/adw-1
```

Expected: install completes; `node_modules/@girs/adw-1/adw-1-ambient.d.ts` exists.

- [ ] **Step 5: Create `src/ambient.d.ts`**

Each side-effect import pulls in a `declare module 'gi://Name'` block from the matching `@girs/*/ambient` file, making the unversioned `gi://` imports the ported code uses resolve under `tsc`.

```ts
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
```

- [ ] **Step 6: Verify typecheck and lint pass**

Run: `npm run check && npm run lint`
Expected: both exit 0 with no diagnostics (only `src/ambient.d.ts` is present).

> Note: `src/ambient.d.ts` is exercised cosmetically here; the ambient wiring is fully proven in Task 3, the first task whose modules import `gi://*`. If `npm run check` fails there with "Cannot find module 'gi://…'", the fix is in this file (a missing or misnamed `@girs/*/ambient` import), not in the ported module.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js src/ambient.d.ts
git commit -m "build: scaffold standalone GJS toolchain (esbuild, tsc, eslint, @girs ambient)"
```

---

## Task 2: Port pure lib (mode, config, layout) + tests

These three modules are pure, runtime-agnostic logic with existing node tests. Copy verbatim (no `gi://` imports). This is the headless-verifiable core.

**Files:**
- Create: `src/lib/mode.ts`, `src/lib/mode.test.ts`
- Create: `src/lib/config.ts`, `src/lib/config.test.ts`
- Create: `src/lib/layout.ts`, `src/lib/layout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mode.ts`: `type Mode = 'zoom'|'fill'|'fit'|'center'`; `modeToStyle(mode: string|undefined): number`; `normalizeMode(mode: string|undefined): Mode`.
  - `config.ts`: types `MonitorEntry`, `Config`, `Entry { file: string; mode: Mode }`; `parseConfig(text: string): Config`; `normalizeDefault(cfg: Config): Entry|null`; `entryForConnector(cfg: Config, connector: string): Entry|null`; `setMonitorEntry(cfg: Config, connector: string, file: string, mode: Mode): Config`.
  - `layout.ts`: types `Rect`, `MonitorGeom { connector: string; geometry: Rect }`, `Placed { connector: string; rect: Rect }`, `Arrangement { scale: number; contentH: number; tiles: Placed[] }`; `computeArrangement(monitors: MonitorGeom[], areaW: number, areaH: number): Arrangement`.

- [ ] **Step 1: Create `src/lib/mode.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeToStyle, normalizeMode } from './mode.js';

test('modeToStyle: known modes', () => {
  assert.equal(modeToStyle('zoom'), 5);
  assert.equal(modeToStyle('fill'), 4);
  assert.equal(modeToStyle('fit'), 3);
  assert.equal(modeToStyle('center'), 2);
});
test('modeToStyle: unknown/undefined -> zoom (5)', () => {
  assert.equal(modeToStyle('spanned'), 5);
  assert.equal(modeToStyle('XYZ'), 5);
  assert.equal(modeToStyle(undefined), 5);
});
test('normalizeMode: passthrough known, else zoom', () => {
  assert.equal(normalizeMode('center'), 'center');
  assert.equal(normalizeMode('nope'), 'zoom');
  assert.equal(normalizeMode(undefined), 'zoom');
});
```

- [ ] **Step 2: Verify the test fails (red)**

Run: `npx esbuild src/lib/mode.test.ts --bundle --format=esm --platform=node --outfile=.test-build/mode.test.js`
Expected: FAIL — esbuild error `Could not resolve "./mode.js"`.

- [ ] **Step 3: Create `src/lib/mode.ts`**

```ts
export type Mode = 'zoom' | 'fill' | 'fit' | 'center';

// mode -> GDesktopBackgroundStyle value (verified on host: ZOOM 5, STRETCHED 4,
// SCALED 3, CENTERED 2).
const STYLE: Record<Mode, number> = { zoom: 5, fill: 4, fit: 3, center: 2 };

/** Background-style value for a mode string; unknown/undefined -> zoom (5). */
export function modeToStyle(mode: string | undefined): number {
  return STYLE[mode as Mode] ?? STYLE.zoom;
}

/** A valid Mode for a string; unknown/undefined -> 'zoom'. */
export function normalizeMode(mode: string | undefined): Mode {
  return mode !== undefined && mode in STYLE ? (mode as Mode) : 'zoom';
}
```

- [ ] **Step 4: Verify the test passes (green)**

Run: `npm test`
Expected: PASS — mode tests pass (3 tests).

- [ ] **Step 5: Create `src/lib/config.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseConfig, normalizeDefault, entryForConnector,
  setMonitorEntry,
} from './config.js';

test('parseConfig: valid object', () => {
  assert.deepEqual(parseConfig('{"default":"/a.jpg"}'), { default: '/a.jpg' });
});
test('parseConfig: invalid JSON -> {}', () => {
  assert.deepEqual(parseConfig('not json'), {});
});
test('parseConfig: non-object JSON -> {}', () => {
  assert.deepEqual(parseConfig('[1,2]'), {});
  assert.deepEqual(parseConfig('"x"'), {});
  assert.deepEqual(parseConfig('null'), {});
});
test('normalizeDefault: bare string -> mode zoom', () => {
  assert.deepEqual(normalizeDefault({ default: '/d.jpg' }), { file: '/d.jpg', mode: 'zoom' });
});
test('normalizeDefault: object with/without mode', () => {
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg', mode: 'fit' } }), { file: '/d.jpg', mode: 'fit' });
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg' } }), { file: '/d.jpg', mode: 'zoom' });
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg', mode: 'bogus' } }), { file: '/d.jpg', mode: 'zoom' });
});
test('normalizeDefault: missing/invalid -> null', () => {
  assert.equal(normalizeDefault({}), null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(normalizeDefault({ default: { mode: 'fit' } as any }), null);
});
test('entryForConnector: explicit entry, mode normalized', () => {
  const c = { monitors: { 'DP-1': { file: '/a.jpg', mode: 'center' } } };
  assert.deepEqual(entryForConnector(c, 'DP-1'), { file: '/a.jpg', mode: 'center' });
  assert.deepEqual(entryForConnector({ monitors: { 'DP-1': { file: '/a.jpg' } } }, 'DP-1'), { file: '/a.jpg', mode: 'zoom' });
});
test('entryForConnector: no entry/file -> null', () => {
  assert.equal(entryForConnector({}, 'DP-1'), null);
  assert.equal(entryForConnector({ monitors: { 'DP-1': {} } }, 'DP-1'), null);
});
test('setMonitorEntry: adds without dropping other keys', () => {
  const c = { monitors: { 'HDMI-1': { file: '/b.jpg', mode: 'zoom' } }, default: '/d.jpg' };
  const out = setMonitorEntry(c, 'DP-1', '/a.jpg', 'fit');
  assert.deepEqual(out.monitors!['DP-1'], { file: '/a.jpg', mode: 'fit' });
  assert.deepEqual(out.monitors!['HDMI-1'], { file: '/b.jpg', mode: 'zoom' }); // preserved
  assert.equal(out.default, '/d.jpg'); // preserved
  assert.notEqual(out, c); // new object (no mutation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal((c.monitors as any)['DP-1'], undefined); // input untouched
});
test('entryForConnector: empty-string file -> null', () => {
  assert.equal(entryForConnector({ monitors: { 'DP-1': { file: '', mode: 'fit' } } }, 'DP-1'), null);
});
test('normalizeDefault: empty-string file -> null', () => {
  assert.equal(normalizeDefault({ default: '' }), null);
  assert.equal(normalizeDefault({ default: { file: '', mode: 'fit' } }), null);
});
```

- [ ] **Step 6: Verify the test fails (red)**

Run: `npx esbuild src/lib/config.test.ts --bundle --format=esm --platform=node --outfile=.test-build/config.test.js`
Expected: FAIL — esbuild error `Could not resolve "./config.js"`.

- [ ] **Step 7: Create `src/lib/config.ts`**

```ts
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
```

- [ ] **Step 8: Verify the tests pass (green)**

Run: `npm test`
Expected: PASS — mode + config tests pass.

- [ ] **Step 9: Create `src/lib/layout.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArrangement } from './layout.js';

test('empty -> scale 1, no tiles, zero contentH', () => {
  assert.deepEqual(computeArrangement([], 100, 100), { scale: 1, contentH: 0, tiles: [] });
});

test('single monitor: scaled to width, horizontally centered, top-aligned, contentH = scaled height', () => {
  const a = computeArrangement([{ connector: 'DP-1', geometry: { x: 0, y: 0, width: 200, height: 100 } }], 100, 100);
  // bbox 200x100, area 100x100 -> scale = min(100/200, 100/100) = 0.5
  assert.equal(a.scale, 0.5);
  assert.equal(a.contentH, 50); // 100 * 0.5; the view shrinks to this
  const t = a.tiles[0].rect;
  assert.equal(t.width, 100);
  assert.equal(t.height, 50);
  // x offset (100-100)/2=0; top-aligned -> y=0 (no vertical centering)
  assert.equal(t.x, 0);
  assert.equal(t.y, 0);
});

test('two monitors with negative origin normalized and scaled together', () => {
  const a = computeArrangement([
    { connector: 'DP-1', geometry: { x: -100, y: 0, width: 100, height: 100 } },
    { connector: 'HDMI-1', geometry: { x: 0, y: 0, width: 100, height: 200 } },
  ], 200, 200);
  // bbox: x[-100..100]=200 wide, y[0..200]=200 tall -> scale=min(200/200,200/200)=1
  assert.equal(a.scale, 1);
  const dp = a.tiles.find(t => t.connector === 'DP-1')!.rect;
  const hdmi = a.tiles.find(t => t.connector === 'HDMI-1')!.rect;
  // normalized: DP at x 0, HDMI at x 100; bbox 200x200 fits exactly -> no centering offset
  assert.deepEqual(dp, { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(hdmi, { x: 100, y: 0, width: 100, height: 200 });
});

test('rotated (portrait) tile keeps its given geometry', () => {
  // rotation is already reflected in the geometry passed in (tall = portrait)
  const a = computeArrangement([{ connector: 'HDMI-1', geometry: { x: 0, y: 0, width: 100, height: 200 } }], 200, 200);
  assert.equal(a.scale, 1);
  assert.deepEqual(a.tiles[0].rect, { x: 50, y: 0, width: 100, height: 200 }); // centered horizontally
});
```

- [ ] **Step 10: Verify the test fails (red)**

Run: `npx esbuild src/lib/layout.test.ts --bundle --format=esm --platform=node --outfile=.test-build/layout.test.js`
Expected: FAIL — esbuild error `Could not resolve "./layout.js"`.

- [ ] **Step 11: Create `src/lib/layout.ts`**

```ts
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorGeom {
  connector: string;
  geometry: Rect;
}

export interface Placed {
  connector: string;
  rect: Rect;
}

export interface Arrangement {
  scale: number;
  contentH: number; // scaled height of the arrangement; the view shrinks to this
  tiles: Placed[];
}

/**
 * Map real monitor geometries into an areaW x areaH box: translate so the
 * bounding box starts at origin, scale uniformly to fit, center horizontally,
 * and top-align vertically (the view is sized to `contentH`, so there is no
 * vertical slack to center within).
 */
export function computeArrangement(monitors: MonitorGeom[], areaW: number, areaH: number): Arrangement {
  if (monitors.length === 0) return { scale: 1, contentH: 0, tiles: [] };

  const minX = Math.min(...monitors.map((m) => m.geometry.x));
  const minY = Math.min(...monitors.map((m) => m.geometry.y));
  const maxX = Math.max(...monitors.map((m) => m.geometry.x + m.geometry.width));
  const maxY = Math.max(...monitors.map((m) => m.geometry.y + m.geometry.height));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  const scale = Math.min(areaW / bboxW, areaH / bboxH);
  const offsetX = (areaW - bboxW * scale) / 2;
  const contentH = bboxH * scale;

  const tiles = monitors.map((m) => ({
    connector: m.connector,
    rect: {
      x: offsetX + (m.geometry.x - minX) * scale,
      y: (m.geometry.y - minY) * scale,
      width: m.geometry.width * scale,
      height: m.geometry.height * scale,
    },
  }));

  return { scale, contentH, tiles };
}
```

- [ ] **Step 12: Verify all lib tests pass and typecheck is clean (green)**

Run: `npm test && npm run check && npm run lint`
Expected: all PASS — mode + config + layout tests (16 tests total) pass; tsc and eslint clean.

- [ ] **Step 13: Commit**

```bash
git add src/lib/
git commit -m "feat(lib): port pure config/mode/layout modules with tests"
```

---

## Task 3: Port the data layer (glycin types, configStore, thumbnailCache, monitorModel)

Non-widget GI modules. Verbatim copies except: import paths already resolve as-is (`../lib/...` from `src/ui/` mirrors `../lib/...` from `src/prefs/`); log-message prefixes change to `Mural:`. Not node-testable — gated by `tsc` + `eslint`; behavior verified in Task 5 via the running app. **This task is the first to import `gi://*`, so it proves the Task 1 ambient wiring.**

**Files:**
- Create: `src/types/glycin.d.ts`
- Create: `src/ui/configStore.ts`
- Create: `src/ui/thumbnailCache.ts`
- Create: `src/ui/monitorModel.ts`

**Interfaces:**
- Consumes: `src/lib/config.ts` (`parseConfig`, `setMonitorEntry`, `Config`); `src/lib/mode.ts` (`Mode`); `src/lib/layout.ts` (`computeArrangement`, `Arrangement`, `MonitorGeom`).
- Produces:
  - `glycin.d.ts`: ambient `gi://Gly` (`Loader`, `Image`, `Frame`) + `gi://GlyGtk4` (`frame_get_texture(frame): Gdk.Texture`).
  - `ConfigStore`: `read(): Config`; `setMonitor(connector: string, file: string, mode: Mode): void`; `watch(onChange: () => void): void`; `stop(): void`.
  - `ThumbnailCache`: `texture(path: string): Gdk.Texture | null`.
  - `MonitorModel`: `connectors(): { connector: string; label: string }[]`; `arrange(areaW: number, areaH: number): Arrangement`; `onChanged(cb: () => void): void`; `destroy(): void`.

- [ ] **Step 1: Create `src/types/glycin.d.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/ui/configStore.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/ui/thumbnailCache.ts`**

Verbatim copy except the two `console.error` prefixes change from `per-monitor-wallpaper prefs:` to `Mural:`.

```ts
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
```

- [ ] **Step 4: Create `src/ui/monitorModel.ts`**

```ts
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
```

- [ ] **Step 5: Verify typecheck and lint pass**

Run: `npm run check && npm run lint`
Expected: both exit 0. (If `tsc` reports `Cannot find module 'gi://…'`, fix `src/ambient.d.ts` per Task 1.)

- [ ] **Step 6: Commit**

```bash
git add src/types/glycin.d.ts src/ui/configStore.ts src/ui/thumbnailCache.ts src/ui/monitorModel.ts
git commit -m "feat(ui): port config store, thumbnail cache, monitor model"
```

---

## Task 4: Port the widgets (monitorTile, arrangement)

GObject widgets. Verbatim copies except `GTypeName` `Pmw*` → `Mural*` (`PmwThumbnailArea`→`MuralThumbnailArea`, `PmwMonitorTile`→`MuralMonitorTile`, `PmwArrangementView`→`MuralArrangementView`). Gated by `tsc` + `eslint`; rendered behavior verified in Task 5.

**Files:**
- Create: `src/ui/monitorTile.ts`
- Create: `src/ui/arrangement.ts`

**Interfaces:**
- Consumes: `src/lib/mode.ts` (`normalizeMode`, `Mode`); `src/ui/thumbnailCache.ts` (`ThumbnailCache`); `src/lib/layout.ts` (`Arrangement`).
- Produces:
  - `MonitorTile` (a `Gtk.Overlay` subclass) with constructor `(connector: string, label: string, cache: ThumbnailCache)` and methods `setEntry(file: string | null, mode: Mode): void`; `setRenderScale(scale: number): void`; `onPick(cb: (c: string) => void): void`; `onMode(cb: (c: string, m: Mode) => void): void`; public field `connector: string`. Type export `MonitorTile = InstanceType<typeof MonitorTile>`.
  - `ArrangementView` (a `Gtk.Fixed` subclass) with `render(arrangement: Arrangement, tiles: Map<string, MonitorTile>): void`. Type export `ArrangementView = InstanceType<typeof ArrangementView>`.

- [ ] **Step 1: Create `src/ui/monitorTile.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/ui/arrangement.ts`**

```ts
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import type { Arrangement } from '../lib/layout.js';
import type { MonitorTile } from './monitorTile.js';

export const ArrangementView = GObject.registerClass(
  { GTypeName: 'MuralArrangementView' },
  class extends Gtk.Fixed {
    constructor() {
      super();
      this.set_hexpand(true);
      // Height is set to the arrangement's content height in render() (shrink-to-fit).
    }

    render(arrangement: Arrangement, tiles: Map<string, MonitorTile>): void {
      const wanted = new Set<MonitorTile>();
      for (const placed of arrangement.tiles) {
        const tile = tiles.get(placed.connector);
        if (!tile) continue;
        wanted.add(tile);
        const x = placed.rect.x;
        const y = placed.rect.y;
        tile.set_size_request(
          Math.max(1, Math.round(placed.rect.width)),
          Math.max(1, Math.round(placed.rect.height)),
        );
        tile.setRenderScale(arrangement.scale); // for faithful 'center' thumbnail rendering
        if (tile.get_parent() === this) this.move(tile, x, y);
        else this.put(tile, x, y);
      }
      // Remove only children that are no longer wanted (e.g. after a monitor rebuild).
      let child = this.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        if (!(wanted as Set<unknown>).has(child)) this.remove(child);
        child = next;
      }
      // Shrink the view to the arrangement's content height (no empty space below).
      this.set_size_request(-1, Math.max(1, Math.ceil(arrangement.contentH)));
    }
  },
);
export type ArrangementView = InstanceType<typeof ArrangementView>;
```

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npm run check && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/ui/monitorTile.ts src/ui/arrangement.ts
git commit -m "feat(ui): port monitor tile and arrangement widgets"
```

---

## Task 5: Write the app entry (`src/mural.ts`) and verify on host

Rewrite of the extension's `prefs.ts`: drop `ExtensionPreferences`/`fillPreferencesWindow`/`Adw.PreferencesWindow`; add an `Adw.Application` + `Adw.ApplicationWindow`. The store/model/cache wiring, the `FileDialog` pick, and the four watchers + `close-request` move in with their logic intact. The `PreferencesPage`/`Group`/`Row` wrapper is dropped; the header button moves into an `Adw.HeaderBar` hosted by an `Adw.ToolbarView` whose content is the `ArrangementView`. This task completes the bundle, so `npm run build` runs here; then the GUI is verified on the host.

**Files:**
- Create: `src/mural.ts`

**Interfaces:**
- Consumes: `src/lib/config.ts` (`entryForConnector`, `normalizeDefault`); `src/lib/mode.ts` (`Mode`); `src/ui/configStore.ts` (`ConfigStore`); `src/ui/monitorModel.ts` (`MonitorModel`); `src/ui/thumbnailCache.ts` (`ThumbnailCache`); `src/ui/monitorTile.ts` (`MonitorTile`); `src/ui/arrangement.ts` (`ArrangementView`).
- Produces: the bundled entry `dist/mural.js` (the runnable app).

- [ ] **Step 1: Create `src/mural.ts`**

```ts
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { entryForConnector, normalizeDefault } from './lib/config.js';
import type { Mode } from './lib/mode.js';
import { ConfigStore } from './ui/configStore.js';
import { MonitorModel } from './ui/monitorModel.js';
import { ThumbnailCache } from './ui/thumbnailCache.js';
import { MonitorTile } from './ui/monitorTile.js';
import { ArrangementView } from './ui/arrangement.js';

// GJS provides console globally; absent from lib ES2022, so declare what we use.
declare const console: { error(...args: unknown[]): void };

/* eslint-disable @typescript-eslint/no-explicit-any */

function currentMode(store: ConfigStore, connector: string): Mode {
  return entryForConnector(store.read(), connector)?.mode ?? 'zoom';
}

function pick(parent: Gtk.Window, onChosen: (file: string) => void): void {
  const dialog = new Gtk.FileDialog({ title: 'Choose an image' });
  const filter = new Gtk.FileFilter();
  filter.add_mime_type('image/*');
  filter.set_name('Images');
  const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
  filters.append(filter);
  dialog.set_filters(filters);
  dialog.open(parent, null, (_d: any, res: any) => {
    try {
      const file = dialog.open_finish(res);
      const path = file?.get_path();
      if (path) onChosen(path);
    } catch {
      /* user cancelled */
    }
  });
}

function buildWindow(app: Adw.Application): Adw.ApplicationWindow {
  const store = new ConfigStore();
  const model = new MonitorModel();
  const cache = new ThumbnailCache();

  const window = new Adw.ApplicationWindow({
    application: app,
    title: 'Mural',
    resizable: false,
    default_width: 600,
  });

  const header = new Adw.HeaderBar();
  // Open Display Settings (only if gnome-control-center is present).
  if (GLib.find_program_in_path('gnome-control-center')) {
    const btn = new Gtk.Button({ label: 'Open Display Settings' });
    btn.add_css_class('flat');
    btn.connect('clicked', () => {
      try {
        Gio.Subprocess.new(['gnome-control-center', 'display'], Gio.SubprocessFlags.NONE);
      } catch (e) {
        console.error(`Mural: launch display settings failed: ${e}`);
      }
    });
    header.pack_start(btn);
  }

  const arrangement = new ArrangementView();
  const toolbar = new Adw.ToolbarView();
  toolbar.add_top_bar(header);
  toolbar.set_content(arrangement);
  window.set_content(toolbar);

  const tiles = new Map<string, MonitorTile>();

  const rebuildTiles = (): void => {
    tiles.clear();
    for (const { connector, label } of model.connectors()) {
      const tile = new MonitorTile(connector, label, cache);
      tile.onPick((c) => pick(window, (file) => { store.setMonitor(c, file, currentMode(store, c)); }));
      tile.onMode((c, m) => {
        const cfg = store.read();
        const file = entryForConnector(cfg, c)?.file ?? normalizeDefault(cfg)?.file;
        if (!file) return; // nothing to attach a mode to yet
        store.setMonitor(c, file, m);
      });
      tiles.set(connector, tile);
    }
  };

  const placeTiles = (): void => {
    const w = arrangement.get_width() || 560; // 0 before first allocation -> fallback
    // Fit to width; cap the height so a tall (portrait) arrangement stays reasonable.
    arrangement.render(model.arrange(w, 280), tiles);
  };

  const refresh = (): void => {
    const cfg = store.read();
    const def = normalizeDefault(cfg);
    for (const [connector, tile] of tiles) {
      const e = entryForConnector(cfg, connector);
      if (e) tile.setEntry(e.file, e.mode);
      else tile.setEntry(def?.file ?? null, def?.mode ?? 'zoom');
    }
    placeTiles();
  };

  const rebuildAndRefresh = (): void => { rebuildTiles(); refresh(); };
  rebuildAndRefresh();

  store.watch(refresh);
  arrangement.connect('notify::width', () => placeTiles());
  model.onChanged(rebuildAndRefresh);
  window.connect('notify::is-active', () => { if (window.is_active) refresh(); });
  window.connect('close-request', () => { store.stop(); model.destroy(); return false; });

  return window;
}

const app = new Adw.Application({
  application_id: 'dev.muy.Mural',
  flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
});

let window: Adw.ApplicationWindow | null = null;
app.connect('activate', () => {
  if (!window) window = buildWindow(app);
  window.present();
});

app.run([]);
```

- [ ] **Step 2: Verify typecheck, lint, and build pass**

Run: `npm run check && npm run lint && npm run build`
Expected: all exit 0; `dist/mural.js` is produced.

- [ ] **Step 3: Run the app on this host (GUI verification)**

Run: `gjs -m dist/mural.js`
Expected: a non-resizable "Mural" window opens with a header bar; the connected monitors appear as a to-scale arrangement of tiles, each with a fit-mode chip (bottom-left) showing the current mode. ("Open Display Settings" appears only if `gnome-control-center` is on `PATH`.)

> If the window fails to launch with a `gi://` version or typelib error, the GTK/Adw/Glycin typelibs must be present on the host; resolve before proceeding (see Global Constraints — verification is on-host).

- [ ] **Step 4: Verify the parity behaviors by observation**

With the app running, confirm each:
- Click a monitor tile → file chooser opens (image filter); pick an image → tile thumbnail updates and `~/.config/per-monitor-wallpaper/config.json` gains `monitors.<connector>.file`.
- Change a tile's fit-mode via the chip → thumbnail re-renders (zoom=cover, fill=stretch, fit=letterbox, center=native) and the config `mode` updates.
- Edit `config.json` externally (e.g. change a path) → the open window reloads the change (live-watch).
- Confirm a pre-existing unrelated key in `config.json` (e.g. `default`, or a connector Mural is not showing) survives a write (tolerant RMW).

Run (inspect the written config): `cat ~/.config/per-monitor-wallpaper/config.json`
Expected: shows the edited `monitors.<connector>` entry; any unrelated keys preserved.

- [ ] **Step 5: Commit**

```bash
git add src/mural.ts
git commit -m "feat: add Adw.Application entry (standalone Mural shell)"
```

---

## Task 6: App assets (desktop, metainfo, icon, launcher)

Ship-required files. Validated with `desktop-file-validate` and `appstreamcli validate` on the host.

**Files:**
- Create: `data/dev.muy.Mural.desktop`
- Create: `data/dev.muy.Mural.metainfo.xml`
- Create: `data/dev.muy.Mural.svg`
- Create: `bin/mural`

**Interfaces:**
- Consumes: nothing (static assets).
- Produces: the desktop entry, AppStream metainfo, scalable icon, and launcher consumed by Task 7's tarball and the out-of-repo RPM `.spec`.

- [ ] **Step 1: Create `data/dev.muy.Mural.desktop`**

```ini
[Desktop Entry]
Type=Application
Name=Mural
Comment=Set a wallpaper per monitor
Exec=mural
Icon=dev.muy.Mural
Terminal=false
Categories=Utility;GTK;
StartupNotify=true
Keywords=wallpaper;monitor;display;background;
```

- [ ] **Step 2: Create `data/dev.muy.Mural.metainfo.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>dev.muy.Mural</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-later</project_license>
  <name>Mural</name>
  <summary>Set a wallpaper per monitor</summary>
  <description>
    <p>
      Mural assigns a wallpaper and fit mode to each connected monitor. It shows a
      to-scale arrangement of your displays; pick an image per monitor and choose how it
      fits (zoom, fill, fit, or center). Changes are written immediately.
    </p>
  </description>
  <launchable type="desktop-id">dev.muy.Mural.desktop</launchable>
  <developer id="dev.muy">
    <name>Mural</name>
  </developer>
  <url type="homepage">https://github.com/raro28/mural</url>
  <url type="bugtracker">https://github.com/raro28/mural/issues</url>
  <content_rating type="oars-1.1"/>
  <releases>
    <release version="1.0.0" date="2026-06-27">
      <description>
        <p>Initial release.</p>
      </description>
    </release>
  </releases>
</component>
```

- [ ] **Step 3: Create `data/dev.muy.Mural.svg`**

A minimal valid scalable icon (framed-image / mural motif).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect x="16" y="24" width="96" height="72" rx="8" fill="#3584e4"/>
  <rect x="24" y="32" width="80" height="56" rx="4" fill="#99c1f1"/>
  <circle cx="44" cy="52" r="8" fill="#f9f06b"/>
  <path d="M24 88 L52 64 L72 80 L92 56 L104 68 L104 88 Z" fill="#2ec27e"/>
  <rect x="52" y="96" width="24" height="8" rx="2" fill="#3584e4"/>
  <rect x="40" y="104" width="48" height="6" rx="3" fill="#1c71d8"/>
</svg>
```

- [ ] **Step 4: Create `bin/mural`**

```sh
#!/bin/sh
exec gjs -m /usr/share/mural/mural.js "$@"
```

- [ ] **Step 5: Make the launcher executable**

Run: `chmod +x bin/mural`
Expected: `bin/mural` is executable.

- [ ] **Step 6: Validate the desktop entry and metainfo on host**

Run: `desktop-file-validate data/dev.muy.Mural.desktop && appstreamcli validate data/dev.muy.Mural.metainfo.xml`
Expected: `desktop-file-validate` prints nothing (exit 0); `appstreamcli validate` reports `Validation was successful` (0 errors). If `appstreamcli`/`desktop-file-validate` are absent, install `appstream` / `desktop-file-utils` first (on-host requirement).

- [ ] **Step 7: Commit**

```bash
git add data/dev.muy.Mural.desktop data/dev.muy.Mural.metainfo.xml data/dev.muy.Mural.svg bin/mural
git commit -m "feat(packaging): add desktop entry, metainfo, icon, launcher"
```

---

## Task 7: Release packaging (tarball script + CI)

The mural repo's CI produces the prebuilt release tarball (the RPM `.spec` lives in the rpm-specs repo and consumes this tarball). Packaging logic is extracted to a script (no embedded multi-line shell in YAML, per house rules).

**Files:**
- Create: `scripts/package.sh`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `dist/mural.js` (from `npm run build`); `data/*`; `bin/mural`.
- Produces: `mural-<version>.tar.gz` containing `mural.js`, `data/`, `bin/`, and `README.md`.

- [ ] **Step 1: Create `scripts/package.sh`**

```sh
#!/bin/sh
set -eu
VERSION="${1:?usage: package.sh VERSION}"
STAGE="mural-${VERSION}"

rm -rf "$STAGE"
mkdir -p "$STAGE/data" "$STAGE/bin"
cp dist/mural.js "$STAGE/"
cp data/dev.muy.Mural.desktop data/dev.muy.Mural.metainfo.xml data/dev.muy.Mural.svg "$STAGE/data/"
cp bin/mural "$STAGE/bin/"
cp README.md "$STAGE/"

tar czf "${STAGE}.tar.gz" "$STAGE"
rm -rf "$STAGE"
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x scripts/package.sh`
Expected: `scripts/package.sh` is executable.

- [ ] **Step 3: Verify the script assembles a correct tarball locally**

Run: `npm run build && ./scripts/package.sh 1.0.0 && tar tzf mural-1.0.0.tar.gz`
Expected: build succeeds; tarball lists `mural-1.0.0/mural.js`, `mural-1.0.0/data/dev.muy.Mural.desktop`, `mural-1.0.0/data/dev.muy.Mural.metainfo.xml`, `mural-1.0.0/data/dev.muy.Mural.svg`, `mural-1.0.0/bin/mural`, `mural-1.0.0/README.md`.

- [ ] **Step 4: Clean up the local test artifact**

Run: `rm -f mural-1.0.0.tar.gz`
Expected: artifact removed (it is git-ignored regardless via `*.tar.gz`).

- [ ] **Step 5: Create `.github/workflows/release.yml`**

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - name: Package
        run: ./scripts/package.sh "${GITHUB_REF_NAME#v}"
      - uses: softprops/action-gh-release@v2
        with:
          files: mural-*.tar.gz
```

- [ ] **Step 6: Commit**

```bash
git add scripts/package.sh .github/workflows/release.yml
git commit -m "ci: add release packaging script and workflow"
```

---

## Self-Review (against the design spec)

**Spec coverage** (design §§1–8, SEED decisions):
- §2 architecture — `Adw.Application`/`Adw.ApplicationWindow` + `HeaderBar` + non-resizable: Task 5. Toolchain (TS, esbuild ESM `gi://*` external, `@girs`, tsc/eslint/node --test): Tasks 1–2.
- §3 port map — `lib/config|mode|layout`: Task 2; `glycin.d.ts`, `configStore`, `thumbnailCache`, `monitorModel`: Task 3; `monitorTile`, `arrangement`: Task 4; `prefs.ts → mural.ts`: Task 5; `data/*` + `bin/mural`: Task 6. `Pmw* → Mural*` renames: Task 4. `ui/` re-homing: Tasks 3–4.
- §4 data flow — tolerant read, immediate tolerant-RMW write, live-watch, GDK geometry, WYSIWYG fit-mode in `MonitorTile`: Tasks 3–5 (verified §4 behaviors in Task 5 Step 4).
- §5 lifecycle — `activate` singleton/present, store/model/cache wiring, `rebuildTiles`+`refresh`, four watchers, `close-request` cleanup: Task 5.
- §6 error handling — tolerant parse, decode fallback, FileDialog cancel ignored, gnome-control-center gated launch: present in ported code (Tasks 3,4) and entry (Task 5).
- §7 testing — `lib/*.test.ts` under `node --test`, `tsc`/`eslint`/`build` gates: Tasks 1–5; GUI on-host verification: Task 5 Steps 3–4.
- §8 packaging — prebuilt bundle, tarball contents, CI check→lint→test→build→package on `v*`: Task 7; desktop/metainfo/icon/launcher + validators: Task 6. (The RPM `.spec` is out-of-repo, per SEED — correctly not a task here.)

**Placeholder scan:** No `TBD`/`add error handling`/`similar to`/code-free code steps — every code step contains full file content; every run step states the exact command and expected result. The one flagged uncertainty (the `@girs` ambient wiring) is grounded in inspected package files and gated by `tsc` at Tasks 1 and 3, with the concrete fix location named — not left open.

**Type consistency:** Method/field names used across tasks match their producing task: `ConfigStore.read/setMonitor/watch/stop`, `ThumbnailCache.texture`, `MonitorModel.connectors/arrange/onChanged/destroy`, `MonitorTile.setEntry/setRenderScale/onPick/onMode/connector`, `ArrangementView.render`, `computeArrangement`/`Arrangement`/`MonitorGeom`, `entryForConnector`/`normalizeDefault`/`parseConfig`/`setMonitorEntry`/`Mode` — all consistent between the Interfaces blocks and the call sites in Task 5.

**Open item (forward-looking, not a blocker):** `package.json` `version` and the metainfo `<release>` are set to `1.0.0` / `2026-06-27`; adjust if the operator wants a different first-release version.
