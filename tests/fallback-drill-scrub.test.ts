// 兜底演练脚本报告卫生同步测试(0.1.5 C7,复核 L21)。
// L21 留档:.build-tools/fallback-drill.cjs 的 scrubReport 曾是 SCRUB_RULES(src/notify.ts)的
// 四条真子集(只洗 URL 参数+路径),演练报告可泄非 URL 形凭据(sk-/ghp_ 令牌、Bearer 头、长
// hex/base64 串)。修法=「引规则函数而非子集复刻」:演练脚本直接 require src/notify.ts 的
// scrubLocalPaths(require 一个 TS 模块需 node 类型转换档 --experimental-transform-types,
// 环境不满足时演练如实退码 2,不静默降级回子集)。
// 本文件钉住两端:①演练脚本源面不再有规则子集复刻(引函数不引子集);②真实规则函数在演练
// 同款加载模式下的行为(九条规则族逐条命中);③演练脚本的退码礼仪(裸 node 拒跑并给指引)。
// 网络零外发:演练脚本相关用例全部以 DSH_OPENCLI_BIN 指向哑 CLI 桩(立即退码),永不触真实
// OpenCLI CLI/daemon/浏览器(真机全流程行使归 0.1.5 复验轮,不属单元测试)。
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const DRILL = join(ROOT, '.build-tools', 'fallback-drill.cjs')
const NOTIFY_TS = join(ROOT, 'src', 'notify.ts')

describe('演练脚本源面(L21:引函数不引子集)', () => {
  const src = readFileSync(DRILL, 'utf8')
  it('不再内嵌 SCRUB_RULES 子集复刻(修前四条规则的正则与占位符字面量零残留)', () => {
    // 复刻的指纹:URL 参数规则源 / 两类路径占位符字面量 / URL 参数占位符字面量
    expect(src).not.toContain('access_token|auth|auth_token')
    expect(src).not.toContain('[已脱敏]')
    expect(src).not.toContain('[本地路径]')
    expect(src).not.toContain('[home路径]')
  })
  it('改为引真实规则函数:require src/notify.ts 的 scrubLocalPaths + 环境不满足退码 2 的指引', () => {
    expect(src).toContain("require(path.join(__dirname, '..', 'src', 'notify.ts'))")
    expect(src).toContain('scrubLocalPaths')
    // 失败说真话:加载失败不静默降级,退码 2 并指路类型转换档运行方式
    expect(src).toContain('--experimental-transform-types')
    expect(src).toContain('process.exit(2)')
  })
})

describe('真实规则函数行为(演练同款加载模式:node --experimental-transform-types)', () => {
  // 用例名 → [样本, 脱敏后必含的占位符]。与 src/notify.ts SCRUB_RULES 九条逐族对齐。
  const cases: Record<string, [string, string]> = {
    urlQueryToken: ['see https://a.b/c?token=secret123&x=1 end', '?token=[已脱敏]'],
    winPath: ['open C:/Users/someone/report.txt done', '[本地路径]'],
    tildeHome: ['at ~/.dsh/state.json end', '[home路径]'],
    unixHome: ['log /Users/someone/x.txt end', '[home路径]'],
    kvToken: ['token: supersecretvalue123 tail', 'token: [已移除]'],
    bareBearer: ['Authorization: Bearer abc.def.ghi end', 'Bearer [已移除]'],
    namedKey: ['key ghp_abcdefghijklmnopqrstuvwxyz0123456789 next', '[已移除]'],
    hex32: ['hash 0123456789abcdef0123456789abcdef done', '[已移除]'],
    base64Blob: [`blob ${'A'.repeat(44)} end`, '[已移除]'],
  }
  it('九条规则族逐条命中(修前子集只覆盖前三行,后六族全部漏洗)', () => {
    const probe = [
      `const m = require(${JSON.stringify(NOTIFY_TS)})`,
      'const s = m.scrubLocalPaths',
      `const cases = ${JSON.stringify(cases)}`,
      'const out = {}',
      'for (const [k, [input, marker]] of Object.entries(cases)) out[k] = s(input).includes(marker)',
      'console.log(JSON.stringify(out))',
    ].join('\n')
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '-e', probe], { encoding: 'utf8', timeout: 120_000 })
    expect(r.status).toBe(0)
    const out = JSON.parse(r.stdout) as Record<string, boolean>
    expect(out).toEqual(Object.fromEntries(Object.keys(cases).map((k) => [k, true])))
  })
})

describe('演练脚本退码礼仪(哑 CLI 桩,零真实调用)', () => {
  // 哑 CLI 桩:resolveCli 的 env 分支吃到它,任何 spawn 都立即退码 7——即便未来 node 把类型
  // 转换设为默认(用例 C 的前提失效),本组用例也绝不会触到真实 OpenCLI CLI。
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-opencli-drill-scrub-'))
  const stub = join(stubDir, 'dummy-cli.js')
  writeFileSync(stub, 'process.exit(7)\n')
  const runDrill = (extraArgs: string[]) =>
    spawnSync(process.execPath, [DRILL, 'site juejin hot', ...extraArgs], {
      encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, DSH_OPENCLI_BIN: stub },
    })

  it('裸 node(无类型转换档):规则函数加载失败 → 退码 2 + 指引,不静默降级回子集复刻', () => {
    const r = runDrill(['--out', join(stubDir, 'r-noflag.json')])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('加载失败')
    expect(r.stderr).toContain('--experimental-transform-types')
    expect(r.stderr).not.toContain('PASS')
  })

  it('类型转换档:规则函数装载成功进入流程;哑 CLI 退码 7 → CLI 可用检查不过退码 2(零真实调用)', () => {
    const outPath = join(stubDir, 'r-flag.json')
    const r = spawnSync(process.execPath, ['--experimental-transform-types', DRILL, 'site juejin hot', '--out', outPath], {
      encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, DSH_OPENCLI_BIN: stub },
    })
    expect(r.stderr).not.toContain('加载失败') // 规则函数装载过了(卡在哑 CLI --version 退码 7)
    expect(r.status).toBe(2)
    expect(r.stdout).toContain('FAIL CLI 可用')
    // 出报告统一闸已生效:报告落盘且 cli.desc 的本机路径已被洗成占位符(规则函数在链上)
    const report = JSON.parse(readFileSync(outPath, 'utf8')) as { cli: { desc: string } }
    expect(report.cli.desc).not.toContain(stubDir)
    expect(report.cli.desc).toContain('[本地路径]')
    rmSync(stubDir, { recursive: true, force: true })
  })
})
