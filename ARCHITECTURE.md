# ARCHITECTURE.md — mrpr0phecy/mrpr0phecy

**Read this first.** It is the single onboarding document for this repository,
written so that a human or an AI agent handed a GitHub token can be productive
within about ten minutes and without breaking anything.

**For AI agents:** start with **[AGENTS.md](AGENTS.md)** — the one entry
point: the commands, the hard lines, the card rules and the common tasks. This
file is the reference it links into. If you need GitHub access in a fresh
session, run `bash scripts/agent-auth.sh` (self-service device flow,
sparse-clone recipe inside) instead of asking the owner to paste a token.

Last substantive update: 2026-09-21.

For anything money-related — what earns, what the real numbers are, and what
was deliberately not built — see **[INCOME.md](INCOME.md)**.

---

## 1. What this repository actually is

One GitHub Pages site serving **two unrelated products** from the same domain:

| | Product | Entry point | Audience |
|---|---|---|---|
| **A** | **The Most Useful Site In The World** — 1285 self-contained browser tools | `index.html` | People searching for a specific tool |
| **B** | **MrProphecy** — the music project of the repo owner | `listen.html` | Listeners, YouTube discovery |

**These two are deliberately kept separate.** This is a standing instruction
from the owner, not an accident of history. Do not add music players, artist
banners, or cross-promotional footers to the tool catalogue or to any card, and
do not add tool links to the music pages. If a task says "improve the site",
establish *which* site first.

- **Live:** <https://www.themostusefulsiteintheworld.com>
- **Hosting:** GitHub Pages, served straight from `main`. There is no build
  step, no bundler, no framework, and `.nojekyll` is what keeps that literally
  true: without it Pages runs the repository through Jekyll, which silently
  drops every path beginning with `.` or `_` — that is how `.well-known/ai.txt`
  and `.well-known/security.txt` came to be 404 in production while four pages
  linked to them (found 2026-09-15). Every tracked file is
  served at its own path.
- **Custom domain:** the `CNAME` file. Deleting it breaks the domain.
- **Deploy latency:** roughly 30–60 seconds after a push. Always verify live
  with `curl` rather than assuming.

---

## 2. Repository map

```
/
├── index.html              Product A: tool catalogue (search/filter UI)
├── home-core.js            Homepage chrome: theme, panels, search bridge, deep links
├── explore.js              The list engine every list page runs (filter/sort/rows)
├── explore.css             The list layer's styles (rows, toolbar, toolbox, sponsor slot)
├── toolbox.js              The visitor's own toolbox: a saved slug list, not a running grid
├── cards/
│   ├── cards-lite.json     Generated critical-path tier: name/title/category
│   ├── cards.json          Generated full index of all 1285 tools (descriptions feed search)
│   └── <tool-name>.html    1285 tool fragments (NOT full documents)
├── generate-cards-json.js  Rebuilds cards.json + cards-lite.json from the cards/ directory
├── ai.html                 Lantern — standalone AI product. Chat answered on
│                           the device from the visitor's own documents and
│                           memory (composed answers are labelled as such),
│                           real local tools, 18 reasoning methods with visible
│                           working, a guided tour and lessons, rating-driven
│                           adaptation, optional WebGPU model, and a duty of
│                           care that surfaces verified UK emergency help when
│                           the visitor's own words describe a dangerous
│                           situation (never from indexed documents; switch off
│                           with /duty off). Own name, mark and palette: no
│                           catalogue data or branding
├── agents.html             Machine-use guide for AI agents & developers
│                           (the former /ai.html; cards and llms.txt link here)
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
├── embed.html              Embed catalogue + licensing funnel + MUS1 key
│                           activation (§6b). GA + funnel events.
├── embed-finance.html      GENERATED licence landing page for the finance
│                           vertical (§6b) — scripts/build-embed-landing.py;
│                           never hand-edit, verify.sh fails on drift.
├── licence-admin.html      OWNER console: issues signed MUS1 keys offline.
│                           noindex, no analytics; private key stays in the
│                           owner's browser (§6b).
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
│   eternalbeffudlementmachine.html, local-ai.html, byte-realistic.html,
│   byte-realistic-v4.html, slideshowtest.html,
│   token.html, tool.html, supaviewer.html
│                           Experiments and one-offs. Not linked from the
│                           catalogue. Safe to ignore; ask before deleting.
│                           `local-ai.html`, `byte-realistic.html` and
│                           `byte-realistic-v4.html` are noindex redirect
│                           stubs pointing at ai.html.
│                           `supaviewer.html` is SupaViewer, a standalone
│                           in-browser virtual-world viewer (docs in
│                           supaviewer/).
│   approved.json, README.md
│
├── manifest.json           PWA manifest
├── sw.js                   Service worker — present but NOT registered (§7)
├── robots.txt              Allows all, points at the sitemap
├── sitemap.xml             All indexable pages, generated (§6); noindex
│                           redirect stubs are excluded automatically
├── brand/                  the mark's source: mark.py (geometry, palette, SVG),
│                           gen_assets.py (writes every asset below),
│                           check-mark.py, measure.py, spec.py (writes
│                           brand/spec.html) — see brand/README.md
├── favicon.svg, favicon.ico, icon-192.png, icon-512.png,
│   icon-maskable-512.png, apple-touch-icon.png   the mark, for the tab, the
│                           home screen, Android and iOS (§5)
├── logo-mark.svg           the same mark, vector — linked by index.html's
│                           lockup, footer and sticky bar, tool.html's nav and
│                           every secondary page's topbar
├── logo-mark-mono-dark.svg, logo-mark-mono-light.svg   the one-colour
│                           reduction (#071019 / #ffffff) — unreferenced by any
│                           page; for print, embeds and light surfaces
├── logo-lockup-dark.svg, logo-lockup-light.svg         mark + wordmark, the
│                           wordmark as outlines so no font is needed
├── logo.png                1024² stacked lockup. Unreferenced by any
│                           page — kept deliberately, for press and profiles
├── mrprophecypic.jpg (1024², for og:image) + mrprophecypic-600.jpg (rendered)
├── backgroundpic.jpg + backgroundpic.webp (the one the pages use)
├── og-brand.png, og-tools.png, og-ai.jpg, og-mp.png, luton-og.png,
│   sonic-og.png          social cards (og-brand.png is index.html's)
├── images/                 ~50 MB of photos. Excluded from sparse checkouts.
├── README.md               Short public-facing readme
├── CV.docx / CV.pdf / cv.pdf / latestcv.docx    Owner's CV files
```

