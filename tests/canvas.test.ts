/**
 * 画布数据层(任务 G)单测:buildCanvasData 纯函数直测。
 * 照 parsers.test.ts 先例直引 src/canvas.ts(canvas 尚未接线进 index.ts 的捆绑,
 * 纯函数层无需服务装配)——不构造 OpencliService,故无 STATE/TRACE/SHOTS 目录隔离需求。
 * 覆盖:三源正确聚合(含快照让位去重)/ 相邻同键步骤合并(browser session、schedule 重试)/
 * 分页(默认 50 与 offset)/ 时间过滤(显式窗口、空值=最近 24h、非法值回落)/
 * 空数据返回空数组 / 脏行防御 / 入参零改动(纯函数契约)。
 * 任务 H+I+J 追加:src/client.ts 导出的画布渲染纯函数(状态色档/站点过滤/步骤合成显示/
 * 渲染门槛/缩放步进)——组件渲染部分 client 侧无测试基建,留给 GUI 人工验收
 * (shouldShowOnboarding 先例,见 tests/onboarding.test.ts)。
 */
import { describe, expect, it } from 'vitest'
import { buildCanvasData, CANVAS_PAGE_DEFAULT, type CanvasCard, type CanvasTraceLine, type SnapshotMeta } from '../src/canvas.ts'
import type { EvidenceRecord } from '../src/evidence.ts'
// 画布渲染纯函数在 client.ts(任务 H+I+J):直引先例=tests/onboarding.test.ts
import { CANVAS_SUSPECT_P, canvasCardTone, cardsForSite, nextZoom, shouldRenderCanvasFlow, stepsOfCard } from '../src/client.ts'

/** 固定时间轴(2026-10-20 UTC):所有确定性用例共用,排序/窗口断言不受真实时钟影响。 */
const T = (h: number, m: number, s = 0): string => new Date(Date.UTC(2026, 9, 20, h, m, s)).toISOString()

/** 轨迹行桩(exit 默认 0;shot/outHead 按需)。 */
const tr = (at: string, cmd: string, o: { exit?: number; ms?: number; shot?: string; outHead?: string } = {}): CanvasTraceLine =>
  ({ at, cmd, exitCode: o.exit ?? 0, ms: o.ms ?? 10, outHead: o.outHead ?? '', ...(o.shot !== undefined ? { shot: o.shot } : {}) })

/** 证据包桩(形状对齐 src/evidence.ts 的 EvidenceRecord 落盘权威形状)。 */
const ev = (at: string, site: string, o: { exit?: number; blocked?: boolean; before?: string; after?: string } = {}): EvidenceRecord =>
  ({
    at,
    command: `site ${site} ${o.blocked === true ? 'write' : 'comment'}`,
    argv: [site, 'x'],
    approval: { mode: 'on', reason: o.blocked === true ? 'blocked' : null },
    beforeShot: o.before ?? null,
    afterShot: o.after ?? null,
    shotNote: null,
    result: { exitCode: o.exit ?? (o.blocked === true ? -1 : 0), head: 'head' },
    site,
  })

/** 快照桩(site=站点命令原文,与落盘 JSON 的 site 字段同形)。 */
const snap = (at: string, site: string): SnapshotMeta =>
  ({ at, site, bytes: 100, file: `${at.replace(/[:.]/g, '-')}.json` })

/**
 * 聚合基础夹具(时间轴刻意乱序输入:证明分组不依赖调用方给的顺序——
 * traceList 倒序/traceGet 正序都得是同一堆卡):
 * - dsh 会话三步流程(open→click→extract,首末步有截图)→ 一张 browser 合并卡;
 * - work 会话两步、末步失败 → 一张 browser 合并卡(ok=false);
 * - chrome 单发探测 → 一张单步 browser 卡(无 session 可合);
 * - schedule zhihu hot 两次尝试(败→成)→ 一张 schedule 合并卡(末次尝试定成败);
 * - mystery 前缀归不了类 → 丢弃;
 * - 证据包放行(成)/被拒(blocked)各一 → 两张 site 卡;
 * - 快照:zhihu hot 落在 schedule 卡窗口内(让位去重)、weibo hot 无轨迹对(自成卡)、
 *   zhihu hot 早于轨迹卡起始(旧运行轨迹已轮转,自成卡)。
 */
