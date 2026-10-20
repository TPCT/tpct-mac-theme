// Menu sources for the global menu.
//
// Both sources produce the same plain tree so the panel only has one renderer:
//   { label, enabled, visible, separator, toggle: null|'check'|'radio',
//     checked, accel, children: [] | null, activate(), aboutToShow() }

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// ───────────────────────── Helpers ─────────────────────────

export function stripMnemonic(label) {
    return (label ?? '').replace(/__/g, '\u0000').replace(/_/g, '').replace(/\u0000/g, '_');
}

const MODIFIER_GLYPHS = {
    // Ctrl does the job of macOS's Command key, so it is shown as ⌘.
    Control: '⌘', Primary: '⌘', Ctrl: '⌘',
    Shift: '⇧', Alt: '⌥', Super: '⌃', Meta: '⌃',
};

// "<Primary><Shift>s" (GTK accel) → "⌃⇧S"
export function formatGtkAccel(accel) {
    if (!accel)
        return '';
    let out = '';
    const re = /<([^>]+)>/g;
    let m;
    let last = 0;
    while ((m = re.exec(accel)) !== null) {
        out += MODIFIER_GLYPHS[m[1]] ?? '';
        last = re.lastIndex;
    }
    return out + prettyKey(accel.slice(last));
}

// [["Control", "S"]] (dbusmenu shortcut) → "⌃S"
function formatDbusShortcut(shortcut) {
    if (!shortcut?.length)
        return '';
    const keys = shortcut[0];
    return keys.map((k, i) => (i < keys.length - 1 ? MODIFIER_GLYPHS[k] ?? '' : prettyKey(k))).join('');
}

function prettyKey(key) {
    const names = {
        Return: '↩', Delete: '⌦', BackSpace: '⌫', Escape: '⎋', Tab: '⇥',
        Left: '←', Right: '→', Up: '↑', Down: '↓', space: 'Space',
        plus: '+', minus: '-', equal: '=', comma: ',', period: '.',
    };
    if (names[key])
        return names[key];
    return key.length === 1 ? key.toUpperCase() : key;
}

// ───────────────────────── GTK (GMenuModel over D-Bus) ─────────────────────────

export class GtkMenuSource {
    constructor(window) {
        this._bus = window.get_gtk_unique_bus_name();
        this._menubarPath = window.get_gtk_menubar_object_path();
        const appPath = window.get_gtk_application_object_path();
        const winPath = window.get_gtk_window_object_path();
        const conn = Gio.DBus.session;
        this._model = Gio.DBusMenuModel.get(conn, this._bus, this._menubarPath);
        this._groups = {
            app: appPath ? Gio.DBusActionGroup.get(conn, this._bus, appPath) : null,
            win: winPath ? Gio.DBusActionGroup.get(conn, this._bus, winPath) : null,
        };
        // Action groups only fetch their state once someone listens to them.
        this._groupIds = [];
        for (const g of Object.values(this._groups)) {
            if (g)
                this._groupIds.push([g, g.connect('action-added', () => {})]);
        }
        this._changedCallbacks = [];
        this._modelIds = [];
        this._watch(this._model);
    }

    static supports(window) {
        return !!(window.get_gtk_menubar_object_path?.() && window.get_gtk_unique_bus_name?.());
    }

    get key() {
        return `gtk:${this._bus}:${this._menubarPath}`;
    }

    onChanged(cb) {
        this._changedCallbacks.push(cb);
    }

