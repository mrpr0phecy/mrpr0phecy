#!/usr/bin/env bash
# verify.sh — pre-push guardrails for mrpr0phecy/mrpr0phecy.
#
# Usage:
#   bash scripts/verify.sh           # local checks (sparse-checkout safe)
#   bash scripts/verify.sh --live    # also curl the production site
#
# Environment:
#   VERIFY_FULL=1   exhaustive mode — section 8 runs the full ~1,200-card JS
#                   sweep instead of the sampled fast path.
#   VERIFY_JOBS=N   how many independent sections may run at once (default
#                   min(nproc, 6); the section that self-heals counts stays
#                   serial because it writes files other sections read).
#                   VERIFY_JOBS=1 reproduces the old serial, ordered output.
#
# The run ends with a timing table (wall, total check time, slowest sections)
# so "what is making the suite slow" is answered by reading the output.
# ~13 s on two cores as of 2026-09-20; it was ~34 s serial.
#
# Checks (each FAIL sets exit code 1):
#   1. catalogue consistency  — scripts/check-cards.py
#   2. placeholder IDs        — no VIDEO_ID/PLAYLIST_ID/dQw4w9WgXcQ/YOUR_ in *.html
#   3. target=_blank links    — must carry rel="noopener ..."
#   4. sitemap.xml             — parses and is non-empty
#   5. top-level SEO scan     — scripts/scan-seo.py
#   6. secret scan            — no obvious GitHub tokens in tracked files
#   7. git state              — uncommitted changes reported (not failed)
#   8. card JavaScript        — scripts/check-card-js.py (needs node)
#   9. tool-count claims      — scripts/sync-counts.py --check, plus
#                               generate-cards-json.js --check (cards.json must
#                               match the card files) and
#                               scripts/generate-ai-index.js --check so the
#                               llms.txt / llms-full.txt / tools-index.html
#                               machine indexes cannot drift from cards.json
#  10. sitemap freshness      — scripts/build-sitemap.py --check
#  11. card accessibility     — scripts/check-a11y.py
#  12. site brain              — repo-grounded index and grounding regressions
#  13. staff facility          — configuration and isolated regression tests
#  14. card name collisions   — scripts/check-card-collisions.py (no cross-card top-level SyntaxError)
#                               + scripts/check-card-css-leaks.py (no fragment CSS restyles the host grid)
#  15. home first screen      — scripts/build-home-prerender.py --check, the
#                                loader tests in scripts/tests/ that drive the real
#                                functions out of home-app.js (lazy-loader,
#                                home-fast-path, lite-tier) and sw.js's fetch
#                                handler (service-worker: a stale cached
#                                catalogue must never beat the deployed one) and the
#                                split itself (app-split: the core must run, and ask
#                                for home-features.js, without it), plus
#                                scripts/check-critical-css.py — home.css may only
#                                hold first-paint rules and must keep the rules
#                                that hide the deferred containers, so the split
#                                cannot silently reintroduce a blocking 118 KB
#  16. input egress           — scripts/check-egress.py: every network-touching
#                               card must be a reviewed, classified exception, and
#                               the QR generator must stay fully local (functional
#                               tests in scripts/tests/qrtool-local.test.js).
#                               Also: the prerendered tools/ pages must match
#                               scripts/build-tool-pages.py's output exactly
#                               (scripts/build-tool-pages.py --check) and pass
#                               scripts/tests/tool-pages.test.js — including
#                               that their visible FAQ text and their FAQPage
#                               structured data are the same words
#  17. internal links         — scripts/check-links.py: every href/src in real
#                               markup resolves to a file that exists, plus the
#                               risk-notice mapping contract
#                               (scripts/tests/risk-notices.test.js)
#   18. embed catalogue        — scripts/build-embed-catalog.py --check: the
#                               embed.html grid must hold every card in
#                               cards.json with live descriptions and the true
#                               "All N" count (it is a derived artifact, like
#                               the sitemap)
#   19. measurement contract   — staff/scoreboard.json has separate product
#                               outcomes, named instruments, guardrails and no
#                               invented baselines
#   20. production monitor     — scripts/tests/production-monitor.test.js drives
#                               the real monitor functions against a local
#                               fixture server (offline: the live probe runs in
#                               .github/workflows/production-monitor.yml) and
#                               proves the recovery plan changes nothing
#   21. Lantern (ai.html)      — scripts/tests/lantern-core.test.js drives the
#                               real engine out of the shipped page, and
#                               scripts/evaluate-lantern.js measures retrieval,
#                               tools, guard and the duty-of-care layer against
#                               its own floors (24 of them, exits non-zero
#                               below any floor)
#
#  22. discovery surfaces     — tools.html, sitemap.html and related.json are
#                               generated from cards/ (build-tools-page.py,
#                               build-html-sitemap.py, build-related.py — each
#                               answers --check), and check-tool-graph.py
#                               resolves the whole click graph a visitor can
#                               take: static page -> tool.html -> cards.json ->
#                               the card file -> the card's real <title> ->
#                               tools-index.json -> the category page ->
#                               api/tools.json. These three files were
#                               hand-maintained and drifted to 532, 1,061 and
#                               533 of 1,195 tools; that drift is what made
#                               tools "not come up" from the main page.
#  23. card runtime           — scripts/check-card-runtime.py injects every
#                               card through the real renderCardContent() path
#                               and fails on the ones whose JavaScript throws.
#                               Section 8 only proves the block parses; a card
#                               can parse cleanly and still die on its first
#                               statement (a renamed element id, a variable
#                               declared in the wrong function, a container
#                               overwritten and then queried). Forty-three cards
#                               shipped in that state — they painted their face
#                               on the home page and did nothing when clicked
#                               (the full list is in check-card-runtime.py).
#                               Needs jsdom; without it the check prints a NOTE
#                               and passes, like section 8 without node.
#
# Speed model (2026-09-19, retimed 2026-09-20):
#   * The default run is the fast path — every check below is incremental or
#     fingerprinted, and independent sections run in parallel, so a routine
#     verify takes ~13s on two cores (~34s serial; it was ~3 minutes):
#       - check-card-js.py syntax-checks changed cards only (untracked cards
#         included); the full 1,200-card sweep runs under VERIFY_FULL=1 and is
#         single-process now anyway (~1s).
#       - build-site-brain.py --check returns in milliseconds when its input
#         fingerprint (cards.json, public docs, approved learning, and the
#         script's own code) matches the stored index; it rebuilds only when
#         an input actually changed.
#   * VERIFY_FULL=1 bash scripts/verify.sh  — the exhaustive gate (full card
#     JS sweep). CI's on-demand full run (workflow_dispatch full=true) should
#     set this so CI stays strict even though the push-time run is fast.
#   * Section timings are printed at the end, slowest first, so the next
#     slowdown is obvious instead of a mystery. Both stamps are taken inside the
#     child process: `wait` returns in launch order, so an end-time stamped in
#     the parent charges every section that shares a slot with a slow neighbour
#     (section 21 once "reported" 6.15s for 0.46s of work, which sent the search
#     for a phantom slowdown into entirely the wrong file).
#   * Verdicts are counted with `grep -c -F` on the raw ESC byte. Without -F
#     grep reads that byte as an open bracket expression, exits 2, and every
#     section reports zero failures — the suite then passes no matter what.
#   * Tool counts are self-healing (section 9): the cards/ folder is the one
#     source of truth, and a drifted published number is re-derived in place
#     instead of failing the gate. No card number is ever hand-edited.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
LIVE=0; [ "${1:-}" = "--live" ] && LIVE=1
FULL=0; [ "${VERIFY_FULL:-0}" = "1" ] && FULL=1
FAILS=0; NOTES=0
# ---------------------------------------------------------------------------
# Sections run as functions, not as top-level code, so independent ones can run
# in parallel: 21 sequential checks that average ~1.3 s each is a 30 s gate no
# matter how fast each check is, and the slowest five were all independent of
# their neighbours. Output is captured per section and replayed in order, so a
# parallel run reads exactly like the serial one did.
#
#   VERIFY_JOBS=1 bash scripts/verify.sh   # force the old serial behaviour
#
# Anything that *writes* to the repository (section 9's self-healing count
# re-derivation) stays in SERIAL_SECTIONS so it can never race a reader.
TMPD=$(mktemp -d "${TMPDIR:-/tmp}/verify.XXXXXX") || exit 1
trap 'rm -rf "$TMPD"' EXIT
JOBS="${VERIFY_JOBS:-}"
if [ -z "$JOBS" ]; then
  JOBS=$( (command -v nproc >/dev/null 2>&1 && nproc) || echo 2 )
  [ "$JOBS" -gt 6 ] && JOBS=6
  [ "$JOBS" -lt 1 ] && JOBS=1
