/**
 * 对外提交预检(纯函数层):隐私泄露 / 内部词 / 数字声明清单 / 删除事实检测。
 * 由 2026-10-19 PR #8007 内容三重失真事故催生(教训全记录见 docs/LESSON-20261020-registry.md):
 * 流程合规(逐字过审)仍翻车——人(和 AI)的"我检查过了"不可信,只有当场可复现的机检可信。
 * 使用方:.build-tools/pr-gate.cjs(CLI,扫 PR 文本与 diff);tests/presubmit.test.ts 用 #8007 真实文本回归。
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
    // 20369 是本机 Windows 用户名——对外内容出现即身份泄露(注意小数/长数字误报,用前后非数字边界)
    ['本机用户名', /(?<![\d.])20369(?![\d.])/g],
    ['本机路径', /(?:[A-Za-z]:[\\/](?:Users[\\/]20369|CodingProjects|CodingSoftware)|~\/\.vfox|\/c\/Users\/20369)/g],
    ['会话id', /\bsess_[A-Za-z0-9-]{8,}\b/g],
    ['子代理id', /\bagent_[A-Za-z0-9-]{8,}\b/g],
    ['工作流运行id', /\bdwfrun-[A-Za-z0-9-]{6,}\b/g],
    ['工具调用id', /\bcall_[A-Za-z0-9]{16,}\b/g],
    ['token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
    ['邮箱', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}\b/g],
    ['会话工件CDN', /maas-log-prod|ufileos\.com\/anthropic/g],
    ['内部目录', /[\\/]\.zcode[\\/]|[\\/]\.agents[\\/]/g],
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
