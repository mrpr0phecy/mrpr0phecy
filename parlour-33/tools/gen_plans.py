#!/usr/bin/env python3
"""
PARLOUR XXXIII — THE WEAVE.  Plan, section and stack generator.

One coordinate model drives every drawing.

Coordinate contract
-------------------
  Region                256 x 256 m, plaza at +20.00
  Building footprint    x 94.00 – 162.00,  z 94.00 – 162.00   (68 x 68 m)
  Perimeter band        5 m wide (the Ribbon / golf), all round
  Interior              99.00 – 157.00  (58 x 58 m)
  Halls                 26 x 58 m, two per deck
  Galleries (bores)     6 x 58 m, one per deck
  Floor to floor         5.50 m
  Decks                 B1 +20.00, L0 +25.00, L1 +30.50, L2 +36.00,
                        L3 +41.50, L4 +47.00, L5 +52.50, Roof +58.00
  The number            L0 to Roof = 33.00 m

  Decks come in PAIRS that share an orientation and turn 90 degrees
  from the pair below:
        B1  full plate (blind)
        L0 L1  hall walls run north-south
        L2 L3  hall walls run east-west
        L4 L5  hall walls run north-south
        Roof   full plate

Run:  python3 parlour-33/tools/gen_plans.py
Out:  parlour-33/plans/*.svg
"""

import math
import os
import re

INK = "#07070A"
PAPER = "#E8E1D0"
DIM = "#6E6A60"
FAINT = "#3A3B44"
GRID = "#15161C"

BX0 = BZ0 = 94.0
BX1 = BZ1 = 162.0
BAND = 5.0
IX0 = IZ0 = 99.0
IX1 = IZ1 = 157.0

LEVELS_Y = {
    "B1": 20.00, "L0": 25.00, "L1": 30.50, "L2": 36.00,
    "L3": 41.50, "L4": 47.00, "L5": 52.50, "ROOF": 58.00,
}

FILL = {
    "structure": ("#15161B", "#8C8570"),
    "back":      ("#0E0F13", "#4A463C"),
    "water":     ("#0C2E38", "#23E5D4"),
    "ice":       ("#16242E", "#9FE6F2"),
    "lane":      ("#2A2018", "#C9A24A"),
    "arcade":    ("#1E1026", "#FF2E88"),
    "casino":    ("#1A1218", "#C9A24A"),
    "dark":      ("#0B0B0E", "#8A8A96"),
    "net":       ("#141D16", "#7FE0A0"),
    "golf":      ("#131A14", "#A8C46A"),
    "kart":      ("#241512", "#FFA23A"),
    "coaster":   ("#1A0B12", "#FF2E88"),
    "bar":       ("#1E1416", "#E8646E"),
    "service":   ("#0C0C10", "#3A3A44"),
    "gallery":   ("#101319", "#5AA8C8"),
    "lift":      ("#12161C", "#C8C8D0"),
}

# --------------------------------------------------------------- deck data ---

def band_rooms():
    return [
        (BX0, BZ1 - BAND, BX1, BZ1, None, "golf"),
        (BX0, BZ0, BX1, BZ0 + BAND, None, "golf"),
        (BX0, BZ0 + BAND, BX0 + BAND, BZ1 - BAND, None, "golf"),
        (BX1 - BAND, BZ0 + BAND, BX1, BZ1 - BAND, None, "golf"),
    ]


