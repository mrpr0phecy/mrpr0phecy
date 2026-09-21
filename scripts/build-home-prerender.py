#!/usr/bin/env python3
"""build-home-prerender.py — keep index.html's static lists in sync.

    python3 scripts/build-home-prerender.py           # rewrite every block
    python3 scripts/build-home-prerender.py --check   # fail on drift (verify.sh)

What it generates
-----------------
Three blocks in `index.html`, all derived from `cards/cards.json` (and, for the
ordering, `tools-index.json`) and all delimited by marker comments:

1. `HOME-FEATURED`  (in `#featured`) — the twelve "start here" rows.
2. `HOME-TRENDING`  (in `#trending`) — the eight most-used rows.
3. `HOME-CATEGORIES` (in `#categories`) — all 28 category hubs as real links.

What it used to generate, and why that stopped (2026-09-21)
-----------------------------------------------------------
It also generated `HOME-FAST-PATH` (a `<head>` bootstrap that started two
catalogue fetches and six card-fragment fetches during parse) and
`HOME-PRERENDER` (twelve card *shells* mounted in `#dashboard`). Both existed
to get live tools onto the home page as fast as possible. The home page no
longer runs tools at all: it lists them, and a tool opens on its own page.
So the fetch bootstrap and the card shells went with the grid — and the two
generated blocks that remained were the rows and the category hubs, which are
just links.

The page those blocks serve is much smaller for it: index.html is ~35 KB
instead of ~84 KB, nothing is fetched for the browse chrome, and the list is
rendered from `tools-index.json` only as far as the visitor has scrolled.

One rule this enforces
----------------------
The counts have exactly one owner. `sync-counts.py` writes the tool-number
claims (`heroToolCount`, `exploreCount`, the meta descriptions). This script
writes the *rows*, and it refuses to write them from a `tools-index.json` that
disagrees with `cards/cards.json` — two writers for one number is how this
site shipped nine different tool counts at once, and both scripts exist so
that a human never has to remember which is authoritative.

Run `node generate-cards-json.js` and `node scripts/build-tools-index.js`
first if either is stale; `scripts/verify.sh` fails when these blocks drift.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
CARDS_JSON = os.path.join(ROOT, "cards", "cards.json")
TOOLS_INDEX_JSON = os.path.join(ROOT, "tools-index.json")

FEATURED_N = 12
TRENDING_N = 8

FEATURED = ("<!--HOME-FEATURED:BEGIN", "<!--HOME-FEATURED:END-->")
TRENDING = ("<!--HOME-TRENDING:BEGIN", "<!--HOME-TRENDING:END-->")
CATEGORIES = ("<!--HOME-CATEGORIES:BEGIN", "<!--HOME-CATEGORIES:END-->")


def load_catalogue() -> dict[str, dict]:
    with open(CARDS_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list) or not data:
        sys.exit("build-home-prerender.py: cards/cards.json is empty or not a list")
    by_name: dict[str, dict] = {}
    for item in data:
        name = item.get("name") or item.get("id") or ""
        name = re.sub(r"\.html$", "", str(name))
        if name:
            by_name[name] = item
    return by_name


def load_index() -> dict:
    if not os.path.exists(TOOLS_INDEX_JSON):
        sys.exit("build-home-prerender.py: tools-index.json is missing — run: node scripts/build-tools-index.js")
    with open(TOOLS_INDEX_JSON, encoding="utf-8") as fh:
        return json.load(fh)


def category_counts(catalogue: dict[str, dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for card in catalogue.values():
        cat = card.get("category") or "Productivity & Lifestyle"
        counts[cat] = counts.get(cat, 0) + 1
    return counts


def row(name: str, title: str, category: str, description: str = "") -> str:
    """One list row, in the same markup explore.js renders at runtime.

    The ＋ button is added by toolbox.js, not written here: a no-JS visitor
    should never meet a button that cannot do anything.
    """
    safe_name = html.escape(name, quote=True)
    safe_title = html.escape(title, quote=True)
    safe_cat = html.escape(category or "Tools", quote=True)
    return (
        f'                    <li class="xp-row" data-slug="{safe_name}" data-toolbox-row="{safe_name}" data-cat-name="{safe_cat}">\n'
        f'                        <a class="xp-open" href="tool.html?card={safe_name}" title="{safe_title}">\n'
        f'                            <span class="xp-title">{html.escape(title)}</span>\n'
        f'                            <span class="xp-cat">{safe_cat}</span>\n'
        f'                        </a>\n'
        f'                    </li>'
    )


def featured_rows(catalogue: dict[str, dict], index: dict) -> str:
    tools = index.get("tools") or []
    picked = [t for t in tools if t.get("featured")]
    if len(picked) < FEATURED_N:
        # Fall back to the most-used, so the block is never short or empty.
        extra = [t for t in sorted(tools, key=lambda t: -(t.get("popularity") or 0))
                 if t not in picked]
        picked = (picked + extra)[:FEATURED_N]
    picked = picked[:FEATURED_N]
    if not picked:
        sys.exit("build-home-prerender.py: tools-index.json has no tools — run: node scripts/build-tools-index.js")
    rows = [row(t["slug"], t["title"], t.get("categoryName") or "", t.get("description") or "") for t in picked]
    header = (f"{FEATURED[0]} — generated by scripts/build-home-prerender.py. Do not hand-edit.\n"
              f"                     The catalogue's featured tools as real links, so the home page's\n"
              f"                     first list works with JavaScript switched off. explore.js and\n"
              f"                     toolbox.js enhance these rows in place; they never replace them. -->")
    return header + "\n" + "\n".join(rows) + f"\n                    {FEATURED[1]}"


def trending_rows(catalogue: dict[str, dict], index: dict) -> str:
    tools = sorted(index.get("tools") or [], key=lambda t: -(t.get("popularity") or 0))
    picked = tools[:TRENDING_N]
    rows = [row(t["slug"], t["title"], t.get("categoryName") or "") for t in picked]
    header = (f"{TRENDING[0]} — generated by scripts/build-home-prerender.py. Do not hand-edit.\n"
              f"                     Ordered by the popularity figure in tools-index.json. -->")
    return header + "\n" + "\n".join(rows) + f"\n                    {TRENDING[1]}"


def category_tiles(catalogue: dict[str, dict]) -> str:
    """The category hubs as real anchors, in the browse order the page uses.

    The home page reaches the crawlable catalogue through these links: a
    crawler (or a no-JS visitor) arriving at `/` gets all 28 hubs and, one hop
    further, a page listing every tool in each. Before this block existed the
    hub links were rendered from tools-index.json after it landed, so the home
    page's route into the catalogue existed only for browsers running scripts.
    """
    counts = category_counts(catalogue)
    index = load_index()
    categories = index.get("categories") or []
    if not categories:
        sys.exit("build-home-prerender.py: tools-index.json has no categories — run: node scripts/build-tools-index.js")

    stale = [c["name"] for c in categories if counts.get(c.get("name")) != c.get("count")]
    missing = sorted(set(counts) - {c.get("name") for c in categories})
    if stale or missing:
        detail = ", ".join(stale[:5]) or ", ".join(missing[:5])
        sys.exit(
            "build-home-prerender.py: tools-index.json disagrees with cards/cards.json "
            f"({detail}) — run: node scripts/build-tools-index.js"
        )

    tiles = []
    for cat in categories:
        name = html.escape(cat["name"], quote=True)
        slug = html.escape(cat["slug"], quote=True)
        icon = html.escape(cat.get("icon") or "\U0001F4C1", quote=True)
        tiles.append(
            f'                    <a class="cat-card" href="categories/{slug}.html" title="Explore {name} tools">\n'
            f'                        <div class="cat-card-top">\n'
            f'                            <span class="cat-icon">{icon}</span>\n'
            f'                            <span class="cat-count">{cat["count"]} tools</span>\n'
            f'                        </div>\n'
            f'                        <h3 class="cat-name">{name}</h3>\n'
            f'                    </a>'
        )
    header = (f"{CATEGORIES[0]} — generated by scripts/build-home-prerender.py. Do not\n"
              f"                     hand-edit. Every category hub as a real link, so the crawlable\n"
              f"                     catalogue is one click from the home page with no JavaScript. -->")
    return header + "\n" + "\n".join(tiles) + f"\n                    {CATEGORIES[1]}"


def replace_block(source: str, markers: tuple[str, str], block: str, label: str) -> str:
    start = source.find(markers[0])
    end = source.find(markers[1])
    if start == -1 or end == -1 or end < start:
        sys.exit(
            f"build-home-prerender.py: cannot find the {label} markers in index.html.\n"
            f"  expected {markers[0]} ... {markers[1]}"
        )
    return source[:start] + block + source[end + len(markers[1]):]


def block_of(source: str, markers: tuple[str, str]) -> str:
    start = source.find(markers[0])
    end = source.find(markers[1])
    if start == -1 or end == -1:
        return ""
    return source[start:end + len(markers[1])]


def build() -> str:
    with open(INDEX, encoding="utf-8") as fh:
        source = fh.read()
    catalogue = load_catalogue()
    index = load_index()
    out = replace_block(source, FEATURED, featured_rows(catalogue, index), "HOME-FEATURED")
    out = replace_block(out, TRENDING, trending_rows(catalogue, index), "HOME-TRENDING")
    out = replace_block(out, CATEGORIES, category_tiles(catalogue), "HOME-CATEGORIES")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if index.html's generated lists are stale")
    args = ap.parse_args()

    with open(INDEX, encoding="utf-8") as fh:
        current = fh.read()
    expected = build()

    if current == expected:
        counts = category_counts(load_catalogue())
        print(f"HOME LISTS OK — {FEATURED_N} featured rows, {TRENDING_N} trending rows "
              f"and {len(counts)} category hubs match the catalogue")
        return 0

    stale = [label for label, markers in (("HOME-FEATURED", FEATURED), ("HOME-TRENDING", TRENDING),
                                          ("HOME-CATEGORIES", CATEGORIES))
             if block_of(current, markers) != block_of(expected, markers)]

    if args.check:
        print("HOME LISTS STALE — index.html's generated lists do not match cards/cards.json")
        print("  fix with: python3 scripts/build-home-prerender.py")
        for label in stale:
            print(f"  stale block: {label}")
        return 1

    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(expected)
    print("HOME LISTS REWRITTEN — " + (", ".join(stale) if stale else "whitespace only"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
