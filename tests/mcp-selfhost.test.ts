// MCP 自host Streamable-HTTP 端点单测(0.1.3 E① + 0.1.4 候选4 读面扩展 + 0.1.5 C6 ops 只读面):
// ① JSON-RPC 纯函数层——initialize/tools list/tools call 链路 + 通知/坏消息/未知方法
// ② 过滤/分页/search——knowledge_list status/domain/query/limit/cursor + 应用级 nextCursor 续页、
//    knowledge_search(站名/域名/命令名/坑文本模糊命中+档位排序,官方 memory 三件套同构)
// ③ ops 只读三工具(C6)——events_get(kind/since 过滤+有界默认 50 上限 200)/schedules_get
//    (白名单投影,不含 history 全文与旗标)/inbox_list(计数+最近摘要);只读注解+outputSchema;
//    readEventRows/readOpsState 默认读盘(env 指临时文件,vitest.config 隔离)
// ④ HTTP 集成层——token 门+WWW-Authenticate、Host/Origin 门(403)、协议版本头(400)、
//    路径/方法白名单、坏 JSON、202、413/readBody 四分支(C6 随车,复核 low#18 同车)
// ⑤ 启动容错——端口冲突返回 { ok:false } 不抛,先启动的实例继续服务;stop 删告知文件
// 真实 socket:node:http 监听 127.0.0.1 + fetch 打回环(端口全部显式指定,不碰默认 19831);
// Host/Origin 是 fetch 的 forbidden header,相关门用例走 node:http 原生请求
import { describe, expect, it, afterAll, afterEach } from 'vitest'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { handleJsonRpc, mcpCapsRaw, mcpOpsEnabled, mcpVisibleTools, knowledgeCard, knowledgeList, knowledgeListPage, knowledgeSearch, startMcpSelfhost, readBody, readEventRows, readOpsState, eventsPage, schedulesSummary, inboxSummary, MCP_PROTOCOL_VERSION, MCP_MAX_BODY_BYTES, MCP_EVENTS_MAX_LIMIT, MCP_EVENTS_PAGE_DEFAULT, MCP_INBOX_RECENT, MCP_SUMMARY_CLIP, type McpSelfhostHandle, type McpEventRow, type McpOpsState } from '../src/mcp-selfhost.ts'

const ENTRIES = [
  { site: 'weibo', name: 'hot', access: 'read', description: '微博热搜', domain: 'weibo.com' },
  { site: 'weibo', name: 'publish', access: 'write', description: '发微博' },
  { site: 'xiaohongshu', name: 'search', access: 'read', description: '搜索笔记' },
]

describe('handleJsonRpc(JSON-RPC 纯函数层,三链路)', () => {
  it('initialize:客户端版本不认识→钳回服务端支持版本(不假兼容),serverInfo/capabilities 齐全', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', clientInfo: { name: 'test' } } }, { entries: ENTRIES }) as { jsonrpc: string; id: number; result: Record<string, unknown> }
    expect(r.jsonrpc).toBe('2.0')
    expect(r.id).toBe(1)
    expect(r.result.protocolVersion).toBe('2025-06-18') // 未支持版本钳回 MCP_PROTOCOL_VERSION(复核 low:回显未实现版本=假兼容)
    const caps = r.result.capabilities as { tools: Record<string, unknown> }
    expect(caps.tools).toBeDefined()
    const info = r.result.serverInfo as { name: string; version: string }
    expect(info.name).toBe('dsh-opencli')
    expect(info.version.length).toBeGreaterThan(0)
    expect(r.result.instructions as string).toContain('knowledge_search') // 路由式文案:先 search 再 get,别全量拉
  })

  it('initialize:客户端不带版本→服务端默认版本', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 'a', method: 'initialize' }, {}) as { result: { protocolVersion: string } }
    expect(r.result.protocolVersion).toBe('2025-06-18')
  })

  it('tools/list:默认只注册 knowledge 三件套(C6「--caps 门控、默认不注册」,0.1.5 复核⑤);ops 显式开启后只读六工具,title/outputSchema/四 hint 注解齐备(2025-06-18 tools 章)', () => {
    const T = { result: { tools: Array<{ name: string; title?: string; inputSchema: { type: string; properties?: Record<string, unknown> }; outputSchema?: { type: string; required?: string[] }; annotations?: Record<string, boolean> }> } }
    // 默认(不传 opsTools):ops 三工具不进 tools/list(list 与 call 同一开关,stale tool list 防线)
    const def = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {}) as typeof T
    expect(def.result.tools.map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get'])
    // ops 显式开启:六工具全注册
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { opsTools: true }) as typeof T
    const names = r.result.tools.map((t) => t.name)
    expect(names).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get', 'events_get', 'schedules_get', 'inbox_list'])
    expect(r.result.tools.every((t) => t.inputSchema.type === 'object')).toBe(true)
    // title 与 outputSchema(spec:server MUST 保证 structuredContent 合 schema,clients SHOULD validate)
    expect(r.result.tools.every((t) => typeof t.title === 'string' && t.title.length > 0)).toBe(true)
    expect(r.result.tools.every((t) => t.outputSchema?.type === 'object')).toBe(true)
    // 四 hint 注解补全(照官方 memory 只读先例:readOnly/destructive:false/idempotent/openWorld:false)——
    // ops 三工具同为纯读(C6:全面只读,写面不经 HTTP 旁路)
    expect(r.result.tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false && t.annotations?.idempotentHint === true && t.annotations?.openWorldHint === false)).toBe(true)
    // knowledge_list 声明过滤/分页参数面(不再是空 properties),knowledge_get 的 outputSchema 照抄 structuredContent 现有形状
    const list = r.result.tools.find((t) => t.name === 'knowledge_list')!
    expect(Object.keys(list.inputSchema.properties ?? {}).sort()).toEqual(['cursor', 'domain', 'limit', 'query', 'status'])
    const get = r.result.tools.find((t) => t.name === 'knowledge_get')!
    expect(get.outputSchema?.required).toEqual(['site', 'uri', 'commandCount', 'pitfallCount'])
    // ops 三工具参数面与输出面(C6):events_get 带 kind/since/limit,其余两只无参数
    const events = r.result.tools.find((t) => t.name === 'events_get')!
    expect(Object.keys(events.inputSchema.properties ?? {}).sort()).toEqual(['kind', 'limit', 'since'])
    expect(events.outputSchema?.required).toEqual(['events', 'total'])
    const schedules = r.result.tools.find((t) => t.name === 'schedules_get')!
    expect(Object.keys(schedules.inputSchema.properties ?? {})).toEqual([])
    expect(schedules.outputSchema?.required).toEqual(['schedules', 'total'])
    const inbox = r.result.tools.find((t) => t.name === 'inbox_list')!
    expect(Object.keys(inbox.inputSchema.properties ?? {})).toEqual([])
    expect(inbox.outputSchema?.required).toEqual(['unread', 'counts', 'recent'])
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

  it('tools/call knowledge_get:目录内站出完整卡(含命令目录段),并附 resource_link(URI 与 resources 面同源)', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'Weibo' } } }, { entries: ENTRIES }) as { result: { content: Array<{ type: string; text?: string; uri?: string }>; structuredContent: Record<string, unknown> } }
    expect(r.result.structuredContent.site).toBe('weibo') // 大小写归一
    expect(r.result.content[0]!.text).toContain('# 站点知识卡:weibo')
    expect(r.result.content[0]!.text).toContain('site weibo hot')
    const link = r.result.content.find((b) => b.type === 'resource_link')
    expect(link?.uri).toBe('opencli://sites/weibo/knowledge')
  })

  it('tools/call knowledge_get:目录缺站但健康表有→降格卡(如实无命令目录);两头都无→isError', () => {
    // threads 只在健康表(unsupported):出降格卡,不编命令
    const r = knowledgeCard('threads', undefined)
    expect(r).not.toBeNull()
    expect(r!.markdown).toContain('站点健康度:未支持')
    expect(r!.card.commandCount).toBe(0)
    const rpc = handleJsonRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'threads' } } }, {}) as { result: { isError?: boolean; structuredContent: { commandCount: number }; content: Array<{ type: string; uri?: string }> } }
    expect(rpc.result.isError).toBeUndefined()
    expect(rpc.result.structuredContent.commandCount).toBe(0)
    // 降格卡不发 resource_link:resources/read 侧无目录数据,发了就是悬空 URI
    expect(rpc.result.content.every((b) => b.type !== 'resource_link')).toBe(true)
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

