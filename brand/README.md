# brand/ — where the logo comes from

Everything a visitor recognises as this site — the mark in the tab, the icons
on a phone's home screen, the lockup in the hero, the brand in every page's
topbar, the social card, the one-colour reduction a printer asks for — is
generated from **one geometry** in this folder. Nothing draws it by hand, and no
page carries its own copy.

```
brand/mark.py         the drawing: geometry, palette, and the SVG (stdlib only)
brand/gen_assets.py   writes every shipped asset into the repository root
brand/check-mark.py   proves every shipped file is still mark.py's drawing
brand/spec.py         writes brand/spec.html — the printable spec sheet
brand/measure.py      measures the hero's text against the CSS clamps
```

## The drawing

**The finder.** A dark tile; the two cyan corner brackets of the home page's
search console, top-left and bottom-right, exactly where `.hero-command` draws
them; and a white four-point star held between them. The brackets are the
thing that finds, the star is what it finds — the one tool you came for.

It is drawn *out of* the page rather than on top of it. The tile is the
console's surface (a vertical dark gradient) with the console's accent hairline
for an edge; the brackets are the console's corners — square-cut like the CSS
borders that draw them, with the same rounded joint; the star has straight
sides, a compass glint rather than a soft sparkle. Contrast is what carries it
at 16 px: on the tile's lightest stop the brackets are 9:1 and the star 16:1.

**Why it was redrawn (2026-09-24, the second time that day).** The morning's
"aperture" — an ink magnifier holding a curvy spark on a glossy cyan-to-blue
tile, with a glow — fixed the old mark's 16 px legibility, but it did not
belong to the site it sat on. The home page is a dark instrument panel:
hairlines, mono readouts, a tick scale, bracketed corners. The logo was the one
bright, glossy, rounded object on it, and a magnifier-plus-sparkle is also the
generic "AI search" icon. Rejected on the way here, so nobody retries them:
four corner brackets (reads as a QR/screenshot icon), brackets on the tile's
edge (Android and iOS masks clip them), a curvy spark (the Gemini sparkle), a
vertically stretched star (a cross at 16 px), round caps (softer, less
instrument), reticle ticks (sub-pixel at 16 px), and anything white on a bright
gradient (1.3:1).

`mark.py` holds every number. Change `BRACKET_INSET`, `SPARK_WAIST`,
`EDGE_OPACITY` or anything else, regenerate, and every file follows.

## One drawing, every file

**Every raster is rendered from the SVG** (resvg, in `gen_assets.py`), so a PNG
cannot become a different drawing from the vector — there is no second
rasteriser to keep in step. The one-colour reduction is the same brackets and
star in one colour with no tile; nothing is knocked out, so it is the primary
glyph exactly. The maskable icon is the full-bleed surface with the glyph at
`MASKABLE_SCALE`, which keeps the brackets' joints inside the 80 % safe circle
a launcher may crop to.

**Every word is an outline**, set with HarfBuzz (real kerning) in the site's own
Inter, instanced from `fonts/inter-latin.woff2` on the fly. The lockups need no
font installed — a lockup that reflows in a fallback face is not a lockup — and
the social card's type is the page's type. The card's headline is read out of
`index.html`'s `<h1>`, so the card cannot disagree with the page.

The **lockup** is the mark, a hairline, and the wordmark on two lines —
`THE MOST USEFUL / SITE IN THE WORLD`, Inter 800 caps with 0.14em tracking,
*USEFUL* in the accent. The home page's hero and footer set the same lockup in
HTML (`.hero-wordmark` / `.footer-wordmark` with `.wm-line` and `.wm-accent`).

## Regenerating

The site is zero-dependency and stays that way: **do not install anything into
this repository**. Use a scratch virtualenv outside it.

```bash
python3 -m venv /tmp/brandenv
/tmp/brandenv/bin/pip install pillow fonttools brotli uharfbuzz resvg-py

/tmp/brandenv/bin/python brand/gen_assets.py     # rewrites every asset (~4 s)
python3 brand/spec.py                            # rewrites brand/spec.html (stdlib)
python3 brand/check-mark.py                      # stdlib only — must pass
/tmp/brandenv/bin/python brand/measure.py        # needs fonttools
python3 brand/measure.py --check                 # stdlib: it can still read the hero
```

