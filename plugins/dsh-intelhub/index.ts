/**
 * dsh-intelhub host 半:zvec 原生本地知识库。
 * - kb_import:文件/整个文件夹导入(后台队列:抽取→分块→本地向量化→入库,逐文件可见)
 * - kb_search:语义+关键词加权混合检索(zvec weighted 融合),结果带 文件路径#块 来源
 * - kb_list / kb_delete:注册表管理与按文件删除
 * - TypertRemoteService RPC:status / list / import / remove / search(面板用)
 * 零守护进程(zvec 进程内)、零 API key(e5-small 本地推理)、文档不出本机。
 * @module dsh-intelhub
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// 仅类型面:拉入 dsh 宿主对 cordis Context 的增强(systemPrompt 服务声明);SWC 会擦除,不进运行时依赖
import type {} from '@deepseek-ai/dsh-system-prompt'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { chunkText, embedTextOf } from './chunker.ts'
import { E5Embedder } from './embedder.ts'
import type { Embedder } from './embedder.ts'
import { buildFilter, KbStore, SCHEMA_VERSION } from './store.ts'
import type { ChunkScalars, RawHit, SearchFilterSpec } from './store.ts'
import { extractText, htmlToText, SUPPORTED_EXTS, MAX_FILE_BYTES } from './extract.ts'
import type { FrontMeta } from './frontmatter.ts'
import { WorkspaceManager } from './watch.ts'
import { ScheduleManager } from './schedule.ts'
import type { DashboardResult, DemoResult, ExportResult, FileEntry, ImportResult, IngestEvent, ListResult, RemoveResult, SearchHit, SearchResult, StatusResult, TodayResult, TodayTop } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    intelhub: ZvecKbService
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.venv', 'venv', '__pycache__', '.idea', '.vscode', '.cache', '.obsidian', '.trash'])
const MAX_FILES_PER_IMPORT = 20000
const SNIPPET = 300

/** 路径规范化键(大小写与分隔符不敏感)。 */
const normKey = (p: string): string => resolve(p).split(sep).join('/').toLowerCase()

/** 注册表键:fs 走路径规范化,url/note 走前缀命名空间(不能过 path.resolve)。 */
const regKey = (kind: 'fs' | 'url' | 'note', s: string): string =>
  kind === 'fs' ? normKey(s) : `${kind}:${s.trim().toLowerCase()}`

/** 空态演示样例:故意让"超时"查询零词汇重叠,演示语义检索价值。 */
const DEMO_NOTE_TITLE = '示例·员工手册(演示)'
const DEMO_NOTE_TEXT = `# 员工手册(演示样例)

## 网络与设备

连接公司内网后,若门户系统在 30 秒内没有任何响应,会话将被主动中断并释放资源。该阈值可在高级设置的会话页签中调整,默认值建议保持不变。

## 差旅报销

出差返回后七日内可在系统提交报销单,票据扫描上传,款项三个工作日内打回工资卡。跨年度票据不予受理。

## 账号权限

新入职员工由直属主管在管理后台提交账号申请,经部门负责人审批后,由系统管理员完成角色绑定,全程无需线下单据。

(这是 dsh-intelhub 的演示文档,可在文件列表中删除)`

export class ZvecKbService extends TypertRemoteService {
  static inject = ['tools', 'systemPrompt']

  private readonly homeDir: string
  private recoveryNote: string | null = null
  private pendingRawHash: string | undefined = undefined
  private pendingMeta: FrontMeta | undefined = undefined
  private pendingSrc: string | undefined = undefined
  private ingestEvents: IngestEvent[] = []
  private readonly workspaceMgr: WorkspaceManager
  private readonly scheduleMgr: ScheduleManager
  private embedder: Embedder | null = null
  private store: KbStore | null = null
  private registry = new Map<string, FileEntryInternal>()
  private registryLoaded = false
  private queueTail: Promise<void> = Promise.resolve()
  private queuedFiles = 0
  private promptText = '本地知识库(dsh-intelhub):还没有已导入的文档。用户给路径时可调 kb_import 导入(支持整个文件夹)。'

  constructor(ctx: Context) {
    super(ctx, 'intelhub')
    this.homeDir = process.env.DSH_INTELHUB_HOME ?? join(homedir(), '.dsh', 'dsh-intelhub')
    this.workspaceMgr = new WorkspaceManager(this.homeDir, async (p) => {
      const r = await this.importPath(p)
      if (r.queued > 0) this.refreshPrompt()
      return r
    })
    this.scheduleMgr = new ScheduleManager(this.homeDir, async (entry) => {
      for (const w of this.workspaceMgr.list()) await this.importPath(w.path)
    })
    // 不注册 dispose 钩子:zvec WAL 保证崩溃安全,进程退出无需显式关库
  }

  /** 测试注入点:子类覆盖以替换向量器。 */
  protected createEmbedder(): Embedder {
    void mkdir(join(this.homeDir, 'hf-cache'), { recursive: true })
    return new E5Embedder(join(this.homeDir, 'hf-cache'))
  }

  // ── 生命周期:工具 + systemPrompt ─────────────────────────

  protected async [Service.init](): Promise<void> {
    await this.loadRegistry()
    this.registerTools()
    this.ctx.systemPrompt.section({
      name: 'intelhub',
      order: 160,
      text: () => this.promptText,
    })
    this.refreshPrompt()
    // workspace 常驻目录 + 持久化调度:rotate 等采集脚本落盘后自动增量索引;AI/面板可设定时任务
    this.workspaceMgr.startAll()
    this.scheduleMgr.startAll()
  }

  private refreshPrompt(): void {
    const done = [...this.registry.values()].filter((f) => f.status === 'done')
    if (done.length === 0) {
      this.promptText = '本地知识库(dsh-intelhub):还没有已导入的文档。导入方式:kb_import(文件/文件夹,Obsidian 库直接指库目录)、kb_import_url(网页存档)、kb_note(直接写文本——对话长文、调研结论、opencli 等工具抓到的社交内容都存这里)。'
      return
    }
    const sample = done.slice(-5).map((f) => f.path).join('、')
    this.promptText = `本地知识库(dsh-intelhub):已导入 ${done.length} 个来源(如 ${sample})。用户问题涉及这些内容时,先用 kb_search 检索(语义+关键词混合,能按意思找到换了说法的段落),结果带 来源#块号,引用时注明。检索不到再问用户或看原文件。新增:kb_import(文件夹)/kb_import_url(网页)/kb_note(文本);移除用 kb_delete。`
  }

