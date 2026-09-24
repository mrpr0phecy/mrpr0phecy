#!/usr/bin/env python3
"""gen_assets.py — write every shipped brand asset from brand/mark.py.

    /tmp/brandenv/bin/python brand/gen_assets.py

Needs pillow, fonttools, brotli, uharfbuzz and resvg-py, installed OUTSIDE the
repository, which stays zero-dependency (brand/README.md has the two commands).
Everything is written to the repository root, next to the pages that link it:

    logo-mark.svg / favicon.svg   the mark — byte-identical, one file, two names
    logo-mark-mono-dark.svg       one colour (#071019), for light backgrounds
    logo-mark-mono-light.svg      one colour (#ffffff), for dark backgrounds
    logo-lockup-dark.svg          mark | wordmark, outlines, for dark backgrounds
    logo-lockup-light.svg         the same, for light backgrounds
    favicon.ico                   16 / 32 / 48 px
    icon-192.png, icon-512.png    PWA "any" icons: the rounded tile
    icon-maskable-512.png         PWA maskable: full bleed, glyph in the safe circle
    apple-touch-icon.png          180 px, opaque, full bleed (iOS rounds it)
    og-brand.png, og-tools.png    the 1200x630 social card (the same image)
    logo.png                      1024² stacked lockup, for press

**Every raster is rendered from SVG** built out of mark.py, by resvg — so no PNG
can become a different drawing from the vector, and there is no second
rasteriser to keep in step. **Every word is an outline**, set with HarfBuzz
(real kerning) in the site's own self-hosted Inter, instanced from
fonts/inter-latin.woff2 on the fly: the lockups need no font installed, and
the card's type is the page's type.

There is deliberately **no tool count in any image**: scripts/sync-counts.py
owns every published number and cannot re-derive a PNG, so a count baked into
a card would be stale the next time a tool is added. The social card's
headline is read out of index.html's <h1> for the same reason — the card
cannot disagree with the page.
"""
from __future__ import annotations

import html
import io
import os
import re
import sys
import tempfile

import resvg_py
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import mark as M  # noqa: E402

ROOT = os.path.dirname(HERE)
WOFF2 = os.path.join(ROOT, "fonts", "inter-latin.woff2")

hexc = M.hex_triplet

# ------------------------------------------------------------ the wordmark --
# Two lines: the name is long, and on one line beside a mark it is either too
# small to read or wider than any slide. USEFUL takes the accent — it is the
# promise in the name. Caps, 800, 0.14em tracking: the page's own wordmark.
WORDMARK = (
    (("THE MOST ", False), ("USEFUL", True)),
    (("SITE IN THE WORLD", False),),
)
WORDMARK_WEIGHT = 800
WORDMARK_TRACKING = 0.14          # em — home.css .hero-wordmark letter-spacing

# The lockup at its canonical scale (px at a 76 px mark). Every other placement
# (the social card, logo.png) is this, scaled — one lockup, not three.
LOCKUP_MARK = 76.0
LOCKUP_GAP = 22.0                 # mark -> hairline, and hairline -> wordmark
LOCKUP_SIZE = 24.0                # wordmark font size
LOCKUP_LEADING = 32.0             # baseline to baseline
LOCKUP_RULE = 1.25                # the hairline's width
LOCKUP_PAD = 12.0                 # clear space inside the lockup SVGs' viewBox


# ------------------------------------------------------------------- type --
class Face:
    """A static instance of the shipped Inter at one weight: fontTools for the
    outlines, HarfBuzz for the positions (kerning included)."""

    _cache: dict[int, "Face"] = {}

    def __init__(self, weight: int):
        path = os.path.join(tempfile.gettempdir(), f"brand-inter-{weight}.ttf")
        if not os.path.exists(path):
            font = TTFont(WOFF2)
            font.flavor = None
            instantiateVariableFont(font, {"wght": weight}, inplace=True,
                                    updateFontNames=False)
            font.save(path)
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.order = self.font.getGlyphOrder()
        self.upem = self.font["head"].unitsPerEm
        self.cap_height = self.font["OS/2"].sCapHeight / self.upem
        self.hb = hb.Font(hb.Face(hb.Blob.from_file_path(path)))

    @classmethod
    def get(cls, weight: int) -> "Face":
        if weight not in cls._cache:
            cls._cache[weight] = cls(weight)
        return cls._cache[weight]

    def shape(self, text: str):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True})
        return [(self.order[i.codepoint], p.x_advance, p.x_offset, p.y_offset)
                for i, p in zip(buf.glyph_infos, buf.glyph_positions)]


