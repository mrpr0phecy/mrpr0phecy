# Owner packet 01 — unlock evidence, trust and the first commercial test

**Prepared:** 2026-09-15 · **Time required:** about 45–60 minutes · **Decisions:** 3

This is the shortest path from a large catalogue and a strong plan to measured
usefulness and sustainable income. It requests **outputs, never passwords,
tokens, exported tool inputs or customer identities**. Send aggregate numbers,
screenshots with personal data hidden, or simply mark an item unavailable.

Copy the response block at the end into a maintainer handoff or private owner
record. Only owner-approved, non-sensitive conclusions belong in `BOARD.md`.

## 1 — Evidence read (O-1): tell staff where reality is

### Google Search Console — 20 minutes

1. Open or create the domain property for `themostusefulsiteintheworld.com`.
2. Submit `https://www.themostusefulsiteintheworld.com/sitemap.xml`.
3. In **Performance → Search results**, use the latest complete 28 days and
   compare with the preceding 28 days.
4. Export or record only:
   - total clicks and impressions;
   - top 25 **non-brand** queries with landing page, clicks, impressions, CTR,
     average position and device;
   - top 10 branded queries separately;
   - indexing totals and the three largest exclusion reasons.
5. If no data exists yet, write `new property — baseline due [date]`.

Do the equivalent sitemap/index read in Bing Webmaster Tools if available.
Search Console evidence chooses which tools deserve improvement; it does not
prove why a visitor succeeded or failed.

### Existing analytics and YouTube — 15 minutes

For the same 28-day windows, record aggregate page views for the allowed pages
and outbound actions already measured. **Do not add an event or change the GA
footprint.** In YouTube Studio, record current subscriber count, public watch
hours toward eligibility, top five discovery sources and top five videos by
watch time. Mark unavailable fields unavailable—never estimate them.

**Recommended decision:** approve the read and sitemap submission. This changes
no public tracking and supplies the minimum evidence needed to stop guessing.

## 2 — Analytics boundary (O-2): resolve the 14 → 43 page conflict

D-007 says analytics remains on the pages carrying it at the 2026-09-02 ruling
(about 14: index, music cluster, two money pages and news). The current measured
footprint is 43 pages, including guides/blog pages. Staff cannot ratify that
expansion or remove analytics without you.

Choose one:

- **A — Ratify the exact current 43-page list temporarily.** No further
  expansion. Review page-level value and deletion after one complete 28-day
  baseline. Fastest measurement, largest privacy footprint.
- **B — Restore the narrower D-007 intent.** You name the retained product,
  music, money and news pages; staff produce a precise removal diff for review.
  Stronger data-minimisation posture, less guide-level evidence.
- **C — Defer.** The footprint stays frozen exactly as-is. No analytics event,
  page addition or removal until a later ruling. Safest operationally, but the
  policy conflict remains.

**Staff recommendation:** choose **B** if privacy minimisation is the priority;
choose **A** only if you explicitly value a single 28-day page baseline enough
to accept the larger temporary footprint. There is no silent default.

## 3 — Privacy-safe task study (O-13): let five people show us why

Approve or amend this method:

- 5 adults per qualitative round; recruit a mix of mobile and desktop users who
  did not build the site. This discovers severe problems—it does not estimate a
  population conversion rate.
- 30 minutes remote or in person. Ask participants to think aloud while doing:
  1. find a tool from a plain-language need;
  2. complete one low-risk calculation and explain its result;
  3. recover from one invalid input or no-result search;
  4. find the privacy/safety limitation;
  5. on a separate Product B session, intentionally reach one verified track.
- Ask neutral prompts: “What are you looking for?”, “What do you expect?”,
  “What does that result mean?” Never teach the interface during the task.
- Obtain explicit consent. No session recording by default; no names in the
  repository; never copy values entered into a tool. Record task, device class,
  success/blocker, time band, quote with identifying details removed, and
  severity. Delete recruitment contact details after scheduling.
- Stop a task if it causes distress or could be mistaken for personal medical,
  legal or financial advice. Use fictional low-risk scenarios.

**Recommended decision:** approve this method with no recording. It adds no
site tracking and supplies the “why” that aggregate analytics cannot.

## Copy-and-return owner response

```text
OWNER PACKET 01 — response date:

O-1 EVIDENCE READ
[ ] Approved; aggregate outputs attached/recorded
[ ] Approved; property is new, revisit on:
[ ] Unavailable/deferred until:
Search Console 28-day dates:
Clicks / impressions:
Top-query export location (no credentials):
Indexing totals / largest exclusions:
Bing status:
Existing GA aggregate status:
YouTube subscriber / public-watch-hour snapshot:

O-2 ANALYTICS BOUNDARY
[ ] A — temporarily ratify exact current 43-page footprint
[ ] B — restore narrower D-007 intent; retained page groups/pages:
[ ] C — freeze and defer
Review date (required for A or C):

O-13 TASK STUDY
[ ] Approved exactly as written, no recording
[ ] Approved with these changes:
[ ] Deferred; reason/revisit date:

Owner name/initials:
```

## What staff do immediately after the response

1. Record only non-sensitive dated aggregates and decision text.
2. Select one top task using `scoreboard.json`’s hard gates and tie-breakers.
3. Write the brief: evidence, hypothesis, primary metric, guardrails, smallest
   reversible change and stop rule.
4. Improve one task/template, test it, and compare against the baseline.
5. Prepare packet 02 only after this evidence identifies the right commercial
   conversation; never bury the owner in the remaining decision list.
