/**
 * 零配置降级(无扩展时的诚实可用面)测试套件:docs/DESIGN-zero-config-fallback.md MVP(P0)。
 * 覆盖两层:
 * - §4-2 四条安全不变量(必须钉死,防止未来有人在降级路径上"为了可用性"绕门):
 *   ①降级模式下 site 写命令仍 kind:'ask';②注入只加 env 与 flag 不改输出语义;
 *   ③OPENCLI_CDP_ENDPOINT 只来自 probeCdp 候选端口;④插件进程环境零残留(不写 process.env)。
 * - §3 路由行为:①通道A直跑零改动 / ②注入形状与「匿名降级」标注 / ③AUTH 降级引导文案 /
 *   ④⑤browser_*、chrome_* 无扩展短路 / 写命令永不降级 / 有扩展时通道B不介入(无缝切回)。
 * 方法:cordis 裸 Context + 桩 shell(approval-invariant 同款),daemon 桩固定 2.0 信封
 * extensionConnected:false(→ 归一 'not connected',显式未连);CDP 端点用本地 http 伪装,
 * OPENCLI_CDP_PORT 前置候选保证探测顺序确定。client 侧纯函数直接引 src/client.ts(onboarding 先例)。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { readonlySiteCount } from '../src/client.ts'
import { createServer, type Server } from 'node:http'
import * as path from 'node:path'
import * as os from 'node:os'

/** 2.0 list 信封(cliMajor=2 走分页解析,桩必须给 envelope 而非平铺数组)。 */
const LIST_ENV = JSON.stringify({ ok: true, data: { commands: [
  { site: 'juejin', name: 'hot', access: 'read', domain: 'juejin.cn' },
  { site: '36kr', name: 'hot', access: 'read', domain: '36kr.com' },
  { site: 'weibo', name: 'hot', access: 'read', domain: 'weibo.com' },
  { site: 'zhihu', name: 'hot', access: 'read', domain: 'zhihu.com' },
  { site: 'zhihu', name: 'comment', access: 'write', domain: 'zhihu.com' },
], total: 5, nextOffset: 0 } })

const ok = (text: string): { exitCode: number; stdout: { text: string }; stderr: { text: string } } =>
  ({ exitCode: 0, stdout: { text }, stderr: { text: '' } })

class ZcShell extends Service {
  /** daemon 桩的扩展态可翻(有扩展对照测试用),信封字段与 parseDaemonStatus 2.0 路径对齐 */
  daemonConnected = false
  calls: Array<{ cmd: string; env?: Record<string, string> }> = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown; env?: Record<string, string> }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    this.calls.push({ cmd, env: spec.env })
    if (cmd.includes('--version')) return ok('2.0.0\n')
    if (cmd.includes('daemon status')) {
      return ok(JSON.stringify({ ok: true, data: { running: true, daemonVersion: '2.0.0', extensionConnected: this.daemonConnected, port: 19825 } }))
    }
    if (cmd.includes('list')) return ok(LIST_ENV)
    // 命令级 browser 字段桩(设计 §2.1 实测口径:juejin false / 36kr、weibo true)
    if (/juejin hot --help/.test(cmd)) return ok(JSON.stringify({ site: 'juejin', name: 'hot', browser: false, access: 'read' }))
    if (/36kr hot --help/.test(cmd)) return ok(JSON.stringify({ site: '36kr', name: 'hot', browser: true, access: 'read' }))
    if (/weibo hot --help/.test(cmd)) return ok(JSON.stringify({ site: 'weibo', name: 'hot', browser: true, access: 'read' }))
    // 执行类:36kr 成功(②匿名降级拿到数据);weibo 撞登录墙(③AUTH);juejin 空结果(①零改动)
    if (cmd.includes('36kr hot')) return ok('[{"title":"t1"}]\n')
    if (cmd.includes('weibo hot')) return { exitCode: 3, stdout: { text: '' }, stderr: { text: 'AUTH_REQUIRED\n请先登录' } }
    if (cmd.includes('zhihu comment')) return ok('posted-ok\n')
    if (cmd.includes('screenshot')) return ok('saved\n')
    return ok('[]\n')
  }
}

class ZcTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}

class ZcSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: ZcShell
let srv: Server | null = null
/** CDP 伪装端口:固定首选 + 兜底候选——首选被占(EADDRINUSE)时整个文件会红,这种环境碰撞
 *  不是被测行为,顺延到下一候选并让 OPENCLI_CDP_PORT 跟随(探测表首位=该 env,确定性不变)。 */
let CDP_TEST_PORT = 0

const S = (): Record<string, any> => svc as unknown as Record<string, any>
const tool = (name: string): { execute: (a: unknown) => Promise<{ text: string }> } =>
  (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get(name)!

/** 执行类调用 = 排除探测/基建(--version、daemon status、list、--help、screenshot 证据拍)。 */
const execCalls = (from = 0): Array<{ cmd: string; env?: Record<string, string> }> =>
  shell.calls.slice(from).filter((c) => !/--version|daemon status|list|--help|screenshot/.test(c.cmd))

const dispatchPre = async (name: string, args: Record<string, unknown>): Promise<{ kind: string; reason?: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>
  }).waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

/** 切换 daemon 桩扩展态并作废扩展缓存(两处一起改,否则 15s 缓存读到旧值)。 */
const setExt = (connected: boolean): void => {
  shell.daemonConnected = connected
  S().extCache = null
}

beforeAll(async () => {
  const uniq = `${process.pid}-${Date.now()}`
  // bin 固定裸命令:命令行断言不依赖本机 node/opencli 安装布局
  process.env.DSH_OPENCLI_BIN = 'opencli'
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-zerocfg-' + uniq)
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-zerocfg-' + uniq)
  process.env.DSH_OPENCLI_EVIDENCE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-evidence-f-zerocfg-' + uniq)
  // 状态文件同样按本次调用唯一化(先于插件装载设好,构造器读 env):vitest.config 的
  // `state-${pid}.json` 是全进程共享键,tmpdir 残档 + OS 回收 pid 会让上一轮某文件写入的
  // approval:'off' 在本轮被 loadState 读回,审批门对写命令放行——本文件 §4-2 断言实测
  // 以 ~1/18 概率红即此。trace/shots 目录同款隔离先例见 tests/cli2.test.ts 顶部说明。
  process.env.DSH_OPENCLI_STATE = path.join(os.tmpdir(), 'dsh-opencli-test-state-f-zerocfg-' + uniq)
  // CDP 端口前置候选:probeCdp 的端口表 = [OPENCLI_CDP_PORT, ...常量表],首位命中即确定,
  // 本机真实 Chrome 即使在 9222 也不影响测试确定性
  const portCandidates = [9241, 9242, 9245, 9249]
  for (const p of portCandidates) {
    const trySrv = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ Browser: 'Chrome/138.0.0.0', 'Protocol-Version': '1.3' }))
    })
    const won = await new Promise<boolean>((r) => {
      trySrv.once('error', () => r(false))
      trySrv.listen(p, '127.0.0.1', () => r(true))
    })
    if (won) { srv = trySrv; CDP_TEST_PORT = p; break }
    try { trySrv.close() } catch { /* 未监听成功,关掉即可 */ }
  }
  if (srv === null) throw new Error(`zerocfg: CDP 候选端口全部被占:${portCandidates.join(',')}`)
  process.env.OPENCLI_CDP_PORT = String(CDP_TEST_PORT)
  // 通道B 已默认关死(立项评审:attach 现存标签页与匿名承诺冲突)——注入用例挂实验开关;
  // 「默认必不注入」由独立用例回归,不受此开关影响(该用例自行摘除再复位)
  process.env.OPENCLI_ZEROCDP_CDP = '1'
  ctx = new Context()
  await ctx.plugin(ZcShell)
  await ctx.plugin(ZcTools)
  await ctx.plugin(ZcSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: ZcShell }).shell
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  // 限流归零:site 执行链有多次 shell 往返,默认 750ms 间隔会拖慢整个文件且无断言价值
  S().usagePolicy = { minDelayMs: 0, maxConcurrency: 10, burst: 100, cooldownMs: 0, retryLimit: 2, maxPagesPerRun: 20, maxDepth: 2 }
  // 门的四项前置显式归位(gate.test 同款纪律):唯一状态文件理论上已隔离,再钉一层防
  // 任何未来装载期写入——§4-2 用例的成立前提就是 approval=on + 站点未禁用 + standard 档
  S().state.approval = 'on'
  S().state.disabled = []
  S().automationMode = 'standard'
})

