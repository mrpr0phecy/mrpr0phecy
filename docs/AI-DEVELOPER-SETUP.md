# AI Developer / Site Staff setup

The permanent **AI Developer** workflow is a mission-led maintenance facility,
not an unrestricted autonomous developer. It runs Monday and Thursday at
06:00 UTC, or through **Actions → AI Developer → Run workflow**.

**No API key, paid subscription, npm install or local server is required for
audits, planning or deterministic maintenance.** The normal site remains
static HTML/CSS/JS served by GitHub Pages. Roles are responsibility profiles;
the runner does not start eight independent agents.

Read [STAFF.md](../STAFF.md) for the site's purpose and
[staff/README.md](../staff/README.md) for claims, handovers and decision rules.

## 1. Run it locally

Requirements: **Node 22+, Python 3.10+ and git**, with the relevant repository
files present. Excluding `images/` in a sparse checkout is fine. A sparse
checkout missing `cards/` does not produce a complete passing staff audit.

```bash
node scripts/ai-developer.js staff
node scripts/ai-developer.js check
node scripts/ai-developer.js plan

# A focused report is useful, but is not permission to bypass other gates.
node scripts/ai-developer.js audit --focus visual-design
node scripts/ai-developer.js audit --focus music --json
```

Reports are always written to the gitignored directory:

| Artifact | Use |
|---|---|
| `ai-developer/reports/latest.html` | Self-contained, offline dashboard; search/filter findings, inspect specialists and expand check evidence |
| `ai-developer/reports/latest.json` | Versioned structured evidence: source revision/dirty state, each command/exit status, blockers, owned priorities and operation outcomes |
| `ai-developer/reports/latest.md` | Readable handoff; also appended to the Actions job summary |

Open the HTML file directly. It needs no web fonts, CDN, analytics or service
worker. It is a **snapshot**, not a live authenticated control panel. Report
content is escaped and protected by a restrictive CSP; raw audit/model HTML
is never inserted into the report. The latest files replace the previous run
rather than growing the repository. Comparable full runs also record a
blocker-ID delta in JSON; incomparable/partial runs do not invent trends.

## 2. Modes and exact safety boundaries

| Mode | What runs | Tracked changes | Provider requests |
|---|---|---|---|
| `staff` | Print profiles/mission/check ownership | None | None |
| `check` | Validate manifests, references, budgets and workflow contracts | None | None |
| `audit` | Checks + final `verify.sh`, then reports | None | None |
| `plan` | Same read-only checks, plus the prioritised, owned handoff | None | None |
| `auto` | All checks, then eligible canonical count maintenance + verification | Numeric count substitutions only, if every gate permits | **None**, even with a key |
| `fix` | Same safe maintenance path as `auto` | Numeric count substitutions only | None |
| `generate` | All checks/verification, then explicit bounded draft requests | **None** | Only with a brief, key, explicit model and passing gates |

**Exit status matters:** blocking failures, errors, timeouts, skipped required
checks or failed operations return nonzero. Advisory warnings stay visible
without masquerading as blocking failures. Focused read-only runs can exit 0
for the checks they ran, but `coverage: partial` keeps release readiness and
proposal permission false. Mutation modes never filter away unrelated gates.

The expanded staff suite exposes inherited finance/loader-test failures that
the old `verify.sh` did not run. This is intentional evidence, not a reason to
hide the checks. See `staff/OPEN.md` and triage the failures against the current
implementation. A green ordinary repo check is not a claim that every staff
audit or every browser interaction passes.

### Count maintenance

1. Run the full staff audit. Any non-count blocking failure stops mutation.
2. Obtain a no-write, source-hashed plan from `python3 scripts/sync-counts.py --plan`.
3. Verify catalogue/disk counts agree, the working tree **and index are clean**,
   each target is a tracked in-scope file, hashes still match and changes are
   numeric-only substitutions to the measured count. Historical exemptions
   remain governed by the canonical synchroniser.
