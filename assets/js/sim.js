/* ==========================================================================
   CargoBid - sim.js
   The engine that makes the demo feel alive.

   Fifteen seeded transporters behave like autonomous agents: they discover
   loads inside their geofence, price them off the shared pricing brain in
   match.js, undercut each other in open reverse auctions until they hit their
   walk-away floor, answer counter-offers, and drive their trips checkpoint by
   checkpoint. Bid windows close on their own. Documents clear verification.

   All scheduling is DERIVED, never stored - a bot's intended bid time is a
   pure function of (loadId, transporterId, rank). That means the simulation
   survives a page reload, a tab switch, or a 20x speed change without
   duplicating or losing a single event.

   Only the leader tab ticks, so opening the shipper and the transporter side
   side by side does not run the world twice.

   Depends on: core.js, match.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  var util = CB.util;
  var sim = (CB.sim = {});

  var h = function (n) { return n * 3600000; };
  var m = function (n) { return n * 60000; };

  sim.TICK_MS = 900;
  sim.MAX_BIDS_PER_LOAD = 9;
  sim.MAX_OPEN_LOADS = 22;
  sim.autoPost = true;
  sim.enabled = true;

  /* ------------------------------------------------------------------------
     DETERMINISTIC SCHEDULING
     ------------------------------------------------------------------------ */

  function h32(str) {
    var x = 2166136261;
    for (var i = 0; i < str.length; i++) {
      x = Math.imul(x ^ str.charCodeAt(i), 16777619);
    }
    return x >>> 0;
  }

  /* Stable 0..1 for any pair of keys. */
  function jit(a, b) {
    return (h32(a + '|' + b) % 100000) / 100000;
  }

  /* ------------------------------------------------------------------------
     LIFECYCLE
     ------------------------------------------------------------------------ */

  sim.init = function () {
    if (sim._timer) return;
    sim._timer = setInterval(function () {
      if (!sim.enabled) return;
      if (!CB.leader.is()) return;          /* a follower tab just renders */
      if (CB.db.clock.speed === 0) return;  /* paused */
      try { sim.tick(); } catch (e) { console.error('CargoBid sim error', e); }
    }, sim.TICK_MS);
  };

  sim.stop = function () {
    if (sim._timer) { clearInterval(sim._timer); sim._timer = null; }
  };

  sim.tick = function () {
    var now = CB.clock.now();
    var changed = 0;

    changed += sim.stepAuctions(now);
    changed += sim.stepBots(now);
    changed += sim.stepCounters(now);
    changed += sim.stepTrips(now);
    changed += sim.stepVerification(now);
    changed += sim.stepMarket(now);

    if (changed) {
      CB.save();
      CB.emit('change');
    } else {
      /* Keep the stored clock roughly in step even on quiet ticks so a
         reload does not rewind the world. */
      CB.clock.commit();
      CB.emit('tick', now);
    }
    return changed;
  };

  /* ------------------------------------------------------------------------
     1. AUCTION WINDOWS - close on time, whether anyone is watching or not
     ------------------------------------------------------------------------ */

  sim.stepAuctions = function (now) {
    var n = 0;
    CB.db.loads.forEach(function (load) {
      if (load.status !== 'open') return;
      if (now < load.bidCloseAt) return;

      load.status = 'closed';
      var bids = CB.q.liveBidsFor(load.id);
      CB.notify(load.shipperId, 'closing', load.id + ' bidding has closed',
        bids.length
          ? bids.length + ' bid' + (bids.length === 1 ? '' : 's') + ' received. Lowest is ' +
            CB.fmt.money(bids[0].amount) + '. Award before the transporters retask their trucks.'
          : 'No bids came in. Widen the truck requirement or extend the window.',
        'shipper/load.html?id=' + load.id);
      CB.logEvent('load', load.id + ' window closed · ' + bids.length + ' bids');
      n++;
    });
    return n;
  };

  /* ------------------------------------------------------------------------
     2. BOTS - discover, bid, undercut
     ------------------------------------------------------------------------ */

  /* When bidder #rank on this load intends to make its first move. Front
     loaded so the first bids land within a minute of virtual time and the
     demo reads well even at 1x. */
  function firstBidAt(load, rank, tid) {
    return load.createdAt + m(0.5 + rank * 1.6 + jit(load.id, tid) * 2.5);
  }

  /* How long a bot sits still after being outbid before it responds. */
  function undercutCooldown(load, tid) {
    return m(4 + jit(tid, load.id) * 20);
  }

  sim.stepBots = function (now) {
    var n = 0;

    CB.db.loads.forEach(function (load) {
      if (load.status !== 'open' || now >= load.bidCloseAt) return;

      var existing = CB.db.bids.filter(function (b) {
        return b.loadId === load.id && b.status !== 'withdrawn';
      });
      var bidderIds = existing.map(function (b) { return b.transporterId; });

      /* --- a. fresh entrants ---------------------------------------- */
      if (existing.length < sim.MAX_BIDS_PER_LOAD) {
        var pool = (load.notified || []).filter(function (tid) {
          return bidderIds.indexOf(tid) === -1;
        }).map(function (tid) {
          return { tid: tid, fit: CB.match.fit(tid, load) };
        }).filter(function (x) {
          /* Only bid on something you can actually serve. */
          return x.fit.trucks.length > 0 && !x.fit.blockers.length;
        }).sort(function (a, b) { return b.fit.score - a.fit.score; });

        for (var i = 0; i < pool.length; i++) {
          if (existing.length + n >= sim.MAX_BIDS_PER_LOAD) break;
          var cand = pool[i];
          if (now < firstBidAt(load, i, cand.tid)) continue;

          var amount = CB.match.bidPrice(load, cand.tid, util.rng(h32(load.id + cand.tid)));
          if (load.ceiling && amount > load.ceiling) {
            amount = util.quote(Math.min(load.ceiling, amount) * 0.985);
          }
          /* In an open auction a late entrant can see the leader, so it comes
             in just under - that is the whole point of the format. */
          if (load.mode === 'open') {
            var lead = CB.q.lowestBid(load.id);
            if (lead && amount >= lead.amount) {
              var floor = CB.match.floorPrice(load, cand.tid);
              var target = util.quote(lead.amount * (1 - (0.012 + jit(cand.tid, 'u') * 0.03)));
              if (target < floor) continue;   /* would be a loss - stay out */
              amount = target;
            }
          }

          var eta = 2 + Math.round(jit(cand.tid, load.id + 'eta') * 8);
          if (cand.fit.backhaul.is) eta = 1 + Math.round(jit(cand.tid, 'bh') * 3);

          var res = CB.act.placeBid({
            loadId: load.id,
            transporterId: cand.tid,
            amount: amount,
            etaPickupHrs: eta,
            truckId: (cand.fit.idleTrucks[0] || cand.fit.trucks[0]).id,
            note: botNote(load, cand.fit),
            validHrs: 12,
            isBot: true
          });
          if (res.bid) { n++; }
        }
      }

      /* --- b. undercutting, open auctions only ---------------------- */
      if (load.mode !== 'open') return;
      var lowest = CB.q.lowestBid(load.id);
      if (!lowest) return;

      existing.forEach(function (bid) {
        if (!bid.isBot) return;
        if (bid.id === lowest.id) return;
        if (bid.status === 'won' || bid.status === 'lost') return;
        if (now - (bid.updatedAt || bid.createdAt) < undercutCooldown(load, bid.transporterId)) return;

        var floor = CB.match.floorPrice(load, bid.transporterId);
        var step = 0.012 + jit(bid.transporterId, bid.id) * 0.028;
        var target = util.quote(lowest.amount * (1 - step));

        if (target < floor) {
          /* Walk away rather than bid into a loss. Mark it once so the
             shipper can see who has stopped fighting. */
          if (!bid.atFloor) {
            bid.atFloor = true;
            bid.updatedAt = now;
            n++;
          }
          return;
        }
        if (target >= bid.amount) return;

        CB.act.placeBid({
          loadId: load.id,
          transporterId: bid.transporterId,
          amount: target,
          etaPickupHrs: bid.etaPickupHrs,
          truckId: bid.truckId,
          isBot: true
        });
        CB.notify(load.shipperId, 'new-bid', 'Undercut on ' + load.id,
          (CB.q.user(bid.transporterId) || {}).company + ' dropped to ' + CB.fmt.money(target),
          'shipper/load.html?id=' + load.id);
        n++;
      });
    });

    return n;
  };

  var BOT_NOTES = [
    'Truck is free and standing. Can load the same day if you confirm.',
    'Rate includes toll and permit. 12 hours free detention either end.',
    'Own vehicle. Driver has run this route many times.',
    'Firm rate, no diesel escalation for 48 hours.',
    'GPS on board, live location shared through the trip.'
  ];

  function botNote(load, fit) {
    if (fit.backhaul.is) {
      return 'Empty return leg to ' + fit.backhaul.homeBase + ' otherwise. Sharp rate, ' +
        'truck already in ' + fit.backhaul.strandedAt + '.';
    }
    if (fit.idleTrucks.length > 1) {
      return fit.idleTrucks.length + ' trucks standing idle at my yard. Can put two on this if you split the load.';
    }
    if (load.material.flags && load.material.flags.hazardous) {
      return 'Hazmat licensed. TREM card and spill kit on board as standard.';
    }
    if (load.material.flags && load.material.flags.perishable) {
      return 'Reefer pre-cooled before loading, logger report on delivery.';
    }
    return BOT_NOTES[h32(load.id + fit.score) % BOT_NOTES.length];
  }

  /* ------------------------------------------------------------------------
     3. COUNTER-OFFERS - bots negotiate back
     ------------------------------------------------------------------------ */

  sim.stepCounters = function (now) {
    var n = 0;
    CB.db.bids.forEach(function (bid) {
      if (!bid.counters || !bid.counters.length) return;
      var c = bid.counters[bid.counters.length - 1];
      if (c.state !== 'pending' || c.by !== 'shipper') return;
      if (now - c.at < m(2 + jit(bid.id, 'ctr') * 9)) return;

      var load = CB.q.load(bid.loadId);
      if (!load) return;
      var floor = CB.match.floorPrice(load, bid.transporterId);

      /* Accept if it still clears the walk-away price, otherwise hold and
         explain why - which is exactly what a fleet owner would do. */
      if (c.amount >= floor) {
        CB.act.respondCounter(bid.id, true);
        CB.logEvent('counter', (CB.q.user(bid.transporterId) || {}).company +
          ' accepted ' + CB.fmt.money(c.amount) + ' on ' + load.id);
      } else {
        c.state = 'declined';
        var hold = util.quote(Math.max(floor, c.amount * 1.06));
        var thread = CB.act._thread(load, bid.transporterId);
        CB.act._msg(thread, bid.transporterId,
          CB.fmt.money(c.amount) + ' does not cover diesel and driver on this lane. ' +
          'Best I can do is ' + CB.fmt.money(hold) + ' — and I will hold the truck for you.', 'text');
        if (hold < bid.amount) {
          CB.act.placeBid({
            loadId: load.id, transporterId: bid.transporterId, amount: hold,
            etaPickupHrs: bid.etaPickupHrs, truckId: bid.truckId, isBot: true
          });
        }
        CB.notify(load.shipperId, 'counter', 'Counter declined on ' + load.id,
          (CB.q.user(bid.transporterId) || {}).company + ' held at ' + CB.fmt.money(hold) + '.',
          'shipper/load.html?id=' + load.id);
        CB.logEvent('counter', 'Counter declined on ' + bid.id + ' · held at ' + CB.fmt.money(hold));
        n++;
      }
      n++;
    });
    return n;
  };

  /* ------------------------------------------------------------------------
     4. TRIPS - roll forward on a realistic schedule
     ------------------------------------------------------------------------ */

  var STEP_HOURS = {
    'at-pickup':  function (trip, load, bid) { return bid ? Math.max(1, bid.etaPickupHrs) : 4; },
    'loaded':     function () { return 2; },
    'in-transit': function () { return 0.5; },
    'at-drop':    function (trip, load) { return CB.match.transitHours(load.distanceKm); },
    'delivered':  function () { return 2.5; }
  };

  sim.stepTrips = function (now) {
    var n = 0;
    CB.db.trips.forEach(function (trip) {
      if (trip.status === 'delivered') return;
      var load = CB.q.load(trip.loadId);
      if (!load) return;
      var bid = CB.q.bid(trip.bidId);

      var lastDoneAt = trip.createdAt, next = null;
      for (var i = 0; i < trip.checkpoints.length; i++) {
        var cp = trip.checkpoints[i];
        if (cp.done) { lastDoneAt = cp.at || lastDoneAt; }
        else { next = cp; break; }
      }
      if (!next) return;

      var hrs = STEP_HOURS[next.key] ? STEP_HOURS[next.key](trip, load, bid) : 3;
      /* A little per-trip variance so two identical lanes do not move in lockstep. */
      hrs *= 0.85 + jit(trip.id, next.key) * 0.4;

      if (now >= lastDoneAt + h(hrs)) {
        CB.act.advanceTrip(trip.id);
        n++;
      }
    });
    return n;
  };

  /* ------------------------------------------------------------------------
     5. VERIFICATION - documents clear after a review pass
     ------------------------------------------------------------------------ */

  sim.stepVerification = function (now) {
    var n = 0;
    CB.db.transporters.forEach(function (t) {
      if (!t.docSubmittedAt) return;
      ['gst', 'pan', 'rc'].forEach(function (kind) {
        if (t.docs[kind] !== 'pending') return;
        var at = t.docSubmittedAt[kind];
        if (!at) return;
        if (now - at < h(1.5 + jit(t.userId, kind) * 2)) return;
        CB.act.reviewDoc(t.userId, kind, true);
        n++;
      });
    });
    return n;
  };

  /* ------------------------------------------------------------------------
     6. MARKET PULSE - new loads appear while you watch
     ------------------------------------------------------------------------ */

  var TEMPLATES = [
    { title: 'Cement bags — 50 kg OPC', mat: 'Cement bags', cat: 'Building materials',
      truck: 'open', tons: 24, cap: 25, ft: 24, flags: { stackable: true },
      dims: '480 bags, tarpaulin required' },
    { title: 'HDPE granule bags', mat: 'HDPE granules', cat: 'Plastics',
      truck: 'container', tons: 18, cap: 21, ft: 32, flags: { stackable: true },
      dims: '720 bags on 20 pallets' },
    { title: 'Ceramic wall tiles — boxed', mat: 'Ceramic wall tiles', cat: 'Ceramics',
      truck: 'container', tons: 12, cap: 16, ft: 24, flags: { fragile: true, stackable: true },
      dims: '560 boxes, 18 pallets' },
    { title: 'Fresh table grapes — pre-cooled', mat: 'Table grapes', cat: 'Fresh produce',
      truck: 'reefer', tons: 9, cap: 12, ft: 20, flags: { perishable: true, fragile: true },
      dims: '900 punnet crates, hold at 2°C' },
    { title: 'MS plates — 10 mm', mat: 'MS plates', cat: 'Steel & metals',
      truck: 'trailer', tons: 34, cap: 40, ft: 45, flags: { oversized: true },
      dims: '6 m x 2 m plates, crane both ends' },
    { title: 'River sand — bulk', mat: 'River sand', cat: 'Aggregates',
      truck: 'tipper', tons: 22, cap: 25, ft: 18, flags: {},
      dims: 'Loose bulk, tipping at site' },
    { title: 'Packaged snacks — mixed cartons', mat: 'Packaged snacks', cat: 'FMCG',
      truck: 'container', tons: 8, cap: 16, ft: 24, flags: { stackable: true, fragile: true },
      dims: '640 cartons, light but bulky' },
    { title: 'Industrial solvent drums — Class 3', mat: 'Solvent drums', cat: 'Chemicals',
      truck: 'container', tons: 14, cap: 16, ft: 24, flags: { hazardous: true },
      dims: '70 drums, UN certified, upright only' }
  ];

  sim.stepMarket = function (now) {
    if (!sim.autoPost) return 0;
    var open = CB.q.openLoads();
    if (open.length >= sim.MAX_OPEN_LOADS) return 0;

    var last = CB.db.lastAutoPostAt || 0;
    if (!last) { CB.db.lastAutoPostAt = now; return 0; }
    if (now - last < m(22)) return 0;

    CB.db.lastAutoPostAt = now;
    sim.postRandomLoad();
    return 1;
  };

  /* Post a plausible load from a random shipper on a lane that suits them. */
  sim.postRandomLoad = function () {
    var now = CB.clock.now();
    var r = util.rng(h32('auto' + now));
    var shipper = util.pick(r, CB.db.shippers);
    var tpl = util.pick(r, TEMPLATES);

    /* Origin near the shipper, destination somewhere with real demand. */
    var near = CB.match.citiesWithin(shipper.city, 140);
    var origin = near.length ? util.pick(r, near).name : shipper.city;
    var hubs = ['Delhi', 'Mumbai', 'Bengaluru', 'Ahmedabad', 'Kolkata', 'Hyderabad',
      'Chennai', 'Pune', 'Lucknow', 'Nagpur', 'Jaipur', 'Indore', 'Ludhiana', 'Surat'];
    var dest = util.pick(r, hubs.filter(function (c) { return c !== origin; }));

    var load = CB.act.postLoad({
      shipperId: shipper.userId,
      title: tpl.title,
      origin: { city: origin, pincode: '', address: 'Yard gate ' + util.int(r, 2, 18) },
      destination: { city: dest, pincode: '', address: 'Warehouse dock ' + util.int(r, 1, 9) },
      material: {
        name: tpl.mat, category: tpl.cat,
        weightTons: tpl.tons + util.int(r, -2, 3),
        dims: tpl.dims, flags: tpl.flags
      },
      need: { truckType: tpl.truck, minCapacityTons: tpl.cap, bodyFt: tpl.ft, count: 1 },
      pickup: {
        from: now + h(util.int(r, 10, 52)),
        to: now + h(util.int(r, 53, 62)),
        flexible: r() > 0.6, flexDays: 1
      },
      deliverBy: now + h(util.int(r, 70, 140)),
      mode: r() > 0.45 ? 'open' : 'blind',
      bidWindowHrs: util.int(r, 4, 14)
    });
    CB.logEvent('market', 'Market posted ' + load.id + ' · ' + origin + ' → ' + dest);
    return load;
  };

  /* ------------------------------------------------------------------------
     7. MANUAL LEVERS - wired to the demo console
     ------------------------------------------------------------------------ */

  /* Force the next n eligible transporters to bid right now. */
  sim.injectBids = function (loadId, count) {
    var load = CB.q.load(loadId);
    if (!load) return { error: 'Load not found.' };
    if (load.status !== 'open') return { error: 'Load is not open for bidding.' };

    var already = CB.db.bids.filter(function (b) {
      return b.loadId === loadId && b.status !== 'withdrawn';
    }).map(function (b) { return b.transporterId; });

    var pool = CB.match.notifyList(load).filter(function (x) {
      return already.indexOf(x.id) === -1 && x.fit.trucks.length && !x.fit.blockers.length;
    });

    /* If the geofenced pool is exhausted, widen out so the lever always does
       something visible rather than silently no-op'ing. */
    if (!pool.length) {
      pool = CB.db.transporters.filter(function (t) {
        return already.indexOf(t.userId) === -1 &&
          CB.match.eligibleTrucks(t.userId, load).length > 0;
      }).map(function (t) {
        return { id: t.userId, fit: CB.match.fit(t.userId, load) };
      });
    }
    if (!pool.length) return { error: 'No transporter in the network can serve this load.' };

    var placed = 0, n = count || 3;
    for (var i = 0; i < pool.length && placed < n; i++) {
      var cand = pool[i];
      var amount = CB.match.bidPrice(load, cand.id, util.rng(h32(load.id + cand.id + CB.clock.now())));
      if (load.mode === 'open') {
        var lead = CB.q.lowestBid(load.id);
        if (lead) {
          var floor = CB.match.floorPrice(load, cand.id);
          amount = util.quote(Math.max(floor, lead.amount * (1 - (0.015 + Math.random() * 0.03))));
        }
      }
      if (load.ceiling) amount = Math.min(amount, load.ceiling);

      var trucks = CB.match.eligibleTrucks(cand.id, load);
      var res = CB.act.placeBid({
        loadId: load.id, transporterId: cand.id, amount: amount,
        etaPickupHrs: 2 + Math.round(Math.random() * 7),
        truckId: trucks.length ? trucks[0].id : null,
        note: botNote(load, cand.fit), validHrs: 12, isBot: true
      });
      if (res.bid) placed++;
    }
    CB.logEvent('sim', 'Injected ' + placed + ' bid' + (placed === 1 ? '' : 's') + ' on ' + loadId);
    return { placed: placed };
  };

  sim.awardLowest = function (loadId) {
    var lowest = CB.q.lowestBid(loadId);
    if (!lowest) return { error: 'No live bids on this load.' };
    return CB.act.awardBid(lowest.id);
  };

  sim.awardBestValue = function (loadId) {
    var best = CB.score.rankBest(loadId);
    if (!best) return sim.awardLowest(loadId);
    return CB.act.awardBid(best.bid.id);
  };

  sim.advanceAllTrips = function () {
    var n = 0;
    CB.db.trips.slice().forEach(function (t) {
      if (t.status !== 'delivered') { CB.act.advanceTrip(t.id); n++; }
    });
    CB.logEvent('sim', 'Advanced ' + n + ' trip' + (n === 1 ? '' : 's'));
    return n;
  };

  /* Run a single trip all the way to POD. */
  sim.completeTrip = function (tripId) {
    var guard = 0;
    var trip = CB.q.trip(tripId);
    while (trip && trip.status !== 'delivered' && guard++ < 10) {
      CB.act.advanceTrip(tripId);
      trip = CB.q.trip(tripId);
    }
    return trip;
  };

  sim.closeAllAuctions = function () {
    var n = 0;
    CB.q.openLoads().forEach(function (l) {
      CB.act.closeBidding(l.id);
      n++;
    });
    return n;
  };

  sim.verifyAllDocs = function () {
    var n = 0;
    CB.db.transporters.forEach(function (t) {
      ['gst', 'pan', 'rc'].forEach(function (k) {
        if (t.docs[k] !== 'verified') { CB.act.reviewDoc(t.userId, k, true); n++; }
      });
    });
    CB.logEvent('sim', 'Cleared ' + n + ' document' + (n === 1 ? '' : 's') + ' across the network');
    return n;
  };

  /* Strand a transporter away from home so the backhaul story is live. */
  sim.strand = function (transporterId, city) {
    var t = CB.q.transporter(transporterId);
    if (!t) return { error: 'Not found.' };
    CB.act.setCurrentCity(transporterId, city || 'Delhi');
    return { ok: true };
  };

})();
