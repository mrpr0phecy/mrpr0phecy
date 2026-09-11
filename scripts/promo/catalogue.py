#!/usr/bin/env python3
"""catalogue.py — read-only access to the tools + tracks the promo kit draws on.

The tools come from cards/cards.json (the same source embed.html is built
from, so picks can never disagree with the catalogue). The music picks come
from listen.html's video tiles, parsed with a regex — no new curated list to
rot; when a video is added to the page it joins the rotation automatically.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = "https://www.themostusefulsiteintheworld.com"
CARDS_JSON = os.path.join(ROOT, "cards", "cards.json")
LISTEN_HTML = os.path.join(ROOT, "listen.html")


def load_tools() -> list[dict]:
    """All catalogue tools, stable order (cards.json order)."""
    with open(CARDS_JSON, encoding="utf-8") as fh:
        tools = json.load(fh)
    assert isinstance(tools, list) and tools, "cards.json is empty or misshapen"
    return tools


_TILE = re.compile(
    r'<button class="vtile" data-id="([^"]+)" data-title="([^"]+)"[^>]*>(.*?)</button>',
    re.S,
)
_VEMO = re.compile(r'<span class="vemo">([^<]*)</span>')


def load_tracks() -> list[dict]:
    """MrProphecy video tracks: [{youtube_id, title, emoji}]."""
    with open(LISTEN_HTML, encoding="utf-8") as fh:
        page = fh.read()
    tiles = _TILE.findall(page)
    assert tiles, "no video tiles found in listen.html — has the markup changed?"
    tracks = []
    for vid, title, body in tiles:
        vemo = _VEMO.search(body)
        tracks.append({
            "youtube_id": vid,
            "title": title,
            "emoji": vemo.group(1) if vemo else "🎬",
        })
    return tracks


def tool_url(slug: str) -> str:
    return f"{SITE}/tool.html?card={slug}"


def track_url(youtube_id: str) -> str:
    return f"https://www.youtube.com/watch?v={youtube_id}"


# After truncation no "100% private in-browser" scope can be trusted — the
# cut may have amputated it ("100% private in-…") — so the post-cut pass
# rewrites unconditionally. Pre-cut, safe_text() keeps the scoped form D-002
# allows; only the severed remnant is ever rewritten here.
_PRIVATE_BARE = re.compile(r"100%\s*private\b", re.I)


def short(text: str, n: int) -> str:
    """Collapse whitespace, truncate to n chars at a word boundary + ellipsis."""
    text = " ".join(safe_text(text or "").split())
    if len(text) <= n:
        return text
    cut = text[: n - 1].rstrip()
    space = cut.rfind(" ")
    if space > n // 2:
        cut = cut[:space]
    return _PRIVATE_BARE.sub("private by design", cut.rstrip() + "…")


_EMOJI = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # emoticons, symbols, pictographs
    "\u2600-\u27BF"          # misc symbols, dingbats
    "\u2B00-\u2BFF"          # misc symbols and arrows
    "\uFE0F"                 # variation selector
    "]"
)


_SOURCE_FIXES = [
    # Catalogue copy predates the D-002 rule and a few descriptions use its
    # banned phrasing ("100% private"). Promo surfaces must never repeat it
    # (spotlight.html is scanned by check-finance.js), so rewrite to the
    # approved equivalents at the plain()/short() choke points. Meaning is
    # preserved: the tools genuinely run locally with zero third parties.
    (re.compile(r"100%\s*private(?!\s+(?:in-browser|in browser))", re.I),
     "private by design"),
    (re.compile(r"\bno tracking\b", re.I), "nothing to track"),
    (re.compile(r"\bno trackers\b", re.I), "zero trackers"),
    (re.compile(r"\bno analytics\b", re.I), "zero analytics"),
    (re.compile(r"\bno cookies\b", re.I), "zero cookies"),
]


def safe_text(text: str) -> str:
    """Rewrite D-002-banned phrases in catalogue-sourced text."""
    for pattern, replacement in _SOURCE_FIXES:
        text = pattern.sub(replacement, text or "")
    return text


def plain(text: str) -> str:
    """Strip emoji/symbols for contexts without emoji glyphs (PNG cards).

    DejaVu (the CI-available font) has no emoji coverage, so rendered cards
    would show tofu boxes. Post text keeps its emoji; cards use this.
    """
    text = safe_text(text or "")
    text = _EMOJI.sub("", text)
    text = unicodedata.normalize("NFKC", text)
    return " ".join(text.split())
