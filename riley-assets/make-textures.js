#!/usr/bin/env node
/* make-textures.js — procedurally generates every Riley texture as a small
 * PNG into riley-assets/textures/. Zero dependencies (PNG via node:zlib).
 *
 * Re-run after changing anything:  node riley-assets/make-textures.js
 * Output is deterministic (seeded), so re-runs do not churn the git tree.
 *
 * Textures are luminance-ish: the engine multiplies them by per-vertex/
 * per-part colour, so keep them bright (0.8–1.0) with local variation.
 */
'use strict';
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');
var C = require('./riley-core.js');

var S = 128;
var OUT = path.join(__dirname, 'textures');

/* ---------------- softening blur (kills 1-px aliasing when minified) ------ */
function blur(p, passes) {
  var px = p.px, tmp = new Float32Array(S * S * 4);
  for (var pass = 0; pass < (passes || 1); pass++) {
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var r = 0, g = 0, b = 0, a = 0, n = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx, yy = y + dy;
          if (xx < 0) xx += S; if (xx >= S) xx -= S;
          if (yy < 0 || yy >= S) continue;
          var i = (yy * S + xx) * 4, w = (dx === 0 && dy === 0) ? 2 : 1;
          r += px[i] * w; g += px[i + 1] * w; b += px[i + 2] * w; a += px[i + 3] * w; n += w;
        }
        var o = (y * S + x) * 4;
        tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n; tmp[o + 3] = a / n;
      }
    }
    px.set(tmp);
  }
}

