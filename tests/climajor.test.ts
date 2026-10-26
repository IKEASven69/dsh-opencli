/**
 * cliMajor 探测粘死修复回归(仓库 #1 issue):探测失败(抛错/非零退出)不得把默认 1
 * 永久缓存——daemon 冷启动期失败后,环境恢复的下一次调用必须重新探测拿到真实大版本,
 * 否则 2.x 宿主的站目录与命令族路由恒按 1.x 判且无法自愈。
 * 同套钉死配套两片:resolveBin 的 mise 探测(纯函数)与「找不到二进制 vs 找到了但
 * --version 失败」文案区分(doctor/status 两出口)。
 * 方法:cordis 裸 Context + 桩 shell(zerocfg 同款),--version 桩行为可编程
 * (throw/exit1/ok 三档);构造期即设 throw——启动期探测失败正是线上粘死的触发形态。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService, scanMiseOpencli } from '../lib/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** --version 桩三档:throw=shell 抛错(daemon 冷启动);exit1=找到了但执行失败;ok=正常出版本号。 */
type VersionMode = 'throw' | 'exit1' | 'ok'

class CmShell extends Service {
  mode: VersionMode = 'ok'
  versionText = '2.0.0\n'
  calls: string[] = []
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(spec.command)
    this.calls.push(cmd)
    if (cmd.includes('--version')) {
      if (this.mode === 'throw') throw new Error('stub: daemon 冷启动,shell 抛错')
      if (this.mode === 'exit1') return { exitCode: 1, stdout: { text: '' }, stderr: { text: 'stub: 找到了但 --version 执行失败' } }
      return { exitCode: 0, stdout: { text: this.versionText }, stderr: { text: '' } }
    }
    // daemon 桩用 advanced.test.ts 同款 1.x 文本(parseDaemonStatus 已知好形状)
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v1.8.7\nPort: 19825\n' }, stderr: { text: '' } }
    if (cmd.includes('list')) return { exitCode: 0, stdout: { text: '[]' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}

class CmTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }> }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }> }): void { this.registered.set(def.name, def) }
}

class CmSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>
let svc: OpencliService
let shell: CmShell

const S = (): Record<string, any> => svc as unknown as Record<string, any>

/** 与 scanMiseOpencli 的平台名选择同源(测试侧不复读实现,按平台各写死一份):
 *  win32 下 npm 生成 .cmd shim(无扩展名 sh 脚本不能直接执行),其余平台无扩展名。 */
function shimNameOf(): string {
  return process.platform === 'win32' ? 'opencli.cmd' : 'opencli'
}

