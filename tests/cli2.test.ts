/**
 * opencli 2.0 兼容层单测(2026-10-17 v2.0.0 实测破坏面回归):
 * JSON 信封解包 / browser --session 语法与 adapter 命令族路由 / list 分页 / doctor 2.0 输出。
 * 桩 shell 固定回 2.0.0;信封形状取自真机探针。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

class StubShell extends Service {
  version = '2.0.0'
  daemonJson = ''
  /** offset → JSON 页体(list 分页桩) */
  listPages: Record<number, string> = {}
  calls: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(spec.command)
    this.calls.push(cmd)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: this.version + '\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: this.daemonJson }, stderr: { text: '' } }
    if (cmd.includes('list')) {
      const m = cmd.match(/--offset (\d+)/)
      const page = this.listPages[Number(m?.[1] ?? 0)]
      return { exitCode: 0, stdout: { text: page ?? '{"ok":true,"data":{"commands":[],"total":0}}' }, stderr: { text: '' } }
    }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}

class StubTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void {
    this.registered.set(def.name, def)
  }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: StubShell

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: StubShell }).shell
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

const S = (): Record<string, any> => svc as unknown as Record<string, any>

describe('unwrapCli2(JSON 信封解包,形状嗅探不看版本号)', () => {
  it('ok:true + data 字符串 → data 即 stdout', () => {
    const r = S().unwrapCli2(['zhihu', 'hot'], { exitCode: 0, stdout: '{"ok":true,"data":"- rank: 1  title: x"}', stderr: '' })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('- rank: 1  title: x')
  })
  it('ok:true + data 对象 → 缩进 JSON 文本', () => {
    const r = S().unwrapCli2(['browser', 'state'], { exitCode: 0, stdout: '{"ok":true,"data":{"url":"https://x","title":"T"}}', stderr: '' })
    expect(r.stdout).toContain('"url": "https://x"')
    expect(r.stdout).toContain('"T"')
  })
  it('ok:false → error.code/message/hint 进 stderr,exitCode 取 error.exitCode', () => {
    const r = S().unwrapCli2(['zhihu', 'hot'], { exitCode: 0, stdout: '{"ok":false,"error":{"code":"LOGIN_REQUIRED","message":"需要登录","hint":"先在浏览器登录","exitCode":3}}', stderr: '' })
    expect(r.exitCode).toBe(3)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('LOGIN_REQUIRED')
    expect(r.stderr).toContain('需要登录')
    expect(r.stderr).toContain('先在浏览器登录')
  })
  it('list/daemon 跳过解包(专用解析);1.x 文本原样透传;非信封 JSON 不误伤', () => {
    const list = S().unwrapCli2(['list', '--format', 'json'], { exitCode: 0, stdout: '{"ok":true,"data":{"commands":[]}}', stderr: '' })
    expect(list.stdout).toBe('{"ok":true,"data":{"commands":[]}}')
    const daemon = S().unwrapCli2(['daemon', 'status'], { exitCode: 0, stdout: '{"ok":true,"data":{}}', stderr: '' })
    expect(daemon.stdout).toBe('{"ok":true,"data":{}}')
    const legacy = S().unwrapCli2(['zhihu', 'hot'], { exitCode: 0, stdout: '- rank: 1\n  title: 旧版纯文本', stderr: '' })
    expect(legacy.stdout).toBe('- rank: 1\n  title: 旧版纯文本')
    const notEnvelope = S().unwrapCli2(['zhihu', 'hot'], { exitCode: 0, stdout: '{"other":"shape"}', stderr: '' })
    expect(notEnvelope.stdout).toBe('{"other":"shape"}')
  })
})

