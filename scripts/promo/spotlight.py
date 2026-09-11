#!/usr/bin/env python3
"""spotlight.py — Tool-of-the-Day page + weekly archive + newsletter draft.

    python3 scripts/promo/spotlight.py                  # everything, for today
    python3 scripts/promo/spotlight.py --date 2026-09-14

Generates three things, all from deterministic picks (no stored state):
  * spotlight.html — today's pick, re-rendered by the weekly refresh. The
    daily social posts link at tool.html, but repeat visitors and search
    engines get a page that is always fresh.
  * promo/week-YYYY-Www.html — the week's seven picks + track as substantive,
    unique content. One new indexed URL a week, forever, for zero effort:
    programmatic SEO the honest way (every page is genuinely different and
    every link works).
  * promo/newsletter-draft.md — the week's recap as a ready-to-paste issue.

Generated pages carry the same GA tag as the other marketing pages, no
affiliate links, and no D-002-banned privacy phrases (asserted by tests).
"""
from __future__ import annotations

import argparse
import datetime
import glob
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue, pick, words as promo_copy  # noqa: E402

SITE = catalogue.SITE
ROOT = catalogue.ROOT
GA_TAG = """<script async src="https://www.googletagmanager.com/gtag/js?id=G-G058FVW6Z2"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','G-G058FVW6Z2');</script>"""
CSS = """*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:#2dd4ff;--text:#e6faff;--muted:rgba(230,250,255,.68);--bg:#0a0f14;--panel:#111a24;--line:rgba(255,255,255,.09)}
body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.65}
.wrap{max-width:820px;margin:0 auto;padding:0 20px 60px}
.top{border-bottom:1px solid var(--line);padding:16px 0;margin-bottom:34px}
.top a{color:var(--accent);text-decoration:none;font-weight:700}
.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.14em;font-size:.8rem;font-weight:700}
h1{font-size:2rem;line-height:1.2;margin:.4em 0 .3em}
.sub{color:var(--muted);font-size:1.05rem;max-width:60ch}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 8px}
.btn{display:inline-block;padding:12px 26px;border-radius:10px;font-weight:700;text-decoration:none}
.btn-solid{background:var(--accent);color:#04222c}
.btn-ghost{border:1px solid var(--accent);color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:14px 0}
.card h2{font-size:1.15rem}
.card h2 a{color:var(--text);text-decoration:none}
.card h2 a:hover{color:var(--accent)}
.card .meta{color:var(--accent);font-size:.82rem;font-weight:600}
.card p{color:var(--muted);margin-top:6px}
.sec{margin-top:44px}
.sec h2{font-size:1.3rem;margin-bottom:6px}
.foot{margin-top:52px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
.foot a{color:var(--accent)}"""

NAV = ('<div class="top"><div class="wrap" style="padding-bottom:0">'
       f'<a href="{SITE}/">← The Most Useful Site in the World</a></div></div>')
FOOT = ('<div class="foot">Run a site, intranet or classroom? Every tool embeds '
        f'with one iframe — <a href="{SITE}/embed.html">free with a credit line</a>, '
        f'<a href="{SITE}/license.html">white-label from £99/year</a>. · '
        f'<a href="{SITE}/feed.xml">RSS feed</a></div>')


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _week_monday(day: datetime.date) -> datetime.date:
    return day - datetime.timedelta(days=day.isoweekday() - 1)


def _archive_links() -> str:
    pages = sorted(glob.glob(os.path.join(ROOT, "promo", "week-*.html")))
    if not pages:
        return ""
    links = []
    for path in sorted(pages, reverse=True)[:12]:
        label = os.path.basename(path)[5:-5]  # week-YYYY-Www.html -> YYYY-Www
        links.append(f'<li><a href="{SITE}/promo/{os.path.basename(path)}">'
                     f"Week of {label}</a></li>")
    return '<div class="sec"><h2>Past weeks</h2><ul>' + "".join(links) + "</ul></div>"


def _jsonld(items: list[tuple[str, str, str]]) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "item": {"@type": "WebApplication", "name": name, "url": url,
                      "description": desc, "applicationCategory": cat,
                      "offers": {"@type": "Offer", "price": "0"}}}
            for i, (name, url, desc, cat) in enumerate(items)
        ],
    }
    return ('<script type="application/ld+json">'
            + json.dumps(data, ensure_ascii=False) + "</script>")


