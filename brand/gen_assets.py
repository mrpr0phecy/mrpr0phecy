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
    logo-mark-mono-dark.svg       one colour (#071019) — light backgrounds
    logo-mark-mono-light.svg      one colour (#ffffff) — dark backgrounds
    logo-lockup-dark.svg          mark + wordmark, outlines, dark background
    logo-lockup-light.svg         the same, for light backgrounds
    og-brand.png                  the 1200x630 social card index.html links
    og-tools.png                  the same card, for the pages that share it
    logo.png                      1024² lockup (mark + wordmark) for press

It also writes `brand/spec.html` — the printable spec sheet (clear space,
minimum size, colour, the whole kit on one page). Nothing on the site links it;
it exists so that "how may I use this logo?" has an answer that is not a guess.

The wordmark is set in the site's own self-hosted Inter (fonts/inter-latin.woff2),
instanced to static weights on the fly — so the card cannot drift from the page.
The lockup SVGs carry the wordmark as **outlines**, converted from that same
font, so they render identically where Inter is not installed.

The wordmark is the ONLY text in the raster files, and there is deliberately
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
# --accent #2dd4ff, --text #e6faff, plus ACCENT_ON_LIGHT, which is the accent
# darkened until it can legally be *text* on paper (see brand/spec.html).
INK = (10, 15, 20)
TEXT = (230, 250, 255)
ACCENT = (45, 212, 255)
ACCENT_ON_LIGHT = (26, 163, 204)
MUTED = (150, 186, 200)
PAPER = (255, 255, 255)
GLYPH_INK = M.INK                  # #071019 — the mark's own ink, and mono-dark

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
def _stops() -> str:
    return "\n".join(
        f'      <stop offset="{offset * 100:g}%" stop-color="{hex_triplet(colour)}"/>'
        for offset, colour in M.GRADIENT)


def _gloss_stops() -> str:
    """The rasters carry a white sheen across the top of the tile (the ^1.4
    fade in mark.py); without it the SVG and the PNG would be two different
    drawings of the same logo. Three stops approximate that curve closely."""
    return "\n".join(
        f'      <stop offset="{offset:g}%" stop-color="#ffffff" '
        f'stop-opacity="{M.GLOSS_TOP * (1 - offset / 100) ** 1.4:.4f}"/>'
        for offset in (0, 50, 100))


def _spark_path() -> str:
    """The spark as four `Q` commands — the same construction mark.py samples."""
    gx, gy = M.DISC_CENTRE
    radius, waist = M.SPARK_RADIUS, M.SPARK_WAIST
    diag = waist * 0.7071
    up = (gx, gy - radius)
    rt = (gx + radius, gy)
    down = (gx, gy + radius)
    left = (gx - radius, gy)
    c_ur = (gx + diag, gy - diag)
    c_rd = (gx + diag, gy + diag)
    c_dl = (gx - diag, gy + diag)
    c_lu = (gx - diag, gy - diag)
    fmt = lambda p: f"{p[0]:.3f} {p[1]:.3f}"
    return (f"M{fmt(up)} Q{fmt(c_ur)} {fmt(rt)} Q{fmt(c_rd)} {fmt(down)} "
            f"Q{fmt(c_dl)} {fmt(left)} Q{fmt(c_lu)} {fmt(up)} Z")


def _needle_path() -> str:
    return f"M{M.NEEDLE_FROM[0]:g} {M.NEEDLE_FROM[1]:g} L{M.NEEDLE_TO[0]:g} {M.NEEDLE_TO[1]:g}"


def svg_mark() -> str:
    """The mark as SVG, written from mark.py's constants — not traced from the
    rasters, not hand-drawn separately. brand/check-mark.py compares the two."""
    disc = M.DISC_CENTRE
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="The Most Useful Site in the World">
  <title>The Most Useful Site in the World</title>
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
{_stops()}
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
{_gloss_stops()}
    </linearGradient>
  </defs>
  <!-- The tile: the site's own accent gradient, with the same white sheen the
       raster icons carry. -->
  <rect width="32" height="32" rx="{M.TILE_RADIUS:g}" fill="url(#tile)"/>
  <rect width="32" height="32" rx="{M.TILE_RADIUS:g}" fill="url(#gloss)"/>
  <!-- The aperture: opaque ink, so the spark reads as a knockout at every size
       instead of tinting toward the tile. -->
  <circle cx="{disc[0]:g}" cy="{disc[1]:g}" r="{M.DISC_RADIUS:g}" fill="{hex_triplet(GLYPH_INK)}"/>
  <!-- The answer. -->
  <path d="{_spark_path()}" fill="#ffffff"/>
  <!-- The needle: out of the disc's own edge, on the diagonal. -->
  <path d="{_needle_path()}" stroke="{hex_triplet(GLYPH_INK)}" stroke-width="{M.NEEDLE_WIDTH:g}" stroke-linecap="round" fill="none"/>
</svg>
'''


def svg_mono(colour: tuple[int, int, int]) -> str:
    """The one-colour reduction: the disc becomes a ring (mark.py's RING_STROKE),
    the spark becomes ink rather than a knockout, and nothing depends on the
    tile. Same centre, same needle, same spark — one drawing, one colour."""
    disc = M.DISC_CENTRE
    ink = hex_triplet(colour)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="The Most Useful Site in the World">
  <title>The Most Useful Site in the World</title>
  <circle cx="{disc[0]:g}" cy="{disc[1]:g}" r="{M.DISC_RADIUS:g}" fill="none" stroke="{ink}" stroke-width="{M.RING_STROKE:g}"/>
  <path d="{_spark_path()}" fill="{ink}"/>
  <path d="{_needle_path()}" stroke="{ink}" stroke-width="{M.NEEDLE_WIDTH:g}" stroke-linecap="round" fill="none"/>
</svg>
'''


# ------------------------------------------------------------------ lockup ---
def _outline_paths(text: str, weight: int, size: float, x: float, y: float,
                   tracking: float) -> tuple[str, float]:
    """`text` as one SVG path `d`, drawn at `size` em units with `tracking` px
    between characters, baseline at (x, y). Returns (d, advance width).

    This exists so the lockup SVGs carry no font dependency: Inter is shipped
    with the site, but a press PDF, a slide or a partner's page is not, and a
    lockup that reflows in a fallback face is not a lockup.
    """
    font = TTFont(_instance(weight))
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upem = font["head"].unitsPerEm
    scale = size / upem
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen

    parts: list[str] = []
    cursor = x
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"Inter has no glyph for {char!r} — the lockup cannot be set")
        pen = SVGPathPen(glyphs)
        # translate to the pen position, scale em -> px, flip Y (SVG grows down)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        d = pen.getCommands()
        if d:
            parts.append(d)
        cursor += hmtx[name][0] * scale + tracking
    return " ".join(parts), cursor - x - tracking


def _spaced_width(text: str, weight: int, size: float, tracking: float) -> float:
    font = TTFont(_instance(weight))
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upem = font["head"].unitsPerEm
    scale = size / upem
    total = sum(hmtx[cmap[ord(c)]][0] * scale + tracking for c in text)
    return total - tracking


def svg_lockup(on_dark: bool) -> str:
    """Mark + wordmark, wordmark as outlines, on transparency.

    The wordmark is two lines — the product's name is long, and one line of it
    beside a mark is either unreadably small or wider than any slide. Line two
    takes the accent, which is what makes the lockup read as designed rather
    than as a logo someone put next to some text.
    """
    ink = TEXT if on_dark else GLYPH_INK           # line one
    accent = ACCENT if on_dark else ACCENT_ON_LIGHT  # line two
    mark_px = 76.0
    gap = 30.0
    pad = 14.0
    size = 34.0
    tracking = 1.1
    lines = ("THE MOST USEFUL", "SITE IN THE WORLD")
    leading = 40.0
    width_line = max(_spaced_width(line, 800, size, tracking) for line in lines)
    text_x = pad + mark_px + gap
    height = pad * 2 + mark_px
    width = text_x + width_line + pad
    # Two lines optically centred against the mark: first baseline sits so the
    # block of capitals is centred in the mark's square.
    cap = size * 0.72
    first_baseline = (height - (leading + cap)) / 2 + cap
    d1, _ = _outline_paths(lines[0], 800, size, text_x, first_baseline, tracking)
    d2, _ = _outline_paths(lines[1], 800, size, text_x, first_baseline + leading, tracking)

    if on_dark:
        tile = f'''  <rect x="{pad:g}" y="{pad:g}" width="{mark_px:g}" height="{mark_px:g}" rx="{M.TILE_RADIUS / 32 * mark_px:g}" fill="url(#tile)"/>
  <rect x="{pad:g}" y="{pad:g}" width="{mark_px:g}" height="{mark_px:g}" rx="{M.TILE_RADIUS / 32 * mark_px:g}" fill="url(#gloss)"/>'''
    else:
        # On paper the gradient tile is a colour block that fights the wordmark;
        # the mono mark holds the lockup instead (brand/spec.html says so).
        tile = ""

    glyph_scale = mark_px / 32.0
    disc = f'''  <g transform="translate({pad:g} {pad:g}) scale({glyph_scale:.4f})">
    <circle cx="{M.DISC_CENTRE[0]:g}" cy="{M.DISC_CENTRE[1]:g}" r="{M.DISC_RADIUS:g}" {'fill="' + hex_triplet(GLYPH_INK) + '"' if on_dark else 'fill="none" stroke="' + hex_triplet(GLYPH_INK) + f'" stroke-width="{M.RING_STROKE:g}"'}/>
    <path d="{_spark_path()}" fill="{'#ffffff' if on_dark else hex_triplet(GLYPH_INK)}"/>
    <path d="{_needle_path()}" stroke="{'#ffffff' if not on_dark else hex_triplet(GLYPH_INK)}" stroke-width="{M.NEEDLE_WIDTH:g}" stroke-linecap="round" fill="none"/>
  </g>'''

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.1f} {height:.1f}" role="img" aria-label="The Most Useful Site in the World">
  <title>The Most Useful Site in the World</title>
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
{_stops()}
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
{_gloss_stops()}
    </linearGradient>
  </defs>
{tile}
{disc}
  <path d="{d1}" fill="{hex_triplet(ink)}"/>
  <path d="{d2}" fill="{hex_triplet(accent)}"/>
