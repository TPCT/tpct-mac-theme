# T-005 — Dark mode is too black (S)

User feedback: "ليه ال dark mode اسود اوي كدا" ("why is dark mode so black?").

Cause: the dark palette uses near-black for every surface (window #1e1e20, headerbar/view #1c1c1e). On macOS, only the content area (text/list background, NSColor.textBackgroundColor ≈ #1e1e1e) is that dark. The window chrome, toolbar and sidebar are clearly lighter greys (window ≈ #2b2b2b–#323232, sidebar ≈ #333), and menus and popovers are lighter still.

## Change
1. `src/_palette.scss`, in the `$dark` map only, change these values:
   - window:     #1e1e20 → #2a2a2c
   - headerbar:  #1c1c1e → #2c2c2e
   - view:       #1c1c1e → #1f1f21
   - sidebar:    #2a2a2d → #333336
   - sidebar-2:  #242427 → #2d2d30
   - popover:    #2a2a2d → #323235
   - dialog:     #2a2a2d → #303033
   - tooltip:    #323235 → #3c3c3f
   - inactive-dot: #4a4a4e → #55555a
   Leave everything else in both maps unchanged.
2. `kvantum/make-kvantum.sh` lines 33-34: window colours #1e1e20 → #2a2a2c, base colours #1c1c1e → #1f1f21.

## Acceptance (fast round)
- `./build.sh` exits 0.
- `grep -c '#2a2a2c' dist/gtk-4.0/gtk.css dist/TPCT-Mac-Dark/gtk-3.0/gtk.css` → each file ≥ 1 (if a file has no window colour, report it instead of failing).
- `XDG_CONFIG_HOME=/tmp/claude-1000/xdgtest python3 -I tests/render4.py dist/gtk-4.0/gtk.css /tmp/claude-1000/t005-dark.png dark` exits 0.
- `git diff --name-only` = `src/_palette.scss`, `kvantum/make-kvantum.sh`. Do not commit.
