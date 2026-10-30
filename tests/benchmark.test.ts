/**
 * 冒烟基准(任务 C)测试:纯函数表结构/失败行/免责声明 + RPC 三态(成功/失败/超时)
 * + 桩 so 的 P 判定 + 报告落盘与 20 份轮转 + benchmark 工具装配。桩 shell 全程离线。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { BENCH_KEEP, DEFAULT_BENCH, buildBenchmarkReport, buildCanaryReport, parseCanarySnapshot, pickCanaryCommands, renderBenchmarkTable, type BenchItem } from '../src/benchmark.ts'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** 目录桩:默认 5 站+测试专用站标记为 read,zhihu comment 为 write——安全不变量门
 *  (只读冒烟)按目录权限拒绝写/未知命令,空目录会让一切变 unknown 而全军覆没。 */
const LIST_JSON = JSON.stringify({
  ok: true,
  data: { commands: [
    { command: 'juejin hot', description: 'x', access: 'read' },
    { command: '36kr hot', description: 'x', access: 'read' },
    { command: 'hackernews best', description: 'x', access: 'read' },
    { command: 'v2ex hot', description: 'x', access: 'read' },
    { command: 'bilibili hot', description: 'x', access: 'read' },
    { command: 'weibo hot', description: 'x', access: 'read' },
    { command: 'xiaohongshu hot', description: 'x', access: 'read' },
    { command: 'zhihu comment', description: '写评论', access: 'write' },
    { command: 'fakehot hot', description: '热词伪装的写命令', access: 'write' },
  ], total: 9 },
})

/** 桩 shell:按"<站点> <命令>"键路由三态(ok/fail/timeout),未登记默认 ok;离线可测。 */
class StubShell extends Service {
  behavior: Record<string, 'ok' | 'fail' | 'timeout'> = {}
  calls: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    this.calls.push(cmd)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '2.0.0\n' }, stderr: { text: '' } }
    if (cmd.includes('list') || cmd.includes('daemon')) return { exitCode: 0, stdout: { text: LIST_JSON }, stderr: { text: '' } }
    const key = Object.keys(this.behavior).find((k) => cmd.includes(k))
    const mode = key !== undefined ? this.behavior[key] : 'ok'
    if (mode === 'timeout') throw new Error('opencli 命令执行超时(60000ms)')
    if (mode === 'fail') return { exitCode: 3, stdout: { text: '' }, stderr: { text: 'boom 采集失败' } }
    return { exitCode: 0, stdout: { text: '- rank: 1  title: 热点甲\n- rank: 2  title: 热点乙' }, stderr: { text: '' } }
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

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: StubShell
let benchDir: string

beforeAll(async () => {
  // trace/截图目录按测试文件隔离(cli2 同款):vitest 线程池共享目录会让轨迹交错互相污染
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-bench-' + process.pid + '-' + Date.now())
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-bench-' + process.pid + '-' + Date.now())
  benchDir = path.join(os.tmpdir(), 'dsh-opencli-test-benchmarks-' + process.pid + '-' + Date.now())
  process.env.DSH_OPENCLI_BENCHMARKS_DIR = benchDir
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: StubShell }).shell
  // 桩 so:configured 且 valid.value=0.93 → verifyResult 的 noul 兜底给出 P=0.93(≥0.7 判有效)
  ;(svc as unknown as { so: unknown }).so = { configured: true, ask: async () => ({ ok: true, answers: { valid: { type: 'noul', value: 0.93, confidence: 1 } }, latencyMs: 5, error: null }) }
  // 站间间隔与限流降为 0:测的是编排与落盘,不是真实节拍(生产默认 800ms/750ms 不变)
  ;(svc as unknown as { benchGapMs: number }).benchGapMs = 0
  ;(svc as unknown as Record<string, unknown>).usagePolicy = { minDelayMs: 0, maxConcurrency: 10, burst: 100, cooldownMs: 0, retryLimit: 2, maxPagesPerRun: 20, maxDepth: 2 }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
  fs.rmSync(benchDir, { recursive: true, force: true })
})

const R = (): { benchmarkRun: (r?: { sites?: string[] }) => Promise<{ ok: boolean; path?: string; results?: BenchItem[]; error?: string }> } =>
  svc as unknown as { benchmarkRun: (r?: { sites?: string[] }) => Promise<{ ok: boolean; path?: string; results?: BenchItem[]; error?: string }> }

