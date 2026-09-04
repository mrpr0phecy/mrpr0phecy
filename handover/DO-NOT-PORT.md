# DO NOT PORT — four things on this branch that must not be carried over

## 1. ⛔ The `ai-developer.yml` deletion — violates binding decision D-006

This branch **deletes** `.github/workflows/ai-developer.yml`. Do not carry that
deletion over.

`staff/DECISIONS.md` on main records **D-006 — The AI Developer workflow is
permanent**, a binding owner ruling from 2026-09-02:

> On 2026-09-02 the owner confirmed the **AI Developer facility stays**:
> `.github/workflows/ai-developer.yml` (Mon & Thu 06:00 UTC + manual dispatch)
> with `scripts/ai-developer.js`, `scripts/ai-staff.json` and
> `scripts/design-audit.js` (merged via PR #3). An earlier claim recorded on a
> stranded branch that "the owner ordered it deleted" was **not** an owner
> ruling. **Deleting or disabling the facility is a never-do without a fresh,
> explicit owner instruction.**

Two separate reasons this deletion is wrong now:

1. **It is prohibited** by a binding ruling, and that ruling explicitly
   anticipates this exact stranded-branch claim.
2. **Its premise is gone.** The workflow was deleted because it ran
   `node scripts/ai-developer.js` and that file did not exist on any branch, so
   it failed every run. **`scripts/ai-developer.js` now exists on main.** The
   defect that justified the deletion has been fixed a different way.

If the owner genuinely wants it gone, that needs a fresh explicit instruction
recorded as a new decision that supersedes D-006 — not a stray branch diff.

## 2. ⛔ The staff facility — main already has a better one

This branch built `STAFF.md`, `staff/{README,BOARD,OPEN}.md`,
`scripts/staff.sh` and `scripts/check-staff.py`. Main independently built its
own, and it is more capable:

| main has | this branch |
|---|---|
| `staff/DECISIONS.md` — binding rulings (D-001…D-007) | — |
| `staff/BRANCHES.md` — auto-generated map of what each parallel branch touched | — |
| `staff/scan.py --mine` — collision detection across 10 branches | — |
| `staff/OPEN.md` as a work-queue table with owners | `## OPEN-N` headings |
| — | `scripts/staff.sh` (bash digest/open/close/post) |

The two `OPEN.md` formats are **incompatible**. Porting this branch's staff files
would either overwrite main's system or leave two competing ones. Adopt main's.

The one idea worth stealing, if anyone wants it: `scripts/staff.sh` printed a
**live** digest by reading `cards/cards.json` and `sitemap.xml` at run time, so
the numbers it showed could not go stale. Main's `scan.py` already covers the
collision half; the live-facts half is the part with no equivalent.

## 3. ⛔ The 500 → 562 tool-count corrections

This branch corrected a stale count in `README.md`, `AGENTS.md`,
`AGENT_ACCESS.md` and `INCOME.md`. **Main has already fixed this independently**
— verified 2026-09-04: 0 stale `500` count claims in any of those four files, and
main is consistent at **644** cards (`cards.json` 644, `index.html` "Search 644").

Porting these edits would *introduce* wrong numbers.

## 4. ⛔ The regenerated ARCHITECTURE.md category table

This branch regenerated the category table from a 562-card catalogue. Main has
644 cards and at least three categories this branch never saw (`Sports`,
`Mind-Blowing Demos`, `Algorithms & Computer Science`).

Do not port the table. If the table on main is stale, regenerate it from main's
`cards/cards.json` — and note that guard 4 in
[`patches/02-check-cards-guards.patch`](patches/02-check-cards-guards.patch)
makes the build fail if the stated count drifts, which is the durable fix.

---

## Everything else on this branch

Not covered above and not worth porting: the `ARCHITECTURE.md` §9 changelog
entries, the `AGENTS.md` / `README.md` staff signposts, and the repo-map edits.
They all describe this branch's own additions and would be wrong on main.
