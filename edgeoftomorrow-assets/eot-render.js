/* EOT Render — the anime cel-shaded renderer.
 *
 * Canvas 2D, no WebGL, no image assets. Everything is drawn from geometry,
 * which keeps the game a single self-contained page and lets the whole look
 * be tuned in code.
 *
 * The anime look is a specific set of choices, not a filter:
 *   - flat colour bands, never gradients, on every lit surface
 *   - shadows hue-shifted toward violet instead of darkened toward grey
 *     (pure darkening reads as mud; hue shift reads as film)
 *   - a bold dark outline on every silhouette
 *   - a rim light on the side away from the key light
 *   - halftone dots inside large shadow areas
 *   - speed lines, impact frames and chromatic split reserved for big moments
 *     so they still mean something when they appear
 *
 * This file owns NO game state. It reads the sim's world and its own pool of
 * purely cosmetic effects. Math.random() is allowed here and only here.
 *
 * Browser: window.EOTRender
 */
(function (root) {
'use strict';

var C = root.EOTCore;
var S = root.EOTSim;
var clamp = C.clamp, lerp = C.lerp, TAU = C.TAU;

/* ---------------- palette ---------------- */
var PAL = {
  night: [14, 12, 34],
  nightDeep: [8, 7, 22],
  floor: [30, 26, 62],
  floorLit: [46, 38, 92],
  grid: [70, 56, 140],
  shadowTint: [58, 32, 118],     /* the anime shadow hue */
  outline: [10, 8, 24],
  rim: [190, 235, 255],
  neonCyan: [72, 232, 255],
  neonMagenta: [255, 78, 190],
  neonGold: [255, 208, 84],
  neonViolet: [168, 110, 255],
  blood: [255, 62, 78],
  anchorIdle: [92, 120, 190],
  anchorWork: [110, 220, 255],
  anchorDone: [120, 255, 176],
  gate: [255, 190, 90],
  gateOpen: [140, 255, 210],
  hook: [210, 70, 90]
};

/* Survivors get distinct silhouettes and colours so a team is readable at a
 * glance in a dark arena — readability beats variety here. */
var SURV_SKINS = [
  { name: 'RIN',   hair: [255, 214, 120], coat: [64, 150, 235],  accent: [120, 240, 255] },
  { name: 'KAITO', hair: [120, 200, 255], coat: [52, 60, 120],   accent: [168, 110, 255] },
  { name: 'YUKI',  hair: [255, 255, 255], coat: [190, 70, 120],  accent: [255, 150, 200] },
  { name: 'SORA',  hair: [150, 255, 190], coat: [40, 110, 96],   accent: [140, 255, 200] },
  { name: 'AKIRA', hair: [255, 120, 90],  coat: [120, 44, 60],   accent: [255, 208, 84] },
  { name: 'MIO',   hair: [200, 160, 255], coat: [70, 50, 130],   accent: [190, 150, 255] }
];
var SLAYER_SKIN = { hair: [230, 40, 70], coat: [46, 16, 40], accent: [255, 62, 78] };

function cel(col, band) {
  /* band 0 = lit, 1 = mid, 2 = deep shadow. Shadows shift hue, they do not
   * just get darker. */
  if (band <= 0) return C.css(col);
  var t = band === 1 ? 0.34 : 0.62;
  return C.css(C.mixRGB(col, PAL.shadowTint, t));
}

/* ============================ RENDERER ============================ */
function Renderer(canvas) {
  this.cv = canvas;
  this.ctx = canvas.getContext('2d', { alpha: false });
  this.w = 0; this.h = 0; this.dpr = 1;
  this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1, shake: 0, shakeX: 0, shakeY: 0, rot: 0 };
  this.parts = [];
  this.texts = [];
  this.slashes = [];
  this.rings = [];
  this.beams = [];
  this.speedLines = [];
  this.flash = 0; this.flashCol = [255, 255, 255];
  this.chroma = 0;
  this.impact = 0;
  this.time = 0;
  this.halftone = null;
  this.quality = 'high';
  this.showEchoes = true;
  this.resize();
}

Renderer.prototype.resize = function () {
  var dpr = Math.min(root.devicePixelRatio || 1, 2);
  var w = this.cv.clientWidth || root.innerWidth || 960;
  var h = this.cv.clientHeight || root.innerHeight || 600;
  this.dpr = dpr;
  this.cv.width = Math.floor(w * dpr);
  this.cv.height = Math.floor(h * dpr);
  this.w = w; this.h = h;
  /* Drop effects on small/low-power screens rather than dropping frames. */
  var px = w * h;
  this.quality = px > 900000 ? 'high' : (px > 420000 ? 'medium' : 'low');
};

/* ------------------------- effects ------------------------- */
Renderer.prototype.burst = function (x, y, n, col, opt) {
  opt = opt || {};
  if (this.quality === 'low') n = Math.ceil(n * 0.4);
  var base = opt.ang !== undefined ? opt.ang : Math.random() * TAU;
  for (var i = 0; i < n; i++) {
    /* even spread + jitter: pure random angles clump and leave gaps */
    var a = base + (i / n) * TAU + (Math.random() - 0.5) * 0.5;
    var sp = (opt.speed || 220) * (0.5 + Math.random() * 0.9);
    this.parts.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: (opt.life || 0.5) * (0.7 + Math.random() * 0.6), t: 0,
      r: (opt.size || 4) * (0.6 + Math.random() * 0.9),
      col: col, grav: opt.grav === undefined ? 240 : opt.grav,
      spark: !!opt.spark, drag: opt.drag === undefined ? 2.2 : opt.drag
    });
  }
  if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
};

