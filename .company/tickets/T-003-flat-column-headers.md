# T-003: Flat macOS-style ColumnView column headers (no pills)
Size: S   Depends on: none   Stories: bug fix (no PRD)

## Context
In GTK4 apps with a `Gtk.ColumnView` (e.g. GNOME System Monitor "Processes": Process | Process ID |
User | Memory | Processor | GPU) every column header renders as a separate rounded pill with a
border and drop shadow.

Root cause: the header title widget's CSS node is `columnview > header > button`, so it inherits the
generic `button` rule in `src/gtk4/_widgets.scss` (section `// ───── Buttons ─────`, ~line 118):
`border-radius: $radius-control; background-color: $mac_control; box-shadow: 0 0 0 0.5px $mac_border,
0 1px 1.5px $mac_shadow;` plus `button:hover`, `button:active, button:checked`, `button:disabled`,
`button:focus:focus-visible` state rules. The only existing header rule is the last line of the
file (end of the "Finder file views" section):

```scss
columnview > header > button { font-weight: 500; font-size: 12px; color: $mac_fg_dim; }
```

It only sets font/colour. Note on specificity: `columnview > header > button` is (0,0,3) while
`button:hover` is (0,1,1), so the state rules of the generic button WIN unless every state is
listed explicitly on the header selector. That is why each state below is spelled out.

GTK3 (`src/gtk3/gtk.scss`, `treeview.view header button`, ~line 360) is already flat (radius 0,
no shadow, right/bottom separators) — leave it untouched (decision logged in STATUS.md).

macOS table header look: flat (no background, no shadow, no radius), 12px medium-weight dim text,
1px vertical separator on the right side of each column except the last, one 1px line under the
whole header row, very faint fill on hover, sort arrow unaffected.

Build: `./build.sh` compiles with sassc to `dist/gtk-4.0/gtk.css`. SCSS colour handles are
`$mac_*` variables and alpha via `a(color, x)` (see `src/gtk4/_names.scss`). Existing handles
used here: `$mac_fg_dim`, `$mac_fg`, `$mac_separator`, `$mac_fill_hover`.

## Task
### 1. `src/gtk4/_widgets.scss`
Replace the single last line
`columnview > header > button { font-weight: 500; font-size: 12px; color: $mac_fg_dim; }`
with this block (keep it at the end of the file, add the comment line):

```scss
// Column headers (ColumnView): flat macOS table header, never a pill button.
columnview > header {
  background: none;
  box-shadow: inset 0 -1px $mac_separator;
}
columnview > header > button,
columnview > header > button:hover,
columnview > header > button:active,
columnview > header > button:checked,
columnview > header > button:disabled,
columnview > header > button:backdrop,
columnview > header > button:focus,
columnview > header > button:focus-visible,
columnview > header > button:focus:focus-visible {
  min-height: 22px;
  min-width: 0;
  padding: 2px 8px;
  border: none;
  border-radius: 0;
  background: none;
  box-shadow: inset -1px 0 $mac_separator;
  outline: none;
  font-weight: 500;
  font-size: 12px;
  color: $mac_fg_dim;
}
columnview > header > button:last-child,
columnview > header > button:last-child:hover,
columnview > header > button:last-child:active,
columnview > header > button:last-child:checked,
columnview > header > button:last-child:disabled,
columnview > header > button:last-child:backdrop,
columnview > header > button:last-child:focus,
columnview > header > button:last-child:focus-visible,
columnview > header > button:last-child:focus:focus-visible {
  box-shadow: none;
}
columnview > header > button:hover { background-color: a($mac_fg, 0.04); }
columnview > header > button:active { background-color: a($mac_fg, 0.08); }
columnview > header > button:disabled { color: $mac_fg_disabled; }
```

Notes:
- The separators are drawn with inset box-shadows (not `border`) so they do not change the header
  height/width and cannot double up with the header-row line.
