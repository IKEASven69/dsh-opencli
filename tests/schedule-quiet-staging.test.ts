// quietHours 暂存链服务层(0.1.3 C⑥:发现 13「worthPushing 门与暂存链单元零覆盖」补强)。
// runSiteCommand 收尾的通知段(index.ts:notifyLevel/quietHours 分支 → dispatchScheduleNotify):
//   ① worthPushing 门:notifyLevel=quiet 只推有价值信号(失败/watch 命中/有变化),例行成功
//      窗内不暂存、窗外不推送;非 quiet 任务不受此门;
//   ② 窗内暂存:进 sch.pendingNotify(上限 20,slice(-20) 裁最旧),不外送;
//   ③ 出窗首跑:暂存合并进正文(😴 静默期合并 N 条)一次推送 → 清空 → saveState 回写落盘。
// 桩时钟:vi.useFakeTimers 只假 Date(setTimeout/setInterval 真实,I/O 不受影响),
// vi.setSystemTime 注入窗内(03:00)/窗外(12:00)本地时刻;通道=webhook,全局 fetch 桩捕获零外发。
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

/** 永不触发的 cron(notify.test.ts 同款):后台 tick 空转,执行全由 runSiteCommand 直调驱动 */
const NEVER_CRON = '0 3 31 2 *'
const HOOK_URL = 'https://hook.example.com/quiet-it'
const QUIET = '01:00-05:00'
/** 窗内/窗外本地时刻(inQuietHours 按本地时钟判定,构造同用本地时区) */
const IN_WINDOW = new Date(2026, 10, 10, 3, 0, 0)
const OUT_WINDOW = new Date(2026, 10, 10, 12, 0, 0)
const HIT_OUT = '[{"title":"热点A 降薪"}]'
const ROUTINE_OUT = '[{"title":"普通B"}]'

class QuietShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    if (cmd.includes('daemon status')) {
      return { exitCode: 0, stdout: { text: '{"ok":true,"data":{"ok":true,"pid":19616,"daemonVersion":"2.0.3","extensionConnected":true,"port":19825,"running":true}}\n\n  Extension update available: v1.0.26 → v1.0.27\n' }, stderr: { text: '' } }
    }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}
class QuietTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string }): void { this.registered.set(def.name, def) }
}
class QuietSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type Pending = { at: string; ok: boolean; summary: string; hits: number; diff: boolean }
type Sched = { id: string; site: string; cron: string; notifyLevel?: string; quietHours?: string; pendingNotify?: Pending[] }
type Svc = {
  schedules: Sched[]
  scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string }>
  scheduleRemove: (r: { id: string }) => Promise<{ ok: boolean }>
  notifyConfig: (r?: { channels?: unknown }) => Promise<{ ok: boolean }>
  runSiteCommand: (s: string, id: string) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<unknown>
}

