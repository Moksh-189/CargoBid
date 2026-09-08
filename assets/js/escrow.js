/* ==========================================================================
   CargoBid - escrow.js
   Simulated escrow / payment engine. Hangs off CB.escrow.

   Payment flow:
     1. Shipper awards bid  → CB.escrow.lock()       → 100% locked
     2. Truck at Gate-In    → OTP verified            → 70% advance released
     3. Delivered + e-POD   → OTP verified            → 30% balance released
   Disputes freeze the balance; admin resolves.

   Classic script. No modules, no imports.
   Load order: core.js → seed.js → match.js → escrow.js → ...
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  if (!CB) return;

  /* -----------------------------------------------------------------------
     CONSTANTS
     ----------------------------------------------------------------------- */

  var PLATFORM_FEE_PCT = 2.5;          /* 2.5% of freight amount */
  var ADVANCE_PCT = 70;                /* 70% released at Gate-In */
  var BALANCE_PCT = 30;                /* 30% released at Gate-Out */
  var DEMURRAGE_FREE_HRS = 24;         /* Free waiting time */
  var DEMURRAGE_PER_HR = 500;          /* ₹500/hr after free time */
  var LATE_PENALTY_PER_HR = 200;       /* ₹200/hr for late pickup */
  var OTP_LENGTH = 4;

  /* -----------------------------------------------------------------------
     ESCROW STATUS MAP
     ----------------------------------------------------------------------- */

  CB.ESCROW_STATUS = {
    unlocked:         { label: 'Not locked',       chip: 'chip' },
    locked:           { label: 'Funds locked',     chip: 'chip-accent' },
    advance_released: { label: '70% released',     chip: 'chip-ok' },
    fully_released:   { label: 'Fully settled',    chip: 'chip-ok' },
    frozen:           { label: 'Dispute — frozen',  chip: 'chip-stop' },
    refunded:         { label: 'Refunded',         chip: 'chip-warn' },
    partial:          { label: 'Partial payout',   chip: 'chip-warn' }
  };

  CB.DISPUTE_STATUS = {
    raised:            { label: 'Raised',          chip: 'chip-stop' },
    negotiating:       { label: 'Negotiating',     chip: 'chip-warn' },
    counter_proposed:  { label: 'Counter-proposed', chip: 'chip-warn' },
    accepted:          { label: 'Accepted',        chip: 'chip-ok' },
    escalated:         { label: 'Escalated',       chip: 'chip-stop' },
    admin_resolved:    { label: 'Admin resolved',  chip: 'chip-accent' }
  };

  /* -----------------------------------------------------------------------
     OTP helpers
     ----------------------------------------------------------------------- */

  function generateOtp() {
    var otp = '';
    for (var i = 0; i < OTP_LENGTH; i++) otp += Math.floor(Math.random() * 10);
    return otp;
  }

  /* -----------------------------------------------------------------------
     ESCROW NAMESPACE
     ----------------------------------------------------------------------- */

  var esc = (CB.escrow = {});

  esc.ADVANCE_PCT = ADVANCE_PCT;
  esc.BALANCE_PCT = BALANCE_PCT;
  esc.PLATFORM_FEE_PCT = PLATFORM_FEE_PCT;

  /* Calculate platform fee */
  esc.platformFee = function (amount) {
    return CB.util.quote(Math.round(amount * PLATFORM_FEE_PCT / 100));
  };

  /* Create an escrow record for a trip. Called automatically on award. */
  esc.lock = function (tripId) {
    var trip = CB.q.trip(tripId);
    if (!trip) return { error: 'Trip not found.' };
    if (trip.escrow && trip.escrow.status !== 'unlocked') {
      return { error: 'Already locked.' };
    }

    var fee = esc.platformFee(trip.amount);
    var total = trip.amount + fee;
    var advance = CB.util.quote(Math.round(trip.amount * ADVANCE_PCT / 100));
    var balance = trip.amount - advance;

    trip.escrow = {
      status: 'locked',
      freightAmount: trip.amount,
      platformFee: fee,
      totalLocked: total,
      advanceAmount: advance,
      balanceAmount: balance,
      advancePaid: false,
      balancePaid: false,
      gateInOtp: generateOtp(),
      gateOutOtp: generateOtp(),
      gateInAt: null,
      gateOutAt: null,
      gateInVerified: false,
      gateOutVerified: false,
      demurrageStartAt: null,
      demurragePenalty: 0,
      latePenalty: 0,
      disputeId: null,
      lockedAt: CB.clock.now(),
      advanceReleasedAt: null,
      fullyReleasedAt: null,
      ledger: [
        { event: 'locked', amount: total, at: CB.clock.now(),
          note: 'Freight ' + CB.fmt.money(trip.amount) + ' + platform fee ' + CB.fmt.money(fee) }
      ]
    };

    var load = CB.q.load(trip.loadId);
    CB.notify(load.shipperId, 'escrow', 'Payment locked for ' + trip.loadId,
      CB.fmt.money(total) + ' locked in escrow. 70% releases on Gate-In.',
      'shipper/trips.html');
    CB.notify(trip.transporterId, 'escrow', 'Payment secured for ' + trip.loadId,
      CB.fmt.money(trip.amount) + ' locked. You will receive 70% (' +
        CB.fmt.money(advance) + ') when the truck reaches the loading point.',
      'transporter/trips.html');

    CB.logEvent('escrow', trip.id + ' locked · ' + CB.fmt.money(total));
    CB.save();
    CB.emit('change');
    CB.emit('escrow:locked', trip);
    return { escrow: trip.escrow };
  };

  /* Verify Gate-In OTP and release 70% advance */
  esc.verifyGateIn = function (tripId, otp) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.escrow) return { error: 'No escrow.' };
    if (trip.escrow.status !== 'locked') return { error: 'Not in locked state.' };
    if (trip.escrow.gateInOtp !== String(otp)) return { error: 'OTP mismatch.' };

    var now = CB.clock.now();
    trip.escrow.gateInVerified = true;
    trip.escrow.gateInAt = now;
    trip.escrow.status = 'advance_released';
    trip.escrow.advancePaid = true;
    trip.escrow.advanceReleasedAt = now;

    trip.escrow.ledger = trip.escrow.ledger || [];
    trip.escrow.ledger.push({
      event: 'advance_released', amount: trip.escrow.advanceAmount, at: now,
      note: '70% advance released to transporter'
    });

    var load = CB.q.load(trip.loadId);
    CB.notify(trip.transporterId, 'payment', '70% advance received for ' + trip.loadId,
      CB.fmt.money(trip.escrow.advanceAmount) + ' credited. Balance on delivery.',
      'transporter/trips.html');
    if (load) {
      CB.notify(load.shipperId, 'payment', '70% advance released on ' + trip.loadId,
        CB.fmt.money(trip.escrow.advanceAmount) + ' sent to transporter. Loading confirmed.',
        'shipper/trips.html');
    }

    CB.logEvent('escrow', trip.id + ' advance ' + CB.fmt.money(trip.escrow.advanceAmount) + ' released');
    CB.save();
    CB.emit('change');
    CB.emit('escrow:advance', trip);
    return { ok: true };
  };

  /* Verify Gate-Out OTP and release 30% balance (minus penalties) */
  esc.verifyGateOut = function (tripId, otp) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.escrow) return { error: 'No escrow.' };
    if (trip.escrow.status !== 'advance_released') return { error: 'Advance not yet released.' };
    if (trip.escrow.gateOutOtp !== String(otp)) return { error: 'OTP mismatch.' };

    var now = CB.clock.now();
    trip.escrow.gateOutVerified = true;
    trip.escrow.gateOutAt = now;

    /* Calculate penalties */
    var penalties = esc.computePenalties(trip);
    trip.escrow.latePenalty = penalties.late;
    trip.escrow.demurragePenalty = penalties.demurrage;
    var totalPenalty = penalties.late + penalties.demurrage;
    var netBalance = Math.max(0, trip.escrow.balanceAmount - totalPenalty);

    trip.escrow.status = 'fully_released';
    trip.escrow.balancePaid = true;
    trip.escrow.fullyReleasedAt = now;

    trip.escrow.ledger.push({
      event: 'balance_released', amount: netBalance, at: now,
      note: 'Balance released' + (totalPenalty > 0 ? ' (₹' + totalPenalty + ' deducted as penalties)' : '')
    });

    if (totalPenalty > 0) {
      trip.escrow.ledger.push({
        event: 'penalty', amount: totalPenalty, at: now,
        note: (penalties.late > 0 ? 'Late pickup: ' + CB.fmt.money(penalties.late) + '. ' : '') +
              (penalties.demurrage > 0 ? 'Demurrage: ' + CB.fmt.money(penalties.demurrage) + '.' : '')
      });
    }

    var load = CB.q.load(trip.loadId);
    CB.notify(trip.transporterId, 'payment', 'Balance settled for ' + trip.loadId,
      CB.fmt.money(netBalance) + ' credited.' +
        (totalPenalty > 0 ? ' (' + CB.fmt.money(totalPenalty) + ' deducted as penalties)' : ''),
      'transporter/trips.html');
    if (load) {
      CB.notify(load.shipperId, 'payment', trip.loadId + ' fully settled',
        'Total paid: ' + CB.fmt.money(trip.escrow.advanceAmount + netBalance) + '. Trip complete.',
        'shipper/trips.html');
    }

    CB.logEvent('escrow', trip.id + ' fully settled · balance ' + CB.fmt.money(netBalance));
    CB.save();
    CB.emit('change');
    CB.emit('escrow:settled', trip);
    return { ok: true, netBalance: netBalance, penalties: penalties };
  };

  /* Freeze escrow on dispute */
  esc.freeze = function (tripId, disputeId) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.escrow) return { error: 'No escrow.' };
    trip.escrow.status = 'frozen';
    trip.escrow.disputeId = disputeId;

    trip.escrow.ledger.push({
      event: 'frozen', amount: 0, at: CB.clock.now(),
      note: 'Balance frozen pending dispute resolution'
    });

    CB.logEvent('escrow', trip.id + ' frozen · dispute ' + disputeId);
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  /* Full refund (fraud detected, e.g. bait-and-switch) */
  esc.refund = function (tripId, reason) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.escrow) return { error: 'No escrow.' };
    var now = CB.clock.now();
    trip.escrow.status = 'refunded';

    trip.escrow.ledger.push({
      event: 'refunded', amount: trip.escrow.totalLocked, at: now,
      note: 'Full refund: ' + (reason || 'Fraud detected')
    });

    var load = CB.q.load(trip.loadId);
    if (load) {
      CB.notify(load.shipperId, 'refund', 'Full refund on ' + trip.loadId,
        CB.fmt.money(trip.escrow.totalLocked) + ' refunded. ' + (reason || ''),
        'shipper/trips.html');
    }

    CB.logEvent('escrow', trip.id + ' refunded · ' + (reason || 'fraud'));
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  /* Partial payout after dispute resolution */
  esc.splitPayout = function (tripId, transporterPct) {
    var trip = CB.q.trip(tripId);
    if (!trip || !trip.escrow) return { error: 'No escrow.' };
    if (trip.escrow.status !== 'frozen') return { error: 'Not frozen.' };

    var now = CB.clock.now();
    var remaining = trip.escrow.balanceAmount;
    var toPay = CB.util.quote(Math.round(remaining * transporterPct / 100));
    var toRefund = remaining - toPay;

    trip.escrow.status = 'partial';
    trip.escrow.balancePaid = true;
    trip.escrow.fullyReleasedAt = now;

    trip.escrow.ledger.push({
      event: 'partial_payout', amount: toPay, at: now,
      note: 'Dispute resolved: ' + transporterPct + '% to transporter (' +
        CB.fmt.money(toPay) + '), ' + (100 - transporterPct) + '% refunded (' +
        CB.fmt.money(toRefund) + ')'
    });

    var load = CB.q.load(trip.loadId);
    CB.notify(trip.transporterId, 'payment', 'Dispute resolved on ' + trip.loadId,
      CB.fmt.money(toPay) + ' released after dispute settlement.',
      'transporter/trips.html');
    if (load) {
      CB.notify(load.shipperId, 'refund', 'Dispute resolved on ' + trip.loadId,
        CB.fmt.money(toRefund) + ' refunded after dispute settlement.',
        'shipper/trips.html');
    }

    CB.logEvent('escrow', trip.id + ' dispute resolved · transporter gets ' +
      CB.fmt.money(toPay) + ', shipper refunded ' + CB.fmt.money(toRefund));
    CB.save();
    CB.emit('change');
    return { ok: true, paid: toPay, refunded: toRefund };
  };

  /* -----------------------------------------------------------------------
     PENALTY CALCULATIONS
     ----------------------------------------------------------------------- */

  esc.computePenalties = function (trip) {
    var load = CB.q.load(trip.loadId);
    var result = { late: 0, demurrage: 0, total: 0 };
    if (!load) return result;

    /* Late pickup penalty: if loaded timestamp > pickup window end */
    var loadedCp = null;
    for (var i = 0; i < trip.checkpoints.length; i++) {
      if (trip.checkpoints[i].key === 'loaded' && trip.checkpoints[i].done) {
        loadedCp = trip.checkpoints[i];
        break;
      }
    }
    if (loadedCp && load.pickup.to && loadedCp.at > load.pickup.to) {
      var lateHrs = Math.ceil((loadedCp.at - load.pickup.to) / 3600000);
      result.late = Math.min(lateHrs * LATE_PENALTY_PER_HR, trip.amount * 0.1);
    }

    /* Demurrage: if arrived at drop > 24h before delivered */
    var atDropCp = null, deliveredCp = null;
    for (var j = 0; j < trip.checkpoints.length; j++) {
      if (trip.checkpoints[j].key === 'at-drop' && trip.checkpoints[j].done) atDropCp = trip.checkpoints[j];
      if (trip.checkpoints[j].key === 'delivered' && trip.checkpoints[j].done) deliveredCp = trip.checkpoints[j];
    }
    if (atDropCp && deliveredCp) {
      var waitHrs = (deliveredCp.at - atDropCp.at) / 3600000;
      if (waitHrs > DEMURRAGE_FREE_HRS) {
        var extraHrs = Math.ceil(waitHrs - DEMURRAGE_FREE_HRS);
        result.demurrage = extraHrs * DEMURRAGE_PER_HR;
      }
    }

    result.total = result.late + result.demurrage;
    return result;
  };

  /* Running demurrage for trips at drop point waiting */
  esc.currentDemurrage = function (trip) {
    if (!trip || !trip.checkpoints) return { hours: 0, amount: 0, freeLeft: DEMURRAGE_FREE_HRS };
    var atDropCp = null;
    for (var i = 0; i < trip.checkpoints.length; i++) {
      if (trip.checkpoints[i].key === 'at-drop' && trip.checkpoints[i].done) {
        atDropCp = trip.checkpoints[i]; break;
      }
    }
    if (!atDropCp) return { hours: 0, amount: 0, freeLeft: DEMURRAGE_FREE_HRS };

    var waitHrs = (CB.clock.now() - atDropCp.at) / 3600000;
    var freeLeft = Math.max(0, DEMURRAGE_FREE_HRS - waitHrs);
    var penalty = 0;
    if (waitHrs > DEMURRAGE_FREE_HRS) {
      penalty = Math.ceil(waitHrs - DEMURRAGE_FREE_HRS) * DEMURRAGE_PER_HR;
    }
    return { hours: Math.round(waitHrs * 10) / 10, amount: penalty, freeLeft: Math.round(freeLeft * 10) / 10 };
  };

  /* -----------------------------------------------------------------------
     DISPUTE MUTATIONS
     ----------------------------------------------------------------------- */

  var dispute = (CB.dispute = {});

  dispute.raise = function (input) {
    var trip = CB.q.trip(input.tripId);
    if (!trip) return { error: 'Trip not found.' };
    var load = CB.q.load(trip.loadId);

    var now = CB.clock.now();
    var d = {
      id: CB.nextId('dispute', 'DSP'),
      tripId: trip.id,
      loadId: trip.loadId,
      raisedBy: input.raisedBy,
      shipperId: load ? load.shipperId : null,
      transporterId: trip.transporterId,
      reason: input.reason || 'Cargo damage',
      description: input.description || '',
      claimAmount: Number(input.claimAmount) || 0,
      photos: input.photos || [],
      messages: [
        { by: input.raisedBy, text: input.description || input.reason, amount: Number(input.claimAmount), at: now }
      ],
      status: 'raised',
      resolution: null,
      expiresAt: now + CB.clock.hours(24),
      createdAt: now,
      resolvedAt: null
    };

    CB.db.disputes = CB.db.disputes || [];
    CB.db.disputes.push(d);

    /* Freeze escrow */
    if (trip.escrow) esc.freeze(trip.id, d.id);

    /* Notify the other party */
    var notifyId = d.raisedBy === 'shipper' ? trip.transporterId : (load ? load.shipperId : null);
    if (notifyId) {
      CB.notify(notifyId, 'dispute', 'Dispute raised on ' + trip.loadId,
        d.reason + ': ' + CB.fmt.money(d.claimAmount) + ' claimed. You have 24h to respond.',
        (d.raisedBy === 'shipper' ? 'transporter' : 'shipper') + '/trips.html');
    }

    CB.logEvent('dispute', d.id + ' raised on ' + trip.id + ' · ' + CB.fmt.money(d.claimAmount));
    CB.save();
    CB.emit('change');
    CB.emit('dispute:raised', d);
    return { dispute: d };
  };

  dispute.counter = function (disputeId, input) {
    var d = dispute.find(disputeId);
    if (!d) return { error: 'Dispute not found.' };
    var now = CB.clock.now();

    d.messages.push({
      by: input.by,
      text: input.text || '',
      amount: Number(input.amount) || d.claimAmount,
      at: now
    });
    d.status = 'counter_proposed';
    d.claimAmount = Number(input.amount) || d.claimAmount;

    CB.logEvent('dispute', d.id + ' counter · ' + CB.fmt.money(d.claimAmount));
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  dispute.accept = function (disputeId) {
    var d = dispute.find(disputeId);
    if (!d) return { error: 'Dispute not found.' };

    d.status = 'accepted';
    d.resolvedAt = CB.clock.now();
    d.resolution = { type: 'agreed', deduction: d.claimAmount };

    /* Release escrow with deduction */
    var trip = CB.q.trip(d.tripId);
    if (trip && trip.escrow && trip.escrow.status === 'frozen') {
      var deductPct = Math.round((1 - d.claimAmount / trip.escrow.balanceAmount) * 100);
      deductPct = CB.util.clamp(deductPct, 0, 100);
      esc.splitPayout(d.tripId, deductPct);
    }

    CB.logEvent('dispute', d.id + ' accepted · deduction ' + CB.fmt.money(d.claimAmount));
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  dispute.escalate = function (disputeId) {
    var d = dispute.find(disputeId);
    if (!d) return { error: 'Dispute not found.' };
    d.status = 'escalated';
    d.escalatedAt = CB.clock.now();

    CB.logEvent('dispute', d.id + ' escalated to admin');
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  dispute.adminResolve = function (disputeId, transporterPct) {
    var d = dispute.find(disputeId);
    if (!d) return { error: 'Dispute not found.' };

    d.status = 'admin_resolved';
    d.resolvedAt = CB.clock.now();
    d.resolution = { type: 'admin', transporterPct: transporterPct };

    var trip = CB.q.trip(d.tripId);
    if (trip && trip.escrow && trip.escrow.status === 'frozen') {
      esc.splitPayout(d.tripId, transporterPct);
    }

    CB.logEvent('dispute', d.id + ' admin resolved · transporter gets ' + transporterPct + '%');
    CB.save();
    CB.emit('change');
    return { ok: true };
  };

  dispute.find = function (id) {
    var a = CB.db.disputes || [];
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  };

  dispute.forTrip = function (tripId) {
    var a = CB.db.disputes || [];
    for (var i = 0; i < a.length; i++) if (a[i].tripId === tripId) return a[i];
    return null;
  };

  dispute.all = function () {
    return (CB.db.disputes || []).slice().sort(CB.util.by('createdAt', 'desc'));
  };

  /* -----------------------------------------------------------------------
     UI HELPERS
     ----------------------------------------------------------------------- */

  esc.statusChip = function (status) {
    var s = CB.ESCROW_STATUS[status] || { label: status, chip: 'chip' };
    return '<span class="chip chip-xs ' + s.chip + '">' + s.label + '</span>';
  };

  dispute.statusChip = function (status) {
    var s = CB.DISPUTE_STATUS[status] || { label: status, chip: 'chip' };
    return '<span class="chip chip-xs ' + s.chip + '">' + s.label + '</span>';
  };

  /* Payment timeline HTML for a trip */
  esc.timelineHtml = function (trip) {
    if (!trip || !trip.escrow) return '';
    var e = trip.escrow;
    var steps = [
      { label: 'Funds locked', done: true, amount: e.totalLocked, at: e.lockedAt,
        note: 'Freight ' + CB.fmt.money(e.freightAmount) + ' + fee ' + CB.fmt.money(e.platformFee) },
      { label: '70% advance', done: e.advancePaid, amount: e.advanceAmount, at: e.advanceReleasedAt,
        note: e.advancePaid ? 'Released to transporter' : 'Releases on Gate-In OTP' },
      { label: '30% balance', done: e.balancePaid, amount: e.balanceAmount, at: e.fullyReleasedAt,
        note: e.balancePaid ? 'Settled' : 'Releases on delivery + e-POD' }
    ];

    var html = '<div class="escrow-timeline">';
    steps.forEach(function (s, i) {
      html += '<div class="escrow-step' + (s.done ? ' is-done' : '') +
        (i === steps.length - 1 ? '' : ' has-line') + '">' +
        '<span class="escrow-dot">' +
          '<i class="' + (s.done ? 'ri-checkbox-circle-fill' : 'ri-circle-line') + '"></i>' +
        '</span>' +
        '<div class="escrow-step-body">' +
          '<strong>' + s.label + '</strong>' +
          '<span class="t-small dim">' + CB.fmt.money(s.amount) +
            (s.at ? ' · ' + CB.fmt.datetime(s.at) : '') + '</span>' +
          '<span class="t-small dim">' + s.note + '</span>' +
        '</div></div>';
    });
    html += '</div>';
    return html;
  };

  /* OTP input card HTML */
  esc.otpCardHtml = function (trip, gate) {
    if (!trip || !trip.escrow) return '';
    var e = trip.escrow;
    var isGateIn = gate === 'in';
    var verified = isGateIn ? e.gateInVerified : e.gateOutVerified;
    var otp = isGateIn ? e.gateInOtp : e.gateOutOtp;
    var label = isGateIn ? 'Gate-In' : 'Gate-Out';

    if (verified) {
      return '<div class="otp-card is-verified">' +
        '<i class="ri-shield-check-fill"></i>' +
        '<div><strong>' + label + ' verified</strong>' +
        '<span class="t-small dim">' + CB.fmt.datetime(isGateIn ? e.gateInAt : e.gateOutAt) + '</span></div>' +
      '</div>';
    }

    return '<div class="otp-card">' +
      '<div class="otp-card-head">' +
        '<i class="ri-lock-password-line"></i>' +
        '<div><strong>' + label + ' OTP verification</strong>' +
          '<span class="t-small dim">Share OTP <strong>' + otp + '</strong> with the driver at the ' +
            (isGateIn ? 'loading' : 'unloading') + ' point</span></div>' +
      '</div>' +
      '<div class="otp-input-row" data-gate="' + gate + '" data-trip="' + trip.id + '">' +
        '<input type="text" class="input otp-field" maxlength="' + OTP_LENGTH +
          '" placeholder="Enter ' + OTP_LENGTH + '-digit OTP" autocomplete="off">' +
        '<button class="btn btn-sm otp-verify-btn" type="button">Verify</button>' +
      '</div>' +
    '</div>';
  };

})();
