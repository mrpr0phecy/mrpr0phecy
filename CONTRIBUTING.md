# Contributing

One GitHub Pages repo, one owner, and a stream of AI agents. The bar is
"make it easier for the next person, not harder". This page is the short
version; [AGENTS.md](AGENTS.md) is the one-page rulebook and
[ARCHITECTURE.md](ARCHITECTURE.md) is how the site actually works.

## The two products never mix

**A** — The Most Useful Site in the World: 1195 free browser tools, entry
`index.html`. No music, no players, no banners.
**B** — MrProphecy music: entry `listen.html` and its 12 translated siblings.
No tool links. If a change touches both, the task was probably misread.

## Run it

```bash
npm run build          # regenerate every derived file (~8 s)
npm run verify         # the gate: 8 checks, ~4 s — run it after every edit
npm run verify:deep    # + the slow audits (~15 s) — before pushing
npm test               # the product test suite
```

CI runs `verify.sh --deep` on every push and PR (~15 s). A green run is not
proof of a live deploy: GitHub Pages takes 30–60 s, so check the URL.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.themostusefulsiteintheworld.com/<page>.html
```

## Leave these alone

`CNAME` · `sw.js` (unregistered by design) · `guide.txt` (stale) · `system/` ·
`substitutions/` · `digitaldetoxcardshtml/` · the CV files · `token.html`
(kept deliberately, no crypto promotion).

`opensourcenews.html` is the live news broadcast and its facade pattern is
load-bearing — touch with care. Don't "fix" the YouTube `o` vs
SoundCloud/Instagram `0` handle mismatch; it is not a typo
(ARCHITECTURE.md §4), and don't invent YouTube IDs — use the verified table
there.

## Things that have bitten this repo

- **Element IDs must be unique across all cards.** One shared DOM, 1195
  fragments: prefix every ID with the slug (`xyz-input`, `xyz-output`).
- `target="_blank"` ⇒ `rel="noopener noreferrer"`. `loading="lazy"` below the
  fold. Respect `prefers-reduced-motion`. Mobile-first at 360 px. Keyboard
  reachable.
- Canonical and OG URLs use `https://` **and** `www.` — never plain `http://`.
- No placeholders ship: `verify.sh` greps for `VIDEO_ID`, `PLAYLIST_ID`,
  `dQw4w9WgXcQ` and `YOUR_` in URLs.
- Filenames contain spaces and en-dashes. Quote paths; URL-encode in markup.
- **Never hand-edit a tool count.** The count is the number of `.html` files
  in `cards/`, and every published copy is derived from it: `npm run build`
  re-derives them all, and `verify.sh` self-heals drift in place. (The old
  procedure here listed nine copies to update by hand; that is exactly what
  produced nine contradictory counts.)
- Translated clusters are edited as a whole (13 pages) or not at all — there
  is no automated check for a half-translated cluster.

## If unsure

Read [ARCHITECTURE.md](ARCHITECTURE.md). Money questions →
[INCOME.md](INCOME.md). Anything about deleting a tool or page,
restructuring, `opensourcenews.html`, monetisation or YouTube-channel
behaviour → ask the owner (`mrpr0phecy`) first.
