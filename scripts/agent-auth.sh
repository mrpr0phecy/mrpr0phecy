#!/usr/bin/env bash
# agent-auth.sh — GitHub device-flow authentication for AI agent sessions.
#
# Usage:
#   bash scripts/agent-auth.sh            # request code, show it, poll, save token
#   bash scripts/agent-auth.sh --git      # also configure git credential helper for this repo
#
# Environment overrides:
#   GH_CLIENT_ID   OAuth app client id   (default: GitHub CLI's public id)
#   TOKEN_FILE     where to save token   (default: ~/.github_token)
#   GH_SCOPES      requested scopes      (default: "repo read:org workflow")
#
# Security properties:
#   - The token is never printed anywhere, only written to TOKEN_FILE (chmod 600).
#   - The client id is public (it ships in every `gh auth login`); the human's
#     approval on github.com is what actually gates access.
#   - Nothing in this script writes a secret into the repository.
set -u

CLIENT_ID="${GH_CLIENT_ID:-178c6fc778ccc68e1d6a}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.github_token}"
SCOPES="${GH_SCOPES:-repo read:org workflow}"
WANT_GIT_CRED="0"
for arg in "$@"; do
  [ "$arg" = "--git" ] && WANT_GIT_CRED="1"
done

json_get() { # json_get <key> [fallback] — prefers jq, falls back to python3
  if command -v jq >/dev/null 2>&1; then
    jq -r "$1" 2>/dev/null || echo "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys
try:
    d=json.load(sys.stdin); print(d.get('$2', '$3')) if False else print(d['$2'])
except Exception: print('$3')" 2>/dev/null || echo "$3"
  else
    echo "$3"
  fi
}

echo "== GitHub device-flow auth (GitHub CLI app) =="

STEP1=$(curl -s -X POST https://github.com/login/device/code \
  -H "Accept: application/json" \
  -d client_id="$CLIENT_ID" \
  -d "scope=$SCOPES")

VERIFY_URI=$(echo "$STEP1" | json_get .verification_uri "https://github.com/login/device")
USER_CODE=$(echo "$STEP1" | json_get .user_code "")
DEVICE_CODE=$(echo "$STEP1" | json_get .device_code "")
INTERVAL=$(echo "$STEP1" | json_get .interval "5")

if [ -z "$DEVICE_CODE" ] || [ "$DEVICE_CODE" = "null" ]; then
  echo "FAILED to start device flow. Response was:"
  echo "$STEP1" | head -c 400
  exit 1
fi

echo ""
echo ">>> Ask the HUMAN to do this (it takes ~30 seconds):"
echo "     1. Open:  $VERIFY_URI"
echo "     2. Enter code:  $USER_CODE"
echo "     3. Click Authorize (GitHub CLI, scopes: $SCOPES)"
echo ">>> Waiting for approval..."
echo ""

DEADLINE=$(( $(date +%s) + 900 ))   # codes expire in ~15 minutes
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  sleep "$INTERVAL"
  RESP=$(curl -s -X POST https://github.com/login/oauth/access_token \
    -H "Accept: application/json" \
    -d client_id="$CLIENT_ID" \
    -d device_code="$DEVICE_CODE" \
    -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code')

  TOKEN=$(echo "$RESP" | json_get .access_token "")
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    umask 077
    printf '%s\n' "$TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "OK — token saved to $TOKEN_FILE (chmod 600)."
    echo "    Keep it OUT of the repo. Revoke any time:"
    echo "    https://github.com/settings/applications"
    if [ "$WANT_GIT_CRED" = "1" ]; then
      git config credential.helper "!f() { echo username=mrpr0phecy; echo \"password=\$(cat $TOKEN_FILE)\"; }; f" 2>/dev/null \
        && echo "OK — git credential helper configured for this repo." \
        || echo "NOTE: could not configure git helper (not in a git repo?)."
    fi
    exit 0
  fi

  ERR=$(echo "$RESP" | json_get .error "")
  case "$ERR" in
    authorization_pending) : ;;                # keep waiting
    slow_down)            INTERVAL=$((INTERVAL + 5)) ;;
    ""|"null")            : ;;
    *) echo "ERROR from GitHub: $ERR"; exit 1 ;;
  esac
done

echo "TIMED OUT after 15 minutes — the code expired before approval."
exit 1
