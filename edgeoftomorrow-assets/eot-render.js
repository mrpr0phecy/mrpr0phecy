/* EOT Render — the 3D anime cel-shaded renderer.
 *
 * True perspective projection on Canvas 2D: the arena is real 3D geometry
 * (a pitched camera looking across a world where Z is up), drawn from
 * extruded prisms with painter's-algorithm depth sorting. No WebGL, no
 * image assets, no dependencies — everything is geometry, so the game stays
 * a single self-contained page.
 *
 * The anime look is a specific set of choices, not a filter:
 *   - flat colour bands, never gradients, on every lit face
 *   - shadows hue-shifted toward violet instead of darkened toward grey
 *   - a bold dark outline on every silhouette
 *   - a rim light on the side away from the key light
 *   - fog that melts the far arena into the rift sky
 *   - speed lines, impact frames and chromatic split reserved for big moments
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
  floor: [32, 26, 66],
  floorLit: [64, 52, 122],
  grid: [96, 72, 180],
  shadowTint: [58, 32, 118],     /* the anime shadow hue */
  outline: [10, 8, 24],
  rim: [190, 235, 255],
  haze: [64, 34, 112],           /* fog colour the distance melts into */
  skyTop: [16, 8, 42],
  skyMid: [72, 24, 118],
  skyHot: [214, 62, 128],
  neonCyan: [72, 232, 255],
  neonMagenta: [255, 78, 190],
  neonGold: [255, 208, 84],
  neonViolet: [168, 110, 255],
  neonGreen: [110, 255, 160],
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
  { name: 'RIN',   hair: [255, 214, 120], coat: [64, 150, 235],  accent: [120, 240, 255], weapon: 'katana',   classId: 'duelist' },
  { name: 'KAITO', hair: [120, 200, 255], coat: [52, 60, 120],   accent: [110, 255, 160], weapon: 'medblade', classId: 'medic' },
  { name: 'YUKI',  hair: [255, 255, 255], coat: [190, 70, 120],  accent: [255, 208, 84],  weapon: 'wrench',   classId: 'engineer' },
  { name: 'SORA',  hair: [150, 255, 190], coat: [40, 110, 96],   accent: [140, 255, 200], weapon: 'daggers',  classId: 'scout' },
  { name: 'AKIRA', hair: [255, 120, 90],  coat: [120, 44, 60],   accent: [255, 208, 84],  weapon: 'katana',   classId: 'duelist' },
  { name: 'MIO',   hair: [200, 160, 255], coat: [70, 50, 130],   accent: [190, 150, 255], weapon: 'medblade', classId: 'medic' }
];
var SLAYER_SKIN = { hair: [230, 40, 70], coat: [46, 16, 40], accent: [255, 62, 78], weapon: 'scythe' };

/* Key light direction (from above, behind-left of the camera). */
var LKEY = (function () {
  var x = -0.42, y = -0.62, z = 0.66;
  var m = Math.sqrt(x * x + y * y + z * z);
  return { x: x / m, y: y / m, z: z / m };
})();

function cel(col, band) {
  /* band 0 = lit, 1 = mid, 2 = deep shadow. Shadows shift hue, they do not
   * just get darker. */
  if (band <= 0) return C.css(col);
  var t = band === 1 ? 0.34 : 0.62;
  return C.css(C.mixRGB(col, PAL.shadowTint, t));
}

function bandOf(nx, ny, nz) {
  var lum = nx * LKEY.x + ny * LKEY.y + nz * LKEY.z;
  return lum > 0.52 ? 0 : (lum > 0.08 ? 1 : 2);
}

function fogMix(col, vf) {
  var t = clamp((vf - 620) / 1500, 0, 1) * 0.82;
  return t > 0.01 ? C.mixRGB(col, PAL.haze, t) : col;
}
function fogCss(col, vf) { return C.css(fogMix(col, vf)); }
function fogRgba(col, vf, a) {
  var t = clamp((vf - 620) / 1500, 0, 1) * 0.82;
  return C.rgba(C.mixRGB(col, PAL.haze, t), a);
}

/* ============================ RENDERER ============================ */
function Renderer(canvas) {
  this.cv = canvas;
  this.ctx = canvas.getContext('2d', { alpha: false });
  this.w = 0; this.h = 0; this.dpr = 1;
  this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1, shake: 0, shakeX: 0, shakeY: 0, rot: 0 };
  /* the 3D rig: eye sits `back` behind the look-at point at `height`, pitched
   * down by `pitch`; fov is the vertical field of view; cy biases the frame
   * downward so the player sits below centre (more sky, less dead foreground). */
  this.cam3 = { pitch: 0.70, height: 210, back: 249, fov: 1.43, near: 12, cy: 0.56 };
  this.parts = [];
  this.texts = [];
  this.slashes = [];
  this.rings = [];
  this.beams = [];
  this.speedLines = [];
  this.ghosts = [];
  this.flash = 0; this.flashCol = [255, 255, 255];
  this.chroma = 0;
  this.impact = 0;
  this.time = 0;
  this.halftone = null;
  this.quality = 'high';
  this.showEchoes = true;
  this.showCompass = true;
  this._sky = null;
  this._motes = [];
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
    var a = base + (i / n) * TAU + (Math.random() - 0.5) * 0.5;
    var sp = (opt.speed || 220) * (0.5 + Math.random() * 0.9);
    this.parts.push({
      x: x, y: y, z: 24 + Math.random() * 30,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      vz: (opt.grav === undefined ? 240 : -opt.grav) * (0.4 + Math.random() * 0.8),
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
    x: x, y: y, z: 30, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vz: 30,
    life: 0.34, t: 0, r: r || 6, col: col, grav: 30, spark: false, drag: 3
  });
};

Renderer.prototype.text = function (x, y, str, col, size) {
  this.texts.push({ x: x, y: y, z: 64, vz: 62, s: String(str), col: col || [255, 255, 255], size: size || 20, t: 0, life: 0.95 });
  if (this.texts.length > 40) this.texts.shift();
};

Renderer.prototype.slash = function (x, y, ang, range, arc, col, heavy) {
  this.slashes.push({ x: x, y: y, z: 46, ang: ang, range: range, arc: arc, col: col, t: 0, life: heavy ? 0.32 : 0.22, heavy: !!heavy });
  if (this.slashes.length > 24) this.slashes.shift();
};

Renderer.prototype.ring = function (x, y, r0, r1, col, life, width) {
  this.rings.push({ x: x, y: y, z: 2, r0: r0, r1: r1, col: col, t: 0, life: life || 0.4, w: width || 6 });
  if (this.rings.length > 30) this.rings.shift();
};

Renderer.prototype.beam = function (x0, y0, x1, y1, col, life, width) {
  this.beams.push({ x0: x0, y0: y0, x1: x1, y1: y1, col: col, t: 0, life: life || 0.2, w: width || 5 });
  if (this.beams.length > 40) this.beams.shift();
};

