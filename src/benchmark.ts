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

/* ── canary 漂移监控(0.4.4 深化:插件自监控,dogfooding 即 QA)──────────────
 * 每晚定时跑 top-20 站只读命令,与上一次 canary 对比:新失败/恢复/持续失败一目
 * 了然——站点改版漂移当天可见,不再依赖上游 issue 标题猜健康度。 */

export const CANARY_TOP = 20
export const CANARY_KEEP = 14

/** 2.0 目录里的全局命名空间(不是站点):browser/adapter/daemon/auth 等的命令
 * (browser screenshot、daemon status、auth status)会被归一化成伪站点——canary
 * 拿它们当站点命令跑必挂(真机首跑 0/20 的元凶之一),门口排除。 */
export const RESERVED_NAMESPACES = new Set(['browser', 'adapter', 'daemon', 'auth', 'profile', 'doctor', 'extension', 'chrome', 'opencli', 'canary', 'benchmark'])

/** 从归一化适配器目录挑 canary 集:命令数 top-20 站,每站取第一条只读命令
 * (优先热榜语义:hot/latest/feed/trending/daily/best/home,命中即用,否则首条 read)。 */
export function pickCanaryCommands(adapters: Array<{ name: string; commands: string[] }>): string[] {
  // 只挑零参热榜语义命令:hot/latest/feed/… 这类天然免参;没有就跳过该站。
  // (真机首版用 kinds[i] 逐位过滤——但 kinds 是 Set 去重集合,与 commands 索引根本
  // 不对齐,board-create/ask 这类必带参命令混进 canary,20 站里 12 个 missingArgument)
  const hotWords = ['hot', 'latest', 'feed', 'trending', 'daily', 'best', 'home', 'frontpage', 'following', 'notifications', 'digest', 'recommend']
  const ranked = [...adapters].filter((a) => !RESERVED_NAMESPACES.has(a.name)).sort((a, b) => b.commands.length - a.commands.length || a.name.localeCompare(b.name))
  const out: string[] = []
  for (const a of ranked) {
    if (out.length >= CANARY_TOP) break
    const hit = a.commands.find((c) => hotWords.some((w) => c === w))
      ?? a.commands.find((c) => hotWords.some((w) => c.startsWith(w + '-') || c.endsWith('-' + w)))
    if (hit !== undefined) out.push(`${a.name} ${hit}`)
  }
  return out
}

/** 上次 canary 的站点→ok 快照(文件不存在/脏行跳过,绝不因旧档坏而炸本轮)。 */
export function parseCanarySnapshot(prevMd: string | null): Map<string, boolean> {
  const m = new Map<string, boolean>()
  if (prevMd === null) return m
  for (const line of prevMd.split('\n')) {
    const t = /^\| (\S+) \| `([^`]+)` \| (✓ ok|✗)/.exec(line.trim())
    if (t !== null) m.set(t[2]!, t[3] === '✓ ok')
  }
  return m
}

/** canary 报告:基准表 + 漂移三段(新失败/恢复/无变化),漂移段是重点放最前。 */
export function buildCanaryReport(items: BenchItem[], prev: Map<string, boolean>, genAt: string): string {
  const newFailures = items.filter((x) => !x.ok && prev.get(x.command) === true)
  const recovered = items.filter((x) => x.ok && prev.get(x.command) === false)
  const passN = items.filter((x) => x.ok).length
  const head = [
    '# 站点漂移 canary 报告',
    '',
    `生成时间:${genAt} · 站点 ${items.length} 个(通过 ${passN})。上一轮基线 ${prev.size} 条;全部数字来自采集原文,零模型改写。`,
    '',
  ]
  const drift = prev.size === 0
    ? ['## 漂移(首跑,建立基线)', '', '无上一轮可比——本报告即基线。', '']
    : [
        '## 漂移(vs 上一轮)', '',
        newFailures.length > 0 ? `**新失败 ${newFailures.length}:** ${newFailures.map((x) => `\`${x.command}\`(${x.error ?? 'exit≠0'})`).join('、')}` : '无新失败。',
        '',
        recovered.length > 0 ? `**恢复 ${recovered.length}:** ${recovered.map((x) => `\`${x.command}\``).join('、')}` : '无恢复。',
        '',
      ]
  // 明细复用基准报告的 markdown 表——快照解析器(parseCanarySnapshot)认这个行格式,
  // 用纯文本表会让下一轮永远解析不到基线、漂移段失效
  const body = buildBenchmarkReport(items, genAt).replace(/^# 站点冒烟基准报告.*\n/, '')
  return [...head, ...drift, '## 逐站明细', '', body].join('\n') + '\n'
}