const fixture = (): { traces: CanvasTraceLine[]; evidence: EvidenceRecord[]; snapshots: SnapshotMeta[] } => ({
  traces: [
    tr(T(10, 4, 30), 'schedule zhihu hot', { exit: 0, ms: 700, outHead: '热榜…(实测有效 P=0.93)' }),
    tr(T(10, 0, 0), 'browser dsh open https://a1', { ms: 100, shot: 's1' }),
    tr(T(10, 4, 0), 'schedule zhihu hot', { exit: 1, ms: 900 }),
    tr(T(10, 0, 30), 'browser dsh click 12', { ms: 50 }),
    tr(T(10, 2, 30), 'browser work click btn', { exit: 1, ms: 60, shot: 's4' }),
    tr(T(10, 0, 59), 'browser dsh extract', { ms: 30, shot: 's3' }),
    tr(T(10, 3, 0), 'chrome Runtime.evaluate', { ms: 5 }),
    tr(T(10, 2, 0), 'browser work open https://b1', { ms: 80, shot: 's2' }),
    tr(T(10, 3, 30), 'mystery ping'),
  ],
  evidence: [
    ev(T(10, 3, 10), 'zhihu', { after: 'e-after', before: 'e-before' }),
    ev(T(10, 3, 15), 'weibo', { blocked: true }),
  ],
  snapshots: [
    snap(T(10, 4, 40), 'zhihu hot'), // 成功尝试轨迹行(10:04:30)后 10s 落盘 → 同一次运行,让位
    snap(T(10, 20, 0), 'weibo hot'), // 无 schedule 轨迹对 → 自成卡
    snap(T(9, 0, 0), 'zhihu hot'), // 早于轨迹卡起始(旧运行)→ 自成卡
  ],
})

/** 全量宽窗口(显式 from/to 覆盖整条时间轴),拿到"本应看到"的完整卡序(新→旧)。 */
const allCards = (): CanvasCard[] => {
  const { traces, evidence, snapshots } = fixture()
  return buildCanvasData(traces, evidence, snapshots, { from: T(0, 0), to: T(23, 59) })
}

describe('三源聚合', () => {
  it('8 张卡(脏前缀丢 1 行、窗口内快照让位 1 份),新→旧,类型/站点/命令归位', () => {
    const cards = allCards()
    expect(cards.map((c) => `${c.type}:${c.site ?? ''}:${c.command}`)).toEqual([
      'schedule:weibo:weibo hot', // 10:20 快照卡(轨迹已轮转的旧运行)
      'schedule:zhihu:zhihu hot', // 10:04 重试合并卡
      'site:weibo:site weibo write', // 10:03:15 被拒证据
      'site:zhihu:site zhihu comment', // 10:03:10 放行证据
      'browser::chrome Runtime.evaluate', // 10:03 chrome 单发
      'browser::browser work open https://b1', // 10:02 work 两步卡(首步命令为代表)
      'browser::browser dsh open https://a1', // 10:00 dsh 三步卡
      'schedule:zhihu:zhihu hot', // 09:00 快照卡
    ])
    // id 全局唯一且前缀归位(面板列表 key 依赖)
    const ids = new Set(cards.map((c) => c.id))
    expect(ids.size).toBe(cards.length)
    expect(cards[6]!.id).toBe(`browser-dsh-${T(10, 0).replace(/[:.]/g, '-')}`)
  })

  it('证据卡:放行(exit 0)ok=true 且后截图优先;被拒(blocked)ok=false 无截图;ms=0/p=null', () => {
    const cards = allCards()
    const ok = cards[3]!
    expect(ok.type).toBe('site')
    expect(ok.ok).toBe(true)
    expect(ok.shot).toBe('e-after')
    expect(ok.ms).toBe(0)
    expect(ok.p).toBeNull()
    const blocked = cards[2]!
    expect(blocked.ok).toBe(false)
    expect(blocked.shot).toBeUndefined()
    expect(blocked.steps).toBeUndefined()
  })

  it('快照卡:ok 恒 true(采集链路成功才落盘)、ms=0、site 取首词、command 保留整串', () => {
    const cards = allCards()
    const c = cards[0]!
    expect(c.ok).toBe(true)
    expect(c.ms).toBe(0)
    expect(c.site).toBe('weibo')
    expect(c.command).toBe('weibo hot')
  })
})

