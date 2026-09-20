# AGENTS.md — operating instructions for AI agents

Agent-facing entry point for `mrpr0phecy/mrpr0phecy`. Humans: start with
[README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md). Staff
coordination and measured work priorities: [STAFF.md](STAFF.md). Need GitHub
access in a fresh session? See [AGENT_ACCESS.md](AGENT_ACCESS.md).
Last updated: 2026-09-20. **ARCHITECTURE.md is authoritative if anything here
disagrees with it.**

Two files carry the rules, and they do not repeat each other:

- **[CONSTRAINTS.md](CONSTRAINTS.md)** — the seven hard safety lines, the owner
  decisions and the traps whose reasons are invisible from the code. Not
  judgement calls, not summarised here, and never relaxed for scope or speed.
- **This file** — the loop: what to run, in what order, and how to land it.

Section numbers are stable identities (other files cite `§0.5`, `§4`, `§5`), so
a section that is trimmed keeps its number.

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
attempt, not *whether* the hard lines apply: CONSTRAINTS.md outranks it and is
never in scope for a bold reinterpretation.

**Be bold.** The default failure mode of an agent here is timidity — fixing the
literal symptom, leaving the obvious adjacent win, asking permission for
something reversible that is plainly in scope. If the real problem has an
ambitious fix that serves the reader better than the cautious one, do that
version.

**Bold is bounded.** Bold does not mean: touching the analytics footprint,
recording a decision the owner did not make, deleting tools or protected files,
inventing a number, or claiming a check you did not run.

**Show your reasoning in the PR.** Every PR body answers, in plain words: the
boldest useful version of this change and why what shipped is (or is not) that
version; what you deliberately did **not** do and the trade-off you accepted;
what you verified, how, and explicitly what you did **not** verify. "Not
measured" is a valid answer; an invented number is not. A bold idea you could
not ship is still useful — record it in the PR body or `staff/OPEN.md` instead
of dropping it.

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

# 3. Read CONSTRAINTS.md (short, and the only place the hard lines live), then
#    go straight to work. Pull ARCHITECTURE.md §3 (cards), §6 (SEO) or §7
#    (traps) when the task actually touches one — it is a reference, not a
#    prerequisite, and reading all 3,000 lines first is how a session runs out
#    of budget before it edits anything.
```

CI does not gate you: automatic runs are a seconds-fast pass (owner decision
2026-09-19, see §6). Do not wait on them and do not "fix" them back.

## 2. Workspace budget — hard limit

Keep the agent's workspace **under 100 MB, always**.

- Use the sparse clone above. `images/` (~50 MB) must stay off disk.
- Never `git checkout` the images just to look — verify against the live site
  (`curl -sI https://www.themostusefulsiteintheworld.com/images/...`) instead.
