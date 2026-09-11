#!/usr/bin/env python3
"""Prepare reviewed Byte examples for an optional local fine-tuning run.

This is an export step, not a training service.  It emits JSONL in the common
messages format used by local SFT tooling; no provider, API key, model weight,
or network request is involved.  Only approved entries that contain both
``question`` and ``answer`` become training examples.

Examples:
    python3 scripts/prepare-byte-dataset.py
    python3 scripts/prepare-byte-dataset.py --output /tmp/byte-sft.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPROVED = ROOT / "learning" / "approved.json"
SYSTEM = (
    "You are Byte, a site-aware local assistant. Use the supplied site facts "
    "accurately, say when evidence is missing, and never claim to have taken "
    "an action you could not take."
)


def clean(value: object, field: str, index: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"entry {index} needs a non-empty {field}")
    text = value.strip()
    if len(text) > 5000:
        raise ValueError(f"entry {index} {field} is over 5,000 characters")
    credential_markers = ("gh" + "o_", "gh" + "p_", "github" + "_pat_")
    if any(marker in text for marker in credential_markers) or re.search(r"sk-[A-Za-z0-9]", text):
        raise ValueError(f"entry {index} looks like it contains a credential")
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, help="write JSONL here instead of stdout")
    args = parser.parse_args()
    try:
        entries = json.loads(APPROVED.read_text(encoding="utf-8"))
        if not isinstance(entries, list):
            raise ValueError("learning/approved.json must contain a list")
        lines = []
        skipped = 0
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ValueError(f"entry {index} is not an object")
            if "question" not in entry or "answer" not in entry:
                skipped += 1
                continue
            question = clean(entry["question"], "question", index)
            answer = clean(entry["answer"], "answer", index)
            source = clean(entry.get("source", "human review"), "source", index)
            lines.append(json.dumps({
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": answer},
                ],
                "metadata": {"id": entry.get("id", f"entry-{index}"), "source": source},
            }, ensure_ascii=False))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"byte dataset: {error}", file=sys.stderr)
        return 1

    output = "\n".join(lines) + ("\n" if lines else "")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    print(f"byte dataset: {len(lines)} examples prepared; {skipped} approved retrieval-only entries skipped", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
