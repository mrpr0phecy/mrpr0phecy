# PROMOTE.md — the promo autopilot runbook

The site promotes itself. Two scheduled workflows do the daily and weekly
work; the only recurring human action is merging one draft PR a week
(and even that can be auto-merged — see below).

## What runs when

| Job | Schedule | Does | Writes to repo? |
|---|---|---|---|
| `post` | daily 08:30 UTC (+ track post on Mondays) | Picks Tool of the Day, renders a branded card, posts to Bluesky + Mastodon | No — read-only checkout, API only |
| `refresh` | Mondays 07:00 UTC | Regenerates `feed.xml`, `spotlight.html`, `promo/week-YYYY-Www.html`, `promo/newsletter-draft.md`, `og-tools.png`, the `llms*.txt` index and `sitemap.xml`; runs `verify.sh` | Yes — via draft PR `promo/weekly-refresh` |

Schedules only fire on the **default branch**: merging to `main` activates
the autopilot. Test any branch any time with *Actions → Promo autopilot →
Run workflow* (choose `post`, `refresh`, or `both`).

## One-time setup (15 minutes, £0)

Without secrets both jobs still succeed — `post` dry-runs and `refresh`
needs no secrets at all. To go live, add four repo secrets
(*Settings → Secrets and variables → Actions*):

**Bluesky** — free account, no developer application:
1. Create the account (e.g. `themostusefulsite.bsky.social`).
2. *Settings → Privacy and security → App passwords → Add app password*
   (name it `promo-autopilot`). It shows once — copy it.
3. Secrets: `BLUESKY_HANDLE` = the full handle,
   `BLUESKY_APP_PASSWORD` = the app password (never the main password).

**Mastodon** — free account on any instance:
1. *Preferences → Development → New application*, name it `promo-autopilot`,
   scopes `read:accounts`, `read:statuses`, `write:statuses`, `write:media`.
2. Secrets: `MASTODON_INSTANCE` = host only (e.g. `mastodon.social`),
   `MASTODON_ACCESS_TOKEN` = the access token.

Then trigger a manual `post` run and check the accounts. First live post
should appear within a minute.

## The weekly routine (2 minutes)

1. Merge the `promo/weekly-refresh` draft PR (skim the pick list in the body).
2. Optional: paste `promo/newsletter-draft.md` into your newsletter sender —
   or skip forever by pointing an RSS-to-email automation at `/feed.xml`
   (Buttondown, Mailchimp and follow.it all offer one; the feed always holds
   the last 7 picks plus the week's track).
3. Optional: enable auto-merge on `promo/weekly-refresh` to reduce this to
   zero clicks. The PR already passed `verify.sh` on the proposing runner.

## Overriding the rotation

`promo/queue.json` maps dates to catalogue slugs (`"2026-12-25":
"xmas-santa-tracker"`) and ISO weeks to YouTube ids for tracks. Queued picks
win; everything else rotates deterministically — 1119 tools means three
years of daily posts with no repeats, and every consumer (poster, feed,
spotlight, archive) recomputes the same pick independently, so there is no
shared state to corrupt. Overrides are validated by `check.py` and the
weekly PR lists that week's picks for review.

## Why it never double-posts

Before posting, each publisher reads the account's recent timeline and skips
if today's pick URL is already there. Re-runs, retries and overlapping
schedules are all safe — idempotency comes from the network, not from a log
file that could drift. Run anything with `--live` omitted to dry-run.

## Failure modes (how you notice)

* **A job fails** → GitHub emails the owner (default Actions behaviour). The
  `post` job uploads its card + receipts as artifacts for forensics.
* **Secrets expire** → posts report `no-secrets` and the job still succeeds,
  so check the monthly receipts… actually simpler: the weekly PR body always
  exists, and a missing week of social posts is visible on the accounts.
* **Copy guard** → every template asserts its length budget and the D-002
  banned-phrase list; a violation fails the job before anything posts.
* **Freshness** → `python3 scripts/promo/check.py` reports feed/spotlight
  age; the refresh job runs it before opening its PR.

## Costs

£0/month. Bluesky + Mastodon APIs are free with no post limits at this
volume. GitHub Actions minutes for this workload are deep inside the free
tier. No AI providers, no paid schedulers.

## Deliberate non-goals (v2 ideas)

* **X/Twitter** — API posting now requires a paid tier; the short template
  fits X, so manual cross-posting from the artifacts is trivial.
* **LinkedIn** — needs an OAuth app + 60-day token rotation; the Monday
  template in `copy.py` is written and waiting for when it's worth it.
* **YouTube Shorts** — a ffmpeg renderer turning picks into vertical clips
  is the obvious next channel; upload API needs an OAuth client.
* **Embed wall** — sites embedding tools could PR themselves onto a
  social-proof page; needs an issue template + builder, not worth it
  before the first 10 licensees.

## Files

* `scripts/promo/` — `catalogue.py` (reads cards.json + listen.html),
  `pick.py` (deterministic rotation), `copy.py` (templates + D-002 guard),
  `card.py` (PNG/SVG cards), `post.py` (Bluesky + Mastodon publishers),
  `feeds.py` (RSS), `spotlight.py` (pages + newsletter), `check.py` (health).
* `promo/queue.json` — human overrides. `promo/week-*.html` — archive.
* `.github/workflows/promo.yml` — the schedule. `staff/tests/test_promo.py`
  — the tests (run by `verify.sh`).
