"""Panel table: number, Chinese name, and which way is 'up' on the car for every one of the 20 template panels."""
import math
import numpy as np
from .core import comp, N

# number: (中文名, 说明, up direction as vector in SHEET coordinates (x right, y down) or None = toward the sheet centre)
PANELS = {
    1:  ('左前翼子板', '上端=车头，内侧边=引擎盖线；文字顺时针转90°读', (1, 0)),
    2:  ('右前翼子板', '上端=车头，内侧边=引擎盖线', (-1, 0)),
    3:  ('前保险杠(前脸)', '整块旋转180°：图要“倒着画”(上=图下)；可见高度很短，需纵向拉伸1.8倍', (0, 1)),
    4:  ('引擎盖', '旋转180°：图上边=靠近车头，下边=靠近挡风玻璃；后端约10%被挡风玻璃盖住', (0, 1)),
    5:  ('左车顶边条/A柱', '长条，上=朝车中心', None),
    6:  ('右车顶边条/A柱', '长条，上=朝车中心', None),
    7:  ('左后视镜壳', '在左前门内侧上角', None),
    8:  ('右后视镜壳', '在右前门内侧上角', None),
    9:  ('左前门', '上=车头；内侧边=车窗线；后视镜在内侧上角；门把手在内侧靠后', (1, 0)),
    10: ('右前门', '左前门的镜像', (-1, 0)),
    11: ('左后门', '门把手在内侧约3/4处', (1, 0)),
    12: ('右后门', '左后门的镜像', (-1, 0)),
    13: ('左C柱/后顶侧', '后窗旁的小块', None),
    14: ('右C柱/后顶侧', '后窗旁的小块', None),
    15: ('左后翼子板', '后轮上方；充电口在后上角(约(200,900))', (1, 0)),
    16: ('右后翼子板', '左后翼子板的镜像', (-1, 0)),
    17: ('尾门上条', '车上“旋转180°”显示：要先把图旋转180°(用 --tailgate / fix_tailgate 自动处理)', (0, 1)),
    18: ('后保险杠左角', '照图原样(不旋转)', (0, -1)),
    19: ('后保险杠右角', '照图原样(不旋转)', (0, -1)),
    20: ('尾门下板(车牌上方)', '车上“旋转180°”显示：要先把图旋转180°(自动处理)', (0, 1)),
}
FLIPPED = (17, 20)          # shown rotated 180 degrees in place on the car
FRONT_FLIPPED = (3, 4)      # fascia + hood: up = sheet DOWN


def up_vector(cid):
    """unit vector (sheet coordinates, y down) pointing to the car's 'up' for the art of this panel."""
    v = PANELS[cid][2]
    if v is None:
        ys, xs = np.nonzero(comp(cid)); v = (N/2 - xs.mean(), N/2 - ys.mean())
    n = math.hypot(*v); return v[0]/n, v[1]/n


def up_words(cid):
    x, y = up_vector(cid)
    if cid in (5, 6, 7, 8, 13, 14): return '朝画面中心'
    if abs(x) > abs(y): return '向右(→)' if x > 0 else '向左(←)'
    return '向下(↓)' if y > 0 else '向上(↑)'
