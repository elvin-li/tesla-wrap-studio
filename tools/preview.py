#!/usr/bin/env python3
"""Preview any wrap sheet the way the car shows it: top / front / left / right / rear views (+ 3D front-left and front-right).
    python tools/preview.py my_wrap.png preview.png [--flat]      (--flat = skip the slower 3D renders)"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from mylwrap import views
if len(sys.argv) < 3: sys.exit(__doc__)
if os.path.exists(sys.argv[2]): sys.exit(f'{sys.argv[2]} exists -- never overwrite')
print((views.make if '--flat' in sys.argv[3:] else views.make34)(sys.argv[1], sys.argv[2]))
