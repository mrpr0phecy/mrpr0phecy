/* Riley Engine — the game itself.
 *
 * Layers (built on riley-core/world/ai/net):
 *   1. renderer   — WebGL1, instanced props/characters, textured terrain
 *   2. camera     — pointer-lock mouse look + raycast terrain clamp
 *   3. player     — fixed-timestep physics on a heightfield
 *   4. enemies    — neural-net brains (RileyAI), evolved per run & persisted
 *   5. netcode    — RileyNet solo session drives every sim tick (determinism)
 *
 * Exposes window.RileyGame = { start, destroy, session, world } and test
 * hooks on ?selftest=1. Loaded after riley-core/world/ai/net.
 */
(function () {
'use strict';
var C = (typeof RileyCore !== 'undefined') ? RileyCore : require('./riley-core.js');
var W = (typeof RileyWorld !== 'undefined') ? RileyWorld : require('./riley-world.js');
var A = (typeof RileyAI !== 'undefined') ? RileyAI : require('./riley-ai.js');
var N = (typeof RileyNet !== 'undefined') ? RileyNet : require('./riley-net.js');

var TAU = C.TAU, clamp = C.clamp, lerp = C.lerp, angLerp = C.angLerp, smoothstep = C.smoothstep;

/* ================================================================
 * 0. constants & state
 * ================================================================ */
var canvas = document.getElementById('cv');
var SELFTEST = /[?&]selftest=1/.test(location.search);
var gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: SELFTEST, powerPreference: 'high-performance' });
if (!gl) gl = canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
var NOGL = !gl;

var ARENA_R = W.ARENA_R, WORLD = W.WORLD, WATER_Y = W.WATER_Y;
var RAY = 0.52, RHEIGHT = 1.7;

var state = 'title';          // title | play | pause | over
var time = 0, dt = 1 / 60, lastT = 0;
var frame = 0;                // physics tick counter (60Hz)
var hitStop = 0;
var best = 0;
try { best = +(localStorage.getItem('riley3d.best') || 0); } catch (e) {}

var game = { score: 0, wave: 1, lives: 5, maxLives: 5, kills: 0, combo: 0, combot: 0,
  comboBest: 0, boss: false, shake: 0, bannerT: 0, spawnQueue: [], spawnT: 0,
  waveState: 'idle', clearT: 0, accentT: 0 };
var shownScore = 0;

/* world */
var world = null;
var seedStr = '';
function seedFromURL() {
  var m = location.search.match(/[?&]seed=([A-Za-z0-9._-]+)/);
  return m ? m[1].toUpperCase() : '';
}
seedStr = seedFromURL();

/* bestiary — persisted champions (the goblins remember you) */
var bootRand = C.mulberry32(C.hashStr('RILEY-BOOT'));
var bestiary = A.newBestiary();
try {
  var bd = JSON.parse(localStorage.getItem('riley3d.bestiary') || 'null');
  if (bd && bd.species) bestiary = A.deserialize(bd, bootRand);
} catch (e) {}
function saveBestiary() {
  try { localStorage.setItem('riley3d.bestiary', JSON.stringify(A.serialize(bestiary))); } catch (e) {}
}
function purgeBestiary() {
  bestiary = A.newBestiary();
  try { localStorage.removeItem('riley3d.bestiary'); } catch (e) {}
  el('iqLine').textContent = '';
}

/* per-run sim rng streams (determinism contract: no Math.random in sim) */
var runSeedNum = 0;
var simRand = null;
function newRunRand() { simRand = C.mulberry32(runSeedNum ^ 0x51ED270B); }
/* per-tick random stream: identical on every host for the same tick */
var tickRand = null;

/* entities */
var R = null;
var enemies = [], eShots = [], shots = [], pickups = [];
var fx = [], shadowFx = [], glowStatics = [];

/* ================================================================
 * 1. shaders & programs
 * ================================================================ */
function makeShader(type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function makeProg(vs, fs, attrs) {
  var p = gl.createProgram();
  gl.attachShader(p, makeShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, makeShader(gl.FRAGMENT_SHADER, fs));
  for (var i = 0; i < attrs.length; i++) gl.bindAttribLocation(p, i, attrs[i]);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}
function uni(p, names) { var u = {}; names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); }); return u; }

/* --- P_STATIC: world-space verts with pos/norm/uv/col (terrain, water) --- */
var VS_STATIC =
  'attribute vec3 aP;attribute vec3 aN;attribute vec2 aUV;attribute vec3 aC;'+
  'uniform mat4 uV,uPV;varying vec3 vN;varying vec2 vUV;varying vec3 vC;varying float vD;'+
  'void main(){gl_Position=uPV*vec4(aP,1.0);vN=aN;vUV=aUV;vC=aC;vD=-(uV*vec4(aP,1.0)).z;}';
/* --- P_INST: per-instance matrix+colour (props, characters, shots) --- */
var VS_INST =
  'attribute vec3 aP;attribute vec3 aN;attribute vec2 aUV;'+
  'attribute vec4 aM0;attribute vec4 aM1;attribute vec4 aM2;attribute vec4 aM3;attribute vec3 aC;'+
  'uniform mat4 uV,uPV;varying vec3 vN;varying vec2 vUV;varying vec3 vC;varying float vD;'+
  'void main(){mat4 M=mat4(aM0,aM1,aM2,aM3);vec4 wp=M*vec4(aP,1.0);gl_Position=uPV*wp;'+
  'vN=mat3(M[0].xyz,M[1].xyz,M[2].xyz)*aN;vUV=aUV;vC=aC;vD=-(uV*wp).z;}';
var FS_MAIN =
  'precision mediump float;varying vec3 vN;varying vec2 vUV;varying vec3 vC;varying float vD;'+
  'uniform vec3 uL,uFogC,uGlow;uniform float uFN,uFF,uAlpha,uTexOn;uniform sampler2D uTex;'+
  'void main(){vec3 n=normalize(vN);'+
  'float b=max(dot(n,normalize(uL)),0.0)*0.85+0.33+max(n.y,0.0)*0.05;'+
  'vec3 tex=vec3(1.0);if(uTexOn>0.5)tex=texture2D(uTex,vUV).rgb;'+
  'vec3 c=vC*tex*b+uGlow;'+
  'c=mix(c,uFogC,clamp((vD-uFN)/(uFF-uFN),0.0,1.0));'+
  'gl_FragColor=vec4(c,uAlpha);}';
/* --- P_GLOW: camera-facing billboards (fx, shadows, stars, auras) --- */
var VS_GLOW =
  'attribute vec3 aP;attribute vec2 aU;attribute vec4 aC;'+
  'uniform mat4 uPV;uniform vec3 uR,uUp;varying vec2 vU;varying vec4 vC;'+
  'void main(){vec3 w=aP+uR*aU.x+uUp*aU.y;gl_Position=uPV*vec4(w,1.0);vU=aU;vC=aC;}';
var FS_GLOW =
  'precision mediump float;varying vec2 vU;varying vec4 vC;'+
  'uniform sampler2D uTex;uniform float uMode;'+
  'void main(){float d=length(vU);'+
  'float a=vC.a*pow(smoothstep(1.3,0.0,d),1.35);'+
  'a*=texture2D(uTex,vU+0.5).a;'+
  'if(uMode>0.5)gl_FragColor=vec4(vC.rgb,vC.a*pow(smoothstep(1.0,0.0,d),2.2));'+
  'else gl_FragColor=vec4(vC.rgb,a);}';

var pStat = makeProg(VS_STATIC, FS_MAIN, ['aP', 'aN', 'aUV', 'aC']);
var uStat = uni(pStat, ['uV', 'uPV', 'uL', 'uFogC', 'uGlow', 'uFN', 'uFF', 'uAlpha', 'uTexOn', 'uTex']);
var pInst = makeProg(VS_INST, FS_MAIN, ['aP', 'aN', 'aUV', 'aM0', 'aM1', 'aM2', 'aM3', 'aC']);
var uInst = uni(pInst, ['uV', 'uPV', 'uL', 'uFogC', 'uGlow', 'uFN', 'uFF', 'uAlpha', 'uTexOn', 'uTex']);
var pGlow = makeProg(VS_GLOW, FS_GLOW, ['aP', 'aU', 'aC']);
var uGlow = uni(pGlow, ['uPV', 'uR', 'uUp', 'uMode', 'uTex']);

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);

/* ================================================================
 * 2. geometry library (pos+norm+uv, 8 floats/vertex)
 * ================================================================ */
function geoVbo(arr) {
  var v = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, v);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  return { v: v, n: arr.length / 8 };
}
function boxGeo() {
  var a = [], h = 0.5;
  function q(p1, p2, p3, p4, n, u0, v0, u1, v1, u2, v2, u3, v3) {
    a.push(p1[0], p1[1], p1[2], n[0], n[1], n[2], u0, v0);
    a.push(p2[0], p2[1], p2[2], n[0], n[1], n[2], u1, v1);
    a.push(p3[0], p3[1], p3[2], n[0], n[1], n[2], u2, v2);
    a.push(p1[0], p1[1], p1[2], n[0], n[1], n[2], u0, v0);
    a.push(p3[0], p3[1], p3[2], n[0], n[1], n[2], u2, v2);
    a.push(p4[0], p4[1], p4[2], n[0], n[1], n[2], u3, v3);
  }
  q([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1], 0, 1, 1, 1, 1, 0, 0, 0);
  q([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1], 0, 1, 1, 1, 1, 0, 0, 0);
  q([h, -h, -h], [h, -h, h], [h, h, h], [h, h, -h], [1, 0, 0], 0, 1, 0, 0, 1, 0, 1, 1);
  q([-h, -h, h], [-h, -h, -h], [-h, h, -h], [-h, h, h], [-1, 0, 0], 0, 1, 0, 0, 1, 0, 1, 1);
  q([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0], 0, 0, 1, 0, 1, 1, 0, 1);
  q([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0], 0, 0, 1, 0, 1, 1, 0, 1);
  return geoVbo(new Float32Array(a));
}
function latGeo(sides, y0, y1, capBottom, capTop) {
  var a = [];
  for (var i = 0; i < sides; i++) {
    var t1 = i / sides * TAU, t2 = (i + 1) / sides * TAU;
    var x1 = Math.cos(t1), z1 = Math.sin(t1), x2 = Math.cos(t2), z2 = Math.sin(t2);
    var nx1 = x1, nz1 = z1, l = Math.hypot(x1, (y1 - y0) * 0.9, z1);
    var nx = x1 / l, ny = (y1 - y0) * 0.9 / l, nz = z1 / l;
    a.push(x1 * 0.5, y0, z1 * 0.5, nx, ny, nz, x1 * 0.5 + 0.5, 0);
    a.push(x2 * 0.5, y0, z2 * 0.5, nx, ny, nz, x2 * 0.5 + 0.5, 0);
    a.push(x2 * 0.5, y1, z2 * 0.5, nx, ny, nz, x2 * 0.5 + 0.5, 1);
    a.push(x1 * 0.5, y0, z1 * 0.5, nx, ny, nz, x1 * 0.5 + 0.5, 0);
    a.push(x2 * 0.5, y1, z2 * 0.5, nx, ny, nz, x2 * 0.5 + 0.5, 1);
    a.push(x1 * 0.5, y1, z1 * 0.5, nx, ny, nz, x1 * 0.5 + 0.5, 1);
    if (capBottom) {
      a.push(0, y0, 0, 0, -1, 0, 0.5, 0.5);
      a.push(x2 * 0.5, y0, z2 * 0.5, 0, -1, 0, x2 * 0.5 + 0.5, z2 * 0.5 + 0.5);
      a.push(x1 * 0.5, y0, z1 * 0.5, 0, -1, 0, x1 * 0.5 + 0.5, z1 * 0.5 + 0.5);
    }
    if (capTop) {
      a.push(0, y1, 0, 0, 1, 0, 0.5, 0.5);
      a.push(x1 * 0.5, y1, z1 * 0.5, 0, 1, 0, x1 * 0.5 + 0.5, z1 * 0.5 + 0.5);
      a.push(x2 * 0.5, y1, z2 * 0.5, 0, 1, 0, x2 * 0.5 + 0.5, z2 * 0.5 + 0.5);
    }
  }
  return geoVbo(new Float32Array(a));
}
function coneGeo(sides) {
  var a = [];
  for (var i = 0; i < sides; i++) {
    var t1 = i / sides * TAU, t2 = (i + 1) / sides * TAU;
    var x1 = Math.cos(t1), z1 = Math.sin(t1), x2 = Math.cos(t2), z2 = Math.sin(t2);
    var l = Math.hypot(0.5, 1, 0.5);
    a.push(x1 * 0.5, 0, z1 * 0.5, 0.5 / l, 1 / l, z1 * 0.5 / l, x1 * 0.5 + 0.5, 0);
    a.push(x2 * 0.5, 0, z2 * 0.5, 0.5 / l, 1 / l, z2 * 0.5 / l, x2 * 0.5 + 0.5, 0);
    a.push(0, 1, 0, 0, 1, 0, 0.5, 0.5);
    a.push(x1 * 0.5, 0, z1 * 0.5, 0.5 / l, 1 / l, z1 * 0.5 / l, x1 * 0.5 + 0.5, 0);
    a.push(0, 1, 0, 0, 1, 0, 0.5, 0.5);
    a.push(x2 * 0.5, 0, z2 * 0.5, 0.5 / l, 1 / l, z2 * 0.5 / l, x2 * 0.5 + 0.5, 0);
    a.push(0, 0, 0, 0, -1, 0, 0.5, 0.5);
    a.push(x2 * 0.5, 0, z2 * 0.5, 0, -1, 0, x2 * 0.5 + 0.5, z2 * 0.5 + 0.5);
    a.push(x1 * 0.5, 0, z1 * 0.5, 0, -1, 0, x1 * 0.5 + 0.5, z1 * 0.5 + 0.5);
  }
  return geoVbo(new Float32Array(a));
}
function sphereGeo(seg, rings) {
  var a = [];
  for (var iy = 0; iy < rings; iy++) {
    var t1 = iy / rings * Math.PI, t2 = (iy + 1) / rings * Math.PI;
    for (var ix = 0; ix < seg; ix++) {
      var u1 = ix / seg * TAU, u2 = (ix + 1) / seg * TAU;
      var p1 = [Math.sin(t1) * Math.cos(u1), Math.cos(t1), Math.sin(t1) * Math.sin(u1)];
      var p2 = [Math.sin(t1) * Math.cos(u2), Math.cos(t1), Math.sin(t1) * Math.sin(u2)];
      var p3 = [Math.sin(t2) * Math.cos(u2), Math.cos(t2), Math.sin(t2) * Math.sin(u2)];
      var p4 = [Math.sin(t2) * Math.cos(u1), Math.cos(t2), Math.sin(t2) * Math.sin(u1)];
      function push(p, u, v) { a.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, p[0], p[1], p[2], u, v); }
      push(p1, u1 / TAU, 1 - t1 / Math.PI); push(p2, u2 / TAU, 1 - t1 / Math.PI); push(p3, u2 / TAU, 1 - t2 / Math.PI);
      push(p1, u1 / TAU, 1 - t1 / Math.PI); push(p3, u2 / TAU, 1 - t2 / Math.PI); push(p4, u1 / TAU, 1 - t2 / Math.PI);
    }
  }
  return geoVbo(new Float32Array(a));
}
var GEO = {
  box: boxGeo(),
  cyl: latGeo(8, 0, 1, true, true),
  cyl6: latGeo(6, 0, 1, true, true),
  cone: coneGeo(8),
  cone6: coneGeo(6),
  sphere: sphereGeo(10, 7),
  sphereL: sphereGeo(7, 5)
};

