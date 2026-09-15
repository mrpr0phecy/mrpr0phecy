# GROWTH-PACK — owner-ready proposals (nothing here is live)

**Status: PROPOSAL.** Every part below needs the owner's signature before
anything ships (OPEN.md O-3/O-4). Staff prepared it so the owner decides in
minutes instead of weeks. All copy avoids invented reach (D-001): no
subscriber counts, no traffic claims, no "thousands of users".

## Part 1 — Embed terms proposal (for O-3 signature)

### 1a. Free tier: exact snippet + credit placement

The free tier's price is a small credit link back. Proposed default snippet
(height stays 450px; `embed=1` stays the chrome-free contract):

```html
<iframe src="https://www.themostusefulsiteintheworld.com/tool.html?card=TOOL-SLUG&embed=1" width="100%" height="450" style="border:none;border-radius:12px;" title="TOOL TITLE" loading="lazy"></iframe>
<p style="font-size:12px;"><a href="https://www.themostusefulsiteintheworld.com/tool.html?card=TOOL-SLUG">Free calculator</a> by The Most Useful Site in the World</p>
```

Rules: credit line directly under the embed, visible, followable link to the
tool's stable URL. No hiding (1px text, same-colour-on-colour, robots tricks)
— one warning, then the embed is refused a licence upgrade path. `embed.html`
shows this snippet in the copy box; the existing "just link to a tool"
sentence stays as the no-embed option.

### 1b. Paid tiers (unchanged from STRATEGY.md, terms spelled out)

| Tier | Price | Terms |
|---|---|---|
| Single tool | £99/yr | One tool, one site, no credit line. Minor version updates included. |
| Category | £299/yr | All tools in one category (e.g. Finance & Money), your logo in place of the credit line, up to 3 sites. |
| Full white-label | £899/yr | All tools, unlimited sites, self-host zip option, email support. |

All tiers: annual renewal, 14-day money-back, cancel any time (embed keeps
working to term end, then the credit line returns — no breakage, no hostage
code). Prices exclude VAT. Payment: invoice + bank transfer to start (no
platform fees); Stripe/Paddle when volume justifies it.

### 1c. Statutory-update changelog (the trust asset)

New section on `embed.html`, updated every April (and whenever bands move):

```text
2026-09-15 — 2026/27 figures verified: personal allowance £12,570, basic-rate
  limit £37,700, NI 8%/2%, student-loan thresholds P1 £26,900 / P2 £29,385 /
  P4 £33,795 / P5 £25,000 / PG £21,000. Scottish six-band engine live.
```

Each entry cites the HMRC source page. This changelog is the single most
persuasive asset for a buyer deciding whether to trust an unknown supplier —
it proves the "maintained correctness" being rented.

### 1d. Disclaimer text for the embed page (also clears finance FAIL #2)

> These tools are calculators, not advice. Figures are estimates from the
> stated assumptions — check anything that matters with a qualified
> professional.

Placed once, above the directory, `role="note"`. Matches the in-card caveats.

## Part 2 — Funnel instrumentation spec (no footprint change)

All events fire only on pages already carrying GA (D-007: no expansion).
Implementation: `gtag('event', ...)` on existing handlers.

| Page | Event | Trigger |
|---|---|---|
| `embed.html` | `embed_copy` | Copy-iframe click (param: category) |
| `embed.html` | `licence_view` | Licence/pricing section scrolled into view (once per session) |
| `sponsor.html` | `sponsor_enquiry` | Enquiry mailto click |
| `donate.html` | `donate_click` | Donate button click (if not already tracked) |
| music hub pages | `youtube_out` | YouTube outbound click (param: destination) |

Never: values typed into tools, per-user tracking, new pages. Monthly read:
copies → licence views → enquiries. That ratio prices everything.

## Part 3 — First-licensee pack (owner sends; ~2 hours)

**Targeting (10 sends):** UK mortgage brokers and small accountancy practices
with dated or missing on-site calculators. Find them by searching their sites
for "calculator" + checking the result is thin, ugly, or a lead form. No
lists bought, no scraping at scale — ten hand-picked, hand-written emails.

**Template (adapt per recipient, keep under 120 words):**

> Subject: a working [mortgage/tax] calculator for [site], free to try
>
> Hi [name] — I noticed [site]'s calculator [is missing / asks for an email
> before showing a number]. I maintain a free UK [tool] that's accurate to
> 2026/27 figures ([personal allowance taper / Scottish bands / etc.] handled
> properly — most free ones get this wrong).
>
> I've put a working demo on a staging link for you: [URL]. Paste two lines
> and it's live — free with a small credit, or £99/yr without. No lead forms,
> nothing your visitors type ever leaves their browser.
>
> Worth 10 minutes? — Russell

