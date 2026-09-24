#!/usr/bin/env python3
"""spec.py — write brand/spec.html, the printable brand sheet.

    python3 brand/spec.py            # needs Pillow + numpy (see brand/README.md)

The sheet is generated rather than drawn by hand for the same reason the icons
are: a spec that says "minimum size 16 px" while `mark.py` says something else
is worse than no spec. Every number, colour and file name below is read out of
`mark.py`, `gen_assets.py` and the assets themselves, and the mark at every size
on the page is rendered live from the same code that writes the shipped PNGs.

It is not linked from anywhere on the site — it is for whoever needs to use the
logo (a partner, a print job, a press page), and for the next person who opens
`brand/` and wants to know what the rules are without reading mark.py.

Open it in a browser and print to PDF for the press version.
"""
from __future__ import annotations

import base64
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import mark as M
import gen_assets as G

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "brand", "spec.html")


def data_uri(image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def contrast(a, b) -> float:
    """WCAG contrast ratio between two colours — the numbers on the sheet are
    computed, not asserted, so a palette change cannot leave a stale claim."""
    def lum(c):
        out = []
        for channel in c[:3]:
            v = channel / 255
            out.append(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4)
        return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> None:
    gradient = [c for _, c in M.GRADIENT]
    tile_light = gradient[0]          # the worst case for white-on-tile
    ink_vs_tile = contrast(M.INK, tile_light)
    white_vs_tile = contrast((255, 255, 255), tile_light)
    white_vs_ink = contrast((255, 255, 255), M.INK)

    sizes = [16, 24, 32, 48, 64, 96, 128, 192, 256]
    marks = "".join(
        f'<figure><img src="{data_uri(M.render_mark(s))}" width="{s}" height="{s}" alt="{s} px">'
        f'<figcaption>{s}</figcaption></figure>' for s in sizes)
    mono = "".join(
        f'<figure class="mono-light"><img src="{data_uri(M.render_monochrome(s, M.INK))}" '
        f'width="{s}" height="{s}" alt="{s} px"></figure>' for s in sizes)
    mono_dark = "".join(
        f'<figure class="mono-dark"><img src="{data_uri(M.render_monochrome(s, G.PAPER))}" '
        f'width="{s}" height="{s}" alt="{s} px"></figure>' for s in sizes)

    # Clear space: the wordmark's cap height is the unit, and the mark's own
    # glyph gives the same margin for the standalone mark — a quarter of the
    # tile, which is what makes a row of logos line up.
    clear = M.BOX * 0.25

    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand spec — The Most Useful Site in the World</title>
<style>
  :root {{ color-scheme: light dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #0a0f14; color: #e6faff; }}
  main {{ max-width: 1000px; margin: 0 auto; padding: 48px 24px 96px; }}
  h1 {{ font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 6px; }}
  h2 {{ font-size: 1.15rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 56px 0 14px;
        color: #2dd4ff; font-family: ui-monospace, monospace; }}
  p, li {{ color: rgba(230, 250, 255, 0.82); }}
  .lede {{ color: rgba(230, 250, 255, 0.62); margin-top: 0; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 0.92rem; }}
  th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }}
  th {{ color: rgba(230,250,255,0.6); font-weight: 600; }}
  code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;
          background: rgba(255,255,255,0.07); padding: 1px 5px; border-radius: 4px; }}
  .row {{ display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; padding: 20px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }}
  figure {{ margin: 0; text-align: center; }}
  figcaption {{ font-size: 0.7rem; color: rgba(230,250,255,0.5); margin-top: 4px;
                font-family: ui-monospace, monospace; }}
  .mono-light {{ background: #f8fafc; padding: 10px; border-radius: 8px; }}
  .mono-dark {{ background: #0a0f14; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); }}
  .swatches {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  .swatch {{ flex: 1 1 150px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); }}
  .swatch div:first-child {{ height: 68px; }}
  .swatch div:last-child {{ padding: 8px 10px; font-size: 0.78rem; font-family: ui-monospace, monospace;
                            background: rgba(0,0,0,0.35); }}
  .clearspace {{ position: relative; display: inline-block; padding: {clear / M.BOX * 96:.0f}px;
                 outline: 1px dashed rgba(45,212,255,0.6); }}
  .no {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }}
  .no div {{ padding: 14px; border: 1px solid rgba(255,120,120,0.35); border-radius: 10px;
             background: rgba(255,80,80,0.06); font-size: 0.88rem; }}
  .yes {{ border-color: rgba(120,255,180,0.35) !important; background: rgba(80,255,150,0.05) !important; }}
  @media print {{ body {{ background: #fff; color: #111; }} h2 {{ color: #1aa3cc; }}
                  p, li, th {{ color: #333; }} .row {{ background: #f6f8fa; }} }}
</style>
</head>
<body>
<main>
  <h1>The Most Useful Site in the World — brand spec</h1>
  <p class="lede">Generated by <code>brand/spec.py</code> from <code>brand/mark.py</code>.
     Every number and every image below comes out of the same code that writes the
     shipped icons, so this page cannot describe a logo the site does not have.</p>

  <h2>01 · The mark</h2>
  <p>An <strong>aperture</strong>: an ink disc at the optical centre of the tile, a white
     four-point <strong>spark</strong> inside it — the answer — and an ink <strong>needle</strong> to the
     bottom-right, which is what makes the whole thing read as search. The glyph is ink on the
     accent gradient, never white on it: white over the gradient's lightest stop measures
     {white_vs_tile:.1f}:1, which is why the previous mark dissolved into a grey smudge at
     16 px. Ink over the same stop is {ink_vs_tile:.1f}:1.</p>
  <div class="row">{marks}</div>

  <h2>02 · Clear space</h2>
  <p>One quarter of the tile — <code>{clear:.2f}</code> of its own 32 units — on all four sides.
     Nothing enters that box, ever.</p>
  <div class="row"><div class="clearspace"><img src="{data_uri(M.render_mark(96))}" width="96" height="96" alt="the mark with its clear space"></div></div>

  <h2>03 · Minimum size</h2>
  <table>
    <tr><th>Use</th><th>Minimum</th><th>File</th></tr>
    <tr><td>Screen</td><td><strong>16 px</strong> (the favicon)</td><td><code>favicon.svg</code> / <code>favicon.ico</code></td></tr>
    <tr><td>Print</td><td>8 mm wide</td><td><code>logo-mark-mono-dark.svg</code></td></tr>
    <tr><td>App / PWA icon</td><td>192 px</td><td><code>icon-192.png</code> … <code>icon-512.png</code></td></tr>
  </table>
  <p>16 px is the line the drawing was designed to: the disc, the spark and the needle still read
     as three things at that size and nothing else is added. Anything below it is a crop, not a logo.</p>

  <h2>04 · One colour</h2>
  <p>When the tile cannot be used — one-colour print, a light background, a partner's layout, an
     emboss — the mark is the same geometry with the disc drawn as a ring
     (<code>{M.RING_STROKE:g}</code> units) so it needs no knockout. Reductions are the mark, not a
     redraw: same centre, same needle, same spark.</p>
  <div class="row">{mono}</div>
  <div class="row">{mono_dark}</div>

  <h2>05 · Colour</h2>
  <div class="swatches">
    <div class="swatch"><div style="background:#6ff0ff"></div><div>#6ff0ff<br>gradient 0%</div></div>
    <div class="swatch"><div style="background:#2dd4ff"></div><div>#2dd4ff<br>accent / gradient 42%</div></div>
    <div class="swatch"><div style="background:#2f6bff"></div><div>#2f6bff<br>gradient 100%</div></div>
    <div class="swatch"><div style="background:#071019"></div><div>#071019<br>ink (the glyph)</div></div>
    <div class="swatch"><div style="background:#0a0f14"></div><div>#0a0f14<br>page background</div></div>
    <div class="swatch"><div style="background:#1aa3cc"></div><div>#1aa3cc<br>accent for text on light</div></div>
  </div>
  <p>White on the ink disc is {white_vs_ink:.1f}:1. The accent <code>#2dd4ff</code> is for
     <em>fills and rules only</em> — as text on a light background it fails, so light surfaces use
     <code>#1aa3cc</code>, which is the same hue darkened until it passes.</p>

  <h2>06 · Files</h2>
  <table>
    <tr><th>File</th><th>What it is</th><th>Minimum size</th></tr>
    <tr><td><code>logo-mark.svg</code> / <code>favicon.svg</code></td><td>the mark, vector — one file, two names (a browser looks for the second)</td><td>16 px</td></tr>
    <tr><td><code>favicon.ico</code></td><td>16 / 32 / 48 px, for tabs and pinned shortcuts</td><td>—</td></tr>
    <tr><td><code>icon-192.png</code>, <code>icon-512.png</code></td><td>PWA, Android, store listings</td><td>192 px</td></tr>
    <tr><td><code>icon-maskable-512.png</code></td><td>Android's circular crop (<code>inset 0.17</code>)</td><td>—</td></tr>
    <tr><td><code>apple-touch-icon.png</code></td><td>180 px, opaque because iOS flattens transparency onto black</td><td>—</td></tr>
    <tr><td><code>logo-mark-mono-dark.svg</code> / <code>-light.svg</code></td><td>one colour, <code>#071019</code> / <code>#ffffff</code></td><td>8 mm print</td></tr>
    <tr><td><code>logo-lockup-dark.svg</code> / <code>-light.svg</code></td><td>mark + wordmark, wordmark as outlines so no font is needed</td><td>28 mm print</td></tr>
    <tr><td><code>og-brand.png</code> / <code>og-tools.png</code></td><td>the 1200×630 social card</td><td>—</td></tr>
    <tr><td><code>logo.png</code></td><td>1024² press lockup</td><td>—</td></tr>
  </table>
  <p>The wordmark is Inter 800 with <code>+0.14em</code> tracking, in caps. Inside the lockup it is
     outlines of the site's own self-hosted Inter, converted by <code>gen_assets.py</code> — never
     live text, because a lockup that reflows in a fallback face is not a lockup.</p>

  <h2>07 · What not to do</h2>
  <div class="no">
    <div>Don't recolour the tile. It is the site's own accent gradient, and a second gradient is a second brand.</div>
    <div>Don't put the mark on a mid-tone without the tile or the mono reduction — the ink disc needs either the gradient or a plain surface.</div>
    <div>Don't rotate, squash, outline, bevel or animate the mark. The only motion anywhere near it is the hero's live dot, which is not part of the logo.</div>
    <div>Don't add a tool count, a tagline or a stroke to a lockup — counts live in one generated place and cannot be re-derived inside an image.</div>
    <div class="yes">Do use the mark on its own, at 16 px, with its clear space, and nothing else in the tile.</div>
    <div class="yes">Do use <code>og-tools.png</code> for every page's social card so a shared link looks like the site.</div>
  </div>

  <h2>08 · Changing it</h2>
  <p>Edit the numbers in <code>brand/mark.py</code>, then:</p>
  <table>
    <tr><td><code>python3 brand/gen_assets.py</code></td><td>rewrites every asset, vector and raster</td></tr>
    <tr><td><code>python3 brand/check-mark.py</code></td><td>proves the SVGs and the rasters are still the same drawing (stdlib only)</td></tr>
    <tr><td><code>python3 brand/measure.py</code></td><td>measures the hero's copy against the CSS clamps</td></tr>
    <tr><td><code>python3 brand/spec.py</code></td><td>regenerates this page</td></tr>
  </table>
  <p>Nothing else in the repository knows what the logo looks like.</p>
</main>
</body>
</html>
'''
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote brand/spec.html ({os.path.getsize(OUT):,} B) — "
          f"ink on the tile's lightest stop measures {ink_vs_tile:.1f}:1, "
          f"white measures {white_vs_tile:.1f}:1")


if __name__ == "__main__":
    main()