describe('quietHours 暂存链(服务层:worthPushing 门 / 上限 20 / 出窗首跑合并 / 清空回写)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  let hookBodies: Array<{ title: string; body: string }>
  const uniq = `${process.pid}-${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-quiet-it-state-${uniq}.json`)
  const snapBase = join(os.tmpdir(), `dsh-opencli-quiet-it-snap-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-quiet-it-traces-${uniq}`)
  const saved = { state: process.env.DSH_OPENCLI_STATE, snap: process.env.DSH_OPENCLI_SNAPSHOTS_DIR, trace: process.env.DSH_OPENCLI_TRACE_DIR }
  const created: string[] = []

  beforeAll(async () => {
    // 隔离目录先于插件装载设好(构造器读 env)
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    hookBodies = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === HOOK_URL) {
        hookBodies.push(JSON.parse(String(init?.body)) as { title: string; body: string })
        return new Response('ok', { status: 200 })
      }
      throw new Error('network unreachable (test default)')
    }))
    ctx = new Context()
    await ctx.plugin(QuietShell)
    await ctx.plugin(QuietTools)
    await ctx.plugin(QuietSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
    expect((await S.notifyConfig({ channels: [{ type: 'webhook', url: HOOK_URL, enabled: true }] })).ok).toBe(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    for (const id of created) await S.scheduleRemove({ id })
    vi.unstubAllGlobals()
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

  /** 建任务(site 唯一化,watch 固定「降薪」)。 */
  const addTask = async (extra: Record<string, unknown>): Promise<Sched> => {
    const site = `site qh-${Math.random().toString(36).slice(2, 8)} hot`
    const r = await S.scheduleAdd({ site, cron: NEVER_CRON, watch: '降薪', ...extra })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    return S.schedules.find((s) => s.id === r.id)!
  }

  /** 桩时钟定到 at,跑一个 tick(输出/退出码注入);runOpencli/daemonStatus 方法桩 finally 还原。 */
  const tickAt = async (sch: Sched, at: Date, out: { stdout?: string; exitCode?: number; stderr?: string }): Promise<void> => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at)
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    S.runOpencli = async () => ({ exitCode: out.exitCode ?? 0, stdout: out.stdout ?? '', stderr: out.stderr ?? '' })
    S.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    try {
      await S.runSiteCommand(sch.site, sch.id)
    } finally {
      S.runOpencli = origRun
      S.daemonStatus = origDs
      vi.useRealTimers()
    }
  }

  it('① 门:quiet + 窗内 + 例行成功 → 不暂存也不推送(门关)', async () => {
    const sch = await addTask({ notifyLevel: 'quiet', quietHours: QUIET })
    const n = hookBodies.length
    await tickAt(sch, IN_WINDOW, { stdout: ROUTINE_OUT })
    expect(sch.pendingNotify ?? []).toHaveLength(0)
    expect(hookBodies.length).toBe(n)
  })

  it('① 门:quiet + 窗外 + 例行成功 → 零推送(只推有价值信号)', async () => {
    const sch = await addTask({ notifyLevel: 'quiet', quietHours: QUIET })
    const n = hookBodies.length
    await tickAt(sch, OUT_WINDOW, { stdout: ROUTINE_OUT })
    expect(hookBodies.length).toBe(n)
  })

  it('①② quiet + 窗内 + watch 命中 → 进暂存(hits=1),不外送', async () => {
    const sch = await addTask({ notifyLevel: 'quiet', quietHours: QUIET })
    const n = hookBodies.length
    await tickAt(sch, IN_WINDOW, { stdout: HIT_OUT })
    expect(sch.pendingNotify).toHaveLength(1)
    expect(sch.pendingNotify![0]).toMatchObject({ ok: true, hits: 1 })
    expect(sch.pendingNotify![0]!.summary).toContain('降薪')
    expect(hookBodies.length).toBe(n)
  })

  it('①② quiet + 窗内 + 失败 → 进暂存(ok:false,失败必推不被门挡)', async () => {
    const sch = await addTask({ notifyLevel: 'quiet', quietHours: QUIET, retry: 1 })
    const n = hookBodies.length
    await tickAt(sch, IN_WINDOW, { exitCode: 1, stderr: 'site 500 boom' })
    expect(sch.pendingNotify).toHaveLength(1)
    expect(sch.pendingNotify![0]).toMatchObject({ ok: false, hits: 0 })
    expect(hookBodies.length).toBe(n)
  })

  it('② 非 quiet 任务不受门约束:窗内例行成功同样暂存', async () => {
    const sch = await addTask({ quietHours: QUIET })
    const n = hookBodies.length
    await tickAt(sch, IN_WINDOW, { stdout: ROUTINE_OUT })
    expect(sch.pendingNotify).toHaveLength(1)
    expect(sch.pendingNotify![0]).toMatchObject({ ok: true, hits: 0 })
    expect(hookBodies.length).toBe(n)
  })

  it('②③ 上限 20(裁最旧)→ 出窗首跑合并推送一次 → 清空并回写 state.json', async () => {
    const sch = await addTask({ notifyLevel: 'quiet', quietHours: QUIET })
    // 预填 22 条(模拟长静默窗累积),再来一次窗内命中:23 → slice(-20) 裁掉最旧 3 条
    sch.pendingNotify = Array.from({ length: 22 }, (_, i) => ({ at: new Date(2026, 10, 10, 2, i).toISOString(), ok: true, summary: `filler-${i}`, hits: 0, diff: false }))
    await tickAt(sch, IN_WINDOW, { stdout: HIT_OUT })
    expect(sch.pendingNotify).toHaveLength(20)
    expect(sch.pendingNotify![0]!.summary).toBe('filler-3') // 最旧 filler-0..2 被裁
    expect(sch.pendingNotify![19]).toMatchObject({ ok: true, hits: 1 }) // 最新一条是本 tick 的命中
    // 出窗首跑(有价值:watch 命中;同输出无 diff):暂存合并进正文一次推送
    const n = hookBodies.length
    await tickAt(sch, OUT_WINDOW, { stdout: HIT_OUT })
    expect(hookBodies.length).toBe(n + 1)
    const sent = hookBodies[hookBodies.length - 1]!.body
    expect(sent).toContain(`😴 静默期(${QUIET})合并 20 条`)
    // 合并段逐条:裁剩的 filler-3..21(19 条)按暂存序 + 1 条窗内命中(🔔 标记)
    const fillers = [...sent.matchAll(/✓ filler-(\d+)/g)].map((m) => Number(m[1]))
    expect(fillers).toEqual(Array.from({ length: 19 }, (_, i) => i + 3))
    expect(sent).toMatch(/- \d{2}:\d{2} ✓ 🔔 /)
    // 清空(内存)+ 回写(落盘):重启后不会把已推送的暂存再推一遍
    expect(sch.pendingNotify).toEqual([])
    const disk = JSON.parse(readFileSync(statePath, 'utf8')) as { schedules: Sched[] }
    const onDisk = disk.schedules.find((s) => s.id === sch.id)
    expect(onDisk).toBeDefined()
    expect(onDisk!.pendingNotify ?? []).toEqual([])
  })
})
