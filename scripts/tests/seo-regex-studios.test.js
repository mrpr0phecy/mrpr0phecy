'use strict';
// Regressions for the 2026-10-09 merge of overlapping tools (owner request):
// regex-cheat-sheet, linux-regex-tester and regex-replace-string-transform
// became part of pro-regex-studio; seo-helper and seo-meta-tag-social-previewer
// became part of pro-seo-audit-toolkit. The card tests drive the real
// fragments in jsdom; the redirect tests pin that every retired URL still
// lands on the tool that replaced it.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}
const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';

function mount(slug, prefix) {
  const html = fs.readFileSync(path.join(ROOT, 'cards', slug + '.html'), 'utf8');
  const errors = [];
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html',
    beforeParse(window) {
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
      window.addEventListener('error', e => errors.push(e.message));
    },
  });
  const { window } = dom;
  const document = window.document;
  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach(script => script.remove());
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  while (parsed.body.firstChild) wrapper.appendChild(parsed.body.firstChild);
  document.getElementById('host').appendChild(wrapper);
  scripts.forEach(script => window.eval(script.textContent));
  if (document.readyState === 'loading') document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const $ = name => document.getElementById(prefix + '-' + name);
  return {
    errors,
    $,
    value: name => { const el = $(name); return 'value' in el && el.tagName !== 'DIV' ? el.value : el.textContent; },
    set(name, value) {
      const control = $(name);
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = String(value);
      control.dispatchEvent(new window.Event('input', { bubbles: true }));
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    click(name) { $(name).click(); },
    checks() { return Array.from($('checks').querySelectorAll('li')).map(li => li.textContent); },
  };
}

// ---- Regex Studio -----------------------------------------------------------

function regex() {
  const r = mount('pro-regex-studio', 'rxs');
  ['g', 'i', 'm', 's', 'u', 'y'].forEach(f => r.set('flag-' + f, f === 'g'));
  return r;
}

test('Regex Studio highlights matches, lists groups and replaces with $n and named groups', { skip }, () => {
  const r = regex();
  r.set('pattern', '(\\d{4})-(\\d{2})-(\\d{2})');
  r.set('text', 'Dates: 2026-10-09 and 2025-01-31.');
  r.click('test');
  assert.match(r.$('stats').textContent, /2 matches · 3 capture groups/);
  assert.equal(r.$('highlight').querySelectorAll('mark').length, 2);
  assert.match(r.$('matches').textContent, /\$1 "2026"/);
  r.set('replace', '$3/$2/$1');
  assert.equal(r.$('replaced').value, 'Dates: 09/10/2026 and 31/01/2025.');
  r.set('pattern', '(?<y>\\d{4})');
  r.set('text', 'in 2026');
  r.set('replace', '[$<y>]');
  assert.equal(r.$('replaced').value, 'in [2026]');
  assert.deepEqual(r.errors, []);
});

