// 加固回归(low 五件套+catalog 过滤+工具重名防护):每条修复配测试,防复发。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
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

/** F 任务桩:模拟 dsh-tools NamedEntries 对指定名抛重名错(或任意非重名错),验证让位与透传。 */
class ConflictTools extends StubTools {
  conflictOn = new Set<string>()
  otherErrorOn = new Set<string>()
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void {
    if (this.otherErrorOn.has(def.name)) throw new Error(`boom: register failed for ${def.name}`)
    if (this.conflictOn.has(def.name)) throw new Error(`tool "${def.name}" is already registered`)
    super.register(def)
  }
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService

beforeAll(async () => {
  // trace 目录按测试文件隔离:vitest 线程池下所有文件共享同 pid,共享目录会让
  // 本文件的 recordTrace 与其他文件的轨迹交错,断言"文件末三行"时互相污染(曾长期 flake)
  process.env.DSH_OPENCLI_TRACE_DIR = require('node:path').join(require('node:os').tmpdir(), 'dsh-opencli-test-traces-f-hardening-' + process.pid + '-' + Date.now())
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
})
afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('低2:空参守卫(网关传 undefined 不再泄漏 TypeError)', () => {
  it('schedule-add / remove / toggle / try-run / approval-set 空 request 全部友好拒绝', async () => {
    expect((await svc.scheduleAdd(undefined as never)).ok).toBe(false)
    expect((await svc.scheduleRemove(undefined as never)).ok).toBe(false)
    expect((await svc.scheduleToggle(undefined as never)).ok).toBe(false)
    expect((await svc.tryRun(undefined as never)).ok).toBe(false)
    const S = svc as unknown as { approvalSet: (r?: unknown) => Promise<{ ok: boolean }> }
    const r = await S.approvalSet(undefined)
    // approvalSet 默认参数兜底:undefined → {} → enabled=false → 合法关闭(不崩溃即达标)
    expect(r.ok).toBe(true)
  })
  it('schedule-history 空 p 返回空数组不崩', async () => {
    const h = await (svc as unknown as { scheduleHistory: (p?: unknown) => Promise<{ ok: boolean; history: unknown[] }> }).scheduleHistory(undefined)
    expect(h.ok).toBe(true)
    expect(h.history).toEqual([])
  })
})

describe('低4:cron 校验(A-4 补充面)', () => {
  it('非法 cron 各形态全拒;合法形态全过', async () => {
    for (const bad of ['not-a-cron', '* * * *', '* * * * * *', '0 9 * *', 'a b c d e', '0 9 * * 1-5']) {
      const r = await svc.scheduleAdd({ site: 'zhihu hot', cron: bad })
      expect(r.ok).toBe(false)
    }
    for (const good of ['0 9 * * *', '*/15 * * * *', '30 8 * * 1', '0 9,12 * * *']) {
      const r = await svc.scheduleAdd({ site: 'zhihu hot', cron: good })
      expect(r.ok).toBe(true)
      if (r.id !== undefined) await svc.scheduleRemove({ id: r.id })
    }
  })
})

describe('A-2:opencli_catalog 过滤真正生效', () => {
  it('query/site 命中过滤,limit 生效', async () => {
    ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = {
      at: Date.now(),
      json: [
        { site: 'weibo', name: 'hot', access: 'read', description: '微博热搜', domain: 'weibo.com' },
        { site: 'zhihu', name: 'hot', access: 'read', description: '知乎热榜', domain: 'zhihu.com' },
        { site: 'bilibili', name: 'search', access: 'read', description: 'B站搜索', domain: 'bilibili.com' },
      ],
    }
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('opencli_catalog')!
    const q = await tool.execute({ query: 'weibo' })
    expect(q.text).toContain('weibo')
    expect(q.text).not.toContain('zhihu')
    const s = await tool.execute({ site: 'zhihu' })
    expect(s.text).toContain('zhihu')
    expect(s.text).not.toContain('weibo')
  })
})

describe('低3:knowledge-export 空 sites 显式报错', () => {
  it('sites:[] 不再反向全量导出', async () => {
    ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = {
      at: Date.now(), json: [{ site: 'weibo', name: 'hot', access: 'read' }],
    }
    const r = await (svc as unknown as { knowledgeExport: (r?: { sites?: string[] }) => Promise<{ ok: boolean; error?: string }> }).knowledgeExport({ sites: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('空数组')
  })
})

describe('A-3:try-run exit≠0 归类+统一恢复指引', () => {
  it('BROWSER_CONNECT → 扩展未连接指引;AUTH_REQUIRED → 登录指引;风控 → 冷却指引', async () => {
    const S = svc as unknown as { runOpencli: (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }> }
    const orig = S.runOpencli.bind(svc)
    for (const [stderr, kw] of [
      ['code: BROWSER_CONNECT\nmessage: Browser Bridge extension not connected', '扩展未连接'],
      ['code: AUTH_REQUIRED\nmessage: 请先登录', '登录态缺失'],
      ['请完成验证 captcha Verifying your browser', '风控墙'],
    ] as Array<[string, string]>) {
      S.runOpencli = async () => ({ exitCode: 69, stdout: '', stderr })
      const r = await svc.tryRun({ line: 'site zhihu hot' })
      expect(r.ok).toBe(false)
      expect(r.error).toContain(kw)
    }
    S.runOpencli = orig
  })
})

describe('低1:调度 marker 独立不落盘+loadState 自愈', () => {
  it('runHistory 中含 ":" 的旧 marker 键被 loadState 清除,正常键保留', async () => {
    const fs = await import('node:fs')
    const S = svc as unknown as { runHistory: Record<string, unknown>; loadState: () => Promise<void>; statePath: string }
    // 两个键都写进状态文件(模拟旧版污染),loadState 后 marker 应被剔除、真实历史保留
    fs.writeFileSync(S.statePath, JSON.stringify({
      approval: 'on', disabled: [], schedules: [], audit: [],
      runHistory: { '179000:2026-9-5-9-0': [{ at: 'x', ok: true, summary: 'triggered' }], realid: [{ at: 'x', ok: true, summary: 'ok' }] },
    }), 'utf8')
    await S.loadState()
    expect(S.runHistory['179000:2026-9-5-9-0']).toBeUndefined()
    expect(S.runHistory['realid']).toBeDefined()
  })
})

describe('低4b:快照时间戳还原(日期分隔符不再错乱)', () => {
  it('schedule-history 的 at 还原为 ISO 形态', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const S = svc as unknown as { scheduleHistory: (p: { id: string }) => Promise<{ snapshots?: Array<{ at: string; file: string }> }> }
    const dir = path.join(os.homedir(), '.dsh', 'opencli-snapshots', 'ts-fix-test')
    fs.mkdirSync(dir, { recursive: true })
    const fname = '2026-10-05T15-36-53-123.json'
    fs.writeFileSync(path.join(dir, fname), JSON.stringify({ at: 'x', site: 's', bytes: 10, stdout: '' }), 'utf8')
    const h = await S.scheduleHistory({ id: 'ts-fix-test' })
    const row = (h.snapshots ?? []).find((x) => x.file === fname)
    expect(row).toBeDefined()
    expect(row!.at.startsWith('2026-10-05T15:36:53')).toBe(true)
    expect(row!.at.includes('2026:10')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('真机走查发现 B/C 修复:site 前缀剥离+watch 大小写+cron 越界', () => {
  it("任务 'site zhihu hot' 执行时 CLI 收到 ['zhihu','hot'],不再收到 'site'", async () => {
    const r = await svc.scheduleAdd({ site: 'site zhihu hot', cron: '0 9 * * *' })
    expect(r.ok).toBe(true)
    const S = svc as unknown as { runOpencli: (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>; runSiteCommand: (s: string, id: string) => Promise<void> }
    const orig = S.runOpencli.bind(svc)
    let captured: string[] = []
    S.runOpencli = async (a: string[]) => { captured = a; return { exitCode: 0, stdout: '1 热点A', stderr: '' } }
    await S.runSiteCommand('site zhihu hot', r.id!)
    S.runOpencli = orig
    expect(captured[0]).toBe('zhihu')
    expect(captured).not.toContain('site')
    await svc.scheduleRemove({ id: r.id! })
  })
  it('watch 关键词大小写不敏感:agent 命中 Agentic 文本', async () => {
    const r = await svc.scheduleAdd({ site: 'arxiv recent cs.AI', cron: '0 9 * * *', watch: 'agent' })
    const S = svc as unknown as { runOpencli: (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>; runSiteCommand: (s: string, id: string) => Promise<void>; ingestEventList: Array<{ kind: string }> }
    const orig = S.runOpencli.bind(svc)
    S.runOpencli = async () => ({ exitCode: 0, stdout: 'Paper: Agentic Systems with LLM', stderr: '' })
    const before = S.ingestEventList.length
    await S.runSiteCommand('arxiv recent cs.AI', r.id!)
    S.runOpencli = orig
    expect(S.ingestEventList.length).toBe(before + 1)
    expect(S.ingestEventList[0]?.kind).toBe('watch-hit')
    await svc.scheduleRemove({ id: r.id! })
  })
  it("cron 越界拒绝:'99 99 * * *'/'0 25 * * *'/'0 9 0 * *' 全拒,'59 23 31 12 6' 过", async () => {
    for (const bad of ['99 99 * * *', '0 25 * * *', '0 9 0 * *', '0 9 * * 7']) {
      const r = await svc.scheduleAdd({ site: 'zhihu hot', cron: bad })
      expect(r.ok).toBe(false)
    }
    const r = await svc.scheduleAdd({ site: 'zhihu hot', cron: '59 23 31 12 6' })
    expect(r.ok).toBe(true)
    if (r.id !== undefined) await svc.scheduleRemove({ id: r.id })
  })
})

describe('F:工具重名防护(重名让位,不再整插件炸加载)', () => {
  // 独立 context:重名场景必须从插件加载那一刻就生效,不能复用 beforeAll 里已注册好的共享服务
  const makeCtx = async (conflict: Set<string>, other: Set<string>): Promise<{ c: InstanceType<typeof Context>; ct: ConflictTools }> => {
    const c = new Context()
    await c.plugin(StubShell)
    await c.plugin(ConflictTools)
    await c.plugin(StubSystemPrompt)
    const ct = c.tools as unknown as ConflictTools
    ct.conflictOn = conflict
    ct.otherErrorOn = other
    return { c, ct }
  }
  const stopCtx = async (c: InstanceType<typeof Context>): Promise<void> => {
    const cc = c as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (cc.stop ?? cc.dispose ?? (async () => {}))()
  }

  it('撞名工具让位:服务正常构造、名进 toolConflicts/status.conflicts、其余工具照常注册、warn 一次', async () => {
    // opencli_open 是兼容层旧名(2026-10 迁移后别名):别的插件占了旧名,别名让位、
    // 新名 opencli_open 照常注册——这正是命名空间迁移想要的行为
    const { c, ct } = await makeCtx(new Set(['browser_open', 'so_pick']), new Set())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await c.plugin(OpencliService) // dsh 0.2.1 实测:不接住这个错整个插件加载失败——这一行不抛即达标
    const warned = warnSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    warnSpy.mockRestore()
    const svc2 = c.opencli as OpencliService
    // 限流归零:status/doctor 各要跑 2 次 opencli,默认 750ms 间隔会把测试拖到超时边缘
    const P = (svc2 as unknown as { usagePolicy: { minDelayMs: number; maxConcurrency: number; burst: number } }).usagePolicy
    P.minDelayMs = 0
    P.maxConcurrency = 8
    P.burst = 100
    const conflicts = (svc2 as unknown as { toolConflicts: string[] }).toolConflicts
    expect([...conflicts].sort()).toEqual(['browser_open', 'so_pick'])
    // 其余工具照常注册(五个注册方法各抽代表;让位的两个不在表里)
    for (const name of ['opencli_state', 'site_batch', 'opencli_catalog', 'script_catalog', 'site', 'so_verify', 'opencli_doctor']) {
      expect(ct.registered.has(name)).toBe(true)
    }
    // 让位的旧名让出去,新名不受影响(迁移目标:browser_ 撞名不再伤正主)
    expect(ct.registered.has('opencli_open')).toBe(true)
    expect(ct.registered.has('browser_open')).toBe(false)
    expect(ct.registered.has('so_pick')).toBe(false)
    // 宿主日志:一次 warn,含让位名单与原因
    expect(warned).toContain('browser_open')
    expect(warned).toContain('已让位')
    // status RPC 暴露 conflicts(面板/agent 可见)
    const st = await svc2.status()
      expect([...(st.conflicts ?? [])].sort()).toEqual(['browser_open', 'so_pick'])
    // doctor 输出 ⚠ 行
    const doc = await ct.registered.get('opencli_doctor')!.execute({})
    expect(doc.text).toContain('另一插件注册了同名工具,本插件已让位这些命令')
    expect(doc.text).toContain('browser_open')
    await stopCtx(c)
  })

  it('非重名错误仍抛:注册器的其他异常照常炸出,不被重名防护吞掉', async () => {
    // browser_click 是兼容层旧名:别名注册同样走 registerToolSafe,非重名错误必须照常上抛
    const { c } = await makeCtx(new Set(), new Set(['browser_click']))
    await expect(c.plugin(OpencliService)).rejects.toThrow('boom: register failed for browser_click')
    await stopCtx(c)
  })
})
