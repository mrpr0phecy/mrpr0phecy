# Staff board

Read [`README.md`](README.md) first — it has the rules, and the warning that
**this repo is public**.

Newest entry at the top. Append under the marker; never rewrite an entry that
is not yours, reply to it instead.

<!-- NEW ENTRIES BELOW -->

## 2026-09-03 23:17 UTC — @systems — Card load failures: cause found, plus the loader now self-heals

Owner reported 'Failed to load Anime Phrases & Tropes - NetworkError when attempting to fetch resource' on some tools at page load.  IMPORTANT CONTEXT FIRST: the live site serves from main, and main does not have any of the loading work from this branch. main still has rootMargin 400px and, critically, an executeLoadCard whose catch calls showCardError and whose finally calls observer.unobserve(card) unconditionally. So on main a single transient NetworkError permanently kills that card until you click Retry or reload - which is exactly the reported symptom. The retry-with-backoff fix exists on this branch only. It needs merging to main to reach users.  Also checked and ruled out: main has no CSP or egress/network-policy code in index.html, cards.json titles are clean (0 contain &amp;), and the card itself uses speechSynthesis, not fetch. So this is a transient network failure being made permanent by the error handling, not a missing file.  Fixed on this branch:  1. showCardError was shared by two different failures. renderCardContent's catch called it too, so a card that downloaded fine but broke during injection was reported as 'Failed to load' - sending whoever debugged it after the network instead of the card. It now takes a reason and says 'Couldn't render' vs 'Failed to load'.  2. The error UI interpolated the title and the error message into innerHTML. Both are now set with textContent, and the Retry button is bound with addEventListener instead of an inline onclick string, so a quote in a card name cannot break out of the attribute. Note: I could not reproduce the &amp; the owner saw - titles in cards.json hold a plain ampersand, and textContent now makes the question moot. Treat that specific rendering as unverified.  3. New automatic recovery sweep. retryErroredCards() runs every 5s and re-attempts cards that failed to LOAD (never ones that failed to render - re-injecting a broken fragment just breaks again), limited to cards within 600px of the viewport and to 3 attempts, so a page-load burst cannot become a permanent background retry loop. A manual Retry always resets the allowance.  4. A real bug the tests caught in my own new code: the sweep called retryLoadCard, which reset the attempt counter to 0 every time, so AUTO_RETRY_LIMIT could never be reached and a dead card would have been re-requested forever. retryLoadCard now takes resetAllowance and the sweep passes false.  5. scripts/tests/ - the loader and card-error suites are now committed. They were previously written to /home/user/.cache, which is snapshot-excluded, so they silently vanished between turns: the fixes stayed verified but unverifiable. They drive the real extracted functions out of index.html with stubs, no browser needed, and verify.sh runs them as section 10/10 (currently 12 assertions).  Verified: node --check clean on both script blocks; bash scripts/verify.sh passes all 10 sections. NOT verified in a browser - no chromium here and the workspace is over its 100 MB budget.

---


## 2026-09-03 07:08 UTC — @systems — Maintenance pass: regression guard for dead cards, plus two index.html perf defects

1. NEW GUARD - scripts/check-card-js.py. ARCHITECTURE.md 9 records seven cards that were completely dead in production because a JS syntax error killed their whole script block. That was found by hand and never guarded. Now every card's script blocks are run through node --check. Incremental by default (only cards changed vs HEAD, so a local run is instant), --all for the full sweep: 535 blocks across 562 cards in ~11s, currently clean. Non-vacuity proven by injecting the exact historic defect - function xxTrackAffiliate(){}); - into qrtool.html, which it caught as 'SyntaxError: Unexpected token'. verify.sh is now 9 sections.  2. NEW GUARD - empty cards. cards/vocab.html is 92 bytes: one <h2>, nothing else. It is catalogued as 'Word List Flashcards - Instant, free online Word List Flashcards tool' and it is in sitemap.xml, so a user gets a heading and an empty box. It is the only card with no interactive element; the next smallest card is 3533 bytes. check-cards.py now fails any card with no interactive element. vocab.html warns rather than fails so it does not block other staff - tracked as OPEN-9 with a recommendation to delete, since it is also redundant: flashcards.html (39 KB), vocabulary-trainer.html, japanese-jlpt-vocabulary.html and maths-flashcards.html already cover it. Removing it drops 562 -> 561 and must be one coordinated change across cards.json, index.html, sitemap.xml and five docs.  3. index.html - removed 562 no-op timers. Card creation scheduled setTimeout(updateCardRatingDisplay, 100) for every card, but the footer element it looks for is only created in renderCardContent when the card actually loads, and that function already calls updateCardRatingDisplay immediately after creating it. So all 562 timers did a querySelector, found nothing, and returned.  4. index.html - search ran twice per keystroke. Both mainSearchInput and stickySearchInput had TWO input listeners: setupStickyCommandBar bound one that synced the value AND called performSearch immediately, and setupEventListeners bound a debounced one (300ms). Every keystroke ran the full 562-card filter plus the directory rebuild twice, and the undebounced call defeated the debounce entirely. setupStickyCommandBar now only syncs the values. Verified with a vm+Proxy harness running the real extracted functions: 0 synchronous searches per keystroke, exactly 1 debounced, boxes still in sync both directions - and the test fails when the old code is put back.  Also audited for the other historic incident (five byte-identical card pairs, duplicate titles): 0 byte-identical cards and 0 duplicate titles today, so no guard added. bash scripts/verify.sh passes.

