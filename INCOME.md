# INCOME.md — how this site can actually make money

An honest working document. Written 2026-08-30, revised 2026-09-02 after a
full financial review.

Read this alongside `ARCHITECTURE.md`. That one explains how the site is built;
this one explains what earns and what the realistic path looks like.

**Related:** **⚠️ Superseded in part.** `STRATEGY.md` (2026-09-03) reworks the *tools* side of
this document. The analysis below of streaming rates, Content ID, YPP, sync
licensing and donations stands unchanged and is still the reference for the
music catalogue. But its treatment of **sponsorship as the primary tools revenue
line is superseded**: sponsorship depends on a brand emailing us, and the tools
are now monetised directly through embed licensing (`embed.html`). Read
`STRATEGY.md` first for the tools; read this for the music.

`FINANCE.md` covers the other half of the job — the correctness of
the money *tools*, the statutory figures they depend on, tax obligations on the
income described here, and the open compliance risk on `token.html`. Read both.

---

## The strategy, as stated (2026-09-02)

The owner's position, which everything below is now organised around:

> Profitable **without charging the end user**. The appeal of being educational
> and informative is the selling point. Hope that the music becomes popular
> enough that YouTube and SoundCloud pay a stream of money. Look for heartfelt
> donations over the long term. Open to sponsorship, **as long as it is less
> than 5% of the page**.

This is a coherent and defensible model. It is *not* the same thing as a free
model, and the distinction matters: it is a **free-to-user, paid-by-third-party
model**, which is a real business shape with real precedents. Three of the four
pillars are sound. One of them needs correcting before it can be planned around.

### The 5% rule is the best constraint here, and it should be written down

Capping sponsorship at under 5% of the page is a genuinely good instinct and it
happens to align with what actually converts. A single labelled line under a
tool, on a page with no other advertising, is worth **far more per impression**
than the same line on a page carrying six ad units — because it holds a monopoly
on commercial attention. The scarcity *is* the product.

The commercial risk of the 5% rule is not that it earns too little. It is that
it gets quietly eroded — one extra placement at a time, each individually
defensible — until the thing that made it valuable is gone. So it is now a
machine-checked rule rather than an intention: see "The 5% rule, enforced" below.

### The correction: streaming will not become the stream of money

This is the one assumption that needs adjusting, and it is better to know now
than after two years of waiting for it.

At 2026 rates, **SoundCloud pays $2.50–$4.00 per 1,000 plays** and **Spotify
$3–$5**. YouTube Music is the lowest of the majors at $0.002–$0.004 per stream.
Those are gross, before any distributor cut. What that means concretely:

| To earn | You need, on SoundCloud |
|---|---|
| £50/month | ~20,000 plays/month |
| £500/month | ~200,000 plays/month |
| £2,000/month (part-time wage) | ~800,000 plays/month |

800,000 plays a month is not a "popular independent artist" number. It is a
charting number. And the trend is against the long tail, not with it: Spotify's
1,000-stream-per-track-per-year minimum **demonetised an estimated 86% of the
catalogue on the platform** and moved roughly $40m a year from the long tail up
to artists above the threshold. A track with 800 plays a year now earns exactly
£0 where it used to earn a few pounds.

**This is not an argument for making less music.** It is an argument for not
putting the weight of the plan on the per-stream rate, because the per-stream
rate is the single worst-paying way a piece of music can earn. The same catalogue
earns far more through the routes below. Keep making music — just don't wait on
streaming to be what pays for it.

### The gap: no distributor means the best-paying route is switched off

The music is currently on **YouTube and SoundCloud only**. There is no
distributor in the picture, and that has a consequence that is easy to miss:

**There is no Content ID registration.** Content ID is YouTube's audio
fingerprinting system. It scans every video uploaded to YouTube against your
catalogue, and when someone else's video uses your music, the ad revenue on
*their* video routes to *you*. It pays roughly **$1–$3 per 1,000 views** on
claimed content, it works on videos you had nothing to do with, and it keeps
paying for years without further effort.

For a catalogue of 233 uploads and 47 animated videos, this is the closest thing
to the "stream of money" being hoped for — and it is currently switched off. It
cannot be registered directly; it comes through a licensed distributor. Entry
costs are now trivial (roughly $1 per single, or a low annual fee), and several
distributors take 0% commission on Content ID revenue.

