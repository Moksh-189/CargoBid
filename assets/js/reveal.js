/* ==========================================================================
   CargoBid - reveal.js
   Scroll reveals for [data-reveal] and .reveal-lines. Adds .is-in, nothing
   else - all the motion itself lives in base.css section 10, so this file
   never touches a style property that matters.

   Headline lines are authored explicitly in the HTML as
     <span class="line"><span>Text</span></span>
   rather than split at runtime, because the line breaks in the reference are
   a design decision, not a measurement.
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB || (window.CB = {});

  function reduce() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showAll() {
    var all = document.querySelectorAll('[data-reveal], .reveal-lines');
    for (var i = 0; i < all.length; i++) all[i].classList.add('is-in');
  }

  CB.reveal = {
    init: function () {
      if (reduce() || !('IntersectionObserver' in window)) { showAll(); return; }

      /* Stagger siblings inside a [data-reveal-group] so a card row comes in
         as a wave rather than all at once. */
      var groups = document.querySelectorAll('[data-reveal-group]');
      for (var g = 0; g < groups.length; g++) {
        var step = Number(groups[g].getAttribute('data-reveal-group')) || 90;
        var kids = groups[g].querySelectorAll('[data-reveal]');
        for (var k = 0; k < kids.length; k++) {
          if (!kids[k].style.getPropertyValue('--reveal-delay')) {
            kids[k].style.setProperty('--reveal-delay', (k * step) + 'ms');
          }
        }
      }

      /* Per-line delays for headline reveals. */
      var heads = document.querySelectorAll('.reveal-lines');
      for (var i = 0; i < heads.length; i++) {
        var lines = heads[i].querySelectorAll('.line > span');
        for (var j = 0; j < lines.length; j++) {
          lines[j].style.setProperty('--line-delay', (j * 105) + 'ms');
        }
      }

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

      var targets = document.querySelectorAll('[data-reveal], .reveal-lines');
      for (var t = 0; t < targets.length; t++) io.observe(targets[t]);

      CB.reveal._io = io;
    },

    /* Call after injecting markup so late-rendered nodes still animate. */
    scan: function (root) {
      if (!CB.reveal._io) {
        var all = (root || document).querySelectorAll('[data-reveal], .reveal-lines');
        for (var i = 0; i < all.length; i++) all[i].classList.add('is-in');
        return;
      }
      var fresh = (root || document).querySelectorAll('[data-reveal]:not(.is-in), .reveal-lines:not(.is-in)');
      for (var f = 0; f < fresh.length; f++) CB.reveal._io.observe(fresh[f]);
    },

    /* Numbers that count up when they scroll into view. */
    counters: function () {
      var els = document.querySelectorAll('[data-count]');
      if (!els.length) return;
      if (reduce() || !('IntersectionObserver' in window)) {
        for (var i = 0; i < els.length; i++) {
          els[i].textContent = format(els[i], Number(els[i].getAttribute('data-count')));
        }
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          run(e.target);
          io.unobserve(e.target);
        });
      }, { threshold: 0.5 });
      for (var j = 0; j < els.length; j++) io.observe(els[j]);

      function format(el, n) {
        var pre = el.getAttribute('data-prefix') || '';
        var suf = el.getAttribute('data-suffix') || '';
        var grouped = el.getAttribute('data-group') !== 'off';
        var dec = Number(el.getAttribute('data-decimals')) || 0;
        var v = dec ? n.toFixed(dec) : String(Math.round(n));
        if (grouped && !dec) {
          try { v = new Intl.NumberFormat('en-IN').format(Math.round(n)); } catch (e) {}
        }
        return pre + v + suf;
      }

      function run(el) {
        var target = Number(el.getAttribute('data-count'));
        var dur = Number(el.getAttribute('data-duration')) || 1500;
        var t0 = null;
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = format(el, target * eased);
          if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      CB.reveal.init(); CB.reveal.counters();
    });
  } else {
    CB.reveal.init(); CB.reveal.counters();
  }

})();
