/* home-features.js — the main page's on-demand UI.

   Panels (palette, contributions, shared toolbox), the toolbox itself, the
   standalone-maximise modal, multi-tab toolbox sync and the alternate
   directory view live here rather than in home-app.js. Nothing in this file is
   needed to paint, show or scroll the grid, and it is ~36 KB of the app:
   loading it with the app meant every visitor compiled it before the first
   card appeared. home-app.js requests it at idle, or immediately if a click
   asks for a feature first.

   Shared state comes from window.__mpHome, declared by home-app.js: `state` is
   a live view of the app's own variables (getters/setters, not copies), `fn`
   the core functions called from here, `features` the registrations at the
   bottom. For every name registered there, home-app.js keeps a delegate of the
   same name, so its call sites are unchanged.
   scripts/tests/app-split.test.js fails if a registration and a delegate drift
   apart, or if a state name the core does not expose is reached for here.
*/
(function () {
    'use strict';

    const MP = window.__mpHome;
    if (!MP) return;                  // home-app.js missing: nothing to attach to
    const S = MP.state;
    const { showNotification, loadCard, getCardRating, saveRatings, transformCardScript, withViewTransition } = MP.fn;

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

    function initToolbox() {
        const toolbox = document.getElementById('toolbox');
        const toolboxTitle = document.getElementById('toolboxTitle');
        
        // Load saved toolbox mode
        const savedMode = localStorage.getItem('toolboxMode');
        if (savedMode && ['grid', 'list'].includes(savedMode)) {
            S.toolboxMode = savedMode;
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
            if (S.toolboxCards.length === 0) return;
            
            if (confirm(`Clear all ${toolboxCards.length} cards from toolbox?`)) {
                S.toolboxCards = [];
                S.expandedGridCards.clear();
                S.expandedListCards.clear();
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
                if (S.toolboxMode === 'grid' && toolbox.classList.contains('open')) {
                    updateGridLayout();
                }
            });
            resizeObserver.observe(toolbox);
        }
    }
    
    function switchToolboxMode(mode) {
        S.toolboxMode = mode;
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
        if (S.toolboxMode === 'grid') {
            toolbox.classList.add('grid-mode');
            document.getElementById('gridModeBtn').classList.add('active');
            modeText.textContent = 'Grid Mode';
            modeIcon.textContent = '🔲';
            modeInfo.textContent = 'Click cards to expand • Resize toolbox to adjust grid';
        } else if (S.toolboxMode === 'list') {
            toolbox.classList.add('list-mode');
            document.getElementById('listModeBtn').classList.add('active');
            modeText.textContent = 'List Mode';
            modeIcon.textContent = '📋';
            modeInfo.textContent = 'Click cards to expand • Clean list view';
        }
        
        // Save mode preference
        localStorage.setItem('toolboxMode', S.toolboxMode);
    }
    
    function updateGridLayout() {
        if (S.toolboxMode !== 'grid') return;
        
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
        
        if (S.toolboxCards.length === 0) {
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
        
        if (S.toolboxMode === 'grid') {
            renderGridMode();
        } else if (S.toolboxMode === 'list') {
            renderListMode();
        }
    }
    
    function renderGridMode() {
        const toolboxContent = document.getElementById('toolboxContent');
        
        toolboxContent.innerHTML = '<div class="grid-mode-container"></div>';
        const container = toolboxContent.querySelector('.grid-mode-container');
        
        S.toolboxCards.forEach((card, index) => {
            const isExpanded = S.expandedGridCards.has(index);
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
                if (S.expandedGridCards.has(index)) {
                    S.expandedGridCards.delete(index);
                } else {
                    S.expandedGridCards.add(index);
                }
                renderGridMode();
            }
        });
        
        const expandBtn = cardElement.querySelector('.expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (S.expandedGridCards.has(index)) {
                    S.expandedGridCards.delete(index);
                } else {
                    S.expandedGridCards.add(index);
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
        
        S.toolboxCards.forEach((card, index) => {
            const isExpanded = S.expandedListCards.has(index);
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
                if (S.expandedListCards.has(index)) {
                    S.expandedListCards.delete(index);
                } else {
                    S.expandedListCards.add(index);
                }
                renderListMode();
            });
        }
        
        const expandBtn = listItem.querySelector('.expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (S.expandedListCards.has(index)) {
                    S.expandedListCards.delete(index);
                } else {
                    S.expandedListCards.add(index);
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
        const existingIndex = S.toolboxCards.findIndex(card => card.name === name);
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
        
        S.toolboxCards.push(cardData);
        saveToolboxCards();
        
        // Switch to the specified mode
        if (mode && mode !== S.toolboxMode) {
            S.toolboxMode = mode;
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
        if (index >= 0 && index < S.toolboxCards.length) {
            const cardName = S.toolboxCards[index].name;
            S.toolboxCards.splice(index, 1);
            S.expandedGridCards.delete(index);
            S.expandedListCards.delete(index);
            saveToolboxCards();
            renderToolbox();
            showNotification(`Removed ${cardName} from toolbox`, 'success');
        }
    }
    
    function saveToolboxCardsCore() {
        localStorage.setItem('toolboxCards', JSON.stringify(S.toolboxCards));
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
                S.toolboxCards = JSON.parse(saved) || [];
                updateToolboxCardCount();
            }
        } catch (e) {
            console.error('Failed to load toolbox cards:', e);
            S.toolboxCards = [];
        }
    }
    
    function updateToolboxCardCount() {
        const countElement = document.getElementById('toolboxCardCount');
        if (countElement) {
            const count = S.toolboxCards.length;
            countElement.textContent = `(${count} card${count !== 1 ? 's' : ''})`;
        }
    }

    async function openStandaloneModalCore(cardName) {
        const modal = document.getElementById('standaloneModal');
        const titleEl = document.getElementById('standaloneModalTitle');
        const badgeEl = document.getElementById('standaloneModalCategory');
        const bodyEl = document.getElementById('standaloneModalBody');
        const newTabBtn = document.getElementById('standaloneModalNewTabBtn');
        if (!modal || !bodyEl) return;

        const meta = S.cardsMetaMap.get(cardName);
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
            const cached = S.cardCache.get(cardName);
            if (cached && (Date.now() - cached.timestamp) < (15 * 60 * 1000)) {
                html = cached.html;
            } else {
                const cardUrl = (meta && meta.path) || `cards/${cardName}.html`;
                const res = await fetch(cardUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                html = await res.text();
                S.cardCache.set(cardName, { html, timestamp: Date.now() });
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
                        const current = JSON.stringify(S.toolboxCards);
                        const incoming = JSON.stringify(e.data.cards);
                        if (current !== incoming) {
                            S.toolboxCards = e.data.cards;
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
            toolboxChannel.postMessage({ type: 'TOOLBOX_UPDATE', cards: S.toolboxCards });
        } catch {}
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
        S.directoryDirty = false;

        dirGrid.innerHTML = '';
        if (names.length === 0) return;

        let i = 0;
        const step = () => {
            if (token !== directoryRenderToken) return; // superseded
            const frag = document.createDocumentFragment();
            const end = Math.min(i + DIRECTORY_CHUNK, names.length);
            for (; i < end; i++) {
                const name = names[i];
                const meta = S.cardsMetaMap.get(name) || {};
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
            if (!S.loadedCards.has(cardName) && !S.loadingCards.has(cardName)) {
                loadCard(cardEl, cardName);
            }
        }
    }
    // (The idle trickle loader that used to be declared here is gone from the
    // core too — see "Warm-ahead" in home-app.js. The bundle must not keep a
    // dead copy of a policy the page has moved on from.)
    function setViewModeCore(mode) {
        S.currentViewMode = mode;
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
            if (S.directoryDirty) renderDirectoryList(S.lastMatchedNames);
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

    // ------------------------------------------------------------- registration
    // Every name here must have a same-named delegate in home-app.js (the guard
    // checks) — these are the entry points the core can reach.
    MP.features = {
        initPanels, initToolbox, setupStandaloneModal, setupBroadcastChannel,
        updateGridLayout, setViewMode, renderDirectoryList, handleDirectoryGridClick,
        openStandaloneModal, rateCard, copyEmbedCode, addCardToToolbox
    };
    MP.ready = true;

    // Startup, in place of the initApp() calls this code used to answer: wire
    // the panels and toolbox, the modal's own buttons, and multi-tab toolbox
    // sync. All of it before the replay below, because a queued click must land
    // on wired UI.
    setupBroadcastChannel();
    initToolbox();
    initPanels();
    setupStandaloneModal();

    // Anything the visitor asked for while this file was still downloading:
    // replay in order, so a click that queued "open the palette" still opens it.
    while (MP.queued.length) {
        const [name, args] = MP.queued.shift();
        try {
            if (MP.features[name]) MP.features[name].apply(null, args);
        } catch (err) {
            console.warn('feature replay failed:', name, err);
        }
    }
})();
