# T-006 — Global menu: Electron/Chromium submenus open empty (S)

User report: WhatsApp Desktop (snap, Electron) shows `File Edit View Window Help` in the menu bar, but clicking them opens nothing.

## Root cause (verified live)
The app's dbusmenu `GetLayout(0, -1, [])` returns the top-level items with `children-display: 'submenu'` and **empty** children:
```
(0, {'label': 'Root'}, [ (2, {'children-display':'submenu','label':'File'}, []), (3,…'Edit'…,[]), … ])
```
Children appear only after `AboutToShow(id)`. After `AboutToShow(2)`, `GetLayout(2,-1,[])` returns `File → Quit (Ctrl+Q)`. Chromium populates lazily.
Our code calls `aboutToShow` only when the panel menu opens. But a `PopupMenu` with no items never opens (`PopupMenu.open()` returns early when `isEmpty()`), so `AboutToShow` is never sent.

## Change
1. `extension/tpct-mac-shell@tpct/menuSources.js`, `DbusMenuSource`:
   - After each successful `refresh()`, walk the layout. For every node that has `children-display === 'submenu'` and zero children, and whose id is not yet in a per-source `Set` (`this._prefetched`), add the id to the set and call `AboutToShow(id)`, ignoring errors. After those calls finish, if at least one was sent, call `refresh()` once more. The set prevents loops: an id is prefetched at most once per source. Nested submenus revealed by the second refresh are prefetched the same way, so the walk is recursive over the whole tree.
   - Do not send the `opened` event during the prefetch. Only `AboutToShow`.
   - The existing on-open `aboutToShow` behaviour stays as it is.
2. `extension/tpct-mac-shell@tpct/extension.js`, `fillMenu`: if a menu ends up with no visible items, add one insensitive `PopupMenuItem` labelled `Loading…`. The menu can then still open, which triggers the existing on-open `aboutToShow` path that later refills it. This applies to both the cascade submenu and the inline-submenu paths, because both go through `fillMenu`.
3. Add test `tests/test_dbusmenu_lazy.js` (run as `gjs -m tests/test_dbusmenu_lazy.js`). It:
   - Exports a fake `com.canonical.dbusmenu` object on the session bus with `Gio.DBusConnection.register_object` + `Gio.bus_own_name`. Use a unique name such as `org.tpct.test.dbusmenu<pid>`. Initially, root children are File(2) and Edit(3), both `children-display: submenu` with no children. `AboutToShow(2)` adds child 7 `Quit`; `AboutToShow(3)` adds child 8 `Copy`. Each one bumps the revision and emits `LayoutUpdated`.
   - Imports `DbusMenuSource` from `../extension/tpct-mac-shell@tpct/menuSources.js` (it only imports gi://, so it loads in plain gjs). Constructs it against the fake service and runs a GLib main loop until `getTopLevel()` shows `File.children[0].label === 'Quit'` and `Edit.children[0].label === 'Copy'`, with a 5 s timeout.
   - Asserts that each AboutToShow id was called exactly once. Prints `PASS` and exits 0, or prints the failure and exits 1.
   - If `menuSources.js` cannot be imported outside the shell, report this instead of rewriting the module.

## Acceptance (fast round)
- `gjs -m tests/test_dbusmenu_lazy.js` prints PASS and exits 0.
- `gjs -c` / syntax check: `gjs -m -c 'import("./extension/tpct-mac-shell@tpct/menuSources.js")'` is not required; the test import is enough.
- `git diff --name-only`: menuSources.js, extension.js, the new test. Do not commit.
