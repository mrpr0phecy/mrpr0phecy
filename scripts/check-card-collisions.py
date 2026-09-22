#!/usr/bin/env python3
"""check-card-collisions.py — guard against cross-card top-level name collisions.

WHY THIS EXISTS
---------------
tool.html is the only surface that injects card fragments, and it injects ONE
at a time: it clears #toolContainer, then re-creates the fragment's <script>
elements as real inline scripts. Inline classic scripts declare into the
document's GLOBAL scope, and a global `let`/`const`/`class` can never be
undeclared. So a top-level `const goals` in one card survives the navigation
to the next card, and the next card's `let goals` dies at parse time:

    SyntaxError: Identifier 'goals' has already been declared

The whole script block is dead — the card renders and does nothing, and a
reload appears to fix it. That is the exact failure this guard exists for.
Measured model — script A then script B in one document, every combination
that matters:

    A lexical (let/const/class)  +  anything      -> B throws (HARD)
    A var/function               +  B lexical     -> B throws (HARD)
    A var/function               +  B var/function -> silent overwrite (SOFT)

Only SOFT combinations are survivable: a later card hijacks an earlier card's
same-named function, and because just one card is mounted at a time the
hijacked copy is not the one on screen. Hard combinations FAIL the gate.

HOW DETECTION WORKS, AND WHY IT IS DONE THIS WAY
------------------------------------------------
"Declared at top level" cannot be read off the text. `var` hoists out of
blocks, an IIFE swallows everything, and — the case that made the previous
version of this guard miss two live bugs — a card may indent its whole script
by 8 spaces without nesting it at all. The old detection matched only
`^let|var|const|function|class NAME` at column 0, so `creative-writing.html`,
whose entire script is indented inside its <script> tag, was invisible.

So detection is split in two, and the second half is exact:

  1. CANDIDATES (here, in Python). A deliberately over-broad regex pulls every
     declaration-looking name out of the raw script text at any indentation
     and any nesting. It also harvests names from strings and comments, which
     is harmless — step 2 throws those away. Nothing is masked, parsed or
     guessed at here, and the regex consumes only the declaring keyword
     (lookahead, see DECL_RE) so that one match can never swallow the next
     declaration's name.

  2. VERDICT (in node, exact). A name from step 1 is top-level in that block
     if and only if appending `let NAME;` to the block is a SyntaxError, and it
     is LEXICAL if and only if appending `var NAME;` is. That is not a
     heuristic — it is precisely how a classic script's global scope resolves,
     and it falls out of same-scope redeclaration rules:

         let a; var a;   -> SyntaxError: Identifier 'a' has already been declared
         var a; let a;   -> SyntaxError
         let a; let a;   -> SyntaxError
         var a; var a;   -> fine        (soft)
         function a(){} var a;  -> fine (soft)
         function f(){ let a; } var a;  -> fine (nested, NOT top-level)

     vm.Script compiles without executing, exactly as check-card-js.py does,
     so no card code ever runs. Only SHARED names (declared by 2+ cards) are
     probed — a name declared by one card cannot collide with anything — and
     the probe names every candidate in a SINGLE appended statement, peeling
     off whichever name the parser rejects and retrying. A file with no
     top-level declarations is therefore answered by one compile, which is
     what keeps a full 1,250-card sweep at ~2.5 s.

Because step 2 decides every verdict, step 1's imprecision cannot cause a
wrong answer in either direction: a name wrongly harvested is probed and
dropped, and a genuine declaration is never missed because the candidate regex
does not care about indentation, nesting or a file's formatting style.

Requires node, like check-card-js.py, and is skipped with a NOTE rather than a
failure where node is absent — so a machine without it is not blocked.

Usage:
    python3 scripts/check-card-collisions.py [--verbose]
"""

from __future__ import annotations

import collections
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")

# External scripts carry no inline declarations; only inline blocks matter.
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", re.I)

# Step 1 — the over-broad candidate harvest. Intentionally blind to
# indentation, nesting, comments and strings; see the module docstring.
#
# The name is captured through a LOOKAHEAD, so the regex consumes only the
# keyword. That is load-bearing, not style: `re.finditer` yields
# non-overlapping matches, so a regex that consumed the name too would eat
# this entire breadcrumb —
#
#     // Main calculation function
#     function atCalculate() {
#
# by matching `function` + whitespace + `function` and skipping `atCalculate`.
# That comment style is common in this catalogue, and the older column-0
# regex in this file had exactly that blind spot. `\s*\*?\s*` also admits
# `function* gen()`.
DECL_RE = re.compile(
    r"\b(let|var|const|function|class)(?=\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*))")
# `const { a, b } = x` / `const [a, b] = y` bind names that no bare-identifier
# regex can see. The whole pattern is harvested (keys included) because a
# superset is safe and a subset is not.
DESTRUCTURE_RE = re.compile(r"\b(?:let|var|const)\s*[\[{]")
IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")

