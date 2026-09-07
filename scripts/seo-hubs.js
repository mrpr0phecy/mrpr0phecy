#!/usr/bin/env node
// seo-hubs.js — category landings, intent hubs, about page, RSS, humans.txt
// Called from generate-discoverability.js. Zero dependencies.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.themostusefulsiteintheworld.com';
const SITE = 'The Most Useful Site in the World';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffd400'/%3E%3Cstop offset='1' stop-color='%23ff9500'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3C/svg%3E";
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-G058FVW6Z2"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','G-G058FVW6Z2');</script>`;

const CAT_BLURB = {
  'AI & Autonomous Agents': 'Prompt injection tests, token budgets, function-calling schemas and ReAct loops — the bits you usually pay an LLM playground for. Every tool here runs in the browser so a system prompt never has to leave your machine. Built for people shipping agents, not for reading another abstract paper.',
  'Algorithms & Computer Science': 'Watch sorting, pathfinding, Huffman codes and a tiny neural net actually move. These are working visualisers, not screenshots from a textbook. Use them to explain Big-O to a colleague, or to remember why XOR killed the first wave of perceptrons.',
  'Anime & Otaku Culture': 'Binge-time maths, filler guides, JST broadcast clocks and cosplay prop scaling. If you have ever paused an episode to work out “how many hours is the rest of this season”, that is what this shelf is for. No streaming accounts, no trackers.',
  'Aquatics & Fishkeeping': 'Tank volume, bioload, CO₂, PAR lighting and medication doses from net water, not from the glass-on-glass sticker. Aimed at planted-tank and marine keepers who would rather do the arithmetic once than guess with a bottle of ammonia.',
  'Astronomy & Space': 'Eyepiece maths, collimation, airmass, lunar phase and redshift — the calculations you do at the scope or at the desk before a dark-sky night. Nothing here needs a planetarium subscription or a GPS login.',
  'Birdwatching & Ornithology': 'Binocular optics, nest-box hole sizes, molt ageing and feeder diets. Field tools for people who already own a notebook, not another gamified life-list app that wants an account.',
  'Culinary & Food Science': 'Baker’s percentages, sous-vide pasteurisation windows, sugar stages and yeast conversions. Kitchen arithmetic with the units chefs actually use, including UK gas marks. Not a recipe site and not nutritional advice.',
  'Dogs & Canine Care': 'Theobromine dose, WSAVA calories, crate sizing and the epigenetic “dog years” clock. Emergency and day-to-day numbers for owners who would rather not paste a chocolate bar into a random forum at 11pm.',
  'Finance & Money': 'Mortgages, FIRE, HMRC mileage, take-home pay, CAGR and VAT. UK-first where the rules are British, honest about being arithmetic rather than advice. No lead-gen forms, no “talk to an adviser” pop-up.',
  'Health & Fitness': 'BMI, BMR, TDEE, heart-rate zones, HbA1c conversion and pregnancy dating. Screening maths, labelled as such — not a diagnosis, not a coaching upsell. Runs offline once the page has loaded.',
  'Home & DIY': 'Paint, plaster, stairs, roof pitch, concrete and deck joists. The quantities you work out on the back of a delivery note before you drive to the merchant. Metric and imperial where both are still used on UK sites.',
  'Interactive Art & Living Worlds': 'Living simulations: reaction–diffusion, petri-dish evolution, spirograph nebulae. Art you can poke, not a gallery you can only watch. No Web3 wallet, no “mint this”.',
  'Lucid Dreaming & Sleep': 'WBTB timing, reality-check drills and REM-window planners. Practical sleep-lab arithmetic for people already keeping a dream journal — not a wearable that sells your nights.',
  'Mathematics': 'Algebra, calculus, primes, logarithms, matrices and a graphing calculator. Exam-desk tools and the kind of playground that makes a formula less abstract. Nothing is sent to a CAS in the cloud.',
  'Mind-Blowing Demos': 'Mandelbrot, Lorenz, Game of Life, Fourier series, Buffon’s needle. Short, honest demonstrations of ideas that are usually trapped in a lecture slide. Share the URL; it is the exhibit.',
  'MrProphecy Arcade': 'Small browser games and music-adjacent toys that live with the tool catalogue. Separate from the MrProphecy listening pages — this shelf is for playing, not for streaming.',
  'Museum & Collection': 'Hands-on halls: chance, constants, deep time, beams, pipes, daylight. Museum-floor interactives you can open on a phone in a queue. Built to explain, not to upsell a ticket.',
  'Music & Audio': 'Tuners, metronomes, capo maths, interval trainers and a tone generator. Musician utilities that work without a DAW licence or a sample pack. Product A tools — not the MrProphecy discography.',
  'Natural Remedies & Herbs': 'Tincture ratios, essential-oil dilution and herb/drug interaction flags. Kitchen-apothecary arithmetic with the safety notes left in. Not a prescription and not a shop.',
  'Productivity & Lifestyle': 'The daily grind shelf: unit converters, dates, packing, passwords, QR, travel sizes, work hours. One hundred and fifty-odd single-purpose pages so you do not have to open a spreadsheet for a three-line sum.',
  'SaaS & Business Killers': 'JSON, CSS, regex, invoices, privacy policies, favicons, SQL formatters — the jobs people rent a monthly app for. Each one is a static page. Your CSV never goes to someone else’s parser.',
  'Science & Engineering': 'Ohm’s law, orbitals, psychrometrics, subnetting, optics and a cloud chamber. Lab and workshop calculators plus the big interactive demos. Aimed at students, techs and the chronically curious.',
  'Sports': 'Cricket NRR, darts checkouts, WHS golf, F1 points, boxing 10-point-must and a youth rotation planner. Scoreboard maths for people running a club from a phone on the touchline.',
  'Survival & Emergency Readiness': 'Water, fire escape, CO, go-bags, cold-water rescue. Advice-and-calculation tools that name the emergency number they rely on. They do not replace training or 999.',
  'Virtual Worlds & Gaming': 'Second Life prims, L$ estimates, region maps and surnames. Builder utilities for a virtual world, running in an ordinary browser tab.',
  'Wellbeing & Community': 'Apology scripts, scam checks, plain-language rewrites, grief and carer handover sheets. Written for the moment you are stuck, and they stay on your device.',
  'Writing & Language': 'Citations, readability, markdown, Japanese/Korean/Spanish drills, regex and character counters. Writer and learner tools without an AI that keeps your draft.',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function plainTitle(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  const stripped = s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return stripped || s;
}

function catSlug(cat) {
  return String(cat || 'tools')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tools';
}

function metaDescription(desc, fallbackTitle) {
  let d = String(desc || '').replace(/\s+/g, ' ').trim();
  if (!d) d = `Free online ${fallbackTitle} — runs in your browser, no sign-up, no ads.`;
  if (d.length > 155) {
    const cut = d.slice(0, 152);
    const sp = cut.lastIndexOf(' ');
    d = (sp > 80 ? cut.slice(0, sp) : cut).replace(/[.,;:–—-]+$/, '') + '…';
  }
  return d;
}

function orgLd() {
  return {
    '@type': 'Organization',
    '@id': BASE + '/#org',
    name: SITE,
    url: BASE + '/',
    logo: BASE + '/og-tools.png',
    email: 'hello@themostusefulsiteintheworld.com',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Luton',
      addressCountry: 'GB',
    },
  };
}

