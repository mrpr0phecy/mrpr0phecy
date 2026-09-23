#!/usr/bin/env python3
"""check-card-js.py — syntax-check the JavaScript inside every tool card.

Seven cards were once completely dead in production because a JavaScript syntax
error killed their whole <script> block: the tool rendered but did nothing at
all. That was found by hand and fixed, but nothing stopped it happening again.
This is the guard.

A card is a fragment injected into a shared DOM, so its scripts are checked as
standalone scripts — which is exactly how the browser parses them (classic,
non-module <script> blocks; no card in the catalogue uses type="module").

The guard also catches TRUNCATED cards: a file whose <script> block is never
closed yields no extractable block, so a pure syntax sweep would silently pass
a completely dead tool. After stripping paired blocks, any leftover <script
opener is a failure — no allowlist, no warnings. A stray </script> closer with
no opener is harmless and is NOT flagged.

Efficiency: every block is compiled in a SINGLE node process (vm.Script), not
one `node --check` subprocess per block. A full 1,200-card sweep takes ~1–2 s
instead of ~30 s of process spawning.

It also catches one shape that compiles perfectly and freezes the browser: a
`while (x.length …)` loop over a `querySelectorAll` result. That NodeList is
static, so removing nodes never shortens it and the loop runs for ever —
`cards/quiz.html`'s Clear button did exactly that.

Usage:
    python3 scripts/check-card-js.py           # only cards changed vs HEAD (fast)
    python3 scripts/check-card-js.py --all     # every card (~2s)

Requires node. If node is missing the check is skipped with a NOTE rather than
failing, so a machine without node is not blocked from pushing.
"""
from __future__ import annotations
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
SRC_SCRIPT_RE = re.compile(r"<script\b[^>]*\bsrc=[^>]*>\s*</script\s*>", re.S | re.I)
LEFTOVER_SCRIPT_RE = re.compile(r"<script\b", re.I)

# A `while` loop over a collection that cannot shrink is a frozen tab.
# `querySelectorAll` returns a STATIC NodeList: `list.length` does not change
# when a node is removed, so
#
#     const options = container.querySelectorAll('.option-item');
#     while (options.length > 2) options[options.length - 1].remove();
#
# removes the same detached node for ever. `cards/quiz.html` shipped exactly
# that on 2026-09-22 (add a third option, press Clear, lose the tab), and it
# cost the catalogue sweep ten minutes of CPU with no card named. `children`,
# `getElementsByTagName` and friends ARE live collections and are skipped.
STATIC_COLLECTION = re.compile(
    r"(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*?"
    r"(querySelectorAll|querySelector)\s*\(")
LIVE_COLLECTION = ("children", "getElementsByClassName", "getElementsByTagName",
                   "getElementsByName", "getElementsByTagNameNS")
WHILE_ON_LENGTH = re.compile(
    r"while\s*\(\s*(\w+)\.length\s*(?:[<>=!]+\s*[\w.]+\s*)?\)")
# Any of these means the loop makes progress and is not the bug.
LOOP_PROGRESS = (
    r"\b{name}\s*=[^=]|\b{name}\.(pop|shift|splice)\s*\("
    r"|\b{name}\.length\s*=[^=]|(\w+)\s*(?:\+\+|--|\+=|-=)")


def static_collection_loops(text: str) -> list[str]:
    """Cards with a `while (x.length …)` over a collection that never shrinks."""
    out: list[str] = []
    for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", text, re.S):
        body = m.group(1)
        declared = {}
        for d in STATIC_COLLECTION.finditer(body):
            declared[d.group(1)] = d.group(2)
        for w in WHILE_ON_LENGTH.finditer(body):
            name = w.group(1)
            if name not in declared:
                continue
            start = body.find("{", w.end())
            if start < 0:
                continue
            depth, i = 0, start
            while i < len(body):
                if body[i] == "{":
                    depth += 1
                elif body[i] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            loop = body[start:i]
            if re.search(LOOP_PROGRESS.format(name=re.escape(name)), loop):
                continue
            if not (re.search(rf"\.(remove|removeChild)\s*\(", loop)
                    or f"{name}[{name}.length" in loop
                    or f"{name}.removeChild" in loop):
                continue
            line = text[:m.start()].count("\n") + body[:w.start()].count("\n") + 1
            out.append(f"{w.group(0).strip()} at line {line} iterates a {declared[name]}() "
                       f"collection, which is STATIC — removing nodes does not shrink it, so "
                       f"this loop never ends. Use Array.from(...) and pop(), or re-query.")
    return out

