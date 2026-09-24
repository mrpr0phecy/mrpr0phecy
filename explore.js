/* explore.js — the list-view engine.
   ---------------------------------------------------------------------------
   Every list of tools on this site is now this component, so a visitor who
   learns it once has learned it on all 30+ pages that show tools.

   Two modes, one row component:

   1. `data-explore="json"`   — the home page. Renders the rows from
      `tools-index.json`: filter box, category facets, sort, density, "show
      more", keyboard navigation. The catalogue is only in the DOM as far as
      the visitor has asked for it, which is why the homepage now opens in one
      paint instead of mounting 1,298 tools.

   2. `data-explore="static"` — tools.html and the 28 category pages. The rows
      are already real links in the served HTML (crawlers and no-JS visitors
      get everything); this adds the toolbar, the ＋ buttons and the expandable
      description on top. Nothing is fetched and nothing is re-rendered, so the
      enhancement costs nothing on pages that already have their rows.

   What it deliberately does NOT do: run a tool. A list row opens a tool on its
   own page, where it has the whole viewport and a fresh document. That is the
   single change that removed "the tool looks broken / the card is half-drawn /
   nothing happened when I clicked" from the home page for good.

   Public API: window.mpExplore.filter(q) / setCategory(name) / focusInput() /
   clear() / rows() / state
*/
(function () {
  'use strict';

  var PAGE_SIZE = 60;
  // The catalogue fetch is allowed this long for headers AND body: a download
  // that stalls — the headers arrive, the body never follows — must surface
  // the error UI, not "Searching the catalogue…" forever. The worker bounds
  // the headers at UNCACHED_PATIENCE_MS and fails fast; this covers a body
  // that stops arriving after them (and any browser the worker does not
  // control yet). Generous on purpose: the file is ~1 MB and a slow radio
  // link still gets its chance; past it, the list offers a retry.
  var CATALOGUE_TIMEOUT_MS = 12000;
  var SORTS = {
    az: 'A–Z',
    za: 'Z–A',
    popular: 'Most used',
    newest: 'Recently updated',
    category: 'By category'
  };

  var state = {
    q: '',
    cat: '',
    sort: 'az',
    shown: PAGE_SIZE,
    rows: [],
    current: -1,
    mode: null
  };

  var els = {};          // container, bar, list, facets, more, count
  var categoryCounts = [];
  // JSON pages are not ready until tools-index.json lands. Static pages are.
  var catalogueReady = true;
  var queuedQuery = null;
  var ensureCatalogue = function () {};
  var paintKey = '';
  var paintCount = -1;
  var facetStamp = null;

  /* ------------------------------------------------------------ utilities */
  // en-GB digit grouping without Intl: the first toLocaleString() call loads
  // ICU locale data, measured at ~100 ms of main thread on a throttled phone
  // right as the list mounts. Counts here are small non-negative integers.
  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

  /* Nearly every tool title starts with a decorative emoji ("⚖️ Axle Weight…",
     "🎂 Exact Age…"). Sorting the raw string puts every emoji before every
     letter, so an A–Z list opened with a block of symbols and looked random.
     The sort key drops the leading decoration — and only the leading one: an
     emoji in the middle of a title is part of the title. */
  function sortTitle(title) {
    var raw = String(title == null ? '' : title);
    // Cached: a comparator calls this ~2n·log n times per sort — about 22,000
    // calls over the 1,285-row catalogue — and it is the same 1,285 strings
    // every time. Clearing at the cap keeps a pathological title from pinning
    // memory for the life of the page.
    var cache = sortTitle.cache || (sortTitle.cache = new Map());
    var hit = cache.get(raw);
    if (hit !== undefined) return hit;
    var stripped = raw.replace(/^[^\p{L}\p{N}]+/u, '') || raw;
    if (cache.size > 4000) cache.clear();
    cache.set(raw, stripped);
    return stripped;
  }
  function byTitle(a, b, dir) {
    // One Collator for the page, not one per comparison: `a.localeCompare(b,
    // 'en', …)` builds a collator, a locale list and an options object on every
    // single call. Measured on the real catalogue, that was 57 ms of the ~1 s
    // the list took to appear on a 4x-throttled phone; a cached Collator is
    // 19 ms and sorts identically. The localeCompare path stays for engines
    // without Intl.Collator.
    var col = byTitle.collator || (byTitle.collator = (typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator('en', { sensitivity: 'base', numeric: true }) : null));
    var c = col ? col.compare(sortTitle(a), sortTitle(b))
      : sortTitle(a).localeCompare(sortTitle(b), 'en', { sensitivity: 'base', numeric: true });
    return dir === 'za' ? -c : c;
  }
  function isTyping(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* --------------------------------------------------------- sticky chrome --
     The toolbar parks directly under whatever sticky chrome the host page puts
     above it: the home page's command bar, tools.html's topbar, the category
     pages' topbar. Every host page used to hard-code that offset in its own
     stylesheet (60 px, 52 px, 72 px, 8 px — four numbers, three of them wrong
     at some width, and the category toolbar sat *under* its own topbar on a
     phone). This measures the real thing instead and republishes it as
     `--xp-sticky-h`, which explore.css's `.xp-bar` consumes.

     Recomputed on scroll (rAF-throttled) and on resize, because a sticky
     element that has slid off-screen is not chrome: while the home page's
     command bar is hidden the toolbar sits at the very top of the viewport,
     and while it is showing it sits below it. */
  function measureStickyOffset() {
    var h = 0;
    var candidates = document.querySelectorAll('.topbar, .toc, [data-xp-sticky], #stickyCommandBar');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.classList.contains('xp-bar')) continue;
      var cs;
      try { cs = window.getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // The home command bar slides in with a transform. Measuring its box
      // mid-animation reports a height of nothing and parks the list toolbar
      // under the bar. Its layout height does not move with the transform.
      if (el.id === 'stickyCommandBar') {
        if (!el.classList.contains('visible')) continue;
        if (el.offsetHeight > h) h = el.offsetHeight;
        continue;
      }
      var r = el.getBoundingClientRect();
      // Pinned near the top edge, actually painted, and not one of the
      // bottom-anchored floating buttons — those live at the other end.
      if (r.height < 8 || r.bottom <= 2 || r.top > 160) continue;
      if (r.bottom > h) h = r.bottom;
    }
    document.documentElement.style.setProperty('--xp-sticky-h', Math.round(h) + 'px');
  }

  /* ---------------------------------------------------- scroll affordance --
     The facet row is the one control on the site that is wider than the screen
     at every size — 1,298 tools over 29 categories, in a strip that scrolls
     sideways. A row that just ends at the right edge reads as "that is all of
     them". So the row publishes where it is in its own scroll (data-overflow =
     start | middle | end) and the stylesheet fades whichever edge still has
     something behind it. Measured, not guessed: at the far right the fade
     disappears instead of hiding the last chip forever.

     The home page's popular-search chips are the same component in spirit
     (a shortcut row that scrolls on a phone), so they are picked up here too
     rather than duplicating the listener in a second file. */
  function markOverflow(el) {
    var max = el.scrollWidth - el.clientWidth;
    if (max <= 2) { el.removeAttribute('data-overflow'); return; }
    var x = el.scrollLeft;
    el.setAttribute('data-overflow', x <= 2 ? 'start' : (x >= max - 2 ? 'end' : 'middle'));
  }

  var FADE_ROWS = '[data-xp-facets], .xp-facets, .popular-chips, .toc-inner, nav.toc, .hero-jumps, #featured, #trending';

  /* The floating toolbox button sits over the end of the page. On a phone it
     lands exactly on the footer's last links once you scroll to the bottom, so
     the page gets clearance under its content — but only the pages that
     actually carry the button, which is why this is a class on the document
     rather than padding in one stylesheet. Cheap to re-check, so it rides
     along with the same "what does the page look like now" pass. */
  function markFloatingClearance() {
    document.documentElement.classList.toggle('xp-has-float', !!document.querySelector('.xp-tb-float'));
  }

  /* Coalesced into one animation frame. Reading scrollWidth straight after a
     toolbar or facet rebuild forced a synchronous layout of the whole list
     mid-task (the largest self-time in a throttled load profile); in rAF the
     read reuses the layout the frame performs anyway. The fade is cosmetic,
     so one frame late is invisible. */
  var fadeQueued = false;
  function scheduleOverflowFades() {
    if (fadeQueued) return;
    fadeQueued = true;
    requestAnimationFrame(function () { fadeQueued = false; syncOverflowFades(); });
  }

  function syncOverflowFades() {
    markFloatingClearance();
    var rows = document.querySelectorAll(FADE_ROWS);
    for (var i = 0; i < rows.length; i++) markOverflow(rows[i]);
  }

  function watchOverflowFades() {
    scheduleOverflowFades();
    // One capturing listener on the document, not one per row. Scroll events
    // do not bubble, but a capture-phase listener still receives them from
    // every scroller under the document — including the rows that do not exist
    // yet. The first version bound directly to the elements it found at mount,
    // and the list toolbar rebuilds its facet row as soon as the catalogue
    // arrives, so from that moment the fade was frozen at "start" (measured,
    // then fixed).
    document.addEventListener('scroll', function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1 || !el.matches(FADE_ROWS)) return;
      if (el.__xpFadeQueued) return;
      el.__xpFadeQueued = true;
      requestAnimationFrame(function () { el.__xpFadeQueued = false; markOverflow(el); });
    }, true);
    window.addEventListener('resize', function () {
      if (window.__xpFadeResizeQueued) return;
      window.__xpFadeResizeQueued = true;
      requestAnimationFrame(function () { window.__xpFadeResizeQueued = false; syncOverflowFades(); });
    }, { passive: true });
  }

  function watchStickyOffset() {
    /* Measuring chrome on every scroll frame forced layout for the whole
       scroll. The offset only changes when the command bar shows or hides,
       or when the viewport changes size — so the scroll path is a class
       check, and getBoundingClientRect runs only when that signature moves. */
    var queued = false;
    var sig = '';
    var schedule = function (force) {
      if (queued && !force) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var bar = document.getElementById('stickyCommandBar');
        var next = (bar && bar.classList.contains('visible') ? '1' : '0') +
          '|' + window.innerWidth + '|' + window.innerHeight;
        if (!force && next === sig) return;
        sig = next;
        measureStickyOffset();
      });
    };
    window.addEventListener('scroll', function () { schedule(false); }, { passive: true });
    window.addEventListener('resize', function () { schedule(true); }, { passive: true });
    schedule(true);
    watchOverflowFades();
    return schedule;
  }

  /* -------------------------------------------------- instrumentation -----
     Same local, capped buffers the site has always used (docs/
     INSTRUMENTATION.md, `__mp_` keys reserved for exactly this). A search that
     returns nothing is the most valuable signal on the page: it says which
     tool does not exist yet. */
  function logSearch(q, count) {
    if (!q) return;
    try {
      var map = JSON.parse(localStorage.getItem('__mp_zero_searches') || '{}');
      if (!count) {
        var key = q.slice(0, 60);
        map[key] = map[key] || { c: 0, last: '' };
        map[key].c++;
        map[key].last = new Date().toISOString().slice(0, 10);
        var keys = Object.keys(map);
        if (keys.length > 200) {
          keys.sort(function (a, b) { return (map[a].c || 0) - (map[b].c || 0); });
          delete map[keys[0]];
        }
        localStorage.setItem('__mp_zero_searches', JSON.stringify(map));
      }
      localStorage.setItem('__mp_searches_last', JSON.stringify({ q: q.slice(0, 60), n: count, at: new Date().toISOString().slice(0, 10) }));
    } catch (e) { /* private mode */ }
  }
  function logToolView(slug, category) {
    try {
      var map = JSON.parse(localStorage.getItem('__mp_tool_views') || '{}');
      map[slug] = (map[slug] || 0) + 1;
      var keys = Object.keys(map);
      if (keys.length > 400) {
        keys.sort(function (a, b) { return map[a] - map[b]; });
        delete map[keys[0]];
      }
      localStorage.setItem('__mp_tool_views', JSON.stringify(map));
      if (typeof window.gtag === 'function') window.gtag('event', 'tool_open', { slug: slug, category: category || '' });
    } catch (e) {}
  }

  /* ------------------------------------------------------------ row model */
  function rowFromTool(t) {
    var row = {
      slug: t.slug,
      title: t.title,
      desc: t.description || '',
      cat: t.category || '',
      catName: t.categoryName || t.category || '',
      tags: t.tags || [],
      pop: t.popularity || 0,
      updated: t.updated || '',
      featured: !!t.featured,
      url: t.url || ('tool.html?card=' + encodeURIComponent(t.slug))
    };
    row._hay = norm(row.title + ' ' + row.desc + ' ' + row.catName + ' ' + row.tags.join(' ') + ' ' + row.slug);
    return row;
  }

  function rowFromElement(el, catName) {
    var a = el.querySelector('a[href]');
    if (!a) return null;
    var slug = el.getAttribute('data-slug') || '';
    if (!slug) {
      var m = /[?&](?:card|t)=([^&#]+)/.exec(a.getAttribute('href') || '');
      if (m) slug = decodeURIComponent(m[1]);
    }
    if (!slug) return null;
    var titleEl = el.querySelector('.ti-title, .xp-title, .tool-card-title');
    var descEl = el.querySelector('.ti-desc, .xp-desc, .tool-card-desc');
    var tags = [];
    el.querySelectorAll('.tag, .xp-tag').forEach(function (tagEl) {
      tags.push(tagEl.textContent.replace(/^#/, '').trim());
    });
    var group = el.closest ? el.closest('[data-xp-group]') : null;
    return {
      slug: slug,
      title: (titleEl ? titleEl.textContent : a.textContent).trim(),
      desc: descEl ? descEl.textContent.trim() : '',
      cat: el.getAttribute('data-cat') || '',
      catName: el.getAttribute('data-cat-name') ||
        (group ? group.getAttribute('data-xp-group') : '') || catName || '',
      tags: tags,
      pop: parseInt(el.getAttribute('data-pop') || '0', 10) || 0,
      updated: el.getAttribute('data-updated') || '',
      featured: el.getAttribute('data-featured') === '1',
      url: a.getAttribute('href')
    };
  }

  /* ------------------------------------------------------------ filtering */
  function matches(row, q) {
    if (!q) return true;
    // Every word has to appear somewhere: "truck weight" should not return
    // every trucking tool plus every weight tool. _hay is filled once when the
    // catalogue arrives; fixtures and static rows still build it here.
    var hay = row._hay || norm(row.title + ' ' + row.desc + ' ' + row.catName + ' ' + row.tags.join(' ') + ' ' + row.slug);
    var words = q.split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
    return true;
  }

  function sorted(list) {
    var out = list.slice();
    if (state.sort === 'az') out.sort(function (a, b) { return byTitle(a.title, b.title); });
    else if (state.sort === 'za') out.sort(function (a, b) { return byTitle(a.title, b.title, 'za'); });
    else if (state.sort === 'popular') out.sort(function (a, b) { return (b.pop - a.pop) || byTitle(a.title, b.title); });
    else if (state.sort === 'newest') out.sort(function (a, b) { return String(b.updated).localeCompare(String(a.updated)) || byTitle(a.title, b.title); });
    else if (state.sort === 'category') out.sort(function (a, b) { return (a.catName || '').localeCompare(b.catName || '') || byTitle(a.title, b.title); });
    return out;
  }

  function visible() {
    var q = norm(state.q).trim();
    return sorted(state.rows.filter(function (r) {
      if (state.cat && r.catName !== state.cat) return false;
      return matches(r, q);
    }));
  }

  /* -------------------------------------------------------------- toolbar */
  function toolbarHTML() {
    var sorts = state.mode === 'json' ? ['az', 'za', 'popular', 'newest', 'category'] : ['az', 'za'];
    var catOptions = '<option value="">All categories</option>' + categoryCounts.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.name) + ' (' + c.count + ')</option>';
    }).join('');
    /* One toolbar, three groups: what you are looking for (search), which slice
       of the catalogue you are looking at (category, sort, density), and what
       the list is telling you (count, toolbox). It used to be a single
       flex-wrap line of nine controls, which on a 320 px phone became 238 px
       of the first screen — five rows before the first tool. */
    return '' +
      '<div class="xp-bar-top">' +
      '<div class="xp-field">' +
      '<input id="xp-input" type="search" autocomplete="off" placeholder="Filter ' + fmt(state.rows.length) + ' tools…" aria-label="Filter tools" enterkeyhint="search" />' +
      '<button type="button" class="xp-clear" data-xp-clear aria-label="Clear filter">✕</button>' +
      '</div>' +
      '<div class="xp-tools">' +
      (state.mode === 'json'
        ? '<select class="xp-select" id="xp-cat" aria-label="Category">' + catOptions + '</select>'
        : '') +
      '<select class="xp-select" id="xp-sort" aria-label="Sort">' + sorts.map(function (k) {
        return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' + SORTS[k] + '</option>';
      }).join('') + '</select>' +
      '<div class="xp-density" role="group" aria-label="Row density">' +
      '<button type="button" class="xp-btn" data-xp-density="comfortable" aria-pressed="false" title="Comfortable rows">Comfortable</button>' +
      '<button type="button" class="xp-btn" data-xp-density="compact" aria-pressed="false" title="Compact rows">Compact</button>' +
      '</div>' +
      '<button type="button" class="xp-btn xp-gold" data-tb-open title="Open your toolbox (t)" aria-label="Open your toolbox">🧰<span class="tb-badge" data-toolbox-count></span></button>' +
      '</div>' +
      '<span class="xp-count" id="xp-count" role="status" aria-live="polite" aria-atomic="true"></span>' +
      '</div>' +
      (state.mode === 'json'
        ? '<div class="xp-facets" role="group" aria-label="Filter by category" data-xp-facets></div>'
        : '') +
      '<p class="xp-hint">Keyboard: <kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>x</kbd> details · <kbd>b</kbd> add to toolbox · <kbd>Enter</kbd> open · <kbd>t</kbd> toolbox</p>';
  }

  /* The category chips live *inside* the sticky bar, so a visitor scrolling
     through 1,206 rows can still narrow them without scrolling back to the
     top. (`[data-xp-facets]` is created by toolbarHTML for the JSON mode; the
     static pages have a category of their own and no chips.) */
  function facetHTML() {
    if (state.mode !== 'json' || categoryCounts.length < 2) return '';
    var html = '<button type="button" class="xp-facet" data-xp-cat="" aria-pressed="' + (!state.cat) + '">All <span class="xp-facet-n">' + state.rows.length + '</span></button>';
    var top = categoryCounts.slice().sort(function (a, b) { return b.count - a.count; });
    top.forEach(function (c) {
      html += '<button type="button" class="xp-facet" data-xp-cat="' + esc(c.name) + '" aria-pressed="' + (state.cat === c.name) + '">' +
        esc(c.name) + ' <span class="xp-facet-n">' + c.count + '</span></button>';
    });
    return html;
  }

  /* ---------------------------------------------------------------- rows */
  function rowHTML(row, i) {
    var inBox = window.mpToolbox ? window.mpToolbox.has(row.slug) : false;
    var tags = row.tags.slice(0, 4).map(function (t) { return '<span class="xp-tag">#' + esc(t) + '</span>'; }).join(' ');
    return '<li class="xp-row" data-slug="' + esc(row.slug) + '" data-index="' + i + '" data-cat="' + esc(row.catName) + '">' +
      '<a class="xp-open" href="' + esc(row.url) + '" data-xp-open title="' + esc(row.title) + '">' +
      '<span class="xp-title">' + esc(row.title) + '</span>' +
      '<span class="xp-cat">' + esc(row.catName) + '</span>' +
      '</a>' +
      '<div class="xp-actions">' +
      '<button type="button" class="xp-icon" data-xp-details aria-expanded="false" title="Description and details" aria-label="Show details for ' + esc(row.title) + '">▸</button>' +
      '<button type="button" class="xp-icon' + (inBox ? ' xp-in' : '') + '" data-toolbox-add="' + esc(row.slug) + '" aria-pressed="' + inBox + '" title="Add to my toolbox" aria-label="Add ' + esc(row.title) + ' to your toolbox">＋</button>' +
      '</div>' +
      '<p class="xp-desc">' + esc(row.desc) +
      '<span class="xp-meta">' + (row.updated ? '<span>updated ' + esc(row.updated) + '</span>' : '') + tags +
      ' <a href="' + esc(row.url) + '" style="color:var(--xp-accent,#2dd4ff);">Open ' + esc(row.title) + ' →</a>' +
      '</span></p>' +
      '</li>';
  }

  function render(opts) {
    var list = visible();
    if (state.mode !== 'json' && state.staticRows) return renderStatic(list);
    var shown = Math.min(state.shown, list.length);
    var key = state.sort + '\n' + state.cat + '\n' + norm(state.q).trim();
    var append = !!(opts && opts.append && key === paintKey && shown > paintCount &&
      els.list && els.list.querySelector('.xp-row[data-slug]'));
    if (append) {
      var extra = '';
      for (var j = paintCount; j < shown; j++) extra += rowHTML(list[j], j);
      if (extra) els.list.insertAdjacentHTML('beforeend', extra);
    } else if (!(key === paintKey && shown === paintCount && els.list && els.list.children.length)) {
      var html = '';
      for (var i = 0; i < shown; i++) html += rowHTML(list[i], i);
      els.list.innerHTML = html || '<li class="xp-row"><div class="xp-empty">' +
        '<strong>Nothing matches that.</strong><br>Try a shorter word — “calculator”, “converter”, “planner” — or ' +
        '<a href="tools-index.html" style="color:var(--xp-accent,#2dd4ff);">browse the plain directory</a>.' +
        '</div></li>';
      state.current = -1;
    }
    paintKey = key;
    paintCount = shown;
    els.list.setAttribute('data-xp-total', String(list.length));

    if (els.count) {
      els.count.innerHTML = list.length === state.rows.length
        ? '<strong>' + fmt(state.rows.length) + '</strong> tools'
        : '<strong>' + fmt(list.length) + '</strong> of ' + fmt(state.rows.length) +
          (state.q ? ' for “' + esc(state.q) + '”' : '');
    }
    if (els.more) {
      var rest = list.length - shown;
      els.more.hidden = rest <= 0;
      els.more.textContent = 'Show ' + Math.min(PAGE_SIZE, rest) + ' more' + (rest > PAGE_SIZE ? ' (' + rest + ' left)' : '');
    }
    if (els.input && els.input.value !== state.q) els.input.value = state.q;
    if (els.field) els.field.classList.toggle('xp-has-value', !!state.q);
    if (els.facets && facetStamp !== state.cat) {
      els.facets.innerHTML = facetHTML();
      facetStamp = state.cat;
      scheduleOverflowFades();
    }
    syncCatSelect();
    syncToolboxButtons();
  }

  /* Static lists keep every row in the DOM (they were in the served HTML to
     begin with) and toggle `hidden` on the ones that do not match. Group
     wrappers — tools.html's one section per category — disappear when none of
     their rows survive, so a filtered page never leaves empty headings behind. */
  function renderStatic(list) {
    /* Static lists hold every row the generator wrote (1,205 links for
       crawlers, for find-in-page, for a broken script), and lay out only as
       many as the visitor has asked for. `display:none` subtrees skip layout,
       so the index paints at the speed of its first screen and still contains
       the whole catalogue.

       The reveal is *per group*, not global: tools.html is one section per
       category with a TOC pointing at those headings, so a global "first 60 by
       title" would leave most categories empty and a handful overflowing.
       Within each category the list is A–Z, which is what the sort control
       says it does. */
    if (state.appliedSort !== state.sort) orderStatic();

    var wanted = {};
    list.forEach(function (r) { wanted[r.slug] = true; });

    var groups = [];
    state.staticRows.forEach(function (item) {
      var groupEl = (item.el.closest && item.el.closest('[data-xp-group]')) || els.container;
      var bucket = null;
      for (var i = 0; i < groups.length; i++) if (groups[i].el === groupEl) bucket = groups[i];
      if (!bucket) { bucket = { el: groupEl, items: [] }; groups.push(bucket); }
      bucket.items.push(item);
    });

    var revealed = 0;
    groups.forEach(function (bucket) {
      var n = 0;
      bucket.items.forEach(function (item) {
        var matching = !!wanted[item.row.slug];
        var show = matching && n < state.shown;
        if (show) { n++; revealed++; }
        item.el.hidden = !show;
        var btn = item.el.querySelector('[data-toolbox-add]');
        if (btn) {
          var inBox = window.mpToolbox ? window.mpToolbox.has(item.row.slug) : false;
          btn.classList.toggle('xp-in', inBox);
          btn.setAttribute('aria-pressed', String(inBox));
        }
      });
      bucket.el.hidden = n === 0;
      bucket.count = n;
    });

    if (els.more) {
      var rest = list.length - revealed;
      els.more.hidden = rest <= 0;
      els.more.textContent = 'Show ' + Math.min(PAGE_SIZE, rest) + ' more' +
        (rest > PAGE_SIZE ? ' (' + rest + ' left)' : '') +
        (groups.length > 1 ? ' in each category' : '');
    }
    if (els.empty) els.empty.hidden = list.length > 0;
    if (els.count) {
      els.count.innerHTML = list.length === state.rows.length
        ? '<strong>' + fmt(state.rows.length) + '</strong> tools' +
          (state.shown < state.rows.length ? ' · showing the first ' + state.shown + ' of each category' : '')
        : '<strong>' + fmt(list.length) + '</strong> of ' + fmt(state.rows.length) +
          (state.q ? ' for “' + esc(state.q) + '”' : '');
    }
    if (els.input && els.input.value !== state.q) els.input.value = state.q;
    if (els.field) els.field.classList.toggle('xp-has-value', !!state.q);
    syncCatSelect();
    state.current = -1;
    syncToolboxButtons();
  }

  /* Static lists sort by re-appending rows inside their own group: the DOM the
     generator wrote stays the DOM the visitor reads unless they ask for
     something else, and grouped lists (tools.html is one section per category,
     with a TOC pointing at those headings) keep their grouping, so the headings
     a visitor clicked to get here never move out from under them. */
  function orderStatic() {
    var buckets = [];
    state.staticRows.forEach(function (item) {
      // Bucket by the row's own list, not its group section: re-appending a
      // row to the section rips the <li> out of its <ul> (invalid HTML, and
      // the list styling breaks with it). Each group's rows share one list,
      // so the grouping the TOC points at is preserved either way.
      var list = item.el.parentNode || els.container;
      var bucket = null;
      for (var i = 0; i < buckets.length; i++) if (buckets[i].list === list) bucket = buckets[i];
      if (!bucket) { bucket = { list: list, items: [] }; buckets.push(bucket); }
      bucket.items.push(item);
    });
    buckets.forEach(function (bucket) {
      bucket.items.sort(function (a, b) { return byTitle(a.row.title, b.row.title, state.sort); });
      bucket.items.forEach(function (item) { bucket.list.appendChild(item.el); });
    });
    state.appliedSort = state.sort;
  }

  function syncToolboxButtons() {
    if (!window.mpToolbox) return;
    els.wrap.querySelectorAll('[data-toolbox-add]').forEach(function (btn) {
      var inBox = window.mpToolbox.has(btn.getAttribute('data-toolbox-add'));
      btn.classList.toggle('xp-in', inBox);
      btn.setAttribute('aria-pressed', String(inBox));
    });
  }

  /* -------------------------------------------------------------- url state */
  var pushState = debounce(function () {
    try {
      var params = new URLSearchParams(location.search);
      ['q', 'cat', 'sort'].forEach(function (k) {
        if (state[k]) params.set(k, state[k]); else params.delete(k);
      });
      var qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch (e) {}
  }, 350);

  function applyFromUrl() {
    try {
      var params = new URLSearchParams(location.search);
      if (params.get('q')) state.q = params.get('q');
      if (params.get('cat')) state.cat = resolveCategory(params.get('cat'));
      if (params.get('sort') && SORTS[params.get('sort')]) state.sort = params.get('sort');
    } catch (e) {}
  }

  /* ------------------------------------------------------------- behaviour */
  function smoothScroll(el, block) {
    if (!el || !el.scrollIntoView) return;
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    try { el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: block || 'start' }); }
    catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
  }

  function setQuery(q, opts) {
    state.q = String(q || '');
    state.shown = PAGE_SIZE;
    if (state.mode === 'json' && !catalogueReady) {
      queuedQuery = state.q;
      syncOtherInputs(state.q);
      if (els.list) {
        els.list.innerHTML = '<li class="xp-row"><div class="xp-empty xp-pending">Searching the catalogue…</div></li>';
      }
      paintKey = '';
      paintCount = -1;
      var pending = ensureCatalogue();
      if (opts && opts.scroll && pending && pending.then) {
        pending.then(function () { if (els.wrap) smoothScroll(els.wrap, 'start'); });
      }
      return pending;
    }
    if (opts && opts.silent !== true) logSearch(state.q.trim(), visible().length);
    render();
    syncOtherInputs(state.q);
    if (opts && opts.scroll) smoothScroll(els.wrap, 'start');
    pushState();
  }

  // Category links from other pages carry the slug (?cat=home-and-diy) while
  // rows carry the display name ("Home & DIY"); resolve either to the name, so
  // a slug never filters the list down to nothing.
  function resolveCategory(name) {
    if (!name) return '';
    for (var i = 0; i < categoryCounts.length; i++) {
      if (categoryCounts[i].name === name) return name;
    }
    var slug = String(name).toLowerCase();
    for (var j = 0; j < categoryCounts.length; j++) {
      if (categoryCounts[j].slug === slug) return categoryCounts[j].name;
    }
    return name;
  }

  function setCategory(name) {
    state.cat = resolveCategory(name);
    state.shown = PAGE_SIZE;
    if (state.mode === 'json' && !catalogueReady) {
      ensureCatalogue();
      return;
    }
    render();
    pushState();
  }

  // The facets re-render from state on every render(); the <select> is built
  // once, so it needs syncing by hand — otherwise a ?cat= URL filters the
  // list while the dropdown claims "All categories".
  function syncCatSelect() {
    if (!els.bar) return;
    var select = els.bar.querySelector('#xp-cat');
    if (!select || select.value === state.cat) return;
    var known = state.cat === '';
    for (var o = 0; o < select.options.length; o++) {
      if (select.options[o].value === state.cat) { known = true; break; }
    }
    if (known) select.value = state.cat;
  }

  function syncOtherInputs(value) {
    ['tool-search', 'stickySearchInput', 'mainSearchInput'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value !== value) el.value = value;
    });
    var clear = document.getElementById('mainSearchClear');
    if (clear) clear.style.display = value ? 'block' : 'none';
    // While a filter is on, the browse chrome steps aside: one results surface,
    // one number, no "7 tools" above "Found 4 tools".
    document.querySelectorAll('[data-xp-browse]').forEach(function (section) {
      section.style.display = value ? 'none' : '';
    });
  }

  function focusInput() {
    if (els.input) { els.input.focus(); els.input.select(); return; }
    // The list filter does not exist until the catalogue arrives. / still has
    // to land somewhere, and the hero box is that somewhere.
    var hero = document.getElementById('tool-search') || document.getElementById('stickySearchInput');
    if (hero) hero.focus();
  }

  function clear() {
    if (els.bar) clearTimeout(els.bar._qt);
    setQuery('');
    if (state.cat) setCategory('');
  }

  function activateRow(li) {
    if (!li) return;
    var a = li.querySelector('[data-xp-open]');
    if (!a) return;
    logToolView(li.getAttribute('data-slug'), li.getAttribute('data-cat'));
    if (a.target === '_blank') window.open(a.href, '_blank', 'noopener');
    else location.href = a.href;
  }

  function move(delta) {
    var rows = els.list.querySelectorAll('.xp-row[data-slug]:not([hidden])');
    if (!rows.length) return;
    state.current = Math.max(0, Math.min(rows.length - 1, state.current + delta));
    rows.forEach(function (r) { r.classList.remove('xp-current'); });
    var row = rows[state.current];
    row.classList.add('xp-current');
    // Instant. Smooth scrolling on every j/k press queues animations and
    // makes a launcher feel late.
    try { row.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
    catch (e) { try { row.scrollIntoView(); } catch (e2) {} }
  }

  function currentRow() {
    var rows = els.list.querySelectorAll('.xp-row[data-slug]:not([hidden])');
    return state.current >= 0 && state.current < rows.length ? rows[state.current] : null;
  }

  function toggleDetails(row) {
    if (!row) return;
    var desc = row.querySelector('.xp-desc');
    var btn = row.querySelector('[data-xp-details]');
    if (!desc) return;
    // Two densities, one control. In compact density the description is hidden
    // by CSS and `.xp-open-row` reveals it; in comfortable density it is shown
    // and `.xp-collapsed` tucks it away. Either way the button means "show me
    // more about this row" and it works.
    var compact = document.body.classList.contains('xp-compact');
    var expanded = compact ? !row.classList.contains('xp-open-row') : row.classList.contains('xp-collapsed');
    row.classList.toggle('xp-open-row', compact ? expanded : row.classList.contains('xp-open-row'));
    row.classList.toggle('xp-collapsed', compact ? false : !expanded);
    if (btn) {
      btn.setAttribute('aria-expanded', String(expanded));
      btn.textContent = expanded ? '▾' : '▸';
    }
  }

  function setDensity(kind) {
    var body = document.body;
    body.classList.toggle('xp-compact', kind === 'compact');
    document.querySelectorAll('[data-xp-density]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-xp-density') === kind));
    });
    try { localStorage.setItem('density', kind); } catch (e) {}
  }

  // Reading localStorage can itself throw (blocked cookies, private mode in
  // some browsers) — and both call sites run before the first render, so an
  // unguarded read here would kill the whole list.
  function savedDensity() {
    try { return localStorage.getItem('density') === 'compact' ? 'compact' : 'comfortable'; }
    catch (e) { return 'comfortable'; }
  }

  function wire() {
    // Toolbar
    els.bar.addEventListener('input', function (e) {
      if (e.target.id !== 'xp-input') return;
      var value = e.target.value;
      if (els.field) els.field.classList.toggle('xp-has-value', !!value);
      clearTimeout(els.bar._qt);
      els.bar._qt = setTimeout(function () { setQuery(value); }, 80);
    });
    els.bar.addEventListener('change', function (e) {
      if (e.target.id === 'xp-sort') { state.sort = e.target.value; state.shown = PAGE_SIZE; render(); pushState(); }
      if (e.target.id === 'xp-cat') { setCategory(e.target.value); }
    });
    els.bar.addEventListener('click', function (e) {
      if (e.target.closest('[data-xp-clear]')) { clear(); focusInput(); }
      var dens = e.target.closest('[data-xp-density]');
      if (dens) setDensity(dens.getAttribute('data-xp-density'));
      if (e.target.closest('[data-tb-open]') && window.mpToolbox) window.mpToolbox.open();
    });

    // Facets (re-rendered, so delegate from the wrapper)
    els.wrap.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-xp-cat]');
      if (chip) setCategory(chip.getAttribute('data-xp-cat'));
    });

    // Rows
    els.list.addEventListener('click', function (e) {
      var row = e.target.closest('.xp-row');
      if (!row) return;
      if (e.target.closest('[data-toolbox-add]')) return;   // toolbox.js owns that
      if (e.target.closest('[data-xp-details]')) { toggleDetails(row); return; }
      var a = e.target.closest('[data-xp-open]');
      if (a) logToolView(row.getAttribute('data-slug'), row.getAttribute('data-cat'));
    });

    if (els.more) els.more.addEventListener('click', function () {
      state.shown += PAGE_SIZE;
      render({ append: true });
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target)) {
        if (e.target.id === 'xp-input' && (e.key === 'Escape' || e.key === 'Enter')) {
          clearTimeout(els.bar && els.bar._qt);
          if (e.key === 'Escape') { clear(); e.target.blur(); return; }
          e.preventDefault();
          setQuery(e.target.value);
          var hits = visible();
          if (hits.length === 1) { location.href = hits[0].url; return; }
          if (hits.length > 1) { e.target.blur(); move(1); }
        }
        return;
      }
      if (e.key === '/') { e.preventDefault(); focusInput(); return; }
      if (e.key === 'j') { e.preventDefault(); move(1); return; }
      if (e.key === 'k') { e.preventDefault(); move(-1); return; }
      if (e.key === 'x') { e.preventDefault(); toggleDetails(currentRow()); return; }
      if (e.key === 'b') {
        var row = currentRow();
        if (row && window.mpToolbox) {
          e.preventDefault();
          var slug = row.getAttribute('data-slug');
          window.mpToolbox.toggle(slug);
          syncToolboxButtons();
        }
        return;
      }
      if (e.key === 'Enter') {
        var cur = currentRow();
        if (cur) { e.preventDefault(); activateRow(cur); }
      }
    });

    // Escape closes an expanded row before anything else.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = els.list.querySelector('.xp-row.xp-open-row');
      if (open && !isTyping(e.target)) toggleDetails(open);
    });

    if (window.mpToolbox && window.mpToolbox.subscribe) window.mpToolbox.subscribe(syncToolboxButtons);
  }

  /* ----------------------------------------------------------------- boot */
  function mount(container) {
    state.mode = container.getAttribute('data-explore');
    els.wrap = container.parentNode;
    els.container = container;
    els.more = container.parentNode.querySelector('[data-xp-more]');

    // The toolbar sits directly above the list it filters.
    var bar = document.createElement('div');
    bar.className = 'xp-bar';
    bar.setAttribute('role', 'search');
    container.parentNode.insertBefore(bar, container);
    els.bar = bar;

    if (state.mode === 'json') {
      // Nothing to keep: the rows are built here a page at a time.
      container.innerHTML = '';
      var list = document.createElement('ul');
      list.className = 'xp-list';
      container.appendChild(list);
      els.list = list;
    } else {
      // The rows are already in the served HTML. The container itself is the
      // list, so filtering decorates and hides rather than rebuilding — which
      // is what keeps a no-JS visitor's page identical to the served file.
      els.list = container;
      var empty = document.createElement('div');
      empty.className = 'xp-empty';
      empty.hidden = true;
      empty.innerHTML = '<strong>Nothing matches that.</strong><br>Try a shorter word, or ' +
        '<a href="index.html" style="color:var(--xp-accent,#2dd4ff);">search the whole catalogue</a>.';
      container.parentNode.insertBefore(empty, container.nextSibling);
      els.empty = empty;
    }

    /* The category chips live *inside* the sticky bar (see toolbarHTML), not
       beside it: they filter the list, so they have to stay reachable while
       the visitor is reading it. `els.facets` is picked up after the bar is
       rendered — for the static pages there are none, and the guards below
       handle that.

       Measuring the chrome the bar must clear does not wait for the catalogue
       to land: what is above the list is in the served HTML. */
    watchStickyOffset();

    // "Show more" is created when the page did not ship one. Static pages have
    // all their rows already, so only the JSON mode needs it.
    if (!els.more) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'xp-more';
      more.setAttribute('data-xp-more', '');
      more.hidden = true;
      container.parentNode.insertBefore(more, container.nextSibling);
      els.more = more;
    }

    if (state.mode === 'json') {
      /* The catalogue is a few hundred kilobytes. It must not compete with
         first paint. Load it when the visitor is about to need it: a deep
         link, a search, the list scrolling into view, or the browser going
         idle. A search that arrives first is queued, not dropped. */
      catalogueReady = false;
      var loading = null;
      function wantsNow() {
        try {
          var params = new URLSearchParams(location.search);
          return !!(params.get('q') || params.get('cat') || params.get('sort'));
        } catch (e) { return false; }
      }
      function finish(data) {
        catalogueReady = true;
        state.rows = data.tools.map(rowFromTool);
        categoryCounts = data.categories.map(function (c) { return { name: c.name, count: c.count, slug: c.slug }; });
        bar.innerHTML = toolbarHTML();
        els.input = bar.querySelector('#xp-input');
        els.field = bar.querySelector('.xp-field');
        els.count = bar.querySelector('#xp-count');
        els.facets = bar.querySelector('[data-xp-facets]');
        facetStamp = null;
        paintKey = '';
        paintCount = -1;
        if (queuedQuery == null) applyFromUrl();
        else state.q = queuedQuery;
        wire();
        setDensity(savedDensity());
        render();
        if (state.q) logSearch(state.q.trim(), visible().length);
        syncOtherInputs(state.q);
        pushState();
        document.dispatchEvent(new CustomEvent('mp:explore-ready'));
      }
      function fail() {
        // Re-armed, not dead. `loading` used to keep the rejected promise and
        // `catalogueReady` claimed success, so one failed fetch meant the list
        // could never appear without a reload — the next search just replayed
        // the same settled promise against zero rows. Now the next search,
        // scroll or tap retries the fetch, and the list itself says what
        // happened, with a retry next to the directory link.
        loading = null;
        catalogueReady = false;
        paintKey = '';
        paintCount = -1;
        bar.innerHTML = '<span class="xp-count">The full list could not load here. ' +
          '<a href="tools-index.html" style="color:var(--xp-accent,#2dd4ff);">Open the plain directory →</a></span>';
        if (els.list) {
          els.list.innerHTML = '<li class="xp-row"><div class="xp-empty">' +
            '<strong>The list could not load.</strong><br>Check your connection, then ' +
            '<button type="button" class="xp-btn" data-xp-retry>try again</button> or ' +
            '<a href="tools-index.html" style="color:var(--xp-accent,#2dd4ff);">browse the plain directory</a>.' +
            '</div></li>';
        }
      }
      function loadCatalogue() {
        if (loading) return loading;
        // The abort window spans the fetch AND the body read: headers that
        // arrive with a body that never follows are the same hang from the
        // visitor's side. Without AbortController (very old browsers) this is
        // a plain fetch — the worker's own bound is still the backstop.
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CATALOGUE_TIMEOUT_MS) : null;
        var clearTimer = function () { if (timer) { clearTimeout(timer); timer = null; } };
        loading = fetch('tools-index.json', ctrl ? { signal: ctrl.signal } : undefined)
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
          .then(function (data) { clearTimer(); finish(data); })
          .catch(function (err) { clearTimer(); fail(err); });
        return loading;
      }
      ensureCatalogue = loadCatalogue;
      // Retry for a failed catalogue load: delegated from the wrapper because
      // fail() replaces both the bar and the list contents, while the wrapper
      // itself is stable across failure and success. A tap while a fetch is
      // already in flight just rejoins it (loadCatalogue dedupes on `loading`).
      els.wrap.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('[data-xp-retry]')) return;
        e.preventDefault();
        bar.innerHTML = '<span class="xp-count">Loading the full list…</span>';
        if (els.list) els.list.innerHTML = '<li class="xp-row"><div class="xp-empty xp-pending">Loading the catalogue…</div></li>';
        paintKey = '';
        paintCount = -1;
        loadCatalogue();
      });
      if (wantsNow()) return loadCatalogue();
      bar.innerHTML = '<span class="xp-count">The full list loads as you reach it.</span>';
      var section = document.getElementById('all-tools-section') || container;
      if (window.IntersectionObserver) {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (!entries[i].isIntersecting) continue;
            io.disconnect();
            loadCatalogue();
            return;
          }
        }, { rootMargin: '700px 0px' });
        io.observe(section);
      }
      /* When the catalogue is allowed to start, which is a bandwidth decision
         and was measured rather than guessed. It must not compete with the
         first screen — 200 KB of JSON downloading against the font and the
         render-blocking stylesheets moves the thing the visitor is waiting for
         further away. But waiting for a genuinely idle browser put the request
         at 3.2 s on a throttled connection (load was done at 2.1 s, LCP at
         1.1 s): the list then could not appear before ~4.5 s, and the visitor
         had been looking at an empty box for three of those seconds.

         So: idle — as soon as the browser has nothing more urgent — with a
         short bound, or the window's `load` event, whichever comes first.
         Both are after the first paint; `load` means nothing is left to
         compete with at all. Deduped by loadCatalogue's own `loading`. */
      var begin = function () { loadCatalogue(); };
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 600); };
      idle(begin, { timeout: 600 });
      window.addEventListener('load', begin, { once: true });
      return Promise.resolve();
    }

    // Static mode: the rows are already in the served HTML, so nothing is
    // fetched and nothing is re-rendered. The generator writes the same row
    // markup the JSON mode does; this adds only what needs script (the ＋ and
    // the details toggle) and then filters by hiding rows.
    var rows = [];
    var catName = container.getAttribute('data-cat-name') || '';
    // The generator once stringified an object here ("[object Object]"); never
    // let a bad attribute become every row's category again.
    if (catName === '[object Object]') catName = '';
    container.querySelectorAll('.xp-row[data-slug]').forEach(function (el) {
      var row = rowFromElement(el, catName);
      if (row) rows.push({ el: el, row: row });
    });
    state.rows = rows.map(function (r) { return r.row; });
    state.staticRows = rows;
    var cats = {};
    rows.forEach(function (item) { if (item.row.catName) cats[item.row.catName] = true; });
    state.multiCategory = Object.keys(cats).length > 1;
    categoryCounts = [{ name: catName || 'Tools', count: state.rows.length }];
    bar.innerHTML = toolbarHTML();
    els.input = bar.querySelector('#xp-input');
    els.field = bar.querySelector('.xp-field');
    els.count = bar.querySelector('#xp-count');
    els.facets = bar.querySelector('[data-xp-facets]');
    applyFromUrl();
    wire();
    setDensity(savedDensity());

    // Decorate the served rows in place. Everything here is additive: the row
    // is already a working link, so a visitor whose script failed still has the
    // full index.
    rows.forEach(function (item, idx) {
      var li = item.el;
      var a = li.querySelector('a[href]');
      /* A category chip says which category a row belongs to — useful on the
         index, noise on a page that is that category. So: only when the row
         has a category and the list shows more than one, and never when the
         page already grouped it under a heading. */
      var showCat = item.row.catName && !li.closest('[data-xp-group]') && state.multiCategory;
      if (a && showCat && !li.querySelector('.xp-cat')) {
        var cat = document.createElement('span');
        cat.className = 'xp-cat';
        cat.textContent = item.row.catName;
        a.appendChild(cat);
      }
      if (!li.querySelector('[data-toolbox-add]')) {
        var actions = document.createElement('div');
        actions.className = 'xp-actions';
        actions.innerHTML =
          '<button type="button" class="xp-icon" data-xp-details aria-expanded="false" title="Description" aria-label="Show details for ' + esc(item.row.title) + '">▸</button>' +
          '<button type="button" class="xp-icon" data-toolbox-add="' + esc(item.row.slug) + '" aria-pressed="false" title="Add to my toolbox" aria-label="Add ' + esc(item.row.title) + ' to your toolbox">＋</button>';
        li.appendChild(actions);
      }
      li.setAttribute('data-index', String(idx));
    });
    render();
    document.dispatchEvent(new CustomEvent('mp:explore-ready'));
    return Promise.resolve();
  }

  function start() {
    var containers = document.querySelectorAll('[data-explore]');
    if (!containers.length) return;
    // One engine per page: the first container is the list. (Category pages and
    // tools.html each ship exactly one; the home page has exactly one.)
    mount(containers[0]);
  }

  window.mpExplore = {
    // opts.quiet filters without scrolling: the home page's hero box filters
    // on every keystroke, and scrolling there would yank the box away mid-word.
    filter: function (q, opts) { return setQuery(q, { scroll: !(opts && opts.quiet) }); },
    setCategory: setCategory,
    focusInput: focusInput,
    clear: clear,
    rows: function () { return visible(); },
    state: state
  };

  // Popular chip fallback — the hero's \"Popular: BMI, Loan, …\" shortcuts are outside
  // the explore container and historically had no handler at all. home-core.js now
  // owns them on the home page; this delegated fallback keeps them working if that
  // file is blocked or fails to load, and is harmless as a duplicate because
  // filter() with the same query is idempotent.
  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.popular-chip');
    if (!chip) return;
    if (e.defaultPrevented) return;
    var q = chip.getAttribute('data-query') || chip.textContent.trim();
    if (!q) return;
    if (window.mpExplore && window.mpExplore.state && window.mpExplore.state.q === q) return;
    ['tool-search', 'stickySearchInput', 'xp-input'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = q;
    });
    var clear = document.getElementById('mainSearchClear');
    if (clear) clear.style.display = q ? 'block' : 'none';
    if (window.mpExplore) {
      e.preventDefault();
      window.mpExplore.filter(q);
      var section = document.getElementById('all-tools-section');
      if (section && typeof section.scrollIntoView === 'function') {
        try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { try { section.scrollIntoView(); } catch (e2) {} }
      }
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
