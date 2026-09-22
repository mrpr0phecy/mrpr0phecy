#!/usr/bin/env python3
"""sync-counts.py — one number, one source of truth.

The tool count lives in exactly one place: the number of files in `cards/`.
Every human-readable copy of it (49 of them across 10 files at last count) is
*derived*. This script rewrites them all.

    python3 scripts/sync-counts.py --check   # CI/verify: fail on any drift
    python3 scripts/sync-counts.py           # fix every stale copy in place
    python3 scripts/sync-counts.py count     # print the canonical tool count

Two numbers are derived, both from the filesystem and never typed by hand:

  * the TOOL count — the number of .html files in cards/
  * the CATEGORY count — the number of .html files in categories/

Add or remove a card or a category, run this script (or let verify.sh's count
section do it for you — it self-heals drift in place), and every published
number follows the folder. The category count joined on 2026-09-22, when the
site said "28 categories" in README, ARCHITECTURE, about.html, index.html and
package.json and "27" in .well-known/mcp.json and embed.html, while
categories/ held 29 and index.html linked all 29.

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
three now have their own rules.

A fourth category was added on 2026-09-22: comma-grouped thousands. The
lookbehind that stops the tail of "1,194" being rewritten to "1,1195" also
made the whole of "1,206 tools" invisible, and comma grouping is the house
style for the biggest claims — README's headline, package.json's description,
ARCHITECTURE's present-tense prose, CONSTRAINTS.md, .well-known/mcp.json,
maps.html's visible link text and the header comments of explore.js and
maps/embed.js. Every one of them had drifted to 1,194–1,206 against a
catalogue of 1,250. Those files are now targets, and the rewrite keeps each
claim's own style. Genuine past-tense narrative that cites the old numbers is
protected by the same two mechanisms as before: a dated line, or an explicit
`historical-count` marker. The window between the number and the noun
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
CATEGORIES = os.path.join(ROOT, "categories")

# Files that carry a user- or agent-visible tool count. The fixed-name set is
# for top-level docs and pages; the per-directory globs cover guides/, blog/
# and launch/ whose sub-pages each have their own count claim in the footer.
TARGETS_TOP = [
    "index.html", "404.html", "tool.html", "donate.html", "sponsor.html",
    "README.md", "AGENTS.md", "ARCHITECTURE.md", "INCOME.md", "agents.html",
    "CONTRIBUTING.md",
    # The PWA manifest names the count four times (name, description, the
    # screenshot label, the search shortcut). It drifted to 1194 unnoticed
    # because nothing owned it — the CLAIM pattern already matches every one
    # of its "<number> [words] tools" phrases, and the rewrite stays inside
    # the JSON strings so the file remains valid.
    "manifest.tools.json",
    # Content and AI-facing pages salvaged from arena/01a05fea + 01a078f8.
    # changelog.html is deliberately absent: its entries are past-tense
    # history ("+10 tools, 23 categories, 562 total") and rewriting them
    # would turn the changelog into a lie.
    "about.html", "ai.html", "case-studies.html", "embed.html", "guides.html",
    "help.html", "legal.html", "new.html", "popular.html", "press.html",
    "sitemap.html", "tools.html", "tools-index.html", "use-case.html",
    # Added 2026-09-22, each one a count claim nothing owned:
    #   maps.html    — "the other 1,205 tools" as VISIBLE link text.
    #   CONSTRAINTS.md — "All 1195 cards share one DOM", the sentence an agent
    #     reads before writing card code; it was 55 behind.
    #   package.json — the repository description on every GitHub view.
    #   .well-known/mcp.json — the MCP displayName ("1194 Browser Tools").
    #   explore.js   — the list engine every visitor downloads, whose header
    #     comment describes the catalogue it is filtering.
    #   maps/embed.js, maps/core/locators.js — shipped JS whose header
    #     comments describe the catalogue, and had drifted with it.
    "maps.html", "CONSTRAINTS.md", "package.json", ".well-known/mcp.json",
    "explore.js", "maps/embed.js", "maps/core/locators.js",
]
TARGETS_GLOB = [
    "guides/*.html", "blog/*.html", "launch/index.html", "tools/*.html",
    # Agent-facing docs: the files AGENTS.md and ARCHITECTURE.md send a new
    # contributor to. They carried "1,205 tools" and "1194 tools" with
    # nothing deriving them.
    "docs/*.md",
]
# scripts/ is deliberately NOT a target, and adding it looks harmless until
# you read what it proposes to rewrite: sync-counts.py's own docstring is
# full of count examples ("708 free, ad-free browser tools", "1194 Browser
# Tools") that document the patterns, and build-tools-page.py and
# check-tool-graph.py carry dated post-mortems ("532 of 1,195 tools", "663
# tools were missing"). A regex cannot tell a claim from a quotation of one.
# The handful of genuine claims in scripts/ are fixed by hand and the two
# that describe the CURRENT state carry no date, so they are easy to spot:
# grep for the number in scripts/ rather than widening this list.
# Anything matching these globs is excluded from rewriting: the changelog
# records past releases, so its numbers are history rather than claims. Manual
# `<!-- historical-count -->` markers cover one-off cases.
EXCLUDE_PATTERNS = ["changelog.html"]


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
    "INCOME.md": None,
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
#
# The comma-grouped form is matched as a WHOLE ("1,206", never just "206"),
# because the unseparated pattern is blind to it: the lookbehind below
# rejects a digit preceded by a comma, so "1,206 free tools" was invisible
# and the repo's most-read sentences — README's headline, package.json's
# description, ARCHITECTURE's present-tense prose and maps.html's visible
# link text — were never owned by this script. They drifted: all four read
# 1,205/1,206 while the catalogue held 1,250. The grouped alternative is
# listed FIRST so the match is "1,206" rather than a leading "1" that fails
# the word window, and the replacement re-applies the separator (see
# claim_repl), so a claim keeps the style it was written in rather than
# being reformatted underneath its author.
GROUPED = r"\d{1,2},\d{3}"
KNOWN_STALE = rf"(?:{GROUPED}|\d{{3,4}})"

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
# A number that is the tail of a thousands-separated group ("194" inside
# "1,194 tools") is not a count claim, and rewriting it corrupts the sentence:
# "1,194 tools" would become "1,1195 tools". The lookbehind therefore excludes
# a comma as well as a digit and a period. This never fired only by luck — the
# tail of every "1,NNN tools" in the repo (194, 195, 190, 149) sits below the
# 200 plausibility floor, and the catalogue passing 1,200 tools would have put
# every "1,2xx tools" in ARCHITECTURE.md and the docs in range of a rewrite.
#
# The lookbehind stays. What changed (2026-09-22) is that the grouped form is
# now matched as a whole by KNOWN_STALE and re-emitted with its separator
# intact, so "1,206 tools" is owned rather than ignored. Ignoring it had a
# cost the earlier note did not weigh: the comma form is what the repo's most
# prominent sentences use, so the front door was the one place guaranteed not
# to be checked, and it read 1,206 while the catalogue held 1,250.
# A number that is a pixel measurement ("360 px. A YMYL tool…" in AGENTS.md)
# is not a count claim either: the word window happily walked across "px. A
# YMYL" to reach "tool", and that viewport width was renumbered to the tool
# count on every release until 2026-09-21.
CLAIM = re.compile(
    rf"(?<![\d.,])({KNOWN_STALE})(?!\s*px\b)(\+?)({GAP}){NOUN}\b",
    re.IGNORECASE,
)

# The CATEGORY count is derived the same way the tool count is — from the
# filesystem — because nothing owned it and it drifted just as quietly. The
# site said "28 categories" in README, ARCHITECTURE, about.html and
# index.html, and "27 categories" in .well-known/mcp.json and embed.html,
# while categories/ held 29 pages and index.html linked all 29. A published
# count nothing derives is a count that is wrong; this one now derives from
# the folder the same way the tool count does.
CATEGORY_CLAIM = re.compile(
    r"(?<![\d.,])(\d{2,3})(\s+category\s+hubs?|\s+categories)\b",
    re.IGNORECASE,
)

# JSON-LD puts the number on the far side of the key, so the noun never
# follows it and CLAIM cannot see it. This rule is what fixes tools.html's
# "numberOfItems": 562 and index.html's CollectionPage count.
JSONLD_NO = re.compile(r'("numberOfItems"\s*:\s*)(\d{3,4})(?=\s*[,}])')

# Named chrome can show a bare number with no following noun. Keep this in the
# canonical synchroniser, rather than a second design fixer.
#   heroToolCount    — the home page's hero badge
#   exploreCount     — the heading over the catalogue list
#   footerTotalCards — the "N Tools Available" stat in the home footer. Its
#     noun lives in the next <span>, so CLAIM can never reach it: the number
#     sat at 1205 for a release while the catalogue held 1206.
# (`count-all` used to be here: the id of the home page's "All tools" filter
# pill back when the page mounted live cards. The pills went with the grid on
# 2026-09-21; the pattern stayed until the next change to this file, because a
# pattern for an id nothing ships is worse than no pattern — it hides the fact
# that the element is gone.)
CHROME_COUNT = re.compile(
    r"""(\bid\s*=\s*["'](?:heroToolCount|exploreCount|footerTotalCards)["'][^>]*>\s*)(\d{3,4})\b""",
    re.IGNORECASE,
)

# "708 of them" and "alongside the other 1164" — count claims where the
# noun is replaced by an anaphor. Both appear in the live site copy.
OF_THEM = re.compile(r"(?<![\d.,])(\d{3,4})(?=\s+of\s+them\b)", re.IGNORECASE)
ALONGSIDE_OTHER = re.compile(
    r"(?<![\d.,])(alongside\s+the\s+other\s+)(\d{3,4})\b", re.IGNORECASE
)
# "All 708 share one DOM" — a count claim with no recognisable noun. The
# number still describes the catalogue (every card shares the catalogue's
# DOM), so the count is the same and the claim is stale when the catalogue
# size changes. The pattern is narrow on purpose — "share" and "DOM" are
# not otherwise a count-trigger.
SHARE_ONE_DOM = re.compile(
    r"(?<![\d.,])(all\s+|every\s+card\s+|every\s+tool\s+)?(\d{3,4})(?=\s+(?:share|shares|sharing)\s+one\s+DOM\b)",
    re.IGNORECASE,
)


def true_category_count() -> int:
    """The canonical category count — the number of .html files in categories/.

    Derived, never typed: a category page that exists is a category the site
    offers, and index.html links exactly these.
    """
    if not os.path.isdir(CATEGORIES):
        return 0
    return len([f for f in os.listdir(CATEGORIES) if f.endswith(".html")])


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


def fix_text(text: str, n: int, cats: int) -> tuple[str, list[str]]:  # noqa: C901
    """Rewrite every stale count claim. Returns (new_text, descriptions)."""
    changes: list[str] = []

    def claim_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        found = m.group(1)
        # "1,206" is one number written in grouped style, not two.
        plain = found.replace(",", "")
        if plain == str(n):
            return m.group(0)
        if not _plausible(int(plain)):
            return m.group(0)
        # Keep the style the claim was written in: a grouped claim stays
        # grouped ("1,206" -> "1,250"), an unseparated one stays bare.
        written = f"{n:,}" if "," in found else str(n)
        changes.append(f"{m.group(0).strip()!r} -> {written}")
        return written + m.group(2) + m.group(3) + m.group(0)[m.end(3) - m.start():]

    def category_repl(m: re.Match) -> str:
        if _is_exempt(text, m.start(), m.end()):
            return m.group(0)
        if m.group(1) == str(cats):
            return m.group(0)
        # Plausibility floor, for the same reason CLAIM has one: not every
        # "<N> categories" is a claim about the catalogue. tools.html and
        # embed.html carry every card's description verbatim, and Yahtzee's
        # says "Score in 13 categories" — about dice, not about the site.
        # Rewriting that to 29 would be vandalism of card copy. A real
        # category count has never been below 20; the dice idiom is 13.
        if not 20 <= int(m.group(1)) <= 99:
            return m.group(0)
        written = str(cats) + m.group(2)
        changes.append(f"{m.group(0).strip()!r} -> {written.strip()!r}")
        return written

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
        (CATEGORY_CLAIM, category_repl),
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
    ap.add_argument("command", nargs="?", choices=["count"],
                    help="print the canonical tool count — the number of "
                         ".html files in cards/ — and exit (the single source "
                         "of truth every other count is derived from)")
    args = ap.parse_args()

    if args.command == "count":
        print(true_count())
        return 0

    n = true_count()
    cats = true_category_count()
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

        new, changes = fix_text(head, n, cats)
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
