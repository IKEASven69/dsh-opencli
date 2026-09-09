/**
 * 扇出引擎集成测试：真实 git 仓库 + 真实子进程（假队员命令）。
 * M1 验收的自动化等价物：三树并行互不可见、各自产出交付物、主树零污染、
 * 单队员失败不炸整场、spawn 错误可捕获、超时可击杀。
 */
import { afterAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runArena } from '../src/runner.ts'
import { isMainTreeClean } from '../src/worktree.ts'

const pexec = promisify(execFile)

const roots: string[] = []
afterAll(async () => {
  // 临时仓库留着不清理会积累；但 vitest 结束后目录在系统临时区，可接受
  void roots
})

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'arena-it-'))
  roots.push(dir)
  const g = (args: string) => pexec('git', args.split(' '), { cwd: dir })
  await g('init -b main')
  await g('config user.email arena@test')
  await g('config user.name arena')
  await writeFile(join(dir, 'README.md'), '# fixture\n')
  await g('add .')
  await g('commit -m init')
  return dir
}

// 假队员：往自己 worktree 写交付物，内容带任务全文与队员名（验证环境变量与隔离）
const WORKER_JS = "const fs=require('fs');fs.writeFileSync('out-'+process.env.ARENA_MEMBER+'.txt', process.env.ARENA_TASK)"

describe('runArena 集成（真实 git + 真实子进程）', () => {
  it('三人扇出：三树并行、互不可见、各自交付、主树零污染', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: '修复登录超时',
      members: [
        { name: 'alpha', command: 'node', args: ['-e', WORKER_JS] },
        { name: 'beta', command: 'node', args: ['-e', WORKER_JS] },
        { name: 'gamma', command: 'node', args: ['-e', WORKER_JS] },
      ],
    })
    expect(r.members).toHaveLength(3)
    for (const m of r.members) {
      expect(m.exitCode).toBe(0)
      expect(m.timedOut).toBe(false)
      expect(m.worktreePath).toContain('.dsh-worktrees')
      const out = await readFile(join(m.worktreePath, `out-${m.name}.txt`), 'utf8')
      expect(out).toBe('修复登录超时')
    }
    // 三树互不可见：alpha 树里看不到 beta 的交付物
    await expect(readFile(join(r.members[0]!.worktreePath, 'out-beta.txt'), 'utf8')).rejects.toThrow()
    // 主树零污染（.dsh-worktrees 被 exclude 隐藏）
    expect(await isMainTreeClean(repo)).toBe(true)
    // 清单两阶段落盘：终态 finished
    const manifest = JSON.parse(await readFile(r.manifestPath, 'utf8'))
    expect(manifest.status).toBe('finished')
    expect(manifest.members).toHaveLength(3)
  }, 30_000)

  it('单队员退出码非零不炸整场，逐队员记录', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: 't',
      members: [
        { name: 'bad', command: 'node', args: ['-e', 'process.exit(3)'] },
        { name: 'good', command: 'node', args: ['-e', WORKER_JS] },
      ],
    })
    expect(r.members.find((m) => m.name === 'bad')!.exitCode).toBe(3)
    expect(r.members.find((m) => m.name === 'good')!.exitCode).toBe(0)
  }, 30_000)

  it('命令不存在 → 记录为失败（spawnError 或非零退出），不炸整场', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: 't',
      members: [
        { name: 'ghost', command: 'definitely-not-a-real-cmd-xyz' },
        { name: 'real', command: 'node', args: ['-e', WORKER_JS] },
      ],
    })
    const ghost = r.members.find((m) => m.name === 'ghost')!
    expect(ghost.spawnError !== undefined || (ghost.exitCode === null || ghost.exitCode !== 0)).toBe(true)
    expect(r.members.find((m) => m.name === 'real')!.exitCode).toBe(0)
  }, 30_000)

  it('超时击杀：timedOut=true，整场不被单队员拖死', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: 't',
      timeoutMs: 400,
      members: [
        { name: 'slow', command: 'node', args: ['-e', 'setTimeout(()=>{},60000)'] },
        { name: 'fast', command: 'node', args: ['-e', WORKER_JS] },
      ],
    })
    const slow = r.members.find((m) => m.name === 'slow')!
    expect(slow.timedOut).toBe(true)
    expect(slow.exitCode).not.toBe(0)
    expect(r.members.find((m) => m.name === 'fast')!.exitCode).toBe(0)
  }, 30_000)
})
