'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const SITE_ORIGIN = 'https://www.themostusefulsiteintheworld.com';

// Product B's public music pages, language landings and artist microsites.
// Keep this list explicit so adding a new cross-product route requires a
// conscious boundary decision.
const PRODUCT_B_PAGES = new Set([
  'animation.html',
  'bengali.html',
  'chinese.html',
  'dutch.html',
  'french.html',
  'hindi.html',
  'japanese.html',
  'listen.html',
  'marathi.html',
  'mpnews.html',
  'music.html',
  'punjabi.html',
  'portuguese.html',
  'radio.html',
  'russian.html',
  'spanish.html',
  'support.html',
  'sync-licence.html',
  'sync.html',
  'thai.html',
  'thisorthat.html',
  'youtubepromo.html',
  'youtubepromo1.html',
  'youtubepromo2.html',
  'youtubepromo3.html',
]);

const CATALOGUE_ENTRY_PAGES = new Set([
  '/index.html',
  '/tool.html',
  '/tools.html',
  '/tools-index.html',
  '/embed.html',
  '/embed-finance.html',
]);

const MRPROPHECY_GAMES = [
  'mrprophecy-beat-memory.html',
  'mrprophecy-beat-runner.html',
  'mrprophecy-crowd-surf.html',
  'mrprophecy-lyric-scramble.html',
  'mrprophecy-mix-board.html',
  'mrprophecy-name-that-track.html',
  'mrprophecy-rhythm-tap.html',
  'mrprophecy-studio-defender.html',
  'mrprophecy-tour-manager.html',
  'mrprophecy-vinyl-catch.html',
];

function collectHtml(dir, relative = '') {
  const ignored = new Set(['.git', 'node_modules', 'build', 'coverage', 'dist', 'target']);
  const result = [];
  for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignored.has(entry.name) || (relative === '' && entry.name === 'scripts')) continue;
      result.push(...collectHtml(dir, path.join(relative, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      result.push(path.join(relative, entry.name).split(path.sep).join('/'));
    }
  }
  return result;
}

function readProductionHtml(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function anchorHrefs(html) {
  const hrefs = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const attribute = match[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (attribute) hrefs.push(attribute[2]);
  }
  return hrefs;
}

function resolvedUrl(relativePath, href) {
  try {
    return new URL(href, `${SITE_ORIGIN}/${relativePath}`);
  } catch {
    return null;
  }
}

function isFirstParty(url) {
  return url.hostname.toLowerCase() === 'www.themostusefulsiteintheworld.com' ||
    url.hostname.toLowerCase() === 'themostusefulsiteintheworld.com';
}

function isProductBRoute(pathname) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '');
  return PRODUCT_B_PAGES.has(normalized.replace(/^\//, ''));
}

function isArtistSocial(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = decodeURIComponent(url.pathname).toLowerCase();
  return (host === 'youtube.com' && /^\/(?:@mrprophecy|mrprophecy|c\/mrprophecy)(?:\/|$)/.test(pathname)) ||
    (host === 'soundcloud.com' && /^\/mrpr0phecy(?:\/|$)/.test(pathname)) ||
    (host === 'instagram.com' && /^\/mrpr0phecy(?:\/|$)/.test(pathname)) ||
    (host === 'tiktok.com' && /^\/@mrprophecy1212(?:\/|$)/.test(pathname));
}

function isCatalogueEntry(pathname) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return normalized === '/' || CATALOGUE_ENTRY_PAGES.has(normalized) ||
    normalized.startsWith('/cards/') || normalized.startsWith('/categories/') ||
    normalized.startsWith('/tools/');
}

test('catalogue pages do not cross-promote the music or token products', () => {
  const violations = [];
  for (const relativePath of collectHtml(ROOT)) {
    // sitemap.html is intentionally a whole-site directory, not a product
    // landing page; its curated inventory is allowed to list both products.
    if (relativePath === 'sitemap.html' || PRODUCT_B_PAGES.has(relativePath)) continue;
    for (const href of anchorHrefs(readProductionHtml(relativePath))) {
      const url = resolvedUrl(relativePath, href);
      if (!url || !['http:', 'https:'].includes(url.protocol)) continue;
      if ((isFirstParty(url) && isProductBRoute(url.pathname)) || isArtistSocial(url)) {
        violations.push(`${relativePath} -> ${href}`);
      }
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('music and token pages do not link into the tools catalogue', () => {
  const violations = [];
  for (const relativePath of PRODUCT_B_PAGES) {
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    for (const href of anchorHrefs(readProductionHtml(relativePath))) {
      const url = resolvedUrl(relativePath, href);
      if (!url || !isFirstParty(url) || !isCatalogueEntry(url.pathname)) continue;
      violations.push(`${relativePath} -> ${href}`);
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('the ten branded music games retain lazy audio controls without channel-promo links', () => {
  for (const filename of MRPROPHECY_GAMES) {
    const relativePath = `cards/${filename}`;
    const html = readProductionHtml(relativePath);
    assert.match(html, /id="[a-z0-9]+-mute"/i, `${filename}: mute control is missing`);
    assert.match(html, /id="[a-z0-9]+-skip"/i, `${filename}: next-track control is missing`);
    assert.match(html, /YT\.Player/, `${filename}: YouTube player integration is missing`);
    assert.match(html, /youtube\.com\/iframe_api/, `${filename}: lazy IFrame API loader is missing`);
    assert.doesNotMatch(
      html,
      /<a\b[^>]*href\s*=\s*["']https?:\/\/(?:www\.)?youtube\.com\/@MrProphecy/i,
      `${filename}: music-channel promotional link remains`,
    );
  }
});
