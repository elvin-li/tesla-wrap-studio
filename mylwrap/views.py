"""On-car views of a Model Y L wrap sheet, matching the Tesla app renders (calibrated with myl_calib.png,
see core.TESLA_MAPPING):
  TOP   : the sheet as seen from above, front up, un-mirrored (hood fully visible, fenders, roof rails)
  FRONT : hood (rot 180, its sheet-top edge = nose, foreshortened, widened to ~0.76x fascia width) above the
          front fascia (rot 180, stretched to its real taller proportion), fenders at the sides
  LEFT / RIGHT : fender + doors + quarter, front at left / right, mirror + handles marked
  REAR  : corners 18/19 as on the sheet, tailgate panels 17/20 rotated 180 in place (as the car shows them)
  FRONT-LEFT / FRONT-RIGHT 3/4 : 3D renders of the front panels (car3d.py, calibrated with the in-car
          renders of 2026-10-25), via front34_left/front34_right and make34()
Usage: python3 -m mylwrap.views sheet.png preview.png [--34]"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw
BG = (24, 24, 28)

def _car_rear(im):
    from .core import comp, bbox, TAILGATE_FLIP
    a = np.array(im); out = a.copy()
    for c in TAILGATE_FLIP:
        m = comp(c); x0, y0, x1, y1 = bbox(m)
        blk = a[y0:y1, x0:x1][::-1, ::-1]; sub = out[y0:y1, x0:x1]; mm = m[y0:y1, x0:x1]; sub[mm] = blk[mm]
    return Image.fromarray(out)

def top_view(im):
    return im.crop((200, 0, 824, 430))

def front_view(im):
    fas = im.crop((240, 22, 788, 132)).rotate(180).resize((548, 165), Image.LANCZOS)
    hood = im.crop((375, 150, 652, 384)).rotate(180)
    hw = int(548 * 0.76); hh = int(234 * hw / 277 * 0.55)
    hood = hood.resize((hw, hh), Image.LANCZOS)
    fl = im.crop((30, 15, 244, 278)).rotate(90, expand=True); fr = im.crop((791, 16, 1003, 280)).rotate(-90, expand=True)
    fl = fl.resize((int(fl.width*0.5), int(fl.height*0.5))); fr = fr.resize((int(fr.width*0.5), int(fr.height*0.5)))
    c = Image.new('RGB', (548 + 2*fl.width + 20, hh + 165 + 10), BG)
    ox = fl.width + 10
    c.paste(hood, (ox + (548-hw)//2, 0)); c.paste(fas, (ox, hh + 6))
    c.paste(fl, (0, hh + 6 + 165 - fl.height)); c.paste(fr, (ox + 548 + 10, hh + 6 + 165 - fr.height))
    return c

def _side(im, x0, x1, rot, marks):
    v = im.crop((x0, 5, x1, 950)).rotate(rot, expand=True); d = ImageDraw.Draw(v)
    for (u, w, t) in marks:
        d.ellipse([u-7, w-5, u+7, w+5], outline=(255, 255, 0), width=2); d.text((u-14, w+6), t, fill=(255, 255, 0))
    return v
def _ml(x, y): return (y - 5, 289 - (x - 10))
def _mr(x, y): return (944 - (y - 5), x - 725)
def left_view(im):  return _side(im, 10, 300, 90, [_ml(196, 287) + ('mirror',), _ml(178, 480) + ('handle',), _ml(195, 690) + ('handle',)])
def right_view(im): return _side(im, 725, 1015, -90, [_mr(828, 287) + ('mirror',), _mr(846, 480) + ('handle',), _mr(829, 690) + ('handle',)])
def rear_view(im):  return _car_rear(im).crop((110, 730, 925, 1020))

def front34_thumb(im, w=300):
    """compact 'front' thumbnail for contact sheets: front view over the left side"""
    f = front_view(im); l = left_view(im)
    f = f.resize((w, int(f.height*w/f.width))); l = l.resize((w, int(l.height*w/l.width)))
    c = Image.new('RGB', (w, f.height + l.height + 4), BG); c.paste(f, (0, 0)); c.paste(l, (0, f.height + 4))
    return c

def make(src, out, W=1000):
    im = Image.open(src).convert('RGB')
    def fit(p): return p.resize((W, int(p.height*W/p.width)), Image.LANCZOS)
    t = top_view(im); t = t.resize((W//2, int(t.height*(W//2)/t.width)))
    f = front_view(im); f = f.resize((W//2, int(f.height*(W//2)/f.width)))
    tf = Image.new('RGB', (W, max(t.height, f.height)), BG); tf.paste(t, (0, 0)); tf.paste(f, (W//2, 0))
    panels = [('TOP (front up)  |  FRONT (head-on)', tf), ('LEFT SIDE (front at left)', fit(left_view(im))),
              ('REAR (tailgate 17/20 shown as the car rotates them)', fit(rear_view(im))), ('RIGHT SIDE (front at right)', fit(right_view(im)))]
    H = sum(p.height + 26 for _, p in panels)
    col = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(col); y = 0
    for tt, p in panels:
        d.text((6, y+6), tt, fill=(235, 235, 235)); col.paste(p, (0, y+24)); y += p.height + 26
    s = 1024 / H if H > 1024 else 1
    col = col.resize((int(W*s), int(H*s)), Image.LANCZOS)
    pv = Image.new('RGB', (1024 + 16 + col.width, max(1024, col.height)), BG)
    pv.paste(im, (0, 0)); pv.paste(col, (1040, 0)); pv.save(out, optimize=True)
    return pv.size

def front34_left(im, **kw):
    from . import car3d; return car3d.render34(im, 'left', **kw)
def front34_right(im, **kw):
    from . import car3d; return car3d.render34(im, 'right', **kw)

def make34(src, out, W=1000):
    """make() layout plus a bottom row with the front-left and front-right 3/4 renders."""
    tmp = out + '.tmp.png'; make(src, tmp, W); base = Image.open(tmp).convert('RGB'); os.remove(tmp)
    im = Image.open(src).convert('RGB')
    l, r = front34_left(im), front34_right(im)
    hw = base.width // 2; l = l.resize((hw, int(l.height*hw/l.width)), Image.LANCZOS); r = r.resize((hw, int(r.height*hw/r.width)), Image.LANCZOS)
    pv = Image.new('RGB', (base.width, base.height + l.height + 26), BG); pv.paste(base, (0, 0)); d = ImageDraw.Draw(pv)
    d.text((6, base.height + 6), 'FRONT-LEFT 3/4', fill=(235, 235, 235)); d.text((hw + 6, base.height + 6), 'FRONT-RIGHT 3/4', fill=(235, 235, 235))
    pv.paste(l, (0, base.height + 24)); pv.paste(r, (hw, base.height + 24)); pv.save(out, optimize=True)
    return pv.size

if __name__ == '__main__':
    print((make34 if '--34' in sys.argv[3:] else make)(sys.argv[1], sys.argv[2]))