afterAll(async () => {
  srv?.close()
  delete process.env.OPENCLI_CDP_PORT
  delete process.env.OPENCLI_ZEROCDP_CDP
  delete process.env.DSH_OPENCLI_BIN
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('§4-2 不变量:降级不得动摇审批门与进程环境', () => {
  it('① 降级模式下 site 写命令仍 kind:ask(审批门零语义变化);读命令照常放行', async () => {
    setExt(false)
    const d = await dispatchPre('site', { adapter: 'zhihu', command: 'comment', args: ['x'] })
    // 诊断信息随断言带出:门的前置状态(approval/disabled/mode)——若跨文件状态污染再现,红得有据可查
    expect(d.kind, JSON.stringify({ approval: S().state.approval, disabled: S().state.disabled, mode: S().automationMode, reason: d.reason })).toBe('ask')
    expect(d.reason ?? '').toContain('写操作')
    const r = await dispatchPre('site', { adapter: 'zhihu', command: 'hot' })
    expect(r.kind).toBe('allow')
  })

  it('① 写命令执行体零注入:argv 无 flag、spec 无 CDP env(绕过审批门直达执行体同样干净)', async () => {
    setExt(false)
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: 'zhihu', command: 'comment', args: ['hello'] })
    expect(r.text).toContain('posted-ok')
    const wrote = execCalls(before)
    // 写命令唯一执行调用:原样 argv,env 未携带(screenshot 证据拍被 execCalls 过滤,其 env 也为空)
    expect(wrote.map((c) => c.cmd)).toEqual(['opencli zhihu comment hello'])
    expect(wrote[0]!.env).toBeUndefined()
    expect(shell.calls.slice(before).every((c) => c.env === undefined)).toBe(true)
  })

  it('② 通道B 注入只加 env 与 flag:argv 前缀保持、env 键集恰为 OPENCLI_CDP_ENDPOINT,输出原样透传', async () => {
    setExt(false)
    S().cdpCache = null
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: '36kr', command: 'hot' })
    const ran = execCalls(before)
    expect(ran).toHaveLength(1)
    expect(ran[0]!.cmd).toBe('opencli 36kr hot --site-session ephemeral')
    expect(ran[0]!.env).toEqual({ OPENCLI_CDP_ENDPOINT: `http://127.0.0.1:${CDP_TEST_PORT}` })
    // exitCode/输出语义不变:exit 0 的 stdout 原文逐字透传(注入不改解包与透传,紧凑 JSON 不重排)
    expect(r.text).toContain('【匿名降级】')
    expect(r.text).toContain('[{"title":"t1"}]')
  })

  it('③④ 端点口径与进程环境:OPENCLI_CDP_ENDPOINT 只来自 probeCdp 候选端口;进程环境零残留、永不设 SITE_SLOTS', async () => {
    // 上一条已真实跑过注入路径,此刻检查宿主进程环境(§4-2-4:per-spawn spec 注入,不写 process.env)
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBeUndefined()
    // §3 脚注防回归:本插件永不设置 OPENCLI_SITE_SLOTS(与 CDP env 互斥,上游会抛 ArgumentError)
    expect(process.env.OPENCLI_SITE_SLOTS).toBeUndefined()
    expect(S().cdpCache.port).toBe(CDP_TEST_PORT)
    // 端点唯一来源 = 候选端口表(env 显式配置的 9241;不指向任何其他浏览器的构造路径)
    const injected = shell.calls.find((c) => c.env !== undefined)
    expect(injected!.env!.OPENCLI_CDP_ENDPOINT).toBe(`http://127.0.0.1:${CDP_TEST_PORT}`)
  })
})

