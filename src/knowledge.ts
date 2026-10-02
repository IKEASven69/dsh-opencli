/**
 * 站点知识包:命令目录 + 失败签名恢复表 + 站点 pitfalls + 站点健康度,四源合一。
 * 背景:上游 #2539(2026-09-24)砍掉站点地图与外部 CLI hub,站点知识分发出现官方真空;
 * browser-use #5841(10 评论)证明"每次会话从零重学站点"是被正式提案的痛点——
 * 本模块让 agent 进站点前先读一张"地形图",而不是现场试错。零宿主依赖,可单测。
 * @module dsh-opencli/knowledge
 */

/** opencli list --format json 的命令级条目(与 parsers.RawCommandEntry 同形,此处独立声明避免跨层依赖)。 */
export interface RawEntry {
  command?: string
  site?: string
  name?: string
  description?: string
  access?: string
  domain?: string
}

export interface SiteKnowledge {
  site: string
  domain?: string
  generatedAt: string
  commandCount: number
  commands: Array<{ name: string; access: string; description: string }>
  /** 站点已知坑(人工种子,随版本维护;通用站无则空) */
  pitfalls: string[]
  /** 站点健康度(上游 issue 实测汇总;不在表内的站默认正常,不展示) */
  health?: SiteHealth
}

/** 站点健康度状态:degraded=受损(核心命令失效) / notice=注意(小问题) / unsupported=未支持(无适配器)。 */
export type SiteHealthStatus = 'degraded' | 'notice' | 'unsupported'

export interface SiteHealth {
  status: SiteHealthStatus
  /** 上游 issue 摘要(如 "#2562 captcha 重定向(search)") */
  issues: string[]
  /** 数据采集日期(ISO 日期) */
  updated: string
}

/** 状态→中文标签(渲染用;未知状态原样透出,不编造)。 */
export const SITE_HEALTH_STATUS_LABELS: Record<string, string> = {
  degraded: '受损',
  notice: '注意',
  unsupported: '未支持',
}

/** 失败签名→含义→恢复动作(与 index.verifyResult 的规则层同源;agent 拿到失败输出时按签名自救)。 */
export const FAILURE_SIGNATURES: Array<{ pattern: string; meaning: string; recovery: string }> = [
  { pattern: 'EMPTY_RESULT / NO_DATA', meaning: '命令成功但站点返回空——多为未登录或站点改版', recovery: '`opencli <site> login` 后用 whoami 验证;仍空则换命令或 browser_* 浏览器兜底' },
  { pattern: 'AUTH_REQUIRED / NOT_LOGGED_IN / 请先登录', meaning: '登录态失效或被判未登录(部分站风控误报)', recovery: '先 `opencli <site> whoami` 确认;真失效再 login' },
  { pattern: 'RATE_LIMITED / 429', meaning: '请求过频被限流', recovery: '冷却 ≥2 分钟再试;定时任务已自动风控退避(120s)' },
  { pattern: 'NAVIGATION_REJECTED', meaning: '页面拒绝导航——偶发为时序,持续为扩展/浏览器状态异常', recovery: '重试一次;持续出现跑 `opencli doctor` 检查扩展连接' },
  { pattern: '验证码 / captcha / Verifying your browser / Just a moment', meaning: '风控墙(软封禁)', recovery: '停止自动化,人工过盾;**降低频率**,写操作务必低频' },
  { pattern: '{"error": ...}', meaning: '命令执行错误(结构化错误 JSON)', recovery: '读 error 字段定位;browser 兜底' },
]

/**
 * 顶部站点 pitfalls 种子(人工维护;来源:PM-RESEARCH-20260925 封号案例/上游风控 commit/适配器描述)。
 * 通用站点不在表内则 pitfalls 为空——宁可空也不编造。
 */
/** 站点 pitfalls 数据外移至 knowledge/pitfalls.json(知识更新不动代码;esbuild 打包内联)。 */
import pitfallsData from '../knowledge/pitfalls.json'
export const PITFALLS: Record<string, string[]> = pitfallsData as Record<string, string[]>