// ── 过滤/分页/search(候选4:消灭无参 154KB 全量默认;协议分页语义落在工具参数层) ──

describe('knowledge_list 过滤/分页', () => {
  it('status 过滤:ok=健康表无记录(默认正常);degraded/notice 只出对应行;非法值 isError 不静默当不过滤', () => {
    const ok = knowledgeListPage(ENTRIES, { status: 'ok' })
    expect(ok.sites.length).toBeGreaterThan(0)
    expect(ok.sites.every((s) => s.health === undefined)).toBe(true)
    expect(ok.total).toBe(ok.sites.length) // 无 limit 截断时 total=返回数
    const degraded = knowledgeListPage(ENTRIES, { status: 'degraded' })
    expect(degraded.sites.map((s) => s.site)).toEqual(['instagram']) // 健康表实况:instagram=degraded
    const notice = knowledgeListPage(ENTRIES, { status: 'notice' })
    expect(notice.sites.map((s) => s.site)).toContain('xiaohongshu')
    expect(notice.sites.every((s) => s.health?.status === 'notice')).toBe(true)
    const bad = handleJsonRpc({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'knowledge_list', arguments: { status: 'healthy' } } }, { entries: ENTRIES }) as { result: { isError: boolean } }
    expect(bad.result.isError).toBe(true)
  })

  it('domain 过滤:大小写不敏感精确匹配;目录外站(无 domain)不命中;query 过滤与 search 同语义', () => {
    expect(knowledgeListPage(ENTRIES, { domain: 'weibo.com' }).sites.map((s) => s.site)).toEqual(['weibo'])
    expect(knowledgeListPage(ENTRIES, { domain: 'Weibo.COM' }).sites.map((s) => s.site)).toEqual(['weibo'])
    expect(knowledgeListPage(ENTRIES, { domain: 'no-such-domain.example' }).total).toBe(0)
    expect(knowledgeListPage(ENTRIES, { query: 'xsec' }).sites.map((s) => s.site)).toEqual(['xiaohongshu']) // 坑文本关键词
  })

  it('分页:默认页=全量(数据<50);limit 截页+nextCursor 续页不重不漏、末页省略;游标换过滤/垃圾游标 → -32602', () => {
    const all = knowledgeList(ENTRIES).map((s) => s.site)
    expect(all.length).toBeGreaterThan(4) // 前提:环境全集(目录∪健康表∪坑表)足够翻页
    const def = knowledgeListPage(ENTRIES, {})
    expect(def.sites.length).toBe(Math.min(all.length, 50)) // 默认页 50:更大目录上不再无参全量拉
    const p1 = knowledgeListPage(ENTRIES, { limit: 2 })
    expect(p1.sites.length).toBe(2)
    expect(p1.total).toBe(all.length)
    expect(typeof p1.nextCursor).toBe('string')
    const seen: string[] = p1.sites.map((s) => s.site)
    let cursor: string | undefined = p1.nextCursor
    while (cursor !== undefined) {
      const page = knowledgeListPage(ENTRIES, { limit: 2, cursor })
      seen.push(...page.sites.map((s) => s.site))
      cursor = page.nextCursor
    }
    expect(seen).toEqual(all) // 行序稳定(站名字母序):逐页拼回与全量逐行一致,末页无 nextCursor(循环终止)
    // 过滤参数一变旧游标即作废(防跨过滤串页)与垃圾游标:分页章「无效 cursor SHOULD -32602」
    const stale = handleJsonRpc({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'knowledge_list', arguments: { limit: 2, cursor: knowledgeListPage(ENTRIES, { limit: 2 }).nextCursor, status: 'notice' } } }, { entries: ENTRIES }) as { error: { code: number } }
    expect(stale.error.code).toBe(-32602)
    const garbage = handleJsonRpc({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'knowledge_list', arguments: { cursor: 'not-a-real-cursor' } } }, { entries: ENTRIES }) as { error: { code: number } }
    expect(garbage.error.code).toBe(-32602)
  })

  it('limit 越界/非整数 → isError(显式报错,不静默截断)', () => {
    for (const bad of [0, -1, 501, 1.5, 'ten']) {
      const r = handleJsonRpc({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'knowledge_list', arguments: { limit: bad } } }, { entries: ENTRIES }) as { result: { isError: boolean } }
      expect(r.result.isError).toBe(true)
    }
  })
})

