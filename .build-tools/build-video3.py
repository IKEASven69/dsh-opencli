# -*- coding: utf-8 -*-
# 教程视频 v3:真机帧(裁设置弹窗)+ 章节讲解 + 焦点框 → ffmpeg
from PIL import Image, ImageDraw, ImageFont
import os, subprocess

BASE = r'D:\CodingProjects\dsh-opencli-release\.design'
VF = os.path.join(BASE, 'video-frames')
W, H = 1920, 1080
BG, AC = (13, 15, 18), (77, 107, 254)
TX, TX2, TX3 = (249, 250, 251), (154, 163, 173), (95, 104, 115)
F = lambda s: ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', s)
FB = lambda s: ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', s)

CROP = (432, 240, 1018, 958)

def frame_slide(frame, step, title, sub, focus):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((80, 70), step, font=FB(38), fill=(139, 154, 255))
    d.text((80, 126), title, font=FB(52), fill=TX)
    d.text((80, 212), sub, font=F(26), fill=TX2)
    fr = Image.open(os.path.join(VF, frame)).convert('RGB').crop(CROP)
    fr.thumbnail((1000, 920), Image.LANCZOS)
    x, y = 780, 100
    sc = fr.width / (CROP[2] - CROP[0])
    d.rounded_rectangle([x - 3, y - 3, x + fr.width + 3, y + fr.height + 3], radius=16, outline=(60, 66, 78), width=2)
    im.paste(fr, (x, y))
    if focus:
        fx, fy, fw, fh = focus
        cx, cy = int(fx * sc) + x, int(fy * sc) + y
        d.rounded_rectangle([cx, cy, cx + int(fw * sc), cy + int(fh * sc)], radius=12, outline=AC, width=4)
        d.ellipse([cx + int(fw * sc) - 13, cy - 22, cx + int(fw * sc) + 13, cy + 4], fill=AC)
    return im

def card(title, sub, foot):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([110, 430, 116, 650], fill=AC)
    d.text((160, 430), title, font=FB(80), fill=TX)
    d.text((164, 570), sub, font=F(36), fill=TX2)
    if foot:
        d.rounded_rectangle([164, 680, 164 + 26 + int(len(foot) * 15), 732], radius=10, outline=AC, width=2)
        d.text((184, 692), foot, font=F(25), fill=(139, 154, 255))
    d.text((160, 975), 'OpenCLI × DeepSeek · dsh plugin v0.4', font=F(22), fill=TX3)
    return im

SL = [
  ('c1', card('OpenCLI 浏览器代理', '让 dsh 会办事:用你的身份,在 176 个站点一步式执行', 'dsh plugin add IKEASven69/dsh-opencli'), 3.4),
  ('s1', frame_slide('T1-总览健康.png', 'STEP 1 · 打开面板', '设置 → 浏览器代理', '健康全绿 = daemon ✓ 浏览器桥 ✓ 试试看一条命令拿真数据', (25, 90, 520, 200)), 4.6),
  ('s2', frame_slide('T1-总览健康.png', 'STEP 2 · 定时 autopilot', '面板创建定时 → 到期自动执行 → 失败重试 ×3 并通知', 'dsh.schedule 持久化,重启不丢', (25, 250, 520, 240)), 4.6),
  ('s3', frame_slide('T6-定时任务.png', 'STEP 3 · 定时任务真跑', '每条任务:重试 ×3 · 通知 · 立即跑 · 运行历史', '这不是效果图——就是 3123 实例的实时画面', (25, 240, 520, 160)), 4.6),
  ('s4', frame_slide('T5-安全与设置.png', 'STEP 4 · 安全写操作', '审批门 + 四档自动化模式 + 拦截审计', '以你的身份发帖/点赞前,必须经你批准', (25, 90, 520, 230)), 4.6),
  ('s5', frame_slide('T4-命令页.png', 'STEP 5 · 176 站命令目录', '官方站点图标 · 点徽章复制调用格式 · 禁用即时收缩', '没适配的网站用 browser_* 原语或现场创作', (25, 330, 520, 190)), 4.6),
  ('c2', card('装好即用', '数据留在本机 · 写操作全部审批 · 每一步可审计', 'github.com/IKEASven69/dsh-opencli'), 3.4),
]

os.chdir(VF)
segs = []
for name, im, dur in SL:
    png = f'v3-{name}.png'
    im.save(png)
    out = f'v3-{name}.mp4'
    fo = max(0, dur - 0.45)
    r = subprocess.run(['ffmpeg', '-y', '-loop', '1', '-i', png, '-t', str(dur),
                        '-vf', f'fade=t=in:st=0:d=0.35,fade=t=out:st={fo}:d=0.45,format=yuv420p',
                        '-r', '30', '-c:v', 'libx264', '-preset', 'fast', out], capture_output=True)
    if r.returncode != 0:
        print('FFFAIL', name, r.stderr.decode()[-200:])
        continue
    segs.append(out)
    print('seg', name, os.path.getsize(out))

with open('v3-concat.txt', 'w') as f:
    for s in segs:
        f.write("file '" + s + "'\n")
final = os.path.join(BASE, 'opencli-使用教程.mp4')
subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', 'v3-concat.txt', '-c', 'copy', final], capture_output=True)
print('FINAL', os.path.getsize(final))
for s in segs:
    os.remove(s)
os.remove('v3-concat.txt')
