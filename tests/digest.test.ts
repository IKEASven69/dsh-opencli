// 日结早报(0.1.4 候选 2)与连败降噪/熔断归因(候选 3)测试。
// 纯函数段(digest.ts 直测):本地日键 / FailStreakCounter(bump 幂等/连续日/断链/重启重建)
// / judgeCircuitAttribution 四档判定 / buildDigest(总览计数/签名折叠+「连续第 N 日」/归因附注/
// 归档条目不产行只进 X/空窗卡/超预算裁剪序/出口 scrub/缺口归因只在可证时给)。
// 服务段(经 lib 构建产物装配,notify.test 任务 E 同款):日结触发一次(本地日期翻转 → 卡+
// md+json+digest 事件,同日二次检查不重发)/ 同签名连败两日 → 失败推送带「连续第 2 日」+
// 早报失败段折叠 / 开窗自动 canary 归因 → circuit-attribution 事件 / 早报卡(空窗与非空窗
// 一样)quietHours 窗内顺延出窗补发 / DSH_OPENCLI_DIGEST_DISABLE=1 关闸 / notify=false 全关门。
// 网络零外发:fetch 桩捕获 webhook;runOpencli/daemonStatus/canaryRun 实例桩;
// 桩时钟 vi.useFakeTimers 只假 Date(quiet-staging 同款),调度 tick(NEVER_CRON)空转,
// 执行与日结全由 runSiteCommand/dailyDigestCheck 直调驱动,断言不受真实时钟影响。
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import {
  localDateKey, prevDateKey, circuitSignatureOf, judgeCircuitAttribution,
  buildDigest, DigestDayLedger, FailStreakCounter, FAIL_STREAK_CAP,
  type CircuitAttribution, type DigestDayEntry,
} from '../src/digest.ts'
import { OpencliService } from '../lib/index.js'

// ---------------------------------------------------------------------------
// 纯函数段
// ---------------------------------------------------------------------------

/** 本地时刻 → ISO(测试断言按本地日历日构造,任何时区下都成立)。 */
const iso = (y: number, m: number, d: number, hh = 0, mm = 0): string => new Date(y, m - 1, d, hh, mm).toISOString()
/** 本地日历日构造入账条目(默认 08:00)。 */
const entry = (y: number, m: number, d: number, over: Partial<DigestDayEntry> = {}): DigestDayEntry =>
  ({ at: iso(y, m, d, 8), ok: true, summary: 'ok', ...over })
/** 指定本地时刻构造入账条目。 */
const entryAt = (y: number, m: number, d: number, hh: number, mm: number, over: Partial<DigestDayEntry> = {}): DigestDayEntry =>
  ({ at: iso(y, m, d, hh, mm), ok: true, summary: 'ok', ...over })

describe('localDateKey / prevDateKey(本地日历日键,日结与连败的时间基准)', () => {
  it('本地日键与前日键:跨月/跨年衔接正确', () => {
    expect(localDateKey(new Date(2026, 10, 12, 23, 59))).toMatch(/^\d{4}-11-12$/)
    expect(prevDateKey('2026-11-12')).toMatch(/^\d{4}-11-11$/)
    expect(prevDateKey('2026-11-01')).toMatch(/^\d{4}-10-31$/)
    expect(prevDateKey('2026-01-01')).toMatch(/^\d{4}-12-31$/)
  })
})

describe('circuitSignatureOf(自 index.ts 移入,判定语义不变)', () => {
  it('fetch failed / EPERM 两类系统面签名;其余 null', () => {
    expect(circuitSignatureOf('UNKNOWN fetch failed')).toBe('fetch-failed')
    expect(circuitSignatureOf('Error: EPERM: operation not permitted, open')).toBe('eperm')
    expect(circuitSignatureOf('site 500 boom')).toBeNull()
  })
})

