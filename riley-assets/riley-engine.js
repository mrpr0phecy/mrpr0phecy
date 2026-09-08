/* Riley Engine — the game itself.
 *
 * Layers (built on riley-core/world/ai/net):
 *   1. renderer   — WebGL1, instanced props/characters, textured terrain
 *   2. camera     — pointer-lock mouse look + raycast terrain clamp
 *   3. player     — fixed-timestep physics on a heightfield
 *   4. enemies    — neural-net brains (RileyAI), evolved per run & persisted
 *   5. netcode    — RileyNet solo session drives every sim tick (determinism)
 *
 * Exposes window.RileyGame = { state, world, session, start, toTitle } for the
 * card shell and ?selftest=1 hooks on window.__R / window.__T.
 * Loaded after riley-core/world/ai/net.
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

/* all-time stats (persisted): the goblin ledger */
var runStats = { games: 0, kills: 0, bestWave: 0, bestCombo: 0 };
try {
  var _rs = JSON.parse(localStorage.getItem('riley3d.stats') || 'null');
  if (_rs && typeof _rs === 'object') runStats = _rs;
} catch (e) {}
function saveRunStats() {
  try { localStorage.setItem('riley3d.stats', JSON.stringify(runStats)); } catch (e) {}
}
function refreshTitleStats() {
  var line = el('statsLine');
  if (!line) return;
  line.textContent = runStats.games > 0
    ? ('RUNS ' + runStats.games + ' · GHOULS ' + runStats.kills + ' · BEST WAVE ' + runStats.bestWave)
    : 'YOUR FIRST TIDE IS WAITING';
}
function rankFor() {
  var w = game.wave, s = game.score;
  if (w >= 12 || s >= 20000) return ['S', 'THE TIDE BREAKS ON YOU'];
  if (w >= 8 || s >= 10000) return ['A', 'THE GOBLINS WHISPER YOUR NAME'];
  if (w >= 5 || s >= 4000) return ['B', 'A RESPECTABLE SLAUGHTER'];
  if (w >= 3 || s >= 1200) return ['C', 'THE TIDE WILL RETURN'];
  return ['D', 'THE GOBLINS REMEMBER HOW YOU FELL'];
}

var game = { score: 0, wave: 1, lives: 5, maxLives: 5, kills: 0, combo: 0, combot: 0,
  snatched: 0, recovered: 0, lost: 0, gnawed: 0,
  comboBest: 0, boss: false, shake: 0, shakeT: 0, shakeAmp: 0, bannerT: 0, spawnQueue: [], spawnT: 0,
  waveState: 'idle', clearT: 0, accentT: 0, slowT: 0, slowK: 1, lastStand: false,
  boonOffer: null, boonN: {}, boonsTaken: 0 };
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

/* --- P_STATIC: world-space verts with pos/norm/uv/col (terrain, water) ---
 * uWater>0.5 => gentle GPU-side wave displacement (water plane only). */
var VS_STATIC =
  'attribute vec3 aP;attribute vec3 aN;attribute vec2 aUV;attribute vec3 aC;'+
  'uniform mat4 uV,uPV;uniform float uTime,uWater;'+
  'varying vec3 vN;varying vec2 vUV;varying vec3 vC;varying float vD;'+
  'void main(){vec3 p=aP;'+
  'if(uWater>0.5){p.y+=sin(aP.x*0.35+uTime*1.1)*0.085+sin(aP.z*0.42-uTime*0.83)*0.085;'+
  'p.y+=sin((aP.x+aP.z)*0.21+uTime*0.52)*0.05;}'+
  'gl_Position=uPV*vec4(p,1.0);vN=aN;vUV=aUV;vC=aC;vD=-(uV*vec4(p,1.0)).z;}';
/* --- P_INST: per-instance matrix+colour (props, characters, shots) ---
 * uSway>0 => wind: local verts sway with a per-instance phase (leaves). */
var VS_INST =
  'attribute vec3 aP;attribute vec3 aN;attribute vec2 aUV;'+
  'attribute vec4 aM0;attribute vec4 aM1;attribute vec4 aM2;attribute vec4 aM3;attribute vec3 aC;'+
  'uniform mat4 uV,uPV;uniform float uTime,uSway;'+
  'varying vec3 vN;varying vec2 vUV;varying vec3 vC;varying float vD;'+
  'void main(){vec3 lp=aP;'+
  'if(uSway>0.01){float ph=dot(aC,vec3(12.9898,78.233,37.719))*6.28318;'+
  'lp.x+=sin(uTime*1.5+ph)*0.055*aP.y;lp.z+=cos(uTime*1.2+ph)*0.045*aP.y;}'+
  'mat4 M=mat4(aM0,aM1,aM2,aM3);vec4 wp=M*vec4(lp,1.0);gl_Position=uPV*wp;'+
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
var uStat = uni(pStat, ['uV', 'uPV', 'uL', 'uFogC', 'uGlow', 'uFN', 'uFF', 'uAlpha', 'uTexOn', 'uTex', 'uTime', 'uWater']);
var pInst = makeProg(VS_INST, FS_MAIN, ['aP', 'aN', 'aUV', 'aM0', 'aM1', 'aM2', 'aM3', 'aC']);
var uInst = uni(pInst, ['uV', 'uPV', 'uL', 'uFogC', 'uGlow', 'uFN', 'uFF', 'uAlpha', 'uTexOn', 'uTex', 'uTime', 'uSway']);
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
  buildCamBlockers(world);
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
var INST_CAP = 900;
var instBuckets = {};
function getBucket(key) {
  if (!instBuckets[key]) instBuckets[key] = { arr: new Float32Array(INST_CAP * 19), n: 0, vbo: gl.createBuffer() };
  return instBuckets[key];
}
var MM = new Float32Array(16);
function instBegin() {
  Object.keys(instBuckets).forEach(function (k) { instBuckets[k].n = 0; });
}
/* `bodyXform` — when non-null, every part pushed by the *next* drawGoblin /
 * drawRileyChar call is premultiplied by it. One hook gives the goblin corpse
 * tumble, the hit squash and the strafe lean a whole-body transform without
 * rewriting a single limb: those effects are about the *body*, not the parts. */
var bodyXform = null;
var _BXa = new Float32Array(16), _BXb = new Float32Array(16), _BXm = new Float32Array(16);
function bodyPush(cx, cy, cz, yaw, pit, rol, sx, sy, sz) {
  C.m4T(_BXa, cx, cy, cz); C.m4RY(_BXb, yaw); C.m4mul(_BXm, _BXa, _BXb);
  C.m4RX(_BXb, pit); C.m4mul(_BXm, _BXm, _BXb);
  C.m4RZ(_BXb, rol); C.m4mul(_BXm, _BXm, _BXb);
  if (sx !== 1 || sy !== 1 || sz !== 1) {
    C.m4S(_BXb, sx, sy, sz); C.m4mul(_BXm, _BXm, _BXb);
  }
  C.m4T(_BXa, -cx, -cy, -cz); C.m4mul(_BXm, _BXm, _BXa);
  bodyXform = _BXm;
}
function instPart(geoKey, texKey, m, col) {
  var b = getBucket(geoKey + '|' + (texKey || ''));
  if (b.n >= INST_CAP) return;
  if (bodyXform) { m = C.m4mul(_BXa, bodyXform, m); }
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
  gl.uniform1f(uInst.uTime, time);
  gl.uniform1f(uInst.uSway, 0);
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
function fillQuads(list, out, len) {
  var o = 0, ln = len === undefined ? list.length : len;
  for (var i = 0; i < ln; i++) {
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
function drawGlowList(list, mode, len) {
  var ln = len === undefined ? list.length : len;
  if (!ln) return;
  var o = fillQuads(list, fxData, ln);
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
  gl.drawArrays(gl.TRIANGLES, 0, ln * 6);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}
function fxPush(p) {
  if (fx.length > FX_CAP - 6) fx.shift();
  fx.push(p);
}
/* pre-allocated billboard scratch — static glow sets (stars, torches, halos)
 * refill fixed object slots each frame instead of allocating new ones */
function makeGlowScratch(n) {
  var a = new Array(n), i;
  for (i = 0; i < n; i++) a[i] = { x: 0, y: 0, z: 0, s: 0, pr: 0, pg: 0, pb: 0, pa: 0, life: 1, max: 1 };
  return a;
}
var starScratch = makeGlowScratch(160), starN = 0;
var glowScratch = makeGlowScratch(80), glowN = 0;
var haloScratch = makeGlowScratch(32), haloN = 0;
function glowAddInto(list, n, x, y, z, s, r, g, b, a) {
  if (n >= list.length) return;
  var o = list[n];
  o.x = x; o.y = y; o.z = z; o.s = s; o.pr = r; o.pg = g; o.pb = b; o.pa = a; o.life = 1; o.max = 1;
  return n + 1;
}
function burst(x, y, z, color, n, spd, grav, size, life) {
  n = Math.max(1, Math.round(n * fxScale));
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
 * 7. camera — orbit rig: terrain+prop occlusion by *lifting* the pivot,
 *    spring-damped follow, velocity auto-frame, lock-on framing, kick/shake
 *
 * Why it is built this way (every rule below fixes a concrete feel bug):
 *  - One source of truth: a pivot Riley orbits, plus (yaw, pitch, distance).
 *    Auto-frame, lock-on, aim-in, death and hits only write *desired* values
 *    and the rig springs toward them, so nothing ever teleports.
 *  - Smoothing uses `1 - exp(-k*dt)`, never `clamp(k*dt,0,1)`: the same feel
 *    at 30/60/144 Hz instead of "snaps at 144, mushy at 30".
 *  - Occlusion lifts the orbit centre over terrain first and shortens the
 *    boom only as a last resort, with a hard floor. The old rig collapsed to
 *    1.15u the moment the ground behind you rose a metre — the lens sat
 *    inside Riley's skull for as long as you stood near a slope.
 *  - Manual look always wins: `lastAimT` gates every automatic rotation for
 *    a beat after you touch the mouse/stick, so the camera never fights you.
 * ================================================================ */
var PM = new Float32Array(16), VM = new Float32Array(16), PVM = new Float32Array(16);
var LIGHT = [0.5, 0.85, 0.35];
var fogCur = [12, 17, 46], fogTarget = [12, 17, 46];

/* --- camera settings (persisted; sliders live in the pause menu) --- */
var CAMSET = {
  sens: 1.0,      /* look gain multiplier                            0.35 … 2.4  */
  smooth: 0.35,   /* 0 = snappy, 1 = butter                      0 … 1    */
  fov: 0,         /* base FOV bias in "units" of 0.02 rad                     -12 … 18 */
  shake: 1.0,     /* screen-shake amount (0 = none — motion sickness off)   0 … 1.8  */
  autoFrame: 1,   /* swing behind Riley while running                        0/1    */
  lockCam: 1,     /* hold the frame on the locked goblin                      0/1    */
  orbit: 1,       /* locked: A/D circle the target instead of the camera      0/1    */
  zoom: 8.2,      /* boom length in units                                    3.4-12.5 */
  invertY: 0,
  aimMode: 0      /* 0 = cursor-steer (default, never needs pointer lock)    0/1
                     1 = pointer-lock aim (classic FPS look, click canvas)      */
};
try {
  var _cs = JSON.parse(localStorage.getItem('riley3d.camset') || 'null');
  if (_cs && typeof _cs === 'object') { for (var _ck in CAMSET) if (typeof _cs[_ck] === 'number') CAMSET[_ck] = _cs[_ck]; }
} catch (e) {}
function saveCamSet() {
  try { localStorage.setItem('riley3d.camset', JSON.stringify(CAMSET)); } catch (e) {}
}

var CAM_PITCH_HOME = 0.40;                     /* home tilt: player + fight clearly framed */
var camYaw = 0, camPitch = CAM_PITCH_HOME;
var camYawTarget = 0, camPitchTarget = CAM_PITCH_HOME;
var CAM_PIT_MIN = -0.42, CAM_PIT_MAX = 1.26;
var camDist = 8.2, camDistTarget = 8.2;        /* wheel zooms CAM_DIST_MIN..MAX */
var CAM_DIST_MIN = 3.4, CAM_DIST_MAX = 12.5;
var camX = 0, camY = 6, camZ = 8;
var camFov = 0.98;
var eye = [0, 0, 0], ctr = [0, 0, 0];
var lookY = 1.15;                              /* lagged look-height (jump lag) */
var lastAimT = -10;                            /* last manual mouse-look input */
var aim = { x: 0, y: 0, z: 0, lock: null, assist: null, dot: 0 };
var lockOn = null;                             /* sticky combat lock */
var pointerLocked = false;
var camCollideD = 7.2;                         /* collision-safe boom length */
var camLift = 0;                               /* pivot lift while the boom clips */
var camRoll = 0, camRollT = 0;                 /* banking into strafes */
var camShoulder = 0;                           /* over-the-shoulder offset (u) */
var camBodyT = 0;                              /* lateral truck to clear a body (u) */
var _qThief = [], _qGnaw = [];                 /* scratch: who is near the loot */
var ddxC = 0, ddyC = 0, ddzC = 1;              /* this frame's look axis (render only) */
var camPivX = 0, camPivY = 0, camPivZ = 0;      /* smoothed orbit centre */
var camKickY = 0, camKickP = 0, camKickR = 0;  /* impact offsets (decay to 0) */
var camAutoT = 0;                              /* auto-frame spin-up (0..1) */
var camBlockT = 0;                             /* 0..1 occlusion strength */
var camBlockers = [];                          /* solid props that hide the view */
var titleA = 0;
var touchAutoCam = false;

/* shortest signed angle a → b */
function angDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function camDir() { return [Math.sin(camYaw), 0, Math.cos(camYaw)]; }
/* frame-rate independent exponential approach */
function damp(cur, tgt, k, dt) { return cur + (tgt - cur) * (1 - Math.exp(-k * dt)); }
/* approach at a bounded angular rate (rad/s): can neither whip nor overshoot */
function rateTo(cur, tgt, maxRate, dt) {
  var d = angDiff(cur, tgt), m = maxRate * dt;
  return cur + (d > m ? m : (d < -m ? -m : d));
}
/* true while the player is the one pointing the gun */
function camAiming() {
  return !!(mouseFire || gpFire || (R && R.charging) || (pointerLocked && time - lastAimT < 0.8));
}

function nearestLivingEnemy(px, pz, maxD) {
  var bestE = null, bd = maxD || 28;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e || e.dead) continue;
    var d = Math.hypot(e.x - px, e.z - pz);
    if (d < bd) { bd = d; bestE = e; }
  }
  return bestE;
}
function cycleLockOn() {
  if (state !== 'play' || !R) return;
  var cand = [];
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e && !e.dead && Math.hypot(e.x - R.x, e.z - R.z) < 34) cand.push(e);
  }
  if (!cand.length) { lockOn = null; return; }
  if (!lockOn) {
    /* first press: nearest — the thing you can actually hit */
    var nd = 1e9, pick = cand[0];
    for (var q = 0; q < cand.length; q++) {
      var dq = Math.hypot(cand[q].x - R.x, cand[q].z - R.z);
      if (dq < nd) { nd = dq; pick = cand[q]; }
    }
    lockOn = pick;
  } else {
    /* further presses: cycle *around* Riley, so each Tab is the next goblin
       you would want to look at, not the one already under your feet */
    var base = Math.atan2(lockOn.x - R.x, lockOn.z - R.z);
    cand.sort(function (a, b) {
      var aa = angDiff(base, Math.atan2(a.x - R.x, a.z - R.z));
      var bb = angDiff(base, Math.atan2(b.x - R.x, b.z - R.z));
      var la = aa < 0 ? -aa : aa, lb = bb < 0 ? -bb : bb;
      return (la - lb) || (Math.hypot(a.x - R.x, a.z - R.z) - Math.hypot(b.x - R.x, b.z - R.z));
    });
    for (var c2 = 0; c2 < cand.length; c2++) if (cand[c2] !== lockOn) { lockOn = cand[c2]; break; }
  }
  if (lockOn) { lastAimT = time - 0.5; sfxGated('pop'); }
}
function clearLockIfDead() {
  if (lockOn && (lockOn.dead || Math.hypot(lockOn.x - R.x, lockOn.z - R.z) > 46)) lockOn = null;
}

/* ---- occlusion --------------------------------------------------
 * How far back the boom can reach for a given pivot lift. 0 = clear.
 * Heightfield sampling is exact for hills; solid props use an analytic
 * ray/cylinder test so the lens never sits inside a trunk. */
function boomHit(px, py, pz, dx, dy, dz, maxD, lift, pad) {
  var STEPS = 16, i, t;
  for (i = 1; i <= STEPS; i++) {
    t = maxD * i / STEPS;
    var x = px + dx * t, z = pz + dz * t;
    if (py + dy * t + lift - pad < world.heightAt(x, z)) return t;
  }
  for (i = 0; i < camBlockers.length; i++) {
    var b = camBlockers[i];
    var ox = px - b.x, oz = pz - b.z;
    var reach = maxD + b.r + 2;
    if (ox * ox + oz * oz > reach * reach) continue;
    var rx = b.x - px, rz = b.z - pz;
    var proj = rx * dx + rz * dz;
    if (proj < -b.r || proj > maxD + b.r) continue;
    var perp = Math.abs(rx * dz - rz * dx);
    if (perp > b.r) continue;
    var yc = py + dy * proj + lift;
    if (yc > b.y - pad && yc < b.y + b.h) return Math.max(0.6, proj - b.r);
  }
  return 0;
}
/* Goblin bodies are soft occluders too. A 2-hp grunt must never be able to
   fill the screen, and "camera clips through the crowd" is the single most
   common complaint about third-person arenas. Returns the signed lateral
   slide (world units) the boom needs to get around the nearest body — the rig
   *trucks* sideways with the target, so Riley stays centred and the body
   slides out of frame instead of the camera zooming to her nose. */
var BODY_PUSH_MAX = 0.9;
/* Bodies are soft occluders too. A brute parked between the lens and Riley
   hides the one thing you must never lose sight of, and "the camera clips
   through the crowd" is the standard complaint about third-person arenas.
   Test the line of sight to her chest, and return the lateral slide that gets
   it clear. The rig *trucks* with its target, so Riley stays centred while the
   body slides out of frame — instead of the camera slamming into first person,
   or wobbling every time a runner brushes past her hip (the last metre next to
   Riley is deliberately ignored: that is a hug, not an occlusion). */
function bodyPush(ex, ey, ez, tx, ty, tz, maxD) {
  var sdx = tx - ex, sdz = tz - ez;
  var sl = Math.hypot(sdx, sdz);
  if (sl < 1.6) return 0;
  var dx = sdx / sl, dz = sdz / sl;
  var sdy = (ty - ey) / sl;
  var push = 0, i;
  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var ex2 = e.x - ex, ez2 = e.z - ez;
    var proj = ex2 * dx + ez2 * dz;
    if (proj < 0.45 || proj > maxD - 1.05) continue;
    var rad = e.r + 0.34 + (e.k === 'boss' ? 0.5 : 0);
    var lat = ex2 * -dz + ez2 * dx;
    var over = rad - Math.abs(lat);
    if (over < 0.2) continue;                            /* deadband: no crowd jitter */
    var yAt = ey + sdy * proj;
    var vy = yAt - (e.y + e.h * 0.5);
    var vHalf = e.h + 0.9;
    if (Math.abs(vy) > vHalf) continue;
    var vw = 1 - Math.abs(vy) / vHalf;
    var need = clamp(over * 0.9, 0.16, 0.8) * (0.6 + 0.4 * (proj / maxD)) * vw;
    need *= (lat >= 0 ? -1 : 1);
    if (Math.abs(need) > Math.abs(push)) push = need;
  }
  return clamp(push, -BODY_PUSH_MAX, BODY_PUSH_MAX);
}
/* A goblin that has been shoved into the lens would otherwise paint the inside
   of a torso over the whole screen. At that range there is nothing behind it
   the player needs either, so it is simply not drawn — the classic "hide
   actors between the camera and the player" trick, and far cheaper per frame
   than a per-actor alpha pass. Uses the interpolated render position and the
   render camera, so it can never feed back into the sim. */
function lensHide(e) {
  var hx = e.rx - camX, hy = e.ry + e.h * 0.55 - camY, hz = e.rz - camZ;
  var d = Math.hypot(hx, hy, hz);
  var lim = 0.8 + e.r * 0.75;
  if (d > lim) return false;
  /* and only what is in front of the lens — anything behind it is not on the
     screen, so there is nothing to hide */
  return (hx * -ddxC + hy * -ddyC + hz * -ddzC) > -0.15;
}
function boomSolve(px, py, pz, dx, dy, dz, wantD) {
  var LIFTS = [0, 0.5, 1.15, 2.0], bestLift = 0, bestD = -1;
  for (var li = 0; li < LIFTS.length; li++) {
    var hit = boomHit(px, py, pz, dx, dy, dz, wantD, LIFTS[li], 0.34);
    if (!hit) return { lift: LIFTS[li], d: wantD };
    if (hit > bestD) { bestD = hit; bestLift = LIFTS[li]; }
  }
  return { lift: bestLift, d: Math.max(CAM_DIST_MIN * 0.7, bestD - 0.45) };
}

/* View matrix with a roll angle (C.m4Look is up-fixed). Rolling the view's
 * right/up rows keeps every consumer of VM (billboards, aim unprojection)
 * reading the same rows as before. */
function m4LookRoll(o, ex, ey, ez, cx, cy, cz, roll) {
  C.m4Look(o, ex, ey, ez, cx, cy, cz);
  if (!roll) return o;
  var c = Math.cos(roll), s = Math.sin(roll);
  var a0 = o[0], a4 = o[4], a8 = o[8], a12 = o[12];
  var b1 = o[1], b5 = o[5], b9 = o[9], b13 = o[13];
  o[0] = c * a0 + s * b1; o[4] = c * a4 + s * b5; o[8] = c * a8 + s * b9; o[12] = c * a12 + s * b13;
  o[1] = c * b1 - s * a0; o[5] = c * b5 - s * a4; o[9] = c * b9 - s * a8; o[13] = c * b13 - s * a12;
  return o;
}

/* ---------- impact language for the rig ---------- */
function camKick(yaw, pitch, roll) { camKickY += yaw; camKickP += pitch; camKickR += roll; }
function shake(amp) { if (amp > game.shake) game.shake = amp; }
var zoomPulse = 0;      /* wheel activity — briefly widens the reticle ring */
var camSwiftT = 0;      /* >0 right after "re-centre": the swing is quicker */
/* R (and the pause button): ask the rig to get behind Riley. It *swings*
   there under the same damping as everything else — an instant snap of the
   whole world is exactly the nauseating thing people quit over. */
