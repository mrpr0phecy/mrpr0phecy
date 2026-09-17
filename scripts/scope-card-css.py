#!/usr/bin/env python3
"""scope-card-css.py — confine a card fragment's <style> rules to its own root.

Every card is injected into ONE shared document on index.html, so a fragment
that ships a bare `.card { background: white }` or `.card-header { … }` rule
restyles all ~1,200 host cards around it the moment it scrolls into view —
the grid "breaks" with no error anywhere. tool.html hides the bug (one card
per document), which is why it survives review.

This script rewrites a fragment so that:

  * every selector in every <style> block is prefixed with `#<root-id> `
    (selectors inside @keyframes / @font-face are left alone; @media and
    @supports blocks are recursed into);
  * a selector that targets the fragment's own root (`.card` when the root
    element is `<div class="card" id="…">`) becomes `#<root-id>` itself;
  * if the fragment has no single root element, one is added:
    `<div id="<slug>-root"> … </div>` around the markup (styles and scripts
    stay outside the wrapper, as the loader strips them anyway).

Usage:
    python3 scripts/scope-card-css.py <slug> [--root-id ID] [--root-class CLASS]
        [--dry-run]

  --root-id      id of the element that wraps the tool's markup. Default:
                 the id on the first element of the fragment if that element
                 wraps everything; otherwise `<slug>-root` (wrapper added).
  --root-class   class on that root element which the fragment's own CSS
                 uses to style it (e.g. `card`). Rules on that class are
                 rewritten to the id; the class is removed from the root so
                 the host's `.card` styling no longer double-applies.
"""
from __future__ import annotations
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

STYLE_RE = re.compile(r"(<style[^>]*>)([\s\S]*?)(</style>)", re.I)
SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.I)
NO_PREFIX_AT = ("@keyframes", "@-webkit-keyframes", "@font-face", "@property",
                "@import", "@charset", "@page", "@counter-style")


def split_top_level(s: str, sep: str = ",") -> list[str]:
    """Split on `sep` ignoring separators inside (), [] or quotes."""
    out, depth, buf, quote = [], 0, [], None
    for ch in s:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == sep and depth == 0:
            out.append("".join(buf)); buf = []
        else:
            buf.append(ch)
    out.append("".join(buf))
    return out


def prefix_selector(sel: str, root_id: str, root_class: str | None, sandbox_id: str | None = None) -> str:
    s = sel.strip()
    if not s:
        return sel
    lead = sel[: len(sel) - len(sel.lstrip())]
    # already scoped (idempotent re-runs), or anchored on the host's own
    # sandbox id (`#card-<slug>`, the element the loader renders into — it
    # is the root's PARENT, so it must not be prefixed)
    if s.startswith("#" + root_id) or (sandbox_id and s.startswith("#" + sandbox_id)):
        return sel
    if root_class:
        cls = re.compile(r"\." + re.escape(root_class) + r"(?![\w-])")
        # Selector targets the root element itself (".card", ".card:hover",
        # ".card::before", ".card.active", ".card > x"): the id IS the root.
        if cls.match(s):
            return lead + cls.sub("#" + root_id, s, count=1)
        # ".card" appears deeper ("body .card x") — replace and scope.
        s = cls.sub("#" + root_id, s)
    # html/body/:root selectors: the card has no body of its own; the
    # nearest thing is the root element.
    s = re.sub(r"^(html\s+body|html|body|:root)(?![\w-])", "#" + root_id, s)
    if s.startswith("#" + root_id):
        return lead + s
    return lead + "#" + root_id + " " + s


COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")


def scope_css(css: str, root_id: str, root_class: str | None, sandbox_id: str | None = None) -> str:
    out, i, n = [], 0, len(css)
    while i < n:
        # Skip whitespace + comments before a rule, copying them verbatim so
        # they never end up inside a selector list.
        m = re.compile(r"(?:\s|/\*[\s\S]*?\*/)*").match(css, i)
        if m and m.end() > i:
            out.append(css[i:m.end()]); i = m.end()
            if i >= n:
                break
        if css[i] == "}":          # stray closer (tolerated), copy through
            out.append("}"); i += 1
            continue
        j = css.find("{", i)
        if j < 0:
            out.append(css[i:]); break
        prelude = css[i:j]
        if "/*" in prelude:  # comment between selectors — drop it from the selector text
            prelude = COMMENT_RE.sub("", prelude)
        # find matching close brace
        depth, k = 1, j + 1
        while k < n and depth:
            c = css[k]
            if c == "{": depth += 1
            elif c == "}": depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        pstrip = prelude.strip()
        if pstrip.startswith("@"):
            if pstrip.lower().startswith(NO_PREFIX_AT):
                out.append(prelude + "{" + body + "}")
            else:  # @media, @supports, @container, @layer — recurse
                out.append(prelude + "{" + scope_css(body, root_id, root_class, sandbox_id) + "}")
        else:
            # keep leading whitespace/newlines of the prelude for tidy diffs
            lead = prelude[: len(prelude) - len(prelude.lstrip())]
            sels = split_top_level(prelude.strip())
            scoped = ",".join(prefix_selector(x, root_id, root_class, sandbox_id) for x in sels)
            out.append(lead + scoped + " {" + body + "}" if not prelude.rstrip().endswith(" ") else lead + scoped + " {" + body + "}")
        i = k
    return "".join(out)


