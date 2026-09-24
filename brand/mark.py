"""The mark — its geometry, its palette, and the SVG every shipped file comes from.

One drawing, every file. `gen_assets.py` writes them all from this module:

    logo-mark.svg / favicon.svg   svg_mark()      the mark as vector
    logo-mark-mono-*.svg          svg_mono()      one colour, no tile
    favicon.ico, icon-*.png,
    apple-touch-icon.png          svg_icon()      rasterised from the SVG
    logo-lockup-*.svg, og-*.png,
    logo.png                      mark_group()    the mark placed in a layout

Every raster is rendered *from these SVG strings* (gen_assets.py uses resvg),
so a PNG cannot become a different drawing from the vector: there is exactly
one description of the mark, and it is the one below.

## The drawing, and why it is drawn this way

**The finder.** A dark tile, the two cyan corner brackets of the home page's
search console (top-left and bottom-right, exactly where `.hero-command` draws
them), and a white four-point star held between them. The brackets are the
thing that finds; the star is what it finds — the one tool you came for.

It replaced the 2026-09-24 "aperture" (an ink magnifier on a glossy
cyan-to-blue tile), which was legible but did not belong to the site it sat
on: every surface around it is a dark instrument panel — hairlines, mono
readouts, a tick scale, bracketed corners — and the one bright, glossy,
rounded object on the page was the logo. It also read as the generic "AI
search" icon (a magnifier holding a curvy sparkle). This mark is drawn *out
of* the page instead of on top of it:

* the tile is the console's surface (a vertical dark gradient, lighter at the
  top) with the console's 26 % accent hairline for an edge;
* the brackets are the console's corners, square-cut like the CSS borders that
  draw them, with the same rounded joint;
* the star has straight sides — a compass glint, not a soft sparkle.

Contrast is why it survives 16 px: against even the tile's lightest stop the
accent (#2dd4ff) brackets are 9:1 and the white star 16:1, so nothing dissolves
the way the old white-on-gradient glyph did (1.3:1). `brand/spec.py` computes
those ratios with contrast() below rather than asserting them.

Everything is centred on (16, 16) and point-symmetric: the top-left bracket
rotated 180 degrees about the centre is the bottom-right one.

To change the mark: edit the numbers here, run `brand/gen_assets.py` (see
brand/README.md for the packages it needs, installed outside the repo), then
`python3 brand/check-mark.py`, which proves every shipped file is still this
drawing. Nothing else in the repository knows what the logo looks like.

Standard library only, so check-mark.py can import the real geometry — not a
regex over this file — with nothing installed.
"""
from __future__ import annotations

import math

# ----------------------------------------------------------------- geometry --
BOX = 32.0

TILE_RADIUS = 7.0                 # 22 % of the tile — an app-icon corner

# The tile's surface: the console's vertical gradient, light edge at the top.
# Lighter than the console itself, so the tile still separates from a dark tab
# strip or a dark home screen.
TILE_TOP = (23, 35, 46)           # #17232e
TILE_BOTTOM = (10, 16, 22)        # #0a1016

# The hairline edge, centred half its width inside the tile, in the accent —
# the console's border. It is what separates the tile from a dark tab strip at
# 16-48 px. Thin and fairly bright rather than wide and faint: at 0.7 units and
# 32 % it read as a bezel at 192 px; at 0.45 and 55 % as a neon outline.
EDGE_WIDTH = 0.5
EDGE_OPACITY = 0.42

# The brackets. INSET is where a bracket's centreline turns its corner, measured
# from the tile's edge; ARM is how far each arm runs from that corner; RADIUS
# rounds the joint (the console's corners are rounded too). Square-cut ends
# (SVG's default butt cap) because CSS borders have no caps.
BRACKET_INSET = 6.6
BRACKET_ARM = 7.6
BRACKET_RADIUS = 2.2
BRACKET_WIDTH = 3.0

# The star: four tips on the compass points, straight sides, four inner vertices
# on the diagonals. WAIST is the centre-to-inner-vertex distance, so it alone
# decides how thin the arms are.
SPARK_CENTRE = (16.0, 16.0)
SPARK_RADIUS = 6.8
SPARK_WAIST = 2.2

