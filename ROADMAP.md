# Roadmap

Owner-led product ideas, not the current operational work queue. Coordinate
implementation through [STAFF.md](STAFF.md); current measured blockers and
owner dependencies are in [staff/OPEN.md](staff/OPEN.md) (rebaselined
2026-09-15 with the P0/P1/P2/P3 queue, the explicit owner asks and the
stage-gated [staff/OPERATING-PLAN.md](staff/OPERATING-PLAN.md)) and the
generated staff report, judged against [staff/EXCELLENCE.md](staff/EXCELLENCE.md). Prefer one small, reviewable change at a time.

The ideas below were last reviewed on 2026-09-04; some implementations have
since landed. Recheck the actual code and GitHub evidence before claiming an
item. This historical list does not override current staff decisions.

## Now — safety and correctness

- [x] **Make `qrtool` local-only.** Landed 2026-09-15: the third-party QR API
  calls are replaced with the vendored `qrcode-generator` implementation used
  by `wifi-qr-generator.html`, the logo overlay is retained (error correction
  auto-raised to High), and the egress audit is enforced by a markup-aware
  `scripts/check-egress.py` gate in `verify.sh` — `fetch(variable)` and
  friends now require classification, so silent input egress cannot slip
  through again. Follow-on for the owner: decide C-vs-A classification for
  cards that send typed text to APIs by design (spelling-check, languages,
  plant-encyclopedia).
- [x] **Resolve broken label associations.** Landed 2026-09-15: the one
  remaining case (`grief-companion`'s energy buttons) now uses a labelled
  group with `aria-pressed` state instead of a `<label for>` pointing at a
  div. `check-a11y.py` guards regressions.
- [x] **Add risk notices at shell level.** Landed 2026-09-15: one shared
  mapping (`risk-notices.js`) drives a `role="note"` notice above the tool in
  BOTH `index.html` and `tool.html` — financial, medical, emergency, legal
  and DIY/structural kinds. `scripts/tests/risk-notices.test.js` fails if a
  mapped category or slug disappears from the catalogue. Existing in-card
  caveats stay (belt and braces).
- [x] **Strengthen automated checks.** Landed in two steps (2026-09-15):
  syntax errors — `check-card-js.py` (pre-existing); input-egress network
  calls — markup-aware `check-egress.py` in verify.sh; catalogue
  metadata/count drift — `generate-cards-json.js --check` +
  `generate-ai-index.js --check` + `sync-counts.py --check`; broken internal
  links — new zero-tolerance `check-links.py`. Honest limitation: "empty
  cards" cannot be detected statically (many tools render everything from
  JS), so the proxy is the existing blank-title/description FAIL in
  `check-cards.py`.

## Next — make the existing catalogue easier to find and use

- [ ] Use Search Console and analytics to identify the first 10–25 tools worth
  improving; do not optimise around adding more tools for its own sake.
- [ ] Give proven tools crawlable metadata, structured data, breadcrumbs and
  stable deep links while retaining the existing card fragments as the single
  implementation. Partial, 2026-09-15: every `tool.html?card=<slug>` deep link
  now updates its own description, social-card tags, canonical URL and JSON-LD
  (WebApplication + BreadcrumbList) client-side once the catalogue resolves the
  tool; pinned by `scripts/tests/tool-shell.test.js`. Choosing WHICH tools get
  further bespoke work still needs the Search Console data above (owner).