4. Apply the plan, rerun all staff checks and `bash scripts/verify.sh`.
5. Roll back failed proposed edits byte-for-byte. Never `git reset` or discard
   human work. If someone changed a file during verification, preserve their
   current content and save the original under `ai-developer/rollback/` for
   explicit recovery. The run fails and cannot propose a PR.

This is not a general-purpose code fixer. It cannot change policy, pricing,
formulas, dependencies, analytics, player behaviour or the catalogue itself.

## 3. GitHub Actions — already configured

Do not paste a second workflow from an old setup guide. The maintained file is
[`.github/workflows/ai-developer.yml`](../.github/workflows/ai-developer.yml).

- The **assessment job** has `contents: read`, a checkout without persisted
  credentials and pinned action releases. Inputs are passed through environment
  variables, not interpolated into shell commands.
- The runner writes its Markdown report to **Job summary**. The `always()`
  upload step preserves the **`site-staff-report`** artifact even on failed
  audits. Download it and open `reports/latest.html`; JSON/Markdown sit beside
  it. If drafts exist, they are quarantined text in the same artifact.
- Only a successful run with verified count edits emits `propose_changes=true`.
  The separate **proposal job** alone receives contents/PR write permission.
  It rejects a stale source SHA, checks/applies the numeric patch, verifies it
  again and creates/updates one **draft** PR on `ai-developer/maintenance`.
- Proposals only run from the default branch. There is **no auto-merge**, no
  automatic card promotion and no new issue/PR per advisory finding.
- A fixed concurrency group serialises maintenance runs. It does not cancel
  a half-completed active run. Report artifacts retain 14 days; count-patch
  artifacts retain 2 days. The local runner keeps only its latest report set.

For automated maintenance PRs, GitHub Settings → Actions → General must allow
GitHub Actions to create pull requests. If this is disabled, the proposal job
reports the error; audits/artifacts remain useful. Do not solve it by embedding
a personal token in a file or requesting credentials in chat.

The ordinary **Agent guardrails** workflow runs `verify.sh`, including the
staff's isolated Node/Python regression tests. Dependabot can update the pinned
GitHub Action release SHAs.

## 4. Optional, explicitly requested draft generation

Skip this section if you only want audits and maintenance.

In **Settings → Secrets and variables → Actions**, configure:

| Setting | Type | Meaning |
|---|---|---|
| `AI_API_KEY` | Repository secret | Credential for the chosen provider; never commit it |
| `AI_PROVIDER` | Repository variable | `gemini` (default) or `openai`; the legacy secret of this name remains supported |
| `AI_MODEL` | Repository variable | An explicit model available to your account that supports the provider's JSON generation endpoint |

**Cost and quota are provider/account dependent.** No “free forever”, fixed
request quota or specific model availability is guaranteed. Scheduled `auto`
makes no provider calls. The runner caps explicit generation at **three
requests**, caps response/draft sizes and has per-request timeouts with **no
automatic retries**. Choose one request to minimise initial cost. In the
workflow, only explicit `generate` dispatches on the default branch receive
the key; audit/fix/auto and non-default-branch runs do not.

Supported endpoints: Gemini `generateContent` and OpenAI `chat/completions`
with JSON output. A model that does not support that endpoint/options fails
visibly; the runner does not silently change providers or pick another model.
Keys go in HTTP headers, not URLs. Provider error bodies are withheld and
known credentials are scrubbed from reports and audit subprocess environments.

Then dispatch **generate** with:

- **brief:** the actual useful gap and acceptance criteria. No private customer
  examples, credentials or personal data. This and public catalogue names are
  sent to the provider.
- **category:** optional exact label from `cards/cards.json`.
- **max_tools:** `1`, `2` or `3` (default `1`). Invalid numbers are errors, not
  unbounded requests.

Local equivalent, **with the key already set securely in the environment**:

```bash
node scripts/ai-developer.js generate \
  --brief "Describe the reviewed unmet need and expected behaviour" \
  --max-tools 1
```

