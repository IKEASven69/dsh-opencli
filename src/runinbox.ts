/**
 * 运行级收件箱(0.1.4 候选 5):定时任务 run 条目与已读/归档状态的纯函数层。
 *
 * 命名纪律(两套语义分开,§九.2 §3.3①):本模块的「收件箱」= 运行级条目视图,由
 * runHistory 查询时合成,一次执行一条(对齐 Codex automation_runs #24245 条目模型);
 * src/inbox.ts 的「收件箱」= ctl 意图文件(~/.dsh/opencli-inbox/ 的 .result.json 是
 * ctl 意图回执而非任务结果,深化轮逐份解析实证)。本模块绝不读写那些文件,也不按
 * site 文本扫 events 反查条目(events 无任务 id,文本匹配=automation-monitor 式误读)。
 *
 * 存储基底(§九.7③′ 三问的落地答案,与 ask ① 一致):
 *  - 条目不建持久层:查询时从 runHistory 合成(带 receipt 的 typed 行,状态四值判定);
 *  - read/archived 状态以稳定键 `task|at` 存 state.json(inboxFlags,有界
 *    INBOX_FLAG_CAP,超限裁最旧,任务删除即清理)——runHistory 是有界窗口(每任务
 *    5 条),条目轮出后其状态键随有界淘汰清账;无损可回看由既有产物承接(trace 落盘、
 *    快照 keep 预算不因归档动一个字节);
 *  - 归档=无损降级非删除(#20418 教训):归档只写状态键,不动 runHistory 行——窗口内
 *    归档条目仍可点开只读视图(详情=summary+trace 深链+回执)。
 * @module dsh-opencli/runinbox
 */

import type { Receipt } from './parsers.ts'

/** runHistory 行(含 receipt 与 skip 标记的 typed 行;index.ts 持久层与本模块共用同一形状)。 */
export interface RunHistoryRow {
  at: string
  ok: boolean
  summary: string
  receipt?: Receipt
  /** 预检跳过行(健康/登录预检,命令未执行):typed 标记,状态判定不靠 summary 文本。 */
  skip?: true
}

/** run 条目四态(候选 5 ①):ok=成功有产出 / fail=失败 / skip=预检跳过 / empty=成功无产出。 */
export type RunInboxStatus = 'ok' | 'fail' | 'skip' | 'empty'

/**
 * 一条 run 条目(一次执行一条;字段对齐 Codex automation_runs #24245 的
 * inbox_title/inbox_summary + status 枚举):task+at 是稳定键,trace/report 是深链。
 */
export interface RunInboxEntry {
  /** 任务 id(稳定键前半) */
  task: string
  /** 任务命令行(显示名;runHistory 键是 id,展示需要 site) */
  site: string
  /** run 时间 ISO(稳定键后半;取同 tick 最新一次尝试的行) */
  at: string
  status: RunInboxStatus
  /** 结论摘要(runHistory 行原文,已过 scrubUrlParams) */
  summary: string
  /** trace 深链:本地日期键 yyyymmdd(trace-get 可取当日轨迹;预检跳过行命令未执行,省键) */
  traceDate?: string
  /** report 深链:本地日期 YYYY-MM-DD(当日早报 digest-<date>.md 的日期指针;日结产出,面板明示日期不假装文件必在) */
  digestDate?: string
  /** 回执摘要(四态判定的 typed 依据;省键=行无回执) */
  receipt?: Receipt
  read: boolean
  archived: boolean
  /** 归档来源:auto=无产出确定性自动归档(候选 5 ③)/ manual=面板或 ctl 归档(省键=旧数据) */
  archivedBy?: 'manual' | 'auto'
}

/**
 * run 级已读/归档状态(state.json inboxFlags 的值形状)。read 只是不再当未读;archived
 * 是无损降级(数据不动,列表沉底仍可点开)。
 */
export interface InboxRunFlag {
  read?: boolean
  archived?: boolean
  by?: 'manual' | 'auto'
}

/** inboxFlags 总量上限(有界纪律:35 任务 × 5 条 ≈175 行的量级,400 给临时行留余量;超限裁最旧)。 */
export const INBOX_FLAG_CAP = 400

/** 稳定键:`${taskId}|${run at ISO}`(runHistory 行身份;键含 '|' 不是数字索引键,JSON 往返保插入序)。 */
export function inboxFlagKey(task: string, at: string): string {
  return `${task}|${at}`
}

