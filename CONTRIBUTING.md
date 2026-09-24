# Contributing

Read **[AGENTS.md](AGENTS.md)** — one page: the commands, the hard lines, and
how to add a tool or write a card. **[CONSTRAINTS.md](CONSTRAINTS.md)** has the
reasons behind the rules and the card traps with code;
**[ARCHITECTURE.md](ARCHITECTURE.md)** explains how the site actually works.

The short version:

```bash
npm run build          # after a card change — regenerates everything derived
npm run verify         # the gate — after every edit
npm run verify:deep    # before you push (CI runs this on every push)
```

Never hand-edit a tool count or any generated file. Never delete a tool or a
page — that is the owner's call. Never mix the music pages with the tool
catalogue. Element IDs are shared across all 1298 cards, so prefix every one
with its slug. If you are unsure, ask the owner (`mrpr0phecy`) rather than
guessing.
