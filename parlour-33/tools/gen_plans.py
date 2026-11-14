#!/usr/bin/env python3
"""
PARLOUR XXXIII — schematic plan generator.

One coordinate model drives every drawing, so the plans can never drift
from the written spec.

Coordinate contract
-------------------
  Region              256 x 256 m, plaza / street at +20.00
  Building centre     128.00, 128.00  (region metres)
  Drum (outer wall)   radius 36.00 m  -> 72 m diameter
  The Oculus (shaft)  radius 14.00 m  -> 28 m diameter, open L0 -> roof
  Floor to floor      5.50 m
  The Flood +24.00  ->  The Crown +51.50  ->  Roof +57.00  (33.00 m)

Run:  python3 parlour-33/tools/gen_plans.py
Out:  parlour-33/plans/*.svg
"""

import math
import os
import re

# ------------------------------------------------------------------ canvas ---

S = 9.9                    # px per metre on the plan sheets
WIN = 100.0                # plan window, metres
X0, Z0 = 78.0, 78.0        # south-west corner of the window (world metres)
PX0, PY0 = 46.0, 84.0      # plan origin on the page
PLAN = WIN * S             # 990 px
W = int(PX0 * 2 + PLAN + 356)
H = int(PY0 + PLAN + 112)

CX, CZ = 128.0, 128.0
R_DRUM = 36.0
R_SHAFT = 14.0
PLAZA = 20.00

LEVELS_Y = {
    "U1": 14.00, "U2": 16.40,
    "L0": 24.00, "L1": 29.50, "L2": 35.00,
    "L3": 40.50, "L4": 46.00, "L5": 51.50,
    "ROOF": 57.00,
}

# ----------------------------------------------------------------- palette ---

INK = "#07070A"
PAPER = "#E8E1D0"
DIM = "#6E6A60"
FAINT = "#3A3B44"
GRID = "#15161C"

FILL = {
    "void":      ("#071417", "#23E5D4"),
    "structure": ("#15161B", "#8C8570"),
    "back":      ("#0E0F13", "#4A463C"),
    "water":     ("#0C2E38", "#23E5D4"),
    "ice":       ("#16242E", "#9FE6F2"),
    "lane":      ("#2A2018", "#C9A24A"),
    "arcade":    ("#1E1026", "#FF2E88"),
    "casino":    ("#1A1218", "#C9A24A"),
    "dark":      ("#0B0B0E", "#6A6A78"),
    "net":       ("#141D16", "#7FE0A0"),
    "golf":      ("#131A14", "#A8C46A"),
    "kart":      ("#241512", "#FFA23A"),
    "coaster":   ("#1A0B12", "#FF2E88"),
    "bar":       ("#1E1416", "#E8646E"),
    "service":   ("#0C0C10", "#3A3A44"),
}


def px(x, z):
    return PX0 + (x - X0) * S, PY0 + (Z0 + WIN - z) * S


def esc(s):
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return s


def arc_pts(cx, cz, r, a0, a1, step=2.0):
    n = max(2, int(abs(a1 - a0) / step) + 1)
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1))))
            for i in range(n)]


def pts_attr(pts, close=True):
    d = " ".join(f"{px(x, z)[0]:.1f},{px(x, z)[1]:.1f}" for x, z in pts)
    return d + (" " + d.split(" ")[0] if close else "")


# ------------------------------------------------------------------ shapes ---

def geom(kind, g):
    """Return (svg geometry string, anchor world point)."""
    if kind == "circle":
        cx, cz, r = g
        x, y = px(cx, cz)
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*S:.1f}" ',
                (cx, cz))
    if kind == "ring":
        cx, cz, r0, r1 = g
        pts = arc_pts(cx, cz, r1, 0, 360, 3) + arc_pts(cx, cz, r0, 360, 0, 3)
        return (f'<polygon points="{pts_attr(pts)}" ', (cx, cz))
    if kind == "sector":
        cx, cz, r0, r1, a0, a1 = g
        pts = arc_pts(cx, cz, r1, a0, a1) + arc_pts(cx, cz, r0, a1, a0)
        am = math.radians((a0 + a1) / 2.0)
        rm = (r0 + r1) / 2.0
        return (f'<polygon points="{pts_attr(pts)}" ',
                (cx + rm * math.cos(am), cz + rm * math.sin(am)))
    if kind == "rect":
        x0, z0, x1, z1 = g
        ax, ay = px(x0, max(z0, z1))
        return (f'<rect x="{ax:.1f}" y="{ay:.1f}" width="{abs(x1-x0)*S:.1f}" '
                f'height="{abs(z1-z0)*S:.1f}" ',
                ((x0 + x1) / 2.0, (z0 + z1) / 2.0))
    if kind == "path":
        return (f'<polygon points="{pts_attr(g)}" ',
                (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)))
    raise ValueError(kind)


def draw_zone(z, idx, col):
    kind, g, name, key = z[0], z[1], z[2], z[3]
    fill, stroke = FILL[key]
    tags, anchor = geom_nonfill(kind, g, fill, stroke, key)
    ax, ay = px(*anchor)
    marker = (
        f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="10.5" fill="#07070A" '
        f'fill-opacity="0.92" stroke="{col}" stroke-width="1.4"/>'
        f'<text x="{ax:.1f}" y="{ay+3.6:.1f}" fill="{col}" font-size="11" '
        f'text-anchor="middle" font-family="ui-monospace,monospace" '
        f'font-weight="700">{idx}</text>')
    return tags, marker


