'use strict';
// Behaviour tests for the pantry stock/shopping tool and the home maintenance
// schedule/service log. These drive the real cards in jsdom rather than testing
// extracted helper copies, so the assertions cover the rendered UI as well as
// the date and stock calculations.
//
// jsdom stays outside the zero-dependency website repository (AGENTS.md §2):
//   mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) {
    console.log('NOTE: jsdom not installed — pantry/home-maintenance tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom');
    process.exit(0);
  }
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const FIXED_NOW = '2026-01-31T12:00:00.000Z';
const CARDS = path.join(__dirname, '..', '..', 'cards');

function mount(slug) {
  const nativeNow = Date.parse(FIXED_NOW);
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://tools.example.test/',
    beforeParse(window) {
      const NativeDate = window.Date;
      class FixedDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
        static now() { return nativeNow; }
      }
      window.Date = FixedDate;
      window.confirm = () => true;
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
    },
  });
  const prefix = slug + '-';
  const d = dom.window.document;
  return {
    dom,
    d,
    id: key => d.getElementById(prefix + key),
    text: key => d.getElementById(prefix + key).textContent.replace(/\s+/g, ' ').trim(),
    set(key, value) {
      const node = d.getElementById(prefix + key);
      assert.ok(node, 'missing #' + prefix + key);
      node.value = String(value);
      node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      node.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    },
    submit(key) {
      const form = d.getElementById(prefix + key);
      assert.ok(form, 'missing form #' + prefix + key);
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    },
    click(key) {
      const node = d.getElementById(prefix + key);
      assert.ok(node, 'missing #' + prefix + key);
      node.click();
    },
    close() { dom.window.close(); },
  };
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-');
}

test('pantry stock: date reminders, low stock, shopping-list handoff and local persistence', () => {
  const t = mount('pantry-freezer-stock-tracker');
  try {
    t.set('name', 'Chopped tomatoes');
    t.set('location', 'Pantry');
    t.set('quantity', '1');
    t.set('unit', 'tins');
    t.set('restock', '2');
    t.set('date-kind', 'use-by');
    t.set('date', addDays('2026-01-31', 2));
    t.set('notes', 'Top shelf');
    t.submit('form');

    assert.equal(t.text('stat-items'), '1');
    assert.equal(t.text('stat-dates'), '1');
    assert.equal(t.text('stat-low'), '1');
    assert.match(t.text('items'), /Chopped tomatoes/);
    assert.match(t.text('items'), /Use-by date in 2 days/);
    assert.match(t.text('items'), /Low stock/);
    assert.match(t.text('status'), /added to stock/);

    const rowButtons = Array.from(t.id('items').querySelectorAll('button'));
    rowButtons.find(button => button.textContent === 'Add to shopping list').click();
    assert.match(t.text('shopping-list'), /Chopped tomatoes/);
    assert.match(t.text('shopping-list'), /restock 2 tins/);
    assert.equal(t.text('stat-shopping'), '1');

    t.set('shopping-name', 'Oat milk');
    t.set('shopping-amount', '2 cartons');
    t.submit('shopping-form');
    assert.match(t.text('shopping-list'), /Oat milk · 2 cartons/);
    assert.equal(t.text('stat-shopping'), '2');

    const check = t.id('shopping-list').querySelector('input[type="checkbox"]');
    check.click();
    assert.equal(t.text('stat-shopping'), '1', 'checked entries no longer count as still to buy');
    t.click('clear-checked');
    assert.doesNotMatch(t.text('shopping-list'), /Chopped tomatoes/);

    const saved = JSON.parse(t.dom.window.localStorage.getItem('tmusw.pantry-freezer-stock-tracker.v1'));
    assert.equal(saved.items[0].name, 'Chopped tomatoes');
    assert.equal(saved.shopping.length, 1);

    t.set('search', 'nothing matches');
    assert.match(t.text('items'), /No stock entries match this view/);
  } finally { t.close(); }
});

