/**
 * MCP 自host Streamable-HTTP 端点(0.1.3 E①,§七#11):插件进程内 HTTP server,
 * 外部 MCP 消费者(IDE/桌面助手/任意 MCP client)直连知识卡读侧——
 * 不占宿主会话、不经模型工具中转。与 registerKnowledgeResources(宿主内 resources)
 * 和 knowledge-get RPC(面板)同数据源,是知识卡的第三个分发面。
 *
 * 端口面与生命周期先例(§10.5 E①「inbox.ts 同款」的实际落点):
 *  - inbox.ts 本身是文件收件箱,无端口;可复用的是它的**配置面纪律**(env 覆盖、
 *    白名单闭集、尺寸上限)与 index.ts 收件箱/调度计时器的**生命周期纪律**
 *    (随 Service.init 启动、ctx.effect 收走句柄、VITEST 里不自动起);
 *  - 本机监听面照 daemon 直连先例(direct.ts):绑 127.0.0.1,不绑 0.0.0.0。
 *
 * token 安全面(照 daemon X-OpenCLI 门思路,direct.ts:5 的头检查先例):
 *  - 每个请求必须带 Authorization: Bearer <token>,缺/错一律 401,常数时间比较;
 *  - token 来源:env DSH_OPENCLI_MCP_TOKEN > 启动时 crypto 生成;
 *  - 解析结果写 ~/.dsh/opencli-mcp-auth.json(端口+token,POSIX 0600)告知本机
 *    消费者,停机即删——文件权限即边界,与收件箱同一思路。
 *
 * 协议面(2025-06-18 Streamable-HTTP 的最小子集,如实降格不冒充全量):
 *  - POST /mcp 单端点,JSON-RPC 2.0:initialize / tools/list / tools/call / ping;
 *  - 只回 application/json,不开 SSE(GET/DELETE 405,规范允许)——无服务端推送
 *    需求的读侧够用;会话无状态(不签发 Mcp-Session-Id),每请求独立处理;
 *  - 端口冲突容错:EADDRINUSE 等启动失败不抛不炸,返回 { ok:false },插件主体照常。
 *
 * 工具面(只读收敛,不自造写面——写操作必须走审批门,HTTP 旁路不得绕开):
 *  - knowledge_list / knowledge_get,数据源=knowledge.ts 现有读侧(health/pitfalls),
 *    目录缓存可选注入出完整知识卡;两工具都是纯读,无任何状态变更。
 * @module dsh-opencli/mcp-selfhost
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { buildKnowledge, healthOf, renderKnowledgeMarkdown, SITE_HEALTH, PITFALLS, SITE_HEALTH_STATUS_LABELS, knowledgeResourceUri, type RawEntry, type SiteKnowledge } from './knowledge.ts'
import { PLUGIN_VERSION } from './version.ts'

/** 默认端口(19825 是 daemon,19831 是本端点;冲突由启动容错兜住,可用 env 换)。 */
export const MCP_DEFAULT_PORT = 19831
/** 单端点路径(白名单闭集:其余路径一律 404,收件箱同款纪律)。 */
export const MCP_ENDPOINT_PATH = '/mcp'
/** 请求体上限(MCP 消息远用不满;防灌爆照收件箱 16KB 纪律的放宽版)。 */
export const MCP_MAX_BODY_BYTES = 1024 * 1024
/** 服务端声明的协议版本(客户端带版本则原样回显——本实现是版本无关的 JSON-RPC 子集)。 */
export const MCP_PROTOCOL_VERSION = '2025-06-18'

/** 端口读取(env 覆盖先例同 DSH_OPENCLI_INBOX_DIR;非法值落默认,不抛)。 */
export function mcpPort(): number {
  const n = Number(process.env.DSH_OPENCLI_MCP_PORT)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : MCP_DEFAULT_PORT
}

/** env token(空串视为未设——env 偶发空值不该把门焊死)。 */
export function mcpTokenFromEnv(): string | undefined {
  const t = process.env.DSH_OPENCLI_MCP_TOKEN
  return t !== undefined && t.length > 0 ? t : undefined
}

/** token/端口告知文件(env 覆盖先例;测试写临时目录,绝不碰真实 ~/.dsh)。 */
export const mcpAuthFile = (): string => process.env.DSH_OPENCLI_MCP_AUTH_FILE ?? join(homedir(), '.dsh', 'opencli-mcp-auth.json')

// ── 工具面(只读两只:knowledge_list / knowledge_get) ──────────────────────

