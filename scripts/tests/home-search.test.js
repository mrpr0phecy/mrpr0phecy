// Drives the REAL search wiring shipped in home-app.js and discovery-app.js —
// the two systems the homepage's search boxes are plugged into — in a vm with
// DOM stubs. Zero dependencies (node only). No browser required.
//
//   node scripts/tests/home-search.test.js
//
// Why this exists (all three were live defects on the shipped homepage, found
// by loading index.html in a DOM and typing into it):
//
//   1. home-app.js looked for `#mainSearchInput`. index.html's hero box has
//      been `#tool-search` since the discovery layout, so every lookup
//      returned null: the hero box never filtered the grid ("Search Results:
//      7 tools" from discovery-app.js above "Showing all 1194 tools" from the
//      grid below), it never synced with the sticky command bar, `?q=` could
//      not fill it, and description enrichment never fired on focus.
//   2. The `/` shortcut called `.focus()` on that same null lookup and threw
//      `TypeError: Cannot read properties of null` on every press — and it
//      also swallowed the keystroke from anyone typing a `/` into a tool.
//   3. applyFiltersCore() built its two status messages with innerHTML out of
//      the raw query, which `?q=` controls. `?q=<img src=x onerror=…>` landed
//      in #resultsCountText as a real element — CONSTRAINTS.md hard line 4,
//      and exactly the sink scripts/tests/index-deeplink.test.js asserts the
//      deep-link applier does not have.
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const NL = String.fromCharCode(10);
const APP = fs.readFileSync('home-app.js', 'utf8');
const DISCOVERY = fs.readFileSync('discovery-app.js', 'utf8');

// Extract a top-level 4-space-indented function by its closing line.
const grab = (src, name) => {
  const start = src.indexOf('function ' + name + '(');
  assert(start !== -1, 'could not find ' + name);
  const endMark = NL + '    }' + NL;
  const end = src.indexOf(endMark, start);
  assert(end !== -1, 'could not find the end of ' + name);
  return src.slice(start, end + endMark.length);
};

// ---------------------------------------------------------------- DOM stubs
// A node that records what was written to it. innerHTML is recorded, not
// refused: the assertion is that nobody writes to it.
function makeEl(id) {
  const el = {
    id: id || '',
    tagName: 'DIV',
    children: [],
    style: {},
    dataset: {},
    listeners: {},
    _html: null,
    htmlWrites: 0,
    append(...nodes) { el.children.push(...nodes); },
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    dispatch() {},
    focus() { el.focused = true; },
    scrollIntoView() {},
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      return el.children
        .map(c => (typeof c === 'string' ? c : c.textContent))
        .join('');
    },
    set(v) { el.children = [String(v)]; },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html === null ? el.textContent : el._html; },
    // Counted only when content goes in: clearing a container is not a write.
    set(v) { el._html = String(v); if (el._html) el.htmlWrites += 1; },
  });
  return el;
}

function makeDocument(elements) {
  return {
    elements,
    created: [],
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { const el = makeEl(); el.tagName = String(tag).toUpperCase(); this.created.push(el); return el; },
    querySelectorAll(sel) {
      if (sel === '.card') return [];          // no cards: every match count is 0
      if (sel === '.cat-pill') return [];
      return [];
    },
    addEventListener() {},
  };
}

