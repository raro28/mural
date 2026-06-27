# Claude Code Instructions — Mural

## What Mural is

A standalone **GTK4 / libadwaita** desktop app (GJS, TypeScript) that edits per-monitor
wallpaper assignments by writing `~/.config/per-monitor-wallpaper/config.json`. It shows a
to-scale arrangement of the connected monitors; you pick a wallpaper and a fit-mode per
monitor. App-id `dev.muy.Mural`.

Mural is **not** a GNOME Shell extension and never runs inside gnome-shell. It is an ordinary
GTK client: GDK for monitor geometry, Glycin/Gdk for thumbnails, plain file I/O for the config.
It is coupled to nothing but the config **schema**.

**Read `SEED.md` first** — it is the authoritative record of what Mural is, why it exists, the
full config contract, the decisions locked, and the open design questions.

Target host: **Fedora 44, GNOME 50.2, GTK 4.22**.

## Chat format

These rules bind your replies and any document you write or edit, equally.

- Only hard verified facts. Analytically verify any claim before stating it.
- No assumptions, no hypotheticals. If one is unavoidable, mark it visibly as such.
- Verify against the code and a real run on this host — not prior knowledge or stale docs.
- No silent scope: report what you ran, what passed, and what you skipped.

## Verify, don't assert — applied to this repo

"Verified" means reproduced on this host, not "the build passed".

- GUI behavior requires a **real GTK / Wayland session** — it cannot be verified headless. A
  green type-check / lint / build proves the bundle compiles, nothing more. Verify the app by
  running it on this host and observing.
- Pure logic ported from the extension's `lib/` (geometry, config, mode) is **node-testable** —
  that is the headless-verifiable part. Keep it pure and test it.

## Architecture

A single standalone app, seeded from the extension's GUI:

- Reuse `prefs/*` (`arrangement`, `configStore`, `monitorModel`, `monitorTile`,
  `thumbnailCache`) and the pure `lib/*` (`config`, `layout`, `mode`).
- `monitorModel` already uses `Gdk.Display.get_default().get_monitors()` — pure GDK, no shell
  coupling — so it ports directly.
- Toolchain mirrors the extension: TypeScript + esbuild (ESM, externalize `gi://*`), `@girs`
  types. Concrete build/test/lint scripts are established when the project is scaffolded; do
  not assert commands that do not yet exist.

## Document hygiene

Docs (`SEED.md`, `CLAUDE.md`, README, design notes) hold **current truth or explicitly-marked
WIP only** — never "we said X, now Y" history. When something changes, rewrite in place.
`SEED.md` is the authoritative decisions record; keep it current with reality.

Specs and plans under `docs/superpowers/` **are committed** in this repo.

## Working conventions

- **Operator decides scope.** No "while I'm here" additions — any feature, dependency, or
  refactor beyond the task goes in only when asked. Suggest with rationale + cost; never assume.
- **No embedded scripts:** do not embed one language inside another via heredocs or inline
  strings. Extract logic to a named file and invoke it. Single-line invocations are fine.
- **Propagate fixes:** when fixing a defect, grep the tree for the same pattern. Local
  correctness is not global correctness.
- **Style:** terse and factual in code, comments, and commits. Match the surrounding file's
  brevity and idiom. Keep edits minimal.

## Packaging (RPM)

Mural ships as an RPM. Spec conventions (from the operator's rpm-specs):

- Bump `Release` for a packaging change; bump `Version` only when the app's version changes.
- `%autosetup -p1` when a `PatchN:` is present.
- `%changelog`: escape macros as `%%`; entry header
  `* Day Mon DD YYYY Name <email> - VERSION-RELEASE`.
- `rpmlint` must report **0 errors, 0 warnings**; build in a clean chroot
  (`mock -r fedora-44-x86_64`).
- Ship a `.desktop` (`dev.muy.Mural.desktop`) and AppStream metainfo; validate with
  `desktop-file-validate` and `appstreamcli validate`.

## Environment

An **`rtk` hook** rewrites shell commands. When you need raw, unfiltered output (a valid
applyable diff, exact `ls`/`find` results), run it via `rtk proxy <cmd>`.

## Git

- Commit or push only when explicitly asked.
- Default branch `main`; feature work on `feat/*` branches. Conventional Commits with a scope.
- Post-merge cleanup only for branches you created or were asked to merge: prove the branch tip
  is an ancestor of `main`, then delete with `git branch -d` (safe), never `-D`.
