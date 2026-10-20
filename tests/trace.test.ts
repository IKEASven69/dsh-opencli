/**
 * 录屏回放(BrowserSkill #79)单测:browser 命令运行轨迹。
 * 用桩 shell/tools/systemPrompt 挂载真实 OpencliService(lib/index.js),浏览器工具经
 * registerBrowserTools 的 run() 单点触发 recordTrace;trace 目录由 vitest.config 的
 * DSH_OPENCLI_TRACE_DIR 指到临时目录(DSH_OPENCLI_STATE 同款隔离)。
 * 覆盖:JSONL 落盘字段齐 / trace-list 倒序与 limit / trace-get 全量与非法 date / trace_replay 工具 /
 * 步骤自动截图(触发集/失败补拍/shot 字段) / trace-shot 截图直取与目录穿越拒绝。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** 桩 shell:browser 命令按序返回 out-1/out-2/out-3,第 2 条 exit 1(踩失败分支,outHead 应含 stderr)。
 *  screenshot 子命令"执行"即写出假 PNG(模拟真实 CLI 的落盘行为,自动补拍链路据此断言文件存在);
 *  failNext 手动置位可强制下一条非 screenshot 命令失败(失败必补拍用例)。 */
class StubShell extends Service {
  private seq = 0
  failNext = false
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(spec.command)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '1.8.8\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v1.8.7\nPort: 19825\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: '[]' }, stderr: { text: '' } }
    if (cmd.includes(' screenshot ') && /\.png\b/.test(cmd)) {
      const p = /(\S+\.png)/.exec(cmd)![1]!
      fs.writeFileSync(p, Buffer.from('fake-png-body'))
      return { exitCode: 0, stdout: { text: 'saved\n' }, stderr: { text: '' } }
    }
    this.seq++
    const fail = this.failNext || this.seq === 2
    this.failNext = false
    return { exitCode: fail ? 1 : 0, stdout: { text: `out-${this.seq}\n` }, stderr: { text: fail ? 'boom: navigation rejected' : '' } }
  }
}

class StubTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void {
    this.registered.set(def.name, def)
  }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: StubShell

beforeAll(async () => {
  // trace 目录按测试文件隔离(同上);本文件断言文件内容,必须独占
  process.env.DSH_OPENCLI_TRACE_DIR = require('node:path').join(require('node:os').tmpdir(), 'dsh-opencli-test-traces-f-trace-' + process.pid + '-' + Date.now())
  // 截图目录同款隔离:本文件的桩 shell 会真写假 PNG,绝不落进 ~/.dsh/opencli-shots
  process.env.DSH_OPENCLI_SHOTS_DIR = require('node:path').join(require('node:os').tmpdir(), 'dsh-opencli-test-shots-f-trace-' + process.pid + '-' + Date.now())
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: StubShell }).shell
  // SystemOne 不可用桩(与 advanced.test.ts 同款):本文件不触真实性判定,保持默认降级
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

const traceDir = (): string => process.env.DSH_OPENCLI_TRACE_DIR ?? ''
/** 找到桩运行期间写出的唯一 trace 文件(临时目录按 pid 隔离,目录里只会有本进程的档)。 */
const findTraceFile = (): string => {
  const files = fs.readdirSync(traceDir()).filter((f) => /^trace-\d{8}\.jsonl$/.test(f))
  expect(files.length).toBeGreaterThanOrEqual(1)
  return path.join(traceDir(), files[0]!)
}

describe('测试隔离(trace 目录不碰真实用户数据)', () => {
  it('traceDir 指向临时目录,绝不写 ~/.dsh/opencli-traces', () => {
    expect(traceDir().length).toBeGreaterThan(0)
    expect(traceDir()).not.toContain('.dsh')
    expect(traceDir()).toContain('dsh-opencli-test-traces')
  })
})

