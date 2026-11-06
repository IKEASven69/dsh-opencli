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
  /** 身份键(0.4.7 B1:CSV diff 列按此回配行;entries 截 20 条不影响完整标记,用 diffItemMarks) */
  key?: string
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

/** 快照 stdout → 条目数组(数组/常见包装;非结构化 ok=false)。diffSnapshots 与 diffItemMarks 共用。 */
function parseItemArray(t: string): { items: unknown[]; ok: boolean } {
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

/** 条目身份键导出(0.4.7 B1:CSV diff 列按此回配行——与 diff 内部同一身份函数)。 */
export function itemKey(item: unknown): string | null {
  return entryKey(item)
}

/**
 * 逐条变化标记(0.4.7 B1 CSV diff 列):身份键 → 'new' | 'gone' | 'moved #from→#to'。
 * 与 diffSnapshots 同一套解析/身份/位移阈值(≥3 位),但**不求摘要不截断**——CSV 每行都要标。
 * 非结构化(任一侧解析失败)返回空 Map(该对不标,列留空)。
 */
export function diffItemMarks(prev: string, next: string): Map<string, string> {
  const p = parseItemArray(prev)
  const n = parseItemArray(next)
  const marks = new Map<string, string>()
  if (!p.ok || !n.ok) return marks
  const indexOf = (items: unknown[]): Map<string, number> => {
    const m = new Map<string, number>()
    items.forEach((it, i) => { const k = entryKey(it); if (k !== null && !m.has(k)) m.set(k, i) })
    return m
  }
  const pm = indexOf(p.items)
  const nm = indexOf(n.items)
  for (const [key, ni] of nm) {
    if (!pm.has(key)) { marks.set(key, 'new'); continue }
    const pi = pm.get(key)!
    if (Math.abs(pi - ni) >= 3) marks.set(key, `moved #${pi + 1}→#${ni + 1}`)
  }
  for (const key of pm.keys()) if (!nm.has(key)) marks.set(key, 'gone')
  return marks
}

/**
 * 按日聚合(0.4.7 B1 七天视图):[{day:'YYYY-MM-DD HH:MM',added,removed,moved}] →
 * 按日历日求和,近 7 天,新→旧。入参即 snap-diff-history 的 days(新→旧)。
 */
export function aggregateDaySums(
  days: Array<{ day: string; added: number; removed: number; moved: number }>,
): Array<{ day: string; added: number; removed: number; moved: number }> {
  const byDay = new Map<string, { day: string; added: number; removed: number; moved: number }>()
  for (const d of days) {
    const day = d.day.slice(0, 10)
    const cur = byDay.get(day) ?? { day, added: 0, removed: 0, moved: 0 }
    cur.added += d.added
    cur.removed += d.removed
    cur.moved += d.moved
    byDay.set(day, cur)
  }
  return [...byDay.values()].slice(0, 7)
}

/** 相邻快照 diff:prev/next 为站点命令原始输出文本。 */
export function diffSnapshots(prev: string, next: string): SnapshotDiff {
  const p = parseItemArray(prev)
  const n = parseItemArray(next)
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
    if (!pm.has(key)) { added++; entries.push({ kind: 'new', title: entryTitle(n.items[i], key), key, to: i + 1 }); if (entries.length >= 20) break }
  }
  // 消失:prev 有 next 无
  if (entries.length < 20) {
    for (const [key, i] of pm) {
      if (!nm.has(key)) { removed++; entries.push({ kind: 'gone', title: entryTitle(p.items[i], key), key, from: i + 1 }); if (entries.length >= 20) break }
    }
  }
  // 位移:两处都有但排名变了(只报升/降 ≥3 位——前列微小互换是噪音)
  if (entries.length < 20) {
    for (const [key, ni] of nm) {
      const pi = pm.get(key)
      if (pi === undefined || Math.abs(pi - ni) < 3) continue
      moved++
      entries.push({ kind: 'moved', title: entryTitle(n.items[ni], key), key, from: pi + 1, to: ni + 1 })
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

/** 一次采集的结构签名(适配器漂移预警用):与 countStructuredItems 的计数口径一致。 */
export interface DriftSample {
  /** 结构化条目数;null=非结构化/解析失败 */
  items: number | null
  /** 是否结构化输出(数组/常见包装) */
  structured: boolean
}

/** 单次骤降:新值≤旧值一半且旧值>0(0→0 是空页不是骤降;回升不是)。 */
function isShrink(a: DriftSample, b: DriftSample): boolean {
  return a.items !== null && b.items !== null && a.items > 0 && b.items <= a.items / 2
}

/**
 * 适配器漂移判定:快照 diff 反向用于故障发现——同一任务连续 3 次**同向**结果结构突变才报,
 * 防单次抖动。history 为按时间旧→新的结构签名环形缓冲(调用方存最近 5 次),样本 <4 不报。
 * 两种突变口径不同:骤降按迁移看(尾部 3 次迁移逐次腰斩——每次相对上次再腰斩才算连续,
 * 回升即断);翻转按状态看(尾部 3 个样本全非结构化=坏结构持续,每次运行都在确认漂移;
 * 且缓冲里它们之前须有结构化基线——从未输出过 JSON 的任务不是漂移,是本来就不结构化)。
 * 尾部一旦恢复(条目回升/重新结构化)立即不报。
 */
export function detectDrift(history: DriftSample[]): boolean {
  if (history.length < 4) return false
  const n = history.length
  if (isShrink(history[n - 4]!, history[n - 3]!) && isShrink(history[n - 3]!, history[n - 2]!) && isShrink(history[n - 2]!, history[n - 1]!)) return true
  if (!history[n - 1]!.structured && !history[n - 2]!.structured && !history[n - 3]!.structured) {
    return history.slice(0, n - 3).some((s) => s.structured)
  }
  return false
}
