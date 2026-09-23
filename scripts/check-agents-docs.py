#!/usr/bin/env python3
"""check-agents-docs.py — agents.html must describe the files it links.

`agents.html` is the machine-usage contract: for each endpoint it shows a worked
JSON sample, so an agent can write a parser from the page without fetching
anything first. It is hand-written, so it drifts, and by 2026-09-22 it had:

  * a `tools-index.json` sample saying `"count": 1195` (the file said 1250);
  * `"label"` where the file says `"name"`, and `"slug": "finance"` where the
    file says `"finance-and-money"`;
  * a `related.json` example listing three slugs that are not in the catalogue
    at all — `affordability`, `rentvsbuy`, `salarybudget` — so an agent
    following it would build URLs that 404;
  * `cards.json` shown as an object with five keys, when the file is a
    top-level array and every entry carries seven.

None of that is visible to the gate: the samples are inside <pre> blocks, the
numbers are not tool counts, and the page renders perfectly. This check re-reads
each sample and compares it with the file its own paragraph links:

  * every key the sample shows must exist in the real file (one level into
    arrays of objects), and
  * a "count" the sample states must equal the file's own count.

Usage:
    python3 scripts/check-agents-docs.py            # exit 1 on drift
"""
from __future__ import annotations
import html as _html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "agents.html")
# The contract samples: a linked path, then the JSON that describes it.
SAMPLE_RE = re.compile(
    r'<a href="(?P<href>[^"]+)"><code>[^<]+</code></a>.*?<pre><code>(?P<body>\{\s*")',
    re.S)
BLOCK_RE = re.compile(r"<pre><code>(\{.*?)</code></pre>", re.S)


def load_sample_body(href: str) -> list[str]:
    """The JSON bodies of the <pre> block(s) that follow a link to `href`."""
    page = open(PAGE, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'<a href="%s"><code>' % re.escape(href), page):
        tail = page[m.end():]
        block = BLOCK_RE.search(tail)
        if block and tail[:block.start()].count("<h2") == 0:
            out.append(_html.unescape(block.group(1)))
    return out


def compare(href: str, where: str, sample, real, problems: list[str]) -> None:
    """Every key the sample shows must exist in the real file, one level into
    arrays of objects (the samples are illustrations, not full documents)."""
    if isinstance(real, list):
        real = real[0] if real else {}
    if not isinstance(sample, dict) or not isinstance(real, dict):
        return
    missing = set(sample) - set(real)
    if missing:
        problems.append(
            f"{href}: {where} documents key(s) {sorted(missing)} that the file does "
            f"not have (the file has {sorted(real)})")
    for k, v in sample.items():
        if k not in real:
            continue
        rv = real[k]
        if isinstance(v, list) and v and isinstance(v[0], dict):
            compare(href, f"{where}.{k}[0]", v[0],
                    rv[0] if isinstance(rv, list) and rv else rv, problems)
        elif isinstance(v, dict):
            compare(href, f"{where}.{k}", v, rv, problems)


def check_values(href: str, sample: dict, real, problems: list[str]) -> None:
    """Keys can be right while the example values are invented. The old
    related.json sample listed three slugs that are not tools; an agent
    following it builds URLs that 404, and nothing on the page says so."""
    if href == "related.json":
        known = set(real)
        for slug, neighbours in sample.items():
            if slug not in known:
                problems.append(f"related.json: the example key {slug!r} is not a "
                                f"tool slug in the file")
            for n in neighbours:
                if n not in known:
                    problems.append(f"related.json: {slug} is shown as related to "
                                    f"{n!r}, which is not in the file — an agent "
                                    f"following the sample would build a URL that 404s")
    elif href == "tools-index.json":
        slugs = {t.get("slug") for t in real.get("tools", [])}
        cats = {c.get("slug") for c in real.get("categories", [])}
        for t in sample.get("tools", []):
            if t.get("slug") not in slugs:
                problems.append(f"tools-index.json: example tool {t.get('slug')!r} is "
                                f"not in the file")
        for c in sample.get("categories", []):
            if c.get("slug") not in cats:
                problems.append(f"tools-index.json: example category "
                                f"{c.get('slug')!r} is not in the file")
    elif href == "cards/cards.json":
        names = {c.get("name") for c in real}
        files = {c.get("file") for c in real}
        for key, known in (("name", names), ("file", files)):
            v = sample.get(key)
            if v is not None and v not in known:
                problems.append(f"cards.json: example {key} {v!r} is not in the file")


def main() -> int:
    problems: list[str] = []
    checked = 0
    for href in ("cards/cards.json", "related.json", "tools-index.json"):
        path = os.path.join(ROOT, href)
        if not os.path.exists(path):
            problems.append(f"agents.html links {href}, which is not in the repository")
            continue
        real = json.load(open(path, encoding="utf-8"))
        bodies = load_sample_body(href)
        if not bodies:
            problems.append(f"{href}: no JSON sample found in agents.html — the "
                            f"page is the contract, so a missing sample is a failure, "
                            f"not a shrug")
            continue
        for body in bodies:
            try:
                sample = json.loads(body)
            except json.JSONDecodeError as e:
                problems.append(f"{href}: the sample on agents.html is not valid JSON "
                                f"({e.msg} at line {e.lineno})")
                continue
            compare(href, "the sample", sample, real, problems)
            check_values(href, sample, real, problems)
            if isinstance(sample, dict) and "count" in sample and isinstance(real, dict) \
                    and "count" in real and sample["count"] != real["count"]:
                problems.append(
                    f"{href}: agents.html says \"count\": {sample['count']}, the file "
                    f"says {real['count']}")
            checked += 1
    if problems:
        print(f"AGENTS.HTML DRIFTED — {len(problems)} problem(s):")
        for p in problems:
            print(f"  {p}")
        print("\nFix agents.html, not this check: the samples are the contract an "
              "agent writes its parser from.")
        return 1
    print(f"AGENTS DOCS OK — {checked} sample(s) match the files they describe "
          f"(keys and counts).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
