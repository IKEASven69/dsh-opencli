/**
 * daemon 直连传输层(0.4.6 任务 A1)。
 *
 * 线协议与 CLI 内部同源(上游 dist/src/browser/daemon-transport.js + page.js 提取,2026-10-30 核对):
 *   POST http://127.0.0.1:19825/command   头 X-OpenCLI: 1(CSRF 门)
 *   body {id, action, ...params};params 关键字段: session / surface:'browser' / page(targetId,
 *   navigate 返回后必须回传)/ contextId·preferredContextId(多 profile 路由,可选)。
 *   动作词汇(高频族): exec{code} · navigate{url}→{page} · tabs{op:list|new|select|close} ·
 *   screenshot{format,quality} · cookies · close-owned-tab/close-window。
 *   响应形状(嗅探容错): {ok:true,data} | {ok:false,errorCode,error,hint}。
 *
 * 设计纪律(评审先立):本层是**旁路加速**,不是替代——
 *   ① 永不抛错:任何失败返回 {ok:false, unreachable:true} 形态,调用方回落 CLI 路径;
 *   ② 形状嗅探不猜版本:/command 响应缺 ok 字段即视为协议不认识,整层禁用到进程重启(能力位一次性探测);
 *   ③ page 身份遵循上游契约:navigate 返回的 targetId 供后续命令回传,tab 关闭等致 stale 时
 *      返回错误码由调用方决定重导航;
 *   ④ 超时收紧:探测 400ms、命令 30s 默认(与 CLI 同量级),挂死不拖工具。
 * @module dsh-opencli/direct
 */

const daemonBase = (): string => `http://127.0.0.1:${Number(process.env.OPENCLI_DAEMON_PORT ?? 19825)}`

/** 直连命令结果:成功/结构化失败/不可达(回落 CLI 的信号)。 */
export type DirectResult =
  | { ok: true; data: unknown }
  | { ok: false; unreachable: true }
  | { ok: false; unreachable?: false; errorCode?: string; error?: string; hint?: string }

/** 能力探测缓存:一次性判定,不认识协议就整层禁用(避免每命令都付探测税)。 */
let capability: 'unknown' | 'ready' | 'off' = 'unknown'

let idCounter = 0
const nextId = (): string => `dsh-opencli-direct-${Date.now().toString(36)}-${++idCounter}`

/** 原始 /command 调用:网络失败/超时/非 JSON → unreachable;协议形状不符 → 关能力位并 unreachable。 */
async function post(action: string, params: Record<string, unknown>, timeoutMs: number): Promise<DirectResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${daemonBase()}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenCLI': '1' },
      body: JSON.stringify({ id: nextId(), action, ...params }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, unreachable: false, errorCode: `HTTP ${res.status}`, error: `daemon /command HTTP ${res.status}` }
    const j = await res.json().catch(() => null) as { ok?: unknown; data?: unknown; errorCode?: unknown; error?: unknown; hint?: unknown } | null
    if (j === null || typeof j !== 'object' || typeof j.ok !== 'boolean') {
      // 协议形状不认识:禁用到进程重启(CLI 兜底照常工作,不反复试探)
      capability = 'off'
      return { ok: false, unreachable: true }
    }
    if (j.ok) return { ok: true, data: j.data }
    return {
      ok: false,
      unreachable: false,
      errorCode: typeof j.errorCode === 'string' ? j.errorCode : undefined,
      error: typeof j.error === 'string' ? j.error : undefined,
      hint: typeof j.hint === 'string' ? j.hint : undefined,
    }
  } catch {
    return { ok: false, unreachable: true }
  } finally {
    clearTimeout(timer)
  }
}

/** 能力探测:用一次最小 exec 判定 /command 是否可用(成功与结构化失败都算可用,网络不通算不可达)。 */
export async function directProbe(): Promise<boolean> {
  if (capability === 'off') return false
  const r = await post('exec', { session: 'dsh', surface: 'browser', code: '1' }, 400)
  if (r.ok) { capability = 'ready'; return true }
  if (r.unreachable === true) { capability = 'unknown'; return false } // 网络层失败:保留待下次再探(daemon 可能还没起)
  // 结构化失败(协议在,命令被拒):协议可用
  capability = 'ready'
  return true
}

/** 直连是否已就绪(未探测时返回 unknown 态,调用方先 probe)。 */
export function directCapability(): 'unknown' | 'ready' | 'off' {
  return capability
}

/** 测试注入:重置能力位与自增 id。 */
export function __directResetForTest(): void {
  capability = 'unknown'
  idCounter = 0
}

/** 通用命令入口(调用方回落 CLI 的唯一判断点:r.ok===false 即回落,不论原因)。 */
export async function directCommand(action: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<DirectResult> {
  if (capability === 'off') return { ok: false, unreachable: true }
  return await post(action, params, timeoutMs)
}

/** eval 族:页面 JS 求值(action 'exec',code 为表达式或语句)。 */
export async function directExec(session: string, code: string, page?: string, timeoutMs = 30_000): Promise<DirectResult> {
  return await directCommand('exec', { session, surface: 'browser', code, ...(page !== undefined ? { page } : {}) }, timeoutMs)
}

/** 导航(action 'navigate'):成功 data 形如 {page: targetId, url?, title?}——page 必须缓存回传后续命令。 */
export async function directNavigate(session: string, url: string, timeoutMs = 60_000): Promise<DirectResult> {
  return await directCommand('navigate', { session, surface: 'browser', url }, timeoutMs)
}

/** 批量求值(0.4.6 A3):一次往返多条表达式——上游 exec 单 code,这里拼成数组表达式一次下发,
 * 返回逐条结果;任一条抛错则整批结构化失败(调用方拆批重试或回落 CLI)。 */
export async function directExecBatch(session: string, codes: string[], page?: string, timeoutMs = 60_000): Promise<DirectResult> {
  if (codes.length === 0) return { ok: false, unreachable: false, errorCode: 'empty-batch', error: '批量求值收到空数组' }
  // JSON 字符串字面量内插:codes 逐条 JSON.stringify 防注入/防转义撕裂(与 vom.ts 单行契约同纪律)
  const code = `(function(){var rs=[${codes.map((c) => JSON.stringify(c)).join(',')}];return JSON.stringify(rs.map(function(x){try{var v=eval(x);return {ok:true,v:(v===undefined?null:v)}}catch(e){return {ok:false,e:String(e&&e.message||e)}}}))})()`
  return await directExec(session, code, page, timeoutMs)
}

/** tab 族(action 'tabs',op: list/new/select/close)。 */
export async function directTabs(session: string, op: 'list' | 'new' | 'select' | 'close', extra: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<DirectResult> {
  return await directCommand('tabs', { session, surface: 'browser', op, ...extra }, timeoutMs)
}

/** 截图(action 'screenshot')。 */
export async function directScreenshot(session: string, page?: string, opts: { format?: string; quality?: number } = {}, timeoutMs = 30_000): Promise<DirectResult> {
  return await directCommand('screenshot', { session, surface: 'browser', ...(page !== undefined ? { page } : {}), ...opts }, timeoutMs)
}