Renderer.prototype.trail = function (x, y, col, r) {
  this.parts.push({
    x: x, y: y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
    life: 0.34, t: 0, r: r || 6, col: col, grav: -30, spark: false, drag: 3
  });
};

Renderer.prototype.text = function (x, y, str, col, size) {
  this.texts.push({ x: x, y: y, s: String(str), col: col || [255, 255, 255], size: size || 20, t: 0, life: 0.9, vy: -70 });
  if (this.texts.length > 40) this.texts.shift();
};

Renderer.prototype.slash = function (x, y, ang, range, arc, col, heavy) {
  this.slashes.push({ x: x, y: y, ang: ang, range: range, arc: arc, col: col, t: 0, life: heavy ? 0.3 : 0.2, heavy: !!heavy });
  if (this.slashes.length > 24) this.slashes.shift();
};

Renderer.prototype.ring = function (x, y, r0, r1, col, life, width) {
  this.rings.push({ x: x, y: y, r0: r0, r1: r1, col: col, t: 0, life: life || 0.4, w: width || 6 });
  if (this.rings.length > 30) this.rings.shift();
};

Renderer.prototype.beam = function (x0, y0, x1, y1, col, life, width) {
  this.beams.push({ x0: x0, y0: y0, x1: x1, y1: y1, col: col, t: 0, life: life || 0.2, w: width || 5 });
  if (this.beams.length > 40) this.beams.shift();
};

Renderer.prototype.shake = function (amount) {
  this.cam.shake = Math.min(28, this.cam.shake + amount);
};
Renderer.prototype.doFlash = function (col, amount) {
  this.flash = Math.max(this.flash, amount);
  this.flashCol = col;
};
Renderer.prototype.doChroma = function (amount) { this.chroma = Math.max(this.chroma, amount); };
Renderer.prototype.doImpact = function (amount) { this.impact = Math.max(this.impact, amount); };
Renderer.prototype.speedBurst = function (ang) {
  if (this.quality === 'low') return;
  for (var i = 0; i < 14; i++) {
    this.speedLines.push({
      a: ang + Math.PI + (Math.random() - 0.5) * 1.5,
      r: 120 + Math.random() * 420, len: 90 + Math.random() * 260,
      t: 0, life: 0.22 + Math.random() * 0.16
    });
  }
  if (this.speedLines.length > 90) this.speedLines.splice(0, this.speedLines.length - 90);
};

