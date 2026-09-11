#!/usr/bin/env python3
"""card.py — branded social cards (1200x630 PNG) for picks + the site OG image.

    python3 scripts/promo/card.py --date 2026-09-11 --out /tmp/card.png
    python3 scripts/promo/card.py --og --out og-tools.png

Needs Pillow (pip install pillow — the promo workflow installs it). Without
Pillow it writes an SVG with the same layout instead of failing, so local
dry-runs always produce something viewable.

The design matches the site's glass/cyan brand: near-black gradient, cyan
top/bottom bars, white bold title, cyan subtitle. Titles are emoji-stripped
(catalogue.plain) because the available fonts have no emoji glyphs.
"""
from __future__ import annotations

import argparse
import datetime
import html
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue, pick  # noqa: E402

W, H = 1200, 630
BG_TOP = (13, 20, 28)
BG_BOTTOM = (5, 8, 12)
CYAN = (45, 212, 255)
WHITE = (240, 248, 252)
GREY = (150, 170, 182)
FAINT = (38, 52, 64)

FONT_CANDIDATES = [
    os.environ.get("PROMO_FONT", ""),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arial.ttf",
]


def _font(size: int, bold: bool = True):
    from PIL import ImageFont
    for path in FONT_CANDIDATES:
        if path and os.path.exists(path):
            try:
                # DejaVuSans.ttf is the regular face; Bold file preferred.
                if not bold and path.endswith("DejaVuSans-Bold.ttf"):
                    path = path.replace("DejaVuSans-Bold.ttf", "DejaVuSans.ttf")
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_w: int, max_lines: int = 3) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=font) > max_w:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def render_png(*, eyebrow: str, title: str, subtitle: str, footer: str,
               out: str) -> str:
    """Render the brand card. Returns the path written."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img, "RGBA")
    for y in range(H):  # vertical gradient
        t = y / H
        draw.line([(0, y), (W, y)], fill=tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    # Glassy decoration: faint oversized circles, right side.
    for cx, cy, r in ((1080, 120, 220), (950, 560, 150), (1150, 480, 90)):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     outline=FAINT + (255,), width=2)
    draw.rectangle([0, 0, W, 10], fill=CYAN)
    draw.rectangle([0, H - 10, W, H], fill=CYAN)

    margin = 90
    max_w = W - margin * 2 - 120  # keep clear of the circles
    y = 120
    font_eye = _font(30)
    # Letterspaced eyebrow (PIL has no tracking; hair spaces do the job).
    spaced = " ".join(list(eyebrow.upper()))
    draw.text((margin, y), spaced, font=font_eye, fill=CYAN)
    y += 62
    size = 76
    while size > 40:
        font_title = _font(size)
        lines = _wrap(draw, title, font_title, max_w)
        if len(lines) <= 3 and max(
                draw.textlength(line, font=font_title) for line in lines) <= max_w:
            break
        size -= 6
    for line in lines:
        draw.text((margin, y), line, font=font_title, fill=WHITE)
        y += size + 12
    y += 8
    font_sub = _font(34, bold=False)
    for line in _wrap(draw, subtitle, font_sub, max_w, max_lines=2):
        draw.text((margin, y), line, font=font_sub, fill=GREY)
        y += 46
    font_foot = _font(26, bold=False)
    draw.text((margin, H - 78), footer, font=font_foot, fill=CYAN)
    brand = "themostusefulsiteintheworld.com"
    draw.text((W - margin - draw.textlength(brand, font=font_foot), H - 78),
              brand, font=font_foot, fill=GREY)
    img.save(out)
    return out


def render_svg(*, eyebrow: str, title: str, subtitle: str, footer: str,
               out: str) -> str:
    """Same layout as SVG — the no-Pillow fallback."""
    esc = lambda s: html.escape(s, quote=True)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d141c"/><stop offset="1" stop-color="#05080c"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect width="1200" height="10" fill="#2dd4ff"/><rect y="620" width="1200" height="10" fill="#2dd4ff"/>
<circle cx="1080" cy="120" r="220" fill="none" stroke="#263440" stroke-width="2"/>
<circle cx="950" cy="560" r="150" fill="none" stroke="#263440" stroke-width="2"/>
<text x="90" y="160" font-family="sans-serif" font-size="30" letter-spacing="6" fill="#2dd4ff">{esc(eyebrow.upper())}</text>
<text x="90" y="280" font-family="sans-serif" font-size="64" font-weight="bold" fill="#f0f8fc">{esc(title)}</text>
<text x="90" y="380" font-family="sans-serif" font-size="34" fill="#96aab6">{esc(subtitle)}</text>
<text x="90" y="566" font-family="sans-serif" font-size="26" fill="#2dd4ff">{esc(footer)}</text>
<text x="1110" y="566" font-family="sans-serif" font-size="26" fill="#96aab6" text-anchor="end">themostusefulsiteintheworld.com</text>
</svg>
"""
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(svg)
    return out


def render(*, eyebrow: str, title: str, subtitle: str, footer: str,
           out: str) -> str:
    try:
        import PIL  # noqa: F401
    except ImportError:
        fallback = os.path.splitext(out)[0] + ".svg"
        print(f"Pillow not installed — wrote SVG fallback to {fallback} instead.",
              file=sys.stderr)
        return render_svg(eyebrow=eyebrow, title=title, subtitle=subtitle,
                          footer=footer, out=fallback)
    return render_png(eyebrow=eyebrow, title=title, subtitle=subtitle,
                      footer=footer, out=out)


def main() -> int:
    ap = argparse.ArgumentParser(description="Render promo social cards.")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--out", default=None, help="output path (default: promo card for --date)")
    ap.add_argument("--og", action="store_true",
                    help="render the site OG image (live tool count) instead")
    args = ap.parse_args()
    if args.og:
        count = len(catalogue.load_tools())
        out = args.out or os.path.join(catalogue.ROOT, "og-tools.png")
        render(eyebrow="Free browser tools", title="The Most Useful Site",
               subtitle=f"{count} free browser tools · no sign-ups",
               footer=f"{count} tools and counting", out=out)
        print(out)
        return 0
    day = datetime.date.fromisoformat(args.date)
    tool = pick.pick_tool(day)
    out = args.out or f"/tmp/promo-{day.isoformat()}-{tool['name']}.png"
    render(eyebrow=f"Tool of the day · {tool.get('category') or 'General'}",
           title=catalogue.plain(tool.get("title") or tool["name"]),
           subtitle=catalogue.short(tool.get("description") or "", 110),
           footer=day.strftime("%A %-d %B %Y"),
           out=out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
