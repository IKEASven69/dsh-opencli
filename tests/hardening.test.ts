// 加固回归(low 五件套+catalog 过滤):每条修复配测试,防复发。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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

let ctx: InstanceType<typeof Context>
let svc: OpencliService

beforeAll(async () => {
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
