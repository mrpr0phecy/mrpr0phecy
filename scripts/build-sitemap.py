#!/usr/bin/env python3
"""build-sitemap.py — regenerate sitemap.xml from what git actually tracks.

    python3 scripts/build-sitemap.py            # rewrite sitemap.xml
    python3 scripts/build-sitemap.py --check    # fail if it is out of date

Two rules this encodes, both learned the hard way:

1. **Build from `git ls-files`, not the working tree.** Agents work in sparse
   checkouts where `cards/` or `images/` may be absent; globbing the disk
   silently drops 644 pages and ships a gutted sitemap.

2. **Never list a `noindex` page.** Submitting a page you have told robots to
   ignore is a contradictory signal. `404.html`, `hokidea.html` and
   `indexbeta.html` are excluded automatically by reading their robots meta —
   not by a hardcoded list that would rot the moment a page changed.

This replaces a copy-paste heredoc that lived in ARCHITECTURE.md §6. That
snippet had no noindex filter, so anyone who followed the documented procedure
would have silently added the three noindex pages back to the sitemap.
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://www.themostusefulsiteintheworld.com"
SITEMAP = os.path.join(ROOT, "sitemap.xml")

# Hand-tuned priorities for the pages that matter most.
PRIORITY = {
    "listen.html": ("1.0", "weekly"),
    "music.html": ("0.9", "weekly"),
    "index.html": ("0.9", "daily"),
    "youtubepromo2.html": ("0.7", "monthly"),
}

NOINDEX = re.compile(
    r"""(?is)<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex""")


def tracked_html() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "*.html"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.split("\n")
    return sorted(f for f in out if f.endswith(".html"))


def is_noindex(rel: str) -> bool:
    """Read the file from git, so this works in a sparse checkout too."""
    path = os.path.join(ROOT, rel)
    if os.path.exists(path):
        with open(path, encoding="utf-8", errors="replace") as fh:
            return bool(NOINDEX.search(fh.read(4096)))
    blob = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return bool(NOINDEX.search(blob.stdout[:4096]))


def build() -> str:
    today = datetime.date.today().isoformat()
    html = tracked_html()

    indexable = [f for f in html if not is_noindex(f)]
    skipped = [f for f in html if f not in indexable]

    urls: list[tuple[str, str, str]] = []
    for page, (prio, freq) in PRIORITY.items():
        if page in indexable:
            urls.append((page, prio, freq))
    urls += [
        (f, "0.4" if f.startswith("cards/") else "0.5", "monthly")
        for f in indexable if f not in PRIORITY
    ]

    body = "\n".join(
        f"  <url><loc>{BASE}/{u.replace(' ', '%20')}</loc>"
        f"<lastmod>{today}</lastmod>"
        f"<changefreq>{c}</changefreq><priority>{p}</priority></url>"
        for u, p, c in urls
    )
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + body + "\n</urlset>\n")

    print(f"sitemap: {len(urls)} URLs "
          f"({len([u for u in urls if u[0].startswith('cards/')])} cards), "
          f"{len(skipped)} noindex page(s) excluded: {', '.join(skipped) or 'none'}")
    return xml


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if sitemap.xml differs (ignoring lastmod dates)")
    args = ap.parse_args()

    fresh = build()

    if not args.check:
        with open(SITEMAP, "w", encoding="utf-8") as fh:
            fh.write(fresh)
        print("sitemap.xml written.")
        return 0

    if not os.path.exists(SITEMAP):
        print("SITEMAP FAILED: sitemap.xml does not exist.")
        return 1
    with open(SITEMAP, encoding="utf-8") as fh:
        current = fh.read()

    # lastmod moves every day; compare the URL set, which is what matters.
    strip = lambda t: sorted(re.findall(r"<loc>([^<]+)</loc>", t))
    if strip(current) != strip(fresh):
        cur, new = set(strip(current)), set(strip(fresh))
        for u in sorted(new - cur)[:10]:
            print(f"  MISSING from sitemap: {u}")
        for u in sorted(cur - new)[:10]:
            print(f"  STALE in sitemap: {u}")
        print("\nSITEMAP FAILED: out of date. "
              "Fix with:  python3 scripts/build-sitemap.py")
        return 1

    print("sitemap OK — matches the tracked, indexable page set.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
