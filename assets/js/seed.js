/* ==========================================================================
   CargoBid - seed.js
   The demo world. Seven shippers, fifteen transporters, ~200 trucks, fifteen
   loads spanning every status, a live undercut chain, counter-offer threads,
   trips mid-corridor, and reviews already on the books so the trust system
   has something to say the moment you sign in.

   Everything is deterministic - built from a fixed PRNG seed - so the demo
   looks the same every time you reset it.

   Depends on: core.js, match.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  var util = CB.util;
  var seed = (CB.seed = {});

  var h = function (n) { return n * 3600000; };
  var d = function (n) { return n * 86400000; };
  var m = function (n) { return n * 60000; };

  var T0 = 0;               /* the demo world's "now", set in build() */
  var rand = util.rng(20260825);

  /* ------------------------------------------------------------------------
     CAST - SHIPPERS
     ------------------------------------------------------------------------ */

  var SHIPPERS = [
    { id: 'U-S01', name: 'Rakesh Sharma', company: 'Sharma Steel Traders',
      city: 'Jaipur', phone: '+91 98290 11204', email: 'rakesh@sharmasteel.in',
      gstin: '08AACCS1234K1ZP', loadsPosted: 68, rating: 4.6, since: -d(690),
      sector: 'Steel & construction', featured: true,
      blurb: 'TMT bars, angles and pipes out of the Jaipur belt. Ships 15-20 trucks a month.' },

    { id: 'U-S02', name: 'Meenakshi Iyer', company: 'Meenakshi Textiles Pvt Ltd',
      city: 'Surat', phone: '+91 99250 63317', email: 'ops@meenakshitex.com',
      gstin: '24AABCM9087L1Z4', loadsPosted: 142, rating: 4.8, since: -d(1240),
      sector: 'Textiles', featured: true,
      blurb: 'Polyester fabric and cotton yarn from Surat to every metro.' },

    { id: 'U-S03', name: 'Harpreet Aggarwal', company: 'Aggarwal Agro Mills',
      city: 'Indore', phone: '+91 94250 78810', email: 'dispatch@aggarwalagro.in',
      gstin: '23AAFCA4412M1ZB', loadsPosted: 51, rating: 4.3, since: -d(420),
      sector: 'Agri commodities',
      blurb: 'Soya DOC, wheat and pulses. Bulk bagged cargo, price sensitive.' },

    { id: 'U-S04', name: 'Dev Menon', company: 'CoolChain Foods',
      city: 'Pune', phone: '+91 88880 42219', email: 'dev@coolchainfoods.in',
      gstin: '27AADCC7761N1ZQ', loadsPosted: 96, rating: 4.7, since: -d(830),
      sector: 'Cold chain', featured: true,
      blurb: 'Frozen ready-meals and seafood. Reefer only, no exceptions.' },

    { id: 'U-S05', name: 'Bhavna Rathore', company: 'Rajputana Ceramics',
      city: 'Udaipur', phone: '+91 94140 55028', email: 'logistics@rajputanaceramics.com',
      gstin: '08AAGCR2290P1ZL', loadsPosted: 34, rating: 4.4, since: -d(310),
      sector: 'Ceramics & sanitaryware',
      blurb: 'Tiles and sanitaryware. Breakage is the whole game.' },

    { id: 'U-S06', name: 'Sanjay Bose', company: 'Nova Pharma Labs',
      city: 'Ahmedabad', phone: '+91 90990 31447', email: 'scm@novapharmalabs.in',
      gstin: '24AAHCN5583R1ZY', loadsPosted: 77, rating: 4.9, since: -d(960),
      sector: 'Pharmaceuticals',
      blurb: 'API drums and finished formulations. Hazmat paperwork every time.' },

    { id: 'U-S07', name: 'Nitin Kapoor', company: 'Kapoor Distribution House',
      city: 'Delhi', phone: '+91 98110 20063', email: 'nitin@kapoordist.in',
      gstin: '07AACCK1178T1ZM', loadsPosted: 118, rating: 4.5, since: -d(1080),
      sector: 'FMCG distribution',
      blurb: 'Palletised FMCG out of the Delhi NCR hubs into tier-2 towns.' }
  ];

  /* ------------------------------------------------------------------------
     CAST - TRANSPORTERS
     Reliability is never stored directly. It is computed from these
     components by CB.score.reliability, so the number always has a reason
     behind it. Approximate resulting score noted per row.
     ------------------------------------------------------------------------ */

  var TRANSPORTERS = [
    { id: 'U-T01', name: 'Vikram Singh', company: 'Singh Roadways',
      home: 'Jaipur', phone: '+91 98290 47712', email: 'vikram@singhroadways.in',
      fleet: 12, types: ['open', 'trailer', 'container'], radius: 60,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.7, 4.6, 4.5], count: 27, deliveries: 27, onTime: 24, cancel: 0, noShow: 0,
      bidsPlaced: 91, bidsWon: 31, since: -d(760), featured: true, hazmat: false,
      blurb: 'Jaipur to NCR and the eastern corridor. Runs his own trailers for marble.' },   /* ~96 */

    { id: 'U-T02', name: 'Mohan Lal Gurjar', company: 'Gurjar Transport Co.',
      home: 'Jaipur', current: 'Delhi', phone: '+91 94140 88123', email: 'gurjartransport@gmail.com',
      fleet: 6, types: ['open', 'container'], radius: 50,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.4, 4.5, 4.3], count: 19, deliveries: 19, onTime: 16, cancel: 1, noShow: 0,
      bidsPlaced: 64, bidsWon: 19, since: -d(540), hazmat: false,
      blurb: 'Six trucks, family run. Currently stranded in Delhi looking for a return load.' }, /* ~84 */

    { id: 'U-T03', name: 'Pramod Jat', company: 'Marudhara Carriers',
      home: 'Jaipur', phone: '+91 99280 34410', email: null,
      fleet: 4, types: ['open'], radius: 45, prefersSms: true,
      docs: { gst: 'verified', pan: 'pending', rc: 'verified' },
      r: [4.2, 4.3, 4.1], count: 11, deliveries: 11, onTime: 9, cancel: 1, noShow: 0,
      bidsPlaced: 38, bidsWon: 11, since: -d(240), hazmat: false,
      blurb: 'No email, no app. Bids over WhatsApp and shows up on time anyway.' },            /* ~71 */

    { id: 'U-T04', name: 'Anil Chaudhary', company: 'Chaudhary Freight Lines',
      home: 'Bhiwadi', phone: '+91 98730 55901', email: 'ops@chaudharyfreight.in',
      fleet: 22, types: ['container', 'trailer', 'open'], radius: 90,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.5, 4.6, 4.4], count: 58, deliveries: 58, onTime: 52, cancel: 1, noShow: 0,
      bidsPlaced: 210, bidsWon: 63, since: -d(1420), hazmat: false,
      blurb: 'Bhiwadi industrial belt specialist. Serves the whole NCR ring.' },               /* ~92 */

    { id: 'U-T05', name: 'Satbir Yadav', company: 'Yadav Logistics',
      home: 'Gurugram', phone: '+91 98110 66234', email: 'satbir@yadavlogistics.co.in',
      fleet: 18, types: ['container', 'open'], radius: 75,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.3, 4.4, 4.2], count: 41, deliveries: 41, onTime: 34, cancel: 1, noShow: 0,
      bidsPlaced: 176, bidsWon: 44, since: -d(1130), hazmat: false,
      blurb: 'NCR to Rajasthan and Punjab. Big on palletised FMCG.' },                         /* ~90 */

    { id: 'U-T06', name: 'Imran Qureshi', company: 'Crescent Cargo Movers',
      home: 'Delhi', phone: '+91 98180 71120', email: 'imran@crescentcargo.in',
      fleet: 31, types: ['container', 'trailer', 'open', 'reefer'], radius: 100,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.6, 4.7, 4.5], count: 76, deliveries: 76, onTime: 68, cancel: 1, noShow: 0,
      bidsPlaced: 302, bidsWon: 88, since: -d(1810), hazmat: true,
      blurb: 'Pan-India, hazmat licensed, runs a 24x7 control room.' },                        /* ~93 */

    { id: 'U-T07', name: 'Deepak Kumhar', company: 'Aravalli Goods Carriers',
      home: 'Alwar', phone: '+91 94610 20087', email: null,
      fleet: 3, types: ['open', 'tipper'], radius: 60, prefersSms: true,
      docs: { gst: 'pending', pan: 'none', rc: 'verified' },
      r: [3.9, 4.1, 3.8], count: 6, deliveries: 6, onTime: 4, cancel: 1, noShow: 0,
      bidsPlaced: 21, bidsWon: 6, since: -d(150), hazmat: false,
      blurb: 'Three tippers, Alwar to Bhiwadi. New to the platform, still proving out.' },     /* ~65 */

    { id: 'U-T08', name: 'Rajendra Meena', company: 'Meena Roadlines',
      home: 'Kota', phone: '+91 93510 44219', email: 'meenaroadlines@yahoo.in',
      fleet: 9, types: ['open', 'tipper'], radius: 70,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.4, 4.5, 4.3], count: 23, deliveries: 23, onTime: 20, cancel: 1, noShow: 0,
      bidsPlaced: 84, bidsWon: 24, since: -d(600), hazmat: false,
      blurb: 'Kota stone and coal out of the Hadoti belt.' },                                  /* ~86 */

    { id: 'U-T09', name: 'Bharat Patel', company: 'Patel Transport Service',
      home: 'Surat', phone: '+91 99240 10056', email: 'bharat@pateltransport.com',
      fleet: 46, types: ['container', 'trailer', 'open', 'reefer'], radius: 120,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.8, 4.9, 4.7], count: 120, deliveries: 120, onTime: 112, cancel: 1, noShow: 0,
      bidsPlaced: 431, bidsWon: 137, since: -d(2190), hazmat: true, featured: true,
      blurb: 'The Surat textile corridor moves on his trucks. 46 vehicles, own workshop.' },   /* ~95 */

    { id: 'U-T10', name: 'Kiran Desai', company: 'Desai Coldchain',
      home: 'Surat', phone: '+91 99790 30412', email: 'kiran@desaicoldchain.in',
      fleet: 14, types: ['reefer', 'container'], radius: 95,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.7, 4.8, 4.6], count: 44, deliveries: 44, onTime: 41, cancel: 1, noShow: 0,
      bidsPlaced: 138, bidsWon: 47, since: -d(1010), hazmat: false,
      blurb: 'Reefer only. Data-logged temperature on every leg.' },                           /* ~94 */

    { id: 'U-T11', name: 'Ganesh Shinde', company: 'Shinde Carriers',
      home: 'Pune', phone: '+91 90280 51173', email: 'shindecarriers@gmail.com',
      fleet: 11, types: ['reefer', 'container', 'open'], radius: 80,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.3, 4.4, 4.2], count: 31, deliveries: 31, onTime: 26, cancel: 1, noShow: 0,
      bidsPlaced: 119, bidsWon: 33, since: -d(710), hazmat: false,
      blurb: 'Pune to the south. Mixed reefer and dry fleet.' },                               /* ~88 */

    { id: 'U-T12', name: 'Nilesh Bhawsar', company: 'Malwa Transport Udyog',
      home: 'Indore', phone: '+91 94250 90031', email: null,
      fleet: 5, types: ['open', 'tipper'], radius: 65, prefersSms: true,
      docs: { gst: 'verified', pan: 'pending', rc: 'pending' },
      r: [4.1, 4.2, 4.0], count: 14, deliveries: 14, onTime: 11, cancel: 1, noShow: 0,
      bidsPlaced: 47, bidsWon: 14, since: -d(280), hazmat: false,
      blurb: 'Malwa region agri bulk. Paperwork half done, price always keen.' },              /* ~71 */

    { id: 'U-T13', name: 'Feroze Sheikh', company: 'Sheikh Brothers Cargo',
      home: 'Ahmedabad', phone: '+91 90990 66218', email: 'feroze@sheikhbros.in',
      fleet: 16, types: ['container', 'trailer', 'reefer'], radius: 100,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.5, 4.6, 4.4], count: 52, deliveries: 52, onTime: 47, cancel: 1, noShow: 0,
      bidsPlaced: 188, bidsWon: 55, since: -d(1350), hazmat: true,
      blurb: 'Gujarat chemical and pharma corridor. Hazmat licensed since 2019.' },            /* ~92 */

    { id: 'U-T14', name: 'Lakhan Bishnoi', company: 'Bishnoi Speed Carriers',
      home: 'Jodhpur', phone: '+91 94140 77390', email: null,
      fleet: 7, types: ['open', 'tipper'], radius: 80, prefersSms: true,
      docs: { gst: 'pending', pan: 'none', rc: 'none' },
      r: [3.6, 3.4, 3.8], count: 12, deliveries: 12, onTime: 6, cancel: 2, noShow: 1,
      bidsPlaced: 96, bidsWon: 13, since: -d(390), hazmat: false,
      blurb: 'Bids the lowest number on the board, then sometimes does not turn up.' },        /* ~45 */

    { id: 'U-T15', name: 'Suresh Rawat', company: 'Rawat Movers',
      home: 'Jaipur', phone: '+91 93140 26654', email: 'sureshrawat.movers@gmail.com',
      fleet: 2, types: ['container'], radius: 55, prefersSms: true,
      docs: { gst: 'verified', pan: 'verified', rc: 'verified' },
      r: [4.5, 4.6, 4.4], count: 8, deliveries: 8, onTime: 8, cancel: 0, noShow: 0,
      bidsPlaced: 29, bidsWon: 8, since: -d(190), hazmat: false,
      blurb: 'Two trucks, owner-driver. Perfect record, just very small.' }                    /* ~87 */
  ];

  /* ------------------------------------------------------------------------
     FLEET GENERATION
     ------------------------------------------------------------------------ */

  var REG_CODE = {
    Jaipur: 'RJ14', Alwar: 'RJ02', Bhiwadi: 'RJ02', Kota: 'RJ20', Jodhpur: 'RJ19',
    Udaipur: 'RJ27', Ajmer: 'RJ01', Delhi: 'DL1L', Gurugram: 'HR26', Faridabad: 'HR51',
    Noida: 'UP16', Surat: 'GJ05', Ahmedabad: 'GJ01', Vadodara: 'GJ06', Rajkot: 'GJ03',
    Pune: 'MH12', Mumbai: 'MH04', Nashik: 'MH15', Nagpur: 'MH31', Indore: 'MP09',
    Bhopal: 'MP04', Ludhiana: 'PB10', Chandigarh: 'CH01', Lucknow: 'UP32',
    Hyderabad: 'TS09', Bengaluru: 'KA01', Chennai: 'TN09', Kolkata: 'WB02'
  };

  var SERIES = ['GH', 'GD', 'JB', 'KC', 'MN', 'PA', 'TC', 'UB', 'AL', 'DR', 'GA', 'HH', 'NX', 'RS'];

  var SPEC = {
    open:      { caps: [9, 16, 21, 25], ft: [19, 22, 24, 32] },
    container: { caps: [9, 16, 21, 32], ft: [20, 24, 28, 32] },
    reefer:    { caps: [7, 12, 16, 20], ft: [18, 20, 22, 24] },
    trailer:   { caps: [28, 32, 40, 45], ft: [40, 45, 50, 50] },
    tipper:    { caps: [16, 21, 25, 25], ft: [16, 18, 18, 20] }
  };

  function regNo(city) {
    var code = REG_CODE[city] || 'RJ14';
    return code + '-' + util.pick(rand, SERIES) + '-' +
      String(util.int(rand, 1000, 9899)).padStart(4, '0');
  }

  /* Every transporter gets one flagship truck per declared type, at that
     type's top capacity, so a load asking for the heavy end of a category is
     never impossible to serve. The remainder of the fleet is filled in
     randomly across their declared types. */
  function buildFleet(t) {
    var trucks = [];
    var used = {};

    t.types.forEach(function (type) {
      var s = SPEC[type];
      trucks.push({
        type: type,
        capacityTons: s.caps[s.caps.length - 1],
        bodyFt: s.ft[s.ft.length - 1]
      });
    });

    while (trucks.length < t.fleet) {
      var type = util.pick(rand, t.types);
      var s = SPEC[type];
      var i = util.int(rand, 0, s.caps.length - 1);
      trucks.push({ type: type, capacityTons: s.caps[i], bodyFt: s.ft[i] });
    }
    trucks.length = t.fleet;

    return trucks.map(function (spec, i) {
      var reg;
      do { reg = regNo(t.home); } while (used[reg]);
      used[reg] = true;

      /* Roughly half the fleet idle, a third out on a job, a few in the shed. */
      var roll = rand();
      var status = roll < 0.52 ? 'idle' : (roll < 0.9 ? 'on-trip' : 'maintenance');
      /* The flagship of each type stays idle so it is biddable. */
      if (i < t.types.length) status = 'idle';

      return {
        id: CB.nextId('truck', 'TK'),
        ownerId: t.id,
        regNo: reg,
        type: spec.type,
        capacityTons: spec.capacityTons,
        bodyFt: spec.bodyFt,
        status: status,
        currentCity: status === 'on-trip' ? util.pick(rand, ['Delhi', 'Mumbai', 'Ahmedabad', 'Pune', 'Nagpur', 'Lucknow']) : t.home,
        odometerKm: util.int(rand, 48000, 690000),
        insuranceTill: T0 + d(util.int(rand, 20, 400)),
        fitnessTill: T0 + d(util.int(rand, 40, 500))
      };
    });
  }

  /* ------------------------------------------------------------------------
     LOAD DEFINITIONS
     `at` is when it was posted, relative to now. `closeIn` is the remaining
     bid window. Statuses are laid out so every screen has real content on
     first sign-in.
     ------------------------------------------------------------------------ */

  var LOADS = [
    /* --- 1. The hero load. Open reverse auction, closing in 40 minutes,
             five bids deep with a live undercut chain. --------------------- */
    { key: 'L1', shipper: 'U-S01', status: 'open', mode: 'open',
      title: 'TMT steel bars — 12mm & 16mm bundles',
      from: 'Jaipur', to: 'Delhi', at: -h(5.5), closeIn: m(40),
      pincodeFrom: '302013', pincodeTo: '110044',
      addrFrom: 'Plot 44, Vishwakarma Industrial Area', addrTo: 'Badarpur Border, Sector 5 yard',
      mat: 'TMT steel bars', cat: 'Steel & metals', tons: 18,
      dims: '12 m bundles, crane loaded', flags: { stackable: true },
      truck: 'open', minCap: 21, ft: 32, count: 1,
      pickupIn: d(1), pickupSpan: h(4), flexible: false,
      deliverIn: d(2) + h(12), ceiling: 26000,
      bidders: ['U-T01', 'U-T02', 'U-T04', 'U-T03', 'U-T14'], chain: true },

    /* --- 2. Blind bidding, fragile ceramics, flexible dates. ------------- */
    { key: 'L2', shipper: 'U-S05', status: 'open', mode: 'blind',
      title: 'Glazed floor tiles — 600x600 boxed',
      from: 'Udaipur', to: 'Ahmedabad', at: -h(19), closeIn: h(5),
      pincodeFrom: '313003', pincodeTo: '382330',
      addrFrom: 'Madri Industrial Area, Phase II', addrTo: 'Naroda GIDC, Shed 118',
      mat: 'Glazed ceramic tiles', cat: 'Ceramics', tons: 9,
      dims: '420 boxes on 14 pallets', flags: { fragile: true, stackable: true },
      truck: 'container', minCap: 16, ft: 24, count: 1,
      pickupIn: d(2), pickupSpan: h(6), flexible: true, flexDays: 2,
      deliverIn: d(4), ceiling: null,
      bidders: ['U-T13', 'U-T09', 'U-T15'] },

    /* --- 3. Open auction on a dense, competitive corridor. -------------- */
    { key: 'L3', shipper: 'U-S02', status: 'open', mode: 'open',
      title: 'Cotton yarn bales — 30s combed',
      from: 'Surat', to: 'Mumbai', at: -h(9), closeIn: h(11),
      pincodeFrom: '394230', pincodeTo: '400710',
      addrFrom: 'Sachin GIDC, Road 6', addrTo: 'Bhiwandi warehouse cluster, Gate 3',
      mat: 'Cotton yarn bales', cat: 'Textiles', tons: 22,
      dims: '110 bales, tarpaulin required', flags: { stackable: true },
      truck: 'container', minCap: 25, ft: 32, count: 1,
      pickupIn: d(1) + h(2), pickupSpan: h(5), flexible: false,
      deliverIn: d(2), ceiling: null,
      bidders: ['U-T09', 'U-T10', 'U-T13', 'U-T11'], chain: true },

    /* --- 4. Reefer, perishable, urgent - the premium end of the market. -- */
    { key: 'L4', shipper: 'U-S04', status: 'open', mode: 'blind',
      title: 'Frozen ready-meals — hold at −18°C',
      from: 'Pune', to: 'Bengaluru', at: -h(3), closeIn: h(2) + m(15),
      pincodeFrom: '412115', pincodeTo: '562123',
      addrFrom: 'Ranjangaon MIDC, Unit 7', addrTo: 'Hoskote cold store, Dock 2',
      mat: 'Frozen ready-meals', cat: 'Frozen foods', tons: 12,
      dims: '18 pallets, data logger mandatory', flags: { perishable: true, fragile: true },
      truck: 'reefer', minCap: 16, ft: 22, count: 1,
      pickupIn: h(10), pickupSpan: h(3), flexible: false,
      deliverIn: d(1) + h(14), ceiling: 68000,
      bidders: ['U-T11', 'U-T10'] },

    /* --- 5. THE BACKHAUL LOAD. Delhi -> Jaipur, which is exactly the leg a
             stranded Jaipur truck needs. Gurjar Transport is sitting in
             Delhi right now. ------------------------------------------------ */
    { key: 'L5', shipper: 'U-S07', status: 'open', mode: 'open',
      title: 'Palletised FMCG cartons — mixed SKU',
      from: 'Delhi', to: 'Jaipur', at: -h(7), closeIn: h(8),
      pincodeFrom: '110037', pincodeTo: '302022',
      addrFrom: 'Mahipalpur DC, Bay 11', addrTo: 'Sitapura distribution centre',
      mat: 'FMCG cartons', cat: 'FMCG', tons: 16,
      dims: '24 pallets, 1.2 m stack height', flags: { stackable: true },
      truck: 'container', minCap: 21, ft: 32, count: 1,
      pickupIn: d(1), pickupSpan: h(8), flexible: true, flexDays: 1,
      deliverIn: d(2) + h(6), ceiling: null,
      bidders: ['U-T02', 'U-T06', 'U-T05', 'U-T04'], chain: true },

    /* --- 6. Bids closed, decision pending. Lands on the dashboard as
             "needs your decision" the moment you sign in. ----------------- */
    { key: 'L6', shipper: 'U-S03', status: 'closed', mode: 'open',
      title: 'Soya DOC in 50 kg bags',
      from: 'Indore', to: 'Nagpur', at: -d(1) - h(4), closeIn: -h(1),
      pincodeFrom: '452015', pincodeTo: '440016',
      addrFrom: 'Sanwer Road, Mill gate 2', addrTo: 'Butibori MIDC feed plant',
      mat: 'Soya de-oiled cake', cat: 'Agri commodities', tons: 25,
      dims: '500 bags, loose loaded', flags: { stackable: true },
      truck: 'open', minCap: 25, ft: 24, count: 1,
      pickupIn: h(20), pickupSpan: h(6), flexible: true, flexDays: 1,
      deliverIn: d(2), ceiling: 34000,
      bidders: ['U-T12', 'U-T08', 'U-T11', 'U-T14', 'U-T04', 'U-T09'] },

    /* --- 7. Hazardous pharma, bids closed. ------------------------------ */
    { key: 'L7', shipper: 'U-S06', status: 'closed', mode: 'blind',
      title: 'API drums — Class 8 corrosive',
      from: 'Ahmedabad', to: 'Hyderabad', at: -d(1) - h(9), closeIn: -h(3),
      pincodeFrom: '382445', pincodeTo: '500055',
      addrFrom: 'Odhav GIDC, Plot 219', addrTo: 'Jeedimetla Phase IV',
      mat: 'API drums (corrosive)', cat: 'Chemicals', tons: 8,
      dims: '40 HDPE drums, UN certified', flags: { hazardous: true, fragile: true },
      truck: 'container', minCap: 16, ft: 24, count: 1,
      pickupIn: h(30), pickupSpan: h(4), flexible: false,
      deliverIn: d(3), ceiling: null,
      bidders: ['U-T13', 'U-T06', 'U-T09'] },

    /* --- 8. Awarded, truck not yet at pickup. --------------------------- */
    { key: 'L8', shipper: 'U-S02', status: 'awarded', mode: 'open',
      title: 'Polyester fabric rolls',
      from: 'Surat', to: 'Delhi', at: -d(2) - h(6), closeIn: -d(1) - h(8),
      pincodeFrom: '394210', pincodeTo: '110006',
      addrFrom: 'Pandesara GIDC, Unit 34', addrTo: 'Chandni Chowk, Katra Neel',
      mat: 'Polyester fabric rolls', cat: 'Textiles', tons: 20,
      dims: '380 rolls, no hooks', flags: { stackable: true },
      truck: 'container', minCap: 21, ft: 32, count: 1,
      pickupIn: h(14), pickupSpan: h(6), flexible: false,
      deliverIn: d(3), ceiling: null,
      bidders: ['U-T09', 'U-T13', 'U-T06', 'U-T05'], winner: 'U-T09', tripAt: 'assigned',
      awardedAgo: h(18) },

    /* --- 9. Awarded, truck has reached pickup. Vikram's job. ------------ */
    { key: 'L9', shipper: 'U-S01', status: 'awarded', mode: 'open',
      title: 'Polished marble slabs — over-dimensional',
      from: 'Jaipur', to: 'Kolkata', at: -d(3), closeIn: -d(2) - h(6),
      pincodeFrom: '303704', pincodeTo: '711302',
      addrFrom: 'Kishangarh marble mandi, Yard 12', addrTo: 'Howrah, Dobson Road depot',
      mat: 'Polished marble slabs', cat: 'Stone', tons: 30,
      dims: '3.2 m x 1.9 m slabs in A-frames', flags: { oversized: true, fragile: true },
      truck: 'trailer', minCap: 32, ft: 45, count: 1,
      pickupIn: h(4), pickupSpan: h(6), flexible: false,
      deliverIn: d(4), ceiling: null,
      bidders: ['U-T01', 'U-T04', 'U-T06'], winner: 'U-T01', tripAt: 'at-pickup',
      awardedAgo: d(2) },

    /* --- 10. In transit, mid-corridor. --------------------------------- */
    { key: 'L10', shipper: 'U-S04', status: 'in-transit', mode: 'blind',
      title: 'Frozen seafood — hold at −20°C',
      from: 'Pune', to: 'Chennai', at: -d(4), closeIn: -d(3) - h(10),
      pincodeFrom: '411026', pincodeTo: '600096',
      addrFrom: 'Bhosari MIDC cold store', addrTo: 'Perungudi cold chain hub',
      mat: 'Frozen seafood', cat: 'Frozen foods', tons: 11,
      dims: '16 pallets, continuous logging', flags: { perishable: true },
      truck: 'reefer', minCap: 16, ft: 22, count: 1,
      pickupIn: -d(2), pickupSpan: h(4), flexible: false,
      deliverIn: h(30), ceiling: null,
      bidders: ['U-T11', 'U-T10', 'U-T09'], winner: 'U-T11', tripAt: 'in-transit',
      awardedAgo: d(3) },

    /* --- 11. In transit, loaded and rolling. Vikram's second live job. -- */
    { key: 'L11', shipper: 'U-S01', status: 'in-transit', mode: 'open',
      title: 'ERW steel pipes — 4" and 6"',
      from: 'Jaipur', to: 'Ludhiana', at: -d(3) - h(8), closeIn: -d(2) - h(14),
      pincodeFrom: '302022', pincodeTo: '141003',
      addrFrom: 'Sitapura Industrial Area, Plot 77', addrTo: 'Focal Point Phase VI',
      mat: 'ERW steel pipes', cat: 'Steel & metals', tons: 15,
      dims: '6 m lengths, strapped in bundles', flags: { stackable: true },
      truck: 'open', minCap: 16, ft: 24, count: 1,
      pickupIn: -h(20), pickupSpan: h(5), flexible: false,
      deliverIn: h(18), ceiling: null,
      bidders: ['U-T01', 'U-T03', 'U-T02', 'U-T14'], winner: 'U-T01', tripAt: 'loaded',
      awardedAgo: d(2) + h(10) },

    /* --- 12. Delivered and already reviewed - gives Vikram a track record. */
    { key: 'L12', shipper: 'U-S01', status: 'delivered', mode: 'open',
      title: 'Steel angles and channels',
      from: 'Jaipur', to: 'Gurugram', at: -d(9), closeIn: -d(8) - h(14),
      pincodeFrom: '302013', pincodeTo: '122001',
      addrFrom: 'Vishwakarma Industrial Area, Plot 44', addrTo: 'Udyog Vihar Phase IV',
      mat: 'Steel angles', cat: 'Steel & metals', tons: 12,
      dims: 'Mixed sections, crane loaded', flags: { stackable: true },
      truck: 'open', minCap: 16, ft: 22, count: 1,
      pickupIn: -d(8), pickupSpan: h(5), flexible: false,
      deliverIn: -d(6), ceiling: null,
      bidders: ['U-T01', 'U-T03', 'U-T02'], winner: 'U-T01', tripAt: 'delivered',
      awardedAgo: d(8) + h(12),
      review: { p: 5, c: 5, m: 4, by: 'U-S01',
        text: 'Truck reached the plant an hour early. Zero damage on unloading. Will book again.' } },

    /* --- 13. Delivered but NOT yet reviewed - prompts the shipper. ------ */
    { key: 'L13', shipper: 'U-S05', status: 'delivered', mode: 'blind',
      title: 'Sanitaryware — wash basins and cisterns',
      from: 'Udaipur', to: 'Jaipur', at: -d(3) - h(2), closeIn: -d(2) - h(16),
      pincodeFrom: '313003', pincodeTo: '302017',
      addrFrom: 'Madri Industrial Area, Phase I', addrTo: 'Transport Nagar, Godown 9',
      mat: 'Sanitaryware', cat: 'Ceramics', tons: 7,
      dims: 'Crated, do not double-stack', flags: { fragile: true },
      truck: 'container', minCap: 9, ft: 20, count: 1,
      pickupIn: -d(2), pickupSpan: h(4), flexible: false,
      deliverIn: h(6), ceiling: null,
      bidders: ['U-T03', 'U-T15', 'U-T01'], winner: 'U-T03', tripAt: 'delivered',
      awardedAgo: d(2) + h(12) },

    /* --- 14. Delivered, reviewed, older history. ----------------------- */
    { key: 'L14', shipper: 'U-S02', status: 'delivered', mode: 'open',
      title: 'Grey fabric rolls',
      from: 'Surat', to: 'Pune', at: -d(14), closeIn: -d(13) - h(10),
      pincodeFrom: '394230', pincodeTo: '411019',
      addrFrom: 'Sachin GIDC, Road 2', addrTo: 'Pimpri processing unit',
      mat: 'Grey fabric rolls', cat: 'Textiles', tons: 18,
      dims: '300 rolls', flags: { stackable: true },
      truck: 'container', minCap: 21, ft: 32, count: 1,
      pickupIn: -d(13), pickupSpan: h(6), flexible: true, flexDays: 1,
      deliverIn: -d(11), ceiling: null,
      bidders: ['U-T09', 'U-T10', 'U-T13'], winner: 'U-T09', tripAt: 'delivered',
      awardedAgo: d(13) + h(6),
      review: { p: 5, c: 5, m: 5, by: 'U-S02',
        text: 'Patel Transport is the reason we stopped calling brokers. Flawless.' } },

    /* --- 15. Cancelled, for completeness of the status set. ------------- */
    { key: 'L15', shipper: 'U-S03', status: 'cancelled', mode: 'open',
      title: 'Kota stone slabs',
      from: 'Kota', to: 'Bhopal', at: -d(5), closeIn: -d(4) - h(12),
      pincodeFrom: '324007', pincodeTo: '462046',
      addrFrom: 'Ramganjmandi stone yard', addrTo: 'Govindpura Industrial Area',
      mat: 'Kota stone slabs', cat: 'Stone', tons: 10,
      dims: 'Rough cut, sand bedded', flags: {},
      truck: 'open', minCap: 16, ft: 22, count: 1,
      pickupIn: -d(4), pickupSpan: h(6), flexible: false,
      deliverIn: -d(2), ceiling: null,
      bidders: ['U-T08', 'U-T14'] }
  ];

  /* ------------------------------------------------------------------------
     BUILD
     ------------------------------------------------------------------------ */

  seed.build = function () {
    rand = util.rng(20260825);

    /* Anchor the demo world at 10:40 this morning so pickup windows and
       "Today / Tomorrow" labels read naturally whenever you open it. */
    var anchor = new Date();
    anchor.setHours(10, 40, 0, 0);
    T0 = anchor.getTime();
    CB.db.clock.t = T0;
    CB.db.clock.speed = 1;
    CB.db.session.userId = null;

    var byKey = {};

    /* --- users + profiles -------------------------------------------- */
    SHIPPERS.forEach(function (s) {
      CB.db.users.push({
        id: s.id, role: 'shipper', name: s.name, company: s.company,
        phone: s.phone, email: s.email, city: s.city, avatarSeed: s.id
      });
      CB.db.shippers.push({
        userId: s.id, gstin: s.gstin, loadsPosted: s.loadsPosted,
        rating: s.rating, sector: s.sector, blurb: s.blurb,
        featured: !!s.featured, memberSince: T0 + s.since
      });
    });

    TRANSPORTERS.forEach(function (t) {
      CB.db.users.push({
        id: t.id, role: 'transporter', name: t.name, company: t.company,
        phone: t.phone, email: t.email, city: t.home, avatarSeed: t.id
      });

      var prof = {
        userId: t.id,
        homeBase: t.home,
        currentCity: t.current || t.home,
        availableFrom: T0,
        radiusKm: t.radius,
        fleetSize: t.fleet,
        truckTypes: t.types.slice(),
        docs: { gst: t.docs.gst, pan: t.docs.pan, rc: t.docs.rc },
        docRefs: {
          gst: t.docs.gst !== 'none' ? '0' + (7 + Math.floor(rand() * 20)) + 'AA' +
            String.fromCharCode(65 + Math.floor(rand() * 26)) + 'C' +
            util.int(rand, 1000, 9999) + 'K1Z' +
            String.fromCharCode(65 + Math.floor(rand() * 26)) : '',
          pan: t.docs.pan !== 'none' ? 'AA' + String.fromCharCode(65 + Math.floor(rand() * 26)) +
            'C' + util.int(rand, 1000, 9999) + String.fromCharCode(65 + Math.floor(rand() * 26)) : '',
          rc: ''
        },
        verified: t.docs.gst === 'verified' && t.docs.pan === 'verified' && t.docs.rc === 'verified',
        hazmatLicence: !!t.hazmat,
        prefersSms: !!t.prefersSms,
        ratings: { punctuality: t.r[0], cargoSafety: t.r[1], communication: t.r[2], count: t.count },
        deliveries: t.deliveries,
        onTimeDeliveries: t.onTime,
        lateDeliveries: t.deliveries - t.onTime,
        onTimeRate: Math.round((t.onTime / t.deliveries) * 100),
        cancellations: t.cancel,
        noShows: t.noShow,
        bidsPlaced: t.bidsPlaced,
        bidsWon: t.bidsWon,
        blurb: t.blurb,
        featured: !!t.featured,
        memberSince: T0 + t.since,
        reliability: 0
      };
      prof.reliability = CB.score.reliability(prof);
      CB.db.transporters.push(prof);

      buildFleet(t).forEach(function (tk) { CB.db.trucks.push(tk); });
    });

    /* --- loads ------------------------------------------------------- */
    LOADS.forEach(function (spec) {
      var o = CB.city(spec.from), dst = CB.city(spec.to);
      var postedAt = T0 + spec.at;
      var load = {
        id: CB.nextId('load', 'LD'),
        shipperId: spec.shipper,
        title: spec.title,
        origin: {
          city: spec.from, state: o.state, pincode: spec.pincodeFrom,
          address: spec.addrFrom, lat: o.lat, lng: o.lng
        },
        destination: {
          city: spec.to, state: dst.state, pincode: spec.pincodeTo,
          address: spec.addrTo, lat: dst.lat, lng: dst.lng
        },
        distanceKm: CB.match.roadKm(spec.from, spec.to),
        material: {
          name: spec.mat, category: spec.cat, weightTons: spec.tons,
          dims: spec.dims, flags: spec.flags || {}
        },
        need: {
          truckType: spec.truck, minCapacityTons: spec.minCap,
          bodyFt: spec.ft, count: spec.count || 1
        },
        pickup: {
          from: T0 + spec.pickupIn,
          to: T0 + spec.pickupIn + spec.pickupSpan,
          flexible: !!spec.flexible, flexDays: spec.flexDays || 0
        },
        deliverBy: T0 + spec.deliverIn,
        mode: spec.mode,
        targetPrice: null,
        ceiling: spec.ceiling || null,
        bidCloseAt: T0 + spec.closeIn,
        status: spec.status,
        awardedBidId: null,
        notified: [],
        views: util.int(rand, 6, 74),
        createdAt: postedAt
      };
      load.targetPrice = util.quote(CB.match.basePrice(load) * 0.95);
      load.notified = CB.match.notifyList(load).map(function (x) { return x.id; });
      CB.db.loads.push(load);
      byKey[spec.key] = load;
    });

    /* --- bids -------------------------------------------------------- */
    LOADS.forEach(function (spec) {
      var load = byKey[spec.key];
      if (!spec.bidders || !spec.bidders.length) return;

      var window_ = Math.max(m(20), (load.bidCloseAt - load.createdAt) * 0.8);
      var priced = spec.bidders.map(function (tid, i) {
        return {
          tid: tid,
          amount: CB.match.bidPrice(load, tid, rand),
          at: load.createdAt + m(12) + (window_ / spec.bidders.length) * i + m(util.int(rand, 0, 25))
        };
      });

      /* In an open reverse auction bidders can see the leader, so late
         entrants undercut it. Rebuild the sequence so it actually reads like
         a descending fight rather than random numbers. */
      if (spec.chain) {
        priced.sort(util.by('amount', 'desc'));
        for (var i = 1; i < priced.length; i++) {
          var target = priced[i - 1].amount * (1 - (0.015 + rand() * 0.025));
          var floor = CB.match.floorPrice(load, priced[i].tid);
          priced[i].amount = util.quote(Math.max(floor, Math.min(priced[i].amount, target)));
        }
        priced.forEach(function (p, ix) {
          p.at = load.createdAt + m(12) + (window_ / priced.length) * ix + m(util.int(rand, 0, 18));
        });
      }

      priced.forEach(function (p) {
        var trucks = CB.match.eligibleTrucks(p.tid, load);
        var t = CB.q.transporter(p.tid);
        var bh = CB.match.backhaul(t, load);
        var eta = bh.is ? util.int(rand, 1, 4)
          : util.int(rand, 2, Math.max(3, Math.round((CB.match.cityKm(t.currentCity || t.homeBase, load.origin.city) || 20) / 35) + 6));

        var bid = {
          id: CB.nextId('bid', 'BID'),
          loadId: load.id,
          transporterId: p.tid,
          amount: p.amount,
          etaPickupHrs: eta,
          truckId: trucks.length ? trucks[0].id : null,
          truckType: trucks.length ? trucks[0].type : load.need.truckType,
          note: noteFor(load, p.tid, bh),
          validUntil: Math.max(load.bidCloseAt, p.at + h(12)),
          status: 'active',
          counters: [],
          history: [],
          isBot: true,
          createdAt: Math.round(p.at),
          updatedAt: Math.round(p.at)
        };
        CB.db.bids.push(bid);
      });

      /* Give the hero load a visible undercut history on the leading bid so
         the bid detail panel has something to show straight away. */
      if (spec.chain) {
        var lowest = CB.q.bidsFor(load.id)[0];
        if (lowest) {
          lowest.history = [
            { amount: util.quote(lowest.amount * 1.09), at: lowest.createdAt - m(38) },
            { amount: util.quote(lowest.amount * 1.04), at: lowest.createdAt - m(16) }
          ];
        }
      }

      /* Rank them the way the auction rules say. */
      if (load.status === 'open' || load.status === 'closed') {
        CB.act._restatus(load);
      }
    });

    /* --- awards, trips, reviews ------------------------------------- */
    LOADS.forEach(function (spec) {
      if (!spec.winner) {
        if (spec.status === 'cancelled') {
          CB.q.bidsFor(byKey[spec.key].id).forEach(function (b) { b.status = 'lost'; });
        }
        return;
      }
      var load = byKey[spec.key];
      var bids = CB.q.bidsFor(load.id);
      var win = null;
      bids.forEach(function (b) { if (b.transporterId === spec.winner) win = b; });
      if (!win) return;

      var awardedAt = T0 - spec.awardedAgo;
      load.awardedBidId = win.id;
      win.status = 'won';
      bids.forEach(function (b) { if (b.id !== win.id) b.status = 'lost'; });

      var truck = win.truckId ? CB.q.truck(win.truckId) : null;
      if (!truck) {
        truck = CB.match.eligibleTrucks(spec.winner, load)[0];
        if (truck) win.truckId = truck.id;
      }

      var DRIVERS = [
        { name: 'Ramesh Yadav', phone: '+91 98290 41562' },
        { name: 'Sukhbir Singh', phone: '+91 98110 77340' },
        { name: 'Iqbal Khan', phone: '+91 99280 15509' },
        { name: 'Mahesh Patil', phone: '+91 90280 63311' },
        { name: 'Devendra Meena', phone: '+91 94140 22876' },
        { name: 'Jaswant Rathore', phone: '+91 93510 66214' }
      ];

      var upto = CB.TRIP_STEPS.map(function (s) { return s.key; }).indexOf(spec.tripAt);
      var legHours = CB.match.transitHours(load.distanceKm);
      var totalSpan = h(2) + h(3) + h(2) + h(legHours) + h(3);

      var trip = {
        id: CB.nextId('trip', 'TRP'),
        loadId: load.id, bidId: win.id,
        transporterId: spec.winner,
        truckId: truck ? truck.id : null,
        driver: util.pick(rand, DRIVERS),
        lrNumber: 'LR' + util.int(rand, 100000, 999999),
        amount: win.amount,
        status: spec.tripAt,
        podUrl: null,
        checkpoints: CB.TRIP_STEPS.map(function (s, i) {
          var done = i <= upto;
          return {
            key: s.key, label: s.label, note: s.note,
            city: i <= 2 ? load.origin.city : (i === 3 ? null : load.destination.city),
            done: done,
            at: done ? Math.round(awardedAt + (totalSpan / 5) * i) : null
          };
        }),
        createdAt: awardedAt
      };

      if (spec.tripAt === 'delivered') {
        trip.deliveredAt = trip.checkpoints[5].at;
        trip.podUrl = 'pod-' + trip.id.toLowerCase() + '.jpg';
        if (truck) { truck.status = 'idle'; truck.currentCity = load.destination.city; }
      } else if (truck) {
        truck.status = 'on-trip';
        truck.currentCity = upto >= 3 ? null : load.origin.city;
        if (!truck.currentCity) truck.currentCity = load.destination.city;
      }

      CB.db.trips.push(trip);

      if (spec.review) {
        CB.db.reviews.push({
          id: CB.nextId('review', 'RV'),
          tripId: trip.id, byId: spec.review.by, aboutId: spec.winner,
          punctuality: spec.review.p, cargoSafety: spec.review.c,
          communication: spec.review.m, comment: spec.review.text,
          at: trip.deliveredAt + h(4)
        });
      }
    });

    /* Historic reviews so ratings are not all traceable to seeded trips. */
    seedHistoricReviews();

    /* --- conversations --------------------------------------------- */
    seedThreads(byKey);

    /* --- notifications --------------------------------------------- */
    seedNotifs(byKey);

    CB.db.events.push({ kind: 'seed', text: 'Demo world built · ' + CB.db.loads.length +
      ' loads · ' + CB.db.bids.length + ' bids · ' + CB.db.trucks.length + ' trucks', at: T0 });

    return CB.db;
  };

  /* ------------------------------------------------------------------------
     BID NOTES - what a real transporter actually types into the box
     ------------------------------------------------------------------------ */

  var GENERIC_NOTES = [
    'Price includes loading labour at origin. Unloading in shipper scope.',
    'Rate valid for today. Diesel revision applies after that.',
    'Own truck, own driver. No sub-contracting.',
    'Can advance the pickup by a few hours if the material is ready.',
    'Toll and permit included. Detention free for 12 hours at each end.',
    'GPS enabled truck, live location shared on WhatsApp through the trip.'
  ];

  function noteFor(load, tid, bh) {
    var t = CB.q.transporter(tid);
    if (bh && bh.is) {
      return 'Empty return leg to ' + bh.homeBase + ' — I would rather run loaded. ' +
        'Sharp rate, truck is already in ' + bh.strandedAt + '.';
    }
    if (load.material.flags && load.material.flags.hazardous) {
      return 'Hazmat licensed driver and TREM card on board. Class 8 handled routinely.';
    }
    if (load.material.flags && load.material.flags.perishable) {
      return 'Reefer pre-cooled two hours before loading. Data logger report shared on delivery.';
    }
    if (load.material.flags && load.material.flags.fragile) {
      return 'Air-bag dunnage and edge protection at my cost. No double stacking.';
    }
    if (load.material.flags && load.material.flags.oversized) {
      return 'ODC permit for the route already in hand. Escort arranged if required.';
    }
    if (t && t.fleetSize <= 3) {
      return 'Small fleet, I drive one of them myself. You will deal with me directly.';
    }
    return util.pick(rand, GENERIC_NOTES);
  }

  /* ------------------------------------------------------------------------
     HISTORIC REVIEWS
     ------------------------------------------------------------------------ */

  var PRAISE = [
    'Reached ahead of schedule. Driver was reachable the whole way.',
    'Cargo arrived exactly as loaded. No claims.',
    'Handled a last-minute reschedule without arguing about it.',
    'Clean truck, proper tarpaulin, sensible driver.',
    'Third consignment with them. Consistent every time.',
    'POD reached us the same evening. Good back office.'
  ];
  var GRIPES = [
    'Delivered fine, but the driver was six hours late to the pickup.',
    'Two boxes scuffed at the edges. Nothing serious, but worth noting.',
    'Had to chase for updates. The cargo was safe though.',
    'Rate was good, communication was not.'
  ];

  function seedHistoricReviews() {
    CB.db.transporters.forEach(function (t) {
      /* One or two written reviews each - the numeric averages already carry
         the full history, these just give the profile page something to read. */
      var n = t.ratings.count > 30 ? 3 : (t.ratings.count > 12 ? 2 : 1);
      for (var i = 0; i < n; i++) {
        var avg = CB.score.avgRating(t);
        var good = avg >= 4.3;
        var shipper = util.pick(rand, CB.db.shippers);
        CB.db.reviews.push({
          id: CB.nextId('review', 'RV'),
          tripId: null,
          byId: shipper.userId,
          aboutId: t.userId,
          punctuality: util.clamp(Math.round(t.ratings.punctuality + (rand() - 0.5)), 1, 5),
          cargoSafety: util.clamp(Math.round(t.ratings.cargoSafety + (rand() - 0.5)), 1, 5),
          communication: util.clamp(Math.round(t.ratings.communication + (rand() - 0.5)), 1, 5),
          comment: good ? util.pick(rand, PRAISE) : util.pick(rand, GRIPES),
          at: T0 - d(util.int(rand, 12, 260)),
          historic: true
        });
      }
    });
  }

  /* ------------------------------------------------------------------------
     CONVERSATIONS - including a live counter-offer for the demo
     ------------------------------------------------------------------------ */

  function seedThreads(byKey) {
    /* A. The hero load: shipper has countered the leading bid and the
          transporter has answered. Reads as a real negotiation. */
    var l1 = byKey.L1;
    var lead = CB.q.bidsFor(l1.id)[0];
    if (lead) {
      var th = CB.act._thread(l1, lead.transporterId);
      th.lastAt = T0 - m(24);
      push(th, l1.shipperId, 'Bhai, rate theek hai but I need the truck at the plant by 6am, not 9. Loading bay is free only in the morning.', 'text', T0 - h(1) - m(20));
      push(th, lead.transporterId, 'Understood. 6am is possible if the material is banded and ready. Crane at your end or mine?', 'text', T0 - h(1) - m(4));
      push(th, l1.shipperId, 'Crane is ours. Bundles will be banded tonight.', 'text', T0 - m(52));
      push(th, lead.transporterId, 'Then I can commit 6am. Holding my rate.', 'text', T0 - m(24));
    }

    /* B. A pending counter-offer from the shipper on a second bid, so the
          "respond to counter" flow has something waiting in it. */
    var l5 = byKey.L5;
    var l5bids = CB.q.bidsFor(l5.id);
    var second = l5bids[1] || l5bids[0];
    if (second) {
      var counterAmount = util.quote(second.amount * 0.93);
      second.counters.push({
        by: 'shipper', amount: counterAmount,
        pickupAt: l5.pickup.from + h(2),
        note: 'Can you do this number? I can give you a flexible pickup window either side of noon.',
        at: T0 - m(41), state: 'pending'
      });
      var th5 = CB.act._thread(l5, second.transporterId);
      th5.lastAt = T0 - m(41);
      push(th5, l5.shipperId,
        'Counter-offer: ' + CB.fmt.money(counterAmount) + '\nCan you do this number? I can give you a flexible pickup window either side of noon.',
        'counter', T0 - m(41));
    }

    /* C. Driver coordination on an awarded trip. */
    var l9 = byKey.L9;
    if (l9 && l9.awardedBidId) {
      var b9 = CB.q.bid(l9.awardedBidId);
      var th9 = CB.act._thread(l9, b9.transporterId);
      th9.lastAt = T0 - h(3);
      push(th9, b9.transporterId, 'Trailer is at the Kishangarh yard. Driver Jaswant, number is in the trip sheet. A-frames loaded and chained.', 'text', T0 - h(5));
      push(th9, l9.shipperId, 'Good. Slab count is 46, please have the driver sign the tally sheet before he moves.', 'text', T0 - h(4) - m(20));
      push(th9, b9.transporterId, 'Done. Tally signed, photo sent to your WhatsApp. Rolling by evening.', 'text', T0 - h(3));
    }

    /* D. An in-transit ETA question. */
    var l10 = byKey.L10;
    if (l10 && l10.awardedBidId) {
      var b10 = CB.q.bid(l10.awardedBidId);
      var th10 = CB.act._thread(l10, b10.transporterId);
      th10.lastAt = T0 - h(9);
      push(th10, l10.shipperId, 'Where is the reefer right now? Cold store needs a slot confirmation.', 'text', T0 - h(11));
      push(th10, b10.transporterId, 'Crossed Hosur. Box holding at −20.4°C, logger screenshot attached. ETA tomorrow 11am.', 'text', T0 - h(9));
    }

    function push(thread, fromId, body, kind, at) {
      CB.db.messages.push({
        id: CB.nextId('msg', 'M'),
        threadId: thread.id, fromId: fromId, body: body,
        kind: kind || 'text', at: at, read: at < T0 - h(2)
      });
    }
  }

  /* ------------------------------------------------------------------------
     NOTIFICATIONS
     ------------------------------------------------------------------------ */

  function seedNotifs(byKey) {
    function n(userId, kind, title, body, href, channel, ago, read) {
      CB.db.notifs.push({
        id: CB.nextId('notif', 'N'),
        userId: userId, kind: kind, title: title, body: body,
        href: href || '', channel: channel || 'app',
        at: T0 - ago, read: !!read
      });
    }

    var l1 = byKey.L1, l6 = byKey.L6, l13 = byKey.L13;
    var l1bids = CB.q.bidsFor(l1.id);
    var lead = l1bids[0];
    var leadUser = lead ? CB.q.user(lead.transporterId) : null;

    /* Rakesh Sharma - the demo shipper. */
    n('U-S01', 'new-bid', 'New leading bid on ' + l1.id,
      (leadUser ? leadUser.company : 'A transporter') + ' bid ' + CB.fmt.money(lead ? lead.amount : 0) +
      ' · Jaipur → Delhi', 'shipper/load.html?id=' + l1.id, 'app', m(24));
    n('U-S01', 'closing', l1.id + ' closes in under an hour',
      l1bids.length + ' bids in. Award before the window shuts or it reopens tomorrow.',
      'shipper/load.html?id=' + l1.id, 'app', m(9));
    n('U-S01', 'trip', byKey.L11.id + ' · Loaded and sealed',
      'ERW steel pipes on the road to Ludhiana. LR generated.', 'shipper/trips.html', 'app', h(6), true);
    n('U-S01', 'trip', byKey.L9.id + ' · Truck at pickup',
      'Trailer reached the Kishangarh marble mandi.', 'shipper/trips.html', 'app', h(14), true);

    /* Vikram Singh - the demo transporter. */
    n('U-T01', 'new-load', 'New load: Jaipur → Delhi',
      '18 t TMT steel bars · Open body · closes in 40 min',
      'transporter/load.html?id=' + l1.id, 'app', h(5));
    n('U-T01', 'outbid', 'You have been outbid on ' + l1.id,
      'Another transporter is now leading. Undercut or hold your rate.',
      'transporter/load.html?id=' + l1.id, 'app', m(31));
    n('U-T01', 'message', 'Message from Sharma Steel Traders',
      'Then I can commit 6am. Holding my rate.', 'transporter/messages.html', 'app', m(24), true);
    n('U-T01', 'review', 'New rating received',
      'You scored 4.7/5 on ' + byKey.L12.id + '. Reliability is holding above 90.',
      'transporter/dashboard.html', 'app', d(5), true);

    /* Mohan Lal Gurjar - stranded in Delhi, this is the whole backhaul pitch. */
    n('U-T02', 'backhaul', 'Return load available: Delhi → Jaipur',
      '16 t FMCG cartons. You are already in Delhi — this beats running home empty.',
      'transporter/return-loads.html', 'whatsapp', h(7));

    /* SMS-first operators get the low-friction channel. */
    n('U-T03', 'new-load', 'CargoBid: Jaipur → Delhi, 18 t steel',
      'Open body, 32 ft, pickup tomorrow 6am. Reply with your rate or tap the link to bid.',
      'bid.html?load=' + l1.id + '&t=' + tokenFor(l1.id, 'U-T03'), 'sms', h(5));
    n('U-T12', 'new-load', 'CargoBid: Indore → Nagpur, 25 t soya DOC',
      'Open body, 24 ft. Bids closed — decision pending with the shipper.',
      'transporter/bids.html', 'sms', d(1), true);
    n('U-T14', 'new-load', 'CargoBid: Jaipur → Delhi, 18 t steel',
      'Open body, 32 ft. Tap to bid, no login needed.',
      'bid.html?load=' + l1.id + '&t=' + tokenFor(l1.id, 'U-T14'), 'sms', h(4), true);

    /* Others, so every account has something on its bell. */
    n('U-S03', 'closing', l6.id + ' bidding has closed',
      '6 bids received. Compare and award — the market has moved on since.',
      'shipper/load.html?id=' + l6.id, 'app', h(1));
    n('U-S05', 'delivered', l13.id + ' delivered',
      'POD captured. Rate Marudhara Carriers to keep the network honest.',
      'shipper/trips.html', 'app', h(6));
    n('U-S02', 'trip', byKey.L8.id + ' awarded to Patel Transport Service',
      'Truck assigned. Pickup window opens this afternoon.', 'shipper/trips.html', 'app', h(18), true);
    n('U-S04', 'trip', byKey.L10.id + ' · In transit',
      'Reefer crossed Hosur, holding at −20.4°C.', 'shipper/trips.html', 'app', h(9), true);
    n('U-T09', 'bid-won', 'You won ' + byKey.L8.id + ' 🎉',
      'Surat → Delhi at ' + CB.fmt.money(CB.q.bid(byKey.L8.awardedBidId) ? CB.q.bid(byKey.L8.awardedBidId).amount : 0),
      'transporter/trips.html', 'app', h(18), true);
    n('U-T11', 'trip', byKey.L10.id + ' · In transit',
      'Keep the logger running. Shipper is watching temperature.', 'transporter/trips.html', 'app', h(9), true);
    n('U-T07', 'verify', 'GST verification pending',
      'Upload your PAN to finish verification and start winning better rates.',
      'transporter/fleet.html', 'app', d(2));
    n('U-T14', 'warn', 'Reliability score is at risk',
      'Two cancellations and one no-show. Your bids now rank below verified operators.',
      'transporter/dashboard.html', 'app', d(3));
  }

  /* A stable, obviously-fake magic-link token so the SMS bid flow works
     without any auth. Good enough for a demo, never for production. */
  function tokenFor(loadId, transporterId) {
    var s = loadId + ':' + transporterId;
    var hash = 0;
    for (var i = 0; i < s.length; i++) hash = (hash * 33 + s.charCodeAt(i)) >>> 0;
    return hash.toString(36) + transporterId.replace(/[^0-9]/g, '');
  }
  seed.tokenFor = tokenFor;

  seed.resolveToken = function (loadId, token) {
    var hit = null;
    CB.db.transporters.forEach(function (t) {
      if (tokenFor(loadId, t.userId) === token) hit = t.userId;
    });
    return hit;
  };

  /* ------------------------------------------------------------------------
     LOGIN PICKER DATA
     ------------------------------------------------------------------------ */

  seed.accounts = function (role) {
    return CB.db.users.filter(function (u) { return u.role === role; }).map(function (u) {
      var prof = role === 'shipper' ? CB.q.shipper(u.id) : CB.q.transporter(u.id);
      var extra = {};
      if (role === 'shipper') {
        extra = {
          meta: prof.sector, blurb: prof.blurb,
          stat1: { label: 'Loads posted', value: prof.loadsPosted },
          stat2: { label: 'Open right now', value: CB.q.loadsOf(u.id).filter(function (l) { return l.status === 'open'; }).length },
          featured: prof.featured
        };
      } else {
        extra = {
          meta: prof.fleetSize + ' truck' + (prof.fleetSize === 1 ? '' : 's') + ' · ' + prof.homeBase,
          blurb: prof.blurb,
          stat1: { label: 'Reliability', value: prof.reliability },
          stat2: { label: 'Win rate', value: CB.score.winRate(prof) + '%' },
          verified: prof.verified, featured: prof.featured,
          stranded: prof.currentCity !== prof.homeBase ? prof.currentCity : null
        };
      }
      return {
        id: u.id, name: u.name, company: u.company, city: u.city,
        phone: u.phone, role: role, prof: prof, ex: extra
      };
    }).sort(function (a, b) {
      return (b.ex.featured ? 1 : 0) - (a.ex.featured ? 1 : 0);
    });
  };

})();
