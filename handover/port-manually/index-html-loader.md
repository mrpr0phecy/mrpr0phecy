# Port: index.html loading fixes

Main's `index.html` has diverged a long way from the branch this work was done
on, so **do not apply a patch** — make these edits by hand. Every target below
was verified present in `origin/main:index.html` on 2026-09-04.

Order matters only in that each change is independent; do them one at a time
and re-run `node --check` on the extracted script blocks after each.

Check D-007 before you finish: none of these touch analytics, so none should
conflict, but confirm you have not added GA to any page while you were in here.

---

## 1. THE USER-FACING BUG — one NetworkError kills a card permanently

**Find** (in `executeLoadCard`):

```js
        } catch (error) {
            console.error(`Failed to load card ${cardName}:`, error);
            showCardError(card, cardName, error);
            // Do NOT add to loadedCards — allow retry via observer or scroll
        } finally {
            loadingCards.delete(cardName);

            if (observer) {
                observer.unobserve(card);
            }
        }
```

The comment promises a retry path and the `finally` destroys it. This is why
"Failed to load … NetworkError" sticks on some tools at page load.

**Replace with:**

```js
        } catch (error) {
            // Transient failures are common during a fast scroll, when several
            // fetches are in flight at once. Retry twice before showing the
            // error UI, so one hiccup does not leave a permanently broken card.
            const attempt = cardRetryCount.get(cardName) || 0;
            if (attempt < 2) {
                cardRetryCount.set(cardName, attempt + 1);
                card.classList.remove('loading-fallback');   // allow re-entry
                loadingCards.delete(cardName);
                await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
                loadCard(card, cardName);
                return;
            }
            console.error(`Failed to load card ${cardName}:`, error);
            showCardError(card, cardName, error);
        } finally {
            loadingCards.delete(cardName);

            // Only stop observing once the card really is loaded.
            if (observer && loadedCards.has(cardName)) {
                observer.unobserve(card);
            }
        }
```

Also declare the counter next to `loadedCards` / `loadingCards`:

```js
    let cardRetryCount = new Map();   // automatic retries per card after a failed fetch
```

and clear it on the success path, immediately after `loadedCards.add(cardName);`:

```js
            cardRetryCount.delete(cardName);
```

---

## 2. Lazy loading is frozen while searching or filtering

**Find** (in the `IntersectionObserver` callback):

```js
                if (entry.isIntersecting && !isSearching) {
```

`applyFilters()` sets `isSearching` for **any** query or category pick, and this
guard plus two others stop every loader. Only the first 12 matches are ever
loaded, so a 120-tool category shows "Loading…" forever.

**Replace with:**

```js
                // Deliberately not gated on isSearching: gating it froze every
                // loader while filtering. Hidden cards never intersect, so they
                // are skipped naturally, and the queue caps concurrency.
                if (entry.isIntersecting) {
```

**Also find** the two other gates and remove them:

```js
        if (scrollLoadActive || isSearching) return;     // in scrollFallbackLoader
        setInterval(() => { if (!isSearching) scrollFallbackLoader(); }, 3000);
```

The interval becomes:

```js
                setInterval(() => { scrollFallbackLoader(); }, 3000);
```

`scrollFallbackLoader` must skip filtered-out cards itself, or their zeroed
`getBoundingClientRect()` will match the viewport test — see §3.

---

## 3. The fallback loader is capped and debounced

**Find:**

```js
    function scrollFallbackLoader() {
        if (scrollLoadActive || isSearching) return;
        scrollLoadActive = true;
        ...
            if (loaded >= 6) break;
        ...
        scrollLoadActive = false;
    }

    function onScrollLazyLoad() {
        if (scrollLoadTimeout) clearTimeout(scrollLoadTimeout);
        scrollLoadTimeout = setTimeout(scrollFallbackLoader, 150);
    }
```

Two problems: a debounce never fires during *continuous* scrolling (the timeout
is cleared on every event), and the 6-card cap means recovery after a fast
scroll takes ~20 s at six per 3-second tick. `scrollLoadActive` is dead code —
it is set and cleared inside the same synchronous function.

**Replace both functions with:**

