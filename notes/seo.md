# SEO and discovery notes

Reusable observations about crawlability, metadata, structured data, internal
links and search discovery. Nobody owns this collection; any contributor may
append evidence-based notes.

## Current baseline

- `scripts/scan-seo.py` scans top-level HTML metadata.
- `sitemap.xml` currently contains 684 entries.
- The catalogue fetches card fragments at runtime; `tool.html` supplies a
  standalone viewer, while cards themselves are not complete documents.
- Product A and Product B target different audiences and must remain separate.

## Field notes

### 2026-09-04 — Prioritise individual tool discovery

**Context:** The homepage has strong site-level metadata and catalogue search,
but individual tools are dynamically loaded fragments.

**Finding:** Stable, crawlable per-tool presentation is likely to be more
valuable than further homepage keyword expansion.

**Evidence:** `tool.html` already provides a reusable shell, and the catalogue
manifest contains titles, descriptions, categories and paths for every tool.

**Follow-up:** Test structured data, breadcrumbs and stable deep links on a
small set selected from Search Console evidence before scaling to all tools.

### 2026-09-04 — Scanner warnings include intentional low-priority pages

**Context:** Current SEO scans warn about missing social/canonical metadata on
`404.html`, `hokidea.html`, `indexbeta.html` and `token.html`.

**Finding:** A warning does not mean every experimental page deserves search
optimisation. First decide whether each page should remain publicly shipped.

**Evidence:** Those pages appear in the current scanner report, while cleanup
of experiments is an owner decision in `ROADMAP.md`.
