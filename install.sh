#!/usr/bin/env bash
# Install TPCT Mac for the current user and apply all desktop settings.
#   ./install.sh            install / update
#   ./install.sh --remove   undo
set -euo pipefail
cd "$(dirname "$0")"

THEMES="$HOME/.local/share/themes"
EXTDIR="$HOME/.local/share/gnome-shell/extensions"
EXT_UUID="tpct-mac-shell@tpct"
GTK4="${XDG_CONFIG_HOME:-$HOME/.config}/gtk-4.0"
GTK3="${XDG_CONFIG_HOME:-$HOME/.config}/gtk-3.0"
MARK="/* tpct-mac-theme */"

have() { command -v "$1" >/dev/null 2>&1; }
gset() { gsettings set "$@" 2>/dev/null || echo "  (skipped: $1 $2)"; }

enable_extension() {
  local uuid="$1" list
  list=$(gsettings get org.gnome.shell enabled-extensions)
  if [[ "$list" != *"'$uuid'"* ]]; then
    if [[ "$list" == "@as []" || "$list" == "[]" ]]; then list="['$uuid']"; else list="${list%]}, '$uuid']"; fi
    gsettings set org.gnome.shell enabled-extensions "$list"
  fi
}

if [[ "${1:-}" == "--remove" ]]; then
  rm -rf "$THEMES/TPCT-Mac-Dark" "$THEMES/TPCT-Mac-Light" "$EXTDIR/$EXT_UUID"
  for f in "$GTK4/gtk.css" "$GTK4/gtk-dark.css"; do
    [[ -f "$f" ]] && head -1 "$f" | grep -qF "$MARK" && rm -f "$f"
  done
  gsettings reset org.gnome.shell.extensions.user-theme name 2>/dev/null || true
  gsettings reset org.gnome.desktop.interface gtk-theme
  grep -l '^X-TPCT-Mac=true' "$HOME/.local/share/applications"/*.desktop 2>/dev/null | xargs -r rm -f
  gsettings reset org.gnome.desktop.wm.keybindings switch-input-source
  gsettings reset org.gnome.desktop.wm.keybindings switch-input-source-backward
  echo "Removed. Log out and back in to finish."
  exit 0
fi

echo "==> Building"
./build.sh

echo "==> Installing themes"
mkdir -p "$THEMES"
for v in Dark Light; do
  rm -rf "$THEMES/TPCT-Mac-$v"
  cp -r "dist/TPCT-Mac-$v" "$THEMES/TPCT-Mac-$v"
done

echo "==> Installing libadwaita (GTK4) layer"
mkdir -p "$GTK4"
for f in gtk.css gtk-dark.css; do
  { echo "$MARK"; cat "dist/gtk-4.0/$f"; } > "$GTK4/$f"
done
# Leftovers from other themes' GTK4 installs would fight with ours.
rm -rf "$GTK4/assets" "$GTK4/windows-assets"

echo "==> Installing GNOME Shell extension"
rm -rf "$EXTDIR/$EXT_UUID"
mkdir -p "$EXTDIR"
cp -r "extension/$EXT_UUID" "$EXTDIR/$EXT_UUID"
gset org.gnome.shell disable-user-extensions false
enable_extension "user-theme@gnome-shell-extensions.gcampax.github.com"
enable_extension "$EXT_UUID"

echo "==> Applying settings"
scheme=$(gsettings get org.gnome.desktop.interface color-scheme)
if [[ "$scheme" == "'prefer-light'" || "$scheme" == "'default'" ]]; then V=Light; v=light; else V=Dark; v=dark; fi
gset org.gnome.desktop.interface gtk-theme "TPCT-Mac-$V"
gset org.gnome.shell.extensions.user-theme name "TPCT-Mac-$V"
gset org.gnome.desktop.wm.preferences button-layout 'close,minimize,maximize:'
gset org.gnome.desktop.wm.preferences action-double-click-titlebar 'toggle-maximize'
gset org.gnome.mutter center-new-windows true
gset org.gnome.desktop.interface enable-hot-corners false
gset org.gnome.desktop.interface clock-show-weekday true
gset org.gnome.desktop.peripherals.touchpad natural-scroll true
gset org.gnome.desktop.peripherals.touchpad tap-to-click true

families=$(fc-list : family)
if grep -qiE 'SF Pro|Inter' <<<"$families"; then
  font=$(grep -qi 'SF Pro Text' <<<"$families" && echo 'SF Pro Text' || echo 'Inter Variable')
  gset org.gnome.desktop.interface font-name "$font 10.5"
  gset org.gnome.desktop.interface document-font-name "$font 11"
  gset org.gnome.desktop.wm.preferences titlebar-font "$font Bold 10.5"
else
  echo "  Tip: install the Inter font (closest free match to SF Pro): sudo apt install fonts-inter"
fi

# Dock (Ubuntu Dock / Dash to Dock): let the theme draw it.
D=org.gnome.shell.extensions.dash-to-dock
if gsettings list-schemas | grep -qx "$D"; then
  gset $D dock-position 'BOTTOM'
  gset $D extend-height false
  gset $D dash-max-icon-size 48
  gset $D apply-custom-theme false
  gset $D custom-theme-shrink true
  gset $D transparency-mode 'DEFAULT'
  gset $D running-indicator-style 'DOTS'
  gset $D show-trash true
  gset $D show-mounts false
  gset $D click-action 'minimize-or-previews'
fi

# Blur my Shell: match the theme's corner radii and keep its colors.
BMS="$EXTDIR/blur-my-shell@aunetx/schemas"
if [[ -d "$BMS" ]]; then
  P=org.gnome.shell.extensions.blur-my-shell.popup
  # Its popup blur is a square that shows dark corners behind rounded menus.
  for kv in "blur false" "menu-corner-radius 12" "quick-settings-corner-radius 24" "notification-corner-radius 16" \
            "osd-corner-radius 18" "dialog-corner-radius 22" "corner-radius 16" \
            "preserve-shell-theme true" "override-background false"; do
    # shellcheck disable=SC2086
    gsettings --schemadir "$BMS" set $P $kv 2>/dev/null || true
  done
fi

# Spotlight: Ulauncher with the macOS Spotlight theme on Super(⌘)+Space.
if have ulauncher; then
  UL="${XDG_CONFIG_HOME:-$HOME/.config}/ulauncher"
  mkdir -p "$UL/user-themes"
  for t in ulauncher/*/; do rm -rf "$UL/user-themes/$(basename "$t")"; cp -r "$t" "$UL/user-themes/"; done
  python3 - "$UL/settings.json" "tpct-spotlight-$v" <<'PY'
