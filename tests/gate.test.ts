/**
 * 审批门集成测试:不经模型会话,用 cordis 裸 Context 直接驱动 tools/pre-execute 分发链路。
 * 挂载真实 OpencliService(lib/index.js,SWC 转译产物),shell/tools/systemPrompt 用桩替换。
 * 覆盖:write→ask / read→allow / 未知命令→ask / 门关→allow / 非 site 工具→allow / 禁用适配器→allow。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'

const LIST_JSON = JSON.stringify([
  { command: 'zhihu/hot', site: 'zhihu', name: 'hot', description: '知乎热榜', access: 'read', domain: 'zhihu.com' },
  { command: 'zhihu/comment', site: 'zhihu', name: 'comment', description: '发评论', access: 'write', domain: 'zhihu.com' },
  { command: 'bilibili/search', site: 'bilibili', name: 'search', description: '搜索', access: 'read', domain: 'bilibili.com' },
])

interface ShellLike { resolve(req: unknown): unknown; run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> }

class StubShell extends Service implements ShellLike {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = spec.command
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: 'opencli v1.8.6\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v1.8.6\nPort: 19825\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: LIST_JSON }, stderr: { text: '' } }
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

interface GateState { approval: 'on' | 'off'; disabled: string[] }

let ctx: InstanceType<typeof Context>
let svc: OpencliService & { state: GateState }

const dispatch = async (name: string, args: Record<string, unknown>): Promise<{ kind: string; reason?: string }> => {
  const exec = { callId: 't', rootCallId: 't', name, arguments: args, signal: new AbortController().signal }
  return await (ctx as unknown as {
    waterfall: (event: string, exec: unknown, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>
  }).waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as typeof svc
  // 隔离本机真实状态文件
  svc.state = { approval: 'on', disabled: [] }
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('审批门分发链路(tools/pre-execute 集成)', () => {
  it('write 命令 → ask,理由说明真实执行', async () => {
    const d = await dispatch('site', { adapter: 'zhihu', command: 'comment', args: ['x'] })
    expect(d.kind).toBe('ask')
    expect(d.reason ?? '').toContain('写操作')
  })

  it('read 命令 → allow', async () => {
    const d = await dispatch('site', { adapter: 'zhihu', command: 'hot' })
    expect(d.kind).toBe('allow')
  })

  it('未知命令 → ask(安全默认,按写审批)', async () => {
    const d = await dispatch('site', { adapter: 'zhihu', command: 'nonexistent' })
    expect(d.kind).toBe('ask')
    expect(d.reason ?? '').toContain('未能确认权限类型')
  })

  it('非 site 工具 → allow(即使参数长得像)', async () => {
    const d = await dispatch('browser_open', { adapter: 'zhihu', command: 'comment' })
    expect(d.kind).toBe('allow')
  })

  it('审批门关闭 → write 也放行', async () => {
    svc.state.approval = 'off'
    try {
      const d = await dispatch('site', { adapter: 'zhihu', command: 'comment' })
      expect(d.kind).toBe('allow')
    } finally {
      svc.state.approval = 'on'
    }
  })

  it('被禁用适配器 → allow(交由 site 工具本体拒绝)', async () => {
    svc.state.disabled = ['zhihu']
    try {
      const d = await dispatch('site', { adapter: 'zhihu', command: 'comment' })
      expect(d.kind).toBe('allow')
    } finally {
      svc.state.disabled = []
    }
  })
})
