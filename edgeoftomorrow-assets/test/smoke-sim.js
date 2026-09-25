/* smoke-sim.js — boots the real simulation headlessly in Node and asserts
 * the two things the whole architecture rests on:
 *   1. a full match runs to completion without throwing
 *   2. the same seed + same inputs produce the same world hash (determinism)
 *
 * Run: node edgeoftomorrow-assets/test/smoke-sim.js
 */
'use strict';
const assert = require('assert');
const S = require('../eot-sim.js');
const AI = require('../eot-ai.js');
const C = require('../eot-core.js');

function buildMatch(seed, opts) {
  opts = opts || {};
  const world = S.makeWorld({ seed: seed });
  S.buildArena(world);
  S.addPlayer(world, { id: 1, name: 'YOU', role: S.ROLES.SURV, bot: !opts.human });
  for (let i = 0; i < 3; i++) {
    S.addPlayer(world, { id: 2 + i, name: AI.nameFor(S.ROLES.SURV, i + 1), role: S.ROLES.SURV, bot: true });
  }
  S.addPlayer(world, { id: 9, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, bot: true });
  S.beginMatch(world);
  return world;
}

function run(seed, ticks, opts) {
  const world = buildMatch(seed, opts);
  const hashes = [];
  let eventCount = 0;
  const kinds = new Map();
  for (let t = 0; t < ticks && world.phase !== S.PHASE.OVER; t++) {
    S.prepare(world);
    const inputs = AI.think(world);
    const evs = S.step(world, inputs);
    eventCount += evs.length;
    for (const e of evs) kinds.set(e.t, (kinds.get(e.t) || 0) + 1);
    if (t % 8 === 0) hashes.push(S.worldHash(world));
  }
  return { world, hashes, eventCount, kinds, finalHash: S.worldHash(world) };
}

let pass = 0;
function ok(label, cond, extra) {
  assert.ok(cond, label + (extra ? ' — ' + extra : ''));
  pass++;
  console.log('  ok  ' + label + (extra ? '  (' + extra + ')' : ''));
}

console.log('smoke-sim: determinism + full-match run');

/* ---- 1. arena builds and is well-formed ---- */
{
  const w = S.makeWorld({ seed: 'edge-of-tomorrow' });
  S.buildArena(w);
  ok('arena: 7 anchors placed', w.anchors.length === S.K.ANCHORS, 'got ' + w.anchors.length);
  ok('arena: 2 gates', w.gates.length === S.K.GATES);
  ok('arena: 5 hooks', w.hooks.length === 5);
  ok('arena: has interior cover', w.props.length > 10, w.props.length + ' props');
  const a2 = S.makeWorld({ seed: 'edge-of-tomorrow' });
  S.buildArena(a2);
  ok('arena: same seed => same anchor layout',
    w.anchors.every((a, i) => a.x === a2.anchors[i].x && a.y === a2.anchors[i].y));
  const b = S.makeWorld({ seed: 'different' });
  S.buildArena(b);
  ok('arena: different seed => different layout',
    b.anchors.some((a, i) => a.x !== w.anchors[i].x || a.y !== w.anchors[i].y));
}

/* ---- 2. a full match runs ---- */
{
  const r = run('smoke', 60 * 260);
  ok('match: ran without throwing', true, r.world.tick + ' ticks');
  ok('match: reached a terminal phase', r.world.phase === S.PHASE.OVER, 'phase=' + r.world.phase);
  ok('match: produced a winner', r.world.winner === 'survivors' || r.world.winner === 'slayer',
    'winner=' + r.world.winner + ' reason=' + (r.world.winReason || '-'));
  ok('match: emitted events', r.eventCount > 50, r.eventCount + ' events');
  ok('match: combat happened', (r.kinds.get('hit') || 0) > 0, (r.kinds.get('hit') || 0) + ' hits');
  ok('match: anchors were worked', (r.kinds.get('anchorDone') || 0) + r.world.stats.anchorsDone > 0,
    r.world.stats.anchorsDone + ' complete');
  ok('match: bots fought back', (r.kinds.get('slash') || 0) > 0, (r.kinds.get('slash') || 0) + ' swings');
  ok('match: no NaN crept into player state',
    r.world.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp)));
  ok('match: players stayed inside the arena',
    r.world.players.every(p => p.x >= 0 && p.x <= S.K.WORLD.w && p.y >= 0 && p.y <= S.K.WORLD.h));
  console.log('       event mix: ' + [...r.kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => k + '=' + v).join(' '));
}

/* ---- 3. determinism: same seed, twice ---- */
{
  const a = run('determinism', 60 * 40);
  const b = run('determinism', 60 * 40);
  ok('determinism: identical tick hashes', a.hashes.join() === b.hashes.join(),
    a.hashes.length + ' samples');
  ok('determinism: identical final hash', a.finalHash === b.finalHash, '0x' + a.finalHash.toString(16));
  const c = run('other-seed', 60 * 40);
  ok('determinism: different seed diverges', c.finalHash !== a.finalHash);
}

