/**
 * 对外提交预检单测:以 2026-10-19 PR #8007 的真实翻车文本做回归——机检器必须能当场抓住那次事故,
 * 否则不配存在(教训记录 docs/LESSON-20261020-registry.md)。
 */
import { describe, expect, it } from 'vitest'
import { scanPrivacy, scanInternalWords, extractNumberClaims, detectDeletedFacts, verdict } from '../src/presubmit.ts'

/** #8007 当时实际提交的条目描述(节选,数字与前提问题原样保留) */
const SUBMITTED_8007 = `description:
  en: Logged-in browser automation with 180+ site adapters as deterministic one-shot commands — action-evidence verification, trace replay, and a write-approval gate.
  zh: 登录态真实浏览器自动化:180+ 站点结构化命令一步到位;执行真实性判定、录屏回放、带出处报告导出;写命令带审批门。`

/** #8007 被我们删掉的旧条目行(安装前提 "through OpenCLI" 在其中) */
const DIFF_8007 = `--- a/data/plugins/IKEASven69__dsh-opencli.yml
+++ b/data/plugins/IKEASven69__dsh-opencli.yml
-  en: Drive your real logged-in browser through OpenCLI — browser primitives plus 170+ site adapters, with a write-approval gate.
-  zh: 经 OpenCLI 操纵登录态真实 Chrome——浏览器原语加 170+ 站点适配器。
+  en: Logged-in browser automation with 180+ site adapters.`

describe('scanPrivacy(隐私泄露全 FAIL)', () => {
  it('本机用户名/路径/会话id/token/邮箱/内部目录逐个命中', () => {
    const t = '路径 C:/Users/20369/.vfox 与 D:\\CodingProjects\\repo,会话 sess_a2fdd4d9-f616-461b,子代理 agent_f59f7e9c,tok ghp_ABCDEFGHIJKLMNOPQRSTUVWX,信箱 a.b@163.com,内部 ~/.zcode/workflows'
    const r = scanPrivacy(t)
    const rules = new Set(r.map((x) => x.rule))
    expect(r.every((x) => x.level === 'FAIL')).toBe(true)
    for (const want of ['本机用户名', '本机路径', '会话id', '子代理id', 'token', '邮箱', '内部目录']) expect(rules.has(want)).toBe(true)
  })
  it('常见数字不误伤 20369 规则(小数/长数字内嵌)', () => {
    expect(scanPrivacy('版本 0.20369 与序号 1203695')).toEqual([])
  })
})

describe('scanInternalWords(过程词 FAIL / AI 痕迹 WARN)', () => {
  it('P0/子代理/审查轮/本轮 命中 FAIL;zcode 命中 WARN', () => {
    const r = scanInternalWords('这是 P0 优先级,由子代理独立评审完成,本轮跨夜轮真机轮,工具 zcode 生成')
    expect(r.filter((x) => x.level === 'FAIL').length).toBeGreaterThanOrEqual(4)
    expect(r.some((x) => x.level === 'WARN' && x.rule.includes('AI工具'))).toBe(true)
  })
})

describe('数字声明清单(#8007 直接教训回归)', () => {
  it('当年提交的 180+ 两处(en/zh)必须一个不漏地被列出待溯源', () => {
    const n = extractNumberClaims(SUBMITTED_8007)
    expect(n.filter((x) => x.claim.startsWith('180'))).toHaveLength(2)
  })
  it('版本号/issue 号/日期不算数字声明', () => {
    expect(extractNumberClaims('版本 v0.4.4,issue #8007,日期 2026-10-19')).toEqual([])
  })
})

describe('detectDeletedFacts(删除事实检测,#8007 回归)', () => {
  it('删除行里的 through OpenCLI 前提必须被拦下要求显式理由', () => {
    const r = detectDeletedFacts(DIFF_8007)
    expect(r.length).toBeGreaterThanOrEqual(1)
    expect(r[0]!.level).toBe('WARN')
    expect(r[0]!.hit).toContain('through OpenCLI')
  })
  it('新增行(+)与文件头(---)不算删除', () => {
    expect(detectDeletedFacts('+ requires nothing\n--- a/x')).toEqual([])
  })
})

describe('verdict 汇总', () => {
  it('任一 FAIL 即 pass=false', () => {
    expect(verdict([{ rule: 'x', hit: '', context: '', level: 'FAIL' }], []).pass).toBe(false)
    expect(verdict([{ rule: 'x', hit: '', context: '', level: 'WARN' }], [{ claim: '170+', context: '' }])).toEqual({ pass: true, failN: 0, warnN: 1, numberN: 1 })
  })
})

describe('安全交叉审查实证的漏网回归(2026-10-20)', () => {
  it('细粒度 PAT github_pat_ 前缀命中(此前整串漏过)', () => {
    const r = scanPrivacy('leak github_pat_11ABcdefGHIjklMNOpqrsTUVwxyZ0123456789_1234567890')
    expect(r.some((x) => x.rule === 'token')).toBe(true)
  })
  it('长 TLD 邮箱命中(.technology/.international)', () => {
    const r = scanPrivacy('a@example.technology b@example.international')
    expect(r.filter((x) => x.rule === '邮箱')).toHaveLength(2)
  })
  it('小写路径与行尾无分隔符的内部目录命中', () => {
    expect(scanPrivacy('moved to C:/codingprojects/foo').some((x) => x.rule === '本机路径')).toBe(true)
    expect(scanPrivacy('see docs in ~/.zcode end').some((x) => x.rule === '内部目录')).toBe(true)
  })
})
