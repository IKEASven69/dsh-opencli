# 0.1.1 规划(2026-11-04 · 定稿待审)

> 版本轨统一(2026-11-05 定):npm 版本即产品版本,GitHub release 同号(v0.1.1);此前 0.4.x 为 GitHub 旧轨。
> 本稿吸收并取代 PLAN-0.4.7.md(后者留档)。输入:2026-11-04 五面调研(上游 OpenCLI/上游 dsh/竞品目录/自身资产/场景信号),
> 全部数字当场实测,来源逐条标注;预判项明确标"未证实"。

## 一、调研结论(五面)

### 1. 上游 OpenCLI(jackwener/OpenCLI)

| 项 | 实测(2026-11-04) | 对 0.1.1 的影响 |
|---|---|---|
| 双 issue #2761/#2762 | open、0 评论、无标签;v2.0.2 后 12 个 commit 无一涉 daemon | 直连传输(A 线)继续按"带 CLI 兜底"自保护,不指望上游短期修 |
| npm 版本 | 2.0.2(10-20)= 2.0.1+OIDC 发布修复;**2.0.1 含扩展 1.0.26+抖音适配器+导航修复**;本机全局还停在 2.0.0 | 升级 2.0.2 低风险,纳入 W4 |
| undici 安全修复 | commit 10-26(3 条 advisory),**尚未进任何 release** | 2.0.3 落地后再跟进一次 |
| 节奏 | 2.0.2 后 15 天无新版,大版本后稳定期 | 0.1.1 期间适配目标漂移风险低 |

### 2. 上游 dsh(deepseek-ai/deepseek-harness,270,836★)

- **两线制**:dist-tag `latest`=0.2.1-rc.5(稳定线),`alpha`=0.2.2-alpha.3(开发线);42 个版本全部带 prerelease 后缀,**不存在"正式版"**;版本间隔 1~6 天。预判 0.2.2-rc.1 约 11 月中旬(未证实)。
- **alpha.2→alpha.3:CLI 启动器本体零变化**(tarball diff 逐文件一致);dsh-tools 拆出 `dsh-tool-executor-ptc` 新包,但**工具作者 API 未破坏**(defineTool/五事件/ToolDefinition 逐字一致;dsh-client-ui-slots 跨线逐字节一致)——与今日适配零断裂互为印证。
- 两个已知破坏点(仅当直接使用才受影响):①从 dsh-tools import `jsonSchemaToTs`/`renderToolsSdk*`/PTC 类型;②Cordis `EntryTree.write()`/`applyEntryPatches` 直用。已核对本仓源码:均未使用,无需动作。
- peer 范围:宿主兼容门实测 `satisfies(rt, range, {includePrerelease:true})` 且对比对象是 **dsh 主版本**——现行 `>=0.1.1-rc.2 <0.3.0-0` 放行全部 0.1.x/0.2.x prerelease,**无需照抄 takeover 式显式枚举**(已逐条 semver 验证)。
- **插件市场真相**:官方无 index(bundle README 原文 "There is no official index");事实市场=awesome-dsh-plugin.com/index.json(format 1,4,389 条,22.2k★ org 仓每日 CI),**我们已在其中**(0.1.0,browser 类)。dsh 端 Discover 只显示用户自加的 index 源。0.1.1 发 npm 后目录按周期探测刷新(延迟未证实)。

### 3. 竞品与渠道(dsh-market 两站+npm,2026-11-04 实测)

- **同名占注者(dsh-opencli,d342784178)**:10-25 一次性发布后 10 天零更新,0★;周下载 175 vs **我们 217,已反超**;它是 5 工具传输提速垫片,与我们(170+ 站点命令/审批门/定时采集/推送/diff/报告)重叠度低。**不做任何公开对比或点名**;防守位=README 一行原名说明接住搜索词。
- **真实压力**:dsh-browser-cdp(5,370/wk,CDP attach 路线)与 @dsh-workbench/adapter-runtime(4,619/wk,适配器组合)——量级是我们 20 倍+,抢的是同一批用户的浏览器自动化预算。
- **生态第一空白=定时采集→变更判断→多渠道告警闭环**:现有 monitor/notify 插件全是"服务器指标/提示音/任务完成通知",无一做采集联动;周期带出处报表同样零覆盖。**这正是我们的看家菜,应升为对外第一叙事**(现目录描述里 watch 只一笔带过)。
- 渠道清单:主流量=awesome-dsh-plugin(已收,含 takeover)+dshmarket(自动跟随)+jsDelivr index(已含);**未做**:bruc3van SHOWCASE.md 自荐(中英各一行)、dsh-plugin.org/submit 提交、npm keywords 补 `deepseek-harness`(LivXue 自动收录的第二个触发词)。
- GitHub release 浮动资产 `dsh-opencli.tgz` 链路完好(v0.4.6 资产实测在),发新版保持命名惯例。

### 4. 自身资产

