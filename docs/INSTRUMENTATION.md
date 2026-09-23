# Instrumentation — pointer #3 (privacy-preserving, zero PII)

Why this exists
---------------
Most of the 1260 tools are long-tail. We have no idea what people type that
*doesn't* match, which categories actually get used, or which cards people
expand but never finish. Without that, every roadmap decision is a guess. The
zero-result search log is deliberately the first (and most valuable) signal
we collect.

What is collected (and what is not)
------------------------------------
* **Search queries**: debounced (~300 ms), trimmed, lowercased, truncated to
  40 chars for GA4 and 60 chars for localStorage. No IP, no user ID, no
  cookie. If the search returned 0 results and the query was ≥2 chars, it is
  counted in a persistent per-query map so we learn e.g. "`yorkshire
  pudding → 14 misses`".
* **Result counts + category**: `search` event carries `result_count`,
  `category` (homepage) or `surface=discovery`, and `device`.
* **Tool views**: each successful card expansion (`tool_view` + `tool_slug`,
  `category`) increments a per-slug counter. 500-slug cap with pruning.
* **Tool completion**: best-effort `tool_completion` on form submit or
  `Calculate/Convert/Generate` clicks inside the card sandbox. Cards can also
  call `mpLogToolCompletion(slug)` directly for exact control.
* **What is never collected**: IP, fingerprint, cookie, auth, cross-site
  identifier, raw long queries, clipboard, or keystrokes outside the search
  box. localStorage keys are namespaced `__mp_*` and never sent off-device
  automatically.

Where the code lives
---------------------
* `explore.js` — top block `logSearch / logToolView / logToolCompletion`
  (namespaced `mp…`). Wired in two places, because those are the two places a
  catalogue is filtered or opened:
  1. `render()` tail — `logSearch(query, count)` for every filter pass, not
     just keystrokes in the box, so a query that arrives from `?q=` counts too;
  2. the delegated `click` on `.xp-open` / `[data-slug]` links —
     `logToolView(slug, category)`, which is what the completion signal is
     built from.
* `home-core.js` — `mpGtag` plus the deploy stamp (`APP_VERSION`), the panels'
  open/close events, and the deep-link forward (`?card=` → `tool.html`).
  Since 2026-09-21 it no longer logs tool views: the home page runs no tools.

Caps & privacy rails
---------------------
* GA4 is optional: helpers degrade to localStorage + `console.info` when
  `gtag` is not present. GA4 property `G-G058FVW6Z2` reuses the one already
  on `index.html`.
* localStorage `__mp_zero_searches`: `{ "<query>": {c, last, cat} }`, 200-key
  cap (oldest-lowest pruned first). `__mp_tool_views`: `{ "<slug>": count }`,
  500-key cap with 50-item pruning. No cross-tab sync.
* No outbound POST from the page; GA4 batching is entirely `gtag`'s
  responsibility. The page never phones home under our own domain.

Reading the data
----------------
In any browser console:

```js
__mpInstrumentation.export()
// → { zero_top_20: [["mortgage overpayment", {c:14, last:"2026-09-19", cat:"finance-and-money"}], …],
//     views_top_20: [["bmi", 312], ["mortgage", 189], …],
//     completions_top_20: [["bmi", 41], …],
//     generated_at: "2026-09-19T..." }

__mpInstrumentation.clear() // wipe local buffers
__mpDiscoveryInstrumentation.export() // same shape on /discovery.html etc.
```

Weekly routine (pointer #3):
1. Open `index.html` and `discovery.html` in the browser, paste the export
   above, and keep the numbers somewhere private.
2. Sort `zero_top_20` by `c`; each entry with `c ≥ 5` is a candidate for
   (a) a new tool, (b) a synonym in the search index, or (c) a promoted deep
   page (`tools/<slug>.html` via `scripts/tool-pages.json`).
3. Cross with `python3 scripts/check-thin-content.py` — prefer to deepen
   high-search thin tools that are also YMYL.

GDPR/PECR note
--------------
This is statistical, aggregate telemetry with no identifier and no personal
data. The caps, the 40-char truncation, and the no-PII rule are Load-bearing
review criteria — any PR that logs a longer string or adds a cookie/ID is
blocked by the PR template. Revisit if regulation tightens: the localStorage
path can be removed entirely and the product still works.
