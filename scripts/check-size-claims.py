#!/usr/bin/env python3
"""check-size-claims.py — prose that says how big a file is must be true.

    python3 scripts/check-size-claims.py           # exit 1 on a stale claim

`sync-counts.py` owns every tool and category *count*; nothing owned a *size*.
The same sentence pattern ("`explore.js` is 27 KB") is scattered through the
docs, the scripts' docstrings and the shipped JS comments, and by 2026-09-22
every one of these had rotted:

    ARCHITECTURE.md    explore.js 27 KB        -> 47.9 KB
    ARCHITECTURE.md    explore.css 18 KB       -> 24.9 KB
    ARCHITECTURE.md    home.css 102 KB         -> 43.3 KB
    ARCHITECTURE.md    tools-index.json 876 KB -> 898.3 KB
    toolbox.js         cards-lite.json 111 KB  -> 119.2 KB

A reader trusting the architecture document was told the list engine is a
quarter the size it is. The numbers rot silently because a file grows without
anyone editing the sentence that describes it.

Two rules, because precision is not the same as durability:

  * a bare claim must be exactly right — `explore.js` at 47.9 KB satisfies
    "48 KB" and nothing else. Claiming more digits than that is fine as long as
    they are the right ones.
  * a claim hedged with `about`/`~`/`approximately` is allowed 15%, which is
    the point of hedging: "about 900 KB" stays true while the file grows. Most
    claims should be written this way, because a size that changes with every
    release cannot be pinned in prose.

A claim is resolved against the file it names — from the repository root, from
the document's own directory, and under `cards/` and `scripts/` — and a name
that resolves to nothing (a file deleted since, or a name used illustratively)
is skipped rather than guessed at; `scripts/dead_refs`-style link rot is not
this check's job. A genuinely historical figure — "index.html used to carry
~118 KB of CSS inline" — is marked `historical-size` on its line, the same
device `sync-counts.py` uses for past tool counts, so the exemption is visible
where the number is rather than hidden in this file.

Not covered: gzip figures, and claims that name no file ("the repo is 47 MB").
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELF = os.path.relpath(os.path.abspath(__file__), ROOT)

# `<path>` … 12 KB   — the name first, the number after it, at most 40
# characters apart, so an unattributed number ("13 KB gzip combined") is
# skipped rather than attached to whichever file was named last.
CLAIM = re.compile(
    r"`?([\w./-]+\.(?:json|js|css|html|txt))`?[^.\n]{0,40}?"
    r"(?:(about|approximately|~)\s*)?([\d,]+(?:\.\d+)?)\s*(KB|MB)\b",
    re.IGNORECASE,
)
HISTORICAL = "historical-size"
SEARCH_DIRS = ("cards", "scripts")
UNITS = {"B": 1, "KB": 1024, "MB": 1024 * 1024}
HEDGE_TOLERANCE = 0.15


def tracked_text_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                         text=True).stdout.split()
    keep, skip = [], re.compile(r"^(api/tools/|cards/|images/|press/)")
    for rel in out:
        if skip.search(rel) or rel == SELF or not rel.endswith(
                (".md", ".html", ".js", ".json", ".py", ".sh", ".txt", ".css")):
            continue
        keep.append(rel)
    return keep


def resolve(target: str, doc_rel: str) -> str | None:
    """The file a claim names, or None when the name resolves to nothing."""
    candidates = [
        target,
        os.path.join(os.path.dirname(doc_rel), target),
        *(os.path.join(d, target) for d in SEARCH_DIRS),
        *(os.path.join(d, os.path.basename(target)) for d in SEARCH_DIRS),
    ]
    for cand in candidates:
        path = os.path.normpath(os.path.join(ROOT, cand))
        if os.path.isfile(path):
            return path
    return None


def main() -> int:
    problems: list[str] = []
    checked = 0
    skipped = 0
    for rel in tracked_text_files():
        try:
            text = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for m in CLAIM.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            line = text.splitlines()[line_no - 1]
            if HISTORICAL in line:
                skipped += 1
                continue
            path = resolve(m.group(1), rel)
            if path is None:
                skipped += 1
                continue
            unit = UNITS[m.group(4).upper()]
            claimed = float(m.group(3).replace(",", ""))
            real = os.path.getsize(path)
            checked += 1
            if m.group(2):  # hedged: "about 900 KB" is allowed to be approximate
                if abs(real - claimed * unit) / real > HEDGE_TOLERANCE:
                    problems.append(
                        f"{rel}:{line_no}  \"{m.group(0).strip()}\" — {m.group(1)} is "
                        f"{real / 1024:.1f} KB, which is "
                        f"{abs(real - claimed * unit) / real * 100:.0f}% away from the claim, "
                        f"beyond the 15% a hedged claim may be")
            elif round(real / unit) != claimed:
                problems.append(
                    f"{rel}:{line_no}  \"{m.group(0).strip()}\" — {m.group(1)} is "
                    f"{real / 1024:.1f} KB, so the honest figure is "
                    f"{round(real / 1024)} KB (or write \"about\" and leave it room)")
    if problems:
        print(f"SIZE CLAIMS STALE — {len(problems)} of {checked}:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        print("\nFix the sentence, or hedge it with \"about\" if the file is still "
              "growing; mark a genuinely past figure historical-size.", file=sys.stderr)
        return 1
    print(f"SIZE CLAIMS OK — {checked} claim(s) match the files they name "
          f"({skipped} unresolvable name(s) skipped).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