const LANDING_CSS = `
:root { --accent:#2dd4ff; --text:#e6faff; --muted:rgba(230,250,255,.7); --bg:#0a0f14; --card:#141e28; --line:rgba(255,255,255,.08); --font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
* { box-sizing: border-box; }
html { color-scheme: dark; scroll-behavior: smooth; }
body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font); line-height:1.65; }
::selection { background:rgba(45,212,255,.3); color:#fff; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(10,15,20,.95); }
.top a { color:var(--accent); text-decoration:none; font-weight:700; min-height:40px; display:inline-flex; align-items:center; }
header, main, .foot { max-width:1040px; margin:0 auto; padding:28px 20px; }
h1 { font-size:clamp(1.7rem,4vw,2.5rem); letter-spacing:-.03em; margin:8px 0 12px; }
h2 { font-size:1.15rem; margin:28px 0 10px; }
.lead { color:var(--muted); max-width:720px; margin:0 0 18px; }
.crumbs { font-size:13px; color:var(--muted); margin:0 0 16px; }
.crumbs a { color:var(--accent); }
.hubs { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 8px; }
.hubs a, .toc a {
  display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:6px 12px;
  border-radius:999px; border:1px solid var(--line); color:var(--text); text-decoration:none; font-size:.82rem; font-weight:600;
  background:rgba(20,30,40,.7);
}
.hubs a:hover, .toc a:hover { border-color:var(--accent); color:#fff; }
.toc { display:flex; flex-wrap:wrap; gap:8px; }
.grid { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px; }
.grid li { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
.grid a { color:var(--accent); text-decoration:none; font-weight:700; }
.grid a:hover { text-decoration:underline; }
.grid p { margin:4px 0 0; font-size:.82rem; color:var(--muted); }
.faq h3 { font-size:1rem; margin:16px 0 6px; }
.faq p { color:var(--muted); margin:0 0 10px; }
.foot { color:var(--muted); font-size:.85rem; padding-bottom:40px; }
.foot a { color:var(--accent); }
@media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
`;

