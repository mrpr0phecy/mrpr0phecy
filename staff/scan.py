#!/usr/bin/env python3
"""
staff/scan.py — map the parallel agent branches from real git state.

Self-reported agent notes go stale within hours. Branch diffs do not. This
script reads every remote `arena/*` branch, works out what each one actually
changed relative to `main`, flags files that more than one branch is editing,
and checks a handful of published claims for drift between branches.

Usage:
    python3 staff/scan.py             # print the report
    python3 staff/scan.py --write     # (re)write staff/BRANCHES.md
    python3 staff/scan.py --mine      # only collisions affecting HEAD
    python3 staff/scan.py --fetch     # refresh branch data from origin first

Read-only with respect to the repo: it never checks anything out, never
alters your working tree, and only writes staff/BRANCHES.md with --write.
It uses lightweight tags (staff-peek/*) to pin fetched commits, because
the agent sandboxes use shallow clones where remote refs are not present.
"""

import argparse
import datetime
import os
import re
import subprocess
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BOARD = os.path.join(HERE, "BRANCHES.md")
NOTES = os.path.join(HERE, "notes")

# Files where a collision actually hurts. Everything else is usually
# additive (a new card, a new page) and merges cleanly.
SHARED_FILES = [
    "index.html", "tool.html", "donate.html", "sponsor.html", "404.html",
    "listen.html", "sitemap.xml", "README.md", "AGENTS.md",
    "ARCHITECTURE.md", "INCOME.md", "LEGAL.md",
    "generate-cards-json.js", "scripts/verify.sh",
    ".github/workflows/ai-developer.yml",
]

TAG_PREFIX = "staff-peek"


def git(*args, check=False):
    """Run a git command, returning stdout (empty string on failure)."""
    try:
        r = subprocess.run(["git"] + list(args), cwd=ROOT,
                           capture_output=True, text=True, timeout=120)
    except (subprocess.TimeoutExpired, OSError):
        return ""
    if r.returncode != 0 and check:
        return ""
    return r.stdout.strip()


def remote_arena_branches():
    """[(branch_id, full_ref, sha)] for every arena/* branch on origin."""
    out = git("ls-remote", "--heads", "origin")
    found = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        sha, ref = parts
        if "/arena/" not in ref:
            continue
        name = ref.replace("refs/heads/", "")
        m = re.search(r"arena/([0-9a-f]+)", name)
        found.append((m.group(1) if m else name, name, sha))
    return sorted(found)


def ensure_local(branch_id, ref, sha):
    """Pin a remote branch to a local tag so it can be diffed in a shallow clone."""
    tag = f"{TAG_PREFIX}/{branch_id}"
    have = git("rev-parse", "-q", "--verify", tag + "^{commit}")
    if have == sha:
        return tag
    if not git("cat-file", "-e", sha + "^{commit}"):
        if subprocess.run(["git", "fetch", "-q", "--depth=1", "origin", ref],
                          cwd=ROOT, capture_output=True).returncode != 0:
            return None
        sha = git("rev-parse", "FETCH_HEAD") or sha
    subprocess.run(["git", "tag", "-f", tag, sha],
                   cwd=ROOT, capture_output=True)
    return tag


def base_ref():
    for c in ("origin/main", "main"):
        if git("rev-parse", "-q", "--verify", c + "^{commit}"):
            return c
    return ""


def changed_files(base, ref):
    out = git("diff", "--name-only", f"{base}...{ref}")
    if not out:
        out = git("diff", "--name-only", base, ref)
    return [f for f in out.splitlines() if f]


def subject(ref):
    return git("log", "-1", "--format=%s", ref)


def committed_at(ref):
    iso = git("log", "-1", "--format=%cI", ref)
    return iso[:10] if iso else "?"


def card_count(ref):
    out = git("ls-tree", "-r", "--name-only", ref, "--", "cards/")
    return sum(1 for f in out.splitlines() if f.endswith(".html"))


def file_at(ref, path):
    return git("show", f"{ref}:{path}")


