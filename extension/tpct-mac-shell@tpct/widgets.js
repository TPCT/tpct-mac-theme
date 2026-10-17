// Desktop widgets in the style of macOS Sonoma: clock, calendar, battery and
// weather cards that live on the desktop, below all windows.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SMALL = 158;
const GAP = 18;

// Colors follow the system Light/Dark setting.
function palette(dark) {
    return dark
        ? {fg: [1, 1, 1, 0.92], dim: [1, 1, 1, 0.55], face: [0.12, 0.12, 0.13, 1],
            tick: [1, 1, 1, 0.75], track: [1, 1, 1, 0.16]}
        : {fg: [0, 0, 0, 0.85], dim: [0, 0, 0, 0.5], face: [1, 1, 1, 1],
            tick: [0, 0, 0, 0.7], track: [0, 0, 0, 0.10]};
}

const RED = [1, 0.22, 0.24, 1];
const GREEN = [0.2, 0.78, 0.35, 1];

function card(className, width = SMALL, height = SMALL) {
    return new St.BoxLayout({
        style_class: `tpct-widget ${className}`,
        orientation: Clutter.Orientation.VERTICAL,
        width,
        height,
        reactive: false,
    });
}

// ───────────────────────── Clock ─────────────────────────

const ClockWidget = GObject.registerClass(
class ClockWidget extends St.Bin {
    _init(dark) {
        super._init({style_class: 'tpct-widget tpct-widget-clock', width: SMALL, height: SMALL});
        this._dark = dark;
        this._area = new St.DrawingArea({x_expand: true, y_expand: true});
        this._area.connect('repaint', a => this._draw(a));
        this.set_child(this._area);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._area.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
    }

    setDark(dark) {
        this._dark = dark;
        this._area.queue_repaint();
    }

    _draw(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const p = palette(this._dark);
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10;

        // Face
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.setSourceRGBA(...p.face);
        cr.fill();

        // Hour numerals
        cr.selectFontFace('Inter Variable', 0, 0);
        cr.setFontSize(r * 0.2);
        cr.setSourceRGBA(...p.fg);
        for (let i = 1; i <= 12; i++) {
            const a = i * Math.PI / 6 - Math.PI / 2;
            const text = String(i);
            const ext = cr.textExtents(text);
            cr.moveTo(cx + Math.cos(a) * r * 0.78 - ext.width / 2 - ext.xBearing,
                cy + Math.sin(a) * r * 0.78 - ext.height / 2 - ext.yBearing);
            cr.showText(text);
        }

        // Minute ticks
        cr.setSourceRGBA(...p.tick);
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0)
                continue;
            const a = i * Math.PI / 30;
            cr.setLineWidth(1);
            cr.moveTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
            cr.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
            cr.stroke();
        }

        const now = GLib.DateTime.new_now_local();
        const sec = now.get_second() + now.get_microsecond() / 1e6;
        const min = now.get_minute() + sec / 60;
        const hour = (now.get_hour() % 12) + min / 60;

        const hand = (angle, length, width, color, tail = 0) => {
            cr.setSourceRGBA(...color);
            cr.setLineWidth(width);
            cr.setLineCap(1); // round
            cr.moveTo(cx - Math.cos(angle) * tail, cy - Math.sin(angle) * tail);
            cr.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
            cr.stroke();
        };
        hand(hour * Math.PI / 6 - Math.PI / 2, r * 0.5, 4.5, p.fg);
        hand(min * Math.PI / 30 - Math.PI / 2, r * 0.75, 3.5, p.fg);
        hand(Math.floor(sec) * Math.PI / 30 - Math.PI / 2, r * 0.82, 1.4, RED, r * 0.15);

        cr.arc(cx, cy, 3.2, 0, 2 * Math.PI);
        cr.setSourceRGBA(...RED);
        cr.fill();
        cr.$dispose();
    }

    destroy() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        super.destroy();
    }
});

// ───────────────────────── Calendar (medium) ─────────────────────────

