// CLI 共存判定服务层(0.1.6 C2,#2761 现实化,plan §二)。
// 判定:major 不一致(实证互杀)或近 7 天 daemon-flip(辅证)→ status RPC 携带 coexist 字段
// (零噪音:两者皆无则省键);flips 统计读事件史(.1 旧档+主档,窗口边界如实)。
// 事件 fixture 在插件装载前经 DSH_OPENCLI_EVENTS_FILE 注入(构造期读 env,与生产同路径)。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

class CoexShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}
class CoexTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(): void {}
}
class CoexPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type CoexistInfo = { cliMajor: number; daemonMajor: number; flips7d: number; binPath: string } | null
type Priv = {
  cliCoexistence: (cliVersionRaw: string, daemonVersionRaw: string | undefined) => CoexistInfo
  daemonStatus: () => Promise<{ running: boolean; version?: string; extension?: string } | null>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  bin: string
  eventsFile: string
  flipCountCache: { at: number; count: number } | undefined
}
type Svc = {
  status: () => Promise<{ ok: boolean; version: string | null; coexist?: CoexistInfo; conflicts?: string[] }>
}

describe('CLI 共存判定(0.1.6 C2:major 不一致/flip 统计/零噪音/status 携带)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  let P: Priv
  const uniq = `${process.pid}-${Date.now()}`
  const dir = join(os.tmpdir(), `dsh-opencli-coex-${uniq}`)
  const eventsFile = join(dir, 'events.jsonl')
  const savedEvents = process.env.DSH_OPENCLI_EVENTS_FILE
  const statePath = join(os.tmpdir(), `dsh-opencli-coex-state-${uniq}.json`)
  const savedState = process.env.DSH_OPENCLI_STATE

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true })
    // fixture:1 天前 flip(计)+ 8 天前 flip(窗口外不计)+ 一条无关 kind(不串)
    const d1 = new Date(Date.now() - 1 * 86_400_000).toISOString()
    const d8 = new Date(Date.now() - 8 * 86_400_000).toISOString()
    writeFileSync(eventsFile, [
      JSON.stringify({ at: d1, kind: 'daemon-flip', text: 'daemon 版本翻转 1.8.6 → 2.0.3(疑似 CLI/App 互杀,#2761)' }),
      JSON.stringify({ at: d8, kind: 'daemon-flip', text: 'daemon 版本翻转 2.0.3 → 1.8.6' }),
      JSON.stringify({ at: d1, kind: 'schedule-failed', text: '无关事件' }),
    ].join('\n') + '\n', 'utf8')
    process.env.DSH_OPENCLI_EVENTS_FILE = eventsFile
    process.env.DSH_OPENCLI_STATE = statePath
    ctx = new Context()
    await ctx.plugin(CoexShell)
    await ctx.plugin(CoexTools)
    await ctx.plugin(CoexPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    S = ctx.opencli as unknown as Svc
    P = ctx.opencli as unknown as Priv
  })

  afterAll(async () => {
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    if (savedEvents === undefined) delete process.env.DSH_OPENCLI_EVENTS_FILE
    else process.env.DSH_OPENCLI_EVENTS_FILE = savedEvents
    if (savedState === undefined) delete process.env.DSH_OPENCLI_STATE
    else process.env.DSH_OPENCLI_STATE = savedState
    rmSync(dir, { recursive: true, force: true })
    rmSync(statePath, { force: true })
  })

  it('① major 不一致(2 vs 1)→ coexist 信息齐(binPath=resolveBin 目标)', () => {
    const r = P.cliCoexistence('2.0.3', '1.8.6')
    expect(r).not.toBeNull()
    expect(r!.cliMajor).toBe(2)
    expect(r!.daemonMajor).toBe(1)
    expect(r!.flips7d).toBe(1) // 1 天前的计入;8 天前的窗口外不计
    expect(r!.binPath).toBe(P.bin)
    expect(typeof r!.binPath).toBe('string')
    expect((r!.binPath ?? '').length).toBeGreaterThan(0)
  })

  it('② 同 major 且零翻转 → null(status 省键,零噪音)', () => {
    // 零翻转场景:临时把事件文件指向空文件(fixture 里那条 1 天前的 flip 会一直被统计);
    // 同时重置 flip 计数缓存(实例级 TTL 缓存跨 it 复用,不重置会吃到上一用例的计数)
    const origFile = P.eventsFile
    P.eventsFile = join(dir, 'empty.jsonl')
    P.flipCountCache = undefined
    try {
      writeFileSync(P.eventsFile, '', 'utf8')
      expect(P.cliCoexistence('2.0.3', '2.0.3')).toBeNull()
      expect(P.cliCoexistence('2.0.3', undefined)).toBeNull() // daemon 版本取不到:不猜,若也无翻转则 null
    } finally { P.eventsFile = origFile }
  })

  it('②b daemon 版本取不到但有翻转 → 返回且 daemonMajor=null(不编哨兵,复核 medium ①)', () => {
    P.flipCountCache = undefined // ②把缓存清成空文件口径,fixture 已还原故重算
    const r = P.cliCoexistence('2.0.3', undefined)
    expect(r).not.toBeNull()
    expect(r!.cliMajor).toBe(2)
    expect(r!.daemonMajor).toBeNull()
    expect(r!.flips7d).toBe(1)
  })

  it('③ 同 major 但 7 天内有翻转 → 仍返回(翻转频度是独立信号)', () => {
    P.flipCountCache = undefined // ②刚把缓存清成空文件口径,恢复 fixture 后重算
    const r = P.cliCoexistence('2.0.3', '2.0.3')
    expect(r).not.toBeNull()
    expect(r!.cliMajor).toBe(r!.daemonMajor)
    expect(r!.flips7d).toBe(1)
  })

  it('④ 版本串形态容忍(v 前缀/尾缀)取首个整数段为 major', () => {
    expect(P.cliCoexistence('v2.0.3', '1.8.6-beta')!.cliMajor).toBe(2)
    expect(P.cliCoexistence('v2.0.3', '1.8.6-beta')!.daemonMajor).toBe(1)
  })

  it('⑤ status RPC:不一致→携带 coexist;一致且无翻转→省键(边界纪律:可选字段绝不写 undefined)', async () => {
    const origRun = P.runOpencli
    const origDs = P.daemonStatus
    try {
      P.runOpencli = async (...a: unknown[]) => {
        const cmd = JSON.stringify(a[0])
        if (cmd.includes('--version')) return { exitCode: 0, stdout: '2.0.3', stderr: '' }
        return { exitCode: 0, stdout: '{}', stderr: '' }
      }
      P.daemonStatus = async () => ({ running: true, version: '1.8.6', extension: 'connected' })
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined // 防用例间渗透(0.1.8 ④)
      ;(S as unknown as { daemonStatusCache?: unknown }).daemonStatusCache = undefined // 0.2.0 PF4 同款
      const r1 = await S.status()
      expect(r1.ok).toBe(true)
      expect(r1.coexist).toBeDefined()
      expect(r1.coexist!.cliMajor).toBe(2)
      expect(r1.coexist!.daemonMajor).toBe(1)
      expect(r1.coexist!.flips7d).toBe(1)
      P.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
      // 同 major+无翻转:临时指空事件文件,断言省键(不是 coexist: undefined)
      // statusCache 清缓存(0.1.8 ④):上一调用的 status 已入 TTL 缓存,重桩后须清才见新值
      // (与 flipCountCache 同款私有清理模式)
      const origFile = P.eventsFile
      P.eventsFile = join(dir, 'empty2.jsonl')
      P.flipCountCache = undefined
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined
      ;(S as unknown as { daemonStatusCache?: unknown }).daemonStatusCache = undefined // 0.2.0 PF4 同款
      try {
        writeFileSync(P.eventsFile, '', 'utf8')
        const r2 = await S.status()
        expect('coexist' in r2).toBe(false)
      } finally { P.eventsFile = origFile }
    } finally {
      P.runOpencli = origRun
      P.daemonStatus = origDs
    }
  })

  it('⑥ status 5s TTL 缓存(0.1.8 ④):TTL 内二连发只付一次 --version;清缓存后重新付;失败不缓存', async () => {
    const origRun = P.runOpencli
    const origDs = P.daemonStatus
    try {
      let versionCalls = 0
      P.runOpencli = async (...a: unknown[]) => {
        if (JSON.stringify(a[0]).includes('--version')) { versionCalls += 1; return { exitCode: 0, stdout: '2.0.3', stderr: '' } }
        return { exitCode: 0, stdout: '{}', stderr: '' }
      }
      P.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined
      const r1 = await S.status()
      expect(r1.ok).toBe(true)
      const r2 = await S.status()
      expect(versionCalls).toBe(1) // TTL 内复用:第二次不再 spawn
      expect(r2.version).toBe(r1.version)
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined
      const r3 = await S.status()
      expect(versionCalls).toBe(2) // 清缓存(面板 daemon-start 同款路径)→ 重新付
      // 失败路径不缓存:CLI 失败每次都真实重试
      P.runOpencli = async (...a: unknown[]) => {
        if (JSON.stringify(a[0]).includes('--version')) { versionCalls += 1; return { exitCode: 1, stdout: '', stderr: 'stub down' } }
        return { exitCode: 0, stdout: '{}', stderr: '' }
      }
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined
      const r4 = await S.status()
      expect(r4.ok).toBe(false)
      const r5 = await S.status()
      expect(r5.ok).toBe(false)
      expect(versionCalls).toBe(4) // 失败没进缓存:r4/r5 各真实付一次(3、4)
    } finally {
      P.runOpencli = origRun
      P.daemonStatus = origDs
      ;(S as unknown as { statusCache?: unknown }).statusCache = undefined
    }
  })
})
