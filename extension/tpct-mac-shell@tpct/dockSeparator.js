// macOS keeps one separator in the dock, right before the Trash. The Ubuntu
// dock instead separates pinned apps from running ones. Keep the dock's own
// separator (or ours, when it has none) just before the last item (Trash).

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function findDockBoxes() {
    const boxes = [];
    const walk = (actor, inDock) => {
        inDock ||= actor.name === 'dashtodockContainer';
        const children = actor.get_children();
        if (inDock && children.some(c => c.has_style_class_name?.('dash-item-container')))
            boxes.push(actor);
        children.forEach(c => walk(c, inDock));
    };
    walk(Main.layoutManager.uiGroup, false);
    return boxes;
}

export class DockSeparator {
    constructor() {
        this._watched = new Map(); // box → [ids]
        this._ours = new Map();    // box → our separator
        this._uiId = Main.layoutManager.uiGroup.connect('child-added', () => this._queue());
        this._queue();
    }

    _queue() {
        if (this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        for (const box of findDockBoxes()) {
            if (!this._watched.has(box)) {
                this._watched.set(box, [
                    box.connect('child-added', () => this._queue()),
                    box.connect('child-removed', () => this._queue()),
                    box.connect('destroy', () => {
                        this._watched.delete(box);
                        this._ours.delete(box);
                    }),
                ]);
            }
            this._fix(box);
        }
    }

    _fix(box) {
        const items = box.get_children();
        const theirs = items.find(c => c.has_style_class_name?.('dash-separator') &&
            !c.has_style_class_name('tpct-dock-separator'));
        let ours = this._ours.get(box);
        const apps = items.filter(c => c.has_style_class_name?.('dash-item-container'));
        if (apps.length < 2)
            return;
        const trash = apps[apps.length - 1];

        let sep = theirs;
        if (theirs) {
            ours?.destroy();
            this._ours.delete(box);
        } else {
            if (!ours) {
                ours = new St.Widget({style_class: 'dash-separator tpct-dock-separator', height: trash.height || 36});
                this._ours.set(box, ours);
                box.add_child(ours);
            }
            sep = ours;
        }
        // Right before the Trash, unless it is already there.
        const want = box.get_children().indexOf(trash) - 1;
        if (box.get_children().indexOf(sep) !== want)
            box.set_child_below_sibling(sep, trash);
    }

    destroy() {
        if (this._idle)
            GLib.source_remove(this._idle);
        Main.layoutManager.uiGroup.disconnect(this._uiId);
        for (const [box, ids] of this._watched)
            ids.forEach(id => box.disconnect(id));
        this._watched.clear();
        for (const sep of this._ours.values())
            sep.destroy();
        this._ours.clear();
    }
}
