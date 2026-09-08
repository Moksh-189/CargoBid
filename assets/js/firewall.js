/* ==========================================================================
   CargoBid - firewall.js
   Pre-trip verification firewalls: E-Way Bill, FASTag, vehicle match.

   Classic script. No modules, no imports.
   Load order: core.js → seed.js → match.js → escrow.js → firewall.js → ...
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  if (!CB) return;

  var fw = (CB.firewall = {});

  /* -----------------------------------------------------------------------
     E-WAY BILL VERIFICATION (simulated)
     In production this calls ClearTax or government e-Way API.
     ----------------------------------------------------------------------- */

  fw.checkEwayBill = function (trip) {
    var load = CB.q.load(trip.loadId);
    if (!load) return { pass: false, reason: 'Load not found.' };

    /* In our sim, loads may have an eWayBill field seeded in */
    if (!load.eWayBill) {
      return { pass: true, note: 'No e-Way Bill required (value under ₹50,000)', skipped: true };
    }

    var ewb = load.eWayBill;

    /* Check expiry */
    if (ewb.expiresAt && ewb.expiresAt < CB.clock.now()) {
      return { pass: false, reason: 'E-Way Bill expired on ' + CB.fmt.datetime(ewb.expiresAt) };
    }

    /* Check vehicle number match */
    var truck = trip.truckId ? CB.q.truck(trip.truckId) : null;
    if (truck && ewb.vehicleNo && truck.regNo !== ewb.vehicleNo) {
      return {
        pass: false,
        reason: 'Vehicle mismatch: E-Way Bill says ' + ewb.vehicleNo +
                ' but assigned truck is ' + truck.regNo,
        type: 'bait-and-switch'
      };
    }

    return {
      pass: true,
      note: 'E-Way Bill ' + ewb.number + ' valid until ' + CB.fmt.datetime(ewb.expiresAt)
    };
  };

  /* -----------------------------------------------------------------------
     FASTAG HOTLIST CHECK (simulated)
     In production this calls the NPCI FASTag API via Surepass.
     ----------------------------------------------------------------------- */

  fw.checkFasTag = function (trip) {
    var truck = trip.truckId ? CB.q.truck(trip.truckId) : null;
    if (!truck) return { pass: true, note: 'No truck assigned', skipped: true };

    if (!truck.fasTag) {
      return { pass: true, note: 'No FASTag registered', skipped: true };
    }

    if (truck.fasTag.hotlisted) {
      return {
        pass: false,
        reason: 'FASTag ' + truck.fasTag.id + ' is HOTLISTED. Vehicle may be stolen or has unpaid tolls.',
        type: 'hotlisted'
      };
    }

    if (truck.fasTag.balance < 100) {
      return {
        pass: true,
        warn: true,
        note: 'FASTag balance low: ₹' + truck.fasTag.balance + '. May get stopped at tolls.'
      };
    }

    return {
      pass: true,
      note: 'FASTag active · Balance ₹' + truck.fasTag.balance
    };
  };

  /* -----------------------------------------------------------------------
     VEHICLE MATCH CHECK
     Prevents bait-and-switch: transporter assigns truck A but sends truck B.
     ----------------------------------------------------------------------- */

  fw.checkVehicleMatch = function (trip, scannedRegNo) {
    var truck = trip.truckId ? CB.q.truck(trip.truckId) : null;
    if (!truck) return { pass: true, note: 'No truck assigned', skipped: true };

    if (!scannedRegNo) {
      return { pass: true, note: 'No physical verification', skipped: true };
    }

    var assigned = truck.regNo.replace(/[\s-]/g, '').toUpperCase();
    var scanned = String(scannedRegNo).replace(/[\s-]/g, '').toUpperCase();

    if (assigned !== scanned) {
      return {
        pass: false,
        reason: 'BAIT-AND-SWITCH DETECTED: Assigned truck ' + truck.regNo +
                ' but vehicle at gate is ' + scannedRegNo,
        type: 'bait-and-switch'
      };
    }

    return { pass: true, note: 'Vehicle matches assignment: ' + truck.regNo };
  };

  /* -----------------------------------------------------------------------
     COMBINED GATE-IN CHECK
     Runs all firewalls. If any fails, Gate-In is blocked.
     ----------------------------------------------------------------------- */

  fw.gateInCheck = function (tripId, opts) {
    var trip = CB.q.trip(tripId);
    if (!trip) return { pass: false, checks: [], reason: 'Trip not found.' };

    opts = opts || {};
    var checks = [];

    /* 1. E-Way Bill */
    var ewb = fw.checkEwayBill(trip);
    checks.push({ name: 'E-Way Bill', icon: 'ri-file-text-line', result: ewb });

    /* 2. FASTag */
    var ft = fw.checkFasTag(trip);
    checks.push({ name: 'FASTag', icon: 'ri-bank-card-line', result: ft });

    /* 3. Vehicle match */
    var vm = fw.checkVehicleMatch(trip, opts.scannedRegNo);
    checks.push({ name: 'Vehicle match', icon: 'ri-car-line', result: vm });

    /* 4. Driver license (always passes in sim) */
    checks.push({
      name: 'Driver license',
      icon: 'ri-id-card-line',
      result: { pass: true, note: trip.driver ? trip.driver.name + ' · valid' : 'OK' }
    });

    var allPass = checks.every(function (c) { return c.result.pass; });
    var failures = checks.filter(function (c) { return !c.result.pass; });

    /* If any critical failure, trigger refund */
    if (!allPass && trip.escrow) {
      var failReasons = failures.map(function (f) { return f.name + ': ' + f.result.reason; }).join('. ');
      CB.escrow.refund(tripId, failReasons);

      /* Mark the transporter */
      var t = CB.q.transporter(trip.transporterId);
      if (t) {
        var isBaitSwitch = failures.some(function (f) { return f.result.type === 'bait-and-switch'; });
        if (isBaitSwitch) {
          t.cancellations = (t.cancellations || 0) + 1;
          CB.score.recompute(trip.transporterId);
        }
      }
    }

    return { pass: allPass, checks: checks, failures: failures };
  };

  /* -----------------------------------------------------------------------
     UI: Checklist card HTML
     ----------------------------------------------------------------------- */

  fw.checklistHtml = function (checks) {
    var html = '<div class="firewall-checklist">';
    checks.forEach(function (c) {
      var cls = c.result.pass ? 'is-pass' : 'is-fail';
      if (c.result.skipped) cls = 'is-skip';
      if (c.result.warn) cls = 'is-warn';

      html += '<div class="fw-check ' + cls + '">' +
        '<span class="fw-icon"><i class="' + c.icon + '"></i></span>' +
        '<div class="fw-body">' +
          '<strong>' + c.name + '</strong>' +
          '<span class="t-small">' +
            (c.result.pass
              ? '<i class="ri-checkbox-circle-fill"></i> ' + (c.result.note || 'Passed')
              : '<i class="ri-close-circle-fill"></i> ' + c.result.reason) +
          '</span>' +
        '</div>' +
        '<span class="fw-badge">' +
          (c.result.pass
            ? (c.result.warn ? '<span class="chip chip-xs chip-warn">Warning</span>' : '<span class="chip chip-xs chip-ok">Pass</span>')
            : '<span class="chip chip-xs chip-stop">BLOCKED</span>') +
        '</span>' +
      '</div>';
    });
    html += '</div>';
    return html;
  };

})();
