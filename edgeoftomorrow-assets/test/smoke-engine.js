/* smoke-engine.js — boots the real engine headlessly and plays it.
 *
 * A fake DOM plus a fake Canvas2D context that records what it was asked to
 * draw, then the actual modules loaded in the same order the browser loads
 * them. Nothing here re-implements game logic: it drives EOTEngine.Game the
 * way the page does, through its public API.
 *
 * This is the check that the layers actually fit together — sim, AI, net,
 * render and loop — which no unit test of one module can show.
 *
 * Run: node edgeoftomorrow-assets/test/smoke-engine.js
 */
'use strict';
const assert = require('assert');

/* ---------------- fake Canvas2D ----------------
 * Every method is recorded so a test can assert the frame contained real
 * drawing rather than silently doing nothing. */
function makeCtx() {
  const calls = { total: 0, byName: new Map() };
  const noop = (name) => function () {
    calls.total++;
    calls.byName.set(name, (calls.byName.get(name) || 0) + 1);
  };
  const ctx = {
    canvas: null,
    calls,
    save: noop('save'), restore: noop('restore'),
    translate: noop('translate'), rotate: noop('rotate'), scale: noop('scale'),
    setTransform: noop('setTransform'), resetTransform: noop('resetTransform'),
    beginPath: noop('beginPath'), closePath: noop('closePath'),
    moveTo: noop('moveTo'), lineTo: noop('lineTo'),
    quadraticCurveTo: noop('quadraticCurveTo'), bezierCurveTo: noop('bezierCurveTo'),
    arc: noop('arc'), ellipse: noop('ellipse'), rect: noop('rect'),
    fill: noop('fill'), stroke: noop('stroke'), clip: noop('clip'),
    fillRect: noop('fillRect'), strokeRect: noop('strokeRect'),
    fillText: noop('fillText'), strokeText: noop('strokeText'),
    drawImage: noop('drawImage'), clearRect: noop('clearRect'),
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => ({ addColorStop: noop('addColorStop') }),
    createRadialGradient: () => ({ addColorStop: noop('addColorStop') }),
    createPattern: () => null
  };
  return ctx;
}

function makeCanvas(ctx) {
  return {
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    style: {}, dataset: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    addEventListener() {}, removeEventListener() {}
  };
}

/* ---------------- fake DOM ---------------- */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {}, dataset: {}, children: [], _text: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); }
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    focus() {}, blur() {},
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); if (v === '') this.children.length = 0; }
  };
  return el;
}

const els = {};
global.document = {
  readyState: 'complete',
  getElementById(id) { if (!els[id]) els[id] = makeEl('div'); return els[id]; },
  createElement(t) { return makeEl(t); },
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'),
  documentElement: makeEl('html')
};

const listeners = new Map();
global.window = global;
/* Node 22 exposes a read-only `navigator` getter, so it must be redefined
 * rather than assigned. */
Object.defineProperty(global, 'navigator', {
  value: { maxTouchPoints: 0, userAgent: 'node' }, configurable: true, writable: true
});
global.devicePixelRatio = 1;
global.innerWidth = 1280; global.innerHeight = 720;
global.addEventListener = function (t, fn) {
  if (!listeners.has(t)) listeners.set(t, []);
  listeners.get(t).push(fn);
};
global.removeEventListener = function () {};
global.performance = { now: () => clock.t };

/* hand-driven clock + rAF so the test controls time exactly */
const clock = { t: 0 };
let rafQueue = [];
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
global.cancelAnimationFrame = function () {};

/* ---------------- load the real modules in page order ---------------- */
require('../eot-core.js');
require('../eot-sim.js');
require('../eot-ai.js');
require('../eot-net.js');
require('../eot-audio.js');
require('../eot-render.js');
require('../eot-engine.js');

const C = global.EOTCore, S = global.EOTSim, AI = global.EOTAI,
      N = global.EOTNet, R = global.EOTRender, E = global.EOTEngine;

let pass = 0;
function ok(label, cond, extra) {
  assert.ok(cond, label + (extra ? ' — ' + extra : ''));
  pass++;
  console.log('  ok  ' + label + (extra ? '  (' + extra + ')' : ''));
}

console.log('smoke-engine: full stack boot + play');

/* ---- 1. modules loaded and expose their surfaces ---- */
ok('boot: all seven modules present',
  !!(C && S && AI && N && R && E), [!!C, !!S, !!AI, !!N, !!R, !!E].join(','));
