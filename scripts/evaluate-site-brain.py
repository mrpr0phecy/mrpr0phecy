#!/usr/bin/env python3
"""Run cheap, deterministic grounding regressions for Byte's site brain.

This does not pretend to evaluate a language model. It checks the layer we own:
that representative questions still retrieve the intended repository source.
The same knowledge index is then supplied to whichever local model the browser
can run.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "local-ai-knowledge.json"
CASES = ROOT / "learning" / "evaluation.json"


def terms(value: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2}


def score(query: str, entry: dict[str, object]) -> int:
    wanted = terms(query)
    title = terms(str(entry.get("title", "")))
    category = terms(str(entry.get("category", "")))
    content = terms(str(entry.get("description", "")) + " " + str(entry.get("content", "")))
    return sum((9 if word in title else 5 if word in category else 2 if word in content else 0) for word in wanted)


def main() -> int:
    try:
        knowledge = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))
        cases = json.loads(CASES.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"site brain evaluation: {error}", file=sys.stderr)
        return 1

    cards = knowledge.get("cards", [])
    documents = knowledge.get("documents", [])
    entries = cards + documents
    failures: list[str] = []
    if len(cards) != knowledge.get("generated_from", {}).get("cards"):
        failures.append("knowledge card count does not match generated metadata")

    for case in cases:
        query = str(case.get("query", ""))
        ranked = sorted(entries, key=lambda entry: (-score(query, entry), str(entry.get("title", ""))))[:5]
        expected_card = case.get("expected_card")
        expected_document = case.get("expected_document")
        if expected_card and not any(entry.get("name") == expected_card for entry in ranked):
            failures.append(f"{case.get('id', query)} did not retrieve card {expected_card!r}; top results: {[entry.get('name') or entry.get('id') for entry in ranked]}")
        if expected_document and not any(entry.get("id") == expected_document for entry in ranked):
            failures.append(f"{case.get('id', query)} did not retrieve document {expected_document!r}; top results: {[entry.get('name') or entry.get('id') for entry in ranked]}")
        for phrase in case.get("must_contain", []):
            if not any(str(phrase).lower() in json.dumps(entry, ensure_ascii=False).lower() for entry in ranked):
                failures.append(f"{case.get('id', query)} top results do not contain {phrase!r}")

    if failures:
        print("site brain evaluation FAILED")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"site brain evaluation OK — {len(cases)} grounding cases, {len(cards)} cards, {len(documents)} documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
