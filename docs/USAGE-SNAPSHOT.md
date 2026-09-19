# Usage snapshots (pointer #10)

Paste the weekly export here. Keep the last ~8 weeks so trends are visible.

## How to collect

In the live site's browser console (production domain):

```js
__mpInstrumentation.export()
__mpDiscoveryInstrumentation.export()
```

Copy the returned `{ zero_top_20, views_top_20, … }` and paste below.
Also note the thin-content median from `python3 scripts/check-thin-content.py`.

## 2026-09-19 — baseline (no live data yet)

```
# quick counts — 2026-09-19
# cards median 117 words, 71/119 YMYL without E-E-A-T, 6 deep pages
# api/tools 1194 specs, sitemap 1307 urls
```

- Views: (first export goes here)
- Zero-result: (first export goes here)
- Notes: instrumentation ships this deploy; expect first real snapshot after ~7 days of GA4 `search_zero` + localStorage data.

## Template for next weeks

```
## 2026-MM-DD — demand snapshot
zero_top: <paste 10>
views_top: <paste 10>
completions_top: <paste 10 if available>
median card words: <from check-thin-content>
YMYL without signal: <from check-thin-content>
deep pages: <ls tools/*.html | wc -l>
sitemap urls: <grep -c '<loc>' sitemap.xml>
notes: <one line — what to build next>
```
