# CONSTRAINTS.md — the reasons behind the rules

AGENTS.md is the quick-start and local workflow authority. Open this reference
only when relevant to your task. This file holds what the code
cannot tell you: why the hard lines sit where they do, the owner's decisions,
and the card traps with the code that avoids each. Every trap names the check
that enforces it, so a failing check leads here.

History lives in git (`git log`, `gh pr list`) — don't write status into this
file.

---

## Hard lines — the fine print

The rules are AGENTS.md §3. The numbers match, and code comments cite them.

1. **Analytics stays exactly where it is.** `G-G058FVW6Z2` loads on the home
   page, the music cluster, both money pages and news — it does *not* go
   sitewide; `tool.html`, `404.html`, the cards and the standalone experiments
   stay clean. Changing the footprint in either direction is an owner call.
   Privacy claims are judged per page, against what that page itself loads: a
   page carrying GA must not deny measurement (a true, explicitly scoped line —
   "on the tools", "of its own" — is fine); a page loading nothing may say so.
   `scripts/check-finance.js` enforces it. Always true and always safe: *no ads
   · no accounts · no sign-ups · no paywalls · runs in your browser*. "Your
   inputs never leave your device" is true on a card **except** the ones
   `scripts/check-egress.py` classes as A or C — check before claiming it.
2. **No ToS-violating growth.** View-bots, hidden players, autoplay tricks and
   engagement pods break platform terms and risk the channel. Legitimate growth
   only: metadata, speed, internal links, translated pages, honest calls to
   action.
3. **Nothing leaves without the owner.** The protected list is ARCHITECTURE.md
   §9. Deleting `CNAME` takes the custom domain down.
4. **`innerHTML` never sees untrusted input.** `tool.html` once shipped a
   reflected XSS through `?card=` exactly this way.
5. **No secrets.** `verify.sh` greps for them. Anything that ever reached
   history must be rotated — deleting the commit does not un-leak it.
6. **The products stay separate** — deliberate, not an oversight. No music
   players, artist banners or cross-promotion on the catalogue or any card; no
   tool links on the music pages.
7. **Generated artefacts are written only by their generators.** The tool count
   appears dozens of times across pages and docs (`scripts/sync-counts.py`
   owns every one), and editing it by hand has failed every time it was tried.
   `index.html`'s HOME-FEATURED, HOME-TRENDING and HOME-CATEGORIES blocks
   (`scripts/build-home-prerender.py`) look like hand-written markup and are
   not. `verify.sh` fails on drift.

## Owner decisions

These came from the owner. Don't reverse one without a fresh instruction; if
you think one is wrong, say so in your summary instead of acting on it.

- **The site brain is gone** (2026-09-20): `local-ai-knowledge.json`, its
  builder and evaluator, and `learning/`. `ai.html` never read it, and
  rebuilding a 4.5 MB artefact on every doc edit was the repository's biggest
  source of friction. Don't regenerate it.
- **The staff facility is gone** (2026-09-20): the AI-developer workflow,
  `scripts/ai-staff.json`, the scoreboard, the claims ledger and the audit
  engine — governance about governance. The deletion was the owner's own;
  don't rebuild it.
- **CI runs the whole gate** (2026-09-20). `.github/workflows/agent-guardrails.yml`
  runs `verify.sh --deep` on pushes to `main` and pull requests, with jsdom installed outside
  the checkout, under the status name "Repo checks" (branch protection
  resolves that name — keep it). Don't add heavyweight CI, and don't let the
  local gate grow slow enough to need a fast pass again.
- **`token.html` is kept deliberately** — but no crypto promotion.

---

## Card traps

`tool.html` injects one card at a time into its own long-lived document. Each
navigation clears the card's container and dispatches `DOMContentLoaded`
again, but it cannot clear what the card left elsewhere: globals, listeners,
timers, appended nodes and styles all survive into the next tool. Every trap
below is that fact in a different shape.

**Every card is written for one shared document.** A top-level
`let`/`const`/`class` stays declared after its card goes, so a name two cards
share kills whichever loads second with a `SyntaxError` — it renders and does
nothing. Prefix every id and top-level name; IIFE-wrap anything you touch.
`scripts/check-card-collisions.py` fails on a hard collision and counts the
soft `var`/`function` overwrites (trust its count, not a number written down).

**`generate-cards-json.js` overwrites the `category` field** from lists
hardcoded in the script. Add the slug to the right list before running it, or
the category is silently lost.

**Nothing you append to the document may outlive your card.** A toast or
dialog parked on `document.body` stays over the next tool, its Close button
wired to markup that is gone. Append into your own container, captured while
your script is the one running:

    const myRoot = (document.currentScript && document.currentScript.closest('.card')) || document.body;
    myRoot.appendChild(toast);

Allowed on the body: the transient copy helper (append, click or select, remove
in the same tick), a toast that removes itself on its timer, and a third-party
`<script src>` (inert once run; an *inline* script is not — appending one runs
code). `scripts/check-card-leftovers.js` fails an append to `body`/`head` with
no removal of the same reference; a global `<style>` is the CSS check's job.

