# dsh-opencli · 你的登录态数据产品

[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-17695?logo=github&labelColor=555)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/tree/main/data/plugins/IKEASven69__dsh-opencli.yml)
[![dsh-plugin](https://img.shields.io/badge/GitHub%20topic-dsh--plugin-4D6BFE?style=flat-square)](https://github.com/topics/dsh-plugin)

> **你的登录态数据产品——定时采集、真实性判定、带出处报告、写操作审批。** Your data, from your own logged-in browser:知乎/B站/微博/GitHub 等 170+ 站点,agent 按点采集、先判真伪,报告条条带出处,要动你的账号先过审批门。

**dsh 自带的 web 工具是"搜索"——匿名检索,所有人拿到一样的结果。这个插件补上另一半:以你的账号视角,把网上的事变成你手里可信的数据。** 它经 OpenCLI daemon + BrowserBridge 扩展驱动你日常登录的真实浏览器(Chrome/Edge),采集结果经真实性判定(空结果/风控页会被标出,不信 `exit 0`),报告每个数据节自带出处三元组(命令+时间+快照路径,零模型改写),写操作先弹审批窗。

| 在对话里说 | 插件做的事 |
|---|---|
| "每天早 9 点拉知乎/B站热榜存档" | 面板建 cron 定时任务:持久化真执行,重启不丢,失败自动重试 |
| "盯住热榜,'降价''官宣'一出现就告诉我" | watch 关键词命中 → 🔔 推送通知(面板事件流,点击直达任务) |
| "把这周采集的数据整理成报告,注明每条哪来的" | 带出处报告导出:每节 = 命令 + 时间 + 快照路径,零模型改写 |
| "昨晚 3 点那个任务到底跑没跑成?" | 运行轨迹逐命令落盘 + 画布回放,失败步附截图与输出摘录 |
| "exit 0 就算拿到数据了?" | 真实性判定:确定性规则 + 亚秒决策模型,空结果/风控页标"疑似静默失败",定时任务按失败重试 |
| "把这个转发到我的微博" | `site weibo post …` —— **先弹审批窗**,你点了允许才执行,前后截图入证据包 |

## 15 秒价值演示:定时采集 → 收到推送 → 画布回放

1. **定时采集**:面板"自动化"页建任务(`site zhihu hot`,cron 每天 09:00,附 watch 关键词)——持久化真执行,不用挂着 dsh;
2. **收到推送**:关键词命中 → 总览页 🔔 通知徽章("Watch 命中:zhihu hot 出现 […]"),点击直达任务与时间线;
3. **画布回放**:运行现场钉在可平移缩放的画布上——每步一张卡(命令/截图/exit/耗时),卡片自带出处三元组,拖时间轴复盘"它到底做了什么"。

*(待录 GIF:15 秒完整闭环演示录制中,先以静态截图+文字代替。)*

**实测效果(真实登录态,非演示数据):**

| 对话里直接跑命令 | 定时采集 → 快照 → 时间线 → 带出处报告 |
|---|---|
| ![试试看](docs/assets/readme/demo-try-run.png) | ![真实数据时间线](docs/assets/readme/demo-timeline-realdata.png) |

## 30 秒装完

```sh
# ① 装 opencli 并启动(已装过 opencli/OpenCLIApp?跳到 ③)
npm i -g @jackwener/opencli && opencli daemon restart

# ② 装 BrowserBridge 扩展(Chrome/Edge 都行),在浏览器里登录你的常用站点
#    https://github.com/jackwener/OpenCLI/releases → opencli-extension-*.zip → 浏览器"加载解压缩的扩展"

# ③ 装插件
dsh plugin add IKEASven69/dsh-opencli
```

**不想自己动手?把下面这句发给你的 dsh,它替你装完并自检:**

> 请按 https://github.com/IKEASven69/dsh-opencli/blob/opencli-release/AGENT_INSTALL.md 里的步骤帮我安装 dsh-opencli,装完跑一次自检并告诉我结果。

装完打开 dsh 设置 →「浏览器代理」面板:站点目录、定时任务与时间线、登录态巡检、daemon 一键修复。

<details>
<summary><b>安装注意事项(3 条,遇到问题再展开)</b></summary>

- ⚠️ 旧版 opencli(≤1.8.8)在插件目录内跑 `npm install` 会静默替换宿主链接([#2555](https://github.com/jackwener/opencli/issues/2555),**2.0 已修复**)——仍在 1.8.x 的用户请在仓库外装依赖。
- ⚠️ Windows:dsh shell 走 PowerShell,`DSH_OPENCLI_BIN` 需指向 `.cmd` 结尾的 shim(无扩展名会被静默忽略)。版本管理器(vfox/nvm)切 node 版本后插件会自动扫描各版本目录找回 opencli。
- ⚠️ 升级 dsh 到 0.2 前自查 profile `cordis.patch.yml` 有无引用未安装的 bundle——0.2 对此静默退出。

</details>

<details>
<summary><b>完整命令目录(170+ 站 / 1200+ 命令,点击展开)</b></summary>

170+ 站点适配器、1200+ 条命令(`site <站> <命令>` 一步式执行;目录蒸馏后注入 systemPrompt,模型第一轮就选对命令,不用先跑 `opencli list` 翻数 MB 输出)。

| 在对话里说 | 一步式命令 |
|---|---|
| "B站搜罗翔,总结播放量前 3" | `site bilibili search 罗翔` |
| "知乎热榜前 10 摘要" | `site zhihu hot` |
| "同时拉知乎/微博/B站热榜做对比" | `site_batch` 一条命令三站并行 |
| "打开公司后台把审批单批了" | `browser_open/click` 通用原语,用你的登录态 |

**没适配器的网站?** 目录之外,`browser_*` 通用原语覆盖任意网页;agent 还能当场造适配器,越用越会浏览。

![命令目录](docs/assets/readme/demo-catalog.png)

</details>

---

## 登录态到底是怎么回事(重要澄清)

**本插件不使用、也不需要 dsh 的内置浏览器。**它经 [OpenCLI](https://github.com/jackwener/OpenCLI) 的 daemon + BrowserBridge 扩展,驱动**你扩展装在哪个、就哪个浏览器的真实窗口**(Chrome/Edge 均可)——登录态来自你日常浏览器里的真实会话,和你在地址栏手打网址完全同源。你在哪登录了知乎,agent 就能用你的知乎;巡检面板会告诉你哪些站在线。

## 两张牌:固定命令 × 任意网页原语

模型对每个站有两张牌,**先打第一张,失败自动换第二张**:

1. **固定命令**(`site <站> <命令>`):预编译站点知识,省 token、结果可验证、有失败签名恢复表;
2. **任意网页原语**(`browser_open/state/click/fill` + 只读脚本 + Playwright recipe):适配器没覆盖的页面用登录态自由组合。

动手前先让模型调 `site_knowledge <站>` 读知识卡:全部命令+已知坑+失败恢复表——不现场试错。知识卡可导出 markdown 分享(`~/.dsh/opencli-knowledge/`)。

## 竞品差异

对比基于 2026-10 各家公开仓库与 issue 区的调研,能力变化以各家最新版本为准。

| 能力 | 本插件 | Tencent/BrowserSkill | dsh 官方 Browser Use |
|---|---|---|---|
| 登录态真实浏览器 | ✓ 你日常的浏览器 | ✓ | ✗ 匿名会话,无持久身份 |
| 结构化站点命令 | ✓ 170+ 站预编译目录 | ✗ | ✗ |
| 真实性判定(exit 0 ≠ 有效数据) | ✓ 规则 + 亚秒决策模型 | ✗ | ✗ |
| **定时 → 报告 → 推送闭环** | ✓ cron 持久化 + 带出处报告 + watch 推送 | ✗ | ✗ 无持久化存储 |
| **无限画布** | ✓ 用户侧运行现场复盘(卡片带出处三元组) | Canvas 是 agent 侧视觉引用(给模型看的) | ✗ 无落盘资产可挂 |
| 写操作审批门 | ✓ 工具层拦截,fail-closed | — | — |

### 它回答的三个真实缺口

- *"browser agents re-learn every site on every session"*([browser-use#5841](https://github.com/browser-use/browser-use/issues/5841))→ **170+ 站预置结构化命令**:站点知识预编译,不重学。
- *"想在当前打开的 Chrome 实例上做自动化"*([browser-use#4709](https://github.com/browser-use/browser-use/issues/4709))→ **登录态原生**:所有命令跑在你已登录的浏览器里,不另起无头实例。
- *"求结构化动作证据:动作到底改没改页面"*([browser-use#5137](https://github.com/browser-use/browser-use/issues/5137);同源 [BrowserSkill#242](https://github.com/Tencent/BrowserSkill/issues/242))→ **执行真实性层**:采集结果经确定性规则+亚秒决策模型两层判定,`exit 0` 但内容无效会被标"疑似静默失败",无人值守定时任务按失败重试。

## 已经自己装过 opencli,这插件还有什么用

| | 只装 opencli(agent 走 shell) | + 本插件 |
|---|---|---|
| 开局发现 | 模型得先跑 `opencli list`(数 MB 输出) | **蒸馏命令目录已注入 systemPrompt**,第一轮就选对命令 |
| 权限模型 | 需要 shell 权限;写操作裸奔无门 | 一等公民工具 + **write 审批门**(工具层拦截) |
| 只读/受限会话 | 无 shell 就没戏 | 无需 shell,工具照用 |
| 定时采集 | 自己写 crontab + 脚本 + 通知 | 面板建定时任务,持久化 + 真执行 + watch 推送 + 带出处报告 |
| 管理 | 敲命令 | dsh 设置页:诊断/一键启动/目录浏览/巡检/启停/模式切换 |

两不冲突:深度用法仍可配合官方 opencli 技能,本插件负责工具化、安全与面板。

## 全功能面

| 模块 | 能力 |
|---|---|
| **site 适配器** | 170+ 站 / 1200+ 命令,蒸馏目录注入 systemPrompt;`site_batch` 多站并行 |
| **定时采集** | cron 持久化真执行,重启不丢;失败重试 ×3;成功落结构化快照(50 份轮转) |
| **watch 推送** | 关键词命中 → 🔔 通知事件(面板事件流,大小写不敏感) |
| **带出处报告** | 快照时间线趋势+历史;报告导出每节 = 命令+时间+快照路径,零模型改写 |
| **canvas 位图操作** | `canvas_discover/read/click` 三件套触达网页内无 DOM 节点的位图画布(图表/游戏/画板);read 读到的位图自动落盘为图片步骤,流进下行「无限画布」 |
| **无限画布** | 运行现场复盘:任务/步骤卡片钉在可平移缩放画布,截图+出处三元组,时间轴回放(与上行同名不同层:上行作用于网页内 canvas 元素,本行是你自己的活动复盘视图) |
| **真实性判定** | 确定性规则+亚秒决策模型两层;空结果/风控页标"疑似静默失败" |
| **写操作审批** | 工具层审批门(默认开,fail-closed);放行/拒绝前后截图入证据包(100 份轮转) |
| **冒烟基准** | 一键跑默认 5 站只读冒烟,逐站成功率/真实性 P/耗时,报告落盘(20 份轮转) |
| **执行轨迹** | 每条 browser/定时执行落盘 JSONL,面板「运行轨迹」复盘"上次为什么失败" |
| **browser 原语** | open/click/type/fill/scroll/state/screenshot/extract/wait/crawl 全套(泛爬带限流) |
| **自动化模式** | read-only / standard / autonomous / unrestricted 四档,接入 `tools/pre-execute` 审批门 |
| **站点健康度/漂移巡检** | 上游 issue 数据驱动受损站标注 + browser 兜底提示;canary top-20 站只读实测出漂移报告 |
| **MCP Resources** | dsh 0.2 下站点知识经 `opencli://sites/{site}/knowledge` 暴露 |
| **我的适配器** | 禁用/启用管理,禁用即从 systemPrompt 目录收缩 |
| **登录态巡检/桥** | 面板实时各站在线状态(cookie 级诊断);一键把 dsh 官方 Browser Use 接到你登录态的浏览器 |
| **拦截审计** | 审批门拦截记录(近 7 天计数 + 明细) |
| **限流与限域** | `usagePolicy` + 429/5xx 自动退避;`--authProfile` 限域登录,跨域拒绝 |
| **站点品牌图标** | 48+ 站 simple-icons 官方标 + 品牌色 |
| **中英双语** | 面板 EN / zh 一键切换 |

## 配置

零配置开箱即用;需要微调时:

| 配置 | 方式 | 默认 |
|---|---|---|
| opencli 二进制路径 | 环境变量 `DSH_OPENCLI_BIN`,或插件自带本地依赖 | `opencli`(全局) |
| 写审批开关 | 面板「审批门」一键开关 | 开 |
| 自动化模式 | 面板四档 | standard |
| 限流策略 | `usagePolicy`(minDelayMs 750 / maxConcurrency 2 / burst 3 / cooldown 30s / maxPagesPerRun 20) | 见左 |
| 限域登录 | `authProfiles`(`allowedDomains`/`storageStatePath`),配 `site --authProfile` | 无 |

## 安全不变量攻击表

**write 审批门**(默认开):写命令经 dsh 原生审批——弹窗点"允许"才执行;权限不明按写处理(fail-closed)。每一条攻击形态都有回归用例(tests/approval-invariant.test.ts):

| 攻击形态 | 门的行为 |
|---|---|
| 已知写命令(`site zhihu comment`) | 弹审批 |
| 目录外/未知站点与命令 | 按写审批(fail-closed,不因"没见过"放行) |
| 原型链名攻击(`constructor`) | 弹审批 |
| 路径形态攻击(`../etc passwd`) | 弹审批 |
| 尾部空格绕权限查询(`"zhihu "`) | 弹审批 |
| NUL 截断攻击(`comment\u0000`) | 弹审批 |
| 超长命令名(500 字符) | 弹审批 |
| 通用网关 `opencli_run` 传写形态 | 弹审批(网关不豁免) |
| `chrome_raw` 高危方法(`windows.remove`) | 人工确认 |
| `browser_do eval`(登录页任意 JS = 写原语) | 弹审批 |
| `site_batch` 混入写命令 | 整批拒绝,shell 零调用 |
| benchmark 独立通道传写命令 | 拒绝(不经 pre-execute 也自带只读门) |
| canary 夜间热词伪装写命令 | 只读门拦截 |

共 20 形态逐条回归 + 200 次可复现 fuzz,不变量:**凡 allow ⟹ 只读意图**。命令白名单与参数校验之外,全部输出经截断与噪声剥离防上下文污染;限流+自动退避;限域登录跨域拒绝。

## 已验证的测试矩阵

| 层面 | 方式 | 结果 |
|---|---|---|
| 单元/回归 | vitest 301+ 用例(审批门不变量攻击表 + 200 次 fuzz / cron 回归 / 空参数护栏 / trace / 报告结构 / 机检器) | ✅ |
| 全权审查套件 | 22 项真机逐项(渲染/真执行/状态对账/RPC 真值),`full-review.cjs` 一键复测(结果 JSON 记录宿主 dsh 版本,见 .design/video-frames/审查结果.json);dsh 0.2.0-rc.2 全套通过,0.2.1-rc.1 兼容回归通过 | ✅ |
| 真模型 E2E | 会话调 `site zhihu hot`/写拒绝/browser 往返 | ✅ |
| 登录态真数据 | 浏览器扩展桥 → try-run 真实热榜(判定 P=0.91)→ 定时采集 15s 回填 → 快照 → 时间线 → 带出处报告 | ✅ |

## 更新日志

完整版本历史见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases](https://github.com/IKEASven69/dsh-opencli/releases)。

## 常见问题

**在 dsh 面板(Web UI)的聊天里让 agent 用 `site`/`canvas_read` 等工具,agent 说不存在?**

这是 dsh 0.2.x 的既定行为,不是插件没装好:面板聊天会话的工具目录由其"预设"决定,目前只含 dsh 框架自带工具;插件注册的 agent 工具仅在 CLI agent 会话(如经 ZCode/dsh CLI 的会话)中可用。插件在面板里的部分是**设置页**(浏览器代理五 tab:诊断/定时/画布/安全与设置/命令)与全部 RPC 能力。详见 [docs/RESEARCH-20261030-dsh-preset-and-env.md](docs/RESEARCH-20261030-dsh-preset-and-env.md)。

## 定位(不做什么)

- 不替代 OpenCLIApp/daemon/扩展——那是引擎与管家,本插件是 **dsh 里的数据驾驶舱**;
- 不替代 dsh 内置 web_search/web_fetch——内置管匿名检索,本插件管你登录态的数据;
- 无头服务器(没有任何真实浏览器的机器)不适用。

MIT License.
