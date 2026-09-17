#!/usr/bin/env python3
"""check-card-css-leaks.py — a card's CSS must not restyle the host page.

Every card is a fragment injected into ONE shared document on index.html,
and its <style> blocks are appended as-is. A fragment that ships a bare

    .card { background: white; max-width: 500px }
    .card-header { … }   body { … }   .dashboard .card { … }

therefore restyles every one of the ~1,200 host cards around it the moment
it scrolls into view — white grids, collapsed headers, cards that "vanish"
— with no error in any console. tool.html (one card per document) hides
it, which is how it gets past review. This guard fails on selectors that
target the host shell's own class names or the document itself unless
they are scoped under an id.

Selectors that legitimately live in a card's own namespace (`#slug-root
.card`, `#card-slug .card-header`) pass. @keyframes / @font-face bodies are
ignored. <style> blocks inside <script> (print/download templates) are
ignored.

Usage:
    python3 scripts/check-card-css-leaks.py            # exit 1 on any leak
    python3 scripts/check-card-css-leaks.py --verbose  # list every rule
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

STYLE_RE = re.compile(r"<style[^>]*>([\s\S]*?)</style>", re.I)
SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.I)
COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")

# Host classes from index.html's card shell + page chrome. A bare rule on
# any of these rewrites the whole grid.
HOST_CLASSES = {
    "card", "card-header", "card-header-info", "card-content", "card-actions",
    "card-action-btn", "card-maximize-btn", "card-footer", "card-sandbox",
    "card-sandbox-content", "card-skeleton", "card-cat-badge", "card-pending",
    "dashboard", "main-header", "sticky-command-bar", "cat-pill", "toolbox",
    "cool-loader", "rating-btn", "embed-btn", "loaded", "visible",
}
# Document-level selectors: a fragment has no body/html of its own.
DOC_RE = re.compile(r"^(html|body|:root)(?![\w-])")
NO_SCAN_AT = ("@keyframes", "@-webkit-keyframes", "@font-face", "@property",
              "@import", "@charset", "@page", "@counter-style")


def rules(css: str, depth: int = 0):
    """Yield (selector_list, body) for every non-at rule, recursing @media etc."""
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            return
        prelude = COMMENT_RE.sub("", css[i:j]).strip()
        d, k = 1, j + 1
        while k < n and d:
            if css[k] == "{":
                d += 1
            elif css[k] == "}":
                d -= 1
            k += 1
        body = css[j + 1:k - 1]
        if prelude.startswith("@"):
            # @media print is the one place a body-wide rule is legitimate
            # (hide the page, print just the tool's sheet) — it never
            # affects what is on screen.
            if re.match(r"@media\s+print\b", prelude, re.I):
                pass
            elif not prelude.lower().startswith(NO_SCAN_AT):
                yield from rules(body, depth + 1)
        elif prelude:
            yield prelude, body
        i = k


def leaking_selectors(selector_list: str):
    out = []
    for sel in re.split(r",(?![^()\[\]]*[)\]])", selector_list):
        s = sel.strip()
        if not s:
            continue
        if s.startswith("#"):          # id-anchored: scoped, fine
            continue
        if DOC_RE.match(s):
            out.append(s)
            continue
        # first compound selector: anything before a combinator
        first = re.split(r"[\s>+~]", s, 1)[0]
        classes = set(re.findall(r"\.([\w-]+)", first))
        if classes & HOST_CLASSES:
            out.append(s)
    return out


def main() -> int:
    verbose = "--verbose" in sys.argv
    bad = {}
    for f in sorted(os.listdir(CARDS)):
        if not f.endswith(".html"):
            continue
        src = open(os.path.join(CARDS, f), encoding="utf-8").read()
        # blank <script> bodies so embedded print templates are not scanned
        src = SCRIPT_RE.sub(lambda m: " " * len(m.group(0)), src)
        for m in STYLE_RE.finditer(src):
            for sel, body in rules(m.group(1)):
                leaks = leaking_selectors(sel)
                if leaks:
                    bad.setdefault(f, []).append((leaks, body.strip().replace("\n", " ")[:70]))
    if not bad:
        print("CARD CSS OK — no fragment restyles the host shell (.card, body, …)")
        return 0
    print(f"CARD CSS LEAKS in {len(bad)} card(s) — these rules restyle the whole home page:")
    for f, items in bad.items():
        print(f"  {f}")
        for leaks, body in (items if verbose else items[:3]):
            print(f"      {', '.join(leaks)}  {{ {body} }}")
        if not verbose and len(items) > 3:
            print(f"      … {len(items) - 3} more (--verbose)")
    print("\nFix: scope the rules under the card's root id, e.g.\n"
          "     python3 scripts/scope-card-css.py <slug> [--root-class card]")
    return 1


if __name__ == "__main__":
    sys.exit(main())
