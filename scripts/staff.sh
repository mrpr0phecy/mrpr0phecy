#!/usr/bin/env bash
# staff.sh — the interface to the staff facility.
#
#   bash scripts/staff.sh                  digest: what is open, what changed
#   bash scripts/staff.sh open  "Title" [body...]
#   bash scripts/staff.sh close OPEN-1 "what was decided"
#   bash scripts/staff.sh post  "Subject" [body...]
#   bash scripts/staff.sh who              roster of roles
#   bash scripts/staff.sh help
#
# Sign your work with a role handle, not a model name:
#   STAFF_HANDLE=@content bash scripts/staff.sh post "Subject" "body"
#   bash scripts/staff.sh --as @content post "Subject" "body"
#
# Zero dependencies beyond bash + python3, like everything else in scripts/.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
STAFF="$ROOT/staff"
OPEN_MD="$STAFF/OPEN.md"
BOARD_MD="$STAFF/BOARD.md"
README_MD="$STAFF/README.md"
TS=$(date -u '+%Y-%m-%d %H:%M UTC')

# ---------------------------------------------------------------- handle
HANDLE="${STAFF_HANDLE:-}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --as) HANDLE="${2:-}"; shift 2 ;;
    --as=*) HANDLE="${1#--as=}"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- ${ARGS+"${ARGS[@]}"}
[ -z "$HANDLE" ] && HANDLE="@agent"

