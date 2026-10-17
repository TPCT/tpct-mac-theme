#!/usr/bin/env python3
"""Take a full-screen screenshot through xdg-desktop-portal.

Usage: shot.py OUT_PNG [all]

By default the image is cropped to the primary monitor.
"""
import shutil
import sys
from urllib.parse import unquote, urlparse

from gi.repository import Gio, GLib

out = sys.argv[1]
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
loop = GLib.MainLoop()
token = "tpctshot"
sender = bus.get_unique_name()[1:].replace(".", "_")
handle = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
result = {}


def on_response(conn, sender_name, path, iface, signal, params):
    code, res = params.unpack()
    result["code"] = code
    result["uri"] = res.get("uri")
    loop.quit()


bus.signal_subscribe("org.freedesktop.portal.Desktop", "org.freedesktop.portal.Request",
                     "Response", handle, None, Gio.DBusSignalFlags.NONE, on_response)
bus.call_sync("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop",
              "org.freedesktop.portal.Screenshot", "Screenshot",
              GLib.Variant("(sa{sv})", ("", {"handle_token": GLib.Variant("s", token),
                                             "interactive": GLib.Variant("b", False)})),
              None, Gio.DBusCallFlags.NONE, -1, None)
GLib.timeout_add_seconds(30, loop.quit)
loop.run()

if result.get("code") != 0 or not result.get("uri"):
    sys.exit(f"screenshot failed: {result}")
src = unquote(urlparse(result["uri"]).path)
shutil.move(src, out)

if "all" not in sys.argv[2:]:
    from PIL import Image

    state = bus.call_sync("org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig",
                          "org.gnome.Mutter.DisplayConfig", "GetCurrentState", None, None,
                          Gio.DBusCallFlags.NONE, -1, None).unpack()
    logical = state[2]
    # Screenshot pixels start at the top-left of the union of all monitors.
    min_x = min(m[0] for m in logical)
    min_y = min(m[1] for m in logical)
    prim = next(m for m in logical if m[4])
    mode = None
    for mon in state[1]:
        if mon[0] == prim[5][0][:4]:
            mode = next(md for md in mon[1] if md[6].get("is-current"))
    w, h = (mode[1], mode[2]) if mode else (1920, 1080)
    scale = prim[2]
    w, h = round(w / scale), round(h / scale)
    if prim[3] in (1, 3, 5, 7):  # rotated 90/270
        w, h = h, w
    x, y = prim[0] - min_x, prim[1] - min_y
    Image.open(out).crop((x, y, x + w, y + h)).save(out)
print(out)
