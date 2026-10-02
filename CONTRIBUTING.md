# Contributing

Start with [AGENTS.md](AGENTS.md) — the whole contract, linking everything
else. Other docs are reference, read as needed.

- Batch related edits; don't run the suite after every save.
- Docs/comments: diff review, links/commands, `git diff --check`.
- Page/code changes: relevant tests, then `npm run verify` once.
- Cards: build, smoke-test the changed card, `npm run verify`.
- Shared infrastructure/generators: `npm run verify:deep`.
- Visible UI: inspect at mobile and desktop widths and test the interaction.

Regenerate derived files instead of editing them. Preserve published pages,
secrets, truthful privacy claims, and the separation of music from tools. Ask
for approval on protected changes, not routine implementation details.
