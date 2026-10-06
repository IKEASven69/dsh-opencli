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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AdapterDetailRequest, AdapterDetailResult, AdapterDisableRequest, AdapterDisableResult,
  AdaptersResult, ApprovalSetRequest, ApprovalSetResult, AuditListResult, DaemonStartResult, IngestEvent,
  LoginCheckItem, LoginCheckResult, LogsTailResult, OpencliStatus, SettingsResult, TraceLine, TraceListResult,
} from './types.ts'
import { approvalDecision, buildAdapterDirectory, commandAccess, normalizeAdapterList, parseDaemonStatus, sitesWithWhoami } from './parsers.ts'
import { SystemOne, noulYes } from './systemone.ts'
import { buildKnowledge, renderKnowledgeMarkdown, handleMcpResourceRequest, knowledgeResourceUri, SITE_HEALTH, type RawEntry } from './knowledge.ts'
import { browserDoCardRender, siteBatchCardRender, siteCardRender } from './cards.ts'

// 对话内预览卡(site/site_batch/browser_do 的 output.render)再导出:纯函数,tests/cards.test.ts 直测
export { browserDoCardRender, siteBatchCardRender, siteCardRender } from './cards.ts'

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
  /** 持久化定时任务:重启恢复,每分钟 tick 到期自动执行 site 命令;watch=关键词监控(命中即通知) */
  schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; lastRunAt?: string; retry?: number; notify?: boolean; watch?: string }>
  /** 每任务运行历史(最近 5 条) */
  runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string }>>
  /** 审批门拦截审计(最近 50 条) */
  audit: Array<{ at: string; command: string; reason: string; mode: string }>
}

/** 0.2.0 ctx.subprocess 服务的最小形状(dsh-subprocess 的 spawn seam;只取用到的成员)。 */
interface SubprocessSeam {
  spawn?: (s: unknown) => {
    done: Promise<{ exitCode?: number | null }>
    collected?: {
      stdout?: { readFrom: (o: number) => Promise<{ text?: string }> }
      stderr?: { readFrom: (o: number) => Promise<{ text?: string }> }
    }
  }
}

/**
 * 0.2.0+ ctx.mcpResources(dsh-mcp-resources 的 McpResourceRuntime)的最小形状。
 * 实测于 cli017(@deepseek-ai/dsh-mcp-resources 0.2.0-rc.2):register(server, provider)
 * 把本插件注册为一个"MCP resource server",模型经共享工具 list_mcp_resources /
 * read_mcp_resource(server='opencli')读到 opencli://sites/{site}/knowledge。
 * 该包不在本插件 peerDependencies 里(0.1.x 宿主没有)——必须 reflect 可选探测,缺失即退化为 RPC 路径。
 */
interface McpResourcesSeam {
  register?: (server: string, provider: { request: (req: { method: string; cursor?: string; uri?: string }, exec?: unknown) => Promise<unknown> }) => () => void
}

/**
 * 跨 node 版本目录扫描 opencli(vfox/nvm 切换免疫,纯函数可单测)。
 * 目录形态兼容:vfox cache(v-24.18.0/nodejs-24.18.0)、vfox sdks 平铺、nvm-windows。
 * 返回最高 node 版本副本的 main.js 绝对路径;没有则 null。
 */
export function scanOpencliAcrossNodeVersions(roots: string[]): string | null {
  let best: { ver: number[]; main: string } | null = null
  for (const root of roots) {
    let dirs: string[] = []
    try { dirs = readdirSync(root).map((d) => join(root, d)) } catch { continue }
    for (const dir of dirs) {
      const candidates = existsSync(join(dir, 'dist', 'src', 'main.js'))
        ? [join(dir, 'dist', 'src', 'main.js')]
        : (() => { try { return readdirSync(dir).map((d) => join(dir, d, 'dist', 'src', 'main.js')) } catch { return [] } })()
      for (const main of candidates) {
        if (!existsSync(main)) continue
        const ver = (dir.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1) ?? ['0', '0', '0']).map(Number)
        if (best === null || ver > best.ver) best = { ver, main }
      }
    }
  }
  return best?.main ?? null
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
  authProfile?: string
}

export class OpencliService extends TypertRemoteService {
  static inject = ['shell', 'tools', 'systemPrompt']

