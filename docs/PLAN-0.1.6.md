# 0.1.6 施工方案(2026-11-19;预研=docs/RESEARCH-20261118-016.md C0-C6)

> 范围:C1 调度补跑(catch-up)+ C2 CLI 共存缓解 + C5 挂账收尾(L15/L5)。C3 服役观测、C4 通知真机(等用户凭据)、C6 MCP 迁移设计位不在本版;C0 发布链对外动作逐项呈批不占施工。
> 依据锚点全部来自 2026-11-18/19 三路勘察(调度链/共存链/面板与测试基建,行号以当日 src/index.ts 为准)。

## 一、C1 调度补跑(catch-up)

**问题**(预研 §四.1):cron 到点先消费分钟标记(schedMarkers,src/index.ts:4195)再执行;执行前健康预检跳过(src/index.ts:4665-4679,扩展未连/daemon 未运行)或登录预检跳过(src/index.ts:4723-4746)后,该次采集直接丢失——digest-2026-11-16 实证 3 任务全 ⏸、schedule-skipped ×11 为事件之首。现行为只恢复未来 tick,不补历史。

**语义**(一个字段承载,不加任务级旗标——0.1.5 C5「零使用旗标」教训):

- 条目新增 `pendingCatchup?: { forDay: string; skippedAt: string; reason: 'environment' | 'auth-wall'; attempts: number; lastAttemptAt?: string }`(单槽,saveState 自动落盘)。
- **挂债**:两个 skip 点写 `pendingCatchup`(forDay=今日;env/登录墙分类;attempts=0)。
- **补跑判定** `catchupCheck(now)`:挂进 tick 循环(cron 分支后、dailyDigestCheck 前,同款「跟随 tick 不新增 timer」)。对每个 enabled 且有当日挂债的任务,满足全部条件才发起:
  1. `DSH_OPENCLI_CATCHUP_DISABLE !== '1'`;
  2. 窗口内:距 skippedAt < `DSH_OPENCLI_CATCHUP_WINDOW_MIN`(默认 240 分钟,0=禁);
  3. 间隔够:距 lastAttemptAt ≥ `DSH_OPENCLI_CATCHUP_EVERY_MIN`(默认 30 分钟)——补跑探测不是免费的,每分钟探测烧预检;
  4. 次数有界:attempts < 16(硬帽,防窗口/间隔被配坏);
  5. 熔断窗不活跃:circuitOpen Map 任一未过期条目即整体跳过本轮(熔断=系统面故障期,补跑必然失败还可能二次开窗,与「1 条诊断」纪律冲突);
  6. 该任务此刻无 cron 到期(到期分支照常,优先级归 cron)。
- **执行**:`runSiteCommand(site, id, { manual: true, catchup: true })`——manual 已天然跳过 15-90s jitter;补跑自身不进 schedMarkers(不到期分支,marker 通道零接触)。
- **清债/续债**(集中在 runSiteCommand,按 opts.catchup 区分):
  - 补跑成功 → 清 pendingCatchup;
  - 补跑命令级失败(非跳过)→ 清 pendingCatchup(试过了,失败照常入账——失败说真话,不循环重试失败);
  - 补跑再次 ⏸(环境仍未恢复/仍登录墙)→ 保留 pending,attempts++,lastAttemptAt 更新(跳过≠成功;窗口与次数天然封顶);
  - 换日:forDay !== 今日即视为过期,判定轮直接清除。
- **呈现**:history 行与日账 entry 带 catchup 标记(DigestDayEntry 加 `catchup?: boolean`),md 行文前缀 🔄;事件 `schedule-catchup` 仅在补跑真正发起且**未跳过**时发(成功/命令失败进 text);补跑模式的 ⏸ 沿用 schedule-skipped(文本带「补跑尝试 N」),不发新事件防刷屏。缺口注记不折抵(诚实:该分钟确实漏过)。
- **env**:`DSH_OPENCLI_CATCHUP_DISABLE` / `DSH_OPENCLI_CATCHUP_WINDOW_MIN` / `DSH_OPENCLI_CATCHUP_EVERY_MIN`(解析对齐 SELFHEAL_BACKOFF_MS 风格:调用时读、非法回落默认)。
- **已知边界(如实)**:quietHours 窗内恢复则补跑照跑、通知进 pendingNotify 暂存(现有机制,不加特判);governor 并发由 catchupBusy 单飞闸防挤兑;daemon-down 类挂债无需特判自愈退避(补跑间隔 30min > 自愈退避 10min,天然错开)。

**验收(tests/schedule-catchup.test.ts,仿 schedule-quiet-staging 的 tickAt 范式)**:
① 07:00 扩展断连跳过 → pendingCatchup 落盘 + schedule-skipped;② 时间推进 + 环境恢复 → 30 分钟间隔后的 tick 补跑一次:history 🔄 行、schedule-catchup 事件、pending 清除、日账 catchup:true;③ 补跑后不再二次补跑(单次);④ 窗口外(>4h)不补跑;⑤ env 禁用不补跑;⑥ auth-wall 补跑再跳过 → pending 保留 attempts++;⑦ 补跑命令失败 → pending 清除 + 正常失败行;⑧ 熔断窗活跃 → 不发起;⑨ 换日 → 挂债清除。

## 二、C2 CLI 共存缓解(#2761 现实化)