/** 目录缓存注入(index.ts 传 adapterCache.json;模块内 Array.isArray 收口,不信任形状)。 */
export interface McpToolDeps {
  entries?: RawEntry[]
}

/** 单站摘要(knowledge_list 的行;省键契约同 evidence-get:没有的东西不给空占位)。 */
export interface KnowledgeSiteSummary {
  site: string
  uri: string
  /** 目录里才有的字段(domain/命令数);健康表/坑表才有的字段(health/坑数) */
  domain?: string
  commandCount?: number
  health?: { status: string; label: string; issues: string[]; updated: string }
  pitfallCount?: number
}

const KNOWLEDGE_TOOLS = [
  {
    name: 'knowledge_list',
    description: '站点知识目录:全部已知站点一行一条——健康度(degraded/notice/unsupported)与已知坑数量。挑站点/判断某站现在能不能用先看它,别对一个 degraded 站反复重试',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'knowledge_get',
    description: '单站知识卡:结构化命令目录+已知坑+健康度+失败签名恢复表。对某站动手前先读,命中失败签名按 recovery 自救,别现场试错',
    inputSchema: { type: 'object', properties: { site: { type: 'string', description: '站点名(如 weibo / xiaohongshu)' } }, required: ['site'] },
    annotations: { readOnlyHint: true },
  },
]

/** 站点全集=目录 ∪ 健康表 ∪ 坑表(threads 这类"无适配器"站只活在健康表里,union 才不漏)。 */
export function knowledgeSiteUniverse(entries: RawEntry[] | undefined): string[] {
  const set = new Set<string>()
  for (const e of Array.isArray(entries) ? entries : []) {
    const s = (e.site ?? e.command?.split('/')[0] ?? '').toLowerCase()
    if (s.length > 0) set.add(s)
  }
  for (const s of Object.keys(SITE_HEALTH)) set.add(s)
  for (const s of Object.keys(PITFALLS)) set.add(s)
  return [...set].sort()
}

/** knowledge_list 纯函数:每站一行摘要,健康/坑/目录三源合并;条目缺什么省什么键。 */
export function knowledgeList(entries: RawEntry[] | undefined): KnowledgeSiteSummary[] {
  const list = Array.isArray(entries) ? entries : []
  return knowledgeSiteUniverse(list).map((site) => {
    const k = list.length > 0 ? buildKnowledge(site, list) : null
    const h = healthOf(site)
    const pitfallCount = (PITFALLS[site] ?? []).length
    return {
      site,
      uri: knowledgeResourceUri(site),
      ...(k !== null ? { domain: k.domain, commandCount: k.commandCount } : {}),
      ...(h !== null ? { health: { status: h.status, label: SITE_HEALTH_STATUS_LABELS[h.status] ?? h.status, issues: h.issues, updated: h.updated } } : {}),
      ...(pitfallCount > 0 ? { pitfallCount } : {}),
    }
  })
}

/** knowledge_get 纯函数:目录有站出完整卡;目录缺站但健康/坑表有,出降格卡(如实无命令目录);两头都没有返回 null(不编造)。 */
export function knowledgeCard(site: string, entries: RawEntry[] | undefined): { markdown: string; card: SiteKnowledge } | null {
  const norm = site.trim().toLowerCase()
  const list = Array.isArray(entries) ? entries : []
  const k = list.length > 0 ? buildKnowledge(norm, list) : null
  if (k !== null) return { markdown: renderKnowledgeMarkdown(k), card: k }
  const h = healthOf(norm)
  const pitfalls = PITFALLS[norm] ?? []
  if (h === null && pitfalls.length === 0) return null
  // 降格卡:没有目录就没有命令目录段(commandCount 0),health/pitfalls 是真实读侧,不编命令
  const card: SiteKnowledge = { site: norm, generatedAt: new Date().toISOString(), commandCount: 0, commands: [], pitfalls, ...(h !== null ? { health: h } : {}) }
  return { markdown: renderKnowledgeMarkdown(card), card }
}

