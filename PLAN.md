# dsh-opencli · 浏览器代理插件 · 方案文档

> 立项:2026-08-25(基于本机 OpenCLI fork v1.8.6 源码侦察 + 市场快照)
> 状态:**O1-O3+L3 初版已实现并通过 E2E 验证(2026-08-25)**——176 站点适配器枚举/daemon 状态/systemPrompt 目录注入/site+browser_* 工具族;面板未目检,发布待三件套之后。
> 定位:项目清单 P1 主攻线。
> 一句话:**dsh 直接操纵你登录过的真实 Chrome;179 个站点适配器即刻变成 dsh 的能力。**

---

## 一、市场与差异化(2026-08-27 全量核实:awesome 仓库 data/plugins 2310 个 YAML 逐个计数,53 个 browser 类全部过目)

- 浏览器类 **53 个**(08-25 为 36,两天 +47%;全榜 1721→2310,赛道高速膨胀),榜首 Lum1104/dsh-browser **302⭐**(侧边栏形态,头部在巩固);仍无巨头;
- **L1 层(登录态/真实浏览器控制)竞品扩到 ~12 个,依然全都没做起来**:Kimi-WebBridge 2⭐、chrome-faithful 1⭐、wqty123 7⭐(Electron 共享窗+CDP)、anweat 6⭐(唯一提及 opencli 者,但只当 Playwright 裸 Chromium 附属)、caob23/ywleeo/jiaererw/kyo615/zaiwenJ/guo6x/Viger1 均 ≤4⭐,Tabbit/Jiey/CloakBrowser 各绑自家浏览器——**L1 是入场券,不是护城河**;
- **L2/L3(站点适配器生态、适配器自创作)依旧零竞品**:53 个里没有任何"网站变 CLI/适配器库"方向;搜索后端(tavily/exa/searxng/firecrawl 约 20 个)是另一红海子类,与我们不冲突;
- **结论与叙事**:发布主打"**不是又一个浏览器原语插件,是 173 个网站的确定性接口 + 越用越会自扩展**"——①登录态真实浏览器(daemon+扩展,非裸 Chromium)是入场券;②适配器长尾(B站/知乎/小红书/12306/51job/arxiv/Reddit/HN/Twitter…)是护城河;③适配器自创作(adapter-author 技能)是飞轮——"越用越会浏览的 dsh"。

## 二、形态决策(工程,照搬 depsec 已验证打法)

- **wrapper 插件,不打包 OpenCLI**:doctor 检测 `opencli` CLI(不可用→OpenCLIApp/npm 安装指引);全部调用经 `ctx.shell.resolve/run`;daemon 生命周期 OpenCLI 自管(仅做 `opencli daemon status` 状态探测)。
- 零原生依赖、无 dts 痛点;`.build-tools` 构建管线(SWC stage-3 + esbuild + `__ModuleLoader__` 包装)直接复制;RPC 签名禁默认值;客户端 fetch 直连 `/api` 桥。
- 插件内各工具统一 `browser_*` / `site_*` 前缀,与 dsh 内置 web 工具(`web_search` 等)边界清晰:内置=检索,本插件=**办事**。

## 三、能力三层

**L1 浏览器原语工具族**(核心卖点,包装 `opencli browser <session> …`):
`browser_navigate / browser_click / browser_fill / browser_extract / browser_snapshot / browser_screenshot`。
其中 **snapshot 用 ax-snapshot(无障碍树快照)**——模型消费的最佳形态(结构化、省 token、免视觉);截图仅作辅助。`--session` 映射为 dsh 侧命名浏览器会话。

**L2 站点适配器桥**(长尾杠杆):
启动时枚举适配器清单 → systemPrompt 注入限量目录(分类+一句话,防膨胀)→ 统一 `site` 工具(`{ adapter, command, args }` 透传 `opencli <adapter> <cmd>`)——179 个站即刻可用,无需逐个写工具。

**L3 适配器创作**(自扩展飞轮):
opencli-adapter-author 技能封装为 dsh skill;会话内"没有你要的站?现场长一个"→ `opencli browser verify` 验证闭环。这是"越用越会"的机制保障,也是市场叙事主角。

## 四、面板(设置页)

- 浏览器状态卡:daemon 状态/扩展连接/当前页/最近操作;
- 截图预览与会话管理;
- 适配器管理:启用/禁用(控制 systemPrompt 注入清单);
- 调用历史(adapter/command/耗时/结果摘要)。

## 五、里程碑(每步带验收)

| # | 内容 | 验收 |
|---|---|---|
| **O1** ✅ | 骨架 + doctor(CLI/daemon 检测与引导)+ L1 四件(navigate/click/fill/extract);**首项任务:核实各原语的结构化输出**(`--json` 或解析层) | dsh 会话里自然语言"打开B站搜 XX"在登录态真实跑通 |
| **O2** ✅ | snapshot(ax 快照)+ screenshot + 注入格式打磨(截断/摘要策略防上下文膨胀) | 模型仅凭 snapshot 自主决策下一步操作 |
| **O3** ✅ | 适配器桥:清单枚举→systemPrompt 限量目录 + `site` 统一工具 | `site zhihu hot` / `site arxiv search …` 等跨 ≥5 个适配器调用全通 |
| **O4** ✅(2026-08-27) | 面板:状态卡/适配器管理/卡片展开命令详情;视觉对齐 OpenCLIApp 0.1.38「命令集合」页实测(冷灰卡片+蓝强调+Site/App 分段 tab+单行命令徽章) | 面板结构/配色/度量与 App 同构;展开行含 browser/read·write 徽章与 example 悬停。(禁用联动未做,降级为 v0.2) |
| **O5** ◐ | adapter-author 技能接入(会话内创作+verify 闭环)+ 发布(README GIF:登录态演示→收录→dsh-market);SKILL.md 初版已入库 | 会话内成功创作 1 个新适配器;收录通过 |

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| OpenCLI 是 fork(上游 jackwener),双线维护 | wrapper 只依赖 CLI 稳定命令面;版本探测+兼容层 |
| daemon/Chrome 扩展需用户安装 | doctor 引导 OpenCLIApp(托盘一键);README 分步图 |
| 各命令 JSON 输出不一致 | O1 首项验证;必要时统一解析层 |
| ax 快照过大污染上下文 | 截断+区域摘要;screenshot 仅显式请求 |
| 浏览器类填坑加速(52→?) | 发布节奏压紧;L1+L3 先行,L2 面板可后置 |
| 与内置 web 工具混淆 | 前缀隔离 + README"检索 vs 办事"定位说明 |

## 七、与仓库现状关系

独立插件(`plugins/dsh-opencli/`),不并入 dsh-hippo 组合(领域不同:浏览器代理 vs 记忆/生活流);OpenCLI 代码库继续留在 `D:\CodingProjects\OpenCLI`(上游同步线),本插件只消费其 CLI。