function resetCamera(soft) {
  if (!R) return;
  camYawTarget = R.yaw;
  camPitchTarget = CAM_PITCH_HOME;
  camDistTarget = clamp(CAMSET.zoom, CAM_DIST_MIN, CAM_DIST_MAX);
  lastAimT = time - 99;         /* auto-frame/lock gates open immediately */
  if (!soft) { camYaw = camYawTarget; camPitch = camPitchTarget; camSwiftT = 0; }
  else camSwiftT = 1;
}
/* place the rig instantly behind Riley (run start; no fly-in from the title) */
function camSnapToPlayer() {
  camYawTarget = camYaw = R.yaw;
  camPitchTarget = camPitch = CAM_PITCH_HOME;
  camDistTarget = camDist = clamp(CAMSET.zoom, CAM_DIST_MIN, CAM_DIST_MAX);
  camCollideD = camDist; camLift = 0; camRoll = camRollT = 0; camShoulder = 0; camBodyT = 0;
  camAutoT = 0; camBlockT = 0; camKickY = camKickP = camKickR = 0;
  lookY = R.y + 1.30;
  camPivX = R.x; camPivY = lookY; camPivZ = R.z;
  var cp = Math.cos(camPitch);
  camX = R.x - Math.sin(camYaw) * cp * camDist;
  camZ = R.z - Math.cos(camYaw) * cp * camDist;
  camY = lookY + 0.16 + Math.sin(camPitch) * camDist;
  if (world) { var gh = world.heightAt(camX, camZ) + 0.42; if (camY < gh) camY = gh; }
  lastAimT = -10;
}

function updateCamera(dtC, lookAt) {
  var lx = lookAt.x, ly = lookAt.y, lz = lookAt.z;
  var spd = Math.hypot(R.vx, R.vz);
  var spdF = clamp(spd / 9, 0, 1);
  var aiming = camAiming();
  var locked = !!(lockOn && !lockOn.dead);
  var manual = pointerLocked || dragLookActive || gpAiming;
  /* --- cursor steering ---
   * The robust default: the camera turns to follow the mouse cursor, exactly
   * like a virtual joystick centred on the screen. No pointer lock, no drag,
   * no browser gesture/cooldown roulette — move the cursor, the camera turns;
   * park it centre and the camera holds. Left-click fires. This is what keeps
   * the game playable when requestPointerLock is refused (which every browser
   * does at some point), and it means the camera can never be "stuck". */
  var curActive = false;
  if (state === 'play' && !pointerLocked && !dragLookActive && !gpAiming &&
      finePointer && !isTouch && CAMSET.aimMode === 0) {
    var cnx = mouseX / Ww * 2 - 1, cny = mouseY / Hh * 2 - 1;
    var cmag = Math.hypot(cnx, cny);
    var CDZ = 0.14;                                  /* centre dead zone */
    if (cmag > CDZ) {
      var ck = (cmag - CDZ) / (1 - CDZ) / cmag;      /* 0 at the zone edge → 1 at the rim */
      var cax = cnx * ck, cay = cny * ck;
      var cr = 1.2 + CAMSET.sens * 1.4;              /* rad/s at full deflection */
      camYawTarget -= cax * cr * dtC;
      camPitchTarget = clamp(camPitchTarget + cay * cr * 0.72 * dtC * (CAMSET.invertY ? -1 : 1), CAM_PIT_MIN, CAM_PIT_MAX);
      lastAimT = time;
      curActive = true;
    }
  }
  manual = manual || curActive;
  var nearThreat = 1e9;
  for (var ci = 0; ci < enemies.length; ci++) {
    var ce = enemies[ci];
    if (ce.dead) continue;
    var cd = Math.hypot(ce.x - lx, ce.z - lz);
    if (cd < nearThreat) nearThreat = cd;
  }
  clearLockIfDead();
  locked = !!(lockOn && !lockOn.dead);

  if (state === 'title') {
    titleA += dtC * 0.15;
    camYawTarget = titleA;
    camPitchTarget = 0.30 + Math.sin(titleA * 0.7) * 0.05;
    camDistTarget = 10.5;
  } else if (state === 'over') {
    /* the fall: slow orbit in close, looking down at where Riley went down */
    camYawTarget += dtC * 0.24;
    camPitchTarget = damp(camPitchTarget, 0.68, 1.6, dtC);
    camDistTarget = damp(camDistTarget, 6.6, 1.6, dtC);
  } else if (state === 'play' || state === 'pause') {
    if (locked && CAMSET.lockCam) {
      /* combat lock: sit BEHIND Riley on the player→target line so both he
         and the goblin he is fighting stay framed, easing off a dead-ahead
         line so he doesn't mask the target. Manual look suspends the follow
         for a beat: the lock frames the fight, it never fights the player.
         (the pre-2026 build added π here and stared at empty ground.) */
      var want = Math.atan2(lockOn.x - lx, lockOn.z - lz);
      if (time - lastAimT > 0.5) {
        var side = angDiff(want, camYawTarget) >= 0 ? 1 : -1;
        want += 0.17 * side;
        camYawTarget = damp(camYawTarget, want, 3.2, dtC);
        var dyT = (ly + 1.0) - (lockOn.y + lockOn.h * 0.6);
        camPitchTarget = damp(camPitchTarget, clamp(0.30 + dyT * 0.045, -0.02, 0.6), 2.6, dtC);
      }
    } else if (CAMSET.autoFrame && !aiming && !manual && time - lastAimT > 0.9) {
      /* auto-frame: pull behind the *velocity* so you see where you're going,
         not where you were. Rate-limited (it can never whip), and it stays
         out of the way while a goblin is on top of you. */
      var wantYaw = Math.atan2(R.vx, R.vz);
      var off = angDiff(camYawTarget, wantYaw);
      if (spd > 3.0 && Math.abs(off) > 0.5 && nearThreat > 7.5) {
        camAutoT = Math.min(1, camAutoT + dtC * 1.7);
        camYawTarget = rateTo(camYawTarget, wantYaw, (0.8 + Math.abs(off) * 1.2) * camAutoT * camAutoT, dtC);
      } else {
        camAutoT = Math.max(0, camAutoT - dtC * 3);
        /* threat framing: standing still with a goblin in your blind spot is
           the #1 "I got hit by something I never saw" moment. If the player
           has been hands-off for a beat, ease the camera toward the most
           off-screen nearby threat so the danger is shown, never a surprise.
           Measured from the lens (eye → goblin vs the look axis), so a goblin
           already framed between the camera and Riley never triggers a swing. */
        if (spd <= 3.0 && nearThreat < 9) {
          var tBest = 0, tWant = 0, tFound = false;
          for (var ti = 0; ti < enemies.length; ti++) {
            var te = enemies[ti];
            if (te.dead) continue;
            var tdT = Math.hypot(te.x - camX, te.z - camZ);
            if (tdT > 16) continue;
            var taT = Math.atan2(te.x - camX, te.z - camZ);
            var offT = Math.abs(angDiff(taT, camYaw));
            if (offT > 1.0 && offT > tBest) { tBest = offT; tWant = taT; tFound = true; }
          }
          if (tFound) camYawTarget = rateTo(camYawTarget, tWant, 1.5, dtC);
        }
      }
    } else camAutoT = 0;
  }

  /* look responsiveness: tight under manual control, softer for auto-framing */
  camSwiftT = damp(camSwiftT, 0, 3, dtC);
  var lookK = manual ? (30 - CAMSET.smooth * 22) : 11;
  lookK *= 1 + camSwiftT * 1.4;
  camYaw = damp(camYaw, camYawTarget, lookK, dtC);
  camPitchTarget = clamp(camPitchTarget, CAM_PIT_MIN, CAM_PIT_MAX);
  camPitch = damp(camPitch, camPitchTarget, lookK, dtC);

  /* ---- desired boom length ---- */
  var wantD = camDistTarget;
  wantD *= 1 + spdF * 0.05;                            /* breathe out as you run */
  if (R.dashing) wantD *= 1.05;
  if (aiming && !locked) wantD *= 0.8;                 /* in over the shoulder */
  if (locked) wantD += clamp(Math.hypot(lockOn.x - lx, lockOn.z - lz) * 0.15, 0, 2.2);
  /* a GOBLIN KING is 1.85u of chest in your face at the default distance:
     give the arena a floor so the boss reads as a silhouette, not a wall */
  if (game.boss && !aiming) wantD = Math.max(wantD, 8.6);
  wantD = clamp(wantD, CAM_DIST_MIN, CAM_DIST_MAX);
  camDist = damp(camDist, wantD, 9, dtC);

  /* ---- orbit pivot ---- */
  /* jump: hang with you going up, plant instantly on landing */
  lookY = damp(lookY, ly + 1.30, R.vy > 0.5 ? 4.8 : 15, dtC);
  var leadT = locked ? 0.05 : 0.08;                    /* lead, but never while duelling */
  var px = lx + R.vx * leadT, pz = lz + R.vz * leadT;
  if (R.dashing) { px += R.dashDX * 0.85; pz += R.dashDZ * 0.85; }
  /* shoulder only while engaging, and it eases in — an always-on side offset
     is what makes an orbit camera feel like it forever drifts off-centre */
  camShoulder = damp(camShoulder, (aiming || locked) ? (locked ? 0.6 : 0.42) : 0, 5.5, dtC);
  px += Math.cos(camYaw) * camShoulder;
  pz += -Math.sin(camYaw) * camShoulder;
  /* truck around a goblin that has put itself between the lens and Riley */
  var cp0 = Math.cos(camPitch), ddx0 = Math.sin(camYaw) * cp0, ddz0 = Math.cos(camYaw) * cp0;
  var bpEy = camPivY + 0.16 + Math.sin(camPitch) * camDist + camLift;
  var bpEx = px - ddx0 * camDist, bpEz = pz - ddz0 * camDist;
  camBodyT = damp(camBodyT, bodyPush(bpEx, bpEy, bpEz, lx, ly + 1.0, lz, camDist), 6.5, dtC);
  if (camBodyT) {
    var bll = Math.hypot(ddx0, ddz0) || 1;
    px += (-ddz0 / bll) * camBodyT;
    pz += (ddx0 / bll) * camBodyT;
  }
  /* bank into the strafe / turn: tiny, but it sells momentum */
  var lat = R.vx * Math.cos(camYaw) - R.vz * Math.sin(camYaw);
  camRollT = -clamp(lat / 9, -1, 1) * 0.04 - clamp(angDiff(camYaw, camYawTarget) * 0.6, -0.03, 0.03);
  camRoll = damp(camRoll, camRollT, 6, dtC);
  var pivK = R.dashing ? 13 : 10;
  camPivX = damp(camPivX, px, pivK, dtC);
  camPivZ = damp(camPivZ, pz, pivK, dtC);
  camPivY = damp(camPivY, lookY, 9, dtC);

  var cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  var ddx = Math.sin(camYaw) * cp, ddy = sp, ddz = Math.cos(camYaw) * cp;
  ddxC = ddx; ddyC = ddy; ddzC = ddz;

  /* ---- occlusion: lift, then shorten, then let FOV widen ---- */
  var pivY = camPivY + 0.16;
  /* The boom runs from the pivot to the eye, and the eye sits *above* the
     pivot (ddy is the look direction's +y, so the boom's y is +ddy). Passing
     -ddy here sampled the hillside instead of the air and pinned the rig at
     max lift nearly everywhere — the classic "why does this camera float". */
  var sol = boomSolve(camPivX, pivY, camPivZ, -ddx, ddy, -ddz, wantD + 1.4);
  camLift = damp(camLift, sol.lift, 13, dtC);
  var safeD = Math.min(wantD, sol.d || wantD);
  if (safeD < camCollideD) camCollideD = damp(camCollideD, safeD, 22, dtC);   /* pull in fast */
  else camCollideD = damp(camCollideD, safeD, 5.5, dtC);                      /* ease out slow */
  var useD = Math.min(wantD, camCollideD);
  camBlockT = damp(camBlockT, useD < wantD - 0.4 ? clamp((wantD - useD) * 0.45, 0, 1) : 0, 8, dtC);

  var ex = camPivX - ddx * useD, ez = camPivZ - ddz * useD;
  var ey = pivY + camLift + ddy * useD;
  var gh = world.heightAt(ex, ez) + 0.42;
  if (ey < gh) ey = gh;
  /* Lead + shoulder + occlusion lift all push the rig away from Riley; pull it
     back on the eye→player line so the reach you configured is the reach you
     get (and so nothing can ever fling the camera across the map again). */
  var rdx = ex - lx, rdy = ey - ly, rdz = ez - lz;
  var rd = Math.hypot(rdx, rdy, rdz);
  if (rd > CAM_DIST_MAX) {
    var rsc = CAM_DIST_MAX / rd;
    ex = lx + rdx * rsc; ez = lz + rdz * rsc; ey = ly + rdy * rsc;
    if (ey < gh) ey = gh;
  }
  camX = ex; camY = ey; camZ = ez;

  /* ---- look-at: head framed, leaning into the fight ---- */
  ctr[0] = camPivX; ctr[2] = camPivZ; ctr[1] = pivY + camLift * 0.45 + 0.06;
  if (locked) {
    var fr = clamp(Math.hypot(lockOn.x - lx, lockOn.z - lz) / 13, 0.25, 1);
    ctr[0] = lerp(camPivX, lockOn.x, 0.24 * fr);
    ctr[1] = lerp(ctr[1], lockOn.y + lockOn.h * 0.72, 0.2 * fr);
    ctr[2] = lerp(camPivZ, lockOn.z, 0.24 * fr);
  } else if (aiming) {
    ctr[0] += (aim.x - camPivX) * 0.05; ctr[2] += (aim.z - camPivZ) * 0.05;
  }

  /* ---- impact: kicks decay out of the orientation, never persist ---- */
  camKickY = damp(camKickY, 0, 8.5, dtC);
  camKickP = damp(camKickP, 0, 8.5, dtC);
  camKickR = damp(camKickR, 0, 6.5, dtC);
  camYaw += camKickY;
  camPitch = clamp(camPitch + camKickP, CAM_PIT_MIN - 0.14, CAM_PIT_MAX + 0.14);

  var sh = game.shake;
  if (sh > 0.001) {
    visT += dtC * (1 + sh * 1.5);
    var ss = sh * sh * 0.3 * CAMSET.shake;
    var n1 = Math.sin(visT * 39.7) * Math.cos(visT * 24.3);
    var n2 = Math.sin(visT * 47.1 + 1.7);
    var n3 = Math.cos(visT * 33.9 + 0.4);
    eye[0] = camX + n1 * ss;
    eye[1] = camY + n2 * ss * 0.7;
    eye[2] = camZ + n3 * ss;
    camKickR += n3 * ss * 0.1;
  } else { eye[0] = camX; eye[1] = camY; eye[2] = camZ; }

  m4LookRoll(VM, eye[0], eye[1], eye[2], ctr[0], ctr[1], ctr[2], camRoll + camKickR);
  /* FOV: dash punch, nova bloom, charge focus, aim-in narrow, widen if buried */
  var fovT = 0.98 + CAMSET.fov * 0.02 + (R.dashing ? 0.09 : 0) + spdF * 0.03 +
    (R.novaFx > 0 ? 0.10 : 0) - (R.charging ? chargePct() * 0.06 : 0) +
    (aiming && !locked ? -0.03 : 0) + camBlockT * 0.08 + Math.abs(camKickP) * 0.3;
  camFov = damp(camFov, fovT, 6.5, dtC);
  C.m4Persp(PM, camFov, Ww / Hh, 0.12, 480);
  C.m4mul(PVM, PM, VM);
  camR[0] = VM[0]; camR[1] = VM[4]; camR[2] = VM[8];
  camUp[0] = VM[1]; camUp[1] = VM[5]; camUp[2] = VM[9];
  /* the ground the rig is standing on, for anything that needs it */
  camFloorY = world.heightAt(camX, camZ);
}
var camFloorY = 0;
var visT = 0;                    /* render clock — shake keeps moving in hit-stop */

/* build the camera's prop-collision list from the instanced props (trunks
 * and boulders only — canopies and runes are above/behind the boom anyway) */
function buildCamBlockers(w) {
  camBlockers.length = 0;
  var keys = ['bark', 'rock', 'stone'], i, k;
  for (k = 0; k < keys.length; k++) {
    var arr = w.props[keys[k]];
    if (!arr || !arr.length) continue;
    for (i = 0; i + 18 < arr.length; i += 19) {
      var sx = Math.hypot(arr[i], arr[i + 1], arr[i + 2]);
      var sy = Math.hypot(arr[i + 4], arr[i + 5], arr[i + 6]);
      var sz = Math.hypot(arr[i + 8], arr[i + 9], arr[i + 10]);
      var r = Math.max(sx, sz) * 0.55 + 0.18;
      var h = Math.max(0.8, sy);
      if (r < 0.2 || r > 3.2) continue;
      camBlockers.push({ x: arr[i + 12], y: arr[i + 13], z: arr[i + 14], r: r, h: h });
    }
  }
}

/* Mouse-assist aim (the Zelda cursor): unproject the screen point to a world
 * ray, then test it *analytically* against enemy capsules and the
 * heightfield. The old fixed 1.4u march stepped straight over goblins at
 * range, which is why shots sometimes passed through a model for no reason. */
function raySphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  var mx = cx - ox, my = cy - oy, mz = cz - oz;
  var b = mx * dx + my * dy + mz * dz;
  if (b <= 0) return -1;
  var disc = b * b - (mx * mx + my * my + mz * mz - r * r);
  if (disc < 0) return -1;
  return b - Math.sqrt(disc);
}
function updateAim() {
  aim.lock = null; aim.assist = null; aim.dot = 0;
  if (state !== 'play' || !world) return;
  if (lockOn && !lockOn.dead) {
    aim.lock = lockOn;
    aim.x = lockOn.x; aim.z = lockOn.z; aim.y = lockOn.y + lockOn.h * 0.55;
    return;
  }
  if (isTouch && aimStickActive) {
    var l = Math.hypot(aimStickX, aimStickY) || 1;
    var ax = R.x + (aimStickX / l) * 9, az = R.z + (aimStickY / l) * 9;
    aim.x = ax; aim.z = az; aim.y = world.heightAt(ax, az);
    return;
  }
  var centerAim = pointerLocked || gpAiming;
  var nx = centerAim ? 0 : (mouseX / Ww * 2 - 1);
  var ny = centerAim ? 0 : -(mouseY / Hh * 2 - 1);
  var f = 1 / Math.tan(camFov / 2), asp = Ww / Hh;
  var fx = -VM[8], fy = -VM[9], fz = -VM[10];  /* forward = -col2 */
  var rx = VM[0], ry = VM[1], rz = VM[2];      /* right  =  col0 */
  var ux = VM[4], uy = VM[5], uz = VM[6];      /* up     =  col1 */
  var sx2 = nx * asp / f, sy2 = ny / f;
  var dx = fx + rx * sx2 + ux * sy2, dy = fy + ry * sx2 + uy * sy2, dz = fz + rz * sx2 + uz * sy2;
  var dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  var ox = camX, oy = camY, oz = camZ;
  /* never target anything between the camera and Riley — goblins at his back
     are what the offscreen arrows are for */
  var tMin = Math.max(1.0, Math.hypot(R.x - ox, R.y - oy, R.z - oz) * 0.82);

  /* 1. heightfield: accelerating march + bisection => exact ground mark */
  var tHit = 0, t = tMin, step = 0.7, prevT = tMin, MAXT = 52;
  for (var i = 0; i < 70; i++, t += step) {
    if (t > MAXT) { tHit = MAXT; break; }
    var qx = ox + dx * t, qy = oy + dy * t, qz = oz + dz * t;
    if (qy < -34) break;
    if (qy <= world.heightAt(qx, qz)) {
      var lo = prevT, hi = t;
      for (var bI = 0; bI < 7; bI++) {
        var mid = (lo + hi) * 0.5;
        var mx2 = ox + dx * mid, my2 = oy + dy * mid, mz2 = oz + dz * mid;
        if (my2 <= world.heightAt(mx2, mz2)) hi = mid; else lo = mid;
      }
      tHit = hi; break;
    }
    prevT = t; step = Math.min(2.6, step * 1.22);
  }
  if (!tHit) tHit = MAXT;

  /* 2. enemies: two stacked spheres per goblin = a capsule, exact hit test */
  var bestE = null, bestT = tHit;
  for (var e = 0; e < enemies.length; e++) {
    var en = enemies[e];
    if (en.dead) continue;
    var rr = en.r + 0.42;
    var t1 = raySphereT(ox, oy, oz, dx, dy, dz, en.x, en.y + en.h * 0.36, en.z, rr);
    var t2 = raySphereT(ox, oy, oz, dx, dy, dz, en.x, en.y + en.h * 0.86, en.z, rr * 0.82);
    var tt = t1 > tMin ? t1 : 1e9;
    if (t2 > tMin && t2 < tt) tt = t2;
    if (tt < bestT) { bestT = tt; bestE = en; }
  }
  if (bestE) {
    aim.x = bestE.x; aim.z = bestE.z;
    aim.y = world.heightAt(bestE.x, bestE.z) + bestE.h * 0.5;
    aim.lock = bestE;
    return;
  }
  var hx = ox + dx * tHit, hz = oz + dz * tHit;
  aim.x = hx; aim.z = hz; aim.y = world.heightAt(hx, hz);

  /* 3. soft aim assist: a goblin's chest inside a distance-scaled cone of the
     firing line gets pulled *toward*, never teleported to — a hard snap reads
     as the game taking the mouse away from you */
  var bestA = null, bestScore = 0;
  var hdx = hx - R.x, hdz = hz - R.z;
  var hl = Math.hypot(hdx, hdz);
  if (hl > 0.5) {
    hdx /= hl; hdz /= hl;
    for (var a2 = 0; a2 < enemies.length; a2++) {
      var ea = enemies[a2];
      if (ea.dead) continue;
      var adx = ea.x - R.x, adz = ea.z - R.z;
      var ad = Math.hypot(adx, adz);
      if (ad < 1.3 || ad > 30) continue;
      var cosA = (adx / ad) * hdx + (adz / ad) * hdz;
      var tol = 0.978 - clamp(ad / 30, 0, 1) * 0.012;   /* ~12° near, 9° far */
      if (cosA < tol) continue;
      var sc = (cosA - tol) / (1 - tol) - ad / 260;
      if (sc > bestScore) { bestScore = sc; bestA = ea; aim.dot = cosA; }
    }
  }
  if (bestA) {
    aim.assist = bestA;
    var w = clamp(bestScore * 0.9, 0, 1) * 0.7;
    aim.x = lerp(aim.x, bestA.x, w);
    aim.z = lerp(aim.z, bestA.z, w);
    aim.y = lerp(aim.y, world.heightAt(bestA.x, bestA.z) + bestA.h * 0.45, w);
  }
}
/* ================================================================
 * 8. player
 * ================================================================ */
