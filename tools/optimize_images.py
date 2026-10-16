"""Convert photo PNG/JPGs in assets/img to resized WebP (keeps logos/icons as PNG).
usage: python tools/optimize_images.py [extra_src_dir]"""
import os, sys, shutil
from PIL import Image

IMG = os.path.join(os.path.dirname(__file__), "..", "assets", "img")
KEEP = ("logo-", "icon-", "og-image")
if len(sys.argv) > 1:  # copy freshly generated images in first
    for f in os.listdir(sys.argv[1]):
        if f.lower().endswith((".png", ".jpg")):
            shutil.copy(os.path.join(sys.argv[1], f), os.path.join(IMG, f))

for f in sorted(os.listdir(IMG)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in (".png", ".jpg", ".jpeg") or f.startswith(KEEP):
        continue
    src = os.path.join(IMG, f)
    im = Image.open(src).convert("RGB")
    max_w = 2048 if name == "hero" else 1280
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    out = os.path.join(IMG, name + ".webp")
    im.save(out, "WEBP", quality=80, method=6)
    print(f"{f:28s} -> {name}.webp {im.size} {os.path.getsize(out)//1024} KB")
    os.remove(src)