/* ================================================================
 * 3. textures (async, graceful fallback to flat colour)
 * ================================================================ */
var TEXDIR = 'riley-assets/textures/';
var TEX = {};
var texReady = 0, texTotal = 12;
function loadTex(name, key) {
  var img = new Image();
  img.onload = function () {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    TEX[key] = t;
    texReady++;
  };
  img.onerror = function () { texReady++; };
  img.src = TEXDIR + name;
}
if (!NOGL) {
  ['grass', 'dirt', 'stone', 'rock', 'bark', 'leaves', 'wood', 'water', 'crystal', 'glow', 'cloth', 'rune']
    .forEach(function (n) { loadTex(n + '.png', n); });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

/* ================================================================
 * 4. static world upload
 * ================================================================ */
var worldVBOs = [];   // {vbo, n, tex, colMul}
var propDraws = [];   // {geo, vbo, n, tex}
function makeVBO(arr) {
  var v = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, v);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  return v;
}
function buildWorld(seed) {
  /* release old GPU resources */
  worldVBOs.forEach(function (w) { gl.deleteBuffer(w.vbo); });
  propDraws.forEach(function (w) { gl.deleteBuffer(w.vbo); });
  worldVBOs = []; propDraws = []; glowStatics = [];
  world = W.generate(seed);
  runSeedNum = C.hashStr(world.seed);
  newRunRand();
  /* terrain */
  world.terrainKeys = ['grass', 'dirt', 'rock'];
  ['grass', 'dirt', 'rock'].forEach(function (k) {
    if (world.terrain[k].length) worldVBOs.push({ vbo: makeVBO(world.terrain[k]), n: world.terrain[k].length / 11, tex: TEX[k] ? k : null, key: k });
  });
  /* water plane */
  (function () {
    var h = WORLD / 2, y = WATER_Y, c = world.realm.water;
    var a = [
      -h, y, -h, 0, 1, 0, -h * 0.12, -h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255,
      h, y, -h, 0, 1, 0, h * 0.12, -h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255,
      h, y, h, 0, 1, 0, h * 0.12, h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255,
      -h, y, -h, 0, 1, 0, -h * 0.12, -h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255,
      h, y, h, 0, 1, 0, h * 0.12, h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255,
      -h, y, h, 0, 1, 0, -h * 0.12, h * 0.12, c[0] / 255, c[1] / 255, c[2] / 255
    ];
    var wv = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wv);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
    worldVBOs.push({ vbo: wv, n: 6, tex: TEX.water ? 'water' : null, water: true, key: 'water' });
  })();
  /* props (instanced) */
  var propGeoMap = { bark: 'cyl', leaf: 'cone', rock: 'box', wood: 'cyl', bone: 'cyl', cap: 'cone', ember: 'cone6', stone: 'cyl', hill: 'cone', snow: 'cone6' };
  var propTexMap = { bark: 'bark', leaf: 'leaves', rock: 'rock', wood: 'wood', stone: 'stone', hill: 'rock', bone: null, cap: null, ember: 'crystal', snow: null };
  Object.keys(world.props).forEach(function (k) {
    var arr = world.props[k];
    if (!arr.length) return;
    propDraws.push({ geo: GEO[propGeoMap[k] || 'box'], vbo: makeVBO(arr), n: arr.length / 19, tex: propTexMap[k] || null, key: k });
  });
  /* static glow points: torch embers + arena runes */
  world.crystals.forEach(function (c) { c.respawn = 0; });
  buildStars();
}
var stars = [];
function buildStars() {
  stars = [];
  var r = C.mulberry32(runSeedNum ^ 0x5EED5);
  for (var i = 0; i < 110; i++) {
    var a = r() * TAU, y = 8 + r() * 85, rad = 170 + r() * 160;
    stars.push({ x: Math.cos(a) * rad, y: y, z: Math.sin(a) * rad, s: 1.2 + r() * 2.2, ph: r() * TAU, sp: 0.5 + r() * 1.6 });
  }
}

/* ================================================================
 * 5. instance renderer (one draw call per geometry)
 * ================================================================ */
var INST_CAP = 700;
var instBuckets = {};
function getBucket(key) {
  if (!instBuckets[key]) instBuckets[key] = { arr: new Float32Array(INST_CAP * 19), n: 0, vbo: gl.createBuffer() };
  return instBuckets[key];
}
var MM = new Float32Array(16);
function instBegin() {
  Object.keys(instBuckets).forEach(function (k) { instBuckets[k].n = 0; });
}
function instPart(geoKey, texKey, m, col) {
  var b = getBucket(geoKey + '|' + (texKey || ''));
  if (b.n >= INST_CAP) return;
  var o = b.n * 19;
  for (var i = 0; i < 16; i++) b.arr[o + i] = m[i];
  b.arr[o + 16] = col ? col[0] / 255 : 1;
  b.arr[o + 17] = col ? col[1] / 255 : 1;
  b.arr[o + 18] = col ? col[2] / 255 : 1;
  b.n++;
}
function drawInstanced(geoKey, texKey, glowCol, alpha) {
  var b = instBuckets[geoKey + '|' + (texKey || '')];
  if (!b || !b.n) return;
  var geo = GEO[geoKey];
  gl.useProgram(pInst);
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.v);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, b.arr.subarray(0, b.n * 19), gl.DYNAMIC_DRAW);
  for (var i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(3 + i);
    gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 76, i * 16);
    ext.vertexAttribDivisorANGLE(3 + i, 1);
  }
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 76, 64);
  ext.vertexAttribDivisorANGLE(7, 1);
  gl.uniformMatrix4fv(uInst.uPV, false, PVM);
  gl.uniformMatrix4fv(uInst.uV, false, VM);
  gl.uniform3f(uInst.uL, LIGHT[0], LIGHT[1], LIGHT[2]);
  gl.uniform3f(uInst.uFogC, fogCur[0] / 255, fogCur[1] / 255, fogCur[2] / 255);
  gl.uniform1f(uInst.uFN, 30);
  gl.uniform1f(uInst.uFF, 170);
  gl.uniform3f(uInst.uGlow, glowCol ? glowCol[0] / 255 : 0, glowCol ? glowCol[1] / 255 : 0, glowCol ? glowCol[2] / 255 : 0);
  gl.uniform1f(uInst.uAlpha, alpha === undefined ? 1 : alpha);
  var hasTex = texKey && TEX[texKey];
  gl.uniform1f(uInst.uTexOn, hasTex ? 1 : 0);
  if (hasTex) gl.bindTexture(gl.TEXTURE_2D, TEX[texKey]);
  if (alpha !== undefined && alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  gl.drawArraysInstancedANGLE(gl.TRIANGLES, 0, geo.n, b.n);
  if (alpha !== undefined && alpha < 1) gl.disable(gl.BLEND);
}
var ext = gl.getExtension('ANGLE_instanced_arrays');
if (!ext) {
  /* fallback: non-instanced draw (slower but works on very old GPUs) */
  ext = {
    vertexAttribDivisorANGLE: function () {},
    drawArraysInstancedANGLE: function (mode, first, count, prim) {
      for (var i = 0; i < prim; i++) gl.drawArrays(mode, first, count);
    }
  };
}

/* ================================================================
 * 6. billboards (fx + shadows)
 * ================================================================ */
var camR = [0, 0, 1], camUp = [0, 1, 0];
var fxBuf = gl.createBuffer();
var FX_CAP = 1400;
var fxData = new Float32Array(FX_CAP * 36);
function fillQuads(list, out) {
  var o = 0;
  for (var i = 0; i < list.length; i++) {
    var f = list[i], t = f.life / f.max, s = f.s * (0.5 + 0.5 * t);
    var a = f.pa * Math.min(1, t * 2.5);
    for (var k = 0; k < 6; k++) {
      var cx = (k === 0 || k === 3 || k === 5) ? -1 : 1;
      var cy = k < 3 ? 1 : -1;
      out[o++] = f.x + camR[0] * cx * s + camUp[0] * cy * s;
      out[o++] = f.y + camR[1] * cx * s + camUp[1] * cy * s;
      out[o++] = f.z + camR[2] * cx * s + camUp[2] * cy * s;
      out[o++] = cx; out[o++] = cy;
      out[o++] = f.pr; out[o++] = f.pg; out[o++] = f.pb; out[o++] = a;
    }
  }
  return o;
}
function drawGlowList(list, mode) {
  if (!list.length) return;
  var o = fillQuads(list, fxData);
  gl.useProgram(pGlow);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf);
  gl.bufferData(gl.ARRAY_BUFFER, fxData.subarray(0, o), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
  gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
  gl.uniformMatrix4fv(uGlow.uPV, false, PVM);
  gl.uniform3fv(uGlow.uR, camR);
  gl.uniform3fv(uGlow.uUp, camUp);
  gl.uniform1f(uGlow.uMode, mode || 0);
  if (TEX.glow) gl.bindTexture(gl.TEXTURE_2D, TEX.glow);
  if (mode) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES, 0, list.length * 6);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}
function fxPush(p) {
  if (fx.length > FX_CAP - 6) fx.shift();
  fx.push(p);
}
function burst(x, y, z, color, n, spd, grav, size, life) {
  for (var i = 0; i < n; i++) {
    var a = tickRand ? tickRand() * TAU : Math.random() * TAU;
    var e = (tickRand ? tickRand() : Math.random()) * 2 - 1;
    var r = tickRand ? tickRand() : Math.random();
    fxPush({
      x: x, y: y, z: z,
      vx: Math.cos(a) * Math.cos(e) * spd * (0.3 + 0.7 * r),
      vy: Math.sin(e) * spd * 0.6 + spd * 0.35 * r,
      vz: Math.sin(a) * Math.cos(e) * spd * (0.3 + 0.7 * r),
      life: (life || 0.5) * (0.7 + 0.6 * r), max: life || 0.5,
      s: (size || 0.2) * (0.7 + 0.6 * r),
      pr: color[0], pg: color[1], pb: color[2], pa: 0.9, grav: grav === undefined ? 3 : grav
    });
  }
}
function ringBurst(x, y, z, color, spd) {
  for (var i = 0; i < 10; i++) {
    var a = i / 10 * TAU, l = 0.45;
    fxPush({ x: x, y: y, z: z, vx: Math.cos(a) * spd, vy: 0, vz: Math.sin(a) * spd, life: l, max: l, s: 0.1, pr: color[0], pg: color[1], pb: color[2], pa: 0.95, grav: 0 });
  }
}
function shadowPush(x, y, z, r, alpha) {
  var gy = world ? world.heightAt(x, z) : 0;
  if (y - gy > 7) return;
  if (shadowFx.length > 160) shadowFx.shift();
  shadowFx.push({ x: x, y: gy + 0.04, z: z, s: r, pa: alpha * (1 - clamp((y - gy) / 6, 0, 0.8)), pr: 4, pg: 6, pb: 10, life: 1, max: 1 });
}
/* ================================================================
 * 7. camera — pointer-lock mouse look + terrain raycast clamp
 * ================================================================ */
var PM = new Float32Array(16), VM = new Float32Array(16), PVM = new Float32Array(16);
var LIGHT = [0.5, 0.85, 0.35];
var fogCur = [12, 17, 46], fogTarget = [12, 17, 46];

var camYaw = 0, camPitch = 0.42;
var camYawTarget = 0, camPitchTarget = 0.42;
var camDist = 11.5;
var camX = 0, camY = 8, camZ = 11;
var camFov = 1.06;
var eye = [0, 0, 0], ctr = [0, 0, 0];
var laX = 0, laZ = 0;
var mouseDX = 0, mouseDY = 0;       // raw deltas this frame (pointer lock)
var pointerLocked = false;
var dragLook = false, dragMoved = 0; // trackpad drag-orbit fallback

function camDir() { return [Math.sin(camYaw), 0, Math.cos(camYaw)]; }

/* Raycast eye->player against the terrain; return safe distance along it. */
function camGroundDist(px, py, pz, dx, dy, dz) {
  var maxD = camDist + 2;
  var steps = 16, safe = maxD;
  for (var i = 1; i <= steps; i++) {
    var t = i / steps * maxD;
    var y = py + dy * t;
    var x = px + dx * t, z = pz + dz * t;
    if (y - 0.34 < world.heightAt(x, z)) { safe = Math.max(0.9, t * maxD * 0.86); break; }
  }
  return safe;
}
function updateCamera(dtC, lookAt) {
  /* lookAt = {x,y,z, yawTarget override for touch auto-follow} */
  var lx = lookAt.x, ly = lookAt.y, lz = lookAt.z;
  if (state === 'title') {
    titleA += dtC * 0.12;
    camYawTarget = titleA;
    camPitchTarget = 0.30;
  } else if (state === 'play' || state === 'pause') {
    if (touchAutoCam) { camYawTarget = R.yaw + Math.PI; } /* camera behind on mobile */
  }
  camYaw = angLerp(camYaw, camYawTarget, clamp(dtC * 10, 0, 1));
  camPitch = lerp(camPitch, camPitchTarget, clamp(dtC * 10, 0, 1));

  var cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  var ddx = Math.sin(camYaw) * cp, ddy = sp, ddz = Math.cos(camYaw) * cp;
  var tx = lx + R.vx * 0.06, tz = lz + R.vz * 0.06;
  var headY = ly + 1.35;
  var safeD = camGroundDist(tx, headY, tz, -ddx, -ddy, -ddz);
  var ex = tx - ddx * safeD, ey = headY + ddy * safeD, ez = tz - ddz * safeD;
  /* hard floor: never under the terrain */
  var gh = world.heightAt(ex, ez) + 0.36;
  if (ey < gh) ey = gh;
  camX = lerp(camX, ex, clamp(dtC * 8, 0, 1));
  camY = lerp(camY, ey, clamp(dtC * 8, 0, 1));
  camZ = lerp(camZ, ez, clamp(dtC * 8, 0, 1));
  var gh2 = world.heightAt(camX, camZ) + 0.36;
  if (camY < gh2) camY = gh2;

  /* look-ahead nudge toward motion (keeps aiming readable, subtle) */
  laX = lerp(laX, clamp(R.vx * 0.05, -1.1, 1.1), clamp(dtC * 3, 0, 1));
  laZ = lerp(laZ, clamp(R.vz * 0.05, -1.1, 1.1), clamp(dtC * 3, 0, 1));
  ctr[0] = tx + laX; ctr[1] = ly + 1.3; ctr[2] = tz + laZ;

  var sh = game.shake;
  if (sh > 0) {
    var ss = sh * 0.4;
    eye[0] = camX + (Math.random() * 2 - 1) * ss;
    eye[1] = camY + (Math.random() * 2 - 1) * ss;
    eye[2] = camZ + (Math.random() * 2 - 1) * ss;
  } else { eye[0] = camX; eye[1] = camY; eye[2] = camZ; }

  C.m4Look(VM, eye[0], eye[1], eye[2], ctr[0], ctr[1], ctr[2]);
  var spdF = clamp(Math.hypot(R.vx, R.vz) / 9, 0, 1);
  var fovT = 1.05 + (R.dashing ? 0.07 : 0) + spdF * 0.012;
  camFov = lerp(camFov, fovT, clamp(dtC * 6, 0, 1));
  C.m4Persp(PM, camFov, Ww / Hh, 0.1, 480);
  C.m4mul(PVM, PM, VM);
  camR[0] = VM[0]; camR[1] = VM[4]; camR[2] = VM[8];
  camUp[0] = VM[1]; camUp[1] = VM[5]; camUp[2] = VM[9];
}
var titleA = 0;
var touchAutoCam = false;