# Words that can never be a binding name. The harvest deliberately walks
# comments and prose, where `// Helper function for notifications` yields the
# candidate "function": appending `let function;` is then a SyntaxError for a
# reason that has nothing to do with scope, which would make the probe
# unanswerable. Dropping them here is safe — none of them can collide.
RESERVED = frozenset("""
    await break case catch class const continue debugger default delete do
    else enum export extends false finally for function if implements import
    in instanceof interface let new null package private protected public
    return static super switch this throw true try typeof var void while with
    yield
""".split())

# Step 2 — the exact verdict, one node process for every block.
PROBE_JS = r"""
'use strict';
const fs = require('fs');
const vm = require('vm');
const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// Does appending `let NAME;` (or `var NAME;`) to this block redeclare NAME in
// the block's own global scope? Compile only — nothing is executed.
function probe(code, kw, names) {
  // One statement naming every candidate, then peel off whichever name the
  // parser complains about and retry. The loop therefore runs once plus once
  // per genuine hit — and a file with no top-level declarations at all is
  // answered by the FIRST compile, which is what keeps a full sweep quick.
  const hits = [];
  let remaining = names.slice();
  const seen = new Set();
  while (remaining.length) {
    try {
      new vm.Script(code + '\n' + kw + ' ' + remaining.join(',') + ';');
      break;                       // nothing left in `remaining` is top-level
    } catch (e) {
      const msg = String(e.message);
      if (!/already been declared/.test(msg)) throw new Error(msg.split('\n')[0]);
      const m = /Identifier '([^']+)' has already been declared/.exec(msg);
      if (!m || !remaining.includes(m[1])) throw new Error(msg.split('\n')[0]);
      if (seen.has(m[1])) throw new Error('probe did not converge on ' + m[1]);
      seen.add(m[1]);
      hits.push(m[1]);
      remaining = remaining.filter(n => n !== m[1]);
    }
  }
  return hits;
}

const out = {};
const errors = [];
for (const it of items) {
  const verdicts = {};
  try {
    // `let` collides with a declaration of ANY kind -> the top-level set.
    const topLevel = probe(it.code, 'let', it.names);
    // `var` collides only with let/const/class -> which of those are lexical.
    const lexical = new Set(probe(it.code, 'var', topLevel));
    for (const name of it.names) {
      verdicts[name] = {
        topLevel: topLevel.indexOf(name) !== -1,
        lexical: lexical.has(name),
      };
    }
  } catch (e) {
    // Record and keep going: one unanswerable card must not cost the
    // verdicts for every other card in the run.
    errors.push(it.file + ' — ' + e.message);
  }
  out[it.file] = verdicts;
}
process.stdout.write(JSON.stringify({ verdicts: out, errors: errors }));
"""


LIST_RE = re.compile(r"\b(?:let|var|const)(?=\s*\*?\s*[A-Za-z_$])")

# Generous cap on how far the declarator-list scan will run. Over-running is
# harmless (extra candidates are probed and dropped); the cap only stops a
# pathological file from turning the scan into a full-text walk.
_LIST_CAP = 1200


