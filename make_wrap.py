#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make_wrap.py -- build a Tesla Model Y L wrap (1024x1024 PNG) from a few pictures, using the calibrated car model.

最简单的用法 / simplest:
    python make_wrap.py --bg my_scene.jpg --name myl_my_first.png

例子 / example (examples/demo):
    python make_wrap.py --bg examples/demo/bg_sunset.jpg \
        --front examples/demo/robot.png --front-face 335,110,565,260 \
        --tailgate examples/demo/star.png --name myl_demo.png

带车门人物 / with door figures:
    python make_wrap.py --bg bg.jpg --bg-mode crop --front hero.png --front-face 570,75,725,238 \
        --left left.png --left-face 162,125,312,287 --left-face-center 118,392 --left-scale 0.34 \
        --right right.png --right-face 1000,125,1125,262 --right-face-center 905,392 --right-scale 0.33 \
        --tailgate logo.png --name myl_all.png

Inputs (all optional except --bg):
  --bg        background picture / panorama (jpg/png)
  --front     figure for hood+bumper+fenders (upright, head up, PNG with transparent background)
  --left      lying figure for the LEFT  doors, head at the IMAGE-LEFT   (PNG with alpha)
  --right     lying figure for the RIGHT doors, head at the IMAGE-RIGHT  (PNG with alpha)
  --tailgate  picture/logo for the tailgate (drawn upright, the script pre-rotates it 180 degrees as the car needs)
A picture WITHOUT transparency is cut out automatically if `rembg` is installed (pip install rembg), else you get an error.

