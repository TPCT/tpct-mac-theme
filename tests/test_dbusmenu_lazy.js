import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {DbusMenuSource} from '../extension/tpct-mac-shell@tpct/menuSources.js';

const iface = 'com.canonical.dbusmenu';
const path = '/com/canonical/menu';
const name = `org.tpct.test.dbusmenu${new Gio.Credentials().get_unix_pid()}`;
const info = Gio.DBusNodeInfo.new_for_xml(`
<node><interface name="${iface}">
  <method name="GetLayout">
    <arg type="i" direction="in"/><arg type="i" direction="in"/>
    <arg type="as" direction="in"/><arg type="u" direction="out"/>
    <arg type="(ia{sv}av)" direction="out"/>
  </method>
  <method name="AboutToShow">
    <arg type="i" direction="in"/><arg type="b" direction="out"/>
  </method>
  <method name="Event">
    <arg type="i" direction="in"/><arg type="s" direction="in"/>
    <arg type="v" direction="in"/><arg type="u" direction="in"/>
  </method>
  <signal name="LayoutUpdated"><arg type="u"/><arg type="i"/></signal>
</interface></node>`).interfaces[0];
const loop = new GLib.MainLoop(null, false);
const calls = new Map();
let revision = 0;
let source = null;
let connection = null;
let registration = 0;
let failure = null;
let passed = false;

function node(id, label, children = null) {
    const props = {label: new GLib.Variant('s', label)};
    if (children !== null)
        props['children-display'] = new GLib.Variant('s', 'submenu');
    return new GLib.Variant('(ia{sv}av)', [id, props, children ?? []]);
}

function check() {
    const top = source.getTopLevel();
    if (top[0]?.label !== 'File' || top[0]?.children[0]?.label !== 'Quit' ||
        top[1]?.label !== 'Edit' || top[1]?.children[0]?.label !== 'Copy')
        return;
    if (calls.get(2) !== 1 || calls.get(3) !== 1 || calls.size !== 2)
        failure = `Unexpected AboutToShow calls: ${JSON.stringify([...calls])}`;
    else
        passed = true;
    loop.quit();
}

const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
    failure = 'Timed out waiting for lazy submenu children';
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
const owner = Gio.bus_own_name(Gio.BusType.SESSION, name, Gio.BusNameOwnerFlags.NONE,
    conn => {
        connection = conn;
        registration = conn.register_object(path, info,
            (bus, sender, objectPath, interfaceName, method, params, invocation) => {
                if (method === 'GetLayout') {
                    const file = node(2, 'File', calls.has(2) ? [node(7, 'Quit')] : []);
                    const edit = node(3, 'Edit', calls.has(3) ? [node(8, 'Copy')] : []);
                    invocation.return_value(new GLib.Variant('(u(ia{sv}av))',
                        [revision, [0, {label: new GLib.Variant('s', 'Root')}, [file, edit]]]));
                } else if (method === 'AboutToShow') {
                    const [id] = params.deepUnpack();
                    calls.set(id, (calls.get(id) ?? 0) + 1);
                    revision++;
                    bus.emit_signal(null, path, iface, 'LayoutUpdated',
                        new GLib.Variant('(ui)', [revision, 0]));
                    invocation.return_value(new GLib.Variant('(b)', [true]));
                } else {
                    failure = `Unexpected prefetch event: ${method}`;
                    invocation.return_value(null);
                    loop.quit();
                }
            }, null, null);
    },
    () => {
        source = new DbusMenuSource(name, path);
        source.onChanged(check);
    },
    () => {
        failure = 'Could not own test bus name';
        loop.quit();
    });
loop.run();
if (passed || failure !== 'Timed out waiting for lazy submenu children')
    GLib.source_remove(timeout);
source?.destroy();
if (registration)
    connection.unregister_object(registration);
Gio.bus_unown_name(owner);
if (!passed || failure) {
    printerr(`FAIL: ${failure ?? 'Lazy submenus did not populate'}`);
    System.exit(1);
}
print('PASS');
