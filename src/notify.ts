/**
 * 通知通道层:定时任务/watch 命中的结果外送(webhook / email / dsh 面板 + push 类预设
 * Bark / ntfy / Pushover)。
 * 通道是安全边界——通知会进群机器人、邮箱等不可控转发面,正文里任何本机路径
 * (~/.dsh 下的状态/轨迹文件名本身就是用户指纹)与 token 都必须在出口处清洗,
 * 宁可多删不可漏一条(scrubLocalPaths 是所有通道共享的最后闸,buildNotifyBody 默认已调)。
 * 凭据面纪律(0.1.4 候选 1):凭据绝不进请求 URL——SCRUB_RULES 的 URL 参数规则只洗
 * query 不覆盖 path 段,bark device_key / ntfy topic / telegram token 一旦拼进 path 即落在
 * 脱敏链覆盖范围之外;push 类通道一律 POST 体带凭据(ntfy topic 进 body + Bearer 头),
 * telegram 是官方设计例外(token 必在 path,TLS 网络面安全,存储/回显/错误文案三面不落)。
 * 本模块不感知 OpencliService:通道纯函数化 + 会话/事件入口注入,接线由服务层完成。
 * @module dsh-opencli/notify
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { dirname } from 'node:path'
import { buildPayload, platformOk, platformOf, type PlatformId } from './channels.ts'
import type { IngestEvent } from './types.ts'

/** webhook 模板渲染的调度侧变量(白名单闭集,与模板占位符 {{key}} 一一对应):
 * 全部来自已过 scrub 链的 buildNotifyBody/调度段——site/watchHits 是用户自己的任务配置词,
 * dispatch 侧仍再过一遍 scrubLocalPaths(「没有忘了洗的口子」纪律的顺延,不指望上游)。 */
export interface NotifyTemplateVars { ok?: boolean; site?: string; source?: string; watchHits?: string[] }

/** 通知通道统一接口:send 永不抛异常,失败以 { ok: false, error } 返回——通知是旁路,不能拖死调度主链。
 * vars 是 webhook 模板渲染的可选变量(其余通道忽略);错误文案永不回显请求 URL/凭据原文。 */
export interface NotifyChannel {
  name: string
  send(title: string, body: string, vars?: NotifyTemplateVars): Promise<{ ok: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// HTTP 通道共享件:有界 429 退避 / 可选出站代理
// ---------------------------------------------------------------------------

/** 退避上限(0.1.4 通知面统一口径):任何通道返回显式退避信号(429+Retry-After/retry_after)时,
 * 等待值 ≤5s 才就地重试一次;>5s 如实失败并附等待值——重试会拉长调度 tick,旁路纪律不允许无界等。 */
export const NOTIFY_BACKOFF_MAX_MS = 5_000

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) })

/**
 * 429 显式退避信号解析(秒 → 毫秒):Telegram 读体字段 parameters.retry_after(Bot API
 * ResponseParameters「number of seconds left to wait」,429 体 {ok:false,error_code:429,
 * parameters:{retry_after:N}}),其余通道(ntfy/Pushover)读 Retry-After 头。头只认数字秒,
 * HTTP-date 形态不支持(如实当无信号,单发失败)。
 */
export function parseRetryAfterMs(retryAfterHeader: string | undefined, bodyText: string): number | undefined {
  try {
    const j = JSON.parse(bodyText) as { parameters?: { retry_after?: unknown } }
    const n = Number(j.parameters?.retry_after)
    if (Number.isFinite(n) && n >= 0) return n * 1000
  } catch { /* 非 JSON 体:走头 */ }
  if (retryAfterHeader !== undefined && /^\d{1,4}$/.test(retryAfterHeader.trim())) return Number(retryAfterHeader.trim()) * 1000
  return undefined
}

/** 桩兼容的响应读取(旧测试桩是 {status} 简单对象,无 headers/text——WebhookChannel 同款判定)。 */
async function responseTextOf(res: unknown): Promise<string> {
  const t = (res as { text?: unknown }).text
  return typeof t === 'function' ? await (res as Response).text() : ''
}
function responseHeaderOf(res: unknown, name: string): string | undefined {
  const h = (res as { headers?: unknown }).headers
  if (h === null || typeof h !== 'object') return undefined
  if (typeof (h as { get?: unknown }).get === 'function') return (h as { get: (n: string) => string | null }).get(name) ?? undefined
  // 桩兼容:测试桩/部分 polyfill 的 headers 是普通对象——键不区分大小写兜底
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (k.toLowerCase() === name.toLowerCase() && typeof v === 'string') return v
  }
  return undefined
}
function statusOf(res: unknown): number {
  return typeof (res as { status?: unknown }).status === 'number' ? (res as { status: number }).status : 0
}

/**
 * HTTP 通道共用的单发(带一次有界 429 退避):
 *  - 429 无退避信号:单发如实失败(不猜等待时间);
 *  - 信号 ≤5s:就地等待后重试一次(新 AbortSignal),仍 429 如实失败(最多重试一次);
 *  - 信号 >5s:如实失败并附等待值。成功路径返回最终响应,由通道自写成功判定。
 */
async function postOnceWithBackoff(once: () => Promise<unknown>): Promise<{ status: number; text: string; error?: string }> {
  let res = await once()
  let text = await responseTextOf(res)
  if (statusOf(res) === 429) {
    const wait = parseRetryAfterMs(responseHeaderOf(res, 'retry-after'), text)
    if (wait === undefined) return { status: 429, text, error: 'HTTP 429(限流,响应未带退避信号)' }
    if (wait > NOTIFY_BACKOFF_MAX_MS) return { status: 429, text, error: `HTTP 429(限流:建议 ${Math.ceil(wait / 1000)}s 后重试——等待值超过就地退避上限 ${NOTIFY_BACKOFF_MAX_MS / 1000}s,如实失败)` }
    await sleep(wait + 25)
    res = await once()
    text = await responseTextOf(res)
    if (statusOf(res) === 429) return { status: 429, text, error: 'HTTP 429(限流:就地退避重试一次后仍被限)' }
  }
  return { status: statusOf(res), text }
}

/**
 * 可选出站代理(env HTTPS_PROXY/HTTP_PROXY):Telegram 官方 API 在 CN 部署必须走代理
 * (本机 api.telegram.org SSL 连接失败 exit 35 实测)。undici ProxyAgent 按运行时可用性
 * 动态解析(计算属性名 import,打包器不解析非字面量 specifier——undici 不进 package.json,
 * 零依赖纪律不变):宿主进程解析不到 undici 时如实退回直连,即「代理仅在可解析 undici 时
 * 生效」;daemon 改代理环境变量后需重启进程才重读(env 注入路径与自愈链交互待核)。
 * HTTPS(CONNECT)代理不看请求 URL,token 在 path 的 telegram 网络面不受影响;HTTP 代理
 * 会看 URL——文档要求配 https:// 形态代理。
 */
let proxyAgentCache: { px: string; agentP: Promise<unknown> } | null = null
async function proxyDispatcher(): Promise<unknown> {
  const px = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  if (px === undefined || px.length === 0) return undefined
  if (proxyAgentCache === null || proxyAgentCache.px !== px) {
    const spec = ['un', 'dici'].join('')
    proxyAgentCache = {
      px,
      agentP: import(spec).then((m) => new (m as { ProxyAgent: new (uri: string) => unknown }).ProxyAgent(px)).catch(() => undefined),
    }
  }
  return await proxyAgentCache.agentP
}

