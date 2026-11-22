// 任务健康面服务层(0.1.7 C1,plan §一)。
// ①scheduleAdd 站点健康预警:pitfalls 命中站(xiaohongshu)→ warning+healthNote 落条目;
//   干净站(juejin)→ 两字段皆省;复用幂等 add 刷新快照。
// ②stats 计数:真实 run ok/fail 各计一;预检跳过不计(提前 return 不进终判块)。
// 桩:NEVER_CRON 防后台 tick;runOpencli/daemonStatus/taskHealthCheck 方法桩 finally 还原。
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
    return { exitCode: 0, stdout: { text: '{"ok":true,"data":{"ok":true,"pid":1,"daemonVersion":"2.0.3","extensionConnected":true,"running":true}}\n' }, stderr: { text: '' } }
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

type Sched = { id: string; site: string; cron: string; stats?: { ok: number; fail: number; since: string }; failRunStreak?: number; healthNote?: string }
type Priv = {
  schedules: Sched[]
  taskHealthCheck: (id: string) => Promise<{ ok: boolean; note?: string }>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}
type Svc = {
  schedules: Sched[]
  scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string; warning?: string }>
  scheduleRemove: (r: { id: string }) => Promise<{ ok: boolean }>
  runSiteCommand: (s: string, id: string) => Promise<void>
}

describe('任务健康面(0.1.7 C1:站点预警 + stats 计数)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  let P: Priv
  const uniq = `${process.pid}-${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-th-state-${uniq}.json`)
  const snapBase = join(os.tmpdir(), `dsh-opencli-th-snap-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-th-traces-${uniq}`)
  const saved = { state: process.env.DSH_OPENCLI_STATE, snap: process.env.DSH_OPENCLI_SNAPSHOTS_DIR, trace: process.env.DSH_OPENCLI_TRACE_DIR }
  const created: string[] = []

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    ctx = new Context()
    await ctx.plugin(ThShell)
    await ctx.plugin(ThTools)
    await ctx.plugin(ThPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
    P = ctx.opencli as unknown as Priv
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

  const add = async (site: string): Promise<{ r: { ok: boolean; id?: string; warning?: string }; sch: Sched }> => {
    const r = await S.scheduleAdd({ site: `site ${site} hot`, cron: NEVER_CRON, source: 'panel' })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    return { r, sch: S.schedules.find((s) => s.id === r.id)! }
  }

  it('① pitfalls 命中站(xiaohongshu)→ warning + healthNote 落条目', async () => {
    const r = await S.scheduleAdd({ site: 'site xiaohongshu feed', cron: NEVER_CRON, source: 'panel' })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    expect(r.warning).toBeTruthy()
    expect(r.warning).toContain('已知坑')
    const sch = S.schedules.find((s) => s.id === r.id)!
    expect(sch.healthNote).toBeTruthy()
    expect(sch.healthNote).toContain('已知坑')
  })

  it('①b degraded 站(instagram)→ warning 带上游状态(SITE_HEALTH_STATUS_LABELS 分支覆盖——复核 HIGH:该分支曾因漏导入必崩且被 notice 站测试假绿遮蔽)', async () => {
    const r = await S.scheduleAdd({ site: 'site instagram profile', cron: NEVER_CRON, source: 'panel' })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    expect(r.warning).toBeTruthy()
    expect(r.warning).toContain('上游状态 受损') // health.json instagram status=degraded
    const sch = S.schedules.find((s) => s.id === r.id)!
    expect(sch.healthNote).toContain('受损')
  })

  it('② 干净站(juejin)→ 无 warning 无 healthNote(省键)', async () => {
    const { r, sch } = await add('juejin')
    expect(r.warning).toBeUndefined()
    expect('warning' in r).toBe(false)
    expect(sch.healthNote).toBeUndefined()
  })

  it('③ 幂等复用(再 add 同 site+cron)刷新健康快照', async () => {
    // ① 创建的是 site xiaohongshu feed + NEVER_CRON;同键再 add → 复用同 id(幂等去重)
    const r2 = await S.scheduleAdd({ site: 'site xiaohongshu feed', cron: NEVER_CRON, source: 'panel' })
    expect(r2.ok).toBe(true)
    expect(r2.id).toBe(created[0]) // 幂等:同 site+cron 复用既有任务
    const sch = S.schedules.find((s) => s.id === r2.id)!
    expect(sch.healthNote).toBeTruthy() // 快照仍在(刷新语义)
  })

  it('④ stats:真实 run ok/fail 各计一;⑤ 预检跳过不计', async () => {
    const r0 = await S.scheduleAdd({ site: `site juejin-${Math.random().toString(36).slice(2, 8)} hot`, cron: NEVER_CRON, backoffMs: 0, source: 'panel' })
    expect(r0.ok).toBe(true)
    created.push(r0.id!)
    const sch = S.schedules.find((s) => s.id === r0.id)!
    expect(sch.stats).toBeUndefined()
    const origRun = P.runOpencli
    const origDs = P.daemonStatus as unknown as (() => Promise<unknown>) | undefined
    const origHealth = P.taskHealthCheck
    P.runOpencli = async () => ({ exitCode: 0, stdout: '[{"t":1}]', stderr: '' })
    P.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    try {
      await S.runSiteCommand(sch.site, sch.id) // 成功 run
      expect(sch.stats!.ok).toBe(1)
      expect(sch.stats!.fail).toBe(0)
      expect(sch.failRunStreak).toBeUndefined() // 成功清删连败真值(省键,语义=0)
      P.runOpencli = async () => ({ exitCode: 1, stdout: '', stderr: 'boom' })
      await S.runSiteCommand(sch.site, sch.id) // 失败 run
      expect(sch.stats!.ok).toBe(1)
      expect(sch.stats!.fail).toBe(1)
      expect(sch.failRunStreak).toBe(1) // 连败真值累积(0.1.8 ②)
      await S.runSiteCommand(sch.site, sch.id) // 再败
      expect(sch.failRunStreak).toBe(2)
    } finally {
      P.runOpencli = origRun
      if (origDs !== undefined) (P as unknown as Record<string, unknown>).daemonStatus = origDs
      P.taskHealthCheck = origHealth
    }
    // 跳过:健康预检失败 → 提前 return,不进终判块 → stats 与连败真值都不动
    const before = { ok: sch.stats!.ok, fail: sch.stats!.fail, streak: sch.failRunStreak }
    const origHealth2 = P.taskHealthCheck
    P.taskHealthCheck = async () => ({ ok: false, note: '浏览器扩展未连接' })
    try {
      await S.runSiteCommand(sch.site, sch.id)
    } finally { P.taskHealthCheck = origHealth2 }
    expect(sch.stats!.ok).toBe(before.ok)
    expect(sch.stats!.fail).toBe(before.fail)
    expect(sch.failRunStreak).toBe(before.streak) // 跳过不动连败真值
  })
})
