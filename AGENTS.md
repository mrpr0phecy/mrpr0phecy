# AGENTS.md — operating instructions for AI agents

Agent-facing entry point for `mrpr0phecy/mrpr0phecy`. Humans: start with
[README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md).
Need GitHub access in a fresh session? See [AGENT_ACCESS.md](AGENT_ACCESS.md).
Last updated: 2026-09-02. **ARCHITECTURE.md is authoritative if anything here
disagrees with it.**

---

## 0. What this repo is

One GitHub Pages site, **two deliberately separate products**, served from
`main` with no build step (what is committed is what is served, 30–60 s
deploy):

| | Product | Entry | Don't mix |
|---|---|---|---|
| **A** | The Most Useful Site In The World — **562** offline browser tools | `index.html` | Never add music players/banners here |
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
# bump count in index.html: "Search 562+ free tools" -> "Search 563+ free tools" (and the hero badge)
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

## 7. If unsure

Read ARCHITECTURE.md (authoritative). Money questions → INCOME.md. Owner:
**mrpr0phecy** — ask before deleting, restructuring, or anything touching
opensourcenews.html, monetisation or YouTube channel behaviour.

---

## 8. Visiting agents — handoff log

A short log of recent agent sessions. Append a new entry on each handoff;
keep the prose concrete, no marketing fluff.

### 2026-09-02 — Marketing & discovery layer (12 commits)
Agent role: marketing/SEO. Branch: `arena/01a05fea-mrpr0phecy`.
Outcome: shipped 10 new top-level pages (`popular`, `new`, `use-case`, `tools`,
`help`, `about`, `press`, `embed`, `changelog`, `sitemap`), 3 long-form blog
posts (mortgage, BMI, compound interest), an RSS feed, an `llms.txt`, an AI
policy at `/.well-known/ai.txt`, a `security.txt`, and a computed
`related.json` for all 562 tools. Sticky top nav + footer discover pills on
the home page. Per-tool `WebApplication` JSON-LD on the standalone viewer.
`popular.html` had 11 broken tool slugs that referenced non-existent
entries — all fixed against `cards/cards.json`.
- Things to be careful of next session: the per-tool JSON-LD on
  `tool.html` runs at runtime and rewrites the page's `<title>`, `og:*`,
  `twitter:*`, `<link rel=canonical>`, and replaces the static
  `WebApplication` JSON-LD in the head. If you change the head metadata,
  test the wrapper init flow, not just the static HTML.
- Open: the translated language pages (`hindi.html`, `marathi.html`, …) are
  Product-B music pages. The constraints in §3 say "never add tool links to
  music pages" — so we did not cross-link them to `/popular`, `/use-case`,
  etc. If you want translated versions of the tool pages themselves, that's
  a separate decision the owner should make.
- Open: blog is 3 posts deep. Long-tail target keywords are still open —
  picked mortgages, BMI, compound interest because they are high-volume
  English-language queries with honest answers. The next ones I'd write are
  "how to read a tide table", "what VO2 max actually measures", and "how
  subnet masks really work" — but only if the next agent has time.
- Did not do (deliberately): did not wire the marketing agent up to any
  chat system (Slack/Discord/webhook). The repo has no such integration
  today; introducing one is a separate decision and needs a webhook URL
  stored as a GitHub secret.

### 2026-09-02 — +10 tools after a coverage audit
Agent role: content. Branch: `main` (commit `cee0c8b`).
Outcome: catalogued every existing title, probed ten subject areas, and
filled ten genuine coverage gaps (Hike Time Planner, Bike Gear Calculator,
Photo Exposure Lab, Race Pace Predictor, Baby Sleep Planner, Energy Tariff
Comparator, Unit Price Comparator, Fluid Type Scale, Fabric Yardage
Estimator, Car Care Tracker). 552 → 562 tools across 23 categories.
- Lesson: do the dump-and-search first, don't guess. Three of the ten
  candidate areas looked covered but were false positives (walking pace was
  in a steps-to-calories tool, cadence was wing-beat cadence in a bird ID
  card, aperture/ND filter were astronomy and capacitor tools). Always
  read the actual title and description before assuming a gap.
- Lesson: own the unit tests of your own work. The Hike Time Planner
  initially rendered sunset times in the viewer's timezone, which made
  Scottish walks look foreign if the user was abroad. Added an explicit
  clock selector.
- Open: the index badge (`heroToolCount`) and the discover-pills in the
  footer are now hardcoded with the current count. If you add tools,
  remember to bump both.
