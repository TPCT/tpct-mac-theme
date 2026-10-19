# T-002: Finder icon view: no outline/frame around the whole selected cell
Size: S   Depends on: none   Stories: bug fix (no PRD)

## Context
In Nautilus (Finder) icon view, a selected item shows a thin grey rounded outline around the
WHOLE cell (icon + label), on top of our macOS-style selection. macOS Finder never frames the
whole cell; it only shows a soft grey box behind the icon and a blue pill behind the name.

Today, `src/gtk4/_widgets.scss`, section `// ───── Finder file views ─────` (around lines 736-770):
- `.nautilus-grid-view gridview > child` (+ `:hover`, `:selected`, `:selected:hover`) sets
  `background: none; box-shadow: none; color: $mac_fg;` but does NOT clear `outline`, and does
  not cover `:focus` / `:focus-visible`.
- The selected icon gets `a($mac_fg_solid, 0.10)` via
  `.nautilus-grid-view gridview > child:selected .nautilus-view-cell > :first-child`.
- The label gets the blue pill via `.icon-ui-labels-box > label:first-child` (grey when the
  grid is not focused).

Root cause (decided): the frame is GTK/libadwaita's keyboard focus ring — `outline` (2px,
negative offset, rounded) drawn on the focused `gridview > child` under `:focus-visible`
(and libadwaita draws it on `listview > row` too). Secondary candidate: a box-shadow/outline on
`.nautilus-view-cell` from Nautilus' own stylesheet. We clear both, in every state.

Build/install: `./build.sh` compiles with sassc to `dist/gtk-4.0/gtk.css`; `./install.sh`
copies it to `~/.config/gtk-4.0/gtk.css` (user-priority CSS, wins over libadwaita/Nautilus
regardless of specificity). SCSS helpers: colors are `$mac_*` variables, alpha via
`a(color, x)` (see `src/gtk4/_names.scss`).

## Task
Edit ONLY `src/gtk4/_widgets.scss`, section "Finder file views".

1. Grid view: extend the existing first rule block. Replace

```scss
.nautilus-grid-view gridview > child,
.nautilus-grid-view gridview > child:hover,
.nautilus-grid-view gridview > child:selected,
.nautilus-grid-view gridview > child:selected:hover {
  background: none;
  box-shadow: none;
  color: $mac_fg;
}
```

with

```scss
// Finder never frames the whole cell: drop GTK's focus ring (outline on the
// focused child) and any cell shadow, in every state.
.nautilus-grid-view gridview > child,
.nautilus-grid-view gridview > child:hover,
.nautilus-grid-view gridview > child:focus,
.nautilus-grid-view gridview > child:focus-visible,
.nautilus-grid-view gridview > child:focus:focus-visible,
.nautilus-grid-view gridview > child:selected,
.nautilus-grid-view gridview > child:selected:hover,
.nautilus-grid-view gridview > child:selected:focus,
.nautilus-grid-view gridview > child:selected:focus-visible {
  background: none;
  box-shadow: none;
  outline: none;
  color: $mac_fg;
}
.nautilus-grid-view gridview > child .nautilus-view-cell,
.nautilus-grid-view gridview > child:hover .nautilus-view-cell,
.nautilus-grid-view gridview > child:focus .nautilus-view-cell,
.nautilus-grid-view gridview > child:focus-visible .nautilus-view-cell,
.nautilus-grid-view gridview > child:selected .nautilus-view-cell {
  box-shadow: none;
  outline: none;
}
```

   Keep the comment line `// Icon view: no tinted cell; ...` above it as it is (the new
   comment goes directly after it). Do NOT set `background` on `.nautilus-view-cell` (its
   `> :first-child` carries the grey icon box and must keep working).

2. List view: keep the accent selection, only kill the focus ring. Directly after the existing
   `.nautilus-list-view columnview > listview > row:selected { ... }` line add:

```scss
// No focus ring around the row; the accent fill already shows the selection.
.nautilus-list-view columnview > listview > row,
.nautilus-list-view columnview > listview > row:focus,
.nautilus-list-view columnview > listview > row:focus-visible,
.nautilus-list-view columnview > listview > row:focus:focus-visible {
  outline: none;
  box-shadow: none;
}
```

   Do not touch background/color of list rows.

## Interfaces
None (CSS only). No new variables, no new files.

## Constraints
- Diff limited to `src/gtk4/_widgets.scss`. Do not touch dist/, build.sh, install.sh, other
  SCSS partials, or the generic `gridview > child:selected` / `listview > row:selected` rules
  near line 420.
- Follow file style: 2-space indent, `//` comments, short explanatory comment above new blocks.
- Do not use `!important`.
- Do not run `./install.sh` (Claude installs and verifies visually).

## Acceptance criteria
- [ ] `./build.sh` exits 0.
- [ ] `grep -n "gridview > child:focus-visible" dist/gtk-4.0/gtk.css` shows the new selector and
      the block contains `outline: none;`.
- [ ] `grep -n "nautilus-view-cell" dist/gtk-4.0/gtk.css` shows the new block with
      `outline: none;` and `box-shadow: none;`.
- [ ] `grep -n "listview > row:focus-visible" dist/gtk-4.0/gtk.css` shows the list-view block.
- [ ] Existing rules for the grey icon box (`child:selected .nautilus-view-cell > :first-child`)
      and the blue label pill are unchanged.
- [ ] `git diff --stat` lists only `src/gtk4/_widgets.scss`.

## Tests
No test suite exists. Run:
```
cd /run/media/tpct/main/tpct-mac-theme && ./build.sh \
  && grep -n -A3 "gridview > child:focus-visible\|nautilus-view-cell\|listview > row:focus-visible" dist/gtk-4.0/gtk.css \
  && git diff --stat
```
(dist/ is build output; if git tracks it, revert dist changes so the diff stays limited.)

## Out of scope
- Visual verification in Nautilus (done by Claude in a headless shell).
- Keyboard-focus indication alternative (macOS shows none on cells; accepted).
- GTK3 theme, shell theme, other Nautilus views (column/compact).