DECKS = [
    dict(code="B1", name="THE UNDERCROFT", orient="PLATE",
         strap="entry, the Hive, laser quest, the Eye",
         ribbon="the foot of it",
         rooms=[
             (99, 131, 157, 157, "THE SUMP · entry", "structure"),
             (99, 99, 157, 129, "THE UNDERCROFT · laser quest", "dark"),
             (136, 136, 152, 152, "BRIEFING / the Hoodwink", "dark"),
             (140, 116, 154, 126, "THE EYE · viewing", "dark"),
             (114, 140, 126, 150, "THE HIVE", "bar"),
             (128, 140, 134, 150, "CLOAKROOM", "service"),
             (104, 138, 112, 150, "THE FALL", "lift"),
             (99, 131, 103, 139, "SERVICE", "back"),
         ],
         voids=[],
         feats=[("entry", [(134, 161)], "")],
         stairs=False,
         notes="One door in the plinth, one corridor, one lift, one token. The ground floor is blind on purpose."),

    dict(code="L0", name="THE FLOOD", orient="NS",
         strap="the pool  |  the gallery  |  the parlours",
         ribbon="hole 1",
         rooms=[
             (99, 99, 125, 157, "THE FLOOD · hall", "water"),
             (104, 116, 122, 140, "THE POOL", "water"),
             (104, 116, 112, 126, "THE GROTTO", "water"),
             (99, 142, 125, 157, "THE SUNBEAM TERRACE", "water"),
             (125, 99, 131, 157, "THE GLASS GALLERY", "gallery"),
             (131, 99, 150, 126, "THE PENNY PARLOUR", "arcade"),
             (150, 99, 157, 126, "CHRYSALIS", "service"),
             (131, 128, 157, 157, "THE DROWNED PARLOUR", "bar"),
         ],
         voids=[],
         feats=[],
         stairs=True,
         notes="Up out of the dark, and the first thing you hear is water — in the next room, through glass."),

    dict(code="L1", name="THE MIRROR", orient="NS",
         strap="ice on glass, directly over the pool  |  the Cold Room",
         ribbon="holes 2–4",
         rooms=[
             (99, 99, 125, 157, "THE MIRROR · hall", "ice"),
             (107, 114, 121, 142, "THE RINK · ice on glass", "ice"),
             (121, 130, 125, 148, "RINKSIDE", "bar"),
             (125, 99, 131, 157, "THE GLASS GALLERY", "gallery"),
             (131, 99, 143, 112, "THE COLD ROOM", "ice"),
             (145, 99, 157, 112, "THE BLIND DOOR", "dark"),
             (131, 114, 157, 126, "THE WARM ROOM", "bar"),
             (131, 128, 157, 157, "SKATERS' LOUNGE", "structure"),
         ],
         voids=[(108, 117, 120, 139, "THE POOL IS UNDER THE ICE")],
         feats=[],
         stairs=True,
         notes="Skaters look down through their own ice at swimmers. Walk the gallery and you see both at once."),

    dict(code="L2", name="THE LANE", orient="EW",
         strap="ten lanes running east–west  |  the arcade",
         ribbon="holes 5–8",
         rooms=[
             (99, 99, 157, 125, "THE LANE · hall", "lane"),
             (99, 103, 104, 120, "APPROACH", "lane"),
             (104, 103, 124, 120, "TEN LANES", "lane"),
             ("__lanes__", None, None, None, None, None),
             (124, 103, 130, 120, "PIN DECK", "lane"),
             (131, 99, 157, 125, "THE SALON · the hub", "bar"),
             (99, 131, 157, 157, "CABINET ROW · 24 machines", "arcade"),
             (139, 143, 150, 154, "THE FORTUNE", "arcade"),
             (139, 132, 150, 142, "THE CLAW", "arcade"),
             (99, 125, 157, 131, "THE GLASS GALLERY", "gallery"),
         ],
         voids=[(107, 120, 121, 125, "LOOK DOWN · THE ICE"),
                (107, 131, 121, 140, "LOOK DOWN · THE ICE")],
         feats=[],
         stairs=True,
         notes="At the foul line the ice is one deck under your ball and the casino one deck over your pinsetters."),

    dict(code="L3", name="THE LODGE", orient="EW",
         strap="the casino floor  |  the Sanctum and the Beehive",
         ribbon="holes 9–12",
         rooms=[
             (99, 99, 157, 125, "THE LODGE · twelve tables", "casino"),
             (118, 104, 132, 118, "THE CROUPIER'S PIT", "casino"),
             (99, 131, 157, 137, "THE TEA ROOM", "bar"),
             (99, 138, 134, 157, "THE BEEHIVE · bar", "bar"),
             (136, 138, 157, 157, "THE SANCTUM", "casino"),
             (99, 125, 157, 131, "THE GLASS GALLERY", "gallery"),
         ],
         voids=[(106, 102, 122, 114, "LOOK DOWN · THE LANES")],
         feats=[("glass", (120, 106, 130, 116), "GLASS FLOOR")],
         stairs=True,
         notes="The only deck with a ceiling: 3.2 m of lacquer and smoke. You cannot see out — only down."),

    dict(code="L4", name="THE WARREN", orient="NS",
         strap="nets in a two-deck hall  |  the kart circuit",
         ribbon="holes 13–15",
         rooms=[
             (99, 99, 125, 157, "THE WARREN · net hall", "net"),
             (100, 100, 114, 116, "THE NEST · ball pit", "net"),
             (125, 99, 131, 157, "THE GLASS GALLERY", "gallery"),
             (131, 99, 157, 157, "THE SPIRAL · kart circuit", "kart"),
             (133, 99, 155, 110, "PIT LANE / GARAGE", "kart"),
         ],
         voids=[(101, 101, 111, 111, "LOOK DOWN · THE LODGE")],
         feats=[("kart", [(133, 112), (155, 112), (155, 140), (133, 140), (133, 112)], ""),
                ("kart", [(144, 112), (144, 140)], "TIE"),
                ("dive", [(119, 137)], "THE THREAD · dives at +50.00")],
         stairs=True,
         notes="Nets on one side of the glass, karts on the other. Two games running parallel, watching each other."),

    dict(code="L5", name="THE CROWN", orient="NS",
         strap="the Warren's upper ropes  |  the coaster station",
         ribbon="holes 16–18",
         rooms=[
             (99, 99, 125, 157, "THE WARREN · upper ropes", "net"),
             (125, 99, 131, 157, "THE GLASS GALLERY", "gallery"),
             (131, 138, 152, 157, "THE THREAD · station", "coaster"),
             (131, 99, 157, 125, "THE CROWN BAR", "bar"),
             (152, 127, 157, 134, "THE 34th DOOR", "dark"),
             (152, 138, 157, 157, "PLANT", "service"),
         ],
         voids=[(101, 101, 123, 155, "OPEN TO THE WARREN BELOW")],
         feats=[],
         stairs=True,
         notes="Every station on a coaster is a promise. This one is the only one that keeps it."),

    dict(code="ROOF", name="THE BELVEDERE", orient="PLATE",
         strap="the terrace, the bell, the lift hill, the only sky in the building",
         ribbon="—",
         rooms=[
             (99, 99, 157, 157, "THE BELVEDERE · open terrace", "structure"),
             (152, 138, 157, 157, "ROOF PLANT", "service"),
         ],
         voids=[(99, 99, 125, 157, "GLASS OVER THE WARREN"),
                (128, 128, 138, 140, "THE BELL")],
         feats=[("coaster", [(150, 152), (150, 104), (130, 100), (110, 104), (99, 128)],
                 "LIFT HILL")],
         stairs=True,
         notes="Thirty-three metres above the pool deck, and the only place in the house you can see the sky."),
]

# the flume is one glass tube from the Crown to the pool: interpolate it per deck
FLUME_TOP = (150.0, 150.0, 55.0)
FLUME_BOT = (118.0, 126.0, 25.6)


def flume_at(y):
    t = (y - FLUME_BOT[2]) / (FLUME_TOP[2] - FLUME_BOT[2])
    t = max(0.0, min(1.0, t))
    return (FLUME_BOT[0] + (FLUME_TOP[0] - FLUME_BOT[0]) * t,
            FLUME_BOT[1] + (FLUME_TOP[1] - FLUME_BOT[1]) * t)