Distribution also puts the catalogue on Apple Music at **$0.007–$0.010 per
stream — two to three times SoundCloud's rate** — and on Tidal at $0.012–$0.015.
Same music, same effort, several times the rate.

This is the highest-value unrealised item in this document. It is a one-off
afternoon of admin against a permanent, genuinely passive revenue line.

### What the four pillars are actually worth

Ranked by realistic annual contribution, not by appeal:

| Pillar | Verdict |
|---|---|
| **Content ID + distribution** | Not yet started. Best effort-to-return ratio available. Genuinely passive once set up. |
| **YouTube ad revenue (YPP)** | Strongest existing asset — already past the 1,000-subscriber wall. **Deadline 1 Feb 2027.** |
| **Sponsorship at <5%** | Realistic and repeatable. Needs a human to answer emails. Scales with traffic. |
| **Sync licensing** | Best £/hour of anything here. One placement can beat a year of streams. |
| **Donations** | Real but small. Worth keeping warm; not worth optimising further. |
| **Per-stream royalties** | Will not carry the plan at any plausible audience size. Treat as a bonus. |

The honest summary: **the music is far more valuable as licensable and
claimable content than as streamed content.** The catalogue is the asset. Streams
are the worst way to monetise it; Content ID and sync are the best.

---

## The honest headline

**Nothing here is passive.** Every income route below needs either an audience
or a person doing something. The site can be built so that money is *possible*
and so that the admin is near-zero — that part is done — but no configuration
of HTML generates income on its own.

Anyone who tells you otherwise is selling something.

What genuinely can be low-effort once running:
- YouTube ad revenue (your existing 233 videos keep earning while you sleep)
- Donations from existing traffic
- Sponsorship renewals

What always needs a person:
- Sponsorship sales (someone must reply to emails)
- Sync licensing (someone must negotiate)
- Making new music and tools

---

## Where you actually stand

Measured 2026-08-30, from public sources. **These numbers are now over a year
old in places and should be re-checked before being quoted to anyone.**

| Metric | Value | Note |
|---|---|---|
| YouTube subscribers | **1,360** | Past the 1,000 YPP threshold |
| YouTube videos | **233** | Substantial back catalogue |
| Shorts | **46** | Alternate YPP route exists |
| Tools on site | **562** | Real, working, original (was mis-stated as 483) |
| Site analytics | Now on 12 key pages | Was on 1 |

**The single most important fact: you are already past YouTube's hardest
monetisation gate.** 1,000 subscribers is the wall most channels never clear.

---

## ⏰ Route 1 — YouTube Partner Programme (highest priority, and now urgent)

This is the closest thing to real recurring income available to you, you are
most of the way there, and **there is now a deadline**.

### The threshold doubles on 1 February 2027

YouTube announced in August 2026 that the entry requirements for new creators
are doubling:

| | Now (until 31 Jan 2027) | From 1 Feb 2027 |
|---|---|---|
| Subscribers | 1,000 ✅ **met (1,360)** | 1,000 |
| **or** watch hours (12 mo) | **4,000** | **8,000** |
| **or** Shorts views (90 days) | **10 million** | **20 million** |

Creators already receiving ad revenue are not affected. **You are not yet one
of them.** That makes this the single most time-sensitive item in this
document: the same channel that qualifies in January may need twice as much in
February.

There is also a lower tier worth knowing about — **500 subscribers, 3 public
uploads in 90 days, and 3,000 watch hours** unlocks fan funding (Super Thanks,
memberships) though not ad revenue. You are past the subscriber part of that
already.

**Action, this week, not this quarter:** open YouTube Studio → Analytics →
Overview. It shows progress toward both thresholds directly. Watch hours cannot
be read externally, so nobody but you can check this.

- **If you are close on watch hours** — push hard now. Long-form accrues watch
  hours far faster than Shorts. 233 videos already exist; the catalogue is the
  asset. Apply the moment you cross.
- **If you are far off** — you have roughly five months. Plan against the
  8,000-hour number rather than the 4,000, so the deadline slipping does not
  matter.

