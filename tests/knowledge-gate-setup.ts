/**
 * vitest globalSetup 首位门禁(D#10):知识卡 ⇄ 本机 CLI manifest 双向 diff,漂移即整轮拒跑。
 * 挂在 globalSetup 数组第一位——先于 lib 陈旧守卫、先于任何用例文件执行(vitest 的用例文件
 * 调度按历史耗时/失败排序且多 worker 并行,文件名前缀做不到"首位",globalSetup 才是)。
 * 判定逻辑见 tests/knowledge-gate.ts(纯函数,单测 tests/knowledge-gate.test.ts 另行覆盖)。
 * 找不到 manifest(未装 OpenCLI CLI 的环境)→ 打印 SKIP 原因不拦截;找得到即漂移零容忍。
 */
import type { GlobalSetupContext } from 'vitest/node'
import { readFileSync } from 'node:fs'
import { diffKnowledge, driftLines, loadKnowledgeCards, locateManifest, summarizeManifest } from './knowledge-gate.ts'

export function setup({ provide }: GlobalSetupContext): void {
  const loc = locateManifest()
  if (loc === null) {
    // 不假红:门禁无从比对时如实告知未执行(CI 可设 DSH_OPENCLI_MANIFEST 指定 manifest 强制执行)
    console.warn('[knowledge-gate] SKIP:未找到 @jackwener/opencli 的 cli-manifest.json(本地依赖/全局前缀/DSH_OPENCLI_MANIFEST 均未命中),知识卡漂移门禁本轮未执行')
    provide('knowledgeGate', 'skip')
    return
  }
  const m = summarizeManifest(JSON.parse(readFileSync(loc.path, 'utf8')))
  const { pitfalls, health } = loadKnowledgeCards()
  const lines = driftLines(diffKnowledge(m, pitfalls, health))
  if (lines.length > 0) {
    throw new Error(`[knowledge-gate] 知识卡与 CLI manifest 漂移(${loc.via}:${m.sites.size} 站/${m.commands} 命令)——先修 knowledge/*.json 再测试:\n  - ${lines.join('\n  - ')}`)
  }
  console.log(`[knowledge-gate] PASS:knowledge/*.json ⇄ manifest(${loc.via},${m.sites.size} 站/${m.commands} 命令)无漂移`)
  provide('knowledgeGate', 'pass')
}

declare module 'vitest' {
  export interface ProvidedContext {
    knowledgeGate: 'pass' | 'skip'
  }
}
