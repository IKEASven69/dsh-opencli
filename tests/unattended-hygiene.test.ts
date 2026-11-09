/**
 * 无人值守采集卫生的服务级单测(真实 OpencliService / lib/index.js + 桩 shell):
 *  - 事件历史持久化:pushIngestEvent 追加落盘 + events-get 读回(新→旧/limit/脏行/轮转档/缺文件)
 *  - #59 装饰步:replay skipDecorative 跳过不执行不落轨迹;trace_replay 时间线〔装饰〕标注;轨迹 URL 参数脱敏
 *  - 留存预算:轨迹文件滚动淘汰(含当日档计数);快照任务级 keep
 *  - schedule-add 任务级字段校验与幂等补丁(keep/backoffMs/profile)
 *  - 回执深化:partial/unloaded/coverage 近似字段;E② profile 经 OPENCLI_PROFILE 透传 + 回执标注
 *  - 漂移兜底:adapter-drift 预警 + browser_* 兜底成功(degraded,并入本 tick 快照,会话用完即关)/失败(诚实降级)
 *  - 读写分频:写轨独立间隔(预约式,并发两写也错开),读不受拖累
 *  - 超时 cancel + 有界清理:seam 不响应 → exit 124 typed 信封;seam 自身 reject 照常上抛
 * 隔离:事件文件/轨迹/快照目录本文件独占临时路径;subprocess seam 禁用(绝不 spawn 真 CLI 碰真 daemon)。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '1.8.8\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v1.8.7\nPort: 19825\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: '[]' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: 'ok\n' }, stderr: { text: '' } }
  }
}
class StubTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}
class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type RunOut = { exitCode: number; stdout: string; stderr: string }
type HistRow = { at: string; ok: boolean; summary: string; receipt?: Record<string, unknown> }
type Priv = {
  ingestEventList: Array<{ at: string; kind: string; text: string }>
  eventsFile: string
  traceDir: string
  snapshotsBase: string
  schedules: Array<{ id: string; site: string; keep?: number; backoffMs?: number; profile?: string }>
  runHistory: Record<string, HistRow[]>
  usagePolicy: { minDelayMs: number; burst: number }
  lastWriteAt: number
  shotCapture: boolean
  pushIngestEvent: (kind: string, text: string) => void
  runOpencli: (...args: unknown[]) => Promise<RunOut>
  runSiteCommand: (siteCmd: string, id: string, opts?: { manual?: boolean }) => Promise<void>
  daemonStatus: () => Promise<unknown>
  domainOf?: (s: string) => Promise<string | null>
  runBrowserTraced?: (sess: string | undefined, argv: string[]) => Promise<RunOut>
  acquireGovernor: (k: 'read' | 'write') => Promise<void>
  releaseGovernor: (k: 'read' | 'write') => void
}

const tmp = (tag: string): string => path.join(os.tmpdir(), `dsh-opencli-test-${tag}-${process.pid}-${Date.now()}`)
let ctx: InstanceType<typeof Context>
let svc: OpencliService
const P = (): Priv => svc as unknown as Priv
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  // 本文件断言文件内容,三类落盘路径独占(vitest 同 pid 下其他文件共享 config 默认路径)
  process.env.DSH_OPENCLI_EVENTS_FILE = `${tmp('events-f-hyg')}.jsonl`
  process.env.DSH_OPENCLI_TRACE_DIR = tmp('traces-f-hyg')
  process.env.DSH_OPENCLI_SNAPSHOTS_DIR = tmp('snaps-f-hyg')
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  // subprocess seam 禁用(advanced.test.ts 同款):宿主真 seam 会 spawn 真 CLI 打到真 daemon/浏览器
  const reflect = (ctx as unknown as { reflect: { get: (p: string, f?: boolean) => unknown } }).reflect
  const origGet = reflect.get.bind(reflect)
  reflect.get = (name: string, flag?: boolean) => (name === 'subprocess' ? undefined : origGet(name, flag))
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  P().shotCapture = false
  // 健康预检桩:daemon 运行、版本稳定、扩展已连(不触发自愈/跳过分支)
  P().daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

/** 临时替换 runOpencli(调度链路的 site 命令出口),返回还原函数。 */
const stubRun = (fn: (...args: unknown[]) => Promise<RunOut>): (() => void) => {
  const orig = P().runOpencli
  P().runOpencli = fn
  return () => { P().runOpencli = orig }
}
const evLine = (text: string, kind = 'watch-hit'): string => JSON.stringify({ at: new Date().toISOString(), kind, text })

