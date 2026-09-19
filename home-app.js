    // Shared version of the page's own assets. The stylesheets and scripts are
    // requested with ?v=<this>; sw.js's CACHE_VERSION must match, because a page
    // from one deploy must never run against another deploy's CSS or JS
    // (scripts/check-critical-css.py compares all three).
    const APP_VERSION = 13;

    // ===== CONFIGURATION =====
    const CONFIG = {
        INITIAL_LOAD: 6,        // floor for the first batch; computeInitialBatch() derives the rest from the grid (see DENSITY)
        INITIAL_STAGGER: 18,    // ms between first-batch fetch starts. MAX_CONCURRENT_LOADS already
                                // caps the work in flight, and the head bootstrap has
                                // usually downloaded the first screen's fragments
                                // before this runs, so a long stagger only delayed the
                                // cards below the first one.
        FETCH_TIMEOUT: 15000,   // ms before a card fetch is aborted and its slot freed
        MAX_AUTO_RETRIES: 2,    // silent retries before the card shows its error/Retry UI
        AUTO_RETRY_LIMIT: 3,    // extra scroll-driven retries per failed card before it rests for a manual Retry
                                // The mount window: how many tools the grid carries at once. A *layout*
                                // ceiling, not a fetch ceiling and not a liveness ceiling — a tool
                                // mounted outside the window is parked with its state intact, and the
                                // fetches have their own concurrency below. The frame-budget governor
                                // walks the window between MIN and MAX when long frames cluster (and
                                // back up once the page goes quiet).
        MOUNT_WINDOW_DEFAULT: 24,
        MOUNT_WINDOW_MIN: 10,
        MOUNT_WINDOW_MAX: 40,
        PARK_CEILING: 64,       // parked tools to tolerate before the JS heap is asked
                                // whether it wants any back. Parking is the cheapest way to
                                // keep 1,194 tools running, so eviction is a last resort.
        LONG_FRAME_MS: 80,      // one long animation frame this long counts as pressure.
        WARM_CONCURRENCY: 3,    // background fragment downloads (bytes only — no DOM, no
                                // script). Kept under MAX_CONCURRENT_LOADS - 1 so a warm
                                // fetch can never delay a tool the visitor is looking at.
        WARM_TIMEOUT: 12000,    // a stalled warm fetch must free its slot, not hold one
        WARM_LOOKBEHIND: 6,     // how far above the top of the screen a reversed
                                // warm pass starts, so scrolling back up finds its
                                // bytes cached instead of fetching them again
        PARK_COLLAPSE: true,    // a parked row hands its height back and becomes a
                                // tile again; the scroll offset is corrected for it
                                // (see HOLDING THE READING POSITION). `?park=full`
                                // keeps the row claimed instead.
        REMOUNT_LOOKAHEAD: 600, // the observer's look-ahead in px, and the single
                                // source of truth for "close enough to be live":
                                // both the observer and the park margin read it, so
                                // the dead band between them cannot vanish.
        CARD_CACHE_MAX: 96,     // in-memory fragments (~1.5 MB). The service worker's
                                // CARDS_CACHE is the durable tier, so pruning here is a
                                // demotion, not a re-download.
        GITHUB_REPO: 'mrpr0phecy/mrpr0phecy',
        GITHUB_PATH: 'cards',
        STICKY_THRESHOLD: 200
    };

    // ===== DENSITY =====
    // A catalogue of 1,194 tools is not a list you scroll: at one tool per
    // row, ~330 px each, the grid was over 400,000 px long — several hundred
    // screens — and everything below the first few rows was out of reach.
    // This table decides how many tools a screen holds, and it is the same fact
    // the CSS is written against —
    // `min`/`row`/`gap` mirror `repeat(auto-fill, minmax(<min>, 1fr))`, the row
    // height and the gap in home.css. Changing one without the other makes the
    // loader mount tools for a grid that is not there.
    const DENSITY = {
        // narrow* mirror the `@media (max-width: 560px)` override in home.css:
        // a phone gets 150px tiles and an 8px gutter, so a screen there is
        // still ~2 tools wide rather than a lone column of tiles.
        mosaic: { min: 212, row: 176, gap: 12, cap: 24, narrowAt: 560, narrowMin: 150, narrowGap: 8 },
        focus:  { min: 980, row: 330, gap: 24, cap: 12, narrowAt: 0, narrowMin: 980, narrowGap: 24 }
    };
    const DENSITY_DEFAULT = 'mosaic';
    
    // ===== STATE MANAGEMENT =====
    let allCards = [];
    let loadedCards = new Set();
    let loadingCards = new Set();
    let cardCache = new Map();
    let observer = null;
    let isSearching = false;
    let cardRatings = {};
    let toolboxCards = [];
    let toolboxMode = 'grid'; // 'grid' or 'list'
    let expandedGridCards = new Set();
    let expandedListCards = new Set();
    // Grid density ('mosaic' | 'focus'), and whether the visitor has asked for
    // every tool to run. explicitRunAll is the only thing that lifts the mount
    // window (and it turns parking off, since "run all" means *on the grid*) —
    // an opt-in is not the same as the page guessing.
    // Read from storage at declaration time: the first screen's batch size is
    // derived from the density, and reading it later means answering that
    // question for the wrong grid.
    let currentDensity = savedDensity();
    let explicitRunAll = false;
    
    // Background themes
    const themes = {
        'default': { bg1: '#0a0f14', bg2: '#141e28' },
        'deep-blue': { bg1: '#05080c', bg2: '#0f151f' },
        'deep-purple': { bg1: '#12081a', bg2: '#1f1229' },
        'deep-teal': { bg1: '#061616', bg2: '#0f2525' },
        'deep-red': { bg1: '#160606', bg2: '#251010' },
        'deep-forest': { bg1: '#081408', bg2: '#152015' },
        'deep-space': { bg1: '#000814', bg2: '#1a1a2e' }
    };
    
    // ===== INITIALIZATION =====
    let isAppInitialized = false;
    function initApp() {
        if (isAppInitialized) return;
        isAppInitialized = true;
        console.log('🚀 The Most Useful Site - Loading...');
        // Density before anything measures the grid: buildCatalogue() asks
        // computeInitialBatch() how big a screenful is, and a reflow between
        // the answer and the paint would make it the wrong answer.
        applyDensity(currentDensity);
        loadRatings();
        loadCardList();
        setupEventListeners();
        setupStickyCommandBar();
        initReaderMode();
        // Modern platform features
        registerServiceWorker();
        setupNavigationAPI();
        setupScrollEnd();
        // Panels, toolbox, modal and the directory view: ~40 KB that nothing on
        // the first screen needs. Fetched at idle (or by the first click that
        // wants one of them) instead of compiling before the first tools.
        scheduleFeatureBundle();
        assignVTNames();
        postTask(() => updateSpeculationRules());
        // Observe popover close to sync active states
        document.querySelectorAll('[popover]').forEach(pop => {
            pop.addEventListener('toggle', (e) => {
                if (e.newState === 'closed') {
                    document.querySelectorAll('.sticky-action-btn').forEach(btn => btn.classList.remove('active'));
                }
            });
        });
        applySavedSettings();
        setupMobileOptimizations();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp, { once: true });
    } else {
        initApp();
    }
    
    // ===== MOBILE OPTIMIZATIONS =====
    function setupMobileOptimizations() {
        // Detect touch devices
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isTouchDevice) {
            // Add touch-specific optimizations
            document.body.classList.add('touch-device');
            
            // Increase button tap targets for mobile
            const style = document.createElement('style');
            style.textContent = `
                @media (max-width: 768px) {
                    .card-action-btn, .rating-btn, .embed-btn, .grid-mode-card-btn, .list-mode-item-btn {
                        min-height: 44px;
                        min-width: 44px;
                    }
                    
                    .card-sandbox input, .card-sandbox button, .card-sandbox select {
                        font-size: 16px !important;
                        min-height: 44px !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // ===== STICKY COMMAND BAR =====
    function setupStickyCommandBar() {
        const stickyBar = document.getElementById('stickyCommandBar');
        const mainSearchInput = document.getElementById('mainSearchInput');
        const stickySearchInput = document.getElementById('stickySearchInput');
        
        // Sync search inputs. NOTE: no performSearch() here — the debounced
        // 'input' listeners in setupEventListeners() already fire the search.
        // Calling it here as well ran the full 1223-card filter pass twice
        // per keystroke (once instantly, once debounced).
        if (mainSearchInput && stickySearchInput) {
            mainSearchInput.addEventListener('input', (e) => {
                stickySearchInput.value = e.target.value;
            });
            
            stickySearchInput.addEventListener('input', (e) => {
                mainSearchInput.value = e.target.value;
            });
        }
        
        // Handle scroll to show/hide sticky bar
        let lastScrollTop = 0;
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > CONFIG.STICKY_THRESHOLD) {
                stickyBar.classList.add('show');
            } else {
                stickyBar.classList.remove('show');
            }
            
            lastScrollTop = scrollTop;
            onScrollLazyLoad();
        }, { passive: true });
    }
    
    // ===== ON-DEMAND FEATURE BUNDLE =====
    // Panels, toolbox, maximise modal and the directory view are ~36 KB of the
    // app that no first screen needs. They live in home-features.js, fetched
    // after the first cards are on their way (or immediately if something asks
    // for a feature first) — loading it with the app meant every visitor
    // compiled it before the first tool appeared.
    //
    // `state` below is a live view of this file's own variables: getters and
    // setters, not copies, so both files always see one value. `fn` exposes the
    // core functions the bundle calls. `features` is filled by the bundle.
    const mpHome = window.__mpHome = {
        features: {},
        fn: {},
        state: {},
        queued: [],
        ready: false,
        loaded: false
    };
    Object.assign(mpHome.fn, {
        showNotification, loadCard, getCardRating, saveRatings, transformCardScript,
        withViewTransition
    });

    // Calls that only ever want the latest value (a filter pass re-renders the
    // directory list, a resize re-lays the grid) must not pile up in the queue
    // while the bundle is still downloading.
    const FEATURE_COALESCE = new Set(['renderDirectoryList', 'updateGridLayout', 'setViewMode']);

    function loadFeatures() {
        if (mpHome.loaded) return;
        mpHome.loaded = true;
        const script = document.createElement('script');
        script.src = `home-features.js?v=${APP_VERSION}`;
        script.async = true;
        // Low priority: this is never urgent, and on a slow connection it must
        // not compete with the card fragments the visitor is waiting for.
        script.fetchPriority = 'low';
        script.onerror = () => { mpHome.failed = true; };
        document.head.appendChild(script);
    }

    // The bundle is not needed to paint or scroll the grid, so it is fetched
    // once the browser is idle (with a deadline, so a busy page still gets it).
    function scheduleFeatureBundle() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(loadFeatures, { timeout: 2500 });
        } else {
            setTimeout(loadFeatures, 1500);
        }
    }

    function callFeature(name, args) {
        const fn = mpHome.features[name];
        if (fn) {
            fn.apply(null, args);
            return;
        }
        // The visitor reached a feature before the bundle landed (or it failed):
        // fetch it now and remember the call, replayed in order on arrival.
        if (FEATURE_COALESCE.has(name)) {
            for (const entry of mpHome.queued) {
                if (entry[0] === name) {
                    entry[1] = args;
                    loadFeatures();
                    return;
                }
            }
        }
        mpHome.queued.push([name, args]);
        loadFeatures();
    }

    // ===== DELEGATES INTO home-features.js =====
    // Same names, same signatures: every call site below (and every listener
    // already attached to a card) keeps working, whether the bundle has landed
    // yet or not. scripts/tests/app-split.test.js fails if one of these loses
    // its registration in the bundle.
    // Reader mode is the one "sticky bar" control that is page chrome rather
    // than an on-demand panel: it restyles every card, so it stays in the core
    // and is wired by initApp() instead of travelling with the panels.
    function initReaderMode() {
            // Reader mode toggle - FIXED VERSION
            document.getElementById('stickyReaderToggle').addEventListener('click', () => {
                const isReaderMode = document.body.classList.toggle('reader-mode');
                document.getElementById('stickyReaderToggle').classList.toggle('active', isReaderMode);
                localStorage.setItem('readerMode', isReaderMode ? 'on' : 'off');
            
                // Force reflow and update card heights
                setTimeout(() => {
                    document.querySelectorAll('.card').forEach(card => {
                        adjustCardHeight(card);
                    });
                }, 50);
            
                showNotification(isReaderMode ? 
                    'Reader mode enabled - Cards full width & height' : 
                    'Reader mode disabled - Grid view', 'info');
            });
    }

    function updateGridLayout() { callFeature('updateGridLayout', arguments); }
    function setViewMode(mode) { callFeature('setViewMode', arguments); }
    function renderDirectoryList(names) { callFeature('renderDirectoryList', arguments); }
    function handleDirectoryGridClick(event) { callFeature('handleDirectoryGridClick', arguments); }
    function openStandaloneModal(cardName) { callFeature('openStandaloneModal', arguments); }
    function rateCard(cardName, action) { callFeature('rateCard', arguments); }
    function copyEmbedCode(cardName) { callFeature('copyEmbedCode', arguments); }
    function addCardToToolbox(name, contentHTML, mode, slug) {
        callFeature('addCardToToolbox', arguments);
    }

    // ===== LOADER CONTROLS THAT STAYED IN THE CORE =====
    // These sit between the moved blocks in the original file but are
    // core: the pipeline they drive is here, and nothing loads them.

    // Queue every visible, not-yet-loaded card at once. The existing pipeline
    // stays in charge (nearest-first, MAX_CONCURRENT_LOADS at a time), so the
    // page never blocks — cards simply go live continuously. No loading UI
    // exists any more: faces swap to live tools as each fragment arrives.
    //
    // This is also the only thing that lifts the mount window permanently: the
    // grid then keeps every tool it mounts, because that is what was asked for,
    // and parking one back would be the page second-guessing the request. The
    // window exists because a tool on the grid costs a layout and possibly a
    // requestAnimationFrame loop for the rest of the visit, and the page cannot
    // know which of 1,194 tools matter to you; clicking ⚡ is you telling it.
    function loadAllToolsNow() {
        explicitRunAll = true;
        let queued = 0;
        document.querySelectorAll('.card[data-name]:not(.loaded)').forEach(card => {
            const name = card.dataset.name;
            if (!name || loadedCards.has(name) || loadingCards.has(name)) return;
            if (card.dataset.errorReason || isCardHidden(card)) return;
            loadCard(card, name);
            queued++;
        });
        showNotification(
            queued > 0
                ? `Running all ${queued} tools — each card goes live as it arrives`
                : 'Every tool on the page is already live',
            'success'
        );
    }


    // ===== THE WINDOW AND THE PARK =====
    // "Every tool running" and "a browser cannot run 1,194 tools" are only a
    // contradiction if running means *laid out with its content in the grid*. It
    // does not have to. Mounting a tool is the expensive, irreversible part —
    // the fragment is parsed, its script has run, its state exists. What costs
    // the visible page anything is layout and paint of that content. So the grid
    // carries a WINDOW, and any mounted tool outside the window is PARKED: its
    // content subtree moves into one off-screen, `visibility:hidden` container
    // that keeps the tool in the document — alive, laid out, measurable,
    // queryable by its own getElementById calls, holding every value the visitor
    // typed — while the visible page pays for nothing.
    //
    //   tile    no tool DOM at all (its bytes are usually warm: see warm-ahead)
    //   live    mounted in the grid, inside the mount window
    //   parked  mounted, content off the grid, state intact; waking it up is one
    //           appendChild, not a fetch, a parse, a script and a lost form
    //
    // The shell stays exactly where it is; only its height changes, and that is
    // paid for rather than ignored. A parked row collapsing from a 900 px tool to
    // a 172 px tile would take 700 px of document away *somewhere above the
    // viewport*, and the pixels the visitor is reading would slide down — a jump,
    // on every park, in the one place scroll anchoring is not guaranteed to help.
    // So the pass measures the row, mutates it, measures it again, and hands the
    // scroll offset back the difference in the same frame (see HOLDING THE READING
    // POSITION). That buys the dense page and the stable one at once: a parked tool
    // is a tile again — the grid looks the same where the reader has been as where
    // they are — and waking it is the same arithmetic in reverse, with no
    // re-measuring, because the row is pinned to the height it left at.
    // `content-visibility: auto` then skips the layout of any of these boxes that
    // is off screen anyway, and `?park=full` opts out of the collapse.
    //
    // Only three things decide who is live: the viewport, one memory signal, and
    // intent — a tool someone is pointing at or typing into is never parked out
    // from under them. `?park=off` turns the whole idea off (everything mounted
    // stays on the grid, which is the literal "all of them, where I left them")
    // and so does ⚡ Run all, which is the same thing asked for on purpose.
    //
    // PARK_MARGIN_VH is the hysteresis and must stay wider than the observer's
    // look-ahead: parked at 1.5 viewports away, remounted within
    // CONFIG.REMOUNT_LOOKAHEAD, so a card on the boundary cannot oscillate. On a
    // 900px screen that is a 750px dead band — and on a 400px window, where 1.5
    // viewports falls *inside* the look-ahead, parkMargin() keeps the band open
    // instead of letting two passes fight over one row.
    const PARK_MARGIN_VH = 1.5;

    function parkMargin(viewportH) {
        return Math.max(viewportH * PARK_MARGIN_VH,
                        CONFIG.REMOUNT_LOOKAHEAD + 100);
    }
    // Scrolling is the only thing that moves the window, so the pass is triggered
    // by a scroll *step* rather than by a frame: measuring a windowful of rects
    // 60 times a second is exactly the layout bill this page exists to avoid. A
    // pass that found nothing pushes the next one further away (up to a screen
    // and a half), because the answer cannot have changed much in between.
    const PARK_STEP = 240;
    const PARK_STEP_MAX = 900;
    let lastParkScrollY = -Infinity;
    let parkStep = PARK_STEP;
    let parkMode = true;
    let collapsePark = CONFIG.PARK_COLLAPSE;
    // Whether the visitor is the one moving the page right now. Set by
    // initTouchGuard(), and consulted by collapsing().
    let touchActive = false;
    let mountWindow = CONFIG.MOUNT_WINDOW_DEFAULT;
    let parkCeiling = CONFIG.PARK_CEILING;
    const parkedCards = new Map();   // name -> { card, holder, anims }
    let parkOrder = [];              // parked longest-ago first (eviction order)
    let lastLongFrame = 0;
    // -Infinity, not 0: the limiter compares against performance.now(), and a
    // page two seconds old would otherwise be told it had just shrunk. The first
    // dropped frame after the initial mount is the one most worth answering.
    let lastShrink = -Infinity;

    // Created on the first park, not in the markup: a page nobody scrolls past
    // the first window never needs it. Styled in home.css — deliberately NOT in
    // the deferred sheet, because a park that briefly lacks its `visibility` rule
    // flashes a pile of tools over the page.
    function parkHost() {
        let host = document.getElementById('mp-park');
        if (!host) {
            host = document.createElement('div');
            host.id = 'mp-park';
            // Off the visible page but NOT `display: none`: the subtree stays
            // laid out and measurable, so a tool that sizes its own canvas from
            // clientWidth keeps valid numbers while it waits (and one that read 0
            // would stay broken forever). `visibility:hidden` is what takes it out
            // of painting, the a11y tree and the tab order.
            host.setAttribute('aria-hidden', 'true');
            document.body.appendChild(host);
        }
        return host;
    }

    // A parked tool is nearly free to keep; destroying one is the only
    // destructive thing this page does, so it happens only when the browser
    // itself says the heap is under pressure.
    function memoryPressure() {
        try {
            const mem = performance && performance.memory;
            if (!mem || !mem.jsHeapSizeLimit) return false;
            return mem.usedJSHeapSize > Math.min(mem.jsHeapSizeLimit * 0.6, 320 * 1024 * 1024);
        } catch (err) {
            return false;   // no signal: keep everything parked
        }
    }

    // Low-memory devices get a smaller window and a shallower park: a parked tool
    // is still a couple of hundred DOM nodes, and "hundreds of them" means
    // something different on a 1 GB phone. deviceMemory is Chromium-only and
    // coarse; no signal means the desktop default, not zero.
    function deviceBudget() {
        let mem = 0;
        try { mem = Number(navigator.deviceMemory) || 0; } catch (err) { /* unsupported */ }
        if (!mem) return { window: CONFIG.MOUNT_WINDOW_DEFAULT, park: CONFIG.PARK_CEILING };
        if (mem <= 1) return { window: 10, park: 20 };
        if (mem <= 2) return { window: 16, park: 32 };
        return { window: CONFIG.MOUNT_WINDOW_DEFAULT, park: CONFIG.PARK_CEILING };
    }

    function initLiveWindow() {
        const budget = deviceBudget();
        mountWindow = budget.window;
        parkCeiling = budget.park;
        initFrameGovernor();
        initTouchGuard();
    }

    // Three passive listeners, once, for one fact the park cannot infer from a
    // scroll event: whether the page is being moved by a finger. `touchend` alone
    // is not enough — a cancelled touch does not always fire it, and a stuck
    // `touchActive` would disable the collapse for the rest of the visit.
    function initTouchGuard() {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        try {
            document.addEventListener('touchstart', () => { touchActive = true; }, { passive: true });
            const done = () => { touchActive = false; };
            document.addEventListener('touchend', done, { passive: true });
            document.addEventListener('touchcancel', done, { passive: true });
        } catch (err) { /* no listeners: the collapse still works, unguarded */ }
    }

    // A frame-budget governor that reads the browser instead of guessing:
    // long-animation-frame entries are the page admitting it missed a frame. When
    // they cluster, the window narrows; it grows back on the next quiet park pass,
    // so there is no polling and no timer.
    function noteLongFrame() {
        const now = performance.now();
        lastLongFrame = now;
        if (now - lastShrink < 5000 || mountWindow <= CONFIG.MOUNT_WINDOW_MIN) return;
        lastShrink = now;
        mountWindow = Math.max(CONFIG.MOUNT_WINDOW_MIN, mountWindow - 4);
        invalidateParkPass();
        scheduleViewportSweep();
    }

    let governorHasLoAF = false;
    let frameProbed = false;

    function initFrameGovernor() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            const po = new PerformanceObserver(list => {
                let worst = 0;
                for (const entry of list.getEntries()) worst = Math.max(worst, entry.duration || 0);
                if (worst < CONFIG.LONG_FRAME_MS) return;
                noteLongFrame();
            });
            po.observe({ type: 'long-animation-frame', buffered: false });
            governorHasLoAF = true;
        } catch (err) { /* no LoAF: the fallback probe below is the governor */ }
    }

    // Safari and Firefox publish no long-animation-frame entries, and "the
    // governor is off there" is not the same as "the window is safe there" — it
    // would mean an iPhone gets the desktop's 40 mounted tools with no way back.
    // So where LoAF is missing, each pass asks for one frame and times how long
    // the browser took to come back: a timestamp, which is the same fact LoAF
    // reports, one level coarser. Being coarse is why it only shrinks on a gross
    // miss (double the threshold) and why it never runs at all when the real
    // signal is available.
    function probeFrames() {
        if (governorHasLoAF || frameProbed || typeof requestAnimationFrame !== 'function') return;
        frameProbed = true;
        const askedAt = performance.now();
        requestAnimationFrame(() => {
            frameProbed = false;
            if (performance.now() - askedAt >= CONFIG.LONG_FRAME_MS * 2) noteLongFrame();
        });
    }

    function growWindowBack() {
        if (mountWindow >= CONFIG.MOUNT_WINDOW_MAX) return;
        if (performance.now() - lastLongFrame < 20000) return;
        mountWindow += 2;
    }

    // Never park the tool someone is in the middle of using.
    function keepAlive(card) {
        if (!card) return true;
        if (card.dataset.keep === '1') return true;
        try {
            if (card.matches(':hover')) return true;
            if (document.activeElement && card.contains(document.activeElement)) return true;
        } catch (err) { /* a nicety, not a gate: failure means "parkable" */ }
        return false;
    }

    const FACE_HINT_RUN = 'Click to run';
    const FACE_HINT_PARKED = 'Still running — click to bring it back';
    function setFaceHint(card, parked) {
        const hint = card.querySelector('.card-face-hint');
        if (!hint) return;
        const text = (hint.textContent || '').trim();
        // The hint only, and only if this page wrote it: the description and the
        // aria-label keep telling the truth either way, and a card that wrote its
        // own face keeps its own words.
        if (parked ? text === FACE_HINT_RUN : text === FACE_HINT_PARKED) {
            hint.textContent = parked ? FACE_HINT_PARKED : FACE_HINT_RUN;
        }
    }

    // A parked tool keeps running — that is the deal — but "keeps running" does
    // not have to mean "keeps repainting nothing". Every animation on an invisible
    // subtree is pure waste, and `getAnimations()` is the one pause that is fully
    // reversible and needs no cooperation from the card. What this deliberately
    // does *not* touch is a tool driving its own requestAnimationFrame loop: that
    // is the visitor's code, and stealing frames from it is how a page starts
    // lying about being live. Measured over the shipped fragments, 134 animate in
    // CSS and go quiet here, 168 run their own loop and do not — the park is a
    // layout and paint guarantee, not a CPU one. Returns the paused set so the wake-up can replay it,
    // or null when there was nothing to pause (or no API to ask).
    function pauseParkedAnimations(holder) {
        if (!holder || typeof holder.getAnimations !== 'function') return null;
        const paused = [];
        try {
            for (const anim of holder.getAnimations({ subtree: true })) {
                if (anim.playState === 'running') {
                    anim.pause();
                    paused.push(anim);
                }
            }
        } catch (err) {
            // An engine that only half-supports this must not cost us the park.
            return paused.length ? paused : null;
        }
        return paused.length ? paused : null;
    }

    // ===== HOLDING THE READING POSITION =====
    // Parking takes a row's height away and mounting gives one back. Below the
    // fold that is free; above it, it is the classic infinite-scroll jump, and both
    // sides need the same treatment because a parked tool is woken from the
    // look-ahead band *above* the reader's eyes too. So the page does the
    // arithmetic an engine might have done: measure, mutate, measure, then move
    // scrollY by the difference — inside the requestAnimationFrame the sweep already
    // runs in, which is where a browser wants a compensating scroll, so no frame is
    // ever painted at the uncorrected offset.
    //
    // Only rows entirely above the fold qualify: a row straddling the top edge is
    // being looked at, and moving the page under it would be the jump itself.
    let scrollHold = 0;
    let holdBatch = 0;

    // Whether the page may move the scroll position at all. A finger that is
    // still flinging the page owns it: a programmatic scroll mid-momentum is at
    // best ignored and at worst stops the fling dead, and a correction that cannot
    // be applied is worse than none. So while a touch is down nothing is
    // compensated — and since a park only collapses in order to be compensated,
    // the park defers the collapse too (the next pass, a frame after the finger
    // lifts, will). `touchActive` is about who owns scrollY; `collapsePark` is
    // about whether a row is allowed to change height. They are two questions and
    // they must not be answered by one flag: a tool *mounting* above the fold
    // grows its row whether or not parking collapses anything, and that needs the
    // same correction (see renderCardContent) with only the first question asked.
    function canHoldScroll() {
        return !touchActive;
    }

    function collapsing() {
        return collapsePark && canHoldScroll();
    }

    function aboveTheFold(card) {
        if (!canHoldScroll() || typeof card.getBoundingClientRect !== 'function') return null;
        const rect = card.getBoundingClientRect();
        return rect.bottom <= 0 ? rect.height : null;
    }

    // `before` is null when this row could not move the page, 0 when it had no
    // height; either way there is nothing to hand back.
    function noteRowHeight(card, before) {
        if (!before || typeof card.getBoundingClientRect !== 'function') return;
        const after = card.getBoundingClientRect().height;
        const delta = before - after;
        if (Math.abs(delta) < 8) return;   // sub-row churn is not a jump
        scrollHold += delta;               // > 0: the document got shorter
        if (!holdBatch) commitScrollHold();
    }

    // A pass may change a dozen rows; batching keeps that from becoming a dozen
    // scroll events, each of which would schedule another sweep.
    function beginHold() { holdBatch++; }
    function endHold() {
        holdBatch = holdBatch > 0 ? holdBatch - 1 : 0;
        if (!holdBatch) commitScrollHold();
    }

    function commitScrollHold() {
        const shift = scrollHold;
        scrollHold = 0;
        const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
        if (!shift || typeof window.scrollTo !== 'function') return;
        const target = Math.max(0, Math.round(scrollY - shift));
        if (target === Math.round(scrollY)) return;
        try { window.scrollTo(0, target); } catch (err) { /* nothing to correct */ }
        // The document moved under a reader whose pixels did not, so anything that
        // reads the raw offset has to be re-anchored or it will misread the
        // correction as motion: the park pass would fire again for nothing, and the
        // warm walk would decide the reader had turned around mid-page.
        lastParkScrollY = target;
        lastWarmScrollY = target;
    }

    function parkCard(card, cardName) {
        const sandbox = card.querySelector(`#card-${cardName}`);
        if (!sandbox) return false;
        const holder = document.createElement('div');
        holder.className = 'parked-tool';
        holder.dataset.name = cardName;
        // Match the width the tool was laid out at, so nothing inside it has to
        // re-wrap while it waits (a canvas-sized tool would otherwise resize to
        // the park's own width and could shrink permanently).
        const sandboxW = Math.round(sandbox.getBoundingClientRect().width);
        // The row's height is pinned by adjustCardHeight() as an inline min-height
        // on the content, and an inline style outranks the tile rules — so a
        // collapse has to take it with it. It is stored, not discarded: the way
        // back restores the exact height the tool left at, without measuring a
        // sandbox that holds nothing but a face at that moment.
        const content = card.querySelector('.card-content');
        const before = aboveTheFold(card);
        const pinned = content ? content.style.minHeight : '';
        const collapseNow = collapsing();
        const host = parkHost();
        if (sandboxW > 0 && Math.abs((parseInt(host.style.width, 10) || 0) - sandboxW) > 2) {
            host.style.width = `${sandboxW}px`;
        }
        // Everything that belongs to the tool moves — its content, the <style>s
        // it injected, any script nodes — except the face, which is what the grid
        // shows while the tool waits. (Styles still apply document-wide from in
        // here; `visibility` never disabled a stylesheet.)
        const face = sandbox.querySelector('.card-face');
        Array.from(sandbox.children).forEach(node => {
            if (node !== face) holder.appendChild(node);
        });
        host.appendChild(holder);
        card.classList.remove('loaded');
        card.classList.add('card-parked');
        card.dataset.parked = '1';
        if (collapseNow) {
            if (content) content.style.minHeight = '';
            card.classList.add('card-pending');
            if (pinned) card.dataset.parkedMinHeight = pinned;
            noteRowHeight(card, before);
        }
        // The face is what a parked row shows: the row keeps its size, so this
        // has to look like something, and "still here" is the honest answer.
        if (face) face.hidden = false;
        setFaceHint(card, true);
        loadedCards.delete(cardName);
        parkedCards.set(cardName, { card, holder, anims: pauseParkedAnimations(holder) });
        parkOrder.push(cardName);
        // Armed for the way back: the observer wakes it as soon as it is within
        // look-ahead, and the sweep can too (a parked card is not `.loaded`).
        if (observer) observer.observe(card);
        if (!pendingCards.includes(card)) pendingCards.push(card);
        return true;
    }

    function resumeParked(card, cardName) {
        const parked = parkedCards.get(cardName);
        if (!parked) return false;
        const target = card || parked.card;
        const sandbox = target.querySelector(`#card-${cardName}`);
        if (!sandbox) return false;
        parkedCards.delete(cardName);
        parkOrder = parkOrder.filter(n => n !== cardName);
        Array.from(parked.holder.children).forEach(node => sandbox.appendChild(node));
        parked.holder.remove();
        // Frames back: paused *after* the nodes are home, so nothing animates in
        // the gap between the two moves.
        if (parked.anims) {
            for (const anim of parked.anims) {
                try { anim.play(); } catch (err) { /* the animation has gone away */ }
            }
        }
        const face = sandbox.querySelector('.card-face');
        if (face) face.hidden = true;
        const growBefore = aboveTheFold(target);
        target.classList.remove('card-parked');
        target.classList.remove('card-pending');
        target.classList.add('loaded');
        delete target.dataset.parked;
        // The height it left at, back verbatim: no re-measure, because a parked
        // sandbox holds only a face and would measure as one.
        const back = target.querySelector('.card-content');
        if (back && target.dataset.parkedMinHeight) {
            back.style.minHeight = target.dataset.parkedMinHeight;
        }
        delete target.dataset.parkedMinHeight;
        noteRowHeight(target, growBefore);
        setFaceHint(target, false);
        loadedCards.add(cardName);
        if (observer) observer.unobserve(target);
        // No height work: the row kept its size the whole time, which is the
        // point of parking. The counter needs telling, though — a wake-up never
        // goes through renderCardContent, where updateSiteStats() would have done
        // it — and the sweep needs one look at the geometry that came back.
        updateLiveCount();
        scheduleViewportSweep();
        return true;
    }

    // Oldest-parked first, and only when the heap asks for it. This is the one
    // path that loses a tool's state, so it is guarded by a real memory signal
    // rather than by a count the page finds convenient.
    function prunePark() {
        if (parkedCards.size <= parkCeiling || !memoryPressure()) return;
        const target = Math.floor(parkCeiling * 0.7);
        while (parkedCards.size > target && parkOrder.length) {
            const name = parkOrder.shift();
            const parked = parkedCards.get(name);
            if (!parked) continue;
            parkedCards.delete(name);
            // Anything this tool had animating goes with the subtree; its paused
            // animations are not resumed, because nothing is about to look at them.
            parked.holder.remove();
            // The card goes back to being an ordinary tile (and its height with
            // it — an empty tall row would haunt the layout forever). Its bytes may
            // still be in cardCache, so a return visit re-renders in a millisecond.
            parked.card.classList.remove('card-parked');
            parked.card.classList.add('card-pending');
            delete parked.card.dataset.parked;
            const content = parked.card.querySelector('.card-content');
            if (content) content.style.minHeight = '';
            delete parked.card.dataset.parkedMinHeight;
            setFaceHint(parked.card, false);
        }
    }

    // The window pass: park what the grid no longer needs to paint. It measures
    // one rect per *live* tool — at most a windowful, which is why this can run
    // inline in a scroll sweep where walking 1,190 pending cards cannot.
    function invalidateParkPass() {
        lastParkScrollY = -Infinity;
        parkStep = PARK_STEP;
    }

    // The other half of the pass, and the half that makes this a window rather
    // than a ratchet: whatever the viewport now wants comes back. It does *not*
    // ask the mount budget, because a wake is a node move — no fetch, no parse, no
    // script, no queue slot — and holding a wake hostage to a busy budget is how a
    // tool ends up parked underneath the reader's cursor while a row they scrolled
    // past three screens ago still holds a slot. Parking in the same pass hands the
    // budget straight back, and the observer's look-ahead is smaller than the park
    // margin by construction, so a row cannot be woken and re-parked forever.
    function wakeInsideWindow(top, bottom) {
        if (!parkedCards.size) return false;
        let woke = false;
        for (const name of Array.from(parkedCards.keys())) {
            const parked = parkedCards.get(name);
            if (!parked) continue;
            const card = parked.card;
            if (!card.isConnected) {
                // A shell that left the DOM (a rebuild, an extension that rewrote
                // the grid) would otherwise keep its content in the park forever.
                parkedCards.delete(name);
                parkOrder = parkOrder.filter(n => n !== name);
                if (parked.holder) parked.holder.remove();
                continue;
            }
            if (isCardHidden(card)) continue;
            const rect = card.getBoundingClientRect();
            if (rect.bottom < top || rect.top > bottom) continue;
            if (resumeParked(card, name)) woke = true;
        }
        return woke;
    }

    function parkOutsideWindow() {
        if (!parkMode || explicitRunAll) return;
        const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
        if (Math.abs(scrollY - lastParkScrollY) < parkStep) return;
        lastParkScrollY = scrollY;
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 900;
        const margin = parkMargin(vh);
        const top = -margin;
        const bottom = vh + margin;
        let parkedAny = false;
        let wokeAny = false;
        beginHold();
        try {
            wokeAny = wakeInsideWindow(top, bottom);
            for (const name of Array.from(loadedCards)) {
                const card = cardElsByName.get(name);
                if (!card || !card.isConnected) continue;
                // Hidden by a filter: it is laying out for nobody, so it should not
                // hold a slot in the window either.
                if (!isCardHidden(card)) {
                    const rect = card.getBoundingClientRect();
                    if (rect.bottom >= top && rect.top <= bottom) continue;
                }
                if (keepAlive(card)) continue;
                if (parkCard(card, name)) parkedAny = true;
            }
            parkStep = (parkedAny || wokeAny)
                ? PARK_STEP
                : Math.min(PARK_STEP_MAX, parkStep + PARK_STEP);
            growWindowBack();
            prunePark();
        } finally {
            endHold();
        }
        if (parkedAny || wokeAny) updateLiveCount();
        // One frame of measurement per pass, and only where the real signal is
        // missing: this is the entire cost of governing a browser that cannot say
        // it dropped a frame.
        if (!governorHasLoAF) probeFrames();
    }

    // ===== WARM-AHEAD: "BYTES HERE" IS NOT "RUNNING HERE" =====
    // The old loader had one verb, so it had one problem. A card became a live
    // tool only when it was fetched, parsed AND executed, and the one pipeline
    // that did all three had to be throttled to protect scrolling — so the
    // page ran a handful of tools at a time while the other 1,185 sat as faces
    // an hour of trickling away from ever becoming real. It read like a site
    // with nine tools and a promise of a thousand.
    //
    // Two jobs, two paths:
    //
    //   MOUNT (what runs) is driven by the viewport. The observer and the
    //     sweep mount the tools a visitor can actually see, nearest first, at
    //     MAX_CONCURRENT_LOADS, under the mount window.
    //   WARM (what is downloaded) is the same window one step ahead. A warm
    //     fetch puts the fragment text into cardCache and does nothing else: no
    //     DOMParser, no script, no layout. It costs the main thread a string.
    //
    // By the time a tool reaches the screen its bytes are usually already
    // local, so mounting it is the cache branch of executeLoadCard() — a
    // millisecond, not a round trip. And because every one of these requests is
    // a `cards/*.html` GET, the service worker stores the same responses in
    // CARDS_CACHE, so what you warmed on this visit is warm on the next one.
    //
    // Deliberately not a timer over the whole catalogue: warming walks forward
    // from where the visitor is, so the bandwidth goes to the part of the page
    // they are reading. Save-Data / 2G get no warm-ahead at all — the tiles are
    // already complete without it, and a click still costs one fetch.
    let warmStarted = false;
    let warmActive = 0;
    let warmCursor = 0;
    let warmSweeping = false;
    let warmPending = false;
    // Every card element the grid has built, by catalogue slug. Unlike
    // pendingCards this is index-stable and never pruned, which is what a
    // cursor needs; the sweep prunes pendingCards underneath it.
    const cardElsByName = new Map();
    // Catalogue index by name. The warm cursor works in indices and the sweep
    // only ever has names, and 1,194 indexOf() calls per scroll frame is not how
    // to translate between them.
    const cardIndexByName = new Map();
    let warmDir = 1;
    let lastWarmScrollY = -1;

    // Worth a warm fetch right now? Anything the mount pipeline owns is skipped,
    // so a tool is never downloaded twice and never re-fetched once it runs.
    function warmEligible(cardName) {
        if (!cardName) return false;
        if (loadedCards.has(cardName) || loadingCards.has(cardName)) return false;
        // Parked tools are already mounted; warming one would download bytes that
        // are already in the DOM and throw them away.
        if (parkedCards.has(cardName)) return false;
        if (cardCache.has(cardName)) return false;
        const card = cardElsByName.get(cardName);
        if (!card || !card.isConnected) return false;
        if (card.dataset.errorReason || isCardHidden(card)) return false;
        return true;
    }

    // Started once by the grid build. Idempotent, like the trickle it replaces,
    // and gated on the same connection hints.
    function startCacheWarm() {
        if (warmStarted) return;
        try {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn && (conn.saveData || /(^|\b)(slow-)?2g\b/i.test(conn.effectiveType || ''))) return;
        } catch (err) { /* no connection info: warm on */ }
        warmStarted = true;
        pumpWarmSoon();
    }

    // Coalesced: every completed warm fetch and every viewport sweep asks for a
    // pass, and both can fire many times in one frame.
    function pumpWarmSoon() {
        if (warmPending) return;
        warmPending = true;
        setTimeout(pumpWarm, 120);
    }

    // Which way the visitor is moving, and which catalogue entry is at the top of
    // the screen: two facts the sweep already has and the warm path cannot infer.
    // Warming used to walk one way only, which is right for a catalogue you read
    // downwards and wrong for one you scroll back up through — and with a park,
    // scrolling *up* is now the normal case: waking a parked tool wants its bytes
    // from cache, and a tool that was evicted under memory pressure should cost a
    // re-render, not a download. So the cursor turns around with the reader.
    function noteReadingPosition(near) {
        if (!warmStarted || !near || !near.length) return;
        const y = (typeof window !== 'undefined' && window.scrollY) || 0;
        let dir = 0;
        if (lastWarmScrollY >= 0) {
            if (y > lastWarmScrollY + 4) dir = 1;
            else if (y < lastWarmScrollY - 4) dir = -1;
        }
        lastWarmScrollY = y;
        if (!dir) return;
        let front = Infinity;
        for (const candidate of near) {
            const i = cardIndexByName.get(candidate.cardName);
            if (i !== undefined && i < front) front = i;
        }
        if (front === Infinity) return;
        front = Math.max(0, front - CONFIG.WARM_LOOKBEHIND);
        if (dir === warmDir) return;   // already walking with the reader
        warmDir = dir;
        warmCursor = Math.min(allCards.length - 1, front);
    }

    function pumpWarm() {
        warmPending = false;
        if (!warmStarted || warmSweeping) return;
        // A hidden tab downloads nothing; the visibilitychange hook in
        // buildCatalogue() sweeps on return, which pumps us again.
        if (typeof document !== 'undefined' && document.hidden) return;
        // Mounts own the connection. If the pipeline is at (or one below) its
        // cap there is no spare bandwidth, and a tool on screen must not queue
        // behind a tool the visitor has not reached yet.
        if (activeLoads >= MAX_CONCURRENT_LOADS - 1) return;
        const total = allCards.length;
        if (!total) return;
        warmSweeping = true;
        let queued = 0;
        try {
            // The walk follows `warmDir`: forward down the catalogue, backward up
            // it. `warmCursor` is the next index to take either way, so a reversal
            // needs no second cursor and no bookkeeping about what was skipped.
            while (warmActive < CONFIG.WARM_CONCURRENCY && warmCursor >= 0 && warmCursor < total) {
                const cardName = allCards[warmCursor];
                warmCursor += warmDir;
                if (warmEligible(cardName)) {
                    queued++;
                    warmCard(cardName);
                }
            }
            if (warmCursor < 0 || warmCursor >= total) {
                // Ran off an end: turn around and give the other side a turn —
                // tools the cursor walked past while a filter was hiding them (or
                // that just arrived) are still owed a look. A pass that queues
                // nothing at an end means the catalogue is warm, so walking 1,194
                // names stops there: `resetWarmWindow()` (a filter, a sort, a
                // density change) is what re-arms it, and the service worker's
                // CARDS_CACHE is what makes a later miss cheap regardless.
                warmDir = -warmDir;
                warmCursor = warmDir > 0 ? 0 : total - 1;
                if (queued === 0) warmStarted = false;
            }
        } finally {
            warmSweeping = false;
        }
    }

    function warmCard(cardName) {
        warmActive++;
        const meta = cardsMetaMap.get(cardName);
        const url = (meta && meta.path) || `cards/${cardName}.html`;
        fetchTextWithTimeout(url, CONFIG.WARM_TIMEOUT).then(html => {
            if (typeof html === 'string' && html.length > 0) rememberWarmed(cardName, html);
        }).catch(() => { /* a card that will not warm stays a readable face */ })
          .finally(() => {
            warmActive--;
            // Never pump synchronously from here: the last completion of a
            // batch would re-enter the loop that queued it.
            pumpWarmSoon();
        });
    }

    // The memory half of the bargain — a warm catalogue must not become 18 MB
    // of strings. Oldest-not-running first; CARDS_CACHE is the durable tier, so
    // a dropped entry is a hit one level down, not a new request.
    function rememberWarmed(cardName, html) {
        if (cardCache.size >= CONFIG.CARD_CACHE_MAX && !cardCache.has(cardName)) pruneCardCache();
        cardCache.set(cardName, { html: html, timestamp: Date.now() });
    }

    function pruneCardCache() {
        const target = Math.floor(CONFIG.CARD_CACHE_MAX * 0.75);
        for (const key of Array.from(cardCache.keys())) {
            if (cardCache.size <= target) break;
            // A parked tool dropped from the cache would have to be re-rendered if
            // it is ever evicted, so it is protected like a live one.
            if (loadedCards.has(key) || loadingCards.has(key) || parkedCards.has(key)) continue;
            cardCache.delete(key);
        }
    }

    // A filter, a sort or a density change moves what "ahead of the visitor"
    // means, so the cursor restarts and warms the new result from its top.
    function resetWarmWindow() {
        warmCursor = 0;
        warmDir = 1;
        if (!warmStarted) { startCacheWarm(); return; }
        pumpWarmSoon();
    }

    // ===== MOUNT BUDGET =====
    // Tools the page has committed to putting *on the grid*: rendered, in flight
    // or queued. Only the automatic paths consult it — a click is not a guess —
    // and parked tools do not count against it, which is what lets the page hold
    // the whole catalogue without holding the whole page.
    function liveMountCount() {
        return loadedCards.size + loadingCards.size + loadQueue.length;
    }

    function mountBudgetFree() {
        if (explicitRunAll || !parkMode) return true;
        return liveMountCount() < mountWindow;
    }

    // ===== GRID DENSITY =====
    // Mosaic is the default and is what makes "1,194 tools on one page" true on
    // a screen: a tool that is not running is a tile, not a 330 px row. Focus
    // is the old one-per-row reading stack, remembered per visitor. Because the
    // dense layout is what CSS gives a page without JS, the class only ever
    // *adds* the wide single-column mode (`.density-focus`) — no scripting and
    // you still get the whole catalogue, densely.
    function savedDensity() {
        try {
            const saved = localStorage.getItem('density');
            return DENSITY[saved] ? saved : DENSITY_DEFAULT;
        } catch (err) {
            return DENSITY_DEFAULT;
        }
    }

    // Pure: this is the geometry that decides how many tools a screen holds, and
    // therefore how many the loader starts without being asked. Driven directly
    // by scripts/tests/live-window.test.js.
    function gridMetrics(viewportH, containerW, density) {
        const m = DENSITY[density] || DENSITY[DENSITY_DEFAULT];
        const w = Math.max(280, Number(containerW) || 1200);
        const h = Math.max(320, Number(viewportH) || 900);
        const narrow = m.narrowAt > 0 && w <= m.narrowAt;
        const min = narrow ? m.narrowMin : m.min;
        const gap = narrow ? m.narrowGap : m.gap;
        const cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
        const rows = Math.max(1, Math.ceil((h + m.row) / (m.row + gap)));
        const screen = cols * rows;
        return { cols, rows, screen, batch: Math.min(m.cap, Math.max(CONFIG.INITIAL_LOAD, screen)) };
    }

    function applyDensity(mode) {
        const next = DENSITY[mode] ? mode : DENSITY_DEFAULT;
        currentDensity = next;
        const body = document.body;
        if (body) {
            body.classList.toggle('density-focus', next === 'focus');
            body.classList.toggle('density-mosaic', next !== 'focus');
        }
        document.querySelectorAll('[data-density]').forEach(btn => {
            const on = btn.dataset.density === next;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        updateLiveCount();
        return next;
    }

    function setDensity(mode) {
        const applied = applyDensity(mode);
        try { localStorage.setItem('density', applied); } catch (err) { /* private mode */ }
        // A denser grid means more tools per screen, so the window the loader
        // must fill changed with it. No heights are rewritten: row geometry is
        // CSS's job, and adjustCardHeight() only matters once a tool runs.
        resetWarmWindow();
        // A different density is a different window over the same scroll
        // position, so the park has to be re-measured even though nothing moved.
        invalidateParkPass();
        scheduleViewportSweep();
    }

    // One line of honesty in the toolbar: how much of the catalogue is running,
    // and how much of that the grid is laying out. O(1) — called after every
    // render, park and resume.
    function updateLiveCount() {
        const liveEl = document.getElementById('liveToolCount');
        if (!liveEl) return;
        const total = allCards.length;
        if (!total) return;
        const live = loadedCards.size;      // mounted in the grid right now
        const parked = parkedCards.size;   // mounted, off-grid, state intact
        const running = live + parked;     // what "running" has meant on this site
        const whole = running >= total;
        const windowed = parkMode && !explicitRunAll;
        liveEl.textContent = whole ? `all ${total} running`
            : windowed ? `${live} here · ${parked} kept alive`
            : `${running} of ${total} running`;
        // Amber means "the page is working on it", not "you have a small grid":
        // the windowed state is the healthy one, so it gets no colour at all.
        liveEl.classList.toggle('full', whole);
        liveEl.classList.toggle('capped', !whole && !windowed);
        if (whole) {
            liveEl.title = 'Every tool in the catalogue is live on this page, laid out in the grid.';
        } else if (windowed) {
            liveEl.title = `${live} tools are laid out in the grid around your viewport and ${parked} more are still running off it — parked, not closed: their state and their DOM come straight back. Everything else is a tile one fetch away. ⚡ Run all puts the whole catalogue on the grid instead, and ?park=off stops the grid ever putting one back.`;
        } else {
            liveEl.title = `${mountWindow} tools is what the grid keeps laid out around your viewport at a time. Click any tile to run it now, and ⚡ Run all mounts the whole catalogue.`;
        }
    }

    // (The toolbox itself — its modes, its grid/list renderers, its saved
    // cards — now lives in home-features.js, along with the panels it opens.)

    // ===== COLOR/THEME SYSTEM =====
    function applySavedSettings() {
        // Apply saved accent color
        const savedAccent = localStorage.getItem('accent') || '#2dd4ff';
        document.documentElement.style.setProperty('--accent', savedAccent);
        
        // Update active accent color button
        document.querySelectorAll('.palette-color').forEach(c => {
            if (c.dataset.accent === savedAccent) {
                c.classList.add('active');
            } else {
                c.classList.remove('active');
            }
        });
        
        // Apply saved theme
        const savedTheme = localStorage.getItem('theme') || 'default';
        applyTheme(savedTheme);
        
        // Update active theme button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === savedTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Apply reader mode
        if (localStorage.getItem('readerMode') === 'on') {
            document.body.classList.add('reader-mode');
            document.getElementById('stickyReaderToggle').classList.add('active');
        }
        
        // Setup event listeners for color/theme pickers
        document.querySelectorAll('.palette-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const update = () => {
                    document.querySelectorAll('.palette-color').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const color = btn.dataset.accent;
                    document.documentElement.style.setProperty('--accent', color);
                    // Update --accent-hue for @property animation
                    try {
                        const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
                        const max = Math.max(r,g,b), min = Math.min(r,g,b);
                        let h = 0;
                        if (max !== min) {
                            const d = max-min;
                            switch(max){
                                case r: h = (g-b)/d + (g<b?6:0); break;
                                case g: h = (b-r)/d + 2; break;
                                case b: h = (r-g)/d + 4; break;
                            }
                            h *= 60;
                        }
                        document.documentElement.style.setProperty('--accent-hue', h.toString());
                    } catch {}
                    localStorage.setItem('accent', color);
                    showNotification(`Accent color changed to ${color}`, 'success');
                };
                withViewTransition(update);
            });
        });
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const themeName = btn.dataset.theme;
                const update = () => {
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    applyTheme(themeName);
                };
                withViewTransition(update);
            });
        });
    }
    
    function applyTheme(themeName) {
        const theme = themes[themeName];
        if (!theme) return;
        
        // Animate glow via @property
        document.documentElement.style.setProperty('--glow-opacity', '0');
        document.body.style.background = `linear-gradient(135deg, ${theme.bg1}, ${theme.bg2})`;
        requestAnimationFrame(() => {
            document.documentElement.style.setProperty('--glow-opacity', '0.15');
        });
        
        localStorage.setItem('theme', themeName);
        showNotification(`Theme changed to ${themeName}`, 'success');
    }
    
    // ===== RATING SYSTEM =====
    function loadRatings() {
        try {
            const saved = localStorage.getItem('cardRatings');
            if (saved) {
                cardRatings = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load ratings:', error);
            cardRatings = {};
        }
    }
    
    function saveRatings() {
        try {
            localStorage.setItem('cardRatings', JSON.stringify(cardRatings));
        } catch (error) {
            console.error('Failed to save ratings:', error);
        }
    }
    
    function getCardRating(cardName) {
        if (!cardRatings[cardName]) {
            cardRatings[cardName] = {
                up: 0,
                down: 0,
                userVote: null
            };
        }
        return cardRatings[cardName];
    }
    
    function calculateRatingPercentage(cardName) {
        const rating = getCardRating(cardName);
        const total = rating.up + rating.down;
        return total === 0 ? 0 : Math.round((rating.up / total) * 100);
    }
    
    // ===== CARD LOADING SYSTEM =====
    let cardsMetaMap = new Map();
    let isCardListLoaded = false;

    // ===== Chunked placeholder construction =====
    // One frame builds PLACEHOLDER_BATCH cards. Each batch is appended as a
    // single DocumentFragment and observed immediately, so nothing waits for
    // the whole catalogue before the page becomes usable.
    const PLACEHOLDER_BATCH = 40;
    // Chunks built at full speed before the build starts yielding to the first
    // screen's own fetch/render work (3 chunks = 120 cards, well past the
    // viewport plus the loader's lookahead).
    const FIRST_SCREEN_CHUNKS = 3;
    // Upper bound on that yield, in ~16ms frames, so the catalogue tail can
    // never be starved by a page that stays busy.
    const YIELD_FRAME_LIMIT = 60;
    let initialLoadKicked = false;
    let pendingCards = [];

    // Extracts the leading emoji from a catalogue title ("🌀 3D Spirograph
    // Nebula" → "🌀") for the card face icon. Falls back to the site emoji.
    function titleEmoji(title) {
        try {
            const m = String(title || '').match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Extended_Pictographic})*)/u);
            if (m && m[1]) return m[1];
        } catch (err) { /* older engine without unicode property escapes */ }
        return '🧰';
    }

    function createPlaceholder(cardName, index) {
        const meta = cardsMetaMap.get(cardName);
        const displayName = meta && meta.title ? meta.title : cardName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const category = meta && meta.category ? meta.category : 'Productivity & Lifestyle';

        const card = document.createElement('div');
        card.className = 'card card-pending';
        card.dataset.name = cardName;
        card.dataset.index = index;
        card.dataset.displayName = displayName;
        card.dataset.category = category;
        // No data-desc: every description was being copied into a DOM attribute
        // as well, which duplicated ~190 KB of catalogue text into 1128
        // attribute writes during the build. cardsMetaMap is the single source
        // and is always populated before a placeholder exists (see applyFilters).

        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `
            <div class="card-header-info">
                <h3>${displayName}</h3>
                <span class="card-cat-badge">${category}</span>
            </div>
            <div class="card-actions">
                <button class="card-action-btn add-grid" title="Add to Grid Mode">🔲</button>
                <button class="card-action-btn add-list" title="Add to List Mode">📋</button>
                <a href="tool.html?card=${encodeURIComponent(cardName)}" target="_blank" rel="noopener" class="card-maximize-btn" title="Maximise to Standalone Tool" aria-label="Maximise ${displayName} to standalone">
                    <span class="max-icon">⛶</span>
                    <span class="max-label">Standalone</span>
                </a>
            </div>
        `;

        // The card FACE replaces the old skeleton: a finished-looking card
        // body built straight from the catalogue, so every one of the 1194
        // cards is readable the moment the grid builds — no bars, no
        // waveform, no "Loading…" anywhere. The live tool replaces this face
        // silently once its fragment arrives (or on click, right away).
        const content = document.createElement('div');
        content.className = 'card-content';
        const sandbox = document.createElement('div');
        sandbox.className = 'card-sandbox';
        sandbox.id = `card-${cardName}`;

        const face = document.createElement('div');
        face.className = 'card-face';
        face.setAttribute('role', 'button');
        face.setAttribute('tabindex', '0');
        face.setAttribute('aria-label', `Run ${displayName} now`);

        const icon = document.createElement('div');
        icon.className = 'card-face-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = titleEmoji(displayName);

        const desc = document.createElement('p');
        desc.className = 'card-face-desc';
        if (meta && meta.description) {
            desc.textContent = meta.description;
        } else {
            // Lite tier has no descriptions; refreshCardFaceDescriptions()
            // fills this in when the full catalogue lands in the background.
            desc.textContent = 'Tap to run this tool right here — nothing to install, nothing to sign up for.';
            desc.dataset.placeholder = '1';
        }

        const hint = document.createElement('div');
        hint.className = 'card-face-hint';
        hint.textContent = 'Click to run';

        face.append(icon, desc, hint);
        sandbox.appendChild(face);
        content.appendChild(sandbox);
        card.append(header, content);
        // The warm path needs a slug -> element index for the whole catalogue;
        // a placeholder is registered the moment it exists, so a filter that
        // hides it later is visible to warmEligible() without a second query.
        cardElsByName.set(cardName, card);
        return card;
    }

    // Descriptions from the full catalogue arrive after the lite-tier faces
    // are already on the page; patch the still-pending faces in one pass.
    // Loaded cards are skipped — their faces are gone, replaced by the tool.
    function refreshCardFaceDescriptions() {
        const faces = document.querySelectorAll('.card.card-pending .card-face-desc[data-placeholder]');
        faces.forEach(desc => {
            const card = desc.closest('.card');
            const meta = card && cardsMetaMap.get(card.dataset.name);
            if (meta && meta.description) {
                desc.textContent = meta.description;
                delete desc.dataset.placeholder;
            }
        });
    }

    function updateBuildProgress(done, total) {
        let bar = document.getElementById('buildProgress');
        if (done >= total) {
            if (bar) {
                bar.style.width = '100%';
                bar.style.opacity = '0';
                setTimeout(() => bar.remove(), 500);
            }
            return;
        }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'buildProgress';
            bar.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bar);
        }
        bar.style.width = ((done / total) * 100).toFixed(1) + '%';
    }

    function buildPlaceholders(cardFiles, dashboard) {
        // The generated first-screen shells are already in the DOM and already
        // adopted, so they must not be built a second time (duplicate ids in a
        // shared DOM are exactly the trap ARCHITECTURE.md §7 warns about).
        const present = new Set();
        dashboard.querySelectorAll('.card[data-name]').forEach(c => present.add(c.dataset.name));
        const toBuild = present.size ? cardFiles.filter(name => !present.has(name)) : cardFiles;
        let i = 0;
        let chunks = 0;
        let yielded = 0;

        const step = () => {
            // Once the first screen's worth of placeholders exists, the tail
            // yields while the loader pipeline is busy. Building the remaining
            // ~1100 placeholders (~17k DOM nodes) used to run *while* the
            // visible tools were still fetching, parsing and executing their
            // scripts, which is when the main thread is least spare. Bounded by
            // YIELD_FRAME_LIMIT so a continuously busy page cannot starve the
            // catalogue: worst case the build resumes ~1s later anyway.
            if (chunks >= FIRST_SCREEN_CHUNKS && yielded < YIELD_FRAME_LIMIT
                && (activeLoads > 0 || loadQueue.length > 0)) {
                yielded++;
                setTimeout(step, 16);
                return;
            }
            const end = Math.min(i + PLACEHOLDER_BATCH, toBuild.length);
            const frag = document.createDocumentFragment();
            const built = [];
            for (; i < end; i++) {
                const card = createPlaceholder(toBuild[i], i);
                frag.appendChild(card);
                built.push(card);
            }
            dashboard.appendChild(frag);
            chunks++;

            // Observe only the batch that just landed. Note there is no
            // updateCardRatingDisplay() call here: a pending placeholder has no
            // footer, so it returns immediately. The rating footer is created
            // and populated in addCardFooter() once real content arrives.
            built.forEach((card) => {
                if (observer) observer.observe(card);
                pendingCards.push(card);
            });

            // First batch is on screen — start fetching immediately rather
            // than waiting for the whole catalogue to be built. (When the
            // pre-rendered shells were adopted this already happened, before
            // cards.json landed, and the flag stops a second kick.)
            if (!initialLoadKicked) {
                initialLoadKicked = true;
                loadInitialCards();
            }

            updateBuildProgress(i, toBuild.length);
            // No viewport sweep here: every batch is observed immediately, so
            // the IntersectionObserver already covers newly visible cards.
            // Sweeping per batch re-ran getBoundingClientRect() over every
            // pending placeholder on each of ~30 build frames (~20k forced
            // layouts). One sweep after the build finishes (below) is enough.

            if (i < toBuild.length) {
                requestAnimationFrame(step);
            } else {
                // If the user searched or filtered while the index was still
                // building, cards appended after that pass were never hidden —
                // applyFilters() can only act on cards already in the DOM.
                if (isSearching) applyFilters();
                // Safety net: if the observer missed anything, scroll-driven
                // loading picks it up (replaces the old 3s polling interval).
                scrollFallbackLoader();
                // The whole catalogue is now in the DOM. Do not start mounting
                // it — that is what the viewport is for. Warm it instead: the
                // bytes come in ahead of the scroll, and every tool the visitor
                // reaches mounts from cache.
                startCacheWarm();
            }
        };
        step();
    }

    // ===== FIRST-SCREEN FAST PATH =====
    // The generated HOME-FAST-PATH block in <head> started the catalogue fetch
    // and the first few card fragments while the document was still parsing,
    // and parked the responses as promises on window.__mpFastPath. These
    // helpers consume each one exactly once — a taken entry is deleted, so
    // nothing is ever downloaded twice, and a missing/failed/slow prefetch just
    // falls through to the loader's own fetch. The fast path is an optimisation
    // only: no behaviour depends on it.
    function takePrefetchedCatalogue() {
        const fastPath = window.__mpFastPath;
        if (!fastPath || !fastPath.json) return null;
        const promise = fastPath.json;
        fastPath.json = null;
        return promise;
    }

    function takePrefetchedCard(cardName) {
        const fastPath = window.__mpFastPath;
        if (!fastPath || !fastPath.cards) return null;
        const promise = fastPath.cards.get(cardName);
        if (promise) fastPath.cards.delete(cardName);
        return promise || null;
    }

    // Resolves to the promise's value, or null once ms has passed. A
    // prefetched response cannot be aborted the way the loader's own fetch can,
    // so a stalled one is abandoned here and refetched normally below.
    function withTimeout(promise, ms) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), ms);
            promise.then(
                (value) => { clearTimeout(timer); resolve(value); },
                () => { clearTimeout(timer); resolve(null); }
            );
        });
    }

    // Abortable fetch with a hard deadline. Resolves to the body text, or
    // null on any failure/timeout — callers fall through to the next source.
    // Every catalogue request goes through this: a request that never settles
    // must cost the pipeline one timeout, never the whole grid.
    async function fetchTextWithTimeout(url, ms) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || CONFIG.FETCH_TIMEOUT) : null;
        try {
            const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
            if (!res.ok) return null;
            return await res.text();
        } catch (err) {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    // How long to wait on the head bootstrap's in-flight catalogue response
    // before fetching the file directly. The bootstrap starts the download in
    // <head>, seconds before this code runs, so 5s is generous. The wait MUST
    // exist: readCatalogueJson() sits on the critical path between the page
    // booting and buildPlaceholders() creating the other ~1180 cards, and an
    // unbounded await there (a fetch that stalls instead of failing — service
    // worker black hole, blocked request, bfcache edge case) left the grid
    // frozen at the pre-rendered first screen with no error and no retry.
    const FASTPATH_CATALOGUE_TIMEOUT = 5000;
    // Deadline for the loader's OWN catalogue requests (lite, full and the
    // GitHub API fallback). Tighter than the fragment timeout: these sit on
    // the critical path and every second spent here delays the grid. Worst
    // bounded case before the grid or the error box appears: ~5s fast-path
    // race + 10s lite + 10s full per attempt, three attempts, then the
    // GitHub fallback pages — always finite, never a silent freeze.
    const CATALOGUE_FETCH_TIMEOUT = 10000;

    // The parsed catalogue, or null. Prefers the copy the head bootstrap
    // already downloaded — raced against FASTPATH_CATALOGUE_TIMEOUT so a
    // stalled bootstrap can never hold the critical path; falls back to
    // fetching the file here. Pass bypassFastPath (set by the retry pass in
    // loadCardList) to go straight to the network.
    async function readCatalogueJson(bypassFastPath) {
        let text = null;
        if (!bypassFastPath) {
            const prefetched = takePrefetchedCatalogue();
            if (prefetched) text = await withTimeout(prefetched, FASTPATH_CATALOGUE_TIMEOUT);
        }
        if (text === null || text === undefined) {
            text = await fetchTextWithTimeout('cards/cards-lite.json', CATALOGUE_FETCH_TIMEOUT);
        }
        if (text === null || text === undefined) return null;
        try {
            return JSON.parse(text);
        } catch (err) {
            console.warn('cards-lite.json did not parse', err);
            return null;
        }
    }

    // The full catalogue (adds descriptions, which are the bulk of the file).
    // Not on the critical path: the head bootstrap starts it at low priority,
    // and search only needs it. Same consume-once contract as the lite tier.
    function takePrefetchedFullCatalogue() {
        const fastPath = window.__mpFastPath;
        if (!fastPath || !fastPath.full) return null;
        const promise = fastPath.full;
        fastPath.full = null;
        return promise;
    }

    async function readFullCatalogueJson(bypassFastPath) {
        let text = null;
        if (!bypassFastPath) {
            const prefetched = takePrefetchedFullCatalogue();
            if (prefetched) text = await withTimeout(prefetched, FASTPATH_CATALOGUE_TIMEOUT);
        }
        if (text === null || text === undefined) {
            text = await fetchTextWithTimeout('cards/cards.json', CATALOGUE_FETCH_TIMEOUT);
        }
        if (text === null || text === undefined) return null;
        try {
            return JSON.parse(text);
        } catch (err) {
            console.warn('cards.json did not parse', err);
            return null;
        }
    }

    // Drop any still-pending head-bootstrap catalogue responses so a retry
    // always goes back to the network instead of re-consuming the same
    // stalled promise. (Card fragments stay: executeLoadCard() already races
    // each with its own timeout before refetching.)
    function invalidateFastPathCatalogue() {
        const fastPath = window.__mpFastPath;
        if (!fastPath) return;
        fastPath.json = null;
        fastPath.full = null;
    }

    // Descriptions live only in the full catalogue. Merges them into
    // cardsMetaMap once the background fetch settles, and re-runs an active
    // search so title-only results upgrade to full-text without a reload.
    // Never blocks the grid: if it fails, search quietly stays title-only.
    let descriptionsEnriched = false;
    function enrichCatalogueDescriptions() {
        if (descriptionsEnriched) return;
        descriptionsEnriched = true;
        // Grid built from the full tier (fallback path)? Descriptions are
        // already in place — don't download the same file twice.
        for (const meta of cardsMetaMap.values()) {
            if (meta.description) return;
        }
        readFullCatalogueJson().then(fullData => {
            if (!Array.isArray(fullData) || fullData.length === 0) return;
            let merged = 0;
            fullData.forEach(item => {
                const name = item.name || item.id || (item.file || '').replace(/\.html$/, '');
                const meta = cardsMetaMap.get(name);
                if (!meta) return;
                if (meta.description !== item.description) {
                    meta.description = item.description;
                    merged++;
                }
                // Backfill if the lite tier was missing them (defensive —
                // the two files are generated from the same manifest).
                if (!meta.title && item.title) meta.title = item.title;
                if (!meta.category && item.category) meta.category = item.category;
            });
            console.log(`Merged ${merged} descriptions from full catalogue`);
            // Faces built from the lite tier carry a stand-in description;
            // upgrade them in place now the real text is available.
            refreshCardFaceDescriptions();
            // An active search ran against the title-only index — re-run it
            // now that descriptions are in, so results upgrade in place.
            if (merged > 0 && currentSearchQuery.trim()) applyFilters();
        }).catch(err => console.warn('Description enrichment failed; search stays title-only', err));
    }

    // Kicks enrichCatalogueDescriptions() off the critical path. Search focus
    // wins over idle so a visitor who types straight away still gets
    // full-text results as soon as the file lands (title matches show
    // immediately either way — see applyFiltersCore).
    let enrichmentScheduled = false;
    function scheduleDescriptionEnrichment() {
        if (enrichmentScheduled) return;
        enrichmentScheduled = true;
        let fired = false;
        const go = () => { if (fired) return; fired = true; enrichCatalogueDescriptions(); };
        ['mainSearchInput', 'stickySearchInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('focus', go, { once: true, passive: true });
        });
        // A deep link with ?q= searches before anyone can focus anything.
        if (currentSearchQuery && currentSearchQuery.trim()) { go(); return; }
        if ('requestIdleCallback' in window) {
            requestIdleCallback(go, { timeout: 6000 });
        } else {
            setTimeout(go, 2500);
        }
    }

    // The generated HOME-PRERENDER block already holds the first screen's cards
    // as real markup. Adopting them instead of waiting for the catalogue index
    // to rebuild them is what lets the fragments the head bootstrap fetched
    // render straight away — the first tools no longer queue behind any JSON
    // (even the ~110 KB lite tier, which only the rest of the grid needs).
    function adoptPrerenderedCards() {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return 0;
        const shells = dashboard.querySelectorAll('.card[data-name]');
        if (!shells.length) return 0;

        loadRatings();                // the rating footer is rendered with content
        initIntersectionObserver();   // re-initialised once the catalogue lands

        shells.forEach((card) => {
            const name = card.dataset.name;
            if (!name) return;
            cardElsByName.set(name, card);
            if (loadedCards.has(name) || loadingCards.has(name)) return;
            pendingCards.push(card);
        });

        if (!initialLoadKicked) {
            initialLoadKicked = true;
            loadInitialCards();
        }
        console.log(`First screen: adopted ${shells.length} pre-rendered cards`);
        return shells.length;
    }

    // Build the catalogue and start the grid. Resolves once
    // buildPlaceholders() is running (it then completes on its own); throws
    // only when every source failed, so the caller can decide whether to
    // retry or surface the error.
    async function buildCatalogue(allowFastPath) {
        console.log('Loading card list...');
        let cardFiles = [];
        
        // 1. Try the local catalogue first (instant, zero GitHub API rate
        //    limits). The critical path is the LITE tier (name/title/
        //    category, ~110 KB): the grid can build the moment it arrives,
        //    while the full tier (~548 KB, descriptions included — the
        //    bulk of the old single-file payload) keeps downloading at low
        //    priority in the background for search. readCatalogueJson()
        //    consumes the head bootstrap's in-flight response instead of
        //    asking for the file a second time — raced against a timeout,
        //    so a stalled bootstrap response cannot block the build.
        try {
            const cardsData = await readCatalogueJson(!allowFastPath);
            if (Array.isArray(cardsData) && cardsData.length > 0) {
                cardsData.forEach(item => {
                    // lite entries are {n, t, c}; description arrives via
                    // enrichCatalogueDescriptions() once the full tier settles
                    cardsMetaMap.set(item.n, { name: item.n, title: item.t, category: item.c });
                });
                cardFiles = Array.from(cardsMetaMap.keys()).sort();
                console.log(`Loaded ${cardFiles.length} cards from cards-lite.json (descriptions loading in background)`);
            }
        } catch (err) {
            console.warn('Could not load cards-lite.json, trying full cards.json...', err);
        }
        
        // 1b. Lite tier unavailable (blocked fetch, offline first visit) —
        //     fall back to the full catalogue, which has everything the
        //     lite tier does plus descriptions.
        if (cardFiles.length === 0) {
            const fullData = await readFullCatalogueJson(!allowFastPath);
            if (Array.isArray(fullData) && fullData.length > 0) {
                fullData.forEach(item => {
                    const name = item.name || item.id || item.file.replace(/\.html$/, '');
                    cardsMetaMap.set(name, item);
                });
                cardFiles = Array.from(cardsMetaMap.keys()).sort();
                console.log(`Loaded ${cardFiles.length} cards from full cards.json`);
            }
        }
        
        // 2. Fallback to GitHub API if local fetch failed. The contents
        //    API returns at most 1000 entries per request and the catalogue
        //    is larger than that, so page through until a short page proves
        //    the directory is exhausted (a single request used to silently
        //    truncate the catalogue to its first page). Each request is
        //    bounded by fetchTextWithTimeout.
        if (cardFiles.length === 0) {
            console.log('Falling back to GitHub API for card list...');
            const [owner, repo] = CONFIG.GITHUB_REPO.split('/');
            let page = 1;
            for (;;) {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${CONFIG.GITHUB_PATH}?page=${page}`;
                const body = await fetchTextWithTimeout(url, CATALOGUE_FETCH_TIMEOUT);
                if (body === null) {
                    throw new Error('GitHub API unreachable');
                }
                let data;
                try {
                    data = JSON.parse(body);
                } catch (err) {
                    throw new Error('GitHub API returned invalid JSON');
                }
                if (!Array.isArray(data) || data.length === 0) break;
                data.forEach(item => {
                    if (item.type === 'file' && item.name.endsWith('.html')) {
                        cardFiles.push(item.name.replace(/\.html$/, ''));
                    }
                });
                // A full 1000-entry page means more may follow; anything
                // short ends the directory. The cap is only a guard.
                if (data.length < 1000 || page >= 5) break;
                page++;
            }
            cardFiles.sort();
        }
        
        console.log(`Total active cards: ${cardFiles.length}`);
        allCards = cardFiles;
        cardIndexByName.clear();
        for (let i = 0; i < allCards.length; i++) cardIndexByName.set(allCards[i], i);
        lastMatchedNames = [...allCards];
        updateSiteStats();
        updateCategoryCounts();
        
        const dashboard = document.getElementById('dashboard');

        // Keep the generated first-screen shells — some are already
        // rendering real tools at this point — and remove only what has to
        // go: anonymous skeletons (no data-name) and any pre-rendered shell
        // for a tool that is no longer in the catalogue. Still done before
        // initIntersectionObserver() so the observer never sees a skeleton.
        const inCatalogue = new Set(cardFiles);
        Array.from(dashboard.children).forEach((el) => {
            const name = (el.dataset && el.dataset.name) || '';
            if (!name || !inCatalogue.has(name)) el.remove();
        });
        dashboard.removeAttribute('aria-busy');
        
        if (cardFiles.length === 0) {
            dashboard.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);">
                    <div style="font-size:48px;margin-bottom:16px;">📁</div>
                    <h3 style="color:var(--accent);margin-bottom:8px;">No cards found</h3>
                    <p style="margin:0;">Create some cards in the /cards/ directory</p>
                </div>
            `;
            return;
        }
        
        // Create card placeholders in batches across frames.
        // Building all 1165 at once blocked the main thread for seconds and
        // left the page unresponsive; the first batch now paints almost
        // immediately and the rest stream in.
        initIntersectionObserver();
        // the scroll listener already exists in setupEventListeners(); it
        // calls onScrollLazyLoad(), which routes into the throttle below
        // A resize moves the bottom edge of the window without moving the scroll
        // position, so the park pass is told to look again.
        window.addEventListener('resize', () => {
            invalidateParkPass();
            onScrollLoad();
        }, { passive: true });
        window.addEventListener('orientationchange', onScrollLoad, { passive: true });
        window.addEventListener('load', onScrollLoad, { passive: true });
        window.addEventListener('pageshow', onScrollLoad, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') onScrollLoad();
        });
        // Fonts / images landing after first paint can shift the grid.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(onScrollLoad).catch(() => {});
        buildPlaceholders(cardFiles, dashboard);
        // Documented deep links (?q=, ?expand=): applied once the
        // catalogue is ready. Never throws (see applyIndexDeepLink).
        applyIndexDeepLink();
        // The grid now runs on the lite tier; bring descriptions into
        // search in the background. A no-op when the full tier was the
        // data source (descriptions already present). Deferred: the
        // 548 KB full tier no longer competes with the first screen's
        // fragments — it starts when the browser is idle, or the instant
        // the visitor reaches for the search box, whichever is first.
        scheduleDescriptionEnrichment();
    }

    // Worst case, every attempt failed: render the retry box. Built with
    // DOM APIs — error.message comes from the network and must never be
    // interpolated into innerHTML.
    function showCatalogueError(error) {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;
        dashboard.removeAttribute('aria-busy');
        const box = document.createElement('div');
        box.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:var(--error);';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:48px;margin-bottom:16px;';
        icon.textContent = '⚠️';
        const heading = document.createElement('h3');
        heading.style.cssText = 'color:var(--error);margin-bottom:8px;';
        heading.textContent = 'Failed to load cards';
        const detail = document.createElement('p');
        detail.style.cssText = 'margin-bottom:16px;';
        detail.textContent = (error && error.message) || 'Unknown error';
        const retryBtn = document.createElement('button');
        retryBtn.style.cssText = 'padding:8px 16px;background:rgba(45,212,255,0.1);border:1px solid rgba(45,212,255,0.3);color:var(--accent);border-radius:8px;cursor:pointer;';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => location.reload());
        box.append(icon, heading, detail, retryBtn);
        dashboard.appendChild(box);
        showNotification('Failed to load cards from GitHub', 'error');
    }

    async function loadCardList() {
        if (isCardListLoaded) return;
        isCardListLoaded = true;
        // Three bounded passes. Every request inside buildCatalogue has a
        // hard deadline, so a pass always terminates — but a single hung
        // source must never silence the grid for good: pass 2 retries with
        // the head bootstrap's prefetched responses excluded (the stalled
        // fast path is the known way this page used to freeze on its first
        // screen), and pass 3 adds the GitHub API fallback. Only after all
        // three fail does the visitor see the error box with a Retry button.
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) invalidateFastPathCatalogue();
                await buildCatalogue(attempt === 1);
                return;
            } catch (error) {
                lastError = error;
                console.error(`Error loading card list (attempt ${attempt}/3):`, error);
            }
            await new Promise(r => setTimeout(r, 600 * attempt));
        }
        showCatalogueError(lastError);
    }
    
    // The first batch is a screenful of tools, whatever a screen means at the
    // density the visitor is using (gridMetrics(): mosaic is 2–6 columns of
    // tiles, focus is one tool per row). It used to be `viewport ÷ 320px,
    // capped at 12`, which in a single-column grid is six tools — a number that
    // looked a lot like "the site has six tools" once you scrolled one row.
    //
    // Twelve pre-rendered shells are still what HOME-PRERENDER ships, so the
    // first screen's worth of *cards with content in the HTML* is covered even
    // on focus; a mosaic's extra tiles are already finished-looking as tiles, so
    // waiting ~200 ms for their fragments costs nothing you can see. Queuing
    // more than a screen here would put the visible tools behind an alphabetical
    // pile of hundreds of fetches, which is the trap this function exists to
    // avoid.
    function computeInitialBatch() {
        try {
            const viewport = (typeof window !== 'undefined' && window.innerHeight) || 900;
            const width = (typeof window !== 'undefined' && window.innerWidth) || 1200;
            return gridMetrics(viewport, width, currentDensity).batch;
        } catch (err) {
            return CONFIG.INITIAL_LOAD;
        }
    }
    
    function loadInitialCards() {
        const cards = document.querySelectorAll('.card:not(.loaded)');
        const initialBatch = Array.from(cards).slice(0, computeInitialBatch());
        
        initialBatch.forEach((card, index) => {
            setTimeout(() => {
                const cardName = card.dataset.name;
                if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                    loadCard(card, cardName);
                }
            }, index * CONFIG.INITIAL_STAGGER);
        });
    }
    
    const loadQueue = [];
    let activeLoads = 0;
    // Six concurrent fetch/render jobs: the grid is one card per row, so a
    // 900px viewport plus the 600px observer look-ahead wants ~5 tools in
    // flight to stay ahead of a scroll. Four kept a free slot rare enough that
    // the viewport sweep spent most of its time measuring cards it could
    // not start. The sweep now only measures when a slot is free, so the extra
    // two jobs are the ones that actually fill the screen — the main thread
    // does less work per frame than it did with four.
    const MAX_CONCURRENT_LOADS = 6;
    const retryCounts = new Map();

    // A card hidden by the current search/category filter must never take a
    // fetch slot — but it must also not be dropped for good (see observer).
    function isCardHidden(card) {
        return card.style.display === 'none';
    }

    function loadCard(card, cardName) {
        if (loadedCards.has(cardName) || loadingCards.has(cardName)) return;
        // Parked, not lost: the tool is alive off the grid, so coming back is a
        // node move — no fetch, no parse, no script, no queue slot, and the
        // visitor's form is still full.
        if (resumeParked(card, cardName)) return;
        if (!loadQueue.some(item => item.cardName === cardName)) {
            loadQueue.push({ card, cardName });
        }
        processLoadQueue();
    }

    // FIFO meant the queue was served in alphabetical order, so scrolling to
    // the bottom still waited behind cards from the top of the page.
    function pickNearestQueued() {
        if (loadQueue.length <= 1) return loadQueue.shift();
        const centre = window.scrollY + window.innerHeight / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < loadQueue.length; i++) {
            const rect = loadQueue[i].card.getBoundingClientRect();
            const dist = Math.abs(rect.top + window.scrollY + rect.height / 2 - centre);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        return loadQueue.splice(bestIdx, 1)[0];
    }

    function processLoadQueue() {
        while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
            const item = pickNearestQueued();
            if (!item) continue;
            if (isCardHidden(item.card)) { item.card.classList.remove('loading-fallback'); continue; }
            if (!loadedCards.has(item.cardName) && !loadingCards.has(item.cardName)) {
                activeLoads++;
                executeLoadCard(item.card, item.cardName).finally(() => {
                    activeLoads--;
                    processLoadQueue();
                });
            }
        }
        // Once the pipeline drains, re-check the viewport: cards that just
        // rendered change the layout, which can pull fresh placeholders on
        // screen without any scroll event ever firing.
        if (activeLoads === 0 && loadQueue.length === 0) scheduleViewportSweep();
    }

    // No per-card loading UI any more: placeholders ship as finished card
    // faces (see createPlaceholder), so there is nothing to spin and nothing
    // that says "Loading". A queued card simply keeps its face; the live tool
    // swaps in silently when the fragment arrives.

    async function executeLoadCard(card, cardName) {
        loadingCards.add(cardName);
        
        // Check cache
        const cached = cardCache.get(cardName);
        if (cached && (Date.now() - cached.timestamp) < (15 * 60 * 1000)) {
            renderCardContent(card, cardName, cached.html);
            loadingCards.delete(cardName);
            loadedCards.add(cardName);
            if (observer) observer.unobserve(card);
            return;
        }
        
        let transientRetry = false;
        try {
            // The head bootstrap may already hold this fragment: it started
            // downloading the first screen while <head> was still parsing,
            // long before the loader would otherwise have asked for it. A
            // null/empty result (failed, blocked or too slow) just falls
            // through to the normal fetch below.
            const prefetched = takePrefetchedCard(cardName);
            if (prefetched) {
                const prefetchedHtml = await withTimeout(prefetched, CONFIG.FETCH_TIMEOUT);
                if (typeof prefetchedHtml === 'string' && prefetchedHtml.length > 0) {
                    rememberWarmed(cardName, prefetchedHtml);
                    renderCardContent(card, cardName, prefetchedHtml);
                    loadedCards.add(cardName);
                    return;   // the finally below still frees the slot + unobserves
                }
            }

            const meta = cardsMetaMap.get(cardName);
            // Lite-tier meta has no path; derive it (the generator guarantees
            // path === `cards/<name>.html`).
            const cardUrl = (meta && meta.path) || `cards/${cardName}.html`;
            // A request that never settles used to hold one of the
            // MAX_CONCURRENT_LOADS slots forever; six of those and the whole
            // page stopped loading tools. Abort after FETCH_TIMEOUT so the
            // slot is freed and the card can be retried.
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT) : null;
            let response;
            try {
                response = await fetch(cardUrl, ctrl ? { signal: ctrl.signal } : undefined);
            } finally {
                if (timer) clearTimeout(timer);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const html = await response.text();
            
            // Cache the content through the warm path's helper, so a mount and
            // a warm fetch share one cap: 1,194 fragments in memory is 18 MB,
            // and the cap is what makes warming safe to leave running.
            rememberWarmed(cardName, html);
            
            renderCardContent(card, cardName, html);
            loadedCards.add(cardName);
            
        } catch (error) {
            const isAbort = error && error.name === 'AbortError';
            console.error(`Failed to load card ${cardName}:`, error);
            retryCounts.set(cardName, (retryCounts.get(cardName) || 0) + 1);
            if (retryCounts.get(cardName) <= CONFIG.MAX_AUTO_RETRIES) {
                // Transient failure (timeout / flaky network): stay observed
                // so the observer AND the viewport sweep can both retry it.
                // (The finally block used to unobserve here, which silently
                // dropped the observer retry path for flaky cards.)
                transientRetry = true;
                card.classList.remove('loading-fallback');
                loadingCards.delete(cardName);
                setTimeout(() => { if (!loadedCards.has(cardName)) scheduleViewportSweep(); }, isAbort ? 250 : 1500);
                return;
            }
            showCardError(card, cardName, error, 'load');
            // Do NOT add to loadedCards — retryErroredCards() re-sweeps
            // visible load failures (bounded); render failures rest.
        } finally {
            loadingCards.delete(cardName);
            card.classList.remove('loading-fallback');

            if (!transientRetry && observer) {
                observer.unobserve(card);
            }
        }
    }
    
    // Card scripts are injected long after the host page has finished
    // loading, so DOMContentLoaded (and window load) never fire again for
    // them. Rewrite each registration so the handler runs one tick later
    // instead, checking readyState so this stays correct if a card ever
    // loads during initial parse.
    //
    // The wrapper takes the handler as its argument, so it works for EVERY
    // handler form — named function, anonymous function and arrow. The old
    // identifier-only regex matched bare names only; ~140 cards register
    // arrow/anonymous handlers, which stayed subscribed to a DOMContentLoaded
    // that never fires: the tool rendered but never initialised (dead
    // buttons, blank canvases) — while the same tools worked on tool.html,
    // which re-dispatches DOMContentLoaded (safe there: one card per
    // document; re-dispatching here would re-run the handlers of every
    // previously loaded card, so the per-script rewrite is used instead).
    function transformCardScript(code) {
        return code
            .replace(/document\.addEventListener\s*\(\s*(['"])DOMContentLoaded\1\s*,/g,
                '(document.readyState !== "loading" ? (h => setTimeout(h, 10)) : (h => document.addEventListener("DOMContentLoaded", h)))(')
            .replace(/window\.addEventListener\s*\(\s*(['"])load\1\s*,/g,
                '(document.readyState === "complete" ? (h => setTimeout(h, 10)) : (h => window.addEventListener("load", h)))(');
    }

    function renderCardContent(card, cardName, html) {
        const cardSandbox = card.querySelector(`#card-${cardName}`);
        if (!cardSandbox) return;
        
        try {
            // Create content container
            const contentDiv = document.createElement('div');
            contentDiv.className = 'card-sandbox-content';
            
            // Use DOMParser to safely parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract scripts before removing them from doc
            const scripts = Array.from(doc.querySelectorAll('script'));
            scripts.forEach(script => script.remove());
            
            // Extract styles before removing them from doc
            const styles = Array.from(doc.querySelectorAll('style'));
            styles.forEach(style => style.remove());
            
            // Get body content
            const bodyContent = doc.body.innerHTML;
            
            // Create a temporary div to hold content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = bodyContent;
            
            // Apply mobile optimizations to content
            optimizeContentForMobile(tempDiv);
            
            // Apply basic card styles
            tempDiv.style.cssText = `
                color: var(--text);
                font-family: inherit;
                font-size: 14px;
                line-height: 1.6;
            `;
            
            // Move all content to sandbox
            while (tempDiv.firstChild) {
                contentDiv.appendChild(tempDiv.firstChild);
            }
            
            // Clear and update sandbox
            // Clear the skeleton and anything else stale, but NOT the face — and
            // not by wiping innerHTML. The face is what a tile shows, and a tool
            // that gets parked later has to flip back to it without re-creating it
            // (which would lose the real description the catalogue patched in and
            // every `:not(.loaded)` selector's view of the card). So it stays in
            // place and is simply hidden while the tool is live.
            const cardFace = cardSandbox.querySelector('.card-face');
            Array.from(cardSandbox.children).forEach(node => {
                if (node !== cardFace) node.remove();
            });
            if (cardFace) cardFace.hidden = true;
            // Shell-level risk notice (medical/financial/legal/…), one shared
            // mapping in risk-notices.js. Optional so the card still renders
            // if that file ever fails to load.
            if (window.SiteRiskNotices) {
                const meta = cardsMetaMap.get(cardName);
                if (meta) {
                    SiteRiskNotices.attach(cardSandbox, { name: meta.name || cardName, category: meta.category });
                }
            }
            cardSandbox.appendChild(contentDiv);
            
            // Inject and activate card styles
            styles.forEach(style => {
                const newStyle = document.createElement('style');
                newStyle.textContent = style.textContent;
                cardSandbox.appendChild(newStyle);
            });
            
            // Execute card scripts so interactive tools and calculators function
            scripts.forEach(script => {
                try {
                    const newScript = document.createElement('script');
                    Array.from(script.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.textContent = transformCardScript(script.textContent);
                    cardSandbox.appendChild(newScript);
                } catch (scriptErr) {
                    console.warn(`Error running script for ${cardName}:`, scriptErr);
                }
            });
            
            // Add footer to card. Any footer from an earlier render goes first —
            // an evicted parked tool re-renders into the same shell, and two
            // rating bars in one card is a bug that would otherwise be invisible.
            card.querySelectorAll('.card-footer').forEach(old => old.remove());
            const footer = document.createElement('div');
            footer.className = 'card-footer';
            footer.id = `footer-${cardName}`;
            card.appendChild(footer);
            
            // Update rating display
            updateCardRatingDisplay(card, cardName);
            
            // The row stops being a tile here, and if that row is entirely above
            // the fold it takes the reader's position with it — the same
            // arithmetic the park pays in reverse, and the reason the page owns
            // scroll corrections at all (see HOLDING THE READING POSITION).
            const growBefore = aboveTheFold(card);
            card.classList.remove('card-pending');
            card.classList.add('loaded', 'visible');
            noteRowHeight(card, growBefore);
            updateSiteStats();
            
            // Auto-adjust card height. Content can expand substantially after
            // a tool's script paints (canvas, tables, result panels), so
            // immediately re-check the viewport after the measurement rather
            // than waiting for a user scroll.
            setTimeout(() => {
                // A tool's script can double the row's height once it paints, and
                // that second growth needs the same correction. Measuring here
                // rather than reusing `growBefore` is deliberate: this is the
                // delta the reader has not been compensated for yet, and the two
                // are 100ms and one paint apart.
                const expandBefore = aboveTheFold(card);
                adjustCardHeight(card);
                noteRowHeight(card, expandBefore);
                scheduleViewportSweep();
            }, 100);
            
        } catch (error) {
            console.error(`Error rendering card ${cardName}:`, error);
            showCardError(card, cardName, error, 'render');
        }
    }
    
    function optimizeContentForMobile(element) {
        // Add mobile-friendly styles to form elements
        const inputs = element.querySelectorAll('input, textarea, select, button');
        inputs.forEach(el => {
            if (!el.style.fontSize) {
                el.style.fontSize = '16px'; // Prevents iOS zoom
            }
            
            if (el.tagName === 'BUTTON' || el.type === 'button' || el.type === 'submit') {
                el.style.minHeight = '44px';
                el.style.padding = '12px 16px';
            }
            
            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email' || el.type === 'password')) {
                el.style.minHeight = '44px';
                el.style.padding = '8px 12px';
            }
        });
        
        // Make tables responsive
        const tables = element.querySelectorAll('table');
        tables.forEach(table => {
            table.style.width = '100%';
            table.style.overflowX = 'auto';
            table.style.display = 'block';
        });
        
        // Ensure images are responsive
        const images = element.querySelectorAll('img');
        images.forEach(img => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
        });
    }
    
    // What the toolbox saves for a card. A parked tool has to be woken first:
    // its content is alive but sitting in the park, so snapshotting the sandbox
    // as it stands would save an empty tile and call it the tool. (Saving is
    // intent, which the window always honours — this resumes, it does not copy.)
    function cardSnapshotHTML(cardElement, cardName) {
        if (parkedCards.has(cardName)) resumeParked(cardElement, cardName);
        const sandbox = cardElement.querySelector('.card-sandbox');
        if (!sandbox) return '';
        const clone = sandbox.cloneNode(true);
        const face = clone.querySelector('.card-face');
        // The face stands in for a tool, it is not part of one — but if it is all
        // there is (a tile, or a mount that failed), keep the old behaviour and
        // snapshot whatever the card actually holds.
        if (face && clone.children.length > 1) face.remove();
        return clone.innerHTML;
    }

    function updateCardRatingDisplay(cardElement, cardName) {
        const rating = getCardRating(cardName);
        const percentage = calculateRatingPercentage(cardName);
        const totalVotes = rating.up + rating.down;
        
        const footer = cardElement.querySelector(`#footer-${cardName}`) || cardElement.querySelector('.card-footer');
        if (!footer) return;
        
        footer.innerHTML = `
            <div class="rating-display">
                <span class="rating-label">Useful:</span>
                <div class="rating-bar">
                    <div class="rating-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="rating-percentage">${percentage}%</span>
                <span style="color: var(--text-secondary); font-size: 0.8rem; margin-left: 4px;">(${totalVotes})</span>
            </div>
            
            <div class="rating-buttons">
                <button class="rating-btn up ${rating.userVote === 'up' ? 'voted' : ''}" 
                        data-card="${cardName}" 
                        data-action="up"
                        title="This is useful">
                    👍
                </button>
                <button class="rating-btn down ${rating.userVote === 'down' ? 'voted' : ''}" 
                        data-card="${cardName}" 
                        data-action="down"
                        title="Needs improvement">
                    👎
                </button>
            </div>
            
            <div class="embed-section">
                <button class="embed-btn" data-card="${cardName}">
                    <span>🔗</span>
                    <span>Embed</span>
                </button>
            </div>
        `;
        
        // Add event listeners to rating buttons
        const upBtn = footer.querySelector('.rating-btn.up');
        const downBtn = footer.querySelector('.rating-btn.down');
        const embedBtn = footer.querySelector('.embed-btn');
        
        if (upBtn) {
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                rateCard(cardName, 'up');
                updateCardRatingDisplay(cardElement, cardName);
            });
        }
        
        if (downBtn) {
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                rateCard(cardName, 'down');
                updateCardRatingDisplay(cardElement, cardName);
            });
        }
        
        if (embedBtn) {
            embedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyEmbedCode(cardName);
            });
        }
        
        // Update add button event listeners
        const addGridBtn = cardElement.querySelector('.card-action-btn.add-grid');
        const addListBtn = cardElement.querySelector('.card-action-btn.add-list');
        
        if (addGridBtn) {
            addGridBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const displayName = cardElement.dataset.displayName;
                const snapshot = cardSnapshotHTML(cardElement, cardName);
                if (snapshot) {
                    addCardToToolbox(displayName, snapshot, 'grid', cardName);
                }
            });
        }
        
        if (addListBtn) {
            addListBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const displayName = cardElement.dataset.displayName;
                const snapshot = cardSnapshotHTML(cardElement, cardName);
                if (snapshot) {
                    addCardToToolbox(displayName, snapshot, 'list', cardName);
                }
            });
        }
    }
    
    function showCardError(card, cardName, error, reason) {
        const cardSandbox = card.querySelector('.card-sandbox');
        if (!cardSandbox) return;
        reason = reason === 'render' ? 'render' : 'load';
        // Remember the failure so the viewport sweep can retry visible load
        // failures (bounded) instead of refetching forever — and so render
        // failures are never auto-retried. Manual Retry clears this.
        card.dataset.errorReason = reason;
        // Built with DOM APIs: displayName comes from cards.json and
        // error.message from the network — neither may touch innerHTML.
        const displayName = card.dataset.displayName || cardName;
        const wrap = document.createElement('div');
        wrap.className = 'card-sandbox-error';
        const inner = document.createElement('div');
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:48px;margin-bottom:16px;opacity:0.5;';
        icon.textContent = '⚠️';
        const title = document.createElement('h3');
        title.className = 'card-error-title';
        title.style.cssText = 'color:#ff4d4d;margin-bottom:12px;';
        title.textContent = (reason === 'render' ? "Couldn't render " : 'Failed to load ') + displayName;
        const detail = document.createElement('div');
        detail.className = 'card-error-detail';
        detail.style.cssText = 'font-size:14px;opacity:0.8;max-width:300px;margin:0 auto;';
        detail.textContent = (error && error.message) || 'Unknown error';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'card-error-retry';
        retry.style.cssText = 'margin-top:20px;padding:8px 16px;background:rgba(45,212,255,0.1);border:1px solid rgba(45,212,255,0.3);color:var(--accent);border-radius:8px;cursor:pointer;';
        retry.textContent = 'Retry';
        retry.addEventListener('click', function () { retryLoadCard(cardName); });
        inner.appendChild(icon);
        inner.appendChild(title);
        inner.appendChild(detail);
        inner.appendChild(retry);
        wrap.appendChild(inner);
        cardSandbox.innerHTML = '';
        cardSandbox.appendChild(wrap);
        // A failure is a row that grows: the error block is an icon, a title, a
        // detail line and a button, which is a lot taller than the tile it
        // replaces, so it owes the same correction a successful mount pays.
        // `retryLoadCard()` below is deliberately *not* paired with one — it flips
        // the classes back while the error block is still the content, so there is
        // no material height change to pay for, and the mount that follows is
        // paired already.
        const growBefore = aboveTheFold(card);
        card.classList.remove('card-pending');
        card.classList.add('loaded', 'visible');
        noteRowHeight(card, growBefore);
    }
    
    function retryLoadCard(cardName) {
        const card = document.querySelector(`.card[data-name="${cardName}"]`);
        if (card) {
            card.classList.add('card-pending');
            card.classList.remove('loaded', 'visible');
            loadedCards.delete(cardName);
            loadingCards.delete(cardName);
            retryCounts.delete(cardName);
            // A manual retry always fires and restores the auto-retry budget.
            delete card.dataset.errorReason;
            card.dataset.autoRetries = '0';
            card.classList.remove('loading-fallback');
            loadCard(card, cardName);
        }
    }

    // Bounded re-sweep of failed cards: visible load failures are retried
    // (transient network errors self-heal on scroll); render failures and
    // offscreen cards rest for a manual Retry. Runs with every viewport
    // sweep, so it fires on scroll, resize, filter and queue-drain.
    function retryErroredCards() {
        const limit = CONFIG.AUTO_RETRY_LIMIT;
        const failed = document.querySelectorAll('.card[data-error-reason="load"]');
        for (const card of failed) {
            const used = parseInt(card.dataset.autoRetries || '0', 10);
            if (used >= limit) continue;
            const rect = (typeof card.getBoundingClientRect === 'function')
                ? card.getBoundingClientRect() : null;
            if (!rect) continue;
            const inView = rect.bottom >= -300 && rect.top <= window.innerHeight + 300;
            if (!inView) continue;
            const cardName = card.dataset.name;
            if (!cardName || loadedCards.has(cardName) || loadingCards.has(cardName)) continue;
            card.dataset.autoRetries = String(used + 1);
            loadCard(card, cardName);
        }
    }
    
    function adjustCardHeight(cardElement) {
        const sandbox = cardElement.querySelector('.card-sandbox');
        if (!sandbox) return;
        // A parked sandbox holds only the face, on purpose: measuring it would
        // return about a face's height and write that back as the row's
        // min-height — and that number is the one the park restores on the way
        // back, so corrupting it on a resize (the handler walks every card, parked
        // ones included) would leave the tool coming up at face height forever.
        // The height a parked row shows is the tile's, and it is CSS's to give.
        if (cardElement.dataset.parked === '1') return;
        
        const contentHeight = sandbox.scrollHeight;
        const minHeight = 200;
        
        const cardContent = cardElement.querySelector('.card-content');
        if (cardContent) {
            // In reader mode, cards should expand to fit content
            if (document.body.classList.contains('reader-mode')) {
                cardContent.style.minHeight = contentHeight + 'px';
            } else {
                cardContent.style.minHeight = Math.max(minHeight, contentHeight) + 'px';
            }
        }
    }
    
    function initIntersectionObserver() {
        if (observer) observer.disconnect();
        // Very old browsers without IntersectionObserver: don't throw (this
        // runs during parse in adoptPrerenderedCards — an exception here used
        // to kill the first-screen kick too). The viewport sweep below is the
        // loader of last resort and covers everything on its own.
        if (typeof IntersectionObserver === 'undefined') {
            observer = null;
            return;
        }
        
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // Previously gated on `!isSearching`, which silently discarded
                // every intersection that happened while a search or category
                // filter was active — those cards were never re-observed, so
                // scrolling through filtered results left skeletons for good.
                if (entry.isIntersecting) {
                    const card = entry.target;
                    if (isCardHidden(card)) return;
                    const cardName = card.dataset.name;
                    // A parked tool the reader walked back to is woken on sight,
                    // ahead of the mount budget: that budget counts what the page
                    // fetches and mounts, and a wake is neither.
                    if (cardName && card.dataset.parked === '1') {
                        resumeParked(card, cardName);
                        return;
                    }
                    if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)
                        && mountBudgetFree()) {
                        loadCard(card, cardName);
                    }
                }
            });
        }, {
            root: null,
            // One source of truth for the look-ahead, because parkMargin() has to
            // stay bigger than it (see THE WINDOW AND THE PARK).
            rootMargin: `${CONFIG.REMOUNT_LOOKAHEAD}px 0px`,
            threshold: 0
        });
        
        document.querySelectorAll('.card:not(.loaded)').forEach(card => {
            observer.observe(card);
        });
    }
    
    // ===== SCROLL-BASED FALLBACK LOADER =====
    // Backup for IntersectionObserver — catches cards that the observer missed
    // (browser resource limits with 250+ observed elements can cause missed callbacks)
    let scrollLoadActive = false;
    let scrollRafPending = false;

    // Driven by scroll, throttled to one pass per frame. This replaces a
    // setInterval that re-queried every unloaded card and called
    // getBoundingClientRect() in a loop every 3 seconds whether or not the
    // user had moved — forced synchronous layout, 1165 times, forever.
    function onScrollLoad() {
        if (scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(() => {
            scrollRafPending = false;
            scrollFallbackLoader();
        });
    }

    // Public entry point used everywhere a layout change may have revealed
    // unloaded cards (filters, resize, tab focus, queue drained, bfcache).
    function scheduleViewportSweep() { onScrollLoad(); }

    function scrollFallbackLoader() {
        if (scrollLoadActive) return;
        scrollLoadActive = true;
        // try/finally: an exception mid-sweep (an extension-mangled DOM, a
        // detached card) must not leave the flag set — that used to disable
        // this fallback loader for the rest of the page's life.
        try {

            // Measuring is only worth doing when a load slot is actually free.
            // getBoundingClientRect() forces layout, and with the one-column grid
            // that is ~1,190 forced layout reads per scroll frame — measured at
            // 71,404 reads over 60 frames of a fast scroll, of which exactly 4
            // could ever start a load, because MAX_CONCURRENT_LOADS slots were
            // already busy. That work ran on the very frames the user was
            // scrolling and waiting for cards.
            //
            // Nothing is lost by skipping it: the walk below still prunes finished
            // cards, and processLoadQueue() re-sweeps the moment a slot frees up.
            // The live cap is folded in for the same reason — when the grid has
            // as many running tools as it is allowed, measuring cannot change
            // anything, and a click (which ignores the cap) starts the load.
            const canStart = activeLoads < MAX_CONCURRENT_LOADS && mountBudgetFree();

            // The observer has a generous look-ahead for smooth scrolling, but
            // this fallback always gives cards actually on screen first priority.
            // That prevents a fast jump from waiting behind a queue of cards above
            // the viewport and fixes the "it stops showing tools" failure mode.
            const viewportTop = -80;
            const viewportBottom = window.innerHeight + 120;
            const lookAheadTop = -400;
            const lookAheadBottom = window.innerHeight + 500;
            const visible = [];
            const lookAhead = [];
            const stillPending = [];

            for (let i = 0; i < pendingCards.length; i++) {
                const card = pendingCards[i];
                const cardName = card.dataset.name;
                // Prune finished cards so the list — and this loop — shrinks over
                // time instead of re-walking all 1200+ entries on every scroll.
                if (!cardName || loadedCards.has(cardName) || !card.isConnected) continue;
                stillPending.push(card);
                // Every load slot is busy: this sweep cannot start anything, so
                // the rest of the per-card work (and the layout reads it costs) is
                // skipped. See canStart above.
                if (!canStart) continue;
                if (loadingCards.has(cardName) || card.classList.contains('loading-fallback')) continue;
                // Failed cards belong to the bounded retryErroredCards() sweep,
                // not the bulk loader — otherwise every scroll refetches a
                // permanently broken card forever.
                if (card.dataset.errorReason) continue;
                // Hidden by the active filter: skip, but keep it pending.
                if (isCardHidden(card)) continue;

                // No early "past the viewport" break here: filters reorder cards
                // with CSS `order`, so DOM position says nothing about where a
                // card is on screen.
                const rect = card.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;

                const distance = Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2);
                const candidate = { card, cardName, distance };
                if (rect.bottom >= viewportTop && rect.top <= viewportBottom) {
                    visible.push(candidate);
                } else if (rect.bottom >= lookAheadTop && rect.top <= lookAheadBottom) {
                    lookAhead.push(candidate);
                }
            }

            visible.sort((a, b) => a.distance - b.distance);
            lookAhead.sort((a, b) => a.distance - b.distance);
            noteReadingPosition(visible.length ? visible : lookAhead);
            const candidates = visible.concat(lookAhead).slice(0, MAX_CONCURRENT_LOADS);

            candidates.forEach(({ card, cardName }) => {
                card.classList.add('loading-fallback');
                loadCard(card, cardName);
            });

            pendingCards = stillPending;
            retryErroredCards();
            // Live tools the grid no longer needs to paint go to the park. Inline
            // rather than debounced because it is bounded by the window (one rect
            // per live tool), not by the catalogue — and parking first is what
            // keeps `mountBudgetFree()` open on a long scroll.
            parkOutsideWindow();
            // The sweep knows where the visitor is; tell the warm path, whose
            // cursor follows the same front. Cheap (it is coalesced) and it is
            // what keeps warming alive when a mount fails or a filter changes.
            pumpWarmSoon();
        } finally {
            scrollLoadActive = false;
        }
    }

    function onScrollLazyLoad() {
        onScrollLoad();
    }
    
    // ===== EVENT HANDLERS =====
    function setupEventListeners() {
        // Search functionality
        const mainSearchInput = document.getElementById('mainSearchInput');
        const mainSearchBtn = document.getElementById('mainSearchBtn');
        const stickySearchInput = document.getElementById('stickySearchInput');
        
        // Main search
        if (mainSearchInput && mainSearchBtn) {
            mainSearchBtn.addEventListener('click', () => performSearch(mainSearchInput.value));
            mainSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch(mainSearchInput.value);
            });
        }
        
        // Sticky search
        if (stickySearchInput) {
            stickySearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch(stickySearchInput.value);
            });
        }
        
        // Debounced search for both inputs
        let searchTimeout;
        const debouncedSearch = (value) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(value);
            }, 300);
        };
        
        if (mainSearchInput) {
            mainSearchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
        }
        
        if (stickySearchInput) {
            stickySearchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
        }
        
        // Category pills filter, and say so in the URL: `?cat=music-audio` is
        // both the shareable form of this click and what applyIndexDeepLink()
        // reads back. replaceState, not pushState — a filter is a view of this
        // page, not a new page, and the back button must leave the page rather
        // than unwind every pill someone tapped.
        document.querySelectorAll('.cat-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentSelectedCategory = pill.dataset.category;
                const slug = slugifyLabel(currentSelectedCategory);
                try {
                    const url = (slug && slug !== 'all')
                        ? `${location.pathname}?cat=${encodeURIComponent(slug)}`
                        : location.pathname;
                    history.replaceState(null, '', url);
                } catch (err) { /* file:// or a sandboxed frame: filtering still works */ }
                applyFilters();
            });
        });

        // Search clear button
        const clearBtn = document.getElementById('mainSearchClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (mainSearchInput) mainSearchInput.value = '';
                if (stickySearchInput) stickySearchInput.value = '';
                performSearch('');
                if (mainSearchInput) mainSearchInput.focus();
            });
        }

        // Reset search button on empty state
        const resetBtn = document.getElementById('btnResetSearch');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (mainSearchInput) mainSearchInput.value = '';
                if (stickySearchInput) stickySearchInput.value = '';
                document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                const allPill = document.querySelector('.cat-pill[data-category="all"]');
                if (allPill) allPill.classList.add('active');
                currentSelectedCategory = 'all';
                performSearch('');
            });
        }

        // Sort selector
        const sortSelect = document.getElementById('catalogSortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                applyFilters();
            });
        }

        // Grid density (mosaic <-> focus). Remembered by setDensity(); the
        // markup carries aria-pressed so the state is readable without CSS.
        document.querySelectorAll('[data-density]').forEach(btn => {
            btn.addEventListener('click', () => setDensity(btn.dataset.density));
        });

        // View mode buttons
        const btnViewCards = document.getElementById('btnViewCards');
        const btnViewDir = document.getElementById('btnViewDirectory');
        if (btnViewCards) btnViewCards.addEventListener('click', () => setViewMode('cards'));
        if (btnViewDir) btnViewDir.addEventListener('click', () => setViewMode('directory'));

        // Load-all: fetch and run every tool on the page now, instead of as
        // the visitor scrolls. Two-click confirm — the full catalogue is a
        // large download and phone visitors should not trigger it by accident.
        const loadAllBtn = document.getElementById('btnLoadAllTools');
        if (loadAllBtn) {
            loadAllBtn.addEventListener('click', () => {
                if (!loadAllBtn.dataset.armed) {
                    loadAllBtn.dataset.armed = '1';
                    loadAllBtn.textContent = `⚡ Confirm: run all ${allCards.length || ''}`;
                    loadAllBtn.title = 'Fetch and run every tool on the page now — hundreds of megabytes and every tool at once. There is no undo.';
                    setTimeout(() => {
                        if (loadAllBtn && loadAllBtn.dataset.armed) {
                            delete loadAllBtn.dataset.armed;
                            loadAllBtn.textContent = '⚡ Run all';
                            loadAllBtn.title = 'Fetch and run every tool on the page now — a large download; cards go live as they arrive';
                        }
                    }, 6000);
                    return;
                }
                delete loadAllBtn.dataset.armed;
                loadAllBtn.textContent = '⚡ Run all';
                loadAllBtn.title = 'Fetch and run every tool on the page now — a large download; cards go live as they arrive';
                loadAllToolsNow();
            });
        }

        // Single delegated listener for directory "View Card" buttons —
        // renderDirectoryList() no longer attaches one listener per row.
        const dirGrid = document.getElementById('directoryGrid');
        if (dirGrid) dirGrid.addEventListener('click', handleDirectoryGridClick);

        // Event delegation for card interactions
        document.addEventListener('click', handleCardClick);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+T for toolbox
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                document.getElementById('stickyToolboxToggle').click();
            }
            // Ctrl+P for palette
            else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                document.getElementById('stickyPaletteToggle').click();
            }
            // Ctrl+R for reader mode
            else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                document.getElementById('stickyReaderToggle').click();
            }
            // Ctrl+D for contributions
            else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                document.getElementById('stickyContributionsToggle').click();
            }
            // / to focus search
            else if (e.key === '/' && document.activeElement !== mainSearchInput && document.activeElement !== stickySearchInput) {
                e.preventDefault();
                mainSearchInput.focus();
            }
            // Enter/Space on a focused card face runs that tool now
            else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card-face')) {
                e.preventDefault();
                const face = document.activeElement;
                const card = face.closest('.card');
                const cardName = card && card.dataset.name;
                if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                    loadCard(card, cardName);
                }
            }
        });
        
        // Window resize handler for responsive adjustments. Throttled to one
        // pass per frame: adjustCardHeight() forces layout per card, and this
        // used to run synchronously on every resize tick — twice (a second
        // identical listener lived at the bottom of the script).
        let resizeRafPending = false;
        window.addEventListener('resize', () => {
            if (resizeRafPending) return;
            resizeRafPending = true;
            requestAnimationFrame(() => {
                resizeRafPending = false;
                // Update grid layout in toolbox
                if (toolboxMode === 'grid') {
                    updateGridLayout();
                }

                // Adjust card heights
                document.querySelectorAll('.card').forEach(card => {
                    adjustCardHeight(card);
                });
            });
        });
    }
    
    function handleCardClick(event) {
        const target = event.target;
        
        // Card face: clicking it runs the tool immediately (instead of
        // waiting for the scroll-driven loader). Silent swap — no loading UI.
        const face = target.closest('.card-face');
        if (face) {
            const card = face.closest('.card');
            const cardName = card && card.dataset.name;
            if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                loadCard(card, cardName);
            }
            return;
        }

        // Mosaic tiles: the whole tile is the button, not just its lower half —
        // at 212px there is barely a lower half. Real controls keep their own
        // behaviour, so this claims only a click that has nowhere else to go.
        // A click is intent: it is never turned away by the mount window, and when
        // the tool is parked this is the path that wakes it up.
        if (currentDensity === 'mosaic') {
            const tile = target.closest('.card.card-pending');
            if (tile && !target.closest('a, button, input, select, textarea, label')) {
                const cardName = tile.dataset.name;
                if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                    loadCard(tile, cardName);
                }
                return;
            }
        }

        // Standalone / Maximise button
        const maximizeBtn = target.closest('.card-maximize-btn, .card-expand');
        if (maximizeBtn) {
            event.preventDefault();
            event.stopPropagation();
            const card = maximizeBtn.closest('.card');
            const cardName = card?.dataset.name || maximizeBtn.dataset.card;
            if (cardName) {
                openStandaloneModal(cardName);
            }
            return;
        }
    }
    
    // (The maximise modal's controller moved to home-features.js; the
    // openStandaloneModal() delegate above is what the cards call.)

    let currentSelectedCategory = 'all';
    let currentSearchQuery = '';
    let currentSort = 'default';
    let currentViewMode = 'cards';
    // Directory view is hidden most of the time, so filtering only records
    // the match list and marks it dirty — the DOM is (re)built lazily when
    // the user actually switches to directory view (see setViewMode).
    let lastMatchedNames = [];
    let directoryDirty = true;

    // Deep links, as documented in llms.txt and agents.html:
    // index.html?q=<query> pre-fills catalogue search;
    // index.html?expand=<tool-slug> opens one tool inline.
    // Pure parser: extracted and pinned by scripts/tests/index-deeplink.test.js.
    // Categories in a URL are slugs, the same shape the catalogue's own file
    // names use: "Music & Audio" is `?cat=music-audio`. Pure; both directions
    // (a label from the pills and a slug from a link) run through it, so the
    // comparison cannot be spoofed into a filter that does not exist.
    function slugifyLabel(label) {
        return String(label || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }

    function parseIndexDeepLink(search) {
        const out = { q: '', expand: '', cat: '', view: '', park: '' };
        try {
            const params = new URLSearchParams(search || '');
            out.q = (params.get('q') || '').trim();
            // Catalogue slugs are [a-z0-9-]. Anything else is ignored here —
            // the value is only ever used for map lookup, never rendered.
            const raw = (params.get('expand') || '').trim().toLowerCase();
            out.expand = /^[a-z0-9-]{1,80}$/.test(raw) ? raw : '';
            // `cat=` and the longer `category=` (as published in agents.html)
            // are the same link. Slug-shaped only; the value is looked up
            // against the catalogue's own categories in applyIndexDeepLink and
            // never rendered.
            out.cat = slugifyLabel((params.get('cat') || params.get('category') || '').trim());
            // Which of the two grids to show. Anything else is no view at all,
            // and the page keeps the density the visitor saved.
            const rawView = (params.get('view') || '').trim().toLowerCase();
            out.view = rawView === 'cards' || rawView === 'directory' ? rawView : '';
            // `?park=off` is the escape hatch on the mount window: nothing gets
            // put back, so every tool the page mounts stays on the grid.
            // `?park=full` is the half-measure, for someone who wants the density
            // gone but the park kept: a parked tool keeps its whole row instead of
            // collapsing to a tile. Anything else is no park directive at all —
            // parking is the good default, so a typo must not switch it off.
            const rawPark = (params.get('park') || '').trim().toLowerCase();
            out.park = rawPark === 'off' || rawPark === 'full' ? rawPark : '';
        } catch (err) { /* malformed query string: plain homepage */ }
        return out;
    }

    // Runs once, after the catalogue is ready (see loadCardList). Never
    // throws: a broken deep link must leave the homepage exactly as it was.
    function applyIndexDeepLink() {
        try {
            const link = parseIndexDeepLink(window.location.search);
            // Read before the early return: a URL that only says `park=off` is
            // still a URL that changed how the page behaves.
            if (link.park === 'off') parkMode = false;
            else if (link.park === 'full') collapsePark = false;
            if (!link.q && !link.expand && !link.cat && !link.view && !link.park) return;
            const main = document.getElementById('mainSearchInput');
            const sticky = document.getElementById('stickySearchInput');
            // ?cat= is the one page of this size that deserves a URL: 1,194
            // tools in one grid is a browse, and a category is the address for
            // the part of it a visitor (or a crawler, or a link in a chat)
            // actually meant.
            if (link.view) setViewMode(link.view);
            if (link.cat) {
                const pills = Array.from(document.querySelectorAll('.cat-pill'));
                const pill = pills.find(p => slugifyLabel(p.dataset.category) === link.cat);
                if (pill) {
                    pills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    currentSelectedCategory = pill.dataset.category;
                }
            }
            if (link.expand && cardsMetaMap.has(link.expand)) {
                const meta = cardsMetaMap.get(link.expand) || {};
                const title = String(meta.title || link.expand).replace(/^[^\w\s]+/, '').trim() || link.expand;
                if (main) main.value = title;
                if (sticky) sticky.value = title;
                performSearch(title);
                // Open the tool through the same handler a click uses, after
                // the filtered view has rendered. The data-name match keeps
                // this precise even when the title matches several tools.
                setTimeout(() => {
                    try {
                        const card = document.querySelector('#dashboard [data-name="' + link.expand + '"]');
                        const btn = card && card.querySelector('.expand-btn');
                        if (btn) {
                            btn.click();
                            if (card.scrollIntoView) card.scrollIntoView({ block: 'center' });
                        }
                    } catch (err) { /* filtered view is still useful */ }
                }, 350);
                return;
            }
            if (link.q) {
                if (main) main.value = link.q;
                if (sticky) sticky.value = link.q;
                performSearch(link.q);
            } else if (link.cat) {
                applyFilters();
            }
        } catch (err) { /* deep link failed: plain homepage */ }
    }

    function performSearch(query) {
        currentSearchQuery = query;
        applyFilters();
    }

    // --- Typo-tolerant search helpers (fuzzy fallback) ---
    function levenshtein(a, b) {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        if (Math.abs(a.length - b.length) > 2) return 3; // early exit
        const prev = new Array(b.length + 1);
        const curr = new Array(b.length + 1);
        for (let j = 0; j <= b.length; j++) prev[j] = j;
        for (let i = 1; i <= a.length; i++) {
            curr[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            }
            for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
        }
        return prev[b.length];
    }
    function fuzzyWordMatch(query, text) {
        // Check if any word in text is within edit distance 1-2 of query (for queries >= 4 chars)
        if (query.length < 4) return false;
        const words = text.split(/[^a-z0-9]+/);
        for (const w of words) {
            if (w.length < 4) continue;
            if (Math.abs(w.length - query.length) > 2) continue;
            if (levenshtein(query, w) <= (query.length <= 5 ? 1 : 2)) return true;
        }
        return false;
    }
    function findDidYouMean(query) {
        if (query.length < 3) return '';
        // Find closest card title word to the query
        let best = '', bestDist = 99;
        const q = query.toLowerCase();
        for (const name of allCards) {
            const meta = cardsMetaMap.get(name);
            const words = ((meta?.title || name) + ' ' + name).toLowerCase().split(/[^a-z0-9]+/);
            for (const w of words) {
                if (w.length < 3 || Math.abs(w.length - q.length) > 2) continue;
                const d = levenshtein(q, w);
                if (d > 0 && d < bestDist && d <= 2) { bestDist = d; best = w; }
            }
            if (bestDist === 1) break;
        }
        return best;
    }


    // ===== MODERN: View Transitions helper =====
    // Wraps DOM updates in document.startViewTransition when available
    // Falls back to direct execution. Used for filtering, view mode, modal.
    function withViewTransition(updateFn) {
        if (document.startViewTransition) {
            // Skip VT if user prefers reduced motion
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                updateFn();
                return;
            }
            try {
                document.startViewTransition(() => {
                    updateFn();
                });
                return;
            } catch (e) {
                // Fall through to direct
            }
        }
        updateFn();
    }

    // Assign view-transition-name to cards dynamically for shared transitions
    function assignVTNames() {
        document.querySelectorAll('.card').forEach(card => {
            const name = card.dataset.name;
            if (name) {
                // Sanitize for CSS ident: replace invalid chars
                const safe = 'card-' + name.replace(/[^a-z0-9_-]/gi, '-');
                card.style.setProperty('--vt-name', safe);
            }
        });
    }

    // Modern: Update speculation rules based on visible cards (eagerness)
    // Rewriting the <script type="speculationrules"> element re-evaluates the
    // rules, and every listed URL is then prefetched. Typing in the search box
    // changes the visible-card list on every keystroke, so updating the rules
    // there meant six fresh tool.html prefetches per character — bandwidth
    // taken from the results the visitor is waiting for. The rules are now
    // refreshed once the typing stops.
    let speculationRulesTimer = null;
    function scheduleSpeculationRulesUpdate() {
        if (speculationRulesTimer) clearTimeout(speculationRulesTimer);
        speculationRulesTimer = setTimeout(() => {
            speculationRulesTimer = null;
            updateSpeculationRules();
        }, 700);
    }

    function updateSpeculationRules() {
        const rulesEl = document.getElementById('speculation-rules');
        if (!rulesEl || !('supports' in HTMLScriptElement) ) return;
        // Only update if first 6 visible cards exist
        try {
            const visible = Array.from(document.querySelectorAll('.card'))
                .filter(c => c.style.display !== 'none')
                .slice(0, 6)
                .map(c => `tool.html?card=${encodeURIComponent(c.dataset.name)}`);
            if (visible.length === 0) return;
            // No cards.json here: the head bootstrap already downloads it
            // once at low priority; listing it again was a second 548 KB
            // fetch on every filter change. (Same for tools-index.html,
            // which used to sit in the static rules — 390 KB nobody on the
            // home page asked for.)
            //
            // "conservative", not "moderate": a prerender runs the whole
            // standalone page (its scripts included, and they fetch the full
            // catalogue). At moderate eagerness a mouse crossing the grid
            // started those page loads while the visitor was still waiting for
            // the grid's own cards. Conservative still prerenders on the way
            // into a click, without speculating on hover.
            const rules = {
                prerender: [{ where: { href_matches: "*/tool.html?card=*" }, eagerness: "conservative" }],
                prefetch: [{ urls: visible }]
            };
            // Update only if changed to avoid re-parse churn
            const newText = JSON.stringify(rules);
            if (rulesEl.textContent !== newText) {
                rulesEl.textContent = newText;
            }
        } catch {}
    }

    // Modern: Service Worker registration (cache-first for cards.json + fragments)
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        // Only register on secure context and not file://
        if (location.protocol === 'file:') return;
        const swUrl = 'sw.js';
        // Use requestIdleCallback or postTask if available
        const doRegister = () => {
            navigator.serviceWorker.register(swUrl, { type: 'module' }).then(reg => {
                console.log('[SW] registered', reg.scope);
                // No WARM_CACHE here any more: both catalogue tiers are
                // already fetched by the page itself and land in the SW
                // cache through the fetch handler. Warming them was a
                // second (and for cards.json, third) full download.
            }).catch(err => {
                // Fallback to classic SW
                navigator.serviceWorker.register(swUrl).catch(()=>{});
            });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(doRegister, { timeout: 4000 });
        } else if (window.scheduler && scheduler.postTask) {
            scheduler.postTask(doRegister, { priority: 'background' });
        } else {
            window.addEventListener('load', () => setTimeout(doRegister, 1500));
        }
    }

    // Modern: Navigation API for modal (back button closes modal)
    function setupNavigationAPI() {
        if (!('navigation' in window)) return;
        // Intercept tool.html navigations for VT
        try {
            window.navigation.addEventListener('navigate', (e) => {
                const url = new URL(e.destination.url);
                if (url.pathname.endsWith('tool.html') && url.searchParams.has('card')) {
                    // Let browser handle, but with VT
                    if (document.startViewTransition) {
                        e.intercept({
                            handler: async () => {
                                document.startViewTransition(async () => {
                                    location.href = e.destination.url;
                                });
                            }
                        });
                    }
                }
            });
        } catch {}
    }
    // Modern: scrollend event for lazy load (more efficient than scroll)
    function setupScrollEnd() {
        if ('onscrollend' in window) {
            window.addEventListener('scrollend', () => {
                onScrollLazyLoad();
                updateSpeculationRules();
            });
        }
    }

    // Modern: scheduler.postTask for non-critical work
    function postTask(fn, opts) {
        if (window.scheduler && scheduler.postTask) {
            return scheduler.postTask(fn, opts || { priority: 'background' });
        } else if ('requestIdleCallback' in window) {
            return new Promise(res => requestIdleCallback(() => { fn(); res(); }, { timeout: 1000 }));
        } else {
            return new Promise(res => setTimeout(() => { fn(); res(); }, 0));
        }
    }


    function applyFiltersCore() {
        const query = currentSearchQuery.toLowerCase().trim();
        const queryWords = query.split(/\s+/).filter(Boolean);
        isSearching = query.length > 0 || currentSelectedCategory !== 'all';
        
        let sortedCards = [...allCards];
        if (currentSort === 'az') {
            sortedCards.sort((a, b) => {
                const metaA = cardsMetaMap.get(a);
                const metaB = cardsMetaMap.get(b);
                const titleA = (metaA?.title || a).toLowerCase();
                const titleB = (metaB?.title || b).toLowerCase();
                return titleA.localeCompare(titleB);
            });
        } else if (currentSort === 'za') {
            sortedCards.sort((a, b) => {
                const metaA = cardsMetaMap.get(a);
                const metaB = cardsMetaMap.get(b);
                const titleA = (metaA?.title || a).toLowerCase();
                const titleB = (metaB?.title || b).toLowerCase();
                return titleB.localeCompare(titleA);
            });
        } else if (currentSort === 'category') {
            sortedCards.sort((a, b) => {
                const metaA = cardsMetaMap.get(a);
                const metaB = cardsMetaMap.get(b);
                const catA = (metaA?.category || '').toLowerCase();
                const catB = (metaB?.category || '').toLowerCase();
                if (catA !== catB) return catA.localeCompare(catB);
                return (metaA?.title || a).toLowerCase().localeCompare((metaB?.title || b).toLowerCase());
            });
        }

        const cardElementsMap = new Map();
        document.querySelectorAll('.card').forEach(c => cardElementsMap.set(c.dataset.name, c));

        let visibleCount = 0;
        const matchedNames = [];

        sortedCards.forEach((name, i) => {
            const cardEl = cardElementsMap.get(name);
            const meta = cardsMetaMap.get(name);
            const cat = (meta?.category || cardEl?.dataset.category || '').trim();
            const title = (meta?.title || cardEl?.dataset.displayName || name).toLowerCase();
            // Description comes from cardsMetaMap only — placeholders no longer
            // carry a data-desc copy of it (see createPlaceholder).
            const desc = (meta?.description || '').toLowerCase();
            const rawName = name.toLowerCase();

            const catMatches = (currentSelectedCategory === 'all' || cat.toLowerCase() === currentSelectedCategory.toLowerCase());

            let searchMatches = true;
            if (query.length > 0) {
                const exactMatch = rawName.includes(query) ||
                                title.includes(query) ||
                                desc.includes(query) ||
                                cat.toLowerCase().includes(query);
                if (exactMatch) {
                    searchMatches = true;
                } else if (queryWords.length > 1) {
                    // Multi-word: every word must match somewhere (exact substring)
                    searchMatches = queryWords.every(w =>
                        rawName.includes(w) || title.includes(w) || desc.includes(w) || cat.toLowerCase().includes(w)
                    );
                    // If still no match, try fuzzy on each word
                    if (!searchMatches) {
                        searchMatches = queryWords.every(w =>
                            fuzzyWordMatch(w, rawName) || fuzzyWordMatch(w, title) || fuzzyWordMatch(w, desc)
                        );
                    }
                } else {
                    // Single word: exact failed, try fuzzy word-level match
                    searchMatches = fuzzyWordMatch(query, rawName) ||
                                    fuzzyWordMatch(query, title) ||
                                    fuzzyWordMatch(query, desc);
                }
            }

            const isVisible = catMatches && searchMatches;

            if (cardEl) {
                cardEl.style.display = isVisible ? '' : 'none';
                cardEl.style.order = i;
            }

            if (isVisible) {
                visibleCount++;
                matchedNames.push(name);
                // No loadCard() per match. A search that matches 400 tools used
                // to queue 400 fetch+parse+execute jobs on the keystroke that
                // typed them, ahead of the 24 actually on screen; and a category
                // pill for Productivity (152 tools) was one click on a fork in
                // the road. The sweep and the observer mount what the window
                // holds, and the warm path takes care of the bytes for the rest.
            }
        });

        // Rebuilding the (usually hidden) 1223-node directory list on every
        // keystroke was the biggest filter jank. Only rebuild it when it is
        // actually on screen; otherwise just remember the match list.
        lastMatchedNames = matchedNames;
        if (currentViewMode === 'directory') {
            renderDirectoryList(matchedNames);
        } else {
            directoryDirty = true;
        }
        // Anything beyond the first screenful that lands in the viewport (or is
        // scrolled to later) is picked up by the sweep + observer, which no
        // longer ignore cards while a filter is active.
        resetWarmWindow();
        scheduleViewportSweep();

        const resultsCountEl = document.getElementById('resultsCountText');
        const noResultsState = document.getElementById('noResultsState');
        const noResultsMsg = document.getElementById('noResultsMsg');
        const clearBtn = document.getElementById('mainSearchClear');

        if (clearBtn) {
            clearBtn.style.display = query.length > 0 ? 'inline-block' : 'none';
        }

        if (resultsCountEl) {
            if (!isSearching) {
                resultsCountEl.innerHTML = `Showing all <strong>${allCards.length}</strong> tools`;
            } else {
                let filterDesc = currentSelectedCategory !== 'all' ? ` in <strong>${currentSelectedCategory}</strong>` : '';
                let searchDesc = query.length > 0 ? ` matching "<em>${query}</em>"` : '';
                resultsCountEl.innerHTML = `Found <strong>${visibleCount}</strong> tool${visibleCount === 1 ? '' : 's'}${filterDesc}${searchDesc}`;
            }
        }

        if (noResultsState) {
            if (visibleCount === 0) {
                noResultsState.style.display = 'block';
                if (noResultsMsg) {
                    const suggestion = query.length >= 3 ? findDidYouMean(query) : '';
                    if (suggestion) {
                        noResultsMsg.innerHTML = `No tools found in "${currentSelectedCategory}" matching "${query}". Did you mean <a href="#" id="didYouMeanLink" style="color:var(--accent);text-decoration:underline;">${suggestion}</a>?`;
                        const link = document.getElementById('didYouMeanLink');
                        if (link) link.addEventListener('click', (e) => {
                            e.preventDefault();
                            const main = document.getElementById('mainSearchInput');
                            const sticky = document.getElementById('stickySearchInput');
                            if (main) main.value = suggestion;
                            if (sticky) sticky.value = suggestion;
                            performSearch(suggestion);
                        });
                    } else {
                        noResultsMsg.textContent = `No tools found in "${currentSelectedCategory}" matching "${query}". Try a broader term or browse categories above.`;
                    }
                }
            } else {
                noResultsState.style.display = 'none';
            }
        }
    }

    function applyFilters() {
        // Modern: use View Transitions API for smooth filter morphing
        // Avoid nested transitions
        if (document.startViewTransition && !document.__vtRunning) {
            try {
                document.__vtRunning = true;
                document.startViewTransition(() => {
                    applyFiltersCore();
                    assignVTNames();
                    document.__vtRunning = false;
                });
                // Update speculation rules after VT (debounced: see above)
                postTask(() => scheduleSpeculationRulesUpdate());
                return;
            } catch (e) {
                document.__vtRunning = false;
            }
        }
        applyFiltersCore();
        postTask(() => { assignVTNames(); scheduleSpeculationRulesUpdate(); });
    }
    
    // ===== SITE STATS (footer + hero counters) =====
    // O(1): this runs after every single card render, so it must not scan
    // the DOM or the 1223-entry catalogue. loadedCards is the source of
    // truth; category counts are computed once in updateCategoryCounts().
    function updateSiteStats() {
        const total = allCards.length;
        const loaded = loadedCards.size;
        const heroCount = document.getElementById('heroToolCount');
        // total is 0 until the catalogue lands. Leave the markup alone instead
        // of overwriting it: the old fallback wrote a stale hardcoded '350+'
        // into the hero badge. That branch was unreachable while every card
        // waited for cards.json; the first screen now renders before it.
        if (heroCount && total > 0) heroCount.textContent = total + '+';
        const totalEl = document.getElementById('footerTotalCards');
        const loadedEl = document.getElementById('footerLoadedCards');
        if (totalEl) totalEl.textContent = total;
        if (loadedEl) loadedEl.textContent = loaded;
        updateLiveCount();
    }

    // Category pill counts only change when the catalogue loads, so compute
    // them exactly once instead of inside updateSiteStats() (which used to
    // re-walk all 1194 entries on every card render — ~1.5M wasted ops).
    let categoryCountsDone = false;
    function updateCategoryCounts() {
        if (categoryCountsDone || !cardsMetaMap || cardsMetaMap.size === 0) return;
        categoryCountsDone = true;
        const catCounts = {};
        cardsMetaMap.forEach(meta => {
            const cat = meta.category || 'Productivity & Lifestyle';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        });
        const allCountEl = document.getElementById('count-all');
        if (allCountEl) allCountEl.textContent = cardsMetaMap.size;

        document.querySelectorAll('.cat-pill').forEach(pill => {
            const cat = pill.dataset.category;
            if (cat && cat !== 'all') {
                const countBadge = pill.querySelector('.cat-count');
                if (countBadge && catCounts[cat] !== undefined) {
                    countBadge.textContent = catCounts[cat];
                }
            }
        });
    }

    // ===== UTILITY FUNCTIONS =====
    function showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = 'notification';
        
        const bgColor = type === 'success' ? 'rgba(57, 255, 20, 0.1)' :
                       type === 'error' ? 'rgba(255, 77, 77, 0.1)' :
                       type === 'warning' ? 'rgba(255, 215, 0, 0.1)' : 'rgba(45, 212, 255, 0.1)';
        
        const borderColor = type === 'success' ? 'var(--success)' :
                          type === 'error' ? 'var(--error)' :
                          type === 'warning' ? 'var(--premium)' : 'var(--accent)';
        
        const textColor = type === 'success' ? 'var(--success)' :
                         type === 'error' ? 'var(--error)' :
                         type === 'warning' ? 'var(--premium)' : 'var(--accent)';
        
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            color: ${textColor};
            padding: var(--space-md);
            border-radius: var(--card-radius);
            backdrop-filter: blur(10px);
            z-index: 2000;
            animation: slideIn 0.3s ease;
            max-width: min(320px, calc(100vw - 40px));
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // ===== INITIALIZE =====
    // (Resize-driven height adjustment lives in setupEventListeners() —
    // the duplicate listener that used to be here doubled layout work on
    // every resize tick.)
    
    // Make functions globally available for button onclick events
    window.retryLoadCard = retryLoadCard;

    // The state accessors are defined here, after every variable they expose,
    // so none of them can ever be read before its declaration has run. The rest
    // of the bridge above only *references* them (through the bundle, which
    // loads later) and the delegates, which are function declarations.
    // Written out rather than built with eval(): a CSP without unsafe-eval
    // would turn these into silent no-ops, and scripts/tests/app-split.test.js
    // checks the list against what the bundle reaches for.
    const mpState = mpHome.state;
    Object.defineProperty(mpState, 'allCards', {
        get() { return allCards; },
        set(value) { allCards = value; }
    });
    Object.defineProperty(mpState, 'cardCache', {
        get() { return cardCache; },
        set(value) { cardCache = value; }
    });
    Object.defineProperty(mpState, 'cardsMetaMap', {
        get() { return cardsMetaMap; },
        set(value) { cardsMetaMap = value; }
    });
    Object.defineProperty(mpState, 'currentViewMode', {
        get() { return currentViewMode; },
        set(value) { currentViewMode = value; }
    });
    Object.defineProperty(mpState, 'directoryDirty', {
        get() { return directoryDirty; },
        set(value) { directoryDirty = value; }
    });
    Object.defineProperty(mpState, 'expandedGridCards', {
        get() { return expandedGridCards; },
        set(value) { expandedGridCards = value; }
    });
    Object.defineProperty(mpState, 'expandedListCards', {
        get() { return expandedListCards; },
        set(value) { expandedListCards = value; }
    });
    Object.defineProperty(mpState, 'isSearching', {
        get() { return isSearching; },
        set(value) { isSearching = value; }
    });
    Object.defineProperty(mpState, 'lastMatchedNames', {
        get() { return lastMatchedNames; },
        set(value) { lastMatchedNames = value; }
    });
    Object.defineProperty(mpState, 'loadedCards', {
        get() { return loadedCards; },
        set(value) { loadedCards = value; }
    });
    Object.defineProperty(mpState, 'loadingCards', {
        get() { return loadingCards; },
        set(value) { loadingCards = value; }
    });
    Object.defineProperty(mpState, 'toolboxCards', {
        get() { return toolboxCards; },
        set(value) { toolboxCards = value; }
    });
    Object.defineProperty(mpState, 'toolboxMode', {
        get() { return toolboxMode; },
        set(value) { toolboxMode = value; }
    });
    // ===== START THE FIRST SCREEN DURING PARSE =====
    // This script sits after #dashboard, so the generated first-screen shells
    // already exist and their fragments are usually already downloaded by the
    // head bootstrap. Adopting them here — instead of on DOMContentLoaded, and
    // instead of after cards.json — removes the serialisation the home page
    // used to have: HTML -> 136 KB catalogue index -> 1128 placeholders ->
    // first fragment fetch. initApp() still runs on DOMContentLoaded and owns
    // everything else; loadCardList() keeps these shells and builds around them.
    // Before the shells are adopted: adoptPrerenderedCards() runs
    // loadInitialCards(), which asks computeInitialBatch() how many tools the
    // first screen should hold, and that answer depends on the density the
    // visitor saved.
    applyDensity(currentDensity);
    // The window and the park before anything can mount: the device decides both
    // numbers, and every automatic mount path asks mountBudgetFree() about them.
    initLiveWindow();
    adoptPrerenderedCards();
