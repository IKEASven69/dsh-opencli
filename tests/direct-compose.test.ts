// 直连组合层测试(direct-compose.ts,0.4.7 任务 A:直连铺满):桩掉全局 fetch 零真网络,
// 构造器用临时 fixture 模块(真实动态 import 路径)——验的是**组合纪律**:
// 只在成功路径归一 CLI 信封/守卫旗标不认识就回落 CLI(undefined)/页面身份流转/
// click 链的 CDP→JS 兜底次序/构造器装载失败整层回落。与上游行为的一致性由真机差分基准负责。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  composeClick, composeCloseWindow, composeScreenshot, composeScroll, composeState, composeTabs,
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
})