/* ---- 4. snapshot round-trip preserves the hashed state ---- */
{
  const w = buildMatch('roundtrip', { human: true });
  for (let t = 0; t < 240; t++) { S.prepare(w); S.step(w, AI.think(w)); }
  const snap = S.snapshot(w);
  const before = S.worldHash(w);
  const w2 = S.makeWorld({ seed: w.seed });
  S.buildArena(w2);
  S.applySnapshot(w2, snap);
  ok('snapshot: hash survives round-trip', S.worldHash(w2) === before,
    '0x' + before.toString(16) + ' -> 0x' + S.worldHash(w2).toString(16));
  ok('snapshot: player count preserved', w2.players.length === w.players.length);
  ok('snapshot: anchor progress preserved (within wire quantisation)',
    w2.anchors.every((a, i) => Math.abs(a.progress - w.anchors[i].progress) < 5e-4));
}

/* ---- 5. input encode/decode is lossless on the wire format ---- */
{
  const i = S.makeInput();
  i.x = 0.7; i.y = -0.3; i.aim = 1.234;
  i.sprint = true; i.attack = true; i.ult = true;
  const qx = Math.round(C.clamp(i.x, -1, 1) * 8);
  const qy = Math.round(C.clamp(i.y, -1, 1) * 8);
  const qa = Math.round(C.angNorm(i.aim) / C.TAU * 255) & 0xFF;
  const back = S.inputFromFlags(qx / 8, qy / 8, (qa / 255) * C.TAU, S.inputFlags(i));
  ok('input: flags survive encode/decode',
    back.sprint === true && back.attack === true && back.ult === true && back.dash === false);
  ok('input: quantised axes survive', Math.abs(back.x - 0.75) < 1e-9 && Math.abs(back.y + 0.25) < 1e-9,
    back.x + ',' + back.y);
  ok('input: quantised aim within 1.5 degrees',
    Math.abs(C.angDiff(i.aim, back.aim)) < 0.0262, (C.angDiff(i.aim, back.aim) * 180 / Math.PI).toFixed(3) + 'deg');
}

/* ---- 6. core rules actually fire ---- */
{
  /* two hits put a survivor down */
  const w = buildMatch('rules', { human: true });
  const surv = w.players[0], slayer = w.players.find(p => p.role === S.ROLES.SLAYER);
  surv.x = slayer.x + 30; surv.y = slayer.y; surv.invuln = 0; surv.iframes = 0;
  const before = surv.state;
  S.step(w, {});
  /* drive damage directly through the public surface by stepping a forced attack */
  surv.x = slayer.x + 20; slayer.aim = 0; slayer.facing = 0;
  slayer.atkPhase = 'active'; slayer.atkT = 0.01; slayer.atkHitDone = false;
  S.step(w, {});
  ok('rules: slayer hit registers damage', surv.hp < S.K.SURV_HP, 'hp=' + surv.hp);
  surv.x = slayer.x + 20; slayer.atkCd = 0; slayer.atkPhase = 'active'; slayer.atkT = 0.01; slayer.atkHitDone = false; surv.invuln = 0;
  S.step(w, {});
  ok('rules: second hit downs the survivor', surv.state === S.STATE.DOWNED,
    before + ' -> ' + surv.state + ' hp=' + surv.hp);
  ok('rules: downed survivor starts bleeding out', surv.bleed > 0 && surv.bleed <= S.K.BLEEDOUT);
}

/* ---- 7. win conditions ---- */
{
  /* REGICIDE: zeroing the slayer core ends it for the survivors */
  const w = buildMatch('regicide');
  const slayer = w.players.find(p => p.role === S.ROLES.SLAYER);
  const surv = w.players[0];
  slayer.hp = 1; slayer.invuln = 0; slayer.iframes = 0;
  slayer.x = surv.x + 20; slayer.y = surv.y;
  surv.aim = 0; surv.facing = 0; surv.atkPhase = 'active'; surv.atkT = 0.01; surv.atkHitDone = false;
  S.step(w, {});
  ok('win: regicide ends the match for survivors',
    w.phase === S.PHASE.OVER && w.winner === 'survivors', 'reason=' + (w.winReason || '-'));
}
{
  /* wiping every survivor ends it for the slayer */
  const w = buildMatch('wipe');
  for (const p of w.players) if (p.role === S.ROLES.SURV) { p.state = S.STATE.DEAD; p.hp = 0; }
  S.step(w, {});
  ok('win: full wipe ends the match for the slayer',
    w.phase === S.PHASE.OVER && w.winner === 'slayer', 'reason=' + (w.winReason || '-'));
}
{
  /* escaping ends it for the survivors */
  const w = buildMatch('escape');
  const survs = w.players.filter(p => p.role === S.ROLES.SURV);
  survs[0].state = S.STATE.ESCAPED;
  survs[1].state = S.STATE.ESCAPED;
  w.stats.escapes = 2;
  S.step(w, {});
  ok('win: majority escape ends the match for survivors',
    w.phase === S.PHASE.OVER && w.winner === 'survivors', 'reason=' + (w.winReason || '-'));
}

