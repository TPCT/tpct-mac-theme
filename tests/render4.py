#!/usr/bin/env python3
"""Render a demo libadwaita window with the theme applied and save it as PNG.

Usage: render4.py CSS_FILE OUT_PNG [dark|light]
"""
import sys

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk  # noqa: E402

css_file, out_png = sys.argv[1], sys.argv[2]
scheme = sys.argv[3] if len(sys.argv) > 3 else "dark"


def build_sidebar():
    page = Adw.NavigationPage(title="Sidebar")
    tv = Adw.ToolbarView()
    hb = Adw.HeaderBar()
    hb.set_show_title(False)
    tv.add_top_bar(hb)
    lb = Gtk.ListBox()
    lb.add_css_class("navigation-sidebar")
    for i, (icon, name) in enumerate([
        ("user-home-symbolic", "Home"),
        ("user-desktop-symbolic", "Desktop"),
        ("folder-documents-symbolic", "Documents"),
        ("folder-download-symbolic", "Downloads"),
        ("folder-music-symbolic", "Music"),
        ("folder-pictures-symbolic", "Pictures"),
        ("user-trash-symbolic", "Trash"),
    ]):
        row = Gtk.Box(spacing=8)
        row.append(Gtk.Image.new_from_icon_name(icon))
        row.append(Gtk.Label(label=name, xalign=0))
        lb.append(row)
        if i == 2:
            lb.select_row(lb.get_row_at_index(i))
    sw = Gtk.ScrolledWindow(vexpand=True)
    sw.set_child(lb)
    tv.set_content(sw)
    page.set_child(tv)
    return page


def build_columnview():
    store = Gio.ListStore(item_type=Gtk.StringObject)
    for s in ("Report.pdf|1.2 MB|PDF document",
              "Notes.txt|4 KB|Plain text",
              "Photos|--|Folder"):
        store.append(Gtk.StringObject.new(s))
    cv = Gtk.ColumnView(show_column_separators=False, show_row_separators=False)
    sort_model = Gtk.SortListModel(model=store, sorter=cv.get_sorter())
    cv.set_model(Gtk.NoSelection(model=sort_model))
    first = None
    for idx, title in enumerate(("Name", "Size", "Kind")):
        fac = Gtk.SignalListItemFactory()
        fac.connect("setup", lambda f, li: li.set_child(Gtk.Label(xalign=0)))
        fac.connect("bind", lambda f, li, i=idx:
                    li.get_child().set_label(li.get_item().get_string().split("|")[i]))
        col = Gtk.ColumnViewColumn(title=title, factory=fac, expand=(idx == 0))
        col.set_sorter(Gtk.CustomSorter.new(
            lambda a, b, _d, i=idx: (a.get_string().split("|")[i] > b.get_string().split("|")[i])
            - (a.get_string().split("|")[i] < b.get_string().split("|")[i]), None))
        cv.append_column(col)
        if first is None:
            first = col
    cv.sort_by_column(first, Gtk.SortType.ASCENDING)
    frame = Gtk.Frame(child=cv)
    return frame


