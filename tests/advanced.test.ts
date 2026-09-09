/**
 * 高级能力单测:覆盖 0.3.x 新增的 @Remote(不经模型会话,直接调 service 方法)。
 * 用桩 shell/tools/systemPrompt 挂载真实 OpencliService(lib/index.js)。
 * 覆盖:schedule-add/list / replay / script-catalog/validate/userscript-run /
 * recipe-run / automation-search/develop/run / automation-mode-get/set / rulepacks-list/set。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'

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
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(): void {}
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
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
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