### What it actually pays

Be realistic about the prize. **RPM** (revenue per 1,000 views, after YouTube's
45% cut) is the number that matters, not CPM:

| | Typical RPM | 100,000 views |
|---|---|---|
| Long-form, music/entertainment | ~$1–$5 (often the low end) | ~$100–$500 |
| Shorts | ~$0.04–$0.15 | ~$4–$15 |

Music and entertainment channels sit at the **bottom** of the RPM range —
finance and B2B channels are the ones seeing $8+. A UK/global audience mix
lowers it further. At a realistic $1.50 RPM you need roughly **670,000 views to
make £1,000**.

That is not a salary. It is, however, the only route here that pays without you
selling anything to anyone, and it compounds with the catalogue.

**The strategic point about Shorts:** at ~$0.08 RPM they are a *growth* tool,
not a revenue tool — you need about 100,000 Shorts views to equal 1,000
long-form views. Use them to win subscribers who then watch long-form. Never
treat them as the income plan.

### The site generates watch hours itself

Watch time from **embedded** YouTube players counts toward the threshold, as
long as the video is public. Two pages are built around that:

- **`radio.html`** — one click plays all 47 tracks back to back via the YouTube
  IFrame API. A visitor who leaves the tab open generates continuous, genuine
  watch time. Ten people leaving it on for an hour is ten watch hours.
- **`thisorthat.html`** — a voting game where watching is how you play.

This is legitimate: real people choosing to watch real videos on a real player.
It is not a bot, not hidden, not muted, not automated. **Do not** be tempted to
"improve" it with autoplaying hidden players — that is invalid traffic, YouTube
filters it out, and it puts the channel at risk. Given that the threshold is
about to double, the temptation will be strongest exactly when the downside is
worst. A terminated channel earns £0 forever.

---

## Route 2 — Donations

Two pages exist: **`donate.html`** (tools) and **`support.html`** (music). Both
point at `paypal.me/russellhead` in GBP.

Realistic expectation: donation conversion on free-tool sites runs roughly
**0.01%–0.1%** of visitors. 10,000 visitors might produce one to ten donations.
This is why traffic matters more than the donate page design. Wikipedia raises
millions because it has *billions* of pageviews, not because its banner is
clever.

### The payment-rail problem (costs you real money at small amounts)

PayPal's fee is percentage **plus a fixed 30p**, and the fixed part is what
hurts. On the current suggested tiers:

| Donation | PayPal G&S fee (UK, 2.9% + 30p) | You keep | Lost |
|---|---|---|---|
| £3 | £0.39 | **£2.61** | 13.0% |
| £10 | £0.59 | **£9.41** | 5.9% |
| £25 | £1.03 | **£23.97** | 4.1% |

An international donor costs more again — non-EEA adds ~1.99%, plus a 3–4%
currency-conversion spread if they pay in dollars. A $5 donation from the US
can arrive as under £3.20.

Three practical conclusions:

1. **The £3 tier loses 13% to fees.** Consider making the middle tier the
   visually default one. The maths favours fewer, larger donations.
2. **Do not ask donors to send "Friends & Family" to dodge the fee.** It
   breaches PayPal's terms for anything business-related and risks the account
   being frozen — losing the whole rail to save 30p.
3. **Ko-fi or Buy Me a Coffee are worth pricing up** if donation volume ever
   becomes non-trivial. Not worth the migration effort at zero donations —
   worth it at fifty a month.

| Platform | Platform fee | Processor fee | Note |
|---|---|---|---|
| PayPal.me (current) | — | ~2.9% + 30p | The 30p floor is what hurts small tips |
| **Ko-fi** (free plan) | **0%** on one-off | ~3% | No approval, set up in minutes |
| Buy Me a Coffee | 5% | ~3% | More recognisable brand |
| **GitHub Sponsors** | **0%** | **0%** (GitHub absorbs it) | Only sensible if the tools go open-source |
| Liberapay | 0% | ~2–3% | Recurring only, EU-based |
| Patreon | 5–12% | ~3–5% | Wrong shape — needs gated perks you've said you won't build |

### The uncomfortable truth about individual donations

