"""Specimen sheet: ten hand-drawn connected glyphs, one-stroke mode."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = r"C:\Users\myjia\Documents\deepseek-harness\default-workspace\research\specimen"
OUT = r"C:\Users\myjia\Documents\deepseek-harness\default-workspace\research\one-stroke-specimen.png"

ROWS = [
    ("一", "50.0"), ("十", "50.0"), ("口", "0.0"), ("日", "15.1"), ("田", "25.0"),
    ("目", "12.7"), ("中", "23.5"), ("山", "50.0"), ("工", "50.0"), ("王", "50.0"),
]

CELL_W, CELL_H = 340, 380
PAD = 10
COLS = 5
ROWS_N = 2
W = COLS * CELL_W + (COLS + 1) * PAD
H = ROWS_N * CELL_H + (ROWS_N + 1) * PAD + 54

sheet = Image.new("RGB", (W, H), (7, 7, 10))
d = ImageDraw.Draw(sheet)
f_title = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 12)
f_char = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 30)
f_stat = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 11)

d.text((PAD + 4, 18), "FOURIER TYPE - instrument A: one closed stroke - 10 glyphs, all connected",
       font=f_title, fill=(120, 120, 130))

for idx, (ch, dup) in enumerate(ROWS):
    p = os.path.join(ROOT, f"{idx}.png")
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB")
    # crop the central square where the glyph lives
    cx, cy, side = 700, 424, 640
    im = im.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))
    im = im.resize((CELL_W - 2, CELL_H - 62), Image.LANCZOS)

    x = PAD + (idx % COLS) * (CELL_W + PAD)
    y = 54 + PAD + (idx // COLS) * (CELL_H + PAD)
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + CELL_W - 2, y + CELL_H - 62], outline=(34, 34, 42))

    d.text((x + 8, y + CELL_H - 54), ch, font=f_char, fill=(235, 232, 226))
    d.text((x + 52, y + CELL_H - 40), "retrace " + dup + "%", font=f_stat, fill=(94, 235, 255))

sheet.save(OUT, quality=92)
print("saved", OUT, sheet.size)
