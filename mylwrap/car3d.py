"""Approximate 3D surface model of the Model Y L FRONT panels (hood 4, fascia 3, fenders 1/2, front doors 9/10)
calibrated against the in-car renders of myl_calib.png (2026-10-25 photos).  Units: metres.
X lateral (+ = car LEFT), Y longitudinal (+ = forward, bumper nose ~0), Z up.
Sheet facts used (verified on the car):
  hood 4   : rot180 (reads from the front); sheet y150 = nose, y383 = windscreen; sheet-left = car-left.
  fascia 3 : rot180; top edge (y~108-126, under the light bar) meets the hood front edge; its wings
             (x240-300 / 728-788) wrap round the front corners down to the front wheel arch.
  fender 1/2: sheet-top (y~15) = front at the headlight, inner edge (x~240->190 / 791->841) = hood line,
             'down' = away from the hood (sheet-left for 1, sheet-right for 2); the concave outer boundary is
             the wheel arch; the lobe at y~240-270 runs down behind the wheel to the rocker.
  doors 9/10: inner edge = window line, sheet-top = front; mirror at the inner-top corner, handle near the
             window line close to the rear edge.
Also provides front-quarter renders (render34) used by car_views.front34_left/right."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import sys, os
from .core import comp

K = 0.0047          # metres per sheet px (measured: door 9 = 244 px ~ 1.15 m, fender ~ hood length)
KH = 0.0055        # hood px scale (hood 276 px ~ 1.5 m wide)
KF = float(os.environ.get('C3_KF', 0.0042))   # fascia px scale: label-size ratio fascia/hood on the car ~0.77

def _hood_profile(t):
    """centre-line profile along the hood surface from its front edge (t=0, at the light bar) rearward."""
    ts = np.linspace(0, 1.4, 1401); a = np.radians(9 + 55*np.exp(-ts/0.07))
    Y = -0.10 - np.concatenate([[0], np.cumsum(np.cos(a[:-1])*0.001)])
    Z = 0.70 + np.concatenate([[0], np.cumsum(np.sin(a[:-1])*0.001)])
    return np.interp(t, ts, Y), np.interp(t, ts, Z)

def hood_xyz(x, y):
    s = (513.0 - x)*KH; t = np.clip((y - 150.0)*KH, 0, None)
    Y, Z = _hood_profile(t)
    return s, Y - 0.10*s**2, Z - 0.16*s**2

def _outline(s):
    """plan outline of the front at bumper height: arc length s from the centre (+ = left) -> X, Y"""
    a, R = 0.52, 0.42; u = np.abs(s); sg = np.sign(s)
    X = np.where(u <= a, u, 0); Y = np.where(u <= a, -0.10*u**2, 0)
    Ya = -0.10*a**2; th = np.clip((u - a)/R, 0, np.pi/2)
    m2 = (u > a) & (u <= a + R*np.pi/2)
    X = np.where(m2, a + R*np.sin(th), X); Y = np.where(m2, Ya - R*(1 - np.cos(th)), Y)
    m3 = u > a + R*np.pi/2
    X = np.where(m3, a + R, X); Y = np.where(m3, Ya - R - (u - a - R*np.pi/2), Y)
    return sg*X, Y

def fascia_xyz(x, y):
    s = (514.0 - x)*KF; w = (110.0 - y)*KF          # w > 0 = below the top edge
    X, Y = _outline(s)
    lean = 0.16*np.clip(1 - w/0.45, 0, 1.2)          # upper fascia leans back toward the hood
    sc = 1 - 0.10*np.clip(1 - w/0.45, 0, 1.2)        # and tucks in slightly
    return X*sc, Y - lean + 0.06, 0.70 - w

_edge_cache = {}
def _edges(cid):
    if cid not in _edge_cache:
        m = comp(cid); rows = {}
        for yy in range(1024):
            xs = np.nonzero(m[yy])[0]
            if len(xs): rows[yy] = (xs.min(), xs.max())
        _edge_cache[cid] = rows
    return _edge_cache[cid]

def _smooth_edge(cid, side):
    rows = _edges(cid); ys = np.array(sorted(rows)); xs = np.array([rows[r][0 if side == 'min' else 1] for r in ys], float)
    full = np.interp(np.arange(1024), ys, xs)
    k = np.ones(15)/15; return np.convolve(np.pad(full, 7, mode='edge'), k, 'valid')

def fender_xyz(x, y, cid):
    left = cid == 1
    inner = _smooth_edge(cid, 'max' if left else 'min')
    yi = np.clip(np.round(y).astype(int), 0, 1023)
    d = np.clip((inner[yi] - x) if left else (x - inner[yi]), 0, None)*K
    # matching hood edge point
    y0, y1 = (15, 276) if left else (16, 278)
    yh = 160 + (np.clip(y, y0, y1) - y0)*(222.0/(y1 - y0))
    he = _smooth_edge(4, 'min' if left else 'max')
    xh = he[np.clip(np.round(yh).astype(int), 150, 382)]
    Xe, Ye, Ze = hood_xyz(xh, yh)
    # cross profile: shoulder out, then down the side
    ds = np.linspace(0, 1.2, 1201); b = np.radians(12 + 76*(1 - np.exp(-ds/0.10)))
    ox = np.concatenate([[0], np.cumsum(np.cos(b[:-1])*0.001)]); oz = np.concatenate([[0], np.cumsum(np.sin(b[:-1])*0.001)])
    dx = np.interp(d, ds, ox); dz = np.interp(d, ds, oz)
    sg = 1 if left else -1
    # the front of the fender wraps forward round the corner
    return Xe + sg*dx, Ye + 0.0*dx, Ze - dz

def door_xyz(x, y, cid):
    left = cid in (9, 11)
    inner = _smooth_edge(cid, 'max' if left else 'min'); yi = np.clip(np.round(y).astype(int), 0, 1023)
    d = np.clip((inner[yi] - x) if left else (x - inner[yi]), 0, None)*K
    Y = -1.30 - (y - 277.0)*K
    X = 0.80 + 0.16*np.clip(d/0.25, 0, 1)**0.7
    return (X if left else -X), Y, 0.98 - d

PANELS = {4: hood_xyz, 3: fascia_xyz, 1: lambda x, y: fender_xyz(x, y, 1), 2: lambda x, y: fender_xyz(x, y, 2),
          9: lambda x, y: door_xyz(x, y, 9), 10: lambda x, y: door_xyz(x, y, 10),
          11: lambda x, y: door_xyz(x, y, 11), 12: lambda x, y: door_xyz(x, y, 12)}

def sheet_xyz(cid, ss=2):
    m = comp(cid); ys, xs = np.nonzero(m)
    o = (np.arange(ss) + 0.5)/ss - 0.5
    X = (xs[:, None, None] + o[None, None, :]).ravel(); Y = (ys[:, None, None] + o[None, :, None]).ravel()
    X, Y = np.broadcast_arrays((xs[:, None, None] + o[None, None, :]), (ys[:, None, None] + o[None, :, None]))
    X = X.ravel().astype(float); Y = Y.ravel().astype(float)
    P = PANELS[cid](X, Y)
    return X, Y, np.stack([np.asarray(p, float)*np.ones_like(X) for p in P], 1)

def camera(az, el, dist, target=(0, -0.9, 0.55), f=1300, W=900, H=640):
    """az: degrees round the car, 0 = head-on front, + = toward the car's LEFT side."""
    T = np.array(target, float); a, e = np.radians(az), np.radians(el)
    C = T + dist*np.array([np.sin(a)*np.cos(e), np.cos(a)*np.cos(e), np.sin(e)])
    fw = T - C; fw /= np.linalg.norm(fw); r = np.cross([0, 0, 1], fw); r /= np.linalg.norm(r); u = np.cross(fw, r)
    return dict(C=C, R=np.stack([r, u, fw]), f=f, W=W, H=H)

