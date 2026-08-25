/* ==========================================================================
   CargoBid - core.js
   The single global namespace. Store, persistence, cross-tab bus, virtual
   clock, formatters, scoring, auth, queries, mutations, DOM helpers.

   Classic script. No modules, no imports - so this works from file:// too.
   Load order on every app page:
     core.js -> seed.js -> match.js -> sim.js -> ui.js -> console.js -> page-*.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = (window.CB = window.CB || {});

  CB.VERSION = 1;
  CB.KEY = 'cargobid.v1';
  CB.LEADER_KEY = 'cargobid.leader';
  CB.TAB = 'tab-' + Math.random().toString(36).slice(2, 9);

  /* ------------------------------------------------------------------------
     1. UTILITIES
     ------------------------------------------------------------------------ */

  var util = (CB.util = {});

  /* Deterministic PRNG (mulberry32). Seeded so the demo is reproducible. */
  util.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  util.pick = function (rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
  };

  util.int = function (rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
  };

  util.clamp = function (n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  };

  /* Round to the nearest 50 rupees - freight quotes are never ₹8,347. */
  util.quote = function (n) {
    return Math.max(500, Math.round(n / 50) * 50);
  };

  util.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  util.slug = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  util.uniq = function (arr) {
    return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
  };

  util.sum = function (arr, f) {
    return arr.reduce(function (a, x) { return a + (f ? f(x) : x); }, 0);
  };

  util.by = function (key, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return function (a, b) {
      var x = typeof key === 'function' ? key(a) : a[key];
      var y = typeof key === 'function' ? key(b) : b[key];
      if (x === y) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : -1) * d;
    };
  };

  util.groupBy = function (arr, f) {
    return arr.reduce(function (acc, x) {
      var k = f(x);
      (acc[k] = acc[k] || []).push(x);
      return acc;
    }, {});
  };

  /* Stable pastel-ish avatar colour from a seed string. */
  util.avatarTint = function (seed) {
    var h = 0;
    for (var i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) | 0;
    var tints = [
      ['#DCE7FD', '#274796'], ['#FBF1DE', '#8A5A12'], ['#E4F4EB', '#1F7A4C'],
      ['#EDE7FB', '#463090'], ['#FBE8F2', '#8C2A63'], ['#E3F1F7', '#0F5E7A']
    ];
    return tints[Math.abs(h) % tints.length];
  };

  util.initials = function (name) {
    return String(name).trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  };

  /* ------------------------------------------------------------------------
     2. REFERENCE DATA - Indian freight corridors
     ------------------------------------------------------------------------ */

  CB.cities = [
    { name: 'Jaipur', state: 'RJ', lat: 26.9124, lng: 75.7873 },
    { name: 'Delhi', state: 'DL', lat: 28.6139, lng: 77.2090 },
    { name: 'Gurugram', state: 'HR', lat: 28.4595, lng: 77.0266 },
    { name: 'Noida', state: 'UP', lat: 28.5355, lng: 77.3910 },
    { name: 'Faridabad', state: 'HR', lat: 28.4089, lng: 77.3178 },
    { name: 'Bhiwadi', state: 'RJ', lat: 28.2100, lng: 76.8600 },
    { name: 'Alwar', state: 'RJ', lat: 27.5530, lng: 76.6346 },
    { name: 'Kota', state: 'RJ', lat: 25.2138, lng: 75.8648 },
    { name: 'Udaipur', state: 'RJ', lat: 24.5854, lng: 73.7125 },
    { name: 'Jodhpur', state: 'RJ', lat: 26.2389, lng: 73.0243 },
    { name: 'Ajmer', state: 'RJ', lat: 26.4499, lng: 74.6399 },
    { name: 'Ahmedabad', state: 'GJ', lat: 23.0225, lng: 72.5714 },
    { name: 'Surat', state: 'GJ', lat: 21.1702, lng: 72.8311 },
    { name: 'Vadodara', state: 'GJ', lat: 22.3072, lng: 73.1812 },
    { name: 'Rajkot', state: 'GJ', lat: 22.3039, lng: 70.8022 },
    { name: 'Mumbai', state: 'MH', lat: 19.0760, lng: 72.8777 },
    { name: 'Pune', state: 'MH', lat: 18.5204, lng: 73.8567 },
    { name: 'Nashik', state: 'MH', lat: 19.9975, lng: 73.7898 },
    { name: 'Nagpur', state: 'MH', lat: 21.1458, lng: 79.0882 },
    { name: 'Aurangabad', state: 'MH', lat: 19.8762, lng: 75.3433 },
    { name: 'Indore', state: 'MP', lat: 22.7196, lng: 75.8577 },
    { name: 'Bhopal', state: 'MP', lat: 23.2599, lng: 77.4126 },
    { name: 'Gwalior', state: 'MP', lat: 26.2183, lng: 78.1828 },
    { name: 'Raipur', state: 'CG', lat: 21.2514, lng: 81.6296 },
    { name: 'Hyderabad', state: 'TS', lat: 17.3850, lng: 78.4867 },
    { name: 'Bengaluru', state: 'KA', lat: 12.9716, lng: 77.5946 },
    { name: 'Hubballi', state: 'KA', lat: 15.3647, lng: 75.1240 },
    { name: 'Chennai', state: 'TN', lat: 13.0827, lng: 80.2707 },
    { name: 'Coimbatore', state: 'TN', lat: 11.0168, lng: 76.9558 },
    { name: 'Kochi', state: 'KL', lat: 9.9312, lng: 76.2673 },
    { name: 'Kolkata', state: 'WB', lat: 22.5726, lng: 88.3639 },
    { name: 'Patna', state: 'BR', lat: 25.5941, lng: 85.1376 },
    { name: 'Lucknow', state: 'UP', lat: 26.8467, lng: 80.9462 },
    { name: 'Kanpur', state: 'UP', lat: 26.4499, lng: 80.3319 },
    { name: 'Ludhiana', state: 'PB', lat: 30.9010, lng: 75.8573 },
    { name: 'Amritsar', state: 'PB', lat: 31.6340, lng: 74.8723 },
    { name: 'Chandigarh', state: 'CH', lat: 30.7333, lng: 76.7794 },
    { name: 'Dehradun', state: 'UK', lat: 30.3165, lng: 78.0322 },
    { name: 'Bhubaneswar', state: 'OD', lat: 20.2961, lng: 85.8245 },
    { name: 'Visakhapatnam', state: 'AP', lat: 17.6868, lng: 83.2185 },
    { name: 'Guwahati', state: 'AS', lat: 26.1445, lng: 91.7362 },
    { name: 'Ranchi', state: 'JH', lat: 23.3441, lng: 85.3096 },
    { name: 'Jamshedpur', state: 'JH', lat: 22.8046, lng: 86.2029 }
  ];

  CB.city = function (name) {
    for (var i = 0; i < CB.cities.length; i++) {
      if (CB.cities[i].name === name) return CB.cities[i];
    }
    return null;
  };

  CB.TRUCK_TYPES = [
    { key: 'open', label: 'Open body', icon: 'ri-truck-line', ratePerKm: 32,
      blurb: 'Steel, cement, machinery. Crane-loadable.' },
    { key: 'container', label: 'Container', icon: 'ri-box-3-line', ratePerKm: 38,
      blurb: 'Fully enclosed. Weather and pilferage safe.' },
    { key: 'reefer', label: 'Refrigerated', icon: 'ri-temp-cold-line', ratePerKm: 58,
      blurb: 'Temperature controlled −20°C to +25°C.' },
    { key: 'trailer', label: 'Trailer / flatbed', icon: 'ri-caravan-line', ratePerKm: 45,
      blurb: 'Long, heavy and over-dimensional cargo.' },
    { key: 'tipper', label: 'Tipper', icon: 'ri-dump-truck-line', ratePerKm: 34,
      blurb: 'Bulk aggregate, sand, coal, ore.' }
  ];

  CB.truckType = function (key) {
    for (var i = 0; i < CB.TRUCK_TYPES.length; i++) {
      if (CB.TRUCK_TYPES[i].key === key) return CB.TRUCK_TYPES[i];
    }
    return CB.TRUCK_TYPES[0];
  };

  CB.MATERIAL_FLAGS = [
    { key: 'fragile', label: 'Fragile', icon: 'ri-goblet-line', premium: 0.08 },
    { key: 'hazardous', label: 'Hazardous', icon: 'ri-alarm-warning-line', premium: 0.18 },
    { key: 'perishable', label: 'Perishable', icon: 'ri-leaf-line', premium: 0.12 },
    { key: 'oversized', label: 'Over-dimensional', icon: 'ri-expand-diagonal-line', premium: 0.15 },
    { key: 'stackable', label: 'Stackable', icon: 'ri-stack-line', premium: -0.04 }
  ];

  CB.LOAD_STATUS = {
    draft:       { label: 'Draft',        chip: 'chip' },
    open:        { label: 'Bidding open', chip: 'chip-ok' },
    closed:      { label: 'Bids closed',  chip: 'chip-warn' },
    awarded:     { label: 'Awarded',      chip: 'chip-accent' },
    'in-transit':{ label: 'In transit',   chip: 'chip-accent' },
    delivered:   { label: 'Delivered',    chip: 'chip-ok' },
    cancelled:   { label: 'Cancelled',    chip: 'chip-stop' }
  };

  CB.BID_STATUS = {
    active:    { label: 'Leading',   chip: 'chip-ok' },
    placed:    { label: 'Placed',    chip: 'chip-accent' },
    outbid:    { label: 'Outbid',    chip: 'chip-warn' },
    withdrawn: { label: 'Withdrawn', chip: 'chip' },
    won:       { label: 'Won',       chip: 'chip-ok' },
    lost:      { label: 'Lost',      chip: 'chip' }
  };

  CB.TRIP_STEPS = [
    { key: 'assigned',   label: 'Load awarded',        note: 'Transporter confirmed the booking' },
    { key: 'at-pickup',  label: 'Truck at pickup',     note: 'Driver reached the loading point' },
    { key: 'loaded',     label: 'Loaded and sealed',   note: 'Cargo secured, LR generated' },
    { key: 'in-transit', label: 'In transit',          note: 'On the corridor' },
    { key: 'at-drop',    label: 'Arrived at drop',     note: 'Waiting for unloading' },
    { key: 'delivered',  label: 'Delivered, POD signed', note: 'Proof of delivery captured' }
  ];

  /* ------------------------------------------------------------------------
     3. FORMATTERS
     ------------------------------------------------------------------------ */

  var inr = null, inrCompactCache = {};
  try { inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }); } catch (e) { inr = null; }

  var fmt = (CB.fmt = {});

  fmt.num = function (n) {
    if (n == null || isNaN(n)) return '—';
    return inr ? inr.format(Math.round(n)) : String(Math.round(n));
  };

  fmt.money = function (n) {
    if (n == null || isNaN(n)) return '—';
    return '₹' + fmt.num(n);
  };

  /* ₹1.24 L / ₹12.4 L / ₹1.24 Cr - how Indian freight desks actually talk. */
  fmt.moneyShort = function (n) {
    if (n == null || isNaN(n)) return '—';
    if (inrCompactCache[n]) return inrCompactCache[n];
    var out;
    if (n >= 1e7) out = '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
    else if (n >= 1e5) out = '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
    else if (n >= 1000) out = '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    else out = '₹' + Math.round(n);
    inrCompactCache[n] = out;
    return out;
  };

  fmt.tons = function (n) {
    if (n == null) return '—';
    return (Math.round(n * 10) / 10) + ' t';
  };

  fmt.km = function (n) {
    if (n == null) return '—';
    return fmt.num(n) + ' km';
  };

  fmt.perKm = function (amount, km) {
    if (!km) return '—';
    return '₹' + (Math.round((amount / km) * 10) / 10) + '/km';
  };

  fmt.pct = function (n, digits) {
    if (n == null || isNaN(n)) return '—';
    return (digits ? n.toFixed(digits) : Math.round(n)) + '%';
  };

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  fmt.date = function (ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  };

  fmt.dateFull = function (ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  };

  fmt.time = function (ms) {
    if (!ms) return '—';
    var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  };

  fmt.datetime = function (ms) {
    if (!ms) return '—';
    return fmt.date(ms) + ', ' + fmt.time(ms);
  };

  /* Human day label relative to the virtual clock. */
  fmt.day = function (ms) {
    if (!ms) return '—';
    var now = CB.clock.now();
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    var b = new Date(ms); b.setHours(0, 0, 0, 0);
    var diff = Math.round((b - a) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return fmt.date(ms);
  };

  fmt.relative = function (ms) {
    if (!ms) return '—';
    var d = CB.clock.now() - ms;
    var future = d < 0;
    d = Math.abs(d);
    var s = Math.round(d / 1000), out;
    if (s < 45) out = 'just now';
    else if (s < 3600) out = Math.round(s / 60) + 'm';
    else if (s < 86400) out = Math.round(s / 3600) + 'h';
    else if (s < 2592000) out = Math.round(s / 86400) + 'd';
    else out = fmt.date(ms);
    if (out === 'just now') return future ? 'any moment' : 'just now';
    if (out.indexOf('₹') === 0 || /[A-Z]/.test(out[0])) return out;
    return future ? 'in ' + out : out + ' ago';
  };

  /* "5h 42m" / "40m 12s" / "Closed" - for bid windows. */
  fmt.countdown = function (targetMs) {
    var left = targetMs - CB.clock.now();
    if (left <= 0) return 'Closed';
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    return s + 's';
  };

  fmt.hours = function (h) {
    if (h == null) return '—';
    if (h < 1) return Math.round(h * 60) + ' min';
    if (h < 24) return (Math.round(h * 10) / 10) + ' hr';
    var d = Math.floor(h / 24), r = Math.round(h % 24);
    return d + 'd' + (r ? ' ' + r + 'h' : '');
  };

  fmt.place = function (p) {
    if (!p) return '—';
    return p.city + (p.state ? ', ' + p.state : '');
  };

  fmt.stars = function (rating, size) {
    var full = Math.round(rating || 0);
    var out = '<span class="stars' + (size ? ' stars-' + size : '') + '" aria-label="' +
      (Math.round((rating || 0) * 10) / 10) + ' out of 5">';
    for (var i = 1; i <= 5; i++) {
      out += '<i class="' + (i <= full ? 'ri-star-fill' : 'ri-star-line dim') + '"></i>';
    }
    return out + '</span>';
  };

  /* ------------------------------------------------------------------------
     4. VIRTUAL CLOCK
     Sim time advances faster than wall time so a 6h bid window plays out in
     seconds. now() interpolates between committed ticks so countdowns are
     smooth without writing to storage every frame.
     ------------------------------------------------------------------------ */

  var anchorReal = (window.performance && performance.now) ? performance.now() : Date.now();

  function realNow() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  CB.clock = {
    SPEEDS: [0, 1, 5, 20, 60],

    now: function () {
      var c = CB.db.clock;
      return Math.round(c.t + (realNow() - anchorReal) * c.speed);
    },

    /* Fold interpolated drift back into stored time. Call before any write. */
    commit: function () {
      var c = CB.db.clock;
      var r = realNow();
      c.t = Math.round(c.t + (r - anchorReal) * c.speed);
      anchorReal = r;
      return c.t;
    },

    setSpeed: function (mult) {
      CB.clock.commit();
      CB.db.clock.speed = mult;
      CB.save();
      CB.emit('clock:speed', mult);
    },

    speed: function () { return CB.db.clock.speed; },

    /* Jump the world forward by n virtual milliseconds. */
    advance: function (ms) {
      CB.clock.commit();
      CB.db.clock.t += ms;
      CB.save();
      CB.emit('clock:jump', ms);
    },

    hours: function (n) { return n * 3600000; },
    days: function (n) { return n * 86400000; },
    mins: function (n) { return n * 60000; }
  };

  /* ------------------------------------------------------------------------
     5. STORE + PERSISTENCE
     ------------------------------------------------------------------------ */

  var memoryStore = {};
  var storageOK = (function () {
    try {
      window.localStorage.setItem('cargobid.probe', '1');
      window.localStorage.removeItem('cargobid.probe');
      return true;
    } catch (e) { return false; }
  })();

  var store = {
    get: function (k) {
      try { return storageOK ? window.localStorage.getItem(k) : (memoryStore[k] || null); }
      catch (e) { return memoryStore[k] || null; }
    },
    set: function (k, v) {
      try { if (storageOK) { window.localStorage.setItem(k, v); return; } } catch (e) {}
      memoryStore[k] = v;
    },
    del: function (k) {
      try { if (storageOK) { window.localStorage.removeItem(k); return; } } catch (e) {}
      delete memoryStore[k];
    }
  };
  CB.store = store;
  CB.storagePersistent = storageOK;

  CB.emptyDb = function () {
    return {
      v: CB.VERSION,
      clock: { t: Date.now(), speed: 1 },
      session: { userId: null },
      users: [], shippers: [], transporters: [], trucks: [],
      loads: [], bids: [], threads: [], messages: [], trips: [],
      reviews: [], notifs: [], events: [],
      seq: { load: 1040, bid: 8800, trip: 200, thread: 500, msg: 9000, review: 700, notif: 4000, truck: 300 }
    };
  };

  CB.db = CB.emptyDb();

  CB.load = function () {
    var raw = store.get(CB.KEY);
    if (!raw) return false;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== CB.VERSION) return false;
      CB.db = parsed;
      anchorReal = realNow();
      return true;
    } catch (e) {
      console.warn('CargoBid: corrupt store, starting fresh.', e);
      return false;
    }
  };

  var saveTimer = null;
  CB.save = function (opts) {
    CB.clock.commit();
    var write = function () {
      saveTimer = null;
      try { store.set(CB.KEY, JSON.stringify(CB.db)); }
      catch (e) { console.warn('CargoBid: save failed', e); }
      if (!opts || !opts.silent) CB.bus.post({ type: 'db' });
    };
    if (opts && opts.now) { if (saveTimer) { clearTimeout(saveTimer); } write(); return; }
    if (saveTimer) return;
    saveTimer = setTimeout(write, 90);
  };

  CB.nextId = function (kind, prefix) {
    CB.db.seq[kind] = (CB.db.seq[kind] || 0) + 1;
    return prefix + '-' + CB.db.seq[kind];
  };

  CB.reset = function (opts) {
    store.del(CB.KEY);
    CB.db = CB.emptyDb();
    anchorReal = realNow();
    if (CB.seed) CB.seed.build();
    CB.save({ now: true });
    if (!opts || !opts.quiet) CB.bus.post({ type: 'reset' });
    CB.emit('change');
  };

  /* Called once per page. Seeds on first ever visit. */
  CB.boot = function () {
    if (CB.booted) return CB.db;
    CB.booted = true;
    var had = CB.load();
    if (!had) {
      if (CB.seed) CB.seed.build();
      CB.save({ now: true, silent: true });
    }
    CB.handoff.adopt();          /* ?as= / sessionStorage -> db.session */
    CB.bus.init();
    CB.leader.init();
    if (CB.sim) CB.sim.init();
    return CB.db;
  };

  /* ------------------------------------------------------------------------
     6. EVENT BUS - in-page pubsub + cross-tab broadcast
     ------------------------------------------------------------------------ */

  var listeners = {};

  CB.on = function (evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return function () { CB.off(evt, fn); };
  };

  CB.off = function (evt, fn) {
    var a = listeners[evt];
    if (!a) return;
    var i = a.indexOf(fn);
    if (i > -1) a.splice(i, 1);
  };

  CB.emit = function (evt, payload) {
    var a = (listeners[evt] || []).slice();
    for (var i = 0; i < a.length; i++) {
      try { a[i](payload); } catch (e) { console.error('CargoBid listener error on "' + evt + '"', e); }
    }
    if (evt !== 'change' && evt !== 'tick' && evt !== 'any') CB.emit('any', { evt: evt, payload: payload });
  };

  /* Cross-tab: BroadcastChannel where available, storage event as fallback.
     Open the shipper in one tab and the transporter in another, and bids
     land live on both. */
  CB.bus = {
    ch: null,
    init: function () {
      if (CB.bus.ready) return;
      CB.bus.ready = true;
      try {
        if (window.BroadcastChannel) {
          CB.bus.ch = new BroadcastChannel('cargobid');
          CB.bus.ch.onmessage = function (e) { CB.bus.receive(e.data); };
        }
      } catch (e) { CB.bus.ch = null; }

      window.addEventListener('storage', function (e) {
        if (e.key === CB.KEY) CB.bus.receive({ type: 'db', from: 'storage' });
      });
    },
    post: function (msg) {
      msg.tab = CB.TAB;
      if (CB.bus.ch) { try { CB.bus.ch.postMessage(msg); } catch (e) {} }
    },
    receive: function (msg) {
      if (!msg || msg.tab === CB.TAB) return;
      if (msg.type === 'db' || msg.type === 'reset') {
        CB.load();
        CB.emit('change', { remote: true });
        if (msg.type === 'reset') CB.emit('reset', { remote: true });
      } else if (msg.type === 'toast') {
        CB.toast(msg.body, msg.kind);
      }
    }
  };

  /* Only one tab drives the simulation, otherwise the clock runs N times
     too fast with N tabs open. Cheapest possible lease-based election. */
  CB.leader = {
    init: function () {
      if (CB.leader.ready) return;
      CB.leader.ready = true;
      CB.leader.beat();
      setInterval(CB.leader.beat, 1500);
      window.addEventListener('beforeunload', function () {
        if (CB.leader.is()) store.del(CB.LEADER_KEY);
      });
    },
    beat: function () {
      var raw = store.get(CB.LEADER_KEY), cur = null;
      try { cur = raw ? JSON.parse(raw) : null; } catch (e) { cur = null; }
      var stale = !cur || (Date.now() - cur.ts) > 4000;
      if (stale || cur.id === CB.TAB) {
        store.set(CB.LEADER_KEY, JSON.stringify({ id: CB.TAB, ts: Date.now() }));
        CB.leader._is = true;
      } else {
        CB.leader._is = false;
      }
    },
    is: function () { return !!CB.leader._is; }
  };

  /* ------------------------------------------------------------------------
     7. QUERIES
     ------------------------------------------------------------------------ */

  function find(coll, id) {
    var a = CB.db[coll];
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  var q = (CB.q = {});

  q.user = function (id) { return find('users', id); };
  q.load = function (id) { return find('loads', id); };
  q.bid = function (id) { return find('bids', id); };
  q.trip = function (id) { return find('trips', id); };
  q.truck = function (id) { return find('trucks', id); };
  q.thread = function (id) { return find('threads', id); };

  q.shipper = function (userId) {
    var a = CB.db.shippers;
    for (var i = 0; i < a.length; i++) if (a[i].userId === userId) return a[i];
    return null;
  };

  q.transporter = function (userId) {
    var a = CB.db.transporters;
    for (var i = 0; i < a.length; i++) if (a[i].userId === userId) return a[i];
    return null;
  };

  /* Everything a bid row needs to render, in one object. */
  q.transporterCard = function (userId) {
    var u = q.user(userId), t = q.transporter(userId);
    if (!u || !t) return null;
    return {
      id: userId, name: u.name, company: u.company, phone: u.phone, city: u.city,
      t: t, verified: t.verified, fleetSize: t.fleetSize,
      rating: CB.score.avgRating(t), reliability: t.reliability,
      band: CB.score.band(t.reliability),
      trucks: q.trucksOf(userId)
    };
  };

  q.trucksOf = function (userId) {
    return CB.db.trucks.filter(function (x) { return x.ownerId === userId; });
  };

  q.idleTrucksOf = function (userId) {
    return q.trucksOf(userId).filter(function (x) { return x.status === 'idle'; });
  };

  q.loadsOf = function (shipperId) {
    return CB.db.loads.filter(function (l) { return l.shipperId === shipperId; })
      .sort(util.by('createdAt', 'desc'));
  };

  q.openLoads = function () {
    return CB.db.loads.filter(function (l) { return l.status === 'open'; })
      .sort(util.by('createdAt', 'desc'));
  };

  q.bidsFor = function (loadId) {
    return CB.db.bids.filter(function (b) { return b.loadId === loadId; })
      .sort(util.by('amount'));
  };

  q.liveBidsFor = function (loadId) {
    return q.bidsFor(loadId).filter(function (b) {
      return b.status !== 'withdrawn' && b.status !== 'lost';
    });
  };

  q.bidsOf = function (transporterId) {
    return CB.db.bids.filter(function (b) { return b.transporterId === transporterId; })
      .sort(util.by('createdAt', 'desc'));
  };

  q.myBidOn = function (loadId, transporterId) {
    var a = CB.db.bids;
    for (var i = 0; i < a.length; i++) {
      if (a[i].loadId === loadId && a[i].transporterId === transporterId &&
          a[i].status !== 'withdrawn') return a[i];
    }
    return null;
  };

  q.lowestBid = function (loadId) {
    var live = q.liveBidsFor(loadId);
    return live.length ? live[0] : null;
  };

  q.tripFor = function (loadId) {
    var a = CB.db.trips;
    for (var i = 0; i < a.length; i++) if (a[i].loadId === loadId) return a[i];
    return null;
  };

  q.tripsOf = function (transporterId) {
    return CB.db.trips.filter(function (t) { return t.transporterId === transporterId; })
      .sort(util.by('createdAt', 'desc'));
  };

  q.tripsForShipper = function (shipperId) {
    return CB.db.trips.filter(function (t) {
      var l = q.load(t.loadId);
      return l && l.shipperId === shipperId;
    }).sort(util.by('createdAt', 'desc'));
  };

  q.threadFor = function (loadId, transporterId) {
    var a = CB.db.threads;
    for (var i = 0; i < a.length; i++) {
      if (a[i].loadId === loadId && a[i].transporterId === transporterId) return a[i];
    }
    return null;
  };

  q.threadsOf = function (userId) {
    return CB.db.threads.filter(function (t) {
      return t.shipperId === userId || t.transporterId === userId;
    }).sort(util.by('lastAt', 'desc'));
  };

  q.messagesIn = function (threadId) {
    return CB.db.messages.filter(function (m) { return m.threadId === threadId; })
      .sort(util.by('at'));
  };

  q.notifsOf = function (userId) {
    return CB.db.notifs.filter(function (n) { return n.userId === userId; })
      .sort(util.by('at', 'desc'));
  };

  q.unreadCount = function (userId) {
    return q.notifsOf(userId).filter(function (n) { return !n.read; }).length;
  };

  q.reviewsAbout = function (userId) {
    return CB.db.reviews.filter(function (r) { return r.aboutId === userId; })
      .sort(util.by('at', 'desc'));
  };

  q.reviewFor = function (tripId, byId) {
    var a = CB.db.reviews;
    for (var i = 0; i < a.length; i++) {
      if (a[i].tripId === tripId && a[i].byId === byId) return a[i];
    }
    return null;
  };

  /* ------------------------------------------------------------------------
     8. SCORING - the trust engine. One home for these formulas.
     ------------------------------------------------------------------------ */

  var score = (CB.score = {});

  score.avgRating = function (t) {
    if (!t || !t.ratings || !t.ratings.count) return 0;
    var r = t.ratings;
    return Math.round(((r.punctuality + r.cargoSafety + r.communication) / 3) * 10) / 10;
  };

  score.reliability = function (t) {
    if (!t) return 0;
    var avg = score.avgRating(t);
    var s = 70;
    s += Math.min(15, (t.onTimeDeliveries || 0) * 0.5);
    s += t.verified ? 8 : 0;
    s += util.clamp((avg - 4) * 10, -10, 10);
    s -= (t.cancellations || 0) * 6;
    s -= (t.noShows || 0) * 12;
    return Math.round(util.clamp(s, 0, 100));
  };

  score.band = function (n) {
    if (n >= 90) return { key: 'excellent', label: 'Excellent', chip: 'chip-ok' };
    if (n >= 75) return { key: 'good', label: 'Good', chip: 'chip-accent' };
    if (n >= 60) return { key: 'fair', label: 'Fair', chip: 'chip-warn' };
    return { key: 'risk', label: 'At risk', chip: 'chip-stop' };
  };

  score.winRate = function (t) {
    if (!t || !t.bidsPlaced) return 0;
    return Math.round((t.bidsWon / t.bidsPlaced) * 100);
  };

  score.recompute = function (userId) {
    var t = q.transporter(userId);
    if (!t) return;
    t.reliability = score.reliability(t);
  };

  /* Best value = cheapest is not always best. Normalise price, reliability,
     rating and pickup ETA onto 0..1 and weight them. Returns 0..100. */
  score.valueOf = function (bid, allBids) {
    var card = q.transporterCard(bid.transporterId);
    if (!card) return 0;
    var amounts = allBids.map(function (b) { return b.amount; });
    var lo = Math.min.apply(null, amounts), hi = Math.max.apply(null, amounts);
    var etas = allBids.map(function (b) { return b.etaPickupHrs; });
    var eLo = Math.min.apply(null, etas), eHi = Math.max.apply(null, etas);

    var priceScore = hi === lo ? 1 : 1 - (bid.amount - lo) / (hi - lo);
    var etaScore = eHi === eLo ? 1 : 1 - (bid.etaPickupHrs - eLo) / (eHi - eLo);
    var relScore = card.reliability / 100;
    var ratingScore = card.rating ? card.rating / 5 : 0.5;

    return Math.round((priceScore * 0.44 + relScore * 0.26 + ratingScore * 0.18 + etaScore * 0.12) * 100);
  };

  score.rankBest = function (loadId) {
    var bids = q.liveBidsFor(loadId);
    if (bids.length < 2) return null;
    var best = null, bestV = -1;
    bids.forEach(function (b) {
      var v = score.valueOf(b, bids);
      if (v > bestV) { bestV = v; best = b; }
    });
    return best ? { bid: best, value: bestV } : null;
  };

  /* ------------------------------------------------------------------------
     9. AUTH (a shim - no passwords, this is a demo)
     ------------------------------------------------------------------------ */

  CB.auth = {
    user: function () {
      var id = CB.db.session.userId;
      return id ? q.user(id) : null;
    },
    signIn: function (userId) {
      CB.db.session.userId = userId;
      CB.handoff.remember(userId);
      CB.save({ now: true });
      CB.emit('auth', userId);
    },
    signOut: function () {
      CB.db.session.userId = null;
      CB.handoff.forget();
      CB.save({ now: true });
      CB.emit('auth', null);
    },
    /* Guard a page. Redirects to login if the wrong side is signed in. */
    require: function (role) {
      var u = CB.auth.user();
      if (!u || (role && u.role !== role)) {
        var here = location.pathname.split('/').slice(-2).join('/');
        /* If we believed we were signed in, the store lost the session. Say
           so, rather than bouncing back looking like the button did nothing. */
        var why = (!u && CB.handoff.pending()) ? '&why=session' : '';
        location.replace(CB.rel('login.html') + '?need=' + encodeURIComponent(role || '') +
          '&next=' + encodeURIComponent(here) + why);
        return null;
      }
      return u;
    },
    home: function (role) {
      return role === 'transporter' ? 'transporter/dashboard.html' : 'shipper/dashboard.html';
    }
  };

  /* ------------------------------------------------------------------------
     9b. SESSION HAND-OFF
     A navigation has to carry the signed-in user with it. Normally the
     session just rides along inside the saved db - but that breaks the
     moment the store cannot persist (private windows, blocked site data,
     the in-memory fallback), and the symptom is nasty: you sign in, the
     dashboard boots with an empty session, auth.require bounces you back
     to the login page, and it looks like the button did nothing.

     So signing in writes two redundant channels as well:
       - sessionStorage, which survives navigation within the tab
       - an ?as=<userId> parameter on the destination URL
     boot() reconciles whichever one survived back into db.session.
     ------------------------------------------------------------------------ */

  var SS_USER = 'cargobid.session';

  function ssGet(k) {
    try { return window.sessionStorage ? window.sessionStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function ssSet(k, v) {
    try { if (window.sessionStorage) window.sessionStorage.setItem(k, v); } catch (e) {}
  }

  CB.handoff = {
    /* Stamp the session onto a URL we are about to navigate to. */
    tag: function (url, userId) {
      if (!url || !userId) return url;
      var hash = '', i = url.indexOf('#');
      if (i > -1) { hash = url.slice(i); url = url.slice(0, i); }
      return url + (url.indexOf('?') > -1 ? '&' : '?') +
        'as=' + encodeURIComponent(userId) + hash;
    },

    remember: function (userId) { ssSet(SS_USER, userId || ''); },
    forget: function () { ssSet(SS_USER, ''); },
    pending: function () { return ssGet(SS_USER) || null; },

    /* Rebuild an account that was created in a store which then failed to
       persist, from the details carried on the URL. */
    rehydrate: function (userId) {
      var role = CB.param('nurole');
      if (role !== 'shipper' && role !== 'transporter') return;
      var name = CB.param('nuname') || 'New user';
      var city = CB.param('nucity') || '—';
      var now = CB.clock.now();

      CB.db.users.push({
        id: userId, role: role, name: name,
        company: CB.param('nucompany') || name,
        phone: '', email: null, city: city, avatarSeed: userId
      });
      if (role === 'shipper') {
        CB.db.shippers.push({
          userId: userId, gstin: '', loadsPosted: 0, rating: null,
          sector: 'General freight', blurb: '', featured: false, memberSince: now
        });
      } else {
        CB.db.transporters.push(CB.blankCarrier(userId, city, now));
      }
    },

    /* Called by boot(): whichever channel survived wins. */
    adopt: function () {
      var want = CB.param('as') || ssGet(SS_USER) || null;
      if (!want) return;
      if (!q.user(want)) CB.handoff.rehydrate(want);
      if (!q.user(want)) return;          // unknown id - leave the session alone
      ssSet(SS_USER, want);
      if (CB.db.session.userId === want) return;
      CB.db.session.userId = want;
      CB.save({ now: true, silent: true });
    }
  };

  /* A carrier profile with no history yet. Shared by sign-up and by the
     hand-off rebuild above so the two can never drift apart. */
  CB.blankCarrier = function (userId, city, now) {
    var prof = {
      userId: userId, homeBase: city, currentCity: city, availableFrom: now,
      radiusKm: 60, fleetSize: 0, truckTypes: [],
      docs: { gst: 'none', pan: 'none', rc: 'none' },
      docRefs: { gst: '', pan: '', rc: '' },
      verified: false, hazmatLicence: false, prefersSms: false,
      ratings: { punctuality: 0, cargoSafety: 0, communication: 0, count: 0 },
      deliveries: 0, onTimeDeliveries: 0, lateDeliveries: 0, onTimeRate: 0,
      cancellations: 0, noShows: 0, bidsPlaced: 0, bidsWon: 0,
      blurb: '', featured: false, memberSince: now, reliability: 0
    };
    prof.reliability = CB.score.reliability(prof);
    return prof;
  };

  /* Path helper: pages live at the root and one level deep, so links need a
     prefix that works from both. */
  CB.depth = function () {
    var p = location.pathname.replace(/\\/g, '/');
    return /\/(shipper|transporter)\//.test(p) ? 1 : 0;
  };

  CB.rel = function (path) {
    return (CB.depth() ? '../' : '') + path;
  };

  CB.asset = function (path) {
    return CB.rel('assets/' + path);
  };

  /* ------------------------------------------------------------------------
     10. NOTIFICATIONS
     ------------------------------------------------------------------------ */

  CB.notify = function (userId, kind, title, body, href, channel) {
    if (!userId) return null;
    var n = {
      id: CB.nextId('notif', 'N'),
      userId: userId, kind: kind, title: title, body: body || '',
      href: href || '', channel: channel || 'app',
      at: CB.clock.now(), read: false
    };
    CB.db.notifs.push(n);
    if (CB.db.notifs.length > 400) CB.db.notifs.splice(0, CB.db.notifs.length - 400);
    return n;
  };

  CB.markNotifsRead = function (userId) {
    q.notifsOf(userId).forEach(function (n) { n.read = true; });
    CB.save();
    CB.emit('change');
  };

  /* The demo console's event log. */
  CB.logEvent = function (kind, text) {
    CB.db.events.push({ kind: kind, text: text, at: CB.clock.now() });
    if (CB.db.events.length > 120) CB.db.events.splice(0, CB.db.events.length - 120);
    CB.emit('log', { kind: kind, text: text });
  };

  /* ------------------------------------------------------------------------
     11. MUTATIONS - all state changes funnel through here
     ------------------------------------------------------------------------ */

  var act = (CB.act = {});

  act.postLoad = function (input) {
    var now = CB.clock.now();
    var o = CB.city(input.origin.city), d = CB.city(input.destination.city);
    var load = {
      id: CB.nextId('load', 'LD'),
      shipperId: input.shipperId,
      title: input.title,
      origin: {
        city: input.origin.city, state: o ? o.state : '',
        pincode: input.origin.pincode || '', address: input.origin.address || '',
        lat: o ? o.lat : 0, lng: o ? o.lng : 0
      },
      destination: {
        city: input.destination.city, state: d ? d.state : '',
        pincode: input.destination.pincode || '', address: input.destination.address || '',
        lat: d ? d.lat : 0, lng: d ? d.lng : 0
      },
      distanceKm: CB.match ? CB.match.roadKm(input.origin.city, input.destination.city) : 0,
      material: {
        name: input.material.name,
        category: input.material.category || 'General',
        weightTons: Number(input.material.weightTons) || 1,
        dims: input.material.dims || '',
        flags: input.material.flags || {}
      },
      need: {
        truckType: input.need.truckType,
        minCapacityTons: Number(input.need.minCapacityTons) || Number(input.material.weightTons) || 1,
        bodyFt: Number(input.need.bodyFt) || null,
        count: Number(input.need.count) || 1
      },
      pickup: {
        from: input.pickup.from, to: input.pickup.to,
        flexible: !!input.pickup.flexible, flexDays: Number(input.pickup.flexDays) || 0
      },
      deliverBy: input.deliverBy || null,
      mode: input.mode === 'blind' ? 'blind' : 'open',
      targetPrice: input.targetPrice ? Number(input.targetPrice) : null,
      ceiling: input.ceiling ? Number(input.ceiling) : null,
      bidCloseAt: now + CB.clock.hours(Number(input.bidWindowHrs) || 6),
      status: 'open',
      awardedBidId: null,
      notified: [],
      views: 0,
      createdAt: now
    };

    if (CB.match) {
      var matches = CB.match.notifyList(load);
      load.notified = matches.map(function (m) { return m.id; });
      matches.forEach(function (m) {
        var ch = m.card.t.prefersSms ? 'sms' : 'app';
        CB.notify(m.id, 'new-load',
          'New load: ' + load.origin.city + ' → ' + load.destination.city,
          fmt.tons(load.material.weightTons) + ' ' + load.material.name + ' · ' +
            CB.truckType(load.need.truckType).label + ' · bids close ' + fmt.countdown(load.bidCloseAt),
          'transporter/load.html?id=' + load.id, ch);
      });
    }

    CB.db.loads.push(load);
    var sh = q.shipper(input.shipperId);
    if (sh) sh.loadsPosted = (sh.loadsPosted || 0) + 1;

    CB.logEvent('load', load.id + ' posted · ' + load.origin.city + ' → ' + load.destination.city +
      ' · notified ' + load.notified.length);
    CB.save({ now: true });
    CB.emit('change');
    CB.emit('load:posted', load);
    return load;
  };

  act.placeBid = function (input) {
    var load = q.load(input.loadId);
    if (!load) return { error: 'Load not found.' };
    if (load.status !== 'open') return { error: 'Bidding has closed on this load.' };
    if (CB.clock.now() > load.bidCloseAt) return { error: 'The bid window has expired.' };

    var amount = Math.round(Number(input.amount));
    if (!amount || amount <= 0) return { error: 'Enter a valid amount.' };
    if (load.ceiling && amount > load.ceiling) {
      return { error: 'Above the shipper ceiling of ' + fmt.money(load.ceiling) + '.' };
    }

    var t = q.transporter(input.transporterId);
    var existing = q.myBidOn(input.loadId, input.transporterId);
    var now = CB.clock.now();
    var bid;

    if (existing) {
      existing.history = existing.history || [];
      existing.history.push({ amount: existing.amount, at: existing.updatedAt || existing.createdAt });
      existing.amount = amount;
      existing.etaPickupHrs = Number(input.etaPickupHrs) || existing.etaPickupHrs;
      existing.truckId = input.truckId || existing.truckId;
      existing.note = input.note != null ? input.note : existing.note;
      existing.updatedAt = now;
      existing.status = 'active';
      bid = existing;
    } else {
      var truck = input.truckId ? q.truck(input.truckId) : null;
      bid = {
        id: CB.nextId('bid', 'BID'),
        loadId: load.id,
        transporterId: input.transporterId,
        amount: amount,
        etaPickupHrs: Number(input.etaPickupHrs) || 6,
        truckId: input.truckId || null,
        truckType: truck ? truck.type : (input.truckType || load.need.truckType),
        note: input.note || '',
        validUntil: now + CB.clock.hours(Number(input.validHrs) || 12),
        status: 'active',
        counters: [],
        history: [],
        isBot: !!input.isBot,
        createdAt: now,
        updatedAt: now
      };
      CB.db.bids.push(bid);
      if (t) t.bidsPlaced = (t.bidsPlaced || 0) + 1;
    }

    act._restatus(load);

    var u = q.user(input.transporterId);
    CB.notify(load.shipperId, 'new-bid',
      (existing ? 'Revised bid' : 'New bid') + ' on ' + load.id,
      (u ? u.company : 'A transporter') + ' bid ' + fmt.money(amount) +
        ' · pickup in ' + fmt.hours(bid.etaPickupHrs),
      'shipper/load.html?id=' + load.id);

    CB.logEvent('bid', (u ? u.company : '?') + ' → ' + fmt.money(amount) + ' on ' + load.id);
    CB.save();
    CB.emit('change');
    CB.emit('bid:placed', bid);
    return { bid: bid };
  };

  /* In an open reverse auction only the current lowest is "Leading"; the rest
     are visibly Outbid. In a blind auction nobody is ranked. */
  act._restatus = function (load) {
    var live = CB.db.bids.filter(function (b) {
      return b.loadId === load.id && (b.status === 'active' || b.status === 'outbid' || b.status === 'placed');
    });
    if (!live.length) return;
    if (load.mode === 'blind') {
      live.forEach(function (b) { b.status = 'placed'; });
      return;
    }
    var lowest = live.slice().sort(util.by('amount'))[0];
    live.forEach(function (b) { b.status = b.id === lowest.id ? 'active' : 'outbid'; });
  };

  act.withdrawBid = function (bidId) {
    var bid = q.bid(bidId);
    if (!bid) return { error: 'Bid not found.' };
    var load = q.load(bid.loadId);
    if (load && (load.status === 'awarded' || load.status === 'in-transit')) {
      return { error: 'Cannot withdraw after award.' };
    }
    bid.status = 'withdrawn';
    bid.updatedAt = CB.clock.now();
    if (load) act._restatus(load);
    CB.logEvent('bid', bid.id + ' withdrawn');
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.closeBidding = function (loadId) {
    var load = q.load(loadId);
    if (!load || load.status !== 'open') return { error: 'Not open.' };
    load.status = 'closed';
    load.bidCloseAt = Math.min(load.bidCloseAt, CB.clock.now());
    CB.logEvent('load', load.id + ' bidding closed · ' + q.liveBidsFor(loadId).length + ' bids');
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.cancelLoad = function (loadId) {
    var load = q.load(loadId);
    if (!load) return { error: 'Load not found.' };
    load.status = 'cancelled';
    q.bidsFor(loadId).forEach(function (b) {
      if (b.status !== 'withdrawn') b.status = 'lost';
      CB.notify(b.transporterId, 'load-cancelled', load.id + ' was cancelled',
        'The shipper withdrew this load.', 'transporter/bids.html');
    });
    CB.logEvent('load', load.id + ' cancelled');
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.awardBid = function (bidId) {
    var bid = q.bid(bidId);
    if (!bid) return { error: 'Bid not found.' };
    var load = q.load(bid.loadId);
    if (!load) return { error: 'Load not found.' };
    if (load.awardedBidId) return { error: 'Already awarded.' };

    var now = CB.clock.now();
    load.status = 'awarded';
    load.awardedBidId = bid.id;
    bid.status = 'won';

    q.bidsFor(load.id).forEach(function (b) {
      if (b.id !== bid.id && b.status !== 'withdrawn') {
        b.status = 'lost';
        CB.notify(b.transporterId, 'bid-lost', 'Not awarded: ' + load.id,
          load.origin.city + ' → ' + load.destination.city + ' went to another transporter.',
          'transporter/bids.html');
      }
    });

    var t = q.transporter(bid.transporterId);
    if (t) t.bidsWon = (t.bidsWon || 0) + 1;

    /* Pick the bid truck, else any idle truck of the right type. */
    var truck = bid.truckId ? q.truck(bid.truckId) : null;
    if (!truck) {
      var pool = q.idleTrucksOf(bid.transporterId).filter(function (x) {
        return x.type === load.need.truckType;
      });
      truck = pool[0] || q.idleTrucksOf(bid.transporterId)[0] || q.trucksOf(bid.transporterId)[0];
    }
    if (truck) { truck.status = 'on-trip'; bid.truckId = truck.id; }

    var drivers = [
      { name: 'Ramesh Yadav', phone: '+91 98290 41562' },
      { name: 'Sukhbir Singh', phone: '+91 98110 77340' },
      { name: 'Iqbal Khan', phone: '+91 99280 15509' },
      { name: 'Mahesh Patil', phone: '+91 90280 63311' },
      { name: 'Devendra Meena', phone: '+91 94140 22876' },
      { name: 'Jaswant Rathore', phone: '+91 93510 66214' }
    ];
    var rand = util.rng(parseInt(bid.id.replace(/\D/g, ''), 10) || 7);

    var trip = {
      id: CB.nextId('trip', 'TRP'),
      loadId: load.id, bidId: bid.id,
      transporterId: bid.transporterId,
      truckId: truck ? truck.id : null,
      driver: util.pick(rand, drivers),
      lrNumber: 'LR' + (100000 + Math.floor(rand() * 899999)),
      amount: bid.amount,
      status: 'assigned',
      podUrl: null,
      checkpoints: CB.TRIP_STEPS.map(function (s, i) {
        return {
          key: s.key, label: s.label, note: s.note,
          city: i <= 2 ? load.origin.city : (i === 3 ? null : load.destination.city),
          done: i === 0, at: i === 0 ? now : null
        };
      }),
      createdAt: now
    };
    CB.db.trips.push(trip);

    CB.notify(bid.transporterId, 'bid-won', 'You won ' + load.id + ' 🎉',
      load.origin.city + ' → ' + load.destination.city + ' at ' + fmt.money(bid.amount) +
        (truck ? ' · assigned ' + truck.regNo : ''),
      'transporter/trips.html');

    var u = q.user(bid.transporterId);
    CB.logEvent('award', load.id + ' awarded to ' + (u ? u.company : '?') + ' at ' + fmt.money(bid.amount));
    CB.save({ now: true });
    CB.emit('change');
    CB.emit('bid:awarded', { bid: bid, trip: trip });
    return { trip: trip };
  };

  act.counterOffer = function (input) {
    var bid = q.bid(input.bidId);
    if (!bid) return { error: 'Bid not found.' };
    var load = q.load(bid.loadId);
    var now = CB.clock.now();
    var counter = {
      by: input.by,
      amount: Math.round(Number(input.amount)),
      pickupAt: input.pickupAt || null,
      note: input.note || '',
      at: now,
      state: 'pending'
    };
    bid.counters = bid.counters || [];
    bid.counters.push(counter);

    var thread = act._thread(load, bid.transporterId);
    var body = 'Counter-offer: ' + fmt.money(counter.amount) +
      (counter.pickupAt ? ' · pickup ' + fmt.day(counter.pickupAt) + ' ' + fmt.time(counter.pickupAt) : '') +
      (counter.note ? '\n' + counter.note : '');
    act._msg(thread, input.by === 'shipper' ? load.shipperId : bid.transporterId, body, 'counter');

    var to = input.by === 'shipper' ? bid.transporterId : load.shipperId;
    CB.notify(to, 'counter', 'Counter-offer on ' + load.id, body,
      (input.by === 'shipper' ? 'transporter/load.html?id=' : 'shipper/load.html?id=') + load.id);

    CB.logEvent('counter', 'Counter ' + fmt.money(counter.amount) + ' on ' + bid.id + ' by ' + input.by);
    CB.save();
    CB.emit('change');
    return { counter: counter };
  };

  act.respondCounter = function (bidId, accept) {
    var bid = q.bid(bidId);
    if (!bid || !bid.counters || !bid.counters.length) return { error: 'No counter-offer.' };
    var c = bid.counters[bid.counters.length - 1];
    var load = q.load(bid.loadId);
    c.state = accept ? 'accepted' : 'declined';
    if (accept) {
      bid.history = bid.history || [];
      bid.history.push({ amount: bid.amount, at: bid.updatedAt || bid.createdAt });
      bid.amount = c.amount;
      if (c.pickupAt) bid.agreedPickupAt = c.pickupAt;
      bid.updatedAt = CB.clock.now();
      if (load) act._restatus(load);
    }
    var thread = act._thread(load, bid.transporterId);
    var actor = c.by === 'shipper' ? bid.transporterId : load.shipperId;
    act._msg(thread, actor,
      accept ? 'Accepted at ' + fmt.money(c.amount) + '. Confirmed.'
             : 'Cannot do ' + fmt.money(c.amount) + ' — holding at ' + fmt.money(bid.amount) + '.',
      'system');
    CB.logEvent('counter', bid.id + ' counter ' + (accept ? 'accepted' : 'declined'));
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act._thread = function (load, transporterId) {
    var th = q.threadFor(load.id, transporterId);
    if (th) return th;
    th = {
      id: CB.nextId('thread', 'TH'),
      loadId: load.id,
      shipperId: load.shipperId,
      transporterId: transporterId,
      lastAt: CB.clock.now()
    };
    CB.db.threads.push(th);
    return th;
  };

  act._msg = function (thread, fromId, body, kind) {
    var m = {
      id: CB.nextId('msg', 'M'),
      threadId: thread.id, fromId: fromId, body: body,
      kind: kind || 'text', at: CB.clock.now(), read: false
    };
    CB.db.messages.push(m);
    thread.lastAt = m.at;
    return m;
  };

  act.sendMessage = function (input) {
    var load = q.load(input.loadId);
    if (!load) return { error: 'Load not found.' };
    var thread = act._thread(load, input.transporterId);
    var m = act._msg(thread, input.fromId, input.body, 'text');
    var to = input.fromId === load.shipperId ? input.transporterId : load.shipperId;
    var from = q.user(input.fromId);
    CB.notify(to, 'message', 'Message from ' + (from ? from.company : 'CargoBid'),
      input.body.slice(0, 90),
      (to === load.shipperId ? 'shipper/messages.html' : 'transporter/messages.html'));
    CB.save();
    CB.emit('change');
    return { message: m };
  };

  act.markThreadRead = function (threadId, userId) {
    q.messagesIn(threadId).forEach(function (m) { if (m.fromId !== userId) m.read = true; });
    CB.save({ silent: true });
  };

  act.advanceTrip = function (tripId) {
    var trip = q.trip(tripId);
    if (!trip) return { error: 'Trip not found.' };
    var load = q.load(trip.loadId);
    var next = null;
    for (var i = 0; i < trip.checkpoints.length; i++) {
      if (!trip.checkpoints[i].done) { next = trip.checkpoints[i]; break; }
    }
    if (!next) return { error: 'Trip already delivered.' };

    var now = CB.clock.now();
    next.done = true;
    next.at = now;
    trip.status = next.key;
    if (load) load.status = next.key === 'delivered' ? 'delivered' : 'in-transit';

    if (next.key === 'delivered') {
      trip.deliveredAt = now;
      trip.podUrl = 'pod-' + trip.id.toLowerCase() + '.jpg';
      var t = q.transporter(trip.transporterId);
      var late = load && load.deliverBy && now > load.deliverBy;
      if (t) {
        t.deliveries = (t.deliveries || 0) + 1;
        if (late) t.lateDeliveries = (t.lateDeliveries || 0) + 1;
        else t.onTimeDeliveries = (t.onTimeDeliveries || 0) + 1;
        t.onTimeRate = Math.round(((t.onTimeDeliveries || 0) / t.deliveries) * 100);
        /* The truck and the fleet are now sitting at the destination - this is
           exactly the dead-head the backhaul finder exists to solve. */
        t.currentCity = load ? load.destination.city : t.currentCity;
        t.availableFrom = now;
        score.recompute(trip.transporterId);
      }
      var truck = trip.truckId ? q.truck(trip.truckId) : null;
      if (truck) {
        truck.status = 'idle';
        truck.currentCity = load ? load.destination.city : truck.currentCity;
      }
      if (load) {
        CB.notify(load.shipperId, 'delivered', load.id + ' delivered',
          'POD captured. Rate your transporter to keep the network honest.',
          'shipper/trips.html');
      }
    } else if (load) {
      CB.notify(load.shipperId, 'trip', load.id + ' · ' + next.label, next.note,
        'shipper/trips.html');
    }

    CB.logEvent('trip', trip.id + ' → ' + next.label);
    CB.save();
    CB.emit('change');
    CB.emit('trip:advanced', trip);
    return { trip: trip, step: next };
  };

  act.submitReview = function (input) {
    var trip = q.trip(input.tripId);
    if (!trip) return { error: 'Trip not found.' };
    if (q.reviewFor(trip.id, input.byId)) return { error: 'Already reviewed.' };

    var r = {
      id: CB.nextId('review', 'RV'),
      tripId: trip.id, byId: input.byId, aboutId: trip.transporterId,
      punctuality: Number(input.punctuality),
      cargoSafety: Number(input.cargoSafety),
      communication: Number(input.communication),
      comment: input.comment || '',
      at: CB.clock.now()
    };
    CB.db.reviews.push(r);

    var t = q.transporter(trip.transporterId);
    if (t) {
      var c = t.ratings.count || 0;
      t.ratings.punctuality = (t.ratings.punctuality * c + r.punctuality) / (c + 1);
      t.ratings.cargoSafety = (t.ratings.cargoSafety * c + r.cargoSafety) / (c + 1);
      t.ratings.communication = (t.ratings.communication * c + r.communication) / (c + 1);
      t.ratings.count = c + 1;
      score.recompute(trip.transporterId);
      CB.notify(trip.transporterId, 'review', 'New rating received',
        'You scored ' + (Math.round(((r.punctuality + r.cargoSafety + r.communication) / 3) * 10) / 10) +
          '/5 on ' + trip.loadId + '. Reliability is now ' + t.reliability + '.',
        'transporter/dashboard.html');
    }

    CB.logEvent('review', trip.id + ' reviewed · reliability now ' + (t ? t.reliability : '?'));
    CB.save({ now: true });
    CB.emit('change');
    return { review: r };
  };

  act.setCurrentCity = function (transporterId, city, availableFrom) {
    var t = q.transporter(transporterId);
    if (!t) return { error: 'Not found.' };
    t.currentCity = city;
    t.availableFrom = availableFrom || CB.clock.now();
    CB.logEvent('backhaul', (q.user(transporterId) || {}).company + ' now at ' + city);
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.setRadius = function (transporterId, km) {
    var t = q.transporter(transporterId);
    if (!t) return { error: 'Not found.' };
    t.radiusKm = Number(km) || 50;
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.uploadDoc = function (transporterId, kind, ref) {
    var t = q.transporter(transporterId);
    if (!t) return { error: 'Not found.' };
    t.docs[kind] = 'pending';
    t.docRefs = t.docRefs || {};
    t.docRefs[kind] = ref || '';
    t.docSubmittedAt = t.docSubmittedAt || {};
    t.docSubmittedAt[kind] = CB.clock.now();
    CB.logEvent('verify', kind.toUpperCase() + ' submitted by ' + (q.user(transporterId) || {}).company);
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.reviewDoc = function (transporterId, kind, approve) {
    var t = q.transporter(transporterId);
    if (!t) return { error: 'Not found.' };
    t.docs[kind] = approve ? 'verified' : 'rejected';
    var all = t.docs.gst === 'verified' && t.docs.pan === 'verified' && t.docs.rc === 'verified';
    var was = t.verified;
    t.verified = all;
    score.recompute(transporterId);
    CB.notify(transporterId, 'verify',
      kind.toUpperCase() + ' ' + (approve ? 'verified' : 'rejected'),
      all && !was ? 'All documents cleared. Your bids now carry the verified badge.'
                  : 'Verification centre updated.',
      'transporter/fleet.html');
    CB.logEvent('verify', kind.toUpperCase() + ' ' + (approve ? 'verified' : 'rejected') +
      ' for ' + (q.user(transporterId) || {}).company);
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.addTruck = function (input) {
    var truck = {
      id: CB.nextId('truck', 'TK'),
      ownerId: input.ownerId,
      regNo: String(input.regNo || '').toUpperCase(),
      type: input.type,
      capacityTons: Number(input.capacityTons) || 9,
      bodyFt: Number(input.bodyFt) || 20,
      status: 'idle',
      currentCity: input.currentCity
    };
    CB.db.trucks.push(truck);
    var t = q.transporter(input.ownerId);
    if (t) {
      t.fleetSize = q.trucksOf(input.ownerId).length;
      t.truckTypes = util.uniq(q.trucksOf(input.ownerId).map(function (x) { return x.type; }));
    }
    CB.logEvent('fleet', truck.regNo + ' added');
    CB.save();
    CB.emit('change');
    return { truck: truck };
  };

  act.setTruckStatus = function (truckId, status) {
    var t = q.truck(truckId);
    if (!t) return { error: 'Not found.' };
    t.status = status;
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  act.viewLoad = function (loadId) {
    var l = q.load(loadId);
    if (!l) return;
    l.views = (l.views || 0) + 1;
    CB.save({ silent: true });
  };

  /* ------------------------------------------------------------------------
     12. DOM HELPERS
     ------------------------------------------------------------------------ */

  var dom = (CB.dom = {});

  dom.$ = function (sel, root) { return (root || document).querySelector(sel); };
  dom.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  dom.mount = function (sel, html) {
    var el = typeof sel === 'string' ? dom.$(sel) : sel;
    if (el) el.innerHTML = html;
    return el;
  };

  /* Event delegation - render freely without rebinding handlers. */
  dom.on = function (root, evt, sel, fn) {
    var el = typeof root === 'string' ? dom.$(root) : (root || document);
    if (!el) return;
    el.addEventListener(evt, function (e) {
      var target = e.target.closest ? e.target.closest(sel) : null;
      if (target && el.contains(target)) fn.call(target, e, target);
    });
  };

  dom.ready = function (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  };

  CB.param = function (name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  };

  /* ------------------------------------------------------------------------
     13. TOASTS
     ------------------------------------------------------------------------ */

  var ICONS = {
    ok: 'ri-checkbox-circle-fill', info: 'ri-information-fill',
    warn: 'ri-error-warning-fill', stop: 'ri-close-circle-fill',
    bid: 'ri-auction-fill', truck: 'ri-truck-fill', star: 'ri-star-fill'
  };

  CB.toast = function (body, kind) {
    var wrap = dom.$('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<i class="' + (ICONS[kind] || ICONS.info) + '"></i><div>' + body + '</div>';
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 4200);
    return el;
  };

  /* ------------------------------------------------------------------------
     14. SHARED CHROME SNIPPETS
     ------------------------------------------------------------------------ */

  CB.ui = CB.ui || {};

  CB.ui.logo = function (href, label) {
    return '<a class="logo" href="' + (href || CB.rel('index.html')) + '" aria-label="CargoBid home">' +
      '<img src="' + CB.asset('img/logo.svg') + '" alt="" width="34" height="34">' +
      '<span>Cargo<em>Bid</em></span>' +
      (label ? '<span class="logo-tag">' + util.esc(label) + '</span>' : '') +
      '</a>';
  };

  CB.ui.avatar = function (name, seed, size) {
    var tint = util.avatarTint(seed || name);
    return '<span class="avatar' + (size ? ' avatar-' + size : '') + '" style="background:' + tint[0] +
      ';color:' + tint[1] + '" aria-hidden="true">' + util.initials(name) + '</span>';
  };

  CB.ui.verifiedBadge = function (verified, compact) {
    if (verified) {
      return '<span class="badge-verified" title="GST, PAN and RC verified by CargoBid">' +
        '<i class="ri-verified-badge-fill"></i>' + (compact ? '' : 'Verified') + '</span>';
    }
    return '<span class="badge-verified is-off" title="Documents not fully verified">' +
      '<i class="ri-shield-line"></i>' + (compact ? '' : 'Unverified') + '</span>';
  };

  CB.ui.flagChips = function (flags, max) {
    var out = [], n = 0;
    CB.MATERIAL_FLAGS.forEach(function (f) {
      if (!flags || !flags[f.key]) return;
      if (max && n >= max) return;
      n++;
      var tone = f.key === 'hazardous' ? ' chip-stop' : (f.key === 'perishable' ? ' chip-warn' : '');
      out.push('<span class="chip chip-xs' + tone + '"><i class="' + f.icon + '"></i>' + f.label + '</span>');
    });
    return out.join('');
  };

  CB.ui.statusChip = function (status) {
    var s = CB.LOAD_STATUS[status] || { label: status, chip: 'chip' };
    return '<span class="chip chip-xs ' + s.chip + '">' + s.label + '</span>';
  };

  CB.ui.route = function (load, compact) {
    return '<span class="route' + (compact ? ' route-compact' : '') + '">' +
      '<span class="route-city">' + util.esc(load.origin.city) + '</span>' +
      '<span class="route-line" aria-hidden="true"><i class="ri-arrow-right-line"></i></span>' +
      '<span class="route-city">' + util.esc(load.destination.city) + '</span>' +
      '</span>';
  };

  CB.ui.countdown = function (targetMs, prefix) {
    return '<span class="countdown" data-countdown="' + targetMs + '">' +
      (prefix || '') + fmt.countdown(targetMs) + '</span>';
  };

  /* Live-updating countdowns, one interval for the whole page. */
  CB.ui.startCountdowns = function () {
    if (CB.ui._cdTimer) return;
    CB.ui._cdTimer = setInterval(function () {
      dom.$$('[data-countdown]').forEach(function (el) {
        var t = Number(el.getAttribute('data-countdown'));
        var txt = fmt.countdown(t);
        if (el.textContent !== txt) el.textContent = txt;
        el.classList.toggle('is-urgent', t - CB.clock.now() < 3600000 && t > CB.clock.now());
        el.classList.toggle('is-done', t <= CB.clock.now());
      });
    }, 1000);
  };

  CB.ui.empty = function (icon, title, body, action) {
    return '<div class="empty">' +
      '<i class="' + icon + '"></i>' +
      '<h3 class="t-h4">' + util.esc(title) + '</h3>' +
      (body ? '<p class="t-small">' + util.esc(body) + '</p>' : '') +
      (action || '') + '</div>';
  };

})();
