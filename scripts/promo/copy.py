#!/usr/bin/env python3
"""copy.py — post text templates. Pure functions in, tested strings out.

    python3 scripts/promo/copy.py                       # today's posts
    python3 scripts/promo/copy.py --date 2026-09-20     # any date

Every template is length-budgeted for its network (Bluesky 300 graphemes,
Mastodon 500, X 280 — we use the X budget for Bluesky too so one text serves
both) and every rendered string passes through assert_clean(), which enforces
the staffroom D-002 rule: the site runs analytics, so promo copy must never
deny it with "no tracking / no analytics / no cookies" phrasing. The true,
approved claims are "no sign-ups", "no accounts", and "runs in your browser".
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue, pick  # noqa: E402

SITE = catalogue.SITE

# Mirror of the D-002 banned phrases in scripts/check-finance.js. Promo copy is
# also scanned by staff/tests/test_promo.py, so a regression fails verify.sh.
BANNED = [
    re.compile(r"\bno tracking\b", re.I),
    re.compile(r"\bno trackers\b", re.I),
    re.compile(r"\bno analytics\b", re.I),
    re.compile(r"\bno cookies\b", re.I),
    re.compile(r"100%\s*private(?!\s+(?:in-browser|in browser))", re.I),
]


def assert_clean(text: str) -> str:
    for banned in BANNED:
        assert not banned.search(text), f"banned D-002 phrase in promo copy: {banned.pattern}"
    return text


def _title(tool: dict) -> str:
    return catalogue.plain(tool.get("title") or tool["name"])


def tool_short(tool: dict, url: str) -> str:
    """One text for Bluesky + X: title, one line, link. ≤280 chars."""
    desc = catalogue.short(tool.get("description") or "Free browser tool.", 110)
    text = (
        f"🛠️ Tool of the day: {_title(tool)}\n"
        f"{desc}\n"
        f"Free in your browser, no sign-up.\n"
        f"{url}"
    )
    if len(text) > 280:
        over = len(text) - 280
        desc = catalogue.short(tool.get("description") or "", max(40, 110 - over))
        text = (
            f"🛠️ {_title(tool)}\n{desc}\nFree, no sign-up.\n{url}"
        )
    assert len(text) <= 280, f"short post overflow ({len(text)}): {text[:60]}…"
    return assert_clean(text)


def tool_mastodon(tool: dict, url: str, category: str) -> str:
    """Mastodon: room for the category + hashtags. ≤500 chars."""
    desc = catalogue.short(tool.get("description") or "Free browser tool.", 220)
    tag = re.sub(r"[^A-Za-z0-9]+", "", category.split("&")[0].title()) or "Tools"
    text = (
        f"🛠️ Tool of the day: {_title(tool)}\n\n"
        f"{desc}\n\n"
        f"Free in your browser, no sign-up, nothing to install.\n"
        f"{url}\n\n"
        f"#Tools #{tag} #FreeSoftware"
    )
    assert len(text) <= 500, f"mastodon post overflow ({len(text)})"
    return assert_clean(text)


def tool_linkedin(tool: dict, url: str, category: str, count: int) -> str:
    """LinkedIn: professional framing + the licensing funnel, weekly cadence.

    Posted only on Mondays (the weekly refresh day) — LinkedIn punishes daily
    automation, and one thoughtful post beats seven skipped ones.
    """
    desc = catalogue.short(tool.get("description") or "Free browser tool.", 400)
    text = (
        f"One free tool, every day, no sign-up.\n\n"
        f"Today's: {_title(tool)} ({category}). {desc}\n\n"
        f"Try it here: {url}\n\n"
        f"It's one of {count} browser tools on the site — all free for personal\n"
        f"use, and every one of them embeddable on a company intranet or client\n"
        f"site (free with a credit line, white-label licences from £99/year).\n"
        f"If your team still passes spreadsheets around for this kind of thing,\n"
        f"there's probably a tool for it: {SITE}/embed.html"
    )
    return assert_clean(text)


def track_post(track: dict, week_label: str) -> str:
    """Weekly music post: the animated video + the sync funnel. ≤280 chars."""
    name = catalogue.safe_text(track["title"])
    text = (
        f"🎬 Track of the week: {name} {track['emoji']}\n"
        f"An animated MrProphecy music video — free to watch.\n"
        f"{track['url']}\n"
        f"Need music for a project? Sync licences from £50: {SITE}/sync.html"
    )
    if len(text) > 280:  # long titles: drop the funnel line, keep the video
        text = (
            f"🎬 Track of the week ({week_label}): {name}\n"
            f"{track['url']}"
        )
    assert len(text) <= 280, f"track post overflow ({len(text)})"
    return assert_clean(text)


def weekly_roundup(day: datetime.date, tools: list[dict],
                   track: dict) -> str:
    """Plain-text recap of a week's picks — feeds the archive page + newsletter."""
    lines = [
        f"Seven free tools from the week of {day.isoformat()} — each one runs "
        f"in your browser with no sign-up:",
        "",
    ]
    for i, tool in enumerate(tools):
        day_i = day + datetime.timedelta(days=i)
        lines.append(
            f"{day_i.strftime('%a')}: {_title(tool)} — "
            f"{catalogue.short(tool.get('description') or '', 120)}"
        )
        lines.append(f"  {catalogue.tool_url(tool['name'])}")
    lines += [
        "",
        f"🎬 Track of the week: {catalogue.safe_text(track['title'])} — {track['url']}",
        "",
        "Run a site or intranet? Every tool embeds with one iframe "
        f"(free with a credit line): {SITE}/embed.html",
    ]
    return assert_clean("\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser(description="Render promo copy for a date.")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    day = datetime.date.fromisoformat(args.date)
    tools = catalogue.load_tools()
    tool = pick.pick_tool(day, tools)
    track = dict(pick.pick_track(day))
    track["url"] = catalogue.track_url(track["youtube_id"])
    url = catalogue.tool_url(tool["name"])
    year, week, _ = day.isocalendar()
    print("=== short (Bluesky/X) ===")
    print(tool_short(tool, url))
    print("\n=== mastodon ===")
    print(tool_mastodon(tool, url, tool.get("category") or "General"))
    print("\n=== linkedin (Mondays) ===")
    print(tool_linkedin(tool, url, tool.get("category") or "General", len(tools)))
    print("\n=== track ===")
    print(track_post(track, f"{year}-W{week:02d}"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
