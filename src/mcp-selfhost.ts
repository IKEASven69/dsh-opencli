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
 *  - 传输安全门(2025-06-18 MUST/互操作补齐,§九.3 规范深读):Host 回环白名单+Origin
 *    同源校验(403,DNS 重绑定防护)、Bearer 401 带 WWW-Authenticate(RFC 6750,SDK
 *    bearerAuth 同款)、MCP-Protocol-Version 头不认识的版回 400(lifecycle 章,缺头按
 *    init 协商版处理——stateless 下协商版恒为 MCP_PROTOCOL_VERSION);
 *  - 端口冲突容错:EADDRINUSE 等启动失败不抛不炸,返回 { ok:false },插件主体照常。
 *
 * 不做面(如实降格,不冒充全量;§九.3 规范深读 §9):logging 不声明(无服务端推送通道,
 * 声明即撒谎);HTTP 面不补 resources/*(宿主内消费走 knowledge.ts seam 线已覆盖,外部
 * 消费者 tools+resource_link 够,resources/* 回 -32601 是 capability 未声明的规范合法回应);
 * completion(无 IDE 补全场景)/ registry 提交(端点=127.0.0.1+每进程 token,生态位不符)/
 * SSE+session(stateless 是规范内一等形态,且规避宿主 #12217 会话回收痛点)均不做。
 * 旧留痕清账(复核 low#18):events_get/schedules_get 曾在 0.1.4 记为「后置不做」零留痕,
 * 0.1.5 已按 C6 转实现(见下),写面仍然不做——写操作必须走审批门,HTTP 旁路不得绕开。
 *
 * 工具面(只读收敛,不自造写面):
 *  - knowledge_list / knowledge_search / knowledge_get(官方 memory 三件套同构:
 *    全量读/检索/按名取),数据源=knowledge.ts 现有读侧(health/pitfalls),目录缓存
 *    可选注入出完整知识卡;list 支持应用级过滤分页(status/domain/query/limit/cursor),
 *    不再无参全量拉;三工具都是纯读,无任何状态变更。
 *  - events_get / schedules_get / inbox_list(0.1.5 C6 ops 只读面,docs/RESEARCH-20261116-015.md
 *    正文三§五#4+正文四§3.4):事件台账/定时任务清单/运行收件箱的只读投影——数据源与面板
 *    events-get / schedule-list / inbox-list 三 RPC 同源(前者读 ~/.dsh/opencli-events.jsonl
 *    +轮转档 .1,后两者读 state.json 三键),先例形状=com.cronobserver/mcp 的「调度状态+事件
 *    流水只读暴露、读写 scope 分离」:本端点只做只读半边,投影行是最小事实(不含 history 全文、
 *    回执全文与任何凭据类字段)。注册面按预研 C6 规格行「--caps 门控、默认不注册」执行
 *    (mcpVisibleTools/mcpCapsRaw):默认只注册 knowledge 三件套,env DSH_OPENCLI_MCP_CAPS=ops
 *    (或 all)显式开启后 ops 三工具才进 tools/list(0.1.5 复核⑤:实现曾默认全量注册与规格
 *    相左,按规格行收紧;端点无 CLI 参数面,--caps 语义经 env 表达——与 token/port 同门面)。
 * @module dsh-opencli/mcp-selfhost
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { buildKnowledge, healthOf, renderKnowledgeMarkdown, SITE_HEALTH, PITFALLS, SITE_HEALTH_STATUS_LABELS, knowledgeResourceUri, type RawEntry, type SiteKnowledge } from './knowledge.ts'
import { inboxRunStatus, inboxUnreadCount, synthesizeRunInbox, type InboxRunFlag, type RunHistoryRow, type RunInboxStatus } from './runinbox.ts'
import { PLUGIN_VERSION } from './version.ts'

/** 默认端口(19825 是 daemon,19831 是本端点;冲突由启动容错兜住,可用 env 换)。 */
export const MCP_DEFAULT_PORT = 19831
/** 单端点路径(白名单闭集:其余路径一律 404,收件箱同款纪律)。 */
export const MCP_ENDPOINT_PATH = '/mcp'
/** 请求体上限(MCP 消息远用不满;防灌爆照收件箱 16KB 纪律的放宽版)。 */
export const MCP_MAX_BODY_BYTES = 1024 * 1024
/** 服务端唯一声明/支持的协议版本(initialize 收到不认识的版钳回此版——回显未支持版本等于假兼容;
 *  MCP-Protocol-Version 头校验按 MCP_SUPPORTED_PROTOCOL_VERSIONS 同源)。 */
export const MCP_PROTOCOL_VERSION = '2025-06-18'

/** 协议版本支持列表(仅一个:initialize 恒钳回上一行;lifecycle 章 MUST——初始化后请求的头
 *  不在此列表 → 400,缺头 → 按 init 协商版处理,stateless 下协商版即此常量)。 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [MCP_PROTOCOL_VERSION]

/**
 * 应用级分页常数(协议 cursor 分页只定义在 tools/list 等协议 list 操作上;knowledge_list 的
 * 分页是工具参数层,借用 nextCursor 语义——2025-06-18 utilities/pagination 章,§九.3 §3):
 * list 缺省页 50(不再无参全量拉 154KB),search 缺省 20(路由式文案引导先 search 再 get),
 * 显式 limit 上限 500。
 */
export const MCP_LIST_PAGE_DEFAULT = 50
export const MCP_SEARCH_PAGE_DEFAULT = 20
export const MCP_LIST_MAX_LIMIT = 500

/** knowledge_list 的 status 过滤合法值:三种健康表状态 + ok(健康表无记录=默认正常,knowledge.ts 纪律)。 */
export const MCP_KNOWN_HEALTH_STATUSES: readonly string[] = ['ok', 'degraded', 'notice', 'unsupported']

/**
 * ops 只读面有界常数(C6):events_get 缺省页 50、显式上限 200(比面板 events-get RPC 的
 * 500 更紧——外部消费者是无人值守面,默认小页防灌爆,MCP_MAX_BODY_BYTES 同款思路);
 * inbox_list 是摘要不是列表:计数全量、条目摘要只给最近 20 条,单行摘要截 160 字符
 * (「不含正文全文」的落点——结论行超长时截断,原文完整面在面板/trace,不经 MCP 外泄)。
 */