# The maskable icon's glyph scale. A launcher may crop a maskable icon down to
# the centred circle of 80 % diameter (radius 12.8 units here). The outer edge
# of a bracket's rounded joint lies glyph_extent() = 13.9 units from the centre,
# so at full size the joints would be shaved; at 0.84 they sit at 11.7.
# check-mark.py asserts the scaled glyph is inside the circle.
MASKABLE_SCALE = 0.84
MASKABLE_SAFE_RADIUS = 0.4 * BOX

# ------------------------------------------------------------------- colour --
# The site's own tokens (home.css :root), so the kit cannot drift from the page.
ACCENT = (45, 212, 255)           # #2dd4ff --accent: brackets, edge, accent fills
PAPER = (255, 255, 255)           # the star, and the mono-light colour
INK = (7, 16, 25)                 # #071019 the mono-dark colour, text on light
TILE_INK = (10, 15, 20)           # #0a0f14 --bg-primary: the page, the card
TEXT = (230, 250, 255)            # #e6faff --text: the wordmark on dark
MUTED = (150, 186, 200)           # #96bac8 secondary copy on the social card
# The accent is a fill colour. As *text* on white it is 1.7:1, and even the
# old "darkened" #1aa3cc was 2.9:1, so light surfaces set accent words in this
# instead; gen_assets.py refuses to run if it ever drops below 4.5:1 (WCAG AA).
ACCENT_ON_LIGHT = (10, 126, 164)  # #0a7ea4


def hex_triplet(colour) -> str:
    return "#%02x%02x%02x" % tuple(colour[:3])


def luminance(colour) -> float:
    """WCAG relative luminance of an sRGB triplet."""
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(v) for v in colour[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b) -> float:
    """WCAG contrast ratio between two opaque sRGB triplets (1 to 21)."""
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def over(colour, opacity: float, base) -> tuple[int, int, int]:
    """`colour` at `opacity` composited over opaque `base`."""
    return tuple(int(round(c * opacity + b * (1 - opacity))) for c, b in zip(colour[:3], base[:3]))


def _n(value: float) -> str:
    """A coordinate, rounded to 3 places, without trailing zeros."""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


# ------------------------------------------------------------- the geometry --
def bracket_corner(which: str) -> tuple[float, float]:
    """The point where a bracket's centreline turns (before the joint is
    rounded). `which` is "tl" or "br"."""
    if which == "tl":
        return (BRACKET_INSET, BRACKET_INSET)
    if which == "br":
        return (BOX - BRACKET_INSET, BOX - BRACKET_INSET)
    raise ValueError(which)


def bracket_path(which: str) -> str:
    """A bracket's centreline as SVG path data: arm, rounded joint, arm.

    Stroked BRACKET_WIDTH wide. The joint is an exact circular arc (`A`,
    sweep-flag 1 = clockwise on screen) and the arms are tangent to it, so the
    stroke needs no join style.
    """
    x, y = bracket_corner(which)
    arm, r = BRACKET_ARM, BRACKET_RADIUS
    s = 1.0 if which == "tl" else -1.0
    return (f"M{_n(x)} {_n(y + s * arm)}V{_n(y + s * r)}"
            f"A{_n(r)} {_n(r)} 0 0 1 {_n(x + s * r)} {_n(y)}H{_n(x + s * arm)}")