describe('recordTrace 落盘(browser 工具单点触发)', () => {
  it('3 条 browser 命令 → trace 文件 ≥3 行 JSON 且字段齐;失败步 outHead 含 stderr', async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('browser_open')!
    expect(tool).toBeDefined()
    await tool.execute({ url: 'https://example.com/1' })
    await tool.execute({ url: 'https://example.com/2' })
    await tool.execute({ url: 'https://example.com/3' })
    const file = findTraceFile()
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(3)
    const rows = lines.slice(-3).map((l) => JSON.parse(l) as Record<string, unknown>)
    for (const [i, r] of rows.entries()) {
      expect(typeof r.at).toBe('string')
      expect(String(r.at)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(String(r.cmd)).toBe(`browser dsh open https://example.com/${i + 1}`)
      expect(typeof r.exitCode).toBe('number')
      expect(typeof r.ms).toBe('number')
      expect(typeof r.outHead).toBe('string')
    }
    // 第 2 条失败:exit 1 且 outHead 优先带 stderr 原文
    expect(rows[0]!.exitCode).toBe(0)
    expect(rows[0]!.outHead).toBe('out-1\n')
    expect(rows[1]!.exitCode).toBe(1)
    expect(String(rows[1]!.outHead)).toContain('boom: navigation rejected')
    expect(rows[2]!.exitCode).toBe(0)
  })

  it('outHead 截断到 200 字', async () => {
    const S = svc as unknown as {
      recordTrace: (cmd: string, out: { exitCode: number; stdout: string; stderr: string }, ms: number) => void
    }
    // 直接调私有单点:构造 500 字输出验证截断(与 run() 同一入口,不绕实现)
    S.recordTrace.call(svc, 'browser dsh state', { exitCode: 0, stdout: 'x'.repeat(500), stderr: '' }, 5)
    const file = findTraceFile()
    const last = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0).pop()!
    const r = JSON.parse(last) as { cmd: string; outHead: string }
    expect(r.cmd).toBe('browser dsh state')
    expect(r.outHead.length).toBe(200)
  })
})

describe('trace-list RPC(倒序 + limit)', () => {
  it('默认 50 上限内返回全部,最新在前(第 3 次调用排头)', async () => {
    const r = await svc.traceList({})
    expect(r.ok).toBe(true)
    expect(r.traces.length).toBeGreaterThanOrEqual(4)
    expect(r.traces[0]!.cmd).toBe('browser dsh state')
    expect(r.traces[1]!.cmd).toBe('browser dsh open https://example.com/3')
    expect(r.traces[2]!.cmd).toBe('browser dsh open https://example.com/2')
    expect(r.traces[3]!.cmd).toBe('browser dsh open https://example.com/1')
  })

  it('limit 只留最新 N 条且仍倒序', async () => {
    const r = await svc.traceList({ limit: 2 })
    expect(r.ok).toBe(true)
    expect(r.traces).toHaveLength(2)
    expect(r.traces[0]!.cmd).toBe('browser dsh state')
    expect(r.traces[1]!.cmd).toBe('browser dsh open https://example.com/3')
  })

  it('request 缺省(undefined)不炸,走默认 limit', async () => {
    const r = await svc.traceList()
    expect(r.ok).toBe(true)
    expect(r.traces.length).toBeGreaterThanOrEqual(1)
  })
})

describe('trace-get RPC(按日全量)', () => {
  it('该日全量返回且时间序(旧→新);非法 date 拒绝', async () => {
    // 从已发现的文件名取日期键,与写入侧共用同一把尺(免跨午夜竞态)
    const file = findTraceFile()
    const date = /^trace-(\d{8})\.jsonl$/.exec(path.basename(file))![1]!
    const r = await svc.traceGet({ date })
    expect(r.ok).toBe(true)
    expect(r.traces.length).toBeGreaterThanOrEqual(4)
    // 时间序(旧→新):定时链路(v0.4.2 修复)也会写 schedule 行进同一文件,断言只看本桩写的
    // browser 子集的相对顺序——首条 open/1 在末条 state 之前。
    const cmds = r.traces.map((t) => t.cmd)
    const firstOpen = cmds.indexOf('browser dsh open https://example.com/1')
    const lastState = cmds.lastIndexOf('browser dsh state')
    expect(firstOpen).toBeGreaterThanOrEqual(0)
    expect(lastState).toBeGreaterThan(firstOpen)
    // 非法 date(含路径穿越形态)拒绝
    expect((await svc.traceGet({ date: '../../etc' })).ok).toBe(false)
    expect((await svc.traceGet({ date: '20990101' })).ok).toBe(false)
  })
})