/** tools/call 派发(未知工具抛错,由 JSON-RPC 层收成 -32602;工具级失败走 isError 结果)。 */
function callTool(name: string, args: Record<string, unknown>, deps: McpToolDeps): { content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean } {
  if (name === 'knowledge_list') {
    const sites = knowledgeList(deps.entries)
    return { content: [{ type: 'text', text: JSON.stringify(sites, null, 2) }], structuredContent: { sites } }
  }
  if (name === 'knowledge_get') {
    const site = String(args.site ?? '').trim()
    if (site.length === 0 || !/^[\w@.-]{1,64}$/.test(site)) {
      return { content: [{ type: 'text', text: `站点名非法(如 weibo):${JSON.stringify(args.site ?? null)}` }], isError: true }
    }
    const r = knowledgeCard(site, deps.entries)
    if (r === null) {
      return { content: [{ type: 'text', text: `没有 ${site} 的知识(健康表/坑表/目录都没有——宁可不给也不编造)` }], isError: true }
    }
    const structured = { site: r.card.site, uri: knowledgeResourceUri(r.card.site), commandCount: r.card.commandCount, pitfallCount: r.card.pitfalls.length, ...(r.card.health !== undefined ? { health: r.card.health } : {}) }
    return { content: [{ type: 'text', text: r.markdown }], structuredContent: structured }
  }
  throw new Error(`未知工具:${name}`)
}

// ── JSON-RPC 层(纯函数,无 HTTP 依赖,可直测) ──────────────────────────────

/** JSON-RPC 响应(id 形态原样回传;error 与 result 互斥)。 */
export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string; data?: unknown } }

const rpcError = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })

/** 请求形状闭集校验:对象 + jsonrpc:'2.0' + method 字符串 + id 缺省(通知)或为 string/number/null;其余 null(→ -32600)。 */
function validEnvelope(m: unknown): { method: string; params: unknown; id?: string | number | null } | null {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return null
  const o = m as Record<string, unknown>
  if (o.jsonrpc !== '2.0' || typeof o.method !== 'string' || o.method.length === 0) return null
  if (o.id === undefined) return { method: o.method, params: o.params }
  if (typeof o.id !== 'string' && typeof o.id !== 'number' && o.id !== null) return null
  return { method: o.method, params: o.params, id: o.id }
}

/**
 * 处理一条 JSON-RPC 消息:有 id 回响应,无 id 的合法通知回 null(调用方据此回 202)。
 * 形状非法的消息即使无 id 也回 -32600(id null)——JSON-RPC 语义:无法解析为请求的都要报。
 */
export function handleJsonRpc(message: unknown, deps: McpToolDeps): JsonRpcResponse | null {
  const msg = validEnvelope(message)
  if (msg === null) return rpcError(null, -32600, 'Invalid Request:非 JSON-RPC 2.0 消息(jsonrpc/method/id 形态不符)')
  const reply = (result: unknown): JsonRpcResponse | null => (msg.id === undefined ? null : { jsonrpc: '2.0', id: msg.id, result })
  switch (msg.method) {
    case 'initialize': {
      // 协议版本:客户端声明的版本认识就确认,不认识的钳回服务端唯一支持的版本
      //(MCP 规范:响应里的版本是服务端声明「我按这个说」,回显未支持版本等于假兼容;复核 low)
      const p = (msg.params ?? {}) as Record<string, unknown>
      const requested = typeof p.protocolVersion === 'string' && p.protocolVersion.length > 0 ? p.protocolVersion : MCP_PROTOCOL_VERSION
      return reply({
        protocolVersion: requested === MCP_PROTOCOL_VERSION ? requested : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dsh-opencli', title: 'dsh-opencli 站点知识', version: PLUGIN_VERSION },
        instructions: '站点知识读侧:knowledge_list 看全部站点健康度与已知坑,knowledge_get 取单站知识卡(命令目录+坑+健康度+失败签名恢复表)。只读,无写工具。',
      })
    }
    case 'notifications/initialized':
      return reply({}) // 通知:id 缺省,reply 恒 null
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: KNOWLEDGE_TOOLS })
    case 'tools/call': {
      const p = msg.params
      if (p === null || typeof p !== 'object' || Array.isArray(p) || typeof (p as Record<string, unknown>).name !== 'string') {
        return rpcError(msg.id ?? null, -32602, 'Invalid params:tools/call 需要 { name, arguments }')
      }
      const args = (p as Record<string, unknown>).arguments
      if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
        return rpcError(msg.id ?? null, -32602, 'Invalid params:arguments 必须是对象')
      }
      try {
        return reply(callTool((p as Record<string, unknown>).name as string, (args ?? {}) as Record<string, unknown>, deps))
      } catch (e) {
        // 工具名不存在等派发层错误:JSON-RPC 错(协议级),不是工具结果
        return rpcError(msg.id ?? null, -32602, e instanceof Error ? e.message : String(e))
      }
    }
    default:
      return rpcError(msg.id ?? null, -32601, `Method not found:${msg.method}`)
  }
}

// ── HTTP 层(Streamable-HTTP 最小子集) ─────────────────────────────────────

