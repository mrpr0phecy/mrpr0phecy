#!/usr/bin/env python3
"""check-egress.py — cards must not silently send user input off-device.

Cards are meant to run entirely in the browser. This classifies every card
that touches the network, so egress can never be added quietly:

  A  input egress   — user input is sent to a third party. Must carry a
                      visible in-card warning until re-engineered locally.
  B  CDN code       — loads a library from a CDN. Documented exception.
  C  live data      — fetching public data IS the tool. Legitimate.

Class A cards without a visible warning FAIL. Anything network-touching that
is not on the allow-list below FAILS too, so a new card cannot quietly add
egress: classify it here (with the owner) or make it local.
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# slug -> class. Adding a card here is a deliberate, reviewed exception.
KNOWN = {
    "ai-mcp-protocol-tool-tester": "A",   # user-supplied endpoint, by design
    "cat-photo-viewer": "C",
    "currency": "C",
    "dog-photo-viewer": "C",
    "plant-encyclopedia": "C",
    "sl-events": "C",
    "sl-region-map": "C",
    "spelling-check": "C",
    "censorship-monitor": "C",
    "premier-league": "C",
    "budget": "B",                        # chart.js from jsDelivr
    "evolution-walker": "B",              # three.js from cdnjs
    # Product B mini-games embed the official YouTube IFrame player API.
    # No user input is sent; YouTube's own player is the point of the tool.
    "mrprophecy-beat-memory": "B",
    "mrprophecy-beat-runner": "B",
    "mrprophecy-crowd-surf": "B",
    "mrprophecy-lyric-scramble": "B",
    "mrprophecy-mix-board": "B",
    "mrprophecy-name-that-track": "B",
    "mrprophecy-rhythm-tap": "B",
    "mrprophecy-studio-defender": "B",
    "mrprophecy-tour-manager": "B",
    "mrprophecy-vinyl-catch": "B",
    "youtube-dj": "B",
}

# Text that counts as a visible warning on a Class A card.
WARN_RE = re.compile(r"(?is)(⚠|sent to|third[- ]party|leaves your device|never sent)")

NET_RE = re.compile(
    r"""(?ix)
    fetch\s*\(\s*['"`]https?:      # fetch('https://...
  | new\s+XMLHttpRequest
  | \.src\s*=\s*['"`]https?:       # img/script src assigned to a remote URL
  | <script[^>]+src=['"]https?:
    """
)

fails: list[str] = []
report: dict[str, list[str]] = {"A": [], "B": [], "C": []}

if not os.path.isdir(CARDS):
    print("cards/ not on disk (sparse checkout) — skipped")
    sys.exit(0)

for name in sorted(os.listdir(CARDS)):
    if not name.endswith(".html"):
        continue
    slug = name[:-5]
    with open(os.path.join(CARDS, name), encoding="utf-8", errors="replace") as fh:
        t = fh.read()
    if not NET_RE.search(t):
        continue
    cls = KNOWN.get(slug)
    if cls is None:
        fails.append(f"{name}: makes network calls but is not classified below "
                     f"(make it local, or classify it with the owner)")
        continue
    report[cls].append(slug)
    if cls == "A" and not WARN_RE.search(t):
        fails.append(f"{name}: Class A (input egress) with no visible in-card warning")

for cls in "ABC":
    if report[cls]:
        print(f"  class {cls}: {', '.join(report[cls])}")
print(f"egress scan: {sum(len(v) for v in report.values())} network-touching card(s)")
for f in fails:
    print(f"  FAIL: {f}")
if fails:
    print(f"EGRESS FAILED ({len(fails)} problem(s)).")
    sys.exit(1)
print("EGRESS OK — no card leaks user input.")
