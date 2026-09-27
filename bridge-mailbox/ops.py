#!/usr/bin/env python3
"""Send a sealed job to the owner's computer and wait for the result.

The key is BRIDGE_KEY or --key-file. It is never written by this tool.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seal  # noqa: E402

REPO = "mrpr0phecy/mrpr0phecy"
BRANCH = "arena/01a0e326-mrpr0phecy"
API = "https://api.github.com"
ROOT = Path(__file__).resolve().parents[1]


def eprint(*args):
    print(*args, file=sys.stderr, flush=True)


def token() -> str:
    value = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if not value:
        raise SystemExit("GH_TOKEN is not set")
    return value.strip()


def api(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | None]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Authorization", "Bearer " + token())
    req.add_header("User-Agent", "arena-drive-bridge")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
        except json.JSONDecodeError:
            parsed = {"message": detail[:400]}
        return exc.code, parsed


def contents(name: str) -> str:
    ref = urllib.parse.quote(BRANCH, safe="")
    return "/repos/%s/contents/bridge-mailbox/%s?ref=%s" % (REPO, name, ref)


def read_note(name: str) -> tuple[dict, str | None]:
    code, data = api("GET", contents(name))
    if code != 200 or not isinstance(data, dict):
        raise SystemExit("could not read %s (%s)" % (name, code))
    text = base64.b64decode(data["content"]).decode("utf-8")
    return json.loads(text), data.get("sha")


def write_note(name: str, note: dict, message: str) -> None:
    _current, sha = read_note(name)
    body = {
        "message": message,
        "content": base64.b64encode(json.dumps(note).encode("utf-8")).decode("ascii"),
        "branch": BRANCH,
        "sha": sha,
    }
    path = "/repos/%s/contents/bridge-mailbox/%s" % (REPO, name)
    code, data = api("PUT", path, body)
    if code not in (200, 201):
        detail = data.get("message") if isinstance(data, dict) else data
        raise SystemExit("could not write %s (%s): %s" % (name, code, detail))


def load_key(args: argparse.Namespace) -> bytes:
    if args.key_file:
        text = Path(args.key_file).read_text(encoding="utf-8")
    else:
        text = os.environ.get("BRIDGE_KEY", "")
    if not text:
        raise SystemExit("set BRIDGE_KEY")
    return seal.load_key(text)


def show_result(payload: dict) -> int:
    if payload.get("error"):
        eprint(payload["error"])
    if payload.get("stdout"):
        sys.stdout.write(payload["stdout"])
        if not str(payload["stdout"]).endswith("\n"):
            sys.stdout.write("\n")
    if payload.get("stderr"):
        eprint(str(payload["stderr"]).rstrip())
    if payload.get("entries"):
        for entry in payload["entries"]:
            print("%s\t%s\t%s" % (entry.get("type", "?")[:1], entry.get("size", ""), entry.get("name")))
    if payload.get("text") and not payload.get("binary"):
        sys.stdout.write(payload["text"])
        if not str(payload["text"]).endswith("\n"):
            sys.stdout.write("\n")
    eprint("[bridge] id=%s ok=%s cwd=%s" % (payload.get("id"), payload.get("ok"), payload.get("cwd")))
    return 0 if payload.get("ok") else 1


def wait_for(key: bytes, job_id: str, timeout: float) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        note, _sha = read_note("result.json")
        if str(note.get("id")) == job_id and note.get("box"):
            return seal.open_box(key, note["box"])
        time.sleep(5)
    raise SystemExit("no result for %s. Is the agent still running on the computer?" % job_id)


def send(key: bytes, job: dict, timeout: float) -> int:
    job_id = "j" + secrets.token_hex(6)
    job["id"] = job_id
    note = {"v": 1, "id": job_id, "box": seal.seal(key, job)}
    write_note("job.json", note, "bridge job %s" % job_id)
    eprint("[bridge] sent %s" % job_id)
    payload = wait_for(key, job_id, timeout)
    return show_result(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Talk to the drive bridge")
    parser.add_argument("--key-file", default="")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    exe = sub.add_parser("exec")
    exe.add_argument("--timeout", type=float, default=120)
    exe.add_argument("command", nargs="+")
    listing = sub.add_parser("ls")
    listing.add_argument("path")
    listing.add_argument("--timeout", type=float, default=60)
    read = sub.add_parser("read")
    read.add_argument("path")
    read.add_argument("--timeout", type=float, default=60)
    remove = sub.add_parser("remove")
    remove.add_argument("path")
    remove.add_argument("--recursive", action="store_true")
    remove.add_argument("--timeout", type=float, default=60)
    args = parser.parse_args()
    key = load_key(args)
    if args.cmd == "status":
        note, _sha = read_note("result.json")
        print("result id: %s" % note.get("id"))
        if note.get("box"):
            return show_result(seal.open_box(key, note["box"]))
        print("no sealed result yet")
        return 0
    if args.cmd == "exec":
        return send(key, {"op": "exec", "command": " ".join(args.command), "timeout": args.timeout}, args.timeout + 40)
    if args.cmd == "ls":
        return send(key, {"op": "list", "path": args.path, "timeout": args.timeout}, args.timeout + 30)
    if args.cmd == "read":
        return send(key, {"op": "read", "path": args.path, "timeout": args.timeout}, args.timeout + 30)
    if args.cmd == "remove":
        return send(key, {
            "op": "remove",
            "path": args.path,
            "confirm_path": args.path,
            "recursive": args.recursive,
            "timeout": args.timeout,
        }, args.timeout + 30)
    raise SystemExit("unknown command")


if __name__ == "__main__":
    raise SystemExit(main())
