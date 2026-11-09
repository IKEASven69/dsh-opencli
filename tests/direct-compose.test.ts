// 直连组合层测试(direct-compose.ts,0.4.7 任务 A:直连铺满):桩掉全局 fetch 零真网络,
// 构造器用临时 fixture 模块(真实动态 import 路径)——验的是**组合纪律**:
// 只在成功路径归一 CLI 信封/守卫旗标不认识就回落 CLI(undefined)/页面身份流转/
// click 链的 CDP→JS 兜底次序/构造器装载失败整层回落。与上游行为的一致性由真机差分基准负责。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  composeClick, composeCloseWindow, composeOpen, composeScreenshot, composeScroll, composeState, composeTabs,
  setCliDistDir, __composeResetForTest,
} from '../src/direct-compose.ts'

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 逐请求编排:按 code 前缀/动作分派响应(队列或函数)。 */
type Responder = (action: string, body: Record<string, unknown>, call: number) => unknown
const scripted = (fn: Responder) => {
  let call = 0
  return (url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    const out = fn(String(body.action), body, ++call)
    return Promise.resolve(jsonResponse(out))
  }
}

/** 造一份 fixture 构造器模块:每个导出返回可识别前缀的 JS 串,让桩按前缀分派。 */
const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-compose-test-'))
  const br = join(dir, 'browser')
  mkdirSync(br, { recursive: true })
  writeFileSync(join(br, 'dom-snapshot.js'), "export function generateSnapshotJs(opts) { return 'SNAPSHOT_JS ' + JSON.stringify(opts) }\n")
  writeFileSync(join(br, 'target-resolver.js'), [
    "export function resolveTargetJs(ref, opts) { return 'RESOLVE ' + JSON.stringify({ ref, opts }) }",
    "export function boundingRectResolvedJs(opts) { return 'RECT ' + JSON.stringify(opts || {}) }",
    "export function clickResolvedJs(opts) { return 'CLICKJS ' + JSON.stringify(opts || {}) }",
    '',
  ].join('\n'))
  writeFileSync(join(br, 'dom-helpers.js'), "export function scrollJs(direction, amount) { return 'SCROLL ' + JSON.stringify({ direction, amount }) }\n")
  writeFileSync(join(br, 'network-interceptor.js'), "export const NETWORK_INTERCEPTOR_JS = 'INTERCEPTOR_JS'\n")
  return dir
}

let fixtureDir: string

beforeEach(() => {
  fixtureDir = makeFixture()
  setCliDistDir(fixtureDir)
  __composeResetForTest()
})
afterEach(() => {
  vi.unstubAllGlobals()
  setCliDistDir(undefined)
  try { rmSync(fixtureDir, { recursive: true, force: true }) } catch { /* tmp 清理失败不影响断言 */ }
})

