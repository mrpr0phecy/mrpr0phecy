#!/usr/bin/env python3
"""pick.py — deterministic Tool of the Day + Track of the Week.

    python3 scripts/promo/pick.py                       # today, as JSON
    python3 scripts/promo/pick.py --date 2026-09-20     # any date
    python3 scripts/promo/pick.py --date 2026-09-20 --slot track

Why deterministic: every consumer (daily poster, feed builder, spotlight
page, weekly archive, newsletter draft) recomputes the same pick for a date
independently, so there is no shared state to corrupt, no log to lose, and a
re-run never changes history. The rotation covers the whole catalogue before
repeating: 1119 tools is three years of daily posts with no repeats.

Human override: promo/queue.json maps dates to slugs. A queued slug wins over
the rotation — use it for launches, seasonal tools, or sponsor-adjacent picks.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue  # noqa: E402

ROOT = catalogue.ROOT
QUEUE = os.path.join(ROOT, "promo", "queue.json")

# Rotation epoch + shuffle seed. Changing either reshuffles every future pick
# (harmless — picks are recomputed, never stored — but don't churn it).
EPOCH = datetime.date(2026, 1, 1)
SHUFFLE_SEED = 0xC0FFEE


def stable_order(n: int) -> list[int]:
    """Deterministic shuffle of range(n): the rotation order."""
    order = list(range(n))
    random.Random(SHUFFLE_SEED).shuffle(order)
    return order


def load_queue() -> dict:
    if not os.path.exists(QUEUE):
        return {"tools": {}, "tracks": {}}
    with open(QUEUE, encoding="utf-8") as fh:
        data = json.load(fh)
    return {"tools": data.get("tools", {}), "tracks": data.get("tracks", {})}


def pick_tool(day: datetime.date, tools: list[dict] | None = None,
              queue: dict | None = None) -> dict:
    """Tool of the day: queued override, else rotation slot."""
    tools = tools if tools is not None else catalogue.load_tools()
    queue = queue if queue is not None else load_queue()
    key = day.isoformat()
    if key in queue.get("tools", {}):
        slug = queue["tools"][key]
        for tool in tools:
            if tool["name"] == slug:
                return tool
        raise SystemExit(f"promo/queue.json: unknown tool slug {slug!r} for {key}")
    order = stable_order(len(tools))
    slot = (day - EPOCH).days % len(tools)
    return tools[order[slot]]


def pick_track(day: datetime.date, tracks: list[dict] | None = None,
               queue: dict | None = None) -> dict:
    """Track of the week: queued override, else weekly rotation slot."""
    tracks = tracks if tracks is not None else catalogue.load_tracks()
    queue = queue if queue is not None else load_queue()
    year, week, _ = day.isocalendar()
    key = f"{year}-W{week:02d}"
    if key in queue.get("tracks", {}):
        vid = queue["tracks"][key]
        for track in tracks:
            if track["youtube_id"] == vid:
                return track
        raise SystemExit(f"promo/queue.json: unknown video id {vid!r} for {key}")
    slot = ((day - EPOCH).days // 7) % len(tracks)
    return tracks[slot]


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic promo picks.")
    ap.add_argument("--date", default=datetime.date.today().isoformat(),
                    help="ISO date (default: today)")
    ap.add_argument("--slot", choices=["tool", "track", "both"], default="both")
    args = ap.parse_args()
    day = datetime.date.fromisoformat(args.date)
    out: dict = {"date": day.isoformat()}
    if args.slot in ("tool", "both"):
        tool = pick_tool(day)
        out["tool"] = {
            "slug": tool["name"], "title": tool.get("title") or tool["name"],
            "description": tool.get("description") or "",
            "category": tool.get("category") or "General",
            "url": catalogue.tool_url(tool["name"]),
        }
    if args.slot in ("track", "both"):
        track = pick_track(day)
        out["track"] = {
            "youtube_id": track["youtube_id"], "title": track["title"],
            "emoji": track["emoji"], "url": catalogue.track_url(track["youtube_id"]),
        }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
