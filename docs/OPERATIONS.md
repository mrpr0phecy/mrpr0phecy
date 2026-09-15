# OPERATIONS.md — running the live site like it matters

**Status: active runbook · created 2026-09-15.** The companion to
[EXCELLENCE.md](../staff/EXCELLENCE.md): that file is the bar, this one is what
to do when production falls short of it. Nothing here overrides
[CONSTRAINTS.md](../CONSTRAINTS.md), [DECISIONS.md](../staff/DECISIONS.md) or
[ARCHITECTURE.md](../ARCHITECTURE.md) — where they disagree, they win and this
file gets fixed.

Read this before you touch a production problem, and read it once when there
isn't one. Three minutes now saves the twenty you will otherwise spend
guessing during an incident.

---

## 1. What we are actually operating

| | |
|---|---|
| Serving model | Static files on GitHub Pages, branch `main`, path `/` |
| Published surface | **Every tracked file, at its own path.** `.nojekyll` disables the Jekyll build that used to drop dot- and underscore-paths |
| Deploy | `git push` → Pages builds → live in 30–60 s (no build step) |
| Rollback | `git revert` + push, or re-run the Pages deployment |
| State | None on the server. No database, no runtime, no sessions |
| Runtime risk | Third-party: GitHub Pages, DNS/CNAME, the TLS certificate |
| On-call | **Nobody.** There is no pager, no shift rota, no uptime SLA |

That table is the whole incident model. Because the deploy artefact *is* the
repository, "the site is broken" almost always resolves into one of three
questions: **is the repository wrong, is the deploy stale, or is Pages itself
down?** Nearly every step below is about telling those three apart before
acting.

Two products live on this domain (CONSTRAINTS.md): the tool catalogue on
`index.html`/`tool.html` and MrProphecy on `listen.html`. A failure in one is
not permission to change the other.

## 2. What watches the site

| Instrument | Watches | Cadence | Where the result lives |
|---|---|---|---|
| `scripts/verify.sh` | The repository: catalogue, links, egress, accessibility, counts, derived artefacts | Every push/PR (`.github/workflows/agent-guardrails.yml`) | CI run + local terminal |
| **Production monitor** (`scripts/check-production.js`) | **The deployed site**: availability, byte-identity with this repo, catalogue/sitemap integrity, https upgrade, custom 404 | Every six hours **and on every push to `main`** — the push run waits 45 s for Pages and then probes (`.github/workflows/production-monitor.yml`) | `Production monitor:` alert issue + run artifact + step summary |
| Pages build status | Whether the deploy itself succeeded | Per push | Actions → *pages build and deployment* |
| Pages deployment history | Which commit is live right now | Per push | Actions → *pages build and deployment* → the environment URL shown on the run |
| AI Developer facility | Catalogue audits, counts, drift between docs and reality | Mon & Thu 06:00 UTC | `ai-developer/reports/` artifact |
| Search Console / CrUX / bookkeeping | Field performance, index coverage, money | Owner-side, monthly | `staff/BOARD.md` via the owner (P0-M1) |

**Honest limits.** The monitor is an *external* probe from one runner, four
times a day. It is not a paging system, it cannot see inside a visitor's
browser, and a green run does not mean "all eleven hundred tools work" — it
means the files it checked match the repository and answered. Field metrics
(LCP/INP/CLS) come from CrUX and belong to the scoreboard, never to this
monitor. There is no client-side telemetry on Product A, and this runbook does
not add any (CONSTRAINTS.md: the analytics footprint is an owner decision).

## 3. Severity ladder

Severity decides how fast, not how loud. Every production incident gets **one**
issue with the `ops:production-alert` label — GitHub's issue timeline then
gives the response and recovery times for free, which is how
`time-to-restore` is measured on the scoreboard.

| Level | Definition | Response |
|---|---|---|
| **S1** | The whole site is unreachable, or serves the wrong bytes sitewide (a deploy that never landed, a truncation, a domain/TLS failure) | Stop other work. Triage now. Announce in the alert issue. |
| **S2** | One surface is broken: 404/`tool.html`/`listen.html` fails, the catalogue will not parse, the sitemap disagrees with the repo | Same working day. |
| **S3** | Degraded but usable: a warning-level finding (slow response, unexpected redirect, wrong content-type on one file) | Next working session; record it. |
| **S4** | Cosmetic or single-card content defect with a workaround | Normal queue (`staff/OPEN.md`). |

