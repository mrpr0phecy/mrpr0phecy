# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 644 free, self-contained browser
  tools. Entry point: [`index.html`](index.html)
- **MrProphecy** — UK hip hop and animated soundscapes from Luton.
  Entry point: [`listen.html`](listen.html)

The two are kept deliberately separate. See the architecture guide before
mixing them.

Live: <https://www.themostusefulsiteintheworld.com>

---

## 👉 New here? Read [ARCHITECTURE.md](ARCHITECTURE.md)

**[ARCHITECTURE.md](ARCHITECTURE.md)** is the full onboarding document — repo
layout, how the tool catalogue works, how to add a tool, the verified
MrProphecy YouTube data, both design systems, SEO conventions, and a list of
traps that have already cost people time.

Start there whether you are a human or an AI agent.

## Scheduled checker

[`.github/workflows/ai-developer.yml`](.github/workflows/ai-developer.yml)
runs Mon & Thu 06:00 UTC (or on demand via *Actions → Run workflow*). It runs
the audits defined in [`scripts/ai-audits.json`](scripts/ai-audits.json),
applies only deterministic fixes, and opens a PR — it never commits to `main`.

```bash
node scripts/ai-developer.js audits   # list the configured audits
node scripts/ai-developer.js audit    # run them
node scripts/ai-developer.js auto     # audit + safe fixes (+ drafts if AI_API_KEY is set)
```

## Money & monetisation

**[INCOME.md](INCOME.md)** — what actually earns, the real audience numbers,
and what was deliberately not built. Read it before adding anything
money-related.

## Quick facts

| | |
|---|---|
| Stack | Static HTML/CSS/JS. No build step, no framework, no dependencies. |
| Hosting | GitHub Pages, served directly from `main`. Deploys in 30–60s. |
| Tools | 644, indexed by `cards/cards.json` |
| Add a tool | Write `cards/<name>.html`, run `node generate-cards-json.js`, then `python3 scripts/sync-counts.py` |

## Checks before you push

`bash scripts/verify.sh` is the gate — 11 checks, green before every push.
CI (`.github/workflows/agent-guardrails.yml`) runs the same ones.

Two things are **generated, never hand-edited** — the tool count and the
sitemap. Both repair themselves:

```bash
python3 scripts/sync-counts.py     # syncs all 49 count claims across 10 files
python3 scripts/build-sitemap.py   # rebuilds sitemap.xml from git
```

Individual scanners, if you want to run one on its own:

```bash
python3 scripts/check-a11y.py     # labels, alt text, rel="noopener"
python3 scripts/check-egress.py   # no card sends your input off-device
python3 scripts/scan-seo.py       # titles, canonicals, OG/twitter metadata
node    scripts/design-audit.js   # design tokens and guard rules
```

> **Why so much automation for a static site?** Because every rule here that
> lived only in a document got broken — the tool count once shipped as nine
> different numbers at the same time. <!-- historical-count --> Rules that
> can fail the build are the ones that hold. See [AGENTS.md](AGENTS.md).

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
