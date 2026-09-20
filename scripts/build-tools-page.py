#!/usr/bin/env python3
"""build-tools-page.py — regenerate tools.html, the static "Complete index".

    python3 scripts/build-tools-page.py           # rewrite the generated blocks
    python3 scripts/build-tools-page.py --check   # fail on drift (verify.sh)

Why it exists
-------------
`tools.html` is what every footer on the site calls "Index", and its own
`<title>` claims "All N Free Tools — Complete Index by Category". It was
hand-maintained, so it quietly stopped being either: on 2026-09-20 it listed
532 of 1,195 tools across 23 of 27 categories, with per-category counts
("AI & Autonomous Agents 10 tools") that the catalogue had outgrown months
earlier. 663 tools were reachable from the interactive home page and from
tools-index.html, but not from the plain-HTML index a crawler, a no-JS visitor
or an agent following the footer actually lands on — the "tool isn't there when
I click through" report, from the one surface that could not show it.

Same rule as every other derived artefact here (sitemap.xml, embed.html,
index.html's first screen, the per-tool pages in tools/): generated from
cards/cards.json, with a `--check` the gate runs, because a page a human has to
remember to update is a page that is already wrong.

What is generated vs. kept
--------------------------
Generated (everything that can drift): the head's category count, the hero
counts, the sticky category TOC, every category section and every tool link,
and the footer's tool count. Kept verbatim (design, not data): the `<style>`
block, the topbar, the closing "Ready to use the tools?" CTA and the rest of
the `<head>`. Tool titles and descriptions come straight from cards.json — no
re-truncation, no second copy of the wording (the CSS already line-clamps).

Order is shared with every other static surface via discovery_catalogue.py:
tools-index.json's CATEGORY_ORDER, then A–Z by title inside a category.

After adding or removing a tool, run `node generate-cards-json.js` and then
this script (AGENTS.md §4 lists it with the rest of the re-sync sequence).
"""
from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from discovery_catalogue import ROOT, load_catalogue  # noqa: E402

PAGE = os.path.join(ROOT, "tools.html")

BODY_START = "<body>"
MAIN_START = '<main class="wrap">'
MAIN_END = "</main>"
FOOTER_START = "<footer>"
TOC_START = '<nav class="toc"'
TOC_END = "</nav>"
HERO_START = "<header"
HERO_END = "</header>"


def esc(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def slice_between(text: str, start: str, end: str, label: str) -> tuple[str, str, str]:
    """Split `text` into (before, block, after) on the first start/end pair."""
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"tools.html has no {label} (expected {start!r}) — cannot regenerate safely")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"tools.html has no end of {label} (expected {end!r}) — cannot regenerate safely")
    j += len(end)
    return text[:i], text[i:j], text[j:]


def render_toc(categories) -> str:
    lines = [
        '<nav class="toc" aria-label="Jump to category">',
        '<div class="toc-inner">',
    ]
    for cat in categories:
        lines.append(
            f'<a href="#cat-{cat.slug}">{esc(cat.name)} ({len(cat.tools)})</a>'
        )
    lines.append("</div></nav>")
    return "\n".join(lines)


def render_main(categories) -> str:
    lines = [MAIN_START]
    for cat in categories:
        lines.append(
            f'<h2 id="cat-{cat.slug}">{esc(cat.name)} '
            f'<span class="count">{len(cat.tools)} tools</span></h2>'
        )
        lines.append('<div class="tool-list">')
        for tool in cat.tools:
            lines.append(f'<a class="tool-item" href="{tool.url}">')
            lines.append(f'<div class="ti-title">{esc(tool.title)}</div>')
            if tool.description:
                lines.append(f'<div class="ti-desc">{esc(tool.description)}</div>')
            lines.append("</a>")
        lines.append("</div>")
    lines.append(MAIN_END)
    return "\n".join(lines)


def render_hero(total: int, cat_count: int) -> str:
    return (
        '<header class="hero"><div class="wrap">\n'
        f'<div class="eyebrow">Complete index · {total} tools · {cat_count} categories</div>\n'
        "<h1>Every tool, by category</h1>\n"
        f"<p>The full list of {total} free browser tools — open the category you need, "
        "or jump straight to a specific tool. No sign-ups, no display ads, no accounts.</p>\n"
        "</div></header>"
    )


def build() -> str:
    catalogue = load_catalogue()
    total = len(catalogue)
    cat_count = len(catalogue.categories)
    with open(PAGE, encoding="utf-8") as fh:
        current = fh.read()

    head, body = current.split(BODY_START, 1)
    head = head + BODY_START

    # Keep the design, replace the data. Each block is located by its own
    # markup so a restyle never silently loses a section.
    topbar_before, topbar, rest = slice_between(body, "<div", "</div></div>", "topbar")
    _hero_before, _hero, rest = slice_between(rest, HERO_START, HERO_END, "hero")
    _toc_before, _toc, rest = slice_between(rest, TOC_START, TOC_END, "category TOC")
    main_before, _main, rest = slice_between(rest, MAIN_START, MAIN_END, "tool list")
    cta_before, cta, rest = slice_between(rest, '<div class="all-cta"', "</div>", "closing CTA")
    footer_before, _footer, tail = slice_between(rest, FOOTER_START, "</footer>", "footer")

    # The head and footer carry the same claim sync-counts.py owns; keep the
    # wording, refresh the two numbers that this page is the source of.
    head = re.sub(r"organised by \d+ categories", f"organised by {cat_count} categories", head)
    head = re.sub(r"organized by \d+ categories", f"organized by {cat_count} categories", head)
    head = re.sub(
        r'("numberOfItems":\s*)\d+', rf"\g<1>{total}", head
    )
    footer = (
        footer_before
        + re.sub(r"All \d+ tools", f"All {total} tools", _footer)
        + tail
    )

    # Whitespace *between* the generated blocks is normalised (never carried
    # over) so regenerating an already-generated page is a byte-identical
    # no-op — otherwise every run would add another blank line and --check
    # would report drift against the file this script wrote a minute ago.
    return (
        head
        + "\n"
        + topbar_before.strip("\n")
        + topbar.strip("\n")
        + "\n"
        + render_hero(total, cat_count)
        + "\n"
        + render_toc(catalogue.categories)
        + "\n"
        + main_before.strip("\n")
        + render_main(catalogue.categories)
        + "\n"
        + cta_before.strip("\n")
        + "\n"
        + cta.strip("\n")
        + "\n"
        + footer.lstrip("\n")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    args = parser.parse_args()

    expected = build()
    with open(PAGE, encoding="utf-8") as fh:
        current = fh.read()

    catalogue = load_catalogue()
    if args.check:
        if current == expected:
            print(
                f"tools.html OK — all {len(catalogue)} tools across "
                f"{len(catalogue.categories)} categories are linked"
            )
            return 0
        linked = set(re.findall(r"tool\.html\?card=([a-z0-9\-]+)", current))
        missing = sorted(catalogue.names - linked)
        print(
            f"tools.html DRIFT — links {len(linked & catalogue.names)} of "
            f"{len(catalogue)} tools; {len(missing)} missing from the page"
        )
        for slug in missing[:15]:
            print(f"  missing: {slug}")
        if len(missing) > 15:
            print(f"  … and {len(missing) - 15} more")
        print("  fix: python3 scripts/build-tools-page.py")
        return 1

    with open(PAGE, "w", encoding="utf-8") as fh:
        fh.write(expected)
    print(
        f"tools.html regenerated — {len(catalogue)} tools, "
        f"{len(catalogue.categories)} categories"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
