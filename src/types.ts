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
}

/** adapters RPC 结果。 */
export interface AdaptersResult {
  ok: boolean
  total: number
  adapters: AdapterInfo[]
  error?: string
}
