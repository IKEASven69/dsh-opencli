// 拟人限速 jitter 语义(0.1.3 C①:发现 8「0.1.2 P0-1 零行为测试」补强——此前所有测试都把
// DSH_OPENCLI_JITTER_MAX_MS 设 0 关闸,行为本身从未被断言)。锁定五条语义:
//   ① 默认随机窗 15-90s(env 未设):首跑前恰一次 sleep,时长落在 [15000, 90000];
//   ② 上限钳制 600_000 / 小上限退化为定长(lo=min(15000,hi))/ 置 0 关闸;
//   ③ 任务级 jitter:false 关闸;④ 手动跑(manual:true)豁免;
//   ⑤ 预检先于 jitter:健康预检/登录态预检未过 ⏸ 跳过本 tick 时不付 jitter 等待。
// 时钟注入:setTimeout 桩记录 sleep 请求并立即放行(默认窗不真等 15-90s);另一条用小上限 env
// 走真实时钟,证明 sleep 确实发生在 runSiteCommand 关键路径上。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

/** 永不触发的 cron(2 月 31 日,notify.test.ts 同款):startScheduler 的后台 tick 空转,
 *  执行全部由 runSiteCommand 直调驱动——后台 tick 若撞时刻并发跑同任务,会把它的 sleep 混进记录 */
const NEVER_CRON = '0 3 31 2 *'

class StubShell extends Service {
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
class StubTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string }): void { this.registered.set(def.name, def) }
}
class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type Sched = { id: string; site: string; cron: string; createdAt: string; enabled: boolean; retry?: number; jitter?: boolean; preflight?: boolean }
type Svc = {
  schedules: Sched[]
  runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string }>>
  ingestEventList: Array<{ kind: string; text: string }>
  runSiteCommand: (s: string, id: string, opts?: { manual?: boolean }) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<unknown>
  loginCheck: () => Promise<unknown>
}

