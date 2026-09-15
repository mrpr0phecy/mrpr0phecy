# Operations notes

Reusable observations about verification, deployment, credentials and repository
hygiene. Nobody owns this collection; any contributor may append evidence-based
notes.

## Current baseline

- The site is static and deployed by GitHub Pages from `main`.
- `bash scripts/verify.sh` is the canonical local quality command.
- `.github/workflows/agent-guardrails.yml` runs deterministic checks without an
  AI provider key.
- Each Arena conversation works on its own branch. Finish, commit and push one
  bounded task before starting another conversation.

## Field notes

### 2026-09-15 — Production drift now has an instrument

**Context:** Every gate in the repository read the working tree. Nothing asked
the deployed site whether it still matched, so a skipped, partial or stale
deploy was invisible until someone happened to look.

**Finding:** `scripts/check-production.js` probes the live origin and compares
it with the checkout (byte-identity for the critical files, the live catalogue
and sitemap parsed and counted, the custom 404, the https upgrade and the apex
host). `.github/workflows/production-monitor.yml` runs it after every Pages
deployment and every six hours, keeps one `ops:production-alert` issue open
while the contract is broken, and closes it on the next passing full run.

**Evidence:** `scripts/tests/production-monitor.test.js` serves a miniature
repository from `127.0.0.1` and drives the shipped functions, so stale bytes,
truncated catalogues, duplicate slugs, sitemap drift, a lost custom 404, slow
origins and unreachable hosts are all proven to fail offline. Section 20 of
`scripts/verify.sh` keeps that suite green; `docs/OPERATIONS.md` holds the
triage table and the rollback path (`scripts/rollback.sh`).

**Follow-up:** Nothing here measures availability percentages or field
performance, and it should not pretend to — those stay `not-measured` on the
scoreboard until a real instrument exists (D-001).

### 2026-09-04 — Persistent AI credentials were the wrong dependency

**Context:** Long-lived staff conversations accumulated unpushed work after
their credentials stopped working.

**Finding:** Repository safety should rely on checked-in deterministic tools,
not on a persistent AI identity, provider key or scheduled content generator.

**Evidence:** The retired workflow and roster were replaced by `ROADMAP.md`,
topic notes and checks run locally and in ordinary pull-request CI.

**Follow-up:** If a push fails, preserve work in a local commit first. Reconnect
the GitHub integration rather than copying credentials into chat or files.