"No on-call" still means something: an S1 that arrives at 03:00 is handled when
a human sees it. Say so plainly in the issue rather than implying a response
promise the project cannot keep.

## 4. The alert issue

Opened automatically by the production monitor, and only ever one at a time
(identified by the `Production monitor:` title prefix; the
`ops:production-alert` label is added where the token can create it):

- **Title** names the headline failure, e.g. *Production monitor: the live site
  does not match this repository*.
- **Body** carries the full monitor report, the run URL and the local command
  to reproduce:
  ```bash
  node scripts/check-production.js --json /tmp/report.json --summary /tmp/summary.md
  ```
- **Closed automatically** by the next run that passes. Every run checks the
  whole standing contract (changed-file comparisons are additional to it), so a
  green run is real evidence. Do not close an alert by hand without one.

If you are working an incident, keep the issue current: what you observed, what
you changed, what you saw afterwards. The issue *is* the record — the repository
does not take status reports (CONSTRAINTS.md).

## 5. Triage: read the failure, then act

The monitor names each failure by surface. Find it here.

| Finding | Most likely cause | Do this |
|---|---|---|
| `unreachable: timed out` / `NETWORK` on **everything** | GitHub Pages or DNS outage — not your commit | Check <https://www.githubstatus.com>. If Pages is down, do **not** revert anything; comment the status link on the issue and wait. |
| `live bytes differ from the repository` on a **file you just changed** | Deploy still propagating, or the deploy failed | The push run already waits 45 s and then retries mismatches for ~60 s. If it still differs, look at Actions → *pages build and deployment*: a failed deploy is re-run, a partial one is re-run, and a commit that should never have shipped is reverted. |
| `live bytes differ` on files from a **recent merged PR** | The push never deployed (branch protection, failed build, wrong branch) | Re-run the deployment from `main`. Only revert if the content itself is wrong. |
| `expected 200, received 404` on a file that **is in the repository** | Committed but never published — a build exclusion, not a deploy lag | `git ls-files <path>` to confirm it is tracked, then check that `.nojekyll` still exists at the root: paths beginning with `.` or `_` are dropped by Jekyll when it does not (2026-09-15: `.well-known/*` had been 404 since the day it was added). Re-run the deployment afterwards. |
| `live bytes differ` on **everything** | Live site is serving an older commit | Find the commit that is live (`git log` on the files that differ), compare with `main`, re-run the deployment. |
| `catalogue integrity: live catalogue has N cards, repository has M` | A truncated or partially deployed `cards/cards.json` | Re-run the deployment; if it persists, revert the commit that touched the catalogue. Never hand-edit `cards.json` — regenerate it (`node generate-cards-json.js --check` first). |
| `duplicate slugs on the live site` | Two card files claim one slug | Fix in the repository: `python3 scripts/check-card-collisions.py`, rename the duplicate, regenerate derived artefacts, push. |
| `sitemap integrity` (missing/unexpected URLs) | A page was added or removed without regenerating the sitemap | `python3 scripts/build-sitemap.py`, commit, push. `verify.sh` has the same check locally. |
| `404 handling: ... returned 200, not 404` or `404 route served ... not this repository's 404.html` | Custom-404 setting lost, or `404.html` changed without the deploy landing | Confirm `404.html` exists in the repo, then check the Pages settings (Settings → Pages) that the custom 404 is still used. |
| `https enforcement: plain http did not redirect to https` | The Pages "Enforce HTTPS" setting was turned off, or the certificate is not covering a hostname | Owner action: Settings → Pages → Enforce HTTPS, and check the certificate covers `www` **and** the apex. |
| `apex host` warning | The bare apex does not reach the canonical `www` host | CNAME is authoritative (never delete it); confirm the Pages custom-domain entry lists both hostnames. |
| `slow response: Nms` | Runner network, CDN cold start, or a genuinely heavy page | Compare with CrUX before believing it (EXCELLENCE.md §1d). If CrUX agrees, the work item goes in `staff/OPEN.md`, not here. |
| `content-type ... does not match` | A hosting or tooling change altered how a file is served | Check the file's extension and the live `curl -sI` output; if the site still works, record it and watch for the next run. |

Two rules that keep this table honest:

1. **Distinguish "the repository is wrong" from "the deploy is wrong."** The
   repository is the source of truth; a mismatch is a deploy problem unless you
   can point at the diff that made it wrong.
