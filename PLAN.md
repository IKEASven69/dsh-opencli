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

- **wrapper 插件,不打包 OpenCLI**:doctor 检测 `opencli` CLI(不可用→OpenCLIApp/npm 安装指引);全部调用经 `ctx.shell.resolve/run`;daemon 生命周期 OpenCLI 自管(仅做 `opencli daemon status` 状态探测 + 面板一键拉起)。
- 零原生依赖、无 dts 痛点;`.build-tools` 构建管线(SWC stage-3 + esbuild + `__ModuleLoader__` 包装)直接复制;RPC 签名禁默认值;客户端 fetch 直连 `/api` 桥。
- 插件内各工具统一 `browser_*` / `site_*` 前缀,与 dsh 内置 web 工具(`web_search` 等)边界清晰:内置=检索,本插件=**办事**。

### 二·一、定位四层(2026-08-27 定稿,回答"与 opencli 本身/App/官方 skill 的区别")

**CLI=引擎,App=管家,官方 skill=通用说明书,本插件=dsh 里的驾驶舱。**官方 skill(App 一键装入 ~/.agents/skills,教任何 agent 裸跑 opencli)与我们不构成替代:它养大 opencli 用户基数,我们承接其中用 dsh 的那批。目标用户=「dsh 用户里的 opencli 用户」。相对"agent+skill 直用"的五点增量:

1. **工具化 vs 自由 shell**:一等公民工具(参数校验/命令白名单/输出 schema/遥测),且 write 审批门只能在工具层做——自由 shell 拦不住模型的 opencli 调用;
2. **目录预注入**:1276 命令蒸馏进 systemPrompt,开局即选对命令,省 turns/token,不依赖 shell 权限(只读会话也能用);
3. **面板**:daemon 诊断/一键启动/命令集合浏览/复制——skill 永远给不了的 UI 层;
4. **dsh 生态钩子**:slots/RPC/schedule/通知,定时订阅与 deck/hippo 联动只有插件形态接得进;
5. **两不互斥**:插件自带 SKILL.md(L3 创作循环),深度指导走 skill,工具/面板/注入走插件。

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

### 五·二、v0.2+ 功能路线(2026-08-27 讨论定稿:"驾驶舱四层")

> 取舍标准(定位二·一推导):**只加"驾驶舱该有的",不加"引擎该有的"**——不 fork opencli 造适配器运行时,只做工具层管控、面板、工作流与资产层。差异化叙事:竞品卖"手",我们卖"手 + 173 个站点的肌肉记忆 + 长出新手的能力"。

