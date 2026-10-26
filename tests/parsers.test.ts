/**
 * 解析层单测:daemon 状态解析 / 适配器归一化 / systemPrompt 目录构建。
 * 样本取自 2026-08-25 本机 opencli v1.8.6 真实输出。
 */
import { describe, expect, it } from 'vitest'
import { approvalDecision, buildAdapterDirectory, commandAccess, extractJsonObject, normalizeAdapterList, parseDaemonStatus, sitesWithWhoami } from '../src/parsers.ts'

const RUNNING = `Daemon: running (PID 19616)
Version: v1.8.6
Uptime: 308h 55m
Extension: connected (v1.0.22)
Profiles: 62fd4dgs v1.0.22
Memory: 15.4 MB
Port: 19825`

const LIST_JSON = [
  {
    command: '12306/login', site: '12306', name: 'login', description: 'Open 12306 login and wait', access: 'write', domain: '12306.cn',
  },
  {
    command: '12306/me', site: '12306', name: 'me', description: 'Show account summary', access: 'read', domain: '12306.cn',
  },
  {
    command: 'bilibili/search', site: 'bilibili', name: 'search', description: 'Search videos', access: 'read', domain: 'bilibili.com',
  },
]

describe('parseDaemonStatus', () => {
  it('解析运行中的完整状态', () => {
    const d = parseDaemonStatus(RUNNING)
    expect(d.running).toBe(true)
    expect(d.version).toBe('v1.8.6')
    expect(d.pid).toBe(19616)
    expect(d.extension).toBe('connected')
    expect(d.port).toBe(19825)
    expect(d.uptime).toBe('308h 55m')
  })
  it('not running', () => {
    const d = parseDaemonStatus('Daemon: not running')
    expect(d.running).toBe(false)
    expect(d.port).toBeUndefined()
  })
})

describe('normalizeAdapterList', () => {
  it('按 site 聚合、去重命令、按命令数降序', () => {
    const a = normalizeAdapterList(LIST_JSON)
    expect(a).toHaveLength(2)
    expect(a[0].name).toBe('12306')
    expect(a[0].commandCount).toBe(2)
    expect(a[0].commands).toEqual(['login', 'me'])
    expect(a[1].name).toBe('bilibili')
    expect(a[0].domain).toBe('12306.cn')
  })
  it('非数组输入返回空', () => {
    expect(normalizeAdapterList(null)).toEqual([])
    expect(normalizeAdapterList({})).toEqual([])
  })
})

describe('buildAdapterDirectory', () => {
  it('包含站点行与使用提示', () => {
    const dir = buildAdapterDirectory(normalizeAdapterList(LIST_JSON))
    expect(dir).toContain('- 12306 (2): login, me')
    expect(dir).toContain('site 工具调用')
    expect(dir).toContain('bilibili (1): search')
  })
  it('限量生效', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `s${i}`, commandCount: 1, commands: ['x'], sample: '', kinds: [] }))
    const dir = buildAdapterDirectory(many, 70)
    expect(dir).toContain('- s69 (1): x')
    expect(dir).not.toContain('- s70 (1): x')
  })
})

describe('commandAccess(审批门)', () => {
  it('write/read 正确识别', () => {
    expect(commandAccess(LIST_JSON, '12306', 'login')).toBe('write')
    expect(commandAccess(LIST_JSON, '12306', 'me')).toBe('read')
    expect(commandAccess(LIST_JSON, 'bilibili', 'search')).toBe('read')
  })
  it('未知命令与非数组输入按 unknown(安全默认=按写审批)', () => {
    expect(commandAccess(LIST_JSON, 'zhihu', 'hot')).toBe('unknown')
    expect(commandAccess(null, '12306', 'login')).toBe('unknown')
    expect(commandAccess([null, 42, {}], '12306', 'login')).toBe('unknown')
  })
})

describe('sitesWithWhoami(登录巡检)', () => {
  it('只挑有 whoami 的站点并限量', () => {
    const withWhoami = [
      { site: 'zhihu', name: 'whoami', access: 'read' },
      { site: 'zhihu', name: 'hot', access: 'read' },
      { site: 'bilibili', name: 'whoami', access: 'read' },
      { site: '12306', name: 'me', access: 'read' },
    ]
    expect(sitesWithWhoami(withWhoami)).toEqual(['bilibili', 'zhihu'])
    expect(sitesWithWhoami(withWhoami, 1)).toEqual(['bilibili'])
    expect(sitesWithWhoami(null)).toEqual([])
  })
})

