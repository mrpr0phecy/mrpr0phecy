# EXCELLENCE — the standard this site is held to

What "perfect" means here, in measurable terms. This is the sister document
to [OPEN.md](OPEN.md): OPEN.md is the ranked queue, this file is the bar
every item is judged against. Written 2026-09-15 from a full review of
current award, search, accessibility and monetisation practice. It does not
override [DECISIONS.md](DECISIONS.md), [CONSTRAINTS.md](../CONSTRAINTS.md) or
[ARCHITECTURE.md](../ARCHITECTURE.md) — where they conflict, those win and
this file gets fixed.

## 0. The honest headline about "first on Google"

Nobody ranks first on Google *in general*. What the best tool sites actually
achieve is **position 1–3 for hundreds of specific long-tail queries with
clear intent** ("UK take-home pay calculator", "BMI calculator NHS formula",
"split test significance calculator") — plus citations inside AI answers for
the same queries. That is the target below, and it is realistic for this
site for one structural reason the research keeps confirming: **interactive
tools are among the most resilient formats in AI-era search**, because an AI
summary can describe a calculator but cannot replace using one. Thin
programmatic pages lost 50–80% of traffic in Google's March 2026
scaled-content enforcement; pages with real utility kept ranking and started
earning AI citations as well. Three structural facts shape everything below:
**60% of searches now end without a click** (AI Overviews cut position-1
clicks ~34–58% on informational queries — but cited brands gain ~35% more
clicks and surviving clicks convert ~23% better); **March 2026 applies a
sitewide weakest-link demotion** (thin pages don't just fail, they drag the
whole domain down); and **Google rewards "the company that owns the thing"**
(first-party tools, data and authority over aggregators and affiliates).

The plan therefore has exactly one SEO thesis: **every indexable URL must
pass the test Google has applied since 2023 — does this page genuinely help
the user, or does it exist primarily to capture search traffic?** Everything
below is that thesis, operationalised.

Useful background already in the repo: [STRATEGY.md](../STRATEGY.md) (why
traffic-independent revenue matters as search changes),
[INCOME.md](../INCOME.md) (music income), [FINANCE.md](../FINANCE.md)
(correctness + obligations).

## 1. Rank — the #1 standard

Ranked by impact, per every 2026 source: content quality + intent match first,
E-E-A-T and backlinks next, Core Web Vitals as the tie-breaker when content
is close.

### 1a. Content quality and intent match (top factor)

- Each ranking page matches the **dominant SERP format** for its query and
  answers the query **above the fold**: the tool usable within seconds, the
  direct answer in the first screen.
- **Topical depth over page count.** One resource that answers the full
  question set (tool + how-to + worked example + FAQ + sources) beats five
  thin pages. Never publish a page whose unique value fits in one sentence.
- **Long-tail and question queries first.** New sites win on specific,
  low-competition queries (roughly 90–400 searches/month to start) and
  "People Also Ask" questions — a good answer there can outrank the #2 result
  for the head term. Head terms ("mortgage calculator") are a year-2 fight.
- **Freshness is maintenance, not date-swapping.** Statutory figures every
  April (already guarded by `check-finance.js`), visible "last updated" dates
  on guides/YMYL pages, meaningful refreshes only.
- **No keyword stuffing, no exact-match repetition games, no bought links.**
  All are demotion/penalty material. Third-party "Domain Authority" is not a
  Google signal — ignore it; track real positions and clicks in Search
  Console instead.

### 1b. E-E-A-T, and YMYL where it applies (high impact)

Finance, health, legal and safety tools are **Your Money or Your Life**:
Google's strictest bar, where wrong answers cause real harm and Trust is the
pinnacle signal — experience, expertise and authority count for nothing on an
inaccurate page.

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

Google's thresholds, unchanged into 2026, measured at the **75th percentile
of real Chrome users (CrUX field data, 28-day rolling)** — lab scores don't
rank you. Mobile is graded separately and is far harder to pass (~50% of
origins pass all three on mobile).

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