CMD="${1:-status}"
[ $# -gt 0 ] && shift

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

# ---------------------------------------------------------------- status
cmd_status() {
  python3 - "$ROOT" "$OPEN_MD" "$BOARD_MD" "$README_MD" "$HANDLE" <<'PY'
import json, os, re, sys, datetime
root, open_md, board_md, readme_md, handle = sys.argv[1:6]

print("=" * 68)
print("  STAFF FACILITY — mrpr0phecy/mrpr0phecy")
print("=" * 68)

# ---- live repo facts, so nobody works from a stale number
try:
    cards = json.load(open(os.path.join(root, "cards/cards.json")))
    cats = {e["category"] for e in cards}
    sitemap = open(os.path.join(root, "sitemap.xml"), encoding="utf-8",
                   errors="replace").read().count("<loc>")
    print(f"  catalogue   {len(cards)} tools in {len(cats)} categories"
          f"   sitemap {sitemap} URLs")
except Exception as e:
    print(f"  catalogue   could not be read: {e}")

ai = os.path.exists(os.path.join(root, ".github/workflows/ai-developer.yml"))
print(f"  workflows   {'ai-developer.yml PRESENT (should be gone!)' if ai else 'agent-guardrails.yml only'}")
print(f"  you are     {handle}")
print()

# ---- open items
txt = open(open_md, encoding="utf-8").read() if os.path.exists(open_md) else ""
open_part = txt.split("<!-- CLOSED -->")[0]
items = re.findall(r"^## (OPEN-\d+) — (.+?)$(.*?)(?=^## OPEN-|\Z)",
                   open_part, re.S | re.M)
if not items:
    print("  OPEN ITEMS  none — the repo is quiet.")
else:
    print(f"  OPEN ITEMS  {len(items)}")
    for iid, title, body in items:
        needs = re.search(r"^- Needs: (.+)$", body, re.M)
        raised = re.search(r"^- Raised: (\S+) by (\S+)", body, re.M)
        who = raised.group(2) if raised else "?"
        when = raised.group(1) if raised else "?"
        print(f"    {iid}  {title}")
        print(f"           needs: {needs.group(1) if needs else '?'}"
              f"   raised {when} by {who}")
print()

# ---- recent board activity
b = open(board_md, encoding="utf-8").read() if os.path.exists(board_md) else ""
entries = re.findall(r"^## (.+?) — (@[\w-]+) — (.+)$", b, re.M)
if entries:
    print(f"  RECENT BOARD ACTIVITY  (last {min(5, len(entries))} of {len(entries)})")
    for when, who, subj in entries[:5]:
        print(f"    {when}  {who:10s}  {subj}")
else:
    print("  RECENT BOARD ACTIVITY  none yet")
print()

print("  RULES       staff/README.md — read it once. The repo is PUBLIC:")
print("              nothing sensitive, ever, including in commit history.")
print("  AUTHORITY   ARCHITECTURE.md > AGENTS.md > this board.")
print("  BEFORE PUSH bash scripts/verify.sh")
print()
print("  Next:  bash scripts/staff.sh help")
print("=" * 68)
PY
}

# ---------------------------------------------------------------- open
cmd_open() {
  TITLE="${1:-}"; shift || true
  [ -z "$TITLE" ] && { echo "usage: staff.sh open \"Title\" [body...]"; exit 1; }
  BODY="${*:-}"
  python3 - "$OPEN_MD" "$TITLE" "$BODY" "$HANDLE" "$TS" <<'PY'
import re, sys, os
path, title, body, handle, ts = sys.argv[1:6]
txt = open(path, encoding="utf-8").read()
ids = [int(m) for m in re.findall(r"^## (?:OPEN|CLOSED)-(\d+)", txt, re.M)]
n = max(ids) + 1 if ids else 1
blk = [f"## OPEN-{n} — {title}", "",
       "- Status: open", f"- Raised: {ts.split()[0]} by {handle}",
       "- Needs: triage", "- Area: general", ""]
if body.strip():
    blk += [l for l in body.strip().splitlines()] + [""]
txt = txt.replace("<!-- CLOSED -->", "\n".join(blk) + "<!-- CLOSED -->", 1)
open(path, "w", encoding="utf-8").write(txt)
print(f"raised OPEN-{n}: {title}")
print(f"  edit 'Needs:' and 'Area:' in staff/OPEN.md, then commit.")
PY
}

# ---------------------------------------------------------------- close
cmd_close() {
  ID="${1:-}"; shift || true
  RES="${*:-}"
  if [ -z "$ID" ] || [ -z "$RES" ]; then
    echo "usage: staff.sh close OPEN-1 \"what was decided\""; exit 1
  fi
  # Only announce the closure if the edit actually happened — a "closed" board
  # entry for an item that was never found would be worse than no entry.
  if ! python3 - "$OPEN_MD" "$ID" "$RES" "$HANDLE" "$TS" <<'PY'
import re, sys
path, iid, res, handle, ts = sys.argv[1:6]
txt = open(path, encoding="utf-8").read()
m = re.search(rf"^## {re.escape(iid)} — (.+?)$(.*?)(?=^## (?:OPEN|CLOSED)-|<!-- CLOSED -->|\Z)",
              txt, re.S | re.M)
if not m:
    print(f"no such item: {iid} — run 'bash scripts/staff.sh' to see the open list")
    sys.exit(1)
title, body = m.group(1), m.group(2)
if re.search(r"^- Status: closed", body, re.M):
    print(f"{iid} is already closed")
    sys.exit(1)
area = re.search(r"^- Area: (.+)$", body, re.M)
body = re.sub(r"^- Status: .*$", f"- Status: closed {ts.split()[0]} by {handle}",
              body, count=1, flags=re.M)
body = re.sub(r"^- Needs: .*$\n", "", body, count=1, flags=re.M)
body = re.sub(r"^- Area: .*$",
              f"- Area: {area.group(1) if area else 'general'}\n- Resolution: {res}",
              body, count=1, flags=re.M)
txt = txt[:m.start()] + txt[m.end():]
num = iid.split("-")[1]
txt = txt.rstrip() + f"\n\n## CLOSED-{num} — {title}\n{body.rstrip()}\n"
open(path, "w", encoding="utf-8").write(txt)
print(f"closed {iid}: {title}")
PY
  then
    exit 1
  fi
  cmd_post "Closed $ID" "$RES"
}

# ---------------------------------------------------------------- post
cmd_post() {
  SUBJ="${1:-}"; shift || true
  BODY="${*:-}"
  [ -z "$SUBJ" ] && { echo "usage: staff.sh post \"Subject\" [body...]"; exit 1; }
  python3 - "$BOARD_MD" "$SUBJ" "$BODY" "$HANDLE" "$TS" <<'PY'
import sys
path, subj, body, handle, ts = sys.argv[1:6]
txt = open(path, encoding="utf-8").read()
marker = "<!-- NEW ENTRIES BELOW -->"
lines = body.strip().splitlines() if body.strip() else ["(no detail given)"]
blk = f"\n## {ts} — {handle} — {subj}\n\n" + "\n".join(lines) + "\n\n---\n"
if marker in txt:
    txt = txt.replace(marker, marker + "\n" + blk, 1)
else:
    txt = txt.rstrip() + "\n" + blk
open(path, "w", encoding="utf-8").write(txt)
print(f"posted to staff/BOARD.md as {handle}: {subj}")
PY
}

# ---------------------------------------------------------------- who
cmd_who() {
  echo "Roles (sign with the role, never a model name):"
  sed -n '/^| Handle/,/^$/p' "$README_MD" 2>/dev/null || \
    echo "  see staff/README.md"
}

case "$CMD" in
  status|"") cmd_status ;;
  open)      cmd_open "$@" ;;
  close)     cmd_close "$@" ;;
  post)      cmd_post "$@" ;;
  who)       cmd_who ;;
  help|-h|--help) usage ;;
  *) echo "unknown command: $CMD"; usage; exit 1 ;;
esac
