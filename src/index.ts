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
import { defineTool, type DefineToolOptions, type ParameterSchemaSpec, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { ShellExecRequest } from '@deepseek-ai/dsh-shell'
import { homedir } from 'node:os'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AdapterDetailRequest, AdapterDetailResult, AdapterDisableRequest, AdapterDisableResult,
  AdaptersResult, ApprovalSetRequest, ApprovalSetResult, AuditListResult, DaemonStartResult, IngestEvent,
  LoginCheckItem, LoginCheckResult, LogsTailResult, OpencliStatus, SettingsResult, TraceLine, TraceListResult,
} from './types.ts'
import { approvalDecision, buildAdapterDirectory, commandAccess, extractJsonObject, normalizeAdapterList, parseDaemonStatus, sitesWithWhoami } from './parsers.ts'
import { SystemOne, noulYes } from './systemone.ts'
import { buildKnowledge, renderKnowledgeMarkdown, handleMcpResourceRequest, knowledgeResourceUri, SITE_HEALTH, type RawEntry } from './knowledge.ts'
import { buildReport, type ReportSource } from './reports.ts'
import { browserDoCardRender, siteBatchCardRender, siteCardRender } from './cards.ts'
import { BENCH_KEEP, CANARY_KEEP, DEFAULT_BENCH, RESERVED_NAMESPACES, buildBenchmarkReport, buildCanaryReport, parseCanarySnapshot, pickCanaryCommands, renderBenchmarkTable, type BenchItem } from './benchmark.ts'
import { EVIDENCE_FILE_RE, buildEvidence, parseEvidenceFileName, saveEvidence } from './evidence.ts'

// 对话内预览卡(site/site_batch/browser_do 的 output.render)再导出:纯函数,tests/cards.test.ts 直测
export { browserDoCardRender, siteBatchCardRender, siteCardRender } from './cards.ts'
// 基准纯函数层再导出(与 cards 同款约定):tests/benchmark.test.ts 直测,免走服务装配
export { BENCH_KEEP, DEFAULT_BENCH, buildBenchmarkReport, renderBenchmarkTable } from './benchmark.ts'
// 证据包纯函数层再导出(同款约定):tests/evidence.test.ts 直测
export { EVIDENCE_KEEP, buildEvidence, saveEvidence } from './evidence.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    opencli: OpencliService
  }
}

/** browser_do 允许透传的子命令白名单(其余高危命令不允许盲调)。 */
const BROWSER_DO_ALLOW = new Set([
  'analyze', 'back', 'bind', 'check', 'close', 'console', 'dblclick', 'dialog',
  'drag', 'eval', 'find', 'focus', 'frames', 'get', 'hover', 'init', 'keys',
  'network', 'scroll', 'select', 'tab', 'unbind', 'uncheck', 'upload', 'verify',
])

/** 步骤自动截图的触发子命令:产生页面变化的动作族;state/extract 等只读命令不拍(页面没变,拍了也是重复证据)。
 *  此外任何 exitCode!==0 的命令无论子命令一律补拍——失败现场是复盘最需要的证据。 */
const SHOT_TRIGGER_SUBS = new Set(['open', 'back', 'click', 'dblclick', 'type', 'fill', 'select', 'keys', 'hover', 'drag'])

/** chrome_* 工具族的 method 白名单:opencli 2.0 原生管理通道 `browser chrome call` 的合法方法集。
 *  本应从 `browser chrome describe` 动态归纳,但本机扩展 1.0.24 及以前 describe 直接报
 *  "Browser session is required"(真机实测 2026-10-20);清单取自上游扩展源码
 *  jackwener/OpenCLI extension/src/chrome-api.ts 的 CHROME_METHODS——与官方
 *  chrome.tabs/tabGroups/windows API 名一致,是"按官方 API 名兜底"的加强版(真集)。 */
const CHROME_METHODS_ALLOW = new Set([
  'tabs.query', 'tabs.get', 'tabs.create', 'tabs.duplicate', 'tabs.update', 'tabs.move', 'tabs.remove', 'tabs.group', 'tabs.ungroup',
  'tabGroups.query', 'tabGroups.get', 'tabGroups.update', 'tabGroups.move',
  'windows.get', 'windows.getAll', 'windows.create', 'windows.update', 'windows.remove',
])

/** ④⑤ 无扩展短路统一文案(docs/DESIGN-zero-config-fallback.md §5 三件套:缺什么/装什么/装完会发生什么)。
 *  browser_* 与 chrome_* 两族是 CLI→daemon→扩展硬链路(上游架构事实),无扩展不做伪造降级,只给确切出路。 */
const NO_EXT_GUIDANCE =
  '需要 OpenCLI 扩展(当前未检测到):browser_*/chrome_* 走 CLI→daemon→扩展链路,无扩展无法工作,也不伪造降级。' +
  '装法:https://github.com/jackwener/OpenCLI/releases 下载 opencli-extension-*.zip 解压 → Chrome/Edge 扩展页开"开发者模式"→"加载解压缩的扩展";装好自动重连,本工具立即可用,无需重启 dsh。' +
  '无扩展期间:site 的纯 HTTP 只读命令(如 site juejin hot)不受影响。'

/** ② 通道B 注入的固定 argv 尾(上游 execution.js:--site-session ephemeral = 一次性匿名 tab,
 *  与 OPENCLI_SITE_SLOTS 互斥由该 flag 解除)。测试钉死:注入只加 env 与这组 flag,别无改动。 */
const CDP_ARGV_TAIL: readonly string[] = ['--site-session', 'ephemeral']

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