/** fetch init 附加代理 dispatcher(有代理时);dispatcher 不在标准 RequestInit 类型里,结构注入。 */
async function withProxy(init: Record<string, unknown>): Promise<Record<string, unknown>> {
  const d = await proxyDispatcher()
  return d === undefined ? init : { ...init, dispatcher: d }
}

// ---------------------------------------------------------------------------
// 通道一:webhook
// ---------------------------------------------------------------------------

/** webhook 收端超时:慢收端不能挂住调度 tick(与 SMTP 步骤超时同口径)。 */
const WEBHOOK_TIMEOUT_MS = 10_000

/** WebhookChannel 的平台适配选项(normalize 层归一后透传)。 */
export interface WebhookOpts {
  /** generic 平台的 JSON 模板(值级 JSON-safe 注入,渲染后 JSON.parse 校验)。
   * 仅 generic 生效:平台预设(feishu/dingtalk/wecom/telegram)请求形状固定,模板忽略。 */
  template?: string
  /** telegram bot token:官方设计 token 必在 URL path(TLS 网络面安全);存储面已拆独立字段
   * (url 不落 token),send 期由 buildPayload 回拼。错误文案永不回显 URL/token。 */
  telegramToken?: string
  /** telegram 可选 parse_mode(MarkdownV2/HTML/Markdown)。 */
  parseMode?: string
}

/**
 * Webhook 通道:POST JSON {title, body, at} 到任意收端(群机器人自建 webhook 等)。
 * fetch 构造期注入是为了单测桩掉真实网络;成功判定收窄到唯一 200——收端规范各异
 * (301/204/500 各有意义),只认明确成功码,失败带状态码方便排障。
 * 429 显式退避信号(Retry-After 头 / telegram 体 retry_after)走共享有界退避(≤5s 就地重试一次)。
 */
export class WebhookChannel implements NotifyChannel {
  readonly name: string

  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
    private readonly platform: PlatformId = 'generic',
    private readonly opts: WebhookOpts = {},
  ) {
    // name 带主机名:多 webhook 通道时结果日志能区分;URL 非法不在构造期炸(send 里兜)
    let host = ''
    try { host = new URL(url).host } catch { host = '' }
    this.name = platform === 'generic'
      ? (host.length > 0 ? `webhook:${host}` : 'webhook')
      : (host.length > 0 ? `${platform}:${host}` : platform)
  }

  async send(title: string, body: string, vars?: NotifyTemplateVars): Promise<{ ok: boolean; error?: string }> {
    try {
      const at = new Date().toISOString()
      let url = this.url
      let init: { method: 'POST'; headers: Record<string, string>; body: string }
      if (this.platform === 'generic' && this.opts.template !== undefined && this.opts.template.length > 0) {
        // 模板渲染:值级 JSON-safe 注入后必须整体过 JSON.parse——非法即如实失败,不静默回退
        // 固定 payload(宿主 c-ling/dsh-plugin-notify 字符串替换拼坏 JSON 实证 + Gatus
        // 花括号→方括号迁移史:占位符语法与 JSON 本体冲突是同类工具的坑)
        const rendered = renderWebhookTemplate(this.opts.template, { title, body, at, ...vars })
        try { JSON.parse(rendered) } catch {
          return { ok: false, error: 'webhook 模板渲染结果非法 JSON(检查占位符与引号;未静默回退固定 payload)' }
        }
        init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: rendered }
      } else {
        const built = buildPayload(this.platform, this.url, title, body, at, Date.now(), { telegramToken: this.opts.telegramToken, parseMode: this.opts.parseMode })
        url = built.url
        init = built.init
      }
      const sendOnce = async (): Promise<unknown> =>
        this.fetchImpl(url, await withProxy({ ...init, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) }) as RequestInit)
      const r = await postOnceWithBackoff(sendOnce)
      if (r.error !== undefined) return { ok: false, error: r.error }
      const verdict = platformOk(this.platform, r.status, r.text)
      return verdict.ok ? { ok: true } : { ok: false, error: verdict.error ?? `HTTP ${r.status}` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'webhook 发送失败' }
    }
  }
}

// ---------------------------------------------------------------------------
// 通道二:email(原始 SMTP)
// ---------------------------------------------------------------------------

/** SMTP 单步应答:code 为三位状态码;多行应答(250-EXT 续行)已拼进 text。 */
export interface SmtpReply { code: number; text: string }

/**
 * SMTP 会话 seam:把"写命令/读应答"从真实 socket 抽出来,单测注入脚本化假会话,
 * 测试绝不真连邮件服务器。deliver 与 command 分开是 DATA 阶段语义:正文不是命令,
 * 会话层只补流终止符(CRLF.CRLF);CRLF 规整与行首点填充是报文组装方的责任
 * (EmailChannel.wire),放调用方一处做完,任何 deliver 实现都不必重抄一遍。
 */
export interface SmtpSession {
  /** 发送一行命令并读取(可能多行的)应答。 */
  command(line: string): Promise<SmtpReply>
  /** 投递已为线格式的正文(调用方已过 wire)并读取受理应答。 */
  deliver(payload: string): Promise<SmtpReply>
  /** 不发送,仅读取一段应答(连接后的 220 开场用)。 */
  readReply(): Promise<SmtpReply>
  close(): void
}

export type SmtpConnect = (url: URL) => Promise<SmtpSession>

/** 单步超时:与 webhook 同 10s 口径;finally 清定时器,不残留句柄拖住进程退出。 */
const SMTP_STEP_TIMEOUT_MS = 10_000

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`SMTP 应答超时(${ms}ms)`)), ms) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** 会话实现只依赖的最小 socket 形状(结构化 seam:一眼可见用了 socket 的哪些面)。 */
interface LineSocket {
  write(s: string): boolean
  destroy(): void
  setEncoding(enc: string): unknown
  on(ev: 'data', cb: (chunk: string) => void): unknown
  on(ev: 'error', cb: (err: Error) => void): unknown
  on(ev: 'close', cb: () => void): unknown
  once(ev: 'connect', cb: () => void): unknown
  once(ev: 'error', cb: (err: Error) => void): unknown
}

/** 基于真实 socket 的会话实现(生产路径,导出为可单测):按行缓冲、多行应答聚合、断线即拒绝在途等待。 */
export class SocketSession implements SmtpSession {
  private buffer = ''
  private readonly lines: string[] = []
  private readonly waiters: Array<{ resolve: (l: string) => void; reject: (e: Error) => void }> = []
  private dead: Error | null = null

