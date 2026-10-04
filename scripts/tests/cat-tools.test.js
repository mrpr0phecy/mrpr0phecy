#!/usr/bin/env node
'use strict';
// Run: node scripts/tests/cat-tools.test.js (jsdom installed in /tmp/tenv).
//
// The five Cats & Feline Care cards added 2026-10-04 are read by owners making
// feeding and safety decisions, so the numbers they print have to be the ones
// the sources give. `scripts/test-card.js` proves the cards mount; it cannot
// prove that a 4.5 kg neutered cat comes out at 260 kcal a day, that a kitten
// born on 1 June 2026 has its microchip deadline on 19 October, or that the
// litter planner answers "two trays for one cat". So the rules are driven here,
// in jsdom, through the real DOM: set the inputs, read the rendered output,
// compare with vectors worked out from the sources named in each card.
//
// Vectors, and where each one comes from:
//   calories  RER = 70 x kg^0.75 (WSAVA Global Nutrition Toolkit) with the
//             life-stage and activity factors the card lists: 4.5 kg x 1.2 =
//             259.5 -> 260 kcal; a target weight of 5.5 kg for weight loss is
//             0.8 x 251.4 = 201 kcal; 10 lb converts to 4.536 kg; a 1 kg kitten
//             under four months is 3 x 70 = 210 kcal. Treats are capped at 10%.
//   age       2021 AAHA/AAFP Feline Life Stage Guidelines: kitten birth-1 year,
//             young adult 1-6, mature adult 7-10, senior over 10; the human
//             conversion used is 15 / +9 / +4 a year, so 3 years 4 months is 29
//             and 14 years 9 months is 75. Kitten milestones: vaccination at
//             8 and 12 weeks, neutering from 4 months, microchipping by 20
//             weeks in England (compulsory since 10 June 2024).
//   hazards   The severity map is asserted through the data the card carries:
//             true lilies and daylilies, permethrin and antifreeze are
//             Emergency; poinsettia is lower risk (the crusty myth); the
//             helpline number printed is Animal PoisonLine 01202 509000.
//   kittens   Gestation is 63-65 days from mating with a 58-70 day window
//             (VCA/PDSA); milestons run from ultrasound around day 21 to the
//             temperature drop at day 60. Kitten milestones are dated from
//             birth: eyes at 7 days, weaning at 4 weeks, rehoming at 8 weeks.
//   litter    AAFP/ISFM and Ohio State guidance: one tray per cat plus one, a
//             tray 1.5 x the cat's nose-to-tail-base length, 3-5 cm of litter,
//             scooped daily and washed weekly. 70 x 50 cm at 4 cm is 14 litres
//             a fill; at 0.85 kg/l that is 11.9 kg of clumping clay.
//
// jsdom is deliberately not a repository dependency (the site is zero-dep), so
// it lives outside the workspace. Without it this suite SKIPs loudly and exits
// 0:   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); } catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.log('SKIP cat-tools: jsdom not installed (mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom)');
    process.exit(0);
  }
}
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const CARDS = path.join(__dirname, '..', '..', 'cards');

function mount(slug) {
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: false
  });
  return dom.window;
}
const tick = () => new Promise(function (resolve) { setTimeout(resolve, 0); });
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  if (e.type === 'checkbox') e.checked = !!value; else e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function text(w, id) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  return e.textContent.replace(/\s+/g, ' ');
}
function num(w, id) {
  const m = text(w, id).match(/-?\d[\d,]*(?:\.\d+)?/);
  assert.ok(m, 'no number in #' + id + ': ' + text(w, id).slice(0, 120));
  return parseFloat(m[0].replace(/,/g, ''));
}

