## 0.1.7 — 2026-11-20

### 一键巡圈(社媒雷达)
- **面板一键巡圈卡**:自动化页新「一键巡圈」——串行采集默认社媒面 8 条只读命令(B站/微博/知乎/小红书/V2EX/掘金:热榜+关注流),逐站状态与结果就地渲染成简报、一键复制;清单刻意避开全部已知坏点(小红书 search 上游坏走 feed 替代、reddit .json 封锁整站不入列)
- **SKILL.md 社媒配方**:agent 深度版巡圈(3 个 site_batch 并行 + 交叉热点分析——≥2 站同时出现的议题单独提出)+ 按对象类型的追更配方(B站免 id 关注流路线/微博 start-end 水位线增量/twitter device-follow 聚合/知乎逐人拉)+ 可选联动(kb_note 沉淀知识库、notify 推送)

### 任务健康面
- **成功率可见**:任务条目新增 stats(真实 run 成功/失败累计与统计起点;预检跳过不计),面板任务行显示成功率 chip(≥3 次才显示,样本太小不虚报)
- **连败可见**:面板任务行按运行史头部连续失败(跳过不计)显示连败徽章(≥2 次),提示检查登录态或暂停
- **建任务坏站预警**:schedule-add 当场核对站点知识(上游 degraded/unsupported + 已知坑条数),结果带 warning、任务行带健康快照——「这站上游正坏着」在创建那一刻就说清楚,而不是等任务连败后自己发现

### 效率账单(情绪价值)
- **自动化页效率账单卡**:N 个任务、累计成功采集 M 次、按人工逐一刷新约 3 分钟/次折算已省时长(估算口径如实标注)、失败与连败计数——「定时采集到底替你省了多少事」第一次有处可见

## 0.1.6 — 2026-11-19

