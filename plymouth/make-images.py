#!/usr/bin/env python3
"""Render the boot splash images into OUT_DIR (the logo comes from the
installed WhiteSur icon theme, so no Apple artwork is stored in this repo)."""
import os
import sys

import gi

gi.require_version("GdkPixbuf", "2.0")
from gi.repository import GdkPixbuf  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
svg = next(p for p in ("/usr/share/icons/WhiteSur/places/22/start-here-symbolic.svg",
                       "/usr/share/icons/WhiteSur-dark/places/22/start-here-symbolic.svg") if os.path.exists(p))
pb = GdkPixbuf.Pixbuf.new_from_file_at_size(svg, 96, 96)
pb.savev("/tmp/tpct-logo-src.png", "png", [], [])
src = Image.open("/tmp/tpct-logo-src.png").convert("RGBA")
white = Image.new("RGBA", src.size, (255, 255, 255, 0))
white.putalpha(src.getchannel("A"))
white.save(os.path.join(out, "logo.png"))

w, h = 220, 6
box = Image.new("RGBA", (w, h), (0, 0, 0, 0))
ImageDraw.Draw(box).rounded_rectangle((0, 0, w - 1, h - 1), radius=3, fill=(70, 70, 72, 255))
box.save(os.path.join(out, "progress_box.png"))
bar = Image.new("RGBA", (w, h), (0, 0, 0, 0))
ImageDraw.Draw(bar).rounded_rectangle((0, 0, w - 1, h - 1), radius=3, fill=(255, 255, 255, 255))
bar.save(os.path.join(out, "progress_bar.png"))
print("images in", out)