describe('FailStreakCounter(候选 3:有界 Map,按本地日历日)', () => {
  it('bump:首日 1;连续次日 +1;同日多次幂等;断一日重数 1', () => {
    const c = new FailStreakCounter()
    expect(c.bump('t', 'fetch-failed', new Date(2026, 10, 10))).toBe(1)
    expect(c.bump('t', 'fetch-failed', new Date(2026, 10, 10, 15))).toBe(1) // 同日幂等
    expect(c.bump('t', 'fetch-failed', new Date(2026, 10, 11))).toBe(2)
    expect(c.bump('t', 'fetch-failed', new Date(2026, 10, 12, 3))).toBe(3)
    expect(c.bump('t', 'fetch-failed', new Date(2026, 10, 15))).toBe(1) // 断两天:重数
    expect(c.daysOf('t', 'fetch-failed')).toBe(1)
  })

  it('不同任务/不同签名互不串扰;成功 reset 清整任务', () => {
    const c = new FailStreakCounter()
    expect(c.bump('a', 'fetch-failed', new Date(2026, 10, 10))).toBe(1)
    expect(c.bump('b', 'fetch-failed', new Date(2026, 10, 10))).toBe(1)
    expect(c.bump('a', 'eperm', new Date(2026, 10, 10))).toBe(1)
    c.reset('a')
    expect(c.daysOf('a', 'fetch-failed')).toBe(0)
    expect(c.daysOf('a', 'eperm')).toBe(0)
    expect(c.daysOf('b', 'fetch-failed')).toBe(1)
  })

  it('有界:超 FAIL_STREAK_CAP 裁最旧(插入序=时间序)', () => {
    const c = new FailStreakCounter()
    for (let i = 0; i < FAIL_STREAK_CAP + 10; i++) c.bump(`t${i}`, 'fetch-failed', new Date(2026, 10, 10))
    expect(c.daysOf('t0', 'fetch-failed')).toBe(0) // 最旧被裁
    expect(c.daysOf(`t${FAIL_STREAK_CAP + 9}`, 'fetch-failed')).toBe(1) // 最新存活
  })

  it('rebuildFromRunHistory:从持久化 runHistory 重建连败(重启恢复);尾部成功/签名不同/日历断链不重建', () => {
    const c = new FailStreakCounter()
    c.rebuildFromRunHistory({
      a: [ // 存储序=newest-first(unshift),重建内部按时间排序
        { at: iso(2026, 11, 12, 9), ok: false, summary: '#3/3 UNKNOWN fetch failed' },
        { at: iso(2026, 11, 11, 9), ok: false, summary: '#2/3 fetch failed' },
        { at: iso(2026, 11, 10, 9), ok: true, summary: '1. 热点' },
      ],
      b: [{ at: iso(2026, 11, 12, 9), ok: true, summary: 'ok' }], // 尾部成功:断链不重建
      d: [ // 同日多条只计一天 + 日历日断链(10 与 12 之间缺 11)
        { at: iso(2026, 11, 12, 9), ok: false, summary: 'EPERM: operation not permitted' },
        { at: iso(2026, 11, 12, 8), ok: false, summary: 'EPERM: operation not permitted' },
        { at: iso(2026, 11, 10, 9), ok: false, summary: 'EPERM: operation not permitted' },
      ],
      e: [{ at: iso(2026, 11, 12, 9), ok: false, summary: 'site 500 boom' }], // 非系统面签名:不猜
    })
    expect(c.daysOf('a', 'fetch-failed')).toBe(2)
    expect(c.daysOf('b', 'fetch-failed')).toBe(0)
    expect(c.daysOf('d', 'eperm')).toBe(1)
    expect(c.daysOf('e', 'fetch-failed')).toBe(0)
    // 重建后活链继续:bump 次日(11-13)在重建值上累加
    expect(c.bump('a', 'fetch-failed', new Date(2026, 10, 13))).toBe(3)
  })
})

describe('judgeCircuitAttribution(候选 3:canary 通过率分档,启发式不是裁决)', () => {
  it('total=0 → unknown(如实:canary 未完成不猜);≤0.5 → system;≥0.8 → site-or-transient;中间 → mixed', () => {
    const u = judgeCircuitAttribution('fetch-failed', { ok: false, total: 0, passed: 0, error: '目录不可用' }, 'T')
    expect(u.verdict).toBe('unknown')
    expect(u.summary).toContain('canary 未完成')
    expect(u.summary).toContain('无法区分')
    const sys = judgeCircuitAttribution('fetch-failed', { ok: false, total: 20, passed: 3 }, 'T')
    expect(sys.verdict).toBe('system')
    expect(sys.detail).toContain('🔍 熔断归因(fetch-failed)')
    expect(sys.detail).toContain('3/20')
    expect(sys.detail).toContain('大面积失败')
    const site = judgeCircuitAttribution('fetch-failed', { ok: true, total: 20, passed: 18 }, 'T')
    expect(site.verdict).toBe('site-or-transient')
    expect(site.summary).toContain('系统面当前可用')
    const mixed = judgeCircuitAttribution('fetch-failed', { ok: false, total: 20, passed: 11 }, 'T')
    expect(mixed.verdict).toBe('mixed')
    expect(mixed.summary).toContain('无法定论')
  })
})

