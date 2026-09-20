# ARCHITECTURE.md — mrpr0phecy/mrpr0phecy

**Read this first.** It is the single onboarding document for this repository,
written so that a human or an AI agent handed a GitHub token can be productive
within about ten minutes and without breaking anything.

**For AI agents:** start with **[AGENTS.md](AGENTS.md)** — one page: what to
never touch, the four commands, and the task sequences. If you need GitHub
access in a fresh session, run `bash scripts/agent-auth.sh` (self-service
device flow, sparse-clone recipe inside) instead of asking the owner to paste a
token.

Last substantive update: 2026-09-07.

For anything money-related — what earns, what the real numbers are, and what
was deliberately not built — see **[INCOME.md](INCOME.md)**.

---

## 1. What this repository actually is

One GitHub Pages site serving **two unrelated products** from the same domain:

| | Product | Entry point | Audience |
|---|---|---|---|
| **A** | **The Most Useful Site In The World** — 1195 self-contained browser tools | `index.html` | People searching for a specific tool |
| **B** | **MrProphecy** — the music project of the repo owner | `listen.html` | Listeners, YouTube discovery |

**These two are deliberately kept separate.** This is a standing instruction
from the owner, not an accident of history. Do not add music players, artist
banners, or cross-promotional footers to the tool catalogue or to any card, and
do not add tool links to the music pages. If a task says "improve the site",
establish *which* site first.

- **Live:** <https://www.themostusefulsiteintheworld.com>
- **Hosting:** GitHub Pages, served straight from `main`. There is no build
  step, no bundler, no framework, and `.nojekyll` is what keeps that literally
  true: without it Pages runs the repository through Jekyll, which silently
  drops every path beginning with `.` or `_` — that is how `.well-known/ai.txt`
  and `.well-known/security.txt` came to be 404 in production while four pages
  linked to them (`notes/operations.md`, 2026-09-15). Every tracked file is
  served at its own path.
- **Custom domain:** the `CNAME` file. Deleting it breaks the domain.
- **Deploy latency:** roughly 30–60 seconds after a push. Always verify live
  with `curl` rather than assuming.

---

## 2. Repository map

```
/
├── index.html              Product A: tool catalogue (search/filter UI)
├── home-app.js             Homepage application (external, `defer`-loaded)
├── cards/
│   ├── cards-lite.json     Generated critical-path tier: name/title/category
│   ├── cards.json          Generated full index of all 1195 tools (descriptions feed search)
│   └── <tool-name>.html    1195 tool fragments (NOT full documents)
├── generate-cards-json.js  Rebuilds cards.json + cards-lite.json from the cards/ directory
├── ai.html                 Lantern — standalone AI product. Chat answered on
│                           the device from the visitor's own documents and
│                           memory (composed answers are labelled as such),
│                           real local tools, 18 reasoning methods with visible
│                           working, a guided tour and lessons, rating-driven
│                           adaptation, optional WebGPU model, and a duty of
│                           care that surfaces verified UK emergency help when
│                           the visitor's own words describe a dangerous
│                           situation (never from indexed documents; switch off
│                           with /duty off). Own name, mark and palette: no
│                           catalogue data or branding
├── agents.html             Machine-use guide for AI agents & developers
│                           (the former /ai.html; cards and llms.txt link here)
│
├── listen.html             Product B: music hub — the main entry point
├── radio.html              Continuous player — 47 tracks back to back (YPP watch time)
├── thisorthat.html         Head-to-head voting game — shareable, builds a top 5
├── youtubepromo.html       Videos & Visuals — all 47 animated videos
├── youtubepromo1.html      Stream Free — SoundCloud / free-listening angle
├── youtubepromo2.html      The Full Story — long-form guide
├── youtubepromo3.html      Sons of South — the crew / UK scene
├── luton.html              Luton & Bedfordshire — local SEO + FAQ schema
├── music.html              Press kit — bio, discography, booking
├── support.html            Direct support / PayPal — music side
├── donate.html             Wikipedia-style appeal — tools side
├── sponsor.html            Sponsorship / advertising enquiries
├── mpnews.html             Music news page
├── opensourcenews.html     Open Source News — live global broadcast from open RSS feeds (see §9)
│
├── <12 language pages>     hindi, marathi, bengali, punjabi, chinese, dutch,
│                           french, japanese, portuguese, russian, spanish, thai
│                           — translated MrProphecy landing pages
│
├── sonicfansite.html       Standalone Sonic fan site (unrelated to A and B)
├── beachsimulator.html, citysimulator.html, fightsimulator.html,
│   aiwalker.html, animation.html, birdapp.html, clock.html,
│   eternalbeffudlementmachine.html, local-ai.html, byte-realistic.html,
│   byte-realistic-v4.html, slideshowtest.html,
│   token.html, tool.html, indexbeta.html, hokidea.html, supaviewer.html
│                           Experiments and one-offs. Not linked from the
│                           catalogue. Safe to ignore; ask before deleting.
│                           `local-ai.html`, `byte-realistic.html` and
│                           `byte-realistic-v4.html` are noindex redirect
│                           stubs pointing at ai.html.
│                           `supaviewer.html` is SupaViewer, a standalone
│                           in-browser virtual-world viewer (docs in
│                           supaviewer/).
│   approved.json, README.md
│
├── manifest.json           PWA manifest
├── sw.js                   Service worker — present but NOT registered (§7)
├── robots.txt              Allows all, points at the sitemap
├── sitemap.xml             All indexable pages, generated (§6); noindex
│                           redirect stubs are excluded automatically
├── icon-192.png, icon-512.png, icon-maskable-512.png   (palette-optimised)
├── logo.png (unreferenced by any page — kept, see §9)
├── mrprophecypic.jpg (1024², for og:image) + mrprophecypic-600.jpg (rendered)
├── backgroundpic.jpg + backgroundpic.webp (the one the pages use)
├── og-ai.jpg, og-tools.png, og-mp.png, luton-og.png, sonic-og.png (social cards)
├── images/                 ~50 MB of photos. Excluded from sparse checkouts.
├── README.md               Short public-facing readme
├── guide.txt               69 KB of older notes; historical, not authoritative
├── CV.docx / CV.pdf / cv.pdf / latestcv.docx    Owner's CV files
└── substitutions/, system/, digitaldetoxcardshtml/    Legacy, unused
```

---

## 3. Product A — the tool catalogue

### How it works

`index.html` fetches the catalogue at runtime and renders a searchable grid.
**The grid itself is never hardcoded.** A tool is discoverable if and only if
it appears in the catalogue. Each tool opens inside the catalogue shell, which
supplies the CSS custom properties. That is why cards are fragments rather
than whole pages.

The catalogue is two tiers, both generated by `node generate-cards-json.js`:

- **`cards/cards-lite.json`** (~113 KB compact, `{n,t,c}` per card) — the
  critical path. The grid builds off this; it has everything the placeholder
  shells need (name, title, category) and nothing else.
- **`cards/cards.json`** (~536 KB raw / ~141 KB gzipped, full fields) — the
  background tier. Fetched at **low priority** in the background; its
  descriptions are merged into `cardsMetaMap` by
  `enrichCatalogueDescriptions()` so search upgrades from title-only to
  full-text in place. If the lite tier is unavailable the loader falls back to
  the full tier as the data source, and the GitHub API remains the last resort.

### First-screen fast path (generated — do not hand-edit)

`cards.json` used to gate everything: the browser downloaded it, parsed it,
built all 1128 placeholders, and only then asked for the first tool. On a
modelled fast-4G link the first real card landed ~870 ms in, behind bytes it
did not depend on. Two generated blocks in `index.html` break that
serialisation, and the application script itself is external. All three are
verified by `bash scripts/verify.sh`:

- **`home-app.js`** (root) is the homepage application, loaded with `defer` in
  `<head>`. It downloads and parses in parallel with the HTML (an inline copy
  had to wait for the whole document to arrive first) and is cached
  separately. `scripts/tests/` extract its real functions for the loader,
  fast-path and deep-link suites.
- **`HOME-FAST-PATH`** (in `<head>`, written by
  `scripts/build-home-prerender.py`) starts both catalogue-tier fetches (lite
  high, full low) and the first six card-fragment fetches while the head is
  still parsing. The responses are parked as promises on
  `window.__mpFastPath` (`json`, `full`, `cards`) and consumed exactly once by
  `takePrefetchedCatalogue()` / `takePrefetchedFullCatalogue()` /
  `takePrefetchedCard()`, so nothing is downloaded twice and a failed or slow
  prefetch silently falls back to the loader's own fetch. (This replaced a
  `<link rel="preload" as="fetch">`: reusing a preload depends on its
  credentials mode matching the later `fetch()`, and a miss downloads the file
  twice.)
- **`HOME-PRERENDER`** (in `#dashboard`) ships the first twelve cards as real
  markup — title, category badge, standalone link — so the first screen paints
  with the HTML (no JSON at all) and a crawler sees real tool links. Twelve is
  the whole batch in focus density and half of it in mosaic (24); a mosaic tile
  the extra twelve slots hold is already finished-looking without its
  fragment, which is why the shell count can stay put.
  `adoptPrerenderedCards()` adopts these shells during parse and starts
  rendering into them; `loadCardList()` keeps them and builds the rest of the
  catalogue around them, dropping any shell whose tool has gone.

The same script also re-syncs the per-category count badges on the filter pills
(`updateCategoryCounts()` overwrote them at runtime, so 21 of 27 had silently
drifted in the HTML that crawlers and no-JS visitors read). `count-all` and
`heroToolCount` belong to `sync-counts.py` — one number, one owner.

And it writes a third block, **`HOME-CATEGORIES`** (inside `#categories`): the
27 category hubs as real `<a href="categories/…">` links, in the same order and
the same markup `renderCategories()` produces. Before it existed the home page
reached the crawlable catalogue **only through JavaScript** — the tiles were
rendered from `tools-index.json` (876 KB) after it landed, so a crawler or a
no-JS visitor at `/` saw twelve tool links and no way to reach the other 1182,
even though 27 static hubs and a 1194-tool A–Z index were one hop away. With
the block in place every tool is reachable from `/` in two static hops (27 hubs
cover all 1194; `tools-index.html`, linked from the section header and the
footer, covers all 1194 in one), and the script replaces the tiles with
identical ones so nothing changes visually. Order, slugs and icons are read
from `tools-index.json` — the file the runtime renderer uses — so the two can
never disagree; counts are re-derived from `cards.json` and a mismatch fails
the build instead of publishing a stale hub.

After the first screen's placeholders exist, the build of the remaining ~1120
yields while the loader pipeline is busy (`FIRST_SCREEN_CHUNKS` /
`YIELD_FRAME_LIMIT`), so the catalogue tail no longer competes with the tools
the user is actually looking at. The yield is bounded, so a busy page cannot
starve the build.

### What the loader is allowed to do per frame

Two rules keep scrolling cheap, both pinned by `scripts/tests/lazy-loader.test.js`:

- **`MAX_CONCURRENT_LOADS = 6`** fetch/render jobs. A mosaic screen wants
  ~24 tools and a 900px single-column screen ~5, so the point is not to match a
  screenful exactly — it is to keep enough slots free that the nearest-first
  pick is never waiting on a card the visitor has scrolled past. Four made a
  free slot rare enough that the fallback sweep spent its time measuring cards
  it could not start.
- **The viewport sweep only measures when a slot is free.** `scrollFallbackLoader()`
  walks the pending list to prune finished cards, but every
  `getBoundingClientRect()` in that walk forces layout: with the whole
  catalogue pending that was **1,190 reads per scroll frame** (measured —
  71,404 over 60 frames of fast scrolling) while all four slots were busy, so
  none of the cards it found could start. It now skips the measuring pass when
  `activeLoads >= MAX_CONCURRENT_LOADS`; the walk still prunes, the errored-card
  retry still runs, and `processLoadQueue()` re-sweeps the moment a slot frees.

- **The park pass is gated on scroll distance, not on frames.**
  `parkOutsideWindow()` has to measure every *live* tool to know whether the
  window still covers it. That is a windowful of `getBoundingClientRect()` calls
  (at most `MOUNT_WINDOW_MAX`, not the whole catalogue) — but the frames it would
  spend them on are the frames someone is scrolling, so the pass runs once per
  `PARK_STEP` (240 px) of movement and backs off to `PARK_STEP_MAX` for as long as
  it keeps finding nothing to park. `invalidateParkPass()` forces one after a
  resize or a density switch, because both move the window without moving the
  scroll position.

The IntersectionObserver stays the primary trigger — it knows what entered the
viewport without asking the layout engine about 1,194 elements.

### The live window: density, the park, warm-ahead

**The problem this fixes.** The grid used to be one tool per row of about
330 px, so a screen held two of them and the whole catalogue was over 400,000
px of scroll, and none of it became real until its fragment had been fetched,
parsed *and executed*, and the loader — throttled to 6 mounts per 2.5 s to keep
scrolling usable — needed ~8 minutes of foreground time to make one page of
tools real. The site read as "nine tools and a promise". No amount of tuning the
throttle helped: with one verb (`loadCard`), making the tools visible meant
making them run, and running all of them is not a thing a browser does.

Three changes, each of which is the *whole* of one idea:

- **Density (`DENSITY` in `home-app.js` + `MOSAIC DENSITY` in `home.css`).**
  Mosaic is the default: a pending tool is a tile (title + description, no
  badge, no action row) in a `repeat(auto-fill, minmax(212px, 1fr))` grid, and a
  *running* tool spans the whole row (`.card.loaded { grid-column: 1 / -1 }`).
  One screen now holds ~30 tools instead of 2, and the whole catalogue is ~40
  screens instead of several hundred. `body.density-focus` is the old reading
  stack, kept for visitors who choose it — the class only ever *adds* the wide
  layout, so a page with no JS still gets the dense grid, which is the better
  first visit.
  `gridMetrics(viewportH, containerW, density)` is the single place that turns
  that geometry into a number; `computeInitialBatch()` is just its answer, so
  the loader's screenful and the CSS's screenful cannot disagree (and
  `scripts/tests/live-window.test.js` reads `minmax()` out of the stylesheet to
  prove it).
