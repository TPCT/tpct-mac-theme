#!/usr/bin/env python3
"""Show a GTK3 message dialog like Apport's, for screenshots."""
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk  # noqa: E402

d = Gtk.MessageDialog(message_type=Gtk.MessageType.QUESTION, buttons=Gtk.ButtonsType.NONE,
                      text="System program problem detected")
d.format_secondary_text("Do you want to report the problem now?")
d.add_button("Cancel", Gtk.ResponseType.CANCEL)
d.add_button("Report problem…", Gtk.ResponseType.OK)
d.set_default_response(Gtk.ResponseType.OK)
GLib.timeout_add(6000, Gtk.main_quit)
d.show_all()
Gtk.main()
