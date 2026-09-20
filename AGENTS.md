# AGENTS.md — operating instructions for AI agents

Agent-facing entry point for `mrpr0phecy/mrpr0phecy`. Humans: start with
[README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md).
Staff coordination and measured work priorities: [STAFF.md](STAFF.md).
Need GitHub access in a fresh session? See [AGENT_ACCESS.md](AGENT_ACCESS.md).
Last updated: 2026-09-19. **ARCHITECTURE.md is authoritative if anything here
disagrees with it.**

---

## 0. What this repo is

One GitHub Pages site, **two deliberately separate products**, served from
`main` with no build step (what is committed is what is served, 30–60 s
deploy):

| | Product | Entry | Don't mix |
|---|---|---|---|
| **A** | The Most Useful Site In The World — **1195** offline browser tools | `index.html` | Never add music players/banners here |
| **B** | MrProphecy — UK hip hop & animated soundscapes (Luton) | `listen.html` | Never add tool links here |

Live: `https://www.themostusefulsiteintheworld.com` (CNAME = custom domain,
never delete it). Design systems: **A = cyan terminal** (`--accent:#2dd4ff`),
**B = neon night** (`--hot:#ff2e63`). Match the page you edit.

## 0.5 Creativity charter — be bold, and show your reasoning

Standing instruction from the owner (2026-09-19). This governs *how much* to
attempt, not *whether* the hard lines apply: CONSTRAINTS.md's hard safety
lines outrank it and are never in scope for a bold reinterpretation.

**Be bold.** The default failure mode of an agent here is timidity — fixing
the literal symptom, leaving the obvious adjacent win, asking permission for
something reversible that is plainly in scope. Don't. If the real problem has
an ambitious fix that serves the reader better than the cautious one, do that
version. The owner would rather review a genuine improvement than a timid one.

**Bold is bounded.** Bold does not mean: touching the analytics footprint,
recording a decision the owner did not make, deleting tools or protected
files, inventing a number, or claiming a check you did not run. Those are the
hard lines, not judgement calls.

**Show your reasoning in the PR.** Bold work is only reviewable if the why is
written down. Every PR body answers, in plain words:

- the boldest useful version of this change, and why what shipped is (or is
  not) that version;
- what you deliberately did **not** do, and the trade-off you accepted;
- what you verified, how, and — explicitly — what you did **not** verify.

Never inflate. "Not measured" is a valid answer; an invented number is not. A
bold idea you could not ship is still useful: record it in the PR body or
`staff/OPEN.md` instead of dropping it.

## 1. First ten minutes (fresh session)

```bash
# 1. Authenticate — prints a URL + one-time code for the owner to approve.
bash scripts/agent-auth.sh            # token -> ~/.github_token (chmod 600)

# 2. Clone sparse. The repo is ~125 MB with images; the budget is small.
git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/mrpr0phecy/mrpr0phecy.git r
cd r
git sparse-checkout set --no-cone '/*' '!/images/'
#   (--no-cone is required; cone mode fails here. images/ stays off disk.)
git config user.name  mrpr0phecy
git config user.email 5564816+mrpr0phecy@users.noreply.github.com

# 3. Read the rules that matter before editing anything:
#    ARCHITECTURE.md §3 (cards), §6 (SEO), §7 (traps), §9 (do-not-touch).
#    CI is a fast pass now (owner decision 2026-09-19) — the full verify.sh
#    suite is manual only; see §6. Do not wait on automatic checks.
```

## 2. Workspace budget — hard limit

Keep the agent's workspace **under 100 MB, always**. Practical rules:

- Use the sparse clone above. `images/` (~50 MB) must stay off disk.
- Never `git checkout` the images just to look — verify against the live site
  (`curl -sI https://www.themostusefulsiteintheworld.com/images/...`) instead.
