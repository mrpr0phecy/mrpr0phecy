'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  ({ JSDOM } = require('jsdom'));
}

async function mount(slug) {
  const html = fs.readFileSync(path.join(__dirname, '../../cards', slug + '.html'), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', { runScripts: 'dangerously' });
  if (dom.window.document.readyState !== 'complete') {
    await new Promise(r => dom.window.addEventListener('load', r, { once: true }));
  }
  await new Promise(r => setTimeout(r, 10));
  return dom;
}

const setVal = (d, id, v) => {
  const el = d.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
};
const click = (d, id) => d.getElementById(id).click();
const txt = (d, id) => d.getElementById(id).textContent;

test('1. christmas-dinner-oven-tetris computes schedule, rest window and overload warning', async () => {
  const dom = await mount('christmas-dinner-oven-tetris');
  const d = dom.window.document;
  assert.match(txt(d, 'cdot-banner'), /Zero-clash plan locked/);
  assert.match(txt(d, 'cdot-stat-rest'), /45 min/);
  assert.ok(d.querySelectorAll('#cdot-svg rect').length >= 4, 'renders SVG oven zones');

  // Trigger overload with 18 guests on single oven
  setVal(d, 'cdot-guests', 18);
  click(d, 'cdot-run');
  assert.match(txt(d, 'cdot-banner'), /Shelf overload/);

  // Switching to double oven clears overload
  setVal(d, 'cdot-oven', 'double');
  click(d, 'cdot-run');
  assert.match(txt(d, 'cdot-banner'), /Zero-clash plan locked/);
  dom.window.close();
});

test('2. wrapping-paper-cut-calculator detects 45-degree diagonal narrow-roll rescue and unit conversion', async () => {
  const dom = await mount('wrapping-paper-cut-calculator');
  const d = dom.window.document;
  assert.match(txt(d, 'wpcc-cut-std'), /cm/);

  click(d, 'wpcc-preset-rescue');
  assert.match(txt(d, 'wpcc-banner'), /45° Diagonal Trick Rescues Your Roll/);

  setVal(d, 'wpcc-unit', 'in');
  assert.match(txt(d, 'wpcc-cut-std'), /in/);
  dom.window.close();
});

test('3. christmas-tree-lights-calculator scales LEDs, baubles and electricity cost', async () => {
  const dom = await mount('christmas-tree-lights-calculator');
  const d = dom.window.document;
  assert.match(txt(d, 'ctlc-lights'), /1,650 bulbs/);

  setVal(d, 'ctlc-height', '8');
  setVal(d, 'ctlc-shape', 'full');
  setVal(d, 'ctlc-glow', '350');
  click(d, 'ctlc-run');
  assert.match(txt(d, 'ctlc-lights'), /3,600 bulbs/);
  assert.ok(d.querySelectorAll('#ctlc-svg circle').length >= 20, 'renders glowing bulbs');
  dom.window.close();
});

test('4. white-elephant-game-moderator enforces steal limits, immediate steal-back block and XSS-safe DOM', async () => {
  const dom = await mount('white-elephant-game-moderator');
  const d = dom.window.document;
  setVal(d, 'wegm-players', 'Alice, <img src=x onerror=alert(1)>, Charlie');
  setVal(d, 'wegm-maxsteals', '2');
  click(d, 'wegm-run');
  assert.equal(d.querySelector('#wegm-board img'), null, 'player names treated strictly as text');

  // Player 1 unwraps Gift 1
  setVal(d, 'wegm-giftname', 'Espresso Maker');
  click(d, 'wegm-unwrap');
  assert.equal(d.querySelectorAll('.wegm-gift').length, 1);

  // Player 2 steals Gift 1 -> displaced victim cannot immediately steal back!
  d.querySelector('.wegm-gift button').click();
  assert.match(txt(d, 'wegm-stat-steals'), /^1$/);
  const stealBtnAfter = d.querySelector('.wegm-gift button');
  assert.equal(stealBtnAfter.disabled, true);
  assert.match(stealBtnAfter.textContent, /No Immediate Steal-Back/);
  dom.window.close();
});

test('5. elf-midnight-rescue-planner personalises note safely and tracks 24 nights', async () => {
  const dom = await mount('elf-midnight-rescue-planner');
  const d = dom.window.document;
  setVal(d, 'emrp-kid', 'Maya & Leo <b>test</b>');
  setVal(d, 'emrp-time', 'excuse');
  click(d, 'emrp-run');
  assert.match(txt(d, 'emrp-note-text'), /Maya & Leo <b>test<\/b>/);
  assert.equal(d.querySelector('#emrp-note-text b'), null);

  const firstDay = d.querySelector('.emrp-day');
  firstDay.click();
  assert.equal(txt(d, 'emrp-done-count'), '1 / 24');
  click(d, 'emrp-clear-nights');
  assert.equal(txt(d, 'emrp-done-count'), '0 / 24');
  dom.window.close();
});

test('6. christmas-family-bingo-card seeds deterministic cards and detects 5-in-a-row BINGO', async () => {
  const dom = await mount('christmas-family-bingo-card');
  const d = dom.window.document;
  const cells = d.querySelectorAll('.cfbc-cell');
  assert.equal(cells.length, 25);
  assert.equal(cells[12].getAttribute('aria-pressed'), 'true', 'centre FREE square starts stamped');

  // Stamp top row (0..4) -> BINGO!
  for (let i = 0; i < 5; i++) cells[i].click();
  assert.match(txt(d, 'cfbc-banner'), /BINGO!/);
  assert.match(d.getElementById('cfbc-preview').value, /🟨🟨🟨🟨🟨/);

  click(d, 'cfbc-clear');
  assert.doesNotMatch(txt(d, 'cfbc-banner'), /BINGO!/);
  dom.window.close();
});

test('7. christmas-movie-matchmaker-bracket filters age tiers and crowns a bracket champion', async () => {
  const dom = await mount('christmas-movie-matchmaker-bracket');
  const d = dom.window.document;
  assert.doesNotMatch(txt(d, 'cmmb-top4'), /Die Hard/, 'all-ages default excludes 15-rated Die Hard');

  setVal(d, 'cmmb-audience', 'adults');
  setVal(d, 'cmmb-vibe', 'alt');
  click(d, 'cmmb-run');
  assert.match(txt(d, 'cmmb-top4'), /Die Hard/);

  // Vote through QF -> SF -> Final
  for (let q = 0; q < 4; q++) d.querySelectorAll('#cmmb-qf .cmmb-pair')[q].querySelector('button').click();
  for (let s = 0; s < 2; s++) d.querySelectorAll('#cmmb-sf .cmmb-pair')[s].querySelector('button').click();
  d.querySelector('#cmmb-fin .cmmb-pair button').click();
  assert.match(txt(d, 'cmmb-banner'), /TONIGHT'S UNDISPUTED WINNER/);
  dom.window.close();
});

test('8. santa-sleigh-physics-calculator computes Mach, Lorentz/superluminal alerts and payload', async () => {
  const dom = await mount('santa-sleigh-physics-calculator');
  const d = dom.window.document;
  assert.match(txt(d, 'sspc-vel'), /1,158 km\/s/);
  assert.match(txt(d, 'sspc-eiffel-sub'), /67\.7 Eiffel Towers/);

  // Force superluminal speed (> c)
  setVal(d, 'sspc-homes', 2000);
  setVal(d, 'sspc-hop', 10);
  setVal(d, 'sspc-hours', 8);
  click(d, 'sspc-run');
  assert.match(txt(d, 'sspc-banner'), /SUPERLUMINAL ALERT/);
  dom.window.close();
});

test('9. christmas-table-diplomat switches pivot tones, reveals cracker punchline and toggles timer cleanly', async () => {
  const dom = await mount('christmas-table-diplomat');
  const d = dom.window.document;
  setVal(d, 'ctdp-topic', 'romance');
  setVal(d, 'ctdp-tone', 'wit');
  click(d, 'ctdp-run');
  assert.match(txt(d, 'ctdp-scripts'), /three-stage interview|stuffing/);

  assert.match(txt(d, 'ctdp-joke-a'), /Reveal Punchline/);
  click(d, 'ctdp-reveal');
  assert.match(txt(d, 'ctdp-joke-a'), /^A: /);

  click(d, 'ctdp-timer');
  assert.equal(txt(d, 'ctdp-timer'), 'Pause Timer');
  click(d, 'ctdp-timer'); // pause immediately so no interval stays active
  assert.equal(txt(d, 'ctdp-timer'), 'Start 60s Timer');
  dom.window.close();
});

test('10. boxing-day-sandwich-architect engineers layer stack and flags cold-chain risks', async () => {
  const dom = await mount('boxing-day-sandwich-architect');
  const d = dom.window.document;
  assert.match(txt(d, 'bdsa-safety'), /Prime Boxing Day Window/);
  assert.ok(d.querySelectorAll('#bdsa-svg rect').length >= 8, 'renders cross-section sandwich layers');

  setVal(d, 'bdsa-hours', 80);
  click(d, 'bdsa-run');
  assert.match(txt(d, 'bdsa-safety'), /Past Cold Fridge Window/);
  dom.window.close();
});

test('11. christmas-cheeseboard-grazing-calculator scales deli weights, crackers and 60-min pull time', async () => {
  const dom = await mount('christmas-cheeseboard-grazing-calculator');
  const d = dom.window.document;
  assert.equal(txt(d, 'ccgc-pull'), '18:30');

  setVal(d, 'ccgc-guests', 16);
  setVal(d, 'ccgc-mode', 'main');
  setVal(d, 'ccgc-count', '5');
  click(d, 'ccgc-run');
  assert.match(txt(d, 'ccgc-total-g'), /kg/);
  assert.equal(d.querySelectorAll('#ccgc-items .ccgc-item').length, 6, '5 cheeses + accompaniments card');
  dom.window.close();
});

test('12. gingerbread-house-blueprint-calculator computes trigonometry roof pitch, inches and zero-spread dough', async () => {
  const dom = await mount('gingerbread-house-blueprint-calculator');
  const d = dom.window.document;
  assert.match(txt(d, 'ghbc-pitch'), /42° roof/);

  setVal(d, 'ghbc-style', 'aframe');
  setVal(d, 'ghbc-candy', 'heavy');
  setVal(d, 'ghbc-unit', 'in');
  click(d, 'ghbc-run');
  assert.match(txt(d, 'ghbc-pitch'), /60° roof/);
  assert.match(txt(d, 'ghbc-banner'), /High-angle roof/);
  assert.match(txt(d, 'ghbc-pitch-sub'), /in/);
  dom.window.close();
});

test('13. mulled-wine-festive-drinks-scaler damps whole spices sub-linearly and warns on vessel overflow', async () => {
  const dom = await mount('mulled-wine-festive-drinks-scaler');
  const d = dom.window.document;
  assert.match(txt(d, 'mwfd-temp'), /68–74 °C/);

  setVal(d, 'mwfd-guests', 45);
  setVal(d, 'mwfd-vessel', 'slow5');
  click(d, 'mwfd-run');
  assert.match(txt(d, 'mwfd-banner'), /Vessel capacity alert/);

  setVal(d, 'mwfd-recipe', 'cider0');
  click(d, 'mwfd-run');
  assert.equal(txt(d, 'mwfd-abv'), '0.0% ABV');
  dom.window.close();
});

test('14. christmas-tree-pet-proofing-planner flags cat-leap tipping torque vs heavy cast-iron stand', async () => {
  const dom = await mount('christmas-tree-pet-proofing-planner');
  const d = dom.window.document;
  assert.match(txt(d, 'ctpp-banner'), /TIP-OVER WARNING/);

  setVal(d, 'ctpp-stand', 'pot');
  setVal(d, 'ctpp-span', 85);
  setVal(d, 'ctpp-pet', 'dog_small');
  setVal(d, 'ctpp-petkg', 4);
  click(d, 'ctpp-run');
  assert.match(txt(d, 'ctpp-ballast'), /0 kg/);
  dom.window.close();
});

test('15. regift-detective-social-circle-checker escalates from Clean Getaway to Red Alert on buried gift tag', async () => {
  const dom = await mount('regift-detective-social-circle-checker');
  const d = dom.window.document;
  assert.match(txt(d, 'rdsc-verdict'), /GREEN LIGHT/);

  setVal(d, 'rdsc-circle', 'same');
  d.getElementById('rdsc-f-tag').checked = true;
  click(d, 'rdsc-run');
  assert.match(txt(d, 'rdsc-verdict'), /RED ALERT/);
  dom.window.close();
});

test('16. christmas-jumper-party-award-generator ranks knitwear chaos safely against XSS names', async () => {
  const dom = await mount('christmas-jumper-party-award-generator');
  const d = dom.window.document;
  setVal(d, 'cjpa-who', '<svg onload=alert(1)> Mega Tinsel');
  setVal(d, 'cjpa-chaos', 10);
  setVal(d, 'cjpa-hazard', 10);
  setVal(d, 'cjpa-diy', 10);
  setVal(d, 'cjpa-pun', 10);
  click(d, 'cjpa-run');
  assert.equal(d.querySelector('#cjpa-board svg'), null, 'entrant name rendered strictly via textContent');
  assert.match(txt(d, 'cjpa-banner'), /100\.0 \/ 100/);
  dom.window.close();
});

test('17. twixmas-survival-compass highlights 28 Dec 2026 UK substitute Bank Holiday and Day-4 turkey rule', async () => {
  const dom = await mount('twixmas-survival-compass');
  const d = dom.window.document;
  assert.match(txt(d, 'twxm-banner'), /substitute Bank Holiday/);
  assert.equal(txt(d, 'twxm-weekday'), 'Monday');

  setVal(d, 'twxm-date', '2026-12-29');
  click(d, 'twxm-run');
  assert.match(txt(d, 'twxm-turkey'), /SWITCH TO CHEESE/);
  dom.window.close();
});

test('18. christmas-shipping-post-cutoff-planner computes volumetric weight and late-sleigh placeholder voucher', async () => {
  const dom = await mount('christmas-shipping-post-cutoff-planner');
  const d = dom.window.document;
  setVal(d, 'cspc-send', '2026-12-24');
  setVal(d, 'cspc-box', '50x40x30');
  setVal(d, 'cspc-kg', '1.2');
  setVal(d, 'cspc-recip', 'Uncle Bob');
  click(d, 'cspc-run');
  assert.equal(txt(d, 'cspc-volkg'), '12.00 kg');
  assert.match(txt(d, 'cspc-banner'), /passed/);
  assert.match(txt(d, 'cspc-voucher-txt'), /Uncle Bob/);
  dom.window.close();
});

test('19. twelve-days-of-christmas-cost-calculator proves 364 cumulative vs 78 single-verse gifts and 184 birds', async () => {
  const dom = await mount('twelve-days-of-christmas-cost-calculator');
  const d = dom.window.document;
  assert.equal(txt(d, 'tdcc-total-items'), '364 gifts');
  assert.equal(txt(d, 'tdcc-birds'), '184 birds');
  assert.match(txt(d, 'tdcc-peak'), /42 Geese & 42 Swans/);

  setVal(d, 'tdcc-mode', 'single');
  click(d, 'tdcc-run');
  assert.equal(txt(d, 'tdcc-total-items'), '78 gifts');
  dom.window.close();
});

test('20. christmas-carol-bell-synth-quiz renders pitch contour, unlocks notes and scores correct carol guess', async () => {
  const dom = await mount('christmas-carol-bell-synth-quiz');
  const d = dom.window.document;
  assert.match(txt(d, 'ccbs-vis'), /6 \/ 11 notes/);
  click(d, 'ccbs-more');
  assert.match(txt(d, 'ccbs-vis'), /11 \/ 11 notes/);

  // Round 1 is Jingle Bells (1857)
  const btns = Array.from(d.querySelectorAll('.ccbs-choice'));
  const jb = btns.find(b => /Jingle Bells/.test(b.textContent));
  assert.ok(jb, 'Jingle Bells option rendered');
  jb.click();
  assert.match(txt(d, 'ccbs-banner'), /BINGO!/);
  assert.equal(txt(d, 'ccbs-score'), '100 pts');
  dom.window.close();
});

test('21. santa-boot-footprint-stencil-planner blocks flour on carpet and switches to vacuum-safe bicarb', async () => {
  const dom = await mount('santa-boot-footprint-stencil-planner');
  const d = dom.window.document;
  setVal(d, 'sbfs-floor', 'carpet_dark');
  setVal(d, 'sbfs-dist', 4.5);
  setVal(d, 'sbfs-kids', 'forensic');
  click(d, 'sbfs-run');
  assert.match(txt(d, 'sbfs-dust'), /Bicarb Soda/);
  assert.ok(d.querySelectorAll('#sbfs-svg ellipse, #sbfs-svg rect, #sbfs-svg path').length >= 4, 'renders footprint trail SVG');
  dom.window.close();
});

test('22. christmas-chocolate-tin-peace-treaty solves coconut orphan standoffs with snake-draft quotas', async () => {
  const dom = await mount('christmas-chocolate-tin-peace-treaty');
  const d = dom.window.document;
  setVal(d, 'cctp-tub', 'minibars');
  setVal(d, 'cctp-coco', '0');
  setVal(d, 'cctp-people', 5);
  click(d, 'cctp-run');
  assert.equal(txt(d, 'cctp-orphan'), '12 left behind');

  setVal(d, 'cctp-coco', '2');
  click(d, 'cctp-run');
  assert.equal(txt(d, 'cctp-orphan'), '0 (Clean tin!)');
  assert.ok(parseInt(txt(d, 'cctp-harmony'), 10) >= 80, 'coconut allies raise tin harmony score');
  dom.window.close();
});

test('23. christmas-guest-bed-airbed-tetris computes linen bundles, shower queues and airbed thermal insulation', async () => {
  const dom = await mount('christmas-guest-bed-airbed-tetris');
  const d = dom.window.document;
  setVal(d, 'cgba-couples', 2);
  setVal(d, 'cgba-singles', 2);
  setVal(d, 'cgba-kids', 2);
  setVal(d, 'cgba-baths', '1');
  setVal(d, 'cgba-nights', 3);
  click(d, 'cgba-run');
  assert.match(txt(d, 'cgba-queue'), /min/);
  assert.ok(d.querySelectorAll('#cgba-svg rect').length >= 3, 'renders sleeping zone allocation blocks');
  dom.window.close();
});

test('24. christmas-morning-battery-toy-prep tallies AA/AAA cells, coin-cell warnings and console patch hours', async () => {
  const dom = await mount('christmas-morning-battery-toy-prep');
  const d = dom.window.document;
  setVal(d, 'cmbt-rc', 2);
  setVal(d, 'cmbt-toddler', 3);
  setVal(d, 'cmbt-console', '85');
  setVal(d, 'cmbt-mbps', 50);
  click(d, 'cmbt-run');
  assert.match(txt(d, 'cmbt-aa'), /AA/);
  assert.match(txt(d, 'cmbt-patch'), /h|min/);
  dom.window.close();
});

test('25. roast-potato-crispness-lab scales alkaline NaHCO3 parboil chemistry and anti-steam tray count', async () => {
  const dom = await mount('roast-potato-crispness-lab');
  const d = dom.window.document;
  assert.match(txt(d, 'rpcl-kpi-chem'), /bicarb/);

  setVal(d, 'rpcl-diners', 12);
  setVal(d, 'rpcl-tray', '32x22');
  setVal(d, 'rpcl-cultivar', 'russet');
  click(d, 'rpcl-calc-btn');
  assert.match(txt(d, 'rpcl-kpi-trays'), /[3-9] trays/);
  assert.match(txt(d, 'rpcl-kpi-score'), /9[0-9] \/ 100/);
  dom.window.close();
});

test('26. christmas-light-walk-hot-flask-planner computes blue hour, JAG/TI wind-chill and cold Li-ion drop', async () => {
  const dom = await mount('christmas-light-walk-hot-flask-planner');
  const d = dom.window.document;
  assert.match(txt(d, 'clwf-kpi-sunset'), /15:|16:/);

  setVal(d, 'clwf-temp', -5);
  setVal(d, 'clwf-wind', 30);
  setVal(d, 'clwf-group', 'buggy');
  click(d, 'clwf-calc-btn');
  assert.match(txt(d, 'clwf-kpi-chill'), /^-\d+\.\d °C$/);
  assert.match(txt(d, 'clwf-kpi-buggy'), /Buggy rider feels -/);
  dom.window.close();
});

test('27. christmas-pub-quiz-round-generator deals rounds, reveals answers and renders XSS-safe team scoreboard', async () => {
  const dom = await mount('christmas-pub-quiz-round-generator');
  const d = dom.window.document;
  setVal(d, 'cpqr-cat', 'music');
  setVal(d, 'cpqr-count', '5');
  click(d, 'cpqr-gen-btn');
  assert.equal(d.querySelectorAll('#cpqr-list li').length, 5);

  setVal(d, 'cpqr-team-input', '<img src=x onerror=alert(1)> Sprouts');
  click(d, 'cpqr-add-team');
  assert.equal(d.querySelector('#cpqr-teams img'), null, 'team names use safe textContent');

  click(d, 'cpqr-reveal-all');
  assert.match(txt(d, 'cpqr-tie-a'), /Answer:/);
  dom.window.close();
});

test('28. christmas-tipping-thank-you-planner adapts UK biscuit vs US USPS federal non-cash etiquette', async () => {
  const dom = await mount('christmas-tipping-thank-you-planner');
  const d = dom.window.document;
  assert.match(txt(d, 'ctty-kpi-total'), /^£/);

  setVal(d, 'ctty-region', 'us');
  setVal(d, 'ctty-signoff', 'The Robinsons');
  click(d, 'ctty-calc-btn');
  assert.match(txt(d, 'ctty-kpi-total'), /^\$/);
  assert.match(txt(d, 'ctty-tbody'), /USPS: non-cash/);
  assert.match(txt(d, 'ctty-card-text'), /The Robinsons/);
  dom.window.close();
});

test('29. fireplace-yule-log-heat-burn-calculator flags wet-wood creosote risk and Christmas tree burn hazard', async () => {
  const dom = await mount('fireplace-yule-log-heat-burn-calculator');
  const d = dom.window.document;
  assert.match(txt(d, 'fylh-kpi-risk'), /Clean Burn/);

  setVal(d, 'fylh-moisture', '38');
  setVal(d, 'fylh-stove', 'open');
  click(d, 'fylh-calc-btn');
  assert.match(txt(d, 'fylh-kpi-risk'), /SEVERE Creosote Risk/);
  assert.match(txt(d, 'fylh-safety'), /NEVER burn cut Christmas tree/);
  dom.window.close();
});

test('30. christmas-eve-night-sky-star-finder plots 2026-12-24 99.5% Cold Moon, Jupiter, Saturn and Orion', async () => {
  const dom = await mount('christmas-eve-night-sky-star-finder');
  const d = dom.window.document;
  assert.equal(txt(d, 'cens-kpi-moon'), '99.5% Full');

  setVal(d, 'cens-lat', 52);
  setVal(d, 'cens-hour', '21.5');
  click(d, 'cens-calc-btn');
  assert.match(txt(d, 'cens-tbody'), /Full Cold Moon/);
  assert.match(txt(d, 'cens-tbody'), /Jupiter/);
  assert.ok(d.querySelectorAll('#cens-svg circle').length >= 6, 'plots visible stars and Cold Moon on sky dome');
  dom.window.close();
});
