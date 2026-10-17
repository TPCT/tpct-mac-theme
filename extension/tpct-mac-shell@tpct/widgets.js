// Desktop widgets in the style of macOS Sonoma. They live on the desktop,
// below all windows, and open the matching app when clicked.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SMALL = 158;
const GAP = 18;
const MEDIUM_W = SMALL * 2 + GAP;

function palette(dark) {
    return dark
        ? {fg: [1, 1, 1, 0.92], dim: [1, 1, 1, 0.55], face: [0.12, 0.12, 0.13, 1],
            faceNight: [0.12, 0.12, 0.13, 1], tick: [1, 1, 1, 0.75], track: [1, 1, 1, 0.16]}
        : {fg: [0, 0, 0, 0.85], dim: [0, 0, 0, 0.5], face: [1, 1, 1, 1],
            faceNight: [0.13, 0.13, 0.14, 1], tick: [0, 0, 0, 0.7], track: [0, 0, 0, 0.10]};
}

const RED = [1, 0.23, 0.19, 1];
const GREEN = [0.2, 0.78, 0.35, 1];

function launchApp(...ids) {
    const sys = Shell.AppSystem.get_default();
    for (const id of ids) {
        const app = sys.lookup_app(id);
        if (app) {
            app.activate();
            return;
        }
    }
}

// Base class: a rounded glass card that can be clicked.
const Card = GObject.registerClass(
class Card extends St.BoxLayout {
    _init(className, {width = SMALL, height = SMALL, vertical = true, onClick = null} = {}) {
        super._init({
            style_class: `tpct-widget ${className}`,
            orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
            width,
            height,
            reactive: !!onClick,
            track_hover: !!onClick,
        });
        if (onClick) {
            this.connect('button-release-event', (a, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY)
                    onClick();
                return Clutter.EVENT_STOP;
            });
        }
        this._timers = [];
        this.connect('destroy', () => {
            this._timers.forEach(t => GLib.source_remove(t));
            this._timers = [];
            this._onDestroy();
        });
    }

    every(seconds, fn) {
        this._timers.push(GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            fn();
            return GLib.SOURCE_CONTINUE;
        }));
    }

    setDark(_dark) {}

    _onDestroy() {}
});

// Analog clock face drawn with cairo, shared by Clock and World Clock.
function drawClock(cr, cx, cy, r, now, p, {numerals = true, night = false} = {}) {
    cr.arc(cx, cy, r, 0, 2 * Math.PI);
    cr.setSourceRGBA(...(night ? p.faceNight : p.face));
    cr.fill();
    const fg = night ? [1, 1, 1, 0.92] : p.fg;
    const tick = night ? [1, 1, 1, 0.7] : p.tick;

    if (numerals) {
        cr.selectFontFace('Inter Variable', 0, 0);
        cr.setFontSize(r * 0.2);
        cr.setSourceRGBA(...fg);
        for (let i = 1; i <= 12; i++) {
            const a = i * Math.PI / 6 - Math.PI / 2;
            const ext = cr.textExtents(String(i));
            cr.moveTo(cx + Math.cos(a) * r * 0.76 - ext.width / 2 - ext.xBearing,
                cy + Math.sin(a) * r * 0.76 - ext.height / 2 - ext.yBearing);
            cr.showText(String(i));
        }
    }
    cr.setSourceRGBA(...tick);
    for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0;
        if (numerals && major)
            continue;
        const a = i * Math.PI / 30;
        cr.setLineWidth(major ? 1.6 : 0.8);
        const inner = major ? 0.86 : 0.92;
        cr.moveTo(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * inner);
        cr.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
        cr.stroke();
    }

    const sec = now.get_second();
    const min = now.get_minute() + sec / 60;
    const hour = (now.get_hour() % 12) + min / 60;
    const hand = (angle, length, width, color, tail = 0) => {
        cr.setSourceRGBA(...color);
        cr.setLineWidth(width);
        cr.setLineCap(1);
        cr.moveTo(cx - Math.cos(angle) * tail, cy - Math.sin(angle) * tail);
        cr.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
        cr.stroke();
    };
    hand(hour * Math.PI / 6 - Math.PI / 2, r * 0.5, Math.max(2.5, r * 0.07), fg);
    hand(min * Math.PI / 30 - Math.PI / 2, r * 0.74, Math.max(2, r * 0.05), fg);
    if (numerals)
        hand(sec * Math.PI / 30 - Math.PI / 2, r * 0.82, 1.4, RED, r * 0.15);
    cr.arc(cx, cy, Math.max(2, r * 0.05), 0, 2 * Math.PI);
    cr.setSourceRGBA(...(numerals ? RED : fg));
    cr.fill();
}