export const MCP_EVENTS_PAGE_DEFAULT = 50
export const MCP_EVENTS_MAX_LIMIT = 200
export const MCP_INBOX_RECENT = 20
export const MCP_SUMMARY_CLIP = 160

/** 事件台账路径(env DSH_OPENCLI_EVENTS_FILE 覆盖,与面板 events-get RPC 同一把尺;非法值不抛)。 */
export const mcpEventsFile = (): string => {
  const v = process.env.DSH_OPENCLI_EVENTS_FILE
  return v !== undefined && v.length > 0 ? v : join(homedir(), '.dsh', 'opencli-events.jsonl')
}

/** 插件状态文件路径(env DSH_OPENCLI_STATE 覆盖,与面板 schedule-list/inbox-list 同源)。 */
export const mcpStateFile = (): string => {
  const v = process.env.DSH_OPENCLI_STATE
  return v !== undefined && v.length > 0 ? v : join(homedir(), '.dsh', 'dsh-opencli-state.json')
}

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

// ── 工具面(只读六只:knowledge 三件套 + ops 三件套) ──────────────────────────

/** 事件行(形状与面板 IngestEvent 一致:at/kind/text;读侧逐行校验,见 readEventRows)。 */
export interface McpEventRow {
  at: string
  kind: string
  text: string
}

/**
 * state.json 投影输入面(只取三键):schedules 行/runHistory/inboxFlags 原样收进,
 * 投影层逐行再校验。顶层其余键(approval/audit/disabled/notifyConfig)一概不进本面——
 * notifyConfig 的 webhook URL 带凭据,凭据类字段永不外显(C6 红线)。
 */
export interface McpOpsState {
  schedules?: unknown[]
  runHistory?: Record<string, unknown[]>
  inboxFlags?: Record<string, InboxRunFlag>
}

/** 目录缓存注入 + ops 数据注入(index.ts/测试传入;缺省走 mcpEventsFile/mcpStateFile 读盘)。 */
export interface McpToolDeps {
  entries?: RawEntry[]
  /** 事件台账快照(注入态;缺省读 mcpEventsFile(),读不到=空表不是错误)。 */
  events?: McpEventRow[]
  /** state 快照(注入态;缺省读 mcpStateFile(),读不到/形状不对=空对象)。 */
  opsState?: McpOpsState
  /** ops 只读面注册开关(C6 规格行「--caps 门控、默认不注册」;缺省/不传=false=只注册
   *  knowledge 三件套,events_get/schedules_get/inbox_list 不进 tools/list 且 tools/call
   *  如实报未注册。startMcpSelfhost 从 env DSH_OPENCLI_MCP_CAPS 或显式 opts 解析后注入)。 */
  opsTools?: boolean
}

/** 单站摘要(knowledge_list/knowledge_search 的行;省键契约同 evidence-get:没有的东西不给空占位)。 */
export interface KnowledgeSiteSummary {
  site: string
  uri: string
  /** 目录里才有的字段(domain/命令数);健康表/坑表才有的字段(health/坑数) */
  domain?: string
  commandCount?: number
  health?: { status: string; label: string; issues: string[]; updated: string }
  pitfallCount?: number
}

/** 四 hint 注解照官方 memory 只读先例(纯读、可重放、不触外部世界;clients 侧 MUST 视为不可信——只是自述)。 */
const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** 单站摘要的 JSON Schema(structuredContent 行形状照抄成 schema,list 与 search 共用)。 */
const SITE_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    site: { type: 'string' },
    uri: { type: 'string' },
    domain: { type: 'string' },
    commandCount: { type: 'number' },
    pitfallCount: { type: 'number' },
    health: {
      type: 'object',
      properties: { status: { type: 'string' }, label: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } }, updated: { type: 'string' } },
      required: ['status', 'label', 'issues', 'updated'],
    },
  },
  required: ['site', 'uri'],
} as const

const KNOWLEDGE_TOOLS = [
  {
    name: 'knowledge_list',
    title: '站点知识目录 · Site Knowledge Catalog',
    // 路由式文案(官方 memory read_graph 先例:告诉模型何时该用别的工具,别全量拉)
    description: '站点知识目录(默认分页 50 条,别全量拉):全部已知站点一行一条——健康度(degraded/notice/unsupported)与已知坑数量;支持 status/domain/query 过滤。挑站点/判断某站现在能不能用先看它,别对一个 degraded 站反复重试。Site knowledge catalog (paged, default 50): one row per known site with health status and pitfall count; narrow with status/domain/query instead of pulling everything.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...MCP_KNOWN_HEALTH_STATUSES], description: '健康度过滤:ok=健康表无记录的站(默认正常);其余=健康表对应状态' },
        domain: { type: 'string', description: '域名精确过滤(大小写不敏感,如 weibo.com;目录外的站无 domain 字段,不命中)' },
        query: { type: 'string', description: '关键词过滤(语义同 knowledge_search:站名/域名/命令名/命令说明/坑文本)' },
        limit: { type: 'number', description: `每页条数(1-${MCP_LIST_MAX_LIMIT},缺省 ${MCP_LIST_PAGE_DEFAULT})` },
        cursor: { type: 'string', description: '上页结果里的 nextCursor 原样传回(应用级不透明串;换过滤参数即失效)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sites: { type: 'array', items: SITE_SUMMARY_SCHEMA },
        total: { type: 'number', description: '过滤后命中总数(含未进本页的)' },
        nextCursor: { type: 'string', description: '还有下一页时给出;末页省略' },
      },
      required: ['sites'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'knowledge_search',
    title: '站点知识检索 · Site Knowledge Search',
    // 路由式文案(官方 memory search_nodes 先例:知道关键词先 search,别全量列)
    description: '站点知识检索:按关键词模糊匹配站名/域名/命令名/命令说明/坑文本(大小写不敏感),返回站点摘要行,站名命中排最前。知道关键词先 search 再 knowledge_get,不要全量列目录。Fuzzy search over site/domain/command names, command descriptions and pitfall texts; prefer this over knowledge_list when you know what to look for.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词(子串匹配)' },
        limit: { type: 'number', description: `返回上限(1-${MCP_LIST_MAX_LIMIT},缺省 ${MCP_SEARCH_PAGE_DEFAULT})` },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sites: { type: 'array', items: SITE_SUMMARY_SCHEMA },
        total: { type: 'number', description: '命中总数(含 limit 截掉的)' },
      },
      required: ['sites', 'total'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'knowledge_get',
    title: '站点知识卡 · Site Knowledge Card',
    description: '单站知识卡:结构化命令目录+已知坑+健康度+失败签名恢复表(目录内站点附 resource_link,可经 resources 面订阅/抓取)。对某站动手前先读,命中失败签名按 recovery 自救,别现场试错。Single-site knowledge card: commands, known pitfalls, health and failure-signature recovery table.',
    inputSchema: { type: 'object', properties: { site: { type: 'string', description: '站点名(如 weibo / xiaohongshu)' } }, required: ['site'] },
    outputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string' },
        uri: { type: 'string' },
        commandCount: { type: 'number' },
        pitfallCount: { type: 'number' },
        health: { type: 'object', properties: { status: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } }, updated: { type: 'string' } }, required: ['status', 'issues', 'updated'] },
      },
      required: ['site', 'uri', 'commandCount', 'pitfallCount'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
]

