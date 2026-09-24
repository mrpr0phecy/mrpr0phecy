# DESIGN.md — the visual system of the tools site

**Status: active · 2026-09-24.** This file records the design decisions so they
are made once, not re-litigated every time someone touches a tool page.
`docs/BRAND.md` owns naming and voice; `brand/README.md` owns the mark. This
file owns colour, type, iconography, layout and the rules that keep the two
products on one domain looking like two different studios.

Where a number below is quoted as a ratio, it was measured with the same WCAG
2.x relative-luminance formula the site's own Contrast Checker uses
(`cards/color-contrast-checker.html`, `brand/mark.py: contrast()`) — the site's
brand colour is checked with the site's own tool.

---

## 1. What this document is for

One person maintains 1,285 tools, 29 category pages, a music product, a
standalone AI and every generated surface in between. Design drift at this
scale is not a matter of taste; it is a maintenance cost. This file exists so
that:

* a new tool, contributor or agent can see the visual rules in one place;
* the brand decisions from 2026-09-24 (the house accent, the category icon
  set) are recorded with their rationale before they can be "improved" away;
* the split between the two products on this domain is enforceable.

It is a working brief, not a spec: values are starting points for judgment,
and the gates (`scripts/verify.sh`, `brand/check-mark.py`,
`scripts/check-critical-css.py`) are the enforcement, not this prose.

## 2. Two visual systems, one repo

The domain carries two products that deliberately never cross-promote
(CONSTRAINTS.md):

| | The Most Useful Site (Product A) | MrProphecy / Oracle (Product B) |
|---|---|---|
| Entry | `index.html`, `tool.html`, `tools/*.html` | `listen.html`, `music.html`, `radio.html`, `sync.html` |
| Register | Precision instrument: hairlines, mono readouts, density | Artist project: moodier, glyph-like, more expressive |
| Palette | Near-black `#0a0f14` / off-white `#f8fafc`, cyan UI accent, amber house accent | Own palette (deep green-and-black direction); **do not reuse** Product A's accent, grid or icons |
| Iconography | Line-icon set, one stroke weight, `currentColor` | Its own marks; emoji seasoning allowed |

The visual break *is* the feature: the instant a visitor crosses from the
catalogue to the music side (or vice versa), the palette should say
"you have left the tool catalogue". Keeping the two systems apart is a
brand decision with an engineering consequence — no shared tokens, no shared
icon set, no "unification" without the owner saying so (the same rule that
keeps Lantern, MostUsefulMaps and SupaViewer out of the tools brand —
`brand/README.md`).

## 3. Colour

### 3.1 The two accent jobs

There are exactly two accent roles in Product A, and they never share a value:

| Role | Value | Where |
|---|---|---|
| **UI accent** (the visitor's) | default `#2dd4ff` cyan; the picker offers six, the choice is remembered in `localStorage` | Everything *in* the interface: ambient washes, hover states, focus rings, the mark's brackets, in-page lockups |
| **House accent** (the brand's) | `#e8a33d` amber on dark; `#7a500e` for accent words on light | External brand surfaces only: `logo-lockup-*.svg`, `og-brand.png` / `og-tools.png`, `logo.png` (press kit) |

The house accent is the colour that defines the product externally — the logo
a journalist grabs, the social card, the press kit. The page itself is never
in the house colour: first-time visitors and returning visitors with a
personalised accent both see their own accent, and the mark's cyan brackets
stay drawn *out of* the console they came from.

**Why amber.** Blue and purple are the default palette of every calculator and
fintech competitor; blending in works against the "not like the other
calculator sites" positioning. Amber/ochre reads as instrument panel (VFD
readouts, aviation HUDs), sits against the near-black base, and is far from
every accent in the picker except the warm family, where it is distinguishable
at a glance. The candidates were checked before locking (2026-09-24):
`#e8a33d` at 8.92:1 on the page beat the deeper ochres on dark-surface
legibility, and `#7a500e` was taken over the lighter brown pair for the same
margin the existing cyan rule already demands.

### 3.2 Measured contrast (2026-09-24)

| Pair | Ratio | Requirement |
|---|---|---|
| `#e8a33d` on `#0a0f14` (page) | **8.92:1** | fill: 3:1 non-text — passes |
| `#e8a33d` on `#17232e` (tile top, worst case) | **7.40:1** | fill: 3:1 — passes |
| `#e8a33d` on white | 2.16:1 | **never as text** |
| `#7a500e` on `#f8fafc` (light surface) | **6.73:1** | text: 4.5:1 AA — passes |
| `#7a500e` on white | **7.04:1** | text: 4.5:1 AA — passes |
| reference: `#2dd4ff` on `#0a0f14` | 10.97:1 | the existing UI accent |
| reference: `#0a7ea4` on white | 4.63:1 | the existing on-light cyan rule |

`brand/gen_assets.py` refuses to run if `HOUSE_ON_LIGHT` drops below 4.5:1 on
white or `HOUSE_ACCENT` below 3:1 on the page, and `brand/check-mark.py`
re-checks both in the gate — the same enforcement the cyan pair already has.

### 3.3 Tokens

`home.css :root` is the token sheet for the app. Names map to the brief's
roles as follows (renaming the existing ones would churn every rule for no
behaviour change, so the mapping is documented instead):

| Token (brief) | Repo token | Note |
|---|---|---|
| `--bg` / `--bg-dark` | `--bg-primary` / `--surface` (`light-dark(#f8fafc, #0a0f14)`) | unchanged |
| `--fg` / `--fg-dark` | `--text` / `--surface-2` family | unchanged |
| `--accent-user` | `--accent` (+ `--accent-hue`) | the picker; unchanged |
| `--accent-house` | **new** — lives in `brand/mark.py` as `HOUSE_ACCENT` / `HOUSE_ON_LIGHT` | external brand only; not a page token on purpose |
| `--grid-line` / `--rule` | planned (§6) | schematic texture, not yet shipped |
| `--font-display` | planned (§4) | the variable display font, when it lands |
| `--font-body` | `--font-sans` (Inter) | unchanged |

**Rule:** a colour change in `home.css` is a *page* change (version pins move,
`scripts/check-critical-css.py` watches it). A colour change in
`brand/mark.py` is a *brand* change (regenerate, `check-mark.py` watches
it). Do not copy a brand colour into page CSS or a page colour into the brand
files.

## 4. Typography

* **Body and all tool UI:** Inter — the site's own subsetted
  `fonts/inter-latin.woff2` (+ `latin-ext`). It is fast, boring and highly
  legible, which is the point at 1,285 pages. Tool inputs, results and table
  data stay on it; so do the category page bodies and the deep `tools/*.html`
  pages.
* **Instrument voice:** `--font-mono` (system mono stack, no download) for
  labels, counts, key hints and readouts — the "mono kicker" language the
  section headings moved to on 2026-09-24. Sentences stay in Inter.
* **Display type — reserved slot.** A bespoke parametric variable font with
  calligraphic letterforms is in progress outside this repo. When it is
  deployable:
  1. it lands first on the **wordmark, category headers and hero type only**
     (`--font-display`), never on body copy or dense UI;
  2. it ships **subsetted** to the character set actually used, with
     `font-display: swap`, and its byte cost is checked against the
     first-paint budgets in `scripts/check-critical-css.py`;
  3. it expands gradually (one surface at a time, each with a verify pass),
     not in a "finished v1" big bang;
  4. the MrProphecy side is where its more experimental letterforms belong —
     the tools side gets the controlled cuts.

  Until it exists, the display slot is empty and the rules above are the
  policy for what it is allowed to touch.

## 5. Iconography

**Category-level wayfinding is a custom line-icon set, not emoji.** Emoji
render differently on every platform, and next to a test suite that checks
statutory math for every salary band they read "hackathon MVP" rather than
"engineered". The set ships as one inline-SVG sprite referenced by `<use>`,
so the cost across all 1,285+ pages is one small file loaded once:

* **File:** `assets/icons/categories.svg` — 29 symbols, one per category.
* **Grid:** 24 × 24, live area 3–21, **one stroke weight (1.5)**, round caps
  and joins, `currentColor`, no fills except named dots. New symbols follow
  the same construction; do not introduce a second weight.
* **Ids:** `icon-<category-slug>` — the same slugs
  `scripts/build-tools-index.js` owns, so a new category's icon id is
  derivable and `iconId` in `tools-index.json` follows automatically.
* **Surfaces that use it:** the home page's 29 category tiles
  (`build-home-prerender.py`), every category page's badge / h1 / pills
  (`build-category-pages.js`), the directory's category strip
  (`generate-ai-index.js`). Any new category-level surface renders the sprite
  reference, never an emoji.
* **Where emoji may stay:** machine-readable surfaces (`llms.txt`,
  `llms-full.txt`, the JSON feeds) and *tool titles* inside cards — there it
  is seasoning, not navigation. Never as a category marker, never in a
  header, never as the thing carrying wayfinding.

**Adding a category icon:** add a `<symbol>` to the sprite (24-grid, 1.5
stroke, `currentColor`), register the category wherever the others are
(`scripts/build-tools-index.js`), run `npm run build`. The id
(`icon-<slug>`) is the only thing that has to match.

**Do not reuse this set on the MrProphecy side.** See §2.

## 6. Layout and texture

Direction: **drafting table, not soft SaaS** — thin structural rule lines, a
faint grid, index-card-style labels, information-dense scannable cards. This
is already most of the site's look (hairline borders, mono kickers, the
console's corner brackets), and the changes should stay at CSS level:

* **Category tiles:** chip + icon + mono count, as shipped; the icon now
  answers to the tile's hover (accent) instead of being a fixed-color emoji.
* **Grid texture (planned):** a faint `--grid-line` (low-opacity neutral)
  over the ambient washes, with `--rule` (slightly higher contrast) for
  structural dividers. Add to `home.css` tokens + one background layer; check
  the gzip budget in `scripts/check-critical-css.py` and look at 360 px
  first — texture that shows on a phone before the content does is texture
  that is too strong.
* **Tool cards / rows:** name, category, one-line description. Resist
  illustrated, marketing-style cards — density and clarity are part of the
  brand, and the row component is shared across the home page, the category
  pages and the directory (`explore.js`), so changes to it compound.
* **Deep tool pages** (`tools/*.html`) keep their own generator CSS
  (`scripts/build-tool-pages.py`) — when a token changes, the generator's
  CSS string is a second home that has to move with it.

## 7. Voice and microcopy

The existing copy tone — dry, precise, quietly confident, upfront about
trade-offs (inviting a sponsor to ask for real traffic numbers before buying
is the register) — is doing brand work. New UI copy (empty states, error
states, tooltips, the support/donate/sponsor panels) matches that register.
Do not drift toward generic friendly-SaaS copy when restyling; restyle the
container, keep the words. `docs/BRAND.md` has the per-surface voice table.

## 8. Components worth a dedicated pass

| Component | Current state | Direction |
|---|---|---|
| Search / command palette (`/`, j/k, Enter) | mechanics are the product | keep the mechanic; restyle chrome only |
| Toolbox / "recently used" tray | good returning-user feature | visual weight must not compete with the catalogue |
| Category tiles (29) | **done** — custom icon set, §5 | hover already answers to the icon |
| Tool card in "all tools" | highest-repetition component | small changes only; they compound ×1,285 |
| Support / sponsor panel | the one place the site asks for something | calm and factual, not persuasive; **publish a real, current traffic number on the page** rather than "ask me for one" (needs the owner's GA figures — not something this repo can derive) |
| Discovery pages (`/popular`, `/new`, `/tools`, `/use-case`, `/tools-index`) | each exists, none redundant | keep each a distinct entry point with its own reason to exist; do not re-skin them into homepage copies |

## 9. Process — how a design change ships

1. **Page-level** (CSS/markup on existing pages): edit, bump the version
   pins (`?v=` in `index.html`, `APP_VERSION` in `home-core.js`,
   `CACHE_VERSION` in `sw.js` — one number, three owners), `npm run build`,
   `npm run verify`, inspect at 360 px and 1440 px.
2. **Generated surfaces:** fix the generator, not the output (AGENTS.md §4);
   the drift checks in `verify.sh --deep` fail if a generated page disagrees
   with its generator.
3. **Brand assets:** edit `brand/mark.py` (or this file's rules, if the
   decision changed), regenerate with `brand/gen_assets.py`, prove it with
   `brand/check-mark.py`. Never hand-edit a shipped logo file.
4. **CI tiers** (2026-09-24): the 7-check gate runs on every pull request and
   push (~1 min in CI); the full `--deep` gate runs on pushes to `main`
   (the deploy) and nightly, so a small PR gets fast feedback and the full
   sweep still stands between any merge and the live site
   (`.github/workflows/agent-guardrails.yml`).

## 10. What not to touch

* The plain-HTML, no-JavaScript fallbacks (the tools index, the tool rows as
  real links) — accessibility and resilience, not legacy debt. The icon
  sprite is static SVG and keeps them no-JS.
* The dark/light toggle and the user accent picker — good UX as-is. The house
  accent is an addition for external surfaces, not a replacement for user
  choice.
* The copy voice (§7).
* The no-accounts principle — shareable tool results should be URL-encoded
  state, never sign-in.
* The separation between the two products (§2) — including monetisation:
  each side asks for money separately, in its own voice.

## 11. Where the assets live

| Asset | Home | Notes |
|---|---|---|
| Mark (favicon, PWA icons, lockups, OG cards, `logo.png`) | `brand/` → generated to repo root | `brand/README.md` is the whole story |
| Category icon sprite | `assets/icons/categories.svg` | §5; versioned with the repo, CC-BY like the rest |
| Fonts | `fonts/` | Inter subsets + OFL.txt; the display font lands here, subsetted, with attribution |
| Tokens | `home.css :root` (page), `brand/mark.py` (brand) | §3.3 |
| Spec sheet | `brand/spec.html` (generated) | the printable "how may I use this logo" answer |
