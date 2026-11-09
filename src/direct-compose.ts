/**
 * daemon 直连组合层(0.4.7 任务 A:直连铺满)。
 *
 * 上游事实(2026-11-04 核对 @jackwener/opencli 2.0.2 dist 源码):
 *   daemon /command 的动作词汇是低层原语(exec/navigate/tabs/screenshot/cookies/close-window/
 *   close-owned-tab/cdp/frames/…);**state/click/scroll 不是 daemon 动作**——CLI 在本地用 JS 串
 *   构造器(generateSnapshotJs/resolveTargetJs/clickResolvedJs/scrollJs,均 dom-snapshot.js/
 *   target-resolver.js/dom-helpers.js 的零依赖导出)经 exec 组合出高层语义。
 * 因此本层分两类:
 *   ① 真 1:1 动作:screenshot / tabs / close-window——透传参数即母语;
 *   ② 组合直连:scroll / state / click——**运行时装载本机已装 CLI 的构造器模块**(永不内嵌副本:
 *      上游改 JS 我们自动跟上,版本漂移不可能发生),本仓只复刻薄编排(state ≈30 行/click ≈60 行,
 *      均与上游 base-page.js 逐句对齐);构造器装载失败→整层回落 CLI。
 *
 * 纪律(与 direct.ts 同源,评审先立):
 *   ① 永不抛错:全部函数返回 CliEnvelope | undefined,undefined=本次不可用,调用方回落 CLI;
 *   ② **只在全成功时归一 CLI 2.0 信封**——任何结构化失败(如 click 目标解析失败)都交 CLI 兜底,
 *      由 CLI 出权威失败信封(code/message/hint/candidates);失败走慢路径换规范错误,值得;
 *   ③ 页面身份(page targetId)由调用方(index.ts directPages 缓存)管理,本层只透传与回报。
 * @module dsh-opencli/direct-compose
 */

import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { directCommand, directExec, type DirectResult } from './direct.ts'

/** CLI 2.0 信封形态的执行结果(与 runBrowserTraced 的 out 同形)。 */
export type CliEnvelope = { exitCode: number; stdout: string; stderr: string }

const okEnv = (data: unknown): CliEnvelope => ({ exitCode: 0, stdout: JSON.stringify({ ok: true, data }), stderr: '' })

// ─── 上游构造器运行时装载 ────────────────────────────────────────────────

/** 本机已装 CLI 的 dist/src 目录(由宿主注入;与 runOpencli 的 CLI 定位同一套级联)。 */
let cliDistDir: string | undefined

/** 宿主注入 CLI dist 目录(测试同用);undefined=尚未注入,组合直连整层不可用。 */
export function setCliDistDir(dir: string | undefined): void {
  cliDistDir = dir
  builders = undefined
}

interface UpstreamBuilders {
  generateSnapshotJs: (opts: Record<string, unknown>) => string
  resolveTargetJs: (ref: string, opts?: Record<string, unknown>) => string
  boundingRectResolvedJs: (opts?: Record<string, unknown>) => string
  clickResolvedJs: (opts?: Record<string, unknown>) => string
  scrollJs: (direction: string, amount?: number) => string
  NETWORK_INTERCEPTOR_JS: string
}

/** 构造器缓存:undefined=未试,null=装载失败(负缓存,不再重试),否则模块引用集。 */
let builders: UpstreamBuilders | null | undefined

async function loadBuilders(): Promise<UpstreamBuilders | null> {
  if (builders !== undefined) return builders
  if (cliDistDir === undefined) { builders = null; return null }
  try {
    const ds = await import(pathToFileURL(join(cliDistDir, 'browser', 'dom-snapshot.js')).href)
    const tr = await import(pathToFileURL(join(cliDistDir, 'browser', 'target-resolver.js')).href)
    const dh = await import(pathToFileURL(join(cliDistDir, 'browser', 'dom-helpers.js')).href)
    const ni = await import(pathToFileURL(join(cliDistDir, 'browser', 'network-interceptor.js')).href)
    if (typeof ds.generateSnapshotJs !== 'function' || typeof tr.resolveTargetJs !== 'function' ||
        typeof tr.boundingRectResolvedJs !== 'function' || typeof tr.clickResolvedJs !== 'function' ||
        typeof dh.scrollJs !== 'function' || typeof ni.NETWORK_INTERCEPTOR_JS !== 'string') { builders = null; return null }
    builders = {
      generateSnapshotJs: ds.generateSnapshotJs,
      resolveTargetJs: tr.resolveTargetJs,
      boundingRectResolvedJs: tr.boundingRectResolvedJs,
      clickResolvedJs: tr.clickResolvedJs,
      scrollJs: dh.scrollJs,
      NETWORK_INTERCEPTOR_JS: ni.NETWORK_INTERCEPTOR_JS,
    }
  } catch {
    builders = null
  }
  return builders
}

