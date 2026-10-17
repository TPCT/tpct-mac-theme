// TPCT Mac Shell — macOS-style menu bar for GNOME Shell.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {AppMenuRegistrar, DbusMenuSource, GtkMenuSource} from './menuSources.js';
import {DesktopWidgets} from './widgets.js';
import {AppleMenu} from './appleMenu.js';

const FINDER_IDS = ['org.gnome.Nautilus.desktop', 'nautilus.desktop'];

// ───────────────────────── Keyboard helper ─────────────────────────
// Generic Edit menu entries work in any app by replaying the shortcut.

let virtualKeyboard = null;

function sendShortcut(keyval, mods = []) {
    if (!virtualKeyboard) {
        const seat = Clutter.get_default_backend().get_default_seat();
        virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    const modKeys = {ctrl: Clutter.KEY_Control_L, shift: Clutter.KEY_Shift_L, alt: Clutter.KEY_Alt_L};
    // Wait for the menu to close and focus to return to the window.
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
        const t = GLib.get_monotonic_time();
        mods.forEach(m => virtualKeyboard.notify_keyval(t, modKeys[m], Clutter.KeyState.PRESSED));
        virtualKeyboard.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
        virtualKeyboard.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
        mods.reverse().forEach(m => virtualKeyboard.notify_keyval(t, modKeys[m], Clutter.KeyState.RELEASED));
        return GLib.SOURCE_REMOVE;
    });
}

function openUri(uri) {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    } catch (e) {
        logError(e, 'tpct-mac-shell: cannot open ' + uri);
    }
}

function userDir(dir) {
    const path = GLib.get_user_special_dir(dir);
    return path ? Gio.File.new_for_path(path).get_uri() : null;
}

// ───────────────────────── Menu bar button ─────────────────────────

const MenuBarButton = GObject.registerClass(
class MenuBarButton extends PanelMenu.Button {
    _init(label, bold) {
        super._init(0.0, label, false);
        this.add_style_class_name('tpct-appmenu-item');
        this._label = new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: bold ? 'tpct-appmenu-name' : 'tpct-appmenu-label',
        });
        this.add_child(this._label);
        this.menu.actor.add_style_class_name('tpct-appmenu-menu');
    }
});