  private registerTools(): void {
    this.ctx.tools.register(defineTool({
      name: 'kb_search',
      description: '在用户的本地知识库里检索(语义+关键词混合:按意思能找到换说法的段落,精确词/错误码也能命中)。用户问题涉及已导入文档时先用它,结果带 文件路径#块号 来源。可选过滤:作者/阶段(精选 selected/raw)/标签/最低点赞。',
      parameters: {
        query: { type: 'string', description: '检索词:自然语言问题或关键词均可' },
        topk: { type: 'number', description: '返回条数,默认 5' },
        author: { type: 'string', description: '可选:只搜某作者的采集(如 宝玉xp)' },
        stage: { type: 'string', description: '可选:精选层 selected / 全集层 raw / reviewed' },
        tag: { type: 'string', description: '可选:按标签过滤(如 AI/观点)' },
        likesMin: { type: 'number', description: '可选:最低点赞数' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { query?: unknown; topk?: unknown; author?: unknown; stage?: unknown; tag?: unknown; likesMin?: unknown }): Promise<{ text: string }> => {
        const q = String(a.query ?? '').trim()
        if (!q) return { text: 'query 不能为空。' }
        const topk = Math.min(Math.max(Number(a.topk) || 5, 1), 20)
        const filter: SearchFilterSpec = {
          author: a.author === undefined ? undefined : String(a.author),
          stage: a.stage === undefined ? undefined : String(a.stage),
          tag: a.tag === undefined ? undefined : String(a.tag),
          likesMin: a.likesMin === undefined ? undefined : Number(a.likesMin),
        }
        const r = await this.search(q, topk, filter)
        if (!r.ok) return { text: `检索失败:${r.error ?? '未知'}` }
        if (r.hits.length === 0) return { text: `知识库中没有匹配"${q}"的内容${r.note ? `(${r.note})` : ''}。` }
        const lines = r.hits.map((h, i) => `[${i + 1}] ${h.score.toFixed(3)} · ${h.ref}\n${h.text.length > SNIPPET ? h.text.slice(0, SNIPPET) + '…' : h.text}`)
        return { text: `知识库检索"${q}"(${r.mode}${r.note ? ',' + r.note : ''}),${r.hits.length} 条:\n\n${lines.join('\n\n')}` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_import',
      description: '导入文件或整个文件夹到本地知识库(md/txt/pdf/docx/代码等)。后台建索引,立即返回队列情况;重复导入只处理新增/变更文件。',
      parameters: {
        path: { type: 'string', description: '文件或文件夹的绝对路径(支持 ~)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { path?: unknown }): Promise<{ text: string }> => {
        const r = await this.importPath(String(a.path ?? ''))
        if (!r.ok) return { text: `导入失败:${r.error ?? '未知'}` }
        const parts = [`已加入索引队列:${r.queued} 个文件`]
        if (r.skippedUnchanged > 0) parts.push(`无变化跳过:${r.skippedUnchanged}`)
        if (r.failedScan.length > 0) parts.push(`扫描失败:${r.failedScan.join('、')}(前 5)`)
        parts.push('后台索引进行中,完成后即可检索;进度可看 dsh 设置→本地知识库。')
        return { text: parts.join(';') + '.' }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_import_url',
      description: '把网页存入知识库(调研攒链接常用):抓取正文 → 分块入库,来源显示为 URL。也接受 opencli 等工具抓到的内容——那种情况改用 kb_note 直接写入。',
      parameters: {
        urls: { type: 'array', items: { type: 'string' }, description: '要存档的网页 URL 列表' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { urls?: unknown }): Promise<{ text: string }> => {
        const urls = Array.isArray(a.urls) ? a.urls.map(String) : []
        if (urls.length === 0) return { text: 'urls 不能为空。' }
        const r = await this.importUrls(urls.slice(0, 20))
        if (!r.ok) return { text: `导入失败:${r.error ?? '未知'}` }
        if (r.failedScan.length > 0) return { text: `以下 URL 无法导入:${r.failedScan.join('、')}` }
        return { text: `已加入索引队列:${r.queued} 个网页,后台抓取建索引中。` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_note',
      description: '把一段文本直接写入知识库(对话里的长文、你的调研结论、其他工具抓到的社交内容如微博,都存这里)。按标题去重,同标题重复写入会覆盖。',
      parameters: {
        title: { type: 'string', description: '笔记标题(唯一键,如 "微博-某某-2026-09" 或 "调研-XX结论")' },
        text: { type: 'string', description: '正文内容(markdown/纯文本)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { title?: unknown; text?: unknown }): Promise<{ text: string }> => {
        const r = await this.importNote(String(a.title ?? ''), String(a.text ?? ''))
        if (!r.ok) return { text: `写入失败:${r.error ?? '未知'}` }
        return { text: '已写入知识库并开始建索引。' }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_list',
      description: '列出本地知识库已导入的文件、块数与索引状态。',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (): Promise<{ text: string }> => {
        const files = [...this.registry.values()].sort((x, y) => y.importedAt - x.importedAt)
        if (files.length === 0) return { text: '知识库为空。用 kb_import 导入文件或文件夹。' }
        const rows = files.map((f) => `${f.status === 'done' ? '✓' : f.status === 'failed' ? '✗' : '…'} ${f.chunks}块 ${f.path}${f.error ? ` (${f.error})` : ''}`)
        return { text: `知识库 ${files.length} 个文件:\n${rows.join('\n')}` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_delete',
      description: '从知识库移除一个已导入的文件(按导入路径,支持只给结尾一段唯一路径)。',
      parameters: {
        path: { type: 'string', description: '导入时的文件路径(或其唯一后缀)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { path?: unknown }): Promise<{ text: string }> => {
        const r = await this.remove(String(a.path ?? ''))
        if (!r.ok) return { text: `删除失败:${r.error ?? '未知'}` }
        return { text: r.removed ? '已从知识库移除。' : '没有匹配的已导入文件。' }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_watch',
      description: '把一个目录注册为知识库常驻 workspace:此后该目录的新增/变更文件被自动增量索引(采集脚本落盘即入库,无需手动导入)。',
      parameters: {
        path: { type: 'string', description: '要常驻监听的目录绝对路径(支持 ~)' },
        label: { type: 'string', description: '可选标签(面板展示用)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { path?: unknown; label?: unknown }): Promise<{ text: string }> => {
        const r = await this.workspaceMgr.add(String(a.path ?? ''), a.label === undefined ? undefined : String(a.label))
        if (!r.ok) return { text: `注册失败:${r.error ?? '未知'}` }
        return { text: '已注册为常驻 workspace:目录内新增/变更文件将自动增量索引;首次全量在后台进行。' }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_schedule',
      description: '设置/查看/删除知识库的持久化定时任务(重启不丢)。用例:按博主发博节奏定时扫描采集目录。动作 scan=全 workspace 增量索引。',
      parameters: {
        action: { type: 'string', enum: ['list', 'set', 'remove', 'enable', 'disable'], description: '操作' },
        name: { type: 'string', description: '任务名(set/remove/enable/disable 必填)' },
        kind: { type: 'string', enum: ['interval', 'daily'], description: 'set 必填:interval=每 everyMin 分钟;daily=每天 at 时刻' },
        everyMin: { type: 'number', description: 'interval 型:间隔分钟数(1-10080)' },
        at: { type: 'string', description: 'daily 型:HH:MM(24 小时制)' },
        enabled: { type: 'boolean', description: 'set 时可选,默认 true' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { action?: unknown; name?: unknown; kind?: unknown; everyMin?: unknown; at?: unknown; enabled?: unknown }): Promise<{ text: string }> => {
        const action = String(a.action ?? 'list')
        if (action === 'list') {
          const rows = this.scheduleMgr.list().map((e) => `${e.enabled ? '✓' : '⏸'} ${e.name} (${e.kind === 'daily' ? `每天 ${e.at}` : `每 ${e.everyMin} 分钟`}, scan, 上次 ${e.lastRunAt ? new Date(e.lastRunAt).toLocaleString() : '未运行'})`)
          return { text: rows.length === 0 ? '没有定时任务。用 kb_schedule action=set 创建。' : `定时任务 ${rows.length} 个:\n${rows.join('\n')}` }
        }
        if (action === 'set') {
          const r = await this.scheduleMgr.set({ name: a.name, kind: a.kind, everyMin: a.everyMin, at: a.at, enabled: a.enabled })
          return r.ok ? { text: `定时任务已保存(重启不丢),引擎将按计划执行 scan。` } : { text: `设置失败:${r.error ?? '未知'}` }
        }
        if (action === 'remove') {
          const ok = await this.scheduleMgr.remove(String(a.name ?? ''))
          return { text: ok ? '已删除。' : `不存在:${String(a.name)}` }
        }
        const r = await this.scheduleMgr.setEnabled(String(a.name ?? ''), action === 'enable')
        return r.ok ? { text: action === 'enable' ? '已启用。' : '已停用。' } : { text: `失败:${r.error ?? '未知'}` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_today',
      description: '今天采了什么:今日新增来源、高价值帖(按点赞排序)、待分诊队列存量。复盘工作流的入口。',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (): Promise<{ text: string }> => {
        await this.loadRegistry()
        const now = new Date()
        const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const files = [...this.registry.values()]
        const todayNew = files.filter((f) => f.meta?.date === ymd || new Date(f.importedAt).toDateString() === now.toDateString())
        const top = [...todayNew].filter((f) => (f.meta?.likes ?? 0) > 0).sort((x, y) => (y.meta?.likes ?? 0) - (x.meta?.likes ?? 0)).slice(0, 8)
        const rawPending = files.filter((f) => (f.meta?.stage === 'raw' && !f.stageOverride) || f.stageOverride === 'raw').length
        const lines = [
          `今日新增 ${todayNew.length} 篇 · 待分诊(raw)存量 ${rawPending}`,
          ...(top.length > 0 ? ['高价值 TOP:'].concat(top.map((f) => `◆ ${f.meta?.author ?? f.path.split(/[\\/]/).pop()} · 赞 ${f.meta?.likes} · ${f.path.split(/[\\/]/).pop()}`)) : []),
        ]
        return { text: lines.join('\n') }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_memory',
      description: '沉淀一条记忆(decision/fact/preference/lesson),带类型与来源 agent 标量。供蒸馏管线或对话直接写入;检索时 kb_search 加 src=memory 过滤。',
      parameters: {
        text: { type: 'string', description: '记忆内容(一句话能复述)' },
        type: { type: 'string', enum: ['decision', 'fact', 'preference', 'lesson'], description: '记忆类型' },
        agent: { type: 'string', description: '可选:来源 agent/管线标识' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { text?: unknown; type?: unknown; agent?: unknown }): Promise<{ text: string }> => {
        const t = String(a.text ?? '').trim()
        const type = ['decision', 'fact', 'preference', 'lesson'].includes(String(a.type)) ? String(a.type) : 'fact'
        const agent = String(a.agent ?? 'agent').trim().slice(0, 40) || 'agent'
        if (t.length < 8) return { text: '记忆内容太短(≥8 字符)。' }
        const now = new Date()
        const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        this.pendingRawHash = undefined
        this.pendingMeta = { type, author: agent, date: ymd, src: 'memory' }
        this.pendingSrc = 'memory'
        const stamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
        const r = await this.importNote(`memory:${type}:${ymd}:${stamp}`, `[${type}] ${t}`)
        return r.ok ? { text: `已沉淀记忆(${type}),src=memory。` } : { text: `写入失败:${r.error ?? '未知'}` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_triage',
      description: '分诊 stage:raw 的采集件:list 列队列(按赞排序);promote <路径> 精选(stage→selected);skip <路径> 跳过(stage→reviewed)。标量热更新,不重嵌入。',
      parameters: {
        action: { type: 'string', enum: ['list', 'promote', 'skip'], description: '操作' },
        path: { type: 'string', description: 'promote/skip 的目标路径(或唯一后缀)' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { action?: unknown; path?: unknown }): Promise<{ text: string }> => {
        const action = String(a.action ?? 'list')
        await this.loadRegistry()
        const raw = [...this.registry.values()].filter((f) => f.meta?.stage === 'raw').sort((x, y) => (y.meta?.likes ?? 0) - (x.meta?.likes ?? 0))
        if (action === 'list') {
          if (raw.length === 0) return { text: '待分诊队列为空。' }
          return { text: `待分诊 ${raw.length} 篇(按赞降序):\n${raw.slice(0, 10).map((f, i) => `${i + 1}. ♥${f.meta?.likes ?? 0} ${f.path.split(/[\\/]/).pop()}`).join('\n')}${raw.length > 10 ? `\n…共 ${raw.length} 篇` : ''}` }
        }
        const target = String(a.path ?? '')
        if (!target) return { text: 'path 不能为空。' }
        const entry = raw.find((f) => f.path.endsWith(target) || f.path === target)
        if (entry === undefined) return { text: `在 raw 队列中找不到:${target}` }
        const stage = action === 'promote' ? 'selected' : 'reviewed'
        const r = await this.setStage(entry.path, stage)
        return r.ok ? { text: `已${action === 'promote' ? '精选' : '跳过'}:${entry.path.split(/[\\/]/).pop()} → stage=${stage}` } : { text: `失败:${r.error ?? '未知'}` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_export',
      description: '把检索到的知识导出为 Markdown 文件写入指定目录(如 Obsidian 库),带导出 frontmatter 与全部来源引用。只写用户指定的目录,绝不动原始采集文件。',
      parameters: {
        query: { type: 'string', description: '检索词:导出命中的内容' },
        dir: { type: 'string', description: '目标目录(用户指定的 Obsidian 库目录等,支持 ~)' },
        title: { type: 'string', description: '可选:导出文件名主体' },
        limit: { type: 'number', description: '导出条数上限,默认 5' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { query?: unknown; dir?: unknown; title?: unknown; limit?: unknown }): Promise<{ text: string }> => {
        const q = String(a.query ?? '').trim()
        const dir = String(a.dir ?? '').trim()
        if (!q) return { text: 'query 不能为空。' }
        if (!dir) return { text: 'dir 不能为空——只写用户明确指定的目录。' }
        const limit = Math.min(Math.max(Number(a.limit) || 5, 1), 20)
        const r = await this.exportTo(q, dir, a.title === undefined ? undefined : String(a.title), limit)
        if (!r.ok) return { text: `导出失败:${r.error ?? '未知'}` }
        return { text: `已导出 ${r.count} 条到 ${r.path}(普通 Markdown,Obsidian 直接可索引)。` }
      },
    }))

    this.ctx.tools.register(defineTool({
      name: 'kb_evidence',
      description: '给一条判断找证据:按判断文本语义检索知识库,按来源文件归组,返回支持的 原文#块号 清单。判断台账复盘用。',
      parameters: {
        text: { type: 'string', description: '判断内容(一句话)' },
        topk: { type: 'number', description: '候选证据条数上限,默认 8' },
      },
      output: { schema: { type: 'json' }, render: (_a: unknown, v: { text: string }) => [{ type: 'text', text: v.text }] },
      execute: async (a: { text?: unknown; topk?: unknown }): Promise<{ text: string }> => {
        const t = String(a.text ?? '').trim()
        if (!t) return { text: 'text 不能为空。' }
        const topk = Math.min(Math.max(Number(a.topk) || 8, 1), 20)
        const r = await this.search(t, topk)
        if (!r.ok) return { text: `检索失败:${r.error ?? '未知'}` }
        if (r.hits.length === 0) return { text: '知识库中没有找到相关证据。' }
        const seen = new Set<string>()
        const ev: string[] = []
        for (const h of r.hits) {
          const file = h.ref.replace(/#\d+$/, '')
          if (seen.has(file)) continue
          seen.add(file)
          ev.push(`▸ ${h.ref} · ${h.text.length > 60 ? h.text.slice(0, 60) + '…' : h.text}`)
        }
        return { text: `证据 ${ev.length} 件(按相关度):\n${ev.join('\n')}\n—— 全部带 原文#块号,可回源核对。` }
      },
    }))
  }

  // ── 运行时(向量器 + 存储,惰性) ──────────────────────────

  private async ensureRuntime(): Promise<{ embedder: Embedder; store: KbStore } | { error: string }> {
    if (this.embedder === null) {
      // 真实环境走 e5;测试子类通过覆盖 createEmbedder 注入假向量器
      this.embedder = this.createEmbedder()
    }
    if (this.store === null) {
      await mkdir(this.homeDir, { recursive: true })
      let s = new KbStore(join(this.homeDir, `store-v${SCHEMA_VERSION}`), this.embedder.dim)
      s.open()
      if (!s.ok) {
        // 双实例/崩溃残留会占写锁:降级到独立恢复目录,而不是让知识库整个不可用
        const alt = join(this.homeDir, `store-recovery-${Date.now().toString(36)}`)
        s = new KbStore(alt, this.embedder.dim)
        s.open()
        if (!s.ok) return { error: `zvec 存储打开失败:${s.error ?? '未知'}` }
        this.recoveryNote = '检测到另一个实例占用索引,本次运行写入恢复目录;关闭其他实例后重启 dsh 可回到主目录。'
      }
      this.store = s
    }
    return { embedder: this.embedder, store: this.store }
  }

  // ── 导入 ────────────────────────────────────────────────

  async importPath(input: string): Promise<ImportResult> {
    const raw = input.trim().replace(/^~(?=$|[/\\])/, homedir())
    const p = resolve(raw)
    let st
    try {
      st = await stat(p)
    } catch {
      return { ok: false, queued: 0, skippedUnchanged: 0, failedScan: [], error: `路径不存在:${p}` }
    }
    await this.loadRegistry()

    const files: string[] = []
    const failedScan: string[] = []
    if (st.isFile()) {
      files.push(p)
    } else {
      const walk = async (dir: string): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const e of entries) {
          if (files.length >= MAX_FILES_PER_IMPORT) return
          const fp = join(dir, e.name)
          if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(fp)
          } else if (!e.name.startsWith('.') && SUPPORTED_EXTS.has(extLower(e.name))) {
            files.push(fp)
          }
        }
      }
      try {
        await walk(p)
      } catch (err: unknown) {
        failedScan.push(err instanceof Error ? err.message.slice(0, 80) : '目录扫描错误')
      }
    }

    let queued = 0
    let skippedUnchanged = 0
    const candidates: { path: string; bytes: number }[] = []
    for (const fp of files) {
      try {
        const s = await stat(fp)
        if (s.size > MAX_FILE_BYTES) {
          failedScan.push(`${fp}(超过 ${Math.round(MAX_FILE_BYTES / 1048576)}MB)`)
          continue
        }
        candidates.push({ path: fp, bytes: s.size })
      } catch {
        failedScan.push(`${fp}(不可读)`)
      }
    }
    // 大小相同且此前 done 的做内容哈希校验再跳过——等长编辑(改字不加字)必须被重索引
    for (const c of candidates) {
      const prev = this.registry.get(regKey('fs', c.path))
      if (prev !== undefined && prev.status === 'done' && prev.bytes === c.bytes) {
        let unchanged = false
        try {
          if (prev.rawHash !== undefined) {
            // 新注册表:与原始文件字节哈希对比(抽取的 trim/清洗不再造成假差异)
            unchanged = createHash('sha256').update(await readFile(c.path)).digest('hex').slice(0, 16) === prev.rawHash
          } else {
            // 旧注册表无 rawHash:按抽取文本哈希近似比对,拿不准就重索引
            const { text } = await extractText(c.path)
            unchanged = text !== null && createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16) === prev.id
          }
        } catch {
          unchanged = false
        }
        if (unchanged) {
          skippedUnchanged++
          continue
        }
      }
      const prevEntry = prev ?? entryOf(c.path)
      this.registry.set(regKey('fs', c.path), { ...prevEntry, path: resolve(c.path), bytes: c.bytes, status: 'indexing' as const, chunks: prev?.chunks ?? 0 })
      queued++
      this.enqueueSource(regKey('fs', c.path), resolve(c.path), c.bytes, async () => {
        const { text, reason, rawHash, meta } = await extractText(c.path)
        if (text === null) throw new Error(reason ?? '无法抽取文本')
        this.pendingRawHash = rawHash
        this.pendingMeta = meta
        return text
      })
    }
    if (queued > 0 || failedScan.length > 0) this.saveRegistry()
    this.refreshPrompt()
    return { ok: true, queued, skippedUnchanged, failedScan: failedScan.slice(0, 5) }
  }

  /** URL 导入:抓取网页 → 正文抽取 → 同一条分块/向量化管线;来源显示为 URL 本身。 */
  async importUrls(urls: string[]): Promise<ImportResult> {
    await this.loadRegistry()
    const failedScan: string[] = []
    let queued = 0
    for (const raw of urls) {
      const url = raw.trim()
      if (!/^https?:\/\//i.test(url)) {
        failedScan.push(`${url}(非法 URL)`)
        continue
      }
      const key = regKey('url', url)
      const prevU = this.registry.get(key)
      this.registry.set(key, { ...(prevU ?? entryOf(url)), bytes: 0, status: 'indexing' as const, chunks: prevU?.chunks ?? 0 })
      queued++
      this.enqueueSource(key, url, 0, async () => {
        const html = await this.fetchText(url)
        const text = htmlToText(html)
        if (text.length < 40) throw new Error('页面无可抽取正文')
        this.pendingRawHash = undefined
        this.pendingMeta = undefined
        this.pendingSrc = 'url'
        return text
      })
    }
    if (queued > 0) this.saveRegistry()
    this.refreshPrompt()
    return { ok: true, queued, skippedUnchanged: 0, failedScan: failedScan.slice(0, 5) }
  }

  /** 直接文本导入:对话里贴的长文、agent 的调研结论、opencli 抓到的社交内容都走这里。 */
  async importNote(title: string, text: string): Promise<ImportResult> {
    await this.loadRegistry()
    const t = title.trim().slice(0, 120)
    if (t === '' || text.trim() === '') return { ok: false, queued: 0, skippedUnchanged: 0, failedScan: [], error: '标题与内容不能为空' }
    const key = regKey('note', t)
    const prevN = this.registry.get(key)
    this.registry.set(key, { ...(prevN ?? entryOf(`note:${t}`)), bytes: Buffer.byteLength(text, 'utf8'), status: 'indexing' as const, chunks: prevN?.chunks ?? 0 })
    this.pendingRawHash = undefined
    this.pendingMeta = undefined
    this.pendingSrc = 'note'
    this.enqueueSource(key, `note:${t}`, Buffer.byteLength(text, 'utf8'), async () => text)
    this.saveRegistry()
    this.refreshPrompt()
    return { ok: true, queued: 1, skippedUnchanged: 0, failedScan: [] }
  }

  /** 测试注入点:URL 抓取(真实实现用全局 fetch)。 */
  protected async fetchText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; dsh-intelhub/0.1)' }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  }

  /** 串行后台队列:逐源 抽取→分块→向量化→入库,失败记入注册表不阻断后续。 */
  private enqueueSource(key: string, display: string, bytes: number, produce: () => Promise<string>): void {
    this.queuedFiles++
    this.queueTail = this.queueTail.then(async () => {
      const t0 = performance.now()
      const src = this.pendingSrc ?? 'file'
      try {
        const text = await produce()
        const scalars = this.metaToScalars(this.pendingMeta, this.pendingSrc)
        await this.indexContent(key, display, text, bytes, this.pendingRawHash, scalars)
        this.ingestEvents.unshift({ at: Date.now(), src, display, chunks: this.registry.get(key)?.chunks ?? 0, status: 'done', error: '', ms: Math.round(performance.now() - t0) })
      } catch (err: unknown) {
        const cur = this.registry.get(key)
        const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
        this.registry.set(key, { ...(cur ?? entryOf(display)), bytes, status: 'failed', error: msg })
        this.ingestEvents.unshift({ at: Date.now(), src, display, chunks: 0, status: 'failed', error: msg, ms: Math.round(performance.now() - t0) })
        this.saveRegistry()
        this.refreshPrompt()
      } finally {
        if (this.ingestEvents.length > 50) this.ingestEvents.length = 50
        this.queuedFiles--
      }
    })
  }

  /** frontmatter 标量 → zvec 行标量;URL/笔记来源补 src 标识。 */
  private metaToScalars(meta: FrontMeta | undefined, srcOverride?: string): ChunkScalars {
    return {
      author: meta?.author,
      stage: meta?.stage,
      tag: meta?.tag,
      src: srcOverride ?? meta?.src,
      date: meta?.date,
      type: meta?.type,
      likes: meta?.likes,
    }
  }

  /** 反哺导出:检索结果组装为普通 Markdown(带导出 frontmatter 与来源),落盘到用户指定目录。 */
  private async exportTo(query: string, dir: string, title: string | undefined, limit: number): Promise<ExportResult> {
    const target = resolve(dir.trim().replace(/^~(?=$|[/\\])/, homedir()))
    const r = await this.search(query, limit)
    if (!r.ok) return { ok: false, error: r.error ?? '检索失败' }
    if (r.hits.length === 0) return { ok: false, error: `没有命中内容:${query}` }
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const safeTitle = (title ?? query).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '导出'
    const file = join(target, `intelhub-${stamp}-${safeTitle}.md`)
    const md = [
      '---',
      `exported: ${now.toISOString()}`,
      `source: IntelHub 知识库检索 "${query.replace(/"/g, '')}"`,
      `count: ${r.hits.length}`,
      `query: ${query.replace(/"/g, '')}`,
      '---',
      '',
      `# ${title ?? query}`,
      '',
      ...r.hits.map((h, i) => `## [${i + 1}] ${h.ref}\n\n${h.text}\n`),
      '---',
      '_由 dsh-intelhub(kb_export)导出 · 原文可按 文件#块号 回源_',
      '',
    ].join('\n')
    try {
      await mkdir(target, { recursive: true })
      await writeFile(file, md, 'utf8')
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 160) : '写入失败' }
    }
    return { ok: true, count: r.hits.length, path: file }
  }

  /** 分诊:热更新某来源全部块的 stage 标量(zvec updateSync,不重嵌入)。 */
  async setStage(path: string, stage: string): Promise<{ ok: boolean; error?: string }> {
    await this.loadRegistry()
    const key = normKey(path)
    let entry = this.registry.get(key)
    if (entry === undefined) {
      const lower = path.toLowerCase()
      const matches = [...this.registry.values()].filter((f) => f.path.toLowerCase().endsWith(lower) || f.path.toLowerCase() === lower)
      if (matches.length === 1) entry = matches[0]
      else if (matches.length > 1) return { ok: false, error: `路径不唯一(${matches.length} 个匹配)` }
    }
    if (entry === undefined) return { ok: false, error: `未找到:${path}` }
    if (entry.status !== 'done') return { ok: false, error: `该来源未完成索引(${entry.status})` }
    const rt = await this.ensureRuntime()
    if ('error' in rt) return { ok: false, error: rt.error }
    try {
      rt.store.updateStageFields(entry.id, entry.chunks, stage)
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    entry.stageOverride = stage
    this.saveRegistry()
    this.refreshPrompt()
    return { ok: true }
  }

  private async indexContent(key: string, display: string, text: string, bytes: number, rawHash?: string, scalars?: ChunkScalars): Promise<void> {
    const rt = await this.ensureRuntime()
    if ('error' in rt) throw new Error(rt.error)
    const buf = Buffer.from(text, 'utf8')
    const id = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error('没有可索引的内容')

    const prev = this.registry.get(key)
    // 内容与标量均未变:不重插,避免 zvec 重复 id 文档(likes 等标量更新也走重索引)
    const metaSig = JSON.stringify(scalars ?? {})
    if (prev !== undefined && prev.id !== '' && prev.id === id && prev.status === 'done' && prev.metaSig === metaSig) {
      this.registry.set(key, { ...prev, bytes, status: 'done', rawHash })
      this.saveRegistry()
      return
    }
    // 同键旧内容清理(内容变了 file id 变);首次导入 prev.id 为空串,跳过
    if (prev !== undefined && prev.id !== '' && prev.id !== id) rt.store.deleteFile(prev.id)

    if (rt.embedder.ready !== null) await rt.embedder.ready
    // 嵌入用去语法文本(余弦不被 markdown 符号污染);FTS/展示仍用原文
    const vectors = await rt.embedder.embed(chunks.map((c) => embedTextOf(c)))
    rt.store.insert(id, chunks, vectors, scalars)
    this.registry.set(key, { id, path: display, bytes, chunks: chunks.length, status: 'done', importedAt: Date.now(), rawHash, metaSig, meta: scalars })
    this.saveRegistry()
    this.refreshPrompt()
  }

  // ── 检索 ────────────────────────────────────────────────

  async search(query: string, topk: number, filter?: SearchFilterSpec): Promise<SearchResult> {
    const rt = await this.ensureRuntime()
    if ('error' in rt) return { ok: false, mode: 'none', hits: [], error: rt.error }
    let queryVec: number[] | null = null
    let note: string | undefined
    if (rt.embedder.ready === null) {
      // 假向量器(测试)或同步可用的实现
      queryVec = (await rt.embedder.embed([query], true))[0]
    } else {
      // 真模型冷启动可能要下载(秒级到十秒级);1.5s 内没就绪就先走 FTS,不让工具调用干等
      const ready = await Promise.race([rt.embedder.ready.then(() => true), new Promise<boolean>((res) => setTimeout(() => res(false), 1500))])
      if (ready) {
        queryVec = (await rt.embedder.embed([query], true))[0]
      } else {
        note = '语义模型加载中,本次为关键词检索'
      }
    }
    const raw: RawHit[] = rt.store.search(queryVec, query, topk, filter ? buildFilter(filter) : undefined)
    const byId = new Map([...this.registry.values()].map((f) => [f.id, f]))
    const hits: SearchHit[] = raw.map((r) => ({
      ref: `${byId.get(r.file)?.path ?? r.file}#${r.chunk}`,
      score: r.score,
      text: r.text,
    }))
    // typert 边界:note 不命中时不写键
    const out: SearchResult = { ok: true, mode: queryVec === null ? 'fts' : 'hybrid', hits }
    if (note !== undefined) out.note = note
    return out
  }

  // ── 列表 / 删除 / 状态 ───────────────────────────────────

  async remove(input: string): Promise<RemoveResult> {
    await this.loadRegistry()
    const t = input.trim()
    // url/note 来源不能过 path.resolve,按前缀判别;fs 键与旧版 normKey 兼容
    const kind: 'fs' | 'url' | 'note' = /^https?:\/\//i.test(t) ? 'url' : t.startsWith('note:') ? 'note' : 'fs'
    let entryKey = regKey(kind, t)
    let entry = this.registry.get(entryKey)
    if (entry === undefined) {
      const lower = t.toLowerCase()
      const matches = [...this.registry.entries()].filter(([, f]) => {
        const p = f.path.toLowerCase()
        return p === lower || p.endsWith(lower) || p.endsWith('/' + lower)
      })
      if (matches.length === 1) {
        entryKey = matches[0][0]
        entry = matches[0][1]
      } else if (matches.length > 1) {
        return { ok: false, removed: false, error: `路径不唯一(${matches.length} 个匹配),请给完整路径` }
      }
    }
    if (entry === undefined) return { ok: true, removed: false }
    if (this.store === null) {
      const rt = await this.ensureRuntime()
      if ('error' in rt) return { ok: false, removed: false, error: rt.error }
    }
    try {
      this.store?.deleteFile(entry.id)
    } catch (err: unknown) {
      return { ok: false, removed: false, error: err instanceof Error ? err.message : String(err) }
    }
    this.registry.delete(entryKey)
    this.saveRegistry()
    this.refreshPrompt()
    return { ok: true, removed: true }
  }

  async listFiles(): Promise<ListResult> {
    await this.loadRegistry()
    const files = [...this.registry.values()].sort((x, y) => y.importedAt - x.importedAt)
    return { ok: true, files, indexing: this.queuedFiles }
  }

  async statusInfo(): Promise<StatusResult> {
    const rt = await this.ensureRuntime().catch(() => null)
    await this.loadRegistry()
    const files = [...this.registry.values()]
    let model: 'ready' | 'loading' | 'absent' = 'absent'
    if (rt !== null && !('error' in rt)) {
      const e = rt.embedder
      model = e.ready === null ? 'ready' : await Promise.race([e.ready.then(() => 'ready' as const), new Promise<'loading'>((res) => setTimeout(() => res('loading'), 50))])
    }
    // typert 边界校验:可选字段绝不写入键(显式 undefined 键也会被拒)
    const out: StatusResult = {
      ok: rt !== null && !('error' in rt),
      home: this.homeDir,
      files: files.length,
      chunks: files.reduce((s, f) => s + (f.status === 'done' ? f.chunks : 0), 0),
      indexing: this.queuedFiles,
      model,
      dim: this.embedder?.dim ?? null,
    }
    if (rt !== null && 'error' in rt && rt.error != null) out.error = rt.error
    if (this.recoveryNote !== null) out.note = this.recoveryNote
    return out
  }

  // ── RPC(面板) ────────────────────────────────────────────

  @Remote('status')
  async rpcStatus(): Promise<StatusResult> {
    return await this.statusInfo()
  }

  @Remote('list')
  async rpcList(): Promise<ListResult> {
    return await this.listFiles()
  }

  @Remote('import')
  async rpcImport(p: { path: string }): Promise<ImportResult> {
    return await this.importPath(p.path)
  }

  @Remote('remove')
  async rpcRemove(p: { path: string }): Promise<RemoveResult> {
    return await this.remove(p.path)
  }

  @Remote('search')
  async rpcSearch(p: { query: string; topk: number; author?: string; stage?: string; tag?: string; likesMin?: number }): Promise<SearchResult> {
    return await this.search(p.query, p.topk, {
      author: p.author,
      stage: p.stage,
      tag: p.tag,
      likesMin: p.likesMin,
    })
  }

  @Remote('url-import')
  async rpcUrlImport(p: { urls: string[] }): Promise<ImportResult> {
    return await this.importUrls(Array.isArray(p.urls) ? p.urls.map(String) : [])
  }

  @Remote('note')
  async rpcNote(p: { title: string; text: string }): Promise<ImportResult> {
    return await this.importNote(String(p.title ?? ''), String(p.text ?? ''))
  }

  /** 面板拖拽上传:浏览器端已读好的文本内容,逐个按笔记入库。 */
  @Remote('upload')
  async rpcUpload(p: { files: { name: string; text: string }[] }): Promise<ImportResult> {
    const files = Array.isArray(p.files) ? p.files.slice(0, 50) : []
    let queued = 0
    for (const f of files) {
      const r = await this.importNote(f.name, f.text)
      if (r.ok) queued += r.queued
      else return r
    }
    return { ok: true, queued, skippedUnchanged: 0, failedScan: [] }
  }

  /** 空态演示:内置样例文档 + 陷阱查询,并排展示 关键词检索(找不到)vs 混合检索(命中)。 */
  @Remote('demo')
  async rpcDemo(): Promise<DemoResult> {
    const key = regKey('note', DEMO_NOTE_TITLE)
    const existed = this.registry.get(key)?.status === 'done'
    if (!existed) {
      await this.importNote(DEMO_NOTE_TITLE, DEMO_NOTE_TEXT)
      await this.drain()
    }
    const query = '怎么配置超时时间'
    const fts = await this.searchRaw(query, 3, true)
    const hybrid = await this.searchRaw(query, 3, false)
    // typert 边界:note 为空时不写键
    const out: DemoResult = { ok: true, imported: !existed, query, fts: fts.hits, hybrid: hybrid.hits }
    if (fts.hits.length === 0) out.note = '关键词检索找不到——文档里没有"超时"二字'
    return out
  }

  /** 面板:workspace 常驻目录管理。 */
  @Remote('workspace-add')
  async rpcWorkspaceAdd(p: { path: string; label?: string }): Promise<{ ok: boolean; error?: string }> {
    return await this.workspaceMgr.add(String(p.path ?? ''), p.label === undefined ? undefined : String(p.label))
  }

  @Remote('workspace-remove')
  async rpcWorkspaceRemove(p: { path: string }): Promise<{ ok: boolean; removed: boolean }> {
    return { ok: true, removed: await this.workspaceMgr.remove(String(p.path ?? '')) }
  }

  @Remote('workspace-list')
  async rpcWorkspaceList(): Promise<{ ok: boolean; workspaces: { path: string; label: string; addedAt: number }[] }> {
    return { ok: true, workspaces: this.workspaceMgr.list() }
  }

  /** 面板/侧边栏:今日采集概览(kb_today 工具的同源数据面)。 */
  @Remote('today')
  async rpcToday(): Promise<TodayResult> {
    await this.loadRegistry()
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const files = [...this.registry.values()]
    const todayNew = files.filter((f) => f.meta?.date === date || new Date(f.importedAt).toDateString() === now.toDateString())
    const top: TodayTop[] = [...todayNew].filter((f) => (f.meta?.likes ?? 0) > 0).sort((x, y) => (y.meta?.likes ?? 0) - (x.meta?.likes ?? 0)).slice(0, 8).map((f) => ({ author: f.meta?.author ?? f.path.split(/[/\\]/).pop() ?? f.path, likes: f.meta?.likes ?? 0, file: f.path }))
    const rawPending = files.filter((f) => f.meta?.stage === 'raw').length
    const lines = [
      `今日新增 ${todayNew.length} 篇 · 待分诊(raw)存量 ${rawPending}`,
      ...(top.length > 0 ? ['高价值 TOP:'].concat(top.map((t) => `◆ ${t.author} · 赞 ${t.likes} · ${t.file.split(/[\\/]/).pop()}`)) : []),
    ]
    return { ok: true, date, newFiles: todayNew.length, rawPending, top, text: lines.join('\n') }
  }
  /** 面板:定时任务管理(AI 侧走 kb_schedule 工具,同一注册表)。 */
  @Remote('schedule-list')
  async rpcScheduleList(): Promise<{ ok: boolean; schedules: unknown[] }> {
    return { ok: true, schedules: JSON.parse(JSON.stringify(this.scheduleMgr.list())) }
  }

  @Remote('schedule-set')
  async rpcScheduleSet(p: { name: string; kind: string; everyMin?: number; at?: string; enabled?: boolean }): Promise<{ ok: boolean; error?: string }> {
    return await this.scheduleMgr.set(p)
  }

  @Remote('schedule-remove')
  async rpcScheduleRemove(p: { name: string }): Promise<{ ok: boolean; removed: boolean }> {
    return { ok: true, removed: await this.scheduleMgr.remove(String(p.name ?? '')) }
  }

  @Remote('schedule-toggle')
  async rpcScheduleToggle(p: { name: string; enabled: boolean }): Promise<{ ok: boolean; error?: string }> {
    return await this.scheduleMgr.setEnabled(String(p.name ?? ''), Boolean(p.enabled))
  }

  /** demo 用:可强制 FTS-only 的检索。 */
  private async searchRaw(query: string, topk: number, ftsOnly: boolean): Promise<SearchResult> {
    const rt = await this.ensureRuntime()
    if ('error' in rt) return { ok: false, mode: 'none', hits: [], error: rt.error }
    let queryVec: number[] | null = null
    if (!ftsOnly) {
      if (rt.embedder.ready !== null) await rt.embedder.ready
      queryVec = (await rt.embedder.embed([query], true))[0]
    }
    const raw = rt.store.search(queryVec, query, topk)
    const byId = new Map([...this.registry.values()].map((f) => [f.id, f]))
    return {
      ok: true,
      mode: queryVec === null ? 'fts' : 'hybrid',
      hits: raw.map((r) => ({ ref: `${byId.get(r.file)?.path ?? r.file}#${r.chunk}`, score: r.score, text: r.text })),
    }
  }

  /** 队列排空(测试等待用)。 */
  async drain(): Promise<void> {
    await this.queueTail
    await this.saveTail
  }

  /** 立即释放 zvec 写锁(进程内测试与优雅退出用)。 */
  shutdown(): void {
    this.store?.close()
    this.store = null
  }

  // ── 注册表持久化 ─────────────────────────────────────────

  private get registryPath(): string {
    return join(this.homeDir, 'registry.json')
  }

  private async loadRegistry(): Promise<void> {
    if (this.registryLoaded) return
    this.registryLoaded = true
    try {
      const raw = JSON.parse(await readFile(this.registryPath, 'utf8')) as { files?: FileEntryInternal[] }
      for (const f of raw.files ?? []) this.registry.set(normKey(f.path), { ...f, bytes: f.bytes ?? 0 })
    } catch {
      /* 首次运行无注册表 */
    }
  }

  private saveTail: Promise<void> = Promise.resolve()

  /** 尾随式持久化:合并排队写盘,最后一次状态必然落盘。 */
  private saveRegistry(): void {
    this.saveTail = this.saveTail.then(async () => {
      try {
        await mkdir(this.homeDir, { recursive: true })
        await writeFile(this.registryPath, JSON.stringify({ version: 1, files: [...this.registry.values()] }, null, 2), 'utf8')
      } catch {
        /* 持久化失败不阻断索引 */
      }
    })
  }
}

/** FileEntry 运行时含 bytes(注册表字段);类型合并放这里避免污染公共类型。 */
export interface FileEntryInternal extends FileEntry {
  bytes: number
  metaSig?: string
  meta?: ChunkScalars
}

function entryOf(path: string): FileEntryInternal {
  return { id: '', path: resolve(path), chunks: 0, status: 'indexing', importedAt: Date.now(), bytes: 0 }
}

function extLower(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

export default ZvecKbService
