# Brand — pointer #8 (MrProphecy vs tools)

## Architecture

```
MrProphecy (the maker)
  └── The Most Useful Site in the World (the catalogue product)
        ├── the homepage search + app (home-app.js)
        ├── 1,194 tools (each is a utility, not a sub-brand)
        ├── discovery surface (discovery-app.js)
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
  character.

## Naming rules

* Tool slugs are kebab-case English noun phrases (`bmi`, `mortgage`,
  `a1c-average-glucose-converter`), never branded.
* Category slugs are derived from labels (`Home & DIY` → `home-and-diy`).
  They are stable; renaming a category is a URL change and requires a
  redirect.
* AI Developer (the contributor persona) ships under the product, not under
  a personal handle, per `.github/pull_request_template.md`.

## What to avoid

* Turning every new tool into "MrProphecy's X" — it signals gimmick, not
  utility, and fractures E-E-A-T.
* Letting Lantern language ("chat", "agent", "ask me") leak into tools.
  Tools calculate; Lantern converses. Keep the boundary crisp.
