#!/usr/bin/env python3
"""Growth-surface integrity (staff audit `growth`, owner: growth).

Static guards for the pages that turn usefulness into revenue and reach:
money pages exist, are reachable from the hubs, carry a conversion route,
resolve their funnel links, stay free of dark patterns, and the Product B
licensing edge (listen -> sync) stays connected.

This proves structure, not performance: no static check can show that a
page converts. Revenue and funnel evidence come from GA (within D-007),
the inbox and Search Console.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MONEY_PAGES = ["donate.html", "sponsor.html", "embed.html", "sync.html"]
HUBS = ["index.html", "tools-index.html", "listen.html", "music.html",
        "donate.html", "sponsor.html", "embed.html", "sync.html"]

# Pressure language that must never appear on a money page. Plainspoken
# trust is the conversion strategy; urgency that is real (e.g. the YPP
# deadline) lives in dated staff notes, not on pages.
BANNED = [
    r"act\s+now", r"limited\s+time", r"last\s+chance", r"miss\s+out",
    r"\bhurry\b", r"only\s+\d*\s*left", r"risk-free",
    r"guaranteed\s+income", r"double\s+your", r"once\s+in\s+a\s+lifetime",
    r"\bexpires\s+(in|tonight|today)",
]
BANNED_RE = re.compile("|".join("(?:" + p + ")" for p in BANNED), re.I)
HREF_RE = re.compile(r'href="([^"#]+?)(?:#[^"]*)?"')


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def catalogue_slugs():
    import json
    with open(os.path.join(ROOT, "cards", "cards.json"),
              encoding="utf-8") as f:
        cards = json.load(f)
    tools = cards["tools"] if isinstance(cards, dict) else cards
    return set(c["name"] for c in tools if c.get("name"))


def main():
    failures = []   # correctness: block (missing, dark, broken)
    warnings = []   # reachability: report, do not block
    slugs = catalogue_slugs()

    # 1. Money surfaces exist.
    for page in MONEY_PAGES:
        if not os.path.isfile(os.path.join(ROOT, page)):
            failures.append("missing money page: " + page)
    if failures:
        print("GROWTH CHECK FAILED")
        print("\n".join("  - " + f for f in failures))
        return 1

    bodies = {p: read(p) for p in MONEY_PAGES}
    hubs = {h: read(h) for h in HUBS if os.path.isfile(os.path.join(ROOT, h))}

    # 2. Every money page is linked from at least one hub (no orphan offers).
    for page in MONEY_PAGES:
        if not any(('href="' + page + '"') in b or ("'" + page + "'") in b
                   for h, b in hubs.items() if h != page):
            warnings.append("orphan money page (no hub links to it): " + page)

    # 3. Every money page carries a conversion route.
    for page, body in bodies.items():
        if "mailto:" not in body and "paypal" not in body.lower():
            warnings.append("no conversion route (mailto/paypal) on " + page)

    # 4. No dark patterns on money pages.
    for page, body in bodies.items():
        text = re.sub(r"<script.*?</script>", " ", body,
                      flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        hit = BANNED_RE.search(text)
        if hit:
            failures.append("dark-pattern phrase on %s: %r"
                            % (page, hit.group(0)))

    # 5. Funnel links on money pages resolve; ?card= slugs must be catalogue.
    for page, body in bodies.items():
        for href in set(HREF_RE.findall(body)):
            if re.match(r"(https?:|mailto:|tel:|data:)", href):
                continue
            base, _, query = href.partition("?")
            target = os.path.normpath(os.path.join(ROOT, base))
            if not os.path.isfile(target):
                failures.append("%s links to missing file: %s" % (page, href))
                continue
            if base == "tool.html":
                m = re.search(r"[?&]card=([^&\"']+)", href)
                if m and m.group(1) not in slugs:
                    failures.append("%s links to unknown card: %s"
                                    % (page, href))

    # 6. Product B licensing edge stays connected.
    if "sync.html" not in hubs.get("listen.html", ""):
        warnings.append("listen.html no longer links sync.html")

    for w in warnings:
        print("  warning: " + w)
    if failures:
        print("GROWTH CHECK FAILED")
        print("\n".join("  - " + f for f in failures))
        return 1
    print("growth surfaces OK — money pages present, routed where linked, "
          "funnel links resolve, no dark patterns.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
