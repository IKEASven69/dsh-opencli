/** dsh-zvec-kb 公共类型。 */

/** 文件在注册表里的条目。 */
export interface FileEntry {
  /** 内容 sha256,前 16 位,同时是 zvec 里的 file 字段值。 */
  id: string
  /** 导入时的绝对路径(规范化后)。 */
  path: string
  chunks: number
  status: 'indexing' | 'done' | 'failed'
  error?: string | null
  importedAt: number
  /** 原始文件字节哈希(前16位)——增量跳过校验用,与抽取文本哈希(id)分立 */
  rawHash?: string
}

/** 面板/工具共用的检索结果条目。 */
export interface SearchHit {
  /** 来源定位:相对显示路径#块序号。 */
  ref: string
  score: number
  text: string
}

/** kb_search 的返回(JSON 面)。 */
export interface SearchResult {
  ok: boolean
  mode: 'hybrid' | 'fts' | 'none'
  hits: SearchHit[]
  note?: string
  error?: string | null
}

export interface StatusResult {
  ok: boolean
  note?: string | null
  home: string
  files: number
  chunks: number
  indexing: number
  model: 'ready' | 'loading' | 'absent'
  dim: number | null
  error?: string | null
}

export interface ListResult {
  ok: boolean
  files: FileEntry[]
  indexing: number
  error?: string | null
}

export interface ImportResult {
  ok: boolean
  queued: number
  skippedUnchanged: number
  failedScan: string[]
  error?: string | null
}

export interface RemoveResult {
  ok: boolean
  removed: boolean
  error?: string | null
}

export interface SearchRpcResult extends SearchResult {}

/** 空态演示:导入样例文档并对一条陷阱查询并排返回 FTS 与混合结果。 */
export interface DemoResult {
  ok: boolean
  imported: boolean
  query: string
  fts: SearchHit[]
  hybrid: SearchHit[]
  note?: string
  error?: string | null
}

export type { FileEntry as KbFileEntry }