describe('步骤合并(相邻同键)', () => {
  it('browser 同 session 相邻行合并:steps 逐行保留(含各自 shot),ok=每步都成,ms=求和,at=首步,卡 shot=末张步骤截图', () => {
    const cards = allCards()
    const dsh = cards[6]!
    expect(dsh.steps).toHaveLength(3)
    expect(dsh.steps!.map((s) => s.cmd)).toEqual([
      'browser dsh open https://a1',
      'browser dsh click 12',
      'browser dsh extract',
    ])
    expect(dsh.steps![0]).toMatchObject({ ok: true, ms: 100, shot: 's1' })
    expect(dsh.steps![1]).toMatchObject({ ok: true, ms: 50 })
    expect(dsh.steps![1]!.shot).toBeUndefined()
    expect(dsh.ok).toBe(true)
    expect(dsh.ms).toBe(180)
    expect(dsh.at).toBe(T(10, 0))
    expect(dsh.shot).toBe('s3') // 末张(最新现场)而非首张
    // 末步失败的 work 卡:ok=false,卡 shot 取失败步补拍
    const work = cards[5]!
    expect(work.steps).toHaveLength(2)
    expect(work.ok).toBe(false)
    expect(work.shot).toBe('s4')
  })

  it('同 session 中途插进别家命令即断流:时间上已断开,不算同一次运行', () => {
    const traces = [
      tr(T(12, 0), 'browser dsh open https://x'),
      tr(T(12, 1), 'browser other open https://y'),
      tr(T(12, 2), 'browser dsh click 1'),
    ]
    const cards = buildCanvasData(traces, [], [], { from: T(0, 0), to: T(23, 59) })
    expect(cards).toHaveLength(3)
    expect(cards.every((c) => c.steps === undefined)).toBe(true) // 三张全是单步卡
  })

  it('[no-ext] 尾标不碍 session 解析,照常并入同会话', () => {
    const traces = [
      tr(T(12, 0), 'browser dsh open https://x'),
      tr(T(12, 1), 'browser dsh open https://x [no-ext]'),
    ]
    const cards = buildCanvasData(traces, [], [], { from: T(0, 0), to: T(23, 59) })
    expect(cards).toHaveLength(1)
    expect(cards[0]!.steps).toHaveLength(2)
    expect(cards[0]!.steps![1]!.cmd).toContain('[no-ext]')
  })

  it('schedule 重试链合并:末次尝试定成败(重试是替代),P 标注取末次出现', () => {
    const cards = allCards()
    const s = cards[1]!
    expect(s.steps).toHaveLength(2)
    expect(s.steps!.map((x) => x.ok)).toEqual([false, true])
    expect(s.ok).toBe(true)
    expect(s.ms).toBe(1600)
    expect(s.p).toBe(0.93)
    // 全败的重试链:末次仍败 → 整卡 ok=false
    const fail = buildCanvasData(
      [tr(T(13, 0), 'schedule weibo hot', { exit: 1, ms: 5 }), tr(T(13, 1), 'schedule weibo hot', { exit: 1, ms: 5 })],
      [], [], { from: T(0, 0), to: T(23, 59) },
    )
    expect(fail).toHaveLength(1)
    expect(fail[0]!.ok).toBe(false)
  })

  it('快照让位窗口:成功尝试轨迹行后 120s 内的快照视为同一次运行;更早的旧快照自成卡', () => {
    // 夹具已覆盖 10s(让位)与早于起始(自成);这里钉边界:恰好 120s 外自成卡
    const traces = [tr(T(14, 0), 'schedule zhihu hot', { exit: 0, ms: 10 })]
    const inWin = buildCanvasData(traces, [], [snap(T(14, 2, 0), 'zhihu hot')], { from: T(0, 0), to: T(23, 59) })
    expect(inWin).toHaveLength(1) // 窗口内(120s 整):让位,只剩轨迹卡
    const outWin = buildCanvasData(traces, [], [snap(T(14, 2, 1), 'zhihu hot')], { from: T(0, 0), to: T(23, 59) })
    expect(outWin).toHaveLength(2) // 窗口外:轨迹卡 + 快照卡
    expect(outWin[0]!.at).toBe(T(14, 2, 1))
  })
})

