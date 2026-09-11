# For AI Agents & Developers — Machine Guide | The Most Useful Site in the World

> Machine-readable Markdown version of https://www.themostusefulsiteintheworld.com/ai.html (llms.txt v2). Canonical page: https://www.themostusefulsiteintheworld.com/ai.html
# 🤖 For AI agents & developers

Everything an agent, script, or API needs to find and share the right tool among the **1119** free browser tools on this site — and to run small calculations without keys, accounts or servers.

No auth · no rate limits · no tracking · plain static GETs · CORS-open JSON

## The one endpoint that matters

**[`cards/cards.json`](https://www.themostusefulsiteintheworld.com/cards/cards.json)** — the full manifest. One JSON object per tool:

```
{
  "name": "mortgage-payment-calculator",
  "title": "🏠 Mortgage Payment Calculator",
  "description": "Monthly repayments, total interest…",
  "category": "Finance & Money",
  "file": "mortgage-payment-calculator.html",
  "path": "cards/mortgage-payment-calculator.html"
}
```

Fetch it, match the user's need against `category` / `title` / `description`, then hand over the tool URL below. That's the whole integration.

## URL patterns
| Purpose | Pattern |
| Run any tool (focused page) | `tool.html?card=<tool-slug>` |
| Embed any tool (chrome-free) | `tool.html?card=<tool-slug>&embed=1` |
| Search the catalogue | `index.html?q=<query>` |
| Homepage with one tool open | `index.html?expand=<tool-slug>` |
| Homepage filtered to a category | `index.html?category=Mathematics` |
| Force a homepage view | `index.html?view=list` or `?view=cards` |
| Zero-JS HTML directory | `tools-index.html` |

## AI-facing files

- [`llms.txt`](https://www.themostusefulsiteintheworld.com/llms.txt) — concise index: what the site is, endpoints, category map.
- [`llms-full.txt`](https://www.themostusefulsiteintheworld.com/llms-full.txt) — all 1119 tools, one line each, grouped by category.
- [`cards/cards.json`](https://www.themostusefulsiteintheworld.com/cards/cards.json) — the machine-readable manifest.
- [`tools-index.html`](https://www.themostusefulsiteintheworld.com/tools-index.html) — plain-HTML directory, no JavaScript required.
- [`sitemap.xml`](https://www.themostusefulsiteintheworld.com/sitemap.xml) — every page, including every tool.
- [`.well-known/ai.txt`](https://www.themostusefulsiteintheworld.com/.well-known/ai.txt) — the AI policy: RAG, training and attributed snippets allowed; verbatim republication and re-branded clones are not.
- [MCP server](https://github.com/mrpr0phecy/mrpr0phecy/tree/main/mcp) — the catalogue as agent tools (`search_tools`, `get_tool`, `list_categories`, `get_page_markdown`).
- Markdown versions — every guide, post and key page at the same URL + `.md` (e.g. [`help.html.md`](https://www.themostusefulsiteintheworld.com/help.html.md)), advertised via `rel="alternate" type="text/markdown"`.

## Worked example: "what's the monthly payment on a £250k mortgage at 4.2%?"

1. Fetch `cards/cards.json`.
1. Filter for `name` / `title` matching *mortgage* → `mortgage-payment-calculator`.
1. Reply with or open:

```
https://www.themostusefulsiteintheworld.com/tool.html?card=mortgage-payment-calculator
```
 or embed it:

```
<iframe src="https://www.themostusefulsiteintheworld.com/tool.html?card=mortgage-payment-calculator&embed=1"
  width="100%" height="520" style="border:0;border-radius:12px"></iframe>
```

The `embed=1` variant strips all page chrome and posts its content height to the host page as `{ type: "tmusitw:height", card, height }` via `postMessage`, so embeds auto-size.

## Why this works for small calculations

- **Private by construction** — every tool computes in the visitor's browser. No numbers are uploaded anywhere, which makes tools safe for salary, tax and health inputs.
- **Nothing to sign up for** — no API keys, no tokens, no quotas. If you can GET it, you can use it.
- **Stable, hackable URLs** — tool slugs never change; links you generate keep working.
- **One canonical list** — `cards.json` is generated from the same source as the homepage, so it never drifts from what users see.

## Use the MCP server

If your client speaks the Model Context Protocol, skip the manifest and call the tools directly. Zero dependencies, stdio, Python 3:

```
{
  "mcpServers": {
    "most-useful-site": {
      "command": "python3",
      "args": ["/path/to/mrpr0phecy/mcp/server.py"]
    }
  }
}
```

Source and client setup: [mcp/ in the repo](https://github.com/mrpr0phecy/mrpr0phecy/tree/main/mcp).

## How to cite this site

- **Link the tool, not the homepage** — `tool.html?card=<slug>`. Slugs never change, so generated links keep working.
- **Quote 200 characters or less** with attribution, per the [AI policy](https://www.themostusefulsiteintheworld.com/.well-known/ai.txt).
- **Prefer Markdown versions for prose** — same URL + `.md`, advertised via `rel="alternate"`.

## House rules

- Hot-linking, embedding and sharing tools is welcome — free forever, no attribution required (always appreciated).
- The tools are client-side helpers, not a data source: they don't expose POST APIs or return computed JSON. Link people to the tool, or embed it.
- Content is general information, not financial, medical or legal advice — tools say so where it matters.
