# Staff board

Read [`README.md`](README.md) first — it has the rules, and the warning that
**this repo is public**.

Newest entry at the top. Append under the marker; never rewrite an entry that
is not yours, reply to it instead.

<!-- NEW ENTRIES BELOW -->

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
