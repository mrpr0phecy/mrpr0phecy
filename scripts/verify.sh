#!/usr/bin/env bash
# verify.sh — would this change break the site?
#
#   bash scripts/verify.sh          # the gate: 7 checks, all of them, ~5 s
#   bash scripts/verify.sh --deep   # + 4 slow audits, ~75 s with jsdom in
#                                   #   /tmp/tenv (as CI has it)
#   bash scripts/verify.sh --live   # + ask the deployed site what it serves
#
# Local validation is task-based: see AGENTS.md §1. Batch edits before
# running this gate; docs-only changes do not need it. No checks are disabled.
#
# The site brain (a 4.5 MB generated retrieval index, its 857-line builder, its
# evaluator, and the rule that any edit to a public doc forced a
# rebuild-and-commit) was deleted on 2026-09-20: nothing on the site read it,
# and agents.html now points outside agents at llms.txt, cards.json and
# related.json instead.
#
# It used to be 22 sections and ~3 minutes, which grew a scoping engine
# (~400 lines: a path→section map, widening rules, a plan printer, a
# regression test for the map) whose only job was to decide which sections an
# edit could reach. That engine was deleted on 2026-09-20 along with the
# sections that made it necessary. What is left here is what a visitor, a
# search engine or an attacker would actually notice:
#
#   1. hygiene    no token, no placeholder ID, no unsafe target=_blank
#   2. catalogue  cards/ and cards.json agree about what exists
#   3. card JS    the JavaScript in every changed card parses, every inline
#                 handler it ships resolves in window scope and compiles, no
#                 card indexes parallel arrays of different lengths, no button
#                 submits the form the visitor is working in, no card can
#                 only initialise while the document is still loading (which
#                 tool.html never is: the listener is never registered and the
#                 card never starts), and nothing a card appends to the document
#                 outlives it (tool.html clears the card, not the body)
#   4. links      every internal href/src resolves to a shipped file
#   5. counts     every published tool count is re-derived, never hand-edited
#   6. SEO        no top-level page is missing a <title>
#   7. Lantern    the on-site AI engine's structural contracts hold
#
# --deep adds the audits for shared infrastructure changes and CI: egress
# classification, accessibility, cross-card name collisions, CSS leaks, every
# generated surface's drift check, the full card JS sweep (syntax, inline
# handlers, parallel arrays), the product test suite and the measured quality
# floors. They were cut from the gate because
# they cost ~20 s and change nothing about an edit in progress — not because
# they are wrong. CI runs the fast gate on pull requests and pushes, and the
# full --deep gate on pushes to main (the deploy) and nightly, so a small PR
# gets feedback in about a minute and the catalogue is swept on a schedule
# (see .github/workflows/agent-guardrails.yml).
#
# Nothing here writes to the repository except the count re-derivation in
# check 5, which fixes drift in place and tells you to commit the result.
set -u
cd "$(dirname "$0")/.." || exit 1

DEEP=0; LIVE=0
for arg in "$@"; do
  case "$arg" in
    --deep) DEEP=1 ;;
    --live) LIVE=1 ;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'verify.sh: unknown option "%s" (use --deep, --live)\n' "$arg" >&2; exit 2 ;;
  esac
done

FAILS=0; NOTES=0
NAMES=(); MS=()

now_ms() {
  # date +%s%N is GNU; fall back to whole seconds where it is not.
  local n
  n=$(date +%s%N 2>/dev/null)
  case "$n" in *N*|"") echo $(( $(date +%s) * 1000 )) ;; *) echo $(( n / 1000000 )) ;; esac
}

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
note() { printf '  \033[33mNOTE\033[0m %s\n' "$1"; NOTES=$(( NOTES + 1 )); }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILS=$(( FAILS + 1 )); }

# expect "what passing means" "what to do about failing" cmd args…
# The command's own output is not suppressed: these checks print the offending
# file or line, and that detail is the point of running them.
expect() {
  local ok_msg="$1" fail_msg="$2"; shift 2
  if "$@"; then ok "$ok_msg"; else fail "$fail_msg"; fi
}

# Runs a check in this shell (not a subshell) so fail/note count directly, and
# times it: the summary names the slowest checks, so "what is making the gate
# slow" is answered by reading the output rather than by profiling it.
check() {
  local name="$1" fn="$2" t0 t1
  t0=$(now_ms)
  section "$name"
  "$fn"
  t1=$(now_ms)
  NAMES+=("$name"); MS+=( $(( t1 - t0 )) )
}

# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------

hygiene() {
  # Patterns are assembled at runtime so this script does not match itself.
  local p1="gh""o_" p2="gh""p_" p3="github""_pat_" p4="gh""s_" hits
  if grep -rnE "$p1|$p2|$p3|$p4" --exclude-dir=.git . 2>/dev/null | grep -v '^Binary' | head -5 | grep -q .; then
    fail "possible token in a tracked file — scrub it and rotate it now"
  else
    ok "no credential-shaped string in the repository"
  fi
  # Hard placeholders anywhere; YOUR_ only inside URLs/attributes (demo text
  # like 'YOUR_SYSTEM_PROMPT' in the prompt-injection lab is legitimate copy).
  local ph="dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|(src|href)=['\"][^'\"]*YOUR_"
  hits=$(grep -rlE "$ph" --include='*.html' --exclude-dir=.git . 2>/dev/null || true)
  if [ -n "$hits" ]; then fail "placeholder IDs shipped: $(echo "$hits" | tr '\n' ' ')"; else ok "no placeholder IDs in any page"; fi
  local bad
  bad=$(grep -rn --include='*.html' --exclude-dir=.git -E '<a [^>]*target="_blank"' . 2>/dev/null | grep -v 'noopener' || true)
  if [ -n "$bad" ]; then fail "target=_blank without rel=noopener: $(echo "$bad" | head -5)"; else ok "every target=_blank carries rel=noopener"; fi
}

catalogue() {
  expect "cards/ is coherent (fragments, prefixes, required fields)" \
         "catalogue incoherent — read the output above" \
         python3 scripts/check-cards.py
  expect "cards.json matches the card files" \
         "catalogue metadata drift — run: node generate-cards-json.js" \
         node generate-cards-json.js --check
}

card_js() {
  if [ "$DEEP" = "1" ]; then
    expect "every card's JavaScript parses (full sweep)" \
           "a card would be dead in production — fix the syntax error above" \
           python3 scripts/check-card-js.py --all
  else
    expect "the changed cards' JavaScript parses (--deep for the full sweep)" \
           "a card would be dead in production — fix the syntax error above" \
           python3 scripts/check-card-js.py
  fi
  # Parsing is not the same as being reachable. An inline on*="…" handler runs
  # in the window scope, so a card that defines its controls inside an IIFE —
  # or calls a function that was never written — ships a button that throws
  # ReferenceError. Clicking catches the ones the card renders; this reads the
  # source, so a handler in generated markup is covered too. Changed cards only
  # in the gate; `node scripts/handler-check.js --all` before a big push.
  if [ "$DEEP" = "1" ]; then
    expect "every card's inline handler resolves (full sweep)" \
           "an inline handler would throw ReferenceError when pressed — see above" \
           node scripts/handler-check.js --all
  else
    expect "the changed cards' inline handlers resolve" \
           "an inline handler would throw ReferenceError when pressed — see above" \
           node scripts/handler-check.js --changed
  fi
  # Parsing and reachability still do not say the card has the data it indexes.
  # creative-writing.html drew one index from 12 plot titles and used it on 8
  # descriptions and 8 structures: four clicks in ten read undefined and the
  # generator threw. Only a check that compares array LENGTHS sees that, so it
  # runs here on every changed card and over cards/ on --deep.
  if [ "$DEEP" = "1" ]; then
    expect "no card indexes parallel arrays of different lengths (full sweep)" \
           "a card picks one index into arrays that are not the same length — see above" \
           node scripts/check-parallel-arrays.js --all
  else
    expect "the changed cards' parallel arrays agree" \
           "a card picks one index into arrays that are not the same length — see above" \
           node scripts/check-parallel-arrays.js --changed
  fi
  # A <button> with no type inside a <form> is a submit button, and on this site
  # submitting the form reloads the tool: fitnesscore's "Calculate BMI" showed
  # its answer, navigated to its own URL and came back empty. jsdom does not
  # implement form submission, so the harness cannot see this one at all.
  if [ "$DEEP" = "1" ]; then
    expect "no button submits the form it sits in (full sweep)" \
           "a click would run the tool and then reload it — see the button above" \
           node scripts/check-form-buttons.js --all
  else
    expect "the changed cards' buttons do not submit their own forms" \
           "a click would run the tool and then reload it — see the button above" \
           node scripts/check-form-buttons.js --changed
  fi
  # `if (document.readyState === 'loading') { addEventListener(…) }` with no else
  # never runs: tool.html injects the fragment into a document that finished
  # loading long ago and *then* dispatches DOMContentLoaded, so the listener is
  # never registered and the card never starts. Forty-three cards shipped that,
  # left behind by the bulk edit that wrapped their init — tic-tac-toe drew no
  # board at all. A card that starts and does nothing is silent under every
  # runtime check, so the rule lives here.
  if [ "$DEEP" = "1" ]; then
    expect "every card can start in an already-loaded document (full sweep)" \
           "a card never initialises for a visitor — give the guard an else branch" \
           node scripts/check-card-init.js --all
  else
    expect "the changed cards can start in an already-loaded document" \
           "a card never initialises for a visitor — give the guard an else branch" \
           node scripts/check-card-init.js --changed
  fi
  # tool.html clears the card's container on every navigation, never the
  # document. A modal, a share dialog or a toast a card parks in document.body
  # therefore outlives it and sits over the next tool — and a stale
  # mrprophecy-*.html audio wrapper kept its iframe, and its music, playing.
  # The harness sees only the leftovers its own clicks made, so the rule is
  # static: an append documented.body/head with no removal of the same
  # reference. A transient copy helper, a self-removing toast and a third-party
  # <script src> are the three shapes that stay quiet.
  if [ "$DEEP" = "1" ]; then
    expect "nothing a card adds to the document outlives it (full sweep)" \
           "a node parked in document.body stays over the next tool — append it into the card" \
           node scripts/check-card-leftovers.js --all
  else
    expect "nothing the changed cards add to the document outlives them" \
           "a node parked in document.body stays over the next tool — append it into the card" \
           node scripts/check-card-leftovers.js --changed
  fi
}