describe('装载与回落纪律', () => {
  it('CLI dist 目录未注入/不存在 → 组合层整层 undefined(回落 CLI),且零网络请求', async () => {
    setCliDistDir(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await composeScroll('dsh', 'down', undefined, undefined)).toBeUndefined()
    expect(await composeState('dsh', undefined)).toBeUndefined()
    expect(await composeClick('dsh', '3', undefined, undefined)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    setCliDistDir(join(tmpdir(), 'no-such-dist-dir-xyz'))
    expect(await composeScroll('dsh', 'down', undefined, undefined)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('composeScroll', () => {
  it('成功路径归一 CLI 信封(`Scrolled down`),请求带 session/surface/page', async () => {
    let body: Record<string, unknown> | null = null
    stubFetch(scripted((_a, b) => { body = b; return { ok: true, data: null } }))
    const env = await composeScroll('sess1', 'down', undefined, 'tgt-1')
    expect(env).toEqual({ exitCode: 0, stdout: JSON.stringify({ ok: true, data: 'Scrolled down' }), stderr: '' })
    expect(body).toMatchObject({ action: 'exec', session: 'sess1', surface: 'browser', page: 'tgt-1' })
    expect(String(body!.code)).toContain('"direction":"down"')
    expect(String(body!.code)).toContain('"amount":500')
  })
  it('up + 自定义 amount 透传;非法方向不发起请求', async () => {
    let body: Record<string, unknown> | null = null
    stubFetch(scripted((_a, b) => { body = b; return { ok: true, data: null } }))
    expect(await composeScroll('dsh', 'up', 1200, undefined)).not.toBeUndefined()
    expect(String(body!.code)).toContain('"amount":1200')
    stubFetch(scripted(() => { throw new Error('不该发请求') }))
    expect(await composeScroll('dsh', 'left', undefined, undefined)).toBeUndefined()
  })
  it('exec 结构化失败 → undefined(CLI 兜底)', async () => {
    stubFetch(scripted(() => ({ ok: false, errorCode: 'page_not_found', error: 'stale' })))
    expect(await composeScroll('dsh', 'down', undefined, undefined)).toBeUndefined()
  })
})

describe('composeState', () => {
  it('快照→hash 回读→url 三连,信封 {url, snapshot};hash 进下一轮 generateSnapshotJs', async () => {
    const codes: string[] = []
    let call = 0
    stubFetch(scripted((_a, b) => {
      codes.push(String(b.code))
      call++
      if (call === 1) return { ok: true, data: '[1] link A', page: 'tgt-2' }
      if (call === 2) return { ok: true, data: '{"h1":"aa"}' }
      return { ok: true, data: 'https://x.example/' }
    }))
    const env1 = await composeState('sess2', undefined)
    expect(env1!.stdout).toBe(JSON.stringify({ ok: true, data: { url: 'https://x.example/', snapshot: '[1] link A' } }))
    // 第二轮:previousHashes 进构造器参数(增量 diff 生效),且 page 身份带 tgt-2
    stubFetch(scripted((_a, b) => {
      codes.push(String(b.code))
      call++
      if (call === 1) return { ok: true, data: '[1] link A' }
      if (call === 2) return { ok: true, data: '{"h1":"aa"}' }
      return { ok: true, data: 'https://x.example/' }
    }))
    const env2 = await composeState('sess2', 'tgt-2')
    expect(env2).not.toBeUndefined()
    const snaps = codes.filter((c) => c.startsWith('SNAPSHOT_JS'))
    const snapCall = snaps[snaps.length - 1]
    // hash 以上游 base-page 同款**原始字符串**形态回传构造器(上游:typeof hashes === 'string' 原样保留)
    expect(snapCall).toContain('"previousHashes":' + JSON.stringify('{"h1":"aa"}'))
    expect(codes.some((c) => c === 'window.__opencli_prev_hashes')).toBe(true)
    expect(codes.some((c) => c === 'window.location.href')).toBe(true)
  })
})

describe('composeClick', () => {
  /** click 链桩:resolve→marker→DOM.enable→getDocument→querySelector→scrollIntoViewIfNeeded→RECT→… */
  const clickStub = (rect: unknown, after: (action: string, body: Record<string, unknown>) => unknown) =>
    stubFetch(scripted((action, b) => {
      const code = String(b.code ?? '')
      if (action === 'exec' && code.startsWith('RESOLVE')) return { ok: true, data: { ok: true, matches_n: 1, match_level: 'exact' }, page: 'tgt-3' }
      if (action === 'exec' && code.startsWith('window.__resolved')) return { ok: true, data: { ok: true } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.enable') return { ok: true, data: {} }
      if (action === 'cdp' && b.cdpMethod === 'DOM.getDocument') return { ok: true, data: { root: { nodeId: 7 } } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.querySelector') return { ok: true, data: { nodeId: 99 } }
      if (action === 'cdp' && b.cdpMethod === 'DOM.scrollIntoViewIfNeeded') return { ok: true, data: {} }
      if (action === 'exec' && code.startsWith('RECT')) return { ok: true, data: rect }
      return after(action, b)
    }))

  it('hit=target → CDP 原生点击三连,信封 click_method:cdp + hit;坐标四舍五入', async () => {
    const mouseBodies: Array<Record<string, unknown>> = []
    clickStub({ visible: true, hit: 'target', x: 10.4, y: 20.6 }, (action, b) => {
      if (action === 'cdp' && b.cdpMethod === 'Input.dispatchMouseEvent') { mouseBodies.push(b); return { ok: true, data: {} } }
      throw new Error('不应有更多请求: ' + JSON.stringify(b))
    })
    const env = await composeClick('sess3', '3', undefined, undefined)
    expect(env!.stdout).toBe(JSON.stringify({ ok: true, data: { clicked: true, target: '3', matches_n: 1, match_level: 'exact', click_method: 'cdp', hit: 'target' } }))
    expect(mouseBodies.length).toBe(3)
    const types = mouseBodies.map((m) => (m.cdpParams as { type: string }).type)
    expect(types).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased'])
    expect((mouseBodies[1].cdpParams as { x: number }).x).toBe(10)
    expect((mouseBodies[1].cdpParams as { y: number }).y).toBe(21)
  })

  it('hit 不可信(visible:false)→ 走 el.click() JS 兜底,click_method:js', async () => {
    let jsClicked = false
    clickStub({ visible: false, hit: 'other' }, (action, b) => {
      if (action === 'exec' && String(b.code).startsWith('CLICKJS')) { jsClicked = true; return { ok: true, data: { status: 'clicked' } } }
      throw new Error('不应有 CDP 点击')
    })
    const env = await composeClick('dsh', '5', undefined, undefined)
    expect(jsClicked).toBe(true)
    expect(env!.stdout).toContain('"click_method":"js"')
    expect(env!.stdout).toContain('"clicked":true')
  })

  it('解析失败(resolution.ok!==true)→ undefined 回 CLI 出权威 TargetError', async () => {
    stubFetch(scripted((_a, b) => {
      if (String(b.code).startsWith('RESOLVE')) return { ok: true, data: { ok: false, code: 'target_not_found', message: 'no el', hint: 're-run state' } }
      throw new Error('解析失败后不该继续')
    }))
    expect(await composeClick('dsh', '9', undefined, undefined)).toBeUndefined()
  })

  it('CDP 与 JS 双双失败 → undefined 回 CLI', async () => {
    clickStub({ visible: true, hit: 'target', x: 1, y: 2 }, (action, b) => {
      if (action === 'cdp') return { ok: false, errorCode: 'cdp_failed', error: 'nope' }
      if (String(b.code).startsWith('CLICKJS')) return { ok: true, data: { status: 'failed', error: 'detached' } }
      return { ok: true, data: {} }
    })
    expect(await composeClick('dsh', '3', undefined, undefined)).toBeUndefined()
  })

  it('--nth 透传给 resolveTargetJs 的 opts', async () => {
    let resolveCode = ''
    stubFetch(scripted((_a, b) => {
      const code = String(b.code ?? '')
      if (code.startsWith('RESOLVE')) { resolveCode = code; return { ok: true, data: { ok: true, matches_n: 3, match_level: 'css' } } }
      if (code.startsWith('window.__resolved')) return { ok: true, data: { ok: false } }
      if (code.startsWith('RECT')) return { ok: true, data: { visible: false } }
      if (code.startsWith('CLICKJS')) return { ok: true, data: 'clicked' }
      return { ok: true, data: {} }
    }))
    await composeClick('dsh', '.item', 2, undefined)
    expect(resolveCode).toContain('"nth":2')
  })
})

describe('composeOpen(上游 open 六要素链,0.1.3 C①补强)', () => {
  /** 拦截 setTimeout 记录全部定时请求并 1ms 放行(composeOpen ③ 的 2s 落定等待不真等)。
   *  记录里同时有 direct.ts 每个请求的 AbortController 超时定时器——其值即 composeOpen 给各步的
   *  超时参数(捕获 15s/navigate 60s/拦截器 15s/URL 回读 10s),按序断言整串即锁住六要素次序。 */
  const captureSleeps = (): { sleeps: number[]; restore: () => void } => {
    const sleeps: number[] = []
    const real = globalThis.setTimeout
    const wrapped = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      sleeps.push(ms ?? 0)
      return real(fn as never, 1, ...(rest as never[]))
    }) as typeof setTimeout
    vi.stubGlobal('setTimeout', wrapped)
    return { sleeps, restore: () => vi.stubGlobal('setTimeout', real) }
  }

  it('六要素全链:①捕获启动(pattern 空)→② navigate→③ 2s 落定等待→⑤ URL 回读→信封 {url,page};捕获已开则不注入④拦截器', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const { sleeps, restore } = captureSleeps()
    stubFetch(scripted((action, b) => {
      bodies.push(b)
      if (action === 'network-capture-start') return { ok: true, data: {} }
      if (action === 'navigate') return { ok: true, data: {}, page: 'tgt-open' }
      if (action === 'exec' && b.code === 'window.location.href') return { ok: true, data: 'https://final.example/' }
      throw new Error('捕获已开不应注入拦截器: ' + JSON.stringify(b))
    }))
    const r = await composeOpen('sess-open', 'https://x.example/', undefined)
    restore()
    // 信封与页面身份
    expect(r!.pageId).toBe('tgt-open')
    expect(r!.env).toEqual({ exitCode: 0, stdout: JSON.stringify({ ok: true, data: { url: 'https://final.example/', page: 'tgt-open' } }), stderr: '' })
    // 请求次序与形状:捕获→navigate→URL 回读;无拦截器 exec
    expect(bodies.map((b) => String(b.action))).toEqual(['network-capture-start', 'navigate', 'exec'])
    expect(bodies[0]).toMatchObject({ session: 'sess-open', surface: 'browser', pattern: '' })
    expect(bodies[1]).toMatchObject({ session: 'sess-open', surface: 'browser', url: 'https://x.example/' })
    expect(bodies[2]).toMatchObject({ session: 'sess-open', page: 'tgt-open', code: 'window.location.href' })
    // ③ 落定等待恰一次 2000ms,夹在 navigate 与 URL 回读之间(上游 page.wait(2) 是刻意的页面稳定语义):
    // 定时器序列 = 捕获超时 15s → navigate 超时 60s → 落定 2s → URL 回读超时 10s
    expect(sleeps).toEqual([15_000, 60_000, 2000, 10_000])
  })

  it('旧扩展容忍:捕获启动报 unknown action + network-capture → 静默跳过并注入④拦截器(拦截器失败 non-fatal)', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const { sleeps, restore } = captureSleeps()
    stubFetch(scripted((action, b) => {
      bodies.push(b)
      if (action === 'network-capture-start') return { ok: false, errorCode: 'unknown action: network-capture-start', error: 'extension 1.0.20 not support' }
      if (action === 'navigate') return { ok: true, data: {}, page: 'tgt-cap2' }
      if (action === 'exec' && String(b.code).startsWith('INTERCEPTOR_JS')) return { ok: false, errorCode: 'eval_failed', error: 'blocked' }
      if (action === 'exec' && b.code === 'window.location.href') return { ok: true, data: 'https://x.example/' }
      throw new Error('不该有更多请求: ' + JSON.stringify(b))
    }))
    const r = await composeOpen('sess-cap2', 'https://x.example/', undefined)
    restore()
    expect(r!.pageId).toBe('tgt-cap2')
    // ④ 拦截器兜底:无会话捕获时注入(打在 navigate 回传的 page 身份上),失败不影响信封
    const inj = bodies.find((b) => String(b.code).startsWith('INTERCEPTOR_JS'))
    expect(inj).toBeDefined()
    expect(inj!.page).toBe('tgt-cap2')
    // 次序:捕获 15s → navigate 60s → 落定 2s → ④拦截器 15s → URL 回读 10s(拦截器在落定之后)
    expect(sleeps).toEqual([15_000, 60_000, 2000, 15_000, 10_000])
  })

  it('捕获启动其他失败(非 unknown-action)→ undefined 回 CLI,navigate 不发起', async () => {
    stubFetch(scripted((action) => {
      if (action === 'network-capture-start') return { ok: false, errorCode: 'HTTP 500', error: 'daemon busy' }
      throw new Error('捕获失败后不应继续: ' + action)
    }))
    expect(await composeOpen('sess-fail', 'https://x.example/', undefined)).toBeUndefined()
  })

  it('② stale 页身份: navigate 报 page/stale 类错误 → 清缓存不带 page 重试一次,重试成功继续', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const { restore } = captureSleeps()
    stubFetch(scripted((action, b) => {
      bodies.push(b)
      if (action === 'network-capture-start') return { ok: true, data: {} }
      if (action === 'navigate') return bodies.length === 2
        ? { ok: false, errorCode: 'page_not_found', error: 'stale page identity' }
        : { ok: true, data: {}, page: 'tgt-retry' }
      if (action === 'exec' && b.code === 'window.location.href') return { ok: true, data: 'https://x.example/' }
      throw new Error('不该有更多请求: ' + JSON.stringify(b))
    }))
    const r = await composeOpen('sess-stale', 'https://x.example/', 'old-tgt')
    restore()
    expect(r!.pageId).toBe('tgt-retry')
    const navs = bodies.filter((b) => b.action === 'navigate')
    expect(navs).toHaveLength(2)
    expect(navs[0]).toMatchObject({ page: 'old-tgt', url: 'https://x.example/' })
    expect(navs[1]!.page).toBeUndefined() // 重试不带 stale 的 page,让 daemon 重解析会话活页
    expect(navs[1]).toMatchObject({ url: 'https://x.example/' })
  })

  it('⑤ 已知 URL 进会话缓存:open 后 composeState 免 URL exec(信封 url 取 open 回读值)', async () => {
    const codes: string[] = []
    const { restore } = captureSleeps()
    stubFetch(scripted((action, b) => {
      if (action === 'network-capture-start') return { ok: true, data: {} }
      if (action === 'navigate') return { ok: true, data: {}, page: 'tgt-url' }
      if (action === 'exec') { codes.push(String(b.code)); return String(b.code) === 'window.location.href' ? { ok: true, data: 'https://opened.example/' } : { ok: true, data: '[1] link A' } }
      throw new Error('不该有更多请求: ' + action)
    }))
    await composeOpen('sess-url', 'https://opened-base.example/', undefined)
    restore()
    codes.length = 0 // 只看 state 阶段的 exec(open 自己的 ⑤ URL 回读不算)
    const env = await composeState('sess-url', 'tgt-url')
    // state 的 exec 里没有 window.location.href:URL 取自 open 的会话缓存
    expect(codes).not.toContain('window.location.href')
    expect(codes).toContain('window.__opencli_prev_hashes')
    expect(env!.stdout).toBe(JSON.stringify({ ok: true, data: { url: 'https://opened.example/', snapshot: '[1] link A' } }))
  })
})

describe('composeScreenshot / composeCloseWindow / composeTabs', () => {
  it('截图返回 base64+信封;非字符串 data → undefined', async () => {
    stubFetch(scripted(() => ({ ok: true, data: 'aGVsbG8=' })))
    const r = await composeScreenshot('dsh', undefined, { fullPage: true })
    expect(r!.base64).toBe('aGVsbG8=')
    expect(r!.env.stdout).toBe(JSON.stringify({ ok: true, data: 'aGVsbG8=' }))
    stubFetch(scripted(() => ({ ok: true, data: 42 })))
    expect(await composeScreenshot('dsh', undefined, {})).toBeUndefined()
  })
  it('close-window 信封与 CLI 逐字同文', async () => {
    stubFetch(scripted(() => ({ ok: true, data: {} })))
    const env = await composeCloseWindow('dsh', undefined)
    expect(env!.stdout).toBe(JSON.stringify({ ok: true, data: 'Browser session tab lease released' }))
  })
  it('tab list 数组透传;new 信封 {page,url};close 确认对象才归一', async () => {
    stubFetch(scripted((action, b) => {
      const op = (b as { op?: string }).op
      if (op === 'list') return { ok: true, data: [{ id: 't1' }] }
      if (op === 'new') return { ok: true, data: {}, page: 'new-tgt' }
      return { ok: true, data: { closed: 'dead-tgt' } }
    }))
    const list = await composeTabs('dsh', 'list', {}, undefined)
    expect(list!.env.stdout).toBe(JSON.stringify({ ok: true, data: [{ id: 't1' }] }))
    const nw = await composeTabs('dsh', 'new', { url: 'https://a.example/' }, undefined)
    expect(nw!.env.stdout).toBe(JSON.stringify({ ok: true, data: { page: 'new-tgt', url: 'https://a.example/' } }))
    expect(nw!.pageId).toBe('new-tgt')
    const cl = await composeTabs('dsh', 'close', {}, 'dead-tgt')
    expect(cl!.env.stdout).toBe(JSON.stringify({ ok: true, data: { closed: 'dead-tgt' } }))
    expect(cl!.closedPage).toBe('dead-tgt')
    stubFetch(scripted((action, b) => ({ ok: true, data: {} })))
    expect(await composeTabs('dsh', 'close', {}, undefined)).toBeUndefined()
  })

  it('tab select 按序号:请求 op select+index,信封 {selected:"<n>"},pageId 取响应 page(0.1.3 C①补强)', async () => {
    let body: Record<string, unknown> | null = null
    stubFetch(scripted((_a, b) => { body = b; return { ok: true, data: {}, page: 'sel-tgt' } }))
    const r = await composeTabs('sess-tab', 'select', { index: 2 }, undefined)
    expect(body).toMatchObject({ action: 'tabs', session: 'sess-tab', surface: 'browser', op: 'select', index: 2 })
    expect(r!.env.stdout).toBe(JSON.stringify({ ok: true, data: { selected: '2' } }))
    expect(r!.pageId).toBe('sel-tgt')
  })

  it('tab select 按 page 身份:目标透传 page 参数;响应缺 page → undefined 回 CLI 出权威结果', async () => {
    let body: Record<string, unknown> | null = null
    stubFetch(scripted((_a, b) => { body = b; return { ok: true, data: {}, page: 'sel-tgt2' } }))
    const r = await composeTabs('sess-tab', 'select', { page: 'tgt-9' }, undefined)
    expect(body).toMatchObject({ action: 'tabs', op: 'select', page: 'tgt-9' })
    expect(r!.env.stdout).toBe(JSON.stringify({ ok: true, data: { selected: 'tgt-9' } }))
    expect(r!.pageId).toBe('sel-tgt2')
    stubFetch(scripted(() => ({ ok: true, data: {} })))
    expect(await composeTabs('dsh', 'select', { page: 'tgt-9' }, undefined)).toBeUndefined()
  })
})