describe('分页', () => {
  it('默认 limit=50;offset/limit 作用于过滤后的新→旧全集', () => {
    expect(CANVAS_PAGE_DEFAULT).toBe(50)
    const cards = allCards() // 8 张
    expect(buildCanvasData(fixture().traces, fixture().evidence, fixture().snapshots, { from: T(0, 0), to: T(23, 59) })).toHaveLength(8)
    const p1 = buildCanvasData(...(Object.values(fixture()) as [CanvasTraceLine[], EvidenceRecord[], SnapshotMeta[]]), { from: T(0, 0), to: T(23, 59) }, { offset: 0, limit: 3 })
    expect(p1.map((c) => c.at)).toEqual([T(10, 20), T(10, 4), T(10, 3, 15)])
    const p2 = buildCanvasData(...(Object.values(fixture()) as [CanvasTraceLine[], EvidenceRecord[], SnapshotMeta[]]), { from: T(0, 0), to: T(23, 59) }, { offset: 3, limit: 3 })
    expect(p2.map((c) => c.at)).toEqual([T(10, 3, 10), T(10, 3), T(10, 2)])
    expect(buildCanvasData(...(Object.values(fixture()) as [CanvasTraceLine[], EvidenceRecord[], SnapshotMeta[]]), { from: T(0, 0), to: T(23, 59) }, { offset: 6 })).toHaveLength(2)
    expect(buildCanvasData(...(Object.values(fixture()) as [CanvasTraceLine[], EvidenceRecord[], SnapshotMeta[]]), { from: T(0, 0), to: T(23, 59) }, { offset: 9 })).toEqual([])
  })

  it('60 张卡默认只出前 50(防一次加载过多);offset 翻到尾部余量;limit=0 回落默认', () => {
    // 60 个互异 session 的单步 browser 行(同 session 相邻会合并,session 必须互异)
    const traces = Array.from({ length: 60 }, (_, i) =>
      tr(new Date(Date.UTC(2026, 9, 20, 11, i)).toISOString(), `browser p${i} open https://x${i}`))
    const range = { from: T(0, 0), to: T(23, 59) }
    const def = buildCanvasData(traces, [], [], range)
    expect(def).toHaveLength(50)
    expect(def[0]!.id).toContain('p59') // 新→旧:最新在前
    expect(def[49]!.id).toContain('p10')
    const tail = buildCanvasData(traces, [], [], range, { offset: 50 })
    expect(tail).toHaveLength(10)
    expect(tail[0]!.id).toContain('p9')
    expect(buildCanvasData(traces, [], [], range, { offset: 50, limit: 4 })).toHaveLength(4)
    expect(buildCanvasData(traces, [], [], range, { limit: 0 })).toHaveLength(50)
  })
})

describe('时间范围过滤', () => {
  it('显式 from/to 双端闭区间,按卡起始时间归档(跨窗步骤不捞回)', () => {
    const cards = buildCanvasData(fixture().traces, fixture().evidence, fixture().snapshots, { from: T(10, 1), to: T(10, 3, 20) })
    // dsh 卡 at=10:00:00 在窗外(其 10:00:30/10:00:59 步虽入窗,卡按起始归档)
    expect(cards.map((c) => c.at)).toEqual([T(10, 3, 15), T(10, 3, 10), T(10, 3), T(10, 2)])
  })

  it('from > to 的空窗:一张不剩', () => {
    expect(allCards().length).toBeGreaterThan(0)
    const cards = buildCanvasData(fixture().traces, fixture().evidence, fixture().snapshots, { from: T(10, 20), to: T(10, 0) })
    expect(cards).toEqual([])
  })

  it('空值=最近 24h:1 小时前的进、48 小时前的出;非法串与缺省同回落', () => {
    const now = Date.now()
    const traces = [
      tr(new Date(now - 60 * 60_000).toISOString(), 'browser r1 open https://recent'),
      tr(new Date(now - 48 * 60 * 60_000).toISOString(), 'browser o1 open https://old'),
    ]
    const one = (r: { from: string; to: string }): CanvasCard[] => buildCanvasData(traces, [], [], r)
    expect(one({ from: '', to: '' })).toHaveLength(1)
    expect(one({ from: '', to: '' })[0]!.id).toContain('r1')
    expect(one({ from: 'garbage', to: 'nope' })[0]!.id).toContain('r1') // 非法=空
    expect(buildCanvasData(traces, [], [], undefined)).toHaveLength(1) // range 整个缺省
  })
})

