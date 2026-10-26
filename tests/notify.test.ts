// 通知通道层测试:三通道桩化收发(webhook/email/dsh)、出口清洗(scrubLocalPaths)、
// 正文组装(buildNotifyBody)与配置持久化(notifyConfig 读写)。
// 网络零外发:fetch 注入桩、SMTP 会话注入脚本化假会话,不真连任何服务器。
// 纯函数段不构造 OpencliService;文件尾部的「任务 E 集成」段构造(独立 STATE/TRACE/SHOTS
// 目录隔离,zerocfg 同款),桩掉全局 fetch 后经 runSiteCommand 走通调度→通知全链。
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import {
  WebhookChannel, EmailChannel, DshNotifyChannel, SocketSession,
  scrubLocalPaths, buildNotifyBody,
  buildNotifyChannels, sendViaChannels,
  normalizeNotifyConfig, normalizeNotifyConfigForSave, loadNotifyConfig, saveNotifyConfig,
  type SmtpSession, type SmtpReply, type NotifyChannel, type IngestEvent,
} from '../src/notify.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService } from '../lib/index.js'
import { rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// 桩:fetch 与 SMTP 会话
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init: RequestInit }

function stubFetch(calls: FetchCall[], status: number, impl?: (c: FetchCall) => Promise<void>): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    if (impl !== undefined) await impl(call)
    return { status } as Response
  }) as unknown as typeof fetch
}

const reply = (code: number, text = ''): SmtpReply => ({ code, text })

/** 脚本化 SMTP 假会话:记录命令与投递正文;可注入「某命令前缀 → 失败应答」模拟拒收。 */
class FakeSession implements SmtpSession {
  readonly commands: string[] = []
  deliveredPayload: string | null = null
  closedCount = 0
  greetingCalls = 0

  constructor(private readonly fails: Array<{ match: string; reply: SmtpReply }> = []) {}

  private respond(cmd: string): SmtpReply {
    const f = this.fails.find((x) => cmd.startsWith(x.match))
    return f !== undefined ? f.reply : reply(250)
  }

  async readReply(): Promise<SmtpReply> { this.greetingCalls++; return reply(220) }

  async command(line: string): Promise<SmtpReply> {
    this.commands.push(line)
    if (line === 'DATA') return reply(354)
    if (line.startsWith('AUTH LOGIN')) return reply(334)
    if (/^[A-Za-z0-9+/=]+$/.test(line)) return reply(235) // 认证密码的 base64 → 通过
    return this.respond(line)
  }

  async deliver(payload: string): Promise<SmtpReply> { this.deliveredPayload = payload; return reply(250) }

  close(): void { this.closedCount++ }
}

/** 桩连接工厂:捕获解析后的 URL,返回 FakeSession 供断言。 */
function stubConnect(holder: { session?: FakeSession; url?: URL }, fails: Array<{ match: string; reply: SmtpReply }> = []) {
  return async (url: URL): Promise<SmtpSession> => {
    holder.url = url
    const s = new FakeSession(fails)
    holder.session = s
    return s
  }
}

/** 记录型假 socket:喂分块数据、捕获写出,驱动 SocketSession 的线层行为。 */
class FakeSocket {
  readonly written: string[] = []
  private readonly handlers: Record<string, Array<(arg?: unknown) => void>> = {}
  write(s: string): boolean { this.written.push(s); return true }
  destroy(): void { for (const cb of this.handlers.close ?? []) cb() }
  setEncoding(_enc: string): unknown { return undefined }
  on(ev: string, cb: (arg?: unknown) => void): unknown { (this.handlers[ev] ??= []).push(cb); return this }
  once(ev: string, cb: (arg?: unknown) => void): unknown { (this.handlers[ev] ??= []).push(cb); return this }
  /** 测试侧注入服务端数据块 */
  feed(data: string): void { for (const cb of this.handlers.data ?? []) cb(data) }
}

// ---------------------------------------------------------------------------
// WebhookChannel
// ---------------------------------------------------------------------------

