#!/usr/bin/env bash
# Point third-party apps at the system (macOS-style) title bar and theme.
#   apps/configure-apps.sh
# Safe to run again. Chrome is only changed while it is closed.
set -euo pipefail

merge_json() { # file  key=json ...
  python3 - "$@" <<'PY'
import json, os, sys
path, pairs = sys.argv[1], sys.argv[2:]
try:
    data = json.load(open(path))
except (OSError, ValueError):
    data = {}
for pair in pairs:
    key, value = pair.split("=", 1)  # VS Code settings use flat dotted keys
    data[key] = json.loads(value)
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(data, open(path, "w"), indent=4)
PY
}

# VS Code: system title bar → traffic lights from the theme and the menu in
# the top bar (global menu).
for dir in "$HOME/.config/Code/User" "$HOME/.config/Code - OSS/User" "$HOME/.config/VSCodium/User"; do
  if [[ -d "$(dirname "$dir")" ]]; then
    merge_json "$dir/settings.json" \
      'window.titleBarStyle="native"' \
      'window.menuBarVisibility="classic"' \
      'window.commandCenter=false'
    echo "VS Code: system title bar enabled ($dir). Restart VS Code."
  fi
done

# Google Chrome (deb): GTK theme + Chrome-drawn frame, so the window buttons
# come from the GTK theme (traffic lights).
CHROME_PREFS="$HOME/.config/google-chrome/Default/Preferences"
if [[ -f "$CHROME_PREFS" ]]; then
  if pgrep -x chrome >/dev/null; then
    echo "Chrome is running: close it and run this script again (or set chrome://settings/appearance → Mode: GTK)."
  else
    python3 - "$CHROME_PREFS" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.setdefault("extensions", {}).setdefault("theme", {})["system_theme"] = 1  # 1 = GTK
d["extensions"]["theme"]["id"] = ""
d.setdefault("browser", {})["custom_chrome_frame"] = True
json.dump(d, open(p, "w"))
PY
    echo "Chrome: GTK theme enabled."
  fi
fi
