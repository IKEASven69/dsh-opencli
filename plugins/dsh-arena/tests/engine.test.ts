/**
 * 纯函数测试：命名约定、{task} 令牌替换、队员校验。
 * 路径断言用 node:path join 计算，跨平台（Windows 反斜杠）不写死。
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { branchFor, worktreePathFor, worktreeRoot } from '../src/worktree.ts'
import { substituteTask, validateMembers } from '../src/runner.ts'

describe('命名约定', () => {
  it('worktree 根 = <repo>/.dsh-worktrees/<runId>', () => {
    expect(worktreeRoot('/r', 'a1')).toBe(join('/r', '.dsh-worktrees', 'a1'))
  })
  it('分支 = wt/arena-<runId>/<member>', () => {
    expect(branchFor('a1', 'scout')).toBe('wt/arena-a1/scout')
  })
  it('队员路径 = 根 + 队员名', () => {
    expect(worktreePathFor('/r', 'a1', 'scout')).toBe(join('/r', '.dsh-worktrees', 'a1', 'scout'))
  })
})

describe('{task} 令牌替换', () => {
  it('替换所有出现', () => {
    expect(substituteTask(['--profile', 'headless', '{task}'], '修登录')).toEqual([
      '--profile',
      'headless',
      '修登录',
    ])
  })
  it('任务文本含特殊字符时原样透传（不经 shell）', () => {
    expect(substituteTask(['{task}'], 'a && b | c "d" $HOME')).toEqual(['a && b | c "d" $HOME'])
  })
  it('无令牌的参数不动', () => {
    expect(substituteTask(['-v'], 'x')).toEqual(['-v'])
  })
})

describe('队员校验', () => {
  const ok = { name: 'a', command: 'node' }
  it('少于 2 人拒绝（比赛定义）', () => {
    expect(() => validateMembers([])).toThrow(/2 名队员/)
    expect(() => validateMembers([ok])).toThrow(/2 名队员/)
  })
  it('超过 5 人拒绝（成本纪律）', () => {
    expect(() => validateMembers(Array.from({ length: 6 }, (_, i) => ({ name: `m${i}`, command: 'x' })))).toThrow(/上限 5/)
  })
  it('空名/空白名/重名/缺命令 拒绝', () => {
    expect(() => validateMembers([{ name: '', command: 'x' }, ok])).toThrow(/非法/)
    expect(() => validateMembers([{ name: 'a b', command: 'x' }, ok])).toThrow(/非法/)
    expect(() => validateMembers([ok, ok])).toThrow(/重复/)
    expect(() => validateMembers([ok, { name: 'b', command: '' }])).toThrow(/缺 command/)
  })
})
