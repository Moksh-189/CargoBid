# CargoBid — Build Plan & Checklist

> **Read this first after any interruption.** Every phase is independently resumable.
> Tick boxes as you land them. Nothing here depends on a build step, a server, or the network.

---

## 0. What this is

A **B2B heavy-freight marketplace** with two fully-playable sides:

| Side | Who | Core job |
|---|---|---|
| **Shipper** | Manufacturers, traders, warehouses | Post a load → receive bids → compare → award → track → review |
| **Transporter** | Local fleet owners (1–50 trucks) | Get geofenced alerts → bid → win → run the trip → get rated |

**Explicitly out of scope for this MVP:** payments, escrow, invoicing, GPS hardware, e-way bills.
The product is **matching + bidding + trust**. Money changes hands off-platform.

**The problem being solved:** the information gap. Shippers don't know which local fleet owner
has an idle truck today. Fleet owners have no marketing budget to reach every shipper.

---

## 1. Locked technical decisions

| Decision | Choice | Why |
|---|---|---|
| Build step | **None.** Static `.html` + `.css` + `.js` | Inherited from `base.css`. Double-click `index.html` and it runs. |
| JS modules | **Classic scripts + one global `CB` namespace.** No `import`/`export`. | ES modules are blocked by CORS on `file://`. Classic scripts work everywhere. |
| Persistence | `localStorage` under key `cargobid.v1`, with in-memory fallback | Survives reload; no server. |
| Cross-tab realtime | `BroadcastChannel('cargobid')` + `storage` event fallback | Shipper in tab A, transporter in tab B, bids land live. **This is the demo money shot.** |
| Styling | `base.css` (tokens/primitives) → `marketing.css` **or** `app.css` | Never fork tokens. Add to the right layer. |
| Icons | RemixIcon 4.5 via CDN, `<i class="ri-*-line">` | `base.css` already sizes `.btn i`, `.chip i`, `.notice i`. |
| Type | Geist / Geist Mono via Google Fonts, system fallbacks in `--font-sans` | Already declared. |
| Illustrations | Hand-authored **flat 2:1 isometric SVG** in `assets/img/` | Matches reference. See §2 style contract. |
| Currency / locale | **₹ INR, `en-IN` grouping** (`₹1,24,500`) | India-first: GST, PAN, RC, tonnes, km. |
| Money in state | **integer paise-free rupees** (no floats) | Avoids `0.1+0.2` drift in bid comparisons. |
| IDs | `LD-1042`, `BID-8891`, `TRP-204`, human-readable | Demo legibility beats UUIDs. |
| Time in sim | A **virtual clock** (`CB.clock`) so 6-hour bid windows play out in 30 s | Real `Date.now()` only as the epoch anchor. |

### Guardrails
- **No pure black.** `--ink: #14161C`. No `#000`.
- **One accent.** `--accent` family only. Status colours (`--ok/--warn/--stop`) are for *real* state, never decoration.
- **Radius system is closed:** pill / card 24 / media 20 / field 12 / tight 8. No arbitrary `border-radius`.
- **Animate `transform` + `opacity` only.** Everything must collapse under `prefers-reduced-motion` (already handled in `base.css` §14).
- Every interactive control: `:focus-visible`, real `<button>`/`<a>`, `aria-*` state that `base.css` styles off (`aria-pressed`, `aria-selected`, `data-invalid`).

---

## 2. Isometric SVG style contract

Projection: **2:1 dimetric.** Unit vectors — right `(+0.866, +0.5)`, left `(−0.866, +0.5)`, up `(0, −1)`.
In practice: a top face is a rhombus of half-width `w`, half-height `w/1.7`.

- One wrapper `<g stroke="#14161C" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`; children carry only `fill`.
- **Flat fills only.** No gradient, no filter, no blur, no mask.
- Three-tone face ramp — top lightest, right mid, left darkest:

| Material | Top | Right | Left |
|---|---|---|---|
| White / body | `#FFFFFF` | `#EEF3FE` | `#DCE7FD` |
| Blue | `#B9CFF9` | `#8DB0F4` | `#6D97E8` |
| Yellow | `#F7D46B` | `#F5C544` | `#DFA92C` |
| Dark (tyres, road) | `#3D4354` | `#2A2F3D` | `#14161C` |

- Ground shadow: one `<ellipse fill="#8DB0F4" opacity="0.18" stroke="none">` **first** in the group.
- No `<text>`. No `width`/`height` attrs — `viewBox` only, so it scales.
- `role="img"` + `<title>`.

---

## 3. File map

```
e:\CargoBid\
├── PROJECT_PLAN.md              ← this file
├── README.md                    ← how to run + demo script
├── index.html                   ← marketing landing (mirrors the reference)
├── login.html                   ← role picker + one-click demo accounts
├── bid.html                     ← no-login magic-link bid page (from SMS)
├── shipper/
│   ├── dashboard.html
│   ├── post-load.html           ← 4-step wizard
│   ├── loads.html               ← all my loads, filterable
│   ├── load.html                ← ?id=LD-1042 · bid comparison + award
│   ├── trips.html               ← live tracking + POD + review
│   ├── transporters.html        ← directory, verified filter
│   └── messages.html
├── transporter/
│   ├── dashboard.html
│   ├── marketplace.html         ← load board, fit-scored
│   ├── load.html                ← ?id= · place / counter a bid
│   ├── bids.html                ← active · outbid · won · lost
│   ├── trips.html               ← checkpoint advance
│   ├── fleet.html               ← trucks + verification centre
│   ├── return-loads.html        ← backhaul optimiser
│   └── messages.html
└── assets/
    ├── css/  base.css ✅ · marketing.css · app.css
    ├── js/   core.js · seed.js · match.js · sim.js · ui.js · reveal.js
    │          marketing.js · console.js · page-shipper.js · page-transporter.js
    └── img/  *.svg (isometric set) · logo.svg
```

**Script load order on every app page** (order matters, they hang off `window.CB`):
`core.js → seed.js → match.js → sim.js → ui.js → console.js → page-*.js`

---

## 4. Domain model (`core.js` → `CB.schema` docs)

```
User        id role name company phone email city avatarSeed
Shipper     userId gstin loadsPosted rating(1-5) memberSince
Transporter userId homeBase currentCity radiusKm fleetSize truckTypes[]
            docs{gst,pan,rc:'none|pending|verified|rejected'} verified
            ratings{punctuality,cargoSafety,communication,count}
            reliability(0-100) bidsPlaced bidsWon cancellations noShows onTimeRate
Truck       id ownerId regNo type capacityTons bodyFt status currentCity
Load        id shipperId title origin{} destination{} distanceKm
            material{name,category,weightTons,flags{fragile,hazardous,stackable,perishable,oversized}}
            need{truckType,minCapacityTons,bodyFt,count}
            pickup{from,to,flexible,flexDays} deliverBy
            mode:'blind'|'open' targetPrice ceiling bidCloseAt
            status:'draft|open|closed|awarded|in-transit|delivered|cancelled'
            awardedBidId notified[] views
Bid         id loadId transporterId amount etaPickupHrs truckId truckType note
            validUntil status:'active|outbid|withdrawn|won|lost' counters[] isBot
Thread      id loadId bidId shipperId transporterId lastAt
Message     id threadId fromId body at read kind:'text|counter|system'
Trip        id loadId bidId transporterId truckId driver{} checkpoints[] status podUrl
Review      id tripId byId aboutId punctuality cargoSafety communication comment at
Notif       id userId kind title body href at read channel:'app|sms|whatsapp'
```

### Two formulas that must live in one place only

