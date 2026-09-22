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

Two names are not files and are resolved by adding up what they mean, so a
sentence about the project as a whole is checkable too:

  * `repo` / `repository` / `checkout` — every file git tracks, which is what
    someone who clones it gets. This closed the one claim the first version of
    the check named as out of scope. "The repo is 47 MB" was wrong twice over
    by 2026-09-22: the checkout held 89 MB of tracked files, and the
    "screenshots for the help docs" the sentence credited with the rest had
    been replaced by a photo library that two non-tool pages use.
  * `the tools themselves` / `cards themselves` — every `cards/*.html`, the
    figure a launch post actually cares about (about 18 MB of the 89 MB).

Hedging is not decoration here: "a repo of about 89 MB" stays true as the
catalogue grows, and this check is what fails when it stops being true.

Not covered: gzip figures.
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

# The size inside a match, in either word order. Used for the set claims below,
# whose job is only to locate the sentence; the number is read from here.
SIZE = re.compile(
    r"(?:(about|approximately|~)\s*)?([\d,]+(?:\.\d+)?)\s*(KB|MB|GB)\b",
    re.IGNORECASE,
)

# A size claim that names no file — "the repo is about 89 MB", "the repo is 47
# MB", "an 89 MB repo", "about 18 MB is the tools themselves". The name has to
# sit within 40 characters of the number, in one order or the other, so a
# passing mention of the repo cannot adopt a number from the far side of a
# sentence.
SET_NAMES = r"(?:repo|repository|checkout|tools themselves|cards themselves)"
SET_CLAIM = re.compile(
    rf"\b{SET_NAMES}\b[^.\n]{{0,40}}?[\d,]+(?:\.\d+)?\s*(?:KB|MB|GB)\b"
    # the other order — "18 MB is the tools themselves" — with the same
    # four-word window the count check allows, so a number cannot reach across
    # a clause boundary and adopt a name it has nothing to do with.
    rf"|[\d,]+(?:\.\d+)?\s*(?:KB|MB|GB)\s+(?:[a-z][a-z-]*[.,]?\s+){{0,4}}\b{SET_NAMES}\b",
    re.IGNORECASE,
)
SET_OF_NAME = re.compile(rf"\b({SET_NAMES})\b", re.IGNORECASE)
# The set patterns start at the name or at the number, so a hedge ("about 89
# MB") can sit just outside the match. Read it from the text before the match
# rather than from a window around it: a window can reach back into the
# sentence's *previous* size ("the repo is 47 MB, of which about 18 MB is the
# tools themselves") and adopt its number.
HEDGE_BEFORE = re.compile(r"(?:about|approximately|~)\s*$", re.IGNORECASE)


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


def tracked_bytes() -> int:
    """What a clone of this repository weighs: every file git tracks."""
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT,
                         capture_output=True).stdout.decode()
    total = 0
    for rel in out.split("\0"):
        if not rel:
            continue
        try:
            total += os.path.getsize(os.path.join(ROOT, rel))
        except OSError:
            pass  # a tracked file missing from the working tree
    return total


def cards_bytes() -> int:
    """The tools themselves: every cards/*.html."""
    total = 0
    for name in os.listdir(os.path.join(ROOT, "cards")):
        if name.endswith(".html"):
            total += os.path.getsize(os.path.join(ROOT, "cards", name))
    return total


def set_size(name: str) -> int:
    return cards_bytes() if "tools" in name.lower() or "cards" in name.lower() \
        else tracked_bytes()


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
        for m in SET_CLAIM.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            line = text.splitlines()[line_no - 1]
            if HISTORICAL in line:
                skipped += 1
                continue
            size = SIZE.search(m.group(0))
            if not size:
                continue
            name = SET_OF_NAME.search(m.group(0)).group(1)
            unit = UNITS[size.group(3).upper()]
            claimed = float(size.group(2).replace(",", ""))
            real = set_size(name)
            unit_label = "MB" if unit == UNITS["MB"] else "KB"
            checked += 1
            if HEDGE_BEFORE.search(text[:m.start()]):
                if abs(real - claimed * unit) / real > HEDGE_TOLERANCE:
                    problems.append(
                        f"{rel}:{line_no}  \"{m.group(0).strip()}\" — the {name} is "
                        f"{real / unit:.1f} {unit_label}, which is "
                        f"{abs(real - claimed * unit) / real * 100:.0f}% away from the claim, "
                        f"beyond the 15% a hedged claim may be")
            elif round(real / unit) != claimed:
                problems.append(
                    f"{rel}:{line_no}  \"{m.group(0).strip()}\" — the {name} is "
                    f"{real / unit:.1f} {unit_label}, so the honest figure is "
                    f"{round(real / unit)} {unit_label} (or write \"about\" and leave it room)")
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