links() {
  expect "every internal href/src resolves to a shipped file" \
         "broken internal links — visitors would hit 404s" \
         python3 scripts/check-links.py
}

counts() {
  # cards/ is the single source of truth for the tool count; every published
  # number is a derivation from it. Drift is re-derived in place rather than
  # failed: a hand-edited count is never required, ever.
  if python3 scripts/sync-counts.py --check >/dev/null 2>&1; then
    ok "every published count matches the cards/ folder"
  else
    note "count drift — re-deriving from the cards/ folder"
    if python3 scripts/sync-counts.py && python3 scripts/sync-counts.py --check >/dev/null 2>&1; then
      ok "counts re-derived — commit the updated files"
    else
      fail "counts could not be re-derived — inspect the sync-counts.py output"
    fi
  fi
}

seo() {
  expect "no top-level page is missing a <title>" \
         "SEO regressions — see the warnings above" \
         python3 scripts/scan-seo.py
}

lantern() {
  # Runs the shipped engine, not a copy of it: the chunker cannot hang or lose
  # text, safeEval is not a code-execution hole, dates clamp, and every
  # helpline in the duty registry is populated and looks like a real UK number.
  expect "Lantern engine contracts hold (chunker, tools, guard, duty of care)" \
         "Lantern regression — see scripts/tests/lantern-core.test.js" \
         node scripts/tests/lantern-core.test.js
}

# ---------------------------------------------------------------------------
# --deep: shared infrastructure audits and the CI gate
# ---------------------------------------------------------------------------

deep_card_safety() {
  expect "every network-touching card is a classified, reviewed exception" \
         "unclassified card egress — see the check-egress.py header" \
         python3 scripts/check-egress.py
  expect "labels resolve, images have alt text, _blank is safe, every click target is focusable" \
         "accessibility regressions in cards/ — a control a keyboard cannot reach" \
         python3 scripts/check-a11y.py
  expect "no cross-card top-level name can throw in the shared DOM" \
         "name collision — the second-loaded card would die with a SyntaxError" \
         python3 scripts/check-card-collisions.py
  expect "no card CSS leaks onto the host grid" \
         "card CSS restyles the shared page — run: python3 scripts/scope-card-css.py <slug>" \
         python3 scripts/check-card-css-leaks.py
}