/* Turn a sim event into spectacle. This is the whole game-feel mapping. */
Renderer.prototype.onEvent = function (e, local) {
  var isLocal = e.by === local || e.to === local;
  switch (e.t) {
    case 'swing':
      this.slash(e.x, e.y, e.ang, e.heavy ? 84 : 58, e.heavy ? 2.0 : 1.7,
        e.heavy ? PAL.blood : PAL.neonCyan, e.heavy);
      if (e.heavy) this.shake(2.5);
      break;
    case 'hit':
      this.burst(e.x, e.y, e.amount >= 40 ? 26 : 14, e.amount >= 40 ? PAL.blood : PAL.neonGold,
        { speed: e.amount >= 40 ? 420 : 280, size: e.amount >= 40 ? 5 : 3.5, spark: true, life: 0.45 });
      this.ring(e.x, e.y, 8, e.amount >= 40 ? 78 : 46, [255, 255, 255], 0.22, 5);
      this.shake(e.amount >= 40 ? 9 : 4.5);
      if (e.amount >= 40) { this.doChroma(0.7); this.doImpact(1); }
      if (isLocal) this.doFlash([255, 90, 90], 0.3);
      else this.doFlash([255, 255, 255], 0.13);
      this.text(e.x, e.y - 24, Math.round(e.amount), e.amount >= 40 ? PAL.blood : PAL.neonGold, e.amount >= 40 ? 30 : 20);
      break;
    case 'dash':
      this.burst(e.x, e.y, 12, PAL.neonCyan, { speed: 160, size: 3, grav: -40, life: 0.35 });
      this.speedBurst(e.ang);
      break;
    case 'ult':
      this.doFlash(e.role === 'slayer' ? [255, 60, 90] : [150, 220, 255], 0.55);
      this.doChroma(1); this.doImpact(1); this.shake(14);
      this.ring(e.x, e.y, 10, 220, e.role === 'slayer' ? PAL.blood : PAL.neonCyan, 0.5, 12);
      this.burst(e.x, e.y, 46, e.role === 'slayer' ? PAL.blood : PAL.neonCyan, { speed: 620, size: 6, life: 0.7 });
      break;
    case 'nova':
      this.ring(e.x, e.y, 12, e.r + 40, PAL.neonViolet, 0.45, 14);
      this.ring(e.x, e.y, 12, e.r, [255, 255, 255], 0.3, 7);
      this.burst(e.x, e.y, 40, PAL.neonViolet, { speed: 520, size: 5, life: 0.6 });
      this.shake(11); this.doFlash([220, 180, 255], 0.3);
      break;
    case 'down':
      this.burst(e.x, e.y, 30, PAL.blood, { speed: 340, size: 4, life: 0.7 });
      this.ring(e.x, e.y, 6, 90, PAL.blood, 0.4, 8);
      this.shake(8); this.doFlash([255, 40, 60], 0.22);
      this.text(e.x, e.y - 40, 'DOWN', PAL.blood, 26);
      break;
    case 'hook':
      this.burst(e.x, e.y, 24, PAL.hook, { speed: 260, size: 4, life: 0.6 });
      this.ring(e.x, e.y, 10, 120, PAL.hook, 0.5, 9);
      this.shake(7);
      break;
    case 'rescue':
    case 'unhook':
      this.burst(e.x, e.y, 22, PAL.anchorDone, { speed: 220, size: 3.5, grav: -120, life: 0.7 });
      this.ring(e.x, e.y, 6, 80, PAL.anchorDone, 0.4, 6);
      this.text(e.x, e.y - 36, e.t === 'unhook' ? 'SAVED' : 'REVIVED', PAL.anchorDone, 22);
      break;
    case 'heal':
      this.burst(e.x, e.y, 12, PAL.anchorDone, { speed: 120, size: 3, grav: -140, life: 0.6 });
      break;
    case 'great':
      this.text(e.x, e.y - 44, 'GREAT', PAL.neonGold, 26);
      this.ring(e.x, e.y, 6, 70, PAL.neonGold, 0.3, 5);
      this.doFlash([255, 220, 120], 0.14);
      break;
    case 'fail':
      this.text(e.x, e.y - 44, 'MISS', PAL.blood, 22);
      this.shake(4);
      break;
    case 'anchorDone':
      this.burst(e.x, e.y, 34, PAL.anchorDone, { speed: 320, size: 4, grav: -60, life: 0.9 });
      this.ring(e.x, e.y, 10, 150, PAL.anchorDone, 0.6, 10);
      this.shake(6); this.doFlash([150, 255, 200], 0.16);
      this.text(e.x, e.y - 52, 'ANCHOR SEALED', PAL.anchorDone, 22);
      break;
    case 'anchorHit':
      this.burst(e.x, e.y, 20, PAL.blood, { speed: 300, size: 4, life: 0.5 });
      this.shake(6);
      this.text(e.x, e.y - 46, 'REGRESSED', PAL.blood, 20);
      break;
    case 'powered':
      this.doFlash([255, 210, 130], 0.3); this.shake(9);
      this.text(e.x, e.y, 'RIFTS POWERED', PAL.gate, 30);
      break;
    case 'gateOpen':
      this.ring(e.x, e.y, 10, 200, PAL.gateOpen, 0.8, 14);
      this.burst(e.x, e.y, 40, PAL.gateOpen, { speed: 380, size: 5, grav: -80, life: 1 });
      this.shake(8); this.doFlash([170, 255, 220], 0.24);
      break;
    case 'escape':
      this.burst(e.x, e.y, 30, PAL.gateOpen, { speed: 260, size: 4, grav: -150, life: 0.9 });
      this.text(e.x, e.y - 50, 'ESCAPED', PAL.gateOpen, 28);
      break;
    case 'eliminate':
      this.burst(e.x, e.y, 34, PAL.blood, { speed: 300, size: 4.5, life: 0.9 });
      this.doFlash([255, 30, 50], 0.3); this.shake(10);
      break;
    case 'core':
      this.doFlash([255, 255, 255], 0.8); this.doChroma(1); this.shake(24);
      this.ring(e.x, e.y, 10, 420, PAL.neonViolet, 1, 20);
      this.burst(e.x, e.y, 70, PAL.neonViolet, { speed: 700, size: 7, life: 1.2 });
      break;
    case 'chaseStart':
      if (isLocal) this.doFlash([255, 40, 70], 0.16);
      break;
    case 'matchStart':
      this.doFlash([120, 200, 255], 0.35);
      break;
    default: break;
  }
};

/* ------------------------- update ------------------------- */
Renderer.prototype.update = function (dt, localPlayer) {
  this.time += dt;
  var i;

  /* camera follow with lookahead toward where you are facing */
  if (localPlayer) {
    var lead = 90;
    this.cam.tx = localPlayer.x + Math.cos(localPlayer.aim || 0) * lead;
    this.cam.ty = localPlayer.y + Math.sin(localPlayer.aim || 0) * lead;
  }
  var zk = 1 - Math.pow(0.001, dt);
  this.cam.x += (this.cam.tx - this.cam.x) * zk;
  this.cam.y += (this.cam.ty - this.cam.y) * zk;
  this.cam.zoom += (this.cam.tzoom - this.cam.zoom) * zk;

  /* trauma-style shake: decays, and its square gives a fast attack */
  this.cam.shake = Math.max(0, this.cam.shake - dt * 42);
  var s = this.cam.shake / 28;
  var amp = s * s * 22;
  this.cam.shakeX = (Math.random() - 0.5) * 2 * amp;
  this.cam.shakeY = (Math.random() - 0.5) * 2 * amp;
  this.cam.rot = (Math.random() - 0.5) * s * 0.02;

  this.flash = Math.max(0, this.flash - dt * 3.2);
  this.chroma = Math.max(0, this.chroma - dt * 2.6);
  this.impact = Math.max(0, this.impact - dt * 5);

  for (i = this.parts.length - 1; i >= 0; i--) {
    var p = this.parts[i];
    p.t += dt;
    if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
    var dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vy *= dr;
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (i = this.texts.length - 1; i >= 0; i--) {
    var tx = this.texts[i];
    tx.t += dt;
    if (tx.t >= tx.life) { this.texts.splice(i, 1); continue; }
    tx.y += tx.vy * dt; tx.vy *= Math.exp(-2.4 * dt);
  }
  for (i = this.slashes.length - 1; i >= 0; i--) { this.slashes[i].t += dt; if (this.slashes[i].t >= this.slashes[i].life) this.slashes.splice(i, 1); }
  for (i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].life) this.rings.splice(i, 1); }
  for (i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t >= this.beams[i].life) this.beams.splice(i, 1); }
  for (i = this.speedLines.length - 1; i >= 0; i--) { this.speedLines[i].t += dt; if (this.speedLines[i].t >= this.speedLines[i].life) this.speedLines.splice(i, 1); }
};