/* ================================================================
 * 8. player
 * ================================================================ */
function newRiley() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: Math.PI, run: 0, air: 0, ground: true,
    dashT: 0, dashCd: 0, dashDX: 0, dashDZ: 0, dashing: false, jumpBuf: 0, coyote: 0,
    inv: 0, hitT: 0, shootCd: 0, shootAnim: 0, ph: 0,
    mana: 0, manaMax: 100, charge: 0, charging: false, fireHeldT: 0,
    novaFx: 0, sideFlip: 1
  };
}
function groundY(x, z) { return world.heightAt(x, z); }

function newWorldInput() { return N.makeInput(); }
/* Build this tick's input from raw controls (feeds the RileyNet session). */
function pollInput(mv) {
  var inp = N.makeInput();
  inp.x = Math.round(mv[0] * 8);
  inp.y = Math.round(mv[1] * 8);
  if (fireNow) inp.fire = true;
  if (jumpNow) inp.jump = true;
  if (dashNow) inp.dash = true;
  if (novaNow) inp.nova = true;
  return inp;
}
var fireNow = false, jumpNow = false, dashNow = false, novaNow = false;

function stepPlayer(inp) {
  /* inp comes through the netcode session — identical path in future MP */
  var mvx = inp.x / 8, mvz = inp.y / 8;
  var ml = Math.hypot(mvx, mvz);
  if (ml > 1) { mvx /= ml; mvz /= ml; }
  var walking = ml > 0.05;

  R.jumpBuf = Math.max(0, R.jumpBuf - dt);
  R.coyote = Math.max(0, R.coyote - dt);
  if (R.ground) R.coyote = 0.1;
  R.inv = Math.max(0, R.inv - dt);
  R.hitT = Math.max(0, R.hitT - dt);
  R.dashCd = Math.max(0, R.dashCd - dt);
  R.shootCd = Math.max(0, R.shootCd - dt);
  R.shootAnim = Math.max(0, R.shootAnim - dt);
  if (R.novaFx > 0) R.novaFx -= dt;

  /* face aim (camera) while firing, else face movement */
  var aimX = Math.sin(camYaw), aimZ = Math.cos(camYaw);
  if (inp.fire || R.charging || R.shootAnim > 0) {
    R.yaw = angLerp(R.yaw, Math.atan2(aimX, aimZ), clamp(dt * 16, 0, 1));
  } else if (walking) {
    R.yaw = angLerp(R.yaw, Math.atan2(mvx, mvz), clamp(dt * 12, 0, 1));
  }

  /* dash */
  if (inp.dash && R.dashCd <= 0 && !R.dashing) {
    sfx('dash');
    var dd0 = walking ? mvx : aimX, dd1 = walking ? mvz : aimZ;
    var dl = Math.hypot(dd0, dd1) || 1;
    R.dashDX = dd0 / dl; R.dashDZ = dd1 / dl;
    R.dashing = true; R.dashT = 0.19; R.dashCd = 0.72; R.inv = Math.max(R.inv, 0.22);
    burst(R.x, R.y + 0.7, R.z, [130, 210, 255], 12, 5, 1.5, 0.3, 0.4);
  }
  if (R.dashing) {
    R.dashT -= dt;
    R.vx = R.dashDX * 26; R.vz = R.dashDZ * 26;
    ringBurst(R.x, R.y + 0.3, R.z, [150, 220, 255], 2);
    if (R.dashT <= 0) { R.dashing = false; }
  } else {
    R.vx = mvx * 9; R.vz = mvz * 9;
  }

  /* jump / double jump */
  if (inp.jump) R.jumpBuf = 0.12;
  if (R.jumpBuf > 0 && (R.ground || R.coyote > 0)) {
    R.vy = 14.8; R.ground = false; R.coyote = 0; R.jumpBuf = 0; R.air = 1;
    ringBurst(R.x, R.y + 0.05, R.z, [220, 235, 255], 3);
    sfx('jump');
  } else if (R.jumpBuf > 0 && R.air === 1) {
    R.vy = 13.2; R.air = 2; R.jumpBuf = 0;
    ringBurst(R.x, R.y + 0.1, R.z, [120, 220, 255], 4);
    sfx('djump');
  }

  /* gravity */
  R.vy -= 39 * dt;
  if (R.vy < -40) R.vy = -40;
  var fallSpd = R.vy;
  var wasAir = !R.ground;

  /* integrate with sub-stepped ground collision (60Hz tick, 2 substeps) */
  var sub = 2;
  for (var s = 0; s < sub; s++) {
    R.x += R.vx * dt / sub;
    R.z += R.vz * dt / sub;
    R.y += R.vy * dt / sub;
    R.ground = false;
    var gy = groundY(R.x, R.z);
    if (R.vy <= 0 && R.y <= gy) { R.y = gy; R.vy = 0; R.ground = true; R.air = 0; }
  }
  /* world boundary: soft push-back (the bowl makes this cosmetic) */
  var d = Math.hypot(R.x, R.z);
  if (d > WORLD / 2 - 2.5) {
    R.x = R.x / d * (WORLD / 2 - 2.5);
    R.z = R.z / d * (WORLD / 2 - 2.5);
  }
  if (wasAir && R.ground && fallSpd < -13) {
    ringBurst(R.x, R.y + 0.06, R.z, [220, 235, 255], 3);
    burst(R.x, R.y + 0.05, R.z, [180, 200, 230], 8, 4, 0.8, 0.1, 0.3);
  }
  if (R.ground && walking && !R.dashing) {
    R.run += dt * 9;
    if (Math.floor(R.run / Math.PI) !== Math.floor((R.run - dt * 9) / Math.PI) && Math.random() < 0.6) {
      fxPush({ x: R.x + rnd2(-0.15, 0.15), y: R.y + 0.03, z: R.z + rnd2(-0.15, 0.15), vx: 0, vy: rnd2(0.6, 1.3), vz: 0, life: 0.5, max: 0.5, s: rnd2(0.05, 0.09), pr: 200, pg: 210, pb: 230, pa: 0.35, grav: 0.5 });
    }
  } else if (R.ground) {
    R.run *= Math.max(0, 1 - dt * 6);
  }

  /* fire: quick shots while held; charge after 0.24s of holding */
  if (inp.fire) {
    R.fireHeldT += dt;
    if (R.fireHeldT > 0.24) {
      R.charging = true;
      R.charge += dt;
      if (Math.random() < 0.5) {
        var cx = R.x + aimX * 0.7, cz = R.z + aimZ * 0.7;
        fxPush({ x: cx + rnd2(-0.3, 0.3), y: R.y + 1 + rnd2(-0.2, 0.3), z: cz + rnd2(-0.3, 0.3), vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, s: rnd2(0.06, 0.14), pr: 255, pg: 210, pb: 110, pa: 0.8, grav: 0 });
      }
    } else if (R.shootCd <= 0 && R.fireHeldT > 0.04) {
      fireShot();
    }
  } else {
    if (R.charging) releaseCharge();
    R.charge = 0; R.charging = false; R.fireHeldT = 0;
  }
  R.mana = Math.min(R.manaMax, R.mana + dt * 3.2);

  /* nova */
  if (inp.nova && R.mana >= R.manaMax) castNova();
}
function rnd2(a, b) { return a + (tickRand ? tickRand() : Math.random()) * (b - a); }

/* ================================================================
 * 9. combat
 * ================================================================ */
function fireShot() {
  R.shootCd = 0.22; R.shootAnim = 0.16;
  var ax = Math.sin(R.yaw), az = Math.cos(R.yaw);
  var sx = R.x + ax * 0.7, sy = R.y + 1.05, sz = R.z + az * 0.7;
  shots.push({ x: sx, y: sy, z: sz, vx: ax * 24, vy: 1.6, vz: az * 24, life: 1.5, r: 0.14, big: false, dmg: 1, pierce: 1, col: [255, 190, 90], hitSet: null });
  burst(sx, sy, sz, [255, 200, 80], 5, 3, 0, 0.14, 0.25);
  sfx('shoot');
}
function releaseCharge() {
  var pw = clamp((R.charge - 0.28) / 0.72, 0, 1);
  if (pw < 0.12) { fireShot(); return; }
  R.shootCd = 0.3; R.shootAnim = 0.28;
  var tier = pw >= 0.85 ? 2 : 1;
  var ax = Math.sin(R.yaw), az = Math.cos(R.yaw);
  var sx = R.x + ax * 0.8, sy = R.y + 1.05, sz = R.z + az * 0.8;
  shots.push({
    x: sx, y: sy, z: sz, vx: ax * 27, vy: 1.2, vz: az * 27, life: 1.8,
    r: tier === 2 ? 0.42 : 0.3, big: true, dmg: tier === 2 ? 6 : 3,
    pierce: tier === 2 ? 3 : 1, col: tier === 2 ? [180, 120, 255] : [255, 140, 60], hitSet: null
  });
  burst(sx, sy, sz, tier === 2 ? [190, 130, 255] : [255, 170, 70], tier === 2 ? 22 : 14, 7, 0, 0.28, 0.5);
  ringBurst(sx, sy, sz, tier === 2 ? [200, 150, 255] : [255, 180, 90], 4);
  game.shake = Math.max(game.shake, tier === 2 ? 0.35 : 0.18);
  if (tier === 2) doHitStop(0.04);
  sfx(tier === 2 ? 'boss' : 'smash');
}
function castNova() {
  R.mana = 0; R.novaFx = 0.6;
  game.shake = 0.6; doHitStop(0.06);
  for (var ri = 0; ri < 3; ri++) ringBurst(R.x, R.y + 0.4, R.z, [150, 210, 255], 6 + ri * 3);
  burst(R.x, R.y + 0.8, R.z, [170, 140, 255], 40, 12, 1.5, 0.4, 0.9);
  burst(R.x, R.y + 0.8, R.z, [120, 220, 255], 26, 9, 1.2, 0.3, 0.8);
  sfx('nova');
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var d = Math.hypot(e.x - R.x, e.z - R.z);
    if (d < 13) {
      var dmg = e.k === 'boss' ? 5 : 8;
      var dx = (e.x - R.x) / (d || 1), dz = (e.z - R.z) / (d || 1);
      e.vx += dx * 15; e.vz += dz * 15; e.vy = Math.max(e.vy, 5);
      damageGob(e, dmg, dx, dz);
    }
  }
  /* nova shatters nearby crystals too */
  world.crystals.forEach(function (c) {
    if (c.alive && Math.hypot(c.x - R.x, c.z - R.z) < 13) shatterCrystal(c, true);
  });
}
function doHitStop(s) { if (s > hitStop) hitStop = s; }

function updateShots(dtF) {
  for (var j = shots.length - 1; j >= 0; j--) {
    var s = shots[j];
    s.life -= dtF;
    if (s.life <= 0) { shots.splice(j, 1); continue; }
    s.x += s.vx * dtF; s.y += s.vy * dtF; s.z += s.vz * dtF;
    var tcol = s.col;
    if (tickRand) fxPush({ x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, life: 0.12, max: 0.12, s: s.r * 4, pr: tcol[0], pg: tcol[1], pb: tcol[2], pa: 0.55, grav: 0 });
    var consumed = false;
    if (s.y < world.heightAt(s.x, s.z)) {
      burst(s.x, s.y, s.z, tcol, 8, 3, 1, 0.16, 0.3);
      consumed = true;
    }
    if (!consumed) {
      /* crystals */
      for (var ci = 0; ci < world.crystals.length; ci++) {
        var c = world.crystals[ci];
        if (!c.alive) continue;
        if (Math.hypot(s.x - c.x, s.z - c.z) < c.r + 0.4 && s.y > c.y - 0.3 && s.y < c.y + 2.4 * c.s) {
          shatterCrystal(c, false);
          consumed = true; break;
        }
      }
    }
    if (!consumed) {
      if (!s.hitSet) s.hitSet = [];
      for (var m = 0; m < enemies.length; m++) {
        var en = enemies[m];
        if (en.dead || s.hitSet.indexOf(en) >= 0) continue;
        var hr = en.r + 0.34 + (s.big ? 0.2 : 0);
        if (s.x > en.x - hr && s.x < en.x + hr && s.z > en.z - hr && s.z < en.z + hr && s.y > en.y && s.y < en.y + en.h + 0.2) {
          damageGob(en, s.dmg, s.vx, s.vz);
          R.mana = Math.min(R.manaMax, R.mana + (s.big ? 7 : 4));
          if (s.pierce > 1) { s.hitSet.push(en); s.pierce--; }
          else { consumed = true; break; }
        }
      }
    }
    if (consumed) shots.splice(j, 1);
  }
  /* enemy shots */
  for (var j2 = eShots.length - 1; j2 >= 0; j2--) {
    var s2 = eShots[j2];
    s2.life -= dtF;
    if (s2.life <= 0) { eShots.splice(j2, 1); continue; }
    s2.vy -= 4 * dtF;
    s2.x += s2.vx * dtF; s2.y += s2.vy * dtF; s2.z += s2.vz * dtF;
    if (tickRand) fxPush({ x: s2.x, y: s2.y, z: s2.z, vx: 0, vy: 0, vz: 0, life: 0.14, max: 0.14, s: s2.r * 3.4, pr: s2.col[0], pg: s2.col[1], pb: s2.col[2], pa: 0.6, grav: 0 });
    var gone = false;
    if (s2.y < world.heightAt(s2.x, s2.z)) {
      burst(s2.x, s2.y, s2.z, s2.col, 8, 3, 1, 0.14, 0.3);
      gone = true;
      if (s2.from && !s2.from.dead) s2.from.brain.reward('shotMiss');
      eShots.splice(j2, 1); continue;
    }
    if (gone) continue;
    if (Math.abs(s2.x - R.x) < 0.75 && Math.abs(s2.z - R.z) < 0.75 && Math.abs(s2.y - (R.y + 0.8)) < 1.35 && R.inv <= 0 && state === 'play') {
      eShots.splice(j2, 1);
      burst(s2.x, s2.y, s2.z, [170, 90, 255], 12, 5, 1, 0.2, 0.4);
      hitRiley({ x: s2.x - s2.vx * 0.08, y: s2.y, z: s2.z - s2.vz * 0.08, k: 'spitter', dead: false });
    }
  }
}

/* ================================================================
 * 10. crystals (shatterable world objects)
 * ================================================================ */
function shatterCrystal(c, free) {
  if (!c.alive) return;
  c.alive = false;
  c.respawn = 22 + (tickRand ? tickRand() * 8 : 4);
  R.mana = Math.min(R.manaMax, R.mana + 30);
  game.score += 40;
  sfx('crystal');
  burst(c.x, c.y + 1.2 * c.s, c.z, accentRGB(), 26, 8, 1.6, 0.3, 0.7);
  burst(c.x, c.y + 0.8 * c.s, c.z, [255, 255, 255], 12, 5, 1, 0.16, 0.5);
  ringBurst(c.x, c.y + 0.2, c.z, accentRGB(), 5);
  popText(c.x, c.y + 2.4, c.z, '+40 ✦', false, '#bfffe8');
  game.shake = Math.max(game.shake, 0.2);
  if (!free) spawnPickup('gem', c.x, c.y + 1, c.z);
}
/* ================================================================
 * 11. enemies — neural-net brains, evolved per run
 * ================================================================ */
