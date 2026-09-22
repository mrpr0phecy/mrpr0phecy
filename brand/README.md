# brand/ — where the logo comes from

Everything a visitor recognises as this site — the mark in the tab, the icons
on a phone's home screen, the logo in the hero, the social card — is generated
from **one geometry** in this folder. Nothing draws it by hand, and no page
carries its own copy.

```
brand/mark.py         the drawing: geometry, palette, and the rasteriser
brand/gen_assets.py   writes every shipped asset into the repository root
brand/check-mark.py   proves the SVG and the rasters are the same drawing
brand/measure.py      measures the hero's text against the CSS clamps
```

## The drawing

A white magnifier whose lens holds a four-point spark, on the site's own accent
gradient (`#6ff0ff → #2dd4ff → #2f6bff`). Search is what the product does; the
spark is the answer it hands back. The tile keeps a small safe margin inside
the lens for the spark, which is why the glyph sits slightly up and to the left
of centre.

`mark.py` holds every number. Change `TILE_RADIUS`, `SPARK_WAIST`, `GRADIENT`
or any of the rest, regenerate, and every size follows — vector and raster.

## Regenerating

The site is zero-dependency and stays that way: **do not install anything into
this repository**. Use a scratch virtualenv outside it.

```bash
python3 -m venv /tmp/brandenv
/tmp/brandenv/bin/pip install pillow fonttools numpy

/tmp/brandenv/bin/python brand/gen_assets.py     # rewrites the assets
python3 brand/check-mark.py                      # stdlib only — must pass
python3 brand/measure.py                         # needs fonttools
python3 brand/measure.py --strings               # no fonttools: show what it measures
python3 brand/measure.py --check                 # no fonttools: assert it still reads it
```

`measure.py` reads the hero copy — wordmark, headline, subtitle, facts row,
keyboard hints, placeholder — **out of `index.html`** rather than holding its
own copies. It used to hold copies, and two of them went stale (`1220 tools`
against a page that said 1250), which meant it measured a hero the site did not
have and reported widths for it. If the page is restructured so a string cannot
be found, it exits non-zero and says which one: fix the tool, do not paste the
string back. `--check` is the fonttools-free version of that assertion, and
`verify.sh --deep` runs it.

`gen_assets.py` writes these into the repository root, next to the pages that
link them:

| file | linked by |
|---|---|
| `logo-mark.svg`, `favicon.svg` | every page (`favicon.svg`); `index.html`'s hero and footer lockup (`logo-mark.svg`) |
| `favicon.ico` | every page, after the SVG |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `manifest.json`, `manifest.tools.json`, `apple-touch-icon` |
| `apple-touch-icon.png` | `index.html` |
| `og-brand.png` | `index.html`'s `og:image` / `twitter:image` |
| `og-tools.png` | every other page's social card |
| `logo.png` | nothing — the press/kit lockup, kept deliberately |

The two SVGs are **byte-identical on purpose**: one file, two names, because
pages link `logo-mark.svg` while browsers and tooling look for `favicon.svg`.
`check-mark.py` fails if they ever drift apart.

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

## Checking it without a browser

`check-mark.py` is standard-library only and catches the drift that would
otherwise be invisible until somebody compared a screenshot with a tab icon:
the SVG's corner radius, gradient stops, lens, handle, glyph scale and the
spark's curve are each compared against `mark.py`'s constants.

It is not wired into `scripts/verify.sh` — that gate is deliberately seven
checks, and this only matters when somebody touches the brand. Run it by hand
after any change here or to the assets.
