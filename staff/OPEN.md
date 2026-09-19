# OPEN — human work queue

Rebaselined 2026-09-15 against commit `9d5d77558d9e5c6e6e5169644afb8a7f348a5b88`
(1149 cards, catalogue WARN-free; the current 20-section `verify.sh` gate is
kept green). This is a
prioritisation aid, **not** a claim that an agent is currently working.
File-scope claims under `claims/` show reservations; fresh
`node scripts/ai-developer.js plan` output supplies measured findings.

Read with [NORTH-STAR.md](NORTH-STAR.md) — the ethos (brilliant, useful,
profitable, famous) — [OPERATING-PLAN.md](OPERATING-PLAN.md) — the stage-gated
execution sequence — and [EXCELLENCE.md](EXCELLENCE.md) — the measurable
standard every item below serves. The machine-checked [scoreboard](scoreboard.json)
keeps instruments, guardrails and `not-measured` states explicit. Read
[RESEARCH.md](RESEARCH.md) for why this system was rebuilt. Standing rules:
[DECISIONS.md](DECISIONS.md), [CONSTRAINTS.md](../CONSTRAINTS.md),
[STRATEGY.md](../STRATEGY.md), [FINANCE.md](../FINANCE.md). Historical context
lives in `BOARD.md`, Git history and linked issues; nothing below silently
declares old work accepted.

**How to read the IDs:** P0 = measure first (unblocks everything, mostly
owner-side). P1-R = rank. P1-U = usefulness. P1-M = money. P2-D = design
excellence. P2-P = popularity flywheel. P3-T = tech debt that gates the
above. Work top-down within each band; one focused change at a time.

## Closed at this rebaseline

| ID | Outcome | Evidence |
|---|---|---|
| STAFF-01 | Trustworthy finance tools and aligned tests | `check-finance.js` reconciled to shipped code 2026-09-11; 96/100 pass, 4 remaining are `embed.html` licensing assertions describing an offer the page no longer makes — an owner monetisation decision, not a defect (FINANCE.md §1). |
| STAFF-02 | Reliable catalogue loading/retry with regression coverage | Loader + fast-path suites green in `verify.sh`; prerender/fast-path behaviour pinned by tests. |

## P0 — Measure first (nothing here invents demand)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P0-M1 | Real search and revenue data flowing | `seo` + `finance` + owner | Owner (~1 hour total): (1) Google Search Console — verify (meta tag or DNS) + submit `sitemap.xml`; (2) Bing Webmaster Tools — same; (3) YouTube Studio → Analytics → Overview — record current YPP eligibility/watch-hour evidence; (4) GA read on allowed pages: which pages get traffic, which send YouTube/donate/sponsor clicks. Acceptance: dated numbers on BOARD.md from the owner; staff then pick the top 10–25 tools from queries, not guesses. | Unclaimed · owner-dependent |
| P0-M2 | Performance and accessibility baselines from real instruments | `reliability` + `visual-design` | Run PageSpeed Insights (mobile + desktop) on index, tool shell, one guide, listen; record LCP/INP/CLS + CrUX field data where available. Run axe/Lighthouse per template. Acceptance: dated baseline table on BOARD.md; budgets in EXCELLENCE.md §1d/§3 become enforced (a change that regresses them fails review). No new tracking, no lab-score theatre. | Unclaimed · no owner block |
| P0-M3 | Analytics footprint reconciled with D-007 | `privacy` + owner | GA (`G-G058FVW6Z2`) now loads on **43 pages** (measured 2026-09-15); D-007 bound it to the ~14 pages carrying it at ruling time and made any expansion an owner decision. Acceptance: owner either ratifies the current set (D-007 amended with the page list) or names pages to strip; `check-finance.js` D-002 section and privacy copy updated to match. Until then, no page added or removed. | Unclaimed · owner decision |
| P0-M4 | Measurement contract and study plan active | `measurement` | Keep `staff/scoreboard.json` schema-valid and the operating plan current. Establish the first dated evidence packet without inventing baselines: Search Console/CrUX availability, five qualitative task sessions, correctness gates, owner bookkeeping and music evidence remain separate instruments. Acceptance: `python3 scripts/check-scoreboard.py` passes; `BOARD.md` records each instrument as measured, unavailable or owner-dependent; the next work item names one primary metric and guardrails. | Unclaimed · no owner block for the contract; evidence packet owner-dependent |

