# CONSTRAINTS.md — why the rules are where they are

The fine print behind `AGENTS.md` §3: reasons, owner decisions, card traps, and
the check that catches each. Read only the section your task touches; a failing
check leads to its heading here. History lives in git.

## Hard lines — the fine print

1. **Analytics stays exactly where it is.** `G-G058FVW6Z2` loads on the home
   page, the music cluster, both money pages and news only — not sitewide, not
   on `tool.html`, `404.html`, the cards or the standalone experiments. Moving
   it either way is an owner call. Privacy claims are judged per page against
   what that page loads: a page carrying GA must not deny measurement (a scoped
   line is fine; a page loading nothing may say so), and "your inputs never
   leave your device" is false on any card `scripts/check-egress.py` classes as
   A or C. Always safe: *no ads · no accounts · no sign-ups · no paywalls · runs
   in your browser*. `scripts/check-finance.js` enforces it.
2. **No ToS-violating growth.** View-bots, hidden players, autoplay tricks and
   engagement pods risk the channel; metadata, speed, internal links,
   translations and honest calls to action are the legitimate route.
3. **Nothing leaves without the owner.** The protected list is ARCHITECTURE.md
   §9. Deleting `CNAME` takes the custom domain down.
4. **`innerHTML` never sees untrusted input** — `tool.html` once shipped a
   reflected XSS through `?card=` exactly this way.
5. **No secrets.** `verify.sh` greps for them; anything that reached history is
   rotated, not deleted.
6. **The products stay separate**, deliberately: no music players, artist
   banners or cross-promotion on the catalogue or any card; no tool links on the
   music pages.
7. **Generators own generated files.** The tool count appears in dozens of pages
   and is rewritten by `scripts/sync-counts.py`; hand-edits have always failed.
   `index.html`'s HOME-FEATURED / HOME-TRENDING / HOME-CATEGORIES blocks look
   hand-written but come from `scripts/build-home-prerender.py`.

## Owner decisions

Don't reverse one without a fresh instruction; if you think one is wrong, say
so in the summary instead of acting on it.

- **Site brain deleted** (2026-09-20): `local-ai-knowledge.json`, its builder,
  evaluator and `learning/`. Nothing read it, and rebuilding it on every doc
  edit was the repository's biggest friction. Don't regenerate it.
- **Staff facility deleted** (2026-09-20): the AI-developer workflow,
  `scripts/ai-staff.json`, the scoreboard, the claims ledger, the audit engine —
  governance about governance. Don't rebuild it.
- **CI tiers are fixed.** `agent-guardrails.yml`: the 8-check gate on every pull
  request and push; `verify.sh --deep` on `main` (the deploy) and nightly, jsdom
  installed outside the tree. The fast job must stay named "Repo checks" —
  branch protection resolves it. Don't add heavyweight CI or slow the local gate.
- **Token page deleted** (2026-10-09, owner decision): `token.html` and its
  "Estimated Bag Value" projector, plus its sitemap entry. It was a UK
  financial-promotion risk (FINANCE.md § 3). Don't recreate a token page or
  link to one.

## Card traps

Read when writing or changing a card. `tool.html` injects one card at a time
into a long-lived document: navigation clears the container and re-dispatches
`DOMContentLoaded`, but globals, listeners, timers, appended nodes and styles
survive into the next tool. Each trap below is that fact in a different shape.

**Every card is written for one shared document.** A top-level
`let`/`const`/`class` stays declared after the card goes, so a name two cards
share kills whichever loads second with a `SyntaxError` — it renders and does
nothing. Prefix ids and top-level names; IIFE-wrap what you touch.
`scripts/check-card-collisions.py` fails hard collisions and counts the soft
`var`/`function` overwrites (trust the check's count, not a number written down).

**`generate-cards-json.js` overwrites `category`** from hardcoded lists — add
the slug to a list first or it is silently lost.

**Nothing you append to the document may outlive your card.** A toast or dialog
on `document.body` stays over the next tool, wired to markup that is gone.
Capture your own container while your script runs:

    const myRoot = (document.currentScript && document.currentScript.closest('.card')) || document.body;
    myRoot.appendChild(toast);

The body is allowed only for the transient copy helper (removed in the same
tick), a self-removing toast, and a third-party `<script src>` — an appended
*inline* script runs code. `scripts/check-card-leftovers.js` fails a
`body`/`head` append with no removal of the same reference; a global `<style>`
is the CSS check's job.

**A listener on `document` runs in the next tool too.** The loader can't
unregister it, so bail out first:

    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('your-root-id')) return;   // card is gone
      …
    });

