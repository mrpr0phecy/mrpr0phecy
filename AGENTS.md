# AGENTS.md — start here

The only file an agent must read; § numbers are cited by code and docs, so they
stay stable. Everything else is reference (§6).

## 0. What this is

Static GitHub Pages — no runtime deps, no deploy build; `main` is live.
Two products share the domain and must stay separate (§3 hard line 6).

### Product A — the catalogue (1,379 tools)

`cards/<slug>.html` fragments, mounted by `index.html` / `tool.html`.
Manifest: `manifest.tools.json`. No ads, no analytics on cards.

| Page | Role |
|---|---|
| `index.html` | catalogue home |
| `tool.html` | shared DOM shell — runs one card at a time |
| `tools.html` | interactive catalogue directory |
| `tools-index.html` | plain no-JS directory (what `llms.txt` links) |
| `embed.html` | embed catalogue + licensing funnel |
| `embed-finance.html` | generated finance-licence landing |
| `popular.html`, `new.html`, `use-case.html` | filtered catalogue views |
| `changelog.html` | catalogue changelog |
| `donate.html` | donation appeal |
| `sponsor.html` | sponsorship enquiries |
| `help.html`, `about.html`, `press.html`, `legal.html` | site pages |
| `guides.html`, `guides/*.html`, `case-studies.html` | long-form content |
| `jobs.html` | multi-step tool workflows |
| `agents.html` | machine guide for AI agents |
| `sitemap.html` | HTML sitemap |
| `blog/*.html` | blog posts |

### Product B — MrProphecy music

Manifest: `manifest.json` (the music PWA). GA on every public page.

| Page | Role |
|---|---|
| `listen.html` | music hub — main entry point |
| `music.html` | press kit, bio, booking |
| `radio.html` | continuous player (47 tracks) |
| `sync.html`, `sync-licence.html` | sync licensing |
| `support.html` | direct artist support (tipping) |
| `thisorthat.html` | head-to-head voting game |
| `youtubepromo2.html` | long-form guide — **indexed, deliberate** |
| `luton.html` | local SEO |
| `mpnews.html` | music news |
| `animation.html` | MrProphecy hip-hop animation |
| 12 language pages | `bengali chinese dutch french hindi japanese marathi portuguese punjabi russian spanish thai` |

Noindex music pages (superseded — don't re-index):
`youtubepromo.html`, `youtubepromo1.html`, `youtubepromo3.html`.

### Standalone pages

| Page | Role | Notes |
|---|---|---|
| `ai.html` | Lantern — on-device AI | own brand, no catalogue data |
| `maps.html` | MostUsefulMaps | open-data map engine |
| `opensourcenews.html` | global live news broadcast | open RSS feeds, no backend |
| `token.html` | $MRPROPHECY token page | kept deliberately, no crypto promotion |

### Experiments / personal pages

Ask before deleting any: `supaviewer.html`, `sonicfansite.html`, `riley.html`,
`tattoo.html`, `birdapp.html`, `clock.html`, `beachsimulator.html`,
`citysimulator.html`, `fightsimulator.html`, `aiwalker.html`,
`eternalbeffudlementmachine.html`, `edgeoftomorrow.html`, `government.html`.

### Noindex / redirect stubs

Do not re-index or edit content: `byte-realistic.html`, `byte-realistic-v4.html`,
`local-ai.html` (→ ai.html), `licence-admin.html` (owner console, offline),
`slideshowtest.html`, `supadupaman.html`.

### Infrastructure

| File | Role |
|---|---|
| `404.html` | custom error page |
| `manifest.json` | music PWA manifest (Product B only) |
| `manifest.tools.json` | catalogue PWA manifest (Product A only) |
| `robots.txt` | allow all + sitemap reference |
| `sw.js` | service worker — registered by `home-core.js` |

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