describe('knowledge_search 第三工具(官方 memory 三件套同构:全量读/检索/按名取)', () => {
  it('四路命中:站名/域名/命令名/坑文本;大小写不敏感;无命中如实空(不报错不编造)', () => {
    expect(knowledgeSearch(ENTRIES, 'weibo', 10).sites[0]!.site).toBe('weibo')
    expect(knowledgeSearch(ENTRIES, 'weibo.com', 10).sites.map((s) => s.site)).toContain('weibo') // 域名命中
    expect(knowledgeSearch(ENTRIES, 'hot', 10).sites.map((s) => s.site)).toContain('weibo') // 命令名命中
    expect(knowledgeSearch(ENTRIES, 'xsec', 10).sites.map((s) => s.site)).toEqual(['xiaohongshu']) // 坑文本命中
    expect(knowledgeSearch(ENTRIES, 'WEIBO', 10).sites[0]!.site).toBe('weibo') // 大小写不敏感
    const none = knowledgeSearch(ENTRIES, 'no-such-keyword-zzz', 10)
    expect(none.sites).toEqual([])
    expect(none.total).toBe(0)
  })

  it('档位排序:站名命中(rank 0)排命令命中(rank 2)前;limit 截断但 total 如实', () => {
    const mixed = knowledgeSearch(ENTRIES, 's', 10) // threads 站名含 s(rank 0);weibo 仅命令 publish 含 s(rank 2)
    const idx = (site: string) => mixed.sites.findIndex((x) => x.site === site)
    expect(idx('threads')).toBeGreaterThanOrEqual(0)
    expect(idx('threads')).toBeLessThan(idx('weibo'))
    const capped = knowledgeSearch(ENTRIES, 's', 1)
    expect(capped.sites.length).toBe(1)
    expect(capped.total).toBe(mixed.total)
  })

  it('tools/call knowledge_search:query 缺失/空白 → isError;limit 越界 → isError;命中走 RPC 全链', () => {
    const ok = handleJsonRpc({ jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'weibo' } } }, { entries: ENTRIES }) as { result: { structuredContent: { sites: Array<{ site: string }>; total: number }; isError?: boolean } }
    expect(ok.result.isError).toBeUndefined()
    expect(ok.result.structuredContent.sites[0]!.site).toBe('weibo')
    expect(ok.result.structuredContent.total).toBeGreaterThan(0)
    const noq = handleJsonRpc({ jsonrpc: '2.0', id: 26, method: 'tools/call', params: { name: 'knowledge_search', arguments: {} } }, {}) as { result: { isError: boolean } }
    expect(noq.result.isError).toBe(true)
    const blank = handleJsonRpc({ jsonrpc: '2.0', id: 27, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: '   ' } } }, {}) as { result: { isError: boolean } }
    expect(blank.result.isError).toBe(true)
    const badLimit = handleJsonRpc({ jsonrpc: '2.0', id: 28, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'weibo', limit: 9999 } } }, {}) as { result: { isError: boolean } }
    expect(badLimit.result.isError).toBe(true)
  })
})

// ── ops 只读三工具(C6,0.1.5):events_get / schedules_get / inbox_list ─────────
// 数据全部经 deps 注入(不读真实 ~/.dsh;默认读盘路径由 vitest.config env 指到临时文件,
// 缺路径=空表,纯函数层单测与默认读盘互不干扰)

const OPS_EVENTS: McpEventRow[] = [
  { at: '2026-11-16T23:13:22.000Z', kind: 'circuit-attribution', text: '系统面故障——canary 仅通过 6/20' },
  { at: '2026-11-16T07:01:00.000Z', kind: 'daemon-flip', text: '2.0.3→1.8.6,已自动重启 daemon' },
  { at: '2026-11-15T23:09:00.000Z', kind: 'schedule-failed', text: 'v2ex hot 失败:fetch failed' },
  { at: '2026-11-14T00:00:00.000Z', kind: 'digest', text: '早报生成:0 成功 · 3 失败' },
]

