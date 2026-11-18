/**
 * 兜底域名源修复的服务级单测(C3;docs/RESEARCH-20261116-015.md 正文三§三 + §一序1):
 * - 根因:CLI 2.0.x 运行时 `opencli list` 输出零 site/domain 字段(1,292 条实测仅
 *   command/description/access)→ domainOf 恒 null → 任何站点兜底必走「适配器清单无该站点
 *   域名」失败分支(0.1.4 演练 7/9 两未过检查的结构性根因)。
 * - 修复:domainOf 权威补位源=已装上游包 cli-manifest.json(site→domain 映射,171 站/164 站
 *   非空,惰性加载+mtime 指纹守缓存+SITE_DOMAIN_CAP 有界);兜底专用 fallbackDomain 三级链=
 *   adapterList domain → manifest 权威 → 站名推测(仅 manifest 在册而缺域名的站,speculative
 *   标注);manifest 不可用 → 如实降格(null+具体原因),不瞎猜。
 * 隔离:manifest 路径经 DSH_OPENCLI_MANIFEST 显式注入(显式路径=权威,不存在也按它定位→降格
 * 路径可测);真机 171 站抽样仅在真机 manifest 在位时运行(runIf),无 CLI 环境自动跳过。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis'
import { OpencliService, buildSiteDomainMap, resolveCliManifestFile, SITE_DOMAIN_CAP } from '../lib/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

class StubShell extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'shell') }
  resolve(req: unknown): unknown { return req }
  async run(spec: { command: unknown }): Promise<{ exitCode: number; stdout: { text: string }; stderr: { text: string } }> {
    const cmd = String(Array.isArray(spec.command) ? spec.command.join(' ') : spec.command)
    if (cmd.includes('--version')) return { exitCode: 0, stdout: { text: '2.0.3\n' }, stderr: { text: '' } }
    if (cmd.includes('daemon status')) return { exitCode: 0, stdout: { text: 'Daemon: running\nVersion: v2.0.3\nPort: 19825\n' }, stderr: { text: '' } }
    return { exitCode: 0, stdout: { text: 'ok\n' }, stderr: { text: '' } }
  }
}
class StubTools extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'tools') }
  register(def: unknown): void { void def }
}
class StubSystemPrompt extends Service {
  constructor(ctx: InstanceType<typeof Context>) { super(ctx, 'systemPrompt') }
  section(): void {}
}

type RunOut = { exitCode: number; stdout: string; stderr: string }
type FbDomain = { domain: string; speculative: boolean } | { domain: null; reason: string }
type Priv = {
  adapterCache: { at: number; json: unknown } | null
  schedules: Array<{ id: string; site: string; cron: string; createdAt: string; enabled: boolean; retry?: number; notify?: boolean; profile?: string }>
  runHistory: Record<string, Array<{ at: string; ok: boolean; summary: string; receipt?: Record<string, unknown> }>>
  driftHistory: Map<string, Array<{ items: number | null; structured: boolean }>>
  ingestEventList: Array<{ at: string; kind: string; text: string }>
  snapshotsBase: string
  shotCapture: boolean
  runOpencli: (...a: unknown[]) => Promise<RunOut>
  runBrowserTraced?: (sess: string | undefined, argv: string[]) => Promise<RunOut>
  daemonStatus: () => Promise<unknown>
  domainOf: (s: string) => Promise<string | null>
  fallbackDomain: (s: string) => Promise<FbDomain>
  runSiteCommand: (siteCmd: string, id: string) => Promise<void>
}

const tmp = (tag: string): string => path.join(os.tmpdir(), `dsh-opencli-test-${tag}-${process.pid}-${Date.now()}`)
const fixtureDir = tmp('fallback-domain-fixture')
const fixturePath = path.join(fixtureDir, 'cli-manifest.json')
const missingPath = path.join(fixtureDir, '不存在.json')
/** fixture:2.0.x manifest 形态。driftx 在册但 domain 空串(=在册缺域名站的真实形态;
 *  2.0.3 下缺域名共 7 站,推测层只对其中 6 个 http 直连类站生效);web 在册但无 domain
 *  (通用 read 命令,推测层明确排除);12306 双域名验证「首见非空即定」。 */