// ───────────────────────── Clock ─────────────────────────

const ClockWidget = GObject.registerClass(
class ClockWidget extends Card {
    _init(dark) {
        super._init('tpct-widget-clock', {onClick: () => launchApp('org.gnome.clocks.desktop')});
        this._dark = dark;
        this._area = new St.DrawingArea({x_expand: true, y_expand: true});
        this._area.connect('repaint', a => {
            const cr = a.get_context();
            const [w, h] = a.get_surface_size();
            drawClock(cr, w / 2, h / 2, Math.min(w, h) / 2 - 10, GLib.DateTime.new_now_local(), palette(this._dark));
            cr.$dispose();
        });
        this.add_child(this._area);
        this.every(1, () => this._area.queue_repaint());
    }

    setDark(dark) {
        this._dark = dark;
        this._area.queue_repaint();
    }
});

// ───────────────────────── World clock ─────────────────────────

const CITIES = [
    ['Cupertino', 'America/Los_Angeles'],
    ['New York', 'America/New_York'],
    ['London', 'Europe/London'],
    ['Tokyo', 'Asia/Tokyo'],
];

const WorldClockWidget = GObject.registerClass(
class WorldClockWidget extends Card {
    _init(dark) {
        super._init('tpct-widget-world', {width: MEDIUM_W, vertical: false,
            onClick: () => launchApp('org.gnome.clocks.desktop')});
        this._dark = dark;
        this._items = CITIES.map(([name, tzid]) => {
            const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'tpct-world-item'});
            const area = new St.DrawingArea({width: 58, height: 58, x_align: Clutter.ActorAlign.CENTER});
            const tz = GLib.TimeZone.new_identifier(tzid) ?? GLib.TimeZone.new_local();
            area.connect('repaint', a => {
                const cr = a.get_context();
                const [w, h] = a.get_surface_size();
                const now = GLib.DateTime.new_now(tz);
                const hr = now.get_hour();
                drawClock(cr, w / 2, h / 2, Math.min(w, h) / 2 - 1, now, palette(this._dark),
                    {numerals: false, night: hr < 6 || hr >= 18});
                cr.$dispose();
            });
            const city = new St.Label({text: name, style_class: 'tpct-world-city', x_align: Clutter.ActorAlign.CENTER});
            const offset = new St.Label({style_class: 'tpct-world-offset', x_align: Clutter.ActorAlign.CENTER});
            box.add_child(area);
            box.add_child(city);
            box.add_child(offset);
            this.add_child(box);
            return {area, offset, tz};
        });
        this._update();
        this.every(30, () => this._update());
    }

    _update() {
        const local = GLib.DateTime.new_now_local();
        for (const it of this._items) {
            it.area.queue_repaint();
            const there = GLib.DateTime.new_now(it.tz);
            const diff = Math.round((there.get_utc_offset() - local.get_utc_offset()) / 3.6e9);
            const dayDiff = there.get_day_of_year() - local.get_day_of_year();
            const day = dayDiff === 0 ? 'Today' : dayDiff > 0 || dayDiff < -300 ? 'Tomorrow' : 'Yesterday';
            it.offset.text = `${day}, ${diff >= 0 ? '+' : ''}${diff}HRS`;
        }
    }

    setDark(dark) {
        this._dark = dark;
        this._items.forEach(it => it.area.queue_repaint());
    }
});

// ───────────────────────── Calendar (medium) ─────────────────────────