fi
SERIAL_SECTIONS="9"

SEC_NAMES=(); SEC_MS=()
FAILS=0; NOTES=0

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
note() { printf '  \033[33mNOTE\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; }

# Count the OK/NOTE/FAIL markers in a section's captured output. Verdicts used
# to be counted by incrementing FAILS/NOTES inside the section itself, which
# cannot work once a section runs in a subshell — the increments die with it.
# -F is load-bearing: the raw ESC byte starts a bracket expression as far as
# grep is concerned, so without it grep exits 2 ("Unmatched [") and every
# section reported zero failures. A gate that cannot fail is worse than none.
count_verdicts() {
  local colour="$1" file="$2" marker n
  marker=$(printf '\033[%sm' "$colour")
  n=$(grep -c -F -- "$marker" "$file" 2>/dev/null) || n=0
  printf '%s' "$n"
}

now_ms() {
  # date +%s%N is GNU; fall back to whole seconds where it is not.
  local n
  n=$(date +%s%N 2>/dev/null)
  case "$n" in *N*|"") echo $(( $(date +%s) * 1000 )) ;; *) echo $(( n / 1000000 )) ;; esac
}

run_section() {
  local name="$1" key="$2"; shift 2
  local out="$TMPD/out.$key" rc t0 t1 ms nfail nnote
  t0=$(now_ms)
  section "$name"
  ( "$@" ) >"$out" 2>&1
  rc=$?
  t1=$(now_ms); ms=$(( t1 - t0 ))
  cat "$out"
  nfail=$(count_verdicts 31 "$out")
  nnote=$(count_verdicts 33 "$out")
  FAILS=$(( FAILS + nfail ))
  NOTES=$(( NOTES + nnote ))
  SEC_NAMES+=("$name"); SEC_MS+=("$ms")
  return $rc
}