Developers who have actually run this experiment are consistent, and it is
worth internalising before optimising the donate page any further:

- A well-known open-source Android app with **~2 million users** earns roughly
  **$20,000/year** across all sources — a few hundred dollars a month to the
  individual maintainer.
- Most sustainably-funded free projects earn the majority of their money from
  **corporate sponsorship, not individual donations.**

The reason is the budget-category point above: a company approves a sponsorship
from its *marketing* budget, whereas an individual donates from disposable
income and a company would have to donate from an *altruism* budget that mostly
doesn't exist. **That is why Route 3 outranks Route 2 despite needing a human.**

Concretely: at a 0.05% conversion and a £7 average net donation, 10,000
visitors produces roughly **£35**. One £250 sponsor is worth more than 70,000
visitors' worth of donations. Do not spend another weekend on the donate page.

### Heartfelt and long-term is a different mechanism from tipping

The stated hope is for *heartfelt donations over the long term*, and that is
worth separating from one-off tips, because the two behave differently.

A tip is a reaction to a single moment — a tool that saved someone twenty
minutes. It is small, it does not repeat, and the 30p PayPal floor eats a
painful share of it. The £35-per-10,000-visitors maths above is tipping maths,
and it is why optimising the donate page further is not worth the weekend.

A heartfelt long-term supporter is reacting to something else entirely: a
*relationship with the work over time*. What reliably produces those, based on
how comparable projects actually behave:

1. **Longevity that is visible.** Someone who has used the tools for two years
   gives differently from someone who arrived this morning. Nothing needs
   building for this — it accrues, as long as the work keeps existing.
2. **A named human, not a brand.** `support.html` already gets this right.
   "Independent · Unsigned" and "there's no label and no team" is exactly the
   frame that makes a person want to chip in.
3. **Knowing where the money went.** Not a public ledger — just the occasional
   concrete line. "This paid the hosting for the year" converts better than any
   button design, because it makes the support feel *received*.
4. **Never being asked hard.** Counter-intuitive but consistent: the projects
   that ask most aggressively convert worst on this specific kind of donation.
   The current pages ask gently and put the free actions first. Keep that.

The one structural change worth making eventually is a **recurring** option —
not a membership with perks, which would violate the no-gating principle, but a
plain "£2/month if you want to" for the people who already want to. Recurring
support is where the "long term" part actually lives; a tip jar can only ever
capture a moment. Ko-fi supports this at 0% platform fee on the free plan.

**What not to do, given the stated positioning:** do not add perks, early
access, supporter-only tracks, or a private feed. `support.html` already
explicitly promises none of that, and the promise is more valuable than the
marginal conversion. It is also the thing that makes the donations heartfelt
rather than transactional — people are supporting the principle, and the
principle is that nothing is held back.

---

## Route 3 — Sponsorship (`sponsor.html`)

The highest *value per unit* and the one that needs a human.

The page deliberately does **not** publish a rate card, because publishing
inflated numbers to advertisers is both dishonest and quickly found out.
Instead it invites an enquiry and promises real figures.

**Before quoting anyone a price, get your actual numbers** from Google
Analytics. Then price honestly. A niche tool page with 500 genuinely relevant
monthly visitors is worth something to the right advertiser; the same page
described as "millions of users" is worth nothing once they check.

### How to price it without lying or underselling

Sponsorship is priced off a CPM against *your* traffic, not off vibes:

```
monthly price ≈ (monthly pageviews ÷ 1,000) × CPM
```

**A warning about the CPM figures you will find online.** Almost all published
"sponsorship CPM" tables — the ones quoting $25–$120 — are for **newsletters**,
and are priced per 1,000 *subscribers or opens*. A newsletter subscriber is a
permission-based, repeat, identifiable relationship. A pageview is a stranger
who may never return. **They are not the same unit and the rates are not
transferable.** Quoting a newsletter CPM against pageviews is the single
easiest way to price yourself out of a deal and look like you don't know the
market.

For a static site placement priced per 1,000 pageviews, a defensible range is
**£5–£25**. That is well above a programmatic display CPM (£1–£3) and the
premium is genuinely earned: one sponsor per page, no competing units, no ad
blindness, and stated intent rather than inferred demographics.

