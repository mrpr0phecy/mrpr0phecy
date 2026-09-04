# AGENT_ACCESS.md — how an AI agent gets (and keeps) write access

**For AI agents (or humans) starting a fresh session on this repo.**

This file exists so that any future AI-agent conversation — in *any* tool, on
*any* machine — can get authorised and become productive in a few minutes,
without anyone pasting a secret into a chat.

**Before doing anything else, read [AGENTS.md](AGENTS.md)** — it is the
agent-facing operating manual (what the repo is, what to never touch, exact
task sequences, and the 100 MB workspace budget). This file covers
authentication; AGENTS.md covers everything else.

Last verified: 2026-08-30 · Works with: Bash + `curl` + `jq` (preinstalled in
most agent sandboxes).

---

## 1. Authenticate (the 60-second device flow)

GitHub tokens **cannot be passed from one conversation to another**, and they
must never appear in this repo or in chat. The supported way is GitHub's
**device flow** (the same mechanism `gh auth login` uses): the agent requests a
code, the *human* enters it once on github.com, GitHub then hands the token
straight to the agent.

**One command does the whole dance:**

```bash
bash scripts/agent-auth.sh
```

It will:
1. Print a URL (`https://github.com/login/device`) and a one-time code.
2. Tell the human to enter the code and click **Authorize** (GitHub CLI app,
   scopes: `repo` … `read:org` … `workflow`).
3. Poll until authorisation lands, then save the token to
   `~/.github_token` (outside this repo, `chmod 600`).
4. Optionally configure git's credential helper so `git push` just works.

If you prefer to run it manually instead of using the script:

```bash
# 1. Request a device code (client ID below is GitHub CLI's public ID — it is
#    deliberately not a secret; the human's approval is the gate)
curl -s -X POST https://github.com/login/device/code \
  -H "Accept: application/json" \
  -d client_id=178c6fc778ccc68e1d6a \
  -d 'scope=repo read:org workflow'

# 2. Show the human:  verification_uri  +  user_code
#    (e.g. https://github.com/login/device  →  code AB12-CD34)

# 3. Poll until you get access_token (start ~5s after they approve):
curl -s -X POST https://github.com/login/oauth/access_token \
  -H "Accept: application/json" \
  -d client_id=178c6fc778ccc68e1d6a \
  -d device_code='<device_code from step 1>' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code'

# 4. Keep the token OUT of the repo. Typical layout:
TOK=$(cat ~/.github_token)          # write it here, chmod 600
```

**Never**:
- commit a token, or put one in a URL stored in `.git/config`
  (if it happens: `git remote set-url origin https://github.com/<owner>/<repo>.git`)
- print a token into a chat log, transcript or screenshot
- leave `~/.github_token` readable by other users

