#!/usr/bin/env bash
# Install the macOS-style login screen (GDM). Needs sudo.
#   gdm/install-gdm.sh            install / update
#   gdm/install-gdm.sh --remove   go back to the stock Ubuntu login screen
#
# Nothing shipped by Ubuntu is modified: the theme is registered as a
# higher-priority "gdm-theme.gresource" alternative, and settings go into an
# extra file in /usr/share/gdm/dconf, both removed by --remove.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=/usr/share/gnome-shell/theme/TPCT-Mac/gnome-shell-theme.gresource
DCONF=/usr/share/gdm/dconf/95-tpct-mac
FONTDIR=/usr/local/share/fonts/tpct-mac

if [[ "${1:-}" == "--remove" ]]; then
  sudo update-alternatives --remove gdm-theme.gresource "$TARGET" 2>/dev/null || true
  sudo rm -rf "$(dirname "$TARGET")" "$DCONF" "$FONTDIR"
  sudo fc-cache -f >/dev/null 2>&1 || true
  echo "Stock login screen restored. It takes effect at the next reboot."
  exit 0
fi

gdm/build-gdm.sh "${1:-}"

sudo install -Dm644 dist/gdm/tpct-mac-gdm.gresource "$TARGET"
sudo update-alternatives --install /usr/share/gnome-shell/gdm-theme.gresource \
  gdm-theme.gresource "$TARGET" 50
sudo update-alternatives --set gdm-theme.gresource "$TARGET"

# The login screen runs as the gdm user and cannot see fonts in your home.
inter=$(fc-list : file family | grep -i 'Inter Variable' | head -1 | cut -d: -f1 || true)
if [[ -n "$inter" ]]; then
  sudo install -d "$FONTDIR"
  sudo install -m644 "$(dirname "$inter")"/InterVariable*.ttf "$FONTDIR"/
  sudo fc-cache -f >/dev/null 2>&1 || true
fi

sudo tee "$DCONF" >/dev/null <<'EOF'
# TPCT Mac login screen settings (removed by gdm/install-gdm.sh --remove)
[org/gnome/login-screen]
logo=''

[org/gnome/desktop/interface]
color-scheme='prefer-dark'
cursor-theme='McMojave-cursors'
icon-theme='WhiteSur-dark'
font-name='Inter Variable 11'
clock-format='12h'
clock-show-weekday=true

[org/gnome/desktop/peripherals/touchpad]
tap-to-click=true
natural-scroll=true
EOF

update-alternatives --display gdm-theme.gresource | head -3
echo
echo "Done. The new login screen shows at the next reboot or log out."
echo "To undo: gdm/install-gdm.sh --remove"
