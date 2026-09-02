# ✅ DECISIONS

Settled questions. **Binding on every agent**, including future sessions of
the agent that wrote them. Proposed by staff; the owner (`@mrpr0phecy`) has
the final call and can overturn any of them.

Discussion happens on [`BOARD.md`](BOARD.md). This file is only the settled
outcomes, kept separate so a decision does not scroll off the bottom of a
conversation log.

If you think one is wrong, don't silently revert it — reopen it in
[`BOARD.md`](BOARD.md) with evidence and let it be re-decided. A
decision that gets quietly undone comes back as the same bug three weeks later.

Format: what was decided, why, what it means in practice, who owns it.

---

## D-001 — Published numbers must be derived, never typed

**Decided:** 2026-09-02 · **Owner:** @legal · **Status:** binding

**Context.** The tool count appeared as 483 on `donate.html`, `sponsor.html`
and `404.html`, 500 on `tool.html` and in the docs, and 562 in `index.html` —
while `ls cards/*.html | wc -l` said 562. The two pages asking visitors for
money carried the most out-of-date number. The scanner later found `01a05a89`
shipping 672 cards while claiming 602, and `01a05df2` at 542 claiming 537.

**Decision.** Any number published on the site must be measured in the same
change that publishes it. For the catalogue that is
`ls cards/*.html | wc -l`. If you can't derive it, don't state it.

**In practice.** Changing the card count means updating `index.html` (hero
badge, search placeholder, both JSON-LD blocks), `tool.html`, `donate.html`,
`sponsor.html` and `404.html` **together**. `scripts/check-cards.py` verifies
the catalogue; `staff/scan.py` shows cross-branch drift.

**Applies to:** tool counts, audience/subscriber figures, revenue claims,
"X people used this", sponsorship reach.

---

## D-002 — Analytics is disclosed, never denied

**Decided:** 2026-09-02 · **Owner:** @legal · **Status:** binding
**Supersedes:** an earlier position (same day) of removing analytics entirely

**Context.** Google Analytics (`G-G058FVW6Z2`) shipped on 14 pages and
Tawk.to on 12, while `index.html`, `tool.html`, `donate.html` and
`sponsor.html` advertised "no tracking" and "100% Private". Analytics was
briefly removed to make the claims true; the owner then decided reach matters
more and reinstated GA sitewide. The scanner shows **six of seven branches**
still shipping analytics *and* the contradicting claims.

**Decision.** Google Analytics runs sitewide, loaded from `/analytics.js`.
The claims come out instead. No page may state "no tracking", "no cookies",
"no analytics", "100% private" or equivalent.

**In practice.**
- GA loads from **`analytics.js` only** — one `<script defer src="/analytics.js">`
  per page. Never paste an inline `gtag` snippet; the measurement ID lives in
  one file so it can be changed or removed in one edit.
- Claims that **are** still true and should be used instead: "no ads",
  "no accounts", "no sign-ups", "no paywalls", "runs in your browser",
  "your inputs never leave your device".
- `legal.html` §3 discloses GA in full, with working opt-out instructions.
- GA runs with `anonymize_ip`, `allow_google_signals: false` and
  `allow_ad_personalization_signals: false`.

**Why it matters.** These claims appear on pages that solicit donations and
sell sponsorship. A false privacy claim there is a consumer-protection
problem (CPRs/ASA), not a style preference.

**Open:** no consent banner currently ships. Under UK PECR reg. 6 a banner is
the safer position, and `legal.html` invites visitors to request one. Revisit
if the audience becomes materially UK/EU — see the board.

---

## D-003 — Disclaimers live in the risk-notice tables, never inside cards

**Decided:** 2026-09-02 · **Owner:** @legal · **Status:** binding

**Context.** The catalogue includes BMI, calorie and child-growth tools,
mortgage/loan/tax calculators, breaker- and cable-sizing tools, and a GDPR
privacy-policy generator. None carried a disclaimer. With 562 cards, per-card
disclaimer text cannot be kept consistent by hand.

**Decision.** Warnings are injected from `RISK_NOTICES` mapping tables in
`index.html` and `tool.html`, keyed by category and slug. Five classes:
`medical`, `finance`, `engineering`, `legal`, `feed`.

**In practice.** Adding a regulated-area tool means adding its slug or
category to **both** tables (keep them in step) — not writing a disclaimer
inside the card. Cards stay pure fragments.

---

## D-004 — One `help.html`, one `legal.html`

**Decided:** 2026-09-02 · **Owner:** @legal · **Status:** binding

**Context.** Two branches (`01a062bc` and `01a05fea`) independently created a
`help.html` FAQ on the same day, at the same URL, without knowing about each
other. One is longer with better site-mechanics answers (Toolbox, keyboard
shortcuts, sharing, offline); the other covers privacy, money, music, legal
and takedown, and has a working client-side search.
**One version states "none of them use analytics" on a page that
loads Google Analytics** — a D-002 violation.

**Decision.** These merge into one file rather than one overwriting the other.
Keep the site-mechanics answers from one and the privacy/legal/money answers
plus the search box from the other. Whoever merges second does the combining, keeps
the `FAQPage` JSON-LD in sync with the visible text, and fixes the analytics
claim per D-002.

**General rule this establishes.** Before creating a new **top-level page**,
run `python3 staff/scan.py` and check no one else has taken the filename.
Cheap to check, expensive to discover after both are written.

---

## D-005 — The branch map is generated, not written

**Decided:** 2026-09-02 · **Owner:** @legal · **Status:** binding

**Context.** Coordination systems built on self-reported status decay: notes
go stale, agents forget to post, and a "currently working on X" line outlives
the work by weeks.

**Decision.** `staff/BRANCHES.md` is produced by `staff/scan.py` from real
branch diffs and is never hand-edited. `staff/BOARD.md` is the hand-written
half: intent, handover and reasoning, which a diff cannot show. **For *what
changed*, believe BRANCHES.md; for *why*, believe BOARD.md.**

**In practice.** Run `python3 staff/scan.py --mine` before you push. It
takes seconds and tells you exactly whose work you're about to collide with.
