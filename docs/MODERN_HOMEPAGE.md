# Homepage Modernization — Latest Web Platform (2024-2026)

This document describes the modernization of `index.html` using cutting-edge browser APIs that are now Baseline or widely supported.

## Goals
- Faster perceived performance
- Smoother UX with native browser primitives
- Offline + PWA readiness
- Future-proof CSS
- No breaking changes to `scripts/build-home-prerender.py` or `verify.sh`

## Added Technologies

### 1. View Transitions API (Chrome 111+, Baseline 2024)
- Wraps filtering (`applyFilters`), view mode switching (`setViewMode`), theme/accent changes, and standalone modal open/close in `document.startViewTransition()`
- CSS:
  ```css
  ::view-transition-group(root) { animation-duration: var(--vt-duration); }
  .card { view-transition-name: var(--vt-name); }
  ```
- JS helper `withViewTransition(fn)` respects `prefers-reduced-motion`
- Assigns unique `--vt-name` per card (`card-<name>`) for shared-element morphs

### 2. Popover API + Anchor Positioning (Baseline 2024)
- Palette, Contributions, Toolbox panels now have `popover="auto"` / `manual`
- Buttons use `popovertarget` / `popovertargetaction="toggle"` for native top-layer
- Anchor names:
  ```css
  #stickyToolboxToggle { anchor-name: --toolbox-anchor; }
  .toolbox { position-anchor: --toolbox-anchor; top: anchor(bottom); }
  ```
- JS fallback: if `showPopover` not supported, falls back to `.open` class
- `toggle` event listener syncs active button states when popover closes via light-dismiss
- `::backdrop` styling, `@starting-style` for entry animations (Chrome 117+)

### 3. Container Queries (Baseline 2023)
- `dashboard`, `directoryView`, `toolbox .content` set as containers:
  ```css
  .dashboard { container-type: inline-size; container-name: dashboard; }
  @container dashboard (min-width: 700px) { .card-header h3 { font-size: 1rem; } }
  ```
- Cards now respond to their container, not viewport — essential for single-column layout + toolbox resizing

### 4. Scroll-driven Animations (Chrome 115+, Baseline 2024)
- Cards animate on scroll without JS:
  ```css
  @supports (animation-timeline: view()) {
    .card { animation: cardEnter linear both; animation-timeline: view(); animation-range: entry 0% cover 28%; }
  }
  ```
- Progress bar uses `animation-timeline: scroll(root block)` to grow with page scroll
- Respects `prefers-reduced-motion`

### 5. Speculation Rules API (Chrome 108+)
- `<script type="speculationrules">` prerenders likely next tools:
  ```json
  { "prerender": [{ "where": { "href_matches": "*/tool.html?card=*" }, "eagerness": "conservative" }] }
  ```
- JS dynamically updates rules based on first 6 visible cards after filter
  (`updateSpeculationRules()`, debounced 700 ms by
  `scheduleSpeculationRulesUpdate()` — the rules are prefetch URLs, so
  rewriting them on every keystroke queued six tool-page fetches per
  character). `eagerness: "conservative"` is deliberate: a prerender runs the
  whole standalone page, scripts and all, so at `"moderate"` a mouse crossing
  the grid started page loads while the grid was still fetching cards.
- Uses `postTask` / `requestIdleCallback` to avoid main-thread churn

### 6. Service Worker + Cache API
- `sw.js` (module + classic fallback), now **v5**:
  - `STATIC_CACHE`: precaches exactly `index.html` + `cards-lite.json` — the
    two URLs the fetch handler reads out of it. Everything else used to be
    precached with `cache: 'reload'` (bypassing the HTTP cache) and then served
    from a different cache, so every install re-downloaded `home-app.js`,
    `risk-notices.js` and both fonts (~133 KB) in the background while the
    first screen's tools were still arriving.
  - `FRESH_WINDOW_MS` (10 min, GitHub Pages' own `max-age`): inside it, the
    cached copy answers instantly and refreshes in the background;
    `freshFast()` sends the catalogue tiers, `cards/*.html` and first-party
    `.js`/`.css` to the network once the copy is older, falling back to the
    cache if the origin takes longer than `NETWORK_PATIENCE_MS` (2.5 s) or is
    unreachable. This replaced stale-while-revalidate, which always served the
    previous deploy's copy first — new tools were missing from the grid until
    the visitor loaded the page a second time.
  - Binaries (fonts/images) stay cache-first; navigations stay network-first
    with the cached `index.html` as the offline fallback; navigation preload
    enabled. The `WARM_CACHE` message is gone (both tiers are fetched by the
    page itself and land in the cache through the fetch handler).
  - The page's own assets (`home.css`, `home-deferred.css`, `home-app.js`,
    `risk-notices.js`) are precached into `STATIC_CACHE` — the cache the
    handler serves them from — using `?v=${PAGE_VERSION}` URLs derived from
    `CACHE_VERSION`. They are precached without `cache: 'reload'` because a
    versioned URL cannot be stale, so the precache reuses what the page just
    fetched. Without this, a first visit followed by an offline visit rendered
    the cached HTML with no styles and no app script (the worker had never
    fetched either).
