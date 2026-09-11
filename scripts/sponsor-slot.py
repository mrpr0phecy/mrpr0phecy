#!/usr/bin/env python3
"""sponsor-slot.py — manage the single sponsor placement inside a tool card.

    python3 scripts/sponsor-slot.py set <slug> --name NAME --url URL --line LINE
    python3 scripts/sponsor-slot.py clear <slug>
    python3 scripts/sponsor-slot.py list

A sponsored tool carries exactly one placement, labelled "Sponsored", as a
static HTML block marked <!-- SPONSOR-SLOT -->. No third-party scripts, no
pixels, no beacons — the sponsor's link is a plain anchor. This is guarded by
check-finance.js ("sponsorship — the 5% rule"): more than one slot per card,
or a slot without the label, fails the check.

The block is inserted immediately after the card's <h2> title element so it
renders under the tool heading without touching any logic. `clear` removes
it. `list` shows every card currently carrying one.

Example:
    python3 scripts/sponsor-slot.py set mortgage --name "Acme Brokers" \\
        --url "https://example.com/mortgages" --line "Mortgages explained by humans, not chatbots."
"""
from __future__ import annotations

import argparse
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "cards")
MARK = "<!-- SPONSOR-SLOT -->"
H2 = re.compile(r"(?is)(<h2\b[^>]*>.*?</h2>)")


def card_path(slug: str) -> str:
    name = slug[:-5] if slug.endswith(".html") else slug
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", name):
        raise SystemExit(f"refusing suspicious slug: {slug!r}")
    p = os.path.join(CARDS, name + ".html")
    if not os.path.exists(p):
        raise SystemExit(f"no such card: {name}.html")
    return p


def block(name: str, url: str, line: str) -> str:
    if not url.startswith(("https://", "http://")):
        raise SystemExit("url must start with http(s)://")
    n = html.escape(name, quote=True)
    u = html.escape(url, quote=True)
    ln = html.escape(line, quote=True)
    bare = html.escape(re.sub(r"^https?://(www\.)?", "", url).rstrip("/"), quote=True)
    return (
        f"\n{MARK}\n"
        f'<p class="sponsor-slot" style="font-size:.8rem;color:var(--text-secondary);'
        f'border:1px dashed rgba(45,212,255,.4);border-radius:10px;padding:8px 12px;margin:10px 0;">'
        f'<span style="font-size:.62rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;'
        f'border:1px solid var(--border-light);padding:2px 7px;border-radius:5px;margin-right:8px;">Sponsored</span>'
        f"<strong>{n}</strong> — {ln} "
        f'<a href="{u}" target="_blank" rel="noopener sponsored" style="color:var(--accent);">'
        f"{bare}</a></p>\n"
    )


def cmd_set(slug: str, name: str, url: str, line: str) -> int:
    p = card_path(slug)
    txt = open(p, encoding="utf-8").read()
    if MARK in txt:
        print(f"{slug}: already carries a sponsor slot — clear it first")
        return 1
    m = H2.search(txt)
    if not m:
        print(f"{slug}: no <h2> found, refusing to guess placement")
        return 1
    txt = txt[: m.end(1)] + block(name, url, line) + txt[m.end(1) :]
    open(p, "w", encoding="utf-8").write(txt)
    print(f"{slug}: sponsor slot added for {name}")
    return 0


def cmd_clear(slug: str) -> int:
    p = card_path(slug)
    txt = open(p, encoding="utf-8").read()
    if MARK not in txt:
        print(f"{slug}: no sponsor slot to clear")
        return 1
    # Remove the marker plus the single <p class="sponsor-slot"> that follows it.
    new, n = re.subn(
        r"(?s)\n?<!-- SPONSOR-SLOT -->\n<p class=\"sponsor-slot\".*?</p>\n?", "", txt, count=1
    )
    if n != 1 or MARK in new:
        print(f"{slug}: unexpected slot shape — edit by hand")
        return 1
    open(p, "w", encoding="utf-8").write(new)
    print(f"{slug}: sponsor slot cleared")
    return 0


def cmd_list() -> int:
    found = []
    for f in sorted(os.listdir(CARDS)):
        if not f.endswith(".html"):
            continue
        txt = open(os.path.join(CARDS, f), encoding="utf-8").read()
        n = txt.count(MARK)
        if n:
            m = re.search(r"(?s)<strong>(.*?)</strong>", txt[txt.index(MARK) :][:600])
            found.append((f, n, html.unescape(m.group(1)) if m else "?"))
    if not found:
        print("no sponsored cards")
    for f, n, name in found:
        flag = "" if n == 1 else f"  <-- {n} SLOTS (violates the 5% rule)"
        print(f"{f}: {name}{flag}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("set")
    s.add_argument("slug")
    s.add_argument("--name", required=True)
    s.add_argument("--url", required=True)
    s.add_argument("--line", required=True)
    c = sub.add_parser("clear")
    c.add_argument("slug")
    sub.add_parser("list")
    a = ap.parse_args()
    if a.cmd == "set":
        return cmd_set(a.slug, a.name, a.url, a.line)
    if a.cmd == "clear":
        return cmd_clear(a.slug)
    return cmd_list()


if __name__ == "__main__":
    sys.exit(main())
