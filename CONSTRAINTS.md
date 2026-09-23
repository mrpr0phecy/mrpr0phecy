# CONSTRAINTS.md — the things you cannot know from the code

Short by design. This file holds **only** facts an agent cannot discover by
reading the repo or running the checks — owner decisions, and traps whose
reasons are invisible. Everything else lives in code, in checks, or in git.

If you want to know *what happened*, use git and GitHub — `git log`,
`gh pr list`, `gh issue list`. Don't write status reports into the repo.

---

## Hard safety lines

The only hard rules in this repository. Everything else is a judgement call —
which is why AGENTS.md §0.5 tells agents to be bold. These are not judgement
calls, and no session may relax them for scope, speed or ambition:

1. **Analytics stays exactly where it is.** `G-G058FVW6Z2` loads on the pages
   that already carry it and nowhere else — never added, never removed,
   never "temporarily" moved. Because it exists, never write "no tracking",
   "100% private", "no cookies" or "no analytics" on a page carrying GA.
2. **No ToS-violating growth.** No view-bots, hidden players, autoplay
   tricks, engagement pods, fake urgency.
3. **Never delete a tool or a protected file** without the owner saying so
   first — `CNAME`, `sw.js`, the CV files, `opensourcenews.html`,
   `token.html`, anything in `cards/` (the full list is ARCHITECTURE.md §9).
   Adding is free; retiring is not.
4. **Never interpolate untrusted input into `innerHTML`** — URL params,
   `error.message` and `cards.json` strings go in via `textContent` or DOM
   APIs.
5. **No secrets in commits**, ever — no tokens, no agent-auth output, no keys.
6. **Products A and B stay separate** — no music players, artist banners or
   cross-promo on the tool catalogue or any card; no tool links on the music
   pages.
7. **Generated artefacts are only written by their generators** — tool counts,
   `sitemap.xml`, `index.html`'s HOME-FEATURED/HOME-TRENDING/HOME-CATEGORIES
   blocks and `cards.json` categories are never hand-edited.

Anything that looks like it needs an exception to one of these is an owner
question: ask in the session, and record the answer here. This file is the only
decision ledger left — `staff/DECISIONS.md` and the board around it were
deleted on 2026-09-20, and everything binding in them is either below or in
the check that enforces it.

---

## Owner decisions

These came from the owner. Don't reverse them without a fresh instruction
from the owner — and if you think one is wrong, say so in your summary rather
than acting on it.

**Products A and B stay separate.** No music players, artist banners or
cross-promo on the tool catalogue or any card; no tool links on the music
pages. Deliberate, not an oversight.

**Never delete or replace an existing tool** without the owner saying so
first. Adding is free; retiring is not. Same for anything in ARCHITECTURE.md
§9's do-not-touch list.

**Analytics (`G-G058FVW6Z2`) stays exactly where it is** — index, the music
cluster, both money pages, news. It does *not* go sitewide. `tool.html`,
`404.html`, the cards and the standalone experiments stay clean. Changing the
analytics footprint in either direction is an owner call.

**Because analytics exists, some claims are lies.** Never write "100%
private", "no tracking", "no cookies" or "no analytics" on a page carrying GA.
These are true everywhere and always safe: *no ads · no accounts · no
sign-ups · no paywalls · runs in your browser*. On tool cards specifically,
"your inputs never leave your device" is true **except** for the cards
`scripts/check-egress.py` classes as A or C — check before claiming it.

**No growth hacks.** No view-bots, hidden players, autoplay tricks or
engagement pods — they violate platform ToS and risk the channel. Legitimate
growth only: metadata, speed, internal links, translated pages, honest CTAs.
No ads or trackers on Product A, no paywalls, no fake urgency.

**The site brain is gone** (owner instruction, 2026-09-20).
`local-ai-knowledge.json`, `scripts/build-site-brain.py`,
`scripts/evaluate-site-brain.py` and `learning/` were deleted: `ai.html` never
read the artefact, no page fetched it, and the rule that any edit to a public
doc forced a rebuild-and-commit of 4.5 MB was the largest single source of
friction in the repository. `agents.html` now points outside agents at
`llms.txt`, `cards/cards.json`, `tools-index.json`, `api/tools*.json` and
`related.json`. Do not regenerate it without a fresh owner instruction.

