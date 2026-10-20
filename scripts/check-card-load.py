#!/usr/bin/env python3
"""check-card-load.py — a card may not hold the page hostage while it loads.

Every tool is opened by someone who wants the answer now. Cards are fragments
inlined into a generated page, which means anything a card does at parse time
is the page's first impression: a parser-blocking third-party script, an
unbounded network request, or a synchronous XHR can leave the visitor looking
at nothing while the browser waits for somebody else's server.

Three rules, each one a real incident:

  1. NO PARSER-BLOCKING REMOTE SCRIPT. A `<script src="https://…">` in card
     markup stops the HTML parser at that line. On a network where the CDN
     stalls — filtered, proxied, slow — the card renders nothing at all until
     the socket gives up (evolution-walker, motor-startup: three.js and
     Chart.js, injected asynchronously now). Load libraries by creating a
     script element with `async = true`; the cards already know how to run
     without them.

  2. NO UNBOUNDED fetch(). fetch() has no timeout of its own. A request that
     never answers leaves the card on its loading state for as long as the
     browser is willing to wait — minutes on a stalled connection. Every card
     that fetches from the network must create an AbortController and abort
     (cat-photo-viewer, dog-photo-viewer and the eight API cards now stop at
     ten seconds and use their own error path).

  3. NO SYNCHRONOUS XHR. `open(..., false)` blocks the main thread until the
     response arrives; nothing on the page can paint or respond while it does.

The list below is for cards whose fetch() is local by construction (a data:
or blob: URL the card just produced). Adding to it is a reviewed decision,
and the reason has to be written down here.

Usage:
    python3 scripts/check-card-load.py
    python3 scripts/check-card-load.py --verbose
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# slug -> why a fetch() with no AbortController cannot reach a socket.
LOCAL_FETCH = {
    "thumbnail-generator": "fetches a data: URL it built in the same function",
}

SCRIPT_BLOCK = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", re.I)
REMOTE_SCRIPT = re.compile(r"<script\b[^>]*\bsrc\s*=\s*['\"]https?://[^>]*>", re.I)
XHR_SYNC = re.compile(r"\.open\s*\([^)]*,\s*false\s*\)")


def cards() -> list[str]:
    return sorted(name for name in os.listdir(CARDS) if name.endswith(".html"))


def blocking_remote_scripts(text: str) -> list[str]:
    # A `<script src>` written inside an inline script is a string the card
    # emits (cookie-consent-banner-builder prints a demo banner), not markup
    # the parser will stop on. Drop the inline blocks first, then scan what is
    # left — that is what the browser parses as markup.
    markup = SCRIPT_BLOCK.sub("", text)
    offenders = []
    for tag in REMOTE_SCRIPT.findall(markup):
        # defer/async are explicit "do not block the parser" opt-outs.
        if re.search(r"\b(defer|async)\b", tag, re.I):
            continue
        offenders.append(tag[:120])
    return offenders


def main() -> int:
    verbose = "--verbose" in sys.argv
    problems: list[str] = []
    counts = {"remote": 0, "fetch": 0, "bounded": 0, "exempt": 0, "xhr": 0}

    for name in cards():
        slug = name[:-5]
        text = open(os.path.join(CARDS, name), encoding="utf-8").read()

        for tag in blocking_remote_scripts(text):
            counts["remote"] += 1
            problems.append(
                f"{name}: parser-blocking remote script — {tag}\n"
                "    a CDN that stalls holds the whole card. Create the script element and set "
                "async = true; the card must render without the library.")

        # Only the card's own inline scripts can fetch; the generated page adds
        # its own two lines that are checked elsewhere.
        for block in SCRIPT_BLOCK.findall(text):
            if "fetch(" in block:
                counts["fetch"] += 1
                if "AbortController" in block:
                    counts["bounded"] += 1
                elif slug in LOCAL_FETCH:
                    counts["exempt"] += 1
                else:
                    problems.append(
                        f"{name}: fetch() with no AbortController — an unanswered request waits "
                        "for the browser's own timeout (minutes).\n"
                        "    Add the ten-second bound the other network cards use "
                        "(see cat-photo-viewer's fetchJson).")
            if XHR_SYNC.search(block):
                counts["xhr"] += 1
                problems.append(
                    f"{name}: synchronous XMLHttpRequest — the main thread, and the page with it, "
                    "stops until the response arrives.")

    if verbose:
        print(f"  {len(cards())} cards · {counts['fetch']} fetch — {counts['bounded']} bounded, "
              f"{counts['exempt']} local-only, "
              f"{counts['remote']} blocking remote script(s), {counts['xhr']} synchronous XHR")

    if problems:
        print("CARD LOAD FAILED — a card can hold the page hostage while it loads:\n")
        for p in problems:
            print("  ✗ " + p)
        return 1

    print(f"CARD LOAD OK — {counts['fetch']} fetching card(s), all bounded; "
          "no parser-blocking remote script, no synchronous XHR.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
