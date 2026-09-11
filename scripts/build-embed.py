#!/usr/bin/env python3
"""build-embed.py — regenerate embed.html from the live catalogue.

    python3 scripts/build-embed.py            # rewrite embed.html
    python3 scripts/build-embed.py --check    # fail if it is out of date

Why this exists
---------------
embed.html is the licensing funnel's front door: every tool embeddable with
one click, plus the paid white-label offer. It used to be hand-maintained and
rotted — at one point it listed 532 tools against a real 1119 and carried no
licensing terms at all, which is exactly how the site's most valuable asset
got given away silently.

The page template (head, CSS, hero, how-to, licensing offer, footer, scripts)
lives in this file. The tool grid and category filter are derived from
cards/cards.json, so the page can never again disagree with the catalogue.

What the generated page must always contain (guarded by check-finance.js):
  1. All three licence prices (£99 / £299 / £899).
  2. A free tier described together with its credit-line requirement.
  3. A "not financial advice" disclaimer (we sell maintained correctness of
     calculators; crossing into advice would be an FCA regulated line).
  4. Embed snippets that carry an attribution link back to the site — the
     free tier's entire price is the backlink.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_JSON = os.path.join(ROOT, "cards", "cards.json")
OUT = os.path.join(ROOT, "embed.html")
SITE = "https://www.themostusefulsiteintheworld.com"

TIERS = [("£99", "Single tool"), ("£299", "Category"), ("£899", "Full white-label")]


def short(text: str, n: int = 140) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def card_html(c: dict) -> str:
    slug = html.escape(c["name"], quote=True)
    title = html.escape(c.get("title") or c["name"], quote=True)
    desc = html.escape(short(c.get("description") or "Free browser tool."), quote=True)
    cat = html.escape(c.get("category") or "General", quote=True)
    return (
        f'<div class="embed-card" data-cat="{cat}">\n'
        f'<div class="ec-cat">{cat}</div>\n'
        f'<div class="ec-title">{title}</div>\n'
        f'<div class="ec-desc">{desc}</div>\n'
        f'<div class="ec-actions">\n'
        f'<a class="ec-btn ec-open" href="tool.html?card={slug}" target="_blank" rel="noopener">Open ↗</a>\n'
        f'<button class="ec-btn ec-copy" data-slug="{slug}" data-title="{title}">Copy iframe</button>\n'
        f"</div>\n"
        f'<div class="ec-code"></div>\n'
        f"</div>"
    )


def build() -> str:
    with open(CARDS_JSON, encoding="utf-8") as fh:
        cards = json.load(fh)
    cards = sorted(cards, key=lambda c: (c.get("category") or "", c.get("title") or ""))
    counts = Counter(c.get("category") or "General" for c in cards)
    cats = sorted(counts)
    total = len(cards)

    filters = [f'<button class="active" data-cat="all">All {total}</button>']
    filters += [
        f'<button data-cat="{html.escape(c, quote=True)}">{html.escape(c)} · {counts[c]}</button>'
        for c in cats
    ]
    grid = "\n".join(card_html(c) for c in cards)
    year_note = "2026/27"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Cdefs%3E%3ClinearGradient id=%27g%27 x1=%270%27 y1=%270%27 x2=%271%27 y2=%271%27%3E%3Cstop offset=%270%27 stop-color=%27%23ffd400%27/%3E%3Cstop offset=%271%27 stop-color=%27%23ff9500%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%2713%27 fill=%27none%27 stroke=%27url(%23g)%27 stroke-width=%275%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%276%27 fill=%27none%27 stroke=%27url(%23g)%27 stroke-width=%273%27/%3E%3C/svg%3E\">
<title>Embed any tool — The Most Useful Site in the World</title>
<meta name="description" content="Embed any of the {total} free tools on your own site with a single iframe. Free with a small credit line, or license white-label from £99/year.">
<meta name="keywords" content="embed free tools, iframe calculator, embed calculator on my website, white label calculators, mortgage calculator for my website">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{SITE}/embed.html">
<link rel="alternate" type="application/rss+xml" title="The Most Useful Site in the World — RSS feed" href="feed.xml">
<meta name="theme-color" content="#0a0f14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="Embed any tool — The Most Useful Site in the World">
<meta property="og:description" content="Embed any of the {total} free tools on your own site with a single iframe. Free with a small credit line, or license white-label from £99/year.">
<meta property="og:url" content="{SITE}/embed.html">
<meta property="og:image" content="{SITE}/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Embed any tool — The Most Useful Site in the World">
<meta name="twitter:description" content="Embed any of the {total} free tools on your own site with a single iframe. Free with a small credit line, or license white-label from £99/year.">
<meta name="twitter:image" content="{SITE}/og-tools.png">
<link rel="manifest" href="manifest.json">
<script type="application/ld+json">{{"@context": "https://schema.org", "@type": "WebPage", "name": "Embed any tool", "url": "{SITE}/embed.html"}}</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--accent:#2dd4ff;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--bg-primary:#0a0f14;--bg-secondary:#141e28;--border-light:rgba(255,255,255,.08);--gold:#ffd700;--success:#39ff14}}
body{{background:var(--bg-primary);color:var(--text);line-height:1.65;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;overflow-x:hidden}}
a{{color:inherit}}
.wrap{{max-width:1100px;margin:0 auto;padding:0 20px}}
.topbar{{border-bottom:1px solid var(--border-light);padding:13px 0;background:rgba(10,15,20,.9);position:sticky;top:0;z-index:100;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}
.topbar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px}}
.topbar a{{text-decoration:none;font-weight:800;font-size:.9rem}}.topbar .back{{color:var(--text-secondary);font-weight:600;font-size:.85rem}}.topbar .back:hover{{color:var(--text)}}
.hero{{padding:50px 0 24px;text-align:center;background:radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,212,255,0.08), transparent 70%)}}
.hero h1{{font-size:clamp(1.9rem,4.6vw,2.9rem);font-weight:900;letter-spacing:-.025em;line-height:1.1;background:linear-gradient(135deg, #fff 20%, var(--accent) 80%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px}}
.hero p{{color:var(--text-secondary);font-size:1rem;max-width:680px;margin:0 auto}}
.eyebrow{{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);border:1px solid rgba(45,212,255,.34);background:rgba(45,212,255,.07);padding:5px 12px;border-radius:100px;margin-bottom:14px}}
.how{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px;padding:20px 24px;margin:18px 0}}
.how h2{{margin:0 0 10px;font-size:1.1rem;color:#fff}}
.how pre{{background:#0a0f14;border:1px solid var(--border-light);border-radius:8px;padding:14px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.85rem;line-height:1.55;color:var(--accent);margin:10px 0}}
.how p{{color:var(--text-secondary);font-size:.92rem;margin:0 0 10px}}
.how p strong{{color:#fff}}
.licband{{background:linear-gradient(135deg,rgba(255,215,0,.09),rgba(45,212,255,.05));border:1px solid rgba(255,215,0,.35);border-radius:14px;padding:20px 24px;margin:18px 0}}
.licband h2{{margin:0 0 6px;font-size:1.1rem;color:#fff}}
.licband p{{color:var(--text-secondary);font-size:.92rem;margin:0 0 10px}}
.lictiers{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0}}
.lictier{{background:rgba(10,15,20,.6);border:1px solid var(--border-light);border-radius:10px;padding:12px 14px}}
.lictier b{{display:block;font-size:1.25rem;font-weight:900;color:var(--gold)}}
.lictier span{{font-size:.78rem;color:var(--text-secondary)}}
.licband .btn{{display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#1a1500;font-weight:800;padding:10px 22px;border-radius:100px;text-decoration:none;font-size:.88rem;margin-top:4px}}
.licband .btn:hover{{transform:translateY(-2px)}}
.cat-filter{{position:sticky;top:55px;background:rgba(10,15,20,.95);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--border-light);padding:10px 0;z-index:50;margin:20px 0 14px}}
.cat-filter-inner{{display:flex;gap:6px;overflow-x:auto;padding:4px 20px;max-width:1100px;margin:0 auto;scrollbar-width:none}}.cat-filter-inner::-webkit-scrollbar{{display:none}}
.cat-filter button{{flex-shrink:0;padding:5px 11px;border-radius:100px;background:rgba(255,255,255,.05);border:1px solid var(--border-light);color:var(--text-secondary);font-size:.74rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}}
.cat-filter button:hover{{background:rgba(45,212,255,.12);border-color:var(--accent);color:var(--accent)}}
.cat-filter button.active{{background:var(--accent);color:#04141c;border-color:var(--accent)}}
.embed-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:8px}}
.embed-card{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:10px;padding:12px 14px;transition:all .18s}}
.embed-card:hover{{border-color:var(--accent);transform:translateY(-1px)}}
.embed-card .ec-title{{font-size:.88rem;font-weight:700;color:#fff;margin-bottom:2px;line-height:1.3}}
.embed-card .ec-desc{{font-size:.74rem;color:var(--text-secondary);line-height:1.4;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.embed-card .ec-cat{{font-size:.62rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:inline-block;padding:2px 7px;background:rgba(45,212,255,.08);border:1px solid rgba(45,212,255,.18);border-radius:8px}}
.embed-card .ec-actions{{display:flex;gap:5px;flex-wrap:wrap}}
.embed-card .ec-btn{{padding:4px 9px;background:rgba(45,212,255,.08);border:1px solid rgba(45,212,255,.2);border-radius:7px;font-size:.7rem;font-weight:600;color:var(--text);text-decoration:none;cursor:pointer;font-family:inherit;transition:all .2s}}
.embed-card .ec-btn:hover{{background:rgba(45,212,255,.2);color:#fff;text-decoration:none}}
.embed-card .ec-code{{background:#0a0f14;border:1px solid var(--border-light);border-radius:6px;padding:7px 9px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.7rem;line-height:1.4;color:var(--accent);margin-top:6px;display:none;word-break:break-all;max-height:80px;overflow-y:auto}}
.embed-card.copied .ec-btn{{background:rgba(57,255,20,.2);color:var(--success);border-color:rgba(57,255,20,.4)}}
.fineprint{{color:var(--text-secondary);font-size:.82rem;margin:22px 0 0;border-top:1px solid var(--border-light);padding-top:16px}}
.fineprint a{{color:var(--accent)}}
footer{{border-top:1px solid var(--border-light);margin-top:50px;padding:24px 0;text-align:center;color:var(--text-secondary);font-size:.85rem}}footer a{{text-decoration:none;margin:0 8px}}footer a:hover{{color:var(--text)}}
@media(prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-G058FVW6Z2"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
gtag('js',new Date());gtag('config','G-G058FVW6Z2');</script>
</head>
<body>
<div class="topbar"><div class="wrap">
<a href="index.html">🛠️ The Most Useful Site in the World</a>
<a class="back" href="index.html">← Back to the tools</a>
</div></div>
<header class="hero"><div class="wrap">
<div class="eyebrow">Embed · {total} tools · {len(cats)} categories</div>
<h1>Embed any tool on your site</h1>
<p>Every tool on this site is a standalone page that works inside an iframe. Copy the snippet, paste it into your CMS, and the tool is live on your site — no JavaScript, no API key, no sign-up, no ad networks, no paywall.</p>
</div></header>
<main class="wrap">
<div class="how">
<h2>📋 How to embed</h2>
<p><strong>1.</strong> Pick a tool below.</p>
<p><strong>2.</strong> Click “Copy iframe” — the snippet is on your clipboard.</p>
<p><strong>3.</strong> Paste into your site, blog, Notion page, or anywhere else that accepts HTML. You can adjust the <code>width</code> and <code>height</code> attributes.</p>
<p><strong>Default snippet (height 450px, free tier with credit line):</strong></p>
<pre>&lt;iframe src="{SITE}/tool.html?card=TOOL-SLUG&amp;embed=1" width="100%" height="450" style="border:none;border-radius:12px;" title="TOOL TITLE" loading="lazy"&gt;&lt;/iframe&gt;
&lt;p style="font-size:12px;font-family:sans-serif;"&gt;&lt;a href="{SITE}/tool.html?card=TOOL-SLUG" target="_blank" rel="noopener"&gt;Free tool by The Most Useful Site in the World&lt;/a&gt;&lt;/p&gt;</pre>
<p>The <strong>free tier</strong> is free forever, for personal or commercial pages — the only price is keeping the small <strong>credit line</strong> under the embed. It is one line of text with a link back. Please don't remove it: it is what keeps all {total} tools free for everyone. Want the tool without the credit, branded as yours? That's the <a href="license.html" style="color:var(--accent)">white-label licence</a> below.</p>
<p>You can also just link to a tool from your site — each tool has a stable URL you can share.</p>
</div>
<div class="licband" id="licence">
<h2>🏷️ Need it white-label? Remove the credit line from £99/year</h2>
<p>Same tools, your branding, no credit line — plus maintained correctness (UK tax bands, NI and loan thresholds updated every April) and fixes within the licence year. The free tools on this site stay exactly as they are; the licence only covers how they appear on <em>your</em> site.</p>
<div class="lictiers">
<div class="lictier"><b>£99/year</b><span><strong>Single tool</strong> — one calculator, one site, no credit line</span></div>
<div class="lictier"><b>£299/year</b><span><strong>Category</strong> — e.g. all {counts.get("Finance & Money", 0)} Finance &amp; Money tools, your logo, up to 3 sites</span></div>
<div class="lictier"><b>£899/year</b><span><strong>Full white-label</strong> — all {total} tools, unlimited sites, self-host option</span></div>
</div>
<p style="margin-bottom:12px"><a class="btn" href="license.html" data-track="embed_licence_cta">See licences &amp; terms →</a></p>
<p style="font-size:.8rem">Finance and money calculators are estimates for illustration — <strong>not financial advice</strong>, and not a substitute for a qualified adviser. Licence fees cover hosting of the embed, branding removal, maintenance and support; see <a href="license.html" style="color:var(--accent)">full terms</a>.</p>
</div>
<div class="cat-filter"><div class="cat-filter-inner">
{"".join(filters)}
</div></div>
<div class="embed-grid" id="embedGrid">
{grid}
</div>
<p class="fineprint">Free embeds: keep the credit line and link. Removing the credit line without a licence breaches the <a href="legal.html#terms">terms of use</a>. The site's code is MIT licensed on <a href="https://github.com/mrpr0phecy/mrpr0phecy" target="_blank" rel="noopener">GitHub</a> if you'd rather self-host and brand it yourself — the licence buys you the hosted, maintained, supported version instead. Money calculators are estimates, not financial advice. Full detail: <a href="license.html">licensing</a> · <a href="hire.html">custom builds</a> · <a href="sponsor.html">sponsorship</a>.</p>
</main>
<script>
function moneyEvent(name, params) {{
  try {{
    if (typeof gtag === "function") gtag("event", name, params || {{}});
  }} catch (e) {{}}
}}
document.addEventListener("click", function(e) {{
  var b = e.target.closest(".ec-copy");
  if (!b) {{
    var cta = e.target.closest("[data-track]");
    if (cta) moneyEvent(cta.getAttribute("data-track"), {{page: "embed"}});
    return;
  }}
  var card = b.closest(".embed-card");
  var slug = b.getAttribute("data-slug");
  var title = (b.getAttribute("data-title") || slug).replace(/"/g, "");
  var page = "{SITE}/tool.html?card=" + encodeURIComponent(slug);
  var code = "<iframe src=\\"" + page + "&embed=1\\" width=\\"100%\\" height=\\"450\\" style=\\"border:none;border-radius:12px;\\" title=\\"" + title + "\\" loading=\\"lazy\\"></iframe>\\n"
    + "<p style=\\"font-size:12px;font-family:sans-serif;\\"><a href=\\"" + page + "\\" target=\\"_blank\\" rel=\\"noopener\\">Free tool by The Most Useful Site in the World</a></p>";
  var box = card.querySelector(".ec-code");
  moneyEvent("embed_copy", {{tool: slug}});
  function done() {{
    b.textContent = "Copied! ✓";
    card.classList.add("copied");
    box.textContent = code;
    box.style.display = "block";
    setTimeout(function() {{ b.textContent = "Copy iframe"; card.classList.remove("copied"); box.style.display = "none"; }}, 2600);
  }}
  if (navigator.clipboard && navigator.clipboard.writeText) {{
    navigator.clipboard.writeText(code).then(done, function() {{ box.textContent = code; box.style.display = "block"; }});
  }} else {{
    box.textContent = code; box.style.display = "block";
  }}
}});
document.querySelectorAll(".cat-filter button").forEach(function(btn) {{
  btn.addEventListener("click", function() {{
    document.querySelectorAll(".cat-filter button").forEach(function(b) {{ b.classList.remove("active"); }});
    btn.classList.add("active");
    var cat = btn.getAttribute("data-cat");
    document.querySelectorAll(".embed-card").forEach(function(c) {{
      c.style.display = (cat === "all" || c.getAttribute("data-cat") === cat) ? "" : "none";
    }});
  }});
}});
</script>
<footer><div class="wrap">
<p><a href="index.html">All {total} tools</a>·<a href="license.html">Licences</a>·<a href="hire.html">Custom builds</a>·<a href="about.html">About</a>·<a href="press.html">Press</a>·<a href="tools.html">Index</a>·<a href="popular.html">Popular</a>·<a href="new.html">New</a>·<a href="use-case.html">Use case</a>·<a href="help.html">Help</a>·<a href="donate.html">Donate</a>·<a href="sponsor.html">Sponsor</a>·<a href="listen.html">Music</a></p>
</div></footer>
</body></html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    out = build()
    if args.check:
        if not os.path.exists(OUT):
            print("embed.html is missing — run scripts/build-embed.py")
            return 1
        with open(OUT, encoding="utf-8") as fh:
            if fh.read() != out:
                print("embed.html is out of date — run scripts/build-embed.py")
                return 1
        print(f"embed.html is current.")
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
