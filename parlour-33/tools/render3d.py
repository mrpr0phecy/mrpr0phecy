#!/usr/bin/env python3
"""
render3d.py — real 3D renders of THE WEAVE.

Builds an actual polygon scene out of the same coordinate model that draws
the plans (gen_plans.py), then rasterises it with a little software renderer
(numpy + pillow, no GPU, no external renderer).

    python3 tools/render3d.py            # all views
    python3 tools/render3d.py gallery    # one view

Writes parlour-33/renders/*.png. Everything is schematic: this is a massing
and light study, not a prim plan.
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

import gen_plans as G

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "renders")

# ---------------------------------------------------------------- palette ---
P = {
    "ink":     (0.030, 0.030, 0.042),
    "shell":   (0.055, 0.056, 0.065),
    "slab":    (0.085, 0.086, 0.100),
    "floor":   (0.070, 0.070, 0.082),
    "water":   (0.040, 0.30, 0.38),
    "ice":     (0.42, 0.72, 0.78),
    "lane":    (0.30, 0.21, 0.11),
    "arcade":  (0.16, 0.07, 0.22),
    "casino":  (0.24, 0.06, 0.10),
    "net":     (0.07, 0.20, 0.13),
    "kart":    (0.30, 0.14, 0.06),
    "gallery": (0.09, 0.12, 0.16),
    "bar":     (0.20, 0.09, 0.11),
    "service": (0.10, 0.11, 0.13),
    "brass":   (0.62, 0.47, 0.19),
    "cyan":    (0.10, 0.90, 0.82),
    "magenta": (1.00, 0.16, 0.50),
    "amber":   (1.00, 0.62, 0.20),
    "bone":    (0.86, 0.82, 0.72),
}
DECKTINT = {
    "B1": (0.045, 0.045, 0.060), "L0": (0.045, 0.100, 0.130), "L1": (0.085, 0.125, 0.155),
    "L2": (0.135, 0.090, 0.055), "L3": (0.120, 0.045, 0.065), "L4": (0.050, 0.100, 0.070),
    "L5": (0.105, 0.070, 0.090), "ROOF": (0.090, 0.090, 0.100),
}
ZONE = {
    "structure": P["floor"], "back": P["ink"], "water": P["water"],
    "ice": (0.14, 0.20, 0.25), "lane": P["lane"], "arcade": P["arcade"],
    "casino": P["casino"], "net": P["net"], "kart": P["kart"],
    "gallery": P["gallery"], "bar": P["bar"], "service": P["service"],
    "dark": (0.03, 0.03, 0.045), "lift": P["service"], "coaster": P["casino"],
}


# ------------------------------------------------------------------ scene ---
class Scene:
    def __init__(self):
        self.tris = []

    def tri(self, a, b, c, col, alpha=1.0, em=0.0):
        self.tris.append((np.asarray(a, float), np.asarray(b, float),
                          np.asarray(c, float), np.asarray(col, float), alpha, em))

    def quad(self, a, b, c, d, col, alpha=1.0, em=0.0):
        self.tri(a, b, c, col, alpha, em)
        self.tri(a, c, d, col, alpha, em)

    def box(self, xr, yr, zr, col, em=0.0, alpha=1.0, skip_bottom=True):
        x0, x1 = xr
        y0, y1 = yr
        z0, z1 = zr
        # top
        self.quad((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1), col, alpha, em)
        if not skip_bottom:
            self.quad((x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0), col, alpha, em)
        # sides
        self.quad((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), col, alpha, em)
        self.quad((x1, y0, z1), (x0, y0, z1), (x0, y1, z1), (x1, y1, z1), col, alpha, em)
        self.quad((x0, y0, z1), (x0, y0, z0), (x0, y1, z0), (x0, y1, z1), col, alpha, em)
        self.quad((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0), col, alpha, em)

    def explode(self, step=2.2):
        bands = [G.LEVELS_Y[k] for k in ["B1", "L0", "L1", "L2", "L3", "L4", "L5", "ROOF"]]
        out = []
        for (a, b, c, col, alpha, em) in self.tris:
            yc = (a[1] + b[1] + c[1]) / 3.0
            k = 0
            for i, yy in enumerate(bands):
                if yc >= yy - 0.1:
                    k = i
            dy = k * step
            out.append((a + np.array([0, dy, 0]), b + np.array([0, dy, 0]),
                        c + np.array([0, dy, 0]), col, alpha, em))
        self.tris = out

    def plate(self, xr, zr, y, col, em=0.0, alpha=1.0):
        x0, x1 = xr
        z0, z1 = zr
        self.quad((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), col, alpha, em)

    def cyl(self, p0, p1, r, col, seg=10, em=0.0, alpha=1.0, caps=True):
        p0 = np.asarray(p0, float)
        p1 = np.asarray(p1, float)
        ax = p1 - p0
        L = np.linalg.norm(ax)
        if L < 1e-6:
            return
        ax = ax / L
        tmp = np.array([0.0, 1.0, 0.0]) if abs(ax[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
        u = np.cross(ax, tmp)
        u /= np.linalg.norm(u)
        v = np.cross(ax, u)
        ring0, ring1 = [], []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            o = (math.cos(a) * u + math.sin(a) * v) * r
            ring0.append(p0 + o)
            ring1.append(p1 + o)
        for i in range(seg):
            j = (i + 1) % seg
            self.quad(ring0[i], ring0[j], ring1[j], ring1[i], col, alpha, em)
        if caps:
            c0 = p0
            c1 = p1
            for i in range(seg):
                j = (i + 1) % seg
                self.tri(c0, ring0[j], ring0[i], col, alpha, em)
                self.tri(c1, ring1[i], ring1[j], col, alpha, em)


# --------------------------------------------------------------- building ---
BX0, BX1 = G.BX0, G.BX1
BZ0, BZ1 = G.BZ0, G.BZ1
IX0, IX1 = G.IX0, G.IX1
IZ0, IZ1 = G.IZ0, G.IZ1
LV = G.LEVELS_Y
DECK_H = 5.50
SLAB = 0.60


def deck_rooms(code):
    for d in G.DECKS:
        if d["code"] == code:
            return d
    return None


def build_shell(sc, with_windows=True):
    top = LV["ROOF"] + 0.6
    # four walls, thickened into the band
    sc.box((BX0, BX0 + 0.6), (LV["B1"], top), (BZ0, BZ1), P["shell"])
    sc.box((BX1 - 0.6, BX1), (LV["B1"], top), (BZ0, BZ1), P["shell"])
    sc.box((BX0, BX1), (LV["B1"], top), (BZ0, BZ0 + 0.6), P["shell"])
    sc.box((BX0, BX1), (LV["B1"], top), (BZ1 - 0.6, BZ1), P["shell"])
    # parapet + roof plate
    sc.plate((BX0, BX1), (BZ0, BZ1), LV["ROOF"], P["slab"])
    sc.box((BX0, BX0 + 0.6), (LV["ROOF"], LV["ROOF"] + 0.6), (BZ0, BZ1), P["brass"], em=0.25)
    sc.box((BX1 - 0.6, BX1), (LV["ROOF"], LV["ROOF"] + 0.6), (BZ0, BZ1), P["brass"], em=0.25)
    sc.box((BX0, BX1), (LV["ROOF"], LV["ROOF"] + 0.6), (BZ0, BZ0 + 0.6), P["brass"], em=0.25)
    sc.box((BX0, BX1), (LV["ROOF"], LV["ROOF"] + 0.6), (BZ1 - 0.6, BZ1), P["brass"], em=0.25)
    # band windows: one strip per deck on all four faces
    if with_windows:
        for code in ["L0", "L1", "L2", "L3", "L4", "L5"]:
            y = LV[code] + 1.2
            col = P["amber"] if code in ("L2", "L4") else P["cyan"]
            sc.box((BX0 - 0.18, BX0 - 0.02), (y, y + 0.6), (IZ0 + 2, IZ1 - 2), col, em=0.95)
            sc.box((BX1 + 0.02, BX1 + 0.18), (y, y + 0.6), (IZ0 + 2, IZ1 - 2), col, em=0.95)
            sc.box((IX0 + 2, IX1 - 2), (y, y + 0.6), (BZ0 - 0.18, BZ0 - 0.02), col, em=0.95)
            sc.box((IX0 + 2, IX1 - 2), (y, y + 0.6), (BZ1 + 0.02, BZ1 + 0.18), col, em=0.95)


def build_decks(sc, cut_z=None, low_walls=False):
    for d in G.DECKS:
        code = d["code"]
        y = LV[code]
        if code == "ROOF":
            continue
        # slab under the deck
        sc.plate((IX0, IX1), (IZ0, IZ1), y, DECKTINT.get(code, P["slab"]))
        # room tints
        for r in d["rooms"]:
            if r[0] == "__lanes__" or r[0] == "__lanes__":
                continue
            x0, z0, x1, z1, name, key = r
            if x0 is None:
                continue
            sc.plate((x0, x1), (z0, z1), y + 0.06, ZONE.get(key, P["floor"]))
        # the room walls (0.35 thick) and a ceiling, so a cutaway reads
        T = 0.35
        sc.box((IX0, IX1), (y, y + 5.2), (IZ0, IZ0 + T), P["slab"])
        sc.box((IX0, IX1), (y, y + 5.2), (IZ1 - T, IZ1), P["slab"])
        sc.box((IX0, IX0 + T), (y, y + 5.2), (IZ0, IZ1), P["slab"])
        sc.box((IX1 - T, IX1), (y, y + 5.2), (IZ0, IZ1), P["slab"])
        sc.box((IX0, IX1), (y + 4.75, y + 4.95), (IZ0, IZ1), P["slab"], skip_bottom=False)

        # the Ribbon: a 5 m band round the whole deck, with a brass kerb
        sc.plate((BX0, BX1), (BZ0, BZ0 + G.BAND), y + 0.05, (0.11, 0.13, 0.10))
        sc.plate((BX0, BX1), (BZ1 - G.BAND, BZ1), y + 0.05, (0.11, 0.13, 0.10))
        sc.plate((BX0, BX0 + G.BAND), (BZ0, BZ1), y + 0.05, (0.11, 0.13, 0.10))
        sc.plate((BX1 - G.BAND, BX1), (BZ0, BZ1), y + 0.05, (0.11, 0.13, 0.10))
        sc.box((BX0, BX1), (y, y + 0.18), (BZ0, BZ0 + 0.25), P["brass"], em=0.10)
        sc.box((BX0, BX1), (y, y + 0.18), (BZ1 - 0.25, BZ1), P["brass"], em=0.10)
        sc.box((BX0, BX0 + 0.25), (y, y + 0.18), (BZ0, BZ1), P["brass"], em=0.10)
        sc.box((BX1 - 0.25, BX1), (y, y + 0.18), (BZ0, BZ1), P["brass"], em=0.10)

        # gallery glazing
        gx = d["orient"]
        if gx == "NS":
            for xx in (125.0, 131.0):
                sc.quad((xx, y + 0.1, IZ0), (xx, y + 0.1, IZ1),
                        (xx, y + 4.3, IZ1), (xx, y + 4.3, IZ0), (0.45, 0.75, 0.82), alpha=0.07)
        else:
            for zz in (125.0, 131.0):
                sc.quad((IX0, y + 0.1, zz), (IX1, y + 0.1, zz),
                        (IX1, y + 4.3, zz), (IX0, y + 4.3, zz), (0.45, 0.75, 0.82), alpha=0.07)
        # mullions every 14.5 m: the rhythm that sells the 6 m width
        if gx == "NS":
            for k in range(5):
                zz = IZ0 + k * 14.5
                sc.box((124.9, 125.1), (y, y + 4.3), (zz, zz + 0.18), P["brass"], em=0.18)
                sc.box((130.9, 131.1), (y, y + 4.3), (zz, zz + 0.18), P["brass"], em=0.18)
        else:
            for k in range(5):
                xx = IX0 + k * 14.5
                sc.box((xx, xx + 0.18), (y, y + 4.3), (124.9, 125.1), P["brass"], em=0.18)
                sc.box((xx, xx + 0.18), (y, y + 4.3), (130.9, 131.1), P["brass"], em=0.18)

        # gallery light strip
        if gx == "NS":
            sc.box((127.4, 128.6), (y + 4.32, y + 4.38), (IZ0 + 2, IZ1 - 2), P["cyan"], em=0.75)
        else:
            sc.box((IX0 + 2, IX1 - 2), (y + 4.32, y + 4.38), (127.4, 128.6), P["cyan"], em=0.75)


def build_contents(sc):
    # ---- B1 laser quest: catwalks + a few blocks
    y = LV["B1"]
    for i in range(6):
        x = 104 + i * 8
        sc.box((x, x + 1.6), (y, y + 1.6), (106, 128), (0.10, 0.12, 0.15))
    sc.box((114, 126), (y, y + 0.9), (140, 150), P["brass"], em=0.2)   # the Hive

    # ---- L0 pool
    y = LV["L0"]
    sc.box((103.6, 122.4), (y, y + 0.42), (115.6, 140.4), (0.10, 0.09, 0.08))  # basin rim
    sc.box((104, 122), (y + 0.20, y + 0.34), (116, 140), P["water"], em=0.55)   # water
    sc.box((104, 112), (y - 0.1, y + 0.55), (116, 126), (0.02, 0.12, 0.16), em=0.15)  # grotto
    for i in range(4):                                                          # loungers
        sc.box((100, 101.8), (y, y + 0.35), (128 + i * 3, 129.6 + i * 3), P["bone"])

    # ---- L1 rink
    y = LV["L1"]
    sc.box((107, 121), (y - 0.25, y + 0.02), (114, 142), P["ice"], em=0.25)
    for i in range(4):                                                          # Cold Bench tiers
        sc.box((99.4, 103), (y + i * 0.4, y + i * 0.4 + 0.35), (114, 142), P["lane"])

    # ---- L2 lanes + cabinets
    y = LV["L2"]
    for i in range(10):
        z0 = 103 + i * 1.7
        sc.box((104, 130), (y, y + 0.06), (z0 + 0.1, z0 + 1.6), P["lane"], em=0.05)
    sc.box((124, 130), (y, y + 0.9), (103, 120), (0.10, 0.08, 0.06))            # pin deck
    for i in range(10):                                                         # pins
        for j in range(3):
            zc = 103 + i * 1.7 + 0.4 + j * 0.45
            sc.cyl((126.5 + j * 0.5, y + 0.9, zc), (126.5 + j * 0.5, y + 1.15, zc), 0.10, P["bone"], 6)
    for i in range(10):                                                         # cabinets on the glass
        x0 = 100 + i * 5.4
        sc.box((x0, x0 + 0.95), (y, y + 1.85), (132.4, 133.4), (0.05, 0.04, 0.07))
        sc.box((x0 + 0.12, x0 + 0.85), (y + 1.32, y + 1.78), (133.4, 133.55),
               P["cyan"] if i % 2 else P["magenta"], em=0.9)
    for a in range(4):                                                          # 24 cabinets
        for i in range(6):
            x0 = 101 + a * 14 + i * 1.1
            sc.box((x0, x0 + 0.9), (y, y + 1.85), (145, 146.1), (0.05, 0.04, 0.07))
            sc.box((x0 + 0.1, x0 + 0.8), (y + 1.35, y + 1.75), (144.9, 145.0),
                   P["cyan"] if i % 2 else P["magenta"], em=0.8)
    sc.box((131, 157), (y, y + 1.1), (99, 104), P["bar"])                       # the Salon

    # ---- L3 casino
    y = LV["L3"]
    for i in range(6):
        for j in range(2):
            cx = 106 + i * 8
            cz = 106 + j * 12
            sc.cyl((cx, y, cz), (cx, y + 0.78, cz), 0.85, (0.10, 0.06, 0.07), 12)
            sc.cyl((cx, y + 0.78, cz), (cx, y + 0.82, cz), 0.9, P["brass"], 12)
    sc.box((118, 132), (y - 0.9, y), (104, 118), (0.04, 0.03, 0.04))            # the Pit, sunken

    # ---- L4 nets + karts
    y = LV["L4"]
    for i in range(7):
        x = 100 + i * 3.6
        for k in range(3):
            sc.box((x, x + 0.12), (y + k * 3.4, y + k * 3.4 + 0.1), (100, 156), P["net"], em=0.05)
            sc.box((100, 156), (y + k * 3.4, y + k * 3.4 + 0.1), (x, x + 0.12), P["net"], em=0.05)
    loop = [(133, 112), (155, 112), (155, 140), (133, 140), (133, 112)]
    for i in range(len(loop) - 1):
        p0 = (loop[i][0], y + 0.05, loop[i][1])
        p1 = (loop[i + 1][0], y + 0.05, loop[i + 1][1])
        sc.cyl(p0, p1, 1.5, (0.12, 0.06, 0.04), 8, em=0.0, caps=False)
    sc.cyl((144, y + 0.05, 112), (144, y + 0.05, 140), 1.5, (0.12, 0.06, 0.04), 8, caps=False)
    sc.box((136, 152), (y, y + 1.0), (114, 138), P["bar"])                      # the Island

    # ---- L5 crown
    y = LV["L5"]
    sc.box((131, 157), (y, y + 1.1), (99, 106), P["bar"])
    sc.box((131, 152), (y, y + 0.35), (138, 157), (0.10, 0.09, 0.10))           # station platform
    sc.box((152, 157), (y, y + 2.4), (127, 134), (0.10, 0.05, 0.05), em=0.15)   # the 34th door

    # ---- roof: bell, plant, coaster
    y = LV["ROOF"]
    sc.cyl((133, y, 134), (133, y + 5.0, 134), 4.4, P["brass"], 16, em=0.18)
    sc.cyl((133, y + 5.0, 134), (133, y + 6.2, 134), 1.4, P["brass"], 12, em=0.3)
    sc.box((152, 157), (y, y + 3.2), (138, 157), P["service"])
    for i in range(12):                                                         # telescopes
        x = 97 + i * 5.6
        sc.cyl((x, y, 96.6), (x, y + 1.1, 96.6), 0.09, P["brass"], 6)

    # ---- the coaster (the Thread) on the roof
    track = [(150, 152), (150, 104), (130, 100), (110, 104), (99, 128), (110, 140), (128, 146)]
    py = y + 2.2
    for i in range(len(track) - 1):
        p0 = (track[i][0], py, track[i][1])
        p1 = (track[i + 1][0], py, track[i + 1][1])
        sc.cyl(p0, p1, 0.45, P["magenta"], 6, em=0.25, caps=False)
        sc.cyl((p0[0], y, p0[2]), (p0[0], py, p0[2]), 0.22, (0.2, 0.2, 0.22), 5)

    # ---- the flume: one glass tube, top to bottom
    t = np.array([G.FLUME_TOP[0], G.FLUME_TOP[2], G.FLUME_TOP[1]], float)
    b = np.array([G.FLUME_BOT[0], G.FLUME_BOT[2], G.FLUME_BOT[1]], float)
    n = 14
    prev = t
    for i in range(1, n + 1):
        f = i / n
        p = t + (b - t) * f
        p[1] += math.sin(f * math.pi) * -1.2
        sc.cyl(tuple(prev), tuple(p), 0.85, (0.55, 0.85, 0.90), 8, em=0.10, alpha=0.30)
        prev = p

    # ---- the Sunbeam: a blade of daylight, five decks down
    for k in range(6):
        yy = LV["L5"] + 0.5 - k * 5.5
        sc.box((104.5, 106.5), (yy - 5.0, yy), (122.5, 124.5), (1.0, 0.92, 0.66),
               em=0.06, alpha=0.10)

    # ---- stairs: four corner towers
    for (sx0, sz0, sx1, sz1, nm) in G.STAIRS:
        for k in range(6):
            yy = LV["B1"] + k * DECK_H
            sc.box((sx0 + 0.4, sx1 - 0.4), (yy, yy + 0.25), (sz0 + 0.4, sz1 - 0.4), P["slab"])
            sc.box((sx0 + 0.4, sx1 - 0.4), (yy + 0.25, yy + 0.9), (sz0 + 0.4, sz1 - 0.4), P["brass"], em=0.12)


def build_plaza(sc):
    y = LV["B1"] - 0.6
    sc.plate((60, 200), (60, 200), y - 0.02, (0.045, 0.045, 0.055))
    # the shopfront
    sc.box((127, 141), (y, y + 6.4), (162, 167), (0.10, 0.08, 0.07))
    sc.box((128, 140), (y + 0.9, y + 3.2), (161.7, 162.0), P["amber"], em=0.9)
    sc.box((128.5, 136), (y + 4.7, y + 5.6), (161.4, 162.0), P["magenta"], em=1.0)
    sc.box((137, 140.5), (y + 4.9, y + 6.2), (161.5, 162.0), P["cyan"], em=1.0)
    # a little rain-lit ground
    for i in range(24):
        x = 70 + i * 5
        sc.plate((x, x + 4), (168, 190), y, (0.05, 0.05, 0.06))


# ------------------------------------------------------------- rasteriser ---
def _clip_near(poly, near):
    """Sutherland-Hodgman against z >= near in camera space."""
    out = []
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        ina = a[2] >= near
        inb = b[2] >= near
        if ina:
            out.append(a)
        if ina != inb:
            t = (near - a[2]) / (b[2] - a[2])
            out.append(a + (b - a) * t)
    return out


def _clip_plane(poly, nrm, d):
    """Keep the side where dot(p, nrm) <= d."""
    out = []
    m = len(poly)
    for i in range(m):
        a = poly[i]
        b = poly[(i + 1) % m]
        da = float(np.dot(a, nrm)) - d
        db = float(np.dot(b, nrm)) - d
        if da <= 0:
            out.append(a)
        if (da <= 0) != (db <= 0):
            t = da / (da - db)
            out.append(a + (b - a) * t)
    return out


def render(sc, eye, target, W, H, fov=52.0, bg=(0.012, 0.014, 0.022),
           fog=(40.0, 300.0), cut=None, keep=None, sun=(-0.45, 0.72, 0.52), amb=0.30):
    eye = np.asarray(eye, float)
    tgt = np.asarray(target, float)
    fwd = tgt - eye
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    focal = (H / 2.0) / math.tan(math.radians(fov) / 2.0)
    s = np.asarray(sun, float)
    s = s / np.linalg.norm(s)
    s2 = np.array([-0.6, 0.35, -0.7])
    s2 = s2 / np.linalg.norm(s2)

    img = np.zeros((H, W, 3), float)
    img[:] = np.asarray(bg)
    zbuf = np.full((H, W), 1e18)

    # opaque first, glass after
    order = sorted(range(len(sc.tris)), key=lambda i: sc.tris[i][4])

    for idx in order:
        a, b, c, col, alpha, em = sc.tris[idx]
        if keep is not None and not keep((a + b + c) / 3.0):
            continue
        poly = [a, b, c]
        if cut is not None:
            nrm, d = cut
            poly = _clip_plane(poly, nrm, d)
            if len(poly) < 3:
                continue
        cam = []
        for v in poly:
            rel = v - eye
            cam.append(np.array([rel @ right, rel @ up, rel @ fwd]))
        cam = _clip_near(cam, 0.25)
        if len(cam) < 3:
            continue

        # shading from the original (world) normal
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        n = n / ln
        lam = abs(float(np.dot(n, -s)))
        lam2 = abs(float(np.dot(n, -s2)))
        shade = amb + 0.72 * lam + 0.30 * lam2
        base = col * shade * (1.0 - em) + col * em * 1.7
        centroid = (a + b + c) / 3.0
        zc = float((centroid - eye) @ fwd)
        ft = min(1.0, max(0.0, (zc - fog[0]) / (fog[1] - fog[0])))
        base = base * (1.0 - ft) + np.asarray(bg) * ft

        pts = [(W / 2 + p[0] / p[2] * focal, H / 2 - p[1] / p[2] * focal, p[2]) for p in cam]
        for k in range(1, len(pts) - 1):
            p0, p1, p2 = pts[0], pts[k], pts[k + 1]
            minx = int(max(0, math.floor(min(p0[0], p1[0], p2[0]))))
            maxx = int(min(W - 1, math.ceil(max(p0[0], p1[0], p2[0]))))
            miny = int(max(0, math.floor(min(p0[1], p1[1], p2[1]))))
            maxy = int(min(H - 1, math.ceil(max(p0[1], p1[1], p2[1]))))
            if minx >= maxx or miny >= maxy:
                continue
            area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
            if abs(area) < 1e-9:
                continue
            d = 1.0 / area
            xs = np.arange(minx, maxx + 1) + 0.5
            ys = np.arange(miny, maxy + 1) + 0.5
            X, Y = np.meshgrid(xs, ys)
            w0 = ((p1[0] - p0[0]) * (Y - p0[1]) - (p1[1] - p0[1]) * (X - p0[0])) * d
            w1 = ((X - p0[0]) * (p2[1] - p0[1]) - (Y - p0[1]) * (p2[0] - p0[0])) * d
            inside = (w0 >= 0) & (w1 >= 0) & (w0 + w1 <= 1)
            if not inside.any():
                continue
            invz = (1.0 - w0 - w1) / p0[2] + w0 / p1[2] + w1 / p2[2]
            z = 1.0 / np.maximum(invz, 1e-9)
            sub = zbuf[miny:maxy + 1, minx:maxx + 1]
            m = inside & (z < sub)
            if not m.any():
                continue
            px = img[miny:maxy + 1, minx:maxx + 1]
            if alpha >= 0.999:
                sub[m] = z[m]
                px[m] = base
            else:
                px[m] = px[m] * (1 - alpha) + base * alpha
            img[miny:maxy + 1, minx:maxx + 1] = px

    return img


def finish(img, path, bloom=0.55, grain=0.012):
    x = np.clip(img, 0.0, None)
    # cheap bloom
    bright = np.clip(x - 0.62, 0.0, None)
    if bright.max() > 0.001:
        b8 = Image.fromarray((np.clip(bright, 0, 1) * 255).astype(np.uint8))
        b8 = b8.filter(ImageFilter.GaussianBlur(radius=max(2, x.shape[1] // 220)))
        bright = np.asarray(b8).astype(float) / 255.0
        x = x + bright * bloom
    # filmic-ish
    x = x / (1.0 + x * 0.72)
    x = np.power(np.clip(x, 0, 1), 1 / 1.9)
    # grain + vignette
    h, w, _ = x.shape
    rng = np.random.default_rng(7)
    x = x + rng.normal(0, grain, (h, w, 1))
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1.0 - 0.55 * (((xx - w / 2) ** 2 / (w / 2) ** 2 + (yy - h / 2) ** 2 / (h / 2) ** 2) / 2.0) ** 1.6
    x = x * np.clip(v, 0, 1)[:, :, None]
    Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).save(path)
    print("  wrote", path)


# ------------------------------------------------------------------ views ---
def view_section(W, H):
    """True section: the near half removed, camera almost level, looking north."""
    sc = Scene()
    build_plaza(sc)
    build_shell(sc, with_windows=True)
    build_decks(sc)
    build_contents(sc)

    img = render(sc, eye=(152, 47.0, 212), target=(121, 38.5, 122), W=W, H=H, fov=34,
                 cut=((0.0, 0.0, 1.0), 131.4), fog=(60, 300), amb=0.60,
                 sun=(0.35, 0.9, 0.35))
    return img


def view_exploded(W, H):
    """All eight decks pulled apart, so you can read the whole weave at once."""
    sc = Scene()
    build_decks(sc)
    build_contents(sc)
    sc.tris = [t for t in sc.tris if t[4] >= 0.999]
    sc.explode(9.0)
    img = render(sc, eye=(266, 134, 268), target=(124, 56, 126), W=W, H=H, fov=42,
                 fog=(200, 700), amb=0.48, sun=(-0.35, 0.9, 0.4))
    return img


def view_exterior(W, H):
    sc = Scene()
    build_plaza(sc)
    build_shell(sc)
    build_contents(sc)
    img = render(sc, eye=(232, 30, 236), target=(122, 38, 120), W=W, H=H, fov=40,
                 fog=(90, 400), amb=0.24, sun=(-0.5, 0.55, 0.6))
    return img


def view_gallery(W, H):
    sc = Scene()
    build_decks(sc)
    build_contents(sc)
    y = LV["L2"]
    img = render(sc, eye=(151.0, y + 1.80, 128.0), target=(102.0, y + 1.45, 127.6),
                 W=W, H=H, fov=58, fog=(16, 130), amb=0.72, sun=(0.15, 0.95, 0.2),
                 keep=lambda c: (y - 0.4) < c[1] < (y + 4.7))
    return img


def view_pool(W, H):
    sc = Scene()
    build_decks(sc)
    build_contents(sc)
    y = LV["L0"]
    img = render(sc, eye=(124.0, y + 2.35, 146.0), target=(109.0, y + 1.05, 121.0),
                 W=W, H=H, fov=60, fog=(16, 140), amb=0.72, sun=(0.3, 0.9, 0.25),
                 keep=lambda c: (y - 0.4) < c[1] < (y + 4.7))
    return img


def build_kiosk(sc):
    """The sandbox edition: 20 x 20 m, one gallery, two rooms, three games."""
    Y = 0.0
    T = 0.35
    # floor
    sc.plate((0, 20), (0, 20), Y, (0.10, 0.10, 0.12))
    sc.plate((0.6, 8), (0.6, 19.4), Y + 0.03, (0.20, 0.14, 0.08))     # the Lane
    sc.plate((8, 12), (0.6, 19.4), Y + 0.03, (0.10, 0.13, 0.17))      # the gallery
    sc.plate((12, 19.4), (0.6, 19.4), Y + 0.03, (0.16, 0.06, 0.20))   # Cabinet Row
    # walls: north, east, west (south left open for the cutaway)
    sc.box((0, 20), (Y, 6.0), (0, T), P["slab"])
    sc.box((0, T), (Y, 6.0), (0, 20), P["slab"])
    # no roof and only two walls: this is a cutaway, not a box
    sc.box((0, 20), (5.9, 6.0), (0, 0.35), P["brass"], em=0.25)
    sc.box((0, 0.35), (5.9, 6.0), (0, 20), P["brass"], em=0.25)
    sc.box((0, 20), (0, 0.3), (0, 0.3), P["brass"], em=0.15)
    # gallery glazing + mullions
    for x in (8.0, 12.0):
        sc.quad((x, Y + 0.1, 0.6), (x, Y + 0.1, 19.4), (x, Y + 4.6, 19.4), (x, Y + 4.6, 0.6),
                (0.45, 0.75, 0.82), alpha=0.10)
    for k in range(6):
        z = 0.6 + k * 3.76
        for x in (8.0, 12.0):
            sc.box((x - 0.06, x + 0.06), (Y, Y + 4.6), (z, z + 0.16), P["brass"], em=0.2)
    # the two lanes
    for i in range(2):
        z0 = 5.0 + i * 3.6
        sc.box((1.2, 7.6), (Y, Y + 0.06), (z0, z0 + 3.2), (0.22, 0.16, 0.09))
        for k in range(10):
            zc = z0 + 0.4 + k * 0.28
            sc.cyl((7.9, Y + 0.06, zc), (7.9, Y + 0.85, zc), 0.08, P["bone"], 6)
    # eight cabinets on the gallery wall
    for i in range(8):
        z = 3.0 + i * 2.0
        sc.box((12.3, 13.2), (Y, Y + 1.9), (z, z + 1.5), (0.05, 0.04, 0.07))
        sc.box((12.85, 13.2), (Y + 1.3, Y + 1.8), (z + 0.1, z + 1.4),
               P["cyan"] if i % 2 else P["magenta"], em=0.95)
    # the flume, crossing overhead
    p0 = np.array([17.4, 5.6, 17.4])
    p1 = np.array([3.0, 0.5, 3.4])
    prev = p0
    for i in range(1, 9):
        f = i / 8.0
        p = p0 + (p1 - p0) * f
        sc.cyl(tuple(prev), tuple(p), 0.85, (0.55, 0.85, 0.90), 8, em=0.10, alpha=0.35)
        prev = p
    # the bell + the threshold
    sc.cyl((10, 6.0, 9.0), (10, 7.6, 9.0), 1.3, P["brass"], 14, em=0.2)
    sc.box((6, 14), (Y, Y + 3.4), (19.4, 21.4), (0.10, 0.08, 0.07))
    sc.box((7, 13), (Y + 0.9, Y + 2.6), (19.6, 20.0), P["amber"], em=0.85)
    sc.box((7.4, 12.0), (Y + 2.9, Y + 3.3), (19.5, 20.0), P["magenta"], em=1.0)
    # the 34th door + the mirror
    sc.box((12.0, 12.4), (Y, Y + 2.4), (9.4, 10.6), (0.16, 0.05, 0.08), em=0.25)
    sc.box((19.3, 19.7), (Y, Y + 3.2), (3, 8), (0.06, 0.06, 0.08), em=0.05)


def view_kiosk(W, H):
    sc = Scene()
    build_kiosk(sc)
    img = render(sc, eye=(27, 12.0, 30), target=(9.5, 2.6, 9.0), W=W, H=H, fov=44,
                 fog=(26, 120), amb=0.55, sun=(0.3, 0.9, 0.35))
    return img


def build_root(sc):
    """Infestation stage 2: the Root has the gallery. See 14-the-root.md."""
    Y = 0.0
    VERD = (0.10, 0.29, 0.23)
    RUST = (0.48, 0.23, 0.12)
    SODI = (1.00, 0.72, 0.36)
    PAPR = (0.72, 0.70, 0.64)

    def cable(a, b, r=0.09):
        sc.cyl(a, b, r, VERD, 5, em=0.05)

    def polyline(pts, r=0.05):
        for i in range(1, len(pts)):
            cable(pts[i - 1], pts[i], r)

    # ---- the trunk: a sagging bundle along the gallery ceiling ----
    sag = [(11.55, 4.35 - 0.22 * abs(((z % 4.0) / 4.0) - 0.5) * 2, z) for z in range(1, 20)]
    polyline(sag, 0.11)
    polyline([(x - 0.20, y - 0.05, z) for (x, y, z) in sag], 0.07)
    polyline([(x + 0.19, y + 0.06, z) for (x, y, z) in sag], 0.06)

    # ---- drops to the floor, and the run under the cabinets ----
    for z in (3.2, 9.5, 15.2):
        polyline([(11.55, 4.2, z), (11.8, 3.0, z), (11.95, 1.4, z),
                  (11.95, 0.25, z), (11.4, 0.07, z - 0.4), (11.4, 0.07, z - 1.6)], 0.085)
    polyline([(11.4, 0.06, 1.6), (11.4, 0.06, 19.2)], 0.08)

    # ---- up the mullions: the room has been re-wired ----
    for z in (1.9, 5.6, 9.4, 13.2, 17.0):
        polyline([(8.06, 0.08, z), (7.98, 1.4, z + 0.1), (8.04, 2.8, z - 0.05),
                  (7.99, 4.3, z + 0.08)], 0.035)
    for z in (5.6, 13.2):
        polyline([(12.06, 0.08, z), (12.10, 1.5, z - 0.12), (12.05, 3.0, z + 0.1),
                  (12.08, 4.25, z)], 0.03)

    # ---- the sheeting over the east end ----
    for k in range(3):
        x0 = 12.4 + k * 2.3
        sc.quad((x0, Y + 0.9, 14.15), (x0 + 2.25, Y + 0.9, 14.2),
                (x0 + 2.25, Y + 4.05, 14.18), (x0, Y + 4.10, 14.16),
                (0.80, 0.77, 0.70), alpha=0.45)
        sc.cyl((x0 + 0.12, 0.92, 14.16), (x0 + 0.10, 4.06, 14.17), 0.015, (0.62, 0.58, 0.52), 4)
    sc.box((12.35, 19.15), (0.88, 0.94), (14.12, 14.22), (0.70, 0.66, 0.58), alpha=0.8)
    sc.cyl((12.2, 4.12, 14.1), (19.3, 4.05, 14.2), 0.035, RUST, 4)

    # ---- hanging drops: cable that goes nowhere ----
    for (x, z, y0) in ((13.4, 6.2, 3.4), (16.2, 8.8, 2.6), (14.6, 11.4, 3.1), (17.6, 16.2, 2.9)):
        polyline([(x, 4.3, z), (x + 0.06, y0 + 0.5, z - 0.05), (x - 0.04, y0, z + 0.04)], 0.045)

    # ---- the one warm light in the building ----
    sc.box((12.55, 13.05), (2.80, 3.16), (16.9, 17.5), SODI, em=0.62)
    sc.plate((11.0, 13.4), (15.2, 18.8), Y + 0.02, (0.42, 0.30, 0.15), em=0.55)
    sc.plate((13.5, 15.6), (13.6, 17.4), Y + 0.02, (0.24, 0.17, 0.09), em=0.30)
    cable((12.6, 2.95, 17.3), (12.5, 0.9, 17.9), 0.03)
    cable((12.5, 0.9, 17.9), (12.2, 0.08, 18.4), 0.03)

    # ---- the ladder, going up to nothing ----
    sc.cyl((6.9, 0.05, 12.0), (6.9, 3.7, 12.0), 0.035, RUST, 5)
    sc.cyl((7.3, 0.05, 12.0), (7.3, 3.7, 12.0), 0.035, RUST, 5)
    for k in range(8):
        sc.cyl((6.9, 0.3 + k * 0.45, 12.0), (7.3, 0.3 + k * 0.45, 12.0), 0.02, RUST, 4)

    # ---- hand-drawn marks: thin plates, never a texture, never straight ----
    marks = [(12.27, 1.05, 3.6, 0.30, 0.02), (12.27, 1.45, 4.1, 0.22, 0.015),
             (12.27, 0.95, 9.8, 0.34, 0.02), (12.27, 1.55, 11.4, 0.18, 0.015),
             (12.27, 1.10, 15.6, 0.40, 0.02), (12.27, 1.65, 16.4, 0.24, 0.015),
             (7.94, 1.25, 8.2, 0.26, 0.018), (7.94, 0.80, 14.8, 0.32, 0.018)]
    for (x, y, z, ln, th) in marks:
        sc.quad((x, y, z), (x, y, z + ln), (x, y + th, z + ln - 0.02), (x, y + th, z + 0.03),
                PAPR, alpha=0.85)

    # ---- a brass plaque bolted onto a root: the House catalogues it ----
    sc.box((11.44, 11.50), (1.30, 1.46), (10.2, 10.9), P["brass"], em=0.30)


def view_root(W, H):
    sc = Scene()
    build_kiosk(sc)
    build_root(sc)
    img = render(sc, eye=(15.3, 1.68, 18.9), target=(13.3, 1.15, 5.5), W=W, H=H, fov=60,
                 fog=(5, 46), amb=0.30, sun=(0.20, 0.86, 0.26))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    W, H = 1600, 1000
    SS = 2
    jobs = [
        ("exploded", "render-01-exploded.png", view_exploded),
        ("section", "render-02-section.png", view_section),
        ("exterior", "render-03-exterior.png", view_exterior),
        ("gallery", "render-04-gallery.png", view_gallery),
        ("pool", "render-05-pool.png", view_pool),
        ("kiosk", "render-06-kiosk.png", view_kiosk),
        ("root", "render-07-root.png", view_root),
    ]
    for key, name, fn in jobs:
        if which not in ("all", key):
            continue
        print(key + "…")
        big = fn(W * SS, H * SS)
        im = Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8))
        im = im.resize((W, H), Image.LANCZOS)
        finish(np.asarray(im).astype(float) / 255.0, os.path.join(OUT, name))


if __name__ == "__main__":
    main()
