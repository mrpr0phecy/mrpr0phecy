# Roadmap

Owner-led product ideas, not the current operational work queue. Coordinate
implementation through [STAFF.md](STAFF.md); current measured blockers and
owner dependencies are in [staff/OPEN.md](staff/OPEN.md) and the generated
staff report. Prefer one small, reviewable change at a time.

The ideas below were last reviewed on 2026-09-04; some implementations have
since landed. Recheck the actual code and GitHub evidence before claiming an
item. This historical list does not override current staff decisions.

## Now — safety and correctness

- [ ] **Make `qrtool` local-only.** Replace its third-party QR generation with
  the vendored `qrcode-generator` implementation already used by
  `wifi-qr-generator.html`, retaining the logo overlay. Audit other cards for
  silent input egress at the same time.
- [ ] **Resolve broken label associations.** Some `<label for="…">` values
  target button groups rather than form controls. Convert them to real radio
  inputs or use `aria-labelledby`.
- [ ] **Add risk notices at shell level.** Maintain one mapping used by both
  `index.html` and `tool.html` for medical, financial, engineering and legal
  tools, rather than hand-writing inconsistent warnings inside cards.
- [ ] **Strengthen automated checks.** Detect card JavaScript syntax errors,
  empty cards, broken internal links, input-egress network calls and catalogue
  metadata/count drift in `scripts/verify.sh`.

## Next — make the existing catalogue easier to find and use

- [ ] Use Search Console and analytics to identify the first 10–25 tools worth
  improving; do not optimise around adding more tools for its own sake.
- [ ] Give proven tools crawlable metadata, structured data, breadcrumbs and
  stable deep links while retaining the existing card fragments as the single
  implementation.
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
- [ ] Build one `help.html` covering site mechanics, privacy, money and safety,
  with matching `FAQPage` JSON-LD and client-side search.
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
