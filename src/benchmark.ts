/**
 * 冒烟基准报告层(任务 C):固定站点集的一次性实测 → 单文件 markdown 成功率表。
 * 与 reports.ts 同一条确定性红线:结果/P/耗时全部来自真实执行记录,零模型改写;
 * genAt 由调用方传入保证可测。失败行如实进表(v2ex 直连超时也算基准数据,不粉饰)。
 * @module dsh-opencli/benchmark
 */

/** 默认基准集:无需登录的读命令。v2ex 在本机网络可能直连超时——如实进表即可,
 *  失败面本身就是基准要度量的东西,不许换站美化。 */
export const DEFAULT_BENCH: readonly string[] = ['juejin hot', '36kr hot', 'hackernews best', 'v2ex hot', 'bilibili hot']

/** 报告保留份数(轮转上限):冒烟基准会高频重跑,不设上限 ~/.dsh 会无限堆积。 */
export const BENCH_KEEP = 20

export interface BenchItem {
  /** 站点名(如 juejin)。 */
  site: string
  /** 站点命令(适配器+子命令,如 juejin hot)。 */
  command: string
  /** 命令是否成功(exit 0 且未被判定为静默失败)。 */
  ok: boolean
  /** 真实性 P(verifyResult);null=无判定(SystemOne 不可用等),不代表通过。 */
  p: number | null
  /** 耗时(毫秒)。 */
  ms: number
  /** 失败摘要(stderr 首选/静默失败原因);成功省略。 */
  error?: string
}

/** 表格单元格净化:换行折叠/竖线转义/截断——错误摘要里的换行会把 markdown 表格行拆断。 */
function cell(text: string, max = 80): string {
  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim().slice(0, max)
}

export function buildBenchmarkReport(items: BenchItem[], genAt: string): string {
  const okN = items.filter((x) => x.ok).length
  const lines: string[] = []
  lines.push('# 站点冒烟基准报告')
  lines.push('')
  lines.push(`生成时间:${genAt} · 站点 ${items.length} 个(成功 ${okN})。结果/P/耗时均为单次真机实测,零模型改写;逐行命令见尾部复现块。`)
  lines.push('')
  lines.push('| 站点 | 命令 | 结果 | 真实性 P | 耗时 ms | 错误摘要 |')
  lines.push('|---|---|---|---|---|---|')
  for (const it of items) {
    lines.push(`| ${cell(it.site, 30)} | \`${cell(it.command, 60)}\` | ${it.ok ? '✓ ok' : '✗ 失败'} | ${it.p === null ? '—' : it.p.toFixed(2)} | ${Math.max(0, Math.round(it.ms))} | ${it.ok || it.error === undefined ? '' : cell(it.error)} |`)
  }
  lines.push('')
  lines.push('## 复现命令')
  lines.push('')
  lines.push('```bash')
  for (const it of items) lines.push(`opencli ${it.command}`)
  lines.push('```')
  lines.push('')
  lines.push('> 免责:单次运行结果,网络/登录态/限流都影响成败与耗时(直连站点超时属正常波动);P 为 SystemOne/规则层判定,"—"为无判定;横向对比请同环境多轮取均值,勿以单轮下结论。')
  return lines.join('\n')
}

/** benchmark 工具的纯文本表(monospace 对齐,对话/终端直读)。列头用 ASCII:中文表头
 *  宽度按 2 码点计但终端渲染 4 列宽,与 ASCII 数据天然错位,纯文本表反而不可读。 */
export function renderBenchmarkTable(items: BenchItem[]): string {
  const flat = (s: string, max: number): string => s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  const rows = items.map((it) => ({
    site: flat(it.site, 20),
    cmd: flat(it.command, 24),
    ok: it.ok ? 'ok' : 'FAIL',
    p: it.p === null ? '-' : it.p.toFixed(2),
    ms: String(Math.max(0, Math.round(it.ms))),
    err: it.ok || it.error === undefined ? '' : flat(it.error, 48),
  }))
  const head = { site: 'site', cmd: 'cmd', ok: 'result', p: 'P', ms: 'ms', err: 'error' }
  const w = (k: keyof typeof head): number => Math.max(head[k].length, ...rows.map((r) => r[k].length))
  const okN = items.filter((x) => x.ok).length
  const out = [`冒烟基准:成功 ${okN}/${items.length}(P 为真实性判定,- 为无判定)`, '']
  if (rows.length > 0) {
    out.push(['site'.padEnd(w('site')), 'cmd'.padEnd(w('cmd')), 'result'.padEnd(w('ok')), 'P'.padStart(4), 'ms'.padStart(6), 'error'].join('  '))
    for (const r of rows) {
      out.push([r.site.padEnd(w('site')), r.cmd.padEnd(w('cmd')), r.ok.padEnd(w('ok')), r.p.padStart(4), r.ms.padStart(6), r.err].join('  '))
    }
  }
  return out.join('\n')
}
