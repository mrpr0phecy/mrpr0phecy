# OPEN — human work queue

Rebaselined 2026-09-15 against commit `9d5d77558d9e5c6e6e5169644afb8a7f348a5b88`
(1149 cards, `verify.sh` 17/17 green, catalogue WARN-free). This is a
prioritisation aid, **not** a claim that an agent is currently working.
File-scope claims under `claims/` show reservations; fresh
`node scripts/ai-developer.js plan` output supplies measured findings.

Read with [EXCELLENCE.md](EXCELLENCE.md) — the measurable standard every
item below serves — and [RESEARCH.md](RESEARCH.md) for why this system was
rebuilt. Standing rules: [DECISIONS.md](DECISIONS.md),
[CONSTRAINTS.md](../CONSTRAINTS.md), [STRATEGY.md](../STRATEGY.md),
[FINANCE.md](../FINANCE.md). Historical context lives in `BOARD.md`, Git
history and linked issues; nothing below silently declares old work accepted.

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
| P0-M1 | Real search and revenue data flowing | `seo` + `finance` + owner | Owner (~1 hour total): (1) Google Search Console — verify (meta tag or DNS) + submit `sitemap.xml`; (2) Bing Webmaster Tools — same; (3) YouTube Studio → Analytics → Overview — record YPP watch-hour progress (deadline **1 Feb 2027**); (4) GA read on allowed pages: which pages get traffic, which send YouTube/donate/sponsor clicks. Acceptance: dated numbers on BOARD.md from the owner; staff then pick the top 10–25 tools from queries, not guesses. | Unclaimed · owner-dependent |
| P0-M2 | Performance and accessibility baselines from real instruments | `reliability` + `visual-design` | Run PageSpeed Insights (mobile + desktop) on index, tool shell, one guide, listen; record LCP/INP/CLS + CrUX field data where available. Run axe/Lighthouse per template. Acceptance: dated baseline table on BOARD.md; budgets in EXCELLENCE.md §1d/§3 become enforced (a change that regresses them fails review). No new tracking, no lab-score theatre. | Unclaimed · no owner block |
| P0-M3 | Analytics footprint reconciled with D-007 | `privacy` + owner | GA (`G-G058FVW6Z2`) now loads on **43 pages** (measured 2026-09-15); D-007 bound it to the ~14 pages carrying it at ruling time and made any expansion an owner decision. Acceptance: owner either ratifies the current set (D-007 amended with the page list) or names pages to strip; `check-finance.js` D-002 section and privacy copy updated to match. Until then, no page added or removed. | Unclaimed · owner decision |

## P1-R — Rank (first on Google for the queries we can win)

Thesis: every indexable URL must genuinely help the user (EXCELLENCE.md §0).
Do P0-M1 first — the "which pages" answers come from Search Console.

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-R1 | Titles + descriptions that win the click, honestly | `seo` | CTR pass over indexable hubs: query + honest differentiator ("Free · No sign-up · Runs in browser"), descriptions promising the task outcome. Fixes the known weak spot first: index meta description ("Collection of essential tools…") undersells the page it sits on. Acceptance: unique, accurate, no invented reach; before/after CTR in Search Console after 30 days. | Unclaimed · needs P0-M1 for priorities, copy fixes can start |
| P1-R2 | Prerendered static pages for the top 10–25 proven tools | `catalogue` + `seo` + `reliability` | The structural gap: all tools share client-side `tool.html?card=<slug>` — thin unique text, query-param URLs, invisible to non-JS crawlers. Build-time generator (same pattern as `build-home-prerender.py`/`build-sitemap.py`) emitting static per-tool pages with unique content per URL: how-to, worked example, FAQ, sources; card fragment stays the single implementation; server-side canonical + WebApplication/BreadcrumbList/FAQ schema. Start with the Search Console top 10–25 only — never all 1149 at once (scaled-content risk). Acceptance: Rich Results Test valid, `--check` drift gate in `verify.sh`, indexed within 30 days. | Unclaimed · needs P0-M1 for the list |
| P1-R3 | Category hubs with real content + tightened internal links | `seo` + `catalogue` | Each hub: genuinely useful category overview (what these tools do, which to pick, links to guides), breadcrumbs, curated related links (keep `related.json` curated, not mechanical). Acceptance: every hub has unique content a human would read; `check-links.py` stays green; crawl depth tool ≤ 3 clicks from index. | Unclaimed |
| P1-R4 | Guides/blog as the long-tail engine (quality-gated) | `seo` | 12 guides + 3 posts today. Grow only from Search Console queries + PAA questions: direct answer first, tool embed, worked numbers, cited sources, Article schema, visible updated dates. Each post ↔ its tool, both directions. Acceptance: no filler (each post passes "would I send this to a friend?"), indexed, cited-or-clicked within 90 days or revised. | Unclaimed · needs P0-M1 for topics |
| P1-R5 | Freshness + E-E-A-T trust surfaces | `seo` + `finance` + `privacy` | `about.html`: keep current, add last-updated, corrections policy, methodology (how tools are tested), Person/Organization schema, official-profile links. YMYL-adjacent pages: named authorship, sourced formulas (HMRC/NHS/legislation), caveats intact (already shipped — guard them). Acceptance: a quality rater finds author, method, date and corrections path within two clicks of any money/health tool. | Unclaimed · small start, no owner block |
| P1-R6 | Translated cluster: enrich or consolidate | `seo` + owner | 12 thin landing pages (`bengali`…`thai`). Thin translations are a scaled-content liability, not an asset. Owner picks per language: real localisation (native-quality, useful) or consolidate (`noindex`/remove + hreflang cleanup). Acceptance: every surviving translated URL is genuinely useful; no unreviewed hreflang changes (standing rule). | Unclaimed · owner decision |
| P1-R7 | Index hygiene: sitemap/robots/canonicals stay exact | `catalogue` | Already strong (`build-sitemap.py --check`, `check-links.py` green, 1228 URLs). Keep: intended URLs indexed, thin/scratch unindexed, canonicals valid. After P0-M1, reconcile Search Console coverage against intent monthly. Acceptance: 0 intended-but-unindexed, 0 thin-but-indexed. | Standing · unclaimed |

