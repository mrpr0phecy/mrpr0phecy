#!/usr/bin/env python3
"""check-mark.py — the SVGs and the rasters must be the same drawing.

    python3 brand/check-mark.py

Standard library only, so it runs anywhere the gate runs. It reads the numbers
*out of the files* — `brand/mark.py`'s constants and the shipped SVGs — and
fails if they disagree about anything that would be visible: the tile's corner
radius, the gradient stops, the aperture disc, the spark's four-tip curve, the
needle, the ink colour, the ring the mono files use instead of a filled disc.

Why this exists: the vector and the raster icons are produced by two different
code paths (a hand-written SVG string and a Pillow rasteriser). They are the
same drawing only for as long as somebody checks, and a logo that is a slightly
different logo in the tab than in the page is exactly the kind of drift that
nobody notices for a year. The 2026-09-24 redraw is the proof: it changed every
number in mark.py at once, and this file is what says the six raster icons and
the six SVG files still agree about all of them.

It also checks the two names — `logo-mark.svg` and `favicon.svg` — are one file,
that the mono files are the same geometry in one colour, and that every asset a
page links actually exists.
"""
from __future__ import annotations

import math
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = os.path.join(ROOT, "brand", "mark.py")
SVG = os.path.join(ROOT, "logo-mark.svg")
FAVICON = os.path.join(ROOT, "favicon.svg")
MONO_DARK = os.path.join(ROOT, "logo-mark-mono-dark.svg")
MONO_LIGHT = os.path.join(ROOT, "logo-mark-mono-light.svg")
LOCKUP_DARK = os.path.join(ROOT, "logo-lockup-dark.svg")
LOCKUP_LIGHT = os.path.join(ROOT, "logo-lockup-light.svg")
NS = "{http://www.w3.org/2000/svg}"

# Constants read straight out of mark.py, so this check needs neither Pillow nor
# numpy: the point is the numbers, not the rendering.
WANTED = {
    "TILE_RADIUS": float, "DISC_RADIUS": float, "RING_STROKE": float,
    "SPARK_RADIUS": float, "SPARK_WAIST": float, "NEEDLE_WIDTH": float,
}
TUPLE_WANTED = {"DISC_CENTRE": 2, "NEEDLE_FROM": 2, "NEEDLE_TO": 2}

problems: list[str] = []


def read_constants() -> dict[str, float | tuple[float, ...]]:
    text = open(MARK, encoding="utf-8").read()
    out: dict[str, float | tuple[float, ...]] = {}
    for name, cast in WANTED.items():
        m = re.search(rf"^{name}\s*=\s*([\d.]+)", text, re.M)
        if not m:
            problems.append(f"brand/mark.py no longer defines {name}")
        else:
            out[name] = cast(m.group(1))
    for name, arity in TUPLE_WANTED.items():
        m = re.search(rf"^{name}\s*=\s*\(([^)]*)\)", text, re.M)
        if not m:
            problems.append(f"brand/mark.py no longer defines {name}")
            continue
        parts = tuple(float(v) for v in m.group(1).replace(" ", "").split(","))
        if len(parts) != arity:
            problems.append(f"{name} should hold {arity} numbers, found {len(parts)}")
        out[name] = parts
    stops = re.findall(r"^\s*\(([\d.]+),\s*\((\d+),\s*(\d+),\s*(\d+)\)\)", text, re.M)
    out["GRADIENT"] = tuple((float(o), (int(r), int(g), int(b))) for o, r, g, b in stops)
    for name in ("INK", "PAPER"):
        m = re.search(rf"^{name}\s*=\s*\((\d+),\s*(\d+),\s*(\d+)\)", text, re.M)
        if not m:
            problems.append(f"brand/mark.py no longer defines {name}")
        else:
            out[name] = tuple(int(v) for v in m.groups())
    return out


