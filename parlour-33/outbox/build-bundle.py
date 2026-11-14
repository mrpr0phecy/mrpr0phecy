#!/usr/bin/env python3
"""Assemble the sendable package: one complete markdown, and a zip of everything."""
import os, re, datetime, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "outbox")
os.makedirs(OUT, exist_ok=True)

docs = ["README.md"] + sorted(
    f for f in os.listdir(ROOT)
    if re.match(r"^\d\d-.*\.md$", f)
)

now = datetime.date.today().isoformat()
parts = [
    "# PARLOUR XXXIII — the complete package",
    "",
    f"*Assembled {now} from the build repository. Every document, in order.*",
    "",
    "## Contents",
    "",
]
for f in docs:
    title = open(os.path.join(ROOT, f), encoding="utf-8").readline().lstrip("# ").strip()
    parts.append(f"- **{f}** — {title}")
parts += [
    "",
    "## Also in this package",
    "",
    "- `build_manifest.yaml` — the machine-readable build",
    "- `plans/` — the drawable sheets: `masterplan.svg`, `kiosk.svg`",
    "- `renders/` — seven geometry renders + `README.md`",
    "- `tools/` — `gen_plans.py`, `gen_kiosk.py`, `render3d.py`, `cabinet-sim.html`",
    "- `tools/lsl/` — nine production scripts + `README.md` (link-name contract, protocol, channels)",
    "- `art/` — the look-dev plates",
    "",
]

for f in docs:
    body = open(os.path.join(ROOT, f), encoding="utf-8").read()
    parts += ["", "---", "", body.strip(), ""]

open(os.path.join(OUT, "PARLOUR-XXXIII-complete.md"), "w", encoding="utf-8").write("\n".join(parts))

skip_dirs = {".git", "outbox", "__pycache__"}
zpath = os.path.join(OUT, "PARLOUR-XXXIII.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for fn in files:
            if fn.endswith((".zip", ".pyc")):
                continue
            full = os.path.join(base, fn)
            rel = os.path.relpath(full, ROOT)
            z.write(full, os.path.join("PARLOUR-XXXIII", rel))

# ---- an email-sized edition: no PNGs, the same text, the plates as JPEGs ----
try:
    from PIL import Image
    zpath = os.path.join(OUT, "PARLOUR-XXXIII-email.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for fn in files:
                full = os.path.join(base, fn)
                rel = os.path.relpath(full, ROOT)
                if fn.endswith(".png"):
                    if "/renders/" not in full and "/art/" not in full:
                        continue
                    im = Image.open(full).convert("RGB")
                    im.thumbnail((1400, 1400), Image.LANCZOS)
                    tmp = os.path.join("/tmp", rel.replace("/", "_") + ".jpg")
                    im.save(tmp, quality=84)
                    z.write(tmp, os.path.join("PARLOUR-XXXIII", rel[:-4] + ".jpg"))
                    os.remove(tmp)
                elif fn.endswith((".zip", ".pyc")):
                    continue
                else:
                    z.write(full, os.path.join("PARLOUR-XXXIII", rel))
    print("wrote", os.path.relpath(zpath, ROOT), os.path.getsize(zpath) // 1024, "KB")
except Exception as e:
    print("email edition skipped:", e)

print("wrote", os.path.relpath(os.path.join(OUT, "PARLOUR-XXXIII-complete.md"), ROOT),
      os.path.getsize(os.path.join(OUT, "PARLOUR-XXXIII-complete.md")) // 1024, "KB")
print("wrote", os.path.relpath(zpath, ROOT), os.path.getsize(zpath) // 1024, "KB")
