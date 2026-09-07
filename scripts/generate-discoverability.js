#!/usr/bin/env node
// generate-discoverability.js
// Rebuilds the crawlable Product A surface from cards/cards.json:
//   tools/<slug>.html   unique title/description/canonical/JSON-LD per tool
//   tools/index.html    redirect to the A–Z directory
//   tools/tool-page.css + tools/tool-page.js  shared chrome
//   all-tools.html      crawlable directory (works without JavaScript)
//   llms.txt / llms-full.txt / ai.txt
//   sitemap.xml         prefers tools/ over untitled cards/ fragments
//
// Zero dependencies. Run after generate-cards-json.js, or standalone.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CARDS_JSON = path.join(ROOT, 'cards', 'cards.json');
const TOOLS_DIR = path.join(ROOT, 'tools');
const BASE = 'https://www.themostusefulsiteintheworld.com';
const TODAY = new Date().toISOString().slice(0, 10);
const SITE = 'The Most Useful Site in the World';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffd400'/%3E%3Cstop offset='1' stop-color='%23ff9500'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3C/svg%3E";

const EXCLUDE_SITEMAP = new Set([
  '404.html',
  'hokidea.html',
  'indexbeta.html',
  'tool.html',
]);

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

function relatedFor(card, all) {
  return all
    .filter((c) => c.category === card.category && c.name !== card.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 6);
}