- Registration via `registerServiceWorker()` using `requestIdleCallback` / `scheduler.postTask` / `load` fallback
- Handles offline fallback to cached `index.html`
- `scripts/tests/service-worker.test.js` drives the shipped handler in
  `verify.sh` §15 — a stale catalogue beating the deployed one fails the gate

### 7. CSS @property (Baseline 2023)
- Typed custom properties for animatable glows:
  ```css
  @property --accent-hue { syntax: "<number>"; inherits: true; initial-value: 195; }
  @property --glow-opacity { syntax: "<number>"; inherits: false; initial-value: 0.15; }
  @property --card-y { syntax: "<length>"; inherits: false; initial-value: 0px; }
  ```
- Used for theme transitions, card tilt, border glow

### 8. light-dark() & color-scheme (Baseline 2024)
- `html { color-scheme: dark light; }`
- Tokens:
  ```css
  --surface: light-dark(#f8fafc, #0a0f14);
  ```
- `theme-color` meta with media queries for dark/light
- `color-scheme` meta for browser UI

### 9. :has() (Baseline 2023)
- Parent styling based on child state:
  ```css
  .card:has(.rating-btn.voted) { border-color: ...; }
  .card:has(.card-sandbox-error) { border-color: var(--error); }
  .controls-toolbar:has(.cat-pill.active) { border-color: ...; }
  ```

### 10. Other Modern CSS
- **@layer**: `base, components, utilities, overrides` for cascade control
- **@scope**: scopes card shell styles to `.card` → `.card-sandbox`
- **Nesting**: native CSS nesting (`& .card-header { & h3 { text-wrap: balance; } }`)
- **:is() / :where()**: lower-specificity grouping
- **text-wrap: balance / pretty**: for titles and descriptions
- **field-sizing: content**: for search inputs (when supported)
- **@starting-style**: entry animations for popover/panel
- **content-visibility: auto + contain-intrinsic-size**: performance, already present but enhanced with `contain: layout style paint`
- **subgrid**: `grid-template-columns: subgrid` for footer when supported
- **prefers-reduced-data / prefers-contrast / prefers-reduced-transparency**: respect user preferences
- **scrollbar-color** with `light-dark()`
- **view-transition-name** for search meta, directory, modal

### 11. Modern JS APIs
- **Navigation API**: intercepts `tool.html?card=*` navigations for VT
- **BroadcastChannel**: syncs toolbox across tabs (`toolbox-sync` channel)
- **scrollend** event: more efficient than `scroll` for lazy load + speculation rules update
- **scheduler.postTask / scheduler.yield / requestIdleCallback**: background tasks (`postTask()` helper)
- **ResizeObserver**: already used, kept for grid layout updates
- **IntersectionObserver**: lazy card loading, kept but now complemented by scroll-driven animations
- **Popover API JS**: `showPopover()`, `hidePopover()`, `toggle` event
- **Speculation Rules dynamic update**: updates JSON based on visible cards

### 12. PWA & Performance
- **manifest.tools.json**: modern manifest with `launch_handler`, `handle_links`, `edge_side_panel`, `shortcuts`, `screenshots`, `share_target`, `protocol_handlers`
- **fetchpriority**: `high` for the lite catalogue + first-screen fragments, `low` for the full catalogue (background description feed) and the SW
- **modulepreload** for SW; the app script is an external `defer` file (downloads in parallel with the HTML)
- **content-visibility** + `contain-intrinsic-size` for 1194 cards
- **No render-blocking "expect" link**: the old
  `<link rel="expect" href="#dashboard" blocking="render">` held the first paint
  until `#dashboard` was parsed — 29,885 bytes (16% of the document) after the
  stylesheet — to guarantee a container that JS fills 100+ ms later anyway.
  Removed; nothing above the grid depends on the grid existing at first paint.
