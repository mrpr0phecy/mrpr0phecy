# brand/ — where the logo comes from

Everything a visitor recognises as this site — the mark in the tab, the icons
on a phone's home screen, the logo in the hero, the social card, the one-colour
reduction a printer asks for — is generated from **one geometry** in this
folder. Nothing draws it by hand, and no page carries its own copy.

```
brand/mark.py         the drawing: geometry, palette, and the rasteriser
brand/gen_assets.py   writes every shipped asset into the repository root
brand/check-mark.py   proves the SVGs and the rasters are the same drawing
brand/spec.py         writes brand/spec.html — the printable spec sheet
brand/measure.py      measures the hero's text against the CSS clamps
```

## The drawing

An **aperture**: an ink disc at the optical centre of the tile, a white
four-point **spark** inside it, and an ink **needle** to the bottom-right. The
needle is what makes it read as *search*; the spark is the answer; the disc is
the aperture the answer arrives through. The tile keeps a quarter of its own
width as clear space on every side, so the glyph is centred and the mark sits
in a row of other logos without looking like it is leaning.

The glyph is **ink on the accent gradient** (`#6ff0ff → #2dd4ff → #2f6bff`),
never white on it. That is the whole reason for the 2026-09-24 redraw:

| | white on the gradient's lightest stop | ink (`#071019`) on it |
|---|---|---|
| contrast | **1.3 : 1** | **14.2 : 1** |

The old mark was a white magnifier whose lens held the spark, and at 16 px —
which is what a browser actually renders in the tab — its white ring dissolved
into the tile and the icon read as a grey smudge on a blue square. The interior
was a translucent fill (`rgba(7,21,44,0.65)`) which tinted toward the tile
instead of staying dark. Both are fixed by drawing the glyph in ink on an
opaque disc; `brand/spec.py` computes those two ratios rather than asserting
them, so a palette change cannot leave a stale claim on the spec page.

**The reticle ticks were drawn and then removed the same day.** Four short bars
outside the disc at N/E/S/W made the mark read as an instrument at 24 px and
above, but at 16 px a 1.35-unit bar is under a pixel wide: four grey smudges
around the disc, which is the exact defect the redraw set out to remove. A tab
and a hero render the *same file*, so the canonical drawing has no ticks and the
instrument feel lives in the page's own chrome, where it scales.

`mark.py` holds every number. Change `TILE_RADIUS`, `RING_STROKE`, `SPARK_WAIST`,
`NEEDLE_TO` or anything else, regenerate, and every size follows — vector and
raster.

## Two drawings, one geometry

The **mono reduction** is the same geometry with the disc drawn as a ring
(`RING_STROKE`) instead of a filled disc, so it needs no knockout: same centre,
same radius, same spark, same needle. That is the entire difference between
`logo-mark.svg` and `logo-mark-mono-*.svg`, and `check-mark.py` asserts it — the
mono files are not a separate drawing that can drift.

## Regenerating

The site is zero-dependency and stays that way: **do not install anything into
this repository**. Use a scratch virtualenv outside it.

```bash
python3 -m venv /tmp/brandenv
/tmp/brandenv/bin/pip install pillow fonttools numpy brotli

/tmp/brandenv/bin/python brand/gen_assets.py     # rewrites the assets
/tmp/brandenv/bin/python brand/spec.py           # rewrites brand/spec.html
python3 brand/check-mark.py                      # stdlib only — must pass
python3 brand/measure.py                         # needs fonttools
python3 brand/measure.py --strings               # no fonttools: show what it measures
python3 brand/measure.py --check                 # no fonttools: assert it still reads it
```

`brotli` is only needed because Inter ships as a `.woff2`; without it fonttools
cannot open the font and the wordmark cannot be set.

