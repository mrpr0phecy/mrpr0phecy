# ARCHITECTURE.md — mrpr0phecy/mrpr0phecy

**Read this first.** It is the single onboarding document for this repository,
written so that a human or an AI agent handed a GitHub token can be productive
within about ten minutes and without breaking anything.

**For AI agents:** start with **[AGENTS.md](AGENTS.md)**, the agent-facing
operating manual (what to never touch, task sequences, workspace budget).
If you need GitHub access in a fresh session, see
**[AGENT_ACCESS.md](AGENT_ACCESS.md)** — the self-service device-flow auth
(`bash scripts/agent-auth.sh`) plus the sparse-clone recipe. Use it instead of
asking the owner to paste a token.

Last substantive update: 2026-08-30.

For anything money-related — what earns, what the real numbers are, and what
was deliberately not built — see **[INCOME.md](INCOME.md)**.

---

## 1. What this repository actually is

One GitHub Pages site serving **two unrelated products** from the same domain:

| | Product | Entry point | Audience |
|---|---|---|---|
| **A** | **The Most Useful Site In The World** — 666 self-contained browser tools | `index.html` | People searching for a specific tool |
| **B** | **MrProphecy** — the music project of the repo owner | `listen.html` | Listeners, YouTube discovery |

**These two are deliberately kept separate.** This is a standing instruction
from the owner, not an accident of history. Do not add music players, artist
banners, or cross-promotional footers to the tool catalogue or to any card, and
do not add tool links to the music pages. If a task says "improve the site",
establish *which* site first.

- **Live:** <https://www.themostusefulsiteintheworld.com>
- **Hosting:** GitHub Pages, served straight from `main`. There is no build
  step, no bundler, no CI, no framework. What is committed is what is served.
- **Custom domain:** the `CNAME` file. Deleting it breaks the domain.
- **Deploy latency:** roughly 30–60 seconds after a push. Always verify live
  with `curl` rather than assuming.

---

## 2. Repository map

```
/
├── index.html              Product A: tool catalogue (search/filter UI)
├── cards/
│   ├── cards.json          Generated index of all 666 tools
│   └── <tool-name>.html    666 tool fragments (NOT full documents)
├── generate-cards-json.js  Rebuilds cards.json from the cards/ directory
│
├── listen.html             Product B: music hub — the main entry point
├── radio.html              Continuous player — 47 tracks back to back (YPP watch time)
├── thisorthat.html         Head-to-head voting game — shareable, builds a top 5
├── youtubepromo.html       Videos & Visuals — all 47 animated videos
├── youtubepromo1.html      Stream Free — SoundCloud / free-listening angle
├── youtubepromo2.html      The Full Story — long-form guide
├── youtubepromo3.html      Sons of South — the crew / UK scene
├── luton.html              Luton & Bedfordshire — local SEO + FAQ schema
├── music.html              Press kit — bio, discography, booking
├── support.html            Direct support / PayPal — music side
├── donate.html             Wikipedia-style appeal — tools side
├── sponsor.html            Sponsorship / advertising enquiries
├── mpnews.html             Music news page
├── opensourcenews.html     Open Source News — live global broadcast from open RSS feeds (see §9)
│
├── <12 language pages>     hindi, marathi, bengali, punjabi, chinese, dutch,
│                           french, japanese, portuguese, russian, spanish, thai
│                           — translated MrProphecy landing pages
│
├── sonicfansite.html       Standalone Sonic fan site (unrelated to A and B)
├── beachsimulator.html, citysimulator.html, fightsimulator.html,
│   aiwalker.html, animation.html, birdapp.html, clock.html,
│   eternalbeffudlementmachine.html, slideshowtest.html, token.html,
│   tool.html, indexbeta.html, hokidea.html
│                           Experiments and one-offs. Not linked from the
│                           catalogue. Safe to ignore; ask before deleting.
│
├── manifest.json           PWA manifest
├── sw.js                   Service worker — present but NOT registered (§7)
├── robots.txt              Allows all, points at the sitemap
├── sitemap.xml             All 518 pages, generated (§6)
├── icon-192.png, icon-512.png, icon-maskable-512.png
├── logo.png, mrprophecypic.jpg, backgroundpic.jpg
├── images/                 ~50 MB of photos. Excluded from sparse checkouts.
├── README.md               Short public-facing readme
├── guide.txt               69 KB of older notes; historical, not authoritative
├── CV.docx / CV.pdf / cv.pdf / latestcv.docx    Owner's CV files
└── substitutions/, system/, digitaldetoxcardshtml/    Legacy, unused
```

---

## 3. Product A — the tool catalogue

### How it works

`index.html` fetches `cards/cards.json` at runtime and renders a searchable
grid. **There are no hardcoded links to individual tools anywhere.** Grepping
`index.html` for `cards/*.html` returns nothing — this surprises people. A tool
is discoverable if and only if it appears in `cards.json`.

Each tool opens inside the catalogue shell, which supplies the CSS custom
properties. That is why cards are fragments rather than whole pages.

### Anatomy of a card

A card is an **HTML fragment**. No `<!doctype>`, no `<html>`, `<head>` or
`<body>`.

```html
<!-- cards/my-tool.html -->
<h2 id="mytl-title" style="margin-top:0;color:var(--accent);">🔧 My Tool</h2>

<form aria-describedby="mytl-desc" onsubmit="event.preventDefault();">
  <p id="mytl-desc" class="small"
     style="color:var(--text-secondary);margin-bottom:14px;font-size:0.85rem;">
    One or two sentences describing what the tool does.
  </p>
  <!-- controls -->
</form>

<script>
(function(){
  // All logic inside an IIFE. Never leak globals.
})();
</script>
```