var EN_K = A.SPECIES;
var enemyGrid = new C.HashGrid(3);
var _q = [];
function gobCol(k) {
  if (k === 'grunt') return { skin: [96, 180, 72], skinD: [70, 140, 54], belly: [150, 216, 118], eye: [255, 235, 110], ear: [114, 202, 88], cloth: [78, 64, 46], accent: [255, 255, 255] };
  if (k === 'runner') return { skin: [70, 190, 170], skinD: [50, 150, 132], belly: [140, 226, 206], eye: [255, 240, 130], ear: [84, 206, 184], cloth: [46, 88, 80], accent: [160, 255, 230] };
  if (k === 'spitter') return { skin: [124, 92, 200], skinD: [90, 66, 156], belly: [176, 146, 230], eye: [140, 255, 120], ear: [132, 100, 210], cloth: [56, 40, 92], accent: [150, 255, 190] };
  if (k === 'brute') return { skin: [196, 110, 58], skinD: [150, 82, 44], belly: [236, 172, 110], eye: [255, 232, 70], ear: [208, 122, 64], cloth: [72, 46, 32], accent: [255, 120, 60] };
  return { skin: [128, 178, 68], skinD: [92, 136, 54], belly: [176, 220, 116], eye: [255, 74, 58], ear: [142, 192, 80], cloth: [52, 70, 110], accent: [255, 214, 94] };
}
function newGob(k, x, y, z, idx) {
  var t = EN_K[k];
  var g = A.spawnGenome(bestiary, k, tickRand, game.wave);
  gobId++;
  var e = {
    id: gobId,
    x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, k: k,
    hp: t.hp, hpMax: t.hp, r: t.r, h: t.h, s: t.s * (k === 'boss' ? 1 : rnd2(0.88, 1.14)),
    sc: t.sc, shade: k === 'boss' ? 1 : rnd2(0.88, 1.16),
    yaw: Math.atan2(R.x - x, R.z - z), run: 0, ph: rnd2(0, 9),
    hitT: 0, dead: false, tele: 0, actT: 0, actCd: rnd2(0.6, 2.2), actKind: 'none',
    spitCd: rnd2(0.8, 2.2), roarT: 5, enrage: false,
    spd: t.spd * rnd2(0.88, 1.12),
    dmgTaken: 0, dmgDealt: 0, kills: 0, lifeSec: 0, hitsTaken: 0, gemsStolen: 0,
    aiPhase: (idx || 0) % 8, sideT: rnd2(2, 5), side: 1,
    mvx: 0, mvz: 0, mAct: 'idle'
  };
  e.brain = A.makeBrain(k, g);
  e.genome = g;
  return e;
}
function enemySensor(e) {
  var dx = R.x - e.x, dz = R.z - e.z;
  var d = Math.hypot(dx, dz) || 0.001;
  var wantY = Math.atan2(dx, dz);
  var rel = wantY - e.yaw;
  var spec = EN_K[e.k];
  var atkRange = spec.melee !== undefined ? spec.melee : (spec.range ? 99 : 2);
  var threat = 0;
  if (R.charging) threat += 0.6;
  if (R.mana >= R.manaMax) threat += 0.4;
  if (e.k === 'boss') threat = e.enrage ? 1 : threat;
  return {
    dist: d,
    sinA: Math.sin(rel), cosA: Math.cos(rel),
    pSpeed: Math.hypot(R.vx, R.vz),
    dy: R.y - e.y,
    hpFrac: e.hp / e.hpMax,
    dmgTaken: e.dmgTaken,
    threat: threat,
    time: e.lifeSec,
    atkRange: atkRange,
    rangeNear: spec.range ? spec.range[0] : 0,
    rangeFar: spec.range ? spec.range[1] : 20
  };
}
function updateEnemyBrain(e) {
  /* brains tick at 8 Hz, staggered — plenty smart, very cheap */
  if (frame % 8 !== e.aiPhase) return;
  var sen = enemySensor(e);
  var act = e.brain.tick(sen);
  e.mvx = act.mvx; e.mvz = act.mvz * e.side; e.mAct = act.act; e.atkOut = act.atk;
  e.dmgTaken = Math.max(0, e.dmgTaken - 0.12);
  var spec = EN_K[e.k];
  var d = sen.dist;
  /* attack execution */
  e.actCd -= dt;
  if (act.act === 'attack' && e.actCd <= 0) {
    if (e.k === 'spitter') {
      if (d > spec.range[0] && d < spec.range[1]) {
        e.yaw = Math.atan2(R.x - e.x, R.z - e.z);
        var ld = Math.max(d, 2);
        eShots.push({ x: e.x + (R.x - e.x) / d * 0.5, y: e.y + e.h * 0.85, z: e.z + (R.z - e.z) / d * 0.5,
          vx: (R.x - e.x) / d * 8.5, vy: (R.y + 0.8 - e.y - e.h * 0.85) / ld * 8.5 + 0.9, vz: (R.z - e.z) / d * 8.5,
          life: 2.6, r: 0.2, col: [170, 90, 255], from: e });
        sfx('spit');
        e.actCd = spec.spitCd;
      } else e.actCd = 0.3;
    } else if (e.k === 'brute') {
      if (d < spec.melee + 1.6) {
        e.actKind = 'smash'; e.actT = 0.38; e.actCd = spec.smashCd;
        e.yaw = Math.atan2(R.x - e.x, R.z - e.z);
        sfx('low');
      } else e.actCd = 0.25;
    } else {
      /* lunge (grunt / runner / boss) */
      if (d < spec.melee + 2.6) {
        e.actKind = 'lunge'; e.actT = 0.34;
        e.tele = 0.3;
        e.yaw = Math.atan2(R.x - e.x, R.z - e.z);
        var boost = e.k === 'boss' ? (e.enrage ? 26 : 21) : spec.lunge * (e.enrage ? 1.4 : 1);
        e.vx = (R.x - e.x) / d * boost; e.vz = (R.z - e.z) / d * boost;
        e.actCd = spec.lungeCd * (e.k === 'boss' ? (e.enrage ? 0.55 : 0.8) : 1);
        sfx(e.k === 'boss' ? 'roar' : 'pop');
        if (e.k === 'boss' && game.shake < 0.5) game.shake = 0.3;
      } else e.actCd = 0.2;
    }
  }
  /* boss specials */
  if (e.k === 'boss') {
    if (!e.enrage && e.hp <= e.hpMax * 0.5) {
      e.enrage = true;
      sfx('boss');
      popText(e.x, e.y + e.h + 1.2, e.z, 'ENRAGED!', true, '#ff5e5e');
      e.brain.reward('panic');
    }
    e.roarT -= dt;
    if (e.roarT <= 0 && e.hp < e.hpMax * 0.8) {
      e.roarT = 8;
      var nm = Math.min(2 + Math.floor(game.wave / 5), 4);
      for (var m = 0; m < nm; m++) {
        var a = tickRand() * TAU, rr = rnd2(2.5, 4.5);
        var g = newGob(tickRand() < 0.5 ? 'grunt' : 'runner', e.x + Math.cos(a) * rr, 0, e.z + Math.sin(a) * rr, enemies.length + m);
        g.y = world.heightAt(g.x, g.z);
        enemies.push(g);
        ringBurst(g.x, g.y + 0.1, g.z, [180, 240, 255], 2);
      }
      popText(e.x, e.y + e.h + 1.4, e.z, 'COME, MINIONS!', true, '#9fe8ff');
      sfx('roar');
    }
  }
}
function updateEnemies(dtU) {
  /* spawn queue */
  if (game.waveState === 'combat') {
    if (game.spawnQueue.length) {
      game.spawnT -= dtU;
      if (game.spawnT <= 0) {
        game.spawnT = 0.75;
        placeGoblin(game.spawnQueue.shift());
      }
    } else if (!enemies.length) {
      waveClear();
    }
  } else if (game.waveState === 'clear') {
    game.clearT -= dtU;
    if (game.clearT <= 0) nextWave();
  }
  /* brains */
  for (var i = 0; i < enemies.length; i++) updateEnemyBrain(enemies[i]);

  enemyGrid.clear();
  for (var i2 = 0; i2 < enemies.length; i2++) {
    var e = enemies[i2];
    if (!e.dead) enemyGrid.insert(e.x, e.z, e);
  }
  for (var i3 = 0; i3 < enemies.length; i3++) {
    var e3 = enemies[i3];
    if (e3.dead) continue;
    e3.hitT = Math.max(0, e3.hitT - dtU);
    e3.lifeSec += dtU;
    /* deterministic strafe side-flip (kept out of the net for lockstep) */
    e3.sideT -= dtU;
    if (e3.sideT <= 0) { e3.side = -e3.side; e3.sideT = 1.5 + tickRand() * 2.5; }
    var spec = EN_K[e3.k];
    var dxp = R.x - e3.x, dzp = R.z - e3.z;
    var dp = Math.hypot(dxp, dzp) || 0.001;
    if (dp > 0.5) e3.yaw = angLerp(e3.yaw, Math.atan2(dxp, dzp), clamp(dtU * (e3.mAct === 'attack' ? 10 : 6), 0, 1));

    /* steering from the net output */
    var mvx = 0, mvz = 0;
    if (e3.tele > 0) {
      e3.tele -= dtU;
      e3.actT -= dtU;
      e3.vx *= Math.max(0, 1 - dtU * 2.5);
      e3.vz *= Math.max(0, 1 - dtU * 2.5);
    } else if (e3.actKind === 'smash' && e3.actT > 0) {
      e3.actT -= dtU;
      e3.vx *= Math.max(0, 1 - dtU * 6);
      e3.vz *= Math.max(0, 1 - dtU * 6);
      if (e3.actT <= 0) {
        /* the shockwave lands */
        sfx('smash');
        ringBurst(e3.x, e3.y + 0.2, e3.z, [255, 140, 60], 7);
        game.shake = Math.max(game.shake, 0.3);
        var fx2 = Math.sin(e3.yaw), fz2 = Math.cos(e3.yaw);
        var rdx = R.x - e3.x, rdz = R.z - e3.z;
        var rd = Math.hypot(rdx, rdz) || 1;
        var face = (rdx / rd) * fx2 + (rdz / rd) * fz2;
        if (rd < spec.melee + 1.4 && face > -0.3) hitRiley(e3);
        /* hits other goblins? no — friendly. hits player handled above */
      }
    } else if (e3.actKind === 'lunge' && e3.actT > 0) {
      e3.actT -= dtU;
    } else {
      /* net movement: mvx toward player, mvz strafe (side-flipped) */
      var fx3 = Math.sin(e3.yaw), fz3 = Math.cos(e3.yaw);
      var sx3 = Math.cos(e3.yaw), sz3 = -Math.sin(e3.yaw);
      var speed = e3.spd * (e3.k === 'boss' && e3.enrage ? 1.45 : 1);
      if (e3.mAct === 'flee') { mvx = -fx3 * speed; mvz = -fz3 * speed; }
      else {
        mvx = (e3.mvx * fx3 + e3.mvz * sx3) * speed;
        mvz = (e3.mvx * fz3 + e3.mvz * sz3) * speed;
      }
      /* keep off very steep slopes */
      if (e3.mAct === 'move' || e3.mAct === 'idle') {
        var aheadX = e3.x + fx3, aheadZ = e3.z + fz3;
        if (world.slopeAt(aheadX, aheadZ) > 0.95) { mvx *= 0.3; mvz *= 0.3; }
      }
      e3.vx += (mvx - e3.vx) * Math.min(1, dtU * 7);
      e3.vz += (mvz - e3.vz) * Math.min(1, dtU * 7);
    }
    /* social learning: grunts/runners nudge toward an ally's temperament */
    if ((e3.k === 'grunt' || e3.k === 'runner') && (frame % 30 === e3.aiPhase)) {
      enemyGrid.query(e3.x, e3.z, _q);
      for (var q2 = 0; q2 < _q.length; q2++) {
        var o = _q[q2];
        if (o === e3 || o.dead) continue;
        if (o.k === e3.k && Math.hypot(o.x - e3.x, o.z - e3.z) < 4.5) {
          e3.brain.learnFrom(o.brain, 0.08);
          break;
        }
      }
    }
    /* gravity + ground (heightfield) */
    e3.vy -= 26 * dtU;
    if (e3.vy < -32) e3.vy = -32;
    e3.x += e3.vx * dtU;
    e3.z += e3.vz * dtU;
    e3.y += e3.vy * dtU;
    var gy = world.heightAt(e3.x, e3.z);
    if (e3.y <= gy) { e3.y = gy; e3.vy = 0; }
    e3.run += Math.hypot(e3.vx, e3.vz) * dtU * 2.8;
    /* world boundary */
    var ed = Math.hypot(e3.x, e3.z);
    if (ed > WORLD / 2 - 2) { e3.x = e3.x / ed * (WORLD / 2 - 2); e3.z = e3.z / ed * (WORLD / 2 - 2); }

    /* contact with Riley */
    var rr2 = e3.r + 0.55;
    if (Math.abs(e3.x - R.x) < rr2 && Math.abs(e3.z - R.z) < rr2 && R.y + RHEIGHT > e3.y + 0.1 && R.y < e3.y + e3.h - 0.1) {
      hitRiley(e3);
    }
    /* fell somewhere weird (shouldn't happen on heightfield) */
    if (e3.y < -20) e3.dead = true;
  }
  /* separation */
  for (var a = 0; a < enemies.length; a++) {
    var e1 = enemies[a];
    if (e1.dead) continue;
    enemyGrid.query(e1.x, e1.z, _q);
    for (var b2 = 0; b2 < _q.length; b2++) {
      var e2 = _q[b2];
      if (e2.dead || e2.id < e1.id) continue;
      var ddx2 = e2.x - e1.x, ddz2 = e2.z - e1.z, dd2 = Math.hypot(ddx2, ddz2), minD = e1.r + e2.r;
      if (dd2 < minD && dd2 > 0.0001) {
        var push = (minD - dd2) / 2;
        e1.x -= ddx2 / dd2 * push * 0.55; e1.z -= ddz2 / dd2 * push * 0.55;
        e2.x += ddx2 / dd2 * push * 0.55; e2.z += ddz2 / dd2 * push * 0.55;
      }
    }
  }
  /* dash smash */
  if (R.dashing && enemies.length) {
    for (var q3 = 0; q3 < enemies.length; q3++) {
      var en = enemies[q3];
      if (en.dead) continue;
      var qr = en.r + 0.7;
      if (Math.abs(en.x - R.x) < qr && Math.abs(en.z - R.z) < qr && R.y + RHEIGHT > en.y && R.y < en.y + en.h) {
        if (en.k === 'grunt' || en.k === 'runner') killGob(en, true);
        else {
          damageGob(en, 1, R.dashDX, R.dashDZ);
          R.dashing = false; R.dashT = 0;
          game.shake = 0.3;
        }
      }
    }
  }
  for (var i4 = enemies.length - 1; i4 >= 0; i4--) if (enemies[i4].dead) enemies.splice(i4, 1);
}
var gobId = 0;
function damageGob(e, d, sx2, sz2) {
  if (e.dead) return false;
  e.hp -= d;
  e.hitT = 0.13;
  e.dmgTaken = Math.min(1, e.dmgTaken + 0.5);
  e.hitsTaken++;
  var dx = 0, dz = 0;
  if (sx2 !== undefined) { var l = Math.hypot(sx2, sz2) || 1; dx = sx2 / l; dz = sz2 / l; }
  e.vx += dx * 9; e.vz += dz * 9; e.vy = Math.max(e.vy, 1.6);
  e.brain.reward('hurt');
  sfx('hit');
  if (e.hp <= 0) killGob(e, false);
  return true;
}
function killGob(e, smash) {
  if (e.dead) return;
  e.dead = true;
  var c = gobbyCol(e.k);
  game.combo = Math.min(99, game.combo + 1);
  game.combot = 4;
  game.comboBest = Math.max(game.comboBest, game.combo);
  var pts = e.sc * Math.max(1, game.combo - 0);
  game.score += pts;
  game.kills++;
  if (game.combo > 1 && (game.combo % 5 === 0 || game.combo === 3)) {
    popText(e.x, e.y + e.h + 1, e.z, 'COMBO ×' + game.combo, true, '#ffd75e');
    sfx('coin');
  }
  if (game.combo % 20 === 0 && game.lives < game.maxLives) {
    game.lives++;
    popText(e.x, e.y + e.h + 1.7, e.z, '♥ +1 LIFE', true, '#ff8a9a');
    sfx('heal');
  }
  popText(e.x, e.y + e.h + 0.7, e.z, '+' + pts, false, smash ? '#9fe8ff' : '#ffe9a8');
  if (smash) {
    burst(e.x, e.y + e.h * 0.5, e.z, [160, 230, 255], 18, 9, 2.6, 0.3, 0.6);
    ringBurst(e.x, e.y + 0.2, e.z, [200, 240, 255], 4);
    game.shake = Math.max(game.shake, 0.22);
    doHitStop(0.05);
    sfx('smash');
  } else {
    burst(e.x, e.y + e.h * 0.5, e.z, c.skin, 16, 6, 2, 0.34, 0.55);
    burst(e.x, e.y + e.h * 0.4, e.z, [255, 220, 90], 10, 5, 1.5, 0.16, 0.4);
    game.shake = Math.max(game.shake, 0.14);
    sfx('kill');
  }
  /* drops */
  if (e.k === 'boss') {
    for (var gi = 0; gi < 6; gi++) spawnPickup('gem', e.x + rnd2(-1.2, 1.2), e.y + e.h * 0.5, e.z + rnd2(-1.2, 1.2));
    spawnPickup('heart', e.x, e.y + e.h * 0.5, e.z);
    spawnPickup('heart', e.x + rnd2(-1, 1), e.y + e.h * 0.5, e.z + rnd2(-1, 1));
  } else {
    if (tickRand() < (e.k === 'brute' ? 0.85 : e.k === 'spitter' ? 0.6 : 0.42)) spawnPickup('gem', e.x, e.y + e.h * 0.5, e.z);
    if (game.lives < game.maxLives && tickRand() < 0.06) spawnPickup('heart', e.x, e.y + e.h * 0.5, e.z);
  }
  var isBoss = e.k === 'boss';
  if (isBoss) {
    game.shake = 1;
    game.boss = false;
    doHitStop(0.22);
    burst(e.x, e.y + e.h * 0.6, e.z, [255, 120, 50], 40, 11, 3, 0.5, 1);
    ringBurst(e.x, e.y + 0.2, e.z, [255, 214, 94], 6);
    popText(e.x, e.y + e.h + 1.4, e.z, 'GOBLIN KING DOWN!', true, '#ffd75e');
    sfx('clear');
  }
  /* ---- evolution: score this goblin's genome and breed forward ---- */
  A.onDeath(bestiary, e.k, e.genome, A.fitness(e), tickRand);
  updateHUD();
  updateCombo();
}
function gobbyCol(k) { return gobCol(k); }
function hitRiley(e) {
  if (R.inv > 0 || state !== 'play' || e.dead) return;
  var dx = R.x - e.x, dz = R.z - e.z, d = Math.hypot(dx, dz) || 1;
  R.vx = dx / d * 13; R.vz = dz / d * 13; R.vy = 8;
  R.dashing = false; R.dashT = 0;
  if (e.k === 'boss') { game.shake = 0.8; R.vx *= 1.5; R.vz *= 1.5; }
  else game.shake = 0.4;
  if (!e.dead && e.brain) e.brain.reward('hit');
  e.dmgDealt += 1;
  hurt();
  e.vx -= dx / d * 7; e.vz -= dz / d * 7;
}
function hurt() {
  game.lives--;
  game.combo = 0;
  game.comboBest = Math.max(game.comboBest, game.combo);
  updateCombo();
  R.inv = 1.4; R.hitT = 0.4;
  game.shake = Math.max(game.shake, 0.5);
  doHitStop(0.08);
  sfx('hurt');
  var hv = el('hurtVig');
  hv.classList.add('on');
  setTimeout(function () { hv.classList.remove('on'); }, 70);
  updateHUD();
  if (game.lives <= 0) endGame();
}

