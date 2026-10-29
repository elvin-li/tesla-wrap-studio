"""mylwrap.core -- Tesla Model Y L (Juniper "L") wrap template toolkit: template mask, calibrated panel mapping
(TESLA_MAPPING + constants), tailgate 180-degree fix, 360-degree panorama projection onto the car ("globe unwrapping"),
compositing helpers and finish() (black outside the mask + 256-colour quantisation, < 1 MB).
Everything is applied through the template mask; outside = #000000.  Calibrated with in-car photos (2026-10-18 .. 2026-10-29).
"""
import math, os
import numpy as np
from PIL import Image, ImageFilter, ImageChops, ImageEnhance
from scipy.ndimage import label, binary_erosion, binary_closing, binary_fill_holes, distance_transform_edt, map_coordinates

N = 1024
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
MASK = np.array(Image.open(os.path.join(DATA, 'mask.png'))) > 127
LAB, NLAB = label(MASK)
OL = (40, 28, 34)

def comp(i): return LAB == i
def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max()+1, ys.max()+1

_session = None
def cutout(path, cache=None, model='isnet-anime'):
    """RGBA cut-out of a figure.  If `path` is already a PNG/WebP with real transparency it is used as is.
    Otherwise the background is removed with rembg (pip install rembg) and cached in `cache` if given."""
    global _session
    if cache and os.path.exists(cache):
        return Image.open(cache).convert('RGBA')
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
        im = im.convert('RGBA')
        if np.array(im.getchannel('A')).min() < 250: return im
    try:
        from rembg import remove, new_session
    except ImportError:
        raise SystemExit(f"{path}: image has no transparency. Either give a PNG with a transparent background "
                         "(cut it out in Photoshop / remove.bg) or `pip install rembg` for automatic cut-out.")
    if _session is None: _session = new_session(model)
    o = remove(im.convert('RGB'), session=_session)
    a = np.array(o.getchannel('A')).astype(float)
    a = np.clip((a - 25) * 255 / 205, 0, 255).astype(np.uint8)       # clean the faint halo
    o.putalpha(Image.fromarray(a))
    if cache: o.save(cache)
    return o

# ---------------------------------------------------------------------------------------------
# Panel -> car mapping for the Model Y L template, confirmed against the Tesla 3D preview render of
# myl_nami.png (front-left 3/4 view).  "up" = the direction on the sheet that points UP on the car.
TESLA_MAPPING = {
    # calibrated with myl_calib.png loaded in the Tesla app (top, front-left 3/4, rear-left 3/4 renders, 2026-10-18)
    3:  ('front fascia / bumper: whole nose below the hood; its top edge (sheet y~108-126) runs under the light bar '
         'that sits on the hood/fascia seam; the wings x240-300 / 728-788 wrap round the front corners down to the '
         'front wheel arches (below the fender fronts); small lamp near sheet (330,62) / (700,62); lower grille '
         'opening sheet y<46 between x~405-614; text drawn rot180 reads upright from the front (in-car check '
         '2026-10-25).  Px scale ~0.77x the hood px (FASCIA_HOOD_PX)', 'down'),
    4:  ('hood, FULLY visible from the top view: sheet y~150 = front edge (over the nose), y~383 = windscreen, '
         'x 375-652; the sheet is shown un-mirrored from above (front up)', 'down'),
    1:  ('left front fender (sheet top = front at the light-bar end, sheet bottom meets the front door, inner edge '
         '= hood line along the hood side; concave outer boundary = wheel arch; lobe at sheet y~235-270 runs down '
         'behind the wheel to the rocker; text at -90 runs along the fender, in-car check 2026-10-25)', 'right'),
    2:  ('right front fender', 'left'),
    5:  ('left roof rail / A-pillar strip: runs from the windscreen base along the roof edge over both doors', 'toward centre'),
    6:  ('right roof rail / A-pillar strip', 'toward centre'),
    7:  ('left mirror cap', 'toward centre'), 8: ('right mirror cap', 'toward centre'),
    9:  ('left FRONT door: sheet top = front, inner edge x~190 = window line; mirror at the inner-top corner, '
         'handle at the inner edge near the rear (sheet ~(178, 480))', 'right'),
    11: ('left REAR door: handle at the inner edge ~3/4 back (sheet ~(195, 690))', 'right'),
    10: ('right FRONT door (mirror image of 9)', 'left'), 12: ('right REAR door', 'left'),
    13: ('left C-pillar / rear roof side beside the rear window', 'toward centre'),
    14: ('right C-pillar / rear roof side', 'toward centre'),
    15: ('left rear quarter over the rear wheel, charge port near its rear-top (sheet ~(200, 900))', 'right'),
    16: ('right rear quarter', 'left'),
    17: ('tailgate upper strip under the spoiler -- ROTATED 180 (text appears upside-down): up = sheet DOWN', 'down'),
    20: ('tailgate lower panel above the plate -- ROTATED 180 (text appears upside-down): up = sheet DOWN', 'down'),
    18: ('rear bumper left corner (upright as on the sheet)', 'up'),
    19: ('rear bumper right corner (upright as on the sheet)', 'up'),
}
TAILGATE_FLIP = (17, 20)   # panels the car shows rotated 180 degrees (re-confirmed in-car 2026-10-25: '20 TAILGATE'
                           # reads upside-down AND right-to-left, i.e. a true rotation, each panel inside its own bbox)
