/**
 * 调度注册表:AI 经 kb_schedule 工具(或面板)写入的持久化定时任务。
 * 设计:策略在 agent(skill 层,看发博节奏等数据决定 cadence),执行在引擎(可靠定时器)。
 * v1 动作:scan(全 workspace 增量索引);动作枚举随 v0.2 扩展(briefing/export)。
 * @module dsh-intelhub
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ScheduleEntry {
  name: string
  /** 'interval':每 everyMin 分钟;'daily':每天 at HH:MM */
  kind: 'interval' | 'daily'
  everyMin?: number
  at?: string
  action: 'scan'
  enabled: boolean
  createdAt: number
  lastRunAt?: number
}

export interface ScheduleSetResult {
  ok: boolean
  error?: string
}

const normKey = (n: string): string => n.trim().toLowerCase()
const AT_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export class ScheduleManager {
  private entries = new Map<string, ScheduleEntry>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private loaded = false

  constructor(
    private readonly homeDir: string,
    private readonly execute: (entry: ScheduleEntry) => Promise<void>,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = JSON.parse(await readFile(join(this.homeDir, 'schedules.json'), 'utf8')) as { schedules?: ScheduleEntry[] }
      for (const e of raw.schedules ?? []) this.entries.set(normKey(e.name), e)
    } catch {
      /* 首次运行无注册表 */
    }
  }

  private async persist(): Promise<void> {
    await mkdir(this.homeDir, { recursive: true })
    await writeFile(join(this.homeDir, 'schedules.json'), JSON.stringify({ version: 1, schedules: [...this.entries.values()] }, null, 2), 'utf8')
  }

  list(): ScheduleEntry[] {
    return [...this.entries.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  async set(entry: { name?: unknown; kind?: unknown; everyMin?: unknown; at?: unknown; action?: unknown; enabled?: unknown }): Promise<ScheduleSetResult> {
    await this.load()
    const name = String(entry.name ?? '').trim()
    if (name.length < 2 || name.length > 60) return { ok: false, error: 'name 需 2-60 字符' }
    const kind = entry.kind === 'daily' ? 'daily' : 'interval'
    let everyMin: number | undefined
    let at: string | undefined
    if (kind === 'interval') {
      everyMin = Math.floor(Number(entry.everyMin))
      if (!Number.isFinite(everyMin) || everyMin < 1 || everyMin > 60 * 24 * 7) return { ok: false, error: 'everyMin 需 1-10080 分钟' }
    } else {
      at = String(entry.at ?? '').trim()
      if (!AT_RE.test(at)) return { ok: false, error: 'at 需 HH:MM 格式(24 小时制)' }
    }
    const action = entry.action === undefined ? 'scan' : String(entry.action)
    if (action !== 'scan') return { ok: false, error: `暂不支持的动作:${action}(v0.2 扩展 briefing/export)` }
    const prev = this.entries.get(normKey(name))
    const next: ScheduleEntry = {
      name,
      kind,
      everyMin,
      at,
      action: 'scan',
      enabled: entry.enabled === undefined ? prev?.enabled ?? true : Boolean(entry.enabled),
      createdAt: prev?.createdAt ?? Date.now(),
      lastRunAt: prev?.lastRunAt,
    }
    this.entries.set(normKey(name), next)
    await this.persist()
    this.startTimer(next)
    return { ok: true }
  }

  async remove(name: string): Promise<boolean> {
    await this.load()
    const key = normKey(name)
    const t = this.timers.get(key)
    if (t !== undefined) {
      clearTimeout(t)
      this.timers.delete(key)
    }
    const ok = this.entries.delete(key)
    if (ok) await this.persist()
    return ok
  }

  async setEnabled(name: string, enabled: boolean): Promise<ScheduleSetResult> {
    await this.load()
    const e = this.entries.get(normKey(name))
    if (e === undefined) return { ok: false, error: `不存在:${name}` }
    e.enabled = enabled
    await this.persist()
    if (enabled) this.startTimer(e)
    else {
      const t = this.timers.get(normKey(name))
      if (t !== undefined) {
        clearTimeout(t)
        this.timers.delete(normKey(name))
      }
    }
    return { ok: true }
  }

  startAll(): void {
    void this.load().then(() => {
      for (const e of this.entries.values()) if (e.enabled) this.startTimer(e)
    })
  }

  stopAll(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  /** 到点执行并排下一次;interval 用自校准 setTimeout(防漂移),daily 算到明天的 HH:MM。 */
  private startTimer(e: ScheduleEntry): void {
    const key = normKey(e.name)
    const prev = this.timers.get(key)
    if (prev !== undefined) clearTimeout(prev)
    const delayMs = e.kind === 'interval'
      ? Math.max(1, (e.everyMin ?? 60)) * 60_000
      : this.msUntilTodayOrTomorrow(e.at ?? '09:00')
    const t = setTimeout(() => {
      void (async () => {
        const cur = this.entries.get(key)
        if (cur === undefined || !cur.enabled) return
        cur.lastRunAt = Date.now()
        await this.persist().catch(() => {})
        try {
          await this.execute(cur)
        } catch {
          /* 执行失败不影响下次调度 */
        }
        this.startTimer(cur)
      })()
    }, delayMs)
    try {
      t.unref?.()
    } catch {
      /* ignore */
    }
    this.timers.set(key, t)
  }

  private msUntilTodayOrTomorrow(at: string): number {
    const m = at.match(AT_RE)
    if (m === null) return 60 * 60_000
    const now = new Date()
    const target = new Date(now)
    target.setHours(Number(m[1]), Number(m[2]), 0, 0)
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
    return target.getTime() - now.getTime()
  }
}
