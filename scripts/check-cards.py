#!/usr/bin/env python3
"""check-cards.py — audit the tool catalogue (Product A) for consistency.

Failures (exit 1 if any):
  * cards/ files not indexed in cards/cards.json, or JSON entries with no file
  * JSON entries with a blank title/description (renders blank in the grid)
  * a card that is NOT a fragment (contains <!doctype|html|head|body) — breaks
    the catalogue shell layout
  * category missing/empty
  * index.html "Search <N>" claim != number of cards
  * sitemap.xml missing any card path

Warnings (never fail):
  * duplicate element IDs across cards (cards share one DOM)
  * JSON entries whose category isn't in the known category set

Works on a sparse checkout (only reads cards/, cards/cards.json, index.html,
sitemap.xml — all of which are in the sparse set). Zero dependencies.
"""
from __future__ import annotations
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
JSON_PATH = os.path.join(CARDS, "cards.json")
INDEX_PATH = os.path.join(ROOT, "index.html")
SITEMAP_PATH = os.path.join(ROOT, "sitemap.xml")

KNOWN_CATEGORIES = {
    "Science & Engineering", "Productivity & Lifestyle", "Writing & Language",
    "Finance & Money", "Mathematics", "Music & Audio", "Health & Fitness",
    "Culinary & Food Science", "SaaS & Business Killers", "Lucid Dreaming & Sleep",
    "Interactive Art & Living Worlds", "Natural Remedies & Herbs",
    "AI & Autonomous Agents", "Anime & Otaku Culture", "Aquatics & Fishkeeping",
    "Birdwatching & Ornithology", "Boxing & Fight Scoring", "Dogs & Canine Care",
    "Virtual Worlds & Gaming", "MrProphecy Arcade",
}

fails: list[str] = []
warns: list[str] = []

# ---------------------------------------------------------------- load index
try:
    with open(JSON_PATH, encoding="utf-8") as f:
        index = json.load(f)
except FileNotFoundError:
    print("FATAL: cards/cards.json missing — run: node generate-cards-json.js")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"FATAL: cards/cards.json is invalid JSON: {e}")
    sys.exit(1)

indexed_files = {e.get("file", "") for e in index}
on_disk = {f for f in os.listdir(CARDS) if f.endswith(".html")}

# ---------------------------------------------------------------- 1. coverage
missing_from_index = sorted(on_disk - indexed_files)
orphans = sorted(indexed_files - on_disk)
if missing_from_index:
    fails.append(f"{len(missing_from_index)} cards on disk not in cards.json: "
                 f"{', '.join(missing_from_index[:8])}"
                 + (" ..." if len(missing_from_index) > 8 else ""))
if orphans:
    fails.append(f"{len(orphans)} cards.json entries have no file: "
                 f"{', '.join(orphans[:8])}")

# ---------------------------------------------------------------- 2. content
no_title = [e.get("file") for e in index if not (e.get("title") or "").strip()]
no_desc = [e.get("file") for e in index if not (e.get("description") or "").strip()]
if no_title:
    fails.append(f"{len(no_title)} cards missing a title (blank grid entry): "
                 f"{', '.join(no_title[:6])}")
if no_desc:
    fails.append(f"{len(no_desc)} cards missing a description: "
                 f"{', '.join(no_desc[:6])}")
no_cat = [e.get("file") for e in index if not (e.get("category") or "").strip()]
if no_cat:
    fails.append(f"{len(no_cat)} cards missing a category: {', '.join(no_cat[:6])}")

unknown_cats = sorted({e["category"] for e in index
                       if e.get("category") not in KNOWN_CATEGORIES})
if unknown_cats:
    warns.append(f"categories not in known set (script list may need updating): "
                 f"{', '.join(unknown_cats)}")

# ---------------------------------------------------------------- 3. fragments
# Cards are fragments. Full-document tags inside <script> template literals
# (print/export report generators) are legitimate — strip scripts + comments
# before testing, then require word boundaries so <header> can't false-positive.
def _fragment_scan(text: str):
    stripped = re.sub(r"(?is)<script\b.*?</script>", "", text)
    stripped = re.sub(r"(?is)<!--.*?-->", "", stripped)
    return re.search(r"(?is)<!doctype\b|<html\b|<head\b|<body\b", stripped)

for f in sorted(on_disk):
    try:
        with open(os.path.join(CARDS, f), encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        continue
    if _fragment_scan(text):
        fails.append(f"{f}: contains a full-document tag (<!doctype/html/head/body) "
                     f"— cards must be fragments")

# ---------------------------------------------------------------- 4. ID scope
id_re = re.compile(r'id=["\']([^"\']+)["\']', re.I)
seen: dict[str, str] = {}
for f in sorted(on_disk):
    try:
        with open(os.path.join(CARDS, f), encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        continue
    for m in id_re.finditer(text):
        iid = m.group(1)
        if iid in seen and seen[iid] != f:
            warns.append(f"duplicate id '{iid}' in {seen[iid]} and {f}")
        else:
            seen.setdefault(iid, f)

# ---------------------------------------------------------------- 5. counts
count_claim = None
if os.path.exists(INDEX_PATH):
    with open(INDEX_PATH, encoding="utf-8", errors="replace") as f:
        m = re.search(r"Search\s+(\d+)", f.read())
    count_claim = int(m.group(1)) if m else None
if count_claim is None:
    warns.append("could not read the tool count from index.html ('Search <N>')")
elif count_claim != len(index):
    fails.append(f"index.html claims '{count_claim}' tools but cards.json has "
                 f"{len(index)} — bump the count when adding tools")

# ---------------------------------------------------------------- 6. sitemap
if os.path.exists(SITEMAP_PATH):
    with open(SITEMAP_PATH, encoding="utf-8", errors="replace") as f:
        sitemap = f.read()
    missing_sitemap = [f for f in sorted(on_disk)
                       if os.path.join("cards", f) not in sitemap]
    if missing_sitemap:
        fails.append(f"{len(missing_sitemap)} cards absent from sitemap.xml "
                     f"(first: {missing_sitemap[0]})")
else:
    warns.append("sitemap.xml missing (regenerate per ARCHITECTURE.md §6)")

# ---------------------------------------------------------------- report
cats = Counter(e.get("category") for e in index)
print(f"cards on disk : {len(on_disk)}")
print(f"cards indexed : {len(index)}")
print(f"categories    : {len(cats)}")
print(f"index.html    : {count_claim if count_claim else 'n/a'} claimed")

for w in warns:
    print(f"  WARN: {w}")
for fl in fails:
    print(f"  FAIL: {fl}")

if not fails:
    print(f"CATALOGUE OK ({len(index)} cards).")
    sys.exit(0)
print(f"CATALOGUE FAILED — {len(fails)} problem(s).")
sys.exit(1)
