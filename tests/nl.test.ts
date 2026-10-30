// NL 意图映射测试(0.4.6 B1):零真网络(llm 调用桩成同步字符串)。
// 覆盖:system 提示组装(上下文注入/硬规则)、模型输出解析(fenced JSON/裸 JSON/多对象试探/
// 不合法拒绝)、nlToIntent 全链(空输入/llm 异常/成功)、闭集与 ctl 同门(parseIntent 复用)。
import { describe, it, expect } from 'vitest'
import { buildNlSystem, parseNlOutput, nlToIntent, type NlContext } from '../src/nl.ts'

const ctx: NlContext = {
  commands: ['site juejin hot', 'site zhihu hot', 'site bilibili hot'],
  schedules: [{ id: '111', site: 'site juejin hot' }],
  channels: ['webhook'],
}

describe('buildNlSystem(上下文注入)', () => {
  it('含意图闭集/热门命令/现有任务/通道/cron 说明/硬规则', () => {
    const s = buildNlSystem(ctx)
    expect(s).toContain('"kind":"schedule-add"')
    expect(s).toContain('site juejin hot')
    expect(s).toContain('id=111')
    expect(s).toContain('webhook')
    expect(s).toContain('0 9 * * *')
    expect(s).toContain('不得添加任何其他字段')
  })
  it('空上下文也组得出(占位符兜底)', () => {
    const s = buildNlSystem({ commands: [], schedules: [], channels: [] })
    expect(s).toContain('(无)')
  })
})

describe('parseNlOutput(解析纪律)', () => {
  it('标准形态:说明行 + ```json 围栏', () => {
    const r = parseNlOutput('每天早9点跑掘金热榜。\n```json\n{"kind":"schedule-add","site":"site juejin hot","cron":"0 9 * * *"}\n```')
    expect(r?.explanation).toBe('每天早9点跑掘金热榜。')
    expect(r?.intent).toEqual({ kind: 'schedule-add', site: 'site juejin hot', cron: '0 9 * * *' })
  })
  it('裸 JSON(无围栏)也能取;前后带话时取第一个合法对象', () => {
    const r = parseNlOutput('好的,映射如下 {"kind":"schedule-list"} 以上。')
    expect(r?.intent).toEqual({ kind: 'schedule-list' })
  })
  it('闭集外字段/伪造 kind 一律拒绝(不猜不补)', () => {
    expect(parseNlOutput('```json\n{"kind":"eval","code":"process.exit()"}\n```')).toBeNull()
    expect(parseNlOutput('```json\n{"kind":"schedule-add","site":"a","cron":"b","shell":"rm -rf"}\n```')).toBeNull()
    expect(parseNlOutput('不是 JSON')).toBeNull()
  })
})

describe('nlToIntent 全链', () => {
  it('空输入 null;llm 抛错 null(调用方给回退指引)', async () => {
    expect(await nlToIntent(async () => '', '', ctx)).toBeNull()
    expect(await nlToIntent(async () => { throw new Error('boom') }, '随便', ctx)).toBeNull()
  })
  it('成功链:llm 输出 → 闭集意图', async () => {
    const r = await nlToIntent(async () => '盯 B 站官宣。\n```json\n{"kind":"schedule-add","site":"site bilibili hot","cron":"0 * * * *","watch":"官宣"}\n```', '盯B站官宣', ctx)
    expect(r?.intent).toEqual({ kind: 'schedule-add', site: 'site bilibili hot', cron: '0 * * * *', watch: '官宣' })
  })
})