const OPS_STATE: McpOpsState = {
  schedules: [
    // 行带任务级旗标(watch/notify/profile/quietHours/backoffMs):投影必须全部剥掉
    { id: 'sched-v2ex', site: 'v2ex hot', cron: '0 7 * * *', enabled: true, createdAt: '2026-11-01T00:00:00Z', source: 'manual', lastRunAt: '2026-11-16T23:00:00Z', watch: 'TOPSECRET-WATCH-KEYWORD', notify: true, profile: 'TOPSECRET-PROFILE-ALIAS', quietHours: '01:00-07:00', backoffMs: 15000 },
    { id: 'sched-zhihu', site: 'zhihu watch:"AI"', cron: '30 8 * * *', enabled: false },
  ],
  runHistory: {
    'sched-v2ex': [
      { at: '2026-11-16T23:00:05Z', ok: false, summary: '#2/2 失败:fetch failed(TOPSECRET-HISTORY-TEXT 不应经 schedules_get 外泄)' },
      { at: '2026-11-15T23:00:05Z', ok: true, summary: 'OK', receipt: { auth_state: 'ok', bytes: 100, empty: true } },
    ],
    'sched-zhihu': [
      { at: '2026-11-14T08:30:00Z', ok: true, summary: '⏸ 跳过:浏览器扩展未连接', skip: true },
      { at: '2026-11-13T08:30:00Z', ok: true, summary: `OK ${'x'.repeat(200)}`, receipt: { auth_state: 'ok', bytes: 500, items: 20 } },
    ],
  },
  inboxFlags: {
    'sched-v2ex|2026-11-15T23:00:05Z': { read: true, archived: true, by: 'auto' },
    'sched-zhihu|2026-11-14T08:30:00Z': { read: true },
  },
}

describe('events_get(C6 ①:events-get RPC 只读投影,有界+kind/since 过滤)', () => {
  it('eventsPage 纯函数:保持最新在前;kind 精确匹配;since 含端点过滤;组合过滤;无命中如实空', () => {
    expect(eventsPage(OPS_EVENTS, {}).events.map((e) => e.kind)).toEqual(['circuit-attribution', 'daemon-flip', 'schedule-failed', 'digest'])
    expect(eventsPage(OPS_EVENTS, { kind: 'digest' }).events.map((e) => e.at)).toEqual(['2026-11-14T00:00:00.000Z'])
    expect(eventsPage(OPS_EVENTS, { kind: 'DIGEST' }).total).toBe(0) // 精确匹配,不做大小写归一(枚举以台账为准)
    const since = eventsPage(OPS_EVENTS, { since: '2026-11-16T00:00:00Z' })
    expect(since.events.map((e) => e.kind)).toEqual(['circuit-attribution', 'daemon-flip']) // 含端点:07:01 ≥ 00:00
    expect(since.total).toBe(2)
    const combo = eventsPage(OPS_EVENTS, { since: '2026-11-15T00:00:00Z', kind: 'schedule-failed' })
    expect(combo.events.length).toBe(1)
    const none = eventsPage(OPS_EVENTS, { since: '2027-01-01T00:00:00Z' })
    expect(none.events).toEqual([])
    expect(none.total).toBe(0)
  })

  it('有界:缺省 50 条(60 行只出前 50),total 如实 60;显式上限 200 收口(工具层拦 201+)', () => {
    const rows: McpEventRow[] = Array.from({ length: 60 }, (_, i) => ({ at: `2026-11-16T23:${String(59 - i).padStart(2, '0')}:00Z`, kind: 'inbox', text: `e${i}` }))
    expect(MCP_EVENTS_PAGE_DEFAULT).toBe(50)
    const def = eventsPage(rows, {})
    expect(def.events.length).toBe(50)
    expect(def.total).toBe(60)
    expect(def.events[0]!.text).toBe('e0') // 截前 50=最新 50(输入已最新在前)
    expect(MCP_EVENTS_MAX_LIMIT).toBe(200)
    expect(eventsPage(rows, { limit: 200 }).events.length).toBe(60)
    // 工具层越界拦截:0/201/非整数 → isError(显式报错,不静默截断)
    for (const bad of [0, -1, 201, 1.5, 'ten']) {
      const r = handleJsonRpc({ jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'events_get', arguments: { limit: bad } } }, { events: OPS_EVENTS, opsTools: true }) as { result: { isError: boolean } }
      expect(r.result.isError).toBe(true)
    }
  })

  it('tools/call 链路:无参出全量+total;kind/since 过滤;since 非法 → isError;省参数=不过滤', () => {
    const all = handleJsonRpc({ jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'events_get' } }, { events: OPS_EVENTS, opsTools: true }) as { result: { isError?: boolean; structuredContent: { events: McpEventRow[]; total: number }; content: Array<{ type: string }> } }
    expect(all.result.isError).toBeUndefined()
    expect(all.result.structuredContent.total).toBe(4)
    expect(all.result.structuredContent.events.length).toBe(4)
    expect(all.result.content[0]!.type).toBe('text')
    const kind = handleJsonRpc({ jsonrpc: '2.0', id: 33, method: 'tools/call', params: { name: 'events_get', arguments: { kind: 'daemon-flip' } } }, { events: OPS_EVENTS, opsTools: true }) as { result: { structuredContent: { events: McpEventRow[]; total: number } } }
    expect(kind.result.structuredContent.total).toBe(1)
    expect(kind.result.structuredContent.events[0]!.text).toContain('daemon')
    const since = handleJsonRpc({ jsonrpc: '2.0', id: 34, method: 'tools/call', params: { name: 'events_get', arguments: { since: '2026-11-16T00:00:00Z' } } }, { events: OPS_EVENTS, opsTools: true }) as { result: { structuredContent: { total: number } } }
    expect(since.result.structuredContent.total).toBe(2)
    const bad = handleJsonRpc({ jsonrpc: '2.0', id: 35, method: 'tools/call', params: { name: 'events_get', arguments: { since: 'not-a-date' } } }, { events: OPS_EVENTS, opsTools: true }) as { result: { isError: boolean } }
    expect(bad.result.isError).toBe(true)
  })

  it('readEventRows 默认读盘:主档+轮转档 .1 合并倒序、脏行跳过、无文件=空表不是错误', async () => {
    const main = join(TMP, 'ops-events.jsonl')
    await writeFile(main, [
      JSON.stringify({ at: '2026-11-16T10:00:00Z', kind: 'inbox', text: '新档第一条' }),
      '半截 JSON{"at":',
      JSON.stringify({ at: '2026-11-16T11:00:00Z', kind: 'notify', text: '新档第二条' }),
      JSON.stringify({ at: 123, kind: 'notify', text: '形状不对的行' }),
      '',
    ].join('\n'), 'utf8')
    await writeFile(`${main}.1`, [
      JSON.stringify({ at: '2026-11-15T08:00:00Z', kind: 'digest', text: '旧档行2' }),
      JSON.stringify({ at: '2026-11-15T09:00:00Z', kind: 'digest', text: '旧档行' }),
    ].join('\n'), 'utf8') // 追加序=旧→新(真实轮转档形态)
    const rows = readEventRows(main)
    expect(rows.map((r) => r.text)).toEqual(['新档第二条', '新档第一条', '旧档行', '旧档行2']) // 新→旧,主档在轮转档前
    expect(readEventRows(join(TMP, 'no-such-events.jsonl'))).toEqual([]) // 无档=空表,不抛
    expect(readOpsState(join(TMP, 'no-such-state.json'))).toEqual({}) // state 同纪律
  })
})

