// directForArgv 七 case 分派(0.1.3 C①:发现 9 服务层路由零测试补强):
// runBrowserTraced(2.x + 直连总闸开)把 browser argv 路由进 direct-compose 组合层——
// open/scroll/state/click/screenshot/tab/close 七个 head 逐一锁「路由进 compose 的请求形状
// 与归一信封」及页面身份缓存流转(open/new/select 回传 page、close 比对清缓存、close-window
// 释放租约清缓存);旗标守卫/未知 head 回落 CLI 零直连请求。
// 桩式照 direct-compose.test.ts:fetch 全桩(请求体逐条记录+按动作分派响应)。差异如实说明:
// 服务层的组合构造器由服务构造器自注入(resolveCliDistDir 定位本机已装 CLI)且 lib 捆绑不导出
// 注入 seam,单测层换不进 fixture——上游构造器是零副作用纯 JS 生成器,响应按动作+生成码内稳定
// 标记分派(scrollBy/FOR_CLICK/目标串,2026-11-10 本机 2.0.3 构造器实测)。无本机上游 CLI 的
// 环境构造器整层装载失败、组合层回落 CLI——涉构造器的四个用例 skipIf 跳过(如实降级,不假红)。
// lib 捆绑内的 direct/compose 模块状态与 src 是两份:本文件不调 src 的 __*ResetForTest
// (对 lib 无效),改为每个用例独占会话名隔离会话级缓存。
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

/** 与服务构造器 resolveCliDistDir 的全局回退级联同源:上游构造器目录在不在(决定 skipIf)。 */
const upstreamDist = join(dirname(process.execPath), 'node_modules', '@jackwener', 'opencli', 'dist', 'src')
const hasBuilders = existsSync(join(upstreamDist, 'browser', 'dom-snapshot.js'))

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

/** /command 请求体逐条记录 + 按动作分派响应(direct-compose.test.ts scripted 同款)。 */
type Responder = (action: string, body: Record<string, unknown>) => unknown
const scripted = (fn: Responder) => {
  const seen: Array<Record<string, unknown>> = []
  const stub = vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    seen.push(body)
    return Promise.resolve(jsonResponse(fn(String(body.action), body)))
  })
  return { stub, seen }
}

/** 响应桩不该被走到的分支:抛错=fetch reject=直连层 unreachable 回落,断言随即对不上而红。 */
const unexpected = (b: Record<string, unknown>): never => { throw new Error('不该有更多请求: ' + JSON.stringify(b)) }

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    // 2.0.x JSON 信封+尾部横幅(0.1.3 C② 实测形状;extensionConnected:true → 不触发无扩展短路)
    if (cmd.includes('daemon status')) {
      return { exitCode: 0, stdout: { text: '{"ok":true,"data":{"ok":true,"pid":19616,"uptime":3600.5,"daemonVersion":"2.0.3","extensionConnected":true,"extensionVersion":"1.0.26","port":19825,"running":true,"stale":false}}\n\n  Extension update available: v1.0.26 → v1.0.27\n  Download: https://github.com/jackwener/opencli/releases\n' }, stderr: { text: '' } }
    }
    // 其余(守卫回落 CLI 的 browser 命令)一律空 JSON 成功:断言据此区分「直连信封」与「CLI 兜底」
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}