- **The mount window and the park (`mountBudgetFree()`, `parkCard()`,
  `resumeParked()`).** The observer and the viewport sweep mount what is on
  screen, nearest first, and the grid lays out `mountWindow` tools at a time
  (`MOUNT_WINDOW_DEFAULT = 24`, between `MOUNT_WINDOW_MIN` and `_MAX`). That
  number limits **layout**, not liveness. A tool mounted outside the window is
  *parked*: its content subtree moves into `#mp-park` — one
  `position: fixed; left: -100000px; visibility: hidden` container — while the
  card shell stays exactly where it is in the grid and keeps its face, while the
  *row* goes back to being a tile: the pinned `min-height` is lifted off the box
  and stored on the card, so the grid is as dense where the reader has been as it
  is where they are. A parked tool keeps running, keeps its DOM, keeps every value
  the visitor typed, costs the visible page no paint and no layout, and wakes up
  with one `appendChild` and one restored `min-height` — not a fetch, a parse, a
  script and a lost form.
- **Handing a row's height back is only honest if the scroll offset pays for it**
  (`aboveTheFold()` → `noteRowHeight()` → `commitScrollHold()`). A tool that was
  900 px tall and is now a 172 px tile has taken 728 px of document away *above*
  the viewport, and the pixels the reader is looking at slide down by exactly that:
  the classic infinite-scroll jump, once per park. So the pass measures the row,
  mutates it, measures it again, and corrects `scrollY` by the difference inside
  the `requestAnimationFrame` the sweep already runs in — which is where a browser
  wants a compensating scroll, so no frame is ever painted at the wrong offset.
  Corrections are batched per pass (a dozen rows must not become a dozen scroll
  events, each scheduling another sweep); rows below the fold get none, because
  nothing they do is visible; a row the fold cuts in half gets none, because
  moving the page under it *is* the jump. `lastParkScrollY` and `lastWarmScrollY`
  are re-anchored to the corrected value so a compensation is never misread as the
  reader having scrolled — the park pass would otherwise fire again for nothing and
  the warm walk would decide the page had turned around. `?park=full` skips the
  collapse and keeps the row claimed. **Mounting pays the same tax, in the other
  direction**: `renderCardContent()` snapshots the row before it drops
  `card-pending` and again before `adjustCardHeight()` widens it for late-painted
  content, so a tool arriving in the look-ahead band above the fold does not shove
  the reader down the page. Two growth points, two corrections, one per mutation —
  a single correction at the end would be 100 ms late and would miss whichever of
  the two grew more.
- **One compensator, not two.** Blink's scroll anchoring exists to do exactly this
  arithmetic, it is on by default, and it does not coordinate with a page that has
  already done it — a park corrected twice is a jump the same size in the other
  direction. So `home.css` sets `overflow-anchor: none` on the root scroller: the
  page is the only thing that moves `scrollY` for a layout change it caused. That
  is a trade with a real cost, taken deliberately — content that grows late inside
  a tool (an image decoding, a font landing) no longer gets the UA's help — and
  the mitigation is the one already in the sheet: `contain-intrinsic-size` must
  stay honest for every skipped box, because it is now the only thing standing
  between a lazy image and a moved page. `canHoldScroll()` is the shared gate for
  all of it (`!touchActive`, from `initTouchGuard()`): under a live finger neither
  the collapse nor a mount correction is applied, which is why the touch guard and
  `collapsePark` are two separate flags rather than one — one asks who owns the
  scroll position, the other whether a row may change height at all. `touchActive`, set by `initTouchGuard()`,
  defers the collapse while a finger is still flinging the page, because a
  correction that cannot be applied safely is worse than a row that collapses a
  frame after the finger lifts.
- **The pass has two halves, and the other one is a wake** (`wakeInsideWindow()`):
  anything parked that the viewport now covers comes back, deliberately *without*
  consulting `mountBudgetFree()`. That budget counts what the page fetches and
  mounts, and a wake is a node move — gating it is how a tool ends up parked
  underneath the reader's cursor while stale rows three screens behind still hold
  every slot. The observer wakes on sight too, ahead of its own budget check, and
  for a browser with no `IntersectionObserver` the park pass is the only wake path
  there is. Parking in the same pass hands the budget straight back.
  `keepAlive()` refuses to park a tool under the pointer, one with the caret inside
  it, or one carrying `data-keep`; `⚡ Run all` and `?park=off` switch parking off
  entirely, because both mean "the window is the page".
- **The window is sized by measurement, twice over.** `initFrameGovernor()` listens
  to `PerformanceObserver('long-animation-frame')` and narrows the window when
  frames are long, growing it back on a later quiet pass — no timers. Where LoAF
  does not exist (Safari, Firefox) `probeFrames()` asks for one frame per pass and
  times the answer, shrinking on a gross miss (`LONG_FRAME_MS × 2`): "no signal" is
  not the same as "no pressure", and an iPhone handed `deviceBudget()`'s ceiling
  with no way back would have been the proof. The rate limiter starts at
  `lastShrink = -Infinity`, because a throttle that has never fired should not
  swallow the first dropped frame after the initial mount. `prunePark()` is the only destructive path in the design,
  and it runs only when `performance.memory` reports the heap under pressure
  (then oldest-parked first, down to 70% of `PARK_CEILING`): a parked tool is
  cheaper than a lost one. `cardCache` is capped at `CARD_CACHE_MAX = 96` and
  `pruneCardCache()` never evicts a tool that is running *or parked*.
  `#liveToolCount` (`updateLiveCount()`, called from `updateSiteStats()` and by
  the park itself) states both halves: how many tools are in the grid and how
  many more are alive off it. One part of a parked tool's cost *is* clawed back:
  `pauseParkedAnimations()` calls `getAnimations({subtree: true})` on the holder
  and pauses each running animation, replaying exactly that set on the way back.
  It is the only reversible pause available that needs no cooperation from the
  card, and it is deliberately not a rAF interception — a tool that drives its
  own frame loop keeps doing it, because stealing frames from the visitor's code
  is how a page starts lying about being live. The split, measured over the shipped
  fragments rather than guessed (`grep -lF '@keyframes\|animation:' cards/*.html`):
  134 animate in CSS and are fully quieted while parked, 168 run a loop of their
  own and are not, and 5 do both. So the park is a layout/paint guarantee, not a
  CPU one, and that is the honest shape of it.
- **Warm-ahead (`startCacheWarm()` / `pumpWarm()` / `warmCard()`).** The
  background pass fetches fragment *text* into `cardCache` and does nothing
  else — no `DOMParser`, no script, no layout, no `.innerHTML`. It walks
  catalogue order from a cursor that follows the reading position (the sweep
  pumps it once per pass; a filter, sort or density change resets the cursor),
  never runs while `activeLoads >= MAX_CONCURRENT_LOADS - 1`, and stops after a
  full pass that found nothing to do. **The walk is two-way** (`warmDir`,
  `noteReadingPosition()`): the sweep reports which catalogue index is at the top
  of the screen and which way the scroll is moving, and when the reader reverses
  the cursor reverses with them, restarting `WARM_LOOKBEHIND` entries above the
  fold. That is what the park needs — waking a tool should find its bytes cached,
  and a tool evicted under memory pressure should cost a re-render, not a
  download. Because every request is a `cards/*.html` GET, the service worker
  stores the same responses in `CARDS_CACHE`, so warming on this visit is warming
  on the next one.
  `warmEligible()` skips anything the mount pipeline owns, including parked
  tools — their bytes are already in the DOM.

Net effect: **every tool the visitor can see is live within a frame or two of
arriving** (usually from cache), everything they have already passed stays
running off-grid with its state intact, everything else on the page is a
complete, searchable, one-click tile, and the grid never carries more than a
windowful of layout. Save-Data and 2G visitors get the tiles and click-to-run
with no background download at all — the grid is already complete without them.

The old idle trickle is gone in both files (a dead copy of its constants sat in
`home-features.js`; it is gone too). `scripts/tests/live-window.test.js` fails
if `TRICKLE_BATCH`/`startIdleTrickle` come back, and
`card-faces.test.js` suite 6 now drives the warm path instead.

### The app is split: first screen in one file, on-demand UI in another

`home-app.js` is the page's application. 36 KB of it — the panels (palette,
contributions, shared toolbox), the whole toolbox, the standalone-maximise
modal and the alternate directory view — is UI that **no first screen needs**.
It lives in `home-features.js`, which `home-app.js` requests at idle
(`requestIdleCallback`, 2.5 s deadline, `fetchPriority: 'low'`) or immediately
if a click asks for a feature first:

- **The core never waits for the bundle.** `initApp()` runs as soon as
  `home-app.js` executes; the panel/toolbox/modal listeners are wired by the
  bundle itself when it lands. Before the split, every visitor compiled all
  36 KB before the first tool appeared, on the same connection that was still
  fetching the first screen's fragments.
- **The core calls into the bundle through eight delegates** of the same name
  (`updateGridLayout`, `setViewMode`, `renderDirectoryList`,
  `handleDirectoryGridClick`, `openStandaloneModal`, `rateCard`,
  `copyEmbedCode`, `addCardToToolbox`), so every existing call site — and every
  listener already attached to a rendered card — is unchanged. A call that
  arrives before the bundle lands is queued and replayed in order; calls that
  only ever want the latest value (a filter pass re-rendering the directory
  list, a resize re-laying the grid) replace the queued one instead of piling
  up.
- **Shared state goes through `window.__mpHome.state`,** which is a set of live
  getters/setters over the core's own variables — not copies, so both files
  always see one value. `window.__mpHome.fn` exposes the six core functions the
  bundle calls (`showNotification`, `loadCard`, `getCardRating`, `saveRatings`,
  `transformCardScript`, `withViewTransition`).
- **One version, three files.** `APP_VERSION` in `home-app.js` builds the
  bundle's URL, `index.html` uses the same number for its `?v=`, and `sw.js`
  keeps it in `CACHE_VERSION`; `scripts/check-critical-css.py` fails if they
  drift, and the bundle is in the service worker's precache (a first visit
  followed by an offline visit must still have working panels).
- **`scripts/tests/app-split.test.js` drives both real files in a vm:** it
  executes the core (which must run, and schedule the bundle, without it),
  queues an early call, then executes the bundle and asserts it registers,
  replays in order, serves later calls directly, and that the state accessors
  are live. It also fails if any moved implementation is still defined in the
  core, or if a delegate loses its registration.

The reader-mode toggle stayed in the core: unlike the panels it restyles every
card, so it is page chrome rather than an on-demand view.

### The main page's `<head>` is a budget

`index.html`'s head was 132,210 bytes — 71% of the document — mostly the inline
stylesheet. It is now ~15 KB, and the rule that keeps it that way is: **bytes in
the document cost every visitor on every navigation, so rationale lives in this
file, not in HTML comments.** A measured example: the HTML comments alone were
2,664 bytes gzip (19% of what the page sent). The surviving comments are
one-liners that point here. What lives here instead:

- **Why the catalogue is fetched by the head bootstrap, not `<link rel="preload">`.**
  The bootstrap's `fetch()` is same-origin; a preload whose credentials mode
  does not match the later `fetch()` downloads the file twice on a miss.
- **Why `home-app.js` is external and deferred.** It parses in parallel with the
  HTML instead of waiting for the whole document, and it is cached separately, so
  a revalidated page stops re-sending ~125 KB of JS with it. `defer` executes it
  right after DOM parse — the same timing it had inline at the end of `<body>`.
- **Why gtag loads at idle.** Its ~28 KB script used to be requested the moment
  the head's end parsed, while the first cards were still rendering. The
  `dataLayer` shim is in place immediately, so every `gtag()` call queues and
  nothing is lost; `page_view` lands a beat later.
- **Why Inter is self-hosted and preloaded.** The old chain was
  head → Google CSS (1 RTT) → woff2 (1 RTT) → ~700 ms of font-swap delay on slow
  4G. `unicode-range` keeps the latin-ext file unfetched unless a glyph needs it,
  and `font-display: swap` paints in the system stack meanwhile.
- **Why the speculation rules are `conservative`.** A prerender runs the whole
  standalone page (its scripts fetch the full catalogue), so hovering across the
  grid used to start page loads mid-fetch of the grid's own cards.
- **Why the first 12 shells are pre-rendered markup.** They paint titles, badges
  and standalone links with the HTML; `adoptPrerenderedCards()` adopts them
  instead of rebuilding them, and the head bootstrap already has their fragments
  in flight. In gzip terms the twelve shells cost ~1.5 KB and remove a full
  round-trip of empty grey boxes.

### Where the main page's CSS lives

`index.html` used to carry ~118 KB of CSS inline in one `<style>` block. That
made the first paint wait for every byte of it, on every visit, and re-sent
~19 KB gzip of identical CSS on every navigation. The sheet is now two cached
files:

| file | contents | how it is loaded |
| --- | --- | --- |
| `home.css` | first-paint rules: base tokens, command bar, hero, search, filters, grid, card shells, skeletons, cool loader, risk notices, card footer | render-blocking `<link>` (unstyled first paint is worse than one RTT that overlaps the HTML download) |
| `home-deferred.css` | rules for containers that are **hidden at first paint**: palette/contributions panels, toolbox and its grid/list modes, the directory view, the maximise modal, the no-results state, the footer and its music spotlight | `media="print"` + `onload` swap, so it is fetched alongside `home.css` but applied only after the first paint; `<noscript>` link for JS-less readers |

Three properties make the split safe, and `scripts/check-critical-css.py`
(verify §15) fails the build if any of them is broken:

1. **The rules that hide those containers stay in `home.css`.** `.panel`,
   `.toolbox`, `#directoryView { display: none }` and the modal's
   `pointer-events: none` are the mechanism, not styling — a late stylesheet
   must never be what decides whether a container is visible.
2. **No deferred selector may mention anything else.** The guard's rule is
   containment, not a sample: every selector in the deferred file must target
   one of the hidden containers, so moving a `.card` or `.main-header` rule
   there fails loudly.
3. **`home.css` carries the tokens and keyframes it uses**, and the deferred
   file may only lean on what `home.css` defines (it always loads first).

`index.html` links both (and its scripts) with `?v=N`, and `N` must equal
`CACHE_VERSION` in `sw.js` — the same deploy-consistency rule the service
worker enforces for its own caches, since a page from one deploy must never run
against another deploy's CSS or JS.

### Anatomy of a card

A card is an **HTML fragment**. No `<!doctype>`, no `<html>`, `<head>` or
`<body>`.