Competitive target: **INP ≤ 150ms at p75** (Google's bar is 200ms; top sites
clear 150). Optimise at template level, fix order TTFB → LCP → INP → CLS,
and judge on field data only — allow weeks after deploying before declaring
a fix (28-day rolling window). Off-site CrUX/API monitoring adds no on-page
tracking (OPEN.md P1-R9).

### 1e. Technical SEO checklist (unindexed pages can't rank)

- Crawlability: `robots.txt` + `sitemap.xml` accurate and submitted (Search
  Console + Bing Webmaster Tools — both free, ~10 minutes each, still undone:
  OPEN.md P0-M1). Canonicals valid, no accidental noindex on money pages.
- **Per-tool indexability is the structural gap.** Today all 1149 tools share
  `tool.html?card=<slug>` with client-side metadata: Google *can* render JS,
  but social/AI crawlers largely don't, and query-param URLs with thin unique
  text are exactly the pattern the March 2026 enforcement hit. Fix: build-time
  prerendered static pages for the top 10–25 proven tools with unique content
  (spec in OPEN.md P1-R2), card fragments remaining the single implementation.
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

### 1f. AI-search visibility (GEO) — the second surface

AI Overviews appear on roughly half of queries and cut position-1 clicks by
over half on informational pages — but the clicks that survive convert ~23%
better, and utility pages get *cited*, not just clicked. Optimise for both
surfaces at once:

- Clear structure: direct answer first, then depth. Q&A formatting, stats,
  comparison tables, cited sources — these are the citation signals.
- Schema coverage (§1e) does double duty for organic rank and AI citation.
- Cut or rebuild pages an AI answers for free (pure definitions); double down
  on task pages (calculators, live data, generators) where the click is the
  product.
- `llms.txt` / `llms-full.txt` / `tools-index.html` (shipped, drift-gated)
  already make the catalogue machine-readable — keep them exact.

### 1g. CTR and engagement (NavBoost uses click data)

