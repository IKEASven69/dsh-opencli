/**
 * canvas VOM(eval 桥,任务 N)测试:两层。
 * - 纯函数层:直引 src/vom.ts(canvas.test.ts 先例,无需服务装配)——生成物是合法 JS
 *   (new Function 语法解析)且行为正确:用最小 document 桩真执行(discovery 收集矩形/
 *   read 取 base64/click 命中元素),脏输入防御,单行契约,buildRegionCropJs 无 sharp
 *   走"全图+坐标标注"档。
 * - 工具接线层:cordis 裸 Context + 桩 shell/tools/systemPrompt(gate.test 同款),
 *   beforeAll 先设独立 STATE/TRACE/SHOTS/EVIDENCE 目录(zerocfg 顶部约定,先于插件
 *   装载设好)——覆盖:三工具注册 / eval 桥经 runBrowserTraced 落轨迹 / 审批门
 *   canvas_click=ask(写原语)、discover/read=allow(只读)。
 * 桩 daemon 恒报 extensionConnected:true——runBrowserTraced 的 ④ 无扩展短路会拦掉
 * 全部 eval 往返,测不到桥本身(zerocfg 已专测短路,这里测有扩展主路径)。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import {
  buildCanvasDiscoveryJs, buildCanvasReadJs, buildCoordClickJs, buildRegionCropJs,
  type RegionCropResult,
} from '../src/vom.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import * as path from 'node:path'

// ── 纯函数层 ────────────────────────────────────────────────

/** 在最小 DOM 桩里真执行生成物:new Function 只注入 document,其余(JSON/Math/String)
 *  用 Node 全局——证明 JS 行为正确,而非仅"能解析"。生成物契约是"求值结果为 JSON 字符串"
 *  (vom.ts 头注释),这里替调用方多走一步 JSON.parse,断言直接落在解出的对象上。 */
const evalJs = (js: string, document: unknown): unknown => {
  const raw = (new Function('document', `return ${js}`) as (d: unknown) => unknown)(document)
  return JSON.parse(String(raw))
}

describe('build*Js 生成物:合法 JS + 预期调用 + 单行契约', () => {
  it('三个 builder 产物都是可解析的单行表达式', () => {
    for (const js of [buildCanvasDiscoveryJs(), buildCanvasReadJs(0), buildCoordClickJs(1, 2)]) {
      expect(() => new Function(js)).not.toThrow()
      expect(js.startsWith('(function(){')).toBe(true)
      // 单行契约:shell 回落形态按空白切词,换行会放大 argv 脆弱性(vom.ts 头注释①)
      expect(js).not.toContain('\n')
    }
  })

  it('discovery 含 querySelectorAll/getBoundingClientRect/JSON.stringify', () => {
    const js = buildCanvasDiscoveryJs()
    expect(js).toContain("querySelectorAll('canvas')")
    expect(js).toContain('getBoundingClientRect')
    expect(js).toContain('JSON.stringify')
  })

  it('read 含 image/png 且索引正确内插', () => {
    expect(buildCanvasReadJs(3)).toContain('var i=3,')
    expect(buildCanvasReadJs(0)).toContain("toDataURL('image/png')")
  })

  it('click 含 elementFromPoint 与 .click(),坐标正确内插', () => {
    const js = buildCoordClickJs(123, 45)
    expect(js).toContain('elementFromPoint(123,45)')
    expect(js).toContain('e.click()')
  })
})

