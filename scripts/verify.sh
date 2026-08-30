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
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
LIVE=0; [ "${1:-}" = "--live" ] && LIVE=1
FAILS=0; NOTES=0

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
note() { printf '  \033[33mNOTE\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILS=$((FAILS+1)); }

section "1/7 catalogue consistency (check-cards.py)"
if command -v python3 >/dev/null 2>&1; then
  if python3 scripts/check-cards.py; then ok "catalogue coherent"; else fail "catalogue incoherent"; fi
else
  note "python3 not available — skipped"; NOTES=$((NOTES+1))
fi

section "2/7 placeholder IDs in *.html"
# Hard placeholders anywhere; YOUR_ only inside URLs/attributes (demo text
# like 'YOUR_SYSTEM_PROMPT' in the prompt-injection lab is legitimate content).
PH="dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|(src|href)=['\"][^'\"]*YOUR_"
HITS=$(grep -rlE "$PH" --include='*.html' . 2>/dev/null || true)
if [ -n "$HITS" ]; then fail "placeholder IDs found: $(echo "$HITS" | tr '\n' ' ')"; else ok "none"; fi

section "3/7 target=_blank links without rel=noopener"
BAD=$(grep -rn --include='*.html' -E '<a [^>]*target="_blank"' . 2>/dev/null | grep -v 'noopener' || true)
if [ -n "$BAD" ]; then fail "$(echo "$BAD" | head -5)"; else ok "all covered"; fi

section "4/7 sitemap.xml"
if python3 - <<'PY' 2>/dev/null
import xml.etree.ElementTree as E
root = E.parse('sitemap.xml').getroot()
n = len(list(root))
exit(0 if n > 0 else 1)
PY
then ok "parses, entries: $(python3 -c "import xml.etree.ElementTree as E;print(len(list(E.parse('sitemap.xml').getroot())))")"
else fail "missing or empty"; fi

section "5/7 top-level SEO scan (scan-seo.py)"
if python3 scripts/scan-seo.py; then ok "no missing <title>"; else fail "see warnings above"; fi

section "6/7 sensitive strings in tracked files"
# Patterns are assembled at runtime so this script does not match itself.
P1="gh""o_"; P2="gh""p_"; P3="github""_pat_"; P4="gh""s_"
if grep -rnE "$P1|$P2|$P3|$P4" --exclude-dir=.git . 2>/dev/null | grep -v '^Binary' | head -5 | grep -q .; then
  fail "possible token in repo — scrub immediately"
else
  ok "none"
fi

section "7/7 git state"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  note "uncommitted changes present — commit before pushing"; NOTES=$((NOTES+1))
else
  ok "working tree clean"
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
