# staff/ — internal coordination area

A place for the people and agents working on this repo to leave each other
notes that outlive a chat session. Chat is ephemeral; this is committed, so a
note written today is still here for whoever picks the repo up next week.

**The running discussion is in [`BOARD.md`](BOARD.md).** This file is only the
rules for using it.

Three other files sit alongside it:

| File | Written by | Contains |
|---|---|---|
| [`BOARD.md`](BOARD.md) | hand | The conversation: handover notes, decisions needed, disagreements. |
| [`BRANCHES.md`](BRANCHES.md) | `scan.py` | **Auto-generated.** What every parallel `arena/*` branch actually changed, which files are contested, and where published claims have drifted apart. Never hand-edit. |
| [`DECISIONS.md`](DECISIONS.md) | hand | Settled outcomes, kept out of the conversation log so they don't scroll away. Binding until the owner says otherwise. |
| [`scan.py`](scan.py) | — | Generates `BRANCHES.md`. Run `python3 staff/scan.py --mine` **before you touch a shared file** — it tells you whose work you are about to collide with. |

Self-reported status decays: a note saying "working on index.html" outlives
the work by weeks. `BRANCHES.md` reads the actual branch diffs instead, so the
two halves check each other. For *what changed*, believe `BRANCHES.md`; for
*why*, believe `BOARD.md`.

---

## ⚠️ This repo is public

`gh repo view mrpr0phecy/mrpr0phecy --json isPrivate` returns **`false`**.
Anything written here is committed to a public GitHub repository and is
readable by anyone on the internet, forever — including in history after you
delete it.

Never post:

- GitHub tokens, API keys, OAuth codes, or anything `scripts/verify.sh`
  section 6 would flag. **The repo is secret-scanned on every push.**
- Unpublished revenue, contracts, or negotiations beyond what the owner has
  already chosen to publish in [`INCOME.md`](../INCOME.md).
- Personal data, addresses, or anything about third parties.
- Credentials-adjacent detail: "the token is in `~/.github_token`" is fine,
  the token itself is not.

If something sensitive must be discussed, it goes to the owner directly, not
here.

---

## Who posts, and how to sign

**Staff are AI agents**, working in separate sessions, plus one human owner.
That is the whole reason this board exists: agent sessions do not persist, do
not share memory, and cannot talk to each other directly. This file is the only
channel between them.

Sign every entry with a **role handle**, not a session or model name:

| Handle | Role | Scope |
|---|---|---|
| `@mrpr0phecy` | Owner (human) | Final call on everything. Only one who can approve decisions. |
| `@systems` | Systems maintenance | Tooling, guardrails, docs, coherence, CI. |
| `@content` | Tool catalogue | Adding and fixing `cards/`, categories, card quality. |
| `@music` | MrProphecy product | `listen.html` and the music page cluster, YouTube data. |
| `@seo` | SEO and metadata | Sitemap, canonicals, OG tags, hreflang, structured data. |
| `@legal` | Legal and compliance | Published claims, privacy, licensing, tool-safety disclaimers, takedown. |
| `@finance` | Money tools and monetisation | Correctness of the finance calculators; `INCOME.md`, `FINANCE.md`, `sponsor.html`, `donate.html`. |

The role matters, not the individual. Two different sessions doing maintenance
work both sign `@systems` — the next reader needs to know *what kind of work*
produced a note, not which model happened to be running. Do not invent a new
handle per session, and do not sign with a model name.

If your task does not fit a row above, use the closest one and say so in the
entry. The owner adds new roles.

**Read the whole board before you post.** If another agent already answered the
question or already fixed the thing, say so and move on — duplicate work and
contradictory edits are the main risk of a multi-agent repo.

## What belongs here

- **Handover notes** — what was changed, what was verified, what is still open.
- **Decisions needed from the owner**, with the options and the trade-offs.
- **Corrections** — when a documented fact turns out to be wrong, say so here
  as well as fixing it, so the next reader knows the doc was unreliable.
- **Disagreements** — if you think another note is wrong, reply rather than
  silently overwriting.

## What does not belong here

- Anything that should be in [`ARCHITECTURE.md`](../ARCHITECTURE.md) instead.
  That file is the authoritative description of the system; this board is the
  conversation about it. If a discussion reaches a conclusion that changes how
  the repo works, **put the conclusion in ARCHITECTURE.md** and leave a pointer
  here.
- Code, diffs, or long output. Summarise and cite the commit instead.
- Task lists that a GitHub issue would serve better.

## Entry format

Newest entry **at the top**, immediately under the `<!-- NEW ENTRIES BELOW -->`
marker in `BOARD.md`, so readers see current state first and appending never
requires renumbering:

```markdown
## 2026-09-02 18:06 UTC — @systems — Subject in a few words

Two or three short paragraphs. What changed, what was verified (name the
command and its result), what is still open.

- Bullet anything that needs an owner decision, prefixed **DECISION:**.
```

Keep entries short. One screen is the target. If it runs longer, the detail
belongs in ARCHITECTURE.md.

## Before you post

1. `python3 staff/scan.py --mine` — are you about to overwrite another
   agent's work? Six branches are editing `index.html` right now.
2. `bash scripts/verify.sh` — a red board entry about a broken repo is noise;
   fix or describe the breakage deliberately.
3. Commit message: one line, imperative, per AGENTS.md §5.
4. Never `git push --force`, and never rewrite history on `main` — the notes
   here are only useful if they survive.
