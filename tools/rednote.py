"""小红书素材：6 张 1080x1440 图。"""
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import os

SRC = r"C:\Users\myjia\Documents\deepseek-harness\default-workspace\research\red"
W, H = 1080, 1440

INK = (237, 234, 227)
DIM = (150, 148, 145)
FAINT = (108, 106, 104)
ACC = (94, 235, 255)
BG = (7, 7, 10)

F_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
F_LIGHT = r"C:\Windows\Fonts\msyhl.ttc"
F_MONO = r"C:\Windows\Fonts\consola.ttf"


def f(path, size):
    return ImageFont.truetype(path, size)


def tracked(d, xy, s, font, fill, track=0.0):
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track
    return x


def wrap(d, text, font, maxw):
    out = []
    for para in text.split("\n"):
        lines, cur = [], ""
        for ch in para:
            if d.textlength(cur + ch, font=font) > maxw and cur:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
        if cur:
            lines.append(cur)
        out.extend(lines)
    return out


def cover_crop(im):
    im = im.convert("RGB")
    s = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * s + 0.5), int(im.height * s + 0.5)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def shoot(name, bright=1.0):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    im = cover_crop(im)
    if bright != 1.0:
        im = ImageEnhance.Brightness(im).enhance(bright)
    return im


def cut_bottom(im, cut, band=70):
    """solid black below `cut`, with a short fade band above it"""
    grad = Image.new("L", (1, H), 0)
    px = grad.load()
    for y in range(H):
        if y >= cut:
            px[0, y] = 255
        elif y >= cut - band:
            px[0, y] = int(((y - (cut - band)) / band) ** 1.3 * 255)
    mask = grad.resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), BG), im, mask)


def frame(d, inset=26, alpha=26):
    d.rectangle([inset, inset, W - inset, H - inset], outline=(237, 234, 227, alpha), width=1)


def foot(d, num, total=6):
    fm = f(F_MONO, 19)
    d.text((56, H - 58), f"{num:02d} / {total:02d}", font=fm, fill=(*FAINT, 255))
    label = "jialinxzhang.github.io/epicycle"
    d.text((W - 56 - d.textlength(label, font=fm), H - 58), label, font=fm, fill=(*ACC, 255))


def brand(d):
    d.text((64, 92), "FOURIER DRAWING INSTRUMENT", font=f(F_MONO, 21), fill=(*DIM, 255))
    d.rectangle([64, 132, 64 + 74, 133], fill=(*ACC, 255))


# ---------------------------------------------------------------- 01 cover
im = shoot("hero.png", 0.8)
im = cut_bottom(im, 880, 90)
d = ImageDraw.Draw(im)

tracked(d, (60, 926), "把一句话", f(F_BOLD, 96), (*INK, 255), 3)
tracked(d, (60, 1040), "拆成一千个圆", f(F_BOLD, 96), (*INK, 255), 3)
d.rectangle([64, 1186, 64 + 54, 1187], fill=(*ACC, 255))
tracked(d, (64, 1218), "用傅里叶级数写字的网页仪器", f(F_LIGHT, 36), (196, 194, 190, 255), 1)
d.text((64, 1286), "jialinxzhang.github.io/epicycle", font=f(F_MONO, 26), fill=(*ACC, 255))
frame(d)
im.save(os.path.join(SRC, "01.png"), quality=94)

# ---------------------------------------------------------------- 02 process
im = shoot("process.png", 0.85)
im = cut_bottom(im, 1020, 80)
d = ImageDraw.Draw(im)
tracked(d, (64, 1086), "它快画完的样子", f(F_LIGHT, 54), (*INK, 255), 2)
d.text((64, 1180), "笔尖在无数个圆的和里，走出一条线", font=f(F_LIGHT, 30), fill=(*DIM, 255))
frame(d)
foot(d, 2)
im.save(os.path.join(SRC, "02.png"), quality=94)

