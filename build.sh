#!/usr/bin/env bash
# Compile the SCSS sources into dist/.
set -euo pipefail
cd "$(dirname "$0")"

command -v sassc >/dev/null || { echo "sassc is required (sudo apt install sassc)"; exit 1; }

rm -rf dist
mkdir -p dist/gtk-4.0
sassc -t expanded src/gtk4/gtk.scss dist/gtk-4.0/gtk.css
cp dist/gtk-4.0/gtk.css dist/gtk-4.0/gtk-dark.css

for v in Dark Light; do
  lv=$(echo "$v" | tr 'A-Z' 'a-z')
  d="dist/TPCT-Mac-$v"
  mkdir -p "$d/gnome-shell"
  sassc -t expanded "src/shell/gnome-shell-$lv.scss" "$d/gnome-shell/gnome-shell.css"
  cat > "$d/index.theme" <<THEME
[Desktop Entry]
Type=X-GNOME-Metatheme
Name=TPCT-Mac-$v
Comment=macOS-style theme for GNOME
Encoding=UTF-8

[X-GNOME-Metatheme]
GtkTheme=TPCT-Mac-$v
IconTheme=WhiteSur-$lv
CursorTheme=McMojave-cursors
THEME
done

echo "Built: $(find dist -name '*.css' | tr '\n' ' ')"
