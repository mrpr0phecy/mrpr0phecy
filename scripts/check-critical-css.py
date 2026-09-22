#!/usr/bin/env python3
"""check-critical-css.py — the main page's stylesheet split must stay safe.

index.html used to carry ~118 KB of CSS inline in one <style> block: every
navigation re-transferred ~19 KB gzip of it and the browser had to receive all
of it before it could paint. The styles now live in two cached files:

    home.css            first-paint rules — render-blocking on purpose
    home-deferred.css   rules for containers that are hidden at first paint —
                        fetched in parallel, applied after the first paint

That is only safe while the deferred half really does style nothing the first
paint can show. This guard enforces the properties the split depends on:

  1. no inline <style> block bigger than INLINE_BUDGET — re-inlining the sheet
     would silently restore the serial 19 KB that this change removed;
  2. home.css is linked render-blocking, home-deferred.css is linked without
     blocking (media="print" + onload swap) with a <noscript> fallback;
  3. the asset version is the same in every place that decides it —
     index.html's ?v= on all seven of its own assets, APP_VERSION in
     home-core.js (the page's script) and CACHE_VERSION in sw.js — so a page can
     never be served against another deploy's CSS or JS. The home page's own
     asset list changed on 2026-09-21 (home-app.js + home-features.js out;
     home-core.js + the shared list layer explore.css / explore.js /
     toolbox.js in), which is exactly the kind of change that ships a stale
     script if the three owners are not compared;
  4. every selector in home-deferred.css is confined to a container that is
     hidden at first paint (the HIDDEN list below) — anything else, e.g. a
     moved `.card` or `.hero-discovery` rule, fails loudly;
  5. the rules that HIDE those containers stay in home.css (they are the
     mechanism: a late stylesheet must never be what decides whether a panel
     is visible);
  6. every var() and animation name used in a file is defined in that file
     (deferred may also use tokens defined in home.css, which always loads);
  7. both files parse (balanced braces) and stay inside the size budgets;
  8. every inline <script> left in the document still parses. The split moved
     thousands of lines out of index.html and the generator owns the blocks
     around them, so a stray comment terminator is a realistic way to ship a
     dead first-screen bootstrap with no other symptom.

Usage:
    python3 scripts/check-critical-css.py            # exit 1 on any breach
    python3 scripts/check-critical-css.py --verbose  # print the whole split
"""
from __future__ import annotations

import gzip
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
HOME_CSS = os.path.join(ROOT, "home.css")
APP = os.path.join(ROOT, "home-core.js")
DEFERRED_CSS = os.path.join(ROOT, "home-deferred.css")
SW = os.path.join(ROOT, "sw.js")

# An inline block must stay a handful of declarations (the @font-face pair is
# ~0.8 KB). Anything larger is the sheet creeping back into the document.
INLINE_BUDGET = 4_000
# Budgets, in gzip bytes, for what the split produces now (~7.5 KB / ~2.8 KB).
# The numbers came down with the 2026-09-21 rewrite: two thirds of this sheet
# styled a card grid the main page no longer mounts. If a change trips these,
# either trim the CSS or raise the number on purpose — do not let the
# first-paint payload grow by accident.
# Raised from 11_000 on 2026-09-21: the launcher (command deck, jump row,
# featured/trending shelves, coarse-pointer targets) is first-paint CSS and
# measured 11,477 B gzip. 12_000 is the new ceiling, not a spare bucket.
HOME_CSS_GZIP_BUDGET = 12_000
DEFERRED_GZIP_BUDGET = 5_000
INDEX_GZIP_BUDGET = 18_000

