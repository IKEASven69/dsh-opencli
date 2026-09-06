// IntelHub 真库压测:knowledge-base 全量(精选+全集 ~6000 篇)真实索引
// 验收:总耗时/内存/检索延迟/真实问题命中/增量跳过正确性
import { mkdtemp, mkdir, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const CORPUS = 'D:/CodingProjects/knowledge-base/collections'
const home = await mkdtemp(join(tmpdir(), 'intelhub-stress-'))
process.env.DSH_ZVECKB_HOME = home

// 复用已缓存模型,避免重复下载
const caches = [
  'D:/CodingProjects/dsh-plugin/spikes/zvec-kb/node_modules/@huggingface/transformers/.cache',
  'C:/Users/20369/.dsh/dsh-zvec-kb/hf-cache',
]
for (const c of caches) {
  if (existsSync(c)) {
    await mkdir(join(home, 'hf-cache'), { recursive: true })
    await cp(c, join(home, 'hf-cache'), { recursive: true }).catch(() => {})
    console.log('model cache copied from', c)
    break
  }
}

const { ZvecKbService } = await import('../lib/index.js')
const { Context, Service } = await import('@deepseek-ai/cordis')
class StubTools extends Service { constructor(c) { super(c, 'tools') } register() {} }
class StubPrompt extends Service { constructor(c) { super(c, 'systemPrompt') } section() {} }
const ctx = new Context()
await ctx.plugin(StubTools); await ctx.plugin(StubPrompt); await ctx.plugin(ZvecKbService)
const svc = ctx.zvecKb

const t0 = performance.now()
const imp = await svc.importPath(CORPUS)
console.log(`[queue] ${imp.queued} files queued in ${((performance.now() - t0) / 1000).toFixed(1)}s | failedScan: ${JSON.stringify(imp.failedScan)}`)

// 活性日志:每 30s 报告进度
let lastDone = -1
const timer = setInterval(async () => {
  const l = await svc.listFiles().catch(() => null)
  if (l === null) return
  const done = l.files.filter((f) => f.status === 'done').length
  const failed = l.files.filter((f) => f.status === 'failed').length
  const elapsed = ((performance.now() - t0) / 1000).toFixed(0)
  if (done + failed !== lastDone) {
    lastDone = done + failed
    const rss = Math.round(process.memoryUsage().rss / 1048576)
    console.log(`[progress ${elapsed}s] done=${done} failed=${failed} pending=${l.indexing} RSS=${rss}MB`)
  }
}, 30000)

const t1 = performance.now()
await svc.drain()
clearInterval(timer)
const indexSec = (performance.now() - t1) / 1000

const st = await svc.statusInfo()
const l = await svc.listFiles()
const failed = l.files.filter((f) => f.status === 'failed')
console.log(`\n=== 索引完成 ===`)
console.log(`总耗时 ${indexSec.toFixed(0)}s | 文件 ${st.files} | 块 ${st.chunks} | 均摊 ${(indexSec / Math.max(st.files, 1)).toFixed(2)}s/文件`)
console.log(`失败 ${failed.length}${failed.length ? ': ' + failed.slice(0, 5).map((f) => f.path.split(/[\\/]/).pop() + '(' + f.error?.slice(0, 40) + ')').join(' | ') : ''}`)
console.log(`RSS ${Math.round(process.memoryUsage().rss / 1048576)}MB`)

// 真实问题检索(来自真实收藏内容)
console.log('\n=== 真实问题检索 ===')
const queries = [
  'Claude Code 被指给中国用户打水印',
  '内容付费的悖论是什么',
  'Astra 模型更冷静不谄媚',
  'Skills 分发是不是新的包管理器',
  '韩国年轻人流行的多巴胺网站',
  '一人公司需要产品杠杆',
]
for (const q of queries) {
  const t = performance.now()
  const r = await svc.search(q, 5)
  const ms = (performance.now() - t).toFixed(0)
  console.log(`  ${String(ms).padStart(5)}ms | ${r.hits[0]?.ref.split(/[\\/]/).pop() ?? '-'} | ${q}`)
}

// 增量正确性:全量重导入应全部跳过
console.log('\n=== 增量重导入(hash 校验)===')
const t2 = performance.now()
const re = await svc.importPath(CORPUS)
console.log(`queued=${re.queued} skipped=${re.skippedUnchanged}(${((performance.now() - t2) / 1000).toFixed(1)}s 全部跳过为正确)`)

svc.shutdown()
console.log('\nSTRESS DONE', home)
