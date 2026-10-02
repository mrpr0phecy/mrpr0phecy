# CONSTRAINTS.md — the reasons behind the rules

Open when a rule needs its explanation: the hard lines' fine print, the owner's
decisions, and the card traps with the code that avoids each. Every trap names
the check that enforces it, so a failing check leads here. `AGENTS.md` is the
workflow authority; history lives in git.

---

## Hard lines — the fine print

The rules are AGENTS.md §3; the numbers match there and in code comments.

1. **Analytics stays exactly where it is.** `G-G058FVW6Z2` loads on the home
   page, the music cluster, the money pages and news — not sitewide;
   `tool.html`, `404.html`, cards and standalone experiments stay clean. Any
   change either way is an owner call. Privacy claims are judged per page,
   against what that page loads: a page carrying GA must not deny measurement
   (a true, scoped line is fine); a page loading nothing may say so.
   `scripts/check-finance.js` enforces this. Always true: *no ads · no
   accounts · no sign-ups · no paywalls · runs in your browser*. "Your inputs
   never leave your device" holds except on the cards
   `scripts/check-egress.py` classes as A or C.
2. **No ToS-violating growth.** View-bots, hidden players, autoplay tricks and
   engagement pods risk the channel. Legitimate: metadata, speed, internal
   links, translated pages, honest calls to action.
3. **Nothing leaves without the owner.** The protected list is
   `ARCHITECTURE.md` §9; deleting `CNAME` takes the custom domain down.
4. **`innerHTML` never sees untrusted input.** `tool.html` once shipped a
   reflected XSS through `?card=` exactly this way.
5. **No secrets.** `verify.sh` greps for them; anything that reached history
   must be rotated — deleting the commit does not un-leak it.
6. **The products stay separate**, deliberately: no music players, artist
   banners or cross-promotion on the catalogue or any card; no tool links on
   the music pages.
7. **Generated artefacts are written only by their generators.** The tool
   count (`scripts/sync-counts.py`) and `index.html`'s HOME-FEATURED /
   HOME-TRENDING / HOME-CATEGORIES blocks (`scripts/build-home-prerender.py`)
   look hand-written and are not; `verify.sh` fails on drift.

## Owner decisions

Don't reverse one without a fresh instruction; if you think one is wrong, say
so in your summary instead of acting on it.

- **The site brain is gone** (2026-09-20): `local-ai-knowledge.json`, its
  builder/evaluator and `learning/`. Nothing read it, and rebuilding a 4.5 MB
  artefact on every doc edit was the repo's biggest source of friction. Don't
  regenerate it.
- **The staff facility is gone** (2026-09-20): the AI-developer workflow,
  `scripts/ai-staff.json`, the scoreboard, the claims ledger and the audit
  engine. Don't rebuild it.
- **CI runs the whole gate on `main` and nightly** (`verify.sh --deep`); PRs
  get the fast gate. Keep the "Repo checks" status name — branch protection
  resolves it. Don't add heavyweight CI or let the local gate grow slow.
- **`token.html` is kept deliberately** — but no crypto promotion.

---

## Card traps

`tool.html` injects one card at a time into a long-lived document; each
navigation clears the card's container and re-dispatches `DOMContentLoaded`, but
nothing clears what the card left elsewhere — globals, listeners, timers,
appended nodes and styles all survive into the next tool. Each trap below is
that fact in a different shape; the code patterns are the fix.

**Every card shares one document.** A top-level `let`/`const`/`class` stays
declared after its card goes, so a name two cards share kills whichever loads
second with a `SyntaxError` (it renders and does nothing). Prefix ids and
top-level names; IIFE-wrap what you touch. `scripts/check-card-collisions.py`
fails a hard collision and counts soft `var`/`function` overwrites.

**`generate-cards-json.js` overwrites the `category` field** from hardcoded
lists. Add the slug to the right list first, or the category is silently lost.

**Nothing you append to the document may outlive your card.** A toast parked on
`document.body` stays over the next tool, wired to gone markup. Append into
your own container, captured while your script runs:

    const myRoot = (document.currentScript && document.currentScript.closest('.card')) || document.body;
    myRoot.appendChild(toast);