def spark_vertices() -> list[tuple[float, float]]:
    """The star's eight vertices, clockwise from the top tip (screen coords)."""
    cx, cy = SPARK_CENTRE
    r, w = SPARK_RADIUS, SPARK_WAIST * math.sqrt(0.5)
    return [(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
            (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)]


def spark_path() -> str:
    return "M" + "L".join(f"{_n(x)} {_n(y)}" for x, y in spark_vertices()) + "Z"


def glyph_extent() -> float:
    """How far the glyph reaches from the centre: the outer edge of a bracket's
    rounded joint (the arm ends and the star's tips are all nearer)."""
    x, _ = bracket_corner("tl")
    joint_centre = x + BRACKET_RADIUS
    to_joint = (SPARK_CENTRE[0] - joint_centre) * math.sqrt(2)
    arm_end = math.hypot(SPARK_CENTRE[0] - (x - BRACKET_WIDTH / 2),
                         SPARK_CENTRE[1] - (x + BRACKET_ARM))
    return max(to_joint + BRACKET_RADIUS + BRACKET_WIDTH / 2, arm_end, SPARK_RADIUS)


# -------------------------------------------------------------- SVG pieces --
def svg_tile(prefix: str = "", *, full_bleed: bool = False) -> tuple[str, str]:
    """(defs, body) for the tile: the gradient surface and its hairline edge.

    `prefix` namespaces the gradient id when several marks share a document.
    `full_bleed` paints the surface edge to edge, square, with no edge line —
    for the opaque icons whose platform crops the corners itself.
    """
    gid = f"{prefix}tile"
    defs = (f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{hex_triplet(TILE_TOP)}"/>'
            f'<stop offset="1" stop-color="{hex_triplet(TILE_BOTTOM)}"/>'
            f'</linearGradient>')
    if full_bleed:
        return defs, f'<rect width="{_n(BOX)}" height="{_n(BOX)}" fill="url(#{gid})"/>'
    inset = EDGE_WIDTH / 2
    body = (f'<rect width="{_n(BOX)}" height="{_n(BOX)}" rx="{_n(TILE_RADIUS)}" fill="url(#{gid})"/>'
            f'<rect x="{_n(inset)}" y="{_n(inset)}" width="{_n(BOX - 2 * inset)}" '
            f'height="{_n(BOX - 2 * inset)}" rx="{_n(TILE_RADIUS - inset)}" fill="none" '
            f'stroke="{hex_triplet(ACCENT)}" stroke-opacity="{_n(EDGE_OPACITY)}" '
            f'stroke-width="{_n(EDGE_WIDTH)}"/>')
    return defs, body


def svg_glyph(bracket_colour=ACCENT, spark_colour=PAPER) -> str:
    """The two brackets and the star — the whole glyph, no tile."""
    b = hex_triplet(bracket_colour)
    stroke = f'fill="none" stroke="{b}" stroke-width="{_n(BRACKET_WIDTH)}"'
    return (f'<path d="{bracket_path("tl")}" {stroke}/>'
            f'<path d="{bracket_path("br")}" {stroke}/>'
            f'<path d="{spark_path()}" fill="{hex_triplet(spark_colour)}"/>')


def _scaled(glyph: str, scale: float) -> str:
    if scale == 1.0:
        return glyph
    c = BOX / 2
    return f'<g transform="translate({_n(c)} {_n(c)}) scale({_n(scale)}) translate({_n(-c)} {_n(-c)})">{glyph}</g>'


def mark_group(x: float, y: float, size: float, prefix: str = "m") -> tuple[str, str]:
    """(defs, body): the full mark placed at (x, y), `size` px square, for a
    layout that holds other things too (lockups, the social card)."""
    defs, tile = svg_tile(prefix)
    return defs, (f'<g transform="translate({_n(x)} {_n(y)}) scale({_n(size / BOX)})">'
                  f'{tile}{svg_glyph()}</g>')


# ----------------------------------------------------------- SVG documents --
_TITLE = "The Most Useful Site in the World"


def _document(defs: str, body: str, *, label: bool = True) -> str:
    a11y = (f' role="img" aria-label="{_TITLE}"><title>{_TITLE}</title>' if label else ">")
    defs_block = f"<defs>{defs}</defs>" if defs else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_n(BOX)} {_n(BOX)}"'
            f'{a11y}{defs_block}{body}</svg>\n')


def svg_mark() -> str:
    """logo-mark.svg / favicon.svg: tile, edge, brackets, star."""
    defs, tile = svg_tile()
    return _document(defs, tile + svg_glyph())


def svg_icon(*, full_bleed: bool = False, glyph_scale: float = 1.0) -> str:
    """The document a raster icon is rendered from. Defaults give exactly
    svg_mark(); the opaque icons use `full_bleed`, the maskable one also shrinks
    the glyph (MASKABLE_SCALE)."""
    defs, tile = svg_tile(full_bleed=full_bleed)
    return _document(defs, tile + _scaled(svg_glyph(), glyph_scale), label=False)


def svg_mono(colour) -> str:
    """The one-colour reduction: the same brackets and star in `colour`, no
    tile. Nothing is knocked out, so it is the primary glyph exactly."""
    return _document("", svg_glyph(colour, colour))