| Monthly pageviews on the sponsored pages | Defensible monthly ask |
|---|---|
| 1,000 | £5–£25 |
| 10,000 | £50–£250 |
| 50,000 | £250–£1,250 |

Four rules that protect the relationship:
- **Quote a trial month first.** A sponsor who sees real numbers and renews is
  worth more than one who feels oversold and churns.
- **Never quote sitewide traffic for a single-tool placement.** If they are on
  the freelance rate calculator, quote that page's traffic.
- **Expect the first offer to be low.** Brands routinely open 30–40% below
  their actual budget. A calm "that's below what the traffic supports, here are
  the numbers" is normal negotiation, not rudeness.
- **Sell to a marketing budget, not an altruism budget.** This is the single
  most useful insight from developers who have actually done this: companies
  approve "advertising spend" far more readily than "supporting a nice free
  tool". Same money, different internal category, dramatically different
  conversion. Frame every pitch as reach, not as charity.

The existing £1,000 custom-tool offer on `index.html` was rewritten: it
previously promised placement "forever", "lifetime" support, an analytics
dashboard, and exposure to "millions of users". Those are obligations you
cannot meet and claims you cannot support. Now it promises a custom tool, 12
months of support, traffic figures on request, and invites the buyer to ask for
real numbers first.

---

## Route 4 — Sync licensing (best £/hour, genuinely underused)

**This is the most undervalued asset you have.**

You hold 100% of the rights to 47 animated videos and 233 uploads — music,
visuals, everything, no co-writers to clear, no label, no publisher.

Every sync placement needs **two** licences: the **sync** licence (the
composition — melody and lyrics) and the **master** licence (the specific
recording). Most artists control one and have to chase the other, which is why
clearance takes months. You control both. That makes you a **one-stop**, and
one-stop is the specific phrase music supervisors search for. It is a genuine,
nameable commercial advantage — lead with it.

### What to actually charge (2026 market rates, converted to GBP)

Published rate cards and industry guides put an independent artist's realistic
range at:

| Use | Combined (sync + master), all-in |
|---|---|
| YouTube creator / branded content | £0–£1,200 |
| Corporate or internal video | £200–£1,500 |
| Podcast (indie to mid-tier) | £150–£2,500 |
| Indie short film | £200–£1,200 |
| Indie feature film | £800–£12,000 |
| **Indie video game** | **£400–£4,000** (most land £400–£2,400) |
| Mobile / casual game | £0–£6,000 |
| Regional or local advert | £2,000–£30,000 |
| National TV advert | £40,000+ |

The realistic median paid placement for an independent artist is around
**£1,200–£4,000**. One placement can exceed a year of donations.

**Indie games are the best-fit target** for animated soundscapes: the budgets
are real, the buyers are the developers themselves (no supervisor gatekeeping),
and deals are simple perpetual buyouts.

### Three things that multiply the fee

1. **Term and territory.** A worldwide, perpetual, all-media licence is worth
   roughly **2.5×** a three-year, single-territory one. Never grant perpetuity
   at the three-year price. If a buyer wants "forever, everywhere", that is a
   different number and you should say so calmly.
2. **Featured vs background.** A scene built around the track is worth several
   times a background wash.
3. **Deliverables.** Supervisors expect **stems, an instrumental, a clean
   (no-profanity) version, and tidy metadata**. Not having them loses
   placements at the last hurdle, when the deal was already won. Preparing them
   for the strongest ten tracks is a weekend of work and is probably the
   highest-return unpaid task on this entire list.

### Register with a PRO — you are currently leaving money uncollected

Sync fees are the upfront payment. Broadcast use *also* generates performance
royalties, but only for registered works — unregistered royalties go into a
pool distributed to other people.

| Body | Collects | Cost | Who needs it |
|---|---|---|---|
| **PRS for Music** | Performance royalties on the **composition** | £100 one-off (£30 under 25) | Songwriters |
| **MCPS** | Mechanical royalties | £100 one-off | Anyone distributing/reproducing |
| **PPL** | Neighbouring rights on the **recording** | Free to join | Performers & master owners |

You write, perform, record and own everything, so all three apply. **PPL is
free — there is no argument for not doing it.** PRS pays for itself at roughly
£100/year of royalties.

