// saveState 写链串行序(0.1.8 ③,benchmark flake 根因的回归锚)。
// 场景:并发 saveState——各写者 await writeFile 耗时不同,修前 rename 顺序≠调用顺序,
// 旧状态快照可后落盘覆盖新状态(概率性红,.qa/test-failures.jsonl 有归档留痕);
// 写链后落盘顺序=调用顺序,最后调用者必胜(确定性绿)。
// 附:loadState 对 failRunStreak 的形状收窄(0.1.8 ②,与 stats/pendingCatchup 同款容错)。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { readFileSync, readdirSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

// OpencliService static inject = ['shell','tools','systemPrompt']——最小桩(task-health 同款)
class SsShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
}
class SsTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(): void {}
}
class SsPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

describe('saveState 并发写链(0.1.8 ③)+ failRunStreak 形状收窄(0.1.8 ②)', () => {
  let ctx: InstanceType<typeof Context>
  let S: { saveState: () => Promise<void>; loadState: () => Promise<void>; schedules: Array<Record<string, unknown>> }
  const uniq = `${process.pid}-${Date.now()}`
  const dir = join(os.tmpdir(), `dsh-opencli-ss-order-${uniq}`)
  const statePath = join(dir, 'state.json')
  const saved = process.env.DSH_OPENCLI_STATE
  let svc: unknown

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true })
    process.env.DSH_OPENCLI_STATE = statePath
    ctx = new Context()
    // 状态持久化不需要 shell/tools(写盘不外呼)——最小插件面即可挂服务
    await ctx.plugin(SsShell)
    await ctx.plugin(SsTools)
    await ctx.plugin(SsPrompt)
    await ctx.plugin(OpencliService)
    svc = ctx.opencli
    ;(svc as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = svc as unknown as typeof S
  })

  afterAll(async () => {
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    const fin = c.stop ?? c.dispose
    if (typeof fin === 'function') await fin.call(ctx)
    if (saved === undefined) delete process.env.DSH_OPENCLI_STATE
    else process.env.DSH_OPENCLI_STATE = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('并发 saveState:12 个非等待调用夹同步状态变更,落盘终态=最后一次调用(修前概率性被旧快照覆盖)', async () => {
    const rounds = 12
    const ps: Array<Promise<void>> = []
    for (let i = 0; i < rounds; i++) {
      S.schedules = [{ id: `t${i}`, site: `site s${i} hot`, cron: '0 3 31 2 *' }] // 同步变更:第 i 次调用的快照=i
      ps.push(S.saveState()) // 不等待:制造并发重叠(写入耗时不同 → 修前 rename 乱序)
    }
    await Promise.all(ps)
    const back = JSON.parse(readFileSync(statePath, 'utf8')) as { schedules: Array<{ id?: string }> }
    expect(back.schedules).toHaveLength(1)
    expect(back.schedules[0]!.id).toBe(`t${rounds - 1}`) // 最后调用者必胜
    // 无 .tmp 残留(每轮都应 rename 干净)
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('loadState 形状收窄:failRunStreak 非正整数整字段丢弃,正整数保留', async () => {
    const sch = { id: 't-narrow', site: 'site juejin hot', cron: '0 3 31 2 *' }
    S.schedules = [sch]
    await S.saveState()
    const onDisk = JSON.parse(readFileSync(statePath, 'utf8')) as { schedules: Array<Record<string, unknown>> }
    onDisk.schedules[0]!['failRunStreak'] = 'many' // 手改坏形状:字符串
    onDisk.schedules.push({ id: 't-narrow2', site: 'site v2ex hot', cron: '0 3 31 2 *', failRunStreak: 3 }) // 合法形状
    onDisk.schedules.push({ id: 't-narrow3', site: 'site zhihu hot', cron: '0 3 31 2 *', failRunStreak: 0 }) // 0:写侧成功即清删,盘上不应有
    writeFileSync(statePath, JSON.stringify(onDisk), 'utf8')
    await S.loadState()
    const m = new Map(S.schedules.map((s) => [s.id as string, s]))
    expect('failRunStreak' in m.get('t-narrow')!).toBe(false) // 字符串丢弃
    expect(m.get('t-narrow2')!['failRunStreak']).toBe(3) // 正整数保留
    expect('failRunStreak' in m.get('t-narrow3')!).toBe(false) // 0 丢弃
    expect(existsSync(join(dir, 'state.json'))).toBe(true)
  })
})