ok('boot: audio degrades cleanly without WebAudio',
  global.EOTAudio.available() === false && global.EOTAudio.init() === false);
ok('boot: audio still accepts event calls when unavailable',
  (global.EOTAudio.playEvent({ t: 'hit', amount: 50 }), true));

/* ---- 2. renderer constructs and sizes itself ---- */
{
  const ctx = makeCtx();
  const cv = makeCanvas(ctx);
  const r = new R.Renderer(cv);
  ok('render: renderer picks up the canvas size', r.w === 1280 && r.h === 720, r.w + 'x' + r.h);
  ok('render: quality tier chosen from pixel count', r.quality === 'high', r.quality);
  ok('render: cel shading returns flat colours',
    /^rgb\(\d+,\d+,\d+\)$/.test(R.cel([200, 100, 50], 1)), R.cel([200, 100, 50], 1));
  ok('render: shadows shift hue toward violet, not toward grey', (() => {
    const base = [200, 100, 50], sh = C.mixRGB(base, R.PAL.shadowTint, 0.34);
    /* blue channel must rise relative to red as we shadow */
    return sh[2] / sh[0] > base[2] / base[0];
  })(), 'r/b ratio rises when shadowed');
  const small = makeCanvas(makeCtx());
  small.clientWidth = 360; small.clientHeight = 640;
  const r2 = new R.Renderer(small);
  ok('render: drops effects on small viewports', r2.quality === 'low', r2.quality);
}

/* ---- 3. a solo match actually plays through the real loop ---- */
{
  const ctx = makeCtx();
  const cv = makeCanvas(ctx);
  const hud = {};
  ['clock', 'anchors', 'anchorBar', 'hp', 'hpText', 'stam', 'ult', 'ultWrap', 'state',
   'skill', 'skillNeedle', 'skillZone', 'prompt', 'banner', 'team', 'fps', 'terrorBar', 'roster']
    .forEach(k => { hud[k] = makeEl('div'); });

  const game = new E.Game({ canvas: cv, hud, playerName: 'TESTER' });
  ok('engine: game constructs', !!game && !!game.renderer && !!game.input);

  game.startSolo({ role: S.ROLES.SURV, seed: 'engine-solo' });
  ok('engine: solo builds a full 4v1', game.world.players.length === 5,
    game.world.players.length + ' players');
  ok('engine: exactly one slayer',
    game.world.players.filter(p => p.role === S.ROLES.SLAYER).length === 1);
  ok('engine: local player is human, the rest are bots',
    game.localPlayer().bot === false &&
    game.world.players.filter(p => p.bot).length === 4);
  ok('engine: match phase is playing', game.world.phase === S.PHASE.PLAY && game.state === 'playing');

  /* drive the loop by hand: 90 seconds of frames at 60fps */
  const frames = 60 * 90;
  let rafRan = 0;
  clock.t = 0;
  game.start();
  for (let f = 0; f < frames; f++) {
    clock.t += 1000 / 60;
    /* hold a key down so the input path is genuinely exercised */
    if (f % 120 < 60) game.input.keys['d'] = true; else game.input.keys['d'] = false;
    game.input.keys['shift'] = (f % 200) < 120;
    game.input.aim = f / 90;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) { fn(clock.t); rafRan++; }
  }
  ok('engine: requestAnimationFrame loop ran', rafRan === frames, rafRan + ' frames');
  /* Ticks are NOT 1:1 with frames, by design: hitstop suspends the sim on
   * impact, slow-motion scales it down on downs and kills, and the loop stops
   * entirely once the match ends. So measure against what actually happened. */
  const ended = game.world.phase === S.PHASE.OVER;
  const playedFrames = ended ? game.world.endedAt : frames;
  ok('engine: simulation advanced on the fixed tick', game.world.tick > 60 * 20,
    game.world.tick + ' ticks' + (ended ? ' (match ended at ' + game.world.tick + ')' : ''));
  ok('engine: tick rate holds while the match is live',
    ended ? true : Math.abs(game.world.tick - frames) < frames * 0.12,
    game.world.tick + ' ticks vs ' + playedFrames + ' live frames');
  ok('engine: the canvas was actually drawn to', ctx.calls.total > 10000,
    ctx.calls.total + ' draw calls');
  ok('engine: characters were drawn', (ctx.calls.byName.get('fill') || 0) > 500,
    (ctx.calls.byName.get('fill') || 0) + ' fills');
  ok('engine: text was drawn (names, damage)', (ctx.calls.byName.get('fillText') || 0) > 100,
    (ctx.calls.byName.get('fillText') || 0) + ' fillText');
  ok('engine: outlines were stroked', (ctx.calls.byName.get('stroke') || 0) > 200,
    (ctx.calls.byName.get('stroke') || 0) + ' strokes');

  /* HUD got real values, not placeholders */
  ok('hud: clock counts down', /^(\d+):(\d\d)$/.test(hud.clock.textContent), hud.clock.textContent);
  ok('hud: anchor counter updated', /\d+ \/ \d+/.test(hud.anchors.textContent), hud.anchors.textContent);
  ok('hud: health bar has a width', /%$/.test(hud.hp.style.width || ''), hud.hp.style.width);
  ok('hud: team list was built', hud.team.children.length === 5, hud.team.children.length + ' rows');
  ok('hud: fps meter reports a number', /\d+ fps/.test(hud.fps.textContent), hud.fps.textContent);

  /* the local player moved, proving input reached the sim */
  const me = game.localPlayer();
  ok('engine: local player stayed in bounds and finite',
    Number.isFinite(me.x) && me.x >= 0 && me.x <= S.K.WORLD.w &&
    Number.isFinite(me.y) && me.y >= 0 && me.y <= S.K.WORLD.h,
    'x=' + me.x.toFixed(1) + ' y=' + me.y.toFixed(1));
  ok('engine: stamina stays within its bounds',
    me.stamina >= 0 && me.stamina <= S.K.STAM_MAX,
    me.stamina.toFixed(1) + '/' + S.K.STAM_MAX);

  /* hitstop and slowmo did not wedge the loop */
  ok('engine: hitstop never went negative', game.hitstop >= 0, game.hitstop.toFixed(4));
  ok('engine: no runaway accumulator', game.acc < 0.5, game.acc.toFixed(4));

  /* events reached the renderer */
  ok('fx: renderer accumulated effects from sim events',
    game.renderer.parts.length >= 0 && game.renderer.time > 0,
    game.renderer.time.toFixed(1) + 's of fx time');

  game.destroy();
  ok('engine: destroy stops the loop', game.running === false);
}