## P1-R — Rank (first on Google for the queries we can win)

Thesis: every indexable URL must genuinely help the user (EXCELLENCE.md §0).
Do P0-M1 first — the "which pages" answers come from Search Console.

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-R1 | Titles + descriptions that earn a qualified visit | `seo` + `measurement` | Use Search Console to find proven queries and write an honest task promise (query + differentiator such as "Free · No sign-up · Runs in browser"). Then satisfy the intent above the fold so a click becomes a completed task, not a bounce. CTR and return-to-SERP are diagnostic signals, not secret ranking formulas or universal targets. Acceptance: unique, accurate, no invented reach; before/after Search Console comparison by URL/query/device after a useful observation window, plus a moderated find-to-result task check. | Unclaimed · needs P0-M1 for priorities, copy fixes can start |
| P1-R2 | Prerendered static pages for the top 10–25 proven tools | `catalogue` + `seo` + `reliability` | The structural gap: all tools share client-side `tool.html?card=<slug>` — thin unique text, query-param URLs, invisible to non-JS crawlers. Build-time generator (same pattern as `build-home-prerender.py`/`build-sitemap.py`) emitting static per-tool pages with unique content per URL: how-to, worked example, FAQ, sources; card fragment stays the single implementation; server-side canonical + WebApplication/BreadcrumbList/FAQ schema. Start with the Search Console top 10–25 only — never all 1149 at once; Google’s people-first and spam guidance makes quality and distinct value prerequisites, not a guarantee that a page batch will rank. Acceptance: Rich Results Test valid, `--check` drift gate in `verify.sh`, submitted to Search Console and reviewed after a useful observation window; indexing is recorded as evidence, never promised. | Pilot **and its generator** landed 2026-09-19: `scripts/build-tool-pages.py` + `scripts/tool-pages.json` render `tools/*.html` (3 pilot pages now reproduced byte-for-byte, +loan/BMR/percentages), `--check` gates drift in `verify.sh` §16, and `tool-pages.test.js` compares the visible FAQ with the FAQPage structured data. Rollout past these 6 still needs P0-M1 (Search Console) — the list is evidence-led, not hand-picked. |
| P1-R3 | Category hubs with real content + tightened internal links | `seo` + `catalogue` | Each hub: genuinely useful category overview (what these tools do, which to pick, links to guides), breadcrumbs, curated related links (keep `related.json` curated, not mechanical). Acceptance: every hub has unique content a human would read; `check-links.py` stays green; crawl depth tool ≤ 3 clicks from index. | Unclaimed |
| P1-R4 | Guides/blog as the long-tail engine (quality-gated) | `seo` | Grow only from Search Console queries, moderated research and real support questions: direct answer first, tool embed, worked numbers, cited sources, Article schema, visible updated dates. Each post ↔ its tool, both directions. Acceptance: no filler (each post passes "would I send this to a friend?"), submitted and reviewed after a useful observation window; revise when evidence shows weak usefulness. | Unclaimed · needs P0-M1 for topics |
| P1-R5 | Freshness + E-E-A-T trust surfaces | `seo` + `finance` + `privacy` | `about.html`: keep current, add last-updated, corrections policy, methodology (how tools are tested), Person/Organization schema, official-profile links. YMYL-adjacent pages: named authorship, sourced formulas (HMRC/NHS/legislation), caveats intact (already shipped — guard them). Acceptance: a quality rater finds author, method, date and corrections path within two clicks of any money/health tool. | Unclaimed · small start, no owner block |
| P1-R6 | Translated cluster: enrich or consolidate | `seo` + owner | 12 thin landing pages (`bengali`…`thai`). Thin translations are a scaled-content liability, not an asset. Owner picks per language: real localisation (native-quality, useful) or consolidate (`noindex`/remove + hreflang cleanup). Acceptance: every surviving translated URL is genuinely useful; no unreviewed hreflang changes (standing rule). | Unclaimed · owner decision |
| P1-R7 | Index hygiene: sitemap/robots/canonicals stay exact | `catalogue` | Already strong (`build-sitemap.py --check`, `check-links.py` green, 1232 URLs). Keep: intended URLs indexed, thin/scratch unindexed, canonicals valid. After P0-M1, reconcile Search Console coverage against intent monthly. Acceptance: every exception is classified, owned and either fixed, consolidated or deliberately retained with evidence; no blanket indexing promise. | Standing · unclaimed |
| P1-R8 | Entity authority: be a node, not a keyword | `seo` + owner | Make the Organization/Person identity consistent and accurate: stable `@id`, connected `@graph`, relevant sameAs links, one-sentence entity definitions and genuine corroboration. No correlation coefficient or knowledge-graph result is treated as a guaranteed SEO lever. Owner-side: Wikidata/company profiles only where notability and identity support them. Acceptance: schema validates, identity facts match across owned profiles, and any external resolution result is recorded with instrument/date rather than promised. | Unclaimed · staff schema now, owner identity items need O-10 |
| P1-R9 | Field-data performance watch (no new tracking) | `reliability` + `measurement` | Lab scores diagnose causes; CrUX/PageSpeed field data at p75 is the evidence, on a 28-day rolling window. Run scheduled off-site checks on index, tool shell, one guide and listen; alert on regression without adding on-page tracking. Acceptance: monthly field-data table on BOARD.md; any red metric gets an OPEN.md item within a week. The official good thresholds are LCP ≤2.5s, INP ≤200ms and CLS ≤0.1; INP ≤150ms is an internal stretch target, not Google’s bar. | Unclaimed · no owner block |

