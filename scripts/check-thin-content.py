#!/usr/bin/env python3
"""check-thin-content.py — pointer #1 / #5 audit.

Reports thin-content risk across all cards (pointer #1) and missing E-E-A-T
signals for YMYL tools (pointer #5). Non-destructive: never modifies cards.

Usage:
  python3 scripts/check-thin-content.py          # report
  python3 scripts/check-thin-content.py --json   # machine-readable
  python3 scripts/check-thin-content.py --fail-under 300  # exit 1 if median < 300 (use for CI floor)

Respects CONSTRAINTS.md: never deletes tools; suggestions are "deepen" only.
"""
from __future__ import annotations
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards"
JSON_PATH = CARDS / "cards.json"

WORD_THRESHOLDS = [150, 300, 500]
YMYL_CATS = {"Health & Fitness", "Finance & Money"}
YMYL_SIGNALS = [
    "not medical", "not financial", "not legal advice",
    "disclaimer", "methodology", "formula source",
    "last reviewed", "reviewer", "primary source",
    "who", "nih", "irs", "fca", "nhs",
]

def strip(html: str) -> str:
    html = re.sub(r'<script.*?</script>', ' ', html, flags=re.S | re.I)
    html = re.sub(r'<style.*?</style>', ' ', html, flags=re.S | re.I)
    html = re.sub(r'<[^>]+>', ' ', html)
    html = re.sub(r'\s+', ' ', html)
    return html.strip()

def audit():
    files = sorted(glob.glob(str(CARDS / "*.html")))
    # cards.json for category mapping
    cat_by_file: dict[str, str] = {}
    try:
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        for e in data:
            f = e.get("file") or (e.get("name","") + ".html")
            cat_by_file[f] = e.get("category","")
    except Exception:
        pass

    rows = []
    for f in files:
        text = strip(Path(f).read_text(encoding="utf-8", errors="replace"))
        words = len(text.split())
        chars = len(Path(f).read_text(encoding="utf-8", errors="replace"))
        cat = cat_by_file.get(Path(f).name, "")
        low = text.lower()
        signals = [s for s in YMYL_SIGNALS if s.lower() in low]
        is_ymyl = cat in YMYL_CATS
        has_signal = len(signals) > 0
        rows.append({
            "file": Path(f).name,
            "words": words,
            "chars": chars,
            "category": cat,
            "is_ymyl": is_ymyl,
            "signals": signals,
            "has_signal": has_signal,
        })
    return rows

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--fail-under", type=int, default=None, help="exit 1 if median words < N")
    ap.add_argument("--top", type=int, default=20, help="thinnest N to list")
    args = ap.parse_args()

    rows = audit()
    rows_sorted = sorted(rows, key=lambda r: r["words"])
    total = len(rows)
    words = sorted(r["words"] for r in rows)
    avg = sum(words)/len(words) if words else 0
    median = words[len(words)//2] if words else 0
    min_w = min(words) if words else 0
    max_w = max(words) if words else 0

    if args.json:
        print(json.dumps({
            "total": total,
            "avg_words": round(avg,1),
            "median_words": median,
            "min_words": min_w,
            "max_words": max_w,
            "under_150": sum(1 for w in words if w < 150),
            "under_300": sum(1 for w in words if w < 300),
            "under_500": sum(1 for w in words if w < 500),
            "rows": rows_sorted,
        }, indent=2))
        sys.exit(0)

    print(f"Thin-content audit — {total} cards (cards/*.html fragments, scripts/styles stripped)")
    print(f"  avg {avg:.1f} words · median {median} · min {min_w} · max {max_w}")
    for thr in WORD_THRESHOLDS:
        cnt = sum(1 for w in words if w < thr)
        pct = (cnt/total*100) if total else 0
        print(f"  <{thr} words: {cnt} ({pct:.1f}%)")
    print()
    print(f"Thinnest {args.top}:")
    for r in rows_sorted[:args.top]:
        flag = ""
        if r["is_ymyl"] and not r["has_signal"]:
            flag = "  ← YMYL without E-E-A-T signal"
        elif r["is_ymyl"]:
            flag = ""
        print(f"  {r['words']:4d} w  {r['file']:45s} {r['category']}{flag}")

    # YMYL summary
    ymyl_rows = [r for r in rows if r["is_ymyl"]]
    if ymyl_rows:
        without = [r for r in ymyl_rows if not r["has_signal"]]
        print()
        print(f"YMYL (Health & Fitness {sum(1 for r in ymyl_rows if r['category']=='Health & Fitness')} + Finance & Money {sum(1 for r in ymyl_rows if r['category']=='Finance & Money')} = {len(ymyl_rows)}): {len(without)} without any E-E-A-T signal (disclaimer/methodology/who/nih/irs...)")
        if without:
            for r in without[:10]:
                print(f"  - {r['file']} ({r['words']} words)")
            if len(without) > 10:
                print(f"  … and {len(without)-10} more")

    print()
    print("What to do (respects CONSTRAINTS.md: never delete without owner sign-off):")
    print("  1. Promote the thinnest + most-searched tools to `tools/<slug>.html` via")
    print("     `scripts/tool-pages.json` → `python3 scripts/build-tool-pages.py` — that")
    print("     is where the 300+ honest words, worked example, methodology, edge cases")
    print("     and disclaimer belong (see docs/TRUST.md).")
    print("  2. Use the zero-result search log (`__mp_zero_searches`) to choose which")
    print("     tools to deepen first — popularity × thinness × YMYL risk.")
    print("  3. Re-run this script in CI weekly; track median words as the north star.")

    if args.fail_under is not None and median < args.fail_under:
        print(f"\nFAIL: median {median} < {args.fail_under}")
        sys.exit(1)

if __name__ == "__main__":
    main()