# physical px scales (metres / sheet px), from label sizes in the in-car renders (2026-10-25); see car3d.py
PX_M = {'hood': 0.0055, 'fascia': 0.0042, 'fender': 0.0047, 'door': 0.0047}
# In-car check 2026-10-29: the visible bumper (rows y46-108) only spans ~0.30 m of surface V; a figure drawn at hood
# scale puts ONLY midriff there (flat skin slab).  Build art with car3d.v_stretch (c~1.8) or a short-torso source so the
# navel/chain/belt land on the bumper; keep the face ~0.66 m from the cowl-end of the hood (V~-0.70), not -0.78.
FASCIA_V_STRETCH = 1.8
HOOD_FACE_V = -0.70
FASCIA_HOOD_PX = PX_M['fascia'] / PX_M['hood']   # ~0.77: a fascia px is smaller than a hood px

def _tailgate_index_maps(cids=TAILGATE_FLIP, keep_edge=False):
    """(target ys, xs, source ys, xs) for rotating each panel 180 inside its bbox.  keep_edge: leave the 2-px
    outline alone and take sources only from panel interiors (nearest interior pixel where the rotated
    position falls outside) -- for finished sheets that are black outside the mask."""
    from scipy.ndimage import distance_transform_edt as edt
    T = []
    for c in cids:
        m = comp(c); x0, y0, x1, y1 = bbox(m)
        inner = binary_erosion(m, iterations=2) if keep_edge else m
        ty, tx = np.nonzero(inner[y0:y1, x0:x1])
        sy, sx = (y1-y0-1) - ty, (x1-x0-1) - tx
        if keep_edge:
            ok = inner[y0:y1, x0:x1]
            _, (iy, ix) = edt(~ok, return_indices=True)
            sy, sx = iy[sy, sx], ix[sy, sx]
        T.append((ty+y0, tx+x0, sy+y0, sx+x0))
    return T

def tailgate_fix(img, cids=TAILGATE_FLIP, keep_edge=False):
    """Rotate each tailgate panel's content 180 degrees inside its own bbox, so art composed 'upright on the
    sheet' (head toward the centre, like every other panel) shows upright on the car.  The car then
    displays exactly the un-fixed sheet layout of 17/20 (car-left = sheet-left, 17 above 20).
    Works on RGB/RGBA and on palette ('P') images (indices are moved, palette kept)."""
    a = np.array(img); out = a.copy()
    for ty, tx, sy, sx in _tailgate_index_maps(cids, keep_edge):
        out[ty, tx] = a[sy, sx]
    o = Image.fromarray(out, img.mode) if img.mode in ('P', 'L', 'RGB', 'RGBA') else Image.fromarray(out)
    if img.mode == 'P': o.putpalette(img.getpalette())
    return o

# Panel scale on the car is not uniform: hood ~1.45 m over ~277 px (its first ~45 px from the sheet-top edge
# curve over the nose); fascia ~1.9 x 0.55 m over 548 x 110 px and seen head-on it is the biggest surface
# from the front; doors ~1.2 x 0.75 m over ~245 x 170 px, mirror at the front door's inner-top corner and
# flush handles near each door's inner-rear -> keep faces mid-door, toward the outer half.