describe('§3 路由行为(无扩展 = daemon 明确报告 extensionConnected:false)', () => {
  it('① browser:false 直跑零改动:无 flag、无 env、无「匿名降级」标注,空结果维持原文案', async () => {
    setExt(false)
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: 'juejin', command: 'hot' })
    const ran = execCalls(before)
    expect(ran.map((c) => c.cmd)).toEqual(['opencli juejin hot'])
    expect(ran[0]!.env).toBeUndefined()
    expect(r.text).not.toContain('【匿名降级】')
    expect(r.text).toContain('返回空')
  })

  it('② 无 CDP 端点 → ④式诚实报不可用:不执行命令,给装扩展与纯 HTTP 替代两条路', async () => {
    setExt(false)
    // 强制 probeCdp 缓存一次"未命中":不依赖关停本地服务,也不受本机真实 CDP 端口干扰
    S().cdpCache = { at: Date.now(), found: false, port: null, browser: null }
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: '36kr', command: 'hot' })
    expect(r.text).toContain('无法匿名降级')
    expect(r.text).toContain('装扩展')
    expect(r.text).toContain('site juejin hot')
    // 只有 --help 探测,没有实际执行
    expect(execCalls(before)).toHaveLength(0)
    expect(shell.calls.slice(before).some((c) => c.cmd.includes('36kr hot') && !c.cmd.includes('--help'))).toBe(false)
    S().cdpCache = null
  })

  it('③ 匿名降级撞登录墙 → AUTH 降级引导(整体不可用+装扩展),不再误导"去浏览器登录"', async () => {
    setExt(false)
    S().cdpCache = null
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: 'weibo', command: 'hot' })
    expect(r.text).toContain('登录态缺失')
    expect(r.text).toContain('无扩展')
    expect(r.text).toContain('装扩展')
    // 注入照常发生(登录墙是执行后的运行时归类,不是路由前置判据——PUBLIC/COOKIE 不预判,§2.1 决策)
    const ran = execCalls(before)
    expect(ran[0]!.cmd).toBe('opencli weibo hot --site-session ephemeral')
    expect(ran[0]!.env).toEqual({ OPENCLI_CDP_ENDPOINT: `http://127.0.0.1:${CDP_TEST_PORT}` })
  })

  it('③ try-run 同款 AUTH 归类:无扩展时换降级引导,「登录态缺失」前缀保持(归类锚点不变)', async () => {
    setExt(false)
    const r = await (svc as unknown as { tryRun: (x: { line: string }) => Promise<{ ok: boolean; error?: string }> }).tryRun({ line: 'site weibo hot' })
    expect(r.ok).toBe(false)
    expect(r.error ?? '').toContain('登录态缺失')
    expect(r.error ?? '').toContain('整体不可用')
  })

  it('④ browser_* 无扩展短路:一次性装扩展指引,零注定失败的 daemon 往返', async () => {
    setExt(false)
    const before = shell.calls.length
    const r = await tool('browser_open').execute({ url: 'https://example.com/1' })
    expect(r.text).toContain('需要 OpenCLI 扩展')
    expect(r.text).toContain('releases')
    // 除 daemon status 探测外零调用:没有 browser open、没有补拍截图
    expect(shell.calls.slice(before).filter((c) => !c.cmd.includes('daemon status'))).toHaveLength(0)
    // 短路也进轨迹(复盘能看到"为何没执行"),带 [no-ext] 标记
    expect(r.text).toContain('不伪造降级')
  })

  it('⑤ chrome_* 同款短路:不发注定失败的 browser chrome call', async () => {
    setExt(false)
    const before = shell.calls.length
    const r = await tool('chrome_tabs').execute({ method: 'tabs.query', args: '[]' })
    expect(r.text).toContain('需要 OpenCLI 扩展')
    expect(shell.calls.slice(before).filter((c) => !c.cmd.includes('daemon status'))).toHaveLength(0)
  })

  it('有扩展时通道B不介入(无缝切回):扩展翻绿后同命令零注入直跑', async () => {
    setExt(true)
    S().cdpCache = null
    const before = shell.calls.length
    const r = await tool('site').execute({ adapter: '36kr', command: 'hot' })
    const ran = execCalls(before)
    expect(ran.map((c) => c.cmd)).toEqual(['opencli 36kr hot'])
    expect(ran[0]!.env).toBeUndefined()
    expect(r.text).not.toContain('【匿名降级】')
    setExt(false)
  })
})

