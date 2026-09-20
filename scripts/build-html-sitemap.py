#!/usr/bin/env python3
"""build-html-sitemap.py — regenerate sitemap.html, the human-readable sitemap.

    python3 scripts/build-html-sitemap.py           # rewrite the page
    python3 scripts/build-html-sitemap.py --check   # fail on drift (verify.sh)

Why it exists
-------------
`sitemap.html` is linked "Sitemap" from every footer and from tools.html. It is
the no-JS, crawler-readable list of the whole catalogue, and it had rotted the
same way tools.html had:

  * the A–Z section claimed 1,165 entries and held 1,061 — 134 tools were
    listed nowhere on the page (the AI labs, the whole astronaut series, the
    aquarium toolkit…), so a visitor or crawler following the sitemap could not
    reach them at all;
  * the "Every category (static fallback)" counts disagreed with the catalogue
    by up to 22 tools per category (Algorithms claimed 89, the truth was 67),
    so the anchors advertised tools the page they pointed at did not contain;
  * "Machine-readable" claimed 4 entries and held 9;
  * 22 lines of another document's list items had been appended *after*
    `</body></html>` — invalid HTML, and the kind of damage only a file nobody
    owns accumulates.

It is now generated from cards/cards.json like every other derived artefact,
with a `--check` in verify.sh.

Generated vs. kept
------------------
Generated: the head's counts, the hero eyebrow, "Every category" (anchors into
tools.html, real counts), "Every tool, A–Z" (all of them, title-sorted with the
leading emoji stripped from the sort key), and the machine-readable list.
Kept as curated prose, but validated — every href must exist on disk and every
`<span class="count">` must equal the number of entries: "Top-level pages",
"Translated landings" and "Blog posts". The `<style>` block and the topbar are
design and are never touched. Anything after `</html>` is dropped.

Order matches tools.html and the category pages via discovery_catalogue.py.
"""
from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from discovery_catalogue import ROOT, load_catalogue, title_sort_key  # noqa: E402

PAGE = os.path.join(ROOT, "sitemap.html")

BODY_START = "<body>"
MAIN_START = '<main class="wrap">'
MAIN_END = "</main>"
FOOTER_START = "<footer>"

# `<h2>` content cannot contain another tag start and the section body cannot
# contain another <section>: with plain `.*?` (even non-greedy) a section whose
# closing tag is missing swallows every section after it, which is exactly how
# the curated "Top-level pages" and "Translated landings" lists vanished on the
# first run of this generator.
SECTION_RE = re.compile(r"<section>\s*<h2>((?:(?!<h2>).)*?)</h2>((?:(?!<section>).)*?)</section>", re.S)
ITEM_HREF_RE = re.compile(r'<a class="link-item" href="([^"]+)"')
CTA_HREF_RE = re.compile(r'<a href="([^"]+)"')

# Machine-readable surfaces. Listed here (not scraped) because each needs a
# human sentence, but validated like everything else: a file that stops
# existing is a failed check, not a silent 404 in the sitemap.
MACHINE_READABLE = [
    ("sitemap.xml", "The full XML sitemap for search engines."),
    ("feed.xml", "RSS 2.0 feed of changes and new tools."),
    ("llms.txt", "Machine-readable overview for LLM crawlers."),
    ("llms-full.txt", "The same overview with every tool listed in full."),
    (".well-known/ai.txt", "AI policy: training, retrieval, republishing rules."),
    (".well-known/mcp.json", "MCP server manifest for agent clients."),
    (".well-known/security.txt", "Security disclosure address and expiry."),
    ("robots.txt", "Crawler rules (explicit allow for major AI crawlers)."),
    ("cards/cards.json", "Complete tool catalogue as JSON."),
    ("cards/cards-lite.json", "Name/title/category only — the fast tier the home page boots from."),
    ("tools-index.json", "Catalogue with categories and tags, for directories."),
    ("api/tools.json", "The same index under the /api/ path agents are told to use."),
    ("related.json", "Computed related-tools map, one entry per tool."),
    ("manifest.json", "PWA manifest."),
    ("manifest.tools.json", "Tool shortcuts for the installed PWA."),
]


def esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def section(title: str, body: str) -> str:
    return f"<section>\n<h2>{title}</h2>\n{body}\n</section>"


