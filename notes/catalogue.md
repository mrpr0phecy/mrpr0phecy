# Catalogue notes

Reusable observations about cards, catalogue generation, safety, calculations
and tool quality. Nobody owns this collection; any contributor may append
evidence-based notes.

## Current baseline

- `cards/cards.json` indexes 654 card fragments in 26 categories.
- Cards share one DOM in the catalogue, so IDs must be globally unique and
  scripts must be wrapped in IIFEs.
- Cards are offline-first and must not silently send entered values elsewhere.
- `python3 scripts/check-cards.py` checks catalogue coherence.
- `node generate-cards-json.js` rebuilds metadata but category assignment still
  depends on hardcoded filename lists; read `ARCHITECTURE.md` §3 before using it.

## Field notes

### 2026-09-04 — Existing quality is more valuable than raw catalogue growth

**Context:** The catalogue has grown to 654 tools.

**Finding:** The next useful phase is measuring and improving proven tools,
not generating batches solely to increase the count.

**Evidence:** The catalogue is already broad, while per-tool discovery,
regression tests and standalone crawlability remain roadmap items.

**Follow-up:** Use Search Console and privacy-conscious tool-open events to
choose the first 10–25 tools for deeper testing and landing-page improvements.

### 2026-09-04 — Network behaviour needs a stronger automated boundary

**Context:** Earlier review found QR and translation tools capable of sending
entered data to third parties; the Wi-Fi QR tool was converted to a vendored
local implementation.

**Finding:** “Runs in your browser” is not enough to guarantee private local
processing when a card can call an external endpoint.

**Evidence:** `ROADMAP.md` retains local-only QR work and a network-egress audit
as immediate safety tasks.

**Follow-up:** Extend verification to classify external resources separately
from calls that transmit user-controlled input.
