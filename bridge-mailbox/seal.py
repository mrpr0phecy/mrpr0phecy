"""Seal notes for the drive mailbox. Stdlib only. Key never belongs in git."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets

VERSION = 1


def b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64d(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def derive(key: bytes, label: bytes) -> bytes:
    return hmac.new(key, label, hashlib.sha256).digest()


def keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    stream_key = derive(key, b"stream-key")
    out = bytearray()
    counter = 0
    while len(out) < size:
        block = hmac.new(
            stream_key,
            b"stream1" + nonce + counter.to_bytes(4, "big"),
            hashlib.sha256,
        ).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:size])


def seal(key: bytes, payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    nonce = secrets.token_bytes(16)
    cipher = bytes(a ^ b for a, b in zip(raw, keystream(key, nonce, len(raw))))
    mac = hmac.new(derive(key, b"mac1"), nonce + cipher, hashlib.sha256).digest()
    return b64e(nonce + mac + cipher)


def open_box(key: bytes, box: str) -> dict:
    blob = b64d(box)
    if len(blob) < 16 + 32:
        raise ValueError("truncated box")
    nonce, mac, cipher = blob[:16], blob[16:48], blob[48:]
    expect = hmac.new(derive(key, b"mac1"), nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expect):
        raise ValueError("mailbox note failed authentication")
    raw = bytes(a ^ b for a, b in zip(cipher, keystream(key, nonce, len(cipher))))
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("mailbox note is not an object")
    return data


def load_key(text: str) -> bytes:
    slim = re.sub(r"[^0-9a-fA-F]", "", text.strip())
    if len(slim) != 64:
        raise ValueError("bridge key must be 64 hex characters")
    return bytes.fromhex(slim)


def new_key() -> str:
    return secrets.token_hex(32)
