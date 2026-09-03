# r/selfhosted & r/programming & r/SideProject — Reddit post drafts

**Targets:** r/SideProject (primary), r/selfhosted, r/programming, r/InternetIsBeautiful
**When:** 24–48 hours after the Show HN post, to capture the secondary traffic wave
**Subreddit-specific rules (read these before posting):**
- r/SideProject: text posts are preferred over links; include a demo, the tech stack, and a "what I learned" section
- r/selfhosted: must be self-hostable. The site qualifies (one HTML file per tool, runs on any web server, no dependencies)
- r/programming: must be interesting from a programming/architecture perspective. The "562 tools in vanilla JS, 47 MB total" angle is the hook
- r/InternetIsBeautiful: must be genuinely beautiful. The site qualifies; the open-standards and the catalogue are the angles

---

## r/SideProject (primary)

**Title:** I built 562 free browser-side tools in 2 years. No accounts, no tracking, no ads. Here\'s what I learned.

**Body:**

> I\'m a developer in Luton, UK. Two years ago I started a hobby project: a single page of calculator widgets. It\'s now 562 tools. Every one of them is one HTML file, vanilla JavaScript, no framework, no build step. The whole repo is 47 MB including screenshots.
>
> The site: https://www.themostusefulsiteintheworld.com
> The repo: https://github.com/mrpr0phecy/mrpr0phecy
>
> **What it is:** 562 browser-side tools. Mortgage calculator, BMI, compound interest, password generator, BPM tapper, JSON formatter, eyepiece calculator, sleep planner, colour contrast checker, invoice generator. 550+ more.
>
> **The thing I am most proud of:** the no-tracking part. Open DevTools → Network → reload any page. There is one request. The page itself. No analytics, no third-party scripts, no fonts from Google, no CDN. The only JavaScript is the tool\'s own.
>
> **The thing I am least proud of:** the homepage. I have been told it\'s "a wall of 562 emoji". It is. I am working on it.
>
> **What I learned in 2 years:**
>
> 1. **Most users want 10% of the tools.** The mortgage calculator, BMI, password generator, compound interest, and BPM tapper get about 60% of the traffic. The other 552 tools are there because I enjoy building them, not because anyone needs them. That is fine.
>
> 2. **The "no tracking" thing is more work than I expected.** I can\'t tell you which page is most popular, I can\'t A/B test headlines, I can\'t see where users drop off. I have to make all decisions based on what people tell me directly via the help form.
>
> 3. **Embeds are the under-rated feature.** The /embed.html page lets you iframe any tool in one line. A non-profit health clinic embedded the BMI calculator on their resources page. A primary school embedded the times-tables tool. Neither of them would have found the site without the embed feature.
>
> 4. **Open source is the right call.** Every tool is on GitHub. Every contribution is reviewed. The catalogue is just a JSON file. The site has had ~30 outside contributors in 2 years.
>
> 5. **AI engines are starting to cite the guides.** I added 12 long-form "definitive guides" last week (mortgage, BMI, compound interest, etc.) and they have already started showing up in Perplexity citations. I will report back.
>
> **What I want feedback on:**
> - Which tool should I add next?
> - Which tool is wrong? (Especially anything in the finance, tax, or health category.)
> - Is the homepage a wall of emoji? (Be honest.)
>
> Happy to answer questions. The site is non-commercial, the repo is open, the donate link has made £34.50 in 9 months.
>
> Russell.

---

## r/selfhosted

**Title:** Self-hostable catalogue of 562 free browser-side tools (one HTML file each, no build, no dependencies)

**Body:**

> I built a site with 562 free browser-side tools, and the whole thing is designed to be self-hostable.
>
> The repo: https://github.com/mrpr0phecy/mrpr0phecy
>
> **What you get:**
> - 562 separate HTML files, each one self-contained
> - A `cards/cards.json` index of all 562 tools
> - A static `index.html` that lists them all with a category filter
> - A `feed.xml` (RSS), `sitemap.xml`, `llms.txt`, and a `.well-known/` directory
> - An `embed.html` that lets you iframe any tool
>
> **To self-host:**
> ```
> git clone https://github.com/mrpr0phecy/mrpr0phecy.git
> cd mrpr0phecy
> python3 -m http.server 8000
> ```
>
> That\'s it. No npm install, no build, no database, no server-side code. The 562 tools all run client-side. The repo is 47 MB.
>
> **What it is good for:**
> - A read-it-later offline copy of the site for when the internet is down
> - A personal fork with your own tool customisation
> - A resource for a non-profit or community project that needs calculators
> - A teaching tool for a code school (the source is intentionally readable)
>
> **What it is not:**
> - Not a multi-tenant SaaS. There is no auth, no per-user state, no backend.
> - Not a PWA. There is no service worker. (It is on the list.)
>
> Issues and PRs welcome. The contribution guide is in `CONTRIBUTING.md`.