describe('schedules_get(C6 ②:schedule-list 只读投影,白名单六面)', () => {
  it('schedulesSummary 纯函数:只出 id/site/cron/enabled/source/lastRunAt/last;旗标与 history 全文剥净;last 四态 typed', () => {
    const r = schedulesSummary(OPS_STATE)
    expect(r.total).toBe(2)
    const v2ex = r.schedules.find((s) => s.id === 'sched-v2ex')!
    expect(Object.keys(v2ex).sort()).toEqual(['cron', 'enabled', 'id', 'last', 'lastRunAt', 'site', 'source']) // 白名单,不多不少
    expect(v2ex.cron).toBe('0 7 * * *')
    expect(v2ex.enabled).toBe(true)
    expect(v2ex.source).toBe('manual')
    expect(v2ex.last).toEqual({ at: '2026-11-16T23:00:05Z', status: 'fail' }) // 最近一次=ok:false → fail
    const zhihu = r.schedules.find((s) => s.id === 'sched-zhihu')!
    expect(Object.keys(zhihu).sort()).toEqual(['cron', 'enabled', 'id', 'last', 'site']) // 无 source/lastRunAt:省键不占位
    expect(zhihu.enabled).toBe(false)
    expect(zhihu.last).toEqual({ at: '2026-11-14T08:30:00Z', status: 'skip' }) // skip 行 typed 判定,不解析 summary
    const whole = JSON.stringify(r)
    // 任务级旗标不外显(哨兵值断言:site 展示文本合法含「watch:」字样,不能裸查子串)
    expect(whole).not.toContain('TOPSECRET')
    expect(whole).not.toContain('TOPSECRET-HISTORY-TEXT') // history 全文不外显
    expect(whole).not.toContain('receipt')
  })

  it('tools/call 链路:出全量清单;空 state=空表不是错误;坏行跳过不抛', () => {
    const rpc = handleJsonRpc({ jsonrpc: '2.0', id: 36, method: 'tools/call', params: { name: 'schedules_get' } }, { opsState: OPS_STATE, opsTools: true }) as { result: { isError?: boolean; structuredContent: { total: number; schedules: Array<{ id: string }> } } }
    expect(rpc.result.isError).toBeUndefined()
    expect(rpc.result.structuredContent.total).toBe(2)
    expect(rpc.result.structuredContent.schedules.map((s) => s.id)).toEqual(['sched-v2ex', 'sched-zhihu'])
    const empty = schedulesSummary({})
    expect(empty.schedules).toEqual([])
    expect(empty.total).toBe(0)
    const dirty = schedulesSummary({ schedules: [null, 'x', { id: 'half' }, { id: 'ok', site: 's', cron: '* * * * *', enabled: true }] as unknown[] })
    expect(dirty.total).toBe(1) // 三坏行跳过,合法行照常
    expect(dirty.schedules[0]!.id).toBe('ok')
  })
})

describe('inbox_list(C6 ③:收件箱只读投影,计数+最近摘要)', () => {
  it('inboxSummary 纯函数:read/archived/四态计数与未读口径;最近条目新→旧;summary 超长截断;回执/深链不外显', () => {
    const r = inboxSummary(OPS_STATE)
    expect(r.counts.total).toBe(4) // v2ex 2 run + zhihu 2 run(重试链无前缀各行独立)
    expect(r.counts.read).toBe(2)
    expect(r.counts.archived).toBe(1)
    expect(r.counts.status).toEqual({ ok: 1, fail: 1, skip: 1, empty: 1 })
    expect(r.unread).toBe(2) // 未读且未归档:v2ex 失败行 + zhihu OK 行(已读不计,归档不计)
    expect(r.recent.map((e) => [e.task, e.status])).toEqual([
      ['sched-v2ex', 'fail'],
      ['sched-v2ex', 'empty'],
      ['sched-zhihu', 'skip'],
      ['sched-zhihu', 'ok'],
    ])
    const archived = r.recent[1]!
    expect(archived.archived).toBe(true)
    expect(archived.archivedBy).toBe('auto') // 无产出自动归档来源如实
    expect(archived).not.toHaveProperty('receipt') // 回执全文不外显
    expect(archived).not.toHaveProperty('traceDate')
    const clipped = r.recent[3]!.summary
    expect(MCP_SUMMARY_CLIP).toBe(160) // 截断常量与下一行的 161 同源(改常量即此处先红)
    expect(clipped.length).toBe(161) // MCP_SUMMARY_CLIP=160 + 省略号:「不含正文全文」的落点
    expect(clipped.endsWith('…')).toBe(true)
  })

  it('tools/call 链路:计数+摘要走 RPC;空 state=零计数空摘要;MCP_INBOX_RECENT 有界', () => {
    const rpc = handleJsonRpc({ jsonrpc: '2.0', id: 37, method: 'tools/call', params: { name: 'inbox_list' } }, { opsState: OPS_STATE, opsTools: true }) as { result: { isError?: boolean; structuredContent: { unread: number; counts: { total: number }; recent: unknown[] } } }
    expect(rpc.result.isError).toBeUndefined()
    expect(rpc.result.structuredContent.unread).toBe(2)
    expect(rpc.result.structuredContent.counts.total).toBe(4)
    const empty = inboxSummary({})
    expect(empty.counts.total).toBe(0)
    expect(empty.unread).toBe(0)
    expect(empty.recent).toEqual([])
    expect(empty.counts.status).toEqual({ ok: 0, fail: 0, skip: 0, empty: 0 })
    expect(MCP_INBOX_RECENT).toBe(20) // 摘要窗口常量如实钉住(防顺手改大变成全量流水)
  })

  it('写面工具仍不存在:schedule_add 即便在 C6 之后也回 -32602(HTTP 旁路没有写面)', () => {
    const r = handleJsonRpc({ jsonrpc: '2.0', id: 38, method: 'tools/call', params: { name: 'schedule_add', arguments: {} } }, { opsState: OPS_STATE }) as { error: { code: number } }
    expect(r.error.code).toBe(-32602)
  })
})

