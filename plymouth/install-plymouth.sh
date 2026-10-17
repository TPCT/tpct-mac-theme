#!/usr/bin/env bash
# Install the macOS-style boot splash (Plymouth). Needs sudo.
#   plymouth/install-plymouth.sh            install / update
#   plymouth/install-plymouth.sh --remove   back to the previous splash
#
# Registered as a higher-priority "default.plymouth" alternative; nothing
# shipped by Ubuntu is modified. The initramfs is rebuilt so the splash shows
# from the first second of boot.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR=/usr/share/plymouth/themes/tpct-mac
THEME="$DIR/tpct-mac.plymouth"

if [[ "${1:-}" == "--remove" ]]; then
  sudo update-alternatives --remove default.plymouth "$THEME" 2>/dev/null || true
  sudo rm -rf "$DIR"
  sudo update-initramfs -u
  echo "Previous boot splash restored."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 -I plymouth/make-images.py "$work"

sudo install -d "$DIR"
sudo install -m644 plymouth/tpct-mac.plymouth plymouth/tpct-mac.script "$DIR"/
sudo install -m644 "$work"/*.png "$DIR"/
sudo update-alternatives --install /usr/share/plymouth/themes/default.plymouth \
  default.plymouth "$THEME" 200
sudo update-alternatives --set default.plymouth "$THEME"
echo "Rebuilding the initramfs (takes a minute)…"
sudo update-initramfs -u
echo "Done. The new boot splash shows at the next boot."
echo "To undo: plymouth/install-plymouth.sh --remove"