# Start one section in the background. `key` is the section number; every
# artefact of the run is a small file in $TMPD so the parent can replay the
# section (header, output, verdict, timing) in order once it finishes.
start_bg() {
  local name="$1" key="$2"; shift 2
  # t0 is stamped *inside* the child: stamping it in the parent measures how
  # long the section waited for a job slot, which reported 8.5 s for every
  # section of a 10 s run.
  # Both timestamps are stamped inside the child. Stamping t1 in the parent
  # (after `wait`) charges a section for the time it spent finished-but-not-yet
  # collected — the collector replays sections in launch order, so every
  # section that shared a slot with a slow one reported the slow one's
  # duration and the "slowest sections" list was fiction.
  { now_ms > "$TMPD/t0.$key"; "$@"; now_ms > "$TMPD/t1.$key"; } > "$TMPD/raw.$key" 2>&1 &
  local pid=$!
  echo "$name" > "$TMPD/name.$key"
  # Indexed by section number, NOT appended: `BG_PIDS+=("$pid")` puts the pid
  # at the next free *index*, so section 20's pid landed at index 9 and every
  # lookup after the first few collected the wrong job (which is how section
  # 22 managed to print its header and no output at all).
  BG_KEYS+=("$key"); BG_PIDS["$key"]=$pid
}

# Print one finished background section and fold its verdicts into the totals.
collect_bg() {
  local key="$1" rc=0 nfail nnote pid="${BG_PIDS[$1]-}"
  [ -n "$pid" ] && { wait "$pid" 2>/dev/null || rc=$?; }
  # Header and body are replayed together, in launch order, so a parallel run
  # reads exactly like the serial one did (a header printed at launch time
  # would be separated from its output by every other section's output).
  section "$(cat "$TMPD/name.$key")"
  cat "$TMPD/raw.$key"
  nfail=$(count_verdicts 31 "$TMPD/raw.$key")
  nnote=$(count_verdicts 33 "$TMPD/raw.$key")
  FAILS=$(( FAILS + nfail ))
  NOTES=$(( NOTES + nnote ))
  # Not `$(( $(now_ms) - $(cat …) ))`: bash parses that as a *command*
  # substitution running `now_ms - <number>`, so every section reported the
  # same nonsense duration. Two assignments, then the arithmetic.
  local t1 t0
  t0=$(cat "$TMPD/t0.$key" 2>/dev/null) || t0=0
  t1=$(cat "$TMPD/t1.$key" 2>/dev/null) || t1=$t0
  SEC_NAMES+=("$(cat "$TMPD/name.$key")")
  SEC_MS+=( $(( t1 - t0 )) )
  return $rc
}

# (flush_timing is gone: "$($(date +%s) - PREV_T)" expanded to
#  "<epoch> - <epoch>" and bash then tried to *run* the epoch as a command —
#  "1789871155: command not found" on every single run, and the last section's
#  time was never recorded. Section timing now lives in run_section, in ms.)

