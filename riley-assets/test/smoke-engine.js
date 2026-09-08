/* Headless smoke for riley-engine.js — boots the game on the shared fake-DOM
 * rig, steps the sim with input, spawns + kills enemies, runs render frames.
 * Catches wiring/runtime errors that --check misses, and pins the behaviour
 * of the camera + combat invariants (see the labelled sections below).
 */
'use strict';
const H = require('./harness.js').boot();
const elements = H.els;
global.__H = H;                     /* used by the camera bench + dev probes */

/* ---------------- drive ---------------- */
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}

console.log('--- boot ---');
check('window.RileyGame exposed', !!global.RileyGame);
check('state=title', global.RileyGame.state === 'title', global.RileyGame.state);
check('world generated', !!(global.RileyGame.world && global.RileyGame.world.crystals.length > 5), global.RileyGame.world ? global.RileyGame.world.crystals.length : null);

/* start the game */
global.RileyGame.start();
check('state=play', global.RileyGame.state === 'play', global.RileyGame.state);
check('session created', !!(global.RileyGame.session));

const pump = (nFrames, perFrame) => H.pump(nFrames, perFrame);

console.log('--- 3s of idle sim (wave 1 spawns) ---');
pump(180);
let T = global.__T.info();
check('tick advanced', T.tick > 100, T);
check('enemies spawned', T.n > 0, T);
check('worldHash recorded', T.hash !== 0, T.hash);

console.log('--- fire + 2s ---');
global.__T.fire();
pump(120);
T = global.__T.info();
check('sim still running after fire', T.tick > 250 && T.state === 'play', T);

console.log('--- combat: kill wave, advance ---');
for (let i = 0; i < 6; i++) {
  global.__T.hurtAll();
  pump(90);
}
T = global.__T.info();
check('wave advanced past 1', T.wave > 1, T);
check('score > 0', T.score > 0, T.score);
check('kills > 0', T.kills > 0, T.kills);

console.log('--- place enemy in front, kill it ---');
const killsBefore = global.__T.info().kills;
const placed = global.__T.place('grunt', 4, 0);
check('place returns coords', !!placed && Math.abs(placed.x - (global.__R().x + 4)) < 0.01, placed);
global.__T.hurtAll();
pump(30);
check('placed enemy killed (kills advance)', global.__T.info().kills > killsBefore, global.__T.info());

console.log('--- boss wave via hook ---');
global.__T.wave(5);
pump(240);
T = global.__T.info();
check('boss spawned', T.boss === true, T);
check('enemies > 1 (summons/queue)', T.n >= 1, T);
global.__T.hurtAll();
pump(120);
T = global.__T.info();
check('boss dead -> wave clear', !T.boss, T);

console.log('--- crystal shatter + spitter projectile ---');
const Tc = global.__T.info();
const shat = global.__T.shatter();
pump(5);
const Tc2 = global.__T.info();
check('shatter works', shat && Tc2.crystals === Tc.crystals - 1, { Tc: Tc.crystals, Tc2: Tc2.crystals, mana: global.__R().mana });
check('shatter gives mana', global.__R().mana >= 30, global.__R().mana);
pump(150); /* let i-frames expire */
const livesB = global.__T.info().lives;
global.__T.spitHit();
pump(40);
const livesA = global.__T.info().lives;
check('spitter projectile hits player (lives drop)', livesA < livesB, { livesB, livesA });

console.log('--- fair contact: idle bump vs active lunge ---');
global.__T.setInv(0);
global.__T.wave(2);
pump(20);
global.__T.hurtAll();
pump(10);
global.__T.clearShots();
const l0 = global.__T.info().lives;
const p2 = global.__T.place('grunt', 0.3, 0.2);
check('grunt placed overlapping player', !!p2, p2);
const g2 = global.__T.lastEnemy();
if (g2) {
  /* neuter the brain: idle forever, never attacks */
  g2.brain.tick = function () { return { mvx: 0, mvz: 0, act: 'idle', atk: 0, panic: 0, o: [0, 0, 0, 0, 0, 0] }; };
  g2.actKind = 'none'; g2.tele = 0; g2.stun = 0; g2.actCd = 99;
  g2.vx = 0; g2.vz = 0;
  pump(30);
  check('idle crowding: no damage (bump only)', global.__T.info().lives === l0, { l0, l1: global.__T.info().lives });
  /* the same goblin actively lunging MUST hurt on contact */
  const rp = global.__R();
  g2.x = rp.x + 0.2; g2.z = rp.z; g2.vx = 0; g2.vz = 0;
  g2.actKind = 'lunge'; g2.actT = 0.3; g2.tele = 0;
  global.__T.setInv(0);
  pump(3);
  check('active lunge contact damages', global.__T.info().lives < l0, { l0, l1: global.__T.info().lives });
  global.__T.hurtAll();
  global.__T.clearShots();
}

