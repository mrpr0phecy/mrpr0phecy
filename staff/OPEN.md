# OPEN — human work queue

Reviewed against commit `26c61904d9a1cc193cbdf6dfb6b599fade0b4f9e` on
2026-09-08. This is a prioritisation aid, **not** a claim that an agent is
currently working. File-scope claims under `claims/` show reservations; fresh
`node scripts/ai-developer.js plan` output supplies measured findings.

The old queue described pre-salvage branches, missing files and old catalogue
counts. Those descriptions are no longer reliable current status. Their
context is preserved in `BOARD.md`, Git history and the linked GitHub issues;
none is silently declared accepted merely because a similarly named file now
exists. See [RESEARCH.md](RESEARCH.md).

| ID | Outcome | Accountable profile | Evidence / acceptance | State |
|---|---|---|---|---|
| STAFF-01 | Trustworthy finance tools **and** tests aligned to the shipped implementation | `finance` | `node scripts/check-finance.js` reported **28 failing assertions out of 69** at the research baseline. Some are stale extraction/assumption checks; others report numeric disagreements. Classify each, source the assumptions and reproduce actual defects before fixing. Acceptance: documented test vectors, aligned tests and reviewed browser behaviour. | Unclaimed · P1 blocking |
| STAFF-02 | Reliable catalogue loading/retry with executable regression coverage | `reliability` | Both existing `card-errors.test.js` and `lazy-loader.test.js` fail at baseline. Reconcile source extraction with current `index.html`, then test retry/scroll/error behaviour. Acceptance: both suites pass without removing coverage, plus browser evidence. | Unclaimed · P1 blocking |
| STAFF-03 | Product boundaries and privacy copy match standing decisions | `privacy` | `node scripts/staff/site-audit.js boundaries` reports existing tool-side music links and analytics/claim combinations for contextual review. Do not automatically remove navigation, expand/reduce analytics or reinterpret owner policy. | Unclaimed · P1 review; owner escalation where needed |
| STAFF-04 | Design remains accessible without unnecessary external assets | `visual-design` | Static design guards pass at baseline; `404.html` requests an external font despite the documented system-font preference. Review on the next scoped design change, with keyboard, contrast and 360–390px geometry evidence. | Unclaimed · P2 review |
| STAFF-05 | Complete, honest metadata on useful indexable pages | `seo` | Use the current SEO report. Some warnings concern deliberate scratch/noindex pages; prioritise real public routes rather than mechanically filling every field. Acceptance: unique accurate metadata, valid canonical/social URLs, no unreviewed hreflang changes. | Unclaimed · P2 review |
| STAFF-06 | A verified listener journey, not manufactured engagement | `music` | Static music-hub checks do not play a video. Manually verify click-to-play, dismissal/keyboard behaviour and outbound destinations when touching Product B. Preserve the verified handle/ID table. | Unclaimed · manual validation |
| STAFF-07 | Improvements chosen from real needs, not small categories or invented demand | `catalogue` + `seo` | Use owner-supplied Search Console/feedback and reproducible user problems. No traffic, revenue, watch hours or demand was measured in the staff rebuild. The provider receives an explicit reviewed brief only. | Awaiting real demand evidence; no new tracking authorised |

## Claiming and finishing work

Use `python3 staff/coordinate.py claim …` and post context to `BOARD.md`.
Release or block with validation results and explicit next steps. Do not turn
an unclaimed profile assignment into “in progress” without a real session.
One focused change at a time is preferable to competing edits of shared pages.

## Owner dependencies are not staff permissions

`CONSTRAINTS.md` and `DECISIONS.md` remain the sources for owner-only calls:
analytics placement, monetisation, protected-file/legacy cleanup, catalogue
retirement, translated-cluster strategy and service-worker enablement. A
provider key/model is optional; its absence does not prevent audits or safe
maintenance. Configure it only if human-reviewed draft generation is wanted.

The staff system must **not** decide those questions just to empty its queue.
