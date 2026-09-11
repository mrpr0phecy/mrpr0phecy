# AI-DISCOVERY.md — how every major AI finds this site

Goal: any AI assistant, on any service, can find, read, cite and *use* the
tools — via training data, live search/RAG, direct fetch, or the MCP server.
This file records what each service consumes, what we did about it, and how
to verify it worked. Policy: robots.txt allows every AI crawler and
`.well-known/ai.txt` permits training + retrieval; quote ≤200 chars.

## The map (one row per retrieval path)

| Service | How it retrieves us | What we did | Verify |
|---|---|---|---|
| ChatGPT search | Bing index (OAI-SearchBot) + training (GPTBot) | Allowed both in robots.txt; IndexNow pings Bing weekly; Bing submission via Webmaster Tools (human step below) | Ask with Search on: "site:themostusefulsiteintheworld.com mortgage calculator" |
| ChatGPT app directory | MCP-based Apps SDK, `chatgpt.com/apps` | `mcp/` server is the functional core; app wrapper + Developer Platform submission = the remaining human step | Directory listing (post-submission) |
| Claude web search | Claude-SearchBot index + Claude-User fetch | Allowed in robots.txt; llms.txt + .md fetch targets | Ask with Web Search on for a niche tool (e.g. "Sinclair score calculator") |
| Claude Desktop / Cursor / Windsurf | MCP stdio servers | `mcp/server.py` (zero-dep) + `server.json` + setup docs; registry + directory submissions (human steps below) | Install locally, ask it to find a tool |
| Google AI Overviews / AI Mode | Organic top-10 + Googlebot crawl | SEO as usual (sitemap, schema, freshness); Google-Extended allowed; FAQPage JSON-LD on help/license/hire/sync; answer-first pages | GSC Performance → AI Overview impressions; probe queries |
| Gemini (Deep Research) | Google index + training signals | Same as above + llms.txt (Gemini docs team publishes their own — the format is read) | Probe a research-style prompt |
| Perplexity | PerplexityBot index + live fetch, Reddit-weighted | Allowed both bots; quotable answer-first copy; Reddit presence = ongoing human work | Ask Perplexity a "best free X calculator" question |
| Copilot | Bing index | IndexNow + Bing Webmaster Tools (same as ChatGPT search row) | Ask Copilot with web grounding |
| Meta AI / Llama | Meta-ExternalAgent, FacebookBot, CCBot | Allowed all three | Llama probe prompts (training lag applies) |
| Apple Intelligence | Applebot + training token | Allowed both | Spotlight/Siri suggestions over time |
| Training corpora generally | GPTBot, anthropic-ai, CCBot, Bytespider, Amazonbot, cohere-ai | Allowed all (deliberate: MIT-licensed tools, CC-BY feed — obscurity costs more than inclusion) | Log-file analysis for crawler hits |
| Coding agents | llms.txt → .md pages → cards.json | llms.txt v2 (spec shape, file lists, citing guide) + 23 `.html.md` versions with rel=alternate/describedby | Point any agent at /llms.txt and ask it to find + embed a tool |
| Any HTTP-capable agent | Cards manifest + URL patterns | `cards/cards.json`, `ai.html` guide, `tools-index.html` zero-JS directory, stable slugs | `curl` the manifest; check-ai-discovery.py |

## What shipped in-repo (all automated or one-click)

- **robots.txt** — 20 AI user-agents explicitly allowed, with the one-line
  flip to search-only documented in a comment.
- **llms.txt (v2 shape)** — H1 + blockquote + H2 file lists, citing guide,
  machine-interfaces section; regenerated weekly by the promo refresh.
- **23 Markdown versions** — `scripts/build-md.py` converts the prose pages
  (ai, help, license, hire, sync, about, 13 guides, 4 blog posts) to
  same-URL-plus-`.md`, advertised via `rel="alternate"` + `rel="describedby"`.
  `.nojekyll` guarantees GitHub Pages serves them as-is.
- **MCP server** — `mcp/server.py`: `search_tools`, `get_tool`,
  `list_categories`, `get_page_markdown` over stdio, zero dependencies,
  tested offline in `verify.sh` via `staff/tests/test_mcp.py`.
- **IndexNow** — `scripts/promo/indexnow.py` pings Bing/Yandex/Naver with the
  week's URLs on every refresh; `--all` bootstraps the full sitemap once.
- **Entity graph** — Organization + founder Person `sameAs` (YouTube, GitHub)
  in index/about JSON-LD, so engines resolve *who* runs the site.
- **Citation guidance** — `ai.html` + `llms.txt` tell assistants to link the
  tool (stable slugs), quote ≤200 chars, and prefer `.md` for prose.
- **Gate** — `scripts/check-ai-discovery.py` runs in `verify.sh`: robots
  coverage, llms.txt spec shape, .md freshness + head tags, JSON-LD validity,
  IndexNow key, MCP wiring.

## Human steps (the parts code can't do)

1. **Bing Webmaster Tools** (~10 min, highest leverage): verify the domain,
   submit `sitemap.xml`. This + IndexNow covers ChatGPT search and Copilot.
2. **MCP Registry** (~20 min): `mcp-publisher` + domain proof, publish
   `mcp/server.json` (`com.themostusefulsiteintheworld/tools`). Then claim
   Smithery, Glama, mcp.so, PulseMCP; PR the two awesome lists (details in
   `mcp/README.md`).
3. **ChatGPT App Directory** (~1 day + review wait): wrap `mcp/` per the Apps
   SDK, submit via the OpenAI Developer Platform. Biggest audience on Earth.
4. **Reddit presence** (ongoing): Perplexity over-indexes Reddit — answer
   genuinely where tools fit (r/personalfinance, r/UKPersonalFinance,
   niche hobby subs). Never spam; one good comment beats ten links.
5. **Weekly probes** (10 min): ask the top 10 target queries on ChatGPT,
   Perplexity, Claude, Gemini; record citations. Baseline rate = the KPI.
   Candidate prompts live in the promo kit's tracking notes.

## Tracking (how you know it's working)

- **GA4**: referrals with medium `ai_search` from chatgpt.com, perplexity.ai,
  gemini.google.com, copilot.microsoft.com (automatic — just look).
- **Search Console**: Performance report shows AI Overview impressions.
- **Server logs**: GitHub Pages gives no logs — instead watch `ai_search`
  referrals and probe results. (If traffic ever justifies Cloudflare in
  front, log crawler hits there.)
- **Paid tools** (later, if ever): Profound, Otterly, Ahrefs Brand Radar
  track citations across engines. Manual probes first.

## Costs

£0. Every protocol above is free. The only spends are human minutes.
