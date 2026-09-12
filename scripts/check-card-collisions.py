#!/usr/bin/env python3
"""check-card-collisions.py — guard against cross-card top-level name collisions.

A card is a fragment injected into a SHARED document (index.html loads all
1128 into one DOM), so every card's top-level declarations land in the same
global scope. When two cards declare the same name with let/const/var (or
any let/const against a function), the second script to load dies with a
SyntaxError — the whole tool is dead in the catalogue while it works fine on
tool.html. That class of silent production death is what this guard exists
for.

Declaration kinds that merely OVERWRITE each other (function/function,
var/var, var/function) do not throw; they are reported as WARN (a later
loaded card hijacks the earlier one's same-named function), which is tracked
separately as the IIFE-wrap migration. HARD collisions (SyntaxError) FAIL.

Detection is mask-aware: comments, string literals and template-literal TEXT
are stripped before scanning, so markup like `<div style="...">` inside a
template string can neither create phantom declarations nor be mistaken for
code. (${...} expressions inside templates are code and are scanned.)

Soft (overwrite) collisions are a known, separately-tracked migration item
(the IIFE-wrap of card scripts); they are summarised, not listed, to keep
the gate readable. Pass --verbose to list them.

Usage:
    python3 scripts/check-card-collisions.py [--verbose]
"""
from __future__ import annotations
import collections
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", re.I)
DECL_RE = re.compile(
    r"^(let|var|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)"
    r"|^(function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)", re.M)


def mask_spans(code: str) -> list[list[int]]:
    """Spans of masked (non-code) characters: comments, string literal
    contents, template-literal text. ${...} regions stay unmasked and their
    inner strings are masked recursively. Length-preserving."""
    spans: list[list[int]] = []
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if c == "/" and i + 1 < n and code[i + 1] == "/":
            j = i
            while j < n and code[j] != "\n":
                j += 1
            spans.append([i, j]); i = j
        elif c == "/" and i + 1 < n and code[i + 1] == "*":
            j = i + 2
            while j + 1 < n and not (code[j] == "*" and code[j + 1] == "/"):
                j += 1
            j = min(j + 2, n)
            spans.append([i, j]); i = j
        elif c in ('"', "'"):
            q = c
            j = i + 1
            while j < n:
                if code[j] == "\\":
                    j += 2; continue
                if code[j] == q or code[j] == "\n":
                    break
                j += 1
            spans.append([i, min(j + 1, n)]); i = j + 1
        elif c == "`":
            j = i + 1
            while j < n:
                cj = code[j]
                if cj == "\\":
                    j += 2; continue
                if cj == "`":
                    break
                if cj == "$" and j + 1 < n and code[j + 1] == "{":
                    depth, k = 1, j + 2
                    while k < n and depth:
                        if code[k] == "{":
                            depth += 1
                        elif code[k] == "}":
                            depth -= 1
                        k += 1
                    for s2, e2 in mask_spans(code[j + 2:k - 1]):
                        spans.append([j + 2 + s2, j + 2 + e2])
                    j = k
                    continue
                j += 1
            # mask the template TEXT between ${...} regions
            seg, k = i, i + 1
            while k <= j:
                if code[k] == "$" and k + 1 <= j and code[k + 1] == "{":
                    if k - 1 > seg:
                        spans.append([seg, k])
                    depth, m2 = 1, k + 2
                    while m2 < n and depth:
                        if code[m2] == "{":
                            depth += 1
                        elif code[m2] == "}":
                            depth -= 1
                        m2 += 1
                    seg, k = m2, m2
                else:
                    k += 1
            if j + 1 > seg:
                spans.append([seg, j + 1])
            i = j + 1
        else:
            i += 1
    spans.sort()
    merged: list[list[int]] = []
    for s, e in spans:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return merged


def unmasked_code(code: str) -> str:
    res = list(code)
    for s, e in mask_spans(code):
        for k in range(s, e):
            if res[k] != "\n":
                res[k] = " "
    return "".join(res)


def hard_conflict(kinds) -> bool:
    # same-scope redeclaration rules for classic scripts:
    #   function/function, var/var, var/function  -> silent overwrite (soft)
    #   anything involving let/const               -> SyntaxError (hard)
    return not set(kinds) <= {"var", "function"}


def main() -> int:
    if not os.path.isdir(CARDS):
        print("NOTE: no cards/ directory — skipped")
        return 0

    groups: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    for fn in sorted(os.listdir(CARDS)):
        if not fn.endswith(".html"):
            continue
        try:
            src = open(os.path.join(CARDS, fn), encoding="utf-8",
                       errors="replace").read()
        except OSError:
            continue
        for m in SCRIPT_RE.finditer(src):
            code = unmasked_code(m.group(1))
            for dm in DECL_RE.finditer(code):
                if dm.group(1):
                    kind, name = dm.group(1), dm.group(2)
                else:
                    kind, name = dm.group(3), dm.group(4)
                groups[name].append((fn, kind))

    hard: list[tuple[str, list[str]]] = []
    soft: list[tuple[str, list[str]]] = []
    for name, entries in groups.items():
        files = sorted(set(f for f, _ in entries))
        if len(files) < 2:
            continue
        per_file: dict[str, set[str]] = collections.defaultdict(set)
        for f, k in entries:
            per_file[f].add(k)
        cross_hard = any(
            hard_conflict(list(per_file[files[i]] | per_file[files[j]]))
            for i in range(len(files)) for j in range(i + 1, len(files)))
        (hard if cross_hard else soft).append((name, files))

    print(f"collisions: {len(hard)} hard (SyntaxError), {len(soft)} soft (silent overwrite, "
          f"tracked separately — pass --verbose to list)")
    if "--verbose" in sys.argv:
        for w, files in soft:
            print(f"  WARN soft: {w} -> {', '.join(files)}")
    for h, files in hard:
        print(f"  FAIL hard: {h} -> {', '.join(files)} — rename the name in all "
              f"but one of these cards (prefix it with the card id)")

    if hard:
        print(f"CARD COLLISIONS FAILED — {len(hard)} name(s) would kill the "
              f"second-loaded card with a SyntaxError on the index.")
        return 1
    print("CARD COLLISIONS OK — no top-level name would throw in the shared DOM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