    _emitChanged() {
        if (this._changedId)
            return;
        this._changedId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._changedId = 0;
            this._changedCallbacks.forEach(cb => cb());
            return GLib.SOURCE_REMOVE;
        });
    }

    _watch(model) {
        if (this._modelIds.some(([m]) => m === model))
            return;
        this._modelIds.push([model, model.connect('items-changed', () => this._emitChanged())]);
        // DBusMenuModel only subscribes to a menu once its items are queried.
        model.get_n_items();
    }

    _splitAction(name) {
        const dot = name.indexOf('.');
        if (dot < 0)
            return [null, name];
        return [this._groups[name.slice(0, dot)] ?? null, name.slice(dot + 1)];
    }

    _convert(model) {
        this._watch(model);
        const items = [];
        const n = model.get_n_items();
        for (let i = 0; i < n; i++) {
            const section = model.get_item_link(i, Gio.MENU_LINK_SECTION);
            if (section) {
                const children = this._convert(section);
                if (children.length) {
                    if (items.length && !items[items.length - 1].separator)
                        items.push({separator: true, visible: true});
                    items.push(...children);
                    items.push({separator: true, visible: true});
                }
                continue;
            }
            const str = attr => model.get_item_attribute_value(i, attr, GLib.VariantType.new('s'))?.unpack() ?? null;
            const hidden = model.get_item_attribute_value(i, 'hidden-when', null);
            const label = stripMnemonic(str('label'));
            const actionName = str('action');
            const target = model.get_item_attribute_value(i, 'target', null);
            const submenu = model.get_item_link(i, Gio.MENU_LINK_SUBMENU);

            const item = {label, visible: true, enabled: true, separator: false, toggle: null,
                checked: false, accel: formatGtkAccel(str('accel')), children: null};

            if (submenu) {
                item.children = this._convert(submenu);
            } else if (actionName) {
                const [group, name] = this._splitAction(actionName);
                if (group) {
                    item.enabled = group.has_action(name) ? group.get_action_enabled(name) : false;
                    if (hidden && !group.has_action(name))
                        item.visible = false;
                    const state = group.has_action(name) ? group.get_action_state(name) : null;
                    if (state) {
                        if (state.get_type_string() === 'b') {
                            item.toggle = 'check';
                            item.checked = state.unpack();
                        } else if (target) {
                            item.toggle = 'radio';
                            item.checked = state.equal(target);
                        }
                    }
                    item.activate = () => group.activate_action(name, target);
                } else {
                    item.enabled = false;
                }
            }
            items.push(item);
        }
        while (items.length && items[items.length - 1].separator)
            items.pop();
        return items;
    }

    getTopLevel() {
        return this._convert(this._model);
    }

    destroy() {
        if (this._changedId)
            GLib.source_remove(this._changedId);
        this._modelIds.forEach(([m, id]) => m.disconnect(id));
        this._groupIds.forEach(([g, id]) => g.disconnect(id));
        this._changedCallbacks = [];
    }
}

// ───────────────────────── DBusMenu (com.canonical.dbusmenu) ─────────────────────────

const DBUSMENU_IFACE = 'com.canonical.dbusmenu';

export class DbusMenuSource {
    constructor(service, path) {
        this._service = service;
        this._path = path;
        this._layout = null;
        this._prefetched = new Set();
        this._changedCallbacks = [];
        const conn = Gio.DBus.session;
        this._signalIds = ['LayoutUpdated', 'ItemsPropertiesUpdated'].map(sig =>
            conn.signal_subscribe(service, DBUSMENU_IFACE, sig, path, null,
                Gio.DBusSignalFlags.NONE, () => this.refresh()));
        this.refresh();
    }

    get key() {
        return `dbusmenu:${this._service}:${this._path}`;
    }

    onChanged(cb) {
        this._changedCallbacks.push(cb);
    }