```html
<!-- cards/my-tool.html -->
<h2 id="mytl-title" style="margin-top:0;color:var(--accent);">🔧 My Tool</h2>

<form aria-describedby="mytl-desc" onsubmit="event.preventDefault();">
  <p id="mytl-desc" class="small"
     style="color:var(--text-secondary);margin-bottom:14px;font-size:0.85rem;">
    One or two sentences describing what the tool does.
  </p>
  <!-- controls -->
</form>

<script>
(function(){
  // All logic inside an IIFE. Never leak globals.
})();
</script>
```

Hard rules, learned from breakages:

1. **Fragment only.** A full document nested inside the shell breaks layout.
2. **Element IDs must be globally unique across all 1195 cards.** They share one
   DOM. Pick a short prefix per tool (`b3js-`, `cwf-`, `mytl-`) and use it on
   every single element. An ID collision silently makes another tool misbehave,
   which is very hard to trace.
3. **Inline styles**, plus the CSS variables in §5. There is no per-card
   stylesheet.
4. **Wrap all JS in an IIFE.** No global `let`/`const`/`function`.
5. **Self-contained.** No external JS/CSS. No network calls. Everything runs
   offline in the browser.
6. `onsubmit="event.preventDefault();"` on any form, or the page reloads.

### Adding a tool — the exact sequence

```bash
# 1. Write the fragment
vim cards/my-tool.html

# 2. Add the slug to the right category list in generate-cards-json.js FIRST
#    (see the warning below), then regenerate the index
node generate-cards-json.js

# 3. Re-sync everything derived from the catalogue. Never hand-edit a count
#    or the home page's generated first screen — the tool count is the number
#    of .html files in cards/ (`python3 scripts/sync-counts.py count` prints
#    it) and verify.sh re-derives any drifted published number in
#    place instead of failing. Order matters: build-home-prerender.py reads
#    tools-index.json for the category hub links it writes into index.html.
npm run build          # every generator, in dependency order (~8 s)

# 4. Verify, commit, push, wait ~50s, then verify live:
bash scripts/verify.sh --deep   # ~15 s; plain verify.sh (~4 s) while iterating
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

> **Warning — `generate-cards-json.js` overwrites categories.**
> The script assigns `category` from hardcoded filename lists near the top of
> the file. Any card not in a list gets a default. If you set a category by
> hand and then re-run the script, **your category is silently lost**. Either
> add the filename to the appropriate list inside the script (preferred), or
> re-apply the category after every run. This has bitten previous work.

### Card JSON shape

```json
{
  "id":          "acoustic-levitation-standing-wave-title",
  "name":        "acoustic-levitation-standing-wave",
  "title":       "🔊 Ultrasonic Acoustic Levitation",
  "description": "40 kHz ultrasonic standing wave acoustic trap...",
  "category":    "Science & Engineering",
  "file":        "acoustic-levitation-standing-wave.html",
  "path":        "cards/acoustic-levitation-standing-wave.html"
}
```

`title` and `description` are scraped from the `#<prefix>-title` and
`#<prefix>-desc` elements. If a card is missing them, its catalogue entry will
be blank — a common cause of "my tool shows up empty".

### Categories (1195 tools)

Derived from `cards/cards.json` — regenerate rather than hand-edit.

| Count | Category | | Count | Category |
|---|---|---|---|---|
| 195 | Science & Engineering | | 29 | Museum & Collection |
| 142 | Productivity & Lifestyle | | 26 | Wellbeing & Community |
| 79 | Finance & Money | | 22 | Culinary & Food Science |
| 67 | Algorithms & Computer Science | | 21 | Virtual Worlds & Gaming |
| 67 | Writing & Language | | 19 | AI & Autonomous Agents |
| 54 | Sports | | 17 | Mind-Blowing Demos |
| 53 | Mathematics | | 12 | Lucid Dreaming & Sleep |
| 51 | Interactive Art & Living Worlds | | 10 | Anime & Otaku Culture |
| 44 | SaaS & Business Killers | | 10 | Aquatics & Fishkeeping |
| 37 | Home & DIY | | 10 | Birdwatching & Ornithology |
| 35 | Astronomy & Space | | 10 | Dogs & Canine Care |
| 35 | Music & Audio | | 10 | Natural Remedies & Herbs |
| 34 | Health & Fitness | | 10 | Survival & Emergency Readiness |
| 29 | MrProphecy Arcade | | | |

Total: 1195 tools in 27 categories.
---

## 4. Product B — MrProphecy music

### Verified facts

Everything below was confirmed against YouTube's oEmbed API. **Use these
values; do not invent IDs.**

| Item | Value |
|---|---|
| YouTube channel | `@MrProphecy` — note the capitals, this is canonical |
| Flagship video | `qL6X6n6FLuo` — "MrProphecy – Injection" |
| Animated Soundscapes | `PLasqsDl8vf8dX09ZHd9G33ihpdUV2h2G8` — 47 videos |
| In 2025: The Movie | `PLasqsDl8vf8eEUJVB923RSbXDJHazWLoZ` — 26 videos |
| Sons of South | `PLB68AB9B6E57C3FC1` — 100 videos |
| SoundCloud | `soundcloud.com/mrpr0phecy` (note the **zero**) |
| Instagram | `@mrpr0phecy` (zero) |
| TikTok | `@mrprophecy1212` |
| Base | Luton, England |

The handles are inconsistent by nature: YouTube uses an `o`, SoundCloud and
Instagram use a `0`. This is not a typo — do not "fix" it.

**The "In-" series.** 26 of the 47 animated tracks have titles beginning with
"In": Injection, Invincible, Infighting, Incarnation, Inside, Inrush,
Innersoul, Invested, Innovate, Incursion, Infiltrate, Incompetence, Inherent,
Introvert, Instinct, Indigo, Init, Inhabited, Internal, Integrate,
Incandescent, Inbound, Inhale, Inauguration, Inferno, Invasion. This is a
deliberate creative signature and `listen.html` is built around it.

### Getting video metadata without an API key

YouTube blocks scraping from most automated environments, but oEmbed is open
and needs no key:

```bash
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEO_ID&format=json"
```

To enumerate a playlist, extract IDs from the playlist HTML then resolve each:

```bash
curl -s "https://www.youtube.com/playlist?list=PLAYLIST_ID" \
  | grep -oE '"videoId":"[A-Za-z0-9_-]{11}"' \
  | grep -oE '[A-Za-z0-9_-]{11}' | awk '!seen[$0]++'
```

Thumbnails follow a fixed pattern — no API needed:
`https://i.ytimg.com/vi/<ID>/maxresdefault.jpg` (also `hqdefault`, `mqdefault`).

### `listen.html` — the music hub

The most recently rebuilt page and the best template for future music work.

- Hero built on the flagship video's artwork.
- **Video wall of all 47 videos**, split into the In- series and 21
  collabs/remixes, generated from live YouTube metadata.
- **Click-to-load players.** No `<iframe>` exists on load. Nothing is requested
  from YouTube until the visitor clicks. This keeps the page fast and means no
  third-party cookies are set for people who never press play. *Preserve this
  behaviour* — dropping in a plain `<iframe>` undoes it.
- Modal player: Escape closes, focus is restored, and the iframe is destroyed
  on close so audio actually stops.
- `MusicGroup` JSON-LD, canonical, Open Graph and Twitter cards.

### The music page cluster — one net, seven angles

The music pages are **deliberately separate rather than consolidated**. Each
targets a different search intent so the project casts a wider net; merging
them would narrow it. The rule is that no two pages may compete for the same
query — every page needs its own title, description, keywords and angle.

| Page | Angle | Targets |
|---|---|---|
| `listen.html` | Hub / start here | brand searches, "MrProphecy" |
| `radio.html` | Continuous play | "listen continuously", background listening |
| `thisorthat.html` | Interactive game | shares, repeat visits, "rank tracks" |
| `youtubepromo.html` | Videos & visuals | "animated music video", "In- series" |
| `youtubepromo1.html` | Free streaming | "stream free", "SoundCloud", "no signup" |
| `youtubepromo2.html` | Long-form guide | "who is MrProphecy", discovery reading |
| `youtubepromo3.html` | Sons of South | crew names, "All Eyes On The South" |
| `luton.html` | Local | "Luton rapper", "Bedfordshire hip hop" |
| `music.html` | Press kit | "bio", "booking", press and curators |
| `support.html` | Direct support | "support independent artist", tipping |

All seven share a sticky nav (`.mp-nav`, generated by `nav()` in the build
script) so the cluster is interlinked and ranking signal flows between the
pages instead of each being an orphan island — which is what they were before.

**If you add a music page:** give it a genuinely distinct angle, add it to
`NAV_PAGES`, regenerate the nav on all pages, and add it to the sitemap. If you
cannot state its unique search intent in one line, it should not be a new page.

### Music page conventions

- Always embed via `https://www.youtube-nocookie.com/embed/<ID>`.
- Every bare channel link gets `?sub_confirmation=1`, which opens the subscribe
  dialog instead of just the channel.
- Never commit a placeholder video ID. If a real one is unavailable, link to
  the channel or a playlist instead.

### Analytics

Google Analytics `G-G058FVW6Z2` is installed on the 12 pages that matter
(catalogue homepage, all music pages, both money pages, news). It was
previously on `music.html` only. Add it to any new public page — without it
there is no way to price sponsorship or tell what is working.

### Money and monetisation

Payments go to **`paypal.me/russellhead`** (Russell Head). The PayPal QR the
owner uses resolves to the same account
(`paypal.com/qrcodes/managed/5db885a3-66b7-4c5a-9a7c-2caded6d2c7e`), but prefer
the `paypal.me` handle in markup — it is readable, linkable and lets you
pre-fill an amount.

Amounts are **GBP**: `https://paypal.me/russellhead/10GBP`. Without the `GBP`
suffix PayPal defaults to the viewer's locale, which showed dollars to a
UK audience.

Rules for anything money-related on this site:

- **Never gate the music.** Everything stays free. Supporters get no exclusive
  tracks or early access — the moment support unlocks content, it stops being
  a free catalogue. This is a deliberate positioning choice, not an oversight.
- **Lead with the free actions.** Subscribing, finishing a video and sharing a
  link are worth more to an unsigned artist than a one-off tip, and saying so
  earns more trust than a hard ask.
- **No fake urgency**, no countdowns, no invented "goals" or fake supporter
  counts, no claims about what the money covers that are not true. The site is
  hosted free on GitHub Pages — do not claim donations pay for hosting.
- Keep the ask on `support.html` and in the nav. Do not scatter donate buttons
  through the tool cards or interrupt playback with them.

### Why radio.html and thisorthat.html exist

**Watch time from embedded YouTube players counts toward YouTube Partner
Programme eligibility**, provided the video is public. This is confirmed
behaviour, not a loophole — YouTube counts embeds on external sites the same
as views on youtube.com.

That makes the site itself a watch-time surface, so two pages are built
specifically around it:

- **`radio.html`** uses the YouTube IFrame Player API to play all 47 tracks
  back to back. One click starts a session that can run for hours. It uses
  `loadVideoById()` on a single player rather than swapping iframes, so
  playback is continuous and the session is unbroken. `onError` skips
  unplayable videos automatically so the station never stalls.
- **`thisorthat.html`** makes watching the *mechanism* of a game: two tracks,
  play both, vote, repeat twelve times, get a personal top 5 that can be
  shared. Repeat visits and shares both come free.

Rules if you extend these:
- Keep the **facade pattern** — no iframe until the visitor clicks. It keeps
  the page fast and avoids setting third-party cookies on arrival.
- On `thisorthat.html` the vote button and the video are **separate elements**.
  They were originally one, which meant clicking the middle of the card did
  nothing (the video overlay swallowed the click). Do not merge them again.
- Never auto-play muted in a hidden element to farm watch time. That is
  invalid traffic, YouTube filters it, and it risks the channel.

### opensourcenews.html

A live world-news broadcast built from open RSS feeds. Self-contained: 3D
globe, TTS anchors, tickers, no backend.

**Feed list (80 feeds).** Each entry is
`{ url, src, cat, weight, region, direct? }`. `cat` is one of `world`,
`science`, `tech`, `finance`, `weather`, `sport`.

**`direct: 1` is the important flag.** 43 of the 80 feeds serve
`Access-Control-Allow-Origin: *` and were confirmed fetchable straight from a
browser page. Those bypass the CORS proxy entirely: no shared quota, no third
party, and the channel keeps working when every proxy is down (verified: 149
stories from 42 sources with all proxies blocked at the network layer).

**Never mark a feed `direct` from a server-side check alone.** Roughly a third
of feeds that send `Access-Control-Allow-Origin: *` to curl are still blocked
in a real browser. Test with `fetch()` from an actual page first.

**Scheduling** is two-phase: direct feeds run 12-wide with no delay, proxied
feeds rotate 8 per cycle through a paced queue. Per-feed health tracking backs
a failing feed off 1/4/9…30 minutes so dead URLs cannot consume the budget.

**Corroboration.** Stories are compared by Jaccard similarity (threshold 0.22)
over significant terms; matches across different outlets are grouped and
promoted in ranking. Machine-templated feeds (USGS/NWS/NOAA/GDACS) are excluded
— their entries match each other on format, not content, so every earthquake
looked like corroboration for every other earthquake.

**Rendering happens on the progressive path**, not at end-of-cycle. Anything
that must affect what the viewer sees has to run there; end-of-cycle only
fires once all batches finish.

### Growth policy — read before "boosting views"

The owner wants more YouTube plays. The agreed approach is **legitimate only**:
correct metadata, fast pages, structured data, honest calls to action, internal
linking, translated landing pages.

Explicitly out of bounds: view-bots, autoplay-in-background tricks, hidden or
1×1-pixel players, misleading thumbnails, engagement pods. These violate
YouTube's Terms of Service, risk demonetisation or channel termination, and
inflate metrics without producing listeners. Do not implement them even if
asked indirectly.

---

## 5. Design language

Two distinct aesthetics. Match the one belonging to the page you are editing.

> **These rules are the design contract.** A "Visual Design Expert" staff role
> and a 54-check static audit (`scripts/design-audit.js`) used to enforce them;
> both were deleted with the staff machinery on 2026-09-20. The rules stay.
> Read this section before changing anything visual, and look at the hub pages
> in a browser at 360 px and 1440 px — no static check substitutes for that.