deep_generated() {
  # Every derived surface, checked against the catalogue it is generated from.
  # `npm run build` regenerates all of them; these prove none of them drifted.
  expect "sitemap.xml parses and matches the indexable page set" \
         "sitemap stale — run: python3 scripts/build-sitemap.py" \
         python3 scripts/build-sitemap.py --check
  expect "index.html's pre-rendered first screen matches the catalogue" \
         "stale first screen — run: python3 scripts/build-home-prerender.py" \
         python3 scripts/build-home-prerender.py --check
  expect "embed.html grid matches the catalogue (every tool, true count)" \
         "embed grid drift — run: python3 scripts/build-embed-catalog.py" \
         python3 scripts/build-embed-catalog.py --check
  expect "embed-finance.html matches the catalogue and the finance checks" \
         "embed-finance.html stale — run: python3 scripts/build-embed-landing.py" \
         python3 scripts/build-embed-landing.py --check
  expect "tools.html links every tool in every category" \
         "tools.html is missing tools — run: python3 scripts/build-tools-page.py" \
         python3 scripts/build-tools-page.py --check
  expect "sitemap.html lists every tool, category and machine-readable file" \
         "sitemap.html drift — run: python3 scripts/build-html-sitemap.py" \
         python3 scripts/build-html-sitemap.py --check
  expect "related.json has one ranked entry per tool" \
         "related.json drift — run: python3 scripts/build-related.py" \
         python3 scripts/build-related.py --check
  expect "tools/ deep pages match scripts/tool-pages.json" \
         "tools/ pages drifted — run: python3 scripts/build-tool-pages.py" \
         python3 scripts/build-tool-pages.py --check
  expect "machine indexes (tools-index, categories, llms.txt) match the catalogue" \
         "discovery indexes stale — run: npm run build" \
         node scripts/build-tools-index.js --check
  expect "category pages match the catalogue" \
         "category pages stale — run: node scripts/build-category-pages.js" \
         node scripts/build-category-pages.js --check
  expect "llms.txt / llms-full.txt / tools-index.html match the catalogue" \
         "AI indexes stale — run: node scripts/generate-ai-index.js" \
         node scripts/generate-ai-index.js --check
  expect "per-tool machine specs (api/tools*.json) match the catalogue" \
         "per-tool specs stale — run: node scripts/build-tool-specs.js" \
         node scripts/build-tool-specs.js --check
  expect "no dead ends and no orphans: every tool link lands, every tool is linked" \
         "tool graph broken — a click from a static page would land nowhere" \
         python3 scripts/check-tool-graph.py
  # The homepage's CSS is split into a render-blocking half and a deferred half.
  # That is only safe while the deferred half styles nothing the first paint can
  # show; ARCHITECTURE.md has always promised this guard runs, and until now
  # nothing called it.
  expect "the homepage CSS split is still safe (deferred half styles nothing above the fold)" \
         "critical-CSS regression — see scripts/check-critical-css.py" \
         python3 scripts/check-critical-css.py
  # agents.html is the contract an agent writes its parser from, and it is the
  # one surface no generator owns: its JSON samples were showing a count from
  # three catalogue-generations ago, a key name the files do not use, and three
  # slugs that are not tools.
  expect "agents.html's JSON samples match the files they describe" \
         "agents.html documents a shape the files do not have — see scripts/check-agents-docs.py" \
         python3 scripts/check-agents-docs.py
  # sync-counts.py owns every category number; nothing owned a category list.
  expect "index.html and ARCHITECTURE.md enumerate every category in the catalogue" \
         "a category list drifted — run: python3 scripts/build-category-lists.py" \
         python3 scripts/build-category-lists.py --check
  # sync-counts owns every count; nothing owned a size. explore.js was described
  # as 27 KB in the architecture document while being 47.9 KB on disk.
  expect "prose that says how big a file is matches the file" \
         "a size claim drifted — see scripts/check-size-claims.py" \
         python3 scripts/check-size-claims.py
}

deep_tests() {
  # An explicit glob, not `node --test scripts/tests/`: Node treats a bare
  # directory argument as a module to load and dies with MODULE_NOT_FOUND.
  expect "the product test suite passes (homepage, loader, tool shell, QR, monitor)" \
         "product regression — read the failing test above" \
         bash -c 'node --test scripts/tests/*.test.js' 
}

