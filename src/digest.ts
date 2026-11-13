/**
 * 日结早报(0.1.4 候选 2)与连败降噪/熔断归因(0.1.4 候选 3)的纯函数层。
 *
 * 候选 2(日报双层产物,借 dsh-ai-research 双产物纪律):
 *  - 触发=调度器内建日结检查(index.ts 调度 tick 内,本地日期翻转时结算一次,不新增 timer;
 *    DSH_OPENCLI_DIGEST_DISABLE=1 可关;默认仅当存在 notify!==false 的任务才发);
 *  - 两层:推送通道发 compact 卡(≤500 字,排序=失败>watch 命中>变化>例行,沿 worthPushing
 *    分层)+ 落盘 ~/.dsh/opencli-reports/digest-<日期>.md|.json(md 骨架沿 dsh-ai-research:
 *    单 H1 / 元信息引用块 / 固定尾章「数据缺口」);
 *  - 卡片结构:标题「[dsh-opencli] 早报 YYYY-MM-DD」+ 首行总览计数(全量占行不藏缺口)+
 *    失败段(任务/来源/签名/熔断状态;失败不静默)+ watch 命中段(🔔)+ 变化段(📊)+
 *    尾行回执口径;同签名连败折叠一行带「连续第 N 日」(候选 3 计数);
 *  - 空窗(全成功且无变化)发「N 任务全部正常」卡(可见性优先;quietHours 窗内顺延出窗,
 *    顺延判定在 index.ts 接线层,本模块只产出 emptyWindow 标记);
 *  - 归档条目不进日报(候选 5 联动):日账条目带 archived 标记、DigestDayLedger.markArchived
 *    是留给候选 5(C)的接线缝——归档只进 X 计数,不产任何行。
 *
 * 候选 3(归因+降噪):
 *  - 熔断开窗后自动单跑一次 canary(既有 canary-run 面复用,接线在 index.ts),结论写
 *    circuit-attribution 事件并附进早报失败段;判定是启发式(canary 通过率分档),如实给
 *    「无法定论 / canary 未完成」档,不猜;
 *  - 同签名连败计数(FailStreakCounter,有界 Map,按本地日历日)驱动失败推送「连续第 N 日」
 *    与早报失败段折叠;阈值行为=仅标注,不自动停任务(诚实不替用户做主)。
 *
 * 数据面纪律:入账 summary 已在上游过 scrubUrlParams(与 runHistory 同源同一份文本),推送卡
 * 出口统一 scrubLocalPaths(与通知通道同一安全边界);md/json 落盘层过 scrubUrlParams
 * (与 reports 同口径——本机路径在本地文件合法保留,推送面不保留)。md 是整段文本一洗,
 * json 结构化对象走 scrubJsonStrings 逐值递归洗——单点闸,新增字段不再有「忘了洗」的口子。
 * @module dsh-opencli/digest
 */

import { NOTIFY_BODY_MAX, scrubLocalPaths, scrubUrlParams } from './notify.ts'

// ---------------------------------------------------------------------------
// 本地日历日键(日结触发与连败计数的时间基准)
// ---------------------------------------------------------------------------

/** 本地日历日键 YYYY-MM-DD(日结按本地自然日翻转,不用 UTC——早报是给人看的)。 */
export function localDateKey(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 前一日的本地日历日键(连败「连续」判定的衔接检查)。 */
export function prevDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return localDateKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1))
}

