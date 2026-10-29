@echo off
cd /d "%~dp0"
python ..\..\make_wrap.py --bg bg_sunset.jpg --front robot.png --front-face 335,110,565,260 --tailgate star.png --name myl_demo.png %*
pause