    _call(method, params, replyType) {
        return new Promise((resolve, reject) => {
            Gio.DBus.session.call(this._service, this._path, DBUSMENU_IFACE, method, params,
                replyType ? GLib.VariantType.new(replyType) : null, Gio.DBusCallFlags.NONE, 2000, null,
                (conn, res) => {
                    try {
                        resolve(conn.call_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
        });
    }

    async refresh() {
        try {
            const reply = await this._call('GetLayout',
                new GLib.Variant('(iias)', [0, -1, []]), '(u(ia{sv}av))');
            const [, layout] = reply.recursiveUnpack();
            this._layout = layout;
            if (!this._refreshQueued) {
                this._refreshQueued = true;
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._refreshQueued = false;
                    this._changedCallbacks.forEach(cb => cb());
                    return GLib.SOURCE_REMOVE;
                });
            }
            const pending = [];
            const prefetch = ([id, props, children]) => {
                if (props['children-display'] === 'submenu' && !children.length &&
                    !this._prefetched.has(id)) {
                    this._prefetched.add(id);
                    pending.push(this._call('AboutToShow', new GLib.Variant('(i)', [id]), '(b)')
                        .catch(() => {}));
                }
                children.forEach(prefetch);
            };
            prefetch(layout);
            if (pending.length) {
                await Promise.all(pending);
                await this.refresh();
            }
        } catch (e) {
            // The application went away or does not implement the interface.
        }
    }

    _sendEvent(id, event) {
        this._call('Event', new GLib.Variant('(isvu)',
            [id, event, new GLib.Variant('i', 0), Math.floor(Date.now() / 1000)]), null).catch(() => {});
    }

    _convertNode(node) {
        const [id, props, children] = node;
        const type = props.type ?? 'standard';
        const item = {
            label: stripMnemonic(props.label ?? ''),
            visible: props.visible ?? true,
            enabled: props.enabled ?? true,
            separator: type === 'separator',
            toggle: props['toggle-type'] === 'checkmark' ? 'check'
                : props['toggle-type'] === 'radio' ? 'radio' : null,
            checked: props['toggle-state'] === 1,
            accel: formatDbusShortcut(props.shortcut),
            children: null,
        };
        if (props['children-display'] === 'submenu' || children.length) {
            item.children = children.map(c => this._convertNode(c));
            item.aboutToShow = async () => {
                try {
                    await this._call('AboutToShow', new GLib.Variant('(i)', [id]), '(b)');
                    this._sendEvent(id, 'opened');
                } catch (e) {}
                await this.refresh();
            };
        } else {
            item.activate = () => this._sendEvent(id, 'clicked');
        }
        return item;
    }

    getTopLevel() {
        if (!this._layout)
            return [];
        return this._layout[2].map(c => this._convertNode(c));
    }

    destroy() {
        this._signalIds.forEach(id => Gio.DBus.session.signal_unsubscribe(id));
        this._changedCallbacks = [];
    }
}

// ───────────────────────── AppMenu registrar ─────────────────────────
// X11 applications (Electron, Chromium, JetBrains, LibreOffice, Qt under
// XWayland) announce their dbusmenu here, keyed by X window id.

const REGISTRAR_XML = `
<node>
  <interface name="com.canonical.AppMenu.Registrar">
    <method name="RegisterWindow">
      <arg type="u" name="windowId" direction="in"/>
      <arg type="o" name="menuObjectPath" direction="in"/>
    </method>
    <method name="UnregisterWindow">
      <arg type="u" name="windowId" direction="in"/>
    </method>
    <method name="GetMenuForWindow">
      <arg type="u" name="windowId" direction="in"/>
      <arg type="s" name="service" direction="out"/>
      <arg type="o" name="menuObjectPath" direction="out"/>
    </method>
    <signal name="WindowRegistered">
      <arg type="u" name="windowId"/>
      <arg type="s" name="service"/>
      <arg type="o" name="menuObjectPath"/>
    </signal>
    <signal name="WindowUnregistered">
      <arg type="u" name="windowId"/>
    </signal>
  </interface>
</node>`;

export class AppMenuRegistrar {
    constructor(onChanged) {
        this._menus = new Map(); // xid → {service, path}
        this._onChanged = onChanged;
        this._dbus = Gio.DBusExportedObject.wrapJSObject(REGISTRAR_XML, this);
        this._dbus.export(Gio.DBus.session, '/com/canonical/AppMenu/Registrar');
        this._nameId = Gio.bus_own_name_on_connection(Gio.DBus.session,
            'com.canonical.AppMenu.Registrar', Gio.BusNameOwnerFlags.REPLACE, null, null);
        this._watches = new Map(); // service → watch id
    }

    RegisterWindowAsync([windowId, path], invocation) {
        const service = invocation.get_sender();
        this._menus.set(windowId, {service, path});
        if (!this._watches.has(service)) {
            this._watches.set(service, Gio.bus_watch_name_on_connection(Gio.DBus.session, service,
                Gio.BusNameWatcherFlags.NONE, null, () => this._dropService(service)));
        }
        this._dbus.emit_signal('WindowRegistered', new GLib.Variant('(uso)', [windowId, service, path]));
        invocation.return_value(null);
        this._onChanged();
    }

    UnregisterWindowAsync([windowId], invocation) {
        this._menus.delete(windowId);
        this._dbus.emit_signal('WindowUnregistered', new GLib.Variant('(u)', [windowId]));
        invocation.return_value(null);
        this._onChanged();
    }

    GetMenuForWindowAsync([windowId], invocation) {
        const m = this._menus.get(windowId);
        if (!m) {
            invocation.return_dbus_error('com.canonical.AppMenu.Registrar.Error.NotFound', 'No menu');
            return;
        }
        invocation.return_value(new GLib.Variant('(so)', [m.service, m.path]));
    }

    _dropService(service) {
        for (const [xid, m] of this._menus) {
            if (m.service === service)
                this._menus.delete(xid);
        }
        const id = this._watches.get(service);
        if (id)
            Gio.bus_unwatch_name(id);
        this._watches.delete(service);
        this._onChanged();
    }

    lookup(window) {
        const desc = window.get_description?.() ?? '';
        const m = desc.match(/0x[0-9a-f]+/i);
        if (!m)
            return null;
        return this._menus.get(parseInt(m[0], 16)) ?? null;
    }

    destroy() {
        this._watches.forEach(id => Gio.bus_unwatch_name(id));
        this._watches.clear();
        Gio.bus_unown_name(this._nameId);
        this._dbus.unexport();
        this._menus.clear();
    }
}