// ── ops 只读三工具(C6;cronobserver 先例形状:只读暴露+归因+读写 scope 分离的只读半边) ──

const OPS_TOOLS = [
  {
    name: 'events_get',
    title: '运行事件台账 · Operations Event Log',
    // 路由式文案:先想 kind/since 再拉,台账按月可积累(5MB 预算),别无参全量翻历史
    description: '无人值守运行事件台账(最新在前,缺省 50 条、上限 200):调度失败/收件箱/守护自愈/版本翻转/早报等事件痕迹,跨会话持久。kind 精确过滤(如 schedule-failed / daemon-flip / inbox,枚举开放集以实际返回为准),since 过滤只出该时刻之后(ISO 8601)。排查「昨晚定时任务怎么了」先带 since 拉,别全量翻。Unattended-run event log (newest first, default 50, max 200): schedule failures, inbox, daemon self-heal, version flips, digests. Filter by kind (exact) and since (ISO 8601) instead of paging through history.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: '事件类型精确过滤(大小写敏感,如 schedule-failed;开放枚举,以台账实际 kind 为准)' },
        since: { type: 'string', description: '只出该时刻(含)之后的事件,ISO 8601(如 2026-11-16T00:00:00Z)' },
        limit: { type: 'number', description: `返回上限(1-${MCP_EVENTS_MAX_LIMIT},缺省 ${MCP_EVENTS_PAGE_DEFAULT})` },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: { at: { type: 'string' }, kind: { type: 'string' }, text: { type: 'string' } },
            required: ['at', 'kind', 'text'],
          },
        },
        total: { type: 'number', description: '过滤后命中总数(含 limit 截掉的更旧事件)' },
      },
      required: ['events', 'total'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'schedules_get',
    title: '定时任务清单 · Scheduled Jobs',
    description: '定时采集任务清单(只读投影,无参数):任务名/命令行/cron/enabled/来源(source)/最近一次 run 的 typed 状态。不含运行历史全文与任务级旗标(watch/notify/profile 等),凭据类字段永不外显;改任务用面板或 ctl,本端点没有写面。Read-only list of scheduled jobs: id/command line/cron/enabled/source/last run status; no history text, no flags, no credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: {
      type: 'object',
      properties: {
        schedules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              site: { type: 'string', description: '任务命令行(runHistory 键是 id,展示用)' },
              cron: { type: 'string' },
              enabled: { type: 'boolean' },
              source: { type: 'string' },
              lastRunAt: { type: 'string' },
              last: {
                type: 'object',
                properties: { at: { type: 'string' }, status: { type: 'string', enum: ['ok', 'fail', 'skip', 'empty'] } },
                required: ['at', 'status'],
                description: '最近一次 run 的四态状态(与收件箱同口径);无 run 记录省键',
              },
            },
            required: ['id', 'site', 'cron', 'enabled'],
          },
        },
        total: { type: 'number' },
      },
      required: ['schedules', 'total'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'inbox_list',
    title: '运行收件箱摘要 · Run Inbox Summary',
    description: '运行收件箱摘要(只读投影,无参数):未读/已读/归档与四态(ok/fail/skip/empty)计数+最近 20 条摘要行。摘要行只有结论一行(超长截断),不含回执与正文全文;已读/归档交互走面板或 ctl,本端点没有写面。Run inbox summary (read-only): unread/read/archived and per-status counts plus the 20 most recent one-line entries; full receipts and bodies stay local.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: {
      type: 'object',
      properties: {
        unread: { type: 'number', description: '未读且未归档条数(归档不产生红点)' },
        counts: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            read: { type: 'number' },
            archived: { type: 'number' },
            status: {
              type: 'object',
              properties: { ok: { type: 'number' }, fail: { type: 'number' }, skip: { type: 'number' }, empty: { type: 'number' } },
              required: ['ok', 'fail', 'skip', 'empty'],
            },
          },
          required: ['total', 'read', 'archived', 'status'],
        },
        recent: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              site: { type: 'string' },
              at: { type: 'string' },
              status: { type: 'string', enum: ['ok', 'fail', 'skip', 'empty'] },
              summary: { type: 'string', description: '结论一行(超长截断;完整面在面板/trace)' },
              read: { type: 'boolean' },
              archived: { type: 'boolean' },
              archivedBy: { type: 'string', enum: ['manual', 'auto'] },
            },
            required: ['task', 'site', 'at', 'status', 'summary', 'read', 'archived'],
          },
        },
      },
      required: ['unread', 'counts', 'recent'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
]

/** 全工具面(knowledge 三件套 + ops 三件套,tools/list 与 handle.tools 同源;全只读,无写面)。 */
const ALL_TOOLS = [...KNOWLEDGE_TOOLS, ...OPS_TOOLS]

/** ops 三工具名单(门控判定与 callTool 拦截共用;新增 ops 工具须同步)。 */
const OPS_TOOL_NAMES: ReadonlySet<string> = new Set(OPS_TOOLS.map((t) => t.name))

