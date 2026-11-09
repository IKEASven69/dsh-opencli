// 适配器漂移预警服务层接线(0.1.3 C⑦:发现 15「detectDrift 纯函数覆盖充分,接线零测试」补强)。
// runSiteCommand 成功采集后:driftHistory 按任务记签名 {items, structured}(items 复用回执的
// countStructuredItems 口径,非结构化 → null/false),环形缓冲上限 5;detectDrift 命中 → ingest
// 事件 adapter-drift(连续 3 次同向突变:条目骤降 ≥50% 或 结构翻转)。失败采集不记签名。
// 事件计数走 pushIngestEvent 包装(内存 ingest 列表上限 30 条会滚动,按长度数会漏)。
// 兜底采集(D 包 #7)不在本文件断言范围:adapterCache 置空目录 → 域名查不到 → 诚实兜底失败,
// 不碰 browser 链路。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

/** 永不触发的 cron(notify.test.ts 同款):后台 tick 空转,执行全由 runSiteCommand 直调驱动 */
const NEVER_CRON = '0 3 31 2 *'

class DriftShell extends Service {
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
class DriftTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string }): void { this.registered.set(def.name, def) }
}
class DriftSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type Sample = { items: number | null; structured: boolean }
type Svc = {
  schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; retry?: number }>
  runHistory: Record<string, unknown[]>
  driftHistory: Map<string, Sample[]>
  adapterCache: { at: number; json: unknown } | null
  runSiteCommand: (s: string, id: string) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<unknown>
  pushIngestEvent: (kind: string, text: string) => void
}

/** n 条结构化条目(JSON 数组,countStructuredItems 计数口径)。 */
const items = (n: number): string => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: `t${i}` })))

