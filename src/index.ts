/**
 * dsh-opencli host 半:登录态浏览器代理。
 * - browser_* 工具族:包装 `opencli browser <session> …` 原语(open/state/click/type/fill/extract/screenshot/scroll/wait + browser_do 透传)
 * - site 工具:`opencli <adapter> <command> …` 适配器桥
 * - systemPrompt:适配器目录(缓存 + TTL)与使用要点
 * - TypertRemoteService RPC:status / adapters / refresh(面板用)
 * 全部调用经 ctx.shell;不打包 OpenCLI(doctor 缺失引导)。
 * @module dsh-opencli
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { ShellExecRequest } from '@deepseek-ai/dsh-shell'
import { homedir } from 'node:os'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AdapterDetailRequest, AdapterDetailResult, AdapterDisableRequest, AdapterDisableResult,
  AdaptersResult, ApprovalSetRequest, ApprovalSetResult, DaemonStartResult, LoginCheckItem, LoginCheckResult,
  OpencliStatus, SettingsResult,
} from './types.ts'
import { approvalDecision, buildAdapterDirectory, commandAccess, normalizeAdapterList, parseDaemonStatus, sitesWithWhoami } from './parsers.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    opencli: OpencliService
  }
}

/** browser_do 允许透传的子命令白名单(其余高危命令不允许盲调)。 */
const BROWSER_DO_ALLOW = new Set([
  'analyze', 'back', 'bind', 'check', 'close', 'console', 'dblclick', 'dialog',
  'drag', 'eval', 'find', 'focus', 'frames', 'get', 'hover', 'init', 'keys',
  'network', 'select', 'tab', 'unbind', 'uncheck', 'upload', 'verify',
])

const OUTPUT_LIMIT = 16000
const ADAPTER_TTL_MS = 60 * 60 * 1000
const LOGIN_CHECK_TTL_MS = 10 * 60 * 1000
const LOGIN_CHECK_CONCURRENCY = 3

/** 插件持久状态(~/.dsh/dsh-opencli-state.json)。 */
interface PluginState {
  approval: 'on' | 'off'
  disabled: string[]
}

interface ToolArgs {
  session?: string
  url?: string
  target?: string
  text?: string
  source?: string
  direction?: string
  type?: string
  value?: string
  path?: string
  tab?: string
  command?: string
  args?: string[]
  adapter?: string
}

export class OpencliService extends TypertRemoteService {
  static inject = ['shell', 'tools', 'systemPrompt']

  private readonly bin: string
  private adapterCache: { at: number; json: unknown } | null = null
  private lastShellError: string | null = null
  private state: PluginState = { approval: 'on', disabled: [] }
  private readonly statePath = join(homedir(), '.dsh', 'dsh-opencli-state.json')
  private loginCache: { at: number; results: LoginCheckResult } | null = null

  constructor(ctx: Context) {
    super(ctx, 'opencli')
    this.bin = process.env.DSH_OPENCLI_BIN ?? 'opencli'
    void this.loadState()
  }

  protected async [Service.init](): Promise<void> {
    this.registerBrowserTools()
    this.registerSiteTool()
    this.registerApprovalGate()
    void this.injectSystemPrompt()
  }

  // ── 模型工具 ──────────────────────────────────────────────