**The staff facility is gone** (owner instruction, 2026-09-20). The AI
Developer workflow, the profiles in `scripts/ai-staff.json`, the scoreboard,
the claims ledger, the audit engine and their tests were deleted at the owner's
explicit request: governance about governance, invisible to every visitor. An
earlier version of this rule said the workflow must stay because an agent once
deleted it while claiming owner instruction — that was true then; this deletion
is the owner's own. Do not rebuild the facility without a fresh instruction.

**Automatic CI runs the whole gate** (owner instruction, 2026-09-20, reversing
the 2026-09-19 fast pass). The fast pass existed because the suite took about
three minutes. It is now seven checks in ~3 s, with the slow audits behind
`--deep` in ~13 s, so `.github/workflows/agent-guardrails.yml` runs
`verify.sh --deep` on every push and PR and still finishes in seconds — the
"Repo checks" status name is unchanged. Do not add heavyweight CI without a
fresh owner instruction, and do not let the local gate grow slow enough to need
a fast pass again: that is what made this repo hard to work in.

**`token.html` is kept deliberately** — but no crypto promotion.

## Traps you cannot see from the code

**Never hand-edit a tool count, `sitemap.xml`, or `index.html`'s generated
first screen.** All of them are produced (`scripts/sync-counts.py`,
`scripts/build-sitemap.py`, `scripts/build-home-prerender.py`); `verify.sh`
fails on drift. The count appears dozens of times across the published pages
and docs — editing by hand
has failed every single time it has been attempted. The home page's
`HOME-FEATURED`, `HOME-TRENDING` and `HOME-CATEGORIES` blocks — the twelve
featured rows, the eight most-used rows and the 28 category links — are the
same kind of artefact. They look like hand-written markup and are not. (The
page's own list needs no block at all: it is built in the browser from
`tools-index.json`.)

**`generate-cards-json.js` overwrites the `category` field** from hardcoded
lists inside the script. Add your slug to the right list *before* running it,
or your category is silently lost.

**Every card is written for one shared document.** `tool.html` injects a card
fragment into its own page, one card at a time, so the document's global scope
outlives the card: a top-level `let`/`const`/`class` in one card is still
declared when the next card loads, and a name both cards use kills whichever
loads second with a `SyntaxError` (the card renders and does nothing).
Prefix every id and every top-level name; IIFE-wrap anything you touch.
`scripts/check-card-collisions.py` fails the build on a hard collision and
summarises the remaining soft `var`/`function` overwrites — run it rather than
trusting a number written here, because the count moves with the catalogue.

**Nothing you append to the document outlives your card.** The same navigation
clears the card's container and cannot clear `document.body` or
`document.head`, so anything you park there stays on screen over the tool the
visitor opens next — with its own Close button still wired to markup that is
gone. Six cards did exactly that with a toast, and a share dialog or a modal
behind a Share button is the same bug. Append into your own container instead,
captured once while your script is the one running:

    const myRoot = (document.currentScript && document.currentScript.closest('.card')) || document.body;
    myRoot.appendChild(toast);

The three shapes that legitimately use the body stay: the transient copy
helper, which appends an `<a>` or a `<textarea>`, clicks or selects it and
removes it in the same tick; a toast that removes itself on its timer; and a
third-party `<script src>` (inert once it has run — an *inline* script does not
count, appending one runs code). A global `<style>` is inert for a different
reason, and `check-card-css-leaks.py` is the check that owns it.
`scripts/check-card-leftovers.js` holds the line: an append to
`document.body`/`document.head` with no removal of the same reference fails the
build. The harness cannot be this guard on its own — its teardown probe sees
only the leftovers its own clicks made, and a dialog behind a button is never
clicked.

**A listener on `document` runs in the next tool too.** The loader clears its
container and dispatches `DOMContentLoaded` again for every card the visitor
opens, and it cannot unregister a listener it did not add — so a handler bound
to `document` also fires when your card is no longer on the page, and reaching
for your own markup then throws. Bind to your own elements where you can; where
you must use `document`, bail out first:

    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('your-root-id')) return;   // card is gone
      ...
    });

The `if (document.readyState === 'loading') … else init()` idiom is immune: in
`tool.html` the document is already loaded, so the listener is never registered.
`node scripts/test-card.js cards/*.html` proves it — it mounts each card in
its own window, clears the container and fires the next navigation; 108 cards
failed that on 2026-09-22 and were fixed with this guard.

