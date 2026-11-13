// 0.1.3 旗舰行为回归测试入库(深化轮 2.2-1:实现者的 39 项定向断言原写在 OS temp 脚本未进
// tests/,旗舰特性零仓库回归保护——本文件固化为仓库用例,对准 lib 0.1.3 现状行为):
// ① 熔断:开窗(首任务烧满链)/窗内同签名短路单行/退避窗不再 restart;fetch-failed 与
//    eperm 两签名形态各自开窗,站点面失败不熔断对照;
// ② 翻转自愈:版本翻转→单次 restart→重探(方法桩式,照 health-check.test.ts 既有桩纪律);
//    skip-backoff 期间不重复 restart;
// ③ governor while 重查:release 唤醒到被唤者 ++ 之间的微任务间隙新到者抢槽,重查防并发
//    超 max(0.1.2 发后审查实测场景,确定性复现)+ 并发压测;
// ④ schedMarkers 过期淘汰(>10 分钟 TTL)+ 2000 上限裁最旧;
// ⑤ drain 重入守卫:慢 drain 在途时新拍跳过,出结果后下一拍接管;
// ⑥ selfCheck 幽灵工具鉴别:撞名让位 registered:false(点名对失败形态有真鉴别力);
// ⑦ 数组形态优先(两形态都认时锁定 array)+ quoteShellArg 转义(元字符不碎裂)。
// 四语义修(stop_reason null/skip-backoff 基线/notify:false 开窗/unknown 写轨)的断言在
// tests/runinbox.test.ts(核心链随车),本文件不重复。
// 隔离:STATE/SNAPSHOTS/TRACE/EVENTS/INBOX 五路径本文件独占临时目录;subprocess seam 禁用
// (绝不 spawn 真 CLI 碰真 daemon);fetch 全局桩(离线,自检更新检查旁路)。
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

// daemon status 运行态响应:2.0.x JSON 信封(字段名取自本机 `opencli daemon status` 实测形状,
// 与 health-check.test.ts 同款);parseDaemonStatus 两形都接,这里只用真实守护进程的 JSON 形态
const daemonJson = (version: string): string =>
  `{"ok":true,"data":{"ok":true,"pid":19616,"uptime":3600.5,"daemonVersion":${JSON.stringify(version)},"extensionConnected":true,"extensionVersion":"1.0.26","port":19825,"running":true,"stale":false}}\n`

class ShellStub extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  /** ⑦ 用例开关:true=只认字符串形态(0.1.x 宿主形态,array 尝试抛错换下一形态)。 */
  static arrayRejected = false
  /** shell 收到的每次调用(spec.command 形态+原样值):⑦ 形态断言的数据源。 */
  static calls: Array<{ mode: 'array' | 'string'; command: unknown }> = []
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const isArr = Array.isArray(spec.command)
    const cmdStr = isArr ? (spec.command as string[]).join(' ') : String(spec.command)
    ShellStub.calls.push({ mode: isArr ? 'array' : 'string', command: spec.command })
    if (isArr && ShellStub.arrayRejected) throw new Error('array form not accepted (stub)')
    if (cmdStr.includes('daemon status')) return { exitCode: 0, stdout: { text: daemonJson('2.0.3') }, stderr: { text: '' } }
    if (cmdStr.includes('--version')) return { exitCode: 0, stdout: { text: '2.0.3\n' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '[{"title":"A"}]' }, stderr: { text: '' } }
  }
}

// ⑥ 幽灵工具:宿主对 opencli_status 抛 already registered(复现 dsh 0.2.1 重名注册直抛、
// 本插件 registerToolSafe 撞名让位路径)——expectedToolNames 入册而 registeredToolNames 不入,
// selfCheck 点名对该失败形态有真鉴别力(修前从 registeredToolNames 自身取期望,点名恒真)
const COLLIDE_TOOL = 'opencli_status'
class GhostTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: unknown): void {
    const name = (def as { name?: string }).name
    if (name === COLLIDE_TOOL) throw new Error(`tool ${name} is already registered`)
  }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type HistRow = { at: string; ok: boolean; summary: string; skip?: boolean; receipt?: { stop_reason?: string | null } }