def _num(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def set_text(text: str, weight: int, size: float, x: float, y: float,
             tracking: float = 0.0) -> tuple[str, float]:
    """`text` as SVG path data, baseline at (x, y), `tracking` in em added
    after every glyph (CSS letter-spacing). Returns (d, width), the width
    without the trailing tracking — the visible extent, for layout."""
    face = Face.get(weight)
    scale = size / face.upem
    track = tracking * size
    parts: list[str] = []
    cursor = x
    for name, advance, dx, dy in face.shape(text):
        pen = SVGPathPen(face.glyphs, ntos=_num)
        face.glyphs[name].draw(TransformPen(
            pen, (scale, 0, 0, -scale, cursor + dx * scale, y - dy * scale)))
        if pen.getCommands():
            parts.append(pen.getCommands())
        cursor += advance * scale + track
    return "".join(parts), cursor - x - (track if text else 0.0)


def text_width(text: str, weight: int, size: float, tracking: float = 0.0) -> float:
    return set_text(text, weight, size, 0.0, 0.0, tracking)[1]


def set_runs(runs, weight: int, size: float, x: float, y: float, tracking: float,
             colours: tuple[str, str]) -> tuple[str, float]:
    """A line made of (text, accent?) runs, one <path> per run. `colours` is
    (plain, accent)."""
    out, cursor = [], x
    for text, accent in runs:
        d, width = set_text(text, weight, size, cursor, y, tracking)
        if d:
            out.append(f'<path d="{d}" fill="{colours[1] if accent else colours[0]}"/>')
        cursor += width + tracking * size
    return "".join(out), cursor - x - tracking * size


def wordmark_widths(size: float) -> list[float]:
    return [text_width("".join(t for t, _ in line), WORDMARK_WEIGHT, size, WORDMARK_TRACKING)
            for line in WORDMARK]


# ---------------------------------------------------------------- lockups --
def lockup(on_dark: bool, prefix: str = "l") -> tuple[str, str, float, float]:
    """(defs, body, width, height): mark | hairline | two-line wordmark, at the
    canonical scale, origin top-left, no padding.

    The accent word is the HOUSE colour, not the UI accent: the lockup is a
    brand object (DESIGN.md §3) and the page may be in any visitor's accent.
    The mark keeps the console's cyan — it is drawn out of the page."""
    colours = ((hexc(M.TEXT), hexc(M.HOUSE_ACCENT)) if on_dark
               else (hexc(M.INK), hexc(M.HOUSE_ON_LIGHT)))
    rule = hexc(M.TEXT if on_dark else M.INK)
    face = Face.get(WORDMARK_WEIGHT)
    cap = face.cap_height * LOCKUP_SIZE
    block = LOCKUP_LEADING + cap
    top = (LOCKUP_MARK - block) / 2
    rule_x = LOCKUP_MARK + LOCKUP_GAP
    text_x = rule_x + LOCKUP_GAP
    defs, mark = M.mark_group(0, 0, LOCKUP_MARK, prefix)
    body = [mark, f'<path d="M{_num(rule_x)} {_num(top)}V{_num(top + block)}" '
                  f'stroke="{rule}" stroke-opacity="0.24" stroke-width="{_num(LOCKUP_RULE)}"/>']
    for i, line in enumerate(WORDMARK):
        paths, _ = set_runs(line, WORDMARK_WEIGHT, LOCKUP_SIZE, text_x,
                            top + cap + i * LOCKUP_LEADING, WORDMARK_TRACKING, colours)
        body.append(paths)
    width = text_x + max(wordmark_widths(LOCKUP_SIZE))
    return defs, "".join(body), width, LOCKUP_MARK


def svg_lockup(on_dark: bool) -> str:
    defs, body, w, h = lockup(on_dark)
    W, H = w + 2 * LOCKUP_PAD, h + 2 * LOCKUP_PAD
    title = "The Most Useful Site in the World"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{_num(W)}" height="{_num(H)}" '
            f'viewBox="0 0 {_num(W)} {_num(H)}" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{defs}</defs>'
            f'<g transform="translate({_num(LOCKUP_PAD)} {_num(LOCKUP_PAD)})">{body}</g></svg>\n')


# ------------------------------------------------------------ rasterising --
def rasterise(svg: str, width: int, height: int | None = None) -> Image.Image:
    png = resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height or width,
                                skip_system_fonts=True)
    return Image.open(io.BytesIO(bytes(png))).convert("RGBA")


