/* EOT Core — math, seeded RNG, hashing, spatial hash, colour helpers.
 *
 * Pure JS. No DOM, no canvas, no Math.random. Everything the simulation
 * touches lives here so that the sim is reproducible: same seed + same
 * inputs => same world, byte for byte. That contract is what the netcode
 * (eot-net.js) and the headless tests rely on.
 *
 * Browser: window.EOTCore   Node: module.exports
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EOTCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var TAU = Math.PI * 2;

/* ------------------------- scalar math ------------------------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function invLerp(a, b, v) { return b === a ? 0 : clamp((v - a) / (b - a), 0, 1); }
function smoothstep(e0, e1, x) { var t = invLerp(e0, e1, x); return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : 1; }
function approach(cur, target, delta) {
  if (cur < target) return Math.min(cur + delta, target);
  if (cur > target) return Math.max(cur - delta, target);
  return target;
}
/* Frame-rate independent exponential smoothing. `rate` = fraction of the
 * distance closed per 60th of a second; safe across variable frame times. */
function damp(cur, target, rate, dt) { return lerp(cur, target, 1 - Math.pow(1 - rate, dt * 60)); }

function dist2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

function angDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
function angNorm(a) { a %= TAU; if (a < 0) a += TAU; return a; }

/* ------------------------- deterministic RNG -------------------------
 * mulberry32. Two flavours are exposed because the sim needs both:
 *  - rng(seed)            : a stream, for sequences (worldgen, AI jitter)
 *  - simRng(seed, tick)   : a per-tick stream, so re-running a tick in a
 *                           rollback yields the same numbers. This is the
 *                           only randomness the simulation may use.
 * Math.random() is legal ONLY in the renderer for pure cosmetics. */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mix32(a, b) {
  var h = (a ^ Math.imul(b, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ h >>> 13, 0xC2B2AE35) >>> 0;
  return (h ^ h >>> 16) >>> 0;
}
/* Per-tick stream. `slot` keeps independent consumers (spawn, ai, fx) from
 * disturbing each other's sequence. */
function simRng(worldSeed, tick, slot) { return mulberry32(mix32(mix32(worldSeed >>> 0, tick >>> 0), (slot || 0) >>> 0)); }

/* ------------------------- hashing ------------------------- */
function hashStr(str) {
  var h = 0x811C9DC5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function fnv() { return 0x811C9DC5; }
function fnvByte(h, b) { return (Math.imul(h ^ (b & 0xFF), 0x01000193)) >>> 0; }
function fnvNum(h, n) {
  n = (n * 1024) | 0;                 // fixed-point: 1/1024 resolution
  h = fnvByte(h, n & 0xFF);
  h = fnvByte(h, (n >>> 8) & 0xFF);
  h = fnvByte(h, (n >>> 16) & 0xFF);
  h = fnvByte(h, (n >>> 24) & 0xFF);
  return h;
}

/* ------------------------- spatial hash -------------------------
 * Uniform grid broadphase. The sim rebuilds it once per tick; queries are
 * O(nearby). Cell size is tuned to the largest interaction radius. */
function SpatialHash(cell) {
  this.cell = cell || 128;
  this.map = new Map();
}
SpatialHash.prototype.clear = function () { this.map.clear(); return this; };
SpatialHash.prototype._key = function (cx, cy) { return (cx * 73856093) ^ (cy * 19349663); };
SpatialHash.prototype.insert = function (id, x, y) {
  var cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
  var k = this._key(cx, cy);
  var b = this.map.get(k);
  if (!b) { b = []; this.map.set(k, b); }
  b.push(id);
  return this;
};
SpatialHash.prototype.query = function (x, y, r, out) {
  out = out || [];
  out.length = 0;
  var c = this.cell;
  var x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
  var y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
  for (var cx = x0; cx <= x1; cx++) {
    for (var cy = y0; cy <= y1; cy++) {
      var b = this.map.get(this._key(cx, cy));
      if (b) for (var i = 0; i < b.length; i++) out.push(b[i]);
    }
  }
  return out;
};

/* ------------------------- axis-aligned boxes ------------------------- */
function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function circleBox(cx, cy, r, bx, by, bw, bh) {
  var nx = clamp(cx, bx, bx + bw), ny = clamp(cy, by, by + bh);
  return dist2(cx, cy, nx, ny) <= r * r;
}
/* Push a circle out of a box, returning the resolved position. */
function resolveCircleBox(cx, cy, r, bx, by, bw, bh) {
  var nx = clamp(cx, bx, bx + bw), ny = clamp(cy, by, by + bh);
  var dx = cx - nx, dy = cy - ny;
  var d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    var d = Math.sqrt(d2), push = (r - d);
    return { x: cx + (dx / d) * push, y: cy + (dy / d) * push };
  }
  /* Centre inside the box: exit along the shallowest axis. */
  var l = cx - bx, rr = bx + bw - cx, t = cy - by, bo = by + bh - cy;
  var m = Math.min(l, rr, t, bo);
  if (m === l) return { x: bx - r, y: cy };
  if (m === rr) return { x: bx + bw + r, y: cy };
  if (m === t) return { x: cx, y: by - r };
  return { x: cx, y: by + bh + r };
}

/* ------------------------- colour -------------------------
 * The anime look lives in the palette, not in the shaders: shadows are
 * hue-shifted toward blue/violet rather than darkened to grey, and every
 * cel band is a flat fill. Colours are stored as [r,g,b] and quantised at
 * draw time so a given surface never produces a gradient. */
function rgb(r, g, b) { return [r | 0, g | 0, b | 0]; }
function mixRGB(a, b, t) {
  return [
    (a[0] + (b[0] - a[0]) * t) | 0,
    (a[1] + (b[1] - a[1]) * t) | 0,
    (a[2] + (b[2] - a[2]) * t) | 0
  ];
}
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function css(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
/* Shift a colour toward a target hue-ish tint — the "anime shadow" trick. */
function tint(c, target, amt) { return mixRGB(c, target, amt); }

/* Cheap value noise for terrain variation. Deterministic in (seed,x,y). */
function vnoise2(seed, x, y) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  function h(ix, iy) { return (mix32(mix32(seed >>> 0, ix >>> 0), iy >>> 0) & 0xFFFF) / 65536; }
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

return {
  TAU: TAU,
  clamp: clamp, lerp: lerp, invLerp: invLerp, smoothstep: smoothstep, sign: sign,
  approach: approach, damp: damp,
  dist: dist, dist2: dist2, angDiff: angDiff, angLerp: angLerp, angNorm: angNorm,
  mulberry32: mulberry32, mix32: mix32, simRng: simRng,
  hashStr: hashStr, fnv: fnv, fnvByte: fnvByte, fnvNum: fnvNum,
  SpatialHash: SpatialHash,
  overlap: overlap, circleBox: circleBox, resolveCircleBox: resolveCircleBox,
  rgb: rgb, mixRGB: mixRGB, rgba: rgba, css: css, tint: tint,
  vnoise2: vnoise2
};
});
