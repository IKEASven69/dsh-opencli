/**
 * 日结早报(0.1.4 候选 2)与连败降噪/熔断归因(0.1.4 候选 3)的纯函数层。
 *
 * 候选 2(日报双层产物,借 dsh-ai-research 双产物纪律):
 *  - 触发=调度器内建日结检查(index.ts 调度 tick 内,本地日期翻转时翻账页并结算一次,不新增
 *    timer;DSH_OPENCLI_DIGEST_DISABLE=1 可关;DSH_OPENCLI_DIGEST_AT=HH:MM 可把装配+发送推迟
 *    到当日该本地时点——0.1.5 C2 ①,knowra「采集型放晚」教训的落地形态:账页仍在翻转时先行
 *    翻新,推迟的只是结算装配,数据完整性不变;默认仅当存在 notify!==false 的任务才发);
 *  - 两层:推送通道发 compact 卡(≤500 字,排序=失败>watch 命中>变化>例行,沿 worthPushing
 *    分层)+ 落盘 ~/.dsh/opencli-reports/digest-<日期>.md|.json(md 骨架沿 dsh-ai-research:
 *    单 H1 / 元信息引用块 / 固定尾章「数据缺口」);
 *  - 卡片结构:标题「[dsh-opencli] 早报 YYYY-MM-DD」+ 首行总览计数(全量占行不藏缺口)+
 *    失败段(任务/来源/签名/熔断状态;失败不静默)+ watch 命中段(🔔)+ 变化段(📊)+
 *    尾行回执口径;同签名连败折叠一行带「连续第 N 日」(候选 3 计数);
 *  - 空窗(全成功且无变化)发「N 任务全部正常」卡(可见性优先;quietHours 窗内顺延出窗,
 *    顺延判定在 index.ts 接线层,本模块只产出 emptyWindow 标记);
 *  - 归档条目不进日报(候选 5 联动):日账条目带 archived 标记、DigestDayLedger.markArchived
 *    是留给候选 5(C)的接线缝——归档只进 X 计数,不产任何行(0.1.5 C2 ⑤:X 标签=「N 条已归档」,
 *    手动归档非空产出 run 时不再与「空产出」宣称漂移);跳过行(健康/登录预检)单独分账不冒充
 *    失败(0.1.5 C2 ②,digest-2026-11-16 实证:3 skip 被计成「3 失败」夸大故障面)。
 *
 * 候选 3(归因+降噪;0.1.5 C1 判定升级):
 *  - 熔断开窗后自动单跑一次 canary(既有 canary-run 面复用,接线在 index.ts),结论写
 *    circuit-attribution 事件并附进早报失败段;判定是启发式,如实给「无法定论 / canary
 *    未完成」档,不猜;
 *  - 0.1.5 C1:0.1.4 的「通过率≤0.5→系统面」在 3/3 自然运行中被构成污染失真(canary 存档
 *    逐行实证:恒败站必带参 2 站+非只读防御跳过 1 站+登录态 AUTH_REQUIRED 2-3 站+45s 超时
 *    6-10 站=环境态主导,全被判成「系统面」)——升级为失败签名分类计数:逐站失败按签名归入
 *    daemon/环境/登录态/站点/选站缺陷五类(0.1.5 C1 §1.1 实证锚),「系统面」仅在 daemon 类
 *    新失败主导时给;持续失败站(基线同败)不参与系统面投票;环境类单独成档不稀释占比;
 *    结论附逐站证据行,可被人复核;
 *  - 同签名连败计数(FailStreakCounter,有界 Map,按本地日历日)驱动失败推送「连续第 N 日」
 *    与早报失败段折叠;阈值行为=仅标注,不自动停任务(诚实不替用户做主)。
 *
 * 数据面纪律:入账 summary 已在上游过 scrubUrlParams(与 runHistory 同源同一份文本),推送卡
 * 出口统一 scrubLocalPaths(与通知通道同一安全边界);md/json 落盘层过 scrubUrlParams
 * (与 reports 同口径——本机路径在本地文件合法保留,推送面不保留)。md 是整段文本一洗,
 * json 结构化对象走 scrubJsonStrings 逐值递归洗——单点闸,新增字段不再有「忘了洗」的口子。
 * @module dsh-opencli/digest
 */

import { NOTIFY_BODY_MAX, scrubLocalPaths, scrubUrlParams } from './notify.ts'

// ---------------------------------------------------------------------------
// 本地日历日键(日结触发与连败计数的时间基准)
// ---------------------------------------------------------------------------

/** 本地日历日键 YYYY-MM-DD(日结按本地自然日翻转,不用 UTC——早报是给人看的)。 */
export function localDateKey(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 前一日的本地日历日键(连败「连续」判定的衔接检查)。 */
export function prevDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return localDateKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1))
}