# ---------------------------------------------------------------- 03 glyphs
im = shoot("shanhe.png", 0.88)
im = cut_bottom(im, 1010, 80)
d = ImageDraw.Draw(im)
tracked(d, (64, 1076), "山河", f(F_BOLD, 80), (*INK, 255), 10)
d.text((64, 1198), "换一个字，就是换一段频谱", font=f(F_LIGHT, 30), fill=(*DIM, 255))
frame(d)
foot(d, 3)
im.save(os.path.join(SRC, "03.png"), quality=94)

# ---------------------------------------------------------------- figure slides
def figure(src_name, num, kicker, title, caption, out, note="", maxw=1000):
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    brand(d)
    tracked(d, (64, 178), kicker, f(F_MONO, 20), (*ACC, 255), 7)
    tracked(d, (60, 214), title, f(F_BOLD, 74), (*INK, 255), 2)

    im = Image.open(os.path.join(SRC, src_name)).convert("RGB")
    s = min(maxw / im.width, 1.0)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)

    cap_font = f(F_LIGHT, 30)
    lines = wrap(d, caption, cap_font, W - 128)
    block = im.height + 62 + len(lines) * 46
    top = 330 + max(0, (920 - block) // 2)

    x = (W - im.width) // 2
    canvas.paste(im, (x, top))
    d.rectangle([x - 1, top - 1, x + im.width, top + im.height], outline=(237, 234, 227, 30), width=1)

    y = top + im.height + 56
    for line in lines:
        d.text((64, y), line, font=cap_font, fill=(176, 174, 170, 255))
        y += 46

    if note:
        d.rectangle([64, 1244, 64 + 40, 1245], fill=(*ACC, 255))
        d.text((64, 1266), note, font=f(F_LIGHT, 25), fill=(*FAINT, 255))

    frame(d)
    foot(d, num)
    canvas.save(os.path.join(SRC, out), quality=94)


figure("specimen.png", 4, "03 - ONE STROKE", "一笔画完一个字",
       "整个字被算成一条闭合回路。\n有环的字便宜，树形的字要多走一倍的路。",
       "04.png",
       note="口 0%   目 13%   日 15%   中 23%   田 25%   山 50%")

figure("skeletons.png", 5, "04 - THE TRUTH", "小短横是从哪来的",
       "宋体横画起笔的顿角，骨架化时被切成一条悬空的短线。\n不是渲染问题，是字体的形状。",
       "05.png",
       note="宋体 5.6%   行楷 4.0%   幼圆 2.4%   (碎枝率)")

# ---------------------------------------------------------------- 06 end
canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)
brand(d)

tracked(d, (60, 360), "本轮", f(F_BOLD, 160), (*INK, 255), 28)
d.text((64, 566), "E P I C Y C L E", font=f(F_MONO, 24), fill=(*DIM, 255))

d.rectangle([64, 690, 64 + 54, 691], fill=(*ACC, 255))

rows = [
    ("在线玩", "jialinxzhang.github.io/epicycle", True),
    ("技术栈", "原生 JS · 零依赖 · 无构建", False),
    ("字体", "傅里叶体 · 558 字 · 自制骨架数据", False),
]
y = 730
for k, v, mono in rows:
    tracked(d, (64, y), k, f(F_LIGHT, 24), (*FAINT, 255), 7)
    fnt = f(F_MONO, 24) if mono else f(F_LIGHT, 29)
    d.text((190, y + (2 if mono else -2)), v, font=fnt, fill=(*ACC, 255) if mono else (*INK, 255))
    y += 84

tracked(d, (64, 1130), "数学是免费的", f(F_LIGHT, 46), (120, 118, 116, 255), 3)
frame(d)
d.text((56, H - 58), "06 / 06", font=f(F_MONO, 19), fill=(*FAINT, 255))
canvas.save(os.path.join(SRC, "06.png"), quality=94)

print("done")
