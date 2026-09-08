/**
 * zvec 存储层:一个 collection(kbchunks),emb 向量字段 + text(jieba FTS)+ file/chunk 标量字段。
 * 进程内、WAL 持久化;写单进程独占(本服务即唯一写者)。
 * 结果只含 fileId+chunkIdx,来源路径由服务层查注册表还原。
 * @module dsh-intelhub
 */

import { ZVecCreateAndOpen, ZVecOpen, ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecGetDefaultJiebaDictDir } from '@zvec/zvec'
import type { ZVecCollection } from '@zvec/zvec'
import type { SearchHit } from './types.ts'

/** 索引 schema 版本:字段集变更时 +1(目录名带版本,旧目录自动弃用)。 */
export const SCHEMA_VERSION = 2

/** 文件级标量(来自 frontmatter 或来源类型),写入每个块。 */
export interface ChunkScalars {
  author?: string
  stage?: string
  tag?: string
  src?: string
  date?: string
  type?: string
  likes?: number
}

export interface SearchFilterSpec {
  author?: string
  stage?: string
  tag?: string
  src?: string
  likesMin?: number
}

/** zvec 过滤表达式(单等号 + AND 大写,SQL 风格;&& 不被 lexer 接受);值内引号剥除。 */
export function buildFilter(f: SearchFilterSpec): string | undefined {
  const parts: string[] = []
  const q = (v: string): string => v.replace(/["\\]/g, '')
  if (f.author) parts.push(`author = "${q(f.author)}"`)
  if (f.stage) parts.push(`stage = "${q(f.stage)}"`)
  if (f.tag) parts.push(`tag = "${q(f.tag)}"`)
  if (f.src) parts.push(`src = "${q(f.src)}"`)
  if (f.likesMin !== undefined && Number.isFinite(f.likesMin)) parts.push(`likes >= ${Math.floor(f.likesMin)}`)
  return parts.length === 0 ? undefined : parts.join(' AND ')
}

/** 原始行:store 视角(fileId + 块号),还没有路径。 */
export interface RawHit {
  file: string
  chunk: number
  score: number
  text: string
}

export class KbStore {
  private col: ZVecCollection | null = null
  private openError: string | null = null

  constructor(
    private readonly dir: string,
    private readonly dim: number,
  ) {}

  /** 打开(或首次创建)collection;失败记录错误,后续调用返回空结果而不是抛。 */
  open(): void {
    const schema = new ZVecCollectionSchema({
      name: 'kbchunks',
      vectors: { name: 'emb', dataType: ZVecDataType.VECTOR_FP32, dimension: this.dim },
      fields: [
        {
          name: 'text',
          dataType: ZVecDataType.STRING,
          indexParams: {
            indexType: ZVecIndexType.FTS,
            tokenizerName: 'jieba',
            extraParams: JSON.stringify({ jieba_dict_dir: ZVecGetDefaultJiebaDictDir() }),
          },
        },
        { name: 'file', dataType: ZVecDataType.STRING },
        { name: 'chunk', dataType: ZVecDataType.INT64 },
        // frontmatter 标量(schema v2):过滤与展示用;空值用默认占位,永不匹配正向过滤
        { name: 'author', dataType: ZVecDataType.STRING },
        { name: 'stage', dataType: ZVecDataType.STRING },
        { name: 'tag', dataType: ZVecDataType.STRING },
        { name: 'src', dataType: ZVecDataType.STRING },
        { name: 'date', dataType: ZVecDataType.STRING },
        { name: 'type', dataType: ZVecDataType.STRING },
        { name: 'likes', dataType: ZVecDataType.INT64 },
      ],
    })
    try {
      this.col = ZVecCreateAndOpen(this.dir, schema)
    } catch {
      try {
        this.col = ZVecOpen(this.dir)
      } catch (err: unknown) {
        this.openError = err instanceof Error ? err.message : String(err)
        this.col = null
      }
    }
  }

  get error(): string | null {
    return this.openError
  }

  get ok(): boolean {
    return this.col !== null
  }

  /** 分诊:热更新某来源全部块的 stage 标量(zvec updateSync,不重嵌入)。 */
  updateStageFields(fileId: string, chunks: number, stage: string): void {
    if (this.col === null) throw new Error(this.openError ?? 'store 未打开')
    for (let i = 0; i < chunks; i++) {
      this.col.updateSync({ id: `${fileId}#${i}`, fields: { stage } } as never)
    }
  }

  insert(fileId: string, texts: string[], vectors: number[][], scalars?: ChunkScalars): void {
    if (this.col === null) throw new Error(this.openError ?? 'store 未打开')
    const sc = scalars ?? {}
    const docs = texts.map((text, i) => ({
      // zvec 文档 id 不允许 ':',用 '#' 分隔
      id: `${fileId}#${i}`,
      vectors: { emb: vectors[i] },
      fields: {
        text,
        file: fileId,
        chunk: i,
        author: sc.author ?? '',
        stage: sc.stage ?? '',
        tag: sc.tag ?? '',
        src: sc.src ?? '',
        date: sc.date ?? '',
        type: sc.type ?? '',
        likes: sc.likes ?? 0,
      },
    })) as never[]
    // zvec 单批写入上限 1024 条,超限整体报错(Too many docs)
    for (let i = 0; i < docs.length; i += 1024) this.col.insertSync(docs.slice(i, i + 1024) as never)
  }

  deleteFile(fileId: string): void {
    if (this.col === null) throw new Error(this.openError ?? 'store 未打开')
    // zvec filter 语法是单等号(类 SQL);双等号解析失败且只记日志不抛错
    this.col.deleteByFilterSync(`file = "${fileId}"`)
  }

  /**
   * 手动 RRF 混合检索:向量腿 + FTS 腿各自取 topk*2,按排名融合(0.75/0.25)。
   * 不用 zvec weighted 融合——余弦(0.7~0.9)与 BM25 原始分(1~15)尺度悬殊,
   * 直接加权会让 FTS 的弱词法匹配压过向量排序(真模型 E2E 实证);RRF 只看排名,天然免疫尺度差。
   */
  /** 手动 RRF 混合检索:向量腿 + FTS 腿各自取 topk*2,按排名融合(0.75/0.25)。
   *  不用 zvec weighted 融合——余弦(0.7~0.9)与 BM25 原始分(1~15)尺度悬殊,
   *  直接加权会让 FTS 的弱词法匹配压过向量排序(真模型 E2E 实证);RRF 只看排名,天然免疫尺度差。
   *  filter:标量预过滤(author/stage/tag/src/likes),两腿同滤。 */
  search(queryVec: number[] | null, query: string, topk: number, filter?: string): RawHit[] {
    if (this.col === null) return []
    const mapRow = (r: { score: number; fields: { text?: string; file?: string; chunk?: number } }): RawHit => ({
      file: String(r.fields.file ?? ''),
      chunk: Number(r.fields.chunk ?? 0),
      score: Number(r.score ?? 0),
      text: String(r.fields.text ?? ''),
    })
    const fetch = Math.max(topk * 2, 10)
    // zvec 拒绝显式 filter:undefined 键——仅在有过滤时携带
    const filterOpts = filter !== undefined && filter !== '' ? { filter } : {}
    const vecRows = queryVec === null
      ? []
      : (this.col.querySync({ fieldName: 'emb', vector: queryVec, topk: fetch, ...filterOpts } as never) as unknown[] as { score: number; fields: { text?: string; file?: string; chunk?: number } }[]).map(mapRow)
    let ftsRows: RawHit[] = []
    // FTS 查询语法字符(:'"()等)会让 lexer 炸掉——只留字母/数字/CJK/空白
    const ftsQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    if (ftsQuery !== '') {
      try {
        ftsRows = (this.col.querySync({ fieldName: 'text', fts: { queryString: ftsQuery }, topk: fetch, ...filterOpts } as never) as unknown[] as { score: number; fields: { text?: string; file?: string; chunk?: number } }[]).map(mapRow)
      } catch {
        /* FTS 语法异常不阻断向量腿 */
      }
    }

    const W_VEC = 0.75
    const W_FTS = 0.25
    const K = 60
    const merged = new Map<string, { hit: RawHit; rrf: number }>()
    const add = (rows: RawHit[], w: number): void => {
      rows.forEach((r, i) => {
        const key = `${r.file}#${r.chunk}`
        const cur = merged.get(key)
        const contrib = w / (K + i + 1)
        if (cur === undefined) merged.set(key, { hit: r, rrf: contrib })
        else cur.rrf += contrib
      })
    }
    add(vecRows, W_VEC)
    add(ftsRows, W_FTS)
    return [...merged.values()].sort((a, b) => b.rrf - a.rrf).slice(0, topk).map((m) => ({ ...m.hit, score: m.rrf }))
  }

  close(): void {
    if (this.col !== null) {
      try {
        this.col.closeSync()
      } catch {
        /* 关闭失败不影响进程退出 */
      }
      this.col = null
    }
  }
}