  private readonly bin: string
  private adapterCache: { at: number; json: unknown } | null = null
  private lastShellError: string | null = null
  private state: PluginState = { approval: 'on', disabled: [], schedules: [], runHistory: {}, audit: [] }
  /** 面板通知事件(调度失败等;内存态,最近 30 条) */
  private ingestEventList: IngestEvent[] = []
  /** 当前构建 sha256(懒计算) */
  private sha256Cache: string | null = null
  // 状态路径可用 DSH_OPENCLI_STATE 覆盖(单测隔离用):否则单测会把定时任务/审计写进真实用户状态文件
  private readonly statePath = process.env.DSH_OPENCLI_STATE !== undefined && process.env.DSH_OPENCLI_STATE.length > 0
    ? process.env.DSH_OPENCLI_STATE
    : join(homedir(), '.dsh', 'dsh-opencli-state.json')
  // 运行轨迹目录可用 DSH_OPENCLI_TRACE_DIR 覆盖(单测隔离用,与 statePath 同款约定)
  private readonly traceDir = process.env.DSH_OPENCLI_TRACE_DIR !== undefined && process.env.DSH_OPENCLI_TRACE_DIR.length > 0
    ? process.env.DSH_OPENCLI_TRACE_DIR
    : join(homedir(), '.dsh', 'opencli-traces')
  private loginCache: { at: number; results: LoginCheckResult } | null = null
  // usagePolicy：与 anweat 对齐的限流（并发/突发/冷却），默认与 anweat 一致
  private usagePolicy = { minDelayMs: 750, maxConcurrency: 2, burst: 3, cooldownMs: 30000, retryLimit: 2, maxPagesPerRun: 20, maxDepth: 2 }
  private callTimestamps: number[] = []
  private concurrent = 0
  private cooldownUntil = 0
  private queue: Array<() => void> = []
  // 限域登录（与 anweat authProfiles 对齐）：按 profile 限 allowedDomains，默认只读不回写
  private authProfiles: Record<string, { allowedDomains: string[]; storageStatePath?: string; persistState?: boolean }> = {
    // 示例：forum: { allowedDomains: ['example.com'], storageStatePath: 'D:/secrets/forum.json' }
  }
  private schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; lastRunAt?: string }> = []
  private runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string }>> = {}
  private automationMode: 'read-only' | 'standard' | 'autonomous' | 'unrestricted' = 'standard'
  private rulePacks: Array<{ matches: string[]; initScriptPath: string; initScriptSha256: string; steps: unknown[] }> = []
  private automationAssets = { persistenceMode: 'suggest' as const, activationMode: 'manual' as const }

  constructor(ctx: Context) {
    super(ctx, 'opencli')
    this.bin = this.resolveBin()
  }

  private resolveBin(): string {
    if (process.env.DSH_OPENCLI_BIN !== undefined && process.env.DSH_OPENCLI_BIN.length > 0) return process.env.DSH_OPENCLI_BIN
    // 优先插件本地依赖（与 anweat 同策略：本地优先/全局复用）
    try {
      // @ts-ignore - optional peer
      const pkg = require.resolve('@jackwener/opencli/package.json')
      const bin = join(dirname(pkg), 'dist', 'src', 'main.js')
      if (existsSync(bin)) return `node ${bin}`
    } catch { /* 无本地依赖则回退全局 */ }
    // npm 全局安装（vfox/nvm 结构）：node 同目录必有 @jackwener/opencli 入口。
    // 直接用 node 执行，避开 Windows pwsh/bash 对无扩展 shim 的静默忽略。
    const globalMain = join(dirname(process.execPath), 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js')
    if (existsSync(globalMain)) return `node "${globalMain}"`
    // 版本管理器切换免疫(实测:vfox use 24.21 后装在 24.18 的 opencli 静默失踪)
    const scanned = scanOpencliAcrossNodeVersions([
      join(homedir(), '.vfox', 'cache', 'nodejs'),
      join(homedir(), '.vfox', 'sdks', 'nodejs'),
      join(homedir(), '.nvm'),
    ])
    if (scanned !== null) return `node "${scanned}"`
    return 'opencli'
  }

  protected async [Service.init](): Promise<void> {
    // 先同步加载持久化状态,再注册工具/审批门:否则在途回读会冲掉已到达的
    // schedule-add 等写操作(构造器 fire-and-forget 时代的竞态)。
    await this.loadState()
    this.registerBrowserTools()
    this.registerAdvancedTools()
    this.registerSiteTool()
    this.registerDecisionTools()
    this.registerApprovalGate()
    this.registerKnowledgeResources()
    // 决策层后台预热:laya 权重冷加载约 60s,不能让 agent 的首次 so_verify/so_pick 吃这个延迟。
    // vitest 里跳过:测试会拉起真实 service,后台真加载权重既慢又晃动测试进程。
    if (process.env.VITEST === undefined) void this.so.prewarm()
    void this.injectSystemPrompt()
    if (this.schedules.some((s) => s.enabled)) this.startScheduler()
    // 兼容 anweat 生态：其他插件 inject: ['browser'] 时共用本服务。
    // 不能把带 typertRemote 的原始实例直接 provide：网关遍历 ctx.reflect.props 时,
    // 'browser' 条目会在 namespace 过滤前走 readBinding,serviceKey('browser')≠绑定
    // 里的 'opencli' 直接抛 inconsistent binding。改为提供绑定方法的无门面副本
    // (无 typertRemote 属性,网关扫描时被自然跳过)。
    try {
      const proto = Object.getPrototypeOf(this) as Record<string, unknown>
      const facade: Record<PropertyKey, unknown> = {}
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue
        const d = Object.getOwnPropertyDescriptor(proto, key)
        if (d !== undefined && typeof d.value === 'function') facade[key] = (d.value as (...args: unknown[]) => unknown).bind(this)
      }
      Object.defineProperty(facade, 'typertRemote', { get: () => undefined })
      ;(this.ctx as unknown as { provide: (n: string, v: unknown) => void }).provide('browser', facade)
    } catch { /* ignore */ }
  }

  // ── 模型工具 ──────────────────────────────────────────────

  /** SystemOne 决策层:key 从环境变量或 ~/.dsh/typesafe-key;provider 可换(laya 本地 ONNX 同接口)。 */
  private so: SystemOne = new SystemOne()

  /** 决策工具(verify 断言 / 封闭选项集选择):亚秒返回,不消耗大模型 token。 */
  private registerDecisionTools(): void {
    const t = this.ctx.tools
    t.register(defineTool({
      name: 'so_verify',
      description: 'SystemOne 亚秒判定:给定任务预期与页面文本,返回 P(符合预期)。比 LLM 断言省 token、快 10 倍以上。低置信(<0.7)时请回退自行判断',
      parameters: {
        expectation: { type: 'string', description: '任务预期(自然语言,如:页面显示的是知乎热榜列表)' },
        page_text: { type: 'string', description: '页面文本(截取相关部分,建议 ≤2000 字)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.so.ask(String(a.page_text ?? ''), {
          verify: { type: 'noul', instructions: String(a.expectation ?? '页面状态符合任务预期') },
        })
        if (!r.ok) return { text: `SystemOne 不可用:${r.error ?? '未知'}——请用常规方式自行判断` }
        const v = r.answers.verify
        const p = typeof v?.value === 'number' ? v.value : null
        if (p === null) return { text: '判定失败:模型未返回有效概率,请用常规方式自行判断' }
        const verdict = noulYes({ value: p, confidence: 1 }) ? '符合预期' : '不符合预期'
        return { text: `判定:${verdict}(P=${p.toFixed(2)},置信 ${r.latencyMs}ms 内返回)。低于 0.7 时建议人工复核` }
      },
    }))
    t.register(defineTool({
      name: 'so_pick',
      description: 'SystemOne 亚秒选择:给定目标与封闭选项集,返回最优选项 + 每项概率。适合路由/分类/元素操作选点',
      parameters: {
        goal: { type: 'string', description: '目标(自然语言)' },
        state: { type: 'string', description: '当前状态上下文(元素表/页面摘要,建议 ≤2000 字)' },
        options: { type: 'array', items: { type: 'string' }, description: '封闭选项集(2-30 个,再多请先分层)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const options = Array.isArray(a.options) ? a.options.map(String).filter((o) => o.length > 0) : []
        if (options.length < 2 || options.length > 30) return { text: `选项数量需在 2-30 之间(当前 ${options.length});过多请先分层(先选类目再选具体)` }
        const r = await this.so.ask(String(a.state ?? ''), {
          pick: { type: 'choice', instructions: String(a.goal ?? '选出最符合目标的选项'), criteria: Object.fromEntries(options.map((o) => [o, o])) },
        })
        if (!r.ok) return { text: `SystemOne 不可用:${r.error ?? '未知'}——请用常规方式自行选择` }
        const pick = r.answers.pick
        const choice = typeof pick?.value === 'string' ? pick.value : ''
        const probs = pick?.probabilities ?? {}
        const top = Object.entries(probs).sort((x, y) => (y[1] as number) - (x[1] as number)).slice(0, 3)
          .map(([o, p2]) => `${o} ${(Number(p2) * 100).toFixed(0)}%`).join(' / ')
        return { text: `选择:${choice}\n置信 ${(Number(pick?.confidence ?? 0) * 100).toFixed(0)}%\nTop3:${top}` }
      },
    }))
  }

  private registerBrowserTools(): void {
    const t = this.ctx.tools
    const run = async (session: string | undefined, argv: string[]): Promise<{ text: string }> => {
      // 录屏回放(BrowserSkill #79 同款需求):browser_* 全族与 replay/crawl 等 RPC 透传
      // 统一走 runBrowserTraced 单点,每步 trace 落盘
      const out = await this.runBrowserTraced(session, argv)
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
      output: { schema: { type: 'json' }, render: browserDoCardRender },
      execute: async (a: ToolArgs) => {
        const cmd = String(a.command)
        if (!BROWSER_DO_ALLOW.has(cmd)) return { text: `不允许的子命令:${cmd}(白名单见工具说明)` }
        return run(a.session, [cmd, ...(a.args ?? [])])
      },
    }))
    t.register(defineTool({
      name: 'browser_close',
      description: '释放当前浏览器会话的 tab 租约（对应 opencli browser <session> close）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['close']),
    }))
    t.register(defineTool({
      name: 'browser_read',
      description: '读当前页 URL/标题/正文（browser_extract 别名，适合公开网页快速读取）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['extract']),
    }))
    t.register(defineTool({
      name: 'browser_status',
      description: '运行时状态：daemon/扩展/适配器数/限流与审批策略（先调它再选工具）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        return { text: JSON.stringify(st, null, 2).slice(0, 4000) }
      },
    }))
    t.register(defineTool({
      name: 'browser_install',
      description: '环境自检：daemon/扩展/opencli 三件套缺谁补谁（daemon 未跑给 restart 命令，扩展未连给安装指引）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        if (st.ok && st.daemon?.running === true) return { text: '环境就绪：daemon 运行中，扩展已连接，无需安装。' }
        return { text: `环境缺失：${st.error ?? 'daemon 未运行'}。请先 npm i -g @jackwener/opencli，再 opencli daemon restart，并到 https://github.com/jackwener/opencli/releases 装 BrowserBridge 扩展。` }
      },
    }))
    t.register(defineTool({
      name: 'opencli_status',
      description: 'OpenCLI 连接检查：实际跑 doctor，报告 daemon/extension/profile 连通性（不要只看开关，看这个）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        return { text: JSON.stringify(st, null, 2).slice(0, 4000) }
      },
    }))
    t.register(defineTool({
      name: 'site_batch',
      description: '批量采集:一条 site 子命令 fan-out 到多个站点并行执行,汇总各站结果;每站结果经 SystemOne noul 真实性判定(空结果/风控页会被标"疑似静默失败")。例:sites=["zhihu","weibo","bilibili"], command="hot" 同时拉三站热榜。',
      parameters: {
        command: { type: 'string', description: 'site 子命令(不含站点名),如 hot/search/recent' },
        sites: { type: 'array', items: { type: 'string' }, description: '站点名列表(2-6 个)' },
        args: { type: 'array', items: { type: 'string' }, description: '可选:命令参数' },
      },
      output: { schema: { type: 'json' }, render: siteBatchCardRender },
      execute: async (a: { command?: unknown; sites?: unknown; args?: unknown }): Promise<{ text: string }> => {
        const command = String(a.command ?? '').trim()
        const sites = Array.isArray(a.sites) ? a.sites.map(String).slice(0, 6) : []
        if (!command) return { text: 'command 不能为空。' }
        if (sites.length < 2) return { text: 'sites 至少 2 个站点。' }
        if (sites.some((x) => !/^[\w.-]+$/.test(x))) return { text: '站点名含非法字符。' }
        // 派发前目录预检(只读缓存,不触发 list):站点不存在立刻提醒,省 45s 超时
        let known: Set<string> | null = null
        const domainOf = new Map<string, string>()
        if (this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS) {
          known = new Set()
          for (const x of normalizeAdapterList(this.adapterCache.json)) {
            const n = String(x.name).toLowerCase()
            known.add(n)
            if (x.domain !== undefined) domainOf.set(n, String(x.domain).toLowerCase())
          }
        }
        const unknownSites = known === null ? [] : sites.filter((s) => !known!.has(s))
        // 登录态 preflight(BrowserSkill #132 同源问题:同域并行互相踩登录态/标签页且无报错):
        // 同域站点改为组内串行,其余照常并行
        const byDomain = new Map<string, string[]>()
        for (const s of sites) {
          const d = domainOf.get(s)
          if (d !== undefined) { const arr = byDomain.get(d) ?? []; arr.push(s); byDomain.set(d, arr) }
        }
        const collisions = [...byDomain.entries()].filter(([, ss]) => ss.length > 1)
        const chained = new Set(collisions.flatMap(([, ss]) => ss))
        const preflightNote = collisions.length > 0
          ? `preflight:同域冲突已串行化(${collisions.map(([d, ss]) => `${ss.join(' + ')} → ${d}`).join(';')}),避免登录态/标签页互踩\n\n`
          : ''
        const args = Array.isArray(a.args) ? a.args.map(String) : []
        const runOne = async (site: string): Promise<{ site: string; ok: boolean; badge: string; text: string }> => {
          try {
            const out = await this.runOpencli([site, command, ...args], 45_000)
            if (out.exitCode !== 0) return { site, ok: false, badge: '', text: out.stderr.slice(0, 900) }
            const v = await this.verifyResult(site, command, out.stdout)
            return { site, ok: true, badge: this.verifyBadge(v), text: out.stdout.slice(0, 900) }
          } catch (err: unknown) {
            return { site, ok: false, badge: '', text: err instanceof Error ? err.message.slice(0, 200) : 'failed' }
          }
        }
        const settled = await Promise.all([
          ...sites.filter((s) => !chained.has(s)).map(runOne),
          ...collisions.map(async ([, ss]) => { const out = []; for (const s of ss) out.push(await runOne(s)); return out }),
        ])
        const results = settled.flat()
        // 按请求顺序回填输出
        results.sort((x, y) => sites.indexOf(x.site) - sites.indexOf(y.site))
        const okN = results.filter((r) => r.ok).length
        const silentN = results.filter((r) => r.badge.includes('疑似静默失败')).length
        const head = `批量采集 ${okN}/${sites.length} 站成功${silentN > 0 ? `,其中 ${silentN} 站疑似静默失败(exit 0 但内容无效)` : ''}:\n\n`
        const pre = `${unknownSites.length > 0 ? `目录预检:以下站点不在适配器目录,请确认拼写:${unknownSites.join(', ')}\n\n` : ''}${preflightNote}`
        const body = results.map((r) => `== ${r.site} ${r.ok ? '✓' : '✗'}${r.badge} ==\n${r.text}`).join('\n\n')
        return { text: pre + head + body }
      },
    }))

    t.register(defineTool({
      name: 'site_knowledge',
      description: '站点知识卡:对某站动手前先读——结构化命令目录+已知坑+失败签名恢复表。命中失败签名按 recovery 自救,别现场试错。知识分发上游已砍(#2539),本卡是补位',
      parameters: {
        site: { type: 'string', description: '站点名(如 weibo / xiaohongshu)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const site = String(a.site ?? a.value ?? '').trim()
        if (site.length === 0 || !/^[\w.-]+$/.test(site)) return { text: '站点名非法(如 weibo)' }
        const list = await this.adapterList()
        if (list === null) return { text: `目录不可用 | ${this.lastShellError ?? '未知'}` }
        const raw = (this.adapterCache as { json?: unknown } | null)?.json
        const k = buildKnowledge(site, Array.isArray(raw) ? raw as RawEntry[] : [])
        if (k === null) return { text: `目录里没有 ${site}(用 opencli_catalog 确认拼写)。不在目录的通用需求直接用 browser_* 原语自由浏览` }
        return { text: renderKnowledgeMarkdown(k).slice(0, 6000) }
      },
    }))
    t.register(defineTool({
      name: 'opencli_catalog',
      description: '按 query/site/access 过滤 170+ 适配器目录，单次最多 100 条（不确定命令先查它，别猜）',
      parameters: {
        query: { type: 'string', description: '关键词（如 search）' },
        site: { type: 'string', description: '站点名（如 reddit）' },
        access: { type: 'string', enum: ['read', 'write'], description: '权限过滤' },
        limit: { type: 'string', description: '返回条数，默认 10，最大 100' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const list = await this.adapterList()
        if (list === null) return { text: `opencli list 不可用 | ${this.lastShellError ?? '未知'}` }
        const q = a.query !== undefined ? String(a.query).toLowerCase() : ''
        const site = a.site !== undefined ? String(a.site).toLowerCase() : ''
        const filtered = list.filter((x) => (q.length === 0 || x.name.toLowerCase().includes(q)) && (site.length === 0 || x.name.toLowerCase().includes(site))).slice(0, 100)
        return { text: JSON.stringify(filtered.slice(0, 10), null, 2).slice(0, 4000) + `\n…共 ${filtered.length} 条` }
      },
    }))
    t.register(defineTool({
      name: 'opencli_run',
      description: '通用 OpenCLI argv 网关（除 unrestricted 外走审批；常规搜索优先 site 直调）',
      parameters: {
        args: { type: 'array', items: { type: 'string' }, description: 'argv 数组（如 ["reddit","search","DeepSeek Harness"]），不拼 shell' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const argv = Array.isArray(a.args) ? a.args.map(String) : []
        if (argv.length === 0) return { text: 'args 为空' }
        const out = await this.runOpencli(argv)
        return { text: this.renderOut(out) }
      },
    }))
  }

  private registerAdvancedTools(): void {
    const t = this.ctx.tools
    const out = (text: string): { text: string } => ({ text })
    t.register(defineTool({
      name: 'script_catalog',
      description: '列出内置只读脚本 article/links/jsonld/forms（不跑外来代码，读文章最稳）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => out('内置只读脚本：article（正文Markdown）/ links（链接）/ jsonld / forms，用 script_run_builtin 运行'),
    }))
    t.register(defineTool({
      name: 'script_run_builtin',
      description: '运行内置只读脚本（独立 context，不执行外来代码）',
      parameters: {
        name: { type: 'string', description: 'article|links|jsonld|forms' },
        url: { type: 'string', description: '目标 URL（可选，默认当前页）' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.scriptRunBuiltin({ name: String(a.command ?? a.value ?? 'article'), url: a.url !== undefined ? String(a.url) : undefined })
        return out(r.result ?? r.error ?? 'ok')
      },
    }))
    t.register(defineTool({
      name: 'script_validate',
      description: '校验外部 UserScript（需 @match + @grant none，≤64KB），不执行',
      parameters: { code: { type: 'string', description: 'UserScript 源码' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.scriptValidate({ code: String(a.text ?? '') })
        return out(JSON.stringify(r).slice(0, 2000))
      },
    }))
    t.register(defineTool({
      name: 'userscript_run',
      description: '运行外部 UserScript（强制域名匹配，standard 需审批，unrestricted 直行）',
      parameters: {
        code: { type: 'string', description: '已 validate 通过的源码' },
        url: { type: 'string', description: '目标 URL' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.userscriptRun({ code: String(a.text ?? ''), url: String(a.url ?? '') })
        return out(r.result ?? r.error ?? 'ok')
      },
    }))
    t.register(defineTool({
      name: 'recipe_run',
      description: '跑 25 步内 Playwright Recipe（wait/click/fill/type/press/select/check/hover/scroll/extract/assert/screenshot，可审计）',
      parameters: { steps: { type: 'string', description: 'JSON 数组字符串' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        try {
          const steps = JSON.parse(String(a.text ?? a.value ?? '[]')) as Array<{ type: string; selector?: string; value?: string }>
          const r = await this.recipeRun({ steps })
          return out(r.ok ? 'recipe 执行成功' : (r.error ?? '失败'))
        } catch (e) { return out(`steps 解析失败：${e instanceof Error ? e.message : String(e)}`) }
      },
    }))
    t.register(defineTool({
      name: 'automation_search',
      description: '检索已存自动化资产（录制/定时），只回 ID+摘要，不进全文',
      parameters: { query: { type: 'string', description: '关键词' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.automationSearch({ query: a.text !== undefined ? String(a.text) : undefined })
        return out(JSON.stringify(r.hits).slice(0, 2000))
      },
    }))
    t.register(defineTool({
      name: 'automation_run',
      description: '按 ID 运行已存资产（录制/定时），限域+限流仍生效',
      parameters: { id: { type: 'string', description: '资产 ID' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.automationRun({ id: String(a.value ?? a.text ?? '') })
        return out(r.ok ? '执行成功' : (r.error ?? '失败'))
      },
    }))
    t.register(defineTool({
      name: 'browser_crawl',
      description: '有限广度遍历（同源默认，maxPages 20 / maxDepth 2 硬限，usagePolicy 限流）',
      parameters: {
        url: { type: 'string', description: '起始 URL' },
        maxPages: { type: 'string', description: '最大页数，默认 20' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.crawl({ url: String(a.url ?? ''), maxPages: Number(a.value ?? 20) })
        return out(r.ok ? 'crawl 已启动（MVP 单页）' : (r.error ?? '失败'))
      },
    }))
    t.register(defineTool({
      name: 'trace_replay',
      description: '录屏回放:最近 30 步 browser 命令的 markdown 时间线(时间/命令/exit/耗时,失败步附输出摘录)。复盘"上次为什么失败"先调它,别盲目重试',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => out(await this.renderTraceTimeline(30)),
    }))
  }

  private registerSiteTool(): void {
    // W3 命令选择分层:so_pick 两步路由(先站后命令),亚秒零 token;
    // 与 systemPrompt 目录共存——目录仍是兜底,本工具是"不想翻目录时"的快速路。
    this.ctx.tools.register(defineTool({
      name: 'site_route',
      description: '亚秒命令路由:给目标(自然语言),SystemOne 两步 choice(先选站再选命令)直接给出 site 命令行+备选。不确定命令名时用它,别翻目录猜',
      parameters: {
        goal: { type: 'string', description: '目标(如:看微博热搜/搜 B站罗翔视频/查 arxiv agent 论文)' },
        site: { type: 'string', description: '可选:已知站点名则锁定该站,只做命令层选择' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs): Promise<{ text: string }> => {
        const goal = String(a.goal ?? a.text ?? '').trim()
        if (goal.length === 0) return { text: 'goal 不能为空' }
        const list = await this.adapterList()
        if (list === null) return { text: `目录不可用 | ${this.lastShellError ?? '未知'}` }
        // 第一层:选站(候选压到 top 24 by 命令数,choice 单题候选 ≤30 官方范式)
        let pool = list
        if (typeof a.site === 'string' && a.site.length > 0) {
          const lock = a.site.toLowerCase()
          pool = list.filter((x) => x.name.toLowerCase() === lock)
          if (pool.length === 0) return { text: `目录里没有 ${a.site}(用 opencli_catalog 确认)` }
        }
        let siteName = pool[0]?.name ?? ''
        if (pool.length > 1) {
          const cand = pool.slice(0, 24)
          const r1 = await this.so.ask(cand.map((x) => `${x.name}(${x.commandCount} 命令,示例:${x.commands.slice(0, 3).join('/')})`).join('; '), {
            pickSite: { type: 'choice', instructions: `目标:${goal}。选出最合适的站点`, criteria: Object.fromEntries(cand.map((x) => [x.name, `${x.commandCount} 命令:${x.commands.slice(0, 5).join(',')}...`])) },
          })
          if (r1.ok && typeof r1.answers.pickSite?.value === 'string' && r1.answers.pickSite.value.length > 0) siteName = r1.answers.pickSite.value
          else return { text: '路由不可用(SystemOne down)——请直接查 systemPrompt 目录选命令' }
        }
        // 第二层:该站选命令
        const detail = await this.adapterDetail({ name: siteName } as never).catch(() => null)
        const cmds = detail?.ok === true ? detail.commands.map((c: { name: string; description?: string }) => ({ n: c.name, d: c.description ?? '' })) : pool.find((x) => x.name === siteName)?.commands.slice(0, 24).map((c) => ({ n: c, d: '' })) ?? []
        if (cmds.length === 0) return { text: `${siteName} 无命令目录` }
        const r2 = await this.so.ask(`站点:${siteName}。目标:${goal}`, {
          pickCmd: { type: 'choice', instructions: '选出最合适的命令', criteria: Object.fromEntries(cmds.slice(0, 24).map((c) => [c.n, c.d])) },
        })
        if (!r2.ok || typeof r2.answers.pickCmd?.value !== 'string') return { text: `站点锁定 ${siteName};命令层 SystemOne 不可用,备选:${cmds.slice(0, 6).map((c) => c.n).join(', ')}` }
        const top = Object.entries(r2.answers.pickCmd.probabilities ?? {}).sort((x, y) => (y[1] as number) - (x[1] as number)).slice(0, 3).map(([c, p]) => `${c} ${(Number(p) * 100).toFixed(0)}%`).join(' / ')
        return { text: `命令:\`site ${siteName} ${r2.answers.pickCmd.value}\`${top ? `\nTop3:${top}` : ''}(低置信或不对时查 site_knowledge ${siteName} 或 systemPrompt 目录)` }
      },
    }))
    this.ctx.tools.register(defineTool({
      name: 'site',
      description: '调用站点适配器(在用户登录态上返回结构化结果,比逐页点击快且稳)。adapter/command 见 systemPrompt 里的适配器目录;示例:site bilibili search 关键词=罗翔。authProfile 限域（需配置 allowedDomains）',
      parameters: {
        adapter: { type: 'string', description: '适配器名(如 bilibili/zhihu/arxiv)' },
        command: { type: 'string', description: '适配器子命令(如 search/hot/top)' },
        args: { type: 'array', items: { type: 'string' }, description: '子命令参数' },
        authProfile: { type: 'string', description: '限域登录态 profile（需在配置中预设 allowedDomains，默认不回写 Cookie）' },
      },
      output: { schema: { type: 'json' }, render: siteCardRender },
      execute: async (a: ToolArgs): Promise<{ text: string }> => {
        const adapter = String(a.adapter)
        const command = String(a.command)
        if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) {
          return { text: `非法 adapter/command:${adapter} ${command}` }
        }
        if (this.state.disabled.includes(adapter)) {
          return { text: `适配器 ${adapter} 已被禁用(设置→浏览器代理 可重新启用)。` }
        }
        const domain = await this.domainOf(adapter)
        const authErr = this.checkAuthProfile(domain, a.authProfile !== undefined ? String(a.authProfile) : undefined)
        if (authErr !== null) return { text: authErr }
        const out = await this.runOpencli([adapter, command, ...(a.args ?? [])])
        const text = this.renderOut(out)
        if (text.trim() === '[]') return { text: `适配器 ${adapter} 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 ${adapter}，或运行 \`opencli ${adapter} login\` 后用面板“巡检登录态”确认。` }
        if (out.exitCode !== 0 && /Navigation rejected/i.test(text)) return { text: `导航被拒（${adapter}）：请确认 Chrome 扩展已连接且已登录 ${adapter}，或先 \`opencli ${adapter} login\`。原错：${text.slice(0,300)}` }
        // 真实性判定标注(与 site_batch/try-run 同源 verifyResult/verifyBadge):exit 0 ≠ 有效数据,
        // 登录墙/风控页/空壳以 ⚠ 前缀标注进 {text},预览卡(siteCardRender)据此落 ⚠ 琥珀。
        // 只标注不拦截——模型仍见原文(与 site_batch 先例一致;拦截级处置留给无人值守的 schedule 路径)。
        // warmOnly:laya 预热窗口内跳过 noul 兜底(规则层照跑)——最高频工具不背 ~60s 冷加载/权重下载;
        // SystemOne 不可用/未预热时 verifyResult 返回 null → 不标注,行为与升级前一致
        if (out.exitCode === 0) {
          const badge = this.verifyBadge(await this.verifyResult(adapter, command, out.stdout, { warmOnly: true }))
          if (badge !== '') return { text: `${badge} ${text}` }
        }
        return { text }
      },
    }))
  }

  // ── MCP Resources 知识暴露(dsh 0.2 seam;老宿主退化为 knowledge-get RPC) ──

  /**
   * 把知识卡注册为 MCP Resources:server='opencli',URI=opencli://sites/{site}/knowledge。
   * seam 缺失(0.1.x 宿主)/注册失败一律静默降级——插件主体与 knowledge-get RPC 不受影响。
   * 数据层是纯函数 handleMcpResourceRequest(src/knowledge.ts),此处只注入目录缓存。
   */
  private registerKnowledgeResources(): void {
    let runtime: McpResourcesSeam | undefined
    try {
      runtime = (this.ctx as unknown as { reflect?: { get?: (p: string, f?: boolean) => unknown } }).reflect?.get?.('mcpResources', false) as McpResourcesSeam | undefined
    } catch { runtime = undefined }
    if (runtime === undefined || typeof runtime.register !== 'function') return
    try {
      const dispose = runtime.register('opencli', {
        request: async (req) => {
          const list = await this.adapterList()
          if (list === null) throw new Error(`opencli 目录不可用 | ${this.lastShellError ?? '未知'}`)
          const raw = (this.adapterCache as { json?: unknown } | null)?.json
          return handleMcpResourceRequest(req as Parameters<typeof handleMcpResourceRequest>[0], Array.isArray(raw) ? raw as RawEntry[] : undefined)
        },
      })
      // 注册进 runtime 的全局层,但生命周期挂回本插件:卸载时同步摘除,不留僵尸 server
      ;(this.ctx as unknown as { effect?: (f: () => unknown) => unknown }).effect?.(() => dispose)
    } catch { /* seam 在但注册异常(如重名):不阻断插件加载 */ }
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
    this.directoryText = `浏览器代理(dsh-opencli):你在 Chrome 里登录的网站,dsh 都能用。170+ 站点适配器(知乎/B站/微博/arxiv/github/...),用 site <适配器> <命令>。

按用户原话选:
- "知乎热榜前10" / "B站搜热榜" / "微博热搜"   → site zhihu hot / site bilibili search
- "打开这个网页"     → browser_open url → browser_state(拿 [N] 索引)
- "GitHub 找 X" / "arxiv 找 agent"  → site github search X / site arxiv search agent
- "在微博发..."     → site weibo post...(写命令会弹审批,用户点允许才发)
- "录一段:抓 arxiv 每天 AI 论文"   → 引导用户点"开始录" → 真实 Chrome 操作

辅助工具(都在本插件,直接调):
- site_knowledge <站> → 动手前读知识卡(命令目录+已知坑+失败签名恢复表),别现场试错
- so_verify(页面文本+预期) / so_pick(目标+选项集) → 亚秒判定,不耗大模型 token;低置信再自己判断
- site_batch → 多站同命令并行采集,自带同域冲突串行化(preflight)与"疑似静默失败"标注
- 定时任务建在面板"自动化"页,可加 watch 关键词(命中即🔔通知);撞风控墙自动 2 分钟退避

不要:写命令不在用户登录态时跑(先 opencli <site> login);cookie/密码不放工具参数。${state}。${gate}\n${buildAdapterDirectory(active)}`
  }

  // ── RPC(面板) ────────────────────────────────────────────

  @Remote('status')
  async status(): Promise<OpencliStatus> {
    const version = await this.runOpencli(['--version'])
    if (version.exitCode !== 0) {
      return { ok: false, bin: null, version: null, daemon: null, adapterSites: null, error: `opencli 不可用(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}` }
    }
    const daemon = await this.daemonStatus()
    // 目录(8MB)不阻塞健康区:有缓存给缓存,无缓存后台异步预热(adapters RPC 负责完整加载)
    const cached = this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS ? normalizeAdapterList(this.adapterCache.json) : null
    void this.adapterList().catch(() => {})
    const list = cached
    // opencli 某些版本把 --version 写到 stderr:两流合并取首个非空行
    let vraw = (version.stdout.trim() || version.stderr.trim()).split('\n')[0]?.trim() ?? ''
        return {
      ok: true,
      bin: this.bin,
      version: vraw || null,
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
    return { ok: true, approvalOn: this.state.approval === 'on', disabled: [...this.state.disabled], sha256: this.buildSha256(), audit7d: this.auditCount7d() }
  }

  /** 当前构建的 sha256 前 16 位(供应链自证;读取失败给 null,绝不编造)。 */
  private buildSha256(): string | null {
    if (this.sha256Cache !== null) return this.sha256Cache
    try {
      const self = fileURLToPath(import.meta.url)
      this.sha256Cache = createHash('sha256').update(readFileSync(self)).digest('hex').slice(0, 16)
    } catch { this.sha256Cache = null }
    return this.sha256Cache
  }

  private auditCount7d(): number {
    const cut = Date.now() - 7 * 86_400_000
    return (Array.isArray(this.state.audit) ? this.state.audit : []).filter((a) => new Date(a.at).getTime() >= cut).length
  }

  private recordAudit(command: string, reason: string): void {
    // state 可能被测试/旧文件整体替换成无 audit 的净对象:这里自愈,别让审计挂掉审批
    if (!Array.isArray(this.state.audit)) this.state.audit = []
    this.state.audit.unshift({ at: new Date().toISOString(), command, reason, mode: this.automationMode })
    if (this.state.audit.length > 50) this.state.audit.length = 50
    void this.saveState()
  }

  /**
   * 执行结果真实性判定:exit 0 ≠ 拿到有效数据——上游静默失败类 issue
   * (#2497 EMPTY_RESULT/#2469 600B 壳/#2520 假成功)的插件侧防线。site_batch/try-run/定时三处共用。
   * 两层:①确定性规则(opencli 失败词汇表/错误 JSON/空输出)——真机实测 laya 对这类文本判别力不足(P≈0.9),规则是主力;
   * ②laya noul 兜底判未知形态,只做标注。返回:null=不可用(调用方走原行为);verdict=false 即拦截级失败;
   * noul 0.35-0.7 可疑(verdict=true 但 p<0.7)。真机判别数据见 docs/USER-NEEDS-RESEARCH-20260925.md。
   */
  private async verifyResult(site: string, command: string, text: string, opts?: { warmOnly?: boolean }): Promise<{ verdict: boolean; p: number; why?: string } | null> {
    const trimmed = text.trim()
    if (trimmed.length === 0 || trimmed === '[]') return { verdict: false, p: 0, why: '空输出' }
    // 规则层:opencli 已知失败词汇 + 风控/登录墙关键词(实测覆盖 #2497/#2515/#2528/#2470 类)
    const head = trimmed.slice(0, 2000)
    const RULES: Array<[RegExp, string]> = [
      [/EMPTY_RESULT|NO_DATA|AUTH_REQUIRED|NOT_LOGGED_IN|RATE_LIMITED|NAVIGATION_REJECTED|COMMAND_EXEC/i, 'opencli 失败标记'],
      [/请先登录|未登录|登录已过期|请完成验证|验证码|人机验证|扫码登录/, '登录/风控墙'],
      [/login (first|required)|please (log ?in|sign ?in)|access denied|verifying your browser|just a moment|challenge|captcha/i, '登录/风控墙'],
    ]
    for (const [re, why] of RULES) {
      if (re.test(head)) return { verdict: false, p: 0.05, why }
    }
    try {
      const j = JSON.parse(head) as unknown
      if (j !== null && typeof j === 'object' && 'error' in (j as Record<string, unknown>)) return { verdict: false, p: 0.05, why: '错误 JSON' }
    } catch { /* 非 JSON:继续 */ }
    // warmOnly(热路径标注用):laya 未预热完时跳过 noul 兜底——绝不把 ~60s 权重冷加载/下载
    // 挂进 site 调用;规则层已跑完(零成本),标注缺席=降级回原行为。桩 so 无 warm 字段视为就绪(向后兼容)
    if (opts?.warmOnly === true && (this.so as { warm?: boolean }).warm === false) return null
    // noul 兜底:只对规则放行的文本做模型判定
    if (!this.so.configured) return null
    const r = await this.so.ask(head, {
      valid: { type: 'noul', instructions: `site ${site} ${command} 的输出包含真实的网站数据内容` },
    })
    if (!r.ok) return null
    const v = r.answers.valid
    // 注意:两个 provider 都归一化为 {type,value,confidence}——读 value,不要读原始字段名 noul
    const p = typeof v?.value === 'number' ? v.value : null
    if (p === null) return null
    // 修复(核验A-1):noul 放弃阈值判失败(错误文本同样 0.9+),仅弱标注不拦截;拦截权归规则层
    return { verdict: true, p, ...(p < 0.7 ? { why: '模型弱标注:内容可疑(仅提示)' } : {}) }
  }

  /** 把判定结果翻译成人读的标注(无判定返回空串)。 */
  private verifyBadge(v: { verdict: boolean; p: number; why?: string } | null): string {
    if (v === null) return ''
    if (!v.verdict) return `(⚠ 疑似静默失败:${v.why ?? `P=${v.p.toFixed(2)}`})`
    if (v.p < 0.7) return `(⚠ 内容可疑:P=${v.p.toFixed(2)},建议复核)`
    return `(实测有效 P=${v.p.toFixed(2)})`
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

  @Remote('schedule-add')
  async scheduleAdd(request: { site: string; cron: string; retry?: number; notify?: boolean; watch?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (typeof request.site !== 'string' || request.site.trim().length === 0) return { ok: false, error: 'site 不能为空' }
    if (typeof request.cron !== 'string' || request.cron.trim().length === 0) return { ok: false, error: 'cron 不能为空' }
    const site = request.site.trim()
    const cron = request.cron.trim()
    // 修复(核验A-4):垃圾 cron 静默入库永不执行;五段+词法校验
    const toks = cron.trim().split(/\s+/)
    if (toks.length !== 5 || !toks.every((t) => /^(\*|\d+|\*\/\d+|\d+(,\d+)*)$/.test(t))) return { ok: false, error: 'cron 非法:需 5 段(分 时 日 月 周),支持 * 数字 */步长 逗号列表' }
    // watch:关键词监控(逗号/空格分隔,≤120 字符)。命中任一关键词 → ingest 事件 watch-hit。
    // v1 故意用确定性匹配(noul 模糊"值得关注的变化"留 v2):真机实测 laya 判别力不足,宁缺勿误报。
    const watch = typeof request.watch === 'string' && request.watch.trim().length > 0 ? request.watch.trim().slice(0, 120) : undefined
    // 幂等去重:governor 队列下 add/remove 可能乱序(重试/双击),同 site+cron 的
    // 已有任务直接复用,不再生成僵尸副本(审查复现过 3 条重复)
    const dup = this.schedules.find((s) => s.site === site && s.cron === cron)
    if (dup !== undefined) {
      if (watch !== undefined && dup.watch !== watch) { dup.watch = watch; await this.saveState() }
      return { ok: true, id: dup.id }
    }
    const id = String(Date.now())
    const entry: typeof this.schedules[number] = { id, site, cron, createdAt: new Date().toISOString(), enabled: true }
    if (typeof request.retry === 'number' && Number.isFinite(request.retry)) entry.retry = Math.max(1, Math.min(5, Math.round(request.retry)))
    if (typeof request.notify === 'boolean') entry.notify = request.notify
    if (watch !== undefined) entry.watch = watch
    this.schedules.push(entry)
    await this.saveState()
    this.startScheduler()
    return { ok: true, id }
  }

  @Remote('schedule-list')
  async scheduleList(): Promise<{ ok: boolean; schedules: Array<typeof this.schedules[number] & { history?: Array<{ at: string; ok: boolean; summary: string }> }> }> {
    return {
      ok: true,
      schedules: this.schedules.map((s) => ({ ...s, history: (this.runHistory[s.id] ?? []).slice(0, 3) })),
    }
  }


  @Remote('ingest-events')
  async ingestEvents(): Promise<{ ok: boolean; events: IngestEvent[] }> {
    return { ok: true, events: this.ingestEventList.slice(0, 30) }
  }

  @Remote('audit-list')
  async auditList(): Promise<AuditListResult> {
    return {
      ok: true,
      count7d: this.auditCount7d(),
      items: this.state.audit.slice(0, 20).map((a) => ({ at: a.at, command: a.command, reason: a.reason, mode: a.mode })),
    }
  }

  @Remote('logs-tail')
  async logsTail(): Promise<LogsTailResult> {
    const candidates = [join(homedir(), '.opencli', 'daemon.log'), join(homedir(), '.opencli', 'logs', 'daemon.log')]
    for (const c of candidates) {
      try {
        const text = await readFile(c, 'utf8')
        const lines = text.split('\n').filter((l) => l.trim().length > 0)
        return { ok: true, source: c, lines: lines.slice(-80) }
      } catch { /* 试下一个候选 */ }
    }
    const diag: string[] = []
    if (this.lastShellError !== null && this.lastShellError !== '') diag.push(`lastShellError: ${this.lastShellError}`)
    diag.push(`bin: ${this.bin}`)
    diag.push(`mode: ${this.automationMode} · approval: ${this.state.approval} · schedules: ${this.schedules.length}`)
    return { ok: true, source: null, lines: diag, hint: 'opencli 未暴露日志文件;以上为最近诊断快照,可在 dsh 对话说"opencli 诊断"获取实时日志' }
  }

  /** 最近 browser 命令轨迹(倒序=最新在前,默认 50):跨当日与昨日等历史文件聚合,面板「运行轨迹」/trace_replay 共用。 */
  @Remote('trace-list')
  async traceList(request?: { limit?: number }): Promise<TraceListResult> {
    // 网关对空 args 会传 undefined(真机复现,knowledge-get 同款):request 可选链 + 上限钳制
    const limit = Math.max(1, Math.min(500, Math.floor(Number(request?.limit ?? 50)) || 50))
    let traces: TraceLine[] = []
    try {
      // 文件按日期倒序、同日主档在 .1(轮转旧档)之前——逐档前插保持全局时间序,攒够 limit 即止
      const files = readdirSync(this.traceDir)
        .map((f) => /^trace-(\d{8})\.jsonl(\.1)?$/.exec(f))
        .filter((m): m is RegExpExecArray => m !== null)
        .sort((a, b) => b[1].localeCompare(a[1]) || (a[2] !== undefined ? 1 : 0) - (b[2] !== undefined ? 1 : 0))
      for (const m of files) {
        traces = this.readTraceFile(join(this.traceDir, m[0])).concat(traces)
        if (traces.length >= limit) break
      }
    } catch { /* 目录不存在(还没跑过 browser 命令):空表 */ }
    return { ok: true, traces: traces.slice(-limit).reverse() }
  }

  /** 某日全量轨迹(date=yyyymmdd;当日轮转档 .1 在主档之前,保持时间序)。 */
  @Remote('trace-get')
  async traceGet(request: { date: string }): Promise<TraceListResult> {
    const date = String(request?.date ?? '').trim()
    // date 直接拼文件名:严格 8 位数字,杜绝路径穿越
    if (!/^\d{8}$/.test(date)) return { ok: false, traces: [], error: `date 需为 yyyymmdd(收到:${date.slice(0, 20)})` }
    const traces = [
      ...this.readTraceFile(this.traceFileOf(date, true)),
      ...this.readTraceFile(this.traceFileOf(date, false)),
    ]
    if (traces.length === 0) return { ok: false, traces: [], error: `该日(${date})无轨迹` }
    return { ok: true, traces }
  }


  /** opencli launcher 启动 Chrome 时的 CDP 候选端口(launcher.js 同源)。 */
  private static readonly CDP_PORTS = [9222, 9234, 9236, 9238]
  private cdpCache: { at: number; found: boolean; port: number | null; browser: string | null } | null = null

  /** 探测 daemon Chrome 的 CDP 端点:并发 probe /json/version,响应含 "Browser" 即命中。 */
  private async probeCdp(): Promise<{ found: boolean; port: number | null; browser: string | null }> {
    if (this.cdpCache !== null && Date.now() - this.cdpCache.at < 15_000) {
      return { found: this.cdpCache.found, port: this.cdpCache.port, browser: this.cdpCache.browser }
    }
    const envPort = Number(process.env.OPENCLI_CDP_PORT ?? 0)
    const ports = (envPort > 0 ? [envPort, ...OpencliService.CDP_PORTS] : OpencliService.CDP_PORTS).slice(0, 6)
    const probeOne = async (port: number): Promise<{ port: number; browser: string } | null> => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })
        if (!res.ok) return null
        const body = (await res.text()).trim()
        if (body.includes('Browser')) return { port, browser: body.slice(0, 200) }
        return null
      } catch { return null }
    }
    const hit = (await Promise.all(ports.map(probeOne))).find((x) => x !== null) ?? null
    this.cdpCache = { at: Date.now(), found: hit !== null, port: hit?.port ?? null, browser: hit?.browser ?? null }
    return { found: hit !== null, port: hit?.port ?? null, browser: hit?.browser ?? null }
  }

  @Remote('browser-cdp')
  async browserCdp(): Promise<{ ok: boolean; found: boolean; endpoint: string | null; port: number | null; browser: string | null; hint?: string }> {
    const c = await this.probeCdp()
    if (!c.found) {
      return { ok: true, found: false, endpoint: null, port: null, hint: '未探测到 CDP——先启动一次浏览器会话(daemon 首条 browser 命令会带调试端口拉起 Chrome)' }
    }
    return { ok: true, found: true, endpoint: `http://127.0.0.1:${c.port}`, port: c.port, browser: c.browser }
  }

  @Remote('schedule-run-now')
  async scheduleRunNow(p: { id: string }): Promise<{ ok: boolean; error?: string }> {
    const sch = this.schedules.find((s) => s.id === String(p.id ?? ''))
    if (sch === undefined) return { ok: false, error: '未找到' }
    void this.runSiteCommand(sch.site, sch.id)
    return { ok: true }
  }

  @Remote('schedule-history')
  async scheduleHistory(p: { id: string }): Promise<{ ok: boolean; history: Array<{ at: string; ok: boolean; summary: string }>; snapshots?: Array<{ at: string; bytes: number; file: string }> }> {
    // 时间线数据源:运行史(内存,近 5) + 快照索引(落盘,近 50,含体积用于趋势)
    const id = String(p.id ?? '')
    let snapshots: Array<{ at: string; bytes: number; file: string }> | undefined
    try {
      const dir = join(homedir(), '.dsh', 'opencli-snapshots', id)
      snapshots = readdirSync(dir).slice(-50).map((f) => {
        let at = f.replace(/\.json$/, '').replace(/-/g, ':'), bytes = 0
        try { bytes = JSON.parse(readFileSync(join(dir, f), 'utf8')).bytes ?? 0 } catch { /* ignore */ }
        return { at, bytes, file: f }
      })
    } catch { /* 无快照目录 */ }
    return { ok: true, history: this.runHistory[id] ?? [], ...(snapshots !== undefined ? { snapshots } : {}) }
  }

  @Remote('schedule-toggle')
  async scheduleToggle(request: { id: string; enabled: boolean }): Promise<{ ok: boolean; error?: string }> {
    const hit = this.schedules.find((s) => s.id === String(request.id ?? ''))
    if (hit === undefined) return { ok: false, error: '未找到' }
    hit.enabled = request.enabled !== false
    await this.saveState()
    if (hit.enabled) this.startScheduler()
    return { ok: true }
  }

  /** 知识包导出:全部/指定站的知识卡写 ~\.dsh\opencli-knowledge\,可分享/进版本库。
   * 上游 #2539 砍掉 sitemap 分发后的第三方补位;在线路径见 registerKnowledgeResources(MCP Resources)与 knowledge-get RPC。 */
  @Remote('knowledge-export')
  async knowledgeExport(request?: { sites?: string[] }): Promise<{ ok: boolean; paths?: string[]; error?: string }> {
    const list = await this.adapterList()
    if (list === null) return { ok: false, error: `目录不可用 | ${this.lastShellError ?? '未知'}` }
    const raw = (this.adapterCache as { json?: unknown } | null)?.json
    const entries = Array.isArray(raw) ? raw as RawEntry[] : []
    if (entries.length === 0) return { ok: false, error: '目录缓存为空' }
    // 网关对空 args 会传 undefined(真机复现):request 必须可选链
    const reqSites = request?.sites
    const requested = Array.isArray(reqSites) && reqSites.length > 0
      ? reqSites.map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 0)
      : [...new Set(entries.map((e) => (e.site ?? e.command?.split('/')[0] ?? '').toLowerCase()).filter((s) => s.length > 0))]
    const dir = join(homedir(), '.dsh', 'opencli-knowledge')
    const paths: string[] = []
    const at = new Date().toISOString()
    for (const site of requested.slice(0, 200)) {
      const k = buildKnowledge(site, entries, at)
      if (k === null) continue
      const file = join(dir, `${site}.md`)
      try {
        await mkdir(dir, { recursive: true })
        await writeFile(file, renderKnowledgeMarkdown(k), 'utf8')
        paths.push(file)
      } catch { /* 单站写失败不阻断其余 */ }
    }
    if (paths.length === 0) return { ok: false, error: '没有可导出的站点(目录为空或站点名不匹配)' }
    return { ok: true, paths }
  }

  /**
   * 知识卡直取 RPC(面板/外部可调,不经模型会话):sites 缺省返回健康度异常(degraded/notice)
   * 且在目录内的站。MCP resources seam 不可用的 0.1.x 宿主上的等价路径;机制与迁移路径见 docs/MCP-RESOURCES.md。
   */
  @Remote('knowledge-get')
  async knowledgeGet(request?: { sites?: string[] }): Promise<{ ok: boolean; cards?: Array<{ site: string; uri: string; markdown: string }>; error?: string }> {
    const list = await this.adapterList()
    if (list === null) return { ok: false, error: `目录不可用 | ${this.lastShellError ?? '未知'}` }
    const raw = (this.adapterCache as { json?: unknown } | null)?.json
    const entries = Array.isArray(raw) ? raw as RawEntry[] : []
    if (entries.length === 0) return { ok: false, error: '目录缓存为空' }
    // 网关对空 args 会传 undefined(真机复现):request 必须可选链;同名站去重(大小写归一后可能重复)
    const reqSites = request?.sites
    const requested = Array.isArray(reqSites) && reqSites.length > 0
      ? [...new Set(reqSites.map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 0))]
      : [...new Set(Object.entries(SITE_HEALTH).filter(([, h]) => h.status === 'degraded' || h.status === 'notice')
          .map(([s]) => s)
          .filter((s) => entries.some((e) => (e.site ?? e.command?.split('/')[0] ?? '').toLowerCase() === s)))]
    const cards: Array<{ site: string; uri: string; markdown: string }> = []
    for (const site of requested.slice(0, 30)) {
      const k = buildKnowledge(site, entries)
      if (k === null) continue
      cards.push({ site, uri: knowledgeResourceUri(site), markdown: renderKnowledgeMarkdown(k) })
    }
    if (cards.length === 0) return { ok: false, error: '没有可返回的知识卡(目录为空或站点名不匹配)' }
    return { ok: true, cards }
  }

  @Remote('schedule-remove')
  async scheduleRemove(request: { id: string }): Promise<{ ok: boolean; error?: string }> {
    const i = this.schedules.findIndex((s) => s.id === String(request.id ?? ''))
    if (i < 0) return { ok: false, error: '未找到' }
    this.schedules.splice(i, 1)
    delete this.runHistory[String(request.id ?? '')]
    await this.saveState()
    return { ok: true }
  }

  @Remote('try-run')
  async tryRun(request: { line: string }): Promise<{ ok: boolean; text?: string; error?: string }> {
    const line = String(request.line ?? '').trim()
    if (!line) return { ok: false, error: '命令为空' }
    const [head, ...rest] = line.split(/\s+/)
    if (head !== 'site' || rest.length < 2) return { ok: false, error: '只支持 site <适配器> <命令> [参数...]，如：site arxiv recent cs.AI' }
    const [adapter, command, ...args] = rest as string[]
    if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) return { ok: false, error: `非法 adapter/command:${adapter} ${command}` }
    if (this.state.disabled.includes(adapter)) return { ok: false, error: `适配器 ${adapter} 已被禁用` }
    const out = await this.runOpencli([adapter, command, ...args])
    const text = this.renderOut(out)
    if (out.exitCode !== 0) {
      // 修复(核验A-3):exit≠0 原样透传原始 YAML,绕过统一恢复指引。归类+附插件层指引
      const raw = out.stdout + out.stderr
      const kind = /BROWSER_CONNECT|extension not connected/i.test(raw) ? '扩展未连接——请打开 Chrome 并启用 OpenCLI 扩展(装法见 https://github.com/jackwener/opencli/releases),再在面板「总览」巡检登录态'
        : /AUTH_REQUIRED|请先登录|NOT_LOGGED_IN/i.test(raw) ? '登录态缺失——先在真实 Chrome 登录该站或运行 opencli <site> login'
        : /验证码|captcha|Verifying your browser/i.test(raw) ? '风控墙——停止自动化,冷却后人工过盾,写操作务必低频'
        : null
      return { ok: false, error: kind !== null ? '【' + kind + '】原始输出:' + text.slice(0, 300) : text }
    }
    // 真实性判定:exit 0 也可能拿到空结果/风控页/登录提示(上游静默失败类的面板侧防线)
    const v = await this.verifyResult(adapter, command, out.stdout)
    if (v !== null && !v.verdict) {
      return { ok: false, error: `适配器 ${adapter} 返回的内容被判定无效(P=${v.p.toFixed(2)},${v.why ?? '内容异常'})。请先在真实 Chrome 登录 ${adapter},或运行 \`opencli ${adapter} login\` 后用面板“巡检登录态”确认。原文:${text.slice(0, 300)}` }
    }
    const badge = this.verifyBadge(v)
    return { ok: true, text: badge ? `${badge} ${text}` : text }
  }

  @Remote('replay')
  async replay(request: { step: string }): Promise<{ ok: boolean; error?: string }> {
    const step = typeof request.step === 'string' ? request.step.trim() : ''
    if (step.length === 0) return { ok: false, error: 'step 为空' }
    // MVP：仅回显步骤，真实回放走 site/browser_* 透传（与 client 的 localStorage 录制互补）
    const [head, ...rest] = step.split(' ')
    if (head === 'site' && rest.length >= 2) {
      const [adapter, command, ...args] = rest
      if (adapter !== undefined && command !== undefined) {
        const out = await this.runOpencli([adapter, command, ...args])
        return { ok: out.exitCode === 0, error: out.exitCode !== 0 ? this.renderOut(out) : undefined }
      }
    }
    if (head.startsWith('browser_')) {
      const out = await this.runBrowserTraced('dsh', [head.replace('browser_', ''), ...rest])
      return { ok: out.exitCode === 0, error: out.exitCode !== 0 ? this.renderOut(out) : undefined }
    }
    return { ok: false, error: `未知步骤:${step}` }
  }

  // L3 高级自动化：脚本/配方/泛爬（对齐 anweat 21 工具，MVP 桩 + 透传）
  @Remote('script-catalog')
  async scriptCatalog(): Promise<{ ok: boolean; scripts: Array<{ name: string; sha256: string; description: string }> }> {
    return { ok: true, scripts: [
      { name: 'article', sha256: 'builtin-article', description: '只读：提取正文为 Markdown' },
      { name: 'links', sha256: 'builtin-links', description: '只读：提取页面链接' },
      { name: 'jsonld', sha256: 'builtin-jsonld', description: '只读：提取 JSON-LD' },
      { name: 'forms', sha256: 'builtin-forms', description: '只读：提取表单结构' },
    ] }
  }
  @Remote('script-run-builtin')
  async scriptRunBuiltin(request: { name: string; url?: string }): Promise<{ ok: boolean; result?: string; error?: string }> {
    const name = String(request.name ?? '')
    if (!['article','links','jsonld','forms'].includes(name)) return { ok: false, error: `未知内置脚本:${name}` }
    // 透传为 browser extract 变体(经 runBrowserTraced 落轨迹)
    const out = await this.runBrowserTraced('dsh', ['extract', ...(request.url !== undefined ? [request.url] : [])])
    return { ok: out.exitCode === 0, result: this.renderOut(out), error: out.exitCode !== 0 ? this.renderOut(out) : undefined }
  }
  @Remote('crawl')
  async crawl(request: { url: string; maxPages?: number; maxDepth?: number }): Promise<{ ok: boolean; error?: string }> {
    const url = String(request.url ?? '').trim()
    if (url.length === 0) return { ok: false, error: 'url 为空' }
    const maxPages = Math.min(Number(request.maxPages ?? 20), this.usagePolicy.maxPagesPerRun ?? 20)
    // MVP：单页提取，真实广度遍历后续接 browser_crawl(经 runBrowserTraced 落轨迹)
    const out = await this.runBrowserTraced('dsh', ['open', url])
    if (out.exitCode !== 0) return { ok: false, error: this.renderOut(out) }
    return { ok: true }
  }

  @Remote('script-validate')
  async scriptValidate(request: { code: string }): Promise<{ ok: boolean; meta?: { name: string; match: string; grant: string }; error?: string }> {
    const code = String(request.code ?? '')
    if (!code.includes('@match') || !code.includes('@grant none')) return { ok: false, error: '需包含 @match + @grant none' }
    if (code.length > 64 * 1024) return { ok: false, error: '源码 >64KB' }
    const m = code.match(/@match\s+(\S+)/)?.[1] ?? ''
    return { ok: true, meta: { name: code.match(/@name\s+(.+)/)?.[1]?.trim() ?? 'unnamed', match: m, grant: 'none' } }
  }
  @Remote('userscript-run')
  async userscriptRun(request: { code: string; url: string }): Promise<{ ok: boolean; result?: string; error?: string }> {
    const v = await this.scriptValidate({ code: String(request.code ?? '') })
    if (!v.ok) return { ok: false, error: v.error }
    if (this.automationMode !== 'unrestricted') return { ok: false, error: '需 unrestricted 模式或审批（当前 ' + this.automationMode + '）' }
    const out = await this.runBrowserTraced('dsh', ['eval', String(request.code ?? '').slice(0, 200)])
    return { ok: out.exitCode === 0, result: this.renderOut(out) }
  }
  @Remote('recipe-run')
  async recipeRun(request: { steps: Array<{ type: string; selector?: string; value?: string }> }): Promise<{ ok: boolean; error?: string }> {
    const steps = Array.isArray(request.steps) ? request.steps : []
    if (steps.length === 0 || steps.length > 25) return { ok: false, error: 'steps 1-25' }
    for (const s of steps) {
      const t = String((s as Record<string,unknown>).type ?? '')
      if (!['wait','click','fill','type','press','select','check','hover','scroll','extract','assert','screenshot'].includes(t)) return { ok: false, error: `未知步骤:${t}` }
      // MVP：逐条透传为 browser_*（抽取/点击等）
      const sel = (s as Record<string,unknown>).selector !== undefined ? String((s as Record<string,unknown>).selector) : undefined
      const val = (s as Record<string,unknown>).value !== undefined ? String((s as Record<string,unknown>).value) : undefined
      const argv = [t, ...(sel !== undefined ? [sel] : []), ...(val !== undefined ? [val] : [])]
      const out = await this.runBrowserTraced('dsh', argv)
      if (out.exitCode !== 0) return { ok: false, error: this.renderOut(out) }
    }
    return { ok: true }
  }
  @Remote('automation-search')
  async automationSearch(request: { query?: string }): Promise<{ ok: boolean; hits: Array<{ id: string; name: string }> }> {
    const q = String(request.query ?? '').toLowerCase()
    const hits = this.schedules.filter((s) => s.site.toLowerCase().includes(q) || q.length === 0).slice(0, 5).map((s) => ({ id: s.id, name: s.site }))
    return { ok: true, hits }
  }
  @Remote('automation-develop')
  async automationDevelop(request: { action: string; id?: string; code?: string }): Promise<{ ok: boolean; error?: string }> {
    if (request.action === 'get' && typeof request.id === 'string') {
      const hit = this.schedules.find((s) => s.id === request.id)
      return hit !== undefined ? { ok: true } : { ok: false, error: '未找到' }
    }
    if (request.action === 'save') return { ok: true }
    if (request.action === 'validate') return { ok: true }
    if (request.action === 'test') return { ok: true }
    return { ok: false, error: `未知 action:${String(request.action)}` }
  }
  @Remote('automation-run')
  async automationRun(request: { id: string }): Promise<{ ok: boolean; error?: string }> {
    const hit = this.schedules.find((s) => s.id === String(request.id ?? ''))
    if (hit === undefined) return { ok: false, error: '未找到' }
    return this.replay({ step: `site ${hit.site}` })
  }

  @Remote('automation-mode-get')
  async automationModeGet(): Promise<{ ok: boolean; mode: string }> {
    return { ok: true, mode: this.automationMode }
  }
  @Remote('automation-mode-set')
  async automationModeSet(request: { mode: string }): Promise<{ ok: boolean; error?: string }> {
    const m = String(request.mode ?? '')
    if (!['read-only','standard','autonomous','unrestricted'].includes(m)) return { ok: false, error: `未知模式:${m}` }
    this.automationMode = m as typeof this.automationMode
    return { ok: true }
  }

  @Remote('promote-recording')
  async promoteRecording(request: { name: string; steps: string[]; minRuns?: number; minSessions?: number }): Promise<{ ok: boolean; recipeId?: string; error?: string }> {
    const name = String(request.name ?? '').trim()
    if (!name) return { ok: false, error: 'name 必填' }
    if (!Array.isArray(request.steps) || request.steps.length === 0) return { ok: false, error: 'steps 必填' }
    const id = `rec-${Date.now()}`
    const recipe = {
      kind: 'recipe', id, name, status: 'draft', revision: 1,
      domains: [], tags: ['auto-promoted'],
      inputNames: [], createdAt: new Date().toISOString(),
      source: 'recording', originalSteps: request.steps,
    }
    return { ok: true, recipeId: id }
  }

  @Remote('install-opencli-skill')
  async installOpencliSkill(): Promise<{ ok: boolean; path?: string; error?: string }> {
    // 写 ~\.dsh\opencli-skill-inbox.md 让 dsh 助手读
    const path = `${homedir()}\\.dsh\\opencli-skill-inbox.md`
    const body = [
      '# opencli-skill 装清单',
      '',
      '1. 找到 opencli 仓的 skills 目录:',
      '   `~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/`',
      '2. 把它复制到 dsh 技能目录:',
      '   `cp -r ~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/* ~/.dsh/skills/`',
      '3. 重启 dsh web',
      '4. 验证:在 dsh 对话框说"加载 opencli-usage skill"',
      '',
      '完成后:你（dsh 助手）即可调用 opencli 的 6 个 skill（adapter-author / autofix / browser / browser-sitemap / sitemap-author / usage）',
    ].join('\n')
    try {
      const { writeFile, mkdir } = await import('node:fs/promises')
      await mkdir(`${homedir()}\\.dsh`, { recursive: true })
      await writeFile(path, body, 'utf8')
      return { ok: true, path }
    } catch (e) { return { ok: false, error: String(e) } }
  }
  @Remote('rulepacks-list')
  async rulePacksList(): Promise<{ ok: boolean; packs: typeof this.rulePacks }> {
    return { ok: true, packs: [...this.rulePacks] }
  }
  @Remote('rulepacks-set')
  async rulePacksSet(request: { packs: typeof this.rulePacks }): Promise<{ ok: boolean; error?: string }> {
    if (!Array.isArray(request.packs)) return { ok: false, error: 'packs 需为数组' }
    for (const p of request.packs) {
      if (typeof (p as Record<string, unknown>).initScriptSha256 !== 'string' || String((p as Record<string,unknown>).initScriptSha256).length !== 64) return { ok: false, error: 'initScriptSha256 需 64 位' }
      const s = (p as Record<string,unknown>).initScriptPath
      if (typeof s !== 'string' || s.length === 0) return { ok: false, error: 'initScriptPath 不能为空' }
    }
    this.rulePacks = request.packs as typeof this.rulePacks
    return { ok: true }
  }

  /** R1 审批门:site 的 write 命令(发帖/点赞/下单等)先经 dsh 原生审批(ask→allowed-once)。
   * 任何异常一律放行给 next(),绝不因审批门自身故障阻塞工具。 */
  private registerApprovalGate(): void {
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      try {
        if (this.automationMode === 'unrestricted') return await next()
        const a = (exec.arguments ?? {}) as { adapter?: unknown; command?: unknown }
        const argsOk = typeof a.adapter === 'string' && typeof a.command === 'string' && a.adapter.length > 0 && a.command.length > 0
        if (this.automationMode === 'read-only' && exec.name === 'site' && argsOk) {
          const acc = await this.lookupAccess(a.adapter as string, a.command as string)
          if (acc !== 'read') {
            const roReason = `只读模式：site ${String(a.adapter)} ${String(a.command)} 为写操作，已拦截。`
            this.recordAudit(`site ${String(a.adapter)} ${String(a.command)}`, roReason)
            return { kind: 'ask', reason: roReason }
          }
          return await next()
        }
        // 只在确有可能 ask 时才付出缓存查询成本;其余情况 access 传占位值,判定函数自会放行
        const needsAccess = exec.name === 'site' && this.state.approval === 'on' && argsOk && !this.state.disabled.includes(a.adapter)
        const access = needsAccess ? await this.lookupAccess(a.adapter as string, a.command as string) : 'unknown'
        const decision = approvalDecision(this.state.approval === 'on', this.state.disabled, exec.name, a.adapter, a.command, access)
        if (decision === 'allow') return await next()
        const reason = decision === 'ask-write'
          ? `site ${String(a.adapter)} ${String(a.command)} 是写操作——会在你的登录态浏览器里真实执行(发帖/点赞/下单/改数据)。`
          : `site ${String(a.adapter)} ${String(a.command)} 未能确认权限类型,按写操作审批。`
        this.recordAudit(`site ${String(a.adapter)} ${String(a.command)}`, reason)
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

  private async acquireGovernor(): Promise<void> {
    // 冷却期
    const now = Date.now()
    if (now < this.cooldownUntil) await new Promise((res) => setTimeout(res, this.cooldownUntil - now))
    // 并发
    if (this.concurrent >= this.usagePolicy.maxConcurrency) {
      await new Promise<void>((res) => { this.queue.push(res) })
    }
    this.concurrent++
    // 突发 + minDelay
    const burstWindow = 1000
    this.callTimestamps = this.callTimestamps.filter((t) => Date.now() - t < burstWindow)
    if (this.callTimestamps.length >= this.usagePolicy.burst) {
      const oldest = this.callTimestamps[0] ?? 0
      const wait = burstWindow - (Date.now() - oldest)
      if (wait > 0) await new Promise((res) => setTimeout(res, wait))
    }
    const last = this.callTimestamps[this.callTimestamps.length - 1]
    if (last !== undefined) {
      const delay = this.usagePolicy.minDelayMs - (Date.now() - last)
      if (delay > 0) await new Promise((res) => setTimeout(res, delay))
    }
  }
  private releaseGovernor(): void {
    this.concurrent = Math.max(0, this.concurrent - 1)
    this.callTimestamps.push(Date.now())
    const next = this.queue.shift()
    if (next !== undefined) next()
  }
  private noteRateLimit(text: string): void {
    if (/429|502|503|504|Retry-After/i.test(text)) this.cooldownUntil = Date.now() + this.usagePolicy.cooldownMs
  }
  private async domainOf(adapter: string): Promise<string | null> {
    const list = await this.adapterList()
    const hit = list?.find((a) => a.name === adapter)
    return hit?.domain ?? null
  }
  private checkAuthProfile(domain: string | null, authProfile?: string): string | null {
    if (authProfile === undefined || authProfile.length === 0) return null
    const prof = this.authProfiles[authProfile]
    if (prof === undefined) return `未知 authProfile:${authProfile}`
    if (domain === null || domain === 'null' || domain === 'localhost' || domain === '127.0.0.1') return null
    if (!prof.allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return `authProfile ${authProfile} 不允许访问域 ${domain}（允许：${prof.allowedDomains.join(', ')}）`
    return null
  }

  /** shell 调用形态(跨版本自探测锁定):resolved=shell.resolve(spec) 后执行;direct=直传 spec;array=command 传 argv 数组。 */
  private shellMode: 'resolved' | 'direct' | 'array' | null = null

  /**
   * 0.2.0+ 原生执行:ctx.subprocess.spawn(argv)(官方 bash 工具同款 seam;
   * 旧 ctx.shell.execute 在 0.2.0 需要 sandbox policy 管线,插件直调已不可靠)。
   * 返回 null = 该 seam 不可用,调用方回落老路径。
   */
  private async runSubprocess(argv: string[], timeoutMs: number, stdoutMaxBytes: number): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
    // 不能把 'subprocess' 放进 static inject:cordis 对声明服务做加载期解析,0.1.x 宿主没有它会
    // 让整个插件加载失败。改走 reflect 旁路(可选读取,缺失即 undefined→回落老 shell 路径)。
    let sub: SubprocessSeam | undefined
    try {
      sub = (this.ctx as unknown as { reflect?: { get?: (p: string, f?: boolean) => unknown } }).reflect?.get?.('subprocess', false) as SubprocessSeam | undefined
    } catch { return null }
    if (sub === undefined || typeof sub.spawn !== 'function') return null
    // bin 形态:裸命令 / node "<main.js>" / env 覆盖——按空白+引号切 argv
    const argv0 = this.bin === 'opencli'
      ? ['opencli']
      : (this.bin.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [this.bin]).map((s) => s.replace(/^"|"$/g, ''))
    const h = sub.spawn({
      argv: [...argv0, ...argv],
      cwd: homedir(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: stdoutMaxBytes }, stderr: { maxBytes: 262_144 } },
      graceMs: 1_000,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const outcome = await h.done
    const read = async (r: { readFrom: (o: number) => Promise<{ text?: string }> } | undefined): Promise<string> => {
      try { return String((await r?.readFrom(0))?.text ?? '') } catch { return '' }
    }
    return {
      exitCode: typeof outcome?.exitCode === 'number' ? outcome.exitCode : 1,
      stdout: await read(h.collected?.stdout),
      stderr: await read(h.collected?.stderr),
    }
  }

  private async runOpencli(argv: string[], timeoutMs = 60000, stdoutMaxBytes = 1048576): Promise<{ exitCode: number; stdout: string; stderr: string; unavailable?: string }> {
    await this.acquireGovernor()
    try {
      // 0.2.0+ 原生 seam 优先
      const viaSub = await this.runSubprocess(argv, timeoutMs, stdoutMaxBytes)
      if (viaSub !== null) {
        this.noteRateLimit(`${viaSub.stdout}\n${viaSub.stderr}`)
        return viaSub
      }
      // 回落:0.1.x 的 ctx.shell 多形态(run/execute × resolve/直传/argv)
      const shellAny = this.ctx.shell as any
      const runner = typeof shellAny.run === 'function' ? shellAny.run.bind(shellAny) : (typeof shellAny.execute === 'function' ? shellAny.execute.bind(shellAny) : null)
      if (runner === null) return { exitCode: 1, stdout: '', stderr: 'dsh shell 能力不可用(既无 run 也无 execute)' }
      // 0.2.0 起 spec 必须携带沙箱策略(否则 shell 内部 destructure policy.mode 直接抛错);
      // 插件是可信进程内消费者,用 danger-full-access(与 0.1.x 无沙箱行为一致);老版本忽略多余字段。
      const policy = { mode: 'danger-full-access' as const, workspaceRoot: homedir() }
      const baseSpec = { command: [this.bin, ...argv].join(' '), timeoutMs, stdoutMaxBytes, policy }
      const argvSpec = { ...baseSpec, command: [this.bin, ...argv], policy }
      const attempts: Array<'resolved' | 'direct' | 'array'> = this.shellMode !== null ? [this.shellMode] : ['resolved', 'direct', 'array']
      let out: { exitCode: number; stdout: string; stderr: string } = { exitCode: 1, stdout: '', stderr: '' }
      for (const mode of attempts) {
        let spec: unknown
        let threw = false
        try {
          spec = mode === 'resolved' ? (typeof shellAny.resolve === 'function' ? shellAny.resolve({ ...baseSpec } as ShellExecRequest) : baseSpec)
            : mode === 'direct' ? baseSpec
            : argvSpec
          const raw = await runner(spec)
          // 归一化:0.1.5 流式 {text} 与字符串形态统一为纯文本,维持下游契约
          const asText = (x: unknown): string => {
            if (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string') return (x as { text: string }).text
            return typeof x === 'string' ? x : ''
          }
          out = {
            exitCode: typeof raw?.exitCode === 'number' ? raw.exitCode : 1,
            stdout: asText(raw?.stdout),
            stderr: asText(raw?.stderr),
          }
        } catch (e) {
          threw = true
          out = { exitCode: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
        }
        // 形态判定:调用于抛错且(有输出或退出码 0)才锁定该形态;
        // 抛错一律换下一形态(异常文本不是真实 stderr,不能当有效输出)
        if (!threw && (out.stdout.length > 0 || out.stderr.length > 0 || out.exitCode === 0)) {
          this.shellMode = mode
          break
        }
      }
      this.noteRateLimit(`${out.stdout}\n${out.stderr}`)
      return out
    } catch (e) {
      // 沙箱不可用（家目录启动 dsh web 时 ACL temp ⊂ workspace 必然触发）:
      // 降级为"无可用 opencli"，绝不让插件初始化把整个 dsh web 拖死
      const msg = e instanceof Error ? e.message : String(e)
      if (/SandboxUnavailableError|no sandbox backend|ACL restricted-token/i.test(msg)) {
        return { exitCode: -1, stdout: '', stderr: msg.slice(0, 500), unavailable: msg.slice(0, 300) }
      }
      throw e
    } finally {
      this.releaseGovernor()
    }
  }

  private renderOut(out: { exitCode: number; stdout: string; stderr: string }): string {
    if (out.exitCode === 0) return clip(out.stdout, OUTPUT_LIMIT)
    return `命令失败(退出码 ${out.exitCode}):\n${clip(out.stdout, 2000)}\n${clip(out.stderr, 2000)}`
  }

  // ── 录屏回放:browser 命令运行轨迹(BrowserSkill #79 同款需求) ──

  /** 轨迹文件日期键(本地日期 yyyymmdd,recordTrace 写入与 trace-list/get 读取共用同一把尺)。 */
  private static traceDateKey(d = new Date()): string {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }

  /**
   * 轨迹时间列:at 是 UTC ISO,直接 slice(11,19) 显示会与用户本地时钟错位(东八区差 8h,
   * 凌晨命令对不上体感)——转本地 HH:MM:SS,与 traceDateKey 的本地分档同一时区体感。
   * 非法时间原样回退(形状校验后仍可能是垃圾字符串)。
   */
  private static traceClock(at: string): string {
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return at.slice(11, 19)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  private traceFileOf(dateKey: string, rotated = false): string {
    return join(this.traceDir, `trace-${dateKey}.jsonl${rotated ? '.1' : ''}`)
  }

  /**
   * browser 透传统一入口:runOpencli + recordTrace。browser_* 工具族(registerBrowserTools 的 run())
   * 与 replay / script-run-builtin / crawl / userscript-run / recipe-run 五个 RPC 透传都经此——
   * 任何入口执行的 browser 命令都进「运行轨迹」,复盘链路不断(评审:面板回放按钮曾绕过单点)。
   */
  private async runBrowserTraced(session: string | undefined, argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const started = Date.now()
    const out = await this.runOpencli(['browser', session ?? 'dsh', ...argv])
    this.recordTrace(`browser ${session ?? 'dsh'} ${argv.join(' ')}`, out, Date.now() - started)
    return out
  }

  /**
   * 每条 browser 命令追加一行 JSONL 到 <traceDir>/trace-<yyyymmdd>.jsonl:
   * {at, cmd, exitCode, ms, outHead(输出前 200 字,失败时 stderr 优先)}。
   * 同步写(量级 ~300B/条,相对秒级浏览器操作可忽略,且对调用方可确定性断言);
   * 单文件超 5MB 轮转为 .1(旧 .1 丢弃,保留前一份);任何失败静默,绝不影响命令本身。
   */
  private recordTrace(cmd: string, out: { exitCode: number; stdout: string; stderr: string }, ms: number): void {
    try {
      try { mkdirSync(this.traceDir, { recursive: true }) } catch { return }
      const file = this.traceFileOf(OpencliService.traceDateKey())
      try {
        if (statSync(file).size > 5 * 1024 * 1024) {
          try { unlinkSync(`${file}.1`) } catch { /* 无旧档 */ }
          renameSync(file, `${file}.1`)
        }
      } catch { /* 文件不存在(当日首条)或轮转失败:照常追加 */ }
      const outHead = (out.exitCode === 0 ? out.stdout : `${out.stderr}\n${out.stdout}`.trim()).slice(0, 200)
      appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), cmd, exitCode: out.exitCode, ms, outHead })}\n`, 'utf8')
    } catch { /* 静默:轨迹缺失不阻断命令 */ }
  }

  /** 解析一个轨迹文件为行数组(缺文件/JSON 解析失败/**形状不对**的脏行一律跳过,不抛错)。 */
  private readTraceFile(file: string): TraceLine[] {
    const lines: TraceLine[] = []
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { return lines }
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const v = JSON.parse(line) as unknown
        // 形状校验:'null'/'数字'/'{"exitCode":0}' 这类 parse 成功但非 TraceLine 的行,
        // 会让消费端 at.slice 直接 TypeError 且 client 无 ErrorBoundary——整卡崩白(评审)。
        if (v === null || typeof v !== 'object'
          || typeof (v as TraceLine).at !== 'string' || typeof (v as TraceLine).cmd !== 'string'
          || typeof (v as TraceLine).exitCode !== 'number' || typeof (v as TraceLine).ms !== 'number'
          || typeof (v as TraceLine).outHead !== 'string') continue
        lines.push(v)
      } catch { /* 脏行跳过 */ }
    }
    return lines
  }

  /** trace_replay 的 markdown 时间线(新→旧):时间/命令/exit/耗时,失败步附输出摘录。 */
  private async renderTraceTimeline(limit: number): Promise<string> {
    const r = await this.traceList({ limit })
    if (!r.ok || r.traces.length === 0) return '暂无运行轨迹(还没有 browser 命令执行记录)。跑一条 browser_* 后再来看。'
    // 单元格净化:换行折为可见 \n 标记(userscript eval 等多行 cmd 会把表格行拆断),
    // 空白折叠为单格,竖线转义;命令不再用反引号包裹——载荷内嵌 ` 也不会截断 code span。
    const esc = (s: string): string => s.replace(/\r?\n/g, '\\n').replace(/\s+/g, ' ').replace(/\|/g, '\\|')
    const out = [
      `最近 ${r.traces.length} 步 browser 命令(新→旧,exit≠0 为失败):`,
      '',
      '| 时间 | 命令 | exit | 耗时 |',
      '|---|---|---|---|',
      ...r.traces.map((t) => `| ${OpencliService.traceClock(t.at)} | ${esc(t.cmd.slice(0, 80))} | ${t.exitCode} | ${t.ms}ms |`),
    ]
    const fails = r.traces.filter((t) => t.exitCode !== 0).slice(0, 3)
    if (fails.length > 0) {
      out.push('', '失败步输出摘录(复盘起点):')
      for (const f of fails) out.push(`- [${OpencliService.traceClock(f.at)}] ${esc(f.cmd.slice(0, 60))} → ${esc(f.outHead.slice(0, 120))}`)
    }
    return out.join('\n').slice(0, 4000)
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
      if (Array.isArray(parsed.schedules)) this.schedules = parsed.schedules
      if (parsed.runHistory !== undefined && typeof parsed.runHistory === 'object') this.runHistory = parsed.runHistory as typeof this.runHistory
      if (Array.isArray(parsed.audit)) this.state.audit = parsed.audit.filter((a) => a !== null && typeof a === 'object' && typeof (a as { at?: unknown }).at === 'string')
    } catch { /* 无文件或损坏:用默认值 */ }
  }

  private async saveState(): Promise<void> {
    try {
      await mkdir(join(homedir(), '.dsh'), { recursive: true })
      await writeFile(this.statePath, JSON.stringify({ ...this.state, schedules: this.schedules, runHistory: this.runHistory, audit: this.state.audit }, null, 2), 'utf8')
    } catch { /* 状态写不进(权限等):仅本次会话生效 */ }
  }

  /** 简易 5 段 cron 匹配(分 时 日 月 周;支持 *、数字、星斜步长)。 */
  private cronMatches(cron: string, now: Date): boolean {
    const parts = cron.trim().split(/\s+/)
    if (parts.length !== 5) return false
    const vals = [now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1, now.getDay()]
    const mins = [0, 0, 1, 1, 0]
    const maxs = [59, 23, 31, 12, 6]
    return parts.every((spec, i) => {
      if (spec === '*') return true
      if (spec.startsWith('*/')) {
        const step = Number(spec.slice(2))
        if (!Number.isFinite(step) || step <= 0) return false
        return (vals[i] - mins[i]) % step === 0
      }
      // 修复(模拟使用 Finding 2.1):原实现只校验数字合法,从不与当前时间比较——
      // 任何"数字都在范围内"的 cron(含默认 0 9 * * *)每分钟触发,高频轰炸站点。
      // 逗号列表语义=some(任一字段命中即匹配)
      return spec.split(',').some((tok) => { const n = Number(tok); return Number.isFinite(n) && n >= mins[i] && n <= maxs[i] && n === vals[i] })
    })
  }

  private startScheduler(): void {
    if (this.schedTimer !== undefined) return
    this.schedTimer = setInterval(() => {
      const now = new Date()
      const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
      for (const sch of this.schedules) {
        if (!sch.enabled) continue
        const histKey = `${sch.id}:${minuteKey}`
        if (this.runHistory[histKey] !== undefined) continue
        if (!this.cronMatches(sch.cron, now)) continue
        this.runHistory[histKey] = [{ at: now.toISOString(), ok: true, summary: 'triggered' }]
        void this.runSiteCommand(sch.site, sch.id)
      }
    }, 15_000)
    try { this.schedTimer.unref?.() } catch { /* ignore */ }
  }

  private async runSiteCommand(siteCmd: string, id: string): Promise<void> {
    const sch = this.schedules.find((s) => s.id === id)
    const attempts = Math.max(1, Math.min(5, sch?.retry ?? 3))
    const notify = sch?.notify !== false
    const hist = this.runHistory[id] ?? []
    const [sSite = '', sCmd = ''] = siteCmd.split(/\s+/)
    let lastOk = false
    let lastSummary = ''
    let lastOut = ''
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const r = await this.runOpencli(siteCmd.split(/\s+/), 60_000)
        lastOk = r.exitCode === 0
        lastSummary = lastOk ? (r.stdout.slice(0, 120) || 'ok') : (r.stderr.slice(0, 120) || `exit ${r.exitCode}`)
        lastOut = lastOk ? r.stdout : ''
        if (lastOk) {
          // 无人值守防线:规则命中或 noul 强失效(P<0.35)→ 按失败重试;noul 可疑(0.35-0.7)只标注不重试
          const v = await this.verifyResult(sSite, sCmd, r.stdout)
          if (v !== null) {
            if (!v.verdict) {
              lastOk = false
              lastSummary = `静默失败(${v.why ?? `P=${v.p.toFixed(2)}`}):${lastSummary}`
            } else if (v.p < 0.7) {
              lastSummary = `⚠ 可疑(P=${v.p.toFixed(2)}) ${lastSummary}`
            }
          }
        }
      } catch (e) {
        lastOk = false
        lastSummary = e instanceof Error ? e.message.slice(0, 120) : 'failed'
      }
      hist.unshift({ at: new Date().toISOString(), ok: lastOk, summary: attempts > 1 ? `#${attempt}/${attempts} ${lastSummary}` : lastSummary })
      if (lastOk) break
      if (attempt < attempts) {
        // 风控感知退避:撞登录/风控墙时 15s 固定重试等于往枪口上撞(小红书封号是中文圈最真实恐惧,
        // PM 调研 2026-09-25),改等 2 分钟让软封禁冷却;其他失败维持 15s。
        const riskWall = lastSummary.includes('登录/风控墙')
        await new Promise((res) => setTimeout(res, riskWall ? 120_000 : 15_000))
      }
    }
    this.runHistory[id] = hist.slice(0, 5)
    // 采集结构化落盘(主线 B):成功执行的完整输出存快照,时间线/diff/趋势的数据源。
    // 文件即真相:~/.dsh/opencli-snapshots/<任务id>/<时间戳>.json,保留最近 50 份自动轮转。
    if (lastOk && lastOut.length > 0) {
      try {
        const dir = join(homedir(), '.dsh', 'opencli-snapshots', id)
        await mkdir(dir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        await writeFile(join(dir, `${stamp}.json`), JSON.stringify({
          at: new Date().toISOString(), site: siteCmd, bytes: lastOut.length, stdout: lastOut,
        }), 'utf8')
        const olds = readdirSync(dir).sort() // 字典序=时间序
        if (olds.length > 50) for (const f of olds.slice(0, olds.length - 50)) { try { unlinkSync(join(dir, f)) } catch { /* ignore */ } }
      } catch { /* 快照失败不阻断主流程 */ }
    }
    // watch 命中:采集成功且完整结果包含任一监控关键词 → ingest 事件(确定性匹配,零误报)
    if (lastOk && sch?.watch !== undefined && sch.watch.length > 0) {
      const kws = sch.watch.split(/[,，\s]+/).filter((k) => k.length > 0)
      const matched = kws.filter((k) => lastOut.includes(k))
      if (matched.length > 0) {
        this.ingestEventList.unshift({ at: new Date().toISOString(), kind: 'watch-hit', text: `🔔 Watch 命中:${siteCmd} 出现 [${matched.join(', ')}]` })
        this.ingestEventList = this.ingestEventList.slice(0, 30)
      }
    }
    if (!lastOk && notify) {
      this.ingestEventList.unshift({ at: new Date().toISOString(), kind: 'schedule-failed', text: `定时任务连续 ${attempts} 次失败:${siteCmd} — ${lastSummary}` })
      this.ingestEventList = this.ingestEventList.slice(0, 30)
    }
    await this.saveState()
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
