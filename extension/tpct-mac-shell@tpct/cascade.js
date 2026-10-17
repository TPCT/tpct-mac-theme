// macOS-style cascading submenus for the global menu: a submenu opens to the
// side of its item on hover, instead of expanding inline.
//
// GNOME Shell grabs input on the open menu only, so while a submenu is open we
// take a modal grab on the whole UI group (which contains both menus) and close
// everything ourselves on clicks outside the menus or Escape.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class CascadeController {
    constructor(rootMenu) {
        this._root = rootMenu;
        this._stack = []; // open submenus, outermost first
        this._rootId = rootMenu.connect('open-state-changed', (m, open) => {
            if (!open)
                this.closeAll(false);
        });
    }

    get depth() {
        return this._stack.length;
    }

    // Open `menu` as the submenu at `level` (0 = child of the root menu).
    open(menu, level) {
        this.closeFrom(level);
        menu.open(BoxPointer.PopupAnimation.NONE);
        this._stack.push(menu);
        if (!this._grab) {
            // Clicks on non-reactive areas (the desktop) would be lost under the
            // grab, so a transparent catcher below the menus receives them.
            this._catcher = new St.Widget({
                reactive: true,
                x: 0, y: 0,
                width: global.stage.width,
                height: global.stage.height,
            });
            this._catcher.connect('button-press-event', () => {
                this.closeAll(true);
                return Clutter.EVENT_STOP;
            });
            Main.uiGroup.insert_child_below(this._catcher, this._root.actor);
            this._grab = Main.pushModal(Main.uiGroup, {actionMode: Shell.ActionMode.POPUP});
            this._capturedId = Main.uiGroup.connect('captured-event', (a, event) => this._onEvent(event));
        }
    }

    // Close submenus at `level` and deeper.
    closeFrom(level) {
        while (this._stack.length > level)
            this._stack.pop().close(BoxPointer.PopupAnimation.NONE);
        if (this._stack.length === 0)
            this._releaseGrab();
    }

    closeAll(closeRoot = true) {
        this.closeFrom(0);
        if (closeRoot && this._root.isOpen)
            this._root.close(BoxPointer.PopupAnimation.FADE);
    }

    _inMenus(actor) {
        return [this._root, ...this._stack].some(m => m.actor.contains(actor));
    }

    _onEvent(event) {
        const type = event.type();
        if (type === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape || key === Clutter.KEY_Left) {
                this.closeFrom(this._stack.length - 1);
                return Clutter.EVENT_STOP;
            }
        }
        if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
            const target = global.stage.get_event_actor(event);
            if (!this._inMenus(target)) {
                this.closeAll(true);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _releaseGrab() {
        this._catcher?.destroy();
        this._catcher = null;
        if (this._capturedId)
            Main.uiGroup.disconnect(this._capturedId);
        this._capturedId = 0;
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
    }

    destroy() {
        this.closeFrom(0);
        this._root.disconnect(this._rootId);
    }
}

// A menu row with a ▸ that opens its submenu to the side when hovered.
export const CascadeMenuItem = GObject.registerClass(
class CascadeMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(label, controller, level) {
        super._init({style_class: 'tpct-cascade-item'});
        this._controller = controller;
        this._level = level;
        this.label = new St.Label({text: label, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.label);
        this.add_child(new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'popup-menu-arrow tpct-cascade-arrow',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // The submenu points at this row from the right-hand side.
        this.submenu = new PopupMenu.PopupMenu(this, 0.0, St.Side.LEFT);
        this.submenu.actor.add_style_class_name('tpct-appmenu-menu tpct-cascade-menu');
        this.submenu.actor.hide();
        Main.uiGroup.add_child(this.submenu.actor);

        this.connect('notify::active', () => {
            if (this.active)
                this._scheduleOpen();
        });
        this.connect('destroy', () => {
            if (this._openId)
                GLib.source_remove(this._openId);
            this.submenu.destroy();
        });
    }

    _scheduleOpen() {
        if (this._openId)
            return;
        // Short delay so sweeping across rows does not flash submenus.
        this._openId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._openId = 0;
            if (this.active && !this.submenu.isOpen)
                this._open();
            return GLib.SOURCE_REMOVE;
        });
    }

    _open() {
        this.onAboutToShow?.();
        this._controller.open(this.submenu, this._level);
    }

    activate(event) {
        // Clicking the row opens the submenu right away (no close).
        if (!this.submenu.isOpen)
            this._open();
    }

    vfunc_key_press_event(event) {
        if (event.get_key_symbol() === Clutter.KEY_Right) {
            this._open();
            const first = this.submenu._getMenuItems().find(i => i.reactive);
            first?.active !== undefined && (first.active = true);
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }
});
