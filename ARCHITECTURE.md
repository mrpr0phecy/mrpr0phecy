# ARCHITECTURE.md — how this repository works

Day-to-day rules and validation are in **[AGENTS.md](AGENTS.md)**. This file is
the map you consult for a specific job: layout, the catalogue's architecture,
the verified music data, both design systems, SEO, the traps that have already
cost people time, and the protected list. For GitHub access in a fresh session
run `bash scripts/agent-auth.sh`. Money: `INCOME.md`.

## 1. What this repository actually is

One GitHub Pages site serving **two unrelated products** from one domain:

| | Product | Entry point |
|---|---|---|
| **A** | **The Most Useful Site In The World** — 1338 self-contained browser tools | `index.html` |
| **B** | **MrProphecy** — the owner's music project | `listen.html` |

**They are kept separate deliberately** (owner instruction): no music players,
artist banners or cross-promotional footers on the catalogue or any card; no
tool links on the music pages. If a task says "improve the site", establish
*which* site first.

- **Live:** <https://www.themostusefulsiteintheworld.com> · **Hosting:** GitHub
  Pages from `main` — no build step, no bundler, no framework. `.nojekyll` keeps
  that true: without it Pages runs Jekyll and silently drops every path starting
  with `.` or `_` (which is how `.well-known/ai.txt` once 404'd in production).
  Every tracked file is served at its own path.
- **Custom domain:** the `CNAME` file; deleting it breaks the domain.
- **Deploy:** ~30–60 s after a push. Verify live with `curl`; never assume.

## 2. Repository map

```text
index.html              Product A: tool catalogue (search/filter UI)
home-core.js            Home-page chrome: theme, panels, search bridge, deep links, sw registration
explore.js / explore.css  the list engine + its styles (rows, toolbar, empty state, sponsor slot)
toolbox.js              the visitor's saved list (slugs) and the ＋ buttons
cards/
  cards-lite.json       generated critical-path tier: {n,t,c}
  cards.json            generated full index of all 1338 tools (descriptions feed search)
  <tool>.html           1312 fragments — NOT full documents
generate-cards-json.js  rebuilds cards.json + cards-lite.json from cards/
ai.html                 Lantern: standalone on-device AI (own name, mark, palette; no
                        catalogue data). Duty of care surfaces verified UK emergency help
                        when the visitor's own words describe danger; /duty off disables.
agents.html             machine-use guide for AI agents (the former /ai.html)

listen.html             Product B: music hub — the main entry point
radio.html              continuous player, all 47 tracks back to back
thisorthat.html         head-to-head voting game (shareable top 5)
youtubepromo{,1,2,3}.html  videos & visuals / stream free / long-form guide / Sons of South
luton.html              local SEO + FAQ schema      music.html   press kit, bio, booking
support.html            direct support (music)       donate.html  Wikipedia-style appeal (tools)
sponsor.html            sponsorship enquiries       mpnews.html  music news
embed.html              embed catalogue + licensing funnel + MUS1 activation (§6b)
embed-finance.html      GENERATED licence landing page — build-embed-landing.py, never hand-edit
licence-admin.html      owner console for signing MUS1 keys; noindex, no analytics
opensourcenews.html     live world-news broadcast from open RSS feeds

<12 language pages>     hindi marathi bengali punjabi chinese dutch french japanese
                        portuguese russian spanish thai — translated music landings
experiments (ask before deleting): sonicfansite, beachsimulator, citysimulator,
  fightsimulator, aiwalker, animation, birdapp, clock, eternalbeffudlementmachine,
  slideshowtest, token, tool, supaviewer, byte-realistic{,-v4}, local-ai
                        local-ai/byte-realistic* are noindex redirect stubs to ai.html;
                        supaviewer.html is a standalone virtual-world viewer (supaviewer/)
manifest.json           PWA manifest            robots.txt  allow all + sitemap
sw.js                   service worker — registered by home-core.js (§7)
sitemap.xml             generated (§6); noindex redirect stubs excluded
brand/                  mark.py (geometry/palette/SVG), gen_assets.py, check-mark.py,
                        spec.py, measure.py — see brand/README.md
favicon.svg/.ico, icon-192/512, icon-maskable-512, apple-touch-icon.png   the mark
logo-mark.svg (linked everywhere), logo-mark-mono-{dark,light}.svg,
logo-lockup-{dark,light}.svg (wordmark as outlines), logo.png (press only)
mrprophecypic.jpg (+-600), backgroundpic.jpg/.webp, og-brand/tools/ai/mp.png,
  luton-og.png, sonic-og.png                      social + hero images
images/                 ~50 MB of photos — excluded from sparse checkouts
README.md, CV.docx/CV.pdf/cv.pdf/latestcv.docx    public readme; owner's CVs
```

## 3. Product A — the tool catalogue

### How it works

**The home page lists tools; it does not run them. Every tool runs on
`tool.html`, one at a time.** Until 2026-09-21 the home page mounted the
catalogue in place (1,205 fragments injected and executed) and that whole class
of failure was removed: a page running every tool breaks differently for every
tool (half-drawn cards, clicks landing before listeners exist, phones out of
memory), and each way lost a visitor. What is left is a page that links:

- first paint waits for nothing but its own chrome;
- `tool.html` fails the same way for all 1,338 tools, and
  `scripts/check-tool-graph.py` proves every link into it lands on a real tool;
- filtering, sorting, keyboard nav, density and the toolbox are properties of a
  *list*, and were impossible while the catalogue's first job was executing;
- a tool is still reachable from `tools.html`, `tools-index.html`, its category
  page, `sitemap.xml`, `embed.html`, `sitemap.html` and `api/tools.json` — the
  surfaces `check-tool-graph.py` enumerates as `FULL_SURFACES`. The home page
  was never one of them, so dropping its grid orphaned nothing.

The tiers (`cards/cards-lite.json`, `cards/cards.json`) still matter:
`tool.html`'s shell and the toolbox's titles read the lite tier; generators read
the full tier.

### The list layer

| file | job |
|---|---|
| `explore.css` | row, toolbar, empty state, toolbox panel, sponsor slot — loaded by `index.html`, `tools.html`, `tools-index.html` and all category pages |
| `explore.js` | filters, sorts, keyboard, URL state, "show more" (`PAGE_SIZE = 60`) |
| `toolbox.js` | the saved list — add, remove, reorder, share, export/import — and the ＋ buttons |
| `home-core.js` | home-page chrome: theme, panels, the search bridge, deep links, service worker |

Two mount shapes:

- **`data-explore="json"` (home page).** Rows are **built** from
  `tools-index.json` when the visitor reaches the list — nothing fetched at
  parse time, 60 rows in the DOM at a time, "Show 60 more" extends. Three
  measured decisions (2026-09-24 A/B, 1.6 Mbps / 150 ms RTT / 4× CPU):
  - the fetch starts **on idle-with-a-bound, or `load`, whichever is first** —
    but never before first paint (waiting for true idle put the request at
    3.2 s against `load` at 2.1 s; the backstop moved the first row 4.6 s → 3.5 s);
  - rows carry **`content-visibility: auto` with a 96 px placeholder** — the
    measured median row height; laying out all 60 rows was 253 ms of one 920 ms
    frame, and skipping off-screen rows took layout 297 → 65 ms;
  - the **toolbox lite tier is fetched on intent** (pointer/focus/panel open/
    add), not at `DOMContentLoaded` — 123 KB of JSON for a closed panel.
- **`data-explore="static"`** (tools.html, tools-index.html, category pages).
  Rows are already in the served HTML; the engine decorates them in place and
  filters by hiding. The reveal is **per group**: each category shows its first
  60 and "Show 60 more" extends every one (a global "first 60" would empty most
  of the 29 categories).

Rules that keep it honest, each pinned by a test:

- **A list is a list with JavaScript off.** Rows are real `<a>` elements written
  at build time. `tools-index.html` (the page `llms.txt` links, read by
  crawlers) keeps its zero-JS promise — the layer only *adds* filter, sort and ＋.
- **No dead controls** — every ＋, ▸ and ↗ is added by JS at load, so a
  scripts-off page never shows a button that cannot work.
- **`?card=<slug>` keeps working**: `home-core.js` forwards old home-page card
  links to `tool.html?card=<slug>` with `location.replace`, so shared links live on.

### What was removed, and must not come back

Deleted with the grid: `home-app.js` (197 KB), `home-features.js` (43 KB),
`discovery-app.js` (18 KB). `scripts/tests/no-live-tools.test.js` is the
tripwire: it fails if `index.html` fetches the catalogue or a card fragment, if a
mounting surface (`#dashboard`, `#standaloneModal`, `#directoryView`, a card
grid) reappears, or if any of the three files returns.

The park pass, warm-ahead trickle, per-frame load budget and the four density
machines all existed because a *running* tool is expensive. With nothing
running, density is a two-state list choice — **comfortable** (shows the
description) or **compact** (hides it until toggled), remembered in
`localStorage['density']`. If the park, warm-ahead or the trickle name comes
back, so has the architecture this section documents the removal of.

### The toolbox — a saved list

It stores **slugs**, nothing else:

- `localStorage['mp.toolbox.v1']` — an ordered slug array. Not an `__mp_` key;
  those are reserved for instrumentation (`docs/INSTRUMENTATION.md`).
- Works on every list page: `toolbox.js` finds the panel if one is shipped
  (`index.html` popover) and builds a floating one elsewhere.
- **A toolbox is a URL**: `?toolbox=<base64url slugs>`. The receiver is
  *offered* it and nothing is written until they click.
- **Nothing leaves the device** — no account, no sync, no upload. Export exists
  because clearing browser data clears the toolbox; say so rather than syncing it.

### Generated first screen — do not hand-edit

`HOME-FEATURED` (12 rows), `HOME-TRENDING` (8) and `HOME-CATEGORIES` (29 links)
are written by `scripts/build-home-prerender.py`: plain links in the served
HTML, so they paint with the page and work without scripts. The generator
refuses to write from a `tools-index.json` that disagrees with
`cards/cards.json`. `python3 scripts/build-home-prerender.py --check` shows
drift. Everything below the fold is `[data-explore="json"]`, an empty container.

### The home page's four files and its head

| file | size | when |
|---|---|---|
| `home.css` | about 49 KB | first paint — render-blocking on purpose |
| `home-deferred.css` | about 7.5 KB | containers hidden at first paint; applied after it (13 KB gzip for the pair) |
| `explore.css` | about 27 KB | the list layer, shared with four other page types |
| `explore.js` | about 62 KB | list engine: fetch, filter, sort, reveal, keyboard, URL state |
| `toolbox.js` | about 33 KB | saved list, ＋ buttons, panel; lite-tier fetch on intent |
| `home-core.js` | about 37 KB | theme, panels, search bridge, deep links, service worker |

`window.mpExplore` / `window.mpToolbox` are the public seams: `home-core.js`
calls `mpExplore.filter()` for the hero search; `mpExplore` calls
`mpToolbox.toggle()` on ＋. Neither reaches into the other's DOM.

`index.html`'s head is a budget (once 132,210 bytes, 71% of the document; now
~13 KB). **Bytes in the document cost every visitor on every navigation, so
rationale lives in this file, not in HTML comments** (comments alone once cost
2,664 bytes gzip, 19% of what the page sent). Hence: the list fetches
`tools-index.json` (one format, one source — titles, descriptions, categories,
tags, popularity); `home-core.js` is external and deferred (parses in parallel,
caches separately); gtag loads at idle with a `dataLayer` shim so nothing queues
in the wrong order and no event is lost; Inter is self-hosted and preloaded with
`unicode-range` and `font-display: swap` (the old head → Google CSS → woff2
chain cost ~700 ms of font swap on slow 4G); and the speculation rules
**prefetch but never prerender** (a prerender wedged behind the service worker
once hung the tab instead of opening the tool).

