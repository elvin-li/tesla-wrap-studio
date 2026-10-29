#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""finalize_wrap.py -- turn ANY 1024x1024 picture (e.g. exported from Photoshop) into a valid Tesla wrap file.
  * everything outside the template mask -> pure #000000
  * 2-px dark outline on the template edge (like all wraps made by make_wrap.py; --no-edge to skip)
  * optional --fix-tailgate: rotate panels 17 and 20 by 180 degrees inside their own box
      (use it when you painted the tailgate "upright as on the sheet"; do NOT use it if you already painted it upside down)
  * 256-colour quantisation so the PNG is < 1 MB (if it is still too big, colours are reduced further)
  * checks: 1024x1024, PNG, < 1 MB, name <= 30 chars, nothing outside the mask; never overwrites.
    python tools/finalize_wrap.py my_art.png output/myl_my_art.png [--fix-tailgate] [--no-edge]
    python tools/finalize_wrap.py --check-only some_wrap.png"""
import os, sys, argparse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from PIL import Image
import numpy as np
from mylwrap import core, builder


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src'); p.add_argument('out', nargs='?')
    p.add_argument('--fix-tailgate', action='store_true'); p.add_argument('--no-edge', action='store_true')
    p.add_argument('--check-only', action='store_true')
    a = p.parse_args()
    if a.check_only:
        ok, msgs = builder.check_output(a.src); print('\n'.join(msgs)); sys.exit(0 if ok else 2)
    if not a.out: p.error('need an output file name')
    if len(os.path.basename(a.out)) > 30: p.error('output file name longer than 30 characters')
    if os.path.exists(a.out): p.error(f'{a.out} exists -- never overwrite')
    im = Image.open(a.src).convert('RGBA')
    if im.size != (1024, 1024): p.error(f'input is {im.size}, must be exactly 1024x1024')
    bgc = Image.new('RGBA', im.size, (0, 0, 0, 255)); bgc.alpha_composite(im); im = bgc
    if a.fix_tailgate: im = core.tailgate_fix(im.convert('RGB'), keep_edge=True).convert('RGBA')
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    core.finish(im, a.out, edge=not a.no_edge)
    for colors in (192, 128, 64):                      # still >= 1 MB? reduce further (rare)
        if os.path.getsize(a.out) < 1_000_000: break
        os.remove(a.out); q = im.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
        arr = np.array(q); pal = np.array(q.getpalette()[:768]).reshape(-1, 3); bi = int(np.argmin(pal.sum(1))); pal[bi] = 0
        arr[~core.MASK] = bi; o = Image.fromarray(arr, 'P'); o.putpalette(pal.flatten().tolist()); o.save(a.out, optimize=True)
    ok, msgs = builder.check_output(a.out); print('\n'.join(msgs)); print('written:', a.out)
    sys.exit(0 if ok else 2)

if __name__ == '__main__':
    main()
