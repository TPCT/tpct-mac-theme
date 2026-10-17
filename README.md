# TPCT Mac

A macOS-style desktop for GNOME (tested on Ubuntu 26.04 / GNOME 50): one theme for GTK4/libadwaita, GTK3 and GNOME Shell, plus a Shell extension that gives you the macOS menu bar and desktop widgets.

## What you get

**Theme (Light and Dark)**
- libadwaita / GTK4 and GTK3: macOS controls, colors, traffic-light window buttons, segmented controls, source-list sidebars, accent-highlighted menus
- GNOME Shell: translucent menu bar, menus, Control Center, notifications, dock, OSD, dialogs, app grid, lock screen
- Follows the system Light/Dark switch automatically

**`tpct-mac-shell` extension**
- **Global menu**: the focused app's menus (File, Edit, View, …) in the top bar
  - GTK apps that export a menubar (GMenuModel over D-Bus)
  - X11/XWayland apps that use dbusmenu (Chromium, Electron, JetBrains, LibreOffice, …) through a built-in `com.canonical.AppMenu.Registrar`
  - Every other app gets the standard macOS set: *App*, File, Edit, View, Window
- **Finder** menus (File, Edit, View, Go, Window) when the desktop is focused
- Clock on the right, no Activities pill
- **Desktop widgets**: clock, weather, calendar with today's events, world clock, now playing (any MPRIS player), photos, battery

**Also set up by `install.sh`**
- Spotlight on ⌘ (Super) + Space using Ulauncher with a Spotlight theme; keyboard layout switching moves to Alt+Shift
- macOS app names: Finder, System Settings, App Store, TextEdit, Preview, Terminal, Activity Monitor, …
- Dock, Blur my Shell and touchpad settings

## Install

```bash
sudo apt install sassc
git clone https://github.com/TPCT/tpct-mac-theme.git
cd tpct-mac-theme
./install.sh
```

Log out and back in once so GNOME Shell loads the extension.

Recommended companions (installed separately):
- Icons: [WhiteSur icon theme](https://github.com/vinceliuice/WhiteSur-icon-theme), cursors: McMojave
- Font: [Inter](https://rsms.me/inter/) (`sudo apt install fonts-inter`); SF Pro is used automatically if you have it
- Extensions: [Blur my Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/), [Logo Menu](https://extensions.gnome.org/extension/4451/logo-menu/)
- Weather widget: GNOME Weather (`sudo apt install gnome-weather`) with a city selected

Remove with `./install.sh --remove`.

## Limits

- Snap apps are sandboxed and cannot read user themes. Use the deb or Flatpak build of an app to get the theme.
- Apps that draw their own UI (Electron/web apps, JetBrains, VS Code) keep their own look inside the window.
- GNOME on Wayland has no protocol for native Wayland Qt apps to export menus, so those get the standard menu set.

## Development

```bash
./build.sh                                   # compile SCSS into dist/
tests/render4.py dist/gtk-4.0/gtk.css out.png dark   # render a libadwaita demo window
GTK_THEME=TPCT-Mac-Dark tests/render3.py out.png     # render a GTK3 demo window
tests/headless.sh start dark                 # isolated headless GNOME Shell for testing
```

No Apple fonts, wallpapers or artwork are included.

## License

GPL-3.0-or-later
