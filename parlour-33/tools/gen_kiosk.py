#!/usr/bin/env python3
"""
gen_kiosk.py — THE P33 BOX, the sandbox edition.

A 20 x 20 m, 109 LI, seven-linkset version of Parlour XXXIII that can be
rezzed on a 512 m2 sandbox parcel and taken away in one go.

Writes plans/kiosk.svg — plan, long section, and the bill.

    python3 tools/gen_kiosk.py
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "plans", "kiosk.svg")

INK = "#07070A"
PAPER = "#E8E1D0"
BRASS = "#C9A24A"
CYAN = "#23E5D4"
MAGENTA = "#FF2E88"
ICE = "#9FE6F2"
GREEN = "#A8C46A"
GREY = "#6E6A60"
LINE = "#2A2C34"

W, SH = 1400, 880
S = 26.0          # px per metre on the plan
PX, PY = 90, 210  # plan origin (metre 0,0)

# kiosk in metres, local
X0, X1 = 0.0, 20.0
Z0, Z1 = 0.0, 20.0
GX0, GX1 = 8.0, 12.0        # the gallery
H = 6.0                     # clear height
CAB = 8                     # cabinets
LANES = 2

o = []
a = o.append


def px(x, z):
    return PX + x * S, PY + z * S


def rect(x0, z0, x1, z1, fill="none", stroke=BRASS, w=1.4, dash=None, op=1.0):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    a(f'<rect x="{px(x0, z0)[0]:.1f}" y="{px(x0, z0)[1]:.1f}" width="{(x1-x0)*S:.1f}" '
      f'height="{(z1-z0)*S:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" '
      f'stroke-opacity="{op}"{d}/>')


def text(x, y, s, col=PAPER, size=11, anchor="start", op=0.9, spacing=0.0, weight="400"):
    a(f'<text x="{x:.1f}" y="{y:.1f}" fill="{col}" font-size="{size}" text-anchor="{anchor}" '
      f'font-family="ui-monospace,monospace" opacity="{op}" letter-spacing="{spacing}" '
      f'font-weight="{weight}">{esc(s)}</text>')


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ------------------------------------------------------------------ sheet ---
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{SH}" viewBox="0 0 {W} {SH}">')
a(f'<rect width="{W}" height="{SH}" fill="{INK}"/>')

text(90, 62, "PARLOUR XXXIII", PAPER, 22, spacing=4)
text(90, 88, "THE P33 BOX  ·  SANDBOX EDITION  ·  20 × 20 m  ·  109 LI  ·  7 LINKSETS",
     BRASS, 13, spacing=2)
text(90, 110, "everything here is rezzable in one go, copyable, and leaves nothing behind",
     GREY, 11.5)

# ------------------------------------------------------------------- plan ---
text(90, 168, "PLAN", GREY, 11, spacing=3)

rect(X0, Z0, X1, Z1, "none", BRASS, 2.6)
rect(X0 + 0.6, Z0 + 0.6, X1 - 0.6, Z1 - 0.6, "none", LINE, 0.8)

# rooms
rect(0.6, 0.6, GX0, Z1 - 0.6, "#1A1710", BRASS, 1.0)          # the Lane
rect(GX1, 0.6, X1 - 0.6, Z1 - 0.6, "#1E1026", MAGENTA, 1.0)   # Cabinet Row
rect(GX0, 0.6, GX1, Z1 - 0.6, "#101319", ICE, 1.2)            # the gallery

# lanes: two lanes running east-west in the west room
for i in range(LANES):
    zz = 5.0 + i * 3.6
    a(f'<rect x="{px(1.2, zz)[0]:.1f}" y="{px(0, zz)[1]:.1f}" width="{6.4*S:.1f}" '
      f'height="{3.4*S:.1f}" fill="#2A2018" stroke="{BRASS}" stroke-width="0.7" opacity="0.9"/>')
    for k in range(1, 3):
        a(f'<line x1="{px(1.2, zz + 3.4*k/3)[0]:.1f}" y1="{px(0, zz + 3.4*k/3)[1]:.1f}" '
          f'x2="{px(7.6, zz + 3.4*k/3)[0]:.1f}" y2="{px(0, zz + 3.4*k/3)[1]:.1f}" '
          f'stroke="{BRASS}" stroke-width="0.4" opacity="0.35"/>')
    # pins
    for k in range(10):
        cx, cz = 7.9, zz + 0.35 + k * 0.3
        a(f'<circle cx="{px(cx, cz)[0]:.1f}" cy="{px(0, cz)[1]:.1f}" r="1.4" fill="{PAPER}" opacity="0.8"/>')

# cabinets on the east wall
for i in range(CAB):
    zz = 3.0 + i * 2.0
    rect(11.9, zz, 12.7, zz + 1.5, "#0B0A0D", CYAN if i % 2 else MAGENTA, 0.8)

# the flume, overhead, crossing the gallery
a(f'<line x1="{px(17.4, 17.4)[0]:.1f}" y1="{px(0, 17.4)[1]:.1f}" '
  f'x2="{px(3.0, 3.4)[0]:.1f}" y2="{px(0, 3.4)[1]:.1f}" stroke="{ICE}" stroke-width="9" '
  f'stroke-linecap="round" opacity="0.18"/>')
a(f'<line x1="{px(17.4, 17.4)[0]:.1f}" y1="{px(0, 17.4)[1]:.1f}" '
  f'x2="{px(3.0, 3.4)[0]:.1f}" y2="{px(0, 3.4)[1]:.1f}" stroke="{ICE}" stroke-width="1.6" '
  f'stroke-dasharray="7 5"/>')
a(f'<circle cx="{px(3.0, 3.4)[0]:.1f}" cy="{px(0, 3.4)[1]:.1f}" r="7" fill="{ICE}" opacity="0.55"/>')

# the Ribbon: a 1.2 m golf ledge inside the perimeter
for (x0, z0, x1, z1) in [(0.6, 0.6, 1.8, 19.4), (18.2, 0.6, 19.4, 19.4),
                         (1.8, 18.2, 18.2, 19.4), (1.8, 0.6, 18.2, 1.8)]:
    a(f'<rect x="{px(x0, z0)[0]:.1f}" y="{px(0, z0)[1]:.1f}" '
      f'width="{(x1-x0)*S:.1f}" height="{(z1-z0)*S:.1f}" fill="{GREEN}" opacity="0.16"/>')
a(f'<circle cx="{px(19.0, 12.0)[0]:.1f}" cy="{px(0, 12.0)[1]:.1f}" r="5" fill="{GREEN}"/>')
text(px(19.0, 12.0)[0] + 10, px(0, 12.0)[1] + 4, "HOLE 11", GREEN, 9.5)

# the 34th door
rect(11.9, 10.4, 12.4, 11.6, "#2A0E14", MAGENTA, 1.0)
text(px(12.4, 11.0)[0] + 12, px(0, 11.0)[1] + 4, "THE 34TH", MAGENTA, 9)

# the shopfront / threshold
rect(6.0, 19.4, 14.0, 21.6, "#12100C", BRASS, 1.2)
text(px(10.0, 21.9)[0], px(0, 21.9)[1] + 14, "THE THRESHOLD", PAPER, 10, "middle", 0.8)
a(f'<rect x="{px(7.0, 21.6)[0]:.1f}" y="{px(0, 21.6)[1]:.1f}" width="{6.0*S:.1f}" height="10" fill="{MAGENTA}" opacity="0.55"/>')

# labels
text(px(4.4, 9.4)[0], px(0, 9.4)[1], "THE LANE · 2", PAPER, 10.5, "middle", 0.75, 0.6)
text(px(10.0, 9.4)[0], px(0, 9.4)[1], "THE GALLERY · 4 m", ICE, 10.5, "middle", 0.9, 0.6)
text(px(16.0, 9.4)[0], px(0, 9.4)[1], "CABINET ROW · 8", PAPER, 10.5, "middle", 0.75, 0.6)
text(px(10.0, 18.6)[0], px(0, 18.6)[1], "THE BELL IS ABOVE YOU", GREY, 9, "middle", 0.7)

# ------------------------------------------------------------------ section ---
SX, SY = 700, 176
SS = 28.0   # px per metre, section


def sx(x, y):
    return SX + x * SS, SY + (7.2 - y) * SS


text(SX, 152, "LONG SECTION A–A", GREY, 11, spacing=3)
# ground
a(f'<line x1="{SX}" y1="{sx(0,0)[1]:.1f}" x2="{SX + 20*SS}" y2="{sx(0,0)[1]:.1f}" stroke="{BRASS}" stroke-width="2"/>')
# shell
a(f'<path d="M {sx(0,0)[0]:.1f} {sx(0,0)[1]:.1f} L {sx(0,0)[0]:.1f} {sx(0,H)[1]:.1f} '
  f'L {sx(20,H)[0]:.1f} {sx(20,H)[1]:.1f} L {sx(20,H)[0]:.1f} {sx(20,0)[1]:.1f}" '
  f'fill="none" stroke="{BRASS}" stroke-width="2.4"/>')
# gallery glazing (the section cuts the gallery, so show its two mullions at 8 m and 12 m)
for gx in (8.0, 12.0):
    a(f'<line x1="{sx(gx,0)[0]:.1f}" y1="{sx(gx,0)[1]:.1f}" x2="{sx(gx,4.3)[0]:.1f}" '
      f'y2="{sx(gx,4.3)[1]:.1f}" stroke="{ICE}" stroke-width="2" opacity="0.8"/>')
a(f'<line x1="{sx(8,4.3)[0]:.1f}" y1="{sx(8,4.3)[1]:.1f}" x2="{sx(12,4.3)[0]:.1f}" '
  f'y2="{sx(12,4.3)[1]:.1f}" stroke="{ICE}" stroke-width="1" opacity="0.5"/>')
# cabinets
for i in range(4):
    x = 13.0 + i * 1.4
    a(f'<rect x="{sx(x,0)[0]:.1f}" y="{sx(x,1.9)[1]:.1f}" width="{1.1*SS:.1f}" '
      f'height="{1.9*SS:.1f}" fill="#0B0A0D" stroke="{CYAN}" stroke-width="0.8"/>')
# lanes + pins
a(f'<rect x="{sx(1.4,0)[0]:.1f}" y="{sx(0,0.15)[1]:.1f}" width="{6.2*SS:.1f}" height="{0.15*SS:.1f}" fill="{BRASS}" opacity="0.8"/>')
for i in range(6):
    a(f'<rect x="{sx(6.4 + i*0.22,0.15)[0]:.1f}" y="{sx(0,0.9)[1]:.1f}" width="{0.12*SS:.1f}" '
      f'height="{0.75*SS:.1f}" fill="{PAPER}" opacity="0.75"/>')
# the flume tube in section
a(f'<path d="M {sx(17.6,5.6)[0]:.1f} {sx(17.6,5.6)[1]:.1f} L {sx(3.0,0.9)[0]:.1f} {sx(3.0,0.9)[1]:.1f}" '
  f'stroke="{ICE}" stroke-width="14" stroke-linecap="round" opacity="0.22"/>')
a(f'<path d="M {sx(17.6,5.6)[0]:.1f} {sx(17.6,5.6)[1]:.1f} L {sx(3.0,0.9)[0]:.1f} {sx(3.0,0.9)[1]:.1f}" '
  f'stroke="{ICE}" stroke-width="2" stroke-dasharray="7 5"/>')
# the bell on the roof
a(f'<path d="M {sx(9.2,6)[0]:.1f} {sx(9.2,6)[1]:.1f} L {sx(9.4,7.6)[0]:.1f} {sx(9.4,7.6)[1]:.1f} '
  f'L {sx(10.6,7.6)[0]:.1f} {sx(10.6,7.6)[1]:.1f} L {sx(10.8,6)[0]:.1f} {sx(10.8,6)[1]:.1f} Z" '
  f'fill="{BRASS}" opacity="0.85"/>')
# dimension chain
a(f'<line x1="{sx(0,0)[0]:.1f}" y1="{sx(0,0)[1]+30:.1f}" x2="{sx(20,0)[0]:.1f}" y2="{sx(20,0)[1]+30:.1f}" '
  f'stroke="{GREY}" stroke-width="0.8"/>')
text((sx(0, 0)[0] + sx(20, 0)[0]) / 2, sx(0, 0)[1] + 48, "20.00", GREY, 10, "middle")
a(f'<line x1="{sx(20,H)[0]+22:.1f}" y1="{sx(0,H)[1]:.1f}" x2="{sx(20,H)[0]+22:.1f}" y2="{sx(0,0)[1]:.1f}" '
  f'stroke="{GREY}" stroke-width="0.8"/>')
text(sx(20, H)[0] + 30, (sx(0, 0)[1] + sx(0, H)[1]) / 2, "6.00", GREY, 10)
text(sx(10.0, 8.1)[0], sx(0, 8.1)[1] - 6, "THE BELL", BRASS, 9.5, "middle")
text(sx(13.5, 2.4)[0], sx(0, 2.4)[1] - 10, "CABINETS", CYAN, 9.5)
text(sx(3.4, 1.4)[0], sx(0, 1.4)[1] - 12, "LANES", BRASS, 9.5)
text(sx(11.0, 4.7)[0], sx(0, 4.7)[1] - 10, "GALLERY", ICE, 9.5, "middle")

# --------------------------------------------------------------- the bill ---
BX, BY = 700, 448
text(BX, BY, "THE BILL", GREY, 11, spacing=3)
bill = [
    ("shell, roof, shopfront, marquee", 14),
    ("gallery glazing — 2 panels, 5 mullions", 8),
    ("2 lanes, 2 pinsets (10 pins one mesh)", 14),
    ("8 cabinets (3 working, 5 dressed)", 40),
    ("the flume tube + splashdown", 8),
    ("the Bell + clapper", 6),
    ("the ledger, the dispenser, the card", 5),
    ("3 station plaques + the 34th door", 6),
    ("the Ribbon ledge + hole 11", 6),
    ("the Croupier's mirror", 2),
    ("lighting — 6 fixtures", 6),
    ("dressing — 2 benches, rail, clock, signs", 14),
]
y = BY + 26
for name, li in bill:
    text(BX, y, name, PAPER, 10.5, op=0.8)
    text(BX + 470, y, str(li), BRASS, 10.5, anchor="end")
    y += 14
a(f'<line x1="{BX}" y1="{y-8}" x2="{BX+470}" y2="{y-8}" stroke="{LINE}" stroke-width="1"/>')
text(BX, y + 12, "TOTAL", PAPER, 11.5, weight="700")
text(BX + 470, y + 12, "109 LI", BRASS, 12.5, anchor="end", weight="700")
text(BX, y + 30, "7 linksets · 9 scripts · 0 physics · 0 listeners on a cabinet", GREY, 10)
text(BX, y + 46, "fits a 512 m² parcel (117 LI) with 8 to spare", GREEN, 10)

# what it proves
PX2, PY2 = 700, 712
text(PX2, PY2, "WHAT IT PROVES IN NINETY SECONDS", GREY, 11, spacing=3)
proof = [
    "01  two rooms, one pane — the whole thesis, at 4 m",
    "02  three cabinets that are actually playable",
    "03  the House's hand: you are always one point behind",
    "04  the Ledger remembers you by UUID, no HUD",
    "05  the Bell rings when you beat it · the 34th door says OCCUPIED",
]
y = PY2 + 24
for line in proof:
    text(PX2, y, line, PAPER, 10.5, op=0.82)
    y += 21

# scale bar
a(f'<line x1="90" y1="800" x2="{90+5*S:.1f}" y2="800" stroke="{PAPER}" stroke-width="1.6"/>')
for i in range(6):
    a(f'<line x1="{90+i*S:.1f}" y1="795" x2="{90+i*S:.1f}" y2="805" stroke="{PAPER}" stroke-width="1.2"/>')
    text(90 + i * S, 820, str(i * 5), GREY, 10, "middle")
text(90 + 5 * S + 10, 820, "metres", GREY, 10)

text(90, 852, "parlour-33/tools/gen_kiosk.py · the sandbox edition · schematic, not a prim plan", GREY, 10)

a("</svg>")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write("".join(o))
print("wrote", OUT)
