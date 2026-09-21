#!/usr/bin/env python3
"""measure.py — the hero, measured instead of eyeballed.

    python3 brand/measure.py        # needs fonttools (see brand/README.md)

AGENTS.md asks for a look at the hub pages at 360 px and 1440 px. When there is
no browser to hand, this is the next best thing and it is honest about what it
is: real Inter advance widths (out of the shipped variable font) against the
clamp() values in home.css, at ten widths from 320 px to 1920 px. Every string
that has to fit on one line is reported with the width it needs and the width
it has.

It is a narrowing tool, not a substitute for looking: it cannot see a colour, a
z-order, an overlap or a font that failed to load. If a browser is available,
look.
"""
from __future__ import annotations

import sys

from fontTools.ttLib import TTFont

import os
import tempfile

from fontTools.ttLib import TTFont as _VarFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOFF2 = os.path.join(ROOT, "fonts", "inter-latin.woff2")


def _static(weight: int) -> str:
    """Pillow-less: fonttools reads the shipped variable woff2 and writes a
    static instance the width tables can be read from."""
    out = os.path.join(tempfile.gettempdir(), f"measure-inter-{weight}.ttf")
    if not os.path.exists(out):
        f = _VarFont(WOFF2)
        f.flavor = None
        instantiateVariableFont(f, {"wght": weight}, inplace=True, updateFontNames=False)
        f.save(out)
    return out


FONTS = {w: _static(w) for w in (400, 500, 600, 700, 800, 900)}
_cache: dict[tuple[int, str], float] = {}
fonts: dict[int, TTFont] = {}


def advance(weight: int, text: str) -> float:
    """Width of `text` in em units at Inter weight `weight`."""
    key = (weight, text)
    if key in _cache:
        return _cache[key]
    font = fonts.get(weight)
    if font is None:
        font = fonts[weight] = TTFont(FONTS[weight])
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upem = font["head"].unitsPerEm
    total = 0.0
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"Inter has no glyph for {char!r} — measure again")
        total += hmtx[name][0]
    _cache[key] = total / upem
    return _cache[key]


def px(em: float, font_px: float, tracking_em: float = 0.0, chars: int = 0) -> float:
    return em * font_px + tracking_em * font_px * chars


def clamp(lo: float, preferred_vw: float, hi: float, vw: float, base: float = 0.0) -> float:
    """CSS clamp(lo, base + preferred_vw, hi) resolved at a viewport width."""
    return max(lo, min(hi, base + preferred_vw * vw / 100))


WIDTHS = [320, 360, 390, 414, 480, 560, 768, 1024, 1440, 1920]

WORDMARK = "THE MOST USEFUL SITE IN THE WORLD"
H1 = "Every tool you need, already in your browser."
SUBTITLE = ("Instant, private calculators, converters, simulators and creative engines — "
            "no install, no waiting, and nothing you type ever leaves the page.")
FACTS = "1220 free browser tools · no ads · no accounts · no sign-ups"
KEYS = "/ search · j/k move · Enter open · b keep in your toolbox · t open it"
FOOTER_MARK = "THE MOST USEFUL SITE IN THE WORLD"

print(f"{'vw':>5} {'line':<11} {'size':>6} {'text':>7} {'avail':>7}  verdict")
problems = []
for vw in WIDTHS:
    # The hero's content box: page padding is clamp(14px, 4vw, 24px) a side.
    pad = clamp(14, 4, 24, vw)
    hero = vw - 2 * pad

    # The brand lockup: mark (clamp(34px, 9vw, 42px)) + 12 px gap.
    mark = clamp(34, 9, 42, vw)
    wm_size = clamp(0.66 * 16, 2.1, 0.8 * 16, vw)
    wm_w = px(advance(800, WORDMARK), wm_size, 0.14, len(WORDMARK))
    avail = hero - mark - 12
    ok = wm_w <= avail
    print(f"{vw:>5} {'wordmark':<11} {wm_size:>6.1f} {wm_w:>7.0f} {avail:>7.0f}  {'fits' if ok else 'WRAPS'}")
    if not ok:
        problems.append((vw, 'wordmark', wm_w, avail))

    # The title: max-width 22ch, centred, and free to wrap (text-wrap: balance).
    title_size = clamp(1.6 * 16, 6.4, 3.35 * 16, vw)
    box = min(hero, 26 * advance(800, "0") * title_size)
    line = px(advance(800, H1), title_size, -0.035, len(H1))
    print(f"{vw:>5} {'title':<11} {title_size:>6.1f} {line:>7.0f} {box:>7.0f}  "
          f"{'1 line' if line <= box else f'{line / box:.1f} lines'}")

    # The standfirst: max-width 62ch.
    sub_size = clamp(0.95 * 16, 2.4, 1.1 * 16, vw)
    box = min(hero, 62 * advance(400, "0") * sub_size)
    line = px(advance(400, SUBTITLE), sub_size)
    print(f"{vw:>5} {'subtitle':<11} {sub_size:>6.1f} {line:>7.0f} {box:>7.0f}  "
          f"{'1 line' if line <= box else f'{line / box:.1f} lines'}")

    # The search placeholder: the field is max-width 640, minus its padding.
    field = min(hero, 640)
    field_pad = clamp(46, 11, 68, vw)
    avail = field - 2 * field_pad
    placeholder = "Search 1220 tools… try 'mortgage', 'QR', or 'BMI'"
    need = px(advance(400, placeholder), 16)
    verdict = 'fits' if need <= avail else 'clips (as before this change)'
    print(f"{vw:>5} {'placeholder':<11} {16:>6.1f} {need:>7.0f} {avail:>7.0f}  {verdict}")

    # The two quiet lines under the search box.
    facts_size = clamp(0.78 * 16, 2.1, 0.86 * 16, vw)
    need = px(advance(600, FACTS), facts_size) + 8 + 8
    print(f"{vw:>5} {'facts':<11} {facts_size:>6.1f} {need:>7.0f} {hero:>7.0f}  "
          f"{'fits' if need <= hero else 'WRAPS (wraps by design: flex-wrap)'}")
    keys_size = 0.78 * 16
    need = px(advance(500, KEYS), keys_size) + 6 * 12
    print(f"{vw:>5} {'keys':<11} {keys_size:>6.1f} {need:>7.0f} {hero:>7.0f}  "
          f"{'fits' if need <= hero else 'WRAPS (wraps by design)'}")

    # The footer lockup sits in the same padded column, centred, one line.
    if vw >= 560:
        need = px(advance(800, FOOTER_MARK), 0.76 * 16, 0.15, len(FOOTER_MARK))
        print(f"{vw:>5} {'footer':<11} {0.76 * 16:>6.1f} {need:>7.0f} {hero:>7.0f}  "
              f"{'fits' if need <= hero else 'WRAPS'}")
    print()

print("PROBLEMS:", problems or "none")