Renderer.prototype.addGhost = function (x, y, facing, skin, slayer) {
  if (this.quality === 'low') return;
  this.ghosts.push({ x: x, y: y, facing: facing, skin: skin, slayer: !!slayer, t: 0, life: 0.28 });
  if (this.ghosts.length > 20) this.ghosts.shift();
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

/* Turn a sim event into spectacle. This is the whole game-feel mapping.
 * `t` aliases the sim's canonical names onto the table below: the sim emits
 * ultSurv/ultSlayer/gatesPowered/gateDone/anchorSmash, and every one of them
 * deserves its moment. */
Renderer.prototype.onEvent = function (e, local) {
  var isLocal = e.by === local || e.to === local;
  var t = e.t;
  if (t === 'ultSurv') { e.role = 'survivor'; t = 'ult'; }
  else if (t === 'ultSlayer') { e.role = 'slayer'; t = 'ult'; }
  else if (t === 'gatesPowered') { t = 'powered'; if (e.x === undefined) { e.x = 1200; e.y = 1200; } }
  else if (t === 'gateDone') { t = 'gateOpen'; }
  else if (t === 'anchorSmash') { t = 'anchorHit'; }
  else if (t === 'matchEnd' && e.reason === 'regicide') {
    t = 'core';
    if (e.x === undefined) { e.x = 1200; e.y = 1200; }
  }
  switch (t) {
    case 'swing':
      this.slash(e.x, e.y, e.ang, e.heavy ? 84 : 58, e.heavy ? 2.0 : 1.7,
        e.heavy ? PAL.blood : PAL.neonCyan, e.heavy);
      if (e.heavy) this.shake(2.5);
      break;
    case 'hit':
      /* the sim's hit payload carries damage as `dmg` (see sim `damage()`) */
      var amt = e.dmg || 0;
      this.burst(e.x, e.y, amt >= 40 ? 26 : 14, amt >= 40 ? PAL.blood : PAL.neonGold,
        { speed: amt >= 40 ? 420 : 280, size: amt >= 40 ? 5 : 3.5, spark: true, life: 0.45 });
      this.ring(e.x, e.y, 8, amt >= 40 ? 78 : 46, [255, 255, 255], 0.22, 5);
      this.shake(amt >= 40 ? 9 : 4.5);
      if (amt >= 40) { this.doChroma(0.7); this.doImpact(1); }
      if (isLocal) this.doFlash([255, 90, 90], 0.3);
      else this.doFlash([255, 255, 255], 0.13);
      this.text(e.x, e.y - 24, Math.round(amt), amt >= 40 ? PAL.blood : PAL.neonGold, amt >= 40 ? 30 : 20);
      break;
    case 'parry':
      this.burst(e.x, e.y, 38, PAL.neonGold, { speed: 480, size: 5, spark: true, life: 0.5 });
      this.ring(e.x, e.y, 10, 130, PAL.neonGold, 0.35, 8);
      this.ring(e.x, e.y, 6, 75, [255, 255, 255], 0.2, 5);
      this.shake(12);
      this.doChroma(0.8);
      this.doImpact(1);
      this.doFlash([255, 240, 180], 0.35);
      this.text(e.x, e.y - 42, 'CLASH! PARRY', PAL.neonGold, 28);
      break;
    case 'vault':
      this.burst(e.x, e.y, 12, PAL.neonCyan, { speed: 180, size: 3, life: 0.3 });
      this.text(e.x, e.y - 24, 'VAULT', PAL.neonCyan, 18);
      break;
    case 'trapPlace':
      this.ring(e.x, e.y, 4, 38, PAL.neonViolet, 0.35, 4);
      break;
    case 'trapTrigger':
      this.ring(e.x, e.y, 8, 86, PAL.neonViolet, 0.45, 8);
      this.burst(e.x, e.y, 24, PAL.neonViolet, { speed: 320, size: 4, life: 0.5 });
      this.shake(7);
      this.text(e.x, e.y - 34, 'STASIS TRAP', PAL.neonViolet, 22);
      break;
    case 'ping':
      this.ring(e.x, e.y, 6, 120, PAL.neonCyan, 0.6, 5);
      this.text(e.x, e.y - 30, 'PING', PAL.neonCyan, 20);
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
    case 'palletDrop':
      this.shake(4);
      this.burst(e.x, e.y, 14, PAL.outline, { speed: 180, size: 4, life: 0.4 });
      this.text(e.x, e.y - 30, 'PALLET DOWN', PAL.neonGold, 20);
      break;
    case 'palletStun':
      this.shake(12); this.doFlash([255, 220, 60], 0.3);
      this.burst(e.x, e.y, 28, PAL.neonGold, { speed: 380, size: 5, life: 0.6 });
      this.text(e.x, e.y - 45, 'PALLET STUN!', PAL.neonGold, 28);
      break;
    case 'palletBreak':
      this.shake(6);
      this.burst(e.x, e.y, 22, [180, 140, 100], { speed: 280, size: 4, life: 0.5 });
      this.text(e.x, e.y - 30, 'SHATTERED', [200, 160, 120], 18);
      break;
    case 'chestOpened':
      this.burst(e.x, e.y, 24, PAL.neonCyan, { speed: 240, size: 4, life: 0.6, grav: -80 });
      this.text(e.x, e.y - 38, 'SUPPLY: ' + (e.item ? e.item.toUpperCase() : 'ITEM'), PAL.neonCyan, 22);
      break;
    case 'flashBang':
      this.doFlash([255, 255, 255], 0.75); this.shake(10);
      this.ring(e.x, e.y, 10, 260, [255, 255, 255], 0.6, 12);
      this.burst(e.x, e.y, 40, [255, 255, 255], { speed: 500, size: 6, life: 0.7 });
      break;
    case 'flashBlind':
      this.doFlash([255, 255, 255], 0.9); this.shake(12);
      this.text(e.x, e.y - 48, 'FLASH BLINDED!', [255, 255, 255], 26);
      break;
    case 'chronoRewind':
      this.doFlash([200, 120, 255], 0.35); this.shake(7);
      this.ring(e.fromX, e.fromY, 8, 140, PAL.neonViolet, 0.5, 8);
      this.burst(e.fromX, e.fromY, 30, PAL.neonViolet, { speed: 320, size: 4, life: 0.6 });
      this.text(e.toX, e.toY - 42, 'CHRONO REWIND', PAL.neonViolet, 24);
      break;
    case 'riposte':
      this.doFlash([255, 240, 140], 0.4); this.shake(10);
      this.burst(e.x, e.y, 35, PAL.neonGold, { speed: 450, size: 5, life: 0.6 });
      this.text(e.x, e.y - 45, 'RIPOSTE CRITICAL!', PAL.neonGold, 28);
      break;
    case 'awakening':
      this.doFlash([255, 40, 60], 0.6); this.shake(16);
      this.ring(e.x, e.y, 12, 320, PAL.blood, 0.8, 16);
      this.burst(e.x, e.y, 60, PAL.blood, { speed: 600, size: 7, life: 0.9 });
      this.text(e.x, e.y - 55, 'RIFT AWAKENING!', PAL.blood, 32);
      break;
    case 'serumUsed':
      this.burst(e.x, e.y, 18, PAL.neonCyan, { speed: 200, size: 3.5, life: 0.5, grav: -100 });
      this.text(e.x, e.y - 36, 'ADRENALINE SURGE', PAL.neonCyan, 20);
      break;
    case 'overclockShock':
      this.doFlash([255, 180, 80], 0.35); this.shake(8);
      this.burst(e.x, e.y, 25, [255, 180, 80], { speed: 360, size: 4, life: 0.5 });
      this.text(e.x, e.y - 40, 'OVERCLOCK OVERLOAD', [255, 120, 60], 22);
      break;
    case 'matchStart':
      this.doFlash([120, 200, 255], 0.35);
      break;
    case 'hookStage':
      this.ring(e.x, e.y, 8, 130, PAL.hook, 0.5, 7);
      this.text(e.x, e.y - 46, 'STAGE ' + (e.stage || 2), PAL.blood, 24);
      this.shake(5);
      if (isLocal) this.doFlash([255, 60, 60], 0.22);
      break;
    case 'good':
      this.text(e.x, e.y - 40, 'GOOD', [190, 230, 255], 18);
      break;
    case 'pickup':
      this.text(e.x, e.y - 34, 'PICKED UP', PAL.blood, 18);
      break;
    case 'dropVictim':
      this.text(e.x, e.y - 34, 'DROPPED', PAL.neonGold, 18);
      this.burst(e.x, e.y, 10, PAL.neonGold, { speed: 160, size: 3, life: 0.35 });
      break;
    case 'toolUsed':
      this.ring(e.x, e.y, 6, 110, PAL.neonCyan, 0.4, 6);
      this.text(e.x, e.y - 40, 'NANITE SURGE', PAL.neonCyan, 18);
      break;
    case 'decoySpawned':
      this.ring(e.x, e.y, 6, 150, PAL.neonViolet, 0.5, 6);
      this.text(e.x, e.y - 36, 'DECOY', PAL.neonViolet, 18);
      break;
    case 'matchEnd':
      break;
    default: break;
  }
};

/* ------------------------- update ------------------------- */
Renderer.prototype.update = function (dt, localPlayer) {
  this.time += dt;
  var i;

  /* camera follow with lookahead */
  if (localPlayer) {
    var lead = 90;
    this.cam.tx = localPlayer.x + Math.cos(localPlayer.aim || 0) * lead;
    this.cam.ty = localPlayer.y + Math.sin(localPlayer.aim || 0) * lead;
  }
  var zk = 1 - Math.pow(0.001, dt);
  this.cam.x += (this.cam.tx - this.cam.x) * zk;
  this.cam.y += (this.cam.ty - this.cam.y) * zk;
  this.cam.zoom += (this.cam.tzoom - this.cam.zoom) * zk;

  /* trauma-style shake */
  this.cam.shake = Math.max(0, this.cam.shake - dt * 42);
  var s = this.cam.shake / 28;
  this.cam.shakeX = (Math.random() - 0.5) * 2 * s * s * 28;
  this.cam.shakeY = (Math.random() - 0.5) * 2 * s * s * 28;
  this.cam.rot = (Math.random() - 0.5) * s * 0.02;

  this.flash = Math.max(0, this.flash - dt * 3.2);
  this.chroma = Math.max(0, this.chroma - dt * 2.6);
  this.impact = Math.max(0, this.impact - dt * 5);

  for (i = this.parts.length - 1; i >= 0; i--) {
    var p = this.parts[i];
    p.t += dt;
    if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
    var dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vy *= dr; p.vz *= dr;
    p.vz -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.z < 2) { p.z = 2; p.vz *= -0.35; }
  }
  for (i = this.texts.length - 1; i >= 0; i--) {
    var tx = this.texts[i];
    tx.t += dt;
    if (tx.t >= tx.life) { this.texts.splice(i, 1); continue; }
    tx.z += tx.vz * dt; tx.vz *= Math.exp(-2.4 * dt);
  }
  for (i = this.ghosts.length - 1; i >= 0; i--) {
    var gh = this.ghosts[i];
    gh.t += dt;
    if (gh.t >= gh.life) { this.ghosts.splice(i, 1); }
  }
  for (i = this.slashes.length - 1; i >= 0; i--) { this.slashes[i].t += dt; if (this.slashes[i].t >= this.slashes[i].life) this.slashes.splice(i, 1); }
  for (i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].life) this.rings.splice(i, 1); }
  for (i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t >= this.beams[i].life) this.beams.splice(i, 1); }
  for (i = this.speedLines.length - 1; i >= 0; i--) { this.speedLines[i].t += dt; if (this.speedLines[i].t >= this.speedLines[i].life) this.speedLines.splice(i, 1); }

  /* ambient rift motes drift around the camera */
  if (this.quality !== 'low' && this._motes.length < 26 && Math.random() < 0.5) {
    this._motes.push({
      x: this.cam.x + (Math.random() - 0.5) * 1400,
      y: this.cam.y + (Math.random() - 0.5) * 1000,
      z: 30 + Math.random() * 240,
      vz: 8 + Math.random() * 16, phase: Math.random() * TAU,
      col: Math.random() < 0.5 ? PAL.neonCyan : PAL.neonMagenta
    });
  }
  for (i = this._motes.length - 1; i >= 0; i--) {
    var m = this._motes[i];
    m.z += m.vz * dt;
    m.phase += dt * 1.5;
    if (m.z > 320) this._motes.splice(i, 1);
  }
};

