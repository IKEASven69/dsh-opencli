// 无人值守可靠性 2.0(0.1.2 P0-1/P0-2):挑战自解等待 + 采集回执。
// 纯函数直测 + 服务级挑战重试链(桩 shell 两次响应序列,快照走 env 隔离目录)。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { authRiskClass, countStructuredItems, isChallengePage } from '../src/parsers.ts'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

describe('纯函数:回执三件套', () => {
  it('authRiskClass:登录墙/风控挑战/正常三分', () => {
    expect(authRiskClass('请先登录后再继续操作')).toBe('auth_wall')
    expect(authRiskClass('AUTH_REQUIRED')).toBe('auth_wall')
    expect(authRiskClass('请完成验证 or captcha challenge')).toBe('risk_wall')
    expect(authRiskClass('Anubis challenge page')).toBe('risk_wall')
    expect(authRiskClass('1 热点A 热度100')).toBeNull()
  })
  it('countStructuredItems:数组/包装/非结构化/空串', () => {
    expect(countStructuredItems('[{"t":1},{"t":2}]')).toBe(2)
    expect(countStructuredItems('{"data":[{"x":1}]}')).toBe(1)
    expect(countStructuredItems('纯文本')).toBeNull()
    expect(countStructuredItems('')).toBe(0)
  })
  it('isChallengePage:验证码/请完成验证 命中;正常内容不命中', () => {
    expect(isChallengePage('请完成验证')).toBe(true)
    expect(isChallengePage('captcha challenge')).toBe(true)
    expect(isChallengePage('1 热点A 热度100')).toBe(false)
  })
})

// ── 服务级:挑战自解等待 + 回执落盘(桩 shell 两次响应序列) ──
class StubTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }>; output?: { render?: (a: unknown, v: unknown) => Array<{ type: string; text: string }> } }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }>; output?: { render?: (a: unknown, v: unknown) => Array<{ type: string; text: string }> } }): void {
    this.registered.set(def.name, def)
  }
  list(): Array<{ name: string }> { return [...this.registered.keys()].map((name) => ({ name })) }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  /** 调用序列:第 1 次=验证码挑战页(exit 0,规则层判静默失败),第 2 次=正常 JSON 列表 */
  static seq: string[] = []
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const n = StubShell.seq.length
    StubShell.seq.push(spec.command)
    if (n === 0) return { exitCode: 0, stdout: { text: '请完成验证后继续操作 安全验证' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '[{"title":"热点A","hot":100}]' }, stderr: { text: '' } }
  }
}

describe('服务级:挑战自解等待与回执落盘', () => {
  let ctx: InstanceType<typeof Context> | null = null
  const snapBase = join(os.tmpdir(), `dsh-opencli-unattended-snap-${process.pid}`)

  beforeAll(async () => {
    // 测试环境:挑战等待极短(vitest config 已给 10ms,此处显式兜底)+ 快照走 env 目录
    process.env.DSH_OPENCLI_CHALLENGE_WAIT_MS = '10'
    process.env.DSH_OPENCLI_JITTER_MAX_MS = '0'
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable (test default)') }))
    ctx = new Context()
    await ctx.plugin(StubShell)
    await ctx.plugin(StubTools)
    await ctx.plugin(StubSystemPrompt)
    await ctx.plugin(OpencliService)
    // SystemOne 桩默认不可用(advanced/cards 同款):verifyResult 走 null 降级,不触发真实 laya 推理
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    rmSync(snapBase, { recursive: true, force: true })
  })

  it('挑战页 → 额外赠一次尝试(不占 attempts)→ 第二次成功;回执进 history 行与快照元数据', { timeout: 30_000 }, async () => {
    StubShell.seq = []
    const svc = ctx!.opencli as unknown as {
      schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; jitter?: boolean }>
      runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string; receipt?: { auth_state: string; items?: number; bytes: number; empty?: true } }>>
      runSiteCommand: (s: string, id: string) => Promise<void>
      runOpencli?: unknown
    }
    const id = `ua-${Date.now()}`
    // retry:1 → attempts=1:挑战自解只能在最后一次尝试签发(retry:1 即首跑失败即触发)
    svc.schedules.push({ id, site: 'site ua-test hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    const T0 = Date.now()
    await svc.runSiteCommand('site ua-test hot', id)
    // 挑战自解:两次 shell 调用(第 1 次=挑战,第 2 次=成功)
    expect(StubShell.seq.length).toBe(2)
    // 回执进 history 行(最后一次成功:auth=ok,items=1)
    const rows = svc.runHistory[id] ?? []
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const okRow = rows.find((r) => r.ok)
    expect(okRow?.receipt?.auth_state).toBe('ok')
    expect(okRow?.receipt?.items).toBe(1)
    // 快照元数据带 receipt(env 隔离目录)
    const dir = join(snapBase, id)
    expect(existsSync(dir)).toBe(true)
    const file = require('node:fs').readdirSync(dir).find((f: string) => f.endsWith('.json'))
    expect(file).toBeDefined()
    const snap = JSON.parse(readFileSync(join(dir, file!), 'utf8')) as { receipt?: { auth_state: string; items?: number } }
    expect(snap.receipt?.auth_state).toBe('ok')
    expect(snap.receipt?.items).toBe(1)
    // 清理
    delete svc.runHistory[id]
    const idx = svc.schedules.findIndex((s) => s.id === id)
    if (idx >= 0) svc.schedules.splice(idx, 1)
  })
})