- [x] Improve catalogue loading, measured before and after: the first screen no
  longer waits for `cards/cards.json` (ARCHITECTURE.md §3, "First-screen fast
  path"; numbers and method in `notes/catalogue.md`). Remaining candidates:
  - [ ] Move the ~32 KB of CSS that only styles components hidden at load
    (toolbox, palette/contributions panels, standalone modal, directory view,
    reader mode) out of the render-blocking `<style>` into an async stylesheet.
    The rules that *hide* those components must stay critical or they flash on
    load — verify in a real browser, not blind.
  - [ ] Drop `id`, `file` and `path` from `cards.json`: all three are derived
    from `name` in every one of the 1128 entries (~108 KB raw / ~27 KB gzipped
    of redundant payload). Needs `generate-cards-json.js` and every consumer
    changed in one go, so it is not a first-screen win any more.
  - [ ] Decide whether analytics should keep loading during the first screen.
    Owner call: CONSTRAINTS.md keeps the analytics footprint out of agent hands.
- [x] **Make the main page hold the whole catalogue, not a screenful.** Landed
  2026-09-18, in response to *"only nine tools are loading on my mainpage and i
  have over 1000, this destroys the point of my site"*. The loader had one verb
  — a card became real only when it was fetched, parsed and executed — so the
  background trickle (6 mounts per 2.5 s, ~8 minutes for 1,194) was both the
  throttle that kept scrolling alive and the reason the page looked like a
  nine-tool site. It is now three: **mosaic density** (a pending tool is a tile,
  ~30 per screen instead of 2–3; a running tool spans the row; `.density-focus`
  keeps the old reading stack), a **mount window** (a gridful of tools at a
  time, everything outside it parked; see the sub-bullet below) and **warm-ahead**
  (a background pass
  that fetches fragment *text* into `cardCache` only, follows the reading
  position, yields to the mount pipeline, and lands in `CARDS_CACHE` for the
  next visit). Filters no longer mount every match either, and
  `index.html?cat=<slug>` / `?view=directory` are real (they were documented in
  `agents.html` and not implemented). ARCHITECTURE.md §3 "The live window";
  pinned by `scripts/tests/live-window.test.js`.
  - [ ] Verify the mosaic and the park in a real browser before widening either:
    the *look* of a collapsed parked row (its height is now the grid's own tile
    height by construction, and the jump risk is handled by `commitScrollHold()`
    rather than measured — but only a browser can say whether 1,194 rows of tile
    *feel* right), the mount reflow as tiles become full-row tools, whether a
    parked tool's canvas really keeps its bitmap across a park/resume round trip,
    and `⚡ Run all` on a mid-range phone. `scripts/staff/live-window-check.mjs`
    is that probe: it serves the repo over `node:http`, drives a browser through
    the same `STAFF_PLAYWRIGHT` / `STAFF_CHROMIUM_PATH` convention as
    `scripts/staff/browser-check.mjs`, prints tile heights, the on-screen position
    of a row below the fold across a park (the no-jump claim, measured), canvas
    dimensions and `toDataURL()` length before and after, dropped frames during a
    scripted scroll at 4× CPU throttle, and the same numbers with `?park=full`.
    It is deliberately not in `verify.sh` (no CI here has a browser, and the
    zero-dependency suite must stay zero-dependency). **Blocked in the Arena sandbox, and
    the reason is recorded so nobody re-derives it:** egress there is npm-only, so
    Chromium's download CDN, jsDelivr, the Debian mirrors and
    `objects.githubusercontent.com` (release assets) are all unreachable;
    `@sparticuz/chromium` does install from npm and gets as far as
    `error while loading shared libraries: libnspr4.so`, and with
    `@achingbrain/nss` on `LD_LIBRARY_PATH` that becomes
    `version 'NSS_3.30' not found (required by /tmp/chromium)` — that bundled NSS
    is a decade too old and nothing reachable ships a newer one. Run the probe
    locally (`npm i playwright`, then `node scripts/staff/live-window-check.mjs`)
    against the numbers in the sentence above instead.
  - [x] Window the DOM. **Landed the same day (stage 2)**, on the owner's
    *"i do want them all running but only a few loaded at a time around the
    viewport"*: the cap became a mount window (`MOUNT_WINDOW_DEFAULT = 24`,
    walked 10–40 by a `long-animation-frame` governor and tuned at boot by
    `deviceMemory`) and any tool that leaves the window is **parked** — its
    content subtree moves into `#mp-park` (`visibility:hidden`, off-screen,
    never `display:none`) while its shell stays in the grid holding its row, so
    1,194 tools can be running while the page lays out ~24. Because nothing is
    destroyed, waking one is a single `appendChild` and no state is lost — and
    the `visibleNames`-as-filter-truth refactor turned out to be unnecessary:
    the shells that filters and `?expand=` query never move. `?park=off` and
    `⚡ Run all` switch parking off; `prunePark()` evicts a parked tool's DOM
    only when `performance.memory` reports heap pressure, oldest-parked first.
    ARCHITECTURE.md §3 and the §7 traps; suites 8–11 of `live-window.test.js`.
    *(The "holding its row" half of this is superseded by the next bullet.)*
  - [x] Close the two gaps stage 2 left, both found by re-reading the design
    against the promise rather than by adding a feature. **Landed the same day
    (stage 3)**: a parked row now collapses back to a tile — the density the site
    exists for no longer stops at the top of the page — and
    `aboveTheFold()`/`noteRowHeight()`/`commitScrollHold()` pay for the height by
    correcting `scrollY` in the sweep's own frame, batched, with the park and warm
    cursors re-anchored, skipped below the fold and under a live finger
    (`initTouchGuard()`), and opt-out-able with `?park=full`; and the wake half of
    the pass (`wakeInsideWindow()`, plus the observer ahead of its budget check)
    makes sure a tool the reader scrolled back to never stays parked under their
    cursor because a stale row holds a mount slot. `parkMargin()`/`REMOUNT_LOOKAHEAD`
    keep the dead band on a short window, `probeFrames()` governs browsers with no
    `long-animation-frame`, and `lastShrink` starts at `-Infinity`. Measured rather
    than assumed, over the shipped fragments: 134 animate in CSS (quiet while
    parked), 168 run their own loop (they do not) — the park is a layout/paint
    guarantee, not a CPU one. `live-window.test.js` is 17 suites, including a
    harness rect that answers to the card's own classes; see ARCHITECTURE.md §9.
  - [ ] Measure the window and the park in the field before touching the
    defaults: which `MOUNT_WINDOW_*` / `PARK_CEILING` pair a mid-range phone
    wants, and whether the LoAF governor converges or breathes. Both are
    stubbable in node; neither is *answerable* there.
  - [x] Two things the park made necessary, landed the same day: parked subtrees
    pause their CSS animations and replay them on resume
    (`pauseParkedAnimations()`), and warm-ahead follows the scroll *upwards* too
    (`warmDir` + `noteReadingPosition()` + `CONFIG.WARM_LOOKBEHIND`), so a
    reversed scroll finds bytes cached instead of fetching them again. Suite 12 of
    `live-window.test.js` pins the cursor in both directions, including the
    "one empty pass at an end and stop" promise `card-faces.test.js` already
    held.
  - [ ] Bundle fragments per category (`cards/bundles/<slug>.json`, generated
    and checked like the sitemap) so "run this category" is one request instead
    of 152 — and decide whether an explicit `?install=1` should warm the whole
    catalogue into the service worker for offline use.