describe('trace_replay 工具(最近 30 步 markdown 时间线)', () => {
  it('返回时间/命令/exit/耗时表 + 失败步输出摘录', async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('trace_replay')!
    expect(tool).toBeDefined()
    const r = await tool.execute({})
    expect(r.text).toContain('| 时间 | 命令 | exit | 耗时 |')
    expect(r.text).toContain('browser dsh open https://example.com/1')
    expect(r.text).toContain('| 1 |')
    expect(r.text).toContain('失败步输出摘录')
    expect(r.text).toContain('boom: navigation rejected')
  })
})

describe('RPC 透传入口也落轨迹(评审:回放按钮曾绕过 recordTrace 单点)', () => {
  it('replay 的 browser 步骤进轨迹;site 步骤不进(只有 browser 命令落盘)', async () => {
    const before = (await svc.traceList({})).traces.length
    const rb = await svc.replay({ step: 'browser_open https://example.com/replayed' })
    expect(rb.ok).toBe(true)
    const l1 = await svc.traceList({})
    expect(l1.traces.length).toBe(before + 1)
    expect(l1.traces[0]!.cmd).toBe('browser dsh open https://example.com/replayed')
    // site 分支不是 browser 命令:不落轨迹
    const rs = await svc.replay({ step: 'site arxiv recent cs.AI' })
    expect(rs.ok).toBe(true)
    const l2 = await svc.traceList({})
    expect(l2.traces.length).toBe(l1.traces.length)
  })

  it('script-run-builtin / crawl / userscript-run / recipe-run 四入口全落轨迹', async () => {
    const before = (await svc.traceList({})).traces.length
    expect((await svc.scriptRunBuiltin({ name: 'article', url: 'https://example.com/a' })).ok).toBe(true)
    expect((await svc.crawl({ url: 'https://example.com/crawl' })).ok).toBe(true)
    await svc.automationModeSet({ mode: 'unrestricted' })
    const code = '// ==UserScript==\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1'
    expect((await svc.userscriptRun({ code, url: 'https://example.com/' })).ok).toBe(true)
    await svc.automationModeSet({ mode: 'standard' })
    expect((await svc.recipeRun({ steps: [{ type: 'wait', selector: '.loaded' }] })).ok).toBe(true)
    const l = await svc.traceList({})
    expect(l.traces.length).toBe(before + 4)
    // 倒序:最新在前(调用序 extract→open→eval→wait)
    expect(l.traces.slice(0, 4).map((t) => t.cmd)).toEqual([
      'browser dsh wait .loaded',
      `browser dsh eval ${code}`,
      'browser dsh open https://example.com/crawl',
      'browser dsh extract https://example.com/a',
    ])
  })
})

