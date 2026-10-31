// 快照 diff 测试(0.4.6 C):纯函数零 IO。
// 三形态(新增/消失/位移)+包装数组+身份字段回退+非 JSON 折规模摘要+渲染。
import { describe, it, expect } from 'vitest'
import { diffSnapshots, renderDiffText } from '../src/diffsnap.ts'

const list = (items: Array<Record<string, unknown>>): string => JSON.stringify(items)

describe('diffSnapshots 三形态', () => {
  it('新增:next 多出的条目', () => {
    const d = diffSnapshots(list([{ id: 1, title: 'A' }]), list([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]))
    expect(d.structured).toBe(true)
    expect(d.added).toBe(1)
    expect(d.entries[0]).toMatchObject({ kind: 'new', title: 'B', to: 2 })
  })
  it('消失:prev 有 next 无', () => {
    const d = diffSnapshots(list([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]), list([{ id: 1, title: 'A' }]))
    expect(d.removed).toBe(1)
    expect(d.entries[0]).toMatchObject({ kind: 'gone', title: 'B' })
  })
  it('位移:同条目排名变化(≥3 位才报)', () => {
    const prev = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, title: 'T' + i }))
    const next = [6, 2, 3, 4, 5, 1].map((i) => ({ id: i, title: 'T' + i }))
    const d = diffSnapshots(list(prev), list(next))
    // 1: #1→#6(移5) 6: #6→#1(移5) 报 2 条;2-5 微小互换不算
    expect(d.moved).toBeGreaterThanOrEqual(2)
    expect(d.entries.some((e) => e.kind === 'moved' && e.from === 1 && e.to === 6)).toBe(true)
  })
  it('无变化:零新增零消失零位移', () => {
    const same = list([{ id: 1, title: 'A' }])
    const d = diffSnapshots(same, same)
    expect(d.structured).toBe(true)
    expect(d.added + d.removed + d.moved).toBe(0)
    expect(renderDiffText(d)).toBe('与上次相比无变化')
  })
})

describe('包装与回退', () => {
  it('{data:[...]} 包装数组照常比对', () => {
    const d = diffSnapshots(JSON.stringify({ data: [{ id: 1 }] }), JSON.stringify({ data: [{ id: 1 }, { id: 2 }] }))
    expect(d.structured).toBe(true)
    expect(d.added).toBe(1)
  })
  it('非 JSON:折成规模摘要,不臆造条目', () => {
    const d = diffSnapshots('a\nb\nc', 'a\nb\nc\nd')
    expect(d.structured).toBe(false)
    expect(d.summary).toContain('3 行 → 7B/4 行')
    expect(renderDiffText(d)).toContain('规模')
  })
  it('无 id 条目:整行文本当身份;对象无字段时稳定序列化兜底', () => {
    const d = diffSnapshots(list(['甲', '乙']), list(['甲', '丙']))
    expect(d.added).toBe(1)
    expect(d.removed).toBe(1)
    const d2 = diffSnapshots(list([{ x: 1 }]), list([{ x: 2 }]))
    expect(d2.added).toBe(1)
    expect(d2.removed).toBe(1)
  })
})

describe('renderDiffText(推送正文)', () => {
  it('三形态齐全时可读渲染,截前几条', () => {
    const prev = [1, 2].map((i) => ({ id: i, title: '旧' + i }))
    const next = [3, 4].map((i) => ({ id: i, title: '新' + i }))
    const d = diffSnapshots(list(prev), list(next))
    const t = renderDiffText(d)
    expect(t).toContain('新增 2 条')
    expect(t).toContain('消失 2 条')
    expect(t).toContain('新3')
  })
})

describe('exportSnapshots(⑦ CSV 导出)', () => {
  it('多份结构化快照 → 单表 CSV(_at/_site 前缀列+条目列并集,引号转义)', async () => {
    const { exportSnapshots, csvCell } = await import('../src/exportcsv.ts')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    const r = exportSnapshots({ snapshots: [
      { at: '2026-10-30T01:00:00Z', site: 'site juejin hot', stdout: JSON.stringify([{ rank: 1, title: 'A' }, { rank: 2, title: 'B' }]) },
      { at: '2026-10-31T01:00:00Z', site: 'site juejin hot', stdout: JSON.stringify({ data: [{ rank: 1, title: 'A2', extra: true }] }) },
    ] })
    expect(r.rows).toBe(3)
    expect(r.text.split('\r\n')[0]).toBe('_at,_site,rank,title,extra')
    expect(r.text).toContain('2026-10-30T01:00:00Z,site juejin hot,1,A,')
  })
  it('非 JSON 快照 → 原文分节带出处,rows=0', async () => {
    const { exportSnapshots } = await import('../src/exportcsv.ts')
    const r = exportSnapshots({ snapshots: [{ at: 'a', site: 'site x hot', stdout: '纯文本内容' }] })
    expect(r.rows).toBe(0)
    expect(r.text).toContain('# a site x hot')
    expect(r.text).toContain('纯文本内容')
  })
})
