/**
 * workspace 常驻目录监听:注册目录后自动增量索引。
 * 双保险:fs.watch 递归事件(实时)+ 定时全量扫描(兜底,防漏事件/离线期间的变化)。
 * 触发即 importPath(内容哈希增量,天然幂等,重复触发零成本)。
 * @module dsh-intelhub
 */

import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface WorkspaceEntry {
  path: string
  label: string
  addedAt: number
}

export interface WorkspaceAddResult {
  ok: boolean
  error?: string
}

const normKey = (p: string): string => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()

export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceEntry>()
  private watchers = new Map<string, FSWatcher>()
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private debounces = new Map<string, ReturnType<typeof setTimeout>>()
  private loaded = false

  constructor(
    private readonly homeDir: string,
    private readonly trigger: (path: string) => Promise<unknown>,
    private readonly debounceMs = 4000,
    private readonly scanMs = 5 * 60 * 1000,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = JSON.parse(await readFile(join(this.homeDir, 'workspaces.json'), 'utf8')) as { workspaces?: WorkspaceEntry[] }
      for (const w of raw.workspaces ?? []) this.workspaces.set(normKey(w.path), w)
    } catch {
      /* 首次运行无注册表 */
    }
  }

  private async persist(): Promise<void> {
    await mkdir(this.homeDir, { recursive: true })
    await writeFile(join(this.homeDir, 'workspaces.json'), JSON.stringify({ version: 1, workspaces: [...this.workspaces.values()] }, null, 2), 'utf8')
  }

  list(): WorkspaceEntry[] {
    return [...this.workspaces.values()].sort((a, b) => a.addedAt - b.addedAt)
  }

  async add(path: string, label?: string): Promise<WorkspaceAddResult> {
    const resolved = path.trim().replace(/^~(?=$|[/\\])/, '').length >= 0 ? path : path
    let st
    try {
      st = await stat(resolved)
    } catch {
      return { ok: false, error: `目录不存在:${resolved}` }
    }
    if (!st.isDirectory()) return { ok: false, error: `不是目录:${resolved}` }
    await this.load()
    const key = normKey(resolved)
    this.workspaces.set(key, { path: resolved, label: label?.trim() || resolved.split(/[\\/]/).pop() || resolved, addedAt: this.workspaces.get(key)?.addedAt ?? Date.now() })
    await this.persist()
    this.startWatching(key)
    // 注册即刻触发一次全量增量(同步等入队,索引在后台队列进行)
    await this.trigger(resolved).catch(() => {})
    return { ok: true }
  }

  async remove(path: string): Promise<boolean> {
    await this.load()
    const key = normKey(path)
    const existed = this.workspaces.delete(key)
    if (!existed) return false
    this.stopWatching(key)
    await this.persist()
    return true
  }

  startAll(): void {
    void this.load().then(() => {
      for (const key of this.workspaces.keys()) this.startWatching(key)
    })
  }

  stopAll(): void {
    for (const key of [...this.watchers.keys()]) this.stopWatching(key)
  }

  private startWatching(key: string): void {
    if (this.watchers.has(key)) return
    const entry = this.workspaces.get(key)
    if (entry === undefined) return
    try {
      const w = watch(entry.path, { recursive: true }, () => this.schedule(key))
      // 不阻塞宿主进程退出
      try {
        w.unref?.()
      } catch {
        /* 旧 Node 无 unref */
      }
      this.watchers.set(key, w)
    } catch {
      /* watch 失败(权限/平台)由轮询兜底 */
    }
    const t = setInterval(() => this.schedule(key), this.scanMs)
    try {
      t.unref?.()
    } catch {
      /* 旧环境无 unref */
    }
    this.timers.set(key, t)
  }

  private stopWatching(key: string): void {
    this.watchers.get(key)?.close()
    this.watchers.delete(key)
    const t = this.timers.get(key)
    if (t !== undefined) clearInterval(t)
    this.timers.delete(key)
    const d = this.debounces.get(key)
    if (d !== undefined) clearTimeout(d)
    this.debounces.delete(key)
  }

  /** 事件防抖:静默 debounceMs 后触发一次增量导入。 */
  private schedule(key: string): void {
    const prev = this.debounces.get(key)
    if (prev !== undefined) clearTimeout(prev)
    const t = setTimeout(() => {
      this.debounces.delete(key)
      const entry = this.workspaces.get(key)
      if (entry === undefined) return
      void this.trigger(entry.path).catch(() => {})
    }, this.debounceMs)
    try {
      t.unref?.()
    } catch {
      /* ignore */
    }
    this.debounces.set(key, t)
  }
}
