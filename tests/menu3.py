#!/usr/bin/env python3
"""Pop up a GTK3 context menu (like the desktop's) so it can be screenshotted."""
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

win = Gtk.Window(title="menu test")
win.set_default_size(420, 360)
win.show_all()
menu = Gtk.Menu()
for label in ("New Folder", "Paste", None, "Select All", None, "Arrange Icons", "Arrange By…", None,
              "Show Desktop in Files", "Open in Terminal", None, "Change Background…"):
    menu.append(Gtk.SeparatorMenuItem() if label is None else Gtk.MenuItem(label=label))
menu.get_children()[1].set_sensitive(False)
sub = Gtk.Menu()
sub.append(Gtk.MenuItem(label="Name"))
menu.get_children()[6].set_submenu(sub)
menu.show_all()


def pop():
    rect = Gdk.Rectangle()
    rect.x, rect.y, rect.width, rect.height = 40, 40, 1, 1
    menu.popup_at_rect(win.get_window(), rect, Gdk.Gravity.NORTH_WEST, Gdk.Gravity.NORTH_WEST, None)
    menu.select_item(menu.get_children()[3])
    return False


GLib.timeout_add(500, pop)
GLib.timeout_add(6000, Gtk.main_quit)
Gtk.main()
