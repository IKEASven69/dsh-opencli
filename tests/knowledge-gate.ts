/**
 * 知识卡 ⇄ CLI manifest 漂移门禁(D#10)——纯逻辑 + manifest 定位,globalSetup 与单测共用。
 * DSH-Novelist「词库双向 diff 漂移即失败」同款:knowledge/*.json 的站点键与本机已装
 * OpenCLI CLI 的 cli-manifest.json(2.0.3 实测 171 唯一站点 / 1225 命令)双向核对——
 *  ① 卡 → manifest:pitfalls 每个站点、health 中非 unsupported 的站点,必须是 manifest 真实站点
 *     (上游改名/下线后卡片悬空 = 漂移)
 *  ② manifest → 卡:health 标 unsupported(无适配器)的站点必须确实不在 manifest
 *     (上游已加适配器、卡片仍说"不支持" = 漂移)
 *  ③ 新站补卡:REQUIRED_CARD_SITES 每站必须有 pitfalls 卡(2.0.3 新增 pinduoduo)
 *  ④ 对外口径下限:manifest 唯一站点 ≥170、命令 ≥1200——README/npm 描述「170+ 站 / 1200+ 命令」
 *     的事实守卫(对外数字必须当场可机器复现,不靠记忆值)
 * 本文件在 tests/ 下:CI 工具,不进 npm 包(package.json files 只含 lib/knowledge/bin 等)。
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 新站补卡清单:上游新增站点落地时追加。2.0.3 相对 2.0.2 恰增 pinduoduo 一站(171 vs 170)。 */
export const REQUIRED_CARD_SITES: readonly string[] = ['pinduoduo']
/** 对外口径下限(README/npm 描述/面板文案的「170+ 站 / 1200+ 命令」)。 */
export const MIN_SITES = 170
export const MIN_COMMANDS = 1200

export interface ManifestSummary {
  /** 唯一站点集(manifest 条目 site 字段去重) */
  sites: Set<string>
  /** 命令条目数(manifest 数组长度,脏条目不计) */
  commands: number
}

/** manifest(命令级平铺数组,每条 {site,name,...})→ 站点集 + 命令数;非数组/脏条目不抛。 */
export function summarizeManifest(raw: unknown): ManifestSummary {
  const sites = new Set<string>()
  let commands = 0
  if (!Array.isArray(raw)) return { sites, commands }
  for (const e of raw) {
    if (e === null || typeof e !== 'object') continue
    const site = (e as { site?: unknown }).site
    if (typeof site !== 'string' || site.length === 0) continue
    sites.add(site)
    commands++
  }
  return { sites, commands }
}

export interface KnowledgeDrift {
  /** ① pitfalls 卡的站点不在 manifest */
  orphanPitfalls: string[]
  /** ① health 卡(非 unsupported)的站点不在 manifest */
  orphanHealth: string[]
  /** ② health 标 unsupported 的站点却已出现在 manifest */
  staleUnsupported: string[]
  /** ③ 新站清单里缺 pitfalls 卡的站点 */
  missingRequired: string[]
  /** ④ 对外口径下限未达标的说明 */
  belowFloor: string[]
}

/** 双向 diff(纯函数):输入全部显式,返回各类漂移明细;全空=无漂移。 */
export function diffKnowledge(
  m: ManifestSummary,
  pitfalls: Record<string, unknown>,
  health: Record<string, { status?: unknown }>,
  required: readonly string[] = REQUIRED_CARD_SITES,
): KnowledgeDrift {
  const orphanPitfalls = Object.keys(pitfalls).filter((s) => !m.sites.has(s)).sort()
  const orphanHealth: string[] = []
  const staleUnsupported: string[] = []
  for (const [s, h] of Object.entries(health)) {
    const unsupported = h !== null && typeof h === 'object' && h.status === 'unsupported'
    if (unsupported && m.sites.has(s)) staleUnsupported.push(s)
    if (!unsupported && !m.sites.has(s)) orphanHealth.push(s)
  }
  const missingRequired = required.filter((s) => !Object.prototype.hasOwnProperty.call(pitfalls, s))
  const belowFloor: string[] = []
  if (m.sites.size < MIN_SITES) belowFloor.push(`唯一站点 ${m.sites.size} < ${MIN_SITES}(对外「170+ 站」口径失真)`)
  if (m.commands < MIN_COMMANDS) belowFloor.push(`命令 ${m.commands} < ${MIN_COMMANDS}(对外「1200+ 命令」口径失真)`)
  return { orphanPitfalls, orphanHealth: orphanHealth.sort(), staleUnsupported: staleUnsupported.sort(), missingRequired, belowFloor }
}

