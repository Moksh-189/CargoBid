/* ==========================================================================
   CargoBid - tracking.js
   SIM-based tracking simulation + FASTag toll polling fallback.

   In production: Intugine cell-tower pings every 30 min.
   Here: simulated location trail with signal-loss and toll-crossing events.

   Classic script. No modules, no imports.
   Load order: core.js → seed.js → match.js → escrow.js → firewall.js → tracking.js → ...
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  if (!CB) return;

  var tk = (CB.tracking = {});

  /* -----------------------------------------------------------------------
     SIGNAL STATUS
     ----------------------------------------------------------------------- */

  CB.SIGNAL_STATUS = {
    tracking:     { label: 'Tracking',      chip: 'chip-ok',     icon: 'ri-signal-wifi-fill' },
    weak_signal:  { label: 'Weak signal',   chip: 'chip-warn',   icon: 'ri-signal-wifi-2-fill' },
    signal_lost:  { label: 'Signal lost',   chip: 'chip-stop',   icon: 'ri-signal-wifi-off-fill' },
    recovered:    { label: 'Recovered',     chip: 'chip-ok',     icon: 'ri-signal-wifi-fill' },
    total_loss:   { label: 'Total loss',    chip: 'chip-stop',   icon: 'ri-alarm-warning-fill' }
  };

  /* -----------------------------------------------------------------------
     TOLL PLAZAS on major corridors (simulated)
     ----------------------------------------------------------------------- */

  tk.TOLL_PLAZAS = [
    { id: 'TP-01', name: 'Shahpura Toll',      corridor: 'Jaipur-Delhi',    lat: 27.39, lng: 75.96, km: 62 },
    { id: 'TP-02', name: 'Behror Toll',         corridor: 'Jaipur-Delhi',    lat: 27.89, lng: 76.29, km: 118 },
    { id: 'TP-03', name: 'Dharuhera Toll',      corridor: 'Jaipur-Delhi',    lat: 28.21, lng: 76.80, km: 198 },
    { id: 'TP-04', name: 'Manesar Toll',        corridor: 'Jaipur-Delhi',    lat: 28.36, lng: 76.94, km: 235 },
    { id: 'TP-05', name: 'Kherki Daula Toll',   corridor: 'Delhi-Jaipur',    lat: 28.41, lng: 76.98, km: 250 },
    { id: 'TP-06', name: 'Kishangarh Toll',     corridor: 'Jaipur-Ahmedabad',lat: 26.58, lng: 74.85, km: 90 },
    { id: 'TP-07', name: 'Beawar Toll',         corridor: 'Jaipur-Ahmedabad',lat: 26.10, lng: 74.32, km: 180 },
    { id: 'TP-08', name: 'Palanpur Toll',       corridor: 'Jaipur-Ahmedabad',lat: 24.17, lng: 72.43, km: 410 },
    { id: 'TP-09', name: 'Vadodara Toll',       corridor: 'Ahmedabad-Pune',  lat: 22.31, lng: 73.18, km: 110 },
    { id: 'TP-10', name: 'Nashik Toll',         corridor: 'Ahmedabad-Pune',  lat: 20.00, lng: 73.79, km: 380 },
    { id: 'TP-11', name: 'Khed-Shivapur Toll',  corridor: 'Mumbai-Pune',     lat: 18.42, lng: 73.72, km: 120 },
    { id: 'TP-12', name: 'Urse Toll',           corridor: 'Mumbai-Pune',     lat: 18.63, lng: 73.50, km: 85 },
    { id: 'TP-13', name: 'Agra Toll',           corridor: 'Delhi-Agra',      lat: 27.18, lng: 78.02, km: 180 },
    { id: 'TP-14', name: 'Bhopal Toll',         corridor: 'Indore-Bhopal',   lat: 23.26, lng: 77.41, km: 190 },
    { id: 'TP-15', name: 'Vapi Toll',           corridor: 'Surat-Mumbai',    lat: 20.37, lng: 72.91, km: 170 }
  ];

  /* -----------------------------------------------------------------------
     TRACKING STATE
     We store tracking data on the trip itself under trip.tracking
     ----------------------------------------------------------------------- */

  tk.init = function (trip) {
    if (trip.tracking) return trip.tracking;
    var load = CB.q.load(trip.loadId);
    trip.tracking = {
      signal: 'tracking',
      pings: [],
      tollCrossings: [],
      lastPingAt: null,
      signalLostAt: null,
      signalLostCount: 0
    };
    return trip.tracking;
  };

  /* Simulate a SIM ping (called by sim.js during in-transit ticks) */
  tk.ping = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip) return;
    var load = CB.q.load(trip.loadId);
    if (!load) return;

    var t = tk.init(trip);
    var now = CB.clock.now();

    /* Calculate approximate position along the route */
    var progress = tk._progress(trip);
    var pos = tk._interpolate(load.origin, load.destination, progress);

    /* Add some noise to position */
    var rand = CB.util.rng(now);
    pos.lat += (rand() - 0.5) * 0.02;
    pos.lng += (rand() - 0.5) * 0.02;

    var ping = {
      lat: Math.round(pos.lat * 10000) / 10000,
      lng: Math.round(pos.lng * 10000) / 10000,
      at: now,
      speed: 40 + Math.floor(rand() * 40),
      tower: 'CT-' + (1000 + Math.floor(rand() * 9000)),
      signal: t.signal === 'signal_lost' ? 0 : (70 + Math.floor(rand() * 30))
    };

    t.pings.push(ping);
    t.lastPingAt = now;
    t.signal = 'tracking';

    /* Keep only last 50 pings */
    if (t.pings.length > 50) t.pings.splice(0, t.pings.length - 50);

    return ping;
  };

  /* Trigger signal loss (called by demo console or sim) */
  tk.signalLost = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip) return;
    var t = tk.init(trip);
    var now = CB.clock.now();

    t.signal = 'signal_lost';
    t.signalLostAt = now;
    t.signalLostCount = (t.signalLostCount || 0) + 1;

    var load = CB.q.load(trip.loadId);
    if (load) {
      CB.notify(load.shipperId, 'alert', '⚠ Signal lost on ' + trip.loadId,
        'No SIM ping for over 2 hours. Last seen near ' +
          (t.pings.length ? tk._nearestCity(t.pings[t.pings.length - 1]) : 'unknown') +
          '. Fallback: polling FASTag toll crossings.',
        'shipper/trips.html');
    }

    CB.logEvent('tracking', trip.id + ' SIGNAL LOST');
    CB.save();
    CB.emit('change');
    CB.emit('tracking:signal_lost', trip);
  };

  /* Recover signal */
  tk.recover = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.tracking) return;
    trip.tracking.signal = 'recovered';
    trip.tracking.signalLostAt = null;

    var load = CB.q.load(trip.loadId);
    if (load) {
      CB.notify(load.shipperId, 'info', 'Signal recovered on ' + trip.loadId,
        'SIM tracking resumed.', 'shipper/trips.html');
    }

    CB.logEvent('tracking', trip.id + ' signal recovered');
    CB.save();
    CB.emit('change');
  };

  /* Simulate FASTag toll crossing (fallback when SIM lost) */
  tk.tollCrossing = function (tripId, plazaId) {
    var trip = CB.q.trip(tripId);
    if (!trip) return;
    var t = tk.init(trip);

    var plaza = null;
    for (var i = 0; i < tk.TOLL_PLAZAS.length; i++) {
      if (tk.TOLL_PLAZAS[i].id === plazaId) { plaza = tk.TOLL_PLAZAS[i]; break; }
    }
    if (!plaza) return;

    var crossing = {
      plazaId: plaza.id,
      name: plaza.name,
      corridor: plaza.corridor,
      lat: plaza.lat,
      lng: plaza.lng,
      at: CB.clock.now(),
      amount: 100 + Math.floor(Math.random() * 200)
    };
    t.tollCrossings.push(crossing);

    var load = CB.q.load(trip.loadId);
    if (load) {
      CB.notify(load.shipperId, 'tracking', 'FASTag ping: ' + plaza.name,
        'Truck crossed ' + plaza.name + ' (' + plaza.corridor + ') via FASTag.' +
          (t.signal === 'signal_lost' ? ' SIM still offline.' : ''),
        'shipper/trips.html');
    }

    CB.logEvent('tracking', trip.id + ' toll crossing at ' + plaza.name);
    CB.save();
    CB.emit('change');
    return crossing;
  };

  /* Get the full trail for display */
  tk.getTrail = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.tracking) return { pings: [], tolls: [], signal: 'tracking' };
    return {
      pings: trip.tracking.pings,
      tolls: trip.tracking.tollCrossings,
      signal: trip.tracking.signal,
      lastPingAt: trip.tracking.lastPingAt,
      signalLostAt: trip.tracking.signalLostAt
    };
  };

  /* -----------------------------------------------------------------------
     INTERNAL HELPERS
     ----------------------------------------------------------------------- */

  tk._progress = function (trip) {
    var steps = trip.checkpoints || [];
    var done = 0;
    for (var i = 0; i < steps.length; i++) if (steps[i].done) done = i;
    return done / Math.max(1, steps.length - 1);
  };

  tk._interpolate = function (origin, dest, t) {
    return {
      lat: origin.lat + (dest.lat - origin.lat) * t,
      lng: origin.lng + (dest.lng - origin.lng) * t
    };
  };

  tk._nearestCity = function (ping) {
    if (!ping) return 'unknown';
    var best = null, bestDist = Infinity;
    for (var i = 0; i < CB.cities.length; i++) {
      var c = CB.cities[i];
      var d = Math.abs(c.lat - ping.lat) + Math.abs(c.lng - ping.lng);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best ? best.name : 'unknown';
  };

  /* -----------------------------------------------------------------------
     UI: Tracking panel HTML
     ----------------------------------------------------------------------- */

  tk.panelHtml = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip) return '';
    var trail = tk.getTrail(tripId);
    var s = CB.SIGNAL_STATUS[trail.signal] || CB.SIGNAL_STATUS.tracking;

    var html = '<div class="tracking-panel">';

    /* Signal status bar */
    html += '<div class="tracking-signal">' +
      '<span class="chip chip-xs ' + s.chip + '"><i class="' + s.icon + '"></i> ' + s.label + '</span>';
    if (trail.lastPingAt) {
      html += '<span class="t-small dim">Last ping: ' + CB.fmt.relative(trail.lastPingAt) + '</span>';
    }
    html += '</div>';

    /* Signal lost alert */
    if (trail.signal === 'signal_lost') {
      html += '<div class="notice notice-stop">' +
        '<i class="ri-alarm-warning-fill"></i>' +
        '<div>' +
          '<strong>SIM signal lost</strong>' +
          '<p class="t-small">No cell tower ping for over 2 hours. Switched to FASTag toll polling as fallback. ' +
            'Last seen near ' + (trail.pings.length ? tk._nearestCity(trail.pings[trail.pings.length - 1]) : 'unknown') + '.</p>' +
        '</div>' +
      '</div>';
    }

    /* Recent pings */
    if (trail.pings.length) {
      html += '<div class="tracking-pings"><h4 class="t-eyebrow">Recent pings</h4><ul class="ping-list">';
      var recent = trail.pings.slice(-6).reverse();
      recent.forEach(function (p) {
        var city = tk._nearestCity(p);
        html += '<li class="ping-item">' +
          '<i class="ri-map-pin-2-fill"></i>' +
          '<div>' +
            '<span>Near <strong>' + city + '</strong></span>' +
            '<span class="t-small dim">' + CB.fmt.datetime(p.at) + ' · ' + p.speed + ' km/h · Signal ' + p.signal + '%</span>' +
          '</div></li>';
      });
      html += '</ul></div>';
    }

    /* Toll crossings (shown when SIM is lost) */
    if (trail.tolls.length) {
      html += '<div class="tracking-tolls"><h4 class="t-eyebrow">FASTag toll crossings</h4><ul class="ping-list">';
      trail.tolls.slice(-5).reverse().forEach(function (t) {
        html += '<li class="ping-item toll">' +
          '<i class="ri-bank-card-fill"></i>' +
          '<div>' +
            '<span><strong>' + t.name + '</strong> · ' + t.corridor + '</span>' +
            '<span class="t-small dim">' + CB.fmt.datetime(t.at) + ' · ₹' + t.amount + ' toll</span>' +
          '</div></li>';
      });
      html += '</ul></div>';
    }

    html += '</div>';
    return html;
  };

})();
