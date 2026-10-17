#!/usr/bin/env python3
"""Render a demo GTK3 window offscreen with a theme and save it as PNG.

Usage: GTK_THEME=TPCT-Mac-Dark render3.py OUT_PNG
"""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk  # noqa: E402

out_png = sys.argv[1]

win = Gtk.OffscreenWindow()
outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
outer.get_style_context().add_class("background")
outer.set_size_request(900, 600)

hb = Gtk.HeaderBar(title="Documents", subtitle=None, show_close_button=True)
hb.set_decoration_layout("close,minimize,maximize:")
nav = Gtk.Box()
nav.get_style_context().add_class("linked")
for icon in ("go-previous-symbolic", "go-next-symbolic"):
    nav.add(Gtk.Button.new_from_icon_name(icon, Gtk.IconSize.BUTTON))
hb.pack_start(nav)
hb.pack_end(Gtk.MenuButton(image=Gtk.Image.new_from_icon_name("open-menu-symbolic", Gtk.IconSize.BUTTON)))
hb.pack_end(Gtk.Button.new_from_icon_name("system-search-symbolic", Gtk.IconSize.BUTTON))
outer.add(hb)

paned = Gtk.Box()
side = Gtk.ListBox()
side.get_style_context().add_class("navigation-sidebar")
side.set_size_request(200, -1)
for i, (icon, name) in enumerate([("user-home-symbolic", "Home"), ("folder-documents-symbolic", "Documents"),
                                  ("folder-download-symbolic", "Downloads"), ("user-trash-symbolic", "Trash")]):
    row = Gtk.Box(spacing=8, margin=6)
    row.add(Gtk.Image.new_from_icon_name(icon, Gtk.IconSize.MENU))
    row.add(Gtk.Label(label=name, xalign=0))
    side.add(row)
side.select_row(side.get_row_at_index(1))
sidebox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
sidebox.get_style_context().add_class("sidebar")
sidebox.pack_start(side, True, True, 0)
paned.pack_start(sidebox, False, False, 0)
paned.add(Gtk.Separator(orientation=Gtk.Orientation.VERTICAL))

box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=18)
r1 = Gtk.Box(spacing=8)
r1.add(Gtk.Button(label="Cancel"))
b = Gtk.Button(label="Save")
b.get_style_context().add_class("suggested-action")
r1.add(b)
d = Gtk.Button(label="Delete")
d.get_style_context().add_class("destructive-action")
r1.add(d)
f = Gtk.Button(label="Flat", relief=Gtk.ReliefStyle.NONE)
r1.add(f)
combo = Gtk.ComboBoxText()
for t in ("Option one", "Two"):
    combo.append_text(t)
combo.set_active(0)
r1.add(combo)
box.add(r1)

r2 = Gtk.Box(spacing=8)
e = Gtk.Entry(placeholder_text="Search")
r2.pack_start(e, True, True, 0)
e2 = Gtk.Entry(text="Focused entry")
r2.pack_start(e2, True, True, 0)
r2.add(Gtk.SpinButton.new_with_range(0, 100, 1))
box.add(r2)

r3 = Gtk.Box(spacing=16)
s = Gtk.Switch(active=True, valign=Gtk.Align.CENTER)
r3.add(s)
r3.add(Gtk.Switch(valign=Gtk.Align.CENTER))
r3.add(Gtk.CheckButton(label="Checked", active=True))
r3.add(Gtk.CheckButton(label="Unchecked"))
rb1 = Gtk.RadioButton(label="Radio")
rb2 = Gtk.RadioButton.new_with_label_from_widget(rb1, "Radio 2")
r3.add(rb1)
r3.add(rb2)
box.add(r3)

sc = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
sc.set_value(60)
sc.set_draw_value(False)
box.add(sc)
box.add(Gtk.ProgressBar(fraction=0.45))

store = Gtk.ListStore(str, str, str)
for row in (("Report.pdf", "1.2 MB", "Today"), ("Photo.jpg", "3.4 MB", "Yesterday"), ("Notes.txt", "4 KB", "Monday")):
    store.append(row)
tv = Gtk.TreeView(model=store)
for i, title in enumerate(("Name", "Size", "Modified")):
    tv.append_column(Gtk.TreeViewColumn(title, Gtk.CellRendererText(), text=i))
tv.get_selection().select_path(Gtk.TreePath(1))
frame = Gtk.ScrolledWindow(min_content_height=110, shadow_type=Gtk.ShadowType.IN)
frame.add(tv)
box.add(frame)

nb = Gtk.Notebook()
for t in ("General", "Advanced"):
    nb.append_page(Gtk.Label(label=f"{t} settings", margin=12), Gtk.Label(label=t))
box.add(nb)

paned.pack_start(box, True, True, 0)
outer.pack_start(paned, True, True, 0)
win.add(outer)
win.show_all()
e2.grab_focus()


def snap():
    pb = win.get_pixbuf()
    pb.savev(out_png, "png", [], [])
    Gtk.main_quit()
    return False


GLib.timeout_add(600, snap)
Gtk.main()