class StubTools extends Service {
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
let traceDir: string
let shotsDir: string

const S = (): Record<string, any> => svc as unknown as Record<string, any>

beforeAll(async () => {
  // 直连总闸开(vitest config 缺省关;directEnabled 是构造期字段,须先于装载设好)
  process.env.DSH_OPENCLI_DIRECT = '1'
  const uniq = `${process.pid}-${Date.now()}`
  traceDir = join(tmpdir(), `dsh-opencli-test-traces-f-dispatch-${uniq}`)
  shotsDir = join(tmpdir(), `dsh-opencli-test-shots-f-dispatch-${uniq}`)
  process.env.DSH_OPENCLI_TRACE_DIR = traceDir
  process.env.DSH_OPENCLI_SHOTS_DIR = shotsDir
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  // subprocess seam 禁用(health-check 同款):本文件的 CLI 兜底语义全桩在 StubShell
  {
    const reflect = (ctx as unknown as { reflect: { get: (p: string, f?: boolean) => unknown } }).reflect
    const origGet = reflect.get.bind(reflect)
    reflect.get = (name: string, flag?: boolean) => (name === 'subprocess' ? undefined : origGet(name, flag))
  }
  // 步骤自动截图关:open/click 等页面变化命令执行后会补拍(直连 screenshot 请求),
  // 混进请求序列污染路由断言;补拍链路由 cli2/trace 用例覆盖,不在本文件范围
  S().shotCapture = false
  // 限流归零:守卫回落 CLI 的用例走真 runOpencli(governor 默认 750ms 只拖慢无断言价值)
  S().usagePolicy = { ...S().usagePolicy, minDelayMs: 0, maxConcurrency: 10, burst: 100, cooldownMs: 0, writeMinDelayMs: 0 }
})

afterAll(async () => {
  vi.unstubAllGlobals()
  process.env.DSH_OPENCLI_DIRECT = '0' // 复位到 vitest config 缺省值
  delete process.env.DSH_OPENCLI_TRACE_DIR
  delete process.env.DSH_OPENCLI_SHOTS_DIR
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
  rmSync(traceDir, { recursive: true, force: true })
  rmSync(shotsDir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 分派入口:cliMajor 直设 2(cli2 同款,探测链不参与本文件断言)→ runBrowserTraced → directForArgv。 */
const dispatch = async (session: string, argv: string[], fn: Responder): Promise<{ out: { exitCode: number; stdout: string; stderr: string }; seen: Array<Record<string, unknown>> }> => {
  S().cliMajorCache = 2
  const { stub, seen } = scripted(fn)
  vi.stubGlobal('fetch', stub)
  const out = await S().runBrowserTraced(session, argv) as { exitCode: number; stdout: string; stderr: string }
  return { out, seen }
}

/** open 桩:捕获开 → navigate 回传 page → URL 回读(open 前置建缓存的用例共用)。 */
const openResponder = (page: string, url: string): Responder => (action, b) => {
  if (action === 'network-capture-start') return { ok: true, data: {} }
  if (action === 'navigate') return { ok: true, data: {}, page }
  if (action === 'exec' && b.code === 'window.location.href') return { ok: true, data: url }
  return unexpected(b)
}

describe('directForArgv 七 case 分派(C①:open/scroll/state/click/screenshot/tab/close)', () => {
  it('open → composeOpen 链(capture-start→navigate→URL 回读),信封 {url,page}', { skipIf: !hasBuilders, timeout: 15_000 }, async () => {
    const { out, seen } = await dispatch('disp-open', ['open', 'https://disp.example/'], openResponder('disp-tgt', 'https://disp.example/landing'))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toBe(JSON.stringify({ ok: true, data: { url: 'https://disp.example/landing', page: 'disp-tgt' } }))
    expect(seen.map((b) => String(b.action))).toEqual(['network-capture-start', 'navigate', 'exec'])
    expect(seen[1]).toMatchObject({ session: 'disp-open', url: 'https://disp.example/' })
    // 守卫:open 带额外参数(旗标面不在组合层)→ 回落 CLI,零直连请求
    const guard = await dispatch('disp-open', ['open', 'https://disp.example/', '--wait'], (_a, b) => unexpected(b))
    expect(guard.seen).toHaveLength(0)
    expect(guard.out.stdout).toBe('{}\n')
  })

  it('scroll → composeScroll exec,信封 `Scrolled down`;透传 open 缓存的 page 身份与 --amount', { skipIf: !hasBuilders, timeout: 15_000 }, async () => {
    await dispatch('disp-scroll', ['open', 'https://disp.example/'], openResponder('scroll-tgt', 'https://disp.example/'))
    const { out, seen } = await dispatch('disp-scroll', ['scroll', 'down', '--amount', '300'], (action, b) => {
      if (action === 'exec') return { ok: true, data: null }
      return unexpected(b)
    })
    expect(out.stdout).toBe(JSON.stringify({ ok: true, data: 'Scrolled down' }))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ action: 'exec', session: 'disp-scroll', page: 'scroll-tgt' })
    // 真实上游 scrollJs 生成码(2.0.3 实测形态 window.scrollBy(0, <amount>))
    expect(String(seen[0]!.code)).toMatch(/scrollBy\(0,\s*300\)/)
  })

  it('state → composeState 快照链(快照→hash 回读→URL),信封 {url, snapshot}', { skipIf: !hasBuilders }, async () => {
    const { out, seen } = await dispatch('disp-state', ['state'], (action, b) => {
      if (action !== 'exec') return unexpected(b)
      const code = String(b.code)
      if (code === 'window.__opencli_prev_hashes') return { ok: true, data: '{"h1":"aa"}' }
      if (code === 'window.location.href') return { ok: true, data: 'https://disp.example/' }
      return { ok: true, data: '[1] link A', page: 'state-tgt' }
    })
    expect(out.stdout).toBe(JSON.stringify({ ok: true, data: { url: 'https://disp.example/', snapshot: '[1] link A' } }))
    expect(seen.map((b) => String(b.code)).slice(1)).toEqual(['window.__opencli_prev_hashes', 'window.location.href'])
    // 守卫:--source ax(CDP 无障碍树组合不在本层)→ 回落 CLI
    const guard = await dispatch('disp-state', ['state', '--source', 'ax'], (_a, b) => unexpected(b))
    expect(guard.seen).toHaveLength(0)
  })

  it('click → resolve→marker→CDP 滚入→量测→原生点击三连,信封 click_method:cdp;--nth 进解析码', { skipIf: !hasBuilders }, async () => {
    const mouse: string[] = []
    const { out, seen } = await dispatch('disp-click', ['click', '.buy-btn', '--nth', '1'], (action, b) => {
      const code = String(b.code ?? '')
      if (action === 'exec' && code.includes('buy-btn')) return { ok: true, data: { ok: true, matches_n: 2, match_level: 'css' }, page: 'click-tgt' }
      if (action === 'exec' && code.includes('data-opencli-cdp-target')) return { ok: true, data: { ok: true } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.enable') return { ok: true, data: {} }
      if (action === 'cdp' && b.cdpMethod === 'DOM.getDocument') return { ok: true, data: { root: { nodeId: 7 } } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.querySelector') return { ok: true, data: { nodeId: 99 } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.scrollIntoViewIfNeeded') return { ok: true, data: {} }
      if (action === 'exec' && code.includes('FOR_CLICK')) return { ok: true, data: { visible: true, hit: 'target', x: 3.2, y: 4.7 } }
      if (action === 'cdp' && b.cdpMethod === 'Input.dispatchMouseEvent') { mouse.push(String((b.cdpParams as { type: string }).type)); return { ok: true, data: {} } }
      return unexpected(b)
    })
    expect(JSON.parse(out.stdout)).toEqual({ ok: true, data: { clicked: true, target: '.buy-btn', matches_n: 2, match_level: 'css', click_method: 'cdp', hit: 'target' } })
    expect(mouse).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased'])
    const resolveExec = seen.find((b) => String(b.code).includes('buy-btn'))!
    expect(String(resolveExec.code)).toMatch(/nth\s*=\s*1\b/) // 真实 resolveTargetJs 内插 opts(2.0.3 实测 `const nth = 1`)
    // 守卫:语义定位旗标(--role)不在组合层 → 回落 CLI
    const guard = await dispatch('disp-click', ['click', '.buy-btn', '--role', 'button'], (_a, b) => unexpected(b))
    expect(guard.seen).toHaveLength(0)
  })

  it('screenshot(--full-page)→ 1:1 透传,信封 base64;--annotate 守卫回落 CLI', async () => {
    const { out, seen } = await dispatch('disp-shot', ['screenshot', '--full-page'], (action, b) => {
      if (action === 'screenshot') return { ok: true, data: 'aGVsbG8=' }
      return unexpected(b)
    })
    expect(out.stdout).toBe(JSON.stringify({ ok: true, data: 'aGVsbG8=' }))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ action: 'screenshot', session: 'disp-shot', surface: 'browser', fullPage: true })
    const guard = await dispatch('disp-shot', ['screenshot', '--annotate'], (_a, b) => unexpected(b))
    expect(guard.seen).toHaveLength(0)
    expect(guard.out.stdout).toBe('{}\n')
  })

  it('tab 四子 op:new 回传 page / list 透传 / select 刷新缓存 / close 比对清缓存', async () => {
    const op = (b: Record<string, unknown>): string => String((b as { op?: unknown }).op)
    const nw = await dispatch('disp-tab', ['tab', 'new', 'https://tab.example/'], (_a, b) => op(b) === 'new' ? { ok: true, data: {}, page: 'tab-tgt' } : unexpected(b))
    expect(nw.out.stdout).toBe(JSON.stringify({ ok: true, data: { page: 'tab-tgt', url: 'https://tab.example/' } }))
    expect(nw.seen[0]).toMatchObject({ action: 'tabs', op: 'new', url: 'https://tab.example/' })
    const ls = await dispatch('disp-tab', ['tab', 'list'], (_a, b) => op(b) === 'list' ? { ok: true, data: [{ id: 'tab-tgt' }] } : unexpected(b))
    expect(ls.out.stdout).toBe(JSON.stringify({ ok: true, data: [{ id: 'tab-tgt' }] }))
    // select 纯数字 → index;响应 page 刷新缓存为 tab-tgt2
    const sel = await dispatch('disp-tab', ['tab', 'select', '1'], (_a, b) => op(b) === 'select' ? { ok: true, data: {}, page: 'tab-tgt2' } : unexpected(b))
    expect(sel.out.stdout).toBe(JSON.stringify({ ok: true, data: { selected: '1' } }))
    expect(sel.seen[0]).toMatchObject({ op: 'select', index: 1 })
    // close --tab <当前缓存页>:daemon 回报 closed=缓存页 → 清缓存
    const cl1 = await dispatch('disp-tab', ['tab', 'close', '--tab', 'tab-tgt2'], (_a, b) => op(b) === 'close' ? { ok: true, data: { closed: 'tab-tgt2' } } : unexpected(b))
    expect(cl1.out.stdout).toBe(JSON.stringify({ ok: true, data: { closed: 'tab-tgt2' } }))
    expect(cl1.seen[0]).toMatchObject({ op: 'close', page: 'tab-tgt2' })
    // 缓存已清:无显式目标的 close 不再带 stale page;daemon 不回报 closed 且无目标=无法确认关了谁
    // → undefined 回 CLI 出权威结果(shell 桩 '{}')
    const cl2 = await dispatch('disp-tab', ['tab', 'close'], (_a, b) => op(b) === 'close' ? { ok: true, data: {} } : unexpected(b))
    expect(cl2.seen).toHaveLength(1)
    expect(cl2.seen[0]!.page).toBeUndefined()
    expect(cl2.out.stdout).toBe('{}\n')
  })

  it('close → close-window 释放租约(带缓存页),信封与 CLI 逐字同文;未知 head 零直连请求回落 CLI', async () => {
    await dispatch('disp-close', ['tab', 'new', 'https://tab.example/'], (_a, b) => (b as { op?: unknown }).op === 'new' ? { ok: true, data: {}, page: 'close-tgt' } : unexpected(b))
    const { out, seen } = await dispatch('disp-close', ['close'], (action, b) => action === 'close-window' ? { ok: true, data: {} } : unexpected(b))
    expect(out.stdout).toBe(JSON.stringify({ ok: true, data: 'Browser session tab lease released' }))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ action: 'close-window', session: 'disp-close', page: 'close-tgt' })
    // 租约已释放清缓存:再 close 不带 page
    const again = await dispatch('disp-close', ['close'], (action, b) => action === 'close-window' ? { ok: true, data: {} } : unexpected(b))
    expect(again.seen[0]!.page).toBeUndefined()
    // switch default:未知 head → undefined → CLI(零直连请求)
    const unk = await dispatch('disp-close', ['hover', '3'], (_a, b) => unexpected(b))
    expect(unk.seen).toHaveLength(0)
    expect(unk.out.stdout).toBe('{}\n')
  })
})
