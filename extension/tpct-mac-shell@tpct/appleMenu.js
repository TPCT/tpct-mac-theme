// The Apple menu: the  button at the far left of the menu bar, with the
// macOS items in the macOS order, plus a "Force Quit Applications" dialog.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function spawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (e) {
        logError(e, `tpct-mac-shell: cannot run ${argv[0]}`);
    }
}

function launch(...ids) {
    const sys = Shell.AppSystem.get_default();
    for (const id of ids) {
        const app = sys.lookup_app(id);
        if (app) {
            app.activate();
            return true;
        }
    }
    return false;
}

// ───────────────────────── Force Quit Applications ─────────────────────────

const ForceQuitDialog = GObject.registerClass(
class ForceQuitDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({styleClass: 'tpct-force-quit'});

        this.contentLayout.add_child(new St.Label({
            text: 'Force Quit Applications',
            style_class: 'tpct-force-quit-title',
        }));
        const hint = new St.Label({
            text: 'If an app doesn’t respond for a while, select its name and click Force Quit.',
            style_class: 'tpct-force-quit-hint',
        });
        hint.clutter_text.line_wrap = true;
        this.contentLayout.add_child(hint);

        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'tpct-force-quit-list'});
        const scroll = new St.ScrollView({style_class: 'tpct-force-quit-scroll', child: this._list});
        this.contentLayout.add_child(scroll);

        this._selected = null;
        const apps = Shell.AppSystem.get_default().get_running();
        for (const app of apps) {
            const row = new St.Button({style_class: 'tpct-force-quit-row', x_expand: true, can_focus: true});
            const box = new St.BoxLayout({style_class: 'tpct-force-quit-row-box', x_expand: true, x_align: Clutter.ActorAlign.START});
            box.add_child(app.create_icon_texture(20));
            box.add_child(new St.Label({text: app.get_name(), y_align: Clutter.ActorAlign.CENTER}));
            row.set_child(box);
            row.connect('clicked', () => this._select(row, app));
            this._list.add_child(row);
            if (!this._selected)
                this._select(row, app);
        }

        this.addButton({label: 'Cancel', action: () => this.close(), key: Clutter.KEY_Escape});
        this._quitButton = this.addButton({label: 'Force Quit', action: () => this._forceQuit(), default: true});
    }

    _select(row, app) {
        this._list.get_children().forEach(r => r.remove_style_pseudo_class('checked'));
        row.add_style_pseudo_class('checked');
        this._selected = app;
    }

    _forceQuit() {
        const app = this._selected;
        if (app) {
            for (const pid of app.get_pids())
                spawn(['kill', '-9', String(pid)]);
        }
        this.close();
    }
});

// ───────────────────────── Apple menu ─────────────────────────

export const AppleMenu = GObject.registerClass(
class AppleMenu extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Apple Menu', false);
        this.add_style_class_name('tpct-apple-button');
        // WhiteSur's start-here icon is the Apple logo.
        this.add_child(new St.Icon({icon_name: 'start-here-symbolic', style_class: 'tpct-apple-icon'}));
        this.menu.actor.add_style_class_name('tpct-appmenu-menu');

        const item = (label, fn) => {
            const mi = new PopupMenu.PopupMenuItem(label);
            mi.connect('activate', fn);
            this.menu.addMenuItem(mi);
            return mi;
        };
        const sep = () => this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        item('About This Computer', () => spawn(['gnome-control-center', 'system']));
        sep();
        item('System Settings…', () => launch('org.gnome.Settings.desktop'));
        item('App Store…', () => launch('snap-store_snap-store.desktop', 'org.gnome.Software.desktop'));
        sep();
        item('Force Quit…', () => new ForceQuitDialog().open());
        sep();
        item('Sleep', () => spawn(['systemctl', 'suspend']));
        item('Restart…', () => spawn(['gnome-session-quit', '--reboot']));
        item('Shut Down…', () => spawn(['gnome-session-quit', '--power-off']));
        sep();
        item('Lock Screen', () => Main.screenShield.lock(true));
        item(`Log Out ${GLib.get_real_name() || GLib.get_user_name()}…`, () => spawn(['gnome-session-quit', '--logout']));
    }
});
