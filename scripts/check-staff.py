#!/usr/bin/env python3
"""check-staff.py — validate the staff facility's structured files.

The staff area only helps if agents can trust what it says, so its structure is
checked in CI like everything else.

Failures (exit 1 if any):
  * duplicate item numbers in staff/OPEN.md — one number must mean one thing
  * an item missing Status / Raised, so its age and owner are unknown
  * an "open" item with no "Needs:" line, so nobody knows who must act
  * staff/BOARD.md missing its append marker, which would break staff.sh post

Zero dependencies. Safe on a sparse checkout (staff/ is in the sparse set).
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPEN_MD = os.path.join(ROOT, "staff", "OPEN.md")
BOARD_MD = os.path.join(ROOT, "staff", "BOARD.md")

fails: list[str] = []

if not os.path.exists(OPEN_MD):
    print("FATAL: staff/OPEN.md missing")
    sys.exit(1)

txt = open(OPEN_MD, encoding="utf-8").read()
head = re.findall(r"^## ((?:OPEN|CLOSED)-(\d+)) — (.+?)$", txt, re.M)

nums = [n for _, n, _ in head]
dupes = sorted({n for n in nums if nums.count(n) > 1})
if dupes:
    fails.append(f"duplicate item numbers: {', '.join(dupes)} — ids must be unique")

# Every item block must be self-describing.
blocks = re.split(r"^## (?=(?:OPEN|CLOSED)-\d+ — )", txt, flags=re.M)[1:]
for b in blocks:
    m = re.match(r"((?:OPEN|CLOSED)-\d+) — (.+)", b)
    if not m:
        continue
    iid, title = m.group(1), m.group(2)
    if not re.search(r"^- Status: \S", b, re.M):
        fails.append(f"{iid}: no Status line")
    if not re.search(r"^- Raised: \S", b, re.M):
        fails.append(f"{iid}: no Raised line (age and owner unknown)")
    if iid.startswith("OPEN"):
        if not re.search(r"^- Needs: \S", b, re.M):
            fails.append(f"{iid}: still open but has no 'Needs:' — nobody knows "
                         f"who must act")
        if re.search(r"^- Resolution:", b, re.M):
            fails.append(f"{iid}: open but carries a Resolution — close it with "
                         f"'bash scripts/staff.sh close {iid} ...'")
    else:
        if not re.search(r"^- Resolution: \S", b, re.M):
            fails.append(f"{iid}: closed with no Resolution recorded")

opens = [i for i, _, _ in head if i.startswith("OPEN")]

if os.path.exists(BOARD_MD):
    board = open(BOARD_MD, encoding="utf-8").read()
    if "<!-- NEW ENTRIES BELOW -->" not in board:
        fails.append("staff/BOARD.md lost its '<!-- NEW ENTRIES BELOW -->' "
                     "marker — staff.sh post cannot append correctly")
else:
    fails.append("staff/BOARD.md missing")

for f in fails:
    print(f"  FAIL: {f}")

if fails:
    print(f"STAFF FACILITY FAILED — {len(fails)} problem(s).")
    sys.exit(1)

print(f"{len(opens)} open, {len(head) - len(opens)} closed, item numbers unique")
sys.exit(0)