def report(name: str) -> None:
    print(f"  {name:28s} {os.path.getsize(os.path.join(ROOT, name)):>8,d} B")


def write_text(name: str, text: str) -> None:
    with open(os.path.join(ROOT, name), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    report(name)


def write_png(name: str, image: Image.Image) -> None:
    image.save(os.path.join(ROOT, name), optimize=True)
    report(name)


# ------------------------------------------------ the card's shared chrome --
def _backdrop(width: int, height: int) -> tuple[str, str]:
    """(defs, body): the page's own background — ink, two soft washes (accent
    from the top-left, blue from the bottom-right) and the 22 px dot grid the
    home page's hero sits on."""
    defs = (
        '<radialGradient id="washA" cx="0.18" cy="0" r="0.75">'
        f'<stop offset="0" stop-color="{hexc(M.ACCENT)}" stop-opacity="0.16"/>'
        f'<stop offset="1" stop-color="{hexc(M.ACCENT)}" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="washB" cx="0.95" cy="1.05" r="0.7">'
        '<stop offset="0" stop-color="#2f6bff" stop-opacity="0.13"/>'
        '<stop offset="1" stop-color="#2f6bff" stop-opacity="0"/></radialGradient>'
        '<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">'
        f'<circle cx="11" cy="11" r="1" fill="{hexc(M.TEXT)}" fill-opacity="0.07"/></pattern>'
        '<linearGradient id="crown" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{hexc(M.ACCENT)}" stop-opacity="0"/>'
        f'<stop offset="0.5" stop-color="{hexc(M.ACCENT)}" stop-opacity="0.75"/>'
        f'<stop offset="1" stop-color="{hexc(M.ACCENT)}" stop-opacity="0"/></linearGradient>'
    )
    body = (f'<rect width="{width}" height="{height}" fill="{hexc(M.TILE_INK)}"/>'
            f'<rect width="{width}" height="{height}" fill="url(#washA)"/>'
            f'<rect width="{width}" height="{height}" fill="url(#washB)"/>'
            f'<rect width="{width}" height="{height}" fill="url(#dots)"/>'
            f'<rect width="{width}" height="2" fill="url(#crown)"/>')
    return defs, body


def _hud(width: int, height: int, inset: float, arm: float, radius: float,
         stroke: float) -> str:
    """The console's corner brackets, at card scale: top-left and bottom-right."""
    x0, y0, x1, y1 = inset, inset, width - inset, height - inset
    style = (f'fill="none" stroke="{hexc(M.ACCENT)}" stroke-opacity="0.7" '
             f'stroke-width="{_num(stroke)}"')
    tl = (f"M{_num(x0)} {_num(y0 + arm)}V{_num(y0 + radius)}"
          f"A{_num(radius)} {_num(radius)} 0 0 1 {_num(x0 + radius)} {_num(y0)}H{_num(x0 + arm)}")
    br = (f"M{_num(x1)} {_num(y1 - arm)}V{_num(y1 - radius)}"
          f"A{_num(radius)} {_num(radius)} 0 0 1 {_num(x1 - radius)} {_num(y1)}H{_num(x1 - arm)}")
    return f'<path d="{tl}" {style}/><path d="{br}" {style}/>'


def _headline_from_index() -> str:
    source = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    match = re.search(r"<h1[^>]*>(.*?)</h1>", source, re.S)
    if not match:
        raise SystemExit("gen_assets: index.html has no <h1> — the card's headline comes from it")
    return html.unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip()


def _balanced_lines(text: str, weight: int, size: float, tracking: float,
                    max_width: float, max_lines: int = 2) -> list[str]:
    """Break `text` into at most `max_lines`, minimising the widest line (CSS
    text-wrap: balance, which is what the page's <h1> uses)."""
    words = text.split()
    if text_width(text, weight, size, tracking) <= max_width or max_lines == 1:
        return [text]
    best = None
    for cut in range(1, len(words)):
        lines = [" ".join(words[:cut]), " ".join(words[cut:])]
        widest = max(text_width(l, weight, size, tracking) for l in lines)
        if best is None or widest < best[0]:
            best = (widest, lines)
    return best[1]


def _guard(name: str, what: str, right: float, limit: float) -> None:
    if right > limit + 0.01:
        raise SystemExit(f"gen_assets: {name}: {what} runs to {right:.0f}px, past {limit:.0f}px")


# -------------------------------------------------------- the social card --
OG_W, OG_H, OG_MARGIN = 1200, 630, 88


def svg_og() -> str:
    defs, body = _backdrop(OG_W, OG_H)
    parts = [body, _hud(OG_W, OG_H, inset=34, arm=64, radius=16, stroke=3)]
    right_edge = OG_W - OG_MARGIN

    # the lockup row
    ldefs, lbody, lw, lh = lockup(on_dark=True, prefix="og")
    scale = 96 / LOCKUP_MARK
    top = 78
    parts.append(f'<g transform="translate({OG_MARGIN} {top}) scale({_num(scale)})">{lbody}</g>')
    defs += ldefs
    _guard("og", "the lockup", OG_MARGIN + lw * scale, right_edge)

    # the headline, the page's own <h1>, in the page's own gradient. The block
    # from the headline's cap line to the claims' baseline is placed in the
    # space between the lockup and the scale, a little above centre.
    size, tracking, leading = 76.0, -0.032, 1.05 * 76.0
    claims_gap = 74.0
    base = OG_H - 70                                  # the scale's baseline
    headline = _headline_from_index()
    lines = _balanced_lines(headline, 800, size, tracking, right_edge - OG_MARGIN)
    face = Face.get(800)
    block = face.cap_height * size + (len(lines) - 1) * leading + claims_gap
    room = base - (top + lh * scale) - block
    if room < 60:
        raise SystemExit(f"gen_assets: og: the headline block leaves {room:.0f}px — too tight")
    first = top + lh * scale + room * 0.44 + face.cap_height * size
    # The headline's fade and the brand elements below it are the HOUSE
    # accent; the backdrop wash, the HUD corners and the mark stay the
    # console's cyan — the card reproduces the page, the brand words carry
    # the colour that defines it externally (DESIGN.md §3).
    end = tuple(round(0.68 * t + 0.32 * a) for t, a in zip(M.TEXT, M.HOUSE_ACCENT))
    defs += ('<linearGradient id="h1" gradientUnits="userSpaceOnUse" x1="0" y1="{0}" x2="0" y2="{1}">'
             '<stop offset="0.32" stop-color="#ffffff"/><stop offset="1" stop-color="{2}"/>'
             '</linearGradient>').format(_num(first - face.cap_height * size),
                                          _num(first + (len(lines) - 1) * leading + 0.22 * size),
                                          hexc(end))
    for i, line in enumerate(lines):
        d, w = set_text(line, 800, size, OG_MARGIN, first + i * leading, tracking)
        _guard("og", f"headline line {i + 1}", OG_MARGIN + w, right_edge)
        parts.append(f'<path d="{d}" fill="url(#h1)"/>')

    # the promises — a live dot, then the claims in tracked caps
    claims_y = first + (len(lines) - 1) * leading + claims_gap
    dot_x, dot_cy = OG_MARGIN + 6, claims_y - 7
    parts.append(f'<circle cx="{dot_x}" cy="{_num(dot_cy)}" r="12" fill="{hexc(M.HOUSE_ACCENT)}" fill-opacity="0.16"/>'
                 f'<circle cx="{dot_x}" cy="{_num(dot_cy)}" r="5" fill="{hexc(M.HOUSE_ACCENT)}"/>')
    claims = "NO ADS · NO ACCOUNTS · NO SIGN-UPS · NO PAYWALLS"
    d, w = set_text(claims, 600, 21, OG_MARGIN + 30, claims_y, 0.14)
    _guard("og", "the claims row", OG_MARGIN + 30 + w, right_edge)
    parts.append(f'<path d="{d}" fill="{hexc(M.MUTED)}"/>')

    # the scale along the foot, and the address below it
    ticks = []
    for i, x in enumerate(range(OG_MARGIN, right_edge + 1, 12)):
        major = i % 5 == 0
        ticks.append(f"M{x} {base}v{-12 if major else -6}")
    parts.append(f'<path d="M{OG_MARGIN} {base}H{right_edge}" stroke="{hexc(M.TEXT)}" stroke-opacity="0.16"/>'
                 f'<path d="{"".join(ticks)}" stroke="{hexc(M.TEXT)}" stroke-opacity="0.2"/>')
    domain = "THEMOSTUSEFULSITEINTHEWORLD.COM"
    d, w = set_text(domain, 700, 17, OG_MARGIN, base + 34, 0.2)
    _guard("og", "the address", OG_MARGIN + w, right_edge)
    parts.append(f'<path d="{d}" fill="{hexc(M.HOUSE_ACCENT)}" fill-opacity="0.85"/>')
    if base + 34 > OG_H - 20:
        raise SystemExit("gen_assets: og: the address falls off the card")

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{OG_W}" height="{OG_H}" '
            f'viewBox="0 0 {OG_W} {OG_H}"><defs>{defs}</defs>{"".join(parts)}</svg>')


