#!/usr/bin/env python3
"""A tiny GTK4 app with a nested menubar, to test the global menu."""
import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gio, Gtk  # noqa: E402

XML = """<interface><menu id="menubar">
<submenu><attribute name="label">_File</attribute>
  <section><item><attribute name="label">New Window</attribute><attribute name="action">app.noop</attribute><attribute name="accel">&lt;Primary&gt;n</attribute></item>
  <submenu><attribute name="label">Open Recent</attribute>
    <item><attribute name="label">Report.pdf</attribute><attribute name="action">app.noop</attribute></item>
    <item><attribute name="label">Budget.xlsx</attribute><attribute name="action">app.noop</attribute></item>
  </submenu></section>
  <section><item><attribute name="label">Close</attribute><attribute name="action">app.noop</attribute></item></section>
</submenu>
<submenu><attribute name="label">_View</attribute>
  <submenu><attribute name="label">Sort By</attribute>
    <item><attribute name="label">Name</attribute><attribute name="action">app.noop</attribute></item>
    <item><attribute name="label">Date Modified</attribute><attribute name="action">app.noop</attribute></item>
  </submenu>
</submenu>
</menu></interface>"""

app = Gtk.Application(application_id="dev.tpct.MenubarTest")


def on_startup(a):
    act = Gio.SimpleAction.new("noop", None)
    a.add_action(act)
    a.set_menubar(Gtk.Builder.new_from_string(XML, -1).get_object("menubar"))


def on_activate(a):
    w = Gtk.ApplicationWindow(application=a, title="Menubar test", show_menubar=False)
    w.set_default_size(500, 300)
    w.present()


app.connect("startup", on_startup)
app.connect("activate", on_activate)
app.run([])
