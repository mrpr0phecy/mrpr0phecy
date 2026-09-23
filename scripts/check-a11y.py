#!/usr/bin/env python3
"""check-a11y.py — static accessibility guardrails for card fragments.

Cheap, zero-dependency checks that have all caught real regressions here:

  1. `<label for="x">` must point at an element that exists in the same
     fragment. Button groups have no focusable target — use
     `id="x-label"` + `role="group" aria-labelledby="x-label"` instead
     (OPEN item 4, fixed 2026-09-04).
  2. `<img>` must carry an `alt` attribute (empty alt is fine for decoration).
  3. `target="_blank"` must carry `rel="noopener"`.
  4. A click handler belongs on something the keyboard can reach. A `<div>` or
     `<span>` with `onclick=` and no `role=`/`tabindex=` cannot be focused, so
     it cannot be activated without a mouse at all — the visitor using a
     keyboard sees a row that does nothing, and a screen reader is told nothing
     is there. Eighteen of these were live on 2026-09-23 (trigonometry's six
     quick-nav pills, ai-toolbox's four trending rows, linux-regex-tester's five
     pattern chips, xmas-card-writer-assistant's three alternative tiles); the
     fix is `<button type="button">`, which is focusable, announces itself and
     fires click on Enter and Space for free. The first three checks are
     statically resolvable; this one is too — the handler has to be in the
     markup.

FAIL (exit 1) on any hit. Sparse-checkout safe: it only reads `cards/`
and the repo-root pages that are on disk.

Usage:
    python3 scripts/check-a11y.py                 # root pages + cards/
    python3 scripts/check-a11y.py FILE [FILE …]   # named files (tests)
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# A click handler on one of these is a click handler on something the keyboard
# already reaches (a real button, a link, a form control, or a <summary>).
NATIVE_CLICK = {
    "a", "button", "input", "select", "textarea", "option", "label",
    "summary", "details",
}
CLICK_ATTR = re.compile(r"\son(?:click|mousedown|mouseup|pointerdown|pointerup)\s*=", re.I)
REACHABLE = re.compile(r"\b(?:role|tabindex)\s*=", re.I)
TAG = re.compile(r"""(?is)<([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>""")
# A fragment's scripts build markup as strings — that markup is not in the
# fragment and is not this check's business, but its braces, quotes and
# `onclick=` calls are. Blank each block in place so line numbers stay honest.
SCRIPT = re.compile(r"(?is)(<script\b[^>]*>)(.*?)(</script>)")


def files() -> list[str]:
    out = [os.path.join(ROOT, f) for f in sorted(os.listdir(ROOT)) if f.endswith(".html")]
    if os.path.isdir(CARDS):
        out += [os.path.join(CARDS, f) for f in sorted(os.listdir(CARDS)) if f.endswith(".html")]
    return out


def click_targets(t: str) -> list[tuple[int, str, str]]:
    """(line, tag, attrs) for every click handler on an unreachable element."""
    out = []
    masked = SCRIPT.sub(lambda m: m.group(1) + " " * len(m.group(2)) + m.group(3), t)
    for m in TAG.finditer(masked):
        tag, attrs = m.group(1).lower(), m.group(2)
        if tag in NATIVE_CLICK:
            continue
        if not CLICK_ATTR.search(attrs) or REACHABLE.search(attrs):
            continue
        line = masked[: m.start()].count("\n") + 1
        out.append((line, tag, " ".join(attrs.split())[:80]))
    return out


fails: list[str] = []

paths = [os.path.join(ROOT, a) if not os.path.isabs(a) else a for a in sys.argv[1:]] or files()

for path in paths:
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

    for line, tag, attrs in click_targets(t):
        fails.append(
            f"{rel}:{line}: <{tag}> has a click handler but cannot be focused — "
            f"use <button type=\"button\">, or add role= and tabindex= with a key "
            f"handler ({attrs})"
        )

print(f"a11y scan: {len(paths)} files")
for f in fails:
    print(f"  FAIL: {f}")
if fails:
    print(f"A11Y FAILED ({len(fails)} problem(s)).")
    sys.exit(1)
