# AGENTS.md — start here

The only file an agent must read; § numbers are cited by code and docs, so they
stay stable. Everything else is reference (§6).

## 0. What this is

Static GitHub Pages — no runtime deps, no deploy build; `main` is live.
Two products share the domain and must stay separate (§3 hard line 6).

### Product A — the catalogue (1,391 tools)

`cards/<slug>.html` fragments — the single implementation of each tool,
inlined verbatim into its own full page at `tool/<slug>.html` (the browse
URL) and still mountable in `index.html` / `tool.html`. Manifest:
`manifest.tools.json`. No ads, no analytics on cards.

| Page | Role |
|---|---|
| `index.html` | catalogue home |
| `tool/<slug>.html` | the tool's own full page — one document per tool (generated, 1,389 of them) |
| `tool.html` | stateful shell — filled links (`&field=value&run=1`), jobs, `&embed=1`; browse links no longer use it |
| `tools.html` | interactive catalogue directory |
| `tools-index.html` | plain no-JS directory (what `llms.txt` links) |
| `embed.html` | embed catalogue + licensing funnel |
| `embed-finance.html` | generated finance-licence landing |
| `popular.html`, `new.html`, `use-case.html` | filtered catalogue views |
| `changelog.html` | catalogue changelog |
| `donate.html` | donation appeal |
| `sponsor.html` | sponsorship enquiries |
| `help.html`, `about.html`, `press.html`, `legal.html` | site pages |
| `guides.html`, `guides/*.html`, `case-studies.html` | long-form content |
| `jobs.html` | multi-step tool workflows |
| `agents.html` | machine guide for AI agents |
| `sitemap.html` | HTML sitemap |
| `blog/*.html` | blog posts |

### Product B — MrProphecy music

Manifest: `manifest.json` (the music PWA). GA on every public page.

| Page | Role |
|---|---|
| `listen.html` | music hub — main entry point |
| `music.html` | press kit, bio, booking |
| `radio.html` | continuous player (47 tracks) |
| `sync.html`, `sync-licence.html` | sync licensing |
| `support.html` | direct artist support (tipping) |
| `thisorthat.html` | head-to-head voting game |
| `youtubepromo2.html` | long-form guide — **indexed, deliberate** |
| `luton.html` | local SEO |
| `mpnews.html` | music news |
| `animation.html` | MrProphecy hip-hop animation |
| 12 language pages | `bengali chinese dutch french hindi japanese marathi portuguese punjabi russian spanish thai` |

