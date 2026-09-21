#!/usr/bin/env node
/**
 * generate-ai-index.js — build the machine-readable surface of the site.
 *
 * Reads cards/cards.json and (re)generates:
 *   1. llms.txt        — concise AI-agent entry point (standard /llms.txt shape)
 *   2. llms-full.txt   — the full catalogue: every tool, one line each
 *   3. tools-index.html — static zero-JS directory for humans, crawlers,
 *                        screen readers and anyone with JavaScript off
 *
 * Run it whenever the tool catalogue changes (after generate-cards-json.js):
 *   node scripts/generate-ai-index.js
 *
 * No dependencies. Deterministic output (sorted, stable category order).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://www.themostusefulsiteintheworld.com';
const CARDS_JSON = path.join(ROOT, 'cards', 'cards.json');
// The deep tool pages are a curated, hand-written list with their own paths;
// llms.txt must name the URLs that actually exist (one of them,
// tools/compound-interest.html, does not match its card slug).
const TOOL_PAGES_JSON = path.join(ROOT, 'scripts', 'tool-pages.json');

function deepToolPages() {
  try {
    const tp = JSON.parse(fs.readFileSync(TOOL_PAGES_JSON, 'utf8'));
    const pages = (tp && Array.isArray(tp.pages) ? tp.pages : [])
      .filter(p => p && p.path && p.slug)
      .map(p => ({ slug: p.slug, url: p.path }));
    pages.sort((a, b) => a.slug.localeCompare(b.slug));
    return pages;
  } catch {
    return [];
  }
}

// Canonical category order + emoji, mirroring the pill bar in index.html.
// Unknown categories (new ones not yet on the pill bar) are appended A–Z.
const CATEGORY_ORDER = [
  ['Home & DIY', '🔨'],
  ['Wellbeing & Community', '🩺'],
  ['MrProphecy Arcade', '🕹'],
  ['AI & Autonomous Agents', '🤖'],
  ['Astronomy & Space', '🔭'],
  ['Dogs & Canine Care', '🐕'],
  ['Birdwatching & Ornithology', '🦅'],
  ['Natural Remedies & Herbs', '🌿'],
  ['Lucid Dreaming & Sleep', '🌙'],
  ['Culinary & Food Science', '🍳'],
  ['Interactive Art & Living Worlds', '🎨'],
  ['Mind-Blowing Demos', '🤯'],
  ['Algorithms & Computer Science', '🖥️'],
  ['SaaS & Business Killers', '💼'],
  ['Survival & Emergency Readiness', '🆘'],
  ['Aquatics & Fishkeeping', '🌊'],
  ['Anime & Otaku Culture', '🎌'],
  ['Finance & Money', '💰'],
  ['Science & Engineering', '🔬'],
  ['Mathematics', '📐'],
  ['Music & Audio', '🎵'],
  ['Health & Fitness', '💪'],
  ['Sports', '🏅'],
  ['Writing & Language', '✍️'],
  ['Productivity & Lifestyle', '⚡'],
  ['Virtual Worlds & Gaming', '🎮'],
  ['Museum & Collection', '🏛️'],
  ['Trucking & Freight', '🚚'],
];

// One-line hub descriptions for tools-index.html sections. Plain, honest,
// no counts (those render dynamically). Reviewed 2026-09-15.
const CAT_BLURB = {
  'Home & DIY': 'Paint, tiling, concrete, timber and wiring maths for real projects.',
  'Wellbeing & Community': 'Breathing, grounding, grief support and everyday kindness tools.',
  'MrProphecy Arcade': 'Rhythm taps, lyric scrambles and beat games from the music side.',
  'AI & Autonomous Agents': 'Prompt builders, simulators and agent-pattern playgrounds.',
  'Astronomy & Space': 'Star charts, lunar phases, telescope maths and orbital toys.',
  'Dogs & Canine Care': 'Feeding, training and health planners for good dogs.',
  'Birdwatching & Ornithology': 'Identification helpers, logs and migration trackers.',
  'Natural Remedies & Herbs': 'Herb references and remedy notes, with folklore flagged as folklore.',
  'Lucid Dreaming & Sleep': 'Dream journals, reality checks and sleep-cycle planners.',
  'Culinary & Food Science': 'Scaling, timings, temperatures and ABV maths for cooks.',
  'Interactive Art & Living Worlds': 'Generative toys, ecosystems and things that grow on screen.',
  'Mind-Blowing Demos': 'The showpieces: physics, fractals and beautiful machinery.',
  'Algorithms & Computer Science': 'Regex, JSON, encodings, hashes and CS visualisers.',
  'SaaS & Business Killers': 'The tools subscriptions charge for: invoices, CSVs, favicons, mockups.',
  'Survival & Emergency Readiness': 'Checklists, pack planners and first-principles readiness.',
  'Trucking & Freight': 'Hours-of-service clocks, axle weights, tyre loads, load plans, stopping distances, grade descent, cost per mile and roadside triage for drivers.',
  'Aquatics & Fishkeeping': 'Tank volumes, CO2, dosing and water-parameter maths.',
  'Anime & Otaku Culture': 'Trackers, quizzes and collection tools for fans.',
  'Finance & Money': 'Tax, mortgages, loans and investing, tested against the statute every April.',
  'Science & Engineering': 'Unit converters, calculators and references that show their working.',
  'Mathematics': 'Step-by-step solvers, plotters and number toys.',
  'Music & Audio': 'Tuners, tempo tools, theory trainers and mix helpers.',
  'Health & Fitness': 'BMI, body composition, pace and training planners: screening, not diagnosis.',
  'Sports': 'Scores, fixtures, fantasy helpers and pub-quiz ammunition.',
  'Writing & Language': 'Outlines, translators, counters and Japanese study aids.',
  'Productivity & Lifestyle': 'Passwords, timers, comparators and everyday decision tools.',
  'Virtual Worlds & Gaming': 'Simulators, board games and tiny worlds to get lost in.',
  'Museum & Collection': 'Catalogue and curate anything you collect.',
};

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slugCat = c => c.toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

function main() {
  const CHECK = process.argv[2] === '--check';
  const cards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
  if (!Array.isArray(cards) || cards.length === 0) {
    console.error('cards/cards.json missing or empty — run generate-cards-json.js first.');
    process.exit(1);
  }

  // Group by category in canonical order
  const byCat = new Map(CATEGORY_ORDER.map(([name]) => [name, []]));
  const extraCats = [];
  for (const c of cards) {
    const cat = c.category || 'Productivity & Lifestyle';
    if (!byCat.has(cat)) { byCat.set(cat, []); extraCats.push(cat); }
    byCat.get(cat).push(c);
  }
  extraCats.sort((a, b) => a.localeCompare(b));
  const ordered = [...CATEGORY_ORDER.map(([name]) => name), ...extraCats]
    .filter(n => byCat.get(n) && byCat.get(n).length > 0);
  const emojiFor = cat =>
    (CATEGORY_ORDER.find(([name]) => name === cat) || [, '📁'])[1];

  const total = cards.length;
  const catLines = ordered.map(cat =>
    `- [${emojiFor(cat)} ${cat}](${SITE}/tools-index.html#${slugCat(cat)}): ` +
    `${byCat.get(cat).length} tools`
  );

  // ---------- 1. llms.txt ----------
  const deepPages = deepToolPages();
  const deepPagesLines = deepPages.length
    ? deepPages.map(p => `  ${SITE}/${p.url} (card slug: ${p.slug})`).join('\n')
    : `  (none declared in scripts/tool-pages.json)`;
  const llms = `# The Most Useful Site in the World

> ${total} free, self-contained browser tools — calculators, converters,
> generators and simulators across ${ordered.length} categories. Every tool
> runs 100% client-side: no accounts, no keys, no tracking, no build step.
> Made for humans, and deliberately easy for AI agents to navigate.

## How to use this site as an AI agent

- Full machine-readable manifest (JSON, one object per tool):
  ${SITE}/cards/cards.json — fields: name, title, description, category, file, path
- Structured per-tool specs (inputs/outputs/formula/sources) — the cheapest way to call a tool like a function:
  ${SITE}/api/tools.json (manifest) and
  ${SITE}/api/tools/<slug>.json (one file per tool, ${total} total; e.g. api/tools/bmi.json)
- MCP (Model Context Protocol) server descriptor for compliant clients:
  ${SITE}/.well-known/mcp.json
- Sitemap (all tool URLs + category pages + guides, rebuilt on each deploy): ${SITE}/sitemap.xml
- This file: ${SITE}/llms.txt (concise index) and ${SITE}/llms-full.txt (every tool listed)
- Static, zero-JS HTML directory of all tools: ${SITE}/tools-index.html
- Programmatic-use guide for agents and developers: ${SITE}/agents.html
- Lantern — a standalone browser AI, deliberately separate from this catalogue (chat grounded in
  your own documents, memory that adapts to your ratings, real local tools, lessons, and an optional
  on-device model): ${SITE}/ai.html
- Any tool, focused standalone page: ${SITE}/tool.html?card=<tool-slug>
- Deep tool pages (SEO-grade, 300+ words, methodology, worked example, disclaimer) for the most-searched
  tools — an explicit list, because the path is not always \`tools/<card-slug>.html\`:
${deepPagesLines}
- Search the catalogue: ${SITE}/index.html?q=<query>
- Open the homepage with one tool already expanded inline:
  ${SITE}/index.html?expand=<tool-slug>
- Browse one category on the homepage (<slug> is the label slugged:
  "Music & Audio" -> music-audio): ${SITE}/index.html?cat=<category-slug>
- Zero-result searches and tool popularity are instrumented (privacy-preserving, capped localStorage +
  GA4 \`search_zero\`/\`tool_view\` events); export via \`__mpInstrumentation.export()\` in console. See docs/INSTRUMENTATION.md.

## Picking a tool for a small calculation

1. Fetch ${SITE}/cards/cards.json.
2. Match the user's need against category / title / description.
3. Give or open ${SITE}/tool.html?card=<name> — the tool is interactive and
   private (nothing leaves the browser). Tools that need no interaction from
   you can simply be linked; everything is a plain GET, no auth, CORS-open.

## Embedding

Any tool can be embedded: <iframe src="${SITE}/tool.html?card=<slug>&embed=1"
width="100%" height="520"></iframe> — embed=1 strips page chrome and
auto-reports its height via postMessage.

## Categories (${ordered.length})

${catLines.join('\n')}

## Full catalogue

See llms-full.txt: ${SITE}/llms-full.txt — every tool with its URL and a
one-line description, grouped by category.
`;

  // ---------- 2. llms-full.txt ----------
  const sections = ordered.map(cat => {
    const lines = byCat.get(cat).map(c => {
      const url = `${SITE}/tool.html?card=${encodeURIComponent(c.name)}`;
      const desc = (c.description || 'Free browser tool.').replace(/\s+/g, ' ').trim();
      return `- [${c.title || c.name}](${url}): ${desc}`;
    });
    return `## ${emojiFor(cat)} ${cat} (${byCat.get(cat).length} tools)\n\n${lines.join('\n')}`;
  });
  const llmsFull = `# The Most Useful Site in the World — full tool catalogue

> ${total} free browser tools, all client-side, no sign-ups. Start index:
> ${SITE}/llms.txt · manifest: ${SITE}/cards/cards.json · homepage: ${SITE}/
> Tool URL pattern: ${SITE}/tool.html?card=<tool-slug>

${sections.join('\n\n')}
`;

  // ---------- 3. tools-index.html (static, zero JS) ----------
  const today = new Date().toISOString().slice(0, 10);
  const navLinks = ordered.map(cat =>
    `      <a href="#${slugCat(cat)}">${emojiFor(cat)} ${esc(cat)} <span>${byCat.get(cat).length}</span></a>`
  ).join('\n');
  const sectionsHtml = ordered.map(cat => {
    const items = byCat.get(cat).map(c => {
      const url = `tool.html?card=${encodeURIComponent(c.name)}`;
      return `        <li>
          <a href="${url}">${esc(c.title || c.name)}</a>
          <span>${esc((c.description || 'Free browser tool.').replace(/\s+/g, ' ').trim())}</span>
        </li>`;
    }).join('\n');
    // One honest line per category: turns the directory from a link farm
    // into 27 genuinely useful hub sections (P1-R3). Counts stay dynamic.
    const blurb = CAT_BLURB[cat] || 'Free browser tools. No sign-up, no ads.';
    return `    <section class="cat" id="${slugCat(cat)}">
      <h2>${emojiFor(cat)} ${esc(cat)} <span class="count">${byCat.get(cat).length} tools</span></h2>
      <p class="cat-blurb">${esc(blurb)}</p>
      <ul>
${items}
      </ul>
    </section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>All ${total} Tools — Plain Directory | The Most Useful Site in the World</title>
  <meta name="description" content="Complete plain-HTML directory of all ${total} free browser tools on The Most Useful Site in the World. Works without JavaScript. Every tool opens in one click.">
  <link rel="canonical" href="${SITE}/tools-index.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="The Most Useful Site in the World">
  <meta property="og:title" content="All ${total} Tools — Plain Directory">
  <meta property="og:description" content="Zero-JavaScript directory of every free browser tool. Works for humans, crawlers, screen readers and AI agents.">
  <meta property="og:url" content="${SITE}/tools-index.html">
  <meta property="og:image" content="${SITE}/og-tools.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="All ${total} Tools — Plain Directory">
  <meta name="twitter:description" content="Zero-JavaScript directory of every free browser tool.">
  <meta name="twitter:image" content="${SITE}/og-tools.png">
  <meta name="theme-color" content="#0a0f14">
  <script type="application/ld+json">{"@context": "https://schema.org", "@type": "CollectionPage", "name": "All ${total} Tools — Plain Directory", "url": "${SITE}/tools-index.html", "description": "Static zero-JavaScript directory of ${total} free browser tools across ${ordered.length} categories.", "isPartOf": {"@type": "WebSite", "name": "The Most Useful Site in the World", "url": "${SITE}/"}, "inLanguage": "en-GB"}</script>
  <style>
    :root { color-scheme: dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0f14; color: #e6faff; line-height: 1.6; padding: 24px 16px 60px;
    }
    main { max-width: 860px; margin: 0 auto; }
    h1 { font-size: clamp(1.5rem, 4vw, 2.2rem); letter-spacing: -0.02em; }
    h1 span { color: #2dd4ff; }
    .sub { color: rgba(230, 250, 255, 0.7); font-size: 0.9rem; margin: 8px 0 4px; }
    .metaline { font-size: 0.78rem; color: rgba(230, 250, 255, 0.55); margin-bottom: 20px; }
    .metaline a, .back a, .ai-note a { color: #2dd4ff; }
    nav.toc {
      display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 26px;
    }
    nav.toc a {
      font-size: 0.8rem; text-decoration: none; color: #e6faff;
      border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 999px; padding: 5px 11px;
    }
    nav.toc a span { color: rgba(230, 250, 255, 0.55); margin-left: 4px; font-size: 0.72rem; }
    nav.toc a:hover { border-color: #2dd4ff; color: #2dd4ff; }
    section.cat { margin-bottom: 30px; scroll-margin-top: 16px; }
    h2 { font-size: 1.05rem; margin-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 8px; }
    h2 .count { font-size: 0.72rem; font-weight: 600; color: #2dd4ff; background: rgba(45, 212, 255, 0.1); border: 1px solid rgba(45, 212, 255, 0.25); padding: 2px 9px; border-radius: 999px; vertical-align: middle; margin-left: 8px; }
    p.cat-blurb { font-size: 0.85rem; color: rgba(230, 250, 255, 0.65); margin: 0 0 10px; }
    ul { list-style: none; }
    li { padding: 9px 0 9px 2px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    li a { color: #fff; font-weight: 600; font-size: 0.92rem; text-decoration: none; }
    li a:hover { color: #2dd4ff; }
    li a::after { content: " ↗"; color: rgba(45, 212, 255, 0.6); font-size: 0.8em; }
    li span { display: block; color: rgba(230, 250, 255, 0.6); font-size: 0.8rem; margin-top: 2px; }
    .ai-note {
      margin-top: 34px; border: 1px dashed rgba(45, 212, 255, 0.35); border-radius: 12px;
      padding: 14px 16px; font-size: 0.82rem; color: rgba(230, 250, 255, 0.75);
    }
    .back { margin-top: 22px; font-size: 0.85rem; }
    footer { margin-top: 30px; font-size: 0.75rem; color: rgba(230, 250, 255, 0.45); }
  </style>
</head>
<body>
  <main>
    <h1>Every tool, <span>plain and simple</span></h1>
    <p class="sub">The complete directory of all <strong>${total}</strong> free tools on The Most Useful Site in the World — ${ordered.length} categories, zero JavaScript, every tool one click away.</p>
    <p class="metaline">This page needs no scripts — it works in every browser, reader and crawler. <a href="index.html">Open the interactive homepage →</a></p>

    <nav class="toc" aria-label="Categories">
${navLinks}
    </nav>

${sectionsHtml}

    <div class="ai-note">
      🤖 <strong>AI agents &amp; developers:</strong> the same catalogue is available as
      <a href="cards/cards.json">cards.json</a>, <a href="llms.txt">llms.txt</a> and
      <a href="llms-full.txt">llms-full.txt</a>. See <a href="agents.html">the machine-usage guide</a>;
      the standalone AI (<strong>Lantern</strong>) lives at <a href="ai.html">ai.html</a> — a separate
      product that reads no catalogue data.
      Any tool: <code>tool.html?card=&lt;tool-slug&gt;</code>
    </div>

    <p class="back"><a href="index.html">← Back to the full interactive site</a></p>
    <footer>The Most Useful Site in the World · free forever · no ads · no sign-ups · every calculation stays in your browser · generated ${today}</footer>
  </main>
</body>
</html>
`;
  // The footer carries the build date, so a freshness check must compare
  // modulo it (a stale-but-otherwise-identical file is still stale, but a
  // date-only difference is not drift).
  const stripDate = s => s.replace(/generated \d{4}-\d{2}-\d{2}/, 'generated X');
  const targets = [
    ['llms.txt', path.join(ROOT, 'llms.txt'), llms, false],
    ['llms-full.txt', path.join(ROOT, 'llms-full.txt'), llmsFull, false],
    ['tools-index.html', path.join(ROOT, 'tools-index.html'), html, true],
  ];

  if (CHECK) {
    let stale = 0;
    for (const [name, file, want, dated] of targets) {
      let got;
      try { got = fs.readFileSync(file, 'utf8'); } catch { got = null; }
      const matches = got !== null &&
        (dated ? stripDate(got) === stripDate(want) : got === want);
      if (!matches) {
        console.error(`STALE: ${name} does not match cards/cards.json`);
        stale += 1;
      }
    }
    if (stale) {
      console.error(`run: node scripts/generate-ai-index.js (${stale} file(s) stale)`);
      process.exit(1);
    }
    console.log('ai indexes OK — llms.txt, llms-full.txt and tools-index.html match the catalogue');
    return;
  }

  for (const [, file, content] of targets) fs.writeFileSync(file, content);

  console.log(`✔ llms.txt         (${llms.length} bytes)`);
  console.log(`✔ llms-full.txt    (${llmsFull.length} bytes) — ${total} tools`);
  console.log(`✔ tools-index.html (${html.length} bytes) — ${ordered.length} categories`);
}

main();