### Product A — tool catalogue: "cyan terminal"

Defined as CSS custom properties in `index.html`:

```css
--accent:         #2dd4ff;   /* cyan — headings, focus, primary */
--accent-dark:    #1aa3cc;
--text:           #e6faff;
--text-secondary: rgba(230, 250, 255, 0.7);
--bg-primary:     #0a0f14;   /* near-black, blue-shifted */
--bg-secondary:   #141e28;
--bg-card:        linear-gradient(145deg, rgba(255,255,255,.03), rgba(255,255,255,.05));
--border-light:   rgba(255, 255, 255, 0.08);
--success:        #39ff14;
--error:          #ff4d4d;
--premium:        #ffd700;
--love:           #9d4edd;
--space-xs/sm/md/lg: 4px / 8px / 12px / 16px;
```

Feel: dark, technical, high-contrast, dense. Utilitarian rather than decorative.
Inputs use `#070f18` backgrounds with thin translucent borders. Every card
title carries a single leading emoji — it is the only ornament, and it doubles
as a visual key in the grid.

### Product B — music: "neon night"

Defined per-page; `listen.html` is the reference implementation:

```css
--bg:    #08080c;   /* near-black */
--panel: #101018;
--line:  rgba(255,255,255,.10);
--txt:   #f2f2f7;
--dim:   #9a9aad;
--hot:   #ff2e63;   /* magenta-red — primary accent */
--gold:  #ffc93c;   /* secondary accent */
--cyan:  #25d8f0;
```

Feel: cinematic and editorial. Oversized `font-weight:900` display type with
tight negative letter-spacing; gradient text on the artist name; generous
vertical rhythm (~74px section padding); blurred artwork behind a dark scrim in
the hero; pill-shaped buttons that lift 2px on hover. YouTube red `#ff0033` is
reserved for subscribe actions so the primary CTA is unmistakable.

### Shared rules

- **Mobile first.** Everything must survive a 360px viewport.
- **Respect `prefers-reduced-motion`** — kill animations and smooth scrolling.
- **Keyboard reachable**, visible focus, real `aria-label`s on icon-only
  controls, one `<h1>` per page and a sensible heading order.
- **System font stack** (`Inter`, `system-ui`, `-apple-system`, `Segoe UI`)
  with graceful fallback. Webfonts must be self-hosted: the home page ships
  the Inter variable woff2 in `fonts/` (preloaded, `unicode-range` subsets,
  SIL OFL — see `fonts/OFL.txt`). No third-party font CDNs on that page.
- `loading="lazy"` on below-the-fold images.
- Every `target="_blank"` needs `rel="noopener noreferrer"`.

### Design refinements (2026-09)

Applied to the four hub pages and `cards/card.css`; keep them when editing:

- **`cards/card.css`** carries the shared responsive hardening: `.field` and
  every direct child of an inline `grid-template-columns` container gets
  `min-width:0; max-width:100%`, and form controls get `min-width:0`. This
  stops card fragments (e.g. BMI's `1fr 1fr` height/weight fields) from
  blowing the layout past a 390px viewport, on `tool.html` or anywhere else
  the fragments are embedded. Do not remove these rules when restyling cards.
- **Visible keyboard focus**: `:focus-visible` outline (2px, accent colour,
  2-3px offset) on all four hub pages. Additive — never replace a custom
  focus treatment, never remove the outline.
- **Anchor offset**: `scroll-margin-top` (≈72px) on `section`/`main` targets
  in `listen.html` and `donate.html` so sticky navs never cover anchored
  sections.
- **Theme chrome**: `color-scheme: dark`, accent-tinted `::selection`, and a
  thin accent scrollbar are part of the system on `index.html`, `tool.html`,
  `listen.html`, `donate.html` and `404.html`.
- **Tap targets**: sticky-bar action buttons, dock/category pills,
  `listen.html` nav links, `.mp-sub`, `tool.html` `.nav-brand` and
  `donate.html` topbar links are all ≥40px. Keep new interactive chrome at or
  above 40px (card widgets additionally get a 44px boost on touch devices via
  `setupMobileOptimizations`).
- **`tool.html`**: `.tool-card-box` and its injected container are
  `min-width:0; max-width:100%` — the second half of the card-overflow fix.
- **Hero**: `.futuristic-badge` text is `rgba(230,250,255,.85)` on a
  `rgba(0,243,255,.08)` tint; `.main-search-bar` is 52px tall with a
  full-height search button; `.futuristic-subtitle` uses `text-wrap:pretty`.
- **Decorative extras live in classes, not inline styles**: empty-search
  state (`.no-results`) and the footer music spotlight (`.music-spotlight`)
  are class-based so the design tokens stay in one place.

---

## 6. SEO and metadata

Every public page should carry: unique `<title>` and meta description,
`rel="canonical"`, Open Graph (`og:title`, `og:description`, `og:image`,
`og:url`, `og:type`), `twitter:card` = `summary_large_image`, and `theme-color`.
Music pages additionally carry `MusicGroup` JSON-LD.

**Always use `https://` and the `www.` host** in canonical and OG URLs. Mixed
`http://` references caused broken share previews here before.

The 12 language pages form an **hreflang cluster**: each one lists all twelve
siblings plus `en` and `x-default` pointing at `listen.html`. If you add a
language, you must add it to the cluster **in all thirteen pages**, or Google
treats them as duplicates competing with each other.

### Regenerating the sitemap

`sitemap.xml` lists all 1197 indexable pages (including 1195 cards). Build it
from git rather than the working tree, so a sparse checkout does not silently
drop the card pages:

```python
import subprocess, datetime
base  = "https://www.themostusefulsiteintheworld.com"
today = datetime.date.today().isoformat()
# Never list an error page, the 145-byte scratch file with no <title>, or the
# unlinked beta catalogue (see §7). Re-running without this set silently
# re-adds all three.
EXCLUDE = {"404.html", "hokidea.html", "indexbeta.html"}
files = subprocess.run(['git','ls-files'], capture_output=True, text=True).stdout.split()
html  = [f for f in files if f.endswith('.html') and f not in EXCLUDE]
prio  = {"listen.html":("1.0","weekly"), "music.html":("0.9","weekly"),
         "index.html":("0.9","daily"),   "youtubepromo2.html":("0.7","monthly")}
urls  = [(p,*prio[p]) for p in prio if p in html]
urls += [(f, "0.4" if f.startswith("cards/") else "0.5", "monthly")
         for f in sorted(html) if f not in prio]
body = "\n".join(
    f'  <url><loc>{base}/{u.replace(" ","%20")}</loc><lastmod>{today}</lastmod>'
    f'<changefreq>{c}</changefreq><priority>{p}</priority></url>'
    for u, p, c in urls)
open('sitemap.xml','w').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + body + '\n</urlset>\n')
```

Note the `%20` escaping: some filenames in `images/` contain spaces.

---

## 7. Traps and gotchas

Each of these has already cost someone real time.

**`sw.js` registration traps** (resolved — `home-app.js` registers it from
`initApp()`; these constraints still govern edits to it): it uses
**network-first for HTML** deliberately. Cache-first on
HTML is what makes a static site serve stale pages for days after a deploy. It
also adds precache entries individually rather than via `cache.addAll()`,
because `addAll()` is atomic — a single 404 aborts the whole install and the
worker never activates. The previous version had four 404s in its precache list
and could never have installed. Bump `CACHE_VERSION` on any change, and bump it
**together with** the `?v=` on `index.html`'s stylesheet and script references —
`scripts/check-critical-css.py` compares the two, because a page from one deploy
must never be served against another deploy's `home.css` or `home-app.js`.

**The catalogue may never come from a stale cache.** The catalogue decides
which tools exist, so a cached copy that predates the deploy renders a grid
with tools missing — the visitor has no way to tell that from a bug. `sw.js`
therefore routes the catalogue tiers, the card fragments and first-party
code through `freshFast()`: the cached copy answers instantly only while it is
inside GitHub Pages' own 10-minute freshness window, after which the network
decides, with the cache as the fallback if the origin is slower than
`NETWORK_PATIENCE_MS` (2.5s) or unreachable. This replaced
stale-while-revalidate, which always handed over the previous deploy's copy and
only refreshed the cache for the *next* visit — so every newly added tool was
missing until the visitor happened to load the page twice.
`scripts/tests/service-worker.test.js` drives the shipped handler and fails if
a stale catalogue beats the deployed one.

**The precache list must only contain what the fetch handler reads from that
cache.** Entries are fetched with `cache: 'reload'` (bypassing the HTTP cache)
on install, so a URL that the handler serves out of `RUNTIME_CACHE` or
`CARDS_CACHE` is downloaded a second time per install — while the visitor is
still waiting for the first screen. The service-worker test asserts the list.

**The page's own code needs a second, differently-fetched precache list.**
`home.css`, `home-deferred.css`, `home-app.js`, `home-features.js` and
`risk-notices.js` are fetched by a first visit *before* the worker controls
anything, so the worker's caches never saw them; the next visit offline then
served the cached `index.html` and 503'd its own stylesheet and script — an
unstyled page with no cards. Those five URLs are therefore precached into
`STATIC_CACHE`, and the fetch handler serves them from there (`PAGE_ASSET_PATHS`
maps the versioned URL back to the bare pathname), so the precache is the copy
that gets read rather than a second download nobody looks at.

They are precached **without** `cache: 'reload'`, which is safe and free
because their URLs carry `?v=${PAGE_VERSION}`, derived from `CACHE_VERSION`:
a new deploy is a new URL, so no entry under them can be stale — and because
the URL is new, the HTTP cache cannot hold a wrong copy either, so the
precache reuses the response the page just downloaded instead of fetching
~260 KB a second time. Bump `CACHE_VERSION` (and, with it, the `?v=` that
`scripts/check-critical-css.py` compares) or a deploy quietly precaches the
previous version's code.

**`generate-cards-json.js` overwrites categories.** See §3.

**`index.html`'s grid is driven by the catalogue — except its generated first
screen.** The twelve pre-rendered card shells and the six head-bootstrap
prefetches do carry real card names: they are written by
`scripts/build-home-prerender.py` between `HOME-FAST-PATH` and `HOME-PRERENDER`
markers. Never hand-edit inside those markers — the next run overwrites you,
and `bash scripts/verify.sh` fails until the blocks match the catalogue. The
same script owns the per-category count badges. Everything below the first
screen is still purely data-driven.

**The homepage has two search systems, and they must agree.** `home-app.js`
filters the interactive grid; `discovery-app.js` renders the browse chrome
(featured, trending, category tiles, the A–Z library) from `tools-index.json`.
Both listen to the search boxes, and three rules keep them from contradicting
each other — `scripts/tests/home-search.test.js` pins all three:

- **`home-app.js` resolves its box through `getMainSearchInput()`**, which
  tries `#tool-search` (the hero box the discovery layout ships) and then
  `#mainSearchInput` (the older id, still on `indexbeta.html`). It used to look
  for the older id only, so on the real homepage every lookup returned null:
  the hero box never filtered the grid, never synced with the command bar,
  `?q=` could not fill it, and the `/` shortcut threw on every press. **A new
  search box is an id in `MAIN_SEARCH_IDS`, never a fresh
  `getElementById`.**
- **One owner for the results.** The two systems count matches over different
  fields (the grid: title + description + category + a fuzzy pass; discovery:
  title + description + category + tags), so two lists for one query disagree
  — the shipped page said "Search Results: 7 tools" above "Showing all 1195
  tools". `gridOwnsResults()` makes discovery hide the browse chrome and render
  nothing while the grid has a catalogue to filter
  (`window.__mpHome.state.allCards.length > 0`), and keep answering in full
  when it does not — a blocked app script, or one whose catalogue fetch failed,
  must not leave search dead.
- **Status text is built with DOM APIs.** `query` is whatever a URL handed us
  and `suggestion` is a cards.json string; both used to land in `innerHTML`
  (CONSTRAINTS.md hard line 4 — `?q=<img src=x onerror=…>` produced a real
  element in `#resultsCountText`). `showCardError()` had already learned this
  lesson; `applyFiltersCore()` had not.

**`tools-index.json` is 876 KB and it is the browse chrome's data.** Discovery
fetches it with `priority: 'low'` so it cannot outrank the first screen's card
fragments. It duplicates the title/description/category the full catalogue tier
already carries (~144 KB gzip of the ~188 KB); de-duplicating it means a new
generated signals file plus a drift gate, which is recorded in `staff/OPEN.md`
rather than done half-way.

**The grid's geometry lives in two files.** `DENSITY` in `home-app.js` (tile
width, row height, gap, narrow breakpoint) and the `MOSAIC DENSITY` block in
`home.css` are one fact written twice, because JS decides how many tools a
screen holds and CSS decides what a screen looks like. `scripts/tests/live-window.test.js`
regexes `minmax(212px` and `max-width: 560px` out of the stylesheet and compares
them with the table, so the loader cannot size a batch for a grid that is not
there. Also keep `.card`'s `contain-intrinsic-size` honest: the base rule
carries the size of a running tool (340px), so a pending tile overrides it to
172px — a skipped tile measured at 340px makes the scrollbar jump as you scroll.
A parked row wears `card-pending` as well as `card-parked`, which is how the
collapse gets its height for free from the rules the grid already has, and
`parkedMinHeight` is where the row's real height waits for the wake-up.

**The park container must never be `display: none`.** `#mp-park` hides a parked
tool with `position: fixed` off the left edge plus `visibility: hidden`, and that
specific pair is the whole trick: the subtree stays laid out and measurable, so a
tool that sizes its canvas from `clientWidth` keeps real numbers while it waits.
`display: none` gives every element inside it a zero `clientWidth` and a zero
`getBoundingClientRect()` — and because a tool that measures on a resize or in a
frame loop keeps whatever it last saw, a park that momentarily hid the content
with `display` can leave a tool permanently blank *after* it is resumed.
`content-visibility: hidden` and `hidden` are wrong for the same reason. What you
may add is another `contain`, never a change to how it is hidden;
`scripts/tests/live-window.test.js` suite 11 reads the rule back out of
`home.css` and fails on `display: none` there.

