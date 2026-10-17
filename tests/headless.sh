#!/usr/bin/env bash
# Start an isolated, headless GNOME Shell (own dconf, own extensions dir) with
# the theme applied, so shell changes can be tested without logging out.
#
#   tests/headless.sh start [dark|light]   start in the background
#   tests/headless.sh run CMD...           run CMD inside that session's D-Bus
#   tests/headless.sh stop
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HL="${TPCT_HL_DIR:-/tmp/claude-1000/hl}"
ADDR_FILE="$HL/bus-address"
PID_FILE="$HL/pid"

session_env() {
  export XDG_CONFIG_HOME="$HL/config" XDG_DATA_HOME="$HL/data" XDG_CACHE_HOME="$HL/cache"
  export DBUS_SESSION_BUS_ADDRESS="$(cat "$ADDR_FILE")"
}

case "${1:-}" in
start)
  scheme="${2:-dark}"
  mkdir -p "$HL"/{config,data/gnome-shell/extensions,data/themes,cache}
  ext="$HL/data/gnome-shell/extensions"
  # Tiny helper extension: unsafe mode lets tests use Eval and Screenshot.
  mkdir -p "$ext/tpct-debug@tpct"
  echo '{"uuid":"tpct-debug@tpct","name":"tpct debug","description":"test helper","shell-version":["48","49","50"]}' > "$ext/tpct-debug@tpct/metadata.json"
  printf 'export default class TpctDebug {\n    enable() { global.context.unsafe_mode = true; }\n    disable() {}\n}\n' > "$ext/tpct-debug@tpct/extension.js"
  for e in blur-my-shell@aunetx logomenu@aryan_k dash2dock-lite@icedman.github.com compiz-alike-magic-lamp-effect@hermes83.github.com; do
    [ -e "$HOME/.local/share/gnome-shell/extensions/$e" ] && ln -sfn "$HOME/.local/share/gnome-shell/extensions/$e" "$ext/$e"
  done
  [ -d "$ROOT/extension/tpct-mac-shell@tpct" ] && ln -sfn "$ROOT/extension/tpct-mac-shell@tpct" "$ext/tpct-mac-shell@tpct"
  ln -sfn "$ROOT/dist/TPCT-Mac-Dark" "$HL/data/themes/TPCT-Mac-Dark"
  ln -sfn "$ROOT/dist/TPCT-Mac-Light" "$HL/data/themes/TPCT-Mac-Light"
  ln -sfn "$HOME/.local/share/fonts" "$HL/data/fonts"
  # Apps inside the test session use the installed GTK layers.
  ln -sfn "$HOME/.config/gtk-4.0" "$HL/config/gtk-4.0"
  ln -sfn "$HOME/.config/gtk-3.0" "$HL/config/gtk-3.0"
  ln -sfn "$HOME/.local/share/backgrounds" "$HL/data/backgrounds"
  rm -f "$ADDR_FILE"
  Variant=$([ "$scheme" = dark ] && echo Dark || echo Light)
  XDG_CONFIG_HOME="$HL/config" XDG_DATA_HOME="$HL/data" XDG_CACHE_HOME="$HL/cache" \
  setsid dbus-run-session -- bash -c '
    echo "$DBUS_SESSION_BUS_ADDRESS" > "'"$ADDR_FILE"'"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "[\"tpct-debug@tpct\",\"user-theme@gnome-shell-extensions.gcampax.github.com\",\"ubuntu-dock@ubuntu.com\",\"blur-my-shell@aunetx\",\"tpct-mac-shell@tpct\",\"dash2dock-lite@icedman.github.com\",\"compiz-alike-magic-lamp-effect@hermes83.github.com\"]"
    gsettings set org.gnome.shell.extensions.user-theme name "TPCT-Mac-'"$Variant"'"
    gsettings set org.gnome.desktop.interface color-scheme "prefer-'"$scheme"'"
    gsettings set org.gnome.desktop.interface icon-theme "WhiteSur-'"$scheme"'"
    gsettings set org.gnome.desktop.interface gtk-theme "TPCT-Mac-'"$Variant"'"
    gsettings set org.gnome.desktop.interface cursor-theme McMojave-cursors
    gsettings set org.gnome.desktop.interface font-name "Inter Variable 10.5"
    gsettings set org.gnome.desktop.wm.preferences button-layout "close,minimize,maximize:"
    gsettings set org.gnome.desktop.background picture-uri "file://'"$HOME"'/.local/share/backgrounds/WhiteSur/WhiteSur-light.jpg"
    gsettings set org.gnome.desktop.background picture-uri-dark "file://'"$HOME"'/.local/share/backgrounds/WhiteSur/WhiteSur-dark.jpg"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    gsettings set org.gnome.shell.extensions.dash-to-dock dock-position BOTTOM
    gsettings set org.gnome.shell.extensions.dash-to-dock extend-height false
    gsettings set org.gnome.shell.extensions.dash-to-dock dock-fixed true
    gsettings set org.gnome.shell.extensions.dash-to-dock dash-max-icon-size 36
    gsettings set org.gnome.shell.extensions.dash-to-dock show-show-apps-button false
    gsettings set org.gnome.desktop.interface clock-format 12h
    gsettings set org.gnome.desktop.interface clock-show-weekday true
    gsettings set org.gnome.shell.extensions.dash-to-dock transparency-mode DEFAULT
    BMS="'"$HOME"'/.local/share/gnome-shell/extensions/blur-my-shell@aunetx/schemas"
    [ -d "$BMS" ] && gsettings --schemadir "$BMS" set org.gnome.shell.extensions.blur-my-shell.popup blur false
    [ -d "$BMS" ] && gsettings --schemadir "$BMS" set org.gnome.shell.extensions.blur-my-shell.dash-to-dock blur false
    exec gnome-shell --headless --virtual-monitor 1920x1080 --wayland-display wayland-tpct-test --no-x11
  ' > "$HL/shell.log" 2>&1 &
  echo $! > "$PID_FILE"
  for _ in $(seq 1 60); do
    [ -s "$ADDR_FILE" ] && session_env && gdbus call --session --dest org.gnome.Shell \
      --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1" >/dev/null 2>&1 && break
    sleep 0.5
  done
  echo "headless shell started (log: $HL/shell.log)"
  ;;
run)
  shift
  session_env
  "$@"
  ;;
stop)
  [ -f "$PID_FILE" ] && pkill -TERM -s "$(ps -o sid= -p "$(cat "$PID_FILE")" | tr -d ' ')" 2>/dev/null || true
  rm -f "$PID_FILE" "$ADDR_FILE"
  echo stopped
  ;;
*)
  sed -n '2,8p' "$0"; exit 1
  ;;
esac