type DsRow = { running: boolean; version?: string; extension?: string }
type RunOut = { exitCode: number; stdout: string; stderr: string }
type Svc = {
  schedules: Array<{ id: string; site: string; cron: string; enabled: boolean; retry?: number; backoffMs?: number; notify?: boolean }>
  runHistory: Record<string, HistRow[]>
  ingestEventList: Array<{ at: string; kind: string; text: string }>
  runSiteCommand: (siteCmd: string, id: string, opts?: { manual?: boolean }) => Promise<void>
  runOpencli: (...a: unknown[]) => Promise<RunOut>
  daemonStatus: () => Promise<DsRow | null>
  taskHealthCheck: (id: string) => Promise<{ ok: boolean; note?: string }>
  selfHealDaemon: (reason: string) => Promise<'ok' | 'skip-backoff' | 'failed'>
  selfCheck: () => Promise<{
    ok: boolean
    tools: Array<{ name: string; registered: boolean }>
    conflicts: string[]
    entries: Array<{ name: string; ok: boolean }>
  }>
  drainInboxSafe: () => Promise<void>
  inboxExecutor: () => unknown
  inboxDraining: boolean
  circuitOpen: Map<string, number>
  schedMarkers: Map<string, number>
  addSchedMarker: (key: string) => void
  expectedToolNames: string[]
  registeredToolNames: string[]
  toolConflicts: string[]
  shellMode: 'resolved' | 'direct' | 'array' | null
  usagePolicy: { minDelayMs: number; maxConcurrency: number; burst: number }
  concurrent: number
  queue: Array<() => void>
  cooldownUntil: number
  acquireGovernor: (k?: 'read' | 'write') => Promise<void>
  releaseGovernor: (k?: 'read' | 'write') => void
  lastSelfHealAt: number
  lastDaemonVersion: string | undefined
  so: unknown
}