/** 行内截断(卡片/md 单行预算;带省略号,不静默吞)。 */
function clipLine(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** 单行化(卡片「逐任务一行」纪律):摘要/差异里的换行压成 ' / ',md 侧保留原始多行。 */
function oneLine(text: string, max: number): string {
  return clipLine(text.replace(/\s*\n+\s*/g, ' / '), max)
}

// ---------------------------------------------------------------------------
// 熔断签名提取(自 index.ts 移入:候选 3 连败计数/归因同源复用,判定语义不变)
// ---------------------------------------------------------------------------

/**
 * 系统级失败签名提取(熔断判据):daemon 断连(fetch failed——undici 汇聚错误文本,
 * 11-06..08 v2ex 三日连败实证)与 Windows 文件系 EPERM(09-25 九分钟窗 75 条洪水实证,
 * 单根因×任务×重试链放大)。返回 null=非系统级:站点/适配器故障不熔断,照常走重试链
 * 与通知——熔断只止血系统面,不吞业务面。
 */
export function circuitSignatureOf(text: string): string | null {
  if (/\bfetch failed\b/i.test(text)) return 'fetch-failed'
  if (/\bEPERM\b[^\n]*operation not permitted/i.test(text)) return 'eperm'
  return null
}

// ---------------------------------------------------------------------------
// 候选 3:同签名连败计数(有界 Map,按本地日历日)
// ---------------------------------------------------------------------------

/** 连败计数条目上限(有界纪律:键=(任务|签名),超限裁最旧;200 覆盖任务×系统面签名组合绰绰有余)。 */
export const FAIL_STREAK_CAP = 200

/**
 * 同签名连败计数:键=(任务,签名),按本地日历日累加「连续第 N 日」。
 *  - 同一天多次失败不重复计日(bump 幂等);
 *  - 昨天有同签名失败才 +1,断一天从 1 重数(「连续」语义);
 *  - 任务成功即整任务清零(reset——连败被成功打断);
 *  - 只标注不自动停任务:本计数器只产出数字,没有任何停任务副作用(诚实不替用户做主)。
 */
export class FailStreakCounter {
  private map = new Map<string, { days: number; lastDay: string }>()

  private static key(id: string, sig: string): string {
    return `${id}|${sig}`
  }

  /** 记一次失败,返回该 (任务,签名) 当前连续天数(同日重复调用幂等)。 */
  bump(id: string, sig: string, now: Date): number {
    const day = localDateKey(now)
    const k = FailStreakCounter.key(id, sig)
    const prev = this.map.get(k)
    if (prev !== undefined && prev.lastDay === day) return prev.days
    const days = prev !== undefined && prev.lastDay === prevDateKey(day) ? prev.days + 1 : 1
    this.map.delete(k) // 重插到 Map 尾:插入序=时间序,超限裁最旧
    this.map.set(k, { days, lastDay: day })
    if (this.map.size > FAIL_STREAK_CAP) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    return days
  }

  /** 任务成功:清零该任务全部签名的连败计数(成功打断「连续」)。 */
  reset(id: string): void {
    const prefix = `${id}|`
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) this.map.delete(k)
    }
  }

  /**
   * 跳过日链保活(0.1.5 复核③):任务本 tick 跳过(健康预检/登录预检,不执行不 bump 不
   * reset)时调用——跳过日不计入天数,但若跳过日恰与链尾日历日衔接,把链尾日前移到跳过日,
   * 下一次失败隔一个跳过日仍判「连续」。与 rebuildFromRunHistory 的链中跳过桥接规则逐字
   * 同口径(修前在线 bump 要求日历日严格衔接,skip 日把链掐断:同段历史在线算 1 日、重启
   * 重建算 2 日——重启前后「连续第 N 日」标注凭空变大;在线补 keepAlive 后两路径一致)。
   */
  keepAlive(id: string, now: Date): void {
    const day = localDateKey(now)
    const yesterday = prevDateKey(day)
    const prefix = `${id}|`
    for (const [k, v] of this.map) {
      if (k.startsWith(prefix) && v.lastDay === yesterday) this.map.set(k, { days: v.days, lastDay: day })
    }
  }

  /** 当前连续天数(无记录=0;≥2 才值得显示「连续第 N 日」)。 */
  daysOf(id: string, sig: string): number {
    return this.map.get(FailStreakCounter.key(id, sig))?.days ?? 0
  }

  /**
   * 重启恢复:从 runHistory(持久化)重建连败计数——#2761 互杀一天三翻的常态下,
   * 内存计数器随进程死掉会让「连续第 N 日」永远从 1 重数,降噪失效。逐任务把条目按时间
   * 排序后从最新往旧数「连续本地日历日」:尾部成功=断链不重建;签名不同的失败断链;
   * 日历日不衔接断链(runHistory 每任务只留 5 条,窗口外的更早连败无从知晓,如实少记)。
   * 跳过行(skip=true)透明——跳过≠失败,不计日也不断链(0.1.5 C2 ②分账;在线路径对应
   * 「跳过不 bump 不 reset + keepAlive 链保活」,桥接规则与本处逐字同口径):尾部的跳过照常
   * 弹出,链中的跳过仅在日历日恰好衔接时把「连续」预期前移一天(修前跳过行按「签名不同」
   * 断链,连败被环境态跳过截断少记;在线侧修前 skip 日掐断严格衔接检查,隔跳过日的失败被
   * 重数 1 日而本处桥接算 2 日——复核③,两侧补齐后一致)。
   * 签名只能恢复 circuitSignatureOf 可提取的系统面两类(typed 失败码不落 summary,不猜)。
   */
  rebuildFromRunHistory(history: Record<string, Array<{ at: string; ok: boolean; summary: string; skip?: boolean }>>): void {
    for (const [id, entries] of Object.entries(history)) {
      if (!Array.isArray(entries)) continue
      const sorted = entries
        .filter((e) => e !== null && typeof e === 'object' && typeof e.at === 'string')
        .sort((a, b) => a.at.localeCompare(b.at)) // 旧→新(runHistory 是 unshift 前插,存盘序不保证)
      while (sorted.length > 0 && (sorted[sorted.length - 1]!.ok || sorted[sorted.length - 1]!.skip === true)) sorted.pop() // 尾部成功/跳过弹掉:非失败不断链
      const last = sorted[sorted.length - 1]
      if (last === undefined || last.ok || last.skip === true) continue
      const sig = circuitSignatureOf(last.summary)
      if (sig === null) continue
      let days = 0
      let prevDay: string | undefined
      for (let i = sorted.length - 1; i >= 0; i--) {
        const e = sorted[i]!
        if (e.skip === true) {
          // 跳过行透明:不计日;日历日恰好衔接时把「连续」预期前移一天(环境态跳过日不构成断链
          // 证据),不衔接则只是无关跳过,忽略不碰 prevDay(宁少记)
          if (prevDay !== undefined) {
            const skipDay = localDateKey(new Date(e.at))
            if (skipDay === prevDateKey(prevDay)) prevDay = skipDay
          }
          continue
        }
        if (e.ok) break // 成功断链
        if (circuitSignatureOf(e.summary) !== sig) break // 签名不同:另一条连败链,断
        const day = localDateKey(new Date(e.at))
        if (day === prevDay) continue // 同日多条只计一天
        if (prevDay !== undefined && day !== prevDateKey(prevDay)) break // 日历日不衔接:断
        days++
        prevDay = day
      }
      if (days > 0) this.map.set(FailStreakCounter.key(id, sig), { days, lastDay: localDateKey(new Date(last.at)) })
    }
  }
}

// ---------------------------------------------------------------------------
// 候选 3 / 0.1.5 C1:熔断归因判定(circuit-open 开窗后自动 canary 单跑的结论)
// ---------------------------------------------------------------------------

/** 归因档位(system/environment 为 0.1.5 C1 新分档):system=daemon 类新失败主导;
 *  environment=环境类主导(超时/扩展未连);site-or-transient=系统面未证实;mixed=证据相持;
 *  unknown=canary 未跑成或无可判据。 */
export type CircuitVerdict = 'system' | 'environment' | 'site-or-transient' | 'mixed' | 'unknown'