/** 行内截断(卡片/md 单行预算;带省略号,不静默吞)。 */
function clipLine(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** 单行化(卡片「逐任务一行」纪律):摘要/差异里的换行压成 ' / ',md 侧保留原始多行。 */
function oneLine(text: string, max: number): string {
  return clipLine(text.replace(/\s*\n+\s*/g, ' / '), max)
}

// ---------------------------------------------------------------------------
// 熔断签名提取(自 index.ts 移入:候选 3 连败计数/归因同源复用,判定语义不变)
// ---------------------------------------------------------------------------

/**
 * 系统级失败签名提取(熔断判据):daemon 断连(fetch failed——undici 汇聚错误文本,
 * 11-06..08 v2ex 三日连败实证)与 Windows 文件系 EPERM(09-25 九分钟窗 75 条洪水实证,
 * 单根因×任务×重试链放大)。返回 null=非系统级:站点/适配器故障不熔断,照常走重试链
 * 与通知——熔断只止血系统面,不吞业务面。
 */
export function circuitSignatureOf(text: string): string | null {
  if (/\bfetch failed\b/i.test(text)) return 'fetch-failed'
  if (/\bEPERM\b[^\n]*operation not permitted/i.test(text)) return 'eperm'
  return null
}

// ---------------------------------------------------------------------------
// 候选 3:同签名连败计数(有界 Map,按本地日历日)
// ---------------------------------------------------------------------------

/** 连败计数条目上限(有界纪律:键=(任务|签名),超限裁最旧;200 覆盖任务×系统面签名组合绰绰有余)。 */
export const FAIL_STREAK_CAP = 200

/**
 * 同签名连败计数:键=(任务,签名),按本地日历日累加「连续第 N 日」。
 *  - 同一天多次失败不重复计日(bump 幂等);
 *  - 昨天有同签名失败才 +1,断一天从 1 重数(「连续」语义);
 *  - 任务成功即整任务清零(reset——连败被成功打断);
 *  - 只标注不自动停任务:本计数器只产出数字,没有任何停任务副作用(诚实不替用户做主)。
 */
export class FailStreakCounter {
  private map = new Map<string, { days: number; lastDay: string }>()

  private static key(id: string, sig: string): string {
    return `${id}|${sig}`
  }

  /** 记一次失败,返回该 (任务,签名) 当前连续天数(同日重复调用幂等)。 */
  bump(id: string, sig: string, now: Date): number {
    const day = localDateKey(now)
    const k = FailStreakCounter.key(id, sig)
    const prev = this.map.get(k)
    if (prev !== undefined && prev.lastDay === day) return prev.days
    const days = prev !== undefined && prev.lastDay === prevDateKey(day) ? prev.days + 1 : 1
    this.map.delete(k) // 重插到 Map 尾:插入序=时间序,超限裁最旧
    this.map.set(k, { days, lastDay: day })
    if (this.map.size > FAIL_STREAK_CAP) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    return days
  }

  /** 任务成功:清零该任务全部签名的连败计数(成功打断「连续」)。 */
  reset(id: string): void {
    const prefix = `${id}|`
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) this.map.delete(k)
    }
  }

  /** 当前连续天数(无记录=0;≥2 才值得显示「连续第 N 日」)。 */
  daysOf(id: string, sig: string): number {
    return this.map.get(FailStreakCounter.key(id, sig))?.days ?? 0
  }

  /**
   * 重启恢复:从 runHistory(持久化)重建连败计数——#2761 互杀一天三翻的常态下,
   * 内存计数器随进程死掉会让「连续第 N 日」永远从 1 重数,降噪失效。逐任务把条目按时间
   * 排序后从最新往旧数「连续本地日历日」:尾部成功=断链不重建;签名不同的失败断链;
   * 日历日不衔接断链(runHistory 每任务只留 5 条,窗口外的更早连败无从知晓,如实少记)。
   * 签名只能恢复 circuitSignatureOf 可提取的系统面两类(typed 失败码不落 summary,不猜)。
   */
  rebuildFromRunHistory(history: Record<string, Array<{ at: string; ok: boolean; summary: string }>>): void {
    for (const [id, entries] of Object.entries(history)) {
      if (!Array.isArray(entries)) continue
      const sorted = entries
        .filter((e) => e !== null && typeof e === 'object' && typeof e.at === 'string')
        .sort((a, b) => a.at.localeCompare(b.at)) // 旧→新(runHistory 是 unshift 前插,存盘序不保证)
      while (sorted.length > 0 && sorted[sorted.length - 1]!.ok) sorted.pop() // 尾部成功弹掉:断链
      const last = sorted[sorted.length - 1]
      if (last === undefined || last.ok) continue
      const sig = circuitSignatureOf(last.summary)
      if (sig === null) continue
      let days = 0
      let prevDay: string | undefined
      for (let i = sorted.length - 1; i >= 0; i--) {
        const e = sorted[i]!
        if (e.ok) break // 成功断链
        if (circuitSignatureOf(e.summary) !== sig) break // 签名不同:另一条连败链,断
        const day = localDateKey(new Date(e.at))
        if (day === prevDay) continue // 同日多条只计一天
        if (prevDay !== undefined && day !== prevDateKey(prevDay)) break // 日历日不衔接:断
        days++
        prevDay = day
      }
      if (days > 0) this.map.set(FailStreakCounter.key(id, sig), { days, lastDay: localDateKey(new Date(last.at)) })
    }
  }
}

