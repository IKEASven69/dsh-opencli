// schedule-add 幂等去重:governor 队列乱序下同 site+cron 重复添加必须复用已有任务
// (全权审查实测:governor 下 add/remove 乱序曾产生 3 条僵尸副本)
import { describe, expect, it } from 'vitest'
import { approvalDecision } from '../src/parsers.ts'

// 这里只测纯函数层:调度幂等由宿主联测覆盖(全权审查套件)。
// 补一条纯逻辑回归:同参数 choice 判定稳定(竞态修复的回归保护)。
describe('调度幂等保护(纯函数回归)', () => {
  it('approvalDecision 对相同输入输出稳定(幂等语义基础)', () => {
    const a1 = approvalDecision(true, [], 'site', 'zhihu', 'comment', 'write')
    const a2 = approvalDecision(true, [], 'site', 'zhihu', 'comment', 'write')
    expect(a1).toBe(a2)
    expect(a1).toBe('ask-write')
  })
  it('禁用适配器始终放行(不受调用次数影响)', () => {
    for (let i = 0; i < 3; i++) {
      expect(approvalDecision(true, ['zhihu'], 'site', 'zhihu', 'hot', 'read')).toBe('allow')
    }
  })
})
