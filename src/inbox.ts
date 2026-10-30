/**
 * 命令收件箱(0.4.6 任务 F1):ctl 助手 → ~/.dsh/opencli-inbox/ 意图文件 → 插件消费执行。
 *
 * 为什么是收件箱而不是 RPC:面板聊天会话的 agent 有 shell(tool-pwsh)但没有本插件工具
 * (dsh 预设作用域,docs/RESEARCH-20261030)——文件收件箱让**任何**能跑命令的 dsh 会话
 * (面板/ZCode/任意插件的 agent)都能一句话驱动本插件,零鉴权(本机文件权限即边界),
 * 且天然跨进程(插件在网关进程内,ctl 在 agent 的 shell 里)。
 *
 * 安全纪律:
 *  - 意图是**白名单结构化数据**,绝不 eval;未知 kind/多余字段一律拒(闭集校验);
 *  - 单文件 ≤16KB、收件箱待处理 ≤200 条(防灌爆);
 *  - 处理完的意图移入 processed/(轮转保留 100),同 stem 写 <stem>.result.json 供 ctl --wait 取回;
 *  - 每次消费(成败均)落 ingest 事件,面板时间线可见——人机协同的每一步都有账。
 * @module dsh-opencli/inbox
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readdir, readFile, rename, writeFile, rm } from 'node:fs/promises'

/** 收件箱目录(测试可用 DSH_OPENCLI_INBOX_DIR 覆盖)。 */
export const inboxDir = (): string => process.env.DSH_OPENCLI_INBOX_DIR ?? join(homedir(), '.dsh', 'opencli-inbox')

/** 意图(闭集):kind 与字段全部显式,多余字段=拒绝。 */
export type Intent =
  | { kind: 'schedule-add'; site: string; cron: string; watch?: string; notify?: boolean; retry?: number }
  | { kind: 'schedule-remove'; id: string }
  | { kind: 'schedule-run'; id: string }
  | { kind: 'schedule-list' }
  | { kind: 'notify-set'; channels: Array<{ type: 'webhook' | 'email' | 'dsh'; url?: string; to?: string; enabled?: boolean }> }
  | { kind: 'notify-test' }
  | { kind: 'report-build'; id: string }
  | { kind: 'status' }

/** 消费结果:ctl --wait 读它向 agent 回话。 */
export interface IntentResult {
  ok: boolean
  at: string
  kind: string
  value?: unknown
  error?: string
}

/** 执行器 seam:由服务注入真实实现(单测桩掉);返回值原样进 result.value。 */
export interface IntentExecutor {
  scheduleAdd(i: Extract<Intent, { kind: 'schedule-add' }>): Promise<{ ok: boolean; id?: string; error?: string }>
  scheduleRemove(id: string): Promise<{ ok: boolean; error?: string }>
  scheduleRun(id: string): Promise<{ ok: boolean; error?: string }>
  scheduleList(): Promise<{ ok: boolean; schedules?: Array<Record<string, unknown>>; error?: string }>
  notifySet(channels: Intent extends never ? never : Extract<Intent, { kind: 'notify-set' }>['channels']): Promise<{ ok: boolean; error?: string }>
  notifyTest(): Promise<{ ok: boolean; error?: string }>
  reportBuild(id: string): Promise<{ ok: boolean; path?: string; error?: string }>
  status(): Promise<Record<string, unknown>>
  event(text: string): void
}

/** 严格意图校验:闭集 kind + 字段类型逐项核对,多余字段拒绝(白名单纪律)。 */
export function parseIntent(raw: unknown): Intent | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const keys = Object.keys(o)
  const allow = (allowed: string[]): boolean => keys.every((k) => allowed.includes(k))
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
  switch (o.kind) {
    case 'schedule-add':
      if (!allow(['kind', 'site', 'cron', 'watch', 'notify', 'retry'])) return null
      if (!str(o.site) || !str(o.cron)) return null
      if (o.watch !== undefined && typeof o.watch !== 'string') return null
      if (o.notify !== undefined && typeof o.notify !== 'boolean') return null
      if (o.retry !== undefined && (typeof o.retry !== 'number' || !Number.isFinite(o.retry))) return null
      return { kind: 'schedule-add', site: o.site, cron: o.cron, ...(o.watch !== undefined ? { watch: o.watch } : {}), ...(o.notify !== undefined ? { notify: o.notify } : {}), ...(o.retry !== undefined ? { retry: o.retry } : {}) } as Intent
    case 'schedule-remove':
      return allow(['kind', 'id']) && str(o.id) ? { kind: 'schedule-remove', id: o.id } : null
    case 'schedule-run':
      return allow(['kind', 'id']) && str(o.id) ? { kind: 'schedule-run', id: o.id } : null
    case 'schedule-list':
      return allow(['kind']) ? { kind: 'schedule-list' } : null
    case 'notify-set': {
      if (!allow(['kind', 'channels']) || !Array.isArray(o.channels) || o.channels.length === 0) return null
      const channels: Extract<Intent, { kind: 'notify-set' }>['channels'] = []
      for (const c of o.channels) {
        if (c === null || typeof c !== 'object') return null
        const cc = c as Record<string, unknown>
        if (!Object.keys(cc).every((k) => ['type', 'url', 'to', 'enabled'].includes(k))) return null
        if (cc.type !== 'webhook' && cc.type !== 'email' && cc.type !== 'dsh') return null
        if (cc.url !== undefined && typeof cc.url !== 'string') return null
        if (cc.to !== undefined && typeof cc.to !== 'string') return null
        if (cc.enabled !== undefined && typeof cc.enabled !== 'boolean') return null
        channels.push({ type: cc.type, ...(cc.url !== undefined ? { url: cc.url } : {}), ...(cc.to !== undefined ? { to: cc.to } : {}), ...(cc.enabled !== undefined ? { enabled: cc.enabled } : {}) })
      }
      return { kind: 'notify-set', channels }
    }
    case 'notify-test':
      return allow(['kind']) ? { kind: 'notify-test' } : null
    case 'report-build':
      return allow(['kind', 'id']) && str(o.id) ? { kind: 'report-build', id: o.id } : null
    case 'status':
      return allow(['kind']) ? { kind: 'status' } : null
    default:
      return null
  }
}