- No `node_modules/`, no caches, no stray downloads in the workspace.
- **Never install toolchains/browsers into the workspace.** A single headless
  browser cache is ~600 MB. Install into `/tmp` (e.g. `/tmp/pwenv`,
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers`).
- `bash scripts/workspace-size.sh` reports usage; `--purge` shrinks it (caches +
  `git gc`). If the workspace exceeds the budget, **stop and shrink it**, and
  report the size in your summary.

## 3. Never-do list (check before every change)

CONSTRAINTS.md's hard lines apply unchanged. These are the repo-specific ones
that bite agents:

- **Never print a generated artefact's contents.** `git diff
  local-ai-knowledge.json`, `head cards/cards.json`, `python3 -c
  'print(json.load(...))'` all dump megabytes on **one line**, and `head`/`tail`
  bound *lines*, not bytes. On 2026-09-20 that froze a session mid-command.
  `.gitattributes` marks those paths `-diff` so plain `git diff` refuses to
  render them; use the bounded reader:

  ```bash
  python3 scripts/safe-inspect.py local-ai-knowledge.json   # size, shape, JSON keys
  python3 scripts/safe-inspect.py --diff related.json       # --stat + structural delta
  python3 scripts/safe-inspect.py --head tools-index.json --bytes 400
  ```

  Need a number out of one of them? Compute it (`jq -r '.count'`, `wc -c`) and
  print the number.
- **Never hand-edit a generated artefact or a published count.** `npm run build`
  rewrites all of them from `cards/` (§4); `scripts/verify.sh` re-derives a
  drifted count in place rather than failing, and fails on everything else.
- **`opensourcenews.html`** — the live news broadcast. Touch with care: keep the
  facade pattern, never add hidden players/autoplay tricks (INCOME.md growth
  policy), re-run the full verify before pushing.
- **`token.html`** — kept deliberately (INCOME.md). No crypto promotion.
- **`CNAME`**, `sw.js` (unregistered by design), `guide.txt` (stale), `system/`,
  `substitutions/`, `digitaldetoxcardshtml/`, the CV files — leave alone.
  Deleting anything in ARCHITECTURE.md §9's list needs the owner first.
- Do not "fix" the `o`/`0` handle mismatch (YouTube `@MrProphecy`, SoundCloud &
  Instagram with a zero). Not a typo.
- Never invent YouTube IDs — use the verified table in ARCHITECTURE.md §4.
- No view-bots, hidden players, autoplay tricks or engagement pods; no
  ads/trackers on Product A pages; no paywalls; no fake urgency.

## 4. Common tasks — exact sequences

### The whole loop, start to finish

```bash
# 1. Edit. Cards are fragments; pages are pages; match the design system.

# 2. Iterate against a gate that only runs what your change can reach.
bash scripts/verify.sh              # scoped: prints what it ran and what it skipped
bash scripts/verify.sh --plan       # just the selection, nothing runs

# 3. If you touched cards/ or any generated artefact, re-sync everything
#    derived from the catalogue in one command (~8 s, idempotent):
npm run build

# 4. Before the push, the whole gate:
bash scripts/verify.sh --all

# 5. Commit, push, open the PR, merge it (§7), then check the deploy (§6).
```

### Add a tool (Product A)

```bash
cp cards/<similar-tool>.html cards/<slug>.html    # fragment, no doctype/html/body
#  - IDs: global per-tool prefix `xyz-` on EVERY element (all cards share one DOM)
#  - IIFE-wrapped JS, inline styles + index.html CSS vars only, zero network calls
#  - forms: onsubmit="event.preventDefault();"
```

Then add the slug to the right category list **inside `generate-cards-json.js`**
(it overwrites `category` from those hardcoded lists, so a slug added afterwards
silently loses its category), and run `npm run build`. That one command
regenerates, in dependency order: `cards/cards*.json` → every published tool
count → `tools-index.json` → `categories/` → `sitemap.xml` → `index.html`'s
HOME-FAST-PATH/HOME-PRERENDER blocks → `embed.html` → `tools.html` →
`sitemap.html` → `related.json` → `tools/*.html` → `api/tools*.json` →
`llms.txt`/`llms-full.txt`/`tools-index.html` → `local-ai-knowledge.json`.

Those surfaces used to be re-synced by hand and drifted to 532, 1,061 and 533
of 1195 tools — every one of those a link a visitor could click. `npm run
build:sync` is the same chain without the site brain (5 s of the 8 s); `npm run
build:brain` is the brain alone.

To run one generator instead of the chain — after editing
`scripts/tool-pages.json`, say — this is which one owns which file, and which
verify section fails if it drifts:

| generated artefact | generator | verify § |
|---|---|---|
| `cards/cards.json`, `cards/cards-lite.json` | `node generate-cards-json.js` | 1 |
| every published tool count | `python3 scripts/sync-counts.py` | 9 |
| `tools-index.json` | `node scripts/build-tools-index.js` | 9 |
| `categories/*.html` | `node scripts/build-category-pages.js` | 9 |
| `llms.txt`, `llms-full.txt`, `tools-index.html` | `node scripts/generate-ai-index.js` | 9 |
| `api/tools.json`, `api/tools/*.json` | `node scripts/build-tool-specs.js` | 9 |
| `sitemap.xml` | `python3 scripts/build-sitemap.py` | 10 |
| `local-ai-knowledge.json` (the site brain) | `python3 scripts/build-site-brain.py` | 12 |
| `index.html` HOME-FAST-PATH / HOME-PRERENDER | `python3 scripts/build-home-prerender.py` | 15 |
| `tools/*.html` deep pages | `python3 scripts/build-tool-pages.py` | 16 |
| `embed.html` grid and its "All N" button | `python3 scripts/build-embed-catalog.py` | 18 |
| `tools.html` (the footer's Index) | `python3 scripts/build-tools-page.py` | 22 |
| `sitemap.html` | `python3 scripts/build-html-sitemap.py` | 22 |
| `related.json` | `python3 scripts/build-related.py` | 22 |

`scripts/check-tool-graph.py` (§22) then resolves the whole click graph —
static page → `tool.html` → `cards.json` → the card file → the card's real
`<title>` → `tools-index.json` → the category page → `api/tools.json` — so a
drifted surface is a broken link a visitor can click, not a tidy-up item.

### Publish a per-tool page (the crawlable surface)

`tools/<slug>.html` is generated: real URL, unique crawlable content,
`SoftwareApplication` + `FAQPage` + `BreadcrumbList` JSON-LD, and the live tool
embedded from the same card fragment (never fork the implementation).

1. Add an entry to `scripts/tool-pages.json` (content only — chrome is code).
   Numbers in the prose come from a `compute` block via `{{placeholders}}`,
   never typed.
2. `npm run build` (or `python3 scripts/build-tool-pages.py`).
   `--check` is what verify §16 runs. Keep the list small and evidence-led —
   `staff/OPEN.md` P1-R2.

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

**The gate is scoped by default** (2026-09-20). `bash scripts/verify.sh` maps
your changed paths onto the sections that can read them and says out loud which
sections it skipped, so an edit to `ai.html` no longer pays for the staff
facility, the production monitor and the discovery surfaces:

| change | sections | measured |
|---|---|---|
| a doc or asset nothing reads | 4 | 0.3 s |
| `staff/`, `scripts/ai-developer.js` | 5 | 3.6 s |
| `ai.html` (Lantern) | 10 | 4.4 s |
| a card in `cards/` | 16 | 10.2 s |
| `--all` (everything) | 21 | ~13 s |

Skipping has to be earned: four cheap global scans (placeholders,
`rel=noopener`, secrets, git state) always run; a deleted or renamed file, an
unrecognised path, a change to `verify.sh`/`package.json`/a workflow, or a
clean tree all widen the run to every section. `bash scripts/verify.sh --plan`
prints the selection without running anything, and
`scripts/tests/verify-scope.test.js` (verify §23) pins the map, because a gate
that quietly skips the one check that would have failed is worse than a slow
gate.

- **Before pushing:** `bash scripts/verify.sh --all`. A scoped pass prints
  `scoped to N of 21 sections` and is an iteration gate, not a pre-push gate.
- `npm run verify:full` (`VERIFY_FULL=1`) adds the exhaustive ~1,200-card JS
  sweep; `npm run verify:serial` (`VERIFY_JOBS=1`) gives ordered output when you
  are reading it line by line. Section timings are printed slowest-first, so
  the next slowdown is named rather than mysterious.
- **In CI, on demand:** Actions → *Agent guardrails* → *Run workflow* with
  `full: true` (or `gh workflow run "Agent guardrails" -f full=true`), which
  sets `VERIFY_FULL=1`.
- **Automatic CI is a fast pass** (owner decision 2026-09-19): push and PR runs
  of `agent-guardrails.yml` complete in seconds and never block. Do not wait on
  them and do not restore heavyweight automatic runs without a fresh owner
  instruction.
- **Off your critical path:** the scheduled staff facility
  (`.github/workflows/ai-developer.yml`, Mon & Thu 06:00 UTC) runs all staff
  checks and can open a draft PR when counts drift; the production monitor
  probes the deployed site after merges and every six hours, opening one
  `ops:production-alert` issue on failure. Recovery is a revert or a deployment
  re-run — never an edit to live state.

Deploy check, 30–60 s after a merge (see [docs/OPERATIONS.md](docs/OPERATIONS.md)
before touching a production problem — it is short, and it is the difference
between a five-minute recovery and an hour of guessing):

```bash
node scripts/check-production.js   # the LIVE site vs this repository
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

## 7. Finishing a session — land it on main

**A pushed branch is not finished work.** Sessions run on a per-session branch
(`arena/…`) and cannot push to `main` directly; `main` only moves through a
*merged* PR. That gap is how work goes missing: an agent does the work, opens a
PR, the session ends, nobody merges it. Ten branches' worth sat like that until
PR #27 drained them on 2026-09-07.

```bash
gh pr create --fill --base main          # once the work is ready
gh pr checks <n> --watch                 # fast pass — green in seconds (§6)
gh pr merge <n> --merge                  # land it — do not stop at "PR opened"
git ls-remote origin refs/heads/main     # confirm main actually moved
```

- **Never end a session with an open PR you could have merged.** If checks are
  still running, use `gh pr merge --auto` and say so in your summary.
- If you genuinely cannot merge (no permission, a check you cannot fix, or the
  change is one the owner should read before it lands on `main`), say so
  **explicitly**: PR number, link, and the blocker. Do not leave it implied.
- **Never claim "nothing is lost" or "content landed in X" without verifying
  it.** Compare trees by blob SHA (`git ls-tree -r <branch>` against
  `git ls-tree -r origin/main`) and count what actually differs.
- If you deliberately skip part of a branch, name the excluded paths in the PR
  body so the next agent does not have to re-derive it.
- Deleting the branch afterwards is **optional** — never delete your own session
  branch while the session may continue (the harness tracks work by that name).
- Dependabot PRs count too. Merge them when checks are green, or say why not.

## 8. If unsure

Read ARCHITECTURE.md (authoritative) for the section you are actually in. Money
questions → INCOME.md. Owner: **mrpr0phecy** — ask before deleting,
restructuring, or anything touching opensourcenews.html, monetisation or
YouTube channel behaviour.

## 9. Site Staff / AI Developer facility

Start with **[STAFF.md](STAFF.md)** and **[staff/README.md](staff/README.md)**;
research and rationale in `staff/RESEARCH.md`, owner rulings in
`staff/DECISIONS.md`. This is the one staff area, not a second product.

```bash
node scripts/ai-developer.js staff   # mission, profiles, scopes and review limits
node scripts/ai-developer.js check   # validate config and workflow contracts
node scripts/ai-developer.js plan    # read-only checks + owned priorities
python3 staff/scan.py --mine         # cached branch and working-tree overlaps
```

The ten entries in `scripts/ai-staff.json` are **responsibility profiles, not
independently running agents**; `scripts/ai-audits.json` owns the executable
check definitions and `scripts/ai-config.json` the validated limits. There is
no duplicate prose roster. The measurement profile maintains
`staff/scoreboard.json` and may record `not-measured` but may not invent a
baseline.

Operational runs write `ai-developer/reports/latest.{html,json,md}` (gitignored,
uploaded by Actions even when checks fail). **Do not claim the facility is
healthy because an ordinary verify passes**: inherited finance and loader-test
failures are deliberately surfaced as separate staff blockers.

Modes are `audit | plan | auto | fix | generate`. `audit`/`plan` are read-only.
`auto`/`fix` run all staff checks and then only eligible canonical numeric
count fixes, with clean-tree and source-hash protection, rollback on a failed
post-fix check, and concurrent human edits preserved. **`auto` never calls an
AI provider**, even when a key exists; only an explicit `generate` with a
useful brief, `AI_API_KEY`, `AI_MODEL` and passing gates can request drafts (at
most three, no silent retries). Drafts land in `.html.txt` quarantine — never
executed, auto-promoted or auto-merged.

Claim a scope with `python3 staff/coordinate.py claim ...`, then release or
block it with a summary, validation evidence and explicit next steps. Claims
expire, are branch-scoped, and are **not distributed locks or owner approval**.
Never rewrite another session's board entry. See
[docs/AI-DEVELOPER-SETUP.md](docs/AI-DEVELOPER-SETUP.md) for commands, gates
and recovery.