describe('ops 面门控(C6「--caps 门控、默认不注册」,0.1.5 复核⑤:mcpCapsRaw/mcpOpsEnabled/mcpVisibleTools)', () => {
  const origCaps = process.env.DSH_OPENCLI_MCP_CAPS
  const setCaps = (v: string | undefined): void => {
    if (v === undefined) delete process.env.DSH_OPENCLI_MCP_CAPS
    else process.env.DSH_OPENCLI_MCP_CAPS = v
  }
  afterEach(() => { setCaps(origCaps) })

  it('默认(env 未设/空串)= 不开 ops:mcpVisibleTools(false) 只出 knowledge 三件套', () => {
    setCaps(undefined)
    expect(mcpCapsRaw()).toEqual([])
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(false)
    expect(mcpVisibleTools(false).map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get'])
    setCaps('  ')
    expect(mcpCapsRaw()).toEqual([])
  })

  it('显式 caps:ops 开 ops 面;all 等价;大小写/空格容忍;未知值白名单外忽略(不猜测)', () => {
    setCaps('ops')
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(true)
    expect(mcpVisibleTools(true).map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get', 'events_get', 'schedules_get', 'inbox_list'])
    setCaps(' ALL ')
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(true)
    setCaps('knowledge, ops')
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(true)
    setCaps('OPS')
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(true)
    setCaps('knowledge,writing,admin')
    expect(mcpOpsEnabled(mcpCapsRaw())).toBe(false) // 白名单外值不开任何面(闭集,未知值忽略)
    // handleJsonRpc 面门控与 caps 解析一致:deps.opsTools 缺省/false=list 不出 ops 工具
    const listDef = handleJsonRpc({ jsonrpc: '2.0', id: 30, method: 'tools/list' }, {}) as { result: { tools: Array<{ name: string }> } }
    expect(listDef.result.tools.some((t) => t.name === 'events_get')).toBe(false)
    const gated = handleJsonRpc({ jsonrpc: '2.0', id: 39, method: 'tools/call', params: { name: 'inbox_list', arguments: {} } }, { opsState: OPS_STATE }) as { result: { isError: boolean; content: Array<{ text: string }> } }
    expect(gated.result.isError).toBe(true)
    expect(gated.result.content[0]!.text).toContain('未注册')
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
  it('initialize:200 + serverInfo(默认面 instructions 不预告 ops 工具);tools/list:默认三工具(C6 默认不注册,0.1.5 复核⑤);tools/call:出卡;ops 工具如实报未注册', async () => {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(init.status).toBe(200)
    expect((init.json.result.serverInfo as { name: string }).name).toBe('dsh-opencli')
    const instr = init.json.result.instructions as string
    expect(instr).toContain('knowledge_search')
    expect(instr).not.toContain('events_get') // 默认面不预告未注册工具(stale tool list 防线,#13396)
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((list.json.result.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get'])
    const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'weibo' } } })
    expect(call.status).toBe(200)
    expect((call.json.result.content[0] as { text: string }).text).toContain('# 站点知识卡:weibo')
    // ops 三工具未开 caps:tools/call 如实报「未注册」并给开法指引(工具结果层 isError,协议层 200)
    const gated = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'events_get', arguments: {} } })
    expect(gated.status).toBe(200)
    expect(gated.json.result.isError).toBe(true)
    expect(gated.json.result.content[0].text as string).toContain('DSH_OPENCLI_MCP_CAPS')
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
    expect(auth.tokenSource).toBe('explicit') // 显式 opts.token 如实标 explicit(与 env 提供态区分,复核 low)
    await started.handle.stop()
    handles.length = 0
    await expect(readFile(join(TMP, 'auth.json'), 'utf8')).rejects.toThrow()
    await expect(fetch(BASE, { method: 'POST', headers: AUTHED, body: '{}' })).rejects.toThrow()
  })
})

// ── HTTP 传输安全门(候选4⑥⑦⑧;独立实例:上一组用例末尾已停掉共享实例) ──────
const TOKEN2 = 'test-token-0123456789abcdef'
const started2 = await startMcpSelfhost({ port: 0, token: TOKEN2, authFile: join(TMP, 'auth-sec.json'), entriesProvider: () => ENTRIES })
if (!started2.ok) throw new Error(started2.error)
handles.push(started2.handle)
const BASE2 = started2.handle.url
const PORT2 = started2.handle.port

const rpc2 = async (body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> => {
  const res = await fetch(BASE2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN2}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text.length > 0 ? JSON.parse(text) : null }
}

