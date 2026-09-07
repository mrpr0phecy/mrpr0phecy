# Contributing

Thanks for being here. The site is one GitHub Pages repo, one person, and a
steady stream of AI agents — so the contribution bar is "make it easier for
the next person, not harder". A few notes that will save everyone time.

## Who's here

- **Owner** — `mrpr0phecy` (Russell Head, Luton UK). Final call on
  anything that touches the two products, monetisation, or `opensourcenews.html`.
- **AI agents** — see [AGENTS.md](AGENTS.md) for the handoff log and the
  fresh-session checklist. Each visiting agent should append a short
  handoff entry on session close.

## The two-product rule (please read)

This repo serves **two deliberately separate products** from the same
domain:

| | Product | Entry | Don't mix |
|---|---|---|---|
| **A** | The Most Useful Site in the World — 562 free browser tools | `index.html` | Never add music players/banners here |
| **B** | MrProphecy — UK hip-hop and animated soundscapes | `listen.html` | Never add tool links here |

If your change touches both, you have probably misread the task. The
"don't mix" column is enforced by the verify script and by review.

## The no-fly list (from [AGENTS.md](AGENTS.md) §3)

- `CNAME`, `sw.js` (unregistered by design), `guide.txt` (stale),
  `system/`, `substitutions/`, `digitaldetoxcardshtml/`, the CV files
  (`CV.docx`, `CV.pdf`, `cv.pdf`) — leave alone.
- `opensourcenews.html` — touch with care. It is the live news broadcast;
  the facade pattern is load-bearing. No hidden players, no autoplay, no
  engagement pods (INCOME.md growth policy).
- `token.html` — kept deliberately. No crypto promotion.
- Don't "fix" the YouTube `o` vs SoundCloud/Instagram `0` handle mismatch.
  It is not a typo. See ARCHITECTURE.md §4.
- Don't invent YouTube IDs. Use the verified table in ARCHITECTURE.md §4.
- No view-bots, hidden autoplay, engagement pods, or other ToS violations.
- No ads/trackers on Product A pages. No paywalls. No fake urgency. No fake
  supporter counts.

## Where to start

Depending on what you want to do:

| You want to | Read | Edit |
|---|---|---|
| Add a new tool | ARCHITECTURE.md §3, §6 | `cards/<slug>.html`, then `node generate-cards-json.js` |
| Edit a tool | ARCHITECTURE.md §3 (cards) | `cards/<slug>.html` |
| Improve the catalogue home | ARCHITECTURE.md §6 (SEO) | `index.html` |
| Edit a music page | ARCHITECTURE.md (hreflang cluster) | `listen.html` and all 12 translated siblings together |
| Add a top-level page | ARCHITECTURE.md §6 (SEO) | new `*.html` at repo root, then add to `sitemap.xml` and the footers |
| Add a blog post | nothing — just match the pattern | `blog/<slug>.html`, then add to `blog/index.html` and `feed.xml` |
| Add a translation | AGENTS.md §4 "Edit a Product B page" | the matching translated page in its full set |
| File a bug / request a tool | none — pick an issue template | `.github/ISSUE_TEMPLATE/` |
| Open a PR | none — the template will ask | `.github/PULL_REQUEST_TEMPLATE.md` will pre-fill |

## The quality bar (from [AGENTS.md](AGENTS.md) §5)

These are the things that have bitten this repo before — read them once and
you'll catch your own mistakes:

- Unique element IDs across *all* cards. One shared DOM, lots of fragments
  — your IDs collide with every other card on the page. Use a short
  per-tool prefix (`xyz-input`, `xyz-output`, etc.).
- `target="_blank"` ⇒ `rel="noopener noreferrer"`. `loading="lazy"` below
  the fold. `prefers-reduced-motion` respected. Mobile-first at 360 px.
  Keyboard-reachable.
- Canonical + OG URLs use `https://` **and** `www.`. Never plain `http://`.
- No placeholders ship. `grep -rn "dQw4w9WgXcQ\|VIDEO_ID\|PLAYLIST_ID\|YOUR_"`
  before pushing.
- Filenames have spaces and en-dashes. Quote paths, URL-encode in markup.
- Commit messages: one line, imperative ("Add ...", "Fix ...", "Update
  ..."). No secrets, no private tokens, no .github_token content.
- If your change touches the tool count (in either direction), update **all
  of**: the hero badge in `index.html`, the footer discover pills, the
  README quick-facts table, the `AGENTS.md` and `INCOME.md` headline
  numbers, and the ItemList JSON-LD on the top-level discovery pages.
  The verify script will not catch a stale hero badge.

## Pre-push checklist (use this every time)

```bash
# 1. The verify script
bash scripts/verify.sh

# 2. If you added a tool or changed a slug: cards.json must be regenerated
node generate-cards-json.js

# 3. If you added/changed top-level pages: sitemap must be regenerated
#    (the script lives in ARCHITECTURE.md §6)
python3 - <<'PY'
PY

# 4. If you touched a translated cluster: edit all of them or Google
#    treats them as duplicates
#    (no automated check for this — be careful)

# 5. If you changed the tool count, grep for the old number
grep -rn "<OLD_COUNT>" *.html
```

## After merge

A green GitHub Actions run is not proof of a live deploy. GitHub Pages takes
30–60 seconds. Verify on the live URL:

```bash
sleep 50
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/<your-page>.html
```

## If unsure

Read [ARCHITECTURE.md](ARCHITECTURE.md) (authoritative). Money questions →
[INCOME.md](INCOME.md). Anything about deleting, restructuring, or touching
`opensourcenews.html`, monetisation, or YouTube-channel behaviour → ask the
owner (`mrpr0phecy`) first.