**问题**(预研 §四.2):67 行事件里 21 行是 daemon 互杀根因链(flip ×5 + selfheal ×8 + circuit ×5 + attribution ×3);自愈是止血不除根,上游 #2761 零进展。用户不知道「装了两个 CLI 在互杀」。

**语义**(检测+呈现+可复制建议,零自动动作——升级/退出是你的显式决策):

- host:`cliCoexistence()`(纯判定 + 事件史统计):cliMajor()(既有缓存)vs daemon 版本(daemonStatus().version 取 major);`flips7d` 从事件文件(eventsGet 同款读取,.1 档+主档)数 7 天内 kind==='daemon-flip';`coexist = 两个 major 都取到且不等`。
- 呈现面:**status RPC 加可选字段 `coexist?`**(仅当 coexist 或 flips7d>0 时携带——零噪音;字段 cliMajor/daemonMajor/flips7d/binPath/status RPC 已探的 version 复用,不新增探测成本)。
- client:状态区新增「CLI 共存」提示卡:CLI vX vs daemon vY、7 天翻转 N 次、建议两条(退出/升级 OpenCLIApp 内置 CLI;或系统级钉定 `setx DSH_OPENCLI_BIN "<bin>"` 后重载插件)+ 复制按钮(只复制不执行)。zh/en STR 双 key,不共存不渲染。
- 事件:不新增(daemon-flip 已在;统计从事件史读)。

**验收(tests/coexistence.test.ts)**:①CLI 1.x + daemon 2.x → coexist=true;②同 major → coexist=false 且 flips7d=0 时不携带字段;③事件史 7 天窗口边界(8 天前的 flip 不计);④status RPC 携带/省略两形态。

## 三、C5 挂账收尾(本方案撰写时已完成)

- **L15**:收件箱展开详情轨迹表头空态(src/client.ts 收件箱卡 traceErr 分支后)补空态行,复用现成 `ibNoTrace` 文案、零新增 i18n。
- **L5(条件收)**:vitest 失败归档 reporter(tests/failure-archive-reporter.ts + vitest.config.ts reporters 挂载 + 成对测试 tests/failure-archive.test.ts 8 例)——**有失败才落盘** .qa/test-failures.jsonl(绿轮零开销零文件),5MB 轮转 .1,归档 IO 失败如实报不反噬测试轮;flake 事后可归因。

## 四、门禁与复核

1. 门禁:重建 lib + 全量 vitest(0.1.5 基线 787 + 新增 22 例)+ `npm pack` 干净度维持。
2. 复核:两路独立评审(纪律/诚实面 + 正确性/边界面)读全 diff,发现逐条确认;CHANGELOG 0.1.6 三节定稿后提交推送。

### 复核处置记录(2026-11-19,两路评审全部发现逐条对账)

**纪律面(评审一)3 medium 5 low 1 info——全部处置**:
- ✅ coexist major 哨兵 -1 渲染「v-1.x」伪造版本 → 类型改 `number | null`,null 由面板走仅翻转频度文案(锁定用例 ②b);
- ✅ 归档装配测试写真实 .qa(测试 rmSync 抹真实 flake 证据,反噬 L5 初衷)→ 注入临时路径 + 「真实归档未被触碰」断言;
- ✅ reporter 文件级失败(import/收集错误)整轮漏归档 → walk 返回子树行数,容器自身 fail 且子树零行补文件级行(防双计,形态 A/B/C 用例锁定);
- ✅ catchupCheck 清债不落盘 → cleaned 标记 + saveState;
- ✅ loadState 不校验 pendingCatchup 形状(手改 state attempts 串化)→ 逐键收窄,坏形状整字段丢弃;
- ✅ CHANGELOG「失败由 schedule-failed 覆盖」措辞过头(熔断短路只有 ⚡ 行)→ 措辞校准;EVERY_MIN=0 语义补进 CHANGELOG/SKILL;
- ⏸ engines node>=18 与 import.meta.dirname(需 20.11):既有先例(lib-staleness-setup 同用),且 reporter 仅测试基建不进发布 lib,不动 engines。

**正确面(评审二)1 medium 2 low 3 info——全部处置**:
- ✅ 「真实归档不存在」断言是自毁时间炸弹(首次真实 flake 归档后套件永久假红)→ 改进出用例记基线、出用例比对一致;
- ✅ status 每次面板刷新全量扫事件档(至多 ~10MB 同步 IO)→ flip 计数加 60s TTL 缓存(诊断信号,秒级陈旧无碍);
- ✅ 补跑与「jitter 睡眠中的 cron 轮」竞态(同任务并发双跑/晚到 cron 跳过重挂新债)→ 单日有界(~3 次),且手动 run-now 与 cron 并发本就无每任务互斥(既有形态,补跑只是同类触发源)——记入已知边界不阻断;
- ⏸ 熔断窗期间过期债不收走(窗内 early-return 在清债循环前)→ 窗过期后下 tick 自愈,无害;
- ⏸ 日尾跳过债的名义 4h 窗被换日清债截断 → 与「当日补跑」语义一致,by-design;
- ⏸ runSiteCommand 可抛路径经 catchupCheck 无 catch(与 cron 路径 void 同款,非本次引入)→ 维持现状;
- ✅ 实测发现 vitest 以配置对象实例化自定义 reporter(构造参数顶掉默认路径)→ 构造器只收 string,非串回落真实路径;真实红轮归档已二次实证(探针用例落盘字段齐全)。