/**
 * ops 只读面能力开关(C6 规格行「--caps 门控、默认不注册」,docs/RESEARCH-20261116-015.md §六;
 * 0.1.5 复核⑤:实现曾默认全量注册,与书面规格相左,按规格行收紧——默认只注册 knowledge
 * 三件套,能力开关显式带 ops(或 all)才把 ops 三工具加进 tools/list。端点随插件进程常驻,
 * 无 CLI 参数面,--caps 语义经 env DSH_OPENCLI_MCP_CAPS 表达(与 DSH_OPENCLI_MCP_TOKEN/
 * PORT 同款门面,startMcpSelfhost.opsTools 可显式覆盖);值解析:逗号分隔 trim、大小写
 * 不敏感,'ops' 开 ops 面,'all' 等价 knowledge+ops,其余值忽略(白名单闭集,不猜测)。
 * tools/list 不列出的工具,tools/call 如实报「未注册」并给开法指引——宁可消费者多一步
 * 开关,不做 stale tool list(#13396 痛点,消费者会话里的工具清单与端点实际面一致)。
 */
export function mcpCapsRaw(): string[] {
  const raw = process.env.DSH_OPENCLI_MCP_CAPS
  if (raw === undefined || raw.trim() === '') return []
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
}

/** caps 是否开了 ops 面('ops' 或 'all')。 */
export function mcpOpsEnabled(caps: readonly string[] | undefined): boolean {
  return caps !== undefined && caps.some((c) => c === 'ops' || c === 'all')
}

/** 实际注册工具面:默认 knowledge 三件套;ops 开了才加 ops 三件套(默认不注册,C6 规格行)。 */
export function mcpVisibleTools(ops: boolean): typeof ALL_TOOLS {
  return ops ? ALL_TOOLS : KNOWLEDGE_TOOLS
}

