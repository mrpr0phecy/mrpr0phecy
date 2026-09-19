# Differentiation — pointer #2

## The honest position

There are ~10,000 mortgage calculators. There is one site that puts
"calculate mortgage overpayment" next to "generate a 3D spirograph nebula"
and "check your Yahtzee scorecard" and lets you actually run the tool
without signing up. The catalogue — not any single tool — is the product.

Most single-tool sites win on depth; we win on breadth × composability ×
privacy. We do not try to out-rank bankrate.com on "mortgage calculator"
with a thinner version of their page. We do capture queries bankrate will
never compete for: the long tail that discovers the site by accident and
stays because something surprising was one tap away.

## What we do that single-tool sites don't

* **Routing, not just tools.** Search handles misspellings and synonyms;
  categories surface "you might also need…" chains. Popular chips +
  `?q=` sharing mean a tool is a permalink you can send someone.
* **Every tool embeds.** `tool.html?card=<slug>&embed=1` is an iframe you can
  drop into a blog, a classroom page, or another product. Single-tool sites
  never offer this because their tool *is* their page.
* **Machine-readable catalogue from day one.** `api/tools.json` +
  `api/tools/<slug>.json` (pointer #4) and `.well-known/mcp.json` let
  ChatGPT/Claude/Perplexity treat 1194 tools as callable knowledge. A thin
  fragment plus a deep page (pointer #1) plus a machine spec (pointer #4) is
  a reproducible pattern a single-tool site cannot replicate at scale.
* **Client-side by default.** Nothing leaves the browser. No keys, no rate
  limits, no "sign in to calculate". That is a trust and latency advantage
  even when a single-tool site has prettier prose.

## How a new tool should be proposed

1. **It is not a clone.** Search `cards/cards.json` and `api/tools.json`
   first. If the capability exists, propose a *variant* or an *improvement
   to the deep page* — not a duplicate slug.
2. **It justifies its place in the graph.** Which two categories does it
   bridge? e.g. "commute-cost calculator" bridges Finance & Money ×
   Productivity & Lifestyle. A tool that just "is another converter"
   probably belongs as a mode of an existing page.
3. **It has a non-obvious input or output.** A currency converter with
   live rates is not differentiated; a converter that also shows "what that
   buys you in each country" is.
4. **It carries real provenance.** YMYL tools must meet `docs/TRUST.md`.
   Non-YMYL ones still need a single primary source where a source exists.

## What we say on a page

* Homepage hero: "1,194 tools that actually run — calculators, converters,
  generators and simulators. Private, free, no sign-up. Find the one you
  didn't know you needed."
* Per-deep-page lede: one sentence of what it does, one sentence of whom it
  is for, one sentence of what it is not. All three are honest.

## What we don't claim

* "The best BMI calculator." It is a correct, private, fast one. The best
  is your doctor.
* "AI-powered." Tools are deterministic. Lantern (a separate product under
  `/ai.html`) is where the AI lives; the catalogue does not pretend to be
  intelligent.
