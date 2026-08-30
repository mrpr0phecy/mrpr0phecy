#!/usr/bin/env python3
"""scan-seo.py — quick metadata/SEO scan of top-level pages (Product A + B).

Scans *.html in the repo root (cards are fragments by design and are skipped;
use check-cards.py for them). Sparse-checkout safe.

FAIL (exit 1): a page with no <title> (other than the documented exceptions).
WARN:  missing lang, meta description, canonical, twitter:card, theme-color,
       og:* tags, http:// OG/canonical URLs, or a <h1> count other than one.
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPECT = r"https://www\.themostusefulsiteintheworld\.com"
# Documented deliberate exceptions (ARCHITECTURE.md §7/§9)
EXCEPTIONS = {"hokidea.html"}

fails: list[str] = []
warns: list[str] = []

pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html"))
for f in pages:
    with open(os.path.join(ROOT, f), encoding="utf-8", errors="replace") as fh:
        t = fh.read()
    tag = f

    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", t)
    if not title or not title.group(1).strip():
        if f in EXCEPTIONS:
            print(f"  note: {tag}: no <title> — documented exception, left alone")
            continue
        fails.append(f"{tag}: no <title>")
        continue

    if not re.search(r"(?is)<html[^>]*\blang\s*=", t):
        warns.append(f"{tag}: <html> missing lang attribute")
    if not re.search(r"(?is)<meta[^>]*name=[\"']description[\"']", t):
        warns.append(f"{tag}: no meta description")
    if not re.search(r"(?is)<meta[^>]*name=[\"']twitter:card[\"']", t):
        warns.append(f"{tag}: no twitter:card")
    if not re.search(r"(?is)<meta[^>]*name=[\"']theme-color[\"']", t):
        warns.append(f"{tag}: no theme-color")

    # canonical / og:url must be https + www host
    for pat, label in (
        (r"(?is)<link[^>]*rel=[\"']canonical[\"'][^>]*href=[\"']([^\"']+)", "canonical"),
        (r"(?is)<meta[^>]*property=[\"']og:url[\"'][^>]*content=[\"']([^\"']+)", "og:url"),
    ):
        m = re.search(pat, t)
        if not m:
            warns.append(f"{tag}: no {label}")
        elif not re.match(r"^https://www\.", m.group(1)):
            warns.append(f"{tag}: {label} is {m.group(1)} — must be https://www.")

    for pat, label in (
        (r"(?is)<meta[^>]*property=[\"']og:title[\"']", "og:title"),
        (r"(?is)<meta[^>]*property=[\"']og:description[\"']", "og:description"),
        (r"(?is)<meta[^>]*property=[\"']og:image[\"']", "og:image"),
        (r"(?is)<meta[^>]*property=[\"']og:type[\"']", "og:type"),
    ):
        if not re.search(pat, t):
            warns.append(f"{tag}: no {label}")

    if re.search(r"(?is)(?:content|href)=[\"']http://", t):
        # Only flag OG/canonical-style http, not e.g. http://www.w3.org
        for m in re.finditer(r"(?is)(?:content|href)=[\"'](http://[^\"']+)", t):
            if "w3.org" not in m.group(1) and "schema.org" not in m.group(1):
                warns.append(f"{tag}: insecure http:// reference: {m.group(1)[:60]}")
                break

    h1s = re.findall(r"(?is)<h1[^>]*>", t)
    if len(h1s) != 1:
        warns.append(f"{tag}: {len(h1s)} <h1> (want exactly 1)")

print(f"scanned {len(pages)} top-level pages")
for w in warns:
    print(f"  WARN: {w}")
for fl in fails:
    print(f"  FAIL: {fl}")
sys.exit(1 if fails else 0)
