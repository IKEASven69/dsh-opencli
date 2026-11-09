/**
 * dsh-opencli 共享类型:全部为可跨 RPC 的无损 JSON。
 * @module dsh-opencli/types
 */

/** daemon 状态(opencli daemon status 解析结果)。 */
export interface DaemonStatus {
  running: boolean
  version?: string
  pid?: number
  uptime?: string
  extension?: string
  profiles?: string
  port?: number
}

/** doctor 综合状态(undefined 一律用 null,保证跨 RPC 边界的 JSON 纯净)。 */
export interface OpencliStatus {
  ok: boolean
  bin: string | null
  version: string | null
  daemon: DaemonStatus | null
  adapterSites: number | null
  error?: string
}

/** 一个站点/应用适配器(由命令级 list JSON 聚合)。 */
export interface AdapterInfo {
  name: string
  domain?: string
  commandCount: number
  commands: string[]
  sample: string
  kinds: string[]
  disabled?: boolean
}

/** adapters RPC 结果。 */
export interface AdaptersResult {
  ok: boolean
  total: number
  adapters: AdapterInfo[]
  error?: string
}

/** 一条命令的详情(来自 opencli list --format json 的原始条目)。 */
export interface AdapterCommand {
  name: string
  description: string
  access: string
  example?: string
  argCount: number
}

/** adapter-detail RPC 请求。 */
export interface AdapterDetailRequest {
  name: string
}

/** adapter-detail RPC 结果。 */
export interface AdapterDetailResult {
  ok: boolean
  name: string | null
  domain: string | null
  commands: AdapterCommand[]
  error?: string
}

/** daemon-start RPC 结果(面板一键拉起)。 */
export interface DaemonStartResult {
  ok: boolean
  started: boolean
  message: string | null
}

/** settings RPC 结果(审批开关 + 禁用名单 + 自证与审计摘要)。 */
export interface SettingsResult {
  ok: boolean
  approvalOn: boolean
  disabled: string[]
  /** 当前构建(lib/index.js)的 sha256 前 16 位;读取失败为 null */
  sha256: string | null
  /** 近 7 天被拦截写操作次数 */
  audit7d: number
}

/** 一条被拦截的写操作(审批门审计)。 */
export interface AuditItem {
  at: string
  command: string
  reason: string
  mode: string
}

/** audit-list RPC 结果。 */
export interface AuditListResult {
  ok: boolean
  count7d: number
  items: AuditItem[]
}

/** logs-tail RPC 结果(opencli 未暴露日志文件时给诊断快照 + hint)。 */
export interface LogsTailResult {
  ok: boolean
  source: string | null
  lines: string[]
  hint?: string
}

/** 面板通知事件(调度失败等需要人工关注的事)。 */
export interface IngestEvent {
  at: string
  kind: string
  text: string
}

/** events-get RPC 结果(事件历史持久化,evidence-get 同款读侧投影):
 *  ~/.dsh/opencli-events.jsonl(+ 轮转档 .1)按新→旧返回;文件不存在=空表,不是错误。
 *  内存态 ingest-events 只有最近 30 条且不跨会话,本 RPC 是跨会话可回看的历史面。 */
export interface EventsGetResult {
  ok: boolean
  events: IngestEvent[]
  error?: string
}

/** approval-set RPC 请求/结果。 */
export interface ApprovalSetRequest {
  enabled: boolean
}

export interface ApprovalSetResult {
  ok: boolean
  enabled: boolean
}

/** adapter-disable RPC 请求/结果。 */
export interface AdapterDisableRequest {
  name: string
  disabled: boolean
}

export interface AdapterDisableResult {
  ok: boolean
  name: string | null
  disabled: boolean
}

/** 一条站点的登录态巡检结果。 */
export interface LoginCheckItem {
  site: string
  ok: boolean
  timedOut: boolean
  detail: string | null
}

/** 一条 browser 命令运行轨迹(recordTrace 落盘的 JSONL 行,跨 RPC 无损)。 */
export interface TraceLine {
  /** ISO 时间戳 */
  at: string
  /** 完整命令行(如 browser dsh open https://…) */
  cmd: string
  /** 退出码(0=成功) */
  exitCode: number
  /** 耗时毫秒 */
  ms: number
  /** 输出前 200 字(失败时 stderr 优先),复盘用 */
  outHead: string
}

/** trace-list / trace-get RPC 结果(traces 按请求约定的顺序返回)。 */
export interface TraceListResult {
  ok: boolean
  traces: TraceLine[]
  error?: string
}

/** login-check RPC 结果。 */
export interface LoginCheckResult {
  ok: boolean
  checkedAt: string | null
  results: LoginCheckItem[]
  error?: string
}

/** evidence-get RPC 单项(写操作证据包全文的结构化投影,画布证据卡数据源)。
 *  evidence-list 只回文件名元数据,面板证据卡要 command/verdict/双截图/免责行——本形状
 *  是宿主读全文后的投影;可选字段省键(与画布数据层"省字段"契约同款)。 */
export interface EvidenceGetItem {
  /** 证据 JSON 绝对路径 */
  file: string
  /** ISO 时间戳(文件名时间戳段还原) */
  at: string
  /** 站点适配器名(落盘 site 字段) */
  adapter: string
  /** 完整命令行(如 site zhihu comment) */
  command: string
  /** 三值结论:blocked=审批拒绝(命令从未执行)> fail=放行但退出码非 0 > ok=放行且成功 */
  verdict: 'ok' | 'fail' | 'blocked'
  /** 执行前截图绝对路径(无则省键) */
  beforeShot?: string
  /** 执行后截图绝对路径(无则省键) */
  afterShot?: string
  /** 截图局限免责声明(落盘 shotNote;近似取证说明,无则省键) */
  note?: string
}

/** evidence-get RPC 结果(新→旧;目录不存在=空表,不是错误)。 */
export interface EvidenceGetResult {
  ok: boolean
  items: EvidenceGetItem[]
}
