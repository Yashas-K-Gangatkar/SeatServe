#!/usr/bin/env python3
"""Side-by-side composite of the two disputed URLs' full-page screenshots."""
from PIL import Image

BASE = "/home/z/my-project/download"
NEW = f"{BASE}/proof-1-ctshop-git-main-NEW-full.png"
OLD = f"{BASE}/proof-2-ctshop-7m5hu3mb6-OLD-frozen-full.png"
OUT = f"{BASE}/proof-4-side-by-side-old-vs-new.png"

H = 3600  # composite height for readable side-by-side
GAP = 24

new_img = Image.open(NEW)
old_img = Image.open(OLD)
print("new:", new_img.size, "old:", old_img.size)

def scaled(img, h):
    w = round(img.width * h / img.height)
    return img.resize((w, h), Image.LANCZOS)

n, o = scaled(new_img, H), scaled(old_img, min(H, old_img.height))
W = n.width + GAP + o.width
canvas = Image.new("RGB", (W, H), "#FAF8F5")
canvas.paste(n, (0, 0))
canvas.paste(o, (n.width + GAP, 0))
canvas.save(OUT, optimize=True)
print("saved:", OUT, canvas.size)