/* temporary power-up buffs: seconds remaining on each (damage / speed / mana regen) */
var buffs = { dmg: 0, spd: 0, regen: 0 };
var BUFF_MAX = { dmg: 9, spd: 9, regen: 6 };
function buffMul() {
  /* pickups give the temporary buffs, boons (12b) the permanent ones, and
     every damage/speed number in the game goes through this one door */
  return {
    dmg: (buffs.dmg > 0 ? 1.35 : 1) * B.dmg * (game.lastStand ? 1.25 : 1),
    spd: (buffs.spd > 0 ? 1.22 : 1) * B.spd,
    regen: (buffs.regen > 0 ? 2.5 : 1) * B.regen
  };
}
var DASH_CD = 0.52;        /* the HUD reads this to draw the charge bar */
var JUMP_V = 14.4, JUMP_V2 = 13.2, GRAV = 42;
function newRiley() {
  var r = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: Math.PI, run: 0, air: 0, ground: true,
    dashT: 0, dashCd: 0, dashDX: 0, dashDZ: 0, dashing: false, jumpBuf: 0, coyote: 0,
    kbx: 0, kbz: 0, kbT: 0,
    inv: 0, dodgeT: 0, hitT: 0, rope: 0, shootCd: 0, shootAnim: 0, ph: 0,
    mo: 0, landT: 0, tilt: 0,
    mana: 0, manaMax: 100, charge: 0, charging: false, fireHeldT: 0,
    novaFx: 0, sideFlip: 1, meleeT: 0, meleeCd: 0, meleeWin: 0, meleeN: 0
  };
  /* render-state (interpolated between fixed sim poses) */
  r.prx = r.pry = r.prz = 0; r.pryaw = r.yaw;
  r.rx = r.x; r.ry = r.y; r.rz = r.z; r.ryaw = r.yaw;
  return r;
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
  if (meleeNow) inp.melee = true;
  return inp;
}
var fireNow = false, jumpNow = false, dashNow = false, novaNow = false, meleeNow = false;
var meleePulse = 0;                /* one-frame melee taps from a key / button */

function stepPlayer(inp) {
  /* inp comes through the netcode session — identical path in future MP */
  var mvx = inp.x / 8, mvz = inp.y / 8;
  var ml = Math.hypot(mvx, mvz);
  if (ml > 1) { mvx /= ml; mvz /= ml; }
  var walking = ml > 0.05;
  var fr = dt;                                  /* sim tick (always 1/60) */
  var faceTarget = 0;

  R.jumpBuf = Math.max(0, R.jumpBuf - fr);
  R.coyote = Math.max(0, R.coyote - fr);
  if (R.ground) R.coyote = 0.12;
  R.inv = Math.max(0, R.inv - fr);
  R.dodgeT = Math.max(0, R.dodgeT - fr);
  R.hitT = Math.max(0, R.hitT - fr);
  R.dashCd = Math.max(0, R.dashCd - fr);
  R.shootCd = Math.max(0, R.shootCd - fr);
  R.shootAnim = Math.max(0, R.shootAnim - fr);
  R.meleeCd = Math.max(0, R.meleeCd - fr);
  R.meleeT = Math.max(0, R.meleeT - fr);
  R.meleeWin = Math.max(0, R.meleeWin - fr);
  if (R.meleeWin <= 0) R.meleeN = 0;
  R.landT = Math.max(0, R.landT - fr);
  R.kbT = Math.max(0, R.kbT - fr);
  if (R.novaFx > 0) R.novaFx -= fr;
  /* buff timers */
  if (buffs.dmg > 0) buffs.dmg = Math.max(0, buffs.dmg - fr);
  if (buffs.spd > 0) buffs.spd = Math.max(0, buffs.spd - fr);
  if (buffs.regen > 0) buffs.regen = Math.max(0, buffs.regen - fr);
  /* last stand: on the last heart the wizard hits back harder — a comeback
     mechanic, and it makes the final heart a real fight instead of a wait */
  game.lastStand = game.lives === 1 && state === 'play';

  /* face the aim point while firing / locked; otherwise face movement */
  var aimX = aim.x - R.x, aimZ = aim.z - R.z;
  var al = Math.hypot(aimX, aimZ) || 1;
  aimX /= al; aimZ /= al;
  if (lockOn || inp.fire || R.charging || R.shootAnim > 0 || R.meleeT > 0) {
    faceTarget = Math.atan2(aimX, aimZ);
    R.yaw = angLerp(R.yaw, faceTarget, 1 - Math.exp(-fr * 20));
  } else if (walking) {
    faceTarget = Math.atan2(mvx, mvz);
    R.yaw = angLerp(R.yaw, faceTarget, 1 - Math.exp(-fr * 15));
  }

  /* dash */
  if (inp.dash && R.dashCd <= 0 && !R.dashing) {
    sfx('dash');
    var dd0 = walking ? mvx : aimX, dd1 = walking ? mvz : aimZ;
    var dl = Math.hypot(dd0, dd1) || 1;
    R.dashDX = dd0 / dl; R.dashDZ = dd1 / dl;
    R.dashing = true; R.dashT = 0.17; R.dashCd = dashCdMax();
    R.inv = Math.max(R.inv, 0.3); R.dodgeT = 0.34;   /* the perfect-dodge window */
    R.vy = Math.max(R.vy, R.ground ? 0 : 1.2);       /* air-dash holds you up */
    burst(R.x, R.y + 0.7, R.z, [130, 210, 255], 12, 5, 1.5, 0.3, 0.4);
    camKick(0, 0.018, 0);
    if (R.meleeT > 0) { R.meleeT = 0; R.dashCd = 0.3; }  /* dash cancels a swing */
  }
  if (R.dashing) {
    R.dashT -= fr;
    R.vx = R.dashDX * 29; R.vz = R.dashDZ * 29;
    ringBurst(R.x, R.y + 0.3, R.z, [150, 220, 255], 2);
    if (R.dashT <= 0) { R.dashing = false; }
  } else {
    /* acceleration-based movement: snappy on ground, floaty control in air.
       exp() damping = the same feel at any tick rate, and it never overshoots
       (min(1, k*dt) both overshoots and dies on a stutter frame). */
    var walkSpd = 10.2 * buffMul().spd * (game.lastStand ? 1.07 : 1);
    /* momentum: a straight run builds to a jog, strafing stays honest */
    if (walking && R.ground && Math.abs(angDiff(R.yaw, Math.atan2(mvx, mvz))) < 0.5) {
      R.mo = Math.min(1, R.mo + fr * 1.6);
    } else R.mo = Math.max(0, R.mo - fr * 2.4);
    walkSpd *= 1 + R.mo * 0.14;
    var tvx = mvx * walkSpd, tvz = mvz * walkSpd;
    var k = R.ground ? (walking ? 17 : 22) : 9.5;
    var a = 1 - Math.exp(-fr * k);
    R.vx += (tvx - R.vx) * a;
    R.vz += (tvz - R.vz) * a;
    /* knockback impulse decays out of the velocity over ~0.3s */
    if (R.kbT > 0) {
      R.vx += R.kbx * fr * 34; R.vz += R.kbz * fr * 34;
      var kdec = Math.exp(-fr * 3.4);
      R.kbx *= kdec; R.kbz *= kdec;
    } else { R.kbx = 0; R.kbz = 0; }
  }

  /* jump / double jump */
  if (inp.jump) R.jumpBuf = 0.14;
  if (R.jumpBuf > 0 && (R.ground || R.coyote > 0)) {
    R.vy = JUMP_V * B.jumpK; R.ground = false; R.coyote = 0; R.jumpBuf = 0; R.air = 1;
    ringBurst(R.x, R.y + 0.05, R.z, [220, 235, 255], 3);
    sfx('jump');
  } else if (R.jumpBuf > 0 && R.air === 1) {
    R.vy = JUMP_V2 * B.jumpK; R.air = 2; R.jumpBuf = 0;
    ringBurst(R.x, R.y + 0.1, R.z, [120, 220, 255], 4);
    sfx('djump');
  }

  /* arena rope: this is a siege, not an open-field chase. Beyond the rope the
     ground pulls you back toward the fight, so "run into the hills and snipe
     them one at a time" stops being the optimal (and boring) strategy. */
  var ropeR = ARENA_R + 17;
  var cD = Math.hypot(R.x, R.z);
  if (cD > ropeR) {
    var over = Math.min(1, (cD - ropeR) / 15);
    R.vx -= (R.x / cD) * over * 30 * fr;
    R.vz -= (R.z / cD) * over * 30 * fr;
    if (R.rope < 0.05) { showBanner('BACK TO THE ARENA', 'THE TIDE WAITS FOR NO ONE'); sfx('low'); }
    R.rope = Math.min(1, R.rope + fr * 3);
  } else R.rope = Math.max(0, R.rope - fr * 4);

  /* gravity: lighter near the apex so the arc reads, harder when you let go */
  R.vy -= (GRAV - (Math.abs(R.vy) < 3.5 ? 12 : 0)) * fr;
  if (R.vy < -36) R.vy = -36;
  if (!R.ground && R.vy < 0 && !inp.jump) R.vy -= 11 * fr; /* variable jump height */
  var fallSpd = R.vy;
  var wasAir = !R.ground;

  /* integrate with sub-stepped ground collision (60Hz tick, 2 substeps) */
  var sub = 2;
  for (var s = 0; s < sub; s++) {
    R.x += R.vx * fr / sub;
    R.z += R.vz * fr / sub;
    R.y += R.vy * fr / sub;
    R.ground = false;
    var gy = groundY(R.x, R.z);
    if (R.vy <= 2 && R.y <= gy) { R.y = gy; R.vy = 0; R.ground = true; R.air = 0; }
    else if (R.ground === false && R.y < gy + 0.12 && R.vy > 0 && world.slopeAt(R.x, R.z) > 0.85) {
      /* bonk steep lips instead of tunneling up them */
      R.vy = Math.min(R.vy, 2);
    }
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
    R.landT = 0.22;
    /* slam: a *committed* drop (from a hill, a double jump, a nova launch)
       becomes a shockwave. Free on landing, so it rewards using the terrain
       instead of staying flat-footed in the middle of the arena. */
    if (fallSpd < -21) {
      var sr = 3.6, hits = 0;
      for (var li = 0; li < enemies.length; li++) {
        var le = enemies[li];
        if (le.dead) continue;
        var ldx = le.x - R.x, ldz = le.z - R.z, ld = Math.hypot(ldx, ldz);
        if (ld < sr && Math.abs(le.y - R.y) < 2.6) {
          var lnl = ld || 1;
          le.vx += ldx / lnl * 13; le.vz += ldz / lnl * 13; le.vy = Math.max(le.vy, 4.2);
          damageGob(le, 2 * buffMul().dmg, ldx, ldz);
          hits++;
        }
      }
      ringBurst(R.x, R.y + 0.1, R.z, [255, 230, 160], 5);
      burst(R.x, R.y + 0.1, R.z, [200, 210, 240], 14, 7, 1.6, 0.2, 0.5);
      shake(0.28); camKick(0, -0.03, 0);
      sfx('smash');
      if (hits) { R.mana = Math.min(R.manaMax, R.mana + 6 * hits); doHitStop(0.04); }
    }
  }
  if (R.ground && walking && !R.dashing) {
    R.run += fr * (9 + R.mo * 2.2);
    if (Math.floor(R.run / Math.PI) !== Math.floor((R.run - fr * 9) / Math.PI) && rnd2(0, 1) < 0.6) {
      fxPush({ x: R.x + rnd2(-0.15, 0.15), y: R.y + 0.03, z: R.z + rnd2(-0.15, 0.15), vx: 0, vy: rnd2(0.6, 1.3), vz: 0, life: 0.5, max: 0.5, s: rnd2(0.05, 0.09), pr: 200, pg: 210, pb: 230, pa: 0.35, grav: 0.5 });
    }
  } else if (R.ground) {
    R.run *= Math.exp(-fr * 6);
  }
  /* body lean: bank into the turn / strafe (render-only, but derived from
     sim velocity so every host agrees) */
  var latV = R.vx * Math.cos(R.yaw) - R.vz * Math.sin(R.yaw);
  R.lean = damp(R.lean, clamp(latV / 11, -1, 1) * (R.ground ? 0.26 : 0.14), R.ground ? 9 : 4, fr);

  /* fire: quick shots while held; charge after 0.24s of holding */
  if (inp.fire) {
    R.fireHeldT += fr;
    if (R.fireHeldT > 0.24) {
      R.charging = true;
      R.charge += fr;
      if (rnd2(0, 1) < 0.5) {
        var cx = R.x + aimX * 0.7, cz = R.z + aimZ * 0.7;
        fxPush({ x: cx + rnd2(-0.3, 0.3), y: R.y + 1 + rnd2(-0.2, 0.3), z: cz + rnd2(-0.3, 0.3), vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, s: rnd2(0.06, 0.14), pr: 255, pg: 210, pb: 110, pa: 0.8, grav: 0 });
      }
    } else if (R.shootCd <= 0 && R.fireHeldT > 0.005) {
      /* point-blank auto-smash stays (it saves newbies), but never over a
         real shot: if the reticle is holding a goblin further than arm's
         reach, fire the bolt you actually aimed at */
      var nearB = nearMeleeTarget();
      if (nearB) meleeSwing(nearB); else fireShot();
    }
  } else {
    if (R.charging) releaseCharge();
    R.charge = 0; R.charging = false; R.fireHeldT = 0;
  }
  /* dedicated melee: right mouse / F — always a swing, never a shot */
  if (inp.melee && R.meleeCd <= 0) meleeSwing(null);
  R.mana = Math.min(R.manaMax, R.mana + fr * 4.8 * ((buffs.regen > 0 ? 2.5 : 1) * B.regen));

  /* nova */
  if (inp.nova && R.mana >= R.manaMax) castNova();
}
function rnd2(a, b) { return a + (tickRand ? tickRand() : Math.random()) * (b - a); }

/* ================================================================
 * 9. combat
 * ================================================================ */
/* Who is close enough to smack right now? Used by the fire button so that
   standing in a goblin's armpit and clicking gives you a staff butt instead
   of a point-blank bolt — but a *real* aimed shot always wins. */
function nearMeleeTarget() {
  var best = null, bd = 1e9;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var dx = e.x - R.x, dz = e.z - R.z, d = Math.hypot(dx, dz);
    if (d > e.r + 1.7 || Math.abs(e.y - R.y) > 2.2) continue;
    var face = Math.sin(R.yaw) * (dx / (d || 1)) + Math.cos(R.yaw) * (dz / (d || 1));
    if (face < 0.1 && d > 1.05) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ---------------------------------------------------------------------------
 * MELEE — a 3-hit chain: smack, smack, SPIN.
 *
 *   * the chain only advances when a swing *connects*, so mashing into thin
 *     air costs you a longer recovery instead of extending the window;
 *   * the finisher is a 360° cleave that launches everything nearby — that is
 *     the panic button when the tide closes in, and the reason you sometimes
 *     want to be caught rather than shooting from the rim;
 *   * every hit feeds mana, so aggressive play keeps the nova lit.
 * ------------------------------------------------------------------------- */
function nearestMelee(range) {
  var best = null, bd = 1e9;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var d = Math.hypot(e.x - R.x, e.z - R.z);
    if (d > range + e.r || Math.abs(e.y - R.y) > 2.3) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function meleeSwing(prefetch) {
  if (R.meleeCd > 0 || state !== 'play') return false;
  var n = R.meleeN | 0;
  var fin = n === 2;
  var reach = (fin ? 2.5 : 2.0) + B.reach;
  var arc = fin ? 3.2 : 1.2;                       /* half-angle, radians */
  var dmg = (fin ? 4.5 : 2.2) * buffMul().dmg;
  /* soft lock: turn to meet whoever is closest before the swing lands. A combo
     that drops because your aim was 3 degrees off feels broken, not hard. */
  if (!fin) {
    var t0 = prefetch || nearestMelee(reach);
    if (t0) R.yaw = Math.atan2(t0.x - R.x, t0.z - R.z);
  }
  var step = fin ? 1.6 : 2.1;
  R.vx += Math.sin(R.yaw) * step; R.vz += Math.cos(R.yaw) * step;
  if (fin && R.ground) R.vy = Math.max(R.vy, 2.2);
  var hits = 0, hx = 0, hz = 0;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var dx = e.x - R.x, dz = e.z - R.z, d = Math.hypot(dx, dz);
    if (d > e.r + reach || Math.abs(e.y - R.y) > 2.3) continue;
    if (!fin && Math.abs(angDiff(Math.atan2(dx, dz), R.yaw)) > arc && d > 1.05) continue;
    if (prefetch && e !== prefetch && d > 1.3) continue;   /* auto-smash stays single target */
    damageGob(e, dmg, dx, dz);
    var nl = d || 1;
    if (fin) {
      e.vx = dx / nl * 16; e.vz = dz / nl * 16;
      e.vy = Math.max(e.vy, 5.2);
      e.stun = Math.max(e.stun || 0, 0.34);
    } else {
      /* jabs must NOT launch: damageGob's flat knockback would slide the target
         out of reach and kill the chain. Hold them on the end of the stick. */
      e.vx = dx / nl * 2.2; e.vz = dz / nl * 2.2;
      e.vy = Math.max(e.vy, 0.4);
    }
    if (!hits) { hx = dx; hz = dz; }
    hits++;
    if (!fin && hits >= 1) break;
  }
  R.meleeT = fin ? 0.3 : 0.19;
  R.shootAnim = Math.max(R.shootAnim, 0.16);
  if (hits) {
    R.meleeCd = fin ? 0.44 : 0.2;
    R.meleeWin = 0.62;                       /* keep tapping to keep chaining */
    R.meleeN = fin ? 0 : n + 1;
    R.mana = Math.min(R.manaMax, R.mana + (fin ? 10 : 3.5));
    var cx2 = R.x + (hx / (Math.hypot(hx, hz) || 1)) * 0.9;
    var cz2 = R.z + (hz / (Math.hypot(hx, hz) || 1)) * 0.9;
    ringBurst(cx2, R.y + 1.05, cz2, fin ? [255, 170, 70] : [255, 210, 90], fin ? 6 : 4);
    shake(fin ? 0.34 : 0.2);
    camKick(rnd2(-0.025, 0.025), fin ? -0.05 : -0.028, rnd2(-0.03, 0.03) + (fin ? 0.05 : 0));
    sfx('smash');
    if (fin) { doHitStop(0.055); if (hits > 1) popText(R.x, R.y + 2, R.z, hits + ' CLEAVE', false, '#ffd27a'); }
  } else {
    R.meleeCd = 0.34;                        /* whiff punish: on yourself */
    R.meleeN = 0;
    sfx('shoot');
  }
  return hits > 0;
}
function shotAimDir() {
  var ax = aim.x - R.x, az = aim.z - R.z;
  var l = Math.hypot(ax, az);
  if (l < 0.35) { ax = Math.sin(R.yaw); az = Math.cos(R.yaw); l = 1; }
  ax /= l; az /= l;
  var ty = aim.y, hd = l, snapped = !!aim.lock;
  if (!aim.lock) {
    /* soft aim assist: if a goblin chest sits within ~6.5° of the firing
       line, snap the shot at it — quick shots land at rush angles now */
    var bestE = null, bestCos = 0.9936;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.x - R.x, dz = e.z - R.z, d = Math.hypot(dx, dz);
      if (d < 1.4 || d > 34) continue;
      var cosA = (dx / d) * ax + (dz / d) * az;
      if (cosA > bestCos) { bestCos = cosA; bestE = e; }
    }
    if (bestE) {
      ax = bestE.x - R.x; az = bestE.z - R.z;
      hd = Math.hypot(ax, az) || 1;
      ax /= hd; az /= hd;
      ty = bestE.y + bestE.h * 0.6;
      snapped = true;
    }
  }
  /* shots fly straight (no gravity): slope the velocity so it arrives at
     the aim height — flat shots no longer dive into the dirt short */
  var ay = (ty - (R.y + 1.05)) / Math.max(hd, 2) * 28;
  ay = snapped ? clamp(ay, -9, 11) : clamp(ay, -6, 3.5);
  return { x: ax, y: ay, z: az };
}
function fireShot() {
  R.shootCd = 0.14 * B.cast; R.shootAnim = 0.14;
  var d = shotAimDir();
  var sx = R.x + d.x * 0.7, sy = R.y + 1.05, sz = R.z + d.z * 0.7;
  var dm = buffMul().dmg;
  var col = dm > 1 ? [255, 226, 130] : [255, 190, 90];
  shots.push({ x: sx, y: sy, z: sz, vx: d.x * 28, vy: d.y, vz: d.z * 28, life: 1.5, r: 0.16 + (dm > 1 ? 0.03 : 0), big: false, dmg: dm, pierce: 1, col: col, hitSet: null });
  burst(sx, sy, sz, [255, 200, 80], 5, 3, 0, 0.14, 0.25);
  sfxGated('shoot');
}
/* charge curve, in one place: hold 0.24s to start charging, the bolt reaches
   tier 1 at CHARGE_T and full (tier 2) at CHARGE_T + CHARGE_SPAN. */
