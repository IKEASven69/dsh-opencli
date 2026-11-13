// 运行级收件箱(0.1.4 候选 5)+ 深化轮四语义修的回归层。
// 三层:
// ① 纯函数层(tests/runinbox.test.ts 顶部):重试链归组/四态判定/未读口径/无产出真值表/状态键有界与随任务清理;
// ② 服务层:inbox-list 查询时合成、已读(单条+全部)、归档(单条+一键归档全部已读+无损降级仍可点开+
//    state.json 落盘+随任务删除清理)、无产出自动归档(by=auto)、日报排除归档(日结翻转 → 不产行/计数/尾行);
// ③ 四语义修各一断言(0.1.3 复核 low,深化轮审读钉过的四处):
//    ①auth 预检跳过行 receipt.stop_reason null;②skip-backoff 不覆写 lastDaemonVersion;
//    ③notify:false 任务也开熔断窗并记 schedule-failed;④access=unknown 按写轨。
// 收件箱意图(ctl 轻量面)与 .result.json 轮转:文件收件箱生命周期在 tests/inbox.test.ts,本文件补
// 候选 5 新意图的闭集校验与 drain 回路(桩执行器)。
// 隔离:DSH_OPENCLI_* 全套指向 tmp(vitest.config env 已给全局隔离,本文件再覆写 STATE/SNAPSHOTS/
// TRACE/REPORTS 指向本文件专属目录,防跨文件互相吃账)。
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { buildDigest, DigestDayLedger } from '../src/digest.ts'
import { applyIntent, parseIntent, drainInbox, type IntentExecutor } from '../src/inbox.ts'
import {
  boundInboxFlags, inboxFlagKey, inboxRunStatus, inboxUnreadCount, isNoOutputRun, purgeInboxFlags,
  synthesizeRunInbox, INBOX_FLAG_CAP, type InboxRunFlag, type RunHistoryRow,
} from '../src/runinbox.ts'
import { readFileSync, rmSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

// ── ① 纯函数层 ────────────────────────────────────────────────────────────────

const iso = (y: number, mo: number, d: number, h = 8, mi = 0): string => new Date(y, mo - 1, d, h, mi).toISOString()

describe('synthesizeRunInbox(候选 5 ①:run 级条目查询时合成)', () => {
  it('四态 typed 判定 + 重试链归组(#n/m 折一条,取最新行)+ 跨任务新→旧', () => {
    const runHistory: Record<string, RunHistoryRow[]> = {
      t1: [
        { at: iso(2026, 11, 14, 9, 30), ok: false, summary: '#3/3 fetch failed:boom' },
        { at: iso(2026, 11, 14, 9, 29), ok: false, summary: '#2/3 fetch failed:boom' },
        { at: iso(2026, 11, 14, 9, 28), ok: false, summary: '#1/3 fetch failed:boom' },
        { at: iso(2026, 11, 14, 8, 0), ok: true, summary: '[{"title":"A"}]', receipt: { auth_state: 'ok', bytes: 14, items: 1, stop_reason: 'end' } },
        { at: iso(2026, 11, 14, 7, 0), ok: true, summary: '[]', receipt: { auth_state: 'ok', bytes: 2, empty: true } },
      ],
      t2: [
        { at: iso(2026, 11, 14, 9, 0), ok: false, summary: '⏸ 跳过:浏览器扩展未连接', skip: true, receipt: { auth_state: 'auth_wall', bytes: 0, stop_reason: null, remaining_cursor: null } },
      ],
    }
    const entries = synthesizeRunInbox({ runHistory, sites: { t1: 'site zhihu hot', t2: 'site xhs search' }, flags: {} })
    // 重试链折成一条:5 行 → 4 条目(3 条失败链 + 1 成功 + 空=3);t2 跳过单条
    expect(entries).toHaveLength(4)
    // 新→旧:9:30(失败链头)→ 9:00(t2 跳过)→ 8:00(成功)→ 7:00(空)
    expect(entries[0]).toMatchObject({ task: 't1', at: iso(2026, 11, 14, 9, 30), status: 'fail', summary: '#3/3 fetch failed:boom' })
    expect(entries[2]).toMatchObject({ task: 't1', status: 'ok' })
    expect(entries[3]).toMatchObject({ task: 't1', status: 'empty' })
    // skip 行:typed skip=true → status skip;命令未执行 → 无 traceDate(诚实省键)
    expect(entries[1]).toMatchObject({ task: 't2', status: 'skip' })
    expect(entries[1]!.traceDate).toBeUndefined()
    // 非 skip 行有 trace 深链(本地 yyyymmdd)+ 早报日期指针
    expect(entries[0]!.traceDate).toBe('20261114')
    expect(entries[0]!.digestDate).toBe('2026-11-14')
    // 未读口径:未读且未归档(归档不产生红点噪音)
    expect(inboxUnreadCount(entries)).toBe(4)
  })

  it('链断不猜:窗口切开的半截链(#2/3 无 #1/3 前行)并入头,异分母/断分子不并', () => {
    const runHistory: Record<string, RunHistoryRow[]> = {
      t1: [
        { at: iso(2026, 11, 14, 10, 0), ok: false, summary: '#2/3 boom' },
        { at: iso(2026, 11, 14, 9, 0), ok: false, summary: '#3/3 boom' }, // 分子不衔接(2-1≠3):另一条 tick 的链头
        { at: iso(2026, 11, 13, 9, 0), ok: false, summary: '【已自愈重跑】#2/4 boom' }, // healthNote 包裹,分母 4≠3:不并入
      ],
    }
    const entries = synthesizeRunInbox({ runHistory, sites: {}, flags: {} })
    expect(entries).toHaveLength(3)
    expect(entries[0]!.summary).toBe('#2/3 boom')
    expect(entries[1]!.summary).toBe('#3/3 boom')
    expect(entries[2]!.summary).toBe('【已自愈重跑】#2/4 boom')
  })

  it('read/archived 状态按稳定键 task|at 套上;归档不计未读', () => {
    const runHistory: Record<string, RunHistoryRow[]> = {
      t1: [
        { at: iso(2026, 11, 14, 9, 0), ok: true, summary: '[{"x":1}]', receipt: { auth_state: 'ok', bytes: 8 } },
        { at: iso(2026, 11, 14, 8, 0), ok: true, summary: '[{"x":2}]', receipt: { auth_state: 'ok', bytes: 8 } },
      ],
    }
    const flags: Record<string, InboxRunFlag> = {
      [inboxFlagKey('t1', iso(2026, 11, 14, 9, 0))]: { read: true },
      [inboxFlagKey('t1', iso(2026, 11, 14, 8, 0))]: { archived: true, read: true, by: 'auto' },
    }
    const entries = synthesizeRunInbox({ runHistory, sites: {}, flags })
    expect(entries[0]).toMatchObject({ read: true, archived: false })
    expect(entries[1]).toMatchObject({ read: true, archived: true, archivedBy: 'auto' })
    expect(inboxUnreadCount(entries)).toBe(0)
  })

  it('状态键有界(超 INBOX_FLAG_CAP 裁最旧)+ 任务删除清理', () => {
    const flags: Record<string, InboxRunFlag> = {}
    for (let i = 0; i < INBOX_FLAG_CAP + 5; i++) flags[`t|${iso(2026, 11, 1, 0, i)}`] = { read: true }
    boundInboxFlags(flags)
    expect(Object.keys(flags)).toHaveLength(INBOX_FLAG_CAP)
    expect(flags['t|' + iso(2026, 11, 1, 0, 0)]).toBeUndefined() // 最旧被裁
    expect(flags['t|' + iso(2026, 11, 1, 0, INBOX_FLAG_CAP + 4)]).toBeDefined()
    flags['t2|orphan'] = { archived: true }
    expect(purgeInboxFlags(flags, 't2')).toBe(1)
    expect(flags['t2|orphan']).toBeUndefined()
    expect(Object.keys(flags)).toHaveLength(INBOX_FLAG_CAP)
    expect(purgeInboxFlags(undefined, 'x')).toBe(0)
  })

  it('isNoOutputRun 真值表(候选 5 ③:ok && receipt.empty && 无 diff && 无 watch && 非 skip,逐合取项钉)', () => {
    expect(isNoOutputRun({ ok: true, empty: true, diffed: false, watchHit: false, skip: false })).toBe(true)
    expect(isNoOutputRun({ ok: false, empty: true, diffed: false, watchHit: false, skip: false })).toBe(false) // !ok
    expect(isNoOutputRun({ ok: true, empty: false, diffed: false, watchHit: false, skip: false })).toBe(false) // 有产出
    expect(isNoOutputRun({ ok: true, empty: true, diffed: true, watchHit: false, skip: false })).toBe(false) // 有 diff
    expect(isNoOutputRun({ ok: true, empty: true, diffed: false, watchHit: true, skip: false })).toBe(false) // watch 命中
    expect(isNoOutputRun({ ok: true, empty: true, diffed: false, watchHit: false, skip: true })).toBe(false) // skip
  })

  it('inboxRunStatus typed 判定不解析 summary 文本', () => {
    expect(inboxRunStatus({ at: '', ok: false, summary: '⏸ 跳过:x', skip: true })).toBe('skip')
    expect(inboxRunStatus({ at: '', ok: false, summary: 'boom' })).toBe('fail')
    expect(inboxRunStatus({ at: '', ok: true, summary: '[]', receipt: { auth_state: 'ok', bytes: 2, empty: true } })).toBe('empty')
    expect(inboxRunStatus({ at: '', ok: true, summary: '[1]' })).toBe('ok')
  })
})

// ── 收件箱轻量意图闭集(候选 5 ④:白名单内,at 必须与 task 成对)─────────────────

describe('parseIntent: schedule-read / schedule-archive(候选 5 ④)', () => {
  it('合法形态通过(单条/任务全部/全部)', () => {
    expect(parseIntent({ kind: 'schedule-read', task: 't1', at: iso(2026, 11, 14, 9, 0) })).toMatchObject({ kind: 'schedule-read', task: 't1' })
    expect(parseIntent({ kind: 'schedule-read', task: 't1' })).toMatchObject({ kind: 'schedule-read', task: 't1' })
    expect(parseIntent({ kind: 'schedule-read' })).toEqual({ kind: 'schedule-read' })
    expect(parseIntent({ kind: 'schedule-archive', task: 't1', at: 'x' })).not.toBeNull()
    expect(parseIntent({ kind: 'schedule-archive' })).toEqual({ kind: 'schedule-archive' })
  })
  it('非法形态拒绝(at 孤给/多余字段/类型错/未知 kind)', () => {
    expect(parseIntent({ kind: 'schedule-read', at: iso(2026, 11, 14, 9, 0) })).toBeNull() // 缺 task
    expect(parseIntent({ kind: 'schedule-archive', task: '', at: 'x' })).toBeNull()
    expect(parseIntent({ kind: 'schedule-read', task: 't1', extra: 1 })).toBeNull()
    expect(parseIntent({ kind: 'schedule-archive', task: 3 })).toBeNull()
    expect(parseIntent({ kind: 'schedule-read-all' })).toBeNull()
  })
})

// ── ② 服务层 ─────────────────────────────────────────────────────────────────

/** 全字段桩执行器(calls 记调用;候选 5 ④⑤ 的 drain/applyIntent 用例共用)。 */
const stubExecutor = (calls: string[]): IntentExecutor => ({
  scheduleAdd: async (i) => { calls.push(`add:${i.site}`); return { ok: true, id: 'x' } },
  scheduleRemove: async (id) => { calls.push(`rm:${id}`); return { ok: true } },
  scheduleRun: async (id) => { calls.push(`run:${id}`); return { ok: true } },
  scheduleList: async () => ({ ok: true, schedules: [] }),
  scheduleRead: async (i) => { calls.push(`read:${i.task ?? ''}:${i.at ?? ''}`); return { ok: true, marked: 2 } },
  scheduleArchive: async (i) => { calls.push(`archive:${i.task ?? ''}:${i.at ?? ''}`); return { ok: true, archived: 3 } },
  notifySet: async () => ({ ok: true }), notifyTest: async () => ({ ok: true }), reportBuild: async () => ({ ok: true }),
  undo: async () => ({ ok: true }), backup: async () => ({ ok: true }), reportExport: async () => ({ ok: true }),
  status: async () => ({}), event: () => {},
})

const NEVER_CRON = '0 3 31 2 *'
const HOOK_URL = 'https://hook.example.com/runinbox-it'

class RBShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    if (cmd.includes('daemon status')) {
      return { exitCode: 0, stdout: { text: '{"ok":true,"data":{"ok":true,"pid":19616,"daemonVersion":"2.0.3","extensionConnected":true,"port":19825,"running":true}}\n' }, stderr: { text: '' } }
    }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}
class RBTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string }): void { this.registered.set(def.name, def) }
}
class RBSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type InboxEntry = { task: string; site: string; at: string; status: string; summary: string; read: boolean; archived: boolean; archivedBy?: string; traceDate?: string; digestDate?: string }
type Svc = {
  schedules: Array<{ id: string; site: string; cron: string; enabled: boolean; notify?: boolean; preflight?: boolean }>
  scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string }>
  scheduleRemove: (r: { id: string }) => Promise<{ ok: boolean }>
  notifyConfig: (r?: { channels?: unknown }) => Promise<{ ok: boolean }>
  runSiteCommand: (s: string, id: string, opts?: { manual?: boolean }) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<{ running: boolean; version?: string; extension?: string } | null>
  loginCheck: () => Promise<{ ok: boolean; checkedAt: string | null; results: Array<{ site: string; ok: boolean; timedOut: boolean; detail: string | null }> }>
  ingestEventList: Array<{ at: string; kind: string; text: string }>
  inboxList: () => Promise<{ ok: boolean; entries: InboxEntry[]; unread: number }>
  inboxRead: (p?: { task?: string; at?: string }) => Promise<{ ok: boolean; marked: number }>
  inboxArchive: (p?: { task?: string; at?: string }) => Promise<{ ok: boolean; archived: number }>
  state: { inboxFlags?: Record<string, { read?: boolean; archived?: boolean; by?: string }> }
  dailyDigestCheck: () => Promise<void>
  taskHealthCheck: (id: string) => Promise<{ ok: boolean; note?: string }>
  lastSelfHealAt: number
  lastDaemonVersion: string | undefined
  adapterCache: { at: number; json: unknown } | null
  circuitOpen: Map<string, number>
}

