// 静默时段(0.4.7 B2):窗解析/判定(跨夜)/合并摘要渲染/意图闭集门。
// 暂存→出窗合并的调度链路由宿主联测覆盖(全功能矩阵 W4);这里锁纯函数语义与意图门。
import { describe, expect, it } from 'vitest'
import { inQuietHours, parseQuietHours, renderQuietDigest } from '../src/notify.ts'
import { parseIntent } from '../src/inbox.ts'

describe('parseQuietHours(解析与归一)', () => {
  it('合法窗归一 HH:MM-HH:MM;支持跨夜', () => {
    expect(parseQuietHours('23:00-07:00')).toEqual({ from: '23:00', to: '07:00' })
    expect(parseQuietHours('13:30-15:00')).toEqual({ from: '13:30', to: '15:00' })
  })
  it('非法输入返回 undefined:越界/缺横杠/乱码/非字符串', () => {
    expect(parseQuietHours('25:00-07:00')).toBeUndefined()
    expect(parseQuietHours('23:00-07:99')).toBeUndefined()
    expect(parseQuietHours('2300-0700')).toBeUndefined()
    expect(parseQuietHours('abc')).toBeUndefined()
    expect(parseQuietHours(undefined)).toBeUndefined()
  })
})

describe('inQuietHours(窗内判定,含边界)', () => {
  const at = (h: number, m: number): Date => new Date(2026, 10, 4, h, m)
  it('跨夜窗:23:00-07:00 → 23:30/03:00 在窗内;12:00 不在', () => {
    expect(inQuietHours('23:00-07:00', at(23, 30))).toBe(true)
    expect(inQuietHours('23:00-07:00', at(3, 0))).toBe(true)
    expect(inQuietHours('23:00-07:00', at(12, 0))).toBe(false)
  })
  it('边界:起点含、终点不含(07:00 整点出窗,23:00 整点入窗)', () => {
    expect(inQuietHours('23:00-07:00', at(7, 0))).toBe(false)
    expect(inQuietHours('23:00-07:00', at(23, 0))).toBe(true)
  })
  it('同日窗:13:00-15:00 → 14:00 在;15:00 整点出;16:00 不在', () => {
    expect(inQuietHours('13:00-15:00', at(14, 0))).toBe(true)
    expect(inQuietHours('13:00-15:00', at(15, 0))).toBe(false)
    expect(inQuietHours('13:00-15:00', at(16, 0))).toBe(false)
  })
  it('解析不出=不在窗(fail-open:宁可多推不可吞通知)', () => {
    expect(inQuietHours('abc', at(3, 0))).toBe(false)
    expect(inQuietHours(undefined, at(3, 0))).toBe(false)
  })
})

describe('renderQuietDigest(合并摘要)', () => {
  it('逐行 ✓/✗ + 🔔/📊 标记 + HH:MM 时间;含条数头', () => {
    const d = renderQuietDigest([
      { at: '2026-11-04T23:14:00.000Z', ok: true, summary: '采集 42 条', hits: 1, diff: false },
      { at: '2026-11-05T00:03:00.000Z', ok: false, summary: '超时', hits: 0, diff: true },
    ], '23:00-07:00')
    expect(d).toContain('😴 静默期(23:00-07:00)合并 2 条')
    expect(d).toContain('- 23:14 ✓ 🔔 采集 42 条')
    expect(d).toContain('- 00:03 ✗ 📊 超时')
  })
  it('空暂存返回空串(无谓段不占正文)', () => {
    expect(renderQuietDigest([], '23:00-07:00')).toBe('')
    expect(renderQuietDigest(undefined, undefined)).toBe('')
  })
})

describe('意图闭集门(quietHours 进出 schedule-add)', () => {
  it('合法窗过门并透传;off 过门(清除语义)', () => {
    const ok = parseIntent(({ kind: 'schedule-add', site: 'site zhihu hot', cron: '0 9 * * *', quietHours: '23:00-07:00' }))
    expect(ok).not.toBeNull()
    expect((ok as { quietHours?: string }).quietHours).toBe('23:00-07:00')
    const off = parseIntent(({ kind: 'schedule-add', site: 's', cron: '0 9 * * *', quietHours: 'off' }))
    expect((off as { quietHours?: string }).quietHours).toBe('off')
  })
  it('形状非法拒绝整条意图;范围非法过门由执行层出权威错误(对齐 cron 先例)', () => {
    // cron 先例:parseIntent 只查形状(不越白名单语义),范围校验在 scheduleAdd(那边给
    // "quietHours 非法:需 HH:MM-HH:MM" 的可行动错误)。意图门拒绝形状坏,不拒范围坏。
    expect(parseIntent(({ kind: 'schedule-add', site: 's', cron: '0 9 * * *', quietHours: '今晚十点' }))).toBeNull()
    expect(parseIntent(({ kind: 'schedule-add', site: 's', cron: '0 9 * * *', quietHours: '2300-0700' }))).toBeNull()
    expect((parseIntent(({ kind: 'schedule-add', site: 's', cron: '0 9 * * *', quietHours: '25:00-07:00' })) as { quietHours?: string }).quietHours).toBe('25:00-07:00')
  })
  it('多余字段依旧拒绝(白名单未扩不收)', () => {
    expect(parseIntent(({ kind: 'schedule-add', site: 's', cron: '0 9 * * *', evil: 'x' }))).toBeNull()
  })
})
