'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
const ROOT = path.resolve(__dirname, '../..');
const slugs = [
  'community-skills-needs-matcher', 'community-tool-library-scheduler',
  'repair-cafe-capacity-planner', 'cooperative-surplus-splitter',
  'solidarity-fund-runway', 'community-project-budget-picker',
  'local-supplier-gap-finder', 'community-apprenticeship-planner',
  'surplus-materials-exchange', 'mutual-aid-shift-planner'
];
async function mount(slug) {
  const dom = new JSDOM('<body>' + fs.readFileSync(path.join(ROOT, 'cards', slug + '.html'), 'utf8') + '</body>', {
    runScripts: 'dangerously', url: 'https://example.test/',
    beforeParse(w) { w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {}; }
  });
  await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const get = k => dom.window.document.getElementById(slug + '-' + k);
  return {
    dom, get,
    set(k, v) { get(k).value = v; },
    run() { dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); },
    rows() { return [...get('table').querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)); },
    text() { return get('summary').textContent; },
    close() { dom.window.close(); }
  };
}
for (const slug of slugs) test(slug + ': initialises once, accessible references, resets example and rejects empty data', async () => {
  const h = await mount(slug);
  try {
    assert.equal(h.get('results').hidden, false, h.get('status').textContent);
    assert.ok(h.rows().length);
    h.dom.window.document.dispatchEvent(new h.dom.window.Event('DOMContentLoaded'));
    assert.equal(h.get('table').querySelectorAll('table').length, 1);
    const ids = [...h.dom.window.document.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const el of h.dom.window.document.querySelectorAll('[for],[aria-labelledby],[aria-describedby]')) {
      for (const attr of ['for', 'aria-labelledby', 'aria-describedby']) {
        for (const id of (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) assert.ok(h.dom.window.document.getElementById(id), id);
      }
    }
    const area = h.dom.window.document.querySelector('textarea');
    if (area) area.value = ''; else h.set('balance', '-1');
    h.run();
    assert.equal(h.get('results').hidden, true);
    assert.equal(h.rows().length, 0, 'invalid inputs must not leave stale results');
    h.get('example').click();
    assert.equal(h.get('results').hidden, false);
  } finally { h.close(); }
});
test('skills: conserves offered hours and exposes unmet need', async () => {
  const h = await mount(slugs[0]);
  try {
    assert.match(h.text(), /8 hours matched; 3 hours still needed/);
    const rows = h.rows();
    assert.equal(rows.filter(r => r[2] === 'Amina').reduce((s,r)=>s+Number(r[3]),0), 4);
    h.set('offers', 'Helper | Skills | 1'); h.set('needs', 'Request | skills | 2'); h.run();
    assert.equal(h.rows()[0][3], '1'); assert.equal(h.rows()[1][2], 'Unmatched');
  } finally { h.close(); }
});
test('tool library: buffer conflict, unknown item, invalid dates, adjacency', async () => {
  const h = await mount(slugs[1]);
  try {
    assert.match(h.text(), /3 of 4 requests accepted/);
    assert.match(h.rows()[1][4], /Conflict with Amina/);
    assert.equal(h.rows()[3][4], 'Accepted', 'booking at the buffer boundary is allowed');
    h.set('buffer', '0'); h.set('bookings', 'DRILL-1 | A | 2026-10-10 09:00 | 2026-10-10 11:00\nDRILL-1 | B | 2026-10-10 11:00 | 2026-10-10 12:00\nOTHER | C | 2026-10-10 11:00 | 2026-10-10 12:00'); h.run();
    assert.equal(h.rows()[1][4], 'Accepted'); assert.match(h.rows()[2][4], /Unknown/);
    h.set('bookings', 'DRILL-1 | A | 2026-02-30 09:00 | 2026-03-01 10:00'); h.run();
    assert.match(h.get('status').textContent, /Invalid date/);
  } finally { h.close(); }
});
test('repair: jobs cannot be split to manufacture a slot', async () => {
  const h = await mount(slugs[2]);
  try {
    assert.match(h.text(), /3 of 5 items assigned/);
    h.set('volunteers', 'A | sewing | 20\nB | sewing | 20'); h.set('jobs', 'Coat | sewing | 30'); h.run();
    assert.equal(h.rows()[0][3], 'Waiting list');
  } finally { h.close(); }
});
test('cooperative: exact reserve and cent-conserving blended allocation', async () => {
  const h = await mount(slugs[3]);
  try {
    assert.match(h.text(), /reserve 200 USD \+ member payouts 800 USD/);
    assert.deepEqual(h.rows().map(r => r[3]), ['200 USD','266.67 USD','333.33 USD']);
    h.set('surplus', '0.01'); h.set('reserve', '0'); h.set('equal', '100'); h.run();
    assert.equal(h.rows().map(r => parseFloat(r[3])).reduce((a,b)=>a+b,0), 0.01);
    h.set('members', 'A | 0\nB | 0'); h.set('equal', '50'); h.run();
    assert.match(h.get('status').textContent, /positive contribution weights/);
    h.set('equal','100'); h.set('surplus','1.234'); h.run(); assert.match(h.get('status').textContent,/two decimal/);
  } finally { h.close(); }
});
test('fund: reserve breach, stress payment, zero collection and integral member counts', async () => {
  const h = await mount(slugs[4]);
  try {
    assert.equal(h.rows()[2][3], '630 USD'); assert.equal(h.rows()[11][3], '720 USD');
    h.set('shock', '700'); h.run(); assert.match(h.text(), /breached month 3/);
    h.set('collect','0'); h.run(); assert.match(h.get('notes').textContent,/not possible at 0%/);
    h.set('members','1.5'); h.run(); assert.equal(h.get('results').hidden,true);
    h.set('members','20'); h.set('shockmonth','13'); h.run(); assert.match(h.get('status').textContent,/within the model/);
  } finally { h.close(); }
});
test('budget picker: optimal combination rather than highest-scored single project', async () => {
  const h = await mount(slugs[5]);
  try {
    h.set('budget','10'); h.set('projects','A | 10 | 10\nB | 5 | 6\nC | 5 | 6'); h.run();
    assert.match(h.text(),/score: 12; cost 10 USD/);
    assert.deepEqual(h.rows().map(r=>r[3]),['Not included','Included','Included']);
    h.set('budget','0'); h.run(); assert.ok(h.rows().every(r=>r[3]==='Not included'));
    h.set('projects',Array.from({length:19},(_,i)=>'P'+i+' | 1 | 1').join('\n')); h.run(); assert.match(h.get('status').textContent,/Maximum 18/);
  } finally { h.close(); }
});
test('supplier gap: aggregates case-insensitively and labels hypothetical revenue', async () => {
  const h = await mount(slugs[6]);
  try {
    assert.equal(h.rows()[0][0], 'Repairs'); assert.equal(h.rows()[0][4], '180 USD');
    h.set('spending','Food | local | 10\nfood | outside | 30'); h.set('capture','50'); h.run();
    assert.deepEqual(h.rows()[0],['Food','10 USD','30 USD','25.0%','15 USD']);
    h.set('spending','Food | unknown | 30'); h.run(); assert.match(h.get('status').textContent,/local or outside/);
  } finally { h.close(); }
});
test('apprenticeships: cohort teaching capacity, learner time and missing course', async () => {
  const h = await mount(slugs[7]);
  try {
    assert.match(h.text(),/5 of 6 learners placed in 3 cohorts; 10 mentor hours/);
    assert.match(h.rows().find(r=>r[0]==='Omar')[5],/Insufficient/);
    h.set('mentors','A | unknown | 4 | 2'); h.run(); assert.match(h.get('status').textContent,/No course hours/);
  } finally { h.close(); }
});
test('materials: conserved supply, no implicit conversion', async () => {
  const h = await mount(slugs[8]);
  try {
    assert.match(h.text(),/2 of 4 project requirements fully matched/);
    const timber=h.rows().filter(r=>r[1]==='reclaimed timber'&&r[3]!=='Unmatched');
    assert.equal(timber.reduce((s,r)=>s+Number(r[4]),0),30);
    h.set('offers','A | wood | metre | 3'); h.set('requests','B | wood | centimetre | 10'); h.run();
    assert.equal(h.rows()[0][3],'Unmatched');
  } finally { h.close(); }
});
test('shifts: constrained slot first, caps, coverage gap and unknown slot rejection', async () => {
  const h = await mount(slugs[9]);
  try {
    assert.match(h.text(),/4 of 5 places covered/);
    h.set('volunteers','A | help | 1 | X,Y\nB | help | 1 | X'); h.set('shifts','X | help | 1\nY | help | 1'); h.run();
    assert.equal(h.rows()[0][3],'B'); assert.equal(h.rows()[1][3],'A');
    h.set('volunteers','A | help | 1 | Z'); h.run(); assert.match(h.get('status').textContent,/Unknown availability slot/);
  } finally { h.close(); }
});
test('untrusted labels render as text and copies remain current after edits', async () => {
  const h = await mount(slugs[0]);
  try {
    h.set('offers','<img src=x onerror=alert(1)> | help | 1'); h.set('needs','Need | help | 1'); h.run();
    assert.equal(h.dom.window.document.querySelectorAll('img').length,0);
    assert.equal(h.rows()[0][2],'<img src=x onerror=alert(1)>');
    let copied; Object.defineProperty(h.dom.window.navigator,'clipboard',{value:{async writeText(t){copied=t;}}});
    h.set('needs','New request | help | 2'); h.get('copy').click(); await Promise.resolve();
    assert.match(copied,/New request/); assert.match(copied,/1 hours still needed/);
  } finally { h.close(); }
});