/* ------------------------- transform ------------------------- */
Renderer.prototype.toScreen = function (x, y) {
  var z = this.cam.zoom;
  return {
    x: (x - this.cam.x) * z + this.w / 2 + this.cam.shakeX,
    y: (y - this.cam.y) * z + this.h / 2 + this.cam.shakeY
  };
};
Renderer.prototype.applyCam = function () {
  var ctx = this.ctx;
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.translate(this.w / 2 + this.cam.shakeX, this.h / 2 + this.cam.shakeY);
  ctx.rotate(this.cam.rot);
  ctx.scale(this.cam.zoom, this.cam.zoom);
  ctx.translate(-this.cam.x, -this.cam.y);
};
Renderer.prototype.viewBounds = function () {
  var hw = this.w / 2 / this.cam.zoom + 120, hh = this.h / 2 / this.cam.zoom + 120;
  return { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
};

/* ============================ DRAW ============================ */
Renderer.prototype.render = function (world, opts) {
  opts = opts || {};
  var ctx = this.ctx;
  var localId = opts.localId;
  var localRole = opts.localRole;
  var vb = this.viewBounds();

  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  /* sky/base wash */
  ctx.fillStyle = C.css(PAL.nightDeep);
  ctx.fillRect(0, 0, this.w, this.h);

  this.applyCam();
  this.drawFloor(world, vb);
  this.drawProps(world, vb);
  this.drawEchoes(world, vb, localRole);
  this.drawAnchors(world, vb);
  this.drawGates(world, vb);
  this.drawHooks(world, vb);
  this.drawParticles(ctx, vb, false);

  /* entities sorted back-to-front by y so nearer ones overlap correctly */
  var ps = world.players.slice().sort(function (a, b) { return a.y - b.y; });
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i];
    if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;
    this.drawCharacter(p, p.id === localId, world);
  }

  this.drawSlashes(ctx);
  this.drawRings(ctx);
  this.drawBeams(ctx);
  this.drawParticles(ctx, vb, true);
  this.drawDarkness(world, opts, vb);
  this.drawTexts(ctx);

  /* ---- post ---- */
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.drawSpeedLines();
  this.drawVignette(opts);
  if (this.flash > 0.001) {
    ctx.globalAlpha = Math.min(0.85, this.flash);
    ctx.fillStyle = C.css(this.flashCol);
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }
};

Renderer.prototype.drawFloor = function (world, vb) {
  var ctx = this.ctx;
  ctx.fillStyle = C.css(PAL.floor);
  ctx.fillRect(0, 0, S.K.WORLD.w, S.K.WORLD.h);

  /* lit bands give the ground cel-shaded structure without any texture */
  var band = 240;
  ctx.fillStyle = C.css(PAL.floorLit);
  var x0 = Math.floor(vb.x0 / band) * band, y0 = Math.floor(vb.y0 / band) * band;
  for (var x = x0; x < vb.x1; x += band) {
    for (var y = y0; y < vb.y1; y += band) {
      if (((x / band) | 0) % 2 === ((y / band) | 0) % 2) ctx.fillRect(x, y, band, band);
    }
  }
  /* grid */
  ctx.strokeStyle = C.rgba(PAL.grid, 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var gx = x0; gx < vb.x1; gx += 80) { ctx.moveTo(gx, vb.y0); ctx.lineTo(gx, vb.y1); }
  for (var gy = y0; gy < vb.y1; gy += 80) { ctx.moveTo(vb.x0, gy); ctx.lineTo(vb.x1, gy); }
  ctx.stroke();

  /* arena border */
  ctx.strokeStyle = C.rgba(PAL.neonViolet, 0.75);
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, S.K.WORLD.w - 8, S.K.WORLD.h - 8);
};

Renderer.prototype.drawProps = function (world, vb) {
  var ctx = this.ctx;
  for (var i = 0; i < world.props.length; i++) {
    var p = world.props[i];
    if (p.x > vb.x1 || p.x + p.w < vb.x0 || p.y > vb.y1 || p.y + p.h < vb.y0) continue;
    var base = p.type === 'vault' ? [80, 130, 170] : (p.type === 'pillar' ? [86, 74, 130] : [70, 62, 112]);
    var hgt = p.type === 'pillar' ? 30 : 18;
    /* cast shadow: offset toward the light opposite */
    ctx.fillStyle = 'rgba(6,5,18,0.45)';
    ctx.fillRect(p.x + 8, p.y + 10, p.w, p.h);
    /* body — two cel bands, no gradient */
    ctx.fillStyle = cel(base, 1);
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = cel(base, 0);
    ctx.fillRect(p.x, p.y, p.w, Math.min(p.h, 10 + hgt * 0.3));
    /* outline */
    ctx.strokeStyle = C.css(PAL.outline);
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    /* rim light on the top edge */
    ctx.strokeStyle = C.rgba(PAL.rim, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.stroke();
    if (p.type === 'vault') {
      ctx.strokeStyle = C.rgba(PAL.neonCyan, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + 6, p.y + p.h / 2); ctx.lineTo(p.x + p.w - 6, p.y + p.h / 2);
      ctx.stroke();
    }
  }
};

Renderer.prototype.drawEchoes = function (world, vb, localRole) {
  /* The slayer sees the survivors' echo trail; survivors see their own faintly.
   * This is the tracking mechanic, drawn. */
  if (!this.showEchoes) return;
  var ctx = this.ctx;
  var strong = localRole === S.ROLES.SLAYER;
  for (var i = 0; i < world.echoes.length; i++) {
    var e = world.echoes[i];
    if (e.x < vb.x0 || e.x > vb.x1 || e.y < vb.y0 || e.y > vb.y1) continue;
    var a = clamp(e.t / S.K.ECHO_TIME, 0, 1);
    ctx.fillStyle = C.rgba(strong ? PAL.blood : PAL.neonCyan, (strong ? 0.5 : 0.18) * a);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 9 * a + 3, 5 * a + 2, 0, 0, TAU);
    ctx.fill();
  }
};

