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

Pattern history
---------------
Originally the only pattern was `<number> <words> <noun>`, which silently
missed three real categories of claim and let drift ship undetected for
months: numbers wrapped in inline markup (`<b>708</b>`, `<strong>1164+</strong>`,
`**708**`), JSON-LD `"numberOfItems": N` where no noun ever follows, and
anaphoric count references ("708 of them", "alongside the other 1164"). All
three now have their own rules. The window between the number and the noun
also tolerates a single punctuation mark (`,` or `.`) per word and a longer
maximum word length, which `"708 free, ad-free browser tools"` requires.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# Files that carry a user- or agent-visible tool count. The fixed-name set is
# for top-level docs and pages; the per-directory globs cover guides/, blog/
# and launch/ whose sub-pages each have their own count claim in the footer.
TARGETS_TOP = [
    "index.html", "404.html", "tool.html", "donate.html", "sponsor.html",
    "README.md", "AGENTS.md", "ARCHITECTURE.md", "AGENT_ACCESS.md", "INCOME.md",
    "STRATEGY.md", "CONTRIBUTING.md",
    # Content and AI-facing pages salvaged from arena/01a05fea + 01a078f8.
    # changelog.html is deliberately absent: its entries are past-tense
    # history ("+10 tools, 23 categories, 562 total") and rewriting them
    # would turn the changelog into a lie.
    "about.html", "ai.html", "case-studies.html", "embed.html", "guides.html",
    "help.html", "hire.html", "legal.html", "license.html", "new.html",
    "popular.html", "press.html", "sitemap.html", "sync.html",
    "tools.html", "tools-index.html", "use-case.html",
]
TARGETS_GLOB = [
    "guides/*.html", "blog/*.html", "launch/index.html",
]
# Anything matching these globs is excluded from rewriting: board records
# (BRANCHES.md, BOARD.md, DECISIONS.md) document dated events; the changelog
# (already excluded from TARGETS) records past releases. Manual
# `<!-- historical-count -->` markers cover one-off cases.
EXCLUDE_PATTERNS = ["staff/", "changelog.html"]


def _collect_targets() -> list[str]:
    out = []
    for name in TARGETS_TOP:
        if os.path.exists(os.path.join(ROOT, name)):
            out.append(name)
    for pat in TARGETS_GLOB:
        for path in sorted(glob.glob(os.path.join(ROOT, pat))):
            rel = os.path.relpath(path, ROOT)
            if any(rel.startswith(ex) for ex in EXCLUDE_PATTERNS):
                continue
            out.append(rel)
    return out


TARGETS = _collect_targets()

# Past-tense narrative must never be rewritten: "the catalogue was not 500
# distinct tools" is a true statement about history, and syncing it to 644
# would turn the changelog into a lie. Everything from this heading onward in
# the given file is frozen.
HISTORY_ANCHOR = {
    "ARCHITECTURE.md": "## 9. Current state and known work",
    "INCOME.md": None,
    "STRATEGY.md": "## What to do next, in order",
}

# A line carrying this marker is exempt: it is deliberately quoting a past or
# hypothetical count. Use it sparingly and only for genuine narrative, e.g.
# "the site once advertised 483 tools <!-- historical-count -->".
# Needed because post-mortems that cite old numbers are the single most useful
# documentation here, and a checker that mangles them would be worse than none.
EXEMPT = "historical-count"

# Recognises a stale catalogue count. Must cover 4 digits: the catalogue
# passed 1000 tools, and with r"\d{3}" the leading digit of "1164 tools"
# fails the (?<![\d.]) lookbehind while the trailing "164" is never seen,
# so every 4-digit claim became invisible and the check silently passed.
# The 200-1500 plausibility guard in fix_text() still stops this matching a
# price, a year, or a video ID.
KNOWN_STALE = r"\d{3,4}"

# A count claim: <number>[+] <up to 4 small words> <noun>.
# The word window lets "644 free offline browser tools" match while stopping
# well short of running into unrelated prose.
NOUN = r"(?:tools?|cards?|utilities|utility|calculators?)"
# Allow comma or period after a word so "708 free, ad-free browser tools"
# still parses as three words instead of stopping at the comma.
FILLER = r"(?:[a-z][a-z-]{0,15}[.,]?\s+){0,4}"
# A "bridge" is markup or markdown emphasis between the number and the word
# window. Without this, `<b>708</b><span>Free tools</span>` and
# `**708** self-contained browser tools` are silently invisible to the
# check — which is how the donate page shipped saying "708" for weeks.
# The structure is: any number of tag/em spans, then optional whitespace,
# then 0–4 words. Each piece starts with a character class the previous
# piece can't consume, so there is no backtracking ambiguity.
TAG_OR_MARK = r"(?:<\/?[a-z][^>]*>|\*\*|__)"
BRIDGE = rf"(?:{TAG_OR_MARK})*"
GAP = rf"{BRIDGE}\s*{FILLER}"
CLAIM = re.compile(
    rf"(?<![\d.])({KNOWN_STALE})(\+?)({GAP}){NOUN}\b",
    re.IGNORECASE,
)