## P1-U — Useful (brilliant at the task)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-U1 | Extend the finance *method* to health/legal calculations | `finance` | Sourced test vectors + boundary sweeps + invariants for the highest-stakes non-finance calculators (dosage-adjacent, tenancy/deposit, NDA/contract dates). Not the whole catalogue — highest stakes first. Acceptance: new assertions in `check-finance.js` (or a sibling suite) from independent derivations; caveats present; browser-verified. | Partly shipped on `arena/01a0a58d` (`check-ymyl.js`: BMI + deposit cap, wired into `verify.sh`) · dosage-adjacent + browser proof remain |
| P1-U2 | On-site findability: search, hubs, help | `catalogue` + `reliability` | Search finds the right tool in keystrokes (typo tolerance, synonym awareness); `help.html` `?q=` coverage kept; empty/no-result states that guide, not dead-end. Acceptance: 10 scripted find-the-tool tasks, timed before/after, no regressions. | Unclaimed |
| P1-U3 | Offline-first decision executed (`sw.js`) | `reliability` + owner | `sw.js` ships unregistered (dead code) on a site whose pitch is offline-first tools — either a real win (tested offline strategy, Class C tools failing gracefully) or deleted. Owner decides; staff implement + browser-prove. Acceptance: registered-and-tested or removed-from-repo, `verify.sh` green either way. | Unclaimed · owner decision |
| P1-U4 | Input-egress classification policy settled | `privacy` + owner | `spelling-check`, `languages`, `plant-encyclopedia` send typed text to third-party APIs by design — Class C per precedent, but the policy question (is designed egress "live-data" or "input egress"?) is open, with warnings already visible. Owner rules C-vs-A; staff encode + document. Also prune or keep the vestigial `currency`/`ai-mcp-protocol-tool-tester` KNOWN entries. Acceptance: ruling recorded in DECISIONS.md, scanner + copy match it. | Unclaimed · owner decision |
| P1-U5 | Explainable, shareable results (word of mouth by design) | `reliability` + `seo` | "Why this number" beats "trust this number": every result explainable (formula shown, inputs echoed), key results shareable/bookmarkable (stable URLs, copy-result, share text that carries the brand). A tool worth linking is the only growth hack that compounds. Start with the P1-R2 pilot tools. Acceptance: pilot tools show their working + share cleanly; no input values leak into shared URLs/credentials-adjacent surfaces. | Unclaimed |

## P1-M — Money (viable without waiting for permission)

