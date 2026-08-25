# CargoBid

**A live B2B load board for Indian heavy freight.** Shippers post lorry-loads; verified
carriers bid them down in a real-time reverse auction; the shipper awards on price **or** on
trust, tracks the trip to delivery, and rates the carrier — which feeds the reliability score
that shapes the next auction. Backhaul matching kills empty return runs.

It is a **self-contained front-end demo**: no build step, no server, no accounts, no network
calls for any app logic. Open `index.html` and everything runs in the browser, with all data
kept in `localStorage`.

---

## Run it

1. **Double-click `index.html`.** It opens in your default browser straight from `file://`.
2. That's the whole setup. There is no `npm install`, no bundler, no backend.

**Recommended:** any current Chrome, Edge, Firefox or Safari.

**About the network:** the app's logic and data are 100% local — nothing is sent anywhere, and
it works fully offline. The only external references are two CDN links for the webfont (Geist)
and the icon set (Remixicon). With no internet the UI simply falls back to system fonts and the
odd icon goes missing; every feature still works.

**Where the data lives:** one `localStorage` key, `cargobid.v1`. To wipe it and return to the
clean seeded world, open the **⚡ Demo** console (bottom-left on every page) →
**Reset & reseed demo data**. Clearing your browser's site data for the file does the same.

---

## The 5-minute demo script

Everything below is pre-seeded and works end to end with zero code edits.

1. **Land & sign in.** Open `index.html` → **Get Started** → on the sign-in page the shipper
   card marked **“Start here”** is **Rakesh Sharma · Sharma Steel Traders (Jaipur)**. Click it.
2. **Post a load.** New load → **Jaipur → Delhi**, 18 t **TMT steel bars**, **open body** trailer,
   pickup tomorrow, **open reverse auction**, close in ~6 h. Publish.
3. **Watch the reach.** Publishing reports *“Notified N transporters within 50 km of Jaipur”*
   and shows the **SMS preview** carriers receive.
4. **Let the auction run.** Open the **⚡ Demo** console → set sim speed to **5×** →
   **Inject bids**. Bids stream in and the leading price keeps getting undercut.
5. **Trust beats price.** On the load page, sort bids by **Best value** — a slightly dearer
   **verified** carrier with high reliability outranks the rock-bottom bid from the flaky one.
6. **Counter-offer.** Counter the top bid (e.g. *“₹8,000 works if you can do a morning pickup.”*).
   The simulated carrier responds.
7. **Award → track → deliver.** Award the load → a **trip** is created. Bump sim speed to **20×**
   (or use **Advance trips**) and watch checkpoints move Picked-up → In-transit → **Delivered**.
8. **Review.** Leave the **3-vector review** (timeliness, handling, communication) and watch the
   carrier's reliability score move.
9. **Flip sides.** In the **⚡ Demo** console → **Sign in as** → **Vikram Singh · Singh Roadways**
   (the carrier marked “Start here”). The marketplace, live bids and trips now read from the
   carrier's point of view.
10. **Backhaul.** Switch to **Mohan Lal Gurjar · Gurjar Transport** (tagged **“Backhaul demo”** —
    his fleet is stranded in **Delhi**). Open **Return loads**: a Delhi → Jaipur run surfaces at a
    discount, with the dead-head kilometres and empty-run savings spelled out.

### The money shot — no-login magic link + two tabs

This is the part worth showing live:

1. Sign in as a **transporter** and open the **notification bell**. The SMS-first operator
   **Pramod Jat · Marudhara Carriers** has a text: *“CargoBid: Jaipur → Delhi, 18 t steel …
   tap the link to bid.”*
2. That link opens **`bid.html`** — a branded, **login-free** bid page. The link itself
   identifies the carrier (a signed token in the URL), so Pramod can read the load and place a
   bid without ever creating an account. This is the low-friction on-ramp for the millions of
   operators who live on SMS/WhatsApp, not apps.
3. Now the **two-tab trick:** put the **shipper's load page** in one tab and the **`bid.html`**
   page in another. Place the bid in tab two — it appears **instantly** on the shipper's screen
   in tab one. (Cross-tab sync is real, via `BroadcastChannel`.) The hero load for this is
   **LD-1041** (Jaipur → Delhi, 18 t TMT steel, closing soon).