describe('空数据与脏行防御', () => {
  it('三源全空(或 undefined)返回空数组,不抛', () => {
    expect(buildCanvasData([], [], [], { from: '', to: '' })).toEqual([])
    expect(buildCanvasData(undefined, undefined, undefined, undefined)).toEqual([])
  })

  it('脏轨迹行(非法 at/非字符串 cmd/归不了类的前缀)跳过,合法行照常出卡', () => {
    const dirty = [
      tr(T(15, 0), 'browser ok1 open https://x'),
      { at: 'not-a-date', cmd: 'browser bad at', exitCode: 0, ms: 1, outHead: '' },
      { at: T(15, 1), exitCode: 0, ms: 1, outHead: '' },
      tr(T(15, 2), 'browser '),
    ] as unknown as CanvasTraceLine[]
    const cards = buildCanvasData(dirty, [], [], { from: T(0, 0), to: T(23, 59) })
    expect(cards).toHaveLength(1)
    expect(cards[0]!.command).toBe('browser ok1 open https://x')
  })

  it('脏时间戳的证据/快照跳过(归不进时间线的卡不进画布)', () => {
    const e = [ev('bad-at', 'zhihu'), ev(T(16, 0), 'zhihu')] as EvidenceRecord[]
    const s = [snap('bad-at', 'weibo hot'), snap(T(16, 1), 'weibo hot')] as SnapshotMeta[]
    const cards = buildCanvasData([], e, s, { from: T(0, 0), to: T(23, 59) })
    expect(cards.map((c) => c.at)).toEqual([T(16, 1), T(16, 0)])
  })
})

describe('纯函数契约(入参零改动)', () => {
  it('乱序输入的数组顺序与行对象都不被改动(排序/分组在拷贝上做)', () => {
    const { traces, evidence, snapshots } = fixture()
    const beforeCmds = [...traces].map((t) => t.cmd)
    const beforeEvidence = JSON.stringify(evidence)
    const beforeSnaps = JSON.stringify(snapshots)
    buildCanvasData(traces, evidence, snapshots, { from: T(0, 0), to: T(23, 59) })
    expect(traces.map((t) => t.cmd)).toEqual(beforeCmds)
    expect(traces.every((t) => !('steps' in t))).toBe(true) // 不往入参行上补字段
    expect(JSON.stringify(evidence)).toBe(beforeEvidence)
    expect(JSON.stringify(snapshots)).toBe(beforeSnaps)
  })
})

/* ── 画布渲染纯函数(任务 H+I+J,src/client.ts 导出) ── */

/** 渲染层卡桩:只填断言用到的字段(p/ms 默认与数据层"无判定/无耗时"口径一致)。 */
const rcard = (o: Partial<CanvasCard> & Pick<CanvasCard, 'id' | 'at' | 'type' | 'ok'>): CanvasCard => ({ p: null, ms: 0, ...o })

describe('canvasCardTone(状态色档)', () => {
  it('fail 优先:ok=false 一律红——失败卡的 P 值无意义,不许绿灯掩盖失败', () => {
    expect(canvasCardTone(rcard({ id: 'a', at: T(9, 0), type: 'site', ok: false }))).toBe('fail')
    expect(canvasCardTone(rcard({ id: 'b', at: T(9, 0), type: 'browser', ok: false, p: 0.99 }))).toBe('fail')
  })

  it('绿:ok=true 且无判定(p=null)或高分;p=0.8 边界(含)回绿', () => {
    expect(canvasCardTone(rcard({ id: 'c', at: T(9, 0), type: 'schedule', ok: true }))).toBe('ok')
    expect(canvasCardTone(rcard({ id: 'd', at: T(9, 0), type: 'schedule', ok: true, p: 0.95 }))).toBe('ok')
    expect(CANVAS_SUSPECT_P).toBe(0.8)
    expect(canvasCardTone(rcard({ id: 'e', at: T(9, 0), type: 'schedule', ok: true, p: CANVAS_SUSPECT_P }))).toBe('ok')
  })

  it('黄(低分通过):ok=true 但 0.7≤p<0.8——SystemOne 判定门 0.7 之上的"低分飘过"提示复核', () => {
    expect(canvasCardTone(rcard({ id: 'f', at: T(9, 0), type: 'schedule', ok: true, p: 0.71 }))).toBe('warn')
    expect(canvasCardTone(rcard({ id: 'g', at: T(9, 0), type: 'schedule', ok: true, p: 0.7 }))).toBe('warn')
  })
})