| 版本 | 功能 | 一句话 | 要点 |
|---|---|---|---|
| **v0.2** | **write 审批门**(安全层) | `site` 的 write 命令(发帖/点赞/下单)默认弹审批,面板看审批队列 | opencli list 自带 access 字段;审批只能在工具层做——这是相对 skill 路线的独占能力;发布叙事强卖点 |
| **v0.2** | **登录态巡检**(运维层) | 聚合各站 whoami 做面板健康卡,过期红点 | 复用现有适配器命令,聚合进面板状态卡 |
| **v0.2** | 适配器禁用联动(O4 遗留) | 面板禁用某适配器→注入清单同步收缩 | — |
| **v0.3** | **操作录制回放**(工作流层) | 成功的 browser_* 序列录成宏(本地 yaml),面板管理/一键重放/可定时 | 从"代理"升级"自动化平台"的 signature feature |
| **v0.3** | **我的适配器**(资产层) | L3 会话内创作的适配器入库/启停/导出分享 | 把"越用越会"飞轮产品化,护城河从借来的 173 个变成社区共创 N 个 |
| **v0.3** | **适配器分发三层**(随「我的适配器」) | 本地层 `~/.opencli/clis/`(eject/status/reset 原生支持,零 PR 即用)→ 社区层 `opencli plugin install <git>`(自建社区仓收录官方未合适配器,面板可配源/从 URL 安装)→ 上游层 PR(尽力而为,不阻塞;实测 #2049/#2051 挂两个月未 review) | 官方不收 ≠ 没人能用;社区仓首批内容就用我们被拒的两个适配器 |
| **v0.4** | 定时订阅 | cron:每天 8 点 `site zhihu hot` → 摘要推送 | 依赖 ctx.schedule 稳定性;killer 场景 |
| 远期 | dsh 生态联动 | site 结果直进 dsh-deck 四库;浏览偏好沉淀 dsh-hippo | — |

### 五·三、总路线图 R0-R5(2026-08-28 定稿;叙事主线:**驾驶舱 → 资产库 → 自动化 → 生态**,每层都是竞品零覆盖区)

| 阶段 | 主题 | 内容 | 验收 | 量级 |
|---|---|---|---|---|
| **R0** 发布周 | 占位 | README GIF(一句"打开B站搜罗翔"→真实 Chrome 完成);awesome-dsh-plugin 收录 + dsh-market | 收录通过,一键可装 | 0.5 天 |
| **R1** 信任层 v0.2 | 敢让 agent 办事 | write 审批门(工具层拦截 access=write→面板审批队列);登录态巡检(whoami 聚合健康卡+红点);适配器禁用→注入联动;daemon 自愈(未运行自动拉起,可关);site 结果 TTL 缓存 | write 无确认不执行;巡检卡显示各站登录态 | ~2 天 |
| **R2** 资产层 v0.3 | 适配器变资产 | 「我的适配器」面板(adapter status + ~/.opencli/clis/ 扫描;eject/reset/启停/导出);分发三层落地(社区仓建仓,xiaoheihe/cls 迁入首批;面板从 URL 安装=包装 plugin install);调用历史面板 | 创作→入库→导出→另一台机安装跑通 | ~3-4 天 |
| **R3** 自动化层 v0.4 | 从代理到平台 | 操作录制回放(成功 browser_* 序列→宏 yaml→面板管理/一键重放);定时订阅(ctx.schedule cron,如每天 8 点 `site zhihu hot`→摘要通知);usage-driven 目录注入(高频站前置/低频折叠,token 预算自适应) | 录一次"每日签到"宏,次日自动执行成功 | ~3 天 |
| **R4** 生态层 | 适配器的 npm(庞大计划核心) | 创作工坊:面板向导化 L3(选站→analyze→scaffold→verify→一键发布社区仓),创作数据回流需求榜;社区市场页(面板内浏览/安装数);适配器模板与规范 lint(包装 convention-audit) | 一个非作者用户照向导创作适配器并发布成功 | 1-2 周 |
| **R5** 联动层 | 浏览即数据管线 | deck 管线:site/订阅结果自动进四库,"采集→整理→复用"无人值守链(每日调研→入库→周报);hippo 浏览记忆(偏好沉淀/下一步预测);多 agent 并发浏览调度(session 池+调度面板) | 一条无人值守链路连跑 7 天无人工干预 | 远期 |

- **优化空间余量**(未排期的即时小项):截图管理、README 英文化、`--source ax` 输出截断调优、面板虚拟滚动(173 卡长列表);
- **排期原则**:R0 尽快(browser 类两天 +47%,叙事窗口在收窄);R1-R2 完成后发 v0.2 版本再营销一轮;R4 是"从插件到生态"的分水岭,做之前用 R2-R3 的社区仓数据验证需求。

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| OpenCLI 是 fork(上游 jackwener),双线维护 | wrapper 只依赖 CLI 稳定命令面;版本探测+兼容层 |
| daemon/Chrome 扩展需用户安装 | doctor 引导 OpenCLIApp(托盘一键);README 分步图 |
| 各命令 JSON 输出不一致 | O1 首项验证;必要时统一解析层 |
| ax 快照过大污染上下文 | 截断+区域摘要;screenshot 仅显式请求 |
| 浏览器类填坑加速(08-25→08-27:36→53,两天 +47%) | 发布节奏压紧;L1+L3 先行,L2 面板可后置 |
| 与内置 web 工具混淆 | 前缀隔离 + README"检索 vs 办事"定位说明 |

## 七、与仓库现状关系

独立插件(`plugins/dsh-opencli/`),不并入 dsh-hippo 组合(领域不同:浏览器代理 vs 记忆/生活流);OpenCLI 代码库继续留在 `D:\CodingProjects\OpenCLI`(上游同步线),本插件只消费其 CLI。
