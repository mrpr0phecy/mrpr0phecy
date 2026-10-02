# DESIGN.md — the visual system of the tools site

This file owns colour, type, iconography, layout and the rules that keep the two
products on this domain looking like two different studios. `docs/BRAND.md`
owns naming and voice; `brand/README.md` owns the mark. It is a working brief,
not a spec: the gates (`verify.sh`, `brand/check-mark.py`,
`check-critical-css.py`) are the enforcement.

Ratios below were measured with the same WCAG 2.x formula the site's own
Contrast Checker uses (`cards/color-contrast-checker.html`,
`brand/mark.py: contrast()`).

## 1. What this document is for

One person maintains 1,312 tools, 29 category pages, a music product, a
standalone AI and every generated surface between. Design drift at that scale
is a maintenance cost, not a matter of taste: this file lets a new tool,
contributor or agent see the visual rules in one place, records the brand
decisions before they get "improved" away, and makes the product split
enforceable.

## 2. Two visual systems, one repo

| | The Most Useful Site (A) | MrProphecy / Oracle (B) |
|---|---|---|
| Entry | `index.html`, `tool.html`, `tools/*.html` | `listen.html`, `music.html`, `radio.html`, `sync.html` |
| Register | precision instrument: hairlines, mono readouts, density | artist project: moodier, glyph-like, expressive |
| Palette | near-black `#0a0f14` / off-white `#f8fafc`, cyan UI accent, amber house accent | its own palette; **never** reuse A's accent, grid or icons |
| Icons | line-icon set, one stroke weight, `currentColor` | its own marks; emoji seasoning allowed |

The visual break *is* the feature — crossing from catalogue to music should feel
like leaving the tool catalogue. No shared tokens, no shared icon set, no
"unification" without the owner (the same rule that keeps Lantern,
MostUsefulMaps and SupaViewer out of the tools brand).

## 3. Colour

### 3.1 The two accent jobs