**A listener on `document` runs in the next tool too.** The loader cannot
unregister a listener it did not add, so a handler bound to `document` still
fires after your card is gone, and reaching for your markup throws. Bind to
your own elements where you can; where you must use `document`, bail first:

    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('your-root-id')) return;   // card is gone
      …
    });

**The `else` half of the init idiom is the half that runs.** A card mounts into
a document that has already loaded, so

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

only ever takes the `else` in `tool.html` — without it the card never starts
(43 cards shipped that way on 2026-09-22). The idiom also never registers the
listener above. `scripts/check-card-init.js` fails a guard with no `else`; the
check is static because a card that starts and does nothing is silent to every
runtime check.

**Anything a card deferred must re-check the DOM before it uses it.** Timers,
debounces, intervals, `await` continuations and the `onload` of an appended
script all run after the visitor may have moved on. Guard the top of whatever
runs later, and stop an interval instead of letting it tick:

    setInterval(function () {
      if (!document.getElementById('your-element')) { clearInterval(handle); return; }
      …
    }, 250);

`scripts/test-card.js` proves it, and its timing is not something to work
around: it mounts each card as production does, clears the container, then
fast-forwards every timer still pending and fires the `load`/`error` of any
script the card appended — so a delay never decides whether a callback is
caught. A callback that swallows its own throw is still reported through the
`console.error` it writes. Two shapes that hide from a quick reading:

- **`card.querySelector(…)` is not a liveness test** — a detached container
  still holds its children. Only `document.getElementById(…)` says whether the
  visitor is still looking at you.
- **A `while` loop over a `querySelectorAll` result never ends** — the NodeList
  is static, `remove()` doesn't shrink it, and the tab freezes. Copy and shrink
  the copy: `const opts = Array.from(root.querySelectorAll('.opt')); while
  (opts.length > 2) opts.pop().remove();` `scripts/check-card-js.py` fails the
  loop, and `scripts/sweep-cards.js` runs the harness in chunks with a timeout
  so a hanging card is named rather than stalling the sweep.

**A card's `<style>` is document-wide.** The loader re-creates the fragment's
style blocks in `tool.html`'s document, so a bare `.nav-btn { … }` restyles the
page's own nav while the card itself looks fine. Scope every rule under the
card's root id: `#slug-root .thing { … }`. `scripts/scope-card-css.py <slug>`
rewrites a fragment that leaks; `scripts/check-card-css-leaks.py` fails a bare
selector that can match a class `tool.html` renders (it reads that class list
from `tool.html`, so it cannot drift).

**The harness reads the mounted card for promises the source can't show**
(`scripts/tests/card-integrity.test.js` pins each with a failing and a passing
fixture):

- **Two elements with the same id** — checked on the rendered DOM, not the
  file, so a card that re-renders the id it replaces is fine. FAIL.
- **A reference to an id nothing carries** — `for=`, `aria-labelledby=`,
  `aria-describedby=`, `list=`, `aria-controls=`. FAIL.
- **A control with no accessible name** — a button that is only a colour, an
  emoji or a position. FAIL: every existing one has been named, so a new one is
  a regression. A nameless *field* is counted per card as a note.

Naming is cheap: `aria-label` where the content is a colour or a position
(`Row 2, column 3: X`), `for=` where the label already sits beside the field,
`aria-hidden="true"` on decorative SVG so the button's own name is read.

## Other traps

**Missing images are usually a sparse checkout**, not a bug: `images/` is
~50 MB and normally off disk. Confirm with `curl -sI` against the live site
before "fixing" anything.

**The `o`/`0` handle mismatch is intentional** — YouTube `@MrProphecy`,
SoundCloud and Instagram with a zero. Not a typo.

**Never invent YouTube IDs.** Use the verified table in ARCHITECTURE.md §4 — a
Rickroll (`dQw4w9WgXcQ`) once shipped as a placeholder on a live page.

**The service worker is live.** `home-core.js` registers `sw.js` at idle on
every list page (`index.html`, `tools.html`, `tools-index.html`, the category
pages): `freshFast()` for the catalogue and card fragments, `navigateFast()`
for navigations. `tool.html` doesn't register it, but a navigation from a list
page is already intercepted. That is why the home page's `?v=`, `APP_VERSION`
and `CACHE_VERSION` move together (`scripts/check-critical-css.py`).

## Open questions only the owner can answer

Not a work queue. Delete a line the moment it is answered.

- **Language pages** — a thin machine-translated hreflang cluster. Enrich with
  real localisation, or consolidate?
- **The four unlinked CV files** (`CV.docx`, `CV.pdf`, `cv.pdf`,
  `latestcv.docx`) — personal documents, so they stay until the owner says:
  ship them or delete them?
- **LICENSE** — none chosen yet.
- **Soft top-level JS name collisions** — `check-card-collisions.py` reports
  the current number. Clearing them means IIFE-wrapping many cards: a large
  mechanical diff. Worth it?
- **The music app's home-screen icon** — `manifest.json` (MrProphecy) points at
  the catalogue's icons, so installing the music pages shows the catalogue's
  mark. Should it get its own?
