#!/usr/bin/env python3
"""build-embed-catalog.py — keep the embed.html tool grid in sync with cards.json.

    python3 scripts/build-embed-catalog.py            # rewrite the grid in embed.html
    python3 scripts/build-embed-catalog.py --check    # fail if the grid has drifted

Why this exists
---------------
embed.html promises "Embed any tool", but the grid was hand-maintained and
drifted: newly added tools never appeared, tool descriptions rotted as the
manifest was updated, and the "All N" filter button quietly lagged the real
catalogue (it said 1119 while cards.json held 1149 — 30 tools unembeddable
from the page that sells embedding). The grid is a derived artifact of
cards/cards.json, so it is treated like the sitemap and the home prerender:
build it from the manifest and check it before every push.

What the generator owns
-----------------------
- The "All N" count on the active cat-filter button.
- Exactly one <div class="embed-card"> block per card in cards.json.
- Inside each block: data-cat, ec-cat, ec-title, ec-desc (the manifest
  description, HTML-escaped, truncated at 197 escaped chars + "..." — the
  convention the existing 1,119 blocks were built with), the Open link and
  the copy button's data-slug / data-title.

What the generator does NOT touch
---------------------------------
Everything else in embed.html — hero, how-to section, the licence offer,
styles and scripts. Updates are surgical: existing blocks keep their
position, only their manifest-derived lines are rewritten, and missing
cards are appended at the end of the grid.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED = os.path.join(ROOT, "embed.html")
MANIFEST = os.path.join(ROOT, "cards", "cards.json")

GRID_START = '<div class="embed-grid" id="embedGrid">\n'
# The grid is followed by the pricing/licence section (moved after it by the
# embed-licence funnel). The anchor names the grid's own closing tag plus the
# section that follows, so the splice can never swallow the licence UI.
GRID_END = "\n</div>\n<section id=\"pricing\""
BLOCK_RE = re.compile(
    r'<div class="embed-card" data-cat="[^"]*">\n'
    r".*?"
    r'<div class="ec-code"></div>\n'
    r"</div>"
    r"\n?",  # the final block is immediately followed by the grid's closing tag
    re.DOTALL,
)
ALL_BUTTON_RE = re.compile(r'<button class="active" data-cat="all">All \d+</button>')
DESC_CAP = 197  # escaped chars before the "..." suffix (measured from the shipped grid)


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def desc_of(text: str) -> str:
    e = esc(text)
    if len(e) > DESC_CAP:
        e = e[:DESC_CAP] + "..."
    return e


def block_for(card: dict) -> str:
    slug = card["name"]
    cat = esc(card["category"])
    title = esc(card["title"])
    dt = html.escape(card["title"], quote=True)
    return (
        f'<div class="embed-card" data-cat="{cat}">\n'
        f'<div class="ec-cat">{cat}</div>\n'
        f'<div class="ec-title">{title}</div>\n'
        f'<div class="ec-desc">{desc_of(card["description"])}</div>\n'
        f'<div class="ec-actions">\n'
        f'<a class="ec-btn ec-open" href="tool.html?card={slug}" target="_blank" rel="noopener">Open ↗</a>\n'
        f'<button class="ec-btn ec-copy" data-slug="{slug}" data-title="{dt}">Copy iframe</button>\n'
        f'</div>\n'
        f'<div class="ec-code"></div>\n'
        f'</div>\n'
    )


def build(new_html: str, cards: list[dict], verbose: bool = False) -> tuple[str, list[str]]:
    start = new_html.index(GRID_START) + len(GRID_START)
    end = new_html.index(GRID_END, start)
    grid = new_html[start:end]
    blocks = BLOCK_RE.findall(grid)
    if len(blocks) != grid.count('class="embed-card"'):
        sys.exit("build-embed-catalog: grid blocks do not parse cleanly — has embed.html been restructured?")

    slug_of = lambda b: re.search(r'data-slug="([^"]+)"', b).group(1)
    order = [slug_of(b) for b in blocks]
    known = {c["name"] for c in cards}
    unknown = [s for s in order if s not in known]
    if unknown:
        sys.exit(f"build-embed-catalog: grid references cards missing from cards.json: {unknown[:5]}")

    by_name = {c["name"]: c for c in cards}
    rebuilt, seen = [], set()
    for b in blocks:
        s = slug_of(b)
        rebuilt.append(block_for(by_name[s]))
        seen.add(s)
    added = [c["name"] for c in cards if c["name"] not in seen]
    for s in added:
        rebuilt.append(block_for(by_name[s]))

    new_grid = "".join(rebuilt)
    if not grid.endswith("\n") and new_grid.endswith("\n"):
        new_grid = new_grid[:-1]  # keep the shipped layout: no blank line before the pricing section

    all_btn = f'<button class="active" data-cat="all">All {len(cards)}</button>'
    if not ALL_BUTTON_RE.search(new_html):
        sys.exit("build-embed-catalog: the 'All N' filter button is missing — has embed.html been restructured?")
    new_html = ALL_BUTTON_RE.sub(lambda m: all_btn, new_html)
    new_html = new_html[:start] + new_grid + new_html[end:]
    if verbose and added:
        print(f"build-embed-catalog: +{len(added)} cards ({', '.join(added[:6])}{'…' if len(added) > 6 else ''}), grid now {len(rebuilt)}")
    return new_html, added


def main() -> None:
    check = "--check" in sys.argv[1:]
    cards = json.load(open(MANIFEST))
    old = open(EMBED).read()
    new, added = build(old, cards, verbose=not check)
    if check:
        if new != old:
            start = old.index(GRID_START) + len(GRID_START)
            end = old.index(GRID_END, start)
            have = set(re.findall(r'data-slug="([^"]+)"', old[start:end]))
            missing = [c["name"] for c in cards if c["name"] not in have]
            stale = sum(
                1
                for c in cards
                if f'<div class="ec-desc">{desc_of(c["description"])}</div>' not in old
            )
            print(f"build-embed-catalog: embed.html grid out of date — "
                  f"{len(missing)} card(s) missing, {stale} description(s) stale")
            for m in missing[:10]:
                print(f"  missing: {m}")
            sys.exit(1)
        print(f"build-embed-catalog: embed.html grid in sync ({len(cards)} tools)")
    else:
        if new != old:
            open(EMBED, "w").write(new)
            print(f"build-embed-catalog: embed.html grid written ({len(cards)} tools)")
        else:
            print(f"build-embed-catalog: embed.html grid already in sync ({len(cards)} tools)")


if __name__ == "__main__":
    main()