section_1() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-cards.py; then ok "catalogue coherent"; else fail "catalogue incoherent"; fi
  else
    note "python3 not available — skipped"
  fi
  if command -v node >/dev/null 2>&1; then
    if node generate-cards-json.js --check; then
      ok "cards.json matches the card files"
    else
      fail "catalogue metadata drift — run: node generate-cards-json.js"
    fi
  else
    note "node not available — catalogue drift check skipped"
  fi
}

section_2() {
  # Hard placeholders anywhere; YOUR_ only inside URLs/attributes (demo text
  # like 'YOUR_SYSTEM_PROMPT' in the prompt-injection lab is legitimate content).
  PH="dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|(src|href)=['\"][^'\"]*YOUR_"
  HITS=$(grep -rlE "$PH" --include='*.html' --exclude-dir=ai-developer --exclude-dir=.git . 2>/dev/null || true)
  if [ -n "$HITS" ]; then fail "placeholder IDs found: $(echo "$HITS" | tr '\n' ' ')"; else ok "none"; fi
}

section_3() {
  BAD=$(grep -rn --include='*.html' --exclude-dir=ai-developer --exclude-dir=.git -E '<a [^>]*target="_blank"' . 2>/dev/null | grep -v 'noopener' || true)
  if [ -n "$BAD" ]; then fail "$(echo "$BAD" | head -5)"; else ok "all covered"; fi
}

section_4() {
  # A one-liner, not a here-doc: every section body now lives inside a
  # function and is indented, and bash only accepts a here-doc terminator at
  # column 0 (the indented `PY` silently swallowed the rest of the script).
  # It also parsed the file twice before — once to test, once to count.
  local entries
  entries=$(python3 -c "import xml.etree.ElementTree as E; print(len(list(E.parse('sitemap.xml').getroot())))" 2>/dev/null) || entries=""
  if [ -n "$entries" ] && [ "$entries" -gt 0 ] 2>/dev/null; then
    ok "parses, entries: $entries"
  else
    fail "missing or empty"
  fi
}

section_5() {
  if python3 scripts/scan-seo.py; then ok "no missing <title>"; else fail "see warnings above"; fi
}

section_6() {
  # Patterns are assembled at runtime so this script does not match itself.
  P1="gh""o_"; P2="gh""p_"; P3="github""_pat_"; P4="gh""s_"
  if grep -rnE "$P1|$P2|$P3|$P4" --exclude-dir=.git --exclude-dir=ai-developer . 2>/dev/null | grep -v '^Binary' | head -5 | grep -q .; then
    fail "possible token in repo — scrub immediately"
  else
    ok "none"
  fi
}

section_7() {
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    note "uncommitted changes present — commit before pushing"
  else
    ok "working tree clean"
  fi
}

section_8() {
  if command -v node >/dev/null 2>&1; then
    if [ "$FULL" = "1" ]; then
      if python3 scripts/check-card-js.py --all; then ok "every card's JS parses (full sweep)"; else fail "a card would be dead in production"; fi
    else
      # Fast path: only cards changed vs HEAD (untracked ones included). The
      # sweep is a single node process now, so the full version is cheap too —
      # it still earns its keep under VERIFY_FULL=1, and the changed-only mode
      # keeps a docs-only verify at a fraction of a second.
      if python3 scripts/check-card-js.py; then ok "changed cards' JS parses (VERIFY_FULL=1 for a full sweep)"; else fail "a card would be dead in production"; fi
    fi
  else
    note "node not available — skipped"
  fi
}

section_9() {
  # The cards/ folder is the single source of truth for the tool count. Every
  # published number (48 files, hero badges, docs, JSON-LD…) is a derivation
  # from it. If a claim has drifted, re-derive in place instead of failing —
  # a hand-edited card number is never required, ever.
  if python3 scripts/sync-counts.py --check >/dev/null 2>&1; then
    ok "every count claim matches the cards/ folder"
  else
    note "count drift detected — re-deriving from the cards/ folder"
    if python3 scripts/sync-counts.py && python3 scripts/sync-counts.py --check >/dev/null 2>&1; then
      ok "counts re-derived from the cards/ folder — commit the updated files"
    else
      fail "counts could not be re-derived — inspect sync-counts.py output"
    fi
  fi
  if command -v node >/dev/null 2>&1; then
    if node scripts/build-tools-index.js --check     && node scripts/build-category-pages.js --check     && node scripts/generate-ai-index.js --check; then
      ok "machine indexes (tools-index.json, categories, llms.txt, llms-full.txt, tools-index.html) match the catalogue"
    else
      fail "discovery indexes or category pages stale — run: node scripts/build-tools-index.js && node scripts/build-category-pages.js && node scripts/generate-ai-index.js"
    fi
    if node scripts/build-tool-specs.js --check; then
      ok "per-tool machine specs (api/tools.json + api/tools/*.json) match the catalogue"
    else
      fail "per-tool specs stale — run: node scripts/build-tool-specs.js"
    fi
  else
    note "node not available — machine index check skipped"
  fi
}