test('pantry stock: passed label dates are surfaced without claiming whether food is safe', () => {
  const t = mount('pantry-freezer-stock-tracker');
  try {
    t.set('name', '<img src=x onerror=alert(1)> beans');
    t.set('quantity', '0');
    t.set('unit', 'packs');
    t.set('restock', '1');
    t.set('date-kind', 'best-before');
    t.set('date', addDays('2026-01-31', -1));
    t.submit('form');
    assert.match(t.text('items'), /Best-before date passed 1 day ago/);
    assert.match(t.text('items'), /Low stock/);
    assert.match(t.d.querySelector('.pfs-note').textContent, /not a safety verdict/);
    assert.equal(t.id('items').querySelector('img'), null, 'user text is inserted as text, never markup');
    assert.doesNotMatch(t.text('items'), /safe to eat|discard immediately/i);

    t.set('date-kind', 'none');
    t.set('date', '2026-02-01');
    t.submit('form');
    assert.match(t.text('status'), /Choose Use-by or Best-before/);
    assert.equal(t.text('stat-items'), '1', 'invalid date-kind combination did not add an item');
  } finally { t.close(); }
});

test('home maintenance: monthly completion advances from completion day with month-end clamping', () => {
  const t = mount('home-maintenance-planner');
  try {
    t.set('task', 'Service heating system');
    t.set('area', 'Utility room');
    t.set('category', 'Heating & ventilation');
    t.set('due', '2026-01-28');
    t.set('repeat', '1');
    t.set('notes', 'Manual is in the cupboard');
    t.submit('form');

    assert.equal(t.text('stat-open'), '1');
    assert.equal(t.text('stat-overdue'), '1');
    assert.match(t.text('tasks'), /Overdue by 3 days/);
    assert.match(t.text('tasks'), /Every month/);

    const complete = Array.from(t.id('tasks').querySelectorAll('button')).find(button => button.textContent === 'Mark complete today');
    assert.ok(complete);
    complete.click();
    assert.equal(t.text('stat-open'), '1');
    assert.equal(t.text('stat-overdue'), '0');
    assert.match(t.text('tasks'), /Next due: (?:28 Feb 2026|Feb 28, 2026)/);
    assert.match(t.text('tasks'), /Last completed: (?:31 Jan 2026|Jan 31, 2026)/);
    assert.match(t.text('tasks'), /Service log · 1 completion/);
    assert.match(t.text('status'), /Next due (?:28 Feb 2026|Feb 28, 2026)/);

    const stored = JSON.parse(t.dom.window.localStorage.getItem('tmusw.home-maintenance-planner.v1'));
    assert.equal(stored.tasks[0].history[0].dueAtCompletion, '2026-01-28');
    assert.equal(stored.tasks[0].due, '2026-02-28');
  } finally { t.close(); }
});

test('home maintenance: one-off completion is archived, reopenable, and user text stays text', () => {
  const t = mount('home-maintenance-planner');
  try {
    t.set('task', '<script>alert(1)</script> check alarm');
    t.set('category', 'Safety');
    t.set('due', '2026-01-31');
    t.set('repeat', '0');
    t.submit('form');
    assert.equal(t.id('tasks').querySelector('script'), null);
    assert.match(t.text('tasks'), /<script>alert\(1\)<\/script> check alarm/);

    Array.from(t.id('tasks').querySelectorAll('button')).find(button => button.textContent === 'Mark complete today').click();
    assert.equal(t.text('stat-open'), '0');
    assert.equal(t.text('stat-done'), '1');
    assert.match(t.text('status'), /moved to Completed/);

    t.set('filter', 'completed');
    assert.match(t.text('tasks'), /Completed · originally due (?:31 Jan 2026|Jan 31, 2026)/);
    assert.match(t.text('tasks'), /check alarm/);
    Array.from(t.id('tasks').querySelectorAll('button')).find(button => button.textContent === 'Reopen task').click();
    assert.equal(t.text('stat-open'), '1');
    assert.equal(t.text('stat-done'), '0');
    t.set('filter', 'open');
    assert.match(t.text('tasks'), /Due today/);
  } finally { t.close(); }
});

test('home maintenance: quick starters prefill the task without asserting a universal schedule', () => {
  const t = mount('home-maintenance-planner');
  try {
    const preset = Array.from(t.d.querySelectorAll('[data-hmp-task]')).find(button => button.textContent.includes('Smoke / CO alarm'));
    assert.ok(preset);
    preset.click();
    assert.equal(t.id('task').value, 'Test smoke or CO alarm');
    assert.equal(t.id('category').value, 'Safety');
    assert.equal(t.id('due').value, '', 'starter leaves the user to set an appropriate date');
    assert.equal(t.id('repeat').value, '0', 'starter does not prescribe an interval');
    assert.match(t.text('status'), /Choose the date and repeat interval/);
  } finally { t.close(); }
});