/** 常数时间 token 比较:双侧 sha256 后比摘要,长度差也不泄时序。 */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Authorization: Bearer <token> 解析(找不到/形态不符返回 null)。 */
function bearerOf(req: IncomingMessage): string | null {
  const h = req.headers.authorization
  if (typeof h !== 'string') return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m !== null ? m[1]!.trim() : null
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * 读请求体(带上限;超限返回 null,调用方 413)。
 * 超限后不立刻 destroy——那会让 413 响应到不了客户端;改为继续收但丢弃(排干),
 * 直到 'end' 再回信。另设 8MB 硬顶:超得离谱视为滥用,掐线保进程(响应可能丢失,可接受)。
 */
function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0
    let overflow = false
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (overflow) {
        if (size > limit + 8 * 1024 * 1024) { resolve(null); req.destroy() }
        return
      }
      if (size > limit) { overflow = true; chunks.length = 0; return }
      chunks.push(c)
    })
    req.on('end', () => resolve(overflow ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

/**
 * 单请求处理器(导出仅测试用):token 门 → 方法/路径白名单 → 体积门 → 解析 → JSON-RPC → 200/202。
 * depsProvider 每请求调用一次:目录缓存是活的(adapterCache 刷新后新请求即见新目录)。
 */
export function makeRequestHandler(depsProvider: () => McpToolDeps, expectedToken: string, log?: (msg: string) => void): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void (async () => {
      try {
        // ① token 门(daemon X-OpenCLI 门思路:无头/错头一律拒,在解析 body 之前)
        const bearer = bearerOf(req)
        if (bearer === null || !tokenMatches(bearer, expectedToken)) {
          writeJson(res, 401, { error: `unauthorized:缺少或不正确的 Authorization: Bearer <token>(token 见 ${mcpAuthFile()} 或 env DSH_OPENCLI_MCP_TOKEN)` })
          return
        }
        // ② 方法/路径白名单:只认 POST /mcp;GET/DELETE(SSE/会话终结)如实 405,不开假 SSE
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `本端点只支持 POST ${MCP_ENDPOINT_PATH}(application/json;不提供 SSE 流)` }))
          return
        }
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (path !== MCP_ENDPOINT_PATH) {
          writeJson(res, 404, { error: `未知路径:${path}(单端点是 ${MCP_ENDPOINT_PATH})` })
          return
        }
        const ct = req.headers['content-type'] ?? ''
        if (!ct.includes('application/json')) {
          writeJson(res, 415, { error: `Content-Type 必须是 application/json(收到:${ct || '无'})` })
          return
        }
        // ③ 体积门
        const raw = await readBody(req, MCP_MAX_BODY_BYTES)
        if (raw === null) {
          writeJson(res, 413, { error: `请求体超 ${MCP_MAX_BODY_BYTES} 字节上限` })
          return
        }
        // ④ 解析:坏 JSON → -32700(id null,JSON-RPC 语义)
        let parsed: unknown
        try { parsed = JSON.parse(raw) } catch {
          writeJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error:请求体不是合法 JSON' } })
          return
        }
        // ⑤ 派发:单条或批(批内通知不回信;全通知 → 202 空体)
        const deps = depsProvider()
        const dispatch = (m: unknown): JsonRpcResponse | null => {
          try { return handleJsonRpc(m, deps) } catch (e) {
            return rpcError(null, -32603, e instanceof Error ? e.message : String(e))
          }
        }
        if (Array.isArray(parsed)) {
          // 批上限 20:超出的条目逐条回 -32603 越界错(不静默吞——静默截断会让等这些 id 的客户端挂到超时,复核 low)
          const OVER = 20
          const replies = parsed.slice(0, OVER).map(dispatch).filter((r): r is JsonRpcResponse => r !== null)
          for (let k = OVER; k < parsed.length; k++) {
            const id = (parsed[k] as { id?: unknown } | null)?.id
            if (id !== undefined) replies.push({ jsonrpc: '2.0', id, error: { code: -32603, message: `批请求超 ${OVER} 条上限,本条未处理` } })
          }
          if (replies.length === 0) { res.writeHead(202).end(); return }
          writeJson(res, 200, replies)
          return
        }
        const reply = dispatch(parsed)
        if (reply === null) { res.writeHead(202).end(); return } // 纯通知:202 Accepted 无体
        writeJson(res, 200, reply)
      } catch (e) {
        // 兜底:处理器任何未预期异常以 -32603 回信,不挂连接不炸进程
        log?.(`MCP 请求处理异常:${e instanceof Error ? e.message : String(e)}`)
        if (!res.headersSent) writeJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })
        else res.end()
      }
    })()
  }
}

