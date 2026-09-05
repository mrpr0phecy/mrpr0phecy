#!/usr/bin/env python3
"""sync-counts.py — bring every published tool-count claim in line with cards.json.

Implements staff/DECISIONS.md D-001 ("published numbers are derived, never
typed"). Reads the real count from cards/cards.json and rewrites every place
that states it: index.html, tool.html, donate.html, sponsor.html, 404.html and
the docs (README, AGENTS, AGENT_ACCESS, ARCHITECTURE, INCOME). It also refreshes
the per-category pill counts in index.html and regenerates sitemap.xml.

Usage:
    python3 scripts/sync-counts.py            # apply
    python3 scripts/sync-counts.py --check    # report drift, exit 1 if any

Zero dependencies. Idempotent. Safe on a sparse checkout (only touches files
that exist).
"""
from __future__ import annotations
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = "--check" in sys.argv


def rd(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return f.read()


def wr(rel, s):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
        f.write(s)


cards = json.load(open(os.path.join(ROOT, "cards", "cards.json"), encoding="utf-8"))
N = len(cards)
on_disk = len([f for f in os.listdir(os.path.join(ROOT, "cards")) if f.endswith(".html")])
if on_disk != N:
    print(f"FATAL: cards.json has {N} entries but {on_disk} card files exist — run node generate-cards-json.js first")
    sys.exit(2)

cats: dict[str, int] = {}
for c in cards:
    cats[c["category"]] = cats.get(c["category"], 0) + 1
NCAT = len(cats)

changed = []


def sub(rel, patterns):
    """patterns: list of (regex, replacement) applied with re.sub."""
    s = rd(rel)
    if s is None:
        return
    new = s
    for pat, rep in patterns:
        new = re.sub(pat, rep, new)
    if new != s:
        changed.append(rel)
        if not CHECK:
            wr(rel, new)


# Anything that reads like "<number> free (offline )?(browser )?tools", "All <n> tools",
# "Search <n>+ free tools", etc. We only ever rewrite numbers that sit in one of the
# known phrasings so we never touch unrelated figures.
num = r"\d{3,4}"
generic = [
    (rf"\b{num}(\+?) free tools\b", rf"{N}\1 free tools"),
    (rf"\b{num}(\+?) free offline browser tools\b", rf"{N}\1 free offline browser tools"),
    (rf"\b{num}(\+?) free browser tools\b", rf"{N}\1 free browser tools"),
    (rf"\b{num}(\+?) free, self-contained browser\b", rf"{N}\1 free, self-contained browser"),
    (rf"\b{num} free offline browser tools\b", rf"{N} free offline browser tools"),
    (rf"\b{num} offline browser tools\b", rf"{N} offline browser tools"),
    (rf"\b{num} self-contained browser tools\b", rf"{N} self-contained browser tools"),
    (rf"\b{num} offline-first tools\b", rf"{N} offline-first tools"),
    (rf"\bAll {num} tools\b", rf"All {N} tools"),
    (rf"\bof {num} them\b", rf"of {N} them"),
    (rf"\bthe other {num}\b", rf"the other {N}"),
    (rf"\bone of {num} free browser tools\b", rf"one of {N} free browser tools"),
    (rf"\bany of the {num} free tools\b", rf"any of the {N} free tools"),
    (rf"\bKeep {num} Free Tools Free\b", rf"Keep {N} Free Tools Free"),
    (rf"\b{num} Free Online Tools\b", rf"{N} Free Online Tools"),
    (rf"\bcatalogue of {num} self-contained\b", rf"catalogue of {N} self-contained"),
    (r'"numberOfItems": ' + num + r"\b", '"numberOfItems": ' + str(N)),
    (rf"across {num} categories", rf"across {NCAT} categories"),
    (rf"Search {num}\+ free tools", rf"Search {N}+ free tools"),
    (r'id="heroToolCount">' + num + r"\+", 'id="heroToolCount">' + str(N) + "+"),
    (r'id="count-all">' + num + "<", 'id="count-all">' + str(N) + "<"),
    (rf"Showing all <strong>{num}</strong> tools", rf"Showing all <strong>{N}</strong> tools"),
    (rf"Jump straight to {num} free browser tools", rf"Jump straight to {N} free browser tools"),
    (r'<div class="fact"><b>' + num + "</b><span>Free tools</span>", '<div class="fact"><b>' + str(N) + "</b><span>Free tools</span>"),
    (r'<div class="fact"><b>' + num + "</b><span>Tools</span>", '<div class="fact"><b>' + str(N) + "</b><span>Tools</span>"),
    (rf"\b{num} free tools, each one built\b", rf"{N} free tools, each one built"),
    (rf"hosted here alongside the other {num}", rf"hosted here alongside the other {N}"),
]

for rel in ["index.html", "tool.html", "donate.html", "sponsor.html", "404.html"]:
    sub(rel, generic)

# Docs. Same phrasings plus the table cells and the categories heading.
docs = generic + [
    (rf"\| Tools \| {num}, indexed by", rf"| Tools | {N}, indexed by"),
    (rf"\*\*{num}\*\* offline browser tools", rf"**{N}** offline browser tools"),
    (rf"\| Tools on site \| \*\*{num}\*\* \|", rf"| Tools on site | **{N}** |"),
    (rf"Generated index of all {num} tools", rf"Generated index of all {N} tools"),
    (rf"<tool-name>\.html    {num} tools? fragments", rf"<tool-name>.html    {N} tool fragments"),
    (rf"unique across all {num} cards", rf"unique across all {N} cards"),
    (rf"### Categories \({num} tools\)", rf"### Categories ({N} tools)"),
    (rf"silently drop the {num} cards", rf"silently drop the {N} cards"),
    (rf"All {num} share one DOM", rf"All {N} share one DOM"),
    (rf"skip images and the {num} cards", rf"skip images and the {N} cards"),
    (rf"omit the {num} cards too", rf"omit the {N} cards too"),
    (rf"because all {num} cards share one DOM", rf"because all {N} cards share one DOM"),
    (rf"- Cards: \*\*{num}\*\*, all indexed", rf"- Cards: **{N}**, all indexed"),
    (rf"Since all {num} cards share one DOM", rf"Since all {N} cards share one DOM"),
    (rf"sitemap\.xml lists all {num} pages", ""),  # handled below
]
for rel in ["README.md", "AGENTS.md", "AGENT_ACCESS.md", "ARCHITECTURE.md", "INCOME.md"]:
    sub(rel, [p for p in docs if p[1] != ""])

# Category table in ARCHITECTURE.md §3 — regenerate the whole table so counts never drift.
arch = rd("ARCHITECTURE.md")
if arch is not None:
    ordered = sorted(cats.items(), key=lambda kv: (-kv[1], kv[0]))
    half = (len(ordered) + 1) // 2
    left, right = ordered[:half], ordered[half:]
    rows = ["| Count | Category | | Count | Category |", "|---|---|---|---|---|"]
    for i in range(half):
        l = left[i]
        r = right[i] if i < len(right) else None
        rows.append(f"| {l[1]} | {l[0]} | | {r[1] if r else ''} | {r[0] if r else ''} |")
    table = "\n".join(rows)
    new = re.sub(
        r"(### Categories \(\d+ tools\)\n\n)\| Count \| Category \|[\s\S]*?(?=\n\n---)",
        lambda m: m.group(1) + table, arch)
    if new != arch:
        changed.append("ARCHITECTURE.md (category table)")
        if not CHECK:
            wr("ARCHITECTURE.md", new)

# ---------------------------------------------------------------- sitemap
# Built from git ls-files (ARCHITECTURE.md §6) plus untracked new cards, minus noindex pages.
base = "https://www.themostusefulsiteintheworld.com"
today = datetime.date.today().isoformat()
tracked = subprocess.run(["git", "ls-files"], capture_output=True, text=True, cwd=ROOT).stdout.split()
others = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True, cwd=ROOT).stdout.split()
html = sorted({f for f in tracked + others if f.endswith(".html")})
NOINDEX = {"404.html", "hokidea.html", "indexbeta.html"}
html = [f for f in html if f not in NOINDEX and os.path.exists(os.path.join(ROOT, f))]
prio = {"listen.html": ("1.0", "weekly"), "music.html": ("0.9", "weekly"),
        "index.html": ("0.9", "daily"), "youtubepromo2.html": ("0.7", "monthly")}
