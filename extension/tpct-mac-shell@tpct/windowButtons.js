// Traffic lights in the menu bar for the focused maximized window, placed
// between the  menu and the application menus.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// macOS restore glyph = two diagonal arrows. WhiteSur maps every *-restore
// name to overlapping windows, so load Adwaita's arrows by path.
const RESTORE_ICON_PATH = '/usr/share/icons/Adwaita/symbolic/actions/view-restore-symbolic.svg';

function restoreIcon() {
    const file = Gio.File.new_for_path(RESTORE_ICON_PATH);
    return file.query_exists(null)
        ? new Gio.FileIcon({file})
        : new Gio.ThemedIcon({name: 'window-restore-symbolic'});
}

export class WindowButtons {
    // onShown(visible) lets the caller hide the  button while these show.
    constructor(onShown = () => {}) {
        this._onShown = onShown;
        this._box = new St.BoxLayout({
            style_class: 'tpct-window-buttons',
            // Track group hover so CSS reveals all three glyphs at once, like macOS.
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        const button = (cls, icon, action) => {
            const b = new St.Button({
                style_class: `tpct-window-button ${cls}`,
                can_focus: false,
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Icon({
                    gicon: icon,
                    style_class: 'tpct-window-button-icon',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                    y_expand: true,
                }),
            });
            b.connect('clicked', () => {
                const w = this._window;
                if (w)
                    action(w);
            });
            this._box.add_child(b);
        };
        button('close', new Gio.ThemedIcon({name: 'window-close-symbolic'}), w => w.delete(global.get_current_time()));
        button('minimize', new Gio.ThemedIcon({name: 'window-minimize-symbolic'}), w => w.minimize());
        button('maximize', restoreIcon(), w => w.unmaximize());

        // At the far left, where the  button sits; it is hidden while these show.
        Main.panel._leftBox.insert_child_at_index(this._box, 0);

        this._windowSignals = [];
        this._focusId = global.display.connect('notify::focus-window', () => this._track());
        this._overviewIds = [
            Main.overview.connect('showing', () => this._sync()),
            Main.overview.connect('hidden', () => this._sync()),
        ];
        this._track();
    }

    _track() {
        this._windowSignals.forEach(([w, id]) => w.disconnect(id));
        this._windowSignals = [];
        let w = global.display.focus_window;
        if (w && (w.skip_taskbar || w.get_window_type() !== Meta.WindowType.NORMAL))
            w = null;
        this._window = w;
        if (w) {
            for (const sig of ['notify::maximized-horizontally', 'notify::maximized-vertically', 'unmanaged']) {
                this._windowSignals.push([w, w.connect(sig, () => {
                    if (sig === 'unmanaged')
                        this._window = null;
                    this._sync();
                })]);
            }
        }
        this._sync();
    }

    // Only windows whose own buttons the theme can hide while maximized: GTK
    // apps and X11 apps framed by GNOME. Apps that draw their own buttons
    // (Electron on Wayland, frameless X11) keep them, so nothing is doubled.
    _ownButtonsHideable(w) {
        if (w.get_client_type() === Meta.WindowClientType.X11)
            return w.decorated;
        return !!w.get_gtk_application_id?.();
    }

    _sync() {
        const w = this._window;
        const visible = !!w && w.is_maximized() && this._ownButtonsHideable(w) && !Main.overview.visible;
        if (visible !== this._box.visible || this._shownOnce !== true) {
            this._box.visible = visible;
            this._shownOnce = true;
            this._onShown(visible);
        }
    }

    destroy() {
        this._onShown(false);
        this._windowSignals.forEach(([w, id]) => w.disconnect(id));
        global.display.disconnect(this._focusId);
        this._overviewIds.forEach(id => Main.overview.disconnect(id));
        this._box.destroy();
    }
}
