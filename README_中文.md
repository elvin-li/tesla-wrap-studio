# Tesla Model Y L 贴图制作工具包 (tesla_myl_wrap_kit)

> 只想拖张图就出贴膜？直接用网页版：**https://elvin-li.github.io/tesla-wrap-studio/** （全部 12 个官方车型，图片不上传）。
> 本文件讲的是 Python 命令行工具：专门给 **Model Y L** 做“主角人物贴引擎盖 / 车门”等精细校准效果。

这是把我这几轮"图片校准模型"整理出来的、**可以独立运行**的工具包：
特斯拉 Model Y L 官方模板的 20 块分区、用车内实拍校准过的映射常数、
引擎盖+保险杠+翼子板的"连续大图"映射、尾门 180° 修正、一键出图和自检。
以后做新图，不用再找我的旧脚本，直接用这里的命令就行。

---------------------------------------------------------------------

## 1. 里面有什么

```
tesla_myl_wrap_kit/
├─ README_中文.md             ← 本文件
├─ requirements.txt           ← 依赖 (pillow numpy scipy；rembg 可选)
├─ make_wrap.py               ← 主命令：背景 + 人物 → 成品贴图 + 预览
├─ mylwrap/                   ← 核心 Python 包 (已去掉所有写死的路径)
│   ├─ core.py                模板遮罩、TESLA_MAPPING、校准常数、尾门修正、全景投影、finish()
│   ├─ car3d.py               前脸 3D 近似模型 + front_uv (引擎盖/保险杠/翼子板展开图) + v_stretch
│   ├─ builder.py             make_background / place_front_atlas / place_door / check_output
│   ├─ views.py               车上视角预览 (顶/前/左/右/后 + 前左/前右 3D)
│   ├─ panels.py              20 块分区的中文名和"车上朝上"的方向
│   └─ data/mask.png          官方模板遮罩 (白 = 可贴的区域)
├─ reference/                 ← 参考图
│   ├─ template_mask.png      模板遮罩
│   ├─ myl_calib.png          校准图 (每块不同颜色+编号+网格，放进车里看映射用的那张)
│   ├─ panel_map.png          分区图：编号 + 中文名 + 红色"上"箭头 (蓝色=尾门要转180°)，右边有图例
│   ├─ guide_overlay.png      ★ Photoshop 用：透明底 1024×1024 参考层 (轮廓+编号+中文名+箭头)
│   ├─ guide_overlay_numbers.png  同上，只有编号和箭头 (更干净)
│   ├─ guide_outline_only.png 只有分区轮廓线
│   ├─ panel_masks/panel_01.png … panel_20.png   每块分区的单独选区 (白=该块)
│   └─ panel_info.json        每块的 bbox、中心点、"上"方向、说明
├─ tools/
│   ├─ finalize_wrap.py       ★ 手绘/PS 做的图 → 合格成品 (黑底、量化<1MB、可选尾门转180°、自检)
│   ├─ preview.py             任意贴图 → 车上视角预览图
│   ├─ make_calib_sheet.py    重新生成校准图
│   ├─ make_demo_images.py    重新生成示例图 (examples/demo 和 docs/assets)
│   └─ make_reference.py      重新生成 reference/ 里的参考图
├─ examples/demo/             ← 例子：日落海面 + 引擎盖机器人 + 尾门星星 (全是程序画的，无版权)
│   ├─ bg_sunset.jpg  robot.png  star.png
│   ├─ run_example.sh / run_example.bat
│   └─ expected_myl_demo.png / expected_preview.png   (期望结果，运行后应逐像素一致)
├─ docs/                      ← 网页版 (GitHub Pages)，纯浏览器运行，支持全部车型
└─ output/                    ← 成品和预览默认输出到这里
```

## 2. 安装

需要 Python 3.9 以上。

```bash
cd tesla_myl_wrap_kit
python3 -m venv .venv                 # 可选，推荐
source .venv/bin/activate             # Windows:  .venv\Scripts\activate
pip install -r requirements.txt       # pillow numpy scipy
pip install rembg onnxruntime         # 可选：自动抠图 (第一次会下载模型，约170MB)
pip list                              # 想确认装好了什么
```