/**
 * canary 单站失败的面归属(0.1.5 C1 失败签名分类,锚点=canary 存档 11-13/14/16 三轮逐行实证):
 *  - system:daemon/网络面(fetch failed 等 undici 汇聚文本——与熔断签名同族);
 *  - env:环境面(45s 超时类/扩展未连——与「扩展未连接」任务跳过同窗,环境态主导);
 *  - login:登录态面(AUTH_REQUIRED/登录墙——账户条件,不随 daemon 健康波动);
 *  - site:站点面(上游适配器损坏/静默失败/其余——如 reddit 封锁潮在 canary 的投影);
 *  - pick:选站缺陷(必带参 commander.missingArgument/非只读防御跳过——canary 自身选站问题,
 *    三轮 3/3 同现,既非系统面也非站点面,不参与任何面投票)。
 */
export type CanaryFailureFace = 'system' | 'env' | 'login' | 'site' | 'pick'

/** 选站缺陷锚:必带参(commander 报错原文/中文变体)+ 非只读防御跳过(canaryRun 只读门原文)。 */
const CANARY_PICK_RE = /missingArgument|missing required argument|缺少必要参数|非只读,防御性跳过/i
/** 登录态锚:CLI 失败标记与登录墙关键词(verifyResult RULES 同族)。 */
const CANARY_LOGIN_RE = /AUTH_REQUIRED|NOT_LOGGED_IN|请先登录|未登录|登录已过期|登录失效|登录\/风控墙|login (?:first|required)|please (?:log ?in|sign ?in)/i
/** 环境面锚:插件侧超时信封(index.ts runSubprocess「超时取消」)/扩展未连归一提示/ETIMEDOUT。 */
const CANARY_ENV_RE = /超时取消|扩展未连|extension not connected|BrowserBridge|ETIMEDOUT|timed? ?out|timeout/i
/** daemon/网络面锚:与 circuitSignatureOf 同族(fetch failed)补连接类错误码。 */
const CANARY_SYSTEM_RE = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|daemon (?:未运行|not running|不可用)/i
/** 45s 超时类时长锚:11-16 轮 canary 存档 9-10 站「退出码 1」@~45000ms——stderr/stdout 全空
 *  文本零特征,只能按时长识别(消耗完 canary 45s 预算大半=超时类)。留 5s 余量防边界抖动。 */
const CANARY_TIMEOUT_MS_FLOOR = 40_000

/** 单站失败 → 面归属(纯函数;ok 站不分类)。文本锚优先于时长锚(文本更具体),时长锚兜「退出码 1」零特征类。 */
export function canaryFailureFace(error: string, ms: number): CanaryFailureFace {
  if (CANARY_PICK_RE.test(error)) return 'pick'
  if (CANARY_LOGIN_RE.test(error)) return 'login'
  if (CANARY_ENV_RE.test(error)) return 'env'
  if (CANARY_SYSTEM_RE.test(error)) return 'system'
  if (ms >= CANARY_TIMEOUT_MS_FLOOR) return 'env'
  return 'site'
}

/** 面归属的单字标注(证据行用):✓ 通过/✗系 daemon/✗环 环境/✗登 登录/✗站 站点/⊘选 选站缺陷。 */
function faceGlyph(face: CanaryFailureFace): string {
  switch (face) {
    case 'system': return '✗系'
    case 'env': return '✗环'
    case 'login': return '✗登'
    case 'site': return '✗站'
    case 'pick': return '⊘选'
  }
}

/** canary 单站投票投影(canaryRun 逐站回传;prevOk=上一轮同命令基线,缺省=无基线首跑)。 */
export interface CanarySiteVote { command: string; ok: boolean; ms?: number; error?: string; prevOk?: boolean }

/** canary-run 返回形状的最小投影(index.ts canaryRun 的返回是其超集;sites 缺省=旧形状,退化通过率分档)。 */
export interface CanaryLike { ok: boolean; total: number; passed: number; error?: string; sites?: CanarySiteVote[] }

export interface CircuitAttribution {
  at: string
  verdict: CircuitVerdict
  /** 短句(早报失败段附注)。 */
  summary: string
  /** 事件正文(circuit-attribution 事件全文,带 🔍 前缀与签名)。 */
  detail: string
  /** 逐站证据行(「系统面」结论可被人复核;失败站先列,通过站后列)。 */
  evidence?: string
}

/** 证据行装配:失败站(面标注)在前、通过站在后,`命令 标` 紧凑并列;超预算截断带省略数(宁少列不假列)。 */
function canaryEvidenceLine(sites: Array<{ command: string; ok: boolean; face: CanaryFailureFace }>): string {
  const order = { fail: -1, pass: 1 } as const
  const sorted = [...sites].sort((a, b) => (a.ok === b.ok ? 0 : order[a.ok ? 'pass' : 'fail'] - order[b.ok ? 'pass' : 'fail']))
  const parts = sorted.map((s) => `${s.command} ${s.ok ? '✓' : faceGlyph(s.face)}`)
  const EVIDENCE_BUDGET = 560
  let line = ''
  let kept = 0
  for (const p of parts) {
    const next = kept === 0 ? p : `${line} · ${p}`
    if (next.length > EVIDENCE_BUDGET) break
    line = next
    kept++
  }
  if (kept < parts.length) line += ` · …(共 ${parts.length} 站,余 ${parts.length - kept} 站略)`
  return line
}

/**
 * 熔断归因判定(启发式,不是裁决;0.1.5 C1 起投票制):
 *  开窗签名是系统面(fetch-failed/eperm),canary 走同一 daemon/网络——判定「系统面是否真的塌了」。
 *  逐站失败先按签名分类(canaryFailureFace),选站缺陷类不计票(恒败站不稀释);
 *  daemon 类**新**失败(基线上轮通过或无基线)才投系统面票——持续失败站(基线同败,如 v2ex
 *  fetch-failed 连败站)不投票:真塌法应表现为大面积**新**失败;环境类(超时/扩展未连)单独
 *  成档,主导时如实给 environment 档,不再稀释成「系统面」。通过站过半=系统面当前可用。
 *  canary 未跑成如实标「无法区分」;逐站投影缺失(旧形状调用方)退化 0.1.4 通过率分档。
 *  结论一律附逐站证据行——归因宁可说不知道,且给足复核材料,不替用户下结论。
 */
