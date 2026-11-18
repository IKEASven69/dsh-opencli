/**
 * 失败归档 reporter 成对测试(0.1.6 C5,L5 条件收项)。
 *
 * 三层(与 runinbox.test.ts 同构):纯函数层(failureRows 提取/rotate 轮转)+
 * IO 层(appendFailureArchive 真实落盘/轮转/失败如实)+ reporter 装配层(默认导出
 * 实例喂 fixture,断言落盘行为与绿轮零文件)。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failureRows, appendFailureArchive, FAILURE_ARCHIVE_MAX_BYTES } from './failure-archive-reporter.ts'
import FailureArchiveReporterDefault from './failure-archive-reporter.ts'
// default class 不产生具名导出(E9539 同款坑)——装配层测试用 default 别名导入
const FailureArchiveReporter = FailureArchiveReporterDefault

// ── 纯函数层:failureRows 跨版本防御提取 ──

describe('failureRows(vitest files 树 → 失败行,纯函数)', () => {
  it('嵌套 suite 内的 fail 用例被提取,passed/skipped 不进;file 全名带 suite 链', () => {
    const files = [
      {
        name: 'D:/proj/tests/trace.test.ts',
        tasks: [
          { name: '顶层直挂 fail 用例', result: { state: 'fail', duration: 12, errors: [{ message: 'AssertionError: expected 1 to be 2\n    at deep stack' }] } },
          { name: '顶层通过用例', result: { state: 'passed', duration: 3 } },
          {
            name: '外层 suite',
            tasks: [
              { name: '内层 suite', tasks: [{ name: '深层 fail 用例', result: { state: 'fail', duration: 55, errors: [{ message: 'timeout of 750ms exceeded' }] } }] },
              { name: 'skip 用例', result: { state: 'skipped' } },
            ],
          },
        ],
      },
    ]
    const rows = failureRows(files, new Date('2026-11-19T03:04:05.000Z'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ at: '2026-11-19T03:04:05.000Z', file: 'D:/proj/tests/trace.test.ts', name: '顶层直挂 fail 用例', durationMs: 12, errors: ['AssertionError: expected 1 to be 2\n    at deep stack'] })
    expect(rows[1]!.name).toBe('外层 suite > 内层 suite > 深层 fail 用例')
    expect(rows[1]!.errors).toEqual(['timeout of 750ms exceeded'])
  })

  it('绿轮(全 passed)→ 0 行;result 缺失/形态异常分支不炸如实跳过', () => {
    expect(failureRows([{ name: 'a.test.ts', tasks: [{ name: 'ok', result: { state: 'passed' } }] }])).toEqual([])
    expect(failureRows([
      { name: 'b.test.ts', tasks: [{ name: '无 result' }, { name: 'result 非对象', result: 'boom' }, null, 'junk'] },
      null,
      'not a file',
      { name: '无 tasks 键' },
    ])).toEqual([])
    expect(failureRows(undefined)).toEqual([])
    expect(failureRows('junk')).toEqual([])
  })

  it('错误消息截 300 字;非对象错误与全空错误数组如实降级', () => {
    const long = 'x'.repeat(500)
    const rows = failureRows([
      { name: 'c.test.ts', tasks: [{ name: '长错', result: { state: 'fail', errors: [{ message: long }, '裸字符串错误', {}] } }] },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.errors).toHaveLength(3)
    expect(rows[0]!.errors[0]).toHaveLength(300)
    expect(rows[0]!.errors[1]).toBe('裸字符串错误')
    expect(rows[0]!.errors[2]).toBe('[object Object]')
    // duration 非数缺省
    const noDur = failureRows([{ name: 'd.test.ts', tasks: [{ name: '无时长', result: { state: 'fail', errors: [] } }] }])
    expect(noDur[0]!.durationMs).toBeUndefined()
    expect(noDur[0]!.errors).toEqual([])
  })

  it('文件级失败(import 报错/收集错误:File.result.state=fail 且子树零行)→ 补文件级行,不再整轮漏归档', () => {
    const rows = failureRows([
      // 形态 A:tasks 空数组
      { name: 'e.test.ts', result: { state: 'fail', errors: [{ message: 'SyntaxError: import failed' }] }, tasks: [] },
      // 形态 B:tasks 全绿但文件级 fail
      { name: 'f.test.ts', result: { state: 'fail', errors: [{ message: 'collect error' }] }, tasks: [{ name: 'ok', result: { state: 'passed' } }] },
      // 形态 C:普通用例失败时 suite 聚合 fail——子级已有行,容器不重复记(防双计)
      { name: 'g.test.ts', result: { state: 'fail' }, tasks: [{ name: 'boom', result: { state: 'fail', errors: [{ message: 'real failure' }] } }] },
      // 对照:文件级 fail 但子树有失败行 → 只有子级行
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]!.name).toBe('(文件级失败:收集/导入错误,无可用例)')
    expect(rows[0]!.errors).toEqual(['SyntaxError: import failed'])
    expect(rows[1]!.file).toBe('f.test.ts')
    expect(rows[2]!.name).toBe('boom') // g.test.ts 容器不重复记
    expect(rows.filter((r) => r.file === 'g.test.ts')).toHaveLength(1)
  })
})

// ── IO 层:appendFailureArchive 真实落盘与轮转 ──

describe('appendFailureArchive(追加+轮转,失败如实不抛)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-archive-'))
  const path = join(dir, 'nested', 'test-failures.jsonl')

  it('目录不存在自动建;逐行合法 jsonl;绿轮(0 行)不落任何文件', () => {
    expect(appendFailureArchive(path, [{ at: 't1', file: 'f', name: 'n1', errors: ['e'] }])).toEqual({ ok: true })
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({ at: 't1', file: 'f', name: 'n1', errors: ['e'] })
    const greenPath = join(dir, 'green.jsonl')
    expect(appendFailureArchive(greenPath, [])).toEqual({ ok: true })
    expect(existsSync(greenPath)).toBe(false)
  })

  it('超预算轮转 → .1;轮转后从空文件续写', () => {
    const big = join(dir, 'big.jsonl')
    writeFileSync(big, 'y'.repeat(FAILURE_ARCHIVE_MAX_BYTES + 1))
    const row = { at: 't2', file: 'f', name: 'n2', errors: ['e'] }
    expect(appendFailureArchive(big, [row])).toEqual({ ok: true })
    expect(existsSync(`${big}.1`)).toBe(true)
    const lines = readFileSync(big, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1) // 轮转后主文件只剩新行
    expect(JSON.parse(lines[0]!).name).toBe('n2')
  })

  it('IO 失败如实返回错误原因,不抛不反噬测试轮', () => {
    // 预先把「归档文件」造成目录 → appendFileSync EISDIR 必败(mkdirSync 幂等不会自愈)
    const blockedDir = join(dir, 'blocked2')
    const asFile = join(blockedDir, 'x.jsonl')
    mkdirSync(asFile, { recursive: true })
    const r1 = appendFailureArchive(asFile, [{ at: 't', file: 'f', name: 'n', errors: [] }])
    expect(r1.ok).toBe(false)
    expect(r1.error).toBeTruthy()
    expect(r1.ok === false && appendFailureArchive(asFile, [{ at: 't', file: 'f', name: 'n', errors: [] }]).ok).toBe(false)
  })

  // 收尾:清临时目录(本文件自管,不入 fixture)
  it('cleanup', () => { rmSync(dir, { recursive: true, force: true }) })
})

// ── 装配层:reporter 实例喂 fixture ──

describe('FailureArchiveReporter(onFinished 装配)', () => {
  it('有失败 → 落盘到注入路径;全绿 → 不产生文件(临时目录,绝不碰真实 .qa 归档)', () => {
    // 注入临时路径:若直用默认真实路径,本用例的 rmSync 会抹掉此前红轮归档的 flake 证据——
    // 恰是本功能要保住的东西(评审 medium ②)
    const tmpDir = mkdtempSync(join(tmpdir(), 'failure-archive-rpt-'))
    const target = join(tmpDir, 'test-failures.jsonl')
    const realArchive = join(import.meta.dirname, '..', '.qa', 'test-failures.jsonl')
    const realArchiveBaseline = existsSync(realArchive) // 进用例记基线(评审 medium:比对而非断言不存在)
    const reporter = new FailureArchiveReporter(target)
    // 绿轮:零文件
    reporter.onFinished([{ name: 'green.test.ts', tasks: [{ name: 'ok', result: { state: 'passed' } }] }])
    expect(existsSync(target)).toBe(false)
    // 有失败:落盘且行可解析
    reporter.onFinished([{ name: 'red.test.ts', tasks: [{ name: 'boom', result: { state: 'fail', errors: [{ message: 'fixture error' }] } }] }])
    const lines = readFileSync(target, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!).name).toBe('boom')
    // 真实归档未被测试触碰——比对基线而非断言「不存在」:真实 .qa 归档由红轮 reporter 写入,
    // 若这里断言不存在,第一次真实 flake 归档后本测试永久假红(自毁归档初衷,评审 medium)
    expect(existsSync(realArchive)).toBe(realArchiveBaseline)
    rmSync(tmpDir, { recursive: true, force: true })
  })
})