没有 rembg 也完全能用：人物图请先抠好，保存成**带透明背景的 PNG**（Photoshop 抠图 / remove.bg 等都行）。
给了没有透明的图又没装 rembg 时，脚本会明确报错，不会乱出图。

## 3. 先跑例子，确认环境没问题

```bash
sh examples/demo/run_example.sh          # Windows: 双击 run_example.bat
```

成功的话最后会打印 5 行 `PASS`，并生成
`output/myl_demo.png` (约 114 KB) 和 `output/previews/preview_myl_demo.png`。
它应该和 `examples/demo/expected_myl_demo.png` **逐像素一致**。

## 4. 做新图：make_wrap.py

### 4.1 只有一张背景（最简单）

```bash
python make_wrap.py --bg 我的场景.jpg --name myl_my_first.png
```
背景默认用 `--bg-mode car`：把图当作 360° 全景包在车身一圈，地平线绕车一圈保持同一高度。
想要"海报式"（取图中间的正方形铺满）就用 `--bg-mode crop`。

### 4.2 加主角：引擎盖 + 保险杠 + 翼子板连成一张大图

```bash
python make_wrap.py --bg 海面.jpg --bg-mode crop \
  --front 主角_抠好.png --front-face 570,75,725,238 \
  --name myl_hero.png
```
* `--front`：**正立**的人物（头在上，半身最好，手臂张开可以伸到两边翼子板），透明背景 PNG。
* `--front-face x0,y0,x1,y1`：脸在这张人物图里的方框（像素）。**强烈建议自己填**：
  在 Photoshop 里用矩形选框框住脸，信息面板里能看到坐标。不填时脚本只会瞎猜头的位置。
* 脸会被自动要求"完整落在引擎盖上"（不能跨到保险杠/翼子板/车头弧面）。不满足会报错并告诉你怎么调：
  * `--front-v`：脸中心在车面上的位置(米)，默认 -0.70；更负 = 脸更靠后(靠近挡风玻璃)，-0.65 更靠前。
  * `--front-scale`：每个人物图像素对应多少米，默认 0.0024；**数字越大，人越小**。
  * `--stretch`：保险杠纵向拉伸，默认 1.8 (见第 7 节)。
  * `--arm-u0 / --arm-cmp`：手臂超出中线 0.45 米后被压缩到翼子板上的程度。
* `--front-mode flat`：不用校准映射，只是把人物"倒着"(转180°)直接放在车头区域，简单但会有拼接感。

### 4.3 加左右车门的躺姿人物

```bash
python make_wrap.py --bg 海面.jpg --bg-mode crop \
  --left 左门人物.png  --left-face 162,125,312,287  --left-face-center 118,392 --left-scale 0.34 \
  --right 右门人物.png --right-face 1000,125,1125,262 --right-face-center 905,392 --right-scale 0.33 \
  --name myl_doors.png
```
* 左门人物：**躺着，头在图片左边**；右门人物：躺着，**头在图片右边**。脚本自动旋转，头朝车头(模板上边)，
  也就是"头朝中心"这条规则在车门上的做法。
* `--*-face`：脸方框（人物图像素）。`--*-face-center`：脸中心放在模板的什么位置
  (左前门里面大约 (118,392)，右前门 (905,392))；`--*-scale`：模板像素/人物图像素。
* 不给 `--*-face-center` 和 `--*-scale` 就自动搜索"脸完整在前门里的最大尺寸"（会慢几秒，位置不一定最美，
  好看的话把它打印出来的结果当参数固定下来）。
* 脸如果没完整落在前门(9/10)内，会报错，不会出图。

### 4.4 尾门图

```bash
python make_wrap.py --bg 海面.jpg --tailgate 宝箱.png --name myl_back.png
```
尾门图**照常画正**就行。脚本自动把 17、20 两块各转 180°（车上就是这样显示的），保险杠后角 18/19 不转。

### 4.5 全部一起 + 常用参数

