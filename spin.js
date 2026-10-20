/* spin.js — the flywheel: a fidget spinner that is also the catalogue's index.
   The angle is the index (index = floor(angle / 2π × N) mod N), so one turn
   walks all N tools and a deliberate turn returns where it started. The resting
   state is an SVG in index.html; this file is fetched on intent and takes it
   over. Why, how the detail is spent, and what it costs: ARCHITECTURE.md §10.
*/
(function () {
  'use strict';
  if (window.__mpFlywheel) return;
  window.__mpFlywheel = true;

  var root = document.getElementById('flywheel');
  if (!root) return;
  var stage = document.getElementById('flywheel-stage');
  var idle = document.getElementById('flywheel-idle');
  var btn = document.getElementById('flywheel-btn');
  var rpmEl = document.getElementById('flywheel-rpm');
  var passedEl = document.getElementById('flywheel-passed');
  var live = document.getElementById('flywheel-live');
  var result = document.getElementById('flywheel-result');
  if (!stage || !btn || !rpmEl || !passedEl || !live || !result) return;

  var TAU = Math.PI * 2;

  /* A hard throw (ω₀ ≈ 80 rad/s) runs for about 3.3 s: enough to feel thrown,
     short enough that nobody waits for an answer they did not ask for. */
  var FRICTION = 1.55;   // exponential decay per second
  var BRAKE = 0.22;      // rad/s² constant drag, so it always stops
  var STOP = 0.35;       // rad/s below which the wheel is at rest
  var MAX_OMEGA = 105;   // rad/s ≈ 1,000 rpm: fast, and still drawable

  /* Detail tiers. At 40 rpm a mark passes six times a second — no longer
     individual marks; at 240 rpm an arm is no longer an arm. */
  var RPM_FULL = 40;
  var RPM_FLAT = 240;

  var NOMINAL_COUNT = 1424;   // the published catalogue size, before it loads
  var MARKS = 180;            // bezel marks; 1,424 / 180 ≈ 8 tools each

  var state = {
    size: 300,
    dpr: 1,
    reduced: false,
    paused: false,
    tools: null,
    spun: false,
    keyboardSpin: false,
    warmPromise: null
  };

  /* The angle lives in [0, 2π): wrapped every frame, an angle that accumulated
     for an hour would lose the bits that decide the landed tool. */
  var angle = 0;
  var omega = 0;
  var passed = 0;
  var dragging = false;
  var lastAngle = 0;
  var samples = [];
  var raf = 0;
  var lastT = 0;
  var lastReadout = 0;
  var flash = 0;
  var lastMark = 0;

  var canvas = null;
  var ctx = null;
  var base = null;      // the bezel, drawn once per size
  var baseCtx = null;

  function count() {
    return state.tools && state.tools.length ? state.tools.length : NOMINAL_COUNT;
  }

  /* The count the next result will actually be drawn from: syncs the catalogue,
     then answers. Anything that places the arm by hand has to use this, or it
     aims using the nominal 1,424 and lands somewhere else in a real list. */
  function liveCount() {
    allRows();
    return count();
  }

  function indexAt(a) {
    var n = count();
    var i = Math.floor((a / TAU) * n) % n;
    return i < 0 ? i + n : i;
  }

  function group(n) {
    return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function rpm() { return Math.abs(omega) * 60 / TAU; }

  function rotate(d) {
    if (!d) return;
    angle += d;
    angle %= TAU;
    if (angle < 0) angle += TAU;
    passed += (Math.abs(d) / TAU) * count();
    state.spun = true;
    var mark = Math.floor((angle / TAU) * MARKS);
    if (mark !== lastMark) {
      lastMark = mark;
      if (rpm() < RPM_FULL) flash = 1;
    }
  }

  /* The bezel, once per size, in the SVG's own 320-unit box so the canvas and
     the resting picture agree to the pixel. */
  function paintBase() {
    var px = Math.round(state.size * state.dpr);
    if (!base) {
      base = document.createElement('canvas');
      baseCtx = base.getContext('2d');
    }
    if (!baseCtx) return;   // no canvas here: the SVG picture stays, and nothing throws
    base.width = px;
    base.height = px;
    var b = baseCtx;
    b.setTransform(px / 320, 0, 0, px / 320, 0, 0);
    b.clearRect(0, 0, 320, 320);

    b.beginPath();
    b.arc(160, 160, 154, 0, TAU);
    b.fillStyle = '#05090d';
    b.fill();

    b.beginPath();
    b.arc(160, 160, 152, 0, TAU);
    b.strokeStyle = '#555555';
    b.lineWidth = 1;
    b.stroke();

    b.strokeStyle = 'rgba(138, 138, 138, 0.55)';
    b.lineWidth = 1.4;
    b.beginPath();
    for (var i = 0; i < MARKS; i++) {
      var a = (i / MARKS) * TAU - Math.PI / 2;
      var c = Math.cos(a), s = Math.sin(a);
      b.moveTo(160 + c * 147, 160 + s * 147);
      b.lineTo(160 + c * 153, 160 + s * 153);
    }
    b.stroke();

    b.strokeStyle = 'rgba(255, 215, 0, 0.8)';
    b.lineWidth = 3;
    b.beginPath();
    for (var j = 0; j < 12; j++) {
      var ma = (j / 12) * TAU - Math.PI / 2;
      var mc = Math.cos(ma), ms = Math.sin(ma);
      b.moveTo(160 + mc * 154, 160 + ms * 154);
      b.lineTo(160 + mc * 158, 160 + ms * 158);
    }
    b.stroke();

    b.beginPath();
    b.arc(160, 160, 141, 0, TAU);
    b.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    b.lineWidth = 1;
    b.stroke();
  }

  /* -------------------------------------------------------------- the frame */
  function drawFrame() {
    if (!ctx || !base || !base.getContext) return;
    var px = Math.round(state.size * state.dpr);
    ctx.setTransform(px / 320, 0, 0, px / 320, 0, 0);
    ctx.clearRect(0, 0, 320, 320);
    ctx.drawImage(base, 0, 0, 320, 320);

    var speed = rpm();
    var cx = 160, cy = 160;

    if (speed > RPM_FLAT) {
      /* A blur, not a rotor: two arcs read as motion at any frame rate. */
      for (var k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(cx, cy, 74 - k * 10, 0, TAU);
        ctx.strokeStyle = k ? 'rgba(212, 175, 55, 0.30)' : 'rgba(255, 215, 0, 0.16)';
        ctx.lineWidth = 26 - k * 10;
        ctx.stroke();
      }
      /* Eight fading segments, so the direction of travel survives the blur. */
      var dir = omega >= 0 ? 1 : -1;
      for (var t = 0; t < 8; t++) {
        var a0 = angle - dir * 0.7 * (t / 8) - Math.PI / 2;
        var a1 = angle - dir * 0.7 * ((t + 1) / 8) - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 104, Math.min(a0, a1), Math.max(a0, a1));
        ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.34 * (1 - t / 8)).toFixed(3) + ')';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    } else {
      drawRotor(speed <= RPM_FULL);
      if (speed > RPM_FULL) {
        var back = omega >= 0 ? -1 : 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 104, angle - Math.PI / 2, angle - Math.PI / 2 + back * Math.min(1.1, speed / 240), back < 0);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.22)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    drawHub();
    drawPointer();
  }

  function drawRotor(detail) {
    ctx.save();
    ctx.translate(160, 160);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    for (var i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i / 3) * TAU);
      var gold = i === 0;
      if (detail) {
        var g = ctx.createLinearGradient(0, 0, 0, -74);
        if (gold) { g.addColorStop(0, '#a1791f'); g.addColorStop(1, '#ffd700'); }
        else { g.addColorStop(0, '#141b21'); g.addColorStop(1, '#2f3a44'); }
        ctx.strokeStyle = g;
      } else {
        ctx.strokeStyle = gold ? '#ffd700' : '#2f3a44';
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -74);
      ctx.stroke();
      if (detail) {
        /* The screw at the tip: what makes it read as an object. */
        ctx.beginPath();
        ctx.arc(0, -66, 6, 0, TAU);
        ctx.fillStyle = '#0b1219';
        ctx.fill();
        ctx.strokeStyle = gold ? 'rgba(4, 7, 10, 0.55)' : '#555555';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHub() {
    ctx.beginPath();
    ctx.arc(160, 160, 34, 0, TAU);
    ctx.fillStyle = '#0b1219';
    ctx.fill();
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(160, 160, 24, 0, TAU);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(160, 160, 7, 0, TAU);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
  }

  function drawPointer() {
    ctx.beginPath();
    ctx.moveTo(160, 4);
    ctx.lineTo(151, 20);
    ctx.lineTo(169, 20);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    if (flash > 0.02) {
      /* A mark just went past: the detent a thumb would feel. */
      ctx.globalAlpha = flash;
      ctx.beginPath();
      ctx.arc(160, 18, 13, 0, TAU);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------------------------------------------- physics */
  function step(dt) {
    if (dragging) return;
    omega *= Math.exp(-FRICTION * dt);
    var brake = BRAKE * dt;
    omega = omega > 0 ? Math.max(0, omega - brake) : Math.min(0, omega + brake);
    if (Math.abs(omega) < 0.0001) omega = 0;
    rotate(omega * dt);
  }

  function frame(now) {
    raf = 0;
    if (!lastT) lastT = now;
    // A tab that was hidden for a minute must not integrate a minute of spin.
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    step(dt);
    if (flash > 0) flash = Math.max(0, flash - dt * 4);
    drawFrame();
    readout(now);
    if (state.paused) return;
    if (dragging || Math.abs(omega) > STOP) raf = requestAnimationFrame(frame);
    else settle();
  }

  function startLoop() {
    if (state.reduced) { drawFrame(); return; }
    if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function readout(now) {
    if (now - lastReadout < 80) return;
    lastReadout = now;
    var r = rpm();
    rpmEl.textContent = group(r);
    passedEl.textContent = group(passed);
    rpmEl.classList.toggle('is-hot', r > 300);
  }

  function settle() {
    if (!state.spun) return;
    state.spun = false;
    omega = 0;
    flash = 0;
    drawFrame();
    rpmEl.textContent = '0';
    rpmEl.classList.remove('is-hot');
    landed();
  }

  /* ------------------------------------------------------------ the answer -- */
  function allRows() {
    var api = window.mpExplore;
    if (!api || typeof api.all !== 'function') return null;
    var rows = api.all();
    if (!rows || !rows.length) return null;
    /* The dial's N is this array's length, and it has to be the real one: a
       nominal 1,424 would make the marks, the counter and the landed index
       disagree with the list the engine actually holds (the test caught it
       reporting index 29 of a 24-tool fixture). */
    state.tools = rows;
    return rows;
  }

  function warm() {
    if (state.warmPromise) return state.warmPromise;
    var api = window.mpExplore;
    if (!api || typeof api.warm !== 'function') return null;
    state.warmPromise = Promise.resolve(api.warm()).then(function () {
      return allRows();
    }, function () {
      state.warmPromise = null;
      return null;
    });
    return state.warmPromise;
  }

  function say(text) { live.textContent = text; }

  function landed() {
    var rows = allRows();
    if (rows) { renderAnswer(rows); return; }
    // The first throw is the load trigger: a spin is intent, which is exactly
    // what the lazy catalogue waits for. This is the guarded path, not a warm-up.
    var pending = warm();
    if (!pending) { renderAnswer(null); return; }
    say('Spinning past ' + group(passed) + ' tools…');
    pending.then(function (loaded) { renderAnswer(loaded || allRows()); });
  }

  function renderAnswer(rows) {
    if (!rows || !rows.length) {
      result.hidden = true;
      say('The catalogue could not load. The A–Z directory has every tool.');
      return;
    }
    var row = rows[indexAt(angle) % rows.length];
    if (!row) { result.hidden = true; return; }

    while (result.firstChild) result.removeChild(result.firstChild);
    var kicker = document.createElement('p');
    kicker.className = 'flywheel-result-kicker';
    kicker.textContent = passed > 0 ? 'Landed after ' + group(passed) + ' tools' : 'Landed on';
    var link = document.createElement('a');
    link.className = 'flywheel-result-title';
    link.href = row.url || ('tool/' + encodeURIComponent(row.slug) + '.html');
    link.textContent = row.title;
    var cat = document.createElement('p');
    cat.className = 'flywheel-result-cat';
    cat.textContent = row.catName || row.cat || '';
    result.appendChild(kicker);
    result.appendChild(link);
    result.appendChild(cat);
    if (row.desc) {
      var desc = document.createElement('p');
      desc.className = 'flywheel-result-desc';
      desc.textContent = row.desc;
      result.appendChild(desc);
    }
    result.hidden = false;
    btn.textContent = 'Spin again';
    say('Landed on ' + row.title + (row.catName ? ', ' + row.catName : '') + '.');
    if (state.keyboardSpin) { try { link.focus(); } catch (e) {} }
    state.keyboardSpin = false;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'dial_land', {
        tool: row.slug,
        tools_passed: Math.round(passed),
        rpm: Math.round(rpm())
      });
    }
  }

  /* ------------------------------------------------------------------ input */
  function pointAngle(e) {
    var r = canvas.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  function wrap(d) {
    if (d > Math.PI) return d - TAU;
    if (d < -Math.PI) return d + TAU;
    return d;
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (state.reduced) return;
    dragging = true;
    omega = 0;
    passed = 0;
    samples = [];
    lastAngle = pointAngle(e);
    canvas.classList.add('is-dragging');
    stopLoop();
    say('Spinning…');
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }

  function onMove(e) {
    if (!dragging) return;
    var a = pointAngle(e);
    var d = wrap(a - lastAngle);
    lastAngle = a;
    rotate(d);
    samples.push({ t: e.timeStamp, d: d });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 120) samples.shift();
    /* The release velocity is what the hand did in the last moment, which is
       why a slow turn ends in a stop and a flick throws. */
    var span = (e.timeStamp - samples[0].t) / 1000;
    if (span > 0.01) {
      var sum = 0;
      for (var i = 0; i < samples.length; i++) sum += samples[i].d;
      omega = sum / span;
    }
    drawFrame();
    readout(performance.now());
    if (e.cancelable) e.preventDefault();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    canvas.classList.remove('is-dragging');
    omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, omega));
    if (Math.abs(omega) < 1.2) {   // caught, not thrown
      omega = 0;
      settle();
      return;
    }
    startLoop();
  }

  function flick(power) {
    passed = 0;
    samples = [];
    if (state.reduced) {
      /* No animation, but still the dial's real answer: the arm is placed where
         a throw would have left it, so the index and the picture agree. */
      var n = liveCount();
      angle = ((Math.floor(Math.random() * n) + 0.5) / n) * TAU;
      state.spun = true;
      drawFrame();
      settle();
      return;
    }
    stopLoop();
    omega = (Math.random() < 0.5 ? -1 : 1) * (power || (58 + Math.random() * 26));
    say('Spinning…');
    startLoop();
  }

  /* --------------------------------------------------------------- mounting */
  function makeCanvas() {
    canvas = document.createElement('canvas');
    canvas.className = 'flywheel-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, btn);
    ctx = canvas.getContext('2d');
    /* The picture is replaced, not covered. (`el.hidden = true` on an SVG is
       an expando — SVGElement has no hidden property — so assigning it left
       both dials on screen, measured, then fixed.) */
    if (idle && idle.parentNode) idle.parentNode.removeChild(idle);
    idle = null;
  }

  function measure() {
    var w = canvas ? canvas.getBoundingClientRect().width : 0;
    if (!w) w = Math.min(300, stage.clientWidth || 300);
    state.size = Math.round(w) || 300;
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.size * state.dpr);
    canvas.height = Math.round(state.size * state.dpr);
    paintBase();
    drawFrame();
  }

  var mounted = false;
  function mount() {
    if (mounted) return;
    mounted = true;
    makeCanvas();
    measure();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (canvas) measure(); }).observe(stage);
    } else {
      window.addEventListener('resize', function () { if (canvas) measure(); });
    }

    document.addEventListener('visibilitychange', function () {
      state.paused = document.hidden;
      if (!state.paused && Math.abs(omega) > STOP) startLoop();
    });

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        state.paused = !entries[0].isIntersecting;
        if (!state.paused && Math.abs(omega) > STOP) startLoop();
      }, { threshold: 0 }).observe(root);
    }
  }

  btn.addEventListener('click', function (e) {
    state.keyboardSpin = e.detail === 0;
    flick();
  });

  stage.addEventListener('dblclick', function (e) {
    if (e.target === btn) return;
    flick(92);
  });

  stage.addEventListener('pointerdown', function (e) {
    if (e.target === btn) return;
    onDown(e);
  });

  /* The arrows walk the dial a mark at a time; Space or Enter throws it. */
  btn.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    var step = (e.key === 'ArrowRight' ? 1 : -1) * (TAU / MARKS);
    passed = 0;
    rotate(step);
    drawFrame();
    settle();
  });

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  state.reduced = !!(mq && mq.matches);
  if (mq) {
    var onChange = function (e) {
      state.reduced = !!e.matches;
      if (state.reduced) { stopLoop(); drawFrame(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  mount();

  /* The dial's own numbers, for a test or for anything that wants to read the
     instrument from outside. Deliberately tiny: index, angle, and the state a
     caller would need to know whether a result is real. */
  window.mpFlywheel = {
    index: function () { return indexAt(angle); },
    angle: function () { return angle; },
    landed: function () { return result.hidden === false; },
    /* Place the arm where a throw would have left it, with no animation:
       id = a real tool index, pass = which hash of angle to use. */
    aim: function (i) {
      var n = liveCount();
      angle = (((i % n) + n) % n + 0.5) / n * TAU;
      passed = 0;
      state.spun = true;
      drawFrame();
      settle();
    },
    spin: flick
  };
})();
