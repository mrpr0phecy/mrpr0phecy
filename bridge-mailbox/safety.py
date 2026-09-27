"""Refusals shared by the computer agent. Not a perfect sandbox."""

from __future__ import annotations

import os
import re
import shlex

_SECRET_PREFIX = r"(?:^|[\\/\s'\"=~])"
SENSITIVE_PATH_RES = (
    re.compile(_SECRET_PREFIX + r"\.ssh(?:[\\/\s'\"]|$)", re.I),
    re.compile(_SECRET_PREFIX + r"\.gnupg(?:[\\/\s'\"]|$)", re.I),
    re.compile(_SECRET_PREFIX + r"\.aws(?:[\\/\s'\"]|$)", re.I),
    re.compile(_SECRET_PREFIX + r"\.password-store(?:[\\/\s'\"]|$)", re.I),
    re.compile(_SECRET_PREFIX + r"\.kube(?:[\\/\s'\"]|$)", re.I),
    re.compile(_SECRET_PREFIX + r"\.netrc(?:$|[\\/\s'\"])", re.I),
    re.compile(_SECRET_PREFIX + r"\.docker[\\/]config\.json", re.I),
    re.compile(_SECRET_PREFIX + r"\.env(?:$|\.|[\\/\s'\"])", re.I),
    re.compile(_SECRET_PREFIX + r"\.git-credentials(?:$|[\\/\s'\"])", re.I),
    re.compile(_SECRET_PREFIX + r"id_(?:rsa|ed25519|ecdsa|dsa)(?:$|\.)", re.I),
    re.compile(r"/etc/(shadow|gshadow|sudoers)\b", re.I),
    re.compile(r"\.arena-bridge/key\b", re.I),
    re.compile(r"\bgh auth token\b", re.I),
)

TOKEN_COMMANDS = {
    "sudo", "su", "pkexec", "doas",
    "shutdown", "reboot", "poweroff", "halt",
    "fdisk", "parted", "wipefs", "mkswap", "mkfs",
    "userdel", "groupdel", "passwd", "chpasswd", "visudo",
    "cryptsetup",
}

RAW_DANGEROUS = (
    (re.compile(r"\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b[^\n;]*\s+(/|/\*+|~/?|\$HOME/?|\$\{HOME\}/?)\s*($|[;&|])"),
     "refusing to wipe / or your home directory"),
    (re.compile(r":\(\)\s*\{[^}]*\}\s*;\s*:"),
     "refusing a fork bomb"),
    (re.compile(r"\bdd\b[^\n]*\bof=/dev/(sd|nvme|mmcblk|hd|vd|xvd|disk)", re.I),
     "refusing dd onto a disk device"),
    (re.compile(r">\s*/dev/(sd|nvme|mmcblk|hd|vd|xvd)", re.I),
     "refusing a write onto a disk device"),
    (re.compile(r"\bmkfs(\.[a-z0-9]+)?\b", re.I),
     "refusing mkfs"),
    (re.compile(r"\bchmod\s+(-R\s+)?777\s+/\s*($|[;&|])", re.I),
     "refusing chmod 777 /"),
    (re.compile(r"\bsystemctl\s+(poweroff|reboot|halt|suspend|hibernate)\b", re.I),
     "refusing a power command"),
    (re.compile(r"(^|[^A-Za-z0-9_./-])(sudo|pkexec|doas)([^A-Za-z0-9_]|$)", re.I),
     "refusing sudo/pkexec/doas"),
    (re.compile(r"(^|[|&;]|&&|\|\|)\s*su([^A-Za-z0-9_]|$)", re.I),
     "refusing su"),
)

TOKEN_RES = (
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gho_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
)


def path_is_sensitive(path: str) -> bool:
    raw = path.replace("\\", "/")
    expanded = os.path.expanduser(raw)
    candidates = {raw, expanded}
    try:
        candidates.add(os.path.realpath(expanded))
    except OSError:
        pass
    for candidate in candidates:
        for pattern in SENSITIVE_PATH_RES:
            if pattern.search(candidate.replace("\\", "/")):
                return True
    return False


def shell_segments(command: str) -> list[list[str]]:
    parts = re.split(r"(?:&&|\|\||[;&\n|])", command)
    segments = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        try:
            tokens = shlex.split(part, posix=True)
        except ValueError:
            tokens = part.split()
        while tokens and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]):
            tokens = tokens[1:]
        if tokens:
            segments.append(tokens)
    return segments


def command_block_reason(command: str) -> str | None:
    for pattern, reason in RAW_DANGEROUS:
        if pattern.search(command):
            return reason
    if path_is_sensitive(command):
        return "refusing a command that touches a secret path"
    for tokens in shell_segments(command):
        base = os.path.basename(tokens[0])
        if base in TOKEN_COMMANDS or base.startswith("mkfs."):
            return "refusing `%s`" % base
    return None


def writable_zone(path: str, home: str) -> bool:
    try:
        real = os.path.realpath(os.path.expanduser(path))
        home_real = os.path.realpath(os.path.expanduser(home))
    except OSError:
        return False
    roots = [home_real, "/tmp", "/var/tmp", "/dev/shm", "/media", "/mnt"]
    for root in roots:
        if real == root or real.startswith(root + os.sep):
            return True
    return False


def scrub_text(text: str) -> tuple[str, int]:
    count = 0
    for pattern in TOKEN_RES:
        text, n = pattern.subn("[redacted]", text)
        count += n
    return text, count
