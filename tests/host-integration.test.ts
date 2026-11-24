// 宿主原生集成(0.2.0 H):ctx.jobs 可观测 job(H②)/webServer 健康路由(H③)/
// schedule-changed 域事件(H①)——全部守卫式:宿主服务缺席 → 现行为不变。
// 桩:NEVER_CRON 防后台 tick;jobs/webServer/emit 为测试注入的最小结构面。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

const NEVER_CRON = '0 3 31 2 *'

class ThShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    return { exitCode: 0, stdout: { text: '[{"t":1}]' }, stderr: { text: '' } }
  }
}
class ThTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(): void {}
}
class ThPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

interface CapturedJob {
  spec: { kind: string; label: string; run(): { cancel(r?: string): void; done: Promise<{ status: string; detail?: string }> } }
  hooks: { status: string | null; done: Promise<{ status: string; detail?: string }> }
}

describe('宿主原生集成(0.2.0 H②③①,守卫式)', () => {
  let ctx: InstanceType<typeof Context>
  let S: {
    runSiteCommand: (s: string, id: string) => Promise<void>
    schedules: Array<{ id: string; site: string; cron: string; enabled: boolean }>
    scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>
  }
  const uniq = `${process.pid}-${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-hi-${uniq}.json`)
  const saved = { state: process.env.DSH_OPENCLI_STATE, vitest: process.env.DSH_OPENCLI_BIN }
  const created: string[] = []
  const jobsCaptured: CapturedJob[] = []
  const routesCaptured: Array<{ kind: string; path: string; handler: (req: unknown, res: unknown) => void }> = []
  let emitCalls: Array<{ name: string; payload: Record<string, unknown> }> = []

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = statePath
    ctx = new Context()
    await ctx.plugin(ThShell)
    await ctx.plugin(ThTools)
    await ctx.plugin(ThPrompt)
    // 测试注入宿主服务最小面(H② jobs/H③ webServer);H① 靠包装 ctx.emit 捕获
    ;(ctx as unknown as Record<string, unknown>).jobs = {
      start: (spec: { kind: string; label: string; run(): { cancel(r?: string): void; done: Promise<{ status: string; detail?: string }> } }) => {
        const entry: CapturedJob = { spec, hooks: { status: null, done: spec.run().done } }
        void entry.hooks.done.then((o) => { entry.hooks.status = o.status }).catch(() => { entry.hooks.status = 'failed' })
        jobsCaptured.push(entry)
        return `opencli-${jobsCaptured.length}`
      },
    }
    ;(ctx as unknown as Record<string, unknown>).webServer = {
      register: (route: { kind: string; path: string; handler: (req: unknown, res: unknown) => void }) => { routesCaptured.push(route); return () => {} },
    }
    const rawEmit = (ctx as unknown as { emit?: (name: string, payload: unknown) => void }).emit
    ;(ctx as unknown as Record<string, unknown>).emit = (name: string, payload: unknown) => {
      emitCalls.push({ name, payload: payload as Record<string, unknown> })
      if (typeof rawEmit === 'function') rawEmit.call(ctx, name, payload)
    }
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    // 方法直桩(task-health ④ 同款):daemonStatus 恒运行+扩展连(预检过),runOpencli 恒成功
    const Sv = ctx.opencli as unknown as Record<string, unknown>
    Sv.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    Sv.runOpencli = async () => ({ exitCode: 0, stdout: '[{"t":1}]', stderr: '' })
    S = ctx.opencli as unknown as typeof S
  })

  afterAll(async () => {
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (typeof c.stop === 'function' ? c.stop.bind(ctx) : (typeof c.dispose === 'function' ? c.dispose.bind(ctx) : async () => {}))()
    for (const [k, v] of [['DSH_OPENCLI_STATE', saved.state], ['DSH_OPENCLI_BIN', saved.vitest]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(statePath, { force: true })
  })

  it('H③:启动期注册 /opencli/health 路由,handler 回 200 JSON(ok/version/at)', () => {
    const route = routesCaptured.find((r) => r.path === '/opencli/health')
    expect(route).toBeDefined()
    expect(route!.kind).toBe('exact')
    let statusCode = 0
    let body = ''
    const res = { statusCode: 0, setHeader: () => {}, end: (b: string) => { body = b } }
    Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v } })
    route!.handler({}, res)
    expect(statusCode).toBe(200)
    const j = JSON.parse(body) as { ok: boolean; version: string }
    expect(j.ok).toBe(true)
    expect(j.version).toBe('0.2.0')
  })

  it('H②:runSiteCommand 注册 opencli job(label=命令行),终点结算 completed', async () => {
    const r0 = await S.scheduleAdd({ site: `site hc-j-${Math.random().toString(36).slice(2, 7)} hot`, cron: NEVER_CRON, backoffMs: 0, source: 'panel' })
    expect(r0.ok).toBe(true)
    created.push(r0.id!)
    emitCalls = []
    const before = jobsCaptured.length
    await S.runSiteCommand(S.schedules.find((s) => s.id === r0.id)!.site, r0.id!)
    expect(jobsCaptured.length).toBe(before + 1) // 真实执行才注册(预检跳过不注册)
    const job = jobsCaptured[jobsCaptured.length - 1]!
    expect(job.spec.kind).toBe('opencli')
    expect(job.spec.label).toBe(S.schedules.find((s) => s.id === r0.id)!.site)
    await job.hooks.done
    expect(job.hooks.status).toBe('completed')
    // H①:终点发 opencli/schedule-changed(action run)——只按事件名过滤(其余 ctx.emit 杂音非本测试对象)
    const ev = emitCalls.filter((e) => e.name === 'opencli/schedule-changed')
    expect(ev.length).toBeGreaterThan(0)
    expect(ev[ev.length - 1]!.payload.action).toBe('run')
  })

  it('H①:schedule-add/remove 发 opencli/schedule-changed(add/remove)', async () => {
    emitCalls = []
    const sc = (): Array<{ name: string; payload: Record<string, unknown> }> => emitCalls.filter((e) => e.name === 'opencli/schedule-changed')
    const r = await S.scheduleAdd({ site: 'site juejin hot', cron: NEVER_CRON, source: 'panel' })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    expect(sc().some((e) => e.payload.action === 'add')).toBe(true)
    const n = sc().length
    await ctx.opencli.scheduleRemove({ id: r.id! })
    created.length = 0
    expect(sc().length).toBe(n + 1)
    expect(sc()[sc().length - 1]!.payload.action).toBe('remove')
  })

  it('守卫:宿主无 jobs 服务 → runSiteCommand 照跑不崩(现行为不变)', async () => {
    const r0 = await S.scheduleAdd({ site: `site hc-g-${Math.random().toString(36).slice(2, 7)} hot`, cron: NEVER_CRON, backoffMs: 0, source: 'panel' })
    expect(r0.ok).toBe(true)
    // 临时摘掉 jobs 服务(下一拍还原)
    const ctxAny = ctx as unknown as Record<string, unknown>
    const savedJobs = ctxAny.jobs
    delete ctxAny.jobs
    try {
      await S.runSiteCommand(S.schedules.find((s) => s.id === r0.id)!.site, r0.id!)
    } finally { ctxAny.jobs = savedJobs }
    const job = jobsCaptured[jobsCaptured.length - 1]!
    expect(job.spec.label).not.toContain('hc-g') // 无服务时未注册新 job
  })
})
