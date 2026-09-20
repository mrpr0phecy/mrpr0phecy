#!/usr/bin/env python3
"""safe-inspect.py — look at a big generated artefact without flooding anything.

    python3 scripts/safe-inspect.py cards/cards.json
    python3 scripts/safe-inspect.py --diff related.json      # vs. HEAD
    python3 scripts/safe-inspect.py --diff cards/cards.json --ref main
    python3 scripts/safe-inspect.py --head tools-index.json --bytes 400
    python3 scripts/safe-inspect.py --json-shape api/tools.json

Why this exists
---------------
On 2026-09-20 an agent ran `git diff local-ai-knowledge.json | head -8`. That
file is 4.6 MB on essentially one line, so "the first 8 lines" was the entire
BM25 idf table: megabytes of numbers went into the terminal and the session,
and the run had to be killed. `head` bounds *lines*, and a minified file has
one. Nothing in the repo bounded *bytes*.

So: every mode here has a hard byte ceiling (default 4 KB of output,
`--max-bytes` to raise it), the file itself is never printed, and the interesting
questions get real answers instead:

  * how big is it, how many lines, what is the longest line (the minification
    tell), is it valid JSON, what are its top-level keys and their sizes;
  * what changed versus a git ref — `--stat` first, then for JSON a structural
    delta (keys added/removed, list lengths before/after, scalar values that
    changed) rather than a wall of text;
  * the first N *bytes*, clearly labelled as a prefix of a minified artefact.

`.gitattributes` marks these paths `-diff` so plain `git diff` refuses to print
them either; this script is the sanctioned way to look.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MAX_BYTES = 4096


class Budget:
    """A hard ceiling on how much this script is allowed to print."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0
        self.truncated = False

    def write(self, text: str) -> None:
        room = self.limit - self.used
        if room <= 0:
            self.truncated = True
            return
        encoded = text.encode("utf-8", "replace")
        if len(encoded) > room:
            text = encoded[:room].decode("utf-8", "ignore")
            self.truncated = True
        sys.stdout.write(text)
        self.used += len(text.encode("utf-8", "replace"))

    def line(self, text: str = "") -> None:
        self.write(text + "\n")

    def close(self) -> None:
        if self.truncated:
            sys.stdout.write(
                f"\n[output stopped at the {self.limit}-byte ceiling — raise it with --max-bytes]\n"
            )


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{int(n)} B" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{int(n)} B"


def git_show(ref: str, rel: str) -> bytes | None:
    try:
        out = subprocess.run(
            ["git", "show", f"{ref}:{rel}"],
            cwd=ROOT, capture_output=True, check=False,
        )
    except OSError:
        return None
    return out.stdout if out.returncode == 0 else None


def shape(value, depth: int = 0) -> str:
    if isinstance(value, dict):
        return f"object({len(value)} keys)"
    if isinstance(value, list):
        return f"array({len(value)} items)"
    if isinstance(value, str):
        return f"string({len(value)} chars)"
    return f"{type(value).__name__}={value!r}"[:60]


def report_stats(rel: str, budget: Budget) -> dict | list | None:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        budget.line(f"{rel}: not on disk (sparse checkout? it may still be deployed)")
        return None
    size = os.path.getsize(path)
    with open(path, "rb") as fh:
        raw = fh.read()
    lines = raw.count(b"\n") + (0 if raw.endswith(b"\n") or not raw else 1)
    longest = max((len(chunk) for chunk in raw.split(b"\n")), default=0)
    budget.line(f"{rel}")
    budget.line(f"  size          {human(size)} ({size:,} bytes)")
    budget.line(f"  lines         {lines:,}")
    budget.line(f"  longest line  {longest:,} bytes"
                + ("   <-- minified: `head -N` will not bound the output" if longest > 2000 else ""))
    budget.line(f"  git           {'tracked' if is_tracked(rel) else 'untracked'}")

    parsed = None
    if rel.endswith(".json"):
        try:
            parsed = json.loads(raw.decode("utf-8", "replace"))
            budget.line("  json          parses")
        except Exception as exc:
            budget.line(f"  json          DOES NOT PARSE: {exc}")
    if isinstance(parsed, dict):
        budget.line(f"  top level     {len(parsed)} keys")
        for key in list(parsed)[:12]:
            budget.line(f"    - {key}: {shape(parsed[key])}")
        if len(parsed) > 12:
            budget.line(f"    … and {len(parsed) - 12} more keys")
    elif isinstance(parsed, list):
        budget.line(f"  top level     array of {len(parsed)}")
        if parsed:
            budget.line(f"    first item: {shape(parsed[0])}")
    return parsed