- No `node_modules/`, no caches, no stray downloads in the workspace.
- **Never install toolchains/browsers into the workspace.** A single headless
  browser cache is ~600 MB — it will blow the 100 MB limit. Install into
  `/tmp` (e.g. `/tmp/pwenv`, `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers`).
- Purge before you grow: `bash scripts/workspace-size.sh --purge` (caches +
  `git gc`). Dropping `.git` blobs you don't need (`git reflog expire
  --expire=now --all`) is not usually necessary at depth 1.
- `bash scripts/workspace-size.sh` reports current usage any time.
- If the workspace exceeds the budget, **stop and shrink it**; report the
  size in your summary.

## 3. Never-do list (check before every change)

- **`opensourcenews.html`** — the live news broadcast. Was owner's WIP;
  upgraded with the 2026-08-30 build (headlines rail, viewers' controls,
  captions). Touch with care: keep the facade pattern, never add hidden
  players/autoplay tricks (INCOME.md growth policy), and re-run
  `bash scripts/verify.sh` before pushing.
- **`token.html`** — kept deliberately (see INCOME.md). No crypto promotion.
- **`CNAME`**, `sw.js` (unregistered by design), `guide.txt` (stale),
  `system/`, `substitutions/`, `digitaldetoxcardshtml/`, CV files — leave alone.
- **Deleting anything** in ARCHITECTURE.md §9 list → ask the owner first.
- Do not "fix" the `o`/`0` handle mismatch (YouTube `@MrProphecy`, SoundCloud
  & Instagram with a zero). Not a typo.
- No view-bots, hidden players, autoplay tricks, engagement pods — ToS
  violations (INCOME.md). Legitimate growth only: metadata, speed, internal
  links, translated pages, honest CTAs.
- No ads/trackers on Product A pages; no paywalls; no fake urgency.
- Never invent YouTube IDs — use the verified table in ARCHITECTURE.md §4.
- **Never print a generated artefact's contents.** `git diff
  local-ai-knowledge.json`, `head cards/cards.json`, `python3 -c
  'print(json.load(...))'` — all of these dump megabytes on **one line**, and
  `head`/`tail` bound *lines*, not bytes, so they do not help. On 2026-09-20
  exactly that froze an agent session mid-command and the run had to be killed.
  `.gitattributes` marks the minified/generated paths `-diff` so plain `git
  diff` refuses to render them; use the bounded reader instead:

  ```bash
  python3 scripts/safe-inspect.py local-ai-knowledge.json   # size, shape, JSON keys
  python3 scripts/safe-inspect.py --diff related.json       # --stat + structural delta
  python3 scripts/safe-inspect.py --head tools-index.json --bytes 400
  ```

  Every mode has a hard ceiling on what it prints (`--max-bytes`, default 4 KB).
  If you need a number out of one of these files, compute it (`jq -r '.count'`,
  `wc -c`) and print the number.

## 4. Common tasks — exact sequences

### Add a tool (Product A)
```bash
cp cards/<similar-tool>.html cards/<slug>.html    # fragment, no doctype/html/body
#  - IDs: global per-tool prefix `xyz-` on EVERY element (all cards share one DOM)
#  - IIFE-wrapped JS, inline styles + index.html CSS vars only, zero network calls
#  - forms: onsubmit="event.preventDefault();"
node generate-cards-json.js     # ⚠ OVERWRITES categories: add the slug to the
                                #   hardcoded list in the script first
