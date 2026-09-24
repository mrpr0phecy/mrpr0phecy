# AGENTS.md — start here

The one file to read before working in this repository: what it is, the
commands, the lines you must not cross, and how the common jobs are done.
Everything else is reference you open when a task needs it (§6). Section
numbers are stable — code comments and pages cite them.

## 0. What this is

Two products on one domain that never mix:

- **Product A — the catalogue** (`themostusefulsiteintheworld.com`): 1293
  offline browser tools. Each is a fragment in `cards/`, injected into one
  shared document by `index.html` / `tool.html`. Plus `ai.html` — Lantern, a
  separate on-device AI with its own name, mark and palette.
- **Product B — MrProphecy music**: `listen.html` (the hub) and its twelve
  language versions at the root (`spanish.html`, `japanese.html`, …),
  `music.html`, `radio.html`, `sync.html` — ARCHITECTURE.md §4.

A static GitHub Pages site with zero dependencies and no build step at deploy:
`main` is what is live, byte for byte. `cards/` is the single source of truth —
every count, index, sitemap and generated page is derived from it.

## 0.5 Be bold

Ship the useful version, not the safe-sounding one, and show your working in
the PR: what you measured, what you decided not to do, what you did not verify.
"Not measured" is a valid answer; an invented number is not. If a rule here
slows you down without protecting a visitor, the owner's money or the law,
delete it and say so.

## 1. Commands

```bash
npm run build          # regenerate every derived file, in order (~3 s)
npm run verify         # the gate: 7 checks, ~5 s — after every edit
npm run verify:deep    # + 4 slow audits, ~75 s — before pushing; CI runs it
npm test               # the product test suite on its own
node scripts/screenshot.mjs <page>   # look at it at 360 and 1440 px (§5)
```

Always the whole gate — there is nothing to scope or skip. `verify:deep`
needs jsdom (§2): without it the card-integrity tests fail and the other
jsdom suites skip. These timings are stated here and in `scripts/verify.sh`
only; everywhere else just names the command.

## 2. Workspace budget

Never install toolchains, browsers or `node_modules` into the repository — the
site ships zero dependencies and the checkout is deployed as-is. Scratch
dependencies go outside it, where every script looks first:

```bash
mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom puppeteer-core @sparticuz/chromium
```

jsdom runs the card harness and `verify:deep`; the other two exist only for
`scripts/screenshot.mjs`. Python extras (only `brand/` needs any) go in a
virtualenv outside the repository — see `brand/README.md`.

## 3. Never

The hard lines. They are not judgement calls, and no task relaxes them for
scope, speed or ambition. Code comments cite these numbers; CONSTRAINTS.md has
the reasons and the fine print under the same numbers.

1. **Move analytics.** `G-G058FVW6Z2` stays on exactly the pages that carry it
   — never added, removed or moved — and no page makes a privacy claim that is
   false where it stands: never "no tracking", "100% private", "no cookies" or
   "no analytics" on a page that carries it.
2. **Grow by breaking platform rules** — no view-bots, hidden players, autoplay
   tricks, engagement pods or fake urgency; and no ads or paywalls on Product A.
3. **Delete a tool, page, redirect or protected file** (`CNAME`, `sw.js`, the
   CV files, `opensourcenews.html`, `token.html`, anything in `cards/`). Adding
   is free; the owner decides what leaves.
4. **Put untrusted input into `innerHTML`.** URL parameters, `error.message`
   and `cards.json` strings go in through `textContent` or DOM APIs.
5. **Commit a secret** — a token, key, credential or agent-auth output.
6. **Mix the products** — no music on Product A or in any card, no tool links
   on Product B.
7. **Hand-edit a generated file** (the list is in §4) — re-run its generator.

Also never: send anything to the network from a card (the few exceptions are
classified in `scripts/check-egress.py`), or add a tracker, cookie or analytics
event without writing it up in `docs/INSTRUMENTATION.md` first. Anything that
seems to need an exception is an owner question: ask, then record the answer in
CONSTRAINTS.md.

## 4. Common tasks

**Add a tool.** Write `cards/<slug>.html`, then
`bash scripts/add-tool.sh <slug> "<Category>" "<commit message>" [--no-push]`
registers it, rebuilds, smoke-tests the card in a shared document, runs the
gate, commits and pushes. By hand: add the slug to its category list in
`generate-cards-json.js` **before** building (the script overwrites `category`
from those lists), `npm run build`, `npm run verify:deep`, then look at
`tool.html?card=<slug>` and `…&embed=1` at both widths. A YMYL tool (Health &
Fitness, Finance & Money) also needs the `docs/TRUST.md` checklist —
methodology, primary source, worked example, edge cases, disclaimer,
last-reviewed date — best as a `tools/<slug>.html` deep page rendered from
`scripts/tool-pages.json`.