describe('多行 cmd 单行化渲染(评审:eval 多行源码曾拆坏 trace_replay 表格行)', () => {
  const replayTool = (): { execute: (a: unknown) => Promise<{ text: string }> } =>
    (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('trace_replay')!

  it('userscript eval 的多行 cmd 折为可见 \\n 标记,表格行保持完整单行', async () => {
    const r = await replayTool().execute({})
    // 找含 eval 命令的那一行:原始换行折为字面 \n 标记后,它必须是完整的一条表格行
    const evalLine = r.text.split('\n').find((l) => l.includes('browser dsh eval'))
    expect(evalLine).toBeDefined()
    expect(evalLine!.startsWith('|')).toBe(true)
    expect(evalLine!.endsWith('ms |')).toBe(true)
    expect(evalLine!).toContain('// ==UserScript==\\n// @match')
    // 表格行数与轨迹条数一致(多行载荷不再把一行拆成多行)
    const rows = r.text.split('\n').filter((l) => /^\| \d{2}:\d{2}:\d{2} \|/.test(l))
    expect(rows.length).toBe((await svc.traceList({})).traces.length)
  })

  it('失败步摘录的 outHead 换行同样折为标记,摘录行不断裂', async () => {
    const r = await replayTool().execute({})
    const failLine = r.text.split('\n').find((l) => l.includes('→ boom: navigation rejected'))
    expect(failLine).toBeDefined()
    expect(failLine!.startsWith('- [')).toBe(true)
    expect(failLine!).toContain('boom: navigation rejected\\nout-2')
  })
})

describe('时间列本地化(评审:UTC 直显与本地时钟错位 8h)', () => {
  it('trace_replay 时间列是本地 HH:MM:SS,不是 UTC 原文直切', async () => {
    const at = '2026-10-04T23:30:00.000Z'
    fs.appendFileSync(findTraceFile(), `${JSON.stringify({ at, cmd: 'browser dsh utclock', exitCode: 0, ms: 1, outHead: 'x' })}\n`, 'utf8')
    const d = new Date(at)
    const p = (n: number): string => String(n).padStart(2, '0')
    const local = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('trace_replay')!
    const r = await tool.execute({})
    expect(r.text).toContain(`| ${local} | browser dsh utclock | 0 | 1ms |`)
    // 非零时区机器上,UTC 原文直切的时间不应出现(零时区机器两者相等,跳过该断言)
    if (local !== at.slice(11, 19)) {
      expect(r.text).not.toContain(`| ${at.slice(11, 19)} | browser dsh utclock`)
    }
  })
})

describe('脏行防御(评审:parse 成功但非 TraceLine 曾可炸面板)', () => {
  it('null/缺字段对象/冲突标记/类型不对的行被跳过,合法行照常返回', async () => {
    const good = (await svc.traceList({})).traces.length
    fs.appendFileSync(findTraceFile(), [
      'null',
      '42',
      '{"exitCode":0}',
      '<<<<<<< HEAD',
      JSON.stringify({ at: 123, cmd: 'x', exitCode: 0, ms: 1, outHead: '' }),
      JSON.stringify({ at: '2026-10-04T00:00:00.000Z', cmd: 'browser dsh dirty-but-valid', exitCode: 3, ms: 9, outHead: 'kept' }),
      '',
    ].join('\n'), 'utf8')
    const l = await svc.traceList({})
    expect(l.ok).toBe(true)
    expect(l.traces.length).toBe(good + 1)
    expect(l.traces[0]!.cmd).toBe('browser dsh dirty-but-valid')
    expect(l.traces[0]!.exitCode).toBe(3)
    // trace-get 同经 readTraceFile:脏行同样不进全量结果
    const file = findTraceFile()
    const date = /^trace-(\d{8})\.jsonl$/.exec(path.basename(file))![1]!
    const g = await svc.traceGet({ date })
    expect(g.ok).toBe(true)
    expect(g.traces.length).toBe(good + 1)
  })
})

describe('步骤自动截图(页面变化子命令/失败命令自动补拍)', () => {
  const shotsDir = (): string => process.env.DSH_OPENCLI_SHOTS_DIR ?? ''
  const shotOf = (t: unknown): string | undefined => (t as { shot?: string }).shot
  const tool = (name: string): { execute: (a: unknown) => Promise<{ text: string }> } =>
    (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get(name)!

  it('截图目录隔离:指向临时目录,绝不写 ~/.dsh/opencli-shots', () => {
    expect(shotsDir().length).toBeGreaterThan(0)
    expect(shotsDir()).not.toContain('.dsh')
    expect(shotsDir()).toContain('dsh-opencli-test-shots')
  })

  it('open/click 触发补拍:轨迹行带 shot 绝对路径,假文件已落盘且在隔离目录之下', async () => {
    await tool('browser_open').execute({ url: 'https://example.com/shot-open' })
    await tool('browser_click').execute({ target: '12' })
    const rows = (await svc.traceList({})).traces
    const openRow = rows.find((t) => t.cmd === 'browser dsh open https://example.com/shot-open')!
    expect(openRow).toBeDefined()
    const shot = shotOf(openRow)
    expect(typeof shot).toBe('string')
    expect(path.isAbsolute(shot!)).toBe(true)
    // 目录结构:<shotsDir>/<yyyymmdd>/<sessionId>/step-<hhmmss>-<idx>.png(日期键与 traceDir 同款)
    expect(shot!.startsWith(shotsDir())).toBe(true)
    expect(shot!).toMatch(/[\\/]\d{8}[\\/]dsh[\\/]step-\d{6}-\d+\.png$/)
    expect(fs.existsSync(shot!)).toBe(true)
    const clickRow = rows.find((t) => t.cmd === 'browser dsh click 12')!
    expect(clickRow).toBeDefined()
    expect(shotOf(clickRow)).toMatch(/\.png$/)
    // 内部补拍本身不落轨迹(不是用户步骤):这两条命令各补拍一张,但轨迹只多两行
    const again = (await svc.traceList({})).traces
    expect(again.filter((t) => /screenshot/.test(t.cmd)).length).toBe(0)
  })

  it('state 不触发:只读命令页面无变化,轨迹行无 shot 字段', async () => {
    await tool('browser_state').execute({})
    const rows = (await svc.traceList({})).traces
    // 倒序(新在前):首个 state 命中即本次执行
    const last = rows.find((t) => t.cmd === 'browser dsh state')!
    expect(last).toBeDefined()
    expect(shotOf(last)).toBeUndefined()
  })

  it('失败必触发:exitCode!==0 的 state 也补拍;命令结果原样透传不被截图阻断', async () => {
    shell.failNext = true
    const r = await tool('browser_state').execute({})
    expect(r.text).toContain('命令失败')
    const rows = (await svc.traceList({})).traces
    const failRow = rows.find((t) => t.cmd === 'browser dsh state' && t.exitCode === 1)!
    expect(failRow).toBeDefined()
    expect(shotOf(failRow)).toMatch(/\.png$/)
    expect(fs.existsSync(shotOf(failRow)!)).toBe(true)
  })

  it('shotCapture=false 实例开关整体关闭补拍', async () => {
    svc.shotCapture = false
    try {
      await tool('browser_open').execute({ url: 'https://example.com/shot-off' })
      const rows = (await svc.traceList({})).traces
      const row = rows.find((t) => t.cmd === 'browser dsh open https://example.com/shot-off')!
      expect(row).toBeDefined()
      expect(shotOf(row)).toBeUndefined()
    } finally {
      svc.shotCapture = true
    }
  })
})

describe('trace-shot RPC(截图直取 + 目录穿越拒绝)', () => {
  const shotsDir = (): string => process.env.DSH_OPENCLI_SHOTS_DIR ?? ''
  const shotOf = (t: unknown): string | undefined => (t as { shot?: string }).shot

  it('shotsDir 内合法文件返回 base64 与 image/png', async () => {
    const rows = (await svc.traceList({})).traces
    const shot = rows.map(shotOf).find((s): s is string => typeof s === 'string')!
    expect(shot).toBeDefined()
    const r = await svc.traceShot({ path: shot })
    expect(r.ok).toBe(true)
    expect(r.mime).toBe('image/png')
    expect(Buffer.from(r.data ?? '', 'base64').toString()).toBe('fake-png-body')
  })

  it('目录外路径拒绝:trace 文件/上级回溯/空 path/undefined 全部 ok:false', async () => {
    // 绝对路径但在 shotsDir 之外(trace 目录下的轨迹文件)
    expect((await svc.traceShot({ path: findTraceFile() })).ok).toBe(false)
    // ../ 回溯形态(resolve 后逃出 shotsDir)
    expect((await svc.traceShot({ path: path.join(shotsDir(), '..', 'escape.png') })).ok).toBe(false)
    // 同前缀目录不假命中(shots 与 traces 前缀相近,必须区分)
    expect((await svc.traceShot({ path: path.join(shotsDir() + '-evil', 'x.png') })).ok).toBe(false)
    expect((await svc.traceShot({ path: '' })).ok).toBe(false)
    expect((await svc.traceShot(undefined as never)).ok).toBe(false)
  })

  it('目录内不存在的文件 ok:false(不抛错)', async () => {
    const miss = path.join(shotsDir(), '20990101', 'dsh', 'nope.png')
    expect((await svc.traceShot({ path: miss })).ok).toBe(false)
  })
})

describe('browser_do 结果携带 shot(评审:此前只进 trace 不进工具结果,卡片提示是死路径)', () => {
  it("open(页面变化类)执行后工具结果带 shot 绝对路径,与轨迹行一致", async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string; shot?: string }> }> }).registered.get('browser_do')!
    expect(tool).toBeDefined()
    const r = await tool.execute({ command: 'back', args: [] })
    expect(typeof r.shot).toBe('string')
    expect(r.shot).toMatch(/step-\d{6}-\d+\.png$/)
    expect(fs.existsSync(r.shot!)).toBe(true) // 桩 screenshot 真写了文件——悬空引用零容忍
    // 同一步的轨迹行也带同一 shot
    const lines = fs.readFileSync(findTraceFile(), 'utf8').split('\n').filter((l) => l.includes('back'))
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(lines[lines.length - 1]!).shot).toBe(r.shot)
  })
  it('find(非页面变化且成功)不拍——截图频率有门槛,不是每条都拍', async () => {
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string; shot?: string }> }> }).registered.get('browser_do')!
    const r = await tool.execute({ command: 'find', args: ['button'] })
    expect(r.shot).toBeUndefined()
  })
})
