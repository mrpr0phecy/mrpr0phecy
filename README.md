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

## Working alongside other AI agents

Several agents work this repo simultaneously on `arena/*` branches.
**[staff/](staff/)** is where they coordinate:

- [`BOARD.md`](staff/BOARD.md) — the hand-written conversation: handover
  notes, decisions needed, disagreements. Sign with a role handle
  (`@systems`, `@content`, `@music`, `@seo`, `@legal`).
- [`BRANCHES.md`](staff/BRANCHES.md) — **auto-generated** map of what every
  parallel branch actually changed and which files are contested.
- [`DECISIONS.md`](staff/DECISIONS.md) — settled rules, binding until the
  owner says otherwise.

```bash
python3 staff/scan.py --mine     # what am I colliding with?
python3 staff/scan.py --write    # refresh BRANCHES.md
```

## AI Developer staff

Staff roles and audits are registered in
[`scripts/ai-staff.json`](scripts/ai-staff.json), including the **Visual
Design Expert** who curates the two design languages (ARCHITECTURE.md §5).

```bash
node scripts/ai-developer.js staff    # meet the staff
node scripts/ai-developer.js audit    # run every staff audit
node scripts/ai-developer.js auto     # audit + safe fixes
```

These are run **by an agent in a session**, not on a schedule. The owner
deleted `.github/workflows/ai-developer.yml` (it called a script that did not
exist and failed twice weekly); `agent-guardrails.yml` is the only workflow
left and it only runs checks. More in [AGENTS.md §8](AGENTS.md).

## Legal

**[LEGAL.md](LEGAL.md)** — the compliance register and the rules that keep the
site's claims true. The headline rule: **Google Analytics runs sitewide, so no
page may claim "no tracking", "no cookies" or "100% private"**. Support runs
through [`help.html`](help.html) (searchable FAQ + email); the public legal terms
live on a single [`legal.html`](legal.html) page; health, finance, electrical and
legal-document tools carry automatic risk notices. Read it before adding any
third-party script, disclaimer or claim about privacy.

## Money & monetisation

**[INCOME.md](INCOME.md)** — what actually earns, the real audience numbers,
and what was deliberately not built. Read it before adding anything
money-related.

## Quick facts

| | |
|---|---|
| Stack | Static HTML/CSS/JS. No build step, no framework, no dependencies. |
| Hosting | GitHub Pages, served directly from `main`. Deploys in 30–60s. |
| Tools | 562, indexed by `cards/cards.json` |
| Add a tool | Write `cards/<name>.html`, run `node generate-cards-json.js`, bump the count in `index.html` |
| Legal | One page: [`legal.html`](legal.html). Rules: [LEGAL.md](LEGAL.md) |
| Analytics | Google Analytics via `analytics.js` — so no "no tracking" claims |
| Support | [`help.html`](help.html) — searchable FAQ + email |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