export function judgeCircuitAttribution(sig: string, canary: CanaryLike, at: string): CircuitAttribution {
  const head = `🔍 熔断归因(${sig}):`
  if (canary.total === 0) {
    const err = clipLine(canary.error ?? '未知', 80)
    return { at, verdict: 'unknown', summary: `canary 未完成(${err})——系统面/站点面无法区分`, detail: `${head}canary 未完成(${err})——系统面/站点面无法区分(如实标注,不猜)` }
  }
  if (canary.sites === undefined || canary.sites.length === 0) {
    // 旧形状(无逐站投影):退化 0.1.4 通过率分档,如实标注判据层级(该启发式已被实证为可被构成污染,仅作降级保底)
    const rate = canary.passed / canary.total
    if (rate <= 0.5) {
      return { at, verdict: 'system', summary: `系统面故障——canary 仅通过 ${canary.passed}/${canary.total}`, detail: `${head}系统面故障——canary 仅通过 ${canary.passed}/${canary.total} 站,大面积失败与熔断签名同向(daemon/网络面);判据=通过率分档(逐站投影缺失,降级启发式)` }
    }
    if (rate >= 0.8) {
      return { at, verdict: 'site-or-transient', summary: `系统面当前可用,偏站点面/瞬时——canary 通过 ${canary.passed}/${canary.total}`, detail: `${head}系统面当前可用,偏站点面/瞬时——canary 通过 ${canary.passed}/${canary.total} 站;同签名再开窗时倾向站点面排查(适配器漂移对表 canary 报告)` }
    }
    return { at, verdict: 'mixed', summary: `无法定论——canary 通过 ${canary.passed}/${canary.total}(混合)`, detail: `${head}无法定论——canary 通过 ${canary.passed}/${canary.total} 站(混合),系统面/站点面需人工复核` }
  }
  // 逐站分类 → 投票(0.1.5 C1;prevOk 必须随行——基线归一(恒败站不投系统面票)靠它)
  const cls = canary.sites.map((s) => ({ command: s.command, ok: s.ok, ...(s.prevOk !== undefined ? { prevOk: s.prevOk } : {}), face: s.ok ? ('pass' as const) : canaryFailureFace(s.error ?? '', s.ms ?? 0) }))
  const pool = cls.filter((c) => c.face !== 'pick') // 选站缺陷不计票(既非系统面也非站点面)
  const pickN = cls.length - pool.length
  if (pool.length === 0) {
    return { at, verdict: 'unknown', summary: `无法判据——${cls.length} 站全部为选站缺陷(必带参/非只读跳过),不计票`, detail: `${head}无法判据——${cls.length} 站全部为选站缺陷(必带参/非只读防御跳过),无可投票样本(如实标注,不猜)` }
  }
  const passN = pool.filter((c) => c.ok).length
  const fails = pool.filter((c) => !c.ok)
  const sysNewN = fails.filter((c) => c.face === 'system' && c.prevOk !== false).length // 新失败(基线通过或无基线)才投系统面票
  const sysContN = fails.filter((c) => c.face === 'system' && c.prevOk === false).length // 持续失败(基线同败)按基线归一,不投票
  const envN = fails.filter((c) => c.face === 'env').length
  const loginN = fails.filter((c) => c.face === 'login').length
  const siteN = fails.filter((c) => c.face === 'site').length
  const passPart = `canary 通过 ${passN}/${pool.length}${pickN > 0 ? `(另 ${pickN} 站选站缺陷不计票)` : ''}`
  const contPart = sysContN > 0 ? `(另有 ${sysContN} 站持续失败按基线归一不计票)` : ''
  const classLine = `失败分类:daemon 类新失败 ${sysNewN}${contPart} · 环境类 ${envN} · 登录态 ${loginN} · 站点面 ${siteN}`
  const evidence = canaryEvidenceLine(cls)
  let verdict: CircuitVerdict
  let summary: string
  let why: string
  if (passN * 2 > pool.length) {
    verdict = 'site-or-transient'
    summary = `系统面当前可用,偏站点面/瞬时——${passPart}`
    why = `系统面当前可用(通过站过半),偏站点面/瞬时;同签名再开窗时倾向站点面排查(适配器漂移对表 canary 报告)`
  } else if (sysNewN >= 2 && sysNewN * 2 > fails.length && sysNewN * 2 > passN) {
    verdict = 'system'
    summary = `系统面故障——daemon 类新失败 ${sysNewN}/${pool.length} 站`
    why = `系统面故障——daemon 类新失败 ${sysNewN}/${pool.length} 站主导失败面(持续失败站已按基线归一),与熔断签名同向(daemon/网络面)`
  } else if (sysNewN >= 2 && sysNewN >= Math.max(envN, loginN, siteN)) {
    verdict = 'mixed'
    summary = `无法定论——daemon 类新失败 ${sysNewN} 站为最大失败类但未过半,${passPart}`
    why = `无法定论——daemon 类新失败 ${sysNewN} 站为最大失败类但未主导失败面,系统面/站点面需人工复核`
  } else if (envN >= 2 && envN >= Math.max(sysNewN, loginN, siteN)) {
    verdict = 'environment'
    summary = `环境面主导(超时/扩展未连类 ${envN} 站)——系统面未证实,${passPart}`
    why = `环境面主导(超时/扩展未连类 ${envN} 站,与「扩展未连接」环境态同窗)——系统面未证实,倾向环境排查(扩展连接/超时预算)而非 daemon 本体`
  } else {
    verdict = 'site-or-transient'
    summary = `系统面未证实,偏站点面/登录态——${passPart}`
    why = '系统面未证实,失败以站点面/登录态类为主;同签名再开窗时倾向站点面排查(适配器漂移对表 canary 报告)'
  }
  return { at, verdict, summary, detail: `${head}${why};${classLine};证据:${evidence}`, evidence }
}

// ---------------------------------------------------------------------------
// 候选 2:日账(当日 run 聚合,早报结算的数据源)
// ---------------------------------------------------------------------------

/** 日账单 run 入账条目(runSiteCommand 每 tick 收尾一条;summary 为已 scrub 的 history 行)。 */
export interface DigestDayEntry {
  at: string
  ok: boolean
  summary: string
  /** 失败签名(系统面 circuitSignatureOf ?? typed 失败码;无稳定签名不记)。 */
  signature?: string
  /** 本 run watch 命中词。 */
  watchHits?: string[]
  /** 本 run 变化摘要(renderDiffText,可多行)。 */
  diff?: string
  /** 空产出(回执 empty 口径)。 */
  empty?: boolean
  /** 候选 5 归档标记(C 落地):归档条目不进日报任何行,只进 X 计数。 */
  archived?: boolean
  /** 候选 5 ③:自动归档来源标记(无产出确定性判定命中)——早报尾行计数的口径依据。 */
  autoArchived?: boolean
  /** 补跑 run 标记(0.1.6 C1):环境跳过挂债当日恢复后的恢复采集——摘要文本已带 🔄 前缀,
   *  此字段是 typed 口径(不解析文本),供后续账目统计使用。 */
  catchup?: boolean
  /** 本 run 伴随熔断(开窗或窗内短路)。 */
  circuit?: boolean
  /** 健康预检/登录预检跳过(诚实进失败面,不静默)。 */
  skip?: boolean
}

