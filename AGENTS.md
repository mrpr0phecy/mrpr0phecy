# AGENTS.md — operating instructions for AI agents

Agent-facing entry point for `mrpr0phecy/mrpr0phecy`. Humans: start with
[README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md).
Need GitHub access in a fresh session? See [AGENT_ACCESS.md](AGENT_ACCESS.md).
Last updated: 2026-09-04. **ARCHITECTURE.md is authoritative if anything here
disagrees with it.**

---

## The one rule that generates the rest

> **If a rule matters, make it fail the build. If it can't fail the build,
> it will be broken — usually within a fortnight, usually by someone who read
> the rule and meant well.**

This repo has the receipts. "Bump the count in every file" was written down
six times in ARCHITECTURE.md §9 and performed correctly zero times: the site
simultaneously advertised 250, 483, 500, 562, 602, 612, 622, 632 and 634 <!-- historical-count -->
tools, including on the two pages that ask for money. "Cards make zero network calls"
was law from day one; an audit found 27 cards calling out, one of them posting
your Wi-Fi password to a third party underneath the words *100% private*.
"Regenerate the sitemap with this snippet" shipped a snippet with a bug in it.

None of those were discipline failures. They were **design** failures: the
rule lived in prose, and prose does not run. So when you are tempted to fix a
recurring problem by writing a firmer sentence in a document — don't. Write a
check. Every guardrail in `scripts/` exists because a sentence wasn't enough.

Corollaries, in priority order when they conflict:

1. **Derive, don't duplicate.** A fact stored in two places is already wrong;
   you just don't know which copy yet. The tool count is derived from
   `ls cards/`. The sitemap is derived from `git ls-files`. Never hand-edit
   either.
2. **The check owns the rule.** When a guardrail and a document disagree, the
   guardrail wins and the document is the bug. Fix the document.
3. **Narrow the check until it is silent.** A scanner that cries wolf gets
   ignored, and then it protects nothing. `scan-seo.py` emitted 26 warnings
   demanding social metadata on `noindex` pages; the four real problems were
   invisible in the noise. Warnings must mean something. Zero-warning is the
   only tolerable resting state.
4. **Never make history lie.** Guardrails rewrite *claims*, never the
   changelog. A sentence like "the catalogue was not 500 distinct <!-- historical-count -->
   tools" is true about the past, so `sync-counts.py` freezes everything from
   ARCHITECTURE.md §9 onward. Elsewhere, mark a deliberate historical figure
   with a `<!-- historical-count -->` comment on the same line and the
   checker will leave it alone. Use it only for genuine narrative.

## 0. What this repo is

One GitHub Pages site, **two deliberately separate products**, served from
`main` with no build step (what is committed is what is served, 30–60 s
deploy):

| | Product | Entry | Don't mix |
|---|---|---|---|
| **A** | The Most Useful Site In The World — **644** offline browser tools | `index.html` | Never add music players/banners here |
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

# 3. Establish the baseline BEFORE you touch anything. If this is already
#    red, that is someone else's breakage — say so, don't silently inherit it.
bash scripts/verify.sh
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
  `git gc`).
- `bash scripts/workspace-size.sh` reports current usage any time.
- If the workspace exceeds the budget, **stop and shrink it**; report the
  size in your summary.

## 3. Never-do list (check before every change)

- **`opensourcenews.html`** — the live news broadcast. Keep the facade
  pattern, never add hidden players/autoplay tricks (INCOME.md growth policy).
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
- **Never hand-edit a tool count or `sitemap.xml`.** Both are generated.
  Editing them by hand is how every drift incident started.

## 4. Common tasks — exact sequences

### Add a tool (Product A)
```bash
cp cards/<similar-tool>.html cards/<slug>.html    # fragment, no doctype/html/body
#  - IDs: global per-tool prefix `xyz-` on EVERY element (all cards share one DOM)
#  - IIFE-wrapped JS, inline styles + index.html CSS vars only, zero network calls
#  - forms: onsubmit="event.preventDefault();"

# ⚠ Add the slug to the right category list in generate-cards-json.js FIRST —
#   the script overwrites the category field on every run (ARCHITECTURE.md §3).
node generate-cards-json.js
python3 scripts/sync-counts.py      # every count claim, everywhere. Not by hand.
python3 scripts/build-sitemap.py    # from git, noindex pages excluded

bash scripts/verify.sh && git add -A && git commit -m "Add ..." && git push
sleep 50 && bash scripts/verify.sh --live   # Pages is not instant
```

### Edit a Product B page
Follow `listen.html` (reference implementation). Sitemap/SEO metadata are
required; music pages carry `MusicGroup` JSON-LD. If you touch the hreflang
cluster, edit **all 13 pages** or Google treats them as duplicates.

### "Image is broken"
Sparse clone 404s are expected — `images/` isn't on disk. Confirm with
`curl -sI` against the live site before "fixing" anything.

