#!/usr/bin/env node
/**
 * build-tools-index.js — generate the single source of truth tools-index.json.
 *
 * Reads cards/cards.json and emits tools-index.json with category metadata,
 * tags, popularity metrics, and curated featured flags.
 *
 * Usage:
 *   node scripts/build-tools-index.js
 *   node scripts/build-tools-index.js --check
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CARDS_JSON = path.join(ROOT, 'cards', 'cards.json');
const OUTPUT_JSON = path.join(ROOT, 'tools-index.json');
const TOOLS_DIR = path.join(ROOT, 'tools');

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

const CAT_ICON_MAP = Object.fromEntries(CATEGORY_ORDER);

// Every category also gets a line-icon id for the category-level wayfinding
// (home tiles, category pages, the directory's category strip). The id is
// 'icon-' + the slug, matching the symbols in assets/icons/categories.svg.
// The emoji above stays in `icon` for machine-readable surfaces (llms.txt,
// JSON feeds); HTML surfaces use iconId. See DESIGN.md §5.
const iconIdFor = name => `icon-${slugCat(name)}`;

const slugCat = c => c.toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// High-popularity tools for metrics and trending
const HIGH_POPULARITY_MAP = {
  'bmi': 9950,
  'mortgage': 9880,
  'loan': 9820,
  'compoundinterest': 9790,
  'percentages': 9720,
  'bmr': 9650,
  'age-calculator': 9580,
  'bodyfat': 9520,
  'calorie': 9490,
  'secure-password-generator': 9450,
  'wifi-qr-generator': 9410,
  'pomodoro-study-timer': 9380,
  'stopwatch-timer': 9350,
  'currency': 9320,
  'unit-converter': 9290,
  'word-counter': 9260,
  'datecalc': 9230,
  'audio-tone-frequency-generator': 9200,
  'youtube-dj': 9170,
  'speed-test-network-benchmark': 9140,
  'color-contrast-checker': 9110,
  'json-formatter-validator': 9080,
  'regex-tester-debugger': 9050,
  'markdown-live-preview-editor': 9020
};

// Curated featured tools (top 8 displayed prominently on homepage)
const FEATURED_SLUGS = new Set([
  'bmi',
  'mortgage',
  'loan',
  'compoundinterest',
  'age-calculator',
  'wifi-qr-generator',
  'audio-tone-frequency-generator',
  'percentages',
  'bmr',
  'bodyfat',
  'youtube-dj',
  'color-contrast-checker'
]);

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'your', 'you', 'this', 'that',
  'online', 'free', 'tool', 'calculator', 'generator'
]);

function extractTags(slug, title, desc, catName) {
  const cleanTitle = title.replace(/[^\w\s-]/g, ' ').toLowerCase();
  const cleanDesc = (desc || '').replace(/[^\w\s-]/g, ' ').toLowerCase();
  const cleanSlug = slug.replace(/-/g, ' ').toLowerCase();
  const cleanCat = catName.replace(/[^\w\s-]/g, ' ').toLowerCase();

  const combined = `${cleanSlug} ${cleanTitle} ${cleanCat} ${cleanDesc}`;
  const tokens = combined.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const unique = Array.from(new Set(tokens));
  return unique.slice(0, 10);
}

function computePopularity(slug, index, total) {
  if (HIGH_POPULARITY_MAP[slug]) {
    return HIGH_POPULARITY_MAP[slug];
  }
  // Base popularity with pseudo-deterministic variation based on slug hash
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash |= 0;
  }
  const variance = Math.abs(hash % 3000);
  return 4000 + variance;
}

function build() {
  const rawCards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
  const staticTools = new Set();
  if (fs.existsSync(TOOLS_DIR)) {
    fs.readdirSync(TOOLS_DIR).forEach(f => {
      if (f.endsWith('.html')) {
        staticTools.add(f.replace('.html', ''));
      }
    });
  }

  // Group by category
  const catMap = new Map();
  rawCards.forEach(c => {
    const cat = c.category || 'General';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(c);
  });

  const categories = [];
  // Use CATEGORY_ORDER first
  const seenCats = new Set();
  for (const [catName, icon] of CATEGORY_ORDER) {
    if (catMap.has(catName)) {
      seenCats.add(catName);
      categories.push({
        slug: slugCat(catName),
        name: catName,
        count: catMap.get(catName).length,
        icon: icon,
        iconId: iconIdFor(catName)
      });
    }
  }
  // Append any extra categories
  for (const catName of Array.from(catMap.keys()).sort()) {
    if (!seenCats.has(catName)) {
      categories.push({
        slug: slugCat(catName),
        name: catName,
        count: catMap.get(catName).length,
        icon: CAT_ICON_MAP[catName] || '🛠️',
        iconId: iconIdFor(catName)
      });
    }
  }

  const tools = rawCards.map((c, idx) => {
    const slug = c.name;
    const catName = c.category || 'General';
    const catSlug = slugCat(catName);
    const tags = extractTags(slug, c.title || '', c.description || '', catName);
    const popularity = computePopularity(slug, idx, rawCards.length);
    const featured = FEATURED_SLUGS.has(slug);
    const url = staticTools.has(slug) ? `tools/${slug}.html` : `tool.html?card=${encodeURIComponent(slug)}`;

    return {
      slug: slug,
      title: c.title || slug,
      description: (c.description || 'Free browser tool.').replace(/\s+/g, ' ').trim(),
      category: catSlug,
      categoryName: catName,
      tags: tags,
      popularity: popularity,
      featured: featured,
      updated: '2026-09-19',
      url: url
    };
  });

  return {
    version: '2026-09-19',
    count: tools.length,
    categories: categories,
    tools: tools
  };
}

function main() {
  const isCheck = process.argv.includes('--check');
  const indexData = build();
  const jsonStr = JSON.stringify(indexData, null, 2) + '\n';

  if (isCheck) {
    if (!fs.existsSync(OUTPUT_JSON)) {
      console.error('FAIL: tools-index.json does not exist');
      process.exit(1);
    }
    const current = fs.readFileSync(OUTPUT_JSON, 'utf8');
    if (current !== jsonStr) {
      console.error('FAIL: tools-index.json is out of date — run: node scripts/build-tools-index.js');
      process.exit(1);
    }
    console.log(`tools-index.json OK (${indexData.count} tools, ${indexData.categories.length} categories)`);
    return;
  }

  fs.writeFileSync(OUTPUT_JSON, jsonStr, 'utf8');
  const gzipSize = require('zlib').gzipSync(Buffer.from(jsonStr)).length;
  console.log(`✔ tools-index.json written (${jsonStr.length} bytes, ~${Math.round(gzipSize / 1024)}KB gzip) — ${indexData.count} tools across ${indexData.categories.length} categories.`);
}

main();
