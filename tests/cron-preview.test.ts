// cron 本地校验与下次执行预览(0.2.0 C-H7)——真机实抓回归:cronValid 此前把 `*`
// 通配符判成非法(Number('*')=NaN),预览恒不出现;合法 cron 反挂红错。
// 服务端 cronMatches 为权威,本套只钉客户端校验器与预览函数行为。
import { describe, expect, it } from 'vitest'
import { cronValid, nextCronFire } from '../src/cron-utils.ts'

describe('cronValid(0.2.0 C-H7)', () => {
  it('五段标准形态全通过(* / 数字 / 逗号 / */步长 混合)', () => {
    expect(cronValid('0 9 * * *')).toBe(true) // 真机实抓:通配符段此前误判非法
    expect(cronValid('0 9,13,19 * * *')).toBe(true)
    expect(cronValid('*/5 * * * *')).toBe(true)
    expect(cronValid('30 8 1 * *')).toBe(true)
    expect(cronValid('0 3 31 2 *')).toBe(true) // NEVER_CRON 同款
  })
  it('非法形态全拒绝(段数/越界/垃圾)', () => {
    expect(cronValid('0 9 * *')).toBe(false)
    expect(cronValid('0 9 * * * *')).toBe(false)
    expect(cronValid('61 9 * * *')).toBe(false)
    expect(cronValid('0 25 * * *')).toBe(false)
    expect(cronValid('0 9 32 * *')).toBe(false)
    expect(cronValid('0 9 * 13 *')).toBe(false)
    expect(cronValid('*/0 * * * *')).toBe(false)
    expect(cronValid('abc 9 * * *')).toBe(false)
  })
})

describe('nextCronFire(0.2.0 C-H7 预览)', () => {
  it('每小时 cron → 下一个整点', () => {
    const from = new Date('2026-11-25T10:07:30')
    const nf = nextCronFire('0 * * * *', from)
    expect(nf).not.toBeNull()
    expect(nf!.getHours()).toBe(11)
    expect(nf!.getMinutes()).toBe(0)
  })
  it('每日 9 点 → 明日 9 点(当前已过今日 9 点)', () => {
    const from = new Date('2026-11-25T10:07:30')
    const nf = nextCronFire('0 9 * * *', from)
    expect(nf!.getDate()).toBe(26)
    expect(nf!.getHours()).toBe(9)
  })
  it('非法 cron → null(不抛错)', () => {
    expect(nextCronFire('abc')).toBeNull()
  })
})
