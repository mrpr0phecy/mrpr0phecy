/**
 * discovery-app.js — Search-first, category-driven discovery system
 * for The Most Useful Site in the World.
 *
 * Single source of truth: /tools-index.json
 * Zero external frameworks. Vanilla JS module.
 */

const PAGE_SIZE = 50;

let INDEX = null;
let filtered = [];
let page = 1;
let currentLetter = 'ALL';

// ---- Instrumentation (pointer #3 / #10) ----
// Mirrors home-app.js instrumentation but scoped to the discovery surface.
// Uses the existing GA4 (`G-G058FVW6Z2`) where it exists and a capped
// localStorage buffer otherwise. See `docs/INSTRUMENTATION.md`.
function mpGtag(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch {} }
function mpIsMobile() { try { return (typeof window !== 'undefined' && window.innerWidth <= 560) || ('ontouchstart' in window); } catch { return false; } }
function mpLogZeroSearch(query, category) {
  const q = String(query || '').trim().toLowerCase().slice(0, 60);
  if (!q || q.length < 2) return;
  try {
    const key = '__mp_zero_searches';
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    if (!map[q]) map[q] = { c: 0, last: null, cat: '' };
    map[q].c = (map[q].c || 0) + 1;
    map[q].last = new Date().toISOString().slice(0, 10);
    map[q].cat = String(category || 'discovery').slice(0, 30);
    const entries = Object.entries(map);
    if (entries.length > 200) { entries.sort((a,b)=>(a[1].c||0)-(b[1].c||0)); for (let i=0;i<entries.length-200;i++) delete map[entries[i][0]]; }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
  try { mpGtag('search_zero', { search_term: q.slice(0,40), category: String(category||'discovery').slice(0,30), device: mpIsMobile()?'mobile':'desktop', surface: 'discovery' }); } catch {}
  console.info('[instr:discovery] zero-result:', JSON.stringify(q));
}
function mpLogSearch(query, resultCount) {
  const q = String(query || '').trim();
  try { mpGtag('search', { search_term: (q||'(empty)').slice(0,40), result_count: Number(resultCount)||0, device: mpIsMobile()?'mobile':'desktop', surface: 'discovery' }); } catch {}
  if (q.length >= 2 && Number(resultCount) === 0) mpLogZeroSearch(q, 'discovery');
}
function mpLogToolView(slug, category) {
  const s = String(slug||'').slice(0,80);
  if (!s) return;
  try {
    const key='__mp_tool_views';
    const raw=localStorage.getItem(key);
    const map=raw?JSON.parse(raw):{};
    map[s]=(map[s]||0)+1;
    if (Object.keys(map).length>500){ const sorted=Object.entries(map).sort((a,b)=>a[1]-b[1]); for(let i=0;i<50&&sorted[i];i++) delete map[sorted[i][0]]; }
    localStorage.setItem(key, JSON.stringify(map));
    try{ sessionStorage.setItem('__mp_last_tool', s); }catch{}
  } catch{}
  try{ mpGtag('tool_view', { tool_slug: s.slice(0,60), category: String(category||'').slice(0,30), device: mpIsMobile()?'mobile':'desktop', surface: 'discovery' }); }catch{}
}
try{
  window.__mpDiscoveryInstrumentation = {
    export(){ let zero={},views={}; try{zero=JSON.parse(localStorage.getItem('__mp_zero_searches')||'{}');}catch{} try{views=JSON.parse(localStorage.getItem('__mp_tool_views')||'{}');}catch{} const top=(o,n)=>Object.entries(o).sort((a,b)=>(b[1].c||b[1])-(a[1].c||a[1])).slice(0,n); return{zero_top_20:top(zero,20),views_top_20:top(views,20),generated_at:new Date().toISOString()}; }
  };
  // Click delegation for tool views on the discovery grid (capture before navigation):
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a.tool-card, a.tool-row, a.cat-card') : null;
    if (!a) return;
    try{
      const href = a.getAttribute('href')||'';
      const m = href.match(/card=([^&]+)/);
      const slug = m ? decodeURIComponent(m[1]) : (href.includes('categories/') ? href : '');
      if (slug) mpLogToolView(slug, 'discovery');
    }catch{}
  });
}catch{}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadIndex() {
  try {
    // Low priority on purpose: this is the browse chrome (featured, trending,
    // category tiles and the A–Z library), and at ~880 KB it must not outrank
    // the card fragments the first screen is waiting for.
    const res = await fetch('tools-index.json', { priority: 'low' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    INDEX = await res.json();
  } catch (err) {
    try {
      // Absolute-path retry, for the pages that serve this from a subdirectory.
      const res = await fetch('/tools-index.json', { priority: 'low' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      INDEX = await res.json();
    } catch (e) {
      console.error('Could not load tools-index.json', e);
      return;
    }
  }

  filtered = [...INDEX.tools];
  renderFeatured();
  renderTrending();
  renderCategories();
  renderAlphaJump();
  renderPage();
  setupSearch();
  handleUrlParams();
}

// The search boxes this page can ship. `#tool-search` is the homepage hero box
// (and the one home-app.js now resolves too), `#mainSearchInput` the older id,
// `#stickySearchInput` the command bar. Every box gets the same behaviour.
const SEARCH_INPUT_IDS = ['tool-search', 'mainSearchInput', 'stickySearchInput'];

function searchInputs() {
  return SEARCH_INPUT_IDS.map(id => document.getElementById(id)).filter(Boolean);
}

// home-app.js is the interactive catalogue: it renders the matching tools as
// cards that actually run, and it counts matches over title + description +
// category (plus a fuzzy pass). This module counts over title + description +
// category + tags. Two lists from two field sets disagree — "7 tools" above
// "Found 4 tools" below, on the same page, for the same query — so when the
// grid is live it is the single results surface and this module stands aside.
// When the grid app is missing (blocked, failed, old cache) the static list
// below still answers the query exactly as it always did.
function gridOwnsResults() {
  // Not merely "the app object exists": home-app.js creates that as it parses,
  // long before the catalogue lands. The grid owns the results only once it has
  // tools to filter — if its catalogue fetch failed or is still out, this
  // module must keep answering or a search would return nothing at all.
  try {
    const cards = window.__mpHome && window.__mpHome.state && window.__mpHome.state.allCards;
    return Array.isArray(cards) && cards.length > 0;
  } catch { return false; }
}

function cardHTML(t) {
  const url = t.url || `tool.html?card=${encodeURIComponent(t.slug)}`;
  const tags = (t.tags || []).slice(0, 2).map(tag => `<span class="tool-tag">#${escapeHtml(tag)}</span>`).join('');
  return `
    <a class="tool-card" href="${escapeHtml(url)}" title="${escapeHtml(t.title)}">
      <div class="tool-card-header">
        <h3 class="tool-card-title">${escapeHtml(t.title)}</h3>
        <span class="tool-cat-badge">${escapeHtml(t.categoryName || t.category)}</span>
      </div>
      <p class="tool-card-desc">${escapeHtml(t.description)}</p>
      <div class="tool-card-footer">
        <div class="tool-tags">${tags}</div>
        <span class="run-btn">Launch →</span>
      </div>
    </a>`;
}

function renderFeatured() {
  const el = document.getElementById('featured');
  if (!el || !INDEX) return;
  const featuredTools = INDEX.tools.filter(t => t.featured);
  const list = featuredTools.length >= 8 ? featuredTools.slice(0, 8) : INDEX.tools.slice(0, 8);
  el.innerHTML = list.map(cardHTML).join('');
}

function renderTrending() {
  const el = document.getElementById('trending');
  if (!el || !INDEX) return;
  const trendingTools = [...INDEX.tools]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 6);
  el.innerHTML = trendingTools.map(cardHTML).join('');
}

function renderCategories() {
  const el = document.getElementById('categories');
  if (!el || !INDEX) return;
  el.innerHTML = INDEX.categories.map(c => `
    <a class="cat-card" href="categories/${escapeHtml(c.slug)}.html" title="Explore ${escapeHtml(c.name)} tools">
      <div class="cat-card-top">
        <span class="cat-icon">${c.icon || '📁'}</span>
        <span class="cat-count">${c.count} tools</span>
      </div>
      <h3 class="cat-name">${escapeHtml(c.name)}</h3>
    </a>
  `).join('');
}

function setupSearch() {
  const inputs = searchInputs();
  const resultsContainer = document.getElementById('search-results');
  const browseSections = document.querySelectorAll('.discovery-browse-section');
  if (!inputs.length || !INDEX) return;

  const hasDashboard = !!document.getElementById('dashboard');
  const clearResults = () => {
    if (!resultsContainer) return;
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
  };

  const runSearch = (raw) => {
    const value = String(raw == null ? '' : raw);
    // One query, every box. Setting .value never fires an input event, so this
    // cannot loop with the listeners below (or with home-app.js's own sync).
    // When the interactive grid exists, we sync values but avoid aggressive
    // hiding — home-app.js is the primary results surface for cards that run.
    inputs.forEach(el => { if (el.value !== value) el.value = value; });
    const q = value.trim().toLowerCase();

    if (!q) {
      clearResults();
      browseSections.forEach(s => s.style.display = '');
      filtered = [...INDEX.tools];
      currentLetter = 'ALL';
      updateAlphaButtons();
      page = 1;
      renderPage();
      return;
    }

    filtered = INDEX.tools.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.categoryName && t.categoryName.toLowerCase().includes(q)) ||
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
    );

    // ---- Instrumentation: log every search, zero-result is the goldmine ----
    try { mpLogSearch(q, filtered.length); } catch {}

    if (gridOwnsResults() || hasDashboard) {
      // The grid below answers this query with tools that run. When the
      // dashboard exists, keep browse chrome visible — the dashboard cards
      // are the primary filtered view, and hiding featured/trending/categories
      // on every keystroke was disorienting. Only hide when standalone
      // (no dashboard, e.g., tools-index.html).
      if (!hasDashboard) {
        browseSections.forEach(s => s.style.display = 'none');
      }
      clearResults();
    } else if (resultsContainer) {
      browseSections.forEach(s => s.style.display = 'none');
      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = `
        <div class="search-summary">
          <h2>Search Results: <strong>${filtered.length}</strong> ${filtered.length === 1 ? 'tool' : 'tools'} matching "${escapeHtml(q)}"</h2>
          <button class="clear-search-btn" id="clearSearchBtn">Clear Search ✕</button>
        </div>
        <div class="card-grid">
          ${filtered.length > 0 ? filtered.slice(0, 48).map(cardHTML).join('') : '<p class="no-results">No tools found matching your query. Try searching for "calculator", "finance", "converter", or "timer".</p>'}
        </div>
      `;
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const first = searchInputs()[0];
          if (!first) return;
          first.value = '';
          first.dispatchEvent(new Event('input', { bubbles: true }));
          first.focus();
        });
      }
    }

    page = 1;
    renderPage();
  };

  let timer;
  inputs.forEach(el => el.addEventListener('input', (e) => {
    // When dashboard exists, let home-app own the primary search for
    // tool-search and stickySearchInput; discovery only updates its
    // A-Z pagination. This prevents double filtering and race.
    const isPrimarySearch = hasDashboard && (e.target.id === 'tool-search' || e.target.id === 'stickySearchInput');
    if (isPrimarySearch) {
      clearTimeout(timer);
      const value = e.target.value;
      timer = setTimeout(() => {
        // Still update our own filtered list for the A-Z section
        const q = value.trim().toLowerCase();
        if (!q) {
          filtered = [...INDEX.tools];
        } else {
          filtered = INDEX.tools.filter(t =>
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            (t.categoryName && t.categoryName.toLowerCase().includes(q)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
          );
        }
        page = 1;
        renderPage();
      }, 120);
      return;
    }
    clearTimeout(timer);
    const value = e.target.value;
    timer = setTimeout(() => runSearch(value), 120);
  }));

  // Popular chips — trigger both surfaces
  document.querySelectorAll('.popular-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.query || chip.textContent.trim();
      const first = inputs[0];
      if (!first) return;
      first.value = q;
      // Dispatch input so both home-app and discovery-app react
      first.dispatchEvent(new Event('input', { bubbles: true }));
      // Also dispatch on sticky if it exists for home-app sync
      const sticky = document.getElementById('stickySearchInput');
      if (sticky && sticky !== first) {
        sticky.value = q;
        sticky.dispatchEvent(new Event('input', { bubbles: true }));
      }
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function renderAlphaJump() {
  const el = document.getElementById('alpha-jump');
  if (!el || !INDEX) return;
  const letters = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  el.innerHTML = letters.map(L =>
    `<button class="alpha-btn ${L === currentLetter ? 'active' : ''}" data-letter="${L}">${L}</button>`
  ).join('');

  el.addEventListener('click', e => {
    const btn = e.target.closest('button[data-letter]');
    if (!btn) return;
    const L = btn.dataset.letter;
    currentLetter = L;
    updateAlphaButtons();

    if (L === 'ALL') {
      filtered = [...INDEX.tools];
    } else {
      filtered = INDEX.tools.filter(t => {
        const clean = t.title.replace(/^[^\w]+/, '').toUpperCase();
        return clean.startsWith(L);
      });
    }
    page = 1;
    renderPage();
  });
}

function updateAlphaButtons() {
  document.querySelectorAll('#alpha-jump .alpha-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.letter === currentLetter);
  });
}

function renderPage() {
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const container = document.getElementById('all-tools');
  if (!container) return;

  if (slice.length === 0) {
    container.innerHTML = `<div class="empty-list-msg" style="padding:24px;text-align:center;color:var(--text-secondary);">No tools found matching this letter.</div>`;
  } else {
    container.innerHTML = slice.map(t => {
      const url = t.url || `tool.html?card=${encodeURIComponent(t.slug)}`;
      return `
        <a class="tool-row" href="${escapeHtml(url)}">
          <div class="tool-row-main">
            <span class="tool-row-title">${escapeHtml(t.title)}</span>
            <span class="tool-row-desc">${escapeHtml(t.description)}</span>
          </div>
          <span class="tool-cat">${escapeHtml(t.categoryName || t.category)}</span>
        </a>`;
    }).join('');
  }

  const total = Math.ceil(filtered.length / PAGE_SIZE);
  const pagEl = document.getElementById('pagination');
  if (!pagEl) return;

  if (total <= 1) {
    pagEl.innerHTML = '';
    return;
  }

  let btns = [];
  if (page > 1) {
    btns.push(`<button class="pag-btn" data-page="${page - 1}">← Prev</button>`);
  }

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= page - 2 && i <= page + 2)) {
      btns.push(`<button class="pag-btn ${i === page ? 'active' : ''}" ${i === page ? 'aria-current="page"' : ''} data-page="${i}">${i}</button>`);
    } else if (btns[btns.length - 1] !== '<span class="pag-ellipsis">…</span>') {
      btns.push('<span class="pag-ellipsis">…</span>');
    }
  }

  if (page < total) {
    btns.push(`<button class="pag-btn" data-page="${page + 1}">Next →</button>`);
  }

  pagEl.innerHTML = btns.join('');
  pagEl.onclick = e => {
    const btn = e.target.closest('button[data-page]');
    if (btn) {
      page = +btn.dataset.page;
      renderPage();
      const allToolsSection = document.getElementById('all-tools-section');
      if (allToolsSection) {
        allToolsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
}

function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || params.get('search');
  const cat = params.get('cat') || params.get('category');

  if (q) {
    const input = searchInputs()[0];
    if (input) {
      input.value = q;
      // Bubbling, so a page that also listens higher up sees the deep link.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else if (cat) {
    const catSlug = cat.toLowerCase();
    filtered = INDEX.tools.filter(t => t.category === catSlug || (t.categoryName && t.categoryName.toLowerCase().includes(catSlug)));
    page = 1;
    renderPage();
    const allToolsSection = document.getElementById('all-tools-section');
    if (allToolsSection) {
      allToolsSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadIndex);
} else {
  loadIndex();
}
