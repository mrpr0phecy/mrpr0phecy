/* EOT Audio — fully procedural WebAudio sound design.
 *
 * There are no audio files in this project, on purpose: the game stays a
 * standalone single-page download with nothing to fetch, and synthesised
 * sound can be pitched and layered per event in ways a fixed sample cannot.
 *
 * Two rules from the game-feel research drive everything here:
 *   1. Every action gets a sound. A hit is never one sound — it is an impact
 *      transient, a body, and a tail, layered.
 *   2. Pitch varies per event (±12%) so a repeated swing never sounds like a
 *      machine gun of the same sample.
 *
 * The AudioContext is created lazily on the first user gesture, because
 * browsers refuse to start one before that. Nothing here throws if WebAudio
 * is missing — the game must be playable muted.
 *
 * Browser: window.EOTAudio
 */
(function (root) {
'use strict';

var ctx = null, master = null, musicGain = null, sfxGain = null;
var started = false, muted = false;
var masterVol = 0.85, sfxVol = 0.9, musicVol = 0.5;
var noiseBuf = null;

function available() { return typeof (root.AudioContext || root.webkitAudioContext) !== 'undefined'; }

function init() {
  if (started || !available()) return false;
  var AC = root.AudioContext || root.webkitAudioContext;
  try { ctx = new AC(); } catch (e) { return false; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : masterVol; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);

  /* one shared noise buffer — reused by every percussive hit */
  var len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = noiseBuf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  started = true;
  startMusic();
  return true;
}

function resume() {
  if (!started) init();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : masterVol;
}

function setMasterVolume(v) {
  masterVol = Math.max(0, Math.min(1, v));
  if (master && !muted) master.gain.value = masterVol;
}
function setSfxVolume(v) {
  sfxVol = Math.max(0, Math.min(1, v));
  if (sfxGain) sfxGain.gain.value = sfxVol;
}
function setMusicVolume(v) {
  musicVol = Math.max(0, Math.min(1, v));
}

function now() { return ctx ? ctx.currentTime : 0; }
function rnd(a, b) { return a + Math.random() * (b - a); }

/* ------------------------- primitives ------------------------- */
function tone(o) {
  if (!started || muted) return;
  var t = now() + (o.delay || 0);
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), t + (o.atk || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  var node = osc;
  if (o.filter) {
    var f = ctx.createBiquadFilter();
    f.type = o.filter; f.frequency.value = o.fc || 1200; f.Q.value = o.q || 1;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(o.bus || sfxGain);
  osc.start(t); osc.stop(t + o.dur + 0.02);
}

function noise(o) {
  if (!started || muted) return;
  var t = now() + (o.delay || 0);
  var src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = o.rate || 1;
  var f = ctx.createBiquadFilter();
  f.type = o.filter || 'bandpass';
  f.frequency.setValueAtTime(o.fc || 900, t);
  if (o.fc1) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.fc1), t + o.dur);
  f.Q.value = o.q || 1.1;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.25), t + (o.atk || 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxGain);
  src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
}

/* ------------------------- game events ------------------------- */
/* A swing that misses: air, no body. Landing one is a different sound. */
function swing(heavy) {
  noise({ fc: heavy ? 520 : 900, fc1: heavy ? 180 : 320, dur: heavy ? 0.24 : 0.15, gain: heavy ? 0.3 : 0.17, q: 0.8, rate: rnd(0.9, 1.15) });
  tone({ type: 'triangle', f0: heavy ? 240 : 380, f1: heavy ? 90 : 150, dur: heavy ? 0.18 : 0.1, gain: 0.09 });
}
function whiff() { noise({ fc: 1400, fc1: 500, dur: 0.12, gain: 0.08, q: 0.6 }); }

/* The most important sound in the game. Three layers: a click transient, a
 * mid body, and a low thud for weight. */
function hit(heavy) {
  var p = rnd(0.9, 1.14);
  noise({ fc: heavy ? 1600 : 2400, fc1: 500, dur: 0.07, gain: heavy ? 0.4 : 0.26, q: 0.7, rate: p });
  tone({ type: 'square', f0: (heavy ? 190 : 300) * p, f1: (heavy ? 60 : 110) * p, dur: heavy ? 0.16 : 0.1, gain: heavy ? 0.22 : 0.13 });
  tone({ type: 'sine', f0: (heavy ? 95 : 140) * p, f1: 42, dur: 0.26, gain: heavy ? 0.3 : 0.18 });
}