# Containers that are hidden at first paint. Every selector in the deferred
# file must mention one of these tokens; the ones with a selector+declaration
# also pin the hide rule to the critical sheet. Tokens are matched ignoring
# case and hyphens, so `palette` covers `.palette-panel`.
#
# This list is the machine-readable version of "what is closed, hidden or far
# below the fold when the page paints". It was seven entries longer until
# 2026-09-21: the maximise modal, the directory view, the reader-mode toggle and
# the grid/list mode panels were all surfaces of the live card grid, and the
# main page stopped mounting tools (see scripts/tests/no-live-tools.test.js).
# Their rules went with them, so their entries have gone too — the checker
# fails on a stale entry precisely so this list cannot drift from the file.
HIDDEN = [
    ("palette", "the accent/theme popover, closed until asked for", None, None),
    ("theme-btn", "theme swatches inside that popover", None, None),
    ("contributions", "the support popover", None, None),
    ("contribution", "the giving rows inside the support popover", None, None),
    ("premium", "the sponsor-a-tool card inside the support popover", None, None),
    ("gratitude", "thank-you line inside the support popover", None, None),
    ("toolbox", "the toolbox popover, closed until the visitor opens it",
     ".toolbox", "display: none"),
    ("panel", "the shared popover shell", ".panel", "display: none"),
    ("popover", "closed popovers are hidden by the UA stylesheet", None, None),
    ("backdrop", "::backdrop only paints with an open popover/dialog", None, None),
    ("music-spotlight", "footer spotlight, an entire catalogue below the fold", None, None),
]

STYLE_BLOCK = re.compile(r"<style[^>]*>([\s\S]*?)</style>", re.I)
LINK_RE = re.compile(r"<link\b[^>]*>", re.I)
COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")
SELECTOR_SPLIT = re.compile(r",(?![^(]*\))")
VAR_USE = re.compile(r"var\(\s*(--[\w-]+)")
VAR_DEF = re.compile(r"(--[\w-]+)\s*:")
FUNC_CALL = re.compile(r"[a-zA-Z-]+\([^()]*\)")
KEYFRAMES = re.compile(r"@keyframes\s+([\w-]+)")
ANIM_KEYWORDS = {
    "none", "inherit", "initial", "unset", "revert", "revert-layer", "linear", "ease",
    "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "infinite", "normal",
    "reverse", "alternate", "alternate-reverse", "forwards", "backwards", "both", "running",
    "paused", "auto",
}
# At-rules whose block is a declaration list (no selectors inside).
DECL_AT = re.compile(
    r"^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style|viewport|"
    r"font-feature-values|font-palette-values)\b")
GROUP_AT = re.compile(r"^@(media|supports|layer|container|scope|document|starting-style)\b")


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def gzip_size(text: str) -> int:
    return len(gzip.compress(text.encode("utf-8"), 9))


def strip_comments(css: str) -> str:
    return COMMENT_RE.sub("", css)


def norm(text: str) -> str:
    """Tokens are compared ignoring case and hyphens."""
    return re.sub(r"[\s-]+", "", text).lower()


def split_selectors(prelude: str) -> list[str]:
    return [s.strip() for s in SELECTOR_SPLIT.split(prelude) if s.strip()]


def rules(css: str, prefix: str = "") -> list[tuple[str, str]]:
    """(selector, block-text) for every style rule, descending into group
    at-rules and native nesting (a nested selector keeps its parent's text, so
    `&:hover` inside `.palette-color` still reads as `.palette-color &:hover`)."""
    return _walk(strip_comments(css), prefix, [])


def _walk(css: str, prefix: str, out: list[tuple[str, str]]) -> list[tuple[str, str]]:
    i = 0
    start = 0
    while i < len(css):
        ch = css[i]
        if ch == ";":
            start = i + 1
        elif ch == "{":
            head = " ".join(css[start:i].split())
            close = matching_brace(css, i)
            inner = css[i + 1:close]
            if DECL_AT.match(head):
                pass                                    # @keyframes etc: no selectors
            elif GROUP_AT.match(head):
                _walk(inner, prefix, out)               # conditions wrap rules
            elif head:
                full = (prefix + (" " if prefix and not head.startswith("&") else "") + head).strip()
                # `&` in a nested selector refers to the parent text.
                full = full.replace("&", prefix).replace("  ", " ").strip()
                out.append((full, inner))
                _walk(inner, full, out)                 # native nesting
            i = close
            start = close + 1
        i += 1
    return out


