"""mylwrap.builder -- high-level building blocks used by make_wrap.py (and usable from your own scripts).

    from mylwrap import builder
    canvas = builder.make_background('bg.jpg', mode='crop')           # RGBA 1024x1024
    builder.place_front_atlas(canvas, 'hood_cut.png', face_box=(570,75,725,238))
    builder.place_door(canvas, 'left_cut.png', 'left', face_box=(162,125,312,287), face_center=(118,392), scale=0.34)
    builder.place_emblem(canvas, 'rear_cut.png')
    builder.finish(canvas, 'out.png', fix_tailgate=True)
"""
import os
import numpy as np
from PIL import Image, ImageFilter, ImageChops
from scipy.ndimage import map_coordinates, gaussian_filter, binary_erosion
from . import car3d
from .core import (N, MASK, comp, bbox, cutout, tint, trim, facemask, load_bg, local_darken, vignette,
                   place_emblem, place_side, place_front_figure, finish, _union,
                   HOOD_FACE_V, FASCIA_V_STRETCH)

WARM = (255, 210, 120)      # rim-glow colour round the figures
TINT = (255, 170, 80)       # slight warm tint of figures (amount 0.04)


def make_background(path, mode='crop', zoom=1.0, darken=0.22, vig=0.15, **proj_kw):
    """mode 'crop': centre-square crop of the picture, resized to 1024 (like a flat poster).
    mode 'car' : 360-degree panorama projected onto the car (horizon runs round the whole body, see core.car_panorama;
                 proj_kw: horizon_row, horizon_d, ocean_rows, sky_px_per_row, front_az, sea_blur ...).
    darken: darkens the door panels a little so figures stand out;  vig: edge vignette."""
    bg = load_bg(path, zoom=zoom, projection='car' if mode == 'car' else None, **proj_kw)
    if darken: bg = local_darken(bg, (9, 11, 10, 12), darken)
    if vig: bg = vignette(bg, vig)
    return bg.convert('RGBA')


def halo(canvas, layer, shadow=(0, 4), warm=WARM):
    """soft drop shadow + warm rim glow under `layer` (an RGBA 1024 layer), clipped to the template, then the layer."""
    a = layer.getchannel('A')
    sh = Image.new('RGBA', (N, N), (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v*0.5)).filter(ImageFilter.GaussianBlur(6)))
    gl = Image.new('RGBA', (N, N), tuple(warm) + (0,)); gl.putalpha(a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v*0.75)))
    clip = Image.fromarray((_union(range(1, 21))*255).astype(np.uint8))
    for l in (sh, gl): l.putalpha(ImageChops.multiply(l.getchannel('A'), clip))
    canvas.alpha_composite(sh, shadow); canvas.alpha_composite(gl); canvas.alpha_composite(layer)


def auto_face_box(fig, kind='front'):
    """Rough face box (x0,y0,x1,y1 in figure px) when you did not give one -- ALWAYS better to pass your own.
    front : head at the top centre of the figure;  left: head at the image-left end;  right: head at the image-right end."""
    x0, y0, x1, y1 = fig.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    bw, bh = x1-x0, y1-y0
    if kind == 'front':
        fh = 0.22*bh; fw = 0.9*fh; cx = (x0+x1)/2
        return (int(cx-fw/2), int(y0+0.05*bh), int(cx+fw/2), int(y0+0.05*bh+fh))
    fs = 0.5*bh; cy = (y0+y1)/2
    if kind == 'left': return (int(x0+0.02*bw), int(cy-fs/2), int(x0+0.02*bw+fs), int(cy+fs/2))
    return (int(x1-0.02*bw-fs), int(cy-fs/2), int(x1-0.02*bw), int(cy+fs/2))


