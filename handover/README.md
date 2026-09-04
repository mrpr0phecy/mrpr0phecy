# Handover — work from branch `arena/01a0629f-mrpr0phecy`

Everything below was produced on branch `arena/01a0629f-mrpr0phecy`, pushed at
commit **`a308efd`**. That branch **cannot be merged into `main`**:
`git merge-base` between them returns empty, because `main` was rewritten with
unrelated history. So this package exists to be **ported by hand**, not merged.

Checked against `origin/main` at **`82fa855`** on **2026-09-04**, when main had
**644 cards**.

Main's own `staff/OPEN.md` already tracks this work as **item 5a**:
*"Adopt @seo structured-data work … and @systems index.html perf work (lazy-load
fix, timer purge from `01a0629f`) — after rebase, minus D-006/D-007 violations."*
This package is that work, with the D-006/D-007 parts already removed.

---

## Read `DO-NOT-PORT.md` first

Three things in this branch must **not** be carried over, one of which violates
a binding owner ruling. See [`DO-NOT-PORT.md`](DO-NOT-PORT.md).

---

## What to port, in order of value

### 1. `index.html` loading fixes — the user-facing bug → [`port-manually/index-html-loader.md`](port-manually/index-html-loader.md)

Reported symptom: *"Failed to load 🎌 Anime Phrases & Tropes — NetworkError when
attempting to fetch resource. Keeps happening on some tools when the main page
loads."*

Cause, confirmed in `origin/main:index.html`: `executeLoadCard`'s comment says
*"Do NOT add to loadedCards — allow retry via observer or scroll"*, and its
`finally` block then calls `observer.unobserve(card)` unconditionally — so **one
transient NetworkError permanently kills that card** until the user clicks Retry
or reloads. Which cards break depends on which requests hiccup during the
page-load burst, which is why it is "some tools" and not all.

Seven independent fixes, each with exact before/after. **Every one was verified
still present in main** on 2026-09-04:

| Fix | Verified in main |
|---|---|
| Retry transient fetch failures; only unobserve on success | `observer.unobserve(card);` ×2 |
| Unfreeze lazy loading while searching/filtering | `entry.isIntersecting && !isSearching` |
| Throttle the fallback instead of debouncing; drop the 6-card cap | `if (loaded >= 6) break`, `setTimeout(scrollFallbackLoader, 150)` |
| `rootMargin` 400px → 1200px | `rootMargin: '400px'` |
| Delete 562 no-op rating-footer timers | `Initialize rating display with delay` |
| Search runs twice per keystroke (duplicate listeners) | `stickySearchInput.value = e.target.value;` + `debouncedSearch` ×3 |
| Separate "failed to load" from "failed to render" | shared `showCardError` |

Ruled out while diagnosing, so you do not repeat it: main has **no** CSP or
network-policy code in `index.html`; all `cards.json` titles are clean (0 contain
`&amp;`); the anime card uses `speechSynthesis`, not `fetch`.

### 2. Copy verbatim → [`copy-verbatim/`](copy-verbatim/)

New files, no counterpart on main, no conflicts:

| File | What it is |
|---|---|
| `scripts/check-card-js.py` | Runs every card's script blocks through `node --check`. ARCHITECTURE.md §9 records **seven cards that were completely dead in production** from a JS syntax error; that was found by hand and never guarded. Incremental by default, `--all` for the full sweep. |
| `scripts/tests/lazy-loader.test.js` | 5 assertions against the real extracted loader functions. |
| `scripts/tests/card-errors.test.js` | 7 assertions against the real error/recovery functions. |
| `reference/showCardError.js` | Reference implementation for porting step §7 above. |

The tests drive the **actual source out of `index.html`** with stubs — no browser
needed — so a mis-applied edit in step 1 fails the test rather than shipping.

### 3. `scripts/verify.sh` → [`patches/03-verify-sh-card-js-and-tests.patch`](patches/03-verify-sh-card-js-and-tests.patch)

Adds two sections: card JS syntax, and the loader tests. Main's `verify.sh` is
byte-identical to the base this was written against, so **this patch applies
cleanly** (verified with `patch --dry-run` against `origin/main`).

It deliberately **omits** the staff-facility section from the original branch —
main's `staff/OPEN.md` is a markdown table, incompatible with the
`scripts/check-staff.py` this branch wrote. See `DO-NOT-PORT.md`.

### 4. `cards/mrprophecy-tour-manager.html` → [`patches/01-card-404.patch`](patches/01-card-404.patch)

A live 404. The card is a public sitemap URL and links `href="listen.html"`,
which resolves to `/cards/listen.html`. ARCHITECTURE.md §9 documents this exact
bug as already fixed; this instance was missed. Verified present in main, and
the patch **applies cleanly**.

### 5. `scripts/check-cards.py` → [`patches/02-check-cards-guards.patch`](patches/02-check-cards-guards.patch)

Four new guards. **7 of 8 hunks apply; hunk 2 will conflict** — main edited the
`KNOWN_CATEGORIES` block (dropped `Boxing & Fight Scoring`, added `Sports`,
`Mind-Blowing Demos`, `Algorithms & Computer Science`). Resolve by **deleting the
whole `KNOWN_CATEGORIES` set**, which is what the hunk does anyway: categories
should be derived from `cards/cards.json` and cross-checked against `index.html`,
not maintained by hand in three places. That hand-maintained list is exactly how
the phantom `Boxing & Fight Scoring` category survived.

| Guard | Catches |
|---|---|
| Skip `${…}` in the id scan | Main's checker reports `id="${item.id}"` template placeholders as duplicate ids — 5 false positives that bury the real signal. Verified: 0 real duplicate ids across the catalogue. |
| Card links a root file without `../` | The 404 class in item 4. |
| A card with no interactive element | `cards/vocab.html` is **95 bytes on main** — one `<h2>`, catalogued as "📝 Word List Flashcards", in the sitemap. The next-smallest card is ~3.5 KB, so this cannot false-positive. |
| Doc counts / JSON-LD / filter pills vs `cards.json` | Count drift. Main is currently consistent at 644 — this keeps it that way. |

---

## Verifying after porting

```bash
node scripts/check-card-js.py --all     # expect: no syntax errors
python3 scripts/check-cards.py          # expect: CATALOGUE OK
node scripts/tests/lazy-loader.test.js  # expect: 5 assertions pass
node scripts/tests/card-errors.test.js  # expect: 7 assertions pass
bash scripts/verify.sh                  # expect: VERIFY PASSED
```

Every claim in this package was produced by running these, or by `grep` against
`origin/main`. The one thing **not** verified anywhere is browser behaviour — no
chromium was available and the workspace was over its 100 MB budget, so the
scroll feel has never been checked in a real browser by anyone.