Allowed on the body: the transient copy helper (append, click/select, remove in
the same tick), a toast that removes itself, and a third-party `<script src>`
(inert once run; an *inline* script is not). `scripts/check-card-leftovers.js`
fails an append with no removal of the same reference.

**A listener on `document` runs in the next tool too.** The loader cannot
unregister a listener it did not add, so a handler on `document` still fires
after your card is gone and throws on its markup. Bind to your own elements
where you can; otherwise bail first:

    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('your-root-id')) return;   // card is gone
      …
    });

**The `else` half of the init idiom is the half that runs.** Cards mount into a
document that already loaded, so

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

only ever takes the `else` in `tool.html` — without it the card never starts
(43 cards shipped that way). `scripts/check-card-init.js` fails a guard with no
`else`; it is static because a card that starts and does nothing is silent to
every runtime check.

**Anything deferred must re-check the DOM before it runs.** Timers, debounces,
intervals, `await` continuations and the `onload` of an appended script all run
after the visitor may have moved on:

    setInterval(function () {
      if (!document.getElementById('your-element')) { clearInterval(handle); return; }
      …
    }, 250);

`scripts/test-card.js` mounts each card as production does, clears the
container, then fast-forwards every pending timer and script `load`/`error`, and
reports a swallowed throw through its own `console.error`. Two shapes that hide
from a quick reading:

- **`card.querySelector(…)` is not a liveness test** — a detached container
  still holds its children. Only `document.getElementById(…)` says whether the
  visitor is still looking at you.
- **A `while` loop over a `querySelectorAll` result never ends** — the NodeList
  is static and `remove()` doesn't shrink it. Copy and shrink the copy:
  `const opts = Array.from(root.querySelectorAll('.opt')); while (opts.length > 2) opts.pop().remove();`
  `scripts/check-card-js.py` fails the loop; `scripts/sweep-cards.js` runs the
  harness in chunks with a timeout so a hanging card is named, not stalling.

**A card's `<style>` is document-wide** once the loader re-creates it in
`tool.html`, so a bare `.nav-btn { … }` restyles the page's own nav while the
card looks fine. Scope every rule under the card root id.
`scripts/scope-card-css.py <slug>` rewrites a leaking fragment;
`scripts/check-card-css-leaks.py` fails a bare selector that can match a class
`tool.html` renders.

**The harness reads the mounted card for what source can't show**
(`scripts/tests/card-integrity.test.js`): duplicate rendered ids, `for=`/`aria-*`
references to an id nothing carries, and controls with no accessible name all
FAIL; a nameless field is noted per card. Naming is cheap: `aria-label` for a
colour or position, `for=` where a label sits beside the field,
`aria-hidden="true"` on decorative SVG.

## Other traps

**Missing images usually mean the clone is sparse**, not a bug: `images/` is
about 50 MB and normally off disk. Confirm with `curl -sI` against the live
site first.

**The `o`/`0` handle mismatch is intentional** — YouTube `@MrProphecy`;
SoundCloud and Instagram with a zero. Not a typo.

**Never invent YouTube IDs.** Use the verified table in `ARCHITECTURE.md` §4 — a
Rickroll once shipped as a placeholder on a live page.

**The service worker is live.** `home-core.js` registers `sw.js` at idle on every
list page; `tool.html` doesn't, but a navigation from a list page is intercepted.
The home page's `?v=`, `APP_VERSION` and `CACHE_VERSION` move together
(`scripts/check-critical-css.py`).

## Open questions only the owner can answer

Not a work queue. Delete a line the moment it is answered.

- **Language pages** — a thin machine-translated hreflang cluster: enrich with
  real localisation, or consolidate?
- **The four unlinked CV files** (`CV.docx`, `CV.pdf`, `cv.pdf`,
  `latestcv.docx`) — ship or delete?
- **LICENSE** — none chosen yet.
- **Soft top-level JS name collisions** — clear them (a large mechanical diff)?
- **The music app's home-screen icon** — `manifest.json` points at the
  catalogue's icons, so installing the music pages shows the catalogue's mark.
