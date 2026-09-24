#!/usr/bin/env python3
"""check-mark.py — every shipped logo file must still be brand/mark.py's drawing.

    python3 brand/check-mark.py        # standard library only; verify.sh --deep runs it

gen_assets.py writes the kit and is run by hand, outside the repository's
zero-dependency toolchain — so between runs, nothing stops someone editing
mark.py without regenerating, hand-tweaking an SVG, or committing half a kit.
This catches all three, without rendering anything:

* **the vectors are exact** — logo-mark.svg, favicon.svg and both mono files
  must be byte-for-byte what mark.py produces today (so "the SVG matches the
  geometry" is an equality, not a tolerance), and the two names must be one file;
* **the lockups** are well-formed, carry the mark exactly, set the wordmark as
  outlines (no <text>, no font-family — a lockup that reflows in a fallback
  face is not a lockup) and use the right palette for their background;
* **the rasters are the drawing** — the PNGs are decoded with zlib and sampled
  where the geometry says the star, a bracket, the tile and the transparent
  corner are; sizes and opacity are checked for every icon and card;
* **the rules hold** — the maskable glyph fits the platform's safe circle, the
  accent-for-text on light surfaces is WCAG AA, the glyph keeps its contrast
  on the tile, and every brand file a page links exists.

If it fails after a deliberate change to mark.py, the fix is to regenerate
(brand/README.md), not to edit this file.
"""
from __future__ import annotations

import os
import struct
import sys
import xml.etree.ElementTree as ET
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import mark as M  # noqa: E402  (standard library only)

NS = "{http://www.w3.org/2000/svg}"
problems: list[str] = []


def fail(message: str) -> None:
    problems.append(message)


def read(name: str, mode: str = "r"):
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        fail(f"{name} is missing — run brand/gen_assets.py")
        return None
    with open(path, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as fh:
        return fh.read()


# ------------------------------------------------------------------ PNG ----
def png_pixels(name: str, rows_needed: int | None = None):
    """(width, height, channels, rows) for an 8-bit RGB/RGBA PNG, unfiltered
    with the standard library. Only the first `rows_needed` rows are decoded
    (a PNG row depends only on the row above it)."""
    data = read(name, "rb")
    if data is None:
        return None
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"{name} is not a PNG")
        return None
    pos, idat, header = 8, [], None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat.append(body)
        pos += 12 + length
    width, height, depth, colour_type, _, _, interlace = header
    channels = {2: 3, 6: 4}.get(colour_type)
    if depth != 8 or channels is None or interlace:
        fail(f"{name}: expected 8-bit RGB or RGBA, non-interlaced (got depth {depth}, "
             f"colour type {colour_type}, interlace {interlace})")
        return None
    raw = zlib.decompress(b"".join(idat))
    stride = width * channels
    rows, previous = [], bytearray(stride)
    for y in range(height if rows_needed is None else min(rows_needed, height)):
        start = y * (stride + 1)
        kind, line = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            if kind == 1:
                line[i] = (line[i] + left) & 255
            elif kind == 2:
                line[i] = (line[i] + up) & 255
            elif kind == 3:
                line[i] = (line[i] + ((left + up) >> 1)) & 255
            elif kind == 4:
                corner = previous[i - channels] if i >= channels else 0
                p = left + up - corner
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                line[i] = (line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else corner)) & 255
        rows.append(line)
        previous = line
    return width, height, channels, rows


def pixel(image, x_units: float, y_units: float):
    """The pixel at a point given in mark units (0..32)."""
    width, _, channels, rows = image
    x = min(int(x_units / M.BOX * width), width - 1)
    y = min(int(y_units / M.BOX * width), len(rows) - 1)
    return tuple(rows[y][x * channels:(x + 1) * channels])


def near(actual, expected, tolerance: int = 6) -> bool:
    return all(abs(a - e) <= tolerance for a, e in zip(actual, expected))


def tile_at(y_units: float):
    t = y_units / M.BOX
    return tuple(round(a + (b - a) * t) for a, b in zip(M.TILE_TOP, M.TILE_BOTTOM))


def check_icon(name: str, size: int, *, rounded: bool, glyph_scale: float = 1.0) -> None:
    image = png_pixels(name)
    if image is None:
        return
    width, height, channels, _ = image
    if (width, height) != (size, size):
        fail(f"{name} is {width}x{height}, expected {size}x{size}")
        return
    if rounded and channels != 4:
        fail(f"{name} has no alpha channel — the rounded tile needs transparent corners")
    if name == "apple-touch-icon.png" and channels != 3:
        fail(f"{name} must be opaque (iOS draws transparency as black)")

    def g(u: float) -> float:          # a glyph coordinate, after the icon's scale
        return M.BOX / 2 + (u - M.BOX / 2) * glyph_scale

    c = M.SPARK_CENTRE
    arm_x = M.BRACKET_INSET
    arm_y = M.BRACKET_INSET + M.BRACKET_ARM * 0.7           # on the vertical arm
    samples = [
        ("the star's centre", pixel(image, g(c[0]), g(c[1])), M.PAPER),
        ("the top-left bracket", pixel(image, g(arm_x), g(arm_y)), M.ACCENT),
        ("the bottom-right bracket", pixel(image, g(M.BOX - arm_x), g(M.BOX - arm_y)), M.ACCENT),
        ("the tile between star and bracket", pixel(image, 16, 27), tile_at(27)),
    ]
    for label, got, want in samples:
        if not near(got[:3], want, 8):
            fail(f"{name}: {label} is {got[:3]}, the geometry says {tuple(want)}")
        if channels == 4 and got[3] < 250:
            fail(f"{name}: {label} is not opaque (alpha {got[3]})")
    corner = pixel(image, 0.2, 0.2)
    if rounded and corner[3] != 0:
        fail(f"{name}: the corner outside the rounded tile is not transparent (alpha {corner[3]})")
    if not rounded and (channels == 4 and corner[3] != 255 or not near(corner[:3], M.TILE_TOP, 8)):
        fail(f"{name}: a full-bleed icon's corner must be the tile surface, got {corner}")


