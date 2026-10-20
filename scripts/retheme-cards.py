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
    r"|pixel|photo|image-|css-art|shader|plasma)",
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
        if top in hues and chromatic[top] >= 6:
            hues.discard(top)
    return hues


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
    return out, changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, help="the N most-used cards")
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
    elif args.all:
        chosen = by_pop
    else:
        ap.error("choose --top N, --slugs, or --all")

    converted, skipped, untouched = [], [], []
    for t in chosen:
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

    print(f"scanned   {len(chosen)}")
    print(f"converted {len(converted)}" + ("" if args.write else "  (dry run)"))
    print(f"protected {len(skipped)}  {', '.join(skipped[:8])}{'…' if len(skipped) > 8 else ''}")
    print(f"no change {len(untouched)}  {', '.join(untouched[:8])}{'…' if len(untouched) > 8 else ''}")
    for slug, n in converted[:15]:
        print(f"   {slug:44} {n} colours")
    if len(converted) > 15:
        print(f"   … and {len(converted) - 15} more")
    return 0


if __name__ == "__main__":
    sys.exit(main())
