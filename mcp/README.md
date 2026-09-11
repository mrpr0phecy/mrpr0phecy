# MCP server — the catalogue as agent tools

`server.py` exposes the site's 1119 free browser tools to any MCP client over
stdio. It speaks JSON-RPC 2.0 directly with the standard library only — no
`mcp` package, no `pip install`, no API keys. If the machine runs Python 3,
it runs this server.

## Tools

| Tool | Does |
|---|---|
| `search_tools` | Ranked search over title/description/category/slug → slugs, titles, URLs, one-liners |
| `get_tool` | Full detail for one slug + canonical URL + ready embed snippet |
| `list_categories` | All categories with tool counts |
| `get_page_markdown` | Key pages (`help.html`, `guides/mortgage.html`, …) as Markdown |

Data comes from `cards/cards.json` in a local checkout when present, else the
live manifest over HTTPS — results always reflect the current catalogue.

## Install

Clone the repo (or copy `mcp/server.py` anywhere — it fetches the live
manifest when no checkout surrounds it), then register it with your client:

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "most-useful-site": {
      "command": "python3",
      "args": ["/absolute/path/to/mrpr0phecy/mcp/server.py"]
    }
  }
}
```

**Cursor** — `.cursor/mcp.json` (same shape). **Windsurf** —
`~/.codeium/windsurf/mcp_config.json` (same shape). **Goose** — add a stdio
extension with command `python3` and the same path argument. Restart the
client; the four tools appear in its tool list.

Try: *"Using most-useful-site, find me a mortgage overpayment calculator."*

## Publish checklist (human steps, ~1 hour total)

Do these in order — the registry feeds the directories, so upstream first:

1. **Official MCP Registry** — the source of truth clients read. Install
   `mcp-publisher`, prove the `com.themostusefulsiteintheworld` namespace
   (domain proof), and publish `mcp/server.json`.
2. **Smithery** — `smithery mcp publish` from the repo, or claim the
   auto-detected listing at smithery.ai and fix the description/links.
3. **Glama** (`glama.ai/mcp`) — auto-indexes GitHub; claim the listing and
   verify ownership for the verified tier.
4. **mcp.so** — Submit button → repo URL + the `server.json` metadata.
5. **PulseMCP** — Submit button in the nav; same metadata.
6. **modelcontextprotocol/servers** — PR adding this server to the community
   README section (backlink + trust signal).
7. **punkpeye/awesome-mcp-servers** — PR with one line in the right category.
8. **ChatGPT App Directory** — OpenAI's Apps SDK is MCP-based and general
   submissions are open via the Developer Platform (`chatgpt.com/apps` is
   the directory). This server is the functional core of that submission;
   the app wrapper + review are the remaining work. 800M+ users makes this
   the highest-leverage item on the list — see `AI-DISCOVERY.md`.

## Notes

- Protocol baseline is MCP 2024-11-05; newer clients negotiate down to it.
- The server never writes anything and only ever GETs public URLs. Logs go
  to stderr; stdout carries protocol frames only.
- `staff/tests/test_mcp.py` pipes a full session (initialize → list →
  search → error paths) through the server offline; it runs in `verify.sh`.