| Role | Value | Where |
|---|---|---|
| **UI accent** (visitor's) | default `#2dd4ff` cyan; six offered, choice in `localStorage` | everything *in* the interface: washes, hover, focus rings, the mark's brackets |
| **House accent** (brand's) | `#e8a33d` amber on dark; `#7a500e` for accent words on light | external surfaces only: `logo-lockup-*.svg`, `og-brand.png`/`og-tools.png`, `logo.png` |

The house accent defines the product externally (the logo a journalist grabs,
the social card, the press kit). **The page itself is never in the house
colour** — every visitor sees their own accent, and the mark's cyan brackets
stay drawn out of the console they came from.

Amber was chosen because blue/purple is every calculator and fintech
competitor's default and blending in works against the positioning; amber/ochre
reads as instrument panel and sits far from every picker accent except the warm
family, where it is still distinguishable at a glance.

### 3.2 Measured contrast

| Pair | Ratio | Requirement |
|---|---|---|
| `#e8a33d` on `#0a0f14` (page) | **8.92:1** | fill 3:1 — passes |
| `#e8a33d` on `#17232e` (worst-case tile top) | **7.40:1** | fill 3:1 — passes |
| `#e8a33d` on white | 2.16:1 | **never as text** |
| `#7a500e` on `#f8fafc` / on white | **6.73:1** / **7.04:1** | text 4.5:1 AA — passes |
| reference: `#2dd4ff` on `#0a0f14` | 10.97:1 | the UI accent |
| reference: `#0a7ea4` on white | 4.63:1 | the on-light cyan rule |

`brand/gen_assets.py` refuses to run if `HOUSE_ON_LIGHT` drops below 4.5:1 on
white or `HOUSE_ACCENT` below 3:1 on the page, and `brand/check-mark.py`
re-checks both in the gate.

### 3.3 Tokens

`home.css :root` is the app's token sheet. Names map to the brief's roles as
follows (renaming the existing ones would churn every rule for no behaviour
change, so the mapping is documented instead):

| Brief | Repo token | Note |
|---|---|---|
| `--bg` / `--bg-dark` | `--bg-primary` / `--surface` (`light-dark(#f8fafc,#0a0f14)`) | unchanged |
| `--fg` / `--fg-dark` | `--text` / `--surface-2` family | unchanged |
| `--accent-user` | `--accent` (+ `--accent-hue`) | the picker; unchanged |
| `--accent-house` | `HOUSE_ACCENT` / `HOUSE_ON_LIGHT` in `brand/mark.py` | external brand only — not a page token, on purpose |
| `--grid-line` / `--rule` | planned (§6) | schematic texture |
| `--font-display` | planned (§4) | the variable display font, when it lands |
| `--font-body` | `--font-sans` (Inter) | unchanged |

**Rule:** a colour change in `home.css` is a *page* change (version pins move,
`check-critical-css.py` watches it); a colour change in `brand/mark.py` is a
*brand* change (regenerate, `check-mark.py` watches it). Never copy a brand
colour into page CSS or a page colour into the brand files.

## 4. Typography

- **Body and tool UI: Inter** — the subsetted `fonts/inter-latin.woff2`
  (+ latin-ext). Fast, boring, legible, which is the point at this scale. Tool
  inputs, results, table data, category bodies and deep `tools/*.html` pages
  stay on it.
- **Instrument voice: `--font-mono`** (system stack, no download) for labels,
  counts, key hints and readouts — the mono-kicker language of the section
  headings. Sentences stay in Inter.
- **Display type — reserved slot.** A bespoke variable font is in progress
  outside this repo. When deployable: (1) it lands on the wordmark, category
  headers and hero type only (`--font-display`), never body copy or dense UI;
  (2) subsetted to the characters actually used, `font-display: swap`, byte
  cost checked against the first-paint budget in `check-critical-css.py`;
  (3) it expands one surface at a time with a verify pass, not as a big bang;
  (4) the more experimental cuts belong to the MrProphecy side. Until then the
  slot is empty and these are the rules for what it may touch.

## 5. Iconography

**Category-level wayfinding is a custom line-icon set, not emoji** — emoji
render differently per platform and read "hackathon MVP" next to a suite that
checks statutory maths. One inline-SVG sprite referenced by `<use>`, so the cost
across every page is one small file loaded once:

- **File:** `assets/icons/categories.svg` — 29 symbols, one per category.
- **Grid:** 24×24, live area 3–21, **one stroke weight (1.5)**, round caps and
  joins, `currentColor`, no fills except named dots. No second weight, ever.
- **Ids:** `icon-<category-slug>` — the slugs `scripts/build-tools-index.js`
  owns, so a new category's id is derivable and `iconId` in `tools-index.json`
  follows.
- **Surfaces:** the home page's 29 tiles (`build-home-prerender.py`), every
  category page's badge/h1/pills (`build-category-pages.js`), the directory's
  category strip (`generate-ai-index.js`). A new category-level surface renders
  the sprite reference, never an emoji.
- **Emoji may stay** in machine-readable surfaces (`llms.txt`, `llms-full.txt`,
  JSON feeds) and *tool titles* — seasoning, not navigation. Never as a category
  marker or in a header.
- **Adding one:** add the `<symbol>` (24-grid, 1.5 stroke, `currentColor`),
  register the category with the others, `npm run build`. The id is the only
  thing that has to match. **Do not reuse the set on the MrProphecy side** (§2).

## 6. Layout and texture

Direction: **drafting table, not soft SaaS** — thin structural rules, a faint
grid, index-card labels, dense scannable cards. Most of that already exists
(hairlines, mono kickers, corner brackets); changes stay at CSS level:

- **Category tiles:** chip + icon + mono count; the icon answers the tile's
  hover (accent) rather than being a fixed-colour emoji.
- **Grid texture (planned):** a faint `--grid-line` over the ambient washes and
  a slightly higher-contrast `--rule` for dividers — one background layer, check
  the gzip budget in `check-critical-css.py`, and look at 360 px first (texture
  that arrives before the content is too strong).
- **Tool cards/rows:** name, category, one-line description. Resist
  illustrated marketing cards — density is the brand, and the row component is
  shared by home, category and directory pages (`explore.js`), so changes
  compound.
- **Deep tool pages** (`tools/*.html`) keep their own generator CSS
  (`build-tool-pages.py`) — when a token changes, that CSS string is a second
  home that has to move with it.

## 7. Voice and microcopy

The existing register — dry, precise, quietly confident, upfront about
trade-offs — is doing brand work. New UI copy (empty states, errors, tooltips,
support/donate/sponsor panels) matches it. **Restyle the container, keep the
words**; do not drift to generic friendly-SaaS copy. Per-surface voice table:
`docs/BRAND.md`.

## 8. Components worth a dedicated pass

| Component | Direction |
|---|---|
| Search / command palette (`/`, j/k, Enter) | the mechanic is the product — restyle chrome only |
| Toolbox / recently-used tray | visual weight must not compete with the catalogue |
| Category tiles (29) | done — custom icon set, §5 |
| Tool card in "all tools" | small changes only; they compound ×1,312 |
| Support / sponsor panel | calm and factual, not persuasive; the page should publish a real current traffic number (needs the owner's GA figures — not derivable here) |
| Discovery pages (`/popular`, `/new`, `/tools`, `/use-case`, `/tools-index`) | each keeps a distinct reason to exist; do not re-skin them into homepage copies |

## 9. Process — how a design change ships

1. **Page-level:** edit; bump the version pins (`?v=` in `index.html`,
   `APP_VERSION` in `home-core.js`, `CACHE_VERSION` in `sw.js` — one number,
   three owners); `npm run build`; `npm run verify`; inspect at 360 and 1440 px.
2. **Generated surfaces:** fix the generator, not the output (AGENTS.md §4);
   the drift checks in `verify.sh --deep` catch a disagreement.
3. **Brand assets:** edit `brand/mark.py` (or this file, if the decision
   changed), regenerate with `brand/gen_assets.py`, prove with
   `brand/check-mark.py`. **Never hand-edit a shipped logo file.**
4. **CI:** the 7-check gate on every PR and push; `--deep` on `main` (the
   deploy) and nightly (`.github/workflows/agent-guardrails.yml`).

## 10. What not to touch

- The plain-HTML, no-JavaScript fallbacks (index, tool rows as real links) —
  resilience, not legacy debt; the icon sprite is static SVG and keeps them no-JS.
- The dark/light toggle and the user accent picker; the house accent is an
  addition for external surfaces, not a replacement for user choice.
- The copy voice (§7), and the no-accounts principle — shareable results are
  URL-encoded state, never sign-in.
- The separation between the products (§2), including monetisation: each side
  asks for money separately, in its own voice.

## 11. Where the assets live

| Asset | Home | Notes |
|---|---|---|
| Mark (favicon, PWA icons, lockups, OG cards, `logo.png`) | `brand/` → generated to repo root | `brand/README.md` is the whole story |
| Category icon sprite | `assets/icons/categories.svg` | §5; CC-BY like the rest |
| Fonts | `fonts/` | Inter subsets + `OFL.txt`; the display font lands here, subsetted, with attribution |
| Tokens | `home.css :root` (page), `brand/mark.py` (brand) | §3.3 |
| Spec sheet | `brand/spec.html` (generated) | the printable "how may I use this logo" answer |