/** 单任务同签名失败折叠组(key=签名;无稳定签名归入 signature=undefined 的未分类组)。 */
export interface DigestFailGroup {
  signature?: string
  count: number
  lastAt: string
  lastSummary: string
  /** 本组最近一条是否伴随熔断(开窗/短路)。 */
  circuit: boolean
}

/** 单任务当日聚合(有界:watch 词 ≤20 / diff ≤10 / 失败折叠组 ≤8)。 */
export interface DigestDayTask {
  site: string
  source?: string
  runs: number
  okRuns: number
  failRuns: number
  /** 健康预检/登录预检跳过的 run 数(0.1.5 C2 ②分账:跳过≠失败,不进 failRuns/failGroups)。 */
  skipRuns: number
  /** 最近一次跳过时刻与摘要(仅跳过任务的 ⏸ 行呈现用;混合任务并入失败行 skipCount)。 */
  lastSkipAt?: string
  lastSkipSummary?: string
  emptyRuns: number
  archivedRuns: number
  /** 其中自动归档(无产出确定性判定)的 run 数——早报尾行「自动归档 N 条」计数。 */
  autoArchivedRuns: number
  watchHits: string[]
  watchSample?: string
  diffs: string[]
  failGroups: Map<string, DigestFailGroup>
  circuitSeen: boolean
  firstAt?: string
  lastAt?: string
}

const WATCH_CAP = 20
const DIFF_CAP = 10
const FAIL_GROUP_CAP = 8

/** 无稳定签名失败在折叠 Map 里的键(summary 已如实带原文,签名段不猜)。 */
const UNGROUPED_KEY = '∅'

/**
 * 日账:本地日期翻转时结算为早报,结算后整体换新(进程内存态,重启丢账——早报尾行如实
 * 标注,不假装覆盖全天)。逐 run 入账在 index.ts runSiteCommand 收尾(成功/失败/跳过/canary)。
 */
export class DigestDayLedger {
  readonly tasks = new Map<string, DigestDayTask>()

  constructor(readonly date: string) {}

  /**
   * 一次执行入账。入账日与本账日不符(跨午夜在途 run)→ 丢弃:那一日的账要么已结算要么
   * 尚未开始,宁少记不错账。archived 条目只进 archivedRuns 计数,不产 watch/diff/失败行
   * (候选 2⑤:归档条目不进日报)。
   */
  record(id: string, site: string, source: string | undefined, entry: DigestDayEntry): void {
    if (localDateKey(new Date(entry.at)) !== this.date) return
    let t = this.tasks.get(id)
    if (t === undefined) {
      t = {
        site, ...(source !== undefined ? { source } : {}),
        runs: 0, okRuns: 0, failRuns: 0, skipRuns: 0, emptyRuns: 0, archivedRuns: 0, autoArchivedRuns: 0,
        watchHits: [], diffs: [], failGroups: new Map(), circuitSeen: false,
      }
      this.tasks.set(id, t)
    }
    t.runs++
    t.lastAt = entry.at
    t.firstAt ??= entry.at
    if (entry.skip === true) {
      // 跳过分账(0.1.5 C2 ②):健康/登录预检跳过是环境态不是故障——单独计数,不进失败面
      // (digest-2026-11-16 实证:3 条 skip 全被计成失败,总览「0 成功 · 3 失败」夸大故障面)
      t.skipRuns++
      t.lastSkipAt = entry.at
      t.lastSkipSummary = entry.summary
    } else if (entry.ok) {
      t.okRuns++
      if (entry.empty === true) t.emptyRuns++
    } else {
      t.failRuns++
      let key = entry.signature ?? UNGROUPED_KEY
      if (!t.failGroups.has(key) && t.failGroups.size >= FAIL_GROUP_CAP) key = UNGROUPED_KEY // 折叠组超限:并入未分类(计数不丢)
      const g = t.failGroups.get(key) ?? { ...(entry.signature !== undefined && key !== UNGROUPED_KEY ? { signature: entry.signature } : {}), count: 0, lastAt: entry.at, lastSummary: entry.summary, circuit: false }
      g.count++
      g.lastAt = entry.at
      g.lastSummary = entry.summary
      g.circuit = g.circuit || entry.circuit === true
      t.failGroups.set(key, g)
    }
    t.circuitSeen ||= entry.circuit === true
    if (entry.archived === true) {
      t.archivedRuns++
      // 自动归档单列(候选 5 ③):尾行「自动归档 N 条」=确定性闭环命中数,与手动归档分开计
      if (entry.autoArchived === true) t.autoArchivedRuns++
    } else {
      // 归档条目不进日报(候选 2⑤);其余照常产行
      for (const w of entry.watchHits ?? []) {
        if (!t.watchHits.includes(w) && t.watchHits.length < WATCH_CAP) t.watchHits.push(w)
      }
      if ((entry.watchHits?.length ?? 0) > 0 && t.watchSample === undefined) t.watchSample = clipLine(entry.summary, 120)
      if (entry.diff !== undefined && entry.diff.length > 0 && t.diffs.length < DIFF_CAP) t.diffs.push(clipLine(entry.diff, 200))
    }
  }

  /**
   * 候选 5(C)归档接线缝:归档动作把 run 计入当日「已归档 N 条」计数(早报首行 X 与
   * json archivedEntries 的来源)。返回实际入账数。B 侧只留此缝与 DigestDayEntry.archived
   * 标记,归档模型/触发时机由 C 定;诚实边界:日账随日结算换新,跨日补归档记不进当日 X
   * (当日早报已发),自动归档(候选 5④ 的 run 时点闭环)不受影响。
   * 0.1.5 C2 ⑤:标签=「N 条已归档」——手动归档可归非空产出/失败 run,「空产出已归档」
   * 宣称与计数内容漂移(low#10/#15),标签改中性「条」后计数口径不变。
   */
  markArchived(id: string, count = 1): number {
    const t = this.tasks.get(id)
    if (t === undefined) return 0
    const room = Math.max(0, t.runs - t.archivedRuns)
    const n = Math.max(0, Math.min(count, room))
    t.archivedRuns += n
    return n
  }

  /** 当日最早入账时刻(账目覆盖缺口标注用;空账 undefined)。 */
  firstRecordedAt(): string | undefined {
    let min: string | undefined
    for (const t of this.tasks.values()) {
      if (t.firstAt !== undefined && (min === undefined || t.firstAt < min)) min = t.firstAt
    }
    return min
  }
}

// ---------------------------------------------------------------------------
// 候选 2:早报装配(compact 卡 + md + json 三同源)
// ---------------------------------------------------------------------------

