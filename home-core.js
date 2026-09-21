/* home-core.js — the home page's chrome, and nothing else.
   ---------------------------------------------------------------------------
   This file replaced two scripts that existed to mount tools *inside* the home
   page (home-app.js, 195 KB, and home-features.js, 42 KB, loaded on demand).
   Between them they built a virtualised grid of 1,205 live tools: warming,
   parking, memory budgets, scroll-anchor holding, a mount window and a
   standalone modal. It worked, and it was the source of every "the card is
   half-drawn", "nothing happened when I clicked" and "this page eats my
   phone's memory" report the site had.

   The decision (2026-09-21): the home page does not run tools. It lists them,
   and a tool opens on its own page with its own document. That made ~235 KB of
   script, a background catalogue fetch and the whole live-window apparatus
   unnecessary.

   What is left is genuinely page chrome:
     - theme + accent colours, remembered between visits
     - the sticky command bar showing on scroll
     - the search box handing its query to the list engine (explore.js)
     - the contributions panel's close button and its sponsor details toggle
     - deep links (?card=, #card=) forwarded to the tool's own page, so every
       link ever shared still lands somewhere real
     - service worker registration (offline first-visit caching)
   The list itself — filtering, sorting, facets, rows, the toolbox — lives in
   explore.js and toolbox.js, which every list page shares.
*/
(function () {
  'use strict';

  // The page's asset version. scripts/check-critical-css.py compares this with
  // index.html's ?v= and sw.js's CACHE_VERSION: a page must never run against
  // another deploy's script, and the service worker's precache list carries the
  // same number.
  const APP_VERSION = 16;

  var THEMES = {
    'default': { bg1: '#0a0f14', bg2: '#141e28' },
    'deep-blue': { bg1: '#05080c', bg2: '#0f151f' },
    'deep-purple': { bg1: '#12081a', bg2: '#1f1229' },
    'deep-teal': { bg1: '#061616', bg2: '#0f2525' },
    'deep-red': { bg1: '#160606', bg2: '#251010' },
    'deep-forest': { bg1: '#081408', bg2: '#152015' },
    'deep-space': { bg1: '#000814', bg2: '#1a1a2e' }
  };

  function notify(msg) {
    if (window.mpToolbox && window.mpToolbox.toast) window.mpToolbox.toast(msg);
  }

  /* ------------------------------------------------- themes and accent ---- */
  function withTransition(fn) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduced) {
      try { document.startViewTransition(fn); return; } catch (e) {}
    }
    fn();
  }

  function applyTheme(name) {
    var theme = THEMES[name] || THEMES['default'];
    document.body.style.background = 'linear-gradient(135deg, ' + theme.bg1 + ', ' + theme.bg2 + ')';
    try { localStorage.setItem('theme', name); } catch (e) {}
  }

  function hueOf(hex) {
    try {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0;
      if (max !== min) {
        var d = max - min;
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return h;
    } catch (e) { return 190; }
  }

  function setupTheme() {
    var savedAccent = '#2dd4ff';
    var savedTheme = 'default';
    try {
      savedAccent = localStorage.getItem('accent') || savedAccent;
      savedTheme = localStorage.getItem('theme') || savedTheme;
    } catch (e) {}
    document.documentElement.style.setProperty('--accent', savedAccent);
    document.documentElement.style.setProperty('--accent-hue', String(hueOf(savedAccent)));
    applyTheme(savedTheme);

    document.querySelectorAll('.palette-color').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.accent === savedAccent);
      btn.addEventListener('click', function () {
        var color = btn.dataset.accent;
        withTransition(function () {
          document.querySelectorAll('.palette-color').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          document.documentElement.style.setProperty('--accent', color);
          document.documentElement.style.setProperty('--accent-hue', String(hueOf(color)));
          try { localStorage.setItem('accent', color); } catch (e) {}
        });
        notify('Accent colour changed');
      });
    });

    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === savedTheme);
      btn.addEventListener('click', function () {
        var name = btn.dataset.theme;
        withTransition(function () {
          document.querySelectorAll('.theme-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          applyTheme(name);
        });
        notify('Theme: ' + name.replace('deep-', '').replace('-', ' '));
      });
    });
  }

  /* ------------------------------------------------------ sticky command bar */
  function setupStickyBar() {
    var bar = document.getElementById('stickyCommandBar');
    if (!bar) return;
    var onScroll = function () {
      var show = window.scrollY > 220;
      bar.classList.toggle('visible', show);
      bar.setAttribute('aria-hidden', String(!show));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------------------- search */
  // The hero box and the sticky box are the same search. explore.js owns the
  // results; this hands over the keystrokes and, on a page without the engine,
  // forwards to the full index rather than appearing to filter nothing.
  function setupSearch() {
    var boxes = ['tool-search', 'stickySearchInput'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var clearBtn = document.getElementById('mainSearchClear');
    if (!boxes.length) return;

    var apply = function (value, scroll) {
      if (window.mpExplore) {
        if (scroll) window.mpExplore.filter(value);
        else {
          var input = document.getElementById('xp-input');
          if (input) { input.value = value; window.mpExplore.filter(value); }
          else window.mpExplore.filter(value);
        }
      } else {
        // No engine (script blocked): the honest answer is the plain index,
        // pre-filtered by nothing — never a filter that silently does nothing.
        var dir = 'tools.html';
        if (value) location.href = dir + '?q=' + encodeURIComponent(value);
      }
      if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    };

    boxes.forEach(function (box) {
      box.addEventListener('input', function () {
        var value = box.value;
        boxes.forEach(function (other) { if (other !== box && other.value !== value) other.value = value; });
        if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
        clearTimeout(box._mpTimer);
        box._mpTimer = setTimeout(function () { apply(value, false); }, 120);
      });
      box.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var value = box.value.trim();
        if (!value) return;
        // Enter on a single unambiguous match goes straight to the tool; that is
        // the whole point of a launcher.
        if (window.mpExplore) {
          var rows = window.mpExplore.rows();
          if (rows.length === 1) { location.href = rows[0].url; return; }
          if (rows.length && rows.length <= 8) {
            window.mpExplore.filter(value);
            notify(rows.length + ' matches — press j then Enter, or pick a row');
            return;
          }
        }
        window.mpExplore ? window.mpExplore.filter(value) : apply(value, true);
      });
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      boxes.forEach(function (b) { b.value = ''; });
      if (window.mpExplore) window.mpExplore.clear();
      clearBtn.style.display = 'none';
      boxes[0].focus();
    });
  }

  /* --------------------------------------------------------------- panels */
  function setupPanels() {
    var close = document.getElementById('contributionsClose');
    if (close) close.addEventListener('click', function () {
      var panel = document.getElementById('contributionsPanel');
      if (panel && typeof panel.hidePopover === 'function') { try { panel.hidePopover(); } catch (e) {} }
      else if (panel) { panel.style.display = 'none'; panel.setAttribute('aria-hidden', 'true'); }
    });

    // The £1,000 sponsor-a-tool card expands in place; it is one of the two
    // real revenue paths the site has, so it must never be a dead click.
    var premium = document.getElementById('premiumSponsorship');
    var details = document.getElementById('premiumDetails');
    if (premium && details) {
      premium.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var open = details.style.display !== 'block';
        details.style.display = open ? 'block' : 'none';
        premium.setAttribute('aria-expanded', String(open));
        if (open && typeof window.gtag === 'function') window.gtag('event', 'sponsor_card_open', {});
      });
      premium.setAttribute('role', 'button');
      premium.setAttribute('tabindex', '0');
      premium.setAttribute('aria-expanded', 'false');
      premium.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); premium.click(); }
      });
    }

    // A gift opener on a page nobody donates from is decoration; counting the
    // clicks is how the donate copy gets better instead of being rewritten on
    // instinct.
    document.querySelectorAll('a[href*="donate.html"], a[href*="paypal.me"]').forEach(function (a) {
      a.addEventListener('click', function () {
        if (typeof window.gtag === 'function') window.gtag('event', 'donate_click', { from: location.pathname });
      });
    });
    document.querySelectorAll('a[href*="sponsor.html"]').forEach(function (a) {
      a.addEventListener('click', function () {
        if (typeof window.gtag === 'function') window.gtag('event', 'sponsor_click', { from: location.pathname });
      });
    });
  }

  /* ----------------------------------------------------------- deep links */
  // Every share link ever posted points at the home page's old live view:
  // ?card=slug, ?t=slug or #card=slug. They still have to work, so they are
  // forwarded to the tool's own page, query and hash intact.
  function forwardDeepLinks() {
    var params = new URLSearchParams(location.search);
    var slug = params.get('card') || params.get('t') || (/^#card=/.test(location.hash) ? location.hash.slice(6) : '');
    if (!slug) return false;
    slug = decodeURIComponent(slug).replace(/[^a-z0-9-]/gi, '');
    if (!slug) return false;
    location.replace('tool.html?card=' + encodeURIComponent(slug));
    return true;
  }

  /* ------------------------------------------------------- service worker */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    var doRegister = function () {
      navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(doRegister, { timeout: 4000 });
    else window.addEventListener('load', function () { setTimeout(doRegister, 1500); });
  }

  function init() {
    if (forwardDeepLinks()) return;
    setupTheme();
    setupStickyBar();
    setupSearch();
    setupPanels();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