test('Regex Studio reports bad patterns, survives empty matches and caps huge result sets', { skip }, () => {
  const r = regex();
  r.set('pattern', '(');
  r.click('test');
  assert.equal(r.$('error').hidden, false);
  assert.match(r.$('error').textContent, /isn't valid/);
  r.set('pattern', 'a*');
  r.set('text', 'baaab');
  r.click('test');
  assert.match(r.$('stats').textContent, /\d+ matches/);
  r.set('pattern', 'a');
  r.set('text', 'a'.repeat(200000));
  r.click('test');
  assert.match(r.$('stats').textContent, /stopped at/);
  r.set('pattern', '(a+)+$');
  r.click('test');
  assert.match(r.$('warning').textContent, /very long time/);
});

test('Regex Studio explains, exports code and command lines (from the retired tester), and keeps the cheat sheet and library', { skip }, () => {
  const r = regex();
  r.set('pattern', '(\\d{4})-(\\d{2})');
  r.set('text', '2026-10');
  r.click('test');
  assert.match(r.$('explain').textContent, /capturing group 1/);
  const langs = Array.from(r.$('lang').options).map(o => o.value);
  for (const lang of ['js', 'python', 'go', 'php', 'java', 'rust']) assert.ok(langs.includes(lang), lang);
  r.set('lang', 'python');
  assert.match(r.value('code'), /re\.compile\(r"\(\\d\{4\}\)-\(\\d\{2\}\)"\)/);
  const cmd = r.$('commands').textContent;
  assert.match(cmd, /grep -E '\(\[0-9\]\{4\}\)-\(\[0-9\]\{2\}\)'/);
  assert.match(cmd, /sed -E/);
  assert.match(cmd, /awk/);
  assert.match(r.$('cheatsheet').textContent, /A digit 0–9/);
  assert.match(r.$('library').textContent, /UK postcode/);
});

test('Regex Studio text tools (from the retired transform studio) change the text and undo', { skip }, () => {
  const r = regex();
  r.set('text', 'Hello World\nhello world\nHello World');
  r.click('case-lower');
  assert.equal(r.$('text').value, 'hello world\nhello world\nhello world');
  r.click('dedup');
  assert.equal(r.$('text').value, 'hello world');
  r.click('undo');
  assert.equal(r.$('text').value, 'hello world\nhello world\nhello world');
  assert.ok(r.$('presets').querySelectorAll('button').length >= 4);
});

// ---- SEO Studio -------------------------------------------------------------

test('SEO Studio audits the demo page with scored, actionable checks', { skip }, () => {
  const s = mount('pro-seo-audit-toolkit', 'seoat');
  s.click('demo');
  s.click('audit');
  assert.match(s.$('score').textContent, /^\d{1,3}\/100$/);
  const checks = s.checks();
  assert.ok(checks.length >= 30, 'at least 30 checks, got ' + checks.length);
  assert.ok(checks.some(t => /Fix:/.test(t)));
  assert.deepEqual(s.errors, []);
});

test('SEO Studio passes no duplicate-tag check for a tag that is absent, and fails real duplicates', { skip }, () => {
  const s = mount('pro-seo-audit-toolkit', 'seoat');
  s.set('html', '<html><head><title>x</title></head><body><a href="https://example.com" target="_blank">x</a><script>window.__ran = 1</script></body></html>');
  s.click('audit');
  let checks = s.checks();
  assert.ok(!checks.some(t => /Only one/.test(t)), checks.filter(t => /Only one/.test(t)).join(' | '));
  assert.ok(checks.some(t => /^ProblemMeta description/.test(t)));
  assert.ok(checks.some(t => /^WarningSafe new-tab links/.test(t)));
  s.set('html', '<html><head><title>One</title><title>Two</title><meta name="description" content="a"><meta name="description" content="b"><link rel="canonical" href="/a"><link rel="canonical" href="/b"></head><body><h1>x</h1></body></html>');
  s.click('audit');
  checks = s.checks();
  assert.equal(checks.filter(t => /^ProblemOnly one/.test(t)).length, 3);
});

test('SEO Studio previews and meta tags (from the retired previewer) escape what they print', { skip }, () => {
  const s = mount('pro-seo-audit-toolkit', 'seoat');
  s.set('p-title', 'Tom & "Jerry" <b>');
  s.set('p-desc', 'A "quoted" desc');
  s.set('p-url', 'https://ex.com/a?b=1&c=2');
  const code = s.value('p-code');
  assert.match(code, /<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;<\/title>/);
  assert.match(code, /<link rel="canonical" href="https:\/\/ex\.com\/a\?b=1&amp;c=2">/);
  assert.match(code, /og:description" content="A &quot;quoted&quot; desc"/);
  assert.equal(s.$('serp-title').textContent, 'Tom & "Jerry" <b>');
  assert.equal(s.$('serp-title').querySelectorAll('b').length, 0);
});

test('SEO Studio keyword analysis and creator ideas (from the retired optimizer) work', { skip }, () => {
  const s = mount('pro-seo-audit-toolkit', 'seoat');
  s.set('kw-text', 'Budget meal prep is easy. Meal prep saves money for students who cook. '.repeat(20));
  s.set('kw-targets', 'meal prep, budget');
  s.click('kw-run');
  assert.match(s.$('kw-results').textContent, /Reading ease/);
  assert.match(s.$('kw-results').textContent, /stuffing/);
  s.set('c-topic', 'speedrunning');
  s.click('c-run');
  assert.match(s.$('c-results').textContent, /#speedrunning/);
});

// ---- Retired URLs -----------------------------------------------------------

const redirects = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'tool-redirects.json'), 'utf8')).redirects;

test('every retired tool is gone from the catalogue and its old page forwards to the replacement', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'cards.json'), 'utf8'));
  const live = new Set(cards.map(c => c.name));
  assert.ok(Object.keys(redirects).length >= 5);
  for (const [old, now] of Object.entries(redirects)) {
    assert.ok(!live.has(old), old + ' is still in cards.json');
    assert.ok(!fs.existsSync(path.join(ROOT, 'cards', old + '.html')), old + ' fragment still exists');
    assert.ok(live.has(now), now + ' is not a live tool');
    const stub = fs.readFileSync(path.join(ROOT, 'tool', old + '.html'), 'utf8');
    assert.match(stub, /<meta name="robots" content="noindex">/);
    assert.ok(stub.includes(`<link rel="canonical" href="https://www.themostusefulsiteintheworld.com/tool/${now}.html">`));
    assert.ok(stub.includes(`content="0; url=${now}.html"`));
    assert.ok(stub.includes(`location.replace("${now}.html" + location.search + location.hash)`));
  }
});

test('tool.html maps every retired ?card= slug exactly as tool-redirects.json does', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'tool.html'), 'utf8');
  const block = shell.match(/const RETIRED_CARDS = \{([^}]*)\}/);
  assert.ok(block, 'RETIRED_CARDS map not found in tool.html');
  const map = {};
  for (const m of block[1].matchAll(/'([a-z0-9-]+)':\s*'([a-z0-9-]+)'/g)) map[m[1]] = m[2];
  assert.deepEqual(map, redirects);
});

test('no page in the repo still links to a retired tool page except its own redirect stub', () => {
  const pages = ['index.html', 'popular.html', 'use-case.html', 'guides/regex.html', 'embed.html', 'tools.html', 'tools-index.html', 'sitemap.html', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'related.json'];
  for (const page of pages) {
    const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const old of Object.keys(redirects)) {
      assert.ok(!text.includes('tool/' + old + '.html') && !text.includes('"' + old + '"'), page + ' still references ' + old);
    }
  }
});
