#!/usr/bin/env python3
"""spec.py — write brand/spec.html, the printable brand sheet.

    python3 brand/spec.py            # standard library only; run gen_assets.py first

The sheet is generated rather than drawn by hand for the same reason the icons
are: a spec that says one thing while mark.py says another is worse than no
spec. Every number and colour below is read out of mark.py and gen_assets.py's
wordmark settings, every contrast ratio is computed, and every image is the
*shipped file itself*, embedded as a data URI — so the sheet shows exactly what
the site serves, and still works when it is saved or printed on its own.

Nothing on the site links it. It is for whoever needs to use the logo (a
partner, a print job, a press page) and for the next person who opens brand/
and wants the rules without reading mark.py.
"""
from __future__ import annotations

import base64
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "spec.html")
sys.path.insert(0, HERE)

import mark as M  # noqa: E402

hexc = M.hex_triplet


def data_uri(name: str) -> str:
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        raise SystemExit(f"spec.py: {name} is missing — run brand/gen_assets.py first")
    kind = "image/svg+xml" if name.endswith(".svg") else "image/png"
    with open(path, "rb") as fh:
        return f"data:{kind};base64," + base64.b64encode(fh.read()).decode("ascii")


def wordmark_settings() -> tuple[str, str]:
    """(weight, tracking) as gen_assets.py sets them, read from its source so
    this script needs none of gen_assets.py's packages."""
    source = open(os.path.join(HERE, "gen_assets.py"), encoding="utf-8").read()
    weight = re.search(r"^WORDMARK_WEIGHT\s*=\s*(\d+)", source, re.M).group(1)
    tracking = re.search(r"^WORDMARK_TRACKING\s*=\s*([\d.]+)", source, re.M).group(1)
    return weight, tracking


def construction(px: int = 288) -> str:
    """The mark at `px` with its geometry drawn over it: the bracket inset
    lines, the joint radius, the star's circle and waist."""
    u = px / M.BOX
    guide = 'stroke="#ff5c8a" stroke-width="1" fill="none" stroke-dasharray="4 4"'
    inset, far = M.BRACKET_INSET * u, (M.BOX - M.BRACKET_INSET) * u
    cx, cy = (c * u for c in M.SPARK_CENTRE)
    lines = "".join([
        f'<line x1="{inset:.1f}" y1="0" x2="{inset:.1f}" y2="{px}" {guide}/>',
        f'<line x1="0" y1="{inset:.1f}" x2="{px}" y2="{inset:.1f}" {guide}/>',
        f'<line x1="{far:.1f}" y1="0" x2="{far:.1f}" y2="{px}" {guide}/>',
        f'<line x1="0" y1="{far:.1f}" x2="{px}" y2="{far:.1f}" {guide}/>',
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{M.SPARK_RADIUS * u:.1f}" {guide}/>',
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{M.SPARK_WAIST * u:.1f}" {guide}/>',
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{M.MASKABLE_SAFE_RADIUS * u:.1f}" '
        'stroke="#ffd166" stroke-width="1" fill="none" stroke-dasharray="2 5"/>',
    ])
    return (f'<svg class="construct" width="{px}" height="{px}" viewBox="0 0 {px} {px}" '
            f'role="img" aria-label="Construction of the mark">'
            f'<image href="{data_uri("logo-mark.svg")}" width="{px}" height="{px}"/>{lines}</svg>')