function headBlock({ title, desc, url, extra = '' }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="text/plain" href="${BASE}/llms.txt" title="LLM catalogue">
  <link rel="alternate" type="application/rss+xml" href="${BASE}/feed.xml" title="${esc(SITE)} tools">
  <link rel="sitemap" type="application/xml" href="${BASE}/sitemap.xml">
  <link rel="search" type="application/opensearchdescription+xml" href="${BASE}/opensearch.xml" title="${esc(SITE)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(SITE)}">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${BASE}/og-tools.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(SITE)} — free online tools">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${BASE}/og-tools.png">
  <meta name="theme-color" content="#0a0f14">
  <link rel="icon" href="${ICON}">
  <link rel="apple-touch-icon" href="${BASE}/icon-192.png">
  ${extra}
  <style>${LANDING_CSS}</style>
  ${GA}
</head>`;
}

function toolList(items, hrefPrefix) {
  return `<ul class="grid">
    ${items.map((c) => {
      const t = plainTitle(c.title);
      const d = metaDescription(c.description, t);
      return `<li><a href="${esc(hrefPrefix + c.name)}.html"><strong>${esc(c.title)}</strong></a><p>${esc(d)}</p></li>`;
    }).join('\n    ')}
  </ul>`;
}

function navChrome(count) {
  return `<div class="top">
  <a href="${BASE}/">${esc(SITE)}</a>
  <a href="${BASE}/all-tools.html">All ${count} tools</a>
</div>`;
}

function footChrome(count) {
  return `<p class="foot">
    <a href="${BASE}/">Home</a> ·
    <a href="${BASE}/all-tools.html">All ${count} tools</a> ·
    <a href="${BASE}/calculators.html">Calculators</a> ·
    <a href="${BASE}/converters.html">Converters</a> ·
    <a href="${BASE}/generators.html">Generators</a> ·
    <a href="${BASE}/developer-tools.html">Developer tools</a> ·
    <a href="${BASE}/about-tools.html">About</a> ·
    <a href="${BASE}/llms.txt">llms.txt</a> ·
    <a href="${BASE}/donate.html">Donate</a>
  </p>`;
}

function categoryPage(cat, list, allCats, count) {
  const slug = catSlug(cat);
  const url = `${BASE}/categories/${slug}.html`;
  const n = list.length;
  const blurb = CAT_BLURB[cat] || `Free ${cat} tools that run in your browser. No ads, no sign-up.`;
  const title = `${n} Free ${cat} Tools | ${SITE}`;
  const desc = metaDescription(`${n} free ${cat.toLowerCase()} tools — calculators and utilities that run in your browser. No ads, no sign-up. ${blurb}`, cat);
  const others = allCats.filter((c) => c !== cat).slice(0, 6);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      orgLd(),
      {
        '@type': 'CollectionPage',
        name: `${n} Free ${cat} Tools`,
        url,
        inLanguage: 'en-GB',
        isAccessibleForFree: true,
        description: desc,
        isPartOf: { '@type': 'WebSite', name: SITE, url: BASE + '/' },
        about: cat,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: n,
          itemListElement: list.slice(0, 50).map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: plainTitle(c.title),
            url: `${BASE}/tools/${c.name}.html`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE, item: BASE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Categories', item: BASE + '/categories/' },
          { '@type': 'ListItem', position: 3, name: cat, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Are these ${cat.toLowerCase()} tools free?`,
            acceptedAnswer: { '@type': 'Answer', text: `Yes. All ${n} ${cat} tools are free, with no account and no ads.` },
          },
          {
            '@type': 'Question',
            name: `Do I need to install anything?`,
            acceptedAnswer: { '@type': 'Answer', text: 'No. Each tool is a web page. Open it in any modern browser on your phone or computer.' },
          },
        ],
      },
    ],
  };
  const sorted = [...list].sort((a, b) => plainTitle(a.title).localeCompare(plainTitle(b.title)));
  return `${headBlock({ title, desc, url, extra: `<script type="application/ld+json">${jsonLd(ld)}</script>` })}
<body>
  ${navChrome(count)}
  <header>
    <p class="crumbs"><a href="${BASE}/">Home</a> / <a href="${BASE}/categories/">Categories</a> / ${esc(cat)}</p>
    <h1>Free ${esc(cat)} tools</h1>
    <p class="lead">${esc(blurb)} ${n} tools in this category. Every one is a permanent URL you can bookmark or share.</p>
    <nav class="hubs" aria-label="Also browse">
      <a href="${BASE}/all-tools.html">A–Z directory</a>
      <a href="${BASE}/calculators.html">Calculators</a>
      <a href="${BASE}/converters.html">Converters</a>
      <a href="${BASE}/generators.html">Generators</a>
    </nav>
  </header>
  <main>
    ${toolList(sorted, `${BASE}/tools/`)}
    <section class="faq">
      <h2>Using these tools</h2>
      <h3>Are they free?</h3>
      <p>Yes. All ${n} ${esc(cat)} tools are free, with no account and no ads.</p>
      <h3>Do I need to install anything?</h3>
      <p>No. Open the page in any modern browser. Most tools keep what you type on this device.</p>
    </section>
    <h2>Other categories</h2>
    <nav class="toc">${others.map((c) => `<a href="${BASE}/categories/${catSlug(c)}.html">${esc(c)}</a>`).join('\n      ')}</nav>
  </main>
  ${footChrome(count)}
</body>
</html>
`;
}

