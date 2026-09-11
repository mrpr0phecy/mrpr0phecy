#!/usr/bin/env python3
"""check-ai-discovery.py — the AI-retrieval surface stays intact.

    python3 scripts/check-ai-discovery.py

Runs in verify.sh (section 13). Everything here is offline, deterministic and
fast: robots.txt crawler coverage, llms.txt spec shape + resolvable links,
Markdown-version freshness and head tags, JSON-LD validity + entity graph,
IndexNow key, and MCP wiring. If any of it rots, assistants silently stop
finding the site — so it fails the merge gate instead.
"""
from __future__ import annotations

import glob
import importlib.util
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.themostusefulsiteintheworld.com"

AI_AGENTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot",
             "anthropic-ai", "Claude-SearchBot", "Claude-User", "PerplexityBot",
             "Perplexity-User", "Google-Extended", "Googlebot", "Applebot",
             "Applebot-Extended", "FacebookBot", "Meta-ExternalAgent",
             "Bytespider", "Amazonbot", "cohere-ai", "CCBot", "YouBot",
             "DuckAssistBot", "bingbot"]

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = ""):
    print(("OK   " if ok else "FAIL ") + name + (f": {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def robots_blocks() -> dict[str, list[str]]:
    blocks: dict[str, list[str]] = {}
    current: list[str] = []
    with open(os.path.join(ROOT, "robots.txt"), encoding="utf-8") as fh:
        for line in fh.read().splitlines():
            line = line.strip()
            if line.lower().startswith("user-agent:"):
                current = []
                blocks[line.split(":", 1)[1].strip()] = current
            elif current is not None and line and not line.startswith("#"):
                current.append(line)
    return blocks


def check_robots():
    blocks = robots_blocks()
    missing = [a for a in AI_AGENTS
               if "Allow: /" not in [r.replace(" ", "")[:7] and r for r in blocks.get(a, [])]]
    # (normalise spacing before comparing)
    missing = []
    for agent in AI_AGENTS:
        rules = [re.sub(r"\s+", " ", r).strip() for r in blocks.get(agent, [])]
        if "Allow: /" not in rules:
            missing.append(agent)
    check("robots.txt allows all AI crawlers",
          not missing, f"missing: {missing}" if missing else f"{len(AI_AGENTS)} agents")


def _md_links(line: str) -> list[str]:
    return re.findall(r"\]\(([^)\s]+)\)", line)


def _local_exists(url: str) -> bool:
    if "<" in url or ">" in url:  # template placeholder, e.g. <tool-slug>
        return True
    if not url.startswith(SITE + "/"):
        return True  # off-site link (repo, youtube) — not our filesystem
    rel = url[len(SITE) + 1:].split("#")[0].split("?")[0]
    return os.path.exists(os.path.join(ROOT, rel))


def check_llms():
    with open(os.path.join(ROOT, "llms.txt"), encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    first = next((line for line in lines if line.strip()), "")
    h1_ok = first.startswith("# ") and not first.startswith("## ")
    quote_ok = any(line.startswith(">") for line in lines[:12])
    h2s = [line for line in lines if line.startswith("## ")]
    bad_links, missing_files = [], []
    for line in lines:
        if line.strip().startswith("- ["):
            urls = _md_links(line)
            if not urls:
                bad_links.append(line[:60])
            for url in urls:
                if not url.startswith("https://"):
                    bad_links.append(url)
                elif not _local_exists(url):
                    missing_files.append(url)
    detail = f"H1={h1_ok} quote={quote_ok} H2={len(h2s)}"
    if bad_links:
        detail += f" bad={bad_links[:3]}"
    if missing_files:
        detail += f" missing={missing_files[:3]}"
    check("llms.txt v2 shape + resolvable links",
          h1_ok and quote_ok and len(h2s) >= 5 and not bad_links and not missing_files,
          detail)
    with open(os.path.join(ROOT, "llms-full.txt"), encoding="utf-8") as fh:
        full = fh.read().splitlines()
    full_h2 = sum(1 for line in full if line.startswith("## "))
    check("llms-full.txt shape", full[0].startswith("# ") and full_h2 >= 20,
          f"{full_h2} category sections")


def check_md():
    proc = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build-md.py"),
                           "--check"], capture_output=True, text=True, cwd=ROOT)
    check("markdown versions fresh", proc.returncode == 0,
          (proc.stdout + proc.stderr).strip().splitlines()[:3] and
          "; ".join((proc.stdout + proc.stderr).strip().splitlines()[:3])
          or f"{len(glob.glob(os.path.join(ROOT, '**', '*.html.md'), recursive=True))} pages")
    untagged = []
    for md in glob.glob(os.path.join(ROOT, "**", "*.html.md"), recursive=True):
        src = md[: -len(".md")]
        try:
            with open(src, encoding="utf-8") as fh:
                head = fh.read(6000)
        except FileNotFoundError:
            untagged.append(os.path.relpath(src, ROOT) + " (source missing)")
            continue
        if 'rel="alternate" type="text/markdown"' not in head or \
                'rel="describedby"' not in head:
            untagged.append(os.path.relpath(src, ROOT))
    check("sources advertise their markdown", not untagged,
          f"untagged: {untagged[:4]}" if untagged else "rel=alternate + describedby")


def check_files():
    ai_txt = os.path.join(ROOT, ".well-known", "ai.txt")
    try:
        with open(ai_txt, encoding="utf-8") as fh:
            policy = fh.read()
        policy_ok = "llms.txt" in policy and "hello@" in policy
    except FileNotFoundError:
        policy_ok = False
    check(".well-known/ai.txt present + linked", policy_ok)
    check(".nojekyll present (markdown served raw)",
          os.path.exists(os.path.join(ROOT, ".nojekyll")))
    keys = [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.txt"))
            if re.fullmatch(r"[0-9a-f]{32}\.txt", os.path.basename(p))]
    key_ok = False
    if len(keys) == 1:
        with open(os.path.join(ROOT, keys[0]), encoding="utf-8") as fh:
            key_ok = fh.read().strip() == keys[0][:-4]
    check("IndexNow key file valid", key_ok, keys[0][:13] + "…" if keys else "none found")


def _jsonld_blocks(rel: str) -> list[dict]:
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        page = fh.read()
    return [json.loads(m) for m in
            re.findall(r'(?s)<script type="application/ld\+json">(.*?)</script>', page)]


def check_jsonld():
    try:
        blocks = {rel: _jsonld_blocks(rel) for rel in ("index.html", "about.html", "ai.html")}
    except json.JSONDecodeError as exc:
        check("JSON-LD parses on index/about/ai", False, str(exc)[:120])
        return
    blob = json.dumps(blocks)
    entity_ok = ("youtube.com/@MrProphecy" in blob and
                 "github.com/mrpr0phecy/mrpr0phecy" in blob)
    check("JSON-LD parses on index/about/ai", True,
          f"{sum(len(v) for v in blocks.values())} blocks")
    check("entity graph (sameAs) present", entity_ok)


def check_mcp():
    meta_path = os.path.join(ROOT, "mcp", "server.json")
    try:
        with open(meta_path, encoding="utf-8") as fh:
            meta = json.load(fh)
        meta_ok = all(k in meta for k in
                      ("name", "title", "repository", "version", "transports"))
    except (FileNotFoundError, json.JSONDecodeError):
        meta_ok = False
    check("mcp/server.json valid", meta_ok)
    spec = importlib.util.spec_from_file_location(
        "mcp_server", os.path.join(ROOT, "mcp", "server.py"))
    try:
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        hits = mod.search_tools("mortgage payment", 3)
        md = mod.get_page_markdown("help.html")
        wire_ok = (len(hits) > 0 and "tool.html?card=" in hits[0]["url"]
                   and "Machine-readable Markdown version" in md)
        detail = f"{len(hits)} hits"
    except Exception as exc:  # noqa: BLE001 — the gate must report, not crash
        wire_ok, detail = False, f"{type(exc).__name__}: {exc}"[:120]
    check("mcp server wired to live catalogue", wire_ok, detail)


def main() -> int:
    check_robots()
    check_llms()
    check_md()
    check_files()
    check_jsonld()
    check_mcp()
    print(f"\n{len(FAILURES)} failing" if FAILURES else "\nAI discovery OK — all checks passed.")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
