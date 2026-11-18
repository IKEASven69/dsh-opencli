// 调度补跑 catch-up 服务层(0.1.6 C1,plan §一)。
// 语义:环境类跳过(扩展未连/daemon 未运行)或登录墙跳过挂当日债(pendingCatchup 单槽),
// 当日环境恢复后由 tick 的 catchupCheck 自动补跑一次——有界(窗口 4h/间隔 30min/次数 16/
// 熔断窗静默),清债=成功或补跑命令级失败,续债=补跑再跳过,过期=换日/窗口外。
// 桩时钟:vi.useFakeTimers 只假 Date(schedule-quiet-staging 同款);执行全由 runSiteCommand
// 直调 + catchupCheck 直调驱动,NEVER_CRON 让后台 tick 空转。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

const NEVER_CRON = '0 3 31 2 *'
const OK_NOTE = { ok: true } as const
const EXT_DOWN = { ok: false, note: '浏览器扩展未连接——本 tick 跳过;打开浏览器后自动恢复,任务保留' } as const

class CatchupShell extends Service {
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
class CatchupTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(): void {}
}
class CatchupPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type Pending = { forDay: string; skippedAt: string; reason: 'environment' | 'auth-wall'; attempts: number; lastAttemptAt?: string }
type Sched = { id: string; site: string; cron: string; enabled: boolean; pendingCatchup?: Pending }
type Priv = {
  schedules: Sched[]
  runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string; skip?: boolean }>>
  catchupCheck: (now: Date) => Promise<void>
  circuitOpen: Map<string, number>
  pushIngestEvent: (kind: string, text: string) => void
  taskHealthCheck: (id: string) => Promise<{ ok: boolean; note?: string }>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}
type Svc = {
  schedules: Sched[]
  scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string }>
  scheduleRemove: (r: { id: string }) => Promise<{ ok: boolean }>
  runSiteCommand: (s: string, id: string, opts?: { manual?: boolean; catchup?: boolean }) => Promise<void>
}

