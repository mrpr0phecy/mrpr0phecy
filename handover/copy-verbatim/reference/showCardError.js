// Reference implementation, extracted verbatim from the branch this work was
// done on (arena/01a0629f-mrpr0phecy, commit a308efd). Drop these into
// index.html, replacing the existing showCardError / retryLoadCard.

    function showCardError(card, cardName, error, reason = 'load') {
        const cardSandbox = card.querySelector('.card-sandbox');
        if (!cardSandbox) return;

        const displayName = card.dataset.displayName || cardName;
        const heading = reason === 'render'
            ? `Couldn't render ${displayName}`
            : `Failed to load ${displayName}`;

        // Built with textContent, not string interpolation: the title and the
        // error message are data, and interpolating them let an ampersand or an
        // angle bracket change what the user read.
        cardSandbox.innerHTML = `
            <div class="card-sandbox-error">
                <div>
                    <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">⚠️</div>
                    <h3 class="card-error-title" style="color:#ff4d4d;margin-bottom:12px;"></h3>
                    <div class="card-error-detail" style="font-size:14px;opacity:0.8;max-width:300px;margin:0 auto;"></div>
                    <button class="card-error-retry" type="button" style="margin-top:20px;padding:8px 16px;background:rgba(45,212,255,0.1);border:1px solid rgba(45,212,255,0.3);color:var(--accent);border-radius:8px;cursor:pointer;">Retry</button>
                </div>
            </div>
        `;
        cardSandbox.querySelector('.card-error-title').textContent = heading;
        cardSandbox.querySelector('.card-error-detail').textContent =
            (error && error.message) || 'Unknown error';
        // Bound with addEventListener rather than an inline onclick string, so a
        // card name containing a quote cannot break out of the attribute.
        cardSandbox.querySelector('.card-error-retry')
            .addEventListener('click', () => retryLoadCard(cardName));

        card.classList.remove('loading');
        card.classList.add('loaded', 'visible');
        // Lets the recovery sweep find and retry it without user intervention.
        card.dataset.errorReason = reason;
    }

    function retryLoadCard(cardName, resetAllowance = true) {
        const card = document.querySelector(`.card[data-name="${cardName}"]`);
        if (card) {
            card.classList.add('loading');
            card.classList.remove('loaded', 'visible');
            if (resetAllowance) card.dataset.autoRetries = '0';
            delete card.dataset.errorReason;
            loadedCards.delete(cardName);
            loadingCards.delete(cardName);
            loadCard(card, cardName);
        }
    }

    // ===== AUTOMATIC RECOVERY FOR FAILED CARDS =====
    // A transient NetworkError during the page-load burst used to leave a card
    // showing an error until the user noticed and clicked Retry. This sweep
    // retries the ones that failed to *load* (not the ones that failed to
    // render — re-injecting a broken fragment will just break again), without
    // the user having to do anything.
    const AUTO_RETRY_LIMIT = 3;

    function retryErroredCards() {
        const failed = document.querySelectorAll('.card[data-error-reason="load"]');
        if (!failed.length) return;

        const viewportBottom = window.scrollY + window.innerHeight;
        let retried = 0;

        failed.forEach(card => {
            if (retried >= 4) return;
            const cardName = card.dataset.name;
            if (!cardName) return;

            const tries = parseInt(card.dataset.autoRetries || '0', 10);
            if (tries >= AUTO_RETRY_LIMIT) return;

            // Only bother with cards the user can actually see, so a page-load
            // burst does not turn into a permanent background retry loop.
            const rect = card.getBoundingClientRect();
            const cardTop = rect.top + window.scrollY;
            if (cardTop > viewportBottom + 600 || cardTop + rect.height < window.scrollY - 600) return;

            card.dataset.autoRetries = String(tries + 1);
            delete card.dataset.errorReason;
            card.classList.remove('loading-fallback');
            retryLoadCard(cardName, false);
            retried++;
        });
    }