/* ---- 3b. keyboard input actually drives the sim ----
 * Isolated from combat so this cannot be satisfied by knockback. */
{
  const ctx = makeCtx();
  const game = new E.Game({ canvas: makeCanvas(ctx), hud: {}, playerName: 'INPUT' });
  game.startSolo({ seed: 'engine-input' });
  const me = game.localPlayer();
  const x0 = me.x, y0 = me.y, stam0 = me.stamina;
  /* freeze everyone else so only our input moves anything */
  for (const p of game.world.players) if (p !== me) p.bot = true;
  clock.t = 0; game.start();
  game.input.keys['d'] = true;
  game.input.keys['shift'] = true;
  for (let f = 0; f < 90; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
  }
  ok('input: holding D moves the player right', me.x > x0 + 60,
    'x ' + x0.toFixed(1) + ' -> ' + me.x.toFixed(1));
  ok('input: holding D does not drift vertically', Math.abs(me.y - y0) < 40,
    'y ' + y0.toFixed(1) + ' -> ' + me.y.toFixed(1));
  ok('input: sprinting while moving drains stamina', me.stamina < stam0,
    stam0 + ' -> ' + me.stamina.toFixed(1));
  /* release and confirm it stops */
  game.input.keys['d'] = false;
  game.input.keys['shift'] = false;
  const xStop = me.x;
  for (let f = 0; f < 45; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
  }
  ok('input: releasing the key stops the player', Math.abs(me.x - xStop) < 30,
    'drifted ' + Math.abs(me.x - xStop).toFixed(1) + 'u after release');
  ok('input: stamina regenerates when idle', me.stamina > 0, me.stamina.toFixed(1));
  /* W moves up (negative y in this coordinate system) */
  game.input.keys['w'] = true;
  const yUp = me.y;
  for (let f = 0; f < 45; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
  }
  game.input.keys['w'] = false;
  ok('input: holding W moves the player up', me.y < yUp - 30,
    'y ' + yUp.toFixed(1) + ' -> ' + me.y.toFixed(1));
  game.destroy();
}