Renderer.prototype.drawAnchors = function (world, vb) {
  var ctx = this.ctx;
  for (var i = 0; i < world.anchors.length; i++) {
    var a = world.anchors[i];
    if (a.x < vb.x0 - 60 || a.x > vb.x1 + 60 || a.y < vb.y0 - 60 || a.y > vb.y1 + 60) continue;
    var col = a.done ? PAL.anchorDone : (a.workers && a.workers.length ? PAL.anchorWork : PAL.anchorIdle);
    var pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + i);

    /* ground glow */
    ctx.fillStyle = C.rgba(col, a.done ? 0.22 : 0.12 + pulse * 0.1);
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 14, 0, TAU); ctx.fill();

    /* core crystal */
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(this.time * (a.done ? 0.4 : 0.9));
    var R = 20;
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      var ang = k / 6 * TAU;
      var rr = k % 2 ? R * 0.6 : R;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = cel(col, 0);
    ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.css(PAL.outline); ctx.stroke();
    ctx.restore();

    /* progress arc */
    if (!a.done && a.progress > 0) {
      ctx.strokeStyle = C.rgba(PAL.outline, 0.6);
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, -Math.PI / 2, TAU - Math.PI / 2); ctx.stroke();
      ctx.strokeStyle = C.css(col);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, -Math.PI / 2, a.progress * TAU - Math.PI / 2); ctx.stroke();
    }
    if (a.done) {
      ctx.strokeStyle = C.rgba(PAL.anchorDone, 0.7);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 4 + pulse * 4, 0, TAU); ctx.stroke();
    }
    if (a.marked > 0) {
      ctx.strokeStyle = C.rgba(PAL.blood, clamp(a.marked / 5, 0, 1) * 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 16, 0, TAU); ctx.stroke();
    }
  }
};

Renderer.prototype.drawGates = function (world, vb) {
  var ctx = this.ctx;
  for (var i = 0; i < world.gates.length; i++) {
    var g = world.gates[i];
    if (g.x < vb.x0 - 120 || g.x > vb.x1 + 120 || g.y < vb.y0 - 120 || g.y > vb.y1 + 120) continue;
    var col = g.open ? PAL.gateOpen : (g.powered ? PAL.gate : [90, 90, 130]);
    var pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4 + i);

    /* rift tear */
    ctx.save();
    ctx.translate(g.x, g.y);
    var h = 150, w = g.open ? 62 + pulse * 10 : 34;
    var grad = ctx.createLinearGradient(-w, 0, w, 0);
    grad.addColorStop(0, C.rgba(col, 0));
    grad.addColorStop(0.5, C.rgba(col, g.open ? 0.85 : 0.4));
    grad.addColorStop(1, C.rgba(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-w, -h / 2);
    ctx.quadraticCurveTo(w * 0.9, 0, -w, h / 2);
    ctx.quadraticCurveTo(w * 0.4, 0, -w, -h / 2);
    ctx.fill();

    /* frame */
    ctx.strokeStyle = C.css(PAL.outline); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, 0, w + 8, h / 2 + 8, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.rgba(col, g.open ? 0.95 : 0.6); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, w + 8, h / 2 + 8, 0, 0, TAU); ctx.stroke();
    ctx.restore();

    if (g.powered && !g.open && g.progress > 0) {
      ctx.strokeStyle = C.rgba(PAL.outline, 0.6); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(g.x, g.y - 100, 26, 0, TAU); ctx.stroke();
      ctx.strokeStyle = C.css(PAL.gate); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(g.x, g.y - 100, 26, -Math.PI / 2, g.progress * TAU - Math.PI / 2); ctx.stroke();
    }
  }
};

Renderer.prototype.drawHooks = function (world, vb) {
  var ctx = this.ctx;
  for (var i = 0; i < world.hooks.length; i++) {
    var h = world.hooks[i];
    if (h.x < vb.x0 - 60 || h.x > vb.x1 + 60 || h.y < vb.y0 - 60 || h.y > vb.y1 + 60) continue;
    ctx.strokeStyle = C.css(PAL.outline); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(h.x, h.y + 16); ctx.lineTo(h.x, h.y - 34); ctx.stroke();
    ctx.strokeStyle = C.css(PAL.hook); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(h.x, h.y + 16); ctx.lineTo(h.x, h.y - 34); ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.x, h.y - 34, 13, Math.PI * 0.15, Math.PI * 1.1);
    ctx.lineWidth = 5; ctx.strokeStyle = C.css(PAL.hook); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = C.css(PAL.outline); ctx.stroke();
    if (h.occupant >= 0) {
      var pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.strokeStyle = C.rgba(PAL.blood, 0.5 + pulse * 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y - 12, 22 + pulse * 5, 0, TAU); ctx.stroke();
    }
  }
};

/* --- the character. Drawn from geometry so there are no assets to ship,
 * but built as a silhouette: coat, hair spike, rim light, outline. --- */