# ---------------------------------------------------------------------------------------------
# Car-surface projection ("globe unwrapping").  The template is an unfolded car seen from above:
# roof in the middle, every panel's outer edge is the bottom of the body (sill / bumper lip), and
# moving toward the centre goes UP the body.  So each sheet pixel gets
#   azimuth  theta: angle around the car centre, 0 = front (sheet top), 90 = left, 180 = rear, 270 = right
#   height   d    : distance (px) from the outer outline of the whole car silhouette
# and a 360-degree panorama is sampled at (theta, d): the horizon is the level set d = horizon_d,
# i.e. it runs at one height all the way round the body and bends with the fenders/corners.
_SURF = None
def car_surface_coords(close=34, smooth=14):
    global _SURF
    if _SURF is None:
        st = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)
        pad = 2*close
        m = np.pad(MASK, pad)
        sil = binary_fill_holes(binary_closing(m, structure=st, iterations=close))[pad:-pad, pad:-pad]
        from scipy.ndimage import gaussian_filter
        d = gaussian_filter(distance_transform_edt(np.pad(sil, 64)), smooth)[64:-64, 64:-64]  # smooth level sets
        yy, xx = np.mgrid[0:N, 0:N]
        theta = np.degrees(np.arctan2(-(xx - N/2), -(yy - N/2))) % 360
        _SURF = (theta, d, sil)
    return _SURF