Noindex music pages (superseded — don't re-index):
`youtubepromo.html`, `youtubepromo1.html`, `youtubepromo3.html`.

### Standalone pages

| Page | Role | Notes |
|---|---|---|
| `ai.html` | Lantern — on-device AI | own brand, no catalogue data |
| `maps.html` | MostUsefulMaps | open-data map engine |
| `opensourcenews.html` | global live news broadcast | open RSS feeds, no backend |

### Experiments / personal pages

Ask before deleting any: `supaviewer.html`, `sonicfansite.html`, `riley.html`,
`tattoo.html`, `birdapp.html`, `clock.html`, `beachsimulator.html`,
`citysimulator.html`, `fightsimulator.html`, `aiwalker.html`,
`eternalbeffudlementmachine.html`, `edgeoftomorrow.html`, `government.html`.

### Noindex / redirect stubs

Do not re-index or edit content: `byte-realistic.html`, `byte-realistic-v4.html`,
`local-ai.html` (→ ai.html), `licence-admin.html` (owner console, offline),
`slideshowtest.html`, `supadupaman.html`, `sw-check.html` (worker self-check, linked from nowhere).

### Infrastructure

| File | Role |
|---|---|
| `404.html` | custom error page |
| `manifest.json` | music PWA manifest (Product B only) |
| `manifest.tools.json` | catalogue PWA manifest (Product A only) |
| `robots.txt` | allow all + sitemap reference |
| `sw.js` | service worker — registered by `home-core.js` |
| `sw-check.html` | noindex self-check for the cached layer: drives a click-through and reads `mp:stats` from `sw.js` |

Make the smallest complete change; batch edits before checking; search before
reading large or generated files; no unrelated cleanup. Decide routine details
yourself; ask only when intent is materially ambiguous or §3 needs owner
approval. No plans, ledgers or extra docs.

## 1. Validate in proportion to the change

| Change | Before handoff |
|---|---|
| Docs/comments | diff review, changed links/commands, `git diff --check`; no build or browser |
| Page/app code | tests → `npm run verify` once per batch |
| Card | `npm run build`, `node scripts/test-card.js cards/<slug>.html`, `npm run verify` |
| Shared loaders, generators, `sw.js`, cross-card, check infra | tests → `npm run verify:deep`; build if generated output changes |
| Visible UI | also 360 & 1440 px (§5) |

`build` regenerates derived surfaces · `verify` 8 checks (~20 s) · `verify:deep`
adds audits and product tests (~105 s) · `test` runs the product suite
(`node --test scripts/tests/<name>.test.js` for one file). Extra checks only
when impact is uncertain. CI: fast gate on PRs and pushes, `--deep` on `main`
and nightly. Never disable a check; docs that feed generated output still need
their generator.

## 2. Scratch space

Nothing installed in the repo; scripts look in `/tmp/tenv`. jsdom for the card
harness and deep audits; the other two for screenshots only. Brand extras:
`brand/README.md`. Report unavailable checks — a skip is not a pass.

    mkdir -p /tmp/tenv && (cd /tmp/tenv && npm install jsdom)
    (cd /tmp/tenv && npm install puppeteer-core @sparticuz/chromium)   # screenshots only

## 3. Hard lines

`CONSTRAINTS.md` has the reasons, exceptions and enforcing check — open it only
if your change touches one of these lines.

1. `G-G058FVW6Z2`: never add, remove or move it without owner approval; privacy
   claims must match what the page loads.
2. No deceptive or platform-breaking growth; no ads or paywalls on Product A.
3. Never delete a published tool, page, redirect or protected file
   (`ARCHITECTURE.md` §9) without owner approval.
4. `innerHTML` never sees untrusted input — use `textContent` or DOM APIs.
5. No secrets, credentials or auth output; rotate anything that reached history.
6. Music and catalogue stay separate, never cross-promoted.
7. Never hand-edit a generated file; fix the source and regenerate (§4).

Cards stay offline except `scripts/check-egress.py` classifications; new
tracking, cookies or events need `docs/INSTRUMENTATION.md`. Ask before changing
a protection.

## 4. Common tasks — read the block that matches the task

**Add a tool:** `cards/<slug>.html` + its category in `generate-cards-json.js`,
then build and validate (§1). The sitemap lists only tracked files, so a new
tool needs `git add cards/<slug>.html`, a build, `git add tool/<slug>.html`
(the build creates it), then a second build. Check `tool/<slug>.html` (the
browse page — the build makes it from the fragment, so a broken fragment
breaks a real URL now)
and `tool.html?card=<slug>&embed=1`; health/finance also `docs/TRUST.md`.
`scripts/add-tool.sh` commits and pushes (`--no-push` still commits) — only
when those actions are wanted.

**Retire or merge a tool (owner approval, §3):** delete `cards/<slug>.html`
and its `api/tools/<slug>.json`, add `old → new` to `scripts/tool-redirects.json`
and `tool.html`'s `RETIRED_CARDS` (a test compares them), drop its `embed.html`
block and hand-written links, then build — `tool/<old>.html` becomes a noindex
redirect.

**Write a card:** fragment only; slug-prefixed ids, IIFE, CSS scoped to the
card root; init when loading *and* when already loaded; appended UI stays in
the card, listeners/timers cleaned up, deferred work re-checks `document` holds
the root; unique ids, accessible names and valid `for`/ARIA refs; no network or
untrusted HTML. Traps: `CONSTRAINTS.md`.

**Edit a page:** keep the music hreflang cluster (local text edits need no
translation rewrite). Home CSS/JS: `?v=` (`index.html`), `APP_VERSION`
(`home-core.js`) and `CACHE_VERSION` (`sw.js`) move together.

**Generated surfaces:** `npm run build` owns `cards/cards*.json`, sitemaps,
`tools*.html`, `tools-index.*`, `categories/`, `related.json`, `embed.html`,
`api/tools*.json`, `api/tools/*.json`, `tools/*.html`, `tool/*.html` (the full
pages — the sitemap reads `git ls-files`, so an untracked new page is left
out until it is added and the build runs again), `llms*.txt`,
`index.html`'s `HOME-*` blocks and
published counts. Fix the source, then regenerate. `embed-finance.html` →
`scripts/build-embed-landing.py`; brand assets → `brand/gen_assets.py`
(`brand/mark.py`).

## 5. Finish

Visible UI: inspect at 360 & 1440 px and exercise the interaction — screenshots
don't prove behaviour (`node scripts/screenshot.mjs "tool/bmi.html"` writes
/tmp/shots PNGs). No screenshots for docs or non-visual code. Summary: what
changed, what ran, failures and unverified behaviour — never invent
measurements or hide a failure. No PR ritual. Pushing and PRs: §7; say which
§7 level you reached (local, pushed, PR, merged, live).