const CalendarWidget = GObject.registerClass(
class CalendarWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'tpct-widget tpct-widget-calendar',
            width: SMALL * 2 + GAP,
            height: SMALL,
        });
        this._left = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'tpct-cal-today', x_expand: false});
        this._weekday = new St.Label({style_class: 'tpct-cal-weekday'});
        this._day = new St.Label({style_class: 'tpct-cal-day'});
        this._note = new St.Label({style_class: 'tpct-cal-note', text: 'No events today'});
        this._left.add_child(this._weekday);
        this._left.add_child(this._day);
        this._left.add_child(new St.Widget({y_expand: true}));
        this._left.add_child(this._note);
        this.add_child(this._left);

        this._right = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'tpct-cal-month'});
        this._monthLabel = new St.Label({style_class: 'tpct-cal-month-name'});
        this._grid = new St.Widget({layout_manager: new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true}), y_expand: true});
        this._right.add_child(this._monthLabel);
        this._right.add_child(this._grid);
        this.add_child(this._right);

        this._update();
        // Re-render shortly after midnight; a minute timer is cheap enough.
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _update() {
        const now = GLib.DateTime.new_now_local();
        const key = now.format('%Y-%m-%d');
        if (key === this._shown)
            return;
        this._shown = key;

        this._weekday.text = now.format('%A').toUpperCase();
        this._day.text = String(now.get_day_of_month());
        this._monthLabel.text = now.format('%B').toUpperCase();

        this._grid.destroy_all_children();
        const layout = this._grid.layout_manager;
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) =>
            layout.attach(new St.Label({text: d, style_class: 'tpct-cal-head', x_align: Clutter.ActorAlign.CENTER}), i, 0, 1, 1));

        const first = GLib.DateTime.new_local(now.get_year(), now.get_month(), 1, 0, 0, 0);
        const offset = first.get_day_of_week() % 7; // Sunday first
        const days = GLib.Date.get_days_in_month(now.get_month(), now.get_year());
        for (let d = 1; d <= days; d++) {
            const idx = offset + d - 1;
            const label = new St.Label({
                text: String(d),
                style_class: d === now.get_day_of_month() ? 'tpct-cal-cell tpct-cal-cell-today' : 'tpct-cal-cell',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            layout.attach(label, idx % 7, 1 + Math.floor(idx / 7), 1, 1);
        }
    }

    destroy() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        super.destroy();
    }
});

// ───────────────────────── Battery ─────────────────────────

const BatteryWidget = GObject.registerClass(
class BatteryWidget extends St.BoxLayout {
    _init(dark) {
        super._init({
            style_class: 'tpct-widget tpct-widget-battery',
            orientation: Clutter.Orientation.VERTICAL,
            width: SMALL,
            height: SMALL,
        });
        this._dark = dark;
        this._percent = 0;
        this._charging = false;

        this._ring = new St.DrawingArea({width: 84, height: 84, x_align: Clutter.ActorAlign.CENTER});
        this._ring.connect('repaint', a => this._draw(a));
        this._label = new St.Label({style_class: 'tpct-battery-percent', x_align: Clutter.ActorAlign.CENTER});
        this._title = new St.Label({style_class: 'tpct-widget-caption', text: 'This Computer', x_align: Clutter.ActorAlign.CENTER});
        this.add_child(this._ring);
        this.add_child(this._label);
        this.add_child(this._title);

        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.UPower', '/org/freedesktop/UPower/devices/DisplayDevice',
            'org.freedesktop.UPower.Device', null, (o, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    return;
                }
                this._proxyId = this._proxy.connect('g-properties-changed', () => this._sync());
                this._sync();
            });
    }

    setDark(dark) {
        this._dark = dark;
        this._ring.queue_repaint();
    }

    _sync() {
        const pct = this._proxy.get_cached_property('Percentage')?.unpack() ?? 0;
        const state = this._proxy.get_cached_property('State')?.unpack() ?? 0;
        this._percent = pct;
        this._charging = state === 1 || state === 4; // charging / fully charged
        this._label.text = `${Math.round(pct)}%`;
        this._ring.queue_repaint();
    }

    _draw(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const p = palette(this._dark);
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
        cr.setLineWidth(7);
        cr.setLineCap(1);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.setSourceRGBA(...p.track);
        cr.stroke();
        const color = this._percent <= 20 && !this._charging ? RED : GREEN;
        cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * this._percent / 100);
        cr.setSourceRGBA(...color);
        cr.stroke();

        // Laptop glyph in the middle
        cr.setSourceRGBA(...p.fg);
        cr.setLineWidth(2);
        cr.rectangle(cx - 13, cy - 9, 26, 16);
        cr.stroke();
        cr.moveTo(cx - 17, cy + 10);
        cr.lineTo(cx + 17, cy + 10);
        cr.stroke();
        if (this._charging) {
            cr.setSourceRGBA(...GREEN);
            cr.moveTo(cx + 1, cy - 7);
            cr.lineTo(cx - 4, cy + 1);
            cr.lineTo(cx, cy + 1);
            cr.lineTo(cx - 1, cy + 6);
            cr.lineTo(cx + 4, cy - 2);
            cr.lineTo(cx, cy - 2);
            cr.closePath();
            cr.fill();
        }
        cr.$dispose();
    }

    destroy() {
        if (this._proxyId)
            this._proxy.disconnect(this._proxyId);
        this._proxyId = 0;
        super.destroy();
    }
});

