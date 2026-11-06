// 七天聚合与 CSV diff 列(0.4.7 B1):diffItemMarks 完整标记(不受 entries 20 条截断)、
// aggregateDaySums 按日求和、exportSnapshots 的 _diff 列按身份键回配。
import { describe, expect, it } from 'vitest'
import { aggregateDaySums, detectDrift, diffItemMarks } from '../src/diffsnap.ts'
import { exportSnapshots } from '../src/exportcsv.ts'

const list = (items: Array<{ t: string }>): string => JSON.stringify(items)

describe('diffItemMarks(逐条标记,完整无截断)', () => {
  it('new/gone/moved 三形态按身份键标记;moved 阈值 ≥3 位', () => {
    // title 在身份字段列表(id/title/url/name/text/content)里 → 键即 title 本身,断言可直读
    const prev = list([{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }])
    const next = list([{ title: 'd' }, { title: 'b' }, { title: 'c' }, { title: 'e' }])
    const m = diffItemMarks(prev, next)
    expect(m.get('d')).toBe('moved #4→#1')
    expect(m.get('e')).toBe('new')
    expect(m.get('a')).toBe('gone')
    expect(m.get('b')).toBeUndefined() // 位移 0
    expect(m.get('c')).toBeUndefined()
  })
  it('非结构化(任一侧解析失败)返回空 Map(不标不臆造)', () => {
    expect(diffItemMarks('not json', list([{ t: 'a' }])).size).toBe(0)
    expect(diffItemMarks(list([{ t: 'a' }]), 'not json').size).toBe(0)
  })
  it('超过 20 条变化也完整标记(diffSnapshots entries 截 20,marks 不截)', () => {
    const prev = list(Array.from({ length: 40 }, (_, i) => ({ t: `x${i}` })))
    const next = list(Array.from({ length: 40 }, (_, i) => ({ t: `y${i}` })))
    const m = diffItemMarks(prev, next)
    expect(m.size).toBe(80)
    expect([...m.values()].filter((v) => v === 'new').length).toBe(40)
    expect([...m.values()].filter((v) => v === 'gone').length).toBe(40)
  })
})

describe('detectDrift(适配器漂移:连续 3 次同向结构突变才报)', () => {
  it('连续 3 次骤降 → 报;骤降=新值≤旧值一半(0→0 是空页不算);结构翻转 3 次同向也报', () => {
    expect(detectDrift([{ items: 100, structured: true }, { items: 40, structured: true }, { items: 15, structured: true }, { items: 5, structured: true }])).toBe(true)
    // 50→30 跌幅不到一半(>25),打断连续性
    expect(detectDrift([{ items: 50, structured: true }, { items: 30, structured: true }, { items: 12, structured: true }, { items: 5, structured: true }])).toBe(false)
    expect(detectDrift([{ items: 10, structured: true }, { items: 0, structured: true }, { items: 0, structured: true }, { items: 0, structured: true }])).toBe(false)
    // 结构翻转(数组→对象/解析失败):structured true→false 连续 3 次迁移
    expect(detectDrift([{ items: 80, structured: true }, { items: null, structured: false }, { items: null, structured: false }, { items: null, structured: false }])).toBe(true)
  })
  it('单次骤降不报(防单次抖动);样本不足 3 次迁移不报', () => {
    expect(detectDrift([{ items: 100, structured: true }, { items: 30, structured: true }])).toBe(false)
    expect(detectDrift([{ items: 100, structured: true }, { items: 30, structured: true }, { items: 10, structured: true }])).toBe(false) // 仅 2 次迁移
    // 3 次迁移但中间恢复打断,尾部不构成连续 3 次同向
    expect(detectDrift([{ items: 100, structured: true }, { items: 30, structured: true }, { items: 100, structured: true }, { items: 30, structured: true }])).toBe(false)
  })
  it('恢复不报:尾部任一次迁移恢复(条目回升/重新结构化)即不报', () => {
    expect(detectDrift([{ items: 100, structured: true }, { items: 40, structured: true }, { items: 15, structured: true }, { items: 90, structured: true }])).toBe(false)
    // 翻转 2 次后恢复结构化
    expect(detectDrift([{ items: 50, structured: true }, { items: null, structured: false }, { items: null, structured: false }, { items: 48, structured: true }])).toBe(false)
  })
})

describe('aggregateDaySums(按日求和,近 7 天新→旧)', () => {
  it('同日多条求和;跨日分行;截 7 天', () => {
    const days = [
      { day: '2026-11-04 09:00', added: 3, removed: 1, moved: 0 },
      { day: '2026-11-04 21:00', added: 1, removed: 0, moved: 2 },
      { day: '2026-11-03 09:00', added: 0, removed: 5, moved: 0 },
      ...Array.from({ length: 9 }, (_, i) => ({ day: `2026-10-${String(25 - i).padStart(2, '0')} 09:00`, added: 1, removed: 0, moved: 0 })),
    ]
    const w = aggregateDaySums(days)
    expect(w.length).toBe(7)
    expect(w[0]).toEqual({ day: '2026-11-04', added: 4, removed: 1, moved: 2 })
    expect(w[1]).toEqual({ day: '2026-11-03', added: 0, removed: 5, moved: 0 })
  })
  it('空输入返回空数组', () => {
    expect(aggregateDaySums([])).toEqual([])
  })
})

describe('exportSnapshots 的 _diff 列(身份键回配)', () => {
  it('第二份起逐行标记 new/gone/moved;首份留空;列序 _at,_site,_diff 在前', () => {
    const r = exportSnapshots({
      snapshots: [
        { at: '2026-11-03T09:00:00Z', site: 'site zhihu hot', stdout: list([{ t: 'a', score: 1 }, { t: 'b', score: 2 }]) },
        { at: '2026-11-04T09:00:00Z', site: 'site zhihu hot', stdout: list([{ t: 'b', score: 2 }, { t: 'c', score: 3 }]) },
      ],
    })
    expect(r.rows).toBe(4)
    const lines = r.text.split('\r\n')
    expect(lines[0]).toContain('_diff')
    const rows = lines.slice(1).map((l) => l.split(','))
    // 快照 1(首份):_diff 全空
    expect(rows[0][0]).toBe('2026-11-03T09:00:00Z')
    expect(rows[0][2]).toBe('')
    // 快照 2:b 位移 <3 不标;c 是 new;a 不在这份里(其 gone 标记属于快照 1 的行,不出现在快照 2)
    const rowB = rows.find((x) => x.includes('b'))!
    const rowC = rows.find((x) => x.includes('c'))!
    expect(rowB[2]).toBe('')
    expect(rowC[2]).toBe('new')
  })
  it('非结构化邻接:reset 后不跨段误标', () => {
    const r = exportSnapshots({
      snapshots: [
        { at: '2026-11-03T09:00:00Z', site: 's', stdout: list([{ t: 'a' }]) },
        { at: '2026-11-03T10:00:00Z', site: 's', stdout: '纯文本输出' },
        { at: '2026-11-04T09:00:00Z', site: 's', stdout: list([{ t: 'z' }]) },
      ],
    })
    // 第二份非结构化:第三份是"该段首份",_diff 留空而非标 gone/new
    const rows = r.text.split('\r\n').slice(1).map((l) => l.split(','))
    expect(rows.filter((x) => x.includes('z'))[0]![2]).toBe('')
  })
})