Hard rules, learned from breakages:

1. **Fragment only.** A full document nested inside the shell breaks layout.
2. **Element IDs must be globally unique across all 666 cards.** They share one
   DOM. Pick a short prefix per tool (`b3js-`, `cwf-`, `mytl-`) and use it on
   every single element. An ID collision silently makes another tool misbehave,
   which is very hard to trace.
3. **Inline styles**, plus the CSS variables in §5. There is no per-card
   stylesheet.
4. **Wrap all JS in an IIFE.** No global `let`/`const`/`function`.
5. **Self-contained.** No external JS/CSS. No network calls. Everything runs
   offline in the browser.
6. `onsubmit="event.preventDefault();"` on any form, or the page reloads.

### Adding a tool — the exact sequence

```bash
# 1. Write the fragment
vim cards/my-tool.html

# 2. Regenerate the index
node generate-cards-json.js

# 3. Re-apply the category (see the warning below)

# 4. Bump the count in index.html: "Search 500+ free tools" -> 501+

# 5. Commit, push, wait ~50s, then verify live:
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

> **Warning — `generate-cards-json.js` overwrites categories.**
> The script assigns `category` from hardcoded filename lists near the top of
> the file. Any card not in a list gets a default. If you set a category by
> hand and then re-run the script, **your category is silently lost**. Either
> add the filename to the appropriate list inside the script (preferred), or
> re-apply the category after every run. This has bitten previous work.

### Card JSON shape

```json
{
  "id":          "acoustic-levitation-standing-wave-title",
  "name":        "acoustic-levitation-standing-wave",
  "title":       "🔊 Ultrasonic Acoustic Levitation",
  "description": "40 kHz ultrasonic standing wave acoustic trap...",
  "category":    "Science & Engineering",
  "file":        "acoustic-levitation-standing-wave.html",
  "path":        "cards/acoustic-levitation-standing-wave.html"
}
```

`title` and `description` are scraped from the `#<prefix>-title` and
`#<prefix>-desc` elements. If a card is missing them, its catalogue entry will
be blank — a common cause of "my tool shows up empty".

### Categories (666 tools)

| Count | Category | | Count | Category |
|---|---|---|---|---|
| 122 | Science & Engineering | | 11 | SaaS & Business Killers |
| 110 | Productivity & Lifestyle | | 11 | Lucid Dreaming & Sleep |
| 47 | Writing & Language | | 10 | Wellbeing & Community |
| 35 | Finance & Money | | 10 | Natural Remedies & Herbs |
| 53 | Sports | | 10 | AI & Autonomous Agents |
| 28 | Mathematics | | 10 | Astronomy & Space |
| 23 | Music & Audio | | 10 | Anime & Otaku Culture |
| 22 | Health & Fitness | | 10 | Aquatics & Fishkeeping |
| 27 | Home & DIY | | 10 | Birdwatching & Ornithology |
| 15 | Culinary & Food Science | | 10 | Dogs & Canine Care |
| 12 | Museum & Collection | | 10 | MrProphecy Arcade |
| 11 | Interactive Art & Living Worlds | | 7 | Virtual Worlds & Gaming |
| 10 | Mind-Blowing Demos | | | |
| 10 | Algorithms & Computer Science | | | |

---

## 4. Product B — MrProphecy music

### Verified facts

Everything below was confirmed against YouTube's oEmbed API. **Use these
values; do not invent IDs.**

| Item | Value |
|---|---|
| YouTube channel | `@MrProphecy` — note the capitals, this is canonical |
| Flagship video | `qL6X6n6FLuo` — "MrProphecy – Injection" |
| Animated Soundscapes | `PLasqsDl8vf8dX09ZHd9G33ihpdUV2h2G8` — 47 videos |
| In 2025: The Movie | `PLasqsDl8vf8eEUJVB923RSbXDJHazWLoZ` — 26 videos |
| Sons of South | `PLB68AB9B6E57C3FC1` — 100 videos |
| SoundCloud | `soundcloud.com/mrpr0phecy` (note the **zero**) |
| Instagram | `@mrpr0phecy` (zero) |
| TikTok | `@mrprophecy1212` |
| Base | Luton, England |

The handles are inconsistent by nature: YouTube uses an `o`, SoundCloud and
Instagram use a `0`. This is not a typo — do not "fix" it.

**The "In-" series.** 26 of the 47 animated tracks have titles beginning with
"In": Injection, Invincible, Infighting, Incarnation, Inside, Inrush,
Innersoul, Invested, Innovate, Incursion, Infiltrate, Incompetence, Inherent,
Introvert, Instinct, Indigo, Init, Inhabited, Internal, Integrate,
Incandescent, Inbound, Inhale, Inauguration, Inferno, Invasion. This is a
deliberate creative signature and `listen.html` is built around it.

### Getting video metadata without an API key

YouTube blocks scraping from most automated environments, but oEmbed is open
and needs no key:

```bash
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEO_ID&format=json"
```

To enumerate a playlist, extract IDs from the playlist HTML then resolve each:

```bash
curl -s "https://www.youtube.com/playlist?list=PLAYLIST_ID" \
  | grep -oE '"videoId":"[A-Za-z0-9_-]{11}"' \
  | grep -oE '[A-Za-z0-9_-]{11}' | awk '!seen[$0]++'
```

Thumbnails follow a fixed pattern — no API needed:
`https://i.ytimg.com/vi/<ID>/maxresdefault.jpg` (also `hqdefault`, `mqdefault`).

### `listen.html` — the music hub

The most recently rebuilt page and the best template for future music work.

- Hero built on the flagship video's artwork.
- **Video wall of all 47 videos**, split into the In- series and 21
  collabs/remixes, generated from live YouTube metadata.