/** 早报失败段折叠行(任务 × 签名)。 */
export interface DigestFailureRow {
  id: string
  task: string
  source?: string
  signature?: string
  /** 当日该签名失败次数(折叠计数)。 */
  dayCount: number
  /** 连败天数(候选 3;≥2 才带——第 1 天没有「连续」可标)。 */
  streakDays?: number
  circuit: boolean
  /** 同任务当日另有跳过 run 数(0.1.5 C2 ③双行合并:失败行+跳过行并存折成一行)。 */
  skipCount?: number
  lastSummary: string
  attribution?: CircuitAttribution
}

/** 跳过行(0.1.5 C2 ②:仅跳过无失败的任务单独成 ⏸ 行,不冒充失败;混合任务的跳过进失败行 skipCount)。 */
export interface DigestSkipRow {
  id: string
  task: string
  source?: string
  /** 当日跳过 run 数。 */
  skipCount: number
  lastAt: string
  lastSummary: string
}

export interface DigestOverview {
  tasks: number
  /** 全部 run 成功的任务数(与 withFailure/withSkip 均不相交,三者相加= tasks)。 */
  allOk: number
  withFailure: number
  /** 仅跳过无失败的任务数(0.1.5 C2 ②分账:跳过≠失败,与 withFailure 不相交)。 */
  withSkip: number
  watchHit: number
  changeHit: number
  archivedEntries: number
  /** 其中自动归档(候选 5 ③ 无产出确定性闭环)计数——尾行与 json 同源。 */
  autoArchived: number
  runs: number
}

export interface DigestJson {
  date: string
  generatedAt: string
  totals: DigestOverview
  emptyWindow: boolean
  failures: Array<Omit<DigestFailureRow, 'id' | 'attribution'> & { attribution?: { verdict: string; summary: string; at: string; evidence?: string } }>
  /** 仅跳过无失败的任务(0.1.5 C2 ②;与 failures 不相交——混合任务的跳过在 failures[].skipCount)。 */
  skips: Array<Omit<DigestSkipRow, 'id'>>
  watch: Array<{ task: string; hits: string[]; sample?: string }>
  changes: Array<{ task: string; diff: string }>
  routine: Array<{ task: string; runs: number; empty?: number }>
  gaps: string[]
}

export interface DigestBuilt {
  /** 「[dsh-opencli] 早报 YYYY-MM-DD」(已 scrub)。 */
  title: string
  /** 首行总览计数(全量占行;事件正文/面板时间线复用)。 */
  overview: string
  /** compact 卡正文(≤NOTIFY_BODY_MAX,已 scrub;超预算先裁例行/watch/变化,失败段保留)。 */
  card: string
  /** 空窗(全成功且无变化):调用方对 quietHours 窗内顺延出窗。 */
  emptyWindow: boolean
  md: string
  json: DigestJson
}

export interface DigestBuildInput {
  /** 覆盖日(刚结束的本地自然日)。 */
  date: string
  genAt: Date
  ledger: DigestDayLedger
  /** (任务 id, 签名) → 连败天数(候选 3 计数器投影;纯函数入参,测试可桩)。 */
  streakOf: (id: string, sig: string) => number
  attributions: ReadonlyMap<string, CircuitAttribution>
  /** 进程实际启动时刻 ISO(缺口归因的证据:仅当启动落在覆盖日才写「进程当日启动/重启」;
   *  缺省/无法解析=不归因)。 */
  processStartedAt?: string
  /** 窗口内「调度应跑未入账」次数(0.1.5 C2 ④:调用方按任务 cron 逐分钟扫 [00:00, 首条入账-余量)
   *  数得,余量吸收 jitter 与执行时长;缺省=0 不归因)。 */
  missedScheduledRuns?: number
}

/**
 * 账目覆盖缺口(0.1.5 C2 ④收紧):「账目自 HH:MM 起」只在可证缺失时写,普通整日运行不再产
 * 噪音(low#6 预言「几乎每个正常日都产非缺口」实战 3/3 全中,日常噪音稀释真重启信号)。可证两档:
 *  - 进程当日启动/重启:内存日账自启动才记账,更早 run 无从知晓(头部缺失可证);
 *  - 调度应跑未入账:窗口内确有启用任务的 cron 应跑分钟(missedScheduledRuns>0);
 * 其余(进程昨日在跑、首条入账晚只是调度时刻使然,如每日 08:00 首跑的普通 cron)不注——
 * 不把没发生的事说成发生过,也不把「晚跑」说成「缺账」。
 */
function digestGaps(ledger: DigestDayLedger, processStartedAt: string | undefined, missedScheduledRuns: number): string[] {
  const gaps: string[] = []
  const first = ledger.firstRecordedAt()
  if (first !== undefined) {
    const d = new Date(first)
    const margin = new Date(d)
    margin.setHours(0, 5, 0, 0)
    if (d.getTime() > margin.getTime()) {
      const pad = (n: number): string => String(n).padStart(2, '0')
      const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      const startedToday =
        processStartedAt !== undefined &&
        !Number.isNaN(new Date(processStartedAt).getTime()) &&
        localDateKey(new Date(processStartedAt)) === ledger.date
      if (startedToday) gaps.push(`账目自 ${hhmm} 起(进程当日启动/重启,更早 run 未记)`)
      else if (missedScheduledRuns > 0) gaps.push(`账目自 ${hhmm} 起(调度应跑 ${missedScheduledRuns} 次未入账)`)
    }
  }
  return gaps
}

/** 失败行卡片文本(任务/来源/签名/折叠计数/连败/熔断/同任务跳过/末次,逐项按需追加)。 */
function failureRowText(row: DigestFailureRow): string {
  const segs: string[] = []
  if (row.signature !== undefined) segs.push(`签名 ${row.signature}`)
  if (row.dayCount > 1) segs.push(`本日 ${row.dayCount} 次`)
  if (row.streakDays !== undefined) segs.push(`连续第 ${row.streakDays} 日`)
  if (row.circuit) segs.push('⚡ 熔断')
  if (row.skipCount !== undefined && row.skipCount > 0) segs.push(`另跳过 ${row.skipCount} 次`)
  segs.push(`末次 ${oneLine(row.lastSummary, 80)}`)
  return `✗ ${row.task}${row.source !== undefined ? `(来源 ${row.source})` : ''}:${segs.join(' · ')}`
}

/** 跳过行卡片文本(⏸ 徽记;与 ✗ 行同段呈现,失败不静默的同族纪律:跳过也不静默)。 */
function skipRowText(row: DigestSkipRow): string {
  return `⏸ ${row.task}${row.source !== undefined ? `(来源 ${row.source})` : ''}:跳过 ${row.skipCount} 次 · 末次 ${oneLine(row.lastSummary, 80)}`
}

