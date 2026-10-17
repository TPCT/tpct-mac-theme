// The magnifying glass in the menu bar that opens Spotlight (Ulauncher),
// or the overview search when Ulauncher is not installed.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export const SpotlightButton = GObject.registerClass(
class SpotlightButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Spotlight', true);
        this.add_child(new St.Icon({icon_name: 'system-search-symbolic', style_class: 'system-status-icon'}));
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_RELEASE ||
            event.type() === Clutter.EventType.TOUCH_END) {
            if (GLib.find_program_in_path('ulauncher-toggle'))
                GLib.spawn_async(null, ['ulauncher-toggle'], null, GLib.SpawnFlags.SEARCH_PATH, null);
            else
                Main.overview.show();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});