describe('事件历史持久化(pushIngestEvent → ~/.dsh/opencli-events.jsonl → events-get)', () => {
  it('测试隔离:事件文件指向临时路径,绝不写真实 ~/.dsh', () => {
    expect(P().eventsFile).toContain('dsh-opencli-test-events-f-hyg')
  })

  it('内存 newest-first 契约不变,同时整行追加落盘', () => {
    P().pushIngestEvent('watch-hit', 'evt-A')
    P().pushIngestEvent('snap-diff', 'evt-B')
    expect(P().ingestEventList[0]!.text).toBe('evt-B')
    const rows = fs.readFileSync(P().eventsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { at: string; kind: string; text: string })
    expect(rows.slice(-2).map((r) => r.text)).toEqual(['evt-A', 'evt-B'])
    expect(rows.at(-1)!.kind).toBe('snap-diff')
    expect(typeof rows.at(-1)!.at).toBe('string')
  })

  it('事件文本里的 URL 凭据参数在内存与落盘两处都已脱敏', () => {
    P().pushIngestEvent('watch-hit', '🔔 Watch 命中:xiaohongshu note https://x.com/n?token=SECRET9&q=1')
    expect(P().ingestEventList[0]!.text).toContain('token=[已脱敏]')
    const last = fs.readFileSync(P().eventsFile, 'utf8').trim().split('\n').at(-1)!
    expect(last).toContain('token=[已脱敏]')
    expect(last).toContain('q=1')
    expect(last).not.toContain('SECRET9')
  })

  it('events-get:缺文件=空表;新→旧;轮转档 .1 一并读且排在后;脏行/形状不对跳过;limit 钳制', async () => {
    const orig = P().eventsFile
    const f = `${tmp('events-get')}.jsonl`
    P().eventsFile = f
    try {
      expect(await svc.eventsGet({})).toEqual({ ok: true, events: [] })
      fs.writeFileSync(`${f}.1`, `${evLine('old-1')}\n${evLine('old-2')}\n`)
      fs.writeFileSync(f, `${evLine('new-1')}\nnot json\n${JSON.stringify({ at: 1, kind: 'x', text: 'bad-shape' })}\n${evLine('new-2')}\n`)
      expect((await svc.eventsGet({})).events.map((e) => e.text)).toEqual(['new-2', 'new-1', 'old-2', 'old-1'])
      expect((await svc.eventsGet({ limit: 2 })).events.map((e) => e.text)).toEqual(['new-2', 'new-1'])
      expect((await svc.eventsGet({ limit: -3 })).events).toHaveLength(1)
    } finally { P().eventsFile = orig }
  })

  it('落盘预算与 traces 同款:超 5MB 轮转为 .1,新事件写进新主档', () => {
    const orig = P().eventsFile
    const f = `${tmp('events-rot')}.jsonl`
    P().eventsFile = f
    try {
      fs.writeFileSync(f, 'x'.repeat(5 * 1024 * 1024 + 16))
      P().pushIngestEvent('daemon-flip', 'after-rotate')
      expect(fs.statSync(`${f}.1`).size).toBeGreaterThan(5 * 1024 * 1024)
      expect(fs.readFileSync(f, 'utf8').trim()).toContain('after-rotate')
    } finally { P().eventsFile = orig }
  })
})

describe('#59 装饰步(scroll/hover)标注与回放跳过 + 轨迹 URL 参数脱敏', () => {
  it('skipDecorative:装饰步跳过不执行、不落轨迹并如实标 skipped;不带旗标照常执行', async () => {
    const before = (await svc.traceList({})).traces.length
    expect(await svc.replay({ step: 'opencli_scroll down', skipDecorative: true })).toEqual({ ok: true, skipped: 'decorative' })
    expect((await svc.traceList({})).traces.length).toBe(before)
    expect((await svc.replay({ step: 'opencli_scroll down' })).ok).toBe(true)
    expect((await svc.traceList({})).traces.length).toBe(before + 1)
  })

  it('数据步骤带旗标也照常执行;轨迹落盘时 URL 凭据参数已脱敏、无关参数保留', async () => {
    const r = await svc.replay({ step: 'opencli_open https://example.com/p?token=SECRET&q=1', skipDecorative: true })
    expect(r.ok).toBe(true)
    expect(r.skipped).toBeUndefined()
    const t = (await svc.traceList({})).traces[0]!
    expect(t.cmd).toContain('token=[已脱敏]')
    expect(t.cmd).toContain('q=1')
    expect(t.cmd).not.toContain('SECRET')
  })

  it('trace_replay 时间线:装饰步行标〔装饰〕,表头给出条数与可跳过提示', async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('trace_replay')!
    const out = await tool.execute({})
    expect(out.text).toContain('〔装饰〕browser dsh scroll down')
    expect(out.text).toMatch(/〔装饰〕=只改视觉的 scroll\/hover 步 \d+ 条,回放可跳过/)
    expect(out.text).not.toContain('〔装饰〕browser dsh open')
  })
})