describe('build*Js 行为(最小 document 桩真执行)', () => {
  it('discovery:收集矩形(取整)/带 id 附加/无 id 省字段', () => {
    const doc = {
      querySelectorAll: (sel: string) => sel === 'canvas' ? [
        { id: 'game', getBoundingClientRect: () => ({ x: 10.4, y: 20.6, width: 640.2, height: 480.9 }) },
        { getBoundingClientRect: () => ({ x: 0, y: 500, width: 300, height: 150 }) },
      ] : [],
    }
    const r = evalJs(buildCanvasDiscoveryJs(), doc) as { count: number; canvases: Array<Record<string, unknown>> }
    expect(r.count).toBe(2)
    expect(r.canvases[0]).toEqual({ index: 0, x: 10, y: 21, w: 640, h: 481, id: 'game' })
    expect(r.canvases[1]).toEqual({ index: 1, x: 0, y: 500, w: 300, h: 150 })
  })

  it('read:返回 {index,w,h,b64},toDataURL 收到 image/png', () => {
    const mimes: string[] = []
    const doc = { querySelectorAll: () => [{
      width: 800, height: 600,
      toDataURL: (m: string) => { mimes.push(m); return 'data:image/png;base64,QUJD' },
    }] }
    const r = evalJs(buildCanvasReadJs(0), doc) as { index: number; w: number; h: number; b64: string }
    expect(mimes).toEqual(['image/png'])
    expect(r).toEqual({ index: 0, w: 800, h: 600, b64: 'QUJD' })
  })

  it('read:越界索引报结构化错误,不抛', () => {
    const doc = { querySelectorAll: () => [{ width: 1, height: 1, toDataURL: () => 'data:,x' }] }
    const r = evalJs(buildCanvasReadJs(5), doc) as { error: string }
    expect(r.error).toContain('no canvas at index 5')
  })

  it('read:跨域污染画布(toDataURL 抛 SecurityError)折成错误 JSON', () => {
    const doc = { querySelectorAll: () => [{
      width: 1, height: 1,
      toDataURL: () => { throw new Error('tainted canvas') },
    }] }
    const r = evalJs(buildCanvasReadJs(0), doc) as { error: string }
    expect(r.error).toBe('tainted canvas')
  })

  it('read:脏索引(负数/NaN)builder 层折错误表达式', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = evalJs(buildCanvasReadJs(bad), { querySelectorAll: () => [] }) as { error: string }
      expect(r.error).toContain('invalid canvas index')
    }
  })

  it('click:命中元素→真 click + {clicked:true,tag,id};未命中→clicked:false', () => {
    const clicked: string[] = []
    const el = { tagName: 'CANVAS', id: 'game', click: () => { clicked.push('game') } }
    const doc = { elementFromPoint: (x: number, y: number) => (x === 10 && y === 20 ? el : null) }
    const hit = evalJs(buildCoordClickJs(10, 20), doc) as { clicked: boolean; tag: string; id: string }
    expect(hit).toEqual({ clicked: true, tag: 'CANVAS', id: 'game' })
    expect(clicked).toEqual(['game'])
    const miss = evalJs(buildCoordClickJs(99, 99), doc) as { clicked: boolean; error: string }
    expect(miss).toEqual({ clicked: false, error: 'no element at point' })
  })

  it('click:脏坐标 builder 层折错误表达式,不下发', () => {
    const r = evalJs(buildCoordClickJs(Number.NaN, 5), { elementFromPoint: () => null }) as { error: string }
    expect(r.error).toContain('invalid coordinates')
  })
})

describe('buildRegionCropJs:无 sharp → 全图 + 坐标标注档', () => {
  it('cropped=false,base64 逐字透传,note 携带请求区域与坐标系', () => {
    const r: RegionCropResult = buildRegionCropJs('QUJD', 10, 20, 100, 200)
    expect(r.cropped).toBe(false)
    expect(r.imageB64).toBe('QUJD')
    expect(r.note).toContain('x=10')
    expect(r.note).toContain('y=20')
    expect(r.note).toContain('w=100')
    expect(r.note).toContain('h=200')
    expect(r.note).toContain('视口坐标')
  })
})

// ── 工具接线层 ──────────────────────────────────────────────

const ok = (text: string): { exitCode: number; stdout: { text: string }; stderr: { text: string } } =>
  ({ exitCode: 0, stdout: { text }, stderr: { text: '' } })

class VomShell extends Service {
  /** 全部 shell 调用的命令行(拼接形态,与 zerocfg 桩同款) */
  readonly calls: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    this.calls.push(cmd)
    if (cmd.includes('--version')) return ok('2.0.0\n')
    if (cmd.includes('daemon status')) {
      // 2.0 信封 + extensionConnected:true:不让 runBrowserTraced 的 ④ 无扩展短路拦掉 eval
      return ok(JSON.stringify({ ok: true, data: { running: true, daemonVersion: '2.0.0', extensionConnected: true, port: 19825 } }))
    }
    if (cmd.includes(' list')) return ok(JSON.stringify({ ok: true, data: { commands: [], total: 0, nextOffset: 0 } }))
    // eval 桥回声:按生成物特征区分三个工具的页面 JS。toDataURL 必须先于
    // querySelectorAll 判——read 脚本里同样有 querySelectorAll('canvas'),顺序反了会张冠李戴
    if (cmd.includes('toDataURL')) return ok('{"index":0,"w":800,"h":600,"b64":"QUJD"}')
    if (cmd.includes("querySelectorAll('canvas')")) {
      return ok('{"count":1,"canvases":[{"index":0,"x":8,"y":8,"w":640,"h":480,"id":"game"}]}')
    }
    if (cmd.includes('elementFromPoint')) return ok('{"clicked":true,"tag":"CANVAS","id":"game"}')
    return ok('{}\n')
  }
}

class VomTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}

class VomSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let shell: VomShell
let traceDir = ''

const tool = (name: string): { execute: (a: unknown) => Promise<{ text: string }> } =>
  (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get(name)!

const dispatchPre = async (name: string, args: Record<string, unknown>): Promise<{ kind: string; reason?: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>
  }).waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

