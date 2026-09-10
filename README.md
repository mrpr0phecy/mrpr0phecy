# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 1144 free, self-contained browser
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

## Site Staff / AI Developer

**[STAFF.md](STAFF.md)** is the operations entry point: the site's purpose,
accountable specialist profiles, work claims, handovers and binding decisions.
The permanent **AI Developer** workflow runs Mon & Thu 06:00 UTC or on demand.
It gathers evidence, prioritises useful work and can propose verified numeric
count maintenance — not unreviewed generated tools.

```bash
node scripts/ai-developer.js staff    # missions, responsibilities, review limits
node scripts/ai-developer.js plan     # read-only audits + actionable priorities
python3 staff/scan.py --mine          # cached branch and working-tree overlaps
```

Open `ai-developer/reports/latest.html` for the searchable offline dashboard;
JSON/Markdown evidence is saved alongside it and uploaded as Actions artifacts
even on failed checks. No API key is needed. Profiles are **not** separate live
agents; inherited failing tests are reported honestly rather than hidden.
Scheduled auto mode never calls a provider; optional drafts require an explicit
brief, model, key, passing gates and human review.

[Staff operating guide](staff/README.md) ·
[Automation setup](docs/AI-DEVELOPER-SETUP.md) ·
[Research and rationale](staff/RESEARCH.md)

## Money & monetisation

**[INCOME.md](INCOME.md)** — what actually earns, the real audience numbers,
and what was deliberately not built. Read it before adding anything
money-related.

## Quick facts

| | |
|---|---|
| Stack | Static HTML/CSS/JS. No build step, no framework, no dependencies. |
| Hosting | GitHub Pages, served directly from `main`. Deploys in 30–60s. |
| Tool inventory | Derived from `cards/cards.json`; not a growth target |
| Add a tool | Follow ARCHITECTURE.md; generate the index, sync counts with `scripts/sync-counts.py`, regenerate the sitemap and verify |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