Ranked by expected return per hour (STRATEGY.md). Staff prepare everything;
the owner signs and sends — the first pound comes from an email, not a page.

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-M1 | YouTube eligibility decision grounded in owner evidence | `music` + owner | Owner records current eligibility, policy status and watch-hour evidence (P0-M1); staff keep `radio.html`/`thisorthat.html` legitimate funnels (no autoplay/hidden-player "improvements"). If the channel is not eligible, the owner chooses whether a dated plan is worthwhile. Acceptance: owner evidence and decision recorded; no assumed revenue or deadline. | Unclaimed · owner-dependent |
| P1-M2 | Content ID + distribution switched on, correctly | `music` + `finance` + owner | Catalogue onto a distributor with Content ID; **W-8BEN filed per payer first** (else silent 30% US withholding — FINANCE.md §2); UTR/NI ready; renewal diarised (3 years + year signed). Acceptance: distribution live, W-8BENs confirmed, bookkeeping sheet recording receipts. | Unclaimed · owner-dependent |
| P1-M3 | Embed licensing ready for one signature (+ backlink engine) | `finance` + `seo` + owner | Status: `embed.html` ships bare iframes — no attribution, no offer. Staff prepare (no live change until signed): (1) free tier = credit link back (exact snippet + placement); (2) paid tiers £99/£299/£899 with terms (sites, renewal, self-host option); (3) statutory-update changelog ("2026/27 bands applied 6 April") as the trust asset; (4) funnel events within D-007 (Embed views → copies → licence page); (5) first-licensee pack: 10 UK brokers/accountancies + working-embed-on-their-staging demo script — the owner sends it. Acceptance: owner signs terms; page + events + changelog ship together; `check-finance.js` licensing assertions green again. | Proposal ready to draft · owner decision |
| P1-M4 | Sync-licensing page that closes | `music` + `finance` | Dedicated page: one-stop rights, moods/uses, an owner-approved pricing path, enquiry route and honest catalogue facts. Take advice before signing the first meaningful licence (royalty tax treatment differs — FINANCE.md §2). Acceptance: page live, enquiry route tested, first 5 supervisor/agency emails drafted for the owner; no placement price is published without rights and buyer evidence. | Built on `arena/01a0a58d` (`sync.html` + listen footer link, unmerged) · supervisor emails still to draft |
| P1-M5 | Sponsorship priced from reality | `finance` + owner | After P0-M1: real GA figures → honest rate guidance on `sponsor.html` (keep: no published inflated card, labelled slot, 5% rule); cross-sell licensing to CPM-shy enquirers. Acceptance: every figure quotable from GA; house-rule promises intact (guarded by `check-finance.js`). | Unclaimed · needs P0-M1 |
| P1-M6 | Layer the stack: newsletter, digital products, contained affiliate (proposals) | `growth` + owner | Display ads are one layer, never the strategy — and on tools they stay off (the licence buyer buys a clean embed). Staff prepare owner-ready proposals: (1) newsletter sponsorship ladder after provider/privacy review — no industry CPM assumed; (2) digital products with explicit production, fulfilment and support costs; (3) affiliate rules that keep it contained (relevance test, disclosure, no review-farming). Nothing live without a signature. Acceptance: one proposal doc per line with costs, effort, contribution-margin assumptions and first-step owner action. | Unclaimed · owner decisions |
| P1-M7 | Link the offer + convert honestly | `growth` | `check-growth.py` (2026-09-15) found `embed.html` genuinely orphaned — no hub links to the licensing page; money can't convert from a page nobody reaches. Fix: footer/hub links to every money page (respecting Product A/B separation), one ask per screen, plainspoken trust copy, OG/social polish. No terms change, no new tracking. Acceptance: `check-growth.py` warning-free; task completion (find ask → act) tested on mobile; dark-pattern scan stays clean. | Unclaimed · no owner block |

Deliberately not done (reaffirmed, see EXCELLENCE.md §4): display ads on
tools, paywalling tools, lead-capture in embeds, crypto/token promotion,
view-bots/fake engagement. Donations stay as-is (real but small); affiliate
stays contained.