</svg>
'''


def report(name: str, path: str) -> None:
    print(f"  {name:26} {os.path.getsize(path):>7,} B")


def write(name: str, text: str) -> None:
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    report(name, path)


def write_svg() -> None:
    """Two names for one file: index.html links `logo-mark.svg`, and
    `favicon.svg` is the name browsers and tooling look for."""
    svg = svg_mark()
    for name in ("logo-mark.svg", "favicon.svg"):
        write(name, svg)
    write("logo-mark-mono-dark.svg", svg_mono(GLYPH_INK))
    write("logo-mark-mono-light.svg", svg_mono(PAPER))
    write("logo-lockup-dark.svg", svg_lockup(on_dark=True))
    write("logo-lockup-light.svg", svg_lockup(on_dark=False))


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
        ("icon-maskable-512.png", 512, {"inset": 0.17, "background": M.TILE_INK + (255,)}),
        # iOS ignores transparency and rounds the corners itself.
        ("apple-touch-icon.png", 180, {"inset": 0.06, "background": M.TILE_INK + (255,)}),
    ):
        image = M.render_mark(size, **kwargs)
        path = os.path.join(ROOT, name)
        image.save(path, optimize=True)
        report(name, path)


# ------------------------------------------------------------- social card ---
def _spaced(draw: ImageDraw.ImageDraw, text: str, xy, face, fill, tracking: float) -> float:
    """Letter-spaced text — PIL has no tracking, and the wordmark needs it."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += draw.textlength(char, font=face) + tracking
    return x


def _dot_grid(width: int, height: int, step: int, strength: float) -> np.ndarray:
    """The site's own hero texture, as a mask: a 22 px dot grid. It is the only
    texture the brand uses, so the card and the page agree about it."""
    grid = np.zeros((height, width), dtype=np.float32)
    grid[::step, ::step] = strength
    # One-pixel dots, softened by the blur the caller applies.
    return grid


def _wash(width: int, height: int, strength_scale: float = 1.0,
          grid: bool = True) -> Image.Image:
    """The ambient accent wash the site paints behind its own hero, done with
    numpy rather than a million PIL blends — plus the dot grid and the hairline
    crown, so a social card looks like a crop of the page it advertises."""
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
    if grid:
        dots = _dot_grid(width, height, 22, 0.045)[..., None]
        blended = np.clip(blended + dots * 255.0, 0, 255)
    return Image.fromarray(blended.astype("uint8"), "RGB")


def write_og() -> None:
    """The social card: the mark, the name, the promise in one line.

    Laid out on a 24 px rhythm with one hairline rule doing the dividing, so the
    card reads as a designed object at feed size rather than as text on a
    gradient.
    """
    width, height = 1200, 630
    card = _wash(width, height)
    draw = ImageDraw.Draw(card)

    # One vertical rhythm: margin, mark, wordmark, hairline, promise, claims,
    # and the domain pinned to the bottom margin. Every gap below is a number
    # from this list, and the guard at the end proves the last block still fits
    # inside the card — the first cut of this layout overlapped the domain with
    # the promise line and nothing but a human looking at the PNG caught it.
    margin = 96
    bottom_margin = 46
    mark_px = 180
    mark_y = 88
    gap_after_mark = 32
    leading = 1.16
    gap_before_rule = 22
    gap_after_rule = 22
    promise_px, foot_px = 32, 24

    icon = M.render_mark(mark_px)
    card.paste(icon, (margin, mark_y), icon)

    # The wordmark runs full width under the mark: at 1200 px a side-by-side
    # lockup leaves the name either tiny or two cramped lines.
    lines = ("THE MOST USEFUL", "SITE IN THE WORLD")
    size = 58
    while size > 30:
        widest = max(_spaced_width(line, 900, size, 2.0) for line in lines)
        if widest <= width - 2 * margin:
            break
        size -= 2
    name_face = _truetype(900, size)

    line1_y = mark_y + mark_px + gap_after_mark
    line_height = int(size * leading)
    _spaced(draw, lines[0], (margin, line1_y), name_face, TEXT, 2.0)
    _spaced(draw, lines[1], (margin, line1_y + line_height), name_face, ACCENT, 2.0)

    rule_y = line1_y + line_height * 2 + gap_before_rule
    draw.line((margin, rule_y, width - margin, rule_y), fill=(255, 255, 255, 24), width=1)

    promise_face = _truetype(600, promise_px)
    foot_face = _truetype(600, foot_px)
    # No tool count here on purpose: a number baked into a PNG cannot be
    # re-derived by scripts/sync-counts.py, so it would go stale the next time a
    # card is added. The copy below is the set of claims CONSTRAINTS.md calls
    # safe everywhere and always.
    promise_y = rule_y + gap_after_rule
    claims_y = promise_y + promise_px + 14
    draw.text((margin, promise_y), "Free browser tools that actually run",
              font=promise_face, fill=TEXT)
    _spaced(draw, "NO ADS · NO ACCOUNTS · NO SIGN-UPS · NO PAYWALLS",
            (margin + 1, claims_y), foot_face, MUTED, 2.2)

    foot_y = height - bottom_margin - foot_px
    if claims_y + foot_px + 12 > foot_y:
        raise SystemExit(
            f"gen_assets.py: the social card's copy runs into its footer "
            f"(claims end at {claims_y + foot_px}, the footer starts at {foot_y}). "
            f"Shorten a gap, shrink the mark, or grow the card.")
    _spaced(draw, "THEMOSTUSEFULSITEINTHEWORLD.COM", (margin + 1, foot_y), foot_face, MUTED, 2.2)

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
    mark_px = 400
    icon = M.render_mark(mark_px)
    canvas.paste(icon, ((size - mark_px) // 2, 176), icon)

    draw = ImageDraw.Draw(canvas)
    word_face = _truetype(900, 60)
    sub_face = _truetype(600, 30)
    y = 176 + mark_px + 64
    for index, line in enumerate(("THE MOST USEFUL", "SITE IN THE WORLD")):
        width = _spaced_width(line, 900, 60, 3.0)
        _spaced(draw, line, ((size - width) / 2, y + index * 78), word_face,
                TEXT if index == 0 else ACCENT, 3.0)
    sub = "Free browser tools that actually run"
    width = draw.textlength(sub, font=sub_face)
    draw.text(((size - width) / 2, y + 2 * 78 + 6), sub, font=sub_face, fill=MUTED)

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
    print("rasters still describe the same drawing, then regenerate")
    print("brand/spec.html with `python3 brand/spec.py`.")


if __name__ == "__main__":
    main()