---

## 3. Product A — the tool catalogue

### How it works
**The home page lists tools. It does not run them.** Every tool runs on
`tool.html`, one page, one tool at a time. Until 2026-09-21 the home page also
mounted the catalogue in place — 1,205 fragments, each injected into the page
and executed — and that is what was removed: not a feature, an entire class of
failure. A page running every tool has a different way to look broken for every
tool in it (half-drawn cards, a click that lands before its listener exists, a
phone out of memory), and each of those was a visitor who left believing the
site was broken.

What is left is a page that links. What that buys:

- **First paint no longer waits for a catalogue.** The page renders its own
  chrome and the first list; nothing monospaced, nothing that needs a
  stylesheet from another deploy to look finished.
- **One place a tool can go wrong.** `tool.html` fails the same way for all
  1,285 tools, and `scripts/check-tool-graph.py` proves every link into it
  lands on a tool that exists.
- **A list that scales.** Filtering, sorting, keyboard navigation, density and
  the toolbox are properties of a *list*. They were impossible to add while the
  catalogue's first job was to execute 1,205 fragments.
- **Reachability without the grid.** A tool is still reachable from
  `tools.html`, `tools-index.html`, its category page, `sitemap.xml`,
  `embed.html`, `sitemap.html` and `api/tools.json` — the surfaces
  `check-tool-graph.py` enumerates as `FULL_SURFACES`. The home page was never
  one of them, so dropping its grid orphaned nothing.

The catalogue tiers (`cards/cards-lite.json`, `cards/cards.json`) still exist
and still matter — `tool.html` uses them for its shell, the toolbox reads the
lite tier for titles, and every generator that writes a list reads the full
tier. What changed is who fetches them: the pages that need them, when they
need them.

### The list layer — `explore.css`, `explore.js`, `toolbox.js`

Four files, three of them new on 2026-09-21, and they are the whole of the
catalogue's browsing experience:

| file | job |
| --- | --- |
| `explore.css` | the row, the toolbar, the empty state, the toolbox panel, the sponsor slot. Loaded by `index.html`, `tools.html`, `tools-index.html` and all 28 category pages. |
| `explore.js` | the list engine: filters, sorts, keyboard, URL state, the "show more" reveal |
| `toolbox.js` | the visitor's saved list — add, remove, reorder, share, export/import — and the ＋ buttons themselves |
| `home-core.js` | home-page chrome only: theme, panels, the search bridge into the list, deep links, service worker |

Two mount shapes, and the difference is a deliberate performance decision:

- **`data-explore="json"` (the home page).** The rows are *built* from
  `tools-index.json` when the visitor reaches the list. Nothing is fetched at
  parse time; the list is 60 rows in the DOM at a time, and "Show 60 more"
  extends it. Three measured decisions live here, all of them from the
  2026-09-24 pass over the home page's load (1.6 Mbps, 150 ms RTT, 4x CPU —
  an interleaved A/B against the previous build, medians of 5–6 runs):
  - **The fetch starts on idle-with-a-bound, or on `load`, whichever is
    first.** Waiting for a genuinely idle browser put the request at 3.2 s
    while `load` finished at 2.1 s; `load` as the backstop moved the first row
    from 4.6 s to 3.5 s. The 200 KB still must not compete with the first
    screen, so neither path starts before first paint.
  - **Rows carry `content-visibility: auto` with a 96 px placeholder.** Sixty
    rows are painted at once and laying all of them out was 253 ms of one
    920 ms frame — the most expensive thing the catalogue did. Skipping the
    rows that are off screen took layout from 297 ms to 65 ms and the row
    build from ~994 ms to ~490 ms of main-thread time. 96 px is the measured
    median row height (94 px at 390 wide, 97 px at 1440) and the whole page
    lands within 60 px of its fully-rendered height; scrolling 5,000 px down
    the list shows 0 px of drift in a row already on screen.
  - **The toolbox's lite tier is fetched when the visitor reaches for the
    toolbox, not at `DOMContentLoaded`.** It is 123 KB of JSON for a panel that
    is closed at first paint; it is now fetched on pointer-intent, focus, the
    panel opening, or a tool being added.
- **`data-explore="static"` (`tools.html`, `tools-index.html`, category
  pages).** The rows are already in the served HTML, so the engine never
  rebuilds them: it decorates them in place (category chip, ＋ button, details
  toggle) and filters by hiding rows. The reveal is **per group, not global**:
  `tools.html` is one section per category, so "first 60 by title" would have
  emptied most categories and overfilled a few. Each category shows its first
  60; "Show 60 more" extends every one.

The rules that keep it honest, each pinned by a test:

- **A list is a list with JavaScript off too.** Rows are real `<a>` elements
  written at build time. `tools-index.html` is the extreme case: it is the page
  linked from `llms.txt` and read by crawlers, so it keeps its zero-JS promise
  and the layer only *adds* the filter box, the sort and the ＋. A page whose
  script failed still has every tool.
- **No dead controls.** Every ＋, ▸ and ↗ is added by `toolbox.js` /
  `explore.js` at load. A page with scripts off never shows a button that
  cannot work.
