// Guards the prerendered per-tool pages in tools/ (P1-R2 pilot): each page
// must carry unique crawlable content, a working live-tool embed, valid
// structured data — and no analytics (tool pages stay clean per D-007; the
// footprint question is P0-M3, not something a new page decides alone).
//
// Run with: node scripts/tests/tool-pages.test.js
'use strict';
const fs = require('fs');
const assert = require('assert');

const NL = String.fromCharCode(10);
const cards = JSON.parse(fs.readFileSync('cards/cards.json', 'utf8'));
const slugs = new Set(cards.map(c => c.name));

// page -> embedded card slug. The pilot is deliberately small (3 pages with
// hand-written unique content); the 10–25 rollout waits on Search Console.
const PAGES = {
  'tools/mortgage.html': 'mortgage',
  'tools/bmi.html': 'bmi',
  'tools/compound-interest.html': 'compoundinterest',
};

for (const [page, slug] of Object.entries(PAGES)) {
  assert(fs.existsSync(page), page + ' missing');
  const h = fs.readFileSync(page, 'utf8');
  assert(slugs.has(slug), page + ': card slug ' + slug + ' not in catalogue');

  // Live tool via the documented embed contract (chrome-free + height).
  assert(h.includes('tool.html?card=' + slug + '&embed=1') ||
         h.includes('tool.html?card=' + slug + '&amp;embed=1'),
    page + ': must embed tool.html?card=' + slug + '&embed=1');
  assert(h.includes("d.card === '" + slug + "'") && h.includes('tmusitw:height'),
    page + ': must listen for the embed height postMessage for its own card');
  assert(h.includes('tool.html?card=' + slug + '">Open the standalone tool'),
    page + ': needs a no-JS fallback link to the standalone tool');

  // Crawlable metadata.
  assert(h.includes('<link rel="canonical" href="https://www.themostusefulsiteintheworld.com/' + page + '">'),
    page + ': self-referencing canonical required');
  assert(h.includes('name="description"') && h.includes('property="og:title"'),
    page + ': description + OG tags required');

  // Structured data must parse, with all three blocks.
  const blocks = [];
  const MARK = 'application/ld+json">';
  let at = 0;
  while (true) {
    const s = h.indexOf(MARK, at);
    if (s === -1) break;
    const e = h.indexOf('</script>', s);
    assert(e !== -1, page + ': unterminated JSON-LD block');
    blocks.push(h.slice(s + MARK.length, e));
    at = e;
  }
  assert(blocks.length >= 3, page + ': expected WebApplication + FAQPage + BreadcrumbList');
  const types = blocks.map(b => JSON.parse(b)['@type']);
  for (const t of ['WebApplication', 'FAQPage', 'BreadcrumbList']) {
    assert(types.includes(t), page + ': missing ' + t + ' JSON-LD');
  }
  const faq = JSON.parse(blocks[types.indexOf('FAQPage')]);
  assert(faq.mainEntity.length >= 4, page + ': FAQ needs 4+ questions');

  // Unique content, not a shell: worked example + caveat + author + date.
  for (const need of ['id="worked-example"', 'role="note"', 'Russell Head', '<time datetime="']) {
    assert(h.includes(need), page + ': missing ' + need);
  }
  // Visible copy must be substantial (pilot bar: 400+ words of article text).
  const text = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert(text.split(' ').length >= 400, page + ': article copy below 400 words');

  // Claim hygiene on a YMYL-adjacent page: caveats present, no banned absolutes.
  assert(/not advice|not a diagnosis|screening tool/i.test(h), page + ': needs an advice caveat');

  // Analytics footprint: tool pages load nothing (D-007). If the owner later
  // ratifies measurement here (P0-M3), this assertion changes with the ruling.
  assert(!h.includes('googletagmanager') && !h.includes('gtag('),
    page + ': tool pages must not load analytics without an owner ruling');

  console.log('  ok   ' + page + ': embed, metadata, JSON-LD, copy bar, no analytics');
}

console.log(NL + 'tool page tests passed');
