#!/usr/bin/env python3
"""check-a11y.py — static accessibility guardrails for card fragments.

Cheap, zero-dependency checks that have all caught real regressions here:

  1. `<label for="x">` must point at an element that exists in the same
     fragment. Button groups have no focusable target — use
     `id="x-label"` + `role="group" aria-labelledby="x-label"` instead
     (OPEN item 4, fixed 2026-09-04).
  2. `<img>` must carry an `alt` attribute (empty alt is fine for decoration).
  3. `target="_blank"` must carry `rel="noopener"`.

FAIL (exit 1) on any hit. Sparse-checkout safe: it only reads `cards/`
and the repo-root pages that are on disk.
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

fails: list[str] = []


def files() -> list[str]:
    out = [os.path.join(ROOT, f) for f in sorted(os.listdir(ROOT)) if f.endswith(".html")]
    if os.path.isdir(CARDS):
        out += [os.path.join(CARDS, f) for f in sorted(os.listdir(CARDS)) if f.endswith(".html")]
    return out


for path in files():
    rel = os.path.relpath(path, ROOT)
    with open(path, encoding="utf-8", errors="replace") as fh:
        t = fh.read()

    ids = set(re.findall(r'\bid="([^"]+)"', t))
    for target in re.findall(r"(?is)<label[^>]*\bfor=\"([^\"]+)\"", t):
        # Skip template-literal ids built at runtime (`id="${row.id}"`).
        if "${" in target or "'+" in target:
            continue
        if target not in ids:
            fails.append(f"{rel}: <label for=\"{target}\"> points at no element")

    for tag in re.findall(r"(?is)<img\b[^>]*>", t):
        if not re.search(r"(?is)\balt\s*=", tag):
            fails.append(f"{rel}: <img> without alt: {tag[:70]}")

    for tag in re.findall(r'(?is)<a\b[^>]*target="_blank"[^>]*>', t):
        if "noopener" not in tag:
            fails.append(f"{rel}: target=_blank without rel=noopener: {tag[:70]}")

print(f"a11y scan: {len(files())} files")
for f in fails:
    print(f"  FAIL: {f}")
if fails:
    print(f"A11Y FAILED ({len(fails)} problem(s)).")
    sys.exit(1)
print("A11Y OK.")