- **`?card=<slug>` keeps working.** `home-core.js` forwards the old home-page
  card links to `tool.html?card=<slug>` with `location.replace`, so every link
  anyone ever shared still lands on the tool.

### What was removed, and the two things that must not come back

Deleted with the grid: `home-app.js` (197 KB, the application that mounted
cards), `home-features.js` (43 KB, the on-demand UI bundle) and
`discovery-app.js` (18 KB, the browse chrome). `scripts/tests/no-live-tools.test.js`
is the tripwire: it fails if `index.html` fetches the catalogue or a card
fragment, if a mounting surface (`#dashboard`, `#standaloneModal`,
`#directoryView`, a card grid) reappears, or if any of the three deleted files
comes back.

**Read this before "just mounting one card".** The grid was not slow because
it was badly written; it was the most carefully written code in this
repository (the live window, the park pass, the warm-ahead trickle, the
per-frame budget — all of it measured and tuned). It was slow because running
1,205 tools is not something a browser does. A preview card on the home page <!-- historical-count: the grid ran the catalogue as it stood then -->
would be the first card of a grid, and it would bring the rest back with it.

### The toolbox — a saved list, not a running grid

The toolbox used to hold *live* tools: saving one mounted its card inside the
panel, which meant the panel could only exist on the one page that had already
loaded the catalogue, and could only hold a handful of tools before it became a
second copy of the heaviest page on the site.

It now stores **slugs**. That is the whole data model, and everything else
follows:

- **`localStorage['mp.toolbox.v1']`** — an ordered array of slugs.
  Deliberately *not* an `__mp_` key: those are reserved for instrumentation
  (`docs/INSTRUMENTATION.md`).
- **It works on every list page.** `toolbox.js` finds the panel if the page
  ships one (`index.html`'s popover) and builds one if it does not (a floating
  button on `tools.html`, `tools-index.html` and the category pages).
- **A toolbox is a URL.** `?toolbox=<base64url slugs>` shares a list. The
  receiving visitor is *offered* it and nothing is written until they click —
  an unsolicited write is how a shared link turns into a support email.
- **Nothing leaves the device.** No account, no sync, no upload — the panel's
  Export button exists precisely because clearing browser data clears the
  toolbox, and saying so is more honest than syncing it.

### First-screen fast path (generated — do not hand-edit)
**The home page has no card markup and no first-screen bootstrap.** Both were
removed with the grid (2026-09-21). What it has instead:

- **`HOME-FEATURED` and `HOME-TRENDING`** — two generated blocks of static rows
  (12 featured, 8 most-used) written by `scripts/build-home-prerender.py`. They
  are plain links in the served HTML, so they paint with the page, they work
  without scripts, and they cost one line each. The ＋ that keeps one in a
  toolbox is added by `toolbox.js`, not baked in.
- **`HOME-CATEGORIES`** — the 29 category hubs, one link each.
- **`[data-explore="json"]`** — an empty container. Everything below the fold
  (the filterable list of all 1,285 tools) is fetched on scroll and built 60
  rows at a time. On a phone with a cold cache the page is useful before that
  fetch starts.

The generator refuses to write from a `tools-index.json` that disagrees with
`cards/cards.json`, so a stale catalogue cannot half-render the page. Run it
with `--check` to see drift:

    python3 scripts/build-home-prerender.py           # rewrite the blocks
    python3 scripts/build-home-prerender.py --check   # fail on drift (verify.sh)

### The list reveal — what a page is allowed to build

The home page's list is the only place rows are built from data, and it builds
**60 at a time**. Two numbers decide that:

- **60 rows is a screenful and a half.** Enough that scrolling never meets the
  bottom edge, small enough that the DOM stays in the low thousands of nodes
  once the visitor has opened a few pages of it.
- **`display:none` subtrees skip layout.** On the static surfaces all 1,250 rows
  are in the document (crawlers, find-in-page, no-JS) but only the visible ones
  are laid out, which is what keeps a half-megabyte page feeling like a 60-row
  one. The row count is the catalogue's; the size is stated in round terms on
  purpose — it grows with every tool, and a precise figure here went stale
  (483 KB) without anyone noticing.

The reveal is per group on grouped pages — see the list-layer section above —
because a global "first 60" on a page with 28 category headings empties 27 of
them.

### Density, and what happened to the park

The old grid had four mechanisms for the same problem — too many tools, too
little screen: `DENSITY` (mosaic vs focus), the park pass (unmounting tools that
scrolled away), warm-ahead (fetching the next screen early) and an idle trickle.
Every one of them existed because a *running* tool is expensive.

With nothing running, density is a two-state choice that belongs to the list:
**comfortable** shows each row's description, **compact** hides it until you
toggle that row — one line of CSS each, remembered in `localStorage['density']`.
The park, warm-ahead and the trickle are gone with the code that needed them;
`scripts/tests/no-live-tools.test.js` fails if they come back.

### The home page's four files

The split used to be "core app + on-demand bundle". It is now four files, each
with one job and none of them large:

| file | size | when it runs |
| --- | --- | --- |
| `home.css` | about 43 KB | first-paint rules — render-blocking on purpose |
| `home-deferred.css` | about 9 KB | rules for containers hidden at first paint; applied after it (13 KB gzip for the pair) |
| `explore.css` | about 25 KB | the list layer's styles, shared with the four other page types |
| `toolbox.js` | about 32 KB | saved list, ＋ buttons, the toolbox panel (built here if the page has none); its lite-tier fetch waits for the visitor to reach for the toolbox |
| `explore.js` | about 48 KB | the list engine: fetch, filter, sort, reveal, keyboard, URL state |
| `home-core.js` | about 22 KB | theme/accent, panels, the search bridge, deep links, service worker |

`scripts/check-critical-css.py` holds the two rules that make this safe: the
first paint's stylesheet must not depend on the deferred one, and every asset
`index.html` loads must be versioned with the same `?v=` as `CACHE_VERSION` in
`sw.js`. It fails the build if `home-core.js` loses `APP_VERSION` or if the
page starts loading an asset the service worker does not precache.