/* ==================== 3D PROJECTION CORE ====================
 * World: X east, Y south (sim convention), Z up. The eye sits behind the
 * look-at point (cam.x, cam.y) and looks toward +Y, pitched down. */
Renderer.prototype._eye = function () {
  return { x: this.cam.x, y: this.cam.y - this.cam3.back, z: this.cam3.height };
};
Renderer.prototype._basis = function () {
  var p = this.cam3.pitch;
  return { sp: Math.sin(p), cp: Math.cos(p), eye: this._eye() };
};
Renderer.prototype.view = function (x, y, z, b) {
  b = b || this._basis();
  var dx = x - b.eye.x, dy = y - b.eye.y, dz = z - b.eye.z;
  return {
    vx: dx,
    vy: dy * b.sp + dz * b.cp,
    vf: dy * b.cp - dz * b.sp
  };
};
Renderer.prototype.projectView = function (v) {
  if (v.vf <= this.cam3.near) return null;
  var focal = (this.h / 2) / Math.tan(this.cam3.fov / 2) * this.cam.zoom;
  var s = focal / v.vf;
  var rx = v.vx * s, ry = -v.vy * s;
  var rot = this.cam.rot;
  if (rot) {
    var cr = Math.cos(rot), sr = Math.sin(rot);
    var nx = rx * cr - ry * sr;
    ry = rx * sr + ry * cr;
    rx = nx;
  }
  return {
    x: this.w / 2 + rx + this.cam.shakeX,
    y: this.h * (this.cam3.cy || 0.5) + ry + this.cam.shakeY,
    s: s, d: v.vf
  };
};
Renderer.prototype.project = function (x, y, z, b) {
  return this.projectView(this.view(x, y, z || 0, b));
};
Renderer.prototype.toScreen = function (x, y) {
  var p = this.project(x, y, 0);
  return p ? { x: p.x, y: p.y } : { x: -9999, y: -9999 };
};
/* groundAt: unproject a screen point onto the Z=0 plane (for culling). */
Renderer.prototype.groundAt = function (sx, sy) {
  var b = this._basis();
  var focal = (this.h / 2) / Math.tan(this.cam3.fov / 2) * this.cam.zoom;
  var vx = (sx - this.cam.shakeX - this.w / 2) / focal;
  var vy = -(sy - this.cam.shakeY - this.h * (this.cam3.cy || 0.5)) / focal;
  var dz = b.cp * vy - b.sp;
  if (dz > -0.02) return null;
  var t = -b.eye.z / dz;
  return { x: b.eye.x + vx * t, y: b.eye.y + (b.sp * vy + b.cp) * t };
};
Renderer.prototype.viewBounds = function () {
  var corners = [
    this.groundAt(-80, -80), this.groundAt(this.w + 80, -80),
    this.groundAt(-80, this.h + 80), this.groundAt(this.w + 80, this.h + 80)
  ];
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false, farOpen = false;
  for (var i = 0; i < 4; i++) {
    if (!corners[i]) {
      /* a null corner is above the horizon: the view runs to the far plane */
      if (i < 2) farOpen = true;
      continue;
    }
    ok = true;
    x0 = Math.min(x0, corners[i].x); x1 = Math.max(x1, corners[i].x);
    y0 = Math.min(y0, corners[i].y); y1 = Math.max(y1, corners[i].y);
  }
  if (!ok) return { x0: this.cam.x - 900, y0: this.cam.y - 900, x1: this.cam.x + 900, y1: this.cam.y + 1900 };
  if (farOpen) y1 = Math.max(y1, this.cam.y + 1900);
  return { x0: x0, y0: y0, x1: x1, y1: Math.min(y1, this.cam.y + 2100) };
};

/* clip a view-space polygon against the near plane, then draw it */
Renderer.prototype.poly3 = function (pts, fill, stroke, lw, alpha, b) {
  b = b || this._basis();
  var vs = [], i;
  for (i = 0; i < pts.length; i++) vs.push(this.view(pts[i][0], pts[i][1], pts[i][2], b));
  var out = [];
  var n = vs.length, near = this.cam3.near;
  for (i = 0; i < n; i++) {
    var a = vs[i], c = vs[(i + 1) % n];
    var ain = a.vf >= near, cin = c.vf >= near;
    if (ain) out.push(a);
    if (ain !== cin) {
      var t = (near - a.vf) / (c.vf - a.vf);
      out.push({ vx: a.vx + (c.vx - a.vx) * t, vy: a.vy + (c.vy - a.vy) * t, vf: near + 0.01 });
    }
  }
  if (out.length < 3) return null;
  var ctx = this.ctx, first = true, last = null;
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (i = 0; i < out.length; i++) {
    var sp = this.projectView(out[i]);
    if (!sp) continue;
    if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
    else ctx.lineTo(sp.x, sp.y);
    last = sp;
  }
  if (last) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  if (alpha !== undefined) ctx.globalAlpha = 1;
  return last;
};

