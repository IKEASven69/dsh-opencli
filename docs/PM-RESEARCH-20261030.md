# PM 调研 · 竞争对手与处境(2026-10-30)

> 数据源:competitor-watch.cjs 实拉 GitHub API(2026-10-30)+ BrowserSkill/opencli/dsh releases 逐条读 +
> 本周三份环境调查(RESEARCH-20261030-dsh-preset-and-env)。上轮基线:PM-RESEARCH-20261003(09-25→10-03)。
> 本轮跨度 10-03 → 10-30(四周)。

## 一、四周竞品变化(10-03 → 10-30)

| 玩家 | @10-03 | @10-30 | 四周动作与解读 |
|---|---|---|---|
| Tencent/BrowserSkill | 8,049★ | **9,801★(+21.9%)** | **0.4.0(10-29)连发**:canvas/vom(候选区域发现+类型化 visual ref+坐标点选)、全页/后台 tab 截图、focus/滚轮原语、跨 frame 几何统一、认证远程网关、任务历史。节奏 0.3.2→0.3.3→0.4.0 三连发 |
| PlatonAI Browser4 | (未入 dsh) | **dsh-browser4 已上线(10-17),1,171★,日更** | 10-03 标记的"最高优先新变量"落地:crawl4ai 系公司的 AI-native 浏览器引擎以官方姿态进 dsh;定位大规模浏览/提取/自动化 |
| jackwener/opencli | 29,761★ | **30,777★,复工三连发** | 2.0.0(10-17 大版本)→2.0.1(10-20)→2.0.2(10-20);1.8.3+ 自建 **site auth 子系统**(login/whoami/auth status/auth refresh,50+ 适配器) |
| dsh 本体 | 242k★(rc.2) | rc.1→**rc.5(10-30)+0.2.2-alpha.2** | 四周 5 个版本;rc.3 加插件浏览 UI;**预设作用域工具门到 rc.5 未动** |
| dsh-market | (repo★9,684) | repo★9,779 | browser 赛道持续拥挤;我方条目在两站均在且装浮动 URL(发 release 即自动更新);**同名插件 d342784178/dsh-opencli 已入 npm 目录** |
| wqty123/dsh-browser | (参照) | 154★,v0.4.14(10-19) | 发版节奏参照,长尾 |
| omdsh-dev/dsh-browser | (参照) | 945★,10-01 后停更 | 长尾衰退样本 |

## 二、竞争格局:三条战线,一条被追平,一条新开,一条无人区

### 战线 1:浏览器操作面(agent 工具)——**canvas 差异化窗口已被 BrowserSkill 关闭并反超**

BrowserSkill 0.4.0 的 canvas/vom 做了**类型化 visual ref**(给 canvas 区域发可复用的引用句柄)——比我们
0.4.5 的原始 discover/read/click 三件套更精细。README"竞品差异"表里"canvas 位图操作"一行已成平手甚至
落后。**但方向不同**:他们的 canvas 是**操作面**(让 agent 操控页面),我们的 canvas_read 位图落盘进
无限画布是**复盘面**(让人回放 agent 看到了什么)——后者他们没有,且这是 0.4.5 新接通的独占链路。

### 战线 2:数据产品面(定时/出处/推送/回放)——**仍是无人区,但地基正在上游化**

四周过去,没有任何竞品做定时采集+出处报告+推送闭环+画布回放。**新变量**是 opencli 上游的 site auth
子系统:`opencli <site> login/whoami`、`opencli auth status/refresh` 已覆盖 50+ 适配器——"登录态原语"
正从我们的差异化变成上游公共品。含义:任何人都能基于它包一个登录态工具;我们的护城河必须停留在
**产品化层**(定时→真实性判定→快照→推送→带出处报告→画布回放的完整闭环),而不是"有登录态"本身。

### 战线 3:引擎面——Browser4 新入局,但路线不同

PlatonAI dsh-browser4 是 AI-native 浏览器**引擎**(大规模提取/自动化),与我们"你日常浏览器+你的登录态"
路线正交甚至互补。风险点:若它后续补登录态托管+定时,将直击我们核心区——列入 watcher 重点。