describe('stepsOfCard(步骤合并显示)', () => {
  it('合并卡:steps 逐字透出(引用一致=零拷贝零改写,展开回放=数据层原序)', () => {
    const dsh = allCards()[6]! // dsh 三步合并卡
    expect(dsh.steps).toBeDefined()
    expect(stepsOfCard(dsh)).toBe(dsh.steps)
  })

  it('单步卡:数据层省 steps 字段——从卡面 command/ok/ms/shot 合成一步,展开交互两类卡一致', () => {
    expect(stepsOfCard(rcard({ id: 'h', at: T(9, 0), type: 'browser', ok: true, command: 'chrome Runtime.evaluate', ms: 5, shot: 's1' })))
      .toEqual([{ cmd: 'chrome Runtime.evaluate', ok: true, ms: 5, shot: 's1' }])
    // 无截图:shot 键省略(与数据层"省字段"契约同款);无 command 落 id 兜底(总有可读文本)
    expect(stepsOfCard(rcard({ id: 'i', at: T(9, 0), type: 'schedule', ok: true })))
      .toEqual([{ cmd: 'i', ok: true, ms: 0 }])
  })
})

describe('cardsForSite(时间线融合过滤)', () => {
  it('按站点首词匹配:容忍 "site " 前缀与整行命令;browser 卡无站点天然排除', () => {
    const cards = allCards()
    expect(cardsForSite(cards, 'zhihu hot').map((c) => c.type)).toEqual(['schedule', 'site', 'schedule']) // 10:04 合并卡 + 证据卡 + 09:00 旧快照卡
    expect(cardsForSite(cards, 'site zhihu hot')).toHaveLength(3) // 前缀归一后同上
    expect(cardsForSite(cards, 'weibo').map((c) => c.type)).toEqual(['schedule', 'site'])
    expect(cardsForSite(cards, 'nosuch')).toEqual([])
    expect(cards.some((c) => c.type === 'browser' && c.site !== undefined)).toBe(false)
  })

  it('空站点串 / null / undefined 卡表:空结果不渲染(与 shouldRenderCanvasFlow 联动)', () => {
    expect(cardsForSite(allCards(), '')).toEqual([])
    expect(cardsForSite(allCards(), '   ')).toEqual([])
    expect(cardsForSite(null, 'zhihu')).toEqual([])
    expect(cardsForSite(undefined, 'zhihu')).toEqual([])
  })
})

describe('shouldRenderCanvasFlow(画布渲染门槛)', () => {
  it('未载入(null)/空数组 → 不渲染卡流(canvasEmpty 占位);有卡 → 渲染', () => {
    expect(shouldRenderCanvasFlow(null)).toBe(false)
    expect(shouldRenderCanvasFlow(undefined)).toBe(false)
    expect(shouldRenderCanvasFlow([])).toBe(false)
    expect(shouldRenderCanvasFlow(allCards())).toBe(true)
  })
})

describe('nextZoom(缩放步进)', () => {
  it('0.5~2.0 闭区间钳制,step 0.1', () => {
    expect(nextZoom(1, 1)).toBe(1.1)
    expect(nextZoom(1, -1)).toBe(0.9)
    expect(nextZoom(0.6, -1)).toBe(0.5)
    expect(nextZoom(0.5, -1)).toBe(0.5) // 下限
    expect(nextZoom(1.9, 1)).toBe(2)
    expect(nextZoom(2, 1)).toBe(2) // 上限
    expect(nextZoom(0.55, -1)).toBe(0.5) // 越界一步直接钳回边界,不落 0.45
  })

  it('连续步进无浮点漂移:0.7 连 +0.1×3 必须 =1(按钮禁用判定 zoom>=2 依赖整数边界)', () => {
    let z = 0.7
    for (let i = 0; i < 3; i++) z = nextZoom(z, 1)
    expect(z).toBe(1)
    let w = 0.5
    for (let i = 0; i < 15; i++) w = nextZoom(w, 1)
    expect(w).toBe(2)
  })
})