/* ================================================================
 * 12. waves
 * ================================================================ */
function waveCompose() {
  var q = [], w = game.wave, i;
  if (w % 5 === 0) {
    var extra = Math.min(2 + Math.floor(w / 5), 7);
    for (i = 0; i < extra; i++) q.push(tickRand() < 0.5 ? 'grunt' : 'runner');
    return { boss: true, q: q };
  }
  var ng = Math.min(3 + Math.floor(w * 1.1), 11);
  var nr = w >= 2 ? Math.min(Math.floor((w - 1) / 2), 5) : 0;
  var ns = w >= 3 ? Math.min(Math.floor((w - 2) / 2), 4) : 0;
  var nb = w >= 4 ? Math.min(Math.floor((w - 3) / 3), 3) : 0;
  for (i = 0; i < ng; i++) q.push('grunt');
  for (i = 0; i < nr; i++) q.push('runner');
  for (i = 0; i < ns; i++) q.push('spitter');
  for (i = 0; i < nb; i++) q.push('brute');
  for (i = q.length - 1; i > 0; i--) { var j = Math.floor(tickRand() * (i + 1)); var t2 = q[i]; q[i] = q[j]; q[j] = t2; }
  return { boss: false, q: q };
}
function placeGoblin(k, px, pz) {
  var pt = null;
  if (px === undefined) {
    if (k === 'boss') {
      pt = { x: world.bossSpawn.x, y: world.bossSpawn.y, z: world.bossSpawn.z };
    } else {
      var sp = world.spawns[Math.floor(tickRand() * world.spawns.length)];
      pt = { x: sp.x + rnd2(-1.2, 1.2), y: sp.y, z: sp.z + rnd2(-1.2, 1.2) };
    }
  } else pt = { x: px, y: world.heightAt(px, pz), z: pz };
  var g = newGob(k, pt.x, pt.y, pt.z, 0);
  if (k === 'boss') { g.hp = g.hpMax = 34 + Math.max(0, game.wave - 5) * 6; g.enrage = false; }
  burst(g.x, g.y + 0.1, g.z, gobCol(k).skin, 10, 4, 0.6, 0.18, 0.35);
  ringBurst(g.x, g.y + 0.15, g.z, [220, 220, 255], 2.4);
  sfx(k === 'boss' ? 'boss' : k === 'brute' ? 'roar' : 'pop');
  if (k === 'boss') game.shake = 0.7;
  enemies.push(g);
  if (k === 'boss') game.boss = true;
  return g;
}
var ACCENTS = [
  [120, 255, 220], [255, 170, 90], [150, 255, 160], [255, 214, 110],
  [190, 140, 255], [255, 120, 60], [170, 230, 255], [255, 240, 150]
];
function accentRGB() { return ACCENTS[(game.wave - 1) % ACCENTS.length]; }
function startWave(n) {
  if (state !== 'play') { game.waveState = 'idle'; return; }
  game.wave = n;
  game.boss = false;
  /* smooth realm shift: blend fog toward the wave accent */
  var acc = accentRGB();
  fogTarget[0] = lerp(world.realm.fog[0], acc[0], 0.22);
  fogTarget[1] = lerp(world.realm.fog[1], acc[1], 0.16);
  fogTarget[2] = lerp(world.realm.fog[2], acc[2], 0.22);
  /* make sure Riley stands on ground */
  var gy = groundY(R.x, R.z);
  if (gy < R.y - 3 || gy > R.y + 3) { R.x = 0; R.z = 0; R.y = groundY(0, 0); R.vx = R.vy = R.vz = 0; }
  else R.y = Math.max(R.y, gy);
  R.dashing = false;
  R.inv = Math.max(R.inv, 0.3);
  enemies.length = 0;
  eShots.length = 0;
  var comp = waveCompose();
  if (comp.boss) {
    placeGoblin('boss');
    showBanner('⚠ GOBLIN KING', 'WAVE ' + n + ' — DEFEAT THE KING');
  } else {
    showBanner('WAVE ' + n, world.realm.n);
  }
  sfx('wave');
  game.spawnQueue = comp.q;
  game.spawnT = 0.5;
  game.waveState = 'combat';
  game.clearT = 0;
  updateHUD();
}
function waveClear() {
  game.waveState = 'clear';
  game.clearT = 2.6;
  game.boss = false;
  var bonus = 100 * game.wave;
  game.score += bonus;
  sfx('clear');
  popText(R.x, R.y + 1.8, R.z, 'WAVE CLEAR  +' + bonus, true, '#9fe8ff');
  if (game.lives < game.maxLives) { game.lives++; sfx('heal'); }
  /* the goblin army remembers: persist champions between sessions */
  saveBestiary();
  updateHUD();
}
function nextWave() {
  if (state !== 'play') { game.waveState = 'idle'; return; }
  startWave(game.wave + 1);
}

/* ================================================================
 * 13. pickups
 * ================================================================ */
function spawnPickup(kind, x, y, z) {
  if (pickups.length > 40) return;
  pickups.push({ k: kind, x: x, y: y, z: z, vy: rnd2(3, 5), ph: rnd2(0, TAU), life: 14, mag: 0 });
}
function updatePickups(dtP) {
  for (var i = pickups.length - 1; i >= 0; i--) {
    var p = pickups[i];
    p.life -= dtP;
    if (p.life <= 0) { pickups.splice(i, 1); continue; }
    p.vy -= 18 * dtP;
    p.y += p.vy * dtP;
    var gy = groundY(p.x, p.z);
    if (p.y < gy + 0.4) { p.y = gy + 0.4; p.vy = 0; }
    p.ph += dtP * 3;
    var dx = R.x - p.x, dz = R.z - p.z, d = Math.hypot(dx, dz);
    if (d < 3.4) { p.mag = Math.min(1, p.mag + dtP * 3); var pull = p.mag * 14; p.x += dx / (d || 1) * pull * dtP; p.z += dz / (d || 1) * pull * dtP; }
    if (d < 0.9 && Math.abs(p.y - (R.y + 0.9)) < 1.6) { collectPickup(p); pickups.splice(i, 1); }
  }
}
function collectPickup(p) {
  if (p.k === 'heart') {
    if (game.lives < game.maxLives) { game.lives++; sfx('heal'); popText(p.x, p.y + 0.6, p.z, '♥ +1', true, '#ff8a9a'); }
    else { game.score += 50; popText(p.x, p.y + 0.6, p.z, '+50', false, '#ff8a9a'); }
    burst(p.x, p.y, p.z, [255, 120, 150], 14, 5, 1, 0.2, 0.5);
  } else {
    R.mana = Math.min(R.manaMax, R.mana + 18);
    game.score += 15;
    popText(p.x, p.y + 0.6, p.z, '+15', false, '#a9d8ff');
    burst(p.x, p.y, p.z, [120, 190, 255], 12, 5, 1, 0.16, 0.45);
    ringBurst(p.x, p.y, p.z, [160, 220, 255], 3);
    sfx('coin');
  }
  updateHUD();
}

/* ================================================================
 * 14. HUD
 * ================================================================ */
function el(id) { return document.getElementById(id); }
function show(id) { el(id).classList.remove('hide'); }
function hide(id) { el(id).classList.add('hide'); }
function popText(x, y, z, txt, big, col) {
  var p = document.createElement('div');
  p.className = 'pop' + (big ? ' big' : '');
  p.textContent = txt;
  if (col) p.style.color = col;
  document.body.appendChild(p);
  var m = PVM, w = m[3] * x + m[7] * y + m[11] * z + m[15];
  var sx = Ww, sy = Hh;
  if (Math.abs(w) > 0.0001) {
    sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * Ww;
    sy = (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5)) * Hh;
  }
  p.style.left = sx + 'px';
  p.style.top = sy + 'px';
  setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 980);
}
var bannerEl = null, reticleEl = null;
function showBanner(wv, nm) {
  bannerEl.querySelector('.wv').textContent = wv;
  bannerEl.querySelector('.nm').textContent = nm;
  bannerEl.style.opacity = 1;
  bannerEl.querySelector('.wv').style.transform = 'scale(.5)';
  requestAnimationFrame(function () { bannerEl.querySelector('.wv').style.transform = 'scale(1)'; });
  game.bannerT = 1.7;
}
function updateHUD() {
  var h = '';
  for (var i = 0; i < game.maxLives; i++) h += i < game.lives ? '♥' : '🖤';
  el('hudHearts').textContent = h;
  shownScore += (game.score - shownScore) * Math.min(1, dt * 9);
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  el('hudScore').firstChild.nodeValue = Math.round(shownScore);
  el('hudWave').textContent = 'WAVE ' + game.wave;
  var bb = el('bossBar'), be = null;
  for (var j = 0; j < enemies.length; j++) if (enemies[j].k === 'boss' && !enemies[j].dead) { be = enemies[j]; break; }
  if (be) {
    bb.style.display = 'block';
    bb.querySelector('i').style.width = Math.max(0, be.hp / be.hpMax * 100) + '%';
  } else bb.style.display = 'none';
  el('hurtVig').classList.toggle('low', game.lives === 1 && state === 'play');
  var mb = el('manaBar');
  if (mb && R) {
    var pct = R.mana / R.manaMax * 100;
    mb.querySelector('i').style.width = pct + '%';
    mb.classList.toggle('full', R.mana >= R.manaMax);
    mb.querySelector('span').textContent = R.mana >= R.manaMax ? 'NOVA READY' : 'MAGIC';
  }
}
function updateCombo() {
  var c = el('comboCtr'), f = el('comboFill');
  if (game.combo > 1) {
    c.style.opacity = 1;
    c.firstChild.nodeValue = '×' + game.combo;
    f.style.opacity = 1;
    f.style.width = Math.max(4, game.combot / 4 * 90) + 'px';
  } else { c.style.opacity = 0; f.style.opacity = 0; }
}
function updateReticle() {
  var showRet = state === 'play' && finePointer;
  if (!showRet) { reticleEl.classList.remove('on'); document.body.classList.remove('aiming'); return; }
  reticleEl.classList.add('on');
  document.body.classList.add('aiming');
  if (pointerLocked) {
    reticleEl.style.left = (Ww / 2) + 'px';
    reticleEl.style.top = (Hh / 2) + 'px';
  } else {
    reticleEl.style.left = mouseX + 'px';
    reticleEl.style.top = mouseY + 'px';
  }
  /* lock tint when an enemy sits on the aim line */
  var ax = Math.sin(camYaw), az = Math.cos(camYaw);
  var lock = false;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var dx = e.x - R.x, dz = e.z - R.z, d = Math.hypot(dx, dz) || 1;
    var dot = (dx / d) * ax + (dz / d) * az;
    if (dot > 0.985 && d < 30) { lock = true; break; }
  }
  reticleEl.classList.toggle('lock', lock);
}
/* ================================================================
 * 15. character rendering (instanced)
 * ================================================================ */
/* limb2(out, x,y,z, yaw, pivX,pivY,pivZ, pitch, roll, geoX,geoY,geoZ, sx,sy,sz)
 * box & sphere centre on the origin; cyl/cone bases sit at local y=0. */
