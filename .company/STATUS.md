# STATUS

Task: Menu-bar traffic lights never show their glyphs on hover (bug fix). Size: S.

## Tickets
| Ticket | Title | Status |
|---|---|---|
| T-001 | Menu-bar traffic lights show their glyphs on hover | done |

## Decisions log
- 2026-10-19 (Tech Lead): Root cause is the missing `reactive`/`track_hover` on the `tpct-window-buttons` box; fix there so the whole group reveals glyphs together (macOS behaviour), rather than per-button hover.
- 2026-10-19 (Tech Lead): Restore glyph = Adwaita `view-restore-symbolic.svg` (two diagonal inward arrows) loaded by path via `Gio.FileIcon`, because WhiteSur (active theme: WhiteSur-light) maps both `window-restore-symbolic` and `view-restore-symbolic` to overlapping-window glyphs. Fallback: themed `window-restore-symbolic`. Alternative rejected: bundling an SVG in the extension (ticket limited to two files; Adwaita is always present with GNOME).
- 2026-10-19 (Tech Lead): Close/minimize keep themed `window-close-symbolic` / `window-minimize-symbolic` (present in WhiteSur, WhiteSur-dark and Adwaita).
- 2026-10-19 (Tech Lead): Glyph centring done with `x_align/y_align: CENTER` + expand on the St.Icon, not CSS (St has no text-align for icons).
- 2026-10-19 (Tech Lead): Acceptance = `gjs -m` fails only with the expected `resource:///org/gnome/shell` ImportError; visual check done by Claude in a headless shell.

## Assumptions
- Adwaita icon theme is installed wherever this extension runs (it is a GNOME Shell dependency).
- Suggest adding `.company/runs/` to `.gitignore` (not part of T-001).