// ---------------------------------------------------------------------------
// 候选 3:熔断归因判定(circuit-open 开窗后自动 canary 单跑的结论)
// ---------------------------------------------------------------------------

export type CircuitVerdict = 'system' | 'site-or-transient' | 'mixed' | 'unknown'

/** canary-run 返回形状的最小投影(index.ts canaryRun 的返回是其超集)。 */
export interface CanaryLike { ok: boolean; total: number; passed: number; error?: string }

export interface CircuitAttribution {
  at: string
  verdict: CircuitVerdict
  /** 短句(早报失败段附注)。 */
  summary: string
  /** 事件正文(circuit-attribution 事件全文,带 🔍 前缀与签名)。 */
  detail: string
}

/**
 * 熔断归因判定(启发式,不是裁决):开窗签名是系统面(fetch-failed/eperm),canary 走同一
 * daemon/网络——大面积失败说明系统面真的塌了;大面积通过说明系统面当前可用,断连更可能是
 * 瞬时或站点面问题。阈值 0.5/0.8 是经验分档,中间带如实标「无法定论」;canary 没跑成
 * (目录不可用等)如实标「无法区分」——归因宁可说不知道,不替用户下结论。
 */
export function judgeCircuitAttribution(sig: string, canary: CanaryLike, at: string): CircuitAttribution {
  const head = `🔍 熔断归因(${sig}):`
  if (canary.total === 0) {
    const err = clipLine(canary.error ?? '未知', 80)
    return { at, verdict: 'unknown', summary: `canary 未完成(${err})——系统面/站点面无法区分`, detail: `${head}canary 未完成(${err})——系统面/站点面无法区分(如实标注,不猜)` }
  }
  const rate = canary.passed / canary.total
  if (rate <= 0.5) {
    return { at, verdict: 'system', summary: `系统面故障——canary 仅通过 ${canary.passed}/${canary.total}`, detail: `${head}系统面故障——canary 仅通过 ${canary.passed}/${canary.total} 站,大面积失败与熔断签名同向(daemon/网络面)` }
  }
  if (rate >= 0.8) {
    return { at, verdict: 'site-or-transient', summary: `系统面当前可用,偏站点面/瞬时——canary 通过 ${canary.passed}/${canary.total}`, detail: `${head}系统面当前可用,偏站点面/瞬时——canary 通过 ${canary.passed}/${canary.total} 站;同签名再开窗时倾向站点面排查(适配器漂移对表 canary 报告)` }
  }
  return { at, verdict: 'mixed', summary: `无法定论——canary 通过 ${canary.passed}/${canary.total}(混合)`, detail: `${head}无法定论——canary 通过 ${canary.passed}/${canary.total} 站(混合),系统面/站点面需人工复核` }
}

// ---------------------------------------------------------------------------
// 候选 2:日账(当日 run 聚合,早报结算的数据源)
// ---------------------------------------------------------------------------

/** 日账单 run 入账条目(runSiteCommand 每 tick 收尾一条;summary 为已 scrub 的 history 行)。 */
export interface DigestDayEntry {
  at: string
  ok: boolean
  summary: string
  /** 失败签名(系统面 circuitSignatureOf ?? typed 失败码;无稳定签名不记)。 */
  signature?: string
  /** 本 run watch 命中词。 */
  watchHits?: string[]
  /** 本 run 变化摘要(renderDiffText,可多行)。 */
  diff?: string
  /** 空产出(回执 empty 口径)。 */
  empty?: boolean
  /** 候选 5 归档标记(C 落地):归档条目不进日报任何行,只进 X 计数。 */
  archived?: boolean
  /** 候选 5 ③:自动归档来源标记(无产出确定性判定命中)——早报尾行计数的口径依据。 */
  autoArchived?: boolean
  /** 本 run 伴随熔断(开窗或窗内短路)。 */
  circuit?: boolean
  /** 健康预检/登录预检跳过(诚实进失败面,不静默)。 */
  skip?: boolean
}