No generation occurs until every configured blocking check and `verify.sh`
passes. Missing keys produce an explicit skip; unsupported models, malformed
responses, duplicates and rejected drafts are errors. Partial batch failure is
still a failed run.

### Draft review and promotion — always manual

Accepted drafts are **`ai-developer/drafts/<slug>.html.txt`**, not browser-loaded
HTML. The runner checks metadata, size in UTF-8 bytes, unique prefixed IDs,
label/ARIA references, script syntax and a conservative IIFE/markup/network
policy. It only parses JavaScript; it does not execute model code. These checks
are intentionally conservative and **not a security proof**.

1. Read the entire text in an editor. Check real usefulness, duplication,
   maths/logic, accessibility, escaping, network behaviour and licence concerns.
2. Review it as untrusted code before any execution. Browser-test only in an
   appropriately isolated environment without credentials or sensitive data.
3. After approval, copy the accepted fragment to `cards/<slug>.html`; never
   replace/delete an existing tool without the owner. Add the slug to the
   appropriate hardcoded category list in `generate-cards-json.js`.
4. Run `node generate-cards-json.js`, `python3 scripts/sync-counts.py` and
   `python3 scripts/build-sitemap.py` after staging new indexable files as
   required by the sitemap generator.
5. Run the full staff audit, `bash scripts/verify.sh`, and actual browser tests.
   Review the diff and use the normal human-reviewed PR process.

## 5. Test changes to the staff facility

```bash
node --test scripts/tests/staff-*.test.js
python3 -m unittest discover -s staff/tests -p 'test_*.py'
node scripts/ai-developer.js check
bash scripts/verify.sh
```

The suites use temporary repositories outside the checkout, fake provider
responses and injected audit results. They do not call a provider, switch the
real session branch or alter production tools. Coverage includes failed and
partial runs, timeouts, dirty trees, rollback/concurrent edits, source hashes,
malicious/duplicate drafts, credential redaction, report escaping/filtering,
shallow ancestry and claim expiry.

Optional browser smoke test after generating a report:

```bash
# Playwright and its browser must be installed OUTSIDE the workspace.
# STAFF_PLAYWRIGHT can be an absolute path to that external module.
node scripts/staff/browser-check.mjs --screenshots
```

Set `STAFF_PLAYWRIGHT` if the package is not on the normal module path, and
`STAFF_CHROMIUM_PATH` only when using a custom browser binary. The test checks
360/390/768/1440px layouts, search/status/product filters, empty state, focus,
44px filter targets, disclosures and zero external requests/script/CSP errors.
Optional screenshots go to the existing gitignored `.design-preview/` area.
This is report UI coverage, not full WCAG certification or production-tool
browser testing. The required CI suite needs no browser or npm dependencies.

## 6. Troubleshooting

- **Workflow cannot parse:** run `node scripts/ai-developer.js check`, inspect
  merge markers and validate changed YAML with `actionlint`. The lightweight
  local contract checker is not a complete YAML parser.
- **Report says NOT READY:** expand the failing evidence, use the accountable
  role and acceptance checks, and consult `staff/OPEN.md`. Do not downgrade a
  blocking check merely to enable generation.
- **Focused audit looks fine but no PR:** focused reports never authorise
  mutation. Only verified tracked count changes can propose a PR.
- **Dirty-tree fix refused:** finish/commit the existing work and rerun. Do not
  reset somebody else's changes to make the status green.
- **Generation skipped:** check the key is configured and that the dispatch is
  explicit `generate` on the default branch. Audits still work without it.
- **HTTP/model/rate-limit error:** inspect your provider account/model settings.
  The runner withholds error bodies to avoid leaking credentials and does not
  retry automatically. Review the quota/cost before manually rerunning.
- **No live-looking dashboard:** by design. Rerun the command for a fresh
  timestamp/revision; no server or background provider loop is required.