  private registerBrowserTools(): void {
    const t = this.ctx.tools
    const run = async (session: string | undefined, argv: string[]): Promise<{ text: string }> => {
      const out = await this.runOpencli(['browser', session ?? 'dsh', ...argv])
      return { text: this.renderOut(out) }
    }
    const s = '浏览器会话名(默认 dsh;bind 过的会话复用登录态)'

    t.register(defineTool({
      name: 'browser_open',
      description: '在用户已登录的真实 Chrome 中打开 URL(daemon+扩展桥接,登录态天然可用)',
      parameters: {
        url: { type: 'string', description: '要打开的完整 URL' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['open', String(a.url)]),
    }))
    t.register(defineTool({
      name: 'browser_state',
      description: '获取当前页状态快照:URL、标题、带 [N] 索引的交互元素清单——后续 click/type/fill 的 target 直接用 [N] 索引或文本',
      parameters: {
        session: { type: 'string', description: s },
        source: { type: 'string', enum: ['dom', 'ax'], description: '快照后端,默认 dom;ax 为无障碍树' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['state', ...(a.source !== undefined ? ['--source', a.source] : [])]),
    }))
    t.register(defineTool({
      name: 'browser_click',
      description: '点击元素。target 用 browser_state 里的 [N] 索引(如 "12")或可见文本/CSS',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS 选择器' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['click', String(a.target)]),
    }))
    t.register(defineTool({
      name: 'browser_type',
      description: '点击元素并输入文本(适合搜索框等)',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS' },
        text: { type: 'string', description: '要输入的内容' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['type', String(a.target), String(a.text)]),
    }))
    t.register(defineTool({
      name: 'browser_fill',
      description: '精确设置输入框内容并校验(不清除其他字段)',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS' },
        text: { type: 'string', description: '要设置的值' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['fill', String(a.target), String(a.text)]),
    }))
    t.register(defineTool({
      name: 'browser_extract',
      description: '把当前页正文提取为 Markdown(长页自动分段),适合读文章/帖子/文档',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['extract']),
    }))
    t.register(defineTool({
      name: 'browser_screenshot',
      description: '对当前页截图保存到本地路径(仅在确需视觉信息时使用,优先 browser_state/extract)',
      parameters: {
        path: { type: 'string', description: '保存路径(绝对路径)' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['screenshot', ...(a.path !== undefined ? [a.path] : [])]),
    }))
    t.register(defineTool({
      name: 'browser_scroll',
      description: '滚动页面(up/down/left/right)',
      parameters: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向,默认 down' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['scroll', a.direction ?? 'down']),
    }))
    t.register(defineTool({
      name: 'browser_wait',
      description: '等待条件成立:selector(如 ".loaded") / text / time(秒) / xhr(如 "/api/search") / download(文件名)',
      parameters: {
        type: { type: 'string', enum: ['selector', 'text', 'time', 'xhr', 'download'], description: '等待类型' },
        value: { type: 'string', description: '对应的值' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['wait', String(a.type), ...(a.value !== undefined ? [a.value] : [])]),
    }))
    t.register(defineTool({
      name: 'browser_do',
      description: `opencli browser 通用子命令透传(白名单:${[...BROWSER_DO_ALLOW].join(' ')})。常用:analyze(侦察站点反爬/API)、init(生成适配器脚手架)、verify(验证适配器)、tab/find/network/keys/select/hover 等`,
      parameters: {
        command: { type: 'string', description: `子命令,允许值:${[...BROWSER_DO_ALLOW].join('|')}` },
        args: { type: 'array', items: { type: 'string' }, description: '子命令参数(按 opencli browser 文档顺序)' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const cmd = String(a.command)
        if (!BROWSER_DO_ALLOW.has(cmd)) return { text: `不允许的子命令:${cmd}(白名单见工具说明)` }
        return run(a.session, [cmd, ...(a.args ?? [])])
      },
    }))
  }

  private registerSiteTool(): void {
    this.ctx.tools.register(defineTool({
      name: 'site',
      description: '调用站点适配器(在用户登录态上返回结构化结果,比逐页点击快且稳)。adapter/command 见 systemPrompt 里的适配器目录;示例:site bilibili search 关键词=罗翔',
      parameters: {
        adapter: { type: 'string', description: '适配器名(如 bilibili/zhihu/arxiv)' },
        command: { type: 'string', description: '适配器子命令(如 search/hot/top)' },
        args: { type: 'array', items: { type: 'string' }, description: '子命令参数' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs): Promise<{ text: string }> => {
        const adapter = String(a.adapter)
        const command = String(a.command)
        if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) {
          return { text: `非法 adapter/command:${adapter} ${command}` }
        }
        if (this.state.disabled.includes(adapter)) {
          return { text: `适配器 ${adapter} 已被禁用(设置→浏览器代理 可重新启用)。` }
        }
        const out = await this.runOpencli([adapter, command, ...(a.args ?? [])])
        return { text: this.renderOut(out) }
      },
    }))
  }

  // ── systemPrompt:适配器目录(缓存 + TTL,组装时取最新) ─────

  private directoryText = '浏览器代理(dsh-opencli):适配器目录加载中。'

  private async injectSystemPrompt(): Promise<void> {
    this.ctx.systemPrompt.section({
      name: 'opencli-proxy',
      order: 150,
      text: () => this.directoryText,
    })
    void this.updateDirectory()
  }

  private async updateDirectory(): Promise<void> {
    const list = await this.adapterList()
    if (list === null) {
      this.directoryText = '浏览器代理(dsh-opencli):未检测到可用的 opencli(browser_*/site 工具会失败)。请用户在设置→浏览器代理 运行诊断,或安装 OpenCLI(OpenCLIApp / npm i -g @jackwener/opencli)。'
      return
    }
    const active = list.filter((a) => !this.state.disabled.includes(a.name))
    const daemon = await this.daemonStatus()
    const state = daemon !== null && daemon.running
      ? `daemon 运行中(扩展 ${daemon.extension ?? '?'})`
      : 'daemon 未运行——browser_* 需要它:可在 dsh 设置→浏览器代理 一键启动,或 opencli daemon restart'
    const gate = this.state.approval === 'on' ? 'site 的 write 命令会先请求用户审批。' : '审批门已关闭(write 命令直接执行)。'
    this.directoryText = `浏览器代理(dsh-opencli):操纵用户**已登录的真实 Chrome**。流程:browser_open → browser_state(拿 [N] 索引)→ browser_click/type/fill(target 用 [N])→ browser_extract 读结果。${state}。${gate}\n${buildAdapterDirectory(active)}`
  }

  // ── RPC(面板) ────────────────────────────────────────────

  @Remote('status')
  async status(): Promise<OpencliStatus> {
    const version = await this.runOpencli(['--version'])
    if (version.exitCode !== 0) {
      return { ok: false, bin: null, version: null, daemon: null, adapterSites: null, error: `opencli 不可用(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}` }
    }
    const daemon = await this.daemonStatus()
    const list = await this.adapterList()
    return {
      ok: true,
      bin: this.bin,
      version: version.stdout.trim().split('\n')[0] ?? null,
      daemon: daemon ?? null,
      adapterSites: list?.length ?? null,
    }
  }

  @Remote('adapters')
  async adapters(): Promise<AdaptersResult> {
    const list = await this.adapterList()
    if (list === null) return { ok: false, total: 0, adapters: [], error: `opencli list 不可用 | ${this.lastShellError ?? '未知'}` }
    const marked = list.map((a) => ({ ...a, disabled: this.state.disabled.includes(a.name) }))
    return { ok: true, total: marked.length, adapters: marked }
  }

  @Remote('refresh')
  async refresh(): Promise<AdaptersResult> {
    this.adapterCache = null
    const result = await this.adapters()
    void this.updateDirectory()
    return result
  }

  /** daemon 未运行时由面板一键拉起;已在运行则不动作(避免干扰在用的桥接)。 */
  @Remote('daemon-start')
  async daemonStart(): Promise<DaemonStartResult> {
    const before = await this.daemonStatus()
    if (before?.running === true) return { ok: true, started: false, message: 'daemon 已在运行' }
    const r = await this.runOpencli(['daemon', 'restart'], 30000)
    const after = await this.daemonStatus()
    if (r.exitCode !== 0 && after?.running !== true) {
      return { ok: false, started: false, message: `启动失败(退出码 ${r.exitCode}):${clip(r.stderr || r.stdout, 300)}` }
    }
    return { ok: true, started: true, message: null }
  }

  @Remote('settings')
  async settings(): Promise<SettingsResult> {
    return { ok: true, approvalOn: this.state.approval === 'on', disabled: [...this.state.disabled] }
  }

  @Remote('approval-set')
  async approvalSet(request: ApprovalSetRequest): Promise<ApprovalSetResult> {
    this.state.approval = request.enabled ? 'on' : 'off'
    await this.saveState()
    return { ok: true, enabled: request.enabled }
  }

  @Remote('adapter-disable')
  async adapterDisable(request: AdapterDisableRequest): Promise<AdapterDisableResult> {
    const set = new Set(this.state.disabled)
    if (request.disabled) set.add(request.name)
    else set.delete(request.name)
    this.state.disabled = [...set]
    await this.saveState()
    void this.updateDirectory()
    return { ok: true, name: request.name, disabled: request.disabled }
  }

  /** 登录态巡检:对有 whoami 命令的站点并发探测(限流+10min 缓存)。 */
  @Remote('login-check')
  async loginCheck(): Promise<LoginCheckResult> {
    const empty: LoginCheckResult = { ok: false, checkedAt: null, results: [] }
    if (this.loginCache !== null && Date.now() - this.loginCache.at < LOGIN_CHECK_TTL_MS) {
      return this.loginCache.results
    }
    if (this.adapterCache === null) {
      const list = await this.adapterList()
      if (list === null) return { ...empty, error: this.lastShellError ?? 'opencli list 不可用' }
    }
    const sites = sitesWithWhoami(this.adapterCache?.json)
    if (sites.length === 0) return { ...empty, error: '没有带 whoami 命令的适配器' }
    const results = await this.runPool(sites, LOGIN_CHECK_CONCURRENCY, async (site): Promise<LoginCheckItem> => {
      try {
        const r = await this.runOpencli([site, 'whoami'], 45000, 65536)
        const text = `${r.stdout}\n${r.stderr}`.trim()
        const notLoggedIn = r.exitCode !== 0 || /^ok:\s*false/m.test(text) || /AUTH_REQUIRED|^logged_in:\s*false/m.test(text)
        const meaningful = text.split('\n').find((l) => /message:|screen_name|^user/.test(l)) ?? text.split('\n').find((l) => l.trim().length > 0) ?? ''
        return { site, ok: !notLoggedIn, timedOut: false, detail: clip(meaningful.trim(), 120) || null }
      } catch {
        return { site, ok: false, timedOut: true, detail: null }
      }
    })
    const value: LoginCheckResult = { ok: true, checkedAt: new Date().toISOString(), results }
    this.loginCache = { at: Date.now(), results: value }
    return value
  }

  /** 单个适配器的完整命令详情(从缓存的原始 list JSON 过滤,面板展开时按需拉取)。 */
  @Remote('adapter-detail')
  async adapterDetail(request: AdapterDetailRequest): Promise<AdapterDetailResult> {
    const empty: AdapterDetailResult = { ok: false, name: request.name, domain: null, commands: [] }
    if (this.adapterCache === null) {
      // 面板冷启动后第一次展开:先触发一次缓存装载
      const list = await this.adapterList()
      if (list === null) return { ...empty, error: this.lastShellError ?? 'opencli list 不可用' }
    }
    const raw = this.adapterCache?.json
    if (!Array.isArray(raw)) return { ...empty, error: '缓存无原始数据' }
    const commands = []
    let domain: string | null = null
    for (const e of raw as Array<Record<string, unknown>>) {
      if (e === null || typeof e !== 'object' || e.site !== request.name) continue
      if (domain === null && typeof e.domain === 'string' && e.domain !== 'null') domain = e.domain
      const args = Array.isArray(e.args) ? (e.args as unknown[]).length : 0
      commands.push({
        name: typeof e.name === 'string' ? e.name : String(e.command ?? ''),
        description: typeof e.description === 'string' ? e.description : '',
        access: typeof e.access === 'string' ? e.access : 'read',
        example: typeof e.example === 'string' ? e.example : undefined,
        argCount: args,
      })
    }
    if (commands.length === 0) return { ...empty, error: `未找到适配器:${request.name}` }
    commands.sort((a, b) => a.name.localeCompare(b.name))
    return { ok: true, name: request.name, domain, commands }
  }

  /** R1 审批门:site 的 write 命令(发帖/点赞/下单等)先经 dsh 原生审批(ask→allowed-once)。
   * 任何异常一律放行给 next(),绝不因审批门自身故障阻塞工具。 */
  private registerApprovalGate(): void {
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      try {
        const a = (exec.arguments ?? {}) as { adapter?: unknown; command?: unknown }
        const argsOk = typeof a.adapter === 'string' && typeof a.command === 'string' && a.adapter.length > 0 && a.command.length > 0
        // 只在确有可能 ask 时才付出缓存查询成本;其余情况 access 传占位值,判定函数自会放行
        const needsAccess = exec.name === 'site' && this.state.approval === 'on' && argsOk && !this.state.disabled.includes(a.adapter)
        const access = needsAccess ? await this.lookupAccess(a.adapter as string, a.command as string) : 'unknown'
        const decision = approvalDecision(this.state.approval === 'on', this.state.disabled, exec.name, a.adapter, a.command, access)
        if (decision === 'allow') return await next()
        const reason = decision === 'ask-write'
          ? `site ${String(a.adapter)} ${String(a.command)} 是写操作——会在你的登录态浏览器里真实执行(发帖/点赞/下单/改数据)。`
          : `site ${String(a.adapter)} ${String(a.command)} 未能确认权限类型,按写操作审批。`
        return { kind: 'ask', reason }
      } catch {
        return await next()
      }
    })
  }

  private async lookupAccess(adapter: string, command: string): Promise<'read' | 'write' | 'unknown'> {
    if (this.adapterCache === null) await this.adapterList()
    return commandAccess(this.adapterCache?.json, adapter, command)
  }

  // ── 基础设施 ──────────────────────────────────────────────

  private async runOpencli(argv: string[], timeoutMs = 60000, stdoutMaxBytes = 1048576): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const spec = this.ctx.shell.resolve({ command: [this.bin, ...argv].join(' '), timeoutMs, stdoutMaxBytes } as ShellExecRequest)
    const r = await this.ctx.shell.run(spec)
    return { exitCode: r.exitCode, stdout: r.stdout?.text ?? '', stderr: r.stderr?.text ?? '' }
  }

  private renderOut(out: { exitCode: number; stdout: string; stderr: string }): string {
    if (out.exitCode === 0) return clip(out.stdout, OUTPUT_LIMIT)
    return `命令失败(退出码 ${out.exitCode}):\n${clip(out.stdout, 2000)}\n${clip(out.stderr, 2000)}`
  }

  private async daemonStatus() {
    const r = await this.runOpencli(['daemon', 'status'], 15000)
    if (r.exitCode !== 0) return null
    return parseDaemonStatus(r.stdout + '\n' + r.stderr)
  }

  private async loadState(): Promise<void> {
    try {
      const text = await readFile(this.statePath, 'utf8')
      const parsed = JSON.parse(text) as Partial<PluginState>
      if (parsed.approval === 'on' || parsed.approval === 'off') this.state.approval = parsed.approval
      if (Array.isArray(parsed.disabled)) this.state.disabled = parsed.disabled.filter((s) => typeof s === 'string')
    } catch { /* 无文件或损坏:用默认值 */ }
  }

  private async saveState(): Promise<void> {
    try {
      await mkdir(join(homedir(), '.dsh'), { recursive: true })
      await writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf8')
    } catch { /* 状态写不进(权限等):仅本次会话生效 */ }
  }

  /** 简单并发池(登录巡检限流用)。 */
  private async runPool<T>(items: string[], concurrency: number, fn: (item: string) => Promise<T>): Promise<T[]> {
    const out: T[] = []
    let cursor = 0
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= items.length) break
        out.push(await fn(items[i]))
      }
    })
    await Promise.all(workers)
    return out
  }

  private async adapterList() {
    if (this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS) {
      return normalizeAdapterList(this.adapterCache.json)
    }
    const r = await this.runOpencli(['list', '--format', 'json'], 30000, 8 * 1024 * 1024)
    if (r.exitCode !== 0) {
      // 诊断通道:把 shell 失败的原始输出带回面板(临时)
      this.lastShellError = `list(${r.exitCode})|out:${r.stdout.slice(0, 200)}|err:${r.stderr.slice(0, 200)}`
      return null
    }
    try {
      // opencli 可能把"Update available"横幅等杂物混进输出,从首个 [ 或 { 起截取
      const start = Math.min(...['[', '{'].map((c) => { const i = r.stdout.indexOf(c); return i === -1 ? Infinity : i }))
      const json: unknown = JSON.parse(Number.isFinite(start) ? r.stdout.slice(start) : r.stdout)
      this.adapterCache = { at: Date.now(), json }
      return normalizeAdapterList(json)
    } catch (e) {
      this.lastShellError = `json(${e instanceof Error ? e.message.slice(0, 120) : 'parse'})|head:${r.stdout.slice(0, 200)}`
      return null
    }
  }
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  return text.slice(0, limit) + `\n…(已截断,原文 ${text.length} 字符)`
}

export default OpencliService
