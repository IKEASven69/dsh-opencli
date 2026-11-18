// 兜底路径真机演练(0.1.4 随车质量项):adapter-drift-fallback 代码在(src/index.ts drift 检测
// 4901-4966 / driftFallbackCollect 5085-5101)但本机 0 实战触发,CHANGELOG 0.1.3 已对外承诺
// 「漂移兜底」——本脚本给兜底路径一次真机行使背书。
//
// 演练形态(两段,全部真实调用,零桩):
//   ①触发判定:真实跑一遍给定站点命令取基线,按真实条目数构造「连续 3 次结构突变」样本序列
//     (条目骤降:逐次腰斩;或结构翻转:结构化→连续 3 次非结构化),用与 src/diffsnap.ts:215
//     detectDrift 同口径的判定复刻验证序列必触发,并用阴性对照(平稳/回升/从未结构化)验证判定
//     不误报;
//   ②兜底采集:按真实兜底路径逐条行使——域名解析走 fallbackDomain 同款三级链(0.1.5 C3 复核②:
//     ①adapterList domain(`list --format json` 分页口径,仅 1.x 等带 domain 字段的清单命中)→
//     ②已装上游包 cli-manifest.json 权威补位(2.0.x 权威源,171 站 164 站非空)→ ③站名推测
//     `<站名>.com`(仅 manifest 在册缺域名的站,speculative 标注;web 系通用 read 命令明确排除)
//     → `browser open https://<domain>` → `browser state`(验收判据与 src/index.ts:5092 逐字
//     一致:exit 0 且 stdout 非空)→ close 有界清理(同 src/index.ts:5098 finally);成功则产出
//     与真实路径同形的 degraded 回执与事件记录(推测域名逐处标注,同 src/index.ts:4939/4946/4948),
//     失败则产出同形的如实失败事件(域名缺失/扩展未连等 note 与 src/index.ts:4932/5089/5093 同源)。
//
// 演练边界(如实):
//   - 注入面:driftHistory 是面板进程内存态(src/index.ts:313),外部脚本不可注入;故演练
//     不经 schedule tick 全链,tick 内接线(快照 fallback 字段落盘/history 🛟 行/receipt 改写)
//     由单元测试覆盖,本脚本不重复;
//   - 事件台账零写入:演练生成的事件文本只进本报告与 stdout,绝不追加 ~/.dsh/opencli-events.jsonl
//     (台账归插件写,演练写入即污染历史面);作为对照,报告同时只读统计真实台账里
//     adapter-drift / adapter-drift-fallback 的历史出现次数;
//   - 会话名 drift-drill-<ts>(真实兜底为 drift-<ts>,src/index.ts:5086):加 -drill 标记,
//     运行轨迹/浏览器会话复盘时可分拣演练流量与生产兜底流量;
//   - 多账号边界与生产一致:演练不走 profile(任务带 profile 的任务本就不兜底,src/index.ts:4928-4932);
//   - 判定复刻(countStructuredItems/detectDrift)与 src/parsers.ts:337、src/diffsnap.ts:203-225
//     同口径——上游判定若改,本复刻须同步,报告里的触发/不误报结论才继续作数;
//   - 域名源复刻(resolveManifestFile/buildDomainMap/推测末级)与 src/index.ts:213-238/247-262/3283-3301
//     同口径(0.1.5 C3 复核②:修前检查 #4 只镜像旧 adapterList 域名,CLI 2.0.x 下恒 null,
//     演练因生产已修掉的同一根因假阴性)——生产域名判定若改,本复刻须同步,域名检查结论才继续作数;
//   - 报告卫生不再复刻(0.1.5 C7,复核 L21):scrubReport 直接引 src/notify.ts 的
//     scrubLocalPaths(SCRUB_RULES 全量),修前此处内嵌四条真子集,演练报告可泄非 URL 形
//     凭据(sk-/ghp_ 令牌、Bearer 头、长 hex 串);两端同步由 tests/fallback-drill-scrub.test.ts 钉住。
//
// 前置:OpenCLI daemon 运行且 BrowserBridge 扩展已连接(browser 原语硬依赖;扩展未连时
// `browser open` 会如实失败并在报告给出 note);给定命令若为纯 HTTP 只读命令则不依赖扩展,
// dsh 面板无需在跑。
// 用法(自 0.1.5 C7 起需类型转换档引规则函数;裸 node 运行会退码 2 并给出指引,不静默降级):
//   node --experimental-transform-types .build-tools/fallback-drill.cjs "site reddit hot"          # 站点命令(site 前缀可选)
//   node --experimental-transform-types .build-tools/fallback-drill.cjs "reddit hot" --out r.json  # 报告另存
// 退出码:0=全过;1=有检查不过;2=用法/环境错误(CLI 不可用/命令不在册等)。
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// ── 参数 ─────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)
const outIdx = rawArgs.indexOf('--out')
const outFile = outIdx !== -1 ? rawArgs[outIdx + 1] : undefined
const siteCmdRaw = rawArgs.filter((a, i) => a !== '--out' && i !== outIdx + 1).join(' ').trim()
if (!siteCmdRaw) { console.error('need site command, e.g. "site reddit hot"'); process.exit(2) }
// 任务字段同款剥前缀(src/index.ts:4682:面板占位符 'site zhihu hot' 形态,CLI 直接吃 'zhihu hot')
const siteCmd = /^site\s+/i.test(siteCmdRaw) ? siteCmdRaw : `site ${siteCmdRaw}`
const normCmd = siteCmd.replace(/^\s*site\s+/i, '').trim()
const [sSite = '', ...restWords] = normCmd.split(/\s+/)
const sCmd = restWords.join(' ')

