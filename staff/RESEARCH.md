# Why the staff system exists

Research baseline: **2026-09-08**, repository commit
`26c61904d9a1cc193cbdf6dfb6b599fade0b4f9e` (PR #34). This is a dated design
rationale, not another live work board or a claim that all inherited defects
were fixed. Fresh execution reports are the source for current check status.

## 1. Start with the actual product

The architecture, owner constraints and live entry points describe two
separate user jobs:

| Product | User's job | What staff should optimise | What is not a useful substitute |
|---|---|---|---|
| Tools (`index.html`) | Find a useful tool, finish a task and trust the result | Correctness, discoverability, accessible interactions, reliable loading, visible network exceptions | More generated cards, larger categories, speculative search-demand claims |
| MrProphecy (`listen.html`) | Discover and intentionally play UK hip hop and animated soundscapes | Verified destinations, click-to-play, a focused listener journey and honest artist facts | Cross-promoting on tools, hidden players, inflated engagement or invented watch-hour data |

Sources examined: `ARCHITECTURE.md` §§1–7, `CONSTRAINTS.md`, `AGENTS.md`,
`INCOME.md`, `STRATEGY.md`, `staff/DECISIONS.md`, current HTML/scripts and both
live pages:

- <https://www.themostusefulsiteintheworld.com/>
- <https://www.themostusefulsiteintheworld.com/listen.html>

The catalogue contained **1,165** indexed card fragments at the baseline.
That is an inventory measurement, not evidence that every tool is correct,
fully offline, equally demanded or financially valuable. Existing network
exceptions mean a blanket “everything is offline/private” promise is unsafe.
The live tool hub also contains music cross-promotion despite the documented
separation rule. The staff system surfaces this conflict for review; this
rebuild does not silently change public navigation or owner policy.

## 2. What the old staff system actually did

The investigation followed commands and call paths, rather than accepting the
role descriptions as proof that checks ran:

| Finding at the baseline | Evidence | Consequence | Design response |
|---|---|---|---|
| The permanent AI Developer workflow could not parse | Unresolved merge marker at the start of `steps` in `ai-developer.yml`; repeated failed workflow runs, including run `34176068239` | The advertised schedule was not an operational safety facility | Repair the YAML, validate workflow contracts in CI, pin action releases and keep failure artifacts |
| `autoTask()` discarded `auditTask()` and `fixTask()` return values and always returned 0 | `scripts/ai-developer.js` control flow | Failed checks could end as a successful run and still reach generation | Propagate failures, distinguish errors/skips/advisories and gate every mutation/provider request |
| `design-audit.js --json` returned before counting findings | Early returns in `check()`/`warn()` and hardcoded `pass: 0` | JSON could claim success regardless of the checks | Count findings before rendering; text and JSON use the same exit semantics, tested with a deliberately broken fixture |
| Count repair only recognised the immediately previous count in a few places | Hardcoded `N - 1` substitutions | Large drift and other public count surfaces were missed | Reuse `sync-counts.py` as the sole planner, add source hashes and numeric-only transactional application |
| Profiles, audit definitions and configuration duplicated or contradicted one another | `ai-staff.json`, unused `ai-audits.json`, unused growth/quality settings in `ai-config.json` | “Requirements” could exist only in prose | Normalise the role/check/limit files, validate their references, require an accountable owner for every check |
| Provider drafts were weakly validated; failed generation still returned 0 | Minimal fragment regex, no actual ID/IIFE/syntax checks, per-draft errors swallowed | Low-quality or duplicate proposals could look successful | Explicit brief/model, bounded calls/bytes, parse-only validation, duplicate checks, failure propagation and `.html.txt` quarantine |
| The branch scanner used stdout emptiness as success/failure evidence | `cat-file -e` produces no stdout on success; an empty three-dot diff triggered a two-tree fallback | Redundant fetches, misleading differences, missed uncommitted collisions | Exit-code-aware git calls, no default fetch/tags, true empty diffs, labelled unknown ancestry and complete dirty-path coverage |
| The board/queue were describing much earlier work | Last substantive board entries on Sept 2–3; later merged PRs #27 and #32–34 changed the real catalogue/tooling | Stale tasks looked current, and merged work could be treated as active conflict | Preserve historical board entries; refresh the human queue from evidence; use expiring per-branch claims and explicit handovers |

Verified GitHub context (via `gh`, not inferred from local branch names):

- [PR #27](https://github.com/mrpr0phecy/mrpr0phecy/pull/27): merged salvage of
  tools/tooling from stranded branches; the PR describes excluded work too.
- [PR #31](https://github.com/mrpr0phecy/mrpr0phecy/pull/31): merged delivery
  instructions explaining the gap between an open PR and work landing.
- [PR #32](https://github.com/mrpr0phecy/mrpr0phecy/pull/32),
  [#33](https://github.com/mrpr0phecy/mrpr0phecy/pull/33),
  [#34](https://github.com/mrpr0phecy/mrpr0phecy/pull/34): merged count-sync,
  static fallback and route work.
- [Failed staff workflow run](https://github.com/mrpr0phecy/mrpr0phecy/actions/runs/34176068239)
  alongside successful ordinary guardrail and Pages runs at the baseline.

A merged PR record is not a substitute for checking which content landed.
Shallow ancestry and squash/salvage histories remain explicitly uncertain in
the new branch scanner; it does not silently label tree differences as new,
unmerged work.

## 3. Wider checks reveal the work that matters

These commands were run before rewriting the facility:

| Command | Baseline result | Interpretation |
|---|---|---|
| `bash scripts/verify.sh` | Passed | The existing gate was useful, but did not run all available checks |
| `node scripts/ai-developer.js audit` | Reported all three profiles passed | Did not establish full-site quality |
| `node scripts/check-finance.js` | **28 failing assertions of 69** | Mixture of stale extraction/assumption checks, numeric disagreements and policy/copy assertions; requires careful triage, not a blanket claim that all financial tools are broken |
| `node --test scripts/tests/card-errors.test.js scripts/tests/lazy-loader.test.js` | Both test files failed | The inherited test harness and current loader must be reconciled; failure alone does not identify which runtime behaviour is wrong |
| `python3 scripts/check-egress.py` | Passed its existing static subset | Does not prove arbitrary dynamic URLs, every input path or all offline behaviour safe |

This is why reliability, financial correctness, privacy and a music-specific
entry-point check now have accountable owners. The rebuild intentionally
**does not** weaken the failing legacy tests to manufacture a green staff
report. The staff facility blocks its own proposals until its blocking checks
pass. The repo's ordinary guardrail workflow additionally tests the new staff
system itself; these are different claims and both results must be disclosed.

## 4. External engineering guidance applied

The implementation follows GitHub's guidance to minimise token permissions,
avoid interpolating untrusted values into shell scripts, and pin actions to
release commit SHAs. Accordingly, the assessment job has read-only repository
permission and no persisted checkout credential; only a separate,
success-gated count-proposal job has contents/PR write permission. User inputs
are environment values, not shell source. [4](https://docs.github.com/actions/security-guides/security-hardening-for-github-actions)

Also reviewed directly:

- **OWASP LLM06:2025, Excessive Agency**:
  <https://genai.owasp.org/llmrisk/llm062025-excessive-agency/>. Its focus on
  limiting functionality, permission and autonomy maps to a provider with no
  tool/shell/file access, a fixed request budget, plain-text output quarantine
  and human approval before promotion. A prompt is not a security boundary.
- **GitHub workflow concurrency**:
  <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency>.
  The permanent maintenance workflow uses one concurrency group without
  interrupting an in-progress run, and one stable maintenance PR branch rather
  than one branch/PR for every scheduled run.

Provider quota, model availability and pricing were **not** verified as
universal facts. The old “100% FREE” setup guide's guarantees are removed.
Generation requires an explicit currently available `AI_MODEL`; the owner
checks their account's pricing/quota. Scheduled auto mode makes no provider
calls, even when a key exists.

## 5. Deliberately not built

- No staff login, database, hosted admin backend, new analytics or runtime
  dependencies. The repo remains static GitHub Pages.
- No pretend agent availability, invented productivity score, automated policy
  rulings, traffic targets or “AI-certified” safety badge.
- No automatic draft execution/promotion, code rewriting, tool deletion,
  monetisation change, YouTube engagement action or PR auto-merge.
- No claim that regex-based static checks prove security, accessibility,
  complete product separation or real playback correctness.
- No wholesale repair of finance cards or the shared loader under the cover
  of a staff-system request. Those are now visible, owned follow-up work with
  evidence and acceptance criteria.

The result should be judged by whether the next maintainer can identify the
right problem, reproduce it, avoid collisions, preserve owner constraints and
hand off verified work — not by how many staff titles or generated tools it
can display.