// ───────────────────────── Weather ─────────────────────────

const WeatherWidget = GObject.registerClass(
class WeatherWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'tpct-widget tpct-widget-weather',
            orientation: Clutter.Orientation.VERTICAL,
            width: SMALL,
            height: SMALL,
        });
        this._city = new St.Label({style_class: 'tpct-weather-city', text: 'Weather'});
        this._temp = new St.Label({style_class: 'tpct-weather-temp', text: '--°'});
        this._icon = new St.Icon({icon_size: 22, icon_name: 'weather-clear-symbolic', style_class: 'tpct-weather-icon'});
        this._summary = new St.Label({style_class: 'tpct-weather-summary', text: ''});
        this.add_child(this._city);
        this.add_child(this._temp);
        this.add_child(new St.Widget({y_expand: true}));
        this.add_child(this._icon);
        this.add_child(this._summary);

        import('resource:///org/gnome/shell/misc/weather.js').then(({WeatherClient}) => {
            if (this._destroyed)
                return;
            this._client = new WeatherClient();
            this._clientId = this._client.connect('changed', () => this._sync());
            this._client.update();
            this._sync();
        }).catch(() => this._showUnavailable());
    }

    _showUnavailable() {
        this._city.text = 'Weather';
        this._temp.text = '--°';
        this._summary.text = 'Install GNOME Weather and pick a city';
    }

    _sync() {
        const c = this._client;
        if (!c.available || !c.hasLocation) {
            this._showUnavailable();
            return;
        }
        const info = c.info;
        if (c.loading || !info?.is_valid()) {
            this._summary.text = 'Updating…';
            return;
        }
        this._city.text = info.get_location_name() || 'Weather';
        this._temp.text = info.get_temp_summary().replace(/\s*°[CF]?$/, '°').replace(/\s+/g, '');
        this._icon.icon_name = info.get_symbolic_icon_name();
        this._summary.text = info.get_sky() || info.get_conditions() || '';
    }

    destroy() {
        this._destroyed = true;
        if (this._clientId)
            this._client.disconnect(this._clientId);
        this._clientId = 0;
        super.destroy();
    }
});

// ───────────────────────── Layer ─────────────────────────

export class DesktopWidgets {
    constructor() {
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._dark = this._interface.get_string('color-scheme') === 'prefer-dark';

        this._layer = new St.Widget({
            name: 'tpctDesktopWidgets',
            style_class: this._dark ? 'tpct-widgets-dark' : 'tpct-widgets-light',
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
        });

        this._clock = new ClockWidget(this._dark);
        this._calendar = new CalendarWidget();
        this._battery = new BatteryWidget(this._dark);
        this._weather = new WeatherWidget();

        // Two rows: [clock][weather] / [calendar ......]
        //           [battery]
        const place = (actor, col, row) => {
            actor.set_position(col * (SMALL + GAP), row * (SMALL + GAP));
            this._layer.add_child(actor);
        };
        place(this._clock, 0, 0);
        place(this._weather, 1, 0);
        place(this._calendar, 0, 1);
        place(this._battery, 0, 2);

        // Below windows: the background group holds the wallpaper.
        Main.layoutManager._backgroundGroup.add_child(this._layer);

        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._schemeId = this._interface.connect('changed::color-scheme', () => this._syncScheme());
        this._position();
    }

    _position() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        const top = Main.panel.height + 22;
        this._layer.set_position(m.x + 24, m.y + top);
    }

    _syncScheme() {
        this._dark = this._interface.get_string('color-scheme') === 'prefer-dark';
        this._layer.style_class = this._dark ? 'tpct-widgets-dark' : 'tpct-widgets-light';
        this._clock.setDark(this._dark);
        this._battery.setDark(this._dark);
    }

    destroy() {
        Main.layoutManager.disconnect(this._monitorsId);
        this._interface.disconnect(this._schemeId);
        this._layer.destroy();
    }
}
