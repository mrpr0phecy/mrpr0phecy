# ARCHITECTURE.md — mrpr0phecy/mrpr0phecy

**Read this first.** It is the single onboarding document for this repository,
written so that a human or an AI agent handed a GitHub token can be productive
within about ten minutes and without breaking anything.

Last substantive update: 2026-08-30.

For anything money-related — what earns, what the real numbers are, and what
was deliberately not built — see **[INCOME.md](INCOME.md)**.

---

## 1. What this repository actually is

One GitHub Pages site serving **two unrelated products** from the same domain:

| | Product | Entry point | Audience |
|---|---|---|---|
| **A** | **The Most Useful Site In The World** — 483 self-contained browser tools | `index.html` | People searching for a specific tool |
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
│   ├── cards.json          Generated index of all 483 tools
│   └── <tool-name>.html    483 tool fragments (NOT full documents)
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
├── opensourcenews.html     Open-source news channel — WORK IN PROGRESS
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
2. **Element IDs must be globally unique across all 483 cards.** They share one
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

# 4. Bump the count in index.html: "Search 483+ free tools" -> 484+

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

### Categories (483 tools)

| Count | Category | | Count | Category |
|---|---|---|---|---|
| 120 | Science & Engineering | | 11 | SaaS & Business Killers |
| 86 | Productivity & Lifestyle | | 11 | Lucid Dreaming & Sleep |
| 47 | Writing & Language | | 11 | Interactive Art & Living Worlds |
| 33 | Finance & Money | | 10 | Natural Remedies & Herbs |
| 28 | Mathematics | | 10 | AI & Autonomous Agents |
| 23 | Music & Audio | | 10 | Anime & Otaku Culture |
| 21 | Health & Fitness | | 10 | Aquatics & Fishkeeping |
| 15 | Culinary & Food Science | | 10 | Birdwatching & Ornithology |
| | | | 10 | Boxing & Fight Scoring |
| | | | 10 | Dogs & Canine Care |
| | | | 7 | Virtual Worlds & Gaming |

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

`sitemap.xml` lists all 518 pages. Build it from git rather than the working
tree, so a sparse checkout does not silently drop the 483 cards:

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

**ID collisions across cards.** All 483 share one DOM. See §3.

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

# Music work (skip images and the 483 cards):
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

Worthwhile automated checks before pushing:

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

**Recently fixed** (2026-08-30): every YouTube embed on the site was a
placeholder — including a Rickroll (`dQw4w9WgXcQ`) sitting in the Marathi page —
now replaced with the real catalogue; a 404'd `og:image`; a mangled duplicated
stylesheet URL and several newline-corrupted JS string literals in
`sonicfansite.html` that broke all scripting on that page; 50 unprotected
`target="_blank"` links; missing canonicals and hreflang across 12 language
pages; insecure `http://` OG URLs; a service worker that could never install;
and a PWA manifest pointing at a 1024px JPEG for its 192px and 512px icons.
`robots.txt` and `sitemap.xml` did not exist at all before this.

**Deliberately left alone**

- `opensourcenews.html` — the open-source news channel. The owner plans to
  improve this separately. **Do not touch it.**

**Open questions for the owner**

- `mpnews.html` has no `<h1>`, canonical or structured data, and is not in the
  nav cluster. It needs the same treatment the other music pages have had.
- The 12 language pages are thin and machine-translated. Thin translated pages
  can attract a manual action from Google. Either enrich them with genuinely
  localised content or consider consolidating.
- `sw.js` is correct but unregistered — enable it or delete it.
- Legacy directories `substitutions/`, `system/`, `digitaldetoxcardshtml/` and
  the duplicate CV files look like dead weight. Confirm before removing.
