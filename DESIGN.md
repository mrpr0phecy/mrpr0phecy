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

One person maintains 1,368 tools, 33 category pages, a music product, a
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

### 3.1 The three accent jobs

| Role | Value | Where |
|---|---|---|
| **UI accent** (visitor's) | default `#ffd700` gold; four golds offered, choice in `localStorage` | everything *in* the interface: washes, hover, focus rings, the mark's brackets |
| **House accent** (brand's) | `#d4af37` deep gold on dark; `#7a500e` for accent words on light | external surfaces only: `logo-lockup-*.svg`, `og-brand.png`/`og-tools.png`, `logo.png` |
| **Season accent** | `#ff9f43` pumpkin (`--pumpkin`) | one dated surface only: the Halloween band on the home page (`home.css` §13), the Halloween category hub and `guides/halloween.html` |
| **Readout gold** | `#d4af37` (`--readout`), `rgba(212,175,55,.68)` (`--readout-dim`) | numbers and labels only: category counts, section markers, the tool total, shelf tags. Never a control |
| **Structure grey** | `#555555` (`--grey`), `rgba(85,85,85,.82)` (`--grey-soft`) | every hairline, divider, tick and icon socket. Never text |

The house accent defines the product externally (the logo a journalist grabs,
the social card, the press kit). **The page itself is never in the house
colour** — every visitor sees their own accent, and the mark's cyan brackets
stay drawn out of the console they came from.

### 3.1a One palette: black, gold, #555555 (2026-10-20)

The page is three values. Everything else is one of them at an alpha, or a step
on the same grey ramp.

- **Gold splits by job, never by mood.** `#ffd700` is what you *press* (focus,
  active, hover edges, the mark's brackets); `#d4af37` is what you *read*
  (counts, section markers, stats, tags).
- **`#555555` is structure only.** At 2.71:1 on the page it can draw a hairline
  and it cannot carry a letter, so copy climbs a ramp: `#d6d6d6` body,
  `#a3a3a3` secondary, `#8a8a8a` muted.
- **State is weight and shape, not hue.** A warning is a rule and a ⚠; a pass is
  a filled gold dot. Nothing in the interface means something by colour alone,
  which is what lets it stay three values and still be readable.
- **The accent picker survives, inside the palette**: four golds (bright
  `#ffd700`, antique `#d4af37`, champagne `#f0dc9a`, bronze `#a1791f`). The six
  coloured page themes became three blacks (midnight, graphite, void), because a
  theme now only decides how far toward grey the canvas may drift.
- **The seasonal band** keeps its own token but it is the same gold family; the
  band is identified by its label and its date, not by a hue.

Amber was the previous house colour for the reason gold still holds: blue and
purple are every calculator and fintech competitor's default and blending in
works against the positioning; gold reads as instrument panel.

The season accent is a third, narrower job (added 2026-10-20). It exists
because a seasonal shelf has to read as *this* season without pretending to be
the visitor's accent, and it is deliberately not the house amber: the band is a
page surface, the amber is the brand's, and the two would be confused at a
glance. It is scoped as tightly as possible:

- **Where:** `home.css` §13, the Halloween hub and its guide. Nowhere else, and
  never in `brand/`.
- **When:** the band is in the document all year — its links are crawlable and
  it works without JavaScript — but a `<head>` script sets `data-season` before
  the first paint, so it is `display:none` outside 10 October – 2 November and
  absent from the tab order. The hub and guide keep the colour: they are
  ordinary category pages.
- **How:** it never replaces `--accent` anywhere else on the page. Outside the
  band the search box, chips, tiles and panels keep the visitor's colour; the
  band's own hover edges and row arrows are pumpkin, and the filled call to
  action takes a white focus ring so it is visible against the fill.
- **Contrast:** `#1b0e02` on `#ff9f43` (the call to action) is **9.29:1**, and
  `#ff9f43` on `#0a0f14` is **9.43:1**. It is never body text on a light
  surface, and forced-colours drops it for Canvas/Highlight like everything
  else.

The readout amber is a fourth, equally narrow job (added 2026-10-20 with the
darker home page). The interface now speaks in two colours: **amber is what you
read, the accent is what you press.** Counts, section numbers and the tool total
are amber; every interactive thing keeps the visitor's accent, so the picker
still means something. It is deliberately lighter and more orange than the
house `#e8a33d` so a readout is never mistaken for the brand, and it is a *page*
token (`home.css :root`), not a brand value — `brand/mark.py` never sees it.
`--readout-dim` is the same hue at 62 % over the page, which is the smallest
weight that still clears 4.5:1 for the 0.68 rem section markers (measured
below); anything dimmer has to be decoration, not text.

### 3.1b Tool interiors: the same three values, card by card (2026-10-20)

A tool page is a shell plus a card, and the card ships its own `<style>`. When
the shell went gold the interiors did not: 474 cards hard-coded `#2dd4ff`, and
another 1,209 painted from `var(--accent)` and inherited the shell by luck. The
fix is a rewrite of colour literals only — **50 cards at a time, most-used
first**, because 1,424 cards cannot be reviewed as one diff.

- **Only colour moves.** `scripts/retheme-cards.py` rewrites hex and `rgba()`
  literals; every other byte of the file is untouched, so structure, ids,
  handlers and layout cannot drift. The diff for a converted card is a set of
  one-for-one line swaps, and the gate checks that by stripping colour from both
  sides and comparing.
- **One hue per job, then a four-gold rotation.** A card with one or two accents
  keeps the page's job split — action `#ffd700`, readout `#d4af37`. A card with
  three or more sibling accents (four stat tiles, a legend, a series) rotates
  through the same four golds the picker offers, in order of appearance, so the
  tiles stay tellable apart instead of flattening into one colour.
- **Colour that carries meaning is left alone.** A three-or-more-hue gradient is
  data — the BMI bands, a risk scale, a spectrum — and its hues are exempted
  *card-wide*, so a legend label keeps matching the stop it names. A protected
  list (contrast checkers, colour pickers, physics and light toys, and the cards
  where hue is a *key* — the periodic table's category tiles, the anatomy
  explorer's body-system chips) is skipped entirely, because recolouring them
  would break the thing they do.
- **A hue can be both.** `bodyfat` spends `#39ff14` as its theme accent *and* as
  the low stop of a green→yellow→red scale. The rule: if that hue is also the
  card's most-used chromatic colour (six hits or more) **and it paints a
  surface** — a background, border or shadow outside the gradient itself — it is
  an accent sitting in a ramp, and it converts everywhere; the remaining stops
  still read in order. `bmi` fails that test: its `#4dabf7` only ever letters
  the word "Underweight" and fills the band behind it, so the band stays blue.
  Without the surface test a converted card could not be re-run safely — the
  second pass would see the ramp's remaining hue as an accent and eat the scale.
- **White type on a gold fill goes dark.** A pink button carried white at
  3.9:1; once both stops are gold it would be 2.2:1. Any block that fills with
  a solid gold and letters in a light colour is rewritten to `#04070a` on the
  spot (14.40:1), which is why a converted card never has a pale-gold button
  with unreadable type.
- **Contrast holds in the new tones.** `#d4af37` on the card surface `#0b1219`
  is **8.96:1**, `#ffd700` on the same is **13.43:1**, and even the bronze
  `#a1791f` clears AA as text at **5.07:1** on the page and **4.74:1** on the
  `#111111` panel. No card gained a gold-on-gold pair.

### 3.2 Measured contrast

| Pair | Ratio | Requirement |
|---|---|---|
| `#ffd700` on `#04070a` (page) | **14.40:1** | the accent, as text or fill |
| `#d4af37` on `#04070a` (page) | **9.60:1** | text 4.5:1 — passes |
| `#d4af37` on `#0c141c` (tile) | **8.90:1** | text 4.5:1 — passes |
| `#555555` on `#04070a` → **2.71:1** | **lines only** | never text; the grey ramp below it carries copy |
| `#d6d6d6` / `#a3a3a3` / `#8a8a8a` on the page | **16.48:1** / **8.49:1** / **5.85:1** | body, secondary, muted |
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
| `--bg` / `--bg-dark` | `--bg-primary` / `--surface` (`light-dark(#f8fafc,#04070a)`) | #04070a since the 2026-10-20 darker pass |
| `--fg` / `--fg-dark` | `--text` / `--surface-2` family | unchanged |
| `--accent-user` | `--accent` (+ `--accent-hue`) | the picker; unchanged |
| `--accent-house` | `HOUSE_ACCENT` / `HOUSE_ON_LIGHT` in `brand/mark.py` | external brand only — not a page token, on purpose |
| `--grid-line` / `--rule` | `home.css :root` | faint grid / structural divider |
| `--readout` / `--readout-dim` | `home.css :root` | the amber readout voice; see §3.1 |
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

- **File:** `assets/icons/categories.svg` — 31 symbols, one per category.
- **Grid:** 24×24, live area 3–21, **one stroke weight (1.5)**, round caps and
  joins, `currentColor`, no fills except named dots. No second weight, ever.
- **Ids:** `icon-<category-slug>` — the slugs `scripts/build-tools-index.js`
  owns, so a new category's id is derivable and `iconId` in `tools-index.json`
  follows.
- **Surfaces:** the home page's 31 tiles (`build-home-prerender.py`), every
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
- **Grid texture (home):** the hero's dot field settles into a faint `--grid-line`
  grid below the search area; `--rule` carries a little more contrast on section
  dividers. Both stay subordinate to the links and text, and the grid fades at
  its edges so it reads as a surface, not a backdrop competing for attention.
- **Scroll progress:** a two-pixel accent trace follows the root scroll where
  CSS scroll timelines are available; it is absent when reduced motion is asked for.
- **Horizontal shelves:** start, middle and end fades track which edge still
  has content behind it. The shared `explore.js` cue clears reached edges, also
  remeasuring shelves that become visible later; links stay touch- and
  keyboard-reachable.
- **Tool cards/rows:** name, category, one-line description. Resist
  illustrated marketing cards — density is the brand, and the row component is
  shared by home, category and directory pages (`explore.js`), so changes
  compound.
- **Tool-page frame** (`tool/*.html`): `tool-page.css` is the shared frame,
  not a global restyle of the card. Navigation, caveats and related links have
  distinct levels; long text wraps rather than forcing a narrow viewport wider.
  The frame is cached across visits instead of repeating CSS in every document.
- **Interaction parity:** keyboard focus is as legible as hover; horizontal
  fades step aside while a control inside them has focus. Hidden recents reserve
  no space. Small-screen controls have 44 px targets and search fields use
  16 px text to avoid focus-triggered zoom. Counts use tabular numerals.
- **Inclusive surfaces:** keep quieter text readable, use structural borders
  rather than shadow alone, and honor forced colors, increased contrast,
  reduced transparency and reduced motion.
- **Motion (`home.css` §14).** Animation is a product requirement, not
  decoration bolted on: the page should feel assembled, not printed. The rules
  that keep it honest — every effect one-shot, only `transform` / `opacity` /
  `clip-path`, everything inside `prefers-reduced-motion: no-preference`, no new
  request and no new font, and the first-paint budget raised on purpose with the
  measurement recorded in `check-critical-css.py`. Below-the-fold entrances hang
  off the existing `.js-reveal` gate rather than `view()` timelines: a filled
  view() animation resolves off-screen elements to its start frame, which hid
  tiles below the fold in a real browser.
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
| Category tiles (31) | done — custom icon set, §5 |
| Tool card in "all tools" | small changes only; they compound ×1,348 |
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
