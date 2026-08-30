#!/usr/bin/env bash
# workspace-size.sh — report (and optionally shrink) the agent workspace.
#
# The workspace budget is a HARD 100 MB (see AGENTS.md §2): images/ stays out
# of sparse checkouts, caches stay out of the workspace. Run this any time
# you're unsure how much space the clone is using.
#
#   bash scripts/workspace-size.sh          # report
#   bash scripts/workspace-size.sh --purge  # report + clear caches + git gc
set -u
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

SIZE=$(du -sb . 2>/dev/null | cut -f1)
LIMIT=$((100 * 1024 * 1024))
MB=$((SIZE / 1024 / 1024))

fmt() { python3 - "$1" <<'PY'
import sys
print(f"{int(sys.argv[1])/1048576:.1f} MB")
PY
}

echo "workspace: $(fmt "$SIZE") of 100 MB limit ($MB MB)"

if [ "$PURGE" = "1" ]; then
  # caches and junk that must never live in the workspace
  rm -rf __pycache__ .cache node_modules dist build .pytest_cache 2>/dev/null
  echo "caches cleared"
  git gc --prune=now -q 2>/dev/null && echo "git gc done"
  SIZE=$(du -sb . 2>/dev/null | cut -f1)
  echo "after purge: $(fmt "$SIZE")"
fi

if [ "$SIZE" -gt "$LIMIT" ]; then
  echo "!! OVER LIMIT — shrink before continuing (see AGENTS.md §2)"
  exit 1
fi
exit 0