/** 站点全集=目录 ∪ 健康表 ∪ 坑表(threads 这类"无适配器"站只活在健康表里,union 才不漏)。 */
export function knowledgeSiteUniverse(entries: RawEntry[] | undefined): string[] {
  const set = new Set<string>()
  for (const e of Array.isArray(entries) ? entries : []) {
    const s = (e.site ?? e.command?.split('/')[0] ?? '').toLowerCase()
    if (s.length > 0) set.add(s)
  }
  for (const s of Object.keys(SITE_HEALTH)) set.add(s)
  // `_` 前缀=非站点保留段(_global 全局/工具面坑,src/knowledge.ts 保留键纪律)——不进站点宇宙,
  // 全局坑经 knowledge_get 卡的「工具面须知」段面世
  for (const s of Object.keys(PITFALLS)) { if (!s.startsWith('_')) set.add(s) }
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

/**
 * 模糊命中档位(大小写不敏感子串):0=站名 1=域名 2=命令名/命令说明/坑文本;-1=未命中。
 * knowledge_search 按档位排序(站名命中最前),knowledge_list 的 query 过滤只看 ≥0;
 * 健康表 issues 文本不参与(检索面如实限定在工具描述文案所列五类)。
 */
function siteMatchRank(site: string, row: KnowledgeSiteSummary, q: string, entries: RawEntry[] | undefined): number {
  if (site.includes(q)) return 0
  if (row.domain !== undefined && row.domain.toLowerCase().includes(q)) return 1
  const list = Array.isArray(entries) ? entries : []
  for (const e of list) {
    if ((e.site ?? e.command?.split('/')[0] ?? '').toLowerCase() !== site) continue
    if ((e.name ?? e.command?.split('/')[1] ?? '').toLowerCase().includes(q)) return 2
    if ((e.description ?? '').toLowerCase().includes(q)) return 2
  }
  for (const p of PITFALLS[site] ?? []) {
    if (p.toLowerCase().includes(q)) return 2
  }
  return -1
}

/** knowledge_list 查询参数(全部可选;status 合法值见 MCP_KNOWN_HEALTH_STATUSES,非法在 callTool 拦)。 */
export interface KnowledgeListQuery {
  status?: string
  domain?: string
  query?: string
  limit?: number
  /** 应用级续页游标(knowledgeListPage 产物);换过滤参数即失效 */
  cursor?: string
}

export interface KnowledgeListPage {
  sites: KnowledgeSiteSummary[]
  /** 过滤后命中总数(含未进本页的) */
  total: number
  /** 还有下一页时给出(应用级不透明串,绑定本组过滤参数);末页省略 */
  nextCursor?: string
}

/** 游标指纹:过滤参数一变旧游标即作废(规范:client MUST NOT 解析/假定 cursor,server 侧自校验防跨过滤串页)。 */
function filterFingerprint(q: Pick<KnowledgeListQuery, 'status' | 'domain' | 'query'>): string {
  return createHash('sha256').update(JSON.stringify([q.status ?? '', q.domain ?? '', q.query ?? ''])).digest('base64url').slice(0, 12)
}

const encodeCursor = (offset: number, fp: string): string => Buffer.from(JSON.stringify({ o: offset, f: fp }), 'utf8').toString('base64url')

/** 解码失败/形状不符返回 null(调用方按分页章「无效 cursor SHOULD -32602」收口,不静默当第 1 页)。 */
function decodeCursor(s: string): { o: number; f: string } | null {
  try {
    const v = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { o?: unknown; f?: unknown }
    return typeof v.o === 'number' && Number.isInteger(v.o) && v.o >= 0 && typeof v.f === 'string' ? { o: v.o, f: v.f } : null
  } catch {
    return null
  }
}

/**
 * knowledge_list 纯函数(过滤+分页):全量行与 knowledgeList 同源;行序稳定(站名字母序),
 * 游标携带偏移+过滤指纹,满足「稳定 cursor」的 SHOULD。
 */
export function knowledgeListPage(entries: RawEntry[] | undefined, q: KnowledgeListQuery): KnowledgeListPage {
  const status = q.status?.trim().toLowerCase()
  const domain = q.domain?.trim().toLowerCase()
  const query = q.query?.trim().toLowerCase()
  const fp = filterFingerprint({ status: q.status, domain: q.domain, query: q.query })
  let offset = 0
  if (q.cursor !== undefined && q.cursor.length > 0) {
    const c = decodeCursor(q.cursor)
    if (c === null || c.f !== fp) throw new Error('cursor 无效或与当前过滤参数不匹配 / invalid cursor or filter mismatch')
    offset = c.o
  }
  const filtered = knowledgeList(entries).filter((row) => {
    if (status !== undefined && status.length > 0) {
      if (status === 'ok') { if (row.health !== undefined) return false } else if (row.health?.status !== status) return false
    }
    if (domain !== undefined && domain.length > 0 && row.domain?.toLowerCase() !== domain) return false
    if (query !== undefined && query.length > 0 && siteMatchRank(row.site, row, query, entries) < 0) return false
    return true
  })
  const limit = q.limit ?? MCP_LIST_PAGE_DEFAULT
  return {
    sites: filtered.slice(offset, offset + limit),
    total: filtered.length,
    ...(offset + limit < filtered.length ? { nextCursor: encodeCursor(offset + limit, fp) } : {}),
  }
}

export interface KnowledgeSearchResult {
  sites: KnowledgeSiteSummary[]
  /** 命中总数(含 limit 截掉的) */
  total: number
}

/** knowledge_search 纯函数:站名命中(rank 0)排最前,同级按站名字母序——确定性排序,不编相关度。 */
export function knowledgeSearch(entries: RawEntry[] | undefined, query: string, limit: number): KnowledgeSearchResult {
  const q = query.trim().toLowerCase()
  const scored: Array<{ row: KnowledgeSiteSummary; rank: number }> = []
  for (const row of knowledgeList(entries)) {
    const rank = siteMatchRank(row.site, row, q, entries)
    if (rank >= 0) scored.push({ row, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.row.site.localeCompare(b.row.site))
  return { sites: scored.slice(0, limit).map((x) => x.row), total: scored.length }
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

// ── ops 只读投影(C6:events-get / schedule-list / inbox-list 三 RPC 的最小事实投影) ──

/**
 * 事件台账读侧(面板 events-get RPC 同款逻辑:旧档 .1 在前、行形状逐行校验、脏行跳过、
 * 统一倒序输出)。文件不存在/无权限=空表不是错误(事件是旁路面,读失败绝不抛)。
 */
export function readEventRows(mainFile: string): McpEventRow[] {
  const rows: McpEventRow[] = []
  for (const file of [`${mainFile}.1`, mainFile]) { // 旧档在前:读侧统一倒序输出
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { continue /* 无档/无权限:跳过 */ }
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const v = JSON.parse(line) as unknown
        if (v === null || typeof v !== 'object') continue
        const o = v as Record<string, unknown>
        if (typeof o.at !== 'string' || typeof o.kind !== 'string' || typeof o.text !== 'string') continue
        rows.push({ at: o.at, kind: o.kind, text: o.text })
      } catch { /* 脏行跳过 */ }
    }
  }
  return rows.reverse() // 文件是追加序(旧→新),契约与面板 events-get 一致:最新在前
}

/** state.json 读侧(只取三键;读不到/形状不对返回空对象——ops 面是旁路,读失败绝不抛)。 */
export function readOpsState(stateFile: string): McpOpsState {
  try {
    const v = JSON.parse(readFileSync(stateFile, 'utf8')) as unknown
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {}
    const o = v as Record<string, unknown>
    const out: McpOpsState = {}
    if (Array.isArray(o.schedules)) out.schedules = o.schedules
    if (o.runHistory !== null && typeof o.runHistory === 'object' && !Array.isArray(o.runHistory)) out.runHistory = o.runHistory as Record<string, unknown[]>
    if (o.inboxFlags !== null && typeof o.inboxFlags === 'object' && !Array.isArray(o.inboxFlags)) out.inboxFlags = o.inboxFlags as Record<string, InboxRunFlag>
    return out
  } catch {
    return {}
  }
}

export interface McpEventsQuery {
  kind?: string
  since?: string
  limit?: number
}

export interface McpEventsResult {
  events: McpEventRow[]
  /** 过滤后命中总数(含 limit 截掉的更旧事件;截断时 total > events.length) */
  total: number
}

/** events_get 纯函数(kind 精确匹配;since 按时刻含端点;输入行序=最新在前,保持不重排)。 */
export function eventsPage(rows: McpEventRow[], q: McpEventsQuery): McpEventsResult {
  const kind = q.kind?.trim()
  const sinceMs = q.since !== undefined && q.since.trim().length > 0 ? Date.parse(q.since) : undefined
  const filtered = rows.filter((r) => {
    if (kind !== undefined && kind.length > 0 && r.kind !== kind) return false
    if (sinceMs !== undefined) {
      const atMs = Date.parse(r.at)
      // 时刻不可解析的行不能自证在阈值之后:排除(不猜)
      if (Number.isNaN(atMs) || atMs < sinceMs) return false
    }
    return true
  })
  const limit = q.limit ?? MCP_EVENTS_PAGE_DEFAULT
  return { events: filtered.slice(0, limit), total: filtered.length }
}

/** runHistory 行形状守卫(磁盘行不信任;receipt 形状不细校——inboxRunStatus 只读 .empty,垃圾形状自然落 false)。 */
function isHistoryRow(r: unknown): r is RunHistoryRow {
  return r !== null && typeof r === 'object'
    && typeof (r as { at?: unknown }).at === 'string'
    && typeof (r as { ok?: unknown }).ok === 'boolean'
    && typeof (r as { summary?: unknown }).summary === 'string'
}

/** 最近一次 run 的 typed 状态(行存盘序不保证,按 at 降序取头;无合法行=null,省键不编)。 */
function lastRunOf(rows: unknown): { at: string; status: RunInboxStatus } | null {
  if (!Array.isArray(rows)) return null
  const sorted = rows.filter(isHistoryRow).sort((a, b) => b.at.localeCompare(a.at))
  const head = sorted[0]
  return head !== undefined ? { at: head.at, status: inboxRunStatus(head) } : null
}

export interface McpScheduleSummary {
  id: string
  /** 任务命令行(runHistory 键是 id,展示需要 site) */
  site: string
  cron: string
  enabled: boolean
  source?: string
  lastRunAt?: string
  /** 最近一次 run 四态(与收件箱同口径);无 run 记录省键 */
  last?: { at: string; status: RunInboxStatus }
}

export interface McpSchedulesResult {
  schedules: McpScheduleSummary[]
  total: number
}

/**
 * schedules_get 纯函数(白名单投影):只出任务名/命令行/cron/enabled/source/lastRunAt/
 * 最近一次状态六面——watch/notify/profile/quietHours 等任务级旗标与 history 全文不外显,
 * 行形状不对跳过(不编不抛)。
 */
export function schedulesSummary(state: McpOpsState): McpSchedulesResult {
  const out: McpScheduleSummary[] = []
  const hist = state.runHistory ?? {}
  for (const s of Array.isArray(state.schedules) ? state.schedules : []) {
    if (s === null || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id.length === 0 || typeof o.site !== 'string' || typeof o.cron !== 'string' || typeof o.enabled !== 'boolean') continue
    const last = lastRunOf(hist[o.id])
    out.push({
      id: o.id,
      site: o.site,
      cron: o.cron,
      enabled: o.enabled,
      ...(typeof o.source === 'string' ? { source: o.source } : {}),
      ...(typeof o.lastRunAt === 'string' ? { lastRunAt: o.lastRunAt } : {}),
      ...(last !== null ? { last } : {}),
    })
  }
  return { schedules: out, total: out.length }
}

/** 摘要行截断(「不含正文全文」的落点):结论行超 MCP_SUMMARY_CLIP 截断加省略号。 */
const clipSummary = (s: string): string => (s.length > MCP_SUMMARY_CLIP ? `${s.slice(0, MCP_SUMMARY_CLIP)}…` : s)

export interface McpInboxEntrySummary {
  task: string
  site: string
  at: string
  status: RunInboxStatus
  /** 结论一行(截断版;回执与深链不外显) */
  summary: string
  read: boolean
  archived: boolean
  /** 归档来源:auto=无产出自动归档 / manual=面板或 ctl(省键=旧数据) */
  archivedBy?: 'manual' | 'auto'
}

export interface McpInboxSummary {
  /** 未读且未归档条数(归档不产生红点,inboxUnreadCount 同源) */
  unread: number
  counts: {
    total: number
    read: number
    archived: number
    status: Record<RunInboxStatus, number>
  }
  /** 最近 N 条摘要行(新→旧;N=MCP_INBOX_RECENT) */
  recent: McpInboxEntrySummary[]
}

/**
 * inbox_list 纯函数:条目合成与四态判定复用 runinbox.ts 既有纯函数(synthesizeRunInbox,
 * 与面板 inbox-list RPC 同一份逻辑),本层只做计数与摘要投影——正文全文/回执/trace 深链
 * 不外显(深链指向本地 trace 面,外部 MCP 消费者没有对应读侧,给了就是悬空指针)。
 */
export function inboxSummary(state: McpOpsState): McpInboxSummary {
  const sites: Record<string, string> = {}
  for (const s of Array.isArray(state.schedules) ? state.schedules : []) {
    if (s === null || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    if (typeof o.id === 'string' && o.id.length > 0 && typeof o.site === 'string') sites[o.id] = o.site
  }
  const entries = synthesizeRunInbox({
    runHistory: (state.runHistory ?? {}) as Record<string, RunHistoryRow[]>,
    sites,
    flags: state.inboxFlags ?? {},
  })
  const statusCounts: Record<RunInboxStatus, number> = { ok: 0, fail: 0, skip: 0, empty: 0 }
  for (const e of entries) statusCounts[e.status]++
  return {
    unread: inboxUnreadCount(entries),
    counts: {
      total: entries.length,
      read: entries.filter((e) => e.read).length,
      archived: entries.filter((e) => e.archived).length,
      status: statusCounts,
    },
    recent: entries.slice(0, MCP_INBOX_RECENT).map((e) => ({
      task: e.task,
      site: e.site,
      at: e.at,
      status: e.status,
      summary: clipSummary(e.summary),
      read: e.read,
      archived: e.archived,
      ...(e.archivedBy !== undefined ? { archivedBy: e.archivedBy } : {}),
    })),
  }
}

/** 工具 content 块:text 正文 + resource_link 资源指引(2025-06-18 tools 章 MAY;宿主投影为一行文本,已核无害)。 */
type ToolContent = Array<
  | { type: 'text'; text: string }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string; description?: string }
>

const toolError = (text: string): { content: ToolContent; isError: true } => ({ content: [{ type: 'text', text }], isError: true })

/**
 * tools/call 派发(未知工具抛错,由 JSON-RPC 层收成 -32602;工具级失败走 isError 结果)。
 * 参数校验:status/limit/query 形态错回工具级 isError(同 knowledge_get 非法站名先例);
 * 游标无效走抛错路径——分页章「无效 cursor SHOULD -32602」,由 tools/call 的 catch 收口。
 */
function callTool(name: string, args: Record<string, unknown>, deps: McpToolDeps): { content: ToolContent; structuredContent?: unknown; isError?: boolean } {
  // ops 门控(call 与 list 同一开关):未开 ops 面时 ops 三工具如实报「未注册」并给开法指引,
  // 不走下方工具体(默认不注册,C6 规格行;错误是工具结果层 isError,协议层照常回 200)
  if (OPS_TOOL_NAMES.has(name) && deps.opsTools !== true) {
    return toolError(`工具「${name}」未注册:ops 只读面默认不注册(C6 规格「--caps 门控」),设 env DSH_OPENCLI_MCP_CAPS=ops(或 all)并重载插件后可用 / tool not registered: ops surface is opt-in via env DSH_OPENCLI_MCP_CAPS=ops`)
  }
  if (name === 'knowledge_list') {
    const status = args.status === undefined ? undefined : String(args.status)
    if (status !== undefined && !MCP_KNOWN_HEALTH_STATUSES.includes(status)) {
      return toolError(`status 非法,合法值 ${MCP_KNOWN_HEALTH_STATUSES.join('/')}:${JSON.stringify(args.status ?? null)} / invalid status`)
    }
    const limit = args.limit === undefined ? MCP_LIST_PAGE_DEFAULT : Number(args.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MCP_LIST_MAX_LIMIT) {
      return toolError(`limit 需为 1-${MCP_LIST_MAX_LIMIT} 的整数 / limit must be an integer in 1-${MCP_LIST_MAX_LIMIT}`)
    }
    const page = knowledgeListPage(deps.entries, {
      ...(status !== undefined && status.trim().length > 0 ? { status } : {}),
      ...(args.domain !== undefined && String(args.domain).trim().length > 0 ? { domain: String(args.domain) } : {}),
      ...(args.query !== undefined && String(args.query).trim().length > 0 ? { query: String(args.query) } : {}),
      limit,
      ...(typeof args.cursor === 'string' && args.cursor.length > 0 ? { cursor: args.cursor } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(page.sites, null, 2) }],
      structuredContent: { sites: page.sites, total: page.total, ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}) },
    }
  }
  if (name === 'knowledge_search') {
    const query = String(args.query ?? '').trim()
    if (query.length === 0) return toolError('query 必填(非空关键词:站名/域名/命令名/命令说明/坑文本片段) / query is required')
    const limit = args.limit === undefined ? MCP_SEARCH_PAGE_DEFAULT : Number(args.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MCP_LIST_MAX_LIMIT) {
      return toolError(`limit 需为 1-${MCP_LIST_MAX_LIMIT} 的整数 / limit must be an integer in 1-${MCP_LIST_MAX_LIMIT}`)
    }
    const r = knowledgeSearch(deps.entries, query, limit)
    return { content: [{ type: 'text', text: JSON.stringify(r.sites, null, 2) }], structuredContent: { sites: r.sites, total: r.total } }
  }
  if (name === 'knowledge_get') {
    const site = String(args.site ?? '').trim()
    if (site.length === 0 || !/^[\w@.-]{1,64}$/.test(site)) {
      return toolError(`站点名非法(如 weibo):${JSON.stringify(args.site ?? null)} / invalid site name`)
    }
    const r = knowledgeCard(site, deps.entries)
    if (r === null) {
      return toolError(`没有 ${site} 的知识(健康表/坑表/目录都没有——宁可不给也不编造) / no knowledge for ${site}`)
    }
    const structured = { site: r.card.site, uri: knowledgeResourceUri(r.card.site), commandCount: r.card.commandCount, pitfallCount: r.card.pitfalls.length, ...(r.card.health !== undefined ? { health: r.card.health } : {}) }
    const content: ToolContent = [{ type: 'text', text: r.markdown }]
    // resource_link(规范 MAY):把消费者引到 resources 面同一张卡。只给目录内站点——降格卡
    // (只有健康/坑表)在 resources/read 侧没有目录数据,给资源链接等于发悬空 URI(宿主内 seam 读会抛)
    if (r.card.commandCount > 0) {
      content.push({ type: 'resource_link', uri: knowledgeResourceUri(r.card.site), name: `${r.card.site} 站点知识卡 · site knowledge card`, mimeType: 'text/markdown' })
    }
    return { content, structuredContent: structured }
  }
  if (name === 'events_get') {
    const kind = args.kind === undefined ? undefined : String(args.kind)
    const since = args.since === undefined ? undefined : String(args.since)
    if (since !== undefined && since.trim().length > 0 && Number.isNaN(Date.parse(since))) {
      return toolError(`since 非法,需可解析时刻(ISO 8601,如 2026-11-16T00:00:00Z):${JSON.stringify(args.since ?? null)} / invalid since`)
    }
    const limit = args.limit === undefined ? MCP_EVENTS_PAGE_DEFAULT : Number(args.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MCP_EVENTS_MAX_LIMIT) {
      return toolError(`limit 需为 1-${MCP_EVENTS_MAX_LIMIT} 的整数 / limit must be an integer in 1-${MCP_EVENTS_MAX_LIMIT}`)
    }
    const rows = deps.events ?? readEventRows(mcpEventsFile())
    const r = eventsPage(rows, {
      ...(kind !== undefined && kind.trim().length > 0 ? { kind } : {}),
      ...(since !== undefined && since.trim().length > 0 ? { since } : {}),
      limit,
    })
    return { content: [{ type: 'text', text: JSON.stringify(r.events, null, 2) }], structuredContent: { events: r.events, total: r.total } }
  }
  if (name === 'schedules_get' || name === 'inbox_list') {
    const state = deps.opsState ?? readOpsState(mcpStateFile())
    if (name === 'schedules_get') {
      const r = schedulesSummary(state)
      return { content: [{ type: 'text', text: JSON.stringify(r.schedules, null, 2) }], structuredContent: { schedules: r.schedules, total: r.total } }
    }
    const r = inboxSummary(state)
    return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r }
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
      // instructions 按实际注册面组装:ops 未开就不预告 ops 工具(stale tool list 防线,#13396)
      const p = (msg.params ?? {}) as Record<string, unknown>
      const requested = typeof p.protocolVersion === 'string' && p.protocolVersion.length > 0 ? p.protocolVersion : MCP_PROTOCOL_VERSION
      const opsOn = deps.opsTools === true
      return reply({
        protocolVersion: requested === MCP_PROTOCOL_VERSION ? requested : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dsh-opencli', title: 'dsh-opencli 站点知识', version: PLUGIN_VERSION },
        instructions: '站点知识读侧(只读,无写工具):先 knowledge_search 按关键词找站,或 knowledge_list 带 status/domain/query 过滤分页浏览(默认分页,别全量拉),再 knowledge_get 取单站知识卡。' + (opsOn
          ? '运行状态读侧(ops 面):events_get(带 kind/since 查事件台账)/schedules_get(定时任务清单)/inbox_list(收件箱摘要)——都是只读投影,写操作走面板/审批门。'
          : '') + 'Read-side only. No write tools.',
      })
    }
    case 'notifications/initialized':
      return reply({}) // 通知:id 缺省,reply 恒 null
    case 'ping':
      return reply({})
    case 'tools/list':
      // 默认只注册 knowledge 三件套;ops 三工具经 caps 门控显式开启(C6 规格行「--caps 门控、
      // 默认不注册」,mcpVisibleTools 留痕),list 与 call 同一开关——不出现「list 不给 call 能用」
      return reply({ tools: mcpVisibleTools(deps.opsTools === true) })
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

