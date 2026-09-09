/**
 * M2 裁决台集成测试：真实 git 仓库上的收作业、统计、预合并冲突检测、
 * 选优合并（含清扫）、测试失败自动回滚。
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runArena } from '../src/runner.ts'
import { buildVerdict, commitMemberWork, mergePreview, mergeWinner } from '../src/verdict.ts'
import { isMainTreeClean } from '../src/worktree.ts'

const pexec = promisify(execFile)

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'arena-m2-'))
  const g = (args: string) => pexec('git', args.split(' '), { cwd: dir })
  await g('init -b main')
  await g('config user.email arena@test')
  await g('config user.name arena')
  await writeFile(join(dir, 'README.md'), '# fixture\n')
  await g('add .')
  await g('commit -m init')
  return dir
}

const APPEND_NOTE = "const fs=require('fs');fs.appendFileSync('README.md', '\\nNOTE-' + process.env.ARENA_MEMBER)"
const WRITE_OUT = "const fs=require('fs');fs.writeFileSync('out-' + process.env.ARENA_MEMBER + '.txt', process.env.ARENA_TASK)"

describe('buildVerdict 裁决对比', () => {
  it('逐队员统计 + 预合并干净 + 完整性令牌', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: '各自写交付物',
      members: [
        { name: 'alpha', command: 'node', args: ['-e', WRITE_OUT] },
        { name: 'beta', command: 'node', args: ['-e', WRITE_OUT] },
      ],
    })
    const rows = await buildVerdict(repo, r.runId)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.filesCount).toBeGreaterThanOrEqual(1)
      expect(row.insertions).toBeGreaterThan(0)
      expect(row.receipt).toHaveLength(16)
      expect(row.mergeClean).toBe(true)
      expect(row.conflicts).toHaveLength(0)
    }
    expect(rows[0]!.receipt).not.toBe(rows[1]!.receipt)
  }, 30_000)
})

describe('mergePreview 冲突检测', () => {
  it('先合一人后，另一人改同一区域 → 预合并报冲突且主树未被触碰', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: '都在 README 追加一行',
      members: [
        { name: 'alpha', command: 'node', args: ['-e', APPEND_NOTE] },
        { name: 'beta', command: 'node', args: ['-e', APPEND_NOTE] },
      ],
    })
    const before = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    const out = await mergeWinner(repo, r.runId, 'alpha', { cleanup: false })
    expect(out.merged).toBe(true)
    const headAfterMerge = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    expect(headAfterMerge).not.toBe(before)
    const readme = await readFile(join(repo, 'README.md'), 'utf8')
    expect(readme).toContain('NOTE-alpha')
    // merge-tree 只看已提交的树——beta 未收作业的产出必须先 commitMemberWork 才对预合并可见
    const beta = r.members.find((m) => m.name === 'beta')!
    await commitMemberWork(beta.worktreePath, 'beta')
    const mp = await mergePreview(repo, beta.branch)
    expect(mp.clean).toBe(false)
    expect(mp.conflicts.length).toBeGreaterThan(0)
    const headAfterPreview = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    expect(headAfterPreview).toBe(headAfterMerge)
  }, 30_000)
})

describe('mergeWinner 选优合并', () => {
  it('合并进主干 + 队员树清扫 + 分支删除', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: '各自写交付物',
      members: [
        { name: 'alpha', command: 'node', args: ['-e', WRITE_OUT] },
        { name: 'beta', command: 'node', args: ['-e', WRITE_OUT] },
      ],
    })
    const out = await mergeWinner(repo, r.runId, 'alpha', { cleanup: true })
    expect(out.merged).toBe(true)
    expect(out.cleanedWorktrees).toHaveLength(2)
    expect(existsSync(r.members[0]!.worktreePath)).toBe(false)
    expect(existsSync(r.members[1]!.worktreePath)).toBe(false)
    expect(await isMainTreeClean(repo)).toBe(true)
    const branches = await pexec('git', ['branch', '--list', 'wt/arena-*'], { cwd: repo })
    expect(branches.stdout.trim()).toBe('')
    const delivered = await readFile(join(repo, 'out-alpha.txt'), 'utf8')
    expect(delivered.length).toBeGreaterThan(0)
  }, 30_000)

  it('验收命令失败 + autoRollback → 主干回滚到合并前', async () => {
    const repo = await makeRepo()
    const r = await runArena({
      repoRoot: repo,
      task: '各自写交付物',
      members: [
        { name: 'alpha', command: 'node', args: ['-e', WRITE_OUT] },
        { name: 'beta', command: 'node', args: ['-e', WRITE_OUT] },
      ],
    })
    const prev = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    const out = await mergeWinner(repo, r.runId, 'alpha', {
      testCmd: 'node -e "process.exit(1)"',
      autoRollback: true,
      cleanup: false,
    })
    expect(out.rolledBack).toBe(true)
    expect(out.merged).toBe(false)
    const head = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    expect(head).toBe(prev)
    // 回滚时保留现场
    expect(out.keptForInspection.length).toBe(2)
    expect(existsSync(r.members[0]!.worktreePath)).toBe(true)
  }, 30_000)
})
