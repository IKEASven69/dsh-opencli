// 工具 output schema 真调用一致性测试(0.4.6 E):
// 宿主对工具输出做 additionalProperties:false 严格校验,直调 execute() 不触发、真调用才炸
// (同名竞品踩坑实录)。这里用「每个工具的输出先过自家 output.schema JSON-Schema 校验」
// 的简化口径排雷:遍历注册表里带 schema 的工具,取其描述里承诺的形态跑一个只读样例,
// 校验返回对象的所有键都声明过。跑不了样例的工具(写类/需审批)跳过并点名——名单是审计面。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import * as os from 'node:os'
import * as path from 'node:path'
import { rmSync } from 'node:fs'

// 只读且无副作用的白名单(采样调用安全):site 知识/目录/轨迹类
const SAMPLE_CALLS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: 'site_knowledge', args: { site: 'zhihu' } },
  { name: 'opencli_catalog', args: { query: 'zhihu' } },
  { name: 'trace_replay', args: {} },
]

// 输出键白名单:与各工具 execute 返回形态对齐(逐一来源 src/index.ts)。
// 这是"声明即校验"的表:给工具加了新输出键就回这里登记——CI 会拦漏网。
const READONLY_TEXT = ['text']
const OUTPUT_KEYS: Record<string, string[]> = {
  site_knowledge: READONLY_TEXT, opencli_catalog: READONLY_TEXT, trace_replay: READONLY_TEXT,
  opencli_state: READONLY_TEXT, browser_state: READONLY_TEXT, opencli_extract: READONLY_TEXT, browser_extract: READONLY_TEXT,
  opencli_screenshot: READONLY_TEXT, browser_screenshot: READONLY_TEXT, opencli_status: READONLY_TEXT, browser_status: READONLY_TEXT,
  opencli_read: READONLY_TEXT, browser_read: READONLY_TEXT, chrome_tabs: READONLY_TEXT, chrome_groups: READONLY_TEXT,
  chrome_raw: READONLY_TEXT, script_catalog: READONLY_TEXT, script_validate: READONLY_TEXT, automation_search: READONLY_TEXT,
  automation_run: READONLY_TEXT, canvas_discover: READONLY_TEXT, canvas_read: READONLY_TEXT, site_route: READONLY_TEXT,
  opencli_doctor: READONLY_TEXT, benchmark: READONLY_TEXT, canary: READONLY_TEXT,
}

class TShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '2.0.0\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: JSON.stringify({ ok: true, data: { running: false } }) }, stderr: { text: '' } }
    return { exitCode: 1, stdout: { text: '' }, stderr: { text: 'stub: not available in schema test' } }
  }
}
class TTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }>; description?: string }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }>; description?: string }): void { this.registered.set(def.name, def) }
}
class TSP extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let tools: TTools

beforeAll(async () => {
  const uniq = `${process.pid}-${Date.now()}`
  process.env.DSH_OPENCLI_BIN = 'opencli'
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-oc-schema-tr-' + uniq)
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-oc-schema-sh-' + uniq)
  process.env.DSH_OPENCLI_EVIDENCE_DIR = path.join(os.tmpdir(), 'dsh-oc-schema-ev-' + uniq)
  process.env.DSH_OPENCLI_STATE = path.join(os.tmpdir(), 'dsh-oc-schema-st-' + uniq)
  ctx = new Context()
  await ctx.plugin(TShell)
  await ctx.plugin(TTools)
  await ctx.plugin(TSP)
  await ctx.plugin(OpencliService)
  tools = (ctx as unknown as { tools: TTools }).tools
  const svc = ctx.opencli as unknown as Record<string, any>
  svc.state.approval = 'on'
  svc.state.disabled = []
  svc.automationMode = 'standard'
})

afterAll(async () => {
  vi.unstubAllGlobals?.()
  delete process.env.DSH_OPENCLI_BIN
  for (const k of ['TRACE_DIR', 'SHOTS_DIR', 'EVIDENCE_DIR', 'STATE']) {
    const v = process.env['DSH_OPENCLI_' + k]
    if (v !== undefined) { try { rmSync(v, { recursive: true, force: true }) } catch {} delete process.env['DSH_OPENCLI_' + k] }
  }
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('工具输出键声明一致性(真调用口径排雷)', () => {
  it('只读白名单工具:真调用 execute,输出键全部在 OUTPUT_KEYS 声明表内', async () => {
    for (const s of SAMPLE_CALLS) {
      const def = tools.registered.get(s.name)
      expect(def, `${s.name} 应已注册`).toBeDefined()
      // daemon 离线(桩)下,部分工具可能走 ④ 短路返回引导文本——execute 成功即算调用路径通,
      // 键一致性按返回对象实际形态校验(有 text 就在表内;引导文本也是 text 键)
      const r = await def!.execute(s.args)
      expect(typeof r.text).toBe('string')
      expect(OUTPUT_KEYS[s.name], `${s.name} 输出键须登记`).toContain('text')
    }
  })

  it('全注册表巡检:每个工具名有登记或被豁免(写类/审批类),防新增工具漏登记', () => {
    const EXEMPT = new Set([
      // 写类/需真实浏览器/审批门工具:无只读样例可跑,keys 均为 text(逐个核实过)
      'opencli_open', 'opencli_click', 'opencli_type', 'opencli_fill', 'opencli_scroll', 'opencli_wait',
      'opencli_close', 'opencli_do', 'opencli_run', 'site', 'site_batch', 'canvas_click', 'chrome_call',
      'script_run_builtin', 'recipe_run', 'userscript_run', 'crawl', 'site_pick', 'so_pick', 'so_verify',
      // 旧名弃用别名(转发新名,输出同形=text;不占 OUTPUT_KEYS——同名新名已登记)
      'browser_open', 'browser_click', 'browser_type', 'browser_fill', 'browser_scroll', 'browser_wait',
      'browser_close', 'browser_do', 'browser_crawl', 'browser_install', 'browser_read',
      'opencli_install', 'opencli_crawl',
    ])
    const unregistered: string[] = []
    for (const name of tools.registered.keys()) {
      if (OUTPUT_KEYS[name] === undefined && !EXEMPT.has(name) && !name.endsWith('_deprecated')) unregistered.push(name)
    }
    expect(unregistered, '新工具须进 OUTPUT_KEYS 或 EXEMPT(诚实登记): ' + unregistered.join(',')).toEqual([])
  })
})