// Fill a PopupMenu from the plain item tree produced by menuSources.js.
function fillMenu(menu, items) {
    menu.removeAll();
    let lastWasSeparator = true;
    for (const item of items) {
        if (item.visible === false)
            continue;
        if (item.separator) {
            if (!lastWasSeparator)
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            lastWasSeparator = true;
            continue;
        }
        lastWasSeparator = false;

        if (item.children) {
            const sub = new PopupMenu.PopupSubMenuMenuItem(item.label);
            sub.setSensitive(item.enabled !== false);
            fillMenu(sub.menu, item.children);
            if (item.aboutToShow) {
                sub.menu.connect('open-state-changed', (m, open) => {
                    if (open)
                        item.aboutToShow();
                });
            }
            menu.addMenuItem(sub);
            continue;
        }

        const mi = new PopupMenu.PopupMenuItem(item.label);
        if (item.accel) {
            mi.add_child(new St.Label({
                text: item.accel,
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'tpct-accel',
            }));
        }
        if (item.toggle === 'check')
            mi.setOrnament(item.checked ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        else if (item.toggle === 'radio')
            mi.setOrnament(item.checked ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);
        mi.setSensitive(item.enabled !== false && !!item.activate);
        if (item.activate)
            mi.connect('activate', () => item.activate());
        menu.addMenuItem(mi);
    }
    // Drop a trailing separator
    const children = menu._getMenuItems();
    const last = children[children.length - 1];
    if (last instanceof PopupMenu.PopupSeparatorMenuItem)
        last.destroy();
}

// ───────────────────────── Global menu ─────────────────────────

class GlobalMenu {
    constructor() {
        this._buttons = [];
        this._source = null;
        this._registrar = new AppMenuRegistrar(() => this._queueUpdate());
        this._tracker = Shell.WindowTracker.get_default();

        this._box = new St.BoxLayout({style_class: 'tpct-appmenu-box', y_expand: true});
        Main.panel._leftBox.add_child(this._box);

        this._signals = [
            [global.display, global.display.connect('notify::focus-window', () => this._queueUpdate())],
            [this._tracker, this._tracker.connect('notify::focus-app', () => this._queueUpdate())],
            [Main.overview, Main.overview.connect('showing', () => this._queueUpdate())],
            [Main.overview, Main.overview.connect('hidden', () => this._queueUpdate())],
        ];
        this._update();
    }

    _queueUpdate() {
        if (this._updateId)
            return;
        this._updateId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._updateId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _anyMenuOpen() {
        return this._buttons.some(b => b.menu.isOpen);
    }

    _sourceFor(window) {
        if (!window)
            return null;
        try {
            if (GtkMenuSource.supports(window))
                return new GtkMenuSource(window);
            const reg = this._registrar.lookup(window);
            if (reg)
                return new DbusMenuSource(reg.service, reg.path);
        } catch (e) {
            logError(e, 'tpct-mac-shell: menu source');
        }
        return null;
    }

    _update() {
        let window = global.display.focus_window;
        if (window && (window.skip_taskbar || window.get_window_type() === Meta.WindowType.DESKTOP))
            window = null;
        if (Main.overview.visible)
            window = null;
        const app = window ? this._tracker.get_window_app(window) : null;

        this._window = window;
        this._app = app;

        const source = this._sourceFor(window);
        if (source && this._source && source.key === this._source.key) {
            source.destroy();
        } else {
            this._source?.destroy();
            this._source = source;
            this._source?.onChanged(() => this._onSourceChanged());
        }
        this._rebuild();
    }

    _onSourceChanged() {
        if (!this._anyMenuOpen()) {
            this._rebuild();
            return;
        }
        // Keep the open menu open: refresh its contents in place.
        const top = this._appTopLevel();
        for (const b of this._buttons) {
            if (b.menu.isOpen && b._tpctIndex !== undefined && top[b._tpctIndex])
                fillMenu(b.menu, top[b._tpctIndex].children ?? []);
        }
        this._dirty = true;
    }

    _appTopLevel() {
        const top = this._source?.getTopLevel() ?? [];
        // Flatten: only submenus make sense in a menu bar.
        return top.filter(i => i.visible !== false && i.children);
    }

    _isFinder() {
        return !this._app || FINDER_IDS.includes(this._app.get_id());
    }

    _appName() {
        if (this._isFinder())
            return 'Finder';
        return this._app.get_name();
    }

    _clear() {
        for (const b of this._buttons) {
            Main.panel.menuManager.removeMenu(b.menu);
            b.destroy();
        }
        this._buttons = [];
    }

    _addButton(label, items, {bold = false, index} = {}) {
        const b = new MenuBarButton(label, bold);
        fillMenu(b.menu, items);
        b._tpctIndex = index;
        b.menu.connect('open-state-changed', (m, open) => {
            if (open) {
                const top = this._appTopLevel();
                if (index !== undefined && top[index]?.aboutToShow)
                    top[index].aboutToShow();
            } else if (this._dirty && !this._anyMenuOpen()) {
                this._dirty = false;
                this._queueRebuild();
            }
        });
        this._box.add_child(b.container);
        Main.panel.menuManager.addMenu(b.menu);
        this._buttons.push(b);
        return b;
    }

    _queueRebuild() {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (!this._anyMenuOpen())
                this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuild() {
        this._clear();
        const name = this._appName();
        const top = this._appTopLevel();
        const titles = new Set(top.map(t => t.label.toLowerCase()));

        // Apps often export their own "<App name>" menu (Electron does). macOS has a
        // single application menu, so fold it into ours instead of showing it twice.
        let appItems = this._applicationMenu(name);
        let appMenuIndex = -1;
        const norm = t => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (top.length && this._app) {
            const a = norm(name), b = norm(top[0].label);
            if (b.length > 2 && (a === b || a.includes(b) || b.includes(a))) {
                appItems = [...top[0].children, {separator: true}, ...appItems];
                appMenuIndex = 0;
            }
        }
        this._addButton(name, appItems, {bold: true, index: appMenuIndex >= 0 ? appMenuIndex : undefined});

        if (this._isFinder() && !top.length) {
            this._addButton('File', this._finderFileMenu());
            this._addButton('Edit', this._editMenu());
            this._addButton('View', this._viewMenu());
            this._addButton('Go', this._finderGoMenu());
            this._addButton('Window', this._windowMenu());
            return;
        }

        if (!top.length) {
            // App does not export a menu: give it the standard macOS set.
            this._addButton('File', this._fileMenu());
            this._addButton('Edit', this._editMenu());
            this._addButton('View', this._viewMenu());
            this._addButton('Window', this._windowMenu());
            return;
        }

        top.forEach((item, i) => {
            if (i !== appMenuIndex)
                this._addButton(item.label, item.children, {index: i});
        });
        if (!titles.has('window'))
            this._addButton('Window', this._windowMenu());
    }

    // ── Standard menus ──

    _appWindows() {
        return this._app ? this._app.get_windows().filter(w => !w.skip_taskbar) : [];
    }

    _applicationMenu(name) {
        if (this._isFinder() && !this._app) {
            return [
                {label: 'About This Computer', activate: () => openUri('gnome-control-center://system')},
                {separator: true},
                {label: 'Settings…', accel: '⌘,', activate: () => Shell.AppSystem.get_default()
                    .lookup_app('org.gnome.Settings.desktop')?.activate()},
                {separator: true},
                {label: 'Empty Trash…', activate: () => openUri('trash:///')},
            ];
        }
        return [
            {label: `Hide ${name}`, accel: '⌘H', activate: () => this._appWindows().forEach(w => w.minimize())},
            {label: 'Hide Others', activate: () => {
                const ws = global.workspace_manager.get_active_workspace();
                ws.list_windows().forEach(w => {
                    if (this._tracker.get_window_app(w) !== this._app && !w.skip_taskbar)
                        w.minimize();
                });
            }},
            {label: 'Show All', activate: () => {
                const ws = global.workspace_manager.get_active_workspace();
                ws.list_windows().forEach(w => w.minimized && w.unminimize());
            }},
            {separator: true},
            {label: `Quit ${name}`, accel: '⌘Q', activate: () => this._app?.request_quit()},
        ];
    }

    _fileMenu() {
        return [
            {label: 'New Window', accel: '⌘N', enabled: !!this._app?.can_open_new_window(),
                activate: () => this._app?.open_new_window(-1)},
            {separator: true},
            {label: 'Close Window', accel: '⌘W', enabled: !!this._window,
                activate: () => this._window?.delete(global.get_current_time())},
        ];
    }

    _editMenu() {
        const K = Clutter;
        return [
            {label: 'Undo', accel: '⌘Z', activate: () => sendShortcut(K.KEY_z, ['ctrl'])},
            {label: 'Redo', accel: '⇧⌘Z', activate: () => sendShortcut(K.KEY_z, ['ctrl', 'shift'])},
            {separator: true},
            {label: 'Cut', accel: '⌘X', activate: () => sendShortcut(K.KEY_x, ['ctrl'])},
            {label: 'Copy', accel: '⌘C', activate: () => sendShortcut(K.KEY_c, ['ctrl'])},
            {label: 'Paste', accel: '⌘V', activate: () => sendShortcut(K.KEY_v, ['ctrl'])},
            {label: 'Select All', accel: '⌘A', activate: () => sendShortcut(K.KEY_a, ['ctrl'])},
            {separator: true},
            {label: 'Find', accel: '⌘F', activate: () => sendShortcut(K.KEY_f, ['ctrl'])},
            {separator: true},
            {label: 'Emoji & Symbols', accel: '⌘.', activate: () => sendShortcut(K.KEY_period, ['ctrl'])},
        ];
    }

    _viewMenu() {
        const w = this._window;
        return [
            {label: w?.is_fullscreen() ? 'Exit Full Screen' : 'Enter Full Screen', accel: 'F11', enabled: !!w,
                activate: () => (w.is_fullscreen() ? w.unmake_fullscreen() : w.make_fullscreen())},
        ];
    }

    _windowMenu() {
        const w = this._window;
        const items = [
            {label: 'Minimize', accel: '⌘M', enabled: !!w?.can_minimize(), activate: () => w.minimize()},
            {label: 'Zoom', enabled: !!w?.can_maximize(), activate: () => {
                if (w.is_maximized())
                    w.unmaximize();
                else
                    w.maximize();
            }},
            {separator: true},
            {label: 'Bring All to Front', enabled: !!this._app, activate: () => this._app?.activate()},
        ];
        const wins = this._appWindows();
        if (wins.length) {
            items.push({separator: true});
            for (const win of wins) {
                items.push({label: win.get_title() || this._appName(), toggle: 'check', checked: win === w,
                    activate: () => Main.activateWindow(win)});
            }
        }
        return items;
    }

    _finderFileMenu() {
        const files = () => Shell.AppSystem.get_default().lookup_app('org.gnome.Nautilus.desktop');
        return [
            {label: 'New Finder Window', accel: '⌘N', activate: () => files()?.open_new_window(-1)},
            {separator: true},
            {label: 'Find', accel: '⌘F', activate: () => Main.overview.show()},
        ];
    }

    _finderGoMenu() {
        const D = GLib.UserDirectory;
        const home = Gio.File.new_for_path(GLib.get_home_dir()).get_uri();
        const go = [
            ['Recents', 'recent:///'],
            ['Documents', userDir(D.DIRECTORY_DOCUMENTS)],
            ['Desktop', userDir(D.DIRECTORY_DESKTOP)],
            ['Downloads', userDir(D.DIRECTORY_DOWNLOAD)],
            ['Home', home],
            ['Computer', 'file:///'],
            ['Network', 'network:///'],
        ];
        return [
            {label: 'Back', accel: '⌘[', activate: () => sendShortcut(Clutter.KEY_Left, ['alt'])},
            {label: 'Forward', accel: '⌘]', activate: () => sendShortcut(Clutter.KEY_Right, ['alt'])},
            {separator: true},
            ...go.filter(([, uri]) => uri).map(([label, uri]) => ({label, activate: () => openUri(uri)})),
            {label: 'Applications', accel: '⇧⌘A', activate: () => Main.overview.showApps()},
            {separator: true},
            {label: 'Trash', activate: () => openUri('trash:///')},
        ];
    }

    destroy() {
        if (this._updateId)
            GLib.source_remove(this._updateId);
        this._signals.forEach(([obj, id]) => obj.disconnect(id));
        this._clear();
        this._source?.destroy();
        this._registrar.destroy();
        this._box.destroy();
    }
}

// ───────────────────────── Extension ─────────────────────────

export default class TpctMacShell extends Extension {
    enable() {
        // Clock on the right, like the macOS menu bar.
        const dateMenu = Main.panel.statusArea.dateMenu;
        this._dateParent = dateMenu.container.get_parent();
        this._dateIndex = this._dateParent.get_children().indexOf(dateMenu.container);
        this._dateParent.remove_child(dateMenu.container);
        Main.panel._rightBox.add_child(dateMenu.container);

        // No Activities pill; the Apple menu / hot corner replace it.
        this._activities = Main.panel.statusArea.activities;
        this._activities?.container.hide();

        //  menu first, then the app menus.
        this._appleMenu = new AppleMenu();
        Main.panel.addToStatusArea('tpctAppleMenu', this._appleMenu, 0, 'left');
        // Logo Menu draws a second  button; hide it whenever it shows up.
        // Dash2Dock Animated is the macOS dock (magnification); when it runs,
        // switch the Ubuntu dock off so there is only one.
        const syncExtensions = () => {
            Main.panel.statusArea.LogoMenu?.container.hide();
            const mgr = Main.extensionManager;
            const d2d = mgr.lookup('dash2dock-lite@icedman.github.com');
            const ubuntuDock = mgr.lookup('ubuntu-dock@ubuntu.com');
            if (d2d?.state === 1 && ubuntuDock?.state === 1)
                mgr.disableExtension('ubuntu-dock@ubuntu.com');
        };
        syncExtensions();
        this._extStateId = Main.extensionManager.connect('extension-state-changed', syncExtensions);

        this._globalMenu = new GlobalMenu();
        this._widgets = new DesktopWidgets();

        // Volume/brightness pop-ups at the top right, below the menu bar (macOS Tahoe).
        const osd = Main.osdWindowManager;
        this._osdShow = osd._showOsdWindow;
        const origShow = this._osdShow;
        osd._showOsdWindow = function (monitorIndex, ...args) {
            const w = this._osdWindows[monitorIndex];
            if (w) {
                w.x_align = Clutter.ActorAlign.END;
                w.y_align = Clutter.ActorAlign.START;
            }
            return origShow.call(this, monitorIndex, ...args);
        };

        // Notification banners slide in at the top right, like macOS.
        this._bannerBin = Main.messageTray._bannerBin;
        this._bannerAlign = this._bannerBin?.x_align;
        if (this._bannerBin)
            this._bannerBin.x_align = Clutter.ActorAlign.END;

        // Follow the system Light/Dark switch, like macOS Appearance.
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._schemeId = this._interface.connect('changed::color-scheme', () => this._syncVariant());
        this._syncVariant();
    }

    _syncVariant() {
        const dark = this._interface.get_string('color-scheme') === 'prefer-dark';
        const variant = dark ? 'Dark' : 'Light';
        const schema = Gio.SettingsSchemaSource.get_default()
            .lookup('org.gnome.shell.extensions.user-theme', true);
        if (schema) {
            const settings = new Gio.Settings({settings_schema: schema});
            if (settings.get_string('name').startsWith('TPCT-Mac'))
                settings.set_string('name', `TPCT-Mac-${variant}`);
        }
        if (this._interface.get_string('gtk-theme').startsWith('TPCT-Mac'))
            this._interface.set_string('gtk-theme', `TPCT-Mac-${variant}`);
        if (this._interface.get_string('icon-theme').startsWith('WhiteSur'))
            this._interface.set_string('icon-theme', dark ? 'WhiteSur-dark' : 'WhiteSur-light');

        // Other extensions keep their own colors; keep them in step.
        const extSettings = (uuid, schemaId) => {
            const ext = Main.extensionManager.lookup(uuid);
            if (!ext)
                return null;
            try {
                const src = Gio.SettingsSchemaSource.new_from_directory(
                    `${ext.path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
                const schema = src.lookup(schemaId, true);
                return schema ? new Gio.Settings({settings_schema: schema}) : null;
            } catch (e) {
                return null;
            }
        };
        const tuple = (...v) => new GLib.Variant('(dddd)', v);
        const d2d = extSettings('dash2dock-lite@icedman.github.com', 'org.gnome.shell.extensions.dash2dock-lite');
        if (d2d) {
            d2d.set_value('background-color', dark ? tuple(0.17, 0.17, 0.19, 0.55) : tuple(0.97, 0.97, 0.98, 0.55));
            d2d.set_value('running-indicator-color', dark ? tuple(1, 1, 1, 0.85) : tuple(0, 0, 0, 0.75));
        }
        // Blur my Shell would replace the menu bar's background with a darkened
        // blur; let the theme's frosted bar show and brighten the blur in Light.
        const bmsPanel = extSettings('blur-my-shell@aunetx', 'org.gnome.shell.extensions.blur-my-shell.panel');
        if (bmsPanel) {
            bmsPanel.set_boolean('override-background', false);
            bmsPanel.set_double('brightness', dark ? 0.6 : 1.0);
        }

        // Qt (Kvantum) and Spotlight (Ulauncher) themes
        const config = GLib.get_user_config_dir();
        const kv = GLib.build_filenamev([config, 'Kvantum', 'kvantum.kvconfig']);
        if (GLib.file_test(kv, GLib.FileTest.EXISTS)) {
            const [, bytes] = GLib.file_get_contents(kv);
            if (new TextDecoder().decode(bytes).includes('TPCT-Mac'))
                GLib.file_set_contents(kv, `[General]\ntheme=TPCT-Mac-${variant}\n`);
        }
        const ul = GLib.build_filenamev([config, 'ulauncher', 'settings.json']);
        if (GLib.file_test(ul, GLib.FileTest.EXISTS)) {
            try {
                const [, bytes] = GLib.file_get_contents(ul);
                const data = JSON.parse(new TextDecoder().decode(bytes));
                if (String(data['theme-name'] ?? '').startsWith('tpct-spotlight')) {
                    data['theme-name'] = `tpct-spotlight-${variant.toLowerCase()}`;
                    GLib.file_set_contents(ul, JSON.stringify(data, null, 4));
                }
            } catch (e) {}
        }
    }

    disable() {
        if (this._osdShow) {
            Main.osdWindowManager._showOsdWindow = this._osdShow;
            for (const w of Main.osdWindowManager._osdWindows) {
                if (w) {
                    w.x_align = Clutter.ActorAlign.CENTER;
                    w.y_align = Clutter.ActorAlign.END;
                }
            }
        }
        this._osdShow = null;

        if (this._bannerBin)
            this._bannerBin.x_align = this._bannerAlign;
        this._bannerBin = null;

        if (this._schemeId)
            this._interface.disconnect(this._schemeId);
        this._schemeId = 0;
        this._interface = null;

        this._widgets?.destroy();
        this._widgets = null;
        this._appleMenu?.destroy();
        this._appleMenu = null;
        if (this._extStateId)
            Main.extensionManager.disconnect(this._extStateId);
        this._extStateId = 0;
        Main.panel.statusArea.LogoMenu?.container.show();
        this._globalMenu?.destroy();
        this._globalMenu = null;

        this._activities?.container.show();
        this._activities = null;

        const dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu && this._dateParent) {
            dateMenu.container.get_parent()?.remove_child(dateMenu.container);
            this._dateParent.insert_child_at_index(dateMenu.container, this._dateIndex);
        }
        this._dateParent = null;

        if (virtualKeyboard) {
            virtualKeyboard.run_dispose();
            virtualKeyboard = null;
        }
    }
}
