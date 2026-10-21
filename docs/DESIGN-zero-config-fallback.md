# 设计:零配置降级(无扩展时的诚实可用面)

> 状态:设计稿(待评审)。输入:2026-10-21 接缝研究(通道 A–H 实测结论)。
> 可行性结论:**partial**——纯 HTTP site 命令与 browser:true 的 CDP 通道可降级,browser_*/chrome_* 交互原语族不可降级(上游架构事实)。
> 本文所有代码锚点分两类:插件侧(`src/`、`tests/`)与上游 opencli 安装目录(本机 `~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/dist/src/`,下称 **上游/**)。两类均在本次设计时逐条打开复核过;接缝研究给的实测结论(juejin hot 无 daemon 成功、36kr hot 经 9339 成功、死端口 9999 阴性对照)为研究输入,本文引用处标〔研究输入〕。

## 0. 问题与一句话结论

现状:扩展未装/未连时,面板四层自检第三层亮红(doctor `src/index.ts:334-335`),首启向导持续置顶(`shouldShowOnboarding`,`src/client.ts:1491-1496`),而**全部工具族的错误文案都引向"先装扩展"**——`tryRun` 的失败分类把 BROWSER_CONNECT 类错误一律引导装扩展(`src/index.ts:1713`),systemPrompt 目录在 daemon 未运行时也直接判死 browser_*(`src/index.ts:1074`)。

事实:这 overstated 了不可用面。接缝研究实测证明,上游 opencli 存在两条**不经过扩展**的进程内通道:

- **通道A(纯 HTTP)**:`browser: false` 的 site 命令走进程内 fetch,零浏览器零扩展零 daemon,入口就是现有 `opencli <site> <cmd>`,本插件 `tryRun`(`src/index.ts:1708`)与 `site` 工具(`src/index.ts:1005`)已经透传——**这部分今天就能跑,只是没人告诉模型它能跑**。
- **通道B(direct CDP,仅 adapter 路径)**:`OPENCLI_CDP_ENDPOINT` 环境变量让 `getBrowserFactory` 在 CLI 进程内把 browser:true 适配器切到 `CDPBridge`(上游/`runtime.js:9-13`,`CDPBridge` 定义于上游/`browser/cdp.js:28` 起)。

一句话结论(**与接缝研究一致,本文采纳为设计基线**):无扩展时,可诚实提供的可用面 = "PUBLIC 只读 site 命令直跑 + 干净 CDP 浏览器上的匿名只读浏览";`browser_*`/`chrome_*` 交互原语族是 CLI→daemon→扩展的硬链路(上游/`daemon.js:1-5` 头注释、上游/`browser/daemon-transport.js:57-58` 的 `no-extension` 状态机),无扩展时只能引导安装,不伪造降级;登录态(COOKIE 策略命令)整体降级为不可用。

## 1. 事实基线:通道矩阵与证据

| 通道 | 内容 | 读写 | 扩展依赖 | 证据(本次复核/研究输入) |
|---|---|---|---|---|
| A | site 命令纯 HTTP(browser:false 或无页面步骤) | 读写可达,实际只承诺读 | 无 | 〔研究输入〕daemon 未运行时 `juejin hot` 实测成功;本机 grep 计数:browser:false 281 个命令文件、未声明 browser 的 512 个(研究判定其中 ~383/384 无页面步骤,同为通道A),占 1313 个命令文件的约半目录 |
| B | `OPENCLI_CDP_ENDPOINT`(可选 `OPENCLI_CDP_TARGET`,上游/`browser/cdp.js:475`)+ `--site-session ephemeral` | 同上 | 无 | 〔研究输入〕指向本机遗留 headless Edge(9339)跑通 `36kr hot`(browser:true);死端口 9999 报 ECONNREFUSED,证明该 env 只在 CLI 进程内生效、不透传 daemon。互斥约束:与 `OPENCLI_SITE_SLOTS` 冲突即抛 `ArgumentError`(上游/`execution.js:189-192`);无 tab 管理(上游/`browser/cdp.js:449-454` `tabs()=[]`、`selectTab` no-op);连上即自动注入 stealth JS(上游/`browser/cdp.js:67`) |
| C | `browser_*` 交互原语族 | — | **必须** | 上游/`daemon.js:1-5`:架构只有 CLI→HTTP→daemon→WebSocket→扩展一条链,daemon 无任何 CDP 代码;无扩展时 `no-extension`/`extension_not_connected`(上游/`browser/daemon-transport.js:55-58`)。本插件 `runBrowserTraced`(`src/index.ts:2319`→`2332`)即走此族 |
| D | `chrome_*` 原生管理族 | — | **必须,≥1.0.25** | 扩展 1.0.24 报 `Browser session is required`,插件已有升级指引(`src/index.ts:825-826`);方法白名单 `CHROME_METHODS_ALLOW`(`src/index.ts:63-67`) |
| E | dsh 宿主 `ctx.web` | 只读 | 无 | 〔研究输入〕`dsh-web/lib/index.js:41` WebRuntime 的 search/fetch provider 槽,本机有 web-fetch-http 本地 provider;纯 HTTP 无渲染 |
| F | 官方 Browser Use | — | — | 〔研究输入〕`api-catalog.js:483-495` 的 browserUse 槽在本安装为空,当前不可用;远期通道 |
| G | dsh 侧栏 webview | — | — | 〔研究输入〕用户面板无自动化入口,竞品靠补丁宿主桌面包拿到 webContents.debugger——本设计明确不做(见 §8) |
| H | 竞品参照 wqty123/dsh-browser | — | 无 | 〔研究输入〕三载体(自启 headless+CDP / attach 已装浏览器 / 侧栏 webview);`browser_auth` 经 CDP Storage.getCookies 移植登录态——**本设计只取其 headless 自管载体思路,不取 cookie 移植**(见 §6 安全边界) |

**本设计只用通道A与通道B**(通道B 仅 adapter 路径)。通道C/D 引导安装,通道E 作为 opencli 之外的兜底仅在文档提及,通道F 留作远期接口位,通道G/H 的侵入路线进不做清单。

**决策:为什么是"每命令路由"而不是全局降级模式开关。**
- 备选1:全局"无扩展模式"状态机,所有工具切换行为。否决理由:扩展随时可能装上并自动重连(daemon 侧状态会翻绿),全局模式必然滞后或需要额外的失效逻辑;更重要的是通道A**本来就不依赖扩展**,不该被任何"模式"门控。
- 备选2(采纳):探测结果只影响**路由决策与文案**,不影响工具注册。`site` 命令执行时按"命令能力 × 当前扩展状态"实时选通道;`browser_*`/`chrome_*` 无扩展时在执行前短路并给出安装指引。探测信号复用现有 `daemonStatus`/`parseDaemonStatus`(`src/parsers.ts:70` 附近,已解析 `extension` 字段)与 `probeCdp`(`src/index.ts:1457`,15s 缓存)。

## 2. 触发与探测

### 2.1 信号源(全部复用现有链路,不引入第二套口径)

| 信号 | 来源 | 现状 |
|---|---|---|
| daemon 运行 & 扩展连接态 | `daemonStatus()` → `parseDaemonStatus` | doctor 已消费(`src/index.ts:318-336`);向导已消费(`src/client.ts:1442-1444`) |
| CDP 端点存活 | `probeCdp()`(`src/index.ts:1457-1475`,候选端口 9222/9234/9236/9238 + `OPENCLI_CDP_PORT`) | 已服务 `browser-cdp` RPC(官方 Browser Use 桥卡,`src/client.ts:580`);降级路由扩展其用途 |
| 命令 browser 与否 | `opencli <site> <cmd> --help -f json` 的 `browser` 布尔字段 | 本次实测:`juejin hot` → `browser:false`;`36kr/weibo/zhihu hot` → `browser:true`。注意 `opencli list` 平铺数组只有 `command/description/access`(实测),**strategy(PUBLIC/COOKIE)不在任何 CLI 输出里** |
| 命令读写 | 目录 `access` 字段 → `commandAccess`(`src/parsers.ts:131`) | 审批门已在用 |

**决策:PUBLIC/COOKIE 不预判,按运行时结果归类。** 理由:strategy 不在 CLI 输出中,插件侧唯一可靠来源是 grep 安装目录的 `Strategy.PUBLIC` 标记(实测可 grep 到 329 个 PUBLIC 文件、573 个 COOKIE 文件;研究口径 605/1313 含变体写法)——运行时依赖安装布局是脆的。替代方案:静态维护"已知 PUBLIC 站"正向清单(SITE_HEALTH 手工地图先例,`src/knowledge.ts:73`),只做**正向提示**("这些站无扩展也能读")不做**门控**(漏标不该挡住一个实际能跑的命令)。归类靠已有的失败分类器:`AUTH_REQUIRED|请先登录|NOT_LOGGED_IN` → 登录态缺失(`src/index.ts:1714`),该分类今天已存在,降级模式只是把它的**引导文案**从"先在真实 Chrome 登录"换成"无扩展时登录态整体不可用,装扩展后可恢复"。

### 2.2 触发点

1. **doctor**(`src/index.ts:301-352`):BrowserBridge 层红时,`next` 步骤从单一"装扩展"扩为两条:①装扩展(恢复全部能力,保留现文案 335 行);②"零配置继续用:当前无扩展也可直接跑约半数 PUBLIC 只读命令(site juejin hot …),browser_*/chrome_* 暂不可用"。
2. **首启向导**(`OnboardingWizard`,`src/client.ts:1427`):bridge 行保持红点与装扩展动作,但卡片**不再只有一种结局**——新增一行"降级可用面:N 个只读命令可跑"的黄色状态行;`shouldShowOnboarding`(`src/client.ts:1491`)门槛不变(bridge 红仍渲染向导),渲染内容变化。理由:向导的职责是"逐层修复",降级不是修复,是并行的诚实声明,不该把向导藏掉。
3. **systemPrompt 目录**:`updateDirectory`(`src/index.ts:1064`)已按 daemon 状态动态组装——扩展未连时追加一段"当前无扩展:site 的 PUBLIC 只读命令可直跑;browser_*/chrome_* 与登录态命令不可用,装扩展见 …"。理由:工具 `description` 是一次性注册的静态文案(如 `browser_open` 的"登录态天然可用",`src/index.ts:445`),运行中无法随状态改写;**动态能力声明只能走目录文本与错误文案两个通道**,这是现架构下的必然选择。
4. **命令执行时**(真正的路由触发,见 §3):每次 `site` 调用读缓存的扩展状态(≤15s 陈旧,与 `probeCdp` 缓存同量级)。

### 2.3 headless Chrome 自管生命周期(通道B 的端点来源)

- **决策:MVP 懒启动、不做常驻。** 首个 browser:true 只读命令在无扩展状态下降级时:spawn `chrome --headless=new --remote-debugging-port=<p> --user-data-dir=<独立临时目录>`,端口文件落 `~/.dsh/opencli-cdp/`;`probeCdp` 纳入该端口。空闲 N 分钟(建议 10)自动退出并清理 user-data-dir。参照竞品 v0.4.14 同款载体〔研究输入〕。
- 端口分配避开 `CDP_PORTS`(9222/9234/9236/9238,上游 launcher 同源,`src/index.ts:1452-1453`),防止与 daemon 未来拉起的扩展宿 Chrome 抢端口。
- **替代方案讨论:**
  - 复用 daemon 拉起的 Chrome 的 CDP?否决:无扩展时 daemon 根本不会拉起 Chrome(通道C 链路),无端点可复用;`browser-cdp` RPC 现有提示语即此逻辑(`src/index.ts:1481`)。
  - attach 用户日常 Chrome?那是 §6 的高危可选项,绝不作为自动降级目标。
  - 连遗留 headless Edge(研究实测 9339 那台)?只能探测顺带命中,不作为设计依赖(进程随时会死)。

## 3. 路由矩阵(核心)

**两条硬不变量,先于一切路由:**
1. **写命令绝不降级。** 降级通道B理论可写(匿名表单提交),但写命令的语义是"在你的登录态浏览器里真实执行"(`src/index.ts:1930` 审批门文案原文),匿名态下要么失败要么产生无主数据;且写命令的证据包(`src/index.ts:998-1006`)、审批门语境全部锚定在用户身份上。**没有用户身份的写,不是降级,是伪造。**
2. **登录态数据必须真实。** COOKIE 策略命令(实测 573+/1313 文件)无扩展 = 无用户 cookie,结果要么 AUTH_REQUIRED 要么空壳;真实性判定 `verifyResult`(`src/index.ts:1188-1220`,规则层扫登录/风控墙关键词)会照常拦截静默失败——降级模式**不绕过、不放宽**该判定,拿不到真数据就报不可用。

| # | 命令族 × 状态 | 无扩展时行为 | 实现点 |
|---|---|---|---|
| ① | site 命令,browser:false 或无页面步骤 | **直跑(通道A),现状零改动**——这是无扩展时唯一稳定面 | 已通:`tryRun`/`site` 透传(`src/index.ts:1708`/`1005`)。改动仅在文案:目录与 doctor 声明该面可用 |
| ② | site 命令,browser:true,access=read(匿名可读的 PUBLIC 站) | 有扩展:走现状(不经 CDP);无扩展:降级通道B——`probeCdp` 命中端点则在该次 `runSubprocess` 调用(`src/index.ts:2158` 的 spawn spec)注入 `OPENCLI_CDP_ENDPOINT` + argv 追加 `--site-session ephemeral`;未命中端点且懒启动失败 → 按④报不可用 | env 注入点是 `runSubprocess` 组装 argv 处,不动 `runOpencliRaw` 的多形态回落(回落路径同样要带 env,实现时两处都注或收敛到公共出口) |
| ③ | site 命令,browser:true + COOKIE/登录(access 不限) | **报 AUTH 类错误即止**:`src/index.ts:1714` 分类已有,降级模式改引导文案(装扩展 + 说明为何不能降级)。可选高危通道仅一条:用户明示以 `--remote-debugging-port` 启动自己的 Chrome 并指 CDP——全 cookie 对本机进程裸奔〔研究输入:设计文档:69 风险评估〕,面板必须复用既有警告句式"CDP 开放 = 本机进程可控该浏览器"(`src/client.ts:97` 先例) | 文案改造为主 |
| ④ | `browser_*` 交互族(open/state/click/type/fill/extract/screenshot/…) | **不伪造降级,执行前短路**:工具描述(`src/index.ts:445` 等)与 doctor(`:334`)直接引导装扩展。上游架构事实(通道C),非配置问题 | `runBrowserTraced` 前置无扩展检查(读 daemonStatus 缓存),把注定失败的 daemon 往返换成一次性清晰报错,顺带省一次 60s 默认超时 |
| ⑤ | `chrome_*` 族 | 仅扩展 ≥1.0.25;现状已有升级指引(`src/index.ts:825-826`),无扩展时同样短路引导装扩展 | 同④ |
| ⑥ | 定时任务(schedule/watch) | 无扩展期间:①类照跑;③类每 tick 报 AUTH 失败,计入既有 retry 退避(state 字段已备,`src/index.ts:79`),面板提示"该任务依赖登录态,装扩展后自动恢复" | `runSiteCommand` 失败分类透传 |
| ⑦ | benchmark / canary | 降级状态自动换 PUBLIC-only 命令集(默认集 `DEFAULT_BENCH` 五站全部无需登录,`src/benchmark.ts:10`,实测口径同源);canary 报告标注"无扩展轮" | `benchmarkRun` 入口按扩展状态选集 |
| — | 登录态边界(横切) | 无扩展 = 无用户 cookie:`browser_open` 的"登录态天然可用"承诺(`src/index.ts:445`)失效。诚实边界一句话:**"PUBLIC 只读目录 + 干净浏览器上的匿名浏览";写操作与个人数据一律出局** | 目录文本固定声明(§2.2-3) |

**通道B 的能力窄化(如实进矩阵脚注):** CDP 模式无 tab 管理(上游/`browser/cdp.js:449-454`),连上即自动注入 stealth JS(上游/`browser/cdp.js:67`)——上游行为,插件不增删,文档记录。与 `OPENCLI_SITE_SLOTS` 互斥(上游/`execution.js:189-192`):本插件从不设置 SITE_SLOTS,无冲突,写进测试防回归。

**每命令路由的判据来源(§2.1):** 目录 `access`(零成本)→ 命令级 `browser` 字段(`--help -f json`,带 TTL 缓存,成本一次子进程)→ 运行时失败分类(1713-1715 兜底)。三级都查不到时按保守侧处理(browser 视为 true、access 视为 write),与审批门 unknown-按写 的安全默认同构(`src/parsers.ts:131` 注释、`src/index.ts:1931`)。

## 4. 安全边界

1. **降级 = 匿名会话,这是安全收敛不是放宽。** 通道B强制 `--site-session ephemeral`:干净上下文、独立 user-data-dir、用完即焚;无用户 cookie、无个人数据暴露面。降级模式新增的所有执行路径都**不接触**用户登录态。
2. **与审批门的关系:零语义变化。** 审批门是 `tools/pre-execute` 钩子(`src/index.ts:1902`),按工具名+目录 access 判定,与底层走哪条通道无关。通道B 的注入点在 `runSubprocess` 的 argv/env 组装层(`src/index.ts:2158`),**不新增工具、不新增 pre-execute 豁免、不改 `approvalDecision`**。不变量套件(`tests/approval-invariant.test.ts:1-6`:"审批门开启时,任何放行都必须是只读意图")对新通道天然成立——但必须**加用例钉死**,防止未来有人在降级路径上"为了可用性"绕门:
   - 降级模式下 `site <write>` 仍触发 `kind:'ask'`;
   - 通道B 注入不改变命令的 exitCode/输出语义(注入只加 env 与 flag);
   - `OPENCLI_CDP_ENDPOINT` 永不指向用户日常 Chrome,除非用户明示配置(③的可选项);
   - 插件进程环境不残留注入的 env(每次 spawn 独立 spec,不写 `process.env`)。
3. **真实性判定是降级模式的生命线。** 匿名会话拿到登录墙/风控页的概率高于登录态会话;`verifyResult`(`src/index.ts:1188`)的规则层 + noul 兜底在降级路径**照跑且不降阈值**。exit 0 但内容无效 → ⚠ 标注/拦截,与现状一致(`src/index.ts:1720-1722`)。
4. **高危可选项(③)的围栏:** 用户自启调试端口指 CDP 时,面板必须展示既有警告句式(`src/client.ts:97`),且该配置**不持久化、不进目录文本**,只在当次会话生效;`probeCdp` 不会主动扫到它之外再扩散(候选端口表收敛在常量 + env,`src/index.ts:1452-1462`)。
5. **不做 cookie 移植**(竞品 H 的 `browser_auth` 路线):CDP `Storage.getCookies/setCookies` 搬运登录态 = 把用户全部 cookie 暴露给自动化管道〔研究输入:设计文档:69 风险评估〕。这是安全红线,进 §8 不做清单。

## 5. 失败与升级体验

- **失败文案三件套(每族统一格式):缺什么 / 装什么 / 装完会发生什么。** 例(④族):"`browser_open` 需要 OpenCLI 扩展(当前未检测到)。装法:Releases 下载 zip → Chrome 扩展页开发者模式加载(同 `src/index.ts:335` 指引)。装好后本工具立即可用,无需重启 dsh。"复用 1713-1715 的分类骨架,替换降级语境下的引导语。
- **无缝切回是架构自然结果,不是新功能:** 探测是每命令级的(§1 决策),扩展装上并重连后 `daemonStatus.extension` 翻绿,下一次 `site` 调用即回①/②的现状路径(有扩展时通道B 不介入——注入条件显式含"扩展未连"),`browser_*` 短路解除。**没有模式切换、没有迁移、没有残留状态**。headless Chrome 因端口让位逻辑(§2.3)不会与新链路打架。
- **降级期的可观测性不降级:** 通道B 执行的 site 命令照常进 `recordTrace`/审计(`src/index.ts:1006` evidence、`recordAudit` :1932);trace 行建议加 `via: 'cdp'` 标记,复盘时能区分"扩展路径结果"与"匿名 CDP 结果"——两者真实性口径不同(§4-3)。
- **升级后首验:** doctor/向导全绿时提示跑 `benchmark`(默认集无需登录,`src/index.ts:359` 描述语已如此定位),一条命令确认可用面恢复。

## 6. MVP 裁剪(最小可用集)

**P0(发布即有的诚实面):**
1. doctor + 首启向导 + systemPrompt 目录:无扩展时声明"通道A可跑、④⑤不可用、⑥边界"(纯文案,零路由改动);
2. 通道②的路由:无扩展 + browser:true + access=read + `probeCdp` 命中 → 注入 CDP env + `--site-session ephemeral`(`src/index.ts:2158` 一处);
3. ③类 AUTH 错误的降级引导文案;
4. ④⑤执行前短路(省 60s 超时);
5. 不变量套件新增 §4-2 四条用例。

**P1(体验补全):** headless Chrome 懒启动/回收(§2.3);命令级 `browser` 字段 TTL 缓存;benchmark/canary 降级选集;trace `via:'cdp'` 标记;定时任务⑥的面板提示。

**P2(正向增强,非必需):** PUBLIC 站静态正向清单(SITE_HEALTH 同款手工地图,只提示不门控);官方 dsh-browser-use attach 上线后,`probeCdp`/`browser-cdp` RPC 即其 endpoint 供给方(路线图主线C既定方向,`docs/OPENCLI-ROADMAP-20260922.md` "CDP 探测 + browser_cdp RPC 已完成"),与 opencli 扩展解耦。

**明确不在 MVP:** 通道E(ctx.web 兜底)集成——与 opencli 目录无交集时才有价值,先文档记录;用户自启 Chrome 指CDP(③可选项)——文档写清做法与风险,不做引导 UI。

## 7. 开放问题

1. `runSubprocess` env 注入的落点:spawn spec 是否支持 `env` 字段需按 dsh-subprocess 0.2.0 实际 shape 确认(`SubprocessSeam` 最小形状 `src/index.ts:87-95` 目前只取了 argv/stdio);若不支持,备选是 shell 回落路径的 spec 带 env(`src/index.ts:2238`)或收敛到 `runOpencliRaw` 出口统一注入。实现前必须实测定案。
2. ephemeral 会话语法在 CLI 1.x 是否存在(`--site-session` 是 2.0 语法;1.x 需查 `OPENCLI_SITE_SESSION` env 等价物)——P0 范围限定 2.0 宿主,1.x 维持①/④现状。
3. 命令级 `--help -f json` 探测的成本:一次子进程 ~200ms 级,缓存 TTL 建议对齐 `ADAPTER_TTL_MS`(60min,`src/index.ts:70`)。
4. 通道B 对风控敏感站(stealth 注入是否够)的真实成功率,用 P1 的 benchmark 降级选集实测后再在目录文案里给出量化声明,不预写。

## 8. 不做清单

1. **不伪造 browser_*/chrome_* 降级。** 上游是 CLI→daemon→扩展单链(上游/`daemon.js:1-5`),无 CDP 分支;任何"用通道B模拟 browser_state"的方案都是在错误的层(适配器 vs 交互原语)造第二套语义,且直接撞上 tab 管理缺失(上游/`browser/cdp.js:449-454`)。
2. **不做 CDP cookie 移植 / 匿名写命令。** §3 两条硬不变量 + §4-5 红线。
3. **不打包、不捆绑、不代装 Chrome/扩展。** anweat 把 OpenCLI 打包为本地依赖是重打包反面教材(`docs/PM-RESEARCH-20261003.md` 赛道表);扩展安装必须人在浏览器点一次(现行 doctor 文案已如此,`src/index.ts:335`)。
4. **不打补丁宿主桌面安装**(竞品 G/H 的 install.mjs 路线):修改用户宿主 = 升级即碎 + 越权,通道G因此整体出局。
5. **不给 daemon 加 CDP 分支 / 不 fork 上游。** 等上游;插件侧只消费已公开的 env 契约(`OPENCLI_CDP_ENDPOINT`/`OPENCLI_CDP_TARGET`)。
6. **不把降级做成全局模式开关**(§1 已论证)。
7. **不做"匿名重试"写命令**或任何以可用性换真实性的兜底。
