# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 1172 free, self-contained browser
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

## Lantern — the standalone AI

[`ai.html`](ai.html) is **Lantern**, a standalone AI product that runs entirely
in the visitor's browser and shares nothing with the catalogue: its own name,
mark and palette, no catalogue data, no tool recommendations. Type a question
and it answers — grounded in documents the visitor indexes (answers quote them
with citations), plus saved memory, plus real local tools that actually execute
(arithmetic, dates, units, encoding, JSON, regex, hashing). Without a model
installed the answer is composed on the device from that evidence and is
**labelled "composed on device"** rather than dressed up as model inference;
installing the optional on-device WebGPU model (web-llm, started only when the
visitor asks, then cached by the browser) switches the same interface to
generated prose.

Interaction is built for people rather than for demos: a two-minute guided
tour, eight lessons with a glossary explaining how the reasoning methods work,
plain-language starters, a command palette (`Ctrl/⌘ K`), slash commands,
keyboard shortcuts, exportable transcripts, and per-answer actions (copy,
helpful / not helpful with reasons, simpler, deeper, remember, correct,
re-run). Ratings and corrections are learned locally — they update a visible
profile that shapes later answers — and the advanced instruments (agent
pipeline, reasoning lab, prompt studio, saved tools, developer instruments,
model panel) sit behind an *Advanced* area so the default experience is simply
chat. Nothing is uploaded, no account or API key exists, and private memory
stays in the visitor's browser; the live page cannot write back to the
repository.

The checked-in `local-ai-knowledge.json` grounds the *catalogue* brain used by
the machine guide; `learning/approved.json` is the reviewed shared-learning
channel. The former Byte companion pages (`local-ai.html`,
`byte-realistic.html`, `byte-realistic-v4.html`) are `noindex` redirect stubs
to `ai.html`, and the old agent/developer machine guide now lives at
[`agents.html`](agents.html).

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
| Add a tool | Follow ARCHITECTURE.md; generate the index, then re-sync the derived artefacts (`scripts/sync-counts.py`, `scripts/build-sitemap.py`, `scripts/build-home-prerender.py`) and verify |
| Operations | **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — triage, rollback and fix-forward. `node scripts/check-production.js` checks the *live* site against this repository; it also runs after every deploy and every 6 hours, raising one alert issue that closes itself on recovery |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
