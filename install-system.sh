#!/usr/bin/env bash
# System-wide parts (need sudo): macOS boot splash and login screen.
#   ./install-system.sh            install
#   ./install-system.sh --remove   undo both
set -euo pipefail
cd "$(dirname "$0")"
plymouth/install-plymouth.sh "${1:-}"
gdm/install-gdm.sh "${1:-}"