def matching_brace(css: str, open_at: int) -> int:
    depth = 0
    for i in range(open_at, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(css) - 1


def bodies_of(css: str, selector: str) -> list[str]:
    """Every declaration block in `css` whose selector is exactly `selector`."""
    return [" ".join(body.split()) for sel, body in rules(css)
            if " ".join(sel.split()) == selector]


def animation_names(text: str) -> set[str]:
    names: set[str] = set()
    for m in re.finditer(r"(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)", strip_comments(text)):
        for item in m.group(1).split(","):
            # Drop function calls, then take the first token that cannot be a
            # duration, delay, easing keyword or iteration count.
            item = FUNC_CALL.sub(" ", item)
            for token in item.split():
                if re.match(r"^[\d.]+m?s$", token) or token in ANIM_KEYWORDS:
                    continue
                if re.match(r"^[A-Za-z_-][\w-]*$", token):
                    names.add(token)
                break
    return names


def main() -> int:
    problems: list[str] = []
    verbose = "--verbose" in sys.argv
    index = read(INDEX)
    css = read(HOME_CSS)
    deferred = read(DEFERRED_CSS)
    sw = read(SW)

    # 1 — no <style> block may grow back into a document-blocking payload
    for block in STYLE_BLOCK.findall(index):
        if len(block.encode()) > INLINE_BUDGET:
            problems.append(
                f"index.html has a {len(block.encode()):,} byte inline <style> block "
                f"(budget {INLINE_BUDGET:,}) — move it to home.css / home-deferred.css")

    # 2 — how the two files are linked
    links = LINK_RE.findall(index)
    blocking = [l for l in links if re.search(r'rel="stylesheet"', l) and "home.css" in l]
    async_links = [l for l in links if "home-deferred.css" in l and "media=" in l]
    noscript = re.search(r"<noscript>\s*<link[^>]*home-deferred\.css[^>]*>\s*</noscript>", index, re.I)
    if len(blocking) != 1 or "media=" in blocking[0]:
        problems.append("home.css must be linked exactly once, render-blocking: " +
                        (blocking[0] if blocking else "not linked at all"))
    if len(async_links) != 1 or 'media="print"' not in async_links[0] or "onload" not in async_links[0]:
        problems.append("home-deferred.css must be linked non-blocking "
                        '(media="print" + onload swap) so it cannot delay the first paint')
    if not noscript:
        problems.append("home-deferred.css needs a <noscript> fallback — "
                        "without JS the media swap never happens and panels stay unstyled")

    # 3 — one version across the page, the app and the service worker
    # The page's own versioned assets. home-app.js was in this alternation until
    # the launcher rewrite deleted it; explore.css/explore.js/toolbox.js are
    # checked for a ?v= just below, and their exact value is pinned against
    # CACHE_VERSION by scripts/tests/no-live-tools.test.js.
    linked = {m.group(2) for m in re.finditer(
        r'(home(?:-deferred)?\.css|risk-notices\.js)\?v=(\d+)', index)}
    app = re.search(r"const APP_VERSION = (\d+);", read(APP))
    cache_version = re.search(r"CACHE_VERSION\s*=\s*'v(\d+)-", sw)
    if not cache_version:
        problems.append("sw.js: CACHE_VERSION is not in the 'vN-date' form")
    if not app:
        problems.append("home-core.js: const APP_VERSION is missing — it is the page's "
                        "own script and its version has to be comparable with the "
                        "?v= on the page and CACHE_VERSION in sw.js")
    if cache_version and app and linked != {cache_version.group(1)} | {app.group(1)}:
        problems.append(
            f"version mismatch: index.html links ?v={sorted(linked) or 'nothing'}, "
            f"home-core.js APP_VERSION={app.group(1)}, sw.js CACHE_VERSION=v"
            f"{cache_version.group(1)} — bump them together so a page can never run "
            f"against another deploy's assets")
    # The page must load its list layer with the same ?v= as everything else:
    # a bare explore.js would be served from a previous deploy's cache and the
    # toolbox would silently be last deploy's toolbox.
    for asset in ("explore.css", "explore.js", "toolbox.js"):
        if f"{asset}?v=" not in index:
            problems.append(f"index.html must load {asset} with a ?v= — an unversioned "
                            f"{asset} can be served from another deploy's cache")
    for asset in ("explore.css", "explore.js", "toolbox.js", "home-core.js"):
        if not os.path.exists(os.path.join(ROOT, asset)):
            problems.append(f"{asset} is missing — the home page and every list page "
                            f"load it")

    # 4 — nothing the first paint can show may be styled by the deferred file
    tokens = [token for token, _why, _sel, _decl in HIDDEN]
    for selector, _body in rules(deferred):
        for part in split_selectors(selector):
            if not any(norm(token) in norm(part) for token in tokens):
                problems.append(
                    f"home-deferred.css styles something outside the hidden containers: {part[:90]}")
    deferred_text = strip_comments(deferred)
    for token, why, _sel, _decl in HIDDEN:
        if norm(token) not in norm(deferred_text):
            problems.append(f"HIDDEN list is stale: no rule in home-deferred.css mentions "
                            f"'{token}' ({why}) — drop the entry if the section is gone")

    # 5 — the hide rules themselves stay critical
    for token, why, selector, declaration in HIDDEN:
        if not selector:
            continue
        bodies = bodies_of(css, selector)
        if not bodies:
            problems.append(f"home.css must keep the rule that hides {selector} "
                            f"({why}) — a missing hide rule shows the container before "
                            f"the deferred styles arrive")
        elif not any(declaration in b for b in bodies):
            problems.append(f"home.css needs a {selector} rule containing '{declaration}' "
                            f"({why}); found: {bodies}")

    # 6 — a stylesheet must carry the tokens and keyframes it uses
    for name, text, fallback in (("home.css", css, ""), ("home-deferred.css", deferred, css)):
        pool = strip_comments(text + fallback)
        defined = set(VAR_DEF.findall(pool)) | set(
            m.group(1) for m in re.finditer(r"@property\s+(--[\w-]+)", pool))
        for var in sorted(set(VAR_USE.findall(strip_comments(text)))):
            if var not in defined:
                problems.append(f"{name} uses {var} but nothing defines it"
                                f"{'' if name == 'home.css' else ' in either stylesheet'}")
        keyframes = set(KEYFRAMES.findall(pool))
        for token in sorted(animation_names(text)):
            if token not in keyframes:
                problems.append(f"{name} animates with '{token}' but has no @keyframes for it")

    # 7 — sanity + budgets
    for name, text in (("home.css", css), ("home-deferred.css", deferred)):
        if text.count("{") != text.count("}"):
            problems.append(f"{name}: unbalanced braces ({text.count('{')} open, {text.count('}')} close)")
        if not text.endswith("\n"):
            problems.append(f"{name}: missing trailing newline")
        if text.count("/*") != text.count("*/"):
            problems.append(f"{name}: unterminated comment")
    budgets = [("home.css", gzip_size(css), HOME_CSS_GZIP_BUDGET),
               ("home-deferred.css", gzip_size(deferred), DEFERRED_GZIP_BUDGET),
               ("index.html", gzip_size(index), INDEX_GZIP_BUDGET)]
    for name, size, budget in budgets:
        if size > budget:
            problems.append(f"{name} is {size:,} B gzip, over its {budget:,} B budget — "
                            f"trim it, or raise the budget in this checker on purpose")

    # 8 — the document around the split must still be valid JavaScript
    scripts = re.findall(r"<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)</script>", index, re.I)
    runnable = [(attrs, body) for attrs, body in scripts
                if not re.search(r'type="(application/ld\+json|importmap|speculationrules)"', attrs, re.I)]
    node = subprocess.run(["which", "node"], capture_output=True).returncode == 0
    if not node:
        print(f"  note: node not available — {len(runnable)} inline script(s) not syntax-checked")
    for attrs, body in runnable:
        if not node:
            break
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as fh:
            fh.write(body)
            path = fh.name
        try:
            check = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        finally:
            os.unlink(path)
        if check.returncode != 0:
            problems.append(f"index.html inline <script{attrs.strip()[:40]}> does not parse: "
                            f"{' '.join(check.stderr.split())[:160]}")

    if problems:
        print("CRITICAL CSS FAILED — the main page's stylesheet split is unsafe:\n")
        for p in problems:
            print(f"  ✗ {p}")
        print("\nSee the header of this file for what each rule protects.")
        return 1

    if verbose:
        print(f"  linked: {blocking[0].strip()}")
        print(f"  async:  {async_links[0].strip()}")
        print(f"  version: v{app.group(1)} (stylesheets, scripts, bundle, sw.js)")
        print(f"  {len(rules(css))} rules critical, {len(rules(deferred))} deferred")
    share = len(deferred.encode()) * 100 // (len(css.encode()) + len(deferred.encode()))
    print(f"CRITICAL CSS OK — {len(css.encode()):,} B critical / {len(deferred.encode()):,} B deferred "
          f"({share}% of the sheet no longer blocks the first paint); first paint is "
          f"{gzip_size(index):,} B gzip HTML + {gzip_size(css):,} B gzip CSS in parallel "
          f"(was 32,803 B gzip in series)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
