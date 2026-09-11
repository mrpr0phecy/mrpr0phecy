#!/usr/bin/env python3
"""check.py — promo autopilot self-checks (also imported by staff tests).

    python3 scripts/promo/check.py

Automation that fails silently is worse than no automation: the failure mode
we care about is the promo kit quietly stopping while the owner assumes the
site is promoting itself. These checks answer "is the autopilot alive?" in
seconds, and the weekly workflow runs them before opening its PR.
"""
from __future__ import annotations

import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue, copy as promo_copy, pick  # noqa: E402

ROOT = catalogue.ROOT


def check_tracks() -> tuple[bool, str]:
    try:
        tracks = catalogue.load_tracks()
    except AssertionError as exc:
        return False, str(exc)
    ok = len(tracks) >= 40
    return ok, f"{len(tracks)} tracks parsed from listen.html"


def check_queue() -> tuple[bool, str]:
    queue = pick.load_queue()
    tools = {t["name"] for t in catalogue.load_tools()}
    vids = {t["youtube_id"] for t in catalogue.load_tracks()}
    bad_tools = [s for s in queue.get("tools", {}).values() if s not in tools]
    bad_tracks = [v for v in queue.get("tracks", {}).values() if v not in vids]
    if bad_tools or bad_tracks:
        return False, f"queue overrides unknown: {bad_tools + bad_tracks}"
    n = len(queue.get("tools", {})) + len(queue.get("tracks", {}))
    return True, f"queue valid ({n} override(s))"


def check_copy() -> tuple[bool, str]:
    """Every template, for every tool and track: lengths + banned phrases."""
    tools = catalogue.load_tools()
    try:
        for tool in tools:
            url = catalogue.tool_url(tool["name"])
            cat = tool.get("category") or "General"
            promo_copy.tool_short(tool, url)
            promo_copy.tool_mastodon(tool, url, cat)
            promo_copy.tool_linkedin(tool, url, cat, len(tools))
        for track in catalogue.load_tracks():
            track = {**track, "url": catalogue.track_url(track["youtube_id"])}
            promo_copy.track_post(track, "2026-W01")
    except AssertionError as exc:
        return False, f"copy failure: {exc}"
    return True, f"all templates clean for {len(tools)} tools + tracks"


def _generated_date(path: str) -> datetime.date | None:
    try:
        with open(path, encoding="utf-8") as fh:
            head = fh.read(2000)
    except FileNotFoundError:
        return None
    m = re.search(r"for (\d{4}-\d{2}-\d{2})", head)
    return datetime.date.fromisoformat(m.group(1)) if m else None


def check_spotlight(max_age_days: int = 9) -> tuple[bool, str]:
    stamp = _generated_date(os.path.join(ROOT, "spotlight.html"))
    if stamp is None:
        return False, "spotlight.html missing or has no generation stamp"
    age = (datetime.date.today() - stamp).days
    if age > max_age_days:
        return False, f"spotlight.html is {age} days old (>{max_age_days})"
    return True, f"spotlight.html current (for {stamp.isoformat()})"


def check_feed(max_age_days: int = 10) -> tuple[bool, str]:
    path = os.path.join(ROOT, "feed.xml")
    try:
        with open(path, encoding="utf-8") as fh:
            blob = fh.read()
    except FileNotFoundError:
        return False, "feed.xml missing"
    if "scripts/promo/feeds.py" not in blob:
        return False, "feed.xml is not the generated feed (takeover pending?)"
    m = re.search(r"<lastBuildDate>([^<]+)</lastBuildDate>", blob)
    if not m:
        return False, "feed.xml has no lastBuildDate"
    stamp = datetime.datetime.strptime(m.group(1), "%a, %d %b %Y %H:%M:%S %z").date()
    age = (datetime.date.today() - stamp).days
    if age > max_age_days:
        return False, f"feed.xml is {age} days old (>{max_age_days})"
    return True, f"feed.xml current (built {stamp.isoformat()})"


CHECKS = [
    ("tracks parse", check_tracks),
    ("queue valid", check_queue),
    ("copy clean", check_copy),
    ("spotlight fresh", check_spotlight),
    ("feed fresh", check_feed),
]


def main() -> int:
    failed = 0
    for name, fn in CHECKS:
        ok, detail = fn()
        print(("OK   " if ok else "FAIL ") + f"{name}: {detail}")
        failed += not ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
