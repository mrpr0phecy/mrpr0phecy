#!/usr/bin/env python3
"""Agent for the owner's computer.

Polls the sealed mailbox and runs one job at a time. Prints every command
here before it runs. Ctrl+C stops it. Touch ~/.arena-bridge/PAUSE to hold.

This is not a perfect sandbox. It refuses sudo, disk wipes, and known
secret paths, then runs other commands as the user who started it.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import signal
import stat as statmod
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import safety  # noqa: E402
import seal  # noqa: E402

REPO = "mrpr0phecy/mrpr0phecy"
BRANCH = "arena/01a0e326-mrpr0phecy"
API = "https://api.github.com"
POLL_SECONDS = 12
MAX_OUTPUT = 160_000


def eprint(*args):
    print(*args, file=sys.stderr, flush=True)


def api(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: float = 40) -> tuple[int, dict | list | None]:
    url = API + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "arena-drive-bridge")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
        except json.JSONDecodeError:
            parsed = {"message": detail[:300]}
        return exc.code, parsed


def contents_path(name: str) -> str:
    ref = urllib.parse.quote(BRANCH, safe="")
    return "/repos/%s/contents/bridge-mailbox/%s?ref=%s" % (REPO, name, ref)


def read_note(name: str, token: str | None) -> tuple[dict, str | None]:
    code, data = api("GET", contents_path(name), token)
    if code != 200 or not isinstance(data, dict):
        raise RuntimeError("could not read %s (%s)" % (name, code))
    text = base64.b64decode(data["content"]).decode("utf-8")
    return json.loads(text), data.get("sha")


def github_token() -> str | None:
    env = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if env:
        return env.strip()
    try:
        proc = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True,
            text=True,
            timeout=8,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.TimeoutExpired):
        proc = None
    if proc and proc.returncode == 0 and proc.stdout.strip():
        return proc.stdout.strip()
    try:
        filled = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True,
            text=True,
            timeout=8,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    for line in (filled.stdout or "").splitlines():
        if line.startswith("password=") and len(line) > 12:
            return line.split("=", 1)[1].strip()
    return None


def publish(note: dict, token: str) -> None:
    for _ in range(4):
        current, sha = read_note("result.json", token)
        del current
        body = {
            "message": "bridge result %s" % note.get("id", ""),
            "content": base64.b64encode(json.dumps(note).encode("utf-8")).decode("ascii"),
            "branch": BRANCH,
        }
        if sha:
            body["sha"] = sha
        code, data = api("PUT", contents_path("result.json").split("?", 1)[0], token, body)
        if code in (200, 201):
            return
        if code == 409:
            time.sleep(1)
            continue
        message = data.get("message") if isinstance(data, dict) else data
        raise RuntimeError("could not publish result (%s): %s" % (code, message))
    raise RuntimeError("could not publish result after retries")


class Runner:
    def __init__(self, home: str, state: Path):
        self.home = home
        self.state = state
        self.cwd_file = state / "cwd"
        self.env_file = state / "env.sh"
        self.audit = state / "audit.log"
        self.pause = state / "PAUSE"
        self.last_id = state / "last-id"
        state.mkdir(parents=True, exist_ok=True)
        os.chmod(state, 0o700)
        if not self.cwd_file.exists():
            self.cwd_file.write_text(home + "\n", encoding="utf-8")
        if not self.env_file.exists():
            self.env_file.write_text("", encoding="utf-8")

    def cwd(self) -> str:
        try:
            path = self.cwd_file.read_text(encoding="utf-8").strip()
        except OSError:
            path = self.home
        return path if path and os.path.isdir(path) else self.home

    def remember(self, job_id: str) -> None:
        self.last_id.write_text(job_id + "\n", encoding="utf-8")
        os.chmod(self.last_id, 0o600)

    def seen(self, job_id: str) -> bool:
        try:
            return self.last_id.read_text(encoding="utf-8").strip() == job_id
        except OSError:
            return False

    def log(self, text: str) -> None:
        scrubbed, _ = safety.scrub_text(text)
        line = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + " " + scrubbed[:500] + "\n"
        fd = os.open(self.audit, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as fh:
            fh.write(line)

    def resolve(self, path: str) -> str:
        path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.join(self.cwd(), path)
        return os.path.realpath(path)

    def guard(self, path: str, write: bool = False) -> str | None:
        if safety.path_is_sensitive(path):
            return "refusing a secret path"
        if write and not safety.writable_zone(path, self.home):
            return "writes stay in home, /tmp, /media, or /mnt"
        real = os.path.realpath(path)
        state = os.path.realpath(str(self.state))
        if real == state or real.startswith(state + os.sep):
            return "refusing to touch the bridge state directory"
        return None

    def run(self, job: dict) -> dict:
        op = job.get("op")
        self.log("%s %s" % (op, job.get("command") or job.get("path") or ""))
        try:
            if op == "exec":
                return self.exec(job)
            if op == "list":
                return self.list_dir(job)
            if op == "read":
                return self.read_file(job)
            if op == "write":
                return self.write_file(job)
            if op == "remove":
                return self.remove(job)
            if op == "mkdir":
                return self.mkdir(job)
            return fail(job, "unknown op")
        except Exception as exc:  # noqa: BLE001
            return fail(job, str(exc))

    def exec(self, job: dict) -> dict:
        command = str(job.get("command") or "")
        reason = safety.command_block_reason(command)
        if reason:
            eprint("[bridge] blocked: " + reason)
            return fail(job, reason)
        timeout = min(300.0, max(1.0, float(job.get("timeout") or 90)))
        eprint("[bridge] $ " + command)
        cmd = self.state / "cmd.sh"
        wrap = self.state / "wrap.sh"
        cmd.write_text(command + "\n", encoding="utf-8")
        wrap.write_text(WRAPPER, encoding="utf-8")
        os.chmod(cmd, 0o700)
        os.chmod(wrap, 0o700)
        env = os.environ.copy()
        env["ARENA_CWD_FILE"] = str(self.cwd_file)
        env["ARENA_ENV_FILE"] = str(self.env_file)
        env["ARENA_CMD_FILE"] = str(cmd)
        env.pop("GH_TOKEN", None)
        env.pop("GITHUB_TOKEN", None)
        proc = subprocess.Popen(
            ["bash", str(wrap)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
            env=env,
        )
        try:
            out, err = proc.communicate(timeout=timeout)
            timed_out = False
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            out, err = proc.communicate()
            timed_out = True
        truncated = len(out) > MAX_OUTPUT
        stdout, n1 = safety.scrub_text(out[:MAX_OUTPUT].decode("utf-8", errors="replace"))
        stderr, n2 = safety.scrub_text(err[:40_000].decode("utf-8", errors="replace"))
        code = 124 if timed_out else proc.returncode
        eprint("[bridge] exit %s" % code)
        return {
            "id": job["id"],
            "ok": code == 0 and not timed_out,
            "exit": code,
            "stdout": stdout,
            "stderr": stderr,
            "truncated": truncated,
            "cwd": self.cwd(),
            "redactions": n1 + n2,
            "error": "timed out" if timed_out else None,
        }

    def list_dir(self, job: dict) -> dict:
        path = self.resolve(str(job.get("path") or "."))
        reason = self.guard(path)
        if reason:
            return fail(job, reason)
        if not os.path.isdir(path):
            return fail(job, "not a directory")
        entries = []
        with os.scandir(path) as scan:
            for entry in scan:
                if len(entries) >= 400:
                    break
                info = {"name": entry.name}
                try:
                    st = entry.stat(follow_symlinks=False)
                    info["size"] = st.st_size
                    info["type"] = "dir" if statmod.S_ISDIR(st.st_mode) else "file"
                except OSError as exc:
                    info["error"] = str(exc)
                entries.append(info)
        entries.sort(key=lambda item: item["name"].lower())
        eprint("[bridge] list %s (%s)" % (path, len(entries)))
        return {"id": job["id"], "ok": True, "path": path, "entries": entries, "cwd": self.cwd()}

    def read_file(self, job: dict) -> dict:
        path = self.resolve(str(job.get("path") or ""))
        reason = self.guard(path)
        if reason:
            return fail(job, reason)
        if not os.path.isfile(path):
            return fail(job, "not a file")
        with open(path, "rb") as fh:
            fh.seek(max(0, int(job.get("offset") or 0)))
            data = fh.read(MAX_OUTPUT + 1)
        truncated = len(data) > MAX_OUTPUT
        data = data[:MAX_OUTPUT]
        try:
            text = data.decode("utf-8")
            text, redactions = safety.scrub_text(text)
            payload = {"text": text, "binary": False, "redactions": redactions}
        except UnicodeDecodeError:
            payload = {"text": seal.b64e(data), "binary": True, "redactions": 0}
        eprint("[bridge] read %s" % path)
        return {"id": job["id"], "ok": True, "path": path, "truncated": truncated, "size": os.path.getsize(path), **payload}

    def write_file(self, job: dict) -> dict:
        path = self.resolve(str(job.get("path") or ""))
        reason = self.guard(path, write=True)
        if reason:
            return fail(job, reason)
        if os.path.isdir(path):
            return fail(job, "path is a directory")
        data = base64.b64decode(str(job.get("content_b64") or ""))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".arena-tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
        eprint("[bridge] wrote %s (%s bytes)" % (path, len(data)))
        return {"id": job["id"], "ok": True, "path": path, "bytes": len(data)}

    def mkdir(self, job: dict) -> dict:
        path = self.resolve(str(job.get("path") or ""))
        reason = self.guard(path, write=True)
        if reason:
            return fail(job, reason)
        os.makedirs(path, exist_ok=True)
        eprint("[bridge] mkdir %s" % path)
        return {"id": job["id"], "ok": True, "path": path}

    def remove(self, job: dict) -> dict:
        path = self.resolve(str(job.get("path") or ""))
        if self.resolve(str(job.get("confirm_path") or "")) != path:
            return fail(job, "confirm_path does not match")
        reason = self.guard(path, write=True)
        if reason:
            return fail(job, reason)
        home = os.path.realpath(self.home)
        if path in {home, "/", "/tmp", "/media", "/mnt"}:
            return fail(job, "refusing to remove a top-level directory")
        if os.path.isdir(path) and not os.path.islink(path):
            if not job.get("recursive"):
                return fail(job, "directory remove requires recursive")
            import shutil
            shutil.rmtree(path)
        else:
            os.remove(path)
        eprint("[bridge] removed %s" % path)
        return {"id": job["id"], "ok": True, "path": path}


WRAPPER = r"""#!/bin/bash
set +e
save_state() {
  ec=$?
  pwd > "$ARENA_CWD_FILE"
  export -p | grep -v ARENA_ > "$ARENA_ENV_FILE" || true
  exit "$ec"
}
trap save_state EXIT
if [ -s "$ARENA_CWD_FILE" ]; then
  cd "$(cat "$ARENA_CWD_FILE")" || exit 97
