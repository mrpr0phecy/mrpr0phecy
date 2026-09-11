#!/usr/bin/env python3
"""post.py — publish picks to Bluesky + Mastodon. Stdlib only (urllib).

    python3 scripts/promo/post.py --date 2026-09-11 --slot tool         # dry run
    python3 scripts/promo/post.py --date 2026-09-11 --slot tool --live  # for real

Safety design (automation that posts publicly must be boring):
  * Dry-run is the default. Nothing posts without --live.
  * Missing secrets → the network is skipped with a notice, exit 0. The
    daily workflow therefore succeeds before setup and after setup alike.
  * Idempotent via the network, not via local state: before posting, each
    publisher reads the account's recent posts and skips if today's pick URL
    is already there. Re-runs, retries and overlapping schedules can never
    double-post, and no committed log file can drift.
  * Secrets arrive as env vars (GitHub Actions secrets in CI):
    BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (a scoped app password, not the
    main password), MASTODON_INSTANCE (host only, e.g. mastodon.social),
    MASTODON_ACCESS_TOKEN. They are never printed; errors are redacted.

Images: --image points at a card PNG (rendered by card.py in the workflow).
Track posts ship text-only — YouTube unfurls its own preview.
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from promo import catalogue, copy as promo_copy, pick  # noqa: E402


def _http(method: str, url: str, *, headers: dict | None = None,
          body: bytes | None = None, timeout: int = 30) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers or {},
                                 method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"HTTP {exc.code} {method} {url}: {detail}")


# Overridable transport so tests never touch the network.
_TRANSPORT = _http


def _utcnow() -> str:
    return (datetime.datetime.now(datetime.timezone.utc)
            .isoformat(timespec="milliseconds").replace("+00:00", "Z"))


def _utf8_span(text: str, sub: str) -> tuple[int, int]:
    raw, needle = text.encode("utf-8"), sub.encode("utf-8")
    start = raw.find(needle)
    assert start != -1, f"{sub!r} not found in post text"
    return start, start + len(needle)


# ---------------- Bluesky (AT Protocol) ----------------

def _bsky_pds() -> str:
    return os.environ.get("BLUESKY_PDS", "https://bsky.social").rstrip("/")


def bsky_login() -> tuple[str, str, str] | None:
    """(did, token, pds) or None when secrets are absent."""
    handle = os.environ.get("BLUESKY_HANDLE", "")
    password = os.environ.get("BLUESKY_APP_PASSWORD", "")
    if not handle or not password:
        return None
    pds = _bsky_pds()
    status, raw = _TRANSPORT(
        "POST", f"{pds}/xrpc/com.atproto.server.createSession",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"identifier": handle, "password": password}).encode())
    assert status == 200, f"bluesky login failed: HTTP {status}"
    data = json.loads(raw)
    return data["did"], data["accessJwt"], pds


def bsky_already_posted(did: str, token: str, pds: str, url: str,
                        day_iso: str) -> bool:
    qs = urllib.parse.urlencode({"actor": did, "limit": 15})
    status, raw = _TRANSPORT(
        "GET", f"{pds}/xrpc/app.bsky.feed.getAuthorFeed?{qs}",
        headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        return False
    for item in json.loads(raw).get("feed", []):
        record = (item.get("post") or {}).get("record") or {}
        if url in (record.get("text") or "") and \
                (record.get("createdAt") or "").startswith(day_iso):
            return True
    return False


def bsky_post(text: str, url: str, image: bytes | None,
              alt: str, *, live: bool) -> dict:
    receipt: dict = {"network": "bluesky"}
    auth = bsky_login()
    if auth is None:
        return {**receipt, "status": "no-secrets"}
    did, token, pds = auth
    today = datetime.date.today().isoformat()
    if bsky_already_posted(did, token, pds, url, today):
        return {**receipt, "status": "already-posted"}
    start, end = _utf8_span(text, url)
    record: dict = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": _utcnow(),
        "facets": [{
            "index": {"byteStart": start, "byteEnd": end},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
        }],
    }
    if image is not None:
        if live:
            status, raw = _TRANSPORT(
                "POST", f"{pds}/xrpc/com.atproto.repo.uploadBlob",
                headers={"Authorization": f"Bearer {token}",
                         "Content-Type": "image/png"}, body=image)
            assert status == 200, f"bluesky blob upload failed: HTTP {status}"
            blob = json.loads(raw)["blob"]
        else:
            blob = {"dryRun": True}
        record["embed"] = {
            "$type": "app.bsky.embed.images",
            "images": [{"alt": alt[:1000], "image": blob}],
        }
    receipt.update(status="posted" if live else "dry-run", chars=len(text),
                   image=bool(image))
    if live:
        status, _ = _TRANSPORT(
            "POST", f"{pds}/xrpc/com.atproto.repo.createRecord",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"},
            body=json.dumps({"repo": did, "collection": "app.bsky.feed.post",
                             "record": record}).encode())
        assert status == 200, f"bluesky post failed: HTTP {status}"
    else:
        receipt["text"] = text
    return receipt


# ---------------- Mastodon ----------------

def _masto_base() -> str | None:
    inst = os.environ.get("MASTODON_INSTANCE", "").strip().lower()
    if not inst or not os.environ.get("MASTODON_ACCESS_TOKEN"):
        return None
    inst = re.sub(r"^https?://", "", inst).rstrip("/")
    return f"https://{inst}"


def _multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    import secrets as _secrets
    boundary = f"----promo{_secrets.token_hex(8)}"
    buf = io.BytesIO()
    for key, value in fields.items():
        buf.write(f"--{boundary}\r\nContent-Disposition: form-data; "
                  f'name="{key}"\r\n\r\n{value}\r\n'.encode())
    for key, (filename, content_type, data) in files.items():
        buf.write(f"--{boundary}\r\nContent-Disposition: form-data; "
                  f'name="{key}"; filename="{filename}"\r\n'
                  f"Content-Type: {content_type}\r\n\r\n".encode())
        buf.write(data)
        buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"


_STRIP_TAGS = re.compile(r"<[^>]+>")


def masto_already_posted(base: str, token: str, account_id: str, url: str,
                         day_iso: str) -> bool:
    status, raw = _TRANSPORT(
        "GET", f"{base}/api/v1/accounts/{account_id}/statuses?limit=15",
        headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        return False
    for item in json.loads(raw):
        text = _STRIP_TAGS.sub("", item.get("content") or "")
        text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        if url in text and (item.get("created_at") or "").startswith(day_iso):
            return True
    return False


def masto_post(text: str, url: str, image: bytes | None,
               alt: str, *, live: bool) -> dict:
    receipt: dict = {"network": "mastodon"}
    base = _masto_base()
    if base is None:
        return {**receipt, "status": "no-secrets"}
    token = os.environ["MASTODON_ACCESS_TOKEN"]
    headers = {"Authorization": f"Bearer {token}"}
    status, raw = _TRANSPORT("GET", f"{base}/api/v1/accounts/verify_credentials",
                             headers=headers)
    assert status == 200, f"mastodon token check failed: HTTP {status}"
    account_id = json.loads(raw)["id"]
    if masto_already_posted(base, token, account_id, url,
                            datetime.date.today().isoformat()):
        return {**receipt, "status": "already-posted"}
    media_ids: list[str] = []
    if image is not None:
        body, content_type = _multipart({"description": alt[:1500]}, {
            "file": ("card.png", "image/png", image)})
        if live:
            status, raw = _TRANSPORT("POST", f"{base}/api/v2/media",
                                     headers={**headers,
                                              "Content-Type": content_type},
                                     body=body)
            assert status in (200, 202), f"mastodon upload failed: HTTP {status}"
            media_ids = [json.loads(raw)["id"]]
        else:
            media_ids = ["dry-run"]
    receipt.update(status="posted" if live else "dry-run", chars=len(text),
                   image=bool(image))
    if live:
        payload = {"status": text, "visibility": "public"}
        for i, mid in enumerate(media_ids):
            payload[f"media_ids[{i}]"] = mid
        status, _ = _TRANSPORT(
            "POST", f"{base}/api/v1/statuses", headers=headers,
            body=urllib.parse.urlencode(payload).encode())
        assert status in (200, 201), f"mastodon post failed: HTTP {status}"
    else:
        receipt["text"] = text
    return receipt


def main() -> int:
    ap = argparse.ArgumentParser(description="Publish a pick (dry-run default).")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--slot", choices=["tool", "track"], default="tool")
    ap.add_argument("--live", action="store_true",
                    help="actually post; without it, print instead")
    ap.add_argument("--networks", default="bluesky,mastodon")
    ap.add_argument("--image", default=None, help="card PNG to attach")
    args = ap.parse_args()
    day = datetime.date.fromisoformat(args.date)
    image = open(args.image, "rb").read() if args.image else None
    if args.slot == "tool":
        tool = pick.pick_tool(day)
        url = catalogue.tool_url(tool["name"])
        alt = f"Tool of the day: {catalogue.plain(tool.get('title') or tool['name'])}"
        texts = {
            "bluesky": promo_copy.tool_short(tool, url),
            "mastodon": promo_copy.tool_mastodon(
                tool, url, tool.get("category") or "General"),
        }
    else:
        track = pick.pick_track(day)
        track = {**track, "url": catalogue.track_url(track["youtube_id"])}
        year, week, _ = day.isocalendar()
        url = track["url"]
        alt = f"Track of the week: {track['title']}"
        text = promo_copy.track_post(track, f"{year}-W{week:02d}")
        texts = {"bluesky": text, "mastodon": text}
    posters = {"bluesky": bsky_post, "mastodon": masto_post}
    receipts = []
    for name in [n.strip() for n in args.networks.split(",") if n.strip()]:
        if name not in posters:
            raise SystemExit(f"unknown network {name!r} (bluesky, mastodon)")
        receipts.append(posters[name](texts[name], url, image, alt, live=args.live))
    print(json.dumps(receipts, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