### 调度补跑
- **环境跳过自动补跑(catch-up)**:定时任务因浏览器扩展未连接/daemon 未运行/登录墙被 ⏸ 跳过时挂当日债,当日环境恢复后自动补跑一次——此前错过的采集直接丢失(0.1.4 服役实证:单日 3 任务全 ⏸ 跳过,清晨 07:00/08:30 的点浏览器未开)。有界:距跳过 4h 窗口内(`DSH_OPENCLI_CATCHUP_WINDOW_MIN`,默认 240;0=禁)、每 30 分钟一试(`DSH_OPENCLI_CATCHUP_EVERY_MIN`,默认 30)、至多 16 次,`DSH_OPENCLI_CATCHUP_WINDOW_MIN`/`DSH_OPENCLI_CATCHUP_EVERY_MIN` 任一配 0 即整体禁用并清债,熔断窗内整体静默(系统面故障期补跑必然失败还可能二次开窗);`DSH_OPENCLI_CATCHUP_DISABLE=1` 全局关。补跑行带 🔄 前缀并发 `schedule-catchup` 事件(仅成功发;失败由 schedule-failed 覆盖,遭熔断短路时只有 ⚡ 短路行——不双发);成功/命令级失败即清债,补跑再跳过续债计数,换日作废;面板手动轮不挂债;补跑计数写进跳过行文本(「补跑尝试 N」),日账条目带 catchup typed 标记
- **CLI 共存诊断(#2761 现实化)**:status RPC 在「插件 CLI major ≠ daemon major」(互杀实证)或「近 7 天 daemon 版本翻转」(事件史统计,辅证)时携带 coexist 字段——其余省键零噪音;面板渲染共存提示卡:两侧版本对照、7 天翻转次数、两条建议(退出/升级 OpenCLIApp;或系统级钉定)+ 钉定命令复制按钮,**只复制不执行**(升级/退出是你的显式决策)

### 质量
- **收件箱轨迹空态**(复核 L15):展开详情的轨迹表在 RPC 成功但 ±2 分钟窗口过滤出 0 行时补空态文案(此前表头下空洞)
- **测试失败归档**(复核 L5 条件收):新增 vitest 失败归档 reporter——有失败的轮次自动追加 `.qa/test-failures.jsonl`(用例文件/全名/耗时/错误消息头,5MB 轮转 .1),绿轮零开销零文件,低频 flake 事后可归因;归档 IO 失败如实报错不反噬测试轮(退出码不变);gitignore 兜底不入库

## 0.1.5 — 2026-11-18

### 归因与早报打磨
- **熔断归因判定升级**:canary 结论从「通过率分档」升级为逐站失败签名分类计数——失败按签名归入 daemon/环境/登录态/站点面/选站缺陷五类,「系统面」仅在 daemon 类新失败主导时判定;持续失败站(基线同败)不参与系统面投票;环境类(超时/扩展未连)单独成档不稀释占比;结论附逐站证据行,可人工复核(修前 3/3 自然运行把环境态主导全误判成「系统面」)
- **连败计数跨跳过日**:任务被健康/登录预检跳过的日子不再掐断「连续第 N 日」链——跳过日恰与链尾衔接时前移链尾,在线计数与重启重建两条路径口径一致(修前同段历史在线算 1 日、重启重建算 2 日,标注凭空变大)
- **早报结算时点可配**:`DSH_OPENCLI_DIGEST_AT=HH:MM` 把装配+发送推迟到当日该本地时点(账页仍在午夜翻转时先行翻新,数据完整性不变;缺省=午夜翻转即结算,行为不变)
- **跳过分账**:健康/登录预检跳过不再计入失败——仅跳过无失败的任务单独成 ⏸ 行,混合任务的跳过数并入该任务失败行(修前跳过被计成失败夸大故障面,11-16 早报实证 3 skip 计成「3 失败」)
- **失败/跳过双行合并**:同任务失败行与跳过行并存折成一行,早报行数与总览计数对齐
- **账目缺口收紧**:「账目自 HH:MM 起」注记仅在可证缺失时写(调度应跑未入账>0,或进程当日启动),普通整日运行不再产日常噪音
- **归档口径修正**:早报归档行改中性「N 条已归档」并拆分自动归档/手动归档计数——手动归档非空产出 run 时不再与「空产出已归档」宣称漂移
- **日结旁路留痕**:早报装配顶层 catch 从静默吞一切改为异常留痕进事件台账(截 160 字),留痕自身再包一层防护不反噬调度主链——早报无声消失从此可排查

### 可见性档位
- **任务四态可见性**:`schedule add` 新增 `visibility` 字段(四值闭集校验,`off`/空串清除;同 site+cron 重复添加为更新语义)——`always-visible`(默认,现行为零变化)/`archive-on-success`(成功 run 自动归档,失败照常现身)/`notify-on-failure`(仅失败推送,命中/变化也不推)/`quiet-unless-actionable`(无失败/命中/变化时自动归档不打扰);归档无损(条目沉底仍可点开回看),早报「已归档」计数可见
- **三面接线**:RPC schedule-add、ctl `--visibility`、面板创建表单下拉与任务行徽标;SKILL.md 同步

### MCP ops 面
- **ops 只读三工具转正(默认不注册)**:events_get / schedules_get / inbox_list 经 env `DSH_OPENCLI_MCP_CAPS=ops`(或 all)显式开启后注册——默认仍只注册 knowledge 三件套;tools/call 未开启时如实报未注册并给开法指引;「任务结果与运行史跨会话读取」的第三方消费占位(#12632 类诉求)自此兑现

### 质量
- **凭据卫生组合路径补洞**:bark/ntfy/telegram「URL 带凭据+显式字段同给」的组合不再整条跳过拆解——显式字段优先保留,URL 一律以无凭据 base 落盘(修前组合路径是「无凭据形态落盘」承诺的例外洞);幂等与无 bot 段 URL 不误伤均有回归测试
- **ctl 旗标映射测试补齐**:schedule add 新旗标 CLI→意图映射层测试(pushover 单边退码、ntfy topic 与 URL 拆解互斥等)
- **兜底域名源服务级单测入库**:漂移兜底三级域名链(adapterList domain → 上游包 manifest 权威 → 在册缺域名站名推测)逐级覆盖;推测域名逐处标注、web 通用命令不推测如实拒绝
- **演练报告卫生**:兜底演练脚本的报告脱敏从「SCRUB_RULES 四条真子集」改为直接引用真实规则函数(修前可泄非 URL 形凭据);环境不支持时演练如实退码、不静默降级;两端均有测试钉住
- **知识卡更新**:2026-11 上游损坏潮 14 线程全量入库(小红书 ai-layout 改版三形态、reddit .json 全封锁、linkedin job-detail、instagram search/profile 退役、zlibrary 镜像漂移、hltv 解析、淘宝写路径反例、browser 原语无视 CDP 端点的全局坑)——站点漂移对号入座不再烧重试预算

## 0.1.4 — 2026-11-16

### 通知通道
- **新增 push 类通道**:Bark(iOS/自host,POST /push,凭据只在请求体)、ntfy(自host 首选,topic 进请求体+Bearer 头)、Pushover(token/user 走请求体)——凭据一律不进请求 URL;Telegram 升级:429 限流读 retry_after 有界退避、可选 HTTPS 代理、可选 parse_mode
- **webhook 模板化**:{{title}}/{{body}}/{{ok}}/{{site}}/{{source}}/{{watchHits}}/{{at}} 值级 JSON 安全注入,渲染后校验非法 JSON 拒发(不静默回退);仅 generic webhook 生效
- **凭据卫生**:URL 内嵌凭据(如 https://api.day.app/<key>)入库时自动拆解为独立字段并以无凭据形态落盘;面板回显遮蔽中间段;错误文案不回显凭据

### 日报与归因
- **定时任务早报**:每日结算一张聚合卡(标题+首行总览计数+失败段/🔔watch 命中/📊变化/✓例行+尾行回执口径),同时落盘 ~/.dsh/opencli-reports/digest-<日期>.md|.json(各留 30 份);失败不静默;同签名连败折叠为「连续第 N 日」;quietHours 窗内顺延出窗补发;DSH_OPENCLI_DIGEST_DISABLE=1 可关
- **熔断自动归因**:系统级熔断开窗后自动单跑一次 canary 巡检,把「系统面 or 站点面 or 无法定论」结论写进 circuit-attribution 事件与早报失败段(启发式判定,非裁决)
- **连败降噪**:同签名失败按日历日计数(有界),失败推送带「连续第 N 日」,成功清零,重启从运行史重建

### MCP 读面
- **knowledge_list 过滤与分页**:status/domain/query/limit 参数+游标(nextCursor),默认页 50、上限 500——不再默认全量拉 171 站
- **新工具 knowledge_search(query)**:模糊查站名/域名/命令名/已知坑,档位排序返回站点摘要(补齐知识类 server 标准读面三件套:全量读/检索/按名取)
- **规范补全**:三工具附 outputSchema 与完整只读注解(idempotent/openWorld/destructive hint+title);knowledge_get 附 resource_link(目录内站);401 带 WWW-Authenticate;Host/Origin 校验(DNS 重绑定防护,后缀伪装不命中);MCP-Protocol-Version 头校验(不认识→400,初始化握手不验)

### 质量
- **收件箱(结果收件箱)**:run 级「已读/归档」语义——面板自动化页新收件箱卡(展开详情即标已读、全部标已读、单条归档、一键归档已读),归档无损降级(条目沉底仍可点开只读);无产出运行(ok 且空产出且无变化且无 watch 命中且非跳过)自动归档并在早报尾行计数;ctl schedule read/archive;收件箱回执文件轮转上限 100
- **旗舰行为回归测试入库**:熔断开窗/短路、翻转自愈、governor 并发收紧、schedMarkers 有界、收件箱重入守卫、自检撞名鉴别、shell 数组形态与转义——14 用例 109 断言从一次性脚本固化为仓库测试
- **四条语义修**:认证预检跳过行回执 stop_reason 归 null(命令未执行不再标 error);自愈退避窗内不再覆写 daemon 版本基线(退避过后同翻转仍可识别);notify=false 的任务也记录失败并参与熔断开窗(诊断面与通知面解耦);定时链路权限未知命令按写轨限频(与审批门同口径)
- **兜底域名源修复**:漂移兜底的域名解析改由 CLI manifest 权威源提供(本机已装 OpenCLI 包内的权威站点清单,171 站中 164 站带域名)——此前适配器运行时清单不含域名,任何站点的漂移兜底都必然失败(「适配器清单无域名」结构性缺陷,0.1.4 验收演练暴露;该缺陷自 0.1.3 承诺漂移兜底起在 CLI 2.0.x 下即存在,本版随 0.1.4 一并修复);清单在册但缺域名的 7 站中,6 个 HTTP 直连类站按 `<站名>.com` 推测并逐处标注「推测域名」;web(通用 read 命令,非站点)不推测、如实拒绝;manifest 整体不可用时如实报失败原因、不猜测域名

## 0.1.3 — 2026-11-11

### 无人值守采集
- **任务自愈与系统级熔断**:daemon 版本翻转或执行期断连时,健康预检单次自动 `daemon restart` 后重探重跑(退避窗防循环,默认 10 分钟);同签名系统级失败(daemon 断连/文件系权限类)在首个任务暴露后开熔断窗(默认 30 分钟),窗内其余任务首败即单行短路、不再逐任务刷屏重试——1 条诊断 + 全任务熔断到修复;两者均记入事件台账(`daemon-selfheal` / `circuit-open`),canary 巡检可区分站点面漂移与系统面故障
- **事件历史持久化**:watch 命中 / 适配器漂移与兜底 / daemon 翻转 / 熔断 / 自愈等通知事件追加写入
  `~/.dsh/opencli-events.jsonl`(超 5MB 轮转为 .1,与运行轨迹同款预算),新增 events-get RPC 跨会话读回;
  面板「自动化」页新增「事件历史」卡——重启 dsh 后仍可回看(此前只有内存里最近 30 条)
- **采集回执深化**:receipt 新增 typed 口径 `partial`(分页未尽,对齐上游 #2766 的分页提示)与 `unloaded`
  (上游 typed 失败码 COUNTS_NOT_LOADED 直接采信,对齐 #2708「未载≠0」;成功输出零条目且含加载中/骨架标记时
  近似判定;无正向证据不标注);失败回执带上游 typed 失败码 `error_code`(如 AUTH_REQUIRED / COUNTS_NOT_LOADED
  / SECURITY_BLOCK,此前这类失败只能记为 unknown);新增 coverage 字段
  `stop_reason`('end' / 'truncated' / 'error',未知为 null)与 `remaining_cursor`(仅分页提示给出 offset
  时有值,其余为 null)——**插件层近似,上游 #2698 设计落地后对齐字段语义**
- **漂移兜底**:同一任务连续 3 次结果结构突变时,除预警事件外自动经 browser_* 原语(打开站点首页 + 读取
  页面状态)兜底采集,数据并入当次快照、回执标 `degraded`(页面状态级近似,不是适配器结构化输出);
  兜底也失败则如实记录原因,不伪造数据;指定了浏览器 profile 的任务不兜底(兜底不按 profile 路由,
  不用默认档案的另一个账号顶替采集)
- **多账号登录态隔离**:定时任务新增 `profile` 字段(面板 / ctl `--profile` / 收件箱),经 `OPENCLI_PROFILE`
  透传给 OpenCLI——上游 2.0.3 原生按浏览器 profile 路由,不同 profile 即不同 Chrome 档案,cookie/存储各自
  独立;该 profile 未连接时任务如实失败,不回落到别的账号;回执标注所用 profile
- **拟人限速补完(#59)**:读写分频——写命令(权限未知的按写)走独立限频轨,默认间隔 3s,与读命令的 750ms
  礼貌间隔互不占用;装饰性步骤(只改视觉的 scroll/hover)在运行轨迹与 trace_replay 时间线标注〔装饰〕,
  录制回放可勾选跳过,数据读写步骤照常执行

### 回执与轨迹卫生
- **URL 敏感参数默认脱敏**:token / access_token / code / sid / sig / secret 等查询参数的值,在运行轨迹(含
  trace_replay 时间线)、快照、history 摘要、采集报告与推送正文中替换为 `[已脱敏]`(参数名保留)
- **推送卡带任务身份**:正文新增「任务:<命令> · 来源 <agent/chat/panel/ctl>」行
- **超时「取消 + 有界清理」**:到点取消执行,子进程 5s 宽限内仍未退出则停止等待,返回 exit 124
  (dsh 0.2.0+ 的子进程通道;0.1.x 宿主的 shell 回落路径沿用宿主自身的超时处理)
- **留存预算与滚动淘汰**:快照按任务可配 `keep`(默认 50 份,5-500);运行轨迹文件默认保留 30 份
  (`DSH_OPENCLI_TRACE_KEEP_FILES` 可调)
- **重试退避写成任务级字段** `backoffMs`(默认 15s;撞登录/风控墙维持 ≥120s 下限)

### 面板外接入(MCP)
- **MCP Streamable-HTTP 端点(自host)**:插件随 dsh 面板进程起一个本机端点(默认 `127.0.0.1:19831`,Bearer token 认证,发现文件 `~/.dsh/opencli-mcp-auth.json`,停机即删)——dsh 之外的 agent/脚本经 MCP 三步(initialize → tools/list → tools/call)只读读取站点知识卡(`knowledge_list` / `knowledge_get`),无写面;批请求上限 20 条,超出逐条回错;客户端声明未支持的协议版本时钳回服务端版本(不假兼容)

### 质量门禁
- **知识卡漂移门禁**:测试启动前先比对 `knowledge/*.json` 与本机 OpenCLI CLI 的 manifest(2.0.3:171 站 /
  1225 命令)——卡片站点已被上游移除、标「不支持」的站点已有适配器、新站缺卡、站点/命令数低于对外
  「170+ / 1200+」口径,任一即整轮失败(未安装 CLI 的环境跳过并提示);新增拼多多(pinduoduo)知识卡

## 未竟与已知问题(Known issues)

> 常设段(自 0.1.3 起建制):集中如实记录当前仍未完成、或受上游限制无法在插件侧根治的事项,
> 每项注明状态;补完后随对应版本更新本段。此前唯一的「未竟」记录散落在 0.1.2 段的如实降格行里。

- **上游 daemon 版本互杀**:OpenCLIApp 内置的旧版 daemon(1.8.6)与全局 CLI 2.0.x 会相互替换 daemon,
  导致扩展连接反复掉线。上游 CLI 侧已于 2.0.3 修复,App 内置侧上游仍未修(上游 #2761 截至
  2026-11-10 仍 open)。状态:上游未根治;本插件 0.1.2 起如实报告翻转,0.1.3 起检测到翻转/执行期断连自动单次 restart 重探重跑(实测无人值守场景自愈成功,daemon 收敛到 CLI 版本)
- **站点适配器随站点改版漂移**:属上游适配器层的持续性问题。状态:插件侧对同一任务连续 3 次结构
  突变发出预警(0.1.2 起);0.1.3 开发线增加 browser_* 兜底采集(页面状态级近似,回执标 `degraded`,
  不是适配器结构化输出)。

## 0.1.2 — 2026-11-06

> 无人值守可靠性 2.0 + 插件健康可视化(双主题,需求来自 2026-11-05 对上游动向、宿主生态、用户反馈与同类插件的量化信号整理)。
> 单元测试 503/503 通过;发布前集中修复 10 项缺陷(见下文「发布前修正」)。

### 主题一:无人值守可靠性 2.0
- **拟人限速(如实表述:首跑随机延迟)**:定时任务首跑前随机延迟 15-90s 打散 cron 指纹
  (任务级可关);挑战自解等待:验证码类失败赠一次尝试等 45s 自解(#59 方向/#2045 同款)。
  #59 的装饰性操作与读写分频当时未做,于 0.1.3 补完(见 0.1.3 段「拟人限速补完」;未竟项集中记录见
  「未竟与已知问题」段)
- **采集回执 🧾**:receipt{auth_state, items, bytes, empty, truncated} 进 history/快照/推送——
  对齐上游 missing≠zero 语义;裸 '[]'(#2708 canonical 空)不再判死重试,由 empty 标注;
  截断启发(上限 95%)标 truncated(#2698)
- **任务健康预检+断线恢复**:每 tick 前四合一(daemon 探测/自动拉起/版本翻转检测 #2761/
  扩展断连跳过);fail-open 纪律(预检自身故障不放行变成任务死因;restart 仅在明确未运行时
  动手,CLI 半坏环境 fail-open 不跳过)
- **认证预检**:任务级 preflight 复用 loginCheck TTL 缓存——未登录 ⏸ 跳过并按 auth_wall 记
  回执(#1882/#2568)
- **适配器漂移预警**:快照 diff 反向故障发现——同站连续 3 次结构突变(迁移/状态双口径)→
  预警事件建议 browser_* 兜底(xhs 灰度 5 连报的插件层解法)

### 主题二:插件健康可视化
- **插件自检卡**:安全 tab 顶部——工具注册逐个点名/入口三项在线(panel/ctl/daemon)/宿主匹配;
  #9308 式"装上没效果"3 秒可见(同一问题见于 #9308/#9261/awesome#2582/BrowserSkill#554 多处反馈)
- **更新绕行**:npm dist-tag 对比,有新版给一键复制升级命令——绝不自动执行(#10869/#6971)

### 增量改进
- 定时任务批量管理:全选/批量启停(循环 schedule-toggle)/来源过滤(#10911);选中集修剪、
  过滤切换清空、面板任务自动带 source:panel(发布前修正 6 处交互缺陷)
- 画布证据卡:evidence-get RPC(verdict 三值 blocked>fail>ok)+ before/after 双图并排 +
  shotNote 免责行(补完画布遗留项)

### 发布前修正
- 批量管理修正 6 处缺陷(见上);漂移预警修正结构突变判定口径(单靠迁移判据识别不了结构翻转,
  改为迁移/状态双口径)
- 集中修复 10 项缺陷:ctl `--no-jitter` 放在参数末位时不生效、采集回执缺 truncated 标注、
  健康预检说明误进推送正文、daemon 自动拉起后漏做扩展连接检查、预检自身故障误跳任务、
  fail-open 放行路径补测试,另 4 项细节修正;修复一处测试隔离问题(异常桩经 cordis proxy
  泄漏到其他用例)

### 兼容与验收
- dsh 0.2.2-alpha.3(11-04 起 rc.1 已发待验);OpenCLI CLI/daemon 2.0.2
- 单元测试 503/503(全量)
- **勘误(0.1.3 补记)**:本段原写「前四特性各过专项测试」不准确——截断标注(truncated)与拟人限速
  (jitter)两项当时并无专项单元测试;0.1.3 开发线已补齐这两项的专项测试

## 0.1.1 — 2026-11-04

> **注:该版本号未发布至 npm/GitHub,内容并入 0.1.2 线**(npm 版本列表为 0.0.0-stage / 0.1.0 /
> 0.1.2,GitHub Releases 无 v0.1.1;本段功能随 0.1.2 一并发布,保留本段以记录开发顺序)。

> **版本轨统一**:自本版起 GitHub release 版本号与 npm 一致(此前的 0.4.x 为 GitHub 侧旧版本轨;
> npm 0.1.0 即原 0.4.6 同码,历史条目保留原名不改)。

> 直连铺满 + 场景批:浏览器原语族全量 daemon 直连(实测最高 118x),通知静默时段/级别 UI、
> 七天变化聚合、CSV diff 列、批量派发前登录态快检。486 单元全绿;实测八原语差分基准 8/8
> 形状一致;全功能矩阵 26/26、GUI 九幕 26/26、canvas 7/7(宿主 dsh 0.2.2-alpha.3 + OpenCLI CLI/daemon 2.0.2)。

### A. 直连铺满(全原语族)
- **direct-compose 组合层**:0.4.6 只接了 eval;本期 state/click/scroll/open/screenshot/tab/close 全部直连。上游事实(2.0.2 dist 源码级核对):state/click/scroll 不是 daemon 动作,是 CLI 本地用 JS 串构造器经 exec 组合——本层**运行时装载本机已装 CLI 的构造器模块**(永不内嵌副本,上游改 JS 自动跟上),只复刻薄编排(click=page.click 链:resolve→CDP scrollIntoView→hit-test→CDP 原生点击→el.click 兜底;open=会话捕获启动+navigate+2s 落定+拦截器兜底)
- 纪律:只在成功路径归一 CLI 2.0 信封,任何失败/旗标不认识→CLI 兜底出权威错误(TargetError 的 candidates/hint);页面身份缓存与上游 page.js 同款流转;`DSH_OPENCLI_DIRECT=0` 总闸逃生
- **实测差分基准**(两阶段隔离,session=bench):state **57.8x**(1142→37ms)/ tab list **118.7x** / scroll **57x** / tab new **7.9x** / tab close **8.8x** / screenshot **4.7x** / open 1.9x / click 1.4x;八原语信封形状逐字段一致 8/8
- 步骤截图直连化:每条轨迹都付的热路径(captureStepShot)免 CLI 冷启动

### B. 场景批
- **通知静默时段**:任务级 quietHours(HH:MM-HH:MM,支持跨夜)——窗内通知暂存(上限 20,随任务落盘),出窗首跑合并 😴 摘要段一次推送;解析失败 fail-open;全链:面板表单+任务行预设下拉+schedule-add 幂等更新+inbox 闭集+ctl `--quiet-hours`
- **通知级别 UI**:任务行 notifyLevel 下拉(all/quiet),0.4.6 后端能力首次有面板面
- **七天变化聚合**:变化面板顶部七日条(每日一行 新增/消失/位移);CSV 导出新增 `_diff` 列(diffItemMarks 按身份键逐条标记 new/gone/moved #a→#b,完整无截断——entries 有 20 条上限故单独实现)
- **批量派发前登录态快检**:site_batch 加 `preflight`/`skipNotLoggedIn`——未登录站标 ⚠ 或摘除(⛔),复用 login-check 的 whoami 池+TTL 缓存;默认关(交互式首查 15-45s 不可接受),无人值守显式开

### C. 工程与分发
- OpenCLI CLI/daemon 升级 2.0.2(扩展 1.0.26 对齐);dsh 0.2.2-alpha.3 适配(插件 peer 范围天然放行,唯一断裂=换 scoped 包名时漏改的 cordis.patch.yml,已修)
- npm keywords 补 `deepseek-harness`(自动收录渠道触发词)/`scheduled-watch`/`change-alerting`(生态空白第一叙事);README 中英加包名说明行(无作用域名被占的搜索防守)与「与其他 browser 插件的选型」段(只讲路线不点名)

### 兼容与验收
- dsh 0.2.2-alpha.3(latest 为 0.2.1-rc.5,alpha 为开发线;宿主兼容门实测 includePrerelease 对比运行时主版本,peer `>=0.1.1-rc.2 <0.3.0-0` 天然放行)
- 实测:全功能矩阵 26/26 + GUI 九幕 26/26 + canvas 7/7 + 直连差分基准 8/8;单元 486/486(+32)

## 0.4.6 — 2026-10-30

> 人机协同与引擎大版本:自然语言指挥台 + daemon 直连传输 + 生态接入(任何 dsh 会话一句话驱动插件)。
> 450 测试全绿;GUI 逐项界面检查通过(真实浏览器);直连延迟实测(同命令 87ms vs CLI 1040ms,12×)。

### 自然语言指挥台(总览主行动)
- **nl-intent**:一句话 → 闭集意图(经宿主 ctx.llm;路由候选=默认选择+已注册 provider 轮试,每条先解析适配器默认模型);模型输出必须过 parseIntent 闭集门,**不合法绝不猜测补全**;失败分诊三种(llm 出错/空输出/闭集拒绝+原文头),各带可行动指引
- **预览卡**:映射结果逐字段可改,确认执行走 inbox-intent(与 ctl 同一条 applyIntent 白名单/审计链,改什么都过不了门);命令模式(试试看)完整保留,双模式并存
- 模型额度诚实:映射是显式按钮触发,一次调用;不做后台自动映射

### 生态接入层(面板会话预设限制下的接入路径)
- **dsh-opencli-ctl**(npm bin):schedule add/list/run/remove · notify set/test · report build · status;写白名单意图 JSON 到 `~/.dsh/opencli-inbox/`,插件消费者(3s 轮询+停机清除)执行并回写结果,ctl 默认同步等待拿 JSON——**面板聊天等任何有 shell 的 dsh 会话**一句话即可驱动插件全能力
- 意图安全:闭集校验(八 kind,多余字段拒绝,绝不 eval)/单文件 16KB+队列 200 条上限/claim 占位防并发/processed 轮转 100;每次消费落 ingest 事件(面板时间线可见)
- **SKILL.md 全面重写**:场景路由手册(一句话→动作表/ctl 命令面/工具速查/适配器创作/边界如实),面板与 CLI 会话通吃

### daemon 直连传输
- **direct.ts**:`POST /command` + X-OpenCLI 头,动作族 exec/navigate/tabs/screenshot;能力探测三态(unknown/ready/off),协议形状不认识整层禁用;**永不抛错,任何失败静默回落 CLI**(旁路加速不成为单点)
- eval 族接入 runBrowserTraced:归一 CLI 2.0 信封下游零改动;页面身份缓存(响应 page 持续刷新,stale 类错误清缓存无 page 重试一次)
- **传输对照进基准报告**:CLI 冷启动 vs 直连往返双实测,加速比随每份报告落盘
- 实测:direct-real-test 8/8(导航→discover→像素级 read→click 全走直连);延迟对照 87ms vs 1040ms

### 快照差异推送(盯变化场景深化)
- diffsnap 纯函数:JSON 数组逐条比对(新增/消失/位移≥3 位),包装 {data/items/list/results} 认得,非 JSON 折规模摘要**绝不臆造**;条目身份 id/title/url 优先退化归一文本
- 调度链接入:成功采集自动 diff 上一份快照,📊 snap-diff 事件+推送正文尾接"与上次相比"段;与 watch 🔔 并存

### 通知渠道平台预设
- channels.ts 五平台载荷:飞书/钉钉(加签=timestamp+secret HMAC-SHA256,secret 可钉 URL 发送时拼且不落日志)/企微/Telegram(chat_id 从 query 提取)/generic(0.4.5 信封不变);platformOk 细判 200 体内平台错误码
- WebhookChannel 平台化(URL 推断兜底);面板自动化 tab 通知通道节:平台下拉+URL+保存+**测试按钮**(与 ctl notify test 同链,诚实回报成败)

### 面板设计系统与动效
- 设计 token 层:色板/圆角/阴影/动效时长缓动收进 CSS 变量(此前 97 处散落色值);卡片 hover 浮起/入场 stagger/骨架屏呼吸/运行态呼吸灯,全 transform+opacity 不触重排;**prefers-reduced-motion 全关**(可访问性)

### 工程加固
- 工具输出 schema 真调用一致性测试:全注册表 38 工具逐一登记(只读 OUTPUT_KEYS/写类 EXEMPT),新工具漏登记 CI 直接红——宿主 additionalProperties:false 只在真调用时校验,直调 execute 测不出(同类插件踩过的坑),机器化排雷

### 场景补强(同版重发:从使用场景倒推九缺口)
- **新手引导**:试试看失败(站名拼错)→ 自动带 3 条最接近的真实命令,点击直接跑
- **变化时间线**:任务行「📊 变化」展开,按天看 +新增/-消失/位移(逐相邻快照 diff 聚合)
- **通知级别**:`notifyLevel quiet` 只推命中/变化/失败,高频任务不再例行刷屏(默认 all 不变)
- **CSV 导出**:任务一键导出剪贴板(RFC4180 转义,_at/_site 出处列;非 JSON 输出原文分节);`ctl report export`;
- **来源徽章**:任务行标注 agent/chat/panel/ctl 创建来源;**undo**:按收件箱 stem 撤销误建任务;**backup**:任务+通知配置打包 JSON
- **动态快捷**:每次刷新从站点目录抽 6 个站点示例——170+ 站都被看见

### npm 首发
- `@cold777/dsh-opencli@0.1.0` 发布至 npm(作用域包,与同名竞品以用户名前缀区分);`npm i -g @cold777/dsh-opencli` 即装,自动带 `dsh-opencli-ctl` 命令面;发布包经敏感扫描(本机用户名零残留——运行时正则改拼接构造)

### 兼容与验收
- OpenCLI 2.0 双版本兼容延续;22 项套件 dsh 0.2.1-rc.5 全过
- dsh 面板聊天会话不装载插件 agent 工具属 dsh 预设作用域架构,0.4.6 的 ctl/inbox 生态层即为此提供的接入路径

## 0.4.5 — 2026-10-30

> 数据产品大版本:定时采集 → 真实性判定 → 快照落盘 → 推送通知 → 带出处报告 → 画布回放,闭环全线贯通。
> 399 测试全绿;22 项套件在 dsh 0.2.1-rc.5 全过(宿主版本随套件记录)。

### 推送闭环(新)
- **通知通道层**:Webhook / Email(SMTP)/ dsh 面板三通道并发群发,单通道失败不拖累其他;出口 scrubLocalPaths 清洗(送达载荷实测无本机路径/用户名)
- **watch 命中推送**:关键词命中 → 🔔 正文前缀,与面板事件流同一份命中事实
- 修复:notify 开关原先无效(sch.notify !== false 关闸)与 saveNotifyConfig 双写竞态(统一走 saveState)
- 实测验证:本地接收器收真 POST 11/11;坏 email 通道(SMTP 连拒)容错 6/6,配置测后还原

### 无限画布(新,面板第五 tab)
- 轨迹/写操作证据/定时快照三源聚合为卡片流:拖拽平移、滚轮缩放、点卡展开步骤回放、分页加载
- 时间线=画布的单站趋势视角(快照规模柱状图 + 本站 24h 卡片流)

### canvas VOM 三件套(新,eval 桥)
- canvas_discover/read/click 触达网页内无 DOM 节点的位图画布(图表/游戏/画板);click 为写原语走人工审批
- **canvas_read 位图落盘进画布**(0.4.5 内接通):读到的 PNG 自动挂轨迹 shot 字段 → 画布卡片图片步骤,人可回放 agent 看到了什么;两层 canvas(网页 canvas 元素层 vs 面板复盘层)在工具描述/面板/README 三处说清
- 实测验证:部署包字节级抽取 eval 桥 11/11(含像素级 #d00 采样);真实 daemon 信封喂部署包函数缝合测试 6/6

### 命名空间迁移
- browser_* → opencli_*(上游两次撞名后主动让出 browser_ 前缀);旧名挂弃用别名(描述前置弃用标记,转发新名,计划 2027-04 移除)

### 安全与正确性(发布前修复 7 项)
- HIGH:opencli_run 经 browser eval 绕门第三入口 → 同类拦截
- MEDIUM:notify 开关无效 → 任务级关闸;saveNotifyConfig 双写竞态 → 单一写者;SKILL/catalog 旧名残留 → 全量迁移
- LOW:SMTP socket 泄漏(单步超时+finally 清理);cards/knowledge 注释修正
- 另修 wantRoutine 幽灵注释(宣称的例行开关从未存在于配置模型,注释改为与实现一致)

### 兼容与验收
- OpenCLI 2.0 双版本兼容(信封/--session/分页/daemon JSON/目录形态,按形状嗅探不按版本号)
- 22 项套件在 dsh 0.2.1-rc.5 全过(0.2.1-rc.1→rc.5 无需适配改动)
- dsh 面板聊天会话不装载插件 agent 工具属 dsh 预设作用域架构,已记入 README 安装注意

## 0.4.4 — 2026-10-22

> 正确性/安全/测试真实性/事实核对四个维度共修复 24 项问题;301 测试 + 22 项套件(含宿主版本记录)全绿。

### 安全(2 HIGH 2 MEDIUM + 机检器漏网)
- **opencli_run 写命令绕门(HIGH)**:描述曾宣称"走审批"而 execute 直通——站点形态 argv 现进写审批门(write/未知→ask,浏览器/系统命名空间按 browser_* 边界)
- **site_batch 多站写命令零检查(HIGH)**:整批 fail-closed 拒绝,未知站点仍走拼写提醒
- **canary 防御性只读门(MEDIUM)**:热词伪装写命令夜间无人值守拦截
- **browser_do eval 对齐 userscript-run 门(MEDIUM)**:登录页任意 JS=写原语,进人工审批
- **presubmit 机检器三漏网**:细粒度 PAT(github_pat_)/长 TLD 邮箱/小写路径与行尾内部目录,实证回归

### 正确性
- **零配置过期承诺收回(HIGH)**:通道B(CDP attach)默认关死后,doctor/systemPrompt/面板三处文案同步收回"匿名降级"承诺,skip 文案不再谎称"未探测到端点"(端点在但通道关闭时如实说)
- **parseDaemonStatus 缺字段语义**:extensionConnected 缺失归一为 unknown 而非 not connected——explicitDown 只认显式否定,browser_* 不被一刀切死

### 对外交付体系(2026-10-19 事故)
- **提交前机检器**:隐私(本机身份/路径/会话id/token/邮箱/内部目录)全 FAIL 拦截+数字声明强制溯源+删除事实检测;#8007 真实翻车文本回归(180+×2 与被删前提均被当场抓住)
- **站点数对齐上游 manifest**:180+→170+(注册表维护者 fkysly 纠正,#8007)
- 「录屏回放」全仓正名「轨迹回放」

### 功能补齐
- browser_screenshot 透传 --full-page(上游 2.0 全页截图);browser_do 白名单补 scroll
- canary 漂移巡检三轮实测调试(heredoc 反斜杠吞噬 argv 碎片化/选站 kinds 索引不对齐/seam 冷启动竞态)后可用:top-20 零参热榜命令,漂移对比实证(小红书新失败被准确捕获)

### 测试
- 审批门安全不变量套件:攻击表 20 形态+200 次可复现 fuzz(allow⟹只读)+独立通道+豁免边界;lib 捆绑陈旧守卫(vitest globalSetup,lib 落后 src 即红)
- 301 全绿(180→234→259→264→266→282→290→301);21 项套件+宿主版本记录 22/22

## 0.4.3 — 2026-10-17

> 界面逐项检查发现的五处问题全修 + 登录态真数据链路全线贯通。
> 本版起随 GitHub Release 双资产发布(版本名 + 固定名 dsh-opencli.tgz,注册表浮动地址自动吃到最新)。

### 修复
- **定时行内状态不更新**:立即跑后"上次/计数"整个重试周期(~2.5min)停在旧值——分散刷新 2.5s~240s 覆盖完整重试链;时间线展开期间 15s 轮询
- **行内 verdict 恒亮 ✓**:与时间线红失败行同屏矛盾——空史无符号/有成功绿 ✓/全失败红 ✗
- **时间线卡片溢出裁切**:`.o4-row` 允许换行 + 卡片 `flex:1 1 100%` 独占整行
- **刷新芯片与文字芯片不齐**:`boxSizing:border-box` + 等高 23px
- **占位文字对比度**:`.o4-load` 0.38 → 0.58
- **定时执行不落「运行轨迹」**:`runSiteCommand` 补 `recordTrace`(带 `schedule` 前缀与手动 browser 命令区分),复盘链路闭合

### 验证
- 159/159 测试绿;21 项审查套件全 PASS;**登录态真数据端到端验收通过**:浏览器扩展桥(v1.8.8)→ try-run 真实热榜(SystemOne 判定 P=0.91)→ 登录巡检真实 cookie 诊断 → 定时采集 15s 回填 → 快照落盘 → 时间线渲染 → 带出处报告生成,全程经产品面 RPC
- dsh 0.2.0-rc.2(latest)四接缝(subprocess/mcpResources/网关信封/settings.section)全工作;0.2.1-rc.1 依赖面比对无断裂迹象,stable 后跑回归

### 测试
- trace-get 断言改 browser 子集相对顺序(定时链路写 trace 后绝对首条假设失效);watch 用例新增"定时执行落 trace"回归断言;新增 e2e-real-data.cjs 真数据验收脚本

## 0.4.2 — 2026-10-08

> ⚠️ **升级必读:插件更新后必须重启 dsh daemon 才生效**(长驻进程不热加载插件构建)。

### 新功能
- **轨迹回放**:browser_* 全族命令自动落盘 trace(~/.dsh/opencli-traces,jsonl+5MB 轮转);trace-list/trace-get RPC;**trace_replay 工具**(agent 复盘"上次为什么失败",跨日聚合+本地时区);面板「运行轨迹」卡(红绿状态点/耗时/展开原文)
- **对话内任务预览卡片**:site/site_batch/browser_do 输出结构化渲染(命令块+四态状态色 ✓✗⚠+汇总表+原文围栏,0.2 视觉)
- **报告导出(带出处)**:buildReport 纯渲染层——多站/定时快照合并为 markdown,每节**出处三元组(命令+时间+快照路径)+判定结论**,尾部"数据源与缺口声明"逐条列失败/静默失败/缺席,**零模型介入**;site_batch 自动落盘+report-build RPC+面板「生成报告」按钮
- **站点健康度**:上游 issue 实测数据(小红书/instagram 受损等)驱动命令页徽章+知识卡健康段,受损站自动提示 browser 兜底
- **MCP Resources 知识暴露**:dsh 0.2 ctx.mcpResources seam——opencli://sites/{site}/knowledge 资源;0.1.x 走 knowledge-get RPC 双路径
- **分层命令路由 site_route**:SystemOne 两步 choice(先站后命令,≤24 候选)亚秒出命令行+Top3 概率
- **采集快照+时间线**:定时成功执行存结构化快照(50 份轮转);schedule-history 快照索引;面板时间线趋势柱状图+运行史
- **watch 关键词监控增强**:命中事件总览可见,大小写不敏感
- **SWR 面板缓存 v2**:重开秒显上次数据(损坏缓存全防护:try/catch+结构校验+版本键+12h 过期)
- **知识外移**:pitfalls/健康度独立为 knowledge/*.json 数据文件(知识更新不动代码)

### 样式(0.2 视觉对齐)
- tab 激活态品牌蓝渐变+内描边+顶部高光;卡片渐变表面+顶光+悬浮投影;输入框品牌焦点环;细滚动条;次要文字对比度提升;四档模式对勾语义修复;watch/健康徽章/轨迹卡/时间线全套新组件样式

### 性能
- laya 权重激活期后台预热(冷加载 60s 不再砸首次调用);卡片去 transform 降绘制;目录缓存+快路径

### 可靠性修复(全部经真实环境复核)
- **[HIGH] cron 调度器从不与当前时间比较**——数字合法即每分钟触发,对站点高频轰炸(历史 state 累积 5055 个 marker 实锤);修复+字段越界拒收+逗号列表语义
- **任务 site 前缀剥离**:按面板占位符创建的任务此前 100% 失败(unknown command site)
- **laya noul 放弃阈值判失败**(实测错误文本同样 0.9+,拦截权收归确定性规则层;真数据 0.66-0.77 安全通过)
- **try-run exit≠0 恢复链**:扩展未连/登录缺失/风控墙归类+统一中文指引,不再裸 YAML 46 秒
- **opencli_catalog 过滤参数全失效修复**(query/site 真正生效)
- schedule-add cron 五段校验+越界拒绝;调度 marker 独立 Set 不落盘+loadState 自愈 5055 键
- 7 个 RPC 空 request 守卫;knowledge-export 空 sites 报错;快照时间戳 ISO 还原;EN 站点数动态化
- resolveBin 版本切换免疫(vfox/nvm 多版本目录扫描,活跃版本切走自动找回 opencli)
- 逗号运算符吞行/TimelinePanel 作用域/schedule-history 形参名 三连根因修复(时间线不渲染缺口)

### 工程与文档
- 159 单测(0.4.1 时 74);审查套件 21 项;同类插件生态盘点(官方注册表 4412 条实测);SKILL.md 全工具速查

# 更新日志

格式参考 Keep a Changelog;版本与 GitHub Releases 一一对应。

## 0.4.1 — 2026-10-03
### dsh 0.2.0 适配(双版本兼容:0.1.5 与 0.2.0 同时 20/20)
- **新增 ctx.subprocess 原生执行路径**:0.2.0 把命令执行迁到 subprocess seam(官方 bash 工具同款),旧 ctx.shell.execute 需要沙箱 policy 管线且插件直调不可靠;经 reflect 旁路可选读取(刻意不放 static inject——cordis 对声明服务做加载期解析,0.1.x 宿主没有 subprocess 服务会导致整个插件加载失败)
- 0.1.x 回落路径升级为多形态自探测:resolve包裹/直传/argv数组,锁定首个真实产生输出的形态(异常文本不再被误当有效输出);spec 携带 danger-full-access 沙箱策略(可信进程内消费者,与 0.1.x 无沙箱行为一致)
- 适配事实清单:0.2.0 强制校验插件 peerDependencies(我们的宽范围 >=0.1.1-rc.2 <0.3.0-0 过闸,写死 ^0.1.x 的插件被拒载);0.2.0 对 patch 引用未安装 bundle 的 profile **静默退出**(0.1.5 容忍)——升级前自查 cordis.patch.yml;0.1.7+ 定时任务默认关闭(与我们无关,定时是自带实现)
- 审查套件健康检查改环境自适应(健康态"一切正常"/降级态"daemon 未运行"两态都算渲染成功)
- 验收:0.2.0-rc.2 全套 RPC+面板四 tab+179 知识卡导出 20/20;0.1.5-rc.1 回归 20/20;74 单测绿

### Agent 发现性与 1.8.8 跟进
- **SKILL.md 全工具速查表**:site/site_knowledge/site_batch/browser 原语/so_verify/so_pick 各自的使用时机 + 失败自救签名 + 无人值守说明
- **systemPrompt 注入更新**:目录文本新增辅助工具段(site_knowledge 先读/so_verify/so_pick 亚秒判定/site_batch preflight/watch 关键词+风控退避),agent 零配置发现新能力
- **上游 1.8.8 升级完成**(undici CVE 修复;站点 176→180):审查套件全过,插件兼容
- 审查套件 19→**20 项**:新增 knowledge-export RPC 真值(179 张卡实测导出)+ watch 关键词落盘;站点计数改为动态断言(不再钉死 176)
- 修复 knowledge-export 空 args 崩溃:**网关对空 args 传 undefined**,handler 参数必须可选链(实测 gateway/internal 复现)
- dsh017 profile 依赖从 GitHub tarball 切本地 file:tarball(网络不可靠);dsh 0.1.7-alpha.1 兼容实测进行中

### 登录态 preflight + 面板知识卡入口
- **site_batch 登录态 preflight**:派发前按目录 domain 字段检测同域冲突(如 twitter + x 同属 twitter.com),同域站点自动改为组内串行并注明——对冲"同域并行互相踩登录态/标签页且无报错"(BrowserSkill #132,其用户求 preflight 而不得)
- 面板命令页新增「导出知识卡」按钮(knowledge-export RPC,toast 报告导出数量与路径)
- 修复 package.json description 双重编码乱码("登录态浏览器代理"曾显示为"鐧诲綍鎬佹祻…"),dsh-market 拉取的描述曾为乱码;补双语描述+keywords(score 合法抬分项)
- 修复 puppeteer-core 误入 runtime dependencies(构建工具,回 devDependencies,免得跟着插件装进商店)
- 74 测试绿,审查 19/19

### 站点知识包(补上游 #2539 砍掉 sitemap/CLI hub 后的知识分发真空)
- 新增 agent 工具 `site_knowledge <站>`:动手前读"地形图"——该站全部结构化命令(read/write 标记)+已知坑(风控/登录/改版,人工种子覆盖微博/B站/知乎/小红书/豆瓣/淘宝/京东/YouTube 等)+**失败签名恢复表**(EMPTY_RESULT/风控墙/429/NAVIGATION_REJECTED → 含义 → 恢复动作),命中签名按表自救,不现场试错
- 新增 `knowledge-export` RPC:全部/指定站知识卡导出为 markdown 到 `~/.dsh/opencli-knowledge/`,可分享、可进版本库;dsh 0.1.6+ MCP Resources 将复用同一数据源
- 知识三源:opencli 目录(实时)/失败签名表(与执行真实性层同源)/pitfalls 种子(宁缺勿造,未知站为空)
- 依据:browser-use #5841"每次会话从零重学站点"(10 评论正式提案)+ 上游退出知识分发
- README 补「固定命令 × 任意网页原语」双模式呈现(社区帖 t/1225086 反馈的弃用理由);测试 64→72

### 风控感知退避(用户反馈直接驱动)
- 定时任务重试命中登录/风控墙时,重试间隔从 15s 提到 **2 分钟**(软封禁冷却);其他失败维持 15s
- 依据:小红书自动化封号是中文用户最真实恐惧(V2EX 两起封号帖;上游 30 天 3 个 XHS 风控 commit),撞墙后立刻重试等于加重风控信号

### Watch 关键词监控(登录态数据产品)
- 定时任务新增 `watch` 字段(关键词,逗号/空格分隔,≤120 字符):每次采集成功后做确定性匹配,命中任一关键词 → ingest 事件 `watch-hit`(🔔 通知)
- 场景:微博热搜监控"出现'放假安排'就通知"/价格监控/舆情关键词——填 dsh-market 微博插件生态空白(≈0 个专用插件)
- v1 故意用确定性匹配,零误报;noul 模糊"值得关注的变化"判定留 v2(实测 laya 判别力不足,宁缺勿误报)
- 面板:自动化 tab 创建表单新增 watch 输入框;任务行内 🔔 徽章展示监控词
- schedule-add 幂等去重升级:重复 add 更新 watch 字段而非新建僵尸副本

### 执行真实性层(“失败要说真话”)
- 新增 `verifyResult` 两层判定,三处执行面共用:**site_batch**(每站结果标注 实测有效/疑似静默失败,汇总计数;派发前目录预检拼写错误)、**try-run**(面板“试试看”:空结果/风控页/登录墙直接报 ok:false 并给原因,不再假成功)、**定时任务**(规则命中或 noul 强失效按失败重试,可疑只标注)
- 第一层为确定性规则(opencli 失败词汇 EMPTY_RESULT/AUTH_REQUIRED/NAVIGATION_REJECTED + 登录墙/风控关键词 + 错误 JSON),零推理、零延迟
- 第二层 laya noul 兜底判未知形态;**实测:laya 对明显错误文本判别力不足(P≈0.9)**,故只对规则放行的文本做模型判定、可疑仅标注
- 修复:typesafe/laya 两 provider 应答归一化不一致(choice/noul/score → 统一 {type,value,confidence}),此前 laya(默认 provider)下 so_verify/so_pick 运行时读不到结果、整层静默失效
- SystemOne 不可用时全部路径降级为原行为,零功能损失;测试 53→61 全绿

### SystemOne 决策层(亚秒决策,不耗大模型 token)
- 新增 agent 工具 `so_verify`(noul 断言:P(页面符合预期),亚秒)与 `so_pick`(choice:封闭选项集选点,2-30 项,返回 Top3 概率);低置信/不可用时提示回退常规判断,零功能损失
- provider 三选一:**laya**(默认,@receptron/laya 本地 ONNX,免费/离线/隐私,懒加载——未装权重时优雅降级)/ **typesafe**(官方 Jev API,key 取 `TYPESAFE_API_KEY` 或 `~/.dsh/typesafe-key`)/ passthrough
- 构建管线:@receptron/onnxruntime 原生模块标记 external,保持运行时动态导入(插件自带 node_modules 解析)

## 0.4.0 — 2026-09-18

### 面板(四 tab 重排:总览 / 命令 / 自动化 / 安全与设置)
- 品牌 fusion 标(OpenCLI `>_` × DeepSeek 官方鲸)+ Lucide 全套线性图标 + 48 站点官方品牌图标(品牌色圆角块)
- 健康区 hero 化:脉冲状态灯 + 大数字统计(站点/扩展/审计/模式)+ 渐变网格底
- 状态机四态:检测中骨架屏 / 正常 / 依赖缺失(一键修复)/ 错误(内嵌诊断,永不弹窗)
- 命令页:官方站点图标 + 命令徽章(点击复制调用格式)+ 禁用即时收缩目录
- 定时任务:两行布局 + 重试 ×3 + 通知 + 立即跑 + 运行历史圆点 + daemon 离线横幅
- 安全与设置:审批门 hero + 四档模式 + 限流限域清单 + 供应链自证(构建 sha256)+ 登录态桥(Browser Use)+ 版本与更新
- 章节手风琴全部可用(安装引导三步带复制/启动按钮;profile 说明)
- 配色与 dsh 原生融合(采样弹窗真实色:中性锌灰表面 + DeepSeek 蓝 #4D6BFE)
- 中英双语;全组件微交互(hover/focus/入场阶梯动画)

### host
- 新增 `browser-cdp`(探测 daemon Chrome 的 CDP 端点,登录态桥前置)
- 新增 `audit-list`(审批门拦截审计,近 7 天计数 + 最近 20 条)
- 新增 `logs-tail`(日志查看;opencli 未暴露日志文件时降级为诊断快照)
- `settings` 返回构建 sha256 + 审计计数
- 定时失败重试 ×3(15s 间隔)+ 通知事件;修复 `ingest-events` 未声明字段
- `status` 版本解析合并 stderr;健康区不再被 8MB 目录阻塞(后台异步预热)

### 修复
- **Windows:ctx.shell 为 pwsh 执行器**,无扩展 shim 静默不执行——`DSH_OPENCLI_BIN` 必须用 `.cmd`
- `runHistory` 未声明字段导致 scheduleList 崩溃;构造器 loadState 竞态冲掉定时任务
- 面板 12 处 RPC 形参包裹,适配 0.1.5 网关严格校验

## 0.3.8 — 2026-09-17
- 12 处面板 RPC 形参包裹(同上,提前修复部分);全权审查套件 19 项(`full-review.cjs`)

## 0.3.7 — 2026-09-16
- 修复 0.3.6 构建产物缺失:site_batch / 定时运行历史 / browser 门面进入 lib
- `runHistory` 字段声明 + loadState 竞态两处根治
- README 重写;站点品牌图标素材库

## 0.3.6 — 2026-09-15
- 定时任务持久化 + 真执行(dsh.schedule);site_batch 批量采集
- ⚠ 该版构建产物不完整(缺上述功能),建议直接使用 0.3.7+

## 0.3.5 / 0.3.4 — 2026-09-14
- browser 兼容门面(防 inconsistent binding);probeCDP 前置;限流与限域
