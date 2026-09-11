#!/usr/bin/env python3
"""Build Byte's public, repo-grounded knowledge index.

The browser assistant is still static and local: this file contains no user
conversation data and no model weights.  It is a deterministic, reviewable
knowledge layer built from the canonical catalogue, public project documents,
and explicitly approved learning entries.

Usage:
    python3 scripts/build-site-brain.py          # regenerate the JSON index
    python3 scripts/build-site-brain.py --check  # fail when it is stale

Learning is deliberately two-stage.  A visitor can export a review bundle
from local-ai.html; a human can turn selected items into learning/approved.json
and regenerate this file.  The live site never writes to the repository.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards" / "cards.json"
OUTPUT = ROOT / "local-ai-knowledge.json"
APPROVED = ROOT / "learning" / "approved.json"
SITE = "https://www.themostusefulsiteintheworld.com"
REPOSITORY = "https://github.com/mrpr0phecy/mrpr0phecy/blob/main"

# Public, stable documents that explain what this site is and how it is meant
# to behave. The source files are checked in, while links point either to the
# deployed guide page or to the public repository for Markdown-only documents.
# Avoid private staff reports, credentials, and generated audits.
PUBLIC_DOCS = [
    ("readme", "Repository overview", "README.md", f"{REPOSITORY}/README.md"),
    ("machine-guide", "Machine-use guide", "ai.html", f"{SITE}/ai.html"),
    ("constraints", "Site constraints", "CONSTRAINTS.md", f"{REPOSITORY}/CONSTRAINTS.md"),
    ("architecture", "Site architecture", "ARCHITECTURE.md", f"{REPOSITORY}/ARCHITECTURE.md"),
]


class VisibleText(HTMLParser):
    """Small dependency-free HTML-to-text extractor for public documentation."""

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript", "template"}:
            self.hidden += 1
        elif not self.hidden and tag.lower() in {"p", "div", "section", "article", "li", "br", "h1", "h2", "h3", "pre"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript", "template"} and self.hidden:
            self.hidden -= 1
        elif not self.hidden and tag.lower() in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "pre"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def clean_text(value: str, limit: int = 16000) -> str:
    value = html.unescape(value).replace("\xa0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    value = "\n".join(line.strip() for line in value.splitlines())
    value = value.strip()
    return value[:limit]


def read_document(relative: str) -> str:
    path = ROOT / relative
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".html":
        parser = VisibleText()
        parser.feed(raw)
        raw = " ".join(parser.parts)
    return clean_text(raw)


def source_fingerprint() -> str:
    digest = hashlib.sha256()
    for relative in ["cards/cards.json", *[source for _, _, source, _ in PUBLIC_DOCS], "learning/approved.json"]:
        path = ROOT / relative
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def approved_entries() -> list[dict[str, object]]:
    if not APPROVED.exists():
        return []
    data = json.loads(APPROVED.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("learning/approved.json must contain a JSON list")
    result: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for index, entry in enumerate(data):
        if not isinstance(entry, dict):
            raise ValueError(f"approved learning entry {index} is not an object")
        required = {"id", "content", "source"}
        missing = sorted(required - set(entry))
        if missing:
            raise ValueError(f"approved learning entry {index} is missing: {', '.join(missing)}")
        if not all(isinstance(entry[key], str) and entry[key].strip() for key in required):
            raise ValueError(f"approved learning entry {index} has an empty required field")
        entry_id = str(entry["id"]).strip()
        if entry_id in seen_ids:
            raise ValueError(f"approved learning entry {index} repeats id {entry_id!r}")
        seen_ids.add(entry_id)
        tags = entry.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags):
            raise ValueError(f"approved learning entry {index} tags must be a list of non-empty strings")
        result.append({
            "id": entry_id,
            "content": entry["content"].strip(),
            "source": entry["source"].strip(),
            "tags": tags,
        })
    return result


def build() -> dict[str, object]:
    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    if not isinstance(cards, list) or not cards:
        raise ValueError("cards/cards.json must contain a non-empty list")

    card_records = []
    for card in cards:
        name = str(card.get("name", "")).strip()
        if not name:
            continue
        card_records.append({
            "name": name,
            "title": str(card.get("title") or name),
            "description": str(card.get("description") or ""),
            "category": str(card.get("category") or "Uncategorised"),
            "url": f"{SITE}/tool.html?card={name}",
        })

    documents = []
    for doc_id, title, source, url in PUBLIC_DOCS:
        documents.append({
            "id": doc_id,
            "title": title,
            "source": source,
            "url": url,
            "content": read_document(source),
        })

    return {
        "schema_version": 1,
        "generated_from": {
            "source_hash": source_fingerprint(),
            "cards": len(card_records),
            "documents": [source for _, _, source, _ in PUBLIC_DOCS],
        },
        "assistant": {
            "name": "Byte",
            "mission": "Help people discover and use the site's browser tools accurately, privately, and without inventing capabilities.",
            "operating_rules": [
                "Use the supplied site context before general knowledge when answering questions about this site.",
                "If the context does not establish an answer, say that it was not found rather than inventing a site fact.",
                "Tool pages run in the browser; an individual tool may have a clearly labelled network exception.",
                "Do not present demo replies as model inference or claim that a local model performed an unavailable action.",
                "Medical, legal, financial, and safety outputs are general information, not professional advice.",
            ],
        },
        "documents": documents,
        "approved_learning": approved_entries(),
        "cards": card_records,
    }


def serialise(data: dict[str, object]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when the checked-in index is stale")
    args = parser.parse_args()
    try:
        output = serialise(build())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"site brain: {error}", file=sys.stderr)
        return 1

    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != output:
            print("site brain is stale — run: python3 scripts/build-site-brain.py", file=sys.stderr)
            return 1
        print("site brain OK — catalogue, public docs and approved learning are current.")
        return 0

    OUTPUT.write_text(output, encoding="utf-8")
    payload = json.loads(output)
    print(f"site brain: {payload['generated_from']['cards']} cards, {len(payload['documents'])} public documents, {len(payload['approved_learning'])} approved learning entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