describe('留存预算(滚动淘汰)', () => {
  it('轨迹:当日新档创建时按日期序删最旧,总份数(含当日档与 .1 轮转档)≤上限;非轨迹文件不动', async () => {
    const dir = tmp('trace-keep')
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 1; i <= 12; i++) fs.writeFileSync(path.join(dir, `trace-202601${String(i).padStart(2, '0')}.jsonl`), '')
    fs.writeFileSync(path.join(dir, 'trace-20260101.jsonl.1'), '')
    fs.writeFileSync(path.join(dir, 'unrelated.txt'), '')
    const orig = P().traceDir
    P().traceDir = dir
    process.env.DSH_OPENCLI_TRACE_KEEP_FILES = '5'
    try {
      await svc.replay({ step: 'opencli_state' }) // 当日首条 → 新建当日档 → 触发淘汰
      const d = new Date()
      const today = `trace-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.jsonl`
      const left = fs.readdirSync(dir).filter((f) => f.startsWith('trace-')).sort()
      expect(left).toHaveLength(5)
      expect(left).toContain(today)
      expect(left).not.toContain('trace-20260101.jsonl')
      expect(fs.existsSync(path.join(dir, 'unrelated.txt'))).toBe(true)
    } finally {
      P().traceDir = orig
      delete process.env.DSH_OPENCLI_TRACE_KEEP_FILES
    }
  })

  it('快照:任务级 keep 生效(超出按时间序淘汰最旧);落盘 stdout 与 history 摘要已脱敏 URL 凭据', async () => {
    const site = `keep-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} hot`, cron: '0 9 * * *', keep: 5, notify: false })
    let n = 0
    const restore = stubRun(async () => { n++; return { exitCode: 0, stdout: `[{"u":"https://x.com/a?sid=SECRET${n}","n":${n}}]`, stderr: '' } })
    try {
      for (let i = 0; i < 7; i++) { await P().runSiteCommand(`site ${site} hot`, r.id!); await sleep(3) }
    } finally { restore() }
    const dir = path.join(P().snapshotsBase, r.id!)
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(5)
    const latest = JSON.parse(fs.readFileSync(path.join(dir, files.sort().at(-1)!), 'utf8')) as { stdout: string }
    expect(latest.stdout).toContain('sid=[已脱敏]')
    expect(latest.stdout).not.toContain('SECRET')
    expect(P().runHistory[r.id!]![0]!.summary).not.toContain('SECRET')
    await svc.scheduleRemove({ id: r.id! })
  })
})

describe('schedule-add 任务级字段(keep/backoffMs/profile)', () => {
  it('越界/非法直接报错(不静默吞);合法值落盘;同 site+cron 幂等补丁;profile off 清除', async () => {
    const site = `fld-${Date.now()}`
    expect((await svc.scheduleAdd({ site, cron: '0 9 * * *', keep: 3 })).ok).toBe(false)
    expect((await svc.scheduleAdd({ site, cron: '0 9 * * *', backoffMs: -1 })).ok).toBe(false)
    expect((await svc.scheduleAdd({ site, cron: '0 9 * * *', profile: 'bad name!' })).ok).toBe(false)
    const r = await svc.scheduleAdd({ site, cron: '0 9 * * *', keep: 20, backoffMs: 5000, profile: 'work' })
    expect(r.ok).toBe(true)
    const find = () => P().schedules.find((s) => s.id === r.id)
    expect(find()).toMatchObject({ keep: 20, backoffMs: 5000, profile: 'work' })
    expect((await svc.scheduleAdd({ site, cron: '0 9 * * *', profile: 'home' })).id).toBe(r.id)
    expect(find()!.profile).toBe('home')
    expect(P().schedules.filter((s) => s.site === site)).toHaveLength(1)
    await svc.scheduleAdd({ site, cron: '0 9 * * *', profile: 'off' })
    expect(find()!.profile).toBeUndefined()
    await svc.scheduleRemove({ id: r.id! })
  })
})