def _statement_end(code: str, start: int) -> int:
    """Index of the `;` (or closing brace) that ends the statement at `start`.

    Tracks bracket depth so a `;` inside `for (;;)` or inside an object
    literal does not end the statement early. ASI — a declaration list that
    ends because the next line starts a new statement — simply runs on a
    little; the surplus names are still only candidates.
    """
    depth = 0
    limit = min(len(code), start + _LIST_CAP)
    i = start
    while i < limit:
        c = code[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            if depth == 0:
                return i
            depth -= 1
        elif c == ";" and depth == 0:
            return i
        elif c == "\n" and depth == 0:
            # A line ending in `,` or an operator continues the declaration;
            # anything else is where an un-terminated statement realistically
            # stops, so do not walk into unrelated code below it.
            j = i - 1
            while j >= start and code[j] in " \t\r":
                j -= 1
            if j < start or code[j] not in ",=+-*/%&|^!?<>:.":
                return i
        i += 1
    return limit


def script_blocks(text: str) -> list[str]:
    return SCRIPT_RE.findall(text)


def candidates(code: str) -> set[str]:
    """Every name this block might declare.

    Deliberately over-collecting: no masking, no indentation requirement,
    destructuring patterns harvested wholesale, and every identifier in a
    `let`/`var`/`const` statement counted. Step 2 discards whatever is not
    genuinely in the block's global scope, so a surplus costs one cheap probe
    while a shortfall would hide a real collision.
    """
    found = {m.group(2) for m in DECL_RE.finditer(code)}
    # `let a, b;` binds every name in the list, not just the first — the
    # keyword lookahead above can only see one. Scan to the end of the
    # statement and harvest every identifier inside it.
    for m in LIST_RE.finditer(code):
        end = _statement_end(code, m.end())
        found |= set(IDENT_RE.findall(code[m.end():end]))
    for m in DESTRUCTURE_RE.finditer(code):
        # Walk to the matching close bracket of the binding pattern.
        i, n = m.end() - 1, len(code)
        depth = 0
        while i < n:
            c = code[i]
            if c in "{[":
                depth += 1
            elif c in "}]":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        found |= set(IDENT_RE.findall(code[m.end():i]))
    return found - RESERVED


def read_cards() -> dict[str, str]:
    cards: dict[str, str] = {}
    for fn in sorted(os.listdir(CARDS)):
        if not fn.endswith(".html"):
            continue
        try:
            with open(os.path.join(CARDS, fn), encoding="utf-8", errors="replace") as fh:
                cards[fn] = fh.read()
        except OSError:
            continue
    return cards


def classify(cards: dict[str, str]) -> tuple[list, list, list]:
    """Return (hard, soft, probe_errors).

    hard/soft are lists of (name, {file: kind}); probe_errors is a list of
    strings describing probes that could not be answered.
    """
    # Which names does each card merely *mention*? Over-broad on purpose.
    per_file: dict[str, set[str]] = {}
    for fn, text in cards.items():
        merged: set[str] = set()
        for code in script_blocks(text):
            merged |= candidates(code)
        per_file[fn] = merged

    # A name only one card mentions cannot collide with anything, so only
    # shared names are worth a probe. This is what keeps the exact step cheap.
    holders: dict[str, list[str]] = collections.defaultdict(list)
    for fn, names in per_file.items():
        for name in names:
            holders[name].append(fn)
    shared = {n for n, files in holders.items() if len(files) > 1}

    # Ask node for the exact top-level verdict on every shared name.
    manifest = []
    for fn, names in per_file.items():
        wanted = sorted(names & shared)
        if not wanted:
            continue
        manifest.append({"file": fn, "code": "\n".join(script_blocks(cards[fn])),
                         "names": wanted})

    verdicts, probe_errors = probe(manifest)

    # A name is a collision only where it is genuinely top-level.
    declared: dict[str, dict[str, set[str]]] = collections.defaultdict(dict)
    for entry in manifest:
        fn = entry["file"]
        for name, v in verdicts.get(fn, {}).items():
            if not v.get("topLevel"):
                continue
            kind = "let/const" if v.get("lexical") else "var/function"
            declared[name][fn] = {kind}

    hard: list = []
    soft: list = []
    for name, files in declared.items():
        if len(files) < 2:
            continue
        # Hard whenever any holder declares it lexically: a global let/const/
        # class cannot coexist with ANY redeclaration of the same name.
        is_hard = any("let/const" in kinds for kinds in files.values())
        (hard if is_hard else soft).append((name, files))
    hard.sort()
    soft.sort()
    return hard, soft, probe_errors


def probe(manifest: list) -> tuple[dict, list]:
    """Run the node probes; returns ({file: {name: {topLevel, lexical}}}, errors)."""
    if not manifest:
        return {}, []
    tmp = tempfile.mkdtemp(prefix="cardcoll-")
    try:
        checker = os.path.join(tmp, "probe.cjs")
        payload = os.path.join(tmp, "manifest.json")
        with open(checker, "w", encoding="utf-8") as fh:
            fh.write(PROBE_JS)
        with open(payload, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, ensure_ascii=False)
        r = subprocess.run(["node", checker, payload],
                           capture_output=True, text=True)
        if r.returncode != 0:
            return {}, [f"probe process exited {r.returncode}: "
                        f"{(r.stderr or '').strip().splitlines()[-1][:200] if r.stderr else 'no output'}"]
        data = json.loads(r.stdout or "{}")
        return data.get("verdicts", {}), list(data.get("errors", []))
    except (OSError, ValueError) as exc:
        return {}, [f"probe could not run: {exc}"]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    if not os.path.isdir(CARDS):
        print("NOTE: no cards/ directory — skipped")
        return 0
    if not shutil.which("node"):
        print("NOTE: node not installed — card collision check skipped")
        return 0

    cards = read_cards()
    if not cards:
        print("NOTE: cards/ is empty — skipped")
        return 0

    hard, soft, probe_errors = classify(cards)

    # A probe that could not be answered is a FAILURE, not a pass: silently
    # reporting OK here is how a dead card would ship.
    for err in probe_errors:
        print(f"  FAIL probe: {err}")
    if probe_errors:
        print(f"CARD COLLISIONS FAILED — {len(probe_errors)} name(s) could not be "
              f"probed, so the catalogue was NOT fully checked.")
        return 1

    print(f"collisions: {len(hard)} hard (SyntaxError), {len(soft)} soft "
          f"(silent overwrite, tracked separately — pass --verbose to list)")
    if "--verbose" in sys.argv:
        for name, files in soft:
            print(f"  WARN soft: {name} -> {', '.join(sorted(files))}")
    for name, files in hard:
        detail = ", ".join(f"{f} ({'/'.join(sorted(files[f]))})"
                           for f in sorted(files))
        print(f"  FAIL hard: {name} -> {detail} — rename the name in all but "
              f"one of these cards")

    if hard:
        print(f"CARD COLLISIONS FAILED — {len(hard)} name(s) would kill the "
              f"second-loaded card with a SyntaxError.")
        return 1
    print("CARD COLLISIONS OK — no top-level name would throw in the shared DOM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