STAIRS = [(157, 157, 162, 162, "I"), (94, 157, 99, 162, "II"),
          (94, 94, 99, 99, "III"), (157, 94, 162, 99, "IV")]
LIFTS = [(157, 118, 162, 126, "E"), (94, 118, 99, 126, "W")]


# ------------------------------------------------------------------ canvas ---

S = 11.0
WIN = 88.0
X0 = Z0 = 84.0
PX0, PY0 = 46.0, 84.0
PLAN = WIN * S
W = int(PX0 * 2 + PLAN + 350)
H = int(PY0 + PLAN + 118)


def px(x, z):
    return PX0 + (x - X0) * S, PY0 + (Z0 + WIN - z) * S


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


AMP = re.compile(r"&(?!#\d+;|#x[0-9a-fA-F]+;|amp;|lt;|gt;|quot;|apos;)")


def rect(x0, z0, x1, z1, fill, stroke, w=1.5, dash=None, op=1.0):
    a, b = px(x0, max(z0, z1))
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{a:.1f}" y="{b:.1f}" width="{abs(x1-x0)*S:.1f}" '
            f'height="{abs(z1-z0)*S:.1f}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{w}" stroke-opacity="{op}"{d}/>')


# ------------------------------------------------------------------- sheet ---

def plan_sheet(d):
    y = LEVELS_Y[d["code"]]
    o = [f'<rect width="{W}" height="{H}" fill="{INK}"/>']
    o.append(f'<text x="{PX0}" y="44" fill="{PAPER}" font-size="21" letter-spacing="4" '
             f'font-family="ui-monospace,monospace">PARLOUR XXXIII</text>')
    o.append(f'<text x="{PX0}" y="68" fill="#C9A24A" font-size="13" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">{d["code"]}  {d["name"]}   '
             f'+{y:.2f}</text>')
    o.append(f'<text x="{PX0+270}" y="68" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">{esc(d["strap"])}</text>')

    # grid
    m = 88
    while m <= 168:
        gx, _ = px(m, 0)
        _, gz = px(0, m)
        if PX0 <= gx <= PX0 + PLAN:
            o.append(f'<line x1="{gx:.1f}" y1="{PY0}" x2="{gx:.1f}" y2="{PY0+PLAN}" stroke="{GRID}"/>')
        if PY0 <= gz <= PY0 + PLAN:
            o.append(f'<line x1="{PX0}" y1="{gz:.1f}" x2="{PX0+PLAN}" y2="{gz:.1f}" stroke="{GRID}"/>')
        m += 8

    # facade + band
    o.append(rect(BX0 - 0.9, BZ0 - 0.9, BX1 + 0.9, BZ1 + 0.9, "none", "#C9A24A", 3.2))
    for b in band_rooms():
        o.append(rect(b[0], b[1], b[2], b[3], FILL["golf"][0], FILL["golf"][1], 0.6, op=0.5))
    o.append(f'<text x="{px((BX0+BX1)/2, BZ1-2.5)[0]:.1f}" y="{px(0, BZ1-2.5)[1]+4:.1f}" '
             f'fill="#A8C46A" font-size="10" text-anchor="middle" '
             f'font-family="ui-monospace,monospace">THE RIBBON · {d["ribbon"]}</text>')

    # rooms
    body, marks, rows = [], [], []
    idx = 0
    for (x0, z0, x1, z1, name, key) in d["rooms"]:
        if x0 == "__lanes__":
            continue
        fill, stroke = FILL[key]
        o.append(rect(x0, z0, x1, z1, fill, stroke, 1.4))
        idx += 1
        cx, cz = px((x0 + x1) / 2, (z0 + z1) / 2)
        marks.append(
            f'<circle cx="{cx:.1f}" cy="{cz:.1f}" r="10.5" fill="#07070A" '
            f'fill-opacity="0.94" stroke="{stroke}" stroke-width="1.5"/>'
            f'<text x="{cx:.1f}" y="{cz+3.8:.1f}" fill="{stroke}" font-size="11" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-weight="700">{idx}</text>')
        rows.append((idx, stroke, name))
        if min(x1 - x0, z1 - z0) >= 12:
            nm = name.split(" · ")[0]
            o.append(f'<text x="{cx:.1f}" y="{cz+22:.1f}" fill="{PAPER}" font-size="10.5" '
                     f'text-anchor="middle" font-family="ui-monospace,monospace" '
                     f'opacity="0.75" letter-spacing="0.6">{esc(nm)}</text>')

    # voids
    for (x0, z0, x1, z1, label) in d["voids"]:
        glass = ("UNDER THE ICE" in label) or label.startswith("GLASS")
        o.append(rect(x0, z0, x1, z1, "none" if glass else "#05070A",
                      "#23E5D4", 1.3, dash="7 5", op=0.9))
        cx, cz = px((x0 + x1) / 2, (z0 + z1) / 2)
        o.append(f'<text x="{cx:.1f}" y="{cz+4:.1f}" fill="#23E5D4" font-size="9.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace" '
                 f'opacity="0.95">{esc(label)}</text>')

    # stairs + lifts
    if d["stairs"]:
        for (x0, z0, x1, z1, nm) in STAIRS:
            o.append(rect(x0 + 0.6, z0 + 0.6, x1 - 0.6, z1 - 0.6, "#0E0E12", PAPER, 1.2))
            o.append(f'<text x="{px((x0+x1)/2, (z0+z1)/2)[0]:.1f}" '
                     f'y="{px(0, (z0+z1)/2)[1]+4:.1f}" fill="{PAPER}" font-size="10" '
                     f'text-anchor="middle" font-family="ui-monospace,monospace" '
                     f'opacity="0.75">{nm}</text>')
        for (x0, z0, x1, z1, nm) in LIFTS:
            o.append(rect(x0 + 1.4, z0 + 0.6, x1 - 1.4, z1 - 0.6, "#12161C", PAPER, 1.0, dash="4 3", op=0.7))

    # the flume — one glass tube, interpolated through every deck it passes
    y = LEVELS_Y[d["code"]]
    if d["code"] not in ("B1", "ROOF"):
        if d["code"] == "L0":
            ax_, az_ = flume_at(25.6)
            o.append(f'<circle cx="{px(ax_,az_)[0]:.1f}" cy="{px(ax_,az_)[1]:.1f}" r="10" '
                     f'fill="#9FE6F2" fill-opacity="0.5" stroke="#9FE6F2" stroke-width="1.4"/>')
            o.append(f'<text x="{px(ax_,az_)[0]:.1f}" y="{px(0,az_)[1]+26:.1f}" fill="#9FE6F2" '
                     f'font-size="9.5" text-anchor="middle" '
                     f'font-family="ui-monospace,monospace">FLUME SPLASHDOWN</text>')
        else:
            a = flume_at(min(55.0, y + 2.8))
            b = flume_at(max(25.6, y - 2.8))
            o.append(f'<line x1="{px(*a)[0]:.1f}" y1="{px(*a)[1]:.1f}" '
                     f'x2="{px(*b)[0]:.1f}" y2="{px(*b)[1]:.1f}" '
                     f'stroke="#9FE6F2" stroke-width="9" stroke-linecap="round" opacity="0.25"/>')
            o.append(f'<line x1="{px(*a)[0]:.1f}" y1="{px(*a)[1]:.1f}" '
                     f'x2="{px(*b)[0]:.1f}" y2="{px(*b)[1]:.1f}" '
                     f'stroke="#9FE6F2" stroke-width="1.6"/>')
            o.append(f'<text x="{px(*b)[0]+14:.1f}" y="{px(*b)[1]+4:.1f}" fill="#9FE6F2" '
                     f'font-size="9.5" font-family="ui-monospace,monospace">THE FLUME</text>')
        # the Sunbeam — a vertical mirror-well, in the same place on every deck
        o.append(rect(104, 122, 107, 125, "#FFE9A8", "#FFD24A", 1.4, op=0.9))
        o.append(f'<text x="{px(105.5,123.5)[0]:.1f}" y="{px(0,123.5)[1]-10:.1f}" '
                 f'fill="#FFD24A" font-size="9" text-anchor="middle" '
                 f'font-family="ui-monospace,monospace">SUNBEAM</text>')

    # explicit features
    for f in d["feats"]:
        kind = f[0]
        if kind == "glass":
            x0, z0, x1, z1 = f[1]
            o.append(rect(x0, z0, x1, z1, "none", "#23E5D4", 1.2, dash="5 4", op=0.9))
            o.append(f'<text x="{px((x0+x1)/2,(z0+z1)/2)[0]:.1f}" '
                     f'y="{px(0,(z0+z1)/2)[1]-10:.1f}" fill="#23E5D4" font-size="9" '
                     f'text-anchor="middle" font-family="ui-monospace,monospace">'
                     f'{esc(f[2])}</text>')
        elif kind == "kart":
            pts = f[1]
            o.append(f'<polyline points="{" ".join(f"{px(x,z)[0]:.1f},{px(x,z)[1]:.1f}" for x,z in pts)}" '
                     f'fill="none" stroke="#FFA23A" stroke-width="3.4" opacity="0.9"/>')
            if f[2]:
                cxm = sum(x for x, z in pts) / len(pts)
                czm = sum(z for x, z in pts) / len(pts)
                o.append(f'<text x="{px(cxm,czm)[0]:.1f}" y="{px(0,czm)[1]+42:.1f}" '
                         f'fill="#FFA23A" font-size="9.5" text-anchor="middle" '
                         f'font-family="ui-monospace,monospace">THE SPIRAL · 250 m</text>')
        elif kind == "dive":
            X, Z = f[1][0]
            cx, cy = px(X, Z)
            o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{S*1.8:.1f}" fill="none" '
                     f'stroke="#FF2E88" stroke-width="2" stroke-dasharray="5 4"/>')
            o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3" fill="#FF2E88"/>')
            o.append(f'<text x="{cx:.1f}" y="{cy-S*1.8-9:.1f}" fill="#FF2E88" font-size="9.5" '
                     f'text-anchor="middle" font-family="ui-monospace,monospace">{esc(f[2])}</text>')
        elif kind == "coaster":
            pts = f[1]
            o.append(f'<polyline points="{" ".join(f"{px(x,z)[0]:.1f},{px(x,z)[1]:.1f}" for x,z in pts)}" '
                     f'fill="none" stroke="#FF2E88" stroke-width="2.2" '
                     f'stroke-dasharray="9 5" opacity="0.95"/>')
            if f[2]:
                o.append(f'<text x="{px(pts[0][0],pts[0][1])[0]:.1f}" '
                         f'y="{px(0,pts[0][1])[1]-12:.1f}" fill="#FF2E88" font-size="9.5" '
                         f'text-anchor="middle" '
                         f'font-family="ui-monospace,monospace">{esc(f[2])}</text>')
        elif kind == "lanes":
            for i in range(1, 10):
                zz = 103 + 17.0 * i / 10.0
                o.append(f'<line x1="{px(104,zz)[0]:.1f}" y1="{px(0,zz)[1]:.1f}" '
                         f'x2="{px(124,zz)[0]:.1f}" y2="{px(0,zz)[1]:.1f}" '
                         f'stroke="#C9A24A" stroke-width="0.7" opacity="0.55"/>')
            o.append(f'<line x1="{px(106,103)[0]:.1f}" y1="{px(0,103)[1]:.1f}" '
                     f'x2="{px(106,103)[0]:.1f}" y2="{px(0,120)[1]:.1f}" '
                     f'stroke="#E8646E" stroke-width="1.1" opacity="0.8"/>')
        elif kind == "entry":
            (xa, za) = f[1][0]
            o.append(f'<circle cx="{px(xa,za)[0]:.1f}" cy="{px(xa,za)[1]:.1f}" r="9" '
                     f'fill="none" stroke="{PAPER}" stroke-width="1.6"/>')
            o.append(f'<text x="{px(xa,za)[0]:.1f}" y="{px(0,za)[1]-18:.1f}" fill="{PAPER}" '
                     f'font-size="10" text-anchor="middle" '
                     f'font-family="ui-monospace,monospace">ENTRY</text>')

    o.append("".join(marks))

    # section lines
    o.append(f'<line x1="{px(112,84)[0]:.1f}" y1="{PY0}" x2="{px(112,84)[0]:.1f}" '
             f'y2="{PY0+PLAN}" stroke="{PAPER}" stroke-width="1.1" stroke-dasharray="16 6 3 6" '
             f'opacity="0.4"/>')
    o.append(f'<text x="{px(112,84)[0]+6:.1f}" y="{PY0+14}" fill="{PAPER}" font-size="11" '
             f'opacity="0.6" font-family="ui-monospace,monospace">A</text>')
    o.append(f'<line x1="{PX0}" y1="{px(0,128)[1]:.1f}" x2="{PX0+PLAN}" y2="{px(0,128)[1]:.1f}" '
             f'stroke="{PAPER}" stroke-width="1.1" stroke-dasharray="16 6 3 6" opacity="0.4"/>')
    o.append(f'<text x="{PX0+PLAN-14}" y="{px(0,128)[1]-8:.1f}" fill="{PAPER}" font-size="11" '
             f'opacity="0.6" font-family="ui-monospace,monospace">B</text>')

    # north
    nx, ny = PX0 + PLAN - 26, PY0 + 26
    o.append(f'<path d="M {nx} {ny-18} L {nx-8} {ny+8} L {nx} {ny+2} L {nx+8} {ny+8} Z" '
             f'fill="{PAPER}" opacity="0.8"/>')
    o.append(f'<text x="{nx}" y="{ny+22}" fill="{DIM}" font-size="11" text-anchor="middle" '
             f'font-family="ui-monospace,monospace">N</text>')

    # note + scale
    o.append(f'<text x="{PX0}" y="{PY0+PLAN+34}" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">▸ {esc(d["notes"])}</text>')
    bx, by = PX0, PY0 + PLAN + 68
    o.append(f'<line x1="{bx}" y1="{by}" x2="{bx+20*S}" y2="{by}" stroke="{PAPER}" stroke-width="1.6"/>')
    for i in range(0, 21, 5):
        o.append(f'<line x1="{bx+i*S:.1f}" y1="{by-5}" x2="{bx+i*S:.1f}" y2="{by+5}" stroke="{PAPER}"/>')
        o.append(f'<text x="{bx+i*S:.1f}" y="{by+19}" fill="{DIM}" font-size="10" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace">{i}</text>')
    o.append(f'<text x="{bx+22*S}" y="{by+19}" fill="{DIM}" font-size="10" '
             f'font-family="ui-monospace,monospace">metres · plan window 88 × 88 m</text>')

    # legend
    lx = PX0 + PLAN + 40
    o.append(f'<text x="{lx}" y="{PY0+8}" fill="{DIM}" font-size="11" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">KEY</text>')
    ly = PY0 + 38
    for num, col, name in rows:
        o.append(f'<rect x="{lx}" y="{ly-9}" width="14" height="14" fill="{col}" '
                 f'fill-opacity="0.22" stroke="{col}" stroke-width="1.2"/>')
        o.append(f'<text x="{lx+7}" y="{ly+1.5}" fill="{col}" font-size="9.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace" '
                 f'font-weight="700">{num}</text>')
        o.append(f'<text x="{lx+24}" y="{ly+1.5}" fill="{PAPER}" font-size="11.5" '
                 f'font-family="ui-monospace,monospace">{esc(name)}</text>')
        ly += 24
    ly += 12
    for col, wd, label in (("#C9A24A", "3", "facade"),
                           ("#A8C46A", "1", "the Ribbon, 5 m band"),
                           ("#23E5D4", "1", "openings between decks (dashed)"),
                           ("#FFD24A", "2", "the Sunbeam, mirror-well"),
                           ("#9FE6F2", "1", "the Flume, glass"),
                           ("#FFA23A", "2", "kart circuit"),
                           ("#FF2E88", "1", "the Thread, coaster")):
        o.append(f'<rect x="{lx}" y="{ly-8}" width="22" height="{wd}" fill="{col}"/>')
        o.append(f'<text x="{lx+30}" y="{ly}" fill="{DIM}" font-size="10.5" '
                 f'font-family="ui-monospace,monospace">{label}</text>')
        ly += 20
    ly += 10
    o.append(f'<text x="{lx}" y="{ly}" fill="{FAINT}" font-size="10" '
             f'font-family="ui-monospace,monospace">schematic · not a prim plan</text>')
    ly += 20
    o.append(f'<text x="{lx}" y="{ly}" fill="{FAINT}" font-size="10" '
             f'font-family="ui-monospace,monospace">stairs I–IV = THE ZIGZAG</text>')

    o.append("</svg>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(o))


# ----------------------------------------------------------------- section ---

def section(code, kind):
    """kind 'NS' shows z along the page (cut at x=112); 'EW' shows x (cut at z=128)."""
    w, h = 1560, 900
    o = [f'<rect width="{w}" height="{h}" fill="{INK}"/>']
    lo, hi = 88.0, 168.0
    y0, y1 = 16.0, 62.0
    sx = lambda v: 150 + (v - lo) / (hi - lo) * (w - 300)
    sy = lambda v: h - 130 - (v - y0) / (y1 - y0) * (h - 240)

    for m in range(88, 169, 8):
        o.append(f'<line x1="{sx(m):.1f}" y1="{sy(y0):.1f}" x2="{sx(m):.1f}" '
                 f'y2="{sy(y1):.1f}" stroke="{GRID}"/>')
        o.append(f'<text x="{sx(m):.1f}" y="{sy(y0)+18:.1f}" fill="{FAINT}" font-size="9.5" '
                 f'text-anchor="middle" font-family="ui-monospace,monospace">{m}</text>')
    for e in range(20, 61, 5):
        o.append(f'<line x1="{sx(lo):.1f}" y1="{sy(e):.1f}" x2="{sx(hi):.1f}" '
                 f'y2="{sy(e):.1f}" stroke="{GRID}"/>')
        o.append(f'<text x="{sx(lo)-12:.1f}" y="{sy(e)+4:.1f}" fill="{FAINT}" font-size="9.5" '
                 f'text-anchor="end" font-family="ui-monospace,monospace">+{e}</text>')

    # ground
    o.append(f'<rect x="{sx(lo):.1f}" y="{sy(20.0):.1f}" width="{sx(hi)-sx(lo):.1f}" '
             f'height="{sy(y0)-sy(20.0):.1f}" fill="#0C0D11"/>')
    o.append(f'<line x1="{sx(lo):.1f}" y1="{sy(20.0):.1f}" x2="{sx(hi):.1f}" y2="{sy(20.0):.1f}" '
             f'stroke="{FAINT}" stroke-width="1.4"/>')
    o.append(f'<text x="{sx(hi)-8:.1f}" y="{sy(20.0)+16:.1f}" fill="{DIM}" font-size="10.5" '
             f'text-anchor="end" font-family="ui-monospace,monospace">PLAZA +20.00</text>')

    # envelope
    for v in (BX0, BX1):
        o.append(f'<rect x="{sx(v)-4:.1f}" y="{sy(58.6):.1f}" width="8" '
                 f'height="{sy(20.0)-sy(58.6):.1f}" fill="#191A20" stroke="#C9A24A"/>')

    # deck slabs, with openings
    for d in DECKS:
        yb = LEVELS_Y[d["code"]]
        if d["code"] == "ROOF":
            continue
        gaps = []
        for (vx0, vz0, vx1, vz1, _lbl) in d["voids"]:
            cut = 112.0 if kind == "NS" else 128.0
            a, b = (vz0, vz1) if kind == "NS" else (vx0, vx1)
            c, e = (vx0, vx1) if kind == "NS" else (vz0, vz1)
            if c <= cut <= e:
                gaps.append((a, b))
        segs, cur = [], lo
        for (a, b) in sorted(gaps):
            if a > cur:
                segs.append((cur, a))
            cur = max(cur, b)
        if cur < hi:
            segs.append((cur, hi))
        for (a, b) in segs:
            o.append(f'<rect x="{sx(a):.1f}" y="{sy(yb):.1f}" width="{sx(b)-sx(a):.1f}" '
                     f'height="4" fill="#2A2C34" stroke="#8C8570" stroke-width="0.8"/>')
        # walls crossed by the cut
        for (rx0, rz0, rx1, rz1, name, key) in d["rooms"]:
            if rx0 == "__lanes__":
                continue
            cut = 112.0 if kind == "NS" else 128.0
            c, e = (rx0, rx1) if kind == "NS" else (rz0, rz1)
            if not (c <= cut <= e):
                continue
            fill, stroke = FILL[key]
            for v in ((rz0, rz1) if kind == "NS" else (rx0, rx1)):
                o.append(f'<line x1="{sx(v):.1f}" y1="{sy(yb):.1f}" x2="{sx(v):.1f}" '
                         f'y2="{sy(yb+4.6):.1f}" stroke="{stroke}" stroke-width="1.4" '
                         f'opacity="0.85"/>')
        o.append(f'<text x="{sx(lo)+10:.1f}" y="{sy(yb)-10:.1f}" fill="#C9A24A" font-size="10" '
                 f'font-family="ui-monospace,monospace">{d["code"]} +{yb:.2f}</text>')

    # roof line
    o.append(f'<rect x="{sx(BX0):.1f}" y="{sy(58.0):.1f}" width="{sx(BX1)-sx(BX0):.1f}" '
             f'height="4" fill="#2A2C34" stroke="#C9A24A"/>')

    # the pool + the rink (in NS section they show)
    o.append(f'<rect x="{sx(116):.1f}" y="{sy(25.6):.1f}" width="{sx(140)-sx(116):.1f}" '
             f'height="6" fill="#0C2E38" stroke="#23E5D4"/>')
    o.append(f'<text x="{sx(128):.1f}" y="{sy(25.6)+16:.1f}" fill="#23E5D4" font-size="9.5" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">THE POOL</text>')
    o.append(f'<rect x="{sx(114):.1f}" y="{sy(30.5):.1f}" width="{sx(142)-sx(114):.1f}" '
             f'height="4" fill="#16242E" stroke="#9FE6F2"/>')
    o.append(f'<text x="{sx(128):.1f}" y="{sy(30.5)+16:.1f}" fill="#9FE6F2" font-size="9.5" '
             f'text-anchor="middle" font-family="ui-monospace,monospace">THE RINK ON GLASS</text>')

    # the flume + the thread, drawn as they cross
    fl = []
    for e in (55.0, 52.5, 47.0, 41.5, 36.0, 30.5, 25.6):
        t = max(0.0, min(1.0, (e - FLUME_BOT[2]) / (FLUME_TOP[2] - FLUME_BOT[2])))
        fl.append((FLUME_BOT[1] + (FLUME_TOP[1] - FLUME_BOT[1]) * t, e))
    d2 = " ".join(f"{'M' if i == 0 else 'L'} {sx(a):.1f} {sy(b):.1f}" for i, (a, b) in enumerate(fl))
    o.append(f'<path d="{d2}" fill="none" stroke="#9FE6F2" stroke-width="3" opacity="0.75"/>')
    o.append(f'<text x="{sx(131):.1f}" y="{sy(46.4):.1f}" fill="#9FE6F2" font-size="10" '
             f'font-family="ui-monospace,monospace" text-anchor="end">THE FLUME · 33 m of glass tube</text>')

    th = [(150, 58.6), (150, 62.0), (120, 62.0), (104, 55.0), (120, 47.0), (140, 41.5),
          (120, 36.0), (99, 41.5)]
    d3 = " ".join(f"{'M' if i == 0 else 'L'} {sx(a):.1f} {sy(b):.1f}" for i, (a, b) in enumerate(th))
    o.append(f'<path d="{d3}" fill="none" stroke="#FF2E88" stroke-width="2.2" '
             f'stroke-dasharray="9 5"/>')
    o.append(f'<text x="{sx(104):.1f}" y="{sy(60.4):.1f}" fill="#FF2E88" font-size="10" '
             f'font-family="ui-monospace,monospace">THE THREAD · 380 m</text>')

    # the 33 m dimension
    dx = sx(BX1) + 26
    o.append(f'<line x1="{dx:.1f}" y1="{sy(25.0):.1f}" x2="{dx:.1f}" y2="{sy(58.0):.1f}" '
             f'stroke="#23E5D4" stroke-width="1.2"/>')
    for e in (25.0, 58.0):
        o.append(f'<line x1="{dx-7:.1f}" y1="{sy(e):.1f}" x2="{dx+7:.1f}" y2="{sy(e):.1f}" '
                 f'stroke="#23E5D4"/>')
    o.append(f'<text x="{dx+16:.1f}" y="{sy(41.5):.1f}" fill="#23E5D4" font-size="12.5" '
             f'font-family="ui-monospace,monospace" transform="rotate(-90 {dx+16:.1f} '
             f'{sy(41.5):.1f})">33.00 m — FLOOD TO CROWN</text>')

    title = ("SECTION A–A  ·  cut north–south at x = 112"
             if kind == "NS" else "SECTION B–B  ·  cut east–west at z = 128")
    o.append(f'<text x="{sx(lo):.1f}" y="48" fill="{PAPER}" font-size="21" letter-spacing="4" '
             f'font-family="ui-monospace,monospace">PARLOUR XXXIII</text>')
    o.append(f'<text x="{sx(lo):.1f}" y="72" fill="#C9A24A" font-size="13" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">{title}</text>')
    o.append(f'<text x="{sx(lo)+430:.1f}" y="72" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">one block · eight decks · '
             f'no atrium · the cut shows the weave turning</text>')
    o.append("</svg>")
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">' + "".join(o)


# ------------------------------------------------------------------- weave ---

def weave():
    """Eight miniature plans in a column, each showing its orientation, plus the zigzag."""
    w, h = 1500, 1180
    o = [f'<rect width="{w}" height="{h}" fill="{INK}"/>']
    o.append(f'<text x="60" y="52" fill="{PAPER}" font-size="21" letter-spacing="4" '
             f'font-family="ui-monospace,monospace">THE WEAVE</text>')
    o.append(f'<text x="60" y="76" fill="#C9A24A" font-size="13" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">eight decks · the halls turn ninety '
             f'degrees every two decks</text>')
    o.append(f'<text x="60" y="96" fill="{DIM}" font-size="12" '
             f'font-family="ui-monospace,monospace">no atrium · no sightline straight '
             f'through · every deck woven against the one below</text>')

    order = ["ROOF", "L5", "L4", "L3", "L2", "L1", "L0", "B1"]
    by = {d["code"]: d for d in DECKS}
    cell_h = 112
    x0, y0 = 60, 112
    for i, code in enumerate(order):
        d = by[code]
        y = y0 + i * cell_h
        o.append(f'<text x="{x0}" y="{y+18}" fill="#C9A24A" font-size="12" '
                 f'font-family="ui-monospace,monospace">{code}</text>')
        o.append(f'<text x="{x0}" y="{y+36}" fill="{PAPER}" font-size="13" '
                 f'letter-spacing="1.5" font-family="ui-monospace,monospace">{d["name"]}</text>')
        o.append(f'<text x="{x0}" y="{y+54}" fill="{DIM}" font-size="10.5" '
                 f'font-family="ui-monospace,monospace">+{LEVELS_Y[code]:.2f} m</text>')
        ms = 1.15
        mx, my = x0 + 150, y - 10
        mp = lambda x, z: (mx + (x - BX0) * ms, my + (BZ1 - z) * ms)
        o.append(f'<rect x="{mp(BX0,BZ1)[0]:.1f}" y="{mp(BX0,BZ1)[1]:.1f}" '
                 f'width="{(BX1-BX0)*ms:.1f}" height="{(BZ1-BZ0)*ms:.1f}" fill="none" '
                 f'stroke="#C9A24A" stroke-width="1.3"/>')
        for (rx0, rz0, rx1, rz1, _n, key) in d["rooms"]:
            if rx0 == "__lanes__":
                continue
            fill, stroke = FILL[key]
            a, b = mp(rx0, rz1)
            o.append(f'<rect x="{a:.1f}" y="{b:.1f}" width="{(rx1-rx0)*ms:.1f}" '
                     f'height="{(rz1-rz0)*ms:.1f}" fill="{fill}" stroke="{stroke}" '
                     f'stroke-width="0.7" stroke-opacity="0.85"/>')
        for (vx0, vz0, vx1, vz1, _l) in d["voids"]:
            a, b = mp(vx0, vz1)
            o.append(f'<rect x="{a:.1f}" y="{b:.1f}" width="{(vx1-vx0)*ms:.1f}" '
                     f'height="{(vz1-vz0)*ms:.1f}" fill="#23E5D4" fill-opacity="0.16" '
                     f'stroke="#23E5D4" stroke-width="0.7" stroke-dasharray="2 3"/>')
        ax, ay = mx + 108, y + 44
        if d["orient"] == "NS":
            o.append(f'<path d="M {ax} {ay-9} L {ax} {ay+9} M {ax} {ay-9} l -4 5 '
                     f'M {ax} {ay-9} l 4 5" stroke="#23E5D4" stroke-width="1.3" fill="none"/>')
            o.append(f'<text x="{ax+9}" y="{ay+4}" fill="#23E5D4" font-size="9.5" '
                     f'font-family="ui-monospace,monospace">HALLS N–S</text>')
        elif d["orient"] == "EW":
            o.append(f'<path d="M {ax-10} {ay} L {ax+10} {ay} M {ax+10} {ay} l -5 -4 '
                     f'M {ax+10} {ay} l -5 4" stroke="#23E5D4" stroke-width="1.3" fill="none"/>')
            o.append(f'<text x="{ax+14}" y="{ay+4}" fill="#23E5D4" font-size="9.5" '
                     f'font-family="ui-monospace,monospace">HALLS E–W</text>')
        else:
            o.append(f'<text x="{ax-24}" y="{ay+4}" fill="{DIM}" font-size="9.5" '
                     f'font-family="ui-monospace,monospace">FULL PLATE</text>')

    # ---- the zigzag diagram
    zx, zy = 700, 150
    o.append(f'<text x="{zx}" y="{zy}" fill="#C9A24A" font-size="14" letter-spacing="2" '
             f'font-family="ui-monospace,monospace">THE ZIGZAG</text>')
    o.append(f'<text x="{zx}" y="{zy+22}" fill="{DIM}" font-size="11.5" '
             f'font-family="ui-monospace,monospace">four stairs, four corners. '
             f'Every stair turns you ninety degrees.</text>')
    o.append(f'<text x="{zx}" y="{zy+40}" fill="{DIM}" font-size="11.5" '
             f'font-family="ui-monospace,monospace">You never walk the same direction twice.</text>')

    # a simple axonometric of the block with a zigzag on it
    ax0, ay0 = zx + 60, zy + 300
    bw, bh, dp = 150, 260, 54
    def ax(x, y, z):
        return (ax0 + x + z * 0.5, ay0 - y - z * 0.34)
    def pg(pts, fill):
        d = " ".join(f"{'M' if i == 0 else 'L'} {ax(*p)[0]:.1f} {ax(*p)[1]:.1f}"
                     for i, p in enumerate(pts))
        o.append(f'<path d="{d} Z" fill="{fill}" stroke="#C9A24A" stroke-width="1.1"/>')
    pg([(0, bh, 0), (bw, bh, 0), (bw, bh, dp), (0, bh, dp)], "#1B1C23")
    pg([(bw, 0, 0), (bw, bh, 0), (bw, bh, dp), (bw, 0, dp)], "#0C0D11")
    pg([(0, 0, 0), (bw, 0, 0), (bw, bh, 0), (0, bh, 0)], "#101116")
    # deck lines on the front
    for i in range(1, 8):
        yv = bh * i / 8
        o.append(f'<line x1="{ax(0,yv,0)[0]:.1f}" y1="{ax(0,yv,0)[1]:.1f}" '
                 f'x2="{ax(bw,yv,0)[0]:.1f}" y2="{ax(bw,yv,0)[1]:.1f}" '
                 f'stroke="#2A2C34" stroke-width="0.8"/>')
    # the zigzag line climbing the front face
    pts = []
    for i in range(8):
        xx = 10 if i % 2 == 0 else bw - 10
        pts.append((xx, bh * (i + 0.5) / 8, 0))
    d = " ".join(f"{'M' if i == 0 else 'L'} {ax(a,b,c)[0]:.1f} {ax(a,b,c)[1]:.1f}"
                 for i, (a, b, c) in enumerate(pts))
    o.append(f'<path d="{d}" fill="none" stroke="#23E5D4" stroke-width="2"/>')
    for (a, b, c) in pts:
        o.append(f'<circle cx="{ax(a,b,c)[0]:.1f}" cy="{ax(a,b,c)[1]:.1f}" r="3.4" '
                 f'fill="#23E5D4"/>')
    o.append(f'<text x="{ax(0,0,dp)[0]:.1f}" y="{ax(0,0,dp)[1]+30:.1f}" fill="#23E5D4" '
             f'font-size="11" font-family="ui-monospace,monospace">THE ZIGZAG · '
             f'B1 to the Belvedere</text>')

    o.append(f'<text x="{zx}" y="{zy+620}" fill="{DIM}" font-size="11.5" '
             f'font-family="ui-monospace,monospace">Floor to floor 5.50 m · halls 26 x 58 m · '
             f'gallery 6 x 58 m · the Ribbon 5 m</text>')
    o.append(f'<text x="{zx}" y="{zy+642}" fill="{FAINT}" font-size="11" '
             f'font-family="ui-monospace,monospace">schematic · generated from the same '
             f'coordinate model as the plans</text>')
    o.append("</svg>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}">' + "".join(o))


# -------------------------------------------------------------------- main ---

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "plans")
    os.makedirs(out, exist_ok=True)
    written = []
    for d in DECKS:
        p = os.path.join(out, f"plan-{d['code'].lower()}.svg")
        open(p, "w", encoding="utf-8").write(AMP.sub("&amp;", plan_sheet(d)))
        written.append(p)
    for name, code, kind in (("section-aa", "A", "NS"), ("section-bb", "B", "EW")):
        p = os.path.join(out, f"{name}.svg")
        open(p, "w", encoding="utf-8").write(AMP.sub("&amp;", section(code, kind)))
        written.append(p)
    p = os.path.join(out, "the-weave.svg")
    open(p, "w", encoding="utf-8").write(AMP.sub("&amp;", weave()))
    written.append(p)
    for p in written:
        print(f"{os.path.getsize(p):>7,d}  {os.path.relpath(p, os.getcwd())}")


if __name__ == "__main__":
    main()
