#!/usr/bin/env bash
# verify.sh — pre-push guardrails for mrpr0phecy/mrpr0phecy.
#
# Usage:
#   bash scripts/verify.sh           # local checks (sparse-checkout safe)
#   bash scripts/verify.sh --live    # also curl the production site
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
#                               tests in scripts/tests/qrtool-local.test.js)
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
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
LIVE=0; [ "${1:-}" = "--live" ] && LIVE=1
FAILS=0; NOTES=0

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
note() { printf '  \033[33mNOTE\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILS=$((FAILS+1)); }

section "1/21 catalogue consistency (check-cards.py)"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-cards.py; then ok "catalogue coherent"; else fail "catalogue incoherent"; fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
fi
if command -v node >/dev/null 2>&1; then
  if node generate-cards-json.js --check; then
    ok "cards.json matches the card files"
  else
    fail "catalogue metadata drift — run: node generate-cards-json.js"
  fi
else
  note "node not available — catalogue drift check skipped"; NOTES=$((NOTES+1))
fi

section "2/21 placeholder IDs in *.html"
# Hard placeholders anywhere; YOUR_ only inside URLs/attributes (demo text
# like 'YOUR_SYSTEM_PROMPT' in the prompt-injection lab is legitimate content).
PH="dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|(src|href)=['\"][^'\"]*YOUR_"
HITS=$(grep -rlE "$PH" --include='*.html' --exclude-dir=ai-developer --exclude-dir=.git . 2>/dev/null || true)
if [ -n "$HITS" ]; then fail "placeholder IDs found: $(echo "$HITS" | tr '\n' ' ')"; else ok "none"; fi

section "3/21 target=_blank links without rel=noopener"
BAD=$(grep -rn --include='*.html' --exclude-dir=ai-developer --exclude-dir=.git -E '<a [^>]*target="_blank"' . 2>/dev/null | grep -v 'noopener' || true)
if [ -n "$BAD" ]; then fail "$(echo "$BAD" | head -5)"; else ok "all covered"; fi

section "4/21 sitemap.xml"
if python3 - <<'PY' 2>/dev/null
import xml.etree.ElementTree as E
root = E.parse('sitemap.xml').getroot()
n = len(list(root))
exit(0 if n > 0 else 1)
PY
then ok "parses, entries: $(python3 -c "import xml.etree.ElementTree as E;print(len(list(E.parse('sitemap.xml').getroot())))")"
else fail "missing or empty"; fi

section "5/21 top-level SEO scan (scan-seo.py)"
if python3 scripts/scan-seo.py; then ok "no missing <title>"; else fail "see warnings above"; fi

section "6/21 sensitive strings in tracked files"
# Patterns are assembled at runtime so this script does not match itself.
P1="gh""o_"; P2="gh""p_"; P3="github""_pat_"; P4="gh""s_"
if grep -rnE "$P1|$P2|$P3|$P4" --exclude-dir=.git --exclude-dir=ai-developer . 2>/dev/null | grep -v '^Binary' | head -5 | grep -q .; then
  fail "possible token in repo — scrub immediately"
else
  ok "none"
fi

section "7/21 git state"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  note "uncommitted changes present — commit before pushing"; NOTES=$((NOTES+1))
else
  ok "working tree clean"
fi

section "8/21 card JavaScript syntax (check-card-js.py)"
if command -v node >/dev/null 2>&1; then
  if python3 scripts/check-card-js.py --all; then ok "every card's JS parses"; else fail "a card would be dead in production"; fi
else
  note "node not available — skipped"; NOTES=$((NOTES+1))
fi

section "9/21 tool-count claims (sync-counts.py)"
if python3 scripts/sync-counts.py --check; then ok "every claim matches the catalogue"; else fail "stale tool counts — run: python3 scripts/sync-counts.py"; fi
if command -v node >/dev/null 2>&1; then
  if node scripts/generate-ai-index.js --check; then
    ok "machine indexes (llms.txt, llms-full.txt, tools-index.html) match the catalogue"
  else
    fail "machine indexes stale — run: node scripts/generate-ai-index.js"
  fi
else
  note "node not available — machine index check skipped"; NOTES=$((NOTES+1))
fi

section "10/21 sitemap freshness (build-sitemap.py)"
if python3 scripts/build-sitemap.py --check; then ok "sitemap matches tracked indexable pages"; else fail "sitemap stale — run: python3 scripts/build-sitemap.py"; fi

section "11/21 card accessibility (check-a11y.py)"
if python3 scripts/check-a11y.py; then ok "labels resolve, images have alt, _blank is safe"; else fail "accessibility regressions in cards/"; fi

section "12/21 site brain index and grounding"
if python3 scripts/build-site-brain.py --check \
  && python3 scripts/evaluate-site-brain.py; then
  ok "repo-grounded knowledge index and retrieval cases are current"
else
  fail "site brain stale or retrieval regression — rebuild and inspect learning/evaluation.json"
fi

section "13/21 staff facility configuration and regression tests"
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

section "14/21 card top-level name collisions (check-card-collisions.py)"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-card-collisions.py; then
    ok "no cross-card top-level name can throw in the shared DOM"
  else
    fail "cross-card top-level name collision — the second-loaded card would die with a SyntaxError"
  fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
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

section "15/21 home page first screen and card loader"
if python3 scripts/build-home-prerender.py --check; then
  ok "pre-rendered first screen matches the catalogue"
else
  fail "index.html's generated first screen is stale — run: python3 scripts/build-home-prerender.py"
fi
# These drive the real loader functions extracted from home-app.js (the
# externalised homepage application). lazy-loader was written for the
# lazy-loading rework but nothing ever ran it — verify.sh only picked up
# staff-*.test.js, so a card-loader regression could ship green.
if command -v node >/dev/null 2>&1; then
  if node scripts/tests/lazy-loader.test.js && node scripts/tests/home-fast-path.test.js \
    && node scripts/tests/lite-tier.test.js && node scripts/tests/service-worker.test.js \
    && node scripts/tests/app-split.test.js; then
    ok "card loader, first-screen fast path, two-tier catalogue, cache policy and the on-demand bundle behave as shipped"
  else
    fail "card loader regression — see the failing assertion above"
  fi
else
  note "node not available — card loader tests skipped"; NOTES=$((NOTES+1))
fi
# The main page's stylesheet is split: home.css blocks the first paint and
# home-deferred.css must style only containers that are hidden until asked for.
# If the split rots, the page silently goes back to a blocking 118 KB payload.
if python3 scripts/check-critical-css.py; then
  ok "main-page stylesheet split holds every first-paint rule in the blocking file; document inline scripts parse"
else
  fail "main-page stylesheet split broken — see scripts/check-critical-css.py"
fi

section "16/21 input egress and the local QR generator"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-egress.py; then
    ok "every network-touching card is a classified, reviewed exception"
  else
    fail "unclassified card egress — see scripts/check-egress.py header"
  fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
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
  if node scripts/tests/tool-pages.test.js; then
    ok "tools/ pages: live embed, valid JSON-LD, copy bar, no analytics"
  else
    fail "tool page regression — see scripts/tests/tool-pages.test.js"
  fi
  if node scripts/check-ymyl.js; then
    ok "YMYL checks: BMI WHO bands + deposit cap rule + caveats"
  else
    fail "YMYL regression — see scripts/check-ymyl.js"
  fi
else
  note "node not available — qrtool/risk-notice/tool-shell/deeplink tests skipped"; NOTES=$((NOTES+1))
fi

section "17/21 internal links (check-links.py)"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-links.py; then
    ok "every internal href/src resolves to a shipped file"
  else
    fail "broken internal links — visitors would hit 404s"
  fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
fi

section "18/21 embed catalogue (build-embed-catalog.py)"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/build-embed-catalog.py --check; then
    ok "embed.html grid matches the catalogue (every tool, live descriptions, true count)"
  else
    fail "embed.html grid has drifted from cards.json — run: python3 scripts/build-embed-catalog.py"
  fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
fi

section "19/21 measurement contract"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-scoreboard.py; then
    ok "scoreboard names instruments, guardrails and honest unknowns"
  else
    fail "measurement contract is incomplete — inspect staff/scoreboard.json"
  fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
fi

section "20/21 production monitor and recovery tooling"
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
  note "node not available — production monitor tests skipped"; NOTES=$((NOTES+1))
fi

section "21/21 Lantern engine and duty of care (ai.html)"
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
  note "node not available — Lantern engine and quality gates skipped"; NOTES=$((NOTES+1))
fi

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

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  printf '\033[31mVERIFY FAILED — %d problem(s). Do not push until fixed.\033[0m\n' "$FAILS"
  exit 1
fi
printf '\033[32mVERIFY PASSED\033[0m (%d note(s)). Safe to push.\n' "$NOTES"
exit 0