/** 原生 POST 助手:Host/Origin 是 fetch 的 forbidden header,门用例走 node:http 原生请求直发头。 */
const rawPost = (headers: Record<string, string>, body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })): Promise<{ status: number; json: any }> =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: PORT2, path: '/mcp', method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode ?? 0, json: text.length > 0 ? JSON.parse(text) : null })
      })
    })
    req.on('error', reject)
    req.end(body)
  })

describe('HTTP 层:传输安全门(WWW-Authenticate/Host/Origin/协议版本头)', () => {
  const AUTHED2 = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN2}` }

  it('401 附 WWW-Authenticate: Bearer error="invalid_token"(RFC 6750,SDK bearerAuth 同款 challenge)', async () => {
    const res = await fetch(BASE2, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
  })

  it('Host 白名单:127.0.0.1/localhost 放行,外来域名与重绑定式后缀伪装 403(DNS rebinding MUST 门)', async () => {
    expect((await rawPost({ Host: `127.0.0.1:${PORT2}`, ...AUTHED2 })).status).toBe(200)
    expect((await rawPost({ Host: `localhost:${PORT2}`, ...AUTHED2 })).status).toBe(200)
    expect((await rawPost({ Host: 'evil.example', ...AUTHED2 })).status).toBe(403)
    // 后缀伪装(127.0.0.1.evil.example)不是白名单精确匹配
    expect((await rawPost({ Host: '127.0.0.1.evil.example', ...AUTHED2 })).status).toBe(403)
  })

  it('Origin 门:同源放行;跨源 403;localhost↔127.0.0.1 按浏览器语义互为不同源;不发 Origin 缺省放行(非浏览器客户端)', async () => {
    expect((await rawPost({ Host: `127.0.0.1:${PORT2}`, Origin: `http://127.0.0.1:${PORT2}`, ...AUTHED2 })).status).toBe(200)
    expect((await rawPost({ Host: `127.0.0.1:${PORT2}`, Origin: 'http://evil.example', ...AUTHED2 })).status).toBe(403)
    expect((await rawPost({ Host: `127.0.0.1:${PORT2}`, Origin: `http://localhost:${PORT2}`, ...AUTHED2 })).status).toBe(403)
    expect((await rawPost({ Host: `127.0.0.1:${PORT2}`, ...AUTHED2 })).status).toBe(200)
  })

  it('MCP-Protocol-Version 头:不认识的版 → 400(lifecycle MUST);协商版/缺省放行;initialize 握手不验头', async () => {
    const bad = await rpc2({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'MCP-Protocol-Version': '1999-01-01' })
    expect(bad.status).toBe(400)
    expect(bad.json.error.code).toBe(-32600)
    expect((await rpc2({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION })).status).toBe(200)
    expect((await rpc2({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).status).toBe(200) // 缺头 → 按 init 协商版处理
    const handshake = await rpc2({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION } }, { 'MCP-Protocol-Version': '1999-01-01' })
    expect(handshake.status).toBe(200) // initialize 自身不验:版本协商在 params 走钳回
  })

  it('HTTP 全链:status 过滤+total/nextCursor 形状;search 命中(degraded 实况=instagram)', async () => {
    const degraded = await rpc2({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'knowledge_list', arguments: { status: 'degraded' } } })
    expect(degraded.status).toBe(200)
    const dsc = degraded.json.result.structuredContent as { sites: Array<{ site: string; health?: { status: string } }>; total: number }
    expect(dsc.sites.map((s) => s.site)).toEqual(['instagram'])
    expect(dsc.total).toBe(1)
    const paged = await rpc2({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'knowledge_list', arguments: { status: 'ok', limit: 1 } } })
    const psc = paged.json.result.structuredContent as { sites: unknown[]; total: number; nextCursor?: string }
    expect(psc.sites.length).toBe(1)
    expect(psc.total).toBeGreaterThan(1)
    expect(typeof psc.nextCursor).toBe('string') // 命中未出完必给游标
    const search = await rpc2({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'weibo' } } })
    expect(search.status).toBe(200)
    const ssc = search.json.result.structuredContent as { sites: Array<{ site: string }>; total: number }
    expect(ssc.sites[0]!.site).toBe('weibo')
    expect(ssc.total).toBe(1)
  })

  // 本组实例显式收尾:前一组用例的 handles.length = 0 会把本实例句柄一并清出数组,
  // 全局 afterAll 就够不着它了——不停会漏一个监听 socket 到进程退出
  afterAll(async () => {
    await started2.handle.stop().catch(() => {})
  })
})

// ── C6 ops 三工具 HTTP 全链 + 413/readBody 覆盖(C6 随车,复核 low#18 点名的未测分支) ──
// 独立实例:ops 数据经 provider 注入(前两组实例已停,组内自带 afterAll 收尾,理由同上组注释)
const started3 = await startMcpSelfhost({
  port: 0,
  token: TOKEN,
  authFile: join(TMP, 'auth-ops.json'),
  entriesProvider: () => ENTRIES,
  eventsProvider: () => OPS_EVENTS,
  stateProvider: () => OPS_STATE,
  opsTools: true, // ops 显式开启(C6「--caps 门控、默认不注册」;opts 显式优先于 env,测试锁全工具面)
})
if (!started3.ok) throw new Error(started3.error)
handles.push(started3.handle)
const BASE3 = started3.handle.url

