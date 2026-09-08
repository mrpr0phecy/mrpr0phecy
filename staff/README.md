# Staff operations

One coordination area for the repo's human contributors and agent sessions.
Start with [the site mission](../STAFF.md) and [binding decisions](DECISIONS.md).
The public products are not being combined, rebranded or turned into a staff
portal. This system helps their maintainers do better work.

## The operating loop

1. **Understand:** read `ARCHITECTURE.md`, `CONSTRAINTS.md`, `DECISIONS.md` and
   the newest entries on `BOARD.md`. `RESEARCH.md` explains the staff rebuild.
2. **Measure:** run `node scripts/ai-developer.js plan`. Read the report's
   evidence and limitations, not just its colour. No provider key is needed.
3. **Coordinate:** refresh branch evidence when online, then claim a small
   scope on the session's existing branch. The scanner never checks out,
   creates or pushes a branch.
4. **Implement:** fix the highest-impact measured problem. Adding tools is
   not a goal by itself. Never convert a missing analytics metric into an
   invented demand, revenue or engagement claim.
5. **Validate:** run the affected checks, browser-test changed interactions,
   and run `bash scripts/verify.sh`. A staff audit may expose inherited
   failures not yet included in the legacy repo-wide checks; report them.
6. **Hand over:** release/block your claim with evidence and explicit next
   steps; add context to `BOARD.md`. Follow `AGENTS.md`'s PR/merge protocol.
   A released claim means the file reservation ended, **not** that work was
   deployed or that a human approved it.

## Commands you can actually use

```bash
# Read-only reports. Exit 1 means a blocking check or operation failed.
node scripts/ai-developer.js plan
node scripts/ai-developer.js audit --focus privacy
node scripts/ai-developer.js audit --focus music --json

# Local refs by default. --fetch is explicit network access.
python3 staff/scan.py --mine
python3 staff/scan.py --fetch --mine
python3 staff/scan.py --json

# Announce a bounded scope on the CURRENT arena/* branch.
python3 staff/coordinate.py claim --role reliability \
  --task "Make retrying a failed tool load reliable" \
  --files index.html scripts/tests/ --hours 24

python3 staff/coordinate.py renew --hours 12
python3 staff/coordinate.py release \
  --summary "Describe exactly what changed" \
  --validation "Commands, results, browser evidence and any inherited failures" \
  --next "PR/review/deployment status and any remaining work; or explicitly none"

# If you cannot continue, preserve the blocker instead of implying completion.
python3 staff/coordinate.py block \
  --summary "The change needs an owner decision" \
  --validation "Evidence gathered so far" \
  --next "The specific question and who can resolve it"
```

`--files` accepts **exact relative filenames or directory/ scopes**, not
wildcards. Claims last 1–72 hours. One claim file per full branch name avoids
making a shared markdown table a lock server. It is stored under `claims/`;
only that branch's claim is changed by the command. An active claim cannot be
silently overwritten. Reusing an expired claim requires a fresh overlap check.

**Claims are advisory, not distributed locks.** Unpushed claims cannot be seen
by another session. The scanner reads claims in the current checkout and in
available peer refs; `--fetch` refreshes those refs. Expiry is not permission to
discard another session's work. Resolve overlapping/expired scopes on the
board first; `--acknowledge "reviewed reason…"` records that coordination, not
owner approval. Invalid claim records make the scan incomplete, not clean.

## What the branch scanner does differently

- Includes committed changes **and** staged, unstaged, deleted and untracked
  paths for the current branch. Committing is not required to detect overlap.
- Keeps full branch identities and handles spaces/non-ASCII filenames.
- Ignores branches proven merged by ancestry and genuinely empty branch diffs.
- If shallow history prevents a merge-base comparison, reports **tree-only,
  ancestry unknown**. That may include salvaged work already on main. It does
  not label those differences as definitely new work or guarantee conflicts.
- Is offline by default. No hidden fetches, `staff-peek` tags or automatic
  checkout. `--fetch` updates remote-tracking refs, not local branches.
- `--check` returns 0 when the snapshot has no overlap, 1 on overlap, and 2
  on uncertain/incomplete evidence. No exit status is a merge guarantee.
- `--write` regenerates `BRANCHES.md`. Never hand-edit that snapshot.

## The staff manifest is not an imaginary company

`../scripts/ai-staff.json` is the only role/mission source. Every role has
scope, deliverables, review limits and at least one executable check.
`../scripts/ai-audits.json` defines the checks and their accountable owners;
`../scripts/ai-config.json` defines validated execution limits. There is no
parallel roster hidden in an unused config or separate staffroom.

Meet the current profiles with `node scripts/ai-developer.js staff`. The
profiles cover delivery, catalogue/discovery, tool reliability, privacy,
visual design/accessibility, search/content, the listener experience and
financial correctness. A role name is neither a permission nor a claim that
an autonomous worker is active. Do not sign with a model name.

## Evidence, gates and automation

- **Audit/plan:** no tracked-file changes. Focused reports identify unrun
  checks and cannot authorize proposals. JSON/text design results agree.
- **Auto/fix:** run all staff checks regardless of focus. Only the canonical
  `sync-counts.py --plan` can propose numeric count substitutions. Non-count
  blockers stop mutation; a dirty index/tree blocks it too. Source hashes,
  tracked-path checks and numeric-only validation precede every write. Failed
  post-fix audits/verification restore originals; a concurrent edit is
  preserved, with the original saved in `ai-developer/rollback/` for recovery.
- **Generate:** explicit only; a key, chosen model and useful brief are needed.
  All gates must pass before a request. At most three requests, no automatic
  retries, no file/tool/shell access granted to the provider. Accepted output
  is `.html.txt` in quarantine, never executed or published by the runner.
- **Scheduled runs do not call a provider**, even if a key exists. They still
  audit and can propose safe maintenance. The permanent Mon/Thu workflow stays.
- **Failures are durable:** latest HTML/JSON/Markdown reports are written even
  on failure and uploaded by Actions. Errors, timeouts, missing checks and
  skipped sparse-checkout scans cannot become passes. Reports are bounded to
  three latest files, not an ever-growing generated directory in Git.
- Reports are **static evidence snapshots**, not a live control panel, an
  authenticated admin UI, a proof of safety, or actual traffic measurement.

See [automation setup](../docs/AI-DEVELOPER-SETUP.md) for the permission split,
artifact locations and draft-review checklist.

## Decisions, public data and historical records

The decision hierarchy in `DECISIONS.md` is unchanged. Only the owner, or a
manager explicitly relaying the owner's actual words, may record an owner
ruling. Staff suggestions are proposals. Never infer policy approval from a
role assignment, a passing test, a claim acknowledgement or a released claim.

Append dated entries under the marker in `BOARD.md`; never rewrite somebody
else's entry. The board explains **why**, Git and fresh reports show **what**.
`OPEN.md` records human priorities/dependencies; the generated plan routes
current machine findings. Historical counts and past announcements stay
historical rather than being mass-rewritten.

**This repository is public.** Claims, handovers and board entries are public
files; Actions artifacts/logs can also be visible to repository readers. Never
include credentials, personal data, unapproved business information or private
customer examples. Configure provider secrets in GitHub Settings, never in a
claim, prompt, config file or chat.