def place_front_atlas(canvas, fig_path, face_box=None, S=0.0024, VF=HOOD_FACE_V, U0=0.45, CMP=0.55, VC=FASCIA_V_STRETCH,
                      tint_col=TINT, tint_amt=0.04, cache=None, fade_rows=60, check=True):
    """ONE continuous picture over hood 4 + fascia 3 + fenders 1/2 (the calibrated 'front atlas', car3d.front_uv).
    fig_path : upright figure (waist-up works best, head at the top, arms may spread out onto the fenders), PNG with alpha.
    face_box : (x0,y0,x1,y1) of the face in the figure's pixels.   S: metres per source px (0.0024 = ~1:1 on the car; bigger = smaller figure).
    VF       : surface V of the face centre (metres; hood spans -1.28..0; -0.70 = face ~0.66 m from the windscreen end).
    VC       : bumper vertical stretch (1.8; fascia shows only ~0.30 m of height, this puts the navel/belt there).
    U0, CMP  : arms further than U0 m from the centre line are squeezed by CMP onto the fenders.
    check    : assert the face lies completely on the hood (not on bumper/fender/nose band)."""
    fig = cutout(fig_path, cache)
    if face_box is None:
        face_box = auto_face_box(fig, 'front'); print('  [front] no face box given, guessing', face_box)
    fcx, fcy = (face_box[0]+face_box[2])/2, (face_box[1]+face_box[3])/2
    src = np.array(tint(fig, tint_col, tint_amt) if tint_amt else fig).astype(float)/255
    src[..., :3] *= src[..., 3:4]                                    # premultiplied
    src = np.stack([gaussian_filter(src[..., c], 1.1) for c in range(4)], -1)
    H0, W0 = src.shape[:2]
    layer = np.zeros((N, N, 4)); facehit = {}
    def mapping(cid):
        ys, xs = np.nonzero(comp(cid))
        U, V = car3d.front_uv(cid, xs, ys); V = car3d.v_stretch(V, VC)
        au = np.abs(U); g = np.where(au <= U0, au, U0 + (au - U0)/CMP)
        return ys, xs, fcx + np.sign(U)*g/S, fcy + (V - VF)/S
    for cid in (4, 3, 1, 2):
        ys, xs, sx, sy = mapping(cid)
        inside = (sx >= 0) & (sx <= W0-1) & (sy >= 0) & (sy <= H0-1)
        vals = np.stack([map_coordinates(src[..., c], [sy, sx], order=1, mode='constant', cval=0) for c in range(4)], -1)
        vals[~inside] = 0
        if cid == 3 and fade_rows:   # soft fade of the cut-off bottom of the source on the fascia
            vals *= np.clip((H0 - 1 - sy)/fade_rows, 0, 1)[:, None]
        layer[ys, xs] = vals
        facehit[cid] = int(((sx >= face_box[0]) & (sx <= face_box[2]) & (sy >= face_box[1]) & (sy <= face_box[3])).sum())
    a = layer[..., 3:4]; rgb = np.where(a > 1e-4, layer[..., :3]/np.maximum(a, 1e-4), 0)
    front = Image.fromarray((np.concatenate([rgb, a], -1)*255).clip(0, 255).astype(np.uint8), 'RGBA')
    ys, xs, sx, sy = mapping(4)
    fm = (sx >= face_box[0]) & (sx <= face_box[2]) & (sy >= face_box[1]) & (sy <= face_box[3])
    fy, fx = ys[fm], xs[fm]
    if check:
        ok = binary_erosion(comp(4), iterations=8)
        if any(facehit[c] for c in (3, 1, 2)) or len(fx) == 0 or not ok[fy, fx].all() or fy.min() < 190:
            raise SystemExit('FRONT FIGURE: the face is not completely inside the hood (panel 4) -- change --front-v '
                             '(more negative = face further back toward the windscreen), --front-scale or the face box. '
                             f'face pixels per panel: {facehit}')
    halo(canvas, front)
    cov = {c: round(float((np.array(front.getchannel('A'))[comp(c)] > 128).mean()), 3) for c in (4, 3, 1, 2)}
    return dict(face_box_sheet=(int(fx.min()), int(fy.min()), int(fx.max()), int(fy.max())) if len(fx) else None, coverage=cov)