// ── 启动/停机(生命周期照 index.ts 收件箱计时器纪律:随服务起,ctx.effect 收) ──

/** 运行句柄:index.ts 收进字段,status RPC 读,stop 随 ctx.effect 走。 */
export interface McpSelfhostHandle {
  port: number
  url: string
  token: string
  tokenSource: 'explicit' | 'env' | 'generated'
  tools: Array<{ name: string; description: string }>
  stop(): Promise<void>
}

export type McpSelfhostStart =
  | { ok: true; handle: McpSelfhostHandle }
  | { ok: false; error: string }

export interface McpSelfhostOptions {
  /** 端口(缺省走 env → 19831;测试传 0 用临时端口,或显式固定端口做冲突用例)。 */
  port?: number
  /** token(缺省走 env → 启动生成)。 */
  token?: string
  /** 告知文件路径(缺省走 env → ~/.dsh/opencli-mcp-auth.json)。 */
  authFile?: string
  /** 目录缓存注入(index.ts 传 adapterCache 的 json;缺省只有 health/pitfalls 读侧)。 */
  entriesProvider?: () => unknown
  log?: (msg: string) => void
}

/** 告知文件内容:本机消费者(ctl/IDE 配置)从这里拿 url+token。 */
function authPayload(url: string, port: number, token: string, tokenSource: string): Record<string, unknown> {
  return { plugin: 'dsh-opencli', protocol: 'mcp/streamable-http', url, port, token, tokenSource, pid: process.pid, startedAt: new Date().toISOString() }
}

/**
 * 启动自host端点。启动失败(端口被占/权限)不抛:返回 { ok:false, error },
 * 插件主体照常——外部消费者直连是增强面,不是生命线。
 */
export async function startMcpSelfhost(opts: McpSelfhostOptions = {}): Promise<McpSelfhostStart> {
  const port = opts.port ?? mcpPort()
  // 来源三值如实:显式传参=explicit(env 同义混标会让字段名与取值不符,复核 low);生产路径不传 opts.token,恒为 env/generated
  const tokenSource: 'explicit' | 'env' | 'generated' = opts.token !== undefined ? 'explicit' : mcpTokenFromEnv() !== undefined ? 'env' : 'generated'
  const token = opts.token ?? mcpTokenFromEnv() ?? randomBytes(24).toString('base64url')
  const authFile = opts.authFile ?? mcpAuthFile()
  const log = opts.log
  // 目录缓存每请求经 provider 惰性取(entriesProvider 缺省=只有 health/pitfalls 静态读侧)
  const handler = makeRequestHandler(() => {
    const raw = opts.entriesProvider?.()
    return Array.isArray(raw) ? { entries: raw as RawEntry[] } : {}
  }, token, log)
  const server: Server = createServer(handler)
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    server.close()
    return { ok: false, error: `MCP 自host 启动失败(端口 ${port}):${msg}` }
  }
  // 端口 0(临时端口)时以实际分配为准:url 与告知文件一致
  const actualPort = (server.address() as { port: number }).port
  const actualUrl = `http://127.0.0.1:${actualPort}${MCP_ENDPOINT_PATH}`
  // 告知文件写失败不致命:env token 的消费者本就知道 token;生成态写失败由 status RPC 留痕
  try {
    await mkdir(dirname(authFile), { recursive: true })
    // mode 0600 只在创建时生效且 win32 忽略(权限边界本就靠用户主目录,同收件箱思路)
    await writeFile(authFile, JSON.stringify(authPayload(actualUrl, actualPort, token, tokenSource), null, 2), { encoding: 'utf8', mode: 0o600 })
  } catch (e) {
    log?.(`MCP 告知文件写入失败(${authFile}):${e instanceof Error ? e.message : String(e)}`)
  }
  const stop = async (): Promise<void> => {
    await rm(authFile, { force: true }).catch(() => { /* 文件竞态:尽力而为 */ })
    await new Promise<void>((resolve) => {
      // 有 keep-alive 连接挂着时 close 的回调可能迟迟不来:3s 后强拆连接兜底
      // (插件热重载/停机不能因一个 HTTP 句柄卡住;timer unref 不阻进程退出)
      const force = setTimeout(() => { server.closeAllConnections() }, 3000)
      force.unref()
      server.close(() => { clearTimeout(force); resolve() })
    })
  }
  return {
    ok: true,
    handle: { port: actualPort, url: actualUrl, token, tokenSource, tools: KNOWLEDGE_TOOLS.map((t) => ({ name: t.name, description: t.description })), stop },
  }
}
