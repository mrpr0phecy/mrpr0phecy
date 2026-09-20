#!/usr/bin/env python3
"""check-tool-graph.py — every tool must be linked, and every link must land.

    python3 scripts/check-tool-graph.py            # the gate verify.sh runs
    python3 scripts/check-tool-graph.py --verbose  # also list what was scanned

Two directions, because both have broken in this repo:

1. **No dead ends.** Every `tool.html?card=<slug>`, `cards/<slug>.html` and
   `#cat-<slug>` reference in a shipped page must resolve to a tool that
   exists. `case-studies.html` shipped nine links to tools that were renamed
   or never existed (`?card=affordability`, `?card=stampduty`,
   `?card=compound-interest`…): the click landed on tool.html, which politely
   invented a title for a fragment that was not there and rendered an empty
   shell. That is the "tool doesn't come up" report, and no existing check
   could see it — check-links.py resolves *files*, and `tool.html` exists.

2. **No orphans.** Every tool in cards/cards.json must be reachable from the
   static discovery surfaces: the home page's catalogue tiers, the full index
   (tools.html), the interactive directory (tools-index.html + its JSON), the
   embed catalogue, the human sitemap, the XML sitemap, its own category page,
   and /api/tools.json. Before this check, 663 tools were missing from
   tools.html and 134 from sitemap.html — reachable only through JavaScript
   on the home page, invisible to every crawler and every no-JS visitor.

Narrative files (docs/, *.md, the changelog) are *not* held to the
first rule: they describe plans and post-mortems and legitimately mention
slugs that do not exist. They are reported as notes, never failures. The
frozen-in-time pages (changelog.html) are skipped entirely, matching
sync-counts.py's rule that history must not be rewritten.

Zero dependencies; runs in well under a second.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from discovery_catalogue import (  # noqa: E402
    ROOT,
    card_files_on_disk,
    load_catalogue,
    load_lite_tier,
    slugify_category,
)

API_DIR = os.path.join(ROOT, "api", "tools")
CARDS_DIR = os.path.join(ROOT, "cards")

# Pages that ship and are navigated. Everything else in the repo is prose,
# board records, fixtures or build output.
SKIP_DIRS = {
    ".git", "node_modules", "ai-developer", "__pycache__", "staff", "docs",
    "learning", "notes", "substitutions", "system", "launch", "_build",
    "riley-assets", "images", "fonts", "supaviewer", ".well-known",
}
SKIP_FILES = {"changelog.html"}  # past-tense history; never rewritten
SKIP_SUFFIXES = (".md", ".txt", ".py", ".sh", ".yml", ".yaml", ".docx", ".pdf")

TOOL_REF_RE = re.compile(
    r"""(?:tool\.html\?(?:card|t)=|cards/)([a-z0-9][a-z0-9\-]{0,79}?)(?:\.html)?(?=["'\s)&<])"""
)
CAT_ANCHOR_RE = re.compile(r'tools\.html#cat-([a-z0-9\-]+)')
CAT_PAGE_RE = re.compile(r'categories/([a-z0-9\-]+)\.html')

# Surfaces that must link *every* tool. A tool missing from one of these is an
# orphan: it exists, it works, and nobody can click their way to it.
FULL_SURFACES = [
    "tools.html",
    "tools-index.html",
    "embed.html",
    "sitemap.html",
]


def read(rel: str) -> str:
    with open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def shipped_pages() -> list[str]:
    found: list[str] = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), ROOT)
            if rel in SKIP_FILES or rel.startswith("cards" + os.sep):
                continue
            found.append(rel)
    return sorted(found)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    catalogue = load_catalogue()
    names = catalogue.names
    fails: list[str] = []
    notes: list[str] = []

    # ---------------------------------------------------------- 1. catalogue
    on_disk = card_files_on_disk()
    for slug in sorted(names - on_disk):
        fails.append(f"cards.json lists {slug} but cards/{slug}.html does not exist")
    for slug in sorted(on_disk - names):
        fails.append(f"cards/{slug}.html exists but is not in cards.json — run: node generate-cards-json.js")

    lite = load_lite_tier()
    lite_names = {str(e.get("n", "")) for e in lite}
    if lite:
        if lite_names != names:
            fails.append(
                f"cards-lite.json and cards.json disagree "
                f"({len(lite_names - names)} extra, {len(names - lite_names)} missing) — "
                "run: node generate-cards-json.js"
            )
        by_name = catalogue.by_name
        for entry in lite:
            tool = by_name.get(str(entry.get("n", "")))
            if not tool:
                continue
            if entry.get("t") != tool.title or entry.get("c") != tool.category:
                fails.append(f"cards-lite.json drift for {tool.name} — run: node generate-cards-json.js")
                break

    # Every card must point at a real fragment (the home page fetches
    # meta.path directly; a wrong path is a silent empty card).
    for tool in catalogue.tools:
        if not os.path.exists(os.path.join(ROOT, tool.path)):
            fails.append(f"{tool.name}: path {tool.path} does not exist")

    # Categories must agree between cards.json and the page each one links to.
    cat_slugs = {c.slug for c in catalogue.categories}
    for cat in catalogue.categories:
        if not os.path.exists(os.path.join(ROOT, "categories", f"{cat.slug}.html")):
            fails.append(f"category {cat.name} has no categories/{cat.slug}.html — run: node scripts/build-category-pages.js")

    if os.path.exists(os.path.join(ROOT, "tools-index.json")):
        index = json.loads(read("tools-index.json"))
        index_slugs = {str(c.get("slug")) for c in index.get("categories", [])}
        if index_slugs != cat_slugs:
            fails.append(
                "tools-index.json categories disagree with cards.json "
                f"({', '.join(sorted(index_slugs ^ cat_slugs))}) — run: node scripts/build-tools-index.js"
            )
        for tool in index.get("tools", []):
            if str(tool.get("slug")) not in names:
                fails.append(f"tools-index.json lists {tool.get('slug')}, which is not a tool")

    # Per-tool API specs: advertised in llms-full.txt and .well-known/mcp.json.
    if os.path.isdir(API_DIR):
        api_files = {fn[:-5] for fn in os.listdir(API_DIR) if fn.endswith(".json")}
        for slug in sorted(names - api_files):
            fails.append(f"api/tools/{slug}.json is missing — run: node scripts/generate-ai-index.js")
        for slug in sorted(api_files - names):
            fails.append(f"api/tools/{slug}.json has no tool behind it")

    # ------------------------------------------------------- 2. no dead ends
    pages = shipped_pages()
    scanned = 0
    for rel in pages:
        text = read(rel)
        scanned += 1
        for slug in set(TOOL_REF_RE.findall(text)):
            if slug in ("cards-lite", "cards", "card"):  # cards/cards-lite.json
                continue
            if slug not in names:
                fails.append(f"{rel}: links tool.html?card={slug}, which is not in the catalogue")
        for slug in set(CAT_ANCHOR_RE.findall(text)):
            if slug not in cat_slugs:
                fails.append(f"{rel}: links tools.html#cat-{slug}, which is not a category")
        for slug in set(CAT_PAGE_RE.findall(text)):
            if slug not in cat_slugs:
                fails.append(f"{rel}: links categories/{slug}.html, which is not a category")

    # The prerendered per-tool pages are a curated list (scripts/tool-pages.json)
    # and their path is not always `tools/<card-slug>.html` — the compound
    # interest page is `tools/compound-interest.html` for the slug
    # `compoundinterest`. So the declared path is the authority: every declared
    # page must exist, every file on disk must be declared, every declared slug
    # must be a real tool, and every advertised standaloneUrl must be the
    # declared path (the api/ specs guessed `tools/<slug>.html` and published a
    # 404 for exactly that page).
    declared: dict[str, str] = {}
    spec_path = os.path.join(ROOT, "scripts", "tool-pages.json")
    if os.path.exists(spec_path):
        for page in json.loads(read("scripts/tool-pages.json")).get("pages", []):
            slug = str(page.get("slug", ""))
            path_value = str(page.get("path", ""))
            if not slug or not path_value:
                fails.append("scripts/tool-pages.json has an entry without a slug or path")
                continue
            if slug not in names:
                fails.append(f"scripts/tool-pages.json declares slug {slug}, which is not a tool")
            declared[slug] = path_value
            if not os.path.exists(os.path.join(ROOT, path_value)):
                fails.append(
                    f"scripts/tool-pages.json declares {path_value}, which does not exist — "
                    "run: python3 scripts/build-tool-pages.py"
                )
    tools_dir = os.path.join(ROOT, "tools")
    if os.path.isdir(tools_dir):
        on_disk = {f"tools/{fn}" for fn in os.listdir(tools_dir) if fn.endswith(".html")}
        for extra in sorted(on_disk - set(declared.values())):
            fails.append(f"{extra} is not declared in scripts/tool-pages.json (a hand-written page here drifts silently)")

    api_manifest = os.path.join(ROOT, "api", "tools.json")
    if os.path.exists(api_manifest):
        for spec in json.loads(read("api/tools.json")).get("tools", []):
            slug = str(spec.get("slug", ""))
            advertised = spec.get("standaloneUrl")
            expected_path = declared.get(slug)
            if expected_path and advertised != f"https://www.themostusefulsiteintheworld.com/{expected_path}":
                fails.append(
                    f"api/tools.json advertises {advertised} for {slug}; the declared page is {expected_path}"
                )
            if not expected_path and advertised:
                fails.append(f"api/tools.json advertises a standalone page for {slug}, which has no declared page")

    # ---------------------------------------------------------- 3. no orphans
    surface_slugs: dict[str, set[str]] = {}
    for rel in FULL_SURFACES:
        if not os.path.exists(os.path.join(ROOT, rel)):
            fails.append(f"{rel} is missing")
            continue
        surface_slugs[rel] = set(TOOL_REF_RE.findall(read(rel)))

    for rel in ("sitemap.xml", "llms-full.txt"):
        if os.path.exists(os.path.join(ROOT, rel)):
            surface_slugs[rel] = set(TOOL_REF_RE.findall(read(rel)))

    index_json = os.path.join(ROOT, "tools-index.json")
    if os.path.exists(index_json):
        surface_slugs["tools-index.json"] = {
            str(t.get("slug")) for t in json.loads(read("tools-index.json")).get("tools", [])
        }

    api_all = os.path.join(ROOT, "api", "tools.json")
    if os.path.exists(api_all):
        surface_slugs["api/tools.json"] = {
            str(t.get("slug")) for t in json.loads(read("api/tools.json")).get("tools", [])
        }

    for surface, slugs in surface_slugs.items():
        phantom = sorted(s for s in slugs if s not in names and s not in ("cards-lite",))
        missing = sorted(names - slugs)
        if phantom:
            fails.append(f"{surface}: {len(phantom)} links to tools that do not exist (e.g. {', '.join(phantom[:4])})")
        if missing:
            fails.append(f"{surface}: {len(missing)} of {len(names)} tools are not linked (e.g. {', '.join(missing[:4])})")

    # Category pages: every tool must appear on the page for its own category.
    cat_page_text: dict[str, str] = {}
    for cat in catalogue.categories:
        path = os.path.join(ROOT, "categories", f"{cat.slug}.html")
        if os.path.exists(path):
            cat_page_text[cat.slug] = read(os.path.join("categories", f"{cat.slug}.html"))
    for cat in catalogue.categories:
        text = cat_page_text.get(cat.slug)
        if text is None:
            continue
        linked = set(TOOL_REF_RE.findall(text))
        # The five legacy tools also live at tools/<slug>.html and are linked
        # there from their category page; either link reaches the tool.
        linked |= {
            m for m in re.findall(r'href="\.\./tools/([a-z0-9\-]+)\.html"', text)
        }
        missing = sorted(t.name for t in cat.tools if t.name not in linked)
        if missing:
            fails.append(
                f"categories/{cat.slug}.html: {len(missing)} of its own tools are not linked "
                f"(e.g. {', '.join(missing[:4])})"
            )

    # The home page's own catalogue tiers are what the grid is built from; a
    # tool absent from both is absent from the main page entirely.
    home = read("index.html")
    if "cards/cards-lite.json" not in home and "cards/cards.json" not in home:
        fails.append("index.html no longer references the catalogue tiers")

    if args.verbose:
        print(f"scanned {scanned} shipped page(s), {len(names)} tool(s), {len(cat_slugs)} categor(y/ies)")

    print(
        f"tool graph: {len(names)} tools, {len(cat_slugs)} categories, "
        f"{scanned} pages scanned, {len(surface_slugs)} full surfaces checked"
    )
    for note in notes:
        print(f"  NOTE: {note}")
    for fail in fails[:40]:
        print(f"  FAIL: {fail}")
    if len(fails) > 40:
        print(f"  … and {len(fails) - 40} more")
    if fails:
        print(f"TOOL GRAPH FAILED — {len(fails)} problem(s).")
        return 1
    print("TOOL GRAPH OK — every tool is linked from every static surface, and every link lands.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