def claim_probe(ref):
    """Sample published claims that have drifted between branches before."""
    probe = {}
    idx = file_at(ref, "index.html")
    if idx:
        m = re.search(r"Search\s+([0-9]+)\+?\s+free tools", idx)
        probe["claimed_tools"] = m.group(1) if m else "—"
    # Detect analytics whether inlined per page or loaded from a shared
    # file (analytics.js). Missing the shared-file case would report a
    # tracked site as clean.
    trackers = 0
    for p in ("index.html", "listen.html", "donate.html", "help.html"):
        body = file_at(ref, p)
        if body and re.search(r"googletagmanager|embed\.tawk|analytics\.js", body):
            trackers += 1
    probe["analytics_pages"] = trackers
    notrack = 0
    for p in ("index.html", "donate.html", "tool.html", "help.html"):
        body = file_at(ref, p)
        if body and re.search(r"no tracking|100% [Pp]rivate|no analytics|no cookies",
                              body, re.I):
            notrack += 1
    probe["no_track_claims"] = notrack
    return probe


def read_notes():
    """branch_id -> owner/role, from staff/notes/<id>.md front matter."""
    owners = {}
    if not os.path.isdir(NOTES):
        return owners
    for fn in os.listdir(NOTES):
        if not fn.endswith(".md") or fn.startswith("_"):
            continue
        bid = fn[:-3]
        role = ""
        try:
            with open(os.path.join(NOTES, fn), encoding="utf-8") as fh:
                for line in fh:
                    m = re.match(r"\*\*Speciality:\*\*\s*(.+)", line.strip())
                    if m:
                        role = m.group(1).strip()
                        break
        except OSError:
            pass
        owners[bid] = role
    return owners


def build(fetch=False):
    base = base_ref()
    if not base:
        print("error: cannot find main to compare against", file=sys.stderr)
        sys.exit(1)
    if fetch:
        subprocess.run(["git", "fetch", "-q", "origin", "main"],
                       cwd=ROOT, capture_output=True)

    owners = read_notes()
    rows, touch = [], defaultdict(list)

    for bid, ref, sha in remote_arena_branches():
        tag = ensure_local(bid, ref, sha)
        if not tag:
            rows.append({"id": bid, "error": "unreachable", "sha": sha[:7]})
            continue
        files = changed_files(base, tag)
        shared = [f for f in files if f in SHARED_FILES]
        for f in shared:
            touch[f].append(bid)
        rows.append({
            "id": bid, "sha": sha[:7], "tag": tag,
            "subject": subject(tag), "date": committed_at(tag),
            "files": files, "shared": shared,
            "cards": card_count(tag), "probe": claim_probe(tag),
            "role": owners.get(bid, ""),
        })

    contested = {f: b for f, b in touch.items() if len(b) > 1}
    return base, rows, contested


