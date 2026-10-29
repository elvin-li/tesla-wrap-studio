#!/usr/bin/env python3
"""Generate the copyright-free demo pictures (pure maths, no outside images).

    python tools/make_demo_images.py            -> docs/assets/demo_*.jpg + examples/demo/*
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(7)


def noise(h, w, scales=(64, 24, 8), amps=(1, .5, .25), aspect=1.0):
    out = np.zeros((h, w))
    for s, a in zip(scales, amps):
        out += a * gaussian_filter(rng.standard_normal((h, w)), (s / aspect, s), mode='wrap')
    out -= out.min(); return out / out.max()


def lerp(a, b, t): return a + (b - a) * t[..., None]


def sunset(w=2400, h=1000):
    y = np.linspace(0, 1, h)[:, None] * np.ones((1, w)); hz = 0.56
    sky = lerp(np.array([28, 30, 92.]), np.array([255, 120, 70.]), np.clip(y / hz, 0, 1) ** 1.6)
    sky = lerp(sky, np.array([255, 200, 120.]), np.clip((y - hz + .12) / .12, 0, 1) ** 2)
    xx = np.arange(w)[None, :] * np.ones((h, 1)); yy = y * h
    sx, sy, sr = w * .5, hz * h - 70, 70
    r = np.hypot(xx - sx, yy - sy)
    sky = lerp(sky, np.array([255, 235, 170.]), np.clip(1 - (r - sr) / 4, 0, 1))
    sky = lerp(sky, np.array([255, 170, 90.]), np.exp(-(r / 380) ** 2) * .55)
    cl = noise(h, w, (90, 40, 14), (1, .6, .3), aspect=5); band = np.exp(-((y - .28) / .14) ** 2)
    sky = lerp(sky, np.array([120, 50, 90.]), np.clip((cl - .55) * 3, 0, 1) * band * .8)
    sea_t = np.clip((y - hz) / (1 - hz), 0, 1)
    sea = lerp(np.array([200, 110, 90.]), np.array([12, 18, 50.]), sea_t ** .5)
    wav = noise(h, w, (30, 12), (1, .6), aspect=10)
    refl = np.exp(-((xx - sx) / (90 + 260 * sea_t)) ** 2) * np.clip((wav - .45) * 4, 0, 1) * (1 - sea_t) ** 1.5 * 1.1
    sea = lerp(sea, np.array([255, 210, 140.]), np.clip(refl, 0, 1))
    img = np.where((y > hz)[..., None], sea, sky)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def neon(w=2400, h=1000):
    img = Image.new('RGB', (w, h)); d = ImageDraw.Draw(img); hz = int(h * .55)
    for yv in range(h):
        t = yv / hz if yv < hz else (yv - hz) / (h - hz)
        c = (int(20 + 80 * t), int(8 + 10 * t), int(60 + 90 * t)) if yv < hz else (int(18 * (1 - t) + 6), 4, int(40 * (1 - t) + 12))
        d.line([(0, yv), (w, yv)], fill=c)
    sun = Image.new('L', (w, h), 0); ds = ImageDraw.Draw(sun); ds.ellipse([w / 2 - 230, hz - 400, w / 2 + 230, hz + 60], fill=255)
    for k in range(7): ds.rectangle([0, hz - 170 + k * 34, w, hz - 170 + k * 34 + 8 + k * 2], fill=0)
    grad = Image.linear_gradient('L').resize((w, h))
    sunc = Image.merge('RGB', (Image.new('L', (w, h), 255), grad.point(lambda v: int(60 + v * .7)), Image.new('L', (w, h), 140)))
    img.paste(sunc, (0, 0), sun)
    img.paste(Image.new('RGB', (w, h - hz), (6, 4, 16)), (0, hz))
    glow = Image.new('RGB', (w, h)); dg = ImageDraw.Draw(glow); col = (255, 60, 200)
    for i in range(-30, 31):
        dg.line([(w / 2 + i * 40, hz), (w / 2 + i * 260, h)], fill=col, width=3)
    for i in range(1, 22):
        yv = hz + (h - hz) * (i / 21) ** 2.2; dg.line([(0, yv), (w, yv)], fill=col, width=3)
    img = Image.fromarray(np.clip(np.array(img, float) + np.array(glow.filter(ImageFilter.GaussianBlur(6)), float) * 1.4
                                  + np.array(glow, float) * .8, 0, 255).astype(np.uint8))
    stars = np.array(img); ys = rng.integers(0, hz - 200, 500); xs = rng.integers(0, w, 500); stars[ys, xs] = 255
    return Image.fromarray(stars)


def ink(w=2400, h=1000):
    paper = np.ones((h, w, 3)) * np.array([240, 234, 220.]) - noise(h, w, (3, 1), (1, 1))[..., None] * 18
    img = paper.copy(); x = np.arange(w)
    for k, (base, amp, tone, blur) in enumerate([(.38, .16, 150, 6), (.5, .14, 110, 3), (.63, .12, 70, 1.5), (.76, .09, 35, .8)]):
        from scipy.ndimage import gaussian_filter1d
        ridge = sum(a * gaussian_filter1d(rng.standard_normal(w), sg, mode='wrap') * sg ** .5 for sg, a in ((140 - k * 20, 1), (40, .35), (10, .1)))
        ridge = (ridge - ridge.min()) / (ridge.max() - ridge.min())
        top = (base - amp * ridge) * h
        yy = np.arange(h)[:, None]
        depth = np.clip((yy - top[None, :]) / (h * .25), 0, 1)
        m = (yy > top[None, :]).astype(float)
        m = gaussian_filter(m, blur)
        shade = tone + (240 - tone) * depth ** .6 * .9           # mist at the foot of every ridge
        img = img * (1 - m[..., None]) + (shade[..., None] * np.array([1, 1.01, 1.04])) * m[..., None]
    yy, xx = np.mgrid[0:h, 0:w]; sun = np.exp(-(((xx - w * .72) ** 2 + (yy - h * .2) ** 2) / 55 ** 2) ** 4)
    img = img * (1 - sun[..., None]) + np.array([200, 50, 40.]) * sun[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def emblem(s=600):
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = s / 2; pts = []
    for i in range(10):
        r = s * (.46 if i % 2 == 0 else .2); a = np.pi / 2 + i * np.pi / 5
        pts.append((c + r * np.cos(a), c - r * np.sin(a)))
    d.polygon(pts, fill=(255, 196, 70, 255), outline=(120, 60, 10, 255), width=8)
    return im


if __name__ == '__main__':
    a = os.path.join(HERE, 'docs', 'assets'); e = os.path.join(HERE, 'examples', 'demo')
    os.makedirs(a, exist_ok=True); os.makedirs(e, exist_ok=True)
    s = sunset(); s.save(os.path.join(a, 'demo_sunset.jpg'), quality=86); s.save(os.path.join(e, 'bg_sunset.jpg'), quality=92)
    neon().save(os.path.join(a, 'demo_neon.jpg'), quality=86)
    ink().save(os.path.join(a, 'demo_ink.jpg'), quality=86)
    emblem().save(os.path.join(e, 'star.png'))
    print('ok')


def mascot(w=900, h=1000):
    """A simple robot mascot, upright, arms spread (for the hood + bumper + fenders demo)."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); cx = w // 2
    body, dark, glow = (236, 240, 248, 255), (60, 66, 90, 255), (90, 220, 255, 255)
    d.line([(cx - 120, 420), (40, 300)], fill=body, width=70); d.line([(cx + 120, 420), (w - 40, 300)], fill=body, width=70)
    d.ellipse([10, 255, 90, 335], fill=body); d.ellipse([w - 90, 255, w - 10, 335], fill=body)
    d.rounded_rectangle([cx - 190, 330, cx + 190, h], 80, fill=body)
    d.rounded_rectangle([cx - 110, 450, cx + 110, 600], 30, fill=dark)
    d.ellipse([cx - 36, 490, cx + 36, 562], fill=(255, 80, 90, 255))
    d.rounded_rectangle([cx - 150, 60, cx + 150, 310], 90, fill=body)
    d.rounded_rectangle([cx - 115, 110, cx + 115, 260], 60, fill=dark)
    d.ellipse([cx - 80, 150, cx - 30, 210], fill=glow); d.ellipse([cx + 30, 150, cx + 80, 210], fill=glow)
    d.arc([cx - 40, 190, cx + 40, 240], 20, 160, fill=glow, width=8)
    d.line([(cx, 60), (cx, 15)], fill=body, width=10); d.ellipse([cx - 18, 0, cx + 18, 36], fill=(255, 80, 90, 255))
    return im   # face box: (cx-115, 110, cx+115, 260)


if __name__ == '__main__':
    mascot().save(os.path.join(HERE, 'examples', 'demo', 'robot.png'))