describe('§2.2 触发点文案(doctor / systemPrompt 目录 / 面板纯函数)', () => {
  it('doctor:BrowserBridge 红层 next 给两条——装扩展 与 零配置继续用', async () => {
    setExt(false)
    const r = await tool('opencli_doctor').execute({})
    expect(r.text).toContain('✗ BrowserBridge:扩展未连接')
    expect(r.text).toContain('加载解压缩的扩展')
    expect(r.text).toContain('零配置继续用')
    expect(r.text).toContain('匿名降级')
  })

  it('systemPrompt 目录:无扩展时声明可用面(纯 HTTP 可跑/匿名降级标注/④⑤不可用/装扩展)', async () => {
    setExt(false)
    await S().updateDirectory()
    const text = S().directoryText as string
    expect(text).toContain('当前无扩展')
    expect(text).toContain('匿名降级')
    expect(text).toContain('browser_*/chrome_*')
    expect(text).toContain('https://github.com/jackwener/OpenCLI/releases')
  })

  it('systemPrompt 目录:有扩展时不追加降级段(全绿不占上下文)', async () => {
    setExt(true)
    await S().updateDirectory()
    expect(S().directoryText as string).not.toContain('当前无扩展')
    setExt(false)
  })

  it('面板纯函数 readonlySiteCount:kinds 含 read 即计入,只提示不门控(§2.1)', () => {
    expect(readonlySiteCount([
      { name: 'a', commandCount: 1, commands: ['hot'], sample: '', kinds: ['read', 'write'] },
      { name: 'b', commandCount: 1, commands: ['post'], sample: '', kinds: ['write'] },
      { name: 'c', commandCount: 1, commands: ['hot'], sample: '', kinds: ['read'] },
    ])).toBe(2)
    expect(readonlySiteCount(null)).toBe(0)
    expect(readonlySiteCount([{ name: 'd', commandCount: 0, commands: [], sample: '', kinds: [] }])).toBe(0)
  })
})

describe('通道B 默认关死(立项评审致命发现的信任守卫)', () => {
  it('无实验开关时:端点在线也绝不注入——输出必须是 skip 指引而非匿名降级执行', async () => {
    const saved = process.env.OPENCLI_ZEROCDP_CDP
    delete process.env.OPENCLI_ZEROCDP_CDP
    try {
      setExt(false)
      shell.calls = []
      const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('site')!
      const r = await tool.execute({ adapter: '36kr', command: 'hot' })
      expect(r.text).toContain('无法匿名降级执行')
      expect(r.text).not.toContain('【匿名降级】')
      const injected = shell.calls.find((c) => c.env !== undefined)
      expect(injected, '默认路径不得注入 OPENCLI_CDP_ENDPOINT').toBeUndefined()
    } finally {
      if (saved !== undefined) process.env.OPENCLI_ZEROCDP_CDP = saved
    }
  })
})