def geom_nonfill(kind, g, fill, stroke, key):
    style = (f'fill="{fill}" stroke="{stroke}" stroke-width="1.6" '
             f'stroke-opacity="0.95"')
    if kind == "circle":
        cx, cz, r = g
        x, y = px(cx, cz)
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*S:.1f}" {style}/>',
                (cx, cz))
    if kind == "ring":
        cx, cz, r0, r1 = g
        pts = arc_pts(cx, cz, r1, 0, 360, 3) + arc_pts(cx, cz, r0, 360, 0, 3)
        return f'<polygon points="{pts_attr(pts)}" {style}/>', (cx, cz)
    if kind == "sector":
        cx, cz, r0, r1, a0, a1 = g
        pts = arc_pts(cx, cz, r1, a0, a1) + arc_pts(cx, cz, r0, a1, a0)
        am = math.radians((a0 + a1) / 2.0)
        rm = (r0 + r1) / 2.0
        return (f'<polygon points="{pts_attr(pts)}" {style}/>',
                (cx + rm * math.cos(am), cz + rm * math.sin(am)))
    if kind == "rect":
        x0, z0, x1, z1 = g
        ax, ay = px(x0, max(z0, z1))
        return (f'<rect x="{ax:.1f}" y="{ay:.1f}" width="{abs(x1-x0)*S:.1f}" '
                f'height="{abs(z1-z0)*S:.1f}" {style}/>',
                ((x0 + x1) / 2.0, (z0 + z1) / 2.0))
    if kind == "path":
        return (f'<polygon points="{pts_attr(g)}" {style}/>',
                (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)))
    raise ValueError(kind)


# ------------------------------------------------------------------- shell ---

def shell(with_context=True):
    o = []
    x, y = px(CX, CZ)
    if with_context:                                  # kart ring outside the drum
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{46*S:.1f}" fill="none" '
                 f'stroke="#FFA23A" stroke-width="1" stroke-opacity="0.45" '
                 f'stroke-dasharray="3 7"/>')
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{38*S:.1f}" fill="none" '
                 f'stroke="#FFA23A" stroke-width="1" stroke-opacity="0.45" '
                 f'stroke-dasharray="3 7"/>')
        o.append(f'<text x="{x:.1f}" y="{y - 42*S:.1f}" fill="#FFA23A" font-size="10" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace" '
                 f'opacity="0.75">THE SPIRAL · KART HELIX r 38–46</text>')
    # drum
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{R_DRUM*S:.1f}" fill="none" '
             f'stroke="#C9A24A" stroke-width="3.5"/>')
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{(R_DRUM-0.7)*S:.1f}" fill="none" '
             f'stroke="#C9A24A" stroke-width="0.9" opacity="0.45"/>')
    # oculus
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{R_SHAFT*S:.1f}" fill="#23E5D4" '
             f'fill-opacity="0.05" stroke="#23E5D4" stroke-width="1.8" '
             f'stroke-dasharray="9 6"/>')
    # four needles
    for ang, nm in ((45, "I"), (135, "II"), (225, "III"), (315, "IV")):
        cx = CX + 30 * math.cos(math.radians(ang))
        cz = CZ + 30 * math.sin(math.radians(ang))
        ax, ay = px(cx, cz)
        o.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="{2.4*S:.1f}" fill="#0E0E12" '
                 f'stroke="{PAPER}" stroke-width="1.3" opacity="0.9"/>')
        o.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="{1.1*S:.1f}" fill="{PAPER}" '
                 f'fill-opacity="0.5"/>')
        o.append(f'<text x="{ax:.1f}" y="{ay+3.4:.1f}" fill="{PAPER}" font-size="8.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace" '
                 f'opacity="0.85">{nm}</text>')
    return "".join(o)


# ------------------------------------------------------------------ levels ---

def golf(a0, a1, holes):
    return ("sector", (CX, CZ, 31.0, 36.0, a0, a1), "THE RIBBON", "golf")


