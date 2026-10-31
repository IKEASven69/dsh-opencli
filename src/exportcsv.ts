/**
 * 快照导出(0.4.6 补强⑦):采集数据"最后一公里"——CSV/TSV/剪贴板文本。
 *
 * 场景:用户盯了一周热榜,想拉进 Excel 看趋势。快照 JSON 躺在 ~/.dsh/opencli-snapshots/,
 * 让用户自己找文件不体面。输入=若干份快照 stdout(列表类 JSON),输出=规整表格文本。
 *
 * 解析纪律(与 diffsnap 同门):JSON 数组(或 {data/items/list/results} 包装)才结构化;
 * 非数组→原样文本单列(宁给原文不给臆造)。列集合=所有条目键的并集(缺失填空)。
 * @module dsh-opencli/exportcsv
 */

/** CSV 单元格转义:含逗号/引号/换行即加引号,内部引号翻倍(RFC 4180)。 */
export function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** 把条目流拼成 CSV 文本。 */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''
  const cols: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  const cell = (v: unknown): string => csvCell(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join('\r\n')
}

/** 解析单份快照 stdout:数组/包装→条目流;否则 null(调用方走原文单列)。 */
function parseItems(stdout: string): Array<Record<string, unknown>> | null {
  const s = stdout.trim()
  if (s.length === 0) return []
  try {
    const j = JSON.parse(s) as unknown
    if (Array.isArray(j)) return j.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    if (j !== null && typeof j === 'object') {
      for (const k of ['data', 'items', 'list', 'results']) {
        const v = (j as Record<string, unknown>)[k]
        if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
      }
    }
    return null
  } catch { return null }
}

export interface ExportInput {
  /** 快照批次,时间升序;at=采集时间,site=站点命令,stdout=原始输出 */
  snapshots: Array<{ at: string; site: string; stdout: string }>
}

export interface ExportResult {
  /** csv 文本(结构化批次)或原文汇总(非结构化) */
  text: string
  /** 结构化行数(0=非结构化,只有原文汇总) */
  rows: number
  /** 消耗的快照份数 */
  snapshots: number
}

/** 导出:多份快照 → 单表(结构化)或分节原文(非结构化)。 */
export function exportSnapshots(input: ExportInput): ExportResult {
  const structured: Array<Record<string, unknown>> = []
  const rawSections: string[] = []
  let usedStructured = 0
  for (const s of input.snapshots) {
    const items = parseItems(s.stdout)
    if (items === null) {
      rawSections.push(`# ${s.at} ${s.site}\n${s.stdout.trim()}`)
      continue
    }
    usedStructured++
    for (const it of items) structured.push({ _at: s.at, _site: s.site, ...it })
  }
  if (usedStructured > 0 && structured.length > 0) {
    return { text: toCsv(structured), rows: structured.length, snapshots: input.snapshots.length }
  }
  // 全部非结构化:原文分节(带出处,零改写)
  return { text: rawSections.join('\n\n'), rows: 0, snapshots: input.snapshots.length }
}