beforeAll(async () => {
  // 隔离四件套先于插件装载设好(zerocfg 顶部约定:构造器读 env;共享键会被上一轮残留污染)
  const uniq = `${process.pid}-${Date.now()}`
  process.env.DSH_OPENCLI_BIN = 'opencli'
  traceDir = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-vom-' + uniq)
  process.env.DSH_OPENCLI_TRACE_DIR = traceDir
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-vom-' + uniq)
  process.env.DSH_OPENCLI_EVIDENCE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-evidence-f-vom-' + uniq)
  process.env.DSH_OPENCLI_STATE = path.join(os.tmpdir(), 'dsh-opencli-test-state-f-vom-' + uniq)
  ctx = new Context()
  await ctx.plugin(VomShell)
  await ctx.plugin(VomTools)
  await ctx.plugin(VomSystemPrompt)
  await ctx.plugin(OpencliService)
  shell = (ctx as unknown as { shell: VomShell }).shell
  // 门的四项前置显式归位(zerocfg 纪律:断言成立前提不托付给缺省值)
  const svc = ctx.opencli as unknown as Record<string, any>
  svc.state.approval = 'on'
  svc.state.disabled = []
  svc.automationMode = 'standard'
})

afterAll(async () => {
  delete process.env.DSH_OPENCLI_BIN
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('canvas VOM 工具接线(eval 桥主路径)', () => {
  it('三工具注册:canvas_discover / canvas_read / canvas_click', () => {
    const names = [...(ctx.tools as unknown as { registered: Map<string, unknown> }).registered.keys()]
    expect(names).toContain('canvas_discover')
    expect(names).toContain('canvas_read')
    expect(names).toContain('canvas_click')
  })

  it('canvas_discover 执行:eval 子命令下发探测脚本,结果透传', async () => {
    const r = await tool('canvas_discover').execute({})
    expect(r.text).toContain('"count":1')
    expect(r.text).toContain('"id":"game"')
    // 2.0 形态:browser eval <脚本> --session dsh
    const evalCall = shell.calls.find((c) => c.includes('browser eval') && c.includes("querySelectorAll('canvas')"))
    expect(evalCall).toContain('--session dsh')
  })

  it('canvas_read 执行:toDataURL 脚本经 eval 下发', async () => {
    const r = await tool('canvas_read').execute({ index: '0' })
    expect(r.text).toContain('"b64":"QUJD"')
    expect(shell.calls.some((c) => c.includes('browser eval') && c.includes("toDataURL('image/png')"))).toBe(true)
  })

  it('canvas_read 脏索引:插件层本地拒绝,不发起 shell 往返', async () => {
    const before = shell.calls.length
    const r = await tool('canvas_read').execute({ index: 'abc' })
    expect(r.text).toContain('index 非法')
    expect(shell.calls.length).toBe(before)
  })

  it('canvas_click 执行:elementFromPoint 脚本经 eval 下发', async () => {
    const r = await tool('canvas_click').execute({ x: '10', y: '20' })
    expect(r.text).toContain('"clicked":true')
    expect(shell.calls.some((c) => c.includes('browser eval') && c.includes('elementFromPoint(10,20)'))).toBe(true)
  })

  it('eval 桥经 runBrowserTraced 自动进「运行轨迹」', async () => {
    await tool('canvas_discover').execute({})
    // 轨迹文件按本地日期分档(recordTrace/traceDateKey 同款算法)
    const d = new Date()
    const dateKey = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const text = readFileSync(join(traceDir, `trace-${dateKey}.jsonl`), 'utf8')
    const rows = text.trim().split('\n').map((l) => JSON.parse(l) as { cmd: string; exitCode: number; outHead: string })
    const evalRows = rows.filter((r) => r.cmd.startsWith('browser dsh eval'))
    expect(evalRows.length).toBeGreaterThan(0)
    expect(evalRows.every((r) => r.exitCode === 0)).toBe(true)
    expect(evalRows.some((r) => r.outHead.includes('canvases'))).toBe(true)
  })

  it('审批门:canvas_click → ask(坐标点击=写原语),理由说明真实执行', async () => {
    const d = await dispatchPre('canvas_click', { x: '10', y: '20' })
    expect(d.kind).toBe('ask')
    expect(d.reason ?? '').toContain('坐标点击')
    expect(d.reason ?? '').toContain('写原语')
    // 拦截同时落审计(复盘链路:谁在何处被门挡下)
    const svc = ctx.opencli as unknown as { state: { audit: Array<{ command: string; reason: string }> } }
    expect(svc.state.audit.some((a) => a.command === 'canvas_click 10 20')).toBe(true)
  })

  it('审批门:canvas_discover / canvas_read → allow(只读自动放行)', async () => {
    expect((await dispatchPre('canvas_discover', {})).kind).toBe('allow')
    expect((await dispatchPre('canvas_read', { index: '0' })).kind).toBe('allow')
  })
})
