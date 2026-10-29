#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerates the reference images in ../reference/ (panel map, Photoshop overlays, per-panel masks, panel_info.json).
Run:  python tools/make_reference.py      (only needs pillow + numpy + scipy; Chinese needs a CJK font on the machine)"""
import os, sys, json, math, colorsys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_erosion
from mylwrap.core import comp, bbox, MASK, N, NLAB
from mylwrap.panels import PANELS, up_vector, up_words, FLIPPED

FONTS = ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
         'C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc', '/System/Library/Fonts/PingFang.ttc',
         '/System/Library/Fonts/STHeiti Medium.ttc', '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
def font(sz):
    for f in FONTS:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, sz, index=2) if f.endswith('.ttc') and 'Noto' in f else ImageFont.truetype(f, sz)
            except Exception: pass
    return ImageFont.load_default()

def col(i, a=255):
    r, g, b = colorsys.hsv_to_rgb((i*0.618) % 1, 0.55, 0.95); return (int(r*255), int(g*255), int(b*255), a)
def outline_of(m): return m & ~binary_erosion(m, iterations=2)

def arrow(d, c, v, L=46, fill=(200, 0, 0, 255), w=5):
    (x, y), (ux, uy) = c, v; x0, y0 = x-ux*L/2, y-uy*L/2; x1, y1 = x+ux*L/2, y+uy*L/2
    d.line([(x0, y0), (x1, y1)], fill=fill, width=w)
    px, py = -uy, ux; h = 13
    d.polygon([(x1+ux*8, y1+uy*8), (x1-ux*h+px*h*.8, y1-uy*h+py*h*.8), (x1-ux*h-px*h*.8, y1-uy*h-py*h*.8)], fill=fill)

def draw_labels(d, names=True, stroke=(255, 255, 255, 255), ink=(0, 0, 0, 255)):
    for i in range(1, NLAB+1):
        m = comp(i); ys, xs = np.nonzero(m); cx, cy = xs.mean(), ys.mean(); x0, y0, x1, y1 = bbox(m)
        big = m.sum() > 9000; wide = (x1-x0) > 2*(y1-y0)
        nm = PANELS[i][0]
        f1 = font(30 if big else 20); f2 = font(15 if (x1-x0) > 200 or big else 13)
        d.text((cx, cy-(16 if big and names and (x1-x0) > 120 and i not in (5, 6) else 0)), str(i), font=f1, fill=ink, anchor='mm', stroke_width=3, stroke_fill=stroke)
        if big and names and (x1-x0) > 120 and i not in (5, 6):
            d.text((cx, cy+10), nm, font=f2, fill=ink, anchor='mm', stroke_width=2, stroke_fill=stroke)
        v = up_vector(i); red = (210, 0, 0, 255) if i not in FLIPPED else (0, 90, 220, 255)
        if big:
            arrow(d, (cx + (70 if wide else 0), cy + (6 if wide else 42)), v, fill=red)
        else:
            arrow(d, (cx, cy + 22), v, L=26, fill=red, w=4)
        if i in FLIPPED:
            d.text((cx-(95 if i == 20 else 0), cy-30+(60 if i == 20 else 0)), '旋转180°', font=font(13), fill=(0, 70, 200, 255), anchor='mm', stroke_width=2, stroke_fill=stroke)

def main():
    R = os.path.join(ROOT, 'reference'); os.makedirs(R, exist_ok=True); os.makedirs(os.path.join(R, 'panel_masks'), exist_ok=True)
    # 1. template mask
    Image.fromarray((MASK*255).astype(np.uint8)).save(os.path.join(R, 'template_mask.png'))
    # 2. panel map (colour fills + labels + arrows) with a legend column
    base = np.zeros((N, N, 4), np.uint8); base[..., 3] = 255
    for i in range(1, NLAB+1): base[comp(i)] = col(i, 255)
    for i in range(1, NLAB+1): base[outline_of(comp(i))] = (40, 40, 40, 255)
    pm = Image.fromarray(base); d = ImageDraw.Draw(pm); draw_labels(d)
    d.text((512, 11), '↑ 车头 FRONT', font=font(15), fill=(255, 255, 255, 255), anchor='mm', stroke_width=3, stroke_fill=(120, 0, 0, 255))
    d.text((512, 1015), '车尾 REAR ↓', font=font(15), fill=(255, 255, 255, 255), anchor='mm', stroke_width=3, stroke_fill=(120, 0, 0, 255))
    LW = 640; sheet = Image.new('RGB', (N+LW, N), (30, 30, 34)); sheet.paste(pm.convert('RGB'), (0, 0)); ld = ImageDraw.Draw(sheet)
    x = N+20; y = 16
    ld.text((x, y), 'Tesla Model Y L 贴图分区图 (1024×1024)', font=font(26), fill=(255, 255, 255)); y += 40
    for t in ('红色箭头 = 该块图案在车上的“上”指向画面哪个方向；', '蓝色(17/20) = 车上整块旋转180°显示。',
              '所有图的“头”都要朝车中心；前脸3与引擎盖4要倒着画(上=图下)。', '尾门 17/20：照常画正，再用 make_wrap / finalize_wrap 自动转180°。'):
        ld.text((x, y), t, font=font(15), fill=(210, 210, 210)); y += 22
    y += 8
    for i in range(1, NLAB+1):
        ld.rectangle([x, y+4, x+18, y+22], fill=col(i)[:3], outline=(255, 255, 255))
        nm, note, _ = PANELS[i]
        ld.text((x+28, y), f'{i:>2} {nm}   上={up_words(i)}', font=font(16), fill=(255, 255, 255)); y += 21
        ld.text((x+28, y), note, font=font(12), fill=(170, 170, 178)); y += 20
    sheet.save(os.path.join(R, 'panel_map.png'), optimize=True)
    # 3. Photoshop overlays (transparent 1024x1024): outlines + numbers/names + arrows
    ov = np.zeros((N, N, 4), np.uint8)
    for i in range(1, NLAB+1): ov[outline_of(comp(i))] = col(i, 255)
    outline_only = Image.fromarray(ov.copy()); outline_only.save(os.path.join(R, 'guide_outline_only.png'), optimize=True)
    g = Image.fromarray(ov); d = ImageDraw.Draw(g); draw_labels(d, names=True, stroke=(255, 255, 255, 230))
    g.save(os.path.join(R, 'guide_overlay.png'), optimize=True)
    g2 = Image.fromarray(ov.copy()); d = ImageDraw.Draw(g2); draw_labels(d, names=False, stroke=(255, 255, 255, 230))
    g2.save(os.path.join(R, 'guide_overlay_numbers.png'), optimize=True)
    # 4. per-panel masks (white = panel) for selections in Photoshop (File > Open, Select > Color Range / Magic wand)
    for i in range(1, NLAB+1):
        Image.fromarray((comp(i)*255).astype(np.uint8)).save(os.path.join(R, 'panel_masks', f'panel_{i:02d}.png'), optimize=True)
    # 5. machine-readable table
    info = {}
    for i in range(1, NLAB+1):
        m = comp(i); ys, xs = np.nonzero(m); x0, y0, x1, y1 = bbox(m); v = up_vector(i)
        info[i] = dict(name_cn=PANELS[i][0], note_cn=PANELS[i][1], bbox=[int(x0), int(y0), int(x1), int(y1)],
                       centroid=[round(float(xs.mean()), 1), round(float(ys.mean()), 1)], area=int(m.sum()),
                       car_up_on_sheet=[round(v[0], 3), round(v[1], 3)], shown_rotated_180=i in FLIPPED)
    json.dump(info, open(os.path.join(R, 'panel_info.json'), 'w'), ensure_ascii=False, indent=1)
    print('reference images written to', R)

if __name__ == '__main__':
    main()