/* an extruded prism with per-face cel bands and a bold outline */
Renderer.prototype.box = function (x, y, z0, z1, w, d, rot, col, opt) {
  opt = opt || {};
  var b = this._basis();
  var hw = w / 2, hd = d / 2, cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
  var pts = [];
  var corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (var i = 0; i < 4; i++) {
    var px = corners[i][0] * cr - corners[i][1] * sr;
    var py = corners[i][0] * sr + corners[i][1] * cr;
    pts.push([x + px, y + py, 0]);
  }
  if (opt.noDraw) return pts;
  var order = [];
  for (i = 0; i < 4; i++) {
    var nx = pts[(i + 1) % 4][0] - pts[i][0], ny = pts[(i + 1) % 4][1] - pts[i][1];
    var len = Math.hypot(nx, ny) || 1;
    /* outward normal of edge i->i+1 (CCW wound in x/y) */
    var onx = ny / len, ony = -nx / len;
    var cx = (pts[i][0] + pts[(i + 1) % 4][0]) / 2, cy = (pts[i][1] + pts[(i + 1) % 4][1]) / 2;
    var facing = onx * (cx - b.eye.x) + ony * (cy - b.eye.y);
    if (facing < 0) {
      var band = bandOf(onx, ony, 0);
      var faceC = [(pts[i][0] + pts[(i + 1) % 4][0]) / 2, (pts[i][1] + pts[(i + 1) % 4][1]) / 2, (z0 + z1) / 2];
      order.push({
        face: [
          [pts[i][0], pts[i][1], z0], [pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], z0],
          [pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], z1], [pts[i][0], pts[i][1], z1]
        ],
        band: band,
        vf: this.view(faceC[0], faceC[1], faceC[2], b).vf
      });
    }
  }
  var lw = opt.lw || 2.5;
  for (i = 0; i < order.length; i++) {
    var fc = C.mixRGB(col, PAL.shadowTint, order[i].band === 0 ? 0 : (order[i].band === 1 ? 0.34 : 0.62));
    this.poly3(order[i].face, C.css(fogMix(fc, order[i].vf)), C.rgba(PAL.outline, 0.9), lw, undefined, b);
  }
  /* top face */
  var topCol = C.css(fogMix(col, this.view(x, y, z1, b).vf));
  this.poly3([
    [pts[0][0], pts[0][1], z1], [pts[1][0], pts[1][1], z1],
    [pts[2][0], pts[2][1], z1], [pts[3][0], pts[3][1], z1]
  ], topCol, C.rgba(PAL.outline, 0.9), lw, undefined, b);
  /* rim light along the up-left edges */
  if (this.quality !== 'low') {
    this.ctx.strokeStyle = C.rgba(PAL.rim, 0.3);
    this.ctx.lineWidth = 1.6;
    var r0 = this.project(pts[3][0], pts[3][1], z1, b), r1 = this.project(pts[0][0], pts[0][1], z1, b);
    if (r0 && r1) {
      this.ctx.beginPath();
      this.ctx.moveTo(r0.x, r0.y); this.ctx.lineTo(r1.x, r1.y); this.ctx.stroke();
    }
  }
};

/* a circle lying on (or above) the ground — used for rings, glows, shadows */
Renderer.prototype.groundCircle = function (x, y, z, r, fill, stroke, lw, b) {
  b = b || this._basis();
  var pts = [];
  for (var i = 0; i < 14; i++) {
    var a = i / 14 * TAU;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
  }
  return this.poly3(pts, fill, stroke, lw, undefined, b);
};

/* a soft glow (fake bloom) at a world point */
Renderer.prototype.glow = function (x, y, z, r, col, a) {
  var p = this.project(x, y, z);
  if (!p) return;
  var ctx = this.ctx;
  var rr = r * p.s;
  if (rr < 1) return;
  var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
  g.addColorStop(0, C.rgba(col, a));
  g.addColorStop(0.55, C.rgba(col, a * 0.32));
  g.addColorStop(1, C.rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rr, 0, TAU);
  ctx.fill();
};

/* ============================ DRAW ============================ */
Renderer.prototype.render = function (world, opts) {
  opts = opts || {};
  var ctx = this.ctx;
  var localId = opts.localId;
  var vb = this.viewBounds();
  this._lastRole = opts.localRole;

  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.drawSky(world, vb);
  this.drawGround(world, vb);

  /* scene objects, painter-sorted by view depth (far first) */
  var items = [];
  var i;
  var push = function (x, y, fn, self) {
    var v = self.view(x, y, 0);
    items.push({ d: v.vf, fn: fn, self: self });
  };
  for (i = 0; i < world.props.length; i++) {
    var pr = world.props[i];
    if (pr.x + pr.w < vb.x0 || pr.x > vb.x1 || pr.y + pr.h < vb.y0 || pr.y > vb.y1) continue;
    push(pr.x + pr.w / 2, pr.y + pr.h / 2, this.drawProp, this);
    items[items.length - 1].arg = pr;
  }
  var lists = [
    [world.pallets || [], this.drawPallet],
    [world.chests || [], this.drawChest],
    [world.lockers || [], this.drawLocker],
    [world.traps || [], this.drawTrap],
    [world.anchors || [], this.drawAnchor],
    [world.gates || [], this.drawGate],
    [world.hooks || [], this.drawHook]
  ];
  for (var l = 0; l < lists.length; l++) {
    var arr = lists[l][0], fn = lists[l][1];
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it.x < vb.x0 - 160 || it.x > vb.x1 + 160 || it.y < vb.y0 - 160 || it.y > vb.y1 + 260) continue;
      push(it.x, it.y, fn, this);
      items[items.length - 1].arg = it;
      items[items.length - 1].idx = i;
    }
  }
  var ps = world.players || [];
  for (i = 0; i < ps.length; i++) {
    var p = ps[i];
    if (p.x < vb.x0 - 120 || p.x > vb.x1 + 120 || p.y < vb.y0 - 120 || p.y > vb.y1 + 220) continue;
    push(p.x, p.y, this.drawCharacter, this);
    items[items.length - 1].arg = p;
  }
  items.sort(function (a, b2) { return b2.d - a.d; });
  for (i = 0; i < items.length; i++) items[i].fn.call(items[i].self, items[i].arg, items[i].idx, localId, world);

  this.drawEchoes(world, vb);
  this.drawGhosts();
  this.drawRings();
  this.drawSlashes();
  this.drawBeams();
  this.drawParticles();
  this.drawMotes();
  this.drawDarkness(world, opts, vb);
  this.drawTexts();

  /* ---- post ---- */
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.drawSpeedLines();
  this.drawVignette(opts);
  if (this.showCompass && localId) this.drawRadarCompass(world, localId, opts.localRole);

  if (this.flash > 0.001) {
    ctx.globalAlpha = Math.min(0.85, this.flash);
    ctx.fillStyle = C.css(this.flashCol);
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }
};

