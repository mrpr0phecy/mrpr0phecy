# INCOME.md — how this site can actually make money

An honest working document. Written 2026-08-30.

Read this alongside `ARCHITECTURE.md`. That one explains how the site is built;
this one explains what earns and what the realistic path looks like.

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

Measured 2026-08-30, from public sources:

| Metric | Value | Note |
|---|---|---|
| YouTube subscribers | **1,360** | Past the 1,000 YPP threshold |
| YouTube videos | **233** | Substantial back catalogue |
| Shorts | **46** | Alternate YPP route exists |
| Tools on site | **653** | Real, working, original (re-derived 2026-09-03) |
| Site analytics | Now on 12 key pages | Was on 1 |

**The single most important fact: you are already past YouTube's hardest
monetisation gate.** 1,000 subscribers is the wall most channels never clear.

---

## Route 1 — YouTube Partner Programme (highest priority by far)

This is the closest thing to real recurring income available to you, and you
are most of the way there.

**Requirements** (either path):
- 1,000 subscribers ✅ **met (1,360)** — plus 4,000 public watch hours in 12 months
- or 1,000 subscribers ✅ + 10 million Shorts views in 90 days

Watch hours cannot be read externally — **check YouTube Studio → Analytics →
Overview**. It shows progress toward both thresholds directly.

**If you are close on watch hours**, the fastest legitimate lever is your own
back catalogue: 233 videos already exist. Long-form content accrues watch hours
far faster than Shorts. Playlists that auto-advance (which the site now links
to everywhere) keep sessions running.

**If you are far off**, Shorts are the other door — you already have 46.

Realistic money: UK music/animation channels typically see roughly £0.50–£2.00
per 1,000 monetised views. At your scale that is pocket money at first, and it
compounds only with views. It is not a salary. It is, however, the only route
here that pays without you selling anything to anyone.

**Do this first. It costs nothing and the site work is already done.**

### The site now generates watch hours itself

Watch time from **embedded** YouTube players counts toward the 4,000-hour
threshold, as long as the video is public. Two pages are built around that:

- **`radio.html`** — one click plays all 47 tracks back to back via the YouTube
  IFrame API. A visitor who leaves the tab open generates continuous, genuine
  watch time. Ten people leaving it on for an hour is ten watch hours.
- **`thisorthat.html`** — a voting game where watching is how you play. Twelve
  rounds, two videos each, ending in a shareable personal top 5.

This is legitimate: real people choosing to watch real videos on a real player.
It is not a bot, not hidden, not muted, not automated. **Do not** be tempted to
"improve" it with autoplaying hidden players — that is invalid traffic, YouTube
filters it out, and it puts the channel at risk.

---

## Route 2 — Donations

Two pages now exist:

- **`donate.html`** — Wikipedia-style appeal for the tools site. Deliberately
  plain, honest about costs, explicitly says nothing is gated.
- **`support.html`** — the music-side equivalent, which leads with the free
  actions before the ask.

Both point at `paypal.me/russellhead` in **GBP**.

Realistic expectation: donation conversion on free-tool sites runs roughly
**0.01%–0.1%** of visitors. That means 10,000 visitors might produce one to ten
donations. This is why traffic matters more than the donate page design.

Wikipedia raises millions because it has *billions* of pageviews, not because
its banner is clever.

---

## Route 3 — Sponsorship (`sponsor.html`)

The highest *value per unit* and the one that needs a human.

The page deliberately does **not** publish a rate card, because publishing
inflated numbers to advertisers is both dishonest and quickly found out.
Instead it invites an enquiry and promises real figures.

**Before quoting anyone a price, get your actual numbers** from Google
Analytics (now installed sitewide — see below). Then price honestly. A niche
tool page with 500 genuinely relevant monthly visitors is worth something to
the right advertiser; the same page described as "millions of users" is worth
nothing once they check.

The existing £1,000 custom-tool offer on `index.html` was rewritten: it
previously promised placement "forever", "lifetime" support, an analytics
dashboard, and exposure to "millions of users". Those are obligations you
cannot meet and claims you cannot support. Now it promises a custom tool,
12 months of support, traffic figures on request, and invites the buyer to ask
for real numbers first.

---

## Route 4 — Sync licensing (best £/hour, genuinely underused)

**This is the most undervalued asset you have.**

You hold 100% of the rights to 47 animated videos and 233 uploads — music,
visuals, everything, no co-writers to clear, no label, no publisher. That makes
licensing a *single conversation* rather than a six-month clearance chain.

That is genuinely rare and it is exactly what music supervisors, indie game
developers, YouTubers and small ad agencies struggle to find.

Realistic rates for an unsigned artist: **£50–£500** for a YouTube/indie use,
**£500–£5,000+** for an advert or game. One placement can exceed a year of
donations.

`sponsor.html` now mentions licensing and routes it to the same email. A
dedicated licensing page with a clear "here is what it costs and here is the
one-page agreement" would be the logical next build.

---

## Route 5 — Things deliberately NOT done

Recorded so nobody adds them later thinking they were forgotten.

- **Display ads (AdSense) on the tool pages.** The tools site's entire pitch is
  "no ads, no tracking, no accounts". Ads would earn perhaps a few pounds a
  month at current traffic while destroying the one thing that differentiates
  it. Bad trade.
- **Paywalling tools or music.** Same reason. "All free" is the positioning.
- **Crypto/token monetisation.** `token.html` exists in the repo. Promoting a
  token as an income route risks legal exposure under UK financial promotion
  rules and would wreck trust. Left alone, not amplified.
- **View-bots, engagement pods, fake supporter counts, fake urgency.** These
  get channels terminated and destroy the credibility everything else rests on.

---

## Measurement — the thing that was missing

Google Analytics (`G-G058FVW6Z2`) was previously installed on **one** page
(`music.html`). It is now on the 12 pages that matter: the catalogue homepage,
all music pages, both money pages and the news page.

Without this, none of the above can be optimised — you cannot price sponsorship,
cannot tell which page converts, and cannot tell whether anything is working.

**In roughly 30 days, check:**
1. Which pages get traffic at all
2. Which pages send clicks to YouTube
3. Where donation clicks come from

Then put effort into whatever is already working, rather than guessing.

Also worth doing, both free and both about ten minutes:
- **Google Search Console** — submit `sitemap.xml`, see real search queries
- **Bing Webmaster Tools** — same, and much less competitive

---

## The realistic timeline

Being straight, because a plan built on fantasy helps nobody:

| Timeframe | Realistic outcome |
|---|---|
| Month 1–3 | YPP application if watch hours allow. First donations possible but likely rare. Traffic data starts accumulating. |
| Month 3–6 | If monetised, small but real YouTube income. Enough data to price sponsorship honestly. |
| Month 6–12 | Sponsorship or a sync placement becomes plausible. YouTube income grows with catalogue and subscribers. |

**This does not replace a wage quickly, and it will not happen with nobody
doing anything at this end.** The honest version is: the infrastructure is now
in place so that when traffic or attention arrives, it can convert — and the
YouTube route needs no selling from you at all.

The highest-leverage thing you can do is keep making music. 233 videos got you
to 1,360 subscribers. The next 233 matter more than any page on this site.