Two more things that are load-bearing in the park, both pinned by the same suite:
**a parked row collapses, and the scroll position is corrected for it.** Its shell
never moves, the tool's content lives in `#mp-park` at the width the row had (so
nothing inside it re-wraps and a canvas keeps the numbers it measured), and the
row goes back to being a tile — which means `aboveTheFold()`/`noteRowHeight()` has
to hand the difference back to `scrollY` when the row sat above the viewport, in
the same frame, or the page jumps under the scroll every time anything is parked.
Scroll anchoring is not universal and is not a guarantee to hold a position with,
so this page pays for it itself; `commitScrollHold()` is that payment, and
`live-window.test.js` suite 13 asserts the arithmetic in both directions (a park
that costs 728 px of document must move `scrollY` by 728, and waking it must move
it back), and suite 18 asserts the mount's two growth points are each paired with
their own snapshot, that no resize handler compensates, and that the anchoring rule
is in the sheet with the reason next to it. The two must also stay *out* of the way where a correction would be the
jump itself: below the fold, and on a row the fold cuts in half.
And **`renderCardContent()` must not wipe `.card-sandbox`** — it hides the face
(`face.hidden = true`) instead of `innerHTML = ''`, because the face is what a
parked or evicted card has to show again, and re-creating it would lose the real
description `refreshCardFaceDescriptions()` patched in. Parking is also why
`.card-face[hidden] { display: none }` exists: the face rule sets `display: flex`
and an author rule beats the UA sheet's `[hidden]`.

**Skipped boxes report what they were last shown.** With the UA's anchoring off,
the page has no second opinion about above-the-fold height changes — and every row
above the viewport is a `content-visibility: auto` box whose layout height is either
`contain-intrinsic-size` or the size it last rendered at, because the `auto` keyword
remembers. That is why `adjustCardHeight()`'s inline `min-height` is a contract and
not an optimisation: a row that has been rendered once carries its true height in the
document *while skipped*, so un-skipping it on the way back into view changes nothing
and cannot shove the reader. The one height a skipped row does not carry is a tool's,
which is why the park stores `data-parked-min-height` instead of re-measuring a
face, and why every host-side height change — `parkCard`, `resumeParked`, both mount
mutations, and `showCardError` — is a snapshot taken immediately before the mutation
and a `noteRowHeight` immediately after. `retryLoadCard()` is the one class flip with
no pair, on purpose: it re-tiles a card whose error block is still the content, so
there is no material delta, and the mount that follows is paired already.

**ID collisions across cards.** All 1195 share one DOM. See §3. A parked subtree
keeps its real ids — it is still in the document, which is exactly why
`document.getElementById` inside a sleeping tool keeps working; moving content
out of the grid is not moving it out of the page.

**Sparse checkout gives false "broken image" results.** `images/` is ~50 MB and
usually excluded. Local tooling will report those images as 404. Always confirm
against the live site with `curl` before "fixing" a missing image — several
files reported broken locally are present and serving 200 in production.

**Filenames contain spaces and en-dashes.** e.g. `images/SOSMrWolfs 21.jpg`,
`images/carling academy, bristol.jpg`. Quote paths; URL-encode in HTML and XML.

