/**
 * vitest globalSetup:lib 捆绑陈旧守卫(测试真实性审查发现 3)——服务级测试跑的是
 * 已提交的 lib/index.js 捆绑产物,改 src 忘重建会静默验证旧捆绑(两路信号自相矛盾却全绿)。
 * 守卫:lib 任一产物 mtime 落后 src 任一源文件即整轮拒跑,报错给出重建命令。
 */
import type { GlobalSetupContext } from 'vitest/node'
import { statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const srcDir = join(import.meta.dirname, '..', 'src')
const libDir = join(import.meta.dirname, '..', 'lib')

const newestMtime = (dir: string, filter: (f: string) => boolean): number => {
  let newest = 0
  for (const f of readdirSync(dir)) {
    if (!filter(f)) continue
    const m = statSync(join(dir, f)).mtimeMs
    if (m > newest) newest = m
  }
  return newest
}

export function setup({ provide }: GlobalSetupContext): void {
  const srcNewest = newestMtime(srcDir, (f) => f.endsWith('.ts'))
  const libNewest = newestMtime(libDir, (f) => f.endsWith('.js'))
  if (libNewest < srcNewest) {
    // 精确到毫秒差,报错自带修复命令(不让人猜)
    throw new Error(`lib 捆绑落后于 src(${(srcNewest - libNewest).toFixed(0)}ms)——先跑 node .build-tools/build.cjs 再测试,否则服务级用例在验证旧捆绑`)
  }
  provide('libFresh', true)
}
