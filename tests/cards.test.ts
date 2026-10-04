/**
 * 对话内预览卡单测:site / site_batch / browser_do 的 output.render。
 * render 是纯函数(text 进 → 块数组出),直接喂 execute 文本契约样例断言形状;
 * 另经 StubTools 注册表验证三工具接线(注册 def 的 output.render 即本卡),
 * 并回声断言 site_batch execute 文本契约未被 render 升级破坏。
 * 注意:测试经 require('../lib/index.js') 引构建产物——改 src 后需先构建(工作流门控)。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService, siteCardRender, siteBatchCardRender, browserDoCardRender } from '../lib/index.js'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: string }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = spec.command
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\n' }, stderr: { text: '' } }
    if (cmd.includes('list --format json')) return { exitCode: 0, stdout: { text: '[]' }, stderr: { text: '' } }
    // site execute 判定标注流转用:loginwall=exit 0 但内容是登录墙(规则层必中);oksite=正常列表文本
    if (cmd.includes('loginwall hot')) return { exitCode: 0, stdout: { text: '请先登录后再继续操作,或运行 opencli loginwall login\n' }, stderr: { text: '' } }
    if (cmd.includes('oksite hot')) return { exitCode: 0, stdout: { text: '1 标题A 热度984万\n2 标题B 热度500万\n' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: '{}\n' }, stderr: { text: '' } }
  }
}

class StubTools extends Service {
  readonly registered = new Map<string, { execute: (a: unknown) => Promise<{ text: string }>; output?: { render?: (a: unknown, v: unknown) => Array<{ type: string; text: string }> } }>()
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: { name: string; execute: (a: unknown) => Promise<{ text: string }>; output?: { render?: (a: unknown, v: unknown) => Array<{ type: string; text: string }> } }): void {
    this.registered.set(def.name, def)
  }
}

class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

let ctx: InstanceType<typeof Context>

/** SystemOne 桩:p=null=不可用(verifyResult 走 null 降级);p=数值=可用且 valid 判定恒返该值;warm=false 模拟 laya 预热窗口。 */
function installSo(p: number | null, warm = true): void {
  ;(ctx.opencli as unknown as { so: unknown }).so = p === null
    ? { configured: false, warm, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
    : { configured: true, warm, ask: async () => ({ ok: true, latencyMs: 2, answers: { valid: { type: 'noul', value: p, confidence: 0.9 } } }) }
}

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  // 与 advanced.test.ts 同款:SystemOne 桩默认"不可用",verifyResult 走 null 降级,
  // 避免测试在真机上触发真实 laya 推理
  installSo(null)
})

