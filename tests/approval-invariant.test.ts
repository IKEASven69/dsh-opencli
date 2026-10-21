/**
 * 审批门安全不变量套件(0.4.4 深化旗舰):「审批门开启时,任何放行(allow)都必须是只读意图」。
 * 不是例子测试——是攻击表 + 随机模糊对不变量的系统性验证。独立评审抓出的 benchmark 写命令
 * 绕过(HIGH)与 chrome_raw 假承诺(MEDIUM)是本套件的第一个用户:这类洞必须被测试当场抓住,
 * 而不是靠下一轮代码评审碰运气。
 * 方法:cordis 裸 Context 驱动真实 tools/pre-execute waterfall(与 gate.test 同款),
 * 另直接调用 benchmark-run RPC 与 benchmark 工具(它们不走 pre-execute,是独立通道)。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import * as path from 'node:path'
import * as os from 'node:os'

const LIST_JSON = JSON.stringify([
  { command: 'zhihu/hot', site: 'zhihu', name: 'hot', description: '热榜', access: 'read', domain: 'zhihu.com' },
  { command: 'zhihu/comment', site: 'zhihu', name: 'comment', description: '写评论', access: 'write', domain: 'zhihu.com' },
  { command: 'zhihu/post', site: 'zhihu', name: 'post', description: '发帖', access: 'write', domain: 'zhihu.com' },
  { command: 'bilibili/search', site: 'bilibili', name: 'search', description: '搜索', access: 'read', domain: 'bilibili.com' },
  { command: 'weibo/publish', site: 'weibo', name: 'publish', description: '发微博', access: 'write', domain: 'weibo.com' },
])

class StubShell extends Service {
  calls: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    this.calls.push(cmd)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '1.8.8\n' }, stderr: { text: '' } }
    if (cmd.includes('list') || cmd.includes('daemon')) return { exitCode: 0, stdout: { text: LIST_JSON }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}

class RecordingTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: StubShell

/** 桩随机源:可复现的 LCG(测试内允许;同种子同序列,fuzz 失败可重放)。 */
let seed = 20261020
const rand = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }

const dispatch = async (name: string, args: Record<string, unknown>): Promise<{ kind: string; reason?: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>
  }).waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

