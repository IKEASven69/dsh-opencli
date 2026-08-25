/**
 * 解析层单测:daemon 状态解析 / 适配器归一化 / systemPrompt 目录构建。
 * 样本取自 2026-08-25 本机 opencli v1.8.6 真实输出。
 */
import { describe, expect, it } from 'vitest'
import { buildAdapterDirectory, normalizeAdapterList, parseDaemonStatus } from '../src/parsers.ts'

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
