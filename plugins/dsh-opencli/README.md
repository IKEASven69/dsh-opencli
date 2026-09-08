# dsh-opencli · 让 DeepSeek Harness 会办事,不只是会搜索

> Give your DeepSeek Harness agent real hands: drive your **logged-in browser** and call **170+ site adapters** as deterministic one-shot commands — with a write-approval gate.

dsh 内置的 web 工具是"检索"(web_search/web_fetch)。本插件给它补上"**办事**"的那一半:agent 可以操纵**你自己日常使用的、带登录态的真实浏览器**,并直接调用知乎/B站/微博/GitHub 等 170+ 站点的结构化命令——不是匿名抓取,是你本人的视角和数据。

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

以及:**没适配器的网站,让模型当场造一个**(`browser_do` analyze → init → verify,SKILL.md 内置创作循环)——越用越会浏览。

## 登录态到底是怎么回事(重要澄清)

**本插件不使用、也不需要 dsh 的内置浏览器。**它经 [OpenCLI](https://github.com/jackwener/OpenCLI) 的 daemon + BrowserBridge 扩展,驱动**你扩展装在哪个、就哪个浏览器的真实窗口**(Chrome/Edge 均可)——登录态来自你日常浏览器里的真实会话,和你在地址栏手打网址完全同源。你在哪登录了知乎,agent 就能用你的知乎;巡检面板会告诉你哪些站在线。

## 已经自己装过 opencli 的用户,这插件还有什么用

如果你已装 OpenCLI/npm 版 opencli,agent 原则上能在 shell 里裸跑 `opencli`。本插件的增量:

| | 只装 opencli(agent 走 shell) | + 本插件 |
|---|---|---|
| 开局发现 | 模型得先跑 `opencli list`(数 MB 输出)才知道有什么 | **1276 条命令的蒸馏目录已注入 systemPrompt**,第一轮就选对命令 |
| 权限模型 | 需要 shell 权限;写操作(发帖/下单)裸奔无门 | 一等公民工具,参数校验 + **write 审批门**(工具层拦截,shell 拦不住) |
| 只读/受限会话 | 无 shell 就没戏 | 无需 shell,工具照用 |
| 管理 | 开 OpenCLIApp 或敲命令 | dsh 设置页:daemon 诊断/一键启动/命令集合浏览复制/登录态巡检/适配器启停 |

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

自定义二进制路径:设 `DSH_OPENCLI_BIN`。

## 安全设计

- **write 审批门**(默认开):`site` 的写命令经 dsh 原生审批——弹窗点"允许"才执行;权限不明的命令按写处理(fail-closed);面板可一键开关。
- 命令白名单与参数校验;`browser_do` 仅放行只读/创作类子命令。
- 全部输出经截断与噪声剥离(update 横幅等),防上下文污染。

## 0.2.0 新增（Stage2，未发布）
- **录制回放**：面板“录制回放”卡片，开始录制→输入步骤（`site` / `browser_*`）→停止→一键回放，步骤持久化到 `localStorage`（`dsh-opencli-recordings`），最多保留 5 条预览
- **我的适配器**：Site/App 分段 tab + 禁用/启用即“我的适配器”管理，禁用状态持久化到 `~/.dsh/dsh-opencli-state.json` 并自动从 `systemPrompt` 目录收缩
- **定时订阅**：面板“定时订阅”输入 `site 命令` + `cron`（默认 `0 9 * * *`），经 `rpc schedule-add` 接入 `dsh.schedule`（`dsh schedule list` 可见）

## 0.2.1 缺口补齐（对齐 anweat，2026-09-01）
- **自包含 fallback**：`resolveBin()` 优先 `DSH_OPENCLI_BIN` → 插件本地 `@jackwener/opencli`（`node dist/src/main.js`）→ `node_modules/.bin/opencli` → 全局 `opencli`，与 anweat“本地优先/全局复用”同策略
- **限流**：`usagePolicy`（`minDelayMs 750 / maxConcurrency 2 / burst 3 / cooldown 30000 / maxPagesPerRun 20`）+ 429/502/503/504 自动冷却，与 anweat 359-browser-half 的节流对齐
- **限域登录**：`site --authProfile` + `authProfiles`（`allowedDomains` / `storageStatePath`），`domainOf()` 校验，跨域拒绝；同时 `ctx.provide('browser', this)` 兼容 `inject: ['browser']` 生态

## 0.3.0 超集（2026-09-01 里程碑 38e4e08/7d89404/4c797db）
- **Host 桩**：`@Remote schedule-add/list` + `replay`（`site` / `browser_*` 透传，`localStorage` 录制互补）+ `script-catalog/run_builtin` + `crawl`（`maxPagesPerRun` 限流）
- **高级抽屉**：面板 `高级自动化` 折叠，内含 4档 `automationMode`（`read-only/standard/autonomous/unrestricted`）+ 限流/限域可视化 + 脚本/泛爬入口，`automationMode` 接入 `tools/pre-execute` 审批门

## 已验证的测试矩阵

| 层面 | 方式 | 结果 |
|---|---|---|
| 判定逻辑 | 单元测试 ×11 | ✅ |
| 审批分发链路 | cordis 真实 waterfall 集成测试 ×6 | ✅ |
| 真模型 E2E·读 | MiniMax-M3 会话调 `site zhihu hot`,真实热榜返回 | ✅ |
| 真模型 E2E·写拒绝 | `site zhihu comment` → ask → 无审批通道 fail-closed 拒绝 | ✅ |
| 真模型 E2E·浏览器原语 | `browser_open→browser_state` 往返结构化报告 | ✅ |
| 面板 | 真实浏览器全链路(审批门/巡检/命令集合/复制) | ✅ |

## 定位(不做什么)

- 不替代 OpenCLIApp/daemon/扩展——那是引擎与管家,本插件是 **dsh 里的驾驶舱**;
- 不替代 dsh 内置 web_search/web_fetch——内置管检索,本插件管办事;
- 无头服务器(没有任何真实浏览器的机器)不适用。

MIT License.