def build_spotlight(day: datetime.date, tools: list[dict]) -> str:
    tool = pick.pick_tool(day, tools)
    title = catalogue.plain(tool.get("title") or tool["name"])
    desc = catalogue.short(tool.get("description") or "Free browser tool.", 280)
    cat = tool.get("category") or "General"
    url = catalogue.tool_url(tool["name"])
    monday = _week_monday(day)
    week_cards = []
    jsonld_items = [(title, url, desc, cat)]
    probe = monday
    while probe <= day:  # this week so far (Mon..today)
        if probe != day:
            other = pick.pick_tool(probe, tools)
            otitle = catalogue.plain(other.get("title") or other["name"])
            odesc = catalogue.short(other.get("description") or "", 160)
            ourl = catalogue.tool_url(other["name"])
            ocat = other.get("category") or "General"
            week_cards.append(
                f'<div class="card"><div class="meta">{probe.strftime("%A")} · '
                f"{_esc(ocat)}</div><h2><a href=\"{ourl}\">{_esc(otitle)}</a></h2>"
                f"<p>{_esc(odesc)}</p></div>")
            jsonld_items.append((otitle, ourl, odesc, ocat))
        probe += datetime.timedelta(days=1)
    year, week, _ = day.isocalendar()
    week_url = f"{SITE}/promo/week-{year}-W{week:02d}.html"
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- generated by scripts/promo/spotlight.py for {day.isoformat()} — do not hand-edit -->
<title>Tool of the Day: {_esc(title)} — The Most Useful Site in the World</title>
<meta name="description" content="Today's featured free tool: {_esc(desc)} Runs in your browser, no sign-up.">
<link rel="canonical" href="{SITE}/spotlight.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="Tool of the Day: {_esc(title)}">
<meta property="og:description" content="{_esc(desc)}">
<meta property="og:url" content="{SITE}/spotlight.html">
<meta property="og:image" content="{SITE}/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<style>{CSS}</style>
{GA_TAG}
</head>
<body>
{NAV}
<div class="wrap">
<div class="eyebrow">Tool of the day · {day.strftime("%A %-d %B %Y")} · {_esc(cat)}</div>
<h1>{_esc(title)}</h1>
<p class="sub">{_esc(desc)}</p>
<div class="btns"><a class="btn btn-solid" href="{url}">Open the tool ↗</a>
<a class="btn btn-ghost" href="{SITE}/embed.html">Embed it on your site</a></div>
<p class="sub">Free, runs in your browser, no sign-up — one of {len(tools)} tools and counting.</p>
<div class="sec"><h2>Also this week</h2>{''.join(week_cards) or '<p class="sub">The week starts here — check back tomorrow.</p>'}
<p style="margin-top:14px"><a href="{week_url}">This week's full recap →</a></p></div>
{_archive_links()}
{FOOT}
</div>
{_jsonld(jsonld_items)}
</body>
</html>
"""
    return promo_copy.assert_clean(page)


def build_week_page(monday: datetime.date, tools: list[dict]) -> tuple[str, str]:
    year, week, _ = monday.isocalendar()
    label = f"{year}-W{week:02d}"
    cards, jsonld_items = [], []
    for i in range(7):
        day = monday + datetime.timedelta(days=i)
        tool = pick.pick_tool(day, tools)
        title = catalogue.plain(tool.get("title") or tool["name"])
        desc = catalogue.short(tool.get("description") or "", 220)
        url = catalogue.tool_url(tool["name"])
        cat = tool.get("category") or "General"
        cards.append(
            f'<div class="card"><div class="meta">{day.strftime("%A %-d %B")} · '
            f"{_esc(cat)}</div><h2><a href=\"{url}\">{_esc(title)}</a></h2>"
            f"<p>{_esc(desc)}</p></div>")
        jsonld_items.append((title, url, desc, cat))
    track = pick.pick_track(monday)
    track_url = catalogue.track_url(track["youtube_id"])
    sunday = monday + datetime.timedelta(days=6)
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- generated by scripts/promo/spotlight.py for week {label} — do not hand-edit -->
<title>7 free browser tools — week of {monday.strftime("%-d %B %Y")}</title>
<meta name="description" content="Seven free tools from the week of {monday.isoformat()}, each running in your browser with no sign-up, plus the week's animated music video.">
<link rel="canonical" href="{SITE}/promo/week-{label}.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="7 free browser tools — week of {monday.strftime("%-d %B %Y")}">
<meta property="og:url" content="{SITE}/promo/week-{label}.html">
<meta property="og:image" content="{SITE}/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<style>{CSS}</style>
{GA_TAG}
</head>
<body>
{NAV}
<div class="wrap">
<div class="eyebrow">Weekly recap · {monday.strftime("%-d %B")} – {sunday.strftime("%-d %B %Y")}</div>
<h1>Seven free tools, one a day</h1>
<p class="sub">Every tool below runs in your browser with no sign-up and nothing
to install. New here? There are {len(tools)} of them — start with
<a href="{SITE}/spotlight.html">today's pick</a>.</p>
{''.join(cards)}
<div class="sec"><h2>🎬 Track of the week</h2>
<div class="card"><div class="meta">MrProphecy · animated music video</div>
<h2><a href="{track_url}">{_esc(catalogue.safe_text(track["title"]))}</a></h2>
<p>Free to watch. Need music for a project? <a href="{SITE}/sync.html">Sync
licences from £50</a>, cleared in a single conversation.</p></div></div>
{FOOT}
</div>
{_jsonld(jsonld_items)}
</body>
</html>
"""
    return f"week-{label}.html", promo_copy.assert_clean(page)


def build_newsletter(monday: datetime.date, tools: list[dict]) -> str:
    year, week, _ = monday.isocalendar()
    week_tools = [pick.pick_tool(monday + datetime.timedelta(days=i), tools)
                  for i in range(7)]
    track = pick.pick_track(monday)
    track = {**track, "url": catalogue.track_url(track["youtube_id"])}
    body = promo_copy.weekly_roundup(monday, week_tools, track)
    return (f"Subject: 7 free tools + 1 track — week of {monday.isoformat()}\n"
            f"Week: {year}-W{week:02d} · generated {datetime.date.today().isoformat()} "
            f"— paste into your newsletter sender, or ignore if RSS-to-email is on.\n\n"
            + body + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate spotlight + week pages.")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    day = datetime.date.fromisoformat(args.date)
    tools = catalogue.load_tools()
    monday = _week_monday(day)
    with open(os.path.join(ROOT, "spotlight.html"), "w", encoding="utf-8") as fh:
        fh.write(build_spotlight(day, tools))
    print(f"wrote spotlight.html (for {day.isoformat()})")
    fname, page = build_week_page(monday, tools)
    with open(os.path.join(ROOT, "promo", fname), "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote promo/{fname}")
    with open(os.path.join(ROOT, "promo", "newsletter-draft.md"), "w",
              encoding="utf-8") as fh:
        fh.write(build_newsletter(monday, tools))
    print("wrote promo/newsletter-draft.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