var CHARGE_T = 0.28, CHARGE_SPAN = 0.72;
function chargePct() { return R ? clamp((R.charge - CHARGE_T) / CHARGE_SPAN, 0, 1) : 0; }
function releaseCharge() {
  var pw = chargePct();
  if (pw < 0.12) { fireShot(); return; }
  R.shootCd = 0.3 * B.cast; R.shootAnim = 0.28;
  var tier = pw >= 0.85 ? 2 : 1;
  var dm = buffMul().dmg;
  var d = shotAimDir();
  var ax = d.x, az = d.z;
  var sx = R.x + ax * 0.8, sy = R.y + 1.05, sz = R.z + az * 0.8;
  shots.push({
    x: sx, y: sy, z: sz, vx: ax * 27, vy: d.y, vz: az * 27, life: 1.8,
    r: (tier === 2 ? 0.42 : 0.3) * (dm > 1 ? 1.15 : 1), big: true, dmg: (tier === 2 ? 6 : 3) * dm,
    pierce: (tier === 2 ? 3 : 1) + B.pierce, col: tier === 2 ? [180, 120, 255] : [255, 140, 60], hitSet: null
  });
  burst(sx, sy, sz, tier === 2 ? [190, 130, 255] : [255, 170, 70], tier === 2 ? 22 : 14, 7, 0, 0.28, 0.5);
  ringBurst(sx, sy, sz, tier === 2 ? [200, 150, 255] : [255, 180, 90], 4);
  shake(tier === 2 ? 0.42 : 0.2);
  camKick(0, tier === 2 ? -0.055 : -0.026, 0);
  if (tier === 2) doHitStop(0.045);
  sfx(tier === 2 ? 'boss' : 'smash');
}
function castNova() {
  R.mana = 0; R.novaFx = 0.6;
  R.inv = Math.max(R.inv, 0.7); /* brief invulnerability — nova is the panic button */
  shake(0.75); doHitStop(0.07); camKick(0, -0.06, 0.02);
  for (var ri = 0; ri < 3; ri++) ringBurst(R.x, R.y + 0.4, R.z, [150, 210, 255], 6 + ri * 3);
  burst(R.x, R.y + 0.8, R.z, [170, 140, 255], 40, 12, 1.5, 0.4, 0.9);
  burst(R.x, R.y + 0.8, R.z, [120, 220, 255], 26, 9, 1.2, 0.3, 0.8);
  sfx('nova');
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var d = Math.hypot(e.x - R.x, e.z - R.z);
    if (d < 13) {
      var dmg = (e.k === 'boss' ? 5 : 8) * buffMul().dmg;
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
        var hr = en.r + 0.55 + (s.big ? 0.28 : 0);
        if (s.x > en.x - hr && s.x < en.x + hr && s.z > en.z - hr && s.z < en.z + hr && s.y > en.y && s.y < en.y + en.h + 0.2) {
          damageGob(en, s.dmg, s.vx, s.vz);
          R.mana = Math.min(R.manaMax, R.mana + (s.big ? 8 : 5));
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
var SPAWN_T = 0.42;                  /* materialise time: visible, harmless */
function newGob(k, x, y, z, idx) {
  var t = EN_K[k];
  var g = A.spawnGenome(bestiary, k, tickRand, game.wave);
  gobId++;
  var e = {
    id: gobId,
    x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, k: k,
    hp: t.hp, hpMax: t.hp, r: t.r, h: t.h, s: t.s * (k === 'boss' ? 1 : rnd2(0.88, 1.14)),
    sc: t.sc, shade: k === 'boss' ? 1 : rnd2(0.88, 1.16), elite: false,
    yaw: Math.atan2(R.x - x, R.z - z), run: 0, ph: rnd2(0, 9),
    hitT: 0, dead: false, tele: 0, actT: 0, actCd: rnd2(0.6, 2.2), actKind: 'none',
    stun: 0, slamCd: 6, recT: 0, spitT: 0, spawnT: SPAWN_T, dieT: 0, dieSpin: 0,
    spitCd: rnd2(0.8, 2.2), roarT: 5, enrage: false,
    spd: t.spd * rnd2(0.88, 1.12),
    dmgTaken: 0, dmgDealt: 0, kills: 0, lifeSec: 0, hitsTaken: 0, gemsStolen: 0,
    /* theft: a goblin that grabs an uncollected gem runs for a portal with it */
    stolen: null, stealT: 0,
    aiPhase: (idx || 0) % 8, sideT: rnd2(2, 5), side: 1,
    mvx: 0, mvz: 0, mAct: 'idle',
    /* render-only feel: squash/pop on hit, death lean, telegraph dip */
    flinch: 0, popY: 0, lean: 0
  };
  e.brain = A.makeBrain(k, g);
  e.genome = g;
  e.prx = e.x; e.pry = e.y; e.prz = e.z; e.pryaw = e.yaw;
  e.rx = e.x; e.ry = e.y; e.rz = e.z; e.ryaw = e.yaw;
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
    dy: (R.y + 1.0) - (e.y + e.h * 0.55),
    hpFrac: e.hp / e.hpMax,
    dmgTaken: e.dmgTaken,
    threat: threat,
    time: e.lifeSec,
    side: e.side,
    atkRange: atkRange,
    rangeNear: spec.range ? spec.range[0] : 0,
    rangeFar: spec.range ? spec.range[1] : 99
  };
}
/* Neural brains tick at a staggered 8 Hz — each goblin thinks on its own
 * frame phase (e.aiPhase), so 60 enemies still cost only ~8 net evals per
 * tick. Cooldown timers below are decremented by dt*8 to compensate. */
function updateEnemyBrain(e) {
  if (frame % 8 !== e.aiPhase) return;
  var sen = enemySensor(e);
  var act = e.brain.tick(sen);
  e.mvx = act.mvx; e.mvz = act.mvz * e.side; e.mAct = act.act; e.atkOut = act.atk;
  e.dmgTaken = Math.max(0, e.dmgTaken - 0.12);
  var spec = EN_K[e.k];
  var d = sen.dist;
  /* attack execution (stunned goblins can't act).
     NOTE: this path runs at a staggered 8 Hz, so cooldown timers are
     decremented by dt*8 — one real second per second of game time. */
  e.actCd -= dt * 8;
  if (act.act === 'attack' && e.actCd <= 0 && e.stun <= 0 && e.recT <= 0) {
    if (e.k === 'spitter') {
      if (d > spec.range[0] && d < spec.range[1]) {
        /* wind up, then fire — a spitter that hits you before you see the
           purple flare is not a ranged enemy, it is a coin flip */
        e.spitT = 0.3;
        e.tele = 0.3;
        e.yaw = Math.atan2(R.x - e.x, R.z - e.z);
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
        e.actCd = spec.lungeCd * (e.k === 'boss' ? (e.enrage ? 0.7 : 0.8) : 1);
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
    e.roarT -= dt * 8;
    if (e.roarT <= 0 && e.hp < e.hpMax * 0.8) {
      e.roarT = 9;
      var nm = Math.min(2 + Math.floor(game.wave / 5), 4);
      for (var m = 0; m < nm; m++) {
        var a = tickRand() * TAU, rr = rnd2(2.5, 4.5);
        var g = newGob(tickRand() < 0.5 ? 'grunt' : 'runner', e.x + Math.cos(a) * rr, 0, e.z + Math.sin(a) * rr, enemies.length + m);
        g.y = world.heightAt(g.x, g.z);
        syncPrev(g);
        enemies.push(g);
        ringBurst(g.x, g.y + 0.1, g.z, [180, 240, 255], 2);
      }
      popText(e.x, e.y + e.h + 1.4, e.z, 'COME, MINIONS!', true, '#9fe8ff');
      sfx('roar');
    }
    /* enrage: ground-pound AoE slam when the player camps close */
    if (e.enrage && e.stun <= 0) {
      e.slamCd -= dt * 8;
      if (e.slamCd <= 0 && d < spec.melee + 1.8 && e.actKind !== 'slam' && e.actKind !== 'smash') {
        e.actKind = 'slam'; e.actT = 0.5;
        e.slamCd = 5 + tickRand() * 3;
        e.yaw = Math.atan2(R.x - e.x, R.z - e.z);
        sfx('low');
      }
    }
  }
}
/* spitFire: the projectile is created when the wind-up *ends*, aimed at where
   Riley is then — the telegraph is honest, the lead is only 85%. */
function spitFire(e) {
  var spec = EN_K[e.k];
  var dx = R.x - e.x, dz = R.z - e.z;
  var d = Math.hypot(dx, dz) || 0.001;
  var BL = spec.bl || 8.5;
  var leadT = d / BL;
  var tdx = (R.x + R.vx * leadT * 0.85) - e.x;
  var tdz = (R.z + R.vz * leadT * 0.85) - e.z;
  var td = Math.hypot(tdx, tdz) || 0.001;
  e.yaw = Math.atan2(tdx, tdz);
  eShots.push({ x: e.x + tdx / td * 0.5, y: e.y + e.h * 0.85, z: e.z + tdz / td * 0.5,
    vx: tdx / td * BL, vy: (R.y + 0.8 - e.y - e.h * 0.85) / Math.max(d, 2) * BL + 0.9, vz: tdz / td * BL,
    life: 2.6, r: 0.2, col: [170, 90, 255], from: e });
  sfx('spit');
}

function livingCount() {
  var n = 0;
  for (var i = 0; i < enemies.length; i++) if (!enemies[i].dead) n++;
  return n;
}
function updateEnemies(dtU) {
  /* spawn queue — the drip speeds up with the wave but the arena keeps a cap
     so a tide never becomes an unreadable dogpile (and the frame stays fast) */
  if (game.waveState === 'combat') {
    if (game.spawnQueue.length) {
      var cap = Math.min(7 + Math.floor(game.wave * 0.9), 15);
      game.spawnT -= dtU;
      if (game.spawnT <= 0 && livingCount() < cap) {
        game.spawnT = Math.max(0.34, 0.8 - game.wave * 0.035);
        placeGoblin(game.spawnQueue.shift());
      }
    } else if (!livingCount()) {
      waveClear();
    }
  } else if (game.waveState === 'clear') {
    game.clearT -= dtU;
    if (game.clearT <= 0) nextWave();
  }
  /* brains — corpses are bodies now, they don't think (and skipping them keeps
     a kill from spending AI work for half a second) */
  for (var i = 0; i < enemies.length; i++) if (!enemies[i].dead && enemies[i].spawnT <= 0) updateEnemyBrain(enemies[i]);

  enemyGrid.clear();
  for (var i2 = 0; i2 < enemies.length; i2++) {
    var e = enemies[i2];
    if (!e.dead) enemyGrid.insert(e.x, e.z, e);
  }
  /* Goblins are thieves: loot left on the floor gets picked up and run for a
     portal with, which turns "vacuum the gems" into a decision — take yours
     now, or shoot the one who takes them. Kill a thief and it hands everything
     back with a finder's bonus. Driven from the pickup side and through the
     enemy grid, so the cost follows how much loot is lying about, not how many
     goblins are on the field; a goblin mid-wind-up never breaks its attack to
     grab, and one that is staggered cannot grab either. */
  if (pickups.length && frame % 2 === 0) {
    for (var pi = pickups.length - 1; pi >= 0; pi--) {
      var pk = pickups[pi];
      if (pk.gr > 0) continue;
      enemyGrid.query(pk.x, pk.z, _qThief);
      var pdP = Math.hypot(pk.x - R.x, pk.z - R.z);
      for (var qi = 0; qi < _qThief.length; qi++) {
        var te = _qThief[qi];
        if (te.dead || te.gemsStolen >= 3 || te.spawnT > 0 || te.stun > 0 || te.tele > 0) continue;
        if (te.k === 'spitter' || te.k === 'brute' || te.k === 'boss') continue;
        /* quick fingers, but only from a goblin who has a better claim on it
           than you do: out-muscle it by getting there first */
        var td = Math.hypot(te.x - pk.x, te.z - pk.z);
        if (td > 2.2 || td > pdP * 0.85) continue;
        if (Math.abs(te.y - pk.y) > 1.9) continue;
        if (!te.stolen) te.stolen = [];
        te.stolen.push(pk.k);
        te.gemsStolen++;
        game.snatched++;
        te.stealT = 0.7;
        te.vy = Math.max(te.vy, 3.4);                /* a hop of pure delight */
        pickups.splice(pi, 1);
        popText(pk.x, pk.y + 0.75, pk.z, 'SNATCHED!', false, '#ffd75e');
        ringBurst(pk.x, pk.y + 0.1, pk.z, [255, 214, 94], 3);
        sfxGated('coin');
        break;
      }
    }
  }
  for (var i3 = 0; i3 < enemies.length; i3++) {
    var e3 = enemies[i3];
    if (e3.dead) { updateCorpse(e3, dtU); continue; }
    /* materialising: rooted, harmless, still hurtable — you can absolutely
       snipe a goblin out of the portal, which is the reward for watching them */
    if (e3.spawnT > 0) {
      e3.spawnT -= dtU;
      e3.vx *= 0.55; e3.vz *= 0.55;
      e3.run += dtU * 2;
      continue;
    }
    e3.hitT = Math.max(0, e3.hitT - dtU);
    e3.stun = Math.max(0, e3.stun - dtU);
    e3.recT = Math.max(0, e3.recT - dtU);
    e3.flinch = Math.max(0, e3.flinch - dtU * 5);
    e3.popY = damp(e3.popY, 0, 9, dtU);
    e3.lean = damp(e3.lean, clamp(e3.mvx, -1, 1) * 0.14 + (e3.recT > 0 ? 0.22 : 0), 7, dtU);
    e3.lifeSec += dtU;
    /* spitter wind-up expires here (per frame, not on the 8Hz brain tick) */
    if (e3.spitT > 0) {
      e3.spitT -= dtU;
      e3.actT = Math.max(0, e3.actT - dtU);
      if (e3.spitT <= 0) { e3.spitT = 0; spitFire(e3); }
    }
    /* deterministic strafe side-flip (kept out of the net for lockstep) */
    e3.sideT -= dtU;
    if (e3.sideT <= 0) { e3.side = -e3.side; e3.sideT = 1.5 + tickRand() * 2.5; }
    var spec = EN_K[e3.k];
    var dxp = R.x - e3.x, dzp = R.z - e3.z;
    var dp = Math.hypot(dxp, dzp) || 0.001;
    if (dp > 0.5) e3.yaw = angLerp(e3.yaw, Math.atan2(dxp, dzp), clamp(dtU * (e3.mAct === 'attack' ? 10 : 6), 0, 1));

    /* steering from the net output */
    var mvx = 0, mvz = 0;
    if (e3.stun > 0) {
      /* staggered: rooted in place, wobbly */
      e3.vx *= Math.max(0, 1 - dtU * 8);
      e3.vz *= Math.max(0, 1 - dtU * 8);
    } else if (e3.tele > 0) {
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
        e3.recT = 0.52;
        sfx('smash');
        ringBurst(e3.x, e3.y + 0.2, e3.z, [255, 140, 60], 7);
        shake(0.34);
        var fx2 = Math.sin(e3.yaw), fz2 = Math.cos(e3.yaw);
        var rdx = R.x - e3.x, rdz = R.z - e3.z;
        var rd = Math.hypot(rdx, rdz) || 1;
        var face = (rdx / rd) * fx2 + (rdz / rd) * fz2;
        if (rd < spec.melee + 1.4 && face > -0.3) hitRiley(e3);
        /* hits other goblins? no — friendly. hits player handled above */
        e3.actKind = 'none';
      }
    } else if (e3.actKind === 'slam' && e3.actT > 0) {
      /* boss ground-pound: 0.5s telegraph, then a wide radial shockwave */
      e3.actT -= dtU;
      e3.vx *= Math.max(0, 1 - dtU * 6);
      e3.vz *= Math.max(0, 1 - dtU * 6);
      if (e3.actT <= 0) {
        e3.recT = 0.6;
        sfx('smash');
        ringBurst(e3.x, e3.y + 0.2, e3.z, [255, 120, 60], 9);
        ringBurst(e3.x, e3.y + 0.2, e3.z, [255, 214, 94], 6);
        burst(e3.x, e3.y + 0.3, e3.z, [255, 150, 80], 16, 6, 2, 0.24, 0.5);
        shake(0.6); camKick(0, -0.06, 0);
        if (Math.hypot(R.x - e3.x, R.z - e3.z) < 4.8) hitRiley(e3);
        e3.actKind = 'none';
      }
    } else if (e3.actKind === 'lunge' && e3.actT > 0) {
      e3.actT -= dtU;
      if (e3.actT <= 0) { e3.actKind = 'none'; e3.recT = e3.k === 'boss' ? 0.26 : 0.36; }
    } else {
      /* net movement: mvx toward player, mvz strafe (side-flipped) */
      var fx3 = Math.sin(e3.yaw), fz3 = Math.cos(e3.yaw);
      var sx3 = Math.cos(e3.yaw), sz3 = -Math.sin(e3.yaw);
      var speed = e3.spd * (e3.k === 'boss' && e3.enrage ? 1.45 : 1) *
        (e3.recT > 0 ? 0.55 : 1) * (e3.gemsStolen > 0 ? 1.14 : 1);
      if (e3.mAct === 'flee') { mvx = -fx3 * speed; mvz = -fz3 * speed; }
      else if (e3.gemsStolen > 0) {
        /* carrying: head for the rim, not for her — this is the run you chase */
        var ffx = e3.x - R.x, ffz = e3.z - R.z, fl = Math.hypot(ffx, ffz) || 1;
        mvx = ffx / fl * speed; mvz = ffz / fl * speed;
      }
      else if (e3.gemsStolen === 0 && pickups.length && e3.spawnT <= 0) {
        /* Goblins sniff out loot. A grunt with empty pockets detours for
           anything lying about that he has a better claim on than she does —
           which is what makes an uncollected gem across the arena a reason to
           hurry, instead of decoration. Skipped while materialising or already
           carrying, so it never overrides an attack or a thief's escape run. */
        var lgx = 0, lgz = 0, lBest = 1e9, lHas = false;
        for (var li2 = 0; li2 < pickups.length; li2++) {
          var pl = pickups[li2];
          if (pl.gr > 0) continue;
          var ldx = pl.x - e3.x, ldz = pl.z - e3.z, ld2 = ldx * ldx + ldz * ldz;
          if (ld2 > 64) continue;                          /* 8u of nose */
          var lpx = pl.x - R.x, lpz = pl.z - R.z;
          if (ld2 > (lpx * lpx + lpz * lpz) * 0.72) continue;
          if (ld2 < lBest) { lBest = ld2; lgx = ldx; lgz = ldz; lHas = true; }
        }
        mvx = (e3.mvx * fx3 + e3.mvz * sx3) * speed;
        mvz = (e3.mvx * fz3 + e3.mvz * sz3) * speed;
        if (lHas) {
          var lgl = Math.hypot(lgx, lgz) || 1;
          mvx = mvx * 0.3 + lgx / lgl * speed * 0.7;
          mvz = mvz * 0.3 + lgz / lgl * speed * 0.7;
        }
      }
      else {
        mvx = (e3.mvx * fx3 + e3.mvz * sx3) * speed;
        mvz = (e3.mvx * fz3 + e3.mvz * sz3) * speed;
      }
      /* terrain steering: slow on steep ground, steer around hills on the
         gentler side (deterministic — derived from world + facing only) */
      if (e3.mAct === 'move' || e3.mAct === 'idle') {
        var aheadX = e3.x + fx3, aheadZ = e3.z + fz3;
        var slA = world.slopeAt(aheadX, aheadZ);
        if (slA > 0.95) { mvx *= 0.3; mvz *= 0.3; }
        else if (slA > 0.7) {
          var side1 = world.slopeAt(e3.x + sx3 * 1.7, e3.z + sz3 * 1.7);
          var side2 = world.slopeAt(e3.x - sx3 * 1.7, e3.z - sz3 * 1.7);
          var side = side1 <= side2 ? 1 : -1;
          mvx += sx3 * side * 0.75;
          mvz += sz3 * side * 0.75;
          var nl = Math.hypot(mvx, mvz);
          if (nl > 1) { mvx /= nl; mvz /= nl; }
        }
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
    if (e3.stealT > 0) e3.stealT -= dtU;
    if (e3.gemsStolen > 0 && ed > ARENA_R + 12.5) {
      /* gone. Cheap, but it stings — the whole point of leaving loot on the
         floor is that the floor is occupied */
      game.score = Math.max(0, game.score - 12 * e3.gemsStolen);
      game.lost += e3.gemsStolen;
      popText(e3.x, e3.y + e3.h + 1.2, e3.z, 'LOOT GONE!', true, '#ff8a6a');
      sfx('low');
      e3.gemsStolen = 0; e3.stolen = null;
    }

    /* contact with Riley: only an ACTIVE lunge hurts. Idle crowding just
       bumps both apart — telegraphed attacks you can actually dodge,
       instead of random touch-death from a goblin brushing past. */
    var rr2 = e3.r + 0.55;
    if (Math.abs(e3.x - R.x) < rr2 && Math.abs(e3.z - R.z) < rr2 && R.y + RHEIGHT > e3.y + 0.1 && R.y < e3.y + e3.h - 0.1) {
      if (e3.actKind === 'lunge' && e3.actT > 0 && e3.tele <= 0) hitRiley(e3);
      else if (!e3.dead) {
        var bdx = e3.x - R.x, bdz = e3.z - R.z, bdl = Math.hypot(bdx, bdz) || 1;
        e3.vx += bdx / bdl * 3.2; e3.vz += bdz / bdl * 3.2;
        R.vx -= bdx / bdl * 2.4; R.vz -= bdz / bdl * 2.4;
      }
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
  for (var i4 = enemies.length - 1; i4 >= 0; i4--) if (enemies[i4].dead && enemies[i4].dieT <= 0) enemies.splice(i4, 1);
}
var gobId = 0;
function damageGob(e, d, sx2, sz2) {
  if (e.dead) return false;
  e.hp -= d;
  e.hitT = 0.13;
  /* squash + hop: the body answers the hit before the number does */
  e.flinch = Math.max(e.flinch, clamp(d / 3, 0.35, 1));
  e.popY = Math.min(0.22, e.popY + 0.1 * clamp(d / 3, 0.4, 1));
  e.dmgTaken = Math.min(1, e.dmgTaken + 0.5);
  e.hitsTaken++;
  /* heavy hits stagger the big brutes — charged shots + nova have a window */
  if (d >= 3 && (e.k === 'brute' || e.k === 'boss')) {
    e.stun = e.k === 'boss' ? 0.3 : 0.45;
    fxPush({ x: e.x, y: e.y + e.h + 0.2, z: e.z, vx: 0, vy: 1.2, vz: 0, life: 0.4, max: 0.4, s: 0.16, pr: 255, pg: 240, pb: 160, pa: 0.9, grav: 0 });
  }
  var dx = 0, dz = 0;
  if (sx2 !== undefined) { var l = Math.hypot(sx2, sz2) || 1; dx = sx2 / l; dz = sz2 / l; }
  e.vx += dx * 9; e.vz += dz * 9; e.vy = Math.max(e.vy, 1.6);
  if (e.brain) e.brain.reward('hurt');
  sfxGated('hit');
  if (e.hp <= 0) killGob(e, false);
  return true;
}
/* CORPSE — a killed goblin is not deleted, it is thrown. The launch impulse,
 * the tumble and the sink all live in the render-only fields (dieT/lean/…), so
 * nothing here feeds back into the sim or the netcode hash. */
var CORP_T = 0.6;
function updateCorpse(e, dtU) {
  e.dieT -= dtU;
  if (e.dieT <= 0) { e.dieT = 0; return; }
  var f = clamp(e.dieT / CORP_T, 0, 1);
  /* physics: it was already given an impulse by damageGob — tumble it */
  e.vy -= 30 * dtU;
  e.x += e.vx * dtU; e.z += e.vz * dtU; e.y += e.vy * dtU;
  var gy = world.heightAt(e.x, e.z);
  if (e.y <= gy) {
    e.y = gy;
    if (e.vy < -2) { e.vy = -e.vy * 0.32; e.vx *= 0.6; e.vz *= 0.6; }
    else { e.vy = 0; e.vx *= Math.max(0, 1 - dtU * 7); e.vz *= Math.max(0, 1 - dtU * 7); }
  }
  e.lean += e.dieSpin * dtU * (0.4 + f);
  e.run = e.lean;                        /* reuse: limbs follow the tumble */
  e.shade = 0.25 + 0.75 * f * f;
  e.hitT = 0; e.stun = 0; e.tele = 0; e.actT = 0; e.spitT = 0;
  e.dashing = false;
}
function killGob(e, smash) {
  if (e.dead) return;
  e.dead = true;
  e.dieT = CORP_T;
  e.dieSpin = (e.id % 2 ? 1 : -1) * (1.6 + (e.id % 5) * 0.22);
  e.popY = 0;
  if (e.k !== 'boss') {
    /* the killing blow throws the body — the single best feedback you can buy
       for a hit, and it tells you at a glance which goblins are already dead */
    e.vy = Math.max(e.vy, e.k === 'brute' ? 4.2 : 6.4);
    e.vx *= 1.35; e.vz *= 1.35;
  }
  var c = gobbyCol(e.k);
  game.combo = Math.min(99, game.combo + 1);
  game.combot = B.comboT;
  game.comboBest = Math.max(game.comboBest, game.combo);
  var pts = e.sc * Math.max(1, game.combo - 0);
  game.score += pts;
  game.kills++;
  if (game.combo > 1 && (game.combo % 5 === 0 || game.combo === 3)) {
    popText(e.x, e.y + e.h + 1, e.z, 'COMBO ×' + game.combo, true, '#ffd75e');
    sfxGated('coin');
  }
  if (game.combo % 20 === 0 && game.lives < game.maxLives) {
    game.lives++;
    popText(e.x, e.y + e.h + 1.7, e.z, '♥ +1 LIFE', true, '#ff8a9a');
    sfx('heal');
  }
  if (e.gemsStolen > 0 && e.stolen) {
    /* drop the swag, plus a finder's bonus for chasing it down */
    for (var gi = 0; gi < e.stolen.length; gi++) {
      spawnPickup(e.stolen[gi], e.x + (gi - 0.5) * 0.5, e.y + 1.15, e.z + gi * 0.22);
    }
    game.score += 25 * e.gemsStolen;
    game.recovered += e.gemsStolen;
    popText(e.x, e.y + e.h + 1.5, e.z, 'LOOT BACK ×' + e.gemsStolen, true, '#ffd75e');
    sfx('coin');
    ringBurst(e.x, e.y + 0.2, e.z, [255, 214, 94], 5);
    e.gemsStolen = 0; e.stolen = null;
  }
  popText(e.x, e.y + e.h + 0.7, e.z, '+' + pts, false, smash ? '#9fe8ff' : '#ffe9a8');
  if (smash) {
    burst(e.x, e.y + e.h * 0.5, e.z, [160, 230, 255], 18, 9, 2.6, 0.3, 0.6);
    ringBurst(e.x, e.y + 0.2, e.z, [200, 240, 255], 4);
    shake(0.26);
    doHitStop(0.05);
    sfx('smash');
  } else {
    burst(e.x, e.y + e.h * 0.5, e.z, c.skin, 16, 6, 2, 0.34, 0.55);
    burst(e.x, e.y + e.h * 0.4, e.z, [255, 220, 90], 10, 5, 1.5, 0.16, 0.4);
    shake(0.14);
    sfx('kill');
  }
  /* drops */
  if (e.k === 'boss') {
    for (var gi = 0; gi < 6; gi++) spawnPickup('gem', e.x + rnd2(-1.2, 1.2), e.y + e.h * 0.5, e.z + rnd2(-1.2, 1.2));
    spawnPickup('heart', e.x, e.y + e.h * 0.5, e.z);
    spawnPickup('heart', e.x + rnd2(-1, 1), e.y + e.h * 0.5, e.z + rnd2(-1, 1));
    spawnPickup(powerType(), e.x + rnd2(-1.6, 1.6), e.y + e.h * 0.5, e.z + rnd2(-1.6, 1.6));
  } else {
    if (tickRand() < (e.k === 'brute' ? 0.85 : e.k === 'spitter' ? 0.6 : 0.42)) spawnPickup('gem', e.x, e.y + e.h * 0.5, e.z);
    var heartCh = e.elite ? 0.5 : (game.lives < game.maxLives ? 0.06 : 0);
    if (heartCh > 0 && tickRand() < heartCh) spawnPickup('heart', e.x, e.y + e.h * 0.5, e.z);
    var powCh = e.elite ? 0.2 : 0.045;
    if (tickRand() < powCh) spawnPickup(powerType(), e.x + rnd2(-0.4, 0.4), e.y + e.h * 0.5, e.z + rnd2(-0.4, 0.4));
  }
  var isBoss = e.k === 'boss';
  if (isBoss) {
    shake(1);
    game.boss = false;
    doHitStop(0.22);
    camKick(0.02, -0.09, 0.04);
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
  if (R.inv > 0 || state !== 'play' || e.dead) {
    /* A swallowed hit is not free: if it was swallowed by a *dash*, time
       crawls for half a second and the mana barrel refills — the game's
       reward for reading an attack instead of mashing away. */
    if (R.dodgeT > 0 && state === 'play' && !e.dead && R.inv > 0) {
      R.dodgeT = 0;
      game.slowT = Math.max(game.slowT, 0.55); game.slowK = 0.35;
      R.mana = Math.min(R.manaMax, R.mana + 30);
      game.score += 40 + game.combo * 5;
      popText(R.x, R.y + 2.1, R.z, 'PERFECT DODGE', true, '#7fd8ff');
      burst(R.x, R.y + 1, R.z, [130, 220, 255], 16, 6, 2.2, 0.2, 0.5);
      ringBurst(R.x, R.y + 0.4, R.z, [120, 210, 255], 4);
      sfx('pop'); sfx('djump');
      shake(0.18);
    }
    return;
  }
  var dx = R.x - e.x, dz = R.z - e.z, d = Math.hypot(dx, dz) || 1;
  /* knockback: impulse blended into the movement model (survives the
     acceleration lerp that would otherwise eat it on the next tick) */
  R.kbx = dx / d * 1.0; R.kbz = dz / d * 1.0; R.kbT = 0.3;
  R.vx = dx / d * 10; R.vz = dz / d * 10; R.vy = 8;
  R.dashing = false; R.dashT = 0;
  if (e.k === 'boss') { shake(0.9); R.vx *= 1.5; R.vz *= 1.5; }
  else shake(0.45);
  var kYaw = angDiff(camYaw, Math.atan2(-(dx / d), -(dz / d)));
  camKick(clamp(kYaw, -0.5, 0.5) * 0.055, -0.05, kYaw > 0 ? -0.03 : 0.03);
  if (!e.dead && e.brain) e.brain.reward('hit');
  /* e.brain is what separates a real goblin from the throwaway proxy a
     spitter's bolt hands us — the ward only shocks what actually touched her */
  if (B.thorns > 0 && !e.dead && e.brain) {
    /* spirit ward: the hit costs them too. A goblin that dies to the ward
       halfway through its own lunge never lands — best free kill in the game */
    damageGob(e, 1.4 * B.thorns * buffMul().dmg, -dx, -dz);
    ringBurst(e.x, e.y + e.h * 0.6, e.z, [180, 255, 220], 4);
  }
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
  shake(0.6);
  /* the camera flinches *away* from the hit — you feel which side it came
     from before your eyes even find the goblin */
  doHitStop(0.09);
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
function placeGoblin(k, px, pz, elite) {
  var pt = null;
  if (px === undefined) {
    if (k === 'boss') {
      pt = { x: world.bossSpawn.x, y: world.bossSpawn.y, z: world.bossSpawn.z };
    } else {
      /* Arrive from a near portal more often than a far one. A uniform pick
         means a third of the waves open with a 40u jog across the bowl before
         anything can be hit, and a jog is not a fight. The ^1.6 keeps the far
         rim in the hat so the tide still comes from strange angles. */
      var sp = world.spawns, order = [];
      for (var si = 0; si < sp.length; si++) {
        var sdx = sp[si].x - R.x, sdz = sp[si].z - R.z;
        order.push({ i: si, d: sdx * sdx + sdz * sdz });
      }
      order.sort(function (a, b) { return a.d - b.d; });
      var pickSp = sp[order[Math.min(order.length - 1, Math.floor(Math.pow(tickRand(), 1.6) * order.length))].i];
      pt = { x: pickSp.x + rnd2(-1.2, 1.2), y: pickSp.y, z: pickSp.z + rnd2(-1.2, 1.2) };
    }
  } else pt = { x: px, y: world.heightAt(px, pz), z: pz };
  var g = newGob(k, pt.x, pt.y, pt.z, 0);
  if (k === 'boss') { g.hp = g.hpMax = 34 + Math.max(0, game.wave - 5) * 6; g.enrage = false; }
  else {
    /* the tide hardens: +hp and +pace per wave, both capped, so wave 12 is a
       threat without wave 30 becoming a wall of unkillable tanks. Seeded off
       game.wave — every host composes the same army. */
    var wsc = 1 + Math.min(0.45, Math.max(0, game.wave - 1) * 0.05);
    var ssc = 1 + Math.min(0.2, Math.max(0, game.wave - 1) * 0.022);
    g.hp = g.hpMax = Math.max(1, Math.round(g.hpMax * wsc * 10) / 10);
    g.spd *= ssc;
    g.sc = Math.round(g.sc * (1 + Math.min(0.6, Math.max(0, game.wave - 1) * 0.05)));
  }
  /* elites (wave 4+): tougher, quicker, worth 2.5x — seeded roll so every
     host spawns the same army */
  if (elite !== false && k !== 'boss' && game.wave >= 4 && tickRand() < 0.16) elite = true;
  if (elite) {
    g.elite = true;
    g.hp = g.hpMax = Math.ceil(g.hpMax * 1.6);
    g.sc = Math.round(g.sc * 2.5);
    g.spd *= 1.18;
    g.shade = 1.3;
    g.r *= 1.07;
  }
  burst(g.x, g.y + 0.1, g.z, gobCol(k).skin, 10, 4, 0.6, 0.18, 0.35);
  if (elite) {
    ringBurst(g.x, g.y + 0.15, g.z, [255, 214, 94], 3);
    popText(g.x, g.y + g.h + 1.2, g.z, 'ELITE', true, '#ffd75e');
    sfx('coin');
  } else ringBurst(g.x, g.y + 0.15, g.z, [220, 220, 255], 2.4);
  if (k === 'boss') sfx('boss');
  else if (k === 'brute') sfx('roar');
  else sfxGated('pop');
  if (k === 'boss') { shake(0.7); camKick(0, -0.05, 0); }
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
/* ================================================================
 * 12b. boons — one pick between every wave
 *
 * Why this exists: the tide is the same fight 20 times over unless the run
 * *changes shape*. A pick after each clear costs two seconds and turns a
 * shooter into a build: do you take the third pierce on your charged blast or
 * the extra heart? Gaps you could never close, or a nova you can throw twice
 * as often? Every boon is a multiplier on the sim's own constants, so the
 * fixed tick and the netcode hash stay honest: the offer is drawn from
 * tickRand (seeded) and the pick is, effectively, an input.
 * ================================================================ */
var BOONS = [
  { id: 'power', ico: '⚡', n: 'HEAVY WAND', d: '+15% damage on everything', k: 'dmg', mul: 1.15, rep: 1 },
  { id: 'haste', ico: '✦', n: 'QUICK WAND', d: 'cast 14% faster', k: 'cast', mul: 0.86, rep: 1 },
  { id: 'wind', ico: '☄', n: 'WIND RUNNERS', d: '+10% move speed', k: 'spd', mul: 1.1, rep: 1 },
  { id: 'surge', ico: '✧', n: 'DEEP WELL', d: '+45% mana regen', k: 'regen', mul: 1.45, rep: 1 },
  { id: 'focus', ico: '◈', n: 'FOCUSED CHARGE', d: 'charged bolts punch through +1 goblin', k: 'pierce', add: 1, rep: 1 },
  { id: 'cleave', ico: '⌇', n: 'WIDE STAFF', d: 'melee reach and cleave radius +', k: 'reach', add: 0.5, rep: 1 },
  { id: 'blinker', ico: '⇉', n: 'SHORT BLINK', d: 'dash recovers 20% faster', k: 'dashCd', mul: 0.8, rep: 1 },
  { id: 'heart', ico: '♥', n: 'SECOND WIND', d: '+1 max heart, and heal one', k: 'lives', add: 1, max: 3 },
  { id: 'greed', ico: '⊛', n: 'GOBLIN GREED', d: 'gems fly to you from further away', k: 'magnet', add: 2.2, rep: 1 },
  { id: 'feather', ico: '⌃', n: 'FEATHER STEP', d: 'jump higher — better angles, bigger landings', k: 'jumpK', mul: 1.07, rep: 1 },
  { id: 'thorns', ico: '⚔', n: 'SPIRIT WARD', d: 'what hits you gets shocked back', k: 'thorns', add: 1, max: 3 },
  { id: 'breath', ico: '⌛', n: "WARRIOR'S BREATH", d: 'combo timer lasts 50% longer', k: 'comboT', mul: 1.5, rep: 1 }
];
var B = newBoons();
function newBoons() {
  return {
    dmg: 1, spd: 1, cast: 1, regen: 1, pierce: 0, reach: 0, dashCd: 1,
    magnet: 2.6, jumpK: 1, thorns: 0, comboT: 4
  };
}
function dashCdMax() { return DASH_CD * B.dashCd; }
function offerBoons() {
  /* three distinct offers; capped boons drop out of the pool once taken */
  var pool = [];
  for (var i = 0; i < BOONS.length; i++) {
    var b = BOONS[i];
    if (b.max !== undefined && (game.boonN[b.id] | 0) >= b.max) continue;
    pool.push(b);
  }
  var offer = [];
  for (var j = 0; j < 3 && pool.length; j++) {
    var k = Math.floor(tickRand() * pool.length);
    offer.push(pool[k]);
    pool.splice(k, 1);
  }
  game.boonOffer = offer;
  return offer;
}
/* Applying is separate from choosing, so a test (or a future shop) can grant a
   specific boon without having to beat the draw. */
function applyBoon(b) {
  if (!b) return null;
  if (b.k === 'lives') { game.maxLives++; game.lives = Math.min(game.maxLives, game.lives + 1); }
  else if (b.add !== undefined) B[b.k] += b.add;
  else B[b.k] *= b.mul;
  game.boonN[b.id] = (game.boonN[b.id] | 0) + 1;
  game.boonsTaken++;
  return b;
}
function pickBoon(i) {
  if (state !== 'pick' || !game.boonOffer || !game.boonOffer[i]) return null;
  var b = game.boonOffer[i];
  game.boonOffer = null;
  hide('ovPick');
  state = 'play';
  if (CAMSET.aimMode === 1 && finePointer && !isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
  applyBoon(b);
  showBanner(b.n, '+ ' + b.d);
  popText(R.x, R.y + 2.1, R.z, b.ico + ' ' + b.n, true, '#ffe9a8');
  sfx('power');
  burst(R.x, R.y + 1, R.z, [255, 220, 120], 20, 7, 1.8, 0.25, 0.6);
  updateBoonBar(true);
  return b.id;
}
function showOffer() {
  if (!game.boonOffer || !game.boonOffer.length) { state = 'play'; return; }
  for (var i = 0; i < 3; i++) {
    var btn = el('boon' + i), b = game.boonOffer[i];
    if (!btn) continue;
    if (b) {
      btn.classList.remove('hide');
      btn.querySelector('.bi').textContent = b.ico;
      btn.querySelector('.bn').textContent = b.n;
      btn.querySelector('.bd').textContent = b.d;
      var have = game.boonN[b.id] | 0;
      btn.querySelector('.bx').textContent = have ? 'owned ×' + have : '';
      btn._boon = b.id;
    } else btn.classList.add('hide');
  }
  show('ovPick');
  state = 'pick';
  /* the pointer has to come back: you cannot click a card with the cursor
     hidden, and a run that stalls because someone can't dismiss a menu is
     worse than a run that stalls because they died */
  mouseFire = false;
  try { if (document.pointerLockElement === canvas) document.exitPointerLock(); } catch (e) {}
}
var boonBarN = -1;
function updateBoonBar(force) {
  var bb = el('boonBar');
  if (!bb) return;
  if (!force && game.boonsTaken === boonBarN) return;
  boonBarN = game.boonsTaken;
  if (!game.boonsTaken) { bb.textContent = ''; return; }
  var h = '';
  for (var i = 0; i < BOONS.length; i++) {
    var n = game.boonN[BOONS[i].id] | 0;
    if (!n) continue;
    h += '<span title="' + BOONS[i].n + ': ' + BOONS[i].d + '">' + BOONS[i].ico + (n > 1 ? '&times;' + n : '') + '</span>';
  }
  bb.innerHTML = h;
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
  offerBoons();
  showOffer();
}
function nextWave() {
  if (state !== 'play') { game.waveState = 'idle'; return; }
  startWave(game.wave + 1);
}

/* ================================================================
 * 13. pickups
 * ================================================================ */
function powerType() {
  var r = tickRand();
  return r < 0.4 ? 'bolt' : (r < 0.75 ? 'swift' : 'surge');
}
var POWER_META = {
  bolt:  { col: [255, 214, 94],  label: '⚡ DAMAGE UP' },
  swift: { col: [120, 230, 255], label: '☄ SPEED UP' },
  surge: { col: [200, 140, 255], label: '✦ MANA SURGE' }
};
function spawnPickup(kind, x, y, z) {
  if (pickups.length > 48) return;
  /* gr: a moment where only she can pick it up. Loot that can be intercepted
     before it even lands reads as the game stealing from the player. */
  pickups.push({ k: kind, x: x, y: y, z: z, vy: rnd2(3, 5), ph: rnd2(0, TAU), life: kind === 'heart' || POWER_META[kind] ? 16 : 14, mag: 0, gr: 0.38 });
}
function updatePickups(dtP) {
  for (var i = pickups.length - 1; i >= 0; i--) {
    var p = pickups[i];
    p.life -= dtP;
    if (p.gr > 0) p.gr -= dtP;
    if (p.life <= 0) { pickups.splice(i, 1); continue; }
    p.vy -= 18 * dtP;
    p.y += p.vy * dtP;
    var gy = groundY(p.x, p.z);
    if (p.y < gy + 0.4) { p.y = gy + 0.4; p.vy = 0; }
    p.ph += dtP * 3;
    var dx = R.x - p.x, dz = R.z - p.z, d = Math.hypot(dx, dz);
    if (d < B.magnet) { p.mag = Math.min(1, p.mag + dtP * 2.1); var pull = p.mag * 11; p.x += dx / (d || 1) * pull * dtP; p.z += dz / (d || 1) * pull * dtP; }
    if (d < 0.9 && Math.abs(p.y - (R.y + 0.9)) < 1.6) { collectPickup(p); pickups.splice(i, 1); }
  }
}
function collectPickup(p) {
  var meta = POWER_META[p.k];
  if (p.k === 'heart') {
    if (game.lives < game.maxLives) { game.lives++; sfx('heal'); popText(p.x, p.y + 0.6, p.z, '♥ +1', true, '#ff8a9a'); }
    else { game.score += 50; popText(p.x, p.y + 0.6, p.z, '+50', false, '#ff8a9a'); }
    burst(p.x, p.y, p.z, [255, 120, 150], 14, 5, 1, 0.2, 0.5);
  } else if (meta) {
    /* power-ups: refresh the buff timer (or start it) */
    if (p.k === 'bolt') { buffs.dmg = BUFF_MAX.dmg; }
    else if (p.k === 'swift') { buffs.spd = BUFF_MAX.spd; }
    else { R.mana = Math.min(R.manaMax, R.mana + 40); buffs.regen = BUFF_MAX.regen; }
    game.score += 25;
    popText(p.x, p.y + 0.7, p.z, meta.label, true, '#' + (p.k === 'bolt' ? 'ffd75e' : p.k === 'swift' ? '7fe4ff' : 'd29aff'));
    burst(p.x, p.y, p.z, meta.col, 20, 6, 1.2, 0.22, 0.6);
    ringBurst(p.x, p.y, p.z, meta.col, 4);
    sfx('power');
  } else {
    R.mana = Math.min(R.manaMax, R.mana + 18);
    game.score += 15;
    popText(p.x, p.y + 0.6, p.z, '+15', false, '#a9d8ff');
    burst(p.x, p.y, p.z, [120, 190, 255], 12, 5, 1, 0.16, 0.45);
    ringBurst(p.x, p.y, p.z, [160, 220, 255], 3);
    sfxGated('coin');
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
/* buff bar rows (built once; shown/hidden + refilled per tick) */
var buffRows = [];
function makeBuffRow(icon, color, key) {
  var row = document.createElement('div');
  row.className = 'buffRow';
  row.style.display = 'none';
  var ic = document.createElement('span');
  ic.textContent = icon;
  ic.style.color = color;
  var bar = document.createElement('i');
  bar.style.background = color;
  bar.style.boxShadow = '0 0 8px ' + color;
  row.appendChild(ic);
  row.appendChild(bar);
  el('buffBar').appendChild(row);
  buffRows.push({ row: row, bar: bar, key: key });
}
function updateBuffBar() {
  for (var i = 0; i < buffRows.length; i++) {
    var r = buffRows[i], t = buffs[r.key];
    if (t > 0) {
      if (r.row.style.display === 'none') r.row.style.display = 'flex';
      r.bar.style.width = Math.round(t / BUFF_MAX[r.key] * 100) + '%';
    } else if (r.row.style.display !== 'none') r.row.style.display = 'none';
  }
}
/* HUD writes are cached — stepSim calls updateHUD 60x/s and only changed
 * values touch the DOM (score tween stays per-tick for smoothness) */
var hudCache = { hearts: '', wave: '', bossW: -1, bossVis: null, nova: null, dash: -1, smack: null };
function updateHUD() {
  var h = '';
  for (var i = 0; i < game.maxLives; i++) h += i < game.lives ? '♥' : '🖤';
  if (h !== hudCache.hearts) { el('hudHearts').textContent = h; hudCache.hearts = h; }
  shownScore += (game.score - shownScore) * Math.min(1, dt * 9);
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  el('hudScore').firstChild.nodeValue = Math.round(shownScore);
  var wt = 'WAVE ' + game.wave;
  if (state === 'play' && game.waveState === 'combat') {
    var aliveN = 0;
    for (var k2 = 0; k2 < enemies.length; k2++) if (!enemies[k2].dead) aliveN++;
    var leftN = aliveN + game.spawnQueue.length;
    if (leftN > 0) wt += ' · ' + leftN + ' LEFT';
  }
  if (wt !== hudCache.wave) { el('hudWave').textContent = wt; hudCache.wave = wt; }
  var bb = el('bossBar'), be = null;
  for (var j = 0; j < enemies.length; j++) if (enemies[j].k === 'boss' && !enemies[j].dead) { be = enemies[j]; break; }
  if (be) {
    if (hudCache.bossVis !== true) { bb.style.display = 'block'; hudCache.bossVis = true; hudCache.bossW = -1; }
    var bw = Math.round(Math.max(0, be.hp / be.hpMax * 100));
    if (bw !== hudCache.bossW) { bb.querySelector('i').style.width = bw + '%'; hudCache.bossW = bw; }
  } else if (hudCache.bossVis !== false) { bb.style.display = 'none'; hudCache.bossVis = false; }
  el('hurtVig').classList.toggle('low', game.lives === 1 && state === 'play');
  var rv = el('ropeVig');
  if (rv && R) {
    var rop = clamp(R.rope, 0, 1);
    rv.style.opacity = rop > 0.02 ? (0.25 + rop * 0.6).toFixed(2) : '0';
  }
  var mb = el('manaBar');
  if (mb && R) {
    var pct = Math.round(R.mana / R.manaMax * 100);
    mb.querySelector('i').style.width = pct + '%';
    var nova = R.mana >= R.manaMax;
    mb.classList.toggle('full', nova);
    var spanTxt = nova ? 'NOVA READY' : 'MAGIC';
    if (spanTxt !== hudCache.nova) { mb.querySelector('span').textContent = spanTxt; hudCache.nova = spanTxt; }
  }
  updateBuffBar();
  /* ability kit: dash charge + smack chain. The dash is the movement *and*
     the defensive button, so you should never have to look at the ground to
     know whether it is lit. */
  if (R) {
    var dF = 1 - clamp(R.dashCd / dashCdMax(), 0, 1);
    var kd = el('kitDash');
    if (kd) {
      kd.style.setProperty('--f', Math.round(dF * 100) + '%');
      kd.classList.toggle('ready', dF >= 1);
    }
    var ks = el('kitSmack');
    if (ks) {
      var ch = R.meleeN | 0;
      ks.style.setProperty('--f', Math.round((ch / 3) * 100) + '%');
      ks.classList.toggle('ready', ch === 0 || R.meleeCd <= 0);
      var lbl = ch === 2 ? 'CLEAVE!' : 'SMACK';
      if (lbl !== hudCache.smack) { ks.firstChild.textContent = lbl; hudCache.smack = lbl; }
      ks.classList.toggle('c2', ch === 2);
    }
  }
}
function resetHudCache() { hudCache.dash = -1; hudCache.smack = null; hudCache.hearts = ''; hudCache.wave = ''; hudCache.bossW = -1; hudCache.bossVis = null; hudCache.nova = null; }
function updateCombo() {
  var c = el('comboCtr'), f = el('comboFill');
  if (game.combo > 1) {
    c.style.opacity = 1;
    c.firstChild.nodeValue = '×' + game.combo;
    f.style.opacity = 1;
    f.style.width = Math.max(4, game.combot / B.comboT * 90) + 'px';
  } else { c.style.opacity = 0; f.style.opacity = 0; }
}
function updateReticle() {
  var showRet = state === 'play' && (finePointer || gpAiming);
  if (!showRet) { reticleEl.classList.remove('on'); document.body.classList.remove('aiming'); return; }
  reticleEl.classList.add('on');
  document.body.classList.add('aiming');
  if (pointerLocked || gpAiming) {
    reticleEl.style.left = (Ww / 2) + 'px';
    reticleEl.style.top = (Hh / 2) + 'px';
  } else {
    reticleEl.style.left = mouseX + 'px';
    reticleEl.style.top = mouseY + 'px';
  }
  var lockedOn = !!aim.lock;
  reticleEl.classList.toggle('lock', lockedOn);
  /* charge: the ring closes and goes gold as the bolt swells, and the reticle
     is the only place you can watch that build without looking at a bar */
  var chg = R && R.charging ? chargePct() : 0;
  reticleEl.classList.toggle('chg', chg > 0);
  reticleEl.classList.toggle('max', chg >= 0.85);
  if (chg > 0) reticleEl.style.setProperty('--chg', (chg * 360).toFixed(0) + 'deg');
  /* the ring breathes on wheel / melee activity so the reticle is not dead */
  var pulse = clamp(zoomPulse, 0, 1) + (R && R.meleeT > 0 ? 0.5 : 0);
  reticleEl.style.setProperty('--pulse', pulse.toFixed(3));
}

/* ---------- offscreen threat markers ----------
 * In a 360° arena fight the #1 frustration is damage from goblins you
 * can't see. Pool of edge arrows: nearest threats first, boss/elite in
 * red, opacity falls off with distance. Pure DOM, one transform/frame. */
var OFF_MAX = 6;
var offArrows = [];
(function buildOffArrows() {
  var host = document.getElementById('offArrows');
  if (!host) return;
  for (var i = 0; i < OFF_MAX; i++) {
    var d = document.createElement('div');
    d.className = 'oa';
    host.appendChild(d);
    offArrows.push(d);
  }
})();
function hideOffArrows() {
  for (var i = 0; i < offArrows.length; i++) offArrows[i].style.display = 'none';
}
function updateOffscreenArrows() {
  if (!offArrows.length || !R) return;
  if (state !== 'play') { hideOffArrows(); return; }
  var cand = [];
  for (var e = 0; e < enemies.length; e++) {
    var en = enemies[e];
    if (!en.dead) cand.push(en);
  }
  if (!cand.length) { hideOffArrows(); return; }
  cand.sort(function (a, b) {
    return Math.hypot(a.x - R.x, a.z - R.z) - Math.hypot(b.x - R.x, b.z - R.z);
  });
  var m = PVM, n = 0;
  for (var c = 0; c < cand.length && n < OFF_MAX; c++) {
    var t = cand[c];
    var wx = t.rx, wy = t.ry + t.h * 0.5, wz = t.rz;
    var cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
    var cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
    var w = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
    var dirX, dirY;
    var onScreen = false;
    if (w > 0.05) {
      var nx = cx / w, ny = cy / w;
      if (nx > -0.92 && nx < 0.92 && ny > -0.9 && ny < 0.9) onScreen = true;
      dirX = nx; dirY = -ny;
    } else {
      /* behind the camera: project onto the camera right/up basis */
      var relX = wx - camX, relY = wy - camY, relZ = wz - camZ;
      dirX = relX * camR[0] + relY * camR[1] + relZ * camR[2];
      dirY = -(relX * camUp[0] + relY * camUp[1] + relZ * camUp[2]);
    }
    if (onScreen) continue;
    var dl = Math.hypot(dirX, dirY) || 1;
    dirX /= dl; dirY /= dl;
    var ax2 = Ww / 2 + dirX * (Ww / 2 - 52);
    var ay2 = Hh / 2 + dirY * (Hh / 2 - 52);
    var d3 = Math.hypot(t.x - R.x, t.z - R.z);
    var elA = offArrows[n];
    elA.style.display = 'block';
    elA.style.transform = 'translate(' + (ax2 - 7) + 'px,' + (ay2 - 6) + 'px) rotate(' + (Math.atan2(dirY, dirX) + Math.PI / 2) + 'rad)';
    elA.style.opacity = String(clamp(1.3 - d3 / 46, 0.3, 0.95));
    elA.className = 'oa' + (t.k === 'boss' || t.elite ? ' oa-hot' : '');
    n++;
  }
  for (var r3 = n; r3 < offArrows.length; r3++) offArrows[r3].style.display = 'none';
}
/* ================================================================
 * 15. character rendering (instanced)
 * ================================================================ */
/* limb2(out, x,y,z, yaw, pivX,pivY,pivZ, pitch, roll, geoX,geoY,geoZ, sx,sy,sz)
 * box & sphere centre on the origin; cyl/cone bases sit at local y=0. */
function drawRileyChar(o) {
  if (o.hitT > 0 && Math.floor(time * 26) % 2 === 0) return;
  /* bank the whole body into the strafe / turn, squash on landing, pop on the
     double jump — one premultiplied transform, so the rig reads as a body
     rather than a pile of boxes being moved independently */
  var ln = o.lean || 0, land = o.landT > 0 ? clamp(o.landT / 0.22, 0, 1) : 0;
  if (Math.abs(ln) > 0.008 || land > 0.01) {
    bodyPush(o.rx, o.ry + 0.72, o.rz, 0, 0, ln * 1.15,
      1 + land * 0.14, 1 - land * 0.16, 1 + land * 0.14);
  }
  var skin = [255, 210, 180], robe = [56, 58, 176], robeD = [40, 42, 134],
    gold = [255, 214, 94], hat = [88, 60, 214], boot = [96, 58, 38], wood = [128, 80, 46];
  var moving = Math.abs(o.vx) > 0.5 || Math.abs(o.vz) > 0.5;
  var walk = Math.sin(o.run);
  var bob = (moving && o.ground) ? Math.abs(walk) * 0.05 : Math.sin(time * 3) * 0.02;
  var legSwing = (moving && o.ground) ? walk * 0.8 : (o.air ? -0.35 : 0);
  var armSwing = (moving && o.ground) ? -walk * 0.65 : (o.air ? -0.4 : 0.15);
  var yaw = o.ryaw !== undefined ? o.ryaw : o.yaw, bx = o.rx, by = o.ry, bz = o.rz;
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
  bodyXform = null;
}
function drawRileyGlow() {
  drawInstanced('box', 'g4', [80, 220, 255]);            /* glasses */
  drawInstanced('sphereL', 'g5', [255, 235, 160]);       /* hat star */
  var chg6 = (R && R.charging) ? chargePct() : 0;
  drawInstanced('sphereL', 'g6', chg6 > 0.85 ? [200, 150, 255] : [255, 225, 130]); /* wand tip */
}
function drawGoblin(e) {
  if (e.hitT > 0 && !e.dead && Math.floor(time * 26) % 2 === 0) return;
  if (lensHide(e)) return;          /* corpses too: a dead face in the lens is the same artifact */
  /* whole-body deformation (render clock only, never feeds the sim) */
  var cx = e.rx, cy = e.ry + e.h * 0.5, cz = e.rz, pYaw = 0, pPit = 0, pRol = 0, kx = 1, ky = 1, kz = 1;
  if (e.dead) {
    var fd = clamp(e.dieT / CORP_T, 0, 1);
    pRol = e.lean; pPit = e.lean * 0.55;
    ky = kz = 1 - (1 - fd) * 0.3; kx = 1 - (1 - fd) * 0.18;
    cy -= (1 - fd) * 0.42;                        /* sinks into the ground */
  } else if (e.spawnT > 0) {
    var sf = 1 - clamp(e.spawnT / SPAWN_T, 0, 1);          /* 0 → 1 */
    var pop = sf < 0.82 ? sf / 0.82 : 1 + (1 - (sf - 0.82) / 0.18) * 0.12;
    kx = kz = 0.35 + pop * 0.7; ky = 0.12 + pop * 0.95;
    cy -= (1 - pop) * e.h * 0.35;
    pRol = (1 - sf) * 2.2 * (e.id % 2 ? 1 : -1);
  } else {
    if (e.flinch > 0) { kx = 1 + e.flinch * 0.16; ky = 1 - e.flinch * 0.2; kz = 1 + e.flinch * 0.16; }
    pRol = e.lean * 0.8;
    cy += e.popY;
  }
  if (kx !== 1 || ky !== 1 || kz !== 1 || pRol !== 0 || pPit !== 0) bodyPush(cx, cy, cz, pYaw, pPit, pRol, kx, ky, kz);
  var c = gobCol(e.k);
  if (e.shade && e.shade !== 1) {
    c.skin = shade(c.skin, e.shade); c.skinD = shade(c.skinD, e.shade); c.belly = shade(c.belly, e.shade);
    c.ear = shade(c.ear, e.shade); c.cloth = shade(c.cloth, e.shade);
  }
  var s = Math.max(e.r, 0.42) * 2, yaw = e.ryaw, bx = e.rx, by = e.ry, bz = e.rz, h = e.h;
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
  bodyXform = null;
}
/* the prize, held overhead and wobbling: you have to be able to pick the right
   goblin out of a crowd at a glance, or the theft is just a lost pickup */
function drawThiefLoot(e) {
  if (!e.gemsStolen || e.dead) return;
  var by = e.ry + e.h + 0.52 + Math.sin(time * 4 + e.ph) * 0.08 + (e.stealT > 0 ? e.stealT * 0.55 : 0);
  for (var i = 0; i < e.gemsStolen; i++) {
    var a = time * 2.4 + i * 2.1 + e.ph;
    var rad = 0.2 + e.gemsStolen * 0.035;
    C.limb2(MM, e.rx + Math.cos(a) * rad, by + Math.sin(a * 1.7) * 0.06, e.rz + Math.sin(a) * rad,
      a, 0, 0, 0, 0.62, 0.4, 0, 0, 0, 0.15, 0.15, 0.15);
    instPart('box', '', MM, e.stolen && e.stolen[i] === 'heart' ? [255, 120, 150] :
      (e.stolen && e.stolen[i] !== 'gem' ? [200, 140, 255] : [255, 214, 94]));
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

function drawStaticVBO(vbo, n, texKey, alpha, glowCol, water) {
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
  gl.uniform1f(uStat.uTime, time);
  gl.uniform1f(uStat.uWater, water ? 1 : 0);
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
  /* stars (refill pre-allocated slots — no per-frame allocation) */
  starN = 0;
  for (var i = 0; i < stars.length && starN < starScratch.length; i++) {
    var s0 = stars[i];
    var tw = 0.25 + 0.45 * Math.abs(Math.sin(time * s0.sp + s0.ph));
    starN = glowAddInto(starScratch, starN, s0.x, s0.y, s0.z, s0.s, 255, 255, 255, tw);
  }
  drawGlowList(starScratch, 0, starN);
  /* terrain + water */
  for (var i2 = 0; i2 < worldVBOs.length; i2++) {
    var w = worldVBOs[i2];
    if (w.water) drawStaticVBO(w.vbo, w.n, w.tex, 0.72, [world.realm.water[0] * 0.12, world.realm.water[1] * 0.12, world.realm.water[2] * 0.12], true);
    else drawStaticVBO(w.vbo, w.n, w.tex, undefined, undefined, false);
  }
  /* props */
  for (var i3 = 0; i3 < propDraws.length; i3++) {
    var pd = propDraws[i3];
    drawPropInstanced(pd);
  }
  /* static glows (torches, runes) */
  glowN = 0;
  var acc = accentRGB();
  for (var i = 0; i < world.glowPoints.length && glowN < glowScratch.length; i++) {
    var gp = world.glowPoints[i];
    var a = 0.5 + 0.25 * Math.sin(time * 2.2 + gp.ph);
    glowN = glowAddInto(glowScratch, glowN, gp.x, gp.y, gp.z, gp.r * (0.9 + 0.1 * Math.sin(time * 3.1 + gp.ph)), acc[0], acc[1], acc[2], a);
  }
  drawGlowList(glowScratch, 0, glowN);
  /* crystals */
  instBegin();
  for (var ci = 0; ci < world.crystals.length; ci++) {
    var c = world.crystals[ci];
    if (!c.alive) continue;
    var pu = 1 + 0.08 * Math.sin(time * 2.4 + c.ph);
    /* being chewed: it shakes, and the colour walks from ice to ember so the
       last half-second is legible from across the arena */
    var jx = 0, jz = 0, cg = [140, 220, 255];
    if (c.gnaw > 0) {
      var jf = Math.min(1, c.gnaw / 2.1);
      jx = Math.sin(time * 34 + c.ph) * 0.06 * jf;
      jz = Math.cos(time * 29 + c.ph) * 0.06 * jf;
      cg = [140 + 115 * jf | 0, 220 - 60 * jf | 0, 255 - 150 * jf | 0];
      pu += jf * 0.05;
    }
    C.limb2(MM, c.x + jx, c.y, c.z + jz, c.ph, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.9 * c.s * pu, 0.9 * c.s * pu, 0.9 * c.s * pu);
    instPart('cone', 'crystal', MM, cg);
  }
  drawInstanced('cone', 'crystal', [60, 160, 255], 1);
  for (var cj = 0; cj < world.crystals.length; cj++) {
    var cc = world.crystals[cj];
    if (!cc.alive) continue;
    shadowPush(cc.x, cc.y, cc.z, 0.55 * cc.s, 0.5);
  }
  /* shadows (soft round, one draw) */
  shadowFx.length = 0;
  if (R) shadowPush(R.rx, R.ry, R.rz, 0.62, 0.85);
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    if (!e.dead) shadowPush(e.rx, e.ry, e.rz, e.r + 0.15, 0.75);
    else if (e.dieT > 0) shadowPush(e.rx, world.heightAt(e.rx, e.rz), e.rz, (e.r + 0.15) * clamp(e.dieT / CORP_T, 0, 1), 0.4);
  }
  drawGlowList(shadowFx, 1);
  /* pickups */
  for (var pi = 0; pi < pickups.length; pi++) {
    var p = pickups[pi];
    var py = p.y + Math.sin(p.ph) * 0.12;
    var pmeta = POWER_META[p.k];
    var col = p.k === 'heart' ? [255, 90, 120] : (pmeta ? pmeta.col : [110, 190, 255]);
    var psz = pmeta ? 0.4 : (p.k === 'heart' ? 0.32 : 0.3);
    C.limb2(MM, p.x, py, p.z, p.ph * 1.4, 0, 0, 0, 0.5, 0.5, 0, 0, 0, psz, psz, psz);
    instPart(p.k === 'heart' ? 'sphereL' : 'cone', p.k === 'heart' ? '' : 'crystal', MM, col);
    if (pmeta) {
      /* powers get a soft halo so they read as rare */
      haloN = glowAddInto(haloScratch, haloN, p.x, py + 0.35, p.z, 0.75, col[0], col[1], col[2], 0.5 + 0.2 * Math.sin(p.ph * 2));
    }
    if (Math.random() < 0.25) fxPush({ x: p.x + rnd2(-0.15, 0.15), y: py + rnd2(0, 0.2), z: p.z + rnd2(-0.15, 0.15), vx: 0, vy: rnd2(0.3, 0.8), vz: 0, life: 0.5, max: 0.5, s: 0.08, pr: col[0], pg: col[1], pb: col[2], pa: 0.7, grav: 0 });
  }
  if (haloN) drawGlowList(haloScratch, 0, haloN);
  haloN = 0;
  /* enemies */
  for (var ei2 = 0; ei2 < enemies.length; ei2++) { var eg = enemies[ei2]; if (!eg.dead || eg.dieT > 0) drawGoblin(eg); }
  for (var ei3 = 0; ei3 < enemies.length; ei3++) drawThiefLoot(enemies[ei3]);
  drawGoblinGlow();
  /* elite auras + attack telegraphs (one additive pass) */
  for (var et = 0; et < enemies.length; et++) {
    var ee = enemies[et];
    if (ee.dead) continue;
    if (ee.elite) {
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + ee.h * 0.55, ee.rz, ee.r * 1.5, 255, 214, 94, 0.34 + 0.12 * Math.sin(time * 4 + ee.ph));
    }
    /* spawn-in: a rising portal ring so nothing appears inside your hitbox
       without you having seen it coming */
    if (ee.spawnT > 0) {
      var sfp = 1 - ee.spawnT / SPAWN_T;
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + 0.06, ee.rz, ee.r * (0.6 + sfp * 2.4), 150, 240, 200, 0.22 + sfp * 0.5);
    }
    /* lock-on: a gold ring at the feet + a soft glow, so the target is
     identifiable from the corner of your eye without looking for the reticle */
    if (lockOn === ee) {
      var lg = 0.5 + 0.25 * Math.sin(time * 7);
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + 0.07, ee.rz, ee.r * 2.6, 255, 214, 94, 0.45 * lg);
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + ee.h * 1.05, ee.rz, ee.r * 1.15, 255, 230, 140, 0.34 * lg);
    }
    /* lunge windup: rising red flare at the feet — dodge window made visible */
    if (ee.tele > 0) {
      var tg = 1 - ee.tele / 0.3;
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + ee.h * 0.45, ee.rz, ee.r * (1.4 + tg * 0.8), 255, 80, 60, 0.22 + tg * 0.42);
      /* head-height flare too, so the telegraph reads without looking down */
      haloN = glowAddInto(haloScratch, haloN, ee.rx, ee.ry + ee.h + 0.5, ee.rz, 0.22 + tg * 0.12, 255, 100, 70, 0.35 + tg * 0.5);
    }
    if (ee.k === 'boss' && ee.actKind === 'slam' && ee.actT > 0) {
      var st = 1 - ee.actT / 0.5; /* 0 → 1 as the pound lands */
      haloN = glowAddInto(haloScratch, haloN, ee.rx, world.heightAt(ee.rx, ee.rz) + 0.12, ee.rz, 4.8 * (0.25 + 0.75 * st), 255, 120, 60, 0.16 + 0.4 * st);
    }
  }
  if (haloN) { drawGlowList(haloScratch, 0, haloN); haloN = 0; }
  /* mouse-assist aim marker on the ground (gold when locked on a goblin) */
  if (state === 'play') {
    drawGlowList([{ x: aim.x, y: aim.y + 0.07, z: aim.z,
      s: aim.lock ? 0.55 : 0.34,
      pr: aim.lock ? 255 : 190, pg: aim.lock ? 205 : 225, pb: aim.lock ? 90 : 255,
      pa: 0.85, life: 1, max: 1 }], 0);
  }
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
  /* offscreen threat arrows (DOM) */
  updateOffscreenArrows();
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
  gl.uniform1f(uInst.uTime, time);
  gl.uniform1f(uInst.uSway, pd.key === 'leaf' ? 1 : 0); /* wind on the foliage */
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
/* Snapshot the *pre-step* transform of every rendered entity so the frame
 * draw can interpolate between the last two fixed states. Without this the
 * whole world visibly crawls on any display whose refresh != 60 Hz, because
 * the sim publishes one pose per 1/60 s while frames arrive faster. */
function snapshotPrev() {
  if (R) { R.prx = R.x; R.pry = R.y; R.prz = R.z; R.pryaw = R.yaw; }
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    e.prx = e.x; e.pry = e.y; e.prz = e.z; e.pryaw = e.yaw;
  }
}
/* re-baseline an entity that was teleported (spawn, wave reset) so the
 * interpolator never drags it in from the origin */
function syncPrev(o) {
  o.prx = o.x; o.pry = o.y; o.prz = o.z; o.pryaw = o.yaw;
  o.rx = o.x; o.ry = o.y; o.rz = o.z; o.ryaw = o.yaw;
}
function syncRender(a) {
  if (R) {
    R.rx = R.prx + (R.x - R.prx) * a;
    R.ry = R.pry + (R.y - R.pry) * a;
    R.rz = R.prz + (R.z - R.prz) * a;
    R.ryaw = angLerp(R.pryaw, R.yaw, a);
  }
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    e.rx = e.prx + (e.x - e.prx) * a;
    e.ry = e.pry + (e.y - e.pry) * a;
    e.rz = e.prz + (e.z - e.prz) * a;
    e.ryaw = angLerp(e.pryaw, e.yaw, a);
  }
}
function stepSim() {
  var pdt = dt;          /* presentation clock — the sim must never read it */
  dt = FIXED;            /* the sim tick clock: 1/60 s, always, at any fps */
  frame++;
  tickRand = N.simRng(runSeedNum, frame);
  snapshotPrev();
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
  if (game.shakeT > 0) { game.shakeT -= FIXED; if (game.shakeT < 0) game.shakeT = 0; }
  if (game.bannerT > 0) {
    game.bannerT -= FIXED;
    if (game.bannerT <= 0 && bannerEl && bannerEl.style.opacity === '1' && state === 'play') bannerEl.style.opacity = '0';
  }
  updateHUD();
  dt = pdt;
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
    if (Math.abs(c.x - R.x) < 1.1 && Math.abs(c.z - R.z) < 1.1 && Math.abs(c.y - R.y) < 2.2) { shatterCrystal(c, true); continue; }
    /* Goblins eat the scenery. A crystal nobody is standing next to is mana the
       tide will nibble away: two seconds of chewing and it is gone, which turns
       the arena into ground worth defending instead of flat floor to clear.
       The shard it leaves is a race you can still win — and a goblin at your
       crystal is a goblin beside a gem, which is where theft actually starts. */
    var chewer = null;
    enemyGrid.query(c.x, c.z, _qGnaw);
    for (var gi = 0; gi < _qGnaw.length; gi++) {
      var ge = _qGnaw[gi];
      if (ge.dead || ge.spawnT > 0 || ge.stun > 0 || ge.recT > 0) continue;
      if (Math.abs(ge.x - c.x) > 1.3 || Math.abs(ge.z - c.z) > 1.3) continue;
      if (Math.abs(ge.y - c.y) > 2) continue;
      chewer = ge; break;
    }
    if (chewer) {
      var wasG = c.gnaw || 0;
      c.gnaw = wasG + dtC;
      if (wasG < 0.05 && c.gnaw >= 0.05) {
        sfxGated('low');
        popText(c.x, c.y + 2.2, c.z, 'EY!', false, '#ffd75e');
      }
      if (c.gnaw >= 2.1) gnawCrystal(c);
    } else if (c.gnaw) c.gnaw = Math.max(0, c.gnaw - dtC * 0.6);
  }
}
function gnawCrystal(c) {
  c.alive = false;
  c.gnaw = 0;
  /* deliberately NOT shatterCrystal: they got the prize, not you */
  c.respawn = 26 + tickRand() * 10;
  game.gnawed++;
  burst(c.x, c.y + 1.1 * c.s, c.z, [255, 150, 90], 20, 7, 1.4, 0.28, 0.6);
  ringBurst(c.x, c.y + 0.2, c.z, [255, 190, 120], 4);
  popText(c.x, c.y + 2.3, c.z, 'GNAWED!', false, '#ff8a6a');
  sfx('hit');
  game.shake = Math.max(game.shake, 0.16);
  spawnPickup('gem', c.x, c.y + 0.7, c.z);
}
function updateFxVisual(dtF) {
  if (zoomPulse > 0) zoomPulse = Math.max(0, zoomPulse - dtF * 2.6);
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
var fxScale = 1; /* particle counts scale with render quality on weak GPUs */
function setFxScale() { fxScale = renderScale >= 0.95 ? 1 : (renderScale >= 0.8 ? 0.75 : 0.5); }
function adaptQuality(rawDt) {
  qualityT += rawDt;
  if (qualityT < 0.55) return;
  qualityT = 0;
  if (lastFps > 0 && lastFps < 48) { lowStreak++; hiStreak = 0; }
  else if (lastFps >= 58) { hiStreak++; lowStreak = 0; }
  else { lowStreak = 0; hiStreak = 0; }
  if (lowStreak >= 2 && renderScale > 0.62) { renderScale = Math.max(0.6, renderScale - 0.1); resize(); setFxScale(); lowStreak = 0; }
  else if (hiStreak >= 4 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.1); resize(); setFxScale(); hiStreak = 0; }
}
var fpsShown = -1;
function updateFpsEl() {
  if (lastFps <= 0) return;
  if (lastFps === fpsShown) return;
  fpsShown = lastFps;
  var f = el('fps');
  if (f) {
    f.textContent = fpsShown + ' FPS';
    f.style.color = fpsShown < 30 ? 'rgba(255,140,120,.8)' : (fpsShown < 48 ? 'rgba(255,214,120,.6)' : 'rgba(180,220,255,.5)');
  }
}
function loop(tms) {
  requestAnimationFrame(loop);
  if (NOGL) return;
  var t = tms / 1000;
  var rawDt = clamp(t - lastT, 0.001, 0.05);
  lastT = t;
  dt = rawDt;
  fpsT += rawDt; fpsN++;
  if (fpsT >= 0.5) { lastFps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; updateFpsEl(); }
  adaptQuality(rawDt);
  pollGamepad(rawDt);
  musicTick();
  updateFxVisual(rawDt);
  /* slow-motion (perfect dodges, nova, boss deaths): the *render* clock keeps
     running at full speed so the camera stays silky, while sim ticks are fed
     at a reduced rate. Each tick is still exactly 1/60 s of sim time, so the
     determinism contract holds at any refresh rate or time scale. */
  if (game.slowT > 0) { game.slowT -= rawDt; if (game.slowT <= 0) { game.slowT = 0; game.slowK = 1; } }
  var ts = game.slowT > 0 ? game.slowK : 1;
  var alpha = 1;
  if (state === 'title') {
    time += rawDt;
    updateCamera(rawDt, { x: 0, y: 0, z: 0 });
    render();
  } else if (state === 'play' || state === 'pause' || state === 'pick') {
    if (state === 'play') {
      updateAim();
      if (hitStop > 0) {
        hitStop -= rawDt;   /* hold the pose (and acc) — freeze frame, not a pop */
      } else {
        acc += rawDt * ts;
        var steps = 0;
        while (acc >= FIXED && steps < 5) { stepSim(); acc -= FIXED; steps++; }
        if (steps === 5) acc = 0;
      }
    }
    alpha = clamp(acc / FIXED, 0, 1);
    syncRender(alpha);
    updateCamera(rawDt, { x: R.rx, y: R.ry, z: R.rz });
    updateReticle();
    render();
  } else if (state === 'over') {
    time += rawDt;
    syncRender(1);
    updateCamera(rawDt, { x: R.rx, y: R.ry, z: R.rz });
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
var jumpHeld = false, dashHeld = false, novaHeld = false, meleeHeld = false;
var moveStickActive = false, moveStickX = 0, moveStickY = 0;
var aimStickActive = false, aimStickX = 0, aimStickY = 0;
var isTouch = false;
var downX = 0, downY = 0, downT = 0, dragLookActive = false;

/* ---- gamepad (standard mapping: L-stick move, R-stick aim, A/B/X/Y) ---- */
var gpMove = [0, 0], gpAiming = false, gpFire = false;
var gpJumpEdge = false, gpDashEdge = false, gpNovaEdge = false, gpMeleeEdge = false, gpPad = false;
function gpDead(v) { return Math.abs(v) < 0.18 ? 0 : v; }
function pollGamepad(rawDt) {
  var hadPad = gpPad;
  gpPad = false;
  var pads = null;
  try { pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null; } catch (e) { pads = null; }
  var pad = null;
  if (pads) for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
  if (!pad) { gpMove[0] = 0; gpMove[1] = 0; gpAiming = false; gpFire = false; return; }
  gpPad = true;
  if (hadPad !== gpPad) updateGpHint();
  gpMove[0] = gpDead(pad.axes[0] || 0);
  gpMove[1] = gpDead(pad.axes[1] || 0);
  var rx = gpDead(pad.axes[2] || 0), ry = gpDead(pad.axes[3] || 0);
  gpAiming = (rx !== 0 || ry !== 0);
  if (gpAiming) {
    var gpk = 85 * CAMSET.sens;
    camYawTarget -= rx * gpk * rawDt;
    camPitchTarget = clamp(camPitchTarget + ry * gpk * 0.75 * rawDt * (CAMSET.invertY ? -1 : 1), CAM_PIT_MIN, CAM_PIT_MAX);
    lastAimT = time;
  }
  var b = pad.buttons || [];
  function down(idx) { return !!(b[idx] && b[idx].pressed); }
  var prev = gpPrev; /* read current state, replace below */
  function edge(idx) { return down(idx) && !prev[idx]; }
  gpFire = down(0);
  gpJumpEdge = edge(1);
  gpDashEdge = edge(2);
  gpNovaEdge = edge(3);
  gpMeleeEdge = edge(5);                      /* RB = smack; LB = zoom in */
  if (down(4)) camDistTarget = clamp(camDistTarget - 0.12, CAM_DIST_MIN, CAM_DIST_MAX);
  if (edge(6)) camDistTarget = clamp(camDistTarget + 0.12, CAM_DIST_MIN, CAM_DIST_MAX);
  if (edge(8)) { if (lockOn) lockOn = null; else cycleLockOn(); } /* select / lock-on */
  if (edge(9)) {                                                          /* start: pause */
    if (state === 'play') pauseGame();
    else if (state === 'pause') resumeGame();
  }
  gpPrev = { 0: down(0), 1: down(1), 2: down(2), 3: down(3), 4: down(4), 5: down(5), 6: down(6), 9: down(9) };
}
var gpPrev = {};
function updateGpHint() {
  var h = el('gpHint');
  if (!h) return;
  h.style.display = gpPad ? 'block' : 'none';
}

function moveVec() {
  var sr = 0, su = 0;
  if (keys['KeyW'] || keys['ArrowUp']) su += 1;
  if (keys['KeyS'] || keys['ArrowDown']) su -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) sr -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) sr += 1;
  if (moveStickActive) { sr = moveStickX; su = moveStickY; }
  if (gpMove[0] !== 0 || gpMove[1] !== 0) { sr = gpMove[0]; su = gpMove[1]; }
  var l = Math.hypot(sr, su);
  if (l > 1) { sr /= l; su /= l; }
  /* Camera-relative, using the *view's own* right row: m4Look builds
     right = cross(up, -forward), which at camYaw=0 (looking +Z) is world -X.
     The old basis was its mirror, so A/D were swapped — and any "fix" to the
     mouse X sign would only have moved the bug. */
  var yw = camYaw;
  /* Locked on? orbit the target instead of the camera: W closes, S creates
     space, A/D circle — the classic action-game strafe. */
  if (CAMSET.orbit && lockOn && !lockOn.dead) yw = Math.atan2(lockOn.x - R.x, lockOn.z - R.z);
  var fd = [Math.sin(yw), Math.cos(yw)];
  var rt = [-Math.cos(yw), Math.sin(yw)];
  return [rt[0] * sr + fd[0] * su, rt[1] * sr + fd[1] * su];
}
document.addEventListener('keydown', function (e) {
  /* Typing a world seed must not cast spells. While a form field has the
     caret, only Enter (start this world) and Escape (hand it back) are game
     input; every other key belongs to the text box. Before this, M/N/Space
     typed into the seed field muted the audio and hurled Riley around. */
  var tgt = e.target;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' ||
      tgt.isContentEditable) && e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Escape') return;
  audioInit();
  if (e.code === 'Space') e.preventDefault();
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { startGame(); return; }
  if (state === 'over' && e.code === 'Space') { startGame(); return; }
  if (state === 'pick') {
    var bi = e.code === 'Digit1' || e.code === 'Numpad1' ? 0 : e.code === 'Digit2' || e.code === 'Numpad2' ? 1 :
      e.code === 'Digit3' || e.code === 'Numpad3' ? 2 : -1;
    if (bi >= 0) { e.preventDefault(); pickBoon(bi); return; }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); pickBoon(0); return; }
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyN') toggleMusic();
  if (e.code === 'KeyP') {
    if (state === 'play') pauseGame();
    else if (state === 'pause') resumeGame();
  }
  if (e.code === 'Tab' || e.code === 'KeyZ') {
    e.preventDefault();
    if (state === 'play') {
      if (lockOn) lockOn = null;
      else cycleLockOn();
    }
  }
  if (e.code === 'KeyC') meleePulse = 0.05;
  if (e.code === 'KeyR' && state === 'play') resetCamera(true);
  if (e.code === 'KeyL' && state === 'play') { toggleAimMode(); }
  if (e.code === 'KeyV' && state === 'play') {
    CAMSET.autoFrame = CAMSET.autoFrame ? 0 : 1;
    CAMSET.lockCam = CAMSET.lockCam ? 0 : 1;
    saveCamSet();
    showBanner(CAMSET.autoFrame ? 'CAMERA: AUTO-FRAME ON' : 'CAMERA: FREE LOOK',
      'LOCK ' + (CAMSET.lockCam ? 'ON' : 'OFF') + ' · ' + (CAMSET.autoFrame ? 'CAM SWINGS BEHIND AS YOU RUN' : 'CAM ONLY MOVES WHEN YOU DO'));
  }
  if (e.code === 'BracketLeft' && state === 'play') camDistTarget = clamp(camDistTarget - 0.9, CAM_DIST_MIN, CAM_DIST_MAX);
  if (e.code === 'BracketRight' && state === 'play') camDistTarget = clamp(camDistTarget + 0.9, CAM_DIST_MIN, CAM_DIST_MAX);
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
  if (!pointerLocked) {
    /* re-centre the steering anchor: coming out of a lock must never fling
       the camera toward wherever the cursor happens to be sitting */
    mouseX = Ww / 2; mouseY = Hh / 2;
  }
});
function lookDelta(mx, my, k) {
  var sens = k * CAMSET.sens;
  camYawTarget -= mx * 0.0028 * sens;
  camPitchTarget = clamp(camPitchTarget + my * 0.0022 * sens * (CAMSET.invertY ? -1 : 1), CAM_PIT_MIN, CAM_PIT_MAX);
  lastAimT = time;
}
document.addEventListener('mousemove', function (e) {
  if (pointerLocked) lookDelta(e.movementX, e.movementY, 1);
  else if (dragLookActive) lookDelta(e.movementX, e.movementY, 1.15);
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
    } else if (CAMSET.aimMode === 1 && finePointer) {
      /* pointer-lock aim (opt-in): click the arena to grab the cursor. If the
         browser refuses, the cursor-steer path below still works — a failed
         lock is never a dead camera. */
      try { canvas.requestPointerLock(); } catch (err) {}
      dragLookActive = true;
      dragMovedAcc = 0;
    } else {
      /* cursor aim (default): left-click simply fires at the cursor. */
      mouseFire = true;
      tapPulse = 0.07;
    }
  } else if (e.button === 2) {
    /* right mouse = the staff butt. Deliberately NOT the dash: aiming and
       clicking were fighting for the same finger before. */
    meleeHeld = true;
    setTimeout(function () { meleeHeld = false; }, 40);
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
/* mouse-wheel dolly (Zelda zoom) */
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  if (state !== 'play') return;
  var d = e.deltaY;
  if (e.deltaMode === 1) d *= 16;            /* line-mode mice */
  camDistTarget = clamp(camDistTarget + d * 0.0075, CAM_DIST_MIN, CAM_DIST_MAX);
  CAMSET.zoom = camDistTarget; saveCamSet();
  zoomPulse = 0.35;
}, { passive: false });

function pollInputLive() {
  fireNow = mouseFire || tapPulse > 0 || keys['KeyF'] || (aimStickActive) || gpFire;
  jumpNow = keys['Space'] || jumpHeld || gpJumpEdge;
  dashNow = keys['ShiftLeft'] || keys['ShiftRight'] || dashHeld || gpDashEdge;
  novaNow = keys['KeyQ'] || keys['KeyE'] || novaHeld || gpNovaEdge;
  meleeNow = meleeHeld || meleePulse > 0 || keys['KeyC'] || gpMeleeEdge;
  gpJumpEdge = false; gpDashEdge = false; gpNovaEdge = false; gpMeleeEdge = false;
  if (tapPulse > 0) tapPulse -= FIXED;
  if (meleePulse > 0) meleePulse -= FIXED;
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
  bindBtn('tbSmack', function (v) { if (v) meleePulse = 0.05; });
}
window.addEventListener('touchstart', function () { if (!isTouch) setupTouch(); }, { passive: true });
window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && !isTouch) setupTouch(); }, { passive: true });

/* ================================================================
 * 19. audio (procedural sfx + generative music)
 * ================================================================ */
var AC = null, noiseBuf = null, muted = false, masterGain = null, musicGain = null;
var masterVol = 0.8;
try { masterVol = clamp(+(localStorage.getItem('riley3d.vol') || 0.8), 0, 1); } catch (e) {}
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = AC.createGain();
    masterGain.gain.value = muted ? 0 : masterVol;
    masterGain.connect(AC.destination);
    musicGain = AC.createGain();
    musicGain.gain.value = MUS.on ? 0.5 : 0;
    musicGain.connect(masterGain);
    var len = Math.floor(AC.sampleRate * 0.6), nb = AC.createBuffer(1, len, AC.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = nb;
    MUS.nextT = 0; /* reschedule from "now" on first unlock */
  } catch (e) { AC = null; }
}
/* ---- generative score: drone + pentatonic arp, intensity follows the fight ---- */
var MUS = {
  on: true, nextT: 0, step: 0, drone: null,
  roots: [55, 43.65, 65.41, 49],              /* A1  F1  C2  G1  — Am / F  / C  / G */
  scale: [220, 261.63, 293.66, 329.63, 392, 440, 523.25],  /* A minor pentatonic */
  arp: [0, 2, 4, 3, 5, 4, 2, 1]
};
try { MUS.on = localStorage.getItem('riley3d.mus') !== '0'; } catch (e) {}
function musicIntensity() {
  if (state === 'over') return 0.3;
  if (state !== 'play') return 0.35;
  return game.boss ? 1 : Math.min(1, 0.5 + (game.wave - 1) * 0.06);
}
function mTone(f0, f1, dur, type, vol, t) {
  if (!AC || !musicGain) return;
  try {
    var o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.4;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) {}
}
function startDrone() {
  if (!AC || !musicGain || MUS.drone) return;
  try {
    var g = AC.createGain(); g.gain.value = 0.05;
    var f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.5;
    var o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    var o2 = AC.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 82.5;
    var g2 = AC.createGain(); g2.gain.value = 0.4;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(musicGain);
    o1.start(); o2.start();
    MUS.drone = { o1: o1, o2: o2, g: g };
  } catch (e) {}
}
function musicTick() {
  if (!AC || !MUS.on) return;
  if (!MUS.drone) startDrone();
  if (MUS.nextT < AC.currentTime - 0.5) MUS.nextT = AC.currentTime + 0.06; /* resync after tab-sleep */
  var intns = musicIntensity();
  var stepDur = state === 'play' && game.boss ? 0.27 : 0.33;
  while (MUS.nextT < AC.currentTime + 0.4) {
    var step = MUS.step, t = MUS.nextT;
    var beat = step % 8, bar = Math.floor(step / 8) % 4;
    var root = MUS.roots[bar];
    if (beat === 0) {
      /* drone glides to the bar root */
      if (MUS.drone) {
        MUS.drone.o1.frequency.setTargetAtTime(root, t, 0.6);
        MUS.drone.o2.frequency.setTargetAtTime(root * 1.5, t, 0.6);
      }
      mTone(root * 2, root * 2, 0.5, 'sine', 0.05 * intns, t);
    }
    if (beat === 4) mTone(root * 2, root * 2, 0.35, 'sine', 0.04 * intns, t);
    /* arpeggio: every 8th at full intensity, every other 8th otherwise */
    if (intns > 0.6 || beat % 2 === 0) {
      var ni = MUS.arp[beat];
      var f = MUS.scale[ni] * (beat === 6 ? 1.5 : 1);
      mTone(f, f, 0.26, 'triangle', (0.02 + 0.022 * intns) * (state === 'play' ? 1 : 0.55), t);
      if (intns > 0.75 && beat === 2) mTone(f * 2, f * 2, 0.14, 'sine', 0.016, t);
    }
    if (state === 'play' && game.boss && beat === 3) {
      mTone(root * 3, root * 2.9, 0.18, 'sawtooth', 0.014, t); /* tension pulse */
    }
    MUS.nextT += stepDur;
    MUS.step = (step + 1) % 32;
  }
}
/* sfx rate gate: spammy one-shots (shots, hits, coins) max ~6 per 150ms */
var sfxGateT = 0, sfxGateN = 0;
function sfxGated(n) {
  if (time - sfxGateT > 0.15) { sfxGateT = time; sfxGateN = 0; }
  if (sfxGateN >= 6) return;
  sfxGateN++;
  sfx(n);
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
    o.connect(g); g.connect(masterGain);
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
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(t); src.stop(t + dur + 0.03);
  } catch (e) {}
}
function applyMute() {
  if (masterGain) masterGain.gain.value = muted ? 0 : masterVol;
}
function toggleMusic() {
  MUS.on = !MUS.on;
  if (musicGain) musicGain.gain.value = MUS.on ? 0.5 : 0;
  try { localStorage.setItem('riley3d.mus', MUS.on ? '1' : '0'); } catch (e) {}
  var b = el('btnMusic');
  if (b) b.textContent = MUS.on ? '🎵' : '⊘';
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
    case 'power': tone(440, 1320, 0.2, 'triangle', 0.06); tone(660, 1980, 0.24, 'sine', 0.04, 0.05); noiseS(0.14, 0.03, 1400, 3400, 0.03); break;
  }
}
function toggleMute() {
  muted = !muted;
  el('btnMute').textContent = muted ? '🔇' : '🔊';
  applyMute();
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
  B = newBoons();
  game.boonN = {}; game.boonsTaken = 0; game.boonOffer = null;
  hide('ovPick');
  if (state === 'pick') state = 'play';
  updateBoonBar(true);
  hide('ovTitle'); hide('ovOver'); hide('ovPause');
  game.score = 0; game.wave = 1; game.lives = game.maxLives = 5; game.kills = 0; shownScore = 0;
  game.combo = 0; game.comboBest = 0; game.boss = false; game.shake = 0;
  game.waveState = 'idle'; game.clearT = 0; game.spawnQueue = [];
  shots.length = 0; fx.length = 0; enemies.length = 0; eShots.length = 0; pickups.length = 0;
  buffs.dmg = 0; buffs.spd = 0; buffs.regen = 0;
  resetHudCache();
  var si = el('seedInput');
  var want = si ? String(si.value || '').trim().toUpperCase() : '';
  seedStr = want || ('RLY-' + Math.floor(Math.random() * 900000 + 100000));
  el('seedLine').textContent = 'WORLD ' + seedStr + ' · ' + world.realm.n;
  buildWorld(seedStr);
  fogCur = fogTarget.slice();
  fogTarget = world.realm.fog.slice();
  resetRiley();
  makeSession();
  lockOn = null;
  /* camera starts BEHIND Riley, looking where he looks (was +π: face-cam) */
  camSnapToPlayer();
  state = 'play';
  frame = 0;
  acc = 0;
  audioInit();
  /* grab the cursor only in pointer-lock aim mode — cursor mode needs the
     pointer free, and an eager lock there is exactly what made controls feel
     stuck on browsers that refuse or throttle the request */
  if (CAMSET.aimMode === 1 && finePointer && !isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
  /* drop focus from whatever button started the run so Space can't re-click
     it mid-fight (a hidden focused button eats the jump key) */
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  tickRand = C.mulberry32(runSeedNum ^ 0x7A7A);
  startWave(1);
  updateHUD();
}
function endGame() {
  state = 'over';
  try { if (document.pointerLockElement === canvas) document.exitPointerLock(); } catch (e) {}
  var isBest = game.score > best;
  if (isBest) {
    best = game.score;
    try { localStorage.setItem('riley3d.best', best); } catch (e) {}
  }
  el('bestLine2').textContent = isBest && best > 0 ? '🏆 NEW BEST! ' + best : '';
  runStats.games++;
  runStats.kills += game.kills;
  runStats.bestWave = Math.max(runStats.bestWave, game.wave);
  runStats.bestCombo = Math.max(runStats.bestCombo, game.comboBest);
  saveRunStats();
  var rk = rankFor();
  var rkEl = el('stRank');
  rkEl.textContent = rk[0];
  rkEl.style.color = rk[0] === 'S' ? '#ffd75e' : rk[0] === 'A' ? '#7fe4ff' : rk[0] === 'B' ? '#7dffa8' : rk[0] === 'C' ? '#cfd8ff' : '#8b96b8';
  el('stRankFlavor').textContent = rk[1];
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
  resetHudCache();
  el('bossBar').style.display = 'none';
  refreshTitleStats();
  titleScene();
}
/* ---- the camera panel in the pause overlay -------------------------------
   Camera feel is the single most subjective thing in a third-person game:
   the numbers that feel great to whoever built it feel like motion sickness
   to the next person. So every dial in CAMSET is exposed here, applies live,
   and persists (localStorage), and shake has a real zero for people who need
   it. Bound once at boot; refreshed on every pause so it shows current state
   (the wheel and V change it too). */
var CAM_UI = [
  { id: 'camSens', key: 'sens', scale: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
  { id: 'camSmooth', key: 'smooth', scale: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
  { id: 'camFov', key: 'fov', scale: 1, fmt: function (v) { return (v > 0 ? '+' : '') + Math.round(v); } },
  { id: 'camDist', key: 'zoom', scale: 10, fmt: function (v) { return v.toFixed(1) + 'u'; } },
  { id: 'camShake', key: 'shake', scale: 100, fmt: function (v) { return v <= 0.001 ? 'OFF' : Math.round(v * 100) + '%'; } }
];
var CAM_TGL = [
  { id: 'tglFrame', key: 'autoFrame' },
  { id: 'tglLock', key: 'lockCam' },
  { id: 'tglOrbit', key: 'orbit' },
  { id: 'tglInvY', key: 'invertY' }
];
/* AIM MODE — cursor steer vs pointer lock. Two dials on the same game:
   cursor mode never asks the browser for anything (nothing can refuse, so the
   camera can never stick), lock mode is the classic FPS look. Both persist. */
function aimModeLabel() { return CAMSET.aimMode === 1 ? 'LOCK AIM' : 'CURSOR AIM'; }
function toggleAimMode() {
  CAMSET.aimMode = CAMSET.aimMode === 1 ? 0 : 1;
  saveCamSet();
  camUiRefresh();
  sfxGated('pop');
  /* switching to lock mode is when we *try* to grab the pointer; switching
     back is when we make sure it is free again */
  if (CAMSET.aimMode === 1 && state === 'play' && finePointer && !isTouch) {
    try { canvas.requestPointerLock(); } catch (e) {}
  } else if (CAMSET.aimMode === 0) {
    try { if (document.pointerLockElement === canvas) document.exitPointerLock(); } catch (e) {}
    mouseX = Ww / 2; mouseY = Hh / 2;
  }
  showBanner('AIM: ' + aimModeLabel(),
    CAMSET.aimMode === 1 ? 'CLICK CANVAS TO LOCK · MOUSE LOOKS' : 'CAMERA FOLLOWS YOUR CURSOR · CLICK TO CAST');
}
function camUiRefresh() {
  var i, r;
  for (i = 0; i < CAM_UI.length; i++) {
    r = CAM_UI[i];
    var sl = el(r.id), lab = el(r.id + 'V');
    if (sl) sl.value = String(Math.round(CAMSET[r.key] * r.scale));
    if (lab) lab.textContent = r.fmt(CAMSET[r.key]);
  }
  for (i = 0; i < CAM_TGL.length; i++) {
    var b = el(CAM_TGL[i].id);
    if (b) { b.classList.toggle('on', !!CAMSET[CAM_TGL[i].key]); b.setAttribute('aria-pressed', CAMSET[CAM_TGL[i].key] ? 'true' : 'false'); }
  }
  var ab = el('tglAim');
  if (ab) { ab.classList.toggle('on', CAMSET.aimMode === 1); ab.textContent = aimModeLabel(); }
}
function camUiBind() {
  CAM_UI.forEach(function (r) {
    var sl = el(r.id);
    if (!sl || sl._camBound) return;
    sl._camBound = 1;
    sl.addEventListener('input', function () {
      CAMSET[r.key] = (+sl.value) / r.scale;
      if (r.key === 'zoom') camDistTarget = clamp(CAMSET.zoom, CAM_DIST_MIN, CAM_DIST_MAX);
      if (r.key === 'sens') lastAimT = time - 5;    /* don't fight the auto-frame */
      saveCamSet();
      camUiRefresh();
    });
  });
  CAM_TGL.forEach(function (t) {
    var b = el(t.id);
    if (!b || b._camBound) return;
    b._camBound = 1;
    b.onclick = function () {
      CAMSET[t.key] = CAMSET[t.key] ? 0 : 1;
      saveCamSet();
      camUiRefresh();
      sfxGated('pop');
      if (t.key === 'autoFrame' || t.key === 'lockCam') {
        showBanner('CAMERA ' + (CAMSET[t.key] ? 'ON' : 'OFF'), t.id === 'tglFrame'
          ? (CAMSET.autoFrame ? 'CAM SWINGS BEHIND AS YOU RUN' : 'CAM ONLY MOVES WHEN YOU DO')
          : (CAMSET.lockCam ? 'CAM FRAMES YOUR LOCKED TARGET' : 'LOCK ONLY MOVES YOUR AIM'));
      }
    };
  });
  camUiRefresh();
}

function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  /* a pause menu you cannot click because the cursor is still locked is not
     a menu — hand the pointer back and let resume re-grab it if lock mode */
  try { if (document.pointerLockElement === canvas) document.exitPointerLock(); } catch (e) {}
  camUiRefresh();
  el('pScore').textContent = Math.round(game.score);
  el('pWave').textContent = game.wave;
  el('pKills').textContent = game.kills;
  el('pCombo').textContent = '×' + Math.max(1, game.comboBest);
  show('ovPause');
  reticleEl.classList.remove('on');
  document.body.classList.remove('aiming');
}
function resumeGame() {
  if (state !== 'pause') return;
  state = 'play';
  hide('ovPause');
  if (CAMSET.aimMode === 1 && finePointer && !isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
}
function titleScene() {
  if (!world) buildWorld(seedStr || 'RILEY');
  fogCur = world.realm.fog.slice();
  fogTarget = world.realm.fog.slice();
  R = newRiley();
  R.yaw = titleA + Math.PI;
  enemies.length = 0; eShots.length = 0; shots.length = 0; pickups.length = 0;
  game.waveState = 'idle'; game.boss = false; game.spawnQueue = [];
  el('bossBar').style.display = 'none';
  var spots = [[-9, 8, 'grunt'], [9, -6, 'runner'], [0, -11, 'spitter']];
  for (var i = 0; i < spots.length; i++) {
    var g = newGob(spots[i][2], spots[i][0], 0, spots[i][1], i);
    g.y = world.heightAt(g.x, g.z);
    g.yaw = Math.atan2(-spots[i][0], -spots[i][1]);
    syncPrev(g);
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
el('btnMusic').onclick = toggleMusic;
el('btnMusic').textContent = MUS.on ? '🎵' : '⊘';
el('btnDaily').onclick = function () {
  /* daily world: everyone who clicks today fights the same goblin army */
  var d = new Date();
  var s = 'DAILY-' + d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
  el('seedInput').value = s;
  startGame();
};
el('btnPurge').onclick = function () {
  purgeBestiary();
  el('bestLine2').textContent = '🧠 Goblin memories purged';
};
el('tglAim').onclick = toggleAimMode;
/* buff bar rows (⚡ damage · ☄ speed · ✦ mana surge) */
makeBuffRow('⚡', '#ffd75e', 'dmg');
makeBuffRow('☄', '#7fe4ff', 'spd');
makeBuffRow('✦', '#d29aff', 'regen');
if (best > 0) el('bestLine').textContent = '🏆 BEST SCORE: ' + best;
var iq = A.iqAvg(bestiary);
if (iq > 0) el('iqLine').textContent = '🧠 GOBLIN IQ ' + iq + ' — the army remembers you';
refreshTitleStats();
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
camUiBind();
for (var _bi = 0; _bi < 3; _bi++) {
  (function (idx) {
    var btn = el('boon' + idx);
    if (btn) btn.onclick = function () { pickBoon(idx); };
  })(_bi);
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
    vx: R ? R.vx : 0, vy: R ? R.vy : 0, vz: R ? R.vz : 0,
    lean: R ? R.lean : 0, mo: R ? R.mo : 0, meleeN: R ? R.meleeN : 0,
    meleeT: R ? R.meleeT : 0, meleeCd: R ? R.meleeCd : 0, dodgeT: R ? R.dodgeT : 0,
    dashCd: R ? R.dashCd : 0, shootCd: R ? R.shootCd : 0, charge: R ? R.charge : 0,
    rope: R ? R.rope : 0, landT: R ? R.landT : 0, maxLives: game.maxLives,
    lastStand: !!game.lastStand,
    fx: fx.length, fps: lastFps, shots: shots.length,
    mana: R ? R.mana : 0, inv: R ? R.inv : 0,
    kbx: R ? R.kbx : 0, kbz: R ? R.kbz : 0, kbT: R ? R.kbT : 0,
    buffs: { dmg: buffs.dmg, spd: buffs.spd, regen: buffs.regen },
    eliteN: enemies.filter(function (e) { return e.elite && !e.dead; }).length,
    camX: camX, camY: camY, camZ: camZ, camYaw: camYaw, camPitch: camPitch,
    camDist: camDist, camLift: camLift, camRoll: camRoll, camFov: camFov,
    camEye: [eye[0], eye[1], eye[2]], camCtr: [ctr[0], ctr[1], ctr[2]],
    camPiv: [camPivX, camPivY, camPivZ], camBlockT: camBlockT, camShoulder: camShoulder,
    locked: pointerLocked, seed: world ? world.seed : '',
    lockOn: lockOn ? lockOn.k : null, aimAssist: aim.assist ? aim.assist.id : null };
};
if (SELFTEST) {
  window.__T = {
    info: function () {
      return { state: state, wave: game.wave, wv: game.waveState, q: game.spawnQueue ? game.spawnQueue.length : 0,
        n: enemies.length, es: eShots.length, score: game.score, kills: game.kills,
        combo: game.combo, lives: game.lives, boss: game.boss, iq: A.iqAvg(bestiary),
        crystals: world.crystals.filter(function (c) { return c.alive; }).length, pk: pickups.length,
        snatched: game.snatched, recovered: game.recovered, lost: game.lost, gnawed: game.gnawed,
        hash: session ? session.worldHash : 0, tick: session ? session.tick : 0 };
    },
    god: function (b) { if (b) R.inv = 1e9; },
    /* boons */
    offer: function () { return game.boonOffer ? game.boonOffer.map(function (b) { return b.id; }) : null; },
    pick: function (i) { return pickBoon(i === undefined ? 0 : i); },
    boons: function () { return JSON.parse(JSON.stringify(B)); },
    boonN: function () { return game.boonsTaken; },
    /* teleport (render pose resynced, so no 100u interpolation streak) */
    tp: function (x, z) {
      R.x = x; R.z = z; R.y = groundY(x, z); R.vx = 0; R.vz = 0; R.vy = 0;
      R.ground = true; syncPrev(R);
      return { x: R.x, z: R.z, y: R.y, d: Math.hypot(R.x, R.z) };
    },
    spawnGrace: function (i) { var e = enemies[i || 0]; return e ? e.spawnT : -1; },
    pkList: function () {
      return pickups.map(function (p) { return { k: p.k, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; });
    },
    heldKeys: function () { var out = []; for (var k in keys) if (keys[k]) out.push(k); return out; },
    crystal: function (i) {
      var c = world.crystals[i || 0];
      return c && { x: c.x, y: c.y, z: c.z, alive: c.alive, gnaw: +(c.gnaw || 0).toFixed(2), s: c.s };
    },
    /* the arena-lip crystal nearest Riley — the one the tide can actually reach */
    nearCrystal: function () {
      var bi = -1, bd = 1e9;
      for (var i = 0; i < world.crystals.length; i++) {
        var c = world.crystals[i];
        if (!c.alive) continue;
        var d = Math.hypot(c.x - R.x, c.z - R.z);
        if (d < bd) { bd = d; bi = i; }
      }
      var cc = bi < 0 ? null : world.crystals[bi];
      return cc && { i: bi, x: cc.x, y: cc.y, z: cc.z, gnaw: +(cc.gnaw || 0).toFixed(2), d: +bd.toFixed(2) };
    },
    take: function (id) {
      for (var i = 0; i < BOONS.length; i++) if (BOONS[i].id === id) return !!applyBoon(BOONS[i]);
      return false;
    },
    /* the contact branch of a goblin's attack, on demand — what the 8 Hz
       brain eventually does when a lunge lands, without waiting on its dice */
    touch: function (i) {
      var e = enemies[i || 0];
      if (!e || e.dead) return false;
      hitRiley(e);
      return true;
    },
    /* compact live view of the field, for the headless playtest bot */
    enemies: function () {
      var out = [];
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        out.push({ i: i, k: e.k, x: +e.x.toFixed(2), z: +e.z.toFixed(2), y: +e.y.toFixed(2),
          hp: +e.hp.toFixed(2), tele: +e.tele.toFixed(2), act: e.actKind, spawn: +e.spawnT.toFixed(2),
          elite: !!e.elite, steal: e.gemsStolen, d: +Math.hypot(e.x - R.x, e.z - R.z).toFixed(2) });
      }
      out.sort(function (a, b) { return a.d - b.d; });
      return out;
    },
    lensHide: function (i) { var e = enemies[i | 0]; return e ? lensHide(e) : null; },
    cam: function () {
      return { block: +camBlockT.toFixed(3), lift: +camLift.toFixed(2), dist: +camDist.toFixed(2), body: +camBodyT.toFixed(2),
        fov: +camFov.toFixed(3), roll: +camRoll.toFixed(3), shake: +game.shake.toFixed(3),
        kick: +Math.hypot(camKickY, camKickP, camKickR).toFixed(3), shoulder: +camShoulder.toFixed(2) };
    },
    /* place: an instantly *combat-ready* goblin at an offset from Riley — the
       spawn-in grace is skipped so tests can exercise AI/attacks right away */
    place: function (k, dx, dz, elite) {
      var x = R.x + (dx !== undefined ? dx : Math.sin(R.yaw) * 6);
      var z = R.z + (dz !== undefined ? dz : Math.cos(R.yaw) * 6);
      var g = placeGoblin(k, x, z, elite);
      if (g) g.spawnT = 0;
      return g && { x: x, y: g.y, z: z, elite: g.elite, hp: g.hp, hpMax: g.hpMax };
    },
    drop: function (kind, dx, dz) {
      spawnPickup(kind, R.x + (dx === undefined ? 0.6 : dx), R.y + 0.5, R.z + (dz === undefined ? 0 : dz));
      return true;
    },
    buffs: function () {
      return { dmg: buffs.dmg, spd: buffs.spd, regen: buffs.regen };
    },
    slam: function () {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.k === 'boss' && !e.dead) { e.actKind = 'slam'; e.actT = 0.02; e.stun = 0; return true; }
      }
      return false;
    },
    bossState: function () {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.k === 'boss' && !e.dead) return { act: e.actKind, hp: e.hp, enrage: e.enrage, stun: e.stun };
      }
      return null;
    },
    fire: function () { fireShot(); },
    hurtAll: function () { for (var i = enemies.length - 1; i >= 0; i--) if (!enemies[i].dead) damageGob(enemies[i], 99, Math.sin(i + 1), Math.cos(i + 1)); },
    nextWave: function () { waveClear(); game.clearT = 0.01; },
    wave: function (n) { startWave(n); },
    /* the live view basis (rows of the view matrix). Tests use this to pin
       "D strafes toward the right edge of the screen" — the sign of the
       strafe basis against the projection is otherwise invisible headless. */
    /* bodyXform must never outlive one entity's draw — a leaked transform
       warps every goblin after it. Cheap to assert, impossible to see in a
       headless test otherwise. */
    bodyIdle: function () { return bodyXform === null; },
    basis: function () {
      return { right: [VM[0], VM[4], VM[8]], up: [VM[1], VM[5], VM[9]],
        /* row 2 of a GL view matrix is the camera's BACKWARD axis; negate so
           the hook reads like the world (fwd = where the camera looks) */
        fwd: [-VM[2], -VM[6], -VM[10]],
        yaw: camYaw, pitch: camPitch, dist: camDist, fov: camFov,
        eye: [eye[0], eye[1], eye[2]], ctr: [ctr[0], ctr[1], ctr[2]], kick: Math.hypot(camKickY, camKickP, camKickR) };
    },
    camBelow: function () { return world.heightAt(camX, camZ) - camY; },
    aim: function () {
      return { x: aim.x, y: aim.y, z: aim.z, lock: aim.lock ? aim.lock.k : null,
        dist: Math.hypot(aim.x - R.x, aim.z - R.z) };
    },
    zoom: function (d) { camDistTarget = clamp(camDistTarget + d, CAM_DIST_MIN, CAM_DIST_MAX); return camDistTarget; },
    resetCam: function () { resetCamera(true); return true; },
    lock: function (k) { if (k === null) { lockOn = null; return null; } cycleLockOn(); return lockOn ? lockOn.k : null; },
    setLock: function (i) { lockOn = enemies[i] || null; return !!lockOn; },
    camSet: function (k, v) { if (!(k in CAMSET)) return null; CAMSET[k] = v; saveCamSet(); return CAMSET[k]; },
    camGet: function () { return JSON.parse(JSON.stringify(CAMSET)); },
    /* combat taps for the headless tests (keys can't express a 1-frame pulse) */
    swing: function () { return meleeSwing(null); },
    dashDodge: function () { R.inv = Math.max(R.inv, 0.3); R.dodgeT = 0.34; return true; },
    slow: function () { return { t: game.slowT, k: game.slowK }; },
    eyeDist: function () { return Math.hypot(eye[0] - R.rx, eye[1] - R.ry, eye[2] - R.rz); },
    zoomMax: function () { return CAM_DIST_MAX; },
    zoomMin: function () { return CAM_DIST_MIN; },
    key: function (code, down) { keys[code] = !!down; },
    setInv: function (v) { if (R) R.inv = v; },
    lastEnemy: function () { return enemies.length ? enemies[enemies.length - 1] : null; },
    clearShots: function () { eShots.length = 0; shots.length = 0; },
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

