/* Headless playtest — a scripted bot plays Riley with the *real* keyboard
 * input path and the run is measured. No browser, no screenshots: this is the
 * closest thing to a playtest that fits in CI, and it answers questions the
 * unit checks can't: how long a wave actually takes, whether the player can
 * get cornered, whether the camera is buried in scenery, whether a run dies at
 * wave 3 or cruises to 20.
 *
 *   node riley-assets/test/playtest.js [seconds] [report|quiet]
 *
 * It is deliberately a *bad* player (no lock-on, no charge timing, no nova
 * aiming) — if the game is fun and fair for a bad player it is fine for a good
 * one. Balance conclusions from an optimal bot are worthless.
 */
'use strict';
const H = require('./harness.js').boot();

const SECONDS = +(process.argv[2] || 90);
const QUIET = process.argv[3] === 'quiet';
const log = (...a) => { if (!QUIET) console.log(...a); };

/*   node riley-assets/test/playtest.js [seconds] [report|quiet] [zelda|mouse]
 *
 * zelda (default): the shipping scheme — no pointer lock, the follow-cam and
 * TAB Z-targeting do the framing, attacks go where the bot faces / at the
 * target. mouse: the bot holds the pointer and aims with mousemove deltas,
 * the classic third-person path (still supported when the browser grants the
 * lock). Both drive the game through the real key/mouse handlers. */
const SCHEME = process.argv[4] === 'mouse' ? 'mouse' : 'zelda';
if (SCHEME === 'mouse') {
  global.document.pointerLockElement = H.els['cv'];
  H.emit('pointerlockchange', {});
}
/* fixed seed: the same world and the same goblin dice every run, so a number
   in this report is a number you can chase down */
H.els['seedInput'].value = 'BOTRUN-7';
global.RileyGame.start();
global.__T.god(false);
global.__T.wave(1);

/* held-key helper — the bot drives keys, not internals, so it trips the same
   code the player does (pollInputLive → netcode input → stepPlayer) */
const held = {};
function key(code, on) {
  if (!!on === !!held[code]) return;
  held[code] = !!on;
  global.__T.key(code, !!on);
}
function clearKeys() { Object.keys(held).forEach(k => key(k, false)); }

const stats = {
  frames: 0, shots: 0, swings: 0, dashes: 0, jumps: 0,
  camBlockSum: 0, camBlockMax: 0, distMax: 0, distMin: 99,
  stuckFrames: 0, hurtAt: -999, deaths: 0,
  waveTimes: [], waveStart: 0, lastWave: 1, stuck: [], lensFrames: 0
};
let prevLives = global.__T.info().lives;