beforeAll(async () => {
  const uniq = `${process.pid}-${Date.now()}`
  // bin 固定裸命令:不依赖本机 node/opencli 安装布局,且文案用例恰好落「回落裸名」分支
  process.env.DSH_OPENCLI_BIN = 'opencli'
  // 状态/轨迹/截图/证据目录按本次运行唯一化(zerocfg 同款纪律):绝不碰 ~/.dsh 真实数据
  process.env.DSH_OPENCLI_STATE = path.join(os.tmpdir(), 'dsh-opencli-test-state-f-climajor-' + uniq)
  process.env.DSH_OPENCLI_TRACE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-traces-f-climajor-' + uniq)
  process.env.DSH_OPENCLI_SHOTS_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-shots-f-climajor-' + uniq)
  process.env.DSH_OPENCLI_EVIDENCE_DIR = path.join(os.tmpdir(), 'dsh-opencli-test-evidence-f-climajor-' + uniq)
  // 构造期即让 --version 失败:启动期探测失败正是 #1 issue 线上粘死的触发形态,
  // 也顺带验证 init 链(updateDirectory→adapterList)在该失败下不崩
  ctx = new Context()
  await ctx.plugin(CmShell)
  ;((ctx as unknown as { shell: CmShell }).shell).mode = 'throw'
  await ctx.plugin(CmTools)
  await ctx.plugin(CmSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  shell = (ctx as unknown as { shell: CmShell }).shell
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  // 限流归零(zerocfg 同款):cliMajor 重试链多次 shell 往返,默认 750ms 间隔只拖慢无断言价值
  S().usagePolicy = { minDelayMs: 0, maxConcurrency: 10, burst: 100, cooldownMs: 0, retryLimit: 2, maxPagesPerRun: 20, maxDepth: 2 }
})

afterAll(async () => {
  delete process.env.DSH_OPENCLI_BIN
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('cliMajor 探测失败不缓存(#1 issue 主回归)', () => {
  it('首次 --version 抛错 → 返回 1 但不缓存;桩恢复后第二次调用拿到新值而非缓存旧值', async () => {
    S().cliMajorCache = null
    shell.mode = 'throw'
    const first = await S().cliMajor()
    expect(first).toBe(1)                    // 失败回落默认 1(调用方拿到保守值)
    expect(S().cliMajorCache).toBeNull()     // 关键:失败值不落缓存——旧实现在此写死 1,此后恒 1(粘死根因)
    shell.mode = 'ok'                        // 环境恢复(如 daemon 起来了)
    const second = await S().cliMajor()
    expect(second).toBe(2)                   // 重试拿到真实大版本,而非缓存的旧 1
    expect(S().cliMajorCache).toBe(2)        // 成功后才落缓存
    const third = await S().cliMajor()
    expect(third).toBe(2)                    // 成功值缓存语义保持(行为不回退,cli2.test.ts 同款断言)
  })

  it('找到了但 --version 非零退出 → 同样不缓存,恢复后自愈(裸名回落场景的常见形态)', async () => {
    S().cliMajorCache = null
    shell.mode = 'exit1'
    expect(await S().cliMajor()).toBe(1)
    expect(S().cliMajorCache).toBeNull()
    shell.mode = 'ok'
    expect(await S().cliMajor()).toBe(2)
    // 复位给后续 describe(doctor/status 文案用例走 exit1 档)
    shell.mode = 'exit1'
  })

  it('exitCode 0 但输出认不出版本号 → 视为探测未成不缓存(不把"认不出"当 1.x 定死)', async () => {
    S().cliMajorCache = null
    shell.mode = 'ok'
    shell.versionText = 'opencli custom-build\n'  // 无 \d+.\d+ 形态
    expect(await S().cliMajor()).toBe(1)
    expect(S().cliMajorCache).toBeNull()
    shell.versionText = '1.8.8\n'                  // 升级后输出恢复可识别
    expect(await S().cliMajor()).toBe(1)           // 1.x 本身就是 1,值上无差
    expect(S().cliMajorCache).toBe(1)              // 但这次是真探测成功落的缓存
    shell.versionText = '2.0.0\n'                  // 复位
    shell.mode = 'exit1'
  })
})

describe('scanMiseOpencli(mise 版本管理器探测,纯函数)', () => {
  const shimName = shimNameOf()
  const mk = (root: string, ver: string): string => {
    const binDir = path.join(root, ver, 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    const p = path.join(binDir, shimName)
    fs.writeFileSync(p, 'shim-stub')
    return p
  }

  it('installs/node/<ver>/bin/ 形态命中,多版本并存取最高版', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'misescan-'))
    const old = mk(root, '22.1.0')
    const neu = mk(root, '24.18.0')
    expect(scanMiseOpencli(root)).toBe(neu)
    expect(scanMiseOpencli(root)).not.toBe(old)
  })

  it('根目录不存在/存在但无 bin shim → 返回 null 不抛错(未装 mise 是常态)', () => {
    expect(scanMiseOpencli(path.join(os.tmpdir(), 'no-such-mise-root-xyz'))).toBeNull()
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mise-empty-'))
    expect(scanMiseOpencli(empty)).toBeNull()
  })

  it('bin 目录存在但只有无关文件(无 opencli shim)→ null', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mise-noise-'))
    fs.mkdirSync(path.join(root, '24.18.0', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(root, '24.18.0', 'bin', 'node'), 'elf')
    expect(scanMiseOpencli(root)).toBeNull()
  })
})

describe('CLI 不可用文案区分:找不到二进制 vs 找到了但 --version 失败', () => {
  const statusOf = (): Promise<{ ok: boolean; error?: string }> => svc.status()

  it('status:回落裸名 + --version 失败 → 「未找到 opencli 二进制」+ 安装指引,详情保留原始 stderr', async () => {
    shell.mode = 'exit1'
    const r = await statusOf()
    expect(r.ok).toBe(false)
    expect(r.error ?? '').toContain('未找到 opencli 二进制')
    expect(r.error ?? '').toContain('npm i -g @jackwener/opencli')
    expect(r.error ?? '').toContain('stub: 找到了但 --version 执行失败')
  })

  it('status:bin 已定位(具体路径)+ 同样失败 → 「已定位 … 但 --version 执行失败」,不再误导去重装', async () => {
    shell.mode = 'exit1'
    const S2 = S()
    const orig = S2.bin as string
    // 模拟 resolveBin 命中 mise 后的 bin 形态(带引号整路径)
    S2.bin = `"${path.join(os.tmpdir(), 'mise', 'installs', 'node', '24.18.0', 'bin', shimNameOf())}"`
    try {
      const r = await statusOf()
      expect(r.ok).toBe(false)
      expect(r.error ?? '').toContain('已定位')
      expect(r.error ?? '').toContain('--version 执行失败')
      expect(r.error ?? '').not.toContain('未找到')
    } finally {
      S2.bin = orig
      shell.mode = 'exit1'
    }
  })

  it('doctor:✗ CLI 行同款区分——裸名给安装指引,已定位给排障指引', async () => {
    shell.mode = 'exit1'
    const tool = (ctx.tools as unknown as { registered: Map<string, { execute: (a: unknown) => Promise<{ text: string }> }> }).registered.get('opencli_doctor')!
    const bareName = await tool.execute({})
    expect(bareName.text).toContain('未找到 opencli 二进制')
    expect(bareName.text).toContain('安装 CLI')
    expect(bareName.text).toContain('npm i -g @jackwener/opencli')
    const S2 = S()
    const orig = S2.bin as string
    S2.bin = `"${path.join(os.tmpdir(), 'mise', 'installs', 'node', '24.18.0', 'bin', shimNameOf())}"`
    try {
      const located = await tool.execute({})
      expect(located.text).toContain('已定位')
      expect(located.text).toContain('--version 执行失败')
      expect(located.text).toContain('按上方详情排障')
      expect(located.text).not.toContain('未找到')
    } finally {
      S2.bin = orig
    }
  })
})
