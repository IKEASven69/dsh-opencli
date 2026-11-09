// MCP 自host Streamable-HTTP 端点单测(0.1.3 E①):
// ① JSON-RPC 纯函数层——initialize/tools list/tools call 三链路 + 通知/坏消息/未知方法
// ② HTTP 集成层——token 门(无 token/错 token 拒绝)、路径/方法白名单、坏 JSON、202
// ③ 启动容错——端口冲突返回 { ok:false } 不抛,先启动的实例继续服务;stop 删告知文件
// 真实 socket:node:http 监听 127.0.0.1 + fetch 打回环(端口全部显式指定,不碰默认 19831)
import { describe, expect, it, afterAll } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleJsonRpc, knowledgeCard, knowledgeList, startMcpSelfhost, type McpSelfhostHandle } from '../src/mcp-selfhost.ts'

const ENTRIES = [
  { site: 'weibo', name: 'hot', access: 'read', description: '微博热搜', domain: 'weibo.com' },
  { site: 'weibo', name: 'publish', access: 'write', description: '发微博' },
  { site: 'xiaohongshu', name: 'search', access: 'read', description: '搜索笔记' },
]

describe('handleJsonRpc(JSON-RPC 纯函数层,三链路)', () => {
  it('initialize:回显客户端协议版本,serverInfo/capabilities 齐全', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', clientInfo: { name: 'test' } } }, { entries: ENTRIES }) as { jsonrpc: string; id: number; result: Record<string, unknown> }
    expect(r.jsonrpc).toBe('2.0')
    expect(r.id).toBe(1)
    expect(r.result.protocolVersion).toBe('2025-03-26') // 客户端带版本→原样回显
    const caps = r.result.capabilities as { tools: Record<string, unknown> }
    expect(caps.tools).toBeDefined()
    const info = r.result.serverInfo as { name: string; version: string }
    expect(info.name).toBe('dsh-opencli')
    expect(info.version.length).toBeGreaterThan(0)
  })

  it('initialize:客户端不带版本→服务端默认版本', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 'a', method: 'initialize' }, {}) as { result: { protocolVersion: string } }
    expect(r.result.protocolVersion).toBe('2025-06-18')
  })

  it('tools/list:只读两工具,inputSchema 是对象契约', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {}) as { result: { tools: Array<{ name: string; inputSchema: { type: string }; annotations?: { readOnlyHint?: boolean } }> } }
    const names = r.result.tools.map((t) => t.name)
    expect(names).toEqual(['knowledge_list', 'knowledge_get'])
    expect(r.result.tools.every((t) => t.inputSchema.type === 'object')).toBe(true)
    expect(r.result.tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)
  })

  it('tools/call knowledge_list:目录+健康表+坑表三源合并(threads 无适配器也入列)', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'knowledge_list', arguments: {} } }, { entries: ENTRIES }) as { result: { content: Array<{ type: string; text: string }>; structuredContent: { sites: Array<Record<string, unknown>> }; isError?: boolean } }
    expect(r.result.isError).toBeUndefined()
    expect(r.result.content[0]!.type).toBe('text')
    const sites = r.result.structuredContent.sites
    const xhs = sites.find((s) => s.site === 'xiaohongshu') as { health?: { status: string }; pitfallCount?: number; commandCount?: number }
    expect(xhs.health?.status).toBe('notice')
    expect(xhs.pitfallCount).toBeGreaterThan(0)
    expect(xhs.commandCount).toBe(1) // 目录注入后出命令数
    const threads = sites.find((s) => s.site === 'threads') as { health?: { status: string }; commandCount?: number }
    expect(threads.health?.status).toBe('unsupported')
    expect(threads.commandCount).toBeUndefined() // 不在目录:没有命令数(省键,不占位)
    const weibo = sites.find((s) => s.site === 'weibo') as { pitfallCount?: number }
    expect(weibo.pitfallCount).toBeGreaterThan(0)
    // 无 entries 注入:health/pitfalls 读侧照常(threads/xiaohongshu 行仍在),目录字段省键
    const r2 = handleJsonRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'knowledge_list' } }, {}) as { result: { structuredContent: { sites: Array<Record<string, unknown>> } } }
    expect(r2.result.structuredContent.sites.length).toBeGreaterThanOrEqual(3)
    expect(r2.result.structuredContent.sites.every((s) => s.commandCount === undefined)).toBe(true)
  })

  it('tools/call knowledge_get:目录内站出完整卡(含命令目录段)', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'Weibo' } } }, { entries: ENTRIES }) as { result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown> } }
    expect(r.result.structuredContent.site).toBe('weibo') // 大小写归一
    expect(r.result.content[0]!.text).toContain('# 站点知识卡:weibo')
    expect(r.result.content[0]!.text).toContain('site weibo hot')
  })

  it('tools/call knowledge_get:目录缺站但健康表有→降格卡(如实无命令目录);两头都无→isError', () => {
    // threads 只在健康表(unsupported):出降格卡,不编命令
    const r = knowledgeCard('threads', undefined)
    expect(r).not.toBeNull()
    expect(r!.markdown).toContain('站点健康度:未支持')
    expect(r!.card.commandCount).toBe(0)
    const rpc = handleJsonRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'threads' } } }, {}) as { result: { isError?: boolean; structuredContent: { commandCount: number } } }
    expect(rpc.result.isError).toBeUndefined()
    expect(rpc.result.structuredContent.commandCount).toBe(0)
    // 完全未知的站:工具级失败(isError),不是 JSON-RPC 错
    const bad = handleJsonRpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'nosuchsite' } } }, { entries: ENTRIES }) as { result: { isError: boolean } }
    expect(bad.result.isError).toBe(true)
  })

  it('tools/call:未知工具→-32602;非法参数→-32602;未知方法→-32601', () => {
    const unknownTool = handleJsonRpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'schedule_add', arguments: {} } }, {}) as { error: { code: number } }
    expect(unknownTool.error.code).toBe(-32602) // 写面工具不存在:HTTP 旁路没有写面
    const badArgs = handleJsonRpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'knowledge_get', arguments: 'weibo' } }, {}) as { error: { code: number } }
    expect(badArgs.error.code).toBe(-32602)
    const unknownMethod = handleJsonRpc({ jsonrpc: '2.0', id: 10, method: 'resources/read', params: {} }, {}) as { error: { code: number } }
    expect(unknownMethod.error.code).toBe(-32601)
  })

  it('通知(无 id)回 null;ping/initialized 合法;坏消息(含无 id 的)回 -32600', () => {
    expect(handleJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, {})).toBeNull()
    const ping = handleJsonRpc({ jsonrpc: '2.0', id: null, method: 'ping' }, {}) as { result: Record<string, unknown> }
    expect(ping.result).toEqual({})
    expect((handleJsonRpc({ jsonrpc: '1.0', id: 1, method: 'initialize' }, {}) as { error: { code: number } }).error.code).toBe(-32600)
    expect((handleJsonRpc({ method: 'initialize' }, {}) as { error: { code: number } }).error.code).toBe(-32600)
    expect((handleJsonRpc('hello', {}) as { error: { code: number } }).error.code).toBe(-32600)
    expect((handleJsonRpc({ jsonrpc: '2.0', id: { x: 1 }, method: 'initialize' }, {}) as { error: { code: number } }).error.code).toBe(-32600)
  })
})

