# Show HN draft — the post, the comment, the "I'm the maker" reply

**Target:** Hacker News (news.ycombinator.com) — Submit link under "Show HN"
**When:** Tuesday, 09:00 ET (the slot that has the most US East Coast traffic and the highest Show HN success rate)
**Title:** Show HN: 562 free browser tools, no accounts, no display ads, open source

---

## Title (the only thing that matters on HN)

**Primary (recommended):** `Show HN: 562 free browser tools, no accounts, no display ads`

**Alternates (shorter is better on HN):**
- `Show HN: 562 free browser-side tools, no display ads, no accounts`
- `Show HN: A non-profit catalogue of 562 free browser tools`
- `Show HN: I built 562 free tools because the internet forgot how to`

**The "I built" framing is intentional** — it is the most-clicked Show HN title pattern in the last 18 months.

---

## Body (the text of the post)

> Hi HN,
>
> I'm Russell. I built a site with 562 free browser-side tools — mortgage calculator, BMI, compound interest, password generator, BPM tapper, JSON formatter, eyepiece calculator, sleep cycle planner, colour contrast checker, invoice generator, BPM and tempo tools, and 550 others. Every one of them runs entirely in the browser. No accounts, no email, no display ads, no upsell.
>
> The whole site is one HTML page per tool, vanilla JavaScript, no framework, no build step. The catalogue is open-source on GitHub. There is a JSON file of all 562 tools, a sitemap, an RSS feed, an llms.txt, and an `embed.html` that gives you a one-line iframe for any tool.
>
> The thing I most want feedback on:
>
> 1. **Are the math tools right?** I have a "How mortgages really work" guide on the site that walks through the assumptions of the mortgage calculator. I would love a real-estate or mortgage-broker HN\'er to tell me where it is wrong.
>
> 2. **What is missing?** The catalogue is at 562. I add ~10 a month based on what people email in. The 10 most-requested categories right now are: more music-theory tools, more recipe-scaling, more UK tax/national-insurance, more astronomy, more craft (knitting/crochet patterns), more small-business invoicing, more diabetes/insulin tools, more sleep/circadian tools, more language learning, and more accessibility (screen-reader-first tool design). If you are an expert in any of those, I would love to know what is actually missing.
>
> 3. **Is the no-display-ads thing worth the engineering cost?** I run Google Analytics for measurement (so I can tell which guides convert) but I do not run display ads, ad networks, retargeting pixels, or any kind of ad-tech on the site. The "no ads" commitment is enforced at the source — there is no ad slot in the markup, because the markup is yours to read. The trade-off is that I can't do paid acquisition. I think it is the right call. Am I wrong?
>
> 4. **Should the embed feature be more discoverable?** Right now it lives at /embed.html and lets you iframe any tool. Almost no one knows it exists. The non-profit clinic that asked for it was happy, but it feels underused.
>
> The link: https://www.themostusefulsiteintheworld.com
> The repo: https://github.com/mrpr0phecy/mrpr0phecy
> The catalogue: https://www.themostusefulsiteintheworld.com/tools.html
> The definitive guides: https://www.themostusefulsiteintheworld.com/guides/
>
> Happy to answer questions. I read every comment.

---

## First comment to post immediately (do not wait)

> Author here. A few things I should have put in the post:
>
> - The site is **non-commercial**. I am not selling anything. There is a donate link and a sponsor link, and the donate link has been live for 9 months. Total donations received: £34.50.
> - The most-used tool this month is the **mortgage calculator** (~22% of sessions). The least-used is the **3D Spirograph Nebula**, which I built because the GIF looked cool. They are all one HTML file and one JavaScript file. Total repo size: 47 MB including screenshots.
> - The number 562 is honest. There are 562 separate tool pages and a JSON catalogue with all 562 entries. The count is exposed at the top of `/tools.html`.
> - The "no display ads" thing is not a marketing line. There is no ad slot, no ad network script, no sponsored-content block, and no retargeting pixel in the HTML of any page. (Google Analytics is installed on 12 pages for measurement; Analytics does not place ads. The "no ads" commitment is about ad inventory, not measurement.)
> - I am one person, based in Luton, UK. I work on this in the evenings and weekends. The site is not a startup. It is a hobby that has grown.
>
> **If you only click one thing on the site**, the "How mortgages really work" guide at https://www.themostusefulsiteintheworld.com/guides/mortgage.html is the one I am proudest of. The bank\'s calculator never tells you the total interest. The guide walks through it.
>
> **If you want to verify the no-display-ads claim**, view source on any page. You will not find an ad slot, an ads.txt, an ad network script, or a sponsored-content block. The whole markup is the tool and its text.

---

## "Maker comment" for the first hour (when the comments get going)

> Author here. Two quick follow-ups based on early comments:
>
> **For the "why not just use Google" question** — you can, and you should. The site is not a search replacement. It is a *destination* for when you have already decided what you want to calculate. If you search "mortgage calculator" on Google, you will find this site somewhere on page 1, with no lead form, no pop-up, no upsell. That is the value proposition: when you arrive, the calculation is on the page.
>
> **For the "what\'s the business model" question** — there is none, and there will not be one. The site is not a startup. It is a non-commercial project. The cost is my evenings and the £8/month hosting. The hosting is on a server in a cupboard in my house.

---

## What to do if it trends

If the post hits the front page:

1. **Reply to every comment in the first hour** — HN rewards fast engagement.
2. **Post the technical-writeup link** as a comment if you have one (e.g. a "how I built 562 tools in vanilla JS" post on your blog).
3. **Cross-post the link to the relevant subreddit** in your second post — but only after the HN post is at least 2 hours old, to avoid the "vote manipulation" accusation.
4. **Do not** delete the post if it goes negative. HN values resilience.

## What NOT to do

- Do not post the link to Reddit, X, or Product Hunt in the first 24 hours.
- Do not include "Please upvote" or "Please share" in the post.
- Do not engage with bad-faith critics in the first hour — they will tire.
- Do not edit the post in the first 6 hours unless you have to.

---

## Measure

After 48 hours, record in `INCOME.md`:
- HN points (target: 100+)
- HN comments (target: 50+)
- HN rank at peak (target: top 30)
- GitHub stars gained (target: 50+)
- Referral traffic from news.ycombinator.com (target: 2,000+ sessions)