CSS split, enforced by `scripts/check-critical-css.py`:

1. rules that **hide** containers (`.panel`, `.toolbox`, `#directoryView`,
   modal `pointer-events`) stay in `home.css` — a late stylesheet must never
   decide visibility;
2. every selector in the deferred file must target a container hidden at first
   paint;
3. `home.css` carries the tokens the deferred file uses.

Every asset loads with `?v=N` where `N` = `CACHE_VERSION` in `sw.js` — a page
from one deploy must never run another deploy's CSS/JS. The number is read out
of `sw.js` by the generators; hard-coding it is how `tools.html` once shipped
`explore.css?v=1` against a `?v=16` homepage.

### Anatomy of a card

A card is an **HTML fragment** — no `<!doctype>`, `<html>`, `<head>` or `<body>`:

```html
<!-- cards/my-tool.html -->
<h2 id="mytl-title" style="margin-top:0;color:var(--accent);">🔧 My Tool</h2>
<p id="mytl-desc" class="small" style="color:var(--text-secondary);font-size:0.85rem;">
  One or two sentences on what the tool does.</p>
<form aria-describedby="mytl-desc" onsubmit="event.preventDefault();">
  <!-- controls -->
</form>
<script>(function(){ /* all logic here */ })();</script>
```

1. **Fragment only.** A nested full document breaks the shell's layout.
2. **IDs must be globally unique across all 1338 cards** (one shared DOM). Use a
   short per-tool prefix (`b3js-`, `cwf-`, `mytl-`) on every element — a
   collision silently makes another tool misbehave.