```bash
python make_wrap.py --bg bg.jpg --front hero.png --front-face ... --left l.png --left-face ... \
   --right r.png --right-face ... --tailgate logo.png --name myl_all.png --outdir D:/Wraps_out
```
`python make_wrap.py -h` 看全部参数。常用：`--darken`(车门背景压暗，默认0.22)、`--vignette`(暗角，默认0.15)、
`--horizon-d / --horizon-row / --ocean-rows / --sea-blur`(全景模式调整地平线)、`--no-preview`(不出预览)、
`--tailgate-glow 255,220,120`(尾门图发光颜色)。

### 4.6 程序自动检查的硬规则（不过就不算成功）
1. 1024×1024、PNG  2. 文件 < 1 MB（256 色量化 + 抖动，通常 200–400 KB）
3. 文件名 ≤ 30 个字符（含 .png）  4. 模板以外**全是纯 #000000**（0 个非黑像素）
5. 不覆盖已有文件（同名直接报错，换个 `--name`）  6. 人脸必须完整落在一块分区里
7. 人物的头朝车中心（门/翼子板上头朝车头方向，由脚本按分区处理）

## 5. 在 Photoshop / 手绘：参考图怎么用

1. 新建 1024×1024 文档，把 `reference/guide_overlay.png` 拖进去放在最上层（透明底，不挡画面）。
2. 看 `reference/panel_map.png`：每块有编号、中文名，**红色箭头 = 画面上这块图案的"上"要指向的方向**。
   * 前脸 3 和引擎盖 4 的箭头朝下：这两块在车上是整块转了 180° 的，人要**倒着画**
     (头朝下，脚朝车头方向看过去才是正的)。
   * 翼子板 1/2、车门 9–12、后翼 15/16 的“上”是水平方向：1/9/11/15 向右(→)，2/10/12/16 向左(←)，即头朝车中心。
   * **蓝色箭头 17 / 20(尾门)**：车上显示是整块旋转 180° 的。按"正着"画然后用下面的命令自动转，最省事。
3. 选区：`reference/panel_masks/panel_XX.png` 白色=该块，在 PS 里 打开 → 通道/颜色范围 → 选区 就能精确只画某一块。
4. 画完导出 1024×1024 PNG，然后**一条命令变成合格文件**：
   ```bash
   python tools/finalize_wrap.py 我画的.png output/myl_mine.png --fix-tailgate
   ```
   做的事：模板以外全黑、边缘描一圈暗线、256 色量化到 <1MB、(可选)尾门 17/20 各转 180°、自检、绝不覆盖。
   (如果尾门你本来就是倒着画的，就不要加 `--fix-tailgate`。)
5. 看效果：`python tools/preview.py output/myl_mine.png output/pv_mine.png`，
   会出顶/前/左/右/后视图和前左、前右 3D 近似图。

## 6. 想在自己的 Python 里用

```python
import sys; sys.path.insert(0, '/path/to/tesla_myl_wrap_kit')
from mylwrap import builder, core, car3d

canvas = builder.make_background('bg.jpg', mode='car')        # RGBA 1024x1024
builder.place_front_atlas(canvas, 'hero_cut.png', face_box=(570, 75, 725, 238), VF=-0.70)
builder.place_door(canvas, 'l_cut.png', 'left',  (162,125,312,287), (118,392), 0.34)
builder.place_door(canvas, 'r_cut.png', 'right', (1000,125,1125,262), (905,392), 0.33)
core.place_emblem(canvas, 'logo_cut.png', None)               # 尾门，画正
core.finish(canvas, 'output/myl_x.png', fix_tailgate=True)     # 黑底+量化+尾门转180°
print(builder.check_output('output/myl_x.png'))
```
常用对象：`core.MASK`(遮罩)、`core.comp(i)`(第 i 块的布尔图)、`core.TESLA_MAPPING`(20块的说明)、
`car3d.front_uv(cid, x, y)`(模板像素→引擎盖/保险杠/翼子板的"米"坐标)、`car3d.v_stretch`、
`core.tailgate_fix(img)`、`core.car_panorama(path)`。

## 7. 校准结论（来自车里的实拍，用大白话）

分区编号：1/2 左右前翼子板，3 前保险杠(前脸)，4 引擎盖，5/6 车顶边条(A柱)，7/8 后视镜壳，
9/10 左右前门，11/12 左右后门，13/14 C柱，15/16 后翼子板，17 尾门上条，18/19 后保险杠角，20 尾门下板。

