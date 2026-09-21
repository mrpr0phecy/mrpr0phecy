#!/usr/bin/env node
/**
 * build-category-pages.js — generate static SEO-rich category pages at /categories/<slug>.html.
 *
 * Reads tools-index.json and creates one static HTML page per category.
 * Each page includes:
 *   - Unique title, meta description, canonical, OG/Twitter tags
 *   - H1 + intro paragraph
 *   - Full crawlable list of tools as real <a> anchor links
 *   - JSON-LD CollectionPage + ItemList + BreadcrumbList
 *   - Breadcrumbs back to homepage
 *   - Clean, lightweight styling matching site design
 *
 * Usage:
 *   node scripts/build-category-pages.js
 *   node scripts/build-category-pages.js --check
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'tools-index.json');
const CATEGORIES_DIR = path.join(ROOT, 'categories');
const SITE = 'https://www.themostusefulsiteintheworld.com';

// The ?v= of the shared list layer. It has one home, CACHE_VERSION in sw.js:
// hard-coding it per generator is how the category pages ended up serving
// explore.css?v=1 after the site had moved to ?v=16 — a returning visitor's
// browser would have paired the new markup with the previous deploy's engine.
const ASSET_VERSION = (() => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const match = sw.match(/CACHE_VERSION\s*=\s*'v(\d+)-/);
  if (!match) throw new Error('sw.js has no CACHE_VERSION = "vN-<date>" — cannot version page assets');
  return match[1];
})();

const CAT_BLURBS = {
  'Home & DIY': 'Precision calculators and guides for paint coverage, tiling area, concrete volume, timber sizing, and electrical wiring. Practical mathematics for home improvement and construction.',
  'Wellbeing & Community': 'Self-guided tools for box breathing, grounding exercises, grief support, mindfulness, and community care. Private, respectful utilities designed for daily mental wellness.',
  'MrProphecy Arcade': 'Interactive web games, rhythm taps, lyric scrambles, beat challenges, and musical puzzles straight from the studio of UK artist MrProphecy.',
  'AI & Autonomous Agents': 'Interactive prompt engineering sandboxes, agent pattern simulators, RAG calculators, and large language model token budgeters. 100% private in-browser AI experimentation.',
  'Astronomy & Space': 'Stargazing tools, telescope magnification calculators, lunar phase calendars, satellite pass predictors, and orbital mechanics simulators for astronomy enthusiasts.',
  'Dogs & Canine Care': 'Nutritional calculators, puppy weight estimators, exercise planners, toxic food checkers, and positive training helpers for responsible dog owners.',
  'Birdwatching & Ornithology': 'Field identification aids, binocular optics calculators, life list tallies, nest box sizing guides, and bird migration trackers for birders of all levels.',
  'Natural Remedies & Herbs': 'Evidence-informed herbal monographs, home remedy references, interaction guides, and preparation formulas with folklore clearly flagged as folklore.',
  'Lucid Dreaming & Sleep': 'Sleep cycle optimization, WBTB alarm calculators, dream journal prompts, reality testing aids, and hypnagogia trackers for better rest and conscious dreaming.',
  'Culinary & Food Science': 'Recipe scaling calculators, yeast converters, candy temperature stages, meat cooking thermometers, and ABV dilution calculators for cooks and bakers.',
  'Interactive Art & Living Worlds': 'Generative algorithmic art, cellular automata, chaotic pendulums, particle sandboxes, and evolving digital ecosystems running live in your browser.',
  'Mind-Blowing Demos': 'Showcase physics engines, fractal explorers, gravitational N-body simulators, optical illusions, and mesmerizing visual science experiments.',
  'Algorithms & Computer Science': 'Regular expression testers, binary bitwise tools, Big-O complexity explorers, hash generators, Base64 encoders, and data structure visualizers.',
  'SaaS & Business Killers': 'The free browser utilities that expensive SaaS subscriptions charge for: PDF utilities, invoice builders, CSV parsers, barcode generators, and favicon makers.',
  'Survival & Emergency Readiness': 'Disaster supply checklists, water purification calculations, emergency rationing planners, and first-principles readiness guides for unexpected situations.',
  'Aquatics & Fishkeeping': 'Aquarium volume calculators, CO2 drop checker charts, heater wattage sizing, stocking compatibility guides, and water parameter trackers for aquarists.',
  'Anime & Otaku Culture': 'Episode binge time calculators, convention budget planners, cosplay prop scalers, filler episode guides, and anime trope references for fans.',
  'Finance & Money': 'Mortgage payment calculators, compound interest visualizers, loan payoff schedules, salary tax estimates, and investment growth projectors tested against current standards.',
  'Science & Engineering': 'Unit converters, beam stress calculators, fluid dynamics simulators, thermodynamics solvers, and chemistry dilution tools that show their step-by-step working.',
  'Mathematics': 'Calculus solvers, linear algebra tools, probability trees, statistics engines, geometry calculators, and graphing tools that explain every step clearly.',
  'Music & Audio': 'Instrument tuners, metronomes, BPM counters, chord progression builders, scale trainers, frequency generators, and audio engineering calculators.',
  'Health & Fitness': 'BMI calculators, body fat estimation, BMR & TDEE calculators, one-rep max trackers, and workout pace planners: screening and planning utilities, not diagnosis.',
  'Sports': 'Scorekeepers, bracket generators, fantasy sports calculators, referee criteria guides, decathlon point tallies, and sports analytics tools.',
  'Writing & Language': 'Word counters, character limit checkers, readability score analyzers, grammar trainers, pinyin converters, and distraction-free writing environments.',
  'Productivity & Lifestyle': 'Secure password generators, study timers, unit pricing comparators, time zone converters, and daily decision matrixes to streamline your life.',
  'Virtual Worlds & Gaming': 'Dice rollers, character stat sheets, procedural dungeon generators, virtual world coordinate converters, and retro gaming utilities.',
  'Museum & Collection': 'Collection inventory organizers, coin and stamp grade guides, artifact scale calculators, and archival reference tools for collectors.',
  'Trucking & Freight': 'Hours-of-service clocks, axle-weight and bridge-formula checks, tyre load and pressure, load plans, stopping distances, grade descent, cost per mile, load-offer maths, pre-trip walkarounds and roadside breakdown triage. Written for drivers on both sides of the Atlantic — every tool carries US and EU/UK units, limits and rule references.',
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCategoryPage(cat, allCategories, tools, totalSiteTools) {
  const catTools = tools.filter(t => t.category === cat.slug || t.categoryName === cat.name);
  const blurb = CAT_BLURBS[cat.name] || 'Explore our collection of free, high-speed browser tools. No ads, no registrations, no server latency.';
  const pageTitle = `${catTools.length} Free ${cat.name} Tools — The Most Useful Site in the World`;
  const metaDesc = `Explore ${catTools.length} free ${cat.name} tools, calculators, generators and simulators. 100% private in-browser computation with no sign-ups or ads.`;
  const canonical = `${SITE}/categories/${cat.slug}.html`;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${cat.name} Tools`,
    'url': canonical,
    'description': metaDesc,
    'isPartOf': {
      '@type': 'WebSite',
      'name': 'The Most Useful Site in the World',
      'url': `${SITE}/`
    },
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': catTools.length,
      'itemListElement': catTools.map((t, idx) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'name': t.title,
        'url': `${SITE}/${t.url}`,
        'description': t.description
      }))
    }
  };

  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'Home',
        'item': `${SITE}/`
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': 'Categories',
        'item': `${SITE}/#categories`
      },
      {
        '@type': 'ListItem',
        'position': 3,
        'name': cat.name,
        'item': canonical
      }
    ]
  };

  // Same row component as tools.html and the home page's catalogue list: one
  // toolbar, one keyboard map, one ＋ button behaviour across the whole site.
  const toolRowsHtml = catTools.map(t => `        <li class="xp-row" data-slug="${esc(t.slug)}">
          <a class="xp-open" href="../${esc(t.url)}">
            <span class="xp-title">${esc(t.title)}</span>
          </a>
          <p class="xp-desc">${esc(t.description)}</p>
        </li>`).join('\n');

  const otherCategoriesHtml = allCategories
    .filter(c => c.slug !== cat.slug)
    .slice(0, 8)
    .map(c => `      <a class="cat-pill" href="${esc(c.slug)}.html">
        <span class="cat-pill-icon">${c.icon}</span>
        <span class="cat-pill-name">${esc(c.name)}</span>
        <span class="cat-pill-count">${c.count}</span>
      </a>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffd400'/%3E%3Cstop offset='1' stop-color='%23ff9500'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3C/svg%3E">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="The Most Useful Site in the World">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/og-tools.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${SITE}/og-tools.png">
  <meta name="theme-color" content="#0a0f14">
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbList)}</script>
  <style>
    :root {
      --bg-primary: #0a0f14;
      --bg-secondary: #141e28;
      --bg-card: rgba(20, 30, 40, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(45, 212, 255, 0.4);
      --accent: #2dd4ff;
      --accent-glow: rgba(45, 212, 255, 0.15);
      --text: #e6faff;
      --text-muted: rgba(230, 250, 255, 0.7);
      --gold: #ffd700;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
    body {
      background: var(--bg-primary);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 clamp(12px, 3.4vw, 20px); width: 100%; }
    kbd {
      padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.82em; background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border); border-radius: 4px;
    }
    /* ---------------------------------------------------------------- top bar
       One compact row at every width. Before this pass there were no media
       queries in this stylesheet at all: at 390 px the wordmark wrapped onto
       four lines and the topbar was 137 px tall, which then sat on top of the
       list toolbar parked at a hard-coded 72 px. */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      padding: clamp(8px, 1.7vw, 14px) 0;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
      -webkit-backdrop-filter: blur(16px) saturate(140%);
      backdrop-filter: blur(16px) saturate(140%);
    }
    .topbar-content { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .brand {
      display: flex; align-items: center; gap: 8px; min-width: 0;
      font-weight: 800; font-size: clamp(0.92rem, 2.6vw, 1.05rem);
      letter-spacing: -0.01em; color: var(--text);
    }
    .brand:hover { color: var(--accent); }
    .brand-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-links { display: flex; align-items: center; gap: clamp(8px, 2vw, 14px); flex: none; }
    .nav-link { font-size: clamp(0.78rem, 2.2vw, 0.88rem); font-weight: 600; color: var(--text-muted); }
    .nav-link:hover { color: var(--text); }
    .nav-link.back {
      display: inline-flex; align-items: center; min-height: 38px;
      padding: 6px clamp(9px, 2vw, 12px);
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
      white-space: nowrap;
    }
    .nav-link.back:hover { border-color: var(--accent); color: var(--accent); }
    /* Breadcrumbs scroll rather than wrap on a narrow screen. */
    .breadcrumbs {
      display: flex; align-items: center; gap: 8px;
      padding: 16px 0 0; font-size: 0.82rem; color: var(--text-muted);
      white-space: nowrap; overflow-x: auto; scrollbar-width: none;
    }
    .breadcrumbs::-webkit-scrollbar { display: none; }
    .breadcrumbs a:hover { color: var(--accent); text-decoration: underline; }
    .breadcrumbs span.sep { opacity: 0.4; }
    /* ------------------------------------------------------------------ hero */
    .hero {
      padding: clamp(20px, 4.4vw, 36px) 0 clamp(18px, 3.6vw, 32px);
      background: radial-gradient(ellipse 60% 50% at 50% 0%, var(--accent-glow), transparent 70%);
    }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; margin-bottom: 12px;
      font-size: clamp(0.72rem, 2.2vw, 0.8rem); font-weight: 700;
      color: var(--accent); background: rgba(45, 212, 255, 0.08);
      border: 1px solid rgba(45, 212, 255, 0.25); border-radius: 999px;
    }
    h1 {
      font-size: clamp(1.55rem, 5.4vw, 2.7rem);
      font-weight: 900; letter-spacing: -0.02em; line-height: 1.15;
      margin-bottom: 12px; color: #ffffff; text-wrap: balance;
    }
    .hero-lede {
      max-width: 70ch; margin-bottom: 16px;
      font-size: clamp(0.95rem, 2.4vw, 1.06rem); line-height: 1.7;
      color: var(--text-muted); text-wrap: pretty;
    }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .search-hint {
      display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
      padding: 9px 15px; font-size: clamp(0.8rem, 2.2vw, 0.88rem); font-weight: 600;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
    }
    .search-hint:hover { border-color: var(--accent); color: var(--accent); }
    /* --------------------------------------------------------------- section */
    .section-title {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      margin-bottom: 14px; font-size: clamp(1.1rem, 3vw, 1.3rem); font-weight: 800;
      text-wrap: balance;
    }
    .list-note { margin-bottom: 14px; font-size: clamp(0.8rem, 2.2vw, 0.9rem); color: var(--text-muted); }
    /* The list toolbar parks under the page's own sticky chrome. The height of
       that chrome is measured by explore.js (--xp-sticky-h), not guessed here —
       this rule used to say 'top: 72px', which put the toolbar *underneath* the
       137 px topbar on a phone. */
    .xp-bar { --xp-toolbar-top: 8px; }
    /* ------------------------------------------------------ other categories */
    .other-cats { margin: clamp(26px, 5vw, 44px) 0 clamp(28px, 5vw, 50px); }
    .cat-pills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(clamp(150px, 42vw, 220px), 1fr));
      gap: 10px;
    }
    .cat-pill {
      display: flex; align-items: center; gap: 10px; min-height: 58px;
      padding: 12px 14px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 12px;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .cat-pill:hover {
      transform: translateY(-2px); border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
    }
    .cat-pill-icon { font-size: 1.25rem; line-height: 1; }
    .cat-pill-name { flex: 1; min-width: 0; font-size: 0.92rem; font-weight: 700; overflow-wrap: anywhere; }
    .cat-pill-count {
      flex: none; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;
      color: var(--accent); background: rgba(45, 212, 255, 0.1); border-radius: 999px;
    }
    /* ---------------------------------------------------------------- footer */
    footer {
      margin-top: auto; padding: clamp(18px, 3vw, 28px) 0;
      border-top: 1px solid var(--border);
      font-size: 0.78rem; color: var(--text-muted);
    }
    footer a { color: var(--text-muted); }
    footer a:hover { color: var(--accent); }
    footer p { margin-bottom: 8px; }
    /* ------------------------------------------------------------ responsive */
    @media (max-width: 760px) {
      .brand-text { display: none; }
      .nav-links { gap: 10px; }
    }
    @media (max-width: 560px) {
      .hero-actions .search-hint { width: 100%; }
      .section-title { font-size: 1.05rem; }
    }
    @media (hover: none) and (pointer: coarse) {
      /* The topbar is the only navigation on this page and it is sticky: give
         the wordmark and the three links finger-sized targets. */
      .brand, .nav-link { min-height: 40px; display: inline-flex; align-items: center; }

      .nav-link.back { min-height: 44px; }
      .search-hint { min-height: 48px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .cat-pill, .search-hint { transition: none; }
    }
  </style>
  <link rel="stylesheet" href="../explore.css?v=${ASSET_VERSION}">
  <script defer src="../toolbox.js?v=${ASSET_VERSION}"></script>
  <script defer src="../explore.js?v=${ASSET_VERSION}"></script>
</head>
<body>

  <header class="topbar">
    <div class="container topbar-content">
      <a href="../index.html" class="brand" aria-label="The Most Useful Site in the World — home">
        <span class="brand-mark">🛠️</span>
        <span class="brand-text">The Most Useful Site in the World</span>
      </a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a href="../index.html" class="nav-link back">← All ${totalSiteTools} Tools</a>
        <a href="../tools-index.html" class="nav-link">Directory</a>
        <a href="../about.html" class="nav-link">About</a>
      </nav>
    </div>
  </header>

  <main class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumbs">
      <a href="../index.html">Home</a>
      <span class="sep">/</span>
      <a href="../tools-index.html">Categories</a>
      <span class="sep">/</span>
      <span aria-current="page">${esc(cat.name)}</span>
    </nav>

    <section class="hero">
      <div class="badge">${cat.icon} ${esc(cat.name)} · ${catTools.length} Free Tools</div>
      <h1>${cat.icon} ${esc(cat.name)} Tools</h1>
      <p class="hero-lede">${esc(blurb)}</p>
      <div class="hero-actions">
        <a href="../index.html?cat=${encodeURIComponent(cat.slug)}" class="search-hint">
          <span>🔍</span>
          <span>Search & filter ${catTools.length} ${esc(cat.name)} tools on interactive homepage</span>
        </a>
      </div>
    </section>

    <section aria-labelledby="tools-heading">
      <div class="section-title">
        <span id="tools-heading">All ${catTools.length} ${esc(cat.name)} Calculators &amp; Utilities</span>
      </div>
      <p class="list-note">
        Filter the ${catTools.length} tools below, sort them, expand a row for the full description, or keep one
        in your toolbox with the ＋. Press <kbd>/</kbd> to jump to the filter.
      </p>

      <!-- One sponsorship position on this page, and only one. Unsold: a paid
           placement replaces this block and carries the "Sponsored" label. -->
      <div class="xp-sponsor" role="note">
        <span><b>Sponsorship · one slot on this page</b>
        Sponsors are always labelled, and a sponsor's own placement carries no tracking scripts, never takes more than 5% of the page and never changes what a tool does. Ask for the real traffic numbers before you buy.</span>
        <a href="../sponsor.html">Sponsor this category →</a>
      </div>

      <div data-explore="static" id="explore" data-cat-name="${esc(cat.name)}">
        <ul class="xp-list">
${toolRowsHtml}
        </ul>
      </div>

      <p class="list-note" style="margin-top:16px;">
        Looking for something else? <a href="../tools.html" style="color:var(--accent);">Filter all ${totalSiteTools} tools →</a>
      </p>
    </section>

    <section class="other-cats">
      <h2 style="font-size:1.15rem;margin-bottom:12px;">Explore Other Tool Categories</h2>
      <div class="cat-pills-grid">
${otherCategoriesHtml}
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p><a href="../index.html">All ${totalSiteTools} tools</a> · <a href="../about.html">About</a> · <a href="../press.html">Press</a> · <a href="../tools.html">Index</a> · <a href="../popular.html">Popular</a> · <a href="../new.html">New</a> · <a href="../use-case.html">Use case</a> · <a href="../help.html">Help</a> · <a href="../changelog.html">Changelog</a> · <a href="../embed.html">Embed</a> · <a href="../sitemap.html">Sitemap</a> · <a href="../blog/">Blog</a> · <a href="../donate.html">Donate</a> · <a href="../sponsor.html">Sponsor</a> · <a href="../listen.html">Music</a></p>
      <p style="font-size:0.78rem;opacity:0.7;">Free client-side browser tools. No tracking, no paywalls, no login required.</p>
    </div>
  </footer>

</body>
</html>
`;
}

function main() {
  const isCheck = process.argv.includes('--check');
  if (!fs.existsSync(INDEX_JSON)) {
    console.error('FAIL: tools-index.json missing — run node scripts/build-tools-index.js first');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
  const categories = data.categories;
  const tools = data.tools;
  const totalSiteTools = data.count;

  if (!fs.existsSync(CATEGORIES_DIR)) {
    fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
  }

  let drifted = 0;
  let written = 0;

  for (const cat of categories) {
    const html = renderCategoryPage(cat, categories, tools, totalSiteTools);
    const target = path.join(CATEGORIES_DIR, `${cat.slug}.html`);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    if (current === html) continue;

    if (isCheck) {
      drifted++;
      console.error(`  drift: categories/${cat.slug}.html`);
      continue;
    }

    fs.writeFileSync(target, html, 'utf8');
    written++;
  }

  if (isCheck) {
    if (drifted > 0) {
      console.error(`FAIL: ${drifted} category pages out of date — run: node scripts/build-category-pages.js`);
      process.exit(1);
    }
    console.log(`category pages OK (${categories.length} pages match tools-index.json)`);
    return;
  }

  console.log(`✔ Category pages: ${written} written (${categories.length} total categories) in categories/`);
}

main();