// ── CLI 定位与执行(镜像 resolveBin 级联:env → 本地依赖 → 全局 node 同目录 → vfox 扫描 → PATH;
//    优先用 node 直跑 main.js,避开 Windows 对无扩展 shim 的静默忽略,src/index.ts:414) ──
function resolveCli() {
  const mainJs = (p) => (fs.existsSync(p) ? p : null)
  if (process.env.DSH_OPENCLI_BIN && process.env.DSH_OPENCLI_BIN.length > 0) {
    const bin = process.env.DSH_OPENCLI_BIN
    if (bin.endsWith('.js') && fs.existsSync(bin)) return { cmd: process.execPath, args: [bin], desc: bin }
    return { cmd: bin, args: [], shell: true, desc: `${bin}(env 原样/PATH)` }
  }
  try {
    // @ts-ignore - optional peer
    const pkg = require.resolve('@jackwener/opencli/package.json')
    const p = mainJs(path.join(path.dirname(pkg), 'dist', 'src', 'main.js'))
    if (p) return { cmd: process.execPath, args: [p], desc: p }
  } catch { /* 无本地依赖则继续级联 */ }
  const globalMain = mainJs(path.join(path.dirname(process.execPath), 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js'))
  if (globalMain) return { cmd: process.execPath, args: [globalMain], desc: globalMain }
  for (const root of [path.join(os.homedir(), '.vfox', 'sdks', 'nodejs'), path.join(os.homedir(), '.vfox', 'cache', 'nodejs')]) {
    const active = mainJs(path.join(root, 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js'))
    if (active) return { cmd: process.execPath, args: [active], desc: active }
    try {
      for (const ver of fs.readdirSync(root)) {
        const p = mainJs(path.join(root, ver, 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js'))
        if (p) return { cmd: process.execPath, args: [p], desc: p }
      }
    } catch { /* 根不存在则跳过 */ }
  }
  return { cmd: 'opencli', args: [], shell: true, desc: 'opencli(PATH)' }
}
const cli = resolveCli()
const run = (args, timeoutMs = 60_000, maxBytes = 1_048_576) => {
  const r = spawnSync(cli.cmd, [...cli.args, ...args], {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: maxBytes, shell: cli.shell === true,
    cwd: os.homedir(), windowsHide: true,
  })
  return { exitCode: r.status ?? (r.error ? -1 : 1), stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? ''), error: r.error?.message }
}
const head = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// ── 判定复刻(与 src/parsers.ts:337 countStructuredItems / src/diffsnap.ts:203-225 同口径) ──
function countStructuredItems(text) {
  const s = String(text ?? '').trim()
  if (s.length === 0) return 0
  try {
    const j = JSON.parse(s)
    if (Array.isArray(j)) return j.length
    if (j !== null && typeof j === 'object') {
      for (const k of ['data', 'items', 'list', 'results']) {
        const v = j[k]
        if (Array.isArray(v)) return v.length
      }
    }
    return null
  } catch { return null }
}
const isShrink = (a, b) => a.items !== null && b.items !== null && a.items > 0 && b.items <= a.items / 2
function detectDrift(history) {
  if (history.length < 4) return false
  const n = history.length
  if (isShrink(history[n - 4], history[n - 3]) && isShrink(history[n - 3], history[n - 2]) && isShrink(history[n - 2], history[n - 1])) return true
  if (!history[n - 1].structured && !history[n - 2].structured && !history[n - 3].structured) {
    return history.slice(0, n - 3).some((s) => s.structured)
  }
  return false
}
// 报告卫生:演练报告含登录态页面状态摘录,出报告前必须脱敏。0.1.5 C7(复核 L21):规则函数
// 直接引真实源 src/notify.ts 的 scrubLocalPaths(SCRUB_RULES 全量九条:URL 参数/路径/键值令牌/
// 裸 Bearer/具名密钥前缀/32+ hex/40+ base64)——修前此处内嵌前四条真子集,演练报告会泄
// 非 URL 形凭据(sk-/ghp_ 令牌、Bearer 头、长 hex 串);「引函数不引子集」与规则行为两端由
// tests/fallback-drill-scrub.test.ts 钉住。require 一个 TS 模块需 node 类型转换档
// (--experimental-transform-types,require(esm-ts));环境不满足时如实退码 2,不静默降级回子集。
let scrubReport
try {
  const notify = require(path.join(__dirname, '..', 'src', 'notify.ts'))
  if (typeof notify.scrubLocalPaths !== 'function') throw new Error('scrubLocalPaths 未导出——src/notify.ts 导出面变化,同步测试会红')
  scrubReport = notify.scrubLocalPaths
} catch (e) {
  console.error('scrub 规则函数(src/notify.ts scrubLocalPaths)加载失败:' + String(e && e.message ? e.message : e))
  console.error('本脚本自 0.1.5 C7(复核 L21)起不再内嵌规则子集复刻(防演练报告泄非 URL 形凭据);')
  console.error('请以类型转换模式运行:node --experimental-transform-types .build-tools/fallback-drill.cjs "site <站点> <命令>"')
  process.exit(2)
}

// ── 检查框架(汇总态先声明再跑步骤:finish 可在任何一步提前收场,无 TDZ 引用) ──
const checks = []
const check = (name, cond, detail) => { checks.push({ name, pass: !!cond, detail: head(detail, 200) }); console.log((cond ? '  PASS ' : '  FAIL ') + name + (cond ? '' : ' — ' + head(detail, 220))) }
let domain, access, cmdFound = false
let fr = null, speculative = false // 域名解析结果(fallbackDomain 三级链)与推测标注
let base = null, baseCount = null
let mode = 'none', samples = null, trips = false, neg = null
let sess = null
const fb = { executed: false, ok: false, note: '未执行', open: null, state: null, close: null, stdoutHead: '', bytes: 0 }
let receipt = null
let events = []
let observedLive = { file: null, 'adapter-drift': 0, 'adapter-drift-fallback': 0 }

// ── ①环境与前置 ──────────────────────────────────────────────────
console.log(`[drill] ${siteCmd}  cli=${cli.desc}`)
const v = run(['--version'], 15_000)
const major = (() => { const m = `${v.stdout}\n${v.stderr}`.match(/(\d+)\.\d+/); return m ? Number(m[1]) : null })()
check('CLI 可用(--version)', v.exitCode === 0 && major !== null, `${v.exitCode} ${head(v.stderr || v.error, 120)}`)
if (v.exitCode !== 0 || major === null) finish(2)
// 2.x:`browser <op> --session <s>`(src/index.ts:3811);1.x:`browser <s> <op>`(:3814)
const bform = major >= 2 ? (argv, s) => ['browser', ...argv, '--session', s] : (argv, s) => ['browser', s, ...argv]

// 适配器清单(2.x 分页取全,镜像 src/index.ts:5183-5196 信封解析;1.x 平铺数组)
function adapterEntries() {
  if (major >= 2) {
    const collected = []
    let offset = 0
    for (let page = 0; page < 40; page++) {
      const r = run(['list', '--format', 'json', '--limit', '100', '--offset', String(offset)], 30_000, 4 * 1024 * 1024)
      if (r.exitCode !== 0) return { err: `list exit ${r.exitCode}:${head(r.stderr, 120)}` }
      try {
        const s = r.stdout.trimStart()
        const start = s.indexOf('{')
        const j = JSON.parse(start === -1 ? s : s.slice(start))
        if (j.ok !== true || !Array.isArray(j.data?.commands)) return { err: `信封异常:${head(JSON.stringify(j), 160)}` }
        collected.push(...j.data.commands)
        const total = typeof j.data.total === 'number' ? j.data.total : null
        const next = typeof j.data.nextOffset === 'number' ? j.data.nextOffset : 0
        if (next <= offset || (total !== null && collected.length >= total)) break
        offset = next
      } catch (e) { return { err: `json 解析:${head(e.message, 120)}` } }
    }
    return { entries: collected }
  }
  const r = run(['list', '--format', 'json'], 30_000, 4 * 1024 * 1024)
  if (r.exitCode !== 0) return { err: `list exit ${r.exitCode}:${head(r.stderr, 120)}` }
  const s = r.stdout.trimStart()
  try { return { entries: JSON.parse(s.slice(s.indexOf('['))) } } catch (e) { return { err: `json 解析:${head(e.message, 120)}` } }
}
// 站点/命令名提取(镜像 src/parsers.ts:149 splitCommandEntry)
function entrySiteName(raw) {
  let site = raw.site, name = raw.name
  if ((site === undefined || name === undefined) && typeof raw.command === 'string') {
    const slash = raw.command.split('/')
    if (slash.length >= 2 && slash[0] !== '' && slash[1] !== '') {
      if (site === undefined) site = slash[0]
      if (name === undefined) name = slash.slice(1).join('/')
    } else {
      const sp = raw.command.indexOf(' ')
      if (sp > 0) { if (site === undefined) site = raw.command.slice(0, sp); if (name === undefined) name = raw.command.slice(sp + 1) }
    }
  }
  return { site, name }
}
// ── 域名源三级链复刻(0.1.5 C3 复核②:镜像 src/index.ts fallbackDomain:3283-3301;生产判定若改须同步,见头部纪律) ──
const SITE_DOMAIN_CAP = 2000 // 镜像 src/index.ts:201 同名常量:只防异常膨胀的 manifest 文件
// cli-manifest.json 定位(镜像 resolveCliManifestFile,src/index.ts:213-238;显式 env 路径=权威,
// 不存在也按它定位→降格原因如实带出,不悄悄换源)
function resolveManifestFile() {
  if (process.env.DSH_OPENCLI_MANIFEST && process.env.DSH_OPENCLI_MANIFEST.length > 0) return process.env.DSH_OPENCLI_MANIFEST
  try {
    const pkg = require.resolve('@jackwener/opencli/package.json')
    const p = path.join(path.dirname(pkg), 'cli-manifest.json')
    if (fs.existsSync(p)) return p
  } catch { /* 无本地依赖则回退全局 */ }
  const globalP = path.join(path.dirname(process.execPath), 'node_modules', '@jackwener', 'opencli', 'cli-manifest.json')
  if (fs.existsSync(globalP)) return globalP
  for (const root of [path.join(os.homedir(), '.vfox', 'cache', 'nodejs'), path.join(os.homedir(), '.vfox', 'sdks', 'nodejs'), path.join(os.homedir(), '.nvm')]) {
    const direct = path.join(root, 'node_modules', '@jackwener', 'opencli', 'cli-manifest.json')
    if (fs.existsSync(direct)) return direct
    try {
      for (const ver of fs.readdirSync(root)) {
        const p = path.join(root, ver, 'node_modules', '@jackwener', 'opencli', 'cli-manifest.json')
        if (fs.existsSync(p)) return p
      }
    } catch { /* 根不存在则跳过 */ }
  }
  return undefined
}
// manifest 原始 JSON → 站点→域名映射(镜像 buildSiteDomainMap,src/index.ts:247-262):值三态
// string/null/undefined(null=在册缺域名,必须与不在册可区分);同站多命令取 manifest 序首个
// 非空(先空后非空补位);键小写。
function buildDomainMap(raw) {
  if (!Array.isArray(raw)) return null
  const map = new Map()
  for (const e of raw) {
    if (e === null || typeof e !== 'object') continue
    const site = typeof e.site === 'string' ? e.site.trim().toLowerCase() : ''
    const d = e.domain
    const dom = typeof d === 'string' && d.trim() !== '' ? d.trim() : undefined
    if (site.length === 0) continue
    const existing = map.get(site)
    if (existing !== undefined) { if (existing === null && dom !== undefined) map.set(site, dom); continue }
    map.set(site, dom ?? null)
    if (map.size >= SITE_DOMAIN_CAP) break
  }
  return map
}
let manifestError // manifest 整体不可用原因(镜像 manifestDomainError 语义,如实降格不编造)
const manifestMap = (() => {
  const mf = resolveManifestFile()
  if (mf === undefined) { manifestError = '未定位到已装上游包的 cli-manifest.json(npm i -g @jackwener/opencli 后可用)——无法权威解析站点域名'; return null }
  try {
    const map = buildDomainMap(JSON.parse(fs.readFileSync(mf, 'utf8')))
    if (map === null) throw new Error('manifest 顶层不是数组')
    return map
  } catch (e) { manifestError = `cli-manifest.json 解析失败:${String(e && e.message ? e.message : e).slice(0, 120)}`; return null }
})()
// fallbackDomain 同款三级链:①adapterList domain(聚合循环所得)→ ②manifest 权威 →
// ③在册缺域名站名推测 <站名>.com(web 系通用 read 命令明确排除;不在册不推测)。
function fallbackDomainReplica(site) {
  const norm = String(site ?? '').trim().toLowerCase()
  if (typeof domain === 'string' && domain.length > 0) return { domain, speculative: false, source: 'adapterList' }
  if (manifestMap !== null) {
    const rec = manifestMap.get(norm)
    if (typeof rec === 'string') return { domain: rec, speculative: false, source: 'manifest' }
    if (rec !== undefined) {
      if (norm !== 'web') return { domain: `${norm}.com`, speculative: true, source: 'speculative' }
      return { domain: null, reason: '「web」是通用 read 命令非站点,web.com 为无关注册域——已知必错的推测不做' }
    }
    return { domain: null, reason: manifestError ?? `cli-manifest.json 无站点「${site}」(不在册)——不猜测域名` }
  }
  return { domain: null, reason: manifestError ?? `cli-manifest.json 无站点「${site}」的域名记录(不在册或缺域名)` }
}

const list = adapterEntries()
check('适配器清单可取(list --format json)', !list.err, list.err ?? `${list.entries.length} 条命令`)
if (list.err) finish(2)
// 该站点条目聚合(adapterList 层域名:取站点下首个非空值,镜像 normalizeAdapterList 首见即定口径)
for (const raw of list.entries) {
  if (raw === null || typeof raw !== 'object') continue
  const { site, name } = entrySiteName(raw)
  if (site !== sSite) continue
  if (domain === undefined && raw.domain !== undefined) domain = raw.domain
  if (!cmdFound && sCmd.length > 0 && (name === sCmd || (typeof name === 'string' && (name.startsWith(sCmd + '/') || name.startsWith(sCmd + ' '))))) {
    cmdFound = true
    access = raw.access
  }
}
check('命令在册且为只读', cmdFound && access === 'read', cmdFound ? `access=${String(access)}(只读纪律:演练只采不写,同 canary 只读门)` : `清单内找不到 ${sSite} ${sCmd}`)
if (!(cmdFound && access === 'read')) finish(2)
// 域名解析(fallbackDomain 三级链,同 src/index.ts:4928 生产调用点):adapterList → cli-manifest.json
// 权威补位 → 站名推测(仅 manifest 在册缺域名的站,speculative 标注)。0.1.5 C3 复核②:修前本
// 检查只看 adapterList 域名,CLI 2.0.x 清单零 domain 字段恒 null——演练因生产已修掉的同一根因
// 假阴性,9/9 复验前必须与生产同源。
fr = fallbackDomainReplica(sSite)
domain = fr.domain
speculative = fr.speculative === true
check('站点域名可解析(兜底路由前提:adapterList/manifest/推测三级链)', domain !== null, domain !== null ? `${domain}${speculative ? '(推测域名,manifest 缺该站域名)' : ''} · 源=${fr.source}` : (fr.reason ?? '未知'))

// ── ②基线真实采集(漂移只在成功采集时记签名;命令本身失败=现实里也触发不了兜底) ──
console.log(`[drill] 基线采集:opencli ${normCmd}`)
base = run(normCmd.split(/\s+/), 60_000, 1_048_576)
const baseOk = base.exitCode === 0
baseCount = baseOk ? countStructuredItems(base.stdout) : null
check('基线采集成功', baseOk, baseOk ? `${base.stdout.length}B` : `exit ${base.exitCode}:${head(base.stderr, 160)}(硬失败不进兜底,演练无对象)`)
if (!baseOk) finish(1)

// ── ③构造连续 3 次结构突变场景 + 判定验证 ────────────────────────
if (baseCount !== null && baseCount >= 4) {
  // 条目骤降口径:尾部 3 次迁移逐次腰斩(src/diffsnap.ts:203 isShrink;floor(n/2)≤n/2 恒成立)
  const s = [baseCount]
  for (let i = 0; i < 3; i++) s.push(Math.floor(s[s.length - 1] / 2))
  mode = 'shrink'
  samples = s.map((items) => ({ items, structured: true }))
} else if (baseCount !== null) {
  // 条目太少腰斩不出 3 连(或 0 条):结构翻转口径——结构化基线后连续 3 次非结构化
  mode = 'flip'
  samples = [{ items: baseCount, structured: true }, { items: null, structured: false }, { items: null, structured: false }, { items: null, structured: false }]
}
check('漂移场景可构造(需结构化基线)', mode !== 'none', mode === 'none'
  ? '该命令输出非结构化 JSON,漂移判定现实中不会触发(两种口径都要求结构化基线,diffsnap.ts:212)——换输出 JSON 的只读命令重跑'
  : `${mode} 序列:${JSON.stringify(samples.map((s) => s.items ?? '非结构化'))}`)
trips = mode !== 'none' ? detectDrift(samples) : false
check('判定触发(detectDrift=true)', trips, `序列 ${JSON.stringify(samples?.map((s) => s.items ?? '×'))} → ${trips}`)
// 阴性对照:判定不得误报(同口径下这些序列必须不触发)
const half = (n) => Math.floor(n / 2)
neg = {
  平稳序列: baseCount !== null ? detectDrift([{ items: baseCount, structured: true }, { items: baseCount, structured: true }, { items: baseCount, structured: true }, { items: baseCount, structured: true }]) : null,
  回升序列: baseCount !== null && baseCount >= 4 ? detectDrift([{ items: baseCount, structured: true }, { items: half(baseCount), structured: true }, { items: half(baseCount), structured: true }, { items: baseCount, structured: true }]) : null,
  从未结构化: detectDrift([{ items: null, structured: false }, { items: null, structured: false }, { items: null, structured: false }, { items: null, structured: false }]),
}
check('判定鉴别(阴性对照全不触发)', neg.平稳序列 === false && neg.从未结构化 === false && (neg.回升序列 === null || neg.回升序列 === false), JSON.stringify(neg))

// ── ④兜底采集真机行使(序列与验收判据逐条对齐 driftFallbackCollect,src/index.ts:5085-5101) ──
if (!(typeof domain === 'string' && domain.length > 0)) {
  fb.note = (fr !== null && typeof fr.reason === 'string' && fr.reason.length > 0) ? fr.reason : '适配器清单无该站点域名' // 真实路径同款如实失败(src/index.ts:4932)
} else {
  fb.executed = true
  sess = `drift-drill-${Date.now()}`
  console.log(`[drill] 兜底采集:browser open/state/close,session=${sess},domain=${domain}`)
  try {
    const o = run(bform(['open', `https://${domain}`], sess), 60_000, 1_048_576)
    fb.open = { exitCode: o.exitCode, head: head(o.stderr || o.stdout, 120) }
    if (o.exitCode !== 0) {
      fb.note = `open https://${domain} 失败:${head(o.stderr || o.stdout, 80)}`
    } else {
      const st = run(bform(['state'], sess), 60_000, 1_048_576)
      // 取摘录前先脱敏(报告卫生纪律的入口收口):fb 对象会被报告整体序列化,同源原始值
      // 不在 report 里留未洗副本——与 receipt.fallback.stdout(281 行)同口径
      fb.state = { exitCode: st.exitCode, bytes: st.stdout.length, head: head(scrubReport(st.stdout), 200) }
      // 验收判据与 src/index.ts:4796 逐字一致:state exit 0 且 stdout 非空
      fb.ok = st.exitCode === 0 && st.stdout.trim().length > 0
      if (fb.ok) { fb.bytes = st.stdout.length; fb.stdoutHead = head(scrubReport(st.stdout), 400) }
      else fb.note = `state 失败:${head(st.stderr || st.stdout, 80)}`
    }
  } catch (e) {
    fb.note = head(e instanceof Error ? e.message : 'browser 原语异常', 80)
  } finally {
    // 有界清理:兜底会话开的窗口用完即关,单条命令、失败忽略(镜像 src/index.ts:4805)
    if (fb.open !== null && fb.open.exitCode === 0) {
      const c = run(bform(['close'], sess), 60_000, 262_144)
      fb.close = { exitCode: c.exitCode, head: head(c.stderr || c.stdout, 120) }
      if (c.exitCode !== 0) console.log(`  WARN close 非零退出(清理尽力而为,不计 FAIL):${fb.close.head}`)
    }
  }
}
check('兜底采集成功(open+state 同判据)', fb.ok, fb.ok ? `${fb.bytes}B 页面状态` : fb.note || '未知')

// ── ⑤产出:degraded 回执(演练形)+ 事件记录(演练文本,不写台账) ────
// 真实路径里回执是触发那次运行的适配器回执加 degraded 标(src/index.ts:4662),此处只产出
// 兜底侧新增的字段,不臆造其余字段
if (fb.ok) {
  receipt = { degraded: true, fallback: { via: 'browser open + state', domain, bytes: fb.bytes, stdout: scrubReport(fb.stdoutHead), ...(speculative ? { speculative: true } : {}) } }
}
// 事件文本与 src/index.ts:4917/4948/4953 逐字同形(演练记录——仅供比对真实事件形状)
events = [{ kind: 'adapter-drift', text: `⚠ ${siteCmd} 疑似适配器坏/灰度漂移:连续 3 次结果结构突变(条目骤降/结构翻转)——自动接 browser_* 原语兜底采集` }]
events.push(fb.ok
  ? { kind: 'adapter-drift-fallback', text: `🛟 ${siteCmd} 漂移兜底成功:browser_* 原语采集了 ${domain}${speculative ? '(推测域名,manifest 缺该站域名——近似口径里再打一层折扣)' : ''} 首页页面状态(degraded,已并入本次快照);适配器恢复前数据为近似口径` }
  : { kind: 'adapter-drift-fallback', text: `🛟 ${siteCmd} 漂移兜底失败:${fb.note}——不伪造数据;建议人工 browser open 该站验证或等适配器修复` })

// ── ⑥真实台账只读对照(演练零写入,历史次数仅作观测基线) ──────────
const evFile = path.join(os.homedir(), '.dsh', 'opencli-events.jsonl')
observedLive = { file: fs.existsSync(evFile) ? evFile : null, 'adapter-drift': 0, 'adapter-drift-fallback': 0 }
for (const f of [evFile, evFile + '.1']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n')) {
    try { const j = JSON.parse(line); if (j.kind === 'adapter-drift') observedLive['adapter-drift']++; if (j.kind === 'adapter-drift-fallback') observedLive['adapter-drift-fallback']++ } catch { /* 跳过坏行 */ }
  }
}

// ── 汇总输出 ─────────────────────────────────────────────────────
function finish(code) {
  const pass = checks.filter((c) => c.pass).length
  const report = {
    tool: 'fallback-drill', at: new Date().toISOString(), siteCmd, sSite, sCmd, session: sess,
    cli: { desc: cli.desc, major: major ?? null }, adapter: { domain: domain ?? null, access: access ?? null, source: fr !== null && typeof fr.source === 'string' ? fr.source : null, speculative },
    baseline: { exitCode: base?.exitCode ?? null, itemCount: baseCount, structured: baseCount !== null },
    scenario: { mode, samples, trips, negativeControls: neg },
    fallback: fb, receipt, events, observedLive, checks,
    boundaries: [
      'driftHistory 为面板进程内存态,外部不可注入——演练=触发判定(构造序列+纯函数复刻)+兜底采集(真实 browser_* 序列)两段,不经 schedule tick 全链(tick 内接线由单元测试覆盖)',
      '事件台账零写入:events 数组是演练文本,不追加 ~/.dsh/opencli-events.jsonl',
      '会话名 drift-drill-<ts> 与生产兜底 drift-<ts> 可区分;多账号边界与生产一致(不走 profile)',
    ],
  }
  report.verdict = code === 0 ? `FALLBACK-DRILL PASS (${pass}/${checks.length})` : `FALLBACK-DRILL FAIL (${pass}/${checks.length})`
  // 出报告统一闸:递归洗 report 里所有字符串值(stdout 打印与 --out 落盘同一份对象)——
  // fallback.state.head/stdoutHead 之外,checks.detail/events 文本里的 stderr 摘录等原始衍生值
  // 同过一道,与脚本头声明「出报告前过 scrubLocalPaths(SCRUB_RULES 全量)」对齐。
  // 必须逐字段洗值而非洗序列化文本:scrubReport 的路径规则吞尾随可打印 ASCII(含引号),
  // 洗整段 JSON 会吃掉字符串收口引号产出非法 JSON(桩 CLI 演练实测复现后改为值级)
  const scrubValue = (v) => {
    if (typeof v === 'string') return scrubReport(v)
    if (Array.isArray(v)) return v.map(scrubValue)
    if (v !== null && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = scrubValue(v[k]); return o }
    return v
  }
  const clean = scrubValue(report)
  console.log('\n' + JSON.stringify(clean, null, 1))
  if (outFile) { fs.writeFileSync(path.resolve(outFile), JSON.stringify(clean, null, 2)); console.log(`报告已存:${path.resolve(outFile)}`) }
  console.log(report.verdict)
  process.exit(code)
}
finish(checks.every((c) => c.pass) ? 0 : 1)
