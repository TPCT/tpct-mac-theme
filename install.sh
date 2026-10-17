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
  python3 - "$GTK3/gtk.css" <<'PY' 2>/dev/null || true
import re, sys
p = sys.argv[1]; t = open(p).read()
open(p, "w").write(re.sub(r"/\* tpct-mac-theme: begin \*/.*?/\* tpct-mac-theme: end \*/\n?", "", t, flags=re.S))
PY
  rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/Kvantum/TPCT-Mac-"* "$HOME/.config/environment.d/90-tpct-mac-qt.conf"
  grep -l '^X-TPCT-Mac=true' "$HOME/.local/share/applications"/*.desktop 2>/dev/null | xargs -r rm -f
  gsettings reset org.gnome.desktop.wm.keybindings switch-input-source
  gsettings reset org.gnome.shell.keybindings screenshot
  gsettings reset org.gnome.shell.keybindings show-screenshot-ui
  gsettings reset org.gnome.desktop.wm.keybindings close
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

echo "==> Installing GTK3 user overrides"
mkdir -p "$GTK3"
touch "$GTK3/gtk.css"
# Replace our marked block, keep anything else the user has in the file.
python3 - "$GTK3/gtk.css" src/gtk3/user-overrides.css <<'PY'
import re, sys
path, block = sys.argv[1], open(sys.argv[2]).read().strip() + "\n"
text = open(path).read()
text = re.sub(r"/\* tpct-mac-theme: begin \*/.*?/\* tpct-mac-theme: end \*/\n?", "", text, flags=re.S)
open(path, "w").write(text.rstrip() + ("\n\n" if text.strip() else "") + block)
PY

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
gset org.gnome.desktop.interface clock-format '12h'
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

# macOS shortcuts with Super as ⌘: ⌘⇧3 full screenshot, ⌘⇧4/⌘⇧5 screenshot UI, ⌘W close window.
gset org.gnome.shell.keybindings screenshot "['<Shift><Super>3', '<Shift>Print']"
gset org.gnome.shell.keybindings show-screenshot-ui "['<Shift><Super>4', '<Shift><Super>5', 'Print']"
gset org.gnome.desktop.wm.keybindings close "['<Super>w', '<Alt>F4']"

# Dock (Ubuntu Dock / Dash to Dock): let the theme draw it.
D=org.gnome.shell.extensions.dash-to-dock
if gsettings list-schemas | grep -qx "$D"; then
  gset $D dock-position 'BOTTOM'
  gset $D extend-height false
  gset $D dash-max-icon-size 36
  gset $D apply-custom-theme false
  gset $D custom-theme-shrink true
  gset $D transparency-mode 'DEFAULT'
  gset $D running-indicator-style 'DOTS'
  gset $D show-trash true
  gset $D show-mounts false
  gset $D show-show-apps-button false
  gset $D click-action 'minimize-or-previews'
fi

# macOS dock with magnification (Dash2Dock Animated) and the Genie minimize
# effect (Magic Lamp), if installed. The TPCT extension turns the Ubuntu dock
# off once Dash2Dock is running.
D2D="$EXTDIR/dash2dock-lite@icedman.github.com/schemas"
if [[ -d "$D2D" ]]; then
  K=org.gnome.shell.extensions.dash2dock-lite
  for kv in "dock-location 0" "animation-magnify 0.5" "animation-spread 0.75" "open-app-animation true" \
            "trash-icon true" "apps-icon false" "icon-shadow true" "border-radius 4.0" \
            "background-color (0.17, 0.17, 0.19, 0.55)" "running-indicator-color (1.0, 1.0, 1.0, 0.85)" \
            "separator-thickness 1" "lamp-app-animation false"; do
    # shellcheck disable=SC2086
    gsettings --schemadir "$D2D" set $K ${kv%% *} "${kv#* }" 2>/dev/null || true
  done
  enable_extension "dash2dock-lite@icedman.github.com"
fi
[[ -d "$EXTDIR/compiz-alike-magic-lamp-effect@hermes83.github.com" ]] &&
  enable_extension "compiz-alike-magic-lamp-effect@hermes83.github.com"

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
  # Same problem behind the dock: its blur is not clipped to the dock's corners.
  gsettings --schemadir "$BMS" set org.gnome.shell.extensions.blur-my-shell.dash-to-dock blur false 2>/dev/null || true
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

# Qt apps: Kvantum theme generated from KvMojave with the TPCT Mac palette.
KV="${XDG_CONFIG_HOME:-$HOME/.config}/Kvantum"
if [[ -d /usr/share/Kvantum/KvMojave ]]; then
  mkdir -p "$KV"
  kvantum/make-kvantum.sh "$KV"
  printf '[General]\ntheme=TPCT-Mac-%s\n' "$V" > "$KV/kvantum.kvconfig"
  mkdir -p "$HOME/.config/environment.d"
  printf 'QT_STYLE_OVERRIDE=kvantum\n' > "$HOME/.config/environment.d/90-tpct-mac-qt.conf"
else
  echo "  Tip: for Qt apps install Kvantum: sudo apt install qt-style-kvantum"
fi

# Firefox: Safari-style userChrome in every profile.
if have firefox; then
  roots=("$HOME/snap/firefox/common/.mozilla/firefox" "$HOME/.mozilla/firefox")
  found=$(find "${roots[@]}" -maxdepth 2 -name prefs.js 2>/dev/null | head -1 || true)
  if [[ -z "$found" ]] && ! pgrep -x firefox >/dev/null; then
    # No profile yet: let Firefox create its default one headlessly.
    timeout 40 firefox --headless --screenshot /tmp/tpct-firefox-init.png about:blank >/dev/null 2>&1 || true
    rm -f /tmp/tpct-firefox-init.png
  fi
  while IFS= read -r prefs; do
    prof=$(dirname "$prefs")
    mkdir -p "$prof/chrome"
    cp firefox/userChrome.css "$prof/chrome/userChrome.css"
    touch "$prof/user.js"
    grep -q legacyUserProfileCustomizations "$prof/user.js" ||
      echo 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);' >> "$prof/user.js"
    grep -q 'browser.tabs.inTitlebar' "$prof/user.js" ||
      echo 'user_pref("browser.tabs.inTitlebar", 1);' >> "$prof/user.js"
    echo "  Firefox profile themed: $(basename "$prof")"
  done < <(find "${roots[@]}" -maxdepth 2 -name prefs.js 2>/dev/null)
fi

# Terminal (Ptyxis): macOS Terminal colors and font.
if gsettings list-schemas | grep -qx org.gnome.Ptyxis; then
  PAL="${XDG_DATA_HOME:-$HOME/.local/share}/org.gnome.Ptyxis/palettes"
  mkdir -p "$PAL"
  cp ptyxis/macOS.palette "$PAL/"
  uuid=$(gsettings get org.gnome.Ptyxis default-profile-uuid | tr -d "'")
  if [[ -n "$uuid" ]]; then
    gset "org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/$uuid/" palette 'macOS'
  fi
  gset org.gnome.Ptyxis interface-style 'system'
  gset org.gnome.Ptyxis use-system-font false
  gset org.gnome.Ptyxis font-name 'DejaVu Sans Mono 11'
fi

# Flatpak apps can only see the theme if allowed to read it.
if have flatpak; then
  flatpak override --user --filesystem=xdg-config/gtk-4.0:ro --filesystem=xdg-config/gtk-3.0:ro \
    --filesystem=xdg-data/themes:ro --env=GTK_THEME="TPCT-Mac-$V" 2>/dev/null || true
fi

echo
echo "Done. Log out and back in once so GNOME Shell loads the extension."