/* ---------------- tiny PNG encoder (RGB / RGBA, 8-bit) ---------------- */
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, px, hasAlpha, srcCh) {
  var ch = hasAlpha ? 4 : 3;
  var s = srcCh || 4; /* source stride (makePaint always returns RGBA) */
  var raw = Buffer.alloc((w * ch + 1) * h);
  for (var y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (var x = 0; x < w; x++) {
      var si = (y * w + x) * s, di = y * (w * ch + 1) + 1 + x * ch;
      raw[di] = px[si]; raw[di + 1] = px[si + 1]; raw[di + 2] = px[si + 2];
      if (hasAlpha) raw[di + 3] = px[si + 3];
    }
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = hasAlpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- texture painting helpers ---------------- */
function makePaint(seed) {
  var px = new Float32Array(S * S * 4);
  var rand = C.mulberry32(seed);
  var noise = C.makeNoise2D(rand);
  function set(x, y, r, g, b, a) {
    if (x < 0) x += S; if (x >= S) x -= S;
    if (y < 0 || y >= S) return;
    var i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  function finish(alpha) {
    var out = new Uint8Array(S * S * 4);
    for (var i = 0; i < S * S * 4; i++) out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
    return { px: out, alpha: !!alpha, rand: rand, noise: noise, set: set };
  }
  return { px: px, rand: rand, noise: noise, set: set, finish: finish };
}
function speckle(p, n, rMin, rMax, colFn, yFn) {
  for (var i = 0; i < n; i++) {
    var x = Math.floor(p.rand() * S), y = yFn ? yFn() : Math.floor(p.rand() * S);
    var r = rMin + p.rand() * (rMax - rMin);
    var c = colFn ? colFn() : [0, 0, 0];
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.3) p.set(x + dx, y + dy, c[0], c[1], c[2], 255);
    }
  }
}

/* ---------------- the textures ---------------- */
var manifest = [];
function save(name, paint, alpha, blurPasses) {
  if (blurPasses) blur(paint, blurPasses);
  var f = paint.finish(alpha);
  var buf = encodePNG(S, S, f.px, alpha, 4);
  fs.writeFileSync(path.join(OUT, name), buf);
  manifest.push({ name: name, size: buf.length });
  console.log('  ' + name.padEnd(14) + (buf.length / 1024).toFixed(1) + ' KB');
}

function texGrass() {
  var p = makePaint(101);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var n = p.noise.fbm(x * 0.09, y * 0.09, 3);
    var v = 205 + n * 46;
    p.set(x, y, v * 0.96, v, v * 0.92, 255);
  }
  /* grass blades */
  for (var i = 0; i < 900; i++) {
    var x = Math.floor(p.rand() * S), y = Math.floor(p.rand() * S);
    var h = 2 + p.rand() * 4, l = 190 + p.rand() * 70;
    for (var dy = 0; dy < h; dy++) p.set(x, y + dy, l * 0.9, l, l * 0.85, 255);
  }
  speckle(p, 220, 0, 0, function () { var l = 150 + p.rand() * 50; return [l * 0.9, l, l * 0.88]; });
  save('grass.png', p, false, 1);
}
function texDirt() {
  var p = makePaint(202);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var n = p.noise.fbm(x * 0.07, y * 0.07, 3);
    var v = 190 + n * 50;
    p.set(x, y, v, v * 0.86, v * 0.78, 255);
  }
  speckle(p, 340, 0, 1, function () { var l = 120 + p.rand() * 90; return [l, l * 0.82, l * 0.7]; });
  speckle(p, 40, 1, 3, function () { var l = 150 + p.rand() * 60; return [l * 0.95, l * 0.92, l * 0.88]; });
  save('dirt.png', p, false, 1);
}
function texStone() {
  var p = makePaint(303);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var n = p.noise.fbm(x * 0.045, y * 0.045, 4);
    var v = 200 + n * 55;
    p.set(x, y, v * 0.98, v, v * 1.02, 255);
  }
  /* cracks: random walks */
  for (var c = 0; c < 9; c++) {
    var x = Math.floor(p.rand() * S), y = Math.floor(p.rand() * S);
    var a = p.rand() * Math.PI * 2;
    for (var s = 0; s < 46; s++) {
      p.set(x, y, 96, 100, 108, 255);
      a += (p.rand() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (x < 0 || x >= S || y < 0 || y >= S) break;
    }
  }
  speckle(p, 260, 0, 0, function () { var l = 140 + p.rand() * 70; return [l, l, l * 1.05]; });
  save('stone.png', p, false, 1);
}
function texRock() {
  var p = makePaint(404);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var n = p.noise.fbm(x * 0.06, y * 0.06, 3);
    var blob = 1 - Math.abs(p.noise.noise(x * 0.11, y * 0.11));
    var v = 185 + n * 34 + blob * 42;
    p.set(x, y, v, v * 0.99, v * 1.0, 255);
  }
  speckle(p, 500, 0, 0, function () { var l = 120 + p.rand() * 80; return [l, l, l]; });
  save('rock.png', p, false, 1);
}
function texBark() {
  var p = makePaint(505);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var stripe = Math.sin(x * 0.7 + p.noise.noise(x * 0.3, y * 0.12) * 4) * 0.5 + 0.5;
    var n = p.noise.fbm(x * 0.05, y * 0.02, 2);
    var v = 150 + stripe * 70 + n * 30;
    p.set(x, y, v, v * 0.82, v * 0.66, 255);
  }
  save('bark.png', p, false, 1);
}
function texLeaves() {
  var p = makePaint(606);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var n = p.noise.fbm(x * 0.08, y * 0.08, 3);
    var dap = Math.pow(Math.max(0, p.noise.noise(x * 0.16, y * 0.16) * 0.5 + 0.5), 1.6);
    var v = 165 + n * 40 + dap * 70;
    p.set(x, y, v * 0.92, v, v * 0.8, 255);
  }
  /* leaf dots */
  for (var i = 0; i < 420; i++) {
    var x = Math.floor(p.rand() * S), y = Math.floor(p.rand() * S);
    var l = 120 + p.rand() * 130;
    p.set(x, y, l * 0.9, l, l * 0.75, 255);
    p.set(x + 1, y, l * 0.9, l, l * 0.75, 255);
  }
  save('leaves.png', p, false, 1);
}
function texWood() {
  var p = makePaint(707);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var plank = Math.floor(y / 32);
    var seam = (y % 32 < 1 || x % 64 === 0) ? 0.72 : 1;
    var grain = p.noise.fbm(x * 0.02, y * 0.14 + plank * 9, 2);
    var v = (168 + grain * 46) * seam;
    p.set(x, y, v, v * 0.8, v * 0.6, 255);
  }
  save('wood.png', p, false, 1);
}
function texWater() {
  var p = makePaint(808);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var w = Math.sin(x * 0.24 + p.noise.noise(x * 0.05, y * 0.06) * 5) * 0.5 + 0.5;
    var w2 = Math.sin(y * 0.19 + p.noise.noise(y * 0.05, x * 0.06) * 5) * 0.5 + 0.5;
    var v = 190 + (w + w2) * 34;
    p.set(x, y, v * 0.78, v * 0.9, v, 255);
  }
  save('water.png', p, false, 1);
}
function texCrystal() {
  var p = makePaint(909);
  var cx = S / 2, cy = S / 2, R = S * 0.46;
  /* soft vertical light streaks, positioned first so they read as facets */
  var streaks = [];
  for (var i = 0; i < 5; i++) streaks.push({ x: 18 + p.rand() * (S - 36), w: 5 + p.rand() * 9, v: 150 + p.rand() * 90 });
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var dx = x - cx, dy = (y - cy) * 1.18;
    var d = Math.hypot(dx, dy) / R;
    var body = C.clamp(1.22 - d * 0.7, 0.32, 1.08);
    var v = 255 * body;
    /* wide soft facet streaks */
    for (var s = 0; s < streaks.length; s++) {
      var st = streaks[s];
      var f = Math.exp(-Math.pow((x - st.x) / st.w, 2));
      v += st.v * f * C.clamp(1 - d, 0, 1) * 0.5;
    }
    /* bright core */
    v += 120 * Math.exp(-d * d * 5.5);
    v = Math.min(255, v);
    if (d > 1) { v *= 0.25; }
    p.set(x, y, v * 0.6, v * 0.9, v, 255);
  }
  save('crystal.png', p, false, 1);
}
function texGlow() {
  var p = makePaint(111);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    var d = Math.hypot(dx, dy);
    var a = Math.exp(-d * d * 4.2) * 255;
    var v = 255 * (0.85 + 0.15 * Math.exp(-d * d * 18));
    p.set(x, y, v, v, v, a);
  }
  save('glow.png', p, true);
}
function texCloth() {
  var p = makePaint(112);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var weave = (((x + y) & 1) ? 1 : 0.94);
    var n = p.noise.fbm(x * 0.06, y * 0.06, 2);
    var v = (205 + n * 36) * weave;
    p.set(x, y, v * 0.86, v * 0.9, v, 255);
  }
  /* star specks */
  for (var i = 0; i < 26; i++) {
    var x = Math.floor(p.rand() * S), y = Math.floor(p.rand() * S);
    var l = 235;
    p.set(x, y, l, l * 0.92, l * 0.7, 255);
    p.set(x - 1, y, l * 0.7, l * 0.66, l * 0.5, 255);
    p.set(x + 1, y, l * 0.7, l * 0.66, l * 0.5, 255);
    p.set(x, y - 1, l * 0.7, l * 0.66, l * 0.5, 255);
    p.set(x, y + 1, l * 0.7, l * 0.66, l * 0.5, 255);
  }
  save('cloth.png', p, false);
}
function texRune() {
  var p = makePaint(113);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    p.set(x, y, 90, 96, 120, 255);
  }
  /* glowing rune ring: glyph dashes around a circle */
  var cx = S / 2, cy = S / 2, R = 40;
  for (var a = 0; a < Math.PI * 2; a += 0.02) {
    var g = Math.sin(a * 9) * 0.5 + 0.5;
    if (g > 0.25) {
      var rr = R + (p.rand() - 0.5) * 5;
      var x = Math.floor(cx + Math.cos(a) * rr), y = Math.floor(cy + Math.sin(a) * rr);
      p.set(x, y, 200, 240, 255, 255);
      p.set(x + 1, y, 160, 210, 255, 255);
    }
  }
  /* central sigil */
  for (var i = 0; i < 3; i++) {
    var a0 = i / 3 * Math.PI * 2 + 0.5;
    for (var s = 0; s < 18; s++) {
      var r = 4 + s;
      p.set(Math.floor(cx + Math.cos(a0) * r * 0.5), Math.floor(cy + Math.sin(a0) * r * 0.5), 220, 245, 255, 255);
    }
  }
  save('rune.png', p, false);
}

/* ---------------- run ---------------- */
fs.mkdirSync(OUT, { recursive: true });
console.log('Generating Riley textures at ' + OUT);
texGrass(); texDirt(); texStone(); texRock(); texBark(); texLeaves();
texWood(); texWater(); texCrystal(); texGlow(); texCloth(); texRune();
var total = manifest.reduce(function (a, m) { return a + m.size; }, 0);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generator: 'make-textures.js', size: S, textures: manifest }, null, 1));
console.log('done — ' + manifest.length + ' textures, ' + (total / 1024).toFixed(1) + ' KB total');