---


## 2026-09-03 06:57 UTC — @systems — index.html lazy loading: four defects fixed

Owner reported cards not loading when scrolling quickly. Four separate causes, all in the loading path:  1. Lazy loading was disabled entirely while searching or filtering. applyFilters sets isSearching for any query OR category selection, and the observer callback, the scroll fallback and the 3-second recovery interval all bailed on it. Only the first 12 matches were ever loaded, so picks in a 123-tool category showed 'Loading...' forever. All three gates removed; the observer naturally skips display:none cards. 2. The scroll fallback capped at 6 cards per pass and was debounced, so during continuous scrolling it never ran at all - only after a 150ms pause. Now throttled at 200ms with a trailing call, no cap (MAX_CONCURRENT_LOADS already throttles the network), and it queues nearest-to-viewport first. 3. No automatic retry. executeLoadCard unobserved the card in its finally block even on failure, contradicting its own comment, and the loading-fallback class was never removed, so a failed card was unreachable by both retry paths. Now retries twice with backoff before showing the error UI, and only unobserves once actually loaded. 4. rootMargin was 400px, too tight for 562 tall cards - a fast scroll outran it. Now 1200px. Also removed scrollLoadActive, a flag set and cleared in the same synchronous function.  Verified: both script blocks pass node --check. Extracted the real scrollFallbackLoader/onScrollLazyLoad/executeLoadCard source out of index.html and drove them with stubs - 9 assertions, all passing (13 cards queued where the old cap gave 6; throttle ran 6x during 1050ms of continuous scrolling where a debounce runs 0; transient failure recovers in 3 fetches; persistent failure still shows the Retry UI; hidden cards skipped). bash scripts/verify.sh passes.  NOT verified in a real browser: no chromium in this sandbox and the workspace is already 122.5 MB against a 100 MB budget, so installing one was not an option. The scroll feel needs a human check on the live page.

---


## 2026-09-02 20:28 UTC — @systems — Staff facility built — discoverability was the actual problem

Agents reported they could not find staff/ or did not notice it. Documentation was not the issue; discoverability was. Three changes:  1. A command instead of a file to remember. 'bash scripts/staff.sh' prints the current state: catalogue size, open items and who they wait on, recent activity, and the rules. It reads live data so it cannot go stale. 2. Presence everywhere an agent looks. STAFF.md at the repo root (visible in ls), and a banner in the first six lines of README.md, AGENTS.md and ARCHITECTURE.md. 3. Current state separated from history. OPEN.md is what needs doing now; BOARD.md is why. Both are structured and checked in CI by scripts/check-staff.py, which verify.sh runs as section 8/8.  Verified: check-staff.py catches duplicate item numbers, a missing Needs line, and a lost board append marker (all three tested by breaking a copy). bash scripts/verify.sh reports VERIFY PASSED with the new section reporting '4 open, 4 closed, item numbers unique'.  One thing is blocked: the CI step that prints this digest into every PR summary was rejected on push because the GitHub App token lacks the workflows permission. Tracked as OPEN-8 with the exact snippet.

---


## 2026-09-02 18:15 UTC — @systems — ai-developer.yml deleted; staff are agents

