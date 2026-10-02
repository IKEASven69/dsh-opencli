// MCP Resources 知识暴露单测(P1-3):
// ① 纯函数 handler(src/knowledge.ts)——list/templates/read 三操作 + 未知 URI 抛错
// ② seam 注册(lib/index.js)——桩 mcpResources 服务收到 server='opencli' 的注册,provider 能读出知识卡
// ③ knowledge-get RPC(lib/index.js)——mock adapterCache 后返回 markdown(0.1.x 回退路径,必须可测)
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { handleMcpResourceRequest, knowledgeResourceUri } from '../src/knowledge.ts'

const ENTRIES = [
  { site: 'weibo', name: 'hot', access: 'read', description: '微博热搜', domain: 'weibo.com' },
  { site: 'weibo', name: 'publish', access: 'write', description: '发微博' },
  { site: 'xiaohongshu', name: 'search', access: 'read', description: '搜索笔记' },
  { site: 'zhihu', name: 'hot', access: 'read', description: '知乎热榜' },
]

describe('handleMcpResourceRequest(纯函数,MCP 三操作)', () => {
  it('resources/list:目录内站点各一张资源卡,健康度异常站在 description 标出', () => {
    const r = handleMcpResourceRequest({ method: 'resources/list' }, ENTRIES) as { resources: Array<{ uri: string; mimeType: string; description?: string }> }
    const uris = r.resources.map((x) => x.uri)
    expect(uris).toContain(knowledgeResourceUri('weibo'))
    expect(uris).toContain(knowledgeResourceUri('xiaohongshu'))
    expect(uris.every((u) => u.startsWith('opencli://sites/') && u.endsWith('/knowledge'))).toBe(true)
    expect(r.resources.every((x) => x.mimeType === 'text/markdown')).toBe(true)
    const xhs = r.resources.find((x) => x.uri === knowledgeResourceUri('xiaohongshu'))!
    expect(xhs.description ?? '').toContain('受损')
    expect(r.resources.find((x) => x.uri === knowledgeResourceUri('weibo'))!.description).toBeUndefined()
  })

  it('resources/templates/list:单一 URI 模板', () => {
    const r = handleMcpResourceRequest({ method: 'resources/templates/list' }, ENTRIES) as { resourceTemplates: Array<{ uriTemplate: string }> }
    expect(r.resourceTemplates.length).toBe(1)
    expect(r.resourceTemplates[0]!.uriTemplate).toBe('opencli://sites/{site}/knowledge')
  })

  it('resources/read:合法 URI 返回知识卡 markdown(含健康度段)', () => {
    const r = handleMcpResourceRequest({ method: 'resources/read', uri: knowledgeResourceUri('xiaohongshu') }, ENTRIES) as { contents: Array<{ uri: string; mimeType: string; text: string }> }
    expect(r.contents.length).toBe(1)
    expect(r.contents[0]!.uri).toBe(knowledgeResourceUri('xiaohongshu'))
    expect(r.contents[0]!.mimeType).toBe('text/markdown')
    expect(r.contents[0]!.text).toContain('# 站点知识卡:xiaohongshu')
    expect(r.contents[0]!.text).toContain('站点健康度:受损')
    expect(r.contents[0]!.text).toContain('site xiaohongshu search')
  })

  it('resources/read:未知 URI / 不在目录的站 → 抛错(MCP 语义:该次调用失败,不编造)', () => {
    expect(() => handleMcpResourceRequest({ method: 'resources/read', uri: 'file:///etc/passwd' }, ENTRIES)).toThrow(/未知资源 URI/)
    expect(() => handleMcpResourceRequest({ method: 'resources/read', uri: knowledgeResourceUri('nonexistent') }, ENTRIES)).toThrow(/目录里没有/)
  })

  it('entries 缺失时 list 给空数组而非崩溃', () => {
    const r = handleMcpResourceRequest({ method: 'resources/list' }, undefined) as { resources: unknown[] }
    expect(r.resources).toEqual([])
  })
})

