/* SupaViewer v0 — standalone sandbox region + HUD.
   Three.js is expected as global THREE (cdnjs r134). */
(function (global) {
  'use strict';
  var SV = global.SV = global.SV || {};
  var REGION = 256, WATER = 20, MAX_Z = 4096;
  var WALK = 3.2, RUN = 5.13, FLY = 16, JUMP = 8, GRAVITY = 18;

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var hexColor = function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); };
  var parseHex = function (s, d) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(s || ''));
    return m ? parseInt(m[1], 16) : d;
  };

  function heightAt(x, z) {
    var dx = x - 128, dz = z - 128;
    var r = Math.hypot(dx, dz);
    var h = 16.2;
    h += 7.4 * Math.exp(-(r * r) / 5200);
    h += Math.sin(x * 0.035) * 1.15 + Math.cos(z * 0.028) * 1.05;
    h += Math.sin(x * 0.11 + z * 0.07) * 0.35;
    if (r > 102) h = 17.2 + Math.sin(x * 0.02) * 0.4 + Math.cos(z * 0.018) * 0.3;
    if (r > 118) h = 14.6 + Math.sin(x * 0.04) * 0.25;
    return h;
  }

  function onLand(x, z) { return heightAt(x, z) > WATER + 0.35; }

  SV.heightAt = heightAt;

  var state = {
    scene: null, camera: null, renderer: null,
    sun: null, hemi: null, skyUniforms: null, waterMesh: null,
    clock: null, elapsed: 0, dayT: 0.28,
    keys: Object.create(null),
    yaw: 0.4, pitch: 0.28, dist: 5.4,
    dragging: false, lastMX: 0, lastMY: 0, dragMoved: 0,
    mouselook: false, running: false, flying: false,
    velY: 0, onGround: true, sitting: null,
    player: null, agents: [], prims: [],
    selected: null, buildMode: false,
    nextLocal: 100, inventory: [],
    circuit: null, reduced: false,
    moveStick: { x: 0, y: 0, active: false },
    name: 'Resident',
    appear: { skin: 0xc68642, hair: 0x2a1a12, shirt: 0x3d7ea6, pants: 0x243044, height: 1.0 }
  };

  function canvasTex(draw, w, h) {
    var c = document.createElement('canvas');
    c.width = w || 256; c.height = h || 256;
    draw(c.getContext('2d'), c);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  function nametagTex(name, color) {
    return canvasTex(function (g, c) {
      g.clearRect(0, 0, c.width, c.height);
      g.font = 'bold 22px system-ui,sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      var w = Math.min(c.width - 8, g.measureText(name).width + 20);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect((c.width - w) / 2, 16, w, 32);
      g.fillStyle = color || '#fff';
      g.fillText(name, c.width / 2, 32);
    }, 256, 64);
  }

  function signTex(title, sub) {
    return canvasTex(function (g, c) {
      g.fillStyle = '#1b3a2a';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#c9a227';
      g.fillRect(8, 8, c.width - 16, c.height - 16);
      g.fillStyle = '#13281c';
      g.fillRect(16, 16, c.width - 32, c.height - 32);
      g.fillStyle = '#f4e7c3';
      g.font = 'bold 36px Georgia,serif';
      g.textAlign = 'center';
      g.fillText(title, c.width / 2, 118);
      g.font = '20px Georgia,serif';
      g.fillStyle = '#d7c38a';
      g.fillText(sub, c.width / 2, 158);
    }, 512, 256);
  }

  function mat(color, extra) {
    extra = extra || {};
    return new THREE.MeshStandardMaterial({
      color: extra.color != null ? extra.color : color,
      roughness: extra.roughness != null ? extra.roughness : 0.72,
      metalness: extra.metalness != null ? extra.metalness : 0.08,
      emissive: extra.emissive != null ? extra.emissive : 0x000000,
      emissiveIntensity: extra.emissiveIntensity != null ? extra.emissiveIntensity : 0,
      transparent: extra.opacity != null && extra.opacity < 1,
      opacity: extra.opacity != null ? extra.opacity : 1,
      map: extra.map || null,
      side: extra.side || THREE.FrontSide
    });
  }

  function geoFor(shape, sx, sy, sz) {
    switch (shape) {
      case 'cylinder': return new THREE.CylinderGeometry(Math.max(sx, sz) * 0.5, Math.max(sx, sz) * 0.5, sy, 20);
      case 'sphere': return new THREE.SphereGeometry(Math.max(sx, sy, sz) * 0.5, 20, 16);
      case 'torus': return new THREE.TorusGeometry(Math.max(sx, sz) * 0.35, Math.min(sx, sy, sz) * 0.18, 12, 24);
      case 'prism': return new THREE.ConeGeometry(Math.max(sx, sz) * 0.5, sy, 4);
      case 'ring': return new THREE.TorusGeometry(Math.max(sx, sz) * 0.4, Math.min(sx, sy) * 0.08, 8, 28);
      case 'cone': return new THREE.ConeGeometry(Math.max(sx, sz) * 0.5, sy, 10);
      default: return new THREE.BoxGeometry(sx, sy, sz);
    }
  }

  function addPrim(spec) {
    spec = spec || {};
    var shape = spec.shape || 'box';
    var sx = spec.size && spec.size.x || 1;
    var sy = spec.size && spec.size.y || 1;
    var sz = spec.size && spec.size.z || 1;
    var mesh = new THREE.Mesh(geoFor(shape, sx, sy, sz), mat(spec.color || 0x888888, spec));
    mesh.castShadow = !spec.phantom;
    mesh.receiveShadow = true;
    var p = SV.coords.toThree(spec.x || 0, spec.y || 0, spec.z || 0);
    mesh.position.set(p.x, p.y, p.z);
    if (spec.rot) mesh.rotation.set(spec.rot.x || 0, spec.rot.y || 0, spec.rot.z || 0);
    mesh.userData = {
      prim: true,
      localId: spec.localId || (++state.nextLocal),
      name: spec.name || 'Object',
      shape: shape,
      color: spec.color || 0x888888,
      phantom: !!spec.phantom,
      sit: spec.sit || null,
      hover: spec.hover || '',
      touch: spec.touch || '',
      solid: spec.solid !== false && !spec.phantom,
      sx: sx, sy: sy, sz: sz
    };
    state.scene.add(mesh);
    state.prims.push(mesh);
    return mesh;
  }

  function removePrim(mesh) {
    if (!mesh) return;
    state.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    state.prims = state.prims.filter(function (p) { return p !== mesh; });
    if (state.selected === mesh) state.selected = null;
  }

  function buildSky() {
    var v = 'varying vec3 vWP; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';
    var f = 'uniform vec3 top; uniform vec3 bot; uniform float sun; varying vec3 vWP;\n' +
      'void main(){ float h=clamp((normalize(vWP).y+0.15)/1.1,0.0,1.0);\n' +
      'vec3 c=mix(bot,top,h); c += vec3(1.0,0.55,0.2)*sun*(1.0-h)*0.25; gl_FragColor=vec4(c,1.0);}';
    state.skyUniforms = {
      top: { value: new THREE.Color(0x7ec8e3) },
      bot: { value: new THREE.Color(0xd9eef8) },
      sun: { value: 0.4 }
    };
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 24),
      new THREE.ShaderMaterial({ uniforms: state.skyUniforms, vertexShader: v, fragmentShader: f, side: THREE.BackSide })
    );
    state.scene.add(sky);
    var sg = new THREE.BufferGeometry();
    var sp = [];
    for (var i = 0; i < 1400; i++) {
      var a = Math.random() * Math.PI * 2, b = Math.random() * 0.9 + 0.15;
      sp.push(Math.cos(a) * Math.cos(b) * 700, Math.sin(b) * 700, Math.sin(a) * Math.cos(b) * 700);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3));
    var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0 }));
    stars.name = 'stars';
    state.scene.add(stars);
    state.stars = stars;
  }

  function buildTerrain() {
    var geo = new THREE.PlaneGeometry(REGION, REGION, 96, 96);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position.array;
    var colors = [];
    for (var i = 0; i < pos.length; i += 3) {
      var x = pos[i] + REGION / 2, z = pos[i + 2] + REGION / 2;
      var y = heightAt(x, z);
      pos[i + 1] = y;
      var sand = y < WATER + 1.2;
      var grass = y >= WATER + 1.2 && y < 24;
      if (sand) colors.push(0.76, 0.70, 0.48);
      else if (grass) colors.push(0.28 + y * 0.004, 0.46, 0.24);
      else colors.push(0.42, 0.44, 0.38);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0.02
    }));
    mesh.position.set(REGION / 2, 0, REGION / 2);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    mesh.userData.terrain = true;
    state.scene.add(mesh);
    state.terrain = mesh;

    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(REGION * 1.6, REGION * 1.6, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1a6a8a, roughness: 0.12, metalness: 0.65,
        transparent: true, opacity: 0.72, emissive: 0x042030, emissiveIntensity: 0.2
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(REGION / 2, WATER, REGION / 2);
    water.userData.water = true;
    state.scene.add(water);
    state.waterMesh = water;
  }

  function seedRegion() {
    var deckY = 22.15;
    addPrim({ name: 'Welcome deck', shape: 'box', x: 128, y: 128, z: deckY, size: { x: 26, y: 0.35, z: 26 }, color: 0x6b4a2b, roughness: 0.85 });
    var i, a;
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2 + Math.PI / 4;
      addPrim({ name: 'Column', shape: 'cylinder', x: 128 + Math.cos(a) * 11, y: 128 + Math.sin(a) * 11, z: deckY + 2.2, size: { x: 0.55, y: 4.2, z: 0.55 }, color: 0xd9d0c1 });
    }
    addPrim({ name: 'Fountain basin', shape: 'cylinder', x: 128, y: 128, z: deckY + 0.45, size: { x: 4.2, y: 0.6, z: 4.2 }, color: 0xb9b3a8, sit: null });
    addPrim({ name: 'Fountain water', shape: 'cylinder', x: 128, y: 128, z: deckY + 0.7, size: { x: 3.4, y: 0.2, z: 3.4 }, color: 0x3aa0c8, opacity: 0.65, phantom: true, emissive: 0x123344, emissiveIntensity: 0.4 });
    addPrim({ name: 'Fountain jet', shape: 'sphere', x: 128, y: 128, z: deckY + 2.1, size: { x: 0.7, y: 0.7, z: 0.7 }, color: 0x7fd0ea, opacity: 0.5, phantom: true, emissive: 0x226688, emissiveIntensity: 0.8 });
    addPrim({ name: 'Welcome sign', shape: 'box', x: 128, y: 116.2, z: deckY + 2.2, size: { x: 5.2, y: 2.6, z: 0.18 }, color: 0x355e45, map: signTex('SUPA SANDBOX', 'build · chat · fly'), hover: 'Supa Sandbox — a local region inside your browser', touch: 'Welcome to SupaViewer. Type /help in chat.' });

    for (i = 0; i < 16; i++) {
      var tx = 118 + (i % 4) * 2.05, tz = 136 + Math.floor(i / 4) * 2.05;
      var glow = (i + Math.floor(i / 4)) % 2 === 0 ? 0x6b3cff : 0xff4d9a;
      addPrim({ name: 'Dance tile', shape: 'box', x: tx, y: tz, z: deckY + 0.22, size: { x: 1.9, y: 0.08, z: 1.9 }, color: glow, emissive: glow, emissiveIntensity: 0.55, phantom: true });
    }

    function bench(x, y, rot) {
      addPrim({ name: 'Bench seat', shape: 'box', x: x, y: y, z: deckY + 0.55, size: { x: 1.8, y: 0.18, z: 0.55 }, color: 0x5a3b22, rot: { x: 0, y: rot || 0, z: 0 }, sit: { dx: 0, dy: 0.45, dz: 0 } });
      addPrim({ name: 'Bench back', shape: 'box', x: x, y: y - 0.28, z: deckY + 0.95, size: { x: 1.8, y: 0.7, z: 0.1 }, color: 0x5a3b22, rot: { x: 0, y: rot || 0, z: 0 } });
    }
    bench(120, 122, 0); bench(136, 122, 0); bench(120, 134, Math.PI);

    /* House */
    var hx = 96, hy = 148, hz = heightAt(96, 148) + 1.6;
    addPrim({ name: 'Cabin floor', shape: 'box', x: hx, y: hy, z: hz - 1.2, size: { x: 8, y: 0.25, z: 7 }, color: 0x6a4a2e });
    addPrim({ name: 'Cabin wall N', shape: 'box', x: hx, y: hy + 3.4, z: hz, size: { x: 8, y: 3.2, z: 0.25 }, color: 0xc4b49a });
    addPrim({ name: 'Cabin wall S', shape: 'box', x: hx, y: hy - 3.4, z: hz, size: { x: 8, y: 3.2, z: 0.25 }, color: 0xc4b49a });
    addPrim({ name: 'Cabin wall W', shape: 'box', x: hx - 3.9, y: hy, z: hz, size: { x: 0.25, y: 3.2, z: 6.6 }, color: 0xc4b49a });
    addPrim({ name: 'Cabin wall E', shape: 'box', x: hx + 3.9, y: hy, z: hz, size: { x: 0.25, y: 3.2, z: 6.6 }, color: 0xc4b49a });
    addPrim({ name: 'Cabin roof', shape: 'prism', x: hx, y: hy, z: hz + 2.6, size: { x: 9.2, y: 2.4, z: 8 }, color: 0x7a2e24, rot: { x: 0, y: Math.PI / 4, z: 0 } });
    addPrim({ name: 'Cabin door', shape: 'box', x: hx, y: hy - 3.52, z: hz - 0.3, size: { x: 1.2, y: 2.2, z: 0.12 }, color: 0x4a2c14, hover: 'A quiet cabin. Sit on the bench outside.', touch: 'The door is unlocked. (Interiors are a later milestone.)' });

    /* Pier */
    for (i = 0; i < 10; i++) {
      var px = 178 + i * 4.2;
      addPrim({ name: 'Pier plank', shape: 'box', x: px, y: 128, z: WATER + 0.55, size: { x: 4.1, y: 0.16, z: 3.2 }, color: 0x8a6a40 });
      if (i % 2 === 0) {
        addPrim({ name: 'Pier post', shape: 'cylinder', x: px, y: 126.2, z: WATER - 0.4, size: { x: 0.28, y: 2.4, z: 0.28 }, color: 0x5a3d22 });
        addPrim({ name: 'Pier post', shape: 'cylinder', x: px, y: 129.8, z: WATER - 0.4, size: { x: 0.28, y: 2.4, z: 0.28 }, color: 0x5a3d22 });
      }
    }
    addPrim({ name: 'End of the pier', shape: 'cylinder', x: 220, y: 128, z: WATER + 0.9, size: { x: 1.6, y: 0.2, z: 1.6 }, color: 0xc9a227, sit: { dx: 0, dy: 0.35, dz: 0 }, hover: 'Sit and watch the water.' });

    /* Trees */
    for (i = 0; i < 18; i++) {
      a = Math.random() * Math.PI * 2;
      var rr = rand(28, 70);
      var tx2 = 128 + Math.cos(a) * rr, tz2 = 128 + Math.sin(a) * rr;
      if (!onLand(tx2, tz2)) continue;
      var th = heightAt(tx2, tz2);
      addPrim({ name: 'Tree trunk', shape: 'cylinder', x: tx2, y: tz2, z: th + 1.6, size: { x: 0.45, y: 3.2, z: 0.45 }, color: 0x5a3a22 });
      addPrim({ name: 'Tree crown', shape: 'sphere', x: tx2, y: tz2, z: th + 3.8, size: { x: 3.2, y: 3.2, z: 3.2 }, color: 0x2f6a38, roughness: 0.9 });
    }

    addPrim({ name: 'Telehub', shape: 'cylinder', x: 128, y: 108, z: heightAt(128, 108) + 0.15, size: { x: 4.5, y: 0.12, z: 4.5 }, color: 0x3ec6ff, emissive: 0x3ec6ff, emissiveIntensity: 0.7, phantom: true, hover: 'Telehub — you arrived here', touch: 'This is the arrival point for Supa Sandbox.' });
    addPrim({ name: 'Campfire ring', shape: 'torus', x: 142, y: 118, z: heightAt(142, 118) + 0.2, size: { x: 1.6, y: 0.4, z: 1.6 }, color: 0x666666, rot: { x: Math.PI / 2, y: 0, z: 0 } });
    addPrim({ name: 'Flame', shape: 'cone', x: 142, y: 118, z: heightAt(142, 118) + 0.9, size: { x: 0.5, y: 1.1, z: 0.5 }, color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 1.2, phantom: true });
    addPrim({ name: 'Info kiosk', shape: 'box', x: 114, y: 118, z: deckY + 1.4, size: { x: 0.8, y: 2.2, z: 0.8 }, color: 0xf0c14b, hover: 'Touch for a notecard', touch: 'SupaViewer v0. Walk (WASD), fly (F), build (B), inventory (I). This region is local — nothing is uploaded.' });
  }

  function makeAvatar(opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var skin = opts.skin || 0xc68642;
    var shirt = opts.shirt || 0x3d7ea6;
    var pants = opts.pants || 0x243044;
    var hair = opts.hair || 0x2a1a12;
    var h = 1;

    var pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34 * h, 0.18 * h, 0.22 * h), mat(pants));
    pelvis.position.y = 0.95 * h; g.add(pelvis);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.42 * h, 0.55 * h, 0.24 * h), mat(shirt));
    torso.position.y = 1.32 * h; torso.castShadow = true; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.16 * h, 14, 12), mat(skin, { roughness: 0.55 }));
    head.position.y = 1.72 * h; head.castShadow = true; g.add(head);
    var hairM = new THREE.Mesh(new THREE.SphereGeometry(0.17 * h, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hair));
    hairM.position.y = 1.78 * h; g.add(hairM);
    var larm = new THREE.Mesh(new THREE.BoxGeometry(0.12 * h, 0.5 * h, 0.12 * h), mat(shirt));
    larm.position.set(-0.28 * h, 1.28 * h, 0); g.add(larm);
    var rarm = new THREE.Mesh(new THREE.BoxGeometry(0.12 * h, 0.5 * h, 0.12 * h), mat(shirt));
    rarm.position.set(0.28 * h, 1.28 * h, 0); g.add(rarm);
    var lleg = new THREE.Mesh(new THREE.BoxGeometry(0.14 * h, 0.7 * h, 0.14 * h), mat(pants));
    lleg.position.set(-0.1 * h, 0.5 * h, 0); g.add(lleg);
    var rleg = new THREE.Mesh(new THREE.BoxGeometry(0.14 * h, 0.7 * h, 0.14 * h), mat(pants));
    rleg.position.set(0.1 * h, 0.5 * h, 0); g.add(rleg);

    var tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nametagTex(opts.name || 'Resident', '#ffffff'), transparent: true, depthTest: false }));
    tag.scale.set(2.2, 0.55, 1);
    tag.position.y = 2.05 * h;
    g.add(tag);
    g.scale.setScalar(opts.height || 1);

    g.userData = {
      agent: true,
      name: opts.name || 'Resident',
      parts: { torso: torso, head: head, larm: larm, rarm: rarm, lleg: lleg, rleg: rleg, hair: hairM, tag: tag },
      walk: 0, npc: !!opts.npc, skin: skin, shirt: shirt, pants: pants, hair: hair, height: h
    };
    return g;
  }

  function applyAppearance(av, appear) {
    if (!av) return;
    av.userData.skin = appear.skin; av.userData.shirt = appear.shirt;
    av.userData.pants = appear.pants; av.userData.hair = appear.hair;
    av.userData.height = appear.height;
    av.userData.parts.torso.material.color.setHex(appear.shirt);
    av.userData.parts.larm.material.color.setHex(appear.shirt);
    av.userData.parts.rarm.material.color.setHex(appear.shirt);
    av.userData.parts.lleg.material.color.setHex(appear.pants);
    av.userData.parts.rleg.material.color.setHex(appear.pants);
    av.userData.parts.head.material.color.setHex(appear.skin);
    av.userData.parts.hair.material.color.setHex(appear.hair);
    av.scale.setScalar(appear.height);
  }

  function spawnPlayer() {
    var av = makeAvatar({ name: state.name, skin: state.appear.skin, shirt: state.appear.shirt, pants: state.appear.pants, hair: state.appear.hair, height: state.appear.height });
    var h = heightAt(128, 108);
    av.position.set(128, h, 108);
    state.scene.add(av);
    state.player = av;
    return av;
  }

  function spawnNPCs() {
    var names = ['Ayo Okonkwo', 'Mira Chen', 'Jules Navarro', 'Priya Sethi', 'Rowan Hale', 'Sable Quinn'];
    var lines = [
      'First time in a browser viewer?',
      'The pier is nice at sunset.',
      'Try sitting on a bench.',
      'Build something with B.',
      'I used to live on the mainland.',
      'Fly up — F then E.'
    ];
    for (var i = 0; i < names.length; i++) {
      var av = makeAvatar({
        name: names[i], npc: true,
        skin: [0xc68642, 0x8d5524, 0xf1c27d, 0xffdbac, 0x4a312c, 0xd1a3a4][i],
        shirt: [0x4aa3df, 0xc45c7a, 0x3cb371, 0xf0c14b, 0x6b3cff, 0xe8e8e8][i],
        pants: [0x222233, 0x3a2a22, 0x1a1a1a, 0x334455, 0x222222, 0x445566][i],
        hair: [0x1a1a1a, 0x3b2a1a, 0x6b3a1a, 0x111111, 0xccaa66, 0x222222][i]
      });
      var ang = i / names.length * Math.PI * 2;
      var x = 128 + Math.cos(ang) * 18, z = 128 + Math.sin(ang) * 18;
      av.position.set(x, heightAt(x, z), z);
      av.userData.tx = x; av.userData.tz = z;
      av.userData.line = lines[i];
      av.userData.speed = rand(1.1, 1.8);
      state.scene.add(av);
      state.agents.push(av);
    }
  }

  function animateAvatar(av, moving, dt, flying, sitting) {
    var p = av.userData.parts;
    if (sitting) {
      p.lleg.rotation.x = -1.2; p.rleg.rotation.x = -1.2;
      p.larm.rotation.x = 0.2; p.rarm.rotation.x = 0.2;
      return;
    }
    if (moving) av.userData.walk += dt * (flying ? 10 : 8);
    else av.userData.walk *= 0.85;
    var s = Math.sin(av.userData.walk);
    p.larm.rotation.x = s * 0.7;
    p.rarm.rotation.x = -s * 0.7;
    p.lleg.rotation.x = -s * 0.7;
    p.rleg.rotation.x = s * 0.7;
    if (flying) {
      p.larm.rotation.z = 0.9; p.rarm.rotation.z = -0.9;
    } else {
      p.larm.rotation.z = 0.08; p.rarm.rotation.z = -0.08;
    }
  }

  function collideXZ(x, z, y, ignore) {
    for (var i = 0; i < state.prims.length; i++) {
      var m = state.prims[i], u = m.userData;
      if (!u.solid || m === ignore) continue;
      var hx = u.sx * 0.5 + 0.28, hz = u.sz * 0.5 + 0.28;
      var hy = u.sy * 0.5;
      if (Math.abs(x - m.position.x) < hx && Math.abs(z - m.position.z) < hz) {
        var top = m.position.y + hy;
        var bot = m.position.y - hy;
        if (y + 0.4 > bot && y < top - 0.05) return m;
      }
    }
    return null;
  }

  function groundY(x, z) {
    var g = heightAt(x, z);
    for (var i = 0; i < state.prims.length; i++) {
      var m = state.prims[i], u = m.userData;
      if (!u.solid) continue;
      var hx = u.sx * 0.5 + 0.2, hz = u.sz * 0.5 + 0.2;
      if (Math.abs(x - m.position.x) < hx && Math.abs(z - m.position.z) < hz) {
        var top = m.position.y + u.sy * 0.5;
        if (top > g && top < (state.player ? state.player.position.y : 0) + 1.4) g = Math.max(g, top);
      }
    }
    return g;
  }

  function unsit() {
    if (!state.sitting) return;
    state.sitting = null;
    chatSys('You stand up.');
  }

  function sitOn(mesh) {
    if (!mesh || !mesh.userData.sit) return;
    var s = mesh.userData.sit;
    state.sitting = mesh;
    state.flying = false;
    state.player.position.set(mesh.position.x + (s.dx || 0), mesh.position.y + (s.dy || 0), mesh.position.z + (s.dz || 0));
    chatSys('You sit on ' + mesh.userData.name + '.');
  }

  function tryTouch(mesh) {
    if (!mesh) return;
    if (mesh.userData.touch) chatObj(mesh.userData.name, mesh.userData.touch);
    if (mesh.userData.sit) sitOn(mesh);
  }

  /* ---------- UI ---------- */
  function chatLine(kind, name, text) {
    var log = $('sv-chat-log');
    if (!log) return;
    var row = document.createElement('div');
    row.className = 'sv-line sv-line-' + kind;
    var who = document.createElement('span');
    who.className = 'sv-who';
    who.textContent = name ? name + ': ' : '';
    var msg = document.createElement('span');
    msg.textContent = text;
    row.appendChild(who); row.appendChild(msg);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    while (log.childNodes.length > 200) log.removeChild(log.firstChild);
  }
  function chatSys(t) { chatLine('sys', '', t); }
  function chatObj(n, t) { chatLine('obj', n, t); }
  function chatSay(n, t) { chatLine('say', n, t); }

  function setPanel(id, on) {
    ['sv-panel-inv', 'sv-panel-people', 'sv-panel-build', 'sv-panel-appear', 'sv-panel-map', 'sv-panel-help'].forEach(function (p) {
      var el = $(p);
      if (!el) return;
      if (p === id) el.hidden = on === false ? true : !el.hidden;
      else if (on !== false) el.hidden = true;
    });
    if (id === 'sv-panel-build' && on !== false) {
      var b = $('sv-panel-build');
      state.buildMode = b && !b.hidden;
    }
  }

  function closePanels() {
    ['sv-panel-inv', 'sv-panel-people', 'sv-panel-build', 'sv-panel-appear', 'sv-panel-map', 'sv-panel-help'].forEach(function (p) {
      if ($(p)) $(p).hidden = true;
    });
    state.buildMode = false;
  }

  function renderInventory() {
    var root = $('sv-inv-tree');
    if (!root) return;
    root.textContent = '';
    state.inventory.forEach(function (folder) {
      var f = document.createElement('details');
      f.open = true;
      var s = document.createElement('summary');
      s.textContent = folder.name;
      f.appendChild(s);
      folder.items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sv-inv-item';
        b.textContent = it.name;
        b.addEventListener('click', function () { useItem(it); });
        f.appendChild(b);
      });
      root.appendChild(f);
    });
  }

  function useItem(it) {
    if (it.kind === 'wearable') {
      if (it.slot === 'shirt') state.appear.shirt = it.color;
      if (it.slot === 'pants') state.appear.pants = it.color;
      if (it.slot === 'hair') state.appear.hair = it.color;
      if (it.slot === 'skin') state.appear.skin = it.color;
      applyAppearance(state.player, state.appear);
      saveAppear();
      chatSys('You wear ' + it.name + '.');
    } else if (it.kind === 'object') {
      var p = state.player.position;
      addPrim({
        name: it.name, shape: it.shape || 'box',
        x: p.x + Math.sin(state.yaw) * 2.5,
        y: p.z + Math.cos(state.yaw) * 2.5,
        z: p.y + 0.6,
        size: it.size || { x: 0.5, y: 0.5, z: 0.5 },
        color: it.color || 0x88aacc
      });
      chatSys('You rez ' + it.name + '.');
    } else if (it.kind === 'landmark') {
      unsit();
      state.player.position.set(it.x, it.z, it.y);
      chatSys('Teleporting to ' + it.name + '.');
    } else if (it.kind === 'notecard') {
      chatObj(it.name, it.body);
    }
  }

  function defaultInventory() {
    state.inventory = [
      { name: 'Clothing', items: [
        { kind: 'wearable', slot: 'shirt', name: 'Sunset shirt', color: 0xff6644 },
        { kind: 'wearable', slot: 'shirt', name: 'Ocean shirt', color: 0x2a9df4 },
        { kind: 'wearable', slot: 'shirt', name: 'Forest shirt', color: 0x2f6a38 },
        { kind: 'wearable', slot: 'pants', name: 'Night trousers', color: 0x1a1a28 },
        { kind: 'wearable', slot: 'pants', name: 'Khaki pants', color: 0x8a7a4a },
        { kind: 'wearable', slot: 'hair', name: 'Ink hair', color: 0x111111 },
        { kind: 'wearable', slot: 'hair', name: 'Copper hair', color: 0xa85a2a }
      ]},
      { name: 'Objects', items: [
        { kind: 'object', name: 'Plywood cube', shape: 'box', color: 0xc8b48a, size: { x: 0.5, y: 0.5, z: 0.5 } },
        { kind: 'object', name: 'Glow orb', shape: 'sphere', color: 0x66ddff, size: { x: 0.4, y: 0.4, z: 0.4 } },
        { kind: 'object', name: 'Ring prim', shape: 'ring', color: 0xf0c14b, size: { x: 1, y: 0.3, z: 1 } }
      ]},
      { name: 'Landmarks', items: [
        { kind: 'landmark', name: 'Telehub', x: 128, y: 108, z: heightAt(128, 108) },
        { kind: 'landmark', name: 'Pier end', x: 220, y: 128, z: WATER + 1.2 },
        { kind: 'landmark', name: 'Cabin', x: 96, y: 142, z: heightAt(96, 142) }
      ]},
      { name: 'Notecards', items: [
        { kind: 'notecard', name: 'Welcome to SupaViewer', body: 'This region is local. Your inventory is a demo folder. Real grid inventory needs the gateway in ROADMAP.md.' }
      ]}
    ];
  }

  function saveAppear() {
    try { localStorage.setItem('sv-appear', JSON.stringify({ name: state.name, appear: state.appear })); } catch (e) {}
  }
  function loadAppear() {
    try {
      var raw = localStorage.getItem('sv-appear');
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.name) state.name = o.name;
      if (o.appear) {
        ['skin', 'shirt', 'pants', 'hair', 'height'].forEach(function (k) {
          if (o.appear[k] != null) state.appear[k] = o.appear[k];
        });
      }
    } catch (e) {}
  }

  function handleChat(raw) {
    var text = String(raw || '').replace(/^\s+|\s+$/g, '');
    if (!text) return;
    if (text.charAt(0) === '/') {
      var parts = text.slice(1).split(/\s+/);
      var cmd = (parts.shift() || '').toLowerCase();
      if (cmd === 'help') {
        chatSys('Commands: /help /fly /sit /tp x y z /clear /say /me /who');
      } else if (cmd === 'fly') {
        state.flying = !state.flying;
        unsit();
        chatSys(state.flying ? 'Fly mode on.' : 'Fly mode off.');
      } else if (cmd === 'sit') {
        var bench = nearestSit();
        if (bench) sitOn(bench); else chatSys('Nothing to sit on nearby.');
      } else if (cmd === 'tp' && parts.length >= 2) {
        var x = clamp(+parts[0], 0, REGION), y = clamp(+parts[1], 0, REGION);
        var z = parts[2] != null ? +parts[2] : heightAt(x, y);
        unsit();
        state.player.position.set(x, z, y);
        chatSys('Teleport to ' + x.toFixed(1) + ', ' + y.toFixed(1) + ', ' + z.toFixed(1));
      } else if (cmd === 'clear') {
        var log = $('sv-chat-log'); if (log) log.textContent = '';
      } else if (cmd === 'me') {
        chatSay(state.name, '/me ' + parts.join(' '));
      } else if (cmd === 'who') {
        chatSys('Nearby: You, ' + state.agents.map(function (a) { return a.userData.name; }).join(', '));
      } else if (cmd === 'say') {
        sayLocal(parts.join(' '));
      } else {
        chatSys('Unknown command. /help');
      }
      return;
    }
    sayLocal(text);
  }

  function sayLocal(text) {
    state.circuit.chatFromViewer(text, 1);
    chatSay(state.name, text);
    var low = text.toLowerCase();
    if (/hello|hi |hey|yo /.test(low) || low === 'hi' || low === 'hey') {
      var n = state.agents[Math.floor(Math.random() * state.agents.length)];
      if (n) setTimeout(function () { chatSay(n.userData.name, n.userData.line); }, 600);
    }
  }

  function nearestSit() {
    var p = state.player.position, best = null, bd = 4;
    for (var i = 0; i < state.prims.length; i++) {
      var m = state.prims[i];
      if (!m.userData.sit) continue;
      var d = m.position.distanceTo(p);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function nearestAgent() {
    var p = state.player.position, best = null, bd = 1e9;
    state.agents.forEach(function (a) {
      var d = a.position.distanceTo(p);
      if (d < bd) { bd = d; best = a; }
    });
    return { agent: best, dist: bd };
  }

  function updatePeople() {
    var list = $('sv-people-list');
    if (!list || list.parentElement.hidden) return;
    list.textContent = '';
    var rows = [{ name: state.name + ' (you)', dist: 0 }].concat(state.agents.map(function (a) {
      return { name: a.userData.name, dist: a.position.distanceTo(state.player.position) };
    }));
    rows.sort(function (a, b) { return a.dist - b.dist; });
    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.name + '  ·  ' + r.dist.toFixed(1) + ' m';
      list.appendChild(li);
    });
  }

  function updateMinimap() {
    var c = $('sv-minimap');
    if (!c || !state.player) return;
    var g = c.getContext('2d');
    var w = c.width, h = c.height;
    g.fillStyle = '#0b1c28';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a6a8a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a7a3a';
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
    g.fill();
    function mapX(x) { return (x / REGION) * w; }
    function mapY(z) { return h - (z / REGION) * h; }
    g.fillStyle = '#c8b48a';
    for (var i = 0; i < state.prims.length; i++) {
      var m = state.prims[i];
      if (m.userData.sx < 2) continue;
      g.fillRect(mapX(m.position.x) - 1, mapY(m.position.z) - 1, 2, 2);
    }
    g.fillStyle = '#ffdf5a';
    state.agents.forEach(function (a) {
      g.fillRect(mapX(a.position.x) - 1.5, mapY(a.position.z) - 1.5, 3, 3);
    });
    var p = state.player.position;
    g.save();
    g.translate(mapX(p.x), mapY(p.z));
    g.rotate(-state.yaw);
    g.fillStyle = '#3ec6ff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }

  function updateWorldMap() {
    var c = $('sv-worldmap');
    if (!c || c.parentElement.hidden) return;
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#102030'; g.fillRect(0, 0, w, h);
    for (var x = 0; x < w; x += 4) for (var y = 0; y < h; y += 4) {
      var sx = x / w * REGION, sz = (1 - y / h) * REGION;
      var ht = heightAt(sx, sz);
      if (ht < WATER) g.fillStyle = '#1a5a78';
      else g.fillStyle = ht > 23 ? '#4a6a40' : '#d2c08a';
      g.fillRect(x, y, 4, 4);
    }
    function mx(x) { return x / REGION * w; }
    function my(z) { return (1 - z / REGION) * h; }
    g.fillStyle = '#3ec6ff';
    g.fillRect(mx(state.player.position.x) - 3, my(state.player.position.z) - 3, 6, 6);
  }

  function selectPrim(mesh) {
    if (state.selected && state.selected.material && state.selected.userData._em != null) {
      state.selected.material.emissiveIntensity = state.selected.userData._em;
    }
    state.selected = mesh || null;
    if (mesh && mesh.material) {
      mesh.userData._em = mesh.material.emissiveIntensity || 0;
      mesh.material.emissive = mesh.material.emissive || new THREE.Color(0x3ec6ff);
      mesh.material.emissive.setHex(0x3ec6ff);
      mesh.material.emissiveIntensity = 0.55;
      $('sv-build-name') && ($('sv-build-name').value = mesh.userData.name);
      $('sv-build-color') && ($('sv-build-color').value = hexColor(mesh.userData.color));
      $('sv-build-sx') && ($('sv-build-sx').value = mesh.userData.sx.toFixed(2));
      $('sv-build-sy') && ($('sv-build-sy').value = mesh.userData.sy.toFixed(2));
      $('sv-build-sz') && ($('sv-build-sz').value = mesh.userData.sz.toFixed(2));
    }
    var label = $('sv-selected');
    if (label) label.textContent = mesh ? mesh.userData.name : 'nothing selected';
  }

  function rezShape(shape) {
    var p = state.player.position;
    var mesh = addPrim({
      name: 'New ' + shape,
      shape: shape,
      x: p.x + Math.sin(state.yaw) * 3,
      y: p.z + Math.cos(state.yaw) * 3,
      z: p.y + 0.5,
      size: { x: 0.5, y: 0.5, z: 0.5 },
      color: 0xc8b48a
    });
    selectPrim(mesh);
    chatSys('Rezzed a ' + shape + '.');
  }

  function applyBuildFields() {
    var m = state.selected;
    if (!m) return;
    m.userData.name = $('sv-build-name').value || m.userData.name;
    var col = parseHex($('sv-build-color').value, m.userData.color);
    m.userData.color = col;
    m.material.color.setHex(col);
    var sx = clamp(+$('sv-build-sx').value || m.userData.sx, 0.01, 64);
    var sy = clamp(+$('sv-build-sy').value || m.userData.sy, 0.01, 64);
    var sz = clamp(+$('sv-build-sz').value || m.userData.sz, 0.01, 64);
    m.userData.sx = sx; m.userData.sy = sy; m.userData.sz = sz;
    m.geometry.dispose();
    m.geometry = geoFor(m.userData.shape, sx, sy, sz);
  }

  /* ---------- input / loop ---------- */
  var raycaster = null, pointer = new THREE.Vector2();

  function onPointerDown(e) {
    if (e.target.closest && e.target.closest('.sv-ui')) return;
    state.dragging = true;
    state.dragMoved = 0;
    state.lastMX = e.clientX; state.lastMY = e.clientY;
  }
  function onPointerUp(e) {
    state.dragging = false;
  }
  function onPointerMove(e) {
    if (state.mouselook) {
      state.yaw -= e.movementX * 0.0035;
      state.pitch = clamp(state.pitch + e.movementY * 0.003, 0.05, 1.45);
      return;
    }
    if (!state.dragging) return;
    var dx = e.clientX - state.lastMX, dy = e.clientY - state.lastMY;
    state.dragMoved += Math.abs(dx) + Math.abs(dy);
    state.lastMX = e.clientX; state.lastMY = e.clientY;
    state.yaw -= dx * 0.005;
    state.pitch = clamp(state.pitch + dy * 0.004, 0.05, 1.45);
  }

  function pick(e) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    var r = state.renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, state.camera);
    var hits = raycaster.intersectObjects(state.prims.concat(state.terrain ? [state.terrain] : []), false);
    return hits[0] || null;
  }

  function onClick(e) {
    if (e.target.closest && e.target.closest('.sv-ui')) return;
    if (state.dragMoved > 8) return;
    var hit = pick(e);
    if (!hit) return;
    if (hit.object.userData.prim) {
      if (state.buildMode) selectPrim(hit.object);
      else tryTouch(hit.object);
    }
  }

  function onDblClick(e) {
    if (e.target.closest && e.target.closest('.sv-ui')) return;
    var hit = pick(e);
    if (!hit) return;
    unsit();
    var p = hit.point;
    state.player.position.set(clamp(p.x, 1, REGION - 1), p.y, clamp(p.z, 1, REGION - 1));
    chatSys('Teleport.');
  }

  function bindUI() {
    $('sv-chat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = $('sv-chat-input');
      handleChat(inp.value);
      inp.value = '';
    });
    document.querySelectorAll('[data-sv-panel]').forEach(function (btn) {
      btn.addEventListener('click', function () { setPanel(btn.getAttribute('data-sv-panel')); });
    });
    document.querySelectorAll('[data-sv-rez]').forEach(function (btn) {
      btn.addEventListener('click', function () { rezShape(btn.getAttribute('data-sv-rez')); });
    });
    $('sv-build-apply') && $('sv-build-apply').addEventListener('click', applyBuildFields);
    $('sv-build-del') && $('sv-build-del').addEventListener('click', function () {
      if (state.selected) { removePrim(state.selected); chatSys('Deleted.'); }
    });
    ['sv-build-name', 'sv-build-color', 'sv-build-sx', 'sv-build-sy', 'sv-build-sz'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('change', applyBuildFields);
    });
    $('sv-appear-apply') && $('sv-appear-apply').addEventListener('click', function () {
      state.appear.skin = parseHex($('sv-skin').value, state.appear.skin);
      state.appear.hair = parseHex($('sv-hair').value, state.appear.hair);
      state.appear.shirt = parseHex($('sv-shirt').value, state.appear.shirt);
      state.appear.pants = parseHex($('sv-pants').value, state.appear.pants);
      state.appear.height = clamp(+$('sv-height').value || 1, 0.8, 1.25);
      applyAppearance(state.player, state.appear);
      saveAppear();
      chatSys('Appearance saved on this device.');
    });
    var login = $('sv-login-form');
    login.addEventListener('submit', function (e) {
      e.preventDefault();
      var grid = $('sv-grid').value;
      if (grid !== 'sandbox') {
        $('sv-login-err').textContent = SV.GRID[grid] ? SV.GRID[grid].blurb : 'That grid is not available in v0.';
        $('sv-login-err').hidden = false;
        return;
      }
      var n = ($('sv-name').value || 'Resident').replace(/^\s+|\s+$/g, '').slice(0, 31) || 'Resident';
      state.name = n;
      if (state.player) {
        state.player.userData.name = n;
        state.player.userData.parts.tag.material.map = nametagTex(n, '#ffffff');
        state.player.userData.parts.tag.material.map.needsUpdate = true;
      }
      saveAppear();
      enterWorld();
    });
    $('sv-grid').addEventListener('change', function () {
      var g = SV.GRID[this.value];
      $('sv-grid-blurb').textContent = g ? g.blurb : '';
    });
    $('sv-logout') && $('sv-logout').addEventListener('click', function () {
      $('sv-hud').hidden = true;
      $('sv-login').hidden = false;
    });

    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
        if (e.key === 'Escape') { e.target.blur(); closePanels(); }
        return;
      }
      state.keys[e.code] = true;
      if (e.key === 'Shift') state.running = true;
      if (e.code === 'KeyF') { state.flying = !state.flying; unsit(); }
      if (e.code === 'KeyB') setPanel('sv-panel-build');
      if (e.code === 'KeyI') setPanel('sv-panel-inv');
      if (e.code === 'KeyP') setPanel('sv-panel-people');
      if (e.code === 'KeyH') setPanel('sv-panel-help');
      if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey) toggleMouselook();
      if (e.code === 'Escape') {
        if (state.mouselook) toggleMouselook(false);
        closePanels();
      }
      if (e.code === 'Enter') { e.preventDefault(); $('sv-chat-input').focus(); }
      if (e.code === 'Space') { e.preventDefault(); if (state.sitting) unsit(); else if (state.onGround && !state.flying) state.velY = JUMP; }
    });
    window.addEventListener('keyup', function (e) {
      state.keys[e.code] = false;
      if (e.key === 'Shift') state.running = false;
    });

    var canvas = state.renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.dist = clamp(state.dist + e.deltaY * 0.008, 1.2, 28);
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('resize', onResize);

    bindStick();
    $('sv-btn-fly') && $('sv-btn-fly').addEventListener('click', function () { state.flying = !state.flying; unsit(); });
    $('sv-btn-jump') && $('sv-btn-jump').addEventListener('click', function () {
      if (state.sitting) unsit();
      else if (state.onGround && !state.flying) state.velY = JUMP;
    });
  }

  function toggleMouselook(force) {
    var on = force == null ? !state.mouselook : !!force;
    state.mouselook = on;
    if (on) {
      var el = state.renderer.domElement;
      if (el.requestPointerLock) el.requestPointerLock();
    } else if (document.exitPointerLock) document.exitPointerLock();
  }

  function bindStick() {
    var el = $('sv-stick');
    if (!el) return;
    var knob = $('sv-stick-knob');
    function pos(e) {
      var t = e.touches ? e.touches[0] : e;
      var r = el.getBoundingClientRect();
      var x = (t.clientX - r.left) / r.width * 2 - 1;
      var y = (t.clientY - r.top) / r.height * 2 - 1;
      var m = Math.hypot(x, y) || 1;
      if (m > 1) { x /= m; y /= m; }
      state.moveStick.x = x; state.moveStick.y = y; state.moveStick.active = true;
      if (knob) {
        knob.style.transform = 'translate(' + (x * 22) + 'px,' + (y * 22) + 'px)';
      }
    }
    function end() {
      state.moveStick.x = 0; state.moveStick.y = 0; state.moveStick.active = false;
      if (knob) knob.style.transform = 'translate(0,0)';
    }
    el.addEventListener('touchstart', function (e) { e.preventDefault(); pos(e); }, { passive: false });
    el.addEventListener('touchmove', function (e) { e.preventDefault(); pos(e); }, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
  }

  function updatePlayer(dt) {
    var av = state.player;
    if (!av) return;
    if (state.sitting) {
      animateAvatar(av, false, dt, false, true);
      return;
    }
    var fwd = 0, strafe = 0;
    if (state.keys.KeyW || state.keys.ArrowUp) fwd += 1;
    if (state.keys.KeyS || state.keys.ArrowDown) fwd -= 1;
    if (state.keys.KeyA || state.keys.ArrowLeft) strafe -= 1;
    if (state.keys.KeyD || state.keys.ArrowRight) strafe += 1;
    fwd += -state.moveStick.y;
    strafe += state.moveStick.x;
    var flying = state.flying;
    if (state.keys.KeyE || state.keys.PageUp) av.position.y += FLY * dt;
    if (state.keys.KeyC || state.keys.PageDown) av.position.y -= FLY * dt;

    var moving = Math.abs(fwd) + Math.abs(strafe) > 0.05;
    var speed = flying ? FLY : (state.running ? RUN : WALK);
    if (moving) {
      var len = Math.hypot(fwd, strafe) || 1;
      fwd /= len; strafe /= len;
      var sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
      var dx = (sin * fwd + cos * strafe) * speed * dt;
      var dz = (cos * fwd - sin * strafe) * speed * dt;
      var nx = clamp(av.position.x + dx, 1, REGION - 1);
      var nz = clamp(av.position.z + dz, 1, REGION - 1);
      if (av.position.x + dx !== nx && (nx === 1 || nx === REGION - 1)) {
        /* edge */
      }
      if (!collideXZ(nx, av.position.z, av.position.y)) av.position.x = nx;
      if (!collideXZ(av.position.x, nz, av.position.y)) av.position.z = nz;
      av.rotation.y = state.yaw;
    }

    var gy = groundY(av.position.x, av.position.z);
    if (flying) {
      state.onGround = av.position.y <= gy + 0.05;
      av.position.y = clamp(av.position.y, gy, MAX_Z);
      state.velY = 0;
    } else {
      state.velY -= GRAVITY * dt;
      av.position.y += state.velY * dt;
      if (av.position.y <= gy) {
        av.position.y = gy;
        state.velY = 0;
        state.onGround = true;
      } else state.onGround = false;
    }
    animateAvatar(av, moving || flying, dt, flying, false);
  }

  function updateNPCs(dt) {
    for (var i = 0; i < state.agents.length; i++) {
      var a = state.agents[i];
      if (Math.hypot(a.position.x - a.userData.tx, a.position.z - a.userData.tz) < 1.2 || Math.random() < 0.004) {
        var ang = Math.random() * Math.PI * 2, r = rand(8, 36);
        var tx = clamp(128 + Math.cos(ang) * r, 20, 236);
        var tz = clamp(128 + Math.sin(ang) * r, 20, 236);
        if (onLand(tx, tz)) { a.userData.tx = tx; a.userData.tz = tz; }
      }
      var dx = a.userData.tx - a.position.x, dz = a.userData.tz - a.position.z;
      var dist = Math.hypot(dx, dz) || 1;
      var sp = a.userData.speed * dt;
      if (dist > 0.2) {
        a.position.x += dx / dist * sp;
        a.position.z += dz / dist * sp;
        a.rotation.y = Math.atan2(dx, dz);
      }
      a.position.y = heightAt(a.position.x, a.position.z);
      animateAvatar(a, dist > 0.4, dt, false, false);
    }
  }

  function updateCamera() {
    var av = state.player;
    if (!av) return;
    var head = av.position.y + 1.55 * (state.appear.height || 1);
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    var cx = av.position.x - Math.sin(state.yaw) * state.dist * cp;
    var cy = head + state.dist * sp;
    var cz = av.position.z - Math.cos(state.yaw) * state.dist * cp;
    state.camera.position.set(cx, cy, cz);
    state.camera.lookAt(av.position.x, head, av.position.z);
  }

  function updateDay(dt) {
    state.dayT = (state.dayT + dt * 0.008) % 1;
    var t = state.dayT;
    var day = Math.max(0, Math.sin(t * Math.PI * 2));
    if (state.sun) {
      var ang = t * Math.PI * 2;
      state.sun.position.set(Math.cos(ang) * 200, Math.sin(ang) * 200, 80);
      state.sun.intensity = 0.15 + day * 1.05;
      state.sun.color.setHSL(0.08 + day * 0.05, 0.55, 0.55 + day * 0.15);
    }
    if (state.hemi) state.hemi.intensity = 0.25 + day * 0.45;
    if (state.skyUniforms) {
      state.skyUniforms.top.value.setHSL(0.58, 0.55, 0.12 + day * 0.38);
      state.skyUniforms.bot.value.setHSL(0.08, 0.35, 0.18 + day * 0.55);
      state.skyUniforms.sun.value = 1 - day;
    }
    if (state.stars) state.stars.material.opacity = clamp(1 - day * 1.6, 0, 0.9);
    if (state.scene.fog) state.scene.fog.color.copy(state.skyUniforms.bot.value);
    if (state.waterMesh) state.waterMesh.position.y = WATER + Math.sin(state.elapsed * 0.6) * 0.04;
  }

  function updateHud() {
    var av = state.player;
    if (!av) return;
    var slx = av.position.x, sly = av.position.z, slz = av.position.y;
    $('sv-coords').textContent = slx.toFixed(1) + ', ' + sly.toFixed(1) + ', ' + slz.toFixed(1);
    $('sv-region').textContent = 'Supa Sandbox';
    var hour = (state.dayT * 24 + 6) % 24;
    var hh = hour | 0, mm = ((hour - hh) * 60) | 0;
    $('sv-clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    $('sv-mode').textContent = state.sitting ? 'SIT' : state.flying ? 'FLY' : state.onGround ? 'WALK' : 'FALL';
    var near = nearestAgent();
    $('sv-nearby').textContent = near.agent ? near.agent.userData.name + ' · ' + near.dist.toFixed(0) + ' m' : 'nobody';
  }

  var frames = 0, fpsT = 0, fps = 0;
  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, state.clock.getDelta());
    state.elapsed += dt;
    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; $('sv-fps').textContent = fps + ' fps'; }
    updatePlayer(dt);
    updateNPCs(dt);
    updateCamera();
    if (!state.reduced) updateDay(dt);
    updateHud();
    if (frames % 2 === 0) updateMinimap();
    if (state.elapsed * 2 % 1 < dt * 2) { updatePeople(); updateWorldMap(); }
    state.renderer.render(state.scene, state.camera);
  }

  function enterWorld() {
    $('sv-login').hidden = true;
    $('sv-hud').hidden = false;
    $('sv-touch').hidden = !('ontouchstart' in window);
    state.circuit.agentName = state.name;
    state.circuit.system('You are in Supa Sandbox (256 m). This region is simulated in your browser.');
    chatSys('Welcome, ' + state.name + '. Type /help — or just walk around.');
    var n = state.agents[0];
    if (n) setTimeout(function () { chatSay(n.userData.name, 'Hey. Welcome to the sandbox.'); }, 1200);
  }

  function initThree() {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7ec8e3);
    scene.fog = new THREE.Fog(0xcfe8f4, 80, 420);
    state.scene = scene;
    var cam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 1200);
    state.camera = cam;
    var renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('sv-canvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }
    state.renderer = renderer;
    state.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a2a18, 0.7);
    scene.add(state.hemi);
    state.sun = new THREE.DirectionalLight(0xfff1d0, 1.05);
    state.sun.position.set(80, 140, 40);
    state.sun.castShadow = true;
    state.sun.shadow.mapSize.set(1024, 1024);
    state.sun.shadow.camera.near = 1;
    state.sun.shadow.camera.far = 400;
    state.sun.shadow.camera.left = -80;
    state.sun.shadow.camera.right = 80;
    state.sun.shadow.camera.top = 80;
    state.sun.shadow.camera.bottom = -80;
    scene.add(state.sun);
    state.clock = new THREE.Clock();
  }

  SV.boot = function () {
    if (!global.THREE) {
      var err = $('sv-boot-err');
      if (err) { err.hidden = false; err.textContent = 'Three.js failed to load. Serve this page over HTTP and check the CDN.'; }
      return;
    }
    state.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    loadAppear();
    if ($('sv-name') && state.name) $('sv-name').value = state.name;
    ['sv-skin', 'sv-hair', 'sv-shirt', 'sv-pants'].forEach(function (id) {
      var key = id.slice(3);
      if ($(id) && state.appear[key]) $(id).value = hexColor(state.appear[key]);
    });
    if ($('sv-height')) $('sv-height').value = state.appear.height;
    state.circuit = new SV.protocol.LocalCircuit({});
    initThree();
    buildSky();
    buildTerrain();
    seedRegion();
    spawnPlayer();
    spawnNPCs();
    defaultInventory();
    renderInventory();
    bindUI();
    $('sv-loading').hidden = true;
    $('sv-login').hidden = false;
    $('sv-grid-blurb').textContent = SV.GRID.sandbox.blurb;
    loop();
  };
})(window);