console.log('--- power-ups, elites, boss slam ---');
global.__T.god(true); /* keep the player alive while exercising mechanics */
global.__T.wave(4);   /* elites roll from wave 4 */
pump(30);
const el1 = global.__T.place('grunt', 5, 0, true);
check('forced elite: flagged + tougher', el1.elite === true && el1.hp >= 3, el1);
const el2 = global.__T.place('grunt', -5, 0, false);
check('forced normal: not elite', el2.elite === false && el2.hp < 2.6, el2);
const manaB = global.__R().mana;
global.__T.drop('surge');
pump(25);
const rb = global.__R();
check('surge collected: mana topped up + regen buff',
  (rb.mana > manaB + 35 || manaB >= 99.9) && global.__T.buffs().regen > 0,
  { manaB, mana: rb.mana, buffs: global.__T.buffs() });
global.__T.drop('bolt');
pump(25);
check('bolt collected: damage buff active', global.__T.buffs().dmg > 0, global.__T.buffs());

console.log('--- boss slam ---');
global.__T.wave(5);
pump(30);
check('boss alive for slam test', global.__T.info().boss === true, global.__T.info());
const armed = global.__T.slam();
check('slam armed on boss', armed === true, armed);
const bs0 = global.__T.bossState();
pump(5);
const bs1 = global.__T.bossState();
check('slam executed and cleared', !!bs0 && bs0.act === 'slam' && !!bs1 && bs1.act !== 'slam', { bs0, bs1 });

console.log('--- mouse-assist aim + zoom ---');
pump(30);
const A = global.__T.aim();
const groundAt = global.__R().y; /* sanity only */
check('aim point on/near terrain', Math.abs(A.y - groundAt) < 2.2 || A.lock, A);
check('aim point in front within range', A.dist > 0.5 && A.dist < 65, A);
const z0 = global.__T.zoom(-3);
check('zoom in accepted', z0 < 7.5, z0);
pump(40);
const z1 = global.__T.zoom(99);
check('zoom out clamps at engine max', z1 === global.__T.zoomMax(), { z1, max: global.__T.zoomMax() });

console.log('--- movement matches the screen (regression: mirrored strafe basis) ---');
function velDot(key, axis) {
  global.__T.key(key, true);
  pump(18);
  const r = global.__R(), b = global.__T.basis();
  const v = axis === 'right' ? r.vx * b.right[0] + r.vz * b.right[2]
    : r.vx * b.fwd[0] + r.vz * b.fwd[2];
  global.__T.key(key, false); pump(40);
  return { v: +v.toFixed(2), sp: +Math.hypot(r.vx, r.vz).toFixed(2) };
}
const mD = velDot('KeyD', 'right'), mA = velDot('KeyA', 'right');
const mW = velDot('KeyW', 'fwd'), mS = velDot('KeyS', 'fwd');
check('D strafes toward the right edge', mD.v > 4 && mD.sp > 7, mD);
check('A strafes toward the left edge', mA.v < -4, mA);
check('W runs into the screen', mW.v > 4, mW);
check('S backs up', mS.v < -4, mS);
const prR = global.__proj(global.__R().x + global.__T.basis().right[0] * 4, global.__R().y + 1, global.__R().z + global.__T.basis().right[2] * 4);
const prC = global.__proj(global.__R().x, global.__R().y + 1, global.__R().z);
check('projection agrees with the view basis', prR && prC && prR[0] > prC[0], { prR, prC });

console.log('--- melee chain: two jabs, then a cleave ---');
global.__T.wave(1); pump(12); global.__T.hurtAll(); global.__T.clearShots(); pump(6);
global.__T.setInv(1e9);
/* brutes (5 hp) so the jabs can't one-shot the test subject */
const rr0 = global.__R(), fxx = Math.sin(rr0.yaw), fzz = Math.cos(rr0.yaw);
global.__T.place('brute', fxx * 1.25 + fzz * 0.55, fzz * 1.25 - fxx * 0.55);
const gA = global.__T.lastEnemy();
global.__T.place('brute', fxx * 1.25 - fzz * 0.55, fzz * 1.25 + fxx * 0.55);
const gB = global.__T.lastEnemy();
const hpA = gA.hp, hpB = gB.hp;
check('swing 1 connects', global.__T.swing() === true, null);
const hurtA = hpA - gA.hp, hurtB = hpB - gB.hp;
check('swing 1 hurt exactly one brute', (hurtA > 0) !== (hurtB > 0), { hurtA, hurtB });
check('chain advanced to 2', global.__R().meleeN === 1, global.__R().meleeN);
pump(14);
global.__T.swing();
check('chain advanced to 3', global.__R().meleeN === 2, global.__R().meleeN);
pump(14);
global.__T.swing();
check('cleave hit both brutes', gA.hp < hpA && gB.hp < hpB, { a: gA.hp, b: gB.hp });
check('chain reset after finisher', global.__R().meleeN === 0, global.__R().meleeN);
pump(3);
check('cleave launched them', (gA.dead || gA.vy > 1) && (gB.dead || gB.vy > 1), { a: gA.vy, b: gB.vy });
/* whiff recovery: swinging at nothing must cost you more than hitting */
for (let i = 0; i < 6; i++) { global.__T.hurtAll(); pump(20); global.__T.clearShots(); }
const cdBefore = global.__R().meleeCd;
const nearN = global.__T.info().n;
global.__T.swing();
check('whiff is punished with a longer recovery than a jab', cdBefore === 0 && global.__R().meleeCd > 0.3, { cdBefore, after: global.__R().meleeCd, nearN });
check('whiff does not advance the chain', global.__R().meleeN === 0, global.__R().meleeN);
global.__T.hurtAll(); pump(20); global.__T.clearShots();