/* ── 桩宿主:shell/tools/systemPrompt + 可选 mcpResources(记录 register 调用) ── */
class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = spec.command
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
interface RecordedProvider { request: (req: { method: string; cursor?: string; uri?: string }, exec?: unknown) => Promise<unknown> }
class StubMcpResources extends Service {
  readonly registrations: Array<{ server: string; provider: RecordedProvider }> = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'mcpResources') }
  register(server: string, provider: RecordedProvider): () => void {
    this.registrations.push({ server, provider })
    return () => { /* 桩:不真正摘除 */ }
  }
}

const mount = async (withMcp: boolean): Promise<{ ctx: InstanceType<typeof Context>; svc: OpencliService; mcp?: StubMcpResources }> => {
  const ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  // 注意:ctx.plugin 返回 Fiber 而非服务实例——桩服务从 ctx.mcpResources 取(与插件内 reflect 探测同源)
  let mcp: StubMcpResources | undefined
  if (withMcp) { await ctx.plugin(StubMcpResources); mcp = (ctx as unknown as { mcpResources: StubMcpResources }).mcpResources }
  await ctx.plugin(OpencliService)
  const svc = ctx.opencli as OpencliService
  return { ctx, svc, mcp }
}
const mockCache = (svc: OpencliService): void => {
  ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = { at: Date.now(), json: ENTRIES }
}

describe('seam 注册路径(dsh 0.2 ctx.mcpResources)', () => {
  let ctx: InstanceType<typeof Context>
  let svc: OpencliService
  let mcp: StubMcpResources

  beforeAll(async () => {
    ;({ ctx, svc, mcp } = await mount(true))
    mockCache(svc)
  })
  afterAll(async () => {
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
  })

  it('插件加载即以 server=opencli 注册 provider(一次)', () => {
    expect(mcp.registrations.filter((r) => r.server === 'opencli').length).toBe(1)
  })

  it('provider 处理 resources/read:返回知识卡 markdown', async () => {
    const provider = mcp.registrations.find((r) => r.server === 'opencli')!.provider
    const r = await provider.request({ method: 'resources/read', uri: knowledgeResourceUri('weibo') }) as { contents: Array<{ uri: string; text: string }> }
    expect(r.contents[0]!.text).toContain('# 站点知识卡:weibo')
    expect(r.contents[0]!.text).toContain('`site weibo publish` `[write]`')
  })

  it('provider 处理 resources/list:列出目录站点', async () => {
    const provider = mcp.registrations.find((r) => r.server === 'opencli')!.provider
    const r = await provider.request({ method: 'resources/list' }) as { resources: Array<{ uri: string }> }
    expect(r.resources.map((x) => x.uri)).toContain(knowledgeResourceUri('zhihu'))
  })
})

describe('knowledge-get RPC(0.1.x 回退路径,常驻)', () => {
  let ctx: InstanceType<typeof Context>
  let svc: OpencliService

  beforeAll(async () => {
    // 无 mcpResources 桩 = 模拟 0.1.x 宿主:插件必须照常加载(降级不炸)
    ;({ ctx, svc } = await mount(false))
    mockCache(svc)
  })
  afterAll(async () => {
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
  })

  it('mock adapterCache 后按 sites 返回 markdown 知识卡', async () => {
    const r = await svc.knowledgeGet({ sites: ['weibo', 'WEIBO'] })
    expect(r.ok).toBe(true)
    expect(r.cards!.length).toBe(1)
    expect(r.cards![0]!.site).toBe('weibo')
    expect(r.cards![0]!.uri).toBe(knowledgeResourceUri('weibo'))
    expect(r.cards![0]!.markdown).toContain('# 站点知识卡:weibo')
    expect(r.cards![0]!.markdown).toContain('失败签名恢复表')
  })

  it('sites 缺省:返回健康度异常(degraded/notice)且在目录内的站', async () => {
    const r = await svc.knowledgeGet()
    expect(r.ok).toBe(true)
    const sites = r.cards!.map((c) => c.site).sort()
    expect(sites).toEqual(['xiaohongshu', 'zhihu'])
  })

  it('目录外的站:ok=false(不编造)', async () => {
    const r = await svc.knowledgeGet({ sites: ['nonexistent'] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('没有可返回的知识卡')
  })
})
