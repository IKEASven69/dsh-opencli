// 插件自检(0.1.2 P0-6/7):self-check RPC 的工具点名/入口在线/更新检查(桩 fetch)。
// 0.1.3 C⑧:ctl-inbox 入口断言补齐 + DSH_OPENCLI_INBOX_DIR 隔离——此前探测读本机真实
// ~/.dsh/opencli-inbox,目录在不在都同样全绿(对照实验:设为不存在路径仍 2/2 绿),
// 名为自检实无鉴别力;现在入口探测对存在/不存在两态各断言一次。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmdStr = Array.isArray(spec.command) ? spec.command.join(' ') : String(spec.command)
    // 2.0.x JSON 信封+尾部升级横幅(0.1.3 C②:本机 `opencli daemon status` 实测形状)
    if (/daemon status/.test(cmdStr)) return { exitCode: 0, stdout: { text: '{"ok":true,"data":{"ok":true,"pid":19616,"uptime":3600.5,"daemonVersion":"2.0.2","extensionConnected":true,"port":19825,"running":true,"stale":false}}\n\n  Extension update available: v1.0.26 → v1.0.27\n  Download: https://github.com/jackwener/opencli/releases\n' }, stderr: { text: '' } }
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
  // ctl 收件箱隔离:探测指向本文件自建的临时目录(存在态),绝不读本机真实 ~/.dsh/opencli-inbox
  const inboxDir = mkdtempSync(join(os.tmpdir(), 'dsh-opencli-sc-inbox-'))
  const origInbox = process.env.DSH_OPENCLI_INBOX_DIR

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = tmpState
    process.env.DSH_OPENCLI_DIRECT = '0'
    process.env.DSH_OPENCLI_INBOX_DIR = inboxDir
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
    if (origInbox === undefined) delete process.env.DSH_OPENCLI_INBOX_DIR
    else process.env.DSH_OPENCLI_INBOX_DIR = origInbox
    rmSync(inboxDir, { recursive: true, force: true })
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
    // 入口:面板 RPC(本调用)+ ctl 收件箱(隔离目录,存在态)+ daemon(桩 running)
    const entries = Object.fromEntries(sc.entries.map((e) => [e.name, e.ok]))
    expect(entries['panel-rpc']).toBe(true)
    expect(entries['ctl-inbox']).toBe(true)
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

  it('ctl-inbox 入口真鉴别:收件箱目录不存在 → ok:false;切回存在目录 → ok:true(探测随 DSH_OPENCLI_INBOX_DIR 变)', async () => {
    const svc = ctx.opencli as unknown as {
      selfCheck: () => Promise<{ entries: Array<{ name: string; ok: boolean }> }>
    }
    const inboxOk = async (): Promise<boolean | undefined> => (await svc.selfCheck()).entries.find((e) => e.name === 'ctl-inbox')?.ok
    process.env.DSH_OPENCLI_INBOX_DIR = join(os.tmpdir(), `dsh-opencli-sc-no-inbox-${process.pid}-${Date.now()}`)
    try {
      expect(await inboxOk()).toBe(false)
    } finally {
      process.env.DSH_OPENCLI_INBOX_DIR = inboxDir // 复位到本文件隔离目录(afterAll 再复位到装载前值)
    }
    expect(await inboxOk()).toBe(true)
  })
})