Two traps: joining is not the same as registering — **every work must be logged
individually**, ideally before release. And a distributor does **not** do this
for you, whatever the dashboard implies.

`sponsor.html` mentions licensing and routes it to the same email. A dedicated
licensing page with a clear "here is the rate, here is the one-page agreement"
would be the logical next build — a published starting price filters out the
people who want it free.

---

## Route 5 — Things deliberately NOT done

Recorded so nobody adds them later thinking they were forgotten.

- **Display ads (AdSense) on the tool pages.** The tools site's entire pitch is
  "no ads, no tracking, no accounts". Ads would earn perhaps a few pounds a
  month at current traffic while destroying the one thing that differentiates
  it. Bad trade.
- **Paywalling tools or music.** Same reason. "All free" is the positioning.
- **View-bots, engagement pods, fake supporter counts, fake urgency.** These
  get channels terminated and destroy the credibility everything else rests on.
- **Crypto/token monetisation.** `token.html` exists in the repo. This is no
  longer just a taste question — **it is a live legal exposure and it is not
  currently contained.** See `FINANCE.md` § "The token problem" for the detail
  and the decision that needs making. Do not build anything further on it in
  the meantime.

---

## Measurement — the thing that was missing

Google Analytics (`G-G058FVW6Z2`) is now on the 12 pages that matter. Without
it none of the above can be optimised — you cannot price sponsorship, cannot
tell which page converts, cannot tell whether anything is working.

**In roughly 30 days, check:**
1. Which pages get traffic at all
2. Which pages send clicks to YouTube
3. Where donation clicks come from

Then put effort into whatever is already working, rather than guessing.

Also worth doing, both free, both about ten minutes:
- **Google Search Console** — submit `sitemap.xml`, see real search queries
- **Bing Webmaster Tools** — same, and much less competitive

---

## The realistic timeline

Being straight, because a plan built on fantasy helps nobody:

| Timeframe | Realistic outcome |
|---|---|
| **Now → 31 Jan 2027** | **The YPP window.** Check watch hours immediately; apply before the threshold doubles. Free wins: join PPL, register works with a PRO, prepare stems for ten tracks. |
| Month 1–3 | First donations possible but likely rare. Traffic data starts accumulating. |
| Month 3–6 | If monetised, small but real YouTube income. Enough data to price sponsorship honestly. |
| Month 6–12 | Sponsorship or a sync placement becomes plausible — indie games are the best-odds target. YouTube income grows with catalogue and subscribers. |

**This does not replace a wage quickly, and it will not happen with nobody
doing anything at this end.** The infrastructure is in place so that when
traffic or attention arrives, it can convert — and the YouTube route needs no
selling from you at all.

The highest-leverage thing you can do is keep making music. 233 videos got you
to 1,360 subscribers. The next 233 matter more than any page on this site.

---

## The five things worth doing first

Ranked by return per hour of effort, not by size of prize:

1. **Check YouTube watch hours today.** Free, five minutes, and there is a
   hard deadline of 1 Feb 2027 behind it.
2. **Get the catalogue on a distributor and into Content ID.** An afternoon and
   roughly the price of a coffee. This is the single biggest unrealised item in
   this document: it switches on the only genuinely passive music revenue line
   available (~$1–$3 per 1,000 views on *other people's* videos that use your
   music), and simultaneously puts the catalogue on Apple Music at 2–3× the
   SoundCloud rate. Currently switched off entirely.
3. **Join PPL.** Free. You are a performer who owns his masters and is not
   collecting neighbouring rights.
4. **Prepare stems, instrumentals and clean versions for your ten best
   tracks.** A weekend. It is the difference between being pitchable and not.
5. **Register works with PRS/MCPS** (£200 total) once there is any broadcast or
   sync activity to collect on.
6. **Resolve the `token.html` question** (see `FINANCE.md`). This one is not
   about earning — it is about not losing everything else.

Note what is *not* on this list: growing streams. Streams are the output of
doing the above well, not an input you can push on directly — and at $2.50–$4
per 1,000 they are the worst-paying use of the catalogue even when they go
well. Make the music; monetise it through the routes that actually pay.
