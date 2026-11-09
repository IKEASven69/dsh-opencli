// approvalDecision 判定稳定性(纯函数回归)。
// 0.1.3 C⑧ 名实修正:本文件原名 schedule-dedupe.test.ts,标题称测「schedule-add 幂等去重」,
// 实测的却是 approvalDecision——名不副实。schedule-add 真幂等(同 site+cron 复用已有任务、
// 不产生僵尸副本)由 advanced.test.ts「schedule-add 落盘 watch 字段;重复 add 更新 watch 不产生
// 僵尸副本」服务层用例覆盖(r2.id===r1.id + 同 site 仅 1 条);本文件按实际内容改名,只锁
// 审批判定对相同输入的输出稳定(governor 乱序重放下同一调用不得翻转判定)。
import { describe, expect, it } from 'vitest'
import { approvalDecision } from '../src/parsers.ts'

describe('approvalDecision 判定稳定(纯函数回归)', () => {
  it('相同输入输出稳定:审批开 + 写命令 → 恒 ask-write', () => {
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
