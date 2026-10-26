/**
 * 画布数据层(任务 G):聚合轨迹 / 写操作证据包 / 定时任务快照三数据源为画布卡片数组。
 *
 * 为什么单独一层:画布是"全活动流水"视图,但三数据源各自只按自己的键组织(轨迹按命令行、
 * 证据按站点、快照按任务目录),且轨迹是逐命令 JSONL——直接灌进面板会得到一屏碎片。
 * 这里做纯数据变换:同一次运行合并成一张卡、时间范围裁剪、分页,把"一次加载多少"的
 * 决定权收口到一个函数(卡片只带截图路径,base64 由 trace-shot 按需取,绝不内联)。
 *
 * 纯函数契约:不触碰 RPC/宿主/文件系统,不改动入参(排序/分组全在拷贝上做),脏输入
 * (非法时间戳、网关 undefined)一律跳过或按空处理,绝不抛错——与 readTraceFile 的
 * 防御口径同源(面板没有 ErrorBoundary,一个脏行不许炸整卡)。接线(src/index.ts 的
 * canvas RPC)后续接,本模块不 import 宿主侧任何东西。
 * @module dsh-opencli/canvas
 */

import type { EvidenceRecord } from './evidence.ts'
import type { TraceLine } from './types.ts'

/** 画布卡片(三数据源的统一投影)。 */
export interface CanvasCard {
  /** 稳定 id(面板列表 key 与翻页定位;由 type+分组键+起始时间戳派生,同键撞车追加序号) */
  id: string
  /** 起始时间 ISO(合并卡=首步时间) */
  at: string
  type: 'site' | 'browser' | 'schedule'
  /** 站点名(site 写操作/定时采集);browser 卡无站点 */
  site?: string
  /** 代表性命令(合并卡=首步完整命令行,逐字保留) */
  command?: string
  /** 整卡结论:browser 合并卡=全部步骤成功(一次流程缺一不可);schedule 合并卡=末次尝试成败(重试是替代不是叠加) */
  ok: boolean
  /** SystemOne 判定 P 值:轨迹 outHead 含「实测有效 P=x.xx」标注时取末次出现,否则 null */
  p: number | null
  /** 总耗时毫秒(合并卡=各步之和;证据包/快照无耗时字段,为 0) */
  ms: number
  /** 代表截图绝对路径(browser 卡=最后一张步骤截图;证据卡=后截图优先于前截图) */
  shot?: string
  /** 合并出的多步卡才带(单步卡省字段——本层存在的意义就是少装载荷) */
  steps?: Array<{ cmd: string; ok: boolean; ms: number; shot?: string }>
}

/**
 * 轨迹行(可携带步骤截图绝对路径)。types.ts 的 TraceLine 不含 shot(跨 RPC 权威形状),
 * 读侧原样透传、老行无此字段——与 src/index.ts 内部 ShotTraceLine 同构;纯 TraceLine[]
 * 仍可传入(shot 可选,结构兼容)。
 */
export type CanvasTraceLine = TraceLine & { shot?: string }

/**
 * 定时任务快照元数据:落盘快照 JSON({at, site, bytes, stdout})去掉 stdout 后与列目录项
 * ({at, bytes, file})的并集——本层绝不搬正文(那是快照详情页的事);bytes/file 保留是
 * 让接线层把 scheduleHistory 列目录 + 快照 site 字段零变换拼起来直传。
 */
export interface SnapshotMeta {
  at: string
  /** 站点命令原文(如 'zhihu hot',含命令) */
  site: string
  bytes: number
  file: string
}

/** 时间范围:from/to 为 ISO 日期;空值/非法值回落默认(from=24h 前,to=现在)。 */
export interface CanvasRange {
  from: string
  to: string
}

/** 分页参数:offset 从 0 起;limit 默认 50、钳制 [1,500](与 trace-list 上限同一把尺)。 */
export interface CanvasPage {
  offset?: number
  limit?: number
}

/** 卡片默认页大小:卡片虽只带截图路径,也不许一次无限拉——50 与 trace-list 默认同宽。 */
export const CANVAS_PAGE_DEFAULT = 50

/** 快照与 schedule 轨迹卡的合并窗口:快照在成功尝试的轨迹行之后落盘(间隔=真实性判定往返+写盘),
 *  120s 覆盖 SystemOne 判定延迟;更大的间隔视为另一次运行,宁可判两张卡也不吞掉一次运行。 */
const SNAPSHOT_MERGE_WINDOW_MS = 120_000

/** SystemOne 成功标注的取 P 形态(与 cards.ts VERIFY_NOTE 同族;正文误现 P= 字样不采)。 */
const P_NOTE = /实测有效 P=([\d.]+)/

// ── 基础件(全防御:任何输入都不允许抛) ──

/** ISO 串 → 毫秒;非法返回 NaN(调用方按脏行丢弃——归不进时间线的卡没法进画布)。 */
function msOf(at: string): number {
  return new Date(at).getTime()
}