  constructor(private readonly socket: LineSocket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => { this.buffer += chunk; this.pump() })
    socket.on('error', (err: Error) => this.fail(err))
    socket.on('close', () => this.fail(new Error('SMTP 连接已关闭')))
  }

  private pump(): void {
    for (;;) {
      const i = this.buffer.indexOf('\n')
      if (i < 0) break
      const line = this.buffer.slice(0, i).replace(/\r$/, '')
      this.buffer = this.buffer.slice(i + 1)
      const w = this.waiters.shift()
      if (w !== undefined) w.resolve(line)
      else this.lines.push(line)
    }
  }

  private fail(err: Error): void {
    if (this.dead !== null) return
    this.dead = err
    for (const w of this.waiters.splice(0)) w.reject(err)
  }

  private readLine(): Promise<string> {
    const cached = this.lines.shift()
    if (cached !== undefined) return Promise.resolve(cached)
    if (this.dead !== null) return Promise.reject(this.dead)
    return new Promise((resolve, reject) => { this.waiters.push({ resolve, reject }) })
  }

  async readReply(): Promise<SmtpReply> {
    const parts: string[] = []
    for (;;) {
      const line = await withTimeout(this.readLine(), SMTP_STEP_TIMEOUT_MS)
      parts.push(line)
      // 续行是 "NNN-",终行是 "NNN ";不足 4 字符的畸形行按终行处理,防死循环
      if (line.length < 4 || line[3] !== '-') break
    }
    const code = Number(parts[0]?.slice(0, 3))
    return { code: Number.isFinite(code) ? code : 0, text: parts.join(' / ') }
  }

  async command(line: string): Promise<SmtpReply> {
    this.socket.write(`${line}\r\n`)
    return await this.readReply()
  }

  async deliver(payload: string): Promise<SmtpReply> {
    // 载荷已是线格式(CRLF+点填充由调用方 wire 过),这里只补 DATA 流终止符
    this.socket.write(`${payload}\r\n.\r\n`)
    return await this.readReply()
  }

  close(): void {
    try { this.socket.destroy() } catch { /* 已关 */ }
  }
}

/**
 * 真实 SMTP 连接:smtps:// 走隐式 TLS(465 口型),smtp:// 明文(内网中继够用)。
 * 不做 STARTTLS:邮件通道面向"发一条结果通知"的简单场景,公网邮箱服务请配 smtps://。
 */
export const connectSmtp: SmtpConnect = async (url) => {
  const port = url.port.length > 0 ? Number(url.port) : url.protocol === 'smtps:' ? 465 : 25
  const socket: LineSocket = url.protocol === 'smtps:'
    ? tlsConnect({ host: url.hostname, port, servername: url.hostname })
    : netConnect({ host: url.hostname, port })
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('error', (err: Error) => reject(err))
    }), SMTP_STEP_TIMEOUT_MS)
  } catch (e) {
    // 评审 LOW:超时/连接失败的 socket 不 destroy 会泄漏——常驻进程里累积 pending 句柄
    try { socket.destroy() } catch { /* 已关 */ }
    throw e
  }
  return new SocketSession(socket)
}

/** URL userinfo 里的 %xx 转义解码(@ 写作 %40);畸形转义不炸,原样返回。 */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/**
 * 邮件通道(原始 SMTP,未引 nodemailer:全功能邮件库对"发一条结果通知"太重,
 * 原始对话足够)。URL 形如
 *   smtps://user%40ex.com:apppass@smtp.ex.com:465?from=user%40ex.com
 * 用户名/密码在 userinfo(AUTH LOGIN);from 可用查询参数覆盖,缺省取用户名。
 */
export class EmailChannel implements NotifyChannel {
  readonly name: string

  constructor(
    private readonly smtpUrl: string,
    private readonly to: string,
    private readonly connect: SmtpConnect = connectSmtp,
  ) {
    let host = ''
    try { host = new URL(smtpUrl).hostname } catch { host = '' }
    this.name = host.length > 0 ? `email:${host}` : 'email'
  }

