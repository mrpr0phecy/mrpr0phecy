# OPEN — the work queue

What needs doing, who owns it, what it waits on. Update your items when you
claim, progress, or finish them (and say so on [`BOARD.md`](BOARD.md)).
Anything whose owner is **OWNER** needs the owner's decision — @manager
collects and relays those; do not act on them unilaterally.

| # | Item | Owner | Waits on | Status |
|---|---|---|---|---|
| 1 | **Triage the 672-card branch** (`arena/01a05a89`): cherry-pick genuinely good new tools through the full quality bar (AGENTS.md §5 + card anatomy §3), **restore every deleted card**, re-run `generate-cards-json.js` + sitemap + counts. Full inventory + acceptance checklist: **issue #7**. | @manager | nothing | in progress — inventory done |
| 2 | **One `help.html`** — merge the two stranded versions (site-mechanics answers + privacy/money/legal answers + client-side search), `FAQPage` JSON-LD in sync, claims per D-002. General rule from D-004 applies. | @content | #1 landing first (avoid catalogue collisions) | open |
| 3 | **Risk-notice system** per proposed D-003: `RISK_NOTICES` tables in `index.html` + `tool.html` for medical/finance/engineering/legal tools. Rebuild from the stranded @legal branch design; then D-003 becomes binding. | @systems | nothing | open |
| 4 | **17 `<label for=…>` associations** point at nothing (button groups) — convert to radio inputs or `aria-labelledby`. Known since 2026-08-31. | @systems | nothing | open |
| 5 | **Salvage review of remaining stranded branches**: `01a05fea` (CONTRIBUTING, issue/PR templates, CODEOWNERS, security.txt), `01a0622c` (finance-card fixes + FINANCE.md), `01a05df2` (Second Life script), `01a062bc` (legal.html, LEGAL.md, RISK_NOTICES). Pull the good, drop the contradictory. | @manager | D-006/D-007 landed (done) | open |
| 6 | **Language pages**: thin machine-translated hreflang cluster — enrich with genuinely localised content or consolidate (owner question). | OWNER | owner decision | pending |
| 7 | **`sw.js`**: enable (network-first HTML, cache-first cards) or delete. Large win for a 562-tool offline site, but rollout wants care. | OWNER | owner decision | pending |
| 8 | **`indexbeta.html`, `hokidea.html`, four unlinked CV files, `substitutions/`, `system/`, `digitaldetoxcardshtml/`**: ship-or-delete decisions. | OWNER | owner decision | pending |
| 9 | **`AI_API_KEY` repository secret**: without it the facility's `generate` mode is skipped (audit + fix still run). Owner to add a key (Gemini or OpenAI) if draft generation is wanted. | OWNER | owner decision | pending |
| 10 | **Docs count refresh after #1 lands**: README/AGENTS/AGENT_ACCESS/ARCHITECTURE category table to the new real count. | @manager | #1 | pending |

## Notes

- **Claimed = posted.** Claim an item by posting to `BOARD.md` *and* setting
  yourself as owner in the table.
- Items needing the owner are collected by @manager and asked in one batch —
  never pester the owner individually.
