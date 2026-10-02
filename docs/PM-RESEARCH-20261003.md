# PM 调研与完成度审计(2026-10-03)

> 数据源:两路并行研究员(GitHub API/dsh-market 9684 插件快照 10-01/dsh 官方文档全量)+ 本地仓库盘点(89 提交/74 测试/20 项审查套件)。上轮基线:PM-RESEARCH-20260925.md。

## 一、竞品一周变化(09-25 → 10-03)

| 玩家 | @09-25 | @10-03 | 关键动作 |
|---|---|---|---|
| Tencent/BrowserSkill | 7,157★ | **8,049★(+12.5%,加速)** | **0.3.2 三件套(09-30)抢先完成 DSH 0.2 适配**(#365/#366 修 peer 范围,#364/#373 曾被 0.2 拒载);新功能:任务历史/审计、Canvas 视觉 ref、远程网关 |
| browser-use | 116k★ | 116,990★(无新 release) | 主线转 Anthropic 集成;我们跟踪的 #5841/#5137/#4709 全部停滞、零维护者回应——**没人接这三个需求,窗口仍开着** |
| OpenCLI 上游 | 29.6k★,36 open | 29,761★,**存量 open ~99,窗口新开 12** | **34 天无发版**(1.8.8 之后);12 个新 issue 里 **7 个站点失效**(xiaohongshu×4,captcha 回潮 #2562;instagram #2553;zhihu 翻页 #2551) |
| dsh 本体 | 235k★ | 242,221★ | 0.2.0 stable 未出(rc.2 09-29);桌面端内置 dsh 命令免装 Node/pnpm;官方 Browser Use 无转正迹象 |
| dsh-market | 8,643 | 9,684 | browser 关键词插件 **159 个窗口内 push**(赛道极热);BrowserSkill score 89 并列第一;**我们 score 57/1★/pushedAt 停在 09-25——条目正在贬值** |

## 二、新威胁与新机会

**威胁**:①BrowserSkill 已装上 0.2 快车道且周增 12.5%;②红海加密(dsh-browser 89 分/Minke 87 分/ego-browser 85 分全在动);③**anweat/dsh-browser 直接把 OpenCLI 打包成 plugin-local 依赖**(26★/73 分,反面教材:重打包路线已被市场验证为下策);④browser-use 押注 Anthropic 会抬高"动作证据"用户预期;⑤dsh 宿主对 skill 文本的 prompt-injection 检测会误伤(BrowserSkill #390 自己的 skill 被自己阻断)——**我们 SKILL.md 文案要预检**。

**机会**:①**上游 34 天不发版+站点破窗集中**——我们的知识层/失败恢复表/本地 autofix 是现成答案,没人做;②dsh 0.2 桌面端把安装摩擦打到地板,分发窗口开着;③"登录态"正在变成 dsh 生态通用原语(本周新插件 dual-checkin/llm-local-token/remote 都在做登录态),可组合;④**一次小版本发版即可刷新我们市场条目**(pushedAt/score);⑤社区静默期=内容空档,发中文长文无对冲噪音。

## 三、形态结论:插件薄壳 + 捆绑 skill(不是二选一)

官方文档实证:skill=数据(不能注册工具/UI/审批/定时),插件=程序(ctx.tools.register/ctx.settings 面板/审批门/定时全是插件独占)。市场实证:722 个插件用插件壳发 skill;UI 面板类 1855 个且头部极强;BrowserSkill 官方插件=同款模式("uses the same bsk CLI"+"includes its own BrowserSkill skill");anweat 打包 OpenCLI 进插件=73 分反面教材。信任面:npm 依赖树=供应链攻击面放大器(market #165 事故/V2EX 后门帖),skill 纯文档零代码免掉整条攻击面。

**行动**:①插件半边保持薄(只留工具/面板/审批/预览,OpenCLI 只检测不打包——当前路线正确);②**站点知识(180 站 pitfalls/失败签名表)从插件代码外移成捆绑 SKILL.md**——知识改动免发版即时生效+降信任负担(当前未做,是最值得做的形态优化);③市场条目 type 报准(#102:类型错=更新链路损坏)。

## 四、完成度审计(对照 OPENCLI-ROADMAP-20260922)

**已完成(有验证背书)**:W1 决策层(超计划:laya 本地+预热)/W2 执行真实性层(形态偏差:做了三执行面判定,browser_do 内循环未动)/watch v1/CDP 探测+桥卡/知识包一半(工具+导出,缺安装分享环流)/governor 竞态/1.8.8/**0.2.0-rc.2 适配(与 BrowserSkill 0.3.2 同日完成,未落后)**/风控退避/preflight/SKILL 发现性/测试隔离/样式 0.2 对齐。计数:30 agent 工具/37 RPC/74 测试/审查 20/20/180 站。

**未完成(欠账)**:W3 命令选择分层/W4 步骤决策+审批 score 分级/主线B 采集结构化落盘(runHistory 仅 120 字符摘要)/主线B 时间线可视化/**MCP Resources(阻塞已解除:0.2.0-rc.2 已可用,可开工)**/SWR 面板缓存(回滚后未重做)/知识包安装分享环流。

**新发现的活风险**:①**node 版本切换弄断插件**——opencli 装在 24.18,活跃版本切走后 PATH 无 opencli(实测 0 站点),resolveBin 静默失效;②上游 #2555:插件目录内 npm install 会静默替换宿主 opencli link——与我们打包方式相关,需在文档警示;③Chrome BrowserBridge 仍未连(真实登录态数据的最后拼图);④市场条目 57 分/1★/09-25 停更。

## 五、下一阶段排序(未来 2-3 个月)

| 优先 | 事项 | 依据 |
|---|---|---|
| P0 | **发一版 0.4.1**(市场条目刷新+0.2 兼容声明+乱码修复后的元数据) | 机会④:窗口内全对手在动,我们条目在贬值;npm 发版已被用户移出计划→走 GitHub release/tarball |
| P0 | resolveBin 抗 node 版本切换(vfox cache 路径扫描) | 风险①:真机已实际发生 |
| P1 | **站点知识外移捆绑 SKILL.md**(形态结论②) | 形态调研+上游破窗:知识免发版更新,对冲 34 天无发版 |
| P1 | **站点健康度面板**(知识层升级:按上游 issue 数据标各站已知失效/风控状态) | 威胁①+机会①:7/12 新 issue 是站点失效,没人做健康度 |
| P1 | MCP Resources(0.2 已可用) | 路线图解锁;知识包环流的地基 |
| P2 | W3 命令选择分层(需先攒真实调用数据) | 路线图;BrowserSkill 无此能力,差异化 |
| P2 | 主线B 落盘+时间线(数据产品) | 上轮 1813★ 验证的需求,微博 watch 已打底 |
| P3 | SWR 重做/browser_do 内循环 noul 化/多账号 | 工程债,顺手做 |

**三个月节奏**:10 月上旬 P0 两项+发版 → 10 月中下旬 P1 三项(SKILL 外移/健康度/MCP Resources)→ 11 月 W3+主线 B 数据产品 → 12 月 v1.0 候选(等 dsh 0.2 stable 后做官方 Browser Use attach 桥实测收尾)。