describe('WebhookChannel', () => {
  it('成功:POST JSON {title, body, at},status 200 记 ok', async () => {
    const calls: FetchCall[] = []
    const ch = new WebhookChannel('https://hook.example.com/abc', stubFetch(calls, 200))
    const r = await ch.send('[dsh-opencli] zhihu hot 2026-10-26 09:05', '结果:成功')
    expect(r).toEqual({ ok: true })
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toBe('https://hook.example.com/abc')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>)['content-type']).toBe('application/json')
    const payload = JSON.parse(String(calls[0]?.init.body)) as { title: string; body: string; at: string }
    expect(payload.title).toBe('[dsh-opencli] zhihu hot 2026-10-26 09:05')
    expect(payload.body).toBe('结果:成功')
    expect(payload.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // 超时信号已带上(10s 上限在实现里,测试验证信号存在且未因发送而中断)
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
    expect((calls[0]?.init.signal as AbortSignal).aborted).toBe(false)
  })

  it('失败:非 200(500)记失败并带状态码', async () => {
    const ch = new WebhookChannel('https://hook.example.com/abc', stubFetch([], 500))
    const r = await ch.send('t', 'b')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('HTTP 500')
  })

  it('失败:网络异常不抛出,返回 error', async () => {
    const broken = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const ch = new WebhookChannel('https://hook.example.com/abc', broken)
    const r = await ch.send('t', 'b')
    expect(r).toEqual({ ok: false, error: 'fetch failed' })
  })

  it('name 带主机名;URL 非法退回裸名', () => {
    expect(new WebhookChannel('https://hook.example.com/abc', stubFetch([], 200)).name).toBe('webhook:hook.example.com')
    expect(new WebhookChannel('::::', stubFetch([], 200)).name).toBe('webhook')
  })
})

// ---------------------------------------------------------------------------
// EmailChannel(原始 SMTP,桩会话)
// ---------------------------------------------------------------------------