`measure.py` reads the hero copy — wordmark, headline, subtitle, facts row,
keyboard hints, placeholder — **out of `index.html`** rather than holding its
own copies. It used to hold copies, and two of them went stale (`1220 tools`
against a page that said 1250), which meant it measured a hero the site did not
have and reported widths for it. If the page is restructured so a string cannot
be found, it exits non-zero and says which one: fix the tool, do not paste the
string back. `--check` is the fonttools-free version of that assertion, and
`verify.sh --deep` runs it.

`check-mark.py` is wired into `verify.sh --deep` (the 2026-09-24 redraw changed
every number in `mark.py` at once, which is exactly when six raster files and
six SVG files can quietly stop being the same drawing), and it costs nothing:
standard library only, no rendering.

`gen_assets.py` writes these into the repository root, next to the pages that
link them:

| file | linked by |
|---|---|
| `logo-mark.svg`, `favicon.svg` | every page (`favicon.svg`); `index.html`'s hero and footer lockup (`logo-mark.svg`) |
| `favicon.ico` | every page, after the SVG |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `manifest.json`, `manifest.tools.json`, `apple-touch-icon` |
| `apple-touch-icon.png` | `index.html` |
| `logo-mark-mono-dark.svg`, `logo-mark-mono-light.svg` | nothing yet — the reductions for print, embeds and any light surface |
| `logo-lockup-dark.svg`, `logo-lockup-light.svg` | nothing yet — mark + wordmark, wordmark as outlines, no font needed |
| `og-brand.png` | `index.html`'s `og:image` / `twitter:image` |
| `og-tools.png` | every other page's social card |
| `logo.png` | nothing — the press/kit lockup, kept deliberately |

The two SVGs are **byte-identical on purpose**: one file, two names, because
pages link `logo-mark.svg` while browsers and tooling look for `favicon.svg`.
`check-mark.py` fails if they ever drift apart.

The lockup SVGs carry the wordmark as **outlines converted from the shipped
Inter**, not as `<text>` with a `font-family`. A lockup that reflows in a
fallback face is not a lockup, and a press PDF or a partner's slide deck will
not have Inter. `check-mark.py` fails if a `<text>` element or a `font-family`
ever appears in one.

The rasters are drawn at 8× and box-filtered down. The wordmark is set in the
site's own self-hosted Inter, instanced to static weights on the fly.

## Two rules that are easy to break

* **No tool count in any image.** `scripts/sync-counts.py` owns every published
  number and cannot re-derive a PNG, so a count baked into the social card goes
  stale the moment a card is added. The cards carry the promises instead
  (`no ads · no accounts · no sign-ups · no paywalls`).
* **Generated pages get the icon from their generator**, never by hand:
  `scripts/build-tool-pages.py`, `scripts/build-category-pages.js` and
  `scripts/generate-ai-index.js` each emit the two `<link rel="icon">` tags.
  Change it there, then `npm run build`.

Pages that are a *different product* keep their own marks and should not be
"unified" without the owner saying so: `maps.html` (MostUsefulMaps),
`supaviewer.html` (SupaViewer) and `sync.html` (MrProphecy licensing).

`ai.html` is Lantern, which has its own identity *and* its own six-step
hierarchy — a walkthrough, not a logo (`scripts/evaluate-lantern.js` owns it).

## The spec sheet

`brand/spec.html` is generated by `brand/spec.py` and is the answer to "how may
I use this logo?": clear space, minimum sizes, the colour rules (including why
`#2dd4ff` is for fills and rules but `#1aa3cc` is the accent for text on light
surfaces), the file table, and a what-not-to-do list. Nothing on the site links
it. Open it in a browser and print to PDF for the press version.

## Checking it without a browser

`check-mark.py` catches the drift that would otherwise be invisible until
somebody compared a screenshot with a tab icon: the tile's corner radius, the
gradient stops, the aperture's centre and radius, the ink colour, the needle,
the ring the mono files use instead of the disc, the glyph's spark curve, the
sheen — and the two lockups existing, being well-formed, and carrying their
wordmark as paths rather than text.

```bash
python3 brand/check-mark.py     # instant; also runs in verify.sh --deep
```
