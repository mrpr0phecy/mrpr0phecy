#!/usr/bin/env python3
"""indexnow.py — tell Bing/Yandex/Naver about new URLs instantly.

    python3 scripts/promo/indexnow.py            # submit this week's URLs
    python3 scripts/promo/indexnow.py --all      # one-shot: every sitemap URL
    python3 scripts/promo/indexnow.py --dry-run  # print, don't submit

Why this matters for AI: ChatGPT search retrieves via the Bing index and
Copilot IS the Bing index, so a URL Bing hasn't crawled is a URL two major
assistants can't cite. IndexNow (Bing, Yandex, Seznam, Naver, Yep) is a free,
key-based ping: no account, no quota worth worrying about. Google doesn't
participate — Googlebot finds us via sitemap.xml as before.

The key is public by design (IndexNow verifies it by fetching {key}.txt from
the domain root), so it lives in the repo — no secrets needed. Submissions
only validate once the key file is deployed, i.e. after merging to main.
"""
from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = "https://www.themostusefulsiteintheworld.com"
HOST = "www.themostusefulsiteintheworld.com"
ENDPOINT = "https://api.indexnow.org/indexnow"


def find_key() -> str:
    candidates = [os.path.basename(p)[:-4] for p in
                  glob.glob(os.path.join(ROOT, "*.txt"))
                  if re.fullmatch(r"[0-9a-f]{32}\.txt", os.path.basename(p))]
    assert len(candidates) == 1, \
        f"expected exactly one IndexNow key file, found {candidates}"
    key = candidates[0]
    with open(os.path.join(ROOT, key + ".txt"), encoding="utf-8") as fh:
        assert fh.read().strip() == key, "key file content must equal its name"
    return key


def weekly_urls(day: datetime.date) -> list[str]:
    """URLs the weekly refresh touches: always worth re-pinging."""
    year, week, _ = day.isocalendar()
    return [
        f"{SITE}/spotlight.html",
        f"{SITE}/promo/week-{year}-W{week:02d}.html",
        f"{SITE}/feed.xml",
        f"{SITE}/llms.txt",
        f"{SITE}/tools-index.html",
    ]


def all_urls() -> list[str]:
    """Every sitemap URL — for the one-shot bootstrap after merge."""
    tree = ET.parse(os.path.join(ROOT, "sitemap.xml"))
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [loc.text for loc in tree.getroot().findall("s:url/s:loc", ns)]


def submit(urls: list[str], key: str, *, dry_run: bool) -> None:
    payload = {"host": HOST, "key": key,
               "keyLocation": f"{SITE}/{key}.txt", "urlList": urls}
    if dry_run:
        print(f"dry run — would submit {len(urls)} URLs:")
        for url in urls[:10]:
            print(f"  {url}")
        if len(urls) > 10:
            print(f"  …and {len(urls) - 10} more")
        return
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        ENDPOINT, data=data,
        headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"IndexNow: {resp.status} for {len(urls)} URLs")
            assert resp.status in (200, 202), f"unexpected status {resp.status}"
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"IndexNow HTTP {exc.code}: "
                         f"{exc.read().decode('utf-8', 'replace')[:200]}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Submit URLs to IndexNow.")
    ap.add_argument("--all", action="store_true",
                    help="submit every sitemap URL (one-shot bootstrap)")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    key = find_key()
    urls = all_urls() if args.all else weekly_urls(
        datetime.date.fromisoformat(args.date))
    print(f"key {key[:8]}… ({'dry run' if args.dry_run else 'live'})")
    submit(urls, key, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
