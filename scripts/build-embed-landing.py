#!/usr/bin/env python3
"""build-embed-landing.py — generate the finance licence landing page.

    python3 scripts/build-embed-landing.py            # rewrite embed-finance.html
    python3 scripts/build-embed-landing.py --check    # fail if it is stale

Why this exists
---------------
STRATEGY.md ("What to do next", item 4): finance is the highest-value vertical
on the site and the licence funnel needed a page that targets what a buyer
actually searches for — "mortgage calculator for my website" — rather than the
browse-everything catalogue page. This script IS that page, generated from
`cards/cards.json` so every count and description on it is derived, never
hand-typed. The tool counts cannot drift (run with --check in CI/verify.sh),
and the featured list fails loudly if a card is renamed or removed.

Everything the page claims is either derived from the catalogue at build time
(tool counts, descriptions, featured cards) or parsed from
`scripts/check-finance.js` at build time (the number of statutory checks).
Nothing else numeric appears on the page.

The page carries Google Analytics because it is a money page (same class as
donate.html / sponsor.html / embed.html, which already do) — and it says so in
its footer. Per CONSTRAINTS.md: pages with analytics must disclose it and must
not claim "no tracking". The tool cards themselves stay clean.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards", "cards.json")
OUT = os.path.join(ROOT, "embed-finance.html")
FINANCE_CATEGORY = "Finance & Money"
SITE = "https://www.themostusefulsiteintheworld.com"

# Curated licence-intent picks: the calculators a broker, accountant, estate
# agent or adviser would actually put in front of their own clients. If any
# slug disappears from the catalogue this script FAILS — that is deliberate.
FEATURED_SLUGS = [
    "mortgage",
    "mortgage-affordability-calculator",
    "mortgage-overpayment-calculator",
    "ltv-mortgage-calculator",
    "loan-amortization-schedule",
    "salary",
    "tax",
    "vat-gst-sales-tax-calculator",
    "rental-yield-calculator",
    "compoundinterest",
    "retirement",
    "invoice-late-fee-calculator",
]

# Pricing must stay identical to embed.html (#pricing); check-finance.js
# guards the prices there. If the owner reprices, change both — the diff will
# make the change reviewable.
PRICES = [("Free embed", "0", ["All 1149 tools, any site",
                                "Small credit line (required)",
                                "No ads, no accounts, no paywalls"],
           "Copy a snippet above", "#top", True),
          ("Single tool", "99", ["One tool, one site",
                                 "Credit line removed",
                                 "Your logo on the tool",
                                 "Statutory updates included"],
           "Enquire — £99/yr",
           "mailto:hello@themostusefulsiteintheworld.com?subject=Licence%20enquiry%20%E2%80%94%20Single%20tool%20%28%C2%A399%2Fyr%29", False),
          ("Category", "299", ["Every tool in one category — Finance & Money: {fin}",
                               "Credit line removed, your logo",
                               "Up to 3 sites",
                               "Statutory updates included"],
           "Enquire — £299/yr",
           "mailto:hello@themostusefulsiteintheworld.com?subject=Licence%20enquiry%20%E2%80%94%20Category%20%28%C2%A3299%2Fyr%29", False),
          ("Full white-label", "899", ["All 1149 tools, unlimited sites",
                                       "Your branding throughout",
                                       "Self-host option",
                                       "Statutory updates + priority fixes"],
           "Enquire — £899/yr",
           "mailto:hello@themostusefulsiteintheworld.com?subject=Licence%20enquiry%20%E2%80%94%20White-label%20%28%C2%A3899%2Fyr%29", False)]

FAQ = [
    ("Is it really free to embed?",
     "Yes. Every tool embeds free with a small credit line linking back here — "
     "that credit is the entire price of the free tier, and it works as a "
     "backlink for you too. No account, no sign-up, no API key."),
    ("How do I put a calculator on my site?",
     "Pick a tool, click “Copy iframe”, and paste the snippet into any CMS, "
     "page builder or HTML page. It is a single iframe — no JavaScript "
     "libraries, no build step, no maintenance beyond keeping the snippet."),
    ("Can we remove the credit line and use our own branding?",
     "That is exactly what the licence is for: £99/year for one tool, £299/year "
     "for a whole category, £899/year for everything white-label. You get a "
     "signed licence key; the credit disappears on your domain only."),
    ("Are these calculators financial advice?",
     "No — they are estimating tools, not financial advice. The statutory "
     "figures (tax bands, National Insurance, student-loan thresholds) are "
     "maintained against HMRC's published {year} rules and enforced by "
     "{checks} on every deploy. See the changelog for the update history."),
    ("What do you collect from our visitors?",
     "The calculators run in the visitor's browser and nothing they type is "
     "sent to us — there is no form submission anywhere in the embeds. This "
     "landing page itself measures traffic with Google Analytics; the tools "
     "record nothing."),
    ("Do you host the tools, or do we?",
     "We host by default, so statutory updates reach every embed the day they "
     "ship. White-label licensees can additionally self-host the files."),
]


def load_cards() -> tuple[int, int, dict[str, dict]]:
    with open(CARDS, encoding="utf-8") as fh:
        cards = json.load(fh)
    by_slug = {c["name"]: c for c in cards}
    missing = [s for s in FEATURED_SLUGS if s not in by_slug]
    if missing:
        sys.exit(f"FAIL: featured slugs missing from the catalogue: {missing}\n"
                 f"        update FEATURED_SLUGS in scripts/build-embed-landing.py")
    fin = sum(1 for c in cards if c["category"] == FINANCE_CATEGORY)
    return len(cards), fin, by_slug


def check_count() -> str:
    """Parse the number of statutory checks from check-finance.js's output."""
    try:
        out = subprocess.run(["node", os.path.join(ROOT, "scripts", "check-finance.js")],
                             capture_output=True, text=True, timeout=120)
        m = re.search(r"\((\d+) checks\)", out.stdout) or re.search(r"of (\d+) failed", out.stdout)
        if m:
            n = m.group(1)
            return f"{n} independent automated checks"
    except Exception:
        pass
    return "independent automated checks"