/* Anime parry / clash: resonant metallic ring + harmonic sparkle + low punch */
function parry() {
  tone({ type: 'triangle', f0: 1840, f1: 1200, dur: 0.45, gain: 0.32 });
  tone({ type: 'square', f0: 920, f1: 340, dur: 0.28, gain: 0.22, filter: 'bandpass', fc: 1400, q: 3 });
  noise({ fc: 3800, fc1: 800, dur: 0.18, gain: 0.35, q: 1.8 });
  tone({ type: 'sine', f0: 160, f1: 50, dur: 0.35, gain: 0.38 });
}

function vault() {
  noise({ fc: 600, fc1: 1800, dur: 0.18, gain: 0.16, q: 1.2, rate: rnd(0.95, 1.1) });
  tone({ type: 'sine', f0: 220, f1: 340, dur: 0.14, gain: 0.08 });
}

function trapPlace() {
  tone({ type: 'square', f0: 440, f1: 880, dur: 0.12, gain: 0.14 });
  tone({ type: 'sine', f0: 110, f1: 55, dur: 0.24, gain: 0.16 });
}

function trapTrigger() {
  noise({ fc: 2200, fc1: 300, dur: 0.35, gain: 0.32, q: 2.2 });
  tone({ type: 'sawtooth', f0: 580, f1: 80, dur: 0.32, gain: 0.24, filter: 'lowpass', fc: 900 });
}

function ping() {
  tone({ type: 'sine', f0: 1480, f1: 1480, dur: 0.22, gain: 0.18 });
  tone({ type: 'sine', f0: 2220, f1: 2220, dur: 0.18, gain: 0.12, delay: 0.04 });
}

function dash() {
  noise({ fc: 300, fc1: 2600, dur: 0.2, gain: 0.2, q: 1.4, rate: rnd(0.95, 1.2) });
  tone({ type: 'sine', f0: 180, f1: 720, dur: 0.16, gain: 0.1 });
}

function ult(role) {
  var base = role === 'slayer' ? 55 : 82;
  for (var i = 0; i < 5; i++) {
    tone({ type: 'sawtooth', f0: base * (i + 1) * 1.5, f1: base * (i + 1) * 0.6, dur: 0.9 - i * 0.08, gain: 0.11 / (i * 0.6 + 1), delay: i * 0.02, filter: 'lowpass', fc: 2600 });
  }
  noise({ fc: 220, fc1: 3200, dur: 0.8, gain: 0.24, q: 0.9 });
  tone({ type: 'sine', f0: 48, f1: 30, dur: 1.1, gain: 0.32 });
}
function nova() {
  noise({ fc: 4200, fc1: 200, dur: 0.6, gain: 0.34, q: 0.7 });
  tone({ type: 'sine', f0: 620, f1: 60, dur: 0.5, gain: 0.24 });
}

function down() {
  tone({ type: 'sawtooth', f0: 300, f1: 55, dur: 0.7, gain: 0.2, filter: 'lowpass', fc: 900 });
  noise({ fc: 700, fc1: 120, dur: 0.5, gain: 0.22 });
}
function hook() {
  tone({ type: 'square', f0: 120, f1: 48, dur: 0.5, gain: 0.22 });
  noise({ fc: 1800, fc1: 240, dur: 0.3, gain: 0.2, q: 1.6 });
}
function rescue() {
  [523, 659, 784].forEach(function (f, i) {
    tone({ type: 'triangle', f0: f, f1: f * 1.01, dur: 0.28, gain: 0.14, delay: i * 0.07 });
  });
}
function heal() { tone({ type: 'sine', f0: 440, f1: 880, dur: 0.3, gain: 0.1 }); }

function skill() { tone({ type: 'square', f0: 1180, f1: 1180, dur: 0.05, gain: 0.09 }); }
function great() {
  [880, 1320].forEach(function (f, i) { tone({ type: 'square', f0: f, dur: 0.12, gain: 0.12, delay: i * 0.05 }); });
}
function fail() { tone({ type: 'sawtooth', f0: 200, f1: 70, dur: 0.3, gain: 0.18, filter: 'lowpass', fc: 700 }); }