const CalendarWidget = GObject.registerClass(
class CalendarWidget extends Card {
    _init() {
        super._init('tpct-widget-calendar', {width: MEDIUM_W, vertical: false,
            onClick: () => launchApp('org.gnome.Calendar.desktop', 'org.gnome.Evolution.desktop')});

        this._left = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'tpct-cal-today'});
        this._weekday = new St.Label({style_class: 'tpct-cal-weekday'});
        this._day = new St.Label({style_class: 'tpct-cal-day'});
        this._events = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'tpct-cal-events', y_expand: true, y_align: Clutter.ActorAlign.END});
        this._left.add_child(this._weekday);
        this._left.add_child(this._day);
        this._left.add_child(this._events);
        this.add_child(this._left);

        this._right = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'tpct-cal-month'});
        this._monthLabel = new St.Label({style_class: 'tpct-cal-month-name'});
        this._grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true}),
            y_expand: true,
        });
        this._right.add_child(this._monthLabel);
        this._right.add_child(this._grid);
        this.add_child(this._right);

        this._eventSource = Main.panel.statusArea.dateMenu?._eventSource ?? null;
        this._eventId = this._eventSource?.connect('changed', () => this._updateEvents()) ?? 0;

        this._update();
        this.every(60, () => this._update());
    }

    _update() {
        const now = GLib.DateTime.new_now_local();
        const key = now.format('%Y-%m-%d');
        if (key !== this._shown) {
            this._shown = key;
            this._weekday.text = now.format('%A').toUpperCase();
            this._day.text = String(now.get_day_of_month());
            this._monthLabel.text = now.format('%B').toUpperCase();
            this._buildGrid(now);
        }
        this._updateEvents();
    }

    _buildGrid(now) {
        this._grid.destroy_all_children();
        const layout = this._grid.layout_manager;
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) =>
            layout.attach(new St.Label({text: d, style_class: 'tpct-cal-head', x_align: Clutter.ActorAlign.CENTER}), i, 0, 1, 1));

        const first = GLib.DateTime.new_local(now.get_year(), now.get_month(), 1, 0, 0, 0);
        const offset = first.get_day_of_week() % 7; // Sunday first
        const days = GLib.Date.get_days_in_month(now.get_month(), now.get_year());
        for (let d = 1; d <= days; d++) {
            const idx = offset + d - 1;
            const today = d === now.get_day_of_month();
            // A fixed square bin keeps the "today" highlight a true circle.
            const cell = new St.Bin({
                style_class: today ? 'tpct-cal-cell tpct-cal-cell-today' : 'tpct-cal-cell',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Label({text: String(d), x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}),
            });
            layout.attach(cell, idx % 7, 1 + Math.floor(idx / 7), 1, 1);
        }
    }

    _updateEvents() {
        this._events.destroy_all_children();
        const begin = new Date();
        begin.setHours(0, 0, 0, 0);
        const end = new Date(begin);
        end.setDate(end.getDate() + 1);
        const now = new Date();
        const events = (this._eventSource?.getEvents(begin, end) ?? [])
            .filter(e => e.end > now).slice(0, 2);
        if (!events.length) {
            this._events.add_child(new St.Label({text: 'No more events today', style_class: 'tpct-cal-note'}));
            return;
        }
        for (const e of events) {
            const row = new St.BoxLayout({style_class: 'tpct-cal-event'});
            row.add_child(new St.Widget({style_class: 'tpct-cal-event-bar'}));
            const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
            text.add_child(new St.Label({text: e.summary || 'Event', style_class: 'tpct-cal-event-title'}));
            const time = e.allDay ? 'All day'
                : `${GLib.DateTime.new_from_unix_local(e.date.getTime() / 1000).format('%-l:%M')}–${
                    GLib.DateTime.new_from_unix_local(e.end.getTime() / 1000).format('%-l:%M %p')}`;
            text.add_child(new St.Label({text: time, style_class: 'tpct-cal-event-time'}));
            row.add_child(text);
            this._events.add_child(row);
        }
    }

    _onDestroy() {
        if (this._eventId)
            this._eventSource.disconnect(this._eventId);
        this._eventId = 0;
    }
});

// ───────────────────────── Now playing (Music) ─────────────────────────

