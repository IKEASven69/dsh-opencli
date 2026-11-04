# 0.4.7 W5 分发包补丁:keywords/README 原名行+选型段(中英)
import json, shutil

# 1) package.json keywords(deepseek-harness=LivXue 自动收录触发词;scheduled-watch/change-alerting=生态空白第一叙事)
p = json.load(open('package.json', encoding='utf8'))
kw = p.get('keywords', [])
for k in ['deepseek-harness', 'scheduled-watch', 'change-alerting']:
    if k not in kw:
        kw.append(k)
p['keywords'] = kw
json.dump(p, open('package.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
open('package.json', 'a', encoding='utf8').write('\n')
print('keywords:', kw)

# 2) README.md(中文主;README.zh.md 同内容随 shutil 同步)
s = open('README.md', encoding='utf8').read()

anchor_intro = '所有执行路径汇聚到同一个插件服务:写操作经审批门(fail-closed),采集结果经真实性判定(exit 0 不等于有效数据),每次运行落快照与轨迹供回放。'
assert anchor_intro in s, 'intro anchor'
name_note = '\n\n> npm 包为 **@cold777/dsh-opencli**——无作用域的 `dsh-opencli` 名已被一个无关的低层工具占用,搜索时请注意区分:本插件是 170+ 站点结构化命令 + 定时采集告警 + 审批门的完整产品;安装命令一律以本 README 为准。'
s = s.replace(anchor_intro, anchor_intro + name_note, 1)

anchor_origin = '所有执行路径汇聚到同一个插件服务:写操作经审批门(fail-closed),采集结果经真实性判定(exit 0 不等于有效数据),每次运行落快照与轨迹供回放。'
sel_section = '''

## 与其他 browser 插件的选型

dsh 生态里的浏览器自动化插件大体两条技术路线,按场景选,不冲突:

- **CDP attach 类**(连已开浏览器的调试端口):适合脚本化的页面操控,轻、快;但没有站点语义层,也没有面向无人值守的产品层。
- **本插件(daemon + BrowserBridge 扩展)**:走你日常浏览器的登录态,价值在语义层之上的产品闭环——170+ 站点一步式命令、写操作审批门、采集真实性判定、定时采集 + 变化告警 + 多渠道推送、快照 diff、带出处报告与运行回放。适合"让 agent/定时任务持续用你的账号办事"的场景。

两者也可共存:调试端口的操控类插件管页面操作,本插件管数据产品与审批链。'''
anchor_how = '## 快速开始'
assert anchor_how in s, 'how anchor'
s = s.replace(anchor_how, sel_section.strip('\n') + '\n\n## 快速开始', 1)
open('README.md', 'w', encoding='utf8', newline='\n').write(s)

# 3) README.en.md(对应英文)
e = open('README.en.md', encoding='utf8').read()
anchor_e = 'Every execution path funnels through one plugin service: writes pass an approval gate (fail-closed), collected results go through action-evidence verification (exit 0 does not mean valid data), and every run lands snapshots and traces for replay.'
assert anchor_e in e, 'en intro anchor'
name_note_e = '\n\n> The npm package is **@cold777/dsh-opencli** — the unscoped name `dsh-opencli` is taken by an unrelated low-level tool. Watch out when searching: this plugin is the full product of 170+ structured site commands, scheduled watch + change alerting, and approval gates. Install commands in this README are canonical.'
e = e.replace(anchor_e, anchor_e + name_note_e, 1)

sel_e = '''

## Choosing between browser plugins

Browser automation plugins in the dsh ecosystem follow two technical routes; pick by scenario, they do not conflict:

- **CDP-attach plugins** (connect to a debug port of an already-running browser): good for scripted page control — light and fast, but no site semantic layer and no unattended product layer.
- **This plugin (daemon + BrowserBridge extension)**: rides your everyday browser's logged-in sessions; the value sits above the semantic layer as a product loop — 170+ one-step site commands, approval-gated writes, action-evidence verification, scheduled collection + change alerting + multi-channel push, snapshot diff, provenance reports and run replay. Built for "let agents and schedules continuously work through your own accounts".

The two can coexist: port-based control plugins drive pages; this plugin owns the data product and approval chain.'''
anchor_e2 = '## Quick start'
assert anchor_e2 in e, 'en quick start anchor'
e = e.replace(anchor_e2, sel_e.strip('\n') + '\n\n## Quick start', 1)
open('README.en.md', 'w', encoding='utf8', newline='\n').write(e)

# 4) zh 同步
shutil.copyfile('README.md', 'README.zh.md')
print('README x3 patched')
