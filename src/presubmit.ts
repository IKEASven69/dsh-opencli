/**
 * 对外提交预检(纯函数层):隐私泄露 / 内部词 / 数字声明清单 / 删除事实检测 / 声明复核对账。
 * 由 2026-10-19 PR #8007 内容三重失真事故催生:
 * 流程合规(逐字过审)仍翻车——人(和 AI)的"我检查过了"不可信,只有当场可复现的机检可信。
 * 使用方:仓库内预检 CLI(pr-gate.cjs,扫 PR 文本与 diff);tests/presubmit.test.ts 用 #8007 真实文本回归。
 * @module dsh-opencli/presubmit
 */

export interface Finding {
  /** 规则名(如 本机路径/会话id/内部词) */
  rule: string
  /** 命中片段(截断展示) */
  hit: string
  /** 上下文(命中处前后各 ~24 字) */
  context: string
  /** FAIL=禁止提交;WARN=需人工裁决后放行 */
  level: 'FAIL' | 'WARN'
}

const clipHit = (s: string): string => (s.length > 60 ? s.slice(0, 60) + '…' : s)
const ctxOf = (text: string, idx: number): string => text.slice(Math.max(0, idx - 24), idx + 36).replace(/\n/g, '⏎')

/** 隐私泄露扫描(全部 FAIL 级):本机身份/路径、会话与任务 id、token、邮箱、内部工件 URL。 */
export function scanPrivacy(text: string): Finding[] {
  const out: Finding[] = []
  const rules: Array<[string, RegExp, 'FAIL']> = [
    // 本机 Windows 用户名——对外内容出现即身份泄露(注意小数/长数字误报,用前后非数字边界);// 拼接构造:发布产物不含明文
    ['本机用户名', new RegExp('(?<![\\d.])' + '203' + '69' + '(?![\\d.])', 'g')],
    ['本机路径', new RegExp('(?:[A-Za-z]:[\\\\/](?:Users[\\\\/]' + '203' + '69' + '|CodingProjects|CodingSoftware)|~\\/\\.vfox|\\/c\\/Users\\/' + '203' + '69)', 'gi')],
    ['会话id', /\bsess_[A-Za-z0-9-]{8,}\b/g],
    ['子代理id', /\bagent_[A-Za-z0-9-]{8,}\b/g],
    ['工作流运行id', /\bdwfrun-[A-Za-z0-9-]{6,}\b/g],
    ['工具调用id', /\bcall_[A-Za-z0-9]{16,}\b/g],
    // 经典 PAT(ghp_ 族) + 细粒度 PAT(github_pat_,2022 起现行格式,安全审查实证漏网)
    ['token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/g],
    // TLD 上限 24(现行最长 TLD 实际值;此前 {2,6} 漏掉 .technology/.international 等安全审查实证)
    ['邮箱', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g],
    ['会话工件CDN', /maas-log-prod|ufileos\.com\/anthropic/g],
    // 尾部分隔符可省(行尾 "~/.zcode" 形态);大小写不敏感(安全审查实证小写路径漏网)
    ['内部目录', /[\\/]\.zcode(?![A-Za-z0-9])|[\\/]\.agents(?![A-Za-z0-9])/gi],
  ]
  for (const [rule, re] of rules) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      out.push({ rule, hit: clipHit(m[0]), context: clipHit(ctxOf(text, m.index)), level: 'FAIL' })
    }
  }
  return out
}

/** 内部词扫描(纪律 §2 措辞项):过程词/内部代号外流即 FAIL;AI 工具痕迹 WARN(对方会看出 AI 生成)。 */
export function scanInternalWords(text: string): Finding[] {
  const out: Finding[] = []
  const fails: Array<[string, RegExp]> = [
    ['优先级编号', /\bP[012]\b(?![-\w])/g],
    ['过程词:子代理', /子代理|subagent(?!s\.org)/g],
    ['过程词:审查轮', /审查轮|评审轮|走查发现|独立评审|复核轮/g],
    ['过程词:轮次', /本轮|跨夜轮|真机轮|实机轮/g],
    ['内部引用', /姊妹仓|内部文档库|docs库/g],
  ]
  const warns: Array<[string, RegExp]> = [
    ['AI工具痕迹(WARN)', /ZCode|zcode|GLM-4|GLM-5|Claude|GPT-|Anthropic/g],
  ]
  for (const [rule, re] of fails) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      out.push({ rule, hit: m[0], context: clipHit(ctxOf(text, m.index)), level: 'FAIL' })
    }
  }
  for (const [rule, re] of warns) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      out.push({ rule, hit: m[0], context: clipHit(ctxOf(text, m.index)), level: 'WARN' })
    }
  }
  return out
}

