// 插件自检(0.1.2 P0-6/7):self-check RPC 的工具点名/入口在线/更新检查(桩 fetch)。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmdStr = Array.isArray(spec.command) ? spec.command.join(' ') : String(spec.command)
    if (/daemon status/.test(cmdStr)) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: 2.0.2\nExtension: connected\nPort: 19825' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '[{"title":"A"}]' }, stderr: { text: '' } }
  }
}

class StubTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: unknown): void { (this.registered as Map<string, unknown>).set((def as { name: string }).name, def) }
  list(): Array<{ name: string }> { return [...(this.registered as Map<string, unknown>).keys()].map((name) => ({ name })) }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

describe('插件自检 self-check RPC(P0-6/7)', () => {
  let ctx: InstanceType<typeof Context>
  const tmpState = join(os.tmpdir(), `dsh-opencli-sc-state-${process.pid}.json`)

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = tmpState
    process.env.DSH_OPENCLI_DIRECT = '0'
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('registry.npmjs.org')) {
        return new Response(JSON.stringify({ version: '9.9.9' }), { status: 200 })
      }
      throw new Error('unexpected fetch: ' + u)
    }))
    ctx = new Context()
    await ctx.plugin(StubShell)
    await ctx.plugin(StubTools)
    await ctx.plugin(StubSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    rmSync(tmpState, { force: true })
  })

  it('工具点名:注册表非空且全部 registered;入口三项在线;更新检查给出升级命令(不自动执行)', async () => {
    const svc = ctx.opencli as unknown as {
      selfCheck: () => Promise<{
        ok: boolean; activated: boolean
        tools: Array<{ name: string; registered: boolean }>
        conflicts: string[]
        entries: Array<{ name: string; ok: boolean }>
        currentVersion: string; latestVersion?: string; updateAvailable?: boolean; upgradeCmd?: string
      }>
    }
    const sc = await svc.selfCheck()
    expect(sc.ok).toBe(true)
    expect(sc.activated).toBe(true)
    // 工具点名:注册了实质工具(非 browser_ 别名)
    expect(sc.tools.length).toBeGreaterThan(5)
    expect(sc.tools.every((t) => t.registered === true)).toBe(true)
    // 入口:面板 RPC(本调用)+ ctl 收件箱 + daemon(桩 running)
    const entries = Object.fromEntries(sc.entries.map((e) => [e.name, e.ok]))
    expect(entries['panel-rpc']).toBe(true)
    expect(entries['daemon']).toBe(true)
    // 更新:registry 桩返回 9.9.9 → updateAvailable + 升级命令(npm i -g 形态)
    expect(sc.updateAvailable).toBe(true)
    expect(sc.latestVersion).toBe('9.9.9')
    expect(sc.upgradeCmd).toBe('npm install -g @cold777/dsh-opencli@9.9.9')
  })

  it('更新检查离线容错:registry 不可达 → 字段缺席而非失败(自检不因离线变红)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const svc = ctx.opencli as unknown as {
      selfCheck: () => Promise<{ ok: boolean; updateAvailable?: boolean; tools: Array<unknown> }>
    }
    const sc = await svc.selfCheck()
    expect(sc.ok).toBe(true)
    expect(sc.updateAvailable).toBeUndefined()
    expect(sc.tools.length).toBeGreaterThan(0)
  })
})