function anchorDone() {
  [392, 523, 659, 784].forEach(function (f, i) {
    tone({ type: 'triangle', f0: f, dur: 0.35, gain: 0.15, delay: i * 0.08 });
  });
  tone({ type: 'sine', f0: 65, f1: 40, dur: 0.8, gain: 0.28 });
}
function gateOpen() {
  tone({ type: 'sawtooth', f0: 90, f1: 420, dur: 0.9, gain: 0.16, filter: 'lowpass', fc: 1800 });
  noise({ fc: 300, fc1: 2400, dur: 0.9, gain: 0.14 });
}
function escape() {
  [523, 784, 1047].forEach(function (f, i) { tone({ type: 'triangle', f0: f, dur: 0.5, gain: 0.16, delay: i * 0.1 }); });
}
function eliminate() {
  tone({ type: 'sawtooth', f0: 220, f1: 32, dur: 1.3, gain: 0.26, filter: 'lowpass', fc: 600 });
  noise({ fc: 500, fc1: 80, dur: 1.1, gain: 0.2 });
}
function matchStart() {
  tone({ type: 'sawtooth', f0: 60, f1: 240, dur: 1.4, gain: 0.22, filter: 'lowpass', fc: 1400 });
  noise({ fc: 160, fc1: 1800, dur: 1.2, gain: 0.12 });
}
function matchEnd(win) {
  var seq = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
  seq.forEach(function (f, i) { tone({ type: 'triangle', f0: f, dur: 0.7, gain: 0.17, delay: i * 0.16 }); });
}
function ui() { tone({ type: 'square', f0: 660, f1: 880, dur: 0.06, gain: 0.07 }); }
function uiBack() { tone({ type: 'square', f0: 420, f1: 300, dur: 0.07, gain: 0.06 }); }

/* Terror heartbeat: the survivor's proximity alarm. Driven by distance, so
 * the rate itself is the information — no HUD needed. */
function heartbeat(intensity) {
  if (!started || muted || intensity <= 0.02) return;
  var g = 0.1 + intensity * 0.24;
  tone({ type: 'sine', f0: 62, f1: 38, dur: 0.16, gain: g });
  tone({ type: 'sine', f0: 58, f1: 34, dur: 0.14, gain: g * 0.7, delay: 0.17 });
}
function heartbeatInterval(intensity) {
  /* 1.15s when the slayer is far, down to 0.3s when they are on top of you */
  return 1.15 - Math.min(1, intensity) * 0.85;
}

/* ------------------------- music bed -------------------------
 * A slow minor drone that thickens under pressure. Two detuned saws through
 * a lowpass, plus a sub. It never competes with the SFX. */
var musicNodes = null;
function startMusic() {
  if (!started || musicNodes) return;
  var t = now();
  var lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 3;
  var g = ctx.createGain(); g.gain.value = 0.5;
  lp.connect(g); g.connect(musicGain);

  var oscs = [];
  [55, 82.4, 110].forEach(function (f, i) {
    var o = ctx.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 7;
    var og = ctx.createGain(); og.gain.value = i === 2 ? 0.28 : 0.5;
    o.connect(og); og.connect(lp);
    o.start(t);
    oscs.push(o);
  });
  var sub = ctx.createOscillator();
  sub.type = 'sine'; sub.frequency.value = 36.7;
  var sg = ctx.createGain(); sg.gain.value = 0.6;
  sub.connect(sg); sg.connect(musicGain); sub.start(t);

  musicNodes = { lp: lp, gain: g, oscs: oscs.concat([sub]) };
}

/* intensity 0..1 — the music opens up as the slayer closes in */
function setTension(intensity, dt) {
  if (!musicNodes || !started) return;
  var i = Math.max(0, Math.min(1, intensity));
  var targetFc = 300 + i * 1500;
  var targetVol = (0.1 + i * 0.2) * musicVol;
  var k = 1 - Math.pow(0.02, dt || 0.05);
  musicNodes.lp.frequency.value += (targetFc - musicNodes.lp.frequency.value) * k;
  musicGain.gain.value += (targetVol - musicGain.gain.value) * k;
}

function palletDrop() {
  tone({ type: 'sawtooth', f0: 160, f1: 45, dur: 0.22, gain: 0.22, filter: 'lowpass', fc: 600 });
  noise({ fc: 800, fc1: 100, dur: 0.18, gain: 0.26, q: 1.2 });
}

function palletBreak() {
  noise({ fc: 2200, fc1: 150, dur: 0.35, gain: 0.32, q: 0.9 });
  tone({ type: 'sawtooth', f0: 140, f1: 30, dur: 0.3, gain: 0.28, filter: 'lowpass', fc: 400 });
}

function palletStun() {
  palletDrop();
  tone({ type: 'sine', f0: 880, f1: 440, dur: 0.45, gain: 0.25, delay: 0.05 });
  noise({ fc: 3200, fc1: 200, dur: 0.4, gain: 0.28, q: 1.1 });
}

function chestOpen() {
  noise({ fc: 3400, fc1: 800, dur: 0.4, gain: 0.18, q: 1.8 });
  [659, 880, 1046].forEach(function (f, i) {
    tone({ type: 'triangle', f0: f, dur: 0.22, gain: 0.12, delay: 0.12 + i * 0.06 });
  });
}