**A literal `%` in a filename is served doubly-encoded.** `staff/claims/`
files store the branch slash as `%2F`, so the published URL is
`…/arena%252F01a0…json` — requesting it with a single `%2F` decodes to a
slash before routing and 404s on a file that exists (issue #91). Any tooling
that turns repo paths into URLs must encode each path segment; see
`encodeRelUrl()` in `scripts/check-production.js`.

**`guide.txt` is stale.** 69 KB of historical notes. This document supersedes it.

**`hokidea.html`** is a 145-byte scratch file with no `<title>` and no `lang`.
Harmless, not linked, left deliberately.

---

## 8. Working on this repo

### Clone (the repo is large — always go sparse)

A full clone pulls ~125 MB, mostly `images/`.

```bash
chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519   # if using SSH

git clone --depth 1 --filter=blob:none --sparse \
    git@github.com:mrpr0phecy/mrpr0phecy.git r
cd r

# Music work (skip images and the 1195 cards):
git sparse-checkout set --no-cone '/*' '!/images/' '!/cards/'

# Tool work (skip images only):
git sparse-checkout set --no-cone '/*' '!/images/'

git config user.name  mrpr0phecy
git config user.email mrpr0phecy@users.noreply.github.com
```

Cone mode does not work here: `git sparse-checkout set cards index.html` fails
with *"'index.html' is not a directory"*. Use `--no-cone` with leading-slash
patterns.

### Test locally

```bash
python3 -m http.server 8891     # then open http://127.0.0.1:8891/listen.html
```

Serve over HTTP rather than opening files directly — `file://` breaks `fetch()`
of `cards.json` and gives misleading CORS errors.

Worthwhile automated checks before pushing — **the easy way is
`bash scripts/verify.sh`**, which runs the catalogue audit, placeholder, link,
sitemap, SEO and secret scans below (safe on sparse checkouts; `--live` adds
production curls). The individual manual checks:

```bash
# JS syntax inside a page (extract each <script> and run node --check)
node --check extracted.js

# Placeholders that must never ship
grep -rlE 'dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|YOUR_' --include=*.html .

# target=_blank missing rel=noopener
grep -oE '<a [^>]*target="_blank"[^>]*>' page.html | grep -v noopener

# Validate the sitemap parses
python3 -c "import xml.etree.ElementTree as E;print(len(list(E.parse('sitemap.xml').getroot())))"
```

Headless browser checks (Playwright) are worth it for anything interactive:
assert zero `pageerror`s, zero images with `naturalWidth === 0`, and that
expected elements exist.

### Verify after pushing

Pages takes 30–60s. Do not trust a green push. The **production monitor**
(`scripts/check-production.js`) does this loop properly: it compares the
deployed bytes with this repository, parses the live catalogue and sitemap,
checks the custom 404 and the https upgrade, and raises one alert issue when
anything stops matching.

```bash
node scripts/check-production.js            # full contract against the live site
node scripts/check-production.js --sample 12 --json /tmp/report.json
```

It runs by itself on every push to `main` — waiting 45 s for Pages and then
retrying mismatches for about a minute, so propagation is not an alarm — and
every six hours (`.github/workflows/production-monitor.yml`), and its failure
modes are pinned
offline by `scripts/tests/production-monitor.test.js` (section 20 of
`verify.sh`). What to do when it fails is in
[docs/OPERATIONS.md](docs/OPERATIONS.md) — triage table, rollback, fix-forward.
Keep the manual probes for the case where the monitor itself cannot run:

```bash
sleep 50
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

---

## 9. Current state and known work

**Added 2026-09-19 — the per-tool pages are generated now, and generating them
exposed two live defects.** `staff/OPEN.md` P1-R2 has called the gap since the
rebaseline: every tool is a fragment behind `tool.html?card=<slug>`, a
query-param URL rendered by JavaScript, so a non-JS crawler sees a shell. The
pilot answered it for three tools with hand-written pages. Those pages now come
out of **`scripts/build-tool-pages.py`** (content in
`scripts/tool-pages.json`, drift gate in `verify.sh` §16), which is what makes
the surface scalable at all.

Proof the generator is faithful: rendering the three pilot pages from the
extracted source **reproduced them byte-for-byte** except the generated-file
marker — and the two differences it did find were defects on live pages:

- `tools/compound-interest.html` shipped a **duplicated run of footer links**
  (Press/Index/Popular/New/Use case, twice). The chrome is code now.
- `tools/mortgage.html`'s `FAQPage` structured data asked *"Do overpayments
  reduce my **mortgage** payment or my term?"* while the visible FAQ said *"…my
  payment…"*. Structured data must match what the reader sees. The FAQ is
  rendered **once** and used for both the page and the JSON-LD, so they cannot
  drift again — and `tool-pages.test.js` now compares them word for word.

Three new pages: **`tools/loan.html`**, **`tools/bmr.html`**,
**`tools/percentages.html`**. They were picked from `popular.html`'s own
"most-opened" list, because that is the only demand evidence in the repo —
Search Console is P0-M1 and still an owner task. **Deliberately not done:**
mass-generating 1194 thin pages. P1-R2 says start with the tools the evidence
names; the marginal cost of a page is now the content, not the markup, so the
list grows when real query data arrives.

Two consequences worth keeping: a page may declare a `compute` block, and the
numbers in its prose come from the script's own arithmetic via
`{{placeholders}}` — a leftover placeholder fails the build (D-001: published
numbers are derived, never typed); and the tool count in the footer/CTA is
read from `cards.json` instead of being typed into 6 pages by hand.

**Observation, not acted on:** six pages declare `applicationCategory`
`"UtilityApplication"`, which is not a schema.org enumeration value — the
correct spelling is `"UtilitiesApplication"` (used by the new
`tools/percentages.html`). Flagged rather than silently rewritten.

**Changed 2026-09-19 — image weight: 2.30 MB → 0.58 MB across every heavy
asset, with no page repainting a single pixel of layout.** The audit that
prompted this assumed the site shipped a ~1 MB hero and needed a CDN. Both
halves were wrong, and measuring first is what made the change safe: GitHub
Pages already serves from a CDN, and **no product page renders a heavy root
image at all** except `mrprophecypic.jpg` (10 pages) and
`backgroundpic.jpg` (12 language pages) — `logo.png` is referenced by nothing.
Every asset changed here was checked for alpha (`%[opaque]` = true), which is
what makes a palette PNG or a JPEG valid rather than lossy guesswork.

| Asset | Before | After | Where it is used |
|---|---:|---:|---|
| `og-ai.png` → **`og-ai.jpg`** | 447 KB | **78 KB** (−82%) | `og:image` + `twitter:image` on 4 pages (opaque 1200×630 — was never a PNG use case) |
| `icon-512.png` | 219 KB | **87 KB** (−60%) | `manifest.tools.json` |
| `icon-maskable-512.png` | 123 KB | **57 KB** (−53%) | `manifest.tools.json` |
| `logo.png` | 1055 KB | **218 KB** (−79%) | nothing — kept rather than deleted (owner-gated asset) |
| `backgroundpic.jpg` → **+`backgroundpic.webp`** | 263 KB | **165 KB** (−37%) | CSS texture on 12 language pages |
| `mrprophecypic.jpg` → **+`mrprophecypic-600.jpg`** | 206 KB | **89 KB** (−56%) | rendered at 250–300 px on 10 pages; the 1024 file stays for `og:image` (27 pages) |

Deliberate: `og-ai.png` was **deleted** (superseded in the same commit — the
only case where a file's every reference moved to its replacement). The icons
keep their PNG type and exact dimensions because a manifest promises that
type, and PWA installs have been burned by format swaps before. The
`mrprophecypic` split matters: `og:image` at 600 px would be re-upscaled by
every platform, so the rendering size and the sharing size are now different
files on purpose. Signal-to-noise of every conversion was measured
(`compare -metric PSNR`): 35–43 dB, i.e. visually indistinguishable at the
sizes actually rendered.

**Honest limit:** these are shipped bytes, not a measured LCP improvement.
Nothing here was rendered in a real browser or measured in the field — P0-M2
(CrUX PageSpeed baselines, `staff/OPEN.md`) remains the instrument for that
claim, and no field number is asserted here.

**Added 2026-09-02** — a **Sports** category with 53 tools across four batches of
ten. New tools cover cricket (chase + net run rate), football points-needed,
tournament brackets, golf (WHS handicap + Stableford), darts (checkout + 501
average), cycling power/speed, swimming pace/CSS, tennis scorer, basketball
efficiency, youth team rotation, snooker snookers-required, rugby score builder,
running cadence, baseball stats, betting each-way, athletics decathlon/
heptathlon, motorsport (lap time + F1 points), bowling, badminton, volleyball,
ice hockey goalie, powerlifting DOTS/Wilks, table tennis, archery, round-robin
fixtures, rowing erg pace, chess Elo, diving, bouldering, gymnastics, triathlon,
netball, handball, curling, showjumping and weightlifting Sinclair. Thirteen
existing tools were reclassified into Sports (the ten boxing cards,
`premier-league`, `bike-gear-calculator` and `race-pace-predictor`).
`sportsList` in `generate-cards-json.js`; `Sports` in `check-cards.py`; tool
count is now **602** (updated across README, ARCHITECTURE, INCOME, AGENTS,
AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-02** — ten new **Home & DIY** tools: stud framing, board-foot
lumber, stair stringer, roof pitch & rafter, drywall, room BTU/HVAC sizing, miter
& bevel angles, laminate flooring, deck joist span and grout & tile adhesive.
Added to `homeDIYList` in `generate-cards-json.js`; tool count is now **612**
(updated across README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS, index.html,
404.html, tool.html).

**Added 2026-09-02** — a new **Mind-Blowing Demos** category with 10 interactive
demonstrations: Monte Carlo π estimation, Conway's Game of Life, Mandelbrot set
explorer, logistic-map bifurcation, Fourier series synthesis, Galton board
(central limit theorem), Buffon's needle, Lorenz attractor, Barnsley fern and
Euler's identity. Added to `demosList` in `generate-cards-json.js`; tool count is
now **622** (updated across README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS,
index.html, 404.html, tool.html).

**Added 2026-09-02** — a new **Algorithms & Computer Science** category with 10
interactive tools: sorting algorithm visualizer, pathfinding visualizer (BFS/DFS/
Dijkstra/A*), Towers of Hanoi, a neural-network playground that learns XOR, a
Big-O complexity explorer, elementary cellular automata (rules 30/90/110/184),
Huffman coding, a classical cipher suite, recursion & memoization explorer and a
binary/bitwise playground. Added to `csList` in `generate-cards-json.js`; tool
count is now **632** (updated across README, ARCHITECTURE, INCOME, AGENTS,
AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-03** — two more tools: a **laundry care & stain solver**
(fabric-based wash settings, a 12-stain step-by-step treatment guide and a
care-label symbol decoder) and the **Go Outsideometer** (a tongue-in-cheek
cabin-fever gauge with a go-outside prescription). Both join Productivity &
Lifestyle; tool count is now **634** (updated across README, ARCHITECTURE,
INCOME, AGENTS, AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-03** — ten more quirky-but-useful tools, all in Productivity &
Lifestyle: a **Memento Mori life ticker** (your life as a grid of weeks plus
“how many more summers/books/roasts” conversions), a **cost-per-use “should I
buy it”** decider, a **price-in-work-hours** converter (“that coffee = 22 minutes
of your life”), a **Thing Namer** (band/pet/D&D/startup/WiFi/boat/pub-quiz names),
a **houseplant matchmaker**, a **flat-pack confidence meter**, a **3am worry
sorter**, an **emoji-meaning decoder**, a **caffeine half-life bedtime check** and
a **coat-or-no-coat weather** advisor. Tool count is now **644** (updated across
README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS, index.html, 404.html,
tool.html).

**Added 2026-09-05** — ten tools in **SaaS & Business Killers**, each one a
browser replacement for something people pay a monthly subscription for, and
each one fully offline (no network calls, no uploads):

| Card | Replaces |
|---|---|
| `csv-data-studio` | spreadsheet-to-JSON/SQL converters — RFC 4180 parsing, column profiling, chart, 6 export formats |
| `json-to-typescript-interface-generator` | quicktype — JSON → TypeScript / Zod / Python / Go / C# / JSON Schema |
| `image-optimiser-studio` | TinyPNG-style image CDNs — batch canvas resize/re-encode with real byte counts |
| `json-ld-structured-data-generator` | paid schema builders — 10 schema.org types, validation, SERP preview |
| `ab-test-significance-calculator` | Optimizely/VWO calculators — z-test, sample size + duration, Bayesian win chance |
| `startup-runway-burn-rate-simulator` | financial-model spreadsheets — 36-month cash curve, break-even, burn multiple, 3 scenarios |
| `brand-logo-mark-generator` | Looka/Tailor Brands — 22 original icons, SVG/PNG/favicon export |
| `email-signature-generator` | signature SaaS — table-layout HTML, rich clipboard copy for Gmail/Outlook/Apple Mail |
| `business-model-canvas-builder` | facilitated canvas workshops — BMC + Lean Canvas, localStorage, coaching, exports |
| `markdown-slide-deck-builder` | Gamma/Beautiful.ai — text-to-deck with speaker notes, present mode, standalone HTML export |

All ten were added to `saasKillerList` in `generate-cards-json.js` (the category
is 11 → **21**). `sitemap.xml` regeneration now carries an explicit `EXCLUDE`
set for `404.html`, `hokidea.html` and `indexbeta.html` — re-running the §6
script without it silently adds all three to the sitemap. Tool count is now
**654** and the sitemap has **694** URLs (updated across README, ARCHITECTURE,
INCOME, AGENTS, AGENT_ACCESS, index.html, 404.html, tool.html, donate.html,
sponsor.html).

**Added 2026-09-05** — a new **Survival & Emergency Readiness** category with 10
tools for staying safe when things go wrong. These are advice-and-calculation
tools, not first-aid training: each one states the emergency number it relies on
and none of them pretend to replace a professional.

| Card | What it does |
|---|---|
| `water-purification-treatment-calculator` | Storage volumes, bleach dosing in drops and mL, boiling and filtration rules, roof rainwater yield |
| `heat-cold-exposure-survival-calc` | NWS wind chill + Rothfusz heat index, frostbite onset bands, clothing/wetness/activity correction |
| `fire-escape-smoke-safety-planner` | 14-hazard home score, prioritised fixes, printable two-route escape plan |
| `gas-leak-carbon-monoxide-response` | Leak protocol, weighted CO symptom checker, alarm and appliance checklist |
| `poison-chemical-exposure-response` | 22-substance database with route-specific first steps and a read-out-loud call summary |
| `driving-emergency-survival-guide` | 11 emergencies with the trained response and the instinct that makes it worse, plus a flood-depth verdict |
| `emergency-comms-radio-planner` | Radio-horizon range, battery runtime, what to buy, check-in protocol, NATO phonetic and distress vocabulary |
| `evacuation-go-bag-planner` | Three tiers weighed against a quarter-body-weight carry limit, printable checklist |
| `personal-safety-awareness-planner` | Journey risk score, followed protocol, de-escalation wording, Cooper colour code, local incident log |
| `cold-water-ice-drowning-rescue` | Cold-shock/incapacitation/hypothermia timeline, reach-throw-row, ice thickness, rip currents, buoyancy ratings |

Deduped against the existing `crisis-offline-triage`, `household-emergency-plan`,
`scam-sense-checker`, `hike-time-planner` and `food-shelf-life-storage-vault`
cards — no overlap.

Two things worth copying if you add another safety tool. First, `survivalList` in
`generate-cards-json.js` is matched with **exact** `.includes(name)` rather than
the substring `.some(s => name.includes(s))` most other lists use, and is checked
before `homeDIYList`, so no broader list can claim one of these slugs. Second,
every card here had to pass a check that the dangerous folk advice is *absent*:
no "induce vomiting", no mixing bleach, no drinking flood water. That check
strips markup and scans backwards from each match, because a prohibition reads
"Never: a, b, c" — a colon introducing the very list it negates — so splitting on
a colon throws the negation away.

**Fixed while adding them:** `fire-escape-smoke-safety-planner` originally let a
home with **no smoke alarm at all** still score "Needs work", because good habits
elsewhere offset it. Nothing compensates for not being woken up, so `alarm ===
'none'` now floors the risk at 60 ("Genuinely risky") regardless of the rest.

At that point, the tool count reached **664** across **27 categories**, and the sitemap had **704**
URLs (updated across README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS,
index.html including its JSON-LD `ItemList`, 404.html, tool.html, donate.html,
sponsor.html, plus the `KNOWN_CATEGORIES` set in `scripts/check-cards.py` and a
new `count-survival` pill in `index.html`).

**Added 2026-09-07** — ten high-intent, privacy-first web utilities aimed at practical developer, designer and content-creator searches. All are self-contained browser tools in **SaaS & Business Killers** — no API calls, accounts, tracking or uploads:

| Card | What it does |
|---|---|
| `text-case-slug-converter` | Human-readable, code-style and URL-slug case conversion with per-format copying |
| `uuid-ulid-generator` | Cryptographically random UUID v4, UUID v7 and ULID batches with copy/download |
| `unix-timestamp-date-converter` | Seconds/milliseconds ↔ local date, UTC, ISO 8601 and relative time conversion |
| `url-encoder-query-builder` | Component/full-URL encoding plus editable query-string parsing and rebuilding |
| `html-entity-encoder-decoder` | HTML escaping, entity decoding, optional numeric encoding and a Unicode character inspector |
| `lorem-ipsum-placeholder-generator` | Classic or readable placeholder copy in text, HTML or Markdown |
| `text-diff-checker` | Local LCS-based line/word diff with whitespace/case options and copyable unified output |
| `css-box-shadow-generator` | Live visual shadow controls, presets, inset support and copyable CSS |
| `css-grid-layout-generator` | Live grid-track, gap, alignment and featured-cell span controls with copyable CSS |
| `robots-sitemap-generator` | Valid robots.txt and same-host sitemap.xml generation from an entered URL list |

`saasKillerList` then held **31** cards. The catalogue reached **674 tools** across
**27 categories**; `sitemap.xml` had **714 URLs**. Counts, the homepage ItemList,
category pill and supporting page metadata were synchronized.

**Added 2026-09-07, second utility batch** — ten more high-intent, local-first
browser utilities for developer, designer and business workflows. They were
checked against the existing catalogue to avoid duplicating its JSON formatter,
fluid typography and related CSS utilities:

| Card | What it does |
|---|---|
| `css-border-radius-generator` | Linked or independent corner controls, presets and compact copyable CSS shorthand |
| `css-flexbox-playground` | Live direction, alignment, wrapping, gap and item-count Flexbox preview with CSS export |
| `css-filter-generator` | Adjustable CSS image filters, named presets and copyable `filter` declaration |
| `favicon-svg-icon-generator` | Local SVG favicon creation with shape, colours, gradient, character mark and data-URI export |
| `sql-formatter-query-helper` | Browser-only SQL formatter/minifier with indentation and keyword-case controls; never runs a query |
| `mock-data-generator` | Seeded fictional customer, product or event records exported as JSON, CSV or SQL inserts |
| `html-table-generator` | Accessible table markup from editable headers/rows, live preview and safe HTML escaping |
| `curl-command-builder` | Validated HTTP request settings, editable headers, JSON-body validation and shell-safe cURL output |
| `email-subject-line-tester` | Mobile/desktop inbox previews, transparent writing score and editing prompts — not a deliverability claim |
| `css-animation-generator` | Keyframes, timing controls, replayable preview and reduced-motion fallback CSS |

`saasKillerList` now holds **41** cards. The catalogue now has **684 tools**
across **27 categories**; `sitemap.xml` has **724 URLs**. Counts, homepage
structured data, category pills and supporting page metadata were synchronized.

**Added 2026-09-07, inspiration & learning batch** — twelve fun, informative
and educational tools, each pushed in its own commit so the catalogue stayed
usable throughout. All are self-contained and offline (localStorage only):

| Card | Category | What it does |
|---|---|---|
| `speed-reading-rsvp-trainer` | Writing & Language | RSVP word flasher (100–800 WPM) over true science/history passages, with comprehension quizzes |
| `geography-flag-capital-quiz` | Science & Engineering | 40-country flashcards plus capital and flag quizzes with streaks and fun facts |
| `mental-math-sprint-trainer` | Mathematics | 60-second arithmetic sprints, 3 levels, streak bonuses, missed-question review |
| `memory-palace-loci-builder` | Productivity & Lifestyle | Method-of-loci palace builder with walkthrough and self-test modes |
| `daily-curiosity-fact-deck` | Productivity & Lifestyle | 48 verified facts, fact of the day, favourites, category quiz |
| `socratic-thinking-coach` | Writing & Language | Claim interrogator, steelman builder, 10-fallacy spotter quiz |
| `probability-paradox-lab` | Mathematics | Playable + simulated Monty Hall, birthday paradox and coin-streak experiments |
| `kitchen-science-experiments` | Science & Engineering | 10 safe home experiments with steps, real science and safety notes |
| `typing-story-sprint` | Writing & Language | Typing test over educational mini-stories with WPM, accuracy and tricky keys |
| `great-minds-quote-explorer` | Productivity & Lifestyle | 40 quotes with context, themes, search, quote of the day, favourites |
| `logic-detective-puzzle-club` | Mind-Blowing Demos | 8 classic logic puzzles with progressive hints, solutions, rank tracking |
| `story-dice-plot-twister` | Writing & Language | Hero/setting/object/twist dice, challenge constraints, starters, saved prompts |

`mathList` gained 1 card, `writingList` 4, `demosList` 1;
`geography-flag-capital-quiz`, `probability-paradox-lab` and
`kitchen-science-experiments` map to Science & Engineering via the existing
substring lists, and the remaining three default to Productivity & Lifestyle.
Writing & Language is now **51**, Mathematics **30**, Science & Engineering
**124**, Mind-Blowing Demos **11**, Productivity & Lifestyle **113**. The
catalogue now has **696 tools** across **27 categories**; `sitemap.xml` has
**736 URLs**. Counts, homepage structured data, category pills and supporting
page metadata were synchronized.

**Added 2026-09-07, software-3D batch** — twelve quirky tools that render real-time 3D with hand-rolled Canvas-2D maths (zero WebGL anywhere on the site), each pushed in its own commit so the catalogue stayed usable throughout. All are self-contained and offline:

| Card | Category | What it does |
|---|---|---|
| `impossible-object-viewer` | Mind-Blowing Demos | Necker cube, Penrose triangle and endless stairs with the impossible over/under draw order |
| `hypercube-4d-explorer` | Mind-Blowing Demos | Tesseract + 16-cell with XW/YW/ZW 4D rotation sliders and perspective projection |
| `function-terrain-3d-explorer` | Mathematics | z=f(x,y) plotter with a safe recursive-descent parser (no eval) and hypsometric shading |
| `klein-bottle-mobius-lab` | Mathematics | Parametric Möbius (1/3/5 twists), Klein bottle, torus and (p,q) torus knots in points/wire/solid |
| `raycast-pocket-dungeon` | Virtual Worlds & Gaming | Wolfenstein-style DDA raycaster: generated maze, orb pickups, portal exit, minimap, touch controls |
| `polyhedral-dice-3d-roller` | Virtual Worlds & Gaming | True D4–D20 platonic solids; the die physically rotates the rolled face to camera, plus fairness stats |
| `dna-helix-3d-builder` | Science & Engineering | Editable sequence → spinning helix with H-bonds, GC/Tm stats, mRNA + protein translation, mutation button |
| `molecule-3d-viewer` | Science & Engineering | 11 ball-and-stick molecules; bonds auto-detected from covalent radii, double/triple bonds, molar masses |
| `starfield-warp-drive` | Mind-Blowing Demos | Warp-throttle starfield with steering, hyperspace jumps, redshift streaks, exoplanet flyby ticker |
| `heightmap-3d-sculptor` | Interactive Art & Living Worlds | Paint-a-map terrain sculptor: procedural islands/ridges/craters, erosion, animated water |
| `planet-ring-designer-3d` | Astronomy & Space | Gas/rocky/ice/lava worlds with storms, tilted Keplerian rings, moons, generated names |
| `extruded-3d-text-studio` | Productivity & Lifestyle | 3D logo maker with true perspective slice-rendering, extrusion, presets and PNG export |

`demosList` gained 3 cards, `mathList` 2, `slList` 2, `scienceList` 2, `astronomyList` 1, `interactiveArtList` 1; `extruded-3d-text-studio` defaults to Productivity & Lifestyle. Mind-Blowing Demos is now **14**, Mathematics **32**, Virtual Worlds & Gaming **9**, Science & Engineering **126**, Astronomy & Space **11**, Interactive Art & Living Worlds **12**, Productivity & Lifestyle **114**. The catalogue now has **708 tools** across **27 categories**; `sitemap.xml` has **748 URLs**. Counts, homepage structured data, category pills and supporting page metadata were synchronized.

Also in this pass: a responsive hardening of `index.html` — the sticky search input can now shrink (`min-width: 0`), toolbar actions wrap, the directory grid drops to one column at ≤480px, the standalone modal goes icon-only at ≤640px, notifications clamp to the viewport, rating footers get room for their vote counts, and the header dock pills become a horizontal scroll strip at ≤700px.

**Fixed 2026-09-07 — whole cards spinning.** Card fragments share one DOM, and six of them defined a global `.loading` CSS class (notably `censorship-monitor`'s `animation: spin`). The catalogue shell also used `class="loading"` on unloaded card placeholders, so injected card styles made entire cards rotate. The shell now uses `card-pending`, censorship-monitor's live spinner is scoped to `.censor-loading`, and the five dead `.loading` rules (dog-photo-viewer, microbiology, sheet-music, transformer-calculator, youtube-dj) were deleted. Lesson: never use a bare generic class name for shell chrome — any card can hijack it.

**Redesigned 2026-09-07 — aurora glass homepage.** Dramatic pure-CSS overhaul of `index.html` chrome: two slowly drifting aurora background layers, frosted-glass hero panel with an animated sheen title, glass search/dock/category/toolbar pills, smoked-glass cards with neon hover glow, and matching directory/footer/sticky/modal treatments. No IDs, classes or JS behaviour changed — search, filters, lazy-load, toolbox and modal all work as before. Cards deliberately have no per-card `backdrop-filter` (perf with hundreds of cards); translucency carries the effect. `prefers-reduced-motion` freezes all of it via the existing global kill-switch.

**Added 2026-09-16 — Lantern: a measured quality gate, and a duty of care.**

Three things, all in service of the same rule: *nothing about Lantern's ability
is asserted that has not been measured on the shipped page.*

1. **`scripts/lantern-core.js`** — a loader that extracts the inline engine out
   of `ai.html` and runs it in Node against stub browser globals. It
   reimplements nothing: a test or benchmark that uses it is driving the same
   tokeniser, chunker, retrieval stack, tools and guards the visitor's browser
   runs. If `ai.html` is restructured, the loader fails loudly rather than
   silently measuring a copy. `opts.transform` exists only so a benchmark can
   flip one shipped switch off and measure what it was worth (see `--ablate`).

2. **`scripts/evaluate-lantern.js`** — the quality gate, with **24 floors**.
   Fixtures live in `scripts/tests/fixtures/`: `lantern-corpus.json` (28
   documents, one-fact-per-line *and* prose shapes, because both are real),
   `lantern-queries.json` (162 labelled queries across lexical / morphological /
   paraphrase / distractor / multi-answer) and `lantern-duty.json`. It exits
   non-zero below any floor, so a retrieval regression cannot ship green.
   Retrieval is scored at a fixed **character budget** as well as at fixed *k*:
   recall@k systematically favours large chunks, so chunk size can only be
   chosen honestly against recall@budget.

3. **`scripts/tests/lantern-core.test.js`** — the structural contracts the
   floors cannot express: the chunker must terminate on hostile input and must
   not lose a single token (the `end - 1` fallback that used to hang it is a
   regression, not a quirk); `safeEval` must refuse to be a code-execution
   hole; month-end date arithmetic must clamp (31 Jan + 1 month = 28 Feb, and
   29 Feb in a leap year) rather than overflow into the wrong month; the guard
   must stay silent on ordinary questions; and every entry in the duty registry
   must be internally consistent, with every contact populated and every phone
   number matching a real UK format.

**The duty of care** (`DUTIES`, `dutyOfCare`, `dutyBlock` in `ai.html`) is the
part of Lantern that says something nobody asked for. When a visitor's own
message describes a dangerous *situation* — a gas smell, a child not waking, a
throat closing, a dog that ate a box of paracetamol, a bank account being
drained — a notice is placed above the answer with what to do now and who to
call. Measured on the fixture: **fires on 51 of 51 real situations, silent on
51 of 51 benign questions** that share their vocabulary.

The design rules, all of which are tested:

- **It reads only the visitor's message and their own memories — never the
  retrieved corpus.** Indexed documents are other people's text; a first-aid
  leaflet in the knowledge base is not an emergency happening to the visitor.
  `dutyOfCare.length` is pinned at ≤ 2 so a corpus parameter cannot be added by
  accident, and the test passes a fake corpus to prove it changes nothing.
- **A pattern must be a situation, not a topic: a subject and a tense.** The
  first version matched topic nouns and scored a 14% false-positive rate —
  "FAST test", "phishing", "burgled", "priority debts", "power cut" fired on
  training slides, thriller plots, student essays and checklists. Rewritten to
  require *who it is happening to, and now*, it went to 0%. A notice that
  cries wolf on a homework question teaches people to ignore the one that
  matters.
- **Every contact is a real, published UK number with a verification date**
  (`DUTY_VERIFIED`), and the notice names its jurisdiction. An emergency number
  with neither is a rumour. `pet-emergency` therefore ships **no phone number
  at all** — there is no national animal-poison line published the way 999 or
  0800 111 999 are, and inventing a plausible one would be the single worst
  thing this layer could do. The test asserts that stays true.
- **It never diagnoses, never assumes, and never edits the answer.** The notice
  shows the phrase it matched and says plainly that this is a pattern match on
  the visitor's words. It is capped at **two** notices however many duties
  fire, because a wall of helplines is unreadable at 3am.
- **It can be switched off**: `/duty off`, `/duty list`, `/duty reset`, plus a
  per-duty dismissal that persists. A safety feature the visitor cannot leave
  is not a service.

Because the layer never sees the corpus, it is also checked against text it was
*never shown*: the 162 retrieval-fixture questions (0 unexpected fires, floor 0)
and every line of the corpus fixture (0.4%, ceiling 2% — a pasted gas-safety
leaflet firing the gas notice is on-topic rather than absurd, and this is the
cheap direction of error). Both are floors now, so "0% false positives" is not
merely a statement about the registry's own fixture.

Also fixed while measuring: `normaliseUnit` could not resolve plurals or the
British `-re` spelling, so **"convert 5 kilometres to miles" threw
`Unknown unit`** — the single most likely unit question from a UK visitor was
the one that failed. It now tries the obvious singularisations and the
`-re`/`-er` split, but only accepts a candidate that resolves to a unit already
in `UNIT_TABLE`, so a typo still fails loudly instead of being converted as
something else.

**History, because it used to be a gotcha:** `ai.html` was one of seven
documents indexed by a generated "site brain" (`local-ai-knowledge.json`,
4.5 MB, built by `scripts/build-site-brain.py`), so any edit to the page
invalidated the artefact and `verify.sh` failed until it had been rebuilt and
committed. The brain and its builder were deleted on 2026-09-20 — nothing on
the site read them — so editing `ai.html` now carries no such consequence.

**Recently fixed** (2026-08-30): every YouTube embed on the site was a
placeholder — including a Rickroll (`dQw4w9WgXcQ`) sitting in the Marathi page —
now replaced with the real catalogue; a 404'd `og:image`; a mangled duplicated
stylesheet URL and several newline-corrupted JS string literals in
`sonicfansite.html` that broke all scripting on that page; 50 unprotected
`target="_blank"` links; missing canonicals and hreflang across 12 language
pages; insecure `http://` OG URLs; a service worker that could never install;
and a PWA manifest pointing at a 1024px JPEG for its 192px and 512px icons.
`robots.txt` and `sitemap.xml` did not exist at all before this.

Also this date: added **[AGENT_ACCESS.md](AGENT_ACCESS.md)** (agent
authentication & bootstrap), **AGENTS.md** (agent operating manual),
`scripts/agent-auth.sh`, `scripts/verify.sh` (+ catalogue/SEO scanners) and a
check-only `.github/workflows/agent-guardrails.yml`; refreshed the stale tool
counts to the real **500** (README, ARCHITECTURE, INCOME).

Found by the new `scripts/verify.sh` and fixed: `index.html` had **no**
canonical/OG/Twitter/theme-color meta at all — added; `youtubepromo2.html`
canonical + `og:url` pointed at `youtubepromo3.html` on the non-www host —
corrected; four `target="_blank"` links missing `rel=noopener` (bpm-counter,
chord-finder, christmas-card-maker, probability) — hardened.

**Open Source News rebuild (2026-08-30, owner-requested)** — `opensourcenews.html`
now carries: a **live headlines rail** (click any story to play it, category
chips, per-story sources + corroboration count + age, "N stories · M sources"
status); **viewer transport controls** (PAUSE/RESUME — Space, SKIP — N, Esc
pauses, all in the top chrome); **live captions** (source + headline bar,
toggle CC, persisted across reloads); **"READ ORIGINAL" links** to every story's
source article (links are now captured from all three feed parse paths);
**category-agnostic main desk** (previously the desk only narrated `world`, so
science/tech/finance/weather stories never aired); **mute-friendly pacing**
(cards hold for the full story duration instead of cycling every 800 ms);
a visually-hidden `<h1>` (the page had none); and `prefers-reduced-motion`
support, a mobile rail toggle, a `fetchTimeout` fallback for browsers without
`AbortSignal.timeout`, and a `rail-hidden` auto-dodge during sports/weather/
finance segments. Validated in headless Chromium against the real RSS feeds:
124 stories / 35 sources, zero console or page errors.

**Changed 2026-09-19 (stage 4) — the page owns `scrollY`, or it owns nothing.** The
correction added in stage 3 was right about the arithmetic and wrong about who does
it: Blink's scroll anchoring already compensates for content removed above the
viewport, it is on by default, and it does not coordinate with a page that has just
done the same thing — two corrections of one collapse is a jump the same size
backwards. `home.css` now sets `overflow-anchor: none` on the root scroller so the
page is the only compensator, and the other half of what that commits to is done in
the same breath: **mounting a tool grows a row too**, and a row that grows above the
fold shoves the reader down the page just as surely as a collapse. `renderCardContent()`
snapshots before the `card-pending` flip and again before `adjustCardHeight()` widens
the row for late-painted content, one correction per mutation — and a *failed* mount
grows a row too (`showCardError`'s icon, title, detail and Retry button are much
taller than the tile they replace), so it pays the same tax. `aboveTheFold()` moved
onto `canHoldScroll()` (`!touchActive`) so the mount path is guarded by the touch
owner rather than by `collapsePark` — the two flags answer different questions, which
suite 17/18 pin — and the accepted trade (no UA help for content that grows late
inside a tool) is written next to the rule so nobody removes either. Suites 13/14/18
now cover the whole contract in node, including a harness `window` whose `scrollTo`
moves it; the live-window probe (`scripts/staff/live-window-check.mjs`, deleted
2026-09-20 with the staff machinery) gained a computed-style check for the
rule, since the drift measurement in that script is exactly what doubles if
anchoring is ever re-enabled.

**Changed 2026-09-19 (stage 3) — the window closes properly.** Two defects the
park left in its own design, found by re-reading it against the promise instead of
by adding anything. **(1) A parked row kept the height of the tool that lived in
it**, so every screen the visitor scrolled past stayed a scar of tall near-empty
rows: the park saved paint and spent the density the page exists to have. It now
collapses back to a tile — `min-height` lifted off the box, stored as
`data-parked-min-height`, restored verbatim on the way back (a parked sandbox holds
only a face to measure) — and `aboveTheFold()`/`noteRowHeight()`/`commitScrollHold()`
pay for the height in the sweep's own frame, batched per pass, with both
scroll-keyed cursors re-anchored so a correction is never mistaken for scrolling.
Rows below the fold get no correction; a row the fold cuts gets none; `touchActive`
(from `initTouchGuard()`, three passive listeners) defers the collapse while a
finger is still flinging the page; `?park=full` opts out entirely. **(2) Waking was
gated on the mount budget** in both automatic paths, so a tool the reader scrolled
back to could stay parked underneath them while stale rows held every slot: the pass
now wakes first (`wakeInsideWindow()`) and the observer wakes ahead of its budget
check, because a node move is not a fetch. `parkMargin()` gives the two passes a
dead band that survives a short window (never less than the observer's
`REMOUNT_LOOKAHEAD` + 100, and the observer interpolates that constant instead of
carrying its own `600px`), `probeFrames()` governs browsers with no
`long-animation-frame` support, and the governor's throttle starts at `-Infinity`
so a two-second-old page is not told it just shrank. `live-window.test.js` is 17
suites: the scroll arithmetic of a park/wake round trip (5000 → 4272 → 5000, exactly
reversible), the opt-out, the wake path and its detached-shell self-heal, the
no-LoAF probe, the touch guard, and a rect in the harness that answers to the
card's own classes so the geometry is modelled rather than asserted. The three
claims that genuinely need a layout engine — a parked tile's height matching an
unmounted one, the corrected offset against the document the collapse removed, and
a parked canvas keeping its bitmap — are the subject of
the live-window probe (deleted 2026-09-20 with the staff machinery): an optional, manual
probe that served the repo over `node:http`, followed the `STAFF_PLAYWRIGHT` /
`STAFF_CHROMIUM_PATH` convention of `scripts/staff/browser-check.mjs`, and sat outside
`verify.sh` because no
CI here has a browser and the required suite must stay zero-dependency.
`adjustCardHeight()`'s parked guard changed meaning with this: the number it must
not write down is now the *stored* one, since that is what the wake-up restores.

**Changed 2026-09-18 (stage 2) — everything runs, a window is loaded.** Owner
reply to the entry below: *"i do want them all running but only a few loaded at a
time around the viewport."* So the cap became a **mount window**
(`LIVE_AUTO_CAP` is gone; `MOUNT_WINDOW_DEFAULT = 24`, governed 10–40) and the
grid grew a third card state. A mounted tool that leaves the window is **parked**:
its content subtree moves into `#mp-park` — off the left edge,
`visibility: hidden`, never `display: none` — while its shell stays in the grid,
keeping its face and its measured row. So the visible page pays no layout and no
paint for it, nothing about the tool is thrown away (timers keep running, forms
keep their values, `document.getElementById` still finds its nodes), and waking
it is one `appendChild`. `resumeParked()` sits at the top of `loadCard()` —
before the queue, so a parked tool never costs a fetch slot — and
`parkOutsideWindow()` runs inline in the sweep because it measures one rect per
*live* tool rather than the whole pending list. Intent outranks geometry
(`keepAlive()`: hover, focus inside, `data-keep`), and `⚡ Run all` /
`?park=off` switch the whole idea off. `prunePark()` is the only path that
destroys a tool's DOM and it runs only under `performance.memory` pressure,
oldest-parked first — the count alone is never a reason. Window size is decided
by `deviceBudget()` at boot and then by a `long-animation-frame` governor that
narrows the window when frames are long and grows it back on a quiet park pass:
no polling, and no shrinking at all where LoAF is unsupported.
`renderCardContent()` no longer empties `.card-sandbox` — it hides `.card-face`,
which is what lets a parked tile show its face again (see §7); the park also
owns the width its subtree is laid out at, so nothing inside re-wraps while it
waits. `home.css` is 17.1 KB gzip of its 18 KB budget. `live-window.test.js` grew
from 7 suites to 12 (the park's node moves, its refusal rules, the eviction
contract, the CSS that must not hide the park with `display`, and the two-way warm
walk), and `lazy-loader.test.js` suite 6 now pins the window instead of the cap.
The pass is also gated on scroll distance (`PARK_STEP`), which suite 9 asserts by
counting rect reads — the one number that says whether a frame is free. Two
follow-ons landed with it: parked subtrees get their CSS animations paused and
re-played on the way back (`pauseParkedAnimations()` — deliberately *not* a
`requestAnimationFrame` hijack, because stealing frames from the visitor's own
code is how a page starts lying about being live; it quiets the 134 fragments that
animate in CSS and leaves the 168 with their loops alone), and warm-ahead walks
*backwards* when the scroll reverses (`warmDir`, `noteReadingPosition()`,
`CONFIG.WARM_LOOKBEHIND`), since the park made reversing through the catalogue the
normal case.

**Changed 2026-09-18 — the main page is a live window, not a trickle.**
Owner report: *"only nine tools are loading on my mainpage and i have over
1000, this destroys the point of my site."* Diagnosis, from the shipped numbers:
`computeInitialBatch()` returned `min(12, max(6, ceil((viewport+600)/320)))` =
**6** on a 900 px screen; the grid was **one tool per 330 px row**, so a screen
held 2–3 tools and the catalogue was ~400,000 px long; and the only background
path was an idle trickle of **6 mounts per 2.5 s** — ~8 minutes of foreground
time to make one page of 1,194 tools real, at ~15 KB and one `DOMParser` +
script execution each. Nine live tools at the top was not a fetch bug: one verb
(`loadCard` = fetch + parse + run) meant "show the catalogue" and "run the
catalogue" were the same expensive act, throttled to protect scrolling.

Three changes (see §3 "The live window"): mosaic density as the default grid
(~30 tools a screen, a running tool spans the row, `.density-focus` keeps the old
layout), a **mount budget** (`LIVE_AUTO_CAP = 64`, lifted only by a click or
`⚡ Run all`), and **warm-ahead** — a background pass that fetches fragment text
into `cardCache` only, follows the reading position, yields to the mount
pipeline, and lands in the service worker's `CARDS_CACHE` for the next visit.
`applyFiltersCore()` no longer mounts every match either: a Productivity pill
(152 tools) used to queue 152 fetch+parse+execute jobs on one click.
`cardCache` is capped at 96 entries (`pruneCardCache()` keeps running tools);
`gridMetrics()` is the single source for "how many tools is a screen"; the idle
trickle is deleted from both home-app.js and home-features.js. New
`scripts/tests/live-window.test.js` (7 suites, wired into `verify.sh` §15)
pins the geometry, the CSS mirror, the density preference, the cache cap and the
absence of the trickle; `lazy-loader.test.js` gained the budget suite and
`card-faces.test.js` suite 6 now drives warm-ahead. No `index.html` payload
growth beyond the two toolbar controls (`home.css` is 16.2 KB gzip against its
18 KB budget, `index.html` 14.5 KB).

Landed the same day, in the same pass: **`?cat=` / `?category=` and `?view=`
deep links** (`parseIndexDeepLink()` / `applyIndexDeepLink()`, written back by
the pills with `replaceState`), so a category is now a URL a crawler and a phone
can treat as a page — documented in `agents.html` and `llms.txt`. Still open, in
order of what they would buy: **per-category bundle fetches** so "run this
category" is one request instead of a hundred-odd; and a **real-browser pass**
over the mosaic (a 172 px tile, the mount reflow when a tool arrives, and
`⚡ Run all` on a phone — none of which a node harness can see).

**Fixed 2026-08-31 (commits `ce0c880`, `bb32e34`)**

- **hreflang cluster repaired.** `listen.html`, `chinese.html`,
  `japanese.html` and `portuguese.html` declared **zero** alternates while the
  other nine pages pointed at them. Google requires reciprocity, so the whole
  cluster was unreliable. All 13 pages now declare an identical set of 14
  (12 languages + `en` + `x-default`); verified byte-identical across pages.
- **`theme-color`** added to the 12 language pages + `youtubepromo2.html`
  (13 pages had none). Every top-level page now has one.
- **Full SEO blocks** (description, canonical, OG set, Twitter card,
  `theme-color`, JSON-LD) added to 11 pages that were near-bare:
  `aiwalker`, `animation`, `beachsimulator`, `birdapp`, `citysimulator`,
  `clock`, `eternalbeffudlementmachine`, `fightsimulator`, `mpnews`,
  `slideshowtest`, `tool`. `mpnews.html` also got its missing `<h1>`, closing
  the open question below.
- **Visually-hidden `<h1>`** added to the 6 pages that had none.
- **Structured data**: `index.html` gained `WebSite` + `CollectionPage`/`ItemList`
  JSON-LD (20 categories, 500 tools); `thisorthat.html` gained `WebApplication`.
  27 JSON-LD blocks site-wide, all validated as parseable JSON.
- **og:image normalised to 1200×630.** `logo.png` (1054 KB, 1024×1024) and
  `icon-512.png` (219 KB, 512×512) were being used as social cards — wrong
  aspect ratio, so every platform letterboxed them. Replaced with new
  `og-tools.png` / `og-mp.png` (37 KB, 1200×630) on 14 pages. `logo.png` is
  now referenced by nothing and can be deleted.
- **`404.html` added** — the site previously served GitHub's generic page.
  Branded, self-contained (no external requests), `noindex,follow`, links both
  products, respects `prefers-reduced-motion`.
- **Accessibility/perf**: 4 `<img>` tags had no `alt` (now 0 missing across
  151); `loading="lazy"` added to the 12 language-page hero images.
- **sitemap.xml** regenerated: 542 → 540 entries. `hokidea.html`,
  `indexbeta.html` and `404.html` are `noindex` and were removed from it.
- SEO scan warnings: **134 → 20**. The remainder are on two `noindex` pages
  (where the tags are pointless) and `token.html` (left alone deliberately).

**Fixed 2026-08-31, second pass (commits `f9c252c`, `ea5a028`)**

- **Seven cards were completely dead in production.** Each had a JavaScript
  syntax error that killed its entire `<script>` block, so the tool rendered but
  did nothing at all:
  `qrtool`, `social-preview`, `christmas-card-maker`, `ohms-law`, `onerepmax`,
  `oscilloscope` (all the same bug — a botched removal of "AFFILIATE FUNCTIONS"
  left `function xxTrackAffiliate(){});` plus a dangling brace), and
  `proofreading` (`severityColor = var('--accent')` — CSS syntax in JS).
  `math-universe-explorer` also had an unquoted `∞` object key, which is not a
  valid JS identifier. **`node --check` now runs clean across all 473 script
  blocks in all 510 cards.**
- **The catalogue was not 500 distinct tools.** Five pairs of card files were
  byte-identical, and three of them were the wrong tool in the wrong category:

  | File | Listed as | Actually contained |
  |---|---|---|
  | `music-theory` | Music & Audio | 🚚 Ultimate Moving Planner |
  | `lease` | Finance & Money | Lean Body Mass Calculator |
  | `qr` | Productivity & Lifestyle | 📝 Punctuation Mastery Guide |
  | `salarycompare` | Finance & Money | duplicate of `salary` |
  | `essay` | Writing & Language | duplicate of `essay-templates` |

  `sequences-series` was a copy of the Science Quiz Generator sitting in
  Mathematics (zero maths content), and `logarithms` was a *third* sequences
  calculator — so the catalogue advertised a logarithms tool it did not have.
  All seven files were rewritten as genuine new tools: Circle of Fifths
  Explorer, Lease vs Buy, Barcode Check Digit Validator, Take-Home Pay
  Breakdown, Argument Mapper, Sequences & Series, and Logarithm Calculator.
  Four more same-title collisions (`vocab`, `interest`, `unit-converter`,
  `unitconverter`) got distinct titles. **All 500 titles are now unique.**
- **Duplicate element IDs: 244 → 5.** 279 colliding ids renamed across 38 cards
  (prefix + original token, so `cc-voltage` in `cable-length` became
  `cablelcc-voltage`). Since all cards share one DOM these were live bugs —
  `getElementById` could bind to the wrong tool. The 5 remaining warnings are
  template-literal ids (`${item.id}`) that are unique at runtime, not
  collisions.
- **`generate-cards-json.js` was losing data on every run.** `cards.json` had
  been hand-curated, and regenerating silently reverted emoji titles, curated
  descriptions and the whole "Museum & Collection" category — which the script
  did not know about even though `check-cards.py` did. Added a `museumList`,
  hoisted its check above `mathList`/`scienceList` (the substring matcher let
  `'statistics'` and `'energy'` steal two cards), and moved the curated titles
  and descriptions into the cards' own `<h2>`/`<p>` so regeneration is now
  idempotent. `3d-spirograph-nebula` belongs to `interactiveArtList`, not the
  museum.
- **Favicon.** Only 3 of 43 pages declared an icon and `/favicon.ico` 404'd, so
  every page load made a failing request. Generated a real multi-resolution
  `favicon.ico` (16/32/48) and added the existing inline SVG data URI icon to
  all 43 pages — zero extra requests.
- **Dead affiliate link** in `probability.html` pointing at `/affiliates`,
  which 404s, and which INCOME.md's growth policy excludes anyway. Removed.
- **24 meta descriptions were 165–477 chars** (Google truncates around 160).
  All trimmed at sentence boundaries; none are now out of range.
- **Broken reference** in `mrprophecy-name-that-track.html`: `href="listen.html"`
  resolved to `/cards/listen.html` (404). Now `../listen.html`.
- `vocab.html` had **no heading element at all**, so its catalogue title was a
  filename-derived fallback. Added a proper `<h2>`.

**Verification method used** (worth keeping): `jsdom` installed to `/tmp`, never
the workspace, driving each card in a minimal shell. That is what caught the
Lease vs Buy verdict being sign-inverted — totals said buying was £4,595
cheaper while the headline said "Leasing is cheaper". All 7 new tools now pass
15 interaction assertions (valid/invalid EAN-13, log₂(1024)=10, arithmetic and
geometric sums, convergence detection, both lease verdict branches).

**Open — needs a decision or a dedicated pass**

- **17 `<label for=...>` associations point at no element** (they label button
  groups, e.g. `sub-status`, `tdee-gender`). Screen readers cannot associate
  them. Low severity; fix is converting the button groups to radio inputs or
  adding `aria-labelledby`. Since all 644 cards share one DOM, `getElementById` can bind to the
  wrong tool. Worst offenders are whole-file collisions:
  `leanbodymass.html`↔`lease.html` (26 ids), `moving.html`↔`music-theory.html`
  (~40), `essay-templates.html`↔`essay.html`, `salary.html`↔`salarycompare.html`,
  `punctuation-guide.html`↔`qr.html`, `science-quiz.html`↔`sequences-series.html`.
  Looks like cards were copied and their id prefixes never renamed. Mechanical
  to fix (rename prefix + every JS reference) but it touches working tools, so
  it deserves its own commit and a headless-browser check.
- **`indexbeta.html`** — a second homepage-like app ("My Toolbox" UI, no
  `cards.json` fetch), linked from nowhere, competing with `index.html` for the
  same query. Now `noindex,follow` + canonical → `/`, and out of the sitemap.
  Decide whether it ships publicly or goes.
- **`hokidea.html`** — 145-byte stub that hot-linked `https://webneko.net/n20171213.js`
  (third-party JS on your domain, no SRI, no CSP). Wrapped in valid HTML with a
  `<title>` and `noindex`, and removed from the sitemap, but the third-party
  script is still there. Delete the file, or vendor the script locally.
- **Four CV files, none linked from any page**: `CV.docx` (12.8 KB),
  `CV.pdf` (83.8 KB), `cv.pdf` (2393.8 KB), `latestcv.docx` (39.6 KB). On
  Linux `CV.pdf` and `cv.pdf` are distinct files, which is a footgun. ~2.4 MB of
  dead weight; confirm before removing.
- **`viewport-fit=cover` on 1/42 pages, `color-scheme` on 0/42.** Worth adding
  to the full-bleed dark pages for notched phones and native dark scrollbars,
  but it changes layout, so it wants visual testing rather than a blind sweep.
- **`sw.js`** — registered from `initApp()` and governed by the §7 rules. The
  catalogue, card fragments and first-party code go through `freshFast()` (the
  cache may answer only inside GitHub Pages' 10-minute window; after that the
  network decides), binaries stay cache-first, HTML stays network-first, and
  the precache list holds only what the fetch handler reads from it.
  `scripts/tests/service-worker.test.js` drives the shipped handler in
  `verify.sh` §15.
- **8 pages use `i.ytimg.com/vi/<id>/maxresdefault.jpg` as their og:image**
  (both ids verified live today). Fine while the videos exist; if one is ever
  deleted the share card silently breaks.

**Deliberately left alone**

- (Nothing here now forbids touching `opensourcenews.html`: on 2026-08-30 the
  owner asked for it to be upgraded. See the build notes below.)

**Open questions for the owner**

- `mpnews.html` has no `<h1>`, canonical or structured data, and is not in the
  nav cluster. It needs the same treatment the other music pages have had.
- The 12 language pages are thin and machine-translated. Thin translated pages
  can attract a manual action from Google. Either enrich them with genuinely
  localised content or consider consolidating.
- **Element selectors and shared class names inside cards still leak.** All
  1,194 cards share one document, so a card's bare `button { … }`, `input { … }`
  or `h2 { … }` rule applies to every other card and to the page chrome, and
  107 class names (`.actions` in 99 cards, `.row`, `.active`, `.field`, …) are
  defined by more than one card with different meanings. `check-card-css-leaks.py`
  fails on host classes and script-injected styles (the damage class that made
  cards disappear); it does not yet police element selectors or cross-card
  collisions. Fixing those means scoping ~100 cards — the same shape of
  mechanical change as P3-T2, so it needs an owner call before staff start.
- Legacy directories `substitutions/`, `system/`, `digitaldetoxcardshtml/` and
  the duplicate CV files look like dead weight. Confirm before removing.
