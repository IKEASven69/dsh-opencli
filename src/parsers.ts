/**
 * 纯函数解析层:daemon 状态解析 / 适配器清单归一化 / systemPrompt 目录构建。
 * 零宿主依赖,全部可单测。
 * @module dsh-opencli/parsers
 */

import type { AdapterInfo, DaemonStatus } from './types.ts'

/** 解析 `opencli daemon status` 文本输出。 */
export function parseDaemonStatus(text: string): DaemonStatus {
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
    const site = raw.site ?? raw.command?.split('/')[0]
    if (site === undefined || site.length === 0) continue
    let a = bySite.get(site)
    if (a === undefined) {
      a = { name: site, domain: raw.domain, commandCount: 0, commands: [], sample: '', kinds: [], _kinds: new Set() }
      bySite.set(site, a)
    }
    if (a.domain === undefined && raw.domain !== undefined) a.domain = raw.domain
    const cmd = raw.name ?? raw.command?.split('/')[1] ?? ''
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