---

## The ⚡ Demo console

The floating **⚡ Demo** button (bottom-left, every page) is the director's chair:

- **Virtual clock** — pause or run time at **1× / 5× / 20× / 60×**. The whole app runs on this
  clock, so a 6-hour auction can close in seconds.
- **Auction** — pick an open load, then **Inject bids**, **Close bids**, **Award low** or
  **Award best value**.
- **Operations** — **Advance trips**, post a **New load**, **Verify docs**, or **Strand a carrier**
  (to set up the backhaul story).
- **Sign in as** — jump between any shipper or transporter instantly.
- **Event log** — a running feed of what the simulation is doing.
- **Reset & reseed** — back to the clean, deterministic seed.

---

## What's in the box (seed data)

- **7 shippers**, **15 transporters** (mixed verified state, fleets 2–46, reliability 41–97 —
  including two deliberately poor performers so the trust system visibly bites).
- **Trucks** with real-format registrations (`RJ14-GH-2201`) across open / container / reefer /
  trailer / tipper, in idle / on-trip / maintenance states.
- **12 loads** spanning every status (open · closed · awarded · in-transit · delivered), in both
  **open** and **blind (sealed)** auction modes.
- **Bids** with realistic undercut chains and counter-offer threads, **reviews** on delivered
  trips (so ratings aren't empty on first load), and **notifications** per user across
  **app / SMS / WhatsApp** channels.

### Handy personas & IDs

| Who | Account | Role | For |
|---|---|---|---|
| Rakesh Sharma | Sharma Steel Traders, Jaipur | Shipper | Main walkthrough (**Start here**) |
| Vikram Singh | Singh Roadways | Transporter | Carrier view, high reliability (**Start here**) |
| Mohan Lal Gurjar | Gurjar Transport | Transporter | **Backhaul demo** (stranded in Delhi) |
| Pramod Jat | Marudhara Carriers | Transporter | **SMS magic-link** bid (`bid.html`) |
| Lakhan Bishnoi | Bishnoi Speed Carriers | Transporter | The cheap-but-flaky bidder |
| — | **LD-1041** | Load | Hero: Jaipur → Delhi, 18 t TMT steel |

---

## How it's built

- **No build step.** Plain HTML/CSS/JS. All behaviour hangs off one global, `CB`, assembled by
  classic `<script>` tags in a fixed order (`core → match → seed → sim → ui → console` + the
  page script). ES modules are avoided on purpose — they're blocked by CORS on `file://`.
- **Persistence:** `localStorage` (key `cargobid.v1`) with an in-memory fallback.
- **Realtime:** `BroadcastChannel('cargobid')` with a `storage`-event fallback, so two tabs stay
  in sync live.
- **Determinism:** a seeded PRNG and a virtual clock, so every run of the demo is reproducible.
- **Money** is integer rupees, formatted `₹` / `en-IN`. **IDs** are human-readable
  (`LD-1041`, `BID-8891`, `TRP-204`).

### Project layout

```
CargoBid/
├── index.html              Marketing landing page
├── login.html              Role picker + one-click demo accounts
├── bid.html                No-login magic-link bid page (from the SMS invite)
├── shipper/                Shipper app  (dashboard, marketplace, load, post, trips, …)
├── transporter/            Transporter app  (dashboard, marketplace, load, bids, fleet,
│                           trips, return-loads, …)
└── assets/
    ├── css/                base.css (design system) + app.css + marketing.css
    ├── js/                 core · match · seed · sim · ui · console · shell · reveal · marketing
    └── img/                Isometric SVG illustrations + logo
```

---

## Scope

**In scope:** matching, live reverse-auction & sealed bidding, trust/reliability scoring,
trip tracking, reviews, and backhaul matching — both sides fully playable.

**Out of scope (deliberately):** payments, escrow, invoicing, GPS hardware integration, and
e-way-bill filing. This is a product demo of the marketplace mechanics, not a billing system.