describe('approvalDecision(审批门判定)', () => {
  const on = true
  const off = false
  const noDisabled: string[] = []
  it('写命令 ask-write,读命令 allow,未知按写 ask-unknown', () => {
    expect(approvalDecision(on, noDisabled, 'site', 'zhihu', 'comment', 'write')).toBe('ask-write')
    expect(approvalDecision(on, noDisabled, 'site', 'zhihu', 'hot', 'read')).toBe('allow')
    expect(approvalDecision(on, noDisabled, 'site', 'newsite', 'fetch', 'unknown')).toBe('ask-unknown')
  })
  it('审批门关闭/非 site 工具/被禁用适配器/参数不完整 → allow', () => {
    expect(approvalDecision(off, noDisabled, 'site', 'zhihu', 'comment', 'write')).toBe('allow')
    expect(approvalDecision(on, noDisabled, 'opencli_open', 'zhihu', 'comment', 'write')).toBe('allow')
    expect(approvalDecision(on, ['zhihu'], 'site', 'zhihu', 'comment', 'write')).toBe('allow')
    expect(approvalDecision(on, noDisabled, 'site', undefined, 'comment', 'write')).toBe('allow')
    expect(approvalDecision(on, noDisabled, 'site', 'zhihu', 42, 'write')).toBe('allow')
    expect(approvalDecision(on, noDisabled, 'site', '', 'comment', 'write')).toBe('allow')
  })
})

// ── opencli 2.0 JSON 信封(parsers.test 2.0 样本取自 2026-10-17 v2.0.0 实测输出) ──

const DAEMON2 = `{"ok":true,"data":{"ok":true,"pid":4772,"uptime":158930.025038,"daemonVersion":"1.8.6","extensionConnected":true,"extensionVersion":"1.0.24","extensionCompatRange":">=1.7.0","contextId":"62fd4dgs","profileRequired":false,"profileDisconnected":false,"profiles":[{"contextId":"62fd4dgs","extensionConnected":true,"extensionVersion":"1.0.24","extensionCompatRange":">=1.7.0","pending":0,"lastSeenAt":1792374904516}],"pending":0,"commandResultUnknown":0,"memoryMB":14.6,"port":19825,"running":true,"stale":true}}

  Extension update available: v1.0.24 → v1.0.25
  Download: https://github.com/jackwener/opencli/releases`

describe('parseDaemonStatus(opencli 2.0 JSON 信封)', () => {
  it('JSON 信封+尾部升级横幅:running/version/port/uptime 归一,extension=connected', () => {
    const d = parseDaemonStatus(DAEMON2)
    expect(d.running).toBe(true)
    expect(d.version).toBe('1.8.6')
    expect(d.pid).toBe(4772)
    expect(d.port).toBe(19825)
    expect(d.extension).toBe('connected')
    expect(d.uptime).toBe('44h 8m')
    expect(d.profiles).toContain('62fd4dgs 1.0.24')
  })
  it('profileRequired=true → extension=connected, none selected(沿用 1.x 字符串约定,下游零改动)', () => {
    const j = extractJsonObject(DAEMON2) as { data: Record<string, unknown> }
    j.data.profileRequired = true
    const d = parseDaemonStatus(JSON.stringify(j))
    expect(d.running).toBe(true)
    expect(d.extension).toBe('connected, none selected')
  })
  it('extensionConnected=false → not connected;1.x 文本路径不受影响', () => {
    const j = extractJsonObject(DAEMON2) as { data: Record<string, unknown> }
    j.data.extensionConnected = false
    expect(parseDaemonStatus(JSON.stringify(j)).extension).toBe('not connected')
    expect(parseDaemonStatus(RUNNING).extension).toBe('connected')
  })
})

describe('extractJsonObject(2.0 JSON 后跟横幅的提取)', () => {
  it('首个配对大括号截取,字符串内的花括号/引号不干扰', () => {
    const j = extractJsonObject('{"a":{"b":"x{y}\\"z"},"tail":1}\n  banner text {"not":this}') as { a?: { b?: string }; tail?: number }
    expect(j?.tail).toBe(1)
    expect(j?.a?.b).toBe('x{y}"z')
  })
  it('无 JSON 返回 null', () => {
    expect(extractJsonObject('plain text only')).toBeNull()
  })
})

describe('normalizeAdapterList(opencli 2.0 无 site/name 字段形状)', () => {
  it('command 空格分隔("site cmd")也能归组出站点与命令;1.x 斜杠形状不回归', () => {
    const list2 = normalizeAdapterList([
      { command: '12306 login', description: 'Open 12306 login', access: 'write' },
      { command: '12306 me', description: 'Show account', access: 'read' },
      { command: 'juejin hot', description: 'Juejin hot list', access: 'read' },
    ])
    const byName = new Map(list2.map((a) => [a.name, a]))
    expect(byName.get('12306')!.commands).toEqual(['login', 'me'])
    expect(byName.get('12306')!.commandCount).toBe(2)
    expect(byName.get('juejin')!.commandCount).toBe(1)
    // 1.x 斜杠形状回归
    const list1 = normalizeAdapterList(LIST_JSON)
    expect(list1.find((a) => a.name === 'bilibili')!.commands).toEqual(['search'])
  })
})

describe('sitesWithWhoami(2.0 形状)', () => {
  it('"github whoami" 空格形态识别为 github 站;非 whoami 命令不计', () => {
    const sites = sitesWithWhoami([
      { command: 'github whoami', access: 'read' },
      { command: 'github login', access: 'write' },
      { command: 'zhihu hot', access: 'read' },
    ])
    expect(sites).toEqual(['github'])
  })
})