- **Import Map**: for future ESM (`idb`, `fuse`)
- **Decoding hints**: prepared for `decoding="async"` on images

### 12b. Split, cached stylesheet (2026-09)

`index.html` used to inline the whole sheet: ~118 KB raw / ~19 KB gzip of CSS
inside the document, re-transferred on every navigation and required in full
before the first paint. It is now two cached files:

- **`home.css`** (~82 KB raw / ~15 KB gzip) — every rule the first paint can
  show; linked **render-blocking** (an unstyled first paint is worse than one
  RTT that overlaps the HTML download) and cached across visits.
- **`home-deferred.css`** (~39 KB raw / ~6 KB gzip) — the rules for containers
  that are hidden until asked for: palette/contributions panels, toolbox and
  its grid/list modes, the directory view, the maximise modal, the no-results
  state, the footer and its music spotlight. Loaded with
  `media="print"` + `onload="this.media='all'"` (plus a `<noscript>` link), so
  it is fetched in parallel but can never delay the first paint.

`index.html` drops from 184,886 B / 32,803 B gzip to ~67 KB / ~14 KB gzip;
first paint is ~14 KB of HTML plus ~15 KB of CSS fetched in parallel, and
repeat visits re-send only the HTML. Both stylesheets and `home-app.js` /
`risk-notices.js` are referenced with `?v=N`, where `N` is `CACHE_VERSION` in
`sw.js` — a page must never run against another deploy's assets.
`scripts/check-critical-css.py` (verify §15) enforces the split: >4 KB inline
blocks fail, every deferred selector must target a hidden container, and the
rules that hide those containers must stay in `home.css`.

### 12c. The app is split too: core + on-demand bundle (2026-09)

`home-app.js` keeps the first screen (catalogue → placeholders → loader →
filter/search → the wiring the grid needs). The UI that no first screen needs —
panels, toolbox, maximise modal, directory view, 36 KB / ~8.7 KB gzip — moved
to **`home-features.js`**, requested at idle with `fetchPriority: 'low'` (or
immediately when a click wants a feature first):

- `initApp()` does not wait for it: the bundle wires its own listeners when it
  lands, and runs the startup `initApp()` used to run for it
  (`initToolbox()`, `initPanels()`, `setupStandaloneModal()`,
  `setupBroadcastChannel()`).
- The core reaches it through eight same-named **delegates** that go via
  `callFeature()`: ready → called directly; not ready yet → the call is queued
  (coalesced for "latest wins" calls) and replayed in order on arrival.
- Shared state and core functions are on `window.__mpHome` (`state` = live
  getters/setters, `fn` = the six core functions the bundle calls).
- `APP_VERSION` in `home-app.js` is the single version for the page's assets:
  it builds `home-features.js?v=<it>` and must equal index.html's `?v=` and
  `sw.js`'s `CACHE_VERSION` (`scripts/check-critical-css.py` compares all three
  and fails otherwise).
- `scripts/tests/app-split.test.js` (verify §15) executes both files in a vm:
  the core must run and schedule the bundle without it, early calls must queue
  and replay, and the state accessors must be live.

### 13. Two-tier catalogue + externalised app (2026-09)
The single 516 KB `cards.json` was the critical path: the grid waited on its
full download *and* parse. The catalogue is now two tiers, both generated by
`node generate-cards-json.js` (the `--check` drift gate covers both):

- **`cards/cards-lite.json`** (~113 KB compact, `{n,t,c}`) — the critical
  path. The grid builds off this; it carries exactly what placeholder shells
  need (name, title, category).
- **`cards/cards.json`** (~536 KB raw / ~141 KB gzipped) — the background
  tier. Fetched at **low priority** in the head bootstrap; its descriptions
  merge into `cardsMetaMap` via `enrichCatalogueDescriptions()` so search
  upgrades from title-only to full-text in place.

