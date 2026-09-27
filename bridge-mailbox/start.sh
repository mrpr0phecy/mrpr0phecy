#!/bin/bash
# Starts the sealed mailbox agent on this computer.
# Not part of the website. Does not read or change games, home files, or SSH keys.
# The key arrives in BRIDGE_KEY and is stored only in ~/.arena-bridge/key.
set -u
umask 077

echo '===ARENA-RESULT==='
finish() {
  echo '===END==='
  exit "${1:-0}"
}
fail() {
  echo "FAIL $*"
  finish 1
}

if [ -z "${HOME:-}" ]; then
  fail "HOME is not set"
fi
if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 is not installed"
fi

DIR="$HOME/.arena-bridge"
mkdir -p "$DIR"
chmod 700 "$DIR"

printf '%s\n' "${BRIDGE_KEY:-}" > "$DIR/key"
chmod 600 "$DIR/key"
unset BRIDGE_KEY
python3 - << 'PY' || { rm -f "$DIR/key"; fail "BRIDGE_KEY must be 64 hex characters"; }
from pathlib import Path
key = Path.home().joinpath(".arena-bridge", "key").read_text(encoding="utf-8").strip()
if len(key) != 64 or any(c not in "0123456789abcdefABCDEF" for c in key):
    raise SystemExit(1)
PY

python3 - << 'PY' || fail "could not download the bridge files"
import base64, hashlib, json, os, pathlib, urllib.request
home = pathlib.Path.home() / ".arena-bridge"
expected = {
    "agent.py": "5d9444529381167d5084d0197b228eb4256c7818",
    "seal.py": "ce1c1ebd04a9ca60c181ed6d5fe09d8c5c7f7b6e",
    "safety.py": "75e38138b0365b83d712a2a59d67a57bbc452752",
}

def blob_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

for name, sha in expected.items():
    url = (
        "https://api.github.com/repos/mrpr0phecy/mrpr0phecy/contents/bridge-mailbox/"
        + name
        + "?ref=arena%2F01a0e326-mrpr0phecy"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "arena-drive-bridge",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    if data.get("sha") != sha:
        raise SystemExit("refusing " + name)
    raw = base64.b64decode(data["content"])
    if blob_sha(raw) != sha:
        raise SystemExit("refusing " + name + " body")
    path = home / name
    path.write_bytes(raw)
    os.chmod(path, 0o700 if name == "agent.py" else 0o600)
    print("saved", name)
PY

if ! python3 - << 'PY'
import os, subprocess, sys
env = os.environ.copy()
env["GIT_TERMINAL_PROMPT"] = "0"
for var in ("GH_TOKEN", "GITHUB_TOKEN"):
    if env.get(var, "").strip():
        raise SystemExit(0)
try:
    proc = subprocess.run(
        ["gh", "auth", "token"],
        capture_output=True,
        text=True,
        timeout=8,
        env=env,
    )
    if proc.returncode == 0 and proc.stdout.strip():
        raise SystemExit(0)
except (OSError, subprocess.TimeoutExpired):
    pass
try:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        timeout=8,
        env=env,
    )
except (OSError, subprocess.TimeoutExpired):
    raise SystemExit(1)
for line in (proc.stdout or "").splitlines():
    if line.startswith("password=") and len(line) > 12:
        raise SystemExit(0)
raise SystemExit(1)
PY
then
  echo "NEED-LOGIN"
  echo "Run: gh auth login"
  echo "Then run this start command again."
  finish 1
fi

stop_old() {
  if [ -f "$DIR/agent.pid" ]; then
    old="$(cat "$DIR/agent.pid" 2>/dev/null || true)"
    if [ -n "${old}" ] && kill -0 "$old" 2>/dev/null; then
      kill "$old" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$DIR/agent.pid"
  fi
}

PY="$(command -v python3)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
MODE=""
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/arena-bridge.service" << EOF
[Unit]
Description=Arena drive bridge
After=network-online.target

[Service]
Type=simple
ExecStart=${PY} ${DIR}/agent.py
WorkingDirectory=${HOME}
Restart=on-failure
RestartSec=20

[Install]
WantedBy=default.target
EOF
  chmod 644 "$UNIT_DIR/arena-bridge.service"
  systemctl --user stop arena-bridge.service >/dev/null 2>&1 || true
  stop_old
  if systemctl --user daemon-reload && systemctl --user enable --now arena-bridge.service; then
    MODE="systemd"
  else
    systemctl --user disable --now arena-bridge.service >/dev/null 2>&1 || true
  fi
fi

if [ -z "$MODE" ]; then
  stop_old
  echo "----- start $(date -u +%Y-%m-%dT%H:%M:%SZ) -----" >> "$DIR/agent.log"
  nohup "$PY" "$DIR/agent.py" </dev/null >> "$DIR/agent.log" 2>&1 &
  echo $! > "$DIR/agent.pid"
  MODE="nohup"
fi

echo "MODE=$MODE"
sleep 8
if [ "$MODE" = "systemd" ] && systemctl --user is-active --quiet arena-bridge.service 2>/dev/null; then
  echo "SERVICE=active"
elif [ -f "$DIR/agent.pid" ] && kill -0 "$(cat "$DIR/agent.pid")" 2>/dev/null; then
  echo "PID=$(cat "$DIR/agent.pid")"
else
  echo "EXITED"
fi

echo "--- log ---"
if [ "$MODE" = "systemd" ]; then
  journalctl --user -u arena-bridge.service -n 20 --no-pager 2>/dev/null || true
elif [ -f "$DIR/agent.log" ]; then
  tail -n 20 "$DIR/agent.log" || true
fi
finish 0
