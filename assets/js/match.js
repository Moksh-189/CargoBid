/* ==========================================================================
   CargoBid - match.js
   The matchmaking layer. Geofencing, road distance, truck-type compatibility,
   fit scoring, backhaul (return-load) detection, and market price guidance.

   This is the answer to "where do the local transporters come from?" - we
   never broadcast a load to everyone. We query for fleet owners whose home
   base (or current position) sits inside the pickup radius, who own a
   compatible truck, and we rank them by how well the job actually fits.

   Depends on: core.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  var util = CB.util;
  var match = (CB.match = {});

  /* Straight-line distance is optimistic on Indian highways. This factor
     converts great-circle km into something closer to real road km. */
  match.ROAD_FACTOR = 1.22;

  /* Average highway speed for a loaded goods vehicle, including stops,
     checkposts and the mandatory rest a driver actually takes. */
  match.AVG_KMPH = 42;

  /* ------------------------------------------------------------------------
     1. GEOMETRY
     ------------------------------------------------------------------------ */

  match.haversine = function (lat1, lng1, lat2, lng2) {
    var R = 6371;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  /* Great-circle km between two named cities. */
  match.cityKm = function (a, b) {
    if (!a || !b) return null;
    if (a === b) return 0;
    var ca = CB.city(a), cb = CB.city(b);
    if (!ca || !cb) return null;
    return match.haversine(ca.lat, ca.lng, cb.lat, cb.lng);
  };

  /* Road km - what we quote and price against. */
  match.roadKm = function (a, b) {
    var d = match.cityKm(a, b);
    if (d == null) return 0;
    if (d === 0) return 0;
    return Math.round(d * match.ROAD_FACTOR);
  };

  match.transitHours = function (km) {
    if (!km) return 0;
    /* Long hauls average better because more of the trip is open highway. */
    var speed = km > 800 ? match.AVG_KMPH + 6 : (km < 150 ? match.AVG_KMPH - 10 : match.AVG_KMPH);
    return Math.round((km / speed) * 10) / 10;
  };

  match.citiesWithin = function (city, radiusKm) {
    var c = CB.city(city);
    if (!c) return [];
    return CB.cities.filter(function (x) {
      return match.haversine(c.lat, c.lng, x.lat, x.lng) <= radiusKm;
    }).map(function (x) {
      return { name: x.name, state: x.state, km: Math.round(match.haversine(c.lat, c.lng, x.lat, x.lng)) };
    }).sort(util.by('km'));
  };

  /* ------------------------------------------------------------------------
     2. TRUCK COMPATIBILITY
     A load asking for an open body can also be served by a flatbed trailer.
     A container load can be served by a reefer running dry. The reverse is
     never true - you cannot put a reefer load on an open truck.
     ------------------------------------------------------------------------ */

  match.COMPATIBLE = {
    open:      ['open', 'trailer'],
    container: ['container', 'reefer'],
    reefer:    ['reefer'],
    trailer:   ['trailer'],
    tipper:    ['tipper']
  };

  match.typeServes = function (truckType, needType) {
    var list = match.COMPATIBLE[needType] || [needType];
    return list.indexOf(truckType) > -1;
  };

  /* Which of a transporter's trucks could actually take this load. */
  match.eligibleTrucks = function (transporterId, load) {
    var need = load.need;
    return CB.q.trucksOf(transporterId).filter(function (tk) {
      if (!match.typeServes(tk.type, need.truckType)) return false;
      if (tk.capacityTons < Math.max(need.minCapacityTons, load.material.weightTons)) return false;
      if (need.bodyFt && tk.bodyFt < need.bodyFt) return false;
      return true;
    });
  };

  match.availableTrucks = function (transporterId, load) {
    return match.eligibleTrucks(transporterId, load).filter(function (tk) {
      return tk.status === 'idle';
    });
  };

  /* ------------------------------------------------------------------------
     3. GEOFENCE
     A transporter is in range if either their declared home base OR their
     current position is inside their own service radius of the pickup.
     ------------------------------------------------------------------------ */

  match.reach = function (transporter, load) {
    var radius = transporter.radiusKm || 50;
    var fromHome = match.cityKm(transporter.homeBase, load.origin.city);
    var fromNow = match.cityKm(transporter.currentCity || transporter.homeBase, load.origin.city);

    var homeOk = fromHome != null && fromHome <= radius;
    var nowOk = fromNow != null && fromNow <= radius;

    return {
      inRange: homeOk || nowOk,
      homeKm: fromHome == null ? null : Math.round(fromHome),
      currentKm: fromNow == null ? null : Math.round(fromNow),
      basis: nowOk && (fromNow <= (fromHome == null ? Infinity : fromHome)) ? 'current' : 'home',
      radiusKm: radius
    };
  };

  /* ------------------------------------------------------------------------
     4. BACKHAUL / RETURN LOADS
     The single biggest lever for a small fleet owner. A Jaipur truck that
     delivered to Delhi must either dead-head home empty or idle for days
     waiting on a broker. If we can hand them a Delhi -> Jaipur load they
     will bid aggressively, because anything beats burning diesel on an
     empty return leg.
     ------------------------------------------------------------------------ */

  match.DEAD_HEAD_COST_PER_KM = 26;   /* diesel + driver + tolls, empty */

  match.backhaul = function (transporter, load) {
    var away = transporter.currentCity && transporter.currentCity !== transporter.homeBase;
    if (!away) return { is: false };

    /* Is the pickup where the truck is actually sitting right now? */
    var atPickup = match.cityKm(transporter.currentCity, load.origin.city);
    if (atPickup == null || atPickup > (transporter.radiusKm || 50)) return { is: false };

    /* Does the drop take them home, or meaningfully closer to home? */
    var dropToHome = match.cityKm(load.destination.city, transporter.homeBase);
    var nowToHome = match.cityKm(transporter.currentCity, transporter.homeBase);
    if (dropToHome == null || nowToHome == null) return { is: false };

    var closerBy = nowToHome - dropToHome;
    if (closerBy < nowToHome * 0.55) return { is: false };

    var deadHeadKm = Math.round(nowToHome * match.ROAD_FACTOR);
    return {
      is: true,
      homeBase: transporter.homeBase,
      strandedAt: transporter.currentCity,
      deadHeadKm: deadHeadKm,
      deadHeadCost: Math.round(deadHeadKm * match.DEAD_HEAD_COST_PER_KM),
      dropsWithinKm: Math.round(dropToHome),
      closerBy: Math.round(closerBy),
      /* How much of the empty return leg this load actually pays for. */
      coverage: Math.min(100, Math.round((closerBy / nowToHome) * 100))
    };
  };

  /* Every open load that would get this transporter home loaded. */
  match.returnLoadsFor = function (transporterId) {
    var t = CB.q.transporter(transporterId);
    if (!t) return [];
    return CB.q.openLoads().map(function (load) {
      var bh = match.backhaul(t, load);
      if (!bh.is) return null;
      if (!match.eligibleTrucks(transporterId, load).length) return null;
      return { load: load, backhaul: bh, fit: match.fit(transporterId, load) };
    }).filter(Boolean).sort(function (a, b) {
      return b.backhaul.coverage - a.backhaul.coverage;
    });
  };

  /* ------------------------------------------------------------------------
     5. FIT SCORE
     0-100, with human-readable reasons the transporter can actually act on.
     ------------------------------------------------------------------------ */

  match.laneRuns = function (transporterId, load) {
    return CB.q.tripsOf(transporterId).filter(function (tp) {
      var l = CB.q.load(tp.loadId);
      return l && l.origin.city === load.origin.city && l.destination.city === load.destination.city;
    }).length;
  };

  match.fit = function (transporterId, load) {
    var t = CB.q.transporter(transporterId);
    if (!t) return { score: 0, reasons: [], eligible: false };

    var reach = match.reach(t, load);
    var eligible = match.eligibleTrucks(transporterId, load);
    var idle = eligible.filter(function (tk) { return tk.status === 'idle'; });
    var bh = match.backhaul(t, load);
    var runs = match.laneRuns(transporterId, load);

    var reasons = [];
    var score = 0;

    /* Proximity to pickup - 30 */
    var km = reach.basis === 'current' ? reach.currentKm : reach.homeKm;
    if (km == null) km = 9999;
    var prox = util.clamp(1 - km / Math.max(reach.radiusKm, 1), 0, 1);
    score += prox * 30;
    if (km <= 15) reasons.push({ icon: 'ri-map-pin-line', text: 'Pickup is ' + (km || 'under 5') + ' km from your base' });
    else if (reach.inRange) reasons.push({ icon: 'ri-map-pin-line', text: km + ' km from your ' + (reach.basis === 'current' ? 'current position' : 'home base') });

    /* Truck availability - 30 */
    if (idle.length) {
      score += 30;
      reasons.push({
        icon: 'ri-truck-line',
        text: idle.length === 1
          ? 'Matches your idle ' + idle[0].regNo
          : idle.length + ' idle trucks match this load'
      });
    } else if (eligible.length) {
      score += 12;
      reasons.push({ icon: 'ri-time-line', text: 'You own a matching truck, but all are on trip' });
    } else {
      reasons.push({ icon: 'ri-close-circle-line', text: 'No truck in your fleet matches ' + CB.truckType(load.need.truckType).label });
    }

    /* Backhaul - 20 */
    if (bh.is) {
      score += 20;
      reasons.push({
        icon: 'ri-arrow-go-back-line',
        text: 'Return load — saves ' + CB.fmt.money(bh.deadHeadCost) + ' of empty running to ' + bh.homeBase
      });
    }

    /* Lane familiarity - 10 */
    if (runs > 0) {
      score += Math.min(10, runs * 3.5);
      reasons.push({ icon: 'ri-route-line', text: "You've run this lane " + runs + (runs === 1 ? ' time' : ' times') });
    }

    /* Capacity efficiency - 10. A 40 t trailer on a 6 t load wastes money. */
    if (idle.length) {
      var best = idle.slice().sort(util.by('capacityTons'))[0];
      var useRatio = load.material.weightTons / Math.max(best.capacityTons, 1);
      score += util.clamp(useRatio, 0, 1) * 10;
      if (useRatio > 0.85) {
        reasons.push({ icon: 'ri-scales-3-line', text: 'Near-full payload on ' + best.regNo + ' (' + CB.fmt.tons(best.capacityTons) + ')' });
      }
    }

    /* Hard blockers surface as warnings rather than silently zeroing out. */
    var blockers = [];
    if (!reach.inRange) blockers.push('Outside your ' + reach.radiusKm + ' km service radius');
    if (!eligible.length) blockers.push('No compatible truck');
    if (load.material.flags && load.material.flags.hazardous && !t.hazmatLicence) {
      blockers.push('Hazardous cargo needs a hazmat licence on file');
      score -= 15;
    }

    return {
      score: Math.round(util.clamp(score, 0, 100)),
      reasons: reasons,
      blockers: blockers,
      eligible: reach.inRange && eligible.length > 0 && !blockers.length,
      reach: reach,
      trucks: eligible,
      idleTrucks: idle,
      backhaul: bh,
      laneRuns: runs
    };
  };

  match.fitBand = function (n) {
    if (n >= 78) return { label: 'Strong fit', chip: 'chip-ok' };
    if (n >= 55) return { label: 'Good fit', chip: 'chip-accent' };
    if (n >= 32) return { label: 'Possible', chip: 'chip-warn' };
    return { label: 'Weak fit', chip: 'chip' };
  };

  /* ------------------------------------------------------------------------
     6. NOTIFY LIST - who actually gets pinged when a load goes live
     ------------------------------------------------------------------------ */

  match.notifyList = function (load) {
    var out = [];
    CB.db.transporters.forEach(function (t) {
      var reach = match.reach(t, load);
      if (!reach.inRange) return;
      if (!match.eligibleTrucks(t.userId, load).length) return;
      var fit = match.fit(t.userId, load);
      var card = CB.q.transporterCard(t.userId);
      if (!card) return;
      out.push({ id: t.userId, card: card, fit: fit, reach: reach });
    });
    return out.sort(function (a, b) { return b.fit.score - a.fit.score; });
  };

  /* Preview used by the post-load wizard before the shipper commits. */
  match.previewReach = function (draft) {
    var stub = {
      id: 'preview',
      origin: { city: draft.originCity, lat: 0, lng: 0 },
      destination: { city: draft.destCity, lat: 0, lng: 0 },
      material: { weightTons: Number(draft.weightTons) || 1, flags: draft.flags || {} },
      need: {
        truckType: draft.truckType,
        minCapacityTons: Number(draft.minCapacityTons) || Number(draft.weightTons) || 1,
        bodyFt: Number(draft.bodyFt) || null,
        count: 1
      }
    };
    var list = match.notifyList(stub);
    var idle = 0, verified = 0, backhaul = 0;
    list.forEach(function (m) {
      if (m.fit.idleTrucks.length) idle++;
      if (m.card.verified) verified++;
      if (m.fit.backhaul.is) backhaul++;
    });
    return { list: list, total: list.length, idle: idle, verified: verified, backhaul: backhaul };
  };

  /* ------------------------------------------------------------------------
     7. PRICE GUIDANCE
     One pricing brain, shared by the shipper's market estimate and the bot
     bidding in sim.js, so the numbers a shipper is shown and the numbers
     that arrive are drawn from the same distribution.
     ------------------------------------------------------------------------ */

  match.basePrice = function (load) {
    var type = CB.truckType(load.need.truckType);
    var km = load.distanceKm || match.roadKm(load.origin.city, load.destination.city);
    var base = type.ratePerKm * km;

    /* Short hauls carry a fixed-cost floor - nobody moves a truck for ₹900. */
    if (km < 120) base = Math.max(base, 4200 + km * 14);

    var cap = Math.max(load.need.minCapacityTons || 1, 1);
    var over = (load.material.weightTons - cap * 0.6) / cap;
    var weightFactor = 1 + util.clamp(over, 0, 1) * 0.25;

    var flagMult = 1;
    CB.MATERIAL_FLAGS.forEach(function (f) {
      if (load.material.flags && load.material.flags[f.key]) flagMult *= (1 + f.premium);
    });

    var urgency = 1;
    if (load.pickup && load.pickup.from) {
      var lead = load.pickup.from - CB.clock.now();
      if (lead < CB.clock.hours(24)) urgency = 1.12;
      else if (lead > CB.clock.days(5)) urgency = 0.97;
    }
    if (load.pickup && load.pickup.flexible) urgency *= 0.94;

    var count = Math.max(load.need.count || 1, 1);
    return Math.round(base * weightFactor * flagMult * urgency * count);
  };

  /* The range a shipper should expect bids to land in. */
  match.priceGuide = function (load) {
    var base = match.basePrice(load);
    var pool = match.notifyList(load);
    /* A thin market means less competitive pressure, so widen the top end. */
    var thin = pool.length < 4;
    return {
      base: base,
      low: util.quote(base * (thin ? 0.94 : 0.86)),
      high: util.quote(base * (thin ? 1.22 : 1.13)),
      perKm: load.distanceKm ? Math.round(base / load.distanceKm) : null,
      supply: pool.length,
      thin: thin
    };
  };

  /* What a specific transporter would quote on a specific load. Used by both
     the seeded history and the live bidding bots, so the market a shipper
     sees is drawn from one distribution rather than two. */
  match.bidPrice = function (load, transporterId, rand) {
    var base = match.basePrice(load);
    var card = CB.q.transporterCard(transporterId);
    var fit = match.fit(transporterId, load);
    var f = 1;

    if (card) {
      /* Verified operators charge a small premium and get away with it. */
      f += card.verified ? 0.045 : -0.025;
      if (card.rating >= 4.6) f += 0.03;
      if (card.reliability >= 90) f += 0.02;
      if (card.reliability < 60) f -= 0.06;      /* has to buy the work */
      if (card.fleetSize >= 25) f -= 0.03;       /* scale buys cheaper diesel */
      if (card.fleetSize <= 3) f += 0.04;        /* owner-driver, no leverage */
    }
    if (fit.backhaul.is) f -= 0.14;              /* beats running home empty */
    f += fit.idleTrucks.length ? -0.03 : 0.05;   /* idle metal is a liability */
    if (fit.blockers.length) f += 0.08;

    var r = rand ? rand() : Math.random();
    f += (r - 0.5) * 0.12;                       /* ±6% honest noise */

    return util.quote(base * Math.max(0.6, f));
  };

  /* The walk-away price. A bot stops undercutting here rather than bidding
     itself into a loss - which is what keeps the reverse auction credible. */
  match.floorPrice = function (load, transporterId) {
    var base = match.basePrice(load);
    var fit = match.fit(transporterId, load);
    return util.quote(base * (fit.backhaul.is ? 0.70 : 0.82));
  };

  /* ------------------------------------------------------------------------
     8. MARKETPLACE FILTERING
     ------------------------------------------------------------------------ */

  match.board = function (transporterId, filters) {
    filters = filters || {};
    var t = CB.q.transporter(transporterId);
    if (!t) return [];

    var rows = CB.db.loads.filter(function (l) {
      return l.status === 'open' && CB.clock.now() < l.bidCloseAt;
    }).map(function (load) {
      return {
        load: load,
        fit: match.fit(transporterId, load),
        myBid: CB.q.myBidOn(load.id, transporterId),
        bidCount: CB.q.liveBidsFor(load.id).length,
        lowest: CB.q.lowestBid(load.id),
        guide: match.priceGuide(load)
      };
    });

    if (!filters.showAll) {
      rows = rows.filter(function (r) { return r.fit.reach.inRange; });
    }
    if (filters.truckType) {
      rows = rows.filter(function (r) { return r.load.need.truckType === filters.truckType; });
    }
    if (filters.destination) {
      rows = rows.filter(function (r) { return r.load.destination.city === filters.destination; });
    }
    if (filters.origin) {
      rows = rows.filter(function (r) { return r.load.origin.city === filters.origin; });
    }
    if (filters.mode) {
      rows = rows.filter(function (r) { return r.load.mode === filters.mode; });
    }
    if (filters.maxWeight) {
      rows = rows.filter(function (r) { return r.load.material.weightTons <= Number(filters.maxWeight); });
    }
    if (filters.minWeight) {
      rows = rows.filter(function (r) { return r.load.material.weightTons >= Number(filters.minWeight); });
    }
    if (filters.backhaulOnly) {
      rows = rows.filter(function (r) { return r.fit.backhaul.is; });
    }
    if (filters.idleOnly) {
      rows = rows.filter(function (r) { return r.fit.idleTrucks.length > 0; });
    }
    if (filters.notBidYet) {
      rows = rows.filter(function (r) { return !r.myBid; });
    }
    if (filters.flags && filters.flags.length) {
      rows = rows.filter(function (r) {
        return filters.flags.every(function (f) { return r.load.material.flags && r.load.material.flags[f]; });
      });
    }
    if (filters.query) {
      var qy = String(filters.query).toLowerCase();
      rows = rows.filter(function (r) {
        var l = r.load;
        return (l.id + ' ' + l.title + ' ' + l.origin.city + ' ' + l.destination.city + ' ' +
          l.material.name).toLowerCase().indexOf(qy) > -1;
      });
    }

    var sort = filters.sort || 'fit';
    if (sort === 'fit') rows.sort(function (a, b) { return b.fit.score - a.fit.score; });
    else if (sort === 'new') rows.sort(function (a, b) { return b.load.createdAt - a.load.createdAt; });
    else if (sort === 'closing') rows.sort(function (a, b) { return a.load.bidCloseAt - b.load.bidCloseAt; });
    else if (sort === 'value') rows.sort(function (a, b) { return b.guide.base - a.guide.base; });
    else if (sort === 'distance') rows.sort(function (a, b) { return b.load.distanceKm - a.load.distanceKm; });
    else if (sort === 'near') rows.sort(function (a, b) {
      var ax = a.fit.reach.basis === 'current' ? a.fit.reach.currentKm : a.fit.reach.homeKm;
      var bx = b.fit.reach.basis === 'current' ? b.fit.reach.currentKm : b.fit.reach.homeKm;
      return (ax == null ? 9999 : ax) - (bx == null ? 9999 : bx);
    });

    return rows;
  };

  /* Directory search on the shipper side. */
  match.directory = function (filters) {
    filters = filters || {};
    var rows = CB.db.transporters.map(function (t) {
      return CB.q.transporterCard(t.userId);
    }).filter(Boolean);

    if (filters.verifiedOnly) rows = rows.filter(function (r) { return r.verified; });
    if (filters.city) rows = rows.filter(function (r) {
      return r.t.homeBase === filters.city || r.t.currentCity === filters.city;
    });
    if (filters.truckType) rows = rows.filter(function (r) {
      return (r.t.truckTypes || []).indexOf(filters.truckType) > -1;
    });
    if (filters.minFleet) rows = rows.filter(function (r) { return r.fleetSize >= Number(filters.minFleet); });
    if (filters.minRating) rows = rows.filter(function (r) { return r.rating >= Number(filters.minRating); });
    if (filters.query) {
      var qy = String(filters.query).toLowerCase();
      rows = rows.filter(function (r) {
        return (r.name + ' ' + r.company + ' ' + r.t.homeBase).toLowerCase().indexOf(qy) > -1;
      });
    }

    var sort = filters.sort || 'reliability';
    if (sort === 'reliability') rows.sort(util.by('reliability', 'desc'));
    else if (sort === 'rating') rows.sort(util.by('rating', 'desc'));
    else if (sort === 'fleet') rows.sort(util.by('fleetSize', 'desc'));
    else if (sort === 'name') rows.sort(util.by('company'));

    return rows;
  };

})();