**Reliability score** (`CB.score.reliability`) — clamp 0–100:
```
70  + min(15, onTimeDeliveries × 0.5)
    + (verified ? 8 : 0)
    + clamp((avgRating − 4) × 10, −10, +10)
    − cancellations × 6
    − noShows × 12
```
Bands: `≥90 Excellent · 75–89 Good · 60–74 Fair · <60 At risk`

**Bot bid price** (`CB.sim.priceFor`) — ₹/km base by truck type
`open 32 · container 38 · reefer 58 · trailer 45 · tipper 34`, then
`× weight load · × flags(hazardous +18%, oversized +15%, perishable +12%, fragile +8%)`
`× urgency(pickup <24h +12%, flexible −6%) · × backhaul(−14%) · × quality(verified +4%) · ± 6% noise`
Each bot holds a **floor at 0.82× its first bid** and will not undercut past it.

---

## 5. Phases

### Phase 1 — Foundation
- [x] `assets/css/base.css` — tokens, reset, type, buttons, forms, motion *(pre-existing)*
- [ ] `assets/img/*.svg` — isometric set (truck-open, truck-container, trailer-long, drone-box, plane-cargo, train-cargo, warehouse, crates, forklift, worker, logo)
- [ ] `assets/css/marketing.css` — hero, service cards, testimonial, FAQ, newsletter, footer, logo marquee
- [ ] `assets/css/app.css` — sidebar shell, topbar, stat cards, data table, bid rows, timeline, chat, sheets, wizard
- [ ] `assets/js/core.js` — store, persistence, `BroadcastChannel` bus, virtual clock, `fmt.*`, `score.*`, toast, query helpers
- [ ] `assets/js/seed.js` — full demo dataset (§6)
- [ ] `assets/js/match.js` — haversine, geofence, truck-type fit, fit score, backhaul detection
- [ ] `assets/js/sim.js` — tick loop, bot bidding, counter-offers, trip advance, speed control
- [ ] `assets/js/ui.js` — modal, sheet, tabs, accordion, dropdown, sortable table, stepper, star input, countdown
- [ ] `assets/js/reveal.js` — IntersectionObserver for `[data-reveal]` + `.reveal-lines` *(referenced by `base.css` §10)*

### Phase 2 — Marketing landing
- [ ] `index.html` — nav · hero · client marquee · 4 service cards · "Safe reliable" split · testimonial · why-us · emergency/backhaul · FAQ accordion · newsletter · footer
- [ ] `assets/js/marketing.js` — sticky nav, FAQ, counters, marquee clone
- [ ] Section order and the white / `bleed-accent` alternation must match the reference band-for-band

### Phase 3 — Auth shim
- [ ] `login.html` — two-column role choice, demo account cards (avatar, company, city, verified, fleet), one click = signed in
- [ ] Session in `localStorage`; `CB.auth.require('shipper')` guards each page

### Phase 4 — Shipper side
- [ ] `dashboard.html` — 4 stat cards, live bid ticker, loads needing a decision, trips in motion
- [ ] `post-load.html` — wizard: Route → Cargo → Truck & schedule → Bidding; validation; on publish show *"Notified 14 transporters within 50 km"* + the real list + SMS preview
- [ ] `loads.html` — status tabs, search, sort
- [ ] `load.html` — countdown, sortable bid table (price · rating · reliability · ETA · fleet · verified), **Best value** badge, compare drawer (≤3), counter-offer, per-bid chat, award confirm
- [ ] `trips.html` — checkpoint timeline, driver card, POD, 3-vector review modal
- [ ] `transporters.html` — directory, verified/rating/fleet filters, profile sheet
- [ ] `messages.html` — thread list + pane

