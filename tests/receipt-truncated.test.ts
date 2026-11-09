// receipt.truncated 全链(0.1.3 C①:发现 7「#2698 截断启发零覆盖」补强;A⑦ 后按字节口径):
// ① looksTruncated 纯函数:阈值=上限的 95%(Math.floor),口径=UTF-8 字节——CJK 每字 3 字节,
//    按 UTF-16 字符数比对会让纯中文被真实字节截断时永远漏标(0.1.2 发后审查 low 项);
// ② 服务链:runSiteCommand 采集输出近阈值(1_048_576 上限 → 996_147 字节)→ history 行 receipt
//    truncated 标注 + coverage stop_reason=truncated;阈值下一字节不标;纯中文近阈值同样标。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { looksTruncated } from '../src/parsers.ts'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

/** 采集读取上限(index.ts runSiteCommand 的 stdout maxBytes 与 looksTruncated 默认值同源) */
const LIMIT = 1_048_576
const THRESHOLD = Math.floor(LIMIT * 0.95) // 996_147
/** 永不触发的 cron(notify.test.ts 同款):后台 tick 空转,执行全由 runSiteCommand 直调驱动 */
const NEVER_CRON = '0 3 31 2 *'

describe('looksTruncated(纯函数:95% 阈值 · UTF-8 字节口径)', () => {
  it('阈值边界:恰到 floor(limit×0.95) 字节即标;少一字节不标', () => {
    // limit=10 → 阈值 floor(9.5)=9
    expect(looksTruncated('a'.repeat(9), 10)).toBe(true)
    expect(looksTruncated('a'.repeat(8), 10)).toBe(false)
    // 默认上限(1MB)边界:与服务链同一口径
    expect(looksTruncated('a'.repeat(THRESHOLD))).toBe(true)
    expect(looksTruncated('a'.repeat(THRESHOLD - 1))).toBe(false)
  })
  it('CJK 按字节:3 个汉字=9 字节触 limit=10 的阈值(按字符数 3<9.5 会漏标)', () => {
    expect(Buffer.byteLength('中文字', 'utf8')).toBe(9)
    expect(looksTruncated('中文字', 10)).toBe(true)
    expect(looksTruncated('中文', 10)).toBe(false) // 6 字节
  })
  it('空串/短输出不标', () => {
    expect(looksTruncated('')).toBe(false)
    expect(looksTruncated('[{"title":"A"}]')).toBe(false)
  })
})

// ── 服务链:采集输出 → 回执(桩 runOpencli 直改,hardening/advanced 同款;daemonStatus 方法桩带 finally 还原) ──
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

type Receipt = { auth_state: string; bytes: number; truncated?: true; stop_reason?: string | null; items?: number }
type Svc = {
  schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; retry?: number }>
  runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string; receipt?: Receipt }>>
  runSiteCommand: (s: string, id: string) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<unknown>
}

describe('服务链:采集输出近阈值 → receipt.truncated(字节口径)', () => {
  let ctx: InstanceType<typeof Context>
  let S: Svc
  const snapBase = join(os.tmpdir(), `dsh-opencli-trunc-snap-${process.pid}-${Date.now()}`)
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
    if (origSnap === undefined) delete process.env.DSH_OPENCLI_SNAPSHOTS_DIR
    else process.env.DSH_OPENCLI_SNAPSHOTS_DIR = origSnap
    rmSync(snapBase, { recursive: true, force: true })
  })

  /** 单 tick 采集:输出由 runOpencli 桩注入;daemonStatus 方法桩(health-check:105 同款)finally 还原。 */
  const runOnce = async (stdout: string): Promise<Receipt | undefined> => {
    const id = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    S.schedules.push({ id, site: 'site trunc hot', cron: NEVER_CRON, createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    S.runOpencli = async () => ({ exitCode: 0, stdout, stderr: '' })
    S.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    try {
      await S.runSiteCommand('site trunc hot', id)
      return S.runHistory[id]?.[0]?.receipt
    } finally {
      S.runOpencli = origRun
      S.daemonStatus = origDs
      delete S.runHistory[id]
      S.schedules.splice(S.schedules.findIndex((x) => x.id === id), 1)
    }
  }

  it('恰到阈值(996_147 字节 ASCII)→ truncated:true,stop_reason=truncated', async () => {
    const r = await runOnce('a'.repeat(THRESHOLD))
    expect(r?.auth_state).toBe('ok')
    expect(r?.truncated).toBe(true)
    expect(r?.stop_reason).toBe('truncated')
  })

  it('阈值下一字节(996_146)→ 不标 truncated(省键,不臆造)', async () => {
    const r = await runOnce('a'.repeat(THRESHOLD - 1))
    expect(r).toBeDefined()
    expect('truncated' in (r as object)).toBe(false)
    expect(r?.stop_reason).not.toBe('truncated')
  })

  it('纯中文近阈值:333_000 字=999_000 字节 → truncated(按字符数 333_000<996_147 会漏标)', async () => {
    const cjk = '热'.repeat(333_000)
    expect(Buffer.byteLength(cjk, 'utf8')).toBeGreaterThanOrEqual(THRESHOLD)
    expect(cjk.length).toBeLessThan(THRESHOLD) // 字符口径的漏标前提成立
    const r = await runOnce(cjk)
    expect(r?.truncated).toBe(true)
    expect(r?.stop_reason).toBe('truncated')
  })

  it('结构化短输出 → 无 truncated,stop_reason=end(自然翻完)', async () => {
    const r = await runOnce('[{"title":"A"},{"title":"B"}]')
    expect(r?.items).toBe(2)
    expect('truncated' in (r as object)).toBe(false)
    expect(r?.stop_reason).toBe('end')
  })
})
