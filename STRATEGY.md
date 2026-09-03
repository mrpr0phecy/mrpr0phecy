# STRATEGY.md — how this site earns without waiting for permission

Written 2026-09-03 by `@finance`, after a full rethink of the monetisation model.

`INCOME.md` covers the music catalogue and remains correct on that. This document
covers **the tools**, which are the larger and worse-monetised asset, and it
supersedes `INCOME.md`'s framing of sponsorship as the primary tools revenue.

---

## The problem with the current model, stated plainly

Every tools revenue line in `INCOME.md` requires **someone else to act first**:

| Route | Blocked on |
|---|---|
| Sponsorship | A brand emailing us. We cannot make this happen. |
| Donations | Charity from strangers. ~£35 per 10,000 visitors. |
| YouTube ads | Crossing a threshold, then Google's rates. |
| Sync licensing | A supervisor finding us. |

That is not a business, it is a set of lottery tickets. The owner's brief was
explicit: *"if it didn't have to rely on sponsors that may never show up, even
better."* That is the correct instinct and this document acts on it.

**The strategic error was treating 562 tools as inventory to sell advertising
against, when they are a product people would pay to use.**

### The numbers that prove it

Sponsorship prices attention at **£5–£25 CPM**. At a realistic early-stage
10,000 monthly pageviews that is **£50–£250/month, if a sponsor ever appears.**

Meanwhile, published competitor pricing for embeddable calculators:

| Competitor | Offer | Price |
|---|---|---|
| Your Mortgage Toolbox | 8 calculators, 1 site | **£79/yr** (~£60) |
| Your Mortgage Toolbox | 8 calculators, 10 agents | **£179/yr** |
| CalcWidgets | 18 calculators | **$79/month** |
| Outgrow | Calculator builder | **$22–$115/month** |
| Involve.me | Calculator funnels | **$29–$129/month** |

We have **562**. Eight of those competitors' calculators cost more per year than
our entire 35-tool finance category. **Four £299 licences beat a year of
plausible sponsorship, and they renew.**

### The thing that was actively costing money

`tool.html` had an **Embed** button that generated a bare iframe: no
attribution, no link back, no price. The single most valuable asset on the site
was being given away silently. Anyone could — and for all we know already
does — run our mortgage calculator on their brokerage site with our name
nowhere on it.

That is now fixed, and the fix is the whole strategy in miniature.

---

## The model: free tier as acquisition, licence as revenue

**Free, forever, no account:** embed any tool, keep a small credit line that
links back. The credit line *is* the price. Every embed becomes a backlink and
an advert, so the free tier is a customer-acquisition channel, not a leak.

**Paid:** remove the credit line and brand it as yours.

| Tier | Price | What it is |
|---|---|---|
| Single tool | **£99/yr** | One calculator, one site, no credit |
| **Category** | **£299/yr** | e.g. all 35 finance tools, your logo, 3 sites |
| Full white-label | **£899/yr** | All 562, unlimited sites, self-host option |

Live at **`embed.html`**.

### Why this works when sponsorship doesn't

1. **The buyer already knows they want it.** A mortgage broker searching
   "mortgage calculator for my website" has budget and intent. A sponsor has to
   be persuaded a placement is worth anything.
2. **It is a marketing *expense*, not altruism.** `INCOME.md` already identifies
   this as the decisive factor in why sponsorship outperforms donations. A
   licence is even further along that axis: it is a tool purchase.
3. **It recurs.** Annual renewal on infrastructure the buyer has embedded in
   their site is high-retention — switching means re-doing their pages.
4. **It scales without traffic.** This is the crucial one. Sponsorship revenue
   is a function of *our* pageviews. Licence revenue is a function of *how many
   businesses need calculators*, which is vastly larger and entirely
   independent of our SEO position.

### What is actually being sold

Not the HTML — anyone can write a mortgage calculator. **The product is
maintained correctness**, and it is genuinely defensible:

- UK statutory figures move every April: tax bands, NI, student loan
  thresholds, the personal allowance taper.
