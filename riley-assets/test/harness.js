/* Headless boot rig shared by the engine tests: a fake DOM + fake WebGL1
 * context + a hand-driven clock, then the five riley-*.js modules loaded in
 * the same order the browser loads them from riley.html.
 *
 * Nothing here asserts anything — it exists so a test can say
 *     const H = require('./harness.js').boot();
 *     H.pump(120);
 * and get a running game. The engine exposes window.RileyGame / __T / __R,
 * so tests drive the game through those hooks (which is also how the dev
 * console pokes it) instead of re-implementing a fake input layer.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Element ids the engine looks up. Unknown ids are created on demand, so a
 * new HUD node does not have to be registered here — but keep the list in
 * step with riley.html so typos in the page surface as a missing node. */
const IDS = [
  'aim',
  'aimKnob',
  'banner',
  'bestLine',
  'bestLine2',
  'bossBar',
  'btnAgain',
  'btnDaily',
  'btnMusic',
  'btnMute',
  'btnNewWorld',
  'btnPause',
  'btnPlay',
  'btnPurge',
  'btnQuit2',
  'btnQuitTitle',
  'btnRestart',
  'btnResume',
  'buffBar',
  'camDist',
  'camDistV',
  'camFov',
  'camFovV',
  'camSens',
  'camSensV',
  'camShake',
  'camShakeV',
  'camSmooth',
  'camSmoothV',
  'comboCtr',
  'comboFill',
  'cv',
  'fps',
  'gpHint',
  'hintBar',
  'hud',
  'hudHearts',
  'hudKit',
  'hudScore',
  'hudWave',
  'hurtVig',
  'iqLine',
  'joy',
  'joyKnob',
  'kitDash',
  'kitSmack',
  'manaBar',
  'mob',
  'noGL',
  'offArrows',
  'ovOver',
  'ovPause',
  'ovTitle',
  'pCombo',
  'pKills',
  'pScore',
  'pWave',
  'reticle',
  'seedInput',
  'seedLine',
  'stCombo',
  'stKills',
  'stRank',
  'stRankFlavor',
  'stScore',
  'stWave',
  'statsLine',
  'tbDash',
  'tbJump',
  'tbNova',
  'tbSmack',
  'tglFrame',
  'tglInvY',
  'tglLock',
  'tglOrbit',
  'vignette',
];