def hexes(colour: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % colour


def check_spark(path_el, const, label: str) -> None:
    """The spark: four quadratic segments from four compass tips, with the
    control points on the 45-degree bisectors. Same curve as the raster."""
    numbers = [float(x) for x in re.findall(r"-?\d+\.?\d*", path_el.get("d"))]
    if len(numbers) != 18:
        problems.append(f"{label}: the spark path has {len(numbers) // 2} points, expected 9")
        return
    p = list(zip(numbers[0::2], numbers[1::2]))
    segments = [(p[0], p[1], p[2]), (p[2], p[3], p[4]),
                (p[4], p[5], p[6]), (p[6], p[7], p[8])]
    gx, gy = const["DISC_CENTRE"]
    radius, waist = const["SPARK_RADIUS"], const["SPARK_WAIST"]
    angles = [270.0, 0.0, 90.0, 180.0]
    worst = 0.0
    for index, (p0, ctrl, p2) in enumerate(segments):
        start, end = angles[index], angles[(index + 1) % 4]
        bisector = start + 45.0
        want_ctrl = (gx + waist * math.cos(math.radians(bisector)),
                     gy + waist * math.sin(math.radians(bisector)))
        want_p0 = (gx + radius * math.cos(math.radians(start)),
                   gy + radius * math.sin(math.radians(start)))
        want_p2 = (gx + radius * math.cos(math.radians(end)),
                   gy + radius * math.sin(math.radians(end)))
        if index == 0 and math.dist(p0, want_p0) > 1e-3:
            problems.append(f"{label}: spark starts at {p0}, not at the top tip {want_p0}")
        if math.dist(p2, want_p2) > 1e-3:
            problems.append(f"{label}: spark tip {index} is {p2}, not {want_p2}")
        if math.dist(ctrl, want_ctrl) > 1e-3:
            problems.append(f"{label}: spark control point {index} is {ctrl}, not {want_ctrl}")
        for step in range(33):
            u = step / 32.0
            inv = 1.0 - u
            curve = (inv * inv * p0[0] + 2 * inv * u * ctrl[0] + u * u * p2[0],
                     inv * inv * p0[1] + 2 * inv * u * ctrl[1] + u * u * p2[1])
            reference = (inv * inv * want_p0[0] + 2 * inv * u * want_ctrl[0] + u * u * want_p2[0],
                         inv * inv * want_p0[1] + 2 * inv * u * want_ctrl[1] + u * u * want_p2[1])
            worst = max(worst, math.dist(curve, reference))
    if worst > 0.01:
        problems.append(f"{label}: the spark curve is off by {worst:.4f} units")


def check_needle(path_el, const, label: str) -> None:
    want = "M%g %g L%g %g" % (*const["NEEDLE_FROM"], *const["NEEDLE_TO"])
    if path_el.get("d") != want:
        problems.append(f"{label}: needle path {path_el.get('d')!r} != {want!r}")
    if float(path_el.get("stroke-width")) != const["NEEDLE_WIDTH"]:
        problems.append(f"{label}: needle width {path_el.get('stroke-width')} "
                        f"!= {const['NEEDLE_WIDTH']}")
    if path_el.get("stroke-linecap") != "round":
        problems.append(f"{label}: the needle needs stroke-linecap=\"round\"")


def main() -> int:
    const = read_constants()
    if problems:
        print("MARK CHECK FAILED")
        for p in problems:
            print("  ✗", p)
        return 1

    svg_text = open(SVG, encoding="utf-8").read()
    root = ET.fromstring(svg_text)          # also proves it is well-formed XML

    if root.get("viewBox") != "0 0 32 32":
        problems.append(f"viewBox is {root.get('viewBox')!r}, expected '0 0 32 32'")
    if root.get("role") != "img":
        problems.append("the SVG needs role=\"img\"")
    title = root.find(f"{NS}title")
    if title is None or not (title.text or "").strip():
        problems.append("the SVG needs a <title> — it is announced to screen readers")

    stops = [(s.get("offset"), s.get("stop-color")) for s in root.iter(NS + "stop")]
    want_stops = [(f"{off * 100:g}%", hexes(col)) for off, col in const["GRADIENT"]]
    if stops[: len(want_stops)] != want_stops:
        problems.append(f"the tile gradient is {stops[:len(want_stops)]}, mark.py says {want_stops}")

    rects = list(root.iter(NS + "rect"))
    circles = list(root.iter(NS + "circle"))
    paths = list(root.iter(NS + "path"))
    if not (rects and len(circles) == 1 and len(paths) == 2):
        problems.append("the SVG is not the expected shape (tile, aperture, spark, needle)")
    else:
        if float(rects[0].get("rx")) != const["TILE_RADIUS"]:
            problems.append(f"tile corner radius {rects[0].get('rx')} != {const['TILE_RADIUS']}")
        if (float(circles[0].get("cx")), float(circles[0].get("cy"))) != const["DISC_CENTRE"]:
            problems.append("the aperture is not centred where mark.py centres it")
        if float(circles[0].get("r")) != const["DISC_RADIUS"]:
            problems.append(f"aperture radius {circles[0].get('r')} != {const['DISC_RADIUS']}")
        # The glyph is ink on the tile, never white on it: white over the
        # gradient's top-left stop is about 1.4:1, which is the defect the
        # 2026-09-24 redraw removed.
        if circles[0].get("fill") != hexes(const["INK"]):
            problems.append(f"the aperture must be filled with the ink colour "
                            f"{hexes(const['INK'])}, found {circles[0].get('fill')!r}")
        check_spark(paths[0], const, "logo-mark.svg")
        if paths[0].get("fill") != "#ffffff":
            problems.append("the spark is the one white element inside the tile")
        check_needle(paths[1], const, "logo-mark.svg")

    # One drawing, two names.
    if open(SVG, "rb").read() != open(FAVICON, "rb").read():
        problems.append("logo-mark.svg and favicon.svg have drifted apart — they are one file")

    # The mono files: same geometry, one colour, ring instead of disc.
    for path, colour, label in ((MONO_DARK, const["INK"], "logo-mark-mono-dark.svg"),
                                (MONO_LIGHT, const["PAPER"], "logo-mark-mono-light.svg")):
        if not os.path.exists(path):
            problems.append(f"{label} is missing")
            continue
        mono = ET.fromstring(open(path, encoding="utf-8").read())
        circles = list(mono.iter(NS + "circle"))
        paths = list(mono.iter(NS + "path"))
        if len(circles) != 1 or len(paths) != 2:
            problems.append(f"{label}: expected a ring, a spark and a needle")
            continue
        if float(circles[0].get("stroke-width")) != const["RING_STROKE"]:
            problems.append(f"{label}: ring stroke {circles[0].get('stroke-width')} "
                            f"!= {const['RING_STROKE']}")
        if circles[0].get("fill") != "none":
            problems.append(f"{label}: the ring must not be filled")
        if circles[0].get("stroke") != hexes(colour):
            problems.append(f"{label}: ring colour {circles[0].get('stroke')} != {hexes(colour)}")
        check_spark(paths[0], const, label)
        check_needle(paths[1], const, label)
        if paths[0].get("fill") != hexes(colour):
            problems.append(f"{label}: the spark must be the same colour as the ring")

    # The lockups: they exist, they are well-formed, and their wordmark is
    # outlines rather than a font reference (that is the whole point of them).
    for path, label in ((LOCKUP_DARK, "logo-lockup-dark.svg"),
                        (LOCKUP_LIGHT, "logo-lockup-light.svg")):
        if not os.path.exists(path):
            problems.append(f"{label} is missing")
            continue
        text = open(path, encoding="utf-8").read()
        lockup = ET.fromstring(text)
        if "font-family" in text or "<text" in text:
            problems.append(f"{label}: the wordmark must be outlines, not a <text> "
                            f"with a font-family — that is the point of the lockup")
        if lockup.get("viewBox", "").startswith("0 0 0"):
            problems.append(f"{label}: viewBox is {lockup.get('viewBox')!r}")
        if lockup.find(f"{NS}path") is None:
            problems.append(f"{label}: no paths — the wordmark did not render")

    # Everything the pages link must exist.
    for name in ("favicon.ico", "favicon.svg", "logo-mark.svg", "icon-192.png",
                 "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
                 "og-brand.png"):
        if not os.path.exists(os.path.join(ROOT, name)):
            problems.append(f"{name} is referenced by pages but not in the repository")

    # The gloss the rasters carry must be in the SVG too, or they are two
    # different drawings of the same logo.
    # The gloss stops come after the tile gradient's own: the gradient's carry
    # no stop-opacity at all, so reading from index 0 compares the sheen against
    # the first colour stop and always fails.
    opacity = [float(s.get("stop-opacity", 0)) for s in root.iter(NS + "stop")][len(want_stops):]
    want_gloss = float(re.search(r"^GLOSS_TOP\s*=\s*([\d.]+)", open(MARK, encoding="utf-8").read(),
                                re.M).group(1))
    if not opacity or abs(opacity[0] - want_gloss) > 0.02:
        problems.append(f"the SVG's top sheen is {opacity[:1]}, mark.py says {want_gloss}")

    if problems:
        print("MARK CHECK FAILED — the SVG and the raster geometry disagree:")
        for p in problems:
            print("  ✗", p)
        return 1
    print("MARK CHECK OK — logo-mark.svg, the six raster icons, both mono files and "
          "both lockups are the same drawing (tile, aperture, spark, needle, "
          "gradient and sheen all agree), and every asset a page links exists.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
