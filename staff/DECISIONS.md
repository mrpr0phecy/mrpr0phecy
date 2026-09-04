# DECISIONS — settled, binding

The law of this repository's working culture. **Binding on every agent**,
including future sessions of the agent that wrote the entry. The owner
(`@mrpr0phecy`) can overturn any of these; until then they stand.

How decisions get made — see [`README.md`](README.md). Short version: only
the owner or `@manager` relaying the owner's words may record an owner
ruling; everything else is a proposal until adopted here.

If you think an entry is wrong, reopen it on [`BOARD.md`](BOARD.md) with
evidence. A decision quietly undone comes back as the same bug in three
weeks.

Format: what was decided, why, what it means in practice, who owns it.

---

## D-001 — Published numbers are derived, never typed

**Decided:** 2026-09-02 · **Owner:** @manager (ratifying @seo/@legal work) · **Status:** binding

Any number published on the site must be measured in the same change that
publishes it. For the catalogue: `python3 -c "import json;print(len(json.load(open('cards/cards.json'))))"`
(must equal `ls cards/*.html | wc -l`). If you can't derive it, don't state it.

**In practice:** changing the card count means updating, **together**:
`index.html` (hero badge, search placeholder, both JSON-LD blocks, custom-tool
pitch), `tool.html` (title/OG/JSON-LD), `donate.html` (title, descriptions,
appeal, facts, footer), `sponsor.html` (descriptions, lede, facts, tiers,
footer), `404.html` — and regenerating `sitemap.xml`.

**Applies to:** tool counts, subscriber/audience figures, revenue claims,
"X people used this", sponsorship reach.

*2026-09-02: @manager brought donate (483), sponsor (483), tool (500) and the
index custom-tool pitch (500) back to the real 562. `scripts/design-audit.js`
watches the hub claims; staff/scan.py watches cross-branch drift.*

---

## D-002 — Analytics is disclosed, never denied *(AMENDED by D-007)*

**Decided:** 2026-09-02 · **Owner:** @legal (proposal) · **Status:** binding as amended

The original intent stands and is kept: **no page may make a privacy claim
that is false where it stands.** GA (`G-G058FVW6Z2`) runs on key pages;
those pages must not say "no tracking", "no cookies", "100% private".

**Amended 2026-09-02 by owner ruling (D-007):** GA is *not* going sitewide.
It stays on the pages that carry it today; the false claims are replaced with
true ones instead. The @legal proposal's true-claims list survives:

> Claims that are true everywhere and may be used: **"no ads", "no accounts",
> "no sign-ups", "no paywalls", "runs in your browser", "your inputs never
> leave your device"** (tools are fragments with no network calls — this is
> enforced by card rules and `scripts/design-audit.js`).

---

## D-003 — Risk notices live in tables, never inside cards *(PROPOSAL — not yet implemented)*

**Proposed:** 2026-09-02 · **Owner:** @legal (on a stranded branch) · **Status:** proposal, scheduled in OPEN-3

Warnings for regulated areas (medical, finance, engineering, legal) would be
injected from `RISK_NOTICES` mapping tables in `index.html`/`tool.html`,
keyed by category/slug — never hand-written inside a card. Sound design;
the implementation lives on a stranded branch and must be rebuilt on main
before this becomes binding. See OPEN-3.

---

## D-004 — One help.html *(PROPOSAL — not yet implemented)*

**Proposed:** 2026-09-02 · **Owner:** @legal (on a stranded branch) · **Status:** proposal, scheduled in OPEN-2

Two branches independently created `help.html` on the same day. General rule
worth keeping regardless: **before creating any top-level page, run
`python3 staff/scan.py` and check nobody has taken the filename.** Cheap to
check, expensive to discover after both are written.

---

## D-005 — The branch map is generated, not written

**Decided:** 2026-09-02 · **Owner:** @manager (ratifying @seo design) · **Status:** binding, implemented

`staff/BRANCHES.md` is produced by `staff/scan.py` from real branch diffs and
is never hand-edited. Self-reported status decays; diffs don't. For *what
changed*, believe `BRANCHES.md`; for *why*, believe `BOARD.md`. Run
`python3 staff/scan.py --mine` before you push.

---

## D-006 — The AI Developer workflow is permanent