// ─── 会话级辅助状态(state diff hashes / click CDP marker 序号) ──────────

/** state 增量 diff 的上一份快照 hash(与上游 base-page._prevSnapshotHashes 同义,按会话分册)。 */
const stateHashes = new Map<string, string | null>()

/** 会话最近已知 URL(与上游 page._lastUrl 同义:composeOpen 导航后即知,state 免一次 exec)。 */
const lastUrl = new Map<string, string>()

/** 会话级缓存上限(0.1.2 发后审查 low:会话名不可枚举,常驻进程防无限累积):超限按插入序裁最旧。 */
const SESSION_CACHE_CAP = 200

/** 有界写入:超限裁最旧插入的会话(热点会话每次 set 即刷新插入位,天然靠后)。 */
function capSet<T>(map: Map<string, T>, key: string, value: T): void {
  map.set(key, value)
  if (map.size > SESSION_CACHE_CAP) {
    const oldest = map.keys().next()
    if (!oldest.done) map.delete(oldest.value)
  }
}

let markerSeq = 0

/** 测试重置(清缓存+序号;构造器缓存由 __setCliDistDirForTest 管理)。 */
export function __composeResetForTest(): void {
  stateHashes.clear()
  lastUrl.clear()
  markerSeq = 0
}

// ─── ① 真 1:1 动作 ──────────────────────────────────────────────────────

/**
 * 截图直连:daemon screenshot 返回 base64;path 存在时由调用方落盘(本层不碰文件系统,
 * 返回 {base64} 让调用方决定写哪、报什么文案——CLI 的两种信封(带 path=Saved to 文案/
 * 不带=base64 原文)由调用方按 argv 分叉)。--annotate/--width/--height 由调用方挡回 CLI。
 */
export async function composeScreenshot(session: string, page: string | undefined, opts: { fullPage?: boolean } = {}, timeoutMs = 30_000): Promise<{ env: CliEnvelope; base64: string } | undefined> {
  const r = await directCommand('screenshot', {
    session, surface: 'browser',
    ...(page !== undefined ? { page } : {}),
    ...(opts.fullPage === true ? { fullPage: true } : {}),
  }, timeoutMs)
  if (!r.ok || typeof r.data !== 'string' || r.data.length === 0) return undefined
  return { env: okEnv(r.data), base64: r.data }
}

/**
 * tab 族直连(op: list/new/select/close)。信封与 CLI 逐字段同形(2026-11-04 核对 2.0.2):
 *   list → data 原样;new → {page, url: url ?? null};select → {selected: target};
 *   close → {closed: <daemon 回报 closed ?? 显式 target>}(两者都拿不到=无法确认关了谁 →
 *   undefined 回 CLI,由 CLI 的会话范围校验出权威结果)。
 * 页面身份:new/select 成功后 pageId=响应 page(调用方更新缓存);close 成功后 closedPage
 * 供调用方按上游 closeTab 语义比对清缓存。
 */
export async function composeTabs(
  session: string,
  op: 'list' | 'new' | 'select' | 'close',
  extra: { url?: string; index?: number; page?: string } = {},
  curPage: string | undefined,
  timeoutMs = 30_000,
): Promise<{ env: CliEnvelope; pageId?: string; closedPage?: string } | undefined> {
  const r = await directCommand('tabs', {
    session, surface: 'browser', op,
    ...(op === 'new' && extra.url !== undefined ? { url: extra.url } : {}),
    ...(op === 'select' && extra.index !== undefined ? { index: extra.index } : {}),
    ...(op === 'select' && extra.page !== undefined ? { page: extra.page } : {}),
    ...(op === 'close' && extra.index !== undefined ? { index: extra.index } : {}),
    ...(op === 'close' && extra.page !== undefined ? { page: extra.page } : {}),
    ...(op === 'close' && extra.index === undefined && extra.page === undefined && curPage !== undefined ? { page: curPage } : {}),
  }, timeoutMs)
  if (!r.ok) return undefined
  if (op === 'list') {
    if (!Array.isArray(r.data)) return undefined
    return { env: okEnv(r.data) }
  }
  if (op === 'new') {
    if (typeof r.page !== 'string') return undefined
    return { env: okEnv({ page: r.page, url: extra.url ?? null }), pageId: r.page }
  }
  if (op === 'select') {
    if (typeof r.page !== 'string') return undefined
    return { env: okEnv({ selected: extra.page ?? String(extra.index ?? '') }), pageId: r.page }
  }
  // close:确认对象=daemon 回报 closed,退而取显式 target;都无 → CLI 兜底
  const closedPage = typeof (r.data as { closed?: unknown } | null)?.closed === 'string' ? (r.data as { closed: string }).closed : undefined
  const confirmed = closedPage ?? extra.page
  if (confirmed === undefined) return undefined
  return { env: okEnv({ closed: confirmed }), ...(closedPage !== undefined ? { closedPage } : {}) }
}

