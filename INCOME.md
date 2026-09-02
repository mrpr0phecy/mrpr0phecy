# INCOME.md — how this site can actually make money

An honest working document. Written 2026-08-30, revised 2026-09-02 after a
full financial review.

Read this alongside `ARCHITECTURE.md`. That one explains how the site is built;
this one explains what earns and what the realistic path looks like.

**Related:** `FINANCE.md` covers the other half of the job — the correctness of
the money *tools*, the statutory figures they depend on, tax obligations on the
income described here, and the open compliance risk on `token.html`. Read both.

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
   becomes non-trivial. Ko-fi takes 0% on donations (you still pay the
   underlying processor). Not worth the migration effort at zero donations —
   worth it at fifty a month.

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

For a small, untracked, highly-intent niche site, a defensible CPM is **£5–£25**
— higher than a display-ad CPM because there is one sponsor per page, no
competition for attention, and stated intent. So:

| Monthly pageviews on the sponsored pages | Defensible monthly ask |
|---|---|
| 1,000 | £5–£25 |
| 10,000 | £50–£250 |
| 50,000 | £250–£1,250 |

Two rules that protect the relationship:
- **Quote a trial month first.** A sponsor who sees real numbers and renews is
  worth more than one who feels oversold and churns.
- **Never quote sitewide traffic for a single-tool placement.** If they are on
  the freelance rate calculator, quote that page's traffic.

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
2. **Join PPL.** Free. You are a performer who owns his masters and is not
   collecting neighbouring rights.
3. **Prepare stems, instrumentals and clean versions for your ten best
   tracks.** A weekend. It is the difference between being pitchable and not.
4. **Register works with PRS/MCPS** (£200 total) once there is any broadcast or
   sync activity to collect on.
5. **Resolve the `token.html` question** (see `FINANCE.md`). This one is not
   about earning — it is about not losing everything else.