const FIXTURE = [
  { site: 'zhihu', name: 'hot', access: 'read', domain: 'www.zhihu.com' },
  { site: 'zhihu', name: 'search', access: 'read', domain: 'www.zhihu.com' },
  { site: 'juejin', name: 'hot', access: 'read', domain: 'api.juejin.cn' },
  { site: '12306', name: 'login', access: 'write', domain: '12306.cn' },
  { site: '12306', name: 'me', access: 'read', domain: 'kyfw.12306.cn' },
  { site: 'arxiv', name: 'search', access: 'read' },
  { site: 'guazi', name: 'browse', access: 'read' },
  { site: 'web', name: 'read', access: 'read' },
  { site: 'driftx', name: 'hot', access: 'read' },
  { site: 'driftx', name: 'search', access: 'read', domain: '' },
]
const NEVER_CRON = '0 3 31 2 *' // 永不触发的 cron(notify.test.ts 同款):执行全由 runSiteCommand 直调驱动

let ctx: InstanceType<typeof Context>
let svc: OpencliService
const S = (): Priv => svc as unknown as Priv
const origManifestEnv = process.env.DSH_OPENCLI_MANIFEST
const setManifestEnv = (v: string | undefined): void => {
  if (v === undefined) delete process.env.DSH_OPENCLI_MANIFEST
  else process.env.DSH_OPENCLI_MANIFEST = v
}

beforeAll(async () => {
  fs.mkdirSync(fixtureDir, { recursive: true })
  fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE), 'utf8')
  ctx = new Context()
  await ctx.plugin(StubShell)
  await ctx.plugin(StubTools)
  await ctx.plugin(StubSystemPrompt)
  await ctx.plugin(OpencliService)
  svc = ctx.opencli as OpencliService
  // subprocess seam 禁用(unattended-hygiene.test.ts 同款):绝不 spawn 真 CLI 碰真 daemon
  const reflect = (ctx as unknown as { reflect: { get: (p: string, f?: boolean) => unknown } }).reflect
  const origGet = reflect.get.bind(reflect)
  reflect.get = (name: string, flag?: boolean) => (name === 'subprocess' ? undefined : origGet(name, flag))
  ;(svc as unknown as { so: unknown }).so = { configured: false, ask: async () => ({ ok: false, answers: {}, latencyMs: 0, error: 'stub-unavailable' }) }
  S().shotCapture = false
  // 健康预检桩:daemon 运行、版本稳定、扩展已连(不触发自愈/跳过分支)
  S().daemonStatus = async () => ({ running: true, version: '2.0.3', extension: 'connected' })
})

