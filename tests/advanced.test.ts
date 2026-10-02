/**
 * 高级能力单测:覆盖 0.3.x 新增的 @Remote(不经模型会话,直接调 service 方法)。
 * 用桩 shell/tools/systemPrompt 挂载真实 OpencliService(lib/index.js)。
 * 覆盖:schedule-add/list / replay / script-catalog/validate/userscript-run /
 * recipe-run / automation-search/develop/run / automation-mode-get/set / rulepacks-list/set。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService, scanOpencliAcrossNodeVersions } from '../lib/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = spec.command
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v1.8.7\nPort: 19825\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: '[]' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
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

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  // 默认装"SystemOne 不可用"桩:verifyResult 走 null 降级,老行为全部保持
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('测试隔离(状态文件不碰真实用户数据)', () => {
  it('statePath 指向临时目录,绝不写 ~/.dsh/dsh-opencli-state.json', () => {
    const sp = (svc as unknown as { statePath: string }).statePath
    expect(sp).not.toContain('.dsh')
    expect(sp).toContain('dsh-opencli-test-state')
  })
})

describe('schedule 桩(schedule-add/list)', () => {
  it('空 site 拒绝', async () => {
    const r = await svc.scheduleAdd({ site: '  ', cron: '0 9 * * *' })
    expect(r.ok).toBe(false)
  })

  it('空 cron 拒绝', async () => {
    const r = await svc.scheduleAdd({ site: 'zhihu hot', cron: '' })
    expect(r.ok).toBe(false)
  })

  it('正常创建并可在 list 中查到', async () => {
    const name = `ut-${Date.now()}`
    const r = await svc.scheduleAdd({ site: name, cron: '0 9 * * *' })
    expect(r.ok).toBe(true)
    const l = await svc.scheduleList()
    expect(l.ok).toBe(true)
    expect(l.schedules.some((s) => s.site === name)).toBe(true)
  })
})

describe('watch 关键词监控(主线 B 第一片)', () => {
  type Svc = {
    schedules: Array<{ id: string; site: string; cron: string; watch?: string }>
    ingestEventList: Array<{ kind: string; text: string }>
    runSiteCommand: (siteCmd: string, id: string) => Promise<void>
    runOpencli: (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  }
  const S = (): Svc => svc as unknown as Svc

  it('schedule-add 落盘 watch 字段;重复 add 更新 watch 不产生僵尸副本', async () => {
    const site = `wt-${Date.now()}`
    const r1 = await svc.scheduleAdd({ site, cron: '0 9 * * *', watch: '国庆,放假' })
    expect(r1.ok).toBe(true)
    const r2 = await svc.scheduleAdd({ site, cron: '0 9 * * *', watch: '热搜第一' })
    expect(r2.ok).toBe(true)
    expect(r2.id).toBe(r1.id)
    expect(S().schedules.filter((s) => s.site === site)).toHaveLength(1)
    expect(S().schedules.find((s) => s.site === site)?.watch).toBe('热搜第一')
    await svc.scheduleRemove({ id: r1.id! })
  })

  it('runSiteCommand:结果含关键词 → ingest 事件 watch-hit;不含 → 无事件', async () => {
    const site = `wt2-${Date.now()}`
    const r = await svc.scheduleAdd({ site, cron: '0 9 * * *', watch: '降薪,破产' })
    const id = r.id!
    const origRun = S().runOpencli.bind(svc)
    S().runOpencli = async () => ({ exitCode: 0, stdout: '1 某大厂宣布全员降薪 热度984万 2 十一旅游推荐 热度500万', stderr: '' })
    const eventsBefore = S().ingestEventList.length
    await S().runSiteCommand(site, id)
    expect(S().ingestEventList.length).toBe(eventsBefore + 1)
    expect(S().ingestEventList[0]?.kind).toBe('watch-hit')
    expect(S().ingestEventList[0]?.text).toContain('降薪')
    // 不含关键词:无新事件
    S().runOpencli = async () => ({ exitCode: 0, stdout: '1 某明星官宣结婚 热度442万', stderr: '' })
    const n = S().ingestEventList.length
    await S().runSiteCommand(site, id)
    expect(S().ingestEventList.length).toBe(n)
    S().runOpencli = origRun as Svc['runOpencli']
    await svc.scheduleRemove({ id })
  })
})

describe('schedule 开关/删除(schedule-toggle/remove)', () => {
  it('未知 id 拒绝', async () => {
    expect((await svc.scheduleToggle({ id: 'no-such', enabled: false })).ok).toBe(false)
    expect((await svc.scheduleRemove({ id: 'no-such' })).ok).toBe(false)
  })

  it('创建 → 关停 → list 见 enabled=false → 删除', async () => {
    const name = `ut-tg-${Date.now()}`
    const c = await svc.scheduleAdd({ site: name, cron: '0 9 * * *' })
    expect(c.ok).toBe(true)
    const id = (await svc.scheduleList()).schedules.find((s) => s.site === name)?.id ?? ''
    expect(id.length > 0).toBe(true)
    expect((await svc.scheduleToggle({ id, enabled: false })).ok).toBe(true)
    expect((await svc.scheduleList()).schedules.find((s) => s.id === id)?.enabled).toBe(false)
    expect((await svc.scheduleRemove({ id })).ok).toBe(true)
    expect((await svc.scheduleList()).schedules.some((s) => s.id === id)).toBe(false)
  })
})

describe('try-run(面板“试试看”后端)', () => {
  it('空命令拒绝', async () => {
    expect((await svc.tryRun({ line: '   ' })).ok).toBe(false)
  })

  it('非 site 开头拒绝', async () => {
    const r = await svc.tryRun({ line: 'hello world' })
    expect(r.ok).toBe(false)
  })

  it('site 单词不足拒绝', async () => {
    const r = await svc.tryRun({ line: 'site arxiv' })
    expect(r.ok).toBe(false)
  })

  it('合法 site 行透传桩 shell 成功', async () => {
    const r = await svc.tryRun({ line: 'site arxiv recent cs.AI' })
    expect(r.ok).toBe(true)
  })
})

describe('真实性判定(noul 体检:site_batch/try-run 共用)', () => {
  function installSoStub(opts: { bySite?: Record<string, number>; unavailable?: boolean }): { calls: number } {
    const state = { calls: 0 }
    ;(svc as unknown as { so: unknown }).so = {
      configured: !opts.unavailable,
      ask: async (_stateText: string, questions: { valid?: { instructions?: string } }) => {
        state.calls++
        if (opts.unavailable) return { ok: false, answers: {}, latencyMs: 1, error: 'mock-down' }
        const m = /site (\S+) /.exec(questions.valid?.instructions ?? '')
        const p = opts.bySite?.[m?.[1] ?? ''] ?? 0.95
        return { ok: true, latencyMs: 2, answers: { valid: { type: 'noul', value: p, confidence: 0.9 } } }
      },
    }
    return state
  }
  const verifyResult = (s: string, c: string, t: string): Promise<{ verdict: boolean; p: number; why?: string } | null> =>
    (svc as unknown as { verifyResult: (...a: [string, string, string]) => Promise<{ verdict: boolean; p: number; why?: string } | null> }).verifyResult.call(svc, s, c, t)

  it('try-run:exit 0 但内容强失效(P=0.05)→ ok:false 并说明原因', async () => {
    installSoStub({ bySite: { arxiv: 0.05 } })
    const r = await svc.tryRun({ line: 'site arxiv recent cs.AI' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('判定无效')
    expect(r.error).toContain('P=0.05')
  })

  it('try-run:内容有效(P=0.95)→ ok:true 且带实测有效标注', async () => {
    installSoStub({ bySite: { arxiv: 0.95 } })
    const r = await svc.tryRun({ line: 'site arxiv recent cs.AI' })
    expect(r.ok).toBe(true)
    expect(r.text).toContain('实测有效')
    expect(r.text).toContain('P=0.95')
  })

  it('verifyResult:空结果走快速通道,不消耗推理调用', async () => {
    const state = installSoStub({})
    const v = await verifyResult('zhihu', 'hot', '[]')
    expect(v).toEqual({ verdict: false, p: 0, why: '空输出' })
    expect(state.calls).toBe(0)
  })

  it('verifyResult:规则层命中失败词汇/风控墙/错误 JSON,均不消耗推理', async () => {
    const state = installSoStub({})
    for (const text of [
      'EMPTY_RESULT: no data returned for this query',
      '{"error":"Navigation rejected","code":"COMMAND_EXEC"}',
      '请先登录后再继续操作,或运行 opencli zhihu login',
      'Verifying your browser before accessing — click the checkbox to continue',
    ]) {
      const v = await verifyResult('reddit', 'hot', text)
      expect(v?.verdict).toBe(false)
      expect(v?.why).toBeTruthy()
    }
    expect(state.calls).toBe(0)
  })

  it('verifyResult:正常文本走 noul 兜底(消耗一次推理)', async () => {
    const state = installSoStub({ bySite: { zhihu: 0.93 } })
    const v = await verifyResult('zhihu', 'hot', '1 某大厂宣布全员降薪 热度984万 2 十一旅游推荐 热度500万')
    expect(v).toEqual({ verdict: true, p: 0.93 })
    expect(state.calls).toBe(1)
  })

  it('verifyResult:noul 低置信(0.5)→ 可疑但 verdict=true(只标注)', async () => {
    installSoStub({ bySite: { zhihu: 0.5 } })
    const v = await verifyResult('zhihu', 'hot', '一段规则放行的普通文本内容')
    expect(v?.verdict).toBe(true)
    expect(v?.p).toBeCloseTo(0.5)
    expect(v?.why).toContain('可疑')
  })

  it('try-run:SystemOne 不可用 → 降级为原行为(不标注不拦截)', async () => {
    installSoStub({ unavailable: true })
    const r = await svc.tryRun({ line: 'site arxiv recent cs.AI' })
    expect(r.ok).toBe(true)
    expect(r.text).not.toContain('实测')
  })

  it('site_batch:混合结果 → 逐站标注 + 汇总疑似静默失败计数', async () => {
    installSoStub({ bySite: { zhihu: 0.93, weibo: 0.08 } })
    const tool = ctx.tools.registered.get('site_batch')
    expect(tool).toBeDefined()
    const r = await tool!.execute({ command: 'hot', sites: ['zhihu', 'weibo'] })
    expect(r.text).toContain('1 站疑似静默失败')
    expect(r.text).toContain('== zhihu ✓(实测有效 P=0.93)')
    expect(r.text).toContain('== weibo ✓(⚠ 疑似静默失败')
  })

  it('site_batch preflight:同域站点串行化并在输出注明;不同域照常并行', async () => {
    installSoStub({})
    // 目录缓存:twitter 与 x 同域(twitter.com),zhihu/bilibili 各自独立域
    ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = {
      at: Date.now(),
      json: [
        { site: 'twitter', name: 'hot', access: 'read', domain: 'twitter.com' },
        { site: 'x', name: 'hot', access: 'read', domain: 'twitter.com' },
        { site: 'zhihu', name: 'hot', access: 'read', domain: 'zhihu.com' },
        { site: 'bilibili', name: 'hot', access: 'read', domain: 'bilibili.com' },
      ],
    }
    const tool = ctx.tools.registered.get('site_batch')!
    const r = await tool.execute({ command: 'hot', sites: ['twitter', 'x', 'zhihu', 'bilibili'] })
    expect(r.text).toContain('preflight:同域冲突已串行化(twitter + x → twitter.com)')
    // 四站结果齐全且按请求顺序
    const order = ['twitter', 'x', 'zhihu', 'bilibili'].map((s) => r.text.indexOf(`== ${s} `))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // 不同域不产生 preflight 注记
    const r2 = await tool.execute({ command: 'hot', sites: ['zhihu', 'bilibili'] })
    expect(r2.text).not.toContain('preflight')
  })

  it('site_batch:目录内不存在的站给出拼写提醒', async () => {
    installSoStub({})
    ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = {
      at: Date.now(),
      json: [{ site: 'zhihu', name: 'hot', access: 'read', domain: 'zhihu.com' }],
    }
    const tool = ctx.tools.registered.get('site_batch')!
    const r = await tool.execute({ command: 'hot', sites: ['zhihu', 'zhihuu'] })
    expect(r.text).toContain('目录预检:以下站点不在适配器目录')
    expect(r.text).toContain('zhihuu')
  })
})

describe('replay 桩', () => {
  it('空 step 拒绝', async () => {
    const r = await svc.replay({ step: '   ' })
    expect(r.ok).toBe(false)
  })

  it('未知步骤拒绝', async () => {
    const r = await svc.replay({ step: 'frobnicate xyz' })
    expect(r.ok).toBe(false)
  })
})

describe('脚本桩(script-catalog/validate/userscript-run)', () => {
  it('catalog 给出 4 个内置只读脚本', async () => {
    const r = await svc.scriptCatalog()
    expect(r.ok).toBe(true)
    expect(r.scripts.map((s) => s.name).sort()).toEqual(['article', 'forms', 'jsonld', 'links'])
  })

  it('缺 @match 的源码校验不通过', async () => {
    const r = await svc.scriptValidate({ code: 'return 1' })
    expect(r.ok).toBe(false)
  })

  it('超 64KB 拒绝', async () => {
    const code = `// ==UserScript==\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\n${'x'.repeat(70 * 1024)}`
    const r = await svc.scriptValidate({ code })
    expect(r.ok).toBe(false)
  })

  it('合法脚本通过并给出 meta', async () => {
    const code = '// ==UserScript==\n// @name UT\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1'
    const r = await svc.scriptValidate({ code })
    expect(r.ok).toBe(true)
    expect(r.meta?.grant).toBe('none')
  })

  it('非法源码 userscript-run 直接拒绝(不执行)', async () => {
    const r = await svc.userscriptRun({ code: 'return 1', url: 'https://example.com/' })
    expect(r.ok).toBe(false)
  })
})

describe('recipe-run 桩', () => {
  it('空 steps 拒绝', async () => {
    const r = await svc.recipeRun({ steps: [] })
    expect(r.ok).toBe(false)
  })

  it('超 25 步拒绝', async () => {
    const steps = Array.from({ length: 26 }, () => ({ type: 'wait' as const }))
    const r = await svc.recipeRun({ steps })
    expect(r.ok).toBe(false)
  })

  it('未知步骤类型拒绝', async () => {
    const r = await svc.recipeRun({ steps: [{ type: 'frobnicate' }] })
    expect(r.ok).toBe(false)
  })
})

describe('automation 检索/开发/运行桩', () => {
  it('search 返回数组', async () => {
    const r = await svc.automationSearch({})
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.hits)).toBe(true)
  })

  it('develop 未知 action 拒绝', async () => {
    const r = await svc.automationDevelop({ action: 'frobnicate' })
    expect(r.ok).toBe(false)
  })

  it('run 未知 id 拒绝', async () => {
    const r = await svc.automationRun({ id: 'no-such-id' })
    expect(r.ok).toBe(false)
  })
})

describe('automation-mode 4 档', () => {
  it('非法模式拒绝', async () => {
    const r = await svc.automationModeSet({ mode: 'yolo' })
    expect(r.ok).toBe(false)
  })

  it('set/get 往返', async () => {
    expect((await svc.automationModeSet({ mode: 'read-only' })).ok).toBe(true)
    expect((await svc.automationModeGet()).mode).toBe('read-only')
    expect((await svc.automationModeSet({ mode: 'standard' })).ok).toBe(true)
    expect((await svc.automationModeGet()).mode).toBe('standard')
  })
})

describe('rulepacks 校验', () => {
  it('非数组拒绝', async () => {
    const r = await svc.rulePacksSet({ packs: 'x' as unknown as [] })
    expect(r.ok).toBe(false)
  })

  it('sha 非 64 位拒绝', async () => {
    const r = await svc.rulePacksSet({ packs: [{ matches: ['example.com'], initScriptPath: 'D:/r.js', initScriptSha256: 'abc', steps: [] }] })
    expect(r.ok).toBe(false)
  })

  it('空路径拒绝', async () => {
    const r = await svc.rulePacksSet({ packs: [{ matches: ['example.com'], initScriptPath: '', initScriptSha256: 'a'.repeat(64), steps: [] }] })
    expect(r.ok).toBe(false)
  })

  it('合法 pack 通过且 list 可见', async () => {
    const packs = [{ matches: ['example.com'], initScriptPath: 'D:/r.js', initScriptSha256: 'a'.repeat(64), steps: [] }]
    expect((await svc.rulePacksSet({ packs })).ok).toBe(true)
    const l = await svc.rulePacksList()
    expect(l.ok).toBe(true)
    expect(l.packs.length).toBeGreaterThan(0)
    expect((await svc.rulePacksSet({ packs: [] })).ok).toBe(true)
  })
})

describe('scanOpencliAcrossNodeVersions(vfox 版本切换免疫,纯函数)', () => {
  const mk = (root: string, rel: string): string => {
    const dir = path.join(root, rel, 'dist', 'src')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'main.js'), '// opencli')
    return path.join(dir, 'main.js')
  }

  it('vfox cache 双层结构(v-24.18.0/nodejs-24.18.0)能扫到,且取最高版本', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfoxscan-'))
    const old = mk(root, 'v-24.18.0/nodejs-24.18.0')
    const neu = mk(root, 'v-24.21.0/nodejs-24.21.0')
    const got = scanOpencliAcrossNodeVersions([root])
    expect(got).toBe(neu)
    expect(got).not.toBe(old)
  })

  it('sdks 平铺结构(24.18.0 直接一层)也能扫到', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdkscan-'))
    const p = mk(root, '24.18.0')
    expect(scanOpencliAcrossNodeVersions([root])).toBe(p)
  })

  it('不存在的根目录/无 opencli 的根目录返回 null,不抛错', () => {
    expect(scanOpencliAcrossNodeVersions([path.join(os.tmpdir(), 'no-such-root-xyz')])).toBeNull()
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))
    expect(scanOpencliAcrossNodeVersions([empty])).toBeNull()
  })

  it('多根并存时全局取最高版本(含跨根比较)', () => {
    const r1 = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-'))
    const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-'))
    mk(r1, 'v-24.21.0/nodejs-24.21.0')
    const low = mk(r2, 'v-22.1.0/nodejs-22.1.0')
    // r1 的 24.21 > r2 的 22.1,应取 r1;顺序倒过来也一样
    expect(scanOpencliAcrossNodeVersions([r2, r1])).toMatch(/24\.21\.0/)
    expect(scanOpencliAcrossNodeVersions([r2])).toBe(low)
  })
})

describe('采集快照落盘(主线 B)', () => {
  it('runSiteCommand 成功执行后写快照文件,schedule-history 返回快照索引', async () => {
    const site = `snap-${Date.now()}`
    const r = await svc.scheduleAdd({ site, cron: '0 9 * * *' })
    const S = svc as unknown as { runOpencli: (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>; runSiteCommand: (s: string, id: string) => Promise<void> }
    const orig = S.runOpencli.bind(svc)
    S.runOpencli = async () => ({ exitCode: 0, stdout: '1 热点A 热度100 2 热点B 热度90 3 热点C 热度80', stderr: '' })
    await S.runSiteCommand(site, r.id!)
    S.runOpencli = orig
    const h = await svc.scheduleHistory({ id: r.id! })
    expect(h.ok).toBe(true)
    expect((h.snapshots ?? []).length).toBeGreaterThanOrEqual(1)
    expect(h.snapshots![0].bytes).toBeGreaterThan(0)
    await svc.scheduleRemove({ id: r.id! })
  })
})