Renderer.prototype.drawCharacter = function (p, isLocal, world) {
  var ctx = this.ctx;
  var slayer = p.role === S.ROLES.SLAYER;
  var skin = slayer ? SLAYER_SKIN : SURV_SKINS[(p.id - 1) % SURV_SKINS.length];
  var downed = p.state === S.STATE.DOWNED;
  var dead = p.state === S.STATE.DEAD || p.state === S.STATE.ESCAPED;
  if (dead) return;

  var r = S.K.PLAYER_R * (slayer ? 1.5 : 1) * (downed ? 0.75 : 1);
  var bob = downed ? 0 : Math.sin(this.time * 9 + p.id) * 1.6;
  var x = p.x, y = p.y + bob - (p.z || 0);

  /* ground shadow */
  ctx.fillStyle = 'rgba(4,3,14,0.5)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.55, r * 1.05, r * 0.45, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  if (downed) ctx.rotate(0.5);

  /* aura for the slayer and for a charged ultimate */
  if (slayer || p.ult >= S.K.ULT_CHARGE_MAX) {
    var ac = slayer ? PAL.blood : PAL.neonCyan;
    var pu = 0.5 + 0.5 * Math.sin(this.time * (slayer ? 4 : 8));
    ctx.fillStyle = C.rgba(ac, 0.13 + pu * 0.12);
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, TAU); ctx.fill();
  }
  if (p.ultT > 0) {
    ctx.fillStyle = C.rgba(slayer ? PAL.blood : PAL.neonViolet, 0.3);
    ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, TAU); ctx.fill();
  }

  /* coat / body — two cel bands */
  var bodyH = r * (downed ? 1.1 : 2.1);
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, r * 0.6);
  ctx.lineTo(-r * 0.7, -bodyH * 0.55);
  ctx.lineTo(r * 0.7, -bodyH * 0.55);
  ctx.lineTo(r * 0.95, r * 0.6);
  ctx.closePath();
  ctx.fillStyle = cel(skin.coat, 1); ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = C.css(PAL.outline); ctx.stroke();
  /* lit band across the top */
  ctx.save(); ctx.clip();
  ctx.fillStyle = cel(skin.coat, 0);
  ctx.fillRect(-r, -bodyH * 0.6, r * 2, bodyH * 0.5);
  /* halftone in the shadow region — the manga texture */
  if (this.quality !== 'low') {
    ctx.fillStyle = C.rgba(PAL.shadowTint, 0.5);
    for (var hx = -r; hx < r; hx += 5) {
      for (var hy = 0; hy < bodyH * 0.5; hy += 5) {
        if (((hx + hy) / 5 | 0) % 2 === 0) ctx.fillRect(hx, hy, 2.2, 2.2);
      }
    }
  }
  ctx.restore();

  /* accent sash */
  ctx.fillStyle = C.css(skin.accent);
  ctx.fillRect(-r * 0.85, -bodyH * 0.1, r * 1.7, r * 0.28);

  /* head */
  var hy = -bodyH * 0.72;
  ctx.beginPath(); ctx.arc(0, hy, r * 0.62, 0, TAU);
  ctx.fillStyle = cel([248, 226, 208], 0); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = C.css(PAL.outline); ctx.stroke();
  /* hair with a spike — the single strongest anime read at this scale */
  ctx.beginPath();
  ctx.moveTo(-r * 0.66, hy - r * 0.05);
  ctx.lineTo(-r * 0.2, hy - r * 1.15);
  ctx.lineTo(r * 0.15, hy - r * 0.42);
  ctx.lineTo(r * 0.62, hy - r * 0.95);
  ctx.lineTo(r * 0.68, hy + r * 0.1);
  ctx.closePath();
  ctx.fillStyle = cel(skin.hair, 0); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = C.css(PAL.outline); ctx.stroke();

  /* eyes — the slayer gets a glowing slit */
  ctx.fillStyle = slayer ? C.css(PAL.blood) : C.css(PAL.outline);
  var fx = Math.cos(p.facing) * r * 0.2, fy = Math.sin(p.facing) * r * 0.12;
  if (slayer) {
    ctx.shadowColor = C.css(PAL.blood); ctx.shadowBlur = 12;
  }
  ctx.fillRect(fx - r * 0.3, hy - r * 0.12, r * 0.22, r * (slayer ? 0.12 : 0.16));
  ctx.fillRect(fx + r * 0.08, hy - r * 0.12, r * 0.22, r * (slayer ? 0.12 : 0.16));
  ctx.shadowBlur = 0;

  /* rim light: the anime backlight that separates figure from ground */
  ctx.strokeStyle = C.rgba(PAL.rim, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, hy, r * 0.62, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();

  /* weapon — a katana-ish blade that leads the swing */
  if (!downed) {
    var wa = p.facing;
    var swingOff = 0;
    if (p.atkPhase === 'windup') swingOff = -0.7;
    else if (p.atkPhase === 'active') swingOff = 0.9;
    else if (p.atkPhase === 'recover') swingOff = 0.4;
    ctx.save();
    ctx.rotate(wa + swingOff);
    var bl = r * (slayer ? 2.5 : 1.9);
    ctx.strokeStyle = C.css(PAL.outline); ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 0.5 + bl, 0); ctx.stroke();
    ctx.strokeStyle = p.atkPhase === 'active' ? C.css(skin.accent) : C.rgba([225, 235, 255], 0.95);
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 0.5 + bl, 0); ctx.stroke();
    if (p.atkPhase === 'active') {
      ctx.shadowColor = C.css(skin.accent); ctx.shadowBlur = 16;
      ctx.strokeStyle = C.rgba(skin.accent, 0.8); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 0.5 + bl, 0); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /* hit flash: flat white for two frames, the cheapest weight there is */
  if (p.hitFlash > 0) {
    ctx.globalAlpha = clamp(p.hitFlash / 0.16, 0, 1) * 0.85;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -bodyH * 0.3, r * 1.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (p.iframes > 0) {
    ctx.strokeStyle = C.rgba(PAL.neonCyan, 0.7); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -bodyH * 0.3, r * 1.6, 0, TAU); ctx.stroke();
  }
  ctx.restore();

  /* name + state plate above the head */
  var plateY = y - r * 2.5;
  ctx.font = '600 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,5,18,0.85)';
  ctx.strokeText(p.name, x, plateY);
  ctx.fillStyle = isLocal ? C.css(PAL.neonGold) : (slayer ? C.css(PAL.blood) : 'rgba(225,235,255,0.85)');
  ctx.fillText(p.name, x, plateY);

  /* health bar for teammates and the slayer */
  if (!isLocal && !downed) {
    var bw = 46, frac = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(6,5,18,0.8)';
    ctx.fillRect(x - bw / 2 - 1, plateY + 5, bw + 2, 6);
    ctx.fillStyle = slayer ? C.css(PAL.blood) : (frac > 0.5 ? C.css(PAL.anchorDone) : C.css(PAL.neonGold));
    ctx.fillRect(x - bw / 2, plateY + 6, bw * frac, 4);
  }
  if (downed) {
    ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,5,18,0.9)';
    ctx.strokeText('DOWN ' + Math.ceil(p.bleed) + 's', x, plateY);
    ctx.fillStyle = C.css(PAL.blood);
    ctx.fillText('DOWN ' + Math.ceil(p.bleed) + 's', x, plateY);
  }

  /* local player marker */
  if (isLocal) {
    ctx.strokeStyle = C.rgba(PAL.neonGold, 0.55);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, p.y + r * 0.55, r * 1.5, 0, TAU); ctx.stroke();
  }

  /* interaction / skill-check ring */
  if (p.interactKind && p.interactT > 0 && p.interactKind !== 'repair') {
    this.arcProgress(ctx, x, y - r * 3.4, 16, p.interactT, PAL.neonCyan);
  }
};