function flashBang() {
  tone({ type: 'sine', f0: 3800, f1: 3800, dur: 1.4, gain: 0.35 });
  noise({ fc: 4800, fc1: 120, dur: 0.6, gain: 0.42, q: 0.8 });
}

function chronoRewind() {
  tone({ type: 'sine', f0: 220, f1: 1240, dur: 0.42, gain: 0.28 });
  noise({ fc: 1800, fc1: 4200, dur: 0.35, gain: 0.24, q: 2.2 });
  [784, 659, 523, 440].forEach(function (f, i) {
    tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.15, delay: i * 0.05 });
  });
}

function riposte() {
  tone({ type: 'square', f0: 1480, f1: 1200, dur: 0.18, gain: 0.28 });
  noise({ fc: 4400, fc1: 800, dur: 0.24, gain: 0.32, q: 2.5 });
  tone({ type: 'sine', f0: 120, f1: 60, dur: 0.3, gain: 0.3 });
}

function awakening() {
  tone({ type: 'sawtooth', f0: 180, f1: 35, dur: 1.8, gain: 0.38, filter: 'lowpass', fc: 800 });
  tone({ type: 'sine', f0: 55, f1: 28, dur: 2.2, gain: 0.45 });
  noise({ fc: 2400, fc1: 100, dur: 1.4, gain: 0.35, q: 1.5 });
}

function serum() {
  tone({ type: 'sine', f0: 320, f1: 640, dur: 0.25, gain: 0.18 });
  tone({ type: 'triangle', f0: 523, f1: 784, dur: 0.3, gain: 0.15, delay: 0.1 });
}

function overclockShock() {
  noise({ fc: 3800, fc1: 400, dur: 0.4, gain: 0.3, q: 2.0 });
  tone({ type: 'sawtooth', f0: 440, f1: 110, dur: 0.35, gain: 0.22 });
}

/* Map a sim event to a sound. The engine calls this for every event the sim
 * emits, so the mapping lives in one place. */
function playEvent(e) {
  switch (e.t) {
    case 'swing': swing(e.heavy); break;
    case 'whiff': whiff(); break;
    case 'hit': hit(e.amount >= 40); break;
    case 'slash': hit(false); break;
    case 'parry': parry(); break;
    case 'vault': vault(); break;
    case 'trapPlace': trapPlace(); break;
    case 'trapTrigger': trapTrigger(); break;
    case 'ping': ping(); break;
    case 'dash': dash(); break;
    case 'ult': ult(e.role); break;
    case 'ultSurv': ult('survivor'); break;
    case 'ultSlayer': ult('slayer'); break;
    case 'nova': nova(); break;
    case 'down': down(); break;
    case 'hook': hook(); break;
    case 'rescue': rescue(); break;
    case 'unhook': rescue(); break;
    case 'heal': heal(); break;
    case 'skillcheck': skill(); break;
    case 'great': great(); break;
    case 'fail': fail(); break;
    case 'anchorDone': anchorDone(); break;
    case 'gateOpen': gateOpen(); break;
    case 'gateDone': gateOpen(); break;
    case 'powered': gateOpen(); break;
    case 'gatesPowered': gateOpen(); break;
    case 'escape': escape(); break;
    case 'eliminate': eliminate(); break;
    case 'matchStart': matchStart(); break;
    case 'core': nova(); eliminate(); break;
    case 'anchorHit': hit(true); break;
    case 'anchorSmash': hit(true); break;
    case 'good': skill(); break;
    case 'hookStage': hook(); break;
    case 'pickup': hit(false); break;
    case 'dropVictim': hit(false); break;
    case 'toolUsed': serum(); break;
    case 'decoySpawned': ping(); break;
    case 'palletDrop': palletDrop(); break;
    case 'palletBreak': palletBreak(); break;
    case 'palletStun': palletStun(); break;
    case 'chestOpened': chestOpen(); break;
    case 'flashBang': flashBang(); break;
    case 'flashBlind': flashBang(); break;
    case 'chronoRewind': chronoRewind(); break;
    case 'riposte': riposte(); break;
    case 'awakening': awakening(); break;
    case 'serumUsed': serum(); break;
    case 'overclockShock': overclockShock(); break;
    default: break;
  }
}

root.EOTAudio = {
  available: available, init: init, resume: resume, setMuted: setMuted,
  setMasterVolume: setMasterVolume, setSfxVolume: setSfxVolume, setMusicVolume: setMusicVolume,
  playEvent: playEvent, setTension: setTension,
  heartbeat: heartbeat, heartbeatInterval: heartbeatInterval,
  ui: ui, uiBack: uiBack, matchEnd: matchEnd,
  get started() { return started; }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
