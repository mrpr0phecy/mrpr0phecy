// Regression tests for the five gap-fill tools added 2026-09-14:
// adhd-time-task-lab, ingredient-label-allergen-decoder, knitting-crochet-yarn-studio,
// tinnitus-hearing-relief-studio, uk-childcare-cost-calculator.
//
//   node scripts/tests/gap-fill-tools.test.js
//
// These are not smoke tests (scripts/test-card.js already mounts every card and
// proves it does not throw). These drive the real card source in a DOM and
// assert the NUMBERS, because the value of each tool is arithmetic that can rot
// silently: a childcare cap, a yarn density, a median multiplier. If one of
// those changes, this fails and says which one.
//
// Needs jsdom, installed OUTSIDE the workspace (AGENTS.md §2):
//   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
// Skipped with a NOTE (not a failure) when jsdom is absent, so a machine
// without it is not blocked from pushing.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');

let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try {
    ({ JSDOM } = require('jsdom'));
  } catch (e) {
    console.log('NOTE: jsdom not installed — gap-fill tool tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom');
    process.exit(0);
  }
}

const SHELL = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="grid"></div></body></html>`;

// Mount a card fragment the way index.html does: parse, strip the scripts,
// append the body, then run each script with document.currentScript pointed at
// an element inside the container (every card scopes itself off
// document.currentScript.parentNode).
function mount(slug) {
  const file = path.join(CARDS, slug + '.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(SHELL, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/',
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
      const store = {};
      const ls = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        get length() { return Object.keys(store).length; },
      };
      Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
    },
  });
  const { window } = dom;
  const doc = window.document;
  const host = doc.getElementById('grid');

  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach(s => s.remove());
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = parsed.body.innerHTML;
  host.appendChild(wrapper);

  for (const s of scripts) {
    const el = doc.createElement('script');
    Array.from(s.attributes).forEach(a => el.setAttribute(a.name, a.value));
    host.appendChild(el);
    Object.defineProperty(doc, 'currentScript', { value: el, configurable: true });
    window.eval(s.textContent);
  }

  const api = {
    window,
    doc,
    $: id => doc.getElementById(id),
    text: id => doc.getElementById(id).textContent.replace(/\s+/g, ' ').trim(),
    set(id, value) {
      const el = doc.getElementById(id);
      el.value = String(value);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    check(id, on) {
      const el = doc.getElementById(id);
      el.checked = !!on;
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    click(id) { doc.getElementById(id).click(); },
    clickAll(sel, fn) {
      Array.from(doc.querySelectorAll(sel)).forEach(fn);
    },
  };
  return api;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// A card renders a value cell as <div>label</div><div>value</div>, so
// textContent reads "Funded hours15 h/week" with no separator. Every
// label→value assertion goes through here rather than hand-rolled regexes.
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function expect(t, id, label, value, why) {
  const re = new RegExp(escapeRe(label) + '\\s*' + escapeRe(value));
  assert.match(t.text(id), re, why || `${label} = ${value}`);
}
function expectNot(t, id, value, why) {
  assert.doesNotMatch(t.text(id), new RegExp(escapeRe(value)), why);
}

// ---------------------------------------------------------------- ADHD lab
test('adhd-time-task-lab: learns a median multiplier from the log and translates a guess', () => {
  const t = mount('adhd-time-task-lab');
  assert.match(t.text('atla-stats'), /×2\.5 \(default\)/, 'starts on the documented default');

  t.set('atla-est', 10); t.set('atla-act', 20); t.click('atla-add');
  t.set('atla-est', 10); t.set('atla-act', 30); t.click('atla-add');
  assert.match(t.text('atla-stats'), /×2\.5/, 'median of 2.0 and 3.0 is 2.5');
  assert.match(t.text('atla-log'), /10 → 30 min \(×3\.0\)/, 'log shows the ratio');

  t.set('atla-guess', 10);
  expect(t, 'atla-trans-out', '“10 minutes” really means', '25 min', 'guess × multiplier');

  // leaving at 09:00 with a 10-minute prep guess: 25 min → 08:35
  t.set('atla-prep', 10); t.set('atla-leave', '09:00');
  expect(t, 'atla-trans-out', 'Start getting ready at', '08:35', 'real start time');
  expect(t, 'atla-trans-out', 'Your guess would have said', '08:50', 'and the naive one');

  t.set('atla-stuck', 'Write the report');
  t.click('atla-build');
  const ladder = t.text('atla-ladder');
  assert.match(ladder, /Open the file, the form, the cupboard/, 'rung 1');
  assert.match(ladder, /deliberately bad version of write the report/, 'rung 2 uses the task');
  assert.match(ladder, /Body double/, 'rung 4');
});

// ---------------------------------------------------------------- allergens
test('ingredient-label-allergen-decoder: names hidden allergens, E-numbers and advisories', () => {
  const t = mount('ingredient-label-allergen-decoder');
  t.click('ilad-sample');
  const out = t.text('ilad-out');

  assert.match(out, /wheat flour/, 'label text echoed');
  assert.match(out, /Gluten cereals/, 'wheat flour → gluten');
  assert.match(out, /Milk/, 'whey powder and dried skimmed milk → milk');
  assert.match(out, /E322/, 'E-number reported');
  assert.match(out, /usually soya/, 'E322 explained as soya');
  expect(t, 'ilad-out', 'Advisory warnings', '1', 'may-contain wording detected');
  assert.match(out, /may contain/, 'the advisory phrase itself');

  // plant milks must NOT be reported as milk
  t.$('ilad-text').value = 'Water, coconut milk, rice starch, sea salt.';
  t.$('ilad-text').dispatchEvent(new t.window.Event('input', { bubbles: true }));
  const plant = t.text('ilad-out');
  expectNot(t, 'ilad-out', '🥛 Milk', 'coconut milk is not dairy');
  expectNot(t, 'ilad-out', '🌾 Gluten', 'rice starch is not wheat');

  // trade names
  t.$('ilad-text').value = 'arachis oil, tahini, caseinate, lupin flour, sulphur dioxide';
  t.$('ilad-text').dispatchEvent(new t.window.Event('input', { bubbles: true }));
  const trade = t.text('ilad-out');
  ['Peanut', 'Sesame', 'Milk', 'Lupin', 'Sulphites'].forEach(name => {
    assert.match(trade, new RegExp(name), `${name} named from its trade name`);
  });

  // vegan scan is opt-in
  t.$('ilad-text').value = 'Sugar, gelatine, water.';
  t.$('ilad-text').dispatchEvent(new t.window.Event('input', { bubbles: true }));
  expectNot(t, 'ilad-out', 'animal setting agent', 'vegan scan off by default');
  t.check('ilad-vegan', true);
  assert.match(t.text('ilad-out'), /animal setting agent/, 'on when ticked');
});

// ---------------------------------------------------------------- yarn studio
test('knitting-crochet-yarn-studio: cast-on, resizing, swatch-weight yarn and gauge maths', () => {
  const t = mount('knitting-crochet-yarn-studio');
  assert.match(t.text('kcys-gauge-out'), /22\.0 sts and 30\.0 rows per 10 cm/, 'gauge from the swatch');

  t.set('kcys-width', 50);
  expect(t, 'kcys-p1-out', 'Cast on', '110', '50 cm at 22 sts/10 cm');
  t.set('kcys-length', 180);
  expect(t, 'kcys-p1-out', 'Rows to work', '540', '180 cm at 30 rows/10 cm');

  // pattern says 100 sts at 20 sts/10 cm, you knit to 22 → 110
  t.set('kcys-pat-sts', 100); t.set('kcys-pat-g', 20);
  expect(t, 'kcys-p1-out', 'Cast on instead of 100', '110', 'pattern resized to my gauge');

  // weighing method: 10×10 cm swatch at 5 g → 100×150 cm = 750 g → 1,800 m at 240 m/100 g
  t.set('kcys-sw-g', 5);
  t.set('kcys-y-w', 100); t.set('kcys-y-l', 150);
  const yarn = t.text('kcys-p2-out');
  expect(t, 'kcys-p2-out', 'Yarn needed', '1,800 m / 750 g', 'yarn from a weighed swatch');
  expect(t, 'kcys-p2-out', 'Balls to buy', '9', '750 g + 10% waste, in 100 g balls');
  t.check('kcys-usew', false);
  assert.match(t.text('kcys-p2-out'), /stitch estimate/, 'falls back to the estimate without a weight');

  t.set('kcys-lo-g', 42); t.set('kcys-lo-m', 240); t.set('kcys-lo-need', 600);
  expect(t, 'kcys-p3-out', 'In this ball', '101 m', '42 g at 240 m/100 g');
  expect(t, 'kcys-p3-out', 'That is', '17% of it', 'against a 600 m target');

  t.set('kcys-wpi', 14);
  expect(t, 'kcys-p4-out', 'Yarn weight', 'Light / DK (3)', '14 wraps per inch is DK');
  t.set('kcys-mm', 4);
  expect(t, 'kcys-p4-out', '4 mm is', 'US 6', 'needle conversion');
});

// ---------------------------------------------------------------- tinnitus
test('tinnitus-hearing-relief-studio: controls render and update without an audio context', () => {
  const t = mount('tinnitus-hearing-relief-studio');
  assert.strictEqual(t.doc.querySelectorAll('.thrs-scape').length, 8, 'eight soundscapes');
  assert.strictEqual(t.doc.querySelectorAll('.thrs-timer').length, 5, 'five timer presets');
  assert.match(t.text('thrs-safe'), /85 dB/, 'exposure table present');
  assert.match(t.text('thrs-safe'), /8 hours/, 'and the 8-hour limit at 85 dB');
  assert.match(t.text('thrs-state'), /Not running/, 'does not autoplay');

  // Regression: the read-outs used to be frozen until an AudioContext existed,
  // so the sliders looked dead until you pressed start.
  t.set('thrs-vol', 40);
  assert.strictEqual(t.text('thrs-vol-val'), '40%', 'volume read-out tracks the slider');
  t.set('thrs-freq', 8000);
  assert.strictEqual(t.text('thrs-freq-val'), '8.0 kHz', 'pitch read-out formats kHz');
  t.set('thrs-depth', 12);
  assert.strictEqual(t.text('thrs-depth-val'), '12 dB', 'notch depth read-out');
  t.set('thrs-tone', 90);
  assert.strictEqual(t.text('thrs-tone-val'), 'bright', 'tone read-out');
});

// ---------------------------------------------------------------- childcare
test('uk-childcare-cost-calculator: funded hours, both schemes and the caps', () => {
  const t = mount('uk-childcare-cost-calculator');
  // £300/week for 50 h over 51 weeks; 15 funded hours term-time only.
  let out = t.text('uccc-out');
  expect(t, 'uccc-out', 'Funded hours', '15 h/week', 'entitlement');
  assert.match(out, /570 h a year/, '15 h × 38 weeks');
  expect(t, 'uccc-out', 'Value of those funded hours', '−£3,420', '570 h at £6.00');
  expect(t, 'uccc-out', 'Gross bill', '£15,300', '£300 × 51 weeks');
  expect(t, 'uccc-out', 'Left to pay for childcare', '£11,880', 'gross less the funded value');
  expect(t, 'uccc-out', 'Tax-Free Childcare', '−£2,000', '20% of £11,880 is £2,376, capped at £2,000');
  expect(t, 'uccc-out', 'Your real annual bill', '£10,645', 'minus help, plus £765 of consumables');
  expect(t, 'uccc-out', 'Effective hourly rate you pay', '£4.17', 'net over 2,550 hours');
  assert.match(out, /13 weeks are not covered/, 'the 38-week gap is called out');

  // Universal Credit: 85%, and a far higher cap
  t.set('uccc-scheme', 'uc');
  out = t.text('uccc-out');
  expect(t, 'uccc-out', 'Universal Credit childcare', '−£10,098', '85% of £11,880, under the £12,853 cap');
  expect(t, 'uccc-out', 'Your real annual bill', '£2,547', 'and the bill collapses');
  assert.match(out, /45% after the UC taper/, 'extra earnings are tapered on UC');

  // the £100k cliff kills the working entitlement, not the universal one
  t.set('uccc-scheme', 'tfc');
  t.set('uccc-band', 30);
  t.set('uccc-funded-h', 30);
  expect(t, 'uccc-out', 'Funded hours', '30 h/week', 'working entitlement before the cliff');
  t.check('uccc-100k', true);
  out = t.text('uccc-out');
  expect(t, 'uccc-out', 'Funded hours', '15 h/week', 'cliff drops it to the universal 15');
  assert.match(out, /Over £100,000 adjusted net income/, 'and says why');

  // two children raise the TFC cap
  t.check('uccc-100k', false);
  t.set('uccc-kids', 2);
  assert.match(t.text('uccc-out'), /capped at £4,000 a year for 2 children/, 'cap scales with children');
});

// ---------------------------------------------------------------- parking
test('uk-parking-appeal-builder: deadlines, expected value and the right appeal body', () => {
  const t = mount('uk-parking-appeal-builder');
  // Private charge issued 1 Sept 2026: 28-day appeal, 14-day discount.
  t.set('upab-kind', 'private');
  t.set('upab-issued', '2026-09-01');
  t.set('upab-amount', 100);
  t.set('upab-discount', 60);
  t.set('upab-win', 40);
  let out = t.text('upab-out');
  assert.match(out, /First appeal to the operator due/, 'private route named');
  assert.match(out, /Tuesday 29 September 2026/, '28 days from issue');
  assert.match(out, /Tuesday 15 September 2026/, '14 days from issue');
  expect(t, 'upab-out', 'Expected cost of fighting', '£60', '100 × (1 − 40%)');
  assert.match(out, /coin flip/, 'a 60-vs-60 expected value is called a draw');
  assert.match(out, /POPLA ~40%/, 'published win rates quoted');

  // ticking a ground writes it into the letter, and the private letter puts
  // keeper liability and PoFA in front of the operator
  const cb = Array.from(t.doc.querySelectorAll('.upab-g'))
    .find(x => x.getAttribute('data-k') === 'keeper');
  cb.checked = true;
  cb.dispatchEvent(new t.window.Event('change', { bubbles: true }));
  const letter = t.$('upab-letter').value;
  assert.match(letter, /Protection of Freedoms Act 2012/, 'PoFA cited');
  assert.match(letter, /no obligation to identify the driver/, 'driver not named');
  assert.match(letter, /Notice to Keeper/, 'the ground itself is written out');

  // a council PCN escalates by 50% at the Charge Certificate stage.
  // Switching type loads council defaults, so the fare is re-set explicitly.
  t.set('upab-kind', 'council');
  t.set('upab-amount', 100);
  out = t.text('upab-out');
  expect(t, 'upab-out', 'If you fight and lose', '£150', 'full amount +50%');
  assert.match(out, /Charge Certificate/, 'and says why');
  assert.match(out, /Informal challenge/, 'council informal stage named');
});

// ---------------------------------------------------------------- rail
test('rail-delay-repay-calculator: bands for single, return and season tickets', () => {
  const t = mount('rail-delay-repay-calculator');
  t.set('rdrc-date', '2026-09-01');
  t.set('rdrc-delay', 38);

  t.set('rdrc-ticket', 'single'); t.set('rdrc-fare', 42);
  expect(t, 'rdrc-out', 'Compensation', '£21.00', '50% of a £42 single');
  expect(t, 'rdrc-out', 'Your band', '30–59 minutes', '38 minutes sits here');
  assert.match(t.text('rdrc-out'), /29 September/, '28 days from travel');

  t.set('rdrc-ticket', 'return'); t.set('rdrc-fare', 84);
  expect(t, 'rdrc-out', 'Compensation', '£21.00', '25% of an £84 return');

  t.set('rdrc-ticket', 'week'); t.set('rdrc-fare', 100);
  expect(t, 'rdrc-out', 'Compensation', '£5.00', '50% of one day of a weekly season');

  t.set('rdrc-delay', 125); t.set('rdrc-ticket', 'return'); t.set('rdrc-fare', 84);
  expect(t, 'rdrc-out', 'Compensation', '£84.00', '120+ minutes refunds the whole return');

  t.set('rdrc-delay', 7);
  assert.match(t.text('rdrc-out'), /Nothing to claim at 7 minutes/, 'below the threshold');
  t.set('rdrc-scheme', 30); t.set('rdrc-delay', 20);
  assert.match(t.text('rdrc-out'), /starts paying at 30 minutes/, 'DR30 operators');
});

// ---------------------------------------------------------------- gift aid
test('gift-aid-calculator: 25p uplift, higher-rate relief and the tax-paid rule', () => {
  const t = mount('gift-aid-calculator');
  // £100 a month = £1,200 a year
  expect(t, 'gaac-out', 'You give a year', '£1,200');
  expect(t, 'gaac-out', 'Charity claims', '+£300', '25p per £1');
  expect(t, 'gaac-out', 'Charity receives', '£1,500');
  expect(t, 'gaac-out', 'You claim back', '£0', 'basic-rate donors get nothing back');

  t.set('gaac-band', 40);
  expect(t, 'gaac-out', 'You claim back', '£300', '40% − 20% on the £1,500 gross');
  expect(t, 'gaac-out', 'It really costs you', '£900', '£1,200 less £300');

  t.set('gaac-band', 45);
  expect(t, 'gaac-out', 'You claim back', '£375', '45% − 20% on the gross');

  // the donor must have paid at least 25% of everything they Gift Aid
  t.set('gaac-band', 20);
  t.set('gaac-tax', 100);
  assert.match(t.text('gaac-out'), /Do not tick the Gift Aid box/, 'shortfall warning');
  assert.match(t.text('gaac-out'), /short by £200/, 'and by how much');
  t.set('gaac-tax', 6000);
  assert.doesNotMatch(t.text('gaac-out'), /Do not tick the Gift Aid box/, 'enough tax paid');

  // GASDS cap: £2,000 top-up ceiling
  t.set('gaac-small', 12000);
  assert.match(t.text('gaac-out'), /Small donations scheme: £2,000 a year/, 'capped at £2,000');
  assert.match(t.text('gaac-out'), /only the first £8,000/, 'and £8,000 of donations');
});

// ---------------------------------------------------------------- negotiation
test('negotiation-prep-studio: anchor, zone of agreement and the walk-away warning', () => {
  const t = mount('negotiation-prep-studio');
  expect(t, 'ngps-out', 'Your anchor', '£59,800 a year', 'target × 1.15');
  expect(t, 'ngps-out', 'Zone of agreement', '£46,000 a year – £55,000 a year', 'floor to ceiling');
  expect(t, 'ngps-out', 'Likely landing point', '£49,000 a year', 'midpoint');
  const brief = t.$('ngps-brief').value;
  assert.match(brief, /NEGOTIATION BRIEF — SALARY FOR A NEW ROLE/, 'brief header');
  assert.match(brief, /My BATNA:/, 'BATNA carried into the brief');
  assert.match(brief, /Silence after they speak is mine to keep/, 'the tactics are in there');

  // no overlap: floor above their ceiling is not a negotiation
  t.set('ngps-walk', 60000);
  assert.match(t.text('ngps-out'), /none/, 'no zone of agreement');
  assert.match(t.text('ngps-out'), /You cannot win this one by arguing/, 'and says so');

  // they open below your floor → the brief tells you to leave
  t.set('ngps-walk', 46000);
  t.set('ngps-their', 40000);
  assert.match(t.$('ngps-brief').value, /below what I can accept/, 'script for a lowball');
});

// ---------------------------------------------------------------- latex
test('latex-table-maths-studio: table generation and correct escaping order', () => {
  const t = mount('latex-table-maths-studio');
  const code = t.$('ltms-code').value;
  assert.match(code, /\\begin\{tabular\}\{@\{\}lrrr@\{\}\}/, 'text left, numeric right');
  assert.match(code, /\\toprule/, 'booktabs rules');
  assert.match(code, /\\textbf\{Metric\}/, 'header row boldened');
  assert.match(code, /\$48\$ & \$51\$/, 'numbers wrapped in maths mode');
  assert.match(code, /\\midrule/, 'rule under the header');

  // Regression: escaping the backslash first used to corrupt its own braces
  // ("C:\textbackslash\{\}Users" instead of "C:\textbackslash{}Users").
  const escaped = t.$('ltms-escaped').value;
  assert.match(escaped, /C:\\textbackslash\{\}Users/, 'backslashes escaped cleanly');
  assert.doesNotMatch(escaped, /textbackslash\\\{\\\}/, 'no double-escaped braces');
  assert.match(escaped, /100\\% of files/, 'percent escaped');
  assert.match(escaped, /ada\\_lovelace/, 'underscore escaped');
  assert.match(escaped, /\\textasciitilde\{\}2hrs/, 'tilde escaped');

  t.set('ltms-in', 'Name\tScore\nAda\t93\nAlan\t88');
  t.check && t.check('ltms-header', true);
  const two = t.$('ltms-code').value;
  assert.match(two, /@\{\}lr@\{\}/, 'two columns, second one numeric');
  assert.match(two, /\\textbf\{Name\}/, 'header taken from the first row');
});

// ---------------------------------------------------------------- runner
let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message.split('\n')[0]}`);
  }
}
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — ${tests.length - failed}/${tests.length} gap-fill tool tests`);
process.exit(failed ? 1 : 0);