/**
 * 释放会话 tab 租约(daemon close-window;OPENCLI_CLOSE_OWNED_TAB=1 时上游走 close-owned-tab,
 * 本层同款分流)。成功信封与 CLI `browser close` 逐字同文。
 */
export async function composeCloseWindow(session: string, page: string | undefined, timeoutMs = 30_000): Promise<CliEnvelope | undefined> {
  const action = process.env.OPENCLI_CLOSE_OWNED_TAB === '1' ? 'close-owned-tab' : 'close-window'
  const r = await directCommand(action, { session, surface: 'browser', ...(page !== undefined ? { page } : {}) }, timeoutMs)
  if (!r.ok) return undefined
  return okEnv('Browser session tab lease released')
}

// ─── ② 组合直连(scroll / state / click) ────────────────────────────────

/** scroll:上游 = page.evaluate(scrollJs(direction, amount));信封逐字同 CLI(`Scrolled down`)。 */
export async function composeScroll(session: string, direction: string, amount: number | undefined, page: string | undefined, timeoutMs = 30_000): Promise<CliEnvelope | undefined> {
  if (direction !== 'up' && direction !== 'down') return undefined
  const b = await loadBuilders()
  if (b === null) return undefined
  const r = await directExec(session, b.scrollJs(direction, amount ?? 500), page, timeoutMs)
  if (!r.ok) return undefined
  return okEnv(`Scrolled ${direction}`)
}

/**
 * state(dom 路径):上游 = generateSnapshotJs(含上一份 hashes)→ exec → 回读
 * window.__opencli_prev_hashes → getCurrentUrl(location.href)→ emitResult({url, snapshot})。
 * --source ax 需 CDP Accessibility 树组合,不在此层(调用方挡回 CLI);diagnostics 同。
 */
export async function composeState(session: string, page: string | undefined, timeoutMs = 30_000): Promise<CliEnvelope | undefined> {
  const b = await loadBuilders()
  if (b === null) return undefined
  const snapJs = b.generateSnapshotJs({
    viewportExpand: 2000,
    maxDepth: 50,
    interactiveOnly: false,
    maxTextLength: 120,
    includeScrollInfo: true,
    bboxDedup: true,
    previousHashes: stateHashes.get(session) ?? undefined,
  })
  const r = await directExec(session, snapJs, page, timeoutMs)
  if (!r.ok) return undefined
  // 回读 diff hashes(best-effort,上游同款:失败不影响主结果)
  const hr = await directExec(session, 'window.__opencli_prev_hashes', r.page ?? page, 10_000)
  if (hr.ok && typeof hr.data === 'string') capSet(stateHashes, session, hr.data)
  // URL:优先取 composeOpen 导航后的已知值(上游 _lastUrl 同款);无已知值才 exec 现取
  // (best-effort:上游 getCurrentUrl 失败返回 null → emitResult 里 url 落 '')
  let url = lastUrl.get(session) ?? ''
  if (url === '') {
    const ur = await directExec(session, 'window.location.href', r.page ?? page, 10_000)
    if (ur.ok && typeof ur.data === 'string' && ur.data.length > 0) url = ur.data
  }
  return okEnv({ url, snapshot: r.data })
}

/**
 * click:上游 page.click 链的薄复刻(base-page.js:175 逐句对齐,2026-11-04 核对):
 *   resolveTargetJs(指纹校验解析) → [CDP scrollIntoViewIfNeeded] → boundingRectResolvedJs
 *   (hit-test:target/ancestor 才信 CDP 坐标,other 一律走 el.click() 兜底,#2076/#2071)
 *   → CDP 原生点击 → clickResolvedJs(JS 兜底) → JS 失败且有余弦坐标时 CDP 重试。
 * 跳过 tryClickAxRef(ax 引用只来自上一份 ax 快照;本层 state 仅 dom 路径,ax 快照不可能
 * 由本层产生——ax 场景走 CLI)。任何环节结构化失败/点击双链失败 → undefined → CLI 出
 * 权威失败信封(TargetError 的 candidates/hint 等)。
 */