`brotli` is there because Inter ships as a `.woff2`; `uharfbuzz` shapes the
text; `resvg-py` renders the SVGs; Pillow packs the ICO and writes the PNGs.

If the mark changes, the pages must be told: bump `?v=` in `index.html`,
`APP_VERSION` in `home-core.js` and `CACHE_VERSION` in `sw.js` together
(`scripts/check-critical-css.py` fails if they disagree), then `npm run build`.

`gen_assets.py` writes these into the repository root, next to the pages that
link them:

| file | linked by |
|---|---|
| `logo-mark.svg`, `favicon.svg` | every page (`favicon.svg`); the hero, footer and sticky bar, `tool.html` and every topbar (`logo-mark.svg`) |
| `favicon.ico` | every page, after the SVG |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `manifest.tools.json` — and `manifest.json`, the music app's manifest, which borrows them (see below) |
| `apple-touch-icon.png` | `index.html` |
| `logo-mark-mono-dark.svg`, `logo-mark-mono-light.svg` | nothing — the reductions for print, embeds and light surfaces |
| `logo-lockup-dark.svg`, `logo-lockup-light.svg` | nothing — the lockup, wordmark as outlines |
| `og-brand.png` | `index.html`'s `og:image` / `twitter:image` |
| `og-tools.png` | every other page's social card (the same image) |
| `logo.png` | nothing — the 1024² stacked lockup, for press and profiles |

`manifest.json` belongs to the MrProphecy music app but points at these icons,
so the music PWA's home-screen icon is the tools' mark. That was true of every
previous mark too; whether it should get its own is the owner's call.

## Two rules that are easy to break

* **No tool count in any image.** `scripts/sync-counts.py` owns every published
  number and cannot re-derive a PNG, so a count baked into the social card goes
  stale the moment a tool is added. The card carries the promises instead
  (`no ads · no accounts · no sign-ups · no paywalls`).
* **Generated pages get the mark from their generator**, never by hand: the
  `<link rel="icon">` tags from `scripts/build-tool-pages.py`,
  `scripts/build-category-pages.js` and `scripts/generate-ai-index.js`, and the
  topbar brand from `build-tool-pages.py`, `build-category-pages.js` and
  `build-embed-landing.py`. Change it there, then `npm run build`.

Pages that are a *different product* keep their own marks and should not be
"unified" without the owner saying so: `maps.html` (MostUsefulMaps),
`supaviewer.html` (SupaViewer) and `sync.html` (MrProphecy licensing).
`ai.html` is Lantern, which has its own identity *and* its own six-step
hierarchy — a walkthrough, not a logo (`scripts/evaluate-lantern.js` owns it).

## The spec sheet

`brand/spec.html` is generated by `brand/spec.py` and answers "how may I use
this logo?": construction, clear space, minimum sizes, the colour rules
(including why `#2dd4ff` is for fills and rules but `#0a7ea4` is the accent for
text on light surfaces — the previous spec's `#1aa3cc` was 2.9:1 and never
passed), the lockups, the file table and a what-not-to-do list. Every image in
it is the shipped file, embedded, and every ratio is computed. Nothing on the
site links it; open it and print to PDF for the press version.

## `measure.py`

`measure.py` reads the hero copy — wordmark lines, headline, subtitle, facts
row, keyboard hints, placeholder — **out of `index.html`** rather than holding
its own copies. It used to hold copies, and two of them went stale (`1220
tools` against a page that said 1250), which meant it measured a hero the site
did not have. If the page is restructured so a string cannot be found, it exits
non-zero and says which one: fix the tool, do not paste the string back.
`--check` is the fonttools-free version of that assertion, and `verify.sh
--deep` runs it.

## Checking it without a browser

`check-mark.py` runs in `verify.sh --deep` and costs a third of a second. It
fails if: `logo-mark.svg`, `favicon.svg` or a mono file is not byte-for-byte
what `mark.py` draws today; a lockup is malformed, sets its wordmark as text,
or stops carrying the exact mark; a PNG sampled where the geometry puts the
star, a bracket, the tile or the corner shows something else (decoded with
`zlib`, no Pillow); an icon has the wrong size or opacity; the maskable glyph
leaves the safe circle; or a colour rule stops holding. After a deliberate
change to `mark.py`, the fix is to regenerate, not to edit the check.