**Decided:** 2026-09-02 · **Owner:** owner ruling, relayed by @manager · **Status:** binding

On 2026-09-02 the owner confirmed the **AI Developer facility stays**:
`.github/workflows/ai-developer.yml` (Mon & Thu 06:00 UTC + manual dispatch)
with `scripts/ai-developer.js`, `scripts/ai-staff.json` and
`scripts/design-audit.js` (merged via PR #3). An earlier claim recorded on a
stranded branch that "the owner ordered it deleted" was **not** an owner
ruling. Deleting or disabling the facility is a never-do without a fresh,
explicit owner instruction.

**In practice:**
- Drafts land in gitignored `ai-developer/drafts/` and are **never
  auto-promoted** — a human promotes them per the instructions in each file.
- Without `AI_API_KEY` the facility runs audit + deterministic fixes only.
- Every run ends in `bash scripts/verify.sh`; failures are reported, not hidden.

---

## D-007 — Analytics stays where it is; claims are true everywhere

**Decided:** 2026-09-02 · **Owner:** owner ruling, relayed by @manager · **Status:** binding · **Amends D-002**

Google Analytics (`G-G058FVW6Z2`) remains **only on the pages that carry it
today** (index, the music cluster, both money pages, news — 14 pages at time
of ruling). It does **not** go sitewide; `tool.html`, `404.html`, the tool
cards and standalone experiments stay free of it. Any expansion or reduction
of the analytics footprint is an **owner decision**, not a staff decision.

False absolute claims ("100% Private", "no tracking", "no cookies", "no
analytics") are replaced by the true-claims list in D-002. Done sitewide on
2026-09-02 by @manager (index, tool, donate, sponsor, 404). Check any new
page against the list before shipping.

---

## D-008 — The catalogue on main is canonical; deletions need the owner

**Decided:** 2026-09-02 · **Owner:** owner ruling, relayed by @manager · **Status:** binding

The catalogue of record is **`main`'s 562 cards**. A stranded branch carrying
672 cards (≈110 additions, several deletions of live tools) is treated as a
quarry, not a substitute catalogue: @manager triages it, cherry-picks only
tools that pass the full quality bar (AGENTS.md §5), and **every deleted card
is restored**. General rule: **deleting or replacing an existing tool always
requires owner sign-off first** — no agent, including @manager, retires the
owner's product.

---

## D-009 — Cards must not silently send user input off-device

**Decided:** 2026-09-03 · **Owner:** @manager ruling (owner may overrule) · **Status:** binding

A card audit on 2026-09-03 found **~27 cards making network calls**, in three classes:

| Class | Definition | Examples | Rule |
|---|---|---|---|
| **A — input egress** | Anything the user types/encodes is sent to a third party | ~~wifi-qr-generator (fixed 2026-09-03: vendored generator)~~, ~~qrtool (fixed 2026-09-04: vendored generator, OPEN-1a closed)~~, languages (labelled) | **Labelled loudly in-card immediately; re-engineered to local processing at the next opportunity.** Until fixed, the card must carry a visible warning at the point of input. |
| **B — CDN code** | Loads libraries (chart.js, three.js) from CDNs | budget, evolution-walker | Documented exception; breaks offline purity but sends no user data. Replace with vendored code when touched for other reasons. |
| **C — live-data tools** | Fetching public data IS the tool's function | currency, plant-encyclopedia, premier-league, censorship-monitor, photo viewers, sl-events | Legitimate; the tool must fail gracefully offline and not claim to work offline. |

**New cards: zero network calls** (existing AGENTS.md law — now enforced by audit, not just convention).

**Claims rule (extends D-002):** a site-wide claim must be true for every tool, or scoped ("*your inputs never leave your device — except tools marked with a ⚠ warning*"). Site copy must not state absolutes that Class A/C tools break.

**Audit command** (run before any catalogue PR):
`grep -rlE "fetch\(|XMLHttpRequest|new Image|\.src *= *['\"\`]https?" cards/*.html`
then classify hits into A/B/C.

**Enforcement (2026-09-04):** the classification above is now executable —
`python3 scripts/check-egress.py` (wired into `scripts/verify.sh` step 7 and
CI) reads the same A/B/C table. A card that touches the network and is not
listed there **fails the build**, so egress can no longer be added quietly.
A Class A card with no visible in-card warning also fails.
