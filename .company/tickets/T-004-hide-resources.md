# T-004 — Hide Resources when Activity Monitor is installed (S)

Context: `gnome-system-monitor` is renamed "Activity Monitor" by `install.sh`. Ubuntu also ships Resources (`net.nokyan.Resources.desktop`), so the app grid shows two task managers. macOS has one.

## Change
In `install.sh`, right after the macOS app-names loop (after `NAMES` heredoc, before `update-desktop-database "$APPS"`), add:

- If `org.gnome.SystemMonitor.desktop` exists in any of the same three app dirs used by the rename loop, then for `net.nokyan.Resources.desktop` found in those dirs: write a local copy to `$APPS/net.nokyan.Resources.desktop` with every existing `NoDisplay=` line removed, `NoDisplay=true` added inside the `[Desktop Entry]` group (i.e. right after the `[Desktop Entry]` line, not at file end, because the file may contain `[Desktop Action ...]` groups), and append `X-TPCT-Mac=true` the same way the rename loop does — NOTE: appending at the end would place it in the last group; to be correct, also insert `X-TPCT-Mac=true` right after `[Desktop Entry]` for this file instead of appending.
- One short comment line above the block, matching the existing comment style.
- If Activity Monitor is not installed, do nothing (Resources stays visible).

`--remove` already deletes every `$APPS/*.desktop` whose lines include `^X-TPCT-Mac=true` (grep -l, any line), so no change is needed there.

## Acceptance (fast round)
- `bash -n install.sh` exits 0.
- Extract the new block into a temp script with `APPS=/tmp/claude-1000/t004apps` and run it: the output file exists, `grep -c '^NoDisplay=true' ` = 1, and the line after `[Desktop Entry]` group header contains NoDisplay=true and X-TPCT-Mac=true before any `[Desktop Action` group.
- `git diff` touches only `install.sh`. Do not commit. Do not run the full install.sh.