def car_panorama(path, horizon_row=None, horizon_d=85, ocean_rows=170, sky_px_per_row=1.0,
                 front_az=0.0, mirror_tile=True, sea_blur=0.0, blur_above=2):
    """Project one panorama onto the car.  mirror_tile: panorama = [A | flip(A)], so it is seamless
    and the two mirror seams fall on the front (az 0) and rear (az 180) centre lines.
    horizon_row: horizon row in the source (auto-detected when None)."""
    src = np.array(Image.open(path).convert('RGB')).astype(np.float32)
    H, W = src.shape[:2]
    if horizon_row is None:
        g = np.abs(np.diff(src.mean(axis=(1, 2))))
        horizon_row = int(np.argmax(g[H//4:H-H//10]) + H//4)
    if sea_blur:   # wash out horizontal texture below the horizon: no streaky contour bands near the sills
        from scipy.ndimage import gaussian_filter1d
        r0 = max(0, horizon_row - blur_above + 4)          # blur_above: also wash this many rows above the horizon
        sea = src[r0:]
        for _ in range(2): sea = gaussian_filter1d(sea, sea_blur, axis=1, mode='wrap')
        sea = gaussian_filter1d(sea, 3, axis=0, mode='nearest')
        src = src.copy(); src[r0:] = sea
    pano = np.concatenate([src, src[:, ::-1]], 1) if mirror_tile else src
    PW = pano.shape[1]
    theta, d, _ = car_surface_coords()
    u = ((theta - front_az) % 360) / 360.0 * PW
    v = np.where(d <= horizon_d,
                 horizon_row + (horizon_d - d) / horizon_d * ocean_rows,       # sea: perspective-compressed
                 horizon_row - (d - horizon_d) / sky_px_per_row)              # sky: ~1:1 up to the zenith
    v = np.clip(v, 0, H - 1)
    out = np.zeros((N, N, 3), np.float32)
    for c in range(3):
        out[..., c] = map_coordinates(pano[..., c], [v, u], order=1, mode='grid-wrap')
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def load_bg(path, zoom=1.0, cx=0.5, cy=0.5, mirror=None, projection=None, **proj_kw):
    """projection='car' -> car_panorama(path, **proj_kw) (continuous 360-degree wrap-around scene).
    Default (None): centre-square crop of the scene, exactly as before.  mirror='v' replaces the top half with the flipped bottom
    half (front/rear symmetric, keeps motifs pointing away from the roof on both ends)."""
    if projection == 'car':
        return car_panorama(path, **proj_kw)
    im = Image.open(path).convert('RGB')
    s = min(im.size) / zoom
    x0 = im.width*cx - s/2; y0 = im.height*cy - s/2
    bg = im.crop((int(x0), int(y0), int(x0+s), int(y0+s))).resize((N, N), Image.LANCZOS)
    if mirror == 'v':
        a = np.array(bg); h = N//2
        bot = a[h:].astype(float); top = bot[::-1]
        # soft seam across the middle (it sits under the roof glass anyway)
        a[:h] = top.astype(np.uint8)
        bg = Image.fromarray(a)
    return bg

def local_darken(img, comps, amt=0.35, blur=40):
    m = np.zeros_like(MASK)
    for c in comps: m |= comp(c)
    b = np.array(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(float)/255
    a = np.array(img.convert('RGB')).astype(float) * (1 - amt*b)[..., None]
    return Image.fromarray(a.astype(np.uint8))

def vignette(img, strength=0.35, glow=None, glow_amt=0.0):
    yy, xx = np.mgrid[0:N, 0:N]
    r = np.hypot(xx-N/2, yy-N/2) / (N*0.72)
    v = 1 - strength*np.clip(r, 0, 1)**2
    a = np.array(img).astype(float) * v[..., None]
    if glow is not None:
        g = np.exp(-(r/0.45)**2)[..., None] * glow_amt
        a = a*(1-g) + np.array(glow, float)*g
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def tint(fig, color, amt):
    rgb = np.array(fig.convert('RGB')).astype(float)
    rgb = rgb*(1-amt) + np.array(color, float)*amt
    out = Image.fromarray(rgb.astype(np.uint8)).convert('RGBA'); out.putalpha(fig.getchannel('A'))
    return out

def trim(img, *others):
    bb = img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    return [img.crop(bb)] + [o.crop(bb) for o in others]

def facemask(size, box):
    """box: (x0,y0,x1,y1) or a list of such boxes (several faces)."""
    boxes = [box] if isinstance(box[0], (int, float)) else box
    m = Image.new('L', size, 0)
    for b in boxes: m.paste(255, tuple(int(v) for v in b))
    return m

def place_side(canvas, fig_path, cache, face_box, rot, comps, face_comp, light, shadow_dir, tint_col,
               tint_amt=0.06, fill=0.97, face_target=None, face_tol=28, scale=None):
    """Full-body reclining figure spanning both door panels (comps), rotated by rot (PIL deg CCW).
    face_target=(x, y) sheet px: put the (first) face centre within face_tol of that point -- use it to keep
    the face mid-door, clear of the window line / mirror (inner edge) and the handle.  scale: fixed scale
    (otherwise the largest that fits).  Defaults reproduce the original behaviour."""
    fig = cutout(fig_path, cache)
    fm = facemask(fig.size, face_box)
    fig, fm = trim(fig, fm)
    fig = fig.rotate(rot, expand=True, resample=Image.BICUBIC)
    fm = fm.rotate(rot, expand=True)
    strip = np.zeros_like(MASK)
    for c in comps: strip |= comp(c)
    x0, y0, x1, y1 = bbox(strip)
    fcs = face_comp if isinstance(face_comp, (tuple, list)) else (face_comp,)
    fmask_ok = np.zeros_like(MASK)
    for c in fcs: fmask_ok |= binary_erosion(comp(c), iterations=5)   # faces never straddle a gap
    best = None
    for k in (np.linspace(1.0, 0.6, 41) if face_target is not None else np.linspace(1.0, 0.7, 31)):
        s = scale if scale else min((y1-y0)*fill*k/fig.height, (x1-x0)*1.15/fig.width)
        w, h = int(fig.width*s), int(fig.height*s)
        f_s = np.array(fm.resize((w, h))) > 127
        fys, fxs = np.nonzero(f_s); fcy, fcx = fys.mean(), fxs.mean()
        cands = []
        for dy in range(y0-int(h*0.04), y1-h+int(h*0.04)+1, 3):
            for dx in range(x0-int(w*0.15), x1-w+int(w*0.15)+1, 2):
                ys, xs = np.nonzero(f_s)
                yy, xx = ys+dy, xs+dx
                if yy.min() < 0 or xx.min() < 0 or yy.max() >= N or xx.max() >= N: continue
                if not fmask_ok[yy, xx].all(): continue
                cx_ = dx + w/2; cy_ = dy + h/2
                if face_target is not None:
                    dd = math.hypot(dx+fcx-face_target[0], dy+fcy-face_target[1])
                    if dd > face_tol: continue
                    cands.append((dd + 0.05*abs(cy_-(y0+y1)/2), dx, dy))
                else:
                    cands.append((abs(cx_-(x0+x1)/2) + 0.5*abs(cy_-(y0+y1)/2), dx, dy))
        if cands:
            _, dx, dy = min(cands); best = (s, dx, dy, w, h); break
        if scale: break
    s, dx, dy, w, h = best
    f = tint(fig.resize((w, h), Image.LANCZOS), tint_col, tint_amt)
    a = f.getchannel('A')
    # soft drop shadow
    sh = Image.new('RGBA', (w, h), (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v*0.55)).filter(ImageFilter.GaussianBlur(7)))
    canvas.alpha_composite(sh, (dx + shadow_dir[0], dy + shadow_dir[1]))
    # rim glow behind the figure
    glow = Image.new('RGBA', (w, h), tuple(light) + (0,))
    glow.putalpha(a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(5)).point(lambda v: int(v*0.75)))
    canvas.alpha_composite(glow, (dx, dy))
    canvas.alpha_composite(f, (dx, dy))
    return dict(scale=round(s, 3), pos=(dx, dy), size=(w, h))

def place_hood(canvas, path, face_box, rot=180, cid=4, face_frac=0.5, feather=0.18):
    m = comp(cid); x0, y0, x1, y1 = bbox(m)
    W, H = x1-x0, y1-y0
    src = Image.open(path).convert('RGB')
    fx0, fy0, fx1, fy1 = face_box; fw, fh = fx1-fx0, fy1-fy0
    # panel shape in the content's upright frame
    mr = np.array(Image.fromarray((m[y0:y1, x0:x1]*255).astype(np.uint8)).rotate(-rot, expand=True)) > 127
    ok = binary_erosion(mr, iterations=6)
    ys, xs = np.nonzero(mr); pcx, pcy = xs.mean(), ys.mean()
    for s in np.linspace(face_frac*H/fh, 0.1, 80):
        bw, bh = fw*s, fh*s
        cands = []
        for cy in range(int(bh/2), int(H-bh/2)+1, 2):
            for cx in range(int(bw/2), int(W-bw/2)+1, 2):
                b = ok[int(cy-bh/2):int(cy-bh/2)+int(bh), int(cx-bw/2):int(cx-bw/2)+int(bw)]
                if b.size and b.all(): cands.append((math.hypot(cx-pcx, cy-(pcy-0.08*H)), cx, cy))
        if cands:
            _, cx, cy = min(cands); break
    sw, sh = int(src.width*s), int(src.height*s)
    ox = int(cx - (fx0+fw/2)*s); oy = int(cy - (fy0+fh/2)*s)
    content = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    content.paste(src.resize((sw, sh), Image.LANCZOS).convert('RGBA'), (ox, oy))
    # feathered ellipse around the subject so the portrait melts into the background
    yy, xx = np.mgrid[0:H, 0:W]
    e = ((xx-cx)/(W*0.55))**2 + ((yy-(cy+0.15*H))/(H*0.72))**2
    alpha = np.clip((1.0 - e) / feather, 0, 1)
    # also fade where the source image does not cover
    cov = np.zeros((H, W), bool); cov[max(0, oy):max(0, oy+sh), max(0, ox):max(0, ox+sw)] = True
    alpha = np.where(cov, alpha, 0)
    al = Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    content.putalpha(ImageChops.multiply(al, content.getchannel('A')))
    back = content.rotate(rot, expand=True)
    canvas.alpha_composite(back, (x0, y0))
    return dict(scale=round(s, 3), face_center=(cx, cy))

def place_emblem(canvas, path, cache, cid=20, height_frac=0.92, glow=(255, 200, 90)):
    em = trim(cutout(path, cache))[0]
    m = comp(cid); x0, y0, x1, y1 = bbox(m)
    ys, xs = np.nonzero(m); cx, cy = xs.mean(), ys.mean()
    s = min((y1-y0)*height_frac/em.height, (x1-x0)*0.6/em.width)
    e = em.resize((int(em.width*s), int(em.height*s)), Image.LANCZOS)
    g = Image.new('RGBA', e.size, tuple(glow)+(0,)); g.putalpha(e.getchannel('A').filter(ImageFilter.GaussianBlur(6)).point(lambda v: int(v*0.8)))
    pos = (int(cx - e.width/2), int(cy - e.height/2))
    canvas.alpha_composite(g, pos); canvas.alpha_composite(e, pos)

def finish(canvas, out_path, edge=True, fix_tailgate=False):
    """fix_tailgate=True: apply tailgate_fix (calibrated builds); default keeps the old output."""
    if fix_tailgate: canvas = tailgate_fix(canvas)
    arr = np.array(canvas.convert('RGB'))
    if edge:
        e = MASK & ~binary_erosion(MASK, iterations=2); arr[e] = OL
    arr[~MASK] = 0
    img = Image.fromarray(arr)
    q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    pa = np.array(q.getpalette()[:768]).reshape(-1, 3); qi = np.array(q)
    bi = int(np.argmin(pa.sum(1))); pa[bi] = 0; qi[~MASK] = bi
    out = Image.fromarray(qi.astype(np.uint8), 'P'); out.putpalette(pa.flatten().tolist())
    out.save(out_path, optimize=True)
    return out

def _union(cids):
    m = np.zeros_like(MASK)
    for c in cids: m |= comp(c)
    return m

def place_front_figure(canvas, path, cache, face_box, cids=(4, 3, 1, 2), face_cid=4, rot=180, max_s=0.72,
                       cover_cids=(3,), light=(255, 220, 140), shadow=(0, 4), tint_col=None, tint_amt=0.0,
                       face_center=None, scale=None, fade_bottom=0):
    """face_center=(x, y) sheet px + scale: place the face there at that scale instead of searching
    (calibrated placement, see TESLA_MAPPING below); fade_bottom: rows at the bottom of the cut-out that
    fade out, so a figure cropped at the waist melts into the background on the fascia."""
    """Cut-out hero figure laid over hood + bumper (+ fenders) as ONE continuous figure on top of the
    projected background.  Content is upright; rot=180 points its up at the canvas centre.  Picks the
    largest scale <= max_s with face_box fully inside the eroded hood (face_cid) and the source frame
    covering cover_cids (so the figure's cropped bottom edge lies beyond the bumper lip)."""
    reg = _union(cids); x0, y0, x1, y1 = bbox(reg); W, H = x1-x0, y1-y0
    up = lambda m: np.array(Image.fromarray((m[y0:y1, x0:x1]*255).astype(np.uint8)).rotate(-rot, expand=True)) > 127
    ok = binary_erosion(up(comp(face_cid)), iterations=6)
    ys, xs = np.nonzero(up(comp(face_cid))); hcx, hcy = xs.mean(), ys.mean()
    im = cutout(path, cache)
    fx0, fy0, fx1, fy1 = face_box
    ry, rx = np.nonzero(up(_union(cover_cids)))
    best = None
    if scale is not None and face_center is not None:
        s = scale
        # sheet -> upright frame (rot 180 about the region box)
        uc, vc = (x1-1-face_center[0]), (y1-1-face_center[1])
        ox = uc - (fx0+fx1)/2*s; oy = vc - (fy0+fy1)/2*s
        bw, bh = (fx1-fx0)*s, (fy1-fy0)*s
        ya, yb, xa, xb = int(vc-bh/2), int(vc+bh/2), int(uc-bw/2), int(uc+bw/2)
        assert ok[ya:yb, xa:xb].all(), 'face box not fully inside the hood at that position'
        best = (0, ox, oy)
    for s in ([] if best else np.linspace(max_s, 0.3, 85)):
        bw, bh = (fx1-fx0)*s, (fy1-fy0)*s
        for cy in range(int(bh/2), H, 2):
            for dxo in range(-40, 41, 4):
                c = int(hcx) + dxo
                ya, yb, xa, xb = int(cy-bh/2), int(cy+bh/2), int(c-bw/2), int(c+bw/2)
                if ya < 0 or xa < 0 or yb > ok.shape[0] or xb > ok.shape[1] or not ok[ya:yb, xa:xb].all(): continue
                ox = c - (fx0+fx1)/2*s; oy = cy - (fy0+fy1)/2*s
                if rx.min() < ox or ry.min() < oy or rx.max() > ox+im.width*s or ry.max() > oy+im.height*s: continue
                dd = abs(dxo) + abs(cy - hcy)
                if best is None or dd < best[0]: best = (dd, ox, oy)
        if best: break
    _, ox, oy = best
    fig = im.resize((int(im.width*s)+1, int(im.height*s)+1), Image.LANCZOS)
    if fade_bottom:
        fb = int(fade_bottom*s); a0 = np.array(fig.getchannel('A')).astype(float)
        a0[-fb:] *= np.linspace(1, 0, fb)[:, None]**1.5; fig.putalpha(Image.fromarray(a0.astype(np.uint8)))
    if tint_col is not None and tint_amt: fig = tint(fig, tint_col, tint_amt)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.paste(fig, (int(ox), int(oy)), fig)
    layer = layer.rotate(rot, expand=True)
    keep = Image.fromarray((reg[y0:y1, x0:x1]*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    a = ImageChops.multiply(layer.getchannel('A'), keep); layer.putalpha(a)
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v*0.5)).filter(ImageFilter.GaussianBlur(7)))
    glow = Image.new('RGBA', layer.size, tuple(light) + (0,))
    glow.putalpha(a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(5)).point(lambda v: int(v*0.75)))
    canvas.alpha_composite(sh, (x0+shadow[0], y0+shadow[1])); canvas.alpha_composite(glow, (x0, y0)); canvas.alpha_composite(layer, (x0, y0))
    return dict(scale=round(float(scale if best and scale else s), 3), offset=(int(ox), int(oy)))