# There is no allowlist here any more. Eight cards (clip-short,
# electrical-standards, fitnesscore, genetics, interval-trainer, mealplanner,
# oscilloscope, palette-swapper) used to sit on a KNOWN_TRUNCATED list that
# downgraded their truncation to a warning; they were restored on 2026-09-13,
# so an unclosed <script> is now always a hard failure. A card whose script
# block never closes renders as dead markup with no interactivity at all.

# Single-process syntax checker. vm.Script compiles without executing — the
# same guarantee as `node --check`, applied to classic scripts exactly as the
# browser parses card fragments. Reads a JSON manifest of {name, src} blocks
# from argv[1]; prints one FAIL line per block that does not compile.
CHECKER_JS = r"""
'use strict';
const fs = require('fs');
const vm = require('vm');
const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let fails = 0;
for (const it of items) {
  try {
    new vm.Script(it.src, { filename: it.name });
  } catch (e) {
    fails += 1;
    const first = String(e.message).split('\n')[0];
    console.log('FAIL\t' + it.name + '\t' + first);
  }
}
process.exit(fails ? 1 : 0);
"""


def _git(args: list[str]) -> str:
    r = subprocess.run(["git"] + args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def changed_cards() -> list[str]:
    """Cards modified or added in the working tree/index vs HEAD.

    Untracked (never-added) card files count as changed too — a brand-new
    card that has not been `git add`ed yet must still be guarded, otherwise
    it slips through an incremental sweep.
    """
    try:
        out = _git(["diff", "--name-only", "HEAD", "--", "cards/"])
        staged = _git(["diff", "--name-only", "--cached", "--", "cards/"])
        untracked = _git(["ls-files", "--others", "--exclude-standard", "--", "cards/"])
        names = {os.path.basename(l) for l in (out + staged + untracked).splitlines() if l.strip()}
        return sorted(n for n in names if n.endswith(".html")
                      and os.path.exists(os.path.join(CARDS, n)))
    except Exception:
        return []


def all_cards() -> list[str]:
    return sorted(f for f in os.listdir(CARDS) if f.endswith(".html"))


def main() -> int:
    if not shutil.which("node"):
        print("NOTE: node not installed — card JS syntax check skipped")
        return 0

    full = "--all" in sys.argv
    files = all_cards() if full else changed_cards()
    if not files:
        print("no changed cards to syntax-check (use --all for a full sweep)")
        return 0

    fails: list[str] = []
    blocks: list[dict] = []
    for f in files:
        try:
            text = open(os.path.join(CARDS, f), encoding="utf-8",
                        errors="replace").read()
        except OSError:
            continue
        # Truncation probe: strip comments, external scripts, and paired
        # inline blocks. A leftover <script opener means the file's script
        # was never closed — the tool is dead. (Stray </script> closers
        # are harmless and ignored.)
        probe = COMMENT_RE.sub("", text)
        probe = SRC_SCRIPT_RE.sub("", probe)
        probe = SCRIPT_RE.sub("", probe)
        if LEFTOVER_SCRIPT_RE.search(probe):
            fails.append(f"{f}: UNCLOSED <script> — file ends with "
                         "the script block never closed (truncated card)")
            continue
        for i, m in enumerate(SCRIPT_RE.finditer(text)):
            src = m.group(1)
            if not src.strip():
                continue
            blocks.append({"name": f"{f} (script block {i})", "src": src})
        for message in static_collection_loops(text):
            fails.append(f"{f}: {message}")

    if blocks:
        tmp = tempfile.mkdtemp(prefix="cardjs-")
        try:
            checker = os.path.join(tmp, "check.cjs")
            manifest = os.path.join(tmp, "blocks.json")
            with open(checker, "w", encoding="utf-8") as fh:
                fh.write(CHECKER_JS)
            with open(manifest, "w", encoding="utf-8") as fh:
                json.dump(blocks, fh, ensure_ascii=False)
            r = subprocess.run(["node", checker, manifest],
                               capture_output=True, text=True)
            for line in r.stdout.splitlines():
                if line.startswith("FAIL\t"):
                    _, name, msg = line.split("\t", 2)
                    fails.append(f"{name}: {msg.strip()[:140]}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    scope = "all cards" if full else "changed cards"
    print(f"checked {len(blocks)} script blocks in {len(files)} {scope} (one node process)")
    for fl in fails:
        print(f"  FAIL: {fl}")
    if fails:
        print(f"CARD JS FAILED — {len(fails)} card(s) would be dead in production.")
        return 1
    print("CARD JS OK — no syntax errors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