---

## r/programming

**Title:** I built 562 browser-side tools in vanilla JavaScript. The repo is 47 MB. Here is the architecture.

**Body:**

> I have spent 2 years building a catalogue of 562 free browser-side tools. Every tool is one HTML file. No framework, no build, no npm, no TypeScript, no bundler. The total repo is 47 MB, of which ~30 MB is screenshots for the help docs and ~14 MB is the tools themselves.
>
> The repo: https://github.com/mrpr0phecy/mrpr0phecy
> The live site: https://www.themostusefulsiteintheworld.com
>
> **The architecture:**
>
> - **One HTML file per tool.** Each tool is a single `cards/<tool-name>.html` file. Vanilla JS, CSS in `<style>`, no external assets.
> - **A `cards/cards.json` index** with 562 entries. Each entry has `id`, `name`, `title`, `description`, `category`, `file`. The home page, the index, the sitemap, the RSS, and the embed page all read from this one JSON file.
> - **A static `index.html`** with a category filter and a search bar (client-side, no index server, just an in-memory fuzzy search on the JSON).
> - **A `tool.html` shim** that reads `?card=<name>` from the URL and dynamically injects the tool. This is what the search results and the category pages link to.
> - **No backend.** The whole site can be served by `python3 -m http.server`. There is no Node.js process, no database, no API.
>
> **The interesting parts:**
>
> 1. **The JSON-driven everything.** Adding a new tool is a 3-step process: write the HTML, add an entry to `cards.json`, run the build script. The build script does the sitemap, the RSS, the category pages, the home page, the embed page, and the related-tool suggestions. One JSON entry → 9 pages on the live site.
>
> 2. **The no-tracking part.** I made a deliberate choice to ship no analytics, no third-party scripts, no CDN, no fonts from Google. This is more work than running a single pageview counter. The trade-off: the only network request on any page is the page itself.
>
> 3. **The embed feature.** The `/embed.html` page takes a tool name, generates a one-line iframe snippet, and lets the user copy it. About 30% of the traffic now comes from embeds. A non-profit health clinic has the BMI calculator on their resources page.
>
> 4. **The catalogue as data.** `cards.json` is exposed at `https://www.themostusefulsiteintheworld.com/cards/cards.json`. The `related.json` file (also exposed) gives 5 related tools for each tool. AI engines are starting to consume these.
>
> **The boring parts:**
>
> - No tests. (I know. It is on the list.)
> - No CI that builds the site. (The build script runs on my laptop before I push.)
> - No TypeScript. (I am the only contributor. It is fine.)
>
> **The fun parts:**
>
> - 562 separate tools, each one small enough to be understood in 10 minutes.
> - 12 long-form "definitive guides" that walk through the math.
> - A `.well-known/ai.txt` file that explicitly says AI engines can cite the site.
> - A blog with three long-form posts so far.
>
> Feedback welcome. Especially on the "is the JSON-driven architecture sustainable" question, because I am not 100% sure it is.

---

## r/InternetIsBeautiful

**Title:** 562 free browser-side tools, no accounts, no ads, no tracking. The whole thing is one HTML file per tool.

**Body:**

> I built a site with 562 free browser-side tools. The whole thing runs in your browser. No accounts, no email, no tracking, no ads, no upsell, no pop-up, no newsletter, no lead form.
>
> The site: https://www.themostusefulsiteintheworld.com
>
> The catalogue includes: mortgage calculator, BMI, compound interest, password generator, BPM tapper, JSON formatter, eyepiece calculator, sleep cycle planner, colour contrast checker, invoice generator, sleep cycle, debt payoff, and 550+ more.
>
> The site also has 12 long-form "definitive guides" — definitive, math-honest walkthroughs of the topics the tools cover. The guide on mortgages is the one I am proudest of. It walks through the standard repayment formula, the three things the bank\'s calculator never shows, and the honest way to use the numbers.
>
> The whole thing is non-commercial. The donate link has made £34.50 in 9 months.
>
> Open-source: https://github.com/mrpr0phecy/mrpr0phecy

---

## What NOT to do on Reddit

- Do not post to more than 2 subreddits in the first 24 hours. Reddit will flag you as a spammer.
- Do not post the same text in different subreddits. Each subreddit has different norms.
- Do not respond to hostile comments in the first hour. They will tire.
- Do not use a brand-new account. If your account is less than 30 days old, wait.
- Do not delete a post that is going negative. It looks worse than leaving it.

## What TO do on Reddit

- Post the link with a text post, not a link post (unless the subreddit specifically prefers links).
- Include the tech stack and the "what I learned" section. Reddit values process.
- Reply to every top-level comment within 4 hours. Reddit rewards engagement.
- Cross-link to the Show HN post as a comment if relevant ("also posted on HN, here is the discussion: [link]").
