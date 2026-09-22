# CONSTRAINTS.md — the things you cannot know from the code

Short by design. This file holds **only** facts an agent cannot discover by
reading the repo or running the checks — owner decisions, and traps whose
reasons are invisible. Everything else lives in code, in checks, or in git.

If you want to know *what happened*, use git and GitHub — `git log`,
`gh pr list`, `gh issue list`. Don't write status reports into the repo.

---

## Hard safety lines

The only hard rules in this repository. Everything else is a judgement call —
which is why AGENTS.md §0.5 tells agents to be bold. These are not judgement
calls, and no session may relax them for scope, speed or ambition:

1. **Analytics stays exactly where it is.** `G-G058FVW6Z2` loads on the pages
   that already carry it and nowhere else — never added, never removed,
   never "temporarily" moved. Because it exists, never write "no tracking",
   "100% private", "no cookies" or "no analytics" on a page carrying GA.
2. **No ToS-violating growth.** No view-bots, hidden players, autoplay
   tricks, engagement pods, fake urgency.
3. **Never delete a tool or a protected file** without the owner saying so
   first — `CNAME`, `sw.js`, the CV files, `opensourcenews.html`,
   `token.html`, anything in `cards/` (the full list is ARCHITECTURE.md §9).
   Adding is free; retiring is not.
4. **Never interpolate untrusted input into `innerHTML`** — URL params,
   `error.message` and `cards.json` strings go in via `textContent` or DOM
   APIs.
5. **No secrets in commits**, ever — no tokens, no agent-auth output, no keys.
6. **Products A and B stay separate** — no music players, artist banners or
   cross-promo on the tool catalogue or any card; no tool links on the music
   pages.
7. **Generated artefacts are only written by their generators** — tool counts,
   `sitemap.xml`, `index.html`'s HOME-FEATURED/HOME-TRENDING/HOME-CATEGORIES
   blocks and `cards.json` categories are never hand-edited.

Anything that looks like it needs an exception to one of these is an owner
question: ask in the session, and record the answer here. This file is the only
decision ledger left — `staff/DECISIONS.md` and the board around it were
deleted on 2026-09-20, and everything binding in them is either below or in
the check that enforces it.

---

## Owner decisions

These came from the owner. Don't reverse them without a fresh instruction
from the owner — and if you think one is wrong, say so in your summary rather
than acting on it.

**Products A and B stay separate.** No music players, artist banners or
cross-promo on the tool catalogue or any card; no tool links on the music
pages. Deliberate, not an oversight.

**Never delete or replace an existing tool** without the owner saying so
first. Adding is free; retiring is not. Same for anything in ARCHITECTURE.md
§9's do-not-touch list.

**Analytics (`G-G058FVW6Z2`) stays exactly where it is** — index, the music
cluster, both money pages, news. It does *not* go sitewide. `tool.html`,
`404.html`, the cards and the standalone experiments stay clean. Changing the
analytics footprint in either direction is an owner call.

**Because analytics exists, some claims are lies.** Never write "100%
private", "no tracking", "no cookies" or "no analytics" on a page carrying GA.
These are true everywhere and always safe: *no ads · no accounts · no
sign-ups · no paywalls · runs in your browser*. On tool cards specifically,
"your inputs never leave your device" is true **except** for the cards
`scripts/check-egress.py` classes as A or C — check before claiming it.

**No growth hacks.** No view-bots, hidden players, autoplay tricks or
engagement pods — they violate platform ToS and risk the channel. Legitimate
growth only: metadata, speed, internal links, translated pages, honest CTAs.
No ads or trackers on Product A, no paywalls, no fake urgency.

**The site brain is gone** (owner instruction, 2026-09-20).
`local-ai-knowledge.json`, `scripts/build-site-brain.py`,
`scripts/evaluate-site-brain.py` and `learning/` were deleted: `ai.html` never
read the artefact, no page fetched it, and the rule that any edit to a public
doc forced a rebuild-and-commit of 4.5 MB was the largest single source of
friction in the repository. `agents.html` now points outside agents at
`llms.txt`, `cards/cards.json`, `tools-index.json`, `api/tools*.json` and
`related.json`. Do not regenerate it without a fresh owner instruction.

**The staff facility is gone** (owner instruction, 2026-09-20). The AI
Developer workflow, the profiles in `scripts/ai-staff.json`, the scoreboard,
the claims ledger, the audit engine and their tests were deleted at the owner's
explicit request: governance about governance, invisible to every visitor. An
earlier version of this rule said the workflow must stay because an agent once
deleted it while claiming owner instruction — that was true then; this deletion
is the owner's own. Do not rebuild the facility without a fresh instruction.