function drawRileyChar(o) {
  if (o.hitT > 0 && Math.floor(time * 26) % 2 === 0) return;
  var skin = [255, 210, 180], robe = [56, 58, 176], robeD = [40, 42, 134],
    gold = [255, 214, 94], hat = [88, 60, 214], boot = [96, 58, 38], wood = [128, 80, 46];
  var moving = Math.abs(o.vx) > 0.5 || Math.abs(o.vz) > 0.5;
  var walk = Math.sin(o.run);
  var bob = (moving && o.ground) ? Math.abs(walk) * 0.05 : Math.sin(time * 3) * 0.02;
  var legSwing = (moving && o.ground) ? walk * 0.8 : (o.air ? -0.35 : 0);
  var armSwing = (moving && o.ground) ? -walk * 0.65 : (o.air ? -0.4 : 0.15);
  var yaw = o.yaw, bx = o.x, by = o.y, bz = o.z;
  /* cape */
  C.limb2(MM, bx, by + 1.18, bz - 0.2, yaw, 0, 0, 0, -0.22, Math.sin(o.run * 0.5) * 0.1, 0, 0, 0, 0.5, 0.64, 0.08);
  instPart('box', 'cloth', MM, [72, 50, 176]);
  /* robe */
  C.limb2(MM, bx, by + 0.48, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.44, 0.64, 0.4);
  instPart('box', 'cloth', MM, robeD);
  C.limb2(MM, bx, by + 0.98, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.36, 0.36);
  instPart('box', 'cloth', MM, robe);
  C.limb2(MM, bx, by + 0.84, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.46, 0.08, 0.42);
  instPart('box', '', MM, gold);
  /* legs + boots (pivot at hip) */
  for (var s2 = -1; s2 <= 1; s2 += 2) {
    C.limb2(MM, bx + s2 * 0.13, by + 0.66, bz, yaw, 0, 0, 0, legSwing * s2, 0, 0, -0.3, 0, 0.15, 0.52, 0.17);
    instPart('box', '', MM, robeD);
    C.limb2(MM, bx + s2 * 0.13, by + 0.66, bz, yaw, 0, 0, 0, legSwing * s2, 0, 0, -0.56, 0.03, 0.18, 0.16, 0.26);
    instPart('box', '', MM, boot);
  }
  /* arms (pivot at shoulder; right one holds the wand) */
  C.limb2(MM, bx - 0.36, by + 1.32, bz, yaw, 0, 0, 0, armSwing, 0, 0, -0.24, 0, 0.14, 0.46, 0.15);
  instPart('box', 'cloth', MM, robe);
  C.limb2(MM, bx + 0.36, by + 1.32, bz, yaw, 0, 0, 0, -1.15, 0, 0, -0.24, 0, 0.14, 0.46, 0.15);
  instPart('box', 'cloth', MM, robe);
  /* head + face (front = +z local) */
  C.limb2(MM, bx, by + 1.5 + bob * 0.6, bz + 0.02, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.3, 0.3);
  instPart('sphereL', '', MM, skin);
  C.limb2(MM, bx, by + 1.62 + bob * 0.6, bz + 0.06, yaw, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.26, 0.14, 0.2);
  instPart('box', '', MM, [226, 70, 48]);
  C.limb2(MM, bx - 0.085, by + 1.52 + bob * 0.6, bz + 0.18, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.055, 0.07, 0.03);
  instPart('box', '', MM, [255, 255, 255]);
  C.limb2(MM, bx + 0.085, by + 1.52 + bob * 0.6, bz + 0.18, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.055, 0.07, 0.03);
  instPart('box', '', MM, [255, 255, 255]);
  C.limb2(MM, bx - 0.085, by + 1.52 + bob * 0.6, bz + 0.2, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.095, 0.11, 0.03);
  instPart('box', 'g4', MM, skin);
  C.limb2(MM, bx + 0.085, by + 1.52 + bob * 0.6, bz + 0.2, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.095, 0.11, 0.03);
  instPart('box', 'g4', MM, skin);
  /* hat */
  C.limb2(MM, bx, by + 1.64 + bob * 0.6, bz + 0.02, yaw, 0, 0, 0, -0.12, 0, 0, 0, 0, 0.52, 0.06, 0.52);
  instPart('cyl', '', MM, [hat[0] * 0.72, hat[1] * 0.72, hat[2] * 0.72]);
  C.limb2(MM, bx, by + 1.66 + bob * 0.6, bz + 0.02, yaw, 0, 0, 0, -0.12, 0, 0, 0, 0, 0.3, 0.42, 0.3);
  instPart('cone', '', MM, hat);
  C.limb2(MM, bx, by + 2.08 + bob * 0.6, bz + 0.1, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.13, 0.13, 0.13);
  instPart('sphereL', 'g5', MM, gold);
  /* wand + tip (hand sits at ~(0.36, 1.22, 0.22) local) */
  C.limb2(MM, bx + 0.36, by + 1.22, bz + 0.22, yaw, 0, 0, 0, -1.15, 0, 0, 0, 0.12, 0.05, 0.05, 0.36);
  instPart('box', '', MM, wood);
  var chg = o.charging ? clamp((o.charge - 0.28) / 0.72, 0, 1) : 0;
  var tipScale = 0.1 + chg * 0.24 + (o.shootAnim > 0 ? 0.12 : 0);
  C.limb2(MM, bx + 0.36, by + 1.3, bz + 0.36, yaw, 0, 0, 0, 0, 0, 0, 0, 0, tipScale, tipScale, tipScale);
  instPart('sphereL', 'g6', MM, chg > 0.85 ? [200, 150, 255] : gold);
  if (Math.random() < 0.08 + chg * 0.5) {
    fxPush({ x: bx + 0.36, y: by + 1.28, z: bz + 0.38, vx: 0, vy: rnd2(0.2, 0.6), vz: 0, life: 0.5, max: 0.5, s: 0.08 + chg * 0.08, pr: chg > 0.85 ? 200 : 255, pg: chg > 0.85 ? 150 : 225, pb: chg > 0.85 ? 255 : 130, pa: 0.7, grav: 0 });
  }
  /* NOVA-ready aura */
  if (o.mana >= o.manaMax && Math.random() < 0.35) {
    var aa = Math.random() * TAU;
    fxPush({ x: o.x + Math.cos(aa) * 0.7, y: o.y + rnd2(0.3, 1.6), z: o.z + Math.sin(aa) * 0.7, vx: 0, vy: rnd2(0.5, 1), vz: 0, life: 0.5, max: 0.5, s: 0.09, pr: 150, pg: 200, pb: 255, pa: 0.7, grav: 0 });
  }
}
function drawRileyGlow() {
  drawInstanced('box', 'g4', [80, 220, 255]);            /* glasses */
  drawInstanced('sphereL', 'g5', [255, 235, 160]);       /* hat star */
  var chg6 = (R && R.charging) ? clamp((R.charge - 0.28) / 0.72, 0, 1) : 0;
  drawInstanced('sphereL', 'g6', chg6 > 0.85 ? [200, 150, 255] : [255, 225, 130]); /* wand tip */
}
function drawGoblin(e) {
  if (e.hitT > 0 && Math.floor(time * 26) % 2 === 0) return;
  var c = gobCol(e.k);
  if (e.shade && e.shade !== 1) {
    c.skin = shade(c.skin, e.shade); c.skinD = shade(c.skinD, e.shade); c.belly = shade(c.belly, e.shade);
    c.ear = shade(c.ear, e.shade); c.cloth = shade(c.cloth, e.shade);
  }
  var s = e.r * 2, yaw = e.yaw, bx = e.x, by = e.y, bz = e.z, h = e.h;
  var moving = Math.hypot(e.vx, e.vz) > 1;
  var swing = Math.sin(e.run);
  var bob2 = moving ? Math.abs(Math.cos(e.run)) * 0.04 * Math.min(1, e.r * 2) : 0;
  var legA = moving ? swing * 0.8 : 0;
  var armSw = moving ? swing * 0.5 : Math.sin(time * 2 + e.ph) * 0.08;
  /* belly */
  C.limb2(MM, bx, by + h * 0.46, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.26 * s, 0.22 * h, 0.18 * s);
  instPart('box', '', MM, c.belly);
  /* legs (pivot at hip) */
  for (var s2 = -1; s2 <= 1; s2 += 2) {
    C.limb2(MM, bx + s2 * h * 0.5, by + h * 0.5, bz, yaw, 0, 0, 0, legA * 0.55 * s2 + (e.k === 'brute' ? -0.25 : 0), 0, 0, -0.22 * h, 0, 0.13 * s, 0.3 * h, 0.14 * s);
    instPart('box', '', MM, c.skinD);
  }
  /* arms (pivot at shoulder) */
  C.limb2(MM, bx - 0.95 * s, by + h * 0.78, bz, yaw, 0, 0, 0, 0.35 + armSw, 0, 0, -0.2 * h, 0, 0.11 * s, 0.34 * h, 0.11 * s);
  instPart('box', '', MM, c.skin);
  C.limb2(MM, bx + 0.95 * s, by + h * 0.78, bz, yaw, 0, 0, 0, 0.35 - armSw, 0, 0, -0.2 * h, 0, 0.11 * s, 0.34 * h, 0.11 * s);
  instPart('box', '', MM, c.skin);
  if (e.k === 'brute') {
    var cw2 = Math.sin(time * 3 + e.ph) * 0.3;
    C.limb2(MM, bx - 0.95 * s, by + h * 0.8, bz, yaw, 0, 0, 0, cw2, 0, 0, -0.3 * h, 0, 0.09 * s, 0.9 * h, 0.09 * s);
    instPart('box', '', MM, [98, 72, 46]);
    C.limb2(MM, bx - 0.95 * s, by + h * 0.8, bz, yaw, 0, 0, 0, cw2, 0, 0, -0.85 * h, 0, 0.24 * s, 0.3 * h, 0.24 * s);
    instPart('box', '', MM, [62, 46, 32]);
  }
  /* head */
  C.limb2(MM, bx, by + h * 0.94 + bob2, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.3 * s, 0.3 * s, 0.3 * s);
  instPart('sphereL', '', MM, c.skin);
  /* ears (cones pointing up, rolled outward) */
  C.limb2(MM, bx - 0.22 * s, by + h * 1.0 + bob2, bz, yaw, 0, 0, 0, 0, 1.2, 0, 0, 0, 0.1 * s, 0.34 * s, 0.1 * s);
  instPart('cone', '', MM, c.ear);
  C.limb2(MM, bx + 0.22 * s, by + h * 1.0 + bob2, bz, yaw, 0, 0, 0, 0, -1.2, 0, 0, 0, 0.1 * s, 0.34 * s, 0.1 * s);
  instPart('cone', '', MM, c.ear);
  /* snout + eyes + fangs (front = +z) */
  C.limb2(MM, bx, by + h * 0.9 + bob2, bz + 0.16 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.12 * s, 0.1 * s, 0.12 * s);
  instPart('box', '', MM, c.skinD);
  C.limb2(MM, bx - 0.09 * s, by + h * 0.97 + bob2, bz + 0.14 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.055 * s, 0.055 * s, 0.02 * s);
  instPart('box', e.k === 'boss' ? 'g2' : 'g', MM, [0, 0, 0]);
  C.limb2(MM, bx + 0.09 * s, by + h * 0.97 + bob2, bz + 0.14 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.055 * s, 0.055 * s, 0.02 * s);
  instPart('box', e.k === 'boss' ? 'g2' : 'g', MM, [0, 0, 0]);
  C.limb2(MM, bx, by + h * 0.84 + bob2, bz + 0.18 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.1 * s, 0.045 * s, 0.04 * s);
  instPart('box', '', MM, [255, 250, 235]);
  if (e.k === 'spitter') {
    C.limb2(MM, bx + 0.9 * s, by + h * 0.5, bz, yaw, 0, 0, 0, -1.05, 0, 0, 0.25 * h, 0, 0.05 * s, 0.6 * h, 0.05 * s);
    instPart('box', '', MM, c.cloth);
    C.limb2(MM, bx + 0.9 * s, by + h * 0.66, bz + 0.28 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.15 * s, 0.15 * s, 0.15 * s);
    instPart('sphereL', 'g3', MM, [0, 0, 0]);
  }
  if (e.k === 'boss') {
    C.limb2(MM, bx, by + h * 0.75, bz - 0.2 * s, yaw, 0, 0, 0, 0.15, 0, 0, 0, 0, 0.55 * s, 0.65 * h, 0.08 * s);
    instPart('box', 'cloth', MM, c.cloth);
    C.limb2(MM, bx, by + h * 1.02 + bob2, bz, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.18 * s, 0.16 * s, 0.18 * s);
    instPart('cone', '', MM, [255, 214, 94]);
    C.limb2(MM, bx, by + h * 1.06 + bob2, bz + 0.12 * s, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.05 * s, 0.05 * s, 0.05 * s);
    instPart('box', 'g2', MM, [0, 0, 0]);
  }
  /* boss aura */
  if (e.k === 'boss' && Math.random() < 0.3) {
    fxPush({ x: bx + rnd2(-0.5, 0.5), y: by + rnd2(0.3, e.h), z: bz + rnd2(-0.5, 0.5), vx: 0, vy: rnd2(0.4, 1), vz: 0, life: 0.6, max: 0.6, s: 0.12, pr: 255, pg: 200, pb: 90, pa: 0.55, grav: 0 });
  }
}
function drawGoblinGlow() {
  drawInstanced('box', 'g', [255, 220, 100]);            /* eyes */
  drawInstanced('box', 'g2', [255, 70, 50]);             /* boss eyes */
  drawInstanced('sphereL', 'g3', [190, 120, 255]);       /* spitter orb */
}
/*__END__*/
function shade(c, f) { return [Math.min(255, c[0] * f) | 0, Math.min(255, c[1] * f) | 0, Math.min(255, c[2] * f) | 0]; }

/* ================================================================
 * 16. render
 * ================================================================ */
var Ww = innerWidth, Hh = innerHeight, BW = Ww, BH = Hh, renderScale = 1;
function resize() {
  Ww = innerWidth; Hh = innerHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  BW = Math.max(1, Math.round(Ww * dpr * renderScale));
  BH = Math.max(1, Math.round(Hh * dpr * renderScale));
  canvas.width = BW; canvas.height = BH;
  canvas.style.width = Ww + 'px'; canvas.style.height = Hh + 'px';
}
resize();
addEventListener('resize', resize);

