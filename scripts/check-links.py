#!/usr/bin/env python3
"""check-links.py — internal links and image/script sources must resolve.

Every href= / src= in real markup of every tracked .html file is resolved
against the repository (links live on GitHub Pages from the repo root), and
the target must exist on disk. Broken internal links ship 404s to visitors,
so the gate is zero-tolerance: if this fails, fix the link or add the file.

Not checked (deliberately):
  * external http(s) URLs — they need network access and are audited by the
    egress/SEO tooling instead;
  * URL fragments (#anchors) and query strings — only the file is resolved;
  * attribute values inside <script> blocks — JS template strings
    (`href="${url}"`) are code, not links; the same markup-aware split used
    by check-egress.py;
  * links inside cards/ resolve against the SITE ROOT, not the cards/
    directory, because fragments are injected into index.html and tool.html
    (both at the root) and never navigated to as raw files;
  * sparse checkouts: only files on disk can be scanned.

Zero dependencies.
"""
from __future__ import annotations

import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_PREFIXES = (
    "http://", "https://", "//", "mailto:", "tel:", "javascript:",
    "data:", "sms:", "about:", "blob:", "secondlife:",
)
# Values that are obviously code or placeholders, not links.
SKIP_VALUES = {"...", "…"}
TEMPLATE_RE = re.compile(r"\$\{|\{\{")
SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


class _MarkupAttrs(HTMLParser):
    """Collect (attr, value) pairs from real markup, skipping <script> bodies."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.attrs: list[tuple[str, str]] = []
        self._script_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self._script_depth += 1
        elif not self._script_depth:
            self.attrs.extend(attrs)

    def handle_startendtag(self, tag, attrs):
        if tag != "script" and not self._script_depth:
            self.attrs.extend(attrs)

    def handle_endtag(self, tag):
        if tag == "script" and self._script_depth:
            self._script_depth -= 1


def _iter_html_files() -> list[str]:
    found: list[str] = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "ai-developer", "node_modules")]
        for fn in files:
            if fn.endswith(".html"):
                found.append(os.path.join(root, fn))
    return sorted(found)


def _resolve(page_rel: str, value: str) -> str:
    """Resolve a link value to a repo-root-relative filesystem path."""
    path = value.split("#", 1)[0].split("?", 1)[0]
    if not path:
        return ""
    if value.startswith("/"):
        return os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
    # Card fragments are injected at the site root by index.html/tool.html.
    base = ROOT if page_rel.startswith("cards" + os.sep) else os.path.dirname(
        os.path.join(ROOT, page_rel)
    )
    return os.path.normpath(os.path.join(base, path))


fails: list[str] = []
pages = _iter_html_files()
checked = 0

for page in pages:
    page_rel = os.path.relpath(page, ROOT)
    with open(page, encoding="utf-8", errors="replace") as fh:
        try:
            parser = _MarkupAttrs()
            parser.feed(fh.read())
        except Exception as exc:
            fails.append(f"{page_rel}: unparseable HTML ({exc})")
            continue
    for attr, raw in parser.attrs:
        if attr not in ("href", "src"):
            continue
        value = (raw or "").strip()
        if not value or value.startswith(SKIP_PREFIXES) or value in SKIP_VALUES:
            continue
        if value.startswith("#") or TEMPLATE_RE.search(value) or SCHEME_RE.match(value):
            continue
        target = _resolve(page_rel, value)
        if not target:
            continue
        checked += 1
        if not os.path.exists(target):
            fails.append(f"{page_rel}: broken {attr}=\"{value}\"")

print(f"link scan: {checked} internal reference(s) across {len(pages)} page(s)")
for f in fails:
    print(f"  FAIL: {f}")
if fails:
    print(f"LINKS FAILED — {len(fails)} broken reference(s).")
    sys.exit(1)
print("LINKS OK — every internal href/src resolves.")