LEVELS = [
    dict(code="U1", name="THE SUMP", strap="arrival, the Hive, the Hoodwink",
         zones=[
             ("sector", (CX, CZ, 4.0, 19.0, 195, 285), "the Sump lobby", "structure"),
             ("rect", (119, 100, 130, 110), "the Hive — token booth", "bar"),
             ("rect", (119, 96, 134, 107), "cloakroom", "service"),
             ("rect", (138, 102, 150, 113), "the Hoodwink — airlock", "dark"),
             ("rect", (124, 160, 144, 176), "the Shoebox — street entrance", "back"),
             ("sector", (CX, CZ, 20.0, 34.0, 200, 288), "coach yard, back of house", "back"),
             ("sector", (CX, CZ, 22.0, 34.0, 300, 350), "plant", "service"),
             ("sector", (CX, CZ, 22.0, 34.0, 10, 60), "plant", "service"),
             ("sector", (CX, CZ, 31.0, 36.0, 58, 132), "the Thread — ramp up to L0", "structure"),
         ],
         notes="The Fall drops six metres and you are here. One token, one door, one choice."),
    dict(code="U2", name="THE UNDERCROFT", strap="laser quest · two decks of maze · the Eye",
         zones=[
             ("sector", (CX, CZ, 2.0, 30.0, 18, 172), "laser quest field 1 400 m²", "dark"),
             ("rect", (118, 146, 132, 158), "the Eye — one-way mezzanine", "dark"),
             ("rect", (102, 138, 116, 150), "briefing — the Hoodwink", "dark"),
             ("sector", (CX, CZ, 31.0, 36.0, 80, 160), "service", "service"),
             ("sector", (CX, CZ, 31.0, 36.0, 185, 265), "service", "service"),
         ],
         notes="No windows anywhere. The only room in the House that is not allowed to be seen into."),
    dict(code="L0", name="THE FLOOD", strap="pool · grotto · swim-up bar · the Drowned Parlour",
         zones=[
             ("rect", (115, 100, 141, 115), "the pool 26 × 15 m", "water"),
             ("rect", (115, 100, 122, 107), "the Grotto — swim-up bar", "water"),
             ("sector", (CX, CZ, 16.0, 34.0, 46, 134), "the Drowned Parlour", "bar"),
             ("rect", (145, 118, 161, 138), "the Penny Parlour", "arcade"),
             ("rect", (96, 118, 112, 142), "Chrysalis — changing warren", "service"),
             ("circle", (CX, CZ, 13.0), "the Sunbeam — open water in the well", "water"),
             ("sector", (CX, CZ, 31.0, 36.0, 152, 208), "the Ribbon · hole 1", "golf"),
         ],
         notes="Up the ramp, into the dark, and then you understand: the building is a well."),
    dict(code="L1", name="THE MIRROR", strap="ice rink on glass, directly above the pool",
         zones=[
             ("rect", (113, 97, 143, 115), "rink 30 × 18 m — glass deck", "ice"),
             ("rect", (113, 113, 143, 115), "Rinkside — rail bar", "bar"),
             ("rect", (104, 102, 113, 112), "the Cold Room — hire", "ice"),
             ("rect", (100, 134, 108, 144), "the Blind Door", "dark"),
             ("sector", (CX, CZ, 31.0, 36.0, 150, 212), "the Ribbon · holes 2–4", "golf"),
             ("sector", (CX, CZ, 16.0, 30.0, 8, 58), "skaters' lounge", "structure"),
             ("sector", (CX, CZ, 16.0, 30.0, 100, 142), "the Warm Room", "bar"),
         ],
         notes="Skaters look down through the ice and see swimmers. Swimmers look up and see blades."),
    dict(code="L2", name="THE LANE", strap="bowling bridge over the Oculus · Cabinet Row · the Salon",
         zones=[
             ("rect", (121, 114, 135, 144), "the Lane — 8 lanes, 25 m bridge", "lane"),
             ("sector", (CX, CZ, 16.0, 32.0, 46, 134), "the Salon — the hub", "bar"),
             ("sector", (CX, CZ, 20.0, 34.0, -44, 42), "Cabinet Row — 24 machines", "arcade"),
             ("rect", (146, 132, 157, 143), "the Fortune", "arcade"),
             ("rect", (146, 119, 157, 130), "the Claw", "arcade"),
             ("sector", (CX, CZ, 31.0, 36.0, 150, 214), "the Ribbon · holes 5–8", "golf"),
             ("rect", (121, 111, 135, 114), "pin deck — pinsetters", "lane"),
             ("rect", (121, 144, 135, 149), "approach deck", "lane"),
         ],
         notes="At the foul line the pool is eleven metres under your ball and the casino is above your pinsetters."),
    dict(code="L3", name="THE LODGE", strap="casino ring · the Croupier's Pit · the Sanctum",
         zones=[
             ("sector", (CX, CZ, 16.0, 34.0, -60, 60), "the Lodge — 12 tables", "casino"),
             ("sector", (CX, CZ, 16.0, 26.0, 62, 118), "the Sanctum", "casino"),
             ("sector", (CX, CZ, 14.0, 18.0, 168, 192), "the Croupier's Pit", "casino"),
             ("sector", (CX, CZ, 31.0, 36.0, 150, 216), "the Ribbon · holes 9–12", "golf"),
             ("sector", (CX, CZ, 24.0, 34.0, 122, 148), "the Beehive", "bar"),
             ("sector", (CX, CZ, 24.0, 34.0, 208, 250), "the Vestry — staff", "service"),
         ],
         notes="The only level with a ceiling: 3.2 m of lacquer, brass and smoke. You cannot see out — only down."),
    dict(code="L4", name="THE WARREN", strap="nets and tubes hung in the Oculus · the Nest · the Water Chute",
         zones=[
             ("sector", (CX, CZ, 1.0, 13.6, -72, 72),
              "the Warren — nets in the void", "net"),
             ("sector", (CX, CZ, 16.0, 25.0, 196, 246), "the Nest — ball pit", "net"),
             ("sector", (CX, CZ, 14.0, 20.0, 150, 188), "the Water Chute — 3 flumes", "water"),
             ("sector", (CX, CZ, 14.0, 18.0, 58, 92), "the Eye of the House", "structure"),
             ("sector", (CX, CZ, 31.0, 36.0, 150, 218), "the Ribbon · holes 13–15", "golf"),
             ("sector", (CX, CZ, 22.0, 32.0, 94, 140), "tea room", "bar"),
         ],
         notes="The only deck where you stand in the void. Everything above and below you is a game."),
    dict(code="L5", name="THE CROWN", strap="coaster station · kart pit lane · the Crown Bar · the 34th Door",
         zones=[
             ("sector", (CX, CZ, 18.0, 30.0, 40, 112), "the Thread — station, 3 trains", "coaster"),
             ("sector", (CX, CZ, 26.0, 36.0, 150, 202), "the Pit Lane — 6 karts", "kart"),
             ("sector", (CX, CZ, 16.0, 26.0, 218, 292), "the Crown Bar", "bar"),
             ("sector", (CX, CZ, 31.0, 36.0, 152, 232), "the Ribbon · holes 16–18", "golf"),
             ("rect", (124, 157, 132, 164), "the 34th Door", "dark"),
             ("sector", (CX, CZ, 22.0, 32.0, 8, 36), "plant", "service"),
         ],
         notes="Every coaster station is a promise. This one is the only one that keeps it."),
    dict(code="ROOF", name="THE BELVEDERE", strap="open roof ring · the Oculus · 33 m above the Flood",
         zones=[
             ("ring", (CX, CZ, 14.0, 30.0), "the Belvedere — open ring", "structure"),
             ("circle", (CX, CZ, 14.0), "the Oculus", "void"),
             ("circle", (CX, CZ + 20.0, 9.0), "the Crown Loop", "coaster"),
             ("path", [(150, 106), (166, 118), (168, 136), (157, 149), (144, 146), (139, 130)],
              "the Spiral — below", "kart"),
             ("sector", (CX, CZ, 22.0, 32.0, 172, 238), "roof plant", "service"),
             ("sector", (CX, CZ, 22.0, 32.0, 22, 88), "roof plant", "service"),
         ],
         notes="Thirty-three metres to the water. Photograph it at 04:00 with the parcel fog on."),
]