function categoriesIndex(cats, byCat, count) {
  const url = `${BASE}/categories/`;
  const title = `Tool categories — ${cats.length} free collections | ${SITE}`;
  const desc = `Browse ${count} free online tools in ${cats.length} categories: calculators, converters, generators, health, finance, DIY, developer utilities and more. No sign-up.`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Tool categories',
    url,
    description: desc,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: cats.length,
      itemListElement: cats.map((cat, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: cat,
        url: `${BASE}/categories/${catSlug(cat)}.html`,
      })),
    },
  };
  const items = cats.map((cat) => {
    const n = byCat.get(cat).length;
    const blurb = CAT_BLURB[cat] || '';
    return `<li><a href="${catSlug(cat)}.html"><strong>${esc(cat)}</strong> · ${n}</a><p>${esc(metaDescription(blurb, cat))}</p></li>`;
  }).join('\n    ');
  return `${headBlock({ title, desc, url, extra: `<script type="application/ld+json">${jsonLd(ld)}</script>` })}
<body>
  ${navChrome(count)}
  <header>
    <p class="crumbs"><a href="${BASE}/">Home</a> / Categories</p>
    <h1>Browse ${count} tools by category</h1>
    <p class="lead">Twenty-seven collections, each a real page with every tool linked. If you arrived from search looking for a kind of calculator rather than one name, start here.</p>
  </header>
  <main>
    <ul class="grid">
    ${items}
    </ul>
  </main>
  ${footChrome(count)}
</body>
</html>
`;
}

function intentMatch(card, kind) {
  const t = `${card.title} ${card.name} ${card.description} ${card.category}`.toLowerCase();
  if (kind === 'calc') return /calculat|estimator|\bcalc\b|planner|score/.test(t);
  if (kind === 'conv') return /convert|converter|⇄|encoder|decoder|formatter/.test(t);
  if (kind === 'gen') return /generat|builder|maker|forge|synthesi/.test(t);
  if (kind === 'dev') {
    return card.category === 'SaaS & Business Killers'
      || card.category === 'Algorithms & Computer Science'
      || /json|css|html|regex|sql|uuid|http|git|xml|yaml|token|jwt|cidr|hex|base64/.test(t);
  }
  return false;
}