The head bootstrap (`HOME-FAST-PATH`) now starts both tiers — lite `high`,
full `low` — plus the first six fragments. `loadCardList()` builds the grid
from the lite tier and falls back to the full tier (then the GitHub API) if
the lite fetch is blocked. The first **twelve** cards are pre-rendered
(`MARKUP = 12`, matching `computeInitialBatch()`'s cap), so the first screen
paints with zero JSON.

The ~125 KB application script is external in **`home-app.js`** (loaded with
`defer` in `<head>`), so it downloads and parses in parallel with the HTML and
is cached separately. `scripts/tests/` extract its real functions
(`lazy-loader`, `home-fast-path`, `lite-tier`, `index-deeplink`, `card-errors`),
so a regression in the shipped loader still fails `verify.sh`.

Net first-visit critical path (gzip proxy for brotli): **~200 KB → ~93 KB**,
and the 141 KB `cards.json` no longer blocks the grid.

### 14. Follow-up wins (2026-09)
- **Inter self-hosted**: `fonts/inter-latin.woff2` (48 KB, `preload` in
  `<head>`, downloads in parallel with the HTML) +
  `fonts/inter-latin-ext.woff2` (85 KB, fetched only when a glyph needs it —
  `unicode-range`). Replaces the serial chain head → Google CSS → woff2
  (~1 RTT + 48 KB behind the head; ~700 ms of font-swap delay on slow 4G).
  `font-display: swap` keeps first paint on the system stack. SIL OFL 1.1,
  licence in `fonts/OFL.txt`.
- **gtag deferred to idle**: the `dataLayer` shim runs immediately (no
  analytics event can be lost), but the ~28 KB `gtag.js` fetch + execution
  no longer competes with the first screen's bandwidth and main thread
  (`requestIdleCallback`, 4 s timeout, `load` fallback).
- **SW v4/v5**: v4 made first-party JS/JSON stale-while-revalidate so a
  deploy could not serve a new page against an old app script; v5 replaced SWR
  for the catalogue, fragments and code with the windowed `freshFast()` policy
  above (SWR was one deploy behind on the first visit after every release) and
  trimmed the precache to what `STATIC_CACHE` actually serves.

## Preserved Contracts
- `HOME-FAST-PATH:BEGIN/END` and `HOME-PRERENDER:BEGIN/END` markers untouched — `build-home-prerender.py --check` still passes
- All existing IDs (`#dashboard`, `#toolbox`, etc.) kept
- No new external dependencies
- All JS wrapped in feature detection — falls back gracefully
- `cards/cards.json` keeps its exact schema — every other consumer (tool.html, embed.html, llms.txt, sitemap, site brain) is unchanged

## Files Changed
- `index.html`: +~800 lines of modern CSS + ~200 lines JS helpers, popover attributes, speculation rules, import map, manifest link; app script moved out to `home-app.js`, preload for `cards.json` removed
- `home-app.js`: new — the homepage application (was inline in `index.html`), now owns the two-tier catalogue load + `enrichCatalogueDescriptions()`
- `cards/cards-lite.json`: new — generated critical-path tier
- `sw.js`: v6 — catalogue/fragments/first-party code via `freshFast()` (cached copy answers only inside the 10-minute window), precache trimmed to `index.html` + `cards-lite.json`; version shared with the `?v=` on the page's stylesheets and scripts
- `home.css` / `home-deferred.css`: new — the split of the old inline `<style>` block (see §12b)
- `home-features.js`: new — panels, toolbox, maximise modal and directory view, out of `home-app.js` (see §12c)
- `scripts/tests/app-split.test.js`: new — drives both files in a vm (core without the bundle, then the bundle against a live queue) and pins the delegate/registration/state contract
- `manifest.tools.json`: new, PWA manifest for tools
- `generate-cards-json.js`: also emits + `--check`s `cards-lite.json`
- `scripts/build-home-prerender.py`: two-tier bootstrap, `MARKUP = 12`
- `scripts/tests/lite-tier.test.js`: new — drives the real two-tier handoff

## Verification
```bash
python3 scripts/build-home-prerender.py --check
# HOME PRERENDER OK

node --check /tmp/check.js
# JS OK

# Manual: open index.html, check:
# - Filtering animates via View Transitions (if supported)
# - Panels open as popover (top-layer, light-dismiss)
# - Cards animate on scroll (if animation-timeline supported)
# - SW registers (DevTools > Application > Service Workers)
# - Speculation rules present (DevTools > Application > Speculation Rules)
```

## Future Enhancements (not yet added, but ready)
- **View Transitions for cross-document** (Chrome 126+): add `pageswap` / `pagereveal` events
- **Document PiP API** for toolbox as Picture-in-Picture window
- **EditContext API** for rich text tools
- **WebGPU** for canvas-based tools (already some tools use Canvas)
- **Shared Storage / Topics** for privacy-preserving personalization
- **CSS Anchor Positioning** for command palette autocomplete
- **Invokers API** (`interestfor`, `commandfor`) when baseline