Owner decision: **`.github/workflows/ai-developer.yml` is removed.** It ran
`node scripts/ai-developer.js` — a file that never existed on any branch — on a
twice-weekly schedule, so it failed every run while holding `contents: write`
and `pull-requests: write`. `agent-guardrails.yml` is now the only workflow in
the repo.

The important part for everyone here: **that workflow's job is now our job.**
Adding and improving tools is done by agent sessions directly, coordinated
through this board. There is no background automation to fall back on, and no
automated PRs to review. If you want a tool added, do it yourself in a session
and follow the sequence in AGENTS.md §4.

Also confirmed by the owner: **staff are agents**, one per session, plus the
human owner. `staff/README.md` now has a role-handle roster — `@systems`,
`@content`, `@music`, `@seo`. Sign with the role, never with a model name or a
per-session identity, so notes stay attributable across sessions. Read the
whole board before posting; duplicate and contradictory work is the main risk
in a repo this shape.

Still open, unchanged: the 10 `boxing-*.html` tools misfiled under *Productivity
& Lifestyle*, and the dead weight listed in ARCHITECTURE.md §9 (four CV files,
unreferenced `logo.png`, three legacy directories). Both need an owner decision.

---

## 2026-09-02 18:06 UTC — @systems — Maintenance pass: the guardrails were the broken part

`@mrpr0phecy` asked for a systems review. The site itself was in good shape —
`bash scripts/verify.sh` passes and all 602 sitemap URLs resolve. The problems
were in the layer that is supposed to *catch* problems.

**Fixed and committed (`5201e7d`):**

- `scripts/check-cards.py` was reporting five duplicate element ids that do not
  exist. It read `id="${item.id}"` inside `<script>` blocks as literal ids, so
  every JS generator loop in every card looked like a collision — 54 such sites
  site-wide. It now skips only `${…}` interpolation, and still scans
  JS-generated ids, which are real at runtime because all cards share one DOM.
  Verified **0 duplicate ids** across all 562 cards.
- The tool count had drifted to **500** in README, AGENTS.md, AGENT_ACCESS.md
  and INCOME.md while the catalogue was at **562**. AGENTS.md even told agents
  to rewrite `Search 500` → `Search 501`, which would have shipped a wrong
  count. All corrected.
- Counts and categories are now **enforced rather than trusted**: the build
  fails if any prose doc's stated count, `index.html`'s JSON-LD
  `numberOfItems`, its filter pills, or ARCHITECTURE.md's category table
  disagree with `cards/cards.json`. The hardcoded `KNOWN_CATEGORIES` set was
  deleted — it had already drifted.
- ARCHITECTURE.md's category table summed to **483** under a heading claiming
  562, listed a category that does not exist, and omitted five that do.
  Regenerated; it now sums to exactly 562 across 23 categories.
- One live 404: `cards/mrprophecy-tour-manager.html` linked `href="listen.html"`,
  which is `/cards/listen.html` when the card is opened directly. The same bug
  is documented as fixed in ARCHITECTURE.md §9; this instance was missed. Now
  `../listen.html`, and the build fails if any card does it again.
- Every new check was tested by deliberately breaking a scratch copy and
  confirming it fires — 9 cases, 0 missed. A guardrail that never fails is
  worse than none.

**Still needs the owner — nothing below has been changed:**

- **RESOLVED 18:15 — deleted.** ~~`.github/workflows/ai-developer.yml` cannot
  ever succeed.~~ It ran `node scripts/ai-developer.js`, a file that never
  existed on any branch, on a `0 6 * * 1,4` schedule, while holding
  `contents: write` and `pull-requests: write`. Owner chose deletion. See the
  18:15 entry above.
- **DECISION:** 10 `boxing-*.html` tools are filed under *Productivity &
  Lifestyle* because `generate-cards-json.js` has no `boxingList` router, yet
  the docs and the old checker both promised a *Boxing & Fight Scoring*
  category. The script overwrites categories on every run, so the category can
  never appear. Adding it is a visible change to the live catalogue UI.
- **DECISION:** dead weight awaiting confirmation in ARCHITECTURE.md §9 — four
  CV files (~2.4 MB, linked from nowhere; `CV.pdf` and `cv.pdf` differ only by
  case), `logo.png` (1 MB, referenced by nothing but still precached by
  `sw.js`), and the legacy `substitutions/`, `system/`,
  `digitaldetoxcardshtml`.

---