`window.mpExplore` and `window.mpToolbox` are the public seams between them —
`home-core.js` calls `mpExplore.filter()` when the hero search box is typed in,
and `mpExplore` calls `mpToolbox.toggle()` when a ＋ is pressed. Neither file
reaches into the other's DOM.

### The main page's `<head>` is a budget

`index.html`'s head was once 132,210 bytes — 71% of the document — mostly an
inline stylesheet. It is now under 16 KB, and the rule that keeps it that way
is: **bytes in the document cost every visitor on every navigation, so
rationale lives in this file, not in HTML comments.** A measured example: the
HTML comments alone were 2,664 bytes gzip (19% of what the page sent).

What lives here instead of in the head:

- **Why the list is fetched from `tools-index.json`, not from
  `cards/cards-lite.json`.** The list needs titles, descriptions, categories,
  tags and popularity; the lite tier's `{n,t,c}` is a *shell* format for the one
  page that used to build 1,205 of them. One fetch, one format, one source.
- **Why `home-core.js` is external and deferred.** It parses in parallel with
  the HTML instead of waiting for the whole document, and it is cached
  separately, so a revalidated page stops re-sending the JS with it.
- **Why gtag loads at idle.** Its ~28 KB script used to be requested the moment
  the head's end parsed, while the first rows were still rendering. The
  `dataLayer` shim is in place immediately, so every `gtag()` call queues and
  nothing is lost; `page_view` lands a beat later.
- **Why Inter is self-hosted and preloaded.** The old chain was
  head → Google CSS (1 RTT) → woff2 (1 RTT) → ~700 ms of font-swap delay on
  slow 4G. `unicode-range` keeps the latin-ext file unfetched unless a glyph
  needs it, and `font-display: swap` paints in the system stack meanwhile.
- **Why the speculation rules prefetch but do not prerender.** Prerendering a
  tool page runs its whole standalone page on hover — heavy, and it gave us a
  real bug (2026-09-21): a prerender that wedged behind the service worker
  meant a click could land on a dead second document, hanging the tab instead
  of opening the tool. The rules now prefetch the tool responses (`moderate`)
  and category hubs (`conservative`): nothing to activate, nothing to wedge,
  and the click is still near-instant because the response — and the service
  worker's runtime-cache entry — is already warm.

### Where the CSS lives

| file | contents | how it is loaded |
| --- | --- | --- |
| `home.css` | first-paint rules: base tokens, command bar, hero, search, the browse sections' layout, footer | render-blocking `<link>` (an unstyled first paint is worse than one RTT that overlaps the HTML download) |
| `home-deferred.css` | rules for containers that are **hidden at first paint**: the palette/contributions panels, the toolbox panel, the footer's music spotlight | `media="print"` + `onload` swap, so it is fetched alongside `home.css` but applied after the first paint; `<noscript>` link for JS-less readers |
| `explore.css` | the list layer: toolbar, rows, empty state, toolbox panel, the sponsor slot | a normal `<link>` on every list page — five page types share it, so it is cached once and reused |

Three properties make the split safe, and `scripts/check-critical-css.py`
(verify §15) fails the build if any is broken:

1. **The rules that hide those containers stay in `home.css`.** `.panel`,
   `.toolbox`, `#directoryView { display: none }` and the modal's
   `pointer-events: none` are the mechanism, not styling — a late stylesheet
   must never be what decides whether a container is visible.
2. **No deferred selector may mention anything else.** The guard's rule is
   containment, not a sample: every selector in the deferred file must target a
   container that is hidden at first paint.
3. **`home.css` carries the tokens the deferred file uses**, and the deferred
   file may only lean on what `home.css` defines (it always loads first).

Every asset is loaded with `?v=N` where `N` equals `CACHE_VERSION` in `sw.js` —
the same deploy-consistency rule the service worker enforces for its own
caches, since a page from one deploy must never run against another deploy's
CSS or JS. The number is written by `scripts/build-tools-page.py`,
`scripts/build-category-pages.js` and `scripts/generate-ai-index.js` reading it
out of `sw.js`: hard-coding it per generator is how `tools.html` once shipped
`explore.css?v=1` against a `?v=16` homepage.

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
2. **Element IDs must be globally unique across all 1285 cards.** They share one
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

# 2. Add the slug to the right category list in generate-cards-json.js FIRST
#    (see the warning below), then regenerate the index
node generate-cards-json.js

# 3. Re-sync everything derived from the catalogue. Never hand-edit a count
#    or the home page's generated first screen — the tool count is the number
#    of .html files in cards/ (`python3 scripts/sync-counts.py count` prints
#    it) and verify.sh re-derives any drifted published number in
#    place instead of failing. Order matters: build-home-prerender.py reads
#    tools-index.json for the category hub links it writes into index.html.
npm run build          # every generator, in dependency order

# 4. Verify, commit, push, wait ~50s, then verify live:
bash scripts/verify.sh --deep   # before a push; plain verify.sh while iterating
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

### Categories (1285 tools)

Derived from `cards/cards.json` — regenerate rather than hand-edit.

| Count | Category | | Count | Category |
|---|---|---|---|---|
| 204 | Science & Engineering | | 29 | MrProphecy Arcade |
| 166 | Productivity & Lifestyle | | 29 | Museum & Collection |
| 94 | Finance & Money | | 21 | Virtual Worlds & Gaming |
| 73 | SaaS & Business Killers | | 19 | AI & Autonomous Agents |
| 71 | Writing & Language | | 17 | Mind-Blowing Demos |
| 69 | Algorithms & Computer Science | | 13 | Lucid Dreaming & Sleep |
| 64 | Mathematics | | 11 | Survival & Emergency Readiness |
| 55 | Sports | | 10 | Anime & Otaku Culture |
| 51 | Interactive Art & Living Worlds | | 10 | Aquatics & Fishkeeping |
| 48 | Health & Fitness | | 10 | Birdwatching & Ornithology |
| 42 | Home & DIY | | 10 | Dogs & Canine Care |
| 40 | Music & Audio | | 10 | Fire & Rescue Service |
| 36 | Astronomy & Space | | 10 | Natural Remedies & Herbs |
| 32 | Wellbeing & Community | | 10 | Trucking & Freight |
| 31 | Culinary & Food Science | | | |

