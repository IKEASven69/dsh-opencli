/**
 * 采集报告渲染层(主线 B):多源采集结果 → 带出处的单文件 markdown。
 * 设计对标 dsh-fund-research 的溯源三件套:每个数据节带出处三元组(site 命令+时间+快照路径),
 * 尾部"数据源与缺口声明"显式列出失败/静默失败/缺席(绝不编数字)。
 * 确定性红线:内容全部来自采集原文,零模型介入;genAt 由调用方传入保证可测。
 * @module dsh-opencli/reports
 */

export type ReportStatus = 'ok' | 'fail' | 'silent' | 'suspect'

export interface ReportSource {
  /** 站点名(如 zhihu)。 */
  site: string
  /** 完整命令行(如 site zhihu hot)。 */
  command: string
  /** 执行时间(ISO)。 */
  at: string
  /** 采集原文(渲染层只截取,不改写)。 */
  text: string
  /** ok=成功;fail=命令失败;silent=exit0 但判定无效;suspect=判定可疑。 */
  status: ReportStatus
  /** 判定标注原文(如 "实测有效 P=0.93"),无判定省略。 */
  note?: string
  /** 出处定位(快照文件路径等),用于溯源。 */
  source?: string
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  ok: '✓ 成功',
  fail: '✗ 失败',
  silent: '⚠ 疑似静默失败',
  suspect: '⚠ 内容可疑',
}

/** 围栏安全:原文里的 ``` 降级为 `` ,避免破坏报告结构。 */
function fence(text: string, max = 2000): string {
  const clipped = text.length > max ? `${text.slice(0, max)}\n…(截断,全文见快照)` : text
  return clipped.replace(/```/g, '``')
}

export function buildReport(title: string, sources: ReportSource[], genAt: string): string {
  const okN = sources.filter((s) => s.status === 'ok').length
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`生成时间:${genAt} · 数据源 ${sources.length} 个(成功 ${okN})。全部数字与文本来自采集原文,零模型改写;逐节出处见下。`)
  lines.push('')
  lines.push('## 站点结果')
  for (const s of sources) {
    lines.push('')
    lines.push(`### ${s.site} — ${STATUS_LABEL[s.status]}${s.note !== undefined && s.note.length > 0 ? `(${s.note})` : ''}`)
    lines.push('')
    lines.push(`- 出处命令:\`${s.command}\` · 执行时间:${s.at}${s.source !== undefined && s.source.length > 0 ? ` · 快照:\`${s.source}\`` : ''}`)
    lines.push('')
    lines.push('```text')
    lines.push(fence(s.text))
    lines.push('```')
  }
  lines.push('')
  lines.push('## 数据源与缺口声明')
  const fails = sources.filter((s) => s.status === 'fail')
  const silents = sources.filter((s) => s.status === 'silent')
  const suspects = sources.filter((s) => s.status === 'suspect')
  lines.push(`- 成功 ${okN}/${sources.length};失败 ${fails.length};疑似静默失败 ${silents.length};内容可疑 ${suspects.length}(判定仅提示,原文未改)。`)
  for (const f of fails) lines.push(`- 失败:${f.site}(\`${f.command}\`)——原文首行:${f.text.split('\n')[0]?.slice(0, 120) || '(空)'}`)
  for (const f of silents) lines.push(`- 静默失败:${f.site}(\`${f.command}\`)——exit 0 但内容被判无效${f.note !== undefined ? `(${f.note})` : ''},该节数据不可信`)
  for (const f of suspects) lines.push(`- 可疑:${f.site}——判定提示复核,使用前请人工确认`)
  if (sources.length === 0) lines.push('- 声明:本次无任何数据源(全部缺席),报告只有骨架。')
  lines.push('')
  lines.push('> 生成于 dsh-opencli(登录态采集×出处可溯);每节围栏内为命令原始输出。')
  return lines.join('\n')
}
