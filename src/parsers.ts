/**
 * 纯函数解析层:daemon 状态解析 / 适配器清单归一化 / systemPrompt 目录构建。
 * 零宿主依赖,全部可单测。
 * @module dsh-opencli/parsers
 */

import type { AdapterInfo, DaemonStatus } from './types.ts'

/** 从混杂文本里提取首个完整 JSON 对象(截取首个 '{' 到与其配对的 '}'),无则返回 null。
 *  opencli 2.0 的 JSON 输出后面常跟 "Extension update available" 横幅,直接 JSON.parse 会炸。 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/** 解析 `opencli daemon status` 文本输出。2.0 起是 JSON 信封(后面常跟升级横幅),1.x 是
 *  "Daemon: running" 风格文本;两形都接,归一到同一形状(extension 用 1.x 的字符串约定,
 *  多档案未选默认 = "connected, none selected",下游面板/doctor 逻辑零改动)。 */
export function parseDaemonStatus(text: string): DaemonStatus {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    const j = extractJsonObject(trimmed) as { ok?: boolean; data?: Record<string, unknown> } | null
    const d = j?.ok === true && j.data && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : null
    if (d !== null) {
      const extConnected = d.extensionConnected === true
      // 缺字段(extensionConnected === undefined)≠ 显式断连:parseDaemonStatus 归一层若把缺字段
      // 折成 'not connected',extensionState 的 explicitDown(只认显式否定,注释白纸黑字)会把
      // 还能跑的 browser_* 一刀切死——缺字段单独给 'unknown',由消费方各自决定语义
      const profilesRaw = Array.isArray(d.profiles) ? (d.profiles as Array<Record<string, unknown>>) : []
      const profiles = profilesRaw.length > 0
        ? profilesRaw.map((p) => `${String(p.contextId ?? '?')}${p.extensionVersion ? ' ' + String(p.extensionVersion) : ''}${p.extensionConnected === false ? ' (未连)' : ''}`).join(', ')
        : undefined
      const uptimeSec = typeof d.uptime === 'number' ? d.uptime : null
      const h = uptimeSec !== null ? Math.floor(uptimeSec / 3600) : null
      const m = uptimeSec !== null ? Math.floor((uptimeSec % 3600) / 60) : null
      return {
        running: d.running === true,
        version: typeof d.daemonVersion === 'string' ? d.daemonVersion : undefined,
        pid: typeof d.pid === 'number' ? d.pid : undefined,
        uptime: h !== null ? `${h}h ${m}m` : undefined,
        extension: d.extensionConnected === undefined ? 'unknown' : extConnected ? (d.profileRequired === true ? 'connected, none selected' : 'connected') : 'not connected',
        profiles,
        port: typeof d.port === 'number' ? d.port : undefined,
      }
    }
  }
  const get = (re: RegExp): string | undefined => text.match(re)?.[1]
  const portRaw = get(/Port:\s*(\d+)/)
  const pidRaw = get(/PID\s*(\d+)/)
  return {
    running: /Daemon:\s*running/.test(text),
    version: get(/Version:\s*(\S+)/),
    pid: pidRaw !== undefined ? Number(pidRaw) : undefined,
    uptime: get(/Uptime:\s*([^\n]+)/)?.trim(),
    extension: get(/Extension:\s*(\S+)/),
    profiles: get(/Profiles:\s*([^\n]+)/)?.trim(),
    port: portRaw !== undefined ? Number(portRaw) : undefined,
  }
}

interface RawCommandEntry {
  command?: string
  site?: string
  name?: string
  description?: string
  access?: string
  strategy?: string
  browser?: boolean
  domain?: string
}

/** 把 `opencli list --format json` 的命令级平铺数组按 site 聚合成适配器列表。 */
export function normalizeAdapterList(input: unknown): AdapterInfo[] {
  if (!Array.isArray(input)) return []
  const bySite = new Map<string, AdapterInfo & { _kinds: Set<string> }>()
  for (const raw of input as RawCommandEntry[]) {
    if (raw === null || typeof raw !== 'object') continue
    const { site, name } = splitCommandEntry(raw)
    if (site === undefined || site.length === 0) continue
    let a = bySite.get(site)
    if (a === undefined) {
      a = { name: site, domain: raw.domain, commandCount: 0, commands: [], sample: '', kinds: [], _kinds: new Set() }
      bySite.set(site, a)
    }
    if (a.domain === undefined && raw.domain !== undefined) a.domain = raw.domain
    const cmd = name ?? ''
    if (cmd.length > 0 && !a.commands.includes(cmd)) a.commands.push(cmd)
    if (raw.access !== undefined) a._kinds.add(raw.access)
    if (a.sample.length === 0 && raw.description !== undefined) a.sample = raw.description
  }
  const out: AdapterInfo[] = [...bySite.values()].map((a) => {
    const { _kinds, ...rest } = a
    void _kinds
    return { ...rest, commandCount: rest.commands.length, kinds: [...a._kinds].sort() }
  })
  out.sort((x, y) => y.commandCount - x.commandCount || x.name.localeCompare(y.name))
  return out
}

