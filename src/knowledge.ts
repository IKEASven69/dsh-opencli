/**
 * 站点知识包:命令目录 + 失败签名恢复表 + 站点 pitfalls,三源合一。
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
export const PITFALLS: Record<string, string[]> = {
  xiaohongshu: [
    '全站风控最凶:V2EX 有多起自动化操作导致封号的实测案例,写操作(发布/评论/点赞)务必极低频',
    '上游近期反复修 xsec 签名与风控(#2474/#2470 umbrella)——搜索/笔记类命令可能随站点改版失效',
    '出现验证码或风控墙立即停止,冷却数分钟;定时监控类需求建议只读不写',
  ],
  weibo: [
    '热搜/时间线读操作相对稳定;发帖/删帖为写操作,走审批门且低频',
    '登录 cookie 有效期偏短,watch 类长期任务建议每周重登一次',
  ],
  bilibili: [
    '官方 API 相对宽容,读操作(热门/排行/搜索/字幕/AI 总结)稳定',
    '评论/关注为写操作走审批门;download 命令依赖本机 yt-dlp',
  ],
  zhihu: [
    '未登录可读部分内容,完整数据需登录态',
    '连续翻页/高频搜索易触发反爬,命令间留间隔',
  ],
  douban: ['广播/小组内容需登录态;标记类写操作走审批门'],
  taobao: [
    '交易类站点:add-cart 等涉及规格选择的命令易因页面改版失效(#2428)',
    '**任何支付/下单环节不得自动化**——写操作全部人工确认',
  ],
  jd: ['交易类站点,同淘宝:写操作全部人工确认,勿自动化支付环节'],
  twitter: ['国际站点,IP 敏感;登录态与代理环境强相关'],
  youtube: [
    '站点改版频繁(播放列表结构迁移曾致 EMPTY_RESULT #2497)——空结果先怀疑改版而非登录',
    'download 依赖 yt-dlp',
  ],
  reddit: ['未登录可读大部分内容;高频请求易 429,冷却后再试'],
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
  return {
    site: norm,
    ...(domain !== undefined ? { domain } : {}),
    generatedAt,
    commandCount: commands.length,
    commands,
    pitfalls: PITFALLS[norm] ?? [],
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