export interface NumberClaim {
  /** 提取到的数字声明(如 "180+"、"282") */
  claim: string
  /** 出现处的上下文 */
  context: string
}

/** 数字声明清单(#8007 直接教训):提取所有对外数字,逐个要求附"当场复现命令"才能放行。
 *  本函数只负责"一个不漏地列出来"——复现命令由提交人填写,机检不做也不信自动核实。 */
export function extractNumberClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = []
  const seen = new Set<string>()
  // 带 + 或中文单位或测试/百分比语境的数字声明(纯版本号 0.4.4 / issue 号 #8007 / 日期不算)
  const re = /(\d[\d,]*\s*\+|\b\d[\d,]*\s*(?:站|个站|个适配器|命令|条|次|测试|tests?|sites?|adapters?|stars?|%))/g
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue
    const ctx = clipHit(ctxOf(text, m.index))
    const key = m[0] + '@' + ctx
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ claim: m[0].trim(), context: ctx })
  }
  return out
}

/** 删除事实检测:diff 的删除行里含前提/依赖/安装类事实词 → 逐条要求显式理由(不许"顺手润色"掉)。 */
export function detectDeletedFacts(diffText: string): Finding[] {
  const out: Finding[] = []
  const factRe = /requires?|prerequisite|需要|安装前提|依赖|npm i|安装:|前置|through\s+opencli|browser\s*bridge|浏览器扩展/gi
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('-') || line.startsWith('---')) continue
    const m = line.match(factRe)
    if (m === null) continue
    out.push({ rule: '删除行含事实内容', hit: clipHit(line.slice(1, 121)), context: '', level: 'WARN' })
  }
  return out
}

/** 汇总判定:任一 FAIL → 不许提交;WARN/数字清单 → 逐条人工裁决留痕后放行。 */
export function verdict(findings: Finding[], numbers: NumberClaim[]): { pass: boolean; failN: number; warnN: number; numberN: number } {
  const failN = findings.filter((f) => f.level === 'FAIL').length
  return { pass: failN === 0, failN, warnN: findings.length - failN, numberN: numbers.length }
}

// ---------------------------------------------------------------------------
// 对外声明逐条机器复核(release 打假自查,借鉴开源社区「false-advertising sweep」实践)
// ---------------------------------------------------------------------------

/** 声明复核记录的一行:提交人当场跑复现命令后填写,一条对外声明一行。 */
export interface ClaimRecord {
  /** 声明原文(与对外文本中的写法一致,建议带单位,如 "170+ 站") */
  claim: string
  /** 当场复现命令 */
  command: string
  /** 复现命令的当场输出摘录——只摘支撑本条声明的那个数,别把整段输出贴进来 */
  output: string
  /** 复核日期 YYYY-MM-DD */
  date: string
}

/**
 * 解析声明复核记录(markdown 表格,列序:声明 | 复现命令 | 当场输出 | 日期)。
 * 表头与分隔行自动跳过;单元格内的管道符写作 `\|`(复现命令里常见 `cmd \| node -e …`)。
 */
export function parseClaimLedger(text: string): ClaimRecord[] {
  const out: ClaimRecord[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    // 只在未转义的 | 处切分,再把 \| 还原成 |
    const cells = t.replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
    if (cells.length < 4) continue
    if (/^:?-{3,}:?$/.test(cells[0])) continue // 分隔行
    if (cells[0] === '声明' || /^claim$/i.test(cells[0])) continue // 表头
    out.push({ claim: cells[0], command: cells[1], output: cells[2], date: cells[3] })
  }
  return out
}

/** 名词夸大黑名单(#8007 第三条失真:轨迹回放被写成「录屏回放」)——对外文本出现即 FAIL,附准确说法。 */
const INFLATED_TERMS: Array<[RegExp, string]> = [
  [/录屏回放|录屏/g, '轨迹回放(trace replay)——本插件不录屏'],
  [/screen[- ]?record(?:ing)?\s+replay/gi, 'trace replay——本插件不录屏'],
]

/** 能力名词夸大扫描(不依赖复核记录,始终执行):命中即 FAIL。 */
export function scanInflatedTerms(text: string): Finding[] {
  const out: Finding[] = []
  for (const [re, fix] of INFLATED_TERMS) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      out.push({ rule: `名词夸大(应为:${fix})`, hit: m[0], context: clipHit(ctxOf(text, m.index)), level: 'FAIL' })
    }
  }
  return out
}

