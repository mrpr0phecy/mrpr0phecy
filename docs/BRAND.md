# Brand — MrProphecy vs the tools

## Architecture

```
MrProphecy (the maker)
  └── The Most Useful Site in the World (the catalogue product)
        ├── homepage chrome (home-core.js) and 1,395 tools (utilities, not sub-brands)
        ├── the list layer: explore.js / explore.css / toolbox.js
        └── Lantern (a separate browser AI; not a tool)
```

- **MrProphecy** is the maker/voice: playful, British-inflected, a little
  theatrical. It owns the story, the illustration and the arcade
  (`MrProphecy Arcade`), and appears in the footer and on `about.html` — not on
  every tool.
- **The Most Useful Site in the World** is the product promise: useful first,
  delightful second. The name is literal; use it in titles, `og:site_name` and
  manifests.
- **Tools** are utilities with plain-language names ("BMI Calculator", never
  "MrProphecy Body Lab"), and their copy is concise and adult — no character
  narration inside a calculator.
- **Lantern** is deliberately separate (`ai.html`), not "one more tool".
  Cross-link with one small "Try Lantern →" — never a modal or a takeover.

## Where each voice appears

| Surface | Voice | Example |
|---|---|---|
| `index.html` hero/search | product + light maker charm | "1,395 tools that actually run." |
| Tool fragment (`cards/*.html`) | utility | labels, placeholders, results — no lore |
| Deep page (`tools/*.html`) | utility + one-line provenance | "WHO BMI · Last reviewed 2026-09-19" + disclaimer |
| `tools-index.html`, `categories/*.html` | product | directory copy, no character |
| `about.html`, `ai.html` | maker | the only place MrProphecy speaks first-person |
| Social/press | product, quoted by maker | "MrProphecy, maker of The Most Useful Site…" |

## Visual rules

- The arcade gets the most character, YMYL categories the least: **no
  MrProphecy mascot inside Health & Fitness or Finance & Money** deep pages — it
  undermines YMYL trust (`docs/TRUST.md`).
- **One brand in every header.** Secondary topbars, category pages and
  `tool.html` carry `logo-mark.svg` beside the name — never the 🛠️ emoji, which
  is a tool icon. Generators own it for generated pages
  (`build-tool-pages.py`, `build-category-pages.js`, `build-embed-landing.py`);
  `tools.html` and `sitemap.html` keep their existing topbar, so edit those
  directly.
- **The mark is the finder** — the search console's two corner brackets holding
  a white four-point star on a dark tile, drawn out of the page's own instrument
  chrome. One geometry in `brand/mark.py` renders into the favicons, PWA/Apple
  icons, two one-colour reductions, two lockups, the social card and `logo.png`
  (`brand/gen_assets.py`; `brand/README.md`; printable spec `brand/spec.html`).
  Never hand-edit a shipped logo file.
- **Two accent jobs, never one.** The *house accent* (`#e8a33d` amber,
  `HOUSE_ACCENT`/`HOUSE_ON_LIGHT` in `brand/mark.py`) is for external surfaces
  only — lockups, OG cards, press kit. The page accent stays the visitor's
  picker (default cyan) and the mark keeps the console's cyan. Ratios and rules:
  `DESIGN.md` §3.
- **The ornament is a system.** The 29 category tiles keep one emoji in a ridged
  chip (wayfinding); section headings use a mono kicker (`01 / FEATURED`) rather
  than an emoji beside a flat heading. Controls and content rows keep theirs.

## Naming rules

- Tool slugs are kebab-case English noun phrases (`bmi`, `mortgage`,
  `a1c-average-glucose-converter`), never branded.
- Category slugs derive from labels (`Home & DIY` → `home-and-diy`) and are
  stable — renaming one is a URL change and needs a redirect.
- Agent-contributed work ships under the product, not a personal handle.

## What to avoid

- "MrProphecy's X" for every new tool — it signals gimmick and fractures
  E-E-A-T.
- Letting Lantern language ("chat", "agent", "ask me") leak into tools. Tools
  calculate; Lantern converses.