- Do NOT touch `sort-indicator` or `-gtk-icon-source`; the sort arrow must keep libadwaita's styling.
- If `$mac_fg_disabled` does not exist in `_names.scss`, drop that last line (do not add new handles).
  (It is used by the generic `button:disabled` rule, so it should exist.)

### 2. `tests/render4.py`
Add a small ColumnView to the demo so headers can be checked visually.

- Add `Gio` to the import: `from gi.repository import Adw, Gdk, Gio, GLib, Gtk  # noqa: E402`
- Add a new module-level function `build_columnview()` (place it right before `build_content`):

```python
def build_columnview():
    store = Gio.ListStore(item_type=Gtk.StringObject)
    for s in ("Report.pdf|1.2 MB|PDF document",
              "Notes.txt|4 KB|Plain text",
              "Photos|--|Folder"):
        store.append(Gtk.StringObject.new(s))
    cv = Gtk.ColumnView(show_column_separators=False, show_row_separators=False)
    sort_model = Gtk.SortListModel(model=store, sorter=cv.get_sorter())
    cv.set_model(Gtk.NoSelection(model=sort_model))
    first = None
    for idx, title in enumerate(("Name", "Size", "Kind")):
        fac = Gtk.SignalListItemFactory()
        fac.connect("setup", lambda f, li: li.set_child(Gtk.Label(xalign=0)))
        fac.connect("bind", lambda f, li, i=idx:
                    li.get_child().set_label(li.get_item().get_string().split("|")[i]))
        col = Gtk.ColumnViewColumn(title=title, factory=fac, expand=(idx == 0))
        col.set_sorter(Gtk.CustomSorter.new(
            lambda a, b, _d, i=idx: (a.get_string().split("|")[i] > b.get_string().split("|")[i])
            - (a.get_string().split("|")[i] < b.get_string().split("|")[i]), None))
        cv.append_column(col)
        if first is None:
            first = col
    cv.sort_by_column(first, Gtk.SortType.ASCENDING)
    frame = Gtk.Frame(child=cv)
    return frame
```

- In `build_content()`, after `box.append(tabs)`, add: `box.append(build_columnview())`
- In `main()`, change `win.set_default_size(900, 640)` to `win.set_default_size(900, 760)` so the
  table fits in the snapshot.
- Nothing else in the harness changes.

## Interfaces
- New function `build_columnview() -> Gtk.Frame` in `tests/render4.py`.
- CLI of `render4.py` unchanged: `render4.py CSS_FILE OUT_PNG [dark|light]`.

## Constraints
- Only these two files may change: `src/gtk4/_widgets.scss`, `tests/render4.py`.
- Do not modify `src/gtk3/*`, `_names.scss`, `build.sh`, or any other rule in `_widgets.scss`.
- No `!important`. No new colour variables.
- Do not install anything; do not run `./install.sh`.

## Acceptance criteria
- [ ] Every header state selector listed above is present; no generic button background, radius
      or drop shadow can apply to `columnview > header > button` in any state.
- [ ] Last column has no right separator; header row has a single 1px bottom line.
- [ ] `./build.sh` exits 0.
- [ ] `mkdir -p /tmp/claude-1000/xdgtest && XDG_CONFIG_HOME=/tmp/claude-1000/xdgtest python3 -I tests/render4.py dist/gtk-4.0/gtk.css /tmp/claude-1000/t003.png light`
      exits 0 and writes `/tmp/claude-1000/t003.png` (no Python traceback). Visual inspection is done by Claude.
- [ ] `git diff --stat` shows only the two files above.

## Tests
Run only:
```
cd /run/media/tpct/main/tpct-mac-theme && ./build.sh
mkdir -p /tmp/claude-1000/xdgtest
XDG_CONFIG_HOME=/tmp/claude-1000/xdgtest python3 -I tests/render4.py dist/gtk-4.0/gtk.css /tmp/claude-1000/t003.png light
ls -l /tmp/claude-1000/t003.png
```
No other test suites.

## Out of scope
- GTK3 treeview headers (already flat).
- Row styling of ColumnView / Nautilus list view.
- Dark-mode render (Claude will check it at review).