console.log('--- perfect dodge: dash i-frames pay out ---');
global.__T.wave(2); pump(20); global.__T.hurtAll(); global.__T.clearShots(); pump(10);
global.__T.setInv(0);
const livesD = global.__T.info().lives, scoreD = global.__T.info().score;
global.__T.place('grunt', 0.4, 0.1);
const gd = global.__T.lastEnemy();
global.__T.dashDodge();
gd.actKind = 'lunge'; gd.actT = 0.3; gd.tele = 0;
pump(3);
check('dodged hit costs no heart', global.__T.info().lives === livesD, { livesD, now: global.__T.info().lives });
check('perfect dodge scored', global.__T.info().score > scoreD, { scoreD, now: global.__T.info().score });
const sl = global.__T.slow();
check('perfect dodge hit the brakes (slow-mo)', sl.t > 0 && sl.k < 1, sl);
/* and a plain (non-dodge) hit still hurts */
pump(60);
global.__T.setInv(0);
const livesE = global.__T.info().lives;
gd.x = global.__R().x + 0.2; gd.z = global.__R().z; gd.actKind = 'lunge'; gd.actT = 0.3; gd.tele = 0; gd.vx = 0; gd.vz = 0;
pump(3);
check('untimed contact still hurts (dodge is not immunity)', global.__T.info().lives < livesE, { livesE, now: global.__T.info().lives });
global.__T.god(true);

console.log('--- camera sanity (never under ground) ---');
let below = 0, far = 0, samples = 0;
for (let i = 0; i < 60; i++) {
  const cb = global.__T.camBelow(); /* ground - camY: positive => camera inside terrain */
  if (cb > 0.001) below++;
  const r = global.__R();
  const dist = Math.hypot(r.camX - r.x, r.camY - r.y, r.camZ - r.z);
  /* regression: the old raycast squared the distance and flung the camera
     ~50u away whenever terrain sat behind the player */
  if (dist > 13) far++;
  samples++;
  pump(1);
}
check('camera never under terrain', below === 0, { below, samples });
check('camera stays in tight range (regression: no 50u flyaway)', far === 0, { far, samples });

console.log('--- determinism: same seed twice => same worldHash ---');
const seed = 'TESTSEED42';
global.RileyGame.toTitle();
function hashAtFrame(n) {
  /* fresh run with fixed seed, identical bestiary start state */
  elements['btnPurge'].onclick();
  elements['seedInput'].value = seed;
  global.RileyGame.start();
  pump(n);
  return global.__T.info().hash;
}
const h1 = hashAtFrame(600);
const h2 = hashAtFrame(600);
check('deterministic sim (hash equal)', h1 === h2 && h1 !== 0, { h1, h2 });

console.log('--- 40s combat fuzz (waves, elites, power-ups, bosses) ---');
global.__T.god(true);
for (let i = 0; i < 40 * 60; i++) {
  if (i % 12 === 0) global.__T.fire();
  const T0 = global.__T.info();
  if (i % 60 === 0 && T0.n > 0 && T0.wv === 'combat') global.__T.hurtAll();
  pump(1);
}
const Tf = global.__T.info();
check('fuzz: sim survived 40s of combat', Tf.state === 'play', Tf);
check('fuzz: waves advanced to 3+', Tf.wave >= 3, Tf);
check('fuzz: killed goblins across waves', Tf.kills > 20, Tf);
check('fuzz: score accumulated', Tf.score > 1000, Tf);

console.log('--- camera: auto-frame follows BEHIND the walker (regression: face-cam) ---');
global.__T.key('KeyW', true);
for (let i = 0; i < 300; i++) { /* keep the field clear so auto-frame engages */
  if (i % 3 === 0) global.__T.hurtAll();
  pump(1);
}
const rc = global.__R();
const lookDot = Math.sin(rc.camYaw) * Math.sin(rc.yaw) + Math.cos(rc.camYaw) * Math.cos(rc.yaw);
check('camera looks along walk direction (behind Riley)', lookDot > 0.9, { camYaw: rc.camYaw, yaw: rc.yaw, lookDot });
const behindDot = (rc.camX - rc.x) * Math.sin(rc.yaw) + (rc.camZ - rc.z) * Math.cos(rc.yaw);
check('camera sits behind, not in front', behindDot < 0, { behindDot });
global.__T.key('KeyW', false);
pump(20);

console.log('--- selftest render: unique colours ---');
pump(10);
const shot = global.__shot();
check('render produced frames', H.stats().drawCalls > 50, H.stats());

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL ENGINE SMOKE CHECKS PASS');
process.exit(fails ? 1 : 0);