  async send(title: string, body: string): Promise<{ ok: boolean; error?: string }> {
    let url: URL
    // URL 解析失败不回显原文:smtpUrl 的 userinfo 段是用户名/授权码(泄漏链:notify-test
    // 把 error 原样拼进面板返回值)。与通道 name 只取 hostname 的既有纪律同款,只给形态指引
    try { url = new URL(this.smtpUrl) } catch { return { ok: false, error: 'SMTP URL 非法:需 smtp://user:pass@host[:port] 或 smtps://… 形态(URL 原文不回显,防凭据泄漏)' } }
    let sess: SmtpSession
    try { sess = await this.connect(url) } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'SMTP 连接失败' }
    }
    try {
      const accepted = (r: SmtpReply): boolean => r.code >= 200 && r.code < 300
      const greet = await sess.readReply() // 服务器开场 220
      if (greet.code !== 220) throw new Error(`SMTP 开场异常:${greet.code}`)
      const ehlo = await sess.command('EHLO dsh-opencli')
      if (ehlo.code !== 250) throw new Error(`EHLO 被拒:${ehlo.code}`)
      const user = url.username.length > 0 ? safeDecode(url.username) : ''
      if (user.length > 0) {
        // AUTH LOGIN 三步:用户名/密码各自 base64(服务器提示 334 要的是 base64 形态)
        const a1 = await sess.command(`AUTH LOGIN ${Buffer.from(user, 'utf8').toString('base64')}`)
        if (a1.code !== 334) throw new Error(`AUTH LOGIN 被拒:${a1.code}`)
        const a2 = await sess.command(Buffer.from(safeDecode(url.password), 'utf8').toString('base64'))
        if (a2.code !== 235) throw new Error(`SMTP 认证失败:${a2.code}`)
      }
      const from = this.fromAddress(url)
      const mf = await sess.command(`MAIL FROM:<${from}>`)
      if (!accepted(mf)) throw new Error(`MAIL FROM 被拒:${mf.code}`)
      const rc = await sess.command(`RCPT TO:<${this.to}>`)
      if (!accepted(rc)) throw new Error(`RCPT TO 被拒:${rc.code}`)
      const da = await sess.command('DATA')
      if (da.code !== 354) throw new Error(`DATA 被拒:${da.code}`)
      const fin = await sess.deliver(this.wire(this.message(title, body, from)))
      if (!accepted(fin)) throw new Error(`正文被拒:${fin.code}`)
      try { await sess.command('QUIT') } catch { /* 服务器抢先断开不算失败:邮件已被受理 */ }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'SMTP 发送失败' }
    } finally {
      sess.close()
    }
  }

  /** 发件地址:from 查询参数 > userinfo 用户名 > 兜底 localhost(内网中继只看 envelope,不校验域名)。 */
  private fromAddress(url: URL): string {
    const q = url.searchParams.get('from')
    if (q !== null && q.includes('@')) return q
    const u = url.username.length > 0 ? safeDecode(url.username) : ''
    if (u.includes('@')) return u
    if (u.length > 0) return `${u}@${url.hostname}`
    return 'dsh-opencli@localhost'
  }

  /** DATA 线格式:行尾统一 CRLF;行首句点加倍(RFC 5321 4.5.2)——否则被当作流结束符把正文截断。 */
  private wire(msg: string): string {
    return msg.replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..')
  }

  /** 组装 RFC 5322 报文:非 ASCII 标题走 B 编码(裸 UTF-8 Subject 在老客户端乱码);正文 UTF-8。 */
  private message(title: string, body: string, from: string): string {
    const subject = /[^\x00-\x7F]/.test(title)
      ? `=?UTF-8?B?${Buffer.from(title, 'utf8').toString('base64')}?=`
      : title
    return [
      `From: ${from}`,
      `To: ${this.to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\n')
  }
}

// ---------------------------------------------------------------------------
// 通道三:dsh 面板
// ---------------------------------------------------------------------------

/**
 * dsh 面板通道:通知进 ingest 事件流,与调度失败/watch 命中共用同一条面板时间线
 * (IngestEvent 同款形状,kind 用 'notify' 区分)。emit 由接线方注入——本模块拿不到
 * OpencliService 私有的 ingestEventList,注入 sink 保持解耦(单测也由此可桩)。
 */
export class DshNotifyChannel implements NotifyChannel {
  readonly name = 'dsh'

  constructor(private readonly emit: (ev: IngestEvent) => void) {}

  async send(title: string, body: string): Promise<{ ok: boolean }> {
    this.emit({ at: new Date().toISOString(), kind: 'notify', text: `${title}\n${body}` })
    return { ok: true }
  }
}

// ---------------------------------------------------------------------------
// 通道四~六:push 类预设(bark / ntfy / pushover)
// ---------------------------------------------------------------------------

/** push 类通道收端超时:与 webhook 同 10s 口径(慢收端不能挂住调度 tick)。 */
const PUSH_TIMEOUT_MS = WEBHOOK_TIMEOUT_MS

/**
 * Bark 通道(iOS push,自host 友好):POST {server}/push + JSON 体——官方 V2 主推形态
 * (API_V2.md「users should use the new REST API」),device_key 在请求体不进 URL。GET 形态
 * 的 key+内容全在 path(反代/服务端访问日志可见),而 SCRUB_RULES 只洗 query 不覆盖 path 段
 * ——「凭据不进请求 URL」是纪律不是可选项。响应体形状官方未载(待核):按 HTTP 200 判定,
 * body code==200 作增强校验、code 非 200 时如实报错(200 但非 JSON 按送达,不误杀)。
 * 端到端加密(官方 encryption.md,AES-128-CBC)做参数透传不强推:ciphertext 给出时以密文体
 * 发送(title/body 不再明文出现,iv 随参数外传);密钥只在用户 App 内配置,本侧不持有。
 */
export class BarkChannel implements NotifyChannel {
  readonly name: string

  constructor(
    private readonly serverUrl: string,
    private readonly deviceKey: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
    private readonly opts: { group?: string; level?: string; sound?: string; ciphertext?: string; iv?: string } = {},
  ) {
    // name 只取 host:结果日志能区分多通道,且不回显凭据(与 WebhookChannel 构造纪律同款)
    let host = ''
    try { host = new URL(serverUrl).host } catch { host = '' }
    this.name = host.length > 0 ? `bark:${host}` : 'bark'
  }

  async send(title: string, body: string): Promise<{ ok: boolean; error?: string }> {
    let base: URL
    // URL 解析失败不回显原文(泄漏链:notify-test 把 error 原样拼进面板返回值,EmailChannel 同款纪律)
    try { base = new URL(this.serverUrl) } catch { return { ok: false, error: 'Bark 服务器 URL 非法:需 https://<host> 形态(URL 原文不回显,防凭据泄漏)' } }
    const encrypted = this.opts.ciphertext !== undefined && this.opts.ciphertext.length > 0
    const bodyObj: Record<string, unknown> = encrypted
      ? { device_key: this.deviceKey, ciphertext: this.opts.ciphertext, ...(this.opts.iv !== undefined && this.opts.iv.length > 0 ? { iv: this.opts.iv } : {}) }
      : {
          device_key: this.deviceKey,
          title,
          body,
          ...(this.opts.group !== undefined ? { group: this.opts.group } : {}),
          ...(this.opts.level !== undefined ? { level: this.opts.level } : {}),
          ...(this.opts.sound !== undefined ? { sound: this.opts.sound } : {}),
        }
    // 自host 反代子路径保留(https://ex.com/bark → POST /bark/push);官方形态根路径 → /push
    const target = new URL(`${base.pathname.replace(/\/+$/, '')}/push`, base).toString()
    const sendOnce = async (): Promise<unknown> =>
      this.fetchImpl(target, await withProxy({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj), signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) }) as RequestInit)
    try {
      const r = await postOnceWithBackoff(sendOnce)
      if (r.error !== undefined) return { ok: false, error: r.error }
      if (r.status !== 200) return { ok: false, error: `HTTP ${r.status}` }
      try {
        const j = JSON.parse(r.text) as { code?: unknown }
        if (j.code !== undefined && Number(j.code) !== 200) return { ok: false, error: `bark code ${String(j.code)}` }
      } catch { /* 200 但非 JSON:响应形状官方未载,按送达 */ }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'bark 发送失败' }
    }
  }
}

/**
 * ntfy 通道(self-host topics):根路径 JSON publishing——topic 进请求体不进 URL
 * (publish.md 逐字:「the topic is essentially a password」,PUT/POST /<topic> 形态把密码
 * 放 URL path,中转/日志面可见;JSON publishing 是凭据面最优形态)。认证走
 * Authorization: Bearer 头(access token,tk_ 前缀),不做 ?auth= query 兜底(头不可用的
 * 场景本通道也不该发)。成功判定 HTTP 200;消息体官方上限 4096 字节(我方正文 ≤500 天然兼容),
 * 超限服务端自动转附件,不在此截断。优先级 1-5 缺省 3(default)。
 */
export class NtfyChannel implements NotifyChannel {
  readonly name: string

  constructor(
    private readonly serverUrl: string,
    private readonly topic: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
    private readonly opts: { token?: string; priority?: number } = {},
  ) {
    let host = ''
    try { host = new URL(serverUrl).host } catch { host = '' }
    this.name = host.length > 0 ? `ntfy:${host}` : 'ntfy'
  }

  async send(title: string, body: string): Promise<{ ok: boolean; error?: string }> {
    let base: URL
    try { base = new URL(this.serverUrl) } catch { return { ok: false, error: 'ntfy 服务器 URL 非法:需 https://<host> 形态(URL 原文不回显,topic 即密码)' } }
    const bodyObj: Record<string, unknown> = { topic: this.topic, title, message: body, priority: this.opts.priority ?? 3, tags: ['bell'] }
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.opts.token !== undefined && this.opts.token.length > 0) headers.authorization = `Bearer ${this.opts.token}`
    // 自host 子路径保留并补尾斜杠(https://ex.com/ntfy → POST /ntfy/;官方根路径 → POST /)
    const target = new URL(`${base.pathname.replace(/\/+$/, '')}/`, base).toString()
    const sendOnce = async (): Promise<unknown> =>
      this.fetchImpl(target, await withProxy({ method: 'POST', headers, body: JSON.stringify(bodyObj), signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) }) as RequestInit)
    try {
      const r = await postOnceWithBackoff(sendOnce)
      if (r.error !== undefined) return { ok: false, error: r.error }
      return r.status === 200 ? { ok: true } : { ok: false, error: `HTTP ${r.status}` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'ntfy 发送失败' }
    }
  }
}

/** pushover 官方端点(固定;HTTPS 必须,凭据走 POST body 官方明示「never as URL query parameters」)。 */
const PUSHOVER_ENDPOINT = 'https://api.pushover.net/1/messages.json'

/**
 * Pushover 通道(国际面):五通道中凭据面最干净——token/user 全在 POST body。success =
 * HTTP 200 {status:1};4xx {status:0, errors:[…]} 服务端文案如实透传(字段名级,不含凭据);
 * 429 月配额(免费 1 万条/月)走共享有界退避,无 Retry-After 时如实报错。emergency
 * priority=2 需 retry/expire 无界等待,与旁路纪律冲突,normalize 层拒收(不开放)。
 */
export class PushoverChannel implements NotifyChannel {
  readonly name = 'pushover:api.pushover.net'

  constructor(
    private readonly token: string,
    private readonly user: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
    private readonly opts: { device?: string; priority?: number; sound?: string } = {},
  ) {}

  async send(title: string, body: string): Promise<{ ok: boolean; error?: string }> {
    const bodyObj: Record<string, unknown> = {
      token: this.token,
      user: this.user,
      title,
      message: body,
      ...(this.opts.device !== undefined ? { device: this.opts.device } : {}),
      ...(this.opts.priority !== undefined ? { priority: this.opts.priority } : {}),
      ...(this.opts.sound !== undefined ? { sound: this.opts.sound } : {}),
    }
    const sendOnce = async (): Promise<unknown> =>
      this.fetchImpl(PUSHOVER_ENDPOINT, await withProxy({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj), signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) }) as RequestInit)
    try {
      const r = await postOnceWithBackoff(sendOnce)
      if (r.error !== undefined) return { ok: false, error: r.error }
      if (r.status !== 200) return { ok: false, error: `HTTP ${r.status}` }
      try {
        const j = JSON.parse(r.text) as { status?: unknown; errors?: unknown }
        if (j.status !== 1) {
          const errs = Array.isArray(j.errors) ? j.errors.map(String).join(';') : 'status!=1'
          return { ok: false, error: `pushover: ${errs}` }
        }
      } catch { /* 200 但非 JSON:按送达 */ }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'pushover 发送失败' }
    }
  }
}

// ---------------------------------------------------------------------------
// webhook 模板(值级 JSON-safe 注入)与 URL path 凭据拆解
// ---------------------------------------------------------------------------

/** webhook 模板长度上限(normalize 超长丢弃;与 ntfy 消息体官方上限同量级)。 */
export const NOTIFY_TEMPLATE_MAX = 4096

/** 模板内置变量白名单(闭集):{{key}} 只认这七个——全部来自已 scrub 的 buildNotifyBody/调度段;
 * 白名单外的占位符原样保留(不猜测补全,黑箱执行是红线)。 */
const TEMPLATE_VAR_KEYS: readonly string[] = ['title', 'body', 'at', 'ok', 'site', 'source', 'watchHits']

/**
 * 值级 JSON-safe 注入:字符串值 {{key}} → JSON.stringify(value).slice(1, -1)——值变成 JSON
 * 字符串字面量的「内容」(引号/换行自动转义),模板怎么拼都不会产出非法 JSON(宿主
 * c-ling/dsh-plugin-notify 增补 {{json:key}} 的同语义;Gatus 花括号→方括号迁移史是占位符
 * 与 JSON 冲突的第二独立证据)。非字符串值(ok 布尔/watchHits 数组)整值注入 JSON 字面量
 * (true / ["a","b"]——slice 口径会把 true 吃成 ru,字符串/非字符串必须分型)。
 * 白名单外的 {{…}} 原样保留;变量缺席(notify-test 未给 ok)渲染为空串——模板强依赖缺席
 * 变量时会渲染出非法 JSON,由渲染后的 JSON.parse 校验如实报错,不静默回退。不引模板引擎
 * (notify.ts 零依赖纪律,Uptime Kuma Liquid 是反面教材)。
 */
export function renderWebhookTemplate(tpl: string, vars: { title: string; body: string; at: string } & NotifyTemplateVars): string {
  const bag = vars as unknown as Record<string, unknown>
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => {
    if (!TEMPLATE_VAR_KEYS.includes(key)) return m
    const v = bag[key]
    if (v === undefined || v === null) return ''
    return typeof v === 'string' ? JSON.stringify(v).slice(1, -1) : JSON.stringify(v)
  })
}

/**
 * 拆 URL 最后一段非空路径(bark 官方分享形态 https://api.day.app/<key>、ntfy 形态
 * https://ntfy.sh/<topic>):返回去掉该段的 base 与该段原文;无路径段时 credential 为
 * undefined。存储面拆解(§九.1 跨通道必答题:凭据不随 URL 落 state.json),send 期也绝不
 * 回拼进 URL。URL 非法时原样返回(由通道 send 期如实报错)。
 */
export function splitTrailingPathSegment(raw: string): { base: string; credential?: string } {
  let u: URL
  try { u = new URL(raw) } catch { return { base: raw } }
  const trimmed = u.pathname.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  const last = i >= 0 ? trimmed.slice(i + 1) : ''
  if (last.length === 0) return { base: `${u.origin}${u.search}`.replace(/\/+$/, '') }
  return { base: `${u.origin}${i > 0 ? trimmed.slice(0, i) : ''}${u.search}`.replace(/\/+$/, ''), credential: last }
}

/**
 * 拆 telegram 官方形态 URL 的 bot token(path 段 bot<token>,官方设计 token 必在 path):
 * 返回去掉 bot 段的 base 与 token,send 期由 buildPayload 重组(TLS 网络面安全;存储面/
 * 面板回显/错误文案三面不落 token)。无 bot 段(非 telegram 形态)原样返回。URL 非法原样返回。
 */
export function splitTelegramBotUrl(raw: string): { base: string; token?: string } {
  let u: URL
  try { u = new URL(raw) } catch { return { base: raw } }
  const segs = u.pathname.split('/').filter((s) => s.length > 0)
  const bi = segs.findIndex((s) => /^bot(.+)$/.test(s))
  if (bi < 0) return { base: raw }
  const token = /^bot(.+)$/.exec(segs[bi]!)![1]!
  const rest = segs.filter((_, idx) => idx !== bi)
  return { base: `${u.origin}${rest.length > 0 ? `/${rest.join('/')}` : ''}${u.search}`.replace(/\/+$/, ''), token }
}

// ---------------------------------------------------------------------------
// 出口清洗与正文组装
// ---------------------------------------------------------------------------

/**
 * 出口清洗规则:移除本机路径与凭据,替换为占位符(占位符保留可读性,排障时还能看出
 * "这里原本有个路径/令牌")。规则顺序有意义:先路径后令牌,路径占位符是中文不会再被
 * 令牌规则误吃。字符集取可打印 ASCII,天然停在 CJK 前——"C:\a 的报告"只吃 "C:\a ",
 * 中文内容不陪葬。
 */
const SCRUB_RULES: Array<{ re: RegExp; to: string }> = [
  // URL 敏感查询参数(回执/轨迹卫生,借 playwright-mcp --redact-url-params 同款默认值):
  // token/access_token/sid/code/key/secret/session/signature 等参数值一律脱敏——分享的
  // 链接里 ?token=… / ?code=… 是最常见的凭据外流通道,字段名保留(排障可读),值抹掉。
  // 置于最前:先于 hex/base64 规则,避免长 token 先被整段吃掉导致字段名也消失。
  // 值的终止符含引号/尖括号/反斜杠/右括号:快照 stdout 是 JSON(URL 在字符串里,止于 ")、
  // 也有 markdown 链接 (url) 与 HTML 属性——只认 &/空白会一路吞到行尾,把相邻 JSON 对象
  // 静默并成一个(当场复现的数据损坏),diff/漂移判定/CSV 导出全被带坏
  { re: /([?&](?:access_token|auth|auth_token|code|key|secret|session(?:_key|_id)?|sid|sig|signature|ticket|token)=)[^&\s#"'<>\\)]*/gi, to: '$1[已脱敏]' },
  // Windows 绝对路径(C:\Users\<用户名>\… / D:/x/y)。lookbehind 只挡词字符紧邻(https://
  // 的单字母候选前面必是词字符,天然挡住);冒号不豁免——"路径:C:\Users\x" 里的路径照样清洗
  // (旧版 (?<![\w:]) 让 ASCII 冒号后的整段本机路径漏洗,已修正)
  { re: /(?<!\w)[A-Za-z]:[\\/][ -~]*/g, to: '[本地路径]' },
  // 波浪 home 路径(~/.dsh/…、~\…)
  { re: /~[\\/][ -~]*/g, to: '[home路径]' },
  // unix 风格 home(Linux/macOS);系统目录(/tmp /var 等)不扫——通知里出现它们的语义无害
  { re: /(?:\/home\/|\/Users\/)[ -~]*/g, to: '[home路径]' },
  // 键值形态的令牌(Bearer/token=…/api_key:…):保留字段名,值抹掉。(?!\[) 跳过已是占位符的值——
  // URL 参数规则先把 ?token=X 洗成 ?token=[已脱敏],本规则若再吃进 '[' 会产出 "[已移除]已脱敏]"
  // 残文(两规则共存的双重清洗冲突,当场复现后修正)
  { re: /\b(Bearer|token|apikey|api_key|api-key|secret|password|passwd)([ \t]*[:=][ \t]*)(?!\[)[!-~]+/gi, to: '$1$2[已移除]' },
  // 裸 Bearer 头(Authorization: Bearer xxx 形态,Bearer 与值之间没有冒号)
  { re: /(?<![A-Za-z0-9_-])Bearer[ \t]+[!-~]+/gi, to: 'Bearer [已移除]' },
  // 具名密钥前缀(openai sk-、github ghp_/gho_ 下划线形态、slack xox*、google ya29):
  // 不在键值对里也绝不能外流;分隔符 [-_] 兼容——github 官方真实格式是 ghp_ 下划线,
  // 旧规则只认连字符,真实 token 反而漏洗(已修正)
  { re: /\b(?:sk|ghp|gho|xoxb|xoxp|ya29)[-_][A-Za-z0-9_-]{8,}/g, to: '[已移除]' },
  // 32+ 位连续 hex(sha256/会话 id);40+ 位 base64 形态 blob——长随机串一律按凭据对待
  { re: /\b[0-9a-fA-F]{32,}\b/g, to: '[已移除]' },
  { re: /\b[A-Za-z0-9+/]{40,}={0,2}/g, to: '[已移除]' },
]

/** 通知正文出口清洗:所有通道发送前必须过这一道(buildNotifyBody 已内置,手工拼正文时单独调用)。 */
export function scrubLocalPaths(text: string): string {
  let out = text
  for (const r of SCRUB_RULES) out = out.replace(r.re, r.to)
  return out
}

/**
 * URL 敏感查询参数脱敏(回执/轨迹卫生;与出口清洗同 scrub 体系,单规则复用):
 * 回执摘要/轨迹行/轨迹报告在**落盘侧**也过这道——通知出口本来就会洗,但 traces/snapshots
 * 是本地落盘文件,复盘时被复制粘贴进聊天/issue 的场景同样泄凭据(playwright-mcp
 * --redact-url-params 同款默认值口径)。字段名保留、值替换,排障可读性不丢。
 */
export function scrubUrlParams(text: string): string {
  return text.replace(SCRUB_RULES[0]!.re, SCRUB_RULES[0]!.to)
}

/** buildNotifyBody 的调度侧输入(只取通知需要的字段,与 PluginState.schedules 条目形状兼容)。 */
export interface NotifyScheduleInfo {
  /** 站点命令(如 site zhihu hot;标题里截前两个词当站点名)。 */
  site: string
  /** watch 关键词配置(正文提示用)。 */
  watch?: string
  /** 任务来源标记(agent/chat/panel/ctl——推送卡任务身份行,BrowserSkill Controller identity 同款)。 */
  source?: string
}

/** 一次执行的结果侧输入(与 runHistory 条目同源,另带 watch 命中与报告路径)。 */
export interface NotifyResultInfo {
  ok: boolean
  /** 结果摘要(执行输出前缀;存储侧也可能带进路径,这里再洗一遍)。 */
  summary?: string
  /** 本轮 watch 命中的关键词。 */
  watchHits?: string[]
  /** 报告文件路径——通知里只放文件名,目录部分是本机信息(安全边界)。 */
  reportPath?: string
}

/** 通知正面上限:超长截断(收端对长度各有上限,500 字以内通吃;日结早报 compact 卡同口径复用)。 */
export const NOTIFY_BODY_MAX = 500

/**
 * 组装通知:标题含站点+时间,正文含结果 ok/fail、watch 命中、报告文件名,≤500 字。
 * 报告路径只取 basename:完整路径泄露用户目录结构;跨平台分隔符手写分词,
 * path.basename 只认当前平台的分隔符。title/body 都过 scrub——调用方没有"忘了洗"的口子。
 */
export function buildNotifyBody(
  schedule: NotifyScheduleInfo,
  result: NotifyResultInfo,
  at: Date = new Date(),
): { title: string; body: string } {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
  // 面板占位符是 'site zhihu hot' 形态:剥掉 site 前缀取「站点 命令」两个词(runSiteCommand 同款归一)
  const norm = schedule.site.replace(/^\s*site\s+/i, '').trim()
  const siteHead = norm.split(/\s+/).slice(0, 2).join(' ')
  const title = scrubLocalPaths(`[dsh-opencli] ${siteHead} ${time}`)
  const lines: string[] = [`结果:${result.ok ? '成功' : '失败'}`]
  // 任务身份行(回执/轨迹卫生,BrowserSkill Controller identity 同款):无人值守推送卡写明
  // "哪个任务/谁建的"——同站多任务(不同参数/不同来源)在群里收到时可分拣,不必回面板对照
  lines.push(`任务:${norm}${schedule.source !== undefined && schedule.source.length > 0 ? ` · 来源 ${schedule.source}` : ''}`)
  if (result.watchHits !== undefined && result.watchHits.length > 0) lines.push(`Watch 命中:${result.watchHits.join(', ')}`)
  if (result.summary !== undefined && result.summary.length > 0) lines.push(`摘要:${result.summary}`)
  if (result.reportPath !== undefined && result.reportPath.length > 0) {
    const base = result.reportPath.split(/[\\/]/).filter((s) => s.length > 0).pop() ?? result.reportPath
    lines.push(`报告:${base}`)
  }
  let body = scrubLocalPaths(lines.join('\n'))
  if (body.length > NOTIFY_BODY_MAX) body = `${body.slice(0, NOTIFY_BODY_MAX - 1)}…`
  return { title, body }
}

// ---------------------------------------------------------------------------
// 配置持久化(state.json 的 notifyConfig 段)
// ---------------------------------------------------------------------------

/**
 * 单条通道配置。type 决定必填字段:webhook 要 url;email 要 url(SMTP)+ to;dsh 无参;
 * bark 要 url(服务器)+ deviceKey(可由 URL path 拆出);ntfy 要 url + topic(可拆);
 * pushover 要 token + user(端点官方固定,无 url)。凭据类字段(deviceKey/topic/token/
 * user/telegramToken)永不进 send 期请求 URL(见类注释),存储面为独立字段而非 URL path。
 */
export interface NotifyChannelConfig {
  type: 'webhook' | 'email' | 'dsh' | 'bark' | 'ntfy' | 'pushover'
  /** webhook 的平台预设(0.4.6 D):不填按 URL 推断,推断不出走 generic */
  platform?: 'generic' | 'feishu' | 'dingtalk' | 'wecom' | 'telegram'
  /** webhook 收端地址 / email 的 SMTP URL / bark·ntfy 的服务器地址(凭据段已在归一时拆出)。 */
  url?: string
  /** email 收件人。 */
  to?: string
  /** bark device_key(凭据;POST /push JSON 体,不进 URL)。 */
  deviceKey?: string
  /** ntfy topic(topic 即密码,进 body 不进 URL)。 */
  topic?: string
  /** ntfy access token(Bearer 头)/ pushover app token(POST 体)。 */
  token?: string
  /** pushover user key(POST 体)。 */
  user?: string
  /** telegram bot token:官方 URL path 必带,存储面拆出独立字段(url 不落 token),send 期回拼。 */
  telegramToken?: string
  /** telegram 可选 parse_mode(MarkdownV2/HTML/Markdown 白名单)。 */
  parseMode?: string
  /** webhook(generic)JSON 模板:值级 JSON-safe 注入,渲染后 JSON.parse 校验,非法如实失败不回退。 */
  template?: string
  /** bark 可选透传参数(官方 API_V2)。 */
  group?: string
  level?: string
  sound?: string
  /** bark 端到端加密透传(AES-128-CBC,官方 encryption.md;ciphertext+iv,密钥留在用户 App)。 */
  ciphertext?: string
  iv?: string
  /** ntfy 优先级 1-5(缺省 3)/ pushover -2..1(emergency 2 需无界等待,不开放)。 */
  priority?: number
  /** pushover 目标设备名(可选)。 */
  device?: string
  enabled: boolean
}

export interface NotifyConfig {
  channels: NotifyChannelConfig[]
}

const BARK_LEVELS: readonly string[] = ['critical', 'active', 'timeSensitive', 'passive']
const TELEGRAM_PARSE_MODES: readonly string[] = ['MarkdownV2', 'HTML', 'Markdown']

/** 有界字符串:非空且 ≤max 才收(配置白名单纪律:超长/非串按未提供处理,不截断不猜)。 */
const boundedStr = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined

/** 有界整数(优先级类字段):越界/非整按未提供处理。 */
const boundedInt = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined

/** telegram host 判定(平台推断同源:归一层在拆 token 时顺带把 platform 落成显式 telegram)。 */
const isTelegramHost = (url: string): boolean => {
  try { return /(^|\.)telegram\.org$/.test(new URL(url).hostname) } catch { return false }
}

/**
 * 配置归一化:state.json 是用户可手改的文件,读进来先过白名单——未知 type、非字符串
 * url/to 整条丢弃而不是抛错,通知是旁路,坏一条配置不能废掉整个加载(loadState 同款容错)。
 * 凭据拆解(0.1.4 候选 1):bark/ntfy 的 URL path 凭据段与 telegram 的 bot<token> 段在此
 * 拆成独立字段、原始 URL 以无凭据形态落盘——用户按官方习惯粘贴的 URL 不泄漏凭据到
 * 存储面,面板回显只出遮蔽摘要(redact.ts describeNotifyChannel)。幂等:已拆形态再过
 * 一遍无变化。
 */
export function normalizeNotifyConfig(raw: unknown): NotifyConfig {
  if (raw === null || typeof raw !== 'object') return { channels: [] }
  const list = (raw as { channels?: unknown }).channels
  if (!Array.isArray(list)) return { channels: [] }
  const channels: NotifyChannelConfig[] = []
  for (const c of list) {
    if (c === null || typeof c !== 'object') continue
    const o = c as Record<string, unknown>
    if (o.type !== 'webhook' && o.type !== 'email' && o.type !== 'dsh' && o.type !== 'bark' && o.type !== 'ntfy' && o.type !== 'pushover') continue
    const type = o.type
    const enabled = o.enabled === true
    const platform = o.platform === 'feishu' || o.platform === 'dingtalk' || o.platform === 'wecom' || o.platform === 'telegram' || o.platform === 'generic' ? o.platform : undefined
    let url = boundedStr(o.url, 2048)
    if (type === 'bark') {
      let deviceKey = boundedStr(o.deviceKey, 256)
      if (url !== undefined && deviceKey === undefined) {
        // 官方分享形态 https://api.day.app/<key>:拆出 device_key,URL 存无凭据 base
        const s = splitTrailingPathSegment(url)
        url = s.base
        deviceKey = s.credential
      }
      const group = boundedStr(o.group, 64)
      const level = o.level !== undefined && BARK_LEVELS.includes(o.level as string) ? (o.level as (typeof BARK_LEVELS)[number]) : undefined
      const sound = boundedStr(o.sound, 64)
      const ciphertext = boundedStr(o.ciphertext, 4096)
      const iv = boundedStr(o.iv, 64)
      channels.push({
        type, enabled, ...(url !== undefined ? { url } : {}), ...(deviceKey !== undefined ? { deviceKey } : {}),
        ...(group !== undefined ? { group } : {}),
        ...(level !== undefined ? { level } : {}),
        ...(sound !== undefined ? { sound } : {}),
        ...(ciphertext !== undefined ? { ciphertext } : {}),
        ...(iv !== undefined ? { iv } : {}),
      })
    } else if (type === 'ntfy') {
      let topic = boundedStr(o.topic, 256)
      if (url !== undefined && topic === undefined) {
        // https://ntfy.sh/<topic>:topic 即密码,拆出独立字段
        const s = splitTrailingPathSegment(url)
        url = s.base
        topic = s.credential
      }
      const token = boundedStr(o.token, 256)
      const priority = boundedInt(o.priority, 1, 5)
      channels.push({
        type, enabled, ...(url !== undefined ? { url } : {}), ...(topic !== undefined ? { topic } : {}),
        ...(token !== undefined ? { token } : {}),
        ...(priority !== undefined ? { priority } : {}),
      })
    } else if (type === 'pushover') {
      // 端点官方固定:不接受 url(配置里给了也丢,凭据面最干净的通道没有自host)
      const token = boundedStr(o.token, 64)
      const user = boundedStr(o.user, 64)
      const device = boundedStr(o.device, 64)
      const priority = boundedInt(o.priority, -2, 1)
      const sound = boundedStr(o.sound, 64)
      channels.push({
        type, enabled,
        ...(token !== undefined ? { token } : {}),
        ...(user !== undefined ? { user } : {}),
        ...(device !== undefined ? { device } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(sound !== undefined ? { sound } : {}),
      })
    } else {
      // webhook:telegram token 拆解(显式 platform 或官方 host);query(chat=、钉钉 secret=)不属
      // path 凭据,维持原状(scrub 链对 query 覆盖,存储面口径与既有版本一致)
      let telegramToken = boundedStr(o.telegramToken, 256)
      let effPlatform = platform
      if (url !== undefined && telegramToken === undefined && (platform === 'telegram' || (platform === undefined && isTelegramHost(url)))) {
        const s = splitTelegramBotUrl(url)
        if (s.token !== undefined) {
          url = s.base
          telegramToken = s.token
          effPlatform = 'telegram'
        }
      }
      const to = boundedStr(o.to, 320)
      const template = boundedStr(o.template, NOTIFY_TEMPLATE_MAX)
      const parseMode = o.parseMode !== undefined && TELEGRAM_PARSE_MODES.includes(o.parseMode as string) ? (o.parseMode as (typeof TELEGRAM_PARSE_MODES)[number]) : undefined
      channels.push({
        type, enabled, ...(url !== undefined ? { url } : {}), ...(to !== undefined ? { to } : {}),
        ...(effPlatform !== undefined ? { platform: effPlatform } : {}),
        ...(telegramToken !== undefined ? { telegramToken } : {}),
        ...(parseMode !== undefined ? { parseMode } : {}),
        ...(template !== undefined ? { template } : {}),
      })
    }
  }
  return { channels }
}

/** 读 state.json 的 notifyConfig 段;文件缺失/损坏/无该键一律空配置。 */
export async function loadNotifyConfig(statePath: string): Promise<NotifyConfig> {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8')) as { notifyConfig?: unknown } | null
    return normalizeNotifyConfig(parsed?.notifyConfig)
  } catch { return { channels: [] } }
}

/** 原子写临时文件序号(同毫秒并发防自撞,与 saveState 同款)。 */
let notifyTmpSeq = 0

/**
 * 写 state.json 的 notifyConfig 段——经调用方的 saveState 统一写入,不在这一层做独立
 * 读-改-写(评审 MEDIUM:saveState 全量重写同文件,读-改-写的窗口会被调度 tick 覆盖)。
 * 这里的职责收缩为:校验+归一化配置;文件写入由调用方管。
 */
export function normalizeNotifyConfigForSave(config: unknown): NotifyConfig {
  return normalizeNotifyConfig(config)
}

/** @deprecated 请用 normalizeNotifyConfigForSave + 调用方 saveState() */
export async function saveNotifyConfig(statePath: string, config: NotifyConfig): Promise<void> {
  void statePath; void config // 写入由调用方统一管,保留签名避免 import 炸
}

// ---------------------------------------------------------------------------
// 装配与群发
// ---------------------------------------------------------------------------

/**
 * 配置 → 通道实例:enabled=false 或必填字段缺失的条目跳过而不是炸(坏一条配置不能
 * 废掉整条通知链)。emit 是 dsh 面板通道的事件入口,由接线方注入。
 */
export function buildNotifyChannels(config: NotifyConfig, opts: { emit: (ev: IngestEvent) => void }): NotifyChannel[] {
  const out: NotifyChannel[] = []
  for (const c of config.channels) {
    if (!c.enabled) continue
    if (c.type === 'webhook' && c.url !== undefined) out.push(new WebhookChannel(c.url, globalThis.fetch.bind(globalThis), platformOf(c.url, c.platform), { template: c.template, telegramToken: c.telegramToken, parseMode: c.parseMode }))
    else if (c.type === 'email' && c.url !== undefined && c.to !== undefined) out.push(new EmailChannel(c.url, c.to))
    else if (c.type === 'dsh') out.push(new DshNotifyChannel(opts.emit))
    else if (c.type === 'bark' && c.url !== undefined && c.deviceKey !== undefined) out.push(new BarkChannel(c.url, c.deviceKey, globalThis.fetch.bind(globalThis), { group: c.group, level: c.level, sound: c.sound, ciphertext: c.ciphertext, iv: c.iv }))
    else if (c.type === 'ntfy' && c.url !== undefined && c.topic !== undefined) out.push(new NtfyChannel(c.url, c.topic, globalThis.fetch.bind(globalThis), { token: c.token, priority: c.priority }))
    else if (c.type === 'pushover' && c.token !== undefined && c.user !== undefined) out.push(new PushoverChannel(c.token, c.user, globalThis.fetch.bind(globalThis), { device: c.device, priority: c.priority, sound: c.sound }))
  }
  return out
}

/**
 * 群发:所有通道并发尝试,单通道失败不影响其他(返回逐通道结果供日志/审计)。
 * 正文请先用 buildNotifyBody 组装(那里已统一 scrub),这里不再二次清洗。
 * vars 是 webhook 模板渲染的调度侧变量(可选;其余通道忽略)。
 */
export async function sendViaChannels(channels: NotifyChannel[], title: string, body: string, vars?: NotifyTemplateVars): Promise<Array<{ name: string; ok: boolean; error?: string }>> {
  return await Promise.all(channels.map(async (ch) => {
    const r = await ch.send(title, body, vars)
    return { name: ch.name, ...r }
  }))
}

// ---------------------------------------------------------------------------
// 任务级静默时段(0.4.7 B2):命中窗内的通知暂存,出窗首跑合并推送
// ---------------------------------------------------------------------------

/** 静默期暂存条目(进任务持久化,重启不丢)。 */
export interface QuietPendingItem { at: string; ok: boolean; summary: string; hits: number; diff: boolean }

const QUIET_RE = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/

/**
 * 解析并归一 "HH:MM-HH:MM"(支持跨夜 23:00-07:00);非法返回 undefined——调用方
 * 按未配置处理(fail-open:解析不出窗≠全天静默,宁可多推不可吞通知)。
 */
export function parseQuietHours(raw: string | undefined): { from: string; to: string } | undefined {
  if (typeof raw !== 'string') return undefined
  const m = QUIET_RE.exec(raw.trim())
  if (m === null) return undefined
  const [from, to] = [m[1], m[2]]
  for (const t of [from, to]) {
    const [h, mi] = t.split(':').map(Number)
    if (h > 23 || mi > 59) return undefined
  }
  return { from, to }
}

/** 判定 now 是否落在静默窗内(跨夜窗:from>to 时 t≥from 或 t<to)。 */
export function inQuietHours(raw: string | undefined, now: Date = new Date()): boolean {
  const q = parseQuietHours(raw)
  if (q === undefined) return false
  const pad = (n: number): string => String(n).padStart(2, '0')
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  if (q.from <= q.to) return t >= q.from && t < q.to
  return t >= q.from || t < q.to
}

/**
 * 合并推送的静默摘要段(附在正文尾;出窗首跑时调用方把 pending 一并传入并清空)。
 * 每条一行:HH:MM ✓/✗ + 🔔(命中)/📊(有变化)标记 + 摘要截断;空数组返回空串。
 */
export function renderQuietDigest(pending: QuietPendingItem[] | undefined, quietHours: string | undefined): string {
  if (pending === undefined || pending.length === 0) return ''
  const lines = pending.map((p) => {
    const mark = `${p.ok ? '✓' : '✗'}${p.hits > 0 ? ' 🔔' : ''}${p.diff ? ' 📊' : ''}`
    const d = new Date(p.at)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `- ${hh}:${mm} ${mark} ${p.summary}`
  })
  return `\n😴 静默期(${quietHours ?? ''})合并 ${pending.length} 条:\n${lines.join('\n')}`
}
