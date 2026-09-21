# Brand — pointer #8 (MrProphecy vs tools)

## Architecture

```
MrProphecy (the maker)
  └── The Most Useful Site in the World (the catalogue product)
        ├── the homepage chrome (home-core.js)
        ├── 1,205 tools (each is a utility, not a sub-brand)
        ├── the list layer: explore.js / explore.css / toolbox.js
        └── Lantern (a separate browser AI; not a tool)
```

* **MrProphecy** is the maker/voice: playful, British-inflected, a little
  theatrical. It owns the story ("Why does this catalogue exist?"), the
  illustration, and the arcade (`MrProphecy Arcade`). It appears in the
  footer and on `about.html`, not on every tool.
* **The Most Useful Site in the World** is the product promise: useful first,
  delightful second. Its name is literal, not mystical. Use it in titles,
  `og:site_name`, and manifests.
* **Tools** are utilities with plain-language names ("BMI Calculator", not
  "MrProphecy Body Lab"). Tool copy is helpful, concise, and adult. No
  character narration inside a calculator.
* **Lantern** is deliberately separate (`/ai.html`). It is not "tool #1195".
  Cross-links are one small "Try Lantern →" — never a modal, never a
  takeover.

## Where each voice appears

| Surface | Voice | Example |
|---|---|---|
| `index.html` hero/search | Product + light maker charm | "1,194 tools that actually run." |
| Tool card fragment (`cards/*.html`) | Utility | Labels, placeholders, results. No lore. |
| Deep page (`tools/*.html`) | Utility + one-line provenance | "WHO BMI · Last reviewed 2026-09-19" + disclaimer |
| `tools-index.html` / `categories/*.html` | Product | Directory copy, no character |
| `about.html`, `ai.html` | Maker | This is where MrProphecy speaks in first person |
| Social/press | Product, quoted by maker | "MrProphecy, maker of The Most Useful Site…" |

## Visual rules

* Category icons are emoji-scale; the arcade gets the most character, YMYL
  categories the least.
* No MrProphecy mascot inside Health & Fitness or Finance & Money deep
  pages — it undermines YMYL trust (see TRUST.md).
* The favicon and `apple-touch-icon` belong to the product, not the
  character — and they are the same drawing as the hero's mark: one geometry
  in `brand/mark.py`, six files (`favicon.svg`, `favicon.ico`, `icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) plus the
  social card and the hero's `logo-mark.svg`, all written together by
  `python3 brand/gen_assets.py`. `brand/README.md` is the whole story.
* The mark is a magnifier whose lens holds a four-point spark: search is what
  the product does, the spark is the answer it gives you. The tile is the
  site's own accent gradient (`#2dd4ff` -> `#2f6bff`), so a page cannot drift
  from its icon.
* One emoji per heading, one per category tile, each inside the same rounded
  chip — the ornament is a system, not decoration.

## Naming rules

* Tool slugs are kebab-case English noun phrases (`bmi`, `mortgage`,
  `a1c-average-glucose-converter`), never branded.
* Category slugs are derived from labels (`Home & DIY` → `home-and-diy`).
  They are stable; renaming a category is a URL change and requires a
  redirect.
* Agent-contributed work ships under the product, not under a personal
  handle.

## What to avoid

* Turning every new tool into "MrProphecy's X" — it signals gimmick, not
  utility, and fractures E-E-A-T.
* Letting Lantern language ("chat", "agent", "ask me") leak into tools.
  Tools calculate; Lantern converses. Keep the boundary crisp.
