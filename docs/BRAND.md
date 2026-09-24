# Brand — pointer #8 (MrProphecy vs tools)

## Architecture

```
MrProphecy (the maker)
  └── The Most Useful Site in the World (the catalogue product)
        ├── the homepage chrome (home-core.js)
        ├── 1,279 tools (each is a utility, not a sub-brand)
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
| `index.html` hero/search | Product + light maker charm | "1,279 tools that actually run." |
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
  in `brand/mark.py`, six raster files (`favicon.svg`, `favicon.ico`,
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png`), two one-colour reductions and two lockups, plus the
  social card and the hero's `logo-mark.svg`, all written together by
  `python3 brand/gen_assets.py`. `brand/README.md` is the whole story and
  `brand/spec.html` is the printable spec sheet.
* The mark is an **aperture** — an ink disc at the optical centre of the tile,
  a white four-point spark inside it, and an ink needle to the bottom-right.
  The needle is search, the spark is the answer, the disc is the aperture it
  arrives through. The glyph is ink on the site's own accent gradient
  (`#6ff0ff -> #2dd4ff -> #2f6bff`), never white on it: white over the
  gradient's lightest stop is 1.3:1 and disappears in a 16 px tab, ink over the
  same stop is 14.2:1. Redrawn 2026-09-24; the reasoning and the evidence are in
  `brand/README.md`.
* **The ornament is a system.** For the 28 category tiles it is still one emoji
  inside the same rounded chip, because 29 choices need wayfinding. The section
  headings dropped theirs on 2026-09-24 for a mono kicker (`01 / FEATURED`) —
  an emoji beside a flat heading is what makes a page look assembled rather than
  designed. Controls and content rows keep theirs: those are not headings.

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
