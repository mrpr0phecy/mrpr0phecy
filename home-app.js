    // ===== CONFIGURATION =====
    const CONFIG = {
        INITIAL_LOAD: 6,        // floor for the first batch; computeInitialBatch() sizes it to the viewport
        INITIAL_STAGGER: 18,    // ms between first-batch fetch starts (was 50, before
                                // that LOAD_DELAY: 100). MAX_CONCURRENT_LOADS already
                                // caps the work in flight, and the head bootstrap has
                                // usually downloaded the first screen's fragments
                                // before this runs, so a long stagger only delayed the
                                // cards below the first one.
        FETCH_TIMEOUT: 15000,   // ms before a card fetch is aborted and its slot freed
        MAX_AUTO_RETRIES: 2,    // silent retries before the card shows its error/Retry UI
        AUTO_RETRY_LIMIT: 3,    // extra scroll-driven retries per failed card before it rests for a manual Retry
        GITHUB_REPO: 'mrpr0phecy/mrpr0phecy',
        GITHUB_PATH: 'cards',
        STICKY_THRESHOLD: 200
    };
    
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
        loadRatings();
        loadCardList();
        setupEventListeners();
        setupStickyCommandBar();
        initToolbox();
        // Modern platform features
        registerServiceWorker();
        setupNavigationAPI();
        setupBroadcastChannel();
        setupScrollEnd();
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
        initPanels();
        applySavedSettings();
        setupMobileOptimizations();
        setupStandaloneModal();
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
    
    // ===== PANEL MANAGEMENT =====
    function initPanels() {
        // Close panels when clicking outside
        document.addEventListener('click', (e) => {
            const panels = document.querySelectorAll('.panel');
            const toolbox = document.getElementById('toolbox');
            
            panels.forEach(panel => {
                if (panel.classList.contains('open') && 
                    !e.target.closest('.panel') && 
                    !e.target.closest('.sticky-action-btn')) {
                    closePanel(panel);
                }
            });
            
            // For toolbox specifically
            if (toolbox.classList.contains('open') && 
                !e.target.closest('#toolbox') && 
                !e.target.closest('#stickyToolboxToggle')) {
                closeToolbox();
            }
        });
        
        // Escape key closes panels
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.panel.open').forEach(panel => {
                    closePanel(panel);
                });
                closeToolbox();
            }
        });
        
        // Setup individual panel toggles
        document.getElementById('stickyToolboxToggle').addEventListener('click', (e) => {
            toggleToolbox(e);
        });
        
        document.getElementById('stickyPaletteToggle').addEventListener('click', (e) => {
            togglePanel('palettePanel', e);
        });
        
        document.getElementById('stickyContributionsToggle').addEventListener('click', (e) => {
            togglePanel('contributionsPanel', e);
        });
        
        // Contributions close button
        document.getElementById('contributionsClose').addEventListener('click', () => {
            closePanel(document.getElementById('contributionsPanel'));
        });
        
        // Toolbox close button - FIXED
        document.getElementById('toolboxClose').addEventListener('click', (e) => {
            e.stopPropagation();
            closeToolbox();
        });
        
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
        
        // Premium sponsorship details toggle
        const premiumSponsorship = document.getElementById('premiumSponsorship');
        const premiumDetails = document.getElementById('premiumDetails');
        if (premiumSponsorship && premiumDetails) {
            premiumSponsorship.addEventListener('click', (e) => {
                if (!e.target.closest('a')) {
                    premiumDetails.classList.toggle('show');
                }
            });
        }
    }
    
    function toggleToolbox(event) {
        event.stopPropagation();
        const toolbox = document.getElementById('toolbox');
        // Modern: Try Popover API
        if (toolbox && typeof toolbox.showPopover === 'function') {
            try {
                if (toolbox.matches(':popover-open')) {
                    toolbox.hidePopover();
                    toolbox.classList.remove('open');
                    document.getElementById('stickyToolboxToggle').classList.remove('active');
                } else {
                    // Close other panels
                    document.querySelectorAll('.panel[popover]:popover-open').forEach(p => {
                        if (p !== toolbox) { try { p.hidePopover(); } catch {} }
                    });
                    document.querySelectorAll('.panel.open').forEach(p => closePanel(p));
                    toolbox.showPopover();
                    toolbox.classList.add('open');
                    document.getElementById('stickyToolboxToggle').classList.add('active');
                    renderToolbox();
                }
                return;
            } catch (e) {
                // fallback
            }
        }
        
        if (toolbox.classList.contains('open')) {
            closeToolbox();
        } else {
            // Close other panels
            document.querySelectorAll('.panel.open').forEach(panel => {
                closePanel(panel);
            });
            
            // Open toolbox
            toolbox.classList.add('open');
            document.getElementById('stickyToolboxToggle').classList.add('active');
            
            // Ensure it's visible and properly positioned
            renderToolbox();
        }
    }
    
    function closeToolbox() {
        const toolbox = document.getElementById('toolbox');
        if (toolbox && typeof toolbox.hidePopover === 'function') {
            try { if (toolbox.matches(':popover-open')) toolbox.hidePopover(); } catch {}
        }
        toolbox.classList.remove('open');
        document.getElementById('stickyToolboxToggle').classList.remove('active');
    }
    
    function togglePanel(panelId, event) {
        event.stopPropagation();
        const panel = document.getElementById(panelId);
        // Modern: Try Popover API first
        if (panel && typeof panel.showPopover === 'function') {
            try {
                // Close others via popover
                document.querySelectorAll('.panel[popover]:popover-open').forEach(p => {
                    if (p !== panel) {
                        try { p.hidePopover(); } catch {}
                    }
                });
                if (panel.matches(':popover-open')) {
                    panel.hidePopover();
                    document.querySelectorAll('.sticky-action-btn').forEach(btn => btn.classList.remove('active'));
                } else {
                    panel.showPopover();
                    document.querySelectorAll('.sticky-action-btn').forEach(btn => btn.classList.remove('active'));
                    event.target.classList.add('active');
                }
                return;
            } catch (e) {
                // Fall back to class-based
            }
        }
        // Fallback: class-based toggle
        const button = document.querySelector(`[id^="sticky"][id$="Toggle"]`);
        
        // Close all other panels
        document.querySelectorAll('.panel.open').forEach(p => {
            if (p !== panel) {
                closePanel(p);
            }
        });
        
        // Toggle current panel
        if (panel.classList.contains('open')) {
            closePanel(panel);
        } else {
            panel.classList.add('open');
            // Update active button state
            document.querySelectorAll('.sticky-action-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        }
    }
    
    function closePanel(panel) {
        // Modern: hide popover if open
        if (panel && typeof panel.hidePopover === 'function') {
            try {
                if (panel.matches(':popover-open')) {
                    panel.hidePopover();
                }
            } catch {}
        }
        panel.classList.remove('open');
        document.querySelectorAll('.sticky-action-btn').forEach(btn => btn.classList.remove('active'));
    }
    
    // ===== IMPROVED TOOLBOX SYSTEM =====
    function initToolbox() {
        const toolbox = document.getElementById('toolbox');
        const toolboxTitle = document.getElementById('toolboxTitle');
        
        // Load saved toolbox mode
        const savedMode = localStorage.getItem('toolboxMode');
        if (savedMode && ['grid', 'list'].includes(savedMode)) {
            toolboxMode = savedMode;
        }
        
        // Update UI based on loaded mode
        updateToolboxMode();
        
        // Dragging for the entire toolbox
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        toolboxTitle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            
            isDragging = true;
            const rect = toolbox.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            document.addEventListener('mousemove', onToolboxDrag);
            document.addEventListener('mouseup', stopToolboxDrag);
            toolboxTitle.style.cursor = 'grabbing';
        });
        
        function onToolboxDrag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            toolbox.style.left = (e.clientX - dragOffset.x) + 'px';
            toolbox.style.top = (e.clientY - dragOffset.y) + 'px';
            toolbox.style.right = 'auto';
            toolbox.style.bottom = 'auto';
        }
        
        function stopToolboxDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', onToolboxDrag);
            document.removeEventListener('mouseup', stopToolboxDrag);
            toolboxTitle.style.cursor = '';
        }
        
        // Mode buttons - ONLY IN TOOLBOX
        document.getElementById('gridModeBtn').addEventListener('click', () => {
            switchToolboxMode('grid');
        });
        
        document.getElementById('listModeBtn').addEventListener('click', () => {
            switchToolboxMode('list');
        });
        
        document.getElementById('clearToolboxBtn').addEventListener('click', () => {
            if (toolboxCards.length === 0) return;
            
            if (confirm(`Clear all ${toolboxCards.length} cards from toolbox?`)) {
                toolboxCards = [];
                expandedGridCards.clear();
                expandedListCards.clear();
                saveToolboxCards();
                renderToolbox();
                showNotification('Toolbox cleared', 'success');
            }
        });
        
        // Load saved toolbox cards
        loadSavedToolboxCards();
        
        // Handle toolbox resize for grid mode
        let resizeObserver;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                if (toolboxMode === 'grid' && toolbox.classList.contains('open')) {
                    updateGridLayout();
                }
            });
            resizeObserver.observe(toolbox);
        }
    }
    
    function switchToolboxMode(mode) {
        toolboxMode = mode;
        updateToolboxMode();
        renderToolbox();
        showNotification(`Toolbox: Switched to ${mode} mode`, 'info');
    }
    
    function updateToolboxMode() {
        const toolbox = document.getElementById('toolbox');
        const modeText = document.getElementById('toolboxModeText');
        const modeIcon = document.getElementById('toolboxIcon');
        const modeInfo = document.getElementById('toolboxModeInfo');
        
        // Remove all mode classes
        toolbox.classList.remove('grid-mode', 'list-mode');
        
        // Update active mode buttons
        document.querySelectorAll('.toolbox-btn.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add current mode class and update UI
        if (toolboxMode === 'grid') {
            toolbox.classList.add('grid-mode');
            document.getElementById('gridModeBtn').classList.add('active');
            modeText.textContent = 'Grid Mode';
            modeIcon.textContent = '🔲';
            modeInfo.textContent = 'Click cards to expand • Resize toolbox to adjust grid';
        } else if (toolboxMode === 'list') {
            toolbox.classList.add('list-mode');
            document.getElementById('listModeBtn').classList.add('active');
            modeText.textContent = 'List Mode';
            modeIcon.textContent = '📋';
            modeInfo.textContent = 'Click cards to expand • Clean list view';
        }
        
        // Save mode preference
        localStorage.setItem('toolboxMode', toolboxMode);
    }
    
    function updateGridLayout() {
        if (toolboxMode !== 'grid') return;
        
        const toolbox = document.getElementById('toolbox');
        const container = document.querySelector('.grid-mode-container');
        if (!container) return;
        
        // Calculate optimal column width based on toolbox width
        const toolboxWidth = toolbox.offsetWidth;
        let columnWidth = 160; // Default
        
        if (toolboxWidth < 500) {
            columnWidth = 120;
        } else if (toolboxWidth < 600) {
            columnWidth = 140;
        } else if (toolboxWidth > 800) {
            columnWidth = 180;
        } else if (toolboxWidth > 1000) {
            columnWidth = 200;
        }
        
        // Update grid template
        container.style.gridTemplateColumns = `repeat(auto-fill, minmax(${columnWidth}px, 1fr))`;
    }
    
    function renderToolbox() {
        const toolboxContent = document.getElementById('toolboxContent');
        
        if (toolboxCards.length === 0) {
            toolboxContent.innerHTML = `
                <div class="toolbox-empty">
                    <div class="toolbox-empty-icon">🧰</div>
                    <h3 style="color:var(--accent);margin-bottom:8px;">Empty Toolbox</h3>
                    <p style="margin:0;">Add cards by clicking the grid/list buttons on any card</p>
                    <p style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary);">
                        ${toolboxMode === 'grid' ? 
                          '• Seamless resizable grid<br>• Click cards to expand<br>• Drag toolbox to reposition' : 
                          '• Clean expandable list<br>• Click cards to expand<br>• Drag toolbox to reposition'}
                    </p>
                </div>
            `;
            updateToolboxCardCount();
            return;
        }
        
        if (toolboxMode === 'grid') {
            renderGridMode();
        } else if (toolboxMode === 'list') {
            renderListMode();
        }
    }
    
    function renderGridMode() {
        const toolboxContent = document.getElementById('toolboxContent');
        
        toolboxContent.innerHTML = '<div class="grid-mode-container"></div>';
        const container = toolboxContent.querySelector('.grid-mode-container');
        
        toolboxCards.forEach((card, index) => {
            const isExpanded = expandedGridCards.has(index);
            const cardElement = createGridCard(card, index, isExpanded);
            container.appendChild(cardElement);
        });
        
        updateGridLayout();
        updateToolboxCardCount();
    }
    
    function createGridCard(card, index, isExpanded) {
        const cardElement = document.createElement('div');
        cardElement.className = `grid-mode-card ${isExpanded ? 'expanded' : ''}`;
        cardElement.dataset.index = index;
        const slug = card.slug || card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        cardElement.innerHTML = `
            <div class="grid-mode-card-header">
                <h4>${card.name}</h4>
                <div class="grid-mode-card-actions">
                    <a href="tool.html?card=${encodeURIComponent(slug)}" target="_blank" rel="noopener" class="grid-mode-card-btn" title="Maximise to Standalone Tool" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">
                        ⛶
                    </a>
                    <button class="grid-mode-card-btn expand-btn" title="${isExpanded ? 'Collapse' : 'Expand'}">
                        ${isExpanded ? '−' : '+'}
                    </button>
                    <button class="grid-mode-card-btn remove-btn" title="Remove">
                        ✕
                    </button>
                </div>
            </div>
            <div class="grid-mode-card-content">
                <div class="grid-mode-card-content-inner">${card.content}</div>
            </div>
        `;
        
        // Add event listeners
        cardElement.addEventListener('click', (e) => {
            if (!e.target.closest('.grid-mode-card-actions')) {
                if (expandedGridCards.has(index)) {
                    expandedGridCards.delete(index);
                } else {
                    expandedGridCards.add(index);
                }
                renderGridMode();
            }
        });
        
        const expandBtn = cardElement.querySelector('.expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (expandedGridCards.has(index)) {
                    expandedGridCards.delete(index);
                } else {
                    expandedGridCards.add(index);
                }
                renderGridMode();
            });
        }
        
        const removeBtn = cardElement.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeCardFromToolbox(index);
            });
        }
        
        return cardElement;
    }
    
    function renderListMode() {
        const toolboxContent = document.getElementById('toolboxContent');
        
        toolboxContent.innerHTML = '<div class="list-mode-container"></div>';
        const container = toolboxContent.querySelector('.list-mode-container');
        
        toolboxCards.forEach((card, index) => {
            const isExpanded = expandedListCards.has(index);
            const listItem = createListItem(card, index, isExpanded);
            container.appendChild(listItem);
        });
        
        updateToolboxCardCount();
    }
    
    function createListItem(card, index, isExpanded) {
        const listItem = document.createElement('div');
        listItem.className = `list-mode-item ${isExpanded ? 'expanded' : ''}`;
        listItem.dataset.index = index;
        const slug = card.slug || card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        listItem.innerHTML = `
            <div class="list-mode-item-header">
                <div class="list-mode-item-name">${card.name}</div>
            </div>
            <div class="list-mode-item-actions">
                <a href="tool.html?card=${encodeURIComponent(slug)}" target="_blank" rel="noopener" class="list-mode-item-btn" title="Maximise to Standalone Tool" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">
                    ⛶
                </a>
                <button class="list-mode-item-btn expand-btn" title="${isExpanded ? 'Collapse' : 'Expand'}">
                    ${isExpanded ? '−' : '+'}
                </button>
                <button class="list-mode-item-btn remove" title="Remove">
                    ✕
                </button>
            </div>
            <div class="list-mode-item-content">
                ${card.content}
            </div>
        `;
        
        // Add event listeners
        const header = listItem.querySelector('.list-mode-item-header');
        if (header) {
            header.addEventListener('click', (e) => {
                if (expandedListCards.has(index)) {
                    expandedListCards.delete(index);
                } else {
                    expandedListCards.add(index);
                }
                renderListMode();
            });
        }
        
        const expandBtn = listItem.querySelector('.expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (expandedListCards.has(index)) {
                    expandedListCards.delete(index);
                } else {
                    expandedListCards.add(index);
                }
                renderListMode();
            });
        }
        
        const removeBtn = listItem.querySelector('.remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeCardFromToolbox(index);
            });
        }
        
        return listItem;
    }
    
    function addCardToToolbox(name, contentHTML, mode, slug) {
        // Check if card already exists
        const existingIndex = toolboxCards.findIndex(card => card.name === name);
        if (existingIndex !== -1) {
            showNotification(`${name} is already in toolbox`, 'info');
            return;
        }
        
        const cardData = {
            id: `card-${Date.now()}`,
            name: name,
            slug: slug || '',
            content: contentHTML,
            timestamp: Date.now()
        };
        
        toolboxCards.push(cardData);
        saveToolboxCards();
        
        // Switch to the specified mode
        if (mode && mode !== toolboxMode) {
            toolboxMode = mode;
            updateToolboxMode();
        }
        
        // Open toolbox if not already open
        const toolbox = document.getElementById('toolbox');
        if (!toolbox.classList.contains('open')) {
            toolbox.classList.add('open');
            document.getElementById('stickyToolboxToggle').classList.add('active');
        }
        
        renderToolbox();
        showNotification(`Added ${name} to toolbox ${mode || toolboxMode} mode`, 'success');
    }
    
    function removeCardFromToolbox(index) {
        if (index >= 0 && index < toolboxCards.length) {
            const cardName = toolboxCards[index].name;
            toolboxCards.splice(index, 1);
            expandedGridCards.delete(index);
            expandedListCards.delete(index);
            saveToolboxCards();
            renderToolbox();
            showNotification(`Removed ${cardName} from toolbox`, 'success');
        }
    }
    
    function saveToolboxCardsCore() {
        localStorage.setItem('toolboxCards', JSON.stringify(toolboxCards));
        updateToolboxCardCount();
    }
    

    function saveToolboxCards() {
        saveToolboxCardsCore();
        // Modern: sync across tabs via BroadcastChannel
        try { broadcastToolbox(); } catch {}
    }
    function loadSavedToolboxCards() {
        try {
            const saved = localStorage.getItem('toolboxCards');
            if (saved) {
                toolboxCards = JSON.parse(saved) || [];
                updateToolboxCardCount();
            }
        } catch (e) {
            console.error('Failed to load toolbox cards:', e);
            toolboxCards = [];
        }
    }
    
    function updateToolboxCardCount() {
        const countElement = document.getElementById('toolboxCardCount');
        if (countElement) {
            const count = toolboxCards.length;
            countElement.textContent = `(${count} card${count !== 1 ? 's' : ''})`;
        }
    }
    
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
                // The whole catalogue is now in the DOM: start the idle
                // trickle so every remaining face quietly becomes a live
                // tool without waiting for scrolls or clicks.
                startIdleTrickle();
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
            if (!name || loadedCards.has(name) || loadingCards.has(name)) return;
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
        window.addEventListener('resize', onScrollLoad, { passive: true });
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
    
    // The catalogue is intentionally one card per row. Load the first
    // viewport plus a comfortable look-ahead instead of deriving a batch from
    // the old multi-column grid. The fallback sweep below runs again after
    // layout settles, so a tool that grows after its script starts cannot leave
    // the next visible card stuck on a skeleton.
    function computeInitialBatch() {
        const viewportHeight = window.innerHeight || 800;
        const estimatedCardHeight = 320;
        const lookAhead = 520;
        const viewportCards = Math.ceil((viewportHeight + lookAhead) / estimatedCardHeight);
        return Math.min(12, Math.max(CONFIG.INITIAL_LOAD, viewportCards));
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
    // Four concurrent fetch/render jobs are enough to cover the visible
    // one-column viewport while leaving the main thread responsive for the
    // interactive tools themselves (especially canvas-heavy cards).
    const MAX_CONCURRENT_LOADS = 4;
    const retryCounts = new Map();

    // A card hidden by the current search/category filter must never take a
    // fetch slot — but it must also not be dropped for good (see observer).
    function isCardHidden(card) {
        return card.style.display === 'none';
    }

    function loadCard(card, cardName) {
        if (loadedCards.has(cardName) || loadingCards.has(cardName)) return;
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
                    cardCache.set(cardName, { html: prefetchedHtml, timestamp: Date.now() });
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
            
            // Cache the content
            cardCache.set(cardName, {
                html: html,
                timestamp: Date.now()
            });
            
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
            cardSandbox.innerHTML = '';
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
            
            // Add footer to card
            const footer = document.createElement('div');
            footer.className = 'card-footer';
            footer.id = `footer-${cardName}`;
            card.appendChild(footer);
            
            // Update rating display
            updateCardRatingDisplay(card, cardName);
            
            card.classList.remove('card-pending');
            card.classList.add('loaded', 'visible');
            updateSiteStats();
            
            // Auto-adjust card height. Content can expand substantially after
            // a tool's script paints (canvas, tables, result panels), so
            // immediately re-check the viewport after the measurement rather
            // than waiting for a user scroll.
            setTimeout(() => {
                adjustCardHeight(card);
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
                const cardSandbox = cardElement.querySelector('.card-sandbox');
                if (cardSandbox) {
                    addCardToToolbox(displayName, cardSandbox.innerHTML, 'grid', cardName);
                }
            });
        }
        
        if (addListBtn) {
            addListBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const displayName = cardElement.dataset.displayName;
                const cardSandbox = cardElement.querySelector('.card-sandbox');
                if (cardSandbox) {
                    addCardToToolbox(displayName, cardSandbox.innerHTML, 'list', cardName);
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
        card.classList.remove('card-pending');
        card.classList.add('loaded', 'visible');
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
                    
                    if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                        loadCard(card, cardName);
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '600px 0px',
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
            const candidates = visible.concat(lookAhead).slice(0, MAX_CONCURRENT_LOADS);

            candidates.forEach(({ card, cardName }) => {
                card.classList.add('loading-fallback');
                loadCard(card, cardName);
            });

            pendingCards = stillPending;
            retryErroredCards();
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
        
        // Category pills filter
        document.querySelectorAll('.cat-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentSelectedCategory = pill.dataset.category;
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
                    setTimeout(() => {
                        if (loadAllBtn && loadAllBtn.dataset.armed) {
                            delete loadAllBtn.dataset.armed;
                            loadAllBtn.textContent = '⚡ Load all';
                        }
                    }, 6000);
                    return;
                }
                delete loadAllBtn.dataset.armed;
                loadAllBtn.textContent = '⚡ Load all';
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
    
    // ===== STANDALONE MAXIMISE MODAL CONTROLLER =====
    async function openStandaloneModalCore(cardName) {
        const modal = document.getElementById('standaloneModal');
        const titleEl = document.getElementById('standaloneModalTitle');
        const badgeEl = document.getElementById('standaloneModalCategory');
        const bodyEl = document.getElementById('standaloneModalBody');
        const newTabBtn = document.getElementById('standaloneModalNewTabBtn');
        if (!modal || !bodyEl) return;

        const meta = cardsMetaMap.get(cardName);
        const title = meta && meta.title ? meta.title : cardName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const category = meta && meta.category ? meta.category : 'Interactive Tool';
        const toolUrl = `tool.html?card=${encodeURIComponent(cardName)}`;

        if (titleEl) titleEl.textContent = title;
        if (badgeEl) badgeEl.textContent = category;
        if (newTabBtn) newTabBtn.href = toolUrl;

        bodyEl.innerHTML = `
            <div class="cool-loader" role="status">
                <div class="cool-loader-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
                <div class="cool-loader-text">Loading <strong>${title}</strong><span class="cool-dots"></span></div>
            </div>
        `;

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        try {
            let html = '';
            const cached = cardCache.get(cardName);
            if (cached && (Date.now() - cached.timestamp) < (15 * 60 * 1000)) {
                html = cached.html;
            } else {
                const cardUrl = (meta && meta.path) || `cards/${cardName}.html`;
                const res = await fetch(cardUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                html = await res.text();
                cardCache.set(cardName, { html, timestamp: Date.now() });
            }

            bodyEl.innerHTML = '';

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const scripts = Array.from(doc.querySelectorAll('script'));
            scripts.forEach(s => s.remove());

            const styles = Array.from(doc.querySelectorAll('style'));
            styles.forEach(s => s.remove());

            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'max-width:920px;margin:0 auto;';
            while (doc.body.firstChild) {
                contentDiv.appendChild(doc.body.firstChild);
            }
            bodyEl.appendChild(contentDiv);

            // Inject styles
            styles.forEach(s => {
                const newStyle = document.createElement('style');
                newStyle.textContent = s.textContent;
                bodyEl.appendChild(newStyle);
            });

            // Inject scripts
            scripts.forEach(s => {
                try {
                    const newScript = document.createElement('script');
                    Array.from(s.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.textContent = transformCardScript(s.textContent);
                    bodyEl.appendChild(newScript);
                } catch (scriptErr) {
                    console.warn(`Error running script in standalone modal for ${cardName}:`, scriptErr);
                }
            });

        } catch (err) {
            bodyEl.innerHTML = `
                <div style="text-align:center;padding:40px;color:#ff4d4d;">
                    <h3>Failed to load ${title}</h3>
                    <p style="color:rgba(230,250,255,0.7);">${err.message}</p>
                    <a href="${toolUrl}" target="_blank" rel="noopener" class="standalone-modal-btn new-tab-btn" style="margin-top:16px;">Open in Separate Page ↗</a>
                </div>
            `;
        }
    }


    async function openStandaloneModal(cardName) {
        if (document.startViewTransition) {
            try {
                document.startViewTransition(async () => {
                    await openStandaloneModalCore(cardName);
                });
                return;
            } catch {}
        }
        await openStandaloneModalCore(cardName);
    }

    function closeStandaloneModal() {
        const modal = document.getElementById('standaloneModal');
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        const bodyEl = document.getElementById('standaloneModalBody');
        if (bodyEl) bodyEl.innerHTML = '';
    }

    function setupStandaloneModal() {
        const modalBackdrop = document.getElementById('standaloneModalBackdrop');
        const modalCloseBtn = document.getElementById('standaloneModalCloseBtn');
        const modalShareBtn = document.getElementById('standaloneModalShareBtn');

        if (modalBackdrop) modalBackdrop.addEventListener('click', closeStandaloneModal);
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeStandaloneModal);
        if (modalShareBtn) {
            modalShareBtn.addEventListener('click', () => {
                const newTabBtn = document.getElementById('standaloneModalNewTabBtn');
                const url = newTabBtn ? newTabBtn.href : window.location.href;
                navigator.clipboard.writeText(url).then(() => {
                    showNotification('Standalone tool link copied to clipboard!', 'success');
                }).catch(() => {
                    showNotification('Link: ' + url, 'info');
                });
            });
        }

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('standaloneModal');
                if (modal && modal.classList.contains('open')) {
                    closeStandaloneModal();
                }
            }
        });
    }
    
    function rateCard(cardName, action) {
        const rating = getCardRating(cardName);
        
        // Remove previous vote if exists
        if (rating.userVote === 'up') rating.up--;
        if (rating.userVote === 'down') rating.down--;
        
        // Add new vote
        if (action === 'up') {
            rating.up++;
            rating.userVote = 'up';
            showNotification('Thanks! Marked as useful 👍', 'success');
        } else {
            rating.down++;
            rating.userVote = 'down';
            showNotification('Thanks for feedback! We\'ll review 👎', 'info');
        }
        
        saveRatings();
    }
    
    function copyEmbedCode(cardName) {
        const displayName = cardName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const embedCode = `<iframe src="${window.location.origin}/tool.html?card=${encodeURIComponent(cardName)}" width="100%" height="450" style="border:none;border-radius:12px;" title="${displayName}"></iframe>`;
        
        navigator.clipboard.writeText(embedCode).then(() => {
            const embedBtn = document.querySelector(`.embed-btn[data-card="${cardName}"]`);
            if (embedBtn) {
                embedBtn.innerHTML = '<span>✅</span><span>Copied!</span>';
                embedBtn.classList.add('copied');
                
                setTimeout(() => {
                    embedBtn.innerHTML = '<span>🔗</span><span>Embed</span>';
                    embedBtn.classList.remove('copied');
                }, 2000);
            }
            showNotification('Embed code copied to clipboard', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            showNotification('Failed to copy embed code', 'error');
        });
    }
    
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
    function parseIndexDeepLink(search) {
        const out = { q: '', expand: '' };
        try {
            const params = new URLSearchParams(search || '');
            out.q = (params.get('q') || '').trim();
            const raw = (params.get('expand') || '').trim().toLowerCase();
            // Catalogue slugs are [a-z0-9-]. Anything else is ignored here —
            // the value is only ever used for map lookup, never rendered.
            out.expand = /^[a-z0-9-]{1,80}$/.test(raw) ? raw : '';
        } catch (err) { /* malformed query string: plain homepage */ }
        return out;
    }

    // Runs once, after the catalogue is ready (see loadCardList). Never
    // throws: a broken deep link must leave the homepage exactly as it was.
    function applyIndexDeepLink() {
        try {
            const link = parseIndexDeepLink(window.location.search);
            if (!link.q && !link.expand) return;
            const main = document.getElementById('mainSearchInput');
            const sticky = document.getElementById('stickySearchInput');
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
            const rules = {
                prerender: [{ where: { href_matches: "*/tool.html?card=*" }, eagerness: "moderate" }],
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

    // Modern: BroadcastChannel for multi-tab toolbox sync
    let toolboxChannel = null;
    function setupBroadcastChannel() {
        if (!('BroadcastChannel' in window)) return;
        try {
            toolboxChannel = new BroadcastChannel('toolbox-sync');
            toolboxChannel.onmessage = (e) => {
                if (e.data && e.data.type === 'TOOLBOX_UPDATE') {
                    // Sync toolbox from other tab
                    if (Array.isArray(e.data.cards)) {
                        const current = JSON.stringify(toolboxCards);
                        const incoming = JSON.stringify(e.data.cards);
                        if (current !== incoming) {
                            toolboxCards = e.data.cards;
                            saveToolboxCards();
                            renderToolbox();
                        }
                    }
                }
            };
        } catch {}
    }
    function broadcastToolbox() {
        if (!toolboxChannel) return;
        try {
            toolboxChannel.postMessage({ type: 'TOOLBOX_UPDATE', cards: toolboxCards });
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
                if (cardEl && !loadedCards.has(name) && !loadingCards.has(name)) {
                    if (visibleCount <= 12) {
                        loadCard(cardEl, name);
                    }
                }
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
        // Anything beyond the first 12 that lands in the viewport (or is
        // scrolled to later) is picked up by the sweep + observer, which no
        // longer ignore cards while a filter is active.
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
                // Update speculation rules after VT
                postTask(() => updateSpeculationRules());
                return;
            } catch (e) {
                document.__vtRunning = false;
            }
        }
        applyFiltersCore();
        postTask(() => { assignVTNames(); updateSpeculationRules(); });
    }

    // Chunked render: appending all 1223 directory rows at once blocked the
    // main thread for ~1s. Batches of 200 across frames keep the view switch
    // instant, and the token drops stale passes if filters change mid-render.
    // "View Card" clicks are handled by one delegated listener (attached in
    // setupEventListeners), not 1223 individual addEventListener calls.
    let directoryRenderToken = 0;
    const DIRECTORY_CHUNK = 200;
    function renderDirectoryList(names) {
        const dirGrid = document.getElementById('directoryGrid');
        if (!dirGrid) return;
        const token = ++directoryRenderToken;
        directoryDirty = false;

        dirGrid.innerHTML = '';
        if (names.length === 0) return;

        let i = 0;
        const step = () => {
            if (token !== directoryRenderToken) return; // superseded
            const frag = document.createDocumentFragment();
            const end = Math.min(i + DIRECTORY_CHUNK, names.length);
            for (; i < end; i++) {
                const name = names[i];
                const meta = cardsMetaMap.get(name) || {};
                const title = meta.title || name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const desc = meta.description || 'Interactive tool on The Most Useful Site in the World.';
                const cat = meta.category || 'Productivity & Lifestyle';

                const card = document.createElement('div');
                card.className = 'directory-card';
                card.innerHTML = `
                    <div>
                        <div class="directory-header">
                            <h4 class="directory-title">${title}</h4>
                            <span class="directory-cat-badge">${cat}</span>
                        </div>
                        <p class="directory-desc">${desc}</p>
                    </div>
                    <div class="directory-actions">
                        <a href="tool.html?card=${encodeURIComponent(name)}" class="directory-open-link" target="_blank" rel="noopener">
                            <span>Open Standalone</span> <span>↗</span>
                        </a>
                        <button type="button" class="dir-view-card-btn" data-card="${name}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.75rem;padding:2px 6px;">
                            View Card 🔲
                        </button>
                    </div>
                `;
                frag.appendChild(card);
            }
            dirGrid.appendChild(frag);
            if (i < names.length) requestAnimationFrame(step);
        };
        step();
    }

    function handleDirectoryGridClick(e) {
        const btn = e.target.closest('.dir-view-card-btn');
        if (!btn) return;
        const cardName = btn.dataset.card;
        setViewMode('cards');
        const cardEl = document.querySelector(`.card[data-name="${cardName}"]`);
        if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                loadCard(cardEl, cardName);
            }
        }
    }

    // Queue every visible, not-yet-loaded card at once. The existing pipeline
    // stays in charge (nearest-first, MAX_CONCURRENT_LOADS at a time), so the
    // page never blocks — cards simply go live continuously. No loading UI
    // exists any more: faces swap to live tools as each fragment arrives.
    function loadAllToolsNow() {
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

    // ===== IDLE TRICKLE LOADER =====
    // The card faces already display the whole catalogue with no loading
    // screens; this pass goes further and brings every tool fully live in
    // the background — no scroll, no click — a few cards at a time. The
    // shared pipeline stays in charge (nearest-to-viewport first, at most
    // MAX_CONCURRENT_LOADS fetches), so the trickle can never starve the
    // cards a visitor is actually looking at: their loads always win the
    // queue. Data-saver and 2G visitors keep faces + click-to-run instead
    // of a surprise catalogue download.
    const TRICKLE_BATCH = 6;
    const TRICKLE_INTERVAL = 2500;
    let trickleStarted = false;
    function startIdleTrickle() {
        if (trickleStarted) return;
        try {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn && (conn.saveData || /(^|\b)(slow-)?2g\b/i.test(conn.effectiveType || ''))) return;
        } catch (err) { /* connection info unavailable: trickle on */ }
        trickleStarted = true;
        const step = () => {
            // A hidden tab neither loads nor entertains anyone: skip the
            // tick and keep the timer alive for when the visitor returns.
            if (!document.hidden) {
                let queued = 0;
                for (let i = 0; i < pendingCards.length && queued < TRICKLE_BATCH; i++) {
                    const card = pendingCards[i];
                    const name = card.dataset.name;
                    if (!name || loadedCards.has(name) || loadingCards.has(name)) continue;
                    if (card.dataset.errorReason || isCardHidden(card)) continue;
                    loadCard(card, name);
                    queued++;
                }
                // Nothing eligible left and the pipeline drained: every tool
                // the catalogue offers is live — done. Cards resting after
                // errors stay untouched here (bounded retries and the
                // manual Retry button own those).
                if (queued === 0 && activeLoads === 0 && loadQueue.length === 0) return;
            }
            setTimeout(step, TRICKLE_INTERVAL);
        };
        setTimeout(step, TRICKLE_INTERVAL);
    }

    function setViewModeCore(mode) {
        currentViewMode = mode;
        const dashboard = document.getElementById('dashboard');
        const dirView = document.getElementById('directoryView');
        const btnCards = document.getElementById('btnViewCards');
        const btnDir = document.getElementById('btnViewDirectory');

        if (mode === 'directory') {
            if (dashboard) dashboard.style.display = 'none';
            if (dirView) dirView.style.display = 'block';
            if (btnCards) btnCards.classList.remove('active');
            if (btnDir) btnDir.classList.add('active');
            // Lazily (re)build the list on first view and after any filter
            // change. This also fixes the old bug where opening Directory
            // before ever searching showed an empty list.
            if (directoryDirty) renderDirectoryList(lastMatchedNames);
        } else {
            if (dashboard) dashboard.style.display = 'grid';
            if (dirView) dirView.style.display = 'none';
            if (btnCards) btnCards.classList.add('active');
            if (btnDir) btnDir.classList.remove('active');
        }
    }

    function setViewMode(mode) {
        withViewTransition(() => {
            setViewModeCore(mode);
        });
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

    // ===== START THE FIRST SCREEN DURING PARSE =====
    // This script sits after #dashboard, so the generated first-screen shells
    // already exist and their fragments are usually already downloaded by the
    // head bootstrap. Adopting them here — instead of on DOMContentLoaded, and
    // instead of after cards.json — removes the serialisation the home page
    // used to have: HTML -> 136 KB catalogue index -> 1128 placeholders ->
    // first fragment fetch. initApp() still runs on DOMContentLoaded and owns
    // everything else; loadCardList() keeps these shells and builds around them.
    adoptPrerenderedCards();
