#!/usr/bin/env python3
"""build-sitemap.py — regenerate sitemap.xml from what git actually tracks.

    python3 scripts/build-sitemap.py            # rewrite sitemap.xml
    python3 scripts/build-sitemap.py --check    # fail if it is out of date

Two rules this encodes, both learned the hard way:

1. **Build from `git ls-files`, not the working tree.** Agents work in sparse
   checkouts where `cards/` or `images/` may be absent; globbing the disk
   silently drops 644 pages and ships a gutted sitemap.

2. **Never list a `noindex` page.** Submitting a page you have told robots to
   ignore is a contradictory signal. `404.html` is excluded automatically by
   reading its robots meta — not by a hardcoded list that would rot the moment
   a page changed. The scratch pages this paragraph used to cite (hokidea.html
   and indexbeta.html) were themselves deleted on 2026-09-20.

3. **`git add` new files before running the build.** Because of rule 1, a file
   that exists on disk but is not yet tracked is invisible here. This bites in
   two places that look unrelated: a brand-new `cards/<slug>.html`, and a
   brand-new `categories/<slug>.html` created by a category that did not exist
   before. `npm run build` writes the category page and then the sitemap in the
   same run, so the first build under-counts by one and `verify.sh` fails with
   `MISSING from sitemap`. Stage, then build again.

4. **`lastmod` is the page's own last commit, not the build date.** It used to
   be `today` for all 2,975 URLs, rewritten on every build. A `lastmod` that
   changes without the page changing is the one signal Google's documentation
   says it will stop believing — and on a site this size it is the lever that
   gets the pages that matter recrawled after an edit. So each URL now carries
   the date of the last commit that touched it (`git log` is newest-first, so
   one pass builds the whole map), except for files that are dirty in the
   working tree: those are about to be committed, so they get `today`.

   Two consequences worth knowing. `--check` still compares the URL set only:
   `lastmod` is derived from local history, and CI checks out with
   `fetch-depth: 1`, where nothing but the tip commit exists — comparing it
   there would fail every night. Build the sitemap in a full clone before
   deploying; a shallow clone says so on stdout and falls back to `today` for
   files with no history in it.

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
from typing import Dict, Set

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://www.themostusefulsiteintheworld.com"
SITEMAP = os.path.join(ROOT, "sitemap.xml")

# Hand-tuned priorities for the pages that matter most.
PRIORITY = {
    "listen.html": ("1.0", "weekly"),
    "music.html": ("0.9", "weekly"),
    "index.html": ("0.9", "daily"),
    "youtubepromo2.html": ("0.7", "monthly"),
    # The licence-funnel landing page: commercial intent, follows the catalogue.
    "embed-finance.html": ("0.6", "weekly"),
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


def commit_dates() -> Dict[str, str]:
    """Newest commit date per tracked path, from a single `git log` pass.

    `git log` walks newest-first, so the first date seen for a path is the most
    recent one. `--no-renames` makes a moved file read as a delete plus an add,
    which is the honest answer: the new path has its own history.
    """
    dates: Dict[str, str] = {}
    try:
        out = subprocess.run(
            ["git", "log", "--format=@%cs", "--name-only", "--no-renames"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return dates
    current = ""
    for line in out.splitlines():
        if line.startswith("@"):
            current = line[1:].strip()
        elif line.strip() and current:
            dates.setdefault(line, current)
    return dates


def dirty_paths() -> Set[str]:
    """Paths that differ from HEAD, staged or not — about to be committed."""
    try:
        raw = subprocess.run(
            ["git", "status", "--porcelain", "-z"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return set()
    out: Set[str] = set()
    skip_old_path = False
    for rec in raw.split("\0"):
        if not rec:
            continue
        if skip_old_path:          # second half of a rename/copy record
            skip_old_path = False
            continue
        status, path = rec[:2], rec[3:]
        out.add(path)
        if "R" in status or "C" in status:
            skip_old_path = True
    return out


def is_shallow() -> bool:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--is-shallow-repository"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip() == "true"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def build() -> str:
    today = datetime.date.today().isoformat()
    html = tracked_html()
    dates = commit_dates()
    dirty = dirty_paths()

    def lastmod(rel: str) -> str:
        if rel in dirty:
            return today            # editing now: the next commit is today
        return dates.get(rel, today)

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
        f"<lastmod>{lastmod(u)}</lastmod>"
        f"<changefreq>{c}</changefreq><priority>{p}</priority></url>"
        for u, p, c in urls
    )
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + body + "\n</urlset>\n")

    print(f"sitemap: {len(urls)} URLs "
          f"({len([u for u in urls if u[0].startswith('cards/')])} cards), "
          f"{len(skipped)} noindex page(s) excluded: {', '.join(skipped) or 'none'}")
    spread = len({lastmod(u) for u, _, _ in urls})
    print(f"  lastmod: {spread} distinct date(s), {len(dirty & {u for u, _, _ in urls})} "
          f"URL(s) dated today because they are dirty in the working tree")
    if is_shallow():
        print("  note: shallow clone — paths with no history here fall back to today. "
              "Build in a full clone before deploying.")
    return xml


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the URL set differs (lastmod is derived from "
                         "local history, so it is not compared)")
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

    # Compare the URL set, not lastmod: the dates come from local history and
    # CI checks out with fetch-depth 1, so a lastmod comparison would fail every
    # night in CI while telling you nothing about the deployed file.
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