afterAll(async () => {
  setManifestEnv(origManifestEnv)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

/** 2.0.x 形态空目录缓存(运行时 list 零 domain 字段的最小模拟,实时效,adapterList 走缓存不碰 shell)。 */
const emptyListCache = (): void => { S().adapterCache = { at: Date.now(), json: [] } }

describe('纯函数层:buildSiteDomainMap(manifest → 站点域名映射)', () => {
  it('顶层非数组 → null(不编造)', () => {
    expect(buildSiteDomainMap({ nope: true })).toBeNull()
    expect(buildSiteDomainMap('[]')).toBeNull()
    expect(buildSiteDomainMap(null)).toBeNull()
  })
  it('同站多命令域名不唯一:首见非空即定(与 normalizeAdapterList 补位规则同口径)', () => {
    const map = buildSiteDomainMap([{ site: '12306', domain: '12306.cn' }, { site: '12306', domain: 'kyfw.12306.cn' }])
    expect(map?.get('12306')).toBe('12306.cn')
  })
  it('在册站一律入映射:有域名=值,缺域名=null 标记(与「不在册」=undefined 可区分);键值去空白;键小写', () => {
    const map = buildSiteDomainMap([{ site: 'x', domain: '' }, { site: 'y' }, { site: null, domain: 'z.com' }, { site: ' OK ', domain: ' Ok.com ' }])
    expect(map?.get('x')).toBeNull()
    expect(map?.get('y')).toBeNull()
    expect(map?.has('z.com')).toBe(false) // 无 site 名的条目不入
    expect(map?.size).toBe(3)
    expect(map?.get('ok')).toBe('Ok.com')
  })
  it('先空后非空补位(首见非空即定的补位口径)', () => {
    const map = buildSiteDomainMap([{ site: 'a' }, { site: 'a', domain: 'a.com' }, { site: 'a' }])
    expect(map?.get('a')).toBe('a.com')
  })
  it(`有界:cap 生效(默认 ${SITE_DOMAIN_CAP},防异常膨胀 manifest)`, () => {
    const raw = Array.from({ length: SITE_DOMAIN_CAP + 50 }, (_, i) => ({ site: `s${i}`, domain: `s${i}.com` }))
    expect(buildSiteDomainMap(raw)?.size).toBe(SITE_DOMAIN_CAP)
    expect(buildSiteDomainMap(raw, 3)?.size).toBe(3)
  })
})

describe('domainOf 权威补位(修复核心:2.0.x 运行时 list 零 domain → manifest 补位)', () => {
  it('adapterList 无 domain 时,在册站取 manifest 域名(zhihu/juejin=api 非门户域照取,规格 §三实测值)', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    expect(await S().domainOf('zhihu')).toBe('www.zhihu.com')
    expect(await S().domainOf('juejin')).toBe('api.juejin.cn')
    expect(await S().domainOf('12306')).toBe('12306.cn')
  })
  it('站名大小写防御:ZHIHU 同样命中(manifest 键一律小写)', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    expect(await S().domainOf('ZHIHU')).toBe('www.zhihu.com')
  })
  it('manifest 在册但缺域名(domain 空/缺字段)→ null(不做权威编造,推测层归 fallbackDomain)', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    expect(await S().domainOf('driftx')).toBeNull()
    expect(await S().domainOf('arxiv')).toBeNull()
  })
  it('adapterList 自带 domain 时优先(1.x/未来 list 带 domain 的运行时输出维持原行为)', async () => {
    setManifestEnv(fixturePath)
    S().adapterCache = { at: Date.now(), json: [{ command: 'zhihu hot', site: 'zhihu', domain: 'runtime.example' }] }
    expect(await S().domainOf('zhihu')).toBe('runtime.example')
  })
})

describe('fallbackDomain 三级链(兜底专用:权威两级 + 推测末级)', () => {
  it('在册有域名 → 权威非推测;在册缺域名 → 推测 <站名>.com 且 speculative:true', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    expect(await S().fallbackDomain('zhihu')).toEqual({ domain: 'www.zhihu.com', speculative: false })
    expect(await S().fallbackDomain('arxiv')).toEqual({ domain: 'arxiv.com', speculative: true })
    expect(await S().fallbackDomain('guazi')).toEqual({ domain: 'guazi.com', speculative: true })
  })
  it('web 推测排除(通用 read 命令非站点,web.com 是无关注册域——已知必错的推测不做)', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    const r = await S().fallbackDomain('web')
    expect(r.domain).toBeNull()
    expect('reason' in r && r.reason).toContain('web')
  })
  it('不在册站名不推测(对凭空站名猜域名纯属编造)→ null + 原因', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    const r = await S().fallbackDomain('nosuchsite')
    expect(r.domain).toBeNull()
    expect('reason' in r && r.reason).toContain('nosuchsite')
  })
})