describe('回执深化 + E② profile 透传', () => {
  it('profile 经 OPENCLI_PROFILE 透传给 CLI;回执带 profile 与 #2766 partial/coverage 近似字段', async () => {
    const site = `pf-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} hot`, cron: '0 9 * * *', profile: 'work', notify: false })
    const envSeen: unknown[] = []
    const restore = stubRun(async (...args) => {
      envSeen.push(args[3])
      return { exitCode: 0, stdout: '[{"t":"a"},{"t":"b"}]', stderr: 'Showing 1-25 of 47 commands; rerun with --offset 25 for more.' }
    })
    try { await P().runSiteCommand(`site ${site} hot`, r.id!) } finally { restore() }
    expect(envSeen[0]).toEqual({ OPENCLI_PROFILE: 'work' })
    expect(P().runHistory[r.id!]![0]!.receipt).toMatchObject({ auth_state: 'ok', items: 2, partial: true, profile: 'work', stop_reason: 'truncated', remaining_cursor: 25 })
    await svc.scheduleRemove({ id: r.id! })
  })

  it('无 profile:不注入 env、回执无 profile 键;完整结构化 → stop_reason=end、cursor 未知恒 null', async () => {
    const site = `np-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} hot`, cron: '0 9 * * *', notify: false })
    const envSeen: unknown[] = []
    const restore = stubRun(async (...args) => { envSeen.push(args[3]); return { exitCode: 0, stdout: '[{"t":"a"}]', stderr: '' } })
    try { await P().runSiteCommand(`site ${site} hot`, r.id!) } finally { restore() }
    expect(envSeen[0]).toBeUndefined()
    const rec = P().runHistory[r.id!]![0]!.receipt!
    expect(rec).toMatchObject({ stop_reason: 'end', remaining_cursor: null })
    expect('profile' in rec).toBe(false)
    expect('partial' in rec).toBe(false)
    await svc.scheduleRemove({ id: r.id! })
  })

  it('unloaded(#2708 口径):零条目+加载中标记 → unloaded 而非 empty,stop_reason 未知(null)', async () => {
    const site = `ul-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} hot`, cron: '0 9 * * *', notify: false })
    const restore = stubRun(async () => ({ exitCode: 0, stdout: '{"items":[],"tip":"加载中"}', stderr: '' }))
    try { await P().runSiteCommand(`site ${site} hot`, r.id!) } finally { restore() }
    const rec = P().runHistory[r.id!]![0]!.receipt!
    expect(rec).toMatchObject({ items: 0, unloaded: true, stop_reason: null, remaining_cursor: null })
    expect('empty' in rec).toBe(false)
    await svc.scheduleRemove({ id: r.id! })
  })

  it('失败:stop_reason=error;任务级 backoffMs=0 生效(重试不等默认 15s);schedule-failed 进事件历史', async () => {
    const site = `fail-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} hot`, cron: '0 9 * * *', retry: 2, backoffMs: 0 })
    let calls = 0
    const restore = stubRun(async () => { calls++; return { exitCode: 1, stdout: '', stderr: 'boom' } })
    const t0 = Date.now()
    try { await P().runSiteCommand(`site ${site} hot`, r.id!) } finally { restore() }
    expect(calls).toBe(2)
    expect(Date.now() - t0).toBeLessThan(5000)
    const rec = P().runHistory[r.id!]![0]!.receipt!
    expect(rec).toMatchObject({ stop_reason: 'error', remaining_cursor: null })
    expect('error_code' in rec).toBe(false) // 非 typed 失败(1.x 文本)不臆造码
    const hist = await svc.eventsGet({ limit: 20 })
    expect(hist.events.some((e) => e.kind === 'schedule-failed' && e.text.includes(site))).toBe(true)
    await svc.scheduleRemove({ id: r.id! })
  })

  it('typed 失败(2.0 信封解包后 stderr 首行为码):回执带 error_code;COUNTS_NOT_LOADED → unloaded(#2708 直接采信)', async () => {
    const site = `tc-${Date.now()}`
    const r = await svc.scheduleAdd({ site: `site ${site} note`, cron: '0 9 * * *', retry: 1, notify: false })
    const restore = stubRun(async () => ({ exitCode: 1, stdout: '', stderr: 'COUNTS_NOT_LOADED\nxiaohongshu note: the interaction bar did not load likes\nKeep the browser automation window visible' }))
    try { await P().runSiteCommand(`site ${site} note`, r.id!) } finally { restore() }
    expect(P().runHistory[r.id!]![0]!.receipt).toMatchObject({ error_code: 'COUNTS_NOT_LOADED', unloaded: true, stop_reason: 'error' })
    await svc.scheduleRemove({ id: r.id! })
  })
})

