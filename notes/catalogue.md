# Catalogue notes

Reusable observations about cards, catalogue generation, safety, calculations
and tool quality. Nobody owns this collection; any contributor may append
evidence-based notes.

## Current baseline

- `cards/cards.json` indexes 1128 card fragments in 27 categories.
- Cards share one DOM in the catalogue, so IDs must be globally unique and
  scripts must be wrapped in IIFEs.
- Cards are offline-first and must not silently send entered values elsewhere.
- `python3 scripts/check-cards.py` checks catalogue coherence.
- `node generate-cards-json.js` rebuilds metadata but category assignment still
  depends on hardcoded filename lists; read `ARCHITECTURE.md` §3 before using it.
- `python3 scripts/build-home-prerender.py` regenerates the home page's first
  screen (head prefetch bootstrap, pre-rendered card shells, per-category count
  badges) from `cards.json`. Run it after any catalogue change; `verify.sh`
  fails on drift. See `ARCHITECTURE.md` §3, "First-screen fast path".

## Field notes

### 2026-09-04 — Existing quality is more valuable than raw catalogue growth

**Context:** The catalogue has grown to 654 tools.

**Finding:** The next useful phase is measuring and improving proven tools,
not generating batches solely to increase the count.

**Evidence:** The catalogue is already broad, while per-tool discovery,
regression tests and standalone crawlability remain roadmap items.

**Follow-up:** Use Search Console and privacy-conscious tool-open events to
choose the first 10–25 tools for deeper testing and landing-page improvements.

### 2026-09-04 — Network behaviour needs a stronger automated boundary

**Context:** Earlier review found QR and translation tools capable of sending
entered data to third parties; the Wi-Fi QR tool was converted to a vendored
local implementation.

**Finding:** “Runs in your browser” is not enough to guarantee private local
processing when a card can call an external endpoint.

**Evidence:** `ROADMAP.md` retains local-only QR work and a network-egress audit
as immediate safety tasks.

**Follow-up:** Extend verification to classify external resources separately
from calls that transmit user-controlled input.

### 2026-09-12 — The home page's first screen no longer waits for cards.json

**Context:** `index.html` rendered nothing but anonymous skeletons until
`cards/cards.json` (516 KB raw / ~136 KB gzipped) had downloaded *and* parsed,
and the first tool fragment was not even requested until 1128 placeholders had
been built. Measured the chain, then removed the serialisation: a generated
head bootstrap (`HOME-FAST-PATH`) starts the catalogue and first-screen
fragment fetches during head parse, and generated card shells
(`HOME-PRERENDER`) let those fragments render without the catalogue. Both are
written by `scripts/build-home-prerender.py` and checked by `verify.sh`.

**Finding:** The cost was ordering, not bytes. The first screen needed ~26 KB
of card fragments but sat behind 136 KB of index it did not depend on. Two
other things fell out of the same measurement:

- Every placeholder copied its full description into a `data-desc` attribute —
  ~190 KB of catalogue text written into the DOM on top of the JSON that
  already held it. `cardsMetaMap` is the only source now.
- 21 of the 27 per-category count badges in `index.html` (and the same table in
  ARCHITECTURE.md §3) had drifted; they summed to 1839 and 644 respectively for
  a 1128-tool catalogue. `updateCategoryCounts()` overwrote them at runtime, so
  the drift was invisible in a browser and visible to every crawler and no-JS
  visitor. The generator owns them now, except `count-all`/`heroToolCount`,
  which stay with `sync-counts.py`.

**Evidence:** No browser could be installed in the sandbox (the Playwright and
Chrome-for-Testing CDNs are unreachable), so this was measured with a jsdom
harness driving the real page and a modelled shared link (fixed TTFB + one pipe
split equally between in-flight transfers; gzip sizes as GitHub Pages serves
them). jsdom has no layout engine, so the IntersectionObserver path is inert and
the first screen is driven by `loadInitialCards()` exactly as it is for the
cards actually in the viewport. Median of 3 runs, milliseconds from navigation
start:

| link profile | first real card | first screen (6 cards) |
|---|---|---|
| fast 4G (40 ms, 6 Mbps) | 869 → **353** | 1344 → **623** |
| slow 3G (150 ms, 1.5 Mbps) | 1784 → **405** | 2462 → **774** |
| zero latency (main thread only) | 415 → 443 | 822 → **669** |

Cost: the document grows 46.4 → 51.0 KB gzipped (eight real card shells), and
on slow 3G the *whole* catalogue finishes ~140 ms later because the tail now
yields to the first screen. Field numbers (CrUX / Lighthouse) were not
available here and should be checked before repeating these figures publicly.

**Follow-up:** Remaining candidates are in ROADMAP.md under catalogue loading.
The largest is the ~32 KB of render-blocking CSS that only styles components
which are hidden at load — moving it out needs a real browser to verify, since
the rules that hide those components must stay critical or they flash.