- The maths is easy to get wrong. The £100k personal allowance taper creates a
  **60% marginal rate**; modelling the basic-rate band as a fixed £50,270
  ceiling instead of a £37,700 width gets this wrong. That exact bug was found
  in `tax.html` and `salarycompare.html` — and it is in commercial products too.
- `check-finance.js` runs **116 assertions** on every deploy. If a change breaks
  a tax computation the build fails.

A buyer is renting the guarantee that the number is right in April. That is why
it is priced annually and why it is not a one-off sale.

---

## Why this survives what is happening to search

This is not a small consideration — it may be the most important one here.

**60% of Google searches now end without a click.** AI Overviews appear on
47–64% of queries and cut position-1 CTR by **34–58%**. Publishers of
informational content report 20–40% traffic declines; some far worse.
Google's March 2026 scaled-content enforcement stripped 50–80% of traffic from
thin programmatic sites.

**A site whose only income is advertising against pageviews is exposed to all of
that.** Sponsorship CPM is priced on traffic; traffic is structurally declining
for exactly this content type.

The consistent finding across every source is that **interactive tools and
calculators are among the most resilient formats**, because an AI summary cannot
replace a thing you use — it can only describe it. And the clicks that do survive
convert *better*: post-AI-Overview referrals show ~23% higher conversion and
lower bounce.

The licensing model is more resilient still, because **it does not depend on our
traffic at all.** A broker paying £299/year does so because they need the
calculator, regardless of where we rank. This is the single strongest argument
for the change: it converts a traffic-dependent business into a product business
at a moment when traffic is the thing collapsing.

---

## Ranked, by expected return per hour of effort

1. **Embed licensing (`embed.html`)** — built. Recurring, traffic-independent,
   defensible, and priced well under a market that already exists.
2. **Content ID + distribution** — unchanged from `INCOME.md`. Still the best
   effort-to-return ratio in the music half, still switched off.
3. **YouTube Partner Programme** — unchanged. Deadline **1 Feb 2027**.
4. **Sponsorship** — keep it. It is now the *second* string for the tools, not
   the first, and `sponsor.html` should cross-sell licensing to enquirers who
   balk at the CPM.
5. **Sync licensing** — unchanged, still underused.
6. **Affiliate (`freecash.html`)** — one page, contained. Not a growth line.
7. **Donations** — unchanged. Real but small; do not optimise further.

---

## What to do next, in order

1. **Get the first licensee.** Ten emails to UK mortgage brokers and small
   accountancy practices with a link to a working embed on their own staging
   site beats any amount of further building. This is the only item that
   converts the work into money.
2. **Instrument the funnel.** `embed.html` needs to be measurable: how many
   people press Embed, how many reach the licence page. Without that the
   pricing cannot be tuned.
3. **Prove the maintenance claim publicly.** A short changelog of statutory
   updates ("2026/27 bands applied 6 April") is the single most persuasive
   asset for a buyer deciding whether to trust an unknown supplier.
4. **Consider a second vertical page.** The finance category is the highest-CPC
   vertical in existence — mortgage/insurance/tax keywords are where the money
   is. A page targeting "free mortgage calculator for your website" is the
   obvious SEO entry point into the licence funnel.

---

## What is deliberately still not done

Unchanged from `INCOME.md`, and reaffirmed after this review:

- **No display ads on tools.** Would earn a few pounds a month and destroy the
  differentiator that makes licensing sellable. Worse trade now than before,
  because the licence buyer is specifically buying a clean, script-free embed.
- **No paywalling the tools themselves.** The free public site is the shop
  window for the licence. Gating it would break the funnel.
- **No lead-capture or data collection in the embeds.** Competitors sell on
  this. We cannot match it and should not try — "nothing your visitor types
  leaves their browser" is a feature for the buyer's own compliance position,
  and it is the honest reason to pick us.
- **No crypto/token monetisation.** See `FINANCE.md`; unresolved legal exposure.

---

## One honest caveat

Nothing above earns anything until someone is told it exists. The infrastructure
is now in place, priced, guarded against drift, and defensible on the merits —
but the first licensee will come from an email, not from a page. That email is
the highest-value hour available and it is not one I can spend.
