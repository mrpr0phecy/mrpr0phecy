/* toolbox.js — the visitor's own toolbox: a saved list, not a running grid.
   ---------------------------------------------------------------------------
   What this replaced
   ------------------
   The old toolbox held *live* tools. Adding a tool meant mounting its card in
   the panel, which meant the panel could only ever be offered on the page that
   already had the whole catalogue loaded and could only hold a handful of
   tools before it became a second copy of the site's heaviest page.

   This one stores what a toolbox actually needs — the slugs — and renders them
   as an expandable list. That makes it:
     - cheap (a few hundred bytes in localStorage, no tool code);
     - portable (the same panel works on the home page, the index, the
       directory and all 28 category pages);
     - shareable (a toolbox is a list of slugs, so it fits in a URL);
     - durable (it survives a tool being parked, rewired or rewritten).

   Storage key: `mp.toolbox.v1` — deliberately *not* an `__mp_` key, which are
   reserved for site instrumentation (docs/INSTRUMENTATION.md).

   Nothing here leaves the device. There is no account, no sync and no fetch of
   anything but the same `cards/cards-lite.json` the home page already uses for
   its first paint.

   Public API (used by explore.js and by anything that wants a ＋ button):
     mpToolbox.has(slug) / add(slug) / remove(slug) / toggle(slug)
     mpToolbox.slugs() / replace(slugs) / count() / clear()
     mpToolbox.subscribe(fn)        → fn(slugs) on every change
     mpToolbox.open()               → open the panel
     mpToolbox.toast(msg)           → the shared little confirmation
*/
(function () {
  'use strict';

  var KEY = 'mp.toolbox.v1';
  var PANEL_ID = 'toolbox';
  var slugs = [];
  var byslug = null;                 // slug → { name, title, category } from cards-lite.json
  var litePromise = null;
  var listeners = [];
  var groupState = {};               // category → open? remembered for this visit

  /* ---------------------------------------------------------------- storage */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (s) { return typeof s === 'string' && s && s.length < 90; }).slice(0, 500);
    } catch (e) { return []; }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(slugs)); } catch (e) { /* private mode: session only */ }
  }
  function emit() {
    write();
    paintCounts();
    renderPanel();
    listeners.forEach(function (fn) { try { fn(slugs.slice()); } catch (e) {} });
  }

  /* ---------------------------------------------------------------- api bits */
  function index(slug) { return slugs.indexOf(slug); }
  function has(slug) { return index(slug) !== -1; }
  function add(slug) {
    if (!slug || has(slug)) return false;
    slugs.push(slug);
    emit();
    return true;
  }
  function remove(slug) {
    var i = index(slug);
    if (i === -1) return false;
    slugs.splice(i, 1);
    emit();
    return true;
  }
  function toggle(slug) {
    var added = has(slug) ? (remove(slug), false) : (add(slug), true);
    return added;
  }
  function move(slug, dir) {
    var i = index(slug), j = i + dir;
    if (i === -1 || j < 0 || j >= slugs.length) return false;
    var tmp = slugs[j];
    slugs[j] = slugs[i];
    slugs[i] = tmp;
    emit();
    return true;
  }
  function replace(list) {
    slugs = (list || []).filter(function (s) { return typeof s === 'string' && s; }).slice(0, 500);
    emit();
  }

  /* ------------------------------------------------------------------ toast */
  var toastEl = null, toastTimer = null;
  function toast(msg, label, href) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'xp-toast xp-wrap';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    if (label && href) {
      var a = document.createElement('a');
      a.href = href;
      a.textContent = ' ' + label;
      toastEl.appendChild(a);
    }
    toastEl.classList.add('xp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('xp-show'); }, 2600);
  }

  /* ------------------------------------------------------------ tool lookup */
  // cards-lite.json is 111 KB and name/title/category only, so the panel can
  // name a saved tool without pulling the 389 KB index.
  function lite() {
    if (byslug) return Promise.resolve(byslug);
    if (litePromise) return litePromise;
    var dir = document.body.getAttribute('data-cards-dir') || '';
    litePromise = fetch(dir + 'cards/cards-lite.json', { priority: 'low' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        byslug = {};
        (list || []).forEach(function (t) { if (t && t.name) byslug[t.name] = t; });
        return byslug;
      })
      .catch(function () { byslug = {}; return byslug; });
    return litePromise;
  }
  function toolHref(slug, base) {
    return base + encodeURIComponent(slug);
  }

  /* ------------------------------------------------------------------- panel */
  function panelBase() {
    var panel = document.getElementById(PANEL_ID);
    var explicit = panel && panel.getAttribute('data-tool-base');
    if (explicit) return explicit;
    return document.body.getAttribute('data-tool-base') ||
      (location.pathname.indexOf('/categories/') !== -1 ? '../tool.html?card=' : 'tool.html?card=');
  }

  function paintCounts() {
    var n = slugs.length;
    var buttons = document.querySelectorAll('[data-toolbox-add]');
    for (var b = 0; b < buttons.length; b++) {
      var btnSlug = buttons[b].getAttribute('data-toolbox-add');
      buttons[b].setAttribute('aria-pressed', String(has(btnSlug)));
      buttons[b].classList.toggle('xp-in', has(btnSlug));
    }
    var nodes = document.querySelectorAll('[data-toolbox-count]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = n ? String(n) : '';
    var counter = document.getElementById('toolboxCardCount');
    if (counter) counter.textContent = n === 1 ? '1 tool' : n + ' tools';
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || 'Copied'); }, function () {
        fallback(); toast(okMsg || 'Copied');
      });
    } else { fallback(); toast(okMsg || 'Copied'); }
  }

  function shareUrl() {
    // base64url of the slug list. A toolbox is small by nature — 200 tools of
    // the longest slug this site ships is still only ~5 KB of URL, and the
    // panel warns rather than silently truncating.
    var payload = slugs.join(',');
    var b64;
    try {
      b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      b64 = encodeURIComponent(payload);
    }
    var url = location.origin + location.pathname + '?toolbox=' + b64;
    return { url: url, payload: payload, b64: b64 };
  }

  function groupByCategory(list) {
    var groups = [];
    var seen = {};
    list.forEach(function (slug) {
      var t = (byslug && byslug[slug]) || null;
      var cat = (t && t.category) || 'Saved tools';
      if (!seen[cat]) { seen[cat] = { name: cat, items: [] }; groups.push(seen[cat]); }
      seen[cat].items.push({ slug: slug, tool: t });
    });
    return groups;
  }

  function renderPanel() {
    var host = document.getElementById('toolboxContent');
    if (!host) return;
    paintCounts();
    if (!slugs.length) {
      host.innerHTML =
        '<div class="tb-empty">' +
        '<p style="margin:0 0 10px;">Your toolbox is empty. It is your own shortlist of tools — the ones you actually use — kept in this browser and nowhere else.</p>' +
        '<p style="margin:0 0 10px;">Add one from any list: the <strong>＋</strong> button on a row, or press <kbd>b</kbd> while a row is highlighted. On the home page, <kbd>/</kbd> jumps to the search box.</p>' +
        '<p style="margin:0;">No account, no sync, nothing uploaded. Clearing your browser data clears it, so <em>Export</em> exists for that.</p>' +
        '</div>' +
        '<div class="tb-foot">The toolbox is free and always will be. If it earns its keep: ' +
        '<a href="' + donateHref() + '">buy the site a coffee</a> · ' +
        '<a href="' + sponsorHref() + '">sponsor a category</a>.</div>';
      return;
    }

    var groups = groupByCategory(slugs);
    var html = '<div class="tb-bar">' +
      '<button type="button" data-tb="open-all">Open all in tabs</button>' +
      '<button type="button" data-tb="copy">Copy as list</button>' +
      '<button type="button" data-tb="share">Share link</button>' +
      '<button type="button" data-tb="export">Export</button>' +
      '<button type="button" data-tb="import">Import</button>' +
      '<button type="button" data-tb="clear">Clear</button>' +
      '</div>';

    var base = panelBase();
    html += '<ul class="tb-list">';
    groups.forEach(function (g, gi) {
      var open = groupState[g.name] !== false;
      html += '<li><details class="tb-group" data-group="' + esc(g.name) + '"' + (open ? ' open' : '') + '>' +
        '<summary>' + esc(g.name) + '<span class="tb-n">' + g.items.length + (g.items.length === 1 ? ' tool' : ' tools') + '</span></summary>';
      g.items.forEach(function (item) {
        var title = (item.tool && item.tool.title) || item.slug;
        html += '<div class="tb-item">' +
          '<div><a href="' + esc(toolHref(item.slug, base)) + '" title="' + esc(title) + '">' + esc(title) + '</a>' +
          '<span class="tb-cat">' + esc(item.slug) + '</span></div>' +
          '<div class="tb-acts">' +
          '<button type="button" data-tb-move="-1" data-slug="' + esc(item.slug) + '" title="Move up" aria-label="Move ' + esc(title) + ' up">↑</button>' +
          '<button type="button" data-tb-move="1" data-slug="' + esc(item.slug) + '" title="Move down" aria-label="Move ' + esc(title) + ' down">↓</button>' +
          '<button type="button" data-tb-remove="' + esc(item.slug) + '" title="Remove" aria-label="Remove ' + esc(title) + ' from toolbox">✕</button>' +
          '</div></div>';
      });
      html += '</details></li>';
    });
    html += '</ul>';

    var s = shareUrl();
    html += '<div class="tb-foot">' +
      '<strong style="color:var(--xp-text,#e6faff);">Saved on this device only.</strong> No account, nothing uploaded. ' +
      'Share a toolbox with the link below — it carries the list, not your data.' +
      '<input class="tb-share" type="text" readonly value="' + esc(s.url.length > 900 ? 'Toolbox too long to share as a link — use Export.' : s.url) + '" aria-label="Shareable toolbox link" />' +
      '<div style="margin-top:10px;">Free and account-free forever. If it earns its keep: ' +
      '<a href="' + donateHref() + '">buy the site a coffee</a> · ' +
      '<a href="' + sponsorHref() + '">sponsor a category</a>.</div>' +
      '</div>';

    host.innerHTML = html;
    wirePanel(host);
  }

  function wirePanel(host) {
    host.addEventListener('change', function (e) {
      var d = e.target.closest && e.target.closest('.tb-group');
      if (d) groupState[d.getAttribute('data-group')] = d.open;
    });
    host.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var removeBtn = t.closest('[data-tb-remove]');
      if (removeBtn) {
        var slug = removeBtn.getAttribute('data-tb-remove');
        remove(slug);
        toast('Removed from your toolbox');
        return;
      }
      var moveBtn = t.closest('[data-tb-move]');
      if (moveBtn) {
        move(moveBtn.getAttribute('data-slug'), parseInt(moveBtn.getAttribute('data-tb-move'), 10));
        return;
      }
      var action = t.closest('[data-tb]');
      if (!action) return;
      var kind = action.getAttribute('data-tb');
      if (kind === 'clear') {
        if (slugs.length > 4 && !window.confirm('Clear all ' + slugs.length + ' tools from your toolbox?')) return;
        slugs = [];
        emit();
        toast('Toolbox cleared');
      } else if (kind === 'copy') {
        var text = slugs.map(function (s) {
          var tool = byslug && byslug[s];
          return '- ' + ((tool && tool.title) || s) + ' — ' + toolHref(s, 'https://www.themostusefulsiteintheworld.com/');
        }).join('\n');
        copyText(text, 'Toolbox copied as a list');
      } else if (kind === 'share') {
        var url = shareUrl().url;
        copyText(url, 'Share link copied');
      } else if (kind === 'export') {
        var blob = JSON.stringify({ version: 1, saved: new Date().toISOString(), tools: slugs }, null, 2);
        var a = document.createElement('a');
        a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(blob);
        a.download = 'my-toolbox.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('Exported my-toolbox.json');
      } else if (kind === 'import') {
        importDialog();
      } else if (kind === 'open-all') {
        if (slugs.length > 10 && !window.confirm('Open ' + slugs.length + ' tabs? Browsers may block them all.')) return;
        var base = panelBase();
        slugs.slice(0, 40).forEach(function (s, i) {
          setTimeout(function () { window.open(toolHref(s, base), '_blank', 'noopener'); }, i * 120);
        });
      }
    });
  }

  function importDialog() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var list;
        try {
          var data = JSON.parse(String(reader.result));
          if (Array.isArray(data)) list = data; else if (data && Array.isArray(data.tools)) list = data.tools;
        } catch (e) { toast('That file is not a toolbox export'); return; }
        if (!list) { toast('That file is not a toolbox export'); return; }
        var merged = slugs.slice();
        list.forEach(function (s) { if (typeof s === 'string' && merged.indexOf(s) === -1) merged.push(s); });
        replace(merged);
        toast('Imported ' + list.length + ' tools');
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function donateHref() {
    return document.body.getAttribute('data-donate-href') ||
      (location.pathname.indexOf('/categories/') !== -1 ? '../donate.html' : 'donate.html');
  }
  function sponsorHref() {
    return document.body.getAttribute('data-sponsor-href') ||
      (location.pathname.indexOf('/categories/') !== -1 ? '../sponsor.html' : 'sponsor.html');
  }

  /* ------------------------------------------------------------ shared links */
  // ?toolbox=<base64> — someone sent a list. Nothing is added without a click.
  function readShared() {
    var m = /[?&]toolbox=([A-Za-z0-9\-_%=]+)/.exec(location.search);
    if (!m) return;
    var raw = m[1];
    var payload = '';
    try {
      payload = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      try { payload = decodeURIComponent(raw); } catch (e2) { payload = ''; }
    }
    var incoming = payload.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 500);
    if (!incoming.length) return;
    var fresh = incoming.filter(function (s) { return !has(s); });
    if (!fresh.length) { toast('Everyone in that shared toolbox is already saved'); return; }
    showSharedBanner(fresh, incoming.length);
  }

  function showSharedBanner(fresh, total) {
    var bar = document.createElement('div');
    bar.className = 'xp-wrap';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Shared toolbox');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:280;';
    bar.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;' +
      'margin:0 0 14px;padding:12px 14px;background:rgba(10,15,20,0.97);border:1px solid rgba(255,215,0,0.4);border-radius:12px;">' +
      '<span style="font-size:13px;">Someone shared a toolbox: <strong>' + total + ' tools</strong> (' + fresh.length + ' new to you).</span>' +
      '<span style="display:flex;gap:8px;">' +
      '<button type="button" class="xp-btn xp-gold" data-shared-add>Add them to my toolbox</button>' +
      '<button type="button" class="xp-btn" data-shared-close>Not now</button>' +
      '</span></div>';
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      if (e.target.closest('[data-shared-add]')) {
        var merged = slugs.slice();
        fresh.forEach(function (s) { if (merged.indexOf(s) === -1) merged.push(s); });
        replace(merged);
        toast('Added ' + fresh.length + ' tools to your toolbox', 'Open it', '#toolbox');
        bar.remove();
      } else if (e.target.closest('[data-shared-close]')) {
        bar.remove();
      }
    });
  }

  /* ------------------------------------------------------------------- boot */
  function open() {
    ensureChrome();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.removeAttribute('hidden');
    panel.style.display = '';
    if (typeof panel.showPopover === 'function') {
      try { panel.showPopover(); } catch (e) {}
    } else {
      panel.setAttribute('data-open', 'true');
      panel.style.display = 'block';
      panel.setAttribute('aria-hidden', 'false');
    }
    var toggle = document.querySelector('[data-toolbox-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.classList.add('xp-open');
    }
    lite().then(renderPanel);
  }

  function init() {
    slugs = read();
    // Any ＋ button anywhere on the page.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-toolbox-add]');
      if (!btn) return;
      e.preventDefault();
      var slug = btn.getAttribute('data-toolbox-add');
      var added = toggle(slug);
      if (added) {
        lite().then(function () {
          var t = byslug && byslug[slug];
          toast('Added to your toolbox' + (t ? ': ' + t.title : ''), 'Open it', '#toolbox');
        });
      } else {
        toast('Removed from your toolbox');
      }
    });
    // Legacy/toast link that opens the panel.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href="#toolbox"]');
      if (!a) return;
      e.preventDefault();
      open();
    });
    var close = document.getElementById('toolboxClose');
    if (close) close.addEventListener('click', function () {
      var panel = document.getElementById(PANEL_ID);
      if (panel && typeof panel.hidePopover === 'function' && panel.hasAttribute('popover')) {
        try { panel.hidePopover(); } catch (e) {}
      } else if (panel) {
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('hidden', '');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); open(); }
    });
    ensureChrome();
    decorateRows();
    paintCounts();
    lite().then(renderPanel);
    readShared();
  }

  /* Rows that ship as plain links get the ＋ here, not in the markup: with
     JavaScript off there is no dead button, and with it on every list on the
     site behaves the same way. */
  /* Adds the ＋ to anything marked as a toolbox row.
     Two shapes, because the site has two:
       - a list row (<li class="xp-row" data-toolbox-row=…>) takes the button
         inside itself, where the row's own layout already reserves space;
       - a card (<div class="card-wrap" data-toolbox-row=…><a class="…-card">)
         takes it as a positioned sibling, because a <button> inside an <a> is
         invalid and would follow the link when pressed. */
  /* Pages that do not ship a toolbox panel get one, built here.
     The home page has its panel in the sticky bar; the index, the directory
     and the 28 category pages do not — and those are exactly the pages where a
     visitor is most likely to want to keep something. Building the button and
     the panel from the same script (and the same stylesheet) keeps one toolbox
     on the site rather than one per page. */
  function ensureChrome() {
    if (document.getElementById(PANEL_ID)) return;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'xp-tb-float';
    toggle.setAttribute('data-toolbox-toggle', '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', PANEL_ID);
    toggle.innerHTML = '<span aria-hidden="true">🧰</span> My toolbox <span class="tb-badge" data-toolbox-count></span>';

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'tb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'My toolbox');
    panel.setAttribute('hidden', '');
    panel.innerHTML =
      '<div class="tb-head">' +
      '<strong>🧰 My toolbox</strong>' +
      '<span id="toolboxCardCount">0 tools</span>' +
      '<button type="button" id="toolboxClose" class="tb-x" aria-label="Close toolbox">✕</button>' +
      '</div>' +
      '<div id="toolboxContent" aria-live="polite"></div>';

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    toggle.addEventListener('click', function () {
      if (panel.hasAttribute('hidden')) open(); else hide();
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#toolboxClose')) hide();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hasAttribute('hidden')) hide();
    });
  }

  function hide() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    if (typeof panel.hidePopover === 'function' && panel.hasAttribute('popover')) {
      try { panel.hidePopover(); } catch (e) {}
    } else {
      panel.setAttribute('hidden', '');
      panel.style.display = 'none';
    }
    var toggle = document.querySelector('[data-toolbox-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.classList.remove('xp-open');
    }
    if (location.hash === '#' + PANEL_ID) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
  }

  function decorateRows() {
    var rows = document.querySelectorAll('[data-toolbox-row]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.querySelector('[data-toolbox-add]')) continue;
      var slug = row.getAttribute('data-toolbox-row');
      if (!slug) continue;
      var actions = document.createElement('div');
      actions.className = 'xp-actions';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'xp-icon';
      btn.setAttribute('data-toolbox-add', slug);
      btn.setAttribute('aria-pressed', String(has(slug)));
      btn.title = 'Add to my toolbox';
      var label = row.querySelector('.xp-title');
      btn.setAttribute('aria-label', 'Add ' + (label ? label.textContent.trim() : slug) + ' to your toolbox');
      btn.textContent = '＋';
      actions.appendChild(btn);
      row.appendChild(actions);
      if (has(slug)) btn.classList.add('xp-in');
    }
  }

  window.mpToolbox = {
    has: has, add: add, remove: remove, toggle: toggle, move: move, replace: replace,
    slugs: function () { return slugs.slice(); },
    count: function () { return slugs.length; },
    clear: function () { slugs = []; emit(); },
    subscribe: function (fn) { listeners.push(fn); try { fn(slugs.slice()); } catch (e) {} },
    open: open,
    close: hide,
    toast: toast,
    ready: function () { return lite(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
