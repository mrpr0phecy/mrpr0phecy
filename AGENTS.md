# AGENTS.md — start here

Read this once, then inspect the files relevant to the request. Other docs are
reference, not a mandatory reading list. This file owns the local workflow;
section numbers stay stable because code and docs cite them.

## 0. What this is

Static GitHub Pages: no runtime dependencies or deploy build; `main` is live.
- **Product A:** the tool catalogue. `cards/<slug>.html` fragments mount in
  `index.html` / `tool.html`. `cards/` is the catalogue source of truth.
  `ai.html` is Lantern, a separately branded on-device AI.
- **Product B:** MrProphecy music: `listen.html`, its twelve language pages,
  `music.html`, `radio.html`, `sync.html`. Keep the products separate.

## 0.5 Work directly

Make the smallest complete change. Batch edits before checking; don't run the
same suite after every file save. Search by filename or symbol before reading
large files or generated indexes. Don't expand a task into unrelated cleanup.
Choose reasonable implementation details yourself; ask only when intent is
materially ambiguous or a change needs owner approval under §3. No routine
plans, decision ledgers, or extra documentation are required.

## 1. Commands and validation

| Change | Local validation before handoff |
|---|---|
| Instructions/docs/comments only | Review the diff, check changed links/commands, `git diff --check`. No build, browser, or deep audit. |
| Page content or application code | Relevant tests, then `npm run verify` once after the batch. |
| Card | `npm run build`, `node scripts/test-card.js cards/<slug>.html`, then `npm run verify`. |
| Shared loaders, generators, service worker, cross-card changes, or check infrastructure | Relevant tests and `npm run verify:deep` (includes `verify`). Build if generated output is affected. |
| Visible UI | Also inspect the affected page at 360 and 1440 px (§5). |

A doc that feeds generated output still needs its generator. Run additional
checks when the impact is uncertain, not by default. CI runs the fast gate
(7 checks) on pull requests and pushes, and the full `--deep` gate on pushes
to `main` (the deploy) and on a nightly schedule — a small PR gets feedback in
about a minute, and the full sweep stands between any merge and the live site.
A routine push does not require a duplicate local deep run. Never disable a
check to make a change pass.

```bash
npm run build          # regenerate derived catalogue surfaces
npm run verify         # standard gate
npm run verify:deep    # standard gate + full audits and product tests
npm test               # all product tests; or node --test scripts/tests/<name>.test.js
```

## 2. Workspace budget

Keep scratch dependencies and browser output outside the deployed checkout.
Install only what the task needs; doc edits need no setup. Card harnesses and
deep audits need jsdom; screenshots need the other two packages:

```bash
mkdir -p /tmp/tenv
(cd /tmp/tenv && npm install jsdom)
# Only for screenshots, if no suitable browser setup exists:
(cd /tmp/tenv && npm install puppeteer-core @sparticuz/chromium)
```

Scripts look in `/tmp/tenv`. Brand work may need Python extras: see
`brand/README.md`. Report unavailable checks; don't describe skips as passes.

## 3. Keep these protections

Numbers match `CONSTRAINTS.md`, which has explanations and existing exceptions.

1. **Preserve analytics placement.** Don't add, remove, or move `G-G058FVW6Z2`
   without owner approval. Privacy claims must match what the page loads.
2. **No deceptive/platform-breaking growth**, or ads/paywalls on Product A.
3. **Don't delete published tools, pages, redirects, or protected files**
   without owner approval (`ARCHITECTURE.md` §9 lists protected files).
4. **No untrusted `innerHTML`.** Use `textContent` or DOM APIs for URL input,
   error messages, and catalogue strings.
5. **No committed secrets**, credentials, or auth output.
6. **Don't mix music and catalogue content or cross-promotion.**
7. **Regenerate generated files** rather than hand-editing them (§4).

Cards stay offline except existing classifications in `scripts/check-egress.py`.
New tracking/cookies/events require `docs/INSTRUMENTATION.md`. Ask before changing
these protections; routine implementation choices need no approval.

## 4. Common tasks

**Add a tool:** write `cards/<slug>.html`, register its category in
`generate-cards-json.js`, then build and validate per §1. Inspect
`tool.html?card=<slug>` and `&embed=1`. Health/finance tools also need
`docs/TRUST.md`. Optional `scripts/add-tool.sh` automates this but stages all
changes, commits, and pushes (`--no-push` still commits); use only when those
actions are requested and the working tree is appropriate.

**Write a card:** it shares a long-lived document with other tools.
- Use a fragment, not `<html>/<head>/<body>`. Prefix IDs with the slug, wrap
  scripts in an IIFE, and scope CSS under the card root.
- Initialise both during loading and when the document is already loaded.
- Keep appended UI inside the card; clean up listeners/timers. Deferred work
  must check the root still exists in `document`, not just a detached node.
- Give controls accessible names and valid `for`/ARIA references; keep IDs unique.
- No network calls or untrusted HTML (§3). See `CONSTRAINTS.md` for trap examples.

**Edit a page:** preserve the music hreflang cluster; local text changes don't
require rewriting all translations. Home CSS/JS changes need matching `?v=`
values in `index.html`, `APP_VERSION` in `home-core.js`, and `CACHE_VERSION` in
`sw.js` (`check-critical-css.py`).

**Generated surfaces:** `npm run build` owns `cards/cards*.json`, sitemaps,
`tools.html`, `tools-index.{json,html}`, `categories/`, `related.json`,
`embed.html`, `api/tools*.json`, `api/tools/*.json`, `tools/*.html`, `llms*.txt`,
the HOME-FEATURED / HOME-TRENDING / HOME-CATEGORIES blocks in `index.html`, and
published tool counts. Fix the source, then regenerate. `embed-finance.html`
uses `scripts/build-embed-landing.py`; logos/icons/social assets use
`brand/gen_assets.py` (edit `brand/mark.py`; see `brand/README.md`).

## 5. Finish in proportion to the change

For visible UI changes, inspect the affected page at mobile and desktop widths
and exercise the changed interaction; screenshots alone don't prove behavior.

```bash
node scripts/screenshot.mjs "tool.html?card=bmi"
# Writes /tmp/shots/tool-html-card-bmi-{360,1440}.png
```

No screenshots for docs, comments, or non-visual code. In the final summary,
state what changed, checks run, and any failures or unverified behavior. Don't
invent measurements or silently work around failures. No PR ritual is required.

## 6. Reference — open only when needed

| File | When |
|---|---|
| `CONSTRAINTS.md` | Protection details, owner decisions, card lifecycle traps |
| `ARCHITECTURE.md` | Repository map §2, catalogue §3, music/verified video IDs §4, design §5, SEO §6, traps §7, protected files §9 |
| `docs/TRUST.md` | Health/finance tools |
| `docs/INSTRUMENTATION.md` | Analytics/events |
| `docs/BRAND.md`, `brand/README.md` | Naming, visual identity, generated assets |
| `docs/OPERATIONS.md` | Deployment, monitoring, incidents |

Use git/GitHub for history. Don't recreate the removed site brain, staff/AI-dev
facility, task board, or decision ledger unless asked. Outside agents use the
public catalogue indexes; repository coding agents need not read them at startup.
