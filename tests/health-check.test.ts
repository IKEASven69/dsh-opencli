// 任务健康预检+断线恢复+版本翻转(0.1.2 P0-3):桩 daemonStatus 探测序列,
// 验证四行为——daemon 死→自动拉起→恢复执行;扩展断连→诚实跳过(任务保留);
// 版本翻转→ingest 事件;预检异常→fail-open 放行。
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

const BSN = String.fromCharCode(10) // 真实换行字符(字面反斜杠n 会让文本正则全乱)
class ShellStub extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  static statusSeq: Array<{ running: boolean; version: string; extension: string }> = []
  static restartFails = false
  static statusCalls = 0
  static restartCalls = 0
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmdStr = Array.isArray(spec.command) ? spec.command.join(' ') : String(spec.command)
    if (/daemon status/.test(cmdStr)) {
      ShellStub.statusCalls++
      const st = ShellStub.statusSeq.length > 1 ? ShellStub.statusSeq.shift()! : (ShellStub.statusSeq[0] ?? { running: false, version: '', extension: '' })
      if (!st.running) return { exitCode: 0, stdout: { text: 'Daemon: not running' }, stderr: { text: '' } }
      return { exitCode: 0, stdout: { text: 'Daemon: running' + BSN + 'Version: ' + st.version + BSN + 'Extension: ' + st.extension + BSN + 'Port: 19825' }, stderr: { text: '' } }
    }
    if (/daemon restart/.test(cmdStr)) {
      ShellStub.restartCalls++
      if (ShellStub.restartFails) return { exitCode: 1, stdout: { text: '' }, stderr: { text: 'restart failed (stub)' } }
      const last = ShellStub.statusSeq[ShellStub.statusSeq.length - 1]
      if (last !== undefined) { last.running = true; if (!last.version) last.version = '2.0.0' }
      return { exitCode: 0, stdout: { text: 'Daemon restarted' }, stderr: { text: '' } }
    }
    return { exitCode: 0, stdout: { text: '[{"title":"A"}]' }, stderr: { text: '' } }
  }
}

class StubTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: unknown): void { (this.registered as Map<string, unknown>).set((def as { name: string }).name, def) }
  list(): Array<{ name: string }> { return [...(this.registered as Map<string, unknown>).keys()].map((name) => ({ name })) }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