/** 去空白与千分位,作声明匹配键("1,200 +" ≡ "1200+")。 */
const claimKey = (s: string): string => s.replace(/[\s,]/g, '')

/** 声明里的数:"170+" → {n:170, atLeast:true};"1,225 命令" → {n:1225, atLeast:false};无数 → null。 */
const claimNumber = (claim: string): { n: number; atLeast: boolean } | null => {
  const m = claim.match(/(\d[\d,]*)\s*(\+)?/)
  if (m === null) return null
  return { n: Number(m[1].replace(/,/g, '')), atLeast: m[2] === '+' }
}

/** 可识别的声明单位(取自复核记录的声明列;用于在输出摘录里只认同单位的数)。 */
const CLAIM_UNITS = ['站', '命令', '测试', '用例', '条', '次', '%', 'site', 'command', 'test', 'star', 'adapter', '适配器']
const unitOf = (s: string): string | null => {
  const low = s.toLowerCase()
  return CLAIM_UNITS.find((u) => low.includes(u)) ?? null
}

/** 输出摘录中的数;给了单位时只取紧跟该单位的数("171 站"/"171 个站"/"171 sites")。 */
const numbersIn = (s: string, unit: string | null): number[] => {
  const low = s.toLowerCase()
  const out: number[] = []
  for (const m of s.matchAll(/\d[\d,]*/g)) {
    if (m.index === undefined) continue
    const n = Number(m[0].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (unit === null) { out.push(n); continue }
    const after = low.slice(m.index + m[0].length).replace(/^[\s+个]*/, '')
    if (after.startsWith(unit)) out.push(n)
  }
  return out
}

/**
 * 对外声明逐条机器复核:对外文本里的每条数字声明都必须在复核记录里有对应行,并通过三项对账——
 * ①覆盖:声明找不到记录 → FAIL「声明未复核」;
 * ②完整:记录缺复现命令/当场输出/合法日期 → FAIL「复核记录不完整」;
 * ③数值一致:当场输出里的数必须支撑声明——"N+" 要求有 ≥N 的数,精确数要求原数出现;
 *   声明可识别出单位时(站/命令/测试/条…),只认输出摘录里**同单位的数**("171 站"),裸数与
 *   异单位数都不算——"200+ 站"不能拿"1225 命令"的输出撑数(#8007:宣称 180+ 站、manifest 实为
 *   170 站这类失真,机器当场可抓);输出摘录请写成"数+单位"的形态(如 "sites: 171 站")。
 *   这把 #8007「宣称 180+、manifest 实为 170」变成机器当场可抓的不一致。
 * 另:记录里有、文本里已无的声明 → WARN「复核记录多余」(记录陈旧,提醒同步)。
 * 边界(如实):本函数**不执行**复现命令(任意命令执行既不安全也依赖环境),只做以上对账;
 * 记录须由提交人当场跑命令产出——记录本身是否如实填写,机检无从判断,仍须人看。
 */
export function reconcileClaims(numbers: NumberClaim[], ledger: ClaimRecord[]): Finding[] {
  const out: Finding[] = []
  const used = new Set<ClaimRecord>()
  for (const c of numbers) {
    const key = claimKey(c.claim)
    const rec = ledger.find((r) => claimKey(r.claim).includes(key))
    if (rec === undefined) {
      out.push({ rule: '声明未复核', hit: c.claim, context: c.context, level: 'FAIL' })
      continue
    }
    used.add(rec)
    const cn = claimNumber(c.claim)
    if (cn === null) continue
    const unit = unitOf(rec.claim) ?? unitOf(c.claim)
    const pool = unit === null ? numbersIn(rec.output, null) : numbersIn(rec.output, unit)
    const ok = cn.atLeast ? pool.some((n) => n >= cn.n) : pool.includes(cn.n)
    if (!ok) out.push({ rule: '声明与复现输出不符', hit: `${c.claim} ⇐ 输出「${clipHit(rec.output)}」${unit !== null ? `(需含"${unit}"单位的数)` : ''}`, context: c.context, level: 'FAIL' })
  }
  for (const r of ledger) {
    if (r.command.length === 0 || r.output.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      out.push({ rule: '复核记录不完整', hit: clipHit(r.claim), context: '复现命令/当场输出/日期(YYYY-MM-DD)须齐全', level: 'FAIL' })
    }
    if (!used.has(r)) out.push({ rule: '复核记录多余', hit: clipHit(r.claim), context: '文本中已无此声明——记录陈旧,请同步', level: 'WARN' })
  }
  return out
}