/* ------------------------- sky & distance ------------------------- */
Renderer.prototype.drawSky = function (world, vb) {
  var ctx = this.ctx;
  var horizonY = this.h * (this.cam3.cy || 0.5) - ((this.h / 2) / Math.tan(this.cam3.fov / 2) * this.cam.zoom) * Math.tan(this.cam3.pitch);

  var g = ctx.createLinearGradient(0, 0, 0, Math.max(this.h, horizonY + this.h * 0.5));
  g.addColorStop(0, C.css(PAL.skyHot));
  g.addColorStop(Math.max(0.02, horizonY / this.h * 0.9), C.css(PAL.skyMid));
  g.addColorStop(Math.min(1, Math.max(0.05, (horizonY + this.h * 0.42) / this.h)), C.css(PAL.skyTop));
  g.addColorStop(1, C.css(PAL.nightDeep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, this.w, this.h);

  /* stars in the sky band */
  if (!this._stars && this.quality !== 'low') {
    this._stars = [];
    for (var s = 0; s < 60; s++) {
      this._stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4, tw: Math.random() * TAU });
    }
  }
  if (this._stars) {
    for (var i = 0; i < this._stars.length; i++) {
      var st = this._stars[i];
      var sy = st.y * Math.max(40, horizonY + 30);
      var a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 1.7 + st.tw));
      ctx.fillStyle = 'rgba(220,225,255,' + (a * (1 - sy / (horizonY + 60))).toFixed(2) + ')';
      ctx.fillRect(st.x * this.w, sy, st.r, st.r);
    }
  }

  /* aurora ribbons */
  if (this.quality === 'high' && horizonY > -40) {
    ctx.globalCompositeOperation = 'lighter';
    for (var r = 0; r < 2; r++) {
      var yo = horizonY * (0.35 + r * 0.32) + Math.sin(this.time * 0.22 + r * 2) * 10;
      ctx.fillStyle = r === 0 ? 'rgba(109,59,255,0.12)' : 'rgba(255,47,109,0.09)';
      ctx.beginPath();
      ctx.moveTo(0, yo + 40);
      for (var x = 0; x <= this.w; x += 80) {
        ctx.lineTo(x, yo + Math.sin(x / 240 + this.time * 0.35 + r) * 26);
      }
      ctx.lineTo(this.w, yo + 90);
      ctx.lineTo(0, yo + 90);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* distant rift spires on the horizon */
  if (!this._spires) {
    this._spires = [];
    for (var k = 0; k < 14; k++) {
      this._spires.push({
        x: k / 14 + (Math.sin(k * 37.7) * 0.5 + 0.5) * 0.06,
        w: 26 + (Math.sin(k * 12.9) * 0.5 + 0.5) * 70,
        h: 60 + (Math.sin(k * 7.3) * 0.5 + 0.5) * 150,
        hot: k % 3 === 0
      });
    }
  }
  var hz = horizonY + 26;
  for (var sp2 = 0; sp2 < this._spires.length; sp2++) {
    var s2 = this._spires[sp2];
    var sx = s2.x * this.w;
    ctx.fillStyle = s2.hot ? 'rgba(70,22,72,0.9)' : 'rgba(26,12,52,0.95)';
    ctx.beginPath();
    ctx.moveTo(sx - s2.w / 2, hz);
    ctx.lineTo(sx - s2.w * 0.18, hz - s2.h * 0.62);
    ctx.lineTo(sx, hz - s2.h);
    ctx.lineTo(sx + s2.w * 0.18, hz - s2.h * 0.62);
    ctx.lineTo(sx + s2.w / 2, hz);
    ctx.closePath();
    ctx.fill();
    if (s2.hot) {
      ctx.fillStyle = 'rgba(255,78,190,0.55)';
      ctx.fillRect(sx - 1.5, hz - s2.h, 3, s2.h * 0.5);
    }
  }
  /* horizon glow */
  var hg = ctx.createLinearGradient(0, hz - 90, 0, hz + 40);
  hg.addColorStop(0, 'rgba(255,110,150,0)');
  hg.addColorStop(1, 'rgba(255,120,160,0.5)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, hz - 90, this.w, 130);
};

/* ------------------------- ground ------------------------- */
Renderer.prototype.drawGround = function (world, vb) {
  var ctx = this.ctx;
  var b = this._basis();
  var W = S.K.WORLD.w, H = S.K.WORLD.h;
  var tile = 120;
  var x0 = Math.max(-260, Math.floor(vb.x0 / tile) * tile);
  var x1 = Math.min(W + 260, Math.ceil(vb.x1 / tile) * tile);
  var y0 = Math.max(-260, Math.floor(vb.y0 / tile) * tile);
  var y1 = Math.min(Math.max(vb.y1, this.cam.y + 600), this.cam.y + 2100);

  for (var gx = x0; gx < x1; gx += tile) {
    for (var gy = y0; gy < y1; gy += tile) {
      var check = (((gx / tile) | 0) + ((gy / tile) | 0)) % 2 === 0;
      var col = check ? PAL.floor : PAL.floorLit;
      /* subtle per-tile variation so the floor never reads flat */
      var v = ((gx * 7 + gy * 13) % 23) / 23;
      col = C.mixRGB(col, v > 0.5 ? PAL.floorLit : PAL.night, 0.16 * Math.abs(v - 0.5));
      var v0 = this.view(gx, gy, 0, b);
      this.poly3([
        [gx, gy, 0], [gx + tile, gy, 0], [gx + tile, gy + tile, 0], [gx, gy + tile, 0]
      ], fogCss(col, (v0.vf + tile) * 0.9), null, 0, undefined, b);
    }
  }
  /* grid lines */
  ctx.strokeStyle = C.rgba(PAL.grid, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  var started = false;
  for (var lx = x0; lx <= x1; lx += 80) {
    var pa = this.project(lx, y0, 0, b), pb = this.project(lx, Math.min(y1, y0 + 2200), 0, b);
    if (pa && pb) { ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); started = true; }
  }
  for (var ly = y0; ly <= y1; ly += 80) {
    var pc = this.project(x0, ly, 0, b), pd = this.project(x1, ly, 0, b);
    if (pc && pd) { ctx.moveTo(pc.x, pc.y); ctx.lineTo(pd.x, pd.y); started = true; }
  }
  if (started) ctx.stroke();

  /* arena edge: a glowing neon boundary wall */
  var edge = [
    [[0, 0, 0], [W, 0, 0]], [[W, 0, 0], [W, H, 0]],
    [[W, H, 0], [0, H, 0]], [[0, H, 0], [0, 0, 0]]
  ];
  for (var e = 0; e < edge.length; e++) {
    var a = edge[e][0], c = edge[e][1];
    this.poly3([
      [a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], 64], [a[0], a[1], 64]
    ], 'rgba(96,60,200,0.28)', C.rgba(PAL.neonViolet, 0.85), 3, undefined, b);
  }
};

/* ------------------------- props ------------------------- */
Renderer.prototype.drawProp = function (p) {
  var b = this._basis();
  var base = [70, 62, 112];
  var hgt = 52;
  if (p.type === 'vault') { base = [80, 130, 170]; hgt = 30; }
  else if (p.type === 'pillar') { base = [86, 74, 130]; hgt = 110; }
  else if (p.type === 'lamp') { base = [60, 80, 120]; hgt = 92; }
  else if (p.type === 'console') { base = [50, 90, 110]; hgt = 46; }
  else if (p.type === 'crystal') { base = [110, 50, 140]; hgt = 76; }
  else if (p.type === 'car') { base = [80, 55, 90]; hgt = 40; }

  /* shadow */
  this.groundCircle(p.x + p.w / 2 + 10, p.y + p.h / 2 + 12, 1, Math.max(p.w, p.h) * 0.62, 'rgba(6,5,18,0.4)', null, 0, b);

  this.box(p.x + p.w / 2, p.y + p.h / 2, 0, hgt, p.w, p.h, 0, base, { lw: 2.6 });

  var top = this.project(p.x + p.w / 2, p.y + p.h / 2, hgt, b);
  if (p.type === 'lamp') {
    this.glow(p.x + p.w / 2, p.y + p.h / 2, hgt + 18, 130, PAL.neonGold, 0.34);
    this.glow(p.x + p.w / 2, p.y + p.h / 2, hgt + 18, 34, PAL.neonGold, 0.55);
  } else if (p.type === 'console' && top) {
    this.glow(p.x + p.w / 2, p.y + p.h / 2, hgt + 4, 46, PAL.neonCyan, 0.3);
  } else if (p.type === 'crystal') {
    this.glow(p.x + p.w / 2, p.y + p.h / 2, hgt * 0.7, 60, PAL.neonViolet, 0.32);
  }
};

Renderer.prototype.drawPallet = function (pl) {
  var ctx = this.ctx;
  var ang = pl.ang || 0;
  if (pl.palletState === 'up') {
    this.box(pl.x, pl.y, 0, 58, pl.w, pl.h, ang, [150, 118, 78], { lw: 2.4 });
    /* gold hazard stripes along the face */
    for (var i = -2; i <= 2; i++) {
      var dx = Math.cos(ang) * i * 14, dy = Math.sin(ang) * i * 14;
      var p0 = this.project(pl.x + dx - Math.sin(ang) * pl.h / 2, pl.y + dy + Math.cos(ang) * pl.h / 2, 8);
      var p1 = this.project(pl.x + dx - Math.sin(ang) * pl.h / 2, pl.y + dy + Math.cos(ang) * pl.h / 2, 50);
      if (p0 && p1) {
        ctx.strokeStyle = C.rgba(PAL.neonGold, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
    }
  } else if (pl.palletState === 'down') {
    this.box(pl.x, pl.y, 0, 12, pl.w, pl.h, ang, [130, 110, 80], { lw: 2.2 });
    this.groundCircle(pl.x, pl.y, 13, pl.w * 0.5, null, C.rgba(PAL.neonCyan, 0.75), 2, null);
  } else {
    this.box(pl.x - pl.w * 0.2, pl.y, 0, 8, pl.w * 0.24, pl.h * 0.4, ang, [110, 90, 70], { lw: 1.6 });
    this.box(pl.x + pl.w * 0.22, pl.y + 4, 0, 7, pl.w * 0.2, pl.h * 0.35, ang + 0.7, [110, 90, 70], { lw: 1.6 });
  }
};

Renderer.prototype.drawChest = function (ch) {
  var col = ch.searched ? [120, 130, 150] : [40, 60, 90];
  this.groundCircle(ch.x, ch.y + 6, 1, 26, 'rgba(6,5,18,0.42)', null, 0, null);
  this.box(ch.x, ch.y, 0, 22, 34, 26, 0, col, { lw: 2.2 });
  this.box(ch.x, ch.y - 2, 22, 30, 32, 10, 0, C.mixRGB(col, PAL.neonCyan, ch.searched ? 0.06 : 0.22), { lw: 1.8 });
  if (!ch.searched) {
    this.glow(ch.x, ch.y, 40 + Math.sin(this.time * 4) * 6, 42, PAL.neonCyan, 0.4);
  }
};

Renderer.prototype.drawLocker = function (lk) {
  var led = lk.occupant >= 0 ? PAL.neonGold : PAL.neonCyan;
  this.groundCircle(lk.x, lk.y + 6, 1, 24, 'rgba(6,5,18,0.42)', null, 0, null);
  this.box(lk.x, lk.y, 0, 74, 30, 24, 0, [26, 22, 48], { lw: 2.4 });
  /* LED strip */
  var a = this.project(lk.x, lk.y - 12.5, 46), b2 = this.project(lk.x, lk.y - 12.5, 62);
  if (a && b2) {
    this.ctx.strokeStyle = C.rgba(led, 0.95);
    this.ctx.lineWidth = 3.4;
    this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b2.x, b2.y); this.ctx.stroke();
  }
  this.glow(lk.x, lk.y - 14, 54, 26, led, 0.35);
};

Renderer.prototype.drawTrap = function (tr) {
  var armFrac = clamp(tr.arm || 0, 0, 1);
  var col = armFrac >= 1 ? PAL.neonViolet : PAL.neonGold;
  this.groundCircle(tr.x, tr.y, 3, 26 * armFrac + 4, C.rgba(col, 0.16 * armFrac), C.rgba(col, 0.7 * armFrac), 2.2, null);
  this.groundCircle(tr.x, tr.y, 3, 12 * armFrac + 2, null, C.rgba(col, 0.85 * armFrac), 1.8, null);
  if (armFrac >= 1) this.glow(tr.x, tr.y, 12, 34, PAL.neonViolet, 0.3);
};

Renderer.prototype.drawAnchor = function (a, idx) {
  var b = this._basis();
  var col = a.done ? PAL.anchorDone : (a.workers && a.workers.length ? PAL.anchorWork : PAL.anchorIdle);
  var pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + (idx || 0));

  /* ground glow + progress ring */
  this.glow(a.x, a.y, 6, a.r + 90, col, (a.done ? 0.22 : 0.12 + pulse * 0.1));
  this.groundCircle(a.x, a.y, 2, a.r + 20, C.rgba(col, 0.1), C.rgba(col, 0.5), 2, null);
  if (!a.done && a.progress > 0) {
    /* progress arc on the ground */
    var pts = [];
    var steps = 16;
    for (var s = 0; s <= steps; s++) {
      var ang = -Math.PI / 2 + (s / steps) * a.progress * TAU;
      pts.push([a.x + Math.cos(ang) * (a.r + 20), a.y + Math.sin(ang) * (a.r + 20), 3]);
    }
    if (pts.length >= 2) {
      this.ctx.beginPath();
      var first = true;
      for (var q = 0; q < pts.length; q++) {
        var sp = this.project(pts[q][0], pts[q][1], pts[q][2]);
        if (!sp) continue;
        if (first) { this.ctx.moveTo(sp.x, sp.y); first = false; } else this.ctx.lineTo(sp.x, sp.y);
      }
      this.ctx.strokeStyle = C.css(col);
      this.ctx.lineWidth = 5;
      this.ctx.stroke();
    }
  }

  /* floating crystal: hexagonal bipyramid */
  var bob = Math.sin(this.time * 1.6 + (idx || 0)) * 8;
  var cz = 56 + bob;
  var rot = this.time * (a.done ? 0.4 : 0.9);
  var R = 26, H2 = 34;
  var bright = C.mixRGB(col, [255, 255, 255], 0.18);
  for (var k = 0; k < 6; k++) {
    var a0 = rot + k / 6 * TAU, a1 = rot + (k + 1) / 6 * TAU;
    var p0 = [a.x + Math.cos(a0) * R, a.y + Math.sin(a0) * R, cz];
    var p1 = [a.x + Math.cos(a1) * R, a.y + Math.sin(a1) * R, cz];
    var band = bandOf(Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0.2);
    this.poly3([p0, p1, [a.x, a.y, cz + H2]], C.css(fogMix(band === 0 ? bright : C.mixRGB(col, PAL.shadowTint, band === 1 ? 0.3 : 0.55), this.view(a.x, a.y, cz, b).vf)), C.rgba(PAL.outline, 0.85), 2.2, undefined);
    this.poly3([p0, p1, [a.x, a.y, cz - H2]], C.css(fogMix(C.mixRGB(col, PAL.shadowTint, 0.6), this.view(a.x, a.y, cz, b).vf)), C.rgba(PAL.outline, 0.8), 2, undefined);
  }
  /* pillar of light */
  if (this.quality !== 'low') {
    var topP = this.project(a.x, a.y, 210), botP = this.project(a.x, a.y, 10);
    if (topP && botP) {
      var lg = this.ctx.createLinearGradient(topP.x, topP.y, botP.x, botP.y);
      lg.addColorStop(0, C.rgba(col, 0));
      lg.addColorStop(1, C.rgba(col, 0.42));
      this.ctx.fillStyle = lg;
      this.ctx.beginPath();
      this.ctx.moveTo(topP.x - 5, topP.y); this.ctx.lineTo(topP.x + 5, topP.y);
      this.ctx.lineTo(botP.x + 26, botP.y); this.ctx.lineTo(botP.x - 26, botP.y);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }
  this.glow(a.x, a.y, cz, 72, col, 0.4 + pulse * 0.15);
  this.glow(a.x, a.y, cz, 30, [255, 255, 255], 0.16 + pulse * 0.1);
};

Renderer.prototype.drawGate = function (g) {
  var col = g.open ? PAL.gateOpen : (g.powered ? PAL.gate : PAL.anchorIdle);
  var open = g.open;

  /* side pillars */
  this.box(g.x - 52, g.y, 0, 150, 26, 26, 0, [64, 48, 110], { lw: 2.4 });
  this.box(g.x + 52, g.y, 0, 150, 26, 26, 0, [64, 48, 110], { lw: 2.4 });

  /* portal field — a vertical billboard quad between the pillars */
  var zc = 74, w2 = 46;
  var q0 = this.project(g.x - w2, g.y, zc - 66), q1 = this.project(g.x + w2, g.y, zc - 66);
  var q2 = this.project(g.x + w2, g.y, zc + 66), q3 = this.project(g.x - w2, g.y, zc + 66);
  if (q0 && q1 && q2 && q3) {
    var ctx = this.ctx;
    var shimmer = 0.32 + 0.12 * Math.sin(this.time * 3);
    ctx.fillStyle = C.rgba(col, open ? shimmer + 0.25 : (g.powered ? shimmer : 0.1));
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.rgba(col, 0.95);
    ctx.lineWidth = 3.5;
    ctx.stroke();
    if (open || g.powered) {
      /* swirling rift lines */
      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 4; i++) {
        var yy = q0.y + (q3.y - q0.y) * ((i / 4 + this.time * 0.25) % 1);
        ctx.strokeStyle = C.rgba(col, 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(q0.x, yy);
        ctx.lineTo(q2.x, yy + 14);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    this.glow(g.x, g.y, zc, 150, col, open ? 0.4 : 0.18);
  }

  if (g.powered && !g.open && g.progress > 0) {
    this.groundCircle(g.x, g.y - 10, 4, 26, null, C.rgba(PAL.gate, 0.8), 4, null);
    this.groundCircle(g.x, g.y - 10, 4, 20, null, C.rgba(PAL.outline, 0.5), 3, null);
  }
};

Renderer.prototype.drawHook = function (h, idx, localId, world) {
  /* base + pole + curved arm */
  this.box(h.x, h.y, 0, 12, 26, 26, 0, [40, 28, 56], { lw: 2 });
  this.box(h.x, h.y, 0, 96, 12, 12, 0, [96, 42, 56], { lw: 2.2 });

  /* the hook arm — a few segments curving out */
  var pts = [];
  for (var s = 0; s <= 5; s++) {
    var t = s / 5;
    pts.push([h.x + Math.sin(t * Math.PI * 0.9) * 22, h.y - 2, 96 + 16 * Math.sin(t * Math.PI * 0.8) - t * 6]);
  }
  var ctx = this.ctx;
  ctx.beginPath();
  var first = true;
  for (var i = 0; i < pts.length; i++) {
    var sp = this.project(pts[i][0], pts[i][1], pts[i][2]);
    if (!sp) continue;
    if (first) { ctx.moveTo(sp.x, sp.y); first = false; } else ctx.lineTo(sp.x, sp.y);
  }
  ctx.strokeStyle = C.css(PAL.outline); ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = C.css(PAL.hook); ctx.lineWidth = 3.6; ctx.stroke();

  if (h.occupant >= 0) {
    var pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    this.glow(h.x, h.y, 70, 70 + pulse * 12, PAL.blood, 0.3 + pulse * 0.2);
    /* stage pips (billboarded above the hook) */
    var vict = world.byId ? world.byId.get(h.occupant) : null;
    if (!vict) {
      for (var vi = 0; vi < world.players.length; vi++) {
        if (world.players[vi].id === h.occupant) { vict = world.players[vi]; break; }
      }
    }
    var stages = vict ? Math.max(1, vict.hooks || 1) : 1;
    for (var sp2 = 0; sp2 < 3; sp2++) {
      var pp = this.project(h.x - 16 + sp2 * 16, h.y, 128);
      if (!pp) continue;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 4, 0, TAU);
      if (sp2 < stages) { ctx.fillStyle = C.css(PAL.blood); ctx.fill(); }
      else { ctx.strokeStyle = C.rgba(PAL.blood, 0.5); ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }
};

Renderer.prototype.drawEchoes = function (world, vb) {
  if (!this.showEchoes) return;
  var strong = this._lastRole === S.ROLES.SLAYER;
  for (var i = 0; i < world.echoes.length; i++) {
    var e = world.echoes[i];
    if (e.x < vb.x0 || e.x > vb.x1 || e.y < vb.y0 || e.y > vb.y1) continue;
    var a = clamp(e.t / S.K.ECHO_TIME, 0, 1);
    this.groundCircle(e.x, e.y, 2, 10 * a + 3, C.rgba(strong ? PAL.blood : PAL.neonCyan, (strong ? 0.5 : 0.18) * a), null, 0, null);
  }
};

/* ------------------------- characters ------------------------- */
Renderer.prototype.drawCharacter = function (p, idx, localId) {
  var slayer = p.role === S.ROLES.SLAYER;
  var skin = slayer ? SLAYER_SKIN : SURV_SKINS[(p.id - 1) % SURV_SKINS.length];
  var downed = p.state === S.STATE.DOWNED;
  var dead = p.state === S.STATE.DEAD || p.state === S.STATE.ESCAPED || (p.inLocker >= 0);
  if (dead) return;
  var isLocal = p.id === localId;

  if (p.dashT > 0 || (p.sprintingNow && Math.random() < 0.3) || (slayer && p.rageT > 0)) {
    this.addGhost(p.x, p.y, p.facing, skin, slayer);
  }

  var r = S.K.PLAYER_R * (slayer ? 1.32 : 1);
  var R = r * 2.45;                       /* visual scale: heroes read big & bold */
  var bob = downed ? 0 : Math.sin(this.time * 9 + p.id) * 2.2;
  var z = (p.z || 0) + bob;
  var facing = p.facing || 0;

  /* ground shadow + aura */
  this.groundCircle(p.x + 10, p.y + 12, 1, r * 2.3, 'rgba(4,3,14,0.5)', null, 0, null);
  if (slayer || p.ult >= S.K.ULT_CHARGE_MAX || p.rageT > 0) {
    var ac = (slayer || p.rageT > 0) ? PAL.blood : PAL.neonCyan;
    var pu = 0.5 + 0.5 * Math.sin(this.time * (p.rageT > 0 ? 12 : (slayer ? 4 : 8)));
    this.glow(p.x, p.y, 10, R * (p.rageT > 0 ? 2.6 : 1.9), ac, (p.rageT > 0 ? 0.3 : 0.13) + pu * 0.12);
  }
  if (p.riposteT > 0) this.glow(p.x, p.y, 10, R * 1.8, PAL.neonGold, 0.35 + 0.25 * Math.sin(this.time * 16));
  if (p.ultT > 0) this.glow(p.x, p.y, 10, R * 2.2, slayer ? PAL.blood : PAL.neonViolet, 0.3);

  if (downed) {
    /* lying down: a low tilted slab */
    this.box(p.x, p.y, z + 4, z + 26, R * 1.35, R * 1.55, facing + 0.5, skin.coat, { lw: 2.2 });
    this.box(p.x + Math.cos(facing) * R * 0.9, p.y + Math.sin(facing) * R * 0.9, z + 6, z + 30, R * 0.7, R * 0.7, facing, [248, 226, 208], { lw: 2 });
  } else {
    var bodyH = R * 1.95;
    /* legs */
    this.box(p.x, p.y, z, z + bodyH * 0.42, R * 0.82, R * 0.82, facing, C.mixRGB(skin.coat, [10, 8, 24], 0.45), { lw: 1.8 });
    /* torso */
    this.box(p.x, p.y, z + bodyH * 0.38, z + bodyH, R * 0.95, R * 0.76, facing, skin.coat, { lw: 2.8 });
    /* accent sash */
    this.box(p.x, p.y, z + bodyH * 0.52, z + bodyH * 0.64, R * 1.0, R * 0.81, facing, skin.accent, { lw: 1.4 });
    /* head */
    var hy = z + bodyH * 1.32;
    this.box(p.x, p.y, z + bodyH * 1.02, hy, R * 0.62, R * 0.62, facing, [248, 226, 208], { lw: 2.4 });
    /* hair cap + spikes */
    this.box(p.x, p.y, hy - 3, hy + R * 0.28, R * 0.68, R * 0.68, facing, skin.hair, { lw: 2.2 });
    this.box(p.x + Math.cos(facing) * R * 0.12, p.y + Math.sin(facing) * R * 0.12, hy + R * 0.22, hy + R * 0.58, R * 0.3, R * 0.3, facing, skin.hair, { lw: 1.8 });
    /* visor / eyes on the facing side */
    this.box(p.x + Math.cos(facing) * R * 0.34, p.y + Math.sin(facing) * R * 0.34,
      z + bodyH * 1.14, z + bodyH * 1.22, R * 0.34, R * 0.16, facing, [32, 26, 64], { lw: 1.2 });

    /* weapon */
    var wx = Math.cos(facing) * R * 0.62, wy = Math.sin(facing) * R * 0.62;
    if (slayer) {
      this.box(p.x + wx, p.y + wy, z + bodyH * 0.35, z + bodyH * 1.6, R * 0.2, R * 0.2, facing, [40, 16, 34], { lw: 1.6 });
      this.box(p.x + wx * 1.7, p.y + wy * 1.7, z + bodyH * 1.35, z + bodyH * 1.95, R * 1.05, R * 0.14, facing + 0.5, PAL.blood, { lw: 1.8 });
    } else {
      var wepCol = p.classId === 'medic' ? PAL.neonGreen : (p.classId === 'engineer' ? PAL.neonGold : PAL.neonCyan);
      this.box(p.x + wx * 1.35, p.y + wy * 1.35, z + bodyH * 0.75, z + bodyH * 1.35, R * 0.62, R * 0.2, facing, wepCol, { lw: 1.5 });
    }
  }

  /* overhead nametag */
  var head = this.project(p.x, p.y, z + (downed ? 48 : R * 3.3));
  if (head) {
    var ctx = this.ctx;
    ctx.font = '800 13px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    var tag = (p.bot ? '' : '★ ') + p.name + (p.classId ? ' [' + p.classId.toUpperCase() + ']' : '');
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(6,5,18,0.85)';
    ctx.strokeText(tag, head.x, head.y);
    ctx.fillStyle = isLocal ? C.css(PAL.neonGold) : (slayer ? C.css(PAL.blood) : '#fff');
    ctx.fillText(tag, head.x, head.y);
  }

  /* local-player aim blade glint */
  if (isLocal && !downed) {
    this.glow(p.x + Math.cos(p.aim || facing) * R * 1.35, p.y + Math.sin(p.aim || facing) * R * 1.35, 30, 18, PAL.neonGold, 0.5);
  }
};

Renderer.prototype.drawGhosts = function () {
  for (var i = 0; i < this.ghosts.length; i++) {
    var gh = this.ghosts[i];
    var a = (1 - gh.t / gh.life) * 0.35;
    this.glow(gh.x, gh.y, 60, 78, gh.slayer ? PAL.blood : PAL.neonCyan, a);
  }
};

/* ------------------------- fx layers ------------------------- */
Renderer.prototype.drawParticles = function () {
  var ctx = this.ctx;
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this.parts.length; i++) {
    var p = this.parts[i];
    var sp = this.project(p.x, p.y, p.z);
    if (!sp) continue;
    var a = 1 - p.t / p.life;
    var r = p.r * sp.s;
    if (p.spark) {
      ctx.fillStyle = C.rgba(p.col, a);
      ctx.fillRect(sp.x - r, sp.y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = C.rgba(p.col, a * 0.8);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r * (0.6 + a * 0.4), 0, TAU); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
};

Renderer.prototype.drawMotes = function () {
  if (this.quality === 'low') return;
  var ctx = this.ctx;
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this._motes.length; i++) {
    var m = this._motes[i];
    var sp = this.project(m.x + Math.sin(m.phase) * 14, m.y, m.z);
    if (!sp) continue;
    var a = 0.22 + 0.18 * Math.sin(m.phase * 2);
    ctx.fillStyle = C.rgba(m.col, a);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2.4 * sp.s, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
};

Renderer.prototype.drawTexts = function () {
  var ctx = this.ctx;
  ctx.textAlign = 'center';
  for (var i = 0; i < this.texts.length; i++) {
    var t = this.texts[i];
    var sp = this.project(t.x, t.y, t.z);
    if (!sp) continue;
    var a = 1 - t.t / t.life;
    var sc = 1 + (1 - a) * 0.35;
    ctx.font = '900 ' + Math.round(t.size * sc) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(6,5,18,' + (a * 0.9) + ')';
    ctx.strokeText(t.s, sp.x, sp.y);
    ctx.fillStyle = C.rgba(t.col, a);
    ctx.fillText(t.s, sp.x, sp.y);
  }
};

Renderer.prototype.drawSlashes = function () {
  var ctx = this.ctx;
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this.slashes.length; i++) {
    var s = this.slashes[i];
    var f = s.t / s.life;
    var a = (1 - f);
    var sp = this.project(s.x, s.y, s.z);
    if (!sp) continue;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    /* screen-space rotation: the slash arcs across the projected plane */
    var pe = this.project(s.x + Math.cos(s.ang) * 10, s.y + Math.sin(s.ang) * 10, s.z);
    var scrAng = pe ? Math.atan2(pe.y - sp.y, pe.x - sp.x) : -s.ang;
    ctx.rotate(scrAng);
    var spread = s.arc * (0.85 + f * 0.3);
    for (var k = 0; k < 3; k++) {
      var rr = s.range * sp.s * (0.55 + k * 0.22) * (0.8 + f * 0.4);
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

Renderer.prototype.drawRings = function () {
  for (var i = 0; i < this.rings.length; i++) {
    var r = this.rings[i];
    var f = r.t / r.life;
    var rad = lerp(r.r0, r.r1, f * f);
    this.groundCircle(r.x, r.y, r.z, rad, null, C.rgba(r.col, (1 - f) * 0.85), r.w * (1 - f), null);
  }
};

Renderer.prototype.drawBeams = function () {
  var ctx = this.ctx;
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < this.beams.length; i++) {
    var b = this.beams[i];
    var a = 1 - b.t / b.life;
    var p0 = this.project(b.x0, b.y0, 30), p1 = this.project(b.x1, b.y1, 30);
    if (!p0 || !p1) continue;
    ctx.strokeStyle = C.rgba(b.col, a);
    ctx.lineWidth = b.w * a;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

/* ------------------------- post / overlay ------------------------- */
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
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dark.width, dark.height);
  dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

  var me = null;
  for (var i = 0; i < world.players.length; i++) if (world.players[i].id === opts.localId) me = world.players[i];
  if (!me) return;
  var terror = opts.terror === undefined ? 0 : opts.terror;

  /* the wash is painted in SCREEN space; lights are punched at the
   * projected positions of the world lights. */
  dctx.globalCompositeOperation = 'source-over';
  dctx.fillStyle = 'rgba(4,3,14,' + (0.54 - terror * 0.08) + ')';
  dctx.fillRect(0, 0, this.w, this.h);
  dctx.globalCompositeOperation = 'destination-out';

  var lights = [{ x: me.x, y: me.y, r: 430 - terror * 70 }];
  for (var a = 0; a < world.anchors.length; a++) {
    if (world.anchors[a].done) lights.push({ x: world.anchors[a].x, y: world.anchors[a].y, r: 150 });
  }
  for (var g = 0; g < world.gates.length; g++) {
    if (world.gates[g].open) lights.push({ x: world.gates[g].x, y: world.gates[g].y, r: 240 });
  }
  for (var l = 0; l < lights.length; l++) {
    var li = lights[l];
    var sp = this.project(li.x, li.y, 24);
    if (!sp) continue;
    var rr = li.r * sp.s;
    if (rr < 4) continue;
    var grd = dctx.createRadialGradient(sp.x, sp.y, rr * 0.03, sp.x, sp.y, rr);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = grd;
    dctx.beginPath(); dctx.arc(sp.x, sp.y, rr, 0, TAU); dctx.fill();
  }

  /* composite in screen space (the scene transform is not active here) */
  this.ctx.save();
  this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.ctx.drawImage(dark, 0, 0, this.w, this.h);
  this.ctx.restore();
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
  var grd = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.38,
    this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.82);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(2,1,8,' + (0.42 + terror * 0.34) + ')');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, this.w, this.h);

  /* terror vignette */
  if (terror > 0.02) {
    var pulse = 0.5 + 0.5 * Math.sin(this.time * (2 + terror * 9));
    var g2 = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.2,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
    g2.addColorStop(0, 'rgba(255,0,40,0)');
    g2.addColorStop(1, 'rgba(255,20,50,' + (terror * 0.42 * (0.5 + pulse * 0.5)) + ')');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* chromatic split */
  if (this.chroma > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.chroma * 0.16;
    ctx.drawImage(this.cv, this.chroma * 6, 0, this.w, this.h);
    ctx.drawImage(this.cv, -this.chroma * 6, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* scanline texture */
  if (this.quality === 'high') {
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = '#000';
    for (var y = 0; y < this.h; y += 3) ctx.fillRect(0, y, this.w, 1);
    ctx.globalAlpha = 1;
  }
};

/* Top Tactical Radar Compass */
Renderer.prototype.drawRadarCompass = function (world, localId, localRole) {
  this._lastRole = localRole;
  var me = null;
  for (var i = 0; i < world.players.length; i++) if (world.players[i].id === localId) me = world.players[i];
  if (!me) return;

  var ctx = this.ctx;
  var cx = this.w / 2, cy = 24, w = Math.min(360, this.w - 40), h = 18;

  /* background bar */
  ctx.fillStyle = 'rgba(8, 5, 24, 0.78)';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = 'rgba(120, 90, 220, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

  /* center mark */
  ctx.strokeStyle = '#ffd254';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx, cy + h / 2); ctx.stroke();

  var fwd = me.aim || me.facing || 0;

  function renderBlip(x, y, col, size) {
    var ang = Math.atan2(y - me.y, x - me.x);
    var diff = C.angDiff(fwd, ang);
    if (Math.abs(diff) > Math.PI * 0.45) return;
    var bx = cx + (diff / (Math.PI * 0.45)) * (w / 2 - 10);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bx, cy, size || 3, 0, TAU); ctx.fill();
  }

  /* anchors */
  for (var a = 0; a < world.anchors.length; a++) {
    var an = world.anchors[a];
    var ac = an.done ? '#78ffb0' : (an.progress > 0 ? '#48e8ff' : '#6b7280');
    renderBlip(an.x, an.y, ac, 3.5);
  }

  /* gates */
  for (var g = 0; g < world.gates.length; g++) {
    var gt = world.gates[g];
    if (gt.powered) renderBlip(gt.x, gt.y, gt.open ? '#48e8ff' : '#ffd254', 4.5);
  }

  /* teammates */
  for (var p = 0; p < world.players.length; p++) {
    var q = world.players[p];
    if (q === me || !S.alive(q)) continue;
    if (q.role === S.ROLES.SLAYER) {
      if (localRole !== S.ROLES.SLAYER && S.distanceToSlayer(world, me) < S.K.TERROR_R) {
        renderBlip(q.x, q.y, '#ff2f6d', 4.5);
      }
    } else {
      var tc = q.state === S.STATE.DOWNED ? '#ff2f6d' : (q.hp < 100 ? '#ffd254' : '#78ffb0');
      renderBlip(q.x, q.y, tc, 3.5);
    }
  }
};

root.EOTRender = {
  Renderer: Renderer, PAL: PAL, SURV_SKINS: SURV_SKINS, SLAYER_SKIN: SLAYER_SKIN, cel: cel
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
