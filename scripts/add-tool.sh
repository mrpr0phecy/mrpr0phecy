#!/usr/bin/env bash
# add-tool.sh — the whole "add a tool" sequence from ARCHITECTURE.md §3 in one go.
#
#   bash scripts/add-tool.sh <slug> "<Category>" "<commit message>" [--no-push]
#
# Expects cards/<slug>.html to already exist. Then:
#   1. registers the slug in generate-cards-json.js under the given category
#      (categoryMap — explicit filename map, immune to substring stealing)
#   2. regenerates cards/cards.json
#   3. syncs every published count + the sitemap (scripts/sync-counts.py, D-001)
#   4. smoke-tests the card in a shared DOM (scripts/test-card.js)
#   5. runs scripts/verify.sh
#   6. commits and pushes the current branch (unless --no-push)
set -euo pipefail
cd "$(dirname "$0")/.."

SLUG="${1:?slug}"; CAT="${2:?category}"; MSG="${3:?commit message}"; PUSH=1
[ "${4:-}" = "--no-push" ] && PUSH=0
FILE="cards/$SLUG.html"
[ -f "$FILE" ] || { echo "no such card: $FILE"; exit 1; }

# 1. category registration (explicit map near the top of the generator)
if ! grep -q "'$SLUG':" generate-cards-json.js; then
  node - "$SLUG" "$CAT" <<'JS'
const fs = require('fs');
const [slug, cat] = process.argv.slice(2);
let s = fs.readFileSync('generate-cards-json.js', 'utf8');
if (!s.includes('const categoryMap = {')) {
  s = s.replace("const gapFillMap = {", "// Explicit slug → category map for tools added after 2026-09-05.\n// Checked before every substring list so nothing can steal these.\nconst categoryMap = {\n};\n\nconst gapFillMap = {");
  s = s.replace("function getCategory(name) {\n", "function getCategory(name) {\n  if (categoryMap[name]) return categoryMap[name];\n");
}
s = s.replace("const categoryMap = {\n", `const categoryMap = {\n  '${slug}': '${cat.replace(/'/g, "\\'")}',\n`);
fs.writeFileSync('generate-cards-json.js', s);
JS
fi

# 2. index
node generate-cards-json.js
python3 -c "
import json,sys
d=json.load(open('cards/cards.json'))
e=[x for x in d if x['name']=='$SLUG']
assert e, 'card not indexed'
e=e[0]
assert e['category']=='''$CAT''', 'category mismatch: '+e['category']
assert e['title'].strip() and e['description'].strip(), 'blank title/description'
print('indexed:', e['title'], '|', e['category'])
print('desc   :', e['description'][:120])
"

# 3. counts + sitemap
python3 scripts/sync-counts.py

# 4. smoke test
node scripts/test-card.js "$FILE"

# 5. guardrails
bash scripts/verify.sh >/tmp/verify.log 2>&1 || { tail -25 /tmp/verify.log; exit 1; }
tail -1 /tmp/verify.log

# 6. ship
git add -A
git commit -q -m "$MSG"
if [ "$PUSH" = "1" ]; then
  git push -q origin "$(git rev-parse --abbrev-ref HEAD)"
  echo "pushed: $(git rev-parse --short HEAD) $MSG"
else
  echo "committed (not pushed): $(git rev-parse --short HEAD) $MSG"
fi
