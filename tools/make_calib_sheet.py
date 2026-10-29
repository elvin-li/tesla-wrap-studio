"""Diagnostic wrap: every panel a distinct colour + checker, its number and car-part name written so it
reads upright on the car (text top = panel 'up', toward the sheet centre), a 64-px grid with coordinates,
and FRONT/REAR arrows.  Load it in the Tesla preview to confirm the mapping (reference/myl_calib.png is the one used for the
calibration).  Usage: python tools/make_calib_sheet.py [out.png]"""
import sys, os, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from mylwrap.core import *
from PIL import ImageDraw, ImageFont
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
try: ImageFont.truetype(F, 10)
except Exception: F = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
font = lambda n: ImageFont.truetype(F, n)
SHORT = {1: 'L FENDER', 2: 'R FENDER', 3: 'FRONT FASCIA', 4: 'HOOD', 5: 'L A-PILLAR', 6: 'R A-PILLAR', 7: 'L MIR', 8: 'R MIR',
         9: 'L FRONT DOOR', 10: 'R FRONT DOOR', 11: 'L REAR DOOR', 12: 'R REAR DOOR', 13: 'L C', 14: 'R C',
         15: 'L QUARTER', 16: 'R QUARTER', 17: 'SPOILER', 18: 'L CORNER', 19: 'R CORNER', 20: 'TAILGATE'}
UP = {3: 180, 4: 180, 1: -90, 2: 90, 9: -90, 11: -90, 10: 90, 12: 90, 17: 0, 18: 0, 19: 0, 20: 0, 15: -90, 16: 90}
img = Image.new('RGB', (N, N))
a = np.array(img)
yy, xx = np.mgrid[0:N, 0:N]
chk = (((xx // 32) + (yy // 32)) % 2).astype(bool)
for i in range(1, NLAB+1):
    h = (i * 0.618) % 1.0
    import colorsys
    c1 = np.array(colorsys.hsv_to_rgb(h, 0.55, 0.95)) * 255; c2 = np.array(colorsys.hsv_to_rgb(h, 0.75, 0.75)) * 255
    m = comp(i); a[m & chk] = c1; a[m & ~chk] = c2
img = Image.fromarray(a); d = ImageDraw.Draw(img)
for g in range(64, N, 64):                                       # grid + coordinates
    d.line([(g, 0), (g, N)], fill=(255, 255, 255), width=1); d.line([(0, g), (N, g)], fill=(255, 255, 255), width=1)
    for t in range(64, N, 128):
        d.text((g+2, t+14), f'x{g}', fill=(0, 0, 0), font=font(9)); d.text((t+14, g+2), f'y{g}', fill=(0, 0, 0), font=font(9))
for i in range(1, NLAB+1):                                       # labels, upright on the car
    ys, xs = np.nonzero(comp(i)); cx, cy = xs.mean(), ys.mean()
    ang = UP.get(i, math.degrees(math.atan2(-(N/2-cy), N/2-cx)) - 90)
    big = comp(i).sum() > 9000
    txt = f'{i}' + (f' {SHORT[i]}' if big else '')
    sz = (17 if i in (1, 2, 15, 16, 18, 19) else 22) if big else 14
    tw = int(d.textlength(txt, font=font(sz))) + 8
    t = Image.new('RGBA', (tw, sz + 10), (0, 0, 0, 0)); td = ImageDraw.Draw(t)
    td.text((4, 2), txt, font=font(sz), fill=(0, 0, 0), stroke_width=3, stroke_fill=(255, 255, 255))
    if big:   # arrow pointing "up" on the car
        td.polygon([(tw-8, 2), (tw-14, 12), (tw-2, 12)], fill=(200, 0, 0))
    t = t.rotate(ang, expand=True)
    img.paste(t, (int(cx - t.width/2), int(cy - t.height/2)), t)
# FRONT marker at the fascia, written upright for a viewer in front of the car
for txt, (x, y), ang in (('FRONT', (512, 60), 180), ('REAR', (516, 975), 0)):
    t = Image.new('RGBA', (120, 34), (0, 0, 0, 0)); ImageDraw.Draw(t).text((6, 2), txt, font=font(26), fill=(255, 0, 0), stroke_width=3, stroke_fill=(255, 255, 255))
    t = t.rotate(ang, expand=True); img.paste(t, (x - t.width//2, y - t.height//2), t)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'output', 'myl_calib_new.png')
assert not os.path.exists(OUT), OUT + ' exists'
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
finish(img.convert('RGBA'), OUT, edge=True)
print('written', OUT)