Renderer.prototype.arcProgress = function (ctx, x, y, r, frac, col) {
  ctx.strokeStyle = 'rgba(6,5,18,0.8)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = C.css(col); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, frac * TAU - Math.PI / 2); ctx.stroke();
};

Renderer.prototype.drawParticles = function (ctx, vb, sparks) {
  for (var i = 0; i < this.parts.length; i++) {
    var p = this.parts[i];
    if (p.spark !== sparks) continue;
    if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;
    var a = 1 - p.t / p.life;
    if (p.spark) {
      ctx.strokeStyle = C.rgba(p.col, a);
      ctx.lineWidth = Math.max(1, p.r * 0.5 * a);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.stroke();
    } else {
      ctx.fillStyle = C.rgba(p.col, a * 0.9);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, TAU); ctx.fill();
    }
  }
};

Renderer.prototype.drawSlashes = function (ctx) {
  for (var i = 0; i < this.slashes.length; i++) {
    var s = this.slashes[i];
    var f = s.t / s.life;
    var a = (1 - f) * (1 - f);
    var spread = s.arc * (0.45 + f * 0.55);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    ctx.globalCompositeOperation = 'lighter';
    /* three nested arcs read as a blade trail, not a pie slice */
    for (var k = 0; k < 3; k++) {
      var rr = s.range * (0.55 + k * 0.22) * (0.8 + f * 0.4);
      ctx.strokeStyle = C.rgba(k === 0 ? [255, 255, 255] : s.col, a * (0.9 - k * 0.25));
      ctx.lineWidth = (s.heavy ? 14 : 8) * (1 - f) * (1 - k * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, rr, -spread / 2, spread / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
};

Renderer.prototype.drawRings = function (ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this.rings.length; i++) {
    var r = this.rings[i];
    var f = r.t / r.life;
    var rad = lerp(r.r0, r.r1, f * f);
    ctx.strokeStyle = C.rgba(r.col, (1 - f) * 0.85);
    ctx.lineWidth = r.w * (1 - f);
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

Renderer.prototype.drawBeams = function (ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this.beams.length; i++) {
    var b = this.beams[i];
    var a = 1 - b.t / b.life;
    ctx.strokeStyle = C.rgba(b.col, a);
    ctx.lineWidth = b.w * a;
    ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

Renderer.prototype.drawTexts = function (ctx) {
  ctx.textAlign = 'center';
  for (var i = 0; i < this.texts.length; i++) {
    var t = this.texts[i];
    var a = 1 - t.t / t.life;
    var sc = 1 + (1 - a) * 0.35;
    ctx.font = '800 ' + Math.round(t.size * sc) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(6,5,18,' + (a * 0.9) + ')';
    ctx.strokeText(t.s, t.x, t.y);
    ctx.fillStyle = C.rgba(t.col, a);
    ctx.fillText(t.s, t.x, t.y);
  }
};

/* Horror lighting: a dark wash with holes punched for light sources. The
 * local player always has a light, so you are never blind — the fear comes
 * from what is at the edge of the light, not from not being able to see.
 *
 * IMPORTANT: the holes are punched on a SEPARATE transparent canvas and that
 * layer is then composited over the scene with a plain source-over draw.
 * Doing destination-out on the main canvas would erase the scene itself
 * (the main canvas is opaque), leaving a blank hole instead of a lit pool. */
/* Offscreen darkness layer. Three construction routes:
 *   1. a host page can provide EOTRender.makeCanvas (our real-pixel test does)
 *   2. the browser's document.createElement('canvas')
 *   3. a no-op stub, so the renderer still constructs in bare headless envs
 * The layer is recreated when the main canvas is resized. */
Renderer.prototype._darkCanvas = function () {
  if (this._dark && this._dark.width === this.cv.width && this._dark.height === this.cv.height) return this._dark;
  var el = null;
  if (root.EOTRender && root.EOTRender.makeCanvas) {
    el = root.EOTRender.makeCanvas(this.cv.width, this.cv.height);
  } else if (typeof document !== 'undefined' && document.createElement) {
    var c = document.createElement('canvas');
    if (c && typeof c.getContext === 'function') { c.width = this.cv.width; c.height = this.cv.height; el = c; }
  }
  if (!el) el = this._mkCanvas(this.cv.width, this.cv.height);
  this._dark = el;
  return el;
};
Renderer.prototype._mkCanvas = function (w, h) {
  var el = { width: w, height: h, getContext: function () { return makeStubCtx(); } };
  function makeStubCtx() {
    return {
      setTransform: function () {}, clearRect: function () {}, fillRect: function () {},
      translate: function () {}, rotate: function () {}, scale: function () {},
      createRadialGradient: function () { return { addColorStop: function () {} }; },
      beginPath: function () {}, arc: function () {}, fill: function () {},
      globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: ''
    };
  }
  return el;
};

Renderer.prototype.drawDarkness = function (world, opts, vb) {
  if (this.quality === 'low') return;
  var dark = this._darkCanvas();
  var dctx = dark.getContext('2d');
  /* reset the layer for this frame: clear everything, then draw fresh */
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dark.width, dark.height);
  dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.applyCamInto(dctx);

  var me = null;
  for (var i = 0; i < world.players.length; i++) if (world.players[i].id === opts.localId) me = world.players[i];
  if (!me) return;
  var terror = opts.terror === undefined ? 0 : opts.terror;

  dctx.globalCompositeOperation = 'source-over';
  dctx.fillStyle = 'rgba(4,3,14,' + (0.62 - terror * 0.08) + ')';
  dctx.fillRect(vb.x0, vb.y0, vb.x1 - vb.x0, vb.y1 - vb.y0);
  dctx.globalCompositeOperation = 'destination-out';

  var lights = [{ x: me.x, y: me.y, r: 340 - terror * 60 }];
  for (var a = 0; a < world.anchors.length; a++) {
    if (world.anchors[a].done) lights.push({ x: world.anchors[a].x, y: world.anchors[a].y, r: 130 });
  }
  for (var g = 0; g < world.gates.length; g++) {
    if (world.gates[g].open) lights.push({ x: world.gates[g].x, y: world.gates[g].y, r: 220 });
  }
  for (var l = 0; l < lights.length; l++) {
    var L = lights[l];
    var grd = dctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = grd;
    dctx.beginPath(); dctx.arc(L.x, L.y, L.r, 0, TAU); dctx.fill();
  }
  dctx.globalCompositeOperation = 'source-over';

  /* composite the finished darkness layer over the scene */
  var ctx = this.ctx;
  ctx.save();
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dark, 0, 0, this.w, this.h);
  ctx.restore();
};

/* Same camera transform as applyCam but onto a supplied context. */
Renderer.prototype.applyCamInto = function (ctx) {
  ctx.translate(this.w / 2 + this.cam.shakeX, this.h / 2 + this.cam.shakeY);
  ctx.rotate(this.cam.rot);
  ctx.scale(this.cam.zoom, this.cam.zoom);
  ctx.translate(-this.cam.x, -this.cam.y);
};

Renderer.prototype.drawSpeedLines = function () {
  if (!this.speedLines.length) return;
  var ctx = this.ctx;
  ctx.save();
  ctx.translate(this.w / 2, this.h / 2);
  for (var i = 0; i < this.speedLines.length; i++) {
    var s = this.speedLines[i];
    var a = (1 - s.t / s.life) * 0.5;
    ctx.strokeStyle = 'rgba(220,240,255,' + a + ')';
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r);
    ctx.lineTo(Math.cos(s.a) * (s.r + s.len), Math.sin(s.a) * (s.r + s.len));
    ctx.stroke();
  }
  ctx.restore();
};

Renderer.prototype.drawVignette = function (opts) {
  var ctx = this.ctx;
  var terror = opts.terror || 0;
  var grd = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.32,
    this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(2,1,8,' + (0.55 + terror * 0.3) + ')');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, this.w, this.h);

  /* the terror vignette: a red pulse that IS the proximity alarm */
  if (terror > 0.02) {
    var pulse = 0.5 + 0.5 * Math.sin(this.time * (2 + terror * 9));
    var g2 = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.2,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
    g2.addColorStop(0, 'rgba(255,0,40,0)');
    g2.addColorStop(1, 'rgba(255,20,50,' + (terror * 0.42 * (0.5 + pulse * 0.5)) + ')');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* chromatic split on big impacts — used sparingly so it still lands */
  if (this.chroma > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.chroma * 0.16;
    ctx.drawImage(this.cv, this.chroma * 6, 0, this.w, this.h);
    ctx.drawImage(this.cv, -this.chroma * 6, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* scanline-ish cel edge on very large screens, cheap anime texture */
  if (this.quality === 'high') {
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = '#000';
    for (var y = 0; y < this.h; y += 3) ctx.fillRect(0, y, this.w, 1);
    ctx.globalAlpha = 1;
  }
};

root.EOTRender = {
  Renderer: Renderer, PAL: PAL, SURV_SKINS: SURV_SKINS, SLAYER_SKIN: SLAYER_SKIN, cel: cel
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
