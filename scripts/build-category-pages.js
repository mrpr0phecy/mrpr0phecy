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

  const toolCardsHtml = catTools.map(t => {
    const tagsHtml = (t.tags || []).slice(0, 3).map(tag => `<span class="tag">#${esc(tag)}</span>`).join('');
    return `      <a class="tool-card" href="../${esc(t.url)}" title="${esc(t.title)}">
        <div class="tool-card-head">
          <h2 class="tool-card-title">${esc(t.title)}</h2>
        </div>
        <p class="tool-card-desc">${esc(t.description)}</p>
        <div class="tool-card-meta">
          <div class="tags">${tagsHtml}</div>
          <span class="open-btn">Open Tool →</span>
        </div>
      </a>`;
  }).join('\n');

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
    body {
      background: var(--bg-primary);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    a { color: inherit; text-decoration: none; }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
      width: 100%;
    }
    /* Top Bar */
    .topbar {
      border-bottom: 1px solid var(--border);
      background: rgba(10, 15, 20, 0.95);
      backdrop-filter: blur(16px);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 14px 0;
    }
    .topbar-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .brand:hover { color: var(--accent); }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .nav-link {
      color: var(--text-muted);
      font-size: 0.88rem;
      font-weight: 600;
      transition: color 0.2s;
    }
    .nav-link:hover { color: var(--text); }
    .nav-link.back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 8px;
    }
    .nav-link.back:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    /* Breadcrumbs */
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      color: var(--text-muted);
      padding: 18px 0 0;
    }
    .breadcrumbs a:hover { color: var(--accent); text-decoration: underline; }
    .breadcrumbs span.sep { opacity: 0.4; }
    /* Hero */
    .hero {
      padding: 36px 0 32px;
      background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45, 212, 255, 0.08), transparent 70%);
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      border: 1px solid rgba(45, 212, 255, 0.35);
      background: rgba(45, 212, 255, 0.08);
      padding: 4px 12px;
      border-radius: 100px;
      margin-bottom: 14px;
    }
    .hero h1 {
      font-size: clamp(2rem, 4.5vw, 2.8rem);
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.2;
      margin-bottom: 14px;
      color: #ffffff;
    }
    .hero-lede {
      font-size: 1.08rem;
      color: rgba(230, 250, 255, 0.85);
      max-width: 820px;
      line-height: 1.7;
      margin-bottom: 20px;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .search-hint {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
    /* Grid of Tools */
    .section-title {
      font-size: 1.3rem;
      font-weight: 800;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 50px;
    }
    .tool-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease;
      position: relative;
    }
    .tool-card:hover {
      border-color: var(--accent);
      background: rgba(20, 30, 40, 0.95);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px var(--accent-glow);
    }
    .tool-card-head {
      margin-bottom: 8px;
    }
    .tool-card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.35;
    }
    .tool-card-desc {
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.55;
      margin-bottom: 16px;
      flex-grow: 1;
    }
    .tool-card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 12px;
      font-size: 0.78rem;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      color: rgba(45, 212, 255, 0.8);
      font-size: 0.75rem;
    }
    .open-btn {
      color: var(--accent);
      font-weight: 700;
      white-space: nowrap;
    }
    /* Explore Other Categories */
    .other-cats {
      border-top: 1px solid var(--border);
      padding: 40px 0;
      margin-top: 20px;
    }
    .cat-pills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .cat-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.88rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .cat-pill:hover {
      border-color: var(--accent);
      background: rgba(45, 212, 255, 0.06);
      transform: translateY(-1px);
    }
    .cat-pill-icon { font-size: 1.1rem; }
    .cat-pill-name { flex-grow: 1; color: var(--text); }
    .cat-pill-count {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.07);
      padding: 2px 7px;
      border-radius: 100px;
      color: var(--text-muted);
    }
    /* Footer */
    footer {
      border-top: 1px solid var(--border);
      padding: 36px 0;
      margin-top: auto;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    footer a { margin: 0 8px; color: var(--text-muted); }
    footer a:hover { color: var(--accent); }
    footer p { margin-bottom: 8px; }
  </style>
</head>
<body>

  <header class="topbar">
    <div class="container topbar-content">
      <a href="../index.html" class="brand">
        <span>🛠️</span>
        <span>The Most Useful Site in the World</span>
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
      <div class="tools-grid">
${toolCardsHtml}
      </div>
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
      <p><a href="../index.html">All ${totalSiteTools} tools</a>·<a href="../about.html">About</a>·<a href="../press.html">Press</a>·<a href="../tools.html">Index</a>·<a href="../popular.html">Popular</a>·<a href="../new.html">New</a>·<a href="../use-case.html">Use case</a>·<a href="../help.html">Help</a>·<a href="../changelog.html">Changelog</a>·<a href="../embed.html">Embed</a>·<a href="../sitemap.html">Sitemap</a>·<a href="../blog/">Blog</a>·<a href="../donate.html">Donate</a>·<a href="../sponsor.html">Sponsor</a>·<a href="../listen.html">Music</a></p>
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
