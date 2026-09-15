# Site Staff Operating Plan

**Status: active planning standard · revised 2026-09-15**

This is the execution layer between the mission in [NORTH-STAR.md](NORTH-STAR.md),
the evidence contract in [scoreboard.json](scoreboard.json), and the ranked queue
in [OPEN.md](OPEN.md). It is intentionally more demanding than “publish more
pages” and more honest than “rank first on Google”.

## The outcome we are actually optimising

There are two products and therefore two outcomes:

- **Tools:** more people finish important tasks correctly, quickly, privately
  and with enough explanation to trust the result.
- **Music:** more listeners intentionally find the right MrProphecy track,
  understand who made it and reach a verified listening or licensing
  destination.

Search visibility, returning visits, backlinks, revenue and awards are valuable
**means and signals**. They are not permission to damage task success, trust,
privacy or the separation between the products. The two north-star definitions
and every supporting metric live in `scoreboard.json`; a missing baseline is
recorded as `not-measured`, never silently converted to zero or a guess.

## What “perfect” means in practice

A change is excellent only when it improves a real outcome and survives all four
reviews below:

1. **Useful:** the intended user can find the right surface, complete the task,
   understand the result and recover from normal errors.
2. **Trustworthy:** calculations and claims are sourced and tested, limitations
   are visible, inputs do not silently leave the device, and corrections have an
   owner and a date.
3. **Brilliant:** the interface is clear before it is expressive, mobile-first,
   keyboard-complete, reduced-motion safe, fast and visually stable.
4. **Viable and findable:** the page matches a proven intent, earns attention
   through genuine utility, and any commercial offer pays for its maintenance
   without dark patterns, forced signup, ads on tools or lead capture in embeds.

No page, role or experiment can waive a blocking safety or correctness gate.

## Stage-gated operating sequence

### Gate 0 — establish reality before choosing work

**Owner:** `measurement`, with `seo`, `finance`, `reliability` and the owner.

Before promising improvement, collect the smallest useful baseline:

- Search Console: queries, clicks, impressions, CTR, positions, indexing and,
  where available, generative-feature visibility; segment by URL and device.
- PageSpeed Insights/CrUX: p75 LCP, INP and CLS for the home, tool shell, one
  guide, one money page and the music entry point, on mobile and desktop.
- Five-user qualitative sessions for discovery: “find a tool”, “use it”,
  “explain the result”, plus one music discovery task. Five users can reveal
  qualitative problems; they do **not** establish a population conversion rate.
- Finance: owner bookkeeping, direct fulfilment time, support time, qualified
  enquiries and the real cost of any proposed distribution channel.
- Trust: current statutory sources, YMYL test status, network exceptions,
  accessibility blockers and corrections.

The baseline is a dated evidence packet, not a dashboard theatre exercise. If a
source is unavailable, say so and keep the decision open.

### Gate 1 — repair the highest-value task

**Owner:** `reliability`, `measurement`, `visual-design` and the relevant domain
reviewer.

Choose no more than one primary task per iteration. Start with proven queries
and observed blockers, not a new category or a speculative keyword list. Fix in
this order:

1. wrong, unsafe, stale or misleading result;
2. broken load, empty state, retry or offline recovery;
3. inability to find or understand the tool;
4. avoidable input, keyboard, mobile or performance friction;
5. only then, decorative polish.

A task change is ready to ship only with a reproducible before-state, a named
primary metric, guardrails, browser evidence and an explicit stop/rollback rule.

### Gate 2 — earn search and recommendation visibility

**Owner:** `seo` and `catalogue`, reviewed by `reliability` and the domain owner.

For a proven intent, build one canonical page that gives the answer and the
working tool immediately, then adds what a visitor needs to decide and trust:

- a descriptive title and heading that match the task without clickbait;
- a direct answer above the fold, then method, assumptions, worked example,
  limitations, FAQ and authoritative sources;
- first-hand evidence, named responsibility and a visible update/correction
  path for high-stakes topics;
- crawlable links, canonical URL, appropriate structured data and a curated
  route from the relevant hub;
- a reason to click that a summary cannot replace: an interactive calculation,
  current source-backed data, a generator, or a genuine first-hand finding.

Do not mass-produce pages for close keyword variants. Do not create a page just
because an AI system might cite it. Google’s current guidance says generative
Search uses the same core Search systems and that there is no special AI markup
or separate “AI SEO” shortcut. `llms.txt` and the repository brain may help
machines navigate this project, but they are not ranking guarantees.

### Gate 3 — prove a sustainable commercial loop

**Owner:** `growth` and `finance`; the owner signs terms, prices and sends
outreach.

Use this order:

1. **Embed licensing:** validate one real buyer and the support burden before
   building more tiers. Free embeds may remain a clean acquisition channel with
   an honest attribution line only after the owner signs the terms.
2. **Music licensing/distribution:** verify rights, tax treatment, destination
   and bookkeeping before scaling outreach.
3. **Sponsorship, owned audience and digital products:** proposals only until
   costs, privacy, fulfilment and the value exchange are explicit.
4. **Donations and relevant affiliate links:** keep them contained and honest;
   never make them the reason a tool exists.

For each offer calculate:

```text
contribution margin = collected revenue - direct fulfilment cost - support time
break-even units     = fixed monthly cost / contribution margin per unit
```

