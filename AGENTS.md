# AGENTS.md — start here

Rules first, reasons in `CONSTRAINTS.md`, reference in §6. Section numbers are
stable: code and docs cite them.

## 0. What this is

Static GitHub Pages — no runtime dependencies, no deploy build; `main` is live.

- **Product A — tool catalogue.** `cards/<slug>.html` fragments mount in
  `index.html` / `tool.html`; `cards/` is the source of truth. `ai.html` is
  Lantern, a separately branded on-device AI.
- **Product B — MrProphecy music.** `listen.html`, its twelve language pages,
  `music.html`, `radio.html`, `sync.html`. Keep the products separate.

## 0.5 Work directly

Smallest complete change; batch edits, then check once (§1). Search by filename
or symbol before opening large files or generated indexes. No unrelated
cleanup, plans, ledgers or extra docs. Choose implementation details yourself;
ask only when intent is materially ambiguous or §3 needs owner approval.

## 1. Commands and validation

| Change | Validate before handoff |
|---|---|
| Docs/comments only | diff review, links/commands, `git diff --check` — no build or audit |
| Page content or app code | relevant tests, then `npm run verify` once |
| Card | `npm run build`, `node scripts/test-card.js cards/<slug>.html`, `npm run verify` |
| Shared loaders/generators/service worker/cross-card/checks | relevant tests + `npm run verify:deep`; build if generated output is affected |
| Visible UI | also inspect at 360 and 1440 px (§5) |

A doc that feeds generated output still needs its generator. Extra checks are
for uncertain impact, not routine. CI: fast 7-check gate on PRs and pushes to
`main`; `--deep` on `main` and nightly. Never disable a check to pass.

```bash
npm run build          # regenerate derived catalogue surfaces
npm run verify         # standard gate (~5 s)
npm run verify:deep    # gate + full audits and product tests
npm test               # all product tests, or node --test scripts/tests/<name>.test.js
```

## 2. Workspace budget

Scratch dependencies and browser output stay outside the checkout; doc edits
need no setup. Card harnesses/deep audits need jsdom, screenshots the others:

```bash
mkdir -p /tmp/tenv
(cd /tmp/tenv && npm install jsdom)
(cd /tmp/tenv && npm install puppeteer-core @sparticuz/chromium)   # screenshots only
```

Scripts look in `/tmp/tenv`; brand work may need Python extras
(`brand/README.md`). Report unavailable checks — a skip is not a pass.

## 3. Keep these protections

Numbers match `CONSTRAINTS.md`, which explains each and lists the exceptions.

1. **Analytics placement is frozen.** Don't add, remove or move `G-G058FVW6Z2`
   without owner approval; privacy claims must match what the page loads.
2. **No deceptive/platform-breaking growth**, or ads/paywalls on Product A.
3. **Don't delete published tools, pages, redirects or protected files**
   without owner approval (`ARCHITECTURE.md` §9 lists them).
4. **No untrusted `innerHTML`** — `textContent`/DOM APIs for URL input, error
   messages and catalogue strings.
5. **No committed secrets**, credentials or auth output.
6. **Don't mix music and catalogue content or cross-promotion.**
7. **Regenerate generated files** (§4) rather than hand-editing them.

Cards stay offline except the existing classifications in
`scripts/check-egress.py`; new tracking/cookies/events need
`docs/INSTRUMENTATION.md`. Ask before changing these protections; routine
implementation choices need no approval.

## 4. Common tasks

**Add a tool:** `cards/<slug>.html`; add the slug to its category list in
`generate-cards-json.js` **first**; `npm run build`; validate (§1); inspect
`tool.html?card=<slug>` and `&embed=1`. Health/finance tools also need
`docs/TRUST.md`; the exact sequence is `ARCHITECTURE.md` §3.
`scripts/add-tool.sh` automates it but stages, commits and pushes (`--no-push`
still commits) — use it only when those actions are wanted.

**Write a card:** fragment only, prefixed ids and top-level names, IIFE wrapper,
CSS scoped under the card root, initialise in both load states, nothing
appended or listening outlives the card, accessible control names, no network
calls or untrusted HTML (§3). Patterns, traps and their checks:
`CONSTRAINTS.md`.

**Edit a page:** preserve the music hreflang cluster (local text edits don't
need translation rewrites). Home CSS/JS changes need matching `?v=` in
`index.html`, `APP_VERSION` in `home-core.js`, `CACHE_VERSION` in `sw.js`.

**Generated surfaces** — `npm run build` owns `cards/cards*.json`, sitemaps,
`tools.html`, `tools-index.{json,html}`, `categories/`, `related.json`,
`embed.html`, `api/tools*.json`, `api/tools/*.json`, `tools/*.html`, `llms*.txt`,
the `HOME-*` blocks in `index.html`, and published counts. Fix the source, then
regenerate; `embed-finance.html` uses `scripts/build-embed-landing.py`, brand
assets use `brand/gen_assets.py` (edit `brand/mark.py`).

## 5. Finish in proportion to the change

Visible UI: inspect the affected page at mobile and desktop widths and exercise
the interaction; screenshots alone don't prove behaviour.

```bash
node scripts/screenshot.mjs "tool.html?card=bmi"   # /tmp/shots/*-{360,1440}.png
```

No screenshots for docs, comments or non-visual code. Final summary: what
changed, checks run, failures or unverified behaviour. Don't invent
measurements or silently work around failures. No PR ritual required.

## 6. Reference — open only when needed

| File | When |
|---|---|
| `CONSTRAINTS.md` | protection details, owner decisions, card traps |
| `ARCHITECTURE.md` | repo map §2, catalogue §3, music/video IDs §4, design §5, SEO §6, traps §7, protected files §9 |
| `docs/TRUST.md` | health/finance tools |
| `docs/INSTRUMENTATION.md` | analytics/events |
| `docs/BRAND.md`, `brand/README.md` | naming, visuals, generated assets |
| `docs/OPERATIONS.md` | deployment, monitoring, incidents |

Use git/GitHub for history. Don't recreate the removed site brain, staff/AI-dev
facility, task board or decision ledger. Outside agents use the public catalogue
indexes; coding agents don't read them at startup.