/** runHistory 行的 run 状态(typed 判定,不解析 summary 文本)。 */
export function inboxRunStatus(row: RunHistoryRow): RunInboxStatus {
  if (row.skip === true) return 'skip'
  if (row.ok !== true) return 'fail'
  if (row.receipt?.empty === true) return 'empty'
  return 'ok'
}

/**
 * 无产出确定性判定(候选 5 ③,与 §九.7④ 口径逐字一致):
 * ok && receipt.empty && 无 diff && 无 watch 命中 && 非 skip——全 typed 字段,
 * 不引入模型判断(#28922「别把 UI 卫生写进 prompt」同款纪律)。skip 行在执行前已
 * return,调用面恒 false,这里显式收参是让判定本身自证完整(测试逐合取项钉)。
 */
export function isNoOutputRun(input: { ok: boolean; empty?: boolean; diffed: boolean; watchHit: boolean; skip: boolean }): boolean {
  return input.ok === true && input.empty === true && !input.diffed && !input.watchHit && !input.skip
}

/**
 * 任务级可见性档位(0.1.5 C5,§九.7⑤ 借 Codex #28922 四态):一个任务级可选字段,
 * 不再加 0.1.3 式零使用旗标(R5:六新字段两版实战零使用=「默认行为优先于任务级旗标」二连证)。
 * 默认 always-visible=既有行为零变化;省键=旧任务/未配置任务天然落默认。
 */
export type ScheduleVisibility = 'always-visible' | 'archive-on-success' | 'notify-on-failure' | 'quiet-unless-actionable'

/** 四值闭集(意图白名单/scheduleAdd 校验/面板下拉共用同一份,不各写各的)。 */
export const VISIBILITY_VALUES: readonly ScheduleVisibility[] = ['always-visible', 'archive-on-success', 'notify-on-failure', 'quiet-unless-actionable']

/** 档位值守卫(scheduleAdd 校验与意图白名单共用)。 */
export function isScheduleVisibility(v: unknown): v is ScheduleVisibility {
  return typeof v === 'string' && (VISIBILITY_VALUES as readonly string[]).includes(v)
}

/**
 * 可见性档位的收件箱归档判定(C5;通知面判定在 index.ts 外送门,不在这——档位各管一面):
 *  - archive-on-success:成功 run 一律归档(含 watch 命中/有变化——命中信号仍走推送面,
 *    收件箱条目沉归档区无损可回看,两态不打架);
 *  - quiet-unless-actionable:无 actionable 信号才归档。actionable 判定=失败/watch 命中/
 *    有变化,与 notifyLevel='quiet' 的 worthPushing 同一口径(index.ts 同一表达式),
 *    两面共享一份事实不另立标准(dsh-proactive quiet-hours「无事不补发」同款先例);
 *  - always-visible/notify-on-failure:恒 false——前者是默认零变化,后者只管通知面
 *    不动收件箱面(失败 run 照常现身收件箱)。
 */
export function visibilityArchivesRun(visibility: string | undefined, run: { ok: boolean; diffed: boolean; watchHit: boolean }): boolean {
  if (visibility === 'archive-on-success') return run.ok
  if (visibility === 'quiet-unless-actionable') return run.ok && !run.diffed && !run.watchHit
  return false
}

