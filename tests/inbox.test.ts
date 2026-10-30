// 命令收件箱测试(0.4.6 F1):三层。
// ① parseIntent 闭集校验矩阵(白名单字段/类型/未知 kind 拒绝);
// ② drainInbox 文件生命周期(claim 占位→执行→result 回写→processed 归档轮转/超大文件拒/坏 JSON 拒);
// ③ bin/dsh-opencli-ctl.cjs 端到端:真实子进程投递意图 + 伪消费者回写 result,--wait 取回。
// 隔离:DSH_OPENCLI_INBOX_DIR 指向 tmp 目录;②用桩执行器(零服务装配),③用伪消费者。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  parseIntent, drainInbox, inboxDir,
  type Intent, type IntentExecutor, type IntentResult,
} from '../src/inbox.ts'

let dir = ''
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-opencli-inbox-test-'))
  process.env.DSH_OPENCLI_INBOX_DIR = dir
})
afterAll(() => {
  delete process.env.DSH_OPENCLI_INBOX_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('parseIntent 闭集校验', () => {
  it('合法七 kind 全形态通过', () => {
    const ok: unknown[] = [
      { kind: 'schedule-add', site: 'site juejin hot', cron: '0 9 * * *' },
      { kind: 'schedule-add', site: 'a', cron: '0 9 * * *', watch: 'AI', notify: true, retry: 2 },
      { kind: 'schedule-remove', id: '1' },
      { kind: 'schedule-run', id: '1' },
      { kind: 'schedule-list' },
      { kind: 'notify-set', channels: [{ type: 'webhook', url: 'http://x', enabled: true }] },
      { kind: 'notify-test' },
      { kind: 'status' },
    ]
    for (const o of ok) expect(parseIntent(o), JSON.stringify(o)).not.toBeNull()
  })

  it('多余字段/类型错/未知 kind/空渠道 一律拒绝', () => {
    const bad: unknown[] = [
      null, 'x', {},
      { kind: 'eval', code: 'process.exit()' },                 // 最大的红线:想执行代码,闭集外
      { kind: 'schedule-add', site: 'a', cron: 'b', extra: 1 }, // 多余字段
      { kind: 'schedule-add', site: '', cron: 'b' },            // 空串
      { kind: 'schedule-add', site: 'a', cron: 'b', notify: 'yes' }, // 类型错
      { kind: 'schedule-remove' },                              // 缺 id
      { kind: 'notify-set', channels: [] },                     // 空数组
      { kind: 'notify-set', channels: [{ type: 'webhook', evil: 1 }] },
      { kind: 'notify-set', channels: [{ type: 'shell' }] },    // 通道闭集外
      { kind: 'status', deep: { inject: true } },
    ]
    for (const o of bad) expect(parseIntent(o), JSON.stringify(o)).toBeNull()
  })
})

describe('drainInbox 文件生命周期', () => {
  const stubEx = (log: string[]): IntentExecutor => ({
    scheduleAdd: async (i) => { log.push('add:' + i.site); return { ok: true, id: 'sched-1' } },
    scheduleRemove: async (id) => { log.push('rm:' + id); return { ok: true } },
    scheduleRun: async (id) => { log.push('run:' + id); return { ok: true } },
    scheduleList: async () => { log.push('list'); return { ok: true, schedules: [{ id: 'x' }] } },
    notifySet: async (c) => { log.push('notify:' + c.length); return { ok: true } },
    notifyTest: async () => { log.push('ntest'); return { ok: false, error: '未配通道' } },
    status: async () => { log.push('status'); return { v: 'test' } },
    event: (t) => { log.push('ev:' + t) },
  })

  it('执行→result 回写→processed 归档;事件落账', async () => {
    const log: string[] = []
    writeFileSync(join(dir, '100-add.json'), JSON.stringify({ kind: 'schedule-add', site: 'site zhihu hot', cron: '0 8 * * *', watch: 'AI' }))
    const n = await drainInbox(stubEx(log))
    expect(n).toBe(1)
    const r = JSON.parse(readFileSync(join(dir, '100-add.result.json'), 'utf8')) as IntentResult
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ id: 'sched-1' })
    expect(readdirSync(join(dir, 'processed'))).toContain('100-add.json')
    expect(log.some((x) => x.startsWith('ev:📥'))).toBe(true)
    expect(readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.result.json'))).toHaveLength(0)
  })

  it('坏 JSON 与超大文件拒绝但不崩,结果照回', async () => {
    const log: string[] = []
    writeFileSync(join(dir, '200-bad.json'), '{not json')
    const big = { kind: 'status', pad: '' } as never as Record<string, unknown>
    delete big.pad
    writeFileSync(join(dir, '201-big.json'), JSON.stringify({ kind: 'schedule-add', site: 'x'.repeat(20 * 1024), cron: '* * * * *' }))
    const n = await drainInbox(stubEx(log))
    expect(n).toBe(2)
    const r1 = JSON.parse(readFileSync(join(dir, '200-bad.result.json'), 'utf8')) as IntentResult
    expect(r1.ok).toBe(false)
    const r2 = JSON.parse(readFileSync(join(dir, '201-big.result.json'), 'utf8')) as IntentResult
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('16KB')
  })

  it('归档轮转:processed 超过 100 份裁最旧', async () => {
    const p = join(dir, 'processed')
    mkdirSync(p, { recursive: true })
    for (let i = 0; i < 105; i++) writeFileSync(join(p, `${String(i).padStart(4, '0')}.json`), '{}')
    writeFileSync(join(dir, '300-list.json'), JSON.stringify({ kind: 'schedule-list' }))
    await drainInbox(stubEx([]))
    expect(readdirSync(p).length).toBeLessThanOrEqual(101) // 100 上限 + 刚归档的这份
  })
})

describe('ctl 脚本端到端(真实子进程)', () => {
  const CTL = join(__dirname, '..', 'bin', 'dsh-opencli-ctl.cjs')
  const ctl = (...a: string[]) => spawnSync(process.execPath, [CTL, ...a], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, DSH_OPENCLI_INBOX_DIR: dir } })

  it('schedule add 投递合法意图(--no-wait),文件落在收件箱', () => {
    const r = ctl('schedule', 'add', '--site', 'site juejin hot', '--cron', '0 9 * * *', '--watch', 'AI', '--no-wait')
    expect(r.status).toBe(0)
    const out = JSON.parse(r.stdout) as { ok: boolean; delivered: boolean; stem: string }
    expect(out.delivered).toBe(true)
    const intent = JSON.parse(readFileSync(join(dir, out.stem + '.json'), 'utf8')) as Intent
    expect(intent).toEqual({ kind: 'schedule-add', site: 'site juejin hot', cron: '0 9 * * *', watch: 'AI' })
  })

  it('--wait 语义等价覆盖:投递(--no-wait)→消费→读 result(同步等待路径由真机验收覆盖)', async () => {
    const drop = ctl('notify', 'set', '--feishu', 'https://open.feishu.cn/hook/x', '--no-wait')
    const { stem } = JSON.parse(drop.stdout) as { stem: string }
    const applied: string[] = []
    await drainInbox({
      scheduleAdd: async () => ({ ok: true }), scheduleRemove: async () => ({ ok: true }), scheduleRun: async () => ({ ok: true }),
      scheduleList: async () => ({ ok: true, schedules: [] }),
      notifySet: async (c) => { applied.push(c[0]!.type); return { ok: true } },
      notifyTest: async () => ({ ok: true }), status: async () => ({}), event: () => {},
    })
    const result = JSON.parse(readFileSync(join(dir, stem + '.result.json'), 'utf8')) as IntentResult
    expect(result.ok).toBe(true)
    expect(applied).toEqual(['webhook'])
  })

  it('notify set 多通道与非法参数退码', () => {
    const r = ctl('notify', 'set', '--no-wait')
    expect(r.status).toBe(2)
    const r2 = ctl('notify', 'set', '--wecom', 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=k', '--no-wait')
    expect(r2.status).toBe(0)
  })
})

describe('report-build 意图(F1 补齐)', () => {
  it('合法/缺 id 各自通过或拒绝', () => {
    expect(parseIntent({ kind: 'report-build', id: '123' })).toEqual({ kind: 'report-build', id: '123' })
    expect(parseIntent({ kind: 'report-build' })).toBeNull()
    expect(parseIntent({ kind: 'report-build', id: '1', path: '../evil' })).toBeNull()
  })
  it('drain 执行并回写报告路径', async () => {
    writeFileSync(join(dir, '400-report.json'), JSON.stringify({ kind: 'report-build', id: '9' }))
    await drainInbox({
      scheduleAdd: async () => ({ ok: true }), scheduleRemove: async () => ({ ok: true }), scheduleRun: async () => ({ ok: true }),
      scheduleList: async () => ({ ok: true, schedules: [] }), notifySet: async () => ({ ok: true }), notifyTest: async () => ({ ok: true }),
      reportBuild: async (id) => ({ ok: true, path: '~/.dsh/opencli-reports/sched-' + id + '.md' }),
      status: async () => ({}), event: () => {},
    })
    const r = JSON.parse(readFileSync(join(dir, '400-report.result.json'), 'utf8')) as IntentResult
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r.value)).toContain('sched-9')
  })
})