**Revoke access at any time:** `https://github.com/settings/applications` →
Authorized OAuth Apps → **GitHub CLI** → Revoke. This invalidates the token
immediately. It is per-account (all the owner's repos), not per-repo; if the
owner wants narrower access, a fine-grained **repo-scoped PAT** is the
alternative (that one has to be pasted once, at the owner's discretion).

---

## 2. Quick start

The repo is big (~125 MB, mostly `images/`). Clone sparse:

```bash
git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/mrpr0phecy/mrpr0phecy.git r
cd r

# Tool work (everything except the photos):
git sparse-checkout set --no-cone '/*' '!/images/'

# Music work (omit the 689 cards too):
# git sparse-checkout set --no-cone '/*' '!/images/' '!/cards/'

git config user.name  mrpr0phecy
git config user.email 5564816+mrpr0phecy@users.noreply.github.com
```

> Cone mode does **not** work here — `git sparse-checkout set cards index.html`
> fails with *"'index.html' is not a directory"*. Use `--no-cone` with
> leading-slash patterns.

**Workspace budget — hard limit: keep the agent workspace under 100 MB.**
`images/` (~50 MB) stays off disk; never materialise it just to look. If the
clone + working files approach the limit, shrink it before continuing
(`git -C r gc --prune=now -q`, remove caches) and report the size.

Serve locally with `python3 -m http.server 8891` (never open the HTML via
`file://` — the catalogue's `fetch()` breaks and looks like a CORS bug).

---

## 3. What this repo is (2-minute version)

One GitHub Pages site, **two deliberately separate products**:

| Product | Entry point | What it is |
|---|---|---|
| **A — The Most Useful Site In The World** | `index.html` | **500** self-contained offline browser tools, indexed by `cards/cards.json` |
| **B — MrProphecy** | `listen.html` | UK hip hop / animated soundscapes from Luton; YouTube + SoundCloud |

**Never mix them**: no music players/banners in the catalogue or cards; no tool
links on music pages. If a task says "improve the site", ask *which* site.

**Standing rules** — `opensourcenews.html` is the owner's live news broadcast:
improvements are welcome (the 2026-08-30 build added the headlines rail,
viewer controls and captions) but keep its facade pattern and the INCOME.md
growth policy, and run `bash scripts/verify.sh` before pushing.
`token.html` is left alone deliberately (see INCOME.md).

Full detail, rules and traps: **[ARCHITECTURE.md](ARCHITECTURE.md)** · money
and what earns: **[INCOME.md](INCOME.md)**.

---

## 4. Adding / editing a tool (Product A) — the exact sequence

1. Write `cards/<tool-name>.html` — an **HTML fragment** (no `<!doctype>`,
   `<head>`, `<body>`). All element IDs must carry a short unique per-tool
   prefix (`xyz-…`) because all 689 cards share one DOM. Wrap all JS in an
   IIFE. Inline styles + the CSS variables from `index.html` only. No network
   calls. Start from an existing card.
2. `node generate-cards-json.js` — rebuilds `cards/cards.json`.
   ⚠️ It **overwrites categories** from hardcoded filename lists: add the new
   filename to the right list inside the script, or re-apply the category.
3. Bump the count in `index.html` (`Search 500` → `Search 501`).
4. `python3` — regenerate `sitemap.xml` (script in ARCHITECTURE.md §6), built
   from `git ls-files` so sparse checkouts don't drop the cards.
5. Commit, push, **wait ~50 s**, then verify live (see §6).

## 5. Non-negotiables (all of these have caused real breakage here)

- `CNAME` file is the custom domain — never delete it.
- `sw.js` exists but is **not registered**; if you enable it, keep
  network-first for HTML and bump `CACHE_NAME`. Cache-first HTML = stale site.
- Language pages form an **hreflang cluster**: adding a language means editing
  all 13 pages, or Google treats them as duplicates.
- Canonical/OG URLs: always `https://` **and** `www.` host.
- `target="_blank"` ⇒ `rel="noopener noreferrer"`; `loading="lazy"` on
  below-the-fold images; respect `prefers-reduced-motion`; mobile-first 360px.
- No placeholders may ship: grep for `dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID`.
- Filenames contain **spaces and en-dashes** (`images/SOSMrWolfs 21.jpg`) —
  quote paths, URL-encode in HTML/XML.
- Growth/views: **legitimate tactics only** (metadata, speed, structured data,
  internal links, translated pages). No bots, hidden players, misleading
  thumbnails or engagement pods — ToS violations that risk the channel.

## 6. Verify after every push

```bash
sleep 50
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/listen.html
curl -s https://www.themostusefulsiteintheworld.com/cards/cards.json \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

Expect `200` and a card count matching `cards/`. GitHub Pages deploys from
`main` with 30–60 s latency; a green push is not proof of a live deploy.

## 7. Current verified state (2026-08-30)

- Cards: **644**, all indexed (no orphans), all with title+description
  (counts are generated — `python3 scripts/sync-counts.py`).
  Categories include the last batch **"MrProphecy Arcade" (10)**.
- Tool counts in [README.md](README.md)/[ARCHITECTURE.md](ARCHITECTURE.md)/
  [INCOME.md](INCOME.md) were refreshed to 493 on this date.
- `ARCHITECTURE.md` §9 lists deliberate leave-alones and open questions.
