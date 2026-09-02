# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 612 free, self-contained browser
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

## Quick facts

| | |
|---|---|
| Stack | Static HTML/CSS/JS. No build step, no framework, no dependencies. |
| Hosting | GitHub Pages, served directly from `main`. Deploys in 30–60s. |
| Tools | 612, indexed by `cards/cards.json` |
| Add a tool | Write `cards/<name>.html`, run `node generate-cards-json.js`, bump the count in `index.html` |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
