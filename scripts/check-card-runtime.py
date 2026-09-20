#!/usr/bin/env python3
"""check-card-runtime.py — run every tool card and fail on the ones that throw.

check-card-js.py proves each <script> block *parses*. This proves it *runs*.

Eighteen cards shipped with JavaScript that compiled cleanly and still failed
at runtime, so the tool painted its face on the home page and then did nothing
when you clicked it:

  dead on load
    percentages             wiped #percent-inputs-container, then queried the
                            <h4> it had just destroyed
    hydration               rebuilt the parent of the two spans it reads, so
                            the second call died on a null
    sl-texture              called showNotification(), defined in no card
    edu-constellation-map   a Leo line pointed at star index 6 of six, which
                            aborted the whole canvas draw
    thermal-wall-simulator  read k, declared in a different function
    taskprioritizer         spread tpTasks; the array is taskprioritizerTpTasks
    second-life-surnames-guide  read slSgSurnames / slSgCurrentPage /
                            slSgFavorites; all three are declared slsg*
    motor-startup           called new Chart(); Chart.js ships nowhere
    youth-username-generator read v('name'); the input's id is yu-name
    moving                  wrote to #mp-overall-progress; the markup calls it
                            #moving-overall-progress
    trigonometry            wrote to #currentWeek, left over from another card

  dead on the first interaction
    spelling-check          wrote to #sc-char-count, absent from the markup
    statistics              read the implicit global `event`, which only exists
                            for onclick attributes — its four programmatic
                            calls threw
    sleep, steps, soil-ph-guide, seed-germination-calculator
                            called showNotification(), defined nowhere

  latent
    xmas-santa-tracker      appended a <style> to the Document itself

None of those are syntax errors. A compile check passes every one.

Usage:
    python3 scripts/check-card-runtime.py           # only cards changed vs HEAD
    python3 scripts/check-card-runtime.py --all     # every card (~3 min)

Needs node and jsdom. When either is missing the check prints a NOTE and
passes, the same way check-card-js.py handles a machine without node, so
nobody is blocked from pushing. Set JSDOM_PATH=<dir>/node_modules to point at
an install the search does not find.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
SWEEP = os.path.join(ROOT, "scripts", "card-runtime-sweep.js")


def _git(args: list[str]) -> str:
    try:
        out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                             text=True, timeout=30)
        return out.stdout if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def changed_cards() -> list[str]:
    """Cards touched vs HEAD, in the working tree or staged."""
    names: set[str] = set()
    for spec in (["diff", "--name-only", "HEAD"], ["diff", "--name-only", "--cached"]):
        for line in _git(spec).splitlines():
            line = line.strip()
            if line.startswith("cards/") and line.endswith(".html"):
                names.add(os.path.basename(line))
    return sorted(n for n in names if os.path.exists(os.path.join(CARDS, n)))


def all_cards() -> list[str]:
    return sorted(f for f in os.listdir(CARDS) if f.endswith(".html"))


def candidate_module_dirs() -> list[str]:
    """Places jsdom might already be installed, most specific first."""
    dirs: list[str] = []
    if os.environ.get("JSDOM_PATH"):
        dirs.append(os.environ["JSDOM_PATH"])
    for entry in os.environ.get("NODE_PATH", "").split(os.pathsep):
        if entry:
            dirs.append(entry)
    npm_root = shutil.which("npm")
    if npm_root:
        try:
            out = subprocess.run([npm_root, "root", "-g"], capture_output=True,
                                 text=True, timeout=30)
            if out.returncode == 0 and out.stdout.strip():
                dirs.append(out.stdout.strip())
        except (OSError, subprocess.SubprocessError):
            pass
    dirs.append(os.path.join(ROOT, "node_modules"))
    dirs.append("/tmp/node_modules")
    dirs.append("/tmp/tenv/node_modules")

    seen: list[str] = []
    for d in dirs:
        d = os.path.abspath(d)
        if os.path.isdir(os.path.join(d, "jsdom")) and d not in seen:
            seen.append(d)
    return seen


def main() -> int:
    if not shutil.which("node"):
        print("NOTE: node not installed — card runtime sweep skipped")
        return 0

    module_dirs = candidate_module_dirs()
    if not module_dirs:
        print("NOTE: jsdom not installed — card runtime sweep skipped "
              "(npm i jsdom, or set JSDOM_PATH=<dir>/node_modules)")
        return 0

    full = "--all" in sys.argv
    cards = all_cards() if full else changed_cards()
    if not cards:
        print("no changed cards to runtime-check (use --all for a full sweep)")
        return 0

    env = dict(os.environ)
    existing = env.get("NODE_PATH", "")
    env["NODE_PATH"] = os.pathsep.join(module_dirs + ([existing] if existing else []))

    proc = subprocess.run(
        ["node", "--max-old-space-size=3000", SWEEP, *[c[:-5] for c in cards]],
        cwd=ROOT, env=env, capture_output=True, text=True,
        timeout=3600 if full else 900,
    )
    sys.stdout.write(proc.stdout)
    if proc.stderr.strip():
        # jsdom is noisy about unimplemented browser APIs; only surface it when
        # the sweep itself did not produce a verdict.
        if proc.returncode not in (0, 1):
            sys.stderr.write(proc.stderr[-4000:])

    if proc.returncode == 0:
        return 0
    if proc.returncode == 1:
        print("RUNTIME FAIL — the card(s) above throw when the home page "
              "injects them; they would load and then do nothing.")
        return 1
    print(f"NOTE: sweep exited {proc.returncode} (crash or timeout) — "
          "treated as inconclusive, not as a pass")
    return 1


if __name__ == "__main__":
    sys.exit(main())