## P1-U — Useful (brilliant at the task)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-U1 | Extend the finance *method* to health/legal calculations | `finance` | Sourced test vectors + boundary sweeps + invariants for the highest-stakes non-finance calculators (dosage-adjacent, tenancy/deposit, NDA/contract dates). Not the whole catalogue — highest stakes first. Acceptance: new assertions in `check-finance.js` (or a sibling suite) from independent derivations; caveats present; browser-verified. | Unclaimed |
| P1-U2 | On-site findability: search, hubs, help | `catalogue` + `reliability` | Search finds the right tool in keystrokes (typo tolerance, synonym awareness); `help.html` `?q=` coverage kept; empty/no-result states that guide, not dead-end. Acceptance: 10 scripted find-the-tool tasks, timed before/after, no regressions. | Unclaimed |
| P1-U3 | Offline-first decision executed (`sw.js`) | `reliability` + owner | `sw.js` ships unregistered (dead code) on a site whose pitch is offline-first tools — either a real win (tested offline strategy, Class C tools failing gracefully) or deleted. Owner decides; staff implement + browser-prove. Acceptance: registered-and-tested or removed-from-repo, `verify.sh` green either way. | Unclaimed · owner decision |
| P1-U4 | Input-egress classification policy settled | `privacy` + owner | `spelling-check`, `languages`, `plant-encyclopedia` send typed text to third-party APIs by design — Class C per precedent, but the policy question (is designed egress "live-data" or "input egress"?) is open, with warnings already visible. Owner rules C-vs-A; staff encode + document. Also prune or keep the vestigial `currency`/`ai-mcp-protocol-tool-tester` KNOWN entries. Acceptance: ruling recorded in DECISIONS.md, scanner + copy match it. | Unclaimed · owner decision |

## P1-M — Money (viable without waiting for permission)

Ranked by expected return per hour (STRATEGY.md). Staff prepare everything;
the owner signs and sends — the first pound comes from an email, not a page.

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P1-M1 | YPP crossed before 1 Feb 2027 | `music` + owner | Owner records watch-hour gap (P0-M1); staff keep `radio.html`/`thisorthat.html` legitimate funnels (no autoplay/hidden-player "improvements" — channel-termination risk). If far off, Shorts route (46 exist). Acceptance: YPP application submitted or dated plan to the deadline. | Unclaimed · owner-dependent |
| P1-M2 | Content ID + distribution switched on, correctly | `music` + `finance` + owner | Catalogue onto a distributor with Content ID; **W-8BEN filed per payer first** (else silent 30% US withholding — FINANCE.md §2); UTR/NI ready; renewal diarised (3 years + year signed). Acceptance: distribution live, W-8BENs confirmed, bookkeeping sheet recording receipts. | Unclaimed · owner-dependent |
| P1-M3 | Embed licensing ready for one signature (+ backlink engine) | `finance` + `seo` + owner | Status: `embed.html` ships bare iframes — no attribution, no offer. Staff prepare (no live change until signed): (1) free tier = credit link back (exact snippet + placement); (2) paid tiers £99/£299/£899 with terms (sites, renewal, self-host option); (3) statutory-update changelog ("2026/27 bands applied 6 April") as the trust asset; (4) funnel events within D-007 (Embed views → copies → licence page); (5) first-licensee pack: 10 UK brokers/accountancies + working-embed-on-their-staging demo script — the owner sends it. Acceptance: owner signs terms; page + events + changelog ship together; `check-finance.js` licensing assertions green again. | Proposal ready to draft · owner decision |
| P1-M4 | Sync-licensing page that closes | `music` + `finance` | Dedicated page: one-stop rights, moods/uses, clear pricing path ("£50–£500 YouTube/indie, £500–£5,000+ ads/games — ask for the one-page agreement"), enquiry route, honest catalogue facts. Take advice before signing the first meaningful licence (royalty tax treatment differs — FINANCE.md §2). Acceptance: page live, enquiry route tested, first 5 supervisor/agency emails drafted for the owner. | Unclaimed |
| P1-M5 | Sponsorship priced from reality | `finance` + owner | After P0-M1: real GA figures → honest rate guidance on `sponsor.html` (keep: no published inflated card, labelled slot, 5% rule); cross-sell licensing to CPM-shy enquirers. Acceptance: every figure quotable from GA; house-rule promises intact (guarded by `check-finance.js`). | Unclaimed · needs P0-M1 |