def first_element(html_no_style_script: str):
    m = re.search(r"<([a-zA-Z][\w-]*)([^>]*)>", html_no_style_script)
    return m


def wraps_everything(fragment: str, tag: str, start: int) -> bool:
    """Does the element opened at `start` close only at the very end?"""
    depth, i = 0, start
    open_re = re.compile(r"<(/?)(" + re.escape(tag) + r")(?=[\s>/])[^>]*>", re.I)
    for m in open_re.finditer(fragment, start):
        if m.group(1) == "":
            if not m.group(0).endswith("/>"):
                depth += 1
        else:
            depth -= 1
            if depth == 0:
                rest = fragment[m.end():].strip()
                return rest == ""
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--root-id")
    ap.add_argument("--root-class")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    path = os.path.join(CARDS, a.slug + ".html")
    src = open(path, encoding="utf-8").read()

    # Markup with <style>/<script> blanked (same length) so offsets match.
    blank = STYLE_RE.sub(lambda m: " " * len(m.group(0)), src)
    blank = SCRIPT_RE.sub(lambda m: " " * len(m.group(0)), blank)

    root_id = a.root_id
    root_class = a.root_class
    add_wrapper = False
    fe = first_element(blank)
    if fe is None:
        sys.exit("no markup found")
    attrs = fe.group(2)
    idm = re.search(r'\bid="([^"]+)"', attrs)
    if root_id is None:
        if idm and wraps_everything(blank, fe.group(1), fe.start()):
            root_id = idm.group(1)
        else:
            root_id = a.slug + "-root"
            add_wrapper = True
    elif idm is None or idm.group(1) != root_id:
        add_wrapper = True

    out = src
    if root_class and not add_wrapper:
        # drop the shared class from the root so host `.card` styling stops
        # applying to the inner element; its own rules now use the id
        cm = re.search(r'\sclass="([^"]*)"', attrs)
        if cm:
            classes = [c for c in cm.group(1).split() if c != root_class]
            new_attrs = attrs.replace(cm.group(0), (' class="%s"' % " ".join(classes)) if classes else "")
            out = out[:fe.start()] + "<" + fe.group(1) + new_attrs + ">" + out[fe.end():]

    # Only rewrite <style> blocks that are real markup — never ones sitting
    # inside a <script> (print/download templates embed whole documents).
    scripts = [(m.start(), m.end()) for m in SCRIPT_RE.finditer(out)]
    def in_script(pos):
        return any(s <= pos < e for s, e in scripts)
    out = STYLE_RE.sub(lambda m: m.group(0) if in_script(m.start())
                       else m.group(1) + scope_css(m.group(2), root_id, root_class, 'card-' + a.slug) + m.group(3), out)

    if add_wrapper:
        # Wrap only the markup: find first/last non-style/script content.
        blank2 = STYLE_RE.sub(lambda m: " " * len(m.group(0)), out)
        blank2 = SCRIPT_RE.sub(lambda m: " " * len(m.group(0)), blank2)
        first = re.search(r"\S", blank2).start()
        # Close the wrapper after the LAST markup character that is followed
        # only by <style>/<script> blocks (and whitespace/comments).
        last = len(blank2.rstrip())
        tail = out[last:]
        while True:
            m = re.match(r"\s*(?:<!--[\s\S]*?-->\s*)*(?:<style[^>]*>[\s\S]*?</style>|<script[^>]*>[\s\S]*?</script>)\s*$", out[last:] if False else "", re.I)
            break
        # walk back over trailing style/script blocks
        blocks = sorted([(m.start(), m.end()) for m in STYLE_RE.finditer(out)] +
                        [(m.start(), m.end()) for m in SCRIPT_RE.finditer(out)])
        end = len(out)
        for s, e in reversed(blocks):
            between = out[e:end]
            if re.fullmatch(r"(?:\s|<!--[\s\S]*?-->)*", between):
                end = s
            else:
                break
        last = len(out[:end].rstrip())
        if last <= first:
            last = len(blank2.rstrip())
        out = out[:first] + '<div id="%s">\n' % root_id + out[first:last] + "\n</div>" + out[last:]

    if a.dry_run:
        sys.stdout.write(out)
        return 0
    if out != src:
        open(path, "w", encoding="utf-8").write(out)
        print(f"scoped {a.slug} -> #{root_id}" + (" (wrapper added)" if add_wrapper else ""))
    else:
        print(f"{a.slug}: no change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
