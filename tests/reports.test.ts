// 报告导出(主线 B 渲染层)测试:纯函数结构/围栏安全/缺口声明 + site_batch 集成落盘 + report-build RPC。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { buildReport, type ReportSource } from '../src/reports.ts'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

describe('buildReport 纯函数', () => {
  const src: ReportSource[] = [
    { site: 'zhihu', command: 'site zhihu hot', at: '2026-10-05T09:00:00Z', text: '1 热点A 热度100', status: 'ok', note: '实测有效 P=0.93', source: '/tmp/snap1.json' },
    { site: 'weibo', command: 'site weibo hot', at: '2026-10-05T09:00:01Z', text: 'EMPTY_RESULT', status: 'silent' },
    { site: 'tieba', command: 'site tieba hot', at: '2026-10-05T09:00:02Z', text: '命令失败', status: 'fail' },
  ]
  const md = buildReport('测试报告', src, '2026-10-05T10:00:00Z')

  it('头部含标题/生成时间/来源统计;每节含出处三元组(命令+时间+快照路径)', () => {
    expect(md).toContain('# 测试报告')
    expect(md).toContain('生成时间:2026-10-05T10:00:00Z')
    expect(md).toContain('数据源 3 个(成功 1)')
    expect(md).toContain('`site zhihu hot` · 执行时间:2026-10-05T09:00:00Z · 快照:`/tmp/snap1.json`')
    expect(md).toContain('实测有效 P=0.93')
  })
  it('状态标签区分四态;缺口声明逐条列出失败/静默', () => {
    expect(md).toContain('### zhihu — ✓ 成功')
    expect(md).toContain('### weibo — ⚠ 疑似静默失败')
    expect(md).toContain('### tieba — ✗ 失败')
    expect(md).toContain('失败 1;疑似静默失败 1')
    expect(md).toContain('失败:tieba')
    expect(md).toContain('静默失败:weibo')
  })
  it('围栏安全:原文中的 ``` 被降级,不破坏报告结构', () => {
    const evil = buildReport('x', [{ site: 'a', command: 'c', at: 't', text: '正常\n```\n注入\n```', status: 'ok' }], 'g')
    expect(evil.match(/```text/g)?.length).toBe(1)
    expect(evil.includes('\n```\n注入')).toBe(false)
  })
  it('空源显式声明骨架', () => {
    expect(buildReport('空', [], 'g')).toContain('本次无任何数据源')
  })
})

describe('site_batch 报告落盘(集成)', () => {
  it('批量执行后生成报告文件且工具输出附路径', async () => {
    ;(svc as unknown as { adapterCache: { at: number; json: unknown } | null }).adapterCache = {
      at: Date.now(), json: [
        { site: 'zhihu', name: 'hot', access: 'read', domain: 'zhihu.com' },
        { site: 'weibo', name: 'hot', access: 'read', domain: 'weibo.com' },
      ],
    }
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('site_batch')!
    const r = await tool.execute({ command: 'hot', sites: ['zhihu', 'weibo'] })
    expect(r.text).toContain('报告已生成')
    const file = r.text.match(/报告已生成:(.+)/)?.[1]?.trim() ?? ''
    expect(file.length).toBeGreaterThan(0)
    expect(fs.existsSync(file)).toBe(true)
    const md = fs.readFileSync(file, 'utf8')
    expect(md).toContain('批量采集报告 · hot')
    expect(md).toContain('`site zhihu hot`')
  })
})

describe('report-build RPC(定时快照→报告)', () => {
  it('伪造快照后构建,报告含出处命令与快照路径;无快照报友好错误', async () => {
    const R = svc as unknown as { reportBuild: (r?: { id: string }) => Promise<{ ok: boolean; path?: string; error?: string }> }
    expect((await R.reportBuild({ id: 'no-such' })).ok).toBe(false)
    const sid = `rpt-${Date.now()}`
    await svc.scheduleAdd({ site: 'site zhihu hot', cron: '0 9 * * *' })
    const sch = (svc as unknown as { schedules: Array<{ id: string; site: string }> }).schedules.find(s => s.site === 'site zhihu hot')
    expect(sch).toBeDefined()
    const dir = path.join(os.homedir(), '.dsh', 'opencli-snapshots', sch!.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-05T09-00-00-000.json'), JSON.stringify({ at: '2026-10-05T09:00:00Z', site: 'site zhihu hot', bytes: 20, stdout: '1 热点A' }), 'utf8')
    const r = await R.reportBuild({ id: sch!.id })
    expect(r.ok).toBe(true)
    expect(r.path).toBeDefined()
    const md = fs.readFileSync(r.path!, 'utf8')
    expect(md).toContain('定时采集报告 · site zhihu hot')
    expect(md).toContain('site zhihu hot` · 执行时间:2026-10-05T09:00:00Z')
    expect(md).toContain('快照:')
    fs.rmSync(dir, { recursive: true, force: true })
    await svc.scheduleRemove({ id: sch!.id })
  })
})