Hard rules checked at the end (the script refuses to finish otherwise): 1024x1024 PNG, < 1 MB, file name <= 30 chars,
pure #000000 outside the template, never overwrites an existing file.
"""
import argparse, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def box(s):
    try:
        v = tuple(int(float(x)) for x in s.split(','))
        assert len(v) == 4
        return v
    except Exception:
        raise argparse.ArgumentTypeError('need x0,y0,x1,y1  e.g. 570,75,725,238')


def pt(s):
    try:
        v = tuple(float(x) for x in s.split(','))
        assert len(v) == 2
        return v
    except Exception:
        raise argparse.ArgumentTypeError('need x,y  e.g. 118,392')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--bg', required=True, help='background picture / panorama')
    p.add_argument('--name', required=True, help='output file name (<=30 chars, .png added if missing)')
    p.add_argument('--outdir', default=os.path.join(HERE, 'output'), help='output folder (default: ./output)')
    g = p.add_argument_group('background')
    g.add_argument('--bg-mode', choices=['car', 'crop'], default='car',
                   help="car = 360-degree panorama wrapped round the body (horizon level all round; default); "
                        "crop = centre square of the picture like a poster")
    g.add_argument('--bg-zoom', type=float, default=1.0, help='crop mode: zoom (1 = whole short side)')
    g.add_argument('--horizon-row', type=int, default=None, help='car mode: horizon row in the source picture (auto if omitted)')
    g.add_argument('--horizon-d', type=float, default=85, help='car mode: horizon height on the car, px from the lower edge (85)')
    g.add_argument('--ocean-rows', type=float, default=170, help='car mode: source rows used below the horizon (170)')
    g.add_argument('--sky-px-per-row', type=float, default=1.0, help='car mode: sky stretch (1.0)')
    g.add_argument('--sea-blur', type=float, default=0.0, help='car mode: blur streaky texture below the horizon')
    g.add_argument('--darken', type=float, default=0.22, help='darken the door panels behind the figures (0 = off)')
    g.add_argument('--vignette', type=float, default=0.15, help='edge vignette strength (0 = off)')
    g = p.add_argument_group('front figure (hood 4 + bumper 3 + fenders 1/2)')
    g.add_argument('--front', help='upright figure, PNG with alpha (waist-up, arms spread works great)')
    g.add_argument('--front-face', type=box, help='face box x0,y0,x1,y1 in the figure pixels (strongly recommended)')
    g.add_argument('--front-mode', choices=['atlas', 'flat'], default='atlas',
                   help='atlas = calibrated continuous mapping over hood+bumper+fenders (default); '
                        'flat = simple upright drop on the front region (rot 180)')
    g.add_argument('--front-scale', type=float, default=0.0024, help='atlas: metres per figure pixel (0.0024; BIGGER = smaller figure)')
    g.add_argument('--front-v', type=float, default=-0.70, help='atlas: face centre along the surface, metres (-0.70; more negative = further back)')
    g.add_argument('--stretch', type=float, default=1.8, help='atlas: bumper height stretch (1.8)')
    g.add_argument('--arm-u0', type=float, default=0.45, help='atlas: lateral distance where the arms start to be squeezed (m)')
    g.add_argument('--arm-cmp', type=float, default=0.55, help='atlas: squeeze factor for the arms beyond --arm-u0')
    g = p.add_argument_group('door figures')
    for s, h in (('left', 'LEFT'), ('right', 'RIGHT')):
        g.add_argument(f'--{s}', help=f'lying figure for the {h} doors (head at the image-{s}), PNG with alpha')
        g.add_argument(f'--{s}-face', type=box, help='face box in the figure pixels (strongly recommended)')
        g.add_argument(f'--{s}-face-center', type=pt, help='where the face centre goes on the sheet, e.g. 118,392 (left) / 905,392 (right); omit = auto')
        g.add_argument(f'--{s}-scale', type=float, help='sheet px per figure px (e.g. 0.34); omit = largest that fits')
    g = p.add_argument_group('tailgate (panel 20)')
    g.add_argument('--tailgate', help='picture/logo for the tailgate, drawn upright, PNG with alpha')
    g.add_argument('--tailgate-glow', default='255,220,120', help='glow colour r,g,b')
    g = p.add_argument_group('misc')
    g.add_argument('--no-preview', action='store_true', help='skip the preview sheet (top/side/rear views + 3D front-left/right)')
    g.add_argument('--no-tailgate-fix', action='store_true', help='do NOT pre-rotate panels 17/20 (only for already-fixed art)')
    a = p.parse_args(argv)

    name = a.name if a.name.lower().endswith('.png') else a.name + '.png'
    if os.path.basename(name) != name: p.error('--name must be a file name, not a path (use --outdir)')
    if len(name) > 30: p.error(f'file name "{name}" has {len(name)} characters; the Tesla allows at most 30')
    os.makedirs(a.outdir, exist_ok=True)
    out = os.path.join(a.outdir, name)
    if os.path.exists(out): p.error(f'{out} already exists -- never overwrite; choose another --name')
    if not os.path.exists(a.bg): p.error(f'background not found: {a.bg}')

    from mylwrap import builder, core, views
    cache_dir = os.path.join(HERE, 'cache'); os.makedirs(cache_dir, exist_ok=True)
    def cache(path):   # auto cut-outs (rembg) are cached by file content, so a changed picture is never served stale
        if not path: return None
        import hashlib
        h = hashlib.md5(open(path, 'rb').read()).hexdigest()[:10]
        return os.path.join(cache_dir, os.path.splitext(os.path.basename(path))[0] + '_' + h + '_cut.png')

    kw = dict(horizon_row=a.horizon_row, horizon_d=a.horizon_d, ocean_rows=a.ocean_rows,
              sky_px_per_row=a.sky_px_per_row, sea_blur=a.sea_blur) if a.bg_mode == 'car' else {}
    print('background ...'); canvas = builder.make_background(a.bg, a.bg_mode, a.bg_zoom, a.darken, a.vignette, **kw)
    info = {}
    if a.front:
        print('front figure ...')
        if a.front_mode == 'atlas':
            info['front'] = builder.place_front_atlas(canvas, a.front, a.front_face, S=a.front_scale, VF=a.front_v, U0=a.arm_u0,
                                                      CMP=a.arm_cmp, VC=a.stretch, cache=cache(a.front))
        else:
            fig = core.cutout(a.front, cache(a.front))
            fb = a.front_face or builder.auto_face_box(fig, 'front')
            info['front'] = core.place_front_figure(canvas, a.front, cache(a.front), fb)
    for s in ('left', 'right'):
        f = getattr(a, s)
        if f:
            print(f'{s} door figure ...')
            info[s] = builder.place_door(canvas, f, s, getattr(a, f'{s}_face'), getattr(a, f'{s}_face_center'),
                                         getattr(a, f'{s}_scale'), cache=cache(f))
    if a.tailgate:
        print('tailgate ...')
        core.place_emblem(canvas, a.tailgate, cache(a.tailgate), glow=tuple(int(v) for v in a.tailgate_glow.split(',')))
    print('finishing (mask, quantise, tailgate fix) ...')
    core.finish(canvas, out, fix_tailgate=not a.no_tailgate_fix)
    ok, msgs = builder.check_output(out)
    print('\n'.join('  ' + m for m in msgs))
    print('placement info:', json.dumps(info, default=str))
    if not ok:
        print('CHECKS FAILED -- do not use this file.'); sys.exit(2)
    print('wrap  :', out, f'({os.path.getsize(out):,} bytes)')
    if not a.no_preview:
        pdir = os.path.join(a.outdir, 'previews'); os.makedirs(pdir, exist_ok=True)
        pv = os.path.join(pdir, 'preview_' + name)
        if not os.path.exists(pv):
            try:
                views.make34(out, pv); print('preview:', pv)
            except Exception as e:   # preview is a nicety, never fail the wrap because of it
                print('preview skipped:', e)
    print('copy the wrap to a USB stick: folder "Wraps" at the root, PNG, name <= 30 chars.')


if __name__ == '__main__':
    main()
