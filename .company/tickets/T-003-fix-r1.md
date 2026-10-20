# T-003 fix round 1 — column header title text size

Context: T-003 (`.company/tickets/T-003-flat-column-headers.md`) made ColumnView headers flat. Review `.company/reviews/T-003-r1.md` returned CHANGES_REQUESTED with one blocking issue.

## Blocking issue (verbatim from review)
The header text renders at about 9.8px, bold, and very faint, where the ticket asks for 12px, medium weight, dim.
- Cause: libadwaita styles the title box *inside* the header button, not the button itself: `columnview > header > button > box { font-weight: 700; font-size: 82%; color: color-mix(in srgb, currentColor 40%, transparent); }` (+ `:hover > box`, `:active > box` variants). Our rules only style the button.

## Change
In `src/gtk4/_widgets.scss`, at the end of the T-003 column-header block (after the `:disabled` header rule), add:

```scss
// libadwaita styles the inner title box (82% size, bold, 40% colour); reset it to the button's values.
columnview > header > button > box,
columnview > header > button:hover > box,
columnview > header > button:active > box,
columnview > header > button:checked > box,
columnview > header > button:disabled > box,
columnview > header > button:backdrop > box {
  font-size: 12px;
  font-weight: 500;
  color: inherit;
}
```
Do not touch `sort-indicator`. No other files.

## Acceptance (fast round)
- `./build.sh` exits 0.
- `XDG_CONFIG_HOME=/tmp/claude-1000/xdgtest python3 -I tests/render4.py dist/gtk-4.0/gtk.css /tmp/claude-1000/t003.png light` exits 0.
- `git diff` for this round touches only `src/gtk4/_widgets.scss`. Do not commit.