describe('拟人限速 jitter(0.1.2 P0-1 语义锁定)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  const snapBase = join(os.tmpdir(), `dsh-opencli-jitter-snap-${process.pid}-${Date.now()}`)
  const origJitter = process.env.DSH_OPENCLI_JITTER_MAX_MS
  const origSnap = process.env.DSH_OPENCLI_SNAPSHOTS_DIR

  beforeAll(async () => {
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable (test default)') }))
    ctx = new Context()
    await ctx.plugin(StubShell)
    await ctx.plugin(StubTools)
    await ctx.plugin(StubSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    // env 复位到装载前的值(vitest config 缺省 '0';本文件逐用例改写)
    if (origJitter === undefined) delete process.env.DSH_OPENCLI_JITTER_MAX_MS
    else process.env.DSH_OPENCLI_JITTER_MAX_MS = origJitter
    if (origSnap === undefined) delete process.env.DSH_OPENCLI_SNAPSHOTS_DIR
    else process.env.DSH_OPENCLI_SNAPSHOTS_DIR = origSnap
    rmSync(snapBase, { recursive: true, force: true })
  })

  /**
   * 跑一个 tick 并记录期间全部 sleep 请求(setTimeout 桩:记录 ms 后 1ms 放行——默认窗不真等)。
   * runOpencli/daemonStatus(及按需 loginCheck)方法桩在 finally 里还原;采集输出恒成功单次尝试,
   * 关键路径上除 jitter 外无其他 sleep(重试退避/挑战等待只在失败链出现),记录即 jitter 本身。
   * jitterEnv=undefined 表示删除 env(走代码默认 90_000)。
   */
  const tick = async (
    sched: Partial<Sched>,
    jitterEnv: string | undefined,
    opts: { manual?: boolean; loginCheck?: () => Promise<unknown>; daemonStatus?: () => Promise<unknown>; realClock?: boolean } = {},
  ): Promise<{ sleeps: number[]; rows: Array<{ ok: boolean; summary: string }>; ms: number }> => {
    const id = `jt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    S.schedules.push({ id, site: 'site jit hot', cron: NEVER_CRON, createdAt: new Date().toISOString(), enabled: true, retry: 1, ...sched })
    if (jitterEnv === undefined) delete process.env.DSH_OPENCLI_JITTER_MAX_MS
    else process.env.DSH_OPENCLI_JITTER_MAX_MS = jitterEnv
    const sleeps: number[] = []
    const realSetTimeout = globalThis.setTimeout
    if (opts.realClock !== true) {
      vi.stubGlobal('setTimeout', ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
        sleeps.push(ms ?? 0)
        return realSetTimeout(fn as never, 1, ...(rest as never[]))
      }) as typeof setTimeout)
    }
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    const origLc = S.loginCheck
    S.runOpencli = async () => ({ exitCode: 0, stdout: '[{"title":"A"}]', stderr: '' })
    S.daemonStatus = opts.daemonStatus ?? (async () => ({ running: true, version: '2.0.3', extension: 'connected' }))
    if (opts.loginCheck !== undefined) S.loginCheck = opts.loginCheck
    const t0 = Date.now()
    try {
      await S.runSiteCommand('site jit hot', id, opts.manual === true ? { manual: true } : undefined)
      return { sleeps, rows: [...(S.runHistory[id] ?? [])], ms: Date.now() - t0 }
    } finally {
      vi.stubGlobal('setTimeout', realSetTimeout)
      S.runOpencli = origRun
      S.daemonStatus = origDs
      S.loginCheck = origLc
      process.env.DSH_OPENCLI_JITTER_MAX_MS = '0'
      delete S.runHistory[id]
      S.schedules.splice(S.schedules.findIndex((x) => x.id === id), 1)
    }
  }

  it('① 默认随机窗(env 未设):首跑前恰一次 sleep,落在 [15000, 90000]', async () => {
    const { sleeps, rows } = await tick({}, undefined)
    expect(sleeps).toHaveLength(1)
    expect(sleeps[0]).toBeGreaterThanOrEqual(15_000)
    expect(sleeps[0]).toBeLessThanOrEqual(90_000)
    expect(rows[0]?.ok).toBe(true) // jitter 后照常采集
  })

  it('① 默认窗多次采样仍在边界内(随机分布不越界)', async () => {
    for (let i = 0; i < 5; i++) {
      const { sleeps } = await tick({}, undefined)
      expect(sleeps).toHaveLength(1)
      expect(sleeps[0]).toBeGreaterThanOrEqual(15_000)
      expect(sleeps[0]).toBeLessThanOrEqual(90_000)
    }
  })

  it('② 上限钳制:env=700000 → hi 钳到 600000,sleep ∈ [15000, 600000]', async () => {
    const { sleeps } = await tick({}, '700000')
    expect(sleeps).toHaveLength(1)
    expect(sleeps[0]).toBeGreaterThanOrEqual(15_000)
    expect(sleeps[0]).toBeLessThanOrEqual(600_000)
  })

  it('② 小上限退化为定长:env=50 → lo=min(15000,50)=50,sleep 恰 50ms', async () => {
    const { sleeps } = await tick({}, '50')
    expect(sleeps).toEqual([50])
  })

  it('② env 置 0 关闸:零 sleep', async () => {
    const { sleeps, rows } = await tick({}, '0')
    expect(sleeps).toHaveLength(0)
    expect(rows[0]?.ok).toBe(true)
  })

  it('③ 任务级 jitter:false 关闸(env 开着也不睡)', async () => {
    const { sleeps, rows } = await tick({ jitter: false }, '50')
    expect(sleeps).toHaveLength(0)
    expect(rows[0]?.ok).toBe(true)
  })

  it('④ 手动跑(manual:true)豁免:用户点「立即运行」不付拟人等待', async () => {
    const { sleeps, rows } = await tick({}, '50', { manual: true })
    expect(sleeps).toHaveLength(0)
    expect(rows[0]?.ok).toBe(true)
  })

  it('⑤ 预检先于 jitter:登录态预检未过 → ⏸ 跳过本 tick,不付 jitter 等待', async () => {
    const before = S.ingestEventList.length
    const { sleeps, rows } = await tick({ preflight: true }, '50', {
      loginCheck: async () => ({ ok: true, checkedAt: new Date().toISOString(), results: [{ site: 'jit', ok: false, timedOut: false, detail: 'AUTH_REQUIRED' }] }),
    })
    expect(sleeps).toHaveLength(0) // 若 jitter 在预检之前,这里会记到 50
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ok).toBe(false)
    expect(rows[0]!.summary).toContain('⏸')
    expect(S.ingestEventList.length).toBe(before + 1)
    expect(S.ingestEventList[0]!.kind).toBe('schedule-skipped')
  })

  it('⑤ 对照:预检通过 → 照付 jitter(证明上一条的零 sleep 来自跳过而非预检关了 jitter)', async () => {
    const { sleeps, rows } = await tick({ preflight: true }, '50', {
      loginCheck: async () => ({ ok: true, checkedAt: new Date().toISOString(), results: [{ site: 'jit', ok: true, timedOut: false, detail: null }] }),
    })
    expect(sleeps).toEqual([50])
    expect(rows[0]?.ok).toBe(true)
  })

  it('⑤ 健康预检同样先于 jitter:扩展未连 → ⏸ 跳过本 tick,不付 jitter 等待', async () => {
    const { sleeps, rows } = await tick({}, '50', {
      daemonStatus: async () => ({ running: true, version: '2.0.3', extension: 'not connected' }),
    })
    expect(sleeps).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.summary).toContain('⏸')
    expect(rows[0]!.summary).toContain('扩展未连接')
  })

  it('真实时钟:env=120 → runSiteCommand 关键路径确实等足 ≥120ms;jitter:false 对照不等', async () => {
    const slept = await tick({}, '120', { realClock: true })
    expect(slept.ms).toBeGreaterThanOrEqual(115) // 定时器粒度容差 5ms
    const off = await tick({ jitter: false }, '120', { realClock: true })
    expect(off.ms).toBeLessThan(slept.ms)
  })
})