/** 基准日(本地时区):07:00 跳过、07:40 恢复补跑、11:01 窗外、次日换日。 */
const D = (h: number, m: number, day = 19): Date => new Date(2026, 10, day, h, m, 0)
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('调度补跑 catch-up(0.1.6 C1:挂债/续债/清债/有界)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  let P: Priv
  const uniq = `${process.pid}-${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-catchup-state-${uniq}.json`)
  const snapBase = join(os.tmpdir(), `dsh-opencli-catchup-snap-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-catchup-traces-${uniq}`)
  const saved = { state: process.env.DSH_OPENCLI_STATE, snap: process.env.DSH_OPENCLI_SNAPSHOTS_DIR, trace: process.env.DSH_OPENCLI_TRACE_DIR }
  const created: string[] = []
  /** 事件捕获(包装 pushIngestEvent,schedule-drift-wiring 同款) */
  let events: Array<{ kind: string; text: string }> = []
  let runCount = 0

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    ctx = new Context()
    await ctx.plugin(CatchupShell)
    await ctx.plugin(CatchupTools)
    await ctx.plugin(CatchupPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
    P = ctx.opencli as unknown as Priv
    const origPush = P.pushIngestEvent.bind(S)
    P.pushIngestEvent = (kind: string, text: string) => { events.push({ kind, text }); origPush(kind, text) }
  })

  afterAll(async () => {
    for (const id of created) await S.scheduleRemove({ id })
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    for (const [k, v] of [['DSH_OPENCLI_STATE', saved.state], ['DSH_OPENCLI_SNAPSHOTS_DIR', saved.snap], ['DSH_OPENCLI_TRACE_DIR', saved.trace]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(statePath, { force: true })
    rmSync(snapBase, { recursive: true, force: true })
    rmSync(traceDir, { recursive: true, force: true })
  })

  /** 建任务;health/runOpencli 双桩:health 决定跳过与恢复,runOpencli 决定采集成败并计数。
   *  backoffMs=0:失败路径的重试退避是真实睡眠(默认 15s×n),测试里零退避防 5s 超时。 */
  const addTask = async (): Promise<Sched> => {
    const site = `site cu-${Math.random().toString(36).slice(2, 8)} hot`
    const r = await S.scheduleAdd({ site, cron: NEVER_CRON, backoffMs: 0 })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    return S.schedules.find((s) => s.id === r.id)!
  }
  /** 桩时钟定到 at;health 桩 + runOpencli 桩(计数)finally 还原。 */
  const at = async (t: Date, health: { ok: boolean; note?: string } = OK_NOTE, exitCode = 0): Promise<void> => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(t)
    const origHealth = P.taskHealthCheck
    const origRun = P.runOpencli
    P.taskHealthCheck = async () => health
    P.runOpencli = async (...a: unknown[]) => { void a; runCount += 1; return { exitCode, stdout: '[{"title":"x"}]', stderr: '' } }
    try {
      await P.catchupCheck(t)
    } finally {
      P.taskHealthCheck = origHealth
      P.runOpencli = origRun
      vi.useRealTimers()
    }
  }

  it('① cron 轮环境跳过 → 挂当日债(reason=environment,attempts=0)+ schedule-skipped 事件', async () => {
    const sch = await addTask()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try {
      await S.runSiteCommand(sch.site, sch.id) // cron 形态:无 opts
    } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    expect(sch.pendingCatchup).toEqual({ forDay: dayKey(D(7, 0)), skippedAt: D(7, 0).toISOString(), reason: 'environment', attempts: 0 })
    expect(events.filter((e) => e.kind === 'schedule-skipped')).toHaveLength(1)
    expect(events.at(-1)!.kind === 'schedule-skipped' && events.at(-1)!.text).not.toContain('补跑尝试')
  })

  it('② 立即首轮补跑仍失败 → 续债(attempts++/lastAttemptAt,文本带「补跑尝试」)', async () => {
    const sch = S.schedules[0]!
    await at(D(7, 5), EXT_DOWN)
    expect(sch.pendingCatchup).toBeDefined()
    expect(sch.pendingCatchup!.attempts).toBe(1)
    expect(sch.pendingCatchup!.lastAttemptAt).toBe(D(7, 5).toISOString())
    expect(S.runHistory[sch.id]![0]!.summary).toContain('补跑尝试 1')
  })

  it('③ 间隔不足(30 分钟内)→ 不发起;④ 07:40 恢复 → 补跑一次:🔄 行+catchup 事件+清债', async () => {
    const sch = S.schedules[0]!
    runCount = 0
    events = []
    await at(D(7, 20), OK_NOTE) // 距 lastAttemptAt 15 分钟 < 30 → 不发起
    expect(runCount).toBe(0)
    expect(sch.pendingCatchup).toBeDefined()
    await at(D(7, 40), OK_NOTE, 0) // 距上次尝试 35 分钟,环境恢复 → 补跑
    expect(runCount).toBe(1)
    expect(sch.pendingCatchup).toBeUndefined() // 成功清债
    const row = S.runHistory[sch.id]![0]!
    expect(row.ok).toBe(true)
    expect(row.summary).toContain('🔄')
    expect(events.some((e) => e.kind === 'schedule-catchup')).toBe(true)
  })

  it('⑤ 清债后不再二次补跑(单次语义)', async () => {
    const sch = S.schedules[0]!
    runCount = 0
    await at(D(8, 0), OK_NOTE)
    expect(runCount).toBe(0)
    expect(sch.pendingCatchup).toBeUndefined()
  })

  it('⑥ 窗口外(>4h)→ 债清除且不补跑', async () => {
    const sch = await addTask()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try { await S.runSiteCommand(sch.site, sch.id) } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    expect(sch.pendingCatchup).toBeDefined()
    await at(D(11, 1), OK_NOTE) // 距跳过 4h01m > 240min
    expect(sch.pendingCatchup).toBeUndefined()
    expect(S.runHistory[sch.id]!.every((r) => r.skip === true)).toBe(true) // 没有真实 run 发生
  })

  it('⑦ env 禁用(DSH_OPENCLI_CATCHUP_DISABLE=1)→ 不发起(债保留,恢复 env 后照常)', async () => {
    const sch = await addTask()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try { await S.runSiteCommand(sch.site, sch.id) } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    process.env.DSH_OPENCLI_CATCHUP_DISABLE = '1'
    try {
      await at(D(8, 0), OK_NOTE)
      expect(sch.pendingCatchup).toBeDefined() // 债保留(判定轮整体短路)
      expect(S.runHistory[sch.id]!.every((r) => r.skip === true)).toBe(true)
    } finally { delete process.env.DSH_OPENCLI_CATCHUP_DISABLE }
    await at(D(8, 40), OK_NOTE) // env 恢复后照常补
    expect(sch.pendingCatchup).toBeUndefined()
  })

  it('⑧ 补跑命令级失败 → 债清(不循环失败)+ 失败行照常 + 不发 catchup 成功事件', async () => {
    const sch = await addTask()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try { await S.runSiteCommand(sch.site, sch.id) } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    events = []
    await at(D(7, 40), OK_NOTE, 1) // 恢复但命令失败
    expect(sch.pendingCatchup).toBeUndefined() // 试过不循环
    const row = S.runHistory[sch.id]![0]!
    expect(row.ok).toBe(false)
    expect(row.summary).toContain('🔄') // 失败行同带补跑标记(失败说真话且可辨识)
    expect(events.some((e) => e.kind === 'schedule-catchup')).toBe(false) // 成功事件不双发
  })

  it('⑨ 熔断窗活跃 → catchupCheck 整体不发起(债保留)', async () => {
    const sch = await addTask()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try { await S.runSiteCommand(sch.site, sch.id) } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    runCount = 0
    // 熔断窗时间戳用与假时钟一致的固定值(07:39,距 07:40 的 now 1 分钟 < 30min 窗):
    // 用真实 Date.now() 会被假时钟(过去时刻)算成已过期
    P.circuitOpen.set('fetch-failed', D(7, 39).getTime())
    try {
      await at(D(7, 40), OK_NOTE)
      expect(runCount).toBe(0)
      expect(sch.pendingCatchup).toBeDefined() // 债保留,出窗后按间隔继续
    } finally { P.circuitOpen.clear() }
  })

  it('⑩ 换日 → 昨日挂债清除;manual 手动轮跳过不挂债', async () => {
    const sch = await addTask()
    // 手动轮(manual)跳过:不挂债
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(D(7, 0))
    const origHealth = P.taskHealthCheck
    P.taskHealthCheck = async () => EXT_DOWN
    try { await S.runSiteCommand(sch.site, sch.id, { manual: true }) } finally { P.taskHealthCheck = origHealth; vi.useRealTimers() }
    expect(sch.pendingCatchup).toBeUndefined()
    // 昨日债:换日判定清除
    sch.pendingCatchup = { forDay: dayKey(D(7, 0)), skippedAt: D(7, 0).toISOString(), reason: 'environment', attempts: 0 }
    await at(D(7, 0, 20), OK_NOTE) // 次日同刻
    expect(sch.pendingCatchup).toBeUndefined()
  })
})
