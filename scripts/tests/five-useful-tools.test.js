'use strict';
// Behavioural regressions for the five tools added on 2026-10-09:
// csp-header-builder, spf-dmarc-record-checker, mailto-link-builder,
// post-thread-splitter and event-seating-planner. Each test runs the real
// card fragment in jsdom and drives it through its visible controls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}

function mount(slug) {
  const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html',
    beforeParse(window) {
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
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
  // A fresh jsdom document is still 'loading'; the cards wait for
  // DOMContentLoaded in that state, exactly as they do in a loading page.
  if (document.readyState === 'loading') document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const id = name => slug + '-' + name;
  return {
    window,
    document,
    $: name => document.getElementById(id(name)),
    set(name, value) {
      const control = document.getElementById(id(name));
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = String(value);
      control.dispatchEvent(new window.Event('input', { bubbles: true }));
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    click(name) { document.getElementById(id(name)).click(); },
    findings(name) {
      return Array.from(document.querySelectorAll('#' + id(name) + ' li')).map(li => ({ level: li.getAttribute('data-level'), text: li.textContent }));
    },
  };
}

const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';

// ---- Content-Security-Policy builder & checker ------------------------------

test('CSP builder quotes bare keywords and drops header-only directives from the meta tag', { skip }, () => {
  const c = mount('csp-header-builder');
  assert.match(c.$('output').value, /^Content-Security-Policy: default-src 'self'; img-src 'self' data:;/);
  assert.match(c.$('output').value, /object-src 'none'/);
  c.set('f-script-src', 'self https://cdn.example.com');
  c.click('build');
  assert.match(c.$('output').value, /script-src 'self' https:\/\/cdn\.example\.com/);
  c.set('format', 'meta');
  const meta = c.$('output').value;
  assert.match(meta, /^<meta http-equiv="Content-Security-Policy" content="/);
  assert.doesNotMatch(meta, /frame-ancestors/);
  assert.match(c.$('buildnote').textContent, /ignored in a <meta> tag/);
  c.set('format', 'header');
  c.set('reportonly', true);
  assert.match(c.$('output').value, /^Content-Security-Policy-Report-Only: /);
});

test('CSP checker flags unquoted keywords, unsafe-inline, wildcards and missing base-uri', { skip }, () => {
  const c = mount('csp-header-builder');
  c.set('input', "Content-Security-Policy: default-src self; script-src 'self' 'unsafe-inline' https:; script-src 'none'");
  c.click('check');
  const f = c.findings('findings');
  const text = f.map(x => x.text).join('\n');
  assert.match(text, /"self" needs single quotes/);
  assert.match(text, /'unsafe-inline' allows inline scripts/);
  assert.match(text, /"https:" lets scripts load from almost any site/);
  assert.match(text, /appears more than once/);
  assert.match(text, /No base-uri/);
  assert.equal(f[0].level, 'high', 'high-severity findings are listed first');
  assert.match(c.$('summary').textContent, /3 directives read · [1-9]\d* high/);
});

test('CSP checker treats unsafe-inline next to a nonce as a fallback, and a tight policy as clean', { skip }, () => {
  const c = mount('csp-header-builder');
  c.set('input', "default-src 'none'; script-src 'nonce-abc123' 'strict-dynamic' 'unsafe-inline' https:; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  c.click('check');
  const f = c.findings('findings');
  assert.equal(f.filter(x => x.level === 'high').length, 0, JSON.stringify(f));
  assert.ok(f.some(x => /ignored by browsers that support nonces/.test(x.text)));
  c.set('input', "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  c.click('check');
  assert.deepEqual(c.findings('findings').map(x => x.level), ['ok']);
});

test('CSP checker can load a pasted policy back into the builder', { skip }, () => {
  const c = mount('csp-header-builder');
  c.set('input', "default-src 'self'; connect-src 'self' https://api.example.org; upgrade-insecure-requests; report-uri /csp");
  c.click('load');
  assert.equal(c.$('f-connect-src').value, "'self' https://api.example.org");
  assert.equal(c.$('f-object-src').value, '');
  assert.equal(c.$('upgrade').checked, true);
  assert.match(c.$('summary').textContent, /left out: report-uri/);
});

// ---- SPF & DMARC ------------------------------------------------------------

test('SPF checker counts DNS lookups and fails a record over the limit of 10', { skip }, () => {
  const c = mount('spf-dmarc-record-checker');
  const includes = Array.from({ length: 10 }, (_, i) => 'include:s' + i + '.mail.example').join(' ');
  c.set('input', 'v=spf1 mx ' + includes + ' -all');
  c.click('check');
  const f = c.findings('findings');
  assert.ok(f.some(x => x.level === 'error' && /needs 11 DNS lookups/.test(x.text)), JSON.stringify(f));
  assert.match(c.$('summary').textContent, /SPF record · 1 error · .* 11 DNS lookups counted/);
});

test('SPF checker catches +all, bad IPs, terms after all and unknown mechanisms', { skip }, () => {
  const c = mount('spf-dmarc-record-checker');
  c.set('input', 'v=spf1 ip4:192.0.2.300 ip6:2001:db8::/129 incude:mail.example +all a');
  c.click('check');
  const text = c.findings('findings').map(x => x.level + ' ' + x.text).join('\n');
  assert.match(text, /error "192\.0\.2\.300" is not a valid IPv4 address/);
  assert.match(text, /error "\/129" is not a valid prefix length/);
  assert.match(text, /error Unknown mechanism "incude"/);
  assert.match(text, /error "\+all" .* authorises every server/);
  assert.match(text, /warn "a" comes after "all"/);
});

test('SPF checker accepts a normal record and warns about two SPF records', { skip }, () => {
  const c = mount('spf-dmarc-record-checker');
  c.set('input', 'v=spf1 include:_spf.mailhost.example ip4:192.0.2.0/24 ip6:2001:db8::1 ~all');
  c.click('check');
  const f = c.findings('findings');
  assert.equal(f.filter(x => x.level === 'error').length, 0, JSON.stringify(f));
  assert.ok(f.some(x => /1 DNS lookup in this record/.test(x.text)));
  c.set('input', 'v=spf1 mx -all\nv=spf1 include:other.example ~all');
  c.click('check');
  assert.ok(c.findings('findings').some(x => x.level === 'error' && /pasted 2 SPF records/.test(x.text)));
});

test('DMARC checker validates tags, policy values, pct range and report URIs', { skip }, () => {
  const c = mount('spf-dmarc-record-checker');
  c.set('input', 'v=DMARC1; p=block; pct=150; rua=reports@example.org; adkim=x; foo=1');
  c.click('check');
  const text = c.findings('findings').map(x => x.level + ' ' + x.text).join('\n');
  assert.match(text, /error p=block is not valid/);
  assert.match(text, /error pct=150 must be a whole number/);
  assert.match(text, /error rua: "reports@example\.org" must be a mailto: address/);
  assert.match(text, /error adkim=x must be r/);
  assert.match(text, /warn Unknown tag "foo"/);
  c.set('input', 'v=dmarc1; p=none');
  c.click('check');
  assert.ok(c.findings('findings').some(x => x.level === 'error' && /exact case/.test(x.text)));
  c.set('input', 'v=DMARC1; p=reject; rua=mailto:dmarc@example.org; adkim=s');
  c.click('check');
  assert.equal(c.findings('findings').filter(x => x.level === 'error' || x.level === 'warn').length, 0);
});

test('SPF/DMARC builder produces records that pass its own checker', { skip }, () => {
  const c = mount('spf-dmarc-record-checker');
  c.set('mx', true);
  c.set('includes', '_spf.mailhost.example');
  c.set('ips', '192.0.2.10\n2001:db8::/32');
  c.set('all', '-all');
  c.click('build');
  assert.equal(c.$('output').value, 'v=spf1 mx include:_spf.mailhost.example ip4:192.0.2.10 ip6:2001:db8::/32 -all');
  c.click('tocheck');
  assert.equal(c.findings('findings').filter(x => x.level === 'error').length, 0);
  c.click('tab-dmarc');
  assert.equal(c.$('dmarc').hidden, false);
  c.set('p', 'quarantine');
  c.set('pct', '50');
  c.set('rua', 'dmarc@yourdomain.example');
  c.click('build');
  assert.equal(c.$('output').value, 'v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@yourdomain.example');
  assert.match(c.$('buildnote').textContent, /_dmarc/);
});

// ---- Mailto link builder ----------------------------------------------------

test('mailto builder percent-encodes subject/body with CRLF line breaks and escapes HTML output', { skip }, () => {
  const c = mount('mailto-link-builder');
  c.set('to', 'Ana <ana@example.org>, bo+tag@example.org');
  c.set('cc', 'cc@example.org');
  c.set('subject', 'Q&A: "tickets" #2');
  c.set('body', 'Line 1\nLine 2 & more');
  c.set('text', '<Email> us');
  c.click('build');
  const url = c.$('url').value;
  assert.equal(url, 'mailto:ana@example.org,bo%2Btag@example.org?cc=cc@example.org&subject=Q%26A%3A%20%22tickets%22%20%232&body=Line%201%0D%0ALine%202%20%26%20more');
  assert.equal(c.$('html').value, '<a href="' + url.replace(/&/g, '&amp;') + '">&lt;Email&gt; us</a>');
  assert.equal(c.$('try').getAttribute('href'), url);
  assert.equal(c.$('warnings').children.length, 0);
});

test('mailto decoder round-trips a link and keeps a literal plus sign', { skip }, () => {
  const c = mount('mailto-link-builder');
  c.set('decode-input', '<a href="mailto:a+b@example.org?subject=Hi%20there&amp;body=One%0D%0ATwo&amp;x-foo=1">mail</a>');
  c.click('decode');
  assert.equal(c.$('to').value, 'a+b@example.org');
  assert.equal(c.$('subject').value, 'Hi there');
  assert.equal(c.$('body').value, 'One\nTwo');
  assert.match(c.$('decode-status').textContent, /Ignored unknown header: x-foo/);
  assert.equal(c.$('url').value, 'mailto:a%2Bb@example.org?subject=Hi%20there&body=One%0D%0ATwo');
});

test('mailto builder warns about bad addresses and very long links', { skip }, () => {
  const c = mount('mailto-link-builder');
  c.set('to', 'not-an-address');
  c.set('body', 'x'.repeat(2100));
  c.click('build');
  const warnings = Array.from(c.$('warnings').children).map(li => li.textContent).join('\n');
  assert.match(warnings, /"not-an-address" does not look like an email address/);
  assert.match(warnings, /cut off or refuse long mailto links/);
});

// ---- Thread splitter --------------------------------------------------------

function posts(c) {
  return Array.from(c.document.querySelectorAll('#post-thread-splitter-posts .post-thread-splitter-post-text')).map(p => p.textContent);
}

test('thread splitter keeps every post within the limit, numbers them and never splits words', { skip }, () => {
  const c = mount('post-thread-splitter');
  const sentences = Array.from({ length: 30 }, (_, i) => 'Sentence number ' + (i + 1) + ' explains one more useful idea clearly.');
  const text = sentences.slice(0, 10).join(' ') + '\n\n' + sentences.slice(10).join(' ');
  c.set('input', text);
  c.click('split');
  const out = posts(c);
  assert.ok(out.length >= 6, 'expected a multi-post thread');
  out.forEach((p, i) => {
    assert.ok(Array.from(p).length <= 280, 'post ' + (i + 1) + ' is ' + Array.from(p).length);
    assert.ok(p.endsWith(' ' + (i + 1) + '/' + out.length), p);
  });
  const rebuilt = out.map(p => p.replace(/ \d+\/\d+$/, '')).join(' ').replace(/\s+/g, ' ');
  assert.equal(rebuilt, text.replace(/\s+/g, ' '));
  assert.ok(out.every(p => /[.]\s\d+\/\d+$/.test(p)), 'each post ends at a sentence boundary');
});

test('thread splitter counts links as 23 characters and leaves short text unnumbered', { skip }, () => {
  const c = mount('post-thread-splitter');
  c.set('input', 'Read this: https://example.org/' + 'a'.repeat(300));
  c.click('split');
  assert.equal(posts(c).length, 1);
  assert.match(c.$('status').textContent, /already fits in one post \(34 \/ 280\)/);
  c.set('links', false);
  c.click('split');
  assert.ok(posts(c).length > 1);
});

test('thread splitter puts numbers first on request and weights emoji/CJK for X', { skip }, () => {
  const c = mount('post-thread-splitter');
  c.set('platform', 'custom');
  c.set('limit', '60');
  c.set('numbering', 'paren');
  c.set('position', 'start');
  c.set('input', '这是一个很长的句子。'.repeat(8));
  c.click('split');
  const out = posts(c);
  assert.ok(out.length > 1);
  assert.ok(out[0].startsWith('(1/' + out.length + ') '));
  // 60 weighted units allow far fewer CJK characters than 60.
  out.forEach(p => assert.ok(Array.from(p).length < 40, p));
});

// ---- Event seating planner --------------------------------------------------

function tables(c) {
  return Array.from(c.document.querySelectorAll('#event-seating-planner-result .event-seating-planner-table')).map(t => ({
    name: t.querySelector('h3').textContent,
    guests: Array.from(t.querySelectorAll('li')).map(li => li.textContent),
  }));
}
function tableOf(list, name) { return list.findIndex(t => t.guests.includes(name)); }

test('seating planner keeps households together, honours keep-apart and seat-together rules, and respects capacity', { skip }, () => {
  const c = mount('event-seating-planner');
  c.set('guests', 'Ana Silva, Tom Silva\nGrandma Rose\nPriya, Dev, Mira\nUncle Joe\nKim, Lee\nSam\nAlex, Jo, Chris, Pat');
  c.set('tables-input', '3x6');
  c.set('apart', 'Uncle Joe / Grandma Rose\nSam / Kim');
  c.set('near', 'Priya / Ana Silva');
  c.click('plan');
  const t = tables(c);
  assert.equal(t.length, 3);
  t.forEach(x => assert.ok(x.guests.length <= 6, x.name + ' over capacity'));
  assert.equal(tableOf(t, 'Ana Silva'), tableOf(t, 'Tom Silva'));
  assert.equal(tableOf(t, 'Priya'), tableOf(t, 'Mira'));
  assert.equal(new Set(['Alex', 'Jo', 'Chris', 'Pat'].map(n => tableOf(t, n))).size, 1);
  assert.notEqual(tableOf(t, 'Uncle Joe'), tableOf(t, 'Grandma Rose'));
  assert.notEqual(tableOf(t, 'Sam'), tableOf(t, 'Kim'));
  assert.equal(tableOf(t, 'Priya'), tableOf(t, 'Ana Silva'));
  assert.match(c.$('issues').textContent, /Every rule is met/);
  assert.match(c.$('status').textContent, /14 guests at 3 of 3 tables \(4 spare seats\)/);
  // With five-seat tables every rule cannot hold at once; keep-apart must win.
  c.set('tables-input', '3x5');
  c.click('plan');
  const tight = tables(c);
  tight.forEach(x => assert.ok(x.guests.length <= 5, x.name + ' over capacity'));
  assert.notEqual(tableOf(tight, 'Uncle Joe'), tableOf(tight, 'Grandma Rose'));
  assert.notEqual(tableOf(tight, 'Sam'), tableOf(tight, 'Kim'));
  assert.match(c.$('issues').textContent, /Could not seat Priya \/ Ana Silva together/);
});

test('seating planner explains impossible input instead of producing a bad plan', { skip }, () => {
  const c = mount('event-seating-planner');
  c.set('guests', 'A, B, C\nD');
  c.set('tables-input', '3');
  c.click('plan');
  assert.match(c.$('status').textContent, /4 guests but only 3 seats/);
  assert.equal(tables(c).length, 0);
  c.set('tables-input', '2, 2');
  c.click('plan');
  assert.match(c.$('status').textContent, /more people than your biggest table \(2\): A, B, C/);
  c.set('guests', 'A, B\nC');
  c.set('apart', 'A / B\nC / Nobody');
  c.click('plan');
  const issues = c.$('issues').textContent;
  assert.match(issues, /Cannot keep A \/ B apart/);
  assert.match(issues, /not on the guest list: Nobody/);
});

test('seating planner renders names as text and is repeatable for the same input', { skip }, () => {
  const c = mount('event-seating-planner');
  c.set('guests', '<img src=x onerror=alert(1)>\nBea\nCal, Dee');
  c.set('tables-input', '2x2');
  c.click('plan');
  assert.equal(c.document.querySelectorAll('#event-seating-planner-result img').length, 0);
  const first = JSON.stringify(tables(c));
  c.click('plan');
  assert.equal(JSON.stringify(tables(c)), first);
  assert.ok(tables(c).some(t => t.guests.includes('<img src=x onerror=alert(1)>')));
});

test('seating planner CSV export quotes commas and neutralises spreadsheet formulas', { skip }, async () => {
  const c = mount('event-seating-planner');
  let captured = null;
  c.window.URL.createObjectURL = blob => { captured = blob; return 'blob:seating-test'; };
  c.window.URL.revokeObjectURL = () => {};
  c.window.HTMLAnchorElement.prototype.click = function () {};
  c.set('guests', '=SUM(A1), "Bo" Smith\nCy');
  c.set('tables-input', '1x3');
  c.click('plan');
  c.click('csv');
  assert.ok(captured, 'a CSV blob was created');
  const text = await captured.text();
  assert.equal(text, 'Table,Seat,Guest\r\nTable 1,1,\'=SUM(A1)\r\nTable 1,2,"""Bo"" Smith"\r\nTable 1,3,Cy\r\n');
  assert.match(c.$('status').textContent, /Saved seating-plan\.csv/);
});