describe('降格路径(manifest 不可用 → 域名 null → 兜底如实失败,不瞎猜)', () => {
  it('显式 env 指向不存在路径 → domainOf null + fallbackDomain 带具体原因(定位/不可读),零推测值', async () => {
    setManifestEnv(missingPath)
    emptyListCache()
    expect(await S().domainOf('zhihu')).toBeNull()
    const r = await S().fallbackDomain('zhihu')
    expect(r.domain).toBeNull()
    expect('reason' in r).toBe(true)
    expect('reason' in r && r.reason.length).toBeGreaterThan(0)
    expect('reason' in r && /cli-manifest|不可读|未定位/.test(r.reason)).toBe(true)
    // 不瞎猜的硬断言:降格路径绝不吐 '.com' 推测值
    expect('speculative' in r).toBe(false)
  })
  it('e2e:漂移命中 + manifest 不可用 → adapter-drift-fallback 失败事件带原因;零 browser 调用(没开任何 URL)', async () => {
    setManifestEnv(missingPath)
    emptyListCache()
    const id = `fbdeg-${Date.now()}`
    const siteCmd = 'site zhihu hot'
    S().schedules.push({ id, site: siteCmd, cron: NEVER_CRON, createdAt: new Date().toISOString(), enabled: true, retry: 1, notify: false })
    let siteCalls = 0
    let browserCalls = 0
    const origRun = S().runOpencli
    const origTraced = S().runBrowserTraced
    let n = 0
    S().runOpencli = (async (...a: unknown[]) => {
      const argv = a[0] as string[]
      if (argv[0] === 'zhihu') { n++; siteCalls++; return { exitCode: 0, stdout: n === 1 ? '[{"t":"a"},{"t":"b"}]' : `plain page text ${n}`, stderr: '' } }
      browserCalls++
      return { exitCode: 0, stdout: '{}', stderr: '' }
    }) as Priv['runOpencli']
    try {
      for (let i = 0; i < 4; i++) await S().runSiteCommand(siteCmd, id)
    } finally {
      S().runOpencli = origRun
      S().runBrowserTraced = origTraced
      S().schedules.splice(S().schedules.findIndex((x) => x.id === id), 1)
      delete S().runHistory[id]
      S().driftHistory.delete(id)
    }
    expect(siteCalls).toBe(4)
    expect(browserCalls).toBe(0) // 兜底域名解析不出 → 不碰 browser 链路(不瞎猜的行为证据)
    const fb = S().ingestEventList.filter((e) => e.kind === 'adapter-drift-fallback' && e.text.includes('zhihu'))
    expect(fb.length).toBeGreaterThanOrEqual(1)
    expect(fb.at(-1)?.text).toContain('漂移兜底失败')
    expect(fb.at(-1)?.text).toContain('cli-manifest')
  })
})