beforeAll(async () => {
  // 状态文件按测试文件唯一化(测试真实性审查发现 1:pid 键共享残档会让上轮 approval:'off'
  // 被 loadState 读回,审批门对写命令放行,攻击表以 ~1/18 概率假绿——zerocfg 同款教训)
  process.env.DSH_OPENCLI_STATE = path.join(os.tmpdir(), 'dsh-opencli-test-state-f-invariant-' + process.pid + '-' + Date.now() + '.json')
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-invariant-' + process.pid + '-' + Date.now())
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-invariant-' + process.pid + '-' + Date.now())
  process.env.DSH_OPENCLI_BENCHMARKS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-bench-f-invariant-' + process.pid + '-' + Date.now())
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(RecordingTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: StubShell }).shell
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  ;(svc as unknown as Record<string, unknown>).usagePolicy = { minDelayMs: 0, maxConcurrency: 10, burst: 100, cooldownMs: 0, retryLimit: 2, maxPagesPerRun: 20, maxDepth: 2 }
  ;(svc as unknown as { benchGapMs: number }).benchGapMs = 0
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('攻击表:已知高危形态逐条拦截', () => {
  it.each([
    { name: 'site', args: { adapter: 'zhihu', command: 'comment', args: ['x'] }, want: 'ask', note: '已知写命令' },
    { name: 'site', args: { adapter: 'weibo', command: 'publish' }, want: 'ask', note: '另一站写命令' },
    { name: 'site', args: { adapter: 'nope', command: 'anything' }, want: 'ask', note: '目录外命令按写审批(fail-closed)' },
    { name: 'site', args: { adapter: 'constructor', command: 'comment' }, want: 'ask', note: '原型链名攻击' },
    { name: 'site', args: { adapter: '../etc', command: 'passwd' }, want: 'ask', note: '路径形态攻击' },
    { name: 'site', args: { adapter: 'zhihu ', command: 'comment' }, want: 'ask', note: '尾部空格绕权限查询' },
    { name: 'site', args: { adapter: 'zhihu', command: 'comment\u0000' }, want: 'ask', note: 'NUL 截断攻击' },
    { name: 'site', args: { adapter: 'zhihu', command: 'x'.repeat(500) }, want: 'ask', note: '超长命令' },
    { name: 'site', args: { adapter: 'zhihu', command: 'hot' }, want: 'allow', note: '读命令放行(对照)' },
    { name: 'chrome_raw', args: { method: 'windows.remove', args: '[123]' }, want: 'ask', note: '高危逃生口必须人工确认' },
    { name: 'chrome_raw', args: { method: 'tabs.create' }, want: 'ask', note: '白名单外方法同样确认' },
    { name: 'chrome_raw', args: {}, want: 'ask', note: '无参数也确认(缺省不能漏)' },
    { name: 'chrome_tabs', args: { method: 'tabs.query' }, want: 'allow', note: '受控白名单(对照)' },
    { name: 'so_verify', args: { expectation: 'x', page_text: 'y' }, want: 'allow', note: '只读判定工具(对照)' },
    // 安全审查 HIGH 回归:通用网关与 eval 双标(2026-10-20 交叉审查发现)
    { name: 'opencli_run', args: { args: ['zhihu', 'comment', 'x'] }, want: 'ask', note: '通用网关·已知写命令' },
    { name: 'opencli_run', args: { args: ['weibo', 'publish'] }, want: 'ask', note: '通用网关·另一站写命令' },
    { name: 'opencli_run', args: { args: ['nope', 'anything'] }, want: 'ask', note: '通用网关·未知站点 fail-closed' },
    { name: 'opencli_run', args: { args: ['browser', 'state', '--session', 'dsh'] }, want: 'allow', note: '通用网关·浏览器命名空间(对照)' },
    { name: 'opencli_run', args: { args: ['zhihu', 'hot'] }, want: 'allow', note: '通用网关·只读命令(对照)' },
    { name: 'browser_do', args: { command: 'eval', args: ['1+1'] }, want: 'ask', note: 'eval=登录页任意JS,等价写原语' },
  ])('$note → $want', async ({ name, args, want }) => {
    const d = await dispatch(name, args)
    expect(d.kind).toBe(want)
  })

  it('安全审查 HIGH:site_batch 写命令整批拒绝,shell 零调用', async () => {
    shell.calls = []
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('site_batch')!
    const r = await tool.execute({ command: 'publish', sites: ['weibo', 'zhihu'] })
    expect(r.text).toContain('只接受只读命令')
    expect(r.text).toContain('weibo publish(写命令)')
    expect(shell.calls.filter((c) => c.includes('publish'))).toHaveLength(0)
  })
})

describe('独立通道:benchmark 不经 pre-execute,必须自带只读门', () => {
  it('写命令/未知命令被 RPC 拒绝且 shell 零调用', async () => {
    shell.calls = []
    const r = await (svc as unknown as { benchmarkRun: (x?: { sites?: string[] }) => Promise<{ ok: boolean; error?: string }> }).benchmarkRun({ sites: ['zhihu comment', 'nope hot'] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('只接受只读命令')
    expect(shell.calls.filter((c) => c.includes('zhihu comment') || c.includes('nope hot'))).toHaveLength(0)
  })
  it('benchmark 工具面同拦(模型对话里的第二入口)', async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('benchmark')!
    const t = await tool.execute({ sites: ['weibo publish'] })
    expect(t.text).toContain('只接受只读命令')
  })
})

describe('不变量模糊:随机组合下 allow ⟹ 只读意图(200 次)', () => {
  it('审批门开启时,任何放行的 site 调用其权限必为 read;chrome_raw 永不放行', async () => {
    const adapters = ['zhihu', 'bilibili', 'weibo', 'nope', 'constructor', '../x', 'zhihu ', '', 'ZHIHU', 'zhihu.jp']
    const commands = ['hot', 'comment', 'post', 'publish', '__proto__', 'x;y', 'hot ', 'COMMENT', 'hasOwnProperty']
    let allowedRead = 0
    let asked = 0
    for (let i = 0; i < 200; i++) {
      const adapter = adapters[Math.floor(rand() * adapters.length)] ?? 'zhihu'
      const command = commands[Math.floor(rand() * commands.length)] ?? 'hot'
      const d = await dispatch('site', { adapter, command })
      if (d.kind === 'allow') {
        // 不变量:放行者必须是目录确认的只读(大小写不同/未知站一律不该放行)。
        // 空适配器=参数不全,门放行给执行层做参数校验拒绝——不在本不变量域,跳过。
        if (adapter.length > 0) {
          const acc = await (svc as unknown as { lookupAccess: (a: string, c: string) => Promise<string> }).lookupAccess(adapter, command)
          expect(acc, `${adapter} ${command} 被放行但权限是 ${acc}`).toBe('read')
          allowedRead++
        }
      } else if (d.kind === 'ask') asked++
    }
    expect(allowedRead).toBeGreaterThan(0) // 模糊确实产生了放行样本,不是全拦的假绿
    expect(asked).toBeGreaterThan(0)
    // chrome_raw 任意随机 method 永不 allow
    for (let i = 0; i < 20; i++) {
      const d = await dispatch('chrome_raw', { method: `m${Math.floor(rand() * 999)}` })
      expect(d.kind).toBe('ask')
    }
  })
})

describe('豁免路径白纸黑字(不变量的边界,不是漏洞)', () => {
  it('审批门关闭(approval=off):写命令放行——用户显式选择,文档已声明', async () => {
    ;(svc as unknown as { state: { approval: string } }).state.approval = 'off'
    const d = await dispatch('site', { adapter: 'zhihu', command: 'comment' })
    expect(d.kind).toBe('allow')
    ;(svc as unknown as { state: { approval: string } }).state.approval = 'on'
  })
  it('unrestricted 模式:chrome_raw 放行——四档模式的顶格,面板明示不建议', async () => {
    ;(svc as unknown as { automationMode: string }).automationMode = 'unrestricted'
    const d = await dispatch('chrome_raw', { method: 'windows.remove' })
    expect(d.kind).toBe('allow')
    ;(svc as unknown as { automationMode: string }).automationMode = 'standard'
  })
  it('已知边界(声明,不遮掩):browser_* 原语不经审批门——与 dsh 权限体系及 BROWSER_DO_ALLOW 白名单共治', async () => {
    const d = await dispatch('browser_click', { target: '0' })
    expect(d.kind).toBe('allow') // 设计边界:导航类原语靠四档模式+白名单管,不重复设门
  })
})