**Write a card.** The document outlives the card: the next tool loads into the
same page, so anything global survives into it. `verify` enforces every rule
below; CONSTRAINTS.md has the reason and the code for each.

- A fragment — no `<html>`, `<head>` or `<body>`. Prefix every id and top-level
  name with the slug; wrap the script in an IIFE (`check-card-collisions.py`).
- Start with `if (document.readyState === 'loading') … else init()` — the
  `else` is the half that runs in `tool.html` (`check-card-init.js`).
- Append only inside your own container, never to `document.body` or `head`
  (`check-card-leftovers.js`).
- Anything that runs later — a listener on `document`, a timer, an `await`, a
  script's `onload` — first checks `document.getElementById('<your-root>')` and
  bails (or clears its interval) when the card is gone (`test-card.js`).
- Scope every CSS rule under the card's root id (`check-card-css-leaks.py`;
  `scope-card-css.py` fixes a leaking fragment).
- Unique ids, every `for=`/`aria-*` reference resolves, and every control has
  an accessible name (`tests/card-integrity.test.js`).
- No network calls (`check-egress.py`) and no untrusted `innerHTML` (§3.4).

**Edit a page.** Product B's hreflang cluster is 13 pages (`listen.html` and
the twelve languages): change it as a whole, or make a change that cannot read
as a duplicate in another language. Changing the home page's CSS or JS means
bumping `?v=` in `index.html`, `APP_VERSION` in `home-core.js` and
`CACHE_VERSION` in `sw.js` together (`check-critical-css.py` fails otherwise).

**Fix a drifted number or surface.** Never the number — the generator. Owned by
`npm run build`: `cards/cards*.json`, `sitemap.xml`, `sitemap.html`,
`tools.html`, `tools-index.{json,html}`, `categories/`, `related.json`,
`embed.html`, `api/tools*.json`, `tools/*.html`, `llms.txt`, `llms-full.txt`,
`index.html`'s HOME-FEATURED / HOME-TRENDING / HOME-CATEGORIES blocks and every
published tool count. Owned by their own scripts, checked by `verify`:
`embed-finance.html` (`scripts/build-embed-landing.py`) and every logo, icon
and social card (`brand/gen_assets.py`).

**Change the logo.** Edit `brand/mark.py` and regenerate — `brand/README.md`
has the steps; `brand/check-mark.py` fails on a hand-edited asset.

## 5. Done means looked at

A change is finished when `npm run verify:deep` passes and you have looked at
what you changed at 360 px and 1440 px. Static checks never substitute for
looking:

```bash
node scripts/screenshot.mjs "tool.html?card=bmi"   # /tmp/shots/tool-html-card-bmi-{360,1440}.png
```

It serves the repository itself, blocks off-site requests, emulates reduced
motion and prints page errors; `--full`, `--dpr 2`, `--scroll <y>` and
`--widths` are documented in its header. Emoji render as empty boxes in its
Chromium — that is the browser, not your change. If you broke something you
cannot fix in two attempts, say so plainly in the PR instead of working around
it quietly.

## 6. Where the rest lives

| Open | for |
|---|---|
| `CONSTRAINTS.md` | why the hard lines are where they are, owner decisions, the card traps with code, open questions |
| `ARCHITECTURE.md` | how the site is built: repository map §2, catalogue §3, music §4, design §5, SEO §6, traps §7, protected files §9 |
| `docs/TRUST.md` | YMYL tools |
| `docs/INSTRUMENTATION.md` | analytics and events |
| `docs/BRAND.md`, `brand/README.md` | naming, voice, the logo and its kit |
| `docs/OPERATIONS.md` | deploys, the production monitor, incidents |

History is `git log` and `gh pr list`: nothing in the repository tracks status,
and no document tells you what to do next. Deleted on purpose — do not rebuild
them without the owner asking: the site brain (`local-ai-knowledge.json` and
its builders; outside agents use `llms.txt`, `cards/cards.json`,
`tools-index.json`, `api/tools*.json` and `related.json`), the staff /
AI-developer facility, and the task board and decision ledger. GitHub access in
a fresh session: `bash scripts/agent-auth.sh`.
