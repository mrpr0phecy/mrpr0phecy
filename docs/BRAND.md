# Brand — pointer #8 (MrProphecy vs tools)

## Architecture

```
MrProphecy (the maker)
  └── The Most Useful Site in the World (the catalogue product)
        ├── the homepage chrome (home-core.js)
        ├── 1,309 tools (each is a utility, not a sub-brand)
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
| `index.html` hero/search | Product + light maker charm | "1,309 tools that actually run." |
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
  in `brand/mark.py`, rendered into the favicons, the PWA and Apple icons, two
  one-colour reductions, two lockups, the social card and `logo.png` by
  `brand/gen_assets.py`. `brand/README.md` is the whole story and
  `brand/spec.html` is the printable spec sheet.
* The mark is **the finder**: the search console's two corner brackets
  (top-left, bottom-right) holding a white four-point star on a dark tile. It
  is drawn out of the page's own instrument chrome, so the logo and the site
  are one design — the glossy cyan-to-blue "aperture" it replaced on
  2026-09-24 was the one bright, rounded object on a flat, dark page.
* **One brand in every header.** Secondary pages' topbars, the category pages
  and `tool.html` carry `logo-mark.svg` beside the name — never the 🛠️ emoji,
  which is a tool icon, not a logo. The generators own it for generated pages
  (`scripts/build-tool-pages.py`, `build-category-pages.js`,
  `build-embed-landing.py`); `tools.html` and `sitemap.html` keep the topbar
  they already have, so edit those files directly.
* **Two accent jobs, never one.** The *house accent* (`#e8a33d`, amber —
  `brand/mark.py`: `HOUSE_ACCENT` / `HOUSE_ON_LIGHT`) is the brand colour for
  external surfaces only: the lockups, the Open Graph cards, the press kit.
  The *page accent* stays the visitor's picker (default cyan); nothing in the
  interface follows the house colour, and the mark keeps the console's cyan.
  Ratios and the rules live in `DESIGN.md` §3 and `brand/spec.html`.
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