/** 漂移明细 → 人类可读行(空数组=无漂移);门禁报错与单测断言共用同一份文案。 */
export function driftLines(d: KnowledgeDrift): string[] {
  const out: string[] = []
  if (d.orphanPitfalls.length > 0) out.push(`pitfalls.json 悬空卡(站点不在 manifest):${d.orphanPitfalls.join(', ')}`)
  if (d.orphanHealth.length > 0) out.push(`health.json 悬空卡(站点不在 manifest):${d.orphanHealth.join(', ')}`)
  if (d.staleUnsupported.length > 0) out.push(`health.json 标 unsupported 但上游已有适配器:${d.staleUnsupported.join(', ')}`)
  if (d.missingRequired.length > 0) out.push(`新站缺知识卡:${d.missingRequired.join(', ')}`)
  out.push(...d.belowFloor)
  return out
}

/** 包根定位:从入口文件向上找 name=@jackwener/opencli 的 package.json 所在目录。 */
function packageRootOf(entry: string): string | null {
  let dir = dirname(entry)
  for (let i = 0; i < 8; i++) {
    const pj = join(dir, 'package.json')
    if (existsSync(pj)) {
      try {
        if ((JSON.parse(readFileSync(pj, 'utf8')) as { name?: string }).name === '@jackwener/opencli') return dir
      } catch { /* 坏 package.json:继续向上 */ }
    }
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

/**
 * manifest 定位(级联,命中即返回):
 *  ① env DSH_OPENCLI_MANIFEST(CI 钉版本用)
 *  ② require.resolve('@jackwener/opencli') → 包根 → cli-manifest.json(本地依赖)
 *  ③ 全局前缀:dirname(execPath)/node_modules(Windows/vfox 布局)与 ../lib/node_modules(unix 布局)
 * 全部未命中返回 null——调用方据此 skip 并点名原因(装不上 CLI 的机器不假红)。
 */
export function locateManifest(): { path: string; via: string } | null {
  const envPath = process.env.DSH_OPENCLI_MANIFEST
  if (envPath !== undefined && envPath.length > 0 && existsSync(envPath)) return { path: envPath, via: 'env DSH_OPENCLI_MANIFEST' }
  try {
    const entry = createRequire(import.meta.url).resolve('@jackwener/opencli')
    const root = packageRootOf(entry)
    if (root !== null && existsSync(join(root, 'cli-manifest.json'))) return { path: join(root, 'cli-manifest.json'), via: "require.resolve('@jackwener/opencli')" }
  } catch { /* 无本地依赖:回落全局 */ }
  const bin = dirname(process.execPath)
  for (const base of [join(bin, 'node_modules'), join(bin, '..', 'lib', 'node_modules')]) {
    const p = join(base, '@jackwener', 'opencli', 'cli-manifest.json')
    if (existsSync(p)) return { path: p, via: `global ${base}` }
  }
  return null
}

/** 仓库知识卡读取(相对本文件定位 knowledge/,与 src/knowledge.ts 同源 JSON)。 */
export function loadKnowledgeCards(): { pitfalls: Record<string, unknown>; health: Record<string, { status?: unknown }> } {
  const dir = join(import.meta.dirname, '..', 'knowledge')
  return {
    pitfalls: JSON.parse(readFileSync(join(dir, 'pitfalls.json'), 'utf8')) as Record<string, unknown>,
    health: JSON.parse(readFileSync(join(dir, 'health.json'), 'utf8')) as Record<string, { status?: unknown }>,
  }
}