describe('EmailChannel', () => {
  const SMTP_URL = 'smtps://user%40ex.com:apppass@smtp.ex.com:465?from=user%40ex.com'

  it('成功:AUTH LOGIN + 信封 + DATA 全链,正文 CRLF/标题 B 编码', async () => {
    const h: { session?: FakeSession; url?: URL } = {}
    const ch = new EmailChannel(SMTP_URL, 'boss@ex.com', stubConnect(h))
    const r = await ch.send('定时结果通知', '结果:成功\n摘要:zhihu hot 前排无异常')
    expect(r).toEqual({ ok: true })
    expect(h.url?.hostname).toBe('smtp.ex.com')
    expect(h.url?.port).toBe('465')
    const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')
    expect(h.session?.commands).toEqual([
      'EHLO dsh-opencli',
      `AUTH LOGIN ${b64('user@ex.com')}`,
      b64('apppass'),
      'MAIL FROM:<user@ex.com>',
      'RCPT TO:<boss@ex.com>',
      'DATA',
      'QUIT',
    ])
    const payload = h.session?.deliveredPayload ?? ''
    expect(payload).toContain('From: user@ex.com')
    expect(payload).toContain('To: boss@ex.com')
    expect(payload).toContain(`Subject: =?UTF-8?B?${b64('定时结果通知')}?=`)
    expect(payload).toContain('Content-Type: text/plain; charset=utf-8')
    // 报文已是 DATA 线格式:行尾 CRLF(流终止符由会话层补,见 SocketSession 用例)
    expect(payload).toContain('结果:成功\r\n摘要:zhihu hot 前排无异常')
    expect(h.session?.closedCount).toBe(1)
  })

  it('无凭据跳过 AUTH(内网中继形态)', async () => {
    const h: { session?: FakeSession; url?: URL } = {}
    const ch = new EmailChannel('smtp://relay.local', 'ops@internal.local', stubConnect(h))
    const r = await ch.send('t', 'b')
    expect(r).toEqual({ ok: true })
    expect(h.session?.commands.some((c) => c.startsWith('AUTH'))).toBe(false)
    // 无 from 参数、无用户名 → 兜底发件地址
    expect(h.session?.commands).toContain('MAIL FROM:<dsh-opencli@localhost>')
  })

  it('失败:RCPT 被拒(550)不抛出,error 带状态码,连接仍关闭', async () => {
    const h: { session?: FakeSession; url?: URL } = {}
    const ch = new EmailChannel(SMTP_URL, 'nobody@ex.com', stubConnect(h, [{ match: 'RCPT', reply: reply(550, 'no such user') }]))
    const r = await ch.send('t', 'b')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('RCPT TO 被拒:550')
    // 拒收后不应再走 DATA
    expect(h.session?.commands.some((c) => c === 'DATA')).toBe(false)
    expect(h.session?.closedCount).toBe(1)
  })

  it('失败:连接被拒不抛出,返回 error', async () => {
    const refused = (async (): Promise<SmtpSession> => { throw new Error('connect ECONNREFUSED') })
    const ch = new EmailChannel('smtps://smtp.ex.com', 'boss@ex.com', refused)
    const r = await ch.send('t', 'b')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('connect ECONNREFUSED')
  })

  it('失败:SMTP URL 非法在发连接前就挡下', async () => {
    let called = false
    const ch = new EmailChannel('::::', 'boss@ex.com', async () => { called = true; return new FakeSession() })
    const r = await ch.send('t', 'b')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('SMTP URL 非法')
    expect(called).toBe(false)
  })

  it('点填充:正文行首的句点被加倍,避免被当作流结束符', async () => {
    const h: { session?: FakeSession; url?: URL } = {}
    const ch = new EmailChannel(SMTP_URL, 'boss@ex.com', stubConnect(h))
    await ch.send('t', '第一行\n.独行句点\n第三行')
    const payload = h.session?.deliveredPayload ?? ''
    expect(payload).toContain('第一行\r\n..独行句点\r\n第三行')
  })
})

// ---------------------------------------------------------------------------
// SocketSession(线层:分块行缓冲/多行应答/流终止符/断线拒绝)
// ---------------------------------------------------------------------------

describe('SocketSession', () => {
  it('分块到达的数据按行拼装;多行应答(250-…/250 …)聚合为单条', async () => {
    const sock = new FakeSocket()
    const sess = new SocketSession(sock)
    sock.feed('220 smtp.ex.com ES')
    sock.feed('MTP ready\r\n') // 一行被劈成两块,readReply 仍应等到完整行
    const greet = await sess.readReply()
    expect(greet).toEqual({ code: 220, text: '220 smtp.ex.com ESMTP ready' })
    sock.feed('250-PIPELINING\r\n')
    sock.feed('250 OK\r\n')
    const r = await sess.command('EHLO dsh-opencli')
    expect(r.code).toBe(250)
    expect(r.text).toBe('250-PIPELINING / 250 OK')
    expect(sock.written).toEqual(['EHLO dsh-opencli\r\n'])
  })

  it('deliver 补 DATA 流终止符(CRLF.CRLF)', async () => {
    const sock = new FakeSocket()
    const sess = new SocketSession(sock)
    sock.feed('250 accepted\r\n')
    const r = await sess.deliver('From: a@b\r\n\r\n正文一行')
    expect(r.code).toBe(250)
    expect(sock.written).toEqual(['From: a@b\r\n\r\n正文一行\r\n.\r\n'])
  })

  it('连接中断时在途等待立即拒绝,不让调用方悬等超时', async () => {
    const sock = new FakeSocket()
    const sess = new SocketSession(sock)
    const pending = sess.command('NOOP')
    sock.destroy() // 触发 close → fail
    await expect(pending).rejects.toThrow('SMTP 连接已关闭')
  })
})

// ---------------------------------------------------------------------------
// DshNotifyChannel
// ---------------------------------------------------------------------------