/**
 * Host 白名单(2025-06-18 transports 章 Security Warning MUST:DNS 重绑定防护)。
 * 只看主机名段、端口不参与(重绑定攻击的特征是 Host 为攻击者域名);本端点只绑
 * 127.0.0.1,非回环 Host 本就到不了,白名单是把防线立在解析之前(fail-closed:缺 Host 也拒)。
 */
function loopbackHostOk(hostHeader: string): boolean {
  const h = hostHeader.trim().toLowerCase()
  const name = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0] ?? ''
  return name === '127.0.0.1' || name === 'localhost' || name === '::1' || name === '[::1]'
}

/**
 * Origin 同源判定:与请求 Host 的 host:port 完全一致(localhost 与 127.0.0.1 按浏览器
 * 同源语义互为不同源,如实从严);Origin: null(sandboxed iframe 等)解析失败即拒。
 * 非浏览器客户端(宿主/IDE/SDK)不发 Origin——缺省放行,发了就必须同源。
 */
function sameOriginOk(origin: string, hostHeader: string): boolean {
  try {
    return new URL(origin).host === hostHeader.trim().toLowerCase()
  } catch {
    return false
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * 读请求体(带上限;超限返回 null,调用方 413)。
 * 超限后不立刻 destroy——那会让 413 响应到不了客户端;改为继续收但丢弃(排干),
 * 直到 'end' 再回信。另设 8MB 硬顶:超得离谱视为滥用,掐线保进程(响应可能丢失,可接受)。
 * 导出仅测试用:四分支(正常拼包/超限排干/8MB 硬顶掐线/error 收 null)此前零覆盖,
 * 0.1.5 C6 随车补(复核 low#18 同车)。
 */
export function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
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
 * 单请求处理器(导出仅测试用):Host/Origin 门 → token 门 → 方法/路径白名单 → 体积门 →
 * 解析 → 协议版本头校验 → JSON-RPC → 200/202。
 * depsProvider 每请求调用一次:目录缓存是活的(adapterCache 刷新后新请求即见新目录)。
 */
export function makeRequestHandler(depsProvider: () => McpToolDeps, expectedToken: string, log?: (msg: string) => void): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void (async () => {
      try {
        // ⓪ Host/Origin 门(规范 MUST,对所有进连接生效——排在 token 之前,防线立在解析之前)
        const host = typeof req.headers.host === 'string' ? req.headers.host : ''
        if (!loopbackHostOk(host)) {
          writeJson(res, 403, { error: `Host 非法:本端点只服务 127.0.0.1/localhost(收到:${host || '无'}) / forbidden host(DNS rebinding protection)` })
          return
        }
        const originRaw = req.headers.origin
        const origin = Array.isArray(originRaw) ? originRaw.join(',') : originRaw
        if (typeof origin === 'string' && origin.length > 0 && !sameOriginOk(origin, host)) {
          writeJson(res, 403, { error: 'Origin 与请求 Host 不同源:本端点无网页场景,跨源请求一律拒绝 / cross-origin request rejected' })
          return
        }
        // ① token 门(daemon X-OpenCLI 门思路:无头/错头一律拒,在解析 body 之前);
        // 401 附 WWW-Authenticate challenge(RFC 6750,官方 SDK bearerAuth 同款形态——
        // 不冒充 OAuth:我方是静态 Bearer 非 OAuth 实现,这只是标准 challenge 的互操作形态)
        const bearer = bearerOf(req)
        if (bearer === null || !tokenMatches(bearer, expectedToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'WWW-Authenticate': 'Bearer error="invalid_token"' })
          res.end(JSON.stringify({ error: `unauthorized:缺少或不正确的 Authorization: Bearer <token>(token 见 ${mcpAuthFile()} 或 env DSH_OPENCLI_MCP_TOKEN)` }))
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
        // ④½ MCP-Protocol-Version 头校验(lifecycle 章 MUST:初始化后请求带不认识的版 → 400;
        // 缺头 → 按 init 协商版处理——stateless 下协商版恒为支持列表唯一成员,等价放行;
        // initialize 握手自身不验:此时还没有协商版,版本在 params 里走钳回逻辑)
        const declaredRaw = req.headers['mcp-protocol-version']
        const declared = (Array.isArray(declaredRaw) ? declaredRaw.join(',') : declaredRaw ?? '').trim()
        const parsedMessages = Array.isArray(parsed) ? parsed : [parsed]
        const isHandshake = parsedMessages.some((m) => m !== null && typeof m === 'object' && (m as { method?: unknown }).method === 'initialize')
        if (declared.length > 0 && !isHandshake && !MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(declared)) {
          writeJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: `不支持的 MCP-Protocol-Version:${declared}(本端点协商后恒为 ${MCP_PROTOCOL_VERSION})/ unsupported protocol version` } })
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
          // 批≤20 如实定位(2025-06-18 transports 章明文「POST body MUST be a single JSON-RPC
          // message」):批处理不是本版本要求,这里保留批仅是对 2025-03-26 时代消费方的超集兼容,
          // 非合规必需、不对外宣传。超出的条目逐条回 -32603 越界错(不静默吞——静默截断会让等
          // 这些 id 的客户端挂到超时,复核 low)
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
  /** 事件台账注入(测试/后续 index.ts 接线用;缺省走 mcpEventsFile() 读盘,每请求一次)。 */
  eventsProvider?: () => unknown
  /** state 快照注入(schedules/runHistory/inboxFlags;缺省走 mcpStateFile() 读盘)。 */
  stateProvider?: () => unknown
  /** ops 只读面注册开关(C6「--caps 门控、默认不注册」;缺省走 env DSH_OPENCLI_MCP_CAPS
   *  解析,未设=只注册 knowledge 三件套。测试显式传 true 锁全工具面)。 */
  opsTools?: boolean
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
  // ops 面注册开关:显式 opts 优先,缺省 env DSH_OPENCLI_MCP_CAPS 解析(默认关=C6「默认不注册」);
  // 启动期定死一次(与 token 同语义——中途改 env 需插件重载生效,消费面工具清单才不漂移)
  const opsTools = opts.opsTools ?? mcpOpsEnabled(mcpCapsRaw())
  // 目录缓存每请求经 provider 惰性取(entriesProvider 缺省=只有 health/pitfalls 静态读侧);
  // ops 数据同请求节奏:注入态用 provider 产物,否则读盘(env 指到临时文件=测试天然隔离)
  const handler = makeRequestHandler(() => {
    const raw = opts.entriesProvider?.()
    const deps: McpToolDeps = Array.isArray(raw) ? { entries: raw as RawEntry[], opsTools } : { opsTools }
    const evRaw = opts.eventsProvider?.()
    if (Array.isArray(evRaw)) deps.events = evRaw as McpEventRow[]
    const stRaw = opts.stateProvider?.()
    if (stRaw !== null && typeof stRaw === 'object' && !Array.isArray(stRaw)) deps.opsState = stRaw as McpOpsState
    return deps
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
    handle: { port: actualPort, url: actualUrl, token, tokenSource, tools: mcpVisibleTools(opsTools).map((t) => ({ name: t.name, description: t.description })), stop },
  }
}
