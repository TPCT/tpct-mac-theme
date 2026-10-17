#!/usr/bin/env bash
# Helpers for the headless test shell.
#   tests/hl.sh eval 'JS'        evaluate JS in the test shell
#   tests/hl.sh shot OUT [x y w h]
cd "$(dirname "$0")/.."
case "$1" in
eval) tests/headless.sh run gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "$2" ;;
shot)
  if [ $# -ge 6 ]; then
    tests/headless.sh run gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.ScreenshotArea "$3" "$4" "$5" "$6" false "$2" >/dev/null
  else
    tests/headless.sh run gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false "$2" >/dev/null
  fi ;;
esac
