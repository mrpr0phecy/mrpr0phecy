#!/usr/bin/env python3
"""check-mark.py — the SVG and the rasters must be the same drawing.

    python3 brand/check-mark.py

Standard library only, so it runs anywhere the gate runs. It reads the numbers
*out of the files* — `brand/mark.py`'s constants and the shipped
`logo-mark.svg` — and fails if they disagree about anything that would be
visible: the tile's corner radius, the gradient stops, the lens, the handle,
the glyph's scale, the spark's four-tip curve.

Why this exists: the vector and the raster icons are produced by two different
code paths (a hand-written SVG string and a Pillow rasteriser). They are the
same drawing only for as long as somebody checks, and a logo that is a slightly
different logo in the tab than in the page is exactly the kind of drift that
nobody notices for a year.

It also checks the two names — `logo-mark.svg` and `favicon.svg` — are one file,
and that every asset the pages link actually exists.
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
NS = "{http://www.w3.org/2000/svg}"

# Constants read straight out of mark.py, so this check needs neither Pillow nor
# numpy: the point is the numbers, not the rendering.
WANTED = {
    "TILE_RADIUS": float, "LENS_RADIUS": float, "LENS_STROKE": float,
    "HANDLE_WIDTH": float, "SPARK_RADIUS": float, "SPARK_WAIST": float,
    "GLYPH_SCALE": float,
}
TUPLE_WANTED = {"LENS_CENTRE": 2, "HANDLE_FROM": 2, "HANDLE_TO": 2}

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
    return out


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
    want_stops = [(f"{off * 100:g}%", "#%02x%02x%02x" % col) for off, col in const["GRADIENT"]]
    if stops[: len(want_stops)] != want_stops:
        problems.append(f"the tile gradient is {stops[:len(want_stops)]}, mark.py says {want_stops}")

    rects = list(root.iter(NS + "rect"))
    circles = list(root.iter(NS + "circle"))
    paths = list(root.iter(NS + "path"))
    groups = list(root.iter(NS + "g"))
    if not (rects and len(circles) == 2 and len(paths) == 2 and groups):
        problems.append("the SVG is not the expected shape (tile, lens, ring, handle, spark)")
    else:
        if float(rects[0].get("rx")) != const["TILE_RADIUS"]:
            problems.append(f"tile corner radius {rects[0].get('rx')} != {const['TILE_RADIUS']}")
        if (float(circles[0].get("cx")), float(circles[0].get("cy"))) != const["LENS_CENTRE"]:
            problems.append("the lens is not centred where mark.py centres it")
        if float(circles[0].get("r")) != const["LENS_RADIUS"]:
            problems.append(f"lens radius {circles[0].get('r')} != {const['LENS_RADIUS']}")
        if float(circles[1].get("stroke-width")) != const["LENS_STROKE"]:
            problems.append(f"ring stroke {circles[1].get('stroke-width')} != {const['LENS_STROKE']}")
        want_handle = "M%g %g L%g %g" % (*const["HANDLE_FROM"], *const["HANDLE_TO"])
        if paths[0].get("d") != want_handle:
            problems.append(f"handle path {paths[0].get('d')!r} != {want_handle!r}")
        if float(paths[0].get("stroke-width")) != const["HANDLE_WIDTH"]:
            problems.append(f"handle width {paths[0].get('stroke-width')} != {const['HANDLE_WIDTH']}")
        want_transform = f"translate(16 16) scale({const['GLYPH_SCALE']:g}) translate(-16 -16)"
        if groups[-1].get("transform") != want_transform:
            problems.append(f"glyph transform {groups[-1].get('transform')!r} != {want_transform!r}")
        if paths[1].get("fill") != "#ffffff":
            problems.append("the spark must be white")

        # The spark: four quadratic segments from four compass tips, with the
        # control points on the 45-degree bisectors. Same curve as the raster.
        numbers = [float(x) for x in re.findall(r"-?\d+\.?\d*", paths[1].get("d"))]
        if len(numbers) != 18:
            problems.append(f"the spark path has {len(numbers) // 2} points, expected 9")
        else:
            p = list(zip(numbers[0::2], numbers[1::2]))
            segments = [(p[0], p[1], p[2]), (p[2], p[3], p[4]),
                        (p[4], p[5], p[6]), (p[6], p[7], p[8])]
            gx, gy = const["LENS_CENTRE"]
            radius, waist, scale = const["SPARK_RADIUS"], const["SPARK_WAIST"], 1.0
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
                    problems.append(f"spark starts at {p0}, not at the top tip {want_p0}")
                if math.dist(p2, want_p2) > 1e-3:
                    problems.append(f"spark tip {index} is {p2}, not {want_p2}")
                if math.dist(ctrl, want_ctrl) > 1e-3:
                    problems.append(f"spark control point {index} is {ctrl}, not {want_ctrl}")
                for step in range(33):
                    u = step / 32.0
                    inv = 1.0 - u
                    curve = (inv * inv * p0[0] + 2 * inv * u * ctrl[0] + u * u * p2[0],
                             inv * inv * p0[1] + 2 * inv * u * ctrl[1] + u * u * p2[1])
                    reference = (inv * inv * want_p0[0] + 2 * inv * u * want_ctrl[0] + u * u * want_p2[0],
                                 inv * inv * want_p0[1] + 2 * inv * u * want_ctrl[1] + u * u * want_p2[1])
                    worst = max(worst, math.dist(curve, reference))
            if worst > 0.01:
                problems.append(f"the spark curve is off by {worst:.4f} units")

    # One drawing, two names.
    if open(SVG, "rb").read() != open(FAVICON, "rb").read():
        problems.append("logo-mark.svg and favicon.svg have drifted apart — they are one file")

    # Everything the pages link must exist.
    for name in ("favicon.ico", "favicon.svg", "logo-mark.svg", "icon-192.png",
                 "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
                 "og-brand.png"):
        if not os.path.exists(os.path.join(ROOT, name)):
            problems.append(f"{name} is referenced by pages but not in the repository")

    # The gloss the rasters carry must be in the SVG too, or they are two
    # different drawings of the same logo.
    opacity = [float(s.get("stop-opacity", 0)) for s in root.iter(NS + "stop")][3:]
    if not opacity or abs(opacity[0] - 0.20) > 0.02:
        problems.append(f"the SVG's top sheen is {opacity[:1]}, expected ~0.20")

    if problems:
        print("MARK CHECK FAILED — the SVG and the raster geometry disagree:")
        for p in problems:
            print("  ✗", p)
        return 1
    print("MARK CHECK OK — logo-mark.svg is the same drawing as the raster "
          "icons (geometry, gradient and sheen all agree), and every asset a "
          "page links exists.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