for (let f = 0; f < SECONDS * 60; f++) {
  const info = global.__T.info();
  if (info.state === 'pick') { global.__T.pick(f % 3); H.frame(); continue; }
  if (info.state !== 'play') { H.frame(); continue; }
  const r = global.__R();
  const b = global.__T.basis();
  const list = global.__T.enemies();
  const near = list.length ? list[0] : null;

  /* ---- steering: want to be near a goblin but not inside a crowd ---- */
  let tx = 0, tz = 0, want = 0;
  if (near) {
    const ring = list.length > 4 ? 4.2 : 2.4;            /* stay on the rim of a crowd */
    const dx = near.x - r.x, dz = near.z - r.z, d = Math.hypot(dx, dz) || 1;
    if (d > ring) { tx = dx / d; tz = dz / d; want = 1; }
    else if (d < ring * 0.55) { tx = -dx / d; tz = -dz / d; want = 1; }
    else { tx = -dz / d; tz = dx / d; want = 0.7; }      /* otherwise circle */
  } else { tx = 0; tz = 0; want = 0; }
  /* world direction → the stick basis, then into WASD. Z-targeted, the
     stick is target-relative (W closes, A/D circle), exactly the rule the
     player feels; otherwise it is the camera's own basis. */
  let fx = b.fwd[0], fz = b.fwd[2], rx = b.right[0], rz = b.right[2];
  if (r.lockOn) {
    const lk = list.find(e => e.k === r.lockOn);
    if (lk) { const ld = Math.hypot(lk.x - r.x, lk.z - r.z) || 1; fx = (lk.x - r.x) / ld; fz = (lk.z - r.z) / ld; rx = -fz; rz = fx; }
  }
  const fwd = tx * fx + tz * fz;
  const rgt = tx * rx + tz * rz;
  const moving = want > 0;
  key('KeyW', moving && fwd > 0.3);
  key('KeyS', moving && fwd < -0.3);
  key('KeyD', moving && rgt > 0.3);
  key('KeyA', moving && rgt < -0.3);

  /* ---- aim ---- */
  if (SCHEME === 'zelda') {
    /* Z-target the nearest goblin and let the game do the facing — press
       TAB when unlocked with something in reach, X to switch when the
       locked one wanders off */
    if (near && !r.lockOn && near.d < 20 && f % 12 === 0) { H.emit('keydown', { code: 'Tab' }); H.emit('keyup', { code: 'Tab' }); }
    else if (near && r.lockOn && f % 90 === 0) {
      const lk = list.find(e => e.k === r.lockOn);
      if (!lk || lk.d > near.d + 6) { H.emit('keydown', { code: 'KeyX' }); H.emit('keyup', { code: 'KeyX' }); }
    }
  } else if (near) {
    /* the bot moves the mouse, like a person would */
    const err = Math.atan2(near.x - r.x, near.z - r.z) - r.camYaw;
    const e2 = Math.atan2(Math.sin(err), Math.cos(err));
    /* mouse right = look right = yaw DEcreases (see lookDelta), so the
       correction runs against the error. Damped: a real hand does not flick
       180° in a frame. */
    const mx = Math.max(-90, Math.min(90, -e2 * 70));
    /* pitch: chest height, roughly */
    const dy = (near.y + 0.9) - (r.camEye[1]);
    const dist = Math.hypot(near.x - r.x, near.z - r.z) || 1;
    const wantP = Math.atan2(dy, dist);
    const my = Math.max(-60, Math.min(60, (wantP - r.camPitch) * 40));
    H.emit('mousemove', { movementX: Math.abs(e2) > 0.05 ? mx : 0, movementY: Math.abs(wantP - r.camPitch) > 0.04 ? my : 0, clientX: 400, clientY: 225 });
  }

  /* ---- combat ---- */
  const d = near ? near.d : 99;
  /* charge-and-release, the way a player who has found the charge plays:
     hold for a second (a full tier-2 bolt), let go, repeat. A bot that
     never lets go casts once, charges, and then stands there glowing. */
  const firing = !!near && d < 26;
  key('KeyF', firing && (f % 60) < 57);
  if (near && d < 2.1) {
    key('KeyC', f % 14 < 2);                              /* chain smacks */
    stats.swings++;
  } else key('KeyC', false);
  /* dodge: anything committed and close → dash sideways */
  const incoming = list.find(e => (e.tele > 0 || (e.act === 'lunge' && e.d < 2.4)) && e.d < 4.2);
  if (incoming && r.dashCd !== undefined) {
    key('ShiftLeft', true);
    if (!held.__dashArm) { stats.dashes++; held.__dashArm = 1; }
    setTimeout0();
  } else { key('ShiftLeft', false); held.__dashArm = 0; }
  /* hop over brutes' shockwaves and terrain lips */
  key('Space', !!(incoming && incoming.d < 2.2 && f % 5 === 0));
  if (held['Space'] && f % 30 === 0) stats.jumps++;

  /* ---- measure ---- */
  /* the lens-hide rule must be an artifact-killer, not a crowd-flicker: if a
     goblin is being hidden on a large share of frames the framing is wrong */
  let hid = 0;
  for (let q = 0; q < list.length; q++) if (global.__T.lensHide(list[q].i)) hid++;
  if (hid) stats.lensFrames++;
  const cam = global.__T.cam();
  stats.camBlockSum += cam.block; stats.camBlockMax = Math.max(stats.camBlockMax, cam.block);
  const pd = Math.hypot(r.camX - r.x, r.camY - r.y, r.camZ - r.z);
  stats.distMax = Math.max(stats.distMax, pd); stats.distMin = Math.min(stats.distMin, pd);
  /* "stuck" only counts while a movement key is actually down: geometry that
     eats a running player is a level bug, standing still to aim is a tactic */
  if (moving && Math.hypot(r.vx, r.vz) < 1.4) {
    stats.stuckFrames++;
    if (stats.stuckFrames === 90) {
      stats.stuck.push({ f, wave: info.wave, at: [+r.x.toFixed(1), +r.z.toFixed(1)], fromCentre: +Math.hypot(r.x, r.z).toFixed(1) });
    }
  } else { stats.stuckFrames = 0; }
  if (info.lives < prevLives) { stats.hurtAt = f; stats.deaths = info.lives; }
  prevLives = info.lives;
  if (info.wave !== stats.lastWave) {
    stats.waveTimes.push({ wave: stats.lastWave, frames: f - stats.waveStart, kills: info.kills, lives: info.lives });
    stats.lastWave = info.wave; stats.waveStart = f;
  }
  stats.frames = f;
  H.frame();
}
function setTimeout0() { /* dash is edge-ish: release next frame so it doesn't re-trigger on cooldown */ key('ShiftLeft', false); }