# JSON-LD puts the number on the far side of the key, so the noun never
# follows it and CLAIM cannot see it. This rule is what fixes tools.html's
# "numberOfItems": 562 and index.html's CollectionPage count.
JSONLD_NO = re.compile(r'("numberOfItems"\s*:\s*)(\d{3,4})(?=\s*[,}])')

# Named chrome can show a bare number with no following noun (count-all).
# Keep this in the canonical synchroniser, rather than a second design fixer.
CHROME_COUNT = re.compile(
    r"""(\bid\s*=\s*["'](?:heroToolCount|count-all)["'][^>]*>\s*)(\d{3,4})\b""",
    re.IGNORECASE,
)

# "708 of them" and "alongside the other 1164" — count claims where the
# noun is replaced by an anaphor. Both appear in the live site copy.
OF_THEM = re.compile(r"(?<![\d.])(\d{3,4})(?=\s+of\s+them\b)", re.IGNORECASE)
ALONGSIDE_OTHER = re.compile(
    r"(?<![\d.])(alongside\s+the\s+other\s+)(\d{3,4})\b", re.IGNORECASE
)
# "All 708 share one DOM" — a count claim with no recognisable noun. The
# number still describes the catalogue (every card shares the catalogue's
# DOM), so the count is the same and the claim is stale when the catalogue
# size changes. The pattern is narrow on purpose — "share" and "DOM" are
# not otherwise a count-trigger.
SHARE_ONE_DOM = re.compile(
    r"(?<![\d.])(all\s+|every\s+card\s+|every\s+tool\s+)?(\d{3,4})(?=\s+(?:share|shares|sharing)\s+one\s+DOM\b)",
    re.IGNORECASE,
)


def true_count() -> int:
    if not os.path.isdir(CARDS):
        print("cards/ not on disk (sparse checkout) — cannot verify counts")
        sys.exit(0)
    return len([f for f in os.listdir(CARDS) if f.endswith(".html")])


def _is_exempt(text: str, start: int, end: int) -> bool:
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    if line_end == -1:
        line_end = len(text)
    line = text[line_start:line_end]
    if EXEMPT in line:
        return True
    # Don't touch lines that look like dated narrative ("…on 2026-09-07…").
    # These are the kind of sentence the docstring warns about rewriting.
    if re.search(r"\b20\d{2}-\d{2}-\d{2}\b", line):
        return True
    return False


def _plausible(n: int) -> bool:
    return 200 <= n <= 1500


def fix_text(text: str, n: int) -> tuple[str, list[str]]:  # noqa: C901
    """Rewrite every stale count claim. Returns (new_text, descriptions)."""
    changes: list[str] = []

    def claim_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(1)
        if found == str(n):
            return m.group(0)
        if not _plausible(int(found)):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        return str(n) + m.group(2) + m.group(3) + m.group(0)[m.end(3) - m.start():]

    def jsonld_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(2)
        if found == str(n):
            return m.group(0)
        if not _plausible(int(found)):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        return m.group(1) + str(n)

    def of_them_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(1)
        if found == str(n):
            return m.group(0)
        if not _plausible(int(found)):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        return str(n) + m.group(0)[len(m.group(1)):]

    def alongside_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(2)
        if found == str(n):
            return m.group(0)
        if not _plausible(int(found)):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        return m.group(1) + str(n)

    def share_dom_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(2)
        if found == str(n):
            return m.group(0)
        if not _plausible(int(found)):
            return m.group(0)
        changes.append(f"{m.group(0).strip()!r} -> {n}")
        prefix = m.group(1) or ""
        return prefix + str(n) + m.group(0)[len(prefix) + len(m.group(2)):]

    # Apply each pattern in turn. Order matters: CLAIM may match a span
    # that JSONLD_NO would otherwise rewrite (it doesn't here, but be safe
    # and run them independently).
    new = text
    for pat, repl in (
        (CLAIM, claim_repl),
        (JSONLD_NO, jsonld_repl),
        (CHROME_COUNT, jsonld_repl),
        (OF_THEM, of_them_repl),
        (ALONGSIDE_OTHER, alongside_repl),
        (SHARE_ONE_DOM, share_dom_repl),
    ):
        new = pat.sub(repl, new)
    return new, changes


def main() -> int:
    ap = argparse.ArgumentParser()
    modes = ap.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true",
                       help="report drift and exit 1; do not write")
    modes.add_argument("--plan", action="store_true",
                       help="emit a JSON edit plan with source hashes; do not write")
    args = ap.parse_args()

    n = true_count()
    total = 0
    stale_files = 0
    plan = []

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
        if args.plan:
            plan.append({
                "path": name,
                "beforeSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "after": new,
                "claims": len(changes),
            })
            continue
        verb = "STALE" if args.check else "fixed"
        print(f"  {verb} {name}: {len(changes)} claim(s)")
        for c in changes[:6]:
            print(f"      {c}")
        if len(changes) > 6:
            print(f"      … and {len(changes) - 6} more")
        if not args.check:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(new)

    if args.plan:
        print(json.dumps({"count": n, "changes": plan}, ensure_ascii=False))
        return 0

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