function hubPage({ file, h1, title, desc, blurb, kind, cards, count }) {
  const url = `${BASE}/${file}`;
  const list = cards.filter((c) => intentMatch(c, kind))
    .sort((a, b) => plainTitle(a.title).localeCompare(plainTitle(b.title)));
  const n = list.length;
  const pageDesc = metaDescription(`${n} free online ${h1.toLowerCase()} — ${desc}`, h1);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      orgLd(),
      {
        '@type': 'CollectionPage',
        name: h1,
        url,
        description: pageDesc,
        inLanguage: 'en-GB',
        isAccessibleForFree: true,
        isPartOf: { '@type': 'WebSite', name: SITE, url: BASE + '/' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: n,
          itemListElement: list.slice(0, 40).map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: plainTitle(c.title),
            url: `${BASE}/tools/${c.name}.html`,
          })),
        },
      },
    ],
  };
  return `${headBlock({ title, desc: pageDesc, url, extra: `<script type="application/ld+json">${jsonLd(ld)}</script>` })}
<body>
  ${navChrome(count)}
  <header>
    <p class="crumbs"><a href="${BASE}/">Home</a> / ${esc(h1)}</p>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(blurb)} ${n} matching tools, each with its own URL.</p>
    <nav class="hubs" aria-label="Other collections">
      <a href="${BASE}/calculators.html">Calculators</a>
      <a href="${BASE}/converters.html">Converters</a>
      <a href="${BASE}/generators.html">Generators</a>
      <a href="${BASE}/developer-tools.html">Developer tools</a>
      <a href="${BASE}/categories/">Categories</a>
    </nav>
  </header>
  <main>
    ${toolList(list, `${BASE}/tools/`)}
  </main>
  ${footChrome(count)}
</body>
</html>
`;
}

function aboutPage(count, cats) {
  const url = `${BASE}/about-tools.html`;
  const title = `About these ${count} free tools | ${SITE}`;
  const desc = `${count} free browser tools built by one person in Luton. No ads, no accounts, no paywall. What you type stays in your browser.`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      orgLd(),
      {
        '@type': 'AboutPage',
        name: title,
        url,
        description: desc,
        inLanguage: 'en-GB',
        isPartOf: { '@type': 'WebSite', name: SITE, url: BASE + '/' },
      },
      {
        '@type': 'Person',
        name: 'Russell Head',
        jobTitle: 'Independent developer',
        address: { '@type': 'PostalAddress', addressLocality: 'Luton', addressCountry: 'GB' },
        email: 'hello@themostusefulsiteintheworld.com',
      },
    ],
  };
  return `${headBlock({ title, desc, url, extra: `<script type="application/ld+json">${jsonLd(ld)}</script>` })}
<body>
  ${navChrome(count)}
  <header>
    <p class="crumbs"><a href="${BASE}/">Home</a> / About</p>
    <h1>About The Most Useful Site in the World</h1>
    <p class="lead">${count} free tools. No ads, no accounts, no paywall. Built and maintained by one person in Luton, England.</p>
  </header>
  <main>
    <h2>What this is</h2>
    <p class="lead">A catalogue of self-contained browser tools — calculators, converters, generators, visualisers — that you can open, use, and close. There is no product funnel behind them. The URL of a tool is the product.</p>
    <h2>How the tools work</h2>
    <p class="lead">Each tool is a static HTML page. After the page loads, almost everything happens on your device. We do not ask for an email. We do not store what you type. A handful of tools (for example live currency) may call a public API; those say so on the page.</p>
    <h2>Who makes it</h2>
    <p class="lead">Russell Head, working independently. The same domain also hosts a separate music project (MrProphecy). The tools and the music are kept apart on purpose so a calculator page is not a music advert.</p>
    <h2>Contact</h2>
    <p class="lead">Broken tool, missing tool, or a sponsorship question: <a href="mailto:hello@themostusefulsiteintheworld.com">hello@themostusefulsiteintheworld.com</a>. If a page helped you, the most useful thing you can do is send someone the specific URL, not the homepage.</p>
    <h2>${cats.length} categories</h2>
    <nav class="toc">${cats.map((c) => `<a href="${BASE}/categories/${catSlug(c)}.html">${esc(c)}</a>`).join('\n      ')}</nav>
  </main>
  ${footChrome(count)}
</body>
</html>
`;
}

function rssXml(cards) {
  const items = [...cards]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const t = plainTitle(c.title);
      const d = esc(String(c.description || t).replace(/\s+/g, ' ').trim()).slice(0, 300);
      const link = `${BASE}/tools/${c.name}.html`;
      return `  <item>
    <title>${esc(t)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <category>${esc(c.category)}</category>
    <description>${d}</description>
  </item>`;
    }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(SITE)} — free online tools</title>
  <link>${BASE}/</link>
  <description>${cards.length} free browser tools. No ads, no sign-up.</description>
  <language>en-gb</language>
  <image>
    <url>${BASE}/og-tools.png</url>
    <title>${esc(SITE)}</title>
    <link>${BASE}/</link>
  </image>
