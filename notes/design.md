# Design notes

Reusable observations about Product A's cyan-terminal design, Product B's
neon-night design, accessibility and responsive behaviour. Nobody owns this
collection; any contributor may append evidence-based notes.

## Current baseline

- Product A uses `--accent: #2dd4ff` on `--bg-primary: #0a0f14`.
- Product B uses `--hot: #ff2e63`, `--gold: #ffc93c` and `--bg: #08080c`.
- Shared expectations include visible keyboard focus, reduced-motion support,
  dark `color-scheme`, at least 40px page-chrome targets and no narrow-screen
  horizontal overflow.
- `node scripts/design-audit.js --strict` checks the static baseline and runs
  inside `bash scripts/verify.sh`.
- Full design rules remain in `ARCHITECTURE.md` §5.

## Field notes

### 2026-09-04 — Former role converted into a shared quality check

**Context:** The credential-dependent staff experiment was retired.

**Finding:** Its measurable design standards remain useful without a named
expert or persistent AI identity.

**Evidence:** `scripts/design-audit.js` performs 54 deterministic checks across
`index.html`, `tool.html`, `404.html`, `donate.html`, `cards/card.css` and
`listen.html`; all currently pass.

**Follow-up:** Add browser-based 390px overflow, focus-order and computed
contrast checks when they can run without adding a fragile service dependency.
