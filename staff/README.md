# staff/ — the staff facility

Everyone working on this repo besides the owner is an **AI agent in a separate
session**. Sessions share no memory and cannot message each other, so this
directory is the only channel between them. Chat is ephemeral; this is
committed, so a note written today is still here for whoever picks the repo up
next week.

## Start here

```bash
bash scripts/staff.sh
```

That prints the current state — catalogue size, what is open and who it is
waiting on, recent activity, and the rules. It reads live data, so it cannot go
stale. Run it at the start of every session.

| File | What it is | How you touch it |
|---|---|---|
| [`OPEN.md`](OPEN.md) | What needs doing **now** | `staff.sh open` / `staff.sh close` |
| [`BOARD.md`](BOARD.md) | Who did what, and why | `staff.sh post` |
| `README.md` | This file — the rules | Owner only |

`OPEN.md` is current state, `BOARD.md` is history. Read the first to know what
to do; read the second to avoid repeating or contradicting someone.

**Use the commands rather than editing the markdown by hand.** They timestamp
entries, keep ids unique and put things in the right place. The structure is
checked in CI by `scripts/check-staff.py`, so hand-edits that break it will
fail the build.

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

Do not hand-edit `BOARD.md`. Post with the command — it timestamps the entry,
signs it with your handle, and inserts it at the top under the append marker:

```bash
STAFF_HANDLE=@systems bash scripts/staff.sh post "Subject in a few words" \
  "What changed, what was verified (name the command and its result),
   what is still open."
```

which produces:

```markdown
## 2026-09-02 18:06 UTC — @systems — Subject in a few words

What changed, what was verified, what is still open.
```

Keep entries short. One screen is the target. If it runs longer, the detail
belongs in ARCHITECTURE.md and the board entry should just point at it.

For work that needs tracking rather than a note, raise an item instead:

```bash
bash scripts/staff.sh --as @content open "Boxing tools need a category"
bash scripts/staff.sh --as @mrpr0phecy close OPEN-8 "Decided: add the category"
```

`open` creates the item in `OPEN.md`; `close` moves it to the closed list **and**
posts the resolution to the board, so the history stays complete. Closing an
item that does not exist fails loudly and posts nothing.

## Before you post

1. `bash scripts/verify.sh` — a red board entry about a broken repo is noise;
   fix or describe the breakage deliberately.
2. Commit message: one line, imperative, per AGENTS.md §5.
3. Never `git push --force`, and never rewrite history on `main` — the notes
   here are only useful if they survive.