describe('buildDigest(候选 2:总览计数/分层折叠/双层产物)', () => {
  const attrs = new Map<string, CircuitAttribution>([
    ['fetch-failed', judgeCircuitAttribution('fetch-failed', { ok: false, total: 20, passed: 3 }, iso(2026, 11, 12, 23))],
  ])

  it('总览计数全量占行;失败段按 (任务,签名) 折叠带「连续第 N 日」+ 熔断标 + 归因附注', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'zhihu hot', 'panel', entryAt(2026, 11, 12, 2, 0, { ok: false, summary: 'UNKNOWN fetch failed', signature: 'fetch-failed', circuit: true }))
    ledger.record('t1', 'zhihu hot', 'panel', entryAt(2026, 11, 12, 14, 0, { ok: false, summary: 'UNKNOWN fetch failed ⚡ 熔断:30 分钟窗内短路', signature: 'fetch-failed', circuit: true }))
    ledger.record('t1', 'zhihu hot', 'panel', entryAt(2026, 11, 12, 15, 0, { ok: true, summary: '1. AI 热点', watchHits: ['AI'], diff: '新增 2 条:x' }))
    ledger.record('t2', 'weibo hot', undefined, entry(2026, 11, 12))
    ledger.record('t2', 'weibo hot', undefined, entryAt(2026, 11, 12, 21, 0))
    const built = buildDigest({
      date: '2026-11-12', genAt: new Date(2026, 10, 13, 0, 0, 7), ledger,
      streakOf: (id, sig) => (id === 't1' && sig === 'fetch-failed' ? 3 : 0),
      attributions: attrs,
    })
    expect(built.title).toBe('[dsh-opencli] 早报 2026-11-12')
    expect(built.overview).toBe('2 任务:1 成功 · 1 失败 · 1 watch 命中 · 0 空产出已归档')
    expect(built.emptyWindow).toBe(false)
    expect(built.card).toContain('✗ zhihu hot(来源 panel):签名 fetch-failed · 本日 2 次 · 连续第 3 日 · ⚡ 熔断 · 末次')
    expect(built.card).toContain('🔍 归因:系统面故障——canary 仅通过 3/20')
    expect(built.card).toContain('🔔 zhihu hot:命中 AI——1. AI 热点')
    expect(built.card).toContain('📊 zhihu hot:新增 2 条:x')
    expect(built.card).toContain('✓ weibo hot · run 2 次')
    // 尾行回执口径:账目起于 02:00(本用例首条入账),头部缺失如实标注
    expect(built.card).toContain('🧾 口径:进程内存日账,重启丢账;账目自 02:00 起')
    expect(built.card).toContain('详情 digest-2026-11-12.md')
    // 排序纪律:失败段在 watch 命中段之前(worthPushing 分层)
    expect(built.card.indexOf('✗ zhihu hot')).toBeLessThan(built.card.indexOf('🔔 zhihu hot'))
    // md 骨架(dsh-ai-research):单 H1 / 元信息引用块 / 固定尾章「数据缺口」
    expect(built.md.startsWith('# dsh-opencli 早报 · 2026-11-12')).toBe(true)
    expect(built.md).toContain('> 覆盖:2026-11-12(本地自然日)')
    expect(built.md).toContain('## 数据缺口')
    expect(built.md).toContain('- 账目自 02:00 起') // 本用例账目起于 02:00,缺口章如实列出
    expect(built.md).toContain('  - 🔍 归因(system):')
    expect(built.json.totals).toMatchObject({ tasks: 2, allOk: 1, withFailure: 1, watchHit: 1, changeHit: 1, archivedEntries: 0, runs: 5 })
    expect(built.json.failures[0]).toMatchObject({ task: 'zhihu hot', source: 'panel', signature: 'fetch-failed', dayCount: 2, streakDays: 3, circuit: true })
    expect(built.json.failures[0]?.attribution).toMatchObject({ verdict: 'system' })
    expect(built.json.routine).toEqual([{ task: 'weibo hot', runs: 2 }])
  })

  it('连败第 1 天不标「连续」(没有「连续」可标);无稳定签名折叠进未分类组不猜签名', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'zhihu hot', undefined, entry(2026, 11, 12, { ok: false, summary: 'site 500 boom' }))
    const built = buildDigest({
      date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger,
      streakOf: () => 1, attributions: new Map(),
    })
    expect(built.card).toContain('✗ zhihu hot:末次 site 500 boom')
    expect(built.card).not.toContain('连续第')
    expect(built.card).not.toContain('签名')
    expect(built.json.failures[0]?.signature).toBeUndefined()
    expect(built.json.failures[0]?.streakDays).toBeUndefined()
  })

  it('归档条目不进日报(候选 2⑤):archived 只进 X 计数,不产 watch/变化/失败行;markArchived 有钳制', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'zhihu hot', undefined, entry(2026, 11, 12, { ok: true, summary: '[]', empty: true, watchHits: ['AI'], archived: true }))
    ledger.record('t1', 'zhihu hot', undefined, entryAt(2026, 11, 12, 10, 0, { ok: true, summary: '[]', empty: true }))
    expect(ledger.markArchived('t1')).toBe(1)
    expect(ledger.markArchived('t1', 99)).toBe(0) // 钳制:未归档 run 计满后为 0
    expect(ledger.markArchived('ghost')).toBe(0) // 无账任务
    const built = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger, streakOf: () => 0, attributions: new Map() })
    expect(built.overview).toContain('2 空产出已归档') // 1 条入账即带 archived + 1 次 markArchived
    expect(built.card).not.toContain('🔔')
    expect(built.json.totals.archivedEntries).toBe(2)
    expect(built.json.routine).toEqual([{ task: 'zhihu hot', runs: 2 }]) // 空产出全部已归档,例行段不再重复计
  })

  it('空窗卡:N 任务全部正常一行卡(可见性优先,计数仍在)', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'weibo hot', undefined, entry(2026, 11, 12))
    ledger.record('t2', 'zhihu hot', undefined, entry(2026, 11, 12, 9, { ok: true, summary: '[]', empty: true }))
    const built = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger, streakOf: () => 0, attributions: new Map() })
    expect(built.emptyWindow).toBe(true)
    expect(built.card).toContain('2 任务全部正常:2 成功 · 0 失败 · 0 watch 命中 · 0 空产出已归档')
    expect(built.card).toContain('🧾 口径')
    expect(built.card).not.toContain('✗')
  })

  it('超预算裁剪序=例行→变化→watch→归因附注(worthPushing 越低越先裁),失败行永不裁;留计数痕', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t0', 'zhihu hot', undefined, entry(2026, 11, 12, { ok: false, summary: 'UNKNOWN fetch failed', signature: 'fetch-failed', circuit: true }))
    for (let i = 0; i < 40; i++) {
      ledger.record(`c${i}`, `site${i} hot`, undefined, entry(2026, 11, 12, { summary: `1. 标题${i}`, diff: `新增 1 条:标题${i}` }))
    }
    const built = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger, streakOf: () => 0, attributions: new Map() })
    expect(built.card.length).toBeLessThanOrEqual(500)
    expect(built.card).toContain('✗ zhihu hot') // 失败段保留
    expect(built.card).toContain('…(变化 40 项略,全文见 digest-2026-11-12.md)')
  })

  it('账目覆盖缺口如实标注;归因只在可证时给(进程启动落在覆盖日),否则只写「账目自 HH:MM 起」', () => {
    const late = new DigestDayLedger('2026-11-12')
    late.record('t1', 'zhihu hot', undefined, entryAt(2026, 11, 12, 8, 3))
    // 进程当日启动(归因可证):带「进程当日启动/重启」注
    const b1 = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger: late, streakOf: () => 0, attributions: new Map(), processStartedAt: iso(2026, 11, 12, 8, 0) })
    expect(b1.json.gaps.join()).toContain('账目自 08:03 起')
    expect(b1.json.gaps.join()).toContain('进程当日启动/重启')
    expect(b1.card).toContain('账目自 08:03 起')
    expect(b1.md).toContain('账目自 08:03 起')
    // 进程早于覆盖日就在跑(普通 cron 每日 08:00 首跑的形态):不归因,不把调度时刻说成重启
    const b2 = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger: late, streakOf: () => 0, attributions: new Map(), processStartedAt: iso(2026, 11, 10, 9, 0) })
    expect(b2.json.gaps).toEqual(['账目自 08:03 起'])
    // 未提供启动时刻/无法解析:同样不归因(不猜)
    const b3 = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger: late, streakOf: () => 0, attributions: new Map() })
    expect(b3.json.gaps).toEqual(['账目自 08:03 起'])
    const b4 = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger: late, streakOf: () => 0, attributions: new Map(), processStartedAt: 'not-a-date' })
    expect(b4.json.gaps).toEqual(['账目自 08:03 起'])
    const early = new DigestDayLedger('2026-11-12')
    early.record('t1', 'zhihu hot', undefined, entryAt(2026, 11, 12, 0, 2))
    const b5 = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger: early, streakOf: () => 0, attributions: new Map(), processStartedAt: iso(2026, 11, 12, 8, 0) })
    expect(b5.json.gaps).toEqual([])
  })

  it('出口清洗:推送卡过 scrubLocalPaths(本机路径不外流);落盘 md 与 json 都过 scrubUrlParams', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'zhihu hot', undefined, entry(2026, 11, 12, { ok: false, summary: 'see C:\\Users\\whoami\\secrets\\x.json' }))
    ledger.record('t2', 'weibo hot', undefined, entry(2026, 11, 12, { ok: false, summary: 'denied ?token=abcdef123456' }))
    const built = buildDigest({ date: '2026-11-12', genAt: new Date(2026, 10, 13), ledger, streakOf: () => 0, attributions: new Map() })
    expect(built.card).not.toContain('C:\\Users')
    expect(built.card).toContain('[本地路径]')
    expect(built.card).toContain('token=') // 字段名保留(排障可读),值已脱敏——卡与落盘同口径
    expect(built.card).not.toContain('abcdef123456')
    expect(built.md).not.toContain('abcdef123456')
    expect(built.md).toContain('token=')
    // json 落盘层同口径(模块纪律「md/json 落盘层过 scrubUrlParams」):失败摘要在 json 里
    // 同样洗过——canary 定时失败摘要进日账→json 的链路不再有未洗值
    expect(built.json.failures.map((f) => f.lastSummary).join()).toContain('token=')
    expect(built.json.failures.map((f) => f.lastSummary).join()).not.toContain('abcdef123456')
    expect(JSON.stringify(built.json)).not.toContain('abcdef123456')
  })

  it('日账:入账日与本账日不符丢弃(跨午夜在途 run 宁少记不错账)', () => {
    const ledger = new DigestDayLedger('2026-11-12')
    ledger.record('t1', 'zhihu hot', undefined, entry(2026, 11, 13)) // 已翻页后的迟到条目
    expect(ledger.tasks.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 服务段(经 lib 构建产物装配;桩 shell + 桩 fetch + 桩时钟,零外发)
// ---------------------------------------------------------------------------

const NEVER_CRON = '0 3 31 2 *'
const HOOK_URL = 'https://hook.example.com/digest-it'

class DigestShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(_spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}
class DigestTools extends Service {
  readonly registered = new Map<string, unknown>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string }): void { this.registered.set(def.name, def) }
}
class DigestSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type Svc = {
  schedules: Array<{ id: string; site: string; cron: string; notify?: boolean; quietHours?: string; source?: string }>
  scheduleAdd: (r: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string }>
  scheduleRemove: (r: { id: string }) => Promise<{ ok: boolean }>
  notifyConfig: (r?: { channels?: unknown }) => Promise<{ ok: boolean }>
  runSiteCommand: (s: string, id: string) => Promise<void>
  dailyDigestCheck: () => Promise<void>
  digestMarkArchived: (id: string, count?: number) => number
  canaryRun: () => Promise<{ ok: boolean; total: number; passed: number; newFailures: string[]; recovered: string[]; path?: string; error?: string }>
  runOpencli: (...a: unknown[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  daemonStatus: () => Promise<unknown>
  ingestEventList: Array<{ kind: string; text: string }>
}

describe('日结早报 + 连败/归因(服务层:日结触发一次/折叠计数/归因事件)', () => {
  let ctx: InstanceType<typeof Context>
  let svc: OpencliService
  let S: Svc
  let hookBodies: Array<{ title: string; body: string }>
  const uniq = `${process.pid}-${Date.now()}`
  const statePath = join(os.tmpdir(), `dsh-opencli-digest-it-state-${uniq}.json`)
  const reportsDir = join(os.tmpdir(), `dsh-opencli-digest-it-reports-${uniq}`)
  const traceDir = join(os.tmpdir(), `dsh-opencli-digest-it-traces-${uniq}`)
  const shotsDir = join(os.tmpdir(), `dsh-opencli-digest-it-shots-${uniq}`)
  const canaryDir = join(os.tmpdir(), `dsh-opencli-digest-it-canary-${uniq}`)
  const saved = {
    state: process.env.DSH_OPENCLI_STATE, reports: process.env.DSH_OPENCLI_REPORTS_DIR,
    trace: process.env.DSH_OPENCLI_TRACE_DIR, shots: process.env.DSH_OPENCLI_SHOTS_DIR, canary: process.env.DSH_OPENCLI_CANARY_DIR,
  }
  const created: string[] = []
  const snapshotDirs: string[] = []

  /** runOpencli/daemonStatus 实例桩(装/还原一体):daemon argv 通吃,其余按注入输出。 */
  const withRunOpencli = async (out: { stdout?: string; exitCode?: number; stderr?: string }, fn: () => Promise<void>): Promise<void> => {
    const origRun = S.runOpencli
    const origDs = S.daemonStatus
    S.runOpencli = async (...args: unknown[]) => {
      const a0 = Array.isArray(args[0]) ? (args[0] as string[])[0] : args[0]
      if (a0 === 'daemon') return { exitCode: 0, stdout: '', stderr: '' } // daemon restart 等:成功即可
      return { exitCode: out.exitCode ?? 0, stdout: out.stdout ?? '', stderr: out.stderr ?? '' }
    }
    S.daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
    try { await fn() } finally {
      S.runOpencli = origRun
      S.daemonStatus = origDs
    }
  }

  const waitForEvent = async (kind: string): Promise<{ kind: string; text: string }> =>
    await vi.waitFor(() => {
      const ev = S.ingestEventList.find((e) => e.kind === kind)
      if (ev === undefined) throw new Error(`event ${kind} not yet pushed`)
      return ev
    }, { timeout: 3000, interval: 20 })

  beforeAll(async () => {
    // 隔离目录先于插件装载设好(构造器读 env);桩时钟先定:dayLedger/lastDigestDay 基准取装载时刻
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_REPORTS_DIR = reportsDir
    process.env.DSH_OPENCLI_TRACE_DIR = traceDir
    process.env.DSH_OPENCLI_SHOTS_DIR = shotsDir
    process.env.DSH_OPENCLI_CANARY_DIR = canaryDir
    delete process.env.DSH_OPENCLI_DIGEST_DISABLE
    hookBodies = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === HOOK_URL) {
        hookBodies.push(JSON.parse(String(init?.body)) as { title: string; body: string })
        return new Response('ok', { status: 200 })
      }
      throw new Error('network unreachable (test default)')
    }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0))
    ctx = new Context()
    await ctx.plugin(DigestShell)
    await ctx.plugin(DigestTools)
    await ctx.plugin(DigestSystemPrompt)
    await ctx.plugin(OpencliService)
    svc = ctx.opencli as OpencliService
    S = svc as unknown as Svc
    ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
    expect((await S.notifyConfig({ channels: [{ type: 'webhook', url: HOOK_URL, enabled: true }] })).ok).toBe(true)
  })

  afterEach(() => {
    // 各用例自带时钟推进;这里只兜底防假时钟漏出本文件(用例间互不assume 时刻)
    expect(process.env.DSH_OPENCLI_DIGEST_DISABLE).toBeUndefined()
  })

  afterAll(async () => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    for (const id of created) await S.scheduleRemove({ id })
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    for (const d of snapshotDirs) rmSync(d, { recursive: true, force: true })
    for (const [k, v] of [
      ['DSH_OPENCLI_STATE', saved.state], ['DSH_OPENCLI_REPORTS_DIR', saved.reports],
      ['DSH_OPENCLI_TRACE_DIR', saved.trace], ['DSH_OPENCLI_SHOTS_DIR', saved.shots], ['DSH_OPENCLI_CANARY_DIR', saved.canary],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    delete process.env.DSH_OPENCLI_DIGEST_DISABLE
    for (const p of [statePath, reportsDir, traceDir, shotsDir, canaryDir]) rmSync(p, { recursive: true, force: true })
  })

  const addTask = async (site: string, extra: Record<string, unknown> = {}): Promise<string> => {
    // 假时钟下 Date.now() 冻结:scheduleAdd 用 String(Date.now()) 生成任务 id——不推时钟
    // 两个任务会同 id(schedules.find 永远命中第一个任务,watch/quietHours 全串到第一个任务上)
    vi.setSystemTime(Date.now() + 1000)
    const r = await S.scheduleAdd({ site, cron: NEVER_CRON, retry: 1, ...extra })
    expect(r.ok).toBe(true)
    created.push(r.id!)
    snapshotDirs.push(join(shotsDir, r.id!))
    return r.id!
  }

  it('① 日结触发一次:本地日期翻转 → 早报卡+md+json+digest 事件;同日二次检查不重发', async () => {
    // 11-12 10:00 基准(首见只记日期,不发——内存日账不完整不补发)
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(0)
    // 两个任务:例行成功 + watch 命中(每次 run 自身也发例行推送,断言用增量)
    const idA = await addTask(`site a-${uniq} hot`)
    const idB = await addTask(`site b-${uniq} hot`, { watch: 'AI' })
    await withRunOpencli({ stdout: '1. 热点甲' }, () => S.runSiteCommand(`site a-${uniq} hot`, idA))
    await withRunOpencli({ stdout: 'Paper: Agentic AI systems' }, () => S.runSiteCommand(`site b-${uniq} hot`, idB))
    const sentAfterRuns = hookBodies.length
    const eventsBefore = S.ingestEventList.length
    // 翻转 → 11-13 00:00:30 结算 11-12
    vi.setSystemTime(new Date(2026, 10, 13, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentAfterRuns + 1)
    const card = hookBodies[hookBodies.length - 1]!
    expect(card.title).toBe('[dsh-opencli] 早报 2026-11-12')
    expect(card.body).toContain('2 任务:2 成功 · 0 失败 · 1 watch 命中 · 0 空产出已归档')
    expect(card.body).toContain(`🔔 site b-${uniq} hot:命中 AI`)
    // 尾行回执口径:进程当日 10:00 装载,头部缺失如实标注(全量占行不藏缺口)
    expect(card.body).toContain('🧾 口径:进程内存日账,重启丢账;账目自 10:00 起')
    expect(card.body).toContain('详情 digest-2026-11-12.md')
    // 落盘层:md+json 双产物
    const md = readFileSync(join(reportsDir, 'digest-2026-11-12.md'), 'utf8')
    expect(md.startsWith('# dsh-opencli 早报 · 2026-11-12')).toBe(true)
    expect(md).toContain('## 数据缺口')
    const json = JSON.parse(readFileSync(join(reportsDir, 'digest-2026-11-12.json'), 'utf8')) as { date: string; totals: { tasks: number }; watch: unknown[] }
    expect(json.date).toBe('2026-11-12')
    expect(json.totals.tasks).toBe(2)
    // 事件层:digest 一条进时间线
    expect(S.ingestEventList.length).toBe(eventsBefore + 1)
    expect(S.ingestEventList[0]?.kind).toBe('digest')
    expect(S.ingestEventList[0]?.text).toContain('📰 早报 2026-11-12')
    // 同日二次检查:去重标记已翻页,不重发不重写事件
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentAfterRuns + 1)
    expect(S.ingestEventList.length).toBe(eventsBefore + 1)
  })

  it('② 同签名连败两日:失败推送带「连续第 2 日」;开窗自动 canary 归因 → circuit-attribution 事件;早报失败段折叠', async () => {
    // 归因 canary 桩(确定性):20 站仅 3 过 → 系统面故障
    S.canaryRun = async () => ({ ok: false, total: 20, passed: 3, newFailures: [], recovered: [] })
    const id = await addTask(`site c-${uniq} hot`)
    // 第 1 天失败(11-13):推送无「连续」段;开窗 → 归因事件
    await withRunOpencli({ exitCode: 1, stderr: 'UNKNOWN fetch failed' }, () => S.runSiteCommand(`site c-${uniq} hot`, id))
    expect(hookBodies.length).toBeGreaterThan(0)
    const failPush = hookBodies[hookBodies.length - 1]!
    expect(failPush.body).toContain('结果:失败')
    expect(failPush.body).not.toContain('连续第')
    const attr = await waitForEvent('circuit-attribution')
    expect(attr.text).toContain('🔍 熔断归因(fetch-failed)')
    expect(attr.text).toContain('系统面故障')
    expect(attr.text).toContain('3/20')
    expect(S.ingestEventList.some((e) => e.kind === 'circuit-open')).toBe(true)
    // 翻转 → 11-13 早报(失败日):折叠行,连败第 1 天不标
    const sentBefore1 = hookBodies.length
    vi.setSystemTime(new Date(2026, 10, 14, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore1 + 1)
    const digest1 = hookBodies[hookBodies.length - 1]!
    expect(digest1.title).toBe('[dsh-opencli] 早报 2026-11-13')
    expect(digest1.body).toContain(`✗ site c-${uniq} hot:签名 fetch-failed · ⚡ 熔断 · 末次`)
    expect(digest1.body).not.toContain('连续第')
    expect(digest1.body).toContain('🔍 归因:系统面故障')
    // 第 2 天再败(11-14):推送带「连续第 2 日」
    vi.setSystemTime(new Date(2026, 10, 14, 10, 0, 0))
    await withRunOpencli({ exitCode: 1, stderr: 'UNKNOWN fetch failed' }, () => S.runSiteCommand(`site c-${uniq} hot`, id))
    const failPush2 = hookBodies[hookBodies.length - 1]!
    expect(failPush2.body).toContain('🔁 同签名连败:连续第 2 日(签名 fetch-failed)')
    // 翻转 → 11-14 早报:同签名连败折叠一行带「连续第 2 日」;json 带签名/连败/归因
    const sentBefore2 = hookBodies.length
    vi.setSystemTime(new Date(2026, 10, 15, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore2 + 1)
    const digest2 = hookBodies[hookBodies.length - 1]!
    expect(digest2.body).toContain('签名 fetch-failed · 连续第 2 日')
    const j = JSON.parse(readFileSync(join(reportsDir, 'digest-2026-11-14.json'), 'utf8')) as {
      failures: Array<{ signature?: string; dayCount: number; streakDays?: number; circuit: boolean; attribution?: { verdict: string } }>
    }
    expect(j.failures[0]).toMatchObject({ signature: 'fetch-failed', dayCount: 1, streakDays: 2, circuit: true })
    expect(j.failures[0]?.attribution?.verdict).toBe('system')
  })

  it('③ 空窗卡 + quietHours 顺延:窗内暂不出窗,出窗后第一个日结检查补发「全部正常」', async () => {
    // 跳过 11-15(空账日:翻转只推进基准,不发卡)
    vi.setSystemTime(new Date(2026, 10, 15, 23, 0, 0))
    await S.dailyDigestCheck()
    // 当天唯一一次运行:成功且无变化 → 空窗;任务带 quietHours 00:00-06:00,翻转落在窗内
    const id = await addTask(`site d-${uniq} hot`, { quietHours: '00:00-06:00' })
    await withRunOpencli({ stdout: '1. 热点' }, () => S.runSiteCommand(`site d-${uniq} hot`, id))
    const sentBefore = hookBodies.length
    vi.setSystemTime(new Date(2026, 10, 16, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore) // 窗内:顺延不发
    // 出窗后第一个日结检查补发
    vi.setSystemTime(new Date(2026, 10, 16, 7, 0, 0))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore + 1)
    const card = hookBodies[hookBodies.length - 1]!
    expect(card.title).toBe('[dsh-opencli] 早报 2026-11-15')
    expect(card.body).toContain('1 任务全部正常:1 成功 · 0 失败 · 0 watch 命中 · 0 空产出已归档')
    // 补发后不再重发
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore + 1)
  })

  it('④ DSH_OPENCLI_DIGEST_DISABLE=1 关闸:翻转不发卡不落盘不推进基准', async () => {
    process.env.DSH_OPENCLI_DIGEST_DISABLE = '1'
    try {
      const sentBefore = hookBodies.length
      const eventsBefore = S.ingestEventList.length
      vi.setSystemTime(new Date(2026, 10, 17, 0, 0, 30))
      await S.dailyDigestCheck()
      expect(hookBodies.length).toBe(sentBefore)
      expect(S.ingestEventList.length).toBe(eventsBefore)
      expect(existsSync(join(reportsDir, 'digest-2026-11-16.md'))).toBe(false)
      expect(existsSync(join(reportsDir, 'digest-2026-11-17.md'))).toBe(false)
    } finally {
      delete process.env.DSH_OPENCLI_DIGEST_DISABLE
    }
  })

  it('⑤ notify=false 只关推送门(ask ①):事件与 md/json 落盘照常(两层分开),存在 notify!==false 的任务才发', async () => {
    for (const id of [...created]) await S.scheduleRemove({ id })
    created.length = 0
    // 先把日期基准推进到 11-17(11-16 空账:翻转落事件与文件、不推送——门只关发送),让后面的
    // run 真正入账——门测试必须让「账面有 run 而不发」成立,否则会与空账跳过混同
    vi.setSystemTime(new Date(2026, 10, 17, 0, 0, 30))
    await S.dailyDigestCheck()
    const id = await addTask(`site e-${uniq} hot`, { notify: false })
    vi.setSystemTime(new Date(2026, 10, 17, 10, 0, 0))
    await withRunOpencli({ stdout: '1. 热点' }, () => S.runSiteCommand(`site e-${uniq} hot`, id))
    expect((S as unknown as { dayLedger: { tasks: Map<string, unknown> } }).dayLedger.tasks.size).toBe(1) // run 已入账
    const sentBefore = hookBodies.length
    const eventsBefore = S.ingestEventList.length
    vi.setSystemTime(new Date(2026, 10, 18, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore) // 唯一任务 notify=false → 不发(门只关发送)
    // 两层分开:digest 事件与 md/json 落盘不受通道有无影响(面板时间线与文件即真相)
    // (事件列表 newest-first,pushIngestEvent unshift——digest 落在表头)
    expect(S.ingestEventList.length).toBe(eventsBefore + 1)
    const ev = S.ingestEventList[0]!
    expect(ev.kind).toBe('digest')
    expect(ev.text).toContain('📰 早报 2026-11-17')
    expect(existsSync(join(reportsDir, 'digest-2026-11-17.md'))).toBe(true)
    expect(existsSync(join(reportsDir, 'digest-2026-11-17.json'))).toBe(true)
    // 顺延暂存同样不发生(推送层门先于 quietHours 判定):无 pending 卡待补发
    expect((S as unknown as { pendingDigestCard: unknown }).pendingDigestCard).toBeNull()
  })

  it('⑥ 归档接线缝:[] run 候选 5③ 起确定性自动归档(入账即 archived,手动缝无余量);手动缝对当日普通 run 仍计数', async () => {
    const id = await addTask(`site f-${uniq} hot`)
    // 空产出成功([]→ receipt.empty):0.1.4 候选 5③(无产出确定性闭环)起,run 时点即
    // 自动归档——日账条目带 archived/autoArchived,手动缝对该 run 无余量可加(诚实返回 0)
    vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
    await withRunOpencli({ stdout: '[]' }, () => S.runSiteCommand(`site f-${uniq} hot`, id))
    expect(S.digestMarkArchived(id)).toBe(0)
    expect(S.digestMarkArchived(id)).toBe(0) // 无未归档空产出可再计
    const sentBefore = hookBodies.length
    vi.setSystemTime(new Date(2026, 10, 19, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore + 1)
    const card = hookBodies[hookBodies.length - 1]!
    expect(card.body).toContain('1 空产出已归档')
    expect(card.body).toContain('自动归档 1 条无产出') // 尾行计数(候选 5③:自动归档防不可见)
    const j = JSON.parse(readFileSync(join(reportsDir, 'digest-2026-11-18.json'), 'utf8')) as { totals: { archivedEntries: number; autoArchived: number }; routine: Array<{ empty?: number }> }
    expect(j.totals.archivedEntries).toBe(1)
    expect(j.totals.autoArchived).toBe(1)
    expect(j.routine[0]?.empty).toBeUndefined() // 唯一空产出已归档,例行段不再重复计
    // 手动缝对手动归档仍有效:普通 run(有产出)当日手动归档 → 缝计数 +1(面板/ctl 归档路径)
    const id2 = await addTask(`site g-${uniq} hot`)
    vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0))
    await withRunOpencli({ stdout: '[{"title":"普通"}]' }, () => S.runSiteCommand(`site g-${uniq} hot`, id2))
    expect(S.digestMarkArchived(id2)).toBe(1)
    expect(S.digestMarkArchived(id2)).toBe(0) // 已计满,重复归档不重复计
  })

  it('⑦ 非空窗(含失败段)早报同过 quietHours 顺延(§九.7④):窗内不闯静默窗,出窗补发失败行;ok 变量随卡如实(false)', async () => {
    // 顺延不只给空窗:失败早报在 quietHours 窗内与逐任务失败通知同语义暂存(index.ts 暂存链),
    // 出窗首个日结检查补发——顺延不是吞掉,失败行随卡发出
    const id = await addTask(`site h-${uniq} hot`, { quietHours: '00:00-06:00' })
    vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0))
    await withRunOpencli({ exitCode: 1, stderr: 'UNKNOWN fetch failed' }, () => S.runSiteCommand(`site h-${uniq} hot`, id))
    const sentBefore = hookBodies.length
    // 换模板通道(本 describe 末例,换后无共享消费):{{ok}} 布尔整值注入——顺延暂存链必须把
    // 失败卡的 ok 如实带到出窗补发(此前暂存缺 ok,补发落 true 默认,与卡内 ✗ 行矛盾)
    expect((await S.notifyConfig({ channels: [{ type: 'webhook', url: HOOK_URL, enabled: true, template: '{"ok":{{ok}},"title":"{{title}}","text":"{{body}}"}' }] })).ok).toBe(true)
    // 翻转 → 11-20 00:00:30 结算 11-19:失败早报落在窗内 → 顺延不发
    vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 30))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore)
    // 出窗后第一个日结检查补发:非空窗卡(带 ✗ 行)发出,ok=false 随模板如实渲染
    vi.setSystemTime(new Date(2026, 10, 20, 7, 0, 0))
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore + 1)
    const card = hookBodies[hookBodies.length - 1]! as unknown as { ok: boolean; title: string; text: string }
    expect(card.ok).toBe(false) // 失败卡:结构化 ok 与正文 ✗ 行同真(直发路径 :4155 同款口径)
    expect(card.title).toBe('[dsh-opencli] 早报 2026-11-19')
    expect(card.text).toContain(`✗ site h-${uniq} hot`)
    expect(card.text).not.toContain('全部正常')
    // 补发后不再重发
    await S.dailyDigestCheck()
    expect(hookBodies.length).toBe(sentBefore + 1)
  })
})