/** 单任务同签名失败折叠组(key=签名;无稳定签名归入 signature=undefined 的未分类组)。 */
export interface DigestFailGroup {
  signature?: string
  count: number
  lastAt: string
  lastSummary: string
  /** 本组最近一条是否伴随熔断(开窗/短路)。 */
  circuit: boolean
}

/** 单任务当日聚合(有界:watch 词 ≤20 / diff ≤10 / 失败折叠组 ≤8)。 */
export interface DigestDayTask {
  site: string
  source?: string
  runs: number
  okRuns: number
  failRuns: number
  emptyRuns: number
  archivedRuns: number
  /** 其中自动归档(无产出确定性判定)的 run 数——早报尾行「自动归档 N 条」计数。 */
  autoArchivedRuns: number
  watchHits: string[]
  watchSample?: string
  diffs: string[]
  failGroups: Map<string, DigestFailGroup>
  circuitSeen: boolean
  firstAt?: string
  lastAt?: string
}

const WATCH_CAP = 20
const DIFF_CAP = 10
const FAIL_GROUP_CAP = 8

/** 无稳定签名失败在折叠 Map 里的键(summary 已如实带原文,签名段不猜)。 */
const UNGROUPED_KEY = '∅'

/**
 * 日账:本地日期翻转时结算为早报,结算后整体换新(进程内存态,重启丢账——早报尾行如实
 * 标注,不假装覆盖全天)。逐 run 入账在 index.ts runSiteCommand 收尾(成功/失败/跳过/canary)。
 */
export class DigestDayLedger {
  readonly tasks = new Map<string, DigestDayTask>()

  constructor(readonly date: string) {}

  /**
   * 一次执行入账。入账日与本账日不符(跨午夜在途 run)→ 丢弃:那一日的账要么已结算要么
   * 尚未开始,宁少记不错账。archived 条目只进 archivedRuns 计数,不产 watch/diff/失败行
   * (候选 2⑤:归档条目不进日报)。
   */
  record(id: string, site: string, source: string | undefined, entry: DigestDayEntry): void {
    if (localDateKey(new Date(entry.at)) !== this.date) return
    let t = this.tasks.get(id)
    if (t === undefined) {
      t = {
        site, ...(source !== undefined ? { source } : {}),
        runs: 0, okRuns: 0, failRuns: 0, emptyRuns: 0, archivedRuns: 0, autoArchivedRuns: 0,
        watchHits: [], diffs: [], failGroups: new Map(), circuitSeen: false,
      }
      this.tasks.set(id, t)
    }
    t.runs++
    t.lastAt = entry.at
    t.firstAt ??= entry.at
    if (entry.ok) {
      t.okRuns++
      if (entry.empty === true) t.emptyRuns++
    } else {
      t.failRuns++
      let key = entry.signature ?? UNGROUPED_KEY
      if (!t.failGroups.has(key) && t.failGroups.size >= FAIL_GROUP_CAP) key = UNGROUPED_KEY // 折叠组超限:并入未分类(计数不丢)
      const g = t.failGroups.get(key) ?? { ...(entry.signature !== undefined && key !== UNGROUPED_KEY ? { signature: entry.signature } : {}), count: 0, lastAt: entry.at, lastSummary: entry.summary, circuit: false }
      g.count++
      g.lastAt = entry.at
      g.lastSummary = entry.summary
      g.circuit = g.circuit || entry.circuit === true
      t.failGroups.set(key, g)
    }
    t.circuitSeen ||= entry.circuit === true
    if (entry.archived === true) {
      t.archivedRuns++
      // 自动归档单列(候选 5 ③):尾行「自动归档 N 条」=确定性闭环命中数,与手动归档分开计
      if (entry.autoArchived === true) t.autoArchivedRuns++
    } else {
      // 归档条目不进日报(候选 2⑤);其余照常产行
      for (const w of entry.watchHits ?? []) {
        if (!t.watchHits.includes(w) && t.watchHits.length < WATCH_CAP) t.watchHits.push(w)
      }
      if ((entry.watchHits?.length ?? 0) > 0 && t.watchSample === undefined) t.watchSample = clipLine(entry.summary, 120)
      if (entry.diff !== undefined && entry.diff.length > 0 && t.diffs.length < DIFF_CAP) t.diffs.push(clipLine(entry.diff, 200))
    }
  }

