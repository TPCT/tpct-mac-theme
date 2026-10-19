# T-001: Menu-bar traffic lights show their glyphs on hover
Size: S   Depends on: none   Stories: n/a (bug fix)

## Context
`extension/tpct-mac-shell@tpct/windowButtons.js` (class `WindowButtons`) puts macOS
traffic lights (close / minimize / restore) at the far left of the top panel while the
focused window is maximized. Today they only show the coloured dots; the glyphs never
appear on hover.

Root cause: `stylesheet.css` (lines ~143-144) hides the glyphs with
`.tpct-window-button-icon { color: transparent; }` and reveals them with
`.tpct-window-buttons:hover .tpct-window-button-icon { color: rgba(0, 0, 0, 0.6); }`,
but the container `this._box` (`St.BoxLayout`, style_class `tpct-window-buttons`) is
created without `reactive: true` / `track_hover: true`, so St never sets the `:hover`
pseudo-class on it.

Second problem: the restore button uses the icon name `window-restore-symbolic`. In the
active icon theme (WhiteSur-light, symlinked to WhiteSur) that name and also
`view-restore-symbolic` are "overlapping windows" glyphs, not the macOS diagonal
arrows. The only installed icon with the macOS diagonal "restore" arrows (two arrows
pointing inward toward the centre) is Adwaita's:
`/usr/share/icons/Adwaita/symbolic/actions/view-restore-symbolic.svg`.
Because WhiteSur shadows that name, it must be loaded by file path, not by icon name.

Verified to exist on this system:
- `window-close-symbolic`    - WhiteSur(-light/-dark) actions/symbolic + Adwaita symbolic/ui
- `window-minimize-symbolic` - WhiteSur(-light/-dark) actions/symbolic + Adwaita symbolic/ui
- `/usr/share/icons/Adwaita/symbolic/actions/view-restore-symbolic.svg` (diagonal arrows)

Required behaviour (macOS): while the pointer is anywhere over the group of three buttons
(including the gaps between them), all three glyphs show at ~60% black; when it leaves,
all three hide. Glyph ~8px, centred in the 12px dot.

## Task
1. `extension/tpct-mac-shell@tpct/windowButtons.js`
   - Add `import Gio from 'gi://Gio';` (keep imports alphabetical: Clutter, Gio, GLib, Meta, St).
   - In the `St.BoxLayout` constructor for `this._box` add `reactive: true` and
     `track_hover: true`, with a short comment: the group must track hover so the CSS
     `:hover` reveals all three glyphs at once, like macOS.
   - Change the `button(cls, icon, action)` helper so `icon` is a `Gio.Icon` instead of a
     name: build the child as
     `new St.Icon({gicon: icon, style_class: 'tpct-window-button-icon', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true})`.
   - Close: `new Gio.ThemedIcon({name: 'window-close-symbolic'})`.
   - Minimize: `new Gio.ThemedIcon({name: 'window-minimize-symbolic'})`.
   - Restore: a module-level helper (top of file, below imports):
     ```js
     // macOS restore glyph = two diagonal arrows. WhiteSur maps every *-restore
     // name to overlapping windows, so load Adwaita's arrows by path.
     const RESTORE_ICON_PATH = '/usr/share/icons/Adwaita/symbolic/actions/view-restore-symbolic.svg';

     function restoreIcon() {
         const file = Gio.File.new_for_path(RESTORE_ICON_PATH);
         return file.query_exists(null)
             ? new Gio.FileIcon({file})
             : new Gio.ThemedIcon({name: 'window-restore-symbolic'});
     }
     ```
     and use `button('maximize', restoreIcon(), w => w.unmaximize());`.
     (The file name ends in `-symbolic.svg`, so St recolours it with the CSS `color`
     like the themed icons.)
   - Do not change anything else in the file (focus tracking, `_sync`, `destroy`, etc.).
   - Optional: keep `track_hover: true` on the individual `St.Button`s (harmless).

2. `extension/tpct-mac-shell@tpct/stylesheet.css` (the traffic-light block, ~lines 132-144)
   - Keep `.tpct-window-button-icon { icon-size: 8px; color: transparent; }`.
   - Keep the `.tpct-window-buttons:hover .tpct-window-button-icon { color: rgba(0, 0, 0, 0.6); }` rule.
   - Do not add CSS for centring (St has no `text-align` for icons); centring is done by
     `x_align`/`y_align` on the St.Icon (step 1).
   - Only change: add this one-line comment directly above the `.tpct-window-button-icon` rule:
     `/* Glyphs appear only while the group is hovered (macOS); the box has track_hover. */`

## Interfaces
- `WindowButtons` public API unchanged: `constructor(onShown = () => {})`, `destroy()`.
- Internal helper signature becomes `button(cls: string, icon: Gio.Icon, action: (w: Meta.Window) => void)`.
- New module-level `const RESTORE_ICON_PATH` and `function restoreIcon(): Gio.Icon` (not exported).

## Constraints
- Touch ONLY `extension/tpct-mac-shell@tpct/windowButtons.js` and
  `extension/tpct-mac-shell@tpct/stylesheet.css`.
- Follow existing style: ES modules, `gi://` imports, GObject/St, 4-space indent, single
  quotes, short comments explaining why (not what).
- No new dependencies, no bundled SVG files, no changes to metadata.json, extension.js,
  build/install scripts, or other CSS rules.
- Do not commit; leave changes in the working tree.

## Acceptance criteria
- [ ] `this._box` is created with `reactive: true` and `track_hover: true`.
- [ ] Close uses `window-close-symbolic`, minimize uses `window-minimize-symbolic` (as `Gio.ThemedIcon`).
- [ ] Restore uses `Gio.FileIcon` for `/usr/share/icons/Adwaita/symbolic/actions/view-restore-symbolic.svg`, falling back to `Gio.ThemedIcon` `window-restore-symbolic` if the file is missing.
- [ ] The `St.Icon` children have `x_align`/`y_align` `Clutter.ActorAlign.CENTER` and `x_expand`/`y_expand` true.
- [ ] CSS keeps `icon-size: 8px`, `color: transparent` default and the `.tpct-window-buttons:hover` reveal rule at `rgba(0, 0, 0, 0.6)`.
- [ ] `git diff --stat` shows only the two allowed files.
- [ ] `gjs -m extension/tpct-mac-shell@tpct/windowButtons.js` (run from the repo root) fails ONLY with
      `ImportError: Unable to load file from: resource:///org/gnome/shell/ui/main.js` - no `SyntaxError`
      or any other error. (This is the current baseline output; GNOME Shell resources are not available
      outside the shell.)

## Tests
No unit-test harness exists for the extension. Run from the repo root:
```
gjs -m extension/tpct-mac-shell@tpct/windowButtons.js 2>&1 | grep -E 'SyntaxError|ImportError'
git diff --stat
```
Expected: one `ImportError ... resource:///org/gnome/shell/ui/main.js` line, no `SyntaxError`.
Visual verification in a headless GNOME Shell is done by Claude afterwards.

## Out of scope
- Pressed/active (darker) glyph state, window-inactive grey dots, Alt-key "zoom" (+) glyph.
- Fullscreen (green = fullscreen) semantics; the green button keeps calling `unmaximize()`.
- Any change to which windows show the menu-bar traffic lights.