The input values belong in the owner’s bookkeeping, not in invented public
copy. A commercial experiment fails if it increases support or trust damage
faster than it increases contribution margin. “More traffic” alone is not a
business case.

## Research and experimentation protocol

Every brief uses this compact format:

```text
Problem / affected user:
Evidence and date:
Hypothesis:
Primary metric and instrument:
Guardrails:
Smallest reversible change:
Stop or rollback rule:
Owner / reviewer:
Result: shipped, reverted, inconclusive or blocked:
```

Rules:

- Qualitative research finds problems and language. Quantitative research
  estimates rates; do not infer the latter from a handful of interviews.
- Use a control or dated before-state when attribution matters. Change one
  material variable at a time unless the work is explicitly a bundled repair.
- A result is a win only if the primary metric improves and no guardrail
  regresses. “Inconclusive” is a successful honest outcome.
- No new analytics, cookies, input collection, newsletter provider or lead
  capture is smuggled in as an experiment. Owner approval and the existing
  privacy decision are prerequisites.
- The staff runner may validate plans and run deterministic checks. It does not
  recruit people, send outreach, change prices, publish drafts or merge code.

## 90-day sequence

### Days 1–7: measure and remove ambiguity

- Owner completes Search Console/Bing/analytics and YouTube reads in P0-M1.
- Record the performance/accessibility baseline in `BOARD.md`.
- Reconcile the analytics footprint under D-007 before adding any event.
- Pick the first ten to twenty-five proven tool intents and the first five
  moderated tasks. No new catalogue expansion.
- Owner rules the embed terms, translated cluster, service-worker policy and
  input-egress edge cases already listed in `OPEN.md`.

### Days 8–30: make the core job excellent

- Repair the top task and its shared template, not a random long tail.
- Run three small rounds of qualitative testing, fixing the biggest blocker
  between rounds; keep quantitative claims separate.
- Establish server-side/prerendered pages only for tools that have proven
  demand and enough unique value to deserve a page.
- Recheck keyboard, 360–390px, reduced motion, p75 field data and the relevant
  correctness/YMYL suite before calling the work complete.

### Days 31–60: publish authority, not filler

- Improve the selected pages with first-hand examples, sources, methodology,
  limitations and curated internal links.
- Earn distribution through a useful resource-page offer or one original data
  finding at a time. Keep a dated editorial log; no bought or exchanged links.
- Send the first small, hand-written licence and sync packs only after the
  owner approves the terms. Record replies and support objections, not vanity
  reach.

### Days 61–90: scale only what paid for itself

- Compare task success, search visibility, field experience and contribution
  margin against the original baseline.
- Retain, revise or retire each experiment using its stop rule.
- Expand a vertical only when the first one has evidence of task value and a
  supportable commercial loop. Consolidate thin routes instead of protecting
  them for sunk cost.
- Publish a dated changelog of meaningful corrections and statutory updates;
  never refresh a date without changing the substance.

## Review cadence and accountability

- **Every Monday and Thursday:** deterministic audits, branch-overlap scan,
  focused claims, failed gates and one recommended next action.
- **Weekly operating review:** one owner or delegated maintainer reviews the
  evidence packet, releases or blocks claims, and selects at most one primary
  task per active session.
- **Monthly scorecard:** refresh Search Console, CrUX/PageSpeed, bookkeeping,
  manual usability and music evidence. Compare cohorts and devices; keep
  `not-measured` where the instrument is unavailable.
- **Quarterly strategy review:** inspect the full metric tree, commercial
  contribution, thin/low-value pages, product separation and whether the next
  investment still serves the north stars.

`measurement` owns the contract; each domain role owns the work and evidence
inside it; `delivery` owns the handover. The owner alone changes analytics
policy, public commercial terms, protected catalogue decisions or submission
spend.

## Definition of ready / done

**Ready** means the brief names a real user/job, evidence and date, a small file
scope, a primary metric, guardrails, a reviewer and the owner decisions it
needs. “Improve SEO” or “make it premium” is not ready.

**Done** means the change is implemented, deterministic gates are green, touched
interactions were browser-tested, before/after evidence is recorded or marked
unavailable, docs and derived files are synchronized, and the handover states
what remains. A released claim means only that the file reservation ended; it
never means deployed, approved, profitable or ranked.

## Source hierarchy used by this plan

1. Primary law, official platform documentation, authoritative domain sources
   and the repository’s executable tests.
2. First-hand user sessions, browser/field measurements and owner bookkeeping.
3. Reputable specialist research used as a design hypothesis, never as a
   fabricated site baseline.
4. Vendor blogs, anonymous “SEO score” tools and social claims: leads only,
   never proof.

Current reference set: Google [Search Essentials](https://developers.google.com/search/docs/essentials),
Google’s [generative Search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide),
Google’s [helpful-content self-assessment](https://developers.google.com/search/docs/fundamentals/creating-helpful-content),
web.dev [Web Vitals](https://web.dev/articles/vitals), W3C
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), Awwwards’ official
[evaluation system](https://www.awwwards.com/about-evaluation/), Baymard’s
[UX principles](https://baymard.com/learn/ux-design-principles), and NN/g’s
[qualitative versus quantitative testing guidance](https://www.nngroup.com/articles/5-test-users-qual-quant/).

This plan is a living operating standard. Update it when the instruments or
owner decisions change; never rewrite history to make an old target look met.
