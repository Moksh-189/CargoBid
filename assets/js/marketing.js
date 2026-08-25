/* ==========================================================================
   CargoBid - marketing.js
   Landing page behaviour only: sticky nav, mobile drawer, marquee, FAQ,
   testimonial rotation, subscribe form.

   Also boots the demo world so that by the time you reach login.html the
   seeded market already exists and the simulation clock is running.

   Depends on: core.js, ui.js, reveal.js
   ========================================================================== */

(function () {
  'use strict';

  var CB = window.CB;
  var dom = CB.dom;

  /* ------------------------------------------------------------------------
     FAQ CONTENT
     ------------------------------------------------------------------------ */

  var FAQ = [
    ['Who can see my bid amount?',
      'That depends on the format you choose when you post the load. In a ' +
      '<strong>blind auction</strong> transporters submit a sealed number and see only how ' +
      'many others have bid — never the amounts. In an <strong>open reverse auction</strong> the ' +
      'current lowest bid is visible to everyone, which pushes the price down faster ' +
      'but tends to attract operators competing purely on rate. You, the shipper, ' +
      'always see every number in both formats.'],

    ['How do you decide which transporters hear about my load?',
      'Every fleet owner sets a home base and a service radius — typically 45 to ' +
      '100 km. When you post, we compute the road distance from your pickup to each ' +
      'operator\'s base <em>or</em> their current position, keep the ones inside their own ' +
      'declared radius, drop anyone whose fleet has no compatible truck with enough ' +
      'capacity, and rank the rest by fit. Only that list gets alerted. Nobody in ' +
      'Chennai is woken up about a Jaipur load.'],

    ['What does the verified badge actually check?',
      'Three documents: the GST registration certificate, the PAN of the registered ' +
      'entity, and vehicle registration certificates for the trucks on the profile. ' +
      'All three have to clear before the badge appears. It is a check on identity ' +
      'and legitimacy — it is not a guarantee of service quality, which is what the ' +
      'reliability score and the three ratings are for.'],

    ['I run three trucks and I do not want another app. Can I still bid?',
      'Yes, and this is deliberate. Load alerts go out over SMS and WhatsApp with a ' +
      'single link. Tap it and you land on a one-screen bid form — no login, no ' +
      'password, no download. Roughly a third of the operators on the platform have ' +
      'never opened the dashboard and win work every week.'],

    ['Does CargoBid handle the payment?',
      'No, and not by accident. Money moves directly between you and the ' +
      'transporter on whatever terms you already use — advance, on delivery, ' +
      '30 days. We are the matching, bidding and reputation layer. Keeping payments ' +
      'out means there is no float, no settlement risk and nothing standing between ' +
      'a fleet owner and their cash.'],

    ['What is a return load and why is it cheaper?',
      'When a truck finishes a delivery away from home it has to get back. That ' +
      'return leg costs the owner roughly ₹26 a kilometre in diesel, driver and ' +
      'tolls whether the trailer is full or empty. A load pointing back toward their ' +
      'base converts a guaranteed loss into revenue, so they will quote well under ' +
      'the market rate for it. Shippers on that lane get the benefit.'],

    ['What happens if someone wins a load and then does not turn up?',
      'The cancellation is recorded against them and their reliability score drops ' +
      'immediately — six points for a cancellation after winning, twelve for a ' +
      'no-show. Because reliability feeds the ranking that shippers sort by, a ' +
      'pattern of this pushes an operator below verified competitors even when they ' +
      'are the cheapest number on the board. The load reopens for bidding right away.']
  ];

  /* ------------------------------------------------------------------------
     TESTIMONIALS
     ------------------------------------------------------------------------ */

  var QUOTES = [
    {
      text: 'I used to keep four transporters on speed dial and take whatever number ' +
        'they gave me. Last Tuesday I posted a Jaipur to Delhi steel load at eleven in ' +
        'the morning and had seven bids by quarter past. The one I took was eighteen ' +
        'hundred rupees under what I have been paying for two years — from a fleet owner ' +
        'twelve kilometres from my plant that I had never heard of.',
      name: 'Rakesh Sharma', role: 'Sharma Steel Traders · Jaipur', init: 'RS'
    },
    {
      text: 'Six trucks is too small to keep a booking clerk and too big to survive on ' +
        'one broker. The return-load screen is the thing that changed my month. I dropped ' +
        'a consignment in Delhi, set my location, and had a Delhi to Jaipur load booked ' +
        'before the driver finished his tea. That leg used to be pure loss.',
      name: 'Mohan Lal Gurjar', role: 'Gurjar Transport Co. · Jaipur', init: 'MG'
    },
    {
      text: 'What sold me was the ratings being split apart. I do not care that someone ' +
        'averages four stars. I care whether my tiles arrive unbroken. Being able to sort ' +
        'on cargo safety alone, and see a reliability number that actually moves when ' +
        'people cancel, is worth more to me than the price difference.',
      name: 'Bhavna Rathore', role: 'Rajputana Ceramics · Udaipur', init: 'BR'
    },
    {
      text: 'Forty-six trucks and I still lose money on empty kilometres. What I did not ' +
        'expect was that being verified would let me hold my rate. I am rarely the ' +
        'cheapest bid on a board and I win about a third of what I quote, because the ' +
        'shippers here can see the record behind the number.',
      name: 'Bharat Patel', role: 'Patel Transport Service · Surat', init: 'BP'
    }
  ];

  var qi = 0;

  function renderQuote(i) {
    var q = QUOTES[i];
    var tint = CB.util.avatarTint(q.name);
    var card = dom.$('#quoteCard');
    dom.$('#quoteText').textContent = q.text;
    dom.$('#quoteName').textContent = q.name;
    dom.$('#quoteRole').textContent = q.role;
    var av = dom.$('#quoteAvatar');
    av.textContent = q.init;
    av.style.color = tint[1];
    if (card) {
      card.classList.remove('drop-in');
      void card.offsetWidth;      /* restart the animation */
      card.classList.add('drop-in');
    }
  }

  function step(delta) {
    qi = (qi + delta + QUOTES.length) % QUOTES.length;
    renderQuote(qi);
  }

  /* ------------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------------ */

  dom.ready(function () {
    /* Seed and start the world early so the dashboards are alive on arrival. */
    try { CB.boot(); } catch (e) { console.warn('CargoBid boot failed', e); }

    /* --- sticky nav ------------------------------------------------- */
    var nav = dom.$('#nav');
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* --- mobile drawer --------------------------------------------- */
    var burger = dom.$('#burger'), drawer = dom.$('#drawer');
    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = drawer.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        dom.$('i', burger).className = open ? 'ri-close-line' : 'ri-menu-line';
      });
      drawer.addEventListener('click', function (e) {
        if (!e.target.closest('a')) return;
        drawer.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        dom.$('i', burger).className = 'ri-menu-line';
      });
    }

    /* --- marquee needs a second copy to loop seamlessly ------------- */
    var track = dom.$('#marqueeTrack');
    if (track) {
      var clone = track.cloneNode(true);
      clone.removeAttribute('id');
      clone.setAttribute('aria-hidden', 'true');
      track.parentNode.appendChild(clone);
    }

    /* --- FAQ -------------------------------------------------------- */
    var acc = dom.$('#faq-acc');
    if (acc) {
      acc.innerHTML = FAQ.map(function (row, i) {
        return CB.ui.accordionItem('faq-p-' + i, row[0], row[1], i === 0);
      }).join('');
      CB.ui.accordion(acc);
    }

    /* --- testimonials ---------------------------------------------- */
    if (dom.$('#quoteCard')) {
      renderQuote(0);
      dom.$('#quoteNext').addEventListener('click', function () { step(1); });
      dom.$('#quotePrev').addEventListener('click', function () { step(-1); });
    }

    /* --- subscribe -------------------------------------------------- */
    var form = dom.$('#subForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = dom.$('#subEmail');
        var note = dom.$('#subNote');
        var val = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
          note.textContent = 'That does not look like an email address.';
          note.style.color = 'var(--stop)';
          input.focus();
          return;
        }
        note.textContent = 'Done — the next digest goes out Monday morning.';
        note.style.color = 'var(--ok)';
        input.value = '';
        CB.toast('Subscribed. This is a demo, so nothing is actually sent.', 'ok');
      });
    }

    /* --- smooth in-page nav without hijacking the URL --------------- */
    dom.on(document, 'click', 'a[href^="#"]', function (e, a) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = dom.$(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });

})();
