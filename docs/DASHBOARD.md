# Dashboard — pointer #10 (metrics we actually look at)

We don't have a hosted analytics warehouse. The dashboard is a weekly ritual
that can be done with two files, one script, and ten minutes in two consoles.

## The four tiles that matter

1. **Zero-result searches (demand)** — `__mp_zero_searches` localStorage map
   plus GA4 `search_zero` events. The `c` column is candidate tool demand.
   Source: `docs/INSTRUMENTATION.md` → `__mpInstrumentation.export().zero_top_20`.

2. **Thin × demanded tools** — cross of (1) with
   `python3 scripts/check-thin-content.py`. A 60-word fragment that gets 20
   zero-result hits a week is more valuable than a 600-word page nobody
   searches for.

3. **Deep-page coverage** — count of `tools/*.html` vs YMYL backlog
   (today: 6 of 119 YMYL tools have a deep page). Tracked by
   `ls tools/*.html | wc -l` and the `YMYL without E-E-A-T signal` line in
   `check-thin-content.py`.

4. **Crawlability & freshness** — `sitemap.xml` count vs `cards/*.html`
   fragment count (both should be 1194) and `llms.txt` / `api/tools.json`
   updated on the same deploy. Verified by `bash scripts/verify.sh` +
   `python3 scripts/check-thin-content.py --json`.

## Weekly run (10 minutes)

```bash
# 0. Build + verify still pass (CI already does this; re-run locally if you touched cards)
npm run build && bash scripts/verify.sh && node scripts/build-tool-specs.js --check

# 1. Content health
python3 scripts/check-thin-content.py
# → note median words, count under 150/300, and YMYL without signal

# 2. Demand (do this in the live site's browser console, then paste)
__mpInstrumentation.export()
__mpDiscoveryInstrumentation.export()
# → copy zero_top_20 into docs/USAGE-SNAPSHOT.md (or a private sheet)

# 3. Coverage
ls api/tools/*.json | wc -l        # 1194
ls tools/*.html | wc -l            # 6 today
grep -c '<url>' sitemap.xml        # 1194 tools + cats + guides
```

Append a 5-line entry to `docs/USAGE-SNAPSHOT.md`:

```
## 2026-09-19 — demand snapshot
- zero_top: mortgage overpayment (14), yorkshire pudding (9), ...
- median card words: 117 (check-thin-content)
- YMYL without signal: 71/119
- deep pages: 6
- sitemap: 1284 urls, build OK
```

## What "good" looks like

* `zero_top` trends toward novel long-tail, not the same ten misses.
* Median card words rises because *deep pages* get added — not because
  fragments are padded with filler.
* YMYL without signal drops by ~10/month until under 10.
* `search_zero` events in GA4 mirror localStorage top-20 (sanity check).

## What we don't build

* No cohort, no funnel, no user ID. Pointer #3 explicitly rejects PII.
* No self-hosted warehouse until the weekly ritual actually hurts. When it
  does, the export JSONs are already the right shape to pipe to a store.
