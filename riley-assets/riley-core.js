/* Riley Core — math, seeded RNG, value-noise, spatial hash.
 * Pure JS, no DOM/GL: shared by worldgen, AI, netcode (and tests).
 * Browser: window.RileyCore   Node: module.exports (UMD-lite).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RileyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function angLerp(a, b, t) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }
function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : 1; }

/* ---------------- deterministic PRNG (mulberry32) ----------------
 * The whole simulation uses seeded PRNG streams — no Math.random() on
 * the sim path. That is the determinism contract the netcode relies on. */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* FNV-1a 32-bit string hash — seeds worlds from readable seed strings. */
function hashStr(str) {
  var h = 0x811C9DC5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/* Incremental FNV-1a — world state hashing for netcode divergence checks. */
function fnvInit() { return 0x811C9DC5 >>> 0; }
function fnvAdd(h, v) { h ^= (v | 0); h = Math.imul(h, 0x01000193); return h >>> 0; }
function fnvAddF(h, f) { /* fold a float into 2 ints (sign+exp, mantissa) */
  var x = Math.fround(f);
  var bi = new Float32Array(1); bi[0] = x;
  var ui = new Uint32Array(bi.buffer)[0];
  return fnvAdd(fnvAdd(h, ui), ui >>> 16);
}

/* ---------------- 2D value noise + fBm (seeded) ---------------- */
function makeNoise2D(rand) {
  var PERM = 256, perm = new Uint8Array(PERM * 2);
  var i, j, t;
  for (i = 0; i < PERM; i++) perm[i] = i;
  for (i = PERM - 1; i > 0; i--) { j = (rand() * (i + 1)) | 0; t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (i = 0; i < PERM; i++) perm[PERM + i] = perm[i];
  function val(ix, iz) { return perm[(perm[ix & 255] + (iz & 255)) & 255] / 127.5 - 1; }
  function noise(x, z) {
    var x0 = Math.floor(x), z0 = Math.floor(z);
    var fx = x - x0, fz = z - z0;
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = val(x0, z0), b = val(x0 + 1, z0), c = val(x0, z0 + 1), d = val(x0 + 1, z0 + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, z, oct, lac, gain) {
    var sum = 0, amp = 1, freq = 1, max = 0, i;
    for (i = 0; i < oct; i++) { sum += noise(x * freq, z * freq) * amp; max += amp; amp *= (gain === undefined ? 0.5 : gain); freq *= (lac === undefined ? 2 : lac); }
    return sum / max;
  }
  /* Ridged multifractal — canyon / mesa structure. */
  function ridged(x, z, oct) {
    var sum = 0, amp = 0.55, freq = 1, max = 0, i;
    for (i = 0; i < oct; i++) {
      var n = 1 - Math.abs(noise(x * freq, z * freq));
      n *= n;
      sum += n * amp; max += amp; amp *= 0.5; freq *= 2.1;
    }
    return sum / max;
  }
  return { noise: noise, fbm: fbm, ridged: ridged };
}

/* ---------------- matrix math (column-major, WebGL style) ---------------- */
function m4ident(o) {
  o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
  o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
  return o;
}
function m4mul(o, a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7],
      a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
  for (var c = 0; c < 4; c++) {
    var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3;
    o[c * 4 + 1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3;
    o[c * 4 + 2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3;
    o[c * 4 + 3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3;
  }
  return o;
}
function m4T(o, x, y, z) { m4ident(o); o[12] = x; o[13] = y; o[14] = z; return o; }
function m4S(o, x, y, z) { m4ident(o); o[0] = x; o[5] = y; o[10] = z; return o; }
function m4RX(o, a) { var c = Math.cos(a), s = Math.sin(a); m4ident(o); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
function m4RY(o, a) { var c = Math.cos(a), s = Math.sin(a); m4ident(o); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
function m4RZ(o, a) { var c = Math.cos(a), s = Math.sin(a); m4ident(o); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }

/* NOTE: m4S/m4T/etc reset their target first — they build a FRESH matrix.
 * Compose with m4mul(out, a, b) instead. `out` must not alias a scratch. */

/* Build a limb/part matrix: M = T(pos)*RY(yaw)*T(piv)*RX(pitch)*RZ(roll)*T(geo)*S(scl) */
var _S1 = new Float32Array(16), _S2 = new Float32Array(16), _S3 = new Float32Array(16);
function limb(out, x, y, z, yaw, pivX, pivY, pivZ, pitch, roll, geoX, geoY, geoZ, sx, sy, sz) {
  m4T(_S1, x, y, z); m4RY(_S2, yaw); m4mul(out, _S1, _S2);
  m4T(_S2, pivX, pivY, pivZ); m4mul(out, out, _S2);
  m4RX(_S2, pitch); m4mul(out, out, _S2);
  m4RZ(_S2, roll); m4mul(out, out, _S2);
  m4T(_S2, geoX, geoY, geoZ); m4mul(out, out, _S2);
  m4S(_S2, sx, sy, sz); m4mul(out, out, _S2);
  return out;
}
/* Faster variant reusing scratch matrices (no allocation).
 * `out` must be a caller-owned matrix, not _S1/_S2/_S3. */
function limb2(out, x, y, z, yaw, pivX, pivY, pivZ, pitch, roll, geoX, geoY, geoZ, sx, sy, sz) {
  m4T(_S1, x, y, z); m4RY(_S2, yaw); m4mul(out, _S1, _S2);
  m4T(_S2, pivX, pivY, pivZ); m4mul(out, out, _S2);
  m4RX(_S2, pitch); m4mul(out, out, _S2);
  m4RZ(_S2, roll); m4mul(out, out, _S2);
  m4T(_S2, geoX, geoY, geoZ); m4mul(out, out, _S2);
  m4S(_S3, sx, sy, sz); m4mul(out, out, _S3);
  return out;
}
function m4Persp(o, fov, asp, n, f) {
  var g = 1 / Math.tan(fov / 2);
  o[0] = g / asp; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = g; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = (n + f) / (n - f); o[11] = -1;
  o[12] = 0; o[13] = 0; o[14] = 2 * n * f / (n - f); o[15] = 0;
  return o;
}
function m4Look(o, ex, ey, ez, cx, cy, cz) {
  var fx = cx - ex, fy = cy - ey, fz = cz - ez;
  var l = Math.hypot(fx, fy, fz) || 1e-6; fx /= l; fy /= l; fz /= l;
  var bx = -fx, by = -fy, bz = -fz;
  var rx = bz, ry = 0, rz = -bx; /* cross(up=(0,1,0), b) */
  l = Math.hypot(rx, ry, rz);
  if (l < 1e-6) { rx = 1; ry = 0; rz = 0; } else { rx /= l; ry /= l; rz /= l; }
  var qx = by * rz - bz * ry, qy = bz * rx - bx * rz, qz = bx * ry - by * rx;
  o[0] = rx; o[1] = ry; o[2] = rz; o[3] = 0;
  o[4] = qx; o[5] = qy; o[6] = qz; o[7] = 0;
  o[8] = bx; o[9] = by; o[10] = bz; o[11] = 0;
  o[12] = -(rx * ex + ry * ey + rz * ez);
  o[13] = -(qx * ex + qy * ey + qz * ez);
  o[14] = -(bx * ex + by * ey + bz * ez);
  o[15] = 1;
  return o;
}
function m4inv(o, m) {
  var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null; det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/* ---------------- spatial hash grid (O(1) neighbour queries) ---------------- */
function HashGrid(cell) {
  this.cell = cell;
  this.map = {};
}
HashGrid.prototype.clear = function () { this.map = {}; };
HashGrid.prototype.key = function (cx, cz) { return ((cx + 512) * 4096) + (cz + 512); };
HashGrid.prototype.insert = function (x, z, item) {
  var cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
  var k = this.key(cx, cz);
  var arr = this.map[k];
  if (!arr) { arr = this.map[k] = []; }
  arr.push(item);
};
/* Collect candidates in the 3x3 cells around (x,z). */
HashGrid.prototype.query = function (x, z, out) {
  out.length = 0;
  var cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell), i;
  for (var ix = -1; ix <= 1; ix++) for (var iz = -1; iz <= 1; iz++) {
    var arr = this.map[this.key(cx + ix, cz + iz)];
    if (arr) for (i = 0; i < arr.length; i++) out.push(arr[i]);
  }
  return out;
};

/* ---------------- tiny object pool ---------------- */
function Pool(make, reset, cap) {
  this.make = make; this.reset = reset; this.cap = cap || 256; this.free = [];
}
Pool.prototype.get = function () {
  return this.free.length ? this.free.pop() : this.make();
};
Pool.prototype.put = function (o) {
  if (this.free.length < this.cap && this.reset) this.reset(o);
  if (this.free.length < this.cap) this.free.push(o);
};

/* Quantise a float for world hashing (6cm grid — 176u world stays compact). */
function packF1(v) { return Math.round(clamp(v, -64, 64) * 16) / 16; }

return {
  TAU: TAU, clamp: clamp, lerp: lerp, angLerp: angLerp, smoothstep: smoothstep, sign: sign,
  mulberry32: mulberry32, hashStr: hashStr, fnvInit: fnvInit, fnvAdd: fnvAdd, fnvAddF: fnvAddF,
  makeNoise2D: makeNoise2D,
  m4ident: m4ident, m4mul: m4mul, m4T: m4T, m4S: m4S, m4RX: m4RX, m4RY: m4RY, m4RZ: m4RZ,
  limb: limb, limb2: limb2, m4Persp: m4Persp, m4Look: m4Look, m4inv: m4inv,
  HashGrid: HashGrid, Pool: Pool, packF1: packF1
};
});
