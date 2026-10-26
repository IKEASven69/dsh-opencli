/**
 * 首启向导纯函数单测:shouldShowOnboarding(渲染门槛——"全绿不渲染"是硬规格)/
 * loginSitesFromAdapters(登录层站点过滤 + `site <站> login` 命令行拼装)。
 * 组件渲染(OnboardingWizard 卡)client 侧无测试基建,留给 GUI 人工验收。
 * 直接引 src/client.ts:本文件同时回归"模块级求值可在 Node 进行"——desc 模板串曾引用
 * 未声明变量 status,import 即 ReferenceError。不构造 OpencliService,无需独立 trace 目录。
 * 另追加 opencli_do 卡步骤截图提示的纯渲染断言(src/cards.ts 纯函数,同款直引)。
 */
import { describe, expect, it } from 'vitest'
import { shouldShowOnboarding, loginSitesFromAdapters } from '../src/client.ts'
import { browserDoCardRender } from '../src/cards.ts'
import type { AdapterInfo, LoginCheckItem, OpencliStatus } from '../src/types.ts'

const stOk = (over: Partial<OpencliStatus> = {}): OpencliStatus => ({
  ok: true, bin: 'opencli', version: '2.0.0',
  daemon: { running: true, extension: 'connected' }, adapterSites: 176,
  ...over,
})
const li = (site: string, ok: boolean, timedOut = false): LoginCheckItem => ({ site, ok, timedOut, detail: null })
const ad = (name: string, commands: string[]): AdapterInfo => ({ name, commandCount: commands.length, commands, sample: '', kinds: [] })

describe('shouldShowOnboarding(首启向导渲染门槛)', () => {
  it('全绿(daemon 运行 + Bridge 已连 + 登录全在线)→ 不渲染', () => {
    expect(shouldShowOnboarding({ status: stOk(), loginResults: [li('zhihu', true), li('bilibili', true)] })).toBe(false)
  })

  it('daemon 未运行 → 渲染(登录全绿也不豁免)', () => {
    expect(shouldShowOnboarding({
      status: stOk({ daemon: { running: false, extension: 'disconnected' } }),
      loginResults: [li('zhihu', true)],
    })).toBe(true)
  })

  it('daemon 运行但 Bridge 未连接(extension 缺失)→ 渲染', () => {
    expect(shouldShowOnboarding({ status: stOk({ daemon: { running: true } }), loginResults: [] })).toBe(true)
  })

  it('daemon/Bridge 绿但登录巡检全红 → 渲染', () => {
    expect(shouldShowOnboarding({ status: stOk(), loginResults: [li('zhihu', false), li('bilibili', false, true)] })).toBe(true)
  })

  it('登录部分在线(其余绿)→ 不渲染', () => {
    expect(shouldShowOnboarding({ status: stOk(), loginResults: [li('zhihu', false), li('bilibili', true)] })).toBe(false)
  })

  it('登录尚未巡检(空结果,其余绿)→ 不渲染——"全红"才算红', () => {
    expect(shouldShowOnboarding({ status: stOk(), loginResults: [] })).toBe(false)
  })

  it('status 为 null(status RPC 失败)→ 按 daemon 未运行渲染', () => {
    expect(shouldShowOnboarding({ status: null, loginResults: [] })).toBe(true)
  })
})

describe('loginSitesFromAdapters(登录层站点过滤)', () => {
  it('只保留带 login 命令的站,命令行为 site <站> login,保持目录顺序', () => {
    expect(loginSitesFromAdapters([
      ad('zhihu', ['hot', 'login']),
      ad('arxiv', ['search']),
      ad('bilibili', ['login', 'search']),
    ])).toEqual([
      { site: 'zhihu', line: 'site zhihu login' },
      { site: 'bilibili', line: 'site bilibili login' },
    ])
  })

  it('login 为精确匹配:login_qr / relogin / logout 不算', () => {
    expect(loginSitesFromAdapters([ad('x', ['login_qr', 'relogin', 'logout'])])).toEqual([])
  })

  it('adapters 为 null(目录未加载)→ 空数组', () => {
    expect(loginSitesFromAdapters(null)).toEqual([])
  })
})

describe('opencli_do 卡步骤截图提示(纯渲染:shot 文件名入卡,base64 绝不入卡)', () => {
  it('结果带 shot(win32 反斜杠绝对路径)→ 步骤命令行尾附 (shot: 文件名),不含完整路径不嵌 base64', () => {
    const t = browserDoCardRender(
      { command: 'find', args: ['登录'] },
      { text: 'found 3', shot: 'C:\\Users\\u\\.dsh\\opencli-shots\\20261020\\dsh\\step-143005-3.png' },
    )[0]!.text
    expect(t).toContain('$ opencli_do find 登录 (shot: step-143005-3.png)')
    // 模型侧只要文件名提示:完整路径与 base64 载荷都不进卡(防上下文膨胀)
    expect(t).not.toContain('opencli-shots')
    expect(t).not.toContain('base64')
  })

  it('POSIX 正斜杠路径同款取末段文件名', () => {
    const t = browserDoCardRender(
      { command: 'tab' },
      { text: '[0] example.com', shot: '/home/u/.dsh/opencli-shots/20261020/dsh/step-090001-1.png' },
    )[0]!.text
    expect(t).toContain('(shot: step-090001-1.png)')
  })

  it('无 shot 字段(老契约)→ 不附提示,卡形状不变', () => {
    const t = browserDoCardRender({ command: 'find' }, { text: 'found 3' })[0]!.text
    expect(t).toContain('▣ opencli_do · find — ✓ exit 0')
    expect(t).toContain('$ opencli_do find')
    expect(t).not.toContain('(shot:')
  })

  it('脏形态防御:shot 非字符串/空串 → 剥掉不抛,不附提示', () => {
    expect(browserDoCardRender({ command: 'find' }, { text: 'x', shot: 42 })[0]!.text).not.toContain('(shot:')
    expect(browserDoCardRender({ command: 'find' }, { text: 'x', shot: '' })[0]!.text).not.toContain('(shot:')
  })
})
