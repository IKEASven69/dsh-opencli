# dsh-opencli · 让 DeepSeek Harness 会办事,不只是会搜索

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)
[![dsh-plugin](https://img.shields.io/badge/GitHub%20topic-dsh--plugin-4D6BFE?style=flat-square)](https://github.com/topics/dsh-plugin)

> Give your DeepSeek Harness agent real hands: drive your **logged-in browser** and call **176 site adapters / 200+ commands** as deterministic one-shot commands — with a write-approval gate.

dsh 内置的 web 工具是"检索"(web_search/web_fetch)。本插件给它补上"**办事**"的那一半:agent 可以操纵**你自己日常使用的、带登录态的真实浏览器**,并直接调用知乎/B站/微博/GitHub 等 **176 个站点、200+ 结构化命令**——不是匿名抓取,是你本人的视角和数据。

一句话:**web_search 给所有人一样的匿名结果;`site` 给你的 agent 你账号视角的结构化数据**——你的关注流、收藏夹、热榜、未读通知,再到替你发帖点赞(带审批)。

## 装完之后,用户能做什么

| 用户说 | 插件做什么 |
|---|---|
| "B站搜罗翔,总结播放量前 3 的视频" | `site bilibili search 罗翔` → 结构化结果,无需逐页点击 |
| "知乎今天热榜前 10 给我摘要" | `site zhihu hot` → 一步拿到榜单 |
| "把这个转发到我的微博" | `site weibo post …`(登录态),**先弹审批窗,你点了允许才发** |
| "看看我 GitHub 有哪些未读通知" | `site github whoami` 等登录态命令 |
| "打开公司后台,把这个审批单批了" | `browser_open → browser_state → browser_click` 通用原语,用你的登录态 |
| "帮我查 12306 明天北京→上海的余票" | `site 12306 …` |
| "同时拉知乎/微博/B站三站热榜" | `site_batch` 一条命令 fan-out,汇总各站结果 |
| "每天早上 9 点自动跑知乎热榜" | 面板建定时任务,**持久化 + 真执行**,重启不丢 |

以及:**没适配器的网站,让模型当场造一个**(`browser_do` analyze → init → verify,SKILL.md 内置创作循环)——越用越会浏览。

## 全功能面

| 模块 | 能力 |
|---|---|
| **site 适配器** | 176 站 / 200+ 命令,蒸馏命令目录注入 systemPrompt(第一轮就选对命令);`site_batch` 多站并行 |
| **browser 原语** | open/click/type/fill/scroll/state/screenshot/extract/wait/crawl 全套(泛爬带 `maxPagesPerRun` 限流) |
| **定时任务** | cron 表达式,**持久化到 `dsh.schedule` 并真执行**,重启不丢;面板管理 + 运行可见 |
| **录制回放** | 面板录制 `site`/`browser_*` 步骤序列,一键回放,步骤持久化 |
| **自动化模式** | read-only / standard / autonomous / unrestricted 四档,接入 `tools/pre-execute` 审批门 |
| **我的适配器** | 适配器禁用/启用管理,禁用即从 systemPrompt 目录自动收缩 |
| **登录态巡检** | 面板实时显示各站在线状态 |
| **失败诊断** | daemon 诊断/一键启动;`resolveBin()` 四级回退(本地依赖优先) |
| **限流与限域** | `usagePolicy`(延迟/并发/突发/冷却/页数上限)+ 429/5xx 自动退避;`--authProfile` 限域登录,跨域拒绝 |
| **四 tab 面板** | 总览 / 命令 / 自动化 / 安全与设置,状态机四态(检测中骨架屏/正常/依赖缺失一键修复/错误内嵌诊断) |
| **登录态桥** | 探测 daemon Chrome 的 CDP 端点,一键生成配置把 dsh 官方 Browser Use 接到你登录态的浏览器 |
| **拦截审计** | 审批门拦截记录(近 7 天计数 + 明细),写操作全程可追溯 |
| **定时可靠性** | 失败重试 ×3 + 通知事件 + 运行历史 |
| **站点品牌图标** | 48 站 simple-icons 官方标 + 品牌色,变体站点自动归并 |
| **中英双语** | 面板 EN / zh 一键切换 |

## 登录态到底是怎么回事(重要澄清)

**本插件不使用、也不需要 dsh 的内置浏览器。**它经 [OpenCLI](https://github.com/jackwener/OpenCLI) 的 daemon + BrowserBridge 扩展,驱动**你扩展装在哪个、就哪个浏览器的真实窗口**(Chrome/Edge 均可)——登录态来自你日常浏览器里的真实会话,和你在地址栏手打网址完全同源。你在哪登录了知乎,agent 就能用你的知乎;巡检面板会告诉你哪些站在线。

## 已经自己装过 opencli 的用户,这插件还有什么用

如果你已装 OpenCLI/npm 版 opencli,agent 原则上能在 shell 里裸跑 `opencli`。本插件的增量:

| | 只装 opencli(agent 走 shell) | + 本插件 |
|---|---|---|
| 开局发现 | 模型得先跑 `opencli list`(数 MB 输出)才知道有什么 | **蒸馏命令目录已注入 systemPrompt**,第一轮就选对命令 |
| 权限模型 | 需要 shell 权限;写操作(发帖/下单)裸奔无门 | 一等公民工具,参数校验 + **write 审批门**(工具层拦截,shell 拦不住) |
| 只读/受限会话 | 无 shell 就没戏 | 无需 shell,工具照用 |
| 定时采集 | 自己写 crontab + 脚本 + 通知 | 面板建定时任务,**持久化 + 真执行 + 运行可见** |
| 管理 | 开 OpenCLIApp 或敲命令 | dsh 设置页:daemon 诊断/一键启动/命令集合浏览复制/登录态巡检/适配器启停/自动化模式 |

两不冲突:深度用法仍可用官方 opencli 技能,本插件负责工具化、安全与面板。

## 安装

前置(二选一):

```sh
npm i -g @jackwener/opencli      # 推荐:一条命令
opencli daemon restart           # 启动守护进程
# 再装 BrowserBridge 扩展(Chrome Web Store / GitHub Releases),在浏览器里登录你的常用站点
```

或安装 [OpenCLIApp](https://opencli.info/download)(托盘全家桶,自动保活/更新)。

然后:

```sh
dsh plugin add IKEASven69/dsh-opencli
```

自定义二进制路径:设 `DSH_OPENCLI_BIN`(也可依赖插件自带的本地 `@jackwener/opencli`)。

> **Windows 注意**:dsh 的 shell 在 Windows 走 PowerShell,`DSH_OPENCLI_BIN` 请指向 `.cmd` 结尾的 shim(如 `...\nodejs\opencli.cmd`),无扩展名文件会被静默忽略。

## 配置

零配置开箱即用;需要微调时有这几处:

| 配置 | 方式 | 默认 |
|---|---|---|
| opencli 二进制路径 | 环境变量 `DSH_OPENCLI_BIN`,或依赖插件自带的本地 `@jackwener/opencli` | `opencli`(全局) |
| 写审批开关 | 面板「审批门」一键开关 | 开 |
| 自动化模式 | 面板四档:read-only / standard / autonomous / unrestricted | standard |
| 限流策略 | `usagePolicy`(minDelayMs 750 / maxConcurrency 2 / burst 3 / cooldown 30s / maxPagesPerRun 20) | 见左 |
| 限域登录 | `authProfiles`(`allowedDomains` / `storageStatePath`),配 `site --authProfile` 使用 | 无 |

示例:让 agent 只读不动手——面板切到 read-only,所有写命令直接拒绝,无需逐条审批。

## 安全设计

- **write 审批门**(默认开):`site` 的写命令经 dsh 原生审批——弹窗点"允许"才执行;权限不明的命令按写处理(fail-closed);面板可一键开关。
- **自动化模式四档**:read-only / standard / autonomous / unrestricted,接入 `tools/pre-execute` 审批门。
- 命令白名单与参数校验;`browser_do` 仅放行只读/创作类子命令。
- 全部输出经截断与噪声剥离(update 横幅等),防上下文污染。
- 限流:并发/突发/冷却 + 429/502/503/504 自动退避;限域登录(`--authProfile`)跨域拒绝。

## 已验证的测试矩阵

| 层面 | 方式 | 结果 |
|---|---|---|
| 判定逻辑 | 单元测试 ×11 | ✅ |
| 审批分发链路 | cordis 真实 waterfall 集成测试 ×6 | ✅ |
| 高级功能 | schedule/replay/script/recipe/automation/rulepacks ×22 | ✅ |
| 真模型 E2E·读 | MiniMax-M3 会话调 `site zhihu hot`,真实热榜返回 | ✅ |
| 真模型 E2E·写拒绝 | `site zhihu comment` → ask → 无审批通道 fail-closed 拒绝 | ✅ |
| 真模型 E2E·浏览器原语 | `browser_open→browser_state` 往返结构化报告 | ✅ |
| 面板 | 真实浏览器全链路(审批门/巡检/命令集合/复制/i18n) | ✅ |
| 全权审查套件 | 19 项真机逐项验证(渲染/真执行/状态文件对账/RPC 真值),`full-review.cjs` 一键复测 | ✅ |

## 更新日志

完整版本历史见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases](https://github.com/IKEASven69/dsh-opencli/releases)。

## 定位(不做什么)

- 不替代 OpenCLIApp/daemon/扩展——那是引擎与管家,本插件是 **dsh 里的驾驶舱**;
- 不替代 dsh 内置 web_search/web_fetch——内置管检索,本插件管办事;
- 无头服务器(没有任何真实浏览器的机器)不适用。

MIT License.