describe('漂移兜底(adapter-drift 命中处接 browser_* 原语)', () => {
  /** 1 次结构化 + 3 次非结构化 = detectDrift 结构翻转口径在第 4 次命中。 */
  const runDriftSeries = async (id: string, siteCmd: string): Promise<void> => {
    let n = 0
    const restore = stubRun(async () => { n++; return { exitCode: 0, stdout: n === 1 ? '[{"t":"a"},{"t":"b"}]' : `plain page text ${n}`, stderr: '' } })
    try { for (let i = 0; i < 4; i++) { await P().runSiteCommand(siteCmd, id); await sleep(3) } } finally { restore() }
  }

  it('兜底成功:预警照发 + 回执 degraded(coverage 保持适配器口径)+ 数据并入本 tick 快照(不另起)+ 会话用完即关', async () => {
    const site = `df-${Date.now()}`
    const siteCmd = `site ${site} hot`
    const r = await svc.scheduleAdd({ site: siteCmd, cron: '0 9 * * *', notify: false })
    const calls: string[][] = []
    P().domainOf = async () => 'example.com'
    P().runBrowserTraced = async (sess, argv) => {
      calls.push([String(sess), ...argv])
      return argv[0] === 'state' ? { exitCode: 0, stdout: '{"url":"https://example.com/","title":"Example Domain"}', stderr: '' } : { exitCode: 0, stdout: 'ok', stderr: '' }
    }
    try { await runDriftSeries(r.id!, siteCmd) } finally { delete P().domainOf; delete P().runBrowserTraced }
    const kinds = P().ingestEventList.filter((e) => e.text.includes(site)).map((e) => e.kind)
    expect(kinds).toContain('adapter-drift')
    expect(kinds).toContain('adapter-drift-fallback')
    const row = P().runHistory[r.id!]![0]!
    expect(row.receipt).toMatchObject({ degraded: true, stop_reason: null })
    expect(row.summary).toContain('漂移兜底:browser_* 原语已采集近似数据')
    expect(calls.map((c) => c[1])).toEqual(['open', 'state', 'close'])
    expect(calls[0]![2]).toBe('https://example.com')
    expect(calls.every((c) => c[0]!.startsWith('drift-'))).toBe(true)
    const dir = path.join(P().snapshotsBase, r.id!)
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    expect(files).toHaveLength(4) // 每 tick 一份,兜底不另起快照
    const snap = JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)!), 'utf8')) as { degraded?: boolean; stdout: string; fallback?: { stdout: string }; receipt?: { degraded?: boolean } }
    expect(snap.degraded).toBe(true)
    expect(snap.stdout).toBe('plain page text 4') // diff 仍只比适配器输出
    expect(snap.fallback?.stdout).toContain('Example Domain')
    expect(snap.receipt?.degraded).toBe(true)
    await svc.scheduleRemove({ id: r.id! })
  })

  it('任务指定了 profile:不兜底(browser_* 不按任务 profile 路由,绝不用默认档案的另一个账号顶替),如实写明原因', async () => {
    const site = `dfp-${Date.now()}`
    const siteCmd = `site ${site} hot`
    const r = await svc.scheduleAdd({ site: siteCmd, cron: '0 9 * * *', notify: false, profile: 'work' })
    const calls: string[][] = []
    P().domainOf = async () => 'example.com'
    P().runBrowserTraced = async (sess, argv) => { calls.push([String(sess), ...argv]); return { exitCode: 0, stdout: '{"title":"x"}', stderr: '' } }
    try { await runDriftSeries(r.id!, siteCmd) } finally { delete P().domainOf; delete P().runBrowserTraced }
    expect(calls).toHaveLength(0)
    const row = P().runHistory[r.id!]![0]!
    expect(row.receipt?.degraded).toBeUndefined()
    expect(row.receipt?.profile).toBe('work')
    expect(row.summary).toContain('不用默认档案的账号顶替采集')
    await svc.scheduleRemove({ id: r.id! })
  })

  it('兜底也失败:按现语义诚实失败——预警照发、无 degraded、history 写明失败原因、未开成的会话不发 close', async () => {
    const site = `dff-${Date.now()}`
    const siteCmd = `site ${site} hot`
    const r = await svc.scheduleAdd({ site: siteCmd, cron: '0 9 * * *', notify: false })
    const calls: string[][] = []
    P().domainOf = async () => 'example.com'
    P().runBrowserTraced = async (sess, argv) => { calls.push([String(sess), ...argv]); return { exitCode: 1, stdout: '', stderr: 'Navigation rejected' } }
    try { await runDriftSeries(r.id!, siteCmd) } finally { delete P().domainOf; delete P().runBrowserTraced }
    const kinds = P().ingestEventList.filter((e) => e.text.includes(site)).map((e) => e.kind)
    expect(kinds).toContain('adapter-drift')
    const row = P().runHistory[r.id!]![0]!
    expect(row.receipt?.degraded).toBeUndefined()
    expect(row.summary).toContain('漂移兜底失败')
    expect(row.summary).toContain('Navigation rejected')
    expect(calls.map((c) => c[1])).toEqual(['open'])
    await svc.scheduleRemove({ id: r.id! })
  })
})