3. **Inline styles** plus the CSS variables in §5; there is no per-card stylesheet.
4. **Wrap all JS in an IIFE** — no global `let`/`const`/`function`.
5. **Self-contained**: no external JS/CSS, no network calls.
6. `onsubmit="event.preventDefault();"` on any form, or the page reloads.

### Adding a tool — the sequence

```bash
vim cards/my-tool.html                     # 1. the fragment
# 2. Add the slug to the right list in generate-cards-json.js FIRST, then:
node generate-cards-json.js
npm run build                              # 3. every generator, in dependency order
bash scripts/verify.sh                     # 4. gate (add --deep for shared changes)
```

The count is the number of `.html` files in `cards/`
(`python3 scripts/sync-counts.py count`); never hand-edit a published number —
`verify.sh` re-derives drift in place. Order matters: `build-home-prerender.py`
reads `tools-index.json` for the category hub links it writes into `index.html`.

> **Warning — `generate-cards-json.js` overwrites categories.** It assigns
> `category` from hardcoded filename lists near the top of the file; anything
> not in a list gets a default, so a hand-set category is silently lost on the
> next run. Add the filename to the right list.

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

`title` and `description` are scraped from `#<prefix>-title` and
`#<prefix>-desc`; a card missing them shows up blank in the catalogue.