**The `else` half of that idiom is not optional; it is the half that runs.**
Without it the card does not merely skip the listener — it never starts at all.
Forty-three cards shipped in exactly that state after the bulk edit of
2026-09-22, which wrapped their init in the guard and gave the other 95 cards the
`else`: tic-tac-toe rendered *no board at all*, cover-letter never filled in the
date, cooking-unit-converter never ran a first conversion. No check here could
see it — the markup was valid, the scripts compiled, every inline handler
resolved, and the harness of the day mounted into a document jsdom had not
finished parsing, where `readyState` really was `'loading'` and the guard passed.
`scripts/test-card.js` waits for the shell to finish loading now, which is what
exposed the class, and `scripts/check-card-init.js` fails the build on a guard
with no `else` (a card that starts and does nothing is silent under any runtime
check, so the rule has to be static).

That last sentence is only true because the harness waits for the shell to
report `document.readyState === 'complete'` before it mounts the card. jsdom
fires its own `DOMContentLoaded` and `load` a tick after the shell is built, so
a harness that mounted immediately handed the card two init events — the
loader's, which production sends, and jsdom's, which production does not have
left to send. `mealplanner.html` appended its seven day columns twice and the
sweep reported `mp-monday-meals ×2` … for a duplicate no browser can produce:
tool.html dispatches once per tool, into a completed document. Anything mounted
now runs the same way it does in production, and `loads-once.card` fails loudly
if that ever stops being true.

While the card is mounted the harness also reads it for the promises it makes
to itself, all of them invisible in the source file and to every other check
here — the markup is valid and nothing throws:

* **two elements with the same id.** `getElementById`, every `label for=` and
  every aria reference resolve to the first one, so the second is a control or
  a readout nothing can reach. Checked on the rendered card, not the text: a
  card that re-renders the id it replaces (`favToggle.innerHTML = '<span
  id="dpv-fav-count">…'`) names it twice in the file and once in the DOM.
* **a reference to an id nothing carries** — `for=`, `aria-labelledby=`,
  `aria-describedby=`, `list=`, `aria-controls=`. The browser keeps the
  attribute and ignores it: the field is announced with no name, the help text
  is never read out. FAIL, with what the visitor loses in the message.
* **a control with no accessible name.** A nameless **control** fails: there is
  nothing to read *and* nothing to see — the button is a colour, an emoji or a
  position. The catalogue had 150 of them (121 coordinate cells in one card, 8
  tic-tac-toe cells, six braille dot toggles, colour swatches, beat pads) and
  every one is named now, so a new one is a regression. A nameless **field** is
  a note: 1250 of them, and they are the same shape in every card — a read-only
  output textarea, a slider whose label sits beside it unassociated, a search
  box with a placeholder. A check that fails on hundreds of pre-existing fields
  is a check nobody reads, so that backlog is counted per card instead.

Naming a control is cheap and worth doing while you are in the file: an
`aria-label` where the content is a colour or a position (`Set graph colour to
#0077cc`, `Row 2, column 3: X`), a `for=` where the label already exists beside
the field, and `aria-hidden="true"` on a decorative svg so the button's own name
is what gets read.

`scripts/tests/card-integrity.test.js` pins all four, with fixtures for the
failing and the passing shape of each.

**Anything a card deferred must re-check the DOM before it uses it.** The same
navigation takes the markup away between the moment a callback is scheduled and
the moment it runs. Every one of these was live on 2026-09-22 and threw on the
next tool the visitor opened:

    setTimeout(() => document.getElementById('x').focus(), 200)   // 200 ms later
    updateTimer = setTimeout(ttUpdate, 200)                        // debounce
    setInterval(function () { $('timer').textContent = … }, 250)   // never cleared
    setInterval(draw, 50)                                          // no handle at all
    setTimeout(() => { label.textContent = 'Save'; }, 1600)        // button label
    an async function that awaits, then writes to the DOM
    an appended CDN <script> whose onload runs after the visitor left

Check, and for an interval stop it rather than letting it tick on:

    setInterval(function () {
      if (!document.getElementById('your-element')) { clearInterval(handle); return; }
      …
    }, 250);

`test-card.js` is what proves it, and its timing is not something to work
around: it settles asynchronously, then **fast-forwards every timer the card
still had pending when its container was cleared**, and fires the `load`/`error`
of any `<script>` the card appended itself (jsdom never fetches one). So the
delay does not decide whether the callback is caught — 1.6 s or 200 ms, it runs.
A callback that catches its own throw is reported through the `console.error` it
writes, named with the card line that threw it, so a swallowed error is still
visible.