Total: 1285 tools in 29 categories.
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

> **These rules are the design contract.** A "Visual Design Expert" staff role
> and a 54-check static audit (`scripts/design-audit.js`) used to enforce them;
> both were deleted with the staff machinery on 2026-09-20. The rules stay.
> Read this section before changing anything visual, and look at the hub pages
> in a browser at 360 px and 1440 px — no static check substitutes for that.

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
- **System font stack** (`Inter`, `system-ui`, `-apple-system`, `Segoe UI`)
  with graceful fallback. Webfonts must be self-hosted: the home page ships
  the Inter variable woff2 in `fonts/` (preloaded, `unicode-range` subsets,
  SIL OFL — see `fonts/OFL.txt`). No third-party font CDNs on that page.
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
- **Hero**: rebuilt 2026-09-21 around the brand, in this order — `.hero-brand`
  (the mark plus `THE MOST USEFUL SITE IN THE WORLD` in 0.8rem/800 with 0.14em
  of tracking), `h1.futuristic-title` (the promise, not the site's name:
  "Every tool you need, already in your browser.", `clamp(1.6rem,6.4vw,3.35rem)`,
  26ch, two balanced lines at every width), `.hero-subtitle`, the search field,
  the popular chips, then `.hero-facts` (a pulsing dot, the live tool count,
  the promise) and `.hero-keys`. The badge, its sheen animation (`titleSheen`)
  and the 🔍 glyph that used to sit in the search field are gone — the icon
  there is now an inline SVG that takes the accent colour. The catalogue's own
  emoji are untouched: a tool's emoji belongs to the tool.
- **One chip per emoji, in the hero and the section headings**: `.section-emoji`
  (30px, 9px radius) on the headings, `.cat-icon` (32-36px, 10px radius) on the
  28 category tiles. Flat emoji beside a flat heading is what makes a page look
  assembled rather than designed. The sticky-bar buttons, the panels and the
  tool rows keep their own emoji deliberately — those are controls and content,
  not headings.
- **The mark** (`.hero-mark`, `.footer-mark`) is `logo-mark.svg`, and it is the
  same drawing as the favicon, the PWA icons, the social card and every
  topbar's brand: one geometry in `brand/mark.py`, one generator
  (`brand/gen_assets.py`, which renders every raster from the SVG). It is **the
  finder** — the search console's two corner brackets holding a white
  four-point star on a dark tile, drawn out of the page's own chrome; it
  replaced the glossy "aperture" on 2026-09-24. The lockup beside it (mark,
  hairline, two-line caps wordmark with USEFUL in the accent) is the kit's
  `logo-lockup-*.svg` set in HTML. `logo-mark.svg` and `favicon.svg` are
  byte-identical, and `python3 brand/check-mark.py` (standard library only,
  run by `verify.sh --deep`) fails unless every shipped file is exactly
  mark.py's drawing. Edit the mark in `brand/`, never in the SVG.
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

`sitemap.xml` lists all 1197 indexable pages (including 1285 cards). Build it
from git rather than the working tree, so a sparse checkout does not silently
drop the card pages:

```python
import subprocess, datetime
base  = "https://www.themostusefulsiteintheworld.com"
today = datetime.date.today().isoformat()
# scan-seo.py scans every *.html in the repository root; cards/ are fragments
# by design and are skipped. 404.html is an error page, so its missing OG tags
# are a warning rather than a failure. There is no exclude set — the two files
# that used to need one (hokidea.html, a 145-byte scratch page with no <title>,
# and indexbeta.html, an unlinked beta catalogue) were deleted on 2026-09-20,
# which is also why the scan stopped printing their warnings.
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

### §6b. Embed licensing — the funnel, the keys, the guards

The licence product is fully static. The
moving parts:

- **`embed.html#pricing`** — the tiers: free-forever (credit line stays),
  £99/yr single tool, £299/yr category, £899/yr white-label. Tier CTAs are
  pre-filled `mailto:` enquiries; GA records `embed_copy`, `pricing_view`,
  `licence_enquiry`, `licence_key_valid/invalid` (GA is already allowed on this
  page). `embed.html?cat=<category>&tool=<slug>` deep-links into the catalogue
  filter — that is what the landing page links to.
- **The credit line is the price of the free tier.** Every snippet built by
  `embed.html` or `tool.html` carries a `[data-mus-credit]` element linking
  back to the tool. `scripts/check-finance.js` FAILS if either page stops
  emitting it — that is deliberate, do not weaken the check.
- **MUS1 licence keys** — `MUS1.<payload>.<signature>`, ECDSA P-256/SHA-256
  over `{v,d,t,e}` (domain, tier, expiry). CLI + library:
  `scripts/licence-keys.mjs` (`keygen|pubkey|sign|verify`). Browser issuer:
  `licence-admin.html` (owner-only, noindex, no analytics, private key in
  localStorage). A buyer pastes their key at `embed.html#activate`; snippets
  then embed a verifier that removes the credit line only on the licensed
  domain before expiry. Tamper-evident, not DRM. The owner must paste their
  PUBLIC JWK into `embed.html`'s `mus-licence-pubkey` meta once — until then
  activation is switched off and everything is the free credited tier.
- **`embed-finance.html`** — generated licence landing page for the finance
  vertical (`scripts/build-embed-landing.py`, `--check` in verify.sh). Counts,
  featured tools and the statutory-check figure are derived from
  `cards/cards.json` and `check-finance.js` at build time; never hand-edit.
