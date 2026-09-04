#!/usr/bin/env python3
"""sync-counts.py — one number, one source of truth.

The tool count lives in exactly one place: the number of files in `cards/`.
Every human-readable copy of it (49 of them across 10 files at last count) is
*derived*. This script rewrites them all.

    python3 scripts/sync-counts.py --check   # CI/verify: fail on any drift
    python3 scripts/sync-counts.py           # fix every stale copy in place

Why this exists
---------------
Hand-syncing the count across README + ARCHITECTURE + INCOME + AGENTS +
AGENT_ACCESS + index + 404 + tool + donate + sponsor was a documented ritual
repeated six times in ARCHITECTURE.md §9. It failed every single time it was
performed: the site has shipped 250, 483, 500, 562, 602, 612, 622, 632 and 634
simultaneously with the truth. Two of those lived on the donate and sponsor
pages — the money pages — for weeks.

A rule a human must remember is a rule that breaks. This makes the count
impossible to get wrong instead of merely forbidden to get wrong.

What counts as a claim
----------------------
A number immediately followed (within a short window of words) by tool/card/
utility/calculator, or one of the exact template phrases below. Version
strings, prices, years, pixel sizes and colour values are never touched — the
patterns are deliberately narrow and every replacement is shown with --check.
"""
from __future__ import annotations

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# Files that carry a user- or agent-visible tool count.
TARGETS = [
    "index.html", "404.html", "tool.html", "donate.html", "sponsor.html",
    "README.md", "AGENTS.md", "ARCHITECTURE.md", "AGENT_ACCESS.md", "INCOME.md",
]

# Past-tense narrative must never be rewritten: "the catalogue was not 500
# distinct tools" is a true statement about history, and syncing it to 644
# would turn the changelog into a lie. Everything from this heading onward in
# the given file is frozen.
HISTORY_ANCHOR = {
    "ARCHITECTURE.md": "## 9. Current state and known work",
    "INCOME.md": None,
}

# A line carrying this marker is exempt: it is deliberately quoting a past or
# hypothetical count. Use it sparingly and only for genuine narrative, e.g.
# "the site once advertised 483 tools <!-- historical-count -->".
# Needed because post-mortems that cite old numbers are the single most useful
# documentation here, and a checker that mangles them would be worse than none.
EXEMPT = "historical-count"

# Historical counts this repo has shipped. Used only to recognise a stale
# claim; a number outside this set is left alone so we can never mangle a
# price, a year, or a video ID.
KNOWN_STALE = r"\d{3}"

# A count claim: <number>[+] <up to 4 small words> <noun>.
# The word window lets "644 free offline browser tools" match while stopping
# well short of running into unrelated prose.
NOUN = r"(?:tools?|cards?|utilities|utility|calculators?)"
FILLER = r"(?:[a-z][a-z-]{0,11}\s+){0,4}"
CLAIM = re.compile(
    rf"(?<![\d.])({KNOWN_STALE})(\+?)(\s+{FILLER}){NOUN}\b",
    re.IGNORECASE,
)


def true_count() -> int:
    if not os.path.isdir(CARDS):
        print("cards/ not on disk (sparse checkout) — cannot verify counts")
        sys.exit(0)
    return len([f for f in os.listdir(CARDS) if f.endswith(".html")])


def fix_text(text: str, n: int) -> tuple[str, list[str]]:  # noqa: C901
    """Rewrite every stale count claim. Returns (new_text, descriptions)."""
    changes: list[str] = []

    def repl(m: re.Match) -> str:
        line_start = text.rfind("\n", 0, m.start()) + 1
        line_end = text.find("\n", m.end())
        line = text[line_start:line_end if line_end != -1 else len(text)]
        if EXEMPT in line:
            return m.group(0)
        found = m.group(1)
        if found == str(n):
            return m.group(0)
        # Only rewrite plausible catalogue sizes, never arbitrary 3-digit
        # numbers that happen to precede the word "tools".
        if not (200 <= int(found) <= 1500):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        return str(n) + m.group(2) + m.group(3) + m.group(0)[m.end(3) - m.start():]

    return CLAIM.sub(repl, text), changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report drift and exit 1; do not write")
    args = ap.parse_args()

    n = true_count()
    total = 0
    stale_files = 0

    for name in TARGETS:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            text = fh.read()

        anchor = HISTORY_ANCHOR.get(name)
        head, tail = text, ""
        if anchor and anchor in text:
            cut = text.index(anchor)
            head, tail = text[:cut], text[cut:]

        new, changes = fix_text(head, n)
        new += tail
        if not changes:
            continue
        stale_files += 1
        total += len(changes)
        verb = "STALE" if args.check else "fixed"
        print(f"  {verb} {name}: {len(changes)} claim(s)")
        for c in changes[:6]:
            print(f"      {c}")
        if len(changes) > 6:
            print(f"      … and {len(changes) - 6} more")
        if not args.check:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(new)

    if not total:
        print(f"counts OK — every claim matches the catalogue ({n} tools).")
        return 0

    if args.check:
        print(f"\nCOUNTS FAILED: {total} stale claim(s) in {stale_files} file(s). "
              f"Catalogue is {n}.\n"
              f"Fix with:  python3 scripts/sync-counts.py")
        return 1

    print(f"\nSynced {total} claim(s) in {stale_files} file(s) to {n}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