Deliberately not done (reaffirmed, see EXCELLENCE.md §4): display ads on
tools, paywalling tools, lead-capture in embeds, crypto/token promotion,
view-bots/fake engagement. Donations stay as-is (real but small); affiliate
stays contained.

## P2-D — Design excellence (award-level, measured)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P2-D1 | WCAG 2.2 AA per template, with browser evidence | `visual-design` | Contrast 4.5:1 body / 3:1 large, 200% resize, no colour-only meaning, alt/captions, reduced-motion path, visible focus, keyboard-complete paths — per template (index, tool shell, guide, money pages, music hub), not sitewide-average. Acceptance: axe/Lighthouse clean + manual keyboard + 360–390px geometry evidence per touched template. | Unclaimed · standing for every visual change |
| P2-D2 | 44×44px touch targets on conversion paths | `visual-design` | Audit + fix tap targets on find→use→result, embed-copy, donate/sponsor CTAs, player controls. Acceptance: no target under 44px on those paths (WCAG 2.2 floor is 24px; 44 is the conversion bar). | Unclaimed |
| P2-D3 | Money pages that earn trust | `visual-design` + `finance` | `donate`/`sponsor`/`embed`/licensing: plainspoken, scannable, one ask per screen, OG/social polish. Reference: purpose-driven clarity (GoFundMe's double Webby), not decoration. Acceptance: task completion (find ask → act) tested on mobile; no dark patterns, no fake urgency. | Unclaimed |

## P2-P — Popularity flywheel (legitimate only)

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P2-P1 | Embed loop live (needs P1-M3 terms) | `seo` | Attribution snippet shipped → track referral/backlink growth in Search Console (links report) monthly. Acceptance: embeds in the wild link back; no bare-iframe default. | Blocked on owner terms |
| P2-P2 | Outreach packs, not cold begging | `seo` + `music` | Resource-page pack (why .ac.uk/.org.uk lists should link: free, no signup, runs in browser, accessible); vertical page draft ("free mortgage calculator for your website" → licence funnel); digital-PR one-pager from original data (finance-bug findings, catalogue stats). Owner sends. Acceptance: packs reviewed + ready; links earned tracked monthly. | Unclaimed |
| P2-P3 | Listener journey verified, growth legitimate | `music` | Click-to-play, dismissal/keyboard, outbound destinations manually verified on every Product B touch; handle/ID table preserved (CONSTRAINTS.md); radio/thisorthat funnels intact. Acceptance: manual playback evidence; zero manufactured engagement. | Standing · manual validation |

## P3-T — Tech debt that gates the above

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| P3-T1 | Product boundaries + privacy copy match standing decisions | `privacy` | `site-audit.js boundaries` reports tool-side music links and analytics/claim combinations for contextual review. Don't auto-remove navigation, shift analytics, or reinterpret policy — escalate to owner. Includes the P0-M3 reconciliation. Acceptance: review recorded; escalations explicit. | Unclaimed · review + escalation |
| P3-T2 | Shared-DOM collision debt retired (126 top-level JS names) | `reliability` + owner | IIFE-wrap cards to kill the collision class (catalogue ID collisions already fixed 2026-09-15; this is the JS-name remainder). Large mechanical diff — owner confirms worth it before staff start. Acceptance: `check-card-collisions.py` clean by construction; behaviour unchanged (regression suites + browser spot-checks). | Unclaimed · owner call on size |
| P3-T3 | First-screen payload budgets enforced | `reliability` | Candidates from ROADMAP (async the ~32KB hidden-component CSS with hide-rules kept critical; trim derived `id`/`file`/`path` from `cards.json` ~108KB raw; analytics timing is owner-called). Gate with P0-M2 budgets: land only measured-before/after wins, browser-verified (no blind CSS moves). Acceptance: LCP/INP improve or stay green; `verify.sh` green. | Unclaimed |
| P3-T4 | Ship-or-delete legacy + licence | `delivery` + owner | `indexbeta.html`, `hokidea.html`, 4 unlinked CV files, `substitutions/`, `system/`, `digitaldetoxcardshtml/` (CONSTRAINTS.md: currently leave alone), `launch/` raw-`.md` links, LICENSE choice. Owner rules per item; staff execute + regenerate sitemap/counts. Acceptance: each item shipped, archived, or deleted with its links intact. | Unclaimed · owner decisions |

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
| O-8 | Switch on distribution + file W-8BENs (P1-M2) | Stops 30% US withholding; best music £/hour | Account + 10 min per payer |
| O-9 | Rule on JS-collision cleanup size + legacy ship/delete + LICENSE (P3-T2/T4) | Unblocks debt retirement | Per-item rulings |

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
