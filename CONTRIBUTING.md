# Contributing

Start with [AGENTS.md](AGENTS.md): the quick workflow, essential protections,
and task-specific validation. Read other references only as needed.

- Batch related edits; don't run the full suite after every save.
- Docs/comments: review the diff, links and commands; run `git diff --check`.
- Page/code changes: relevant tests and `npm run verify` after the batch.
- Cards: build, smoke-test the changed card, and run `npm run verify`.
- Shared infrastructure/generators: `npm run verify:deep`; CI also runs it on
  pull requests and pushes to `main`.
- Visible UI: inspect at mobile and desktop widths and test the interaction.

Regenerate derived files instead of editing them. Preserve published pages,
secrets, truthful privacy claims, and the separation of music from tools.
Ask for approval for protected changes, not routine implementation details.
See AGENTS.md §1 for the full validation table and §3 for protections.
