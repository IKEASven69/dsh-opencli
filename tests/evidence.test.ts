/**
 * 写操作证据包(任务 D)单测:
 * - buildEvidence 形状(纯函数,显式 at 保证确定性)/ head 截断 / approval 两种形态;
 * - saveEvidence 落盘命名 + 100 份轮转;
 * - 放行路:桩 shell 驱动真实 site 工具(1.x 桩,截图命令真实落文件),断言 before/after 双截图 + 一包证据;
 * - 拒绝路:桩审批(以 host 真实拒绝文本驱动 tools/pre-execute→ask 与 tools/post-execute→isError,
 *   等效于 dsh-tools serviceAsk 返回 rejected),断言落一包 approval.reason='blocked' 且无截图;
 * - evidence-list:文件名元数据(路径/时间/站点/字节),不读全文。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService, buildEvidence, saveEvidence, EVIDENCE_KEEP } from '../lib/index.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const LIST_JSON = JSON.stringify([
  { command: 'zhihu/hot', site: 'zhihu', name: 'hot', description: '知乎热榜', access: 'read', domain: 'zhihu.com' },
  { command: 'zhihu/comment', site: 'zhihu', name: 'comment', description: '发评论', access: 'write', domain: 'zhihu.com' },
  { command: 'bilibili/search', site: 'bilibili', name: 'search', description: '搜索', access: 'read', domain: 'bilibili.com' },
])

class StubShell extends Service {
  /** 截图命令真实落文件:captureStepShot 只在 existsSync 后才认截图成功 */
  shots: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = spec.command
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: 'opencli v1.8.6\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: LIST_JSON }, stderr: { text: '' } }
    if (cmd.includes('screenshot')) {
      // 末段即目标路径(绝对路径无空格;bin 前缀不影响取尾)
      const file = cmd.split(/\s+/).slice(-1)[0] ?? ''
      try { fs.writeFileSync(file, 'png') ; this.shots.push(file) } catch { /* 写不进则截图链路自然降级 */ }
      return { exitCode: 0, stdout: { text: 'saved\n' }, stderr: { text: '' } }
    }
    if (cmd.includes('zhihu comment')) return { exitCode: 0, stdout: { text: 'posted-ok\n' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
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
let evidenceDir: string

beforeAll(async () => {
  // 三个落盘目录全部按测试文件隔离(照 tests/cli2.test.ts 顶部的写法):共享目录会让
  // 并行测试文件的轨迹/截图/证据互相污染,"目录里恰好一份"类断言必然 flake
  const uniq = `${process.pid}-${Date.now()}`
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-evidence-' + uniq)
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-evidence-' + uniq)
  evidenceDir = path.join(os.tmpdir(), 'dsh-opencli-test-evidence-f-evidence-' + uniq)
  process.env.DSH_OPENCLI_EVIDENCE_DIR = evidenceDir
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: StubShell }).shell
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

const S = (): Record<string, any> => svc as unknown as Record<string, any>

const dispatchPre = async (name: string, args: Record<string, unknown>): Promise<{ kind: string; reason?: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>
  }).waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

/** 桩审批的拒绝侧:模拟 dsh-tools serviceAsk 返回 rejected 后 host 落地的 isError 结果
 *  (派发前拒绝同样经 finalizeScheduledExecution → tools/post-execute waterfall)。 */
const dispatchPost = async (name: string, args: Record<string, unknown>, result: unknown): Promise<{ kind: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, result: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string }>
  }).waterfall('tools/post-execute', exec, result, async () => ({ kind: 'accept' }))
}

const packs = (): Array<Record<string, any>> =>
  fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8')))
    : []

describe('buildEvidence 形状(纯函数)', () => {
  it('显式入参逐字段进包,approval 对象原样保留', () => {
    const r = buildEvidence({
      at: '2026-10-20T08:09:10.123Z', command: 'site zhihu comment', argv: ['zhihu', 'comment', 'hi'],
      approval: { mode: 'on', reason: null }, beforeShot: 'D:/a.png', afterShot: 'D:/b.png',
      result: { exitCode: 0, head: 'posted-ok' }, site: 'zhihu',
    })
    expect(r).toEqual({
      at: '2026-10-20T08:09:10.123Z', command: 'site zhihu comment', argv: ['zhihu', 'comment', 'hi'],
      approval: { mode: 'on', reason: null }, beforeShot: 'D:/a.png', afterShot: 'D:/b.png',
      shotNote: '近似取证:截图为 dsh 会话当前页,非命令实际作用页(适配器经 daemon 浏览器执行)',
      result: { exitCode: 0, head: 'posted-ok' }, site: 'zhihu',
    })
  })
  it('shotNote:无截图时为 null', () => {
    const r = buildEvidence({ command: 'c', argv: [], approval: null, result: { exitCode: 0, head: 'h' }, site: 'a' })
    expect(r.shotNote).toBeNull()
  })
  it('approval 允许 null;argv 强转字符串;head 截 200 字;截图缺省为 null', () => {
    const r = buildEvidence({
      command: 123, argv: [1, 'a', true], approval: null,
      result: { exitCode: '3', head: 'x'.repeat(260) }, site: 'weibo',
    })
    expect(r.approval).toBeNull()
    expect(r.argv).toEqual(['1', 'a', 'true'])
    expect(r.beforeShot).toBeNull()
    expect(r.afterShot).toBeNull()
    expect(r.result.exitCode).toBe(3)
    expect(r.result.head.length).toBe(200)
    expect(typeof r.at).toBe('string')
    expect(Number.isNaN(Date.parse(r.at))).toBe(false)
  })
})