function drawStaticVBO(vbo, n, texKey, alpha, glowCol) {
  gl.useProgram(pStat);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 44, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 44, 32);
  gl.uniformMatrix4fv(uStat.uPV, false, PVM);
  gl.uniformMatrix4fv(uStat.uV, false, VM);
  gl.uniform3f(uStat.uL, LIGHT[0], LIGHT[1], LIGHT[2]);
  gl.uniform3f(uStat.uFogC, fogCur[0] / 255, fogCur[1] / 255, fogCur[2] / 255);
  gl.uniform1f(uStat.uFN, 30);
  gl.uniform1f(uStat.uFF, 170);
  gl.uniform3f(uStat.uGlow, glowCol ? glowCol[0] / 255 : 0, glowCol ? glowCol[1] / 255 : 0, glowCol ? glowCol[2] / 255 : 0);
  gl.uniform1f(uStat.uAlpha, alpha === undefined ? 1 : alpha);
  var hasTex = texKey && TEX[texKey];
  gl.uniform1f(uStat.uTexOn, hasTex ? 1 : 0);
  if (hasTex) gl.bindTexture(gl.TEXTURE_2D, TEX[texKey]);
  if (alpha !== undefined && alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
  gl.drawArrays(gl.TRIANGLES, 0, n);
  if (alpha !== undefined && alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
}
function render() {
  gl.viewport(0, 0, BW, BH);
  gl.depthMask(true);
  gl.clearColor(fogCur[0] / 255, fogCur[1] / 255, fogCur[2] / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  /* stars */
  (function () {
    var list = [];
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], tw = 0.25 + 0.45 * Math.abs(Math.sin(time * s.sp + s.ph));
      list.push({ x: s.x, y: s.y, z: s.z, s: s.s, pr: 255, pg: 255, pb: 255, pa: tw, life: 1, max: 1 });
    }
    drawGlowList(list, 0);
  })();
  /* terrain + water */
  for (var i2 = 0; i2 < worldVBOs.length; i2++) {
    var w = worldVBOs[i2];
    if (w.water) drawStaticVBO(w.vbo, w.n, w.tex, 0.72, [w.key === 'water' ? world.realm.water[0] * 0.12 : 0, world.realm.water[1] * 0.12, world.realm.water[2] * 0.12]);
    else drawStaticVBO(w.vbo, w.n, w.tex);
  }
  /* props */
  for (var i3 = 0; i3 < propDraws.length; i3++) {
    var pd = propDraws[i3];
    drawPropInstanced(pd);
  }
  /* static glows (torches, runes) */
  (function () {
    var list = [];
    var acc = accentRGB();
    for (var i = 0; i < world.glowPoints.length; i++) {
      var gp = world.glowPoints[i];
      var a = 0.5 + 0.25 * Math.sin(time * 2.2 + gp.ph);
      list.push({ x: gp.x, y: gp.y, z: gp.z, s: gp.r * (0.9 + 0.1 * Math.sin(time * 3.1 + gp.ph)), pr: acc[0], pg: acc[1], pb: acc[2], pa: a, life: 1, max: 1 });
    }
    drawGlowList(list, 0);
  })();
  /* crystals */
  instBegin();
  for (var ci = 0; ci < world.crystals.length; ci++) {
    var c = world.crystals[ci];
    if (!c.alive) continue;
    var pu = 1 + 0.08 * Math.sin(time * 2.4 + c.ph);
    C.limb2(MM, c.x, c.y, c.z, c.ph, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.9 * c.s * pu, 0.9 * c.s * pu, 0.9 * c.s * pu);
    instPart('cone', 'crystal', MM, [140, 220, 255]);
  }
  drawInstanced('cone', 'crystal', [60, 160, 255], 1);
  for (var cj = 0; cj < world.crystals.length; cj++) {
    var cc = world.crystals[cj];
    if (!cc.alive) continue;
    shadowPush(cc.x, cc.y, cc.z, 0.55 * cc.s, 0.5);
  }
  /* shadows (soft round, one draw) */
  shadowFx.length = 0;
  if (R) shadowPush(R.x, R.y, R.z, 0.62, 0.85);
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    if (!e.dead) shadowPush(e.x, e.y, e.z, e.r + 0.15, 0.75);
  }
  drawGlowList(shadowFx, 1);
  /* pickups */
  for (var pi = 0; pi < pickups.length; pi++) {
    var p = pickups[pi];
    var py = p.y + Math.sin(p.ph) * 0.12;
    var col = p.k === 'heart' ? [255, 90, 120] : [110, 190, 255];
    C.limb2(MM, p.x, py, p.z, p.ph * 1.4, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0.32, 0.32, 0.32);
    instPart(p.k === 'heart' ? 'sphereL' : 'cone', p.k === 'heart' ? '' : 'crystal', MM, col);
    if (Math.random() < 0.25) fxPush({ x: p.x + rnd2(-0.15, 0.15), y: py + rnd2(0, 0.2), z: p.z + rnd2(-0.15, 0.15), vx: 0, vy: rnd2(0.3, 0.8), vz: 0, life: 0.5, max: 0.5, s: 0.08, pr: 150, pg: 220, pb: 255, pa: 0.7, grav: 0 });
  }
  /* enemies */
  for (var ei2 = 0; ei2 < enemies.length; ei2++) if (!enemies[ei2].dead) drawGoblin(enemies[ei2]);
  drawGoblinGlow();
  /* enemy shots */
  for (var es = 0; es < eShots.length; es++) {
    var s = eShots[es];
    C.limb2(MM, s.x, s.y, s.z, 0, 0, 0, 0, 0, 0, 0, 0, 0, s.r * 2, s.r * 2, s.r * 2);
    instPart('sphere', '', MM, s.col);
  }
  /* Riley */
  if (state === 'play' || state === 'over' || state === 'pause') {
    if (R) drawRileyChar(R);
  } else if (state === 'title' && R) {
    drawRileyChar(R);
  }
  drawRileyGlow();
  /* player shots */
  for (var sh = 0; sh < shots.length; sh++) {
    var s2 = shots[sh];
    var sc = s2.big ? s2.r * 2.4 : s2.r * 2;
    C.limb2(MM, s2.x, s2.y, s2.z, 0, time * 6, 0, 0, 0, 0, 0, 0, sc, sc, sc);
    instPart('sphere', '', MM, s2.col);
  }
  /* NOVA shockwave */
  if (R && R.novaFx > 0) {
    var nt = 1 - R.novaFx / 0.6;
    var rad = 1 + nt * 12;
    fxPush({ x: R.x, y: groundY(R.x, R.z) + 0.15, z: R.z, s: rad, pr: 150, pg: 210, pb: 255, pa: (1 - nt) * 0.8, life: 1, max: 1, vx: 0, vy: 0, vz: 0, grav: 0 });
  }
  /* fx on top */
  drawGlowList(fx, 0);
}
function drawPropInstanced(pd) {
  var geo = pd.geo;
  gl.useProgram(pInst);
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.v);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindBuffer(gl.ARRAY_BUFFER, pd.vbo);
  for (var i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(3 + i);
    gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 76, i * 16);
    ext.vertexAttribDivisorANGLE(3 + i, 1);
  }
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 76, 64);
  ext.vertexAttribDivisorANGLE(7, 1);
  gl.uniformMatrix4fv(uInst.uPV, false, PVM);
  gl.uniformMatrix4fv(uInst.uV, false, VM);
  gl.uniform3f(uInst.uL, LIGHT[0], LIGHT[1], LIGHT[2]);
  gl.uniform3f(uInst.uFogC, fogCur[0] / 255, fogCur[1] / 255, fogCur[2] / 255);
  gl.uniform1f(uInst.uFN, 30);
  gl.uniform1f(uInst.uFF, 170);
  gl.uniform3f(uInst.uGlow, 0, 0, 0);
  gl.uniform1f(uInst.uAlpha, 1);
  var hasTex = pd.tex && TEX[pd.tex];
  gl.uniform1f(uInst.uTexOn, hasTex ? 1 : 0);
  if (hasTex) gl.bindTexture(gl.TEXTURE_2D, TEX[pd.tex]);
  gl.drawArraysInstancedANGLE(gl.TRIANGLES, 0, geo.n, pd.n);
}

/* ================================================================
 * 17. sim step + main loop (netcode-driven, fixed 60Hz)
 * ================================================================ */
var session = null;
function makeSession() {
  session = new N.Session({
    mode: 'solo',
    seed: world ? world.seed : 'RILEY',
    players: 1,
    localPlayer: 0,
    rand: C.mulberry32(runSeedNum ^ 0xA11CE)
  });
}
function worldHash() {
  var ents = [[R.x, R.y, R.z, R.mana]];
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e.dead) ents.push([e.x, e.y, e.z, e.hp]);
  }
  return N.worldHash(ents);
}
function stepSim() {
  frame++;
  tickRand = N.simRng(runSeedNum, frame);
  /* raw controls -> input -> session -> sim (the MP path) */
  pollInputLive();
  var mv = moveVec();
  var inp = pollInput(mv);
  session.queueInput(0, inp);
  var ins = session.inputsFor(session.tick);
  var my = ins[0];
  session.tick++;
  if (frame % 8 === 0) session.recordWorldHash(worldHash());

  time += FIXED;
  stepPlayer(my);
  updateEnemies(FIXED);
  updatePickups(FIXED);
  updateShots(FIXED);
  updateCrystals(FIXED);
  /* combo / timers */
  if (game.combo > 0) { game.combot -= FIXED; if (game.combot <= 0) { game.combo = 0; updateCombo(); } }
  if (game.shake > 0) game.shake -= FIXED;
  if (game.bannerT > 0) {
    game.bannerT -= FIXED;
    if (game.bannerT <= 0 && bannerEl && bannerEl.style.opacity === '1' && state === 'play') bannerEl.style.opacity = '0';
  }
  updateHUD();
}
function updateCrystals(dtC) {
  for (var i = 0; i < world.crystals.length; i++) {
    var c = world.crystals[i];
    if (!c.alive) {
      c.respawn -= dtC;
      if (c.respawn <= 0) {
        c.alive = true;
        burst(c.x, c.y + 1, c.z, accentRGB(), 14, 4, 0.5, 0.2, 0.5);
        ringBurst(c.x, c.y + 0.1, c.z, accentRGB(), 3);
        sfx('pop');
      }
      continue;
    }
    /* walk-up shatter */
    if (Math.abs(c.x - R.x) < 1.1 && Math.abs(c.z - R.z) < 1.1 && Math.abs(c.y - R.y) < 2.2) shatterCrystal(c, true);
  }
}
function updateFxVisual(dtF) {
  for (var i = fx.length - 1; i >= 0; i--) {
    var f = fx[i];
    f.life -= dtF;
    if (f.life <= 0) { fx.splice(i, 1); continue; }
    f.vy -= (f.grav || 0) * dtF;
    f.x += f.vx * dtF; f.y += f.vy * dtF; f.z += f.vz * dtF;
  }
  /* fog blend toward wave accent */
  fogCur[0] = lerp(fogCur[0], fogTarget[0], Math.min(1, dtF * 1.5));
  fogCur[1] = lerp(fogCur[1], fogTarget[1], Math.min(1, dtF * 1.5));
  fogCur[2] = lerp(fogCur[2], fogTarget[2], Math.min(1, dtF * 1.5));
}
var acc = 0, FIXED = 1 / 60;
var lastFps = 0, fpsN = 0, fpsT = 0, qualityT = 0, lowStreak = 0, hiStreak = 0;
function adaptQuality(rawDt) {
  qualityT += rawDt;
  if (qualityT < 0.55) return;
  qualityT = 0;
  if (lastFps > 0 && lastFps < 48) { lowStreak++; hiStreak = 0; }
  else if (lastFps >= 58) { hiStreak++; lowStreak = 0; }
  else { lowStreak = 0; hiStreak = 0; }
  if (lowStreak >= 2 && renderScale > 0.62) { renderScale = Math.max(0.6, renderScale - 0.1); resize(); lowStreak = 0; }
  else if (hiStreak >= 4 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.1); resize(); hiStreak = 0; }
}
function loop(tms) {
  requestAnimationFrame(loop);
  if (NOGL) return;
  var t = tms / 1000;
  var rawDt = clamp(t - lastT, 0.001, 0.05);
  lastT = t;
  dt = rawDt;
  fpsT += rawDt; fpsN++;
  if (fpsT >= 0.5) { lastFps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  adaptQuality(rawDt);
  updateFxVisual(rawDt);
  if (state === 'title') {
    time += rawDt;
    updateCamera(rawDt, { x: 0, y: 0, z: 0 });
    render();
  } else if (state === 'play' || state === 'pause') {
    if (state === 'play') {
      if (hitStop > 0) {
        hitStop -= rawDt;
        acc = 0;
      } else {
        acc += rawDt;
        var steps = 0;
        while (acc >= FIXED && steps < 4) { stepSim(); acc -= FIXED; steps++; }
        if (steps === 4) acc = 0;
      }
    }
    updateCamera(rawDt, { x: R.x, y: R.y, z: R.z });
    updateReticle();
    render();
  } else if (state === 'over') {
    time += rawDt;
    updateCamera(rawDt, { x: R.x, y: R.y, z: R.z });
    render();
  }
}

/* ================================================================
 * 18. input — pointer lock mouse look, keys, touch
 * ================================================================ */
var keys = {};
var finePointer = !!(window.matchMedia && window.matchMedia('(pointer:fine)').matches);
var mouseX = Ww / 2, mouseY = Hh / 2;
var mouseFire = false, tapPulse = 0;
var jumpHeld = false, dashHeld = false, novaHeld = false;
var moveStickActive = false, moveStickX = 0, moveStickY = 0;
var aimStickActive = false, aimStickX = 0, aimStickY = 0;
var isTouch = false;
var downX = 0, downY = 0, downT = 0, dragLookActive = false;

function moveVec() {
  var sr = 0, su = 0;
  if (keys['KeyW'] || keys['ArrowUp']) su += 1;
  if (keys['KeyS'] || keys['ArrowDown']) su -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) sr -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) sr += 1;
  if (moveStickActive) { sr = moveStickX; su = moveStickY; }
  var l = Math.hypot(sr, su);
  if (l > 1) { sr /= l; su /= l; }
  /* camera-relative */
  var fd = [Math.sin(camYaw), Math.cos(camYaw)];
  var rt = [Math.cos(camYaw), -Math.sin(camYaw)];
  return [rt[0] * sr + fd[0] * su, rt[1] * sr + fd[1] * su];
}
document.addEventListener('keydown', function (e) {
  audioInit();
  if (e.code === 'Space') e.preventDefault();
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { startGame(); return; }
  if (state === 'over' && e.code === 'Space') { startGame(); return; }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP') {
    if (state === 'play') pauseGame();
    else if (state === 'pause') resumeGame();
  }
});
document.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () {
  keys = {};
  mouseFire = false; fireNow = false;
  jumpHeld = false; dashHeld = false; novaHeld = false;
  if (state === 'play') pauseGame();
});
document.addEventListener('pointerlockchange', function () {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', function (e) {
  if (pointerLocked) {
    camYawTarget -= e.movementX * 0.0021;
    camPitchTarget = clamp(camPitchTarget + e.movementY * 0.0017, -0.1, 0.92);
    mouseFire = mouseFire; /* level signal handled by buttons below */
  } else if (dragLookActive) {
    camYawTarget -= e.movementX * 0.0025;
    camPitchTarget = clamp(camPitchTarget + e.movementY * 0.002, -0.1, 0.92);
  }
  mouseX = e.clientX; mouseY = e.clientY;
});
canvas.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'touch') return;
  audioInit();
  mouseX = e.clientX; mouseY = e.clientY;
  if (state === 'title' || state === 'over') { startGame(); return; }
  if (state !== 'play') return;
  downX = e.clientX; downY = e.clientY; downT = performance.now();
  if (e.button === 0) {
    if (pointerLocked) {
      mouseFire = true;
    } else if (finePointer) {
      try { canvas.requestPointerLock(); } catch (err) {}
      dragLookActive = true;
      dragMovedAcc = 0;
    }
  } else if (e.button === 2) {
    dashHeld = true;
    setTimeout(function () { dashHeld = false; }, 40);
  }
});
var dragMovedAcc = 0;
window.addEventListener('pointermove', function (e) {
  if (e.pointerType === 'touch') return;
  if (dragLookActive && !pointerLocked && e.buttons & 1) {
    dragMovedAcc += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (dragMovedAcc > 14) dragLookConfirmed = true;
  }
});
var dragLookConfirmed = false;
window.addEventListener('pointerup', function (e) {
  if (e.pointerType === 'touch') return;
  if (e.button === 0) {
    mouseFire = false;
    if (dragLookActive) {
      var wasDrag = dragLookConfirmed;
      dragLookActive = false;
      dragLookConfirmed = false;
      if (!wasDrag && state === 'play' && finePointer) {
        tapPulse = 0.07; /* click = quick fire (trackpad path) */
      }
    }
  }
});
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