// The cards compare against their own load-time "today"; mirror it so the
// dated assertions talk about the same day.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date();
const TODAY_UTC = new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()));
function dateFromOffset(days) { return new Date(TODAY_UTC.getTime() + days * 86400000); }
function shortFmt(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

(async function run() {

  /* ---- 1. Calories and portions ------------------------------------------ */
  {
    const w = mount('cat-calorie-portion-calculator'); await tick();

    // Defaults: 4.5 kg neutered indoor adult, half dry and half wet.
    assert.equal(num(w, 'ccp-res-kcal'), 260, '4.5 kg neutered cat: RER 216 x 1.2 = 260 kcal a day');
    assert.match(text(w, 'ccp-res-detail'), /216 kcal/, 'the resting energy requirement is shown separately');
    assert.match(text(w, 'ccp-res-detail'), /×1\.2 \(neutered indoor adult\)/, 'the factor used is named');
    assert.match(text(w, 'ccp-res-detail'), /Dry food: 34 g/, 'half the calories as 380 kcal/100 g dry food is 34 g');
    assert.match(text(w, 'ccp-res-detail'), /Wet food: 1\.5 pouches/, 'the other half as 85 kcal pouches is 1.5');
    assert.match(text(w, 'ccp-res-detail'), /Treat budget: up to 26 kcal/, 'treats are 10% of the daily calories');
    assert.match(text(w, 'ccp-res-detail'), /225 ml a day/, 'water guidance is about 50 ml per kg');
    assert.equal(text(w, 'ccp-warn'), '', 'no warnings on the default healthy cat');

    // Weight loss: an 8 kg cat scoring 8-9, planning to 5.5 kg.
    input(w, 'ccp-weight', 8); input(w, 'ccp-bcs', '8-9'); input(w, 'ccp-status', 'loss'); input(w, 'ccp-target', 5.5);
    assert.equal(num(w, 'ccp-res-kcal'), 201, 'weight loss: 0.8 x RER(5.5 kg) = 0.8 x 251.4 = 201 kcal');
    assert.match(text(w, 'ccp-res-detail'), /calculated on the target weight of 5\.5 kg/, 'the plan says it is based on the target weight, not the current one');
    assert.match(text(w, 'ccp-res-detail'), /1–2% of body weight a week/, 'the safe rate of loss is stated');
    assert.match(text(w, 'ccp-res-detail'), /80–160 g a week/, 'the rate is converted into grams for this cat');
    assert.match(text(w, 'ccp-warn'), /more than 30% below the current weight/, 'an aggressive target is flagged');

    // Weight loss on a cat that does not need it must be refused.
    input(w, 'ccp-weight', 4); input(w, 'ccp-bcs', '4-5'); input(w, 'ccp-target', 3.8);
    assert.match(text(w, 'ccp-warn'), /only for a cat scoring 6 or more/, 'a weight-loss plan is blocked for an ideal-weight cat');

    // An overweight cat on a maintenance plan is nudged to the plan.
    input(w, 'ccp-status', 'neutered'); input(w, 'ccp-bcs', '7'); input(w, 'ccp-weight', 6);
    assert.match(text(w, 'ccp-warn'), /looks overweight/, 'a BCS of 7 prompts the weight-loss plan');
    assert.match(text(w, 'ccp-warn'), /5\.0 kg/, 'the ideal weight is estimated from the body condition score');

    // Pounds, and a kitten.
    input(w, 'ccp-unit', 'lb'); input(w, 'ccp-weight', 10); input(w, 'ccp-bcs', '4-5'); input(w, 'ccp-status', 'neutered');
    assert.equal(num(w, 'ccp-res-kcal'), 261, '10 lb is 4.536 kg: RER 218 x 1.2 = 261 kcal');
    input(w, 'ccp-unit', 'kg'); input(w, 'ccp-weight', 1); input(w, 'ccp-status', 'kitten1');
    assert.equal(num(w, 'ccp-res-kcal'), 210, 'a 1 kg kitten under four months needs 3 x RER = 210 kcal');
    assert.match(text(w, 'ccp-res-detail'), /kitten under 4 months/, 'the kitten factor is named');
    input(w, 'ccp-status', 'lactating');
    assert.match(text(w, 'ccp-warn'), /fed to appetite/, 'nursing queens get the feed-to-appetite warning');
    w.close();
    console.log('PASS calories — RER/MER by weight, unit conversion, body condition, weight-loss safety rails, kitten and queen factors.');
  }

  /* ---- 2. Age and life stage --------------------------------------------- */
  {
    const w = mount('cat-age-life-stage-calculator'); await tick();
    input(w, 'cas-asat', '2026-10-04');

    input(w, 'cas-dob', '2023-06-01');
    assert.match(text(w, 'cas-res-human'), /^29 human years/, '3 years 4 months maps to 29 human years');
    assert.match(text(w, 'cas-res-detail'), /3 years 4 months/, 'the cat age is spelled out');
    assert.match(text(w, 'cas-res-detail'), /Young adult \(1–6 years\)/, '3 years 4 months is a young adult');
    assert.match(text(w, 'cas-res-detail'), /at least once a year/, 'young adults are seen annually');

    // A kitten born 1 June 2026 is four months old on 4 October 2026.
    input(w, 'cas-dob', '2026-06-01');
    assert.match(text(w, 'cas-res-human'), /^5\.0 human years/, 'a four-month-old kitten is about 5 in human years');
    assert.match(text(w, 'cas-res-detail'), /Kitten \(birth to 1 year\)/, 'the kitten life stage is named');
    assert.match(text(w, 'cas-res-detail'), /First core vaccination — 8 weeks: 27 Jul 2026/, '8 weeks after 1 June 2026 is 27 July');
    assert.match(text(w, 'cas-res-detail'), /Second core vaccination — 12 weeks: 24 Aug 2026/, '12 weeks is 24 August');
    assert.match(text(w, 'cas-res-detail'), /Microchip deadline in England — 20 weeks \(up to £500 if missed\): 19 Oct 2026/, '20 weeks is 19 October');

    // A senior cat, and the screening prompt that comes with it.
    input(w, 'cas-dob', '2012-01-01');
    assert.match(text(w, 'cas-res-human'), /^75 human years/, '14 years 9 months is about 75 human years');
    assert.match(text(w, 'cas-res-detail'), /Senior \(over 10 years\)/, 'that is the senior stage');
    assert.match(text(w, 'cas-res-detail'), /every 6 months/, 'seniors are seen at least twice a year');
    assert.match(text(w, 'cas-warn'), /baseline bloods/, 'the senior warning asks for bloods and blood pressure');

    // Age-only mode for rescue cats.
    input(w, 'cas-mode', 'age'); input(w, 'cas-years', 8); input(w, 'cas-months', 0);
    assert.match(text(w, 'cas-res-human'), /^48 human years/, 'age mode: 8 years is 48 human years');
    assert.match(text(w, 'cas-res-detail'), /Mature adult \(7–10 years\)/, '8 years is a mature adult');
    input(w, 'cas-months', 6);
    assert.match(text(w, 'cas-res-human'), /^50 human years/, '8 years 6 months rounds to 50');
    input(w, 'cas-years', 1); input(w, 'cas-months', 0);
    assert.match(text(w, 'cas-res-human'), /^15\.0 human years/, 'one cat year is about 15 human years');
    input(w, 'cas-years', 2);
    assert.match(text(w, 'cas-res-human'), /^24 human years/, 'two cat years is about 24');

    // A future date is caught, not silently rendered.
    input(w, 'cas-mode', 'dob'); input(w, 'cas-dob', '2027-01-01');
    assert.match(text(w, 'cas-warn'), /after the "as at" date/, 'a birth date after the as-at date warns rather than computing');
    w.close();
    console.log('PASS age — life stages, the 15/+9/+4 conversion, dated kitten milestones and the senior screening prompt.');
  }

  /* ---- 3. Poison and hazard checker -------------------------------------- */
  {
    const w = mount('cat-poison-household-hazard-checker'); await tick();
    const body = w.document.body.textContent.replace(/\s+/g, ' ');

    assert.match(text(w, 'cph-count'), /Showing (\d+) of \1 entries/, 'the full list is shown by default');
    assert.match(body, /01202 509000/, 'the Animal PoisonLine number is on the card');
    assert.match(body, /do not give milk, oil or charcoal/i, 'the first-aid panel refuses home remedies');

    input(w, 'cph-query', 'lily');
    assert.match(text(w, 'cph-count'), /Showing 4 of \d+ entries/, 'lily matches the four entries carrying it');
    const lilies = text(w, 'cph-list');
    assert.match(lilies, /True lilies and daylilies/, 'the true lily entry is in the list');
    assert.match(lilies, /kidney failure/, 'and it explains the kidney risk');
    assert.match(lilies, /Lily of the valley/, 'lily of the valley is separate');
    assert.match(lilies, /Peace lily and calla lily/, 'the harmless namesake is listed too');
    assert.match(lilies, /EmergencyTrue lilies and daylilies/, 'the true lily entry is an emergency');
    assert.match(lilies, /EmergencyLily of the valley/, 'so is lily of the valley, which is not a true lily');
    assert.match(lilies, /CautionPeace lily and calla lily/, 'while the peace lily is only a caution');

    input(w, 'cph-query', 'permethrin');
    assert.match(text(w, 'cph-count'), /Showing 1 of \d+ entries/, 'permethrin is one entry');
    assert.match(text(w, 'cph-list'), /EmergencyPermethrin/, 'permethrin is an emergency');
    assert.match(text(w, 'cph-list'), /Wash the coat/, 'the action says to wash the coat before travelling');

    input(w, 'cph-query', 'poinsettia');
    assert.match(text(w, 'cph-list'), /Lower riskPoinsettia/, 'poinsettia is the myth entry, not an emergency');
    input(w, 'cph-query', 'chocolate');
    assert.match(text(w, 'cph-list'), /UrgentChocolate/, 'chocolate is urgent, not an emergency');
    input(w, 'cph-query', 'antifreeze');
    assert.match(text(w, 'cph-list'), /EmergencyAntifreeze/, 'antifreeze is an emergency');

    input(w, 'cph-query', ''); input(w, 'cph-class', 'Medicines');
    assert.match(text(w, 'cph-count'), /Showing 8 of \d+ entries in Medicines/, 'the category filter narrows to the medicines');
    input(w, 'cph-query', 'zzzzz');
    assert.match(text(w, 'cph-count'), /Showing 0 of \d+ entries/, 'an empty result says so');
    assert.match(text(w, 'cph-list'), /01202 509000/, 'and points at the helpline rather than leaving a blank screen');
    w.close();
    console.log('PASS hazards — 53-entry severity map, search, category filter, the myth entries and the UK helpline.');
  }

  /* ---- 4. Pregnancy and kittens ------------------------------------------ */
  {
    const w = mount('cat-pregnancy-kitten-timeline'); await tick();

    // A queen mated 30 days ago: due 63-65 days after mating.
    input(w, 'cpk-mating', dateFromOffset(-30).toISOString().slice(0, 10));
    assert.equal(text(w, 'cpk-res-hero').trim(), shortFmt(dateFromOffset(33)) + ' – ' + shortFmt(dateFromOffset(35)),
      'the due window is day 63 to day 65 after mating');
    assert.match(text(w, 'cpk-res-detail'), /day 30 of the pregnancy/, 'today is counted from the mating date');
    assert.match(text(w, 'cpk-res-detail'), /day 58–70/, 'the viable window is stated');
    assert.match(text(w, 'cpk-res-detail'), /X-ray from about now gives the most accurate kitten count/, 'the day 42 milestone is on the list');
    assert.match(text(w, 'cpk-res-detail'), /Day 42 · /, 'milestones are dated');
    assert.equal(text(w, 'cpk-warn'), '', 'no alarm at day 30');

    // Inside the due window, and overdue.
    input(w, 'cpk-mating', dateFromOffset(-59).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-warn'), /inside the due window/, 'day 59 prompts the ready-for-labour warning');
    input(w, 'cpk-mating', dateFromOffset(-75).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-warn'), /past the normal range of 58–70 days/, 'day 75 tells the owner to ring the vet');
    input(w, 'cpk-mating', dateFromOffset(5).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-res-detail'), /mating date is in the future/, 'a future mating date is refused');

    // Kitten mode: eyes open at 7 days, weaning at 4 weeks.
    input(w, 'cpk-mode', 'kittens'); input(w, 'cpk-birth', dateFromOffset(-10).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-res-hero'), /^1 week 3 days old/, 'ten days is one week and three days');
    assert.match(text(w, 'cpk-res-detail'), /Day 7 · .*Eyes begin to open/, 'the eyes-open milestone is dated');
    assert.match(text(w, 'cpk-res-detail'), /non-clumping litter/, 'the kitten-safe litter note is present');
    input(w, 'cpk-birth', dateFromOffset(-5).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-warn'), /not leave the queen before 8 weeks/, 'a five-day-old litter is not leaving yet');
    assert.match(text(w, 'cpk-warn'), /cannot toilet or regulate its temperature/, 'the neonatal care warning fires');
    input(w, 'cpk-birth', dateFromOffset(-130).toISOString().slice(0, 10));
    assert.match(text(w, 'cpk-warn'), /legal requirement in England by 20 weeks/, '130 days is inside the microchip window');
    w.close();
    console.log('PASS kittens — gestation window from the mating date, dated milestones, labour prompts and the kitten timeline.');
  }

  /* ---- 5. Litter and trays ----------------------------------------------- */
  {
    const w = mount('cat-litter-tray-planner'); await tick();

    // Defaults: one cat, a 45 cm cat, the XL tray.
    assert.equal(num(w, 'clt-res-trays'), 2, 'one cat needs two trays (n+1)');
    const d = text(w, 'clt-res-detail');
    assert.match(d, /1 cat \+ 1 = 2 trays, in separate places/, 'the rule is spelled out');
    assert.match(d, /68 cm for a 45 cm cat/, 'the minimum tray length is 1.5 x the cat');
    assert.match(d, /14\.0 L — about 11\.9 kg of clumping clay/, '70 x 50 cm at 4 cm is 14 L, 11.9 kg at 0.85 kg/L');
    assert.match(d, /every 4 weeks for clumping clay/, 'clumping clay is changed monthly');
    assert.match(d, /about 4\.3 × 10 L bags|4\.3 × 10 L bags/, 'the monthly bag count is shown');
    assert.match(d, /bags/, 'and the yearly bag count');
    assert.equal(text(w, 'clt-warn'), '', 'the default setup raises no warnings');

    // Three cats.
    input(w, 'clt-cats', 3);
    assert.equal(num(w, 'clt-res-trays'), 4, 'three cats need four trays');
    assert.match(text(w, 'clt-warn'), /different rooms/, 'multi-cat households are told to spread the trays');
    assert.match(text(w, 'clt-res-detail'), /twice a day with 3 cats/, 'scooping frequency rises with the household');

    // A shop-standard tray is too small; shallow litter and non-clumping changes are flagged.
    input(w, 'clt-tray', '50x40'); input(w, 'clt-depth', 3); input(w, 'clt-litter', 'nonclay');
    assert.match(text(w, 'clt-warn'), /smaller than the 1\.5 × nose-to-tail-base guideline/, 'a 50 x 40 cm tray is too small for a 45 cm cat');
    assert.match(text(w, 'clt-warn'), /At 3 cm the litter is shallow/, '3 cm is called out as shallow');
    assert.match(text(w, 'clt-res-detail'), /6\.0 L — about 3\.6 kg of non-clumping clay/, '50 x 40 at 3 cm is 6 L, 3.6 kg');
    assert.match(text(w, 'clt-res-detail'), /every week for non-clumping clay/, 'non-clumping litter is changed weekly');

    // Cost follows the bag price.
    input(w, 'clt-bag', 10); input(w, 'clt-price', 12);
    assert.match(text(w, 'clt-res-detail'), /£/, 'a cost is shown once a price is entered');
    w.close();
    console.log('PASS litter — n+1 trays, 1.5x sizing, litres and kilos per fill, change cadence, bag counts and cost.');
  }

  console.log('ALL CAT TOOL TESTS PASSED');
})().catch(function (err) {
  console.error('CAT TOOL TESTS FAILED');
  console.error(err && err.stack || err);
  process.exit(1);
});