# ------------------------------------------------------------------- sheet ---

def plan_sheet(level):
    level["y"] = LEVELS_Y[level["code"]]
    o = [f'<rect width="{W}" height="{H}" fill="{INK}"/>']

    # ---- title
    o.append(f'<text x="{PX0}" y="44" fill="{PAPER}" font-size="21" letter-spacing="4" '
             f'font-family="ui-monospace,monospace">PARLOUR XXXIII</text>')
    o.append(f'<text x="{PX0}" y="68" fill="#C9A24A" font-size="13" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">{level["code"]}  '
             f'{level["name"]}   +{level["y"]:.2f}</text>')
    o.append(f'<text x="{PX0+250}" y="68" fill="{DIM}" font-size="12" letter-spacing="0.5" '
             f'font-family="ui-monospace,monospace">{esc(level["strap"])}</text>')

    # ---- grid
    m = 56
    while m <= 200:
        gx, _ = px(m, 0)
        _, gz = px(0, m)
        if PX0 <= gx <= PX0 + PLAN:
            o.append(f'<line x1="{gx:.1f}" y1="{PY0}" x2="{gx:.1f}" y2="{PY0+PLAN}" '
                     f'stroke="{GRID}"/>')
        if PY0 <= gz <= PY0 + PLAN:
            o.append(f'<line x1="{PX0}" y1="{gz:.1f}" x2="{PX0+PLAN}" y2="{gz:.1f}" '
                     f'stroke="{GRID}"/>')
        m += 8

    # ---- zones
    body, marks, rows = [], [], []
    idx = 0
    for z in level["zones"]:
        idx += 1
        key = z[3]
        fill, stroke = FILL[key]
        tags, anchor = geom_nonfill(z[0], z[1], fill, stroke, key)
        body.append(tags)
        ax, ay = px(*anchor)
        marks.append(
            f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="10.5" fill="#07070A" '
            f'fill-opacity="0.94" stroke="{stroke}" stroke-width="1.5"/>'
            f'<text x="{ax:.1f}" y="{ay+3.8:.1f}" fill="{stroke}" font-size="11" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-weight="700">{idx}</text>')
        rows.append((idx, stroke, z[2]))
    o.append("".join(body))
    o.append(shell())
    o.append("".join(marks))

    # ---- section line A–A
    sx0, sy0 = px(64, CZ)
    sx1, sy1 = px(192, CZ)
    o.append(f'<line x1="{sx0}" y1="{sy0}" x2="{sx1}" y2="{sy1}" stroke="{PAPER}" '
             f'stroke-width="1.2" stroke-dasharray="16 6 3 6" opacity="0.5"/>')
    o.append(f'<text x="{sx0+4}" y="{sy0-9}" fill="{PAPER}" font-size="11" opacity="0.65" '
             f'font-family="ui-monospace,monospace">A</text>')
    o.append(f'<text x="{sx1-12}" y="{sy1-9}" fill="{PAPER}" font-size="11" opacity="0.65" '
             f'font-family="ui-monospace,monospace">A</text>')

    # ---- note under the plan
    o.append(f'<text x="{PX0}" y="{PY0+PLAN+34}" fill="{DIM}" font-size="12" '
             f'letter-spacing="0.4" font-family="ui-monospace,monospace">'
             f'▸ {esc(level["notes"])}</text>')

    # ---- scale bar
    bx, by = PX0, PY0 + PLAN + 66
    o.append(f'<line x1="{bx}" y1="{by}" x2="{bx+20*S}" y2="{by}" stroke="{PAPER}" '
             f'stroke-width="1.6"/>')
    for i in range(0, 21, 5):
        o.append(f'<line x1="{bx+i*S:.1f}" y1="{by-5}" x2="{bx+i*S:.1f}" y2="{by+5}" '
                 f'stroke="{PAPER}" stroke-width="1"/>')
        o.append(f'<text x="{bx+i*S:.1f}" y="{by+19}" fill="{DIM}" font-size="10" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace">'
                 f'{i if i else "0"}</text>')
    o.append(f'<text x="{bx+22*S}" y="{by+19}" fill="{DIM}" font-size="10" '
             f'font-family="ui-monospace,monospace">metres · plan window 100 × 100 m</text>')

    # ---- north arrow
    nx, ny = PX0 + PLAN - 30, PY0 + 30
    o.append(f'<path d="M {nx} {ny-20} L {nx-8} {ny+8} L {nx} {ny+2} L {nx+8} {ny+8} Z" '
             f'fill="{PAPER}" opacity="0.8"/>')
    o.append(f'<text x="{nx}" y="{ny+24}" fill="{DIM}" font-size="11" text-anchor="middle" '
             f'font-family="ui-monospace,monospace">N</text>')

    # ---- legend
    lx = PX0 + PLAN + 44
    o.append(f'<text x="{lx}" y="{PY0+8}" fill="{DIM}" font-size="11" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">KEY</text>')
    ly = PY0 + 40
    for num, col, name in rows:
        o.append(f'<rect x="{lx}" y="{ly-9}" width="14" height="14" fill="{col}" '
                 f'fill-opacity="0.22" stroke="{col}" stroke-width="1.2"/>')
        o.append(f'<text x="{lx+7}" y="{ly+1.5}" fill="{col}" font-size="9.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace" '
                 f'font-weight="700">{num}</text>')
        o.append(f'<text x="{lx+24}" y="{ly+1.5}" fill="{PAPER}" font-size="12" '
                 f'font-family="ui-monospace,monospace">{esc(name)}</text>')
        ly += 26

    ly += 16
    for a, b, label in (
        ("#C9A24A", "3.5", "drum wall r 36"),
        ("#23E5D4", "1.8", "the Oculus r 14"),
        ("#FFA23A", "1.0", "kart helix r 38–46"),
        (PAPER, "1.3", "the Needles I–IV"),
    ):
        o.append(f'<line x1="{lx}" y1="{ly-4}" x2="{lx+30}" y2="{ly-4}" stroke="{a}" '
                 f'stroke-width="{b}"/>')
        o.append(f'<text x="{lx+38}" y="{ly}" fill="{DIM}" font-size="11" '
                 f'font-family="ui-monospace,monospace">{label}</text>')
        ly += 22
    o.append(f'<text x="{lx}" y="{ly+8}" fill="{FAINT}" font-size="10" '
             f'font-family="ui-monospace,monospace">schematic · not a prim plan</text>')

    o.append("</svg>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(o))


# ----------------------------------------------------------------- section ---

def section():
    w, h = 1520, 940
    o = [f'<rect width="{w}" height="{h}" fill="{INK}"/>']
    xx0, xx1 = 60.0, 194.0
    yy0, yy1 = 10.0, 64.0
    sx = lambda x: 150 + (x - xx0) / (xx1 - xx0) * (w - 300)
    sy = lambda y: h - 150 - (y - yy0) / (yy1 - yy0) * (h - 250)

    for m in range(64, 197, 8):
        o.append(f'<line x1="{sx(m):.1f}" y1="{sy(yy0):.1f}" x2="{sx(m):.1f}" '
                 f'y2="{sy(yy1):.1f}" stroke="{GRID}"/>')
        o.append(f'<text x="{sx(m):.1f}" y="{sy(yy0)+18:.1f}" fill="{FAINT}" font-size="9.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace">{m}</text>')
    for e in range(15, 66, 5):
        o.append(f'<line x1="{sx(xx0):.1f}" y1="{sy(e):.1f}" x2="{sx(xx1):.1f}" '
                 f'y2="{sy(e):.1f}" stroke="{GRID}"/>')
        o.append(f'<text x="{sx(xx0)-12:.1f}" y="{sy(e)+4:.1f}" fill="{FAINT}" font-size="9.5" '
                 f'text-anchor="end" font-family="ui-monospace,monospace">+{e}</text>')

    # plaza — only outside the drum; the drum itself is a well
    for a, b in ((xx0, CX - R_DRUM), (CX + R_DRUM, xx1)):
        o.append(f'<rect x="{sx(a):.1f}" y="{sy(PLAZA):.1f}" width="{sx(b)-sx(a):.1f}" '
                 f'height="{sy(yy0)-sy(PLAZA):.1f}" fill="#0C0D11"/>')
        o.append(f'<line x1="{sx(a):.1f}" y1="{sy(PLAZA):.1f}" x2="{sx(b):.1f}" '
                 f'y2="{sy(PLAZA):.1f}" stroke="{FAINT}" stroke-width="1.4"/>')
    o.append(f'<text x="{sx(xx0)+6:.1f}" y="{sy(PLAZA)-9:.1f}" fill="{DIM}" font-size="10.5" '
             f'font-family="ui-monospace,monospace">PLAZA +20.00</text>')

    # drum walls
    for x in (CX - R_DRUM, CX + R_DRUM):
        o.append(f'<rect x="{sx(x)-4:.1f}" y="{sy(60.4):.1f}" width="8" '
                 f'height="{sy(14.0)-sy(60.4):.1f}" fill="#191A20" stroke="#C9A24A" '
                 f'stroke-width="1"/>')

    # the kart helix: it lives outside the drum, so in section it reads as two
    # vertical runs with a descending tie between them
    for x in (CX - 42, CX + 42):
        for a, b, al in ((20.0, 30.0, 0.85), (30.0, 40.0, 0.55), (40.0, 51.5, 0.85)):
            o.append(f'<line x1="{sx(x):.1f}" y1="{sy(a):.1f}" x2="{sx(x):.1f}" '
                     f'y2="{sy(b):.1f}" stroke="#FFA23A" stroke-width="5" '
                     f'stroke-linecap="butt" opacity="{al}"/>')
    o.append(f'<text x="{sx(CX-42):.1f}" y="{sy(19.4):.1f}" fill="#FFA23A" font-size="9.5" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">KART</text>')
    o.append(f'<text x="{sx(CX+44):.1f}" y="{sy(35):.1f}" fill="#FFA23A" font-size="10.5" '
             f'font-family="ui-monospace,monospace" transform="rotate(90 {sx(CX+44):.1f} '
             f'{sy(35):.1f})">THE SPIRAL · r 42 · 1.4 laps · 370 m</text>')

    # decks
    names = {"U1": "SUMP", "U2": "UNDERCROFT", "L0": "FLOOD", "L1": "MIRROR",
             "L2": "LANE", "L3": "LODGE", "L4": "WARREN", "L5": "CROWN"}
    for code, y in LEVELS_Y.items():
        if code == "ROOF":
            continue
        for a, b in ((CX - R_DRUM, CX - R_SHAFT), (CX + R_SHAFT, CX + R_DRUM)):
            o.append(f'<rect x="{sx(a):.1f}" y="{sy(y):.1f}" width="{sx(b)-sx(a):.1f}" '
                     f'height="{max(3.0, abs(sy(y)-sy(y-0.6))):.1f}" fill="#2A2C34" '
                     f'stroke="#8C8570" stroke-width="0.8"/>')
        o.append(f'<text x="{sx(CX-R_DRUM)+8:.1f}" y="{sy(y)+15:.1f}" fill="#C9A24A" '
                 f'font-size="10" font-family="ui-monospace,monospace">'
                 f'{code}  +{y:.2f}</text>')
        o.append(f'<text x="{sx(CX-R_DRUM)+76:.1f}" y="{sy(y)+15:.1f}" fill="{PAPER}" '
                 f'font-size="10" font-family="ui-monospace,monospace">'
                 f'{names[code]}</text>')

    # roof ring
    for a, b in ((CX - 30, CX - R_SHAFT), (CX + R_SHAFT, CX + 30)):
        o.append(f'<rect x="{sx(a):.1f}" y="{sy(57.0):.1f}" width="{sx(b)-sx(a):.1f}" '
                 f'height="4" fill="#2A2C34" stroke="#C9A24A" stroke-width="1"/>')
    o.append(f'<text x="{sx(CX-30)+8:.1f}" y="{sy(57.0)+15:.1f}" fill="#C9A24A" '
             f'font-size="10" font-family="ui-monospace,monospace">ROOF  +57.00</text>')
    o.append(f'<text x="{sx(CX-30)+84:.1f}" y="{sy(57.0)+15:.1f}" fill="{PAPER}" '
             f'font-size="10" font-family="ui-monospace,monospace">BELVEDERE</text>')

    # pool
    o.append(f'<rect x="{sx(115):.1f}" y="{sy(23.30):.1f}" width="{sx(141)-sx(115):.1f}" '
             f'height="{max(3.0, abs(sy(23.30)-sy(21.20))):.1f}" fill="#0C2E38" '
             f'stroke="#23E5D4" stroke-width="0.8"/>')
    o.append(f'<line x1="{sx(115):.1f}" y1="{sy(23.30):.1f}" x2="{sx(141):.1f}" '
             f'y2="{sy(23.30):.1f}" stroke="#23E5D4" stroke-width="1.8"/>')
    o.append(f'<text x="{sx(CX):.1f}" y="{sy(22.1):.1f}" fill="#23E5D4" font-size="9.5" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">THE FLOOD</text>')

    # rink on glass
    o.append(f'<rect x="{sx(113):.1f}" y="{sy(29.5):.1f}" width="{sx(143)-sx(113):.1f}" '
             f'height="4" fill="#16242E" stroke="#9FE6F2" stroke-width="0.8"/>')
    o.append(f'<text x="{sx(143)+8:.1f}" y="{sy(29.5)+4:.1f}" fill="#9FE6F2" font-size="9.5" '
             f'font-family="ui-monospace,monospace">THE MIRROR — ice on glass over water</text>')

    # bowling bridge
    o.append(f'<rect x="{sx(121):.1f}" y="{sy(35.0):.1f}" width="{sx(135)-sx(121):.1f}" '
             f'height="4" fill="#2A2018" stroke="#C9A24A" stroke-width="0.8"/>')
    o.append(f'<text x="{sx(135)+8:.1f}" y="{sy(35.0)+4:.1f}" fill="#C9A24A" font-size="9.5" '
             f'font-family="ui-monospace,monospace">THE LANE — the bridge</text>')

    # the Thread — dashed: it does not lie on the cut plane, it weaves through it
    th = [(150, 51.5), (157, 58.5), (150, 62.0), (138, 60.5), (139, 52.0),
          (141, 44.0), (142, 37.0), (148, 36.0), (154, 41.0), (155, 47.0), (150, 51.5)]
    d = " ".join(f"{'M' if i == 0 else 'L'} {sx(x):.1f} {sy(y):.1f}"
                 for i, (x, y) in enumerate(th))
    o.append(f'<path d="{d}" fill="none" stroke="#FF2E88" stroke-width="2.2" '
             f'stroke-dasharray="8 5" opacity="0.9"/>')
    o.append(f'<text x="{sx(158):.1f}" y="{sy(61.4):.1f}" fill="#FF2E88" font-size="10.5" '
             f'font-family="ui-monospace,monospace">THE THREAD · 420 m · dashed = beyond the cut</text>')

    # the Water Chute — three flumes falling through the west crescent of the void
    for off in (0.0, 2.2, 4.4):
        x = CX - 11 + off
        sl = [(x, 46.0), (x - 1.5, 38.0), (x + 1.0, 30.0), (x + 2.0, 23.4)]
        d = " ".join(f"{'M' if i == 0 else 'L'} {sx(a):.1f} {sy(b):.1f}"
                     for i, (a, b) in enumerate(sl))
        o.append(f'<path d="{d}" fill="none" stroke="#9FE6F2" stroke-width="1.8" '
                 f'opacity="0.65"/>')
    o.append(f'<text x="{sx(CX-26):.1f}" y="{sy(33):.1f}" fill="#9FE6F2" font-size="9.5" '
             f'font-family="ui-monospace,monospace" transform="rotate(-90 {sx(CX-26):.1f} '
             f'{sy(33):.1f})">WATER CHUTE · 23 m fall</text>')

    # the 33 m dimension, outside the drum to the west
    dx = sx(72)
    o.append(f'<line x1="{dx:.1f}" y1="{sy(24.0):.1f}" x2="{dx:.1f}" y2="{sy(57.0):.1f}" '
             f'stroke="#23E5D4" stroke-width="1.2"/>')
    for e in (24.0, 57.0):
        o.append(f'<line x1="{dx-8:.1f}" y1="{sy(e):.1f}" x2="{dx+8:.1f}" '
                 f'y2="{sy(e):.1f}" stroke="#23E5D4"/>')
        o.append(f'<line x1="{dx:.1f}" y1="{sy(e):.1f}" x2="{sx(CX-R_DRUM):.1f}" '
                 f'y2="{sy(e):.1f}" stroke="#23E5D4" stroke-width="0.6" '
                 f'stroke-dasharray="3 5" opacity="0.6"/>')
    o.append(f'<text x="{dx-14:.1f}" y="{sy(40.5):.1f}" fill="#23E5D4" font-size="12.5" '
             f'font-family="ui-monospace,monospace" transform="rotate(-90 {dx-14:.1f} '
             f'{sy(40.5):.1f})">33.00 m — FLOOD TO CROWN</text>')

    o.append(f'<text x="{sx(CX):.1f}" y="{sy(63.4):.1f}" fill="#23E5D4" font-size="11" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">'
             f'THE OCULUS · 28 m wide · open from the water to the roof</text>')

    o.append(f'<text x="{sx(xx0):.1f}" y="48" fill="{PAPER}" font-size="21" '
             f'letter-spacing="4" font-family="ui-monospace,monospace">'
             f'PARLOUR XXXIII</text>')
    o.append(f'<text x="{sx(xx0):.1f}" y="72" fill="#C9A24A" font-size="13" '
             f'letter-spacing="2" font-family="ui-monospace,monospace">'
             f'SECTION A–A   west ← → east</text>')
    o.append(f'<text x="{sx(xx0)+320:.1f}" y="72" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">one drum · eight decks · one shaft · '
             f'the bowling lanes are the bridge</text>')
    o.append("</svg>")
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">' + "".join(o)


# ------------------------------------------------------------------- stack ---

def stack():
    w, h = 1440, 960
    o = [f'<rect width="{w}" height="{h}" fill="{INK}"/>']
    o.append(f'<text x="72" y="58" fill="{PAPER}" font-size="21" letter-spacing="4" '
             f'font-family="ui-monospace,monospace">PARLOUR XXXIII</text>')
    o.append(f'<text x="72" y="82" fill="#C9A24A" font-size="13" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">THE STACK</text>')
    o.append(f'<text x="300" y="82" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">eight decks · 33 m from the Flood '
             f'to the Crown · every deck sees every other</text>')

    rows = [
        ("ROOF", 57.00, "THE BELVEDERE", "open ring · the Oculus · coaster lift hill · roof plant", "void"),
        ("L5", 51.50, "THE CROWN", "coaster station · pit lane & garage · Crown Bar · 34th Door", "coaster"),
        ("L4", 46.00, "THE WARREN", "nets & tubes hung in the void · the Nest · the Water Chute", "net"),
        ("L3", 40.50, "THE LODGE", "casino ring · Croupier's Pit · the Sanctum · 3.2 m ceiling", "casino"),
        ("L2", 35.00, "THE LANE", "bowling bridge · Cabinet Row arcade · the Salon", "lane"),
        ("L1", 29.50, "THE MIRROR", "ice rink on glass over the pool · Rinkside · Cold Room", "ice"),
        ("L0", 24.00, "THE FLOOD", "pool · grotto · Drowned Parlour · Penny Parlour", "water"),
        ("U2", 16.40, "THE UNDERCROFT", "laser quest · two decks of maze · the Eye", "dark"),
        ("U1", 14.00, "THE SUMP", "arrival · the Hive · cloakroom · the Hoodwink", "structure"),
    ]
    top, bot = 132, h - 150
    ymax, ymin = 60.0, 12.0
    col_r = w - 250
    for _, yi, _, _, key in rows:
        yy = bot - (yi - ymin) / (ymax - ymin) * (bot - top)
        o.append(f'<line x1="72" y1="{yy:.1f}" x2="{col_r}" y2="{yy:.1f}" '
                 f'stroke="#23252C"/>')
    o.append(f'<rect x="{col_r+18}" y="{top}" width="50" height="{bot-top}" fill="#23E5D4" '
             f'fill-opacity="0.07" stroke="#23E5D4" stroke-opacity="0.45" '
             f'stroke-dasharray="8 6"/>')
    o.append(f'<text x="{col_r+43}" y="{bot+26}" fill="#23E5D4" font-size="10.5" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">OCULUS</text>')

    for lamp, yi, nm, desc, key in rows:
        yy = bot - (yi - ymin) / (ymax - ymin) * (bot - top)
        fill, stroke = FILL[key]
        o.append(f'<rect x="72" y="{yy-1.0:.1f}" width="{col_r-72}" height="2" '
                 f'fill="{stroke}" fill-opacity="0.55"/>')
        o.append(f'<rect x="72" y="{yy-30:.1f}" width="4" height="30" fill="{stroke}"/>')
        o.append(f'<text x="88" y="{yy-14:.1f}" fill="#C9A24A" font-size="12" '
                 f'font-family="ui-monospace,monospace">{lamp}</text>')
        o.append(f'<text x="136" y="{yy-13:.1f}" fill="{PAPER}" font-size="16" '
                 f'letter-spacing="2" font-family="ui-monospace,monospace">{nm}</text>')
        o.append(f'<text x="136" y="{yy-28:.1f}" fill="{DIM}" font-size="11.5" '
                 f'font-family="ui-monospace,monospace">{esc(desc)}</text>')
        o.append(f'<text x="{col_r-14}" y="{yy-13:.1f}" fill="#8C8570" font-size="11.5" '
                 f'text-anchor="end" font-family="ui-monospace,monospace">+{yi:.2f}</text>')
        o.append(f'<line x1="{col_r}" y1="{yy:.1f}" x2="{col_r+18}" y2="{yy:.1f}" '
                 f'stroke="#23E5D4" stroke-opacity="0.3" stroke-dasharray="3 5"/>')

    o.append(f'<text x="72" y="{h-70}" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">THE THREAD — a 43 m helical promenade '
             f'from the Sump to the Belvedere · one turn per deck · 3 m wide · 1:12</text>')
    o.append(f'<text x="72" y="{h-44}" fill="{FAINT}" font-size="11" '
             f'font-family="ui-monospace,monospace">not to scale · generated from the '
             f'same coordinate model as the plans</text>')
    o.append("</svg>")
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">' + "".join(o)


# -------------------------------------------------------------------- main ---

AMP = re.compile(r"&(?!#\d+;|#x[0-9a-fA-F]+;|amp;|lt;|gt;|quot;|apos;)")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "plans")
    os.makedirs(out, exist_ok=True)
    written = []
    for lv in LEVELS:
        p = os.path.join(out, f"plan-{lv['code'].lower()}.svg")
        open(p, "w", encoding="utf-8").write(AMP.sub("&amp;", plan_sheet(lv)))
        written.append(p)
    for name, fn in (("section-aa", section), ("the-stack", stack)):
        p = os.path.join(out, f"{name}.svg")
        open(p, "w", encoding="utf-8").write(AMP.sub("&amp;", fn()))
        written.append(p)
    for p in written:
        print(f"{os.path.getsize(p):>7,d}  {os.path.relpath(p, os.getcwd())}")


if __name__ == "__main__":
    main()