function pollInputLive() {
  fireNow = mouseFire || tapPulse > 0 || keys['KeyF'] || (aimStickActive);
  jumpNow = keys['Space'] || jumpHeld;
  dashNow = keys['ShiftLeft'] || keys['ShiftRight'] || dashHeld;
  novaNow = keys['KeyQ'] || keys['KeyE'] || novaHeld;
  if (tapPulse > 0) tapPulse -= dt;
}

/* touch */
function makeStick(padId, knobId, onMove, onEnd) {
  var pad = el(padId), knob = el(knobId), activeId = null;
  var kc = (pad.clientWidth - knob.clientWidth) / 2;
  function move(cx, cy) {
    var r = pad.getBoundingClientRect();
    var dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    var l = Math.hypot(dx, dy), max = r.width / 2 - 8;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    knob.style.left = (kc + dx) + 'px'; knob.style.top = (kc + dy) + 'px';
    onMove(dx / max, -dy / max);
  }
  pad.addEventListener('pointerdown', function (e) { e.preventDefault(); activeId = e.pointerId; pad.setPointerCapture(e.pointerId); move(e.clientX, e.clientY); });
  pad.addEventListener('pointermove', function (e) { if (activeId === e.pointerId) move(e.clientX, e.clientY); });
  function up(e) { if (activeId === e.pointerId) { activeId = null; knob.style.left = kc + 'px'; knob.style.top = kc + 'px'; onEnd(); } }
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
}
function setupTouch() {
  if (isTouch) return;
  isTouch = true;
  finePointer = false;
  touchAutoCam = true;
  el('mob').classList.add('on');
  el('hintBar').style.display = 'none';
  makeStick('joy', 'joyKnob', function (nx, ny) { moveStickActive = true; moveStickX = nx; moveStickY = ny; },
    function () { moveStickActive = false; moveStickX = 0; moveStickY = 0; });
  makeStick('aim', 'aimKnob', function (nx, ny) {
    var l = Math.hypot(nx, ny);
    if (l > 0.28) { aimStickActive = true; aimStickX = nx; aimStickY = ny; }
    else aimStickActive = false;
  }, function () { aimStickActive = false; aimStickX = 0; aimStickY = 0; });
  function bindBtn(id, setter) {
    var b = el(id);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); setter(true); });
    b.addEventListener('pointerup', function (e) { setter(false); });
    b.addEventListener('pointercancel', function (e) { setter(false); });
  }
  bindBtn('tbJump', function (v) { jumpHeld = v; });
  bindBtn('tbDash', function (v) { dashHeld = v; });
  bindBtn('tbNova', function (v) { novaHeld = v; });
}
window.addEventListener('touchstart', function () { if (!isTouch) setupTouch(); }, { passive: true });
window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && !isTouch) setupTouch(); }, { passive: true });

/* ================================================================
 * 19. audio (procedural)
 * ================================================================ */
var AC = null, noiseBuf = null, muted = false;
function audioInit() {
  if (AC || muted) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    var len = Math.floor(AC.sampleRate * 0.6), nb = AC.createBuffer(1, len, AC.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = nb;
  } catch (e) { AC = null; }
}
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC || muted) return;
  try {
    var t = AC.currentTime + (delay || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur + 0.03);
  } catch (e) {}
}
function noiseS(dur, vol, f0, f1, delay) {
  if (!AC || muted || !noiseBuf) return;
  try {
    var t = AC.currentTime + (delay || 0);
    var src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = AC.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    var g = AC.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(AC.destination);
    src.start(t); src.stop(t + dur + 0.03);
  } catch (e) {}
}
function sfx(n) {
  switch (n) {
    case 'shoot': tone(900, 130, 0.09, 'square', 0.04); noiseS(0.05, 0.02, 2400, 700); break;
    case 'dash': noiseS(0.16, 0.06, 2200, 260); tone(520, 190, 0.14, 'sine', 0.03); break;
    case 'jump': tone(290, 540, 0.12, 'triangle', 0.06); break;
    case 'djump': tone(400, 800, 0.14, 'triangle', 0.06); break;
    case 'hit': noiseS(0.2, 0.14, 900, 130); tone(230, 60, 0.22, 'sawtooth', 0.08); break;
    case 'kill': tone(330, 60, 0.16, 'square', 0.07); noiseS(0.13, 0.08, 700, 160); tone(1700, 110, 0.09, 'square', 0.03, 0.02); break;
    case 'smash': noiseS(0.18, 0.18, 1600, 180); tone(720, 40, 0.2, 'sawtooth', 0.1); break;
    case 'wave': tone(392, 392, 0.1, 'square', 0.06); tone(523, 523, 0.1, 'square', 0.06, 0.11); tone(659, 659, 0.16, 'square', 0.08, 0.22); break;
    case 'boss': tone(96, 58, 0.55, 'sawtooth', 0.12); tone(146, 108, 0.55, 'sawtooth', 0.09, 0.06); noiseS(0.4, 0.05, 300, 90); break;
    case 'roar': tone(150, 85, 0.3, 'sawtooth', 0.08); noiseS(0.28, 0.05, 550, 140); break;
    case 'low': tone(190, 80, 0.28, 'sawtooth', 0.1); break;
    case 'clear': tone(523, 523, 0.09, 'square', 0.07); tone(659, 659, 0.09, 'square', 0.07, 0.09); tone(784, 784, 0.09, 'square', 0.07, 0.18); tone(1046, 1046, 0.32, 'square', 0.09, 0.27); break;
    case 'hurt': tone(320, 70, 0.3, 'sawtooth', 0.1); noiseS(0.18, 0.09, 750, 90); break;
    case 'coin': tone(990, 1980, 0.09, 'sine', 0.05); break;
    case 'spit': tone(620, 940, 0.08, 'triangle', 0.04); break;
    case 'heal': tone(520, 780, 0.12, 'sine', 0.06); tone(780, 1040, 0.16, 'sine', 0.06, 0.1); break;
    case 'pop': tone(1150, 2300, 0.06, 'sine', 0.03); break;
    case 'nova': tone(180, 1400, 0.5, 'sawtooth', 0.09); tone(90, 700, 0.6, 'triangle', 0.08, 0.02); noiseS(0.5, 0.1, 400, 3000); tone(1200, 300, 0.4, 'sine', 0.05, 0.05); break;
    case 'crystal': tone(1200, 2400, 0.14, 'sine', 0.07); tone(1800, 3200, 0.2, 'sine', 0.05, 0.06); noiseS(0.12, 0.04, 3000, 1200); break;
  }
}
function toggleMute() {
  muted = !muted;
  el('btnMute').textContent = muted ? '🔇' : '🔊';
}
addEventListener('pointerdown', function () { audioInit(); }, true);

/* ================================================================
 * 20. game flow
 * ================================================================ */
function resetRiley() {
  R = newRiley();
  R.x = 0; R.z = 0;
  R.y = groundY(0, 0);
  R.ground = true;
}
function startGame() {
  if (NOGL) return;
  hide('ovTitle'); hide('ovOver'); hide('ovPause');
  game.score = 0; game.wave = 1; game.lives = game.maxLives = 5; game.kills = 0; shownScore = 0;
  game.combo = 0; game.comboBest = 0; game.boss = false; game.shake = 0;
  game.waveState = 'idle'; game.clearT = 0; game.spawnQueue = [];
  shots.length = 0; fx.length = 0; enemies.length = 0; eShots.length = 0; pickups.length = 0;
  var si = el('seedInput');
  var want = si ? String(si.value || '').trim().toUpperCase() : '';
  seedStr = want || ('RLY-' + Math.floor(Math.random() * 900000 + 100000));
  el('seedLine').textContent = 'WORLD ' + seedStr + ' · ' + '';
  buildWorld(seedStr);
  fogCur = fogTarget.slice();
  fogTarget = world.realm.fog.slice();
  resetRiley();
  makeSession();
  camYawTarget = R.yaw + Math.PI;
  camYaw = camYawTarget;
  camPitchTarget = 0.4; camPitch = 0.4;
  camX = R.x - Math.sin(camYaw) * camDist;
  camZ = R.z - Math.cos(camYaw) * camDist;
  camY = R.y + 6;
  state = 'play';
  frame = 0;
  acc = 0;
  audioInit();
  if (finePointer && !isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
  tickRand = C.mulberry32(runSeedNum ^ 0x7A7A);
  startWave(1);
  updateHUD();
}
function endGame() {
  state = 'over';
  if (game.score > best) {
    best = game.score;
    try { localStorage.setItem('riley3d.best', best); } catch (e) {}
  }
  el('bestLine2').textContent = best > 0 ? '🏆 NEW BEST! ' + best : '';
  el('stScore').textContent = game.score;
  el('stWave').textContent = game.wave;
  el('stKills').textContent = game.kills;
  el('stCombo').textContent = '×' + Math.max(1, game.comboBest);
  el('bossBar').style.display = 'none';
  show('ovOver');
  reticleEl.classList.remove('on');
  document.body.classList.remove('aiming');
  if (bannerEl.style.opacity === '1') bannerEl.style.opacity = '0';
  saveBestiary();
}
function toTitle() {
  state = 'title';
  show('ovTitle'); hide('ovOver'); hide('ovPause');
  fx.length = 0;
  titleScene();
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  show('ovPause');
  reticleEl.classList.remove('on');
  document.body.classList.remove('aiming');
}
function resumeGame() {
  if (state !== 'pause') return;
  state = 'play';
  hide('ovPause');
  if (finePointer && !isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
}
function titleScene() {
  if (!world) buildWorld(seedStr || 'RILEY');
  fogCur = world.realm.fog.slice();
  fogTarget = world.realm.fog.slice();
  R = newRiley();
  R.yaw = titleA + Math.PI;
  enemies.length = 0; eShots.length = 0; shots.length = 0; pickups.length = 0;
  game.waveState = 'idle'; game.boss = false; game.spawnQueue = 0;
  el('bossBar').style.display = 'none';
  var spots = [[-9, 8, 'grunt'], [9, -6, 'runner'], [0, -11, 'spitter']];
  for (var i = 0; i < spots.length; i++) {
    var g = newGob(spots[i][2], spots[i][0], 0, spots[i][1], i);
    g.y = world.heightAt(g.x, g.z);
    g.yaw = Math.atan2(-spots[i][0], -spots[i][1]);
    enemies.push(g);
  }
  /* title goblins idle-wander via cheap fake brains */
  tickRand = C.mulberry32(runSeedNum ^ 0x5EED);
}

/* ================================================================
 * 21. boot + test hooks
 * ================================================================ */
bannerEl = el('banner');
reticleEl = el('reticle');
el('btnPlay').onclick = startGame;
el('btnPause').onclick = pauseGame;
el('btnResume').onclick = resumeGame;
el('btnRestart').onclick = function () { resumeGame(); startGame(); };
el('btnNewWorld').onclick = function () {
  resumeGame();
  seedStr = 'RLY-' + Math.floor(Math.random() * 900000 + 100000);
  el('seedInput').value = '';
  startGame();
};
el('btnQuitTitle').onclick = function () { resumeGame(); toTitle(); };
el('btnQuit2').onclick = toTitle;
el('btnAgain').onclick = startGame;
el('btnMute').onclick = toggleMute;
el('btnPurge').onclick = function () {
  purgeBestiary();
  el('bestLine2').textContent = '🧠 Goblin memories purged';
};
if (best > 0) el('bestLine').textContent = '🏆 BEST SCORE: ' + best;
var iq = A.iqAvg(bestiary);
if (iq > 0) el('iqLine').textContent = '🧠 GOBLIN IQ ' + iq + ' — the army remembers you';
if (seedStr) el('seedInput').placeholder = seedStr;

if (NOGL) {
  document.getElementById('noGL').style.display = 'flex';
} else {
  /* boot into the title orbit */
  tickRand = C.mulberry32(0x5EED);
  titleScene();
  lastT = performance.now() / 1000;
  requestAnimationFrame(loop);
}
window.RileyGame = {
  get state() { return state; },
  get world() { return world; },
  get session() { return session; },
  start: startGame,
  toTitle: toTitle
};
/* self-test hooks (used with ?selftest=1) */
window.__R = function () {
  return { state: state, wave: game.wave, score: game.score, lives: game.lives,
    x: R ? R.x : 0, y: R ? R.y : 0, z: R ? R.z : 0, yaw: R ? R.yaw : 0,
    ground: R ? R.ground : false, fx: fx.length, fps: lastFps,
    mana: R ? R.mana : 0, inv: R ? R.inv : 0,
    camX: camX, camY: camY, camZ: camZ, camYaw: camYaw, camPitch: camPitch,
    locked: pointerLocked, seed: world ? world.seed : '' };
};
if (SELFTEST) {
  window.__T = {
    info: function () {
      return { state: state, wave: game.wave, wv: game.waveState, q: game.spawnQueue ? game.spawnQueue.length : 0,
        n: enemies.length, es: eShots.length, score: game.score, kills: game.kills,
        combo: game.combo, lives: game.lives, boss: game.boss, iq: A.iqAvg(bestiary),
        crystals: world.crystals.filter(function (c) { return c.alive; }).length,
        hash: session ? session.worldHash : 0, tick: session ? session.tick : 0 };
    },
    god: function (b) { if (b) R.inv = 1e9; },
    place: function (k, dx, dz) {
      var x = R.x + (dx !== undefined ? dx : Math.sin(R.yaw) * 6);
      var z = R.z + (dz !== undefined ? dz : Math.cos(R.yaw) * 6);
      var g = placeGoblin(k, x, z);
      return g && { x: x, y: g.y, z: z };
    },
    fire: function () { fireShot(); },
    hurtAll: function () { for (var i = enemies.length - 1; i >= 0; i--) if (!enemies[i].dead) damageGob(enemies[i], 99, Math.sin(i + 1), Math.cos(i + 1)); },
    nextWave: function () { waveClear(); game.clearT = 0.01; },
    wave: function (n) { startWave(n); },
    camBelow: function () { return world.heightAt(camX, camZ) - camY; },
    shatter: function () {
      var best2 = null, bd = 99;
      for (var i = 0; i < world.crystals.length; i++) {
        var c = world.crystals[i];
        if (!c.alive) continue;
        var d = Math.hypot(c.x - R.x, c.z - R.z);
        if (d < bd) { bd = d; best2 = c; }
      }
      if (best2) { shatterCrystal(best2, true); return true; }
      return false;
    },
    spitHit: function () {
      var ax = Math.sin(camYaw), az = Math.cos(camYaw);
      eShots.push({ x: R.x + ax * 3, y: R.y + 0.8, z: R.z + az * 3, vx: -ax * 12, vy: 0, vz: -az * 12, life: 2, r: 0.2, col: [170, 90, 255], from: null });
      return true;
    }
  };
}
window.__proj = function (wx, wy, wz) {
  var m = PVM;
  var x = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
  var y = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
  var w = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
  if (Math.abs(w) < 1e-6) return null;
  return [Math.round((x / w * 0.5 + 0.5) * Ww), Math.round((1 - (y / w * 0.5 + 0.5)) * Hh)];
};
window.__shot = function () {
  try {
    var c = document.createElement('canvas'); c.width = Ww; c.height = Hh;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(canvas, 0, 0);
    var d = x.getImageData(0, 0, Ww, Hh).data;
    var unique = 0, map = {};
    for (var y = 0; y < Hh; y += 4) for (var xx = 0; xx < Ww; xx += 4) {
      var i = (y * Ww + xx) * 4;
      var key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      if (!map[key]) { map[key] = 1; unique++; }
    }
    return { unique: unique };
  } catch (e) { return { err: e.message }; }
};
})();