def render(base, rows, contested):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    L = []
    L.append("# 🌿 BRANCHES — what each parallel agent branch has changed")
    L.append("")
    L.append("<!-- AUTO-GENERATED by staff/scan.py. Do not hand-edit: -->")
    L.append("<!-- your changes will be overwritten on the next run.     -->")
    L.append("<!-- Discussion belongs in BOARD.md, which is written by hand. -->")
    L.append("")
    L.append(f"Generated **{now}** · comparing every `arena/*` branch against `{base}`.")
    L.append("")
    L.append("Measured from real branch diffs, not from what anyone reports.")
    L.append("Discussion and handover notes live in [`BOARD.md`](BOARD.md); this")
    L.append("file is only the machine-checkable half. Where they disagree,")
    L.append("believe this file for *what changed* and BOARD.md for *why*.")
    L.append("")

    live = [r for r in rows if "error" not in r]
    L.append(f"## Active branches ({len(live)})")
    L.append("")
    L.append("| Branch | Speciality | Last commit | When | Files | Cards |")
    L.append("|---|---|---|---|---|---|")
    for r in rows:
        if "error" in r:
            L.append(f"| `{r['id']}` | — | _{r['error']}_ | — | — | — |")
            continue
        subj = r["subject"][:52].replace("|", "\\|")
        L.append(f"| `{r['id']}` | {r['role'] or '—'} | {subj} | {r['date']} "
                 f"| {len(r['files'])} | {r['cards']} |")
    L.append("")

    L.append("## ⚠️ Contested files")
    L.append("")
    if not contested:
        L.append("None. Every branch is currently editing a distinct set of shared files.")
    else:
        L.append("More than one branch has modified these. Merging them in any order")
        L.append("will conflict, and the *semantic* clash is usually worse than the")
        L.append("textual one — two agents rewriting the same paragraph differently.")
        L.append("")
        L.append("| File | Branches |")
        L.append("|---|---|")
        for f in sorted(contested, key=lambda k: -len(contested[k])):
            ids = ", ".join(f"`{b}`" for b in sorted(contested[f]))
            L.append(f"| `{f}` | {len(contested[f])} — {ids} |")
    L.append("")

    L.append("## Claim drift")
    L.append("")
    L.append("Same claim, different branches. Any spread here means whichever")
    L.append("branch merges last silently overwrites the others' published facts.")
    L.append("")
    L.append("| Branch | Cards on disk | Claimed in index.html | Pages w/ analytics | Pages claiming no-tracking |")
    L.append("|---|---|---|---|---|")
    for r in live:
        p = r["probe"]
        actual, claimed = r["cards"], p.get("claimed_tools", "—")
        flag = " ⚠️" if claimed not in ("—", str(actual)) else ""
        conflict = " ⚠️" if p["analytics_pages"] and p["no_track_claims"] else ""
        L.append(f"| `{r['id']}` | {actual} | {claimed}{flag} "
                 f"| {p['analytics_pages']} | {p['no_track_claims']}{conflict} |")
    L.append("")
    L.append("⚠️ in the last column = that branch ships analytics **and** claims it")
    L.append("does not track. That combination is a live compliance problem, not a")
    L.append("style preference — see `LEGAL.md` and the board.")
    L.append("")

    L.append("## Suggested merge order")
    L.append("")
    L.append("Fewest shared-file collisions first, so each merge rebases cleanly")
    L.append("onto the last:")
    L.append("")
    for i, r in enumerate(sorted(live, key=lambda x: (len(x["shared"]), -len(x["files"]))), 1):
        s = ", ".join(f"`{f}`" for f in r["shared"]) or "no shared files"
        L.append(f"{i}. **`{r['id']}`** — {s}")
    L.append("")
    L.append("---")
    L.append("")
    L.append("Regenerate with `python3 staff/scan.py --write`.")
    return "\n".join(L) + "\n"


def report_mine(base, rows, contested):
    head = git("rev-parse", "--abbrev-ref", "HEAD")
    m = re.search(r"arena/([0-9a-f]+)", head)
    mine = m.group(1) if m else None
    if not mine:
        print(f"Not on an arena/* branch ({head}); nothing to compare.")
        return
    files = set(changed_files(base, "HEAD"))
    print(f"Branch {mine} — {len(files)} files changed vs {base}\n")
    hits = 0
    for r in rows:
        if "error" in r or r["id"] == mine:
            continue
        overlap = files & set(r["files"])
        if overlap:
            hits += 1
            print(f"  ⚠️  overlaps `{r['id']}` ({r['role'] or 'unknown'}) "
                  f"on {len(overlap)} file(s):")
            for f in sorted(overlap)[:8]:
                print(f"        {f}")
            if len(overlap) > 8:
                print(f"        … and {len(overlap) - 8} more")
    print("\n  No overlaps. Safe to push." if not hits
          else f"\n  {hits} branch(es) overlap. Read their notes/ before pushing.")


def main():
    ap = argparse.ArgumentParser(description="Generate the staffroom board.")
    ap.add_argument("--write", action="store_true", help="write staff/BRANCHES.md")
    ap.add_argument("--mine", action="store_true", help="only show my collisions")
    ap.add_argument("--fetch", action="store_true", help="refresh main from origin")
    a = ap.parse_args()

    base, rows, contested = build(fetch=a.fetch)

    if a.mine:
        report_mine(base, rows, contested)
        return

    out = render(base, rows, contested)
    if a.write:
        with open(BOARD, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"wrote {os.path.relpath(BOARD, ROOT)} "
              f"({len([r for r in rows if 'error' not in r])} branches, "
              f"{len(contested)} contested files)")
    else:
        print(out)


if __name__ == "__main__":
    main()
