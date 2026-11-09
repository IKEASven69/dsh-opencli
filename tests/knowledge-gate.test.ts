/**
 * 知识卡漂移门禁(D#10)单测:双向 diff 纯函数 + 真实 manifest 对账。
 * 门禁本体挂在 vitest globalSetup 首位(tests/knowledge-gate-setup.ts,漂移即整轮拒跑);
 * 本文件锁定判定逻辑本身——合成夹具逐类构造漂移,确保门禁"能红"而不是恒绿的摆设。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MIN_COMMANDS, MIN_SITES, REQUIRED_CARD_SITES, diffKnowledge, driftLines, loadKnowledgeCards, locateManifest, summarizeManifest } from './knowledge-gate.ts'

/** 合成 manifest:每站 perSite 条命令(命令级平铺数组,与真实 cli-manifest.json 同形)。 */
const fakeManifest = (sites: string[], perSite = 8): unknown[] => sites.flatMap((s) => Array.from({ length: perSite }, (_, i) => ({ site: s, name: `cmd${i}` })))
const filler = (n: number): string[] => Array.from({ length: n }, (_, i) => `site${i}`)

describe('summarizeManifest', () => {
  it('站点去重 + 命令计数;脏条目跳过不抛', () => {
    const m = summarizeManifest([{ site: 'a', name: 'x' }, { site: 'a', name: 'y' }, { site: 'b', name: 'z' }, null, 3, { name: 'no-site' }, { site: '' }])
    expect([...m.sites].sort()).toEqual(['a', 'b'])
    expect(m.commands).toBe(3)
    expect(summarizeManifest({ not: 'array' }).sites.size).toBe(0)
  })
})

describe('diffKnowledge(双向 diff)', () => {
  // 172 站 × 8 = 1376 命令:过对外口径下限,只让被测的那一类漂移出现
  const m = summarizeManifest(fakeManifest([...filler(170), 'zhihu', 'pinduoduo']))
  const okPitfalls = { zhihu: ['x'], pinduoduo: ['y'] }
  const okHealth = { zhihu: { status: 'notice' }, threads: { status: 'unsupported' } }

  it('一致 → 无漂移', () => {
    expect(driftLines(diffKnowledge(m, okPitfalls, okHealth))).toEqual([])
  })
  it('① 卡→manifest:pitfalls 悬空卡(上游改名/下线)报出', () => {
    const d = diffKnowledge(m, { ...okPitfalls, gone: ['z'] }, okHealth)
    expect(d.orphanPitfalls).toEqual(['gone'])
    expect(driftLines(d).join('\n')).toContain('pitfalls.json 悬空卡')
  })
  it('① health 非 unsupported 的悬空卡报出;unsupported 站本就不在 manifest 合法', () => {
    const d = diffKnowledge(m, okPitfalls, { ...okHealth, ghost: { status: 'degraded' } })
    expect(d.orphanHealth).toEqual(['ghost'])
    expect(d.staleUnsupported).toEqual([])
  })
  it('② manifest→卡:health 标 unsupported 但上游已有适配器 → 报出', () => {
    const d = diffKnowledge(m, okPitfalls, { zhihu: { status: 'unsupported' } })
    expect(d.staleUnsupported).toEqual(['zhihu'])
    expect(driftLines(d).join('\n')).toContain('上游已有适配器')
  })
  it('③ 新站缺知识卡 → 报出(pinduoduo 在默认清单里)', () => {
    expect(REQUIRED_CARD_SITES).toContain('pinduoduo')
    const d = diffKnowledge(m, { zhihu: ['x'] }, okHealth)
    expect(d.missingRequired).toEqual(['pinduoduo'])
  })
  it('④ 对外口径下限:站点 <170 或命令 <1200 → 报出', () => {
    const small = summarizeManifest(fakeManifest(['zhihu', 'pinduoduo'], 1))
    const d = diffKnowledge(small, okPitfalls, okHealth)
    expect(d.belowFloor.length).toBe(2)
    expect(driftLines(d).join('\n')).toContain(`< ${MIN_SITES}`)
  })
})

describe('真实对账:仓库 knowledge/*.json ⇄ 本机已装 CLI 的 cli-manifest.json', () => {
  const loc = locateManifest()
  // 找不到 manifest(未装 OpenCLI CLI 的机器)如实 skip,不假红也不假绿
  it.skipIf(loc === null)('无漂移;对外口径下限达标;2.0.3 新站 pinduoduo 已有知识卡', () => {
    const m = summarizeManifest(JSON.parse(readFileSync(loc!.path, 'utf8')))
    const { pitfalls, health } = loadKnowledgeCards()
    expect(driftLines(diffKnowledge(m, pitfalls, health))).toEqual([])
    expect(m.sites.size).toBeGreaterThanOrEqual(MIN_SITES)
    expect(m.commands).toBeGreaterThanOrEqual(MIN_COMMANDS)
    for (const s of REQUIRED_CARD_SITES) {
      expect(m.sites.has(s)).toBe(true)
      expect(Array.isArray(pitfalls[s])).toBe(true)
    }
  })
})
