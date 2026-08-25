/* ==========================================================================
   CargoBid - ui.js
   Interaction primitives shared by every app page: modals, side sheets,
   confirms, accordions, segmented tabs, sortable tables, star inputs,
   score dials and sparklines.

   Extends the CB.ui object that core.js already started - do not reassign it.

   Depends on: core.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  var ui = (CB.ui = CB.ui || {});
  var dom = CB.dom;
  var esc = CB.util.esc;

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
    'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /* ------------------------------------------------------------------------
     1. OVERLAYS - modal and sheet share one implementation
     ------------------------------------------------------------------------ */

  var openStack = [];

  function lockScroll(on) {
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  function overlay(kind, opts) {
    opts = opts || {};
    var prevFocus = document.activeElement;

    var wrap = document.createElement('div');
    wrap.className = 'overlay overlay-' + kind + (opts.size ? ' is-' + opts.size : '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    if (opts.title) wrap.setAttribute('aria-label', opts.title);

    var actions = (opts.actions || []).map(function (a, i) {
      return '<button type="button" class="btn ' + (a.className || 'btn-outline') + '" data-act="' + i + '"' +
        (a.disabled ? ' disabled' : '') + '>' +
        (a.icon ? '<i class="' + a.icon + '"></i>' : '') + esc(a.label) + '</button>';
    }).join('');

    wrap.innerHTML =
      '<div class="overlay-scrim" data-close></div>' +
      '<div class="overlay-panel">' +
        (opts.title || opts.dismissable !== false ?
          '<header class="overlay-head">' +
            '<div class="overlay-head-text">' +
              (opts.eyebrow ? '<p class="t-eyebrow">' + esc(opts.eyebrow) + '</p>' : '') +
              (opts.title ? '<h2 class="t-h3">' + esc(opts.title) + '</h2>' : '') +
              (opts.subtitle ? '<p class="t-small">' + esc(opts.subtitle) + '</p>' : '') +
            '</div>' +
            (opts.dismissable === false ? '' :
              '<button type="button" class="btn-icon overlay-x" data-close aria-label="Close">' +
              '<i class="ri-close-line"></i></button>') +
          '</header>' : '') +
        '<div class="overlay-body">' + (opts.body || '') + '</div>' +
        (actions ? '<footer class="overlay-foot">' + actions + '</footer>' : '') +
      '</div>';

    document.body.appendChild(wrap);
    lockScroll(true);
    requestAnimationFrame(function () { wrap.classList.add('is-open'); });

    var api = {
      el: wrap,
      panel: wrap.querySelector('.overlay-panel'),
      body: wrap.querySelector('.overlay-body'),
      close: function (result) {
        if (api._closed) return;
        api._closed = true;
        wrap.classList.remove('is-open');
        var i = openStack.indexOf(api);
        if (i > -1) openStack.splice(i, 1);
        if (!openStack.length) lockScroll(false);
        setTimeout(function () {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
        }, 260);
        if (opts.onClose) opts.onClose(result);
      },
      setBusy: function (on) {
        wrap.classList.toggle('is-busy', !!on);
        dom.$$('button', wrap).forEach(function (b) { b.disabled = !!on; });
      }
    };

    openStack.push(api);

    wrap.addEventListener('click', function (e) {
      var closer = e.target.closest('[data-close]');
      if (closer && opts.dismissable !== false) { api.close(); return; }
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = opts.actions[Number(act.getAttribute('data-act'))];
        if (a && a.onClick) a.onClick(api, e);
        else api.close();
      }
    });

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { e.preventDefault(); api.close(); }
      if (e.key !== 'Tab') return;
      var items = dom.$$(FOCUSABLE, wrap).filter(function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    if (opts.onMount) opts.onMount(api);

    var auto = wrap.querySelector('[data-autofocus]') ||
      dom.$$(FOCUSABLE, wrap.querySelector('.overlay-body') || wrap)[0] ||
      wrap.querySelector('.overlay-x');
    if (auto) setTimeout(function () { try { auto.focus(); } catch (e) {} }, 60);

    return api;
  }

  ui.modal = function (opts) { return overlay('modal', opts); };
  ui.sheet = function (opts) { return overlay('sheet', opts); };

  ui.confirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      overlay('modal', {
        size: 'sm',
        eyebrow: opts.eyebrow,
        title: opts.title || 'Are you sure?',
        subtitle: opts.subtitle,
        body: opts.body ? '<div class="stack">' + opts.body + '</div>' : '',
        actions: [
          { label: opts.cancelLabel || 'Cancel', className: 'btn-outline',
            onClick: function (mo) { done(false); mo.close(); } },
          { label: opts.confirmLabel || 'Confirm',
            className: opts.tone === 'danger' ? 'btn btn-danger' : 'btn',
            icon: opts.icon,
            onClick: function (mo) { done(true); mo.close(); } }
        ],
        onClose: function () { done(false); }
      });
    });
  };

  /* ------------------------------------------------------------------------
     2. ACCORDION
     ------------------------------------------------------------------------ */

  ui.accordion = function (root) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el || el._accordionBound) return;
    el._accordionBound = true;
    var single = el.getAttribute('data-accordion') === 'single';

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.acc-head');
      if (!btn || !el.contains(btn)) return;
      var item = btn.closest('.acc-item');
      var open = btn.getAttribute('aria-expanded') === 'true';

      if (single && !open) {
        dom.$$('.acc-head[aria-expanded="true"]', el).forEach(function (other) {
          other.setAttribute('aria-expanded', 'false');
          var p = dom.$('#' + other.getAttribute('aria-controls'));
          if (p) { p.style.height = '0px'; p.setAttribute('aria-hidden', 'true'); }
          other.closest('.acc-item').classList.remove('is-open');
        });
      }

      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      item.classList.toggle('is-open', !open);
      var panel = dom.$('#' + btn.getAttribute('aria-controls'));
      if (!panel) return;
      panel.setAttribute('aria-hidden', open ? 'true' : 'false');
      if (open) {
        panel.style.height = panel.scrollHeight + 'px';
        requestAnimationFrame(function () { panel.style.height = '0px'; });
      } else {
        panel.style.height = panel.scrollHeight + 'px';
        var clear = function () {
          panel.style.height = 'auto';
          panel.removeEventListener('transitionend', clear);
        };
        panel.addEventListener('transitionend', clear);
      }
    });
  };

  ui.accordionItem = function (id, question, answer, open) {
    return '<div class="acc-item' + (open ? ' is-open' : '') + '">' +
      '<button type="button" class="acc-head" aria-expanded="' + (open ? 'true' : 'false') +
        '" aria-controls="' + id + '">' +
        '<span>' + esc(question) + '</span>' +
        '<i class="ri-arrow-down-s-line" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="acc-panel" id="' + id + '" aria-hidden="' + (open ? 'false' : 'true') + '"' +
        (open ? '' : ' style="height:0px"') + '>' +
        '<div class="acc-panel-in"><p class="t-body">' + answer + '</p></div>' +
      '</div></div>';
  };

  /* ------------------------------------------------------------------------
     3. SEGMENTED TABS - drives .segment from base.css
     ------------------------------------------------------------------------ */

  ui.segment = function (root, onChange) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el) return;
    el.setAttribute('role', 'tablist');
    dom.$$('button', el).forEach(function (b) {
      b.setAttribute('role', 'tab');
      if (!b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', 'false');
    });
    if (el._segBound) { el._segOnChange = onChange; return; }
    el._segBound = true;
    el._segOnChange = onChange;

    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      ui.segmentSelect(el, b.getAttribute('data-value'));
    });

    el.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var items = dom.$$('button', el);
      var i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
      next.focus();
      ui.segmentSelect(el, next.getAttribute('data-value'));
    });
  };

  ui.segmentSelect = function (el, value) {
    dom.$$('button', el).forEach(function (x) {
      x.setAttribute('aria-selected', x.getAttribute('data-value') === value ? 'true' : 'false');
    });
    if (el._segOnChange) el._segOnChange(value);
  };

  ui.segmentValue = function (root) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    var sel = el && dom.$('button[aria-selected="true"]', el);
    return sel ? sel.getAttribute('data-value') : null;
  };

  /* ------------------------------------------------------------------------
     4. SORTABLE TABLE HEADERS
     ------------------------------------------------------------------------ */

  ui.sortable = function (root, onSort) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el || el._sortBound) return;
    el._sortBound = true;
    el.addEventListener('click', function (e) {
      var th = e.target.closest('[data-sort]');
      if (!th || !el.contains(th)) return;
      var key = th.getAttribute('data-sort');
      var cur = th.getAttribute('aria-sort');
      var dir = cur === 'ascending' ? 'desc' : 'asc';
      dom.$$('[data-sort]', el).forEach(function (x) { x.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
      onSort(key, dir);
    });
  };

  ui.sortHeader = function (key, label, active, dir, align) {
    return '<th data-sort="' + key + '" class="is-sortable' + (align ? ' ta-' + align : '') + '"' +
      (active ? ' aria-sort="' + (dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' +
      '<span>' + esc(label) + '<i class="ri-arrow-up-down-line sort-i" aria-hidden="true"></i></span></th>';
  };

  /* ------------------------------------------------------------------------
     5. STAR RATING INPUT
     ------------------------------------------------------------------------ */

  ui.starInput = function (name, value, label) {
    var out = '<div class="star-input" data-star="' + name + '">' +
      '<span class="star-input-label">' + esc(label || name) + '</span>' +
      '<span class="star-input-set" role="radiogroup" aria-label="' + esc(label || name) + '">';
    for (var i = 1; i <= 5; i++) {
      out += '<button type="button" role="radio" data-v="' + i + '" aria-checked="' +
        (i === value ? 'true' : 'false') + '" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '">' +
        '<i class="' + (i <= (value || 0) ? 'ri-star-fill' : 'ri-star-line') + '"></i></button>';
    }
    out += '</span><span class="star-input-value">' + (value ? value + '.0' : '—') + '</span>' +
      '<input type="hidden" name="' + name + '" value="' + (value || '') + '"></div>';
    return out;
  };

  ui.bindStars = function (root) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el || el._starBound) return;
    el._starBound = true;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.star-input [data-v]');
      if (!b || !el.contains(b)) return;
      var set = b.closest('.star-input');
      var v = Number(b.getAttribute('data-v'));
      dom.$$('[data-v]', set).forEach(function (x) {
        var xv = Number(x.getAttribute('data-v'));
        x.setAttribute('aria-checked', xv === v ? 'true' : 'false');
        dom.$('i', x).className = xv <= v ? 'ri-star-fill' : 'ri-star-line';
      });
      dom.$('input[type=hidden]', set).value = v;
      dom.$('.star-input-value', set).textContent = v + '.0';
      set.dispatchEvent(new CustomEvent('starchange', { bubbles: true, detail: { value: v } }));
    });
  };

  /* ------------------------------------------------------------------------
     6. SCORE DIAL + METER + SPARKLINE
     ------------------------------------------------------------------------ */

  /* A reliability donut. Pure SVG, no library, animates by dash offset. */
  ui.dial = function (value, opts) {
    opts = opts || {};
    var size = opts.size || 92;
    var stroke = opts.stroke || 8;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var pct = CB.util.clamp(value, 0, 100) / 100;
    var band = CB.score.band(value);
    var colour = { excellent: '#1F7A4C', good: '#3A63C4', fair: '#8A5A12', risk: '#A32B22' }[band.key];

    return '<div class="dial" style="--dial-size:' + size + 'px" role="img" ' +
      'aria-label="' + value + ' out of 100, ' + band.label + '">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" ' +
          'stroke="var(--line)" stroke-width="' + stroke + '"/>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" ' +
          'stroke="' + colour + '" stroke-width="' + stroke + '" stroke-linecap="round" ' +
          'stroke-dasharray="' + c.toFixed(1) + '" ' +
          'stroke-dashoffset="' + (c * (1 - pct)).toFixed(1) + '" ' +
          'transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '</svg>' +
      '<span class="dial-val t-num">' + value + '</span>' +
      (opts.caption ? '<span class="dial-cap">' + esc(opts.caption) + '</span>' : '') +
      '</div>';
  };

  ui.meter = function (pct, tone) {
    var v = CB.util.clamp(pct, 0, 100);
    return '<span class="meter' + (tone ? ' meter-' + tone : '') + '">' +
      '<span style="transform:scaleX(' + (v / 100).toFixed(3) + ')"></span></span>';
  };

  /* Bid history as a tiny descending line - shows the auction working. */
  ui.sparkline = function (values, opts) {
    opts = opts || {};
    var w = opts.width || 120, hh = opts.height || 30;
    if (!values || values.length < 2) return '<span class="spark spark-flat"></span>';
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var span = hi - lo || 1;
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * (w - 4) + 2;
      var y = hh - 3 - ((v - lo) / span) * (hh - 6);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var down = values[values.length - 1] <= values[0];
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke-width="1.8" ' +
        'stroke-linejoin="round" stroke-linecap="round" stroke="' +
        (down ? 'var(--ok)' : 'var(--stop)') + '"/>' +
      '<circle cx="' + pts[pts.length - 1].split(',')[0] + '" cy="' +
        pts[pts.length - 1].split(',')[1] + '" r="2.4" fill="' +
        (down ? 'var(--ok)' : 'var(--stop)') + '"/>' +
      '</svg>';
  };

  /* ------------------------------------------------------------------------
     7. FORMS
     ------------------------------------------------------------------------ */

  ui.serialize = function (form) {
    var el = typeof form === 'string' ? dom.$(form) : form;
    var out = {};
    if (!el) return out;
    dom.$$('input,select,textarea', el).forEach(function (f) {
      if (!f.name) return;
      if (f.type === 'checkbox') {
        if (f.hasAttribute('data-multi')) {
          out[f.name] = out[f.name] || [];
          if (f.checked) out[f.name].push(f.value);
        } else { out[f.name] = f.checked; }
      } else if (f.type === 'radio') {
        if (f.checked) out[f.name] = f.value;
      } else {
        out[f.name] = f.value;
      }
    });
    /* Toggle chips report through aria-pressed rather than a checkbox. */
    dom.$$('[data-flag][aria-pressed]', el).forEach(function (b) {
      out.flags = out.flags || {};
      out.flags[b.getAttribute('data-flag')] = b.getAttribute('aria-pressed') === 'true';
    });
    return out;
  };

  ui.setError = function (target, msg) {
    var f = typeof target === 'string' ? dom.$(target) : target;
    if (!f) return;
    var field = f.closest ? (f.closest('.field') || f) : f;
    field.setAttribute('data-invalid', msg ? 'true' : 'false');
    var slot = dom.$('.field-error', field);
    if (msg) {
      if (!slot) {
        slot = document.createElement('p');
        slot.className = 'field-error';
        field.appendChild(slot);
      }
      slot.innerHTML = '<i class="ri-error-warning-line"></i>' + esc(msg);
    } else if (slot) {
      slot.parentNode.removeChild(slot);
    }
  };

  ui.clearErrors = function (root) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el) return;
    dom.$$('[data-invalid="true"]', el).forEach(function (f) {
      f.setAttribute('data-invalid', 'false');
      var s = dom.$('.field-error', f);
      if (s) s.parentNode.removeChild(s);
    });
  };

  /* Toggle chips - the material flags, truck filters and sort keys. */
  ui.bindToggles = function (root) {
    var el = typeof root === 'string' ? dom.$(root) : root;
    if (!el || el._togBound) return;
    el._togBound = true;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.chip-toggle');
      if (!b || !el.contains(b)) return;
      var on = b.getAttribute('aria-pressed') === 'true';
      if (b.hasAttribute('data-radio')) {
        var group = b.getAttribute('data-radio');
        dom.$$('[data-radio="' + group + '"]', el).forEach(function (x) {
          x.setAttribute('aria-pressed', 'false');
        });
        b.setAttribute('aria-pressed', 'true');
      } else {
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
      }
      b.dispatchEvent(new CustomEvent('toggle', { bubbles: true, detail: { on: !on } }));
    });
  };

  /* City <datalist>, so origin/destination inputs autocomplete. */
  ui.cityList = function (id) {
    return '<datalist id="' + id + '">' + CB.cities.map(function (c) {
      return '<option value="' + c.name + '">' + c.name + ', ' + c.state + '</option>';
    }).join('') + '</datalist>';
  };

  ui.citySelect = function (name, value, opts) {
    opts = opts || {};
    return '<select class="select" name="' + name + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
      (opts.placeholder ? '<option value="">' + esc(opts.placeholder) + '</option>' : '') +
      CB.cities.slice().sort(CB.util.by('name')).map(function (c) {
        return '<option value="' + c.name + '"' + (c.name === value ? ' selected' : '') + '>' +
          c.name + ', ' + c.state + '</option>';
      }).join('') + '</select>';
  };

  ui.truckSelect = function (name, value) {
    return '<select class="select" name="' + name + '">' +
      CB.TRUCK_TYPES.map(function (t) {
        return '<option value="' + t.key + '"' + (t.key === value ? ' selected' : '') + '>' +
          t.label + '</option>';
      }).join('') + '</select>';
  };

  /* ------------------------------------------------------------------------
     8. CLIPBOARD
     ------------------------------------------------------------------------ */

  ui.copy = function (text, okMessage) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else { fallback(); }
    CB.toast(okMessage || 'Copied to clipboard', 'ok');
  };

  /* ------------------------------------------------------------------------
     9. SMALL RENDER HELPERS USED ACROSS BOTH SIDES
     ------------------------------------------------------------------------ */

  ui.statTile = function (opts) {
    return '<article class="stat" data-reveal>' +
      '<div class="stat-top">' +
        '<span class="stat-icon"><i class="' + opts.icon + '"></i></span>' +
        (opts.delta != null
          ? '<span class="stat-delta ' + (opts.delta >= 0 ? 'is-up' : 'is-down') + '">' +
            '<i class="' + (opts.delta >= 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line') + '"></i>' +
            Math.abs(opts.delta) + '%</span>'
          : '') +
      '</div>' +
      '<p class="stat-value t-num">' + opts.value + '</p>' +
      '<p class="stat-label">' + esc(opts.label) + '</p>' +
      (opts.foot ? '<p class="stat-foot">' + opts.foot + '</p>' : '') +
      '</article>';
  };

  ui.kv = function (rows) {
    return '<dl class="kv">' + rows.map(function (r) {
      if (!r) return '';
      return '<div class="kv-row"><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>';
  };

  ui.timeline = function (checkpoints) {
    return '<ol class="timeline">' + checkpoints.map(function (cp, i) {
      var next = !cp.done && (i === 0 || checkpoints[i - 1].done);
      return '<li class="tl-item' + (cp.done ? ' is-done' : '') + (next ? ' is-next' : '') + '">' +
        '<span class="tl-dot" aria-hidden="true">' +
          (cp.done ? '<i class="ri-check-line"></i>' : '') + '</span>' +
        '<div class="tl-body">' +
          '<p class="tl-label">' + esc(cp.label) +
            (cp.city ? ' <span class="tl-city">· ' + esc(cp.city) + '</span>' : '') + '</p>' +
          '<p class="tl-note">' + esc(cp.note) + '</p>' +
          '<p class="tl-time">' + (cp.at ? CB.fmt.datetime(cp.at) : (next ? 'Next up' : 'Pending')) + '</p>' +
        '</div></li>';
    }).join('') + '</ol>';
  };

  /* The channel a notification went out on. Makes the SMS/WhatsApp
     onboarding story visible rather than theoretical. */
  ui.channelChip = function (channel) {
    if (channel === 'sms') return '<span class="chip chip-xs chip-warn"><i class="ri-message-2-line"></i>SMS</span>';
    if (channel === 'whatsapp') return '<span class="chip chip-xs chip-ok"><i class="ri-whatsapp-line"></i>WhatsApp</span>';
    return '';
  };

  ui.docChip = function (state) {
    var map = {
      verified: ['chip-ok', 'ri-checkbox-circle-line', 'Verified'],
      pending: ['chip-warn', 'ri-time-line', 'Under review'],
      rejected: ['chip-stop', 'ri-close-circle-line', 'Rejected'],
      none: ['chip', 'ri-upload-2-line', 'Not uploaded']
    };
    var s = map[state] || map.none;
    return '<span class="chip chip-xs ' + s[0] + '"><i class="' + s[1] + '"></i>' + s[2] + '</span>';
  };

})();