clearKeys();
const fin = global.__T.info();
const avgBlock = stats.frames ? stats.camBlockSum / stats.frames : 0;
console.log('— playtest report (' + SECONDS + 's of game time, ' + SCHEME.toUpperCase() + ' controls) —');
console.log('  wave reached      ', fin.wave, '(' + fin.state + ')');
console.log('  kills / score     ', fin.kills, '/', fin.score, ' lives left', fin.lives + '/' + global.__R().maxLives);
console.log('  hits taken        ', stats.deaths, '(combo best ×' + Math.max(1, fin.combo) + ')');
console.log('  dashes            ', stats.dashes, ' smacks attempted', stats.swings);
console.log('  loot snatched       ', fin.snatched, 'recovered', fin.recovered, 'run off with', fin.lost,
  '(a tide with nothing to steal is a tide with nothing to chase)');
console.log('  cam occluded avg  ', (avgBlock * 100).toFixed(1) + '%  peak ' + (stats.camBlockMax * 100).toFixed(0) + '%');
console.log('  cam distance      ', stats.distMin.toFixed(1) + ' … ' + stats.distMax.toFixed(1), '(rig must stay inside the 13u budget)');
console.log('  wedged on geometry  ', stats.stuck.length ? stats.stuck.length + '\u00d7 ' + JSON.stringify(stats.stuck.slice(0, 4)) : 'never');
const lensPct = stats.frames ? stats.lensFrames / stats.frames : 0;
console.log('  goblin hidden in lens', (lensPct * 100).toFixed(1) + '% of frames (a few is right, many is a broken rig)');
const wt = stats.waveTimes;
if (wt.length) {
  console.log('  wave times (s)    ', wt.slice(0, 12).map(w => (w.frames / 60).toFixed(1)).join('  '));
  const avg = wt.reduce((a, w) => a + w.frames, 0) / wt.length / 60;
  console.log('  mean wave time    ', avg.toFixed(1) + 's', '(20–75s is the fun band for a wave in an arena this size)');
}
let bad = 0;
function expect(name, ok, extra) { if (!ok) { bad++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } }
expect('bot survived and kept playing', fin.state === 'play' || fin.state === 'pick', fin.state);
expect('bot reached wave 3+', fin.wave >= 3, fin.wave);
expect('bot killed goblins', fin.kills >= SECONDS * 0.12, fin.kills);
expect('camera never left its budget', stats.distMax <= 13, { distMax: +stats.distMax.toFixed(2) });
expect('camera is not buried most of the time', avgBlock < 0.35, { avg: +avgBlock.toFixed(2) });
expect('no permanent stuck spots', stats.stuck.length <= 3, stats.stuck.length);
/* theft needs loot left lying around; a bot that stands on its gems never
   gives a thief a chance, so this is a note, not a verdict, on short runs */
if (SECONDS >= 150) expect('the thieves actually work', fin.snatched > 0, fin.snatched);
else if (!fin.snatched) console.log('  note: no theft in a short run (the bot magnets its own loot) — run 150s+ to judge the thieves');
expect('the lens-hide is rare, not constant', lensPct < 0.12, { pct: +(lensPct * 100).toFixed(1) });
if (wt.length > 2) {
  const over = wt.filter(w => w.frames / 60 > 75);
  expect('no wave drags past 75s for a weak player', over.length === 0, over.map(w => ({ wave: w.wave, s: +(w.frames / 60).toFixed(1) })));
}
console.log(bad ? '\n' + bad + ' PLAYTEST WARNINGS' : '\nPLAYTEST CLEAN');
process.exit(bad ? 1 : 0);
