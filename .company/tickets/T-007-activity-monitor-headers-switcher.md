# T-007 — Activity Monitor: flat TreeView headers + macOS segmented view switcher (S)

User screenshot (gnome-system-monitor 49, renamed "Activity Monitor"):
1. In the Processes table, the column headers (Name, ID, CPU, Memory, Disk Read, Disk Write) are separate grey filled boxes, like buttons. On macOS a table header is flat.
   - Cause: this table is a GTK4 **GtkTreeView**, not a ColumnView. T-003 only flattened `columnview > header > button`, so the GTK4 tree view header buttons still get the generic button fill.
2. The header bar has an `AdwViewSwitcher` (Resources / Processes / File Systems). The active page is a big tall grey pill with icon + label. macOS Activity Monitor uses a compact, text-only segmented control (capsule track, the selected segment raised).

## Change — `src/gtk4/_widgets.scss` only (+ render harness)
A. Right after the T-003 ColumnView header block, add the same flat header rules for the GTK4 tree view:
   - Base selectors are `treeview.view > header > button` with every state the ColumnView block lists (`:hover :active :checked :disabled :backdrop :focus :focus-visible :focus:focus-visible`), plus the `:last-child` no-separator variant and the inner `> box` reset if one exists. Use the same values as ColumnView: 22px min-height, padding 2px 8px, no border/radius/background, right separator `inset -1px 0 $mac_separator`, 12px weight 500, `$mac_fg_dim`, and light hover/active fills.
   - The header bottom line is a `box-shadow: inset 0 -1px $mac_separator` on the header buttons themselves (the tree view header has no separate node to draw on). Combine it with the right separator: `inset -1px 0 …, inset 0 -1px …`; the last child gets only the bottom line.
   - Prefer extending the existing ColumnView selector lists to adding a copy, if that keeps them readable.
B. Style the view switcher in a header bar as the existing `.linked` capsule segmented control (lines ~184-211). It should look exactly the same: a `$mac_fill` track with radius 999px and 2px padding, segments 22px high with padding 1px 12px, no background when not checked, `$mac_fill_hover` on hover, and checked = `$mac_segment` / `$mac_segment_fg` with the same raised shadow.
   - Selectors: `headerbar viewswitcher` (track) and `headerbar viewswitcher > button` / `:hover` / `:checked`. Override libadwaita's tall pill: `min-height`, `min-width: 0`, `border-radius: 999px`, `margin: 0`.
   - Text-only, like macOS. Make the icon take no space in the wide layout (`viewswitcher > button > stack > box.wide > image`: `-gtk-icon-size: 0; min-width: 0; min-height: 0; margin: 0; padding: 0;`) and remove the box spacing (`border-spacing: 0` on `box.wide`). Label: 12px, weight 500. The narrow layout (icon above label) is untouched.
   - Do not touch `viewswitcherbar` (bottom bar) or `inline-view-switcher`.
C. `tests/render4.py`: add to the render a header bar with an `Adw.ViewSwitcher` (policy WIDE) bound to an `Adw.ViewStack` with three titled pages that have icons (Resources / Processes / File Systems, Processes visible). Also add a small `Gtk.TreeView` (ListStore with 3 columns Name / ID / CPU, 2 rows, clickable sortable headers). Enlarge the window only as much as needed.

## Acceptance (fast round)
- `./build.sh` exits 0.
- `XDG_CONFIG_HOME=/tmp/claude-1000/xdgtest python3 -I tests/render4.py dist/gtk-4.0/gtk.css /tmp/claude-1000/t007-light.png light` and `… dark` exit 0 (if the sandbox has no display, say so; Claude renders at the gate).
- `git diff --name-only` = `src/gtk4/_widgets.scss`, `tests/render4.py`. Do not commit.
