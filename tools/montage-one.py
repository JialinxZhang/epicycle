"""One-stroke vs multi-stroke: 2x2 sheet."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = r"C:\Users\myjia\Documents\deepseek-harness\default-workspace\research"
FILES = [("分笔 · 完成", "multi.png"),
         ("一笔 · 35%", "one-0.35.png"),
         ("一笔 · 65%", "one-0.65.png"),
         ("一笔 · 完成", "one-0.995.png")]

TW, TH = 700, 484
PAD = 12
COLS, ROWS = 2, 2
W = COLS * TW + (COLS + 1) * PAD
H = ROWS * TH + (ROWS + 1) * PAD + 40

sheet = Image.new("RGB", (W, H), (7, 7, 10))
d = ImageDraw.Draw(sheet)
try:
    f_small = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 14)
    f_tiny = ImageFont.truetype("consola.ttf", 12)
except Exception:
    f_small = f_tiny = ImageFont.load_default()

d.text((PAD + 4, 12), "YONG - multi vs single stroke - K=900", font=f_tiny, fill=(120, 120, 130))

for i, (label, fn) in enumerate(FILES):
    p = os.path.join(ROOT, fn)
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB").resize((TW, TH), Image.LANCZOS)
    cx = PAD + (i % COLS) * (TW + PAD)
    cy = 40 + PAD + (i // COLS) * (TH + PAD)
    sheet.paste(im, (cx, cy))
    d.rectangle([cx, cy, cx + TW - 1, cy + TH - 1], outline=(38, 38, 46))
    d.rectangle([cx, cy, cx + 130, cy + 24], fill=(7, 7, 10))
    d.text((cx + 9, cy + 5), label, font=f_small, fill=(210, 210, 215))

out = os.path.join(ROOT, "one-vs-multi.png")
sheet.save(out, quality=92)
print("saved", out, sheet.size)