describe('0.1.3 旗舰行为回归(熔断/翻转自愈/governor/schedMarkers/drain/selfCheck/argv)', () => {
  let ctx: InstanceType<typeof Context>
  const uniq = `${process.pid}${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-flagship-state-${uniq}.json`)
  const snapBase = join(os.tmpdir(), `dsh-opencli-flagship-snap-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-flagship-trace-${uniq}`)
  const eventsFile = join(os.tmpdir(), `dsh-opencli-flagship-events-${uniq}.jsonl`)
  const inboxPath = join(os.tmpdir(), `dsh-opencli-flagship-inbox-${uniq}`)
  const saved: Array<[string, string | undefined]> = [
    ['DSH_OPENCLI_STATE', process.env.DSH_OPENCLI_STATE],
    ['DSH_OPENCLI_SNAPSHOTS_DIR', process.env.DSH_OPENCLI_SNAPSHOTS_DIR],
    ['DSH_OPENCLI_TRACE_DIR', process.env.DSH_OPENCLI_TRACE_DIR],
    ['DSH_OPENCLI_EVENTS_FILE', process.env.DSH_OPENCLI_EVENTS_FILE],
    ['DSH_OPENCLI_INBOX_DIR', process.env.DSH_OPENCLI_INBOX_DIR],
  ]

  /** 服务实例唯一引用(cordis Proxy 每次 ctx.opencli 访问返回新 wrapper——必须缓存同一份)。 */
  let svcRef: OpencliService
  const P = (): Svc => svcRef as unknown as Svc

  const evOf = (kind: string): Array<{ at: string; kind: string; text: string }> =>
    P().ingestEventList.filter((e) => e.kind === kind)
  /** 清掉全部微任务再走(setTimeout 0 让出当前宏任务,被唤醒的 waiter/then 链先跑完)。 */
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  /** daemonStatus 方法桩(health-check.test.ts 桩纪律):按序列弹出,末项常驻;calls 记探测次数。 */
  const stubDs = (seq: DsRow[], calls: number[] = []): (() => void) => {
    const orig = P().daemonStatus
    const q = seq.map((x) => ({ ...x }))
    P().daemonStatus = async () => {
      calls.push(1)
      return q.length > 1 ? q.shift()! : { ...(q[0] ?? { running: true, version: '2.0.3', extension: 'connected' }) }
    }
    return () => { P().daemonStatus = orig }
  }

  /** runOpencli 方法桩:site 命令按注入失败;daemon restart 记入 restarts 返回成功。用毕还原。 */
  const stubRun = (fail: { exitCode?: number; stdout?: string; stderr?: string }, restarts: string[] = []): (() => void) => {
    const orig = P().runOpencli
    P().runOpencli = async (...a: unknown[]) => {
      const argv = Array.isArray(a[0]) ? (a[0] as string[]) : [String(a[0])]
      if (argv[0] === 'daemon') { restarts.push(argv.join(' ')); return { exitCode: 0, stdout: 'Daemon restarted', stderr: '' } }
      return { exitCode: fail.exitCode ?? 1, stdout: fail.stdout ?? '', stderr: fail.stderr ?? '' }
    }
    return () => { P().runOpencli = orig }
  }

  /** 直接注入任务(health-check.test.ts 同款:不经 scheduleAdd 校验层,cron 永不匹配防调度器误触发)。 */
  let taskSeq = 0
  const addTask = (opts: { retry?: number; backoffMs?: number } = {}): { id: string; site: string } => {
    taskSeq++
    const id = `fg-${Date.now()}-${taskSeq}`
    const site = `site fgx${taskSeq} hot`
    P().schedules.push({ id, site, cron: '0 3 31 2 *', createdAt: new Date().toISOString(), enabled: true, retry: opts.retry ?? 3, backoffMs: opts.backoffMs ?? 0 })
    return { id, site }
  }
  const dropTask = (id: string): void => {
    delete P().runHistory[id]
    const i = P().schedules.findIndex((s) => s.id === id)
    if (i >= 0) P().schedules.splice(i, 1)
  }

  /** 轮询等待(drain 在途守卫用例的异步推进)。 */
  const until = async (f: () => boolean, ms = 3000): Promise<void> => {
    const t = Date.now()
    while (!f()) {
      if (Date.now() - t > ms) throw new Error('until: timeout')
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  beforeAll(async () => {
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_SNAPSHOTS_DIR = snapBase
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    process.env.DSH_OPENCLI_EVENTS_FILE = eventsFile
    process.env.DSH_OPENCLI_INBOX_DIR = inboxPath
    mkdirSync(inboxPath, { recursive: true }) // ⑤ 意图文件落点(收件箱目录不存在时 drainInbox 静默回 0)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable (test default)') }))
    ctx = new Context()
    await ctx.plugin(ShellStub)
    await ctx.plugin(GhostTools)
    await ctx.plugin(StubSystemPrompt)
    await ctx.plugin(OpencliService)
    ;(ctx.opencli as unknown as { so: unknown }).so = { configured: false, warm: true, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    // subprocess seam 禁用(health-check.test.ts 同款):宿主真 seam 会 spawn 真 CLI 探到真 daemon
    {
      const reflect = (ctx as unknown as { reflect: { get: (p: string, f?: boolean) => unknown } }).reflect
      const origGet = reflect.get.bind(reflect)
      reflect.get = (name: string, flag?: boolean) => (name === 'subprocess' ? undefined : origGet(name, flag))
    }
    svcRef = ctx.opencli as OpencliService
  })

  afterEach(() => {
    P().circuitOpen.clear() // 开过熔断窗的用例清窗,防串染(事件列表不清:各用例按增量断言)
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    for (const p of [statePath, snapBase, traceDir, eventsFile, inboxPath]) rmSync(p, { recursive: true, force: true })
  })

  // ── ① 熔断(§七#4:系统级失败止血,窗内同签名短路)──────────────────────────────

  it('① 熔断开窗:首任务烧满重试链开窗一次;窗内同签名任务首败短路单行,不再补失败事件', async () => {
    const S = P()
    S.lastSelfHealAt = Date.now() // 退避窗冻结:开窗/短路路径不被执行期自愈分支打扰(restart 应为零)
    const restoreDs = stubDs([{ running: true, version: '2.0.3', extension: 'connected' }])
    const restarts: string[] = []
    const restoreRun = stubRun({ exitCode: 1, stderr: 'UNKNOWN fetch failed: undici socket hang up' }, restarts)
    const a = addTask({ retry: 3 })
    const b = addTask({ retry: 3 })
    try {
      const open0 = evOf('circuit-open').length
      const fail0 = evOf('schedule-failed').length
      await S.runSiteCommand(a.site, a.id)
      // 开窗:窗登记 + 单条 circuit-open 事件(带签名)+ schedule-failed 随链补发
      expect(S.circuitOpen.has('fetch-failed')).toBe(true)
      expect(evOf('circuit-open')).toHaveLength(open0 + 1)
      expect(evOf('circuit-open')[0]!.text).toContain('fetch-failed')
      expect(evOf('schedule-failed')).toHaveLength(fail0 + 1)
      // 链烧满:retry=3 → 3 行,无 ⚡ 短路行;退避窗内零 restart(执行期自愈 skip-backoff)
      const rowsA = S.runHistory[a.id] ?? []
      expect(rowsA).toHaveLength(3)
      expect(rowsA[0]!.summary).not.toContain('⚡')
      expect(restarts).toHaveLength(0)
      // 窗内短路:B 同签名首败即断——单行 ⚡(跨任务去重,§七#4)
      await S.runSiteCommand(b.site, b.id)
      const rowsB = S.runHistory[b.id] ?? []
      expect(rowsB).toHaveLength(1)
      expect(rowsB[0]!.summary).toContain('⚡ 熔断')
      expect(rowsB[0]!.summary).toContain('fetch-failed')
      // 窗内不重复开窗、不补 schedule-failed、不走自愈(检查序:熔断先于自愈)
      expect(evOf('circuit-open')).toHaveLength(open0 + 1)
      expect(evOf('schedule-failed')).toHaveLength(fail0 + 1)
      expect(restarts).toHaveLength(0)
    } finally {
      restoreRun()
      restoreDs()
      dropTask(a.id)
      dropTask(b.id)
    }
  })

  it('① 两签名形态独立开窗:eperm 开第二窗不吞并;站点面失败不熔断', async () => {
    const S = P()
    S.lastSelfHealAt = Date.now()
    const restoreDs = stubDs([{ running: true, version: '2.0.3', extension: 'connected' }])
    const restarts: string[] = []
    // 站点面对照:非系统级失败(circuitSignatureOf=null)→ 不开窗、照常记 schedule-failed
    let restoreRun = stubRun({ exitCode: 1, stderr: 'site boom: 500 internal error' }, restarts)
    const ctrl = addTask({ retry: 1 })
    const open0 = evOf('circuit-open').length
    const fail0 = evOf('schedule-failed').length
    await S.runSiteCommand(ctrl.site, ctrl.id)
    expect(S.circuitOpen.size).toBe(0)
    expect(evOf('circuit-open')).toHaveLength(open0)
    expect(evOf('schedule-failed')).toHaveLength(fail0 + 1)
    expect((S.runHistory[ctrl.id] ?? [])[0]!.summary).not.toContain('⚡')
    dropTask(ctrl.id)
    // eperm 形态:Windows 文件系 EPERM(09-25 九分钟窗 75 条洪水实证)开自己的窗
    restoreRun()
    restoreRun = stubRun({ exitCode: 1, stderr: 'Error: EPERM: operation not permitted, open C:\\tmp\\fg.json' }, restarts)
    const e1 = addTask({ retry: 1 })
    await S.runSiteCommand(e1.site, e1.id)
    expect(S.circuitOpen.has('eperm')).toBe(true)
    expect(evOf('circuit-open')).toHaveLength(open0 + 1)
    expect(evOf('circuit-open')[0]!.text).toContain('eperm')
    expect(S.circuitOpen.has('fetch-failed')).toBe(false) // 窗按签名分立:开 eperm 不带出 fetch-failed
    dropTask(e1.id)
    // eperm 窗内短路:同签名任务单行 ⚡,不再补事件(ctrl 与 e1 各补过一条 schedule-failed)
    const e2 = addTask({ retry: 3 })
    await S.runSiteCommand(e2.site, e2.id)
    const rows = S.runHistory[e2.id] ?? []
    expect(rows).toHaveLength(1)
    expect(rows[0]!.summary).toContain('⚡ 熔断')
    expect(rows[0]!.summary).toContain('eperm')
    expect(evOf('circuit-open')).toHaveLength(open0 + 1)
    expect(evOf('schedule-failed')).toHaveLength(fail0 + 2)
    dropTask(e2.id)
    restoreRun()
    restoreDs()
  })

  it('① 退避窗不再 restart:自愈首发单次 restart+事件,窗内后续调用 skip-backoff 零动作', async () => {
    const S = P()
    const restoreDs = stubDs([{ running: true, version: '2.0.3', extension: 'connected' }])
    const restarts: string[] = []
    const restoreRun = stubRun({ exitCode: 0, stdout: 'Daemon restarted', stderr: '' }, restarts)
    try {
      S.lastSelfHealAt = 0 // 退避窗外:允许自愈
      const heal0 = evOf('daemon-selfheal').length
      const r1 = await S.selfHealDaemon('版本翻转')
      expect(r1).toBe('ok')
      expect(restarts).toHaveLength(1) // 单次 restart(D3 纪律:restart→重探,不成循环)
      expect(evOf('daemon-selfheal')).toHaveLength(heal0 + 1)
      // 退避窗内(刚自愈过):skip-backoff——不再 restart、不再记事件(修复无效时不连发)
      const r2 = await S.selfHealDaemon('版本翻转')
      expect(r2).toBe('skip-backoff')
      expect(restarts).toHaveLength(1)
      expect(evOf('daemon-selfheal')).toHaveLength(heal0 + 1)
    } finally {
      restoreRun()
      restoreDs()
      S.lastSelfHealAt = 0
    }
  })

  // ── ② 翻转自愈(#2761 CLI/App 互杀;方法桩式,照 health-check.test.ts 既有桩纪律)────

  it('② 版本翻转 → 单次 restart → 重探恢复(退避窗外;基线更新为翻转后版本)', async () => {
    const S = P()
    S.lastDaemonVersion = '1.8.6' // App 内置旧 daemon 基线,当前探测 2.0.0 → 翻转
    S.lastSelfHealAt = 0
    const dsCalls: number[] = []
    const restoreDs = stubDs([
      { running: true, version: '2.0.0', extension: 'connected' }, // 初探:翻转被检出
      { running: true, version: '2.0.0', extension: 'connected' }, // restart 后重探(selfHealDaemon)
      { running: true, version: '2.0.0', extension: 'connected' }, // 自愈后再探(taskHealthCheck)
    ], dsCalls)
    const restarts: string[] = []
    const restoreRun = stubRun({ exitCode: 0, stdout: 'Daemon restarted', stderr: '' }, restarts)
    try {
      const flips = evOf('daemon-flip').length
      const heal0 = evOf('daemon-selfheal').length
      const hc = await S.taskHealthCheck('no-such-task')
      expect(hc.ok).toBe(true)
      expect(hc.note).toContain('版本翻转')
      expect(hc.note).toContain('已自动重启 daemon')
      expect(restarts).toHaveLength(1) // 单次 restart:「翻转→重启」不成循环
      expect(evOf('daemon-flip')).toHaveLength(flips + 1)
      expect(evOf('daemon-flip')[0]!.text).toContain('1.8.6 → 2.0.0')
      expect(evOf('daemon-selfheal')).toHaveLength(heal0 + 1)
      // 重探真发生了:daemonStatus 三连(初探/自愈重探/自愈后再探)——restart 输出是纯文本,
      // 恢复判定必须重探,不解析 restart stdout
      expect(dsCalls.length).toBe(3)
      expect(S.lastDaemonVersion).toBe('2.0.0')
    } finally {
      restoreRun()
      restoreDs()
      S.lastDaemonVersion = undefined
      S.lastSelfHealAt = 0
    }
  })

  it('② skip-backoff 期间不重复 restart:连续两拍检出翻转,零 restart 零自愈事件,放行执行链', async () => {
    const S = P()
    S.lastDaemonVersion = '1.8.6'
    S.lastSelfHealAt = Date.now() // 退避窗冻结:skip-backoff 直通
    const restoreDs = stubDs([{ running: true, version: '2.0.0', extension: 'connected' }])
    const restarts: string[] = []
    const restoreRun = stubRun({ exitCode: 0, stdout: 'Daemon restarted', stderr: '' }, restarts)
    try {
      const heal0 = evOf('daemon-selfheal').length
      const hc1 = await S.taskHealthCheck('no-such-task')
      expect(hc1.ok).toBe(true) // skip 放行(退避窗内不挡执行链,循环防护的一部分)
      expect(hc1.note).toContain('版本翻转')
      expect(hc1.note).not.toContain('已自动重启 daemon')
      expect(restarts).toHaveLength(0)
      const hc2 = await S.taskHealthCheck('no-such-task')
      expect(hc2.ok).toBe(true)
      expect(restarts).toHaveLength(0) // 第二拍同样零 restart(防「翻转→重启」循环)
      expect(evOf('daemon-selfheal')).toHaveLength(heal0)
    } finally {
      restoreRun()
      restoreDs()
      S.lastDaemonVersion = undefined
      S.lastSelfHealAt = 0
    }
  })

  // ── ③ governor while 重查(0.1.2 发后审查 low:直增会短暂超 max)─────────────────

  it('③ 唤醒竞态:release 唤醒到被唤者 ++ 之间新到者抢槽——重查拦回队列,并发不超 max', async () => {
    const S = P()
    const pol = S.usagePolicy
    const saved = { minDelayMs: pol.minDelayMs, burst: pol.burst, maxConcurrency: pol.maxConcurrency }
    pol.minDelayMs = 0
    pol.burst = 1000
    pol.maxConcurrency = 2
    S.cooldownUntil = 0
    try {
      const a1 = S.acquireGovernor('read')
      const a2 = S.acquireGovernor('read')
      await Promise.all([a1, a2])
      expect(S.concurrent).toBe(2) // 两槽占满
      let w1Done = false
      const w1 = S.acquireGovernor('read').then(() => { w1Done = true })
      await Promise.resolve() // w1 入队(while 检查同步执行)
      S.releaseGovernor('read') // 唤醒 w1(resolver 已出队)——w1 尚未 ++
      S.acquireGovernor('read') // 新到者在微任务间隙同步抢走空槽
      await flush() // w1 续跑:重查 concurrent=2 → 重新入队(修前直增会短暂到 3)
      expect(S.concurrent).toBe(2) // 恒不超 max
      expect(w1Done).toBe(false) // 被唤者被重查拦回
      expect(S.queue.length).toBe(1) // 队列里就是它(重查只看 concurrent,不看 queue.length——不 livelock)
      S.releaseGovernor('read') // 出槽:w1 这次拿到
      await flush()
      expect(w1Done).toBe(true)
      expect(S.concurrent).toBe(2) // N+w1
      S.releaseGovernor('read')
      S.releaseGovernor('read')
      expect(S.concurrent).toBe(0)
      expect(S.queue.length).toBe(0)
    } finally {
      Object.assign(pol, saved)
    }
  })

  it('③ 并发压测:12 路并发同时在飞,在飞恒 2 余者排队,全程峰值不超 max', async () => {
    const S = P()
    const pol = S.usagePolicy
    const saved = { minDelayMs: pol.minDelayMs, burst: pol.burst, maxConcurrency: pol.maxConcurrency }
    pol.minDelayMs = 0
    pol.burst = 1000
    pol.maxConcurrency = 2
    S.cooldownUntil = 0
    try {
      let peak = 0
      const flights = Array.from({ length: 12 }, () =>
        S.acquireGovernor('read').then(() => { peak = Math.max(peak, S.concurrent) }))
      await new Promise((r) => setTimeout(r, 20))
      expect(S.concurrent).toBe(2) // 槽满
      expect(S.queue.length).toBe(10) // 12-2 排队
      // 逐拍放行:每 release 之间让被唤者真正拿槽(重查语义下,一次同步放行多拍会让
      // 后到的被唤者重查回队——那是礼貌限流的预期行为,不是回归;压测断言的是「不超 max」)
      for (let i = 0; i < 12; i++) {
        S.releaseGovernor('read')
        await flush()
      }
      await Promise.all(flights)
      expect(peak).toBeLessThanOrEqual(2) // 每个放行时点并发 ≤ max
      expect(S.concurrent).toBe(0)
      expect(S.queue.length).toBe(0)
    } finally {
      Object.assign(pol, saved)
    }
  })

  // ── ④ schedMarkers 有界(此前寄生 runHistory 无限累积 5055 键的解药)──────────────

  it('④ 过期淘汰:>10 分钟 TTL 的 marker 在下一次入册时被清,未过期保留', () => {
    const S = P()
    const M = S.schedMarkers
    M.clear()
    try {
      S.addSchedMarker('fg-a')
      S.addSchedMarker('fg-b')
      S.addSchedMarker('fg-c')
      // 回拨两条到 11 分钟前(TTL 10 分钟):过期线内侧不留
      M.set('fg-a', Date.now() - 11 * 60_000)
      M.set('fg-b', Date.now() - 11 * 60_000)
      S.addSchedMarker('fg-d') // 新入册顺带淘汰过期条目
      expect(M.has('fg-a')).toBe(false)
      expect(M.has('fg-b')).toBe(false)
      expect(M.has('fg-c')).toBe(true)
      expect(M.has('fg-d')).toBe(true)
      expect(M.size).toBe(2)
    } finally {
      M.clear()
    }
  })

  it('④ 2000 上限:超限裁最旧,存活数恒 ≤ CAP', () => {
    const S = P()
    const M = S.schedMarkers
    M.clear()
    try {
      const cap = (OpencliService as unknown as { SCHED_MARKER_CAP: number }).SCHED_MARKER_CAP
      expect(cap).toBe(2000)
      for (let i = 0; i < cap + 5; i++) S.addSchedMarker(`fg-cap-${i}`)
      expect(M.size).toBe(cap)
      expect(M.has('fg-cap-0')).toBe(false) // 最旧被裁
      expect(M.has('fg-cap-4')).toBe(false)
      expect(M.has('fg-cap-5')).toBe(true) // 裁界后第一份存活
      expect(M.has(`fg-cap-${cap + 4}`)).toBe(true) // 最新存活
    } finally {
      M.clear()
    }
  })

  // ── ⑤ drain 重入守卫(3s 一拍,慢 drain 期间在途拍会无上限叠加的解药)─────────────

  it('⑤ drain 重入守卫:慢 drain 在途时新拍整拍跳过(连 executor 都不进),出结果后下一拍接管', async () => {
    const S = P()
    writeFileSync(join(inboxPath, '5001-fg.json'), JSON.stringify({ kind: 'status' }))
    let execCount = 0
    let statusEntered = 0
    let openGate: () => void = () => {}
    const gate = new Promise<void>((r) => { openGate = r })
    const origExec = S.inboxExecutor
    S.inboxExecutor = () => {
      execCount++
      return {
        scheduleAdd: async () => ({ ok: true, id: 'x' }), scheduleRemove: async () => ({ ok: true }),
        scheduleRun: async () => ({ ok: true }), scheduleList: async () => ({ ok: true, schedules: [] }),
        scheduleRead: async () => ({ ok: true, marked: 0 }), scheduleArchive: async () => ({ ok: true, archived: 0 }),
        notifySet: async () => ({ ok: true }), notifyTest: async () => ({ ok: true }), reportBuild: async () => ({ ok: true }),
        undo: async () => ({ ok: true }), backup: async () => ({ ok: true }), reportExport: async () => ({ ok: true }),
        status: async () => { statusEntered++; await gate; return { ok: true } },
        event: () => {},
      }
    }
    try {
      const p1 = S.drainInboxSafe() // 第一拍:入列,意图执行卡在闸上(慢 drain)
      await until(() => statusEntered === 1)
      expect(S.inboxDraining).toBe(true)
      await S.drainInboxSafe() // 第二拍:在途——整拍跳过,不叠加并发 drain
      expect(execCount).toBe(1) // 守卫在 executor 之前:第二拍连 inboxExecutor 都没调
      expect(statusEntered).toBe(1) // 不会并发执行第二个意图
      openGate()
      await p1
      expect(S.inboxDraining).toBe(false) // 出闸复位:下一拍自然接管
      await S.drainInboxSafe()
      expect(execCount).toBe(2) // 收件箱已空,executor 照常被调(拍子恢复)
    } finally {
      S.inboxExecutor = origExec
    }
  })

  // ── ⑥ selfCheck 幽灵工具鉴别(撞名让位,点名对失败形态有真鉴别力)─────────────────

  it('⑥ selfCheck 幽灵工具鉴别:撞名让位 registered:false + conflicts 在册;其余正主 registered:true', async () => {
    const S = P()
    // 注册期让位已发生(本文件 GhostTools 对 opencli_status 抛 already registered)
    expect(S.toolConflicts).toContain(COLLIDE_TOOL)
    expect(S.expectedToolNames).toContain(COLLIDE_TOOL) // 预期册:成功与撞名都入
    expect(S.registeredToolNames).not.toContain(COLLIDE_TOOL) // 成功册:撞名不入——两册分开是鉴别力来源
    const sc = await S.selfCheck()
    expect(sc.ok).toBe(true) // 让位不是自检失败
    const ghost = sc.tools.find((t) => t.name === COLLIDE_TOOL)
    expect(ghost).toBeDefined()
    expect(ghost!.registered).toBe(false) // 修前点名恒真:幽灵工具根本点不出来
    const alive = sc.tools.find((t) => t.name === 'opencli_doctor')
    expect(alive).toBeDefined()
    expect(alive!.registered).toBe(true)
    expect(sc.tools.filter((t) => t.name !== COLLIDE_TOOL).every((t) => t.registered === true)).toBe(true)
    expect(sc.conflicts).toContain(COLLIDE_TOOL)
  })

  // ── ⑦ 数组形态优先 + quoteShellArg 转义(0.1.2 发后审查发现 2)────────────────────

  it('⑦ 数组形态优先:宿主两形态都认 → 锁定 array,argv 原样数组透传不拼 shell', async () => {
    const S = P()
    const pol = S.usagePolicy
    const saved = { minDelayMs: pol.minDelayMs, burst: pol.burst }
    pol.minDelayMs = 0
    pol.burst = 1000
    const savedMode = S.shellMode
    const savedRejected = ShellStub.arrayRejected
    ShellStub.arrayRejected = false
    S.shellMode = null // 归零:强制走 array→resolved→direct 三形态探测
    ShellStub.calls.length = 0
    try {
      const r = await S.runOpencli(['fgx', 'hot', '--query', 'a b'])
      expect(r.exitCode).toBe(0)
      expect(S.shellMode).toBe('array') // 锁定数组形态
      const first = ShellStub.calls[0]!
      expect(first.mode).toBe('array') // 探测序首选即 array(数组不经 shell 解析,零注入面)
      expect(Array.isArray(first.command)).toBe(true)
      expect((first.command as string[]).slice(-4)).toEqual(['fgx', 'hot', '--query', 'a b']) // 原样透传,元素不碎裂
      // 锁定后第二发不再探测:恒 array,无字符串形态尝试
      ShellStub.calls.length = 0
      await S.runOpencli(['fgx', 'hot'])
      expect(S.shellMode).toBe('array')
      expect(ShellStub.calls).toHaveLength(1)
      expect(ShellStub.calls[0]!.mode).toBe('array')
    } finally {
      Object.assign(pol, saved)
      S.shellMode = savedMode
      ShellStub.arrayRejected = savedRejected
    }
  })

  it('⑦ 只认字符串的宿主:逐参数 quoteShellArg 转义——元字符参数整体成段不碎裂', async () => {
    const S = P()
    const pol = S.usagePolicy
    const saved = { minDelayMs: pol.minDelayMs, burst: pol.burst }
    pol.minDelayMs = 0
    pol.burst = 1000
    const savedMode = S.shellMode
    const savedRejected = ShellStub.arrayRejected
    ShellStub.arrayRejected = true // 0.1.x 宿主形态:array 尝试抛错换下一形态
    S.shellMode = null
    ShellStub.calls.length = 0
    try {
      const r = await S.runOpencli(['fgx', 'search', '--query', 'hot "AI" agent'])
      expect(r.exitCode).toBe(0)
      expect(S.shellMode).toBe('resolved') // resolve() 形态接住并锁定
      const strCall = ShellStub.calls.find((c) => c.mode === 'string')
      expect(strCall).toBeDefined()
      const cmd = String(strCall!.command)
      // 转义段在:内层双引号转义,参数整体保持一个 shell 词——空白/引号不把参数拆散
      expect(cmd).toContain('"hot \\"AI\\" agent"')
      // 未转义的裸元字符序列绝不落进 shell 命令行(裸段会被空白切词碎裂成三个参数)
      expect(cmd).not.toContain('hot "AI" agent')
    } finally {
      Object.assign(pol, saved)
      S.shellMode = savedMode
      ShellStub.arrayRejected = savedRejected
    }
  })

  it('⑦ quoteShellArg:安全字符直通;空白/引号/$/反引号/反斜杠整体双引号并转义', () => {
    const q = (s: string): string => (OpencliService as unknown as { quoteShellArg: (s: string) => string }).quoteShellArg(s)
    expect(q('zhihu')).toBe('zhihu') // 安全字符集直通
    expect(q('v1.2.3')).toBe('v1.2.3') // @%+=:,./- 全在直通集
    expect(q('a-b_c')).toBe('a-b_c')
    expect(q('a b')).toBe('"a b"') // 空白 → 整体引住
    expect(q('a"b')).toBe('"a\\"b"') // 内层双引号转义
    expect(q('a$b')).toBe('"a\\$b"') // $ 转义(变量展开防线)
    expect(q('a`b')).toBe('"a\\`b"') // 反引号转义(命令替换防线)
    expect(q('a\\b')).toBe('"a\\\\b"') // 反斜杠转义
    expect(q('a;b|c&d')).toBe('"a;b|c&d"') // 其余元字符整体引住(POSIX 双引号内不活性)
  })
})