/**
 * 递归洗对象树里所有字符串值(只洗值,字段名/结构不动):json 落盘层过 scrubUrlParams 的
 * 单点闸——md 是整段文本一洗了之,json 是结构化对象,逐字段手洗等于给「新增字段忘了洗」
 * 留口子,整树递归保证 failures/watch/changes/gaps 及未来任何新字段同过一道。
 */
function scrubJsonStrings<T>(v: T): T {
  if (typeof v === 'string') return scrubUrlParams(v) as unknown as T
  if (Array.isArray(v)) return v.map((x) => scrubJsonStrings(x)) as unknown as T
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = scrubJsonStrings(val)
    return out as T
  }
  return v
}

export function buildDigest(input: DigestBuildInput): DigestBuilt {
  const { date, genAt, ledger, streakOf, attributions, processStartedAt, missedScheduledRuns = 0 } = input
  const entries = [...ledger.tasks.entries()]
  const runs = entries.reduce((s, [, t]) => s + t.runs, 0)
  const archivedEntries = entries.reduce((s, [, t]) => s + t.archivedRuns, 0)
  const autoArchived = entries.reduce((s, [, t]) => s + t.autoArchivedRuns, 0)
  const withFailure = entries.filter(([, t]) => t.failRuns > 0).length
  // 跳过分账(0.1.5 C2 ②):withSkip 只数「仅跳过无失败」的任务,与 withFailure 不相交——
  // 失败+跳过混合任务归入失败面,其跳过数并入失败行 skipCount(③),三桶相加=tasks
  const withSkip = entries.filter(([, t]) => t.failRuns === 0 && t.skipRuns > 0).length
  const watchHit = entries.filter(([, t]) => t.watchHits.length > 0).length
  const changeHit = entries.filter(([, t]) => t.diffs.length > 0).length
  const totals: DigestOverview = {
    tasks: entries.length,
    allOk: entries.length - withFailure - withSkip,
    withFailure, withSkip, watchHit, changeHit, archivedEntries, autoArchived, runs,
  }
  // 空窗=全成功且无变化且无跳过(worthPushing 三信号+跳过面的日级聚合;跳过日不算空窗——跳过不静默)
  const emptyWindow = totals.withFailure === 0 && totals.withSkip === 0 && totals.watchHit === 0 && totals.changeHit === 0
  const gaps = digestGaps(ledger, processStartedAt, missedScheduledRuns)
  const gapNote = gaps.length > 0 ? `;${clipLine(gaps[0]!, 60)}` : ''

  // 失败段:任务 × 签名折叠(候选 3:同签名连败一行带「连续第 N 日」);同任务当日跳过 run
  // 并入该任务首个失败行(skipCount,0.1.5 C2 ③双行合并——11-14 实证:失败行+跳过行并存,
  // 3 行仅 2 任务,与总览计数不齐)
  const failures: DigestFailureRow[] = []
  for (const [id, t] of entries) {
    let skipMerged = false
    for (const g of t.failGroups.values()) {
      const streak = g.signature !== undefined ? streakOf(id, g.signature) : 0
      const mergedSkip = !skipMerged && t.skipRuns > 0 ? t.skipRuns : undefined
      skipMerged ||= mergedSkip !== undefined
      failures.push({
        id,
        task: t.site,
        ...(t.source !== undefined ? { source: t.source } : {}),
        ...(g.signature !== undefined ? { signature: g.signature } : {}),
        dayCount: g.count,
        ...(streak >= 2 ? { streakDays: streak } : {}),
        circuit: g.circuit,
        ...(mergedSkip !== undefined ? { skipCount: mergedSkip } : {}),
        lastSummary: g.lastSummary,
        ...(g.signature !== undefined ? { attribution: attributions.get(g.signature) } : {}),
      })
    }
  }
  // 跳过段(0.1.5 C2 ②):仅跳过无失败的任务单独成 ⏸ 行——环境态跳过如实可见,但不冒充失败
  const skipRows: DigestSkipRow[] = entries
    .filter(([, t]) => t.failRuns === 0 && t.skipRuns > 0)
    .map(([id, t]) => ({
      id,
      task: t.site,
      ...(t.source !== undefined ? { source: t.source } : {}),
      skipCount: t.skipRuns,
      lastAt: t.lastSkipAt ?? t.lastAt ?? '',
      lastSummary: t.lastSkipSummary ?? '',
    }))
  const watch = entries
    .filter(([, t]) => t.watchHits.length > 0)
    .map(([id, t]) => ({ id, task: t.site, hits: [...t.watchHits], ...(t.watchSample !== undefined ? { sample: t.watchSample } : {}) }))
  const changes = entries
    .filter(([, t]) => t.diffs.length > 0)
    .map(([id, t]) => ({ id, task: t.site, diff: t.diffs.join(' ; ') }))
  const routine = entries
    .filter(([, t]) => t.failRuns === 0 && t.skipRuns === 0) // 跳过任务不进例行段(✓ 徽记会撒谎,⏸ 行已单独呈现)
    .map(([, t]) => ({ task: t.site, runs: t.runs, ...(t.emptyRuns - t.archivedRuns > 0 ? { empty: t.emptyRuns - t.archivedRuns } : {}) }))

  const title = scrubLocalPaths(`[dsh-opencli] 早报 ${date}`)
  // 跳过段仅在有跳过时占行(普通日卡片与 0.1.4 逐字节一致,不添「· 0 跳过」噪音)
  const skipSeg = totals.withSkip > 0 ? ` · ${totals.withSkip} 跳过` : ''
  const overview = `${totals.tasks} 任务:${totals.allOk} 成功 · ${totals.withFailure} 失败${skipSeg} · ${totals.watchHit} watch 命中 · ${totals.archivedEntries} 条已归档`
  const overviewEmpty = `${totals.tasks} 任务全部正常:${totals.allOk} 成功 · 0 失败 · 0 watch 命中 · ${totals.archivedEntries} 条已归档`
  // 尾行:回执口径 + 自动归档计数(候选 5 ③:自动归档在日报尾行给计数防不可见,
  // §九.7④;0 条不占行——例行日尾行保持原样)
  const tail = `🧾 口径:进程内存日账,重启丢账${gapNote}${autoArchived > 0 ? ` · 自动归档 ${autoArchived} 条无产出` : ''} · 详情 digest-${date}.md`

  // ── compact 卡(推送层):首行总览 + 失败>跳过>watch>变化>例行(worthPushing 分层)+ 尾行回执。
  // 超预算(NOTIFY_BODY_MAX)整节裁剪、留「N 项略」计数痕,裁剪序=例行→变化→watch→归因附注
  // (worthPushing 越低越先裁),失败行/跳过行永不裁——失败不静默、跳过不静默是卡片的第一纪律
  const failureLines = failures.map(failureRowText)
  const skipLines = skipRows.map(skipRowText)
  const attrLines = failures
    .filter((r): r is DigestFailureRow & { attribution: CircuitAttribution } => r.attribution !== undefined)
    .map((r) => `🔍 归因:${clipLine(r.attribution.summary, 100)}`)
  const sections: Array<{ label: string; priority: number; items: string[] }> = [
    { label: 'watch 命中', priority: 3, items: watch.map((w) => `🔔 ${w.task}:命中 ${w.hits.join(', ')}${w.sample !== undefined ? `——${oneLine(w.sample, 60)}` : ''}`) },
    { label: '变化', priority: 2, items: changes.map((c) => `📊 ${c.task}:${oneLine(c.diff, 120)}`) },
    { label: '例行', priority: 1, items: routine.map((r) => `✓ ${r.task} · run ${r.runs} 次${r.empty !== undefined ? ` · 空产出 ${r.empty}` : ''}`) },
  ]
  let droppedNotes: string[] = []
  let liveAttrs = attrLines
  const joinCard = (): string => [
    emptyWindow ? overviewEmpty : overview,
    ...failureLines,
    ...skipLines,
    ...liveAttrs,
    ...droppedNotes,
    ...[...sections].sort((a, b) => b.priority - a.priority).flatMap((s) => s.items),
    tail,
  ].join('\n')
  let body = joinCard()
  while (body.length > NOTIFY_BODY_MAX) {
    const alive = sections.filter((s) => s.items.length > 0)
    if (alive.length > 0) {
      const victim = alive.reduce((a, b) => (a.priority <= b.priority ? a : b))
      droppedNotes.push(`…(${victim.label} ${victim.items.length} 项略,全文见 digest-${date}.md)`)
      victim.items = []
    } else if (liveAttrs.length > 0) {
      droppedNotes = droppedNotes.filter((n) => !n.startsWith('…(归因')) // 归因最后裁:合并成一条痕
      droppedNotes.push(`…(归因附注 ${attrLines.length} 项略,全文见 digest-${date}.md)`)
      liveAttrs = []
    } else {
      break // 只剩总览+失败行+尾行仍超长:整卡硬截(失败密集日,诚实省略)
    }
    body = joinCard()
  }
  if (body.length > NOTIFY_BODY_MAX) body = `${body.slice(0, NOTIFY_BODY_MAX - 1)}…`
  const card = scrubLocalPaths(body)

  // ── md(落盘层):dsh-ai-research 骨架——单 H1 / 元信息引用块 / 分节 / 固定尾章「数据缺口」
  const mdLines: string[] = []
  mdLines.push(`# dsh-opencli 早报 · ${date}`)
  mdLines.push('')
  const genAtText = `${genAt.getFullYear()}-${String(genAt.getMonth() + 1).padStart(2, '0')}-${String(genAt.getDate()).padStart(2, '0')} ${String(genAt.getHours()).padStart(2, '0')}:${String(genAt.getMinutes()).padStart(2, '0')}`
  mdLines.push(`> 覆盖:${date}(本地自然日)· 生成:${genAtText} · 任务 ${totals.tasks} 个 · run ${totals.runs} 次`)
  mdLines.push(`> 口径:进程内存日账,重启丢账${gapNote}(双层产物:本文件与 digest-${date}.json 同源)`)
  mdLines.push('')
  mdLines.push('## 总览')
  mdLines.push('')
  mdLines.push(`- ${overview}${emptyWindow ? '(空窗:全成功且无变化)' : ''}`)
  if (failures.length > 0 || skipRows.length > 0) {
    mdLines.push('')
    mdLines.push(`## 失败与跳过(${failures.length + skipRows.length})`)
    mdLines.push('')
    for (const r of failures) {
      mdLines.push(`- ${failureRowText(r)}`)
      if (r.attribution !== undefined) {
        mdLines.push(`  - 🔍 归因(${r.attribution.verdict}):${r.attribution.summary}`)
        // 证据行(0.1.5 C1):逐站结果随归因落 md——「系统面」结论可被人复核
        if (r.attribution.evidence !== undefined) mdLines.push(`  - 证据:${r.attribution.evidence}`)
      }
    }
    for (const r of skipRows) mdLines.push(`- ${skipRowText(r)}`)
  }
  if (watch.length > 0) {
    mdLines.push('')
    mdLines.push(`## Watch 命中(${watch.length})`)
    mdLines.push('')
    for (const w of watch) mdLines.push(`- 🔔 \`${w.task}\` · 命中词:${w.hits.join(', ')}${w.sample !== undefined ? ` · 摘要:${w.sample}` : ''}`)
  }
  if (changes.length > 0) {
    mdLines.push('')
    mdLines.push(`## 变化(${changes.length})`)
    mdLines.push('')
    for (const c of changes) mdLines.push(`- 📊 \`${c.task}\`:${c.diff}`)
  }
  if (routine.length > 0) {
    mdLines.push('')
    mdLines.push(`## 例行(${routine.length})`)
    mdLines.push('')
    for (const r of routine) mdLines.push(`- ✓ \`${r.task}\` · run ${r.runs} 次${r.empty !== undefined ? ` · 空产出 ${r.empty}(未归档)` : ''}`)
  }
  mdLines.push('')
  mdLines.push('## 数据缺口')
  mdLines.push('')
  mdLines.push(gaps.length > 0 ? gaps.map((g) => `- ${g}`).join('\n') : '- 无')
  mdLines.push('')
  mdLines.push('> 生成于 dsh-opencli 日结早报(0.1.4 候选 2);run 级原文见 opencli-snapshots/<任务 id>/;URL 中凭据类查询参数的值已脱敏。')
  const md = scrubUrlParams(mdLines.join('\n'))

  const json = scrubJsonStrings({
    date,
    generatedAt: genAt.toISOString(),
    totals,
    emptyWindow,
    failures: failures.map(({ id: _id, attribution, ...rest }) => ({
      ...rest,
      ...(attribution !== undefined ? { attribution: { verdict: attribution.verdict, summary: attribution.summary, at: attribution.at, ...(attribution.evidence !== undefined ? { evidence: attribution.evidence } : {}) } } : {}),
    })),
    skips: skipRows.map(({ id: _id, ...rest }) => rest),
    watch: watch.map(({ id: _id, ...rest }) => rest),
    changes: changes.map(({ id: _id, ...rest }) => rest),
    routine,
    gaps,
  })
  return { title, overview, card, emptyWindow, md, json }
}
