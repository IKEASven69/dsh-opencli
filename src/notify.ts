/**
 * 通知通道层:定时任务/watch 命中的结果外送(webhook / email / dsh 面板)。
 * 通道是安全边界——通知会进群机器人、邮箱等不可控转发面,正文里任何本机路径
 * (~/.dsh 下的状态/轨迹文件名本身就是用户指纹)与 token 都必须在出口处清洗,
 * 宁可多删不可漏一条(scrubLocalPaths 是所有通道共享的最后闸,buildNotifyBody 默认已调)。
 * 本模块不感知 OpencliService:通道纯函数化 + 会话/事件入口注入,接线由服务层完成。
 * @module dsh-opencli/notify
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { dirname } from 'node:path'
import type { IngestEvent } from './types.ts'

/** 通知通道统一接口:send 永不抛异常,失败以 { ok: false, error } 返回——通知是旁路,不能拖死调度主链。 */
export interface NotifyChannel {
  name: string
  send(title: string, body: string): Promise<{ ok: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// 通道一:webhook
// ---------------------------------------------------------------------------

/** webhook 收端超时:慢收端不能挂住调度 tick(与 SMTP 步骤超时同口径)。 */
const WEBHOOK_TIMEOUT_MS = 10_000

/**
 * Webhook 通道:POST JSON {title, body, at} 到任意收端(群机器人自建 webhook 等)。
 * fetch 构造期注入是为了单测桩掉真实网络;成功判定收窄到唯一 200——收端规范各异
 * (301/204/500 各有意义),只认明确成功码,失败带状态码方便排障。
 */
export class WebhookChannel implements NotifyChannel {
  readonly name: string

  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
  ) {
    // name 带主机名:多 webhook 通道时结果日志能区分;URL 非法不在构造期炸(send 里兜)
    let host = ''
    try { host = new URL(url).host } catch { host = '' }
    this.name = host.length > 0 ? `webhook:${host}` : 'webhook'
  }

  async send(title: string, body: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      })
      if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` }
      return { ok: true }
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
    try { url = new URL(this.smtpUrl) } catch { return { ok: false, error: `SMTP URL 非法:${this.smtpUrl}` } }
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
// 出口清洗与正文组装
// ---------------------------------------------------------------------------

/**
 * 出口清洗规则:移除本机路径与凭据,替换为占位符(占位符保留可读性,排障时还能看出
 * "这里原本有个路径/令牌")。规则顺序有意义:先路径后令牌,路径占位符是中文不会再被
 * 令牌规则误吃。字符集取可打印 ASCII,天然停在 CJK 前——"C:\a 的报告"只吃 "C:\a ",
 * 中文内容不陪葬。
 */
const SCRUB_RULES: Array<{ re: RegExp; to: string }> = [
  // Windows 绝对路径(C:\Users\20369\… / D:/x/y)。lookbehind 挡掉 https:// 这类 scheme 冒号
  { re: /(?<![\w:])[A-Za-z]:[\\/][ -~]*/g, to: '[本地路径]' },
  // 波浪 home 路径(~/.dsh/…、~\…)
  { re: /~[\\/][ -~]*/g, to: '[home路径]' },
  // unix 风格 home(Linux/macOS);系统目录(/tmp /var 等)不扫——通知里出现它们的语义无害
  { re: /(?:\/home\/|\/Users\/)[ -~]*/g, to: '[home路径]' },
  // 键值形态的令牌(Bearer/token=…/api_key:…):保留字段名,值抹掉
  { re: /\b(Bearer|token|apikey|api_key|api-key|secret|password|passwd)([ \t]*[:=][ \t]*)[!-~]+/gi, to: '$1$2[已移除]' },
  // 裸 Bearer 头(Authorization: Bearer xxx 形态,Bearer 与值之间没有冒号)
  { re: /(?<![A-Za-z0-9_-])Bearer[ \t]+[!-~]+/gi, to: 'Bearer [已移除]' },
  // 具名密钥前缀(openai sk-、github ghp_/gho_、slack xox*、google ya29):不在键值对里也绝不能外流
  { re: /\b(?:sk|ghp|gho|xoxb|xoxp|ya29)-[A-Za-z0-9_-]{8,}/g, to: '[已移除]' },
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

/** buildNotifyBody 的调度侧输入(只取通知需要的字段,与 PluginState.schedules 条目形状兼容)。 */
export interface NotifyScheduleInfo {
  /** 站点命令(如 site zhihu hot;标题里截前两个词当站点名)。 */
  site: string
  /** watch 关键词配置(正文提示用)。 */
  watch?: string
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

/** 通知正面上限:超长截断(收端对长度各有上限,500 字以内通吃)。 */
const NOTIFY_BODY_MAX = 500

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

/** 单条通道配置。type 决定必填字段:webhook 要 url;email 要 url(SMTP)+ to;dsh 无参。 */
export interface NotifyChannelConfig {
  type: 'webhook' | 'email' | 'dsh'
  /** webhook 收端地址 / email 的 SMTP URL(smtp:// 或 smtps://)。 */
  url?: string
  /** email 收件人。 */
  to?: string
  enabled: boolean
}

export interface NotifyConfig {
  channels: NotifyChannelConfig[]
}

/**
 * 配置归一化:state.json 是用户可手改的文件,读进来先过白名单——未知 type、非字符串
 * url/to 整条丢弃而不是抛错,通知是旁路,坏一条配置不能废掉整个加载(loadState 同款容错)。
 */
export function normalizeNotifyConfig(raw: unknown): NotifyConfig {
  if (raw === null || typeof raw !== 'object') return { channels: [] }
  const list = (raw as { channels?: unknown }).channels
  if (!Array.isArray(list)) return { channels: [] }
  const channels: NotifyChannelConfig[] = []
  for (const c of list) {
    if (c === null || typeof c !== 'object') continue
    const o = c as { type?: unknown; url?: unknown; to?: unknown; enabled?: unknown }
    if (o.type !== 'webhook' && o.type !== 'email' && o.type !== 'dsh') continue
    channels.push({
      type: o.type,
      url: typeof o.url === 'string' && o.url.length > 0 ? o.url : undefined,
      to: typeof o.to === 'string' && o.to.length > 0 ? o.to : undefined,
      enabled: o.enabled === true,
    })
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
    if (c.type === 'webhook' && c.url !== undefined) out.push(new WebhookChannel(c.url))
    else if (c.type === 'email' && c.url !== undefined && c.to !== undefined) out.push(new EmailChannel(c.url, c.to))
    else if (c.type === 'dsh') out.push(new DshNotifyChannel(opts.emit))
  }
  return out
}

/**
 * 群发:所有通道并发尝试,单通道失败不影响其他(返回逐通道结果供日志/审计)。
 * 正文请先用 buildNotifyBody 组装(那里已统一 scrub),这里不再二次清洗。
 */
export async function sendViaChannels(channels: NotifyChannel[], title: string, body: string): Promise<Array<{ name: string; ok: boolean; error?: string }>> {
  return await Promise.all(channels.map(async (ch) => {
    const r = await ch.send(title, body)
    return { name: ch.name, ...r }
  }))
}
