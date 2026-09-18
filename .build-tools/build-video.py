# -*- coding: utf-8 -*-
# 教程视频 v2:真机帧 + 焦点导圈 + Ken Burns + 讲解卡 → ffmpeg
from PIL import Image, ImageDraw, ImageFont
import os, subprocess, json

BASE = r'D:\CodingProjects\dsh-opencli-release\.design'
VF = os.path.join(BASE, 'video-frames')
W, H = 1920, 1080
BG, AC, TX, TX2, TX3 = (13, 15, 18), (77, 107, 254), (249, 250, 251), (154, 163, 173), (95, 104, 115)
F = lambda s: ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', s)
FB = lambda s: ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', s)

def card(title, sub, foot):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([110, 440, 116, 640], fill=AC)
    d.text((160, 440), title, font=FB(78), fill=TX)
    d.text((164, 575), sub, font=F(36), fill=TX2)
    if foot:
        d.rounded_rectangle([164, 690, 164 + 24 + int(len(foot) * 15.5), 740], radius=10, outline=(77, 107, 254), width=2)
        d.text((184, 702), foot, font=F(26), fill=(139, 154, 255))
    d.text((160, 975), 'OpenCLI × DeepSeek · dsh plugin v0.4', font=F(22), fill=(95, 104, 115))
    return im

def frame_slide(frame, step, title, sub, focus):
    """frame: 真机截图;focus: (cx, cy, w, h) 需要高亮的区域(截图坐标)"""
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((80, 64), step, font=FB(38), fill=(139, 154, 255))
    d.text((80, 122), title, font=FB(50), fill=TX)
    d.text((80, 205), sub, font=F(25), fill=TX2)
    fr = Image.open(os.path.join(VF, frame)).convert('RGB')
    fr.thumbnail((1140, 900), Image.LANCZOS)
    x, y = 660, 120
    sc = fr.width / 1240
    d.rounded_rectangle([x - 3, y - 3, x + fr.width + 3, y + fr.height + 3], radius=16, outline=(60, 66, 78), width=2)
    im.paste(fr, (x, y))
    # 焦点导圈
    cx, cy, w, h = focus
    cx, cy, w, h = int(cx * sc) + x, int(cy * sc) + y, int(w * sc), int(h * sc)
    d.rounded_rectangle([cx, cy, cx + w, cy + h], radius=12, outline=(77, 107, 254), width=4)
    d.ellipse([cx + w - 14, cy - 24, cx + w + 14, cy + 4], fill=(77, 107, 254))
    return im

SL = []
SL.append(('c1', card('OpenCLI 浏览器代理', '让 dsh 会办事:用你的身份,在 176 个站点一步式执行', 'npm i -g @jackwener/opencli · dsh plugin add IKEASven69/dsh-opencli'), 3.2))
SL.append(('f1', frame_slide('F2-总览健康.png', 'STEP 1 · 打开面板', '设置 → 浏览器代理', '健康区全绿 = daemon ✓ 浏览器桥 ✓ 登录态可巡检', (430, 330, 380, 70)), 4.5))
SL.append(('f2', frame_slide('F2-总览健康.png', 'STEP 2 · 试试看', '一条命令,结果直接回到面板', 'site zhihu hot — 经 daemon 驱动你登录态的 Chrome 实时抓取', (430, 500, 400, 60)), 4.5))
SL.append(('f3', frame_slide('F4-自动化任务.png', 'STEP 3 · 定时 autopilot', '创建定时 → 到期自动跑 → 失败重试 ×3 并通知', 'dsh.schedule 持久化,重启不丢', (430, 480, 400, 90)), 4.5))
SL.append(('f4', frame_slide('F6-安全与设置.png', 'STEP 4 · 安全写操作', '审批门 + 四档自动化模式', '以你的身份发帖/点赞前必须批准;每一步进审计', (430, 320, 380, 80)), 4.5))
SL.append(('f5', frame_slide('F5-命令页.png', 'STEP 5 · 176 站命令目录', '点命令徽章复制调用格式', '没适配的网站用 browser_* 原语或现场创作', (430, 480, 400, 70)), 4.5))
SL.append(('c2', card('装好即用', '所有数据留在本机 · 写操作全部审批 · 每一步可审计', 'github.com/IKEASven69/dsh-opencli'), 3.2))

os.chdir(VF)
segs = []
for i, (name, im, dur) in enumerate(SL):
    png = f'v2-{name}.png'
    im.save(png)
    out = f'v2-{name}.mp4'
    fade_out = max(0, dur - 0.45)
    subprocess.run(['ffmpeg', '-y', '-loop', '1', '-i', png, '-t', str(dur),
                    '-vf', f'fade=t=in:st=0:d=0.35,fade=t=out:st={fade_out}:d=0.45,format=yuv420p',
                    '-r', '30', '-c:v', 'libx264', '-preset', 'fast', out],
                   capture_output=True)
    segs.append(out)
    print('seg', name, dur, os.path.getsize(out))

with open('v2-concat.txt', 'w') as f:
    for s in segs:
        f.write(f"file '{s}'\n")
subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', 'v2-concat.txt', '-c', 'copy',
                os.path.join(BASE, 'opencli-使用教程-v2.mp4')], capture_output=True)
sz = os.path.getsize(os.path.join(BASE, 'opencli-使用教程-v2.mp4'))
print('FINAL', sz)
for s in segs: os.remove(s)
os.remove('v2-concat.txt')