- npm 已发 0.1.0(11-01)=0.4.6 代码;**本地 0.1.1 待发=同代码+双语 README+scoped 包名修复(今日适配断裂点)**。
- PLAN-0.4.7 遗留:A 直连铺满(P0)/B1 时间线深化/B2 静默时段/B3 级别 UI(P1)/C npm 收口(P0)。
- 未实施设计稿:零配置降级(partial 可行,已评审稿)、无限画布交互层、MCP Resources 知识暴露。
- 场景信号(USER-NEEDS 09-25):无人值守可靠性(#2520 最小化窗口假成功)→ site_batch 派发前体检是真实需求;适配器新鲜度→知识层已是我们的结构;失败说真话=已立住的招牌。

### 5. BrowserSkill/dsh-browser4 动向(威胁哨)

- BrowserSkill **11-01 发 cli-v0.4.1+ext-v0.4.1**:shared-control 默认+协议 1.8+DOM ref 跨动作稳定——仍在**操作面**深挖,与我们的数据产品面正交;节奏三连发(0.3.3→0.4.0→0.4.1),体量 ~9.8k★。
- PlatonAI dsh-browser4:仓库 11-02 仍在推(日更),插件仓本身 10★(PM 文档 10-17 的 1,171★ 是 PlatonAI 主仓口径,非 dsh 插件仓——已更正);登录态+定时组合仍未出现。

## 二、0.1.1 范围定稿

原则:**一个版本全做完再发**(沿用"没必要拖版本号"的既定决策);发布物一次成型,GitHub release 同号 v0.1.1。

| # | 项 | 内容 | 验收 | 来源 |
|---|---|---|---|---|
| 1 | A 直连铺满 | direct.ts 扩展全原语族:state/screenshot/click/scroll/tabs/close-window/cookies(site 适配器命令不走直连,如实文档化);能力探测三态+CLI 兜底+基准对照进报告 | 每原语直连/CLI 双实测对照表落盘;454 单元+矩阵+GUI 九幕+canvas 全绿 | PLAN-0.4.7 P0 |
| 2 | B2 通知静默时段 | 任务级 quietHours(如 23:00-07:00 命中暂存,晨间合并推送);推送正文注明"静默期合并" | 矩阵新增:静默窗口内不推、出窗合并推一条 | PLAN-0.4.7 P1 |
| 3 | B3 通知级别 UI | 面板任务行 notifyLevel 下拉(quiet/all),与 B2 同节 | GUI 走查新增断言 | PLAN-0.4.7 P1 |
| 4 | B1 时间线深化 | 📊 变化面板加 7 天聚合视图(每日一行 新增/消失/位移)+CSV 导出带 diff 列 | snap-export 列含 diff 字段;7 天聚合渲染断言 | PLAN-0.4.7 P1 |
| 5 | site_batch 派发前体检 | 每站批量执行前 noul 一次登录态快检,死站先标 ⚠ 不进批次(可跳过);防无人值守假成功 | 矩阵新增:混入死站时批次行为断言 | USER-NEEDS #3 |
| 6 | CLI 2.0.2 升级回归 | 全局 opencli 2.0.0→2.0.2(扩展 1.0.26+导航修复+抖音适配器),全套件复跑 | 22 项套件+全量回归绿,套件记录宿主/CLI 双版本 | 调研① |
| 7 | 分发包 | npm keywords 补 `deepseek-harness`;README 顶部一行"原名 dsh-opencli 已被占注,npm 包为 @cold777/dsh-opencli";README 增"与其他 browser 插件的关系/选型"段(只讲场景不点名);目录描述把 watch+告警叙事提前 | npm pack 干净;对外数字全部"170+"口径(源码注释权威) | 调研③ |
| 8 | 发布序列 | npm 0.1.1 publish → GitHub tag v0.1.1+release(资产含浮动 dsh-opencli.tgz)→ 两目录站版本刷新验证 → CHANGELOG 单轨记法 | 目录站详情页版本=0.1.1;release 资产链不断 | C1 |

**明确不做(本期)**:零配置降级(0.1.2 首候选,设计稿已备)、无限画布交互层、MCP Resources、Electron 相关(上游 2.0 已移除,勿接)、对 hahaee 的任何公开动作。

## 三、工作流(执行顺序+依赖)

```
W1 A直连铺满 ──┐
W2 B2+B3 ──────┼── 互不依赖,可并行开发
W3 B1 ─────────┤
W5' site_batch体检 ─┘
      │
W4 CLI 2.0.2 升级+全量回归(在 W1-W3/W5' 全部合入后一次跑,避免重复回归)
      │
W5 分发包收尾(README/keywords,可与 W1 并行起草,定稿在 W4 后)
      │
W6 发布序列(卡点:npm publish 需用户 OTP;GitHub release 需用户过目 release notes)
      │
W7 对外动作(逐项请批:SHOWCASE 自荐两条、plugin-hub 提交——按对外提交纪律,全文先呈后发)
      │
W8 观察哨(被动):dsh 0.2.2-rc.1 落地→复跑适配;#2761/#2762;BrowserSkill/dsh-browser4;undici 进 release→升 2.0.3
```

排期预估(按当前节奏):W1-W3+W5' 开发 2-3 天 → W4 回归半天 → W5 半天 → W6 发布半天(等 OTP)→ W7 半天。**约 4-5 天到发布**。

## 四、需用户批准/参与的卡点

1. npm publish(OTP 码或用户自跑)——W6
2. GitHub v0.1.1 release notes 过目——W6
3. SHOWCASE.md 自荐文案(两条:opencli+takeover,中英各一行)——W7,呈批后发
4. plugin-hub 提交表单内容——W7,呈批后发

## 五、清理项(顺手,不影响发布)

- 旧 clone `D:/CodingProjects/dsh-opencli`(待确认后归档/删除)
- 试验 profile `~/.dsh/profiles/headless-opencli`(320MB)
- 旧打包 `dsh-opencli-0.4.4.tgz`(release 目录内,无引用)
- openclitest profile 的 `github:IKEASven69/dsh-opencli` 旧引用(换 scoped 名或删)
