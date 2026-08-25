/* ==========================================================================
   CargoBid - shell.js
   Renders the signed-in chrome shared by every app page: the sidebar rail,
   the sticky topbar (title, current city, notifications, user menu) and an
   empty <main> that the page then fills. One place, so all 15 app pages stay
   identical and the nav counts stay live.

   Usage on a page:
     CB.shell.mount({
       role: 'shipper', nav: 'dashboard', title: 'Dashboard',
       subtitle: 'Your freight at a glance',
       live: true,                    // re-render on data change (default false)
       render: function (ctx) { ctx.main.innerHTML = '...'; }
     });

   ctx = { user, role, main, refresh(), setTitle(t), setSubtitle(s) }

   Depends on: core.js, match.js, ui.js  (console.js optional)
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  if (!CB) return;
  var dom = CB.dom, esc = CB.util.esc, q = CB.q, rel = CB.rel;

  /* ---- helpers --------------------------------------------------------- */

  function safe(fn, dflt) { try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function activeTrips(list) { return (list || []).filter(function (t) { return t.status !== 'delivered'; }); }
  function openLoadsOf(id) { return q.loadsOf(id).filter(function (l) { return l.status === 'open'; }); }
  function liveBidsOf(id) {
    return q.bidsOf(id).filter(function (b) {
      var l = q.load(b.loadId);
      return l && l.status === 'open' && b.status !== 'withdrawn' && b.status !== 'lost';
    });
  }

  /* ---- navigation model ------------------------------------------------ */

  var NAV = {
    shipper: [
      { section: 'Overview' },
      { key: 'dashboard',    icon: 'ri-dashboard-3-line', label: 'Dashboard',    href: 'shipper/dashboard.html' },
      { key: 'loads',        icon: 'ri-stack-line',       label: 'My loads',     href: 'shipper/loads.html',
        count: function (u) { return openLoadsOf(u.id).length; } },
      { key: 'trips',        icon: 'ri-truck-line',       label: 'Trips',        href: 'shipper/trips.html',
        count: function (u) { return activeTrips(q.tripsForShipper(u.id)).length; } },
      { section: 'Network' },
      { key: 'transporters', icon: 'ri-team-line',        label: 'Transporters', href: 'shipper/transporters.html' },
      { key: 'messages',     icon: 'ri-chat-3-line',      label: 'Messages',     href: 'shipper/messages.html',
        count: function (u) { return q.unreadCount(u.id); }, live: true }
    ],
    transporter: [
      { section: 'Overview' },
      { key: 'dashboard',   icon: 'ri-dashboard-3-line',  label: 'Dashboard',    href: 'transporter/dashboard.html' },
      { key: 'marketplace', icon: 'ri-store-2-line',      label: 'Marketplace',  href: 'transporter/marketplace.html',
        count: function (u) { return safe(function () { return CB.match.board(u.id).length; }, q.openLoads().length); }, live: true },
      { key: 'bids',        icon: 'ri-auction-line',      label: 'My bids',      href: 'transporter/bids.html',
        count: function (u) { return liveBidsOf(u.id).length; } },
      { key: 'returns',     icon: 'ri-arrow-go-back-line',label: 'Return loads', href: 'transporter/return-loads.html',
        count: function (u) { return safe(function () { return CB.match.returnLoadsFor(u.id).length; }, 0); } },
      { section: 'Operations' },
      { key: 'fleet',       icon: 'ri-caravan-line',      label: 'Fleet',        href: 'transporter/fleet.html' },
      { key: 'trips',       icon: 'ri-route-line',        label: 'Trips',        href: 'transporter/trips.html',
        count: function (u) { return activeTrips(q.tripsOf(u.id)).length; } },
      { key: 'messages',    icon: 'ri-chat-3-line',       label: 'Messages',     href: 'transporter/messages.html',
        count: function (u) { return q.unreadCount(u.id); }, live: true }
    ]
  };

  var CTA = {
    shipper:     { label: 'Post a load', icon: 'ri-add-line',   href: 'shipper/post-load.html' },
    transporter: { label: 'Find loads',  icon: 'ri-search-line', href: 'transporter/marketplace.html' }
  };

  /* ---- popover (notifications + user menu) ----------------------------- */

  function closePops(except) {
    dom.$$('.pop').forEach(function (p) { if (p !== except) p.remove(); });
    dom.$$('[data-pop][aria-expanded="true"]').forEach(function (b) {
      if (!except || b !== except._owner) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.pop') || e.target.closest('[data-pop]')) return;
    closePops();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(); });

  function popover(owner, html, cls) {
    var open = owner.getAttribute('aria-expanded') === 'true';
    closePops();
    if (open) return null;
    owner.setAttribute('aria-expanded', 'true');
    var pop = document.createElement('div');
    pop.className = 'pop ' + (cls || '');
    pop.innerHTML = html;
    pop._owner = owner;
    owner.parentNode.appendChild(pop);
    return pop;
  }

  /* ---- render pieces --------------------------------------------------- */

  function navHtml(items, activeKey, user) {
    return items.map(function (it) {
      if (it.section) return '<p class="side-label">' + esc(it.section) + '</p>';
      var n = it.count ? safe(function () { return it.count(user); }, 0) : 0;
      var badge = it.count
        ? '<span class="side-count' + (it.live && n ? ' is-live' : '') + '">' + (n || '') + '</span>'
        : '';
      return '<a class="side-link' + (it.key === activeKey ? ' is-active' : '') + '" href="' +
        rel(it.href) + '"><i class="' + it.icon + '" aria-hidden="true"></i>' +
        '<span>' + esc(it.label) + '</span>' + badge + '</a>';
    }).join('');
  }

  function notifListHtml(user) {
    var list = q.notifsOf(user.id).slice(0, 12);
    if (!list.length) return '<div class="pop-empty"><i class="ri-notification-off-line" style="font-size:1.75rem"></i><p class="t-small" style="margin-top:.5rem">You are all caught up.</p></div>';
    return list.map(function (n) {
      return '<a class="notif-item' + (n.read ? '' : ' is-unread') + '" href="' +
        (n.href ? rel(n.href) : '#') + '">' +
        '<span class="notif-ico"><i class="' + (n.icon || 'ri-notification-3-line') + '"></i></span>' +
        '<span class="notif-body"><strong>' + esc(n.title) + '</strong>' +
        (n.body ? '<p>' + esc(n.body) + '</p>' : '') +
        '<time>' + CB.fmt.relative(n.at) + '</time></span></a>';
    }).join('');
  }

  /* ---- mount ----------------------------------------------------------- */

  var shell = (CB.shell = CB.shell || {});

  shell.mount = function (cfg) {
    cfg = cfg || {};
    CB.boot();

    var role = cfg.role;
    var user = CB.auth.require(role);      // redirects out if not signed in as role
    if (!user) return null;

    var items = NAV[role] || [];
    var cta = CTA[role];

    document.body.classList.add('app-body');

    var wrap = document.createElement('div');
    wrap.className = 'app';
    wrap.innerHTML =
      '<aside class="app-sidebar" id="app-sidebar">' +
        '<div class="side-brand">' + CB.ui.logo(rel(role + '/dashboard.html'), role === 'shipper' ? 'Shipper' : 'Carrier') + '</div>' +
        '<nav class="side-nav" id="side-nav" aria-label="Primary"></nav>' +
        '<div class="side-foot">' +
          '<button type="button" class="side-user" data-pop="user">' +
            CB.ui.avatar(user.name, user.id) +
            '<span class="side-user-meta"><span class="side-user-name">' + esc(user.name) + '</span>' +
            '<span class="side-user-role">' + esc(user.company || '') + '</span></span>' +
            '<i class="ri-more-2-fill" aria-hidden="true"></i>' +
          '</button>' +
        '</div>' +
      '</aside>' +
      '<div class="app-shell">' +
        '<header class="topbar">' +
          '<button type="button" class="btn-icon topbar-burger" id="burger" aria-label="Open menu"><i class="ri-menu-line"></i></button>' +
          '<div class="topbar-title"><h1 id="tb-title">' + esc(cfg.title || '') + '</h1>' +
            (cfg.subtitle ? '<p id="tb-sub">' + esc(cfg.subtitle) + '</p>' : '<p id="tb-sub"></p>') + '</div>' +
          '<div class="topbar-actions">' +
            (cta ? '<a class="btn btn-sm" href="' + rel(cta.href) + '"><i class="' + cta.icon + '"></i><span class="cta-label">' + esc(cta.label) + '</span></a>' : '') +
            '<span id="tb-city"></span>' +
            '<div class="notif"><button type="button" class="btn-icon" data-pop="notif" aria-label="Notifications">' +
              '<i class="ri-notification-3-line"></i><span class="notif-dot" id="notif-dot"></span></button></div>' +
            '<div style="position:relative"><button type="button" class="user-chip" data-pop="user2">' +
              CB.ui.avatar(user.name, user.id, 'sm') +
              '<span class="user-chip-name">' + esc((user.name || '').split(' ')[0]) + '</span>' +
              '<i class="ri-arrow-down-s-line"></i></button></div>' +
          '</div>' +
        '</header>' +
        '<main class="app-main" id="app-main"></main>' +
      '</div>';

    var scrim = document.createElement('div');
    scrim.className = 'sidebar-scrim';

    document.body.appendChild(scrim);
    document.body.appendChild(wrap);

    var main = dom.$('#app-main', wrap);
    var sidebar = dom.$('#app-sidebar', wrap);

    /* ---- ctx handed to the page ---- */
    var ctx = {
      user: user, role: role, main: main,
      setTitle: function (t) { dom.$('#tb-title').textContent = t || ''; document.title = (t ? t + ' · ' : '') + 'CargoBid'; },
      setSubtitle: function (s) { var el = dom.$('#tb-sub'); if (el) el.textContent = s || ''; },
      refresh: function () { if (cfg.render) cfg.render(ctx); CB.ui.startCountdowns(); }
    };
    ctx.setTitle(cfg.title || '');

    /* ---- live chrome (nav counts, notif dot, city chip) ---- */
    function paintChrome() {
      dom.$('#side-nav').innerHTML = navHtml(items, cfg.nav, user);
      var unread = safe(function () { return q.unreadCount(user.id); }, 0);
      var dot = dom.$('#notif-dot'); if (dot) dot.textContent = unread ? (unread > 9 ? '9+' : unread) : '';
      dom.$('#tb-city').innerHTML = cityChipHtml();
    }

    function cityChipHtml() {
      if (role === 'transporter') {
        var tp = q.transporter(user.id) || user;
        var city = tp.currentCity || tp.homeBase || user.city || '—';
        var away = tp.currentCity && tp.currentCity !== tp.homeBase;
        return '<button type="button" class="city-chip" id="city-chip">' +
          '<i class="ri-map-pin-2-line"></i>' + esc(city) +
          '<span class="city-chip-sub">· ' + (tp.radiusKm || 50) + 'km' + (away ? ' · away' : '') + '</span>' +
          '<i class="ri-expand-up-down-line"></i></button>';
      }
      return '<span class="chip"><i class="ri-map-pin-2-line"></i>' + esc(user.city || '') + '</span>';
    }

    paintChrome();

    /* ---- interactions ---- */
    dom.on(document, 'click', '[data-pop="notif"]', function () {
      var owner = this;
      var pop = popover(owner, '<div class="pop-head"><h3>Notifications</h3>' +
        '<button type="button" class="btn-quiet btn-sm" data-mark>Mark all read</button></div>' +
        '<div class="pop-list">' + notifListHtml(user) + '</div>');
      if (pop) {
        dom.on(pop, 'click', '[data-mark]', function () { CB.markNotifsRead(user.id); paintChrome(); closePops(); });
      }
    });

    function userMenuHtml() {
      return '<div class="menu">' +
        '<div class="menu-head"><div class="row" style="gap:.625rem">' + CB.ui.avatar(user.name, user.id) +
          '<div><div style="font-weight:600">' + esc(user.name) + '</div>' +
          '<div class="t-small">' + esc(user.company || '') + '</div></div></div></div>' +
        '<a class="menu-item" href="' + rel(role + '/dashboard.html') + '"><i class="ri-dashboard-3-line"></i>Dashboard</a>' +
        '<a class="menu-item" href="' + rel(role + '/messages.html') + '"><i class="ri-chat-3-line"></i>Messages</a>' +
        '<a class="menu-item" href="' + rel('index.html') + '"><i class="ri-home-4-line"></i>Marketing site</a>' +
        '<hr class="divider" style="margin:.5rem 0">' +
        '<button type="button" class="menu-item is-danger" data-signout><i class="ri-logout-box-r-line"></i>Sign out</button>' +
        '</div>';
    }
    function bindUserMenu(pop) {
      if (!pop) return;
      dom.on(pop, 'click', '[data-signout]', function () {
        CB.auth.signOut();
        window.location.href = rel('login.html');
      });
    }
    dom.on(document, 'click', '[data-pop="user"]',  function () { bindUserMenu(popover(this, userMenuHtml())); });
    dom.on(document, 'click', '[data-pop="user2"]', function () { bindUserMenu(popover(this, userMenuHtml())); });

    /* City chip (transporter can relocate their fleet) */
    dom.on(document, 'click', '#city-chip', function () {
      var tp = q.transporter(user.id) || user;
      CB.ui.modal({
        title: 'Where is your fleet?',
        subtitle: 'Sets the origin CargoBid uses to match loads and score reach.',
        size: 'sm',
        body:
          '<div class="field"><label for="m-city">Current city</label>' +
            CB.ui.citySelect('city', tp.currentCity || tp.homeBase || user.city).replace('<select', '<select id="m-city"') + '</div>' +
          '<div class="field" style="margin-top:1rem"><label for="m-rad">Service radius: <span id="rad-val" class="t-num">' + (tp.radiusKm || 50) + '</span> km</label>' +
            '<input id="m-rad" class="input" type="range" min="25" max="400" step="25" value="' + (tp.radiusKm || 50) + '"></div>',
        actions: [
          { label: 'Cancel', className: 'btn-outline', onClick: function (m) { m.close(); } },
          { label: 'Update', onClick: function (m) {
              var city = dom.$('#m-city', m.el).value;
              var rad = Number(dom.$('#m-rad', m.el).value) || 50;
              CB.act.setCurrentCity(user.id, city);
              CB.act.setRadius(user.id, rad);
              CB.toast('Now matching from <strong>' + esc(city) + '</strong> · ' + rad + 'km', 'truck');
              m.close(); paintChrome(); ctx.refresh();
          } }
        ],
        onMount: function (m) {
          dom.on(m.el, 'input', '#m-rad', function () { dom.$('#rad-val', m.el).textContent = this.value; });
        }
      });
    });

    /* Mobile sidebar */
    function setMenu(open) { sidebar.classList.toggle('is-open', open); scrim.classList.toggle('is-open', open); }
    dom.on(wrap, 'click', '#burger', function () { setMenu(!sidebar.classList.contains('is-open')); });
    scrim.addEventListener('click', function () { setMenu(false); });
    dom.on(sidebar, 'click', '.side-link', function () { setMenu(false); });

    /* ---- data wiring ---- */
    CB.on('change', function () { paintChrome(); if (cfg.live) ctx.refresh(); });
    CB.on('auth', function () { /* handled by page reload on sign-out */ });

    /* Start the shared simulation so auctions actually move (leader tab only). */
    safe(function () { CB.sim.init(); });

    /* First paint of the page body. */
    if (cfg.render) cfg.render(ctx);
    CB.ui.startCountdowns();

    return ctx;
  };

}());
