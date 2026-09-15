# EXCELLENCE — the standard this site is held to

What "perfect" means here, in measurable terms. This is the sister document
to [OPEN.md](OPEN.md): OPEN.md is the ranked queue, this file is the bar
every item is judged against. Written 2026-09-15 from a full review of
current award, search, accessibility and monetisation practice. It does not
override [DECISIONS.md](DECISIONS.md), [CONSTRAINTS.md](../CONSTRAINTS.md) or
[ARCHITECTURE.md](../ARCHITECTURE.md) — where they conflict, those win and
this file gets fixed.

## 0. The honest headline about “first on Google”

Nobody can promise first place on Google in general. The defensible objective is
**top visibility for proven, specific task intents**: positions 1–3 where the
site has genuinely earned relevance, strong task satisfaction and trust, plus
visibility in generative Search features when Search Console reports it. That
is a goal to work toward, not a guarantee or a current result.

Google’s [Search Essentials](https://developers.google.com/search/docs/essentials)
prioritise helpful, reliable, people-first content, crawlable links, honest
relevance and spam-policy compliance. Google’s current generative Search guide
says those same core Search systems underpin AI features; it does **not** offer a
special AI markup or shortcut. Interactive tools are valuable here because the
visitor can complete a task on the page, but “interactive” is not a waiver for
thin copy, inaccurate results or poor UX.

The plan therefore has one SEO thesis: **every indexable URL must genuinely help
the visitor, or be consolidated/noindexed.** The measurable product outcome is
successful, trusted task completion; search visibility and revenue are measured
as separate supporting outcomes. See [scoreboard.json](scoreboard.json) and the
[operating plan](OPERATING-PLAN.md) for instruments, targets and unknowns.

Useful background already in the repo: [STRATEGY.md](../STRATEGY.md) (why
traffic-independent revenue matters), [INCOME.md](../INCOME.md) (music income),
[FINANCE.md](../FINANCE.md) (correctness + obligations) and the source-quality
notes in [RESEARCH.md §7](RESEARCH.md).

## 1. Rank — the #1 standard

Ranked by impact: task/intention fit and content quality first; trust,
technical structure and earned distribution next; field experience protects
the result. No third-party score or secret ranking formula is treated as proof.

### 1a. Content quality and intent match (top factor)

- Each ranking page matches the **dominant SERP format** for its query and
  answers the query **above the fold**: the tool usable within seconds, the
  direct answer in the first screen.
- **Topical depth over page count.** One resource that answers the full
  question set (tool + how-to + worked example + FAQ + sources) beats five
  thin pages. Never publish a page whose unique value fits in one sentence.
- **Proven task intents first.** Start with the queries and tasks Search Console
  and moderated research actually reveal. Long-tail and question queries are
  useful entry points, but do not invent a search-volume range or treat a
  keyword tool as demand evidence. Head terms remain a later ambition, not a
  reason to publish shallow variants.
- **Freshness is maintenance, not date-swapping.** Statutory figures every
  April (already guarded by `check-finance.js`), visible "last updated" dates
  on guides/YMYL pages, meaningful refreshes only.
- **No keyword stuffing, no exact-match repetition games, no bought links.**
  All are demotion/penalty material. Third-party "Domain Authority" is not a
  Google signal — ignore it; track real positions and clicks in Search
  Console instead.

### 1b. E-E-A-T, and YMYL where it applies (high impact)

Finance, health, legal and safety tools are **Your Money or Your Life**:
wrong answers can cause real harm, so trust is the priority. Google’s guidance
says trust is the most important part of E-E-A-T; experience, expertise and
authority cannot rescue an inaccurate page.

- **Trust first:** every factual claim traceable to a source that can be
  re-run (already D-001 for counts; extend to formulas: HMRC manuals, NHS
  pages, legislation.gov.uk). Corrections policy on `about.html`.
- **Experience:** first-hand, tested tools beat research-only content. The
  finance test suite (100+ assertions from independent implementations) and
  the worked-example confirmations in FINANCE.md §1 *are* E-E-A-T evidence —
  say so publicly, briefly, on the relevant pages.
- **Expertise:** named author with verifiable identity on YMYL-adjacent
  content (`about.html` already names Russell Head, Luton, solo maintainer —
  keep it current, add last-updated, Person/Organization schema, links to
  official profiles). No anonymous "admin" on money/health pages.
- **Authoritativeness:** citations *from* reputable sources (backlinks §1c),
  consistent publication of accurate content, industry-appropriate
  transparency (funding, methodology, limitations — the risk notices and
  advice caveats already do half of this).
- **Never present estimates as advice.** Every money/health/legal tool keeps
  its caveat (what it does not model, when to get professional help).

### 1c. Backlinks and brand signals (high impact, quality > volume)

- The site's unfair advantage is the **embed backlink engine**: every free
  embed should carry a small credit link back (the free tier *is* the price).
  Status 2026-09-15: `embed.html` ships bare iframes with no attribution and
  no licensing offer — the engine is switched off. Re-enabling it is an
  owner decision (OPEN.md P1-M3); staff keep the proposal ready.
- Above that: **editorial links earned by utility** — resource-page outreach
  ("free, no-signup, runs in browser" is exactly what .ac.uk/.org.uk
  resource lists want), digital PR built on original data (the finance-bug
  findings, catalogue statistics), and the YouTube flywheel (§5).
- Internal links are the backlinks we control: topical hubs per category with
  real content, breadcrumbs (shipped client-side on `tool.html`; server-side
  on prerendered pages — OPEN.md P1-R2), related-tool links (`related.json`
  exists — keep it curated, not mechanical).

### 1d. Core Web Vitals (real signal, tie-breaker)

Per [web.dev](https://web.dev/articles/vitals), the thresholds are measured at
the **75th percentile of real users**, segmented by mobile and desktop. Lab
scores diagnose causes; they do not replace field evidence.

| Metric | Good | Poor | What it measures |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5 s | > 4.0 s | Main content visibly loaded |
| INP (Interaction to Next Paint) | ≤ 200 ms | > 500 ms | Response to every tap/click/keystroke, whole session |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | > 0.25 | Visual stability during load |

Site-specific risks: the shared-DOM catalogue (1149 cards, one document) is
an **INP risk** — keep lazy/virtualised rendering and never bind heavy work
to scroll without coalescing (already done; guard it). The hero/first screen
is the **LCP risk** — the fast-path prerender exists; keep it under budget
(OPEN.md P3-T3). Unreserved image/ad slots are the **CLS risk** — dimensions
or reserved space everywhere, no late-injected chrome above content.

Internal stretch target: **INP ≤ 150ms at p75**; Google’s published good
threshold is 200ms. Optimise at template level, fix order TTFB → LCP → INP → CLS,
and judge on field data only — allow weeks after deploying before declaring
a fix (28-day rolling window). Off-site CrUX/API monitoring adds no on-page
tracking (OPEN.md P1-R9).

### 1e. Technical SEO checklist (unindexed pages can't rank)

- Crawlability: `robots.txt` + `sitemap.xml` accurate and submitted (Search
  Console + Bing Webmaster Tools — both free, ~10 minutes each, still undone:
  OPEN.md P0-M1). Canonicals valid, no accidental noindex on money pages.
- **Per-tool indexability is the structural gap.** Today all tools share
  `tool.html?card=<slug>` with client-side metadata. A build-time page is worth
  doing only for the top 10–25 proven tools, and only when each page has unique,
  useful content (spec in OPEN.md P1-R2); the card fragment remains the single
  implementation. This is a crawlability and user-experience improvement, not
  a promise that static HTML alone earns rankings.
- Structured data: WebSite + CollectionPage + ItemList (shipped on index),
  WebApplication + BreadcrumbList per tool (shipped client-side), FAQPage on
  `help.html` (shipped), Article on guides/blog, Person/Organization on
  about. Validate with Rich Results Test before claiming.
- HTTPS everywhere (GitHub Pages: yes), mobile-first responsive (graded on
  mobile), 404 that helps (shipped), internal links all resolving (gated by
  `check-links.py`).
- Hreflang/translated cluster: 12 thin pages. Either enrich with real
  localisation or consolidate — thin translations are a scaled-content risk,
  not an asset. Owner decision (OPEN.md P1-R6).

### 1f. Generative Search visibility — the second surface

Generative Search visibility is a second surface, not a separate optimisation
industry. Measure it through Search Console when the report is available and
optimise the same useful page for people first:

- Clear structure: direct answer first, then depth. Q&A formatting, stats,
  comparison tables and cited sources can make information easier for people and
  parsers to understand; they are not citation guarantees.
- Structured data helps systems understand a page when it accurately describes
  visible content; it is not a ranking guarantee.
- Cut or rebuild commodity definitions that add no first-hand value; prioritise
  task pages where the visitor must use the tool, inspect current data or see a
  tested result.
- `llms.txt` / `llms-full.txt` / `tools-index.html` remain useful repository
  navigation and catalogue artefacts. Google’s current guidance does not treat
  an AI-only text file as a ranking lever; drift-gate them for accuracy, not
  because they promise citations.

### 1g. Search result clarity and satisfaction

Sharp, honest titles (query + differentiator: "Free · No sign-up · Runs in
browser"), meta descriptions that promise the task outcome, favicons/OG
images that survive a tab strip. Then satisfy intent fast. A return to the
SERP is a useful UX symptom to investigate, not a published Google formula or
a standalone target.

### 1h. Satisfaction and task completion — be the useful final destination

Do not claim access to a secret click-classification or dwell-time formula.
Search-result clicks, returns and engagement are useful symptoms to investigate,
not standalone ranking targets. Improve the underlying experience:

- match the title and description to the actual task;
- show the usable tool and the important answer quickly;
- prevent wrong inputs, explain errors and make the result easy to verify;
- give the visitor a clear next step only when it is genuinely relevant.

The scoreboard separates Search Console performance from moderated task success,
field experience and correctness. A click is not a win if the visitor cannot
finish the task.


### 1i. Entity SEO — be a node, not a keyword

AI systems need to resolve what a page and its publisher are about. Consistent
identity, accurate Organization/Person relationships, useful source pages and
independent corroboration are sensible trust work; no universal correlation
coefficient or knowledge-graph result is a site baseline. The stack:

- **On-site:** stable `@id` URIs for Organization + Person, sameAs ladders
  to authoritative profiles (identical name/photo/role everywhere — any
  drift weakens resolution), connected `@graph` (Organization ↔ WebSite ↔
  WebPage ↔ Person), `about`/`mentions` with entity intent (generic valid
  schema with no entity properties is practically useless), one-sentence
  entity definitions reused verbatim everywhere.
- **Off-site:** Wikidata item where notability allows, relevant company or
  creator profiles, consistent identity and third-party corroboration through
  press or original data studies. Timing and knowledge-graph resolution are
  uncertain; measure them when the owner can supply a real instrument.
- **Author entities are assets, not attributes.** YMYL content should have an
  attributable, verifiable author and clear sourcing. Where the owner can
  supply instruments, record identity-profile consistency and external
  resolution/citation observations; do not treat them as guaranteed ranking
  levers.

## 2. Useful — the brilliance standard

The product promise is "finish the task, trust the result". Perfect means:

1. **Correct.** Money tools: 100%-passing `check-finance.js` from independent
   implementations, April statutory refresh, no placebo controls, no stale
   year labels. Extend the *method* (sourced test vectors, boundary sweeps,
   invariants) to health/legal calculations next — not the whole catalogue.
2. **Fast to task.** Search that finds the tool in keystrokes, first screen
   interactive immediately, tool usable without scrolling past chrome. Measure
   task time, not pageviews.
3. **Reliable.** Real regression tests for load/retry/scroll (shipped),
   graceful offline failure for live-data tools (Class C), visible warnings
   on input-egress tools (Class A), zero silent failures. New cards: zero
   network calls (enforced by `check-egress.py`).
4. **Forgiving.** Empty states, error states and edge inputs designed, not
   defaulted. Every number formatted for its locale; every result explainable
   ("why this number" beats "trust this number").
5. **Private by construction.** Tool pages load no analytics (D-007), inputs
   stay on-device except classified exceptions, claims scoped to what's true
   (D-002). "Nothing your visitor types leaves their browser" is both the
   user promise and the licence buyer's compliance story.
6. **Findable on-site.** Catalogue search, category hubs, related tools,
   `help.html` with `?q=` deep links, sitemap page — a lost user is a failed
   tool, whatever the code quality. Search stays a visible type-in field, works
   with short plain-language queries, tolerates synonyms/misspellings, ranks the
   best answer first and offers recovery when nothing matches. Measure first-
   query success; do not make users learn advanced syntax.

## 3. Design — the award-level standard

Judged the way Awwwards judges: **Design 40%, Usability 30%, Creativity 20%,
Content 10%** (CSS Design Awards: UI, UX, Innovation separately). The
consistent finding: winners pair expressive visuals with clear hierarchy,
frictionless menus, semantic HTML, responsive layouts, performance budgets
and accessibility-minded interaction. Creativity is a tool, not a costume.

- **Two design systems, never mixed** (CONSTRAINTS.md): Product A cyan
  terminal (`--accent:#2dd4ff`), Product B neon night (`--hot:#ff2e63`).
  Guarded by `design-audit.js --strict`.
- **Usability is 30% of the score.** Intuitive navigation, frictionless flows,
  mobile-first (designed for the phone, not squeezed from desktop),
  thumb-zone targets **44×44px minimum** on conversion paths, visible focus
  everywhere and keyboard-complete task paths.
- **Accessibility is product quality.** Apply WCAG 2.2 AA per template (4.5:1
  body contrast, 3:1 large text, 200% resize without breakage, no colour-only
  meaning, alt text, captions/transcripts and a reduced-motion path). Success
  Criterion 2.5.8 sets a 24×24 CSS-pixel pointer-target minimum subject to its
  spacing, equivalent, inline, user-agent-control and essential exceptions;
  this site uses 44×44 as an internal ergonomic bar on conversion paths. Static
  guards (`check-a11y.py`, `design-audit`) never replace manual keyboard,
  contrast and 360–390px browser evidence. Template walkthroughs also prove
  focused controls are not hidden by sticky layers, drag actions have a
  non-drag pointer alternative, and help/error content remains available when
  it is needed — WCAG 2.2 details that a generic “keyboard works” claim misses.
- **Perceived quality is tested, not asserted.** For major visual work, run an
  unmoderated five-second comprehension check (what is this, what can I do,
  what should I trust?) and a moderated preference/desirability comparison
  against the current surface. A jury score or stakeholder taste cannot waive
  task clarity.
- **Performance is design.** A beautiful page that loads in 8 seconds wins
  nothing. Budgets: §1d thresholds + first-screen payload budgets (OPEN.md
  P3-T3). Motion supports the story (transitions, reveals, feedback) and
  respects `prefers-reduced-motion`.
- **Content & storytelling (10%, and 100% of the money pages).** Clear
  hierarchy, honest voice, no dark patterns, no fake urgency. The money pages
  (`donate.html`, `sponsor.html`, `embed.html`) win on plainspoken trust, not
  decoration — GoFundMe's double Webby is the reference point.

## 4. Money — the viability standard

Nothing here is passive (INCOME.md's honest headline stands). The standard is
a portfolio where **at least one line is traffic-independent and recurring**,
so a search downturn wounds but never kills. Financial viability means positive
whole-site operating contribution after cash costs and valued maintainer time,
not gross sales; resilience means customer/channel concentration is visible and
renewal maintenance is funded before annual cash is treated as spendable.

Ranked by expected return per hour (per STRATEGY.md, reaffirmed):

1. **Embed licensing** — recurring and traffic-independent, with the proposed
   £99 single / £299 category / £899 white-label tiers documented in
   STRATEGY.md. Terms, support cost and the first buyer still require owner
   action; the first licensee will come from a real conversation, not more
   speculative pages.
2. **Content ID + distribution** — a candidate music route, still off until
   rights, provider terms and net contribution are evidenced.
3. **YouTube Partner Programme** — eligibility and revenue remain owner-side
   checks; subscriber/watch-hour status and policy review are not inferred here
   (OPEN.md P0-M1).
4. **Sponsorship** — second string for tools, priced from real GA numbers,
   cross-selling licensing to CPM-shy enquirers. House rules stay
   (labelled slot, 5% rule, no crypto speculation — which is also why token
   promotion stays off).
5. **Sync licensing** — a potentially high-value music route when rights are
   fully cleared. Needs the dedicated page, rights inventory and buyer evidence
   (OPEN.md P1-M4); no placement price or conversion rate is assumed.
6. **Donations** — an optional support route; measure net contribution and
   supporter experience before deciding whether to optimise it.
7. **Affiliate (`freecash.html`)** — contained, not a growth line.

Never, reaffirmed: display ads on tools (destroys the differentiator for
pounds), paywalling tools (breaks the licence funnel), lead-capture in embeds
("nothing leaves the browser" is the compliance feature), crypto/token
promotion (criminal-exposure risk per FINANCE.md §3; page kept, unpromoted,
per CONSTRAINTS.md), view-bots/hidden players/fake engagement (channel
termination risk).

**Stack doctrine:** licensing (recurring, traffic-independent) → distribution/
Content ID → sponsorship priced from reality → sync → optional owned-audience
sponsorships → digital products → donations. Each layer needs its own cost,
privacy, fulfilment and contribution-margin evidence; industry CPMs or “near-
100% margin” slogans are not this site’s baseline. Affiliate stays contained
under strict relevance + disclosure rules. New layers ship as owner-signed
proposals (OPEN.md P1-M6), never as staff improvisation.

**Measurement is the standard's teeth:** every money page measurable within
the D-007 analytics footprint (no expansion without the owner); funnel
events for Embed→licence page, sponsor enquiries, donation clicks, YouTube
click-throughs. Price from data, never from hope. Bookkeeping per FINANCE.md
§2 (separate account, five-column sheet, £1,000 trading-allowance watch,
W-8BEN per payer before distribution).

## 5. Popular — the legitimate-growth standard

No growth hacks, ever (CONSTRAINTS.md + D-ecosystem): no bots, hidden
players, autoplay tricks, pods, fake counts, fake urgency. Legitimate loops
only, each compounding:

1. **Embeds → backlinks → rank → traffic → embeds.** The master loop; gated
   on the attribution decision (§1c).
2. **Topical authority → qualified discovery.** Guides and blog posts answer
   real questions (spec: OPEN.md P1-R4), each with a useful route to its tool
   and back. Expand from Search Console queries and moderated research, never
   from a filler quota or assumed search volume.
3. **YouTube flywheel.** Existing music surfaces such as `radio.html` and
   `thisorthat.html` should support intentional listening and verified outbound
   destinations. Measure qualified starts, listening completion and owner-side
   channel evidence; never infer watch hours or manufacture engagement.
4. **Outreach with something to offer.** Resource pages (.ac.uk, .org.uk,
   libraries, charities), "free for your website" vertical pages, digital PR
   from original data — all offering genuine value, never begging links.
   Run the journalist layer too: relevant source requests, a quarterly data-
   study cadence and relationships built around something genuinely useful.
   Do not publish placement or conversion percentages without a named study;
   relationships and editorial quality matter more than a quota.
5. **Owned audience.** Email can create a direct relationship that search does
   not control, but it is a product decision, not a free growth hack. The signup
   must earn its place with an honest value proposition, explicit consent,
   useful issues and a privacy review — never a dark pattern.
6. **Word of mouth by design.** Shareable results (thisorthat top-5),
   bookmarkable stable tool URLs, explainable numbers ("why this number"),
   honest CTAs. A tool worth linking is the only growth hack that compounds.
7. **Brand as trust.** Consistent names, accurate identity and genuinely useful
   work make the site easier to recognise and recommend. Track branded queries
   and qualified mentions as evidence, not as a guaranteed moat. Be useful,
   be named, be worth citing.

## 6. Scoreboard — how perfect is measured

The canonical scorecard is [`scoreboard.json`](scoreboard.json), checked by
`scripts/check-scoreboard.py`. It covers 30 metrics across usefulness,
discoverability, experience, trust, viability and operations — the last of which
records the production contract, deploy freshness and response budget as
measured-by-gates, and availability and time-to-restore honestly as
`not-measured` until real incidents and a real instrument exist. Each row names an owner,
instrument, cadence, direction, decision use and guardrail; the current state
may honestly be `not-measured` or `owner-measurement-required`.

The non-negotiable release gates are:

- `node scripts/check-finance.js` and the applicable YMYL suite pass;
- `bash scripts/verify.sh` passes, including catalogue, links, egress,
  accessibility and measurement-contract checks;
- the live site still matches what was shipped: the production monitor holds
  within a deployment cycle, or the `ops:production-alert` issue names the
  failure and its owner ([OPERATIONS.md](../docs/OPERATIONS.md));
- no known critical keyboard, privacy, correctness, security or product-boundary
  regression ships;
- touched interactions have browser evidence at narrow mobile and desktop
  widths, with reduced motion considered;
- Search Console, CrUX, bookkeeping or usability claims cite their instrument
  and date, or explicitly say the evidence is not available.

Review the standard when Google or a primary source changes guidance, when an
owner instrument becomes available, when a target is reached, or when evidence
contradicts it. A standard that cannot be updated from evidence is a
superstition.