def is_tracked(rel: str) -> bool:
    try:
        out = subprocess.run(
            ["git", "ls-files", "--", rel], cwd=ROOT, capture_output=True, text=True, check=False
        )
    except OSError:
        return False
    return bool(out.stdout.strip())


def report_diff(rel: str, ref: str, budget: Budget) -> None:
    # --stat first: it is bounded by definition and answers "how big is the
    # change" without printing any of it.
    stat = subprocess.run(
        ["git", "diff", "--stat", ref, "--", rel], cwd=ROOT, capture_output=True, text=True, check=False
    )
    budget.line(f"git diff --stat {ref} -- {rel}")
    budget.write((stat.stdout or "(no change)").rstrip() + "\n")

    old = git_show(ref, rel)
    path = os.path.join(ROOT, rel)
    new = open(path, "rb").read() if os.path.exists(path) else None
    if old is None or new is None:
        budget.line(f"\n(not present in both {ref} and the working tree — nothing else to compare)")
        return
    budget.line(f"\nbytes: {human(len(old))} -> {human(len(new))} ({len(new) - len(old):+,})")

    if not rel.endswith(".json"):
        budget.line("not JSON — use `git diff --stat` / `--numstat`, never a bare `git diff`")
        return

    try:
        before, after = json.loads(old), json.loads(new)
    except Exception as exc:
        budget.line(f"one side does not parse ({exc}) — that is the change worth looking at")
        return

    if isinstance(before, dict) and isinstance(after, dict):
        added = [k for k in after if k not in before]
        removed = [k for k in before if k not in after]
        changed = [k for k in before if k in after and before[k] != after[k]]
        budget.line(f"top-level keys: +{len(added)} -{len(removed)} ~{len(changed)}")
        for label, keys in (("added", added), ("removed", removed), ("changed", changed)):
            for key in keys[:10]:
                if label == "changed":
                    budget.line(f"  ~ {key}: {shape(before[key])} -> {shape(after[key])}")
                else:
                    budget.line(f"  {'+' if label == 'added' else '-'} {key}: {shape((after if label == 'added' else before)[key])}")
            if len(keys) > 10:
                budget.line(f"  … and {len(keys) - 10} more {label}")
    elif isinstance(before, list) and isinstance(after, list):
        budget.line(f"array length: {len(before)} -> {len(after)}")

        def key_of(item):
            if isinstance(item, dict):
                for candidate in ("name", "slug", "id", "n", "title"):
                    if candidate in item:
                        return str(item[candidate])
            return json.dumps(item, sort_keys=True)[:60]

        before_keys = {key_of(i) for i in before}
        after_keys = {key_of(i) for i in after}
        added = sorted(after_keys - before_keys)
        removed = sorted(before_keys - after_keys)
        budget.line(f"items: +{len(added)} -{len(removed)}")
        for slug in added[:15]:
            budget.line(f"  + {slug}")
        if len(added) > 15:
            budget.line(f"  … and {len(added) - 15} more added")
        for slug in removed[:15]:
            budget.line(f"  - {slug}")
        if len(removed) > 15:
            budget.line(f"  … and {len(removed) - 15} more removed")
    else:
        budget.line(f"shape changed: {shape(before)} -> {shape(after)}")


def report_head(rel: str, nbytes: int, budget: Budget) -> None:
    path = os.path.join(ROOT, rel)
    with open(path, "rb") as fh:
        raw = fh.read(nbytes)
    budget.line(f"first {len(raw):,} bytes of {rel} (a prefix of a possibly-minified file —")
    budget.line("this is never the whole story, it is only enough to recognise the shape)")
    budget.write(raw.decode("utf-8", "replace"))
    budget.line("")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", help="file to inspect, relative to the repository root")
    parser.add_argument("--diff", action="store_true", help="bounded structural diff against a git ref")
    parser.add_argument("--ref", default="HEAD", help="git ref to diff against (default HEAD)")
    parser.add_argument("--head", action="store_true", help="print the first --bytes bytes")
    parser.add_argument("--bytes", type=int, default=400, help="how many bytes --head may print")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES,
                        help=f"hard ceiling on everything this script prints (default {DEFAULT_MAX_BYTES})")
    args = parser.parse_args()

    rel = os.path.relpath(os.path.abspath(os.path.join(ROOT, args.path)), ROOT)
    if rel.startswith(".."):
        print("refusing to inspect a path outside the repository", file=sys.stderr)
        return 2

    budget = Budget(max(256, args.max_bytes))
    if args.diff:
        report_diff(rel, args.ref, budget)
    elif args.head:
        report_head(rel, max(1, args.bytes), budget)
    else:
        report_stats(rel, budget)
    budget.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
