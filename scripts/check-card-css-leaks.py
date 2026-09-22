#!/usr/bin/env python3
"""check-card-css-leaks.py — a card's CSS must not restyle the shell page.

tool.html injects one card fragment into its own document and re-creates the
fragment's <style> blocks inside it (see the mount code there). A <style>
element's rules apply to the whole document wherever the element sits, so a
fragment that ships a bare

    .nav-btn:hover { … }   body { … }   .related-card { … }

restyles the page's own chrome — the Share/Embed nav, the related-tools grid,
the footer, the risk notice — with no error in any console. The card itself
still looks right, which is why it survives review: nothing points at the
rule that is doing it. This guard fails on selectors that target the shell's
own class names or the document itself unless they are scoped under an id.

The guarded class names are READ OUT OF tool.html — its markup, its
className/classList calls and its own <style> preludes — not curated here.
They used to be a hardcoded list written for the home-page card grid, which
was deleted on 2026-09-21; by 2026-09-22 eighteen of the twenty-five names
matched no shipped surface, while every class the live shell actually renders
(.nav-btn, .top-nav, .related-card, .risk-notice, .page-footer, …) went
unguarded. punctuation-guide.html was restyling tool.html's nav button with a
bare `.nav-btn:hover` throughout that time. A list of live names cannot be
maintained by hand; it is derived, and a derivation that comes back too small
is a hard failure rather than a quietly weaker guard.

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
# CSS a card injects at runtime: `style.textContent = \`…\`` (or a quoted
# string). Those rules land in the shared document exactly like a <style>
# block does — they are simply invisible to a scan that only reads tags. Five
# cards were still restyling the host grid this way when this was added.
INJECT_RE = re.compile(r"textContent\s*=\s*(`[^`]*`|'[^']*'|\"[^\"]*\")", re.S)

# The pages that inject card fragments. tool.html is the only one — the home
# page stopped mounting the catalogue on 2026-09-21, and nothing else fetches a
# card into a live document.
SHELL_PAGES = ("tool.html",)
# Classes the shell creates in script rather than writing in markup or CSS.
# Kept deliberately tiny: anything readable from the page is read from the page.
SHELL_EXTRA = {"card"}      # contentDiv.className = 'card' (JS scope hook)
# Below this, the derivation is broken (file moved? markup rewritten?) and a
# guard that silently guards nothing is worse than no guard.
SHELL_MIN = 15


def shell_classes() -> set:
    """Class names tool.html renders, derived from the page itself."""
    found = set(SHELL_EXTRA)
    for name in SHELL_PAGES:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        src = open(path, encoding="utf-8").read()
        for m in re.finditer(r'class="([^"]*)"', src):
            found.update(m.group(1).split())
        for m in re.finditer(r"className\s*=\s*['\"]([^'\"]+)[\'\"]", src):
            found.update(m.group(1).split())
        for m in re.finditer(r"classList\.(?:add|toggle|remove)\(([^)]*)\)", src):
            found.update(re.findall(r"['\"]([\w-]+)['\"]", m.group(1)))
        for _, css in css_sources(src):
            for prelude, _body in rules(css):
                found.update(re.findall(r"\.([\w-]+)", prelude))
    return {c for c in found if re.fullmatch(r"[A-Za-z][\w-]*", c or "")}


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
        # First compound selector: anything before a combinator. A rule leaks
        # only if that compound can match an element of the shell, so EVERY
        # class in it has to be a shell class. `.ig-btn.gold` is a card
        # decorating its own button; `.nav-btn.gold` is rewriting the shell's
        # tip link, which carries both names. Intersecting (any class matches)
        # flags the first one too, and a guard that cries wolf gets switched
        # off — the two are one class apart and only one of them is a bug.
        first = re.split(r"[\s>+~]", s, 1)[0]
        classes = set(re.findall(r"\.([\w-]+)", first))
        if classes and classes <= HOST_CLASSES:
            out.append(s)
    return out


def css_sources(src: str):
    """Yield (kind, css) for every chunk of CSS a card can put in the document.

    `style-tag` chunks come from the fragment's own <style> blocks. Script
    bodies are blanked for that pass so print/download templates are not
    scanned, and the CSS those templates *inject* is picked up separately by
    the `script-injected` pass, which reads the literals assigned to
    textContent.
    """
    blanked = SCRIPT_RE.sub(lambda m: " " * len(m.group(0)), src)
    for m in STYLE_RE.finditer(blanked):
        yield "style-tag", m.group(1)
    for m in INJECT_RE.finditer(src):
        css = m.group(1)[1:-1]
        if "{" in css:
            yield "script-injected", css


# Derived once, after the CSS helpers it needs. leaking_selectors() reads it at
# call time, so the definition order is only a readability question.
HOST_CLASSES = shell_classes()


def main() -> int:
    if len(HOST_CLASSES) < SHELL_MIN:
        print(f"CARD CSS CHECK BROKEN — deriving tool.html's classes found only "
              f"{len(HOST_CLASSES)} (expected >= {SHELL_MIN}). The guard would "
              f"pass everything; fix the derivation instead of trusting this run.")
        return 1
    verbose = "--verbose" in sys.argv
    bad = {}
    for f in sorted(os.listdir(CARDS)):
        if not f.endswith(".html"):
            continue
        src = open(os.path.join(CARDS, f), encoding="utf-8").read()
        for kind, css in css_sources(src):
            for sel, body in rules(css):
                leaks = leaking_selectors(sel)
                if leaks:
                    bad.setdefault(f, []).append(
                        (kind, leaks, body.strip().replace("\n", " ")[:70]))
    if not bad:
        print("CARD CSS OK — no fragment restyles the host shell (.card, body, …), "
              "in a <style> block or injected from script")
        return 0
    print(f"CARD CSS LEAKS in {len(bad)} card(s) — these rules restyle the "
          f"shell page (tool.html), not just the card:")
    kinds = set()
    for f, items in bad.items():
        print(f"  {f}")
        for kind, leaks, body in (items if verbose else items[:3]):
            kinds.add(kind)
            print(f"      [{kind}] {', '.join(leaks)}  {{ {body} }}")
        if not verbose and len(items) > 3:
            print(f"      … {len(items) - 3} more (--verbose)")
    print("\nFix:")
    if "style-tag" in kinds:
        print("  scope the <style> rules under the card's root id, e.g.\n"
              "     python3 scripts/scope-card-css.py <slug> [--root-class card]")
    if "script-injected" in kinds:
        print("  a stylesheet injected from <script> cannot be scoped by that helper:\n"
              "  delete the leaking rule, or wrap it in the card's own root id — and\n"
              "  only keep it if the card's own markup actually uses those classes.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
