# Trust — pointers #5 + #6 (YMYL, site-level signals)

Pointer #5 is YMYL. About 119 of 1303 tools touch money or the body. If those
pages feel like a bash-mash of thin fragments with no accountable author,
Google's quality raters (and users) are right to distrust the whole site.
This doc is the checklist we hold every deep page and every card to.

## The bar for a deep page (`tools/<slug>.html`)

A `tools/<slug>.html` deep page is where the 300+ honest words live — not
the homepage fragment. Our six pages (mortgage, bmi, compoundinterest, loan,
bmr, percentages) follow this template; clone it when you add the next one
via `scripts/tool-pages.json` → `python3 scripts/build-tool-pages.py`:

1. **Who is behind this** — About / Mission link, same footer everywhere.
2. **Methodology & sources** — named formula or standard (WHO, Mifflin-St
   Jeor, Bank of England) + primary sources with hrefs. Not "according to
   experts".
3. **Worked example** — one concrete calculation a reader can verify by hand.
4. **Edge cases & limits** — where the tool misleads (BMI underestimates
   athletes, mortgage payments ignore fees, etc.).
5. **Disclaimer** — one honest line: "Informational, not medical/financial
   advice. If a decision matters, talk to a qualified professional." Must
   appear above the fold or immediately under the tool chrome.
6. **Last reviewed date** — `Last reviewed: 2026-09-19` (updated when the
   page's prose changes; fragment cache busting is separate).

Stock YMYL disclaimer block (paste into a `tools/*.html` body slot):

```html
<p class="ymyl-disclaimer" role="note">
  <strong>Note:</strong> This tool is for information only — not medical,
  financial, or legal advice. If a decision matters, get qualified advice.
  Methodology: <a href="https://www.who.int/...">WHO BMI</a> · Last reviewed:
  2026-09-19.
</p>
```

## Site-level trust signals (pointer #6)

These are not per-page wordcount: they tell Google "someone accountable runs
this catalogue".

* **About / Mission** — `about.html` states who runs the site, why it exists,
  that tools run client-side with no data collection, and how to report an
  error. No AI-generated vanity bio.
* **Contact** — `contact.html` is a plain mailto + response promise. No form
  that pretends to save.
* **Privacy** — `privacy.html` confirms: no cookies beyond the capped
  `__mp_*` localStorage buffers (§ INSTRUMENTATION), no third-party trackers
  by default, GA is the only script when present and is optional.
* **Terms** — `terms.html` states as-is, no warranty, user assumes risk.
* **People** — every YMYL deep page links to the same About; we do not
  invent per-tool author personas. If we add real reviewed-by bylines later,
  each must be a verifiable human.
* **Freshness** — homepage and tools pages carry `<meta name="last-reviewed"
  content="2026-09-19">`; updated on content edits. Build stamp `APP_VERSION`
  in `home-core.js` (and the `?v=` on every asset it loads) is deploy metadata,
  not content freshness.

## What to do next (pointer #1 → #5 loop)

1. `python3 scripts/check-thin-content.py` — the `YMYL without E-E-A-T signal`
   list (71 of 119 today) is the deep-page backlog. Prioritise by
   `zero_top_20` demand (see INSTRUMENTATION.md), not alphabetically.
2. For each candidate, add an entry to `scripts/tool-pages.json` and run
   `python3 scripts/build-tool-pages.py` — do not hand-edit `tools/*.html`.
3. Add the per-tool machine spec automatically via `node
   scripts/build-tool-specs.js` — the spec's `sources` and `formula` fields
   are cross-checked with the deep page's methodology.

## What we do not do

* Auto-expand short fragments into 500-word SEO filler by LLM. The short
  cards stay short; depth goes only to the deep pages where we can vouch for
  the prose.
* Fake citations. A tool that has no single formula is labelled
  `Interactive — open the URL …` in its machine spec.
* Delete thin tools to "improve average wordcount". CONSTRAINTS.md forbids
  URL deletion without owner sign-off; thin cards are not harmful, they are
  just not deep.