## P2-D — Design excellence (award-level, measured)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P2-D1 | WCAG 2.2 AA per template, with browser evidence | `visual-design` | Contrast 4.5:1 body / 3:1 large, 200% resize, no colour-only meaning, alt/captions, reduced-motion path, visible focus, keyboard-complete paths — per template (index, tool shell, guide, money pages, music hub), not sitewide-average. Acceptance: axe/Lighthouse clean + manual keyboard + 360–390px geometry evidence per touched template. | Unclaimed · standing for every visual change |
| P2-D2 | 44×44px touch targets on conversion paths | `visual-design` | Audit + fix tap targets on find→use→result, embed-copy, donate/sponsor CTAs and player controls. Acceptance: no applicable target under the internal 44px bar on those paths, with any exception recorded; WCAG 2.2 SC 2.5.8 AA uses a 24×24 CSS-pixel pointer-target minimum subject to spacing, equivalent, inline, user-agent-control and essential exceptions. | Unclaimed |
| P2-D3 | Money pages that earn trust | `visual-design` + `finance` | `donate`/`sponsor`/`embed`/licensing: plainspoken, scannable, one ask per screen, OG/social polish. Reference: purpose-driven clarity (GoFundMe's double Webby), not decoration. Acceptance: task completion (find ask → act) tested on mobile; no dark patterns, no fake urgency. | Unclaimed |
| P2-D4 | Award-readiness path (jury standard, then submission) | `visual-design` + owner | Bar first, trophy second. Bring one surface (listen.html is the candidate: a contained, expressive music experience) to SOTD standard against the published criteria — Design 40 / Usability 30 / Creativity 20 / Content 10, mobile-native, CWV green, keyboard + reduced-motion complete — with the evidence checklist filled. Then the owner verifies any current submission fee and decides whether to submit. Win or lose, the process leaves a better page. Acceptance: checklist green with browser evidence; submission is an owner call (O-12), never staff-spent money. | Unclaimed · prep is staff, submission is owner |

## P2-P — Popularity flywheel (legitimate only)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P2-P1 | Embed loop live (needs P1-M3 terms) | `seo` | Attribution snippet shipped → track referral/backlink growth in Search Console (links report) monthly. Acceptance: embeds in the wild link back; no bare-iframe default. | Blocked on owner terms |
| P2-P2 | Outreach engine: packs + journalist sourcing + data studies | `seo` + `growth` + `music` | Three layers, all offering genuine value: (1) resource-page pack (.ac.uk/.org.uk/libraries: free, no signup, runs in browser, accessible) + vertical page draft ("free mortgage calculator for your website" → licence funnel); (2) relevant journalist/source requests where the owner can provide a real quote or dataset; (3) digital-PR data studies built from reproducible first-party evidence. Do not use generic placement, conversion or link-multiplier percentages without a named study and population. Acceptance: packs ready; owner chooses any sourcing accounts; one evidence-backed study per quarter is an ambition, not a fabricated quota; earned links and mentions tracked monthly. | Unclaimed |
| P2-P3 | Listener journey verified, growth legitimate | `music` | Click-to-play, dismissal/keyboard, outbound destinations manually verified on every Product B touch; handle/ID table preserved (CONSTRAINTS.md); radio/thisorthat funnels intact. Acceptance: manual playback evidence; zero manufactured engagement. | Standing · manual validation |
| P2-P4 | Owned audience: newsletter pilot (owner decision) | `growth` + `measurement` | A newsletter can create a direct relationship that search does not control, but the business case must be measured rather than borrowed from industry CPM claims. Owner picks the provider (account + cost + privacy review); staff prepare the signup surface spec (honest value prop, no dark patterns, explicit consent) + first 4 issues outline from existing catalogue depth. Acceptance: provider live only after owner approval, the value exchange is clear, and four issues plus subscriber, unsubscribe, engagement and sponsor evidence are recorded with their instrument. | Unclaimed · owner decision (O-11) |

## P3-T — Tech debt that gates the above

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P3-T1 | Product boundaries + privacy copy match standing decisions | `privacy` | `site-audit.js boundaries` reports tool-side music links and analytics/claim combinations for contextual review. Don't auto-remove navigation, shift analytics, or reinterpret policy — escalate to owner. Includes the P0-M3 reconciliation. Acceptance: review recorded; escalations explicit. | Unclaimed · review + escalation |
| P3-T2 | Shared-DOM collision debt retired (126 top-level JS names) | `reliability` + owner | IIFE-wrap cards to kill the collision class (catalogue ID collisions already fixed 2026-09-15; this is the JS-name remainder). Large mechanical diff — owner confirms worth it before staff start. Acceptance: `check-card-collisions.py` clean by construction; behaviour unchanged (regression suites + browser spot-checks). | Unclaimed · owner call on size |
| P3-T3 | First-screen payload budgets enforced | `reliability` | Candidates from ROADMAP (async the ~32KB hidden-component CSS with hide-rules kept critical; trim derived `id`/`file`/`path` from `cards.json` ~108KB raw; analytics timing is owner-called). Competitive target INP ≤ 150ms at p75 (P1-R9). Gate with P0-M2 budgets: land only measured-before/after wins, browser-verified (no blind CSS moves). Acceptance: LCP/INP improve or stay green; `verify.sh` green. | Unclaimed |
| P3-T4 | Ship-or-delete legacy + licence | `delivery` + owner | `indexbeta.html`, `hokidea.html`, 4 unlinked CV files, `substitutions/`, `system/`, `digitaldetoxcardshtml/` (CONSTRAINTS.md: currently leave alone), `launch/` raw-`.md` links, LICENSE choice. Owner rules per item; staff execute + regenerate sitemap/counts. Acceptance: each item shipped, archived, or deleted with its links intact. | Unclaimed · owner decisions |
| P3-T5 | Third-party + payload diet (the INP/LCP risks we control) | `reliability` | Audit every third-party call the site makes (CDN libraries per D-009 Class B, fonts, QR/QR-adjacent libs, embeds) + the heaviest payloads (index inline JS/CSS, cards.json, embed.html): vendor or drop what isn't earning its bytes, defer/async the rest, keep hide-rules critical. Analytics timing stays owner-called. Acceptance: measured-before/after wins on P0-M2 budgets, browser-verified; `verify.sh` green. | Unclaimed |

## Owner asks — the explicit list (nothing else needs the owner)

| # | Question | Why it matters | Needs |
|---|---|---|---|
| O-1 | Set up Search Console + Bing WMT; share YPP watch hours + GA read (P0-M1) | Unblocks all evidence-based SEO and honest pricing | ~1 hour + Google account |
| O-2 | Ratify or trim the 43-page GA footprint (P0-M3) | D-007 compliance; claim truthfulness | One ruling |
| O-3 | Sign embed terms: attribution + £99/£299/£899 licensing (P1-M3) | Switches on revenue + the backlink engine | One signature |
| O-4 | Send the first 10 licence emails + 5 sync emails (P1-M3/M4) | The only action that converts pages to pounds | ~2 hours |
| O-5 | Rule on translated cluster: enrich or consolidate (P1-R6) | Removes a scaled-content liability | Per-language ruling |
| O-6 | Rule on `sw.js`: enable tested or delete (P1-U3) | Offline-first credibility | One ruling |
| O-7 | Rule on egress C-vs-A policy (P1-U4) | Legal/privacy correctness | One ruling |
| O-8 | Switch on distribution + file W-8BENs (P1-M2) | Allows the owner to confirm current tax treatment and net contribution before distribution | Account + payer-by-payer tax review |
| O-9 | Rule on JS-collision cleanup size + legacy ship/delete + LICENSE (P3-T2/T4) | Unblocks debt retirement | Per-item rulings |
| O-10 | Entity identity: Wikidata item + company profiles (P1-R8) | Keeps identity facts consistent where notability supports a profile; external resolution and citation are measured, not promised | Identity + a little profile admin |
| O-11 | Newsletter provider choice (P2-P4, feeds P1-M6) | Switches on the owned audience + sponsorship ladder | One account + cost call |
| O-12 | Award submission yes/no once P2-D4 prep is green | Trophy optional; the prep work improves the page regardless | Current fee check + one ruling |
| O-13 | Approve a privacy-safe moderated task-study method | Unlocks evidence about findability and task success without adding site tracking | One recruiting/consent call; no tool input retention |

`token.html` stays kept-but-unpromoted (CONSTRAINTS.md); analytics placement,
monetisation terms, catalogue retirement and protected files remain
owner-only per CONSTRAINTS.md/DECISIONS.md. A provider key/model is optional;
its absence blocks nothing except reviewed draft generation.

## Claiming and finishing work

Use `python3 staff/coordinate.py claim …` and post context to `BOARD.md`.
Release or block with validation results and explicit next steps. Do not turn
an unclaimed profile assignment into "in progress" without a real session.
One focused change at a time is preferable to competing edits of shared
pages. Never convert a missing metric into an invented claim — "not yet
measured" is the honest value (D-001).
