// 直连传输层测试(direct.ts,任务 A1):桩掉全局 fetch 零真网络——
// 信封双形态解包/能力位三态(unknown→ready/off)/协议不认识整层禁用/超时不可达/
// 批量求值的 JSON 注入防护与逐条结果/字段形状(session/surface/page 回传)。
// 与上游线协议的逐字节一致性不在此验(真机冒烟负责),这里验的是**我们的边界纪律**:
// 任何失败不抛错、回落信号明确、禁用后不再试探。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  directCommand, directExec, directExecBatch, directNavigate, directProbe,
  directCapability, __directResetForTest,
} from '../src/direct.ts'

/** 桩 fetch:按用例编排响应序列。 */
const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let lastBody: Record<string, unknown> | null = null
let lastHeaders: Record<string, string> = {}
const record = (init?: RequestInit): void => {
  lastBody = init?.body !== undefined ? JSON.parse(String(init.body)) : null
  lastHeaders = (init?.headers ?? {}) as Record<string, string>
}

beforeEach(() => {
  __directResetForTest()
  lastBody = null
  lastHeaders = {}
})
afterEach(() => { vi.unstubAllGlobals() })

describe('线协议形状(请求侧)', () => {
  it('POST /command + X-OpenCLI 头 + {id,action,...params} 信封 + surface:browser', async () => {
    stubFetch(async (_u, init) => { record(init); return jsonResponse({ ok: true, data: 1 }) })
    const r = await directExec('dsh', '1+1')
    expect(r.ok).toBe(true)
    expect(String(lastHeaders['X-OpenCLI'])).toBe('1')
    expect(lastBody).toMatchObject({ action: 'exec', session: 'dsh', surface: 'browser', code: '1+1' })
    expect(typeof lastBody!.id).toBe('string')
  })

  it('navigate 请求带 url;exec 带 page 身份回传', async () => {
    stubFetch(async (_u, init) => { record(init); return jsonResponse({ ok: true, data: { page: 'tgt-1' } }) })
    await directNavigate('dsh', 'https://a.example/')
    expect(lastBody).toMatchObject({ action: 'navigate', url: 'https://a.example/' })
    await directExec('dsh', 'document.title', 'tgt-1')
    expect(lastBody).toMatchObject({ action: 'exec', page: 'tgt-1' })
    await directExec('dsh', 'document.title')
    expect(lastBody).not.toHaveProperty('page')
  })
})

describe('响应解包与能力位三态', () => {
  it('成功信封 {ok:true,data} 透传 data', async () => {
    stubFetch(async () => jsonResponse({ ok: true, data: { v: 42 } }))
    const r = await directExec('dsh', '1')
    expect(r).toEqual({ ok: true, data: { v: 42 } })
  })

  it('结构化失败 {ok:false,errorCode,error,hint} 全字段保留(协议在,不关能力位)', async () => {
    stubFetch(async () => jsonResponse({ ok: false, errorCode: 'page_not_found', error: 'stale', hint: 'tabs op=list' }))
    const r = await directExec('dsh', '1')
    expect(r).toMatchObject({ ok: false, unreachable: false, errorCode: 'page_not_found', error: 'stale', hint: 'tabs op=list' })
    expect(directCapability()).not.toBe('off')
  })

  it('网络拒绝/超时 → unreachable(不关能力位,daemon 可能没起)', async () => {
    stubFetch(async () => { throw new Error('ECONNREFUSED') })
    const r = await directCommand('exec', { session: 'dsh' })
    expect(r).toEqual({ ok: false, unreachable: true })
    expect(directCapability()).toBe('unknown')
  })

  it('HTTP 非 200 → 结构化失败(unreachable:false,调用方看 errorCode 决策)', async () => {
    stubFetch(async () => jsonResponse({ error: 'Forbidden' }, 403))
    const r = await directCommand('exec', { session: 'dsh' })
    expect(r).toMatchObject({ ok: false, unreachable: false, errorCode: 'HTTP 403' })
  })

  it('协议形状不认识(缺 ok 字段)→ 关能力位,后续命令不再发网络', async () => {
    let calls = 0
    stubFetch(async (_u, init) => { calls++; record(init); return jsonResponse({ result: 'foreign-shape' }) })
    const r1 = await directCommand('exec', { session: 'dsh' })
    expect(r1).toEqual({ ok: false, unreachable: true })
    expect(directCapability()).toBe('off')
    const r2 = await directCommand('exec', { session: 'dsh' })
    expect(r2).toEqual({ ok: false, unreachable: true })
    expect(calls).toBe(1) // 禁用后零网络
  })

  it('probe:成功 → ready;结构化失败 → 协议在也算 ready;网络不通 → 保持 unknown', async () => {
    stubFetch(async () => jsonResponse({ ok: false, errorCode: 'extension_disconnected' }))
    expect(await directProbe()).toBe(true)
    expect(directCapability()).toBe('ready')
    __directResetForTest()
    stubFetch(async () => { throw new Error('timeout') })
    expect(await directProbe()).toBe(false)
    expect(directCapability()).toBe('unknown')
  })
})

describe('批量求值(A3)', () => {
  it('多条表达式一次往返:code 内嵌 JSON 字符串数组,逐条结果 JSON 透传', async () => {
    stubFetch(async (_u, init) => {
      record(init)
      // 模拟 daemon:页面侧执行我们拼的批量表达式——这里直接回一个两条结果的信封
      return jsonResponse({ ok: true, data: '[{"ok":true,"v":1},{"ok":false,"e":"boom"}]' })
    })
    const r = await directExecBatch('dsh', ['1', 'throw 1'])
    expect(r.ok).toBe(true)
    const body = JSON.parse('[' + String(lastBody!.code!.match(/var rs=\[(.*?)\];return/)?.[1] ?? '') + ']')
    expect(body).toEqual(['1', 'throw 1'])
    expect(String((r as { data: unknown }).data)).toContain('"ok":true')
  })

  it('空批拒绝;引号/换行注入被 JSON.stringify 消毒', async () => {
    stubFetch(async (_u, init) => { record(init); return jsonResponse({ ok: true, data: '[]' }) })
    const r = await directExecBatch('dsh', [])
    expect(r).toMatchObject({ ok: false, errorCode: 'empty-batch' })
    await directExecBatch('dsh', ["'));evil();//", "a\nb"])
    const raw = JSON.parse('[' + String(lastBody!.code!.match(/var rs=\[(.*?)\];return/)?.[1] ?? '') + ']')
    expect(raw).toEqual(["'));evil();//", 'a\nb'])
  })
})