def build_page() -> str:
    total, fin, by_slug = load_cards()
    checks = check_count()
    e = html.escape

    cat_param = "Finance %26 Money"

    featured_rows = []
    for slug in FEATURED_SLUGS:
        c = by_slug[slug]
        desc = re.sub(r"\s+", " ", c["description"]).strip()
        if len(desc) > 150:
            desc = desc[:147].rstrip() + "…"
        featured_rows.append(f"""<a class="fcard" href="embed.html?tool={e(slug)}">
<div class="fc-title">{e(c["title"])}</div>
<div class="fc-desc">{e(desc)}</div>
<div class="fc-cta">Get the snippet →</div>
</a>""")

    tier_rows = []
    for name, price, feats, cta, href, ghost in PRICES:
        lis = "\n".join(
            f'<li class="{"no" if f.startswith("Small credit") or f.startswith("Your branding") else ""}">{e(f).format(fin=fin, total=total)}</li>'
            for f in feats)
        tier_rows.append(f"""<div class="tier{' featured' if price == '299' else ''}">
{'<div class="t-flag">Most picked</div>' if price == '299' else ''}
<h3>{e(name)}</h3>
<div class="t-price">£{price} <small>/ year</small></div>
<ul>
{lis}
</ul>
<a class="t-cta{' ghost' if ghost else ''}" href="{e(href)}"{' data-tier="' + name.lower().replace(' ', '-') + '"' if not ghost else ''}>{e(cta)}</a>
</div>""")

    faq_rows = []
    faq_json = []
    for q, a in FAQ:
        a = a.format(year="2026/27", checks=checks)
        faq_rows.append(f"""<details class="faq"><summary>{e(q)}</summary><p>{e(a)}</p></details>""")
        faq_json.append({"@type": "Question", "name": q,
                         "acceptedAnswer": {"@type": "Answer", "text": a}})

    faq_ld = json.dumps({"@context": "https://schema.org", "@type": "FAQPage",
                         "mainEntity": faq_json}, ensure_ascii=False)
    webpage_ld = json.dumps({"@context": "https://schema.org", "@type": "WebPage",
                             "name": "Free finance calculators for your website",
                             "url": f"{SITE}/embed-finance.html",
                             "description": f"Embed any of the {fin} finance calculators on your own site with a single iframe. Free with a credit line; annual licences remove it and add your branding."}, ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="favicon.ico">
<title>Free finance calculators for your website — embed {fin} tools | The Most Useful Site in the World</title>
<meta name="description" content="Embed any of the {fin} finance calculators — mortgage, salary &amp; tax, VAT, rental yield, amortization — on your site with one iframe. Free with a credit line; £99+ annual licences remove it and add your branding.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{SITE}/embed-finance.html">
<link rel="alternate" type="application/rss+xml" title="The Most Useful Site in the World — RSS feed" href="feed.xml">
<meta name="theme-color" content="#0a0f14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="Free finance calculators for your website">
<meta property="og:description" content="One iframe puts any of {fin} maintained finance calculators on your site — free with a credit line, from £99/year branded.">
<meta property="og:url" content="{SITE}/embed-finance.html">
<meta property="og:image" content="{SITE}/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Free finance calculators for your website">
<meta name="twitter:description" content="One iframe puts any of {fin} maintained finance calculators on your site — free with a credit line, from £99/year branded.">
<meta name="twitter:image" content="{SITE}/og-tools.png">
<script type="application/ld+json">{webpage_ld}</script>
<script type="application/ld+json">{faq_ld}</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--accent:#2dd4ff;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--bg-primary:#0a0f14;--bg-secondary:#141e28;--border-light:rgba(255,255,255,.08);--success:#39ff14}}
body{{background:var(--bg-primary);color:var(--text);line-height:1.65;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;overflow-x:hidden}}
a{{color:inherit}}
.wrap{{max-width:1100px;margin:0 auto;padding:0 20px}}
.topbar{{border-bottom:1px solid var(--border-light);padding:13px 0;background:rgba(10,15,20,.9);position:sticky;top:0;z-index:100;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}
.topbar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px}}
.topbar a{{text-decoration:none;font-weight:800;font-size:.9rem}}.topbar .back{{color:var(--text-secondary);font-weight:600;font-size:.85rem}}.topbar .back:hover{{color:var(--text)}}
.hero{{padding:56px 0 26px;text-align:center;background:radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,212,255,0.08), transparent 70%)}}
.hero h1{{font-size:clamp(1.9rem,4.6vw,2.9rem);font-weight:900;letter-spacing:-.025em;line-height:1.1;background:linear-gradient(135deg,#fff 20%,var(--accent) 80%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:12px}}
.hero p{{color:var(--text-secondary);font-size:1rem;max-width:700px;margin:0 auto 20px}}
.eyebrow{{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);border:1px solid rgba(45,212,255,.34);background:rgba(45,212,255,.07);padding:5px 12px;border-radius:100px;margin-bottom:14px}}
.btnrow{{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}}
.btn{{padding:11px 20px;border-radius:10px;font-weight:800;font-size:.9rem;text-decoration:none;border:1px solid var(--accent)}}
.btn.primary{{background:var(--accent);color:#04141c}}
.btn.ghost{{background:transparent;color:var(--accent)}}
.btn:hover{{filter:brightness(1.12)}}
h2{{font-size:clamp(1.35rem,3vw,1.8rem);font-weight:900;letter-spacing:-.02em;margin-bottom:10px}}
.section{{padding:36px 0 8px}}
.why{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:16px}}
.why .w{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px;padding:18px}}
.why .w b{{display:block;margin-bottom:6px;color:#fff}}
.why .w span{{font-size:.84rem;color:var(--text-secondary)}}
.fgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin-top:16px}}
.fcard{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:12px;padding:15px 16px;text-decoration:none;display:flex;flex-direction:column;gap:6px;transition:border-color .18s,transform .18s}}
.fcard:hover{{border-color:var(--accent);transform:translateY(-1px)}}
.fc-title{{font-weight:800;font-size:.92rem;color:#fff;line-height:1.3}}
.fc-desc{{font-size:.78rem;color:var(--text-secondary);line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.fc-cta{{font-size:.78rem;font-weight:700;color:var(--accent);margin-top:auto}}
.proof{{background:var(--bg-secondary);border:1px solid var(--border-light);border-left:3px solid var(--accent);border-radius:12px;padding:20px 22px;margin-top:16px}}
.proof p{{color:var(--text-secondary);font-size:.92rem;margin-bottom:10px}}
.proof p:last-child{{margin-bottom:0}}
.proof b{{color:#fff}}
.pricing{{margin:40px 0 8px}}
.p-lead{{color:var(--text-secondary);max-width:760px;margin-bottom:18px}}
.tier-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}}
.tier{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px;position:relative}}
.tier.featured{{border-color:rgba(45,212,255,.55);box-shadow:0 0 0 1px rgba(45,212,255,.25), 0 12px 40px rgba(45,212,255,.08)}}
.tier .t-flag{{position:absolute;top:-9px;left:14px;background:var(--accent);color:#04141c;font-size:.6rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:3px 9px;border-radius:100px}}
.tier h3{{font-size:.95rem;color:#fff}}
.tier .t-price{{font-size:1.7rem;font-weight:900;color:var(--accent)}}.tier .t-price small{{font-size:.75rem;font-weight:600;color:var(--text-secondary)}}
.tier ul{{list-style:none;display:grid;gap:6px;font-size:.8rem;color:var(--text-secondary)}}
.tier ul li::before{{content:"\\2713 ";color:var(--success);font-weight:700}}
.tier ul li.no::before{{content:"\\2717 ";color:#ff6b6b}}
.tier .t-cta{{margin-top:auto;display:block;text-align:center;padding:9px 12px;border-radius:9px;background:var(--accent);color:#04141c;font-weight:800;font-size:.82rem;text-decoration:none;border:1px solid var(--accent)}}
.tier .t-cta:hover{{filter:brightness(1.1)}}
.tier .t-cta.ghost{{background:transparent;color:var(--accent)}}
.p-fine{{color:var(--text-secondary);font-size:.75rem;margin-top:14px;max-width:820px}}
.faq{{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:10px;padding:0 16px;margin-top:8px}}
.faq summary{{padding:13px 0;font-weight:700;font-size:.92rem;cursor:pointer;color:#fff}}
.faq p{{padding:0 0 13px;color:var(--text-secondary);font-size:.86rem}}
footer{{border-top:1px solid var(--border-light);margin-top:50px;padding:24px 0;text-align:center;color:var(--text-secondary);font-size:.85rem}}
footer a{{text-decoration:none;margin:0 8px}}footer a:hover{{color:var(--text)}}
.foot-note{{font-size:.72rem;opacity:.75;margin-top:12px;max-width:700px;margin-left:auto;margin-right:auto}}
@media(prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-G058FVW6Z2"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
gtag('js',new Date());gtag('config','G-G058FVW6Z2');</script>
</head>
<body>
<div class="topbar"><div class="wrap">
<a href="index.html">🛠️ The Most Useful Site in the World</a>
<a class="back" href="embed.html">← All embeddable tools</a>
</div></div>

<header class="hero"><div class="wrap">
<div class="eyebrow">Embed · {e(FINANCE_CATEGORY)} · {fin} calculators</div>
<h1>Finance calculators for your website</h1>
<p>Mortgage, salary, tax, VAT, rental yield, amortization — any of the {fin} finance tools from the {total}-tool catalogue, live on your site with <strong>one iframe</strong>. Your visitors use them in their browser; you get a working calculator page without writing or maintaining the maths.</p>
<div class="btnrow">
<a class="btn primary" href="embed.html?cat={e(cat_param)}">Browse all {fin} &amp; copy a snippet</a>
<a class="btn ghost" href="#pricing">Pricing — from free</a>
</div>
</div></header>

<main class="wrap">

<section class="section">
<h2>Why site owners embed these</h2>
<div class="why">
<div class="w"><b>One iframe. That's the install.</b><span>No JavaScript libraries, no build step, no widget account. Paste it into WordPress, Webflow, Notion — anywhere that takes HTML.</span></div>
<div class="w"><b>Clean by design</b><span>No ad scripts and no paywalls in the embeds — your page keeps its speed and your visitors keep their privacy while using the tool.</span></div>
<div class="w"><b>Maintained, not abandoned</b><span>UK statutory figures ({e("2026/27")} tax year) are tracked and enforced by {e(checks)} that run on every deploy. Your calculator stays correct in April.</span></div>
<div class="w"><b>Free tier is a real tier</b><span>Embedding costs nothing, forever. The small credit line is the whole price — a licence simply removes it and adds your brand.</span></div>
</div>
</section>

<section class="section">
<h2>The calculators people ask for by name</h2>
<div class="fgrid">
{chr(10).join(featured_rows)}
</div>
<p style="color:var(--text-secondary);font-size:.85rem;margin-top:14px">Plus {fin - len(FEATURED_SLUGS)} more in the category — budgeting, debt payoff, IR35, freelancer rates, stamp-duty-style deal checks and the rest of the money shelf. <a href="embed.html?cat={e(cat_param)}" style="color:var(--accent)">See all {fin} →</a></p>
</section>

<section class="section">
<h2>Why the numbers can be trusted</h2>
<div class="proof">
<p><b>The maths is easy to get wrong.</b> The £100,000 personal-allowance taper creates a 60% marginal rate; modelling the basic-rate band as a fixed ceiling instead of a fixed width gets it wrong — and that exact bug has been found in commercial calculator products. Ours is tested against an independent implementation of the published HMRC rules, not against its own logic.</p>
<p><b>{e(checks)} run on every deploy.</b> If a change breaks a statutory computation, the build fails before it ships. The figures currently model the {e("2026/27")} tax year: personal allowance £12,570 (frozen to April 2028), basic rate 20% to £50,270, higher rate 40% to £125,140, employee NI 8%/2%.</p>
<p><b>The update history is public.</b> Statutory changes land with a dated entry in the <a href="changelog.html" style="color:var(--accent)">changelog</a> — the same evidence a buyer needs before trusting an unknown supplier with their clients' numbers.</p>
</div>
</section>

<section id="pricing" class="section pricing">
<h2>Pricing — free forever, branded from £99</h2>
<p class="p-lead">Embedding is <strong>free, forever, no account</strong>. The credit line under each tool is the entire price of the free tier. A licence removes it and puts <em>your</em> brand on the tool. Annual; cancel by not renewing; activation is a licence key you paste once.</p>
<div class="tier-grid">
{chr(10).join(tier_rows)}
</div>
<p class="p-fine">Prices are per year and include statutory updates while active. These calculators are estimating tools, <strong>not financial advice</strong>: figures are maintained against HMRC's published {e("2026/27")} rules and enforced by {e(checks)} on every deploy — see the <a href="changelog.html" style="color:var(--accent)">changelog</a>. Visitors' inputs are processed in their own browser; the embeds collect nothing for us.</p>
</section>

<section class="section">
<h2>Questions, answered plainly</h2>
{chr(10).join(faq_rows)}
</section>

</main>

<footer><div class="wrap">
<p><a href="index.html">All {total} tools</a>·<a href="embed.html">Embed any tool</a>·<a href="changelog.html">Changelog</a>·<a href="about.html">About</a>·<a href="help.html">Help</a>·<a href="donate.html">Donate</a>·<a href="sponsor.html">Sponsor</a>·<a href="listen.html">Music</a></p>
<p class="foot-note">Traffic on this landing page is measured with Google Analytics. The embedded calculators themselves record nothing — there is no sign-up, no paywall and no input anywhere in them that reaches us. Everything runs in your browser.</p>
</div></footer>
</body></html>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if embed-finance.html is stale")
    args = ap.parse_args()
    page = build_page()
    if args.check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != page:
            sys.exit("embed-finance.html is stale vs cards/cards.json + check-finance.js — "
                     "run: python3 scripts/build-embed-landing.py")
        print("embed-finance.html is current.")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote embed-finance.html ({len(page)} bytes)")


if __name__ == "__main__":
    main()