### A guardrail is failing and you think it's wrong
Sometimes it is — `design-audit.js` spent weeks asserting donate.html said
"483" when it said 644. Fix the check, in the same commit, and say so. What
you must **never** do is route around a red check, loosen it to green without
understanding it, or add an exception for your own file. If a check is wrong,
that is a bug of equal severity to the one it was meant to catch.

## 5. Quality bar (all of these have bitten this repo)

- Unique element IDs across *all* cards (one shared DOM); fragments only.
- `target="_blank"` ⇒ `rel="noopener noreferrer"`; `loading="lazy"` below fold;
  `prefers-reduced-motion` respected; mobile-first (360 px); keyboard reachable.
- **Never interpolate untrusted input into `innerHTML`.** URL parameters,
  `error.message`, and anything out of `cards.json` go in via `textContent`
  or DOM APIs. `tool.html` shipped a reflected XSS through `?card=` this way.
- Canonical + OG URLs: `https://` **and** `www.` host — never plain `http://`.
- No placeholders ship: `VIDEO_ID`, `PLAYLIST_ID`, `dQw4w9WgXcQ`, `YOUR_`.
- Filenames contain spaces and en-dashes — quote paths, URL-encode in markup.
- Commit messages: one line, imperative ("Add ..."), no secrets in any commit.

## 6. Verify and deploy

`bash scripts/verify.sh` is the gate: **11 checks, and it must be green before
every push.** It is the same script CI runs, so a local pass means a green CI.

| # | Check | Script |
|---|---|---|
| 1 | catalogue coherence | `check-cards.py` |
| 2 | placeholder IDs | inline |
| 3 | `target=_blank` / noopener | inline |
| 4 | sitemap parses | inline |
| 5 | top-level SEO | `scan-seo.py` |
| 6 | accessibility | `check-a11y.py` |
| 7 | network egress (D-009) | `check-egress.py` |
| 8 | tool-count claims | `sync-counts.py --check` |
| 9 | sitemap freshness | `build-sitemap.py --check` |
| 10 | secret scan | inline |
| 11 | git state | inline |

Two of these fix themselves — drop `--check`:

```bash
python3 scripts/sync-counts.py      # repairs every stale count claim
python3 scripts/build-sitemap.py    # rewrites sitemap.xml
```

After pushing, `bash scripts/verify.sh --live` confirms production actually
served the change. **A green push is not proof of a live deploy.**

## 7. If unsure

Read ARCHITECTURE.md (authoritative). Money questions → INCOME.md. Owner:
**mrpr0phecy** — ask before deleting, restructuring, or anything touching
opensourcenews.html, monetisation or YouTube channel behaviour.

Ask when the answer changes what the site *is* — its scope, its promises, its
money, its data. Decide for yourself when the answer only changes whether the
site is correct: bugs, security holes, broken links, stale numbers, failing
checks. Nobody needs to be consulted about whether an XSS should be fixed. The
owner's time is the scarcest resource here; spend it on judgement, not on
permission.

## 8. AI Developer staff & the Visual Design Expert

`.github/workflows/ai-developer.yml` runs **Mon & Thu 06:00 UTC** (or on
demand: Actions → AI Developer → *Run workflow*). Its brain is
`scripts/ai-developer.js`; the staff roster lives in
`scripts/ai-staff.json`; reports and generated drafts go to `ai-developer/`
(gitignored, never committed). Modes: `auto | audit | generate | fix`,
optional `category` focus and `max_tools`. Requires the `AI_API_KEY`
repository secret for generation; without it the run audits + fixes only.

Facility rule: **an edit must pass the staff audits before it is proposed.**
Deterministic, generated fixes (count sync, sitemap) may be applied directly
and re-verified with `bash scripts/verify.sh`; anything else — including
generated card drafts — lands in `ai-developer/` for a human to review and
promote, never auto-committed into `cards/`.

**Meet the staff** (`node scripts/ai-developer.js staff`):

- 🎨 **Visual Design Expert** — guardianship of the two design languages:
  Product A *cyan terminal* (`index.html`, `tool.html`, `404.html`,
  `donate.html`, `cards/card.css`) and Product B *neon night*
  (`listen.html`). Audit-first, token-respecting, measurable (contrast AA,
  390px overflow, ≥40px touch targets, focus visibility, reduced motion).
  Runs `node scripts/design-audit.js`. Fix scope: guard-rule presence only —
  every aesthetic decision is documented in ARCHITECTURE.md §5 and
  human-reviewed.
- 🗂 **Catalogue Auditor & Generator** — `cards/`, `cards.json`, sitemap
  coherence (`python3 scripts/check-cards.py`), fragment-only enforcement,
  and draft generation.
- 🔍 **SEO & Metadata Scanner** — every top-level page's title/description/
  canonical/OG/twitter/theme-color and hreflang drift
  (`python3 scripts/scan-seo.py`); advisory only.

If you are an agent taking on design work here: introduce yourself with
`node scripts/ai-developer.js staff` (or read `scripts/ai-staff.json`),
then read ARCHITECTURE.md §5 and run the audits before touching anything.