  /**
   * 候选 5(C)归档接线缝:归档动作把 run 计入当日「空产出已归档」计数(早报首行 X 与
   * json archivedEntries 的来源)。返回实际入账数。B 侧只留此缝与 DigestDayEntry.archived
   * 标记,归档模型/触发时机由 C 定;诚实边界:日账随日结算换新,跨日补归档记不进当日 X
   * (当日早报已发),自动归档(候选 5④ 的 run 时点闭环)不受影响。
   */
  markArchived(id: string, count = 1): number {
    const t = this.tasks.get(id)
    if (t === undefined) return 0
    const room = Math.max(0, t.runs - t.archivedRuns)
    const n = Math.max(0, Math.min(count, room))
    t.archivedRuns += n
    return n
  }

  /** 当日最早入账时刻(账目覆盖缺口标注用;空账 undefined)。 */
  firstRecordedAt(): string | undefined {
    let min: string | undefined
    for (const t of this.tasks.values()) {
      if (t.firstAt !== undefined && (min === undefined || t.firstAt < min)) min = t.firstAt
    }
    return min
  }
}

// ---------------------------------------------------------------------------
// 候选 2:早报装配(compact 卡 + md + json 三同源)
// ---------------------------------------------------------------------------

/** 早报失败段折叠行(任务 × 签名)。 */
export interface DigestFailureRow {
  id: string
  task: string
  source?: string
  signature?: string
  /** 当日该签名失败次数(折叠计数)。 */
  dayCount: number
  /** 连败天数(候选 3;≥2 才带——第 1 天没有「连续」可标)。 */
  streakDays?: number
  circuit: boolean
  lastSummary: string
  attribution?: CircuitAttribution
}

export interface DigestOverview {
  tasks: number
  /** 全部 run 成功的任务数(与 withFailure 不相交,两者相加= tasks)。 */
  allOk: number
  withFailure: number
  watchHit: number
  changeHit: number
  archivedEntries: number
  /** 其中自动归档(候选 5 ③ 无产出确定性闭环)计数——尾行与 json 同源。 */
  autoArchived: number
  runs: number
}

export interface DigestJson {
  date: string
  generatedAt: string
  totals: DigestOverview
  emptyWindow: boolean
  failures: Array<Omit<DigestFailureRow, 'id' | 'attribution'> & { attribution?: { verdict: string; summary: string; at: string } }>
  watch: Array<{ task: string; hits: string[]; sample?: string }>
  changes: Array<{ task: string; diff: string }>
  routine: Array<{ task: string; runs: number; empty?: number }>
  gaps: string[]
}

export interface DigestBuilt {
  /** 「[dsh-opencli] 早报 YYYY-MM-DD」(已 scrub)。 */
  title: string
  /** 首行总览计数(全量占行;事件正文/面板时间线复用)。 */
  overview: string
  /** compact 卡正文(≤NOTIFY_BODY_MAX,已 scrub;超预算先裁例行/watch/变化,失败段保留)。 */
  card: string
  /** 空窗(全成功且无变化):调用方对 quietHours 窗内顺延出窗。 */
  emptyWindow: boolean
  md: string
  json: DigestJson
}

export interface DigestBuildInput {
  /** 覆盖日(刚结束的本地自然日)。 */
  date: string
  genAt: Date
  ledger: DigestDayLedger
  /** (任务 id, 签名) → 连败天数(候选 3 计数器投影;纯函数入参,测试可桩)。 */
  streakOf: (id: string, sig: string) => number
  attributions: ReadonlyMap<string, CircuitAttribution>
  /** 进程实际启动时刻 ISO(缺口归因的证据:仅当启动落在覆盖日才写「进程当日启动/重启」;
   *  缺省/无法解析=不归因,只写「账目自 HH:MM 起」)。 */
  processStartedAt?: string
}