### Categories (1338 tools)

Derived from `cards/cards.json` — regenerate rather than hand-edit.

| Count | Category | | Count | Category |
|---|---|---|---|---|
| 204 | Science & Engineering | | 29 | MrProphecy Arcade |
| 175 | Productivity & Lifestyle | | 29 | Museum & Collection |
| 98 | Finance & Money | | 21 | AI & Autonomous Agents |
| 84 | Mathematics | | 21 | Virtual Worlds & Gaming |
| 73 | Algorithms & Computer Science | | 17 | Mind-Blowing Demos |
| 73 | SaaS & Business Killers | | 13 | Lucid Dreaming & Sleep |
| 73 | Writing & Language | | 13 | Survival & Emergency Readiness |
| 56 | Sports | | 10 | Anime & Otaku Culture |
| 51 | Interactive Art & Living Worlds | | 10 | Aquatics & Fishkeeping |
| 48 | Health & Fitness | | 10 | Birdwatching & Ornithology |
| 48 | Home & DIY | | 10 | Dogs & Canine Care |
| 40 | Music & Audio | | 10 | Fire & Rescue Service |
| 36 | Astronomy & Space | | 10 | Natural Remedies & Herbs |
| 33 | Culinary & Food Science | | 10 | Trucking & Freight |
| 33 | Wellbeing & Community | | | |

Total: 1338 tools in 29 categories.

## 4. Product B — MrProphecy music

### Verified facts

Confirmed against YouTube's oEmbed API. **Use these; never invent IDs.**

| Item | Value |
|---|---|
| YouTube channel | `@MrProphecy` (capitals are canonical) |
| Flagship video | `qL6X6n6FLuo` — "MrProphecy – Injection" |
| Animated Soundscapes | `PLasqsDl8vf8dX09ZHd9G33ihpdUV2h2G8` — 47 videos |
| In 2025: The Movie | `PLasqsDl8vf8eEUJVB923RSbXDJHazWLoZ` — 26 videos |
| Sons of South | `PLB68AB9B6E57C3FC1` — 100 videos |
| SoundCloud | `soundcloud.com/mrpr0phecy` (zero) |
| Instagram | `@mrpr0phecy` (zero) |
| TikTok | `@mrprophecy1212` |
| Base | Luton, England |

YouTube uses an `o`, SoundCloud and Instagram a `0`. **Not a typo — do not
"fix" it.** 26 of the 47 animated tracks start with "In" (Injection, Invincible,
Infighting, Incarnation, Inside, Inrush, Innersoul, Invested, Innovate,
Incursion, Infiltrate, Incompetence, Inherent, Introvert, Instinct, Indigo,
Init, Inhabited, Internal, Integrate, Incandescent, Inbound, Inhale,
Inauguration, Inferno, Invasion) — a deliberate signature `listen.html` is built
around.

### Video metadata without an API key

```bash
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEO_ID&format=json"
# enumerate a playlist:
curl -s "https://www.youtube.com/playlist?list=PLAYLIST_ID" \
  | grep -oE '"videoId":"[A-Za-z0-9_-]{11}"' | grep -oE '[A-Za-z0-9_-]{11}' | awk '!seen[$0]++'
```

Thumbnails need no API: `https://i.ytimg.com/vi/<ID>/maxresdefault.jpg`
(also `hqdefault`, `mqdefault`).

### `listen.html` — the music hub

Hero built on the flagship's artwork; a video wall of all 47 videos (In- series
vs 21 collabs/remixes); **click-to-load players — no `<iframe>` exists on load,
nothing is requested from YouTube until the visitor clicks** (fast, and no
third-party cookies for people who never press play — *preserve this*); modal
player with Escape, focus restore, and the iframe destroyed on close so audio
stops; `MusicGroup` JSON-LD, canonical, OG and Twitter cards.

### The music page cluster — one net, seven angles

The pages are deliberately separate: each targets a different intent, and no two
may compete for the same query.

| Page | Angle | Targets |
|---|---|---|
| `listen.html` | hub | brand searches |
| `radio.html` | continuous play | "listen continuously", background |
| `thisorthat.html` | interactive game | shares, repeat visits, "rank tracks" |
| `youtubepromo.html` | videos & visuals | "animated music video", "In- series" |
| `youtubepromo1.html` | free streaming | "stream free", SoundCloud, "no signup" |
| `youtubepromo2.html` | long-form guide | "who is MrProphecy" |
| `youtubepromo3.html` | Sons of South | crew names, "All Eyes On The South" |
| `luton.html` | local | "Luton rapper", "Bedfordshire hip hop" |
| `music.html` | press kit | bio, booking, curators |
| `support.html` | direct support | tipping, "support independent artist" |