DOOR = {'left': dict(rot=-90, clip=(9, 11), face_cid=9, shadow=(-5, 0), default_fc=(118, 392), comps=(9, 11)),
        'right': dict(rot=90, clip=(10, 12), face_cid=10, shadow=(5, 0), default_fc=(905, 392), comps=(10, 12))}


def place_door(canvas, fig_path, side, face_box=None, face_center=None, scale=None, rot=None, tint_col=TINT, tint_amt=0.04,
               cache=None, ero=4):
    """Lying figure over the front+rear door of one side (head toward the FRONT of the car = sheet top).
    side 'left'  : the figure lies with its head at the IMAGE-LEFT  (rot -90);   side 'right': head at the IMAGE-RIGHT (rot +90).
    face_center + scale: calibrated fixed placement (face centre in sheet px, scale = sheet px per source px);
                         without them the largest scale is searched that keeps the face fully inside the front door."""
    d = DOOR[side]; rot = d['rot'] if rot is None else rot
    fig = cutout(fig_path, cache)
    if face_box is None:
        face_box = auto_face_box(fig, side); print(f'  [{side} door] no face box given, guessing', face_box)
    if face_center is None or scale is None:
        r = place_side(canvas, fig_path, cache, face_box, rot, d['comps'], d['face_cid'], WARM, d['shadow'], tint_col,
                       tint_amt=tint_amt, face_target=face_center, scale=scale)
        return r
    fm = facemask(fig.size, face_box)
    fig, fm = trim(fig, fm)
    fig = fig.rotate(rot, expand=True, resample=Image.BICUBIC); fm = fm.rotate(rot, expand=True)
    w, h = int(fig.width*scale), int(fig.height*scale)
    fig = tint(fig.resize((w, h), Image.LANCZOS), tint_col, tint_amt); f_s = np.array(fm.resize((w, h))) > 127
    fys, fxs = np.nonzero(f_s); dx = int(round(face_center[0] - fxs.mean())); dy = int(round(face_center[1] - fys.mean()))
    okk = binary_erosion(comp(d['face_cid']), iterations=ero)
    yy, xx = fys+dy, fxs+dx
    if yy.min() < 0 or xx.min() < 0 or yy.max() >= N or xx.max() >= N or not okk[yy, xx].all():
        raise SystemExit(f'{side.upper()} DOOR: the face box is not completely inside the front door panel {d["face_cid"]} -- '
                         'move --%s-face-center or reduce --%s-scale' % (side, side))
    clip = Image.fromarray((_union(d['clip'])*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    layer = Image.new('RGBA', (N, N), (0, 0, 0, 0)); layer.alpha_composite(fig, (max(dx, 0), max(dy, 0)), (max(-dx, 0), max(-dy, 0)))
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), clip)); halo(canvas, layer, d['shadow'])
    return dict(scale=scale, face_px=(int(np.ptp(fxs))+1, int(np.ptp(fys))+1), face_c=(int(fxs.mean()+dx), int(fys.mean()+dy)),
                face_box=(int(fxs.min()+dx), int(fys.min()+dy), int(fxs.max()+dx), int(fys.max()+dy)))


def check_output(path, max_bytes=1_000_000):
    """Hard-rule check of a finished wrap.  Returns (ok, [messages])."""
    msgs = []; ok = True
    def rep(cond, text):
        nonlocal ok; ok &= bool(cond); msgs.append(('PASS ' if cond else 'FAIL ') + text)
    im = Image.open(path); a = np.array(im.convert('RGB'))
    rep(im.format == 'PNG', f'PNG format ({im.format})')
    rep(im.size == (N, N), f'size {im.size[0]}x{im.size[1]} == 1024x1024')
    sz = os.path.getsize(path); rep(sz < max_bytes, f'file size {sz:,} B < 1 MB')
    nm = os.path.basename(path); rep(len(nm) <= 30, f'file name "{nm}" is {len(nm)} chars (<= 30)')
    bad = int((a[~MASK].sum(1) != 0).sum()); rep(bad == 0, f'{bad} non-black pixels outside the template mask (must be 0)')
    return ok, msgs
