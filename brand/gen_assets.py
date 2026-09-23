#!/usr/bin/env python3
"""gen_assets.py — write every shipped brand asset, from one geometry.

    python3 brand/gen_assets.py

Needs Pillow, fonttools and numpy (see brand/README.md — they are deliberately
NOT installed into this repository, which stays zero-dependency). Everything
written goes to the repository root, next to the pages that link it:

    logo-mark.svg / favicon.svg   the mark, vector, from mark.py's constants
    favicon.ico                   16 / 32 / 48 px
    icon-192.png, icon-512.png    PWA + Android
    icon-maskable-512.png         PWA maskable
    apple-touch-icon.png          180 px, opaque (iOS)
    og-brand.png                  the 1200x630 social card index.html links
    og-tools.png                  the same card, for the pages that share it
    logo.png                      1024² lockup (mark + wordmark) for press

The wordmark is set in the site's own self-hosted Inter (fonts/inter-latin.woff2),
instanced to static weights on the fly — so the card cannot drift from the page.

The wordmark is the ONLY text in any of these files, and there is deliberately
no tool count in any of them: scripts/sync-counts.py owns every published
number and cannot re-derive a PNG, so a count baked into an image would be
stale the next time a card is added.
"""
from __future__ import annotations

import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import mark as M

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOFF2 = os.path.join(ROOT, "fonts", "inter-latin.woff2")

# The lockup's palette. These are the site's own tokens: --bg-primary #0a0f14,
# --accent #2dd4ff, --text #e6faff.
INK = (10, 15, 20)
TEXT = (230, 250, 255)
ACCENT = (45, 212, 255)
MUTED = (150, 186, 200)

_FONT_CACHE: dict[int, str] = {}


def _instance(weight: int) -> str:
    """Path to a static Inter of `weight`, built from the shipped variable
    woff2 into a temp dir (Pillow cannot read woff2). Cached per process and
    per temp dir, so a second run is instant."""
    if weight not in _FONT_CACHE:
        out = os.path.join(tempfile.gettempdir(), f"brand-inter-{weight}.ttf")
        if not os.path.exists(out):
            font_obj = TTFont(WOFF2)
            font_obj.flavor = None
            instantiateVariableFont(font_obj, {"wght": weight}, inplace=True,
                                    updateFontNames=False)
            font_obj.save(out)
        _FONT_CACHE[weight] = out
    return _FONT_CACHE[weight]