// ===================================================================== 1/5
// The resolver: `#tool-search` (the shipped hero box) wins, the older
// `#mainSearchInput` (indexbeta.html) still works, and neither is a crash.
{
  // The shipped id order, read out of the source rather than retyped here.
  const idsMatch = APP.match(/const MAIN_SEARCH_IDS = (\[[^\]]*\]);/);
  assert(idsMatch, 'MAIN_SEARCH_IDS must be declared in home-app.js');
  const ctx = vm.createContext({ console, MAIN_SEARCH_IDS: JSON.parse(idsMatch[1].replace(/'/g, '"')) });
  vm.runInContext(grab(APP, 'getMainSearchInput'), ctx);
  const resolve = vm.runInContext('getMainSearchInput', ctx);

  const hero = makeEl('tool-search');
  const legacy = makeEl('mainSearchInput');

  ctx.document = { getElementById: id => ({ 'tool-search': hero, 'mainSearchInput': legacy }[id] || null) };
  assert.strictEqual(resolve(), hero, 'the shipped hero box must resolve first');

  ctx.document = { getElementById: id => (id === 'mainSearchInput' ? legacy : null) };
  assert.strictEqual(resolve(), legacy, 'the older id must still resolve');

  ctx.document = { getElementById: () => null };
  assert.strictEqual(resolve(), null, 'no box on the page is null, never a throw');
  console.log('  ok   getMainSearchInput resolves #tool-search, then #mainSearchInput, else null');
}

// ===================================================================== 2/5
// The `/` shortcut must not fire while the visitor is typing inside a tool,
// and must not throw when the page has no search box at all.
{
  const ctx = vm.createContext({ console });
  vm.runInContext(grab(APP, 'isTypingTarget'), ctx);
  const typing = vm.runInContext('isTypingTarget', ctx);

  const vectors = [
    [{ tagName: 'INPUT', type: 'text' }, true],
    [{ tagName: 'INPUT', type: 'search' }, true],
    [{ tagName: 'INPUT' }, true],                       // type defaults to text
    [{ tagName: 'TEXTAREA' }, true],
    [{ tagName: 'DIV', isContentEditable: true }, true],
    [{ tagName: 'SELECT' }, true],
    [{ tagName: 'INPUT', type: 'checkbox' }, false],
    [{ tagName: 'INPUT', type: 'range' }, false],
    [{ tagName: 'BUTTON' }, false],
    [{ tagName: 'BODY' }, false],
    [{ tagName: 'A' }, false],
    [null, false],
    [undefined, false],
  ];
  for (const [el, want] of vectors) {
    assert.strictEqual(typing(el), want, 'isTypingTarget(' + JSON.stringify(el) + ')');
  }
  console.log('  ok   isTypingTarget: ' + vectors.length + ' vectors — a "/" typed into a tool stays in the tool');

  // The shipped shortcut itself: guarded, and it prefers the resolved box.
  const handler = APP.slice(APP.indexOf("else if (e.key === '/'"));
  const branch = handler.slice(0, handler.indexOf(NL + '            }') + 14);
  assert(branch.includes('isTypingTarget(document.activeElement)'),
    'the / shortcut must skip editable fields');
  assert(branch.includes('mainSearchInput || stickySearchInput'),
    'the / shortcut must fall back to the command bar box');
  assert(/\bif \(searchTarget\)/.test(branch),
    'the / shortcut must not call .focus() on a null lookup');
  console.log('  ok   the "/" shortcut is null-safe and never steals a keystroke from a tool');
}

// ===================================================================== 3/5
// applyFiltersCore() — the real function — must build both status messages
// without an HTML sink, in the plain "no matches" path and in the
// "did you mean" path.
{
  const src = [
    grab(APP, 'levenshtein'),
    grab(APP, 'fuzzyWordMatch'),
    grab(APP, 'findDidYouMean'),
    grab(APP, 'getMainSearchInput'),
    grab(APP, 'applyFiltersCore'),
  ].join(NL);

  const run = (query, { category = 'all' } = {}) => {
    const resultsCountEl = makeEl('resultsCountText');
    const noResultsState = makeEl('noResultsState');
    const noResultsMsg = makeEl('noResultsMsg');
    const elements = { resultsCountText: resultsCountEl, noResultsState, noResultsMsg };
    const document = makeDocument(elements);

    const ctx = vm.createContext({
      console, Map, String, Number, Array, Object, JSON, Math,
      document,
      MAIN_SEARCH_IDS: ['tool-search', 'mainSearchInput'],
      window: {},
      // One tool, so a near-miss query has something to suggest.
      allCards: ['bmi'],
      cardsMetaMap: new Map([['bmi', { title: 'BMI Calculator', description: 'Body mass index', category: 'Health & Fitness' }]]),
      currentSearchQuery: query,
      currentSelectedCategory: category,
      currentSort: 'default',
      currentViewMode: 'cards',
      directoryDirty: false,
      isSearching: false,
      lastMatchedNames: [],
      mpLogSearch() {},
      renderDirectoryList() {},
      resetWarmWindow() {},
      scheduleViewportSweep() {},
      performSearch() {},
    });
    vm.runInContext(src, ctx);
    vm.runInContext('applyFiltersCore()', ctx);
    return { resultsCountEl, noResultsState, noResultsMsg, document };
  };

  const PAYLOAD = '<img src=x onerror=window.__pwned=1>';

  // (a) the count line, straight from a URL-controlled query
  const a = run(PAYLOAD);
  assert.strictEqual(a.resultsCountEl.htmlWrites, 0, 'resultsCountText must never be written with innerHTML');
  assert.strictEqual(a.document.created.filter(e => e.tagName === 'IMG').length, 0,
    'no element may be created out of the query');
  assert(a.resultsCountEl.textContent.includes(PAYLOAD),
    'the query must still be shown, as text: ' + JSON.stringify(a.resultsCountEl.textContent));
  assert(a.resultsCountEl.textContent.includes('Found 0 tools matching'),
    'the count line keeps its shape: ' + JSON.stringify(a.resultsCountEl.textContent));

  // (b) the same query with a category filter on
  const b = run(PAYLOAD, { category: 'Health & Fitness' });
  assert.strictEqual(b.resultsCountEl.htmlWrites, 0);
  assert(b.resultsCountEl.textContent.includes(' in Health & Fitness'),
    'the category is shown as text: ' + JSON.stringify(b.resultsCountEl.textContent));

  // (c) the "did you mean" branch — the suggestion is a cards.json string, so
  // it is the other half of hard line 4. 'bmx' matches nothing but is one
  // edit away from a real title word.
  const c = run('bmx');
  const link = c.document.created.find(e => e.id === 'didYouMeanLink');
  assert(link, 'a near-miss must offer a suggestion link');
  assert.strictEqual(link.textContent, 'bmi', 'the suggestion is the card title word, as text');
  assert.strictEqual(c.noResultsMsg.htmlWrites, 0, 'noResultsMsg must never be written with innerHTML');
  assert(c.noResultsMsg.textContent.includes('Did you mean'), 'the sentence still reads the same');
  assert.strictEqual(c.document.created.filter(e => e.tagName === 'IMG').length, 0);

  // (d) no suggestion: the plain sentence, and the query in it as text
  const d = run(PAYLOAD);
  assert.strictEqual(d.noResultsMsg.htmlWrites, 0);
  assert(d.noResultsMsg.textContent.includes(PAYLOAD), 'the query is echoed as text, not markup');

  // (e) a suggestion click still drives the real search
  const e = run('bmx');
  const eLink = e.document.created.find(x => x.id === 'didYouMeanLink');
  let clicked = 0;
  eLink.listeners.click.forEach(fn => fn({ preventDefault() { clicked += 1; } }));
  assert.strictEqual(clicked, 1, 'the suggestion link must stay clickable');

  console.log('  ok   applyFiltersCore builds both status messages with DOM APIs (5 vectors)');
}

// ===================================================================== 4/5
// No bare `mainSearchInput` lookups may survive outside the resolver, or the
// homepage silently loses its hero box again the next time one is added.
{
  const bare = APP.split("document.getElementById('mainSearchInput')").length - 1;
  assert.strictEqual(bare, 0,
    'no direct #mainSearchInput lookup may survive — every lookup goes through the resolver');
  assert(/const MAIN_SEARCH_IDS = \['tool-search', 'mainSearchInput'\];/.test(APP),
    'the resolver must try the shipped hero id first');
  const uses = APP.split('getMainSearchInput()').length - 1;
  assert(uses >= 5, 'the resolver must be used by the sticky bar, the listeners, the deep link and the suggestion (' + uses + ')');
  console.log('  ok   every search-box lookup goes through one resolver (' + uses + ' call sites)');
}

// ===================================================================== 5/5
// discovery-app.js — the browse chrome's own search. One query for every box,
// and no second results list while the interactive grid is live.
{
  const INDEX = {
    version: 'test',
    count: 3,
    categories: [{ slug: 'finance-and-money', name: 'Finance & Money', count: 2, icon: '💰' }],
    tools: [
      { slug: 'mortgage', title: '💷 Mortgage Calculator', description: 'Monthly payment', category: 'finance-and-money', categoryName: 'Finance & Money', tags: ['loan'], popularity: 9000, featured: true, url: 'tool.html?card=mortgage' },
      { slug: 'loan', title: '💵 Loan Calculator', description: 'Repayment schedule', category: 'finance-and-money', categoryName: 'Finance & Money', tags: ['credit'], popularity: 8000, featured: false, url: 'tool.html?card=loan' },
      { slug: 'bmi', title: '⚖️ BMI', description: 'Body mass index', category: 'health-and-fitness', categoryName: 'Health & Fitness', tags: ['weight'], popularity: 7000, featured: false, url: 'tool.html?card=bmi' },
    ],
  };

  const runDiscovery = async ({ gridLive, gridEmpty = false }) => {
    const elements = {};
    ['featured', 'trending', 'categories', 'alpha-jump', 'all-tools', 'pagination',
     'search-results', 'tool-search', 'stickySearchInput'].forEach(id => { elements[id] = makeEl(id); });
    const browse = [makeEl('browse')];
    const listeners = {};
    const document = {
      readyState: 'complete',
      getElementById: id => elements[id] || null,
      createElement: () => makeEl(),
      querySelectorAll(sel) {
        if (sel === '.discovery-browse-section') return browse;
        return [];
      },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    };
    const win = {
      innerWidth: 1280,
      location: { search: '' },
      gtag: undefined,
      __mpDiscoveryInstrumentation: undefined,
    };
    if (gridLive) {
      // home-app.js publishes live state accessors; the grid only owns the
      // results once the catalogue has actually landed.
      win.__mpHome = { ready: true, state: { allCards: gridEmpty ? [] : INDEX.tools.map(t => t.slug) } };
    }

    const store = {};
    const ctx = vm.createContext({
      console, document, window: win, JSON, Math, Object, Array, String, Number, Set,
      URLSearchParams, Event: function Event(type) { this.type = type; },
      setTimeout, clearTimeout,
      localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
      sessionStorage: { setItem() {}, getItem: () => null },
      fetch: async () => ({ ok: true, json: async () => INDEX }),
    });
    vm.runInContext(DISCOVERY, ctx, { filename: 'discovery-app.js' });
    await new Promise(r => setTimeout(r, 20));   // loadIndex() is async

    return { elements, browse, ctx };
  };

  const type = async ({ elements }, value) => {
    const box = elements['tool-search'];
    box.listeners.input.forEach(fn => fn({ target: { value } }));
    await new Promise(r => setTimeout(r, 200));  // the shipped 120 ms debounce
  };

  (async () => {
    // (a) grid live: the grid is the single results surface
    const live = await runDiscovery({ gridLive: true });
    assert(live.elements['featured'].innerHTML.includes('Mortgage Calculator'),
      'featured still renders from tools-index.json');
    await type(live, 'loan');
    assert.strictEqual(live.elements['search-results'].htmlWrites, 0,
      'no second results list while the interactive grid is live');
    assert.strictEqual(live.elements['search-results'].textContent, '',
      'and nothing stale is left in it');
    assert.strictEqual(live.browse[0].style.display, 'none',
      'the browse chrome gets out of the way so the filtered grid is the answer');
    assert.strictEqual(live.elements['stickySearchInput'].value, 'loan',
      'one query, every box on the page');
    console.log('  ok   discovery stands aside when the grid is live (no duplicate, contradicting list)');

    // (b) grid absent: the static list still answers, exactly as before
    const alone = await runDiscovery({ gridLive: false });
    await type(alone, 'loan');
    assert(alone.elements['search-results'].innerHTML.includes('Search Results'),
      'the fallback list renders');
    assert(alone.elements['search-results'].innerHTML.includes('tool.html?card=loan'),
      'and it links the matches');
    console.log('  ok   discovery still answers on its own when the grid app is missing');

    // (c) the app object exists but its catalogue never landed: search must
    // still answer, or a failed fetch would take the search box down with it
    const starved = await runDiscovery({ gridLive: true, gridEmpty: true });
    await type(starved, 'loan');
    assert(starved.elements['search-results'].innerHTML.includes('Search Results'),
      'an empty grid does not get to own the results');
    console.log('  ok   discovery still answers when the grid app loaded but its catalogue did not');

    // (d) clearing the query restores the browse chrome
    await type(alone, '');
    assert.strictEqual(alone.browse[0].style.display, '', 'browse sections come back');
    assert.strictEqual(alone.elements['search-results'].textContent, '', 'results are cleared');
    console.log('  ok   clearing the query restores the browse sections');

    // (e) the fetch is not allowed to outrank the first screen
    assert(DISCOVERY.includes("fetch('tools-index.json', { priority: 'low' })"),
      'tools-index.json must be fetched at low priority');
    const loader = DISCOVERY.slice(DISCOVERY.indexOf('async function loadIndex()'),
      DISCOVERY.indexOf('const SEARCH_INPUT_IDS'));
    assert.strictEqual(loader.split('if (!res.ok) throw').length - 1, 2,
      'both index fetches must refuse a non-200 instead of parsing it as JSON');
    console.log('  ok   tools-index.json is low priority and a failed response is not parsed');

    console.log(NL + 'home search tests passed');
  })().catch(err => { console.error(err); process.exit(1); });
}