describe('runBrowserTraced 2.0 语法(--session + adapter 命令族路由)', () => {
  // 覆写 runOpencli 捕获 argv 的用例必须在 finally 还原——否则污染后续 describe(doctor 等)走真壳
  it('1.x 保持位置参数(回归)', async () => {
    S().cliMajorCache = 1
    let captured = ''
    const S2 = S()
    const orig = S2.runOpencli as (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    S2.runOpencli = async (a: string[]) => { captured = a.join(' '); return { exitCode: 0, stdout: 'ok', stderr: '' } }
    try { await S().runBrowserTraced('dsh', ['open', 'https://example.com']) } finally { S2.runOpencli = orig }
    expect(captured).toBe('browser dsh open https://example.com')
  })
  it('2.0 创作命令搬家:init→adapter init,verify→adapter check(不带 session)', async () => {
    S().cliMajorCache = 2
    const got: string[] = []
    const S2 = S()
    const orig = S2.runOpencli as (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    S2.runOpencli = async (a: string[]) => { got.push(a.join(' ')); return { exitCode: 0, stdout: 'ok', stderr: '' } }
    try {
      await S().runBrowserTraced('dsh', ['init', 'zhihu'])
      await S().runBrowserTraced('dsh', ['verify', 'zhihu'])
    } finally { S2.runOpencli = orig }
    expect(got[0]).toBe('adapter init zhihu')
    expect(got[1]).toBe('adapter check zhihu')
  })
  it('2.0 --session 形态:首参 browser,--session 后跟会话名,dsh 只出现一次', async () => {
    S().cliMajorCache = 2
    let captured: string[] = []
    const S2 = S()
    const orig = S2.runOpencli as (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    S2.runOpencli = async (a: string[]) => { captured = a; return { exitCode: 0, stdout: 'ok', stderr: '' } }
    try { await S().runBrowserTraced('dsh', ['open', 'https://example.com']) } finally { S2.runOpencli = orig }
    expect(captured[0]).toBe('browser')
    expect(captured).toContain('--session')
    expect(captured[captured.indexOf('--session') + 1]).toBe('dsh')
    expect(captured.filter((x) => x === 'dsh')).toHaveLength(1)
  })
  it('2.0 移除 analyze:给确切替代指引而非裸错误', async () => {
    S().cliMajorCache = 2
    const r = await S().runBrowserTraced('dsh', ['analyze', 'https://x'])
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('analyze')
    expect(r.stderr).toContain('adapter')
  })
  it('cliMajor 版本检测:--version 输出 2.0.0 → 2 并缓存', async () => {
    S().cliMajorCache = null
    const major = await S().cliMajor()
    expect(major).toBe(2)
    expect(S().cliMajorCache).toBe(2)
  })
})

describe('adapterList 2.0 分页取全', () => {
  it('翻页收集所有 commands 并拍平入缓存;归一化站数正确', async () => {
    S().cliMajorCache = 2
    S().adapterCache = null
    shell.listPages = {
      0: JSON.stringify({ ok: true, data: { commands: [
        { command: 'a/one', site: 'a', name: 'one', description: 'A one', access: 'read', domain: 'a.com' },
        { command: 'a/two', site: 'a', name: 'two', description: 'A two', access: 'read', domain: 'a.com' },
      ], total: 3, nextOffset: 2 } }),
      2: JSON.stringify({ ok: true, data: { commands: [
        { command: 'b/three', site: 'b', name: 'three', description: 'B three', access: 'read', domain: 'b.com' },
      ], total: 3, nextOffset: 0 } }),
    }
    shell.calls = []
    const list = await S().adapterList()
    expect(list).not.toBeNull()
    expect(list!.length).toBe(2) // a、b 两站
    expect(S().adapterCache.json).toHaveLength(3)
    const offsets = shell.calls.map((c) => c.match(/--offset (\d+)/)?.[1]).filter(Boolean)
    expect(offsets).toEqual(['0', '2'])
  })
  it('信封异常(ok:false)进 lastShellError 不抛', async () => {
    S().cliMajorCache = 2
    S().adapterCache = null
    shell.listPages = { 0: '{"ok":false,"error":{"code":"X","message":"boom"}}' }
    const list = await S().adapterList()
    expect(list).toBeNull()
    expect(S().lastShellError).toContain('boom')
  })
})

describe('opencli_doctor 2.0(标准化状态源,JSON 信封下工作)', () => {
  it('daemon JSON 信封 + 扩展已连:全绿路径,版本/扩展层取自归一字段', async () => {
    shell.daemonJson = `{"ok":true,"data":{"running":true,"pid":1,"uptime":3600,"daemonVersion":"2.0.0","extensionConnected":true,"extensionVersion":"1.0.25","profileRequired":false,"profiles":[{"contextId":"62fd4dgs","extensionConnected":true,"extensionVersion":"1.0.25"}],"port":19825}}`
    const tool = S().ctx.tools.registered.get('opencli_doctor')!
    const r = await tool.execute({})
    expect(r.text).toContain('✓ CLI:2.0.0')
    expect(r.text).toContain('✓ daemon:2.0.0')
    expect(r.text).toContain('✓ BrowserBridge:connected')
    expect(r.text).toContain('全绿')
  })
  it('profileRequired=true(多档案未选)→ ⚠ + profile use 指引', async () => {
    shell.daemonJson = `{"ok":true,"data":{"running":true,"daemonVersion":"2.0.0","extensionConnected":true,"profileRequired":true,"profiles":[{"contextId":"a","extensionConnected":true},{"contextId":"b","extensionConnected":true}],"port":19825}}`
    const tool = S().ctx.tools.registered.get('opencli_doctor')!
    const r = await tool.execute({})
    expect(r.text).toContain('⚠ BrowserBridge')
    expect(r.text).toContain('profile use')
  })
})