def main() -> None:
    weight, tracking = wordmark_settings()
    tile_light = M.TILE_TOP                                   # the worst case
    bracket_ratio = M.contrast(M.ACCENT, tile_light)
    star_ratio = M.contrast(M.PAPER, tile_light)
    accent_on_white = M.contrast(M.ACCENT, M.PAPER)
    accent_light_on_white = M.contrast(M.ACCENT_ON_LIGHT, M.PAPER)
    old_light = M.contrast((26, 163, 204), M.PAPER)          # the previous spec's #1aa3cc
    house_on_page = M.contrast(M.HOUSE_ACCENT, M.TILE_INK)
    house_on_white = M.contrast(M.HOUSE_ACCENT, M.PAPER)
    house_light_on_white = M.contrast(M.HOUSE_ON_LIGHT, M.PAPER)
    reach = M.glyph_extent() * M.MASKABLE_SCALE

    sizes = [16, 20, 24, 32, 48, 64, 96, 128, 192]
    mark_uri = data_uri("logo-mark.svg")
    marks = "".join(f'<figure><img src="{mark_uri}" width="{s}" height="{s}" alt="the mark at {s} px">'
                    f'<figcaption>{s}</figcaption></figure>' for s in sizes)
    marks_light = "".join(f'<figure><img src="{mark_uri}" width="{s}" height="{s}" alt="">'
                          f'<figcaption>{s}</figcaption></figure>' for s in sizes)
    mono_dark = data_uri("logo-mark-mono-dark.svg")
    mono_light = data_uri("logo-mark-mono-light.svg")
    monos = "".join(f'<figure><img src="{mono_dark}" width="{s}" height="{s}" alt=""></figure>'
                    for s in (24, 48, 96))
    monos_on_dark = "".join(f'<figure><img src="{mono_light}" width="{s}" height="{s}" alt=""></figure>'
                            for s in (24, 48, 96))
    clear = M.BOX * 0.25

    swatches = [
        (M.TILE_TOP, "tile, top"), (M.TILE_BOTTOM, "tile, bottom"),
        (M.ACCENT, "accent — brackets, edge, fills"), (M.PAPER, "the star; mono on dark"),
        (M.INK, "ink — mono on light, text on light"), (M.TILE_INK, "page background"),
        (M.TEXT, "wordmark on dark"), (M.ACCENT_ON_LIGHT, "accent for text on light"),
        (M.HOUSE_ACCENT, "house accent — external brand, fills on dark"),
        (M.HOUSE_ON_LIGHT, "house accent for text on light"),
    ]
    swatch_html = "".join(
        f'<div class="swatch"><div style="background:{hexc(c)}"></div>'
        f'<div>{hexc(c)}<br>{label}</div></div>' for c, label in swatches)

    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand spec — The Most Useful Site in the World</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #0a0f14; color: #e6faff; }}
  main {{ max-width: 1000px; margin: 0 auto; padding: 48px 24px 96px; }}
  h1 {{ font-size: 2rem; letter-spacing: -0.02em; margin: 18px 0 6px; }}
  h2 {{ font-size: 0.95rem; letter-spacing: 0.14em; text-transform: uppercase; margin: 56px 0 14px;
        color: #2dd4ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
  p, li {{ color: rgba(230, 250, 255, 0.82); }}
  .lede {{ color: rgba(230, 250, 255, 0.62); margin-top: 0; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 0.92rem; }}
  th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.1); vertical-align: top; }}
  th {{ color: rgba(230,250,255,0.6); font-weight: 600; }}
  code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;
          background: rgba(255,255,255,0.07); padding: 1px 5px; border-radius: 4px; }}
  .row {{ display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; padding: 20px; margin-bottom: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }}
  .row.light {{ background: #f8fafc; }}
  .row.light figcaption {{ color: #475569; }}
  figure {{ margin: 0; text-align: center; }}
  figure img {{ display: block; margin: 0 auto; }}
  figcaption {{ font-size: 0.7rem; color: rgba(230,250,255,0.5); margin-top: 4px;
                font-family: ui-monospace, monospace; }}
  .pair {{ display: grid; grid-template-columns: auto 1fr; gap: 28px; align-items: center; }}
  .construct {{ display: block; border-radius: 14px; }}
  .legend span {{ display: inline-block; width: 22px; border-top: 2px dashed #ff5c8a; vertical-align: middle; margin-right: 6px; }}
  .legend span.safe {{ border-top-color: #ffd166; border-top-style: dotted; }}
  .swatches {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }}
  .swatch {{ border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); }}
  .swatch div:first-child {{ height: 60px; }}
  .swatch div:last-child {{ padding: 8px 10px; font-size: 0.76rem; font-family: ui-monospace, monospace;
                            background: rgba(0,0,0,0.35); }}
  .clearspace {{ display: inline-block; padding: {clear / M.BOX * 96:.0f}px; outline: 1px dashed rgba(45,212,255,0.6); }}
  .clearspace img {{ display: block; }}
  .lockups img {{ max-width: 100%; height: auto; }}
  .no {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }}
  .no div {{ padding: 14px; border: 1px solid rgba(255,120,120,0.35); border-radius: 10px;
             background: rgba(255,80,80,0.06); font-size: 0.88rem; }}
  .no .yes {{ border-color: rgba(120,255,180,0.35); background: rgba(80,255,150,0.05); }}
  @media (max-width: 640px) {{ .pair {{ grid-template-columns: 1fr; }} }}
  @media print {{ body {{ background: #fff; color: #111; }} h2 {{ color: {hexc(M.ACCENT_ON_LIGHT)}; }}
                  p, li, th, .lede {{ color: #333; }} .row {{ background: #f6f8fa; }}
                  .row:not(.light) {{ background: #0a0f14; -webkit-print-color-adjust: exact; print-color-adjust: exact; }} }}
</style>
</head>
<body>
<main>
  <img src="{data_uri("logo-lockup-dark.svg")}" height="72" alt="The Most Useful Site in the World">
  <h1>Brand spec</h1>
  <p class="lede">Generated by <code>brand/spec.py</code> from <code>brand/mark.py</code>. Every image is
     the shipped file itself and every ratio is computed, so this page cannot describe a logo the
     site does not have.</p>

  <h2>01 · The mark</h2>
  <p><strong>The finder.</strong> The two corner brackets of the home page's search console —
     top-left and bottom-right, square-cut, with the console's rounded joint — hold a white
     four-point star on a dark tile. The brackets find; the star is what they find: the one tool you
     came for. It is drawn out of the page's own instrument panel — the console's surface, its
     26&nbsp;% accent hairline for an edge, its corners — so the logo and the site are one design.</p>
  <p>It survives 16&nbsp;px on contrast alone: on the tile's lightest stop the brackets measure
     <strong>{bracket_ratio:.1f}:1</strong> and the star <strong>{star_ratio:.1f}:1</strong>.</p>
  <div class="row">{marks}</div>
  <div class="row light">{marks_light}</div>

  <h2>02 · Construction</h2>
  <div class="pair">
    {construction()}
    <div>
      <p>A {M.BOX:g}-unit square, tile corner radius {M.TILE_RADIUS:g}, point-symmetric about
         ({M.SPARK_CENTRE[0]:g},&nbsp;{M.SPARK_CENTRE[1]:g}).</p>
      <ul>
        <li>Brackets: centreline corner {M.BRACKET_INSET:g} in from each edge, arms {M.BRACKET_ARM:g},
            joint radius {M.BRACKET_RADIUS:g}, stroke {M.BRACKET_WIDTH:g}, butt ends.</li>
        <li>Star: tips at radius {M.SPARK_RADIUS:g}, inner vertices at {M.SPARK_WAIST:g} on the diagonals,
            straight sides.</li>
        <li>Edge: {M.EDGE_WIDTH:g}-unit hairline in the accent at {M.EDGE_OPACITY * 100:.0f}&nbsp;%.</li>
        <li>Maskable icon: the glyph at {M.MASKABLE_SCALE * 100:.0f}&nbsp;% reaches {reach:.1f} units from the
            centre, inside the {M.MASKABLE_SAFE_RADIUS:g}-unit safe circle.</li>
      </ul>
      <p class="legend"><span></span>geometry &nbsp; <span class="safe"></span>maskable safe circle</p>
    </div>
  </div>

  <h2>03 · Clear space</h2>
  <p>One quarter of the tile — <code>{clear:g}</code> of its {M.BOX:g} units — on all four sides.
     Nothing enters that box. For the lockup, the same distance measured from the tile.</p>
  <div class="row"><div class="clearspace"><img src="{mark_uri}" width="96" height="96" alt="the mark with its clear space"></div></div>

  <h2>04 · Minimum size</h2>
  <table>
    <tr><th>Use</th><th>Minimum</th><th>File</th></tr>
    <tr><td>Mark, screen</td><td><strong>16 px</strong> (the favicon)</td><td><code>favicon.svg</code> / <code>favicon.ico</code></td></tr>
    <tr><td>Mark, print</td><td>8 mm</td><td><code>logo-mark-mono-dark.svg</code></td></tr>
    <tr><td>Lockup, screen</td><td>180 px wide</td><td><code>logo-lockup-dark.svg</code> / <code>-light.svg</code></td></tr>
    <tr><td>Lockup, print</td><td>32 mm wide</td><td>the same</td></tr>
  </table>

  <h2>05 · One colour</h2>
  <p>Where the tile cannot go — one-colour print, embossing, a partner's layout — the glyph stands
     alone in one colour. Nothing is knocked out, so the reduction is the primary glyph exactly.</p>
  <div class="row light">{monos}</div>
  <div class="row">{monos_on_dark}</div>

  <h2>06 · Colour</h2>
  <div class="swatches">{swatch_html}</div>
  <p>The accent <code>{hexc(M.ACCENT)}</code> is for <em>fills and rules</em>. As text on white it is
     {accent_on_white:.2f}:1, so accent words on light surfaces use <code>{hexc(M.ACCENT_ON_LIGHT)}</code>
     ({accent_light_on_white:.2f}:1, WCAG AA). The previous spec's <code>#1aa3cc</code> was
     {old_light:.2f}:1 and never passed; <code>gen_assets.py</code> now refuses to run below 4.5:1.</p>
  <p>The <strong>house accent</strong> <code>{hexc(M.HOUSE_ACCENT)}</code> is the brand colour that defines the
     product <em>externally</em> — the lockups, the Open Graph cards, the press kit. It is amber/ochre on
     purpose: blue and purple are the default palette of every calculator and fintech competitor, and the
     brand sits against it. On the page it measures {house_on_page:.2f}:1 ({house_on_white:.2f}:1 on white —
     fills and marks only, never body text); accent <em>words</em> on light surfaces use
     <code>{hexc(M.HOUSE_ON_LIGHT)}</code> ({house_light_on_white:.2f}:1, WCAG AA). The page itself is never in the
     house colour: the interface follows the visitor's picker accent, and the mark keeps the console's cyan —
     the split is documented in <code>DESIGN.md</code> §3.</p>

  <h2>07 · Lockups</h2>
  <p>Mark, a hairline, and the wordmark on two lines — <strong>THE MOST USEFUL / SITE IN THE WORLD</strong>,
     Inter {weight} in caps with +{tracking}em tracking, <em>USEFUL</em> in the house accent. The files carry the
     wordmark as outlines of the site's own Inter, never live text. The home page's hero and footer
     set the same lockup in HTML.</p>
  <div class="row lockups"><img src="{data_uri("logo-lockup-dark.svg")}" width="440" alt="lockup on dark"></div>
  <div class="row light lockups"><img src="{data_uri("logo-lockup-light.svg")}" width="440" alt="lockup on light"></div>

  <h2>08 · Files</h2>
  <table>
    <tr><th>File</th><th>What it is</th></tr>
    <tr><td><code>logo-mark.svg</code> / <code>favicon.svg</code></td><td>the mark — one file, two names (pages link the first, browsers look for the second)</td></tr>
    <tr><td><code>favicon.ico</code></td><td>16 / 32 / 48 px, each rendered at its own size</td></tr>
    <tr><td><code>icon-192.png</code>, <code>icon-512.png</code></td><td>PWA and Android "any" icons: the rounded tile</td></tr>
    <tr><td><code>icon-maskable-512.png</code></td><td>full-bleed surface, glyph at {M.MASKABLE_SCALE * 100:.0f}&nbsp;% inside the safe circle</td></tr>
    <tr><td><code>apple-touch-icon.png</code></td><td>180 px, opaque and full-bleed (iOS rounds the corners itself)</td></tr>
    <tr><td><code>logo-mark-mono-dark.svg</code> / <code>-light.svg</code></td><td>one colour, <code>{hexc(M.INK)}</code> for light surfaces / <code>#ffffff</code> for dark</td></tr>
    <tr><td><code>logo-lockup-dark.svg</code> / <code>-light.svg</code></td><td>the lockup, wordmark as outlines</td></tr>
    <tr><td><code>og-brand.png</code> / <code>og-tools.png</code></td><td>the 1200×630 social card; its headline is the home page's &lt;h1&gt;</td></tr>
    <tr><td><code>logo.png</code></td><td>1024² stacked lockup, for press and directories</td></tr>
  </table>

  <h2>09 · What not to do</h2>
  <div class="no">
    <div>Don't recolour the brackets or the tile, and don't bring back a bright gradient tile: the mark belongs to a dark instrument panel.</div>
    <div>Don't rotate or mirror it. The brackets sit top-left and bottom-right, exactly as on the search console.</div>
    <div>Don't add a glow, gloss, bevel, shadow or outline. The page's chrome is flat hairlines, and so is the mark.</div>
    <div>Don't put the glyph without its tile on a mid-tone. Use the tile, or a one-colour reduction on a plain surface.</div>
    <div>Don't add a tool count or a tagline to a lockup: counts live in one generated place and cannot be re-derived inside an image.</div>
    <div class="yes">Do use the mark on its own at 16 px and up, with its clear space, and nothing else in the tile.</div>
  </div>

  <h2>10 · Changing it</h2>
  <p>Edit the numbers in <code>brand/mark.py</code>, then (packages in <code>brand/README.md</code>, installed outside the repository):</p>
  <table>
    <tr><td><code>/tmp/brandenv/bin/python brand/gen_assets.py</code></td><td>rewrites every asset from the SVG, vector and raster</td></tr>
    <tr><td><code>python3 brand/spec.py</code></td><td>regenerates this page</td></tr>
    <tr><td><code>python3 brand/check-mark.py</code></td><td>proves every shipped file is still mark.py's drawing (also in <code>verify.sh --deep</code>)</td></tr>
  </table>
  <p>Nothing else in the repository knows what the logo looks like.</p>
</main>
</body>
</html>
'''
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    print(f"wrote brand/spec.html ({os.path.getsize(OUT):,} B) — brackets {bracket_ratio:.1f}:1 and "
          f"star {star_ratio:.1f}:1 on the tile; accent text on white {accent_light_on_white:.2f}:1")


if __name__ == "__main__":
    main()