/** 构建 systemPrompt 里的适配器目录(限量,防上下文膨胀)。
 * 行形如 `- bilibili (28): search, video, up …` */
export function buildAdapterDirectory(adapters: AdapterInfo[], maxSites = 70, maxCmdsPerSite = 6): string {
  if (adapters.length === 0) return ''
  const totalCmds = adapters.reduce((n, a) => n + a.commandCount, 0)
  const head = `opencli 适配器目录:共 ${adapters.length} 个站点/${totalCmds} 条命令,经 site 工具调用(adapter=站点名,command=命令名)。目录(按命令数降序,最多列 ${maxSites} 个):`
  const lines = adapters.slice(0, maxSites).map((a) => {
    const cmds = a.commands.slice(0, maxCmdsPerSite).join(', ')
    const more = a.commandCount > maxCmdsPerSite ? ` …(共${a.commandCount})` : ''
    return `- ${a.name} (${a.commandCount}): ${cmds}${more}`
  })
  const tail = '未列出的站点同样可用;完整清单见设置面板「浏览器代理」。没有适配器的网站:用 browser_do(command=analyze/init/verify) 现场创作(见 SKILL.md)。'
  return [head, ...lines, tail].join('\n')
}

/** 查某条 site 命令的读写权限(审批门用);找不到返回 unknown(按写处理,安全默认)。 */
export function commandAccess(input: unknown, adapter: string, command: string): 'read' | 'write' | 'unknown' {
  if (!Array.isArray(input)) return 'unknown'
  for (const raw of input as RawCommandEntry[]) {
    if (raw === null || typeof raw !== 'object') continue
    const { site, name } = splitCommandEntry(raw)
    if (site !== adapter || name !== command) continue
    if (raw.access === 'write') return 'write'
    if (raw.access === 'read') return 'read'
    return 'unknown'
  }
  return 'unknown'
}

/** 有 whoami 命令的站点列表(登录态巡检用),按命令数降序稳定排序。 */
/** 从 command 字符串取 site/name,两代形状统一:1.x "site/cmd" 斜杠,2.0 "site cmd" 空格且无 site/name 字段。 */
function splitCommandEntry(raw: RawCommandEntry): { site?: string; name?: string } {
  let site = raw.site
  let name = raw.name
  if ((site === undefined || name === undefined) && typeof raw.command === 'string') {
    const slash = raw.command.split('/')
    if (slash.length >= 2 && slash[0] !== '' && slash[1] !== '') {
      if (site === undefined) site = slash[0]
      if (name === undefined) name = slash.slice(1).join('/')
    } else {
      const sp = raw.command.indexOf(' ')
      if (sp > 0) {
        if (site === undefined) site = raw.command.slice(0, sp)
        if (name === undefined) name = raw.command.slice(sp + 1)
      }
    }
  }
  return { site, name }
}

export function sitesWithWhoami(input: unknown, limit = 40): string[] {
  if (!Array.isArray(input)) return []
  const sites = new Map<string, number>()
  for (const raw of input as RawCommandEntry[]) {
    if (raw === null || typeof raw !== 'object') continue
    const { site, name } = splitCommandEntry(raw)
    if (site === undefined || name !== 'whoami') continue
    sites.set(site, (sites.get(site) ?? 0) + 1)
  }
  return [...sites.keys()].sort((a, b) => (sites.get(b) ?? 0) - (sites.get(a) ?? 0) || a.localeCompare(b)).slice(0, limit)
}

/** 审批门纯判定:host 侧 pre-execute 监听器消费。
 * - allow:放行(非 site 工具/审批门关闭/被禁用适配器/读命令/参数不完整)
 * - ask-write:已知写命令,弹出 dsh 原生审批
 * - ask-unknown:权限未知,按写审批(安全默认) */
export function approvalDecision(
  approvalOn: boolean,
  disabled: readonly string[],
  toolName: string,
  adapter: unknown,
  command: unknown,
  access: 'read' | 'write' | 'unknown',
): 'allow' | 'ask-write' | 'ask-unknown' {
  if (toolName !== 'site' || !approvalOn) return 'allow'
  if (typeof adapter !== 'string' || typeof command !== 'string' || adapter.length === 0 || command.length === 0) return 'allow'
  if (disabled.includes(adapter)) return 'allow'
  if (access === 'write') return 'ask-write'
  if (access === 'read') return 'allow'
  return 'ask-unknown'
}