describe('任务健康预检+断线恢复+版本翻转(P0-3)', () => {
  let ctx: InstanceType<typeof Context>
  const snapBase = join(os.tmpdir(), `dsh-opencli-hc-snap-${process.pid}`)

  beforeAll(async () => {
    process.env.DSH_OPENCLI_JITTER_MAX_MS = '0'
    process.env.DSH_OPENCLI_CHALLENGE_WAIT_MS = '10'
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_DIRECT = '0'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable (test default)') }))
    ctx = new Context()
    await ctx.plugin(ShellStub)
    await ctx.plugin(StubTools)
    await ctx.plugin(StubSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    // subprocess seam 禁用(0.2.2 宿主真 seam 会 spawn 真 CLI,探到真 daemon——
    // 本文件全部 daemon 语义桩在 ShellStub)
    {
      const reflect = (ctx as unknown as { reflect: { get: (p: string, f?: boolean) => unknown } }).reflect
      const origGet = reflect.get.bind(reflect)
      reflect.get = (name: string, flag?: boolean) => (name === 'subprocess' ? undefined : origGet(name, flag))
    }
    svcRef = ctx.opencli as OpencliService
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    rmSync(snapBase, { recursive: true, force: true })
  })

  /** daemonStatus 方法桩:按序列弹出;末项常驻(restart 成功=把尾项切运行态)。 */
    /** daemon status 响应序列(ShellStub.statusSeq):每条 daemon status 消耗一项;
   *  restart 把尾项置 running(failRestart=true 时 restart 失败)。 */
  const stubDs = (seq: Array<{ running: boolean; version: string; extension: string }>, opts: { failRestart?: boolean } = {}): void => {
    ShellStub.statusSeq = seq.map((x) => ({ ...x }))
    ShellStub.restartFails = opts.failRestart === true
    const S = svc() as unknown as { lastDaemonVersion: string | undefined }
    S.lastDaemonVersion = undefined
  }
  /** 服务实例唯一引用(cordis Proxy 每次 ctx.opencli 访问返回新 wrapper——必须缓存同一份)。 */
  let svcRef: OpencliService
  const svc = (): OpencliService => svcRef

  it('预检自身异常 → fail-open 放行(采集照跑,预检故障不是任务死因)', async () => {
    const S = svc()
    // daemonStatus 方法桩直接抛异常(审查 P1-6:fail-open 承诺必须有守护)
    const Sv = S as unknown as { daemonStatus: () => Promise<never> }
    const origDsF = Sv.daemonStatus
    Sv.daemonStatus = async () => { throw new Error('probe exploded') }
    const id = `hc-f-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-f hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    try {
      await S.runSiteCommand('site hc-f hot', id)
    } finally {
      Sv.daemonStatus = origDsF // 还原:proxy 是同一实例,不还原会污染后续用例
    }
    const rows = S.runHistory[id] ?? []
    const row = rows.find((r) => r.ok === true)
    expect(row).toBeDefined() // 放行:采集照跑
    expect(row!.summary).not.toContain('⏸')
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((x) => x.id === id), 1)
  })

  it('restart 成功但扩展未连 → 跳过(审查 P1-4:重探结果必须走扩展检查)', async () => {
    const S = svc()
    // 序列:首探 not running → restart → 重探 running 但扩展未连
    stubDs([{ running: false, version: '', extension: '' }, { running: true, version: '2.0.2', extension: 'not connected' }])
    const id = `hc-e-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-e hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    await S.runSiteCommand('site hc-e hot', id)
    const row = S.runHistory[id]?.[0]
    expect(row?.summary).toContain('扩展未连接')
    expect(row?.summary).toContain('⏸')
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((x) => x.id === id), 1)
  })

  it('daemon 拉起失败 → 诚实跳过(schedule-skipped 事件,不烧 60s 往返)', async () => {
    const S = svc()
    stubDs([{ running: false }, { running: false }], { failRestart: true })
    const before = S.ingestEventList.length
    const id = `hc-b-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-b hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    await S.runSiteCommand('site hc-b hot', id)
    const ev = S.ingestEventList[0]
    expect(S.ingestEventList.length).toBe(before + 1)
    expect(ev.kind).toBe('schedule-skipped')
    expect(ev.text).toContain('跳过')
    expect(S.runHistory[id]?.[0]?.summary).toContain('⏸')
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((s) => s.id === id), 1)
  })

  it('扩展未连 → 跳过且任务保留(不误删、给恢复指引)', async () => {
    const S = svc()
    stubDs([{ running: true, version: '2.0.2', extension: 'not connected' }])
    const id = `hc-c-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-c hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    await S.runSiteCommand('site hc-c hot', id)
    expect(S.runHistory[id]?.[0]?.summary).toContain('扩展未连接')
    expect(S.runHistory[id]?.[0]?.summary).toContain('自动恢复')
    // 任务仍在(跳过≠删除)
    expect(S.schedules.some((s) => s.id === id)).toBe(true)
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((s) => s.id === id), 1)
  })

  it('版本翻转 → daemon-flip 事件 + note;后续同版本不再重复报', async () => {
    const S = svc()
    stubDs([{ running: true, version: '1.8.6', extension: 'connected' }, { running: true, version: '2.0.0', extension: 'connected' }, { running: true, version: '2.0.0', extension: 'connected' }])
    const id = `hc-d-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-d hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    // 跨用例 lastDaemonVersion 残留(单文件共享服务实例):以首跑后的 flip 数为基线做增量断言
    await S.runSiteCommand('site hc-d hot', id) // 基线记录(可能带跨用例翻转,不计)
    const base = S.ingestEventList.filter((e) => e.kind === 'daemon-flip').length
    await S.runSiteCommand('site hc-d hot', id) // 翻转 1.8.6→2.0.0 → +1
    const flips = S.ingestEventList.filter((e) => e.kind === 'daemon-flip')
    expect(flips.length).toBe(base + 1)
    expect(flips[flips.length - 1]!.text).toContain('1.8.6 → 2.0.0')
    await S.runSiteCommand('site hc-d hot', id) // 同版本 2.0.0 → 不再 +1
    expect(S.ingestEventList.filter((e) => e.kind === 'daemon-flip').length).toBe(base + 1)
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((s) => s.id === id), 1)
  })

  it('daemon 死 → 自动拉起 → 继续执行;history 行带预检说明', async () => {
    const S = svc()
    stubDs([{ running: false }, { running: true, version: '2.0.2', extension: 'connected' }])
    const id = `hc-a-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-a hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1 })
    await S.runSiteCommand('site hc-a hot', id)
    const rows = S.runHistory[id] ?? []
    const row = rows.find((r) => r.ok === true)
    expect(row).toBeDefined()
    expect(row!.summary).toContain('已自动拉起 daemon')
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((s) => s.id === id), 1)
  })

  it('认证预检:whoami 快检未登录 → ⏸ 跳过本 tick(AUTH 类失败,任务保留)', async () => {
    const S = svc()
    stubDs([{ running: true, version: '2.0.2', extension: 'connected' }])
    // loginCheck 方法桩(whoami 池入口,与上方 daemonStatus 桩同 seam):站 hc-p 在池内但未登录
    const Sv = S as unknown as { loginCheck: () => Promise<unknown> }
    const origLc = Sv.loginCheck
    Sv.loginCheck = async () => ({ ok: true, checkedAt: new Date().toISOString(), results: [{ site: 'hc-p', ok: false, timedOut: false, detail: 'AUTH_REQUIRED' }] })
    const id = `hc-p-${Date.now()}`
    S.schedules.push({ id, site: 'site hc-p hot', cron: '0 9 * * *', createdAt: new Date().toISOString(), enabled: true, retry: 1, preflight: true })
    try {
      const before = S.ingestEventList.length
      await S.runSiteCommand('site hc-p hot', id)
      // 跳过本 tick:schedule-skipped 事件 + ⏸ history 行(按 AUTH 类失败记,receipt=auth_wall)
      expect(S.ingestEventList.length).toBe(before + 1)
      expect(S.ingestEventList[0]!.kind).toBe('schedule-skipped')
      expect(S.ingestEventList[0]!.text).toContain('未登录')
      const rows = S.runHistory[id] ?? []
      expect(rows.length).toBe(1) // 未进采集链(ShellStub 默认输出必成功,多出即漏跳)
      expect(rows[0]!.ok).toBe(false)
      expect(rows[0]!.summary).toContain('⏸')
      expect(rows[0]!.receipt?.auth_state).toBe('auth_wall')
      // 任务保留(跳过≠删除)
      expect(S.schedules.some((s) => s.id === id)).toBe(true)
    } finally {
      Sv.loginCheck = origLc // 还原:proxy 是同一实例,不还原会污染后续用例
    }
    delete S.runHistory[id]
    S.schedules.splice(S.schedules.findIndex((s) => s.id === id), 1)
  })
})