/**
 * 账目覆盖缺口:账目起于当日 00:05 之后 = 头部缺失,如实标注(防「假装覆盖全天」)。
 * 归因只在可证时给:进程实际启动时刻落在覆盖日(内存日账自启动才记账,更早 run 未记)才写
 * 「进程当日启动/重启」;进程早于覆盖日就在跑时,晚起账只是调度时刻使然(如每日 08:00 首跑的
 * 普通 cron)或原因不明——不写归因只写「账目自 HH:MM 起」,不把没发生的事说成发生过。
 */
function digestGaps(ledger: DigestDayLedger, processStartedAt: string | undefined): string[] {
  const gaps: string[] = []
  const first = ledger.firstRecordedAt()
  if (first !== undefined) {
    const d = new Date(first)
    const margin = new Date(d)
    margin.setHours(0, 5, 0, 0)
    if (d.getTime() > margin.getTime()) {
      const pad = (n: number): string => String(n).padStart(2, '0')
      const startedToday =
        processStartedAt !== undefined &&
        !Number.isNaN(new Date(processStartedAt).getTime()) &&
        localDateKey(new Date(processStartedAt)) === ledger.date
      gaps.push(startedToday ? `账目自 ${pad(d.getHours())}:${pad(d.getMinutes())} 起(进程当日启动/重启,更早 run 未记)` : `账目自 ${pad(d.getHours())}:${pad(d.getMinutes())} 起`)
    }
  }
  return gaps
}

/** 失败行卡片文本(任务/来源/签名/折叠计数/连败/熔断/末次,逐项按需追加)。 */
function failureRowText(row: DigestFailureRow): string {
  const segs: string[] = []
  if (row.signature !== undefined) segs.push(`签名 ${row.signature}`)
  if (row.dayCount > 1) segs.push(`本日 ${row.dayCount} 次`)
  if (row.streakDays !== undefined) segs.push(`连续第 ${row.streakDays} 日`)
  if (row.circuit) segs.push('⚡ 熔断')
  segs.push(`末次 ${oneLine(row.lastSummary, 80)}`)
  return `✗ ${row.task}${row.source !== undefined ? `(来源 ${row.source})` : ''}:${segs.join(' · ')}`
}

/**
 * 递归洗对象树里所有字符串值(只洗值,字段名/结构不动):json 落盘层过 scrubUrlParams 的
 * 单点闸——md 是整段文本一洗了之,json 是结构化对象,逐字段手洗等于给「新增字段忘了洗」
 * 留口子,整树递归保证 failures/watch/changes/gaps 及未来任何新字段同过一道。
 */
function scrubJsonStrings<T>(v: T): T {
  if (typeof v === 'string') return scrubUrlParams(v) as unknown as T
  if (Array.isArray(v)) return v.map((x) => scrubJsonStrings(x)) as unknown as T
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = scrubJsonStrings(val)
    return out as T
  }
  return v
}