61 sites across 57 cards were live on 2026-09-22, and a second wave of 28 was
found the same day once the harness could run the timers. The guard goes at the
top of whatever the timer calls:

    function recalc() {
      if (!document.getElementById('your-input')) return;   // card is gone
      …
    }

Two traps that cost time finding those:

**`card.querySelector(...)` is not a liveness test.** Once the container has
been detached it still holds its children, so a guard written against the card
object passes while the element is off the page. Check the document —
`document.getElementById('your-root-id')` — which is the only thing that says
whether the visitor is still looking at you.

**A `while` loop over a `querySelectorAll` result never ends.** That NodeList is
STATIC: `remove()` does not change `options.length`, so the loop removes the
same detached node for ever and the tab freezes. `cards/quiz.html` shipped it in
its Clear button (add a third option, press Clear, lose the tab) until
2026-09-22. Copy the list and shrink the copy, or re-query each pass:

    const options = Array.from(container.querySelectorAll('.option-item'));
    while (options.length > 2) options.pop().remove();

`scripts/check-card-js.py` fails that shape statically, and
`scripts/sweep-cards.js` runs the harness in chunks with a timeout so a card
that never returns is NAMED rather than costing the whole sweep.

**A card's `<style>` is document-wide too.** The loader re-creates the
fragment's `<style>` blocks inside `tool.html`'s own document, and a style
element's rules apply to the whole document wherever it sits. A bare
`.nav-btn { … }` therefore restyles the page's own nav, related grid, footer
and risk notice while the card itself still looks right — nothing on screen
points at the rule doing it (`punctuation-guide.html` shipped exactly that).
Scope every rule under the card's own id, as `#slug-root .thing { … }`.
`scripts/scope-card-css.py <slug>` rewrites a fragment that already leaks, and
`scripts/check-card-css-leaks.py` fails the build when a bare selector can match
a class `tool.html` renders — the class list is read from `tool.html`, so it
cannot drift away from what the shell actually ships.

**Never interpolate untrusted input into `innerHTML`.** URL params,
`error.message` and `cards.json` strings go in via `textContent` or DOM APIs.
`tool.html` shipped a reflected XSS through `?card=` exactly this way.

**Missing images are usually a sparse checkout, not a bug.** `images/` is
~50 MB and normally off disk. Confirm with `curl -sI` against the live site
before "fixing" anything.

**The `o`/`0` handle mismatch is intentional** — YouTube `@MrProphecy`,
SoundCloud and Instagram with a zero. Not a typo.

**Never invent YouTube IDs.** Use the verified table in ARCHITECTURE.md §4.
A Rickroll (`dQw4w9WgXcQ`) once shipped as a placeholder on a live page.

**`sw.js` is registered** by `home-core.js` (line 486) at idle on every list page — `index.html`, `tools.html`, `tools-index.html` and the 28 category pages. It runs `freshFast()` for the catalogue and card fragments (never stale beyond GitHub Pages' own 10-minute window) and `navigateFast()` for all navigations (2.5 s patience cap). `index.html` also `modulepreload`s it. `tool.html` does not load `home-core.js` and does not register the worker itself, but any navigation from a list page is already intercepted. `CNAME` deletion breaks the custom domain.

## Open questions only the owner can answer

Not a work queue — just the things genuinely blocked on a decision. Delete a
line the moment it is answered.

- **Language pages** — thin machine-translated hreflang cluster. Enrich with
  real localisation, or consolidate?
- **`sw.js`** — live and registered by `home-core.js`. Working as designed. This line can be deleted.
- **Ship or delete:** the four unlinked CV files (`CV.docx`, `CV.pdf`,
  `cv.pdf`, `latestcv.docx`). The rest of that list — `indexbeta.html`,
  `hokidea.html`, `guide.txt`, `substitutions/`, `system/`,
  `digitaldetoxcardshtml/` — was deleted on 2026-09-20 with the owner's
  approval; the CVs are personal documents, so they stay until the owner says
  otherwise.
- **LICENSE** — none chosen yet.
- **135 soft top-level JS name collisions** — fixing means IIFE-wrapping many
  cards: a large mechanical diff. Worth it?
