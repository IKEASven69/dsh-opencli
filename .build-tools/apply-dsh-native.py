# -*- coding: utf-8 -*-
# Premium v3:与 dsh 原生配色融合(中性锌灰 + DeepSeek 蓝),去花哨
import io, re

P = r'D:\CodingProjects\dsh-opencli-release\src\client.ts'
src = io.open(P, encoding='utf-8').read()
start = src.find('const CSS = `')
end = src.find('`', start + len('const CSS = `'))
assert start >= 0 and end > start
css = src[start:end]

# 1) 蓝调深色表面 → 中性(白透明度叠在 dsh 弹窗 #2C2C2E 上)
repl = [
  # 渐变表面 → 纯净半透明
  ("linear-gradient(180deg,#1D222B,#191D24)", "rgba(255,255,255,.045)"),
  ("linear-gradient(180deg,rgba(31,36,45,.85),rgba(22,26,32,.9))", "rgba(255,255,255,.03)"),
  ("linear-gradient(180deg,rgba(232,41,255,.5),rgba(232,41,255,.5))", "rgba(255,255,255,.04)"),
  # 蓝调实底 → 中性
  ("rgba(20,23,28,.8)", "rgba(255,255,255,.04)"),
  ("rgba(20,23,28,.75)", "rgba(255,255,255,.04)"),
  ("rgba(20,23,28,.72)", "rgba(255,255,255,.04)"),
  ("rgba(20,23,28,.7)", "rgba(255,255,255,.04)"),
  ("rgba(26,30,37,.8)", "rgba(255,255,255,.05)"),
  ("rgba(26,30,37,.7)", "rgba(255,255,255,.05)"),
  ("rgba(13,15,18,.8)", "rgba(0,0,0,.22)"),
  ("rgba(13,15,18,.7)", "rgba(0,0,0,.2)"),
  ("rgba(13,15,18,.6)", "rgba(0,0,0,.18)"),
  ("rgba(13,15,18,.55)", "rgba(0,0,0,.18)"),
  ("linear-gradient(180deg,#0A0C0F,#0C0E12)", "rgba(0,0,0,.24)"),
  # 头部
  ("linear-gradient(90deg,#F4F7FF,#C7D6F5)", "#F9FAFB"),
  # 文字
  ("#E8EAED", "#F9FAFB"),
  ("#9AA3AD", "rgba(249,250,251,.55)"),
  ("#8B95A5", "rgba(249,250,251,.55)"),
  ("#77808F", "rgba(249,250,251,.45)"),
  ("#5F6873", "rgba(249,250,251,.38)"),
  ("#525B67", "rgba(249,250,251,.3)"),
  ("#A8B1BF", "rgba(249,250,251,.75)"),
  ("#C6CFDA", "rgba(249,250,251,.85)"),
  ("#C7D6F5", "#F9FAFB"),
  ("#7FA8DE", "rgba(249,250,251,.6)"),
  ("#A9C7EC", "rgba(249,250,251,.72)"),
  ("#6FB0FF", "#8B9AFF"),
  # 强调色 → DeepSeek 蓝
  ("#4A9EFF", "#4D6BFE"),
  ("#3B82F6", "#4D6BFE"),
  ("#3577E8", "#4263D9"),
  ("#5AA9FF", "#5E7BF0"),
  # 边框/分隔
  ("#262B33", "rgba(255,255,255,.08)"),
  ("#313845", "rgba(255,255,255,.1)"),
  ("#3A414D", "rgba(255,255,255,.14)"),
  # 去氛围光晕(融合克制)
  (".o4::before { content:\"\"; position:absolute; inset:-40px -40px auto -40px; height:220px; background:radial-gradient(ellipse at 30% 0%, rgba(74,158,255,.10), transparent 65%); pointer-events:none; }", ""),
  # hero:去网格渐变 → DS 蓝纯 tint
  ("""  background:
  radial-gradient(ellipse at 85% -20%, rgba(74,158,255,.22), transparent 55%),
  radial-gradient(ellipse at 0% 120%, rgba(52,199,89,.10), transparent 50%),
  linear-gradient(180deg,#1D222B,#181C23);
  border:1px solid rgba(74,158,255,.28);""",
   """  background:rgba(77,107,254,.09);
  border:1px solid rgba(77,107,254,.32);"""),
  # 渐变按钮 → 实色
  ("linear-gradient(135deg,#4A9EFF,#3577E8)", "#4D6BFE"),
  ("linear-gradient(135deg,#5AA9FF,#3B82F6)", "#5E78E8"),
  ("linear-gradient(135deg,#4A9EFF,#4263D9)", "#4D6BFE"),
  ("linear-gradient(180deg,#232936,#1D222B)", "rgba(255,255,255,.08)"),
  ("linear-gradient(135deg,#34C759,#2FA84F)", "#34C759"),
  ("linear-gradient(135deg,rgba(74,158,255,.18),rgba(74,158,255,.08))", "rgba(77,107,254,.14)"),
  ("rgba(74,158,255,.35)", "rgba(77,107,254,.35)"),
  ("rgba(74,158,255,.55)", "rgba(77,107,254,.45)"),
  ("rgba(74,158,255,.6)", "rgba(77,107,254,.5)"),
  ("rgba(74,158,255,.4)", "rgba(77,107,254,.4)"),
  ("rgba(74,158,255,.22)", "rgba(77,107,254,.2)"),
  ("rgba(74,158,255,.16)", "rgba(77,107,254,.16)"),
  ("rgba(74,158,255,.14)", "rgba(77,107,254,.14)"),
  ("rgba(74,158,255,.12)", "rgba(77,107,254,.12)"),
  ("rgba(74,158,255,.04)", "rgba(77,107,254,.05)"),
  ("rgba(74,158,255,.25)", "rgba(77,107,254,.22)"),
  ("rgba(74,158,255,.15)", "rgba(77,107,254,.15)"),
  ("rgba(74,158,255,.06)", "rgba(77,107,254,.07)"),
  ("rgba(74,158,255,.09)", "rgba(77,107,254,.1)"),
  ("linear-gradient(90deg,rgba(52,199,89,.10),rgba(52,199,89,.04))", "rgba(52,199,89,.07)"),
  ("linear-gradient(90deg,rgba(255,69,58,.10),rgba(255,69,58,.04))", "rgba(255,69,58,.07)"),
  ("linear-gradient(135deg,rgba(52,199,89,.16),rgba(52,199,89,.07))", "rgba(52,199,89,.1)"),
  ("linear-gradient(160deg,rgba(74,158,255,.14),rgba(74,158,255,.04))", "rgba(77,107,254,.1)"),
  ("linear-gradient(135deg,rgba(74,158,255,.18),rgba(74,158,255,.08))", "rgba(77,107,254,.12)"),
  ("linear-gradient(160deg,rgba(74,158,255,.09),rgba(74,158,255,.02) 55%)", "rgba(77,107,254,.07)"),
  ("linear-gradient(135deg,#34C759,#2FA84F)", "#34C759"),
  # 阴影收敛
  ("box-shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 32px -18px rgba(0,0,0,.6);", "box-shadow:0 1px 2px rgba(0,0,0,.25);"),
  ("box-shadow:0 14px 40px -18px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06);", "box-shadow:inset 0 1px 0 rgba(255,255,255,.05);"),
  ("box-shadow:0 2px 10px -3px rgba(77,107,254,.55);", "box-shadow:0 1px 6px -2px rgba(77,107,254,.4);"),
  ("box-shadow:0 4px 14px -3px rgba(77,107,254,.6);", "box-shadow:0 2px 8px -2px rgba(77,107,254,.45);"),
  ("box-shadow:0 8px 30px -14px rgba(77,107,254,.25);", ""),
  ("box-shadow:0 8px 28px -14px rgba(255,69,58,.25);", ""),
  ("box-shadow:0 0 18px -6px rgba(52,199,89,.5);", ""),
  ("box-shadow:0 4px 16px -6px rgba(77,107,254,.35);", ""),
  ("box-shadow:0 0 10px rgba(52,199,89,.8);", "box-shadow:0 0 8px rgba(52,199,89,.55);"),
  ("box-shadow:0 2px 8px -2px rgba(74,158,255,.6);", "box-shadow:none;"),
  ("inset 0 0 0 1px rgba(74,158,255,.35), 0 2px 10px -4px rgba(0,0,0,.6);", "inset 0 0 0 1px rgba(255,255,255,.12);"),
  ("box-shadow:0 6px 20px -6px rgba(0,149,255,.35);", "box-shadow:0 0 0 1px rgba(255,255,255,.09);"),
  # 圆角对齐 dsh
  ("border-radius:16px;", "border-radius:14px;"),
  ("border-radius:14px; padding:13px 15px;", "border-radius:12px; padding:13px 15px;"),
]
for old, new in repl:
    css = css.replace(old, new)

src = src[:start] + css + src[end:]
io.open(P, 'w', encoding='utf-8', newline='\n').write(src)
print('dsh-native palette applied,', len(repl), 'replacements')