/* ---- 8. grading ---- */
{
  const w = buildMatch('grade');
  w.players[0].score = { obj: 900, chase: 300, stun: 0, heal: 200, dmg: 300, escape: 400 };
  const g = S.grade(w.players[0]);
  ok('grade: a strong round grades S or A', g.grade === 'S' || g.grade === 'A', g.grade + ' (' + g.total + ')');
}

/* ---- 9. full-state capture / restore (the rollback path) ---- */
{
  const w = buildMatch('capture');
  for (let t = 0; t < 600; t++) { S.prepare(w); S.step(w, AI.think(w)); }
  const cap = S.captureState(w);
  const hashAtCap = S.worldHash(w);
  /* run on, then roll back and prove we land exactly where we were */
  for (let t = 0; t < 300; t++) { S.prepare(w); S.step(w, AI.think(w)); }
  assert.notStrictEqual(S.worldHash(w), hashAtCap, 'world should have moved on');
  S.restoreState(w, cap);
  ok('capture: restore returns the exact world hash', S.worldHash(w) === hashAtCap,
    '0x' + hashAtCap.toString(16));
  /* and replaying from the capture reproduces the same future */
  const futureA = [];
  for (let t = 0; t < 300; t++) { S.prepare(w); S.step(w, AI.think(w)); futureA.push(S.worldHash(w)); }
  const w2 = buildMatch('capture');
  for (let t = 0; t < 600; t++) { S.prepare(w2); S.step(w2, AI.think(w2)); }
  const futureB = [];
  for (let t = 0; t < 300; t++) { S.prepare(w2); S.step(w2, AI.think(w2)); futureB.push(S.worldHash(w2)); }
  ok('capture: replay after restore is bit-identical', futureA.join() === futureB.join(),
    '300 ticks replayed');
  ok('capture: byId index rebuilt on restore',
    w.players.every(p => S.getPlayer(w, p.id) === p));
}

/* ---- 10. capture coverage guard ----
 * If someone adds a simulated field to a player and forgets PLAYER_FIELDS,
 * rollback silently loses it and peers desync. This fails instead. */
{
  const w = buildMatch('coverage');
  for (let t = 0; t < 120; t++) { S.prepare(w); S.step(w, AI.think(w)); }
  for (const p of w.players) {
    const missing = Object.keys(p).filter(k => S.PLAYER_FIELDS.indexOf(k) === -1);
    ok('capture: every field of player ' + p.id + ' (' + p.role + ') is captured',
      missing.length === 0, missing.length ? 'MISSING: ' + missing.join(', ') : S.PLAYER_FIELDS.length + ' fields');
  }
  /* and the captured object must carry the same fields back */
  const cap = S.captureState(w);
  const w2 = S.makeWorld({ seed: w.seed });
  S.buildArena(w2);
  S.restoreState(w2, cap);
  ok('capture: restored players expose every simulated field',
    w2.players.every((p, i) => S.PLAYER_FIELDS.every(k => k in p) &&
      (typeof p.skill === typeof w.players[i].skill)));
}

/* ---- 11. tuning report (not an assertion — a measurement) ----
 * Balance is tuned against this output, not by feel. If the numbers below
 * move a long way, re-read them before shipping. */
if (process.env.EOT_BALANCE !== '0') {
  const N = 24;
  const tally = { survivors: 0, slayer: 0 };
  const reasons = new Map();
  let hits = 0, swings = 0, ults = 0, anchors = 0, escapes = 0, downs = 0, dur = 0;
  for (let i = 0; i < N; i++) {
    const w = buildMatch('balance-' + i);
    const kinds = new Map();
    while (w.phase !== S.PHASE.OVER && w.tick < 60 * 300) {
      S.prepare(w);
      for (const e of S.step(w, AI.think(w))) kinds.set(e.t, (kinds.get(e.t) || 0) + 1);
    }
    tally[w.winner] = (tally[w.winner] || 0) + 1;
    reasons.set(w.winReason, (reasons.get(w.winReason) || 0) + 1);
    hits += kinds.get('hit') || 0;
    swings += kinds.get('slash') || 0;
    ults += kinds.get('ult') || 0;
    downs += kinds.get('down') || 0;
    anchors += w.stats.anchorsDone;
    escapes += w.stats.escapes;
    dur += w.tick / 60;
  }
  console.log('\n  balance over ' + N + ' simulated matches:');
  console.log('    survivors ' + tally.survivors + ' / slayer ' + tally.slayer +
    '   avg length ' + (dur / N).toFixed(0) + 's');
  console.log('    per match: ' + (swings / N).toFixed(1) + ' swings, ' + (hits / N).toFixed(1) +
    ' hits, ' + (downs / N).toFixed(1) + ' downs, ' + (ults / N).toFixed(1) + ' ults, ' +
    (anchors / N).toFixed(1) + ' anchors, ' + (escapes / N).toFixed(1) + ' escapes');
  console.log('    endings: ' + [...reasons.entries()].map(([k, v]) => k + '=' + v).join(' '));
}

console.log('\nsmoke-sim: ' + pass + ' assertions passed');