/**
 * 站点健康度数据外移至 knowledge/health.json(同 pitfalls 机制)。
 * 来源:上游 GitHub issues 人工汇总(2026-10-03 实测:一周 12 个新 issue 里 7 个站点失效)。
 * 正常站点不入表——默认即正常,不为"没有消息"写数据。
 */
import healthData from '../knowledge/health.json'
export const SITE_HEALTH: Record<string, SiteHealth> = healthData as Record<string, SiteHealth>

/** 取站点健康度:不在表内/状态枚举非法返回 null(宁可不给也不给错)。 */
export function healthOf(site: string): SiteHealth | null {
  const h = SITE_HEALTH[site.trim().toLowerCase()]
  return h !== undefined && typeof h === 'object' && SITE_HEALTH_STATUS_LABELS[h.status] !== undefined
    ? { status: h.status, issues: Array.isArray(h.issues) ? h.issues.map(String) : [], updated: String(h.updated ?? '') }
    : null
}

/** 从 opencli 目录原始条目构建单站知识。目录无此站返回 null(不编造)。 */
export function buildKnowledge(site: string, entries: RawEntry[], generatedAt = new Date().toISOString()): SiteKnowledge | null {
  const norm = site.trim().toLowerCase()
  const mine = entries.filter((e) => (e.site ?? e.command?.split('/')[0] ?? '').toLowerCase() === norm)
  if (mine.length === 0) return null
  const commands = mine
    .map((e) => ({ name: e.name ?? e.command?.split('/')[1] ?? '', access: e.access ?? 'read', description: e.description ?? '' }))
    .filter((c) => c.name.length > 0)
    .sort((a, b) => a.access.localeCompare(b.access) || a.name.localeCompare(b.name))
  const domain = mine.find((e) => e.domain !== undefined)?.domain
  const health = healthOf(norm)
  return {
    site: norm,
    ...(domain !== undefined ? { domain } : {}),
    generatedAt,
    commandCount: commands.length,
    commands,
    pitfalls: PITFALLS[norm] ?? [],
    ...(health !== null ? { health } : {}),
  }
}

/** 渲染成 agent 可读的地形图 markdown。 */
export function renderKnowledgeMarkdown(k: SiteKnowledge): string {
  const lines: string[] = []
  lines.push(`# 站点知识卡:${k.site}${k.domain !== undefined ? `(${k.domain})` : ''}`)
  lines.push('')
  lines.push(`生成于 ${k.generatedAt} · ${k.commandCount} 条结构化命令。**优先用 site 命令,失败再退浏览器原语**(省 token、可验证)。`)
  if (k.pitfalls.length > 0) {
    lines.push('')
    lines.push('## ⚠️ 已知坑')
    for (const p of k.pitfalls) lines.push(`- ${p}`)
  }
  if (k.health !== undefined) {
    lines.push('')
    const label = SITE_HEALTH_STATUS_LABELS[k.health.status] ?? k.health.status
    const stale = k.health.updated !== '' ? `(数据 ${k.health.updated})` : ''
    lines.push(`## 🩺 站点健康度:${label}${stale}`)
    if (k.health.status === 'degraded') lines.push('上游 issue 实测核心命令失效——优先 browser_* 原语兜底,失败别反复重试。')
    for (const i of k.health.issues) lines.push(`- ${i}`)
  }
  lines.push('')
  lines.push('## 命令目录')
  for (const c of k.commands) {
    const flag = c.access === 'write' ? ' `[write]`' : ''
    lines.push(`- \`site ${k.site} ${c.name}\`${flag} — ${c.description}`)
  }
  lines.push('')
  lines.push('## 失败签名恢复表(输出匹配到签名时按 recovery 自救)')
  for (const f of FAILURE_SIGNATURES) lines.push(`- **${f.pattern}** → ${f.meaning}。恢复:${f.recovery}`)
  return lines.join('\n')
}
