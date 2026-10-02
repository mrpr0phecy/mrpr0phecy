# AGENTS.md — start here

The only file an agent must read; § numbers are cited by code and docs, so they
stay stable. Everything else is reference (§6).

## 0. What this is

Static GitHub Pages — no runtime deps, no deploy build; `main` is live.

- **Catalogue (Product A):** `cards/<slug>.html` fragments mount in `index.html`
  / `tool.html`; `cards/` is the truth. `ai.html` is Lantern, a separate
  on-device AI.
- **Music (Product B):** `listen.html` + twelve language pages, `music.html`,
  `radio.html`, `sync.html`. Never cross-promote the products.

Make the smallest complete change; batch edits before checking; search before
reading large or generated files; no unrelated cleanup. Decide routine details
yourself; ask only when intent is materially ambiguous or §3 needs owner
approval. No plans, ledgers or extra docs.

## 1. Validate in proportion to the change

| Change | Before handoff |
|---|---|
| Docs/comments | diff review, changed links/commands, `git diff --check`; no build or browser |
| Page/app code | tests → `npm run verify` once per batch |
| Card | `npm run build`, `node scripts/test-card.js cards/<slug>.html`, `npm run verify` |
| Shared loaders, generators, `sw.js`, cross-card, check infra | tests → `npm run verify:deep`; build if generated output changes |
| Visible UI | also 360 & 1440 px (§5) |

`build` regenerates derived surfaces · `verify` 7 checks (~5 s) · `verify:deep`
adds audits and product tests (~75 s) · `test` runs the product suite
(`node --test scripts/tests/<name>.test.js` for one file). Extra checks only
when impact is uncertain. CI: fast gate on PRs and pushes, `--deep` on `main`
and nightly. Never disable a check; docs that feed generated output still need
their generator.

## 2. Scratch space

Nothing installed in the repo; scripts look in `/tmp/tenv`. jsdom for the card
harness and deep audits; the other two for screenshots only. Brand extras:
`brand/README.md`. Report unavailable checks — a skip is not a pass.

    mkdir -p /tmp/tenv && (cd /tmp/tenv && npm install jsdom)
    (cd /tmp/tenv && npm install puppeteer-core @sparticuz/chromium)   # screenshots only

## 3. Hard lines

`CONSTRAINTS.md` has the reasons, exceptions and enforcing check — open it only
if your change touches one of these lines.

1. `G-G058FVW6Z2`: never add, remove or move it without owner approval; privacy
   claims must match what the page loads.
2. No deceptive or platform-breaking growth; no ads or paywalls on Product A.
3. Never delete a published tool, page, redirect or protected file
   (`ARCHITECTURE.md` §9) without owner approval.
4. `innerHTML` never sees untrusted input — use `textContent` or DOM APIs.
5. No secrets, credentials or auth output; rotate anything that reached history.
6. Music and catalogue stay separate, never cross-promoted.
7. Never hand-edit a generated file; fix the source and regenerate (§4).

Cards stay offline except `scripts/check-egress.py` classifications; new
tracking, cookies or events need `docs/INSTRUMENTATION.md`. Ask before changing
a protection.

## 4. Common tasks — read the block that matches the task

**Add a tool:** `cards/<slug>.html` + its category in `generate-cards-json.js`,
then build and validate (§1); check `tool.html?card=<slug>` and `&embed=1`;
health/finance also `docs/TRUST.md`. `scripts/add-tool.sh` commits and pushes
(`--no-push` still commits) — only when those actions are wanted.

**Write a card:** fragment only; slug-prefixed ids, IIFE, CSS scoped to the
card root; init when loading *and* when already loaded; appended UI stays in
the card, listeners/timers cleaned up, deferred work re-checks `document` holds
the root; unique ids, accessible names and valid `for`/ARIA refs; no network or
untrusted HTML. Traps: `CONSTRAINTS.md`.

**Edit a page:** keep the music hreflang cluster (local text edits need no
translation rewrite). Home CSS/JS: `?v=` (`index.html`), `APP_VERSION`
(`home-core.js`) and `CACHE_VERSION` (`sw.js`) move together.

**Generated surfaces:** `npm run build` owns `cards/cards*.json`, sitemaps,
`tools*.html`, `tools-index.*`, `categories/`, `related.json`, `embed.html`,
`api/tools*.json`, `api/tools/*.json`, `tools/*.html`, `llms*.txt`,
`index.html`'s `HOME-*` blocks and
published counts. Fix the source, then regenerate. `embed-finance.html` →
`scripts/build-embed-landing.py`; brand assets → `brand/gen_assets.py`
(`brand/mark.py`).

## 5. Finish

Visible UI: inspect at 360 & 1440 px and exercise the interaction — screenshots
don't prove behaviour (`node scripts/screenshot.mjs "tool.html?card=bmi"` writes
/tmp/shots PNGs). No screenshots for docs or non-visual code. Summary: what
changed, what ran, failures and unverified behaviour — never invent
measurements or hide a failure. No PR ritual.

## 6. Reference — only when needed

`CONSTRAINTS.md` (why a rule exists, owner decisions, card traps) ·
`ARCHITECTURE.md` (map §2, catalogue §3, video IDs §4, design §5, SEO §6, traps
§7, protected §9) · `docs/TRUST.md` health/finance · `docs/INSTRUMENTATION.md`
analytics · `docs/BRAND.md` / `brand/README.md` brand · `docs/OPERATIONS.md`
deploy and incidents.

Use git/GitHub for history. Don't rebuild the removed site brain, staff
facility, task board or decision ledger. Outside agents use the public
catalogue indexes; repo agents need not.