/** 单条意图执行(公共核心,ctl 与轮询共用)。 */
export async function applyIntent(intent: Intent, ex: IntentExecutor): Promise<IntentResult> {
  const at = new Date().toISOString()
  try {
    switch (intent.kind) {
      case 'schedule-add': {
        const r = await ex.scheduleAdd(intent)
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? { value: { id: r.id } } : { error: r.error ?? '创建失败' }) }
      }
      case 'schedule-remove': {
        const r = await ex.scheduleRemove(intent.id)
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? {} : { error: r.error ?? '删除失败' }) }
      }
      case 'schedule-run': {
        const r = await ex.scheduleRun(intent.id)
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? {} : { error: r.error ?? '触发失败' }) }
      }
      case 'schedule-list': {
        const r = await ex.scheduleList()
        return r.ok ? { ok: true, at, kind: intent.kind, value: r.schedules ?? [] } : { ok: false, at, kind: intent.kind, error: r.error ?? '读取失败' }
      }
      case 'notify-set': {
        const r = await ex.notifySet(intent.channels)
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? {} : { error: r.error ?? '保存失败' }) }
      }
      case 'notify-test': {
        const r = await ex.notifyTest()
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? {} : { error: r.error ?? '测试发送失败' }) }
      }
      case 'report-build': {
        const r = await ex.reportBuild(intent.id)
        return { ok: r.ok, at, kind: intent.kind, ...(r.ok ? { value: { path: r.path } } : { error: r.error ?? '生成失败' }) }
      }
      case 'status':
        return { ok: true, at, kind: intent.kind, value: await ex.status() }
    }
  } catch (e) {
    return { ok: false, at, kind: intent.kind, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 扫描并消费收件箱:返回处理条数。原子性=先改名占位(rename 失败即他人正在处理),再执行落果。 */
export async function drainInbox(ex: IntentExecutor, opts: { maxFiles?: number } = {}): Promise<number> {
  const dir = inboxDir()
  let entries: string[]
  try { entries = await readdir(dir) } catch { return 0 }
  const pending = entries.filter((f) => f.endsWith('.json') && !f.endsWith('.result.json')).sort().slice(0, opts.maxFiles ?? 200)
  let n = 0
  for (const f of pending) {
    const stem = f.slice(0, -5)
    const claiming = join(dir, `${stem}.claim`)
    try {
      // 占位:并发消费者(未来多进程)互斥;单进程下也防重复处理
      await rename(join(dir, f), claiming)
    } catch { continue }
    let result: IntentResult
    try {
      const raw = await readFile(claiming, 'utf8')
      if (raw.length > 16 * 1024) {
        result = { ok: false, at: new Date().toISOString(), kind: '(unknown)', error: '意图文件超 16KB 上限,拒绝' }
      } else {
        const intent = parseIntent(JSON.parse(raw))
        if (intent === null) {
          result = { ok: false, at: new Date().toISOString(), kind: '(invalid)', error: '意图不合法(白名单闭集校验未过):' + raw.slice(0, 120) }
        } else {
          result = await applyIntent(intent, ex)
          ex.event(`📥 收件箱执行 ${intent.kind}${result.ok ? ' ✓' : ' ✗ ' + String(result.error ?? '')}`)
        }
      }
    } catch (e) {
      result = { ok: false, at: new Date().toISOString(), kind: '(error)', error: e instanceof Error ? e.message : String(e) }
    }
    try {
      await writeFile(join(dir, `${stem}.result.json`), JSON.stringify(result), 'utf8')
      // 归档轮转:processed/ 只留最近 100 份
      const processedDir = join(dir, 'processed')
      await mkdir(processedDir, { recursive: true })
      await rename(claiming, join(processedDir, f)).catch(() => rm(claiming, { force: true }))
      const olds = (await readdir(processedDir)).sort()
      if (olds.length > 100) for (const o of olds.slice(0, olds.length - 100)) await rm(join(processedDir, o), { force: true }).catch(() => {})
    } catch { /* 结果写失败不阻断后续意图 */ }
    n++
  }
  return n
}
