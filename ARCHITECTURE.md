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
  linked to them (found 2026-09-15). Every tracked file is
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
generated signals file plus a drift gate — worth doing deliberately or not at
all, never half-way.

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

**A literal `%` in a filename is served doubly-encoded.** A file whose name
stores a branch slash as `%2F` gets the published URL
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

## 9. Current state

1195 tools in `cards/` across 27 categories, one shared DOM, every derived
surface regenerated by `npm run build`. The gate is `npm run verify` — seven
checks, all of them, ~3 s — and `npm run verify:deep` (~14 s) before a push,
which is also what CI runs on every push and PR.

**Do not delete or rename:** `CNAME` (the custom domain), `sw.js` (unregistered
on purpose), `guide.txt`, `system/`, `substitutions/`, `digitaldetoxcardshtml/`,
the CV files, `opensourcenews.html`, `token.html`, or any tool in `cards/`.
Adding is free; retiring is an owner decision.

This section used to be a 725-line dated changelog — "Added 2026-09-02, ten new
Home & DIY tools…", "Changed 2026-09-18, the main page is a live window…" — and
it was removed on 2026-09-20. `git log` is the changelog. The narrative copy
went stale in place: it cited deleted files, repeated the same rework four
times, and had to be *frozen* against `scripts/sync-counts.py` so its
past-tense counts (562, 622, 1128) would not be "corrected" into lies. History
belongs in git; this file describes the site as it is.