* **整体方向**：模板上边 = 车头。每块的"上"见 `panel_map.png`。所有人物头朝中心/车头。
* **引擎盖(4)**：整块旋转 180° 显示，图的上边靠车头、下边靠挡风玻璃；顶视图下引擎盖全部可见。
  后面约 10% 被挡风玻璃盖住，脸不要放太靠后。
* **前保险杠(3)**：同样旋转 180°，上边缘在灯带下面，两侧"翅膀"绕到前轮拱。
  它的像素比引擎盖的像素小，约 0.77 倍 (保险杠 0.0042 米/像素，引擎盖 0.0055，翼子板/车门 0.0047)。
* **保险杠可见高度很短，所以要拉伸 1.8 倍**：从车头正面看，保险杠真正看得见的只有约 0.30 米高(模板第 46–108 行)。
  如果人物 1:1 贴上去，保险杠那里只会剩一块"肚皮"。所以用 `v_stretch`(默认 1.8，在 0.08 米内平滑过渡，
  引擎盖那边不变，接缝连续)，让肚脐/腰链/皮带扣正好落在保险杠上。
* **脸的位置**：脸中心距引擎盖后端(挡风玻璃)约 0.66–0.70 米，所以 `HOOD_FACE_V = -0.70`
  (-0.78 太靠近挡风玻璃了；-0.72 也可以)。脸还必须完全在引擎盖里，不能跨到保险杠或翼子板。
* **前翼子板(1/2)**：上端 = 车头(大灯处)，内侧边 = 引擎盖线，凹进去的外缘 = 轮拱，下面那个凸出去的"瓣"绕到后面直到门槛。
  手臂/头发可以通过连续映射从引擎盖伸到翼子板上；超过中线 0.45 米的部分压缩 0.55 倍，不会拉得太宽。
* **尾门 17/20**：车上是整块**原地转了 180°** 显示的(文字倒着且左右反)，所以画面要先正着构图再转 180°
  (`finish(fix_tailgate=True)` / `finalize_wrap.py --fix-tailgate`)。后保险杠角 18/19 不转。
* **后视镜壳 7/8**：在前门内侧上角(靠近窗线)。
  **门把手**在每扇前后门靠窗线一侧：左前门约 (178,480)，左后门约 (195,690)；右侧镜像。人脸/重要图案避开这些位置，
  所以车门上的脸放在门的外半边中间(约 (118,392) / (905,392))。
* **背景全景**：`--bg-mode car` 把"每个像素到车身轮廓外沿的距离"当作高度，把全景图绕车一圈取样，
  地平线绕车保持同一高度，在翼子板/角上会跟着弯。
* 3D 预览(`car3d.py`)是我自己拟合的**近似**车身模型，用来看大概效果，不是官方精确模型；最终以车里的 3D 预览为准。

## 8. 放进特斯拉

1. U 盘格式化为 exFAT 或 FAT32（或车机支持的其它格式）。
2. 在 U 盘**根目录**新建文件夹，名字必须是 `Wraps`（首字母大写）。
3. 把 PNG 放进 `Wraps` 文件夹：1024×1024、<1 MB、文件名 ≤ 30 字符(建议只用英文字母/数字/下划线/横线/空格)。
   一次最多放 10 个文件。
4. U 盘插进车上的 USB 口 → 车机 玩具箱(Toybox) → 涂装店(Paint Shop) → 贴膜(Wraps) → 选图/应用。
   (不同软件版本的菜单名字可能略有差别。)
5. 先在车机的 3D 预览里转一圈，检查人脸、尾门方向。

## 9. 已知局限

* 3D 预览和 `car3d` 是近似模型；翼子板外侧、轮拱附近的映射精度不如引擎盖/保险杠。
* 车门人物自动模式只保证脸在前门里，构图不一定最佳；要精修请用 `--*-face-center / --*-scale`。
* 自动猜脸位置(没填 `--*-face` 时)很粗糙，请自己填脸方框。
* 校准只用了 Model Y L 的 20 块官方模板，其它车型/模板不能直接用。
* 内容规则(例如不要裸露、不要未成年外观)是你自己遵守的，工具不会替你检查图案内容。