function gitHtmlFiles() {
  const r = spawnSync('git', ['ls-files', '*.html', '**/*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) return [];
  return r.stdout.split(/\n/).map((s) => s.trim()).filter(Boolean);
}

const TOOL_PAGE_CSS = `/* Shared chrome for /tools/<slug>.html — Product A cyan terminal */
:root {
  --accent: #2dd4ff;
  --accent-dark: #1aa3cc;
  --text: #e6faff;
  --text-secondary: rgba(230, 250, 255, 0.7);
  --text-tertiary: rgba(230, 250, 255, 0.4);
  --bg-primary: #0a0f14;
  --bg-secondary: #141e28;
  --border-light: rgba(255, 255, 255, 0.08);
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
html { color-scheme: dark; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0f14;
  color: var(--text);
  font-family: var(--font-sans);
  line-height: 1.6;
}
::selection { background: rgba(45, 212, 255, 0.3); color: #fff; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.top-nav {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 20px;
  background: rgba(10, 15, 20, 0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-light);
}
.nav-brand {
  display: flex; align-items: center; gap: 8px;
  color: var(--text); font-weight: 700; font-size: 15px;
  text-decoration: none; min-height: 40px;
}
.nav-brand:hover { color: var(--accent); text-decoration: none; }
.nav-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.nav-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; padding: 8px 14px; border-radius: 10px;
  border: 1px solid rgba(45, 212, 255, 0.3);
  background: rgba(45, 212, 255, 0.08);
  color: var(--accent); font-size: 13px; font-weight: 600;
  cursor: pointer; text-decoration: none;
}
.nav-btn:hover { background: rgba(45, 212, 255, 0.2); text-decoration: none; }
.wrap { flex: 1; max-width: 960px; width: 100%; margin: 0 auto; padding: 28px 20px 56px; }
.crumbs { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; }
.crumbs a { color: var(--accent); }
.crumbs ol { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.crumbs li:not(:last-child)::after { content: "/"; margin-left: 6px; color: var(--text-tertiary); }
.lead { color: var(--text-secondary); margin: 0 0 18px; font-size: 1.02rem; }
.meta-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.badge {
  display: inline-block; padding: 4px 12px; border-radius: 999px;
  background: rgba(45, 212, 255, 0.12); border: 1px solid rgba(45, 212, 255, 0.3);
  color: var(--accent); font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; text-decoration: none;
}
.badge:hover { text-decoration: none; background: rgba(45, 212, 255, 0.2); }
.quiet { font-size: 13px; color: var(--text-tertiary); }
.box {
  background: #141e28; border: 1px solid var(--border-light); border-radius: 14px;
  padding: 24px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4); min-width: 0;
}
.box > div { min-width: 0; max-width: 100%; }
.related { margin-top: 36px; padding-top: 28px; border-top: 1px solid var(--border-light); }
.related h2 { font-size: 18px; margin: 0 0 14px; }
.related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.related a {
  display: block; padding: 14px; border-radius: 10px; text-decoration: none; color: inherit;
  background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);
}
.related a:hover { border-color: rgba(45, 212, 255, 0.4); background: rgba(45, 212, 255, 0.05); text-decoration: none; }
.related strong { display: block; color: var(--accent); font-size: 14px; margin-bottom: 4px; }
.related span { display: block; font-size: 12px; color: var(--text-secondary); }
.page-footer {
  border-top: 1px solid var(--border-light); padding: 22px; text-align: center;
  font-size: 13px; color: var(--text-secondary);
}
.page-footer a { color: var(--accent); }
.toast {
  position: fixed; bottom: 24px; right: 24px; background: #141e28;
  border: 1px solid var(--accent); color: var(--text); padding: 12px 20px;
  border-radius: 8px; z-index: 1000; opacity: 0; transform: translateY(10px);
  transition: 0.2s ease; pointer-events: none;
}
.toast.show { opacity: 1; transform: none; }
noscript p { color: var(--text-secondary); }
@media (max-width: 640px) {
  .top-nav { flex-wrap: wrap; padding: 10px 14px; }
  .box { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .toast { transition: none; }
}
`;

const TOOL_PAGE_JS = `/* Shared loader for /tools/<slug>.html — injects the card fragment. */
(function () {
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function inject(container, html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var scripts = Array.from(doc.querySelectorAll('script'));
    scripts.forEach(function (s) { s.remove(); });
    var styles = Array.from(doc.querySelectorAll('style'));
    styles.forEach(function (s) { s.remove(); });
    container.innerHTML = '';
    var wrap = document.createElement('div');
    while (doc.body.firstChild) wrap.appendChild(doc.body.firstChild);
    container.appendChild(wrap);
    styles.forEach(function (s) {
      var n = document.createElement('style');
      n.textContent = s.textContent;
      container.appendChild(n);
    });
    scripts.forEach(function (s) {
      try {
        var n = document.createElement('script');
        Array.from(s.attributes).forEach(function (a) { n.setAttribute(a.name, a.value); });
        n.textContent = s.textContent;
        container.appendChild(n);
      } catch (err) { console.warn(err); }
    });
  }

  async function boot() {
    var slug = document.body.getAttribute('data-tool');
    var box = document.getElementById('toolBox');
    if (!slug || !box) return;
    try {
      var res = await fetch('../cards/' + encodeURIComponent(slug) + '.html');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      inject(box, await res.text());
    } catch (err) {
      box.innerHTML = '<p style="color:#ff4d4d">Could not load this tool (' + String(err.message || err) + '). Try the <a href="../all-tools.html">full catalogue</a>.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    var share = document.getElementById('shareBtn');
    if (share) share.addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('Link copied'); }).catch(function () { toast(url); });
      } else { toast(url); }
    });
    var embed = document.getElementById('embedBtn');
    if (embed) embed.addEventListener('click', function () {
      var slug = document.body.getAttribute('data-tool') || '';
      var title = document.body.getAttribute('data-title') || 'Tool';
      var code = '<iframe src="' + location.origin + '/tool.html?card=' + encodeURIComponent(slug) + '" width="100%" height="450" style="border:none;border-radius:12px;" title="' + title.replace(/"/g, '') + '"></iframe>';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast('Embed code copied'); }).catch(function () { prompt('Copy embed code', code); });
      } else { prompt('Copy embed code', code); }
    });
  });
})();
`;

function toolPageHtml(card, related, count) {
  const slug = card.name;
  const file = `${slug}.html`;
  const titlePlain = plainTitle(card.title);
  const pageTitle = `${titlePlain} | Free Online Tool`;
  const desc = metaDescription(card.description, titlePlain);
  const url = `${BASE}/tools/${file}`;
  const catUrl = `${BASE}/all-tools.html#cat-${catSlug(card.category)}`;
  const catRel = `../all-tools.html#cat-${catSlug(card.category)}`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': url + '#app',
        name: titlePlain,
        url,
        description: desc,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        inLanguage: 'en-GB',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
        isPartOf: { '@type': 'WebSite', name: SITE, url: BASE + '/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE, item: BASE + '/' },
          { '@type': 'ListItem', position: 2, name: card.category, item: catUrl },
          { '@type': 'ListItem', position: 3, name: titlePlain, item: url },
        ],
      },
    ],
  };
  const relatedHtml = related.length
    ? related.map((r) => {
        const rt = plainTitle(r.title);
        const rd = metaDescription(r.description, rt);
        return `<a href="${esc(r.name)}.html"><strong>${esc(r.title)}</strong><span>${esc(rd)}</span></a>`;
      }).join('\n      ')
    : `<a href="../all-tools.html"><strong>Browse all ${count} tools</strong><span>Free, no sign-up, runs in your browser.</span></a>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="text/plain" href="${BASE}/llms.txt" title="LLM catalogue">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(SITE)}">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${BASE}/og-tools.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${BASE}/og-tools.png">
  <meta name="theme-color" content="#0a0f14">
  <link rel="icon" href="${ICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../cards/card.css">
  <link rel="stylesheet" href="tool-page.css">
  <script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body data-tool="${esc(slug)}" data-title="${esc(titlePlain)}">
  <nav class="top-nav" aria-label="Site">
    <a class="nav-brand" href="../index.html"><span aria-hidden="true">←</span> ${esc(SITE)}</a>
    <div class="nav-actions">
      <a class="nav-btn" href="../all-tools.html">All ${count} tools</a>
      <button type="button" class="nav-btn" id="shareBtn">Share</button>
      <button type="button" class="nav-btn" id="embedBtn">Embed</button>
    </div>
  </nav>
  <main class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="../index.html">Home</a></li>
        <li><a href="${esc(catRel)}">${esc(card.category)}</a></li>
        <li aria-current="page">${esc(titlePlain)}</li>
      </ol>
    </nav>
    <div class="meta-row">
      <a class="badge" href="${esc(catRel)}">${esc(card.category)}</a>
      <span class="quiet">Free · No sign-up · Runs in your browser</span>
    </div>
    <h1>${esc(card.title)}</h1>
    <p class="lead">${esc(card.description || desc)}</p>
    <div class="box" id="toolBox">
      <p class="quiet">Loading ${esc(titlePlain)}…</p>
    </div>
    <noscript>
      <p>${esc(titlePlain)} runs in your browser and needs JavaScript. You can still read what it does above, or <a href="../all-tools.html">browse every tool as plain HTML</a>.</p>
    </noscript>
    <section class="related" aria-labelledby="related-heading">
      <h2 id="related-heading">Related ${esc(card.category)} tools</h2>
      <div class="related-grid">
      ${relatedHtml}
      </div>
    </section>
  </main>
  <footer class="page-footer">
    <p><a href="../all-tools.html">All ${count} free tools</a> · <a href="../index.html">${esc(SITE)}</a> · <a href="../donate.html">Donate</a></p>
  </footer>
  <div class="toast" id="toast" role="status"></div>
  <script src="tool-page.js" defer></script>
</body>
</html>
`;
}