# ------------------------------------------------------------- logo.png --
LOGO = 1024


def svg_logo() -> str:
    """The stacked lockup: mark above a centred two-line wordmark. The press
    square — the lockup a journalist or a directory grabs."""
    defs, body = _backdrop(LOGO, LOGO)
    parts = [body, _hud(LOGO, LOGO, inset=56, arm=104, radius=24, stroke=4)]
    mark_px, size = 300.0, 54.0
    leading = size * LOCKUP_LEADING / LOCKUP_SIZE
    face = Face.get(WORDMARK_WEIGHT)
    cap = face.cap_height * size
    gap = 84.0
    block = mark_px + gap + cap + leading
    top = (LOGO - block) / 2
    mdefs, mark = M.mark_group((LOGO - mark_px) / 2, top, mark_px, "logo")
    defs += mdefs
    parts.append(mark)
    colours = (hexc(M.TEXT), hexc(M.HOUSE_ACCENT))
    for i, (line, width) in enumerate(zip(WORDMARK, wordmark_widths(size))):
        x = (LOGO - width) / 2
        _guard("logo", f"wordmark line {i + 1}", x + width, LOGO - 96)
        paths, _ = set_runs(line, WORDMARK_WEIGHT, size, x, top + mark_px + gap + cap + i * leading,
                            WORDMARK_TRACKING, colours)
        parts.append(paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{LOGO}" height="{LOGO}" '
            f'viewBox="0 0 {LOGO} {LOGO}"><defs>{defs}</defs>{"".join(parts)}</svg>')


