#!/usr/bin/env bash
# Build dist/gdm/tpct-mac-gdm.gresource: the system's current GDM theme plus the
# macOS login-screen styles and a blurred copy of a wallpaper.
#   gdm/build-gdm.sh [WALLPAPER]
set -euo pipefail
cd "$(dirname "$0")/.."
WALL="${1:-$HOME/.local/share/backgrounds/WhiteSur/WhiteSur-dark.jpg}"
SRC=/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource
[[ -f "$SRC" ]] || SRC=/usr/share/gnome-shell/gnome-shell-theme.gresource
OUT=dist/gdm
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT" "$WORK/theme"
xml="$WORK/res.xml"
echo '<?xml version="1.0" encoding="UTF-8"?><gresources><gresource prefix="/org/gnome/shell/theme">' > "$xml"
while read -r path; do
  rel=${path#/org/gnome/shell/theme/}
  mkdir -p "$WORK/theme/$(dirname "$rel")"
  gresource extract "$SRC" "$path" > "$WORK/theme/$rel"
  echo "<file>$rel</file>" >> "$xml"
done < <(gresource list "$SRC" | grep '^/org/gnome/shell/theme/')

for css in gdm.css gdm3.css; do
  [[ -f "$WORK/theme/$css" ]] && cat gdm/login-mac.css >> "$WORK/theme/$css"
done

python3 - "$WALL" "$WORK/theme/tpct-login.jpg" <<'PY'
import sys
from PIL import Image, ImageEnhance, ImageFilter
im = Image.open(sys.argv[1]).convert("RGB")
im.thumbnail((2560, 2560))
im = im.filter(ImageFilter.GaussianBlur(18))
im = ImageEnhance.Brightness(im).enhance(0.85)
im.save(sys.argv[2], quality=90)
PY
echo "<file>tpct-login.jpg</file>" >> "$xml"
echo '</gresource></gresources>' >> "$xml"

glib-compile-resources --sourcedir="$WORK/theme" --target="$OUT/tpct-mac-gdm.gresource" "$xml"
echo "Built $OUT/tpct-mac-gdm.gresource"
