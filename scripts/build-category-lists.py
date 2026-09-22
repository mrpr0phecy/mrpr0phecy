#!/usr/bin/env python3
"""build-category-lists.py — keep every enumerated category list equal to the catalogue.

    python3 scripts/build-category-lists.py           # rewrite the two surfaces
    python3 scripts/build-category-lists.py --check   # fail on drift (verify.sh)

`sync-counts.py` owns every category *number* on the site — "29 categories", the
CollectionPage `"numberOfItems"`, the hero badge — so all of those stayed
correct. Nothing owned a category *list*, and both of the hand-maintained ones
had rotted in the same way:

  * `index.html`'s JSON-LD ItemList enumerated 28 of the 29 categories. `Fire &
    Rescue Service` — the newest category — was never added, so the home page's
    structured data described a catalogue that does not contain one of its own
    categories. It is the page Google reads first, and `scan-seo.py` cannot see
    this: the JSON parses, every entry is valid, the count next to it is right,
    and the list is simply short.
  * `ARCHITECTURE.md`'s category table, under a line that says "regenerate
    rather than hand-edit", had 15 wrong counts (SaaS & Business Killers said
    44 against a real 73, Productivity & Lifestyle said 142 against 159) and had
    dropped the same category. 26 categories, 29 in the catalogue.

Both are regenerated here from `tools-index.json`, which is itself generated
from `cards/cards.json` and proved equal to it by `build-tools-index.js
--check`. That file is also where the site's canonical category *order* lives —
the order the hubs and `tools-index.html#anchor` links use — so following it
means a new category added at the end of the catalogue lands at the end of both
lists instead of nowhere.

The two surfaces keep the shape they already had: the JSON-LD ItemList in
canonical order (its links are `tools-index.html#<slug>`, so the order has to be
the anchor order), the markdown table ranked by count, ties broken by name.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_JSON = os.path.join(ROOT, "tools-index.json")
HOME = os.path.join(ROOT, "index.html")
ARCHITECTURE = os.path.join(ROOT, "ARCHITECTURE.md")
ANCHOR_BASE = "https://www.themostusefulsiteintheworld.com/tools-index.html"

HEADING = "### Categories ("
SEPARATOR = re.compile(r"^\|[-|]+\|\s*$")


def load_categories() -> list[dict]:
    with open(INDEX_JSON, encoding="utf-8") as fh:
        cats = json.load(fh)["categories"]
    if not cats:
        sys.exit("tools-index.json carries no categories — run: node scripts/build-tools-index.js")
    return cats


def anchor_for(cat: dict) -> str:
    return f"{ANCHOR_BASE}#{cat['slug']}"


# --------------------------------------------------------------------------- #
# index.html — the CollectionPage ItemList
# --------------------------------------------------------------------------- #
def build_items(cats: list[dict]) -> list[dict]:
    return [
        {"@type": "ListItem", "position": i + 1, "name": c["name"], "url": anchor_for(c)}
        for i, c in enumerate(cats)
    ]


def render_items(items: list[dict]) -> str:
    # The page is minified; json.dumps with these separators reproduces the
    # existing byte-for-byte for every entry that is not the new one.
    return json.dumps(items, ensure_ascii=False, separators=(", ", ": "))


def array_span(text: str, start: int) -> tuple[int, int]:
    """End index (exclusive) of the JSON array whose '[' is at `start`."""
    depth, i, in_str, esc = 0, start, False, False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise SystemExit("index.html: the ItemList array is not closed — file is damaged")


def rewrite_home(text: str, cats: list[dict]) -> tuple[str, str]:
    m = re.search(r'"itemListElement"\s*:\s*\[', text)
    if not m:
        sys.exit("index.html: no CollectionPage ItemList found — the home page's "
                 "structured data moved or was deleted")
    open_at = text.index("[", m.start())
    a, b = array_span(text, open_at)
    items = build_items(cats)
    fresh = render_items(items)
    if text[a:b] == fresh:
        return text, ""
    try:
        old = json.loads(text[a:b])
    except json.JSONDecodeError:
        old = []
    old_by_name = {e.get("name"): e for e in old if isinstance(e, dict)}
    wanted = {i["name"] for i in items}
    details: list[str] = []
    added = [i["name"] for i in items if i["name"] not in old_by_name]
    if added:
        details.append(f"{len(old)} entries, missing {', '.join(added)}")
    dropped = [n for n in old_by_name if n not in wanted]
    if dropped:
        details.append(f"entries that are not categories any more: {', '.join(dropped)}")
    for i in items:
        o = old_by_name.get(i["name"])
        if o is None:
            continue
        if o.get("url") != i["url"]:
            details.append(f"{i['name']}: url {o.get('url')} -> {i['url']}")
        if o.get("position") != i["position"]:
            details.append(f"{i['name']}: position {o.get('position')} -> {i['position']}")
    if not details:
        details.append(f"{len(old)} entries, order or wording differs")
    return text[:a] + fresh + text[b:], "index.html ItemList: " + "; ".join(details[:6])


# --------------------------------------------------------------------------- #
# ARCHITECTURE.md — the ranked category table
# --------------------------------------------------------------------------- #
def render_rows(cats: list[dict]) -> list[str]:
    ranked = sorted(cats, key=lambda c: (-c["count"], c["name"]))
    half = (len(ranked) + 1) // 2
    left, right = ranked[:half], ranked[half:]
    rows = []
    for i, lc in enumerate(left):
        if i < len(right):
            rc = right[i]
            rows.append(f"| {lc['count']} | {lc['name']} | | {rc['count']} | {rc['name']} |")
        else:
            rows.append(f"| {lc['count']} | {lc['name']} | | | |")
    return rows


def rewrite_architecture(text: str, cats: list[dict]) -> tuple[str, str]:
    lines = text.splitlines(keepends=True)
    head = next((i for i, l in enumerate(lines) if l.startswith(HEADING)), None)
    if head is None:
        sys.exit(f"ARCHITECTURE.md: no '{HEADING}' heading — the category table moved "
                 f"or was deleted")
    sep = next((i for i in range(head, min(head + 12, len(lines)))
                if SEPARATOR.match(lines[i])), None)
    if sep is None:
        sys.exit("ARCHITECTURE.md: the category table has no separator row — cannot "
                 "tell where the rows start")
    first = sep + 1
    last = first
    while last < len(lines) and lines[last].startswith("|"):
        last += 1
    old_rows = lines[first:last]
    fresh = [r + "\n" for r in render_rows(cats)]
    if old_rows == fresh:
        return text, ""
    real = {c["name"]: c["count"] for c in cats}
    pairs = re.findall(r"\| (\d+) \| ([^|]+?) \s*\|", "".join(old_rows))
    details: list[str] = []
    for n, name in pairs:
        name = name.strip()
        if name not in real:
            details.append(f"{name!r} is not a category")
        elif int(n) != real[name]:
            details.append(f"{name} says {n}, real {real[name]}")
    seen = {name.strip() for _, name in pairs}
    missing = [c["name"] for c in cats if c["name"] not in seen]
    if missing:
        details.append(f"missing {', '.join(missing)}")
    if not details:
        details.append(f"{len(old_rows)} rows, ordering differs")
    return ("".join(lines[:first] + fresh + lines[last:]),
            "ARCHITECTURE.md table: " + "; ".join(details[:6]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    args = ap.parse_args()

    cats = load_categories()
    surfaces = [
        (HOME, rewrite_home(text=open(HOME, encoding="utf-8").read(), cats=cats)),
        (ARCHITECTURE,
         rewrite_architecture(text=open(ARCHITECTURE, encoding="utf-8").read(), cats=cats)),
    ]
    changed = [(path, note) for path, (_text, note) in surfaces if note]

    if args.check:
        if changed:
            print(f"CATEGORY LISTS DRIFTED — {len(changed)} surface(s) do not match "
                  f"tools-index.json:")
            for path, note in changed:
                print(f"  {os.path.relpath(path, ROOT)}: {note}")
            print("\nrun: python3 scripts/build-category-lists.py")
            return 1
        print(f"CATEGORY LISTS OK — index.html and ARCHITECTURE.md enumerate all "
              f"{len(cats)} categories.")
        return 0

    for path, (text, _note) in surfaces:
        original = open(path, encoding="utf-8").read()
        if not text or len(text) < len(original) * 0.5:
            sys.exit(f"{os.path.relpath(path, ROOT)}: refusing to write — the rewrite "
                     f"would shrink the file from {len(original)} to {len(text)} bytes")
        tmp = path + ".tmp-category-lists"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    if not changed:
        print(f"CATEGORY LISTS OK — nothing to write ({len(cats)} categories).")
    else:
        for path, note in changed:
            print(f"  rewrote {os.path.relpath(path, ROOT)}: {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