All share a sticky nav (`.mp-nav`, generated by `nav()` in the build script) so
the cluster interlinks and ranking signal flows. **Adding a music page:**
distinct angle, add it to `NAV_PAGES`, regenerate the nav everywhere, add it to
the sitemap. If you cannot state its unique intent in one line, it is not a page.

### Conventions, analytics, money

- Always embed via `https://www.youtube-nocookie.com/embed/<ID>`.
- Every bare channel link gets `?sub_confirmation=1`.
- Never commit a placeholder video ID — link the channel or a playlist instead.
- GA `G-G058FVW6Z2` is on the 12 public pages that matter (home, all music
  pages, both money pages, news). Add it to any new public page — without it
  there is no way to price sponsorship.
- Payments go to **`paypal.me/russellhead`** (Russell Head). Amounts are
  **GBP** (`…/10GBP`) — without the suffix PayPal shows the viewer's currency.
- **Never gate the music**; everything stays free, no exclusive tracks for
  supporters. Lead with the free actions (subscribe, finish a video, share) —
  worth more than a tip to an unsigned artist. **No fake urgency**, no invented
  goals or supporter counts, and do not claim donations pay for hosting (GitHub
  Pages is free). Keep the ask on `support.html` and in the nav.

### `radio.html`, `thisorthat.html`, and growth

Watch time in embedded YouTube players counts toward YPP eligibility (public
videos), so the site is a watch-time surface: `radio.html` plays all 47 tracks
back to back via the IFrame API using `loadVideoById()` on one player (no iframe
swapping; `onError` skips unplayable videos), and `thisorthat.html` makes
watching a game (two tracks, play both, vote ×12, shareable top 5).

- Keep the **facade pattern** — no iframe until a click.
- On `thisorthat.html` the vote button and the video are **separate elements**
  (merged, the overlay swallowed the click and the card centre did nothing).
- **Never autoplay muted in a hidden element to farm watch time** — invalid
  traffic, filtered, risks the channel.

Growth is **legitimate only**: metadata, speed, structured data, honest CTAs,
internal links, translated pages. Out of bounds: view-bots, background-autoplay
tricks, hidden or 1×1 players, misleading thumbnails, engagement pods. They
break YouTube's ToS and risk the channel — do not implement them even if asked
indirectly.

### opensourcenews.html

A self-contained live news broadcast (3D globe, TTS anchors, tickers, no
backend) built from **80 open RSS feeds**, each `{ url, src, cat, weight,
region, direct? }` with `cat` ∈ world|science|tech|finance|weather|sport.

- **`direct: 1`** (43 feeds) means the feed serves `Access-Control-Allow-Origin:
  *` *and was confirmed fetchable from a real browser page*, so it bypasses the
  CORS proxy: no shared quota, works when every proxy is down. **Never mark a
  feed `direct` from a server-side check alone** — about a third that pass curl
  are still blocked in a browser; test with `fetch()` from a page.
- **Scheduling** is two-phase: direct feeds 12-wide, proxied feeds 8 per cycle
  through a paced queue; per-feed health backs a failing feed off 1/4/9…30 min.
- **Corroboration** by Jaccard similarity (0.22) over significant terms;
  machine-templated feeds (USGS/NWS/NOAA/GDACS) are excluded, or every
  earthquake "corroborates" every other.
- **Rendering happens on the progressive path**; end-of-cycle fires only after
  all batches finish.

## 5. Design language

Two aesthetics — match the page you are editing. **These rules are the design
contract**: read this section before changing anything visual, and look at the
hub pages at 360 px and 1440 px (no static check substitutes for that).

### Product A — "cyan terminal"

Defined as CSS custom properties in `index.html`:

```css
--accent: #2dd4ff; --accent-dark: #1aa3cc; --text: #e6faff;
--text-secondary: rgba(230,250,255,.7); --bg-primary: #0a0f14; --bg-secondary: #141e28;
--bg-card: linear-gradient(145deg, rgba(255,255,255,.03), rgba(255,255,255,.05));
--border-light: rgba(255,255,255,.08); --success: #39ff14; --error: #ff4d4d;
--premium: #ffd700; --love: #9d4edd; --space-xs/sm/md/lg: 4/8/12/16px;
```

Dark, technical, high-contrast, dense. Inputs use `#070f18` with thin
translucent borders. A card title carries one leading emoji — the only ornament,
and a visual key in the list.

### Product B — "neon night"

Defined per page; `listen.html` is the reference:

```css
--bg: #08080c; --panel: #101018; --line: rgba(255,255,255,.10);
--txt: #f2f2f7; --dim: #9a9aad; --hot: #ff2e63; --gold: #ffc93c; --cyan: #25d8f0;
```

Cinematic and editorial: `font-weight:900` display type with tight negative
tracking, gradient text on the artist name, ~74px section padding, blurred
artwork behind a dark scrim, pill buttons that lift 2px on hover. YouTube red
`#ff0033` is reserved for subscribe actions.

### Shared rules

- **Mobile first** — everything survives a 360 px viewport.
- **Respect `prefers-reduced-motion`** (kill animations and smooth scrolling).
- **Keyboard reachable**, visible focus, real `aria-label`s on icon-only
  controls, one `<h1>` per page and a sensible heading order.
- **System font stack** (`Inter`, `system-ui`, `-apple-system`, `Segoe UI`).
  Webfonts must be self-hosted (the home page ships Inter in `fonts/`,
  preloaded, `unicode-range` subsets, SIL OFL — `fonts/OFL.txt`); no font CDNs.
- `loading="lazy"` below the fold; every `target="_blank"` needs
  `rel="noopener noreferrer"`.

Kept when editing the hub pages and `cards/card.css`:

- **`cards/card.css`** carries the responsive hardening: `.field` and every
  direct child of an inline `grid-template-columns` container gets
  `min-width:0; max-width:100%`, and form controls `min-width:0` — this stops
  fragment layouts (e.g. BMI's two-column fields) blowing past a 390 px
  viewport. Do not remove it while restyling.
- **`:focus-visible`** outline (2 px accent, 2–3 px offset) on the hubs —
  additive, never remove a custom focus treatment or the outline.
- **`scroll-margin-top` ≈72 px** on anchored `section`/`main` targets so sticky
  navs never cover them.
- **`color-scheme: dark`**, accent `::selection` and a thin accent scrollbar are
  part of the system on the four hubs, `tool.html` and `404.html`.
- **Tap targets ≥40 px** (sticky-bar actions, pills, `listen.html` nav,
  `tool.html` `.nav-brand`, `donate.html` topbar); card widgets get a 44 px
  touch boost via `setupMobileOptimizations`.
- **`tool.html`**: `.tool-card-box` and its injected container are
  `min-width:0; max-width:100%` (the card-overflow fix's second half).
- **Hero order** (`index.html`): `.hero-brand` → `h1.futuristic-title` (the
  promise, not the site name; `clamp(1.6rem,6.4vw,3.35rem)`, 26ch) →
  `.hero-subtitle` → search → popular chips → `.hero-facts` → `.hero-keys`.
  The badge, its sheen and the 🔍 glyph are gone; the search icon is inline SVG
  taking the accent colour. A tool's own emoji belongs to the tool.
- **One chip per emoji on headings and tiles** (`.section-emoji`, `.cat-icon`);
  sticky-bar buttons, panels and rows keep their own emoji deliberately.
- **The mark** is one geometry in `brand/mark.py`, rendered by
  `brand/gen_assets.py` — the finder: two corner brackets holding a white
  four-point star on a dark tile. `logo-mark.svg` and `favicon.svg` are
  byte-identical to mark.py's drawing; `python3 brand/check-mark.py` (in
  `verify.sh --deep`) fails otherwise. **Edit the mark in `brand/`, never in
  the SVG.**
- Decorative extras live in classes, not inline styles (`.no-results`,
  `.music-spotlight`).

## 6. SEO and metadata

Every public page: unique `<title>` and meta description, `rel="canonical"`,
Open Graph (`og:title/description/image/url/type`), `twitter:card =
summary_large_image` and `theme-color`. Music pages additionally carry
`MusicGroup` JSON-LD. **Always `https://` and the `www.` host** — mixed
`http://` references have broken share previews here.

The 12 language pages are an **hreflang cluster**: each lists all twelve
siblings plus `en` and `x-default` → `listen.html`. Add a language in all
thirteen pages or Google treats them as duplicates competing with each other.

`sitemap.xml` lists all indexable pages (1,338 cards included) and is built by
`python3 scripts/build-sitemap.py` **from git, not the working tree**, so a
sparse checkout cannot silently drop the card pages. URLs are percent-encoded —
some `images/` filenames contain spaces. `scan-seo.py` scans every root `*.html`;
`cards/` are fragments and are skipped; `404.html`'s missing OG tags are a
warning, not a failure.

### §6b Embed licensing

Static, with these parts:

- **`embed.html#pricing`** — free-forever (credit line stays), £99/yr single
  tool, £299/yr category, £899/yr white-label. Tier CTAs are pre-filled
  `mailto:` enquiries; GA records `embed_copy`, `pricing_view`,
  `licence_enquiry`, `licence_key_valid/invalid`. `embed.html?cat=<cat>&tool=<slug>`
  deep-links into the catalogue filter, which is what the landing page links to.
- **The credit line is the price of the free tier** — every snippet from
  `embed.html` or `tool.html` carries a `[data-mus-credit]` element linking back
  to the tool, and `scripts/check-finance.js` FAILS if either stops emitting it.
  Do not weaken that check.
- **MUS1 keys**: `MUS1.<payload>.<signature>`, ECDSA P-256/SHA-256 over
  `{v,d,t,e}` (domain, tier, expiry). CLI: `scripts/licence-keys.mjs`
  (`keygen|pubkey|sign|verify`); browser issuer `licence-admin.html` (owner-only,
  noindex, no analytics, private key in localStorage). A buyer pastes their key
  at `embed.html#activate`; snippets then drop the credit line only on the
  licensed domain before expiry. Tamper-evident, not DRM. Until the owner pastes
  their **public** JWK into `embed.html`'s `mus-licence-pubkey` meta, activation
  is off and everything is the free credited tier.
- **`embed-finance.html`** is generated (`scripts/build-embed-landing.py`,
  `--check` in verify.sh); counts and the statutory-check figure derive from
  `cards/cards.json` and `check-finance.js` at build time. Never hand-edit.

## 7. Traps and gotchas

Each has already cost someone real time.

**`sw.js` caching contracts.** It is registered by `home-core.js` at idle on
every list page (§2). Its rules:

- **Network-first for HTML** — cache-first serves stale pages for days after a
  deploy. Precache entries are added **individually**, never `cache.addAll()`,
  which is atomic: one 404 aborts the install and the worker never activates.
- **The catalogue may never come from a stale cache.** The tiers, card
  fragments and first-party code go through `freshFast()`: the cached copy
  answers only inside GitHub Pages' 10-minute freshness window, then the network
  decides, with the cache as fallback past `NETWORK_PATIENCE_MS` (2.5 s) or
  offline. This replaced stale-while-revalidate, which always served the
  previous deploy and made every new tool invisible until a second visit.
- **Nothing waits on the network forever.** Past `UNCACHED_PATIENCE_MS` (8 s) an
  uncached navigation falls back to the cached index and an uncached catalogue,
  fragment, script, font or fallback fetch fails fast (503) so the page renders
  its error UI. The list's own catalogue fetch has a 12 s abort over headers
  *and* body, re-arms on failure, and offers a retry in the empty state; the
  toolbox lookup does the same. Pinned by `service-worker.test.js` and
  `explore-list.test.js`.
- **Precache only what the fetch handler reads from that cache** — entries are
  fetched with `cache: 'reload'`, so a URL served from another cache is
  downloaded twice per install.
- **`PAGE_ASSET_PATHS`**: `home.css`, `home-deferred.css`, `risk-notices.js`,
  `explore.css`, `explore.js`, `toolbox.js` and `home-core.js` are fetched
  before the worker controls anything, so they are precached into `STATIC_CACHE`
  and served from there — **without** `cache: 'reload'`, because their `?v=` URL
  makes a stale entry impossible and lets the precache reuse the response the
  page just downloaded. **Bump `CACHE_VERSION` (and the matching `?v=`) or a
  deploy quietly precaches the previous version.**

**`index.html`'s link blocks are generated** — never hand-edit inside
`HOME-FEATURED` / `HOME-TRENDING` / `HOME-CATEGORIES`; `verify.sh` fails until
they match the catalogue. The list itself is built at runtime and is not in the
document at all.

**One search box per page, one place it goes.** Every search input is a view
onto `mpExplore.filter()`, bridged by `home-core.js` (boxes resolved by id:
`#tool-search`, `#stickySearchInput`). **A new search box is an entry in the
bridge, never a fresh `getElementById`** (the old page looked for
`#mainSearchInput` on a page shipping `#tool-search`, so the hero box filtered
nothing and `/` threw). The list is the only result surface; a query also steps
the browse sections aside.

**`tools-index.json` is about 945 KB and every list's data.** The home page
fetches it when the visitor reaches the list; the static pages already contain
its output and never fetch it. It duplicates the full catalogue tier's
title/description/category (about 194 KB gzip vs 149 KB) — de-duplicating needs
a new signals file plus a drift gate: deliberate or not at all, never half-way.

**The only size the list engine assumes is `PAGE_SIZE = 60`.** Row height comes
from the row's own content. The park, warm-ahead and the per-frame budget are
gone; a container a *running tool* measures from must never be hidden with
`display: none` (a canvas sizes itself from `clientWidth` and reads zero).

**Top-level name collisions across cards.** `tool.html` injects one card at a
time into a shared document, and a global `let`/`const`/`class` cannot be
undeclared — a name two cards share kills whichever loads second with
`SyntaxError: Identifier 'X' has already been declared` (it renders and does
nothing). `scripts/check-card-collisions.py` is the guard. Ids are no longer a
live hazard (one card at a time) but prefix them anyway — `check-cards.py`
enforces it and it costs nothing.

**Sparse checkout gives false "broken image" results.** `images/` is ~50 MB and
usually excluded, so local tooling reports 404s. Confirm with `curl` against the
live site before "fixing" anything.

**Filenames contain spaces and en-dashes** (`images/SOSMrWolfs 21.jpg`). Quote
paths; URL-encode in HTML and XML. **A literal `%` in a filename is
double-encoded when served** — a name storing `%2F` publishes as `…%252F…`, and
requesting the single-encoded form 404s on a file that exists (issue #91). Any
tooling turning repo paths into URLs must encode each segment; see
`encodeRelUrl()` in `scripts/check-production.js`.

## 8. Working on this repo

### Clone — always sparse (a full clone is ~125 MB, mostly `images/`)

```bash
git clone --depth 1 --filter=blob:none --sparse \
    git@github.com:mrpr0phecy/mrpr0phecy.git r && cd r
git sparse-checkout set --no-cone '/*' '!/images/' '!/cards/'   # music work
git sparse-checkout set --no-cone '/*' '!/images/'              # tool work
```

Cone mode does not work here (`'index.html' is not a directory`) — use
`--no-cone` with leading-slash patterns.

### Test and check locally

```bash
python3 -m http.server 8891     # serve over HTTP — file:// breaks fetch() of cards.json
bash scripts/verify.sh          # the gate; --deep for shared changes; --live adds production curls
```

For card work the six questions (AGENTS.md §1) are run by
`scripts/check-card-js.py`, `handler-check.js`, `check-parallel-arrays.js`,
`check-form-buttons.js`, `check-card-init.js` and `check-card-leftovers.js`
(`--all` for the whole catalogue). The hand-maintained surfaces no generator
owns — `agents.html`'s JSON samples, the category enumerations and quoted
sizes — are checked by `check-agents-docs.py`, `build-category-lists.py --check`
and `check-size-claims.py`: a bare size figure must be exactly right, a hedged
one ("about 89 MB") may be 15% out.

### Verify after pushing

Pages takes 30–60 s; a green push is not proof. `node scripts/check-production.js`
compares deployed bytes with this repository, parses the live catalogue and
sitemap, checks the custom 404 and the https upgrade, and raises one alert issue
on mismatch. It runs itself on every push to `main` (waiting 45 s, then retrying
for about a minute) and every six hours; failure modes are pinned by
`scripts/tests/production-monitor.test.js`. Triage, rollback and fix-forward:
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## 9. Current state

1338 tools in `cards/` across 29 categories, one shared DOM, every derived
surface regenerated by `npm run build`. Gate: `npm run verify`; `verify:deep`
for shared infrastructure. CI runs the fast gate on PRs and pushes, and the deep
gate on `main` (the deploy) and nightly. Local validation: AGENTS.md §1.

**Do not delete or rename:** `CNAME`, `sw.js` (live service worker), the CV
files, `opensourcenews.html`, `token.html`, or any tool in `cards/`. Adding is
free; retiring is an owner decision.

Deleted 2026-09-20 with owner approval, after confirming no page, sitemap entry
or robots rule referenced them: `indexbeta.html`, `hokidea.html`, `guide.txt`,
`substitutions/`, `system/`, `digitaldetoxcardshtml/` (in git history). This
section used to be a 725-line dated changelog; `git log` is the changelog now —
this file describes the site as it is.

## MostUsefulMaps (`maps.html`)

The site's own open-data map, built so the catalogue's tools can use it too.
Dependency-free engine in `maps/core/` (WGS84 geodesics, Plus Codes, OS grid
references, NOAA sun times, offline place search). Two renderers on purpose:
`maps/localmap.js` draws Natural Earth boundaries on canvas with no library and
no network (what every card uses), and `maps/livemap.js` layers MapLibre GL with
OpenFreeMap vector tiles when online — a failed live layer is invisible because
the offline map is already there. `maps/embed.js` exposes
`window.MostUsefulMaps` (`mount(...)`, plus `distance`, `measure`, `plusCode`,
`sunTimes`, `parse`, `searchPlaces`) and loads nothing until a card asks. The
driving layer (`maps/core/speed.js`, `drive.js`) is vehicle-aware speed limits
(OSM `maxspeed`, national defaults, the Welsh 20 mph default, every answer with
its basis) and an entirely on-device navigation session. Routing chains
Valhalla → OSRM → a labelled straight line; speed limits come from Overpass,
traffic only from a key-free feed that exists (TfL), weather from Open-Meteo —
and where no key-free feed exists the page says so rather than estimating.
Provenance, licences, providers, the offline matrix and CI's limits:
`docs/MAPS.md`.