fi
if [ -s "$ARENA_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ARENA_ENV_FILE" || true
fi
# shellcheck disable=SC1090
source "$ARENA_CMD_FILE"
"""


def fail(job: dict, error: str) -> dict:
    return {"id": job.get("id"), "ok": False, "exit": 1, "error": error, "stdout": "", "stderr": ""}


def hello(runner: Runner) -> dict:
    disk = ""
    try:
        proc = subprocess.run(["df", "-hP"], capture_output=True, text=True, timeout=8)
        disk = "\n".join(proc.stdout.splitlines()[:8])
    except (OSError, subprocess.TimeoutExpired):
        disk = ""
    return {
        "id": "hello",
        "ok": True,
        "op": "hello",
        "hostname": os.uname().nodename,
        "user": os.environ.get("USER") or "",
        "home": runner.home,
        "cwd": runner.cwd(),
        "disk": disk,
    }


def loop(key: bytes, token: str, runner: Runner) -> int:
    eprint("[bridge] publishing hello")
    publish({"v": 1, "id": "hello", "box": seal.seal(key, hello(runner))}, token)
    eprint("[bridge] ready. Leave this window open. Ctrl+C stops me.")
    eprint("[bridge] Pause: touch %s" % runner.pause)
    while True:
        if runner.pause.exists():
            eprint("[bridge] paused")
            time.sleep(POLL_SECONDS)
            continue
        try:
            note, _sha = read_note("job.json", token)
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
            eprint("[bridge] network error, retrying: %s" % exc)
            time.sleep(POLL_SECONDS)
            continue
        job_id = str(note.get("id") or "")
        box = note.get("box") or ""
        if not box or job_id in {"", "0"} or runner.seen(job_id):
            time.sleep(POLL_SECONDS)
            continue
        try:
            job = seal.open_box(key, box)
        except ValueError as exc:
            eprint("[bridge] ignored a note that failed authentication: %s" % exc)
            runner.remember(job_id)
            time.sleep(POLL_SECONDS)
            continue
        if str(job.get("id")) != job_id:
            eprint("[bridge] ignored a note whose id did not match")
            runner.remember(job_id)
            time.sleep(POLL_SECONDS)
            continue
        result = runner.run(job)
        result, _ = scrub_result(result)
        try:
            publish({"v": 1, "id": job_id, "box": seal.seal(key, result)}, token)
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
            eprint("[bridge] could not send the result: %s" % exc)
            continue
        runner.remember(job_id)
        eprint("[bridge] sent result %s" % job_id)


def scrub_result(result: dict) -> tuple[dict, int]:
    count = 0
    cleaned = dict(result)
    for key in ("stdout", "stderr", "error", "text"):
        if isinstance(cleaned.get(key), str):
            cleaned[key], n = safety.scrub_text(cleaned[key])
            count += n
    return cleaned, count


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the drive bridge on this computer")
    parser.add_argument("--key-file", default=str(Path.home() / ".arena-bridge" / "key"))
    args = parser.parse_args()
    key_path = Path(args.key_file)
    if not key_path.exists():
        eprint("Missing %s" % key_path)
        return 1
    try:
        key = seal.load_key(key_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        eprint(str(exc))
        return 1
    token = github_token()
    if not token:
        eprint("This computer cannot send results back yet.")
        eprint("Log in once, then run this command again:")
        eprint("  gh auth login")
        eprint("If gh is not installed: sudo apt install gh")
        return 1
    runner = Runner(str(Path.home()), Path.home() / ".arena-bridge")
    try:
        return loop(key, token, runner)
    except KeyboardInterrupt:
        eprint("\n[bridge] stopped")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