/** 轨迹行 + 可选步骤截图绝对路径(types.ts 的 TraceLine 不含 shot;读侧原样透传,老行无此字段)。 */
type ShotTraceLine = TraceLine & { shot?: string }

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
  // 步骤截图目录可用 DSH_OPENCLI_SHOTS_DIR 覆盖(单测隔离用,与 traceDir 同款约定)
  private readonly shotsDir = process.env.DSH_OPENCLI_SHOTS_DIR !== undefined && process.env.DSH_OPENCLI_SHOTS_DIR.length > 0
    ? process.env.DSH_OPENCLI_SHOTS_DIR
    : join(homedir(), '.dsh', 'opencli-shots')
  // 写命令证据包目录可用 DSH_OPENCLI_EVIDENCE_DIR 覆盖(单测隔离用,与 shotsDir 同款约定)
  private readonly evidenceDir = process.env.DSH_OPENCLI_EVIDENCE_DIR !== undefined && process.env.DSH_OPENCLI_EVIDENCE_DIR.length > 0
    ? process.env.DSH_OPENCLI_EVIDENCE_DIR
    : join(homedir(), '.dsh', 'opencli-evidence')
  /** 步骤自动截图开关(默认开;宿主/单测可整体关闭,不做面板开关——截图是复盘增强,不值得一个设置项)。 */
  shotCapture = true
  /** 冒烟基准的站间间隔(串行限流礼貌;单测可调 0 提速,不影响生产行为)。 */
  benchGapMs = 800
  /** 截图序号(进程内单调,同秒多步防碰撞;跨进程/重启撞名由 existsSync 续拨兜底)。 */
  private shotSeq = 0
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
    this.registerChromeTools()
    this.registerAdvancedTools()
    this.registerSiteTool()
    this.registerDecisionTools()
    this.registerDoctorTool()
    this.registerBenchmarkTool()
    if (this.toolConflicts.length > 0) {
      // 撞名让位是静默行为,不留宿主日志用户无从得知这些工具为何消失(Tencent/wqty123 整挂都因它)
      console.warn(`[dsh-opencli] 另一插件注册了同名工具,本插件已让位这些命令:${this.toolConflicts.join(', ')}`)
    }
    this.registerApprovalGate()
    this.registerEvidenceListeners()
    this.registerKnowledgeResources()
    // 决策层后台预热:laya 权重冷加载约 60s,不能让 agent 的首次 so_verify/so_pick 吃这个延迟。
    // vitest 里跳过:测试会拉起真实 service,后台真加载权重既慢又晃动测试进程。
    if (process.env.VITEST === undefined) void this.so.prewarm()
    // 扩展状态缓存同样启动期预热(fire-and-forget,与 laya 预热同一理由):让零配置降级的
    // ④⑤ 短路/② 路由在首条 browser/site 命令上直接命中缓存,不为冷探测多付一次子进程
    void this.extensionState().catch(() => {})
    void this.injectSystemPrompt()
    if (this.schedules.some((s) => s.enabled)) this.startScheduler()
    // 调度计时器随服务停机清除:cordis stop 不自动收走裸 setInterval,vitest 复用 worker 跑
    // 多个测试文件与插件热重载都会留下僵尸调度器——它在服务"死后"继续触发
    // runSiteCommand/saveState,是并发写状态文件竞态的来源之一(effect 先例见
    // registerKnowledgeResources)
    ;(this.ctx as unknown as { effect?: (f: () => () => void) => unknown }).effect?.(() => () => {
      if (this.schedTimer !== undefined) { clearInterval(this.schedTimer); this.schedTimer = undefined }
    })
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

  /** 重名让位记账(被跳过的工具名):status.conflicts / doctor ⚠ 行 / 宿主 warn 三处可见。 */
  private toolConflicts: string[] = []

  /**
   * 重名防护:dsh 0.2.1 的 dsh-tools NamedEntries 对重名注册直接抛 "tool X is already
   * registered",不接住就是整个插件加载失败(Tencent/wqty123 两个插件都栽过 browser_* 撞名)。
   * 五个 register* 方法的全部工具注册走这里:撞名 → 记入 toolConflicts 让位(本插件后加载,
   * 先到先得);其他错误仍抛——真正的 bug 不许被吞。
   */
  private registerToolSafe<S extends ParameterSchemaSpec, O extends ValueSchemaSpec>(def: DefineToolOptions<S, O>): void {
    try {
      this.ctx.tools.register(defineTool(def))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/already registered/i.test(msg)) throw e
      this.toolConflicts.push(def.name)
    }
  }

  /** SystemOne 决策层:key 从环境变量或 ~/.dsh/typesafe-key;provider 可换(laya 本地 ONNX 同接口)。 */
  private so: SystemOne = new SystemOne()

  /**
   * Agent 自助安装/自检工具(AGENT_INSTALL.md 的落地闭环):CLI→daemon→BrowserBridge 扩展→浏览器档案
   * 四层诊断,每层给状态与确切下一步命令。排障先跑这个,不盲试。
   */
  private registerDoctorTool(): void {
    this.registerToolSafe({
      name: 'opencli_doctor',
      description: 'dsh-opencli 一键自检:CLI/daemon/BrowserBridge 扩展/浏览器档案四层诊断,输出每层状态与下一步命令。安装与排障时先跑这个。',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const lines: string[] = ['opencli_doctor 四层自检:']
        const next: string[] = []
        let cliOk = false
        let vraw = ''
        try {
          const v = await this.runOpencli(['--version'], 15000)
          vraw = (v.stdout.trim() || v.stderr.trim()).split('\n')[0]?.trim() ?? ''
          cliOk = v.exitCode === 0 && vraw.length > 0
        } catch { /* 走 ✗ 分支 */ }
        lines.push(`${cliOk ? '✓' : '✗'} CLI:${cliOk ? vraw : `opencli 不可用(${this.bin})`}`)
        if (!cliOk) next.push('安装 CLI:npm i -g @jackwener/opencli,然后 opencli daemon restart(或装 OpenCLIApp https://opencli.info/download)')
        if (cliOk) {
          const ds = await this.daemonStatus()
          const daemonRunning = ds?.running === true
          lines.push(`${daemonRunning ? '✓' : '✗'} daemon:${daemonRunning ? (ds?.version ?? '') + (ds?.uptime ? ' · ' + ds.uptime : '') : '未运行/无响应'}`)
          if (!daemonRunning) {
            next.push('opencli daemon restart')
          } else {
            const extLine = (ds?.extension ?? '').trim()
            const profilesLine = (ds?.profiles ?? '').trim()
            const extConnected = /^connected/.test(extLine) || /profiles connected/.test(extLine)
            const noneSelected = /none selected/i.test(extLine)
            if (extConnected && !noneSelected) {
              lines.push(`✓ BrowserBridge:${extLine || 'connected'}`)
            } else if (extConnected && noneSelected) {
              lines.push(`⚠ BrowserBridge:多档案未选默认(${profilesLine})`)
              next.push('opencli profile list 后 opencli profile use <档案名>;若选完仍报"Multiple profiles",升级 CLI:npm i -g @jackwener/opencli@latest(1.8.6 有选择不生效的 bug)')
            } else {
              lines.push('✗ BrowserBridge:扩展未连接')
              next.push('装扩展(需人在浏览器点一次):https://github.com/jackwener/OpenCLI/releases 下载 opencli-extension-*.zip 解压 → Chrome/Edge 扩展页开"开发者模式"→"加载解压缩的扩展";装完等扩展自动重连')
              // 零配置降级声明(设计 §2.2-1):红层不再只有"装扩展"一种结局——同步声明当前诚实的可用面,
              // 不让"全部工具族的错误文案都引向先装扩展"高估不可用面
              next.push('零配置继续用:无扩展也能直跑纯 HTTP 只读命令(如 site juejin hot);需浏览器的只读命令在本机有 CDP 端点时经匿名会话降级执行,输出标注「匿名降级」;browser_*/chrome_* 与登录态命令暂不可用,装扩展后自动恢复')
            }
          }
        }
        const sites = this.adapterCache !== null ? normalizeAdapterList(this.adapterCache.json).length : null
        lines.push(`✓ 插件:${sites !== null ? `${sites} 站目录已注入` : '站点目录后台加载中'} · 审批门 ${this.state.approval === 'on' ? '开' : '关'}`)
        // 重名让位名单:命令"消失"最常见的原因之一,doctor 必须能一眼看到
        if (this.toolConflicts.length > 0) {
          lines.push(`⚠ 工具重名:${this.toolConflicts.join(', ')}——另一插件注册了同名工具,本插件已让位这些命令`)
        }
        if (next.length === 0) {
          lines.push('', '全绿。冒烟建议:site v2ex hot(无需登录);登录态站点先在浏览器登录,再用面板「重新巡检」确认。')
        } else {
          lines.push('', '下一步(按顺序):', ...next.map((s, i) => `${i + 1}. ${s}`))
        }
        return { text: lines.join('\n').slice(0, 3000) }
      },
    })
  }

  /** 一键冒烟基准(任务 C):固定无需登录的读命令集串行实测出成功率表,报告落盘可追溯。 */
  private registerBenchmarkTool(): void {
    this.registerToolSafe({
      name: 'benchmark',
      description: '跑站点冒烟基准出成功率表:默认 5 个无需登录的读命令(juejin/36kr/hackernews/v2ex/bilibili)串行实测,逐站结果/真实性P/耗时,报告落 ~/.dsh/opencli-benchmarks/。装完环境或升级后先跑这个确认可用面',
      parameters: {
        sites: { type: 'array', items: { type: 'string' }, description: `可选,"站点 命令"条目(如 ["juejin hot"]);缺省用默认集:${DEFAULT_BENCH.join(' / ')}` },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { sites?: unknown }): Promise<{ text: string }> => {
        const sites = Array.isArray(a.sites) ? a.sites.map(String) : undefined
        const r = await this.benchmarkRun(sites !== undefined ? { sites } : {})
        if (!r.ok) return { text: `基准未完成:${r.error ?? '未知'}` }
        return { text: `${renderBenchmarkTable(r.results ?? []).slice(0, 4000)}\n\n报告已生成:${r.path ?? ''}` }
      },
    })
    this.registerToolSafe({
      name: 'canary',
      description: '站点漂移巡检:top-20 站(按目录命令数)只读命令逐站实测,与上一轮 canary 对比出新失败/恢复,报告落 ~/.dsh/opencli-canary/。诊断"哪些站最近改版坏了"先跑这个;定时任务填 canary 可每晚自动巡检',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (): Promise<{ text: string }> => {
        const r = await this.canaryRun()
        if (!r.ok && r.total === 0) return { text: `canary 未完成:${r.error ?? '未知'}` }
        const drift = r.newFailures.length > 0 ? `\n新失败 ${r.newFailures.length}:${r.newFailures.slice(0, 6).join('、')}` : '\n无新失败'
        const rec = r.recovered.length > 0 ? `\n恢复 ${r.recovered.length}:${r.recovered.slice(0, 6).join('、')}` : ''
        return { text: `canary 巡检:通过 ${r.passed}/${r.total}${drift}${rec}\n报告:${r.path ?? ''}` }
      },
    })
  }

  /** 决策工具(verify 断言 / 封闭选项集选择):亚秒返回,不消耗大模型 token。 */
  private registerDecisionTools(): void {
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
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
    })
  }

  private registerBrowserTools(): void {
    const run = async (session: string | undefined, argv: string[]): Promise<{ text: string; shot?: string }> => {
      // 轨迹回放(BrowserSkill #79 同款需求):browser_* 全族与 replay/crawl 等 RPC 透传
      // 统一走 runBrowserTraced 单点,每步 trace 落盘;shot(若有)随结果带给卡片渲染
      const out = await this.runBrowserTraced(session, argv)
      return out.shot !== undefined ? { text: this.renderOut(out), shot: out.shot } : { text: this.renderOut(out) }
    }
    const s = '浏览器会话名(默认 dsh;bind 过的会话复用登录态)'

    this.registerToolSafe({
      name: 'browser_open',
      description: '在用户已登录的真实 Chrome 中打开 URL(daemon+扩展桥接,登录态天然可用)',
      parameters: {
        url: { type: 'string', description: '要打开的完整 URL' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['open', String(a.url)]),
    })
    this.registerToolSafe({
      name: 'browser_state',
      description: '获取当前页状态快照:URL、标题、带 [N] 索引的交互元素清单——后续 click/type/fill 的 target 直接用 [N] 索引或文本',
      parameters: {
        session: { type: 'string', description: s },
        source: { type: 'string', enum: ['dom', 'ax'], description: '快照后端,默认 dom;ax 为无障碍树' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['state', ...(a.source !== undefined ? ['--source', a.source] : [])]),
    })
    this.registerToolSafe({
      name: 'browser_click',
      description: '点击元素。target 用 browser_state 里的 [N] 索引(如 "12")或可见文本/CSS',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS 选择器' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['click', String(a.target)]),
    })
    this.registerToolSafe({
      name: 'browser_type',
      description: '点击元素并输入文本(适合搜索框等)',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS' },
        text: { type: 'string', description: '要输入的内容' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['type', String(a.target), String(a.text)]),
    })
    this.registerToolSafe({
      name: 'browser_fill',
      description: '精确设置输入框内容并校验(不清除其他字段)',
      parameters: {
        target: { type: 'string', description: '[N] 索引 / 文本 / CSS' },
        text: { type: 'string', description: '要设置的值' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['fill', String(a.target), String(a.text)]),
    })
    this.registerToolSafe({
      name: 'browser_extract',
      description: '把当前页正文提取为 Markdown(长页自动分段),适合读文章/帖子/文档',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['extract']),
    })
    this.registerToolSafe({
      name: 'browser_screenshot',
      description: '对当前页截图保存到本地路径(仅在确需视觉信息时使用,优先 browser_state/extract;长页/整页内容用 fullPage)',
      parameters: {
        path: { type: 'string', description: '保存路径(绝对路径)' },
        fullPage: { type: 'boolean', description: '截整个可滚动页面而非视口(上游 2.0 --full-page;1.x 忽略此参数)' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['screenshot', ...(a.path !== undefined ? [a.path] : []), ...(a.fullPage === true ? ['--full-page'] : [])]),
    })
    this.registerToolSafe({
      name: 'browser_scroll',
      description: '滚动页面(up/down/left/right)',
      parameters: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向,默认 down' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['scroll', a.direction ?? 'down']),
    })
    this.registerToolSafe({
      name: 'browser_wait',
      description: '等待条件成立:selector(如 ".loaded") / text / time(秒) / xhr(如 "/api/search") / download(文件名)',
      parameters: {
        type: { type: 'string', enum: ['selector', 'text', 'time', 'xhr', 'download'], description: '等待类型' },
        value: { type: 'string', description: '对应的值' },
        session: { type: 'string', description: s },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['wait', String(a.type), ...(a.value !== undefined ? [a.value] : [])]),
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
      name: 'browser_close',
      description: '释放当前浏览器会话的 tab 租约（对应 opencli browser <session> close）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['close']),
    })
    this.registerToolSafe({
      name: 'browser_read',
      description: '读当前页 URL/标题/正文（browser_extract 别名，适合公开网页快速读取）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => run(a.session, ['extract']),
    })
    this.registerToolSafe({
      name: 'browser_status',
      description: '运行时状态：daemon/扩展/适配器数/限流与审批策略（先调它再选工具）',
      parameters: { session: { type: 'string', description: s } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        return { text: JSON.stringify(st, null, 2).slice(0, 4000) }
      },
    })
    this.registerToolSafe({
      name: 'browser_install',
      description: '环境自检：daemon/扩展/opencli 三件套缺谁补谁（daemon 未跑给 restart 命令，扩展未连给安装指引）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        if (st.ok && st.daemon?.running === true) return { text: '环境就绪：daemon 运行中，扩展已连接，无需安装。' }
        return { text: `环境缺失：${st.error ?? 'daemon 未运行'}。请先 npm i -g @jackwener/opencli，再 opencli daemon restart，并到 https://github.com/jackwener/opencli/releases 装 BrowserBridge 扩展。` }
      },
    })
    this.registerToolSafe({
      name: 'opencli_status',
      description: 'OpenCLI 连接检查：实际跑 doctor，报告 daemon/extension/profile 连通性（不要只看开关，看这个）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => {
        const st = await this.status()
        return { text: JSON.stringify(st, null, 2).slice(0, 4000) }
      },
    })
    this.registerToolSafe({
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
        // 安全审查 HIGH:批量是采集语义,写命令一律整批拒绝(fail-closed)——此前 command 只查
        // 非空,`site_batch {command:"publish"}` 可在审批门开启下多站直发写命令。未知站点不在此
        // 拦(它们由下方目录预检的拼写提醒负责,信息更有用)
        {
          const offenders: string[] = []
          for (const s of sites.filter((x) => !unknownSites.includes(x))) {
            const acc = await this.lookupAccess(s, command)
            if (acc !== 'read') offenders.push(`${s} ${command}(${acc === 'write' ? '写命令' : '未知权限'})`)
          }
          if (offenders.length > 0) return { text: `批量采集只接受只读命令,以下组合被拒:${offenders.join('、')}。写命令请逐站走 site 工具(带审批门与证据包)。` }
        }
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
        // 报告导出(主线 B 渲染层):多站结果合并为带出处 markdown,落盘并在工具输出附路径
        let reportTail = ''
        try {
          const sources: ReportSource[] = results.map((r) => ({
            site: r.site, command: `site ${r.site} ${command}${args.length > 0 ? ` ${args.join(' ')}` : ''}`,
            at: new Date().toISOString(), text: r.text,
            status: (!r.ok ? 'fail' : r.badge.includes('疑似静默失败') ? 'silent' : r.badge.includes('内容可疑') ? 'suspect' : 'ok') as ReportSource['status'],
            ...(r.badge.length > 0 ? { note: r.badge.replace(/^\(|\)$/g, '') } : {}),
          }))
          const md = buildReport(`批量采集报告 · ${command}`, sources, new Date().toISOString())
          const dir = process.env.DSH_OPENCLI_REPORTS_DIR ?? join(homedir(), '.dsh', 'opencli-reports')
          await mkdir(dir, { recursive: true })
          const file = join(dir, `batch-${Date.now()}.md`)
          await writeFile(file, md, 'utf8')
          reportTail = `\n\n📄 报告已生成:${file}`
        } catch { /* 报告失败不阻断采集输出 */ }
        return { text: pre + head + body + reportTail }
      },
    })

    this.registerToolSafe({
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
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
      name: 'opencli_run',
      description: '通用 OpenCLI argv 网关（站点命令经写审批门:write/未知权限弹审批,只读放行;浏览器/系统子命令按 browser_* 同款边界;常规搜索优先 site 直调）',
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
    })
  }

  // ── chrome_* 原生管理工具族(任务 B)──────────────────────

  /**
   * opencli 2.0 `browser chrome call <method> <args>` 免页面会话桥:原生 Chrome ID 管理标签/分组/窗口,
   * 不占 tab 租约、不建 browser session,与 browser_*(页面会话原语)互补。刻意不走 runBrowserTraced——
   * 那会强加 --session 并触发步骤补拍,chrome 通道两者都不该有;轨迹仍进「运行轨迹」,
   * 故单点 runChromeCall 手写 runOpencli + recordTrace(cmd 以 chrome 前缀区分 browser 步骤)。
   */
  private registerChromeTools(): void {
    const out = (text: string): { text: string } => ({ text })
    // tabs 工具收 tabs.* 全族;groups 工具收 tabGroups.* 外加 tabs.group/ungroup——
    // 上游没有 tabGroups.create,建组/拆组经 tabs API 完成(上游 CHROME_METHODS 的实际形状)
    const tabsAllow = [...CHROME_METHODS_ALLOW].filter((m) => m.startsWith('tabs.'))
    const groupsAllow = [...CHROME_METHODS_ALLOW].filter((m) => m.startsWith('tabGroups.') || m === 'tabs.group' || m === 'tabs.ungroup')
    this.registerToolSafe({
      name: 'chrome_tabs',
      description: '原生 Chrome 标签管理(免页面会话,opencli 2.0):tabs.query 列出标签拿 tabId / tabs.create 新建 / tabs.remove 关闭 / tabs.update 激活选中;get/duplicate/move/group/ungroup 亦可。args 为该方法位置参数的 JSON 数组字符串,如 tabs.update 传 [123, {"active": true}]',
      parameters: {
        // 不用 enum:dsh-tools 会在 wrapper 层校验拦截,模型只能看到通用报错;走 execute 内
        // 白名单才能给出"改用 chrome_raw"的确切指引(browser_do 同款约定)
        method: { type: 'string', description: `tabs.* 管理方法,允许值:${tabsAllow.join('|')}(列出=tabs.query / 新建=tabs.create / 关闭=tabs.remove / 选中激活=tabs.update)` },
        args: { type: 'string', description: '位置参数 JSON 数组字符串,缺省 []' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { method?: unknown; args?: unknown }): Promise<{ text: string }> => {
        const method = String(a.method ?? '')
        if (!CHROME_METHODS_ALLOW.has(method) || !method.startsWith('tabs.')) {
          return out(`不允许的 method:${method}。chrome_tabs 只收 tabs.* 管理方法(${tabsAllow.join(' ')});windows.* 或白名单外方法走 chrome_raw(高危,需人工确认)`)
        }
        return await this.runChromeTool(method, a.args)
      },
    })
    this.registerToolSafe({
      name: 'chrome_groups',
      description: '原生 Chrome 标签分组管理(免页面会话,opencli 2.0):tabs.group 建组并收拢标签 / tabGroups.update 改名/换色/折叠 / tabGroups.move 整组移动;tabGroups.query/get 先查 groupId。args 为位置参数 JSON 数组字符串,如 tabGroups.update 传 [456, {"title": "研究", "color": "blue"}]',
      parameters: {
        method: { type: 'string', description: `分组管理方法,允许值:${groupsAllow.join('|')}(建组收拢=tabs.group / 改名折叠=tabGroups.update / 整组移动=tabGroups.move)` },
        args: { type: 'string', description: '位置参数 JSON 数组字符串,缺省 []' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { method?: unknown; args?: unknown }): Promise<{ text: string }> => {
        const method = String(a.method ?? '')
        if (!CHROME_METHODS_ALLOW.has(method) || !(method.startsWith('tabGroups.') || method === 'tabs.group' || method === 'tabs.ungroup')) {
          return out(`不允许的 method:${method}。chrome_groups 只收 tabGroups.* 与 tabs.group/ungroup(${groupsAllow.join(' ')});其余方法走 chrome_raw(高危,需人工确认)`)
        }
        return await this.runChromeTool(method, a.args)
      },
    })
    this.registerToolSafe({
      name: 'chrome_raw',
      description: 'chrome 原生方法逃生口(高危):任意 method + JSON args 直调 browser chrome call——含 windows.* 窗口管理与白名单之外的方法,可能关闭窗口/重排真实浏览器布局。每次调用都会弹审批窗人工确认(写审批门覆盖)',
      parameters: {
        method: { type: 'string', description: '原生方法名(命名空间.方法,如 windows.create/windows.remove)' },
        args: { type: 'string', description: '位置参数 JSON 数组字符串,缺省 []' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { method?: unknown; args?: unknown }): Promise<{ text: string }> => {
        const method = String(a.method ?? '').trim()
        if (!/^[\w.]+$/.test(method)) return out(`method 非法:${method}(应为 chrome 原生方法名,如 windows.getAll)`)
        return await this.runChromeTool(method, a.args)
      },
    })
  }

  /** chrome_* 三工具共用执行尾段:args 归一 → 1.x 门 → runChromeCall。 */
  private async runChromeTool(method: string, rawArgs: unknown): Promise<{ text: string }> {
    // args 归一:缺省=空数组;模型直传数组原样收下(宽容);字符串必须 parse 成数组(位置参数语义)
    let args: unknown[] = []
    if (Array.isArray(rawArgs)) args = rawArgs
    else if (rawArgs !== undefined && rawArgs !== null && String(rawArgs).trim().length > 0) {
      let parsed: unknown
      try { parsed = JSON.parse(String(rawArgs)) } catch (e) {
        return { text: `args 不是合法 JSON:${e instanceof Error ? e.message : String(e)}(应为位置参数 JSON 数组,如 [123, {"active": true}])` }
      }
      if (!Array.isArray(parsed)) return { text: 'args 需为 JSON 数组(位置参数),如 tabs.update 传 [123, {"active": true}]' }
      args = parsed
    }
    // 1.x CLI 没有 chrome 子命令:直接给升级指引,不发注定失败的调用
    const major = await this.cliMajor()
    if (major < 2) {
      return { text: `chrome 原生管理需 opencli 2.0+(当前大版本 ${major})。升级:npm i -g @jackwener/opencli@latest 后 opencli daemon restart` }
    }
    return await this.runChromeCall(method, args)
  }

  /**
   * browser chrome call 单点。CLI 签名为 `call <method> [args]`且 args 是"整个位置参数列表的
   * JSON 数组字符串"(实探 2.0.0 --help),故恒传显式 '[]' 保证 argv 确定性。输出经 runOpencli
   * 自带的 2.0 信封解包;扩展 1.0.24 及以前该通道报 "Browser session is required"——
   * 补升级指引而不是让用户面对裸错(本机真机实测 2026-10-20,describe 同款报错)。
   */
  private async runChromeCall(method: string, args: unknown[]): Promise<{ text: string }> {
    // ⑤ 无扩展短路(同④):chrome 通道同样经 daemon→扩展(且需扩展 ≥1.0.25),
    // 显式未连时不发注定失败的调用,直接给装扩展指引
    if ((await this.extensionState()).explicitDown) {
      const out = { exitCode: 1, stdout: '', stderr: NO_EXT_GUIDANCE }
      this.recordTrace(`chrome ${method} [no-ext]`, out, 0)
      return { text: this.renderOut(out) }
    }
    const started = Date.now()
    const out = await this.runOpencli(['browser', 'chrome', 'call', method, JSON.stringify(args)], 30_000)
    this.recordTrace(`chrome ${method}`, out, Date.now() - started)
    const text = this.renderOut(out)
    if (/Browser session is required/i.test(`${out.stderr}\n${out.stdout}`)) {
      return { text: `${text}\n\nBrowserBridge 扩展版本过低:chrome 通道需 1.0.25+(当前 1.0.24 不识别 chrome-describe/chrome-call)。到 https://github.com/jackwener/opencli/releases 更新扩展后重试。` }
    }
    return { text }
  }

  private registerAdvancedTools(): void {
    const out = (text: string): { text: string } => ({ text })
    this.registerToolSafe({
      name: 'script_catalog',
      description: '列出内置只读脚本 article/links/jsonld/forms（不跑外来代码，读文章最稳）',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => out('内置只读脚本：article（正文Markdown）/ links（链接）/ jsonld / forms，用 script_run_builtin 运行'),
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
      name: 'script_validate',
      description: '校验外部 UserScript（需 @match + @grant none，≤64KB），不执行',
      parameters: { code: { type: 'string', description: 'UserScript 源码' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.scriptValidate({ code: String(a.text ?? '') })
        return out(JSON.stringify(r).slice(0, 2000))
      },
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
      name: 'automation_search',
      description: '检索已存自动化资产（录制/定时），只回 ID+摘要，不进全文',
      parameters: { query: { type: 'string', description: '关键词' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.automationSearch({ query: a.text !== undefined ? String(a.text) : undefined })
        return out(JSON.stringify(r.hits).slice(0, 2000))
      },
    })
    this.registerToolSafe({
      name: 'automation_run',
      description: '按 ID 运行已存资产（录制/定时），限域+限流仍生效',
      parameters: { id: { type: 'string', description: '资产 ID' } },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: ToolArgs) => {
        const r = await this.automationRun({ id: String(a.value ?? a.text ?? '') })
        return out(r.ok ? '执行成功' : (r.error ?? '失败'))
      },
    })
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
      name: 'trace_replay',
      description: '轨迹回放:最近 30 步 browser 命令的 markdown 时间线(时间/命令/exit/耗时,失败步附输出摘录)。复盘"上次为什么失败"先调它,别盲目重试',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async () => out(await this.renderTraceTimeline(30)),
    })
  }

  private registerSiteTool(): void {
    // W3 命令选择分层:so_pick 两步路由(先站后命令),亚秒零 token;
    // 与 systemPrompt 目录共存——目录仍是兜底,本工具是"不想翻目录时"的快速路。
    this.registerToolSafe({
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
    })
    this.registerToolSafe({
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
        const argv = [adapter, command, ...(a.args ?? [])]
        // 写命令证据包(任务 D):审批门放行的写命令 before/after 各拍一张截图,连同结果落
        // ~/.dsh/opencli-evidence/;失败也落——证据比成功更重要。读命令只付一次缓存查询;
        // 截图/落盘全程静默降级,绝不反噬写命令的结果回传。
        // 覆盖面(评审发现):unknown 权限被审批门按写放行后同样留证据——目录外的命令
        // 恰是最该留痕的一类,'===write' 会漏掉它们
        const evidenceOn = (await this.lookupAccess(adapter, command)) !== 'read'
        const beforeShot = evidenceOn ? await this.captureEvidenceShot() : undefined
        // 零配置降级路由(设计 §3,P0):确定无扩展时——browser:false 直跑(①现状零改动);
        // browser:true 只读命令命中本机 CDP 端点则匿名降级(②注入 env+flag);无端点按④诚实报不可用;
        // 写/未知权限命令在 zeroCfgPlan 内部按硬不变量直接返回 null,走现状路径
        const zc = await this.zeroCfgPlan(adapter, command)
        if (zc !== null && zc.mode === 'skip') return { text: zc.text }
        const inj = zc !== null && zc.mode === 'inject' ? zc : null
        const out = await this.runOpencli(
          inj !== null ? [...argv, ...inj.argvTail] : argv,
          60_000, 1_048_576,
          inj !== null ? inj.env : undefined,
        )
        if (evidenceOn) await this.recordSiteEvidence(adapter, command, argv, out, beforeShot)
        const text = this.renderOut(out)
        // 匿名降级标注(硬边界):降级路径的输出必须可识别,避免用户误以为是登录态数据
        const anon = inj !== null ? '【匿名降级】当前无扩展,本命令经本机匿名 CDP 会话执行——不是你的登录态数据。\n' : ''
        if (text.trim() === '[]') {
          return { text: inj !== null
            ? `${anon}适配器 ${adapter} 返回空(匿名会话无登录态;若该站需要登录,装扩展后可恢复:https://github.com/jackwener/OpenCLI/releases)`
            : `适配器 ${adapter} 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 ${adapter}，或运行 \`opencli ${adapter} login\` 后用面板“巡检登录态”确认。` }
        }
        if (out.exitCode !== 0 && /Navigation rejected/i.test(text)) return { text: `${anon}导航被拒（${adapter}）：请确认 Chrome 扩展已连接且已登录 ${adapter}，或先 \`opencli ${adapter} login\`。原错：${text.slice(0,300)}` }
        // ③(设计 §3-③):无扩展时的 AUTH 失败不是"去浏览器登录"能解决的——登录态整体不可用,
        // 换成降级引导(装扩展+为何不能降级);有扩展时维持原登录指引不变
        if (out.exitCode !== 0 && /AUTH_REQUIRED|请先登录|NOT_LOGGED_IN/i.test(`${out.stdout}\n${out.stderr}`) && (await this.extensionState()).connected === false) {
          return { text: `${anon}登录态缺失:当前无扩展,登录态(COOKIE)命令整体不可用——匿名会话拿不到你的 cookie,写命令也永不降级。装扩展后可恢复:https://github.com/jackwener/OpenCLI/releases。原错:${text.slice(0, 300)}` }
        }
        // 真实性判定标注(与 site_batch/try-run 同源 verifyResult/verifyBadge):exit 0 ≠ 有效数据,
        // 登录墙/风控页/空壳以 ⚠ 前缀标注进 {text},预览卡(siteCardRender)据此落 ⚠ 琥珀。
        // 只标注不拦截——模型仍见原文(与 site_batch 先例一致;拦截级处置留给无人值守的 schedule 路径)。
        // warmOnly:laya 预热窗口内跳过 noul 兜底(规则层照跑)——最高频工具不背 ~60s 冷加载/权重下载;
        // SystemOne 不可用/未预热时 verifyResult 返回 null → 不标注,行为与升级前一致
        if (out.exitCode === 0) {
          const badge = this.verifyBadge(await this.verifyResult(adapter, command, out.stdout, { warmOnly: true }))
          if (badge !== '') return { text: `${anon}${badge} ${text}` }
        }
        return { text: `${anon}${text}` }
      },
    })
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
    // 无扩展的诚实可用面(设计 §2.2-3):目录是模型可见的动态能力声明——工具 description 是一次性
    // 注册的静态文案改不了,动态能力只能走目录文本与错误文案两个通道。判据与 doctor 同源
    // (daemon 未运行/扩展非正向连接都算无扩展),与 ④⑤ 短路的"显式未连"刻意不同档(那是动作门,这是声明)
    const extLine = (daemon?.extension ?? '').trim()
    const extOk = daemon !== null && daemon.running === true && (/^connected/.test(extLine) || /profiles connected/.test(extLine))
    const zeroCfg = extOk ? '' : `\n当前无扩展:site 的纯 HTTP 只读命令(如 juejin hot / hackernews best)可直接跑;需浏览器的只读命令若本机有 CDP 端点,会经匿名会话降级执行并标注「匿名降级」(非登录态数据);browser_*/chrome_* 与登录态(COOKIE)命令不可用。装扩展后全部恢复:https://github.com/jackwener/OpenCLI/releases`
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

不要:写命令不在用户登录态时跑(先 opencli <site> login);cookie/密码不放工具参数。${state}。${gate}${zeroCfg}\n${buildAdapterDirectory(active)}`
  }

  // ── RPC(面板) ────────────────────────────────────────────

  @Remote('status')
  async status(): Promise<OpencliStatus & { conflicts?: string[] }> {
    const version = await this.runOpencli(['--version'])
    if (version.exitCode !== 0) {
      return {
        ok: false, bin: null, version: null, daemon: null, adapterSites: null,
        error: `opencli 不可用(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}`,
        ...(this.toolConflicts.length > 0 ? { conflicts: [...this.toolConflicts] } : {}),
      }
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
      // 重名让位名单:面板/agent 据此知道这些命令不归本插件(空省略,不占字段)
      ...(this.toolConflicts.length > 0 ? { conflicts: [...this.toolConflicts] } : {}),
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
    if (request === undefined) request = {} as never
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
    if (request === undefined) request = {} as never
    if (typeof request.site !== 'string' || request.site.trim().length === 0) return { ok: false, error: 'site 不能为空' }
    if (typeof request.cron !== 'string' || request.cron.trim().length === 0) return { ok: false, error: 'cron 不能为空' }
    const site = request.site.trim()
    const cron = request.cron.trim()
    // 修复(核验A-4):垃圾 cron 静默入库永不执行;五段+词法+字段范围校验
    const toks = cron.trim().split(/\s+/)
    if (toks.length !== 5 || !toks.every((t) => /^(\*|\d+|\*\/\d+|\d+(,\d+)*)$/.test(t))) return { ok: false, error: 'cron 非法:需 5 段(分 时 日 月 周),支持 * 数字 */步长 逗号列表' }
    const CRON_RANGES: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
    for (let i = 0; i < 5; i++) {
      const t = toks[i]
      if (t === '*' || t.startsWith('*/')) continue
      for (const p of t.split(',')) {
        const n = Number(p)
        if (n < CRON_RANGES[i][0] || n > CRON_RANGES[i][1]) return { ok: false, error: `cron 字段越界:第${i + 1}段 ${t} 不在 ${CRON_RANGES[i][0]}-${CRON_RANGES[i][1]}` }
      }
    }
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
    let traces: ShotTraceLine[] = []
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
    const traces: ShotTraceLine[] = [
      ...this.readTraceFile(this.traceFileOf(date, true)),
      ...this.readTraceFile(this.traceFileOf(date, false)),
    ]
    if (traces.length === 0) return { ok: false, traces: [], error: `该日(${date})无轨迹` }
    return { ok: true, traces }
  }

  /**
   * 轨迹步骤截图直取(面板时间线缩略图):{path} 经 resolve 归一后必须位于 shotsDir 之下,
   * 杜绝 ../ 回溯与绝对路径穿越(traceGet 对日期键做严格白名单是同一思路);
   * 文件不存在/超大/读失败一律 ok:false,绝不抛错拖垮面板。
   */
  @Remote('trace-shot')
  async traceShot(request?: { path: string }): Promise<{ ok: boolean; data?: string; mime?: string; error?: string }> {
    // 网关对空 args 会传 undefined(真机复现,trace-list 同款):request 可选链兜底
    const raw = String(request?.path ?? '')
    if (raw.trim().length === 0) return { ok: false, error: 'path 为空' }
    // win32 盘符大小写不稳定,比较前归一;root+sep 前缀防 "opencli-shots-evil" 同前缀目录假命中
    const norm = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s)
    const root = resolve(this.shotsDir)
    const p = resolve(raw)
    if (norm(p) !== norm(root) && !norm(p).startsWith(norm(root) + sep)) {
      return { ok: false, error: `path 必须位于截图目录(${root})之下` }
    }
    try {
      const st = statSync(p)
      if (!st.isFile()) return { ok: false, error: '不是常规文件' }
      // base64 会膨胀 4/3:无上限的整页 PNG 直接炸 RPC 通道,超 8MB 宁可不放缩略图
      if (st.size > 8 * 1024 * 1024) return { ok: false, error: `截图过大(${st.size} 字节,上限 8MB)` }
      const buf = await readFile(p)
      return { ok: true, data: buf.toString('base64'), mime: 'image/png' }
    } catch {
      return { ok: false, error: '文件不存在或不可读' }
    }
  }


  /** opencli launcher 启动 Chrome 时的 CDP 候选端口(launcher.js 同源)。 */
  private static readonly CDP_PORTS = [9222, 9234, 9236, 9238]
  private cdpCache: { at: number; found: boolean; port: number | null; browser: string | null } | null = null

  /** 扩展连接态缓存(≤15s,与 probeCdp 同量级;设计 §2.2-4:每命令路由读缓存,不逐条打 daemon status)。 */
  private extCache: { at: number; connected: boolean | null; explicitDown: boolean } | null = null

  /**
   * 扩展状态快照,两档判据刻意分开(零配置降级设计 §2.1,信号复用 daemonStatus/parseDaemonStatus):
   * - connected(false=宽档"非正向连接"):daemon 未运行/字段缺失/显式未连都算——给 ②③ 的 site 路由用,
   *   降级是加路不是拆路,判宽些只影响"要不要尝试匿名通道",不会拦掉任何现状路径;
   * - explicitDown(仅显式未连):daemon 明确报告扩展未连(2.0 extensionConnected:false → 归一
   *   'not connected';1.x `Extension: not*`)——给 ④⑤ 的 browser_* 与 chrome_* 短路用。
   *   只认显式否定:daemon 运行但不上报 Extension 字段的旧形态下 browser_* 仍可能工作,
   *   缺字段≠否定,短路会把还能跑的路径一刀切死,不做。
   * null=探测失败(状态未知):一切按现状路径,不降级也不短路。
   */
  private async extensionState(): Promise<{ connected: boolean | null; explicitDown: boolean }> {
    if (this.extCache !== null && Date.now() - this.extCache.at < 15_000) {
      return { connected: this.extCache.connected, explicitDown: this.extCache.explicitDown }
    }
    let connected: boolean | null = null
    let explicitDown = false
    try {
      // 探测走 runOpencliUngoverned(而非 daemonStatus/runOpencli):本机 RPC 不吃 site 限流,
      // 也不经会被覆写的实例方法——两条理由见该方法的注释(零配置降级实测教训)
      const r = await this.runOpencliUngoverned(['daemon', 'status'], 15_000, 262_144)
      const ds = r.exitCode !== 0 ? null : parseDaemonStatus(r.stdout + '\n' + r.stderr)
      if (ds === null) {
        connected = null // daemon status 命令本身失败:分不清"未运行"还是"坏了",按未知处理
      } else if (ds.running !== true) {
        connected = false // daemon 明确未运行 = 必然无扩展;但对 ④⑤ 不短路(可能自行拉起/自愈)
      } else {
        const extLine = (ds.extension ?? '').trim()
        const up = /^connected/.test(extLine) || /profiles connected/.test(extLine)
        connected = up
        explicitDown = !up && (extLine === 'not connected' || /^not\b/i.test(extLine) || /disconnected/i.test(extLine))
      }
    } catch { connected = null; explicitDown = false }
    this.extCache = { at: Date.now(), connected, explicitDown }
    return { connected, explicitDown }
  }

  /**
   * 命令级 browser 字段探测(设计 §2.1):`<site> <cmd> --help -f json` 的 browser 布尔是区分
   * 通道A(纯 HTTP,零依赖直跑)与通道B(需浏览器)的唯一可靠判据(实测:juejin hot→false,36kr hot→true)。
   * 失败/无字段返回 null=未知,按保守侧"需要浏览器"处理(§3 判据级联的约定)。
   * 只在"确定无扩展 + read"的降级路径上才被调用,正常路径零成本;P0 不做 TTL 缓存(P1 项)。
   */
  private async commandNeedsBrowser(adapter: string, command: string): Promise<boolean | null> {
    const r = await this.runOpencli([adapter, command, '--help', '-f', 'json'], 15_000)
    if (r.exitCode !== 0) return null
    const j = extractJsonObject(r.stdout) as { browser?: unknown } | null
    return j !== null && typeof j.browser === 'boolean' ? j.browser : null
  }

  /**
   * 零配置降级路由(site 命令执行前的唯一降级决策点,设计 §3 P0-②)。返回:
   * - null:现状路径(有扩展/状态未知/写或未知权限/browser:false/1.x 宿主);
   * - inject:② 通道B——注入 OPENCLI_CDP_ENDPOINT + --site-session ephemeral(匿名会话);
   * - skip:④式诚实报不可用(browser:true + read + 无扩展 + 无 CDP 端点,注定失败不执行)。
   * 硬不变量:写/未知权限命令一律返回 null 永不降级——没有用户身份的写不是降级是伪造(§3 不变量1)。
   * 1.x 宿主维持①/④现状(§7-2:--site-session 是 2.0 语法)。
   */
  private async zeroCfgPlan(adapter: string, command: string): Promise<
    { mode: 'inject'; env: Record<string, string>; argvTail: string[] } | { mode: 'skip'; text: string } | null
  > {
    const ext = await this.extensionState()
    if (ext.connected !== false) return null // 有扩展或状态未知:现状路径,通道B 不介入(§5 无缝切回)
    const access = await this.lookupAccess(adapter, command)
    if (access !== 'read') return null // 判据级联第一级(零成本):写/未知永不降级
    const needsBrowser = await this.commandNeedsBrowser(adapter, command)
    if (needsBrowser === false) return null // ① 通道A纯 HTTP:直跑,现状零改动
    if ((await this.cliMajor()) < 2) return null // 1.x 宿主:维持现状
    const cdp = await this.probeCdp()
    // 通道B(CDP attach)默认关死(立项评审致命发现):上游 CDPBridge 是 attach 端点浏览器
    // 已存在的真实标签页(无隐身上下文/独立 profile),而候选口 9222 族恰是用户自开调试
    // Chrome 的惯用口——attach 上去执行会带着用户登录态,与「匿名降级」标注构成信任断裂。
    // 正解是 headless 自管 Chrome(设计稿 P1,唯一正当端点来源);在那之前只留显式实验开关。
    if (process.env.OPENCLI_ZEROCDP_CDP === '1' && cdp.found && cdp.port !== null) {
      return { mode: 'inject', env: { OPENCLI_CDP_ENDPOINT: `http://127.0.0.1:${cdp.port}` }, argvTail: [...CDP_ARGV_TAIL] }
    }
    return {
      mode: 'skip',
      text: `site ${adapter} ${command} 需要浏览器会话,当前无扩展且未探测到本机 CDP 端点,无法匿名降级执行。两条路:` +
        `①装扩展(恢复全部能力):https://github.com/jackwener/OpenCLI/releases 下载 opencli-extension-*.zip 解压 → Chrome/Edge 扩展页开"开发者模式"→"加载解压缩的扩展";` +
        `②先用纯 HTTP 只读命令(如 site juejin hot,无需浏览器不受影响)。`,
    }
  }

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
  async scheduleHistory(p: { id: string } | undefined): Promise<{ ok: boolean; history: Array<{ at: string; ok: boolean; summary: string }>; snapshots?: Array<{ at: string; bytes: number; file: string }> }> {
    // 时间线数据源:运行史(内存,近 5) + 快照索引(落盘,近 50,含体积用于趋势)
    const id = String((p ?? { id: ''}).id ?? '')
    let snapshots: Array<{ at: string; bytes: number; file: string }> | undefined
    try {
      const dir = join(homedir(), '.dsh', 'opencli-snapshots', id)
      snapshots = readdirSync(dir).slice(-50).map((f) => {
        // 文件名=ISO 全 [:.] 换 '-':2026-10-05T15-36-53-123.json → 还原时日期分隔符不能再全量替换(修复 2026:10:05 错乱)
        const stem = f.slice(0, f.length - 5)
        const at = stem.length >= 19 ? `${stem.slice(0, 10)}T${stem.slice(11, 13)}:${stem.slice(14, 16)}:${stem.slice(17, 19)}` : stem
        let bytes = 0
        try { bytes = JSON.parse(readFileSync(join(dir, f), 'utf8')).bytes ?? 0 } catch { /* ignore */ }
        return { at, bytes, file: f }
      })
    } catch { /* 无快照目录 */ }
    return { ok: true, history: this.runHistory[id] ?? [], ...(snapshots !== undefined ? { snapshots } : {}) }
  }

  /** 报告导出:定时任务的近期快照 → 带出处 markdown(每节=一次运行,出处=命令+时间+快照路径)。 */
  @Remote('report-build')
  async reportBuild(request?: { id: string }): Promise<{ ok: boolean; path?: string; error?: string }> {
    const id = String(request?.id ?? '')
    if (id.length === 0) return { ok: false, error: 'id 为空' }
    const sch = this.schedules.find((s) => s.id === id)
    const dir = join(homedir(), '.dsh', 'opencli-snapshots', id)
    let files: string[] = []
    try { files = readdirSync(dir).slice(-5) } catch { return { ok: false, error: '该任务暂无快照——先运行一次采集' } }
    if (files.length === 0) return { ok: false, error: '该任务暂无快照' }
    const sources: ReportSource[] = []
    for (const f of files) {
      try {
        const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { at?: string; site?: string; stdout?: string }
        const stem = f.slice(0, f.length - 5)
        const at = j.at ?? stem
        sources.push({
          site: String(j.site ?? sch?.site ?? id), command: String(j.site ?? sch?.site ?? ''),
          at, text: String(j.stdout ?? ''), status: 'ok', note: '快照原文',
          source: join(dir, f),
        })
      } catch { /* 单份损坏跳过 */ }
    }
    if (sources.length === 0) return { ok: false, error: '快照全部损坏' }
    const md = buildReport(`定时采集报告 · ${sch?.site ?? id}`, sources, new Date().toISOString())
    const rdir = process.env.DSH_OPENCLI_REPORTS_DIR ?? join(homedir(), '.dsh', 'opencli-reports')
    await mkdir(rdir, { recursive: true })
    const path = join(rdir, `sched-${id}-${Date.now()}.md`)
    await writeFile(path, md, 'utf8')
    return { ok: true, path }
  }

  /**
   * 一键冒烟基准(任务 C):逐站串行 runOpencli(60s 超时)+ verifyResult 取 P,
   * 汇总写 ~/.dsh/opencli-benchmarks/bench-<时间戳>.md(目录自建,保留 20 份轮转)。
   * 串行 + 站间 800ms:基准数字要可比,并发会互相抢带宽、连发会撞限流,耗时与成败都失真。
   */
  @Remote('benchmark-run')
  async benchmarkRun(request?: { sites?: string[] }): Promise<{ ok: boolean; path?: string; results?: BenchItem[]; error?: string }> {
    // 网关对空 args 会传 undefined(真机复现,knowledge-get 同款):request 可选链
    const raw = request?.sites
    const lines = Array.isArray(raw) && raw.length > 0 ? raw.map((s) => String(s).trim()) : [...DEFAULT_BENCH]
    if (lines.length === 0) return { ok: false, error: 'sites 为空' }
    if (lines.length > 10) return { ok: false, error: `单次最多 10 站(收到 ${lines.length})——拉长整轮只会让先跑的站和后跑的站网络条件更不可比` }
    // 入参是"站点 命令"两段:先整体校验,垃圾行不混进报告。命令必须以词字符开头——
    // [\w-]+ 会放行 "-rf" 这类旗标形态,垃圾参数就该在门口挡下,不能等 CLI 报错
    for (const line of lines) {
      const toks = line.split(/\s+/)
      const [site, command] = toks
      if (toks.length !== 2 || site === undefined || site.length === 0 || command === undefined || !/^[\w@.-]+$/.test(site) || !/^\w[\w-]*$/.test(command)) {
        return { ok: false, error: `站点命令格式非法:"${line.slice(0, 40)}"(应为 "站点 命令" 两段,如 juejin hot)` }
      }
    }
    // 安全不变量:基准是只读冒烟——任何 write/unknown 命令在门口拒绝(fail-closed)。
    // 此前仅形状校验,`benchmark {sites:["zhihu comment"]}` 可绕过写审批门直执行(独立评审 HIGH)
    const offenders: string[] = []
    for (const line of lines) {
      const [s2, c2] = line.split(/\s+/) as [string, string]
      const acc = await this.lookupAccess(s2, c2)
      if (acc !== 'read') offenders.push(`${line}(${acc === 'write' ? '写命令' : '未知权限'})`)
    }
    if (offenders.length > 0) {
      return { ok: false, error: `基准只接受只读命令,以下行被拒:${offenders.join('、')}。写命令请走 site 工具(带审批门与证据包)。` }
    }
    const results: BenchItem[] = []
    for (let i = 0; i < lines.length; i++) {
      const [site, command] = lines[i].split(/\s+/) as [string, string]
      const started = Date.now()
      try {
        const out = await this.runOpencli([site, command], 60_000)
        if (out.exitCode !== 0) {
          results.push({ site, command: lines[i], ok: false, p: null, ms: Date.now() - started, error: clip(`${out.stderr}\n${out.stdout}`.trim() || `退出码 ${out.exitCode}`, 160) })
        } else {
          const v = await this.verifyResult(site, command, out.stdout)
          const silent = v !== null && !v.verdict
          results.push({
            site, command: lines[i], ok: !silent, p: v === null ? null : v.p, ms: Date.now() - started,
            ...(silent ? { error: clip(`静默失败:${v.why ?? ''}`, 160) } : {}),
          })
        }
      } catch (e) {
        // shell 三形态都归一为 exitCode 结果,这里只兜 governor 级意外;计时照记,失败也是基准数据
        results.push({ site, command: lines[i], ok: false, p: null, ms: Date.now() - started, error: clip(e instanceof Error ? e.message : String(e), 160) })
      }
      // 站间间隔(最后一站后不等):串行基准的限流礼貌
      if (i < lines.length - 1 && this.benchGapMs > 0) await new Promise((res) => setTimeout(res, this.benchGapMs))
    }
    const md = buildBenchmarkReport(results, new Date().toISOString())
    const dir = process.env.DSH_OPENCLI_BENCHMARKS_DIR ?? join(homedir(), '.dsh', 'opencli-benchmarks')
    try {
      await mkdir(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = join(dir, `bench-${stamp}.md`)
      await writeFile(file, md, 'utf8')
      // 轮转:bench-<ISO> 字典序=时间序,超出保留数删最旧(与快照 50 份轮转同一思路)
      const olds = readdirSync(dir).filter((f) => /^bench-.+\.md$/.test(f)).sort()
      if (olds.length > BENCH_KEEP) for (const f of olds.slice(0, olds.length - BENCH_KEEP)) { try { unlinkSync(join(dir, f)) } catch { /* 并发已删 */ } }
      return { ok: true, path: file, results }
    } catch (e) {
      return { ok: false, results, error: `报告写出失败:${e instanceof Error ? e.message : String(e)}` }
    }
  }

  @Remote('schedule-toggle')
  async scheduleToggle(request: { id: string; enabled: boolean }): Promise<{ ok: boolean; error?: string }> {
    if (request === undefined) request = {} as never
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
    if (request !== undefined && Array.isArray(request.sites) && request.sites.length === 0) return { ok: false, error: 'sites 为空数组——空选择不支持,省略 sites 才全量导出' }
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
    if (request === undefined) request = {} as never
    const i = this.schedules.findIndex((s) => s.id === String(request.id ?? ''))
    if (i < 0) return { ok: false, error: '未找到' }
    this.schedules.splice(i, 1)
    delete this.runHistory[String(request.id ?? '')]
    await this.saveState()
    return { ok: true }
  }

  @Remote('try-run')
  async tryRun(request: { line: string }): Promise<{ ok: boolean; text?: string; error?: string }> {
    if (request === undefined) request = {} as never
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
      // ③(设计 §3-③):无扩展时的 AUTH 失败换降级引导——登录态整体不可用,不是"去登录"能解决的;
      // 有扩展时维持原文案。前缀「登录态缺失」保持不变(hardening A-3 归类锚点)
      const kind = /BROWSER_CONNECT|extension not connected/i.test(raw) ? '扩展未连接——请打开 Chrome 并启用 OpenCLI 扩展(装法见 https://github.com/jackwener/opencli/releases),再在面板「总览」巡检登录态'
        : /AUTH_REQUIRED|请先登录|NOT_LOGGED_IN/i.test(raw)
          ? ((await this.extensionState()).connected === false
              ? '登录态缺失:当前无扩展,登录态(COOKIE)命令整体不可用——匿名降级拿不到你的 cookie(写命令永不降级);装扩展后可恢复:https://github.com/jackwener/OpenCLI/releases'
              : '登录态缺失——先在真实 Chrome 登录该站或运行 opencli <site> login')
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
        // 通用 argv 网关的写审批(安全审查 HIGH:描述宣称走审批,实际 execute 直通,
        // `opencli_run {args:["weibo","publish"]}` 可绕门直执行写命令):站点形态两段 argv
        // 按目录查权限,write/未知一律 ask(fail-closed);浏览器/系统命名空间按 browser_* 同款边界放行
        if (exec.name === 'opencli_run') {
          const arr = Array.isArray(((exec.arguments ?? {}) as { args?: unknown }).args) ? (((exec.arguments ?? {}) as { args?: unknown }).args as unknown[]).map(String) : []
          const [a0, a1] = arr
          if (a0 !== undefined && a1 !== undefined && !RESERVED_NAMESPACES.has(a0) && a0 !== 'list' && a0 !== 'help' && !a0.startsWith('--')) {
            const acc = await this.lookupAccess(a0, a1)
            if (acc !== 'read') {
              const reason = `opencli_run ${a0} ${a1} 是写命令或未知权限(${acc})——会在登录态浏览器真实执行,需人工确认。`
              this.recordAudit(`opencli_run ${a0} ${a1}`, reason)
              return { kind: 'ask', reason }
            }
          }
        }
        // browser_do eval 在登录态页面执行任意 JS,等价写原语——与 userscript-run 的门对齐,
        // 不再裸放(安全审查 MEDIUM:同能力双标)
        if (exec.name === 'browser_do' && String(((exec.arguments ?? {}) as { command?: unknown }).command ?? '') === 'eval') {
          const reason = 'browser_do eval 在登录态页面执行任意 JavaScript,等价于写原语(可发帖/点赞/改数据),需人工确认。'
          this.recordAudit('browser_do eval', reason)
          return { kind: 'ask', reason }
        }
        // chrome_raw 是高危逃生口:无条件走人工审批,兑现描述里"人工确认"的承诺
        // (独立评审发现:此前描述承诺审批但 pre-execute 无任何设防)
        if (exec.name === 'chrome_raw') {
          const m = String(((exec.arguments ?? {}) as { method?: unknown }).method ?? '?')
          const reason = `chrome_raw ${m} 直调 Chrome 原生 API——可能改动真实浏览器的窗口/标签布局,需人工确认。`
          this.recordAudit(`chrome_raw ${m}`, reason)
          return { kind: 'ask', reason }
        }
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


  /** canary 漂移巡检:top-20 站只读命令逐站跑,与上一轮 canary 报告对比出新失败/恢复。
   * 产物 ~/.dsh/opencli-canary/canary-<时间戳>.md(保留 14 份);可被定时任务
   * 以命令 "canary" 每晚触发——站点改版漂移当天可见,不依赖上游 issue 猜健康度。 */
  @Remote('canary-run')
  async canaryRun(): Promise<{ ok: boolean; total: number; passed: number; newFailures: string[]; recovered: string[]; path?: string; error?: string }> {
    const list = await this.adapterList()
    if (list === null) return { ok: false, total: 0, passed: 0, newFailures: [], recovered: [], error: this.lastShellError ?? '目录不可用' }
    const lines = pickCanaryCommands(list)
    if (lines.length === 0) return { ok: false, total: 0, passed: 0, newFailures: [], recovered: [], error: '目录无只读命令' }
    const results: BenchItem[] = []
    for (let i = 0; i < lines.length; i++) {
      const [site, command] = lines[i]!.split(/\s+/) as [string, string]
      // 防御性只读门(安全审查 MEDIUM):pickCanaryCommands 按热词名挑命令不查权限——
      // 若上游目录某条 hot 词命名命令实为 write,这里挡住,绝不无人值守执行写命令
      if ((await this.lookupAccess(site, command)) !== 'read') {
        results.push({ site, command: lines[i]!, ok: false, p: null, ms: 0, error: '目录标记为非只读,防御性跳过' })
        continue
      }
      const started = Date.now()
      try {
        const out = await this.runOpencli([site, command], 45_000)
        if (out.exitCode !== 0) {
          results.push({ site, command: lines[i]!, ok: false, p: null, ms: Date.now() - started, error: clip((out.stderr || out.stdout).trim().slice(0, 120) || `退出码 ${out.exitCode}`, 120) })
        } else {
          const v = await this.verifyResult(site, command, out.stdout)
          const silent = v !== null && !v.verdict
          results.push({ site, command: lines[i]!, ok: !silent, p: v === null ? null : v.p, ms: Date.now() - started, ...(silent ? { error: clip(`静默失败:${v.why ?? ''}`, 120) } : {}) })
        }
      } catch (e) {
        results.push({ site, command: lines[i]!, ok: false, p: null, ms: Date.now() - started, error: clip(e instanceof Error ? e.message : String(e), 120) })
      }
      if (i < lines.length - 1 && this.benchGapMs > 0) await new Promise((res) => setTimeout(res, this.benchGapMs))
    }
    const dir = process.env.DSH_OPENCLI_CANARY_DIR ?? join(homedir(), '.dsh', 'opencli-canary')
    let prevText: string | null = null
    try {
      mkdirSync(dir, { recursive: true })
      const olds = readdirSync(dir).filter((f) => /^canary-.+\.md$/.test(f)).sort()
      prevText = olds.length > 0 ? await readFile(join(dir, olds[olds.length - 1]!), 'utf8') : null
    } catch { /* 首跑或目录不可读:无基线 */ }
    const prev = parseCanarySnapshot(prevText)
    const md = buildCanaryReport(results, prev, new Date().toISOString())
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = join(dir, `canary-${stamp}.md`)
    try {
      await writeFile(file, md, 'utf8')
      const olds = readdirSync(dir).filter((f) => /^canary-.+\.md$/.test(f)).sort()
      if (olds.length > CANARY_KEEP) for (const f of olds.slice(0, olds.length - CANARY_KEEP)) { try { unlinkSync(join(dir, f)) } catch { /* 忽略 */ } }
    } catch { /* 落盘失败不改变结论 */ }
    const failedCmds = new Set(results.filter((x) => !x.ok).map((x) => x.command))
    const prevMap = prev
    const newFailures = results.filter((x) => !x.ok && prevMap.get(x.command) === true).map((x) => x.command)
    const recovered = results.filter((x) => x.ok && prevMap.get(x.command) === false).map((x) => x.command)
    const passed = results.filter((x) => x.ok).length
    return { ok: failedCmds.size === 0, total: results.length, passed, newFailures, recovered, path: file }
  }

  // ── 写操作证据包(任务 D)──────────────────────────────────

  /** 审批拒绝在 host 落地的最终文本特征(dsh-tools serviceAsk 的四种非授权拒绝 + 本插件
   *  审批门的写操作/只读拦截理由——无审批服务时 ask.reason 会原样成为拒绝文本)。
   *  以 host 真实字符串为准(dsh-tools/lib/index.js 的 serviceAsk),别凭记忆改写。 */
  private static readonly APPROVAL_DENIED_RE = /requires approval|the user rejected tool|was cancelled|是写操作|只读模式/

  /**
   * 证据包专用截图:force 必拍,落盘/防碰撞/跨版本 argv 形态全复用 captureStepShot(A-core);
   * 合成 exitCode:1 结果是双保险——即使 force 语义被改,失败命令的补拍路径仍然成立。
   * 会话固定 dsh(site 适配器经 daemon 自己的浏览器跑,插件侧只有默认会话可拍,近似但聊胜于无)。
   */
  private async captureEvidenceShot(): Promise<string | undefined> {
    return await this.captureStepShot('dsh', ['evidence'], { exitCode: 1, stdout: '', stderr: '' }, await this.cliMajor(), true)
  }

  /** 放行写命令的证据落盘:after 截图 → buildEvidence → saveEvidence(100 份轮转)。失败也落。 */
  private async recordSiteEvidence(adapter: string, command: string, argv: string[], out: { exitCode: number; stdout: string; stderr: string }, beforeShot?: string): Promise<void> {
    try {
      const afterShot = await this.captureEvidenceShot()
      await saveEvidence(this.evidenceDir, buildEvidence({
        command: `site ${adapter} ${command}`,
        argv,
        approval: { mode: this.state.approval, reason: null },
        beforeShot: beforeShot ?? null,
        afterShot: afterShot ?? null,
        result: { exitCode: out.exitCode, head: `${out.stdout}\n${out.stderr}`.trim().slice(0, 200) },
        site: adapter,
      }))
    } catch { /* 证据失败不阻断命令结果 */ }
  }

  /** 被拒写命令的证据落盘:命令从未执行,无截图可言,result 记 -1 + 拒绝理由原文。 */
  private async recordBlockedEvidence(adapter: string, command: string, args: string[], denial: string): Promise<void> {
    try {
      await saveEvidence(this.evidenceDir, buildEvidence({
        command: `site ${adapter} ${command}`,
        argv: [adapter, command, ...args],
        approval: { mode: this.state.approval, reason: 'blocked' },
        beforeShot: null,
        afterShot: null,
        result: { exitCode: -1, head: denial.slice(0, 200) },
        site: adapter,
      }))
    } catch { /* 静默 */ }
  }

  /**
   * 审批拒绝监听(任务 D):被拒的写命令执行体根本不会跑(site execute 无从得知),唯一
   * 可见点是 tools/post-execute 收到的 isError 结果——host 把 serviceAsk 的拒绝落成
   * error.message(派发前拒绝也走这条 waterfall,dsh-tools finalizeScheduledExecution)。
   * 命中拒绝特征且目录确认为写命令 → 补一包 approval.reason='blocked'。观察者姿态:
   * 异常自吞、恒回 next(),绝不改变门后行为。
   */
  private registerEvidenceListeners(): void {
    this.ctx.on('tools/post-execute', async (exec, result, next) => {
      try {
        if (exec.name === 'site' && result.isError) {
          const a = (exec.arguments ?? {}) as { adapter?: unknown; command?: unknown; args?: unknown }
          if (typeof a.adapter === 'string' && typeof a.command === 'string') {
            const denial = result.error.message
            if (OpencliService.APPROVAL_DENIED_RE.test(denial) && (await this.lookupAccess(a.adapter, a.command)) !== 'read') {
              await this.recordBlockedEvidence(a.adapter, a.command, Array.isArray(a.args) ? a.args.map(String) : [], denial)
            }
          }
        }
      } catch { /* 证据失败不改变门后行为 */ }
      return await next()
    })
  }

  /** 最近写命令证据包(任务 D):文件名即元数据(时间戳+站点),不读全文;倒序取前 20。 */
  @Remote('evidence-list')
  async evidenceList(): Promise<{ ok: boolean; items: Array<{ file: string; at: string; site: string; bytes: number }> }> {
    try {
      const names = readdirSync(this.evidenceDir).filter((f) => EVIDENCE_FILE_RE.test(f)).sort().reverse().slice(0, 20)
      const items: Array<{ file: string; at: string; site: string; bytes: number }> = []
      for (const f of names) {
        const meta = parseEvidenceFileName(f)
        if (meta === null) continue
        let bytes = 0
        try { bytes = statSync(join(this.evidenceDir, f)).size } catch { /* 竞态已删:0 兜底 */ }
        items.push({ file: join(this.evidenceDir, f), at: meta.at, site: meta.site, bytes })
      }
      return { ok: true, items }
    } catch {
      // 目录不存在(还没跑过写命令):空表(traceList 同款),不是错误
      return { ok: true, items: [] }
    }
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
  /** 调度去重 marker(每启动周期有效,不落盘;此前寄生 runHistory 造成 5055 键无限累积)。 */
  private schedMarkers = new Set<string>()

  /**
   * 0.2.0+ 原生执行:ctx.subprocess.spawn(argv)(官方 bash 工具同款 seam;
   * 旧 ctx.shell.execute 在 0.2.0 需要 sandbox policy 管线,插件直调已不可靠)。
   * 返回 null = 该 seam 不可用,调用方回落老路径。
   */
  private async runSubprocess(argv: string[], timeoutMs: number, stdoutMaxBytes: number, env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
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
      // env 显式条目与擦净后的父环境合并(dsh-subprocess 0.2.0 SubprocessSpawnRequest.env,本次实测确认);
      // per-spawn spec 携带、绝不写 process.env——降级注入对插件进程环境零残留(设计 §4-2-4)
      ...(env !== undefined ? { env } : {}),
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

  private async runOpencli(argv: string[], timeoutMs = 60000, stdoutMaxBytes = 1048576, env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string; unavailable?: string }> {
    const raw = await this.runOpencliRaw(argv, timeoutMs, stdoutMaxBytes, env)
    return this.unwrapCli2(argv, raw)
  }

  /** opencli 2.0 JSON 信封解包:`{"ok":true,"data":…}` → data 为 stdout;`{"ok":false,"error":{code,message,hint}}`
   *  → stderr + 真实退出码。只认输出形状不看版本号(托盘复活旧 daemon 等版本错配场景照样工作);
   *  list/daemon 两族有专用解析(分页/JSON 状态),在此跳过。1.x 文本输出无 `{"ok":` 前缀,原样透传。 */
  private unwrapCli2(argv: string[], out: { exitCode: number; stdout: string; stderr: string; unavailable?: string }): { exitCode: number; stdout: string; stderr: string; unavailable?: string } {
    if (out.unavailable !== undefined) return out
    if (argv[0] === 'list' || argv[0] === 'daemon') return out
    const s = out.stdout.trimStart()
    if (!s.startsWith('{"ok"')) return out
    const j = extractJsonObject(s) as { ok?: boolean; data?: unknown; error?: Record<string, unknown> } | null
    if (j === null || typeof j.ok !== 'boolean') return out
    if (j.ok === true) {
      const d = j.data
      return { ...out, exitCode: 0, stdout: typeof d === 'string' ? d : (d === undefined ? '' : JSON.stringify(d, null, 2)) }
    }
    const e = j.error ?? {}
    const parts = [typeof e.code === 'string' ? e.code : 'UNKNOWN', typeof e.message === 'string' ? e.message : '', typeof e.hint === 'string' ? e.hint : ''].filter((x) => x.length > 0)
    return { ...out, exitCode: typeof e.exitCode === 'number' ? e.exitCode : 1, stdout: '', stderr: parts.join('\n') }
  }

  /** CLI 大版本(1/2),进程内缓存。决定 browser 会话语法与 adapter 命令族路由。 */
  private cliMajorCache: number | null = null
  private async cliMajor(): Promise<number> {
    if (this.cliMajorCache !== null) return this.cliMajorCache
    try {
      const r = await this.runOpencliRaw(['--version'], 15000)
      const m = `${r.stdout}\n${r.stderr}`.match(/(\d+)\.\d+/)
      this.cliMajorCache = m ? Number(m[1]) : 1
    } catch { this.cliMajorCache = 1 }
    return this.cliMajorCache
  }

  private async runOpencliRaw(argv: string[], timeoutMs = 60000, stdoutMaxBytes = 1048576, env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string; unavailable?: string }> {
    await this.acquireGovernor()
    try {
      return await this.runOpencliUngoverned(argv, timeoutMs, stdoutMaxBytes, env)
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

  /**
   * runOpencliRaw 的无限流内核(执行体拆分):供 daemon status 探测等**本机 RPC**直调,刻意
   * 不吃 site 命令的礼貌限流、也不经 this.runOpencli——两条都是零配置降级实测换来的:
   * ①限流间隔(750ms 级)会挂进命令热路径,紧时限用例(tests/trace.test.ts 的 browser 三连,
   * 原本 ~4.5s/5s)被探测多付的一跳顶爆超时;②runOpencli 实例方法在测试与生产包装层常被覆写,
   * 探测调用混进去会污染调用方对 argv 的记账(tests/cli2.test.ts 的 runOpencli 覆写捕获栽过)。
   * 站点命令一律走 runOpencli/runOpencliRaw,别用这个。
   */
  private async runOpencliUngoverned(argv: string[], timeoutMs: number, stdoutMaxBytes: number, env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string; unavailable?: string }> {
    // 0.2.0+ 原生 seam 优先。防线:seam 冷启动有竞态(真机实测:daemon 刚起时首几条
    // 抛 'reading includes'/'destructure policy',几分钟后自愈;而 0.1.x shell 回落
    // 在 0.2.1 宿主上会截断 argv——'xiaohongshu' 变 'xiaohong')。所以 seam 抛错先
    // 重试 seam(400ms×2),三败才回落 shell。
    let viaSub: Awaited<ReturnType<OpencliService['runSubprocess']>> = null
    for (let attempt = 0; attempt < 3 && viaSub === null; attempt++) {
      try {
        viaSub = await this.runSubprocess(argv, timeoutMs, stdoutMaxBytes, env)
      } catch {
        if (attempt < 2) await new Promise((res) => setTimeout(res, 400))
      }
    }
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
    // env 同样进 shell 回落 spec(设计 §3-②:回落路径也要带 env,两处都注)——
    // dsh-shell ShellExecRequest.env 与凭据擦净后的环境合并(0.2.0 types.d.ts 实测确认),老版本忽略多余字段
    const baseSpec = { command: [this.bin, ...argv].join(' '), timeoutMs, stdoutMaxBytes, policy, ...(env !== undefined ? { env } : {}) }
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
  }

  private renderOut(out: { exitCode: number; stdout: string; stderr: string }): string {
    if (out.exitCode === 0) return clip(out.stdout, OUTPUT_LIMIT)
    return `命令失败(退出码 ${out.exitCode}):\n${clip(out.stdout, 2000)}\n${clip(out.stderr, 2000)}`
  }

  // ── 轨迹回放:browser 命令运行轨迹(BrowserSkill #79 同款需求) ──

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
  private async runBrowserTraced(session: string | undefined, argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string; shot?: string }> {
    const started = Date.now()
    // ④ 无扩展短路(设计 §3-④):browser_* 是 CLI→daemon→扩展硬链路(上游 daemon.js 头注释,
    // 无 CDP 分支),daemon 明确报告扩展未连时注定失败——把注定失败的往返(默认 60s 超时)换成
    // 一次性"缺什么/装什么/装完会怎样"。只认显式未连(extensionState.explicitDown):
    // daemon 运行但不上报 Extension 字段的旧形态仍按现状放行,缺字段≠否定
    if ((await this.extensionState()).explicitDown) {
      const out = { exitCode: 1, stdout: '', stderr: NO_EXT_GUIDANCE }
      this.recordTrace(`browser ${session ?? 'dsh'} ${argv.join(' ')} [no-ext]`, out, 0)
      return out
    }
    const major = await this.cliMajor()
    let out: { exitCode: number; stdout: string; stderr: string }
    if (major >= 2) {
      // 2.0:会话从位置参数改为 --session 选项;创作命令搬去 adapter 族(analyze 工作流整体移除)
      const [head] = argv
      if (head === 'init' || head === 'verify') {
        const sub = head === 'verify' ? 'check' : 'init'
        out = await this.runOpencli(['adapter', sub, ...argv.slice(1)])
      } else if (head === 'analyze') {
        out = { exitCode: 1, stdout: '', stderr: 'opencli 2.0 已移除 analyze 侦察工作流;改用 browser state --diagnostics / browser network --static,或 adapter init 后 adapter check 验证' }
      } else {
        out = await this.runOpencli(['browser', ...argv, '--session', session ?? 'dsh'])
      }
    } else {
      out = await this.runOpencli(['browser', session ?? 'dsh', ...argv])
    }
    // 页面变化/失败命令自动补拍一张截图(复盘证据链),路径写进同一轨迹行的 shot 字段;
    // 内部补拍走 runOpencli 直连,不经 runBrowserTraced——否则会自递归且把补拍当成用户步骤污染轨迹
    const shot = await this.captureStepShot(session, argv, out, major)
    this.recordTrace(`browser ${session ?? 'dsh'} ${argv.join(' ')}`, out, Date.now() - started, shot)
    // shot 随结果带出(独立评审发现:此前只进 trace 不进工具结果,browser_do 卡的
    // (shot: 文件名) 提示是死路径)——undefined 不落字段,老消费者零影响
    return shot !== undefined ? { ...out, shot } : out
  }

  /** 截图文件名时间段(本地 hhmmss,无冒号——文件系统安全;与 traceDateKey 同一时区体感,回放时对得上墙钟)。 */
  private static shotClock(d = new Date()): string {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }

  /**
   * 步骤自动截图:页面变化类子命令(SHOT_TRIGGER_SUBS)或任何失败命令执行后补拍一张,落
   * <shotsDir>/<yyyymmdd>/<session>/step-<hhmmss>-<idx>.png。任何失败(建目录/CLI 报错/文件没落盘)
   * 一律静默返回 undefined——截图只是复盘增强,绝不阻断命令本身;CLI 已确认文件写出后才计入轨迹行,
   * 杜绝 shot 字段指向不存在文件的悬空引用。
   * force(证据包专用,任务 D):写命令的 before/after 必拍——证据链完整性优先于截图频率,
   * 绕过"页面变化才拍"触发门限。
   */
  private async captureStepShot(session: string | undefined, argv: string[], out: { exitCode: number; stdout: string; stderr: string; unavailable?: string }, major: number, force = false): Promise<string | undefined> {
    if (!this.shotCapture) return undefined
    const sub = String(argv[0] ?? '')
    if (!force && out.exitCode === 0 && !SHOT_TRIGGER_SUBS.has(sub)) return undefined
    // 沙箱不可用时 shell 已整体报废,再发截图命令只是多等一次注定失败的调用
    if (out.unavailable !== undefined) return undefined
    try {
      // 会话名进目录段:剥离路径字符,防会话名本身成为穿越载体
      const sid = (session ?? 'dsh').replace(/[^\w.-]/g, '_')
      const now = new Date()
      const dir = join(this.shotsDir, OpencliService.traceDateKey(now), sid)
      mkdirSync(dir, { recursive: true })
      // 防碰撞:hhmmss + 进程内单调 idx;跨进程/重启序列归零由 existsSync 续拨
      const clock = OpencliService.shotClock(now)
      let file = ''
      do { file = join(dir, `step-${clock}-${++this.shotSeq}.png`) } while (existsSync(file))
      // 截图命令形态跨大版本(实探 2.0.0 help:browser screenshot <path> --session <s>;1.x 为位置参数)
      const shotArgv = major >= 2
        ? ['browser', 'screenshot', file, '--session', session ?? 'dsh']
        : ['browser', session ?? 'dsh', 'screenshot', file]
      const r = await this.runOpencli(shotArgv, 30_000)
      return r.exitCode === 0 && existsSync(file) ? file : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 每条 browser 命令追加一行 JSONL 到 <traceDir>/trace-<yyyymmdd>.jsonl:
   * {at, cmd, exitCode, ms, outHead(输出前 200 字,失败时 stderr 优先)}。
   * 同步写(量级 ~300B/条,相对秒级浏览器操作可忽略,且对调用方可确定性断言);
   * 单文件超 5MB 轮转为 .1(旧 .1 丢弃,保留前一份);任何失败静默,绝不影响命令本身。
   */
  private recordTrace(cmd: string, out: { exitCode: number; stdout: string; stderr: string }, ms: number, shot?: string): void {
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
      // shot 为可选字段:老轨迹行没有它,消费端(readTraceFile/面板)一律按可选透传
      const row = { at: new Date().toISOString(), cmd, exitCode: out.exitCode, ms, outHead, ...(shot !== undefined && shot.length > 0 ? { shot } : {}) }
      appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
    } catch { /* 静默:轨迹缺失不阻断命令 */ }
  }

  /** 解析一个轨迹文件为行数组(缺文件/JSON 解析失败/**形状不对**的脏行一律跳过,不抛错)。 */
  private readTraceFile(file: string): ShotTraceLine[] {
    const lines: ShotTraceLine[] = []
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { return lines }
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const v = JSON.parse(line) as unknown
        // 形状校验:'null'/'数字'/'{"exitCode":0}' 这类 parse 成功但非 TraceLine 的行,
        // 会让消费端 at.slice 直接 TypeError 且 client 无 ErrorBoundary——整卡崩白(评审)。
        if (v === null || typeof v !== 'object'
          || typeof (v as ShotTraceLine).at !== 'string' || typeof (v as ShotTraceLine).cmd !== 'string'
          || typeof (v as ShotTraceLine).exitCode !== 'number' || typeof (v as ShotTraceLine).ms !== 'number'
          || typeof (v as ShotTraceLine).outHead !== 'string') continue
        const t = v as ShotTraceLine
        // shot 可选但出现即必须是字符串:脏形态剥掉字段保住整行,不让悬空引用进面板
        if (t.shot !== undefined && typeof t.shot !== 'string') delete t.shot
        lines.push(t)
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
      // 自愈:清除旧版寄生在 runHistory 的调度 marker(键含 ':',曾累积 5055 个)
      for (const k of Object.keys(this.runHistory)) {
        if (k.includes(':')) delete this.runHistory[k]
      }
      if (Array.isArray(parsed.audit)) this.state.audit = parsed.audit.filter((a) => a !== null && typeof a === 'object' && typeof (a as { at?: unknown }).at === 'string')
    } catch { /* 无文件或损坏:用默认值 */ }
  }

  /** 原子写的临时文件序号(同毫秒并发 saveState 防自撞)。 */
  private stateTmpSeq = 0

  private async saveState(): Promise<void> {
    try {
      await mkdir(join(homedir(), '.dsh'), { recursive: true })
      // 原子写:先写同目录临时文件再 rename——writeFile 是"截断再写",并发读者
      // (tests/benchmark.test.ts 的裸 JSON.parse 回读、面板 settings)会撞见空文件窗口,
      // 全量门禁实测以低概率红(Unexpected end of JSON input);rename 落盘只见旧或新。
      // 并发写者(recordAudit 的 void saveState 与后台调度任务)各写各的 tmp,后 rename 者胜。
      const body = JSON.stringify({ ...this.state, schedules: this.schedules, runHistory: this.runHistory, audit: this.state.audit }, null, 2)
      const tmp = `${this.statePath}.${process.pid}.${Date.now()}.${++this.stateTmpSeq}.tmp`
      await writeFile(tmp, body, 'utf8')
      await rename(tmp, this.statePath)
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
        if (this.schedMarkers.has(histKey)) continue
        if (!this.cronMatches(sch.cron, now)) continue
        this.schedMarkers.add(histKey)
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
    // 面板占位符是 'site zhihu hot' 形态,而 CLI 直接吃 'zhihu hot'——此前原样透传导致
    // 按占位符创建的任务 100% 失败(unknown command 'site')(真机走查发现 B)。剥掉 site 前缀。
    const norm = siteCmd.replace(/^\s*site\s+/i, '').trim()
    // canary 特例:定时任务填 canary 即每晚漂移巡检(dogfooding——插件自监控),
    // 走 canaryRun 全链(与上轮对比出漂移报告),不走单命令执行
    if (norm === 'canary') {
      const r = await this.canaryRun()
      hist.unshift({ at: new Date().toISOString(), ok: r.ok, summary: r.ok ? `canary:${r.passed}/${r.total}${r.newFailures.length > 0 ? ' 新失败:' + r.newFailures.slice(0, 3).join(',') : ''}` : `canary 失败:${r.error ?? '未知'}` })
      this.runHistory[id] = hist.slice(0, 5)
      await this.saveState()
      return
    }
    const cmdLine = norm.length > 0 ? norm : siteCmd
    const [sSite = '', sCmd = ''] = cmdLine.split(/\s+/)
    let lastOk = false
    let lastSummary = ''
    let lastOut = ''
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const started = Date.now()
        const r = await this.runOpencli(cmdLine.split(/\s+/), 60_000)
        // 定时链路此前绕过 recordTrace(只有 browser 透传入口记录),「运行轨迹」看不到定时执行的
        // 真实失败输出,复盘断链(GUI 走查 2026-10-08)。带 schedule 前缀与手动 browser 命令区分。
        this.recordTrace(`schedule ${cmdLine}`, r, Date.now() - started)
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
      // 大小写不敏感(真机走查发现 A:'agent,diffusion' 撞 'Agentic/Diffusion' 全 miss)
      const low = lastOut.toLowerCase()
      const matched = kws.filter((k) => low.includes(k.toLowerCase()))
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
    // 2.0:JSON 信封 + 分页(上限 100/页)——翻页取全;1.x:单次平铺数组
    const major = await this.cliMajor()
    if (major >= 2) {
      const collected: unknown[] = []
      let offset = 0
      let total: number | null = null
      for (let page = 0; page < 40; page++) {
        const r = await this.runOpencliRaw(['list', '--format', 'json', '--limit', '100', '--offset', String(offset)], 30000, 4 * 1024 * 1024)
        if (r.exitCode !== 0) {
          this.lastShellError = `list(${r.exitCode})|out:${r.stdout.slice(0, 200)}|err:${r.stderr.slice(0, 200)}`
          return null
        }
        try {
          const s = r.stdout.trimStart()
          const start = s.indexOf('{')
          const j = JSON.parse(start === -1 ? s : s.slice(start)) as { ok?: boolean; data?: { commands?: unknown[]; total?: number; nextOffset?: number }; error?: { message?: string } }
          if (j.ok !== true || !Array.isArray(j.data?.commands)) throw new Error(`envelope ok=${String(j.ok)} error=${j.error?.message?.slice(0, 120) ?? '无 data.commands'}`)
          collected.push(...j.data.commands)
          total = typeof j.data.total === 'number' ? j.data.total : total
          const next = typeof j.data.nextOffset === 'number' ? j.data.nextOffset : 0
          if (next <= offset || (total !== null && collected.length >= total)) break
          offset = next
        } catch (e) {
          this.lastShellError = `json(${e instanceof Error ? e.message.slice(0, 120) : 'parse'})|head:${r.stdout.slice(0, 200)}`
          return null
        }
      }
      if (collected.length === 0) {
        this.lastShellError = 'list(2.0)|翻页后 0 命令'
        return null
      }
      this.adapterCache = { at: Date.now(), json: collected }
      return normalizeAdapterList(collected)
    }
    const r = await this.runOpencliRaw(['list', '--format', 'json'], 30000, 8 * 1024 * 1024)
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