**Automatic CI runs the whole gate** (owner instruction, 2026-09-20, reversing
the 2026-09-19 fast pass). The fast pass existed because the suite took about
three minutes. It is now seven checks in ~3 s, with the slow audits behind
`--deep` in ~13 s, so `.github/workflows/agent-guardrails.yml` runs
`verify.sh --deep` on every push and PR and still finishes in seconds — the
"Repo checks" status name is unchanged. Do not add heavyweight CI without a
fresh owner instruction, and do not let the local gate grow slow enough to need
a fast pass again: that is what made this repo hard to work in.

**`token.html` is kept deliberately** — but no crypto promotion.

## Traps you cannot see from the code

**Never hand-edit a tool count, `sitemap.xml`, or `index.html`'s generated
first screen.** All of them are produced (`scripts/sync-counts.py`,
`scripts/build-sitemap.py`, `scripts/build-home-prerender.py`); `verify.sh`
fails on drift. The count appears dozens of times across the published pages
and docs — editing by hand
has failed every single time it has been attempted. The home page's
`HOME-FEATURED`, `HOME-TRENDING` and `HOME-CATEGORIES` blocks — the twelve
featured rows, the eight most-used rows and the 28 category links — are the
same kind of artefact. They look like hand-written markup and are not. (The
page's own list needs no block at all: it is built in the browser from
`tools-index.json`.)

**`generate-cards-json.js` overwrites the `category` field** from hardcoded
lists inside the script. Add your slug to the right list *before* running it,
or your category is silently lost.

**Every card is written for one shared document.** `tool.html` injects a card
fragment into its own page, one card at a time, so the document's global scope
outlives the card: a top-level `let`/`const`/`class` in one card is still
declared when the next card loads, and a name both cards use kills whichever
loads second with a `SyntaxError` (the card renders and does nothing).
Prefix every id and every top-level name; IIFE-wrap anything you touch.
`scripts/check-card-collisions.py` fails the build on a hard collision and
summarises the remaining soft `var`/`function` overwrites — run it rather than
trusting a number written here, because the count moves with the catalogue.

**A card's `<style>` is document-wide too.** The loader re-creates the
fragment's `<style>` blocks inside `tool.html`'s own document, and a style
element's rules apply to the whole document wherever it sits. A bare
`.nav-btn { … }` therefore restyles the page's own nav, related grid, footer
and risk notice while the card itself still looks right — nothing on screen
points at the rule doing it (`punctuation-guide.html` shipped exactly that).
Scope every rule under the card's own id, as `#slug-root .thing { … }`.
`scripts/scope-card-css.py <slug>` rewrites a fragment that already leaks, and
`scripts/check-card-css-leaks.py` fails the build when a bare selector can match
a class `tool.html` renders — the class list is read from `tool.html`, so it
cannot drift away from what the shell actually ships.

**Never interpolate untrusted input into `innerHTML`.** URL params,
`error.message` and `cards.json` strings go in via `textContent` or DOM APIs.
`tool.html` shipped a reflected XSS through `?card=` exactly this way.

**Missing images are usually a sparse checkout, not a bug.** `images/` is
~50 MB and normally off disk. Confirm with `curl -sI` against the live site
before "fixing" anything.

**The `o`/`0` handle mismatch is intentional** — YouTube `@MrProphecy`,
SoundCloud and Instagram with a zero. Not a typo.

**Never invent YouTube IDs.** Use the verified table in ARCHITECTURE.md §4.
A Rickroll (`dQw4w9WgXcQ`) once shipped as a placeholder on a live page.

**`sw.js` is registered** by `home-core.js` (line 486) at idle on every list page — `index.html`, `tools.html`, `tools-index.html` and the 28 category pages. It runs `freshFast()` for the catalogue and card fragments (never stale beyond GitHub Pages' own 10-minute window) and `navigateFast()` for all navigations (2.5 s patience cap). `index.html` also `modulepreload`s it. `tool.html` does not load `home-core.js` and does not register the worker itself, but any navigation from a list page is already intercepted. `CNAME` deletion breaks the custom domain.

## Open questions only the owner can answer

Not a work queue — just the things genuinely blocked on a decision. Delete a
line the moment it is answered.

- **Language pages** — thin machine-translated hreflang cluster. Enrich with
  real localisation, or consolidate?
- **`sw.js`** — live and registered by `home-core.js`. Working as designed. This line can be deleted.
- **Ship or delete:** the four unlinked CV files (`CV.docx`, `CV.pdf`,
  `cv.pdf`, `latestcv.docx`). The rest of that list — `indexbeta.html`,
  `hokidea.html`, `guide.txt`, `substitutions/`, `system/`,
  `digitaldetoxcardshtml/` — was deleted on 2026-09-20 with the owner's
  approval; the CVs are personal documents, so they stay until the owner says
  otherwise.
- **LICENSE** — none chosen yet.
- **135 soft top-level JS name collisions** — fixing means IIFE-wrapping many
  cards: a large mechanical diff. Worth it?
