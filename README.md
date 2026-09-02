# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 562 free, self-contained browser
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

## Money & monetisation

**[INCOME.md](INCOME.md)** — what actually earns, the real audience numbers,
and what was deliberately not built. Read it before adding anything
money-related.

## Who's here

- **Owner / founder** — `mrpr0phecy` (Russell Head, Luton UK). Final call on
  anything that touches the two products, monetisation, or `opensourcenews.html`.
- **AI agents** — see [AGENTS.md](AGENTS.md) for the handoff log of recent
  agent sessions, and [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution
  on-ramp (applies to humans and agents alike).

## Recent work

- **Marketing & discovery layer (Sept 2026)** — 10 new top-level pages
  (`/popular`, `/new`, `/use-case`, `/tools`, `/help`, `/about`, `/press`,
  `/embed`, `/changelog`, `/sitemap`), 3 long-form blog posts, an RSS feed,
  `llms.txt`, computed related-tools, explicit AI-crawler allow in
  `robots.txt`. See [`changelog.html`](changelog.html) for the dated log.
- **+10 tools (Sept 2026)** — Hike Time Planner, Bike Gear Calculator,
  Photo Exposure Lab, Race Pace Predictor, Baby Sleep Planner, Energy Tariff
  Comparator, Unit Price Comparator, Fluid Type Scale, Fabric Yardage
  Estimator, Car Care Tracker. Total: 562.

## Quick facts

| | |
|---|---|
| Stack | Static HTML/CSS/JS. No build step, no framework, no dependencies. |
| Hosting | GitHub Pages, served directly from `main`. Deploys in 30–60s. |
| Tools | 562, indexed by `cards/cards.json` |
| Categories | 23 |
| Add a tool | Write `cards/<name>.html`, run `node generate-cards-json.js`, bump the count in `index.html` |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