afterAll(async () => {
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('site 预览卡(命令行样式:徽章+命令+exit 状态色)', () => {
  it('成功:✓ exit 0 徽章 + $ 命令 console 围栏 + 原文不丢', () => {
    const blocks = siteCardRender({ adapter: 'zhihu', command: 'hot', args: ['关键词=x'] }, { text: '1 某大厂宣布全员降薪 热度984万\n2 十一旅游推荐 热度500万' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
    const t = blocks[0]!.text
    expect(t).toContain('▣ site · zhihu · hot — ✓ exit 0')
    expect(t).toContain('```console')
    expect(t).toContain('$ site zhihu hot 关键词=x')
    expect(t).toContain('热度984万')
    expect(t).toContain('十一旅游推荐')
    expect(t).not.toContain('👉')
  })

  it('失败:✗ exit N,失败前缀行去重、stdout/stderr 原文保留', () => {
    const t = siteCardRender({ adapter: 'weibo', command: 'post' }, { text: '命令失败(退出码 1):\n{"partial":true}\nError: AUTH_REQUIRED' })[0]!.text
    expect(t).toContain('▣ site · weibo · post — ✗ exit 1')
    expect(t).toContain('AUTH_REQUIRED')
    expect(t).toContain('{"partial":true}')
    expect(t.indexOf('命令失败')).toBe(-1)
  })

  it('判定标注:疑似静默失败 → ⚠ 琥珀;实测有效 → P 值入标签', () => {
    const warn = siteCardRender({ adapter: 'weibo', command: 'hot' }, { text: '(⚠ 疑似静默失败:登录/风控墙) 请先登录后再继续操作' })[0]!.text
    expect(warn).toContain('— ⚠ 疑似静默失败:登录/风控墙')
    expect(warn).toContain('请先登录后再继续操作')
    const ok = siteCardRender({ adapter: 'zhihu', command: 'hot' }, { text: '(实测有效 P=0.93) 1 标题A' })[0]!.text
    expect(ok).toContain('— ✓ exit 0 · 实测有效 P=0.93')
  })

  it('空结果/导航被拒/被拦截:分别落 ⚠ / ✗ / ✗', () => {
    const empty = siteCardRender({ adapter: 'zhihu', command: 'hot' }, { text: '适配器 zhihu 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 zhihu' })[0]!.text
    expect(empty).toContain('— ⚠ 空结果(疑似未登录)')
    const nav = siteCardRender({ adapter: 'zhihu', command: 'hot' }, { text: '导航被拒（zhihu）：请确认 Chrome 扩展已连接' })[0]!.text
    expect(nav).toContain('— ✗ 导航被拒')
    const off = siteCardRender({ adapter: 'weibo', command: 'post' }, { text: '适配器 weibo 已被禁用(设置→浏览器代理 可重新启用)。' })[0]!.text
    expect(off).toContain('— ✗ 被拦截')
  })

  it('authProfile 限域拒绝两文案(checkAuthProfile)→ ✗ 被拦截,不再误标绿', () => {
    const t1 = siteCardRender({ adapter: 'zhihu', command: 'hot', authProfile: 'p1' }, { text: '未知 authProfile:p1' })[0]!.text
    expect(t1).toContain('— ✗ 被拦截')
    const t2 = siteCardRender({ adapter: 'zhihu', command: 'hot', authProfile: 'p1' }, { text: 'authProfile p1 不允许访问域 zhihu.com（允许：example.com）' })[0]!.text
    expect(t2).toContain('— ✗ 被拦截')
  })

  it('失败卡末尾人工接管提示:✗ 且无登录指引才加,已含登录指引的不重复加', () => {
    // site exit N 失败(无登录指引)→ 加
    const fail = siteCardRender({ adapter: 'weibo', command: 'post' }, { text: '命令失败(退出码 1):\nError: boom' })[0]!.text
    expect(fail).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
    // 空结果(⚠ 且文案自带"请先在真实 Chrome 登录")→ 不加
    const empty = siteCardRender({ adapter: 'zhihu', command: 'hot' }, { text: '适配器 zhihu 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 zhihu，或运行 `opencli zhihu login` 后用面板“巡检登录态”确认。' })[0]!.text
    expect(empty).not.toContain('👉')
    // 导航被拒(✗ 但文案自带"已登录"指引)→ 不加
    const nav = siteCardRender({ adapter: 'zhihu', command: 'hot' }, { text: '导航被拒（zhihu）：请确认 Chrome 扩展已连接且已登录 zhihu，或先 `opencli zhihu login`。原错：timeout' })[0]!.text
    expect(nav).not.toContain('👉')
    // 被拦截(✗ 无登录指引)→ 加
    const off = siteCardRender({ adapter: 'weibo', command: 'post' }, { text: '适配器 weibo 已被禁用(设置→浏览器代理 可重新启用)。' })[0]!.text
    expect(off).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
    // 判定标注 ⚠(疑似静默失败,非硬失败)→ 不加
    const warn = siteCardRender({ adapter: 'weibo', command: 'hot' }, { text: '(⚠ 疑似静默失败:登录/风控墙) 请先登录后再继续操作' })[0]!.text
    expect(warn).not.toContain('👉')
  })

  it('防御:非法输入不抛,退化为空卡/占位徽章', () => {
    expect(siteCardRender({}, null)).toEqual([{ type: 'text', text: '' }])
    expect(siteCardRender(undefined, { text: 'ok' })[0]!.text).toContain('▣ site · ? · ?')
    expect(siteCardRender({ adapter: 'a', command: 'b' }, { text: '' })[0]!.text).toContain('$ site a b')
  })

  it('原文含 ``` 围栏时外层自动加长(不提前闭合)', () => {
    const t = siteCardRender({ adapter: 'mdn', command: 'extract' }, { text: '正文\n```\ncode\n```\n尾' })[0]!.text
    expect(t).toContain('````\n正文')
  })
})

describe('site_batch 预览卡(汇总头 + 每站一行:站名+状态+P 值)', () => {
  it('混合结果:⚠ 汇总 + 逐站表 + 原文分节围栏逐字保留;存在 ✗ 失败站 → 末尾附人工接管提示', () => {
    const text = '批量采集 2/3 站成功,其中 1 站疑似静默失败(exit 0 但内容无效):\n\n== zhihu ✓(实测有效 P=0.93) ==\n1 标题A 热度984万\n\n== weibo ✓(⚠ 疑似静默失败:P=0.08) ==\n请先登录\n\n== bilibili ✗ ==\nError: timeout'
    const blocks = siteBatchCardRender({ command: 'hot', sites: ['zhihu', 'weibo', 'bilibili'] }, { text })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
    const t = blocks[0]!.text
    expect(t).toContain('▣ site_batch · hot × 3 站 — ⚠ 2/3 站成功 · 1 疑似静默失败')
    expect(t).toContain('| 站点 | 状态 | P |')
    expect(t).toContain('| zhihu | ✓ 有效 | 0.93 |')
    expect(t).toContain('| weibo | ⚠ 疑似静默失败 | 0.08 |')
    expect(t).toContain('| bilibili | ✗ 失败 | — |')
    expect(t).toContain('== weibo ✓(⚠ 疑似静默失败:P=0.08) ==')
    expect(t).toContain('热度984万')
    expect(t).toContain('Error: timeout')
    expect(t).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
  })

  it('全成功:✓ 汇总,无判定标注的站 P 列为 —;无 ✗ 失败站不加接管提示', () => {
    const text = '批量采集 2/2 站成功:\n\n== twitter ✓ ==\nA 数据\n\n== x ✓ ==\nB 数据'
    const t = siteBatchCardRender({ command: 'hot', sites: ['twitter', 'x'] }, { text })[0]!.text
    expect(t).toContain('— ✓ 2/2 站成功')
    expect(t).toContain('| twitter | ✓ 成功 | — |')
    expect(t).not.toContain('疑似静默失败')
    expect(t).not.toContain('👉')
  })

  it('前置注记(目录预检/preflight)在汇总表上方逐行保留', () => {
    const text = '目录预检:以下站点不在适配器目录,请确认拼写:zhihuu\n\npreflight:同域冲突已串行化(twitter + x → twitter.com),避免登录态/标签页互踩\n\n批量采集 2/2 站成功:\n\n== twitter ✓ ==\nA\n\n== x ✓ ==\nB'
    const t = siteBatchCardRender({ command: 'hot', sites: ['twitter', 'x'] }, { text })[0]!.text
    expect(t).toContain('目录预检:以下站点不在适配器目录,请确认拼写:zhihuu')
    expect(t).toContain('preflight:同域冲突已串行化(twitter + x → twitter.com),避免登录态/标签页互踩')
  })

  it('无分节(参数校验拒绝):✗ 被拒绝 + 原因原文 + 人工接管提示', () => {
    const t = siteBatchCardRender({}, { text: 'sites 至少 2 个站点。' })[0]!.text
    expect(t).toContain('▣ site_batch · ? — ✗ 被拒绝')
    expect(t).toContain('sites 至少 2 个站点。')
    expect(t).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
  })

  it('失败兜底互斥(与 site/browser_do 同族):失败站原文已含登录指引不加;纯 ⚠ 疑似静默失败站不触发', () => {
    // 全部失败站原文都自带登录指引(如"请先登录")→ 不重复加
    const login = siteBatchCardRender({ command: 'hot', sites: ['weibo', 'zhihu'] }, { text: '批量采集 0/2 站成功:\n\n== weibo ✗ ==\nAUTH_REQUIRED: 请先登录后重试\n\n== zhihu ✗ ==\n请先在真实 Chrome 登录 zhihu' })[0]!.text
    expect(login).toContain('— ✗ 0/2 站成功')
    expect(login).not.toContain('👉')
    // 部分 ✗ 失败站无登录指引(超时)→ 加一次
    const mixed = siteBatchCardRender({ command: 'hot', sites: ['weibo', 'zhihu'] }, { text: '批量采集 0/2 站成功:\n\n== weibo ✗ ==\nAUTH_REQUIRED: 请先登录后重试\n\n== zhihu ✗ ==\nError: timeout' })[0]!.text
    expect(mixed).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
    // 仅 ⚠ 疑似静默失败站(exit 0,ok=true)无 ✗ 失败站 → 不加
    const silentOnly = siteBatchCardRender({ command: 'hot', sites: ['weibo'] }, { text: '批量采集 1/1 站成功,其中 1 站疑似静默失败(exit 0 但内容无效):\n\n== weibo ✓(⚠ 疑似静默失败:P=0.08) ==\n请先登录' })[0]!.text
    expect(silentOnly).toContain('— ⚠ 1/1 站成功 · 1 疑似静默失败')
    expect(silentOnly).not.toContain('👉')
  })

  it('正文里的分节头 lookalike 不产生幻影汇总行(站点集过滤),原文仍保留', () => {
    const text = '批量采集 1/1 站成功:\n\n== zhihu ✓ ==\n1 标题\n\n== fake ✓(实测有效 P=0.99) ==\n2 正文'
    const t = siteBatchCardRender({ command: 'hot', sites: ['zhihu'] }, { text })[0]!.text
    expect(t).toContain('▣ site_batch · hot × 1 站 — ✓ 1/1 站成功')
    expect(t).not.toContain('| fake |')
    expect(t).toContain('| zhihu | ✓ 成功 | — |')
    expect(t).toContain('== fake ✓(实测有效 P=0.99) ==')
  })

  it('重复点名已请求站点的 lookalike 也不开新分节(每站点至多一分节,评审修复)', () => {
    const text = '批量采集 1/1 站成功:\n\n== zhihu ✓ ==\n1 标题\n\n== zhihu ✓ ==\n2 正文'
    const t = siteBatchCardRender({ command: 'hot', sites: ['zhihu'] }, { text })[0]!.text
    expect(t).toContain('▣ site_batch · hot × 1 站 — ✓ 1/1 站成功')
    expect(t.split('| zhihu |').length - 1).toBe(1)
    expect(t).toContain('| zhihu | ✓ 成功 | — |')
    // 重复的分节头行作为正文保留在原文围栏里(信息不丢)
    expect(t.includes('== zhihu ✓ ==\n1 标题\n\n== zhihu ✓ ==\n2 正文')).toBe(true)
  })

  it('防御:非法输入不抛', () => {
    expect(siteBatchCardRender({}, undefined)).toEqual([{ type: 'text', text: '' }])
  })
})

describe('browser_do 预览卡(步骤式:命令/结果分段)', () => {
  it('成功:命令段($ 行 console 围栏)与结果段分开,原文不丢', () => {
    const blocks = browserDoCardRender({ command: 'analyze', args: ['--json'] }, { text: '{"stack":"next","antiCrawl":false}' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
    const t = blocks[0]!.text
    expect(t).toContain('▣ browser_do · analyze — ✓ exit 0')
    expect(t).toContain('**命令**')
    expect(t).toContain('**结果**')
    expect(t).toContain('$ browser_do analyze --json')
    expect(t).toContain('"stack":"next"')
    expect(t).not.toContain('👉')
  })

  it('非默认会话入徽章头', () => {
    const t = browserDoCardRender({ command: 'tab', session: 'work' }, { text: '[0] example.com' })[0]!.text
    expect(t).toContain('▣ browser_do · tab · session work — ✓ exit 0')
  })

  it('失败前缀与白名单拒绝:✗ exit N / ✗ 子命令被拒,末尾附人工接管提示', () => {
    const fail = browserDoCardRender({ command: 'eval' }, { text: '命令失败(退出码 2):\nSyntaxError: boom' })[0]!.text
    expect(fail).toContain('— ✗ exit 2')
    expect(fail).toContain('SyntaxError: boom')
    expect(fail).toContain('👉 状态异常:建议人工接管或改用 browser_* 原语')
    const denied = browserDoCardRender({ command: 'rm' }, { text: '不允许的子命令:rm(白名单见工具说明)' })[0]!.text
    expect(denied).toContain('— ✗ 子命令被拒')
    expect(denied).toContain('白名单见工具说明')
    expect(denied).toContain('👉 状态异常')
    // 失败但输出自带登录指引 → 不重复加(site 同款互斥)
    const login = browserDoCardRender({ command: 'find' }, { text: '命令失败(退出码 3):\nAUTH_REQUIRED: 请先登录后重试' })[0]!.text
    expect(login).toContain('— ✗ exit 3')
    expect(login).not.toContain('👉')
  })

  it('防御:非法输入不抛', () => {
    expect(browserDoCardRender({}, 'not-a-record')).toEqual([{ type: 'text', text: '' }])
  })
})

describe('site execute 判定标注流转(评审修复:⚠ 分支生产可达性,端到端)', () => {
  it('登录墙内容(exit 0)→ text 带 ⚠ 疑似静默失败 前缀,预览卡落 ⚠ 琥珀', async () => {
    installSo(null) // 登录墙走 verifyResult 规则层,SystemOne 不参与
    const tool = ctx.tools.registered.get('site')!
    const r = await tool.execute({ adapter: 'loginwall', command: 'hot' })
    expect(r.text.startsWith('(⚠ 疑似静默失败:登录/风控墙)')).toBe(true)
    expect(r.text).toContain('请先登录后再继续操作')
    const card = tool.output!.render!({ adapter: 'loginwall', command: 'hot' }, r)[0]!.text
    expect(card).toContain('▣ site · loginwall · hot — ⚠ 疑似静默失败:登录/风控墙')
    expect(card).toContain('请先登录后再继续操作')
  })

  it('有效内容 + SystemOne 可用 → (实测有效 P=…) 前缀,预览卡 P 值入标签', async () => {
    installSo(0.93)
    try {
      const tool = ctx.tools.registered.get('site')!
      const r = await tool.execute({ adapter: 'oksite', command: 'hot' })
      expect(r.text.startsWith('(实测有效 P=0.93)')).toBe(true)
      expect(r.text).toContain('热度984万')
      const card = tool.output!.render!({ adapter: 'oksite', command: 'hot' }, r)[0]!.text
      expect(card).toContain('▣ site · oksite · hot — ✓ exit 0 · 实测有效 P=0.93')
    } finally {
      installSo(null)
    }
  })

  it('SystemOne 不可用且规则未命中 → 不标注,原行为(execute 契约不因标注升级而变)', async () => {
    installSo(null)
    const tool = ctx.tools.registered.get('site')!
    const r = await tool.execute({ adapter: 'oksite', command: 'hot' })
    expect(r.text.startsWith('1 标题A')).toBe(true)
    expect(r.text).not.toContain('实测有效')
    expect(r.text).not.toContain('疑似静默失败')
  })

  it('laya 预热窗口内(warm=false)→ site 跳过 noul 兜底,不触发冷加载(评审修复)', async () => {
    // ask 若被调用会直接抛错:证明 warm 门禁把 noul 挡在了热路径外
    ;(ctx.opencli as unknown as { so: unknown }).so = {
      configured: true,
      warm: false,
      ask: async () => { throw new Error('warm 门禁失效:noul 在 laya 未预热时被调用') },
    }
    try {
      const tool = ctx.tools.registered.get('site')!
      const r = await tool.execute({ adapter: 'oksite', command: 'hot' })
      expect(r.text.startsWith('1 标题A')).toBe(true)
      expect(r.text).not.toContain('实测有效')
    } finally {
      installSo(null)
    }
  })

  it('laya 预热窗口内规则层照常:登录墙仍 ⚠ 标注(不依赖 noul/冷加载)', async () => {
    ;(ctx.opencli as unknown as { so: unknown }).so = {
      configured: true,
      warm: false,
      ask: async () => { throw new Error('不应走到 noul:登录墙必须由规则层命中') },
    }
    try {
      const tool = ctx.tools.registered.get('site')!
      const r = await tool.execute({ adapter: 'loginwall', command: 'hot' })
      expect(r.text.startsWith('(⚠ 疑似静默失败:登录/风控墙)')).toBe(true)
    } finally {
      installSo(null)
    }
  })
})

describe('三工具接线(注册表的 output.render 即本卡)+ execute 契约回声', () => {
  it('site / site_batch / browser_do 注册的 output.render 输出卡片形状', () => {
    const site = ctx.tools.registered.get('site')
    expect(typeof site?.output?.render).toBe('function')
    expect(site!.output!.render!({ adapter: 'zhihu', command: 'hot' }, { text: 'ok-data' })[0]!.text).toContain('▣ site · zhihu · hot')
    const batch = ctx.tools.registered.get('site_batch')
    expect(typeof batch?.output?.render).toBe('function')
    expect(batch!.output!.render!({ command: 'hot' }, { text: '批量采集 1/1 站成功:\n\n== zhihu ✓ ==\nX' })[0]!.text).toContain('▣ site_batch · hot × 1 站')
    const bd = ctx.tools.registered.get('browser_do')
    expect(typeof bd?.output?.render).toBe('function')
    expect(bd!.output!.render!({ command: 'find' }, { text: 'found 3' })[0]!.text).toContain('▣ browser_do · find')
  })

  it('site_batch execute 文本契约未被 render 升级破坏(桩 shell 全成功路径)', async () => {
    const tool = ctx.tools.registered.get('site_batch')!
    const r = await tool.execute({ command: 'hot', sites: ['aaa', 'bbb'] })
    expect(r.text).toContain('批量采集 2/2 站成功:')
    expect(r.text).toContain('== aaa ✓ ==')
    expect(r.text).toContain('== bbb ✓ ==')
    // 同一 text 过 render:信息不丢——汇总头"批量采集 2/2 站成功:"重排为等价徽章行
    //(✓ 2/2 站成功),目录预检注记与逐站契约串逐字保留
    const card = siteBatchCardRender({ command: 'hot', sites: ['aaa', 'bbb'] }, r)[0]!.text
    expect(card).toContain('▣ site_batch · hot × 2 站 — ✓ 2/2 站成功')
    expect(card).toContain('目录预检:以下站点不在适配器目录,请确认拼写:aaa, bbb')
    expect(card).toContain('== aaa ✓ ==')
  })
})