function boot(opts) {
  opts = opts || {};
  const ids = (opts.ids || []).concat(IDS);
  const listeners = {};
  const els = {};
  let tNow = 0;
  let rafQ = [];
  let drawCalls = 0, drawCounts = [], progN = 0, bufN = 0, texN = 0;

  function makeEl(id) {
    const children = [];
    const el = {
      id, classList: {
        _s: new Set(),
        add() { for (const c of arguments) this._s.add(c); },
        remove() { for (const c of arguments) this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); return this._s.has(c); }
      },
      /* style is a plain object plus the two CSSOM calls the engine uses —
         without setProperty the fake DOM silently hides real crashes */
      style: {
        _v: {},
        setProperty(k, v) { this._v[k] = v; },
        getPropertyValue(k) { return this._v[k] === undefined ? '' : this._v[k]; },
        removeProperty(k) { delete this._v[k]; }
      },
      textContent: '', nodeValue: '', value: '',
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
      attrs: {},
      setAttribute(a, v) { el.attrs[a] = String(v); },
      getAttribute(a) { return el.attrs[a] === undefined ? null : el.attrs[a]; },
      removeAttribute(a) { delete el.attrs[a]; },
      addEventListener(t, cb) { (listeners[t + ':' + id] = listeners[t + ':' + id] || []).push(cb); },
      removeEventListener() {}, setPointerCapture() {}, focus() {}, blur() {}, click() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      clientWidth: 100, clientHeight: 100,
      width: 800, height: 450,
      getContext() { return null; },
      requestPointerLock() {}
    };
    return el;
  }
  ids.forEach(id => { els[id] = makeEl(id); });

  global.window = global;
  global.document = {
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    createElement() { return makeEl('div'); },
    addEventListener(t, cb) { (listeners[t] = listeners[t] || []).push(cb); },
    removeEventListener() {},
    pointerLockElement: null,
    body: makeEl('body')
  };
  global.location = { search: opts.search !== undefined ? opts.search : '?selftest=1' };
  global.innerWidth = 800; global.innerHeight = 450;
  global.devicePixelRatio = 1;
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  global.performance = { now: () => tNow * 1000 };
  global.matchMedia = () => ({ matches: !!opts.finePointer || true });
  global.requestAnimationFrame = cb => { rafQ.push(cb); };
  global.cancelAnimationFrame = () => {};
  global.Image = class { set src(v) { /* no onload — flat colours */ } };
  global.addEventListener = (t, cb) => { (listeners[t] = listeners[t] || []).push(cb); };
  global.removeEventListener = () => {};
  global.setTimeout = (cb) => 0;
  global.AudioContext = undefined; global.webkitAudioContext = undefined;
  try { global.navigator = global.navigator || {}; } catch (e) { /* node 21+ defines navigator read-only */ }

  /* ---------------- fake WebGL ---------------- */
  const GLC = {
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
  const GL = GLC;
  function fakeUniformLoc() { return { _name: 'u' + Math.random() }; }
  const fakeInst = {
    vertexAttribDivisorANGLE() {},
    drawArraysInstancedANGLE(mode, first, count, prim) { drawCalls++; if (count < 0 || prim < 0) throw new Error('bad instanced draw'); drawCounts.push(count * prim); }
  };
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
  els['cv'].getContext = (t) => (t === 'webgl' || t === 'experimental-webgl') ? gl : (t === '2d' ? { drawImage() {}, getImageData() { return { data: new Uint8Array(4) }; } } : null);

  /* ---------------- load modules in the browser's order ---------------- */
  const dir = opts.dir || path.join(__dirname, '..');
  function load(f) { (0, eval)(fs.readFileSync(path.join(dir, f), 'utf8')); }
  ['riley-core.js', 'riley-world.js', 'riley-ai.js', 'riley-net.js', 'riley-engine.js'].forEach(load);

  return {
    els, listeners, gl, GL,
    /* advance the wall clock one frame (1/60 s) and run the queued rAF */
    frame(dt) {
      tNow += dt || 1 / 60;
      const q = rafQ; rafQ = [];
      for (const cb of q) cb(tNow * 1000);
    },
    pump(n, perFrame) {
      for (let i = 0; i < n; i++) { if (perFrame) perFrame(i); this.frame(); }
    },
    now() { return tNow; },
    setNow(v) { tNow = v; },
    stats() { return { drawCalls, draws: drawCounts.length, progs: progN, bufs: bufN, texs: texN }; },
    resetDraws() { drawCalls = 0; drawCounts.length = 0; },
    /* dispatch a window/document event the engine registered */
    emit(type, ev) { const L = listeners[type] || []; for (const cb of L.slice()) cb(ev); },
    /* same for a per-element listener (addEventListener on a node), e.g. a
       range input the player drags */
    elEmit(id, type, ev) {
      const L = listeners[type + ':' + id] || [];
      for (const cb of L.slice()) cb(ev || { target: els[id], preventDefault() {} });
      return L.length;
    },
    elClick(id) {
      const b = els[id];
      if (!b) return 0;
      if (typeof b.onclick === 'function') { b.onclick({ target: b, preventDefault() {} }); return 1; }
      return this.elEmit(id, 'click', { target: b, preventDefault() {} });
    },
    /* set a range input the way a drag would, then fire 'input' */
    elSlide(id, value) { const b = els[id]; if (!b) return 0; b.value = String(value); return this.elEmit(id, 'input', { target: b, preventDefault() {} }); }
  };
}

module.exports = { boot, IDS };