- **Click-to-load players.** No `<iframe>` exists on load. Nothing is requested
  from YouTube until the visitor clicks. This keeps the page fast and means no
  third-party cookies are set for people who never press play. *Preserve this
  behaviour* — dropping in a plain `<iframe>` undoes it.
- Modal player: Escape closes, focus is restored, and the iframe is destroyed
  on close so audio actually stops.
- `MusicGroup` JSON-LD, canonical, Open Graph and Twitter cards.

### The music page cluster — one net, seven angles

The music pages are **deliberately separate rather than consolidated**. Each
targets a different search intent so the project casts a wider net; merging
them would narrow it. The rule is that no two pages may compete for the same
query — every page needs its own title, description, keywords and angle.

| Page | Angle | Targets |
|---|---|---|
| `listen.html` | Hub / start here | brand searches, "MrProphecy" |
| `radio.html` | Continuous play | "listen continuously", background listening |
| `thisorthat.html` | Interactive game | shares, repeat visits, "rank tracks" |
| `youtubepromo.html` | Videos & visuals | "animated music video", "In- series" |
| `youtubepromo1.html` | Free streaming | "stream free", "SoundCloud", "no signup" |
| `youtubepromo2.html` | Long-form guide | "who is MrProphecy", discovery reading |
| `youtubepromo3.html` | Sons of South | crew names, "All Eyes On The South" |
| `luton.html` | Local | "Luton rapper", "Bedfordshire hip hop" |
| `music.html` | Press kit | "bio", "booking", press and curators |
| `support.html` | Direct support | "support independent artist", tipping |

All seven share a sticky nav (`.mp-nav`, generated by `nav()` in the build
script) so the cluster is interlinked and ranking signal flows between the
pages instead of each being an orphan island — which is what they were before.

**If you add a music page:** give it a genuinely distinct angle, add it to
`NAV_PAGES`, regenerate the nav on all pages, and add it to the sitemap. If you
cannot state its unique search intent in one line, it should not be a new page.

### Music page conventions

- Always embed via `https://www.youtube-nocookie.com/embed/<ID>`.
- Every bare channel link gets `?sub_confirmation=1`, which opens the subscribe
  dialog instead of just the channel.
- Never commit a placeholder video ID. If a real one is unavailable, link to
  the channel or a playlist instead.

### Analytics

Google Analytics `G-G058FVW6Z2` is installed on the 12 pages that matter
(catalogue homepage, all music pages, both money pages, news). It was
previously on `music.html` only. Add it to any new public page — without it
there is no way to price sponsorship or tell what is working.

### Money and monetisation

Payments go to **`paypal.me/russellhead`** (Russell Head). The PayPal QR the
owner uses resolves to the same account
(`paypal.com/qrcodes/managed/5db885a3-66b7-4c5a-9a7c-2caded6d2c7e`), but prefer
the `paypal.me` handle in markup — it is readable, linkable and lets you
pre-fill an amount.

Amounts are **GBP**: `https://paypal.me/russellhead/10GBP`. Without the `GBP`
suffix PayPal defaults to the viewer's locale, which showed dollars to a
UK audience.

Rules for anything money-related on this site:

- **Never gate the music.** Everything stays free. Supporters get no exclusive
  tracks or early access — the moment support unlocks content, it stops being
  a free catalogue. This is a deliberate positioning choice, not an oversight.
- **Lead with the free actions.** Subscribing, finishing a video and sharing a
  link are worth more to an unsigned artist than a one-off tip, and saying so
  earns more trust than a hard ask.
- **No fake urgency**, no countdowns, no invented "goals" or fake supporter
  counts, no claims about what the money covers that are not true. The site is
  hosted free on GitHub Pages — do not claim donations pay for hosting.
- Keep the ask on `support.html` and in the nav. Do not scatter donate buttons
  through the tool cards or interrupt playback with them.

### Why radio.html and thisorthat.html exist

**Watch time from embedded YouTube players counts toward YouTube Partner
Programme eligibility**, provided the video is public. This is confirmed
behaviour, not a loophole — YouTube counts embeds on external sites the same
as views on youtube.com.

That makes the site itself a watch-time surface, so two pages are built
specifically around it:

- **`radio.html`** uses the YouTube IFrame Player API to play all 47 tracks
  back to back. One click starts a session that can run for hours. It uses
  `loadVideoById()` on a single player rather than swapping iframes, so
  playback is continuous and the session is unbroken. `onError` skips
  unplayable videos automatically so the station never stalls.
- **`thisorthat.html`** makes watching the *mechanism* of a game: two tracks,
  play both, vote, repeat twelve times, get a personal top 5 that can be
  shared. Repeat visits and shares both come free.

Rules if you extend these:
- Keep the **facade pattern** — no iframe until the visitor clicks. It keeps
  the page fast and avoids setting third-party cookies on arrival.
- On `thisorthat.html` the vote button and the video are **separate elements**.
  They were originally one, which meant clicking the middle of the card did
  nothing (the video overlay swallowed the click). Do not merge them again.
- Never auto-play muted in a hidden element to farm watch time. That is
  invalid traffic, YouTube filters it, and it risks the channel.

### opensourcenews.html

A live world-news broadcast built from open RSS feeds. Self-contained: 3D
globe, TTS anchors, tickers, no backend.

**Feed list (80 feeds).** Each entry is
`{ url, src, cat, weight, region, direct? }`. `cat` is one of `world`,
`science`, `tech`, `finance`, `weather`, `sport`.

**`direct: 1` is the important flag.** 43 of the 80 feeds serve
`Access-Control-Allow-Origin: *` and were confirmed fetchable straight from a
browser page. Those bypass the CORS proxy entirely: no shared quota, no third
party, and the channel keeps working when every proxy is down (verified: 149
stories from 42 sources with all proxies blocked at the network layer).