def _truetype(weight: int, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(_instance(weight), size)


def hex_triplet(colour: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % colour


# --------------------------------------------------------------------- SVG ---
def svg_mark() -> str:
    """The mark as SVG, written from mark.py's constants — not traced from the
    rasters, not hand-drawn separately. brand/check-mark.py compares the two."""
    gx, gy = M.LENS_CENTRE
    r = M.LENS_RADIUS
    spark = M.SPARK_RADIUS
    diag = M.SPARK_WAIST * 0.7071
    up = (gx, gy - spark)
    rt = (gx + spark, gy)
    down = (gx, gy + spark)
    left = (gx - spark, gy)
    c_ur = (gx + diag, gy - diag)     # up -> right
    c_rd = (gx + diag, gy + diag)     # right -> down
    c_dl = (gx - diag, gy + diag)     # down -> left
    c_lu = (gx - diag, gy - diag)     # left -> up
    fmt = lambda p: f"{p[0]:.3f} {p[1]:.3f}"

    stops = "\n".join(
        f'      <stop offset="{offset * 100:g}%" stop-color="{hex_triplet(colour)}"/>'
        for offset, colour in M.GRADIENT)
    # The rasters carry a white sheen across the top of the tile (the ^1.4 fade
    # in mark.py); without it the SVG and the PNG would be two different
    # drawings of the same logo. Three stops approximate that curve closely.
    gloss = "\n".join(
        f'      <stop offset="{offset:g}%" stop-color="#ffffff" '
        f'stop-opacity="{M.GLOSS_TOP * (1 - offset / 100) ** 1.4:.4f}"/>'
        for offset in (0, 50, 100))

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="The Most Useful Site in the World">
  <title>The Most Useful Site in the World</title>
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
{stops}
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
{gloss}
    </linearGradient>
  </defs>
  <!-- The tile: the site's own accent gradient, with the same white sheen the
       raster icons carry. -->
  <rect width="32" height="32" rx="{M.TILE_RADIUS:g}" fill="url(#tile)"/>
  <rect width="32" height="32" rx="{M.TILE_RADIUS:g}" fill="url(#gloss)"/>
  <g transform="translate(16 16) scale({M.GLYPH_SCALE:g}) translate(-16 -16)">
    <!-- Lens: a dark well inside a white ring, so the ring reads on the tile. -->
    <circle cx="{gx:g}" cy="{gy:g}" r="{r:g}" fill="rgb(7,21,44)" fill-opacity="0.65"/>
    <circle cx="{gx:g}" cy="{gy:g}" r="{r:g}" fill="none" stroke="#ffffff" stroke-width="{M.LENS_STROKE:g}"/>
    <!-- Handle. -->
    <path d="M{M.HANDLE_FROM[0]:g} {M.HANDLE_FROM[1]:g} L{M.HANDLE_TO[0]:g} {M.HANDLE_TO[1]:g}"
          stroke="#ffffff" stroke-width="{M.HANDLE_WIDTH:g}" stroke-linecap="round" fill="none"/>
    <!-- Spark: the answer in the lens. Four tips, quadratic sides. -->
    <path d="M{fmt(up)} Q{fmt(c_ur)} {fmt(rt)} Q{fmt(c_rd)} {fmt(down)} Q{fmt(c_dl)} {fmt(left)} Q{fmt(c_lu)} {fmt(up)} Z"
          fill="#ffffff"/>
  </g>
</svg>
'''


def report(name: str, path: str) -> None:
    print(f"  {name:24} {os.path.getsize(path):>7,} B")


def write_svg() -> None:
    """Two names for one file: index.html links `logo-mark.svg`, and
    `favicon.svg` is the name browsers and tooling look for."""
    svg = svg_mark()
    for name in ("logo-mark.svg", "favicon.svg"):
        path = os.path.join(ROOT, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(svg)
        report(name, path)


def write_ico() -> None:
    """16 / 32 / 48 is what a tab, a bookmark and a desktop shortcut ask for."""
    sizes = [16, 32, 48]
    frames = [M.render_mark(size) for size in sizes]
    path = os.path.join(ROOT, "favicon.ico")
    # Append order matters: Pillow writes one frame per `sizes` entry and takes
    # the extras from append_images.
    frames[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes],
                    append_images=frames[:-1])
    report("favicon.ico", path)


def write_pngs() -> None:
    for name, size, kwargs in (
        ("icon-192.png", 192, {}),
        ("icon-512.png", 512, {}),
        # A maskable icon is cropped to a circle by Android: keep the mark well
        # inside the safe zone and give it an opaque background of its own.
        ("icon-maskable-512.png", 512, {"inset": 0.17, "background": INK + (255,)}),
        # iOS ignores transparency and rounds the corners itself.
        ("apple-touch-icon.png", 180, {"inset": 0.06, "background": INK + (255,)}),
    ):
        image = M.render_mark(size, **kwargs)
        path = os.path.join(ROOT, name)
        image.save(path, optimize=True)
        report(name, path)


def _spaced(draw: ImageDraw.ImageDraw, text: str, xy, face, fill, tracking: float) -> float:
    """Letter-spaced text — PIL has no tracking, and the wordmark needs it."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += draw.textlength(char, font=face) + tracking
    return x


def _wash(width: int, height: int, strength_scale: float = 1.0) -> Image.Image:
    """The ambient accent wash the site paints behind its own hero, done with
    numpy rather than a million PIL blends."""
    ys = np.arange(height, dtype=np.float32)[:, None]
    xs = np.arange(width, dtype=np.float32)[None, :]
    wash = np.zeros((height, width), dtype=np.float32)
    for (cx, cy, radius, strength) in ((width * 0.16, height * -0.22, height * 1.15, 0.20),
                                       (width * 1.00, height * 1.12, height * 1.00, 0.13)):
        dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / radius
        wash += strength * strength_scale * np.clip(1.0 - dist, 0.0, 1.0) ** 1.6
    base = np.array(INK, dtype=np.float32)
    tint = np.array(ACCENT, dtype=np.float32)
    blended = base[None, None, :] + (tint - base)[None, None, :] * np.clip(wash, 0, 0.6)[..., None]
    return Image.fromarray(blended.astype("uint8"), "RGB")


def write_og() -> None:
    """The social card: the mark, the name, the promise in one line."""
    width, height = 1200, 630
    card = _wash(width, height)
    draw = ImageDraw.Draw(card)

    mark_px = 300
    icon = M.render_mark(mark_px)
    card.paste(icon, (96, (height - mark_px) // 2 - 6), icon)

    text_x = 96 + mark_px + 62
    right_margin = 72
    available = width - text_x - right_margin

    lines = ("THE MOST USEFUL", "SITE IN THE WORLD")
    # Fit the wordmark to the space rather than guessing a size: the two lines
    # are set in Inter 900 with 1 px of tracking.
    size = 78
    while size > 40:
        face = _truetype(900, size)
        widest = max(sum(draw.textlength(c, font=face) + 1.0 for c in line) for line in lines)
        if widest <= available:
            break
        size -= 2
    name_face = _truetype(900, size)
    sub_face = _truetype(600, 38)
    foot_face = _truetype(600, 29)

    _spaced(draw, lines[0], (text_x, 176), name_face, TEXT, 1.0)
    _spaced(draw, lines[1], (text_x, 176 + size + 14), name_face, ACCENT, 1.0)
    # No tool count here on purpose: a number baked into a PNG cannot be
    # re-derived by scripts/sync-counts.py, so it would go stale the next time a
    # card is added. The copy below is the set of claims CONSTRAINTS.md calls
    # safe everywhere and always.
    draw.text((text_x + 2, 176 + (size + 14) * 2 - 6), "Free browser tools that actually run",
              font=sub_face, fill=TEXT)
    draw.text((text_x + 2, 176 + (size + 14) * 2 + 48),
              "No ads · no accounts · no sign-ups · no paywalls",
              font=foot_face, fill=MUTED)
    draw.text((96, height - 78), "themostusefulsiteintheworld.com", font=foot_face, fill=MUTED)

    for name in ("og-brand.png", "og-tools.png"):
        path = os.path.join(ROOT, name)
        card.save(path, optimize=True)
        report(name, path)


def write_logo_png() -> None:
    """`logo.png` — the square lockup a visitor or a journalist grabs when they
    want "the logo". Kept at 1024² because that is what the file has always
    been; nothing on the site links it, but nothing should have to."""
    size = 1024
    canvas = _wash(size, size)
    mark_px = 470
    icon = M.render_mark(mark_px)
    canvas.paste(icon, ((size - mark_px) // 2, 232), icon)

    draw = ImageDraw.Draw(canvas)
    word_face = _truetype(800, 46)
    sub_face = _truetype(600, 30)
    for index, line in enumerate(("THE MOST USEFUL", "SITE IN THE WORLD")):
        width = sum(draw.textlength(char, font=word_face) + 3.0 for char in line)
        _spaced(draw, line, ((size - width) / 2, 742 + index * 62), word_face,
                TEXT if index == 0 else ACCENT, 3.0)
    sub = "Free browser tools that actually run"
    width = draw.textlength(sub, font=sub_face)
    draw.text(((size - width) / 2, 880), sub, font=sub_face, fill=MUTED)

    path = os.path.join(ROOT, "logo.png")
    canvas.save(path, optimize=True)
    report("logo.png", path)


def main() -> None:
    if not os.path.exists(WOFF2):
        sys.exit(f"gen_assets.py: {WOFF2} is missing — the wordmark cannot be set")
    print("writing brand assets into", ROOT)
    write_svg()
    write_ico()
    write_pngs()
    write_og()
    write_logo_png()
    print("done — run `python3 brand/check-mark.py` to prove the SVG and the")
    print("rasters still describe the same drawing.")


if __name__ == "__main__":
    main()
