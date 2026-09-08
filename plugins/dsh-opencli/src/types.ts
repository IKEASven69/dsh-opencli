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

/** settings RPC 结果(审批开关 + 禁用名单)。 */
export interface SettingsResult {
  ok: boolean
  approvalOn: boolean
  disabled: string[]
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

/** login-check RPC 结果。 */
export interface LoginCheckResult {
  ok: boolean
  checkedAt: string | null
  results: LoginCheckItem[]
  error?: string
}