export async function composeClick(session: string, target: string, nth: number | undefined, page: string | undefined, timeoutMs = 30_000): Promise<CliEnvelope | undefined> {
  const b = await loadBuilders()
  if (b === null) return undefined
  // Phase 1: 解析(指纹校验)。解析失败=结构化失败 → CLI 兜底出 candidates/hint。
  const rr = await directExec(session, b.resolveTargetJs(target, nth !== undefined ? { nth } : {}), page, timeoutMs)
  if (!rr.ok) return undefined
  const resolution = rr.data as { ok?: unknown; matches_n?: unknown; match_level?: unknown } | null
  if (resolution === null || typeof resolution !== 'object' || resolution.ok !== true ||
      typeof resolution.matches_n !== 'number' || typeof resolution.match_level !== 'string') return undefined
  const resolved = { matches_n: resolution.matches_n, match_level: resolution.match_level }
  const cur = rr.page ?? page

  // Phase 1.5: CDP 滚入视野(marker 属性标定 → DOM.scrollIntoViewIfNeeded);失败=false,照常继续
  const nativeScrolled = await cdpScrollIntoViewIfNeeded(session, cur)

  // Phase 2: 量测(hit-test)。skipScroll 与上游同源:CDP 已滚过就不再让 JS 重复滚动。
  const br = await directExec(session, b.boundingRectResolvedJs({ skipScroll: nativeScrolled, forClick: true }), cur, timeoutMs)
  if (!br.ok) return undefined
  const rect = br.data as { visible?: unknown; hit?: unknown; x?: unknown; y?: unknown; retargeted?: unknown } | null
  const meta = {
    ...(rect !== null && typeof rect === 'object' && typeof rect.hit === 'string' ? { hit: rect.hit } : {}),
    ...(rect !== null && typeof rect === 'object' && rect.retargeted === true ? { retargeted: true } : {}),
  }
  const rectUsable = rect !== null && typeof rect === 'object' && rect.visible === true &&
    (rect.hit === 'target' || rect.hit === 'ancestor') && typeof rect.x === 'number' && typeof rect.y === 'number'

  // CDP 原生点击(hit 可信时):与上游 #2076/#2071 语义一致——target/ancestor 才走,other 不走
  if (rectUsable) {
    if (await nativeClick(session, cur, rect.x as number, rect.y as number)) {
      return okEnv({ clicked: true, target, ...resolved, click_method: 'cdp', ...meta })
    }
  }

  // JS 兜底:el.click() 直派 __resolved,绕开遮挡层(也覆盖零尺寸目标/旧后端)
  const cr = await directExec(session, b.clickResolvedJs({ skipScroll: nativeScrolled }), cur, timeoutMs)
  if (!cr.ok) return undefined
  const result = cr.data
  if ((typeof result === 'string' || result === null || result === undefined) ||
      (typeof result === 'object' && (result as { status?: unknown }).status === 'clicked')) {
    return okEnv({ clicked: true, target, ...resolved, click_method: 'js', ...meta })
  }
  // JS 失败且 JS 侧给出了坐标 → CDP 重试一次(上游同款)
  if (typeof result === 'object' && typeof (result as { x?: unknown }).x === 'number' && typeof (result as { y?: unknown }).y === 'number') {
    if (await nativeClick(session, cur, (result as { x: number }).x, (result as { y: number }).y)) {
      return okEnv({ clicked: true, target, ...resolved, click_method: 'cdp', ...meta })
    }
  }
  return undefined
}

/**
 * open:上游 browser open 的忠实链(browser.js open → base-page/page.js,2026-11-04 核对):
 *   会话级网络捕获启动(不认识该动作的旧扩展 → 静默跳过,注入拦截器兜底) → navigate(stale
 *   页身份:清缓存重试一次) → wait(2)(上游刻意的落定等待,保留) → 拦截器兜底 → 取 URL。
 * 信封 {url, page?}。捕获启动的其他失败 → undefined 回 CLI(CLI 会对同一动作出权威错误)。
 */