describe('saveEvidence 落盘与轮转', () => {
  it('文件名 <时间戳>-<site>.json;site 剥离路径字符', async () => {
    const dir = path.join(os.tmpdir(), 'dsh-opencli-test-ev-rot-' + process.pid + '-' + Date.now())
    const rec = buildEvidence({ at: '2026-10-20T08:09:10.123Z', command: 'c', argv: [], approval: null, result: { exitCode: 0, head: 'h' }, site: 'a/b' })
    const file = await saveEvidence(dir, rec)
    expect(path.basename(file)).toBe('2026-10-20T08-09-10-123Z-a_b.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).site).toBe('a/b')
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it(`写 ${EVIDENCE_KEEP + 3} 份只留最新 ${EVIDENCE_KEEP} 份(字典序=时间序删最旧);keep 可覆盖`, async () => {
    const dir = path.join(os.tmpdir(), 'dsh-opencli-test-ev-keep-' + process.pid + '-' + Date.now())
    const at = (i: number): string => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()
    const stamp = (iso: string): string => iso.replace(/[:.]/g, '-')
    for (let i = 0; i < EVIDENCE_KEEP + 3; i++) {
      await saveEvidence(dir, buildEvidence({ at: at(i), command: 'c', argv: [], approval: null, result: { exitCode: 0, head: 'h' }, site: 'zhihu' }))
    }
    const names = fs.readdirSync(dir).sort()
    expect(names).toHaveLength(EVIDENCE_KEEP)
    // 最旧的 at(0..2) 已被删,存活最早一份是 at(3),最新一份是 at(EVIDENCE_KEEP+2)
    expect(names.includes(`${stamp(at(0))}-zhihu.json`)).toBe(false)
    expect(names.includes(`${stamp(at(2))}-zhihu.json`)).toBe(false)
    expect(names[0]).toBe(`${stamp(at(3))}-zhihu.json`)
    expect(names.at(-1)).toBe(`${stamp(at(EVIDENCE_KEEP + 2))}-zhihu.json`)
    for (let i = 0; i < 5; i++) await saveEvidence(dir, buildEvidence({ at: at(200 + i), command: '', argv: [], approval: null, result: { exitCode: 0, head: '' }, site: 'weibo' }), 3)
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length).toBe(3)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('放行路:审批门放行的写命令落一包(桩 shell,截图真实落文件)', () => {
  it('site zhihu comment(write)执行前后各一张截图 + 证据包字段齐全', async () => {
    S().state.approval = 'on'
    S().adapterCache = null
    shell.shots = []
    const tool = (ctx as unknown as { tools: StubTools }).tools.registered.get('site')!
    const r = await tool.execute({ adapter: 'zhihu', command: 'comment', args: ['hello'] })
    expect(r.text).toContain('posted-ok')
    // 双截图:before/after 两次 screenshot 调用,文件真实存在且路径不同
    expect(shell.shots).toHaveLength(2)
    for (const s of shell.shots) expect(fs.existsSync(s)).toBe(true)
    // 恰好一包
    const all = packs()
    expect(all).toHaveLength(1)
    const p = all[0]!
    expect(p.site).toBe('zhihu')
    expect(p.command).toBe('site zhihu comment')
    expect(p.argv).toEqual(['zhihu', 'comment', 'hello'])
    expect(p.approval).toEqual({ mode: 'on', reason: null })
    expect(p.beforeShot).toBe(shell.shots[0])
    expect(p.afterShot).toBe(shell.shots[1])
    expect(p.result.exitCode).toBe(0)
    expect(p.result.head).toContain('posted-ok')
    expect(Number.isNaN(Date.parse(p.at))).toBe(false)
  })
  it('读命令(bilibili search)不落证据包', async () => {
    const tool = (ctx as unknown as { tools: StubTools }).tools.registered.get('site')!
    await tool.execute({ adapter: 'bilibili', command: 'search', args: ['kw'] })
    expect(packs()).toHaveLength(1)
  })
  it('失败也落盘:write 命令 exit≠0 同样一包(证据比成功更重要)', async () => {
    const before = packs().length
    const S2 = S()
    const orig = S2.runOpencli as (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    S2.runOpencli = async (a: string[]) => (a.includes('comment') ? { exitCode: 4, stdout: '', stderr: 'AUTH_REQUIRED' } : orig(a))
    try {
      const tool = (ctx as unknown as { tools: StubTools }).tools.registered.get('site')!
      await tool.execute({ adapter: 'zhihu', command: 'comment', args: ['x'] })
    } finally { S2.runOpencli = orig }
    const all = packs()
    expect(all).toHaveLength(before + 1)
    const p = all.at(-1)!
    expect(p.result.exitCode).toBe(4)
    expect(p.result.head).toContain('AUTH_REQUIRED')
  })
})

describe('拒绝路:桩审批拒绝 → 一包 reason=blocked', () => {
  it('pre-execute ask 后 post-execute 落 isError 拒绝结果 → 补 blocked 包', async () => {
    S().state.approval = 'on'
    const before = packs().length
    // ① 审批门:write → ask(真实链路里 host 此时弹审批,桩审批返回 rejected)
    const d = await dispatchPre('site', { adapter: 'zhihu', command: 'comment', args: ['x'] })
    expect(d.kind).toBe('ask')
    expect(packs()).toHaveLength(before) // ask 本身不落包(用户还没拒绝)
    // ② host 拒绝落点:执行体不会跑,唯一可见的是 post-execute 的 isError 结果
    const denied = { isError: true, error: { message: 'the user rejected tool "site"' }, content: [{ type: 'text', text: 'Error: the user rejected tool "site"' }] }
    await dispatchPost('site', { adapter: 'zhihu', command: 'comment', args: ['x'] }, denied)
    const all = packs()
    expect(all).toHaveLength(before + 1)
    const p = all.at(-1)!
    expect(p.approval).toEqual({ mode: 'on', reason: 'blocked' })
    expect(p.argv).toEqual(['zhihu', 'comment', 'x'])
    expect(p.result.exitCode).toBe(-1)
    expect(p.result.head).toContain('rejected')
    expect(p.beforeShot).toBeNull()
    expect(p.afterShot).toBeNull()
  })
  it('非拒绝形态不落包:成功结果 / 读命令被拒 / 非本插件关切文本', async () => {
    const before = packs().length
    await dispatchPost('site', { adapter: 'zhihu', command: 'comment' }, { isError: false, content: [] })
    await dispatchPost('site', { adapter: 'bilibili', command: 'search' }, { isError: true, error: { message: 'the user rejected tool "site"' }, content: [] })
    await dispatchPost('site', { adapter: 'zhihu', command: 'comment' }, { isError: true, error: { message: 'some unrelated failure' }, content: [] })
    expect(packs()).toHaveLength(before)
  })
})

describe('evidence-list RPC(路径+元数据,不读全文)', () => {
  it('倒序返回最近 20 条,字段来自文件名与 stat', async () => {
    const r = await S().evidenceList()
    expect(r.ok).toBe(true)
    expect(r.items.length).toBeGreaterThanOrEqual(3)
    expect(r.items.length).toBeLessThanOrEqual(20)
    for (const it of r.items) {
      expect(fs.existsSync(it.file)).toBe(true)
      expect(it.site).toBe('zhihu')
      expect(it.bytes).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(it.at))).toBe(false)
    }
    // 倒序:第一条的时间不早于最后一条
    expect(Date.parse(r.items[0]!.at)).toBeGreaterThanOrEqual(Date.parse(r.items.at(-1)!.at))
  })
  it('目录不存在时返回空表而非错误', async () => {
    // evidenceDir 是构造期属性(读 env 的时机在插件装配),环境变量后改无效——直接换属性验证
    const real = S().evidenceDir as string
    S().evidenceDir = path.join(os.tmpdir(), 'dsh-opencli-test-ev-none-' + process.pid + '-' + Date.now())
    try {
      const r2 = await S().evidenceList()
      expect(r2.ok).toBe(true)
      expect(r2.items).toEqual([])
    } finally { S().evidenceDir = real }
  })
})

describe('证据覆盖面(评审:unknown 权限拒绝也要留痕)', () => {
  it('目录外命令被拒 → 同样落 blocked 包(目录外的命令恰是最可疑的一类)', async () => {
    const before = packs().length
    const res = { isError: true, error: { message: 'site nope doog requires approval — 是写操作' } }
    await dispatchPost('site', { adapter: 'nope', command: 'doog' }, res)
    const after = packs()
    expect(after.length).toBe(before + 1)
    const pack = after.find((p) => String(p.command).includes('nope'))
    expect(pack).toBeDefined()
    expect(String(pack.approval?.reason)).toContain('blocked')
  })
})