section_10() {
  if python3 scripts/build-sitemap.py --check; then ok "sitemap matches tracked indexable pages"; else fail "sitemap stale — run: python3 scripts/build-sitemap.py"; fi
}

section_11() {
  if python3 scripts/check-a11y.py; then ok "labels resolve, images have alt, _blank is safe"; else fail "accessibility regressions in cards/"; fi
}

section_12() {
  if python3 scripts/build-site-brain.py --check \
    && python3 scripts/evaluate-site-brain.py; then
    ok "repo-grounded knowledge index and retrieval cases are current"
  else
    fail "site brain stale or retrieval regression — rebuild and inspect learning/evaluation.json"
  fi
}

section_13() {
  if command -v node >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    if node scripts/ai-developer.js check \
      && node --test scripts/tests/staff-*.test.js \
      && python3 -m unittest discover -s staff/tests -p 'test_*.py' \
      && python3 scripts/check-growth.py \
      && python3 scripts/check-scoreboard.py; then
      ok "staff gates, measurement contract, safe fixes, draft quarantine, reports, coordination and growth surfaces tested"
    else
      fail "staff facility regression — inspect the failing test"
    fi
  else
    fail "Node 22+ and Python 3 are required to verify the staff facility"
  fi
}

section_14() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-card-collisions.py; then
      ok "no cross-card top-level name can throw in the shared DOM"
    else
      fail "cross-card top-level name collision — the second-loaded card would die with a SyntaxError"
    fi
  else
    note "python3 not available — skipped"
  fi

  # A card's <style> must not restyle the host shell. A bare `.card {…}` or
  # `body {…}` in a fragment repaints all ~1,200 cards on index.html the moment
  # it scrolls in — the "grid suddenly looks broken / cards vanish" report.
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-card-css-leaks.py; then
      ok "no card CSS leaks onto the host grid"
    else
      fail "card CSS restyles the shared page — run: python3 scripts/scope-card-css.py <slug>"
    fi
  fi
}

section_15() {
  if python3 scripts/build-home-prerender.py --check; then
    ok "pre-rendered first screen matches the catalogue"
  else
    fail "index.html's generated first screen is stale — run: python3 scripts/build-home-prerender.py"
  fi
  # These drive the real loader functions extracted from home-app.js (the
  # externalised homepage application). lazy-loader was written for the
  # lazy-loading rework but nothing ever ran it — verify.sh only picked up
  # staff-*.test.js, so a card-loader regression could ship green.
  # One `node --test` invocation runs the whole suite (it used to be seven
  # sequential node processes; the suite's semantics are unchanged — any
  # failing file still fails the gate).
  if command -v node >/dev/null 2>&1; then
    if node --test scripts/tests/lazy-loader.test.js scripts/tests/home-fast-path.test.js \
      scripts/tests/lite-tier.test.js scripts/tests/card-faces.test.js \
      scripts/tests/live-window.test.js scripts/tests/service-worker.test.js \
      scripts/tests/app-split.test.js; then
      ok "card loader, first-screen fast path, two-tier catalogue, card faces, the live window, cache policy and the on-demand bundle behave as shipped"
    else
      fail "card loader regression — see the failing assertion above"
    fi
  else
    note "node not available — card loader tests skipped"
  fi
  # The main page's stylesheet is split: home.css blocks the first paint and
  # home-deferred.css must style only containers that are hidden until asked for.
  # If the split rots, the page silently goes back to a blocking 118 KB payload.
  if python3 scripts/check-critical-css.py; then
    ok "main-page stylesheet split holds every first-paint rule in the blocking file; document inline scripts parse"
  else
    fail "main-page stylesheet split broken — see scripts/check-critical-css.py"
  fi
}