Sharp, honest titles (query + differentiator: "Free · No sign-up · Runs in
browser"), meta descriptions that promise the task outcome, favicons/OG
images that survive a tab strip. Then satisfy intent fast — bounce-back to
the SERP is the engagement signal that kills you.

### 1h. NavBoost — be the terminal click

Confirmed by DOJ testimony and the 2024 API leak: Google re-ranks on click
classifications aggregated over roughly **13 months**. goodClicks (clicked
and stayed), badClicks (pogo-sticked back within seconds — a demotion
signal), lastLongestClicks (the final, longest-dwell click of the session —
the strongest positive signal). There is no standalone "dwell time score";
dwell is the *input to the classification*. Implications:

- **Intent match is everything.** A clickbait title with disappointing
  content earns badClicks; a slow page earns them before content is even
  seen. Match the query, answer above the fold, load fast.
- **Optimise the stay, not just the click.** Task completion on-page, worked
  examples, related tools that continue the session — every second of
  satisfied dwell compounds over the 13-month window.
- **KPIs:** CTR above SERP average for the position; engagement rate > 60%;
  average engagement time > 2 minutes on long-form; scroll depth with 50%+
  reaching 75% of content. Signals accumulate over months — judge quarterly,
  not weekly.

### 1i. Entity SEO — be a node, not a keyword

AI surfaces cite entities they have confidence in, and confidence is graph
traversal: schema → Wikidata/Wikipedia/LinkedIn/registries → corroborating
mentions. **Branded web mentions correlate 0.664 with AI Overview citations
vs 0.218 for traditional backlinks** — entity signals now outrank link
signals for AI visibility. The stack:

- **On-site:** stable `@id` URIs for Organization + Person, sameAs ladders
  to authoritative profiles (identical name/photo/role everywhere — any
  drift weakens resolution), connected `@graph` (Organization ↔ WebSite ↔
  WebPage ↔ Person), `about`/`mentions` with entity intent (generic valid
  schema with no entity properties is practically useless), one-sentence
  entity definitions reused verbatim everywhere.
- **Off-site:** Wikidata item where notability allows (far more accessible
  than Wikipedia; a company with a site + independent coverage qualifies),
  Crunchbase/LinkedIn/company registries, consistent NAP, third-party
  corroboration through press and data studies. Expect 3–6 months to initial
  recognition, 6–12 to measurable citation impact.
- **Author entities are assets, not attributes.** YMYL content without an
  attributable, verifiable author carries structurally lower E-E-A-T weight.
  Measure: Knowledge Graph Search API resolution, LLM bio consistency,
  sameAs coherence, citation rate in-field.

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
   tool, whatever the code quality.

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
  thumb-zone targets **44×44px minimum** on conversion paths (WCAG 2.2
  requires 24×24; 44 is the conversion standard), visible focus everywhere,
  keyboard-complete task paths.
- **Accessibility is conversion.** WCAG 2.2 AA per template (4.5:1 body
  contrast, 3:1 large text, 200% resize without breakage, no colour-only
  meaning, alt text, captions/transcripts, reduced-motion path). Accessible
  sites convert ~15% better — this is revenue work, not compliance theatre.
  Static guards (`check-a11y.py`, design-audit) never replace keyboard,
  contrast and 360–390px browser evidence.
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
so a search downturn wounds but never kills.

Ranked by expected return per hour (per STRATEGY.md, reaffirmed):

1. **Embed licensing** — recurring, traffic-independent, priced under an
   existing market (£99 single / £299 category / £899 white-label). Status:
   page ships no offer; proposal + funnel spec ready in OPEN.md P1-M3 for one
   owner signature. First licensee comes from ten emails, not ten pages.
2. **Content ID + distribution** — best effort-to-return in music, still off.
3. **YouTube Partner Programme** — 1,360 subs clears the hard gate; watch
   hours decide. **Deadline 1 Feb 2027.** Owner checks Studio (OPEN.md P0-M1).
4. **Sponsorship** — second string for tools, priced from real GA numbers,
   cross-selling licensing to CPM-shy enquirers. House rules stay
   (labelled slot, 5% rule, no crypto speculation — which is also why token
   promotion stays off).
5. **Sync licensing** — best £/hour, most underused asset (100% rights,
   one-conversation clearance, £50–£5,000+ per placement). Needs the dedicated
   page (OPEN.md P1-M4).
6. **Donations** — real but small (0.01–0.1% conversion); don't over-optimise.
7. **Affiliate (`freecash.html`)** — contained, not a growth line.

Never, reaffirmed: display ads on tools (destroys the differentiator for
pounds), paywalling tools (breaks the licence funnel), lead-capture in embeds
("nothing leaves the browser" is the compliance feature), crypto/token
promotion (criminal-exposure risk per FINANCE.md §3; page kept, unpromoted,
per CONSTRAINTS.md), view-bots/hidden players/fake engagement (channel
termination risk).

**Stack doctrine (new):** display advertising is one layer, never the
strategy — publishers who treat it as the complete plan underperform those
who stack it under higher-margin channels. For this site the stack layers as
licensing (recurring, traffic-independent) → distribution/Content ID →
sponsorship priced from reality → sync → owned-audience sponsorships (niche
newsletter CPMs run $50–100+) → digital products (near-100% margin,
fulfilment-free) → donations. Affiliate stays contained under strict
relevance + disclosure rules. New layers ship as owner-signed proposals
(OPEN.md P1-M6), never as staff improvisation.

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
2. **Topical authority → long-tail rank.** Guides + blog answering real
   questions (spec: OPEN.md P1-R4), each post pointing at its tool, each tool
   pointing back. 12 guides + 3 posts today; quality-gated growth from Search
   Console queries, never filler.
3. **YouTube flywheel.** 233 videos + 46 Shorts exist; `radio.html` (lean-back
   sessions) and `thisorthat.html` (watch-to-play) convert site visits into
   legitimate watch hours toward YPP. Keep making music — the next 233 videos
   matter more than any page.
4. **Outreach with something to offer.** Resource pages (.ac.uk, .org.uk,
   libraries, charities), "free for your website" vertical pages, digital PR
   from original data — all offering genuine value, never begging links.
   Run the journalist layer too: Connectively/Featured/Qwoted with
   first-hour responses (60%+ higher placement), #journorequest on X, and a
   quarterly data-study cadence — consistent data PR earns 3–5× the
   high-authority links of outreach alone. Cold converts 1–3%, warm 15–30%:
   relationships first, pitches second.
5. **Owned audience.** Email is the relationship no algorithm can take:
   engaged subscribers outperform larger anonymous audiences, sponsor the
   newsletter at premium CPMs, and become first-party data. The signup must
   earn its place with an honest value prop — never a dark pattern.
6. **Word of mouth by design.** Shareable results (thisorthat top-5),
   bookmarkable stable tool URLs, explainable numbers ("why this number"),
   honest CTAs. A tool worth linking is the only growth hack that compounds.
7. **Brand as moat.** Branded queries resist AI-Overview erosion far better
   than generic ones — even brand-plus-category queries decline less. Every
   citation, mention and share that carries the name builds the two-tier
   internet's upper tier. Be cited, be named, be searched.

## 6. Scoreboard — how perfect is measured

No metric here is invented: every row names its instrument. "Not yet
measured" is a valid current value; inventing one is a D-001 violation.

| Metric | Instrument | Cadence | Target |
|---|---|---|---|
| Positions 1–3 for target long-tail queries | Search Console (needs setup) | Monthly | Growing set; top 10–25 tools first |
| Clicks + CTR per target query | Search Console | Monthly | CTR above SERP average for the position |
| Index coverage (submitted vs indexed) | Search Console + `build-sitemap.py --check` | Monthly | 100% of intended URLs indexed, 0 thin indexed |
| CWV pass (LCP/INP/CLS, mobile + desktop) | CrUX via PageSpeed Insights | Monthly | All three green at p75, both devices; INP ≤ 150ms competitive target |
| AI citations + branded mentions | Manual prompt panel + Search Console impressions/AIO views | Monthly | Cited for target queries; brand-mention volume rising |
| Branded search volume | Search Console | Monthly | Rising (the AI-erosion moat) |
| Referring domains (earned) | Search Console links + backlink index | Monthly | Rising; editorial/data-driven only |
| Entity resolution | KG Search API + LLM bio test + sameAs audit | Quarterly | Brand + author resolve as nodes |
| Task success (find tool → get result) | Manual + (if owner approves) privacy-safe events; never input values | Per change | No regressions; faster over time |
| Finance suite green | `node scripts/check-finance.js` | Every push | 100% (triage stale vs real, never hide) |
| Verify green | `bash scripts/verify.sh` | Every push | 17/17 |
| WCAG 2.2 AA per template + keyboard paths | axe/Lighthouse + manual browser pass | Per change | Pass, with evidence |
| Embed funnel (views → copies → licence page) | GA on `embed.html` (within D-007) | Monthly | Baseline then improve |
| YPP watch hours | YouTube Studio (owner) | Monthly to 1 Feb 2027 | 4,000h or 10M Shorts views |
| Sponsorship/sync pipeline | Inbox (human) | Monthly | Real numbers quoted, honest pricing |
| Licence revenue (recurring) | Bookkeeping sheet (FINANCE.md §2) | Monthly | First £, then renewal rate |
| Newsletter subs + sponsor £ | Provider dashboard (owner) | Monthly | Growing list, honest CPMs |
| Donations | PayPal + GA clicks | Quarterly | Tracked; effort capped |
| Growth surfaces clean | `python3 scripts/check-growth.py` | Every push | Exit 0, warnings tracked in OPEN.md |

Review this file when Google updates guidance materially, when a target is
hit (set the next one), or when evidence contradicts it — a standard that
can't be updated from evidence is a superstition.
