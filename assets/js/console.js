/* ==========================================================================
   CargoBid - console.js
   The floating "Demo console" (bottom-left zap button). Self-contained:
   it injects its own styles so it can ride on the marketing site AND both
   dashboards without any per-page CSS. Every control is a thin wrapper over
   the levers already exposed by CB.sim / CB.clock / CB.act.

   Depends on: core.js, match.js, seed.js, sim.js  (ui.js optional for toasts)
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  if (!CB || window.__cbConsole) return;
  window.__cbConsole = true;

  var SPEEDS = [
    { v: 0,  label: 'Pause' },
    { v: 1,  label: '1×' },
    { v: 5,  label: '5×' },
    { v: 20, label: '20×' },
    { v: 60, label: '60×' }
  ];
  var esc = CB.util ? CB.util.esc : function (s) { return String(s == null ? '' : s); };
  var logs = [];

  /* ---- styles ---------------------------------------------------------- */
  var css = [
    '.cbc-fab{position:fixed;left:1.25rem;bottom:1.25rem;z-index:95;display:inline-flex;align-items:center;gap:.5rem;',
      'height:3rem;padding:0 1.125rem;border-radius:999px;background:var(--ink,#14161C);color:#fff;font:550 .875rem/1 var(--font-sans,sans-serif);',
      'box-shadow:0 12px 28px -10px rgba(29,44,90,.5);cursor:pointer;transition:transform .18s cubic-bezier(.16,1,.3,1)}',
    '.cbc-fab:hover{transform:translateY(-2px)}',
    '.cbc-fab i{color:var(--accent-soft,#B9CFF9);font-size:1.125rem}',
    '.cbc-fab .cbc-live{width:7px;height:7px;border-radius:999px;background:#5AD08C;box-shadow:0 0 0 0 rgba(90,208,140,.6);animation:cbc-pulse 2s infinite}',
    '@keyframes cbc-pulse{70%{box-shadow:0 0 0 6px rgba(90,208,140,0)}100%{box-shadow:0 0 0 0 rgba(90,208,140,0)}}',
    '.cbc-panel{position:fixed;left:1.25rem;bottom:1.25rem;z-index:96;width:min(348px,calc(100vw - 2.5rem));max-height:82vh;',
      'display:none;flex-direction:column;background:var(--surface,#fff);border:1px solid var(--line,#E3E8F5);border-radius:20px;',
      'box-shadow:0 40px 90px -40px rgba(29,44,90,.5);overflow:hidden;font-family:var(--font-sans,sans-serif)}',
    '.cbc-panel.is-open{display:flex;animation:cbc-in .24s cubic-bezier(.16,1,.3,1)}',
    '@keyframes cbc-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}',
    '.cbc-head{display:flex;align-items:center;gap:.5rem;padding:.875rem 1rem;background:var(--ink,#14161C);color:#fff}',
    '.cbc-head strong{font-size:.9375rem;font-weight:600;flex:1;display:flex;align-items:center;gap:.4375rem}',
    '.cbc-head i.cbc-zap{color:var(--accent-soft,#B9CFF9)}',
    '.cbc-x{color:#fff;opacity:.7;font-size:1.25rem;line-height:1;padding:.25rem;cursor:pointer}.cbc-x:hover{opacity:1}',
    '.cbc-body{overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:1rem}',
    '.cbc-sec{display:flex;flex-direction:column;gap:.5rem}',
    '.cbc-lab{font:500 .625rem/1 var(--font-mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3,#8B93A7)}',
    '.cbc-clock{font:600 1.5rem/1 var(--font-mono,monospace);letter-spacing:-.02em;color:var(--ink,#14161C)}',
    '.cbc-clock small{display:block;font:400 .6875rem/1.4 var(--font-mono,monospace);color:var(--ink-3);letter-spacing:0;margin-top:.25rem}',
    '.cbc-seg{display:flex;gap:.25rem;background:var(--paper-2,#EDF1FC);padding:.25rem;border-radius:999px}',
    '.cbc-seg button{flex:1;min-height:2rem;border-radius:999px;font:550 .75rem/1 var(--font-sans,sans-serif);color:var(--ink-2,#5A6172);cursor:pointer}',
    '.cbc-seg button[aria-pressed="true"]{background:var(--surface,#fff);color:var(--ink,#14161C);box-shadow:0 1px 2px rgba(29,44,90,.12)}',
    '.cbc-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}',
    '.cbc-btn{display:inline-flex;align-items:center;justify-content:center;gap:.375rem;min-height:2.5rem;padding:0 .625rem;',
      'border:1px solid var(--line-2,#D3DBEE);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#14161C);',
      'font:550 .8125rem/1 var(--font-sans,sans-serif);cursor:pointer;text-align:center;transition:border-color .18s,background .18s}',
    '.cbc-btn:hover{border-color:var(--ink,#14161C)}.cbc-btn i{font-size:1rem;color:var(--accent-deep,#3A63C4)}',
    '.cbc-btn.cbc-dark{background:var(--ink,#14161C);color:#fff;border-color:var(--ink)}.cbc-btn.cbc-dark i{color:var(--accent-soft)}',
    '.cbc-btn.cbc-danger{color:var(--stop,#A32B22);border-color:var(--stop)}.cbc-btn.cbc-danger i{color:var(--stop)}',
    '.cbc-btn:disabled{opacity:.4;cursor:not-allowed}',
    '.cbc-sel{width:100%;min-height:2.5rem;padding:.375rem .625rem;border:1px solid var(--line-2,#D3DBEE);border-radius:12px;',
      'background:var(--surface,#fff);color:var(--ink,#14161C);font:.8125rem var(--font-sans,sans-serif)}',
    '.cbc-log{display:flex;flex-direction:column;gap:.375rem;max-height:140px;overflow-y:auto;background:var(--surface-sunk,#FAFBFF);',
      'border:1px solid var(--line,#E3E8F5);border-radius:12px;padding:.625rem}',
    '.cbc-log-row{display:flex;gap:.5rem;font:.75rem/1.4 var(--font-mono,monospace);color:var(--ink-2,#5A6172)}',
    '.cbc-log-row time{color:var(--ink-3,#8B93A7);flex:0 0 auto}',
    '.cbc-log-empty{font:.75rem var(--font-mono);color:var(--ink-3);text-align:center;padding:.5rem}',
    '@media print{.cbc-fab,.cbc-panel{display:none!important}}'
  ].join('');
  var style = document.createElement('style');
  style.id = 'cbc-style';
  style.textContent = css;

  /* ---- DOM ------------------------------------------------------------- */
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'cbc-fab';
  fab.setAttribute('aria-label', 'Open demo console');
  fab.innerHTML = '<span class="cbc-live"></span><i class="ri-flashlight-fill"></i>Demo';

  var panel = document.createElement('section');
  panel.className = 'cbc-panel';
  panel.setAttribute('aria-label', 'Demo console');
  panel.innerHTML =
    '<header class="cbc-head"><strong><i class="ri-flashlight-fill cbc-zap"></i>Demo console</strong>' +
      '<button type="button" class="cbc-x" data-x aria-label="Close">&times;</button></header>' +
    '<div class="cbc-body">' +
      '<div class="cbc-sec"><span class="cbc-lab">Virtual clock</span>' +
        '<div class="cbc-clock" id="cbc-clock">—<small id="cbc-speed-note"></small></div>' +
        '<div class="cbc-seg" id="cbc-speed"></div></div>' +
      '<div class="cbc-sec"><span class="cbc-lab">Auction · pick a load</span>' +
        '<select class="cbc-sel" id="cbc-load"></select>' +
        '<div class="cbc-grid">' +
          '<button type="button" class="cbc-btn" data-act="inject"><i class="ri-auction-line"></i>Inject bids</button>' +
          '<button type="button" class="cbc-btn" data-act="close"><i class="ri-lock-2-line"></i>Close bids</button>' +
          '<button type="button" class="cbc-btn cbc-dark" data-act="award-low"><i class="ri-price-tag-3-line"></i>Award low</button>' +
          '<button type="button" class="cbc-btn cbc-dark" data-act="award-best"><i class="ri-award-line"></i>Award best</button>' +
        '</div></div>' +
      '<div class="cbc-sec"><span class="cbc-lab">Operations</span>' +
        '<div class="cbc-grid">' +
          '<button type="button" class="cbc-btn" data-act="advance"><i class="ri-truck-line"></i>Advance trips</button>' +
          '<button type="button" class="cbc-btn" data-act="post"><i class="ri-add-box-line"></i>New load</button>' +
          '<button type="button" class="cbc-btn" data-act="verify"><i class="ri-verified-badge-line"></i>Verify docs</button>' +
          '<button type="button" class="cbc-btn" data-act="strand"><i class="ri-map-pin-line"></i>Strand carrier</button>' +
        '</div></div>' +
      '<div class="cbc-sec"><span class="cbc-lab">Sign in as</span>' +
        '<select class="cbc-sel" id="cbc-user"></select></div>' +
      '<div class="cbc-sec"><span class="cbc-lab">Event log</span>' +
        '<div class="cbc-log" id="cbc-log"></div></div>' +
      '<div class="cbc-sec">' +
        '<button type="button" class="cbc-btn cbc-danger" data-act="reset"><i class="ri-refresh-line"></i>Reset &amp; reseed demo data</button>' +
      '</div>' +
    '</div>';

  /* ---- helpers --------------------------------------------------------- */
  function $(sel) { return panel.querySelector(sel); }
  function toast(msg, kind) { if (CB.toast) CB.toast(msg, kind); }
  function currentLoadId() { var s = $('#cbc-load'); return s && s.value; }
  function result(r, okMsg, kind) {
    if (r && r.error) { toast(r.error, 'warn'); return false; }
    if (okMsg) toast(okMsg, kind || 'ok');
    return true;
  }

  function renderSpeed() {
    var cur = CB.clock ? CB.clock.speed() : 1;
    $('#cbc-speed').innerHTML = SPEEDS.map(function (s) {
      return '<button type="button" data-speed="' + s.v + '" aria-pressed="' + (s.v === cur) + '">' + s.label + '</button>';
    }).join('');
    var note = $('#cbc-speed-note');
    if (note) note.textContent = cur === 0 ? 'Paused' : (cur + '× real time — a 6h window clears in ~' + Math.max(1, Math.round(360 / cur)) + 's');
  }

  function renderClock() {
    var el = $('#cbc-clock');
    if (!el || !CB.clock || !CB.fmt) return;
    el.childNodes[0].nodeValue = CB.fmt.time(CB.clock.now());
    var d = $('#cbc-speed-note');
    // keep speed note; update date via title
    el.title = CB.fmt.dateFull ? CB.fmt.dateFull(CB.clock.now()) : '';
  }

  function renderLoads() {
    var sel = $('#cbc-load');
    if (!sel) return;
    var prev = sel.value;
    var loads = CB.q.openLoads();
    if (!loads.length) {
      sel.innerHTML = '<option value="">No open auctions</option>';
    } else {
      sel.innerHTML = loads.map(function (l) {
        return '<option value="' + l.id + '">' + l.id + ' · ' + esc(l.origin.city) + ' → ' + esc(l.destination.city) + '</option>';
      }).join('');
      if (prev && loads.some(function (l) { return l.id === prev; })) sel.value = prev;
    }
    var none = !loads.length;
    ['inject', 'close', 'award-low', 'award-best'].forEach(function (a) {
      var b = panel.querySelector('[data-act="' + a + '"]'); if (b) b.disabled = none;
    });
  }

  function renderUsers() {
    var sel = $('#cbc-user');
    if (!sel || !CB.seed) return;
    var me = CB.auth && CB.auth.user() ? CB.auth.user().id : '';
    function group(role, label) {
      var accs = [];
      try { accs = CB.seed.accounts(role) || []; } catch (e) { accs = []; }
      if (!accs.length) return '';
      return '<optgroup label="' + label + '">' + accs.map(function (a) {
        return '<option value="' + a.id + '" data-role="' + a.role + '"' + (a.id === me ? ' selected' : '') + '>' +
          esc(a.name) + ' · ' + esc(a.company || a.city || '') + '</option>';
      }).join('') + '</optgroup>';
    }
    sel.innerHTML = '<option value="">— not signed in —</option>' + group('shipper', 'Shippers') + group('transporter', 'Transporters');
    if (me) sel.value = me;
  }

  function renderLog() {
    var box = $('#cbc-log');
    if (!box) return;
    if (!logs.length) { box.innerHTML = '<div class="cbc-log-empty">Waiting for activity…</div>'; return; }
    box.innerHTML = logs.slice(-24).reverse().map(function (e) {
      return '<div class="cbc-log-row"><time>' + esc(e.t) + '</time><span>' + esc(e.text) + '</span></div>';
    }).join('');
  }

  function pushLog(text) {
    var t = '--:--';
    try { t = CB.fmt.time(CB.clock.now()); } catch (e) {}
    logs.push({ t: t, text: text });
    if (logs.length > 80) logs = logs.slice(-80);
    renderLog();
  }

  /* ---- actions --------------------------------------------------------- */
  var ACTIONS = {
    inject: function () { result(CB.sim.injectBids(currentLoadId(), 3), '3 carriers just bid', 'bid'); },
    close: function () { result(CB.act.closeBidding(currentLoadId()), 'Bidding closed', 'warn'); },
    'award-low': function () { result(CB.sim.awardLowest(currentLoadId()), 'Awarded to the lowest bid', 'ok'); },
    'award-best': function () { result(CB.sim.awardBestValue(currentLoadId()), 'Awarded on best value', 'star'); },
    advance: function () { var r = CB.sim.advanceAllTrips(); result(r, (r && r.moved != null ? r.moved : 'All') + ' trips advanced a step', 'truck'); },
    post: function () { result(CB.sim.postRandomLoad(), 'A new load hit the marketplace', 'info'); },
    verify: function () { result(CB.sim.verifyAllDocs(), 'All carrier documents verified', 'ok'); },
    strand: function () {
      var t = CB.q.transporter('U-T02') || (CB.db.transporters || [])[0];
      if (!t) return toast('No carriers to strand.', 'warn');
      var city = (t.currentCity === 'Delhi') ? 'Mumbai' : 'Delhi';
      result(CB.sim.strand(t.id, city), (t.company || t.name) + ' is now empty in ' + city, 'truck');
    },
    reset: function () {
      function go() { CB.reset(); logs = []; renderLog(); toast('Demo data reset to the seed', 'ok'); }
      if (CB.ui && CB.ui.confirm) {
        CB.ui.confirm({
          title: 'Reset the demo?', tone: 'danger', confirmLabel: 'Reset everything', icon: 'ri-refresh-line',
          subtitle: 'Wipes local changes and rebuilds the seeded shippers, carriers, loads and bids.'
        }).then(function (ok) { if (ok) go(); });
      } else if (window.confirm('Reset all demo data?')) { go(); }
    }
  };

  /* ---- wiring ---------------------------------------------------------- */
  function open(on) {
    panel.classList.toggle('is-open', on);
    fab.style.display = on ? 'none' : '';
    if (on) { renderSpeed(); renderClock(); renderLoads(); renderUsers(); renderLog(); }
  }

  fab.addEventListener('click', function () { open(true); });
  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-x]')) return open(false);
    var speedBtn = e.target.closest('[data-speed]');
    if (speedBtn) {
      var v = Number(speedBtn.getAttribute('data-speed'));
      CB.clock.setSpeed(v);
      CB.sim.enabled = v !== 0;
      renderSpeed();
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act && ACTIONS[act.getAttribute('data-act')]) ACTIONS[act.getAttribute('data-act')]();
  });
  panel.addEventListener('change', function (e) {
    if (e.target.id === 'cbc-user') {
      var val = e.target.value;
      if (!val) { CB.auth.signOut(); return; }
      var role = e.target.selectedOptions[0].getAttribute('data-role');
      CB.auth.signIn(val);
      var home = CB.auth.home ? CB.auth.home(role) : CB.rel(role + '/dashboard.html');
      window.location.href = home;
    }
  });

  /* ---- live subscriptions --------------------------------------------- */
  function boot() {
    try { CB.boot(); } catch (e) {}
    document.head.appendChild(style);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    CB.on('tick', function () { if (panel.classList.contains('is-open')) renderClock(); });
    CB.on('clock:speed', function () { if (panel.classList.contains('is-open')) renderSpeed(); });
    CB.on('change', function () { if (panel.classList.contains('is-open')) { renderLoads(); renderUsers(); } });
    CB.on('log', function (e) {
      var text = e && (e.text || e.message) ? (e.text || e.message) : (typeof e === 'string' ? e : '');
      if (text) pushLog(text);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

}());