- **Guards** — verify.sh §16 runs `check-finance.js` (maths + funnel honesty),
  §17 runs the licence-key tests and the landing-page freshness check.

---

## 7. Traps and gotchas

Each of these has already cost someone real time.

**`sw.js` registration traps** (resolved — `home-core.js` registers it from
the end of its init, during idle; these constraints still govern edits to it): it uses
**network-first for HTML** deliberately. Cache-first on
HTML is what makes a static site serve stale pages for days after a deploy. It
also adds precache entries individually rather than via `cache.addAll()`,
because `addAll()` is atomic — a single 404 aborts the whole install and the
worker never activates. The previous version had four 404s in its precache list
and could never have installed. Bump `CACHE_VERSION` on any change, and bump it
**together with** the `?v=` on `index.html`'s stylesheet and script references —
`scripts/check-critical-css.py` compares the two, because a page from one deploy
must never be served against another deploy's `home.css` or `explore.js`.

**The catalogue may never come from a stale cache.** The catalogue decides
which tools exist, so a cached copy that predates the deploy renders a grid
with tools missing — the visitor has no way to tell that from a bug. `sw.js`
therefore routes the catalogue tiers, the card fragments and first-party
code through `freshFast()`: the cached copy answers instantly only while it is
inside GitHub Pages' own 10-minute freshness window, after which the network
decides, with the cache as the fallback if the origin is slower than
`NETWORK_PATIENCE_MS` (2.5s) or unreachable. This replaced
stale-while-revalidate, which always handed over the previous deploy's copy and
only refreshed the cache for the *next* visit — so every newly added tool was
missing until the visitor happened to load the page twice.
`scripts/tests/service-worker.test.js` drives the shipped handler and fails if
a stale catalogue beats the deployed one.

**Nothing in `sw.js` may wait on the network forever.** v19 bounded the
navigations that already had a cached copy; v21 (2026-09-23) closed the rest
after the report came back — browse back and forth between the index and a few
tools and the tab hangs. Every first visit to a URL (each new `tool.html?card=*`
leg of exactly that browse) awaited the network with no bound, so one stalled
socket was a white screen forever. Past `UNCACHED_PATIENCE_MS` (8 s) an
uncached navigation now falls back to the cached index — the same fallback an
offline visit gets — and an uncached catalogue, fragment, script, font or
fallback fetch fails fast (503) so the page renders its error UI instead of
hanging; a navigation preload that never settles no longer stops the fetch
from starting, either. The pages match that contract from their side: the home
list's catalogue fetch carries its own 12 s abort window over headers *and*
body, a failed load re-arms instead of caching the rejection, and the empty
state offers a retry next to the directory link (`explore.js`); the toolbox's
lookup fetch has the same window and the same re-arm (`toolbox.js`).
`service-worker.test.js` drives the worker's bounds with a network that never
settles, and `explore-list.test.js` pins the list's timeout and retry.

**The precache list must only contain what the fetch handler reads from that
cache.** Entries are fetched with `cache: 'reload'` (bypassing the HTTP cache)
on install, so a URL that the handler serves out of `RUNTIME_CACHE` or
`CARDS_CACHE` is downloaded a second time per install — while the visitor is
still waiting for the first screen. The service-worker test asserts the list.

**The page's own code needs a second, differently-fetched precache list.**
`home.css`, `home-deferred.css`, `risk-notices.js`, `explore.css`, `explore.js`,
`toolbox.js` and `home-core.js` are fetched by a first visit *before* the worker controls
anything, so the worker's caches never saw them; the next visit offline then
served the cached `index.html` and 503'd its own stylesheet and script — an
unstyled page with no cards. Those seven URLs are therefore precached into
`STATIC_CACHE`, and the fetch handler serves them from there (`PAGE_ASSET_PATHS`
maps the versioned URL back to the bare pathname), so the precache is the copy
that gets read rather than a second download nobody looks at.

They are precached **without** `cache: 'reload'`, which is safe and free
because their URLs carry `?v=${PAGE_VERSION}`, derived from `CACHE_VERSION`:
a new deploy is a new URL, so no entry under them can be stale — and because
the URL is new, the HTTP cache cannot hold a wrong copy either, so the
precache reuses the response the page just downloaded instead of fetching
~200 KB a second time. Bump `CACHE_VERSION` (and, with it, the `?v=` that
`scripts/check-critical-css.py` compares) or a deploy quietly precaches the
previous version's code.

**`generate-cards-json.js` overwrites categories.** See §3.

**`index.html`'s link blocks are generated; never hand-edit inside the
markers.** `HOME-FEATURED`, `HOME-TRENDING` and `HOME-CATEGORIES` are written by
`scripts/build-home-prerender.py` and `bash scripts/verify.sh` fails until they
match the catalogue. The catalogue list itself is built at runtime from
`tools-index.json` and is not in the document at all — `sync-counts.py` owns
the two numbers on the page (`#heroToolCount`, `#exploreCount`).

**There is one search box per page and one place it goes.** Every search input
(the hero box, the sticky bar's, the list's own filter) is a view onto
`mpExplore.filter()`. `home-core.js` owns the bridge; it resolves boxes by id
(`#tool-search`, `#stickySearchInput`) and mirrors what it is typed into the
list. Two rules, both learned the hard way:

- **A new search box is an entry in the bridge, never a fresh
  `getElementById` sweeping the page.** The old page looked for `#mainSearchInput`
  on a page that shipped `#tool-search`, so on the real homepage every lookup
  returned null: the hero box never filtered anything, never synced with the
  command bar, and `/` threw on every press.
- **The list is the result surface.** There is no second results panel to keep
  in agreement with the list; a query filters the list and the browse sections
  (featured/trending/categories) step aside while it is on.

