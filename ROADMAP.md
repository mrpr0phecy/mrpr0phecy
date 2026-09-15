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
