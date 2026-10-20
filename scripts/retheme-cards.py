#!/usr/bin/env python3
"""retheme-cards.py — move card interiors onto the site palette.

The chrome (home, hubs, tool frames) has been black, gold and #555555 since
2026-10-20 (DESIGN.md §3.1a). The 1,424 cards each carry their own <style>
block and inline styles, so they kept their own colours. This is the migration
tool for them, batch by batch, starting with the most-used.

    python3 scripts/retheme-cards.py --top 50 --dry-run
    python3 scripts/retheme-cards.py --top 50 --write
    python3 scripts/retheme-cards.py --slugs bmi,mortgage --write
    python3 scripts/retheme-cards.py --all --dry-run

What it will and will not change
--------------------------------
It changes the card's *chrome*: the accent that colours its headings, buttons
and readouts, its text greys, its panel and page backgrounds, and the alpha
forms of the same values.

It refuses to change:

* **Data.** A colour that appears inside a `linear-gradient`, `radial-gradient`
  or `conic-gradient` alongside three or more distinct hues is a scale or a
  legend — BMI's bands, a chart series, a heat ramp. Changing one stop without
  the others would break the meaning, and changing all of them would flatten a
  scale into a single hue. Left alone, whole.
* **Status.** Reds stay red; a lone amber stays amber; green survives inside a
  ramp. The palette rule is that colour never carries meaning alone, which is
  what lets those keep their job; they are semantic exceptions, documented in
  DESIGN.md §3.1a.
* **Siblings that mean "different".** A card with three or more accent hues is
  painting distinct buckets — four stat tiles, a legend, a series. Flattening
  them to one gold would destroy that, so they rotate through the four golds the
  accent picker offers, in order of appearance. Two or fewer keep the job-based
  map (action `#ffd700`, readout `#d4af37`).
* **Subjects.** A card about colour, or one whose output *is* colour (a colour
  contrast checker, resistor bands, a lava lamp, an orrery), is refused outright
  by PROTECTED below. Its palette is its function.

Every change is a token substitution: no selector, declaration or script is
added or removed, so a card's structure, ids, behaviour and CSS-leak posture are
untouched.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
INDEX = os.path.join(ROOT, "tools-index.json")

# A card whose subject is colour, or whose output is colour. Matched against
# the slug. Adding to this list is always safe; removing from it needs a look.
PROTECTED = re.compile(
    r"(colou?r|palette|resistor|contrast|spirograph|lava-lamp|hourglass|orrery"
    r"|galaxy|nebula|cymatic|tunnel|wave-packet|aurora|firework|gradient|paint"
    r"|pixel|photo|image-|css-art|shader|plasma"
    # Category colours: the periodic-table tiles and the body-system chips are
    # keyed by hue, and flattening ten categories into four golds loses the key.
    r"|anatomy|periodic|element-hall|constellation-map)",
    re.I,
)

# Chrome accents. These were *the* theme colour of a card — the green of the
# nutrition calculators, the cyan of the generators, the purple of the
# wellbeing cards. All of them are the same job, so all of them become gold.
ACCENT = {
    "2dd4ff": "ffd700",   # the old site cyan
    "1aa3cc": "b8952b",   # its dark pair
    "39ff14": "ffd700",   # the calculator green
    "00ffcc": "ffd700",   # the generator cyan
    "00bbff": "d4af37",
    "91f7ff": "d4af37",
    "1ea7d8": "b8952b",
    "4dabf7": "d4af37",
    "9d4edd": "d4af37",   # purple
    "b026ff": "d4af37",
    "7b2cbf": "a1791f",
    "ff2d55": "d4af37",   # pink
    "ff6b35": "d4af37",   # orange as an accent
    "c060f0": "d4af37",
    "63d3a6": "d4af37",
    # The long tail, measured across the catalogue before batch 2: the same
    # families in Tailwind/Bootstrap spelling, plus the cyan and lilac that the
    # generators and wellbeing cards inked themselves with.
    "22d3ee": "d4af37",
    "06b6d4": "d4af37",
    "00bcd4": "d4af37",
    "0ea5e9": "d4af37",
    "38bdf8": "d4af37",
    "60a5fa": "d4af37",
    "3b82f6": "d4af37",
    "1e90ff": "d4af37",
    "7fe0c3": "d4af37",
    "2dd4bf": "d4af37",
    "14b8a6": "d4af37",
    "10b981": "d4af37",
    "34d399": "d4af37",
    "4caf50": "d4af37",
    "22c55e": "d4af37",
    "2ecc71": "d4af37",
    "00e676": "d4af37",
    "4ade80": "d4af37",
    "80a070": "d4af37",
    "d896ff": "d4af37",   # lilac
    "8080f0": "d4af37",
    "c084fc": "d4af37",
    "8b5cf6": "a1791f",
    "a855f7": "d4af37",
    "7c3aed": "a1791f",
    "e879f9": "d4af37",
    "ff007a": "d4af37",   # magenta
    "ff3366": "d4af37",
    "ff5577": "d4af37",
    "ec4899": "d4af37",
    "e83e8c": "d4af37",
    "f472b6": "d4af37",
    "ff4081": "d4af37",
    # Gold-adjacent yellows: already the same family, so they take the readout
    # gold rather than staying a second yellow beside it.
    "ffcc00": "d4af37",
    "ffd27f": "d4af37",
    "e3c05a": "d4af37",
    "c9a227": "d4af37",
    # Batch 2 residuals: one-off palettes and the pale cyan of the old charts.
    "ffdc6b": "f0dc9a",
    "ffcc5b": "d4af37",
    "ff9a6b": "d4af37",
    "ff6b9d": "d4af37",
    "6bff97": "d4af37",
    "6b9dff": "a1791f",
    "4ecdc4": "d4af37",
    "38b2ac": "d4af37",
    "4299e1": "a1791f",
    "1da1f2": "d4af37",
    "7ef9ff": "d4af37",
    # Batch 3 residuals: Material blues, periwinkle, mint, the pale tints.
    "6080f0": "d4af37",
    "a0b0e0": "f0dc9a",
    "9cbcff": "d4af37",
    "a78bfa": "d4af37",
    "90caf9": "d4af37",
    "4fc3f7": "d4af37",
    "64b5f6": "d4af37",
    "bfeaff": "f0dc9a",
    "cfe6f5": "f0dc9a",
    "e0f2fe": "f0dc9a",
    "9fb4c8": "a3a3a3",
    "1976d2": "a1791f",
    "0d47a1": "a1791f",
    "55c8e0": "d4af37",
    "8affa6": "d4af37",
    "81c784": "d4af37",
    "40c040": "d4af37",
    "ffd66b": "d4af37",
    "e8a33d": "d4af37",
    # Batch 4 residuals: the CSS-gradient indigo, plum purples, pinks.
    "667eea": "d4af37",
    "764ba2": "a1791f",
    "a060f0": "d4af37",
    "b060f0": "d4af37",
    "f48fb1": "d4af37",
    "f06292": "d4af37",
    "e91e63": "d4af37",
    "c2185b": "a1791f",
    # The Material palette, wholsesale: the same 19 swatches turn up in card
    # after card (pink buttons, indigo headers, lavender panels). Status reds
    # are not in this list and stay red.
    "ec407a": "d4af37",
    "ad1457": "a1791f",
    "ce93d8": "f0dc9a",
    "ba68c8": "d4af37",
    "ab47bc": "d4af37",
    "9575cd": "d4af37",
    "7986cb": "d4af37",
    "5c6bc0": "a1791f",
    "42a5f5": "d4af37",
    "29b6f6": "d4af37",
    "26c6da": "d4af37",
    "26a69a": "d4af37",
    "66bb6a": "d4af37",
    "9ccc65": "d4af37",
    "d4e157": "f0dc9a",
    "ffee58": "f0dc9a",
    "ffca28": "d4af37",
    "ffa726": "d4af37",
    "ff7043": "d4af37",
    "8d6e63": "a1791f",
    "90a4ae": "a3a3a3",
    "78909c": "8a8a8a",
}

# Neutrals: page, panel, text, hairlines. The whole black-to-white ramp.
NEUTRAL = {
    "e6faff": "d6d6d6",
    "d4e7ee": "d6d6d6",
    "e6e8eb": "d6d6d6",
    "fcfdfd": "f2f2f2",
    "ffffff": None,        # white stays white
    "9ccbe0": "a3a3a3",
    "9aa3af": "a3a3a3",
    "8fa3bf": "a3a3a3",   # cool blue-greys, the secondary text of the old cards
    "8090b0": "a3a3a3",
    "587080": "8a8a8a",
    "94a3b8": "8a8a8a",
    "64748b": "8a8a8a",
    "e0d0c0": "d6d6d6",   # warm papers used as text
    "f4ead0": "d6d6d6",
    "f0e6dc": "d6d6d6",
    "9aa6b6": "8a8a8a",   # pale slate text
    "3a3a5a": "111111",   # slate panels
    "1a1a3a": "0b1219",   # indigo panels
    "2a2a4a": "0b1219",
    "0a0a2a": "04070a",
    "14264a": "0b1219",
    "1a1a2a": "0b1219",
    "5a2a20": "111111",   # dark browns
    "b08070": "d6d6d6",
    "9080b0": "a3a3a3",   # muted plum text
    "1b1b2f": "0b1219",
    "071019": "04070a",
    "071017": "04070a",
    "050811": "04070a",
    "050d18": "04070a",
    "090d14": "04070a",
    "080e14": "04070a",
    "060a0f": "04070a",
    "0a0f14": "04070a",
    "0a0014": "04070a",
    "0b0805": "04070a",
    "001018": "04070a",
    "010206": "04070a",
    "000104": "04070a",
    "0a0808": "04070a",
    "141e28": "0b1219",
    "16181d": "0b1219",
    "0d1b2a": "0b1219",
    "2a1a20": "111111",
    "4a3a20": "111111",
}

# rgba() with the same three channels, for the alpha washes.
RGBA = {
    "45,212,255": "255,215,0",
    "45, 212, 255": "255, 215, 0",
    "57,255,20": "255,215,0",
    "57, 255, 20": "255, 215, 0",
    "230,250,255": "214,214,214",
    "230, 250, 255": "214, 214, 214",
    "0,255,204": "255,215,0",
    "0, 255, 204": "255, 215, 0",
    "157,78,221": "212,175,55",
    "157, 78, 221": "212, 175, 55",
    "20,30,40": "12,12,13",
    "20, 30, 40": "12, 12, 13",
}

GRADIENT = re.compile(r"(?:linear|radial|conic)-gradient\([^;{}]*\)", re.I)
HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
RGBA_TOKEN = re.compile(r"rgba?\(\s*(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})")


# Four golds, in the order a multi-colour card's accents are met. A card that
# painted four sibling readouts in four hues keeps four distinguishable colours;
# they just all belong to the palette now. The same four as the accent picker.
GOLD_TONES = ["ffd700", "d4af37", "f0dc9a", "a1791f"]

# Ambers that are a sibling colour in a multi-colour card (a fourth stat tile)
# but a warning in a single-accent one. They join the rotation only when the
# card is already spending three or more accents.
AMBER = {"ffa500", "ff9800", "ffd43b", "ffd166", "ffc107"}


SURFACE = re.compile(
    r"(?:background|background-color|border(?:-[a-z]+)?|box-shadow|fill|stroke|outline)"
    r"\s*:[^;{}]*", re.I)


def hue_of(r: int, g: int, b: int) -> int:
    """Hue in degrees, 0-359."""
    hi, lo = max(r, g, b), min(r, g, b)
    if hi == lo:
        return 0
    d = hi - lo
    if hi == r:
        h = ((g - b) / d) % 6
    elif hi == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return int(h * 60) % 360


def surface_uses(css: str, hue: str) -> bool:
    """Does this hue paint a surface somewhere, not just letters?

    A theme accent fills buttons and panels. A ramp stop that also has a legend
    label does not — `bmi` writes #4dabf7 in the band and in the word
    "Underweight" beside it, and nothing else. That is the line between the
    green `bodyfat` wears (panels, buttons, the result) and the blue `bmi` only
    names.
    """
    rgb = tuple(int(hue[i:i + 2], 16) for i in (0, 2, 4))
    channels = r"\s*,\s*".join(str(c) for c in rgb)
    # The band behind a legend is a gradient, and a gradient is data however it
    # is declared; only a surface *outside* one counts as wearing the colour.
    for m in SURFACE.finditer(GRADIENT.sub("", css)):
        chunk = m.group(0)
        if re.search(r"#" + hue + r"\b", chunk, re.I) or \
                re.search(r"rgba?\(\s*" + channels + r"\b", chunk):
            return True
    return False


def ramp_hues(css: str):
    """Hues that encode data: any colour in a gradient with 3+ distinct hues.

    Exempted *card-wide*, not just inside the gradient. A BMI legend that says
    "Underweight" in #4dabf7 has to keep matching the #4dabf7 stop in the band
    behind it; recolouring one and not the other is worse than recolouring
    neither.
    """
    hues = set()
    for m in GRADIENT.finditer(css):
        found = {h.lower() for h in HEX.findall(m.group(0))}
        if len(found) >= 3:
            hues |= found

    # One hue can be both. `bodyfat` paints its theme accent *and* the low end
    # of a green-yellow-red scale in #39ff14; if that hue is also the card's
    # dominant colour it is the accent that happens to sit in a ramp, not a
    # ramp that happens to look like an accent. It converts everywhere — the
    # remaining stops still read as an ordered scale.
    counts = {}
    for h in HEX.findall(css):
        h = h.lower()
        counts[h] = counts.get(h, 0) + 1
    chromatic = {k: v for k, v in counts.items()
                 if k in ACCENT or k in AMBER}
    # A card whose only accent-shaped hues are ramp stops is already on the
    # palette (or was never off it). Letting the rule below fire there would
    # recolour a data scale on a second run — `bmi`'s blue legend would turn
    # gold once the green beside it had been converted. Idempotence first.
    outside = {k: v for k, v in chromatic.items() if k not in hues}
    if not outside:
        return hues
    if chromatic:
        top = max(chromatic, key=lambda k: chromatic[k])
        if top in hues and chromatic[top] >= 6 and surface_uses(css, top):
            hues.discard(top)
    return hues


GOLD_ANY = r"#(?:ffd700|d4af37|f0dc9a|a1791f)"
LIGHT_TEXT = r"(?:#fff\b|#ffffff|#f2f2f2|#d6d6d6|#f[0-9a-f]{5}|white)"


def fix_text_on_gold(css: str) -> str:
    """Darken light text that now sits on a gold fill.

    A pink `#ec407a → #ad1457` button carried white type at 3.9:1. Both stops
    become gold, and white on gold is 2.2:1 — the conversion would have shipped
    an unreadable button. Any declaration block (or inline style) that fills
    with a solid gold and letters in a light colour gets near-black type
    instead: 14.40:1 on #ffd700.
    """
    block_re = re.compile(r"\{[^{}]*\}|style=\"[^\"]*\"")
    fill_re = re.compile(r"background[^;\"']*" + GOLD_ANY, re.I)
    text_re = re.compile(r"((?<![\w-])color\s*:\s*)" + LIGHT_TEXT, re.I)

    def one(m):
        block = m.group(0)
        if fill_re.search(block) and text_re.search(block):
            block = text_re.sub(r"\1#04070a", block)
        return block

    return block_re.sub(one, css)


def retheme(path: str):
    src = open(path, encoding="utf-8").read()
    exempt = ramp_hues(src)
    changes = {}

    # Which accent hues does this card spend, outside its data ramps?
    spent, ambers = [], []
    for h in HEX.findall(src):
        h = h.lower()
        if h in exempt:
            continue
        if h in ACCENT and h not in spent:
            spent.append(h)
        elif h in AMBER and h not in ambers:
            ambers.append(h)

    # Three or more siblings get the four-gold rotation so they stay tellable
    # apart; one or two keep the job-based mapping (purple and pink read deeper
    # than the action gold, and that difference is worth keeping).
    rotation = {}
    family = spent + (ambers if len(spent) + len(ambers) >= 3 else [])
    if len(spent) >= 3 or (len(spent) >= 2 and ambers):
        for i, h in enumerate(family):
            rotation[h] = GOLD_TONES[i % len(GOLD_TONES)]

    def resolve(key):
        """The palette colour this card gives a hue, or None to leave it alone."""
        key = key.lower()
        if key in exempt:
            return None
        if key in rotation:
            return rotation[key]
        if key in ACCENT:
            return ACCENT[key]
        if key in NEUTRAL:
            return NEUTRAL[key]
        # A dark tinted surface is a panel whatever it was tinted with. The map
        # cannot list every navy and plum in the catalogue, and one of them
        # (`#0a1a2a → #1a0a2a`) was painting a whole card's backdrop indigo.
        if len(key) == 6:
            r, g, b = (int(key[i:i + 2], 16) for i in (0, 2, 4))
            hi, lo = max(r, g, b), min(r, g, b)
            if hi < 58 and hi - lo > 14 and hue_of(r, g, b) not in range(0, 36) \
                    and hue_of(r, g, b) < 315:
                return "0b1219"
        return None

    def hex_sub(m):
        key = m.group(1).lower()
        new = resolve(key)
        if not new or new == key:
            return m.group(0)
        changes[key] = new
        return "#" + new

    def rgba_sub(m):
        channels = m.group(1)
        key = re.sub(r"\s+", "", channels).lower()
        parts = [int(p) for p in key.split(",")]
        hexkey = "".join("%02x" % p for p in parts)
        # A card can paint the same hue as `#c060f0` in one rule and
        # `rgba(192,96,240,…)` in the next; both have to resolve together, or
        # a stat tile keeps its purple border under gold text.
        new_hex = resolve(hexkey)
        if new_hex:
            rgb = [str(int(new_hex[i:i + 2], 16)) for i in (0, 2, 4)]
            sep = ", " if re.search(r",\s", channels) else ","
            new = sep.join(rgb)
            changes[hexkey] = new_hex
        elif hexkey in exempt:
            return m.group(0)
        else:
            legacy = RGBA.get(key)
            if not legacy:
                return m.group(0)
            new = legacy
            changes[key] = new
        return m.group(0).replace(channels, new)

    out = HEX.sub(hex_sub, src)
    out = RGBA_TOKEN.sub(rgba_sub, out)
    out = fix_text_on_gold(out)
    return out, changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, help="the N most-used cards")
    ap.add_argument("--next", type=int,
                    help="the next N cards, most-used first, that still need it")
    ap.add_argument("--slugs", help="comma-separated slugs")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    index = json.load(open(INDEX, encoding="utf-8"))["tools"]
    by_pop = sorted(index, key=lambda t: -t["popularity"])

    if args.slugs:
        wanted = [s.strip() for s in args.slugs.split(",") if s.strip()]
        chosen = [t for t in by_pop if t["slug"] in wanted]
    elif args.top:
        chosen = by_pop[: args.top]
    elif args.next:
        chosen = by_pop
    elif args.all:
        chosen = by_pop
    else:
        ap.error("choose --top N, --next N, --slugs, or --all")

    converted, skipped, untouched = [], [], []
    examined = 0
    for t in chosen:
        examined += 1
        slug = t["slug"]
        if PROTECTED.search(slug):
            skipped.append(slug)
            continue
        path = os.path.join(CARDS, slug + ".html")
        if not os.path.exists(path):
            skipped.append(slug + " (missing)")
            continue
        out, changes = retheme(path)
        if not changes:
            untouched.append(slug)
            continue
        converted.append((slug, len(changes)))
        if args.write:
            open(path, "w", encoding="utf-8").write(out)
        if args.next and len(converted) >= args.next:
            break

    print(f"scanned   {examined}")
    print(f"converted {len(converted)}" + ("" if args.write else "  (dry run)"))
    print(f"protected {len(skipped)}  {', '.join(skipped[:8])}{'…' if len(skipped) > 8 else ''}")
    print(f"no change {len(untouched)}  {', '.join(untouched[:8])}{'…' if len(untouched) > 8 else ''}")
    if converted:
        print(f"   span    {converted[0][0]} … {converted[-1][0]}")
    for slug, n in converted[:15]:
        print(f"   {slug:44} {n} colours")
    if len(converted) > 15:
        print(f"   … and {len(converted) - 15} more")
    return 0


if __name__ == "__main__":
    sys.exit(main())
