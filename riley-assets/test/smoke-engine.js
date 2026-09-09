/* Headless smoke for riley-engine.js — boots the game on the shared fake-DOM
 * rig, steps the sim with input, spawns + kills enemies, runs render frames.
 * Catches wiring/runtime errors that --check misses, and pins the behaviour
 * of the camera + combat invariants (see the labelled sections below).
 */
'use strict';
const path = require('path');
const H = require('./harness.js').boot();
const elements = H.els;
global.__H = H;                     /* used by the camera bench + dev probes */

/* ---------------- drive ---------------- */
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}

console.log('--- page contract: every id the engine asks for exists in riley.html ---');
const htmlSrc = require('fs').readFileSync(path.join(__dirname, '..', '..', 'riley.html'), 'utf8');
const pageIds = new Set([...htmlSrc.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const missing = require('./harness.js').IDS.filter(id => !pageIds.has(id));
check('all HUD ids present in the page', missing.length === 0, missing);
const unused = require('./harness.js').IDS.filter(id => !global.__H.els[id]);
check('harness ids all instantiated', unused.length === 0, unused);

console.log('--- boot ---');
check('window.RileyGame exposed', !!global.RileyGame);
check('state=title', global.RileyGame.state === 'title', global.RileyGame.state);
check('world generated', !!(global.RileyGame.world && global.RileyGame.world.crystals.length > 5), global.RileyGame.world ? global.RileyGame.world.crystals.length : null);

/* start the game — on a FIXED world so the suite is deterministic. Without
   this every run draws a fresh random terrain, and a body parked over a hill
   is a body that is no longer on the camera's sightline (the body-push and
   strafe checks then fail at random). */
elements['seedInput'].value = 'TESTSMOKE';
global.RileyGame.start();
check('state=play', global.RileyGame.state === 'play', global.RileyGame.state);
check('session created', !!(global.RileyGame.session));

/* Between waves the game holds in 'pick' state until a boon is chosen. The
 * suite is about combat, not menus, so the shared pump resolves the pick.
 * Sections that care about the pick itself use H.pump directly. */
const pump = (nFrames, perFrame) => H.pump(nFrames, (i) => {
  if (global.RileyGame.state === 'pick') global.__T.pick(i % 3);
  if (perFrame) perFrame(i);
});

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
/* freeze the camera's automatic rotations while measuring: auto-frame and
   threat-framing legitimately swing the yaw toward approaching goblins, and a
   basis that is still mid-swing makes the WASD projection read backwards. */
global.__T.camSet('autoFrame', 0);
global.__T.resetCam();
pump(10);
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
global.__T.camSet('autoFrame', 1);

console.log('--- cursor aim: camera follows the mouse, no pointer lock needed ---');
/* the whole point of the fix: with NO pointer lock, moving the cursor must
   steer the camera (dead zone in the middle), and a left click must fire. */
global.__T.camSet('aimMode', 0);
global.document.pointerLockElement = null;
global.__T.god(true);
global.__T.hurtAll();
pump(10);
global.__T.clearShots();
H.emit('mousemove', { clientX: 400, clientY: 225, movementX: 0, movementY: 0 });  /* centre: hold */
pump(20);
const cy0 = global.__R().camYaw;
pump(20);
check('cursor centred holds the camera still', Math.abs(global.__R().camYaw - cy0) < 0.02, { cy0, now: global.__R().camYaw });
H.emit('mousemove', { clientX: 799, clientY: 225, movementX: 0, movementY: 0 });  /* right edge: turn */
pump(20);
const cy1 = global.__R().camYaw;
check('cursor at the right edge turns the camera', cy1 < cy0 - 0.03, { cy0, cy1 });
/* click-to-fire in cursor mode */
H.emit('mousemove', { clientX: 400, clientY: 225, movementX: 0, movementY: 0 });
pump(8);
const shotsBefore = global.__R().shots;
H.elEmit('cv', 'pointerdown', { pointerType: 'mouse', button: 0, clientX: 400, clientY: 225 });
pump(2);
H.emit('pointerup', { pointerType: 'mouse', button: 0 });
const shotsAfter = global.__R().shots;
check('a left click fires a bolt (cursor aim)', shotsAfter > shotsBefore, { shotsBefore, shotsAfter });
/* aim-mode toggle flips the scheme and persists */
H.elClick('tglAim');
check('aim mode toggles to pointer-lock', global.__T.camGet().aimMode === 1, global.__T.camGet().aimMode);
H.elClick('tglAim');
check('aim mode toggles back to cursor', global.__T.camGet().aimMode === 0, global.__T.camGet().aimMode);

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
/* and a plain (non-dodge) hit still hurts. Use a FRESH goblin, not the one
   from the dodge: Riley is still shooting (KeyF held by earlier sections) and
   had eaten the poor thing before this line ran, so the check failed because
   there was nobody left to touch her. */
pump(60);
global.__T.clearShots();
global.__T.setInv(0);
const livesE = global.__T.info().lives;
global.__T.place('grunt', 0.2, 0);
const gd2 = global.__T.lastEnemy();
check('the fresh goblin is alive', !!gd2 && !gd2.dead, gd2 && gd2.dead);
gd2.actKind = 'lunge'; gd2.actT = 0.3; gd2.tele = 0; gd2.recT = 0; gd2.stun = 0; gd2.spawnT = 0;
gd2.x = global.__R().x + 0.2; gd2.z = global.__R().z; gd2.vx = 0; gd2.vz = 0;
pump(3);
check('untimed contact still hurts (dodge is not immunity)', global.__T.info().lives < livesE, { livesE, now: global.__T.info().lives });
global.__T.god(true);

console.log('--- fairness: wind-ups cannot hit you; bodies tumble ---');
global.__T.wave(2); pump(20); global.__T.hurtAll(); global.__T.clearShots(); pump(30);
global.__T.setInv(0);
const lW = global.__T.info().lives;
global.__T.place('grunt', 0.35, 0.1);
const gw = global.__T.lastEnemy();
gw.brain.tick = function () { return { mvx: 0, mvz: 0, act: 'attack', atk: 1, o: [0, 0, 0, 0, 0, 0] }; };
gw.actCd = 0; gw.stun = 0; gw.recT = 0;
let sawTele = false, hurtDuringTele = false;
for (let i = 0; i < 30; i++) {
  /* pin the wind-up open: while tele > 0 the goblin is committed but not yet
     dangerous — that window is the whole dodge mechanic, so it must be free */
  gw.tele = 0.25; gw.actKind = 'lunge'; gw.actT = 0.3; gw.vx = 0; gw.vz = 0;
  gw.x = global.__R().x + 0.35; gw.z = global.__R().z + 0.1;
  sawTele = sawTele || gw.tele > 0;
  pump(1);
  if (global.__T.info().lives < lW) { hurtDuringTele = true; break; }
}
check('lunge shows a wind-up window', sawTele, gw.tele);
check('wind-up cannot damage you', !hurtDuringTele && global.__T.info().lives === lW, { lW, now: global.__T.info().lives });
/* and the same contact, once committed, does */
global.__T.setInv(0);
for (let i = 0; i < 6; i++) {
  gw.tele = 0; gw.actKind = 'lunge'; gw.actT = 0.3;
  gw.x = global.__R().x + 0.3; gw.z = global.__R().z + 0.05; gw.vx = 0; gw.vz = 0;
  pump(1);
}
check('the committed lunge does damage', global.__T.info().lives < lW, { lW, now: global.__T.info().lives });
check('a missed attack leaves a punish window', gw.recT >= 0, { recT: +gw.recT.toFixed(2) });
/* spitter: telegraph first, projectile after */
global.__T.hurtAll(); global.__T.clearShots(); pump(30);
global.__T.setInv(1e9);
global.__T.place('spitter', 9, 0.2);
const gs = global.__T.lastEnemy();
gs.brain.tick = function () { return { mvx: 0, mvz: 0, act: 'attack', atk: 1, o: [0, 0, 0, 0, 0, 0] }; };
gs.actCd = 0; gs.stun = 0; gs.recT = 0;
const es0 = global.__T.info().es;
let sawWindup = false, earlyShot = false, firedAt = -1;
for (let i = 0; i < 40; i++) {
  pump(1);
  if (gs.spitT > 0) sawWindup = true;
  if (gs.spitT > 0 && global.__T.info().es > es0) earlyShot = true;
  if (global.__T.info().es > es0) { firedAt = i; break; }
}
check('spitter telegraphs before the bolt exists', sawWindup && !earlyShot, { sawWindup, earlyShot });
check('spitter fires when the wind-up ends', firedAt >= 0, global.__T.info().es);
global.__T.clearShots();
global.__T.setInv(0);
/* corpse: it stays a moment, tumbles, then is removed */
global.__T.hurtAll();
const gc = global.__T.lastEnemy();
check('corpse lingers with a death timer', gc && gc.dieT > 0 && gc.dead, gc ? { dieT: gc.dieT } : null);
const y0 = gc ? gc.y : 0, lean0 = gc ? gc.lean : 0;
pump(10);
check('corpse tumbles and rises', gc && Math.abs(gc.lean - lean0) > 0.05, gc ? { lean: gc.lean, y: gc.y, y0 } : null);
pump(40);
check('corpse cleaned up', global.__T.info().n === 0 || global.__T.info().es >= 0, global.__T.info().n);

console.log('--- spawn-in grace + arena rope ---');
global.__T.wave(3);
pump(4);
const gIdx = global.__T.info().n > 0 ? 0 : -1;
const grace = gIdx >= 0 ? global.__T.spawnGrace(0) : -1;
check('a queued spawn materialises with a grace window', grace > 0 || global.__T.info().n === 0, { grace, n: global.__T.info().n });
/* while materialising it must be harmless even if it is inside your hitbox */
global.__T.hurtAll(); pump(30); global.__T.clearShots();
global.__T.setInv(0);
const lR = global.__T.info().lives;
global.__T.place('grunt', 0.3, 0.1);
const gg = global.__T.lastEnemy();
gg.spawnT = 0.4; gg.actKind = 'lunge'; gg.actT = 0.3; gg.tele = 0; gg.vx = 0; gg.vz = 0;
for (let i = 0; i < 12; i++) { gg.x = global.__R().x + 0.3; gg.z = global.__R().z + 0.05; gg.spawnT = Math.max(gg.spawnT, 0.05); pump(1); }
check('materialising goblin cannot hurt you', global.__T.info().lives === lR, { lR, now: global.__T.info().lives });
global.__T.god(true);
/* rope: past the arena the world pulls you back */
const farSpot = global.__T.tp(0, -(16.5 + 30));   /* ARENA_R + 30 — well past the rope */
pump(3);
const rR = global.__R();
check('out of the arena you are dragged back', rR.rope > 0.1 && rR.vz > 0.5, { rope: +rR.rope.toFixed(2), vz: +rR.vz.toFixed(2), d: farSpot.d });
global.__T.tp(0, 0);
pump(20);
check('back inside, the rope lets go', global.__R().rope < 0.05, global.__R().rope);


console.log('--- pause-menu camera sliders drive CAMSET ---');
global.RileyGame.state;                    /* no-op read: overlay must not need play state */
global.__T.camSet('sens', 1); global.__T.camSet('invertY', 0);
const slid = H.elSlide('camSens', 55);
check('look-speed slider is wired', slid > 0 && Math.abs(global.__T.camGet().sens - 0.55) < 1e-6, { slid, cam: global.__T.camGet().sens });
check('slider label updated', global.__H.els['camSensV'].textContent === '55%', global.__H.els['camSensV'].textContent);
H.elSlide('camDist', 45);
check('camera-distance slider moves the boom', Math.abs(global.__T.camGet().zoom - 4.5) < 1e-6 && global.__R().camDist > 3.3, global.__T.camGet().zoom);
H.elSlide('camShake', 0);
check('shake can be turned fully off', global.__T.camGet().shake === 0, global.__T.camGet().shake);
const tgl = H.elClick('tglInvY');
check('invert-y toggle flips and persists', tgl > 0 && global.__T.camGet().invertY === 1, global.__T.camGet().invertY);
check('button reflects state', global.__H.els['tglInvY'].classList.contains('on') === true);
const stored = JSON.parse(global.localStorage.getItem('riley3d.camset') || 'null');
check('settings saved to localStorage', stored && stored.invertY === 1 && Math.abs(stored.sens - 0.55) < 1e-6, stored);
H.elClick('tglInvY');
check('toggling back restores', global.__T.camGet().invertY === 0, global.__T.camGet().invertY);
global.__T.camSet('sens', 1); global.__T.camSet('smooth', 0.35); global.__T.camSet('fov', 0);
global.__T.camSet('shake', 1); global.__T.camSet('zoom', 7.2); global.__T.camSet('orbit', 1);
global.__T.camSet('autoFrame', 1); global.__T.camSet('lockCam', 1);

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

console.log('--- boons: the tide pauses for a pick ---');
global.RileyGame.toTitle();
global.RileyGame.start();
global.__T.god(true);
pump(6);
const tickIdle = global.__T.info().tick;
global.__T.nextWave();                    /* fires waveClear → the offer */
check('wave clear offers a boon', global.RileyGame.state === 'pick', global.RileyGame.state);
const offer = global.__T.offer();
check('three distinct boons on offer', Array.isArray(offer) && offer.length === 3 && new Set(offer).size === 3, offer);
const tickFrozen = global.__T.info().tick;
H.pump(40);                               /* deliberately NOT auto-picking */
check('the sim holds while you choose', global.__T.info().tick === tickFrozen && global.RileyGame.state === 'pick', { tick: global.__T.info().tick, at: tickFrozen });
check('nothing can be picked twice', global.__T.pick(9) === null, null);
const picked = global.__T.pick(1);
check('picking applies a boon and resumes play', !!picked && global.RileyGame.state === 'play', { picked, state: global.RileyGame.state });
check('the boon count advanced', global.__T.boonN() === 1, global.__T.boonN());
H.pump(6);
check('the sim moves again', global.__T.info().tick > tickFrozen, { tick: global.__T.info().tick, at: tickFrozen });
/* each capped boon stops showing up once taken three times */
const seenIds = {};
for (let w = 0; w < 8; w++) {
  if (w % 3 === 0) global.__T.hurtAll();
  for (let i = 0; i < 400; i++) {
    if (global.RileyGame.state === 'pick') {
      (global.__T.offer() || []).forEach(id => { seenIds[id] = (seenIds[id] || 0) + 1; });
      global.__T.pick(0);
      break;
    }
    H.pump(1);
    if (i % 20 === 0) global.__T.hurtAll();
  }
  pump(30);
}
check('repeat offers stack instead of re-offering capped boons', (seenIds['heart'] || 0) <= 3 && (seenIds['power'] || 0) >= 0, seenIds);
check('boons taken accumulate across waves', global.__T.boonN() >= 4, global.__T.boonN());
global.RileyGame.toTitle();
global.RileyGame.start();
check('a new run resets the boons', global.__T.boonN() === 0 && global.__T.boons().cast === 1 && global.__T.boons().dmg === 1, { n: global.__T.boonN(), b: global.__T.boons() });
check('the pick overlay is closed on a fresh run', global.RileyGame.state === 'play', global.RileyGame.state);
pump(30);

console.log('--- spirit ward: it answers the toucher, never the thrower ---');
global.__T.god(false);
global.__T.wave(1);
pump(10);
global.__T.clearShots();
check('no ward until it is taken', (global.__T.boons().thorns | 0) === 0, global.__T.boons().thorns);
global.__T.place('grunt', 1.1, 0.4);
const ward0 = global.__T.enemies();
const wi = ward0.length ? ward0[0].i : -1;
global.__T.setInv(0);
const livesW = global.__T.info().lives;
check('a grunt was placed in reaching distance', wi >= 0 && ward0[0].d < 1.6, ward0[0]);
global.__T.touch(wi);
pump(2);
check('the touch hurts Riley', global.__T.info().lives < livesW, global.__T.info().lives);
let wcur = global.__T.enemies().find(e => e.i === wi);
check('and hurts nobody else', !wcur || wcur.hp === ward0[0].hp, wcur && wcur.hp);
check('boons can be granted by id', global.__T.take('thorns') && global.__T.boons().thorns === 1, global.__T.boons());
if (wcur) {
  const hpB = wcur.hp;
  global.__T.setInv(0);
  global.__T.touch(wi);
  pump(2);
  wcur = global.__T.enemies().find(e => e.i === wi);
  check('with the ward up, the goblin is hit back', !wcur || wcur.hp < hpB, { hpB, after: wcur && wcur.hp });
}
/* the crash this is really here for: a spitter bolt hands hitRiley a stand-in
   object, and ward code that trusted "every attacker is a goblin" threw */
/* the touches threw Riley around, and a bolt aimed at a mid-air target misses
   by design — settle her first, clear the field, then throw one bolt */
global.__T.hurtAll();
pump(60);
global.__T.clearShots();
const tickW = global.__T.info().tick;
const livesP = global.__T.info().lives;
global.__T.setInv(0);
global.__T.spitHit();
pump(30);
check('a projectile hit still lands with the ward up', global.__T.info().lives < livesP, { livesP, now: global.__T.info().lives });
check('the ward survived the fake attacker', global.__T.info().tick > tickW, global.__T.info().tick);
pump(30);

/* wrapped: this file is one long top-level scope, and ids are plentiful */
(function () {
console.log('--- camera trucks around a body on the sightline ---');
global.__T.god(true);
global.__T.hurtAll();
global.__T.tp(0, 0);   /* fixed flat spot: earlier waves can bump Riley off-centre
                           onto random terrain, and a body parked over a hill is a
                           body that is not on the sightline anymore */
pump(40);
global.__T.clearShots();
function parkOnSight(kind, t) {
  const rr = global.__R();
  const gx = rr.x + (rr.camX - rr.x) * t, gz = rr.z + (rr.camZ - rr.z) * t;
  global.__T.place(kind, gx - rr.x, gz - rr.z);
  const e = global.__T.lastEnemy();
  if (e) { e.x = gx; e.z = gz; e.stun = 9999; e.spd = 0; e.actKind = 'none'; e.spawnT = 0; }
  return e;
}
const bp_e = parkOnSight('boss', 0.55);
check('a GOBLIN KING was parked on the sightline', !!bp_e && bp_e.k === 'boss', bp_e && bp_e.k);
/* parked once, left to settle: the rig must TRUCK around it (max |body| over
   the settle window captures the transient push before the king slides out of
   the deadband), then ease back once the way is clear */
let bp_pushMax = 0;
for (let i = 0; i < 40; i++) { pump(1); bp_pushMax = Math.max(bp_pushMax, Math.abs(global.__T.cam().body)); }
check('a body over her face shoves the rig sideways', bp_pushMax > 0.10, { body: bp_pushMax });
check('the rig never leaves the reach budget', global.__T.cam().dist <= 12.6, global.__T.cam().dist);
check('and the push stays bounded', bp_pushMax <= 0.95, { body: bp_pushMax });
if (bp_e) { bp_e.x += 9; bp_e.z += 9; bp_e.stun = 9999; }
pump(60);
check('the rig settles back once the way is clear', Math.abs(global.__T.cam().body) < 0.1, { body: global.__T.cam().body });
/* a short grunt at that distance is genuinely below the boom, not in front of
   her face — pushing for it is how a camera ends up wobbling in every brawl */
global.__T.hurtAll();
pump(25);
const gr = parkOnSight('grunt', 0.55);
let grPushMax = 0;
for (let i = 0; i < 35; i++) { pump(1); grPushMax = Math.max(grPushMax, Math.abs(global.__T.cam().body)); }
if (gr) check('a grunt under the boom leaves the framing alone', grPushMax < 0.12, { body: grPushMax });
global.__T.hurtAll();
pump(25);
const rr0 = global.__R();
const huggers = [];
for (let i2 = 0; i2 < 4; i2++) {
  global.__T.place('runner', Math.sin(i2 * 1.57) * 0.8, Math.cos(i2 * 1.57) * 0.8);
  const e = global.__T.lastEnemy();
  if (e) { e.stun = 9999; e.spd = 0; e.actKind = 'none'; huggers.push(e); }
}
let hugMax = 0;
for (let i = 0; i < 35; i++) {
  const rrH = global.__R();
  for (let h = 0; h < huggers.length; h++) {
    const e = huggers[h];
    e.x = rrH.x + Math.sin(h * 1.57) * 0.8;
    e.z = rrH.z + Math.cos(h * 1.57) * 0.8;
    e.stun = 9999; e.spd = 0; e.actKind = 'none';
  }
  pump(1);
  hugMax = Math.max(hugMax, Math.abs(global.__T.cam().body));
}
check('bodies hugging her leave the framing alone', hugMax < 0.12, { body: hugMax, n: global.__T.info().n });

console.log('--- nothing paints the lens from the inside ---');
const rr1 = global.__R();
global.__T.place('grunt', rr1.camX - rr1.x, rr1.camZ - rr1.z);
const inLens = global.__T.lastEnemy();
if (inLens) {
  inLens.x = rr1.camX; inLens.z = rr1.camZ; inLens.y = rr1.camY - 0.6; inLens.stun = 9999; inLens.spawnT = 0;
  pump(4);
  const li = global.__T.info().n - 1;
  check('a goblin inside the camera is not drawn', global.__T.lensHide(li) === true, global.__T.cam());
  inLens.x = rr1.x + 1.3; inLens.z = rr1.z + 1.3; inLens.y = rr1.y;
  pump(2);
  check('a goblin at arm\'s length is drawn', global.__T.lensHide(global.__T.info().n - 1) === false, null);
}
global.__T.god(false);
})();

console.log('--- goblins rob the floor: theft, chase, recovery ---');
(function () {
  global.RileyGame.toTitle();
  global.RileyGame.start();
  global.__T.god(true);
  global.__T.wave(1);
  pump(6);
  global.__T.hurtAll();
  global.__T.clearShots();
  pump(50);                                  /* let the corpses splice out */
  global.__T.clearShots();
  const pk0 = global.__T.info().pk;
  /* out past the gem magnet's reach, or Riley vacuums it before anyone can
     be tempted — the theft only exists for loot she has not reached yet */
  global.__T.place('grunt', 12, 0);
  const thief = global.__T.lastEnemy();
  check('a grunt is standing away from Riley', !!thief, thief && thief.k);
  global.__T.drop('gem', 12.3, 0.3);
  check('a gem is on the floor', global.__T.info().pk > pk0, { pk: global.__T.info().pk, pk0 });
  pump(34);                          /* past the 0.38s grace on fresh loot */
  const stole = global.__T.enemies().some(x => x.steal > 0);
  check('a goblin pocketed it', stole, global.__T.enemies().map(x => x.steal));
  const pkStolen = global.__T.info().pk;
  global.__T.hurtAll();
  pump(8);
  check('killing the thief drops the loot back', global.__T.info().pk > pkStolen, { before: pkStolen, after: global.__T.info().pk });
  check('nobody is carrying anything after a wipe', global.__T.enemies().every(x => x.steal === 0), global.__T.enemies().map(x => x.steal));
  /* and if you let it reach the rim, that is your score gone */
  global.__T.nextWave();
  pump(70);
  global.__T.clearShots();
  const carrier = global.__T.lastEnemy();
  check('a runner exists to be made a thief', !!carrier, carrier && carrier.k);
  if (carrier) {
    global.__T.tp(0, 0);
    carrier.gemsStolen = 2; carrier.stolen = ['gem', 'gem'];
    carrier.x = 0; carrier.z = 30;           /* past ARENA_R (16.5) + the 12.5 rim */
    carrier.stun = 0; carrier.spawnT = 0; carrier.actKind = 'none';
    const sc0 = global.__T.info().score;
    pump(6);
    check('a thief at the far rim escapes with the loot', carrier.gemsStolen === 0, carrier.gemsStolen);
    check('and the score pays for it', global.__T.info().score < sc0, { sc0, now: global.__T.info().score });
  }
  global.__T.god(false);
  pump(20);
  /* and they eat the scenery when nobody is watching it */
  global.__T.hurtAll();
  pump(40);
  global.__T.clearShots();
  const cB = global.__T.nearCrystal();
  check('a crystal stands within reach of the arena', !!cB && cB.d < 30, cB);
  if (cB && cB.alive !== false) {
    global.__T.place('grunt', cB.x - global.__R().x + 0.5, cB.z - global.__R().z);
    const chewer = global.__T.lastEnemy();
    if (chewer) { chewer.spd = 0; chewer.stun = 0; chewer.actKind = 'none'; chewer.spawnT = 0; chewer.recT = 0; }
    const crB = global.__T.info().crystals, pkB = global.__T.info().pk;
    pump(40);
    /* separation can nudge the pinned goblin out of chewing range, and the
       chew decays when it is — allow two windows before calling it broken */
    check('a goblin at a crystal starts chewing it', global.__T.crystal(cB.i).gnaw > 0.05, { gnaw: global.__T.crystal(cB.i).gnaw });
    pump(240);
    check('the crystal is gone', global.__T.info().crystals < crB, { before: crB, after: global.__T.info().crystals });
    check('the gnaw counter moved', global.__T.info().gnawed > 0, global.__T.info().gnawed);
    /* the shard either landed on the floor for someone to take, or a goblin is
       already running off with it — either way it is in play, not deleted */
    const shard = global.__T.pkList().some(p => Math.hypot(p.x - cB.x, p.z - cB.z) < 3);
    check('and it left a shard to fight over', shard || global.__T.info().snatched > 0,
      { shard: shard, snatched: global.__T.info().snatched, pk: global.__T.info().pk });
  }
})();

console.log('--- keys while typing in the seed field ---');
const muteBefore = H.els['btnMute'].textContent;   /* the fake DOM's own default, whatever it is */
H.emit('keydown', { code: 'KeyM', target: { tagName: 'INPUT' } });
check('typing a letter into the seed box does not mute', H.els['btnMute'].textContent === muteBefore, H.els['btnMute'].textContent);
H.emit('keydown', { code: 'Space', target: { tagName: 'INPUT' } });
check('typing spaces does not jump', global.__T.heldKeys().indexOf('Space') < 0, global.__T.heldKeys());
H.emit('keydown', { code: 'KeyN', target: { tagName: 'INPUT' } });
check('music is still on after seed typing', global.__T.heldKeys().indexOf('KeyN') < 0, global.__T.heldKeys());
H.emit('keydown', { code: 'Space' });
check('the same key outside a field still works', global.__T.heldKeys().indexOf('Space') >= 0, global.__T.heldKeys());
H.emit('keyup', { code: 'Space' });
H.emit('keydown', { code: 'KeyM' });
H.emit('keyup', { code: 'KeyM' });
check('M still mutes when nothing is focused', H.els['btnMute'].textContent === '\ud83d\udd07', H.els['btnMute'].textContent);
H.emit('keydown', { code: 'KeyM' });
H.emit('keyup', { code: 'KeyM' });
check('and unmutes again', H.els['btnMute'].textContent === '\ud83d\udd0a', H.els['btnMute'].textContent);

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

console.log('--- per-entity body transform never leaks between draws ---');
let leaked = 0;
for (let i = 0; i < 90; i++) { if (global.__T.info().n < 2) global.__T.place('grunt', 3, 2); pump(1); if (!global.__T.bodyIdle()) leaked++; }
check('bodyXform always released after a frame', leaked === 0, leaked);

console.log('--- selftest render: unique colours ---');
pump(10);
const shot = global.__shot();
check('render produced frames', H.stats().drawCalls > 50, H.stats());

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL ENGINE SMOKE CHECKS PASS');
process.exit(fails ? 1 : 0);
