# Contributing

Read **[AGENTS.md](AGENTS.md)** — one page: the four commands, what never to
touch, and how to add a tool. **[CONSTRAINTS.md](CONSTRAINTS.md)** has the hard
lines and the traps that have already cost people time;
**[ARCHITECTURE.md](ARCHITECTURE.md)** explains how the site actually works.

The short version:

```bash
npm run build          # after a card change — regenerates everything derived
npm run verify         # 7 checks, ~3 s — after every edit
npm run verify:deep    # ~15 s — before you push (CI runs this on every push)
```

Never hand-edit a tool count or any generated file. Never delete a tool or a
page — that is the owner's call. Never mix the music pages with the tool
catalogue. Element IDs are shared across all 1265 cards, so prefix every one
with its slug. If you are unsure, ask the owner (`mrpr0phecy`) rather than
guessing.
