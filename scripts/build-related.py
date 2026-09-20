#!/usr/bin/env python3
"""build-related.py — regenerate related.json, the computed related-tools map.

    python3 scripts/build-related.py           # rewrite related.json
    python3 scripts/build-related.py --check   # fail on drift (verify.sh)

The contract this file has to meet is the one changelog.html and sitemap.html
both publish: "computed related-tools for all N tools, ranked by category +
title keyword overlap + description word overlap", one entry per tool, five
suggestions each. It had 533 entries for a 1,195-tool catalogue, three keys
that were page names rather than tools (`case-studies`, `guides`, `launch`),
and list lengths from 1 to 5 — so two thirds of the catalogue had no related
tools at all, and an agent that trusted the advertised map got a 404-shaped
shrug for most of it.

Scoring (deterministic, no randomness, no network):

    +10  same category
    + 3  per word shared with the title
    + 1  per word shared with the description

Words are lowercased, split on non-alphanumerics, and filtered to length > 3
minus a stop list of words that appear in most descriptions ("calculator",
"free", "browser", "tool"…), which would otherwise make every tool related to
every other tool. Ties break on slug, so the same catalogue always produces
byte-identical output — that is what makes `--check` meaningful.

`tool.html` computes its own related rail at runtime (it already has the
catalogue in memory); this file is the machine-facing copy that agents, the
production monitor and llms-full.txt are pointed at, so it must not disagree
with the catalogue it was derived from.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from discovery_catalogue import ROOT, load_catalogue  # noqa: E402

OUT = os.path.join(ROOT, "related.json")
SUGGESTIONS = 5
CATEGORY_WEIGHT = 10
TITLE_WEIGHT = 3
DESCRIPTION_WEIGHT = 1

# Words that carry no discriminating signal in this catalogue.
STOP = {
    "calculator", "calculate", "calculation", "calculations", "converter",
    "convert", "conversion", "generator", "generate", "generation", "tracker",
    "track", "tracking", "planner", "plan", "planning", "estimator",
    "estimate", "estimation", "builder", "create", "creates", "created",
    "browser", "browsers", "online", "free", "tool", "tools", "utility",
    "utilities", "widget", "widgets", "website", "websites", "private",
    "privacy", "instant", "instantly", "quick", "quickly", "simple", "easily",
    "every", "everything", "anything", "something", "nothing", "without",
    "with", "from", "into", "onto", "your", "you", "yours", "their", "they",
    "them", "the", "and", "for", "are", "was", "were", "been", "have", "has",
    "had", "will", "would", "could", "should", "can", "cannot", "not", "but",
    "all", "any", "per", "via", "use", "uses", "using", "used", "user",
    "users", "this", "that", "these", "those", "there", "here", "where",
    "when", "what", "which", "who", "whom", "how", "why", "than", "then",
    "also", "just", "like", "make", "makes", "made", "more", "most", "some",
    "such", "over", "under", "between", "across", "before", "after", "while",
    "about", "around", "against", "because", "both", "each", "either",
    "enough", "even", "ever", "never", "always", "often", "only", "other",
    "others", "own", "same", "so", "too", "very", "well", "way", "ways",
    "work", "works", "working", "worked", "need", "needs", "needed", "want",
    "wants", "wanted", "get", "gets", "give", "gives", "given", "keep",
    "keeps", "let", "lets", "may", "might", "must", "shall", "one", "two",
    "three", "four", "five", "first", "second", "third", "next", "last",
    "new", "old", "good", "best", "better", "real", "really", "right",
    "left", "up", "down", "out", "off", "on", "in", "at", "by", "to", "of",
    "if", "or", "as", "is", "it", "its", "be", "we", "us", "our", "my", "me",
    "no", "yes", "do", "does", "did", "done", "data", "input", "inputs",
    "output", "outputs", "result", "results", "value", "values", "number",
    "numbers", "based", "base", "help", "helps", "helper", "check",
    "checks", "checked", "see", "sees", "seen", "know", "knows", "known",
    "thing", "things", "lot", "lots", "kind", "kinds", "type", "types",
    "version", "versions", "example", "examples", "plus", "minus", "within",
    "whether", "which", "while", "who", "whom", "whose", "why",
}

WORD_RE = re.compile(r"[a-z0-9]+")


def words(text: str) -> set[str]:
    return {
        w for w in WORD_RE.findall((text or "").lower())
        if len(w) > 3 and w not in STOP
    }


def build_map() -> dict[str, list[str]]:
    """Score every tool against every other tool — via an inverted index.

    The obvious double loop is 1.4 million pairwise set intersections (~15s),
    which is too slow for a `--check` that runs on every verify. Accumulating
    through word -> [tools] postings visits only pairs that share a word, and
    the category bonus is one pass over the 27 groups. Same scores, same
    ordering, a fraction of the time.
    """
    catalogue = load_catalogue()
    tools = sorted(catalogue.tools, key=lambda t: t.name)
    names = [t.name for t in tools]

    title_words: dict[str, set[str]] = {}
    desc_words: dict[str, set[str]] = {}
    for tool in tools:
        title_words[tool.name] = words(tool.title) | words(tool.name.replace("-", " "))
        desc_words[tool.name] = words(tool.description)

    scores: dict[str, dict[str, int]] = {name: {} for name in names}

    def accumulate(postings: dict[str, list[str]], weight: int) -> None:
        for word, holders in postings.items():
            if len(holders) < 2:
                continue
            for i, a in enumerate(holders):
                row = scores[a]
                for b in holders[i + 1:]:
                    row[b] = row.get(b, 0) + weight
                    scores[b][a] = scores[b].get(a, 0) + weight

    title_index: dict[str, list[str]] = {}
    for name in names:
        for word in title_words[name]:
            title_index.setdefault(word, []).append(name)
    desc_index: dict[str, list[str]] = {}
    for name in names:
        for word in desc_words[name]:
            desc_index.setdefault(word, []).append(name)

    accumulate(title_index, TITLE_WEIGHT)
    accumulate(desc_index, DESCRIPTION_WEIGHT)

    by_category: dict[str, list[str]] = {}
    for tool in tools:
        by_category.setdefault(tool.category, []).append(tool.name)
    for group in by_category.values():
        for i, a in enumerate(group):
            row = scores[a]
            for b in group[i + 1:]:
                row[b] = row.get(b, 0) + CATEGORY_WEIGHT
                scores[b][a] = scores[b].get(a, 0) + CATEGORY_WEIGHT

    out: dict[str, list[str]] = {}
    for name in names:
        ranked = sorted(scores[name].items(), key=lambda pair: (-pair[1], pair[0]))
        out[name] = [other for other, score in ranked[:SUGGESTIONS] if score > 0]
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    args = parser.parse_args()

    expected = build_map()
    # Sorted keys: the file is diffed by humans and by --check, and a stable
    # order makes "what changed when I added one tool" a one-line answer.
    text = json.dumps(expected, indent=2, sort_keys=True, ensure_ascii=False) + "\n"

    current = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            current = fh.read()

    if args.check:
        problems: list[str] = []
        if current != text:
            if current is None:
                problems.append("related.json is missing")
            else:
                try:
                    live = json.loads(current)
                except Exception:
                    live = None
                if not isinstance(live, dict):
                    problems.append("related.json does not parse as an object")
                else:
                    catalogue_names = set(expected)
                    live_names = set(live)
                    missing = sorted(catalogue_names - live_names)
                    phantom = sorted(live_names - catalogue_names)
                    if missing:
                        problems.append(f"{len(missing)} tools have no entry (e.g. {', '.join(missing[:5])})")
                    if phantom:
                        problems.append(f"{len(phantom)} entries are not tools (e.g. {', '.join(phantom[:5])})")
                    if not missing and not phantom:
                        stale = sorted(n for n in catalogue_names & live_names if live[n] != expected[n])
                        problems.append(f"{len(stale)} entries are out of date (e.g. {', '.join(stale[:5])})")
        if problems:
            for problem in problems:
                print(f"related.json DRIFT — {problem}")
            print("  fix: python3 scripts/build-related.py")
            return 1
        print(f"related.json OK — {len(expected)} tools × {SUGGESTIONS} related, ranked by category + keyword overlap")
        return 0

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"related.json regenerated — {len(expected)} tools × {SUGGESTIONS} related")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
