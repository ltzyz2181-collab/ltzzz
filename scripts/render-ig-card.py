#!/usr/bin/env python3
# LTZZZ IG 日报卡渲染器
# 用法: render-ig-card.py --date 2026-10-08 --out assets/ig/2026-10-08.png [--content assets/ig/cards/2026-10-08.txt]
# 内容文件格式（纯文本）:
#   第1行: 主标题1
#   第2行: 主标题2
#   第3行起: 正文行（空行保留）
import argparse, os, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--content", default=None)
    a = ap.parse_args()

    title1, title2, lines = "LTZZZ 日报", a.date, ["账本可以推翻报告，", "receipt 才是唯一事实。"]
    if a.content and os.path.exists(a.content):
        raw = open(a.content, encoding="utf-8").read().splitlines()
        if len(raw) >= 2:
            title1, title2 = raw[0], raw[1]
            lines = raw[2:] if len(raw) > 2 else lines

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        sys.exit("需要 pillow: pip install pillow")

    W = H = 1080
    img = Image.new("RGB", (W, H), (10, 14, 26))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=(int(10+30*y/H), int(14+6*y/H), int(26+44*y/H)))
    d.rectangle([36, 36, W-36, H-36], outline=(120, 200, 255), width=3)

    def find_font(bold):
        cands = [
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ]
        for p in cands:
            if os.path.exists(p):
                return p
        sys.exit("无 CJK 字体，请 apt-get install fonts-noto-cjk")

    def font(sz, bold=True):
        return ImageFont.truetype(find_font(bold), sz, index=2)

    f_brand, f_big, f_mid, f_small = font(44), font(64), font(40, False), font(30, False)
    d.text((80, 90), "LTZZZ · AI 共同体日报", font=f_brand, fill=(120, 200, 255))
    d.line([(80, 160), (W-80, 160)], fill=(120, 200, 255), width=2)
    d.text((80, 210), title1, font=f_big, fill=(255, 255, 255))
    d.text((80, 300), title2, font=f_big, fill=(255, 215, 120))
    y = 420
    for ln in lines[:9]:
        d.text((80, y), ln, font=f_mid, fill=(220, 230, 245)); y += 62
    d.line([(80, 830), (W-80, 830)], fill=(90, 120, 160), width=2)
    d.text((80, 980), "ltzzz.com", font=f_small, fill=(120, 200, 255))
    tw = d.textlength(a.date, font=f_small)
    d.text((W-80-tw, 980), a.date, font=f_small, fill=(120, 200, 255))

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    img.save(a.out)
    print("saved", a.out)

if __name__ == "__main__":
    main()