def slice_between(text: str, start: str, end: str, label: str) -> tuple[str, str, str]:
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"sitemap.html has no {label} (expected {start!r}) — cannot regenerate safely")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"sitemap.html has no end of {label} (expected {end!r}) — cannot regenerate safely")
    j += len(end)
    return text[:i], text[i:j], text[j:]


def render_categories(categories) -> str:
    lines = ['<div class="ctas">']
    for cat in sorted(categories, key=lambda c: c.slug):
        lines.append(f'<a href="tools.html#cat-{cat.slug}">{esc(cat.name)} ({len(cat.tools)})</a>')
    lines.append("</div>")
    return "\n".join(lines)


def render_tools(tools) -> str:
    lines = ['<div class="link-list">']
    for tool in sorted(tools, key=lambda t: (title_sort_key(t.title), t.name)):
        lines.append(f'<a class="link-item" href="{tool.url}"><div class="ti">{esc(tool.title)}</div></a>')
    lines.append("</div>")
    return "\n".join(lines)


def render_machine_readable() -> str:
    lines = ['<div class="link-list">']
    for href, desc in MACHINE_READABLE:
        lines.append(
            f'<a class="link-item" href="{href}"><div><div class="ti">{href}</div>'
            f'<div class="desc">{esc(desc)}</div></div>↗</a>'
        )
    lines.append("</div>")
    return "\n".join(lines)


def set_count(block: str, count: int) -> str:
    return re.sub(r'(<span class="count">)\d+(</span>)', rf"\g<1>{count}\g<2>", block, count=1)


def validate_curated(heading: str, body: str, problems: list[str]) -> str:
    """Re-emit a hand-written `<section>`, with an honest count and live hrefs.

    The count is derived from the links in the body — 15 entries means the
    heading says 15, whatever it said before. Each href must exist on disk:
    this page is the sitemap, so a dead link here is worse than a dead link
    anywhere else.
    """
    text = re.sub(r"<[^>]+>", "", heading).strip()
    items = ITEM_HREF_RE.findall(body) or CTA_HREF_RE.findall(body)
    for href in items:
        target = href.split("#", 1)[0].split("?", 1)[0]
        if not target or target.startswith(("http://", "https://", "//", "mailto:")):
            continue
        if not os.path.exists(os.path.join(ROOT, target)):
            problems.append(f"{text}: links {href}, which does not exist")
    return section(set_count(heading, len(items)), body.strip("\n"))


def _blog_heading_and_body(block: str) -> tuple[str, str]:
    """The blog <section> sits outside <main>; split it the same way.

    Returns the *inner* markup of the heading (no <h2> tags — `section()` adds
    them) and the body, so re-running the generator cannot nest another <h2>
    inside the last one.
    """
    match = re.match(r"\s*<section>\s*<h2>(.*?)</h2>(.*)</section>\s*$", block, re.S)
    if not match:
        raise SystemExit("sitemap.html: the blog section is not <section><h2>…</h2>…</section>")
    return match.group(1), match.group(2)