# ------------------------------------------------------------------ main --
def main() -> None:
    worst = M.contrast(M.ACCENT_ON_LIGHT, M.PAPER)
    if worst < 4.5:
        raise SystemExit(f"gen_assets: ACCENT_ON_LIGHT is {worst:.2f}:1 on white — "
                         "text needs 4.5:1 (WCAG AA). Darken it in mark.py.")
    house_text = M.contrast(M.HOUSE_ON_LIGHT, M.PAPER)
    if house_text < 4.5:
        raise SystemExit(f"gen_assets: HOUSE_ON_LIGHT is {house_text:.2f}:1 on white — "
                         "text needs 4.5:1 (WCAG AA). Darken it in mark.py.")
    house_fill = M.contrast(M.HOUSE_ACCENT, M.TILE_INK)
    if house_fill < 3.0:
        raise SystemExit(f"gen_assets: HOUSE_ACCENT is {house_fill:.2f}:1 on the page — "
                         "a fill needs 3:1 (WCAG non-text). Lighten it in mark.py.")

    print("writing brand assets into", ROOT)
    mark = M.svg_mark()
    for name in ("logo-mark.svg", "favicon.svg"):
        write_text(name, mark)
    write_text("logo-mark-mono-dark.svg", M.svg_mono(M.INK))
    write_text("logo-mark-mono-light.svg", M.svg_mono(M.PAPER))
    write_text("logo-lockup-dark.svg", svg_lockup(on_dark=True))
    write_text("logo-lockup-light.svg", svg_lockup(on_dark=False))

    # favicon.ico: each frame rendered at its own size, not downscaled from 48.
    sizes = (16, 32, 48)
    frames = [rasterise(M.svg_icon(), s) for s in sizes]
    frames[-1].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                    sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    report("favicon.ico")

    write_png("icon-192.png", rasterise(M.svg_icon(), 192))
    write_png("icon-512.png", rasterise(M.svg_icon(), 512))
    write_png("icon-maskable-512.png",
              rasterise(M.svg_icon(full_bleed=True, glyph_scale=M.MASKABLE_SCALE), 512))
    apple = rasterise(M.svg_icon(full_bleed=True), 180).convert("RGB")   # opaque
    write_png("apple-touch-icon.png", apple)

    card = rasterise(svg_og(), OG_W, OG_H).convert("RGB")
    for name in ("og-brand.png", "og-tools.png"):
        write_png(name, card)
    write_png("logo.png", rasterise(svg_logo(), LOGO).convert("RGB"))


if __name__ == "__main__":
    main()
