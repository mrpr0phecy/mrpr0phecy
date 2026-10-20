#!/usr/bin/env python3
"""Prove a palette batch moved colour and nothing else.

`scripts/retheme-cards.py` is supposed to rewrite colour literals and leave
every other byte alone. This compares each changed card against the merge base
with `origin/main`, strips hex, `rgba()`, `hsl()` and the named colours from
both sides of every changed line, and fails if anything else differs.

    python3 scripts/check-colour-only.py            # against origin/main
    python3 scripts/check-colour-only.py --base REF  # against another ref

Not part of `verify.sh`: a legitimate feature change to a card is not
colour-only, and that is fine. This is the check you run before opening a
palette PR, where every single line *is* supposed to be a colour.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys

COLOUR = re.compile(
    r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b"
    r"|rgba?\([^)]*\)"
    r"|hsla?\([^)]*\)"
    # Named colours only ever appear as a whole property value or a bare word
    # after a colon/comma, so the common ones cannot collide with prose.
    r"|(?<=[:\s,(])(?:white|black|transparent|currentcolor|inherit)\b",
    re.I,
)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True,
                          check=True).stdout


def base_ref(explicit: str | None) -> str:
    if explicit:
        return explicit
    try:
        git("rev-parse", "--verify", "origin/main")
    except subprocess.CalledProcessError:
        sys.exit("no origin/main to compare with — pass --base REF")
    merge_base = git("merge-base", "origin/main", "HEAD").strip()
    return merge_base or "origin/main"


def changed_cards(base: str) -> list[str]:
    out = git("diff", "--name-only", base, "--", "cards/")
    return [line for line in out.split() if line.endswith(".html")]


def pairs(base: str, path: str):
    """(removed, added) lines from a zero-context diff, in order."""
    diff = git("diff", "-U0", base, "--", path)
    removed, added = [], []
    for line in diff.splitlines():
        if line.startswith(("---", "+++")):
            continue
        if line.startswith("-"):
            removed.append(line[1:])
        elif line.startswith("+"):
            added.append(line[1:])
    return removed, added


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="git ref to compare against (default: origin/main)")
    args = ap.parse_args()
    base = base_ref(args.base)

    files = changed_cards(base)
    if not files:
        print(f"colour-only OK — no cards changed against {base[:12]}")
        return 0

    problems = 0
    swaps = 0
    for path in files:
        removed, added = pairs(base, path)
        if len(removed) != len(added):
            # A card can be edited and still be colour-only overall (a moved
            # line), but the one-for-one shape is what makes the review quick;
            # report it rather than pretend.
            print(f"{path}: {len(removed)} lines removed, {len(added)} added")
            problems += 1
            continue
        for old, new in zip(removed, added):
            swaps += 1
            if COLOUR.sub("#", old) != COLOUR.sub("#", new):
                print(f"{path}: non-colour change")
                print(f"  - {old.strip()[:160]}")
                print(f"  + {new.strip()[:160]}")
                problems += 1

    if problems:
        print(f"\nFAIL — {problems} problem(s) in {len(files)} changed card(s)")
        return 1
    print(f"colour-only OK — {swaps} changed line(s) across {len(files)} card(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
