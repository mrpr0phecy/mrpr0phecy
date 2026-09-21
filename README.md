# The Most Useful Site in the World + MrProphecy

One GitHub Pages site serving two separate products from the same domain:

- **The Most Useful Site In The World** — 1206 free, self-contained browser
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

## Working on the site

```bash
npm run build          # regenerate every derived file (~8 s)
npm run verify         # the gate: 8 checks, ~4 s — run it after every edit
npm run verify:deep    # + the slow audits (~15 s) — CI runs this on every push
npm test               # the product test suite
```

[AGENTS.md](AGENTS.md) is the one-page rulebook and
[CONTRIBUTING.md](CONTRIBUTING.md) the short guide.

The "Site Staff / AI Developer" facility that used to run from here — profiles,
a scoreboard, a claims ledger, an audit engine and a Mon/Thu workflow — was
removed on 2026-09-20 at the owner's instruction. It was governance about
governance, and no visitor ever saw any of it.

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

The machine guide for outside agents is [`agents.html`](agents.html): the
manifests, URL patterns and embed codes. The catalogue-side retrieval brain it
used to advertise (`local-ai-knowledge.json`, 4.5 MB, plus `learning/` and the
scripts that generated them) was removed on 2026-09-20 — nothing on the site
read it, and `llms.txt`, `cards/cards.json`, `tools-index.json`,
`api/tools*.json` and `related.json` do the same job in a fraction of the
bytes. The former Byte companion pages (`local-ai.html`,
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