describe('#59 读写分频(写步骤独立限频轨)', () => {
  it('写轨间隔独立生效、读不受拖累;并发两写按预约顺延,起跑也错开', async () => {
    const pol = P().usagePolicy
    const saved = { ...pol }
    pol.minDelayMs = 0 // 关读轨礼貌间隔,单独观察写轨
    pol.burst = 100
    P().lastWriteAt = 0
    process.env.DSH_OPENCLI_WRITE_MIN_DELAY_MS = '300'
    try {
      await P().acquireGovernor('write'); P().releaseGovernor('write')
      let t = Date.now()
      await P().acquireGovernor('read'); P().releaseGovernor('read')
      expect(Date.now() - t).toBeLessThan(150)
      t = Date.now()
      await P().acquireGovernor('write'); P().releaseGovernor('write')
      expect(Date.now() - t).toBeGreaterThanOrEqual(250)
      P().lastWriteAt = 0
      const t0 = Date.now()
      const starts: number[] = []
      await Promise.all([0, 1].map(async () => { await P().acquireGovernor('write'); starts.push(Date.now() - t0); P().releaseGovernor('write') }))
      starts.sort((a, b) => a - b)
      expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(250)
    } finally {
      Object.assign(pol, saved)
      process.env.DSH_OPENCLI_WRITE_MIN_DELAY_MS = '0'
    }
  })
})

describe('超时 cancel + 有界清理(runSubprocess)', () => {
  type Seam = { spawn: () => { done: Promise<{ exitCode?: number | null }>; collected?: Record<string, { readFrom: (o: number) => Promise<{ text?: string }> }> } }
  const callRun = (seam: Seam, timeoutMs: number): Promise<RunOut> =>
    (OpencliService.prototype as unknown as { runSubprocess: (...a: unknown[]) => Promise<RunOut> }).runSubprocess.call(
      { ctx: { reflect: { get: (n: string) => (n === 'subprocess' ? seam : undefined) } }, bin: 'opencli' },
      ['zhihu', 'hot'], timeoutMs, 1024,
    )

  it('seam 不响应取消:到点+宽限后给 typed 超时信封(exit 124),不无限等待', async () => {
    process.env.DSH_OPENCLI_CLEANUP_GRACE_MS = '30'
    try {
      const t = Date.now()
      const r = await callRun({ spawn: () => ({ done: new Promise(() => {}) }) }, 40)
      expect(r.exitCode).toBe(124)
      expect(r.stderr).toContain('cancel + bounded cleanup')
      expect(Date.now() - t).toBeLessThan(2000)
    } finally { delete process.env.DSH_OPENCLI_CLEANUP_GRACE_MS }
  })

  it('seam 自身 reject(冷启动竞态)照常上抛——交给外层重试 seam / 回落 shell,语义不变', async () => {
    await expect(callRun({ spawn: () => ({ done: Promise.reject(new Error('reading includes')) }) }, 1000)).rejects.toThrow('reading includes')
  })

  it('正常落定:读回退出码与 stdout/stderr', async () => {
    const r = await callRun({ spawn: () => ({ done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: async () => ({ text: 'hi' }) }, stderr: { readFrom: async () => ({ text: '' }) } } }) }, 1000)
    expect(r).toEqual({ exitCode: 0, stdout: 'hi', stderr: '' })
  })
})