export function buildDigest(input: DigestBuildInput): DigestBuilt {
  const { date, genAt, ledger, streakOf, attributions, processStartedAt } = input
  const entries = [...ledger.tasks.entries()]
  const runs = entries.reduce((s, [, t]) => s + t.runs, 0)
  const archivedEntries = entries.reduce((s, [, t]) => s + t.archivedRuns, 0)
  const autoArchived = entries.reduce((s, [, t]) => s + t.autoArchivedRuns, 0)
  const withFailure = entries.filter(([, t]) => t.failRuns > 0).length
  const watchHit = entries.filter(([, t]) => t.watchHits.length > 0).length
  const changeHit = entries.filter(([, t]) => t.diffs.length > 0).length
  const totals: DigestOverview = {
    tasks: entries.length,
    allOk: entries.length - withFailure,
    withFailure, watchHit, changeHit, archivedEntries, autoArchived, runs,
  }
  // 空窗=全成功且无变化(worthPushing 三信号的日级聚合;跳过/失败都在失败面,不算空窗)
  const emptyWindow = totals.withFailure === 0 && totals.watchHit === 0 && totals.changeHit === 0
  const gaps = digestGaps(ledger, processStartedAt)
  const gapNote = gaps.length > 0 ? `;${clipLine(gaps[0]!, 60)}` : ''

  // 失败段:任务 × 签名折叠(候选 3:同签名连败一行带「连续第 N 日」)
  const failures: DigestFailureRow[] = []
  for (const [id, t] of entries) {
    for (const g of t.failGroups.values()) {
      const streak = g.signature !== undefined ? streakOf(id, g.signature) : 0
      failures.push({
        id,
        task: t.site,
        ...(t.source !== undefined ? { source: t.source } : {}),
        ...(g.signature !== undefined ? { signature: g.signature } : {}),
        dayCount: g.count,
        ...(streak >= 2 ? { streakDays: streak } : {}),
        circuit: g.circuit,
        lastSummary: g.lastSummary,
        ...(g.signature !== undefined ? { attribution: attributions.get(g.signature) } : {}),
      })
    }
  }
  const watch = entries
    .filter(([, t]) => t.watchHits.length > 0)
    .map(([id, t]) => ({ id, task: t.site, hits: [...t.watchHits], ...(t.watchSample !== undefined ? { sample: t.watchSample } : {}) }))
  const changes = entries
    .filter(([, t]) => t.diffs.length > 0)
    .map(([id, t]) => ({ id, task: t.site, diff: t.diffs.join(' ; ') }))
  const routine = entries
    .filter(([, t]) => t.failRuns === 0)
    .map(([, t]) => ({ task: t.site, runs: t.runs, ...(t.emptyRuns - t.archivedRuns > 0 ? { empty: t.emptyRuns - t.archivedRuns } : {}) }))

  const title = scrubLocalPaths(`[dsh-opencli] 早报 ${date}`)
  const overview = `${totals.tasks} 任务:${totals.allOk} 成功 · ${totals.withFailure} 失败 · ${totals.watchHit} watch 命中 · ${totals.archivedEntries} 空产出已归档`
  const overviewEmpty = `${totals.tasks} 任务全部正常:${totals.allOk} 成功 · 0 失败 · 0 watch 命中 · ${totals.archivedEntries} 空产出已归档`
  // 尾行:回执口径 + 自动归档计数(候选 5 ③:自动归档在日报尾行给计数防不可见,
  // §九.7④;0 条不占行——例行日尾行保持原样)
  const tail = `🧾 口径:进程内存日账,重启丢账${gapNote}${autoArchived > 0 ? ` · 自动归档 ${autoArchived} 条无产出` : ''} · 详情 digest-${date}.md`

  // ── compact 卡(推送层):首行总览 + 失败>watch>变化>例行(worthPushing 分层)+ 尾行回执。
  // 超预算(NOTIFY_BODY_MAX)整节裁剪、留「N 项略」计数痕,裁剪序=例行→变化→watch→归因附注
  // (worthPushing 越低越先裁),失败行永不裁——失败不静默是卡片的第一纪律
  const failureLines = failures.map(failureRowText)
  const attrLines = failures
    .filter((r): r is DigestFailureRow & { attribution: CircuitAttribution } => r.attribution !== undefined)
    .map((r) => `🔍 归因:${clipLine(r.attribution.summary, 100)}`)
  const sections: Array<{ label: string; priority: number; items: string[] }> = [
    { label: 'watch 命中', priority: 3, items: watch.map((w) => `🔔 ${w.task}:命中 ${w.hits.join(', ')}${w.sample !== undefined ? `——${oneLine(w.sample, 60)}` : ''}`) },
    { label: '变化', priority: 2, items: changes.map((c) => `📊 ${c.task}:${oneLine(c.diff, 120)}`) },
    { label: '例行', priority: 1, items: routine.map((r) => `✓ ${r.task} · run ${r.runs} 次${r.empty !== undefined ? ` · 空产出 ${r.empty}` : ''}`) },
  ]
  let droppedNotes: string[] = []
  let liveAttrs = attrLines
  const joinCard = (): string => [
    emptyWindow ? overviewEmpty : overview,
    ...failureLines,
    ...liveAttrs,
    ...droppedNotes,
    ...[...sections].sort((a, b) => b.priority - a.priority).flatMap((s) => s.items),
    tail,
  ].join('\n')
  let body = joinCard()
  while (body.length > NOTIFY_BODY_MAX) {
    const alive = sections.filter((s) => s.items.length > 0)
    if (alive.length > 0) {
      const victim = alive.reduce((a, b) => (a.priority <= b.priority ? a : b))
      droppedNotes.push(`…(${victim.label} ${victim.items.length} 项略,全文见 digest-${date}.md)`)
      victim.items = []
    } else if (liveAttrs.length > 0) {
      droppedNotes = droppedNotes.filter((n) => !n.startsWith('…(归因')) // 归因最后裁:合并成一条痕
      droppedNotes.push(`…(归因附注 ${attrLines.length} 项略,全文见 digest-${date}.md)`)
      liveAttrs = []
    } else {
      break // 只剩总览+失败行+尾行仍超长:整卡硬截(失败密集日,诚实省略)
    }
    body = joinCard()
  }
  if (body.length > NOTIFY_BODY_MAX) body = `${body.slice(0, NOTIFY_BODY_MAX - 1)}…`
  const card = scrubLocalPaths(body)

  // ── md(落盘层):dsh-ai-research 骨架——单 H1 / 元信息引用块 / 分节 / 固定尾章「数据缺口」
  const mdLines: string[] = []
  mdLines.push(`# dsh-opencli 早报 · ${date}`)
  mdLines.push('')
  const genAtText = `${genAt.getFullYear()}-${String(genAt.getMonth() + 1).padStart(2, '0')}-${String(genAt.getDate()).padStart(2, '0')} ${String(genAt.getHours()).padStart(2, '0')}:${String(genAt.getMinutes()).padStart(2, '0')}`
  mdLines.push(`> 覆盖:${date}(本地自然日)· 生成:${genAtText} · 任务 ${totals.tasks} 个 · run ${totals.runs} 次`)
  mdLines.push(`> 口径:进程内存日账,重启丢账${gapNote}(双层产物:本文件与 digest-${date}.json 同源)`)
  mdLines.push('')
  mdLines.push('## 总览')
  mdLines.push('')
  mdLines.push(`- ${overview}${emptyWindow ? '(空窗:全成功且无变化)' : ''}`)
  if (failures.length > 0) {
    mdLines.push('')
    mdLines.push(`## 失败(${failures.length})`)
    mdLines.push('')
    for (const r of failures) {
      mdLines.push(`- ${failureRowText(r)}`)
      if (r.attribution !== undefined) mdLines.push(`  - 🔍 归因(${r.attribution.verdict}):${r.attribution.summary}`)
    }
  }
  if (watch.length > 0) {
    mdLines.push('')
    mdLines.push(`## Watch 命中(${watch.length})`)
    mdLines.push('')
    for (const w of watch) mdLines.push(`- 🔔 \`${w.task}\` · 命中词:${w.hits.join(', ')}${w.sample !== undefined ? ` · 摘要:${w.sample}` : ''}`)
  }
  if (changes.length > 0) {
    mdLines.push('')
    mdLines.push(`## 变化(${changes.length})`)
    mdLines.push('')
    for (const c of changes) mdLines.push(`- 📊 \`${c.task}\`:${c.diff}`)
  }
  if (routine.length > 0) {
    mdLines.push('')
    mdLines.push(`## 例行(${routine.length})`)
    mdLines.push('')
    for (const r of routine) mdLines.push(`- ✓ \`${r.task}\` · run ${r.runs} 次${r.empty !== undefined ? ` · 空产出 ${r.empty}(未归档)` : ''}`)
  }
  mdLines.push('')
  mdLines.push('## 数据缺口')
  mdLines.push('')
  mdLines.push(gaps.length > 0 ? gaps.map((g) => `- ${g}`).join('\n') : '- 无')
  mdLines.push('')
  mdLines.push('> 生成于 dsh-opencli 日结早报(0.1.4 候选 2);run 级原文见 opencli-snapshots/<任务 id>/;URL 中凭据类查询参数的值已脱敏。')
  const md = scrubUrlParams(mdLines.join('\n'))

  const json = scrubJsonStrings({
    date,
    generatedAt: genAt.toISOString(),
    totals,
    emptyWindow,
    failures: failures.map(({ id: _id, attribution, ...rest }) => ({
      ...rest,
      ...(attribution !== undefined ? { attribution: { verdict: attribution.verdict, summary: attribution.summary, at: attribution.at } } : {}),
    })),
    watch: watch.map(({ id: _id, ...rest }) => rest),
    changes: changes.map(({ id: _id, ...rest }) => rest),
    routine,
    gaps,
  })
  return { title, overview, card, emptyWindow, md, json }
}
