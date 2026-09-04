# AGENTS.md — how to work on this repo

You are probably here for one session, with no memory of the last one and no
way to talk to anyone else working in parallel. This file is written for that.

The goal is a **useful site**, not a well-documented process. Three things to
internalise, then go:

1. **`bash scripts/verify.sh` is the contract.** Green means ship it. It is
   the same thing CI runs, so you don't need permission or a second opinion.
2. **[CONSTRAINTS.md](CONSTRAINTS.md) is the only thing you must read first.**
   It is short, and it holds the handful of facts you genuinely cannot work
   out from the code — owner decisions and invisible traps.
3. **Git and GitHub are the record.** `git log`, `gh pr list`, `gh issue list`
   already show who did what. Don't write status reports, board posts,
   handovers or decision logs into the repo. That was tried; it produced more
   process than site.

Everything else — [ARCHITECTURE.md](ARCHITECTURE.md) for how the site is
built, [README.md](README.md) to get running, [INCOME.md](INCOME.md) for
money — is reference. Read the part you need when you need it.

---

## Just do the work

You have a short window. Spend it on the site.

**Decide for yourself** anything that only affects whether the site is
*correct*: bugs, security holes, dead links, stale numbers, failing checks,
accessibility, performance, a tool that doesn't work. You don't need to ask,
claim a task, or announce it. Fix it, verify, push, and say what you did.

**Ask the owner** only when the answer changes what the site *is* — its
scope, its promises, its money, its data, or anything in CONSTRAINTS.md.
Those are genuinely not yours to call. Everything else is.

**Finish things.** One real improvement, verified and pushed, beats five
half-migrations and a plan. If you find more than you can finish, do the
most valuable part properly and put the rest in your closing summary — the
owner reads that.

**Leave the campsite better.** If a check is wrong, fix the check. If a
document lies, fix the document. If a rule has no teeth, give it teeth or
delete it. You do not need sign-off to repair the tooling you're standing on.

## The one engineering rule

> **If a rule matters, make it fail the build.** A constraint that lives only
> in prose gets broken — usually within a fortnight, usually by someone who
> read it and meant well.

This is the lesson the repo paid for. "Bump the tool count everywhere" was
documented six times and performed correctly zero times: the site once
advertised nine different counts at once, <!-- historical-count --> including
on the pages asking for money. "Cards never call the network" was law from day
one, and 27 cards were calling out — one posting Wi-Fi passwords to a third
party under the words *100% private*.

So: **derive, don't duplicate.** The tool count comes from `ls cards/`; the
sitemap comes from `git ls-files`. Both are generated. Where a check and a
document disagree, the check wins and the document is the bug.

And **keep the checks silent.** A scanner that cries wolf gets ignored and
protects nothing — `scan-seo.py` once hid four real defects behind 26 spurious
warnings. Zero-warning is the only acceptable resting state.

## Setup

```bash
# Sparse clone — the repo is ~125 MB with images; keep the workspace <100 MB.
git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/mrpr0phecy/mrpr0phecy.git r && cd r
git sparse-checkout set --no-cone '/*' '!/images/'   # --no-cone is required
git config user.name  mrpr0phecy
git config user.email 5564816+mrpr0phecy@users.noreply.github.com

bash scripts/verify.sh    # baseline BEFORE you touch anything
```

If that baseline is already red, it is someone else's breakage — say so in
your summary rather than silently inheriting it. Need GitHub auth? See
[AGENT_ACCESS.md](AGENT_ACCESS.md). Workspace getting fat?
`bash scripts/workspace-size.sh --purge`. Never install browsers or
toolchains into the workspace — put them in `/tmp`.

## The gate

`bash scripts/verify.sh` — 11 checks, must be green before every push.

| # | Check | Script |
|---|---|---|
| 1 | catalogue coherence | `check-cards.py` |
| 2 | placeholder IDs | inline |
| 3 | `target=_blank` / noopener | inline |
| 4 | sitemap parses | inline |
| 5 | top-level SEO | `scan-seo.py` |
| 6 | accessibility | `check-a11y.py` |
| 7 | network egress | `check-egress.py` |
| 8 | tool-count claims | `sync-counts.py --check` |
| 9 | sitemap freshness | `build-sitemap.py --check` |
| 10 | secret scan | inline |
| 11 | git state | inline |

Two fix themselves — drop `--check`:

```bash
python3 scripts/sync-counts.py      # repairs every stale count claim
python3 scripts/build-sitemap.py    # rewrites sitemap.xml
```

After pushing, `bash scripts/verify.sh --live` confirms production actually
served it. Pages takes 30–60s. **A green push is not proof of a live deploy.**

Never route around a red check or loosen one to reach green without
understanding it. If the check is wrong, fixing it *is* the work.

## Adding a tool

```bash
cp cards/<similar>.html cards/<slug>.html   # fragment: no doctype/html/body
#  - prefix EVERY id with your slug — all 673 cards share one DOM
#  - IIFE-wrapped JS, inline styles + index.html CSS vars, zero network calls
#  - forms: onsubmit="event.preventDefault();"

# Add the slug to the right category list in generate-cards-json.js FIRST —
# the script overwrites the category field on every run.
node generate-cards-json.js
python3 scripts/sync-counts.py      # never edit a count by hand
python3 scripts/build-sitemap.py

bash scripts/verify.sh && git add -A && git commit -m "Add ..." && git push
```

Quality bar, all learned the hard way: unique ids; `target="_blank"` ⇒
`rel="noopener noreferrer"`; `prefers-reduced-motion` respected; mobile-first
(360px); keyboard reachable; **never interpolate untrusted input into
`innerHTML`**; canonical/OG URLs `https://` **and** `www.`; no placeholders
(`VIDEO_ID`, `dQw4w9WgXcQ`, `YOUR_`); quote paths with spaces and en-dashes.

For Product B (music), follow `listen.html`. If you touch the hreflang
cluster, edit **all 13 pages** or Google treats them as duplicates.

## The scheduled checker

`.github/workflows/ai-developer.yml` runs Mon & Thu 06:00 UTC (or on demand)
via `scripts/ai-developer.js`, using the audit definitions in
`scripts/ai-audits.json`. `node scripts/ai-developer.js audits` lists them.
It applies only deterministic fixes; drafts land in gitignored
`ai-developer/` for a human to promote. Nothing auto-commits into `cards/`.