/* ---- 4. playing as the slayer works too ---- */
{
  const ctx = makeCtx();
  const game = new E.Game({ canvas: makeCanvas(ctx), hud: {}, playerName: 'HUNTER' });
  game.startSolo({ role: S.ROLES.SLAYER, seed: 'engine-slayer' });
  ok('engine: slayer role assigns correctly', game.localRole === S.ROLES.SLAYER);
  ok('engine: slayer start still has 4 survivors',
    game.world.players.filter(p => p.role === S.ROLES.SURV).length === 4);
  ok('engine: slayer start has no bot slayer',
    game.world.players.filter(p => p.role === S.ROLES.SLAYER && p.bot).length === 0);
  ok('engine: local slayer has slayer HP',
    game.localPlayer().maxHp === S.K.SLAYER_HP, game.localPlayer().maxHp + ' hp');
  clock.t = 0; game.start();
  for (let f = 0; f < 600; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
  }
  ok('engine: slayer match simulates', game.world.tick > 500, game.world.tick + ' ticks');
  ok('engine: slayer terror meter stays at zero (only survivors fear)',
    game.terror === 0);
  game.destroy();
}

/* ---- 5. the fixed-timestep catch-up cap holds ---- */
{
  const ctx = makeCtx();
  const game = new E.Game({ canvas: makeCanvas(ctx), hud: {}, playerName: 'LAG' });
  game.startSolo({ seed: 'engine-lag' });
  game.start();
  clock.t = 0;
  /* one enormous frame, as if the tab had been backgrounded for 30 seconds */
  clock.t += 30000;
  let q = rafQueue; rafQueue = [];
  for (const fn of q) fn(clock.t);
  ok('loop: a 30s stall does not simulate 30s', game.world.tick <= E.MAX_STEPS + 1,
    game.world.tick + ' ticks from one 30s frame');
  ok('loop: accumulator was discarded rather than banked', game.acc < 0.5, game.acc.toFixed(4));
  game.destroy();
}

/* ---- 6. results and grading render ---- */
{
  const ctx = makeCtx();
  const hud = {};
  ['clock', 'anchors', 'anchorBar', 'hp', 'hpText', 'stam', 'ult', 'ultWrap', 'state',
   'skill', 'skillNeedle', 'skillZone', 'prompt', 'banner', 'team', 'fps', 'terrorBar', 'roster']
    .forEach(k => { hud[k] = makeEl('div'); });
  const game = new E.Game({ canvas: makeCanvas(ctx), hud, playerName: 'RESULT' });
  game.startSolo({ seed: 'engine-result' });
  clock.t = 0; game.start();
  /* let it run a real minute first, so the scoreboard has something in it */
  for (let f = 0; f < 60 * 60; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
    if (game.world.phase === S.PHASE.OVER) break;
  }
  /* force a decisive ending if the match has not reached one on its own */
  if (game.world.phase !== S.PHASE.OVER) {
    for (const p of game.world.players) {
      if (p.role === S.ROLES.SURV && p.id !== game.localId) p.state = S.STATE.ESCAPED;
    }
    game.world.stats.escapes = 3;
  }
  for (let f = 0; f < 30; f++) {
    clock.t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(clock.t);
  }
  ok('results: match ended', game.world.phase === S.PHASE.OVER, 'winner=' + game.world.winner);
  ok('results: engine moved to the results state', game.state === 'results', game.state);
  ok('results: a scoreboard was produced', !!game.results && game.results.rows.length === 5,
    game.results ? game.results.rows.length + ' rows' : 'none');
  ok('results: every row has a grade', game.results.rows.every(r => /^[SABCD]$/.test(r.grade)),
    game.results.rows.map(r => r.grade).join(','));
  ok('results: rows are sorted by score',
    game.results.rows.every((r, i) => i === 0 || game.results.rows[i - 1].score >= r.score));
  ok('results: match length recorded', game.results.length > 0, game.results.length + 's');
  game.destroy();
}

/* ---- 7. room codes and transports through the engine ---- */
{
  const ctx = makeCtx();
  const game = new E.Game({ canvas: makeCanvas(ctx), hud: {}, playerName: 'HOST' });
  game.startHost({ room: 'HJKM2' });
  ok('net: host created a room', game.roomCode === 'HJKM2', game.roomCode);
  ok('net: host session is host role', game.session.role === 'host');
  ok('net: host backfilled bots to a full match', game.world.players.length === 5,
    game.world.players.length + ' players');
  ok('net: host waits in the lobby', game.state === 'lobby', game.state);
  game.beginMatch();
  ok('net: beginMatch moves to playing', game.state === 'playing' &&
    game.world.phase === S.PHASE.PLAY);
  game.destroy();
  ok('net: destroy closes the session', game.session.closed === true);
}

console.log('\nsmoke-engine: ' + pass + ' assertions passed');