export async function composeOpen(session: string, url: string, page: string | undefined, timeoutMs = 60_000): Promise<{ env: CliEnvelope; pageId?: string } | undefined> {
  const b = await loadBuilders()
  if (b === null) return undefined
  // ① 会话级捕获:动作不存在(旧扩展报 unknown action + network-capture)=静默跳过;其他失败回 CLI
  let hasCapture = false
  const cap = await directCommand('network-capture-start', { pattern: '', session, surface: 'browser', ...(page !== undefined ? { page } : {}) }, 15_000)
  if (cap.ok) hasCapture = true
  else if (cap.unreachable !== true) {
    const msg = `${cap.errorCode ?? ''} ${cap.error ?? ''}`
    if (!(msg.toLowerCase().includes('unknown action') && msg.toLowerCase().includes('network-capture'))) return undefined
  }
  // ② navigate(stale 页身份:清缓存重试一次——上游 goto 同款)
  let r = await directCommand('navigate', { session, surface: 'browser', ...(page !== undefined ? { page } : {}), url }, timeoutMs)
  if (!r.ok && r.unreachable !== true && page !== undefined && /page|stale|not.?found/i.test(String(r.errorCode ?? ''))) {
    r = await directCommand('navigate', { session, surface: 'browser', url }, timeoutMs)
  }
  if (!r.ok || typeof r.page !== 'string') return undefined
  const pageId = r.page
  // ③ 落定等待(上游 page.wait(2) 是刻意的页面稳定语义)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  // ④ 拦截器兜底(无会话捕获时注入;non-fatal,上游 try/catch 同款)
  if (!hasCapture) {
    try { await directExec(session, b.NETWORK_INTERCEPTOR_JS, pageId, 15_000) } catch { /* non-fatal */ }
  }
  // ⑤ URL(best-effort,上游 getCurrentUrl 失败落原 url);已知值进会话缓存供 state 免 exec
  let currentUrl = url
  const ur = await directExec(session, 'window.location.href', pageId, 10_000)
  if (ur.ok && typeof ur.data === 'string' && ur.data.length > 0) currentUrl = ur.data
  capSet(lastUrl, session, currentUrl)
  return { env: okEnv({ url: currentUrl, page: pageId }), pageId }
}

// ─── CDP 辅助(daemon 'cdp' 动作,与 page.js cdp() 同参形) ────────────────

async function cdpCall(session: string, page: string | undefined, method: string, params: Record<string, unknown>): Promise<DirectResult> {
  return await directCommand('cdp', {
    cdpMethod: method, cdpParams: params,
    session, surface: 'browser',
    ...(page !== undefined ? { page } : {}),
  }, 15_000)
}

/** 原生点击三连(mouseMoved/Pressed/Released)——与上游 base-page.nativeClick 同款。 */
async function nativeClick(session: string, page: string | undefined, x: number, y: number): Promise<boolean> {
  const px = Math.round(x); const py = Math.round(y)
  const moved = await cdpCall(session, page, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py })
  const pressed = await cdpCall(session, page, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 })
  const released = await cdpCall(session, page, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 })
  return moved.ok && pressed.ok && released.ok
}

/**
 * 对 __resolved 元素标定 marker 属性后走 CDP DOM.scrollIntoViewIfNeeded。
 * 上游 base-page.tryCdpOnResolvedElement 的薄复刻:marker 注入由闭包参数改为字面量内插
 * (值为本层自生成 token,无注入面);任一步失败返回 false,不阻断主链(上游同款)。
 */
async function cdpScrollIntoViewIfNeeded(session: string, page: string | undefined): Promise<boolean> {
  const markerAttr = 'data-opencli-cdp-target'
  const markerValue = `${Date.now().toString(36)}-${++markerSeq}`
  const js = `(function(){var el=window.__resolved;if(!el||el.nodeType!==1||typeof el.setAttribute!=='function'){return{ok:false}}el.setAttribute(${JSON.stringify(markerAttr)},${JSON.stringify(markerValue)});return{ok:true}})()`
  const marker = await directExec(session, js, page, 10_000)
  if (!marker.ok || (marker.data as { ok?: unknown } | null)?.ok !== true) return false
  const en = await cdpCall(session, page, 'DOM.enable', {})
  if (!en.ok) return false
  const doc = await cdpCall(session, page, 'DOM.getDocument', {})
  const rootNodeId = (doc.data as { root?: { nodeId?: unknown } } | null)?.root?.nodeId
  if (typeof rootNodeId !== 'number') return false
  const q = await cdpCall(session, page, 'DOM.querySelector', { nodeId: rootNodeId, selector: `[${markerAttr}="${markerValue}"]` })
  const nodeId = (q.data as { nodeId?: unknown } | null)?.nodeId
  if (typeof nodeId !== 'number') return false
  const scrolled = await cdpCall(session, page, 'DOM.scrollIntoViewIfNeeded', { nodeId })
  return scrolled.ok
}