- [x] Build one `help.html` covering site mechanics, privacy, money and safety,
  with matching `FAQPage` JSON-LD and client-side search. Verified shipped
  2026-09-15 (the box was never ticked): `help.html` has the `FAQPage` JSON-LD
  block, a client-side FAQ filter with match counts, and `help.html?q=<query>`
  deep links.
- [ ] Add privacy-conscious usage events for searches, categories and tool
  opens. Never record values entered into tools.

## Music

- [ ] Check YouTube Studio watch-hour/YPP progress; let the real number decide
  whether radio, long-form playlists or another release is the priority.
- [ ] Create a focused sync-licensing page explaining one-stop rights,
  available moods/uses and a clear enquiry route.
- [ ] Keep growth legitimate: no hidden players, view bots, fake engagement or
  misleading claims.

## Owner decisions

- [ ] Enable `sw.js` with a carefully tested offline strategy, or remove it.
- [ ] Enrich or consolidate the thin translated landing-page cluster.
- [ ] Decide whether experiments, legacy directories and the public CV files
  should ship, move to an archive, or be removed.
- [ ] Choose a repository licence.

## Standing product rules

1. The tools catalogue and MrProphecy music pages remain separate products.
2. Tools stay free, with no ads, accounts or paywalls.
3. Published figures must be derived from current data; never invent reach.
4. Pages with analytics must disclose it and must not claim “no tracking”.
5. A card must not silently send user input to a third party. Any necessary
   network use must be visible before input is entered.
6. Do not delete catalogue tools or alter monetisation without owner approval.

## Workflow for every change

```bash
bash scripts/verify.sh
git diff --check
git status --short
```

Review the diff, commit it, and push it from the same conversation. The normal
GitHub quality workflow runs the same deterministic checks on pull requests;
it needs no AI provider key or persistent agent credentials.
