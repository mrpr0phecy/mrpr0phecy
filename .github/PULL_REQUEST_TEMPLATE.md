<!--
One template, not two. `.github/pull_request_template.md` and this file both
existed and disagreed (one asked for a pasted verify run, the other for
`npm run build`; one still said 1194 tools). GitHub picks one of two
case-variant filenames in the same directory, so the other was dead weight
that still had to be kept in sync. Consolidated 2026-09-20.

Keep this short. The checks in `scripts/verify.sh` are the gate; this body is
only for what a diff cannot show — the reasoning, the blast radius, and what
was *not* verified.
-->

## What and why

<!-- One or two sentences: the change, and the user-visible problem or gap it
     closes. Link a staff/BOARD.md entry or research note instead of pasting
     the full story. -->

## Reasoning (AGENTS.md §0.5 — be bold, show your working)

- Boldest useful version of this change, and why what shipped is / isn't that:
- What I deliberately did not do, and the trade-off I accepted:
- Verified (how) / **not** verified — "not measured" is a valid answer, an
  invented number is not:

## Blast radius

<!-- What a reviewer has to believe for this to be safe, and how far it reaches.
     A PR should stay small enough to revert in one commit without touching the
     other ~1,195 tools. -->

- Pages/paths affected:
- Reverts cleanly in one commit: yes / no — if no, why:

## Before pushing

- [ ] `bash scripts/verify.sh` while iterating (scopes itself to the sections
      your changes can reach), then `bash scripts/verify.sh --all` before the
      push. Say which you ran if the full one was skipped and why.
- [ ] Nothing hand-edited that a generator owns: tool counts
      (`scripts/sync-counts.py`), `sitemap.xml`, `index.html`'s
      HOME-FAST-PATH/HOME-PRERENDER blocks, `cards/cards*.json`,
      `tools-index.{json,html}`, `sitemap.html`, `tools.html`, `related.json`,
      `embed.html`, `api/tools*.json`, `tools/*.html`,
      `local-ai-knowledge.json`. If one drifted, re-run its generator — never
      the number.
- [ ] CONSTRAINTS.md hard lines untouched: analytics footprint, no ToS growth
      hacks, no deletions without the owner, no untrusted input in
      `innerHTML`, no secrets, products A and B stay separate.
- [ ] No new cookie, fingerprint, IP log or identifier; any query logging still
      truncates (40 chars GA4 / 60 chars localStorage, capped at 200 keys) and
      a new analytics event is written up in `docs/INSTRUMENTATION.md`.

## If this adds or edits a tool

- [ ] `cards/<slug>.html` is a fragment (no `<html>`), every element ID carries
      the per-tool prefix, the JS is IIFE-wrapped, and it makes no network call
      (`scripts/check-egress.py` classes it, or it stays local).
- [ ] Slug is a kebab-case English noun phrase, not branded — and AI Developer
      work ships under the product, never under a personal handle
      (`docs/BRAND.md` naming rules).
- [ ] Checked `tool.html?card=<slug>` and `...&embed=1` at mobile width (360 px).
- [ ] YMYL (Health & Fitness, Finance & Money): the `docs/TRUST.md` checklist —
      methodology, primary source, worked example, edge cases, disclaimer,
      last-reviewed date — in the fragment or, preferably, a `tools/<slug>.html`
      deep page rendered from `scripts/tool-pages.json`.
- [ ] Regenerated the derived surfaces (`node generate-cards-json.js` after
      adding the slug to its category list, then the re-sync commands in
      AGENTS.md §4) and `api/tools/<slug>.json` states honest
      `formula`/`sources`.

## If this touches Product B (music)

- [ ] The hreflang cluster is edited as a whole (13 pages), or the change is
      single-language and cannot be read as a duplicate.
- [ ] No tool links here, and no music on Product A pages.

## Agent session handoff

<!-- Only what a diff cannot show. A released claim is not proof of review or
     deployment. -->

- Branch-scoped claim / board entry, and the accountable staff profile:
- Checks and browser checks actually run — and any inherited failure or check
  deliberately not run (never imply it passed):
- Owner-only decisions touched, with explicit approval if applicable:
- Merge and deploy evidence, or the blocker that stopped you:
  `gh pr merge <n> --merge`, then `curl -sI https://www.themostusefulsiteintheworld.com/<page>.html`
  30–60 s later.
