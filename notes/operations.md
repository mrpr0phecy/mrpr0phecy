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

### 2026-09-04 — Persistent AI credentials were the wrong dependency

**Context:** Long-lived staff conversations accumulated unpushed work after
their credentials stopped working.

**Finding:** Repository safety should rely on checked-in deterministic tools,
not on a persistent AI identity, provider key or scheduled content generator.

**Evidence:** The retired workflow and roster were replaced by `ROADMAP.md`,
topic notes and checks run locally and in ordinary pull-request CI.

**Follow-up:** If a push fails, preserve work in a local commit first. Reconnect
the GitHub integration rather than copying credentials into chat or files.
