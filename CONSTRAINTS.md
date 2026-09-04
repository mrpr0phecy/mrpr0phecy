# CONSTRAINTS.md — the things you cannot know from the code

Short by design. This file holds **only** facts an agent cannot discover by
reading the repo or running the checks — owner decisions, and traps whose
reasons are invisible. Everything else lives in code, in checks, or in git.

If you want to know *what happened*, use git and GitHub — `git log`,
`gh pr list`, `gh issue list`. Don't write status reports into the repo.

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

**The AI Developer workflow stays** (`.github/workflows/ai-developer.yml`).
An agent once deleted it claiming owner instruction; that was false.

**`token.html` is kept deliberately** — but no crypto promotion.

## Traps you cannot see from the code

**Never hand-edit a tool count or `sitemap.xml`.** Both are generated
(`scripts/sync-counts.py`, `scripts/build-sitemap.py`); `verify.sh` fails on
drift. The count appears 49 times across 10 files — editing by hand has failed
every single time it has been attempted.

**`generate-cards-json.js` overwrites the `category` field** from hardcoded
lists inside the script. Add your slug to the right list *before* running it,
or your category is silently lost.

**All 644 cards share one DOM.** Element ids must be globally unique — prefix
everything. Top-level JS names collide too (126 of them: `showError`,
`updateStats`, `STORAGE_KEY`…); IIFE-wrap anything you touch.

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

**`sw.js` is not registered** by any page, on purpose. `guide.txt` is stale.
`CNAME` deletion breaks the custom domain.

## Open questions only the owner can answer

Not a work queue — just the things genuinely blocked on a decision. Delete a
line the moment it is answered.

- **Language pages** — thin machine-translated hreflang cluster. Enrich with
  real localisation, or consolidate?
- **`sw.js`** — enable it (a real win for an offline-first tool site) or
  delete it? Currently dead code.
- **Ship or delete:** `indexbeta.html`, `hokidea.html`, the four unlinked CV
  files, `substitutions/`, `system/`, `digitaldetoxcardshtml/`.
- **LICENSE** — none chosen yet.
- **`AI_API_KEY`** secret — unset, so the workflow's `generate` mode is
  skipped (audit and fix still run). Add one if drafts are wanted.
- **126 top-level JS name collisions** — fixing means IIFE-wrapping many
  cards: a large mechanical diff. Worth it?
- **`token.html` says 644 tools** — if the token perks were scoped to a
  subset, that number should be scoped instead of synced.
