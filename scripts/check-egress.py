#!/usr/bin/env python3
"""check-egress.py — cards must not silently send user input off-device.

Cards are meant to run entirely in the browser. This classifies every card
that touches the network, so egress can never be added quietly:

  A  input egress   — user input is sent to a third party. Must carry a
                      visible in-card warning until re-engineered locally.
  B  CDN code       — loads a library from a CDN. Documented exception.
  C  live data      — fetching public data IS the tool. Legitimate.
  L  local fetch    — fetch() only reaches data:/blob: URLs the card just
                      generated on the device. Verified manually, no egress.

Anything network-touching that is not on the allow-list below FAILS, so a
new card cannot quietly add egress: classify it here (with the owner) or
make it local.

Detection is markup-aware. Real network operations are detected in both
markup and inline script:
  - <script src="https://…">          in markup (an example <script> tag
                                      inside a JS *string* is not a call)
  - fetch(…)                          with a variable/expression argument,
                                      or a quoted http(s):// or
                                      protocol-relative // URL — this is
                                      how dynamically built API calls used
                                      to slip past (qrtool once posted
                                      every encoded URL, Wi-Fi credential
                                      and contact card to
                                      api.qrserver.com via fetch(variable))
  - XMLHttpRequest, sendBeacon, WebSocket, EventSource, importScripts
  - .src = / .href = "https://…"      dynamic remote resource assignment

Quoted *relative* fetches (fetch('./data.json')) stay same-origin and are
not flagged. A fetch() of a quoted data:/blob: URL alone does not make a
card network-touching; a variable-argument fetch still requires
classification because the target cannot be proven local.
"""
from __future__ import annotations

import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# slug -> class. Adding a card here is a deliberate, reviewed exception.
KNOWN = {
    "ai-mcp-protocol-tool-tester": "A",   # user-supplied endpoint, by design
    "cat-photo-viewer": "C",
    "currency": "C",
    "dog-photo-viewer": "C",
    "languages": "C",                     # translation service IS the tool;
                                          # card already warns text is sent
    "plant-encyclopedia": "C",
    "sl-events": "C",
    "sl-region-map": "C",
    "spelling-check": "C",
    "censorship-monitor": "C",
    "premier-league": "C",
    "pro-seo-audit-toolkit": "C",        # fetches user-supplied URL for SEO audit; offline paste still works
    "thumbnail-generator": "L",           # fetch() only reaches the card's
                                          # own canvas data: URLs (no https
                                          # literal in the file at all)
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


class _Split(HTMLParser):
    """Separate real markup from inline <script> bodies.

    `<script src="https://…">` written inside a JavaScript string (example
    code a card generates for visitors to copy) must not count as a network
    call, so script-tag detection runs on markup only.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.markup: list[str] = []
        self.scripts: list[str] = []
        self.remote_script_srcs: list[str] = []
        self._in_script = False
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self._in_script = True
            self._buf = []
            src = dict(attrs).get("src", "")
            if src.startswith(("http://", "https://")):
                self.remote_script_srcs.append(src)

    def handle_startendtag(self, tag, attrs):
        if tag == "script":
            src = dict(attrs).get("src", "")
            if src.startswith(("http://", "https://")):
                self.remote_script_srcs.append(src)

    def handle_endtag(self, tag):
        if tag == "script" and self._in_script:
            self._in_script = False
            self.scripts.append("".join(self._buf))

    def handle_data(self, data):
        if self._in_script:
            self._buf.append(data)
        else:
            self.markup.append(data)


def _js_without_comments(js: str) -> str:
    js = re.sub(r"/\*.*?\*/", " ", js, flags=re.S)
    # Line comments, but never the // inside http:// or https://.
    return re.sub(r"(?m)(?<!:)//[^\n]*", " ", js)


# fetch(variable) or fetch(expression) — target not provably same-origin.
FETCH_VAR = re.compile(r"\bfetch\s*\(\s*[^'\"`\s)]")
# fetch('https://…') / fetch("https://…") / fetch('//host/…')
FETCH_REMOTE = re.compile(r"\bfetch\s*\(\s*['\"]\s*(?:https?:)?//")
# Other direct network APIs.
XHR_ETC = re.compile(
    r"\bnew\s+XMLHttpRequest\b"
    r"|\bsendBeacon\s*\("
    r"|\bnew\s+WebSocket\b"
    r"|\bnew\s+EventSource\b"
    r"|\bimportScripts\s*\("
)
# Dynamic assignment of a remote resource.
DYN_REMOTE = re.compile(r"\.(?:src|href)\s*=\s*['\"`]https?:")


def _network_hints(markup: str, js: str, remote_script_srcs: list[str]) -> list[str]:
    hints: list[str] = []
    if remote_script_srcs:
        hints.append("remote <script src>")
    js_nc = _js_without_comments(js)
    if FETCH_VAR.search(js_nc):
        hints.append("fetch(variable)")
    if FETCH_REMOTE.search(js_nc):
        hints.append("fetch(remote URL)")
    if XHR_ETC.search(js_nc):
        hints.append("XHR/sendBeacon/WS")
    if DYN_REMOTE.search(js_nc):
        hints.append("dynamic remote src/href")
    return hints


fails: list[str] = []
report: dict[str, list[str]] = {"A": [], "B": [], "C": [], "L": []}

if not os.path.isdir(CARDS):
    print("cards/ not on disk (sparse checkout) — skipped")
    sys.exit(0)

for name in sorted(os.listdir(CARDS)):
    if not name.endswith(".html"):
        continue
    slug = name[:-5]
    with open(os.path.join(CARDS, name), encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    splitter = _Split()
    try:
        splitter.feed(text)
    except Exception as exc:  # malformed HTML should not silently pass
        fails.append(f"{name}: unparseable HTML ({exc})")
        continue
    js = "\n".join(splitter.scripts)

    hints = _network_hints("".join(splitter.markup), js, splitter.remote_script_srcs)
    if not hints:
        continue

    cls = KNOWN.get(slug)
    if cls is None:
        fails.append(
            f"{name}: makes network calls ({', '.join(hints)}) but is not "
            "classified below (make it local, or classify it with the owner)"
        )
        continue
    if cls == "A" and not WARN_RE.search(text):
        fails.append(f"{name}: class A (input egress) without a visible warning")
    report.setdefault(cls, []).append(slug)

for cls in ("A", "B", "C", "L"):
    if report.get(cls):
        print(f"  class {cls}: {', '.join(sorted(report[cls]))}")
print(f"egress scan: {sum(len(v) for v in report.values())} classified, "
      f"{len(fails)} problem(s)")
for f in fails:
    print(f"  FAIL: {f}")
if fails:
    print("EGRESS FAILED (%d problem(s))." % len(fails))
    sys.exit(1)
print("EGRESS OK.")