```js
    function scrollFallbackLoader() {
        const viewportTop = window.scrollY - 300;
        const viewportBottom = window.scrollY + window.innerHeight + 300;

        const unloadedCards = document.querySelectorAll('.card:not(.loaded):not(.loading-fallback)');
        const inView = [];

        for (let i = 0; i < unloadedCards.length; i++) {
            const card = unloadedCards[i];
            // Filtered-out cards are display:none; their rect is all zeroes,
            // which would otherwise match the viewport test.
            if (card.style.display === 'none' || card.offsetParent === null) continue;

            const rect = card.getBoundingClientRect();
            const cardTop = rect.top + window.scrollY;
            const cardBottom = cardTop + rect.height;

            if (cardBottom >= viewportTop && cardTop <= viewportBottom) {
                const cardName = card.dataset.name;
                if (cardName && !loadedCards.has(cardName) && !loadingCards.has(cardName)) {
                    const centre = (cardTop + cardBottom) / 2;
                    const target = window.scrollY + window.innerHeight / 2;
                    inView.push({ card, cardName, dist: Math.abs(centre - target) });
                }
            }
        }

        // No per-call cap: MAX_CONCURRENT_LOADS + the queue already throttle the
        // network. Nearest first, so a fast scroll fills in what you can see.
        inView.sort((a, b) => a.dist - b.dist);
        inView.forEach(({ card, cardName }) => {
            card.classList.add('loading-fallback');
            loadCard(card, cardName);
        });
    }

    function onScrollLazyLoad() {
        // Throttle with a trailing call, not a debounce.
        const now = Date.now();
        const remaining = SCROLL_LOAD_INTERVAL - (now - lastScrollLoadRun);

        if (remaining <= 0) {
            lastScrollLoadRun = now;
            if (scrollLoadTimeout) { clearTimeout(scrollLoadTimeout); scrollLoadTimeout = null; }
            scrollFallbackLoader();
        } else if (!scrollLoadTimeout) {
            scrollLoadTimeout = setTimeout(() => {
                scrollLoadTimeout = null;
                lastScrollLoadRun = Date.now();
                scrollFallbackLoader();
            }, remaining);
        }
    }
```

And replace the state declarations:

```js
    let scrollLoadTimeout = null;
    let scrollLoadActive = false;
```

with:

```js
    let scrollLoadTimeout = null;
    let lastScrollLoadRun = 0;
    const SCROLL_LOAD_INTERVAL = 200;   // ms between fallback passes while scrolling
```

---

## 4. rootMargin is too tight

**Find:** `rootMargin: '400px',` and `threshold: 0.1`

**Replace with:** `rootMargin: '1200px 0px',` and `threshold: 0.01`

---

## 5. 562 timers that do nothing

**Find** (in the card-creation loop, after `dashboard.appendChild(card);`):

```js
                // Initialize rating display with delay
                setTimeout(() => {
                    updateCardRatingDisplay(card, cardName);
                }, 100);
```

**Delete it.** The footer element it looks for is created in
`renderCardContent` when the card actually loads, and that function already
calls `updateCardRatingDisplay` immediately after creating it. Every one of
these timers did a `querySelector`, found nothing, and returned.

---

## 6. Search runs twice per keystroke

`setupStickyCommandBar()` and `setupEventListeners()` **both** bind `input`
listeners to both search boxes. The one in `setupStickyCommandBar` calls
`performSearch` immediately and undebounced, which defeats the 300 ms debounce
in the other and runs the full filter + directory rebuild twice per keystroke.

**Find:**

```js
        // Sync search inputs
        if (mainSearchInput && stickySearchInput) {
            mainSearchInput.addEventListener('input', (e) => {
                stickySearchInput.value = e.target.value;
                performSearch(e.target.value);
            });

            stickySearchInput.addEventListener('input', (e) => {
                mainSearchInput.value = e.target.value;
                performSearch(e.target.value);
            });
        }
```

**Replace with** (value-sync only; the debounced handler does the filtering):

```js
        // Sync search inputs. Value-sync only — do NOT call performSearch()
        // here. setupEventListeners() binds a debounced 'input' handler to both
        // boxes, and a second undebounced one made every keystroke run the full
        // filter and directory rebuild twice and defeated the debounce.
        if (mainSearchInput && stickySearchInput) {
            mainSearchInput.addEventListener('input', (e) => {
                stickySearchInput.value = e.target.value;
            });

            stickySearchInput.addEventListener('input', (e) => {
                mainSearchInput.value = e.target.value;
            });
        }
```

---

## 7. "Failed to load" is reported for render failures too

`renderCardContent`'s catch calls the same `showCardError` as a fetch failure,
so a card that downloaded fine but broke during injection is reported as a
network problem — which sends whoever debugs it after the wrong thing.

Give `showCardError` a `reason` parameter (`'load'` default, `'render'` from
`renderCardContent`'s catch) and word the heading accordingly. While you are in
there, build the error UI with `textContent` rather than interpolating the title
and `error.message` into `innerHTML`, and bind the Retry button with
`addEventListener` instead of an inline `onclick` string.

The finished function is in
[`../copy-verbatim/reference/showCardError.js`](reference/showCardError.js).

---

## Verifying

After the edits:

```bash
node scripts/check-card-js.py --all      # no card lost to a syntax error
bash scripts/verify.sh
node scripts/tests/lazy-loader.test.js   # 5 assertions against the real source
node scripts/tests/card-errors.test.js   # 7 assertions
```

The two test files extract the functions **out of `index.html`** and drive them
with stubs, so if an edit above was applied wrongly they will fail. No browser
needed.