const rpc3 = async (body: unknown): Promise<{ status: number; json: any }> => {
  const res = await fetch(BASE3, { method: 'POST', headers: AUTHED, body: JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, json: text.length > 0 ? JSON.parse(text) : null }
}

describe('HTTP 层:C6 ops 三工具全链(注入态 provider)', () => {
  it('ops 开启面:tools/list 六工具 + handle.tools 同源;events_get 全链:structuredContent 出台账+total;limit 200 收口照常', async () => {
    expect(started3.handle.tools.map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get', 'events_get', 'schedules_get', 'inbox_list'])
    const list6 = await rpc3({ jsonrpc: '2.0', id: 40, method: 'tools/list' })
    expect((list6.json.result.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(['knowledge_list', 'knowledge_search', 'knowledge_get', 'events_get', 'schedules_get', 'inbox_list'])
    const all = await rpc3({ jsonrpc: '2.0', id: 41, method: 'tools/call', params: { name: 'events_get', arguments: {} } })
    expect(all.status).toBe(200)
    const sc = all.json.result.structuredContent as { events: McpEventRow[]; total: number }
    expect(sc.total).toBe(4)
    expect(sc.events[0]!.kind).toBe('circuit-attribution')
    const capped = await rpc3({ jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'events_get', arguments: { limit: 200 } } })
    expect((capped.json.result.structuredContent as { events: unknown[] }).events.length).toBe(4)
    const over = await rpc3({ jsonrpc: '2.0', id: 43, method: 'tools/call', params: { name: 'events_get', arguments: { limit: 201 } } })
    expect(over.json.result.isError).toBe(true)
  })

  it('schedules_get / inbox_list 全链:白名单投影与计数形状照旧(与纯函数层同一事实)', async () => {
    const sched = await rpc3({ jsonrpc: '2.0', id: 44, method: 'tools/call', params: { name: 'schedules_get' } })
    expect(sched.status).toBe(200)
    const ssc = sched.json.result.structuredContent as { total: number; schedules: Array<{ id: string; last?: { status: string } }> }
    expect(ssc.total).toBe(2)
    expect(ssc.schedules.find((s) => s.id === 'sched-v2ex')!.last?.status).toBe('fail')
    const whole = JSON.stringify(sched.json)
    expect(whole).not.toContain('TOPSECRET') // 旗标与 history 全文不外显(哨兵值,理由同纯函数层)
    const inbox = await rpc3({ jsonrpc: '2.0', id: 45, method: 'tools/call', params: { name: 'inbox_list' } })
    const isc = inbox.json.result.structuredContent as { unread: number; counts: { status: Record<string, number> }; recent: unknown[] }
    expect(isc.unread).toBe(2)
    expect(isc.counts.status).toEqual({ ok: 1, fail: 1, skip: 1, empty: 1 })
    expect(isc.recent.length).toBe(4)
  })

  it('请求体超 MCP_MAX_BODY_BYTES → 413 且服务不被灌挂:排干后下一笔小请求照常 200', async () => {
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', pad: 'x'.repeat(MCP_MAX_BODY_BYTES) })
    const res = await fetch(BASE3, { method: 'POST', headers: AUTHED, body: big })
    expect(res.status).toBe(413)
    const j = await res.json() as { error: string }
    expect(j.error).toContain('上限')
    const after = await rpc3({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) // 排干不 wedge:后续请求照常
    expect(after.status).toBe(200)
  })

  // 本组实例显式收尾:下一组的 handles.length = 0 会把本实例句柄一并清出数组(同前组注释)
  afterAll(async () => {
    await started3.handle.stop().catch(() => {})
  })
})

describe('readBody 四分支单测(桩 IncomingMessage;此前零覆盖,C6 随车补)', () => {
  /** readBody 的 IncomingMessage 桩:只实现它消费的事件面(data/end/error)+ destroy()。 */
  const fakeReq = (): IncomingMessage & { destroy(): void } => {
    const ee = new EventEmitter() as IncomingMessage & { destroy(): void }
    ;(ee as unknown as { destroy(): void }).destroy = () => { (ee as { destroyed?: boolean }).destroyed = true }
    return ee
  }
  const destroyed = (req: object): boolean => (req as { destroyed?: boolean }).destroyed === true

  it('正常拼包:两 chunk 原样拼接', async () => {
    const req = fakeReq()
    const p = readBody(req, 16)
    req.emit('data', Buffer.from('hello '))
    req.emit('data', Buffer.from('world'))
    req.emit('end')
    await expect(p).resolves.toBe('hello world')
    expect(destroyed(req)).toBe(false)
  })

  it('超限排干:继续收但丢弃,直到 end 回 null、不 destroy——413 响应能到客户端的关键', async () => {
    const req = fakeReq()
    const p = readBody(req, 16)
    req.emit('data', Buffer.alloc(7))
    req.emit('data', Buffer.alloc(7))
    req.emit('data', Buffer.alloc(7))
    req.emit('end')
    await expect(p).resolves.toBeNull()
    expect(destroyed(req)).toBe(false)
  })

  it('8MB 硬顶:溢出态下再收任意 chunk 超 limit+8MB → 立即 null+destroy 掐线保进程(不等 end)', async () => {
    const req = fakeReq()
    const p = readBody(req, 16)
    req.emit('data', Buffer.alloc(16 + 8 * 1024 * 1024 + 1)) // 首个 chunk 只置溢出(硬顶检查在溢出分支)
    req.emit('data', Buffer.alloc(1)) // 第二个 chunk 触发硬顶:resolve+destroy
    await expect(p).resolves.toBeNull()
    expect(destroyed(req)).toBe(true)
  })

  it('传输错误:error 事件回 null(调用方同走 413 体积门分支)', async () => {
    const req = fakeReq()
    const p = readBody(req, 16)
    req.emit('error', new Error('aborted'))
    await expect(p).resolves.toBeNull()
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
    // 先启动实例不受影响:token 门与 tools/list 照常(默认面=knowledge 三件套,C6 默认不注册)
    const res = await fetch(first.handle.url, { method: 'POST', headers: AUTHED, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(res.status).toBe(200)
    const j = await res.json() as { result: { tools: unknown[] } }
    expect(j.result.tools.length).toBe(3)
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