**Never mark a feed `direct` from a server-side check alone.** Roughly a third
of feeds that send `Access-Control-Allow-Origin: *` to curl are still blocked
in a real browser. Test with `fetch()` from an actual page first.

**Scheduling** is two-phase: direct feeds run 12-wide with no delay, proxied
feeds rotate 8 per cycle through a paced queue. Per-feed health tracking backs
a failing feed off 1/4/9…30 minutes so dead URLs cannot consume the budget.

**Corroboration.** Stories are compared by Jaccard similarity (threshold 0.22)
over significant terms; matches across different outlets are grouped and
promoted in ranking. Machine-templated feeds (USGS/NWS/NOAA/GDACS) are excluded
— their entries match each other on format, not content, so every earthquake
looked like corroboration for every other earthquake.

**Rendering happens on the progressive path**, not at end-of-cycle. Anything
that must affect what the viewer sees has to run there; end-of-cycle only
fires once all batches finish.

### Growth policy — read before "boosting views"

The owner wants more YouTube plays. The agreed approach is **legitimate only**:
correct metadata, fast pages, structured data, honest calls to action, internal
linking, translated landing pages.

Explicitly out of bounds: view-bots, autoplay-in-background tricks, hidden or
1×1-pixel players, misleading thumbnails, engagement pods. These violate
YouTube's Terms of Service, risk demonetisation or channel termination, and
inflate metrics without producing listeners. Do not implement them even if
asked indirectly.

---

## 5. Design language

Two distinct aesthetics. Match the one belonging to the page you are editing.

