# STATUS

Task: Menu-bar traffic lights never show their glyphs on hover (bug fix). Size: S.

## Tickets
| Ticket | Title | Status |
|---|---|---|
| T-001 | Menu-bar traffic lights show their glyphs on hover | done |
| T-002 | Finder icon view: no outline/frame around the whole selected cell | done |

## Decisions log
- 2026-10-19 (Tech Lead): Root cause is the missing `reactive`/`track_hover` on the `tpct-window-buttons` box; fix there so the whole group reveals glyphs together (macOS behaviour), rather than per-button hover.
- 2026-10-19 (Tech Lead): Restore glyph = Adwaita `view-restore-symbolic.svg` (two diagonal inward arrows) loaded by path via `Gio.FileIcon`, because WhiteSur (active theme: WhiteSur-light) maps both `window-restore-symbolic` and `view-restore-symbolic` to overlapping-window glyphs. Fallback: themed `window-restore-symbolic`. Alternative rejected: bundling an SVG in the extension (ticket limited to two files; Adwaita is always present with GNOME).
- 2026-10-19 (Tech Lead): Close/minimize keep themed `window-close-symbolic` / `window-minimize-symbolic` (present in WhiteSur, WhiteSur-dark and Adwaita).
- 2026-10-19 (Tech Lead): Glyph centring done with `x_align/y_align: CENTER` + expand on the St.Icon, not CSS (St has no text-align for icons).
- 2026-10-19 (Tech Lead): Acceptance = `gjs -m` fails only with the expected `resource:///org/gnome/shell` ImportError; visual check done by Claude in a headless shell.
- 2026-10-19 (Tech Lead, T-002): Cell frame in Finder icon view = GTK/libadwaita focus ring (`outline` on focused `gridview > child`) and possibly Nautilus `.nautilus-view-cell` shadow; clear `outline`+`box-shadow` in all states (:focus, :focus-visible, :hover, :selected) on both. Also clear the focus ring on Finder list rows (accent fill already marks selection). No `!important` (user-priority CSS already wins). Alternative rejected: global `gridview > child` rule (would change other apps).

## Assumptions
- Adwaita icon theme is installed wherever this extension runs (it is a GNOME Shell dependency).
- Suggest adding `.company/runs/` to `.gitignore` (not part of T-001).
- T-002: macOS Finder shows no keyboard focus indicator around cells; losing GTK's focus ring in Finder views is acceptable.
