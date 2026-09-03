# daily.dev post + community launch kit

**Target:** daily.dev (the developer-focused content platform with ~1M MAU)
**When:** the same day as the Show HN post, 3-4 hours after HN goes up
**Why daily.dev:** it surfaces posts to developer audiences that don\'t read HN, and the upvote/downvote system is more forgiving than HN for less-known projects.

---

## Post (the daily.dev "Submit a post" form)

**Title:** `I built 562 free browser-side tools in 2 years. Vanilla JS, no build, no npm.`

**URL:** https://www.themostusefulsiteintheworld.com

**Tags:** `#tooling` `#opensource` `#showdev` `#javascript`

**Cover image:** the og-tools.png at the top of the site, or a screenshot of the catalogue at /tools.html

---

## The post text (the daily.dev post body)

> I\'m a developer in Luton, UK. For the last 2 years I\'ve been building a site with 562 free browser-side tools — mortgage calculator, BMI, compound interest, password generator, BPM tapper, JSON formatter, eyepiece calculator, sleep cycle planner, colour contrast checker, invoice generator, and 550+ more.
>
> The whole thing is **vanilla JavaScript, no framework, no build step, no npm, no TypeScript, no bundler.** Each tool is one HTML file. The total repo is 47 MB, of which ~14 MB is the tools themselves and the rest is screenshots for the help docs.
>
> **The architecture in 60 seconds:**
> - `cards/<tool-name>.html` — one file per tool, 562 files
> - `cards/cards.json` — a single JSON file with all 562 entries (id, name, title, description, category, file)
> - `index.html` — the home page, driven by the JSON, with a client-side category filter
> - `tool.html?card=<name>` — a shim that reads the URL and injects the tool
> - A build script that runs on my laptop before I push and regenerates the sitemap, RSS, llms.txt, related.json, and the home page from the JSON
>
> **The no-display-ads part:**
> I made a deliberate choice to ship no ad networks, no retargeting pixels, no sponsored-content blocks, no upsell modals. View source on any page and you will not find an ad slot — because the markup is the page, and the page is the tool. (The third-party scripts on the site are Google Analytics, for measurement, and three.js / cannon.js / the YouTube IFrame API on the specific tool pages that need them. None of them are advertising.)
>
> **Open source:**
> The repo is at https://github.com/mrpr0phecy/mrpr0phecy. The contribution guide is in `CONTRIBUTING.md`. The issue templates are pre-filled for tool requests, bug reports, and content/SEO feedback. About 30 outside contributors in 2 years.
>
> **What I\'d love feedback on from this community:**
> 1. Is the JSON-driven architecture sustainable? Adding a tool is a 3-step process (write the HTML, add a JSON entry, run the build). It\'s been great for me as a solo dev, but I am not sure it scales to a 10-person team.
> 2. Should I add a PWA / service worker for offline use? It\'s on the list but the cost-benefit hasn\'t been obvious.
> 3. Any tools you think are missing? The most-requested categories are: more music-theory, more UK tax/NIC, more craft (knitting/crochet), more small-business invoicing, more sleep/circadian, more accessibility (screen-reader-first).
>
> Happy to answer any questions. The site is non-commercial; the donate link has made £34.50 in 9 months.
>
> Russell.

---

## daily.dev-specific tactics

1. **Use the right tags.** The 4 tags above are the ones the daily.dev audience scans. Avoid tags like `#career` or `#fun` — they are noisier.

2. **Post in the morning (your time, but ideally 09:00-12:00 UTC).** daily.dev\'s traffic peaks in the European and US morning.

3. **Reply to comments within 4 hours.** daily.dev surfaces recent, active comments higher in the feed.

4. **Don\'t cross-post more than once.** A daily.dev post that is also on HN and Reddit is fine if the URLs are different, but don\'t post the same content twice on daily.dev.

5. **Use a real screenshot in the cover image.** The og-tools.png or a screenshot of /tools.html works. Posts with custom cover images get ~2× the click-through.

---

## What to record

After 48 hours, record in `INCOME.md`:
- daily.dev upvotes (target: 50+)
- daily.dev comments (target: 10+)
- Referral traffic from daily.dev (target: 500+ sessions)
