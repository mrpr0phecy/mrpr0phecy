# AI Developer PR checklist (pointer #9 — governance)

> Every PR from `AI Developer` is reviewed as if it were from a junior
> teammate with commit access. The product is 1194 public URLs; mistakes
> are link rot.

## What this PR does (1 sentence)
<!-- e.g. Adds tools/pet-insurance-excess.html deep page + machine spec. -->

## Pointers & constraints

- [ ] I have read `CONSTRAINTS.md` — no URL deletions/moves without owner sign-off, no secrets, no new runtime network, static hosting only.
- [ ] I have read `docs/BRAND.md` — tool copy is utilitarian, no mascot in YMYL pages.
- [ ] No generated files hand-edited (generators only): `tools-index.json` via `scripts/build-tools-index.js`, `cards/cards{,-lite}.json` via `scripts/generate-cards-json.py`, `sitemap.xml` via `scripts/build-sitemap.py`, `tools/*.html` via `scripts/tool-pages.json` + `scripts/build-tool-pages.py`, `api/tools*.json` via `scripts/build-tool-specs.js`.
- [ ] Build + verify still pass: `npm run build && bash scripts/verify.sh && node scripts/build-tool-specs.js --check` (paste output or CI link).

## If this adds or edits a tool

- [ ] Slug is kebab-case English noun phrase, not branded (`bmi`, not `mrprophecy-bmi`).
- [ ] `cards/<slug>.html` is a fragment only (no `<html>`, no external deps, `home-app.js` loadCard handles injection). No new CSS framework.
- [ ] If YMYL (Health & Fitness, Finance & Money): `docs/TRUST.md` checklist — methodology + primary source + worked example + edge cases + disclaimer + last-reviewed date. Either in the fragment or (preferred) via a `tools/<slug>.html` deep page.
- [ ] Deep page added/updated via `scripts/tool-pages.json` only — not hand-edited HTML.
- [ ] Machine spec: `node scripts/build-tool-specs.js` and verified `api/tools/<slug>.json` has honest `formula`/`sources`.

## Instrumentation & privacy

- [ ] No new cookie, fingerprint, IP log, or identifier. Any query logging truncates at 40 chars for GA and 60 chars for localStorage, caps at 200 keys.
- [ ] New analytics event (if any) documented in `docs/INSTRUMENTATION.md`.

## Review & rollback

- [ ] Screenshotted `tool.html?card=<slug>` + `tool.html?card=<slug>&embed=1` on mobile width.
- [ ] Verified `sitemap.xml` and `llms.txt` updated by the build (not hand-edited counts).
- [ ] This PR is small enough to revert in one commit without breaking 1194 other tools.

## Human reviewer sign-off

Reviewer: ______________  Date: ____________