const MusicWidget = GObject.registerClass(
class MusicWidget extends Card {
    _init() {
        super._init('tpct-widget-music', {width: MEDIUM_W, vertical: false});

        this._art = new St.Bin({style_class: 'tpct-music-art', width: 118, height: 118, y_align: Clutter.ActorAlign.CENTER});
        this._artIcon = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 44, style_class: 'tpct-music-art-icon'});
        this._art.set_child(this._artIcon);
        this.add_child(this._art);

        const info = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'tpct-music-info'});
        this._source = new St.Label({text: 'MUSIC', style_class: 'tpct-music-source'});
        this._title = new St.Label({text: 'Not Playing', style_class: 'tpct-music-title'});
        this._artist = new St.Label({text: '', style_class: 'tpct-music-artist'});
        info.add_child(this._source);
        info.add_child(new St.Widget({y_expand: true}));
        info.add_child(this._title);
        info.add_child(this._artist);

        const controls = new St.BoxLayout({style_class: 'tpct-music-controls'});
        const btn = (icon, fn) => {
            const b = new St.Button({style_class: 'tpct-music-button', can_focus: false,
                child: new St.Icon({icon_name: icon, icon_size: 18})});
            b.connect('clicked', () => fn());
            controls.add_child(b);
            return b;
        };
        this._prev = btn('media-skip-backward-symbolic', () => this._player?.previous());
        this._play = btn('media-playback-start-symbolic', () => this._player?.playPause());
        this._next = btn('media-skip-forward-symbolic', () => this._player?.next());
        info.add_child(controls);
        this.add_child(info);

        import('resource:///org/gnome/shell/ui/mpris.js').then(({MprisSource}) => {
            if (this._destroyed)
                return;
            this._mpris = new MprisSource();
            this._mprisIds = [
                this._mpris.connect('player-added', () => this._pickPlayer()),
                this._mpris.connect('player-removed', () => this._pickPlayer()),
            ];
            this._pickPlayer();
        }).catch(logError);
    }

    _pickPlayer() {
        const players = this._mpris.players;
        const player = players.find(p => p.status === 'Playing') ?? players[0] ?? null;
        if (player !== this._player) {
            if (this._playerId)
                this._player.disconnect(this._playerId);
            this._player = player;
            this._playerId = player?.connect('changed', () => this._sync()) ?? 0;
        }
        this._sync();
    }

    _sync() {
        const p = this._player;
        if (!p) {
            this._title.text = 'Not Playing';
            this._artist.text = '';
            this._art.style = null;
            this._artIcon.show();
            this._play.child.icon_name = 'media-playback-start-symbolic';
            return;
        }
        this._title.text = p.trackTitle || 'Unknown';
        this._artist.text = (p.trackArtists ?? []).join(', ');
        this._play.child.icon_name = p.status === 'Playing'
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        const url = p.trackCoverUrl;
        if (url && (url.startsWith('file://') || url.startsWith('http'))) {
            this._art.style = `background-image: url("${url}"); background-size: cover;`;
            this._artIcon.hide();
        } else {
            this._art.style = null;
            this._artIcon.show();
        }
    }

    _onDestroy() {
        this._destroyed = true;
        if (this._playerId)
            this._player.disconnect(this._playerId);
        this._mprisIds?.forEach(id => this._mpris.disconnect(id));
    }
});

// ───────────────────────── Photos ─────────────────────────

