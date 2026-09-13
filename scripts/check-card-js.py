#!/usr/bin/env python3
"""check-card-js.py — syntax-check the JavaScript inside every tool card.

Seven cards were once completely dead in production because a JavaScript syntax
error killed their whole <script> block: the tool rendered but did nothing at
all. That was found by hand and fixed, but nothing stopped it happening again.
This is the guard.

A card is a fragment injected into a shared DOM, so its scripts are checked as
standalone scripts — which is exactly how the browser parses them.

The guard also catches TRUNCATED cards: a file whose <script> block is never
closed yields no extractable block, so a pure syntax sweep would silently pass
a completely dead tool. After stripping paired blocks, any leftover <script
opener is a failure — no allowlist, no warnings. A stray </script> closer with
no opener is harmless and is NOT flagged.

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
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
SRC_SCRIPT_RE = re.compile(r"<script\b[^>]*\bsrc=[^>]*>\s*</script\s*>", re.S | re.I)
LEFTOVER_SCRIPT_RE = re.compile(r"<script\b", re.I)

# There is no allowlist here any more. Eight cards (clip-short,
# electrical-standards, fitnesscore, genetics, interval-trainer, mealplanner,
# oscilloscope, palette-swapper) used to sit on a KNOWN_TRUNCATED list that
# downgraded their truncation to a warning; they were restored on 2026-09-13,
# so an unclosed <script> is now always a hard failure. A card whose script
# block never closes renders as dead markup with no interactivity at all.


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
            # Truncation probe: strip comments, external scripts, and paired
            # inline blocks. A leftover <script opener means the file's script
            # was never closed — the tool is dead. (Stray </script> closers
            # are harmless and ignored.)
            probe = COMMENT_RE.sub("", text)
            probe = SRC_SCRIPT_RE.sub("", probe)
            probe = SCRIPT_RE.sub("", probe)
            if LEFTOVER_SCRIPT_RE.search(probe):
                fails.append(f"{f}: UNCLOSED <script> — file ends with "
                             "the script block never closed (truncated card)")
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
