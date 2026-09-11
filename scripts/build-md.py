#!/usr/bin/env python3
"""build-md.py — LLM-friendly Markdown versions of key pages (llms.txt v2).

    python3 scripts/build-md.py            # (re)generate *.html.md
    python3 scripts/build-md.py --check    # fail if any is out of date

The llms.txt v2 spec asks that pages agents might need offer a clean Markdown
version at the same URL with .md appended, advertised via
rel="alternate" type="text/markdown" (plus rel="describedby" pointing at the
covering llms.txt). This script generates those from the live HTML, so they
can never rot: the weekly promo refresh regenerates them, and
check-ai-discovery.py (run by verify.sh) fails if they drift from source.

Scope is deliberately the prose pages agents actually need — the machine
guide, help, the three offer pages, about, all guides and all blog posts.
The catalogue itself is already machine-native (cards.json, llms-full.txt)
and the app shells (index, tool) have no prose worth converting.
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.themostusefulsiteintheworld.com"

TOP_PAGES = ["ai.html", "help.html", "license.html", "hire.html", "sync.html",
             "about.html"]
GLOBS = ["guides/*.html", "blog/*.html"]

SKIP_TAGS = {"script", "style", "nav", "form", "button",
             "input", "select", "textarea", "label", "iframe", "svg", "canvas",
             "noscript", "template"}
# Page chrome (header/footer) is excluded structurally instead: convert()
# feeds the converter only the <main> element when one exists, else <body>.
# Class-skip below is the backstop for chrome living inside main.
SKIP_CLASS = re.compile(r"nav|footer|menu|cookie|breadcrumb|share-|embed-card", re.I)


class Converter(HTMLParser):
    """Small, strict HTML→Markdown extractor. Prose in, prose out."""

    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.out: list[str] = []
        self.skip_stack: list[bool] = []
        self.in_title = False
        self.title = ""
        self.list_stack: list[str] = []
        self.in_pre = False
        self.in_cell = False
        self.link: str | None = None
        self.in_summary = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        opener_skips = tag in SKIP_TAGS or bool(
            attrs.get("class") and SKIP_CLASS.search(attrs["class"]))
        self.skip_stack.append(opener_skips)
        if opener_skips or any(self.skip_stack[:-1]):
            return
        if tag == "title":
            self.in_title = True
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.out.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "p":
            self.out.append("\n\n")
        elif tag == "br":
            self.out.append("  \n")
        elif tag == "hr":
            self.out.append("\n\n---\n\n")
        elif tag in ("ul", "ol"):
            self.list_stack.append(tag)
            self.out.append("\n")
        elif tag == "li":
            kind = self.list_stack[-1] if self.list_stack else "ul"
            prefix = "1. " if kind == "ol" else "- "
            self.out.append("\n" + "  " * (len(self.list_stack) - 1) + prefix)
        elif tag == "a":
            href = attrs.get("href", "")
            self.link = urljoin(self.base, href) if href else None
            self.out.append("[")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "code" and not self.in_pre:
            self.out.append("`")
        elif tag == "pre":
            self.in_pre = True
            self.out.append("\n\n```\n")
        elif tag == "blockquote":
            self.out.append("\n\n> ")
        elif tag == "summary":
            self.in_summary = True
            self.out.append("\n\n**")
        elif tag == "tr":
            self.out.append("\n")
        elif tag in ("td", "th"):
            self.in_cell = True
            self.out.append("| ")
        elif tag == "img":
            alt = (attrs.get("alt") or "").strip()
            src = attrs.get("src", "")
            if alt and src and not src.startswith("data:"):
                self.out.append(f"\n\n![{alt}]({urljoin(self.base, src)})\n\n")

    def handle_endtag(self, tag):
        if self.skip_stack:
            self.skip_stack.pop()
        if any(self.skip_stack):
            return
        if tag == "title":
            self.in_title = False
        elif tag in ("ul", "ol"):
            if self.list_stack:
                self.list_stack.pop()
            self.out.append("\n")
        elif tag == "a":
            self.out.append(f"]({self.link})" if self.link else "]")
            self.link = None
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "code" and not self.in_pre:
            self.out.append("`")
        elif tag == "pre":
            self.in_pre = False
            self.out.append("\n```\n")
        elif tag == "summary":
            self.in_summary = False
            self.out.append("**")
        elif tag in ("td", "th"):
            self.in_cell = False
            self.out.append(" ")
        elif tag == "tr":
            self.out.append("|")

    def handle_data(self, data):
        if self.in_title:
            self.title += data
            return
        if any(self.skip_stack):
            return
        if self.in_pre:
            self.out.append(data)
        else:
            text = re.sub(r"\s+", " ", data)
            if text.strip():
                self.out.append(text)

    def markdown(self, source_url: str) -> str:
        body = "".join(self.out)
        body = re.sub(r"[ \t]+\n", "\n", body)
        body = re.sub(r"\n{3,}", "\n\n", body)
        body = re.sub(r"\*\*\s+\*\*", "", body)
        title = " ".join(self.title.split()) or source_url
        header = (f"# {title}\n\n> Machine-readable Markdown version of {source_url} "
                  f"(llms.txt v2). Canonical page: {source_url}\n")
        return header + body.strip() + "\n"


def pages() -> list[str]:
    found = [p for p in TOP_PAGES if os.path.exists(os.path.join(ROOT, p))]
    for pattern in GLOBS:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            rel = os.path.relpath(path, ROOT)
            if rel.endswith(".html.md"):
                continue
            found.append(rel)
    return found


def convert(rel: str) -> tuple[str, str]:
    """Convert one page; returns (md_relative_path, markdown)."""
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        page = fh.read()
    url = f"{SITE}/{rel}"
    main = re.search(r"(?is)<main\b.*?>(.*)</main\s*>", page)
    if main:
        page = main.group(1)
    else:
        body = re.search(r"(?is)<body\b.*?>(.*)</body\s*>", page)
        if body:
            page = body.group(1)
    conv = Converter(base=url)
    conv.feed(page)
    # <title> lives in <head>, outside the converted fragment — recover it.
    conv.title = ""
    head = re.search(r"(?is)<title\b.*?>(.*?)</title\s*>", fh_text(rel))
    if head:
        import html as _html

        conv.title = _html.unescape(re.sub(r"\s+", " ", head.group(1)).strip())
    return rel + ".md", conv.markdown(url)


def fh_text(rel: str) -> str:
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate *.html.md versions.")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    failed = 0
    for rel in pages():
        md_rel, fresh = convert(rel)
        dest = os.path.join(ROOT, md_rel)
        if args.check:
            try:
                with open(dest, encoding="utf-8") as fh:
                    current = fh.read()
            except FileNotFoundError:
                current = None
            if current != fresh:
                print(f"STALE {md_rel} — run: python3 scripts/build-md.py")
                failed += 1
        else:
            with open(dest, "w", encoding="utf-8") as fh:
                fh.write(fresh)
            print(f"wrote {md_rel} ({len(fresh)} chars)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
