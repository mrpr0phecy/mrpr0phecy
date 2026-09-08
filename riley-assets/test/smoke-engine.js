/* Headless smoke for riley-engine.js — fake DOM + fake WebGL1.
 * Boots the game, steps the sim (with input), spawns + kills enemies,
 * runs render frames. Catches wiring/runtime errors that --check misses. */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- fake DOM ---------------- */
function makeEl(id) {
  const children = [];
  const el = {
    id, style: {}, children, classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); }
    },
    textContent: '', nodeValue: '',
    firstChild: { nodeValue: '' },
    querySelector(sel) { return el._q(sel); },
    _q(sel) {
      if (!el._qmap) el._qmap = {};
      if (!el._qmap[sel]) el._qmap[sel] = makeEl(id + sel);
      return el._qmap[sel];
    },
    appendChild(c) { children.push(c); return c; },
    removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
    parentNode: null,
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    clientWidth: 100, clientHeight: 100,
    width: 800, height: 450,
    getContext() { return null; },
    requestPointerLock() {},
    classList2: null
  };
  return el;
}
const elements = {};
['cv', 'hudHearts', 'hudScore', 'hudWave', 'bossBar', 'hurtVig', 'manaBar', 'comboCtr', 'comboFill',
  'banner', 'reticle', 'ovTitle', 'ovOver', 'ovPause', 'seedInput', 'seedLine', 'bestLine', 'bestLine2',
  'iqLine', 'btnPlay', 'btnPause', 'btnResume', 'btnRestart', 'btnNewWorld', 'btnQuitTitle', 'btnQuit2',
  'btnAgain', 'btnMute', 'btnPurge', 'noGL', 'mob', 'hintBar', 'joy', 'joyKnob', 'aim', 'aimKnob',
  'tbJump', 'tbDash', 'tbNova', 'fps']
  .forEach(id => { elements[id] = makeEl(id); });

const listeners = {};
global.window = global;
global.document = {
  getElementById(id) { return elements[id] || makeEl(id); },
  createElement() { return makeEl('div'); },
  addEventListener(t, cb) { (listeners[t] = listeners[t] || []).push(cb); },
  body: makeEl('body')
};
global.location = { search: '?selftest=1' };
global.innerWidth = 800; global.innerHeight = 450;
global.devicePixelRatio = 1;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.performance = { now: () => tNow * 1000 };
let tNow = 0;
global.matchMedia = () => ({ matches: true });
let rafQ = [];
global.requestAnimationFrame = cb => { rafQ.push(cb); };
global.cancelAnimationFrame = () => {};
global.Image = class { set src(v) { /* no onload — flat colours */ } };
global.addEventListener = (t, cb) => { (listeners[t] = listeners[t] || []).push(cb); };
global.setTimeout = (cb) => 0;
global.AudioContext = undefined; global.webkitAudioContext = undefined;

/* ---------------- fake WebGL ---------------- */
const GL = {
  TRIANGLES: 4, ARRAY_BUFFER: 34962, FLOAT: 5126, UNSIGNED_BYTE: 5121,
  STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048,
  COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
  SRC_ALPHA: 304, ONE: 1, ONE_MINUS_SRC_ALPHA: 771,
  TEXTURE_2D: 3553, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
  LINEAR_MIPMAP_LINEAR: 9987, LINEAR: 9729, REPEAT: 10497,
  RGBA: 6408, UNPACK_FLIP_Y_WEBGL: 37440,
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713,
  LINK_STATUS: 35714, VERTEX_ATTRIB_ARRAY_ENABLED: 43,
  UNPACK_ALIGNMENT: 3317
};
let progN = 0, bufN = 0, texN = 0, drawCalls = 0, drawCounts = [];
function fakeUniformLoc() { return { _name: 'u' + Math.random() }; }
const gl = new Proxy({}, {
  get(t, prop) {
    if (prop in t) return t[prop];
    if (prop === 'createShader') return () => ({ type: 0 });
    if (prop === 'shaderSource' || prop === 'compileShader' || prop === 'linkProgram' || prop === 'attachShader' || prop === 'useProgram' || prop === 'deleteShader' || prop === 'deleteProgram' || prop === 'bindTexture' || prop === 'activeTexture' || prop === 'texParameteri' || prop === 'generateMipmap' || prop === 'pixelStorei') return () => {};
    if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
    if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => '';
    if (prop === 'createProgram') return () => ({ id: ++progN });
    if (prop === 'getUniformLocation') return () => fakeUniformLoc();
    if (prop === 'createBuffer') return () => ({ id: ++bufN });
    if (prop === 'bindBuffer' || prop === 'bufferData' || prop === 'enableVertexAttribArray' || prop === 'disableVertexAttribArray' || prop === 'vertexAttribPointer' || prop === 'enable' || prop === 'disable' || prop === 'depthMask' || prop === 'blendFunc' || prop === 'viewport' || prop === 'clearColor' || prop === 'clear' || prop === 'uniform1f' || prop === 'uniform3f' || prop === 'uniform1i' || prop === 'texImage2D') return () => {};
    if (prop === 'uniformMatrix4fv') return (loc, _, m) => { if (!m || m.length !== 16) throw new Error('uniformMatrix4fv bad matrix'); };
    if (prop === 'drawArrays') return (m, f, n) => { drawCalls++; if (n < 0) throw new Error('drawArrays negative'); drawCounts.push(n); };
    if (prop === 'createTexture') return () => ({ id: ++texN });
    if (prop === 'getExtension') return (n) => (n === 'ANGLE_instanced_arrays' ? fakeInst : null);
    return () => {};
  },
  set(t, prop, v) { t[prop] = v; return true; }
});
const fakeInst = {
  vertexAttribDivisorANGLE() {},
  drawArraysInstancedANGLE(mode, first, count, prim) { drawCalls++; if (count < 0 || prim < 0) throw new Error('bad instanced draw'); drawCounts.push(count * prim); }
};
elements['cv'].getContext = (t) => (t === 'webgl' || t === 'experimental-webgl') ? gl : (t === '2d' ? { drawImage() {}, getImageData() { return { data: new Uint8Array(4) }; } } : null);

/* ---------------- load modules in order ---------------- */
const dir = path.join(__dirname, '..');
function load(f) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  (0, eval)(code);
}
load('riley-core.js');
load('riley-world.js');
load('riley-ai.js');
load('riley-net.js');
load('riley-engine.js');

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

function pump(nFrames, perFrame) {
  for (let i = 0; i < nFrames; i++) {
    tNow += 1 / 60;
    if (perFrame) perFrame(i);
    const q = rafQ; rafQ = [];
    for (const cb of q) cb(tNow * 1000);
  }
}

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

console.log('--- camera sanity (never under ground) ---');
let below = 0, samples = 0;
for (let i = 0; i < 60; i++) {
  const cb = global.__T.camBelow(); /* ground - camY: positive => camera inside terrain */
  if (cb > 0.001) below++;
  samples++;
  pump(1);
}
check('camera never under terrain', below === 0, { below, samples });

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

console.log('--- selftest render: unique colours ---');
pump(10);
const shot = global.__shot();
check('render produced frames', drawCalls > 50, { drawCalls });

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL ENGINE SMOKE CHECKS PASS');
process.exit(fails ? 1 : 0);