**`tools-index.json` is about 900 KB and it is every list's data.** The home page
fetches it when the visitor reaches the list (not at parse time), and
`tools.html` / `tools-index.html` / the category pages *contain* its output
already, so they never fetch it at all. It duplicates the
title/description/category the full catalogue tier carries (about 194 KB gzip
against the catalogue tier's 149 KB); de-duplicating it means a new signals file plus a drift
gate — worth doing deliberately or not at all, never half-way.

**The layout numbers live in one place now.** The geometry contract between JS
and CSS (`DENSITY` in `home-app.js` vs the mosaic block in `home.css`) died with
the grid: a list's row height is decided by the row's own content, and the only
size the engine assumes is `PAGE_SIZE = 60`. The park container, the warm-ahead
trickle and the per-frame load budget went with it — if any of those names come
back, so has the architecture this file's §3 documents the removal of.


**The grid's mechanisms are gone, and their traps with them.** Section 3 records
what was removed (the park, warm-ahead, the per-frame budget, the four density
machines). One habit outlives them: a container that a *running tool* measures
from must never be hidden with `display: none`, because a tool that sizes a
canvas from `clientWidth` reads zero and keeps it. Nothing on a list page runs
a tool, so the rule now applies to `tool.html` alone.
**Skipped boxes report what they were last shown.** With the UA's anchoring off,
this page has no second opinion about above-the-fold height changes — and every row
above the viewport is a `content-visibility: auto` box whose layout height is either
`contain-intrinsic-size` or the size it last rendered at, because the `auto` keyword
remembers. That is why `adjustCardHeight()`'s inline `min-height` is a contract and
not an optimisation: a row that has been rendered once carries its true height in the
document *while skipped*, so un-skipping it on the way back into view changes nothing
and cannot shove the reader. The one height a skipped row does not carry is a tool's,
which is why the park stores `data-parked-min-height` instead of re-measuring a
face, and why every host-side height change — `parkCard`, `resumeParked`, both mount
mutations, and `showCardError` — is a snapshot taken immediately before the mutation
and a `noteRowHeight` immediately after. `retryLoadCard()` is the one class flip with
no pair, on purpose: it re-tiles a card whose error block is still the content, so
there is no material delta, and the mount that follows is paired already.

**Top-level name collisions across cards.** Cards are fragments written for a
shared document: `tool.html` injects one at a time into its own page, so a
card's inline `<script>` declares into a global scope that outlives the card.
A global `let`/`const`/`class` cannot be undeclared, so a name two cards share
kills whichever loads second with `SyntaxError: Identifier 'X' has already been
declared` — the card renders and does nothing. `scripts/check-card-collisions.py`
is the guard, and it is exact (see its docstring). Ids are no longer a live
hazard now that only one card is mounted at a time, but prefix them anyway:
`scripts/check-cards.py` enforces it and it costs nothing.

**Sparse checkout gives false "broken image" results.** `images/` is ~50 MB and
usually excluded. Local tooling will report those images as 404. Always confirm
against the live site with `curl` before "fixing" a missing image — several
files reported broken locally are present and serving 200 in production.

**Filenames contain spaces and en-dashes.** e.g. `images/SOSMrWolfs 21.jpg`,
`images/carling academy, bristol.jpg`. Quote paths; URL-encode in HTML and XML.

**A literal `%` in a filename is served doubly-encoded.** A file whose name
stores a branch slash as `%2F` gets the published URL
`…/arena%252F01a0…json` — requesting it with a single `%2F` decodes to a
slash before routing and 404s on a file that exists (issue #91). Any tooling
that turns repo paths into URLs must encode each path segment; see
`encodeRelUrl()` in `scripts/check-production.js`.

---

## 8. Working on this repo

### Clone (the repo is large — always go sparse)

A full clone pulls ~125 MB, mostly `images/`.

```bash
chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519   # if using SSH

git clone --depth 1 --filter=blob:none --sparse \
    git@github.com:mrpr0phecy/mrpr0phecy.git r
cd r

# Music work (skip images and the 1285 cards):
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

# Card JavaScript, six questions. Does it parse at all; does every inline
# `on*=` handler resolve in the window scope it will run in AND compile as
# JavaScript (a full sweep found 37 attributes like `onclick="fn(), this)"`,
# which name a function that exists and are not code: the control is dead);
# does any card index two arrays of different lengths with the same index;
# does any button submit the form it sits in (fifteen cards, 109 buttons, whose
# clicks computed and then navigated to the tool's own URL, wiping the answer);
# and can the card start at all — a `document.readyState === 'loading'` guard
# with no `else` never runs in a document that finished loading before the
# fragment was injected, which is what tool.html does (forty-three cards, dead
# on arrival: tic-tac-toe rendered no board at all); and does anything the card
# adds to the document outlive it — a modal, a share dialog or a toast parked in
# document.body stays over the next tool, because tool.html clears the card's
# container and never the body (six toasts and ten audio wrappers shipped that).
# Each of the last four is there because a real card shipped the defect while
# every other check passed — creative-writing's 12/8/8 plot arrays, fitnesscore's
# "Calculate BMI" reloading the tool, and the sweep of 2026-09-23 that named the
# 43 dead cards.
# verify.sh runs all six on changed cards in the gate and over cards/ on
# --deep.
python3 scripts/check-card-js.py --all
node scripts/handler-check.js --all
node scripts/check-parallel-arrays.js --all
node scripts/check-form-buttons.js --all
node scripts/check-card-init.js --all
node scripts/check-card-leftovers.js --all

# Placeholders that must never ship
grep -rlE 'dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|YOUR_' --include=*.html .

# target=_blank missing rel=noopener
grep -oE '<a [^>]*target="_blank"[^>]*>' page.html | grep -v noopener

# Validate the sitemap parses
python3 -c "import xml.etree.ElementTree as E;print(len(list(E.parse('sitemap.xml').getroot())))"

# The hand-maintained surfaces no generator owns. `sync-counts.py` owns every
# category *number*; these own the *lists* — agents.html's JSON samples (the
# contract an outside agent parses) and the category enumerations in
# index.html's JSON-LD and the table above — and the *sizes* quoted in prose,
# which are checked rather than derived: a bare figure has to be right, a
# hedged one ("about 89 MB") may be 15% out.
python3 scripts/check-agents-docs.py
python3 scripts/build-category-lists.py --check
python3 scripts/check-size-claims.py
```

Headless browser checks (Playwright) are worth it for anything interactive:
assert zero `pageerror`s, zero images with `naturalWidth === 0`, and that
expected elements exist.

### Verify after pushing

Pages takes 30–60s. Do not trust a green push. The **production monitor**
(`scripts/check-production.js`) does this loop properly: it compares the
deployed bytes with this repository, parses the live catalogue and sitemap,
checks the custom 404 and the https upgrade, and raises one alert issue when
anything stops matching.

```bash
node scripts/check-production.js            # full contract against the live site
node scripts/check-production.js --sample 12 --json /tmp/report.json
```

It runs by itself on every push to `main` — waiting 45 s for Pages and then
retrying mismatches for about a minute, so propagation is not an alarm — and
every six hours (`.github/workflows/production-monitor.yml`), and its failure
modes are pinned
offline by `scripts/tests/production-monitor.test.js` (section 20 of
`verify.sh`). What to do when it fails is in
[docs/OPERATIONS.md](docs/OPERATIONS.md) — triage table, rollback, fix-forward.
Keep the manual probes for the case where the monitor itself cannot run:

```bash
sleep 50
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

---

## 9. Current state

1285 tools in `cards/` across 29 categories, one shared DOM, every derived
surface regenerated by `npm run build`. The gate is `npm run verify`, with
`npm run verify:deep` before a push — which is also what CI runs on every push
and PR (timings: AGENTS.md §1).

**Do not delete or rename:** `CNAME` (the custom domain), `sw.js` (the live
service worker — `home-core.js` registers it on every list page), the CV files,
`opensourcenews.html`, `token.html`, or any tool in `cards/`. Adding is free;
retiring is an owner decision.

Deleted on 2026-09-20 with the owner's approval, after confirming that no page,
no sitemap entry and no robots rule referenced them: `indexbeta.html`,
`hokidea.html`, `guide.txt` (69 KB of notes this document superseded),
`substitutions/`, `system/` and `digitaldetoxcardshtml/`. They are in git
history if anybody ever wants them back.

This section used to be a 725-line dated changelog — "Added 2026-09-02, ten new
Home & DIY tools…", "Changed 2026-09-18, the main page is a live window…" — and
it was removed on 2026-09-20. `git log` is the changelog. The narrative copy
went stale in place: it cited deleted files, repeated the same rework four
times, and had to be *frozen* against `scripts/sync-counts.py` so its
past-tense counts (562, 622, 1128) would not be "corrected" into lies. History
belongs in git; this file describes the site as it is.

---

## MostUsefulMaps (`maps.html`)

`maps.html` is the site's own map: an open-data alternative to the big map
products, built so the catalogue's tools can use it too.

- The engine lives in `maps/core/` and is dependency-free: WGS84 geodesics,
  Plus Codes, OS grid references, NOAA sun times, offline place search.
- Two renderers, on purpose: `maps/localmap.js` draws Natural Earth boundaries
  on a canvas with no library and no network (and is what every card uses), and
  `maps/livemap.js` layers MapLibre GL with OpenFreeMap's OpenStreetMap vector
  tiles on top when the visitor is online. Failure of the live layer is
  invisible: the offline map was already there.
- `maps/embed.js` exposes `window.MostUsefulMaps` so any card can drop in a
  map (`MostUsefulMaps.mount(...)`) or borrow the maths
  (`distance`, `measure`, `plusCode`, `sunTimes`, `parse`, `searchPlaces`).
  Nothing loads until a card asks: the map layer is a few hundred KB, and no
  page should pay for it merely because a card might want a map.
- `maps/core/speed.js` and `maps/core/drive.js` are the driving layer: a
  vehicle-aware speed-limit engine (OSM `maxspeed`/`maxspeed:type`, national
  default tables per vehicle, the Welsh 20 mph default, every answer carrying
  its basis) and a navigation session that runs entirely on the device
  (progress, manoeuvres, off-route detection, ETA, breaks, sun glare, trip log,
  GPX). Guidance consults no service once the route is loaded, so a dead spot,
  a tunnel or a border costs nothing.
- `MM.providers.driveRoute` adds Valhalla to the routing chain for the Drive
  tab (vehicle dimensions, route shape, avoid preferences, alternatives), with
  the OSRM chain behind it and a labelled straight line behind that. The Route
  tab uses those open profiles for driving, cycling and walking, with
  fastest/shortest/quieter choices, explicit avoid preferences and any
  alternatives the router returns. A real route in any of the three modes can
  feed the same on-device guidance session. Speed limits come from Overpass,
  traffic only from a key-free feed that exists (TfL, London), weather from
  Open-Meteo at the hour you reach each sampled point. Where no key-free feed
  exists the page says so rather than estimating: national timings are labelled
  free-flow everywhere outside London.
- Selecting a place also enables a compact enrichment layer in the place card:
  Open-Meteo Air Quality gives a modelled European AQI and pollutants,
  Environment Agency returns nearby England-focused flood warnings, Wikimedia
  Commons supplies geotagged cultural thumbnails with individual credit and
  licence links, and KartaView supplies optional historical user-contributed
  street imagery with capture dates. All four are coordinate-and-radius
  requests made only after selection, cached and labelled; absence is never
  presented as safety, coverage or completeness.
- Provenance, licences, the provider list, the driving layering, the offline
  matrix and the limits of what CI can test are in `docs/MAPS.md`.