function allToolsHtml(cards) {
  const count = cards.length;
  const cats = [...new Set(cards.map((c) => c.category))].sort((a, b) => a.localeCompare(b));
  const byCat = new Map();
  for (const c of cards) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => plainTitle(a.title).localeCompare(plainTitle(b.title)));
  }

  const toc = cats.map((cat) => {
    const n = byCat.get(cat).length;
    return `<a href="#cat-${esc(catSlug(cat))}">${esc(cat)} <span>${n}</span></a>`;
  }).join('\n      ');

  const sections = cats.map((cat) => {
    const list = byCat.get(cat);
    const items = list.map((c) => {
      const t = plainTitle(c.title);
      const d = metaDescription(c.description, t);
      return `<li class="tool-row" data-q="${esc((c.title + ' ' + c.description + ' ' + c.name + ' ' + c.category).toLowerCase())}">
          <a href="tools/${esc(c.name)}.html"><strong>${esc(c.title)}</strong></a>
          <p>${esc(d)}</p>
        </li>`;
    }).join('\n        ');
    return `<section id="cat-${esc(catSlug(cat))}" class="cat-block">
      <h2>${esc(cat)} <span>${list.length}</span></h2>
      <ul>
        ${items}
      </ul>
    </section>`;
  }).join('\n    ');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${count} Free Online Tools`,
    url: `${BASE}/all-tools.html`,
    description: `A crawlable directory of ${count} free browser tools across ${cats.length} categories. No ads, no sign-ups.`,
    isPartOf: { '@type': 'WebSite', name: SITE, url: BASE + '/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: cats.map((cat, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: cat,
        url: `${BASE}/all-tools.html#cat-${catSlug(cat)}`,
      })),
    },
  };

  const desc = `A–Z directory of ${count} free online tools — calculators, converters, generators and utilities. No ads, no sign-up, every tool runs in your browser.`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>All ${count} Free Online Tools | ${esc(SITE)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${BASE}/all-tools.html">
  <link rel="alternate" type="text/plain" href="${BASE}/llms.txt" title="LLM catalogue">
  <link rel="sitemap" type="application/xml" href="${BASE}/sitemap.xml">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(SITE)}">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="All ${count} Free Online Tools | ${esc(SITE)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${BASE}/all-tools.html">
  <meta property="og:image" content="${BASE}/og-tools.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="All ${count} Free Online Tools | ${esc(SITE)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${BASE}/og-tools.png">
  <meta name="theme-color" content="#0a0f14">
  <link rel="icon" href="${ICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>
    :root { --accent:#2dd4ff; --text:#e6faff; --muted:rgba(230,250,255,.7); --bg:#0a0f14; --card:#141e28; --line:rgba(255,255,255,.08); --font:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    * { box-sizing: border-box; }
    html { color-scheme: dark; scroll-behavior: smooth; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font); line-height:1.6; }
    ::selection { background:rgba(45,212,255,.3); color:#fff; }
    :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    header { padding:36px 20px 20px; max-width:1040px; margin:0 auto; }
    .brand { color:var(--accent); text-decoration:none; font-weight:700; font-size:.9rem; }
    h1 { font-size:clamp(1.8rem,4vw,2.6rem); margin:12px 0 8px; letter-spacing:-.03em; }
    .sub { color:var(--muted); max-width:680px; margin:0 0 22px; }
    .search { display:flex; gap:8px; max-width:640px; }
    .search input {
      flex:1; min-height:48px; padding:10px 16px; border-radius:12px;
      border:1px solid rgba(45,212,255,.3); background:rgba(15,23,42,.7); color:#fff; font:inherit;
    }
    .toc { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; }
    .toc a {
      display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:6px 12px;
      border-radius:999px; border:1px solid var(--line); color:var(--text); text-decoration:none; font-size:.82rem; font-weight:600;
      background:rgba(20,30,40,.7);
    }
    .toc a:hover { border-color:var(--accent); color:#fff; }
    .toc span { color:var(--accent); font-variant-numeric:tabular-nums; }
    main { max-width:1040px; margin:0 auto; padding:8px 20px 64px; }
    .cat-block { margin:28px 0; }
    .cat-block h2 { font-size:1.15rem; margin:0 0 10px; padding-top:8px; }
    .cat-block h2 span { color:var(--accent); font-size:.85rem; font-weight:600; }
    ul { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px; }
    .tool-row {
      background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px;
    }
    .tool-row a { color:var(--accent); text-decoration:none; }
    .tool-row a:hover { text-decoration:underline; }
    .tool-row p { margin:4px 0 0; font-size:.82rem; color:var(--muted); }
    .hidden { display:none !important; }
    .status { color:var(--muted); font-size:.9rem; margin:8px 0 0; }
    footer { max-width:1040px; margin:0 auto; padding:0 20px 40px; color:var(--muted); font-size:.85rem; }
    footer a { color:var(--accent); }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="index.html">← ${esc(SITE)}</a>
    <h1>All ${count} free online tools</h1>
    <p class="sub">Every calculator, converter, generator and utility on this site, listed as ordinary HTML so people and search engines can find them. No ads. No accounts. Nothing leaves your browser.</p>
    <form class="search" role="search" action="all-tools.html" method="get">
      <label class="visually-hidden" for="q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search tools</label>
      <input type="search" id="q" name="q" placeholder="Search ${count} tools…" autocomplete="off">
    </form>
    <p class="status" id="status" hidden></p>
    <nav class="toc" aria-label="Categories">
      ${toc}
    </nav>
  </header>
  <main>
    ${sections}
  </main>
  <footer>
    <p><a href="index.html">${esc(SITE)}</a> · <a href="llms.txt">llms.txt</a> · <a href="cards/cards.json">cards.json</a> · <a href="donate.html">Donate</a></p>
  </footer>
  <script>
    (function () {
      var input = document.getElementById('q');
      var rows = Array.prototype.slice.call(document.querySelectorAll('.tool-row'));
      var status = document.getElementById('status');
      var params = new URLSearchParams(location.search);
      function apply(q) {
        q = (q || '').toLowerCase().trim();
        var n = 0;
        rows.forEach(function (row) {
          var hit = !q || (row.getAttribute('data-q') || '').indexOf(q) !== -1;
          row.classList.toggle('hidden', !hit);
          if (hit) n++;
        });
        document.querySelectorAll('.cat-block').forEach(function (sec) {
          var any = sec.querySelector('.tool-row:not(.hidden)');
          sec.classList.toggle('hidden', !any);
        });
        if (status) {
          if (q) { status.hidden = false; status.textContent = n + ' tool' + (n === 1 ? '' : 's') + ' matching “' + q + '”'; }
          else { status.hidden = true; }
        }
      }
      if (params.get('q') && input) { input.value = params.get('q'); apply(params.get('q')); }
      if (input) {
        input.addEventListener('input', function () { apply(input.value); });
        document.querySelector('.search').addEventListener('submit', function (e) {
          e.preventDefault();
          var next = new URL(location.href);
          if (input.value.trim()) next.searchParams.set('q', input.value.trim());
          else next.searchParams.delete('q');
          history.replaceState(null, '', next);
          apply(input.value);
        });
      }
    })();
  </script>
</body>
</html>
`;
}

function llmsTxt(cards) {
  const count = cards.length;
  const cats = [...new Set(cards.map((c) => c.category))].sort((a, b) => a.localeCompare(b));
  const byCat = new Map();
  for (const c of cards) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  let out = '';
  out += `# ${SITE}\n\n`;
  out += `> ${count} free browser tools. No ads, no sign-ups, no uploads. Every tool is a static HTML page that runs entirely in the visitor's browser.\n\n`;
  out += `Live: ${BASE}/\n`;
  out += `Human directory: ${BASE}/all-tools.html\n`;
  out += `JSON catalogue: ${BASE}/cards/cards.json\n`;
  out += `Full tool list: ${BASE}/llms-full.txt\n\n`;
  out += `This is Product A (utility tools). Product B is the MrProphecy music site at ${BASE}/listen.html — do not mix the two.\n\n`;
  out += `## How to use a tool\n\n`;
  out += `Each tool has a stable URL: ${BASE}/tools/<slug>.html\n`;
  out += `Slugs match the \`name\` field in cards.json. Link people (and cite) those URLs, not /tool.html?card=… and not /cards/ fragments.\n\n`;
  out += `## Categories (${cats.length})\n\n`;
  for (const cat of cats) {
    const list = byCat.get(cat);
    out += `- [${cat}](${BASE}/all-tools.html#cat-${catSlug(cat)}): ${list.length} tools\n`;
  }
  out += `\n## Optional\n\n`;
  out += `- [Donate](${BASE}/donate.html): keep the tools free\n`;
  out += `- [Sponsor a tool](${BASE}/sponsor.html)\n`;
  return out;
}

function llmsFullTxt(cards) {
  const sorted = [...cards].sort((a, b) => {
    const c = String(a.category).localeCompare(String(b.category));
    if (c) return c;
    return plainTitle(a.title).localeCompare(plainTitle(b.title));
  });
  let out = `# ${SITE} — full tool catalogue\n\n`;
  out += `${sorted.length} tools. Canonical URL pattern: ${BASE}/tools/<slug>.html\n\n`;
  let last = '';
  for (const c of sorted) {
    if (c.category !== last) {
      out += `## ${c.category}\n\n`;
      last = c.category;
    }
    const t = plainTitle(c.title);
    const d = String(c.description || '').replace(/\s+/g, ' ').trim();
    out += `- [${t}](${BASE}/tools/${c.name}.html): ${d}\n`;
  }
  return out;
}

function toolsIndexHtml(count) {
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tools | ${esc(SITE)}</title>
  <meta name="description" content="Directory of ${count} free online tools.">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${BASE}/all-tools.html">
  <meta http-equiv="refresh" content="0;url=../all-tools.html">
  <meta name="theme-color" content="#0a0f14">
</head>
<body>
  <p>The tool directory lives at <a href="../all-tools.html">all-tools.html</a>.</p>
</body>
</html>
`;
}

function writeSitemap(cards) {
  const prio = {
    'listen.html': ['1.0', 'weekly'],
    'music.html': ['0.9', 'weekly'],
    'index.html': ['0.9', 'daily'],
    'all-tools.html': ['0.9', 'daily'],
    'youtubepromo2.html': ['0.7', 'monthly'],
  };
  const tracked = gitHtmlFiles();
  const staticPages = [];
  for (const f of tracked) {
    if (!f.endsWith('.html')) continue;
    if (f.startsWith('cards/') || f.startsWith('tools/')) continue;
    if (EXCLUDE_SITEMAP.has(f) || EXCLUDE_SITEMAP.has(path.basename(f))) continue;
    staticPages.push(f);
  }
  if (!staticPages.includes('all-tools.html')) staticPages.push('all-tools.html');
  staticPages.sort();

  const urls = [];
  const seen = new Set();
  function add(locPath, priority, freq) {
    const key = locPath.replace(/^\//, '');
    if (seen.has(key)) return;
    seen.add(key);
    urls.push([key, priority, freq]);
  }
  for (const p of Object.keys(prio)) {
    if (staticPages.includes(p) || p === 'all-tools.html') add(p, prio[p][0], prio[p][1]);
  }
  for (const f of staticPages) {
    if (prio[f]) continue;
    add(f, '0.5', 'monthly');
  }
  const toolFiles = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of toolFiles) add(`tools/${c.name}.html`, '0.65', 'monthly');

  const body = urls.map(([u, p, f]) => {
    const loc = `${BASE}/${u.replace(/ /g, '%20')}`;
    return `  <url><loc>${loc}</loc><lastmod>${TODAY}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return urls.length;
}

function main() {
  if (!fs.existsSync(CARDS_JSON)) {
    console.error('FATAL: cards/cards.json missing — run node generate-cards-json.js first');
    process.exit(1);
  }
  const cards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
  if (!Array.isArray(cards) || !cards.length) {
    console.error('FATAL: cards.json is empty');
    process.exit(1);
  }

  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TOOLS_DIR, 'tool-page.css'), TOOL_PAGE_CSS);
  fs.writeFileSync(path.join(TOOLS_DIR, 'tool-page.js'), TOOL_PAGE_JS);
  fs.writeFileSync(path.join(TOOLS_DIR, 'index.html'), toolsIndexHtml(cards.length));

  const keep = new Set(['tool-page.css', 'tool-page.js', 'index.html']);
  let written = 0;
  for (const card of cards) {
    const html = toolPageHtml(card, relatedFor(card, cards), cards.length);
    fs.writeFileSync(path.join(TOOLS_DIR, `${card.name}.html`), html);
    keep.add(`${card.name}.html`);
    written++;
  }
  for (const f of fs.readdirSync(TOOLS_DIR)) {
    if (!keep.has(f)) fs.unlinkSync(path.join(TOOLS_DIR, f));
  }

  fs.writeFileSync(path.join(ROOT, 'all-tools.html'), allToolsHtml(cards));
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), llmsTxt(cards));
  fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), llmsFullTxt(cards));
  fs.writeFileSync(path.join(ROOT, 'ai.txt'), `# AI crawlers\n\nSee ${BASE}/llms.txt for how to cite this site.\nFull catalogue: ${BASE}/llms-full.txt\nJSON: ${BASE}/cards/cards.json\nHuman directory: ${BASE}/all-tools.html\n`);

  const sitemapN = writeSitemap(cards);
  console.log(`discoverability: ${written} tool pages, all-tools.html, llms.txt, sitemap ${sitemapN} URLs`);
}

main();
