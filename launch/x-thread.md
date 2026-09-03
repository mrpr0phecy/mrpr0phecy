# X / Bluesky / Mastodon thread — the 8-tweet build-in-public

**Target:** X (Twitter), Bluesky, and/or Mastodon. Pick one primary, cross-post to the others.
**When:** the same day as the Show HN post, 2-3 hours after HN goes up (so the HN link is already in the wild)
**Tone:** build-in-public, technical, no marketing speak. The point of the thread is to make the *process* interesting, not to sell the *product*.

---

## Thread (8 tweets / posts)

> **1/8**
>
> I spent 2 years building a site with 562 free browser-side tools.
>
> Mortgage calculator. BMI. Compound interest. Password generator. BPM tapper. JSON formatter. Eyepiece calculator. Invoice generator. Sleep cycle planner. Colour contrast checker.
>
> 550+ more. All free. All in the browser. No accounts, no ads, no tracking.
>
> Here\'s how ↓
>
> [link to the site]

> **2/8**
>
> The architecture is intentionally boring.
>
> • 562 separate HTML files, one per tool
> • 1 JSON file with all 562 entries
> • 1 home page that reads the JSON
> • 1 build script that regenerates the sitemap, RSS, and embed page from the JSON
>
> No npm. No framework. No build step. Total repo: 47 MB.

> **3/8**
>
> The most-interesting engineering decision was the no-tracking part.
>
> Open DevTools → Network → reload any page on the site. You will see one request. The page itself. No analytics, no fonts from Google, no CDN, no third-party scripts.
>
> This is more work than running a pageview counter would be. I think it\'s the right call.

> **4/8**
>
> The math tools are the part I am proudest of.
>
> The "How mortgages really work" guide walks through the standard repayment formula, the three things the bank\'s calculator never shows you, and the honest way to use the numbers.
>
> Banks show you the monthly payment. The guide shows you the total interest over 25 years. It\'s a £40k difference.

> **5/8**
>
> The catalogue as data.
>
> cards.json is exposed. related.json is exposed. llms.txt is exposed. .well-known/ai.txt says "AI engines can cite this site".
>
> The first AI citations started showing up 2 weeks after I added the definitive guides. The site is being read as a *source*, not just a *page*.

> **6/8**
>
> The embed feature is the under-rated part.
>
> /embed.html lets you iframe any tool in one line. A non-profit health clinic has the BMI calculator on their resources page. A primary school has the times-tables tool on theirs.
>
> About 30% of traffic now comes from embeds.

> **7/8**
>
> The numbers.
>
> 562 tools. 47 MB repo. £8/month hosting. £34.50 in donations over 9 months. 30 outside contributors. 12 long-form guides. 3 blog posts. 1 person, evenings and weekends, in Luton, UK.
>
> The site is not a startup. It is a hobby that has grown.

> **8/8**
>
> If you only click one thing on the site, click this:
>
> https://www.themostusefulsiteintheworld.com/guides/mortgage.html
>
> It\'s the guide I am proudest of. The bank\'s calculator never tells you the total interest. This one does.
>
> Repo: https://github.com/mrpr0phecy/mrpr0phecy
>
> Happy to answer questions.

---

## Tweaks for Bluesky

Bluesky\'s character limit is the same as X (300), so the thread works as-is. The tone is already technical and link-friendly. One change: Bluesky audiences skew more toward open-source and indie-web, so lead with the "no tracking" or the "open source" tweet if you want to pick a different tweet #1.

## Tweaks for Mastodon

Mastodon has a 500-character limit per post. The thread works as-is, but you have room to expand each tweet. The indieweb/Mastodon audience will appreciate a longer post #1 that includes the link to the repo as well as the live site.

---

## What NOT to do

- Don\'t start the thread with "I just launched". Lead with the *what*, not the *when*.
- Don\'t add "RT if you found this useful" at the end. It is the single most reliable way to get your reach throttled on every platform.
- Don\'t use 5 hashtags. 0–2 is the right number.
- Don\'t cross-post the exact same text to all 3 platforms at the same minute. Stagger by 10-15 minutes so the engagement signals are independent.

---

## What to record

After 48 hours, record in `INCOME.md`:
- X impressions (target: 5,000+)
- X engagements (target: 200+)
- Bluesky likes/reposts (target: 50+)
- Mastodon boosts/favs (target: 30+)
- Referral traffic from twitter.com / bsky.app / mastodon.social (target: 500+ sessions)
