# AGENTS.md — operating instructions for AI agents

Agent-facing entry point for `mrpr0phecy/mrpr0phecy`. Humans: start with
[README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md).
Staff coordination and measured work priorities: [STAFF.md](STAFF.md).
Need GitHub access in a fresh session? See [AGENT_ACCESS.md](AGENT_ACCESS.md).
Last updated: 2026-09-08. **ARCHITECTURE.md is authoritative if anything here
disagrees with it.**

---

## 0. What this repo is

One GitHub Pages site, **two deliberately separate products**, served from
`main` with no build step (what is committed is what is served, 30–60 s
deploy):

| | Product | Entry | Don't mix |
|---|---|---|---|
| **A** | The Most Useful Site In The World — **1201** offline browser tools | `index.html` | Never add music players/banners here |
| **B** | MrProphecy — UK hip hop & animated soundscapes (Luton) | `listen.html` | Never add tool links here |

Live: `https://www.themostusefulsiteintheworld.com` (CNAME = custom domain,
never delete it). Design systems: **A = cyan terminal** (`--accent:#2dd4ff`),
**B = neon night** (`--hot:#ff2e63`). Match the page you edit.

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
bash scripts/verify.sh               # pre-push guardrails (works sparse)
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

## 4. Common tasks — exact sequences

### Add a tool (Product A)
```bash
cp cards/<similar-tool>.html cards/<slug>.html    # fragment, no doctype/html/body
#  - IDs: global per-tool prefix `xyz-` on EVERY element (all cards share one DOM)
#  - IIFE-wrapped JS, inline styles + index.html CSS vars only, zero network calls
#  - forms: onsubmit="event.preventDefault();"
node generate-cards-json.js     # ⚠ OVERWRITES categories: add the slug to the
                                #   hardcoded list in the script first
# bump count in index.html: "Search 500" -> "Search 501"
python3 - <<'PY'   # regenerate sitemap (ARCHITECTURE.md §6 has the full script)
PY
bash scripts/verify.sh && git add -A && git commit -m "Add ..." && git push
sleep 50   # Pages deploy latency — then verify live (see §6)
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

```bash
bash scripts/verify.sh             # cards index, placeholders, noopener, sitemap, SEO
sleep 50                           # Pages is NOT instant
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

Expect `200` and a count matching `cards/`. A green push is not proof of a
live deploy.

## 7. Finishing a session — land it on main

**A pushed branch is not finished work.** Sessions here run on a per-session
branch (`arena/…`) and cannot push to `main` directly; `main` only moves
through a *merged* PR. That gap is how work goes missing: an agent does the
work, opens a PR, the session ends, nobody merges it. Ten branches' worth sat
like that until PR #27 drained them on 2026-09-07.

So finishing the job includes merging it:

```bash
gh pr create --fill --base main          # once the work is ready
gh pr checks <n> --watch                 # wait for green
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

The eight entries in `scripts/ai-staff.json` are **responsibility profiles,
not independently running agents**. They cover delivery, catalogue/discovery,
reliability, privacy, visual design/accessibility, SEO/content, music and
financial correctness. `scripts/ai-audits.json` owns executable check definitions;
`scripts/ai-config.json` owns validated limits. No duplicate prose roster.
The Visual Design Expert still protects ARCHITECTURE.md §5's two design
languages; static checks never substitute for browser geometry/contrast tests.

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