describe('漂移预警接线(driftHistory 5 样本缓冲 + adapter-drift 事件)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  const snapBase = join(os.tmpdir(), `dsh-opencli-drift-snap-${process.pid}-${Date.now()}`)
  const origSnap = process.env.DSH_OPENCLI_SNAPSHOTS_DIR

  beforeAll(async () => {
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable (test default)') }))
    ctx = new Context()
    await ctx.plugin(DriftShell)
    await ctx.plugin(DriftTools)
    await ctx.plugin(DriftSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    if (origSnap === undefined) delete process.env.DSH_OPENCLI_SNAPSHOTS_DIR
    else process.env.DSH_OPENCLI_SNAPSHOTS_DIR = origSnap
    rmSync(snapBase, { recursive: true, force: true })
  })

  /**
   * 按输出序列逐 tick 采集,返回每 tick 发射的事件(pushIngestEvent 包装记录)。
   * 方法桩(runOpencli/daemonStatus/pushIngestEvent)与 adapterCache 全部 finally 还原;
   * adapterCache 置「新鲜的空目录」:漂移命中后的兜底查不到域名 → 诚实失败,不进 browser 链路。
   */
  const runSeq = async (id: string, siteCmd: string, outs: Array<{ stdout: string; exitCode?: number }>): Promise<Array<Array<{ kind: string; text: string }>>> => {
    const perTick: Array<Array<{ kind: string; text: string }>> = []
    let cur: Array<{ kind: string; text: string }> = []
    let i = 0
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    const origPush = S.pushIngestEvent
    const origCache = S.adapterCache
    S.runOpencli = async () => { const o = outs[i]!; return { exitCode: o.exitCode ?? 0, stdout: o.stdout, stderr: o.exitCode !== undefined && o.exitCode !== 0 ? 'site 500 boom' : '' } }
    S.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    S.pushIngestEvent = function (this: unknown, kind: string, text: string) { cur.push({ kind, text }); return origPush.call(this, kind, text) }
    S.adapterCache = { at: Date.now(), json: [] }
    try {
      for (i = 0; i < outs.length; i++) {
        cur = []
        await S.runSiteCommand(siteCmd, id)
        perTick.push(cur)
      }
    } finally {
      S.runOpencli = origRun
      S.daemonStatus = origDs
      S.pushIngestEvent = origPush
      S.adapterCache = origCache
    }
    return perTick
  }

  const addTask = (tag: string): { id: string; siteCmd: string } => {
    const id = `drift-${tag}-${Date.now()}`
    const siteCmd = `site drift${tag} hot`
    S.schedules.push({ id, site: siteCmd, cron: NEVER_CRON, createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    return { id, siteCmd }
  }
  const dropTask = (id: string): void => {
    delete S.runHistory[id]
    S.driftHistory.delete(id)
    S.schedules.splice(S.schedules.findIndex((x) => x.id === id), 1)
  }
  const driftEvents = (tick: Array<{ kind: string; text: string }>): Array<{ kind: string; text: string }> => tick.filter((e) => e.kind === 'adapter-drift')

  it('条目连续 3 次骤降(100→40→15→5):第 4 tick 恰发射一次 adapter-drift;前 3 tick 零发射', async () => {
    const { id, siteCmd } = addTask('a')
    try {
      const ticks = await runSeq(id, siteCmd, [{ stdout: items(100) }, { stdout: items(40) }, { stdout: items(15) }, { stdout: items(5) }])
      expect(ticks.slice(0, 3).map((t) => driftEvents(t).length)).toEqual([0, 0, 0])
      const fired = driftEvents(ticks[3]!)
      expect(fired).toHaveLength(1)
      expect(fired[0]!.text).toContain(siteCmd)
      // 缓冲按 countStructuredItems 口径逐 tick 记签名
      expect(S.driftHistory.get(id)).toEqual([
        { items: 100, structured: true }, { items: 40, structured: true },
        { items: 15, structured: true }, { items: 5, structured: true },
      ])
    } finally { dropTask(id) }
  })

  it('恢复不报 + 缓冲上限 5(超出裁最旧,签名内容按序滚动)', async () => {
    const { id, siteCmd } = addTask('b')
    try {
      // 100→40→15→5 命中后,90 恢复(尾部迁移回升)→ 不再报;再跑两 tick 观察滚动
      const ticks = await runSeq(id, siteCmd, [
        { stdout: items(100) }, { stdout: items(40) }, { stdout: items(15) }, { stdout: items(5) },
        { stdout: items(90) }, { stdout: items(70) }, { stdout: items(60) },
      ])
      expect(ticks.map((t) => driftEvents(t).length)).toEqual([0, 0, 0, 1, 0, 0, 0])
      const buf = S.driftHistory.get(id)!
      expect(buf).toHaveLength(5)
      expect(buf.map((s) => s.items)).toEqual([15, 5, 90, 70, 60]) // 最旧 100/40 被裁
    } finally { dropTask(id) }
  })

  it('结构翻转(JSON→非结构化×3):签名记 {items:null, structured:false},第 4 tick 发射 adapter-drift', async () => {
    const { id, siteCmd } = addTask('c')
    try {
      const ticks = await runSeq(id, siteCmd, [
        { stdout: items(50) }, { stdout: '页面改版 纯文本 1' }, { stdout: '页面改版 纯文本 2' }, { stdout: '页面改版 纯文本 3' },
      ])
      expect(ticks.map((t) => driftEvents(t).length)).toEqual([0, 0, 0, 1])
      expect(S.driftHistory.get(id)).toEqual([
        { items: 50, structured: true },
        { items: null, structured: false }, { items: null, structured: false }, { items: null, structured: false },
      ])
    } finally { dropTask(id) }
  })

  it('失败采集不记签名(命令整体失败走 schedule-failed,不混入结构序列)', async () => {
    const { id, siteCmd } = addTask('d')
    try {
      const ticks = await runSeq(id, siteCmd, [{ stdout: items(30) }, { stdout: '', exitCode: 1 }, { stdout: items(28) }])
      expect(S.driftHistory.get(id)).toEqual([{ items: 30, structured: true }, { items: 28, structured: true }])
      expect(ticks[1]!.some((e) => e.kind === 'schedule-failed')).toBe(true)
      expect(ticks.flat().some((e) => e.kind === 'adapter-drift')).toBe(false)
    } finally { dropTask(id) }
  })
})
