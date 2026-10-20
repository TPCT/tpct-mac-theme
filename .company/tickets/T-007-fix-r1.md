# T-007 fix round 1 — view switcher still shows icons and is too tall

The Claude gate render (`tests/render4.py`, light and dark) shows the TreeView headers are correct. The view switcher, however, is still about 34px tall and still shows icons.

Real node tree of AdwViewSwitcher in libadwaita 1.9 (dumped live):
```
viewswitcher.wide
  button.flat.horizontal.toggle            (AdwViewSwitcherButton)
    stack                                   (GtkStack — sized to the LARGEST child)
      box.horizontal.wide
        indicatorbin > mask, indicator > label.numeric, image   ← the icon is INSIDE indicatorbin
        label
      box.vertical.narrow
        indicatorbin > … image
        label
```
- `box.wide > image` therefore never matches. The icon is `box.wide > indicatorbin > image`.
- The stack is as tall as the hidden **narrow** box, which has the icon above the label. That makes every segment tall.

## Change (`src/gtk4/_widgets.scss`, in the T-007 viewswitcher block)
- Replace the `box.wide > image` rule with rules that zero the icon in **both** boxes, but only inside `headerbar viewswitcher`: `> button > stack > box > indicatorbin > image { -gtk-icon-size: 0; min-width: 0; min-height: 0; margin: 0; padding: 0; }`. Also zero `indicatorbin` itself (`min-width: 0; min-height: 0; margin: 0; padding: 0;`).
- On both `box.wide` and `box.narrow` under that selector, set `border-spacing: 0; margin: 0; padding: 0;`.
- Each segment should end up about 22px tall, text only, with labels at 12px and weight 500.
- Leave `viewswitcherbar` and `inline-view-switcher` untouched.

## Acceptance
- `./build.sh` exits 0. `git diff --name-only` lists only `src/gtk4/_widgets.scss` and `tests/render4.py`, and `render4.py` is unchanged this round. Do not commit. Claude renders at the gate.