section_16() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-egress.py; then
      ok "every network-touching card is a classified, reviewed exception"
    else
      fail "unclassified card egress — see scripts/check-egress.py header"
    fi
  else
    note "python3 not available — skipped"
  fi
  if command -v node >/dev/null 2>&1; then
    if node scripts/tests/qrtool-local.test.js; then
      ok "QR generator renders locally (matrix, SVG, PDF, ZIP) with no egress"
    else
      fail "qrtool regression — it must stay 100% on-device"
    fi
    if node scripts/tests/risk-notices.test.js; then
      ok "risk-notice mapping matches the catalogue and its DOM contract"
    else
      fail "risk-notice regression — see scripts/tests/risk-notices.test.js"
    fi
    if node scripts/tests/tool-shell.test.js; then
      ok "tool.html shell: embed contract honoured, error path inert, metadata set"
    else
      fail "tool.html shell regression — see scripts/tests/tool-shell.test.js"
    fi
    if node scripts/tests/index-deeplink.test.js; then
      ok "index.html deep links: ?q=/?expand= parse safely and stay hooked"
    else
      fail "index deep-link regression — see scripts/tests/index-deeplink.test.js"
    fi
    if node scripts/tests/home-search.test.js; then
      ok "index.html search: both boxes wired to the real grid, no HTML sink, discovery defers to the grid"
    else
      fail "home search regression — see scripts/tests/home-search.test.js"
    fi
    if python3 scripts/build-tool-pages.py --check; then
      ok "tools/ pages: rendered from scripts/tool-pages.json, no drift"
    else
      fail "tools/ pages drifted from scripts/tool-pages.json — run: python3 scripts/build-tool-pages.py"
    fi
    if node scripts/tests/tool-pages.test.js; then
      ok "tools/ pages: live embed, valid JSON-LD, FAQ matches, copy bar, no analytics"
    else
      fail "tool page regression — see scripts/tests/tool-pages.test.js"
    fi
    if node scripts/check-ymyl.js; then
      ok "YMYL checks: BMI WHO bands + deposit cap rule + caveats"
    else
      fail "YMYL regression — see scripts/check-ymyl.js"
    fi
  else
    note "node not available — qrtool/risk-notice/tool-shell/deeplink tests skipped"
  fi
}

section_17() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-links.py; then
      ok "every internal href/src resolves to a shipped file"
    else
      fail "broken internal links — visitors would hit 404s"
    fi
  else
    note "python3 not available — skipped"
  fi
}

section_18() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/build-embed-catalog.py --check; then
      ok "embed.html grid matches the catalogue (every tool, live descriptions, true count)"
    else
      fail "embed.html grid has drifted from cards.json — run: python3 scripts/build-embed-catalog.py"
    fi
  else
    note "python3 not available — skipped"
  fi
}

section_19() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/check-scoreboard.py; then
      ok "scoreboard names instruments, guardrails and honest unknowns"
    else
      fail "measurement contract is incomplete — inspect staff/scoreboard.json"
    fi
  else
    note "python3 not available — skipped"
  fi
}

section_20() {
  if command -v node >/dev/null 2>&1; then
    # Offline by design: the suite serves a miniature repository from 127.0.0.1
    # and drives the shipped functions out of scripts/check-production.js, so a
    # monitor that silently stopped detecting drift fails here. The real probe
    # runs post-deploy and every six hours in production-monitor.yml.
    if node scripts/tests/production-monitor.test.js; then
      ok "monitor detects stale deploys, broken 404s and catalogue drift; rollback plan is inert"
    else
      fail "production monitor regression — the live site would drift unnoticed"
    fi
  else
    note "node not available — production monitor tests skipped"
  fi
}

section_21() {
  if command -v node >/dev/null 2>&1; then
    # Both of these run the shipped engine, not a copy of it. The test pins the
    # structural contracts (the chunker cannot hang or lose text, safeEval is not
    # a code-execution hole, dates clamp, every helpline in the duty registry is
    # populated and looks like a real UK number); the evaluator pins the measured
    # ones (retrieval quality, tool accuracy, guard precision, and a duty layer
    # that fires on 51 real emergencies and stays silent on 51 benign questions
    # plus 162 it has never seen).
    if node scripts/tests/lantern-core.test.js; then
      ok "Lantern engine: chunker terminates and loses nothing, tools compute, guard and duty contracts hold"
    else
      fail "Lantern engine regression — see scripts/tests/lantern-core.test.js"
    fi
    if node scripts/evaluate-lantern.js; then
      ok "Lantern quality: all floors met (retrieval, tools, guard, duty of care)"
    else
      fail "Lantern quality floor breached — see scripts/evaluate-lantern.js"
    fi
  else
    note "node not available — Lantern engine and quality gates skipped"
  fi
}