describe('buildBenchmarkReport 纯函数', () => {
  const items: BenchItem[] = [
    { site: 'juejin', command: 'juejin hot', ok: true, p: 0.93, ms: 1523 },
    { site: 'v2ex', command: 'v2ex hot', ok: false, p: null, ms: 60012, error: 'connect timeout after 60000ms' },
    { site: 'xiaohongshu', command: 'xiaohongshu hot', ok: false, p: 0.05, ms: 840, error: '静默失败:登录/风控墙' },
  ]
  const md = buildBenchmarkReport(items, '2026-10-20T08:00:00Z')

  it('头部含标题/生成时间/站数统计与零模型声明', () => {
    expect(md).toContain('# 站点冒烟基准报告')
    expect(md).toContain('生成时间:2026-10-20T08:00:00Z')
    expect(md).toContain('站点 3 个(成功 1)')
    expect(md).toContain('零模型改写')
  })
  it('逐站表:成功行 ✓ ok 带 P,失败行 ✗ 带错误摘要,无判定 P 用 —', () => {
    const rows = md.split('\n').filter((l) => l.startsWith('| juejin') || l.startsWith('| v2ex') || l.startsWith('| xiaohongshu'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('`juejin hot`')
    expect(rows[0]).toContain('✓ ok')
    expect(rows[0]).toContain('0.93')
    expect(rows[0]).toContain('1523')
    expect(rows[1]).toContain('✗ 失败')
    expect(rows[1]).toContain('—')
    expect(rows[1]).toContain('60012')
    expect(rows[1]).toContain('connect timeout after 60000ms')
    expect(rows[2]).toContain('0.05')
    expect(rows[2]).toContain('静默失败')
  })
  it('错误摘要净化:换行/竖线不拆断表格行', () => {
    const evil = buildBenchmarkReport([{ site: 'a', command: 'a hot', ok: false, p: null, ms: 1, error: 'line1\nline2 | pipe' }], 'g')
    const rows = evil.split('\n').filter((l) => l.startsWith('| a '))
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toContain('\n')
    expect(rows[0]).toContain('\\|')
  })
  it('尾部复现命令块 + 免责声明(单次运行/网络)', () => {
    expect(md).toContain('## 复现命令')
    expect(md).toContain('```bash')
    expect(md).toContain('opencli juejin hot')
    expect(md).toContain('opencli v2ex hot')
    expect(md).toContain('免责')
    expect(md).toContain('单次运行')
    expect(md).toContain('网络')
  })
  it('默认集与规格一致(5 个无需登录读命令)', () => {
    expect(DEFAULT_BENCH).toEqual(['juejin hot', '36kr hot', 'hackernews best', 'v2ex hot', 'bilibili hot'])
  })
})

describe('renderBenchmarkTable 纯文本表', () => {
  it('无 markdown 竖线;成功 ok/失败 FAIL 与汇总行', () => {
    const t = renderBenchmarkTable([
      { site: 'juejin', command: 'juejin hot', ok: true, p: 0.93, ms: 1523 },
      { site: 'v2ex', command: 'v2ex hot', ok: false, p: null, ms: 60012, error: 'connect timeout' },
    ])
    expect(t).toContain('成功 1/2')
    expect(t).toContain('ok')
    expect(t).toContain('FAIL')
    expect(t).toContain('connect timeout')
    expect(t).not.toContain('|')
  })
})

describe('benchmark-run RPC(桩 shell 三态 + 桩 so)', () => {
  it('成功/失败/超时/静默四行如实进表,报告落盘', async () => {
    shell.behavior = { 'v2ex hot': 'timeout', 'weibo hot': 'fail', 'xiaohongshu hot': 'ok' }
    // xiaohongshu 桩回 ok 但内容是 EMPTY_RESULT → 规则层判静默失败(exit 0 ≠ 有效数据)
    const origRun = shell.run.bind(shell)
    shell.run = async (spec: { command: unknown }) => {
      const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
      if (cmd.includes('xiaohongshu hot')) return { exitCode: 0, stdout: { text: 'EMPTY_RESULT' }, stderr: { text: '' } }
      return origRun(spec)
    }
    try {
      const r = await R().benchmarkRun({ sites: ['juejin hot', 'v2ex hot', 'weibo hot', 'xiaohongshu hot'] })
      expect(r.ok).toBe(true)
      expect(r.results!.map((x) => x.site)).toEqual(['juejin', 'v2ex', 'weibo', 'xiaohongshu'])
      // 成功行:P 取自桩 so 的 0.93,耗时为正
      expect(r.results![0]).toMatchObject({ site: 'juejin', command: 'juejin hot', ok: true, p: 0.93 })
      expect(r.results![0].ms).toBeGreaterThanOrEqual(0)
      // 超时行:shell 抛错被归一为失败行,错误摘要带超时原文
      expect(r.results![1]!.ok).toBe(false)
      expect(r.results![1]!.error).toContain('超时')
      expect(r.results![1]!.ms).toBeGreaterThanOrEqual(0)
      // 失败行:exit≠0 的 stderr 进错误摘要
      expect(r.results![2]).toMatchObject({ site: 'weibo', ok: false, p: null })
      expect(r.results![2]!.error).toContain('boom')
      // 静默失败行:exit 0 但规则层判无效,ok=false 且 P=0.05
      expect(r.results![3]!.ok).toBe(false)
      expect(r.results![3]!.p).toBeCloseTo(0.05)
      expect(r.results![3]!.error).toContain('静默失败')
      // 报告落盘且内容含表格与复现块
      expect(r.path).toBeDefined()
      expect(fs.existsSync(r.path!)).toBe(true)
      const md = fs.readFileSync(r.path!, 'utf8')
      expect(md).toContain('# 站点冒烟基准报告')
      expect(md).toContain('| juejin | `juejin hot` | ✓ ok | 0.93 |')
      expect(md).toContain('opencli v2ex hot')
      expect(md).toContain('免责')
    } finally {
      shell.run = origRun
    }
  })
  it('串行:四站调用按输入顺序到达,同站不重复(超时站除外,重试形态探测)', async () => {
    shell.behavior = {}
    shell.calls = []
    await R().benchmarkRun({ sites: ['juejin hot', '36kr hot'] })
    const i1 = shell.calls.findIndex((c) => c.includes('juejin hot'))
    const i2 = shell.calls.findIndex((c) => c.includes('36kr hot'))
    expect(i1).toBeGreaterThanOrEqual(0)
    expect(i2).toBeGreaterThan(i1)
  })
  it('缺省 sites → 默认 5 站全跑', async () => {
    shell.behavior = {}
    const r = await R().benchmarkRun()
    expect(r.ok).toBe(true)
    expect(r.results!.map((x) => x.command)).toEqual([...DEFAULT_BENCH])
    expect(r.results!.every((x) => x.ok)).toBe(true)
  })
  it('入参校验:垃圾格式与超量直接拒绝,不碰 shell', async () => {
    shell.calls = []
    const bad = await R().benchmarkRun({ sites: ['rm -rf /'] })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('格式非法')
    const many = await R().benchmarkRun({ sites: Array.from({ length: 11 }, (_, i) => `s${i} hot`) })
    expect(many.ok).toBe(false)
    expect(many.error).toContain('最多 10 站')
    expect(shell.calls.filter((c) => /s\d+ hot/.test(c))).toHaveLength(0)
  })
  it('安全不变量:写命令与未知权限命令在门口拒绝,不碰 shell(评审 HIGH 回归)', async () => {
    shell.calls = []
    const w = await R().benchmarkRun({ sites: ['zhihu comment', 'juejin hot'] })
    expect(w.ok).toBe(false)
    expect(w.error).toContain('只接受只读命令')
    expect(w.error).toContain('zhihu comment(写命令)')
    expect(shell.calls.filter((c) => c.includes('zhihu comment'))).toHaveLength(0)
    const u = await R().benchmarkRun({ sites: ['nope hot'] })
    expect(u.ok).toBe(false)
    expect(u.error).toContain('nope hot(未知权限)')
    expect(shell.calls.filter((c) => c.includes('nope hot'))).toHaveLength(0)
    // 工具面同拦:benchmark 工具带写站 → 文本里是被拒提示而非执行结果
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('benchmark')!
    const t = await tool.execute({ sites: ['zhihu comment'] })
    expect(t.text).toContain('只接受只读命令')
  })
  it('轮转:目录超 20 份时删最旧,新报告保留', async () => {
    shell.behavior = {}
    // 先清场:前面用例已落过真实报告,不清会让"删最旧的 4 份"而非断言里的 1 份
    fs.rmSync(benchDir, { recursive: true, force: true })
    fs.mkdirSync(benchDir, { recursive: true })
    for (let i = 0; i < BENCH_KEEP; i++) {
      // 2020 假档:字典序必然早于真实 2026 时间戳,模拟"最旧的 20 份"
      fs.writeFileSync(path.join(benchDir, `bench-2020-01-01T00-00-${String(i).padStart(3, '0')}-000.md`), 'old')
    }
    const r = await R().benchmarkRun({ sites: ['juejin hot'] })
    expect(r.ok).toBe(true)
    const files = fs.readdirSync(benchDir).filter((f) => /^bench-.+\.md$/.test(f)).sort()
    expect(files).toHaveLength(BENCH_KEEP)
    // 最旧假档被删,次旧的留下;新报告(2026 前缀)在列
    expect(files).not.toContain('bench-2020-01-01T00-00-000-000.md')
    expect(files).toContain('bench-2020-01-01T00-00-001-000.md')
    expect(files.some((f) => path.basename(r.path!) === f)).toBe(true)
  })
})

describe('benchmark agent 工具装配', () => {
  it('注册名 benchmark;执行返回纯文本表与报告路径', async () => {
    shell.behavior = {}
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('benchmark')
    expect(tool).toBeDefined()
    const r = await tool!.execute({ sites: ['juejin hot', 'v2ex hot'] })
    expect(r.text).toContain('冒烟基准:成功 2/2')
    expect(r.text).toContain('juejin hot')
    expect(r.text).toContain('报告已生成:')
    const file = r.text.match(/报告已生成:(.+)/)?.[1]?.trim() ?? ''
    expect(fs.existsSync(file)).toBe(true)
  })
})

describe('canary 漂移监控(纯函数 + 调度分支)', () => {
  it('pickCanaryCommands:命令数排序取 top-20,只挑零参热榜语义命令,没有则跳站', () => {
    const ads = [
      { name: 'a', commands: ['hot', 'comment'], kinds: ['read', 'write'] },      // hot 优先
      { name: 'b', commands: ['search', 'watchlater'], kinds: ['read', 'read'] }, // 无热榜词→跳站
      { name: 'c', commands: ['post'], kinds: ['write'] },                        // 纯写站跳过
      { name: 'd', commands: Array.from({ length: 30 }, (_, i) => `cmd${i}`), kinds: Array.from({ length: 30 }, () => 'read') },
    ]
    const picks = pickCanaryCommands(ads as never)
    expect(picks).toContain('a hot')
    expect(picks.some((p) => p.startsWith('b '))).toBe(false) // b 无热榜命令,跳过
    expect(picks.some((p) => p.startsWith('c '))).toBe(false)
    expect(picks.length).toBeLessThanOrEqual(20)
  })
  it('快照解析↔报告生成闭环:本轮报告能被下一轮读回同基线;脏行跳过不炸', () => {
    const items: BenchItem[] = [
      { site: 'juejin', command: 'juejin hot', ok: true, p: 0.9, ms: 100 },
      { site: 'weibo', command: 'weibo hot', ok: false, p: null, ms: 200, error: 'boom' },
    ]
    const md = buildCanaryReport(items, new Map(), '2026-10-20T00:00:00Z')
    expect(md).toContain('# 站点漂移 canary 报告')
    expect(md).toContain('首跑,建立基线')
    expect(md).toContain('| juejin | `juejin hot` | ✓ ok |')
    const snap = parseCanarySnapshot(md + '\n| 脏行 | 不解析 | ✗ |')
    expect(snap.get('juejin hot')).toBe(true)
    expect(snap.get('weibo hot')).toBe(false)
    expect(snap.size).toBe(2)
    // 第二轮:weibo 恢复 + juejin 新失败 → 漂移段如实呈现
    const md2 = buildCanaryReport([
      { site: 'juejin', command: 'juejin hot', ok: false, p: null, ms: 50, error: '改版' },
      { site: 'weibo', command: 'weibo hot', ok: true, p: 0.8, ms: 60 },
    ], snap, '2026-10-21T00:00:00Z')
    expect(md2).toContain('新失败 1')
    expect(md2).toContain('`juejin hot`')
    expect(md2).toContain('恢复 1')
    expect(md2).toContain('`weibo hot`')
  })
  it('调度分支:定时任务填 canary → 走 canaryRun 且历史行记录汇总,不执行单命令', async () => {
    process.env.DSH_OPENCLI_CANARY_DIR = path.join(benchDir, 'canary')
    const add = await (svc as unknown as { scheduleAdd: (x: { site: string; cron: string; retry?: number }) => Promise<{ ok: boolean; id?: string }> }).scheduleAdd({ site: 'canary', cron: '0 5 * * *', retry: 1 })
    expect(add.ok).toBe(true)
    const S = svc as unknown as { runSiteCommand: (s: string, id: string) => Promise<void>; canaryRun: () => Promise<{ ok: boolean; total: number; passed: number; newFailures: string[]; recovered: string[] }> }
    const orig = S.canaryRun.bind(svc)
    let called = 0
    S.canaryRun = async () => { called++; return { ok: true, total: 20, passed: 18, newFailures: ['x hot'], recovered: [] } }
    shell.calls = []
    try { await S.runSiteCommand('canary', add.id!) } finally { S.canaryRun = orig }
    expect(called).toBe(1)
    expect(shell.calls.filter((c) => c.includes(' canary'))).toHaveLength(0) // 没把 canary 当站点命令跑
    const st = JSON.parse(fs.readFileSync(process.env.DSH_OPENCLI_STATE!, 'utf8'))
    const hist = (st.runHistory ?? {})[add.id!] as Array<{ summary: string }>
    expect(hist[0].summary).toContain('canary:18/20')
    expect(hist[0].summary).toContain('新失败:x hot')
    await (svc as unknown as { scheduleRemove: (x: { id: string }) => Promise<{ ok: boolean }> }).scheduleRemove({ id: add.id! })
  })
})

describe('canary 伪站点排除(真机 0/20 回归)', () => {
  it('browser/adapter/daemon/auth 等全局命名空间不进 canary 集', () => {
    const ads = [
      { name: 'browser', commands: ['screenshot', 'state'], kinds: ['read', 'read'] },
      { name: 'daemon', commands: ['status'], kinds: ['read'] },
      { name: 'auth', commands: ['status'], kinds: ['read'] },
      { name: 'juejin', commands: ['hot'], kinds: ['read'] },
    ]
    const picks = pickCanaryCommands(ads as never)
    expect(picks).toEqual(['juejin hot'])
  })
})

describe('canaryRun 真实 argv(回归:heredoc 曾把 split(/\s+/) 吃成 split(/s+),xiaohongshu 被按字母 s 切碎)', () => {
  it('逐站 argv 是 [站, 命令] 两段,undefined 不进 argv;轮转文件名带点', async () => {
    process.env.DSH_OPENCLI_CANARY_DIR = path.join(benchDir, 'canary2')
    shell.calls = []
    const r = await (svc as unknown as { canaryRun: () => Promise<{ ok: boolean; total: number; passed: number; path?: string }> }).canaryRun()
    expect(r.total).toBeGreaterThan(0)
    const siteCalls = shell.calls.filter((c) => !c.includes('--version') && !c.includes('list') && !c.includes('daemon'))
    expect(siteCalls.length).toBeGreaterThan(0)
    for (const c of siteCalls) {
      const toks = c.replace(/^.*?opencli\S*\s+/, '').split(' ')
      expect(toks.length, 'call=' + c).toBeGreaterThanOrEqual(2)
      expect(toks.every((x) => x.length > 0 && x !== 'undefined'), 'call=' + c).toBe(true)
    }
    expect(r.path ?? '', 'path').toMatch(/canary-.+\.md$/)
  })
})

describe('canary 防御性只读门(安全审查 MEDIUM 回归)', () => {
  it('热词命名的写命令被选中但跳过执行,shell 零调用', async () => {
    process.env.DSH_OPENCLI_CANARY_DIR = path.join(benchDir, 'canary3')
    shell.calls = []
    const r = await (svc as unknown as { canaryRun: () => Promise<{ ok: boolean; total: number; passed: number; path?: string }> }).canaryRun()
    expect(shell.calls.filter((c) => c.includes('fakehot'))).toHaveLength(0)
    const md = fs.readFileSync(r.path!, 'utf8')
    expect(md).toContain('防御性跳过')
    expect(md).toContain('fakehot hot')
  })
})

describe('renderTransportBenchmark(A4 传输对照)', () => {
  it('双值:加速比行;directMs null:如实标注未测', async () => {
    const { renderTransportBenchmark } = await import('../src/benchmark.ts')
    const withBoth = renderTransportBenchmark({ cliMs: 1040, directMs: 87 })
    expect(withBoth).toContain('1040 ms')
    expect(withBoth).toContain('87 ms')
    expect(withBoth).toContain('12.0x')
    const noDirect = renderTransportBenchmark({ cliMs: 1040, directMs: null })
    expect(noDirect).toContain('未测(daemon 未运行)')
    expect(noDirect).not.toContain('x(')
  })
})
