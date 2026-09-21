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
     - popover accessibility sync + a fallback for browsers without popovers
     - deep links (?card=, #card=) forwarded to the tool's own page, so every
       link ever shared still lands somewhere real
     - the manifest's installed-app entries (?toolbox=open, ?action=search,
       the share target) doing what they promised
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
  const APP_VERSION = 19;

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
    // localStorage is user-writable: a tampered value must fall back to the
    // default, not break the accent site-wide (or feed hueOf() a NaN).
    if (!/^#[0-9a-fA-F]{6}$/.test(savedAccent)) savedAccent = '#2dd4ff';
    document.documentElement.style.setProperty('--accent', savedAccent);
    document.documentElement.style.setProperty('--accent-hue', String(hueOf(savedAccent)));
    applyTheme(savedTheme);

    document.querySelectorAll('.palette-color').forEach(function (btn) {
      var isActive = btn.dataset.accent === savedAccent;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
      btn.addEventListener('click', function () {
        var color = btn.dataset.accent;
        withTransition(function () {
          document.querySelectorAll('.palette-color').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
          document.documentElement.style.setProperty('--accent', color);
          document.documentElement.style.setProperty('--accent-hue', String(hueOf(color)));
          try { localStorage.setItem('accent', color); } catch (e) {}
        });
        notify('Accent colour changed');
      });
    });

    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      var isActive = btn.dataset.theme === savedTheme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
      btn.addEventListener('click', function () {
        var name = btn.dataset.theme;
        withTransition(function () {
          document.querySelectorAll('.theme-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
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

    // Typing filters quietly: scrolling the page to the list on every keystroke
    // yanks the hero box out from under the visitor mid-word. Only an explicit
    // Enter (or a prefilled/shared query) scrolls to the results.
    var apply = function (value, scroll) {
      if (window.mpExplore) {
        window.mpExplore.filter(value, { quiet: !scroll });
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
        // the whole point of a launcher. Filter first: rows() reflects the
        // last debounced keystroke, not what was just typed.
        if (window.mpExplore) {
          window.mpExplore.filter(value);
          var rows = window.mpExplore.rows();
          if (rows.length === 1) { location.href = rows[0].url; return; }
          // j/k navigation only works outside a text box, so with matches on
          // screen, hand focus over instead of telling the visitor to press a
          // key that would just type into this box. With no matches, stay put
          // so they can keep typing.
          if (rows.length > 1) {
            box.blur();
            if (rows.length <= 8) notify(rows.length + ' matches below — j/k to move, Enter to open');
          }
          return;
        }
        apply(value, true);
      });
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      boxes.forEach(function (b) { b.value = ''; });
      if (window.mpExplore) window.mpExplore.clear();
      clearBtn.style.display = 'none';
      boxes[0].focus();
    });
  }

  /* ------------------------------------------------------ popular chips */
  // The hero's \"Popular: BMI, Loan, ...\" shortcuts look like buttons and are
  // buttons — but until now they had no handler at all, so clicking one did
  // nothing. A chip sets the search filter exactly as if the visitor had
  // typed that word and pressed Enter; the list engine (explore.js) still owns
  // the results, so this delegates there and only updates the two search boxes
  // that already exist on the page.
  function setupPopularChips() {
    var chips = document.querySelectorAll('.popular-chip');
    if (!chips.length) return;
    var boxes = ['tool-search', 'stickySearchInput'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var clearBtn = document.getElementById('mainSearchClear');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var q = chip.getAttribute('data-query') || chip.textContent.trim();
        if (!q) return;
        boxes.forEach(function (b) { b.value = q; });
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
        if (window.mpExplore) {
          window.mpExplore.filter(q);
          // The chip lives in the hero, above the browse chrome. After a
          // filter the browse section hides itself (syncOtherInputs), but the
          // viewport is still at the top — bring the results into view.
          var section = document.getElementById('all-tools-section');
          if (section && typeof section.scrollIntoView === 'function') {
            try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { try { section.scrollIntoView(); } catch (e2) {} }
          }
          if (typeof window.gtag === 'function') window.gtag('event', 'popular_chip', { query: q });
        } else {
          // No engine (script blocked or still loading): the honest answer is
          // the full index, pre-filtered by the query, rather than a filter
          // that silently does nothing.
          location.href = 'tools.html?q=' + encodeURIComponent(q);
        }
      });
    });
  }

  /* ------------------------------------------- popovers: a11y sync + fallback */
  // A native popover never touches aria-hidden itself: without this listener,
  // a screen reader is told every panel is hidden even while it is open.
  function syncPopoverA11y() {
    ['toolbox', 'palettePanel', 'contributionsPanel'].forEach(function (id) {
      var panel = document.getElementById(id);
      if (!panel || typeof panel.showPopover !== 'function' || !panel.hasAttribute('popover')) return;
      panel.addEventListener('toggle', function () {
        var open = false;
        try { open = panel.matches(':popover-open'); } catch (e) { open = false; }
        panel.setAttribute('aria-hidden', String(!open));
      });
    });
  }

  // Browsers without the Popover API (pre-2024) ignore popover/popoverTarget
  // entirely, which would leave the toolbox, palette and support panels with
  // no way to open at all. The fallback replays the .open-class mechanism the
  // stylesheets kept for exactly this (see home.css's note).
  function popoverFallback() {
    var supported = typeof HTMLElement !== 'undefined' && HTMLElement.prototype &&
      typeof HTMLElement.prototype.showPopover === 'function';
    if (supported) return;
    var panels = document.querySelectorAll('[data-popover-fallback]');
    panels.forEach(function (panel) {
      panel.removeAttribute('popover');
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    });
    var closeAll = function (except) {
      panels.forEach(function (panel) {
        if (panel === except || !panel.classList.contains('open')) return;
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
      });
    };
    document.querySelectorAll('[popovertarget]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = document.getElementById(btn.getAttribute('popovertarget'));
        if (!panel) return;
        var willOpen = !panel.classList.contains('open');
        closeAll(panel);
        panel.classList.toggle('open', willOpen);
        panel.setAttribute('aria-hidden', String(!willOpen));
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });
  }

  /* --------------------------------------------------------------- panels */
  function setupPanels() {
    var close = document.getElementById('contributionsClose');
    if (close) close.addEventListener('click', function () {
      var panel = document.getElementById('contributionsPanel');
      if (panel && typeof panel.hidePopover === 'function' && panel.hasAttribute('popover')) { try { panel.hidePopover(); } catch (e) {} }
      else if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }
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
  // ?card=slug, ?t=slug, ?tool=slug (the PWA protocol handler) or #card=slug.
  // They still have to work, so the slug alone is forwarded to the tool's own
  // page; anything else in the URL belongs to this page, not the tool.
  function forwardDeepLinks() {
    var params = new URLSearchParams(location.search);
    var raw = params.get('card') || params.get('t') || params.get('tool') ||
      (/^#card=/.test(location.hash) ? location.hash.slice(6) : '');
    if (!raw) return false;
    // A protocol-handler value is a whole URL (web+useful:slug); a plain slug
    // has no separators, so taking the last segment is a no-op for it.
    var slug = decodeURIComponent(String(raw)).split(/[:/?#]/).pop().replace(/[^a-z0-9-]/gi, '');
    if (!slug) return false;
    location.replace('tool.html?card=' + encodeURIComponent(slug));
    return true;
  }

  /* ------------------------------------------------------- installed-app entry */
  // The manifest lands three shortcuts and a share target here. Each must do
  // what it promised: open the toolbox, focus the search, or prefill it with
  // the shared text — never a landing that silently ignores why it was opened.
  function handleAppEntry() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    if (params.get('toolbox') === 'open') {
      if (window.mpToolbox) window.mpToolbox.open();
      return;
    }
    if (params.get('action') === 'search') {
      var box = document.getElementById('tool-search');
      if (box) box.focus();
    }
    var shared = params.get('text') || params.get('title') || params.get('url');
    if (shared) {
      var hero = document.getElementById('tool-search');
      var sticky = document.getElementById('stickySearchInput');
      if (hero) hero.value = shared;
      if (sticky) sticky.value = shared;
      var clear = document.getElementById('mainSearchClear');
      if (clear) clear.style.display = 'block';
      if (window.mpExplore) window.mpExplore.filter(shared);
    }
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
    setupPopularChips();
    setupPanels();
    syncPopoverA11y();
    popoverFallback();
    handleAppEntry();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