def build() -> tuple[str, list[str]]:
    catalogue = load_catalogue()
    total = len(catalogue)
    problems: list[str] = []

    with open(PAGE, encoding="utf-8") as fh:
        current = fh.read()

    head, body = current.split(BODY_START, 1)
    head = head + BODY_START

    topbar_before, topbar, rest = slice_between(body, "<div", "</div></div>", "topbar")
    _hero_before, hero, rest = slice_between(rest, "<header", "</header>", "hero")
    main_before, main, rest = slice_between(rest, MAIN_START, MAIN_END, "sections")
    blog_before, blog, rest = slice_between(rest, "<section>", "</section>", "blog section")
    footer_before, footer, _tail = slice_between(rest, FOOTER_START, "</footer>", "footer")

    rebuilt: list[str] = []
    rebuilt_headings: list[str] = []
    for heading, inner in SECTION_RE.findall(main):
        text = re.sub(r"<[^>]+>", "", heading).strip()
        whole = f"<h2>{heading}</h2>{inner}"
        rebuilt_headings.append(heading)
        if text.startswith("🛠️ Every category"):
            rebuilt.append(
                section(
                    f'🛠️ Every category (static fallback) <span class="count">'
                    f"{len(catalogue.categories)}</span>",
                    render_categories(catalogue.categories),
                )
            )
        elif text.startswith("🔤 Every tool"):
            rebuilt.append(
                section(
                    f'🔤 Every tool, A–Z (static fallback) <span class="count">{total}</span>',
                    render_tools(catalogue.tools),
                )
            )
        elif text.startswith("🤖 Machine-readable"):
            rebuilt.append(
                section(
                    f'🤖 Machine-readable <span class="count">{len(MACHINE_READABLE)}</span>',
                    render_machine_readable(),
                )
            )
        else:
            rebuilt.append(validate_curated(heading, inner, problems))
    # A section that failed to parse must never disappear silently: the page
    # would lose a whole curated list and still pass every count check. The
    # rebuilt headings are the source headings, in order, or this stops.
    def label(raw: str) -> str:
        # Heading text without the count span: the count is regenerated, the
        # section's identity is not.
        text = re.sub(r'<span class="count">.*?</span>', "", raw, flags=re.S)
        return re.sub(r"<[^>]+>", "", text).strip()

    source_headings = [label(h) for h, _ in SECTION_RE.findall(main)]
    kept_headings = [label(h) for h in rebuilt_headings]
    if kept_headings != source_headings or not source_headings:
        raise SystemExit(
            f"sitemap.html: section list changed while rebuilding "
            f"({len(source_headings)} in, {len(rebuilt_headings)} out)"
        )
    new_main = MAIN_START + "\n" + "\n".join(rebuilt) + "\n" + MAIN_END

    for href, _desc in MACHINE_READABLE:
        if not os.path.exists(os.path.join(ROOT, href)):
            problems.append(f"Machine-readable: lists {href}, which does not exist")

    hero = re.sub(r"(Sitemap · \d+ top-level pages · )\d+( tools)", rf"\g<1>{total}\g<2>", hero)
    head = re.sub(r"\d+( free tools, \d+ top-level pages)", rf"{total}\g<1>", head)
    footer = (
        footer_before
        + re.sub(r"All \d+ tools", f"All {total} tools", footer)
        + "\n</body></html>"
    )

    page = (
        head
        + "\n"
        + topbar_before.strip("\n")
        + topbar.strip("\n")
        + "\n"
        + hero.strip("\n")
        + "\n"
        + main_before.strip("\n")
        + new_main
        + "\n"
        + blog_before.strip("\n")
        + validate_curated(*_blog_heading_and_body(blog), problems).strip("\n")
        + "\n\n"
        + footer.lstrip("\n")
    )
    return page, problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    args = parser.parse_args()

    expected, problems = build()
    with open(PAGE, encoding="utf-8") as fh:
        current = fh.read()

    catalogue = load_catalogue()

    if args.check:
        failed = False
        linked = set(re.findall(r"tool\.html\?card=([a-z0-9\-]+)", current))
        missing = sorted(catalogue.names - linked)
        phantom = sorted(linked - catalogue.names)
        if missing:
            failed = True
            print(f"sitemap.html DRIFT — {len(missing)} of {len(catalogue)} tools are listed nowhere on the page")
            for slug in missing[:15]:
                print(f"  missing: {slug}")
            if len(missing) > 15:
                print(f"  … and {len(missing) - 15} more")
        if phantom:
            failed = True
            print(f"sitemap.html DRIFT — {len(phantom)} links point at tools that do not exist")
            for slug in phantom[:10]:
                print(f"  phantom: {slug}")
        if current.rstrip("\n") != expected.rstrip("\n"):
            failed = True
            print("sitemap.html DRIFT — a generated section is out of date")
        for problem in problems:
            failed = True
            print(f"sitemap.html: {problem}")
        if failed:
            print("  fix: python3 scripts/build-html-sitemap.py")
            return 1
        print(
            f"sitemap.html OK — all {len(catalogue)} tools and "
            f"{len(catalogue.categories)} categories listed, curated links resolve"
        )
        return 0

    with open(PAGE, "w", encoding="utf-8") as fh:
        fh.write(expected)
    print(
        f"sitemap.html regenerated — {len(catalogue)} tools, "
        f"{len(catalogue.categories)} categories"
    )
    for problem in problems:
        print(f"  NOTE: {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