old_sm = rd("sitemap.xml") or ""
old_mod = dict(re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", old_sm))


def entry(u, p, c):
    loc = f"{base}/{u.replace(' ', '%20')}"
    # keep the previous lastmod for unchanged files so the sitemap is honest
    mod = old_mod.get(loc, today)
    if u.startswith("cards/") and (u not in tracked or subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", u], cwd=ROOT).returncode != 0):
        mod = today
    return f"  <url><loc>{loc}</loc><lastmod>{mod}</lastmod><changefreq>{c}</changefreq><priority>{p}</priority></url>"


urls = [(f, *prio[f]) if f in prio else (f, "0.4" if f.startswith("cards/") else "0.5", "monthly")
        for f in sorted(html)]
sm = ('<?xml version="1.0" encoding="UTF-8"?>\n'
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "\n".join(entry(*u) for u in urls) + "\n</urlset>\n")
if sm != old_sm:
    changed.append("sitemap.xml")
    if not CHECK:
        wr("sitemap.xml", sm)

# sitemap page count claim in ARCHITECTURE.md
arch = rd("ARCHITECTURE.md")
if arch is not None:
    new = re.sub(r"`sitemap\.xml` lists all \d+ pages", f"`sitemap.xml` lists all {len(urls)} pages", arch)
    new = re.sub(r"sitemap\.xml         All \d+ pages, generated", f"sitemap.xml         All {len(urls)} pages, generated", new)
    if new != arch:
        changed.append("ARCHITECTURE.md (sitemap count)")
        if not CHECK:
            wr("ARCHITECTURE.md", new)

print(f"tools: {N} · categories: {NCAT} · sitemap urls: {len(urls)}")
if changed:
    verb = "DRIFT in" if CHECK else "updated"
    print(f"{verb}: " + ", ".join(dict.fromkeys(changed)))
    sys.exit(1 if CHECK else 0)
print("all count claims already in sync")