### 结构性约束(全生态均等):dsh 预设作用域

面板聊天会话不装载任何插件的 agent 工具(本周四门实测,rc.5 未变)——BrowserSkill 同样受限
(它的工具同样只在 CLI agent 会话可用)。含义:**管理面(面板)是插件间真正的 UI 竞技场**,而我们的
五 tab 面板+RPC 全功能面在这个竞技场里是重量级存在;工具面之争被 dsh 架构拉平到同一战场。

## 三、我们的处境

**劣势(10-30 更正)**:①初版误判"条目停 v0.3.4"——那是我方竞品脚本里的过期硬编码;实况:条目在两站均在、装浮动 URL 随 GitHub latest release 自动更新(v0.4.5 发布即生效),无条目更新动作要做的真正风险是**同名竞品 d342784178/dsh-opencli(直连 daemon 路线)已入 npm 目录且 npm 包名被其占注(10-25)**,搜索时与我们并排出现;
②0.4.5(推送闭环+画布+canvas)已全部实现验证但未发版;③canvas 操作面被 BrowserSkill 反超;
④宿主跑在 0.2.1-rc.1(落后 5 个版本)。

**优势**:①数据产品闭环(定时→判定→快照→推送→报告→回放)四周内仍无竞品覆盖,登录态定时采集
是独占区;②canvas_read 位图进画布的"复盘面"链路(0.4.5)独占;③399 测试+安全不变量+审批门+
pr-gate 的工程质量在长尾竞品里无对手;④面板管理面不受预设门影响,恰是当前生态的 UI 竞技场;
⑤opencli site auth 上游化对我们是顺风(免费地基,login-check 直接受益)。

**威胁**:①BrowserSkill 引擎+生态位碾压式增长(周增从 12.5% 缓降至 ~5% 但基数已近万);
②Browser4 若补登录态+定时;③上游 site auth 让"包一层登录态"的门槛降为零,低质竞品会增多。

**机会**:①发 0.4.5 立即刷新市场条目(0.4.4→0.4.5 双跳+changelog 叙事"数据产品大版本");
②中文社区内容空档仍在(定时采集+推送闭环场景文);③给 opencli 上游提 daemon 版本战争+
IPv6/localhost 两issue(有源码级证据,信誉建设);④dsh 0.2.2-alpha 跟进适配窗口。

## 四、行动排序

| 优先 | 事项 | 依据 |
|---|---|---|
| P0 | 发版 0.4.5(✅10-30 已发,浮动 URL 已验证) | 条目随浮动 URL 自动吃到新版,无需条目动作;真正的后续是 npm 换名决策 |
| P0 | README 竞品表 canvas 行改为"复盘面独占"表述,撤"位图操作"差异化声明 | 战线 1:声明与现实不符的部分必须先改(#8007 教训:对外文案必须当场可复现) |
| P1 | opencli 上游两 issue(daemon 冲突机制+IPv6/代理栈断回环,附源码证据) | 机会③:调查已备好弹药 |
| P1 | 宿主升 0.2.1-rc.5 并复跑 22 项套件 | 劣势④:跟上发版节奏 |
| P2 | 中文内容:定时采集→推送→画布回放场景文 | 机会② |
| P2 | watcher 增盯 dsh-browser4 登录态/定时动向 | 威胁② |

## 附:数据快照采集方式

- 星数/推送/release:competitor-watch.cjs(gh api,2026-10-30 实拉,可复跑)
- BrowserSkill 0.3.x→0.4.0 变更:github.com/Tencent/BrowserSkill/releases 逐条读
- opencli 2.0.0-2.0.2 变更与 site auth:github.com/jackwener/opencli/blob/main/CHANGELOG.md
- dsh rc.3-rc.5:github.com/deepseek-ai/deepseek-harness/releases
- 我方条目状态(10-30 现场核实):awesome-dsh-plugin.com/zh/p/IKEASven69/dsh-opencli 与 dshmarket.com/zh/browse 均在列,装浮动 URL;npm 源 index(dsh-plugin-catalog,3993 条全 npm)不含我方——该 index 是 npm 子集不是全目录(初版据此误判,教训:查目录要查站点实况,不能只查 npm 导出)