## 6. Reference — only when needed

`CONSTRAINTS.md` (why a rule exists, owner decisions, card traps) ·
`ARCHITECTURE.md` (map §2, catalogue §3, video IDs §4, design §5, SEO §6, traps
§7, protected §9) · `docs/TRUST.md` health/finance · `docs/INSTRUMENTATION.md`
analytics · `docs/BRAND.md` / `brand/README.md` brand · `docs/OPERATIONS.md`
deploy and incidents.

Use git/GitHub for history. Don't rebuild the removed site brain, staff
facility, task board or decision ledger. Outside agents use the public
catalogue indexes; repo agents need not.

## 7. GitHub access and publishing

The repo is public, so anyone can clone, build and check it; only the owner
(`mrpr0phecy`) and what the owner authorises can write. `main` is the deploy
and has no branch protection (the API answered "Branch protection has been
disabled" on 2026-10-09), so a push to `main` goes live in 30–60 s with only
the post-push deep check and production monitor behind it. Agents push a topic
branch and open a PR; the owner merges. Never push or force-push `main` unless
the owner asks for that exact push (rollback: `docs/OPERATIONS.md` §6).

**Check before you claim.** Each level proves only itself: a local commit or a
green `verify` is not a push, a pushed branch is not a PR, a merge is not live.

| Level | Proof | Allows |
|---|---|---|
| Read | `git ls-remote https://github.com/mrpr0phecy/mrpr0phecy main` answers with no login | clone, build, test, commit locally |
| Write | `gh auth status` names `mrpr0phecy` and `gh api repos/mrpr0phecy/mrpr0phecy --jq .permissions.push` prints `true` | push a branch, open a PR |
| Pushed / PR | `git ls-remote origin refs/heads/<branch>` returns your sha; `gh pr view <branch>` shows the PR | owner review |
| Live | merged, Pages run green, `node scripts/check-production.js` exits 0 | — |

**Ways in** (none is a hidden feature; each needs the owner's own approval):

- **GitHub CLI device login** — how the Sesame assistant first got write
  access (2026-10-09), after plain pushes were refused. An agent with a shell
  and `gh` runs
  `gh auth login --hostname github.com --git-protocol https --web`, which prints
  a one-time code; the owner, signed in to GitHub, enters it at
  <https://github.com/login/device> and approves. The token belongs to the
  owner's account (scopes `repo`, `workflow`, `gist`, `read:org`) and `gh`
  stores it in `~/.config/gh/hosts.yml` on the agent's machine, in plain text.
  `gh pr create` uses it directly; for `git push` use
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push`
  (or `gh auth setup-git` on a machine you own). Revoke it on GitHub under
  Settings → Applications → Authorized OAuth Apps → GitHub CLI.
- **A GitHub App coding agent** the owner connected — the
  `arena/<id>-mrpr0phecy` branches behind 159 merged PRs (#3–#188), opened and
  merged either by `app/arena-ai-coding-agent` or under the owner's account,
  with `arena-ai-coding-agent[bot]` and "Arena Agent" commits. That grant
  belongs to that app; other agents don't inherit it.
- **A session on the owner's machine** (for example Claude Code started
  remotely on the owner's Mac) uses that machine's git login. Two such
  sessions on 2026-10-08 ended without reporting or pushing anything; confirm
  the branch with `git ls-remote` before saying it was pushed.

**No write access?** Finish locally and hand over a bundle or patch, saying it
is unpublished: `git bundle create <topic>.bundle origin/main..<topic>` (owner:
`git fetch <file> <topic>:<topic>`, then push) or `git format-patch -1`
(owner: `git am <file>`). Don't ask the owner for a password or token in chat.

**Publish:**

    git fetch origin && git switch -c <topic> origin/main
    # change, validate (§1), commit
    git push -u origin <topic>          # with the credential helper above if needed
    gh pr create --repo mrpr0phecy/mrpr0phecy --base main --head <topic> \
      --title "<what changed>" --body-file /tmp/pr-body.md

The PR runs "Repo checks"; the deep check runs after merge. Parallel agents:
one branch each from `origin/main`, touch different sections of shared docs
(`AGENTS.md`, `CONSTRAINTS.md`), and `git ls-remote origin 'refs/heads/*'` to
see what is already pushed. Tokens, `gh auth token` output and auth logs never
go in commits, PR text, remote URLs or logs (§3 hard line 5).