**Demo script:** clone their staging page structure minimally (their logo +
one paragraph + the embed), screenshot it, link it. The email sells the
screenshot, not the concept.

**Objection handling:** "We get calculators free from [network]" → ours
carries no lead-capture and no branding on paid tiers; "£99 is more than
free" → the credit line costs nothing and the paid tier is one billable
quarter-hour; "who are you?" → the statutory changelog + open test suite
(FINANCE.md method, public repo).

## Part 4 — Sync-licensing page draft (ready to build on approval)

New page `sync.html` (Product B design system, neon night). Copy skeleton —
no catalogue counts (none re-derived since 2026-08-30; owner confirms before
any number ships):

- H1: "Licence a track in one conversation."
- Lede: 100% of rights held by one person — music, visuals, everything. No
  co-writers, no label, no publisher, no six-month clearance chain.
- "What you get": WAV + instrumental, trackouts on request, one-page licence,
  reply within 48 hours.
- "Typical ranges" (labelled as typical, not a rate card): YouTube/indie
  £50–£500; ads/games £500–£5,000+. Every quote confirmed by email before
  anything is final.
- Moods/uses grid linking `listen.html` tracks (curated, ~12: dark, hopeful,
  tense, driving…).
- Enquiry route: same inbox, subject line "Sync: [project]".
- Note: first meaningful licence → take tax advice first (royalty treatment
  differs; FINANCE.md §2).

Acceptance before ship: owner confirms counts-or-no-counts, advice line
reviewed, enquiry route tested, 5 supervisor/agency emails drafted (Part 3
style, music supervisors + indie game devs + small agencies).

## Part 5 — Vertical page draft ("free mortgage calculator for your website")

One SEO entry point into the licence funnel (STRATEGY.md §"second vertical").
Target query pattern: "mortgage calculator for my website / embed".

- H1: "A free mortgage calculator for your website."
- Live demo embed at the top (the product is the pitch).
- "Two lines to install" (snippet from §1a) → "Remove the credit line"
  (£99/yr single, £299/yr all finance tools).
- "Why this one": 2026/27 figures, overpayments modelled, total-cost honesty
  (the £48,000 property-tax bug class, fixed and tested), nothing leaves the
  visitor's browser (their compliance story).
- FAQ (FAQPage schema): "Does it collect my visitors' data?" (No —
  nothing leaves the browser.) "What happens if I stop paying?" (Credit
  line returns; nothing breaks.) "Can I style it?" (Category+ tiers.)
- Canonical, OG, breadcrumbs, internal links to `embed.html` + finance guide.

Second vertical when this one converts: tax calculators for accountants.

## Part 6 — Resource-page outreach pack

**Why anyone links:** free, no sign-up, runs in browser, accessible,
no ads, no lead forms — exactly what .ac.uk/.org.uk/library/charity resource
lists want to recommend without embarrassing themselves.

**Template:**

> Subject: free [topic] tool for your resources page
>
> Hi — I run a free [topic] calculator ([one-line what-it-does]). No sign-up,
> no ads, works offline, accessible. I think it fits your [page name] list
> alongside [existing link on their page] — happy to fix anything that would
> make it more suitable. Either way, thanks for maintaining the list.

One rule: every send names something already on their page. If you can't,
don't send.

## Part 7 — Digital PR one-pager (original data only)

Angles, each backed by repo-verifiable evidence:

1. **"Our tax calculator said £4,000. The answer was £1,486."** — the
   defect-#1 post-mortem (FINANCE.md §1): how "£12,571 to £50,270" framing
   produces the bug, the 60% trap, and the test-suite method. Pitch: personal
   finance press + dev press (two different angles, same facts).
2. **"1,149 tools, zero tracking on any of them."** — the egress-scan story:
   how a static site proves a privacy claim with a script instead of a
   policy page. Pitch: privacy/tech press.
3. **The catalogue as dataset:** 1,149 hand-built browser tools, open source
   (CC-BY 4.0), machine-readable catalogue. Pitch: open-source press,
   "awesome lists", Hacker News (Show HN) when the prerendered tool pages
   (OPEN.md P1-R2) land — not before.

No press release wire, no mass pitching. One journalist, one angle, one
email — same discipline as Part 3.