describe('运行级收件箱(服务层:合成/已读/归档/无产出自动归档/日报排除归档)+ 四语义修', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  let hookBodies: Array<{ title: string; body: string }>
  const uniq = `${process.pid}${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-runinbox-state-${uniq}.json`)
  const snapBase = join(os.tmpdir(), `dsh-opencli-runinbox-snap-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-runinbox-traces-${uniq}`)
  const reportsDir = join(os.tmpdir(), `dsh-opencli-runinbox-reports-${uniq}`)
  const saved: Array<[string, string | undefined]> = [
    ['DSH_OPENCLI_STATE', process.env.DSH_OPENCLI_STATE],
    ['DSH_OPENCLI_SNAPSHOTS_DIR', process.env.DSH_OPENCLI_SNAPSHOTS_DIR],
    ['DSH_OPENCLI_TRACE_DIR', process.env.DSH_OPENCLI_TRACE_DIR],
    ['DSH_OPENCLI_REPORTS_DIR', process.env.DSH_OPENCLI_REPORTS_DIR],
  ]
  const created: string[] = []

  /** 桩好 runOpencli/daemonStatus 跑一个 tick(注入输出;用毕还原)。先推时钟 1 分钟:
   *  假时钟冻结 Date.now,不推则同用例多条 run 的 at 全同——稳定键 task|at 互撞。 */
  const tick = async (site: string, id: string, out: { stdout?: string; exitCode?: number; stderr?: string } = {}, capture?: (args: unknown[]) => void): Promise<void> => {
    vi.setSystemTime(Date.now() + 60_000)
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    S.runOpencli = async (...a: unknown[]) => { capture?.(a); return { exitCode: out.exitCode ?? 0, stdout: out.stdout ?? '', stderr: out.stderr ?? '' } }
    S.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    try {
      await S.runSiteCommand(site, id)
    } finally {
      S.runOpencli = origRun
      S.daemonStatus = origDs
    }
  }

  const addTask = async (extra: Record<string, unknown> = {}): Promise<{ id: string; site: string }> => {
    // 假时钟冻结 Date.now:scheduleAdd 以 String(Date.now()) 为 id,不推时钟会同 id
    vi.setSystemTime(Date.now() + 1000)
    const site = `site rb-${Math.random().toString(36).slice(2, 8)} hot`
    const r = await S.scheduleAdd({ site, cron: NEVER_CRON, retry: 1, ...extra })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    return { id: r.id!, site }
  }

  /** 用例间时钟基线(单调前进):afterEach 若恒回拨到同一时刻,各用例首个 addTask 的
   *  id 恒同(任务/历史/快照互相串染)——每次拨快 1 小时,任务 id 天然唯一。 */
  let clockBase = new Date(2026, 10, 20, 10, 0, 0).getTime()

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    process.env.DSH_OPENCLI_REPORTS_DIR = reportsDir
    delete process.env.DSH_OPENCLI_DIGEST_DISABLE
    hookBodies = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === HOOK_URL) {
        hookBodies.push(JSON.parse(String(init?.body)) as { title: string; body: string })
        return new Response('ok', { status: 200 })
      }
      throw new Error('network unreachable (test default)')
    }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0, 0))
    ctx = new Context()
    await ctx.plugin(RBShell)
    await ctx.plugin(RBTools)
    await ctx.plugin(RBSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
    expect((await S.notifyConfig({ channels: [{ type: 'webhook', url: HOOK_URL, enabled: true }] })).ok).toBe(true)
    await S.dailyDigestCheck() // 首见只记日期基准(10:00),不发包
  })

  afterEach(() => {
    S.circuitOpen.clear() // 语义修③用例开过熔断窗:清窗防串染后续用例
    clockBase += 3_600_000
    vi.setSystemTime(new Date(clockBase))
  })

  afterAll(async () => {
    for (const id of created) await S.scheduleRemove({ id })
    vi.useRealTimers()
    vi.unstubAllGlobals()
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    delete process.env.DSH_OPENCLI_DIGEST_DISABLE
    for (const p of [statePath, snapBase, traceDir, reportsDir]) rmSync(p, { recursive: true, force: true })
  })

  it('① 合成+② 已读/归档:例行 run 进列表;点开即标已读;归档无损(仍可点开)且落盘 state.json', async () => {
    const t = await addTask()
    await tick(t.site, t.id, { stdout: '[{"title":"热点甲"}]' })
    const list = await S.inboxList()
    expect(list.ok).toBe(true)
    expect(list.unread).toBe(1)
    const e = list.entries.find((x) => x.task === t.id)!
    expect(e).toMatchObject({ status: 'ok', read: false, archived: false, site: t.site })
    expect(e.traceDate).toBe('20261120')
    expect(e.digestDate).toBe('2026-11-20')
    // 点开详情即标已读(候选 5 ②):单条 inbox-read
    const marked = await S.inboxRead({ task: e.task, at: e.at })
    expect(marked).toEqual({ ok: true, marked: 1 })
    expect((await S.inboxList()).unread).toBe(0)
    // 归档单条:无损降级——条目仍在列表(可点开只读),archived+read 同置,by=manual
    const arch = await S.inboxArchive({ task: e.task, at: e.at })
    expect(arch).toEqual({ ok: true, archived: 1 })
    const after = (await S.inboxList()).entries.find((x) => x.task === e.task)!
    expect(after.archived).toBe(true)
    expect(after.read).toBe(true)
    expect(after.archivedBy).toBe('manual')
    // 落盘:state.json 有稳定键(候选 5 ①:read/archived 以 task+at 存 state.json)
    const disk = JSON.parse(readFileSync(statePath, 'utf8')) as { inboxFlags?: Record<string, { read?: boolean; archived?: boolean; by?: string }> }
    expect(disk.inboxFlags?.[inboxFlagKey(e.task, e.at)]).toMatchObject({ read: true, archived: true, by: 'manual' })
    // 全部标已读入口(#27871):再跑一条,批量标已读只动未读的那条;随后一键归档已读清场
    // (不把已读未归档的尾巴留给下一个用例——全局归档按已读过滤,跨用例计数会串)
    await tick(t.site, t.id, { stdout: '[{"title":"热点乙"}]' })
    const m2 = await S.inboxRead()
    expect(m2).toEqual({ ok: true, marked: 1 })
    expect((await S.inboxArchive()).archived).toBe(1)
    expect((await S.inboxList()).unread).toBe(0)
    // 任务级定位(仅 task,省 at):该任务全部标已读 + 该任务已读归档
    await tick(t.site, t.id, { stdout: '[{"title":"热点丙"}]' })
    expect((await S.inboxRead({ task: t.id })).marked).toBe(1)
    expect((await S.inboxArchive({ task: t.id })).archived).toBe(1)
  })

  it('② 一键归档全部已读:未读的例行 run 不动;② 随任务删除清理', async () => {
    const t = await addTask()
    await tick(t.site, t.id, { stdout: '[{"title":"甲"}]' }) // run1
    await S.inboxRead() // run1 标已读
    await tick(t.site, t.id, { stdout: '[{"title":"乙"}]' }) // run2(未读)
    const arch = await S.inboxArchive()
    expect(arch.archived).toBe(1) // 只归档已读的那条
    const list = await S.inboxList()
    const byAt = list.entries.filter((x) => x.task === t.id)
    expect(byAt).toHaveLength(2)
    expect(byAt.filter((x) => x.archived)).toHaveLength(1)
    expect(list.unread).toBe(1) // run2 仍未读
    // 归档条目无损:点开仍出详情(条目在列表=runHistory 行未被动过;详情内容不受归档影响)
    const archivedOne = byAt.find((x) => x.archived)!
    expect(archivedOne.summary).toContain('甲')
    // 随任务删除清理(候选 5 ①):删除任务 → 该任务全部状态键消失
    const flagsBefore = Object.keys(S.state.inboxFlags ?? {}).filter((k) => k.startsWith(`${t.id}|`))
    expect(flagsBefore.length).toBeGreaterThan(0)
    expect((await S.scheduleRemove({ id: t.id })).ok).toBe(true)
    created.length = 0 // afterAll 不再重复删
    expect(Object.keys(S.state.inboxFlags ?? {}).filter((k) => k.startsWith(`${t.id}|`))).toHaveLength(0)
    const disk = JSON.parse(readFileSync(statePath, 'utf8')) as { inboxFlags?: Record<string, unknown> }
    expect(Object.keys(disk.inboxFlags ?? {}).filter((k) => k.startsWith(`${t.id}|`))).toHaveLength(0)
  })

  it('③ 无产出自动归档:[] 运行直沉归档(by=auto,不占未读);watch 命中不自动归档;跳过行不归档', async () => {
    await S.inboxRead() // 清零前序用例留下的未读基线:本用例断言「自动归档不产生未读」
    const tEmpty = await addTask()
    await tick(tEmpty.site, tEmpty.id, { stdout: '[]' }) // 空产出:ok+empty+无 diff+无命中
    const emptyEntry = (await S.inboxList()).entries.find((x) => x.task === tEmpty.id)!
    expect(emptyEntry.status).toBe('empty')
    expect(emptyEntry.archived).toBe(true)
    expect(emptyEntry.archivedBy).toBe('auto')
    // 自动归档不产生未读噪音(#12632④「不打扰」)
    expect((await S.inboxList()).unread).toBe(0)
    const disk1 = JSON.parse(readFileSync(statePath, 'utf8')) as { inboxFlags?: Record<string, { by?: string }> }
    expect(disk1.inboxFlags?.[inboxFlagKey(tEmpty.id, emptyEntry.at)]).toMatchObject({ archived: true, by: 'auto' })
    // watch 命中的 run 不自动归档(合取项不满足)
    const tWatch = await addTask({ watch: 'AI' })
    await tick(tWatch.site, tWatch.id, { stdout: '[{"title":"Agentic AI 系统"}]' })
    const watchEntry = (await S.inboxList()).entries.find((x) => x.task === tWatch.id)!
    expect(watchEntry.status).toBe('ok')
    expect(watchEntry.archived).toBe(false)
    // 跳过行(preflight 未过)不归档:跳过发生在执行前,连状态键都不写
    const tSkip = await addTask({ preflight: true })
    const origLc = S.loginCheck
    S.loginCheck = async () => ({ ok: true, checkedAt: iso(2026, 11, 20, 10), results: [{ site: tSkip.site.replace(/^site /, '').split(' ')[0]!, ok: false, timedOut: false, detail: '未登录' }] })
    try {
      await S.runSiteCommand(tSkip.site, tSkip.id)
    } finally {
      S.loginCheck = origLc
    }
    const skipEntry = (await S.inboxList()).entries.find((x) => x.task === tSkip.id)!
    expect(skipEntry.status).toBe('skip')
    expect(skipEntry.archived).toBe(false)
  })

  it('③ 日报排除归档:自动归档 run 不进 watch/例行空产出行;X 计数+尾行「自动归档 N 条无产出」', async () => {
    // 同日两个任务:空产出(自动归档)+ watch 命中(不归档)→ 日结翻转结算。
    // 日账换新起账:前序用例的入账清掉,计数断言不依赖用例顺序(内存日账本就随日结算换新)
    ;(S as unknown as { dayLedger: unknown }).dayLedger = new DigestDayLedger('2026-11-20')
    const tA = await addTask()
    await tick(tA.site, tA.id, { stdout: '[]' })
    const tB = await addTask({ watch: 'AI' })
    await tick(tB.site, tB.id, { stdout: '[{"title":"Agentic AI 论文"}]' })
    const before = hookBodies.length
    vi.setSystemTime(new Date(2026, 10, 21, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(before + 1)
    const body = hookBodies[hookBodies.length - 1]!.body
    // 归档条目不进日报任何行:B 的 watch 行在,A 不产生例行空产出标记(未归档空产出=0)
    expect(body).toContain('🔔')
    expect(body).toContain('1 空产出已归档') // 首行 X
    expect(body).toContain('自动归档 1 条无产出') // 尾行计数(候选 5 ③防不可见)
    expect(body).not.toContain(`空产出 1(未归档)`)
    const j = JSON.parse(readFileSync(join(reportsDir, 'digest-2026-11-20.json'), 'utf8')) as {
      totals: { archivedEntries: number; autoArchived: number }
      routine: Array<{ task: string; empty?: number }>
      watch: Array<{ task: string }>
    }
    expect(j.totals.archivedEntries).toBe(1)
    expect(j.totals.autoArchived).toBe(1)
    const routineA = j.routine.find((r) => r.task === tA.site)
    expect(routineA).toBeDefined()
    expect(routineA!.empty).toBeUndefined() // 空产出已归档:不进「未归档空产出」行
    expect(j.watch.find((w) => w.task === tB.site)).toBeDefined()
  })

  // ── ③ 四语义修(0.1.3 复核 low,深化轮审读钉过的四处,各一断言)─────────────────

  it('语义修①:auth 预检跳过行 receipt.stop_reason=null(命令未执行,未知恒 null)', async () => {
    const t = await addTask({ preflight: true })
    const origLc = S.loginCheck
    S.loginCheck = async () => ({ ok: true, checkedAt: iso(2026, 11, 20, 10), results: [{ site: t.site.replace(/^site /, '').split(' ')[0]!, ok: false, timedOut: false, detail: '登录已过期' }] })
    try {
      await S.runSiteCommand(t.site, t.id)
    } finally {
      S.loginCheck = origLc
    }
    const row = (S as unknown as { runHistory: Record<string, Array<{ receipt?: { stop_reason?: string | null }; skip?: true; summary: string }>> }).runHistory[t.id]![0]!
    expect(row.skip).toBe(true)
    expect(row.receipt?.stop_reason).toBeNull() // 修前硬编码 'error'
    expect(row.receipt?.stop_reason).not.toBe('error')
  })

  it('语义修②:skip-backoff 分支保留旧基线(翻转不被基线覆写吃掉);退避过后可自愈并更新基线', async () => {
    const svc = S as unknown as { lastDaemonVersion: string | undefined; lastSelfHealAt: number; taskHealthCheck: (id: string) => Promise<{ ok: boolean; note?: string }> }
    svc.lastDaemonVersion = '2.0.2'
    svc.lastSelfHealAt = Date.now() // 假时钟冻结:退避窗内 → selfHealDaemon 直接 skip-backoff
    const hc = await svc.taskHealthCheck('no-such-task')
    expect(hc.ok).toBe(true) // skip 放行
    expect(svc.lastDaemonVersion).toBe('2.0.2') // 修前被覆写为 2.0.3,翻转从此检测不到
    // 退避窗外(lastSelfHealAt=0):同一次翻转仍可识别并自愈,愈后基线更新为翻转后版本
    const origRun = S.runOpencli
    S.runOpencli = async (...a: unknown[]) => {
      const a0 = Array.isArray(a[0]) ? (a[0] as string[])[0] : a[0]
      if (a0 === 'daemon') return { exitCode: 0, stdout: '', stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    }
    svc.lastSelfHealAt = 0
    try {
      const hc2 = await svc.taskHealthCheck('no-such-task')
      expect(hc2.ok).toBe(true)
      expect(svc.lastDaemonVersion).toBe('2.0.3')
      expect(hc2.note).toContain('版本翻转')
    } finally {
      S.runOpencli = origRun
    }
  })

  it('语义修③:notify:false 任务失败也开熔断窗并记 schedule-failed(诊断面不看 notify)', async () => {
    const t = await addTask({ notify: false })
    const kindsBefore = S.ingestEventList.filter((e) => e.kind === 'circuit-open' || e.kind === 'schedule-failed').length
    const sentBefore = hookBodies.length
    await tick(t.site, t.id, { exitCode: 1, stderr: 'fetch failed: undici socket hang up' })
    const kinds = S.ingestEventList.filter((e) => e.kind === 'circuit-open' || e.kind === 'schedule-failed')
    expect(kinds.length).toBe(kindsBefore + 2) // 修前 notify:false 两者皆无
    expect(kinds.some((e) => e.kind === 'circuit-open')).toBe(true)
    expect(kinds.some((e) => e.kind === 'schedule-failed')).toBe(true)
    expect(hookBodies.length).toBe(sentBefore) // 外送通知仍被任务级关闸(notify:false 不外送,零增量)
  })

  it('语义修④:冷缓存 access=unknown 按写轨(与审批门「权限不明按写」同口径);清单命中 read 走读轨', async () => {
    const t = await addTask()
    let govKind: unknown
    await tick(t.site, t.id, { stdout: '[1]' }, (args) => { govKind = args[4] })
    expect(govKind).toBe('write') // adapterCache=null → unknown → write(修前按 read)
    const siteName = t.site.replace(/^site /, '').split(' ')[0]!
    S.adapterCache = { at: Date.now(), json: [{ site: siteName, name: 'hot', access: 'read' }] }
    try {
      await tick(t.site, t.id, { stdout: '[2]' }, (args) => { govKind = args[4] })
      expect(govKind).toBe('read')
    } finally {
      S.adapterCache = null
    }
  })

  it('日报纯函数对照:DigestDayLedger 入账 archived/autoArchived → buildDigest 总览/尾行/json 同源', () => {
    const ledger = new DigestDayLedger('2026-11-20')
    ledger.record('t1', 'site x hot', undefined, { at: iso(2026, 11, 20, 9), ok: true, summary: '[]', empty: true, archived: true, autoArchived: true })
    const built = buildDigest({
      date: '2026-11-20',
      genAt: new Date(2026, 10, 21, 0, 0, 30),
      ledger,
      streakOf: () => 0,
      attributions: new Map(),
    })
    expect(built.overview).toContain('1 空产出已归档')
    expect(built.card).toContain('自动归档 1 条无产出')
    expect(built.json.totals.autoArchived).toBe(1)
    expect(built.json.routine[0]).not.toHaveProperty('empty')
  })

  it('候选 5 ⑤:.result.json 写后轮转——根目录只留最近 100 份(对齐 processed/ 惯例)', async () => {
    // 收件箱隔离:不与真实 ~/.dsh/opencli-inbox 混;服务侧 3s 轮询可能先消费意图(其执行器
    // 同样会写回执+轮转),故只断言文件面,不断言本次 drain 计数(消费主体无关紧要)
    const dir = mkdtempSync(join(os.tmpdir(), 'dsh-opencli-runinbox-inbox-'))
    const savedInbox = process.env.DSH_OPENCLI_INBOX_DIR
    process.env.DSH_OPENCLI_INBOX_DIR = dir
    try {
      // 预置 105 份陈旧回执(时间序命名)+ 1 条合法意图
      for (let i = 0; i < 105; i++) writeFileSync(join(dir, `${1000 + i}-stale.result.json`), JSON.stringify({ ok: true, at: '', kind: 'status' }))
      writeFileSync(join(dir, `9999-cur.json`), JSON.stringify({ kind: 'status' }))
      await drainInbox(stubExecutor([]))
      const results = readdirSync(dir).filter((f) => f.endsWith('.result.json')).sort()
      expect(results.length).toBe(100) // 105 陈旧 + 1 新写 → 裁到 100
      expect(results[0]).toBe('1006-stale.result.json') // 最旧 6 份(1000-1005)被裁
      expect(results).toContain('9999-cur.result.json')
      expect(readdirSync(dir).some((f) => f === 'processed')).toBe(true)
    } finally {
      if (savedInbox === undefined) delete process.env.DSH_OPENCLI_INBOX_DIR
      else process.env.DSH_OPENCLI_INBOX_DIR = savedInbox
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('候选 5 ④ applyIntent 回路:schedule-read/archive 携 task/at 到执行器,value 带计数', async () => {
    const calls: string[] = []
    const ex = stubExecutor(calls)
    const r1 = await applyIntent(parseIntent({ kind: 'schedule-read', task: 't9', at: iso(2026, 11, 14, 9, 0) })!, ex)
    expect(r1).toMatchObject({ ok: true, kind: 'schedule-read', value: { marked: 2 } })
    const r2 = await applyIntent(parseIntent({ kind: 'schedule-archive' })!, ex)
    expect(r2).toMatchObject({ ok: true, kind: 'schedule-archive', value: { archived: 3 } })
    expect(calls).toContain(`read:t9:${iso(2026, 11, 14, 9, 0)}`)
    expect(calls).toContain('archive::')
    // 白名单外形状进不了执行器(闭集防线):at 孤给在 parseIntent 即拒(到不了 applyIntent)
    expect(parseIntent({ kind: 'schedule-read', at: iso(2026, 11, 14, 9, 0) })).toBeNull()
  })
})
