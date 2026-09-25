# The Most Useful Site in the World + MrProphecy

**1,309 free tools that run entirely in your browser — no backend, no signup, no tracking, no ads.**

Live: **<https://www.themostusefulsiteintheworld.com>** — one static domain, two deliberately separate products that never cross-promote.

- **The Most Useful Site in the World** — 1,309 self-contained tools across **29 categories** (calculators, converters, generators, health, finance, STEM, productivity …). Every tool is a fragment in [`cards/`](cards/) that runs offline in the page; the catalogue at [`index.html`](index.html) → `tool.html?card=` is the entry point. Also [`ai.html`](ai.html) **Lantern** — private, on-device AI that answers from *your* documents and memory, with an optional WebGPU model. Nothing leaves the browser.
- **MrProphecy** — UK hip hop and animated soundscapes from **Luton** — 233 videos, 1,360+ subscribers. Entry point: [`listen.html`](listen.html) → `radio.html` / `youtubepromo.html`.

Zero framework, zero build step in production, zero runtime dependencies. `main` *is* the deploy — GitHub Pages serves it in ~60 s. The repo is mature and stable: tool count is derived from `cards/cards.json`, not a growth target.

---

## 👉 New here?

**AI agents and contributors: start with [AGENTS.md](AGENTS.md)** — one page
with the commands, the hard lines and the common tasks, linking everything
else. **[ARCHITECTURE.md](ARCHITECTURE.md)** is the full reference: repository
layout, how the catalogue works, the verified MrProphecy YouTube data, both
design systems, SEO conventions and the traps that have already cost people
time.

## Working on the site

```bash
npm run build          # regenerate every derived file
npm run verify         # standard gate — after a code/page change batch
npm run verify:deep    # full audits — shared infrastructure changes; also in CI
npm test               # the product test suite
node scripts/screenshot.mjs index.html   # look at a page at 360 and 1440 px
```

AGENTS.md §1–§2 has task-based validation and optional scratch setup (outside the
repository — nothing is ever installed into it).

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
| **Live** | <https://www.themostusefulsiteintheworld.com> · <https://www.mrprophecy.com> (same repo, `CNAME`) |
| **Stack** | Static HTML/CSS/JS — **no build step in production, no framework, no dependencies, no backend**. All 1,309 tools are fragments in `cards/` |
| **Catalogue** | **1,309 tools · 29 categories · 67 top-level pages** — everything derived from `cards/cards.json` via `npm run build`. Tool count is not a growth target |
| **AI** | **Lantern** (`ai.html`) — chat that runs 100% on-device (documents + memory + real local tools, 18 reasoning methods, optional WebGPU model). Private by default |
| **Music** | **MrProphecy** — 233 YouTube videos, Luton-rooted UK hip hop. `listen.html` is the hub, 12-language hreflang cluster |
| **Hosting** | GitHub Pages from `main` — push → live in ~60 s. `.nojekyll` keeps dot-paths alive |
| **Quality gate** | Task-based local validation (AGENTS.md §1) · CI: fast gate on every commit, `--deep` on merge + nightly, production monitor on the live site |
| **Operations** | **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — triage / rollback / fix-forward. `node scripts/check-production.js` probes the *live* site after every deploy and every 6 h (self-closing alert issue) |
| **Add a tool** | `bash scripts/add-tool.sh <slug> "<Category>" "<msg>"` or by hand per `AGENTS.md` §4, then build, smoke-test and verify per §1 |

## Local preview

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/
```

Serve over HTTP rather than opening files directly — `file://` breaks the
`fetch()` that loads the tool catalogue.
