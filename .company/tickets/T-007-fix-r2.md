# T-007 fix round 2 — view switcher stretched to the header bar height

Measured live with dist/gtk-4.0/gtk.css: each viewswitcher button's natural height is 24px (as intended), but the header bar allocates the title widget its full inner height (34px), so the track and segments stretch to 34px.

## Change (`src/gtk4/_widgets.scss`, `headerbar viewswitcher` rule only)
Add `margin-top: 3px; margin-bottom: 3px;` (replace the current `margin: 0;` with `margin: 3px 0;`) so the track is 28px (2px padding + 24px segment) and vertically centred, like the macOS toolbar segmented control. Add a one-line comment saying why (the header bar stretches the title widget; CSS cannot set valign).

## Acceptance
`./build.sh` exits 0; diff touches only `src/gtk4/_widgets.scss` (plus the earlier render4.py change). Do not commit.