${items}
</channel>
</rss>
`;
}

function humansTxt(count) {
  return `/* TEAM */
Developer: Russell Head
From: Luton, England
Contact: hello@themostusefulsiteintheworld.com

/* SITE */
Standards: HTML5, CSS3, JSON-LD
Language: en-GB
Tools: ${count} free browser utilities
Last update: ${new Date().toISOString().slice(0, 10)}
`;
}

function generateHubs(cards) {
  const count = cards.length;
  const cats = [...new Set(cards.map((c) => c.category))].sort((a, b) => a.localeCompare(b));
  const byCat = new Map();
  for (const c of cards) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }

  const catDir = path.join(ROOT, 'categories');
  fs.mkdirSync(catDir, { recursive: true });
  const keep = new Set(['index.html']);
  for (const cat of cats) {
    const slug = catSlug(cat);
    const html = categoryPage(cat, byCat.get(cat), cats, count);
    fs.writeFileSync(path.join(catDir, `${slug}.html`), html);
    keep.add(`${slug}.html`);
  }
  fs.writeFileSync(path.join(catDir, 'index.html'), categoriesIndex(cats, byCat, count));
  for (const f of fs.readdirSync(catDir)) {
    if (!keep.has(f)) fs.unlinkSync(path.join(catDir, f));
  }

  const hubs = [
    {
      file: 'calculators.html',
      h1: 'Free online calculators',
      title: `Free Online Calculators (${count} tools, no sign-up) | ${SITE}`,
      desc: 'Mortgage, BMI, paint, VAT, darts, subnet — free calculators that run in your browser.',
      blurb: 'Calculators with the working on the page. No email wall, no “unlock full results”. Bookmark the one you actually use.',
      kind: 'calc',
    },
    {
      file: 'converters.html',
      h1: 'Free online converters',
      title: `Free Online Converters — units, colour, time, text | ${SITE}`,
      desc: 'Unit, colour, timestamp, case and currency converters. Free, no sign-up, runs in your browser.',
      blurb: 'Converters for the boring jobs: hex to RGB, stone to kilograms, Unix time, text case. Paste, convert, copy. Nothing is uploaded.',
      kind: 'conv',
    },
    {
      file: 'generators.html',
      h1: 'Free online generators',
      title: `Free Generators — UUID, CSS, QR, lorem, passwords | ${SITE}`,
      desc: 'UUID, CSS, QR, lorem ipsum, passphrases and other generators. Free, local, no account.',
      blurb: 'Generators that stay on your machine: UUIDs, palettes, QR codes, lorem, gitignore files. Useful when you do not want a SaaS watching the output.',
      kind: 'gen',
    },
    {
      file: 'developer-tools.html',
      h1: 'Free developer tools',
      title: `Free Developer Tools — JSON, CSS, regex, SQL, HTTP | ${SITE}`,
      desc: 'Browser developer utilities: JSON, CSS, regex, SQL, HTTP status, UUID, Git. No sign-up.',
      blurb: 'The utilities you open in a second tab while shipping: formatters, cheatsheets, regex testers, token counters. Built as static pages so a paste does not become someone else’s training data.',
      kind: 'dev',
    },
  ];
  for (const h of hubs) {
    fs.writeFileSync(path.join(ROOT, h.file), hubPage({ ...h, cards, count }));
  }

  fs.writeFileSync(path.join(ROOT, 'about-tools.html'), aboutPage(count, cats));
  fs.writeFileSync(path.join(ROOT, 'feed.xml'), rssXml(cards));
  fs.writeFileSync(path.join(ROOT, 'humans.txt'), humansTxt(count));

  const extraSitemap = [
    ['categories/index.html', '0.75', 'weekly'],
    ...cats.map((cat) => [`categories/${catSlug(cat)}.html`, '0.7', 'weekly']),
    ['calculators.html', '0.8', 'weekly'],
    ['converters.html', '0.8', 'weekly'],
    ['generators.html', '0.8', 'weekly'],
    ['developer-tools.html', '0.8', 'weekly'],
    ['about-tools.html', '0.7', 'monthly'],
  ];
  return extraSitemap;
}

module.exports = { generateHubs, catSlug, orgLd, CAT_BLURB };

if (require.main === module) {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'cards.json'), 'utf8'));
  const extra = generateHubs(cards);
  console.log('seo-hubs:', extra.length, 'extra sitemap URLs');
}
