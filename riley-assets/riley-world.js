/* Riley World — seeded procedural world generation.
 * Pure JS (depends on RileyCore): produces heightfield + VBO-ready vertex
 * arrays for terrain & props, interactive crystal list, spawn points.
 * Browser: window.RileyWorld   Node: module.exports
 */
(function (root, factory) {
  var api = factory(typeof globalThis !== 'undefined' && globalThis.RileyCore ? globalThis.RileyCore : require('./riley-core.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RileyWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
'use strict';
var TAU = C.TAU, clamp = C.clamp, lerp = C.lerp, smoothstep = C.smoothstep;

/* World: WORLD size units square, centred on origin. Grid of GRID cells. */
var WORLD = 176, GRID = 112;
var CELL = WORLD / GRID;
var WATER_Y = -1.35;
var ARENA_R = 16.5;

/* Realm palettes — one per world (chosen by seed), accent/fog cycles per wave. */
var REALMS = [
  { n: 'STARFALL GROVE',  fog: [12, 17, 46],  grass: [74, 190, 118], grass2: [52, 160, 96],  dirt: [92, 70, 130], rock: [74, 84, 130],  wood: [110, 80, 56],  leaf: [86, 200, 140],  accent: [120, 255, 220], water: [40, 120, 220] },
  { n: 'CRIMSON CINDERS', fog: [36, 10, 26],  grass: [214, 96, 76],  grass2: [178, 70, 66],  dirt: [96, 40, 48],    rock: [92, 44, 62],   wood: [84, 54, 38],   leaf: [226, 120, 70],  accent: [255, 170, 90],  water: [180, 60, 80] },
  { n: 'MISTY MARSH',     fog: [9, 28, 22],   grass: [96, 196, 108], grass2: [72, 168, 92],  dirt: [52, 96, 66],    rock: [56, 92, 72],   wood: [70, 96, 60],   leaf: [150, 230, 130], accent: [150, 255, 160], water: [60, 170, 140] },
  { n: 'AMBER TWILIGHT',  fog: [44, 22, 10],  grass: [228, 168, 60], grass2: [192, 132, 48], dirt: [112, 72, 34],   rock: [120, 80, 50],  wood: [96, 68, 44],   leaf: [240, 190, 80],  accent: [255, 214, 110], water: [200, 130, 50] },
  { n: 'VOID HALLOWS',    fog: [14, 8, 32],   grass: [104, 76, 196], grass2: [82, 58, 164],  dirt: [48, 34, 96],    rock: [60, 44, 116],  wood: [58, 48, 72],   leaf: [140, 100, 240], accent: [190, 140, 255], water: [90, 60, 200] },
  { n: 'EMBER DEPTHS',    fog: [24, 8, 7],    grass: [214, 74, 48],  grass2: [178, 58, 38],  dirt: [88, 32, 26],    rock: [104, 44, 30],  wood: [72, 42, 30],   leaf: [230, 96, 54],   accent: [255, 120, 60],  water: [220, 80, 40] },
  { n: 'FROST HOLLOW',    fog: [14, 22, 40],  grass: [168, 210, 232], grass2: [138, 184, 214], dirt: [90, 110, 140], rock: [150, 176, 208], wood: [96, 88, 92],   leaf: [200, 236, 246], accent: [170, 230, 255], water: [90, 160, 230] },
  { n: 'SUNSPARCE MEADOW',fog: [30, 30, 56],  grass: [130, 214, 96], grass2: [100, 184, 80], dirt: [120, 96, 60],   rock: [128, 116, 96],  wood: [128, 96, 58],  leaf: [170, 230, 90],  accent: [255, 240, 150], water: [80, 170, 230] }
];

function pickSeedStr(seedStr) {
  var s = String(seedStr || '').trim().toUpperCase();
  if (!s) s = null;
  return s;
}

function generate(seedInput) {
  var rand = C.mulberry32((typeof seedInput === 'number') ? (seedInput >>> 0) : C.hashStr(String(seedInput)));
  var seedStr = pickSeedStr(seedInput) || (Math.floor(rand() * 900000 + 100000) + '');
  var seedNum = C.hashStr(seedStr);
  var rand2 = C.mulberry32(seedNum ^ 0x9E3779B9);
  var noise = C.makeNoise2D(rand2);
  var realm = REALMS[Math.floor(rand() * REALMS.length)];

  /* ---------- heightfield (sampled on demand, cached on the grid) ---------- */
  var H = new Float32Array(GRID * GRID);
  var x0w = -WORLD / 2, z0w = -WORLD / 2;
  function rawH(wx, wz) {
    var d = Math.hypot(wx, wz);
    var h = noise.fbm(wx * 0.021, wz * 0.021, 4) * 4.6;
    h += (noise.ridged(wx * 0.010 + 31.7, wz * 0.010 - 17.3, 3) - 0.42) * 5.2;
    h += noise.fbm(wx * 0.06, wz * 0.06, 2) * 0.9;
    /* flatten the central arena to exactly 0 for fair fights */
    h = lerp(h, 0, 1 - smoothstep(ARENA_R * 0.55, ARENA_R * 1.9, d));
    /* gentle bowl at the map edge so nothing floats in the void */
    var edge = smoothstep(WORLD * 0.36, WORLD * 0.5, d);
    h = lerp(h, 6.5, edge * 0.8);
    return h;
  }
  for (var gz = 0; gz < GRID; gz++) for (var gx = 0; gx < GRID; gx++) {
    var wx = x0w + gx * CELL, wz = z0w + gz * CELL;
    var d0 = Math.hypot(wx, wz);
    if (d0 < ARENA_R * 0.6) { H[gz * GRID + gx] = 0; continue; }
    H[gz * GRID + gx] = rawH(wx, wz);
  }
  function heightAt(wx, wz) {
    var fx = (wx - x0w) / CELL - 0.5, fz = (wz - z0w) / CELL - 0.5;
    var x0 = Math.floor(fx), z0 = Math.floor(fz);
    var tx = fx - x0, tz = fz - z0;
    x0 = clamp(x0, 0, GRID - 2); z0 = clamp(z0, 0, GRID - 2);
    var i = z0 * GRID + x0;
    var a = H[i], b = H[i + 1], c = H[i + GRID], d2 = H[i + GRID + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d2 * tx) * tz;
  }
  function slopeAt(wx, wz) {
    var e = 0.9;
    var dx = heightAt(wx + e, wz) - heightAt(wx - e, wz);
    var dz = heightAt(wx, wz + e) - heightAt(wx, wz - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  /* ---------- terrain VBOs (11 floats: x y z | nx ny nz | u v | r g b) ---------- */
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  var grassV = [], dirtV = [], rockV = [];
  for (gz = 0; gz < GRID - 1; gz++) {
    for (gx = 0; gx < GRID - 1; gx++) {
      var p00 = [x0w + gx * CELL, H[gz * GRID + gx], z0w + gz * CELL];
      var p10 = [x0w + (gx + 1) * CELL, H[gz * GRID + gx + 1], z0w + gz * CELL];
      var p01 = [x0w + gx * CELL, H[(gz + 1) * GRID + gx], z0w + (gz + 1) * CELL];
      var p11 = [x0w + (gx + 1) * CELL, H[(gz + 1) * GRID + gx + 1], z0w + (gz + 1) * CELL];
      var cxw = (p00[0] + p11[0]) / 2, czw = (p00[2] + p11[2]) / 2;
      var cw = (p00[1] + p10[1] + p01[1] + p11[1]) / 4;
      var sl = (Math.abs(p10[1] - p00[1]) + Math.abs(p01[1] - p00[1])) / (2 * CELL);
      var n = noise.fbm(cxw * 0.11, czw * 0.11, 2);
      var patch = clamp(0.5 + n * 0.9 + (cw / 6) * 0.25, 0, 1);
      var col = mix(realm.grass2, realm.grass, patch);
      var arr;
      if (sl > 0.68 || cw > 4.4) { arr = rockV; col = mix(realm.dirt, realm.rock, clamp((sl - 0.5) + (cw - 4.4) * 0.4, 0.35, 1)); }
      else if (sl > 0.34 || patch < 0.13) { arr = dirtV; col = realm.dirt; }
      else arr = grassV;
      /* vertex normal from finite differences */
      function vn(px, pz, hx) {
        var ex = 0.7, ez = 0.7;
        var ddx = heightAt(px + ex, pz) - heightAt(px - ex, pz);
        var ddz = heightAt(px, pz + ez) - heightAt(px, pz - ez);
        var l = Math.hypot(ddx, 2 * ex, ddz);
        return [-ddx / l, 2 * ex / l, -ddz / l];
      }
      var t = 0.82 + 0.18 * clamp(1 + n, 0, 1);
      var cA = [col[0] * t, col[1] * t, col[2] * t], cB = [col[0] * (1.06 - t + 0.04), col[1] * (1.06 - t + 0.04), col[2] * (1.06 - t + 0.04)];
      function v(arr2, p, c) {
        var nn = vn(p[0], p[2], p[1]);
        arr2.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], p[0] * 0.45, p[2] * 0.45, c[0], c[1], c[2]);
      }
      v(arr, p00, cA); v(arr, p10, cB); v(arr, p11, cA);
      v(arr, p00, cA); v(arr, p11, cA); v(arr, p01, cB);
    }
  }

  /* ---------- props: instanced arrays (16 matrix floats + 3 col) ---------- */
  var props = {};
  function propArr(name) { if (!props[name]) props[name] = []; return props[name]; }
  function addProp(name, m, col) {
    for (var i = 0; i < 16; i++) propArr(name).push(m[i]);
    propArr(name).push(col[0] / 255, col[1] / 255, col[2] / 255);
  }
  var _m = new Float32Array(16);
  function addBox(name, x, y, z, yaw, pitch, roll, px, py, pz, ox, oy, oz, sx, sy, sz, col) {
    C.limb2(_m, x, y, z, yaw || 0, px || 0, py || 0, pz || 0, pitch || 0, roll || 0, ox, oy, oz, sx, sy, sz);
    addProp(name, _m, col);
  }
  function addCyl(name, x, y, z, sx, sy, sz, yaw, col) { addBox(name, x, y, z, yaw || 0, 0, 0, 0, 0, 0, 0, 0, 0, sx, sy, sz, col); }
  function addCone(name, x, y, z, sx, sy, sz, yaw, col) { addBox(name, x, y, z, yaw || 0, 0, 0, 0, 0, 0, 0, 0, 0, sx, sy, sz, col); }

  var treeCount = 0, rockCount = 0, miscCount = 0, treeCap = 230, rockCap = 150, miscCap = 150;
  var crystals = [];
  var glowPoints = []; /* {x,y,z,r,ph} — light billboards the engine draws */
  /* jittered lattice placement so nothing is too dense */
  for (var jz = 0; jz < 26; jz++) {
    for (var jx = 0; jx < 26; jx++) {
      var px2 = x0w + (jx + 0.5) * (WORLD / 26) + (rand() - 0.5) * (WORLD / 26) * 0.8;
      var pz2 = z0w + (jz + 0.5) * (WORLD / 26) + (rand() - 0.5) * (WORLD / 26) * 0.8;
      if (Math.hypot(px2, pz2) < ARENA_R + 2.5) continue;
      var h = heightAt(px2, pz2);
      var sl2 = slopeAt(px2, pz2);
      if (h < WATER_Y + 0.25 || sl2 > 0.85) continue;
      var r = rand();
      if (r < 0.30 && treeCount < treeCap) {
        treeCount++;
        var s = 0.8 + rand() * 0.9;
        var th = (1.6 + rand() * 1.6) * s;
        var yaw = rand() * TAU;
        addCyl('bark', px2, h, pz2, 0.22 * s, th * 0.72, 0.22 * s, yaw, realm.wood);
        var lc = mix(realm.leaf, [255, 255, 255], 0.08);
        addCone('leaf', px2, h + th * 0.42, pz2, th * 0.78, th * 0.62, th * 0.78, yaw, lc);
        addCone('leaf', px2, h + th * 0.72, pz2, th * 0.55, th * 0.5, th * 0.55, yaw + 0.5, mix(realm.leaf, realm.grass, 0.3));
      } else if (r < 0.46 && rockCount < rockCap) {
        rockCount++;
        var rs = 0.5 + rand() * 1.5;
        addBox('rock', px2, h + rs * 0.28, pz2, rand() * TAU, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, 0, 0, 0, 0, 0, 0, rs * 1.5, rs, rs * 1.1, mix(realm.rock, [255, 255, 255], 0.05));
        if (rand() < 0.3) addBox('rock', px2 + rs * 0.7, h + rs * 0.16, pz2 + rs * 0.4, rand() * TAU, 0, 0, 0, 0, 0, 0, 0, 0, rs * 0.6, rs * 0.45, rs * 0.55, realm.rock);
      } else if (r < 0.55 && crystals.length < 22) {
        /* interactive arcane crystal — an entity the player can shatter */
        crystals.push({ x: px2, z: pz2, y: h, r: 0.55, alive: true, ph: rand() * TAU, s: 0.8 + rand() * 0.7 });
      } else if (r < 0.68 && miscCount < miscCap) {
        miscCount++;
        if (rand() < 0.5) {
          /* mushroom */
          addCyl('bone', px2, h, pz2, 0.1, 0.34, 0.1, 0, [232, 230, 240]);
          addCone('cap', px2, h + 0.3, pz2, 0.42, 0.3, 0.42, rand() * TAU, mix(realm.accent, [255, 255, 255], 0.25));
        } else {
          /* stump / fallen log */
          addCyl('bark', px2, h + 0.18, pz2, 0.4, 0.36, 0.4, rand() * TAU, realm.wood);
        }
      } else if (r < 0.73 && miscCount < miscCap) {
        miscCount++;
        /* torch post near arena */
        var td = Math.hypot(px2, pz2);
        if (td > ARENA_R + 1 && td < ARENA_R + 7) {
          addCyl('wood', px2, h, pz2, 0.12, 2.1, 0.12, 0, [128, 96, 60]);
          addCone('ember', px2, h + 2.12, pz2, 0.22, 0.3, 0.22, 0, [255, 180, 70]);
          glowPoints.push({ x: px2, y: h + 2.3, z: pz2, r: 1.15, ph: rand() * TAU });
        }
      }
    }
  }
  /* arena ring: runes + boundary crystals (walkable world, no void) */
  for (var pp = 0; pp < 16; pp++) {
    var pa = pp / 16 * TAU;
    var bx2 = Math.cos(pa) * (ARENA_R + 1.2), bz2 = Math.sin(pa) * (ARENA_R + 1.2);
    var bh = heightAt(bx2, bz2);
    addCyl('wood', bx2, bh, bz2, 0.14, 2.6, 0.14, 0, [96, 70, 50]);
    addCone('ember', bx2, bh + 2.62, bz2, 0.26, 0.34, 0.26, 0, realm.accent);
    glowPoints.push({ x: bx2, y: bh + 2.8, z: bz2, r: 1.3, ph: pp * 0.7 });
    if (pp % 4 === 0) addCyl('stone', bx2 + Math.cos(pa) * 0.4, bh, bz2 + Math.sin(pa) * 0.4, 0.5, 0.5, 0.5, 0, mix(realm.rock, [255, 255, 255], 0.1));
  }
  /* distant mountains (big baked cones) */
  for (var mm = 0; mm < 10; mm++) {
    var ma = mm / 10 * TAU + (rand() - 0.5) * 0.3, mr2 = rand() * 26 + WORLD / 2 + 18;
    var mx2 = Math.cos(ma) * mr2, mz2 = Math.sin(ma) * mr2, mh2 = rand() * 26 + 34;
    addCone('hill', mx2, -6, mz2, 40, mh2, 40, 0, mix(realm.rock, realm.fog, 0.35));
    addCone('hill', mx2, mh2 * 0.45 - 6, mz2, 22, mh2 * 0.4, 22, 0, mix(realm.rock, realm.fog, 0.15));
    addCone('snow', mx2, mh2 * 0.78 - 6, mz2, 8, 4.4, 8, 0, [228, 232, 246]);
  }

  /* ---------- spawn points (ring around arena, walkable) ---------- */
  var spawns = [];
  var tries = 0;
  while (spawns.length < 12 && tries < 400) {
    tries++;
    var sa = rand() * TAU, sr2 = ARENA_R + 3 + rand() * 9;
    var sx2 = Math.cos(sa) * sr2, sz2 = Math.sin(sa) * sr2;
    var sh = heightAt(sx2, sz2);
    if (sh < WATER_Y + 0.2 || slopeAt(sx2, sz2) > 0.8) continue;
    var ok = true;
    for (var si = 0; si < spawns.length; si++) if (Math.hypot(sx2 - spawns[si].x, sz2 - spawns[si].z) < 9) { ok = false; break; }
    if (ok) spawns.push({ x: sx2, y: sh, z: sz2 });
  }
  var bossSpawn = { x: 0, y: 0, z: -(ARENA_R + 2) };
  {
    var bh2 = heightAt(bossSpawn.x, bossSpawn.z);
    bossSpawn.y = bh2;
  }

  /* ---------- convert to typed arrays ---------- */
  function toArr(a) { return new Float32Array(a); }
  /* Three arcane crystals on the arena lip. Everything else the world offers is
     out in the wilderness, which makes the bowl a flat place to stand; these
     put a resource you can *lose* next to the fight — goblins chew what nobody
     is standing beside, so mana becomes a thing you defend, and shattering one
     first is a real choice rather than a chore on the way back. */
  for (var ci2 = 0; ci2 < 3; ci2++) {
    var ca = ci2 * (Math.PI * 2 / 3) + rand() * 0.85;
    var crr = ARENA_R + 0.9 + rand() * 1.7;
    var cx2 = Math.cos(ca) * crr, cz2 = Math.sin(ca) * crr;
    crystals.push({ x: cx2, z: cz2, y: heightAt(cx2, cz2), r: 0.55, alive: true,
      ph: rand() * Math.PI * 2, s: 0.9 + rand() * 0.5 });
  }

  return {
    seed: seedStr,
    realm: realm,
    size: WORLD,
    waterY: WATER_Y,
    arena: { cx: 0, cz: 0, r: ARENA_R },
    heightAt: heightAt,
    slopeAt: slopeAt,
    terrain: { grass: toArr(grassV), dirt: toArr(dirtV), rock: toArr(rockV) },
    props: {
      bark: toArr(props.bark || []), leaf: toArr(props.leaf || []), rock: toArr(props.rock || []),
      wood: toArr(props.wood || []), bone: toArr(props.bone || []), cap: toArr(props.cap || []),
      ember: toArr(props.ember || []), stone: toArr(props.stone || []), hill: toArr(props.hill || []), snow: toArr(props.snow || [])
    },
    propCounts: {
      bark: (props.bark || []).length / 19, leaf: (props.leaf || []).length / 19, rock: (props.rock || []).length / 19,
      wood: (props.wood || []).length / 19, bone: (props.bone || []).length / 19, cap: (props.cap || []).length / 19,
      ember: (props.ember || []).length / 19, stone: (props.stone || []).length / 19, hill: (props.hill || []).length / 19, snow: (props.snow || []).length / 19
    },
    crystals: crystals,
    spawns: spawns,
    bossSpawn: bossSpawn,
    glowPoints: glowPoints
  };
}

return { generate: generate, REALMS: REALMS, WORLD: WORLD, ARENA_R: ARENA_R, WATER_Y: WATER_Y };
});