const PhotoWidget = GObject.registerClass(
class PhotoWidget extends Card {
    _init() {
        super._init('tpct-widget-photo', {onClick: () => {
            if (this._current)
                Gio.AppInfo.launch_default_for_uri(this._current, global.create_app_launch_context(0, -1));
        }});
        this._caption = new St.Label({text: 'Photos', style_class: 'tpct-photo-caption', y_expand: true, y_align: Clutter.ActorAlign.END});
        this.add_child(this._caption);
        this._pick();
        this.every(60 * 30, () => this._pick());
    }

    _candidates() {
        const dirs = [GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES),
            GLib.build_filenamev([GLib.get_user_data_dir(), 'backgrounds'])].filter(Boolean);
        const files = [];
        const walk = (path, depth) => {
            let en;
            try {
                en = Gio.File.new_for_path(path).enumerate_children('standard::name,standard::type,standard::content-type', 0, null);
            } catch (e) {
                return;
            }
            let info;
            while ((info = en.next_file(null)) && files.length < 400) {
                const child = GLib.build_filenamev([path, info.get_name()]);
                if (info.get_file_type() === Gio.FileType.DIRECTORY && depth < 2 && !info.get_name().startsWith('.'))
                    walk(child, depth + 1);
                else if (/^image\/(jpeg|png|webp)$/.test(info.get_content_type() ?? ''))
                    files.push(child);
            }
            en.close(null);
        };
        dirs.forEach(d => walk(d, 0));
        return files;
    }

    _pick() {
        const files = this._candidates();
        if (!files.length) {
            this._current = null;
            this.style = null;
            this._caption.text = 'Add photos to Pictures';
            return;
        }
        const path = files[Math.floor(Math.random() * files.length)];
        this._current = Gio.File.new_for_path(path).get_uri();
        this.style = `background-image: url("${this._current}"); background-size: cover; background-position: center;`;
        this._caption.text = GLib.DateTime.new_now_local().format('%B %-d');
    }
});

// ───────────────────────── Batteries ─────────────────────────

const BatteryWidget = GObject.registerClass(
class BatteryWidget extends Card {
    _init(dark) {
        super._init('tpct-widget-battery', {onClick: () => launchApp('org.gnome.Settings.desktop')});
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
                if (this._destroyed)
                    return;
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
        this._charging = state === 1 || state === 4;
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
        cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * this._percent / 100);
        cr.setSourceRGBA(...(this._percent <= 20 && !this._charging ? RED : GREEN));
        cr.stroke();

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

    _onDestroy() {
        this._destroyed = true;
        if (this._proxyId)
            this._proxy.disconnect(this._proxyId);
    }
});

// ───────────────────────── Weather ─────────────────────────

const WeatherWidget = GObject.registerClass(
class WeatherWidget extends Card {
    _init() {
        super._init('tpct-widget-weather', {onClick: () => launchApp('org.gnome.Weather.desktop')});
        this._city = new St.Label({style_class: 'tpct-weather-city', text: 'Weather'});
        this._temp = new St.Label({style_class: 'tpct-weather-temp', text: '—'});
        this._icon = new St.Icon({icon_size: 22, icon_name: 'weather-few-clouds-symbolic', style_class: 'tpct-weather-icon'});
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
        this._temp.text = '—';
        this._summary.text = 'Open Weather to set a city';
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

    _onDestroy() {
        this._destroyed = true;
        if (this._clientId)
            this._client.disconnect(this._clientId);
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

        // Left column, macOS Sonoma style:
        //   [clock][weather]
        //   [calendar.......]
        //   [world clock....]
        //   [music..........]
        //   [photo][battery]
        this._widgets = [];
        const place = (widget, col, row) => {
            widget.set_position(col * (SMALL + GAP), row * (SMALL + GAP));
            this._layer.add_child(widget);
            this._widgets.push(widget);
        };
        place(new ClockWidget(this._dark), 0, 0);
        place(new WeatherWidget(), 1, 0);
        place(new CalendarWidget(), 0, 1);
        place(new WorldClockWidget(this._dark), 0, 2);
        place(new MusicWidget(), 0, 3);
        place(new PhotoWidget(), 0, 4);
        place(new BatteryWidget(this._dark), 1, 4);

        Main.layoutManager._backgroundGroup.add_child(this._layer);

        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._schemeId = this._interface.connect('changed::color-scheme', () => this._syncScheme());
        this._position();
    }

    _position() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        const top = Main.panel.height + 20;
        this._layer.set_position(m.x + 24, m.y + top);
        // Hide rows that would not fit on short screens.
        const avail = m.height - top - 90;
        for (const w of this._widgets)
            w.visible = w.y + w.height <= avail;
    }

    _syncScheme() {
        this._dark = this._interface.get_string('color-scheme') === 'prefer-dark';
        this._layer.style_class = this._dark ? 'tpct-widgets-dark' : 'tpct-widgets-light';
        this._widgets.forEach(w => w.setDark(this._dark));
    }

    destroy() {
        Main.layoutManager.disconnect(this._monitorsId);
        this._interface.disconnect(this._schemeId);
        this._layer.destroy();
    }
}
