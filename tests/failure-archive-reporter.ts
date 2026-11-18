/**
 * vitest 失败用例归档 reporter(0.1.5 复核 L5 条件收项,0.1.6 C5 落地)。
 *
 * 动机:全量测试存在低频 flake(trace.test.ts 7 次全量 2 次失败),本地裸跑时失败
 * 输出滚过终端即丢失,事后无从归因——本 reporter 在**有失败**的轮次把失败用例
 * (文件/全名/耗时/错误头)追加归档到 .qa/test-failures.jsonl,全绿轮零开销零文件。
 * 归档与 events.jsonl 同款轮转纪律:超 5MB 轮转为 .1。
 *
 * 设计边界:
 *  - 纯函数 failureRows / rotateIfNeeded 导出供成对测试(tests/failure-archive.test.ts),
 *    reporter 类只做装配——与 knowledge-gate「实现+测试成对」先例同构;
 *  - 结果形态跨 vitest 小版本有差异,遍历全部按 unknown + 防御收窄,取不到的字段如实
 *    缺省,绝不让归档自身炸掉测试轮(归档失败只在 stderr 提示,不影响退出码);
 *  - 始终挂载:绿轮不产生任何文件,无需 env 闸——「失败才落盘」本身就是闸。
 */
import { appendFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 一条失败归档行(落盘前形态,错误只留消息头,防止多行堆栈灌爆归档)。 */
export interface FailureRow {
  /** ISO 时间戳。 */
  at: string
  /** 用例所在文件(vitest File.name,通常为绝对路径)。 */
  file: string
  /** 用例全名(suite 链 + 用例名)。 */
  name: string
  /** 耗时毫秒;取不到如实缺省。 */
  durationMs?: number
  /** 错误消息头(每错误一条,截 300 字)。 */
  errors: string[]
}

/** 归档文件单文件预算,超限轮转(与 events.jsonl 5MB 同款口径)。 */
export const FAILURE_ARCHIVE_MAX_BYTES = 5 * 1024 * 1024

const ERROR_HEAD_MAX = 300

/**
 * 从 vitest onFinished 的 files 树中提取失败用例行(纯函数,跨版本防御收窄)。
 * 结构按 vitest File{ name, tasks[] }/Suite{ tasks[] }/TestCase{ name, result{ state, errors, duration } }
 * 处理,任何一层取不到都跳过该分支,不抛。
 */
export function failureRows(files: unknown, now: Date = new Date()): FailureRow[] {
  const rows: FailureRow[] = []
  const at = now.toISOString()
  const errorHeads = (rawErrors: unknown): string[] =>
    Array.isArray(rawErrors)
      ? rawErrors
          .map((e) => {
            if (e === null || typeof e !== 'object') return String(e)
            const msg = (e as Record<string, unknown>).message
            const head = typeof msg === 'string' ? msg : String(e)
            return head.length > ERROR_HEAD_MAX ? head.slice(0, ERROR_HEAD_MAX) : head
          })
          .filter((s) => s.length > 0)
      : []
  /**
   * 递归走任务树,返回本子树产出的行数,供容器级失败判定(评审 medium ③):
   * vitest 把 import 报错/收集错误记在文件级(File.result.state='fail',tasks 空/全绿),
   * 只走子级会整轮漏归档;而普通用例失败时 suite 聚合态同为 'fail',按「子级已有行则
   * 容器不重复记」避免双计。
   */
  const walk = (tasks: unknown, filePath: string, suite: string[]): number => {
    let produced = 0
    if (!Array.isArray(tasks)) return produced
    for (const t of tasks) {
      if (t === null || typeof t !== 'object') continue
      const task = t as Record<string, unknown>
      const name = typeof task.name === 'string' ? task.name : ''
      const children = task.tasks
      if (Array.isArray(children)) {
        produced += walk(children, filePath, [...suite, name])
        continue
      }
      const result = task.result as Record<string, unknown> | undefined
      if (result?.state !== 'fail') continue
      rows.push({
        at,
        file: filePath,
        name: [...suite, name].filter((s) => s.length > 0).join(' > '),
        ...(typeof result?.duration === 'number' ? { durationMs: result.duration } : {}),
        errors: errorHeads(result?.errors),
      })
      produced += 1
    }
    return produced
  }
  if (!Array.isArray(files)) return rows
  for (const f of files) {
    if (f === null || typeof f !== 'object') continue
    const file = f as Record<string, unknown>
    const filePath = typeof file.name === 'string' ? file.name : '(unknown)'
    const produced = walk(file.tasks, filePath, [])
    // 文件容器自身失败且子树零行(import 报错/收集错误形态):补文件级行,红轮不再静默丢
    const fr = file.result as Record<string, unknown> | undefined
    if (produced === 0 && fr?.state === 'fail') {
      rows.push({
        at,
        file: filePath,
        name: '(文件级失败:收集/导入错误,无可用例)',
        errors: errorHeads(fr.errors),
      })
    }
  }
  return rows
}

/**
 * 追加归档,超预算先轮转(→ .1)。目录不存在自动建;任何 IO 失败如实返回错误原因,
 * 不抛——归档绝不能反噬测试轮。
 */
export function appendFailureArchive(
  path: string,
  rows: FailureRow[],
  maxBytes: number = FAILURE_ARCHIVE_MAX_BYTES,
): { ok: boolean; error?: string } {
  if (rows.length === 0) return { ok: true }
  try {
    try {
      mkdirSync(join(path, '..'), { recursive: true })
    } catch { /* 目录已存在或不可建——append 再如实报 */ }
    if (existsSync(path)) {
      let size = 0
      try { size = statSync(path).size } catch { /* 读不到大小按 0 处理,append 侧兜底 */ }
      if (size > maxBytes) renameSync(path, `${path}.1`)
    }
    const lines = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    appendFileSync(path, lines, 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 默认归档路径(repo 根 .qa/test-failures.jsonl;tests/ 的上一级)。 */
export const failureArchivePath = join(import.meta.dirname, '..', '.qa', 'test-failures.jsonl')

/** vitest reporter:有失败才落盘(绿轮零开销零文件)。归档路径可注入(测试用临时目录,
 *  绝不指真实 .qa——测试自身的 rmSync 会抹掉真实 flake 归档,反噬 L5 初衷)。
 *  构造参数防御:vitest 会以配置对象实例化自定义 reporter(实测 new Reporter(config)),
 *  非 string 实参一律回落默认真实路径。 */
export default class FailureArchiveReporter {
  private readonly archivePath: string
  constructor(archivePath?: unknown) {
    this.archivePath = typeof archivePath === 'string' && archivePath.length > 0 ? archivePath : failureArchivePath
  }
  onFinished(files: unknown): void {
    const rows = failureRows(files)
    if (rows.length === 0) return
    const r = appendFailureArchive(this.archivePath, rows)
    if (!r.ok) console.error(`[failure-archive] 归档失败(不影响测试结果):${r.error}`)
  }
}