# Re-sync everything derived from the catalogue. Never hand-edit a count, the
# sitemap, or index.html's generated first screen — the cards/ folder is the
# single source of truth and verify.sh re-derives drifted counts in place
# (self-healing) instead of failing. `python3 scripts/sync-counts.py count`
# prints the canonical number at any time.
#
# tools.html, sitemap.html and related.json used to be hand-maintained and were
# left behind for months — 532, 1,061 and 533 of 1,195 tools respectively, plus
# three phantom slugs in related.json. Every one of those is a link a visitor can
# click, which is why they are generated from cards/ and why
# scripts/check-tool-graph.py now resolves the full graph (static page ->
# tool.html -> cards.json -> the card file -> the card's real <title> ->
# tools-index.json -> the category page -> api/tools.json) as a verify gate.
python3 scripts/sync-counts.py            # tool counts across docs and pages
python3 scripts/build-sitemap.py          # sitemap.xml
python3 scripts/build-home-prerender.py   # index.html HOME-FAST-PATH/PRERENDER
python3 scripts/build-embed-catalog.py    # embed.html grid + "All N" button

# The three discovery surfaces. They are wired into `npm run build` now, but
# run them by hand whenever you touch cards/ or the catalogue:
python3 scripts/build-tools-page.py       # tools.html  (every tool, every category)
python3 scripts/build-html-sitemap.py     # sitemap.html (the HTML one)
python3 scripts/build-related.py          # related.json (1195 x 5 neighbours)
python3 scripts/check-tool-graph.py       # resolves the whole click graph

bash scripts/verify.sh && git add -A && git commit -m "Add ..." && git push
sleep 50   # Pages deploy latency — then verify live (see §6)
```

### Publish a per-tool page (the crawlable surface)
```bash
# tools/<slug>.html is a generated page: real URL, unique crawlable content,
# SoftwareApplication + FAQPage + BreadcrumbList JSON-LD, and the live tool
# embedded from the same card fragment (never fork the implementation).
# 1. Add an entry to scripts/tool-pages.json (content only — chrome is code).
# 2. python3 scripts/build-tool-pages.py      # render tools/*.html
#    python3 scripts/build-tool-pages.py --check   # what verify.sh runs
# Numbers in the prose come from a `compute` block via {{placeholders}}, never
# typed. Adding a page means sitemap.xml changes too (§4's re-sync list).
# Keep the list small and evidence-led — staff/OPEN.md P1-R2.
```

### Edit a Product B page
Follow `listen.html` (reference implementation). Sitemap/SEO metadata are
required; music pages carry `MusicGroup` JSON-LD. If you touch the hreflang
cluster, edit **all 13 pages** or Google treats them as duplicates.

### "Image is broken"
Sparse clone 404s are expected — `images/` isn't on disk. Confirm with
`curl -sI` against the live site before "fixing" anything.

## 5. Quality bar (all of these have bitten this repo)

- Unique element IDs across *all* cards (one shared DOM); fragments only.
- `target="_blank"` ⇒ `rel="noopener noreferrer"`; `loading="lazy"` below fold;
  `prefers-reduced-motion` respected; mobile-first (360 px); keyboard reachable.
- Canonical + OG URLs: `https://` **and** `www.` host — never plain `http://`.
- No placeholders ship: `VIDEO_ID`, `PLAYLIST_ID`, `dQw4w9WgXcQ`, `YOUR_`.
- Filenames contain spaces and en-dashes — quote paths, URL-encode in markup.
- Commit messages: one line, imperative ("Add ..."), no secrets in any commit.

## 6. Verify and deploy

**Owner decision, 2026-09-19: CI is a fast pass.** The automatic per-push and
per-PR `verify.sh` runs (then 21 sections, ~3 minutes each, re-run on every
push)
were measurably slowing agent sessions, so the "Repo checks" job now completes
in seconds and never blocks. Do not wait on it — and do not "fix" it back
(see CONSTRAINTS.md); the slowdown was the bug, not the setup.

Verification still exists; it just no longer sits in your iteration loop:

- **Locally, when a change is risky:** `npm run verify` (`bash
  scripts/verify.sh`) — 22 sections, **~13 s** on two cores (~34 s before
  2026-09-20), ending with a per-section timing table, slowest first. Independent
  sections run in parallel (`min(nproc, 6)` workers); `VERIFY_JOBS=N` pins the
  width and `npm run verify:serial` (`VERIFY_JOBS=1`) gives ordered output when
  you are reading it line by line. `npm run verify:full` (`VERIFY_FULL=1`) is the
  exhaustive gate — it swaps the sampled card-JS check for the full ~1,200-card
  sweep. Or run only the relevant `--check` when you touched a generated
  artefact:

  ```bash
  python3 scripts/sync-counts.py --check      node scripts/build-tool-specs.js --check
  node generate-cards-json.js --check         python3 scripts/build-tools-page.py --check
  python3 scripts/build-sitemap.py --check    python3 scripts/build-html-sitemap.py --check
  python3 scripts/build-tool-pages.py --check python3 scripts/build-related.py --check
  python3 scripts/build-site-brain.py --check python3 scripts/check-tool-graph.py
  ```

  `scripts/test-card.js --all` is batched the same way — one shared jsdom DOM
  per ~40 cards, as index.html runs them.

  If the suite ever feels slow again, read its own timing table before
  profiling: the slowest six sections are named with millisecond timings, and
  two of the worst offenders were sleeps in tests that waited in real time
  (`lite-tier.test.js` suite 7 stalled the bootstrap for the shipped 5 s
  fast-path timeout; `production-monitor.test.js` deliberately timed out a slow
  origin). Both now inject a scaled-down copy of the shipped constant and assert
  the shipped value separately — same coverage, 4.8 s and 5.0 s saved. The
  timing clock is stamped *inside* each child process; stamping the end time
  after `wait` charges every section that shares a slot with a slow neighbour.
- **In CI, on demand:** Actions → *Agent guardrails* → *Run workflow* with
  `full: true` (or `gh workflow run "Agent guardrails" -f full=true`) — the
  full run sets `VERIFY_FULL=1`, so CI stays exhaustive even though the
  push-time run is the fast path.
- **Automatically, off your critical path:** the scheduled staff facility
  (`.github/workflows/ai-developer.yml`, Mon & Thu) runs all staff checks and
  opens a draft PR when counts drift, and the production monitor
  (`.github/workflows/production-monitor.yml`) probes the live site after
  every merge and every six hours, opening one `ops:production-alert` issue
  on failure. Recovery is a revert or a deployment re-run — never an edit to
  live state.

Suspect a deploy problem specifically? The manual probe is still valid:

```bash
node scripts/check-production.js   # the LIVE site vs this repository
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

Read **[docs/OPERATIONS.md](docs/OPERATIONS.md)** before touching a production
problem; it is short, and it is the difference between a five-minute recovery
and an hour of guessing.

## 7. Finishing a session — land it on main

**A pushed branch is not finished work.** Sessions here run on a per-session
branch (`arena/…`) and cannot push to `main` directly; `main` only moves
through a *merged* PR. That gap is how work goes missing: an agent does the
work, opens a PR, the session ends, nobody merges it. Ten branches' worth sat
like that until PR #27 drained them on 2026-09-07.

So finishing the job includes merging it:

```bash
gh pr create --fill --base main          # once the work is ready
gh pr checks <n> --watch                 # fast pass — green in seconds (§6)
gh pr merge <n> --merge                  # land it — do not stop at "PR opened"
git ls-remote origin refs/heads/main     # confirm main actually moved
```

Deleting the branch afterwards is **optional** — a merged branch is harmless,
and if this is your *own* session branch do not delete it while the session may
still continue (the harness tracks work by that branch name). Only delete
stranded `arena/…` branches from *finished* sessions, and only after their
content is confirmed merged into `main`.

Rules:

- **Never end a session with an open PR you could have merged.** If checks are
  still running, use `gh pr merge --auto` and say so in your summary.
- If you genuinely cannot merge (no permission, a check you cannot fix), say so
  **explicitly**: PR number, link, and the blocker. Do not leave it implied.
- **Never claim "nothing is lost" or "content landed in X" without verifying
  it.** Compare trees by blob SHA first — `git ls-tree -r <branch>` against
  `git ls-tree -r origin/main` — and count what actually differs. Vague
  reassurance about salvaged work is worse than an honest gap, because the
  owner has to be able to trust the status report.
- If you deliberately skip part of a branch (PR #27 took `01a07c1d`'s `cards/`
  but not its parallel `tools/` + `categories/` architecture), name the
  excluded paths in the PR body so the next agent does not have to re-derive it.
- Dependabot PRs count too. Merge them when checks are green, or say why not.

## 8. If unsure

Read ARCHITECTURE.md (authoritative). Money questions → INCOME.md. Owner:
**mrpr0phecy** — ask before deleting, restructuring, or anything touching
opensourcenews.html, monetisation or YouTube channel behaviour.

## 9. Site Staff / AI Developer facility

Start with **[STAFF.md](STAFF.md)** and **[staff/README.md](staff/README.md)**.
Research and the rationale are in `staff/RESEARCH.md`; owner rulings remain
in `staff/DECISIONS.md`. This is the one staff area, not a second product.

```bash
node scripts/ai-developer.js staff   # mission, profiles, scopes and review limits
node scripts/ai-developer.js check   # validate config and workflow contracts
node scripts/ai-developer.js plan    # read-only checks + owned priorities
python3 staff/scan.py --mine         # cached refs + staged/unstaged/untracked paths
# Use --fetch explicitly when a current remote snapshot is needed.
```

The ten entries in `scripts/ai-staff.json` are **responsibility profiles,
not independently running agents**. They cover delivery, catalogue/discovery,
reliability, privacy, visual design/accessibility, SEO/content,
research/measurement, music, financial correctness and growth.
`scripts/ai-audits.json` owns executable check definitions;
`scripts/ai-config.json` owns validated limits. No duplicate prose roster.
The measurement profile maintains `staff/scoreboard.json` and the operating
plan; it may record `not-measured` but may not invent a baseline. The Visual
Design Expert still protects ARCHITECTURE.md §5's two design languages; static
checks never substitute for browser geometry/contrast tests.

Operational runs write `ai-developer/reports/latest.html` (offline dashboard),
`latest.json` (structured evidence) and `latest.md` (handoff). Reports/drafts
are gitignored and uploaded by Actions even when checks fail. **Do not claim
the facility is healthy because ordinary verify.sh passes**: inherited finance
and loader-test failures are deliberately surfaced as separate staff blockers.

The permanent `.github/workflows/ai-developer.yml` still runs **Mon & Thu
06:00 UTC**, plus manual dispatch. Modes: `audit | plan | auto | fix | generate`.

- `audit`/`plan` are read-only. `--focus` narrows a report, never a mutation gate.
- `auto`/`fix` run all staff checks, then only eligible canonical numeric count
  fixes. Clean-tree/index + source-hash checks protect existing work. Failed
  post-fix checks roll back; concurrent human edits are preserved for recovery.
- **`auto` never calls an AI provider**, even when a key exists. Only explicit
  `generate`, with a useful brief, `AI_API_KEY`, `AI_MODEL`, and passing gates,
  can request drafts. At most three requests; no silent retries/free-tier claims.
- Drafts are **`.html.txt` quarantine**, never executed, auto-promoted or
  auto-merged. A successful run can propose only verified count maintenance
  through a single human-reviewed draft PR. Owner-only policy stays owner-only.

Claim a scope with `python3 staff/coordinate.py claim ...`, then release/block
with a summary, validation evidence and explicit next steps. Claims expire,
are branch-scoped and are **not distributed locks or owner approval**. Never
rewrite another session's board entry. Unknown shallow ancestry is reported
as tree-only evidence, not a safe-to-push guarantee. See
[the setup guide](docs/AI-DEVELOPER-SETUP.md) for commands, gates and recovery.