/** 本地日期键 yyyymmdd(trace 深链;与 index.ts traceDateKey 同一把尺,纯函数层自持一份)。 */
export function traceDateKeyOf(at: string): string | undefined {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 本地日期键 YYYY-MM-DD(早报深链;digest.localDateKey 同口径)。 */
export function digestDateKeyOf(at: string): string | undefined {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 重试链归组:一次执行(runSiteCommand 一 tick)可能落多条行(逐 attempt unshift),
 * 条目模型是 run 级——同 tick 的 `#n/m` 行折成一条,取最新行(它带最终回执与结论)。
 * 行前缀形态:`#${attempt}/${attempts} `(healthNote 包裹为 `【…】#n/m `);单 attempt
 * tick 无前缀。匹配按严格链(同分母且分子递减),链断即止——窗口切开的半截链如实少折,
 * 不猜。canary/跳过行无前缀,天然单行 tick。
 */
const ATTEMPT_RE = /^(?:【[^】]*】)?#(\d+)\/(\d+) /

function attemptNum(summary: string): { n: number; m: number } | null {
  const mt = ATTEMPT_RE.exec(summary)
  if (mt === null) return null
  return { n: Number(mt[1]), m: Number(mt[2]) }
}

/**
 * 合成 run 条目(查询时;新→旧)。输入:
 *  - runHistory:任务 id → 行(存盘序不保证,内部按 at 重排);
 *  - sites:任务 id → 命令行(runHistory 键是 id,展示与深链需要 site);
 *  - flags:稳定键 → 已读/归档状态(state.json inboxFlags)。
 */
export function synthesizeRunInbox(input: {
  runHistory: Record<string, RunHistoryRow[]>
  sites: Record<string, string>
  flags: Record<string, InboxRunFlag>
}): RunInboxEntry[] {
  const out: RunInboxEntry[] = []
  for (const [id, rows] of Object.entries(input.runHistory)) {
    if (!Array.isArray(rows)) continue
    const sorted = rows
      .filter((r): r is RunHistoryRow => r !== null && typeof r === 'object' && typeof r.at === 'string')
      .sort((a, b) => b.at.localeCompare(a.at)) // 新→旧(unshift 存盘序不保证,与连败重建同款防御)
    let i = 0
    while (i < sorted.length) {
      const head = sorted[i]!
      // 同 tick 后续(更旧的)#n/m 行并入 head:严格链=同分母且分子恰为 hn.n-(j-i)
      // (head=n 的重试链,往旧每退一行分子减一;链断即止,不猜)
      let j = i + 1
      const hn = attemptNum(head.summary)
      while (j < sorted.length) {
        const cur = sorted[j]
        if (cur === undefined) break
        const cn = attemptNum(cur.summary)
        if (hn === null || cn === null || cn.m !== hn.m || cn.n !== hn.n - (j - i)) break
        j++
      }
      const flag = input.flags[inboxFlagKey(id, head.at)]
      const status = inboxRunStatus(head)
      out.push({
        task: id,
        ...(input.sites[id] !== undefined ? { site: input.sites[id]! } : { site: id }),
        at: head.at,
        status,
        summary: head.summary,
        // trace 深链:预检跳过行命令未执行,无轨迹可指(省键=诚实)
        ...(status !== 'skip' ? (() => { const t = traceDateKeyOf(head.at); return t !== undefined ? { traceDate: t } : {} })() : {}),
        ...(() => { const d = digestDateKeyOf(head.at); return d !== undefined ? { digestDate: d } : {} })(),
        ...(head.receipt !== undefined ? { receipt: head.receipt } : {}),
        read: flag?.read === true,
        archived: flag?.archived === true,
        ...(flag?.archived === true && flag.by !== undefined ? { archivedBy: flag.by } : {}),
      })
      i = j
    }
  }
  out.sort((a, b) => b.at.localeCompare(a.at)) // 跨任务新→旧
  return out
}

/** 未读口径:未读且未归档(归档不产生红点噪音,#20418 教训;自动归档直沉底)。 */
export function inboxUnreadCount(entries: readonly RunInboxEntry[]): number {
  return entries.filter((e) => e.read !== true && e.archived !== true).length
}

/**
 * 有界淘汰:超 INBOX_FLAG_CAP 从最旧(插入序)开始裁。直接在传入对象上改并返回同一引用
 * (调用方即 state.inboxFlags,避免整表复制);刚写入的键最后插入,天然不会被本轮裁掉。
 */
export function boundInboxFlags(flags: Record<string, InboxRunFlag>, cap = INBOX_FLAG_CAP): Record<string, InboxRunFlag> {
  const keys = Object.keys(flags)
  for (const k of keys.slice(0, Math.max(0, keys.length - cap))) delete flags[k]
  return flags
}

/** 任务删除清理(候选 5 ①:随任务删除清理):清掉该任务全部状态键,返回清除数。 */
export function purgeInboxFlags(flags: Record<string, InboxRunFlag> | undefined, taskId: string): number {
  if (flags === undefined) return 0
  const prefix = `${taskId}|`
  let n = 0
  for (const k of Object.keys(flags)) {
    if (k.startsWith(prefix)) { delete flags[k]; n++ }
  }
  return n
}
