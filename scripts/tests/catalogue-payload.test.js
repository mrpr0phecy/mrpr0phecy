'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '../..');

test('search catalogue is compact JSON without losing tools or public metadata', () => {
  const payload = fs.readFileSync(path.join(root, 'tools-index.json'), 'utf8');
  const index = JSON.parse(payload);
  const cards = JSON.parse(fs.readFileSync(path.join(root, 'cards/cards.json'), 'utf8'));
  assert.equal(payload, JSON.stringify(index) + '\n', 'do not ship indentation in the search payload');
  assert.equal(index.count, cards.length);
  assert.equal(index.tools.length, cards.length);
  assert.equal(index.categories.reduce((sum, category) => sum + category.count, 0), cards.length);
  const bySlug = new Map(index.tools.map((tool) => [tool.slug, tool]));
  assert.equal(bySlug.size, cards.length, 'every tool has exactly one search entry');
  for (const card of cards) {
    const tool = bySlug.get(card.name);
    assert(tool, `missing ${card.name}`);
    assert.equal(tool.title, card.title || card.name);
    assert.equal(tool.description, (card.description || 'Free browser tool.').replace(/\s+/g, ' ').trim());
    assert.equal(tool.categoryName, card.category || 'General');
    assert.equal(tool.url, `tool/${card.name}.html`);
    assert(Array.isArray(tool.tags));
    assert.equal(typeof tool.popularity, 'number');
    assert.equal(typeof tool.featured, 'boolean');
    assert.equal(typeof tool.updated, 'string');
  }
  const pretty = JSON.stringify(index, null, 2) + '\n';
  assert(Buffer.byteLength(payload) < Buffer.byteLength(pretty));
  assert(gzipSync(payload).length < gzipSync(pretty).length, 'compaction must also save compressed bytes');
});
