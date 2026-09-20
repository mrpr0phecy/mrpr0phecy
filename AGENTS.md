# AGENTS.md — working in this repository

One page. This file used to be 566 lines of governance: three copies of the
generator list, two copies of the never-do list, a staff hierarchy, a
measurement contract, a branch protocol and a ceremony for every kind of
change. All of that was deleted on 2026-09-20 — it cost more attention than
the bugs it caught. What is left is the short list of things that would
actually hurt the site, the owner's income or a visitor.

## 0. What this is

Two products that never mix:

- **Product A** — `themostusefulsiteintheworld.com`: 1195 offline browser
  tools, each one a fragment in `cards/`, loaded into one shared DOM by
  `index.html` / `tool.html`. Plus `ai.html` (Lantern, the on-site AI).
- **Product B** — the music pages (`listen.html`, `artists.html`, the hreflang
  cluster under `es/`, `de/`, `fr/`, `pt/`, `ja/`). No tool links here and no
  music on Product A pages.

`cards/` is the single source of truth. Every published number, index,
sitemap and page is derived from it by a generator.

## 0.5 Be bold

Ship the useful version, not the safe-sounding one. Show your working in the
PR or commit message: what you measured, what you decided not to do, and what
you did not verify. "Not measured" is a valid answer; an invented number is
not. If a rule in this file is slowing you down and is not protecting a
visitor, the owner's money or the law — delete the rule and say so.

## 1. The four commands

```bash
npm run build          # regenerate every derived file, in order (~8 s)
npm run verify         # the gate: 7 checks, everything, ~3 s — run it often
npm run verify:deep    # + the slow audits (~15 s) — before pushing a cards/
                       #   or generator change; CI runs this on every push
npm test               # the product test suite (node --test scripts/tests/)
```

There is no scoping, no section numbering to remember and nothing to skip:
the whole gate is four seconds, so run the whole gate.

## 2. Workspace budget

Never install toolchains, browsers or `node_modules` into the repository —
the site is zero-dependency on purpose and the checkout is deployed as-is.
Install scratch dependencies outside it:

```bash
mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
```

`scripts/test-card.js` and the jsdom-based tests look in `/tmp/tenv` first and
skip loudly when it is missing.

## 3. Never

- Commit a secret, token or credential. `verify.sh` greps for them; rotate
  anything that ever landed in history.
- Send anything to a network from a card. Every tool runs offline in the
  browser; the exceptions are classified in `scripts/check-egress.py`.
- Put untrusted input into `innerHTML`. Text nodes and `textContent` only.
- Add a tracker, cookie, fingerprint, IP log or new analytics event without
  writing it up in `docs/INSTRUMENTATION.md`.
- Add an ad network, paywall, fake-urgency banner, autoplay trick or
  engagement pod to Product A.
- Delete a tool, a page or a redirect. The owner decides what leaves the site.
- Hand-edit a file a generator owns (below) — re-run the generator instead.
- Mix the products: no music on Product A, no tool links on Product B.

## 4. Common tasks

**Add a tool.** Write the fragment first, then
`bash scripts/add-tool.sh <slug> "<Category>" "<commit message>" [--no-push]`
registers it, regenerates every derived surface, smoke-tests the card in a
shared DOM, runs the gate, commits and pushes. By hand: write
`cards/<slug>.html` as a fragment — no `<html>`, every element ID prefixed with
the slug, the JS in an IIFE, no network calls — add the slug to its category
list in `generate-cards-json.js`, then `npm run build` and
`npm run verify:deep`. Check `tool.html?card=<slug>` and
`...&embed=1` at 1195 px. A YMYL tool (Health & Fitness, Finance & Money) also
needs the `docs/TRUST.md` checklist — methodology, primary source, worked
example, edge cases, disclaimer, last-reviewed date — in the fragment or,
better, in a `tools/<slug>.html` deep page rendered from
`scripts/tool-pages.json`.

**Edit a page.** Product B's hreflang cluster is 13 pages: edit it as a whole
or make a change that cannot read as a duplicate in another language.

**Fix a drifted number or surface.** Never the number — the generator. These
files are all owned by `npm run build`: `cards/cards*.json`, `sitemap.xml`,
`sitemap.html`, `tools.html`, `tools-index.{json,html}`, `categories/`,
`related.json`, `embed.html`, `api/tools*.json`, `tools/*.html`, `llms.txt`,
`llms-full.txt`, `index.html`'s HOME-FAST-PATH / HOME-PRERENDER blocks and
every published tool count.

**There is no site brain any more.** `local-ai-knowledge.json` (4.5 MB), its
857-line builder, its evaluator and `learning/` were deleted on 2026-09-20.
`ai.html` never read it, and the rule that any edit to a public doc forced a
rebuild-and-commit of a 4.5 MB artefact was the single most annoying thing in
this repository. Outside agents are served by `llms.txt`, `cards/cards.json`,
`tools-index.json`, `api/tools*.json` and `related.json` — every one of them
generated by `npm run build`.

## 5. The quality bar

A change is finished when `npm run verify:deep` passes and you have looked at
the thing you changed in a browser at 360 px and 1440 px. Static checks never
substitute for looking. If you broke something you cannot fix in two attempts,
say so plainly in the PR instead of working around it quietly.

## 6. Where the rest lives

`CONSTRAINTS.md` (the hard lines and the traps, in full) · `ARCHITECTURE.md`
(how the site is built) · `docs/TRUST.md` (YMYL) · `docs/INSTRUMENTATION.md` (analytics) ·
`docs/BRAND.md` (naming) · `docs/OPERATIONS.md` (deploys and incidents).

Everything else that used to be here — a staff hierarchy, a task board, a
decision ledger, a roadmap, strategy and vision documents, launch copy and
design notes — was deleted on 2026-09-20. `git log` is the changelog and the
owner's head is the roadmap; a document that tells an agent what to do next was
only ever a stale guess.