### Phase 5 — Transporter side
- [ ] `dashboard.html` — win rate, active bids, idle trucks, matched-for-you feed, verification nudge
- [ ] `marketplace.html` — filters (radius · destination · truck type · weight · flags · date · mode), sort (newest · closing soon · best fit), fit score + *"matches your idle RJ14-GH-2201"*
- [ ] `load.html` — blind: sealed, `n` bids placed · open: live lowest + **Undercut by ₹300**; truck picker, ETA, note, validity
- [ ] `bids.html` — active / outbid / won / lost, quick re-bid
- [ ] `return-loads.html` — set current city + available-from → backhaul matches with dead-head savings maths
- [ ] `fleet.html` — truck table, add truck, verification centre (GST/PAN/RC → pending → verified)
- [ ] `trips.html` — advance: awarded → at pickup → loaded → in transit → delivered
- [ ] `messages.html`

### Phase 6 — Demo tooling & polish
- [ ] `assets/js/console.js` — floating **⚡ Demo** panel: seed/reset · switch user · sim speed (paused/1×/5×/20×) · inject bids · award lowest · advance trips · event log
- [ ] `bid.html` — magic-link bid page reached from the SMS preview, no login
- [ ] `README.md` — run instructions + a scripted 5-minute demo walkthrough
- [ ] Responsive pass @ 1440 / 1024 / 768 / 390
- [ ] Keyboard + `prefers-reduced-motion` + empty-state pass
- [ ] Verify: no `console.error`, no dead `href="#"`, every button wired

---

## 6. Demo dataset (`seed.js`)

- **6 shippers** — Sharma Steel Traders (Jaipur) · Meenakshi Textiles (Surat) · Aggarwal Agro (Indore) · CoolChain Foods (Pune) · Rajputana Ceramics (Udaipur) · Nova Pharma (Ahmedabad)
- **14 transporters** across Jaipur / Delhi / Gurugram / Surat / Pune / Indore / Ahmedabad / Kota — mixed verified state, fleet 2–46, reliability 41–97, two deliberately poor performers so the trust system visibly bites
- **38 trucks** — real-format reg numbers (`RJ14-GH-2201`), types open / container / reefer / trailer / tipper, statuses idle / on-trip / maintenance
- **12 loads** spanning every status: 4 `open` (2 blind, 2 open-auction, one closing in 40 min), 2 `closed`, 2 `awarded`, 2 `in-transit`, 2 `delivered`
- **31 bids** with realistic spread, some outbid chains, two counter-offer threads
- **~36 cities** with lat/lng; road distance = haversine × 1.22
- **Reviews** on delivered trips so ratings and reliability are non-empty on first load
- **Notifications** pre-populated per user, mixed `app` / `sms` / `whatsapp`

### The 5-minute demo script (must work end to end)
1. `index.html` → **Get Started** → sign in as **Rakesh Sharma** (shipper).
2. **Post a load**: Jaipur → Delhi, 18 t TMT steel bars, open-body trailer, pickup tomorrow, **open reverse auction**, closes in 6 h.
3. Publish → *"Notified 11 transporters within 50 km of Jaipur"* + SMS preview.
4. Open **⚡ Demo** → sim speed **5×**. Bids stream in with `.drop-in`; the lowest keeps getting undercut.
5. Sort by **Best value** — a ₹500-dearer *verified* transporter with 96 reliability outranks the cheapest.
6. **Counter-offer** the top bid: "₹8,000 works if you can do a morning pickup." Bot accepts.
7. **Award** → trip created → checkpoints advance under 20× → delivered.
8. Leave a **3-vector review** → watch the transporter's reliability score move.
9. Switch user → **Vikram Singh** (transporter). Same load now reads as *won*; the trip is in his list.
10. **Return loads**: set current city to **Delhi** → the Delhi → Jaipur backhaul surfaces at −14% with dead-head savings shown.

---

## 7. Definition of done

- [ ] Both sides playable start to finish with zero code edits and zero network calls
- [ ] Two tabs, two roles, live bid propagation
- [ ] Blind **and** open auction both demonstrably different for the transporter
- [ ] Trust system visibly changes ranking (verified + reliability beat raw price)
- [ ] Backhaul discount visible and explained
- [ ] SMS/WhatsApp magic-link bid works without login
- [ ] Reset returns to a clean seeded state
