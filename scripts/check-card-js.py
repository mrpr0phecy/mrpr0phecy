#!/usr/bin/env python3
"""check-card-js.py — syntax-check the JavaScript inside every tool card.

Seven cards were once completely dead in production because a JavaScript syntax
error killed their whole <script> block: the tool rendered but did nothing at
all. That was found by hand and fixed, but nothing stopped it happening again.
This is the guard.

A card is a fragment injected into a shared DOM, so its scripts are checked as
standalone scripts — which is exactly how the browser parses them.

Usage:
    python3 scripts/check-card-js.py           # only cards changed vs HEAD (fast)
    python3 scripts/check-card-js.py --all     # every card (~10s)

Requires node. If node is missing the check is skipped with a NOTE rather than
failing, so a machine without node is not blocked from pushing.
"""
from __future__ import annotations
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)


def changed_cards() -> list[str]:
    """Cards modified in the working tree or index, vs HEAD."""
    try:
        out = subprocess.run(
            ["git", "diff", "--name-only", "HEAD", "--", "cards/"],
            cwd=ROOT, capture_output=True, text=True, check=True).stdout
        staged = subprocess.run(
            ["git", "diff", "--name-only", "--cached", "--", "cards/"],
            cwd=ROOT, capture_output=True, text=True, check=True).stdout
        names = {os.path.basename(l) for l in (out + staged).splitlines() if l.strip()}
        return sorted(n for n in names if n.endswith(".html")
                      and os.path.exists(os.path.join(CARDS, n)))
    except Exception:
        return []


def all_cards() -> list[str]:
    return sorted(f for f in os.listdir(CARDS) if f.endswith(".html"))


def main() -> int:
    if not shutil.which("node"):
        print("NOTE: node not installed — card JS syntax check skipped")
        return 0

    full = "--all" in sys.argv
    files = all_cards() if full else changed_cards()
    if not files:
        print("no changed cards to syntax-check (use --all for a full sweep)")
        return 0

    tmp = tempfile.mkdtemp(prefix="cardjs-")
    fails: list[str] = []
    blocks = 0
    try:
        for f in files:
            try:
                text = open(os.path.join(CARDS, f), encoding="utf-8",
                            errors="replace").read()
            except OSError:
                continue
            for i, m in enumerate(SCRIPT_RE.finditer(text)):
                src = m.group(1)
                if not src.strip():
                    continue
                blocks += 1
                path = os.path.join(tmp, f"{f}.{i}.mjs")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(src)
                r = subprocess.run(["node", "--check", path],
                                   capture_output=True, text=True)
                if r.returncode != 0:
                    first = next((l for l in r.stderr.splitlines()
                                  if "SyntaxError" in l or "Error" in l), "?")
                    fails.append(f"{f} (script block {i}): {first.strip()[:140]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    scope = "all cards" if full else "changed cards"
    print(f"checked {blocks} script blocks in {len(files)} {scope}")
    for fl in fails:
        print(f"  FAIL: {fl}")
    if fails:
        print(f"CARD JS FAILED — {len(fails)} card(s) would be dead in production.")
        return 1
    print("CARD JS OK — no syntax errors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
