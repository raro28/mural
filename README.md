# Mural

A standalone GTK4 / libadwaita editor for per-monitor wallpapers. Mural shows a to-scale
arrangement of your monitors; pick a wallpaper and a fit-mode per monitor, and it writes
`~/.config/per-monitor-wallpaper/config.json` — the config consumed by the
[`per-monitor-wallpaper`](https://github.com/raro28/per-monitor-wallpaper) GNOME Shell
extension (or any reader of that format).

Mural is not a shell extension; it is an ordinary GTK app that only reads monitor geometry and
writes the config file. App-id `dev.muy.Mural`.

## Status

Design phase. See `SEED.md` for what Mural is and the decisions so far, and
`docs/superpowers/specs/` for the design.
