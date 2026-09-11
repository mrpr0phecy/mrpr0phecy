"""MCP server protocol test — full stdio session, offline, via verify.sh.

Pipes initialize → tools/list → search → get_tool → unknown-tool through
mcp/server.py and asserts the JSON-RPC shapes. Runs from the repo root so the
server reads the local cards.json (no network).
"""
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER = os.path.join(ROOT, "mcp", "server.py")


def session(messages):
    proc = subprocess.run(
        [sys.executable, SERVER],
        input="\n".join(json.dumps(m) for m in messages) + "\n",
        capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert proc.returncode == 0, f"server exited {proc.returncode}: {proc.stderr}"
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


class TestMcpServer(unittest.TestCase):
    def test_full_session(self):
        responses = session([
            {"jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                        "clientInfo": {"name": "test", "version": "0"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
             "params": {"name": "search_tools",
                       "arguments": {"query": "mortgage payment", "limit": 3}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
             "params": {"name": "get_tool",
                       "arguments": {"slug": "no-such-tool"}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
             "params": {"name": "nope", "arguments": {}}},
        ])
        by_id = {r["id"]: r for r in responses if "id" in r}
        # initialize
        self.assertEqual(by_id[1]["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(by_id[1]["result"]["serverInfo"]["name"], "most-useful-site")
        # tools/list exposes the four tools
        names = {t["name"] for t in by_id[2]["result"]["tools"]}
        self.assertEqual(names, {"search_tools", "get_tool", "list_categories",
                                 "get_page_markdown"})
        # search returns ranked, URL-bearing results
        hits = json.loads(by_id[3]["result"]["content"][0]["text"])
        self.assertLessEqual(len(hits), 3)
        self.assertGreater(len(hits), 0)
        for hit in hits:
            self.assertIn("tool.html?card=", hit["url"])
        # unknown slug -> isError result (not a protocol error)
        self.assertTrue(by_id[4]["result"]["isError"])
        # unknown tool -> JSON-RPC method error
        self.assertEqual(by_id[5]["error"]["code"], -32602)

    def test_categories_and_markdown(self):
        responses = session([
            {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
             "params": {"name": "list_categories", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
             "params": {"name": "get_page_markdown",
                       "arguments": {"page": "help.html"}}},
        ])
        cats = json.loads(responses[0]["result"]["content"][0]["text"])
        self.assertGreater(len(cats), 20)
        self.assertGreater(sum(c["tools"] for c in cats), 1000)
        md = responses[1]["result"]["content"][0]["text"]
        self.assertIn("Machine-readable Markdown version", md)


if __name__ == "__main__":
    unittest.main()
