#!/usr/bin/env python3
"""MCP server for The Most Useful Site in the World — zero dependencies.

Exposes the 1119-tool catalogue to any MCP client (Claude Desktop, Cursor,
Windsurf, Goose, …) over stdio, speaking JSON-RPC 2.0 directly with the
standard library only. No `mcp` package, no pip install, no API keys: if the
machine runs Python 3, it runs this server.

    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}' \\
      | python3 mcp/server.py

Protocol baseline: MCP 2024-11-05 (initialize, notifications/initialized,
tools/list, tools/call) — the dialect every client speaks. Newer clients
negotiate down to it without complaint.

Data: reads cards/cards.json from a local checkout when run inside the repo,
otherwise fetches the live manifest over HTTPS (cached in memory). Either
way the tools always reflect the current catalogue.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request

SITE = "https://www.themostusefulsiteintheworld.com"
PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "most-useful-site", "version": "1.0.0"}

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL_MANIFESTS = [
    os.path.join(HERE, "..", "cards", "cards.json"),
    os.path.join(os.getcwd(), "cards", "cards.json"),
]

_manifest: list[dict] | None = None


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def load_manifest() -> list[dict]:
    """Catalogue tools, from disk when available, else live HTTPS."""
    global _manifest
    if _manifest is not None:
        return _manifest
    for path in LOCAL_MANIFESTS:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                _manifest = json.load(fh)
            log(f"manifest: {len(_manifest)} tools from {path}")
            return _manifest
    req = urllib.request.Request(
        f"{SITE}/cards/cards.json", headers={"User-Agent": "most-useful-site-mcp/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        _manifest = json.load(resp)
    log(f"manifest: {len(_manifest)} tools from {SITE}")
    return _manifest


def tool_url(slug: str) -> str:
    return f"{SITE}/tool.html?card={slug}"


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", (text or "").lower()))


def search_tools(query: str, limit: int = 8) -> list[dict]:
    """Ranked token search: title matches beat description matches."""
    terms = _tokens(query)
    if not terms:
        return []
    scored = []
    for tool in load_manifest():
        title, desc = _tokens(tool.get("title")), _tokens(tool.get("description"))
        name, cat = _tokens(tool.get("name")), _tokens(tool.get("category"))
        score = (4 * len(terms & title) + 2 * len(terms & desc)
                 + 3 * len(terms & name) + 1 * len(terms & cat))
        # Phrase bonus: the whole query appearing in the title wins outright.
        if query.lower().strip() in (tool.get("title") or "").lower():
            score += 10
        if score:
            scored.append((score, tool))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [{
        "slug": t["name"],
        "title": " ".join((t.get("title") or t["name"]).split()),
        "category": t.get("category") or "General",
        "url": tool_url(t["name"]),
        "description": " ".join((t.get("description") or "").split())[:220],
    } for _, t in scored[: max(1, min(limit, 25))]]


def get_tool(slug: str) -> dict:
    for tool in load_manifest():
        if tool.get("name") == slug:
            title = " ".join((tool.get("title") or slug).split())
            return {
                "slug": slug, "title": title,
                "category": tool.get("category") or "General",
                "url": tool_url(slug),
                "description": " ".join((tool.get("description") or "").split()),
                "embed": (f'<iframe src="{tool_url(slug)}&embed=1" width="100%" '
                          f'height="520" style="border:0;border-radius:12px"></iframe>'),
            }
    raise KeyError(f"unknown tool slug: {slug}")


def list_categories() -> list[dict]:
    counts: dict[str, int] = {}
    for tool in load_manifest():
        cat = tool.get("category") or "General"
        counts[cat] = counts.get(cat, 0) + 1
    return [{"name": name, "tools": counts[name]} for name in sorted(counts)]


MD_PAGES = ["ai.html", "help.html", "license.html", "hire.html", "sync.html",
            "about.html"]


def get_page_markdown(page: str) -> str:
    """Prose of a key page as Markdown (the llms.txt v2 .md versions)."""
    if page not in MD_PAGES and not (
            page.startswith(("guides/", "blog/")) and page.endswith(".html")
            and ".." not in page):
        raise KeyError(f"not a published markdown page: {page}")
    local = os.path.join(HERE, "..", page + ".md")
    if os.path.exists(local):
        with open(local, encoding="utf-8") as fh:
            return fh.read()
    req = urllib.request.Request(f"{SITE}/{page}.md",
                                 headers={"User-Agent": "most-useful-site-mcp/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


TOOLS = [
    {"name": "search_tools",
     "description": ("Search 1119 free browser tools (calculators, converters, "
                     "generators, simulators). Returns slugs, titles, categories, "
                     "URLs and one-line descriptions, best match first."),
     "inputSchema": {"type": "object",
                     "properties": {"query": {"type": "string",
                                              "description": "e.g. 'mortgage payment', 'qr code', 'sleep cycle'"},
                                    "limit": {"type": "integer", "default": 8,
                                              "description": "max results (1-25)"}},
                     "required": ["query"]}},
    {"name": "get_tool",
     "description": ("Full detail for one tool by slug: description, canonical URL "
                     "and a ready-to-paste embed snippet."),
     "inputSchema": {"type": "object",
                     "properties": {"slug": {"type": "string",
                                             "description": "tool slug, e.g. 'mortgage-payment-calculator'"}},
                     "required": ["slug"]}},
    {"name": "list_categories",
     "description": "All catalogue categories with tool counts.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_page_markdown",
     "description": ("Markdown prose of a key site page (ai, help, license, hire, "
                     "sync, about, or guides/<name>.html / blog/<name>.html)."),
     "inputSchema": {"type": "object",
                     "properties": {"page": {"type": "string",
                                             "description": "e.g. 'help.html' or 'guides/mortgage.html'"}},
                     "required": ["page"]}},
]

DISPATCH = {"search_tools": lambda a: search_tools(a.get("query", ""), int(a.get("limit", 8) or 8)),
            "get_tool": lambda a: get_tool(a.get("slug", "")),
            "list_categories": lambda a: list_categories(),
            "get_page_markdown": lambda a: get_page_markdown(a.get("page", ""))}


def handle(message: dict):
    """Handle one JSON-RPC message; returns the response or None."""
    method, msg_id = message.get("method"), message.get("id")
    params = message.get("params") or {}
    if method == "initialize":
        client = (params.get("protocolVersion") or "")
        log(f"initialize from {params.get('clientInfo', {}).get('name', '?')} "
            f"(client protocol {client or '?'})")
        return {"jsonrpc": "2.0", "id": msg_id,
                "result": {"protocolVersion": PROTOCOL_VERSION,
                           "capabilities": {"tools": {}},
                           "serverInfo": SERVER_INFO}}
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name not in DISPATCH:
            return {"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32602, "message": f"unknown tool: {name}"}}
        try:
            result = DISPATCH[name](args)
        except (KeyError, ValueError) as exc:
            return {"jsonrpc": "2.0", "id": msg_id,
                    "result": {"content": [{"type": "text", "text": f"Error: {exc}"}],
                               "isError": True}}
        return {"jsonrpc": "2.0", "id": msg_id,
                "result": {"content": [{"type": "text",
                                        "text": json.dumps(result, indent=2,
                                                           ensure_ascii=False)}]}}
    if msg_id is None:  # other notifications: acknowledge by silence
        return None
    return {"jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"unknown method: {method}"}}


def main() -> int:
    log("most-useful-site MCP server: stdio ready")
    stdin = sys.stdin
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            log("ignoring non-JSON input line")
            continue
        try:
            response = handle(message)
        except Exception as exc:  # never kill the session on a bad call
            log(f"handler error: {exc}")
            response = ({"jsonrpc": "2.0", "id": message.get("id"),
                         "error": {"code": -32603, "message": "internal error"}}
                        if message.get("id") is not None else None)
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