def build_content():
    page = Adw.NavigationPage(title="Documents")
    tv = Adw.ToolbarView()
    hb = Adw.HeaderBar()
    back = Gtk.Box(css_classes=["linked"])
    back.append(Gtk.Button(icon_name="go-previous-symbolic"))
    back.append(Gtk.Button(icon_name="go-next-symbolic"))
    hb.pack_start(back)
    hb.pack_end(Gtk.MenuButton(icon_name="open-menu-symbolic"))
    hb.pack_end(Gtk.Button(icon_name="system-search-symbolic"))
    tv.add_top_bar(hb)

    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14,
                  margin_top=18, margin_bottom=18, margin_start=18, margin_end=18)

    row1 = Gtk.Box(spacing=8)
    row1.append(Gtk.Button(label="Cancel"))
    b = Gtk.Button(label="Save")
    b.add_css_class("suggested-action")
    row1.append(b)
    d = Gtk.Button(label="Delete")
    d.add_css_class("destructive-action")
    row1.append(d)
    f = Gtk.Button(label="Flat")
    f.add_css_class("flat")
    row1.append(f)
    p = Gtk.Button(label="Pill")
    p.add_css_class("pill")
    row1.append(p)
    box.append(row1)

    row2 = Gtk.Box(spacing=8)
    e = Gtk.Entry(placeholder_text="Search", hexpand=True)
    row2.append(e)
    e2 = Gtk.Entry(text="Focused entry", hexpand=True)
    row2.append(e2)
    row2.append(Gtk.DropDown.new_from_strings(["Option one", "Two"]))
    sp = Gtk.SpinButton.new_with_range(0, 100, 1)
    row2.append(sp)
    box.append(row2)

    row3 = Gtk.Box(spacing=16)
    s1 = Gtk.Switch(active=True, valign=Gtk.Align.CENTER)
    row3.append(s1)
    row3.append(Gtk.Switch(valign=Gtk.Align.CENTER))
    row3.append(Gtk.CheckButton(label="Checked", active=True))
    row3.append(Gtk.CheckButton(label="Unchecked"))
    r1 = Gtk.CheckButton(label="Radio", active=True)
    r2 = Gtk.CheckButton(label="Radio 2", group=r1)
    row3.append(r1)
    row3.append(r2)
    box.append(row3)

    sc = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
    sc.set_value(60)
    sc.set_draw_value(False)
    box.append(sc)
    pb = Gtk.ProgressBar(fraction=0.45)
    box.append(pb)

    lb = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE)
    lb.add_css_class("boxed-list")
    r = Adw.SwitchRow(title="Wi-Fi", subtitle="Connected", active=True)
    lb.append(r)
    lb.append(Adw.ActionRow(title="Bluetooth", subtitle="On"))
    er = Adw.EntryRow(title="Name")
    lb.append(er)
    cr = Adw.ComboRow(title="Appearance", model=Gtk.StringList.new(["Auto", "Light", "Dark"]))
    lb.append(cr)
    box.append(lb)

    tabs = Gtk.Box(spacing=8)
    seg = Gtk.Box(css_classes=["linked"])
    t1 = Gtk.ToggleButton(label="Icons", active=True)
    t2 = Gtk.ToggleButton(label="List", group=t1)
    t3 = Gtk.ToggleButton(label="Columns", group=t1)
    for t in (t1, t2, t3):
        seg.append(t)
    tabs.append(seg)
    tabs.append(Gtk.Label(label="Secondary text", css_classes=["dim-label"]))
    tabs.append(Gtk.Label(label="Heading", css_classes=["heading"]))
    box.append(tabs)
    box.append(build_columnview())

    sw = Gtk.ScrolledWindow(vexpand=True)
    sw.set_child(box)
    tv.set_content(sw)
    page.set_child(tv)
    return page, e2


def main():
    app = Adw.Application(application_id="dev.tpct.MacThemeTest")

    def on_activate(app):
        sm = Adw.StyleManager.get_default()
        sm.set_color_scheme(Adw.ColorScheme.FORCE_DARK if scheme == "dark"
                            else Adw.ColorScheme.FORCE_LIGHT)
        prov = Gtk.CssProvider()
        # GTK applies the system color scheme to its own user-CSS provider;
        # a provider created here has to be told explicitly.
        prov.set_property("prefers-color-scheme",
                          Gtk.InterfaceColorScheme.DARK if scheme == "dark"
                          else Gtk.InterfaceColorScheme.LIGHT)
        prov.load_from_path(css_file)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), prov, Gtk.STYLE_PROVIDER_PRIORITY_USER)

        win = Adw.ApplicationWindow(application=app, title="Theme test")
        win.set_default_size(900, 760)
        split = Adw.NavigationSplitView()
        split.set_sidebar(build_sidebar())
        content, focus_entry = build_content()
        split.set_content(content)
        win.set_content(split)
        win.present()
        focus_entry.grab_focus()

        def snap():
            paint = Gtk.WidgetPaintable.new(win)
            w, h = win.get_width(), win.get_height()
            snapshot = Gtk.Snapshot()
            paint.snapshot(snapshot, w, h)
            node = snapshot.to_node()
            renderer = win.get_native().get_renderer()
            tex = renderer.render_texture(node, None)
            tex.save_to_png(out_png)
            app.quit()
            return False

        GLib.timeout_add(900, snap)

    app.connect("activate", on_activate)
    app.run([])


main()