section_22() {
  if command -v python3 >/dev/null 2>&1; then
    if python3 scripts/build-tools-page.py --check; then
      ok "tools.html links every tool in every category"
    else
      fail "tools.html (the footer's Index) is missing tools — run: python3 scripts/build-tools-page.py"
    fi
    if python3 scripts/build-html-sitemap.py --check; then
      ok "sitemap.html lists every tool, every category and every machine-readable file"
    else
      fail "sitemap.html has drifted — run: python3 scripts/build-html-sitemap.py"
    fi
    if python3 scripts/build-related.py --check; then
      ok "related.json has one ranked entry per tool"
    else
      fail "related.json has drifted — run: python3 scripts/build-related.py"
    fi
    if python3 scripts/check-tool-graph.py; then
      ok "no dead ends and no orphans: every tool link lands, every tool is linked"
    else
      fail "tool graph broken — a click from a static page would land nowhere"
    fi
  else
    note "python3 not available — discovery surfaces skipped"
  fi
}

section_23() {
  # Section 8 proves a card's JavaScript parses. This proves it runs: a block
  # can be perfectly valid and still throw the instant the home page injects
  # it, which is the "tool is on the page but does nothing when I click it"
  # failure mode. Forty-three cards shipped that way. The sweep injects each
  # card through the real renderCardContent() path, including home-app.js's own
  # transformCardScript() rewrite. Cards that do network work get a longer
  # settle, because a card can throw only after its request times out.
  #
  # Needs jsdom. check-card-runtime.py exits 0 with a NOTE when node or jsdom
  # is missing, so it never blocks a machine that lacks them — but a skipped
  # sweep proves nothing, and CI is exactly such a machine. Reporting that as
  # OK would put a green tick next to a check that never ran, which is how 26
  # dead cards went unnoticed in the first place. So the skip is a NOTE, and
  # the exhaustive CI job installs jsdom so the guard genuinely runs there.
  if ! command -v node >/dev/null 2>&1; then
    note "node not available — card runtime sweep skipped"
    return 0
  fi
  local out rc
  if [ "$FULL" = "1" ]; then
    out=$(python3 scripts/check-card-runtime.py --all 2>&1); rc=$?
  else
    out=$(python3 scripts/check-card-runtime.py 2>&1); rc=$?
  fi
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ]; then
    fail "a card loads and then does nothing when clicked"
  elif printf '%s\n' "$out" | grep -q '^NOTE:'; then
    note "card runtime sweep skipped — jsdom not installed (npm i jsdom)"
  elif [ "$FULL" = "1" ]; then
    ok "every card runs without throwing (full runtime sweep)"
  else
    ok "changed cards run without throwing (VERIFY_FULL=1 for a full sweep)"
  fi
}

ALL_SECTIONS=(1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23)

section_title() {
  case "$1" in
    1) printf '%s' "catalogue consistency (check-cards.py)" ;;
    2) printf '%s' "placeholder IDs in *.html" ;;
    3) printf '%s' "target=_blank links without rel=noopener" ;;
    4) printf '%s' "sitemap.xml" ;;
    5) printf '%s' "top-level SEO scan (scan-seo.py)" ;;
    6) printf '%s' "sensitive strings in tracked files" ;;
    7) printf '%s' "git state" ;;
    8) printf '%s' "card JavaScript syntax (check-card-js.py)" ;;
    9) printf '%s' "tool-count claims (sync-counts.py — self-healing)" ;;
    10) printf '%s' "sitemap freshness (build-sitemap.py)" ;;
    11) printf '%s' "card accessibility (check-a11y.py)" ;;
    12) printf '%s' "site brain index and grounding" ;;
    13) printf '%s' "staff facility configuration and regression tests" ;;
    14) printf '%s' "card top-level name collisions (check-card-collisions.py)" ;;
    15) printf '%s' "home page first screen and card loader" ;;
    16) printf '%s' "input egress and the local QR generator" ;;
    17) printf '%s' "internal links (check-links.py)" ;;
    18) printf '%s' "embed catalogue (build-embed-catalog.py)" ;;
    19) printf '%s' "measurement contract" ;;
    20) printf '%s' "production monitor and recovery tooling" ;;
    21) printf '%s' "Lantern engine and duty of care (ai.html)" ;;
    22) printf '%s' "static discovery surfaces and the tool link graph" ;;
    23) printf '%s' "card runtime (check-card-runtime.py)" ;;
  esac
}