deep_floors() {
  expect "Lantern quality: every measured floor met (retrieval, tools, guard, duty)" \
         "Lantern quality floor breached — see scripts/evaluate-lantern.js" \
         node scripts/evaluate-lantern.js
  expect "YMYL checks: BMI WHO bands, deposit cap rule, caveats" \
         "YMYL regression — see scripts/check-ymyl.js" \
         node scripts/check-ymyl.js
  expect "no thin-content page is published as a tool" \
         "thin content — see scripts/check-thin-content.py" \
         python3 scripts/check-thin-content.py
  expect "growth surfaces are intact (no fake urgency, no dark patterns)" \
         "growth-surface regression — see scripts/check-growth.py" \
         python3 scripts/check-growth.py
  expect "finance surfaces keep their disclaimers and sources" \
         "finance regression — see scripts/check-finance.js" \
         node scripts/check-finance.js
  # brand/measure.py answers "does the hero fit at 360 px?" without a browser,
  # and it measures strings READ OUT OF index.html. When those were six
  # constants in the tool, two silently went stale and it spent months
  # measuring "Search 1220 tools…" against a page that said 1250. This asserts
  # it can still find the copy, so going stale is a failed check rather than
  # a plausible-looking table of widths.
  expect "brand/measure.py still points at copy index.html carries" \
         "measure.py is measuring copy the site does not have — see brand/measure.py" \
         python3 brand/measure.py --check
  # brand/check-mark.py proves every shipped brand file is still ONE drawing:
  # logo-mark.svg, favicon.svg and the mono SVGs byte-exact to brand/mark.py,
  # both lockups carrying the exact mark with an outlined wordmark, and the
  # PNG icons sampled (zlib, no Pillow) where the star, brackets, tile and
  # corners must be. It is stdlib-only and takes a third of a second, but it
  # only has something to say when somebody touches brand/, so it lives in
  # --deep, which CI runs on every push. Added 2026-09-24 with the redraws.
  expect "the brand assets are all still the same drawing" \
         "brand drift — the SVGs and the rasters disagree; see brand/check-mark.py" \
         python3 brand/check-mark.py
}

live() {
  local n
  n=$(curl -s --max-time 20 https://www.themostusefulsiteintheworld.com/cards/cards.json 2>/dev/null \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d if isinstance(d, list) else d.get("cards", [])))' 2>/dev/null || echo ERR)
  if [ "$n" = "ERR" ] || [ -z "$n" ]; then
    note "could not read the live card count (offline, or the site is down)"
  else
    ok "live card count: $n"
  fi
}

# ---------------------------------------------------------------------------

T_START=$(now_ms)
printf '\033[1mverify.sh\033[0m — %s\n' "$([ "$DEEP" = "1" ] && echo "gate + deep audits" || echo "the 7-check gate")"

check "hygiene: secrets, placeholders, rel=noopener" hygiene
check "catalogue consistency"                      catalogue
check "card JavaScript syntax"                     card_js
check "internal links"                             links
check "published tool counts"                      counts
check "top-level SEO"                              seo
check "Lantern engine contracts"                   lantern

if [ "$DEEP" = "1" ]; then
  check "card safety audits (egress, a11y, collisions, CSS leaks)" deep_card_safety
  check "generated surfaces (drift)"                              deep_generated
  check "product test suite"                                      deep_tests
  check "measured quality floors"                                 deep_floors
fi

[ "$LIVE" = "1" ] && { section "the deployed site"; live; }

T_END=$(now_ms)
WALL=$(( (T_END - T_START) ))

# Slowest three, so the next slowdown is obvious instead of a mystery.
printf '\n== timing — %s.%ss for %d checks ==\n' \
  "$(( WALL / 1000 ))" "$(printf '%03d' $(( WALL % 1000 )) | sed 's/0*$//;s/^$/0/')" "${#NAMES[@]}"
if [ "${#NAMES[@]}" -gt 0 ]; then
  for i in "${!NAMES[@]}"; do printf '%d %s\n' "${MS[$i]}" "${NAMES[$i]}"; done \
    | sort -rn | head -3 | while read -r ms name; do
        printf '   slowest  %s.%ss  %s\n' "$(( ms / 1000 ))" "$(printf '%03d' $(( ms % 1000 )) | cut -c1)" "$name"
      done
fi

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  printf '\033[31mVERIFY FAILED\033[0m — %d check(s) failed, %d note(s). Fix them before pushing.\n' "$FAILS" "$NOTES"
  exit 1
fi
if [ "$DEEP" = "1" ]; then
  printf '\033[32mVERIFY PASSED\033[0m — gate and deep audits, %d note(s). Safe to push.\n' "$NOTES"
else
  printf '\033[32mVERIFY PASSED\033[0m — the gate, %d note(s). Use --deep for shared infrastructure changes (AGENTS.md §1); CI runs it too.\n' "$NOTES"
fi
