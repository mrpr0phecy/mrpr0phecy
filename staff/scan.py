#!/usr/bin/env python3
"""Read-only branch evidence. Offline by default; --fetch explicitly refreshes refs.

No checkouts, tags, local branches, resets or pushes. Empty committed diffs stay
empty. Unknown shallow ancestry is labelled, never disguised as a merge-base
comparison. --mine includes staged, unstaged, deleted and untracked files.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent


class GitError(RuntimeError):
    pass


def git(root, *args, check=True, timeout=30):
    try:
        result = subprocess.run(["git", *args], cwd=root, text=True,
                                capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GitError(f"git {args[0]} failed or timed out; state is unknown") from exc
    if check and result.returncode:
        raise GitError(f"git {args[0]} failed; state is unknown (no success inferred)")
    return result


def zpaths(value):
    return [p for p in value.split("\0") if p]


def claim_filename(branch):
    # Git ref names cannot contain a newline, but preserve the full identity,
    # not the old truncated eight-character branch id.
    return quote(branch, safe="") + ".json"


def parse_time(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("timestamps must include a UTC offset")
    return date.astimezone(timezone.utc)


def valid_scope(scope):
    return isinstance(scope, str) and bool(scope.rstrip("/")) and not scope.startswith("/") and "\\" not in scope and not re.search(r"[\x00-\x1f*?\[\]]", scope) and all(p not in ("", ".", "..", ".git") for p in scope.rstrip("/").split("/"))


def overlaps(a, b):
    """Exact paths and explicitly declared directory scopes; no ambiguous globs."""
    return a == b or (a.endswith("/") and b.startswith(a)) or (b.endswith("/") and a.startswith(b))


def validate_claim(claim):
    if not isinstance(claim, dict) or claim.get("version") != 1:
        raise ValueError("unsupported claim schema")
    for key in ("branch", "role", "task", "updatedAt", "expiresAt"):
        if not isinstance(claim.get(key), str) or not claim[key].strip():
            raise ValueError(f"missing {key}")
    if claim.get("status") not in ("active", "released", "blocked"):
        raise ValueError("unknown claim status")
    if not isinstance(claim.get("files"), list) or not claim["files"] or not all(valid_scope(p) for p in claim["files"]):
        raise ValueError("invalid file scopes")
    parse_time(claim["updatedAt"])
    parse_time(claim["expiresAt"])
    return claim


def local_claims(root):
    claims, warnings = [], []
    for file in sorted((Path(root) / "staff/claims").glob("*.json")):
        try:
            claim = validate_claim(json.loads(file.read_text()))
            if file.name != claim_filename(claim["branch"]):
                raise ValueError("filename does not match branch")
            claims.append(claim)
        except (OSError, ValueError, TypeError) as exc:
            warnings.append(f"{file.relative_to(root)}: invalid claim ({exc}); inspect before claiming work")
    return claims, warnings


def comparison(root, base, ref):
    ancestor = git(root, "merge-base", "--is-ancestor", ref, base, check=False)
    if ancestor.returncode == 0:
        return {"state": "merged", "comparison": "ancestry", "files": [], "uncertain": False}
    if ancestor.returncode not in (0, 1):
        raise GitError("Cannot determine branch ancestry")
    common = git(root, "merge-base", base, ref, check=False)
    if common.returncode == 0 and common.stdout.strip():
        files = zpaths(git(root, "diff", "--no-renames", "--name-only", "-z", common.stdout.strip(), ref).stdout)
        return {"state": "active" if files else "no-unique-diff", "comparison": "merge-base", "files": files, "uncertain": False}
    if common.returncode != 1:
        raise GitError("Cannot determine merge base")
    files = zpaths(git(root, "diff", "--no-renames", "--name-only", "-z", base, ref).stdout)
    return {"state": "unknown" if files else "tree-identical", "comparison": "tree-only (ancestry unavailable)", "files": files, "uncertain": bool(files)}


def build(root=ROOT, fetch=False, base=None, now=None):
    root = Path(root).resolve()
    now = now or datetime.now(timezone.utc)
    if fetch:
        # Remote-tracking refs only. Filtering keeps sparse agent workspaces small.
        git(root, "fetch", "--prune", "--no-tags", "--depth=100", "--filter=blob:none", "origin",
            "+refs/heads/main:refs/remotes/origin/main",
            "+refs/heads/arena/*:refs/remotes/origin/arena/*", timeout=120)
    if base is None:
        base = next((ref for ref in ("origin/main", "main") if git(root, "rev-parse", "--verify", ref + "^{commit}", check=False).returncode == 0), None)
    if not base:
        raise GitError("No main comparison ref. Run --fetch when connected; do not guess a baseline.")
    base_sha = git(root, "rev-parse", "--verify", base + "^{commit}").stdout.strip()
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    head_sha = git(root, "rev-parse", "HEAD").stdout.strip()
    refs = git(root, "for-each-ref", "--format=%(refname)%00%(objectname)", "refs/remotes/origin/arena/", "refs/heads/arena/").stdout
    sources = {}
    for line in refs.splitlines():
        ref, sha = line.split("\0")
        name = ref.removeprefix("refs/remotes/origin/").removeprefix("refs/heads/")
        if name not in sources or ref.startswith("refs/heads/"):
            sources[name] = (ref, sha)
    sources[branch] = ("HEAD", head_sha)
    claims, warnings = local_claims(root)
    by_branch = {claim["branch"]: claim for claim in claims}
    rows = []
    dirty = sorted(set(zpaths(git(root, "diff", "--no-renames", "--name-only", "-z", "HEAD").stdout) +
                       zpaths(git(root, "ls-files", "--others", "--exclude-standard", "-z").stdout)))
    for name, (ref, sha) in sorted(sources.items()):
        row = {"branch": name, "ref": ref, "sha": sha, "current": name == branch, **comparison(root, base_sha, ref)}
        if name == branch and dirty:
            row["files"] = sorted(set(row["files"] + dirty))
            row["state"] = "working-tree"
        row["subject"] = git(root, "log", "-1", "--format=%s", ref).stdout.strip()
        row["committedAt"] = git(root, "log", "-1", "--format=%cI", ref).stdout.strip()
        # A peer may have announced a scope that has not merged into this checkout.
        if name != branch:
            claim_path = "staff/claims/" + claim_filename(name)
            contents = git(root, "show", f"{ref}:{claim_path}", check=False)
            if contents.returncode == 0:
                try:
                    remote_claim = validate_claim(json.loads(contents.stdout))
                    if remote_claim["branch"] != name:
                        raise ValueError("claim branch mismatch")
                    if name not in by_branch or parse_time(remote_claim["updatedAt"]) > parse_time(by_branch[name]["updatedAt"]):
                        by_branch[name] = remote_claim
                except (ValueError, TypeError) as exc:
                    warnings.append(f"{name}: invalid remote claim ({exc})")
        rows.append(row)
    enriched_claims = []
    for claim in by_branch.values():
        expired = parse_time(claim["expiresAt"]) <= now
        enriched_claims.append({**claim, "expired": expired})
    touches = {}
    for row in rows:
        if row["state"] in ("merged", "no-unique-diff", "tree-identical"):
            continue
        for file in row["files"]:
            touches.setdefault(file, []).append(row["branch"])
    contested = {file: names for file, names in touches.items() if len(names) > 1}
    mine = next(row for row in rows if row["current"])
    mine_files = set(mine["files"])
    mine_claim = by_branch.get(branch)
    if mine_claim and mine_claim["status"] == "active" and parse_time(mine_claim["expiresAt"]) > now:
        mine_files.update(mine_claim["files"])
    collisions = []
    for row in rows:
        if row["current"] or row["state"] in ("merged", "no-unique-diff", "tree-identical"):
            continue
        common = sorted({p for p in row["files"] if any(overlaps(p, mine) for mine in mine_files)})
        if common:
            collisions.append({"branch": row["branch"], "files": common, "source": row["comparison"], "uncertain": row["uncertain"]})
    for claim in enriched_claims:
        if claim["branch"] == branch or claim["status"] != "active" or claim["expired"]:
            continue
        common = sorted({p for p in claim["files"] if any(overlaps(p, mine) for mine in mine_files)})
        if common:
            collisions.append({"branch": claim["branch"], "files": common, "source": "active claim", "uncertain": False})
    return {
        "version": 2, "generatedAt": now.isoformat(), "base": base, "baseSha": base_sha,
        "remoteState": "refreshed from origin this run" if fetch else "cached refs only; use --fetch for a remote refresh",
        "currentBranch": branch, "dirtyFiles": dirty, "branches": rows, "claims": enriched_claims,
        "contested": contested, "mine": collisions, "warnings": warnings,
        "uncertain": any(r["uncertain"] for r in rows) or bool(warnings),
    }


def md(value):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("|", "\\|").replace("`", "'").replace("\n", " ")


def render(report):
    lines = ["# BRANCHES — measured coordination snapshot", "", "<!-- AUTO-GENERATED by staff/scan.py. Do not hand-edit. -->", "",
             f"Generated **{md(report['generatedAt'])}** against `{md(report['base'])}` (`{report['baseSha'][:12]}`).",
             f"Remote state: **{md(report['remoteState'])}**.", "",
             "This is evidence, not a lock, a declaration that another session is live, or a guarantee that a merge is safe.",
             "Unknown ancestry is labelled tree-only; those differences may already have landed through a squash or salvage merge.", "",
             "## Branches", "", "| Branch | State | Comparison | Files | Latest commit |", "|---|---|---|---|---|"]
    for row in report["branches"]:
        lines.append(f"| `{md(row['branch'])}` | {md(row['state'])} | {md(row['comparison'])} | {len(row['files'])} | {md(row['subject'])} |")
    lines += ["", "## Overlaps affecting this session", ""]
    if not report["mine"]:
        lines.append("No overlap found in the scanned snapshot. Refresh remote refs and read the board before relying on this.")
    for hit in report["mine"]:
        lines.append(f"- `{md(hit['branch'])}` ({md(hit['source'])}): " + ", ".join(f"`{md(f)}`" for f in hit["files"]))
    lines += ["", "## File-scope claims", "", "| Branch | Role | Status | Expires (UTC) | Task |", "|---|---|---|---|---|"]
    for claim in report["claims"]:
        status = claim["status"] + (" — expired; verify before taking over" if claim["expired"] and claim["status"] == "active" else "")
        lines.append(f"| `{md(claim['branch'])}` | {md(claim['role'])} | {md(status)} | {md(claim['expiresAt'])} | {md(claim['task'])} |")
    if not report["claims"]:
        lines.append("| — | — | No claims in this snapshot | — | — |")
    lines += ["", "## Snapshot limits", "", f"- {len(report['dirtyFiles'])} staged/unstaged/untracked path(s) included for the current branch.",
              "- Expired claims are not silently reassigned. Released claims are handover records, not reservations.",
              "- Merged ancestors and empty committed diffs are excluded from collision warnings.",
              "- Branches absent from cached refs cannot be assessed offline."]
    lines += [f"- Warning: {md(w)}" for w in report["warnings"]]
    lines += ["", "Refresh: `python3 staff/scan.py --fetch --write`. Session view: `python3 staff/scan.py --mine`.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="explicitly refresh origin/main and arena remote-tracking refs")
    parser.add_argument("--write", action="store_true", help="write staff/BRANCHES.md")
    parser.add_argument("--mine", action="store_true", help="show this branch's overlaps, including uncommitted files")
    parser.add_argument("--json", action="store_true", help="structured evidence on stdout")
    parser.add_argument("--check", action="store_true", help="exit 1 on overlap, 2 on uncertain/incomplete evidence")
    parser.add_argument("--base", help="explicit comparison ref, normally origin/main")
    args = parser.parse_args()
    try:
        report = build(fetch=args.fetch, base=args.base)
        if args.write:
            (ROOT / "staff/BRANCHES.md").write_text(render(report))
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        elif args.mine:
            print(f"{report['currentBranch']} · {report['remoteState']}")
            print(f"{len(report['dirtyFiles'])} uncommitted path(s) included.")
            for hit in report["mine"]:
                print(f"OVERLAP {hit['branch']} ({hit['source']}): " + ", ".join(hit["files"]))
            if not report["mine"]:
                print("No overlap found in this snapshot. This is not a lock or a merge guarantee.")
            if report["uncertain"]:
                print("NOTE: incomplete ancestry or claims; inspect the full report before proceeding.")
        elif not args.write:
            print(render(report))
        if args.check:
            return 2 if report["uncertain"] else 1 if report["mine"] else 0
        return 0
    except (GitError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