import json, os, sys
path, theme = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(path))
except (OSError, ValueError):
    data = {}
# The GNOME shortcut opens it; its own X11 hotkey would steal Ctrl+Space from apps.
data.update({"theme-name": theme, "show-indicator-icon": False,
             "render-on-screen": "default-monitor", "hotkey-show-app": ""})
json.dump(data, open(path, "w"), indent=4)
PY
  mkdir -p "$HOME/.config/autostart"
  [[ -f /usr/share/applications/ulauncher.desktop ]] && cp /usr/share/applications/ulauncher.desktop "$HOME/.config/autostart/"
  # ⌘+Space opens Spotlight; keyboard layout switching moves to Alt+Shift.
  MK=org.gnome.settings-daemon.plugins.media-keys
  KB=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/tpct-spotlight/
  list=$(gsettings get $MK custom-keybindings)
  if [[ "$list" != *"tpct-spotlight"* ]]; then
    if [[ "$list" == "@as []" || "$list" == "[]" ]]; then list="['$KB']"; else list="${list%]}, '$KB']"; fi
    gset $MK custom-keybindings "$list"
  fi
  gset $MK.custom-keybinding:$KB name 'Spotlight'
  gset $MK.custom-keybinding:$KB command 'ulauncher-toggle'
  gset $MK.custom-keybinding:$KB binding '<Super>space'
  gset org.gnome.desktop.wm.keybindings switch-input-source "['<Alt>Shift_L', 'XF86Keyboard']"
  gset org.gnome.desktop.wm.keybindings switch-input-source-backward "['<Shift>Alt_L']"
fi

# macOS app names (local overrides; the originals stay untouched).
APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
while IFS='|' read -r id name; do
  for dir in /usr/share/applications /var/lib/snapd/desktop/applications /var/lib/flatpak/exports/share/applications; do
    src="$dir/$id"
    [[ -f "$src" ]] || continue
    # Drop translated names so the new name shows in every language.
    sed -E -e "0,/^Name=.*/s//Name=$name/" -e '/^Name\[/d' -e '/^X-GNOME-FullName/d' "$src" > "$APPS/$id"
    echo "X-TPCT-Mac=true" >> "$APPS/$id"
    break
  done
done <<'NAMES'
org.gnome.Nautilus.desktop|Finder
org.gnome.Settings.desktop|System Settings
snap-store_snap-store.desktop|App Store
org.gnome.Software.desktop|App Store
org.gnome.TextEditor.desktop|TextEdit
org.gnome.Loupe.desktop|Preview
org.gnome.Papers.desktop|Preview
org.gnome.Ptyxis.desktop|Terminal
org.gnome.SystemMonitor.desktop|Activity Monitor
org.gnome.DiskUtility.desktop|Disk Utility
org.gnome.baobab.desktop|Storage
org.gnome.clocks.desktop|Clock
org.gnome.Logs.desktop|Console
org.gnome.font-viewer.desktop|Font Book
org.gnome.Characters.desktop|Character Viewer
org.gnome.Snapshot.desktop|Photo Booth
org.gnome.Showtime.desktop|QuickTime Player
org.gnome.Totem.desktop|QuickTime Player
yelp.desktop|Tips
NAMES
update-desktop-database "$APPS" 2>/dev/null || true

# Flatpak apps can only see the theme if allowed to read it.
if have flatpak; then
  flatpak override --user --filesystem=xdg-config/gtk-4.0:ro --filesystem=xdg-config/gtk-3.0:ro \
    --filesystem=xdg-data/themes:ro --env=GTK_THEME="TPCT-Mac-$V" 2>/dev/null || true
fi

echo
echo "Done. Log out and back in once so GNOME Shell loads the extension."