describe('DshNotifyChannel', () => {
  it('send 把通知写进 ingest 事件流(同款形状,kind=notify)', async () => {
    const events: IngestEvent[] = []
    const ch = new DshNotifyChannel((ev) => events.push(ev))
    const r = await ch.send('标题行', '正文行')
    expect(r).toEqual({ ok: true })
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('notify')
    expect(events[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(events[0]?.text).toBe('标题行\n正文行')
    expect(ch.name).toBe('dsh')
  })
})

// ---------------------------------------------------------------------------
// scrubLocalPaths(出口清洗)
// ---------------------------------------------------------------------------

describe('scrubLocalPaths', () => {
  it('Windows 绝对路径(反斜杠与正斜杠两种形态)被移除', () => {
    const out = scrubLocalPaths('读取 C:\\Users\\20369\\.dsh\\dsh-opencli-state.json 失败')
    expect(out).not.toContain('C:\\Users')
    expect(out).not.toContain('20369')
    expect(out).toContain('[本地路径]')
    expect(scrubLocalPaths('报告在 D:/CodingProjects/x/r.md 附近')).not.toContain('CodingProjects')
  })

  it('~/.dsh 波浪路径与 unix home 路径被移除', () => {
    expect(scrubLocalPaths('状态文件 ~/.dsh/opencli-traces/t.json 损坏')).not.toContain('.dsh')
    expect(scrubLocalPaths('快照 /home/alice/.dsh/s.json 丢失')).not.toContain('/home/alice')
    expect(scrubLocalPaths('轨迹 /Users/bob/work/t.jsonl 缺席')).not.toContain('/Users/bob')
  })

  it('URL 与正常采集内容不被误伤', () => {
    const keep = 'site zhihu hot 完成,来源 https://zhi.com/hot?q=abc,共 42 条'
    expect(scrubLocalPaths(keep)).toBe(keep)
  })

  it('token 各形态被移除:键值对、裸 Bearer、具名密钥、长 hex/base64', () => {
    expect(scrubLocalPaths('token=abc123XYZ 结束')).toBe('token=[已移除] 结束')
    expect(scrubLocalPaths('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.done')).toContain('Bearer [已移除]')
    expect(scrubLocalPaths('密钥 sk-AbCdEf1234567890 泄漏')).not.toContain('sk-AbCdEf')
    expect(scrubLocalPaths(`会话 ${'a'.repeat(64)} 失效`)).not.toContain('a'.repeat(64))
    expect(scrubLocalPaths(`blob ${'QmFzZTY0'.repeat(10)} 无意义`)).not.toContain('QmFzZTY0'.repeat(10))
  })
})

// ---------------------------------------------------------------------------
// buildNotifyBody(正文组装)
// ---------------------------------------------------------------------------

describe('buildNotifyBody', () => {
  // 本地时区固定的时刻:期望标题与实现同格式(年-月-日 时:分)
  const at = new Date(2026, 9, 26, 9, 5)
  const time = '2026-10-26 09:05'

  it('标题含站点+时间(site 前缀剥掉),正文含结果/watch/报告文件名', () => {
    const { title, body } = buildNotifyBody(
      { site: 'site zhihu hot', watch: 'ai,agent' },
      { ok: true, summary: '前排 3 条含 AI', watchHits: ['ai', 'agent'], reportPath: 'C:\\Users\\20369\\.dsh\\opencli-reports\\r-20261026.md' },
      at,
    )
    expect(title).toBe(`[dsh-opencli] zhihu hot ${time}`)
    expect(body).toContain('结果:成功')
    expect(body).toContain('Watch 命中:ai, agent')
    expect(body).toContain('摘要:前排 3 条含 AI')
    // 报告只带文件名:目录(本机信息)绝不进通知
    expect(body).toContain('报告:r-20261026.md')
    expect(body).not.toContain('Users')
    expect(body).not.toContain('.dsh')
  })

  it('失败结果正文标注失败;summary 里的路径被洗掉', () => {
    const { body } = buildNotifyBody(
      { site: 'weibo hot' },
      { ok: false, summary: '输出落盘 D:\\CodingProjects\\tmp\\w.json 后超时' },
      at,
    )
    expect(body).toContain('结果:失败')
    expect(body).not.toContain('CodingProjects')
    expect(body).toContain('[本地路径]')
  })

  it('正文超长截断到 ≤500 字', () => {
    const { body } = buildNotifyBody({ site: 'zhihu hot' }, { ok: true, summary: '长'.repeat(2000) }, at)
    expect(body.length).toBeLessThanOrEqual(500)
    expect(body.endsWith('…')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 配置持久化
// ---------------------------------------------------------------------------

describe('notifyConfig 持久化(评审修复:统一走 saveState,不再独立读-改-写)', () => {
  it('normalizeNotifyConfigForSave:归一化+校验,返回可安全并入 state 的对象', () => {
    const c = normalizeNotifyConfigForSave({ channels: [
      { type: 'webhook', url: 'https://example.com/hook', enabled: true },
      { type: 'dsh', enabled: true },
    ] })
    expect(c.channels).toHaveLength(2)
    expect(c.channels[0]!.type).toBe('webhook')
    expect(c.channels[1]!.type).toBe('dsh')
  })
  it('saveNotifyConfig 是空操作(废弃签名保留 import 兼容,写入由调用方 saveState 管)', async () => {
    await saveNotifyConfig('nonexistent', { channels: [] }) // 不抛不写
  })
})

// ---------------------------------------------------------------------------
// 装配与群发
// ---------------------------------------------------------------------------

describe('buildNotifyChannels / sendViaChannels', () => {
  it('配置实例化:disabled 跳过、必填字段缺失跳过、dsh 通道接上 emit', async () => {
    const events: IngestEvent[] = []
    const channels = buildNotifyChannels({ channels: [
      { type: 'webhook', url: 'https://h.example/x', enabled: true },
      { type: 'webhook', url: 'https://h.example/off', enabled: false },
      { type: 'email', to: 'boss@ex.com', enabled: true }, // 缺 smtp url → 跳过
      { type: 'dsh', enabled: true },
    ] }, { emit: (ev) => events.push(ev) })
    expect(channels.map((c) => c.name)).toEqual(['webhook:h.example', 'dsh'])
    // 只对 dsh 通道发(webhook 是全局 fetch,send 即真发网络——测试绝不外发)
    const dsh = channels.find((c) => c instanceof DshNotifyChannel)
    expect(dsh).toBeDefined()
    await dsh?.send('t', 'b')
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('notify')
  })

  it('群发:单通道失败不影响其他,返回逐通道结果', async () => {
    const good: NotifyChannel = { name: 'good', send: async () => ({ ok: true }) }
    const bad: NotifyChannel = { name: 'bad', send: async () => ({ ok: false, error: 'HTTP 500' }) }
    const results = await sendViaChannels([good, bad], 't', 'b')
    expect(results).toEqual([
      { name: 'good', ok: true },
      { name: 'bad', ok: false, error: 'HTTP 500' },
    ])
  })
})

// ---------------------------------------------------------------------------
// 任务 E 集成:调度 → 通道外送 + notify-config RPC(经 lib 构建产物装配,hardening 同款)
// ---------------------------------------------------------------------------

/** 桩 shell:任何命令回空 JSON 成功——命令输出一律由直改 runOpencli 注入(不在 shell 层分流)。 */
class SchedShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(_spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}
class SchedTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}
class SchedSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

describe('任务 E 集成:定时任务 → 通知通道(桩 shell + 桩 fetch,零外发)', () => {
  // cron 用永不存在的时刻(2 月 31 日):startScheduler 的 15s tick 在测试窗口内空转,
  // 执行全部由 runSiteCommand 直调驱动,断言不受真实时钟影响
  const NEVER_CRON = '0 3 31 2 *'
  const HOOK_URL = 'https://hook.example.com/notify-it'

  let ctx: InstanceType<typeof Context>
  let svc: OpencliService
  let hookCalls: FetchCall[]
  let statePath: string
  const snapshotDirs: string[] = []

  beforeAll(async () => {
    // 隔离目录先于插件装载设好(构造器读 env):状态/轨迹/截图各按本次调用唯一化,
    // vitest 线程池共享 pid,tmpdir 残档不会串场(zerocfg 同款约定)
    const uniq = `${process.pid}-${Date.now()}`
    process.env.DSH_OPENCLI_BIN = 'opencli'
    statePath = join(tmpdir(), `dsh-opencli-notify-it-state-${uniq}.json`)
    process.env.DSH_OPENCLI_STATE = statePath
    process.env.DSH_OPENCLI_TRACE_DIR = join(tmpdir(), `dsh-opencli-notify-it-traces-${uniq}`)
    process.env.DSH_OPENCLI_SHOTS_DIR = join(tmpdir(), `dsh-opencli-notify-it-shots-${uniq}`)
    // 桩全局 fetch:服务内部 buildNotifyChannels 装配 WebhookChannel 时绑定
    // globalThis.fetch(通道直测的注入 seam 在服务装配路径上不可用),先 stub 再触发即被捕获
    hookCalls = []
    vi.stubGlobal('fetch', stubFetch(hookCalls, 200))
    ctx = new Context()
    await ctx.plugin(SchedShell)
    await ctx.plugin(SchedTools)
    await ctx.plugin(SchedSystemPrompt)
    await ctx.plugin(OpencliService)
    svc = ctx.opencli as OpencliService
    // SystemOne 桩:verifyResult 的 noul 兜底必须关闭,否则真加载决策权重
    ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub' }) }
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
    await (c.stop ?? c.dispose ?? (async () => {}))()
    // 快照目录是 runSiteCommand 写进真实 ~/.dsh 的(无 env 覆盖口,advanced 同款先例):逐个清
    for (const d of snapshotDirs) await rm(d, { recursive: true, force: true })
    await rm(statePath, { force: true })
    await rm(process.env.DSH_OPENCLI_TRACE_DIR!, { recursive: true, force: true })
    await rm(process.env.DSH_OPENCLI_SHOTS_DIR!, { recursive: true, force: true })
  })

  /** 建任务并登记快照目录(runSiteCommand 落快照到 ~/.dsh/opencli-snapshots/<id>)。 */
  const addSchedule = async (site: string, watch?: string): Promise<string> => {
    const r = await svc.scheduleAdd({ site, cron: NEVER_CRON, ...(watch !== undefined ? { watch } : {}) })
    expect(r.ok).toBe(true)
    snapshotDirs.push(join(homedir(), '.dsh', 'opencli-snapshots', r.id!))
    return r.id!
  }

  /** runOpencli 直改桩(装/还原一体,hardening 同款);返回采集输出注入函数。 */
  const withRunOpencli = async (stdout: string, fn: () => Promise<void>): Promise<void> => {
    const S = svc as unknown as { runOpencli: (a: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>; runSiteCommand: (s: string, id: string) => Promise<void> }
    const orig = S.runOpencli.bind(svc)
    S.runOpencli = async () => ({ exitCode: 0, stdout, stderr: '' })
    try { await fn() } finally { S.runOpencli = orig }
  }

  it('notify-config RPC:读默认空配置;写白名单归一并落盘;saveState 整文件重写不丢键;非数组拒绝', async () => {
    const got = await svc.notifyConfig(undefined)
    expect(got.ok).toBe(true)
    expect(got.config).toEqual({ channels: [] })
    const post = await svc.notifyConfig({ channels: [
      { type: 'webhook', url: HOOK_URL, enabled: true },
      { type: 'sms', enabled: true }, // 未知 type → 整条丢弃
    ] })
    expect(post.ok).toBe(true)
    expect(post.config?.channels).toEqual([{ type: 'webhook', url: HOOK_URL, enabled: true }])
    // 落盘可读回(notify.ts 的独立读路径)
    expect(await loadNotifyConfig(statePath)).toEqual({ channels: [{ type: 'webhook', url: HOOK_URL, enabled: true }] })
    // 关键回归:notifyConfig 必须进 this.state——scheduleAdd 触发 saveState 整文件重写后键仍在
    await addSchedule('zhihu hot')
    const onDisk = JSON.parse(await readFile(statePath, 'utf8')) as { notifyConfig?: { channels?: Array<{ url?: string }> } }
    expect(onDisk.notifyConfig?.channels?.[0]?.url).toBe(HOOK_URL)
    // channels 非数组:拒绝且不清空现有配置(手滑的 POST 不许抹掉已配好的通道)
    const bad = await svc.notifyConfig({ channels: 'nope' })
    expect(bad.ok).toBe(false)
    expect((await svc.notifyConfig(undefined)).config?.channels.length).toBe(1)
  })

  it('定时任务跑完(重试链走完)→ Webhook 通道收到通知,正文含结果与摘要', async () => {
    hookCalls.length = 0
    const id = await addSchedule('site zhihu hot')
    await withRunOpencli('1. 热点甲 热度100\n2. 热点乙 热度90', () =>
      (svc as unknown as { runSiteCommand: (s: string, id: string) => Promise<void> }).runSiteCommand('site zhihu hot', id))
    expect(hookCalls.length).toBe(1) // 成功一次即 break,单次执行单条通知
    expect(hookCalls[0]?.url).toBe(HOOK_URL)
    const payload = JSON.parse(String(hookCalls[0]?.init.body)) as { title: string; body: string }
    expect(payload.title).toMatch(/^\[dsh-opencli\] zhihu hot \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(payload.body).toContain('结果:成功')
    expect(payload.body).toContain('摘要:1. 热点甲 热度100')
    expect(payload.body).not.toContain('🔔') // 非 watch 命中的例行通知不带 🔔 标
  })

  it('watch 命中 → 同通道外送且正文标「🔔 Watch 命中」;未命中只发例行通知', async () => {
    hookCalls.length = 0
    const id = await addSchedule('arxiv recent cs.AI', 'agent')
    const S = svc as unknown as { runSiteCommand: (s: string, id: string) => Promise<void> }
    await withRunOpencli('Paper: Agentic Systems with LLM', () => S.runSiteCommand('arxiv recent cs.AI', id))
    expect(hookCalls.length).toBe(1)
    let payload = JSON.parse(String(hookCalls[0]?.init.body)) as { title: string; body: string }
    expect(payload.body.startsWith('🔔 Watch 命中\n')).toBe(true)
    expect(payload.body).toContain('Watch 命中:agent')
    expect(payload.body).toContain('结果:成功')
    // 同一任务、输出不含关键词:仍是例行通知,无 🔔 标
    hookCalls.length = 0
    await withRunOpencli('Paper: Diffusion Models Survey', () => S.runSiteCommand('arxiv recent cs.AI', id))
    expect(hookCalls.length).toBe(1)
    payload = JSON.parse(String(hookCalls[0]?.init.body)) as { title: string; body: string }
    expect(payload.body).not.toContain('🔔')
    expect(payload.body).not.toContain('Watch 命中:')
  })

  it('未配通道(空配置)时跑定时任务零外发', async () => {
    // 清空通道配置后执行:fetch 桩不应再收到任何调用
    const cleared = await svc.notifyConfig({ channels: [] })
    expect(cleared.ok).toBe(true)
    hookCalls.length = 0
    const id = await addSchedule('weibo hot')
    await withRunOpencli('1. 微博热搜甲', () =>
      (svc as unknown as { runSiteCommand: (s: string, id: string) => Promise<void> }).runSiteCommand('weibo hot', id))
    expect(hookCalls.length).toBe(0)
  })
})
