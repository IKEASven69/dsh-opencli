/**
 * 快照差异比对(0.4.6 任务 C):相邻两次采集的结构化 diff。
 *
 * 场景:定时采集的真实目的是"盯变化"。watch 回答"出现了什么",diff 回答"变了什么"——
 * 新增/消失/位移三形态,正文可读、推送可发、报告可引。
 *
 * 解析策略(宁缺毋假):JSON 数组(热榜/搜索类站点命令的标准输出)→ 逐条比对;非数组/解析失败
 * → 折成"规模变化"摘要(字节+行数),绝不臆造条目。条目身份:显式 id/title/url 字段优先,
 * 退化到整行文本(归一空白)。
 * @module dsh-opencli/diffsnap
 */

/** 单条变化。 */
export interface DiffEntry {
  /** 变化形态:new=新增 gone=消失 moved=排名位移 */
  kind: 'new' | 'gone' | 'moved'
  /** 条目摘要(身份字段或归一文本,截 80 字) */
  title: string
  /** 位移:from→to(moved 专用) */
  from?: number
  to?: number
}

/** 一次 diff 的结果。 */
export interface SnapshotDiff {
  /** 是否结构化比对(否则 onlySummary=true 只给规模摘要) */
  structured: boolean
  added: number
  removed: number
  moved: number
  entries: DiffEntry[]
  /** 非结构化时的规模摘要 */
  summary?: string
}

/** 条目身份键:显式 id/title/url 字段优先,退化整行归一空白。 */
function entryKey(item: unknown): string | null {
  if (item === null || typeof item !== 'object') return typeof item === 'string' && item.trim().length > 0 ? item.trim().slice(0, 120) : null
  const o = item as Record<string, unknown>
  for (const k of ['id', 'title', 'url', 'name', 'text', 'content']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim().slice(0, 120)
    if (typeof v === 'number') return String(v)
  }
  // 无可辨识字段:整对象稳定序列化兜底(键序稳定)
  try {
    const s = JSON.stringify(o)
    return s.length <= 160 ? s : s.slice(0, 160)
  } catch { return null }
}

/** 条目展示名:优先 title/name,退化身份键。 */
function entryTitle(item: unknown, key: string): string {
  if (item !== null && typeof item === 'object') {
    const o = item as Record<string, unknown>
    for (const k of ['title', 'name']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim().length > 0) return (o[k] as string).trim().slice(0, 80)
    }
  }
  return key.slice(0, 80)
}

/** 相邻快照 diff:prev/next 为站点命令原始输出文本。 */
export function diffSnapshots(prev: string, next: string): SnapshotDiff {
  const parse = (t: string): { items: unknown[]; ok: boolean } => {
    const s = t.trim()
    if (s.length === 0) return { items: [], ok: true }
    try {
      const j = JSON.parse(s) as unknown
      if (Array.isArray(j)) return { items: j, ok: true }
      // {data:[...]} / {items:[...]} / {list:[...]} 常见包装
      if (j !== null && typeof j === 'object') {
        for (const k of ['data', 'items', 'list', 'results']) {
          const v = (j as Record<string, unknown>)[k]
          if (Array.isArray(v)) return { items: v, ok: true }
        }
      }
      return { items: [], ok: false }
    } catch { return { items: [], ok: false } }
  }
  const p = parse(prev)
  const n = parse(next)
  if (!p.ok || !n.ok) {
    const prevBytes = prev.length, nextBytes = next.length
    const prevLines = prev.split('\n').filter((l) => l.trim().length > 0).length
    const nextLines = next.split('\n').filter((l) => l.trim().length > 0).length
    return {
      structured: false,
      added: 0, removed: 0, moved: 0, entries: [],
      summary: `内容规模:${prevBytes}B/${prevLines} 行 → ${nextBytes}B/${nextLines} 行(输出非 JSON 数组,未做逐条比对)`,
    }
  }
  // 位置索引(键→首现位置;重键取首次,重复合并)
  const indexOf = (items: unknown[]): Map<string, number> => {
    const m = new Map<string, number>()
    items.forEach((it, i) => { const k = entryKey(it); if (k !== null && !m.has(k)) m.set(k, i) })
    return m
  }
  const pm = indexOf(p.items)
  const nm = indexOf(n.items)
  const entries: DiffEntry[] = []
  let added = 0, removed = 0, moved = 0
  // 新增:next 有 prev 无
  for (const [key, i] of nm) {
    if (!pm.has(key)) { added++; entries.push({ kind: 'new', title: entryTitle(n.items[i], key), to: i + 1 }); if (entries.length >= 20) break }
  }
  // 消失:prev 有 next 无
  if (entries.length < 20) {
    for (const [key, i] of pm) {
      if (!nm.has(key)) { removed++; entries.push({ kind: 'gone', title: entryTitle(p.items[i], key), from: i + 1 }); if (entries.length >= 20) break }
    }
  }
  // 位移:两处都有但排名变了(只报升/降 ≥3 位——前列微小互换是噪音)
  if (entries.length < 20) {
    for (const [key, ni] of nm) {
      const pi = pm.get(key)
      if (pi === undefined || Math.abs(pi - ni) < 3) continue
      moved++
      entries.push({ kind: 'moved', title: entryTitle(n.items[ni], key), from: pi + 1, to: ni + 1 })
      if (entries.length >= 20) break
    }
  }
  return { structured: true, added, removed, moved, entries }
}

/** 渲染成推送正文段落(纯文本,🔔/📊 由调用方拼头)。 */
export function renderDiffText(d: SnapshotDiff): string {
  if (!d.structured) return d.summary ?? ''
  if (d.added + d.removed + d.moved === 0) return '与上次相比无变化'
  const parts: string[] = []
  const news = d.entries.filter((e) => e.kind === 'new')
  const gones = d.entries.filter((e) => e.kind === 'gone')
  const moves = d.entries.filter((e) => e.kind === 'moved')
  if (d.added > 0) parts.push(`新增 ${d.added} 条${news.length > 0 ? ':' + news.slice(0, 5).map((e) => `#${e.to} ${e.title}`).join('、') : ''}`)
  if (d.removed > 0) parts.push(`消失 ${d.removed} 条${gones.length > 0 ? ':' + gones.slice(0, 5).map((e) => e.title).join('、') : ''}`)
  if (d.moved > 0) parts.push(`位移 ${d.moved} 条${moves.length > 0 ? ':' + moves.slice(0, 3).map((e) => `#${e.from}→#${e.to} ${e.title}`).join('、') : ''}`)
  return parts.join('\n')
}