# Print finished background sections in the order they were started. With
# wait_any=1, block until the oldest one has finished (that is what bounds the
# number of concurrent jobs); with wait_any=0, drain everything left.
drain_bg() {
  local wait_any="$1"
  while [ "${#BG_KEYS[@]}" -gt 0 ]; do
    local head="${BG_KEYS[0]}" head_pid="${BG_PIDS[${BG_KEYS[0]}]-}"
    if [ -n "$head_pid" ] && kill -0 "$head_pid" 2>/dev/null; then
      # wait_any=1 means "block until the oldest job finishes" (that is what
      # bounds the number of concurrent jobs); wait_any=0 means "drain
      # everything". The condition used to be inverted here, so the final
      # drain returned immediately and any section still running was
      # "collected" as an empty block — the last section of every parallel
      # run printed its header and nothing else, and its checks never counted.
      wait "$head_pid" 2>/dev/null || true
    fi
    collect_bg "$head" || true
    local rest=("${BG_KEYS[@]:1}")
    BG_KEYS=(${rest[@]+"${rest[@]}"})
    unset "BG_PIDS[$head]"
  done
}

# ---------------------------------------------------------------------------
# Run them. Section 9 can rewrite files in place (its counts are self-healing),
# so it runs alone; everything else only reads, so it runs concurrently and is
# printed in order afterwards. Wall time is the point: the sections were
# independent and the gate was serial.
# BG_KEYS is the ordered list of sections still in flight; BG_PIDS is a sparse
# map from section number to pid (bash 3 has no associative arrays, and
# `set -u` makes an unset index fatal, so every read of it is guarded).
BG_KEYS=(); BG_PIDS=()
RUN_START=$(now_ms)
# 1234 -> "1.234"
fmt_s() { printf '%s.%03d' "$(( $1 / 1000 ))" "$(( $1 % 1000 ))"; }

printf '\n\033[1m== running %d checks (%s parallel, %s serial)\033[0m\n' \
  "${#ALL_SECTIONS[@]}" "$( [ "$JOBS" -gt 1 ] && echo "up to $JOBS" || echo "none" )" \
  "$( [ "$JOBS" -gt 1 ] && echo "section $SERIAL_SECTIONS" || echo "none" )"

for key in "${ALL_SECTIONS[@]}"; do
  is_serial=0
  case " $SERIAL_SECTIONS " in *" $key "*) is_serial=1 ;; esac
  if [ "$is_serial" = "1" ] || [ "$JOBS" -le 1 ]; then
    drain_bg 0
    run_section "$(section_title "$key")" "$key" "section_$key" || true
    continue
  fi
  while :; do
    running=0
    for k in ${BG_KEYS[@]+"${BG_KEYS[@]}"}; do
      pid="${BG_PIDS[$k]-}"
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then running=$((running+1)); fi
    done
    [ "$running" -lt "$JOBS" ] && break
    drain_bg 1
  done
  start_bg "$(section_title "$key")" "$key" "section_$key"
done
drain_bg 0

if [ "$LIVE" = "1" ]; then
  section "live site (Pages, 30-60s after push)"
  for u in "" listen.html cards/cards.json; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://www.themostusefulsiteintheworld.com/$u" || echo "000")
    if [ "$code" = "200" ]; then ok "/$u -> $code"; else fail "/$u -> $code"; fi
  done
  LIVE_N=$(curl -s --max-time 20 https://www.themostusefulsiteintheworld.com/cards/cards.json 2>/dev/null \
           | python3 -c "import json,sys
try: print(len(json.load(sys.stdin)))
except Exception: print('ERR')" 2>/dev/null || echo ERR)
  [ "$LIVE_N" = "ERR" ] && fail "could not read live card count" || ok "live card count: $LIVE_N"
fi

WALL_END=$(now_ms); WALL_MS=$(( WALL_END - RUN_START ))
TOTAL_MS=0
for ms in ${SEC_MS[@]+"${SEC_MS[@]}"}; do TOTAL_MS=$(( TOTAL_MS + ms )); done
printf '\n== timing — wall %ss for %d checks (%ss of check time, %s job slot(s)) ==\n' \
  "$(fmt_s "$WALL_MS")" "${#SEC_NAMES[@]}" "$(fmt_s "$TOTAL_MS")" "$JOBS"
# Slowest first, so the next slowdown is obvious instead of a mystery. A
# section that ran alongside others can take longer than the wall clock; that
# is the point of running them together, and the wall number above is the truth.
for i in ${!SEC_NAMES[@]}; do
  printf '%8d\t%s\n' "${SEC_MS[$i]}" "${SEC_NAMES[$i]}"
done | sort -rn | head -6 | while IFS="$(printf '\t')" read -r ms name; do
  printf '   slowest %6ss  %s\n' "$(fmt_s "$ms")" "$name"
done

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  printf '\033[31mVERIFY FAILED — %d problem(s). Do not push until fixed.\033[0m\n' "$FAILS"
  exit 1
fi
printf '\033[32mVERIFY PASSED\033[0m (%d note(s)). Safe to push.\n' "$NOTES"
exit 0
