#!/usr/bin/env python3
"""Branch-scoped, expiring work claims and explicit handovers (stdlib only).

Claims are public coordination evidence, not locks, messages or owner approval.
This tool never changes git refs, commits, pushes, merges or edits another
branch's claim. Share claims through the normal reviewed GitHub workflow.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

from scan import ROOT, GitError, build, claim_filename, git, overlaps, parse_time, validate_claim, valid_scope


def current_branch(root):
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if not branch.startswith("arena/"):
        raise ValueError("Claims require the current arena/* session branch; never switch branches to claim work.")
    return branch


def write_claim(root, claim):
    validate_claim(claim)
    folder = Path(root) / "staff/claims"
    folder.mkdir(parents=True, exist_ok=True)
    file = folder / claim_filename(claim["branch"])
    temporary = file.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(claim, indent=2, ensure_ascii=False) + "\n")
        temporary.replace(file)
    finally:
        temporary.unlink(missing_ok=True)
    return file


def read_own(root, branch):
    file = Path(root) / "staff/claims" / claim_filename(branch)
    if not file.exists():
        return None
    claim = validate_claim(json.loads(file.read_text()))
    if claim["branch"] != branch:
        raise ValueError("Existing claim does not match this branch")
    return claim


def claim_work(root, role, task, files, hours=24, acknowledge="", now=None, evidence=None):
    now = now or datetime.now(timezone.utc)
    branch = current_branch(root)
    members = json.loads((Path(root) / "scripts/ai-staff.json").read_text())["members"]
    if role not in {m["id"] for m in members}:
        raise ValueError("Unknown role; choose an id from node scripts/ai-developer.js staff")
    if not task.strip() or len(task) > 600:
        raise ValueError("Task must be 1–600 characters describing the user outcome")
    if not 1 <= hours <= 72:
        raise ValueError("A claim must last 1–72 hours")
    if not files or not all(valid_scope(p) for p in files):
        raise ValueError("Use exact relative files or directory/ scopes; no traversal, .git, control characters or wildcards")
    previous = read_own(root, branch)
    if previous and previous["status"] == "active" and parse_time(previous["expiresAt"]) > now:
        raise ValueError("This branch already has an active claim. Renew or release it explicitly.")
    evidence = evidence or build(root=root, now=now)
    concerns = []
    for row in evidence["branches"]:
        if row["current"] or row["state"] in ("merged", "tree-identical", "no-unique-diff"):
            continue
        if any(overlaps(scope, changed) for scope in files for changed in row["files"]):
            concerns.append(f"{row['branch']}: overlapping {row['comparison']} evidence")
    for claim in evidence["claims"]:
        if claim["branch"] == branch or claim["status"] != "active":
            continue
        if any(overlaps(a, b) for a in files for b in claim["files"]):
            concerns.append(f"{claim['branch']}: {'expired' if claim['expired'] else 'active'} file-scope claim")
    concerns.extend(evidence["warnings"])
    if concerns and len(acknowledge.strip()) < 20:
        raise ValueError("Coordinate before claiming overlapping/uncertain work: " + "; ".join(concerns) + ". After review, use --acknowledge with the reason; this is not owner approval.")
    event = {"at": now.isoformat(), "action": "claimed", "summary": task.strip()}
    claim = {
        "version": 1, "branch": branch, "role": role, "task": task.strip(),
        "status": "active", "files": sorted(set(files)), "updatedAt": now.isoformat(),
        "expiresAt": (now + timedelta(hours=hours)).isoformat(),
        "baseline": evidence["baseSha"], "remoteState": evidence["remoteState"],
        "coordination": {"concerns": concerns, "acknowledgement": acknowledge.strip()},
        "events": [*(previous or {}).get("events", []), event],
    }
    write_claim(root, claim)
    return claim


def update_claim(root, action, hours=24, summary="", validation="", next_steps="", now=None):
    now = now or datetime.now(timezone.utc)
    branch = current_branch(root)
    claim = read_own(root, branch)
    if not claim or claim["status"] != "active":
        raise ValueError("This branch has no active claim; nothing was changed")
    if action == "renew":
        if not 1 <= hours <= 72:
            raise ValueError("A claim must last 1–72 hours")
        # An expired claim needs a fresh collision check, not a quiet lease extension.
        if parse_time(claim["expiresAt"]) <= now:
            raise ValueError("Claim expired. Reclaim with a fresh collision check rather than renewing stale ownership.")
        claim["expiresAt"] = (now + timedelta(hours=hours)).isoformat()
    elif action in ("release", "block"):
        if not summary.strip() or not validation.strip() or not next_steps.strip():
            raise ValueError("A handover requires --summary, --validation and --next (use 'none' explicitly when appropriate)")
        claim["status"] = "released" if action == "release" else "blocked"
        claim["handover"] = {"summary": summary.strip(), "validation": validation.strip(), "next": next_steps.strip()}
        claim["expiresAt"] = now.isoformat()
    else:
        raise ValueError("Unknown claim action")
    claim["updatedAt"] = now.isoformat()
    claim.setdefault("events", []).append({"at": now.isoformat(), "action": action, "summary": summary.strip() or "Renewed after checking the current task."})
    write_claim(root, claim)
    return claim


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    claim = commands.add_parser("claim", help="announce a bounded scope on the current session branch")
    claim.add_argument("--role", required=True)
    claim.add_argument("--task", required=True)
    claim.add_argument("--files", nargs="+", required=True)
    claim.add_argument("--hours", type=int, default=24)
    claim.add_argument("--acknowledge", default="", help="explain reviewed overlap; never a substitute for owner approval")
    claim.add_argument("--fetch", action="store_true", help="refresh remote evidence before checking scope")
    renew = commands.add_parser("renew")
    renew.add_argument("--hours", type=int, default=24)
    for action in ("release", "block"):
        handover = commands.add_parser(action)
        handover.add_argument("--summary", required=True)
        handover.add_argument("--validation", required=True)
        handover.add_argument("--next", dest="next_steps", required=True)
    args = parser.parse_args()
    try:
        if args.action == "claim":
            evidence = build(fetch=args.fetch)
            result = claim_work(ROOT, args.role, args.task, args.files, args.hours, args.acknowledge, evidence=evidence)
        else:
            result = update_claim(ROOT, args.action, hours=getattr(args, "hours", 24), summary=getattr(args, "summary", ""), validation=getattr(args, "validation", ""), next_steps=getattr(args, "next_steps", ""))
        print(f"{result['status']}: staff/claims/{claim_filename(result['branch'])}")
        print("Record context on staff/BOARD.md. This local claim is not a distributed lock or a delivered/merged change.")
        return 0
    except (GitError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