def project(cam, P):
    q = (P - cam['C']) @ cam['R'].T
    return cam['W']/2 + cam['f']*q[:, 0]/q[:, 2], cam['H']/2 - cam['f']*q[:, 1]/q[:, 2], q[:, 2]

def _wheel_pts(left):
    th = np.linspace(0, 2*np.pi, 900); r = np.linspace(0, 0.37, 60)
    T, Rr = np.meshgrid(th, r); X = np.full(T.shape, 0.93 if left else -0.93)
    P = np.stack([X.ravel(), (-0.76 + Rr*np.cos(T)).ravel(), (0.37 + Rr*np.sin(T)).ravel()], 1)
    rr = Rr.ravel(); col = np.where(rr > 0.30, 25, np.where((rr > 0.24) | ((np.degrees(T.ravel()) % 36) < 6), 150, 45))
    return P, np.stack([col, col, col + 5], 1)

def render34(sheet, side='left', az=None, el=16, dist=9.0, W=900, H=600, f=None, ss=2, target=(0, -1.55, 0.62)):
    """front-quarter render of the front panels. side='left' = front-left 3/4 (car's left side visible)."""
    a = np.asarray(sheet.convert('RGB')).astype(float)
    az = (48 if side == 'left' else -48) if az is None else az
    cam = camera(az, el, dist, target=target, f=f or 1700, W=W, H=H)
    img = np.zeros((H, W, 3)); img[:] = (20, 20, 24); zb = np.full((H, W), np.inf)
    L = np.array([0.35*np.sign(az or 1), 0.55, 0.75]); L /= np.linalg.norm(L)
    def splat(P, col):
        u, v, z = project(cam, P); ui = np.round(u).astype(int); vi = np.round(v).astype(int)
        ok = (ui >= 0) & (ui < W) & (vi >= 0) & (vi < H) & (z > 0)
        ui, vi, z, col = ui[ok], vi[ok], z[ok], col[ok]
        o = np.argsort(-z); ui, vi, z, col = ui[o], vi[o], z[o], col[o]
        lin = vi*W + ui; zf = zb.ravel(); cf = img.reshape(-1, 3)
        # nearest wins: later writes (smaller z) overwrite
        upd = z < zf[lin]; zf[lin[upd]] = z[upd]; cf[lin[upd]] = col[upd]
    # windscreen / glass + dark body base for context
    for left in (True, False):
        P, c = _wheel_pts(left); splat(P, c.astype(float))
    for cid in ((9, 11) if az >= 0 else (10, 12)) + (1, 2, 3, 4):
        xs, ys, P = sheet_xyz(cid, ss)
        col = a[np.clip(ys.astype(int), 0, 1023), np.clip(xs.astype(int), 0, 1023)]
        # shading from the surface normal (finite differences in sheet space)
        e = 1.0
        Px = np.stack(PANELS[cid](xs + e, ys), 1).astype(float) - P
        Py = np.stack(PANELS[cid](xs, ys + e), 1).astype(float) - P
        n = np.cross(Px, Py); n /= (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
        # orient outward (away from the car's centre line / upward)
        out = P - np.array([0, -1.4, 0.3]); n *= np.sign((n*out).sum(1, keepdims=True) + 1e-9)
        sh = 0.55 + 0.55*np.clip(n @ L, 0, 1)
        splat(P, np.clip(col*sh[:, None], 0, 255))
    # glass: windscreen above the hood rear edge, side windows above the doors
    im = Image.fromarray(img.astype(np.uint8)); d = ImageDraw.Draw(im)
    def pt(p): u, v, _ = project(cam, np.array([p], float)); return (u[0], v[0])
    ws = [pt(p) for p in ((0.66, -1.22, 0.92), (0.50, -2.0, 1.52), (-0.50, -2.0, 1.52), (-0.66, -1.22, 0.92))]
    s = 1 if az >= 0 else -1
    sw = [pt(p) for p in ((s*0.80, -1.30, 1.0), (s*0.62, -2.0, 1.50), (s*0.66, -3.6, 1.50), (s*0.80, -4.2, 1.0))]
    gl = Image.new('RGBA', im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
    gd.polygon(sw, fill=(30, 34, 42, 255)); gd.polygon(ws, fill=(38, 44, 54, 255))
    # glass only where nothing nearer is drawn: paint where z-buffer is empty
    empty = Image.fromarray((np.isinf(zb)*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    gl.putalpha(Image.fromarray(np.minimum(np.array(gl.getchannel('A')), np.array(empty))))
    im = im.convert('RGBA'); im.alpha_composite(gl); im = im.convert('RGB')
    # fill splat pinholes
    arr = np.array(im); hole = np.isinf(zb) & ~np.isinf(np.array(Image.fromarray(np.where(np.isinf(zb), 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(1)))) 
    mx = np.array(im.filter(ImageFilter.MaxFilter(3)))
    filled = ~np.isinf(zb); near = np.array(Image.fromarray((filled*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    near &= ~filled & (np.array(Image.fromarray((filled*255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))) > 150)
    arr[near] = mx[near]
    return Image.fromarray(arr)

# ---------------------------------------------------------------------------------------------
# FRONT ATLAS: one continuous picture over hood + fascia + both front fenders.  (U, V) in metres measured
# along the surface: U lateral (+ = car LEFT = viewer's right when facing the car), V downward from the hood's
# front edge (V<0 on the hood toward the windscreen, V>0 down the fascia).  Hood/fascia seam: hood front edge
# (V=0) == fascia top edge (V=GAPV, the light bar).  Hood/fender seam: the fender's inner edge takes the U,V of
# the hood side edge at the matching length, and U grows with the distance d down the fender side.
GAPV = 0.02
def front_uv(cid, x, y):
    x = np.asarray(x, float); y = np.asarray(y, float)
    if cid == 4:
        return (513.0 - x)*KH, -np.clip(y - 150.0, 0, None)*KH
    if cid == 3:
        return (514.0 - x)*KF, GAPV + (110.0 - y)*KF
    left = cid == 1
    inner = _smooth_edge(cid, 'max' if left else 'min'); yi = np.clip(np.round(y).astype(int), 0, 1023)
    d = np.clip((inner[yi] - x) if left else (x - inner[yi]), 0, None)*K
    y0, y1 = (15, 276) if left else (16, 278)
    yh = 160 + (np.clip(y, y0, y1) - y0)*(222.0/(y1 - y0))
    he = _smooth_edge(4, 'min' if left else 'max'); xh = he[np.clip(np.round(yh).astype(int), 150, 382)]
    ue = (513.0 - xh)*KH
    return ue + (d if left else -d), -(yh - 150.0)*KH

def v_stretch(V, c=1.8, ramp=0.08):
    """Calibration 2026-10-29 (in-car photos of One Piece v3): a source that is mapped 1:1 on the fascia puts only
    ~0.30 m (125 source px at S=0.0024) of figure on the visible bumper -> a blank midriff slab.  v_stretch maps surface V
    to source distance: identity for V<=0 (hood, glued seam), then source runs c x faster on the bumper (ramped over
    `ramp` metres so the gradient is continuous at the hood/bumper seam)."""
    V = np.asarray(V, float); p = np.clip(V, 0, None)
    extra = (c - 1.0)*np.where(p < ramp, p*p/(2*ramp), ramp/2 + (p - ramp))
    return np.where(V > 0, V + extra, V)
