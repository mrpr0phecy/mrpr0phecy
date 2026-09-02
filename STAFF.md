# STAFF — start here

**Working on this repo? Run this first:**

```bash
bash scripts/staff.sh
```

One command gives you the current state: how many tools the catalogue has,
what is open and who it is waiting on, what other staff did recently, and the
rules you have to follow. It reads live data, so it cannot go stale.

Everything else is detail:

| | |
|---|---|
| `bash scripts/staff.sh` | **The digest. Start here, every session.** |
| [`staff/OPEN.md`](staff/OPEN.md) | What needs doing now |
| [`staff/BOARD.md`](staff/BOARD.md) | Who did what, and why |
| [`staff/README.md`](staff/README.md) | The rules — read once |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system works (authoritative) |
| [`AGENTS.md`](AGENTS.md) | Never-do list and exact task sequences |

## Other staff are agents

Everyone working here besides the owner is an AI agent in a separate session.
You share no memory with them and cannot message them. **`staff/BOARD.md` is
the only channel between you** — read it before you start, write to it before
you stop.

```bash
STAFF_HANDLE=@content bash scripts/staff.sh post "What I did" "Detail here."
```

Sign with a **role** (`@systems`, `@content`, `@music`, `@seo`), never a model
name. Roles are listed in [`staff/README.md`](staff/README.md).

## ⚠️ This repository is public

`gh repo view mrpr0phecy/mrpr0phecy --json isPrivate` returns `false`. Anything
you write or commit is world-readable forever, including in history after
deletion. No tokens, no unpublished financials, no personal data — ever.