2. **Never "fix" production by editing live state.** There is none. Every fix
   is a commit, a revert, or a deployment re-run.

## 6. Rollback and fix-forward

**Default: revert.** A revert is provable, reviewable, and returns the site to
a state that was already known good. Fix-forward is allowed only when the
revert is riskier than the fix — a derived artefact mid-regeneration, or a
conflict in generated files (`sitemap.xml`, counts, `embed.html`,
`index.html`'s prerender block).

### Guided revert (preferred)

```bash
bash scripts/rollback.sh                 # plan only: prints exactly what it would do, changes nothing
bash scripts/rollback.sh --execute       # revert HEAD onto a branch, verify, open a PR
bash scripts/rollback.sh --ref <sha> --execute   # revert a specific commit
```

It refuses to run on a dirty tree, never pushes to `main`, never force-pushes,
runs `scripts/verify.sh` on the revert before opening the PR, and prints the
fast-path commands below if you need them instead.

### Fast path, run by the owner (or an agent with write access)

```bash
git switch main && git pull --ff-only
git revert --no-edit <bad-sha>       # one commit, one revert
git push origin main                 # Pages deploys in 30–60 s
```

Then wait for the monitor's push run (or run the monitor by hand) before
declaring recovery. On the default branch, prefer the PR route above unless the
site is down; the PR route leaves the review trail.

### Not a rollback

- Deleting or editing a file directly on GitHub without a commit on `main` —
  impossible for Pages, and it would bypass `verify.sh` anyway.
- Re-deploying a *different* branch or path in the Pages settings. That changes
  what the domain serves and breaks the deploy contract.
- Force-pushing `main`. History is the recovery tool; don't destroy it.

## 7. Verify recovery

1. The monitor run must pass — either wait for the run triggered by your push or:
   ```bash
   node scripts/check-production.js --json /tmp/report.json --summary /tmp/summary.md
   ```
   `exit 0` is the only pass. Exit 1 means the contract is still broken; exit 2
   means the monitor could not run (fix the invocation, not the site).
2. `bash scripts/verify.sh` must be green on the new `main`.
3. The alert issue closes itself on the next passing full run; link the run in
   a comment if you close anything manually.

## 8. After every incident: leave a gate behind

An incident that can repeat is a gate that does not exist yet. Within the next
working session, add the cheapest thing that would have caught it:

| Failure class | The gate it earns |
|---|---|
| Wrong content served | A check in `scripts/check-production.js` (a new surface or invariant) plus a fixture case in `scripts/tests/production-monitor.test.js` |
| Derived artefact drifted | A `--check` mode in the generator, wired into `scripts/verify.sh` |
| Repository rule quietly broken | A test in `scripts/tests/` or a section in `verify.sh` |
| Third-party behaviour changed | A documented expectation here, with the date it was verified |

If no gate is worth writing, say why in the issue — "accepted risk, decision
recorded" is a legitimate outcome; silence is not.

## 9. Changing this system

- **The monitor's expectations follow the repository** (`CNAME` for the host,
  `cards/cards.json` for the catalogue, `sitemap.xml` for the URL set). Never
  hardcode a second copy of a fact the repository already owns.
- **New checks start as warnings** unless they are proven invariants; a
  warning-level finding is reported, never fatal, and gets promoted to a
  failure only once real runs confirm it (the apex-host check is the current
  example).
- **The monitor must stay dependency-free and offline-testable.** It uses Node
  built-ins only and its tests run against a local fixture server, because
  `verify.sh` must be able to prove the monitor still works without touching
  production.
- **Costs stay trivial:** four scheduled runs a day plus one per deployment,
  each a handful of requests to the owner's own domain. If a change would add
  meaningful load or a paid dependency, it is an owner decision first.

## 10. Honest unknowns (do not invent values for these)

- **Availability percentage** — not measured. A four-times-daily probe cannot
  honestly report an uptime figure; GitHub's status history is the closest
  instrument and it is third-party.
- **Time to restore** — measurable from the alert issue's timeline, but only
  once incidents exist. Until then the scoreboard records `not-measured`
  (D-001: a missing baseline is never a zero and never a guess).
- **Recovery during Pages outages** — there is no failover host. The honest
  answer is "wait for Pages", and this runbook says so rather than pretending
  otherwise.
- **Scheduled workflow pauses** — GitHub disables scheduled workflows in
  repositories with 60 days of no activity; a long pause in work also pauses
  the watch. The next push re-enables it.