describe('e2e:推测域名兜底成功(speculative 逐处标注:事件/快照/history 行)', () => {
  it('在册缺域名站(driftx)→ 开推测域名 → 成功事件+快照 fallback.speculative+history 标注', async () => {
    setManifestEnv(fixturePath)
    emptyListCache()
    const id = `fbspec-${Date.now()}`
    const siteCmd = 'site driftx hot'
    S().schedules.push({ id, site: siteCmd, cron: NEVER_CRON, createdAt: new Date().toISOString(), enabled: true, retry: 1, notify: false })
    const origRun = S().runOpencli
    let n = 0
    const browserArgv: string[][] = []
    S().runOpencli = (async (...a: unknown[]) => {
      const argv = a[0] as string[]
      if (argv[0] === 'driftx') { n++; return { exitCode: 0, stdout: n === 1 ? '[{"t":"a"},{"t":"b"}]' : `plain page text ${n}`, stderr: '' } }
      browserArgv.push(argv)
      // runBrowserTraced(cliMajor=2 形态):browser <sub> … --session <sess>
      if (argv[0] === 'browser' && argv[1] === 'state') return { exitCode: 0, stdout: '{"title":"driftx guessed page"}', stderr: '' }
      return { exitCode: 0, stdout: 'ok', stderr: '' }
    }) as Priv['runOpencli']
    let row: { receipt?: Record<string, unknown>; summary: string } | undefined
    try {
      for (let i = 0; i < 4; i++) await S().runSiteCommand(siteCmd, id)
      row = S().runHistory[id]?.[0]
    } finally {
      S().runOpencli = origRun
      S().schedules.splice(S().schedules.findIndex((x) => x.id === id), 1)
      delete S().runHistory[id]
      S().driftHistory.delete(id)
    }
    // 兜底链路:open 推测域名 → state → close(2.0 argv 形态:browser <sub> … --session)
    expect(browserArgv.map((a) => a[1])).toEqual(['open', 'state', 'close'])
    expect(browserArgv[0]).toContain('https://driftx.com')
    const fbOk = S().ingestEventList.filter((e) => e.kind === 'adapter-drift-fallback' && e.text.includes('driftx') && e.text.includes('兜底成功'))
    expect(fbOk.length).toBe(1)
    expect(fbOk[0]!.text).toContain('推测域名')
    expect(row?.receipt?.degraded).toBe(true)
    expect(row?.summary).toContain('推测域名')
    const dir = path.join(S().snapshotsBase, id)
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    const snap = JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)!), 'utf8')) as { degraded?: boolean; fallback?: { domain?: string; speculative?: boolean; stdout?: string } }
    expect(snap.degraded).toBe(true)
    expect(snap.fallback?.domain).toBe('driftx.com')
    expect(snap.fallback?.speculative).toBe(true)
    expect(snap.fallback?.stdout).toContain('driftx guessed page')
  })
})

describe('171 站抽样(真机 cli-manifest.json;无 CLI 环境自动跳过)', () => {
  const realManifest = resolveCliManifestFile()
  it.runIf(realManifest !== undefined)('真机 manifest 全量抽样:171 站权威非空 164 + 推测 6 + web 如实 null', async () => {
    const raw = JSON.parse(fs.readFileSync(realManifest!, 'utf8')) as unknown
    const map = buildSiteDomainMap(raw)
    expect(map).not.toBeNull()
    const sites = [...new Set((raw as Array<{ site?: string }>).map((e) => String(e.site ?? '').trim().toLowerCase()))].filter((s) => s.length > 0).sort()
    expect(map!.size).toBe(sites.length) // 在册站一律入映射(缺域名=null 标记),与唯一站数齐平
    expect(sites.length).toBe(171) // 2.0.3 权威口径(基线 11-12 解包计数,规格 §三)
    const withDomain = sites.filter((s) => typeof map!.get(s) === 'string')
    expect(withDomain.length).toBe(164) // 164/171 非空(规格 §三)
    // 权威值抽查(规格 §三实测锚点)
    expect(map!.get('zhihu')).toBe('www.zhihu.com')
    expect(map!.get('juejin')).toBe('api.juejin.cn')
    expect(map!.get('v2ex')).toBe('www.v2ex.com')
    expect(map!.get('reddit')).toBe('reddit.com')
    // 服务级链路抽样:全部 171 站过 fallbackDomain——权威非推测,缺域名推测(除 web),无未知态
    setManifestEnv(realManifest)
    emptyListCache()
    const authoritative: string[] = []
    const speculative: string[] = []
    const honestNull: string[] = []
    for (const s of sites) {
      const r = await S().fallbackDomain(s)
      if (r.domain !== null) (r.speculative ? speculative : authoritative).push(s)
      else honestNull.push(s)
    }
    expect(authoritative.length).toBe(164)
    expect(speculative).toEqual(['apple-podcasts', 'arxiv', 'autohome', 'dongchedi', 'guazi', 'spotify']) // 2.0.3 在册缺域名全集(除 web)
    expect(honestNull).toEqual(['web']) // 唯一如实无域名:通用 read 命令,推测被排除
  })
})