// ── HTTP 集成层(真实 socket) ──────────────────────────────────────────────

const TMP = await mkdtemp(join(tmpdir(), 'dsh-mcp-selfhost-test-'))
const TOKEN = 'test-token-0123456789abcdef'
const handles: McpSelfhostHandle[] = []
const started = await startMcpSelfhost({ port: 0, token: TOKEN, authFile: join(TMP, 'auth.json'), entriesProvider: () => ENTRIES })
if (!started.ok) throw new Error(`测试服务器启动失败:${started.error}`)
handles.push(started.handle)
const BASE = started.handle.url

const rpc = async (body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text.length > 0 ? JSON.parse(text) : null }
}
const AUTHED = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

describe('HTTP 层:三链路+token 门+白名单', () => {
  it('initialize:200 + serverInfo;tools/list:两工具;tools/call:出卡', async () => {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(init.status).toBe(200)
    expect((init.json.result.serverInfo as { name: string }).name).toBe('dsh-opencli')
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((list.json.result.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_get'])
    const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'weibo' } } })
    expect(call.status).toBe(200)
    expect((call.json.result.content[0] as { text: string }).text).toContain('# 站点知识卡:weibo')
  })

  it('无 token / 错 token → 401(门在解析 body 之前)', async () => {
    const noAuth = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(noAuth.status).toBe(401)
    const wrong = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(wrong.status).toBe(401)
    const garbage = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic dXNlcjpwYXNz' }, body: '{}' })
    expect(garbage.status).toBe(401)
  })

  it('白名单:GET 405(不开假 SSE);错路径 404;非 JSON Content-Type 415', async () => {
    expect((await fetch(BASE, { headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(405)
    const wrongPath = await fetch(`${BASE}/other`, { method: 'POST', headers: AUTHED, body: '{}' })
    expect(wrongPath.status).toBe(404)
    const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${TOKEN}` }, body: '{}' })
    expect(res.status).toBe(415)
  })

  it('坏 JSON → -32700(id null);批:请求+通知混合只回请求;纯通知 → 202 无体', async () => {
    const bad = await rpc('{not json')
    expect(bad.status).toBe(400)
    expect(bad.json.error.code).toBe(-32700)
    expect(bad.json.id).toBeNull()
    const mixed = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ])
    expect(Array.isArray(mixed.json)).toBe(true)
    expect(mixed.json.length).toBe(1)
    const notifyOnly = await rpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }])
    expect(notifyOnly.status).toBe(202)
    expect(notifyOnly.json).toBeNull()
  })

  it('告知文件:端口/token/url 落盘供消费者取;stop() 删文件+端口释放', async () => {
    const authRaw = await readFile(join(TMP, 'auth.json'), 'utf8')
    const auth = JSON.parse(authRaw) as { url: string; port: number; token: string; tokenSource: string }
    expect(auth.url).toBe(BASE)
    expect(auth.port).toBe(started.handle.port)
    expect(auth.token).toBe(TOKEN)
    expect(auth.tokenSource).toBe('env') // 显式 opts.token 视同 env 提供态
    await started.handle.stop()
    handles.length = 0
    await expect(readFile(join(TMP, 'auth.json'), 'utf8')).rejects.toThrow()
    await expect(fetch(BASE, { method: 'POST', headers: AUTHED, body: '{}' })).rejects.toThrow()
  })
})

describe('启动容错:端口冲突不抛不炸', () => {
  it('同端口二次启动 → { ok:false, error 含端口 };先启动实例继续服务', async () => {
    // 固定端口占用:先起一个再抢同一个
    const first = await startMcpSelfhost({ port: 0, token: TOKEN, authFile: join(TMP, 'conflict-a.json') })
    if (!first.ok) throw new Error(first.error)
    handles.push(first.handle)
    const port = first.handle.port
    const second = await startMcpSelfhost({ port, token: TOKEN, authFile: join(TMP, 'conflict-b.json') })
    expect(second.ok).toBe(false)
    if (second.ok === false) {
      expect(second.error).toContain(String(port))
      // 冲突的告知文件不落盘(失败的启动不留假端口的token文件)
      await expect(readFile(join(TMP, 'conflict-b.json'), 'utf8')).rejects.toThrow()
    }
    // 先启动实例不受影响:token 门与 tools/list 照常
    const res = await fetch(first.handle.url, { method: 'POST', headers: AUTHED, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(res.status).toBe(200)
    const j = await res.json() as { result: { tools: unknown[] } }
    expect(j.result.tools.length).toBe(2)
    await first.handle.stop()
    handles.length = 0
  })

  it('重复 start 不碰默认端口:env 未设时 mcpPort() 落 19831 常量(读取函数冒烟)', async () => {
    // mcpPort/mcpTokenFromEnv 的 env 覆盖语义(不真起 19831,只验解析)
    const { mcpPort, mcpTokenFromEnv, mcpAuthFile } = await import('../src/mcp-selfhost.ts')
    const prevPort = process.env.DSH_OPENCLI_MCP_PORT
    const prevToken = process.env.DSH_OPENCLI_MCP_TOKEN
    try {
      delete process.env.DSH_OPENCLI_MCP_PORT
      delete process.env.DSH_OPENCLI_MCP_TOKEN
      expect(mcpPort()).toBe(19831)
      expect(mcpTokenFromEnv()).toBeUndefined()
      process.env.DSH_OPENCLI_MCP_PORT = 'not-a-port'
      expect(mcpPort()).toBe(19831) // 非法值落默认,不抛
      process.env.DSH_OPENCLI_MCP_PORT = '29999'
      expect(mcpPort()).toBe(29999)
      process.env.DSH_OPENCLI_MCP_TOKEN = ''
      expect(mcpTokenFromEnv()).toBeUndefined() // 空串视为未设
      process.env.DSH_OPENCLI_MCP_TOKEN = 't'
      expect(mcpTokenFromEnv()).toBe('t')
      process.env.DSH_OPENCLI_MCP_AUTH_FILE = join(TMP, 'x.json')
      expect(mcpAuthFile()).toBe(join(TMP, 'x.json'))
    } finally {
      if (prevPort === undefined) delete process.env.DSH_OPENCLI_MCP_PORT; else process.env.DSH_OPENCLI_MCP_PORT = prevPort
      if (prevToken === undefined) delete process.env.DSH_OPENCLI_MCP_TOKEN; else process.env.DSH_OPENCLI_MCP_TOKEN = prevToken
      delete process.env.DSH_OPENCLI_MCP_AUTH_FILE
    }
  })
})

afterAll(async () => {
  for (const h of handles) await h.stop().catch(() => {})
  handles.length = 0
  await rm(TMP, { recursive: true, force: true }).catch(() => {})
})