/** id 组成段净化:非 [\w.-] 折为 _ 并截 40 字(id 只要稳定唯一可读,不当数据用)。 */
function idSeg(s: string): string {
  return s.replace(/[^\w.-]/g, '_').slice(0, 40)
}

/** id 时间戳段:ISO 的 : 与 . 换 -(evidenceStamp 同思路:安全字符且字典序=时间序)。 */
function idStamp(at: string): string {
  return at.replace(/[:.]/g, '-')
}

/** 唯一 id:同键撞车(同 session 同毫秒的重复行)追加序号,保证面板列表 key 不重。 */
function uniqueId(used: Set<string>, base: string): string {
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

/**
 * 轨迹行分类(recordTrace 三个写入前缀的契约,src/index.ts):
 * - browser:cmd 形如 `browser <session> <argv…>`(可带 [no-ext] 尾标)→ 同 session 相邻合并;
 * - chrome:cmd 形如 `chrome <method>`(CDP 匿名通道单发探测,无 session 概念)→ 各自成卡;
 * - schedule:cmd 形如 `schedule <cmdLine>`(重试链每次尝试一行)→ 同命令相邻合并;
 * - 其余前缀:归不了类的行宁可不进画布,也不臆造类型。
 */
type TraceKind =
  | { kind: 'browser'; session: string }
  | { kind: 'chrome' }
  | { kind: 'schedule'; command: string }
  | { kind: 'unknown' }

function classifyTrace(cmd: string): TraceKind {
  if (cmd.startsWith('browser ')) {
    const session = cmd.slice('browser '.length).split(/\s+/)[0] ?? ''
    return session.length > 0 ? { kind: 'browser', session } : { kind: 'unknown' }
  }
  if (cmd.startsWith('chrome ')) return { kind: 'chrome' }
  if (cmd.startsWith('schedule ')) {
    const command = cmd.slice('schedule '.length).trim()
    return command.length > 0 ? { kind: 'schedule', command } : { kind: 'unknown' }
  }
  return { kind: 'unknown' }
}

/** 卡片在途形态:比对外多带时间毫秒(过滤/排序用)与末步时刻(快照去重窗口用),收口时剥掉。 */
interface CardDraft extends CanvasCard {
  atMs: number
  endMs: number
}

/** 合并在途形态:键相同且相邻的轨迹行持续吸收,收口时按类型语义定 ok 与代表截图。 */
interface RunAcc {
  type: 'browser' | 'schedule'
  /** id 用键:browser=session;schedule=命令行;chrome=完整 cmd */
  idKey: string
  atMs: number
  endMs: number
  at: string
  command: string
  steps: Array<{ cmd: string; ok: boolean; ms: number; atMs: number; shot?: string }>
  p: number | null
}

/** 收口一张运行卡。ok 语义按类型分岔:browser=每步都成;schedule=末次尝试(重试替代语义)。 */
function flushRun(used: Set<string>, acc: RunAcc): CardDraft {
  const last = acc.steps[acc.steps.length - 1]!
  const lastShot = [...acc.steps].reverse().find((s) => s.shot !== undefined)?.shot
  return {
    id: uniqueId(used, `${acc.type}-${idSeg(acc.idKey)}-${idStamp(acc.at)}`),
    atMs: acc.atMs,
    endMs: acc.endMs,
    at: acc.at,
    type: acc.type,
    ...(acc.type === 'schedule'
      // schedule 的命令行本身含站点名('zhihu hot'):首词是站点,整串是命令
      ? { site: acc.idKey.split(/\s+/)[0], command: acc.idKey }
      : { command: acc.command }),
    ok: acc.type === 'browser' ? acc.steps.every((s) => s.ok) : last.ok,
    p: acc.p,
    ms: acc.steps.reduce((n, s) => n + s.ms, 0),
    ...(lastShot !== undefined ? { shot: lastShot } : {}),
    ...(acc.steps.length >= 2
      ? { steps: acc.steps.map(({ cmd, ok, ms, shot }) => ({ cmd, ok, ms, ...(shot !== undefined ? { shot } : {}) })) }
      : {}),
  }
}

/**
 * 聚合三数据源为画布卡片数组(新→旧,经时间过滤与分页)。
 *
 * ① 轨迹先按时间升序再相邻同键合并(traceList 倒序/traceGet 正序都能进,分组不依赖
 *    调用方给的顺序);② 证据包一张一卡(写操作逐条审计,合并会藏审计身份);③ 快照
 *    成卡,但与 schedule 轨迹卡命中同一次运行时让位——一次成功运行会同时留下轨迹行
 *    (成败/耗时/尝试步)与快照文件(正文),轨迹卡信息更全,不让位就是一次运行两张卡;
 * ④ 时间范围过滤 → 按起始时间倒序 → 分页(offset/limit 作用在过滤后的全集上,翻页才稳定)。
 */
export function buildCanvasData(
  traces: CanvasTraceLine[] | undefined | null,
  evidence: EvidenceRecord[] | undefined | null,
  snapshots: SnapshotMeta[] | undefined | null,
  range: CanvasRange | undefined | null,
  page?: CanvasPage | undefined | null,
): CanvasCard[] {
  const used = new Set<string>()
  const cards: CardDraft[] = []

  // ① 轨迹:脏时间/非对象行丢弃;filter+sort 都在新数组上,绝不动入参
  const lines = (traces ?? []).filter(
    (t) => t !== null && typeof t === 'object' && typeof t.cmd === 'string' && !Number.isNaN(msOf(t.at)),
  )
  lines.sort((a, b) => msOf(a.at) - msOf(b.at))
  let acc: RunAcc | null = null
  const flush = (): void => {
    if (acc !== null) cards.push(flushRun(used, acc))
    acc = null
  }
  for (const t of lines) {
    const k = classifyTrace(t.cmd)
    if (k.kind === 'unknown') continue // 归不了类:跳该行,不阻断其余
    const m = msOf(t.at)
    if (k.kind === 'chrome') {
      // chrome 单发探测无 session 可合:立即收口上一段,自成一张单步卡
      flush()
      acc = { type: 'browser', idKey: t.cmd, atMs: m, endMs: m, at: t.at, command: t.cmd, steps: [], p: null }
    } else if (
      acc === null
      || acc.type !== (k.kind === 'browser' ? 'browser' : 'schedule')
      || acc.idKey !== (k.kind === 'browser' ? k.session : k.command)
    ) {
      // 键变即换段:中间插过别家命令的同 session 行不算同一次运行(时间上已断开)
      flush()
      acc = {
        type: k.kind === 'browser' ? 'browser' : 'schedule',
        idKey: k.kind === 'browser' ? k.session : k.command,
        atMs: m, endMs: m, at: t.at, command: t.cmd, steps: [], p: null,
      }
    }
    acc.steps.push({
      cmd: t.cmd, ok: t.exitCode === 0, ms: t.ms, atMs: m,
      ...(t.shot !== undefined && t.shot.length > 0 ? { shot: t.shot } : {}),
    })
    acc.endMs = m
    // P 标注取末次出现(多步流程以最后一步的判定为代表)
    const p = P_NOTE.exec(t.outHead)
    if (p !== null) acc.p = Number(p[1])
  }
  flush()

  // ② 证据包:blocked(reason='blocked',命令从未执行,exitCode 恒 -1)与退出码双条件都拦,
  //    单看任何一个都能挡住当前形态,两个一起防未来形态漂移
  for (const e of evidence ?? []) {
    if (e === null || typeof e !== 'object' || Number.isNaN(msOf(e.at))) continue
    const m = msOf(e.at)
    const shot = e.afterShot ?? e.beforeShot ?? undefined
    cards.push({
      id: uniqueId(used, `site-${idSeg(e.site)}-${idStamp(e.at)}`),
      atMs: m, endMs: m,
      at: e.at,
      type: 'site',
      site: e.site,
      command: e.command,
      ok: e.result.exitCode === 0 && e.approval?.reason !== 'blocked',
      p: null,
      ms: 0,
      ...(shot !== undefined && shot.length > 0 ? { shot } : {}),
    })
  }

  // ③ 快照:采集链路只有成功(lastOk)才落快照,故 ok 恒 true;无耗时字段(ms=0)。
  //    命中同命令 schedule 轨迹卡且 snapAt ∈ [卡起始, 末步+120s] → 同一次运行,让位
  for (const s of snapshots ?? []) {
    if (s === null || typeof s !== 'object' || Number.isNaN(msOf(s.at))) continue
    const m = msOf(s.at)
    const dup = cards.some(
      (c) => c.type === 'schedule' && c.command === s.site && c.atMs <= m && m <= c.endMs + SNAPSHOT_MERGE_WINDOW_MS,
    )
    if (dup) continue
    cards.push({
      id: uniqueId(used, `schedule-${idSeg(s.site)}-${idStamp(s.at)}`),
      atMs: m, endMs: m,
      at: s.at,
      type: 'schedule',
      site: s.site.split(/\s+/)[0],
      command: s.site,
      ok: true,
      p: null,
      ms: 0,
    })
  }

  // ④ 时间过滤:to 先解析(空/非法→现在),from 缺省再相对 to 回退 24h(空值=最近 24h)
  const toV = msOf(String(range?.to ?? ''))
  const toMs = Number.isNaN(toV) ? Date.now() : toV
  const fromV = msOf(String(range?.from ?? ''))
  const fromMs = Number.isNaN(fromV) ? toMs - 24 * 60 * 60 * 1000 : fromV
  const filtered = cards.filter((c) => c.atMs >= fromMs && c.atMs <= toMs).sort((a, b) => b.atMs - a.atMs)
  const offset = Math.max(0, Math.floor(Number(page?.offset ?? 0)) || 0)
  const rawLimit = Math.floor(Number(page?.limit ?? CANVAS_PAGE_DEFAULT))
  const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? CANVAS_PAGE_DEFAULT : Math.min(500, rawLimit)
  return filtered.slice(offset, offset + limit).map(({ atMs: _a, endMs: _e, ...card }) => card)
}