> **Visual Design Expert on duty.** This repo runs an AI Developer staff
> (`AGENTS.md` §8; roster `scripts/ai-staff.json`). The **Visual Design
> Expert** owns this section and the hub pages it documents. If you are
> another agent or a human taking on design work: read this section, run
> `node scripts/ai-developer.js staff`, then `node scripts/design-audit.js`
> before changing anything visual. Design edits must respect these rules and
> the audit, and stay reviewable (hub pages get human-reviewed PRs — the
> expert's own rule, not an afterthought).

### Product A — tool catalogue: "cyan terminal"

Defined as CSS custom properties in `index.html`:

```css
--accent:         #2dd4ff;   /* cyan — headings, focus, primary */
--accent-dark:    #1aa3cc;
--text:           #e6faff;
--text-secondary: rgba(230, 250, 255, 0.7);
--bg-primary:     #0a0f14;   /* near-black, blue-shifted */
--bg-secondary:   #141e28;
--bg-card:        linear-gradient(145deg, rgba(255,255,255,.03), rgba(255,255,255,.05));
--border-light:   rgba(255, 255, 255, 0.08);
--success:        #39ff14;
--error:          #ff4d4d;
--premium:        #ffd700;
--love:           #9d4edd;
--space-xs/sm/md/lg: 4px / 8px / 12px / 16px;
```

Feel: dark, technical, high-contrast, dense. Utilitarian rather than decorative.
Inputs use `#070f18` backgrounds with thin translucent borders. Every card
title carries a single leading emoji — it is the only ornament, and it doubles
as a visual key in the grid.

### Product B — music: "neon night"

Defined per-page; `listen.html` is the reference implementation:

```css
--bg:    #08080c;   /* near-black */
--panel: #101018;
--line:  rgba(255,255,255,.10);
--txt:   #f2f2f7;
--dim:   #9a9aad;
--hot:   #ff2e63;   /* magenta-red — primary accent */
--gold:  #ffc93c;   /* secondary accent */
--cyan:  #25d8f0;
```

Feel: cinematic and editorial. Oversized `font-weight:900` display type with
tight negative letter-spacing; gradient text on the artist name; generous
vertical rhythm (~74px section padding); blurred artwork behind a dark scrim in
the hero; pill-shaped buttons that lift 2px on hover. YouTube red `#ff0033` is
reserved for subscribe actions so the primary CTA is unmistakable.

### Shared rules

- **Mobile first.** Everything must survive a 360px viewport.
- **Respect `prefers-reduced-motion`** — kill animations and smooth scrolling.
- **Keyboard reachable**, visible focus, real `aria-label`s on icon-only
  controls, one `<h1>` per page and a sensible heading order.
- **System font stack** (`Inter`, `system-ui`, `-apple-system`, `Segoe UI`).
  No webfont downloads.
- `loading="lazy"` on below-the-fold images.
- Every `target="_blank"` needs `rel="noopener noreferrer"`.

### Design refinements (2026-09)

Applied to the four hub pages and `cards/card.css`; keep them when editing:

- **`cards/card.css`** carries the shared responsive hardening: `.field` and
  every direct child of an inline `grid-template-columns` container gets
  `min-width:0; max-width:100%`, and form controls get `min-width:0`. This
  stops card fragments (e.g. BMI's `1fr 1fr` height/weight fields) from
  blowing the layout past a 390px viewport, on `tool.html` or anywhere else
  the fragments are embedded. Do not remove these rules when restyling cards.
- **Visible keyboard focus**: `:focus-visible` outline (2px, accent colour,
  2-3px offset) on all four hub pages. Additive — never replace a custom
  focus treatment, never remove the outline.
- **Anchor offset**: `scroll-margin-top` (≈72px) on `section`/`main` targets
  in `listen.html` and `donate.html` so sticky navs never cover anchored
  sections.
- **Theme chrome**: `color-scheme: dark`, accent-tinted `::selection`, and a
  thin accent scrollbar are part of the system on `index.html`, `tool.html`,
  `listen.html`, `donate.html` and `404.html`.
- **Tap targets**: sticky-bar action buttons, dock/category pills,
  `listen.html` nav links, `.mp-sub`, `tool.html` `.nav-brand` and
  `donate.html` topbar links are all ≥40px. Keep new interactive chrome at or
  above 40px (card widgets additionally get a 44px boost on touch devices via
  `setupMobileOptimizations`).
- **`tool.html`**: `.tool-card-box` and its injected container are
  `min-width:0; max-width:100%` — the second half of the card-overflow fix.
- **Hero**: `.futuristic-badge` text is `rgba(230,250,255,.85)` on a
  `rgba(0,243,255,.08)` tint; `.main-search-bar` is 52px tall with a
  full-height search button; `.futuristic-subtitle` uses `text-wrap:pretty`.
- **Decorative extras live in classes, not inline styles**: empty-search
  state (`.no-results`) and the footer music spotlight (`.music-spotlight`)
  are class-based so the design tokens stay in one place.

---

## 6. SEO and metadata

Every public page should carry: unique `<title>` and meta description,
`rel="canonical"`, Open Graph (`og:title`, `og:description`, `og:image`,
`og:url`, `og:type`), `twitter:card` = `summary_large_image`, and `theme-color`.
Music pages additionally carry `MusicGroup` JSON-LD.

**Always use `https://` and the `www.` host** in canonical and OG URLs. Mixed
`http://` references caused broken share previews here before.

The 12 language pages form an **hreflang cluster**: each one lists all twelve
siblings plus `en` and `x-default` pointing at `listen.html`. If you add a
language, you must add it to the cluster **in all thirteen pages**, or Google
treats them as duplicates competing with each other.

### Regenerating the sitemap

`sitemap.xml` lists all 706 pages. Build it from git rather than the working
tree, so a sparse checkout does not silently drop the 666 cards:

```python
import subprocess, datetime
base  = "https://www.themostusefulsiteintheworld.com"
today = datetime.date.today().isoformat()
files = subprocess.run(['git','ls-files'], capture_output=True, text=True).stdout.split()
html  = [f for f in files if f.endswith('.html')]
prio  = {"listen.html":("1.0","weekly"), "music.html":("0.9","weekly"),
         "index.html":("0.9","daily"),   "youtubepromo2.html":("0.7","monthly")}
urls  = [(p,*prio[p]) for p in prio if p in html]
urls += [(f, "0.4" if f.startswith("cards/") else "0.5", "monthly")
         for f in sorted(html) if f not in prio]
body = "\n".join(
    f'  <url><loc>{base}/{u.replace(" ","%20")}</loc><lastmod>{today}</lastmod>'
    f'<changefreq>{c}</changefreq><priority>{p}</priority></url>'
    for u, p, c in urls)
open('sitemap.xml','w').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + body + '\n</urlset>\n')
```

Note the `%20` escaping: some filenames in `images/` contain spaces.

---

## 7. Traps and gotchas

Each of these has already cost someone real time.

**`sw.js` is not registered.** No page calls
`navigator.serviceWorker.register()`. The file is kept correct so that enabling
it is a one-line change, but right now it does nothing. Before enabling it,
understand: it uses **network-first for HTML** deliberately. Cache-first on
HTML is what makes a static site serve stale pages for days after a deploy. It
also adds precache entries individually rather than via `cache.addAll()`,
because `addAll()` is atomic — a single 404 aborts the whole install and the
worker never activates. The previous version had four 404s in its precache list
and could never have installed. Bump `CACHE_NAME` on any change.

**`generate-cards-json.js` overwrites categories.** See §3.

**`index.html` has no links to cards.** Everything is driven by `cards.json`.

**ID collisions across cards.** All 666 share one DOM. See §3.

**Sparse checkout gives false "broken image" results.** `images/` is ~50 MB and
usually excluded. Local tooling will report those images as 404. Always confirm
against the live site with `curl` before "fixing" a missing image — several
files reported broken locally are present and serving 200 in production.

**Filenames contain spaces and en-dashes.** e.g. `images/SOSMrWolfs 21.jpg`,
`images/carling academy, bristol.jpg`. Quote paths; URL-encode in HTML and XML.

**`guide.txt` is stale.** 69 KB of historical notes. This document supersedes it.

**`hokidea.html`** is a 145-byte scratch file with no `<title>` and no `lang`.
Harmless, not linked, left deliberately.

---

## 8. Working on this repo

### Clone (the repo is large — always go sparse)

A full clone pulls ~125 MB, mostly `images/`.

```bash
chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519   # if using SSH

git clone --depth 1 --filter=blob:none --sparse \
    git@github.com:mrpr0phecy/mrpr0phecy.git r
cd r

# Music work (skip images and the 666 cards):
git sparse-checkout set --no-cone '/*' '!/images/' '!/cards/'

# Tool work (skip images only):
git sparse-checkout set --no-cone '/*' '!/images/'

git config user.name  mrpr0phecy
git config user.email mrpr0phecy@users.noreply.github.com
```

Cone mode does not work here: `git sparse-checkout set cards index.html` fails
with *"'index.html' is not a directory"*. Use `--no-cone` with leading-slash
patterns.

### Test locally

```bash
python3 -m http.server 8891     # then open http://127.0.0.1:8891/listen.html
```

Serve over HTTP rather than opening files directly — `file://` breaks `fetch()`
of `cards.json` and gives misleading CORS errors.

Worthwhile automated checks before pushing — **the easy way is
`bash scripts/verify.sh`**, which runs the catalogue audit, placeholder, link,
sitemap, SEO and secret scans below (safe on sparse checkouts; `--live` adds
production curls). The individual manual checks:

```bash
# JS syntax inside a page (extract each <script> and run node --check)
node --check extracted.js

# Placeholders that must never ship
grep -rlE 'dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|YOUR_' --include=*.html .

# target=_blank missing rel=noopener
grep -oE '<a [^>]*target="_blank"[^>]*>' page.html | grep -v noopener

# Validate the sitemap parses
python3 -c "import xml.etree.ElementTree as E;print(len(list(E.parse('sitemap.xml').getroot())))"
```

Headless browser checks (Playwright) are worth it for anything interactive:
assert zero `pageerror`s, zero images with `naturalWidth === 0`, and that
expected elements exist.

### Verify after pushing

Pages takes 30–60s. Do not trust a green push:

```bash
sleep 50
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

---

## 9. Current state and known work

**Added 2026-09-02** — a **Sports** category with 53 tools across four batches of
ten. New tools cover cricket (chase + net run rate), football points-needed,
tournament brackets, golf (WHS handicap + Stableford), darts (checkout + 501
average), cycling power/speed, swimming pace/CSS, tennis scorer, basketball
efficiency, youth team rotation, snooker snookers-required, rugby score builder,
running cadence, baseball stats, betting each-way, athletics decathlon/
heptathlon, motorsport (lap time + F1 points), bowling, badminton, volleyball,
ice hockey goalie, powerlifting DOTS/Wilks, table tennis, archery, round-robin
fixtures, rowing erg pace, chess Elo, diving, bouldering, gymnastics, triathlon,
netball, handball, curling, showjumping and weightlifting Sinclair. Thirteen
existing tools were reclassified into Sports (the ten boxing cards,
`premier-league`, `bike-gear-calculator` and `race-pace-predictor`).
`sportsList` in `generate-cards-json.js`; `Sports` in `check-cards.py`; tool
count is now **602** (updated across README, ARCHITECTURE, INCOME, AGENTS,
AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-02** — ten new **Home & DIY** tools: stud framing, board-foot
lumber, stair stringer, roof pitch & rafter, drywall, room BTU/HVAC sizing, miter
& bevel angles, laminate flooring, deck joist span and grout & tile adhesive.
Added to `homeDIYList` in `generate-cards-json.js`; tool count is now **612**
(updated across README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS, index.html,
404.html, tool.html).

**Added 2026-09-02** — a new **Mind-Blowing Demos** category with 10 interactive
demonstrations: Monte Carlo π estimation, Conway's Game of Life, Mandelbrot set
explorer, logistic-map bifurcation, Fourier series synthesis, Galton board
(central limit theorem), Buffon's needle, Lorenz attractor, Barnsley fern and
Euler's identity. Added to `demosList` in `generate-cards-json.js`; tool count is
now **622** (updated across README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS,
index.html, 404.html, tool.html).

**Added 2026-09-02** — a new **Algorithms & Computer Science** category with 10
interactive tools: sorting algorithm visualizer, pathfinding visualizer (BFS/DFS/
Dijkstra/A*), Towers of Hanoi, a neural-network playground that learns XOR, a
Big-O complexity explorer, elementary cellular automata (rules 30/90/110/184),
Huffman coding, a classical cipher suite, recursion & memoization explorer and a
binary/bitwise playground. Added to `csList` in `generate-cards-json.js`; tool
count is now **632** (updated across README, ARCHITECTURE, INCOME, AGENTS,
AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-03** — two more tools: a **laundry care & stain solver**
(fabric-based wash settings, a 12-stain step-by-step treatment guide and a
care-label symbol decoder) and the **Go Outsideometer** (a tongue-in-cheek
cabin-fever gauge with a go-outside prescription). Both join Productivity &
Lifestyle; tool count is now **634** (updated across README, ARCHITECTURE,
INCOME, AGENTS, AGENT_ACCESS, index.html, 404.html, tool.html).

**Added 2026-09-03** — ten more quirky-but-useful tools, all in Productivity &
Lifestyle: a **Memento Mori life ticker** (your life as a grid of weeks plus
“how many more summers/books/roasts” conversions), a **cost-per-use “should I
buy it”** decider, a **price-in-work-hours** converter (“that coffee = 22 minutes
of your life”), a **Thing Namer** (band/pet/D&D/startup/WiFi/boat/pub-quiz names),
a **houseplant matchmaker**, a **flat-pack confidence meter**, a **3am worry
sorter**, an **emoji-meaning decoder**, a **caffeine half-life bedtime check** and
a **coat-or-no-coat weather** advisor. Tool count is now **666** (updated across
README, ARCHITECTURE, INCOME, AGENTS, AGENT_ACCESS, index.html, 404.html,
tool.html).

**Recently fixed** (2026-08-30): every YouTube embed on the site was a
placeholder — including a Rickroll (`dQw4w9WgXcQ`) sitting in the Marathi page —
now replaced with the real catalogue; a 404'd `og:image`; a mangled duplicated
stylesheet URL and several newline-corrupted JS string literals in
`sonicfansite.html` that broke all scripting on that page; 50 unprotected
`target="_blank"` links; missing canonicals and hreflang across 12 language
pages; insecure `http://` OG URLs; a service worker that could never install;
and a PWA manifest pointing at a 1024px JPEG for its 192px and 512px icons.
`robots.txt` and `sitemap.xml` did not exist at all before this.

Also this date: added **[AGENT_ACCESS.md](AGENT_ACCESS.md)** (agent
authentication & bootstrap), **AGENTS.md** (agent operating manual),
`scripts/agent-auth.sh`, `scripts/verify.sh` (+ catalogue/SEO scanners) and a
check-only `.github/workflows/agent-guardrails.yml`; refreshed the stale tool
counts to the real **500** (README, ARCHITECTURE, INCOME).

Found by the new `scripts/verify.sh` and fixed: `index.html` had **no**
canonical/OG/Twitter/theme-color meta at all — added; `youtubepromo2.html`
canonical + `og:url` pointed at `youtubepromo3.html` on the non-www host —
corrected; four `target="_blank"` links missing `rel=noopener` (bpm-counter,
chord-finder, christmas-card-maker, probability) — hardened.

**Open Source News rebuild (2026-08-30, owner-requested)** — `opensourcenews.html`
now carries: a **live headlines rail** (click any story to play it, category
chips, per-story sources + corroboration count + age, "N stories · M sources"
status); **viewer transport controls** (PAUSE/RESUME — Space, SKIP — N, Esc
pauses, all in the top chrome); **live captions** (source + headline bar,
toggle CC, persisted across reloads); **"READ ORIGINAL" links** to every story's
source article (links are now captured from all three feed parse paths);
**category-agnostic main desk** (previously the desk only narrated `world`, so
science/tech/finance/weather stories never aired); **mute-friendly pacing**
(cards hold for the full story duration instead of cycling every 800 ms);
a visually-hidden `<h1>` (the page had none); and `prefers-reduced-motion`
support, a mobile rail toggle, a `fetchTimeout` fallback for browsers without
`AbortSignal.timeout`, and a `rail-hidden` auto-dodge during sports/weather/
finance segments. Validated in headless Chromium against the real RSS feeds:
124 stories / 35 sources, zero console or page errors.

**Fixed 2026-08-31 (commits `ce0c880`, `bb32e34`)**

- **hreflang cluster repaired.** `listen.html`, `chinese.html`,
  `japanese.html` and `portuguese.html` declared **zero** alternates while the
  other nine pages pointed at them. Google requires reciprocity, so the whole
  cluster was unreliable. All 13 pages now declare an identical set of 14
  (12 languages + `en` + `x-default`); verified byte-identical across pages.
- **`theme-color`** added to the 12 language pages + `youtubepromo2.html`
  (13 pages had none). Every top-level page now has one.
- **Full SEO blocks** (description, canonical, OG set, Twitter card,
  `theme-color`, JSON-LD) added to 11 pages that were near-bare:
  `aiwalker`, `animation`, `beachsimulator`, `birdapp`, `citysimulator`,
  `clock`, `eternalbeffudlementmachine`, `fightsimulator`, `mpnews`,
  `slideshowtest`, `tool`. `mpnews.html` also got its missing `<h1>`, closing
  the open question below.
- **Visually-hidden `<h1>`** added to the 6 pages that had none.
- **Structured data**: `index.html` gained `WebSite` + `CollectionPage`/`ItemList`
  JSON-LD (20 categories, 500 tools); `thisorthat.html` gained `WebApplication`.
  27 JSON-LD blocks site-wide, all validated as parseable JSON.
- **og:image normalised to 1200×630.** `logo.png` (1054 KB, 1024×1024) and
  `icon-512.png` (219 KB, 512×512) were being used as social cards — wrong
  aspect ratio, so every platform letterboxed them. Replaced with new
  `og-tools.png` / `og-mp.png` (37 KB, 1200×630) on 14 pages. `logo.png` is
  now referenced by nothing and can be deleted.
- **`404.html` added** — the site previously served GitHub's generic page.
  Branded, self-contained (no external requests), `noindex,follow`, links both
  products, respects `prefers-reduced-motion`.
- **Accessibility/perf**: 4 `<img>` tags had no `alt` (now 0 missing across
  151); `loading="lazy"` added to the 12 language-page hero images.
- **sitemap.xml** regenerated: 542 → 540 entries. `hokidea.html`,
  `indexbeta.html` and `404.html` are `noindex` and were removed from it.
- SEO scan warnings: **134 → 20**. The remainder are on two `noindex` pages
  (where the tags are pointless) and `token.html` (left alone deliberately).

**Fixed 2026-08-31, second pass (commits `f9c252c`, `ea5a028`)**

- **Seven cards were completely dead in production.** Each had a JavaScript
  syntax error that killed its entire `<script>` block, so the tool rendered but
  did nothing at all:
  `qrtool`, `social-preview`, `christmas-card-maker`, `ohms-law`, `onerepmax`,
  `oscilloscope` (all the same bug — a botched removal of "AFFILIATE FUNCTIONS"
  left `function xxTrackAffiliate(){});` plus a dangling brace), and
  `proofreading` (`severityColor = var('--accent')` — CSS syntax in JS).
  `math-universe-explorer` also had an unquoted `∞` object key, which is not a
  valid JS identifier. **`node --check` now runs clean across all 473 script
  blocks in all 510 cards.**
- **The catalogue was not 500 distinct tools.** Five pairs of card files were
  byte-identical, and three of them were the wrong tool in the wrong category:

  | File | Listed as | Actually contained |
  |---|---|---|
  | `music-theory` | Music & Audio | 🚚 Ultimate Moving Planner |
  | `lease` | Finance & Money | Lean Body Mass Calculator |
  | `qr` | Productivity & Lifestyle | 📝 Punctuation Mastery Guide |
  | `salarycompare` | Finance & Money | duplicate of `salary` |
  | `essay` | Writing & Language | duplicate of `essay-templates` |

  `sequences-series` was a copy of the Science Quiz Generator sitting in
  Mathematics (zero maths content), and `logarithms` was a *third* sequences
  calculator — so the catalogue advertised a logarithms tool it did not have.
  All seven files were rewritten as genuine new tools: Circle of Fifths
  Explorer, Lease vs Buy, Barcode Check Digit Validator, Take-Home Pay
  Breakdown, Argument Mapper, Sequences & Series, and Logarithm Calculator.
  Four more same-title collisions (`vocab`, `interest`, `unit-converter`,
  `unitconverter`) got distinct titles. **All 500 titles are now unique.**
- **Duplicate element IDs: 244 → 5.** 279 colliding ids renamed across 38 cards
  (prefix + original token, so `cc-voltage` in `cable-length` became
  `cablelcc-voltage`). Since all cards share one DOM these were live bugs —
  `getElementById` could bind to the wrong tool. The 5 remaining warnings are
  template-literal ids (`${item.id}`) that are unique at runtime, not
  collisions.
- **`generate-cards-json.js` was losing data on every run.** `cards.json` had
  been hand-curated, and regenerating silently reverted emoji titles, curated
  descriptions and the whole "Museum & Collection" category — which the script
  did not know about even though `check-cards.py` did. Added a `museumList`,
  hoisted its check above `mathList`/`scienceList` (the substring matcher let
  `'statistics'` and `'energy'` steal two cards), and moved the curated titles
  and descriptions into the cards' own `<h2>`/`<p>` so regeneration is now
  idempotent. `3d-spirograph-nebula` belongs to `interactiveArtList`, not the
  museum.
- **Favicon.** Only 3 of 43 pages declared an icon and `/favicon.ico` 404'd, so
  every page load made a failing request. Generated a real multi-resolution
  `favicon.ico` (16/32/48) and added the existing inline SVG data URI icon to
  all 43 pages — zero extra requests.
- **Dead affiliate link** in `probability.html` pointing at `/affiliates`,
  which 404s, and which INCOME.md's growth policy excludes anyway. Removed.
- **24 meta descriptions were 165–477 chars** (Google truncates around 160).
  All trimmed at sentence boundaries; none are now out of range.
- **Broken reference** in `mrprophecy-name-that-track.html`: `href="listen.html"`
  resolved to `/cards/listen.html` (404). Now `../listen.html`.
- `vocab.html` had **no heading element at all**, so its catalogue title was a
  filename-derived fallback. Added a proper `<h2>`.

**Verification method used** (worth keeping): `jsdom` installed to `/tmp`, never
the workspace, driving each card in a minimal shell. That is what caught the
Lease vs Buy verdict being sign-inverted — totals said buying was £4,595
cheaper while the headline said "Leasing is cheaper". All 7 new tools now pass
15 interaction assertions (valid/invalid EAN-13, log₂(1024)=10, arithmetic and
geometric sums, convergence detection, both lease verdict branches).

**Open — needs a decision or a dedicated pass**

- **17 `<label for=...>` associations point at no element** (they label button
  groups, e.g. `sub-status`, `tdee-gender`). Screen readers cannot associate
  them. Low severity; fix is converting the button groups to radio inputs or
  adding `aria-labelledby`. Since all 666 cards share one DOM, `getElementById` can bind to the
  wrong tool. Worst offenders are whole-file collisions:
  `leanbodymass.html`↔`lease.html` (26 ids), `moving.html`↔`music-theory.html`
  (~40), `essay-templates.html`↔`essay.html`, `salary.html`↔`salarycompare.html`,
  `punctuation-guide.html`↔`qr.html`, `science-quiz.html`↔`sequences-series.html`.
  Looks like cards were copied and their id prefixes never renamed. Mechanical
  to fix (rename prefix + every JS reference) but it touches working tools, so
  it deserves its own commit and a headless-browser check.
- **`indexbeta.html`** — a second homepage-like app ("My Toolbox" UI, no
  `cards.json` fetch), linked from nowhere, competing with `index.html` for the
  same query. Now `noindex,follow` + canonical → `/`, and out of the sitemap.
  Decide whether it ships publicly or goes.
- **`hokidea.html`** — 145-byte stub that hot-linked `https://webneko.net/n20171213.js`
  (third-party JS on your domain, no SRI, no CSP). Wrapped in valid HTML with a
  `<title>` and `noindex`, and removed from the sitemap, but the third-party
  script is still there. Delete the file, or vendor the script locally.
- **Four CV files, none linked from any page**: `CV.docx` (12.8 KB),
  `CV.pdf` (83.8 KB), `cv.pdf` (2393.8 KB), `latestcv.docx` (39.6 KB). On
  Linux `CV.pdf` and `cv.pdf` are distinct files, which is a footgun. ~2.4 MB of
  dead weight; confirm before removing.
- **`viewport-fit=cover` on 1/42 pages, `color-scheme` on 0/42.** Worth adding
  to the full-bleed dark pages for notched phones and native dark scrollbars,
  but it changes layout, so it wants visual testing rather than a blind sweep.
- **`sw.js` is still unregistered** — see the open question below. For a site of
  666 offline-first tools it is a large caching win (network-first for HTML,
  cache-first for cards), but it must be rolled out carefully.
- **8 pages use `i.ytimg.com/vi/<id>/maxresdefault.jpg` as their og:image**
  (both ids verified live today). Fine while the videos exist; if one is ever
  deleted the share card silently breaks.

**Deliberately left alone**

- (Nothing here now forbids touching `opensourcenews.html`: on 2026-08-30 the
  owner asked for it to be upgraded. See the build notes below.)

**Open questions for the owner**

- `mpnews.html` has no `<h1>`, canonical or structured data, and is not in the
  nav cluster. It needs the same treatment the other music pages have had.
- The 12 language pages are thin and machine-translated. Thin translated pages
  can attract a manual action from Google. Either enrich them with genuinely
  localised content or consider consolidating.
- `sw.js` is correct but unregistered — enable it or delete it.
- Legacy directories `substitutions/`, `system/`, `digitaldetoxcardshtml/` and
  the duplicate CV files look like dead weight. Confirm before removing.
