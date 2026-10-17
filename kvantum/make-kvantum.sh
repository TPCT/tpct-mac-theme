#!/usr/bin/env bash
# Generate TPCT-Mac Kvantum themes (Qt apps) from the KvMojave themes that ship
# with qt-style-kvantum, recolored to the TPCT Mac palette.
#   make-kvantum.sh OUT_DIR
set -euo pipefail
OUT="$1"
SRC=/usr/share/Kvantum
[[ -d "$SRC/KvMojave" ]] || { echo "  qt-style-kvantum not installed; skipping Qt theme"; exit 0; }

make_theme() {
  local base="$1" name="$2"; shift 2
  local dir="$OUT/$name"
  rm -rf "$dir"; mkdir -p "$dir"
  cp "$SRC/$base/$base.svg" "$dir/$name.svg"
  cp "$SRC/$base/$base.kvconfig" "$dir/$name.kvconfig"
  # Accent: Mojave's blues and purple selection become the macOS system blue.
  sed -i -E "s/#295e9f|#3273c3|#b74aff|#2EB8E6|#0057AE/$ACCENT/gI" "$dir/$name.svg" "$dir/$name.kvconfig"
  # GNOME cannot blur behind Qt windows, so translucency would only show the
  # windows underneath: make windows and menus opaque.
  sed -i -E -e 's/^translucent_windows=.*/translucent_windows=false/' \
            -e 's/^(blurring|popup_blurring)=.*/\1=false/' \
            -e 's/^(reduce_window_opacity|reduce_menu_opacity)=.*/\1=0/' "$dir/$name.kvconfig"
  # Colors: replace key=value pairs inside [GeneralColors].
  local kv
  for kv in "$@"; do
    local key="${kv%%=*}" val="${kv#*=}"
    sed -i -E "/^\[GeneralColors\]/,/^\[/{s|^${key//./\\.}=.*|${key}=${val}|}" "$dir/$name.kvconfig"
  done
}

ACCENT='#0091ff'
make_theme KvMojave TPCT-Mac-Dark \
  window.color='#1e1e20' inactive.window.color='#1e1e20' \
  base.color='#1c1c1e' inactive.base.color='#1c1c1e' \
  alt.base.color='#242427' inactive.alt.base.color='#242427' \
  button.color='#3a3a3d' tooltip.base.color='#323235' \
  highlight.color='#0091ff' inactive.highlight.color='#3a3a3d' \
  highlight.text.color='#ffffff' inactive.highlight.text.color='#f5f5f7' \
  text.color='#f5f5f7' window.text.color='#f5f5f7' button.text.color='#f5f5f7' \
  link.color='#0091ff'

ACCENT='#0088ff'
make_theme KvMojaveLight TPCT-Mac-Light \
  window.color='#f5f5f7' inactive.window.color='#f5f5f7' \
  base.color='#ffffff' inactive.base.color='#ffffff' \
  alt.base.color='#f5f5f7' inactive.alt.base.color='#f5f5f7' \
  button.color='#ffffff' tooltip.base.color='#fdfdfd' tooltip.text.color='#1d1d1f' \
  highlight.color='#0088ff' inactive.highlight.color='#d9d9de' \
  highlight.text.color='#ffffff' inactive.highlight.text.color='#1d1d1f' \
  text.color='#1d1d1f' window.text.color='#1d1d1f' button.text.color='#1d1d1f' \
  link.color='#0088ff'
