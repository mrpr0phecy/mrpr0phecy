#!/usr/bin/env python3
"""check-card-runtime.py — run every tool card and fail on the ones that throw.

check-card-js.py proves each <script> block *parses*. This proves it *runs*.

Thirty-seven cards shipped with JavaScript that compiled cleanly and still failed
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

  dead on the first interaction
    accessible-text-prep    Print dereferenced a querySelector result that only
                            exists once there is output
    geology                 buttons called geoGenerate / geoReset / geoCopy;
                            the functions are geotGenerate / geotReset /
                            geotCopy, so every button on the card was dead
    chord-finder            read document.currentScript.closest() with no
    chord-progression       optional chain inside chordAddNote, chordSetNotes,
                            addChord and loadProgression. currentScript is null
                            once the script has run, so every call from a
                            click handler threw
    idealweight             declared targetWeight const, then reassigned it in
                            the pounds branch — the lb path never worked
    transformer-calculator  declared results const and built the whole report
                            with results +=, so Calculate threw every run
    fractions               nine generators were called and never written, so
                            five of its six operations threw
    ancient-egypt-quiz      called optsEl.children.forEach(); HTMLCollection
    british-monarchs-quiz   has no forEach. Threw on answering, so the answer
    common-english-         was never marked and the round never finished
      mistakes-trainer
    factors-multiples-trainer
    seed-germination-calculator
    sl-texture, sleep,      linked "Support Us" to showContributionsPanel(),
      soil-ph-guide,        defined nowhere in the entire site; the panel is a
      statistics, steps     popover, so the handler now opens it directly

  dead on the first interaction (added in the second pass)
    subscription            wrote to #sub-status, but status is picked with
                            .status-option buttons — there is no such select
    christmas-card-maker, ohms-law, onerepmax, social-preview
                            each revealed an affiliate block whose element is
                            absent from the markup, throwing away the rest of
                            the handler the user had just triggered

  dead part-way through
    oscilloscope            read #osc-affiliate, absent from the markup, on
                            every animation frame via oscDrawWaveform() — the
                            rAF loop died on frame eight and the trace froze
    lighting-design         read #light-lux, an input never present in the
                            markup; both the room-type preset and Calculate
                            threw, so the tool returned no results at all
    sl-events               rebuilt #sl-events-status, the parent of the
                            #last-update span it wrote to next, inside a
                            finally block — so every path threw, ~1.4s in,
                            after its own API timeouts had elapsed

None of those are syntax errors. A compile check passes every one.

Thirty-seven is the count of distinct cards on this branch, not a tally kept
by hand — recount with `git diff --name-only <base>..HEAD -- cards/ | wc -l`
before editing this list. It has drifted twice already.

The last three are why the sweep has two settle windows: a card that fails
synchronously is caught in 70ms, but one that fails after awaiting a request
needs its timeouts to elapse first. Cards that touch fetch/XHR/AbortController
get a longer window (only ten of the 1,195 do).

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