**The `else` half of the init idiom is the half that runs.** `tool.html` is
already loaded, so without it the card never starts (43 shipped that way on
2026-09-22; the idiom also never registers the listener above):

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

`scripts/check-card-init.js` fails a guard with no `else`.

**Anything a card deferred must re-check the DOM before it uses it.** Timers,
debounces, intervals, `await` continuations and appended-script `onload`s run
after the visitor may have left; guard the top, and stop intervals:

    setInterval(function () {
      if (!document.getElementById('your-element')) { clearInterval(handle); return; }
      …
    }, 250);

`scripts/test-card.js` mounts as production does, clears the container,
fast-forwards pending timers and fires appended scripts' `load`/`error`, so a
delay never decides whether a callback is caught; a swallowed throw still
surfaces through `console.error`. Two shapes that hide from a quick read:

- **`card.querySelector(…)` is not a liveness test** — a detached container
  keeps its children; only `document.getElementById(…)` proves the visitor is
  still there.
- **A `while` loop over a `querySelectorAll` result never ends** — the NodeList
  is static; copy and shrink the copy: `const opts = Array.from(root.querySelectorAll('.opt')); while (opts.length > 2) opts.pop().remove();`
  `scripts/check-card-js.py` fails the loop; `scripts/sweep-cards.js` names a
  hanging card instead of stalling.

**A card's `<style>` is document-wide.** A bare `.nav-btn { … }` restyles
`tool.html`'s own nav while the card looks fine; scope every rule under the
card root (`#slug-root .thing { … }`). `scripts/scope-card-css.py <slug>`
rewrites a leaker; `scripts/check-card-css-leaks.py` fails a bare selector that
can match a class `tool.html` renders.

**The harness checks the mounted card for what the source can't show**
(`scripts/tests/card-integrity.test.js`): duplicate ids on the rendered DOM
(FAIL); a `for=`/`aria-labelledby=`/`aria-describedby=`/`list=`/`aria-controls=`
pointing at an id nothing carries (FAIL); a control with no accessible name —
colour, emoji or position only (FAIL; a nameless *field* is a note per card).
Naming is cheap: `aria-label` (`Row 2, column 3: X`), `for=` beside the label,
`aria-hidden="true"` on decorative SVG.

## Other traps

- **Missing images are usually a sparse checkout**, not a bug: `images/` is
  ~50 MB and normally off disk; confirm with `curl -sI` against the live site.
- **The `o`/`0` handle mismatch is intentional** — YouTube `@MrProphecy`,
  SoundCloud and Instagram with a zero.
- **Never invent YouTube IDs** — the verified table is ARCHITECTURE.md §4; a
  Rickroll (`dQw4w9WgXcQ`) once shipped live as a placeholder.
- **The service worker is live**: `home-core.js` registers `sw.js` at idle on
  every list page (`index.html`, `tools.html`, `tools-index.html`, the category
  pages) — `freshFast()` for catalogue and card fragments, `navigateFast()` for
  navigations. `tool.html` doesn't register it, but a navigation from a list
  page is already intercepted. Hence `?v=`, `APP_VERSION` and `CACHE_VERSION`
  move together (`scripts/check-critical-css.py`).

## Open questions only the owner can answer

Not a work queue; delete a line once it is answered.

- **Language pages** — a thin machine-translated hreflang cluster: enrich with
  real localisation, or consolidate?

- **Soft top-level JS collisions** — the check reports the count; clearing them
  means IIFE-wrapping many cards. Worth the large mechanical diff?
- **The music app's icon** — `manifest.json` points at the catalogue's icons;
  should it get its own?