# ------------------------------------------------------------------- main ---
def main() -> int:
    # 1. The vectors are exactly what mark.py draws.
    expected = {
        "logo-mark.svg": M.svg_mark(),
        "favicon.svg": M.svg_mark(),
        "logo-mark-mono-dark.svg": M.svg_mono(M.INK),
        "logo-mark-mono-light.svg": M.svg_mono(M.PAPER),
    }
    for name, want in expected.items():
        got = read(name)
        if got is not None and got != want:
            fail(f"{name} is not what brand/mark.py draws — regenerate with brand/gen_assets.py")

    # 2. The lockups.
    mark_defs, mark_body = M.mark_group(0, 0, 76.0, "l")
    # The accent word is the HOUSE colour (DESIGN.md §3): the lockup is a
    # brand object and must not follow the visitor's UI accent.
    for name, ink, accent in (("logo-lockup-dark.svg", M.TEXT, M.HOUSE_ACCENT),
                              ("logo-lockup-light.svg", M.INK, M.HOUSE_ON_LIGHT)):
        text = read(name)
        if text is None:
            continue
        try:
            root = ET.fromstring(text)
        except ET.ParseError as error:
            fail(f"{name} is not well-formed XML: {error}")
            continue
        if root.find(f".//{NS}text") is not None or "font-family" in text:
            fail(f"{name} sets its wordmark as <text> — it must be outlines")
        if mark_body not in text or mark_defs not in text:
            fail(f"{name} does not carry the mark exactly as brand/mark.py draws it")
        fills = {p.get("fill") for p in root.iter(f"{NS}path")}
        for colour, role in ((ink, "wordmark"), (accent, "accent word")):
            if M.hex_triplet(colour) not in fills:
                fail(f"{name}: no {role} in {M.hex_triplet(colour)}")
        if len(fills) > 5:
            fail(f"{name}: {len(fills)} different fills — the palette has drifted")

    # 3. The rasters.
    check_icon("icon-192.png", 192, rounded=True)
    check_icon("icon-512.png", 512, rounded=True)
    check_icon("icon-maskable-512.png", 512, rounded=False, glyph_scale=M.MASKABLE_SCALE)
    check_icon("apple-touch-icon.png", 180, rounded=False)
    for name, size in (("og-brand.png", (1200, 630)), ("logo.png", (1024, 1024))):
        image = png_pixels(name, rows_needed=1)
        if image and image[:2] != size:
            fail(f"{name} is {image[0]}x{image[1]}, expected {size[0]}x{size[1]}")
    if read("og-brand.png", "rb") != read("og-tools.png", "rb"):
        fail("og-tools.png is not the same card as og-brand.png")
    ico = read("favicon.ico", "rb")
    if ico:
        _, kind, count = struct.unpack("<HHH", ico[:6])
        sizes = sorted((ico[6 + 16 * i] or 256) for i in range(count))
        if kind != 1 or sizes != [16, 32, 48]:
            fail(f"favicon.ico holds {sizes}, expected [16, 32, 48]")

    # 4. The rules.
    reach = M.glyph_extent() * M.MASKABLE_SCALE
    if reach > M.MASKABLE_SAFE_RADIUS:
        fail(f"the maskable glyph reaches {reach:.2f} units from the centre; "
             f"the safe circle is {M.MASKABLE_SAFE_RADIUS:.1f} — lower MASKABLE_SCALE")
    for label, colour, floor in (("the accent for text on light", M.ACCENT_ON_LIGHT, 4.5),
                                 ("the house accent for text on light", M.HOUSE_ON_LIGHT, 4.5)):
        ratio = M.contrast(colour, M.PAPER)
        if ratio < floor:
            fail(f"{label} is {ratio:.2f}:1 on white; WCAG AA text needs {floor}:1")
    ratio = M.contrast(M.HOUSE_ACCENT, M.TILE_INK)
    if ratio < 3.0:
        fail(f"the house accent is {ratio:.2f}:1 on the page; a fill needs 3:1 (WCAG non-text)")
    for label, colour, floor in (("the brackets", M.ACCENT, 7.0), ("the star", M.PAPER, 12.0)):
        ratio = M.contrast(colour, M.TILE_TOP)
        if ratio < floor:
            fail(f"{label} are {ratio:.2f}:1 on the tile's lightest stop — below {floor}:1 "
                 "they start to dissolve at 16 px")
    for name in ("favicon.ico", "favicon.svg", "logo-mark.svg", "icon-192.png", "icon-512.png",
                 "icon-maskable-512.png", "apple-touch-icon.png", "og-brand.png", "og-tools.png"):
        if not os.path.exists(os.path.join(ROOT, name)):
            fail(f"{name} is linked by pages but missing from the repository")

    if problems:
        print("MARK CHECK FAILED — a shipped logo file is no longer brand/mark.py's drawing:")
        for message in problems:
            print("  ✗", message)
        return 1
    print("MARK CHECK OK — the mark, favicon and mono SVGs are exactly mark.py's drawing, "
          "both lockups carry it with an outlined wordmark, the icons sample true "
          "(star, brackets, tile, corners), the maskable glyph is inside the safe circle "
          "and the colour rules hold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
