# Instrumentation — privacy-preserving, zero PII

Most of the 1,395 tools are long-tail: nothing else tells us what people type
that *doesn't* match, which categories get used, or which cards get expanded and
abandoned. The zero-result search log is deliberately the first and most
valuable signal. New tracking, cookies or events require this file's rules and
AGENTS.md §3.

## What is collected — and never

- **Search queries**: debounced ~300 ms, trimmed, lowercased, truncated to 40
  chars for GA4 and 60 for localStorage. Zero-result queries of ≥2 chars go into
  a persistent per-query map (`yorkshire pudding → 14 misses`).
- **Result counts + category** on the `search` event (`result_count`,
  `category` or `surface=discovery`, `device`).
- **Tool views**: `tool_view` + `tool_slug`/`category`, per-slug counter, 500-slug
  cap with pruning. **Tool completion**: best-effort `tool_completion` on submit
  or Calculate/Convert/Generate clicks; cards may call
  `mpLogToolCompletion(slug)` for exact control.
- **Never collected**: IP, fingerprint, cookie, auth, cross-site identifier, raw
  long queries, clipboard, or keystrokes outside the search box. Keys are
  namespaced `__mp_*` and never sent off-device automatically — no outbound POST
  from the page; GA4 batching is `gtag`'s job.

## Where the code lives

- `explore.js`, top block (`logSearch` / `logToolView` / `logToolCompletion`),
  wired in the two places a catalogue is filtered or opened: the `render()`
  tail calls `logSearch(query, count)` for **every** filter pass (so `?q=` counts
  too), and the delegated click on `.xp-open` / `[data-slug]` calls
  `logToolView(slug, category)`.
- `home-core.js`: `mpGtag`, the deploy stamp (`APP_VERSION`), panel open/close
  and the deep-link forward. It no longer logs tool views — the home page runs
  no tools.

## Caps, rails, reading it

GA4 is optional: helpers degrade to localStorage + `console.info` when `gtag` is
absent, and reuse `G-G058FVW6Z2`. `__mp_zero_searches` is a 200-key map
(`{c, last, cat}`, oldest-lowest pruned first); `__mp_tool_views` is a 500-slug
counter with 50-item pruning; no cross-tab sync.

```js
__mpInstrumentation.export()          // zero_top_20, views_top_20, completions_top_20, generated_at
__mpInstrumentation.clear()           // wipe local buffers
__mpDiscoveryInstrumentation.export() // same shape on /discovery.html etc.
```

**Weekly routine:** export from `index.html` and `discovery.html`, keep the
numbers private, sort `zero_top_20` by `c` — each entry with `c ≥ 5` is a
candidate for a new tool, a search synonym, or a promoted deep page
(`tools/<slug>.html` via `scripts/tool-pages.json`). Cross with
`python3 scripts/check-thin-content.py` and prefer deepening high-search thin
tools that are also YMYL.

## GDPR/PECR

This is aggregate telemetry with no identifier and no personal data. The caps,
the 40-char truncation and the no-PII rule are load-bearing review criteria — a
PR that logs a longer string or adds a cookie/ID is blocked. If regulation
tightens, the localStorage path can be removed entirely and the product still
works.
