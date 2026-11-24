// rpc-bench:0.2.0 性能包基线(F)——包前实测,包后复测同一脚本对比。
// 五项:①--version spawn ②daemon status spawn ③事件档整读+逐行 parse
// ④schedule-history 读放大复现(JSON.parse 全文 vs statSync 取尺寸,PF1 现场对照)
// ⑤state.json 全量 stringify 单次耗时 + adapters 单页 spawn 估冷构建。
// 只读,不改任何状态;输出 JSON 到 stdout(供 PLAN-0.2.0.md §三 引用)。
'use strict'
const { execFileSync } = require('node:child_process')
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const os = require('node:os')

const CLI = process.env.DSH_OPENCLI_BIN || 'opencli'
// Windows shim(opencli)非 .exe,execFileSync 直启 ENOENT——与 daemon 同款走 node+main.js 直启
const MAIN_JS = 'C:\\Users\\20369\\.vfox\\sdks\\nodejs\\node_modules\\@jackwener\\opencli\\dist\\src\\main.js'
const spawnArgs = (args) => ['opencli'.length > 0 && CLI === 'opencli' ? process.execPath : CLI, ...(CLI === 'opencli' ? [MAIN_JS] : []), ...args]
const home = os.homedir()
const dsh = join(home, '.dsh')
const t = (ms) => Math.round(ms * 100) / 100
const time = (fn) => { const s = process.hrtime.bigint(); const v = fn(); return { ms: t(Number(process.hrtime.bigint() - s) / 1e6), v } }
const spawnOnce = (args) => time(() => execFileSync(spawnArgs(args)[0], spawnArgs(args).slice(1), { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }))
const median = (arr) => arr.length === 0 ? 0 : arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)]

const out = { at: new Date().toISOString(), cli: CLI, samples: {} }

// ① --version ×5
{ const xs = []; for (let i = 0; i < 5; i++) { try { xs.push(spawnOnce(['--version']).ms) } catch {} } out.samples.version_spawn_ms = { n: xs.length, median: median(xs), all: xs } }

// ② daemon status ×5
{ const xs = []; for (let i = 0; i < 5; i++) { try { xs.push(spawnOnce(['daemon', 'status']).ms) } catch {} } out.samples.daemon_status_spawn_ms = { n: xs.length, median: median(xs), all: xs } }

// ③ 事件档整读+逐行 parse(.1 + 主档,eventsGet 同款)
{
  const files = [join(dsh, 'opencli-events.jsonl.1'), join(dsh, 'opencli-events.jsonl')]
  const r = time(() => {
    let bytes = 0, lines = 0, parsed = 0
    for (const f of files) { let text; try { text = readFileSync(f, 'utf8') } catch { continue } bytes += Buffer.byteLength(text); for (const line of text.split('\n')) { if (line.trim().length === 0) continue; lines++; try { JSON.parse(line); parsed++ } catch {} } }
    return { bytes, lines, parsed }
  })
  out.samples.events_full_read_ms = { ...r.v, ms: r.ms }
}

// ④ schedule-history 读放大复现:state 每任务取快照目录最后 50 份,JSON.parse 全文取 bytes(scheduleHistory 现状)vs statSync(改法),同一批文件双测
{
  let state = {}
  try { state = JSON.parse(readFileSync(join(dsh, 'dsh-opencli-state.json'), 'utf8')) } catch {}
  const ids = (state.schedules ?? []).map((s) => s.id)
  const per = []
  let totalParseMs = 0, totalStatMs = 0, totalFiles = 0, totalBytes = 0
  for (const id of ids) {
    const dir = join(dsh, 'opencli-snapshots', String(id))
    let files = []
    try { files = readdirSync(dir).slice(-50) } catch { continue }
    const r1 = time(() => { let b = 0; for (const f of files) { try { b += JSON.parse(readFileSync(join(dir, f), 'utf8')).bytes ?? 0 } catch {} } return b })
    const r2 = time(() => { let b = 0; for (const f of files) { try { b += statSync(join(dir, f)).size } catch {} } return b })
    totalParseMs += r1.ms; totalStatMs += r2.ms; totalFiles += files.length; totalBytes += r1.v
    per.push({ id, files: files.length, jsonParseMs: r1.ms, statMs: r2.ms })
  }
  out.samples.schedule_history_read = { tasks: per.length, totalFiles, totalBytes, jsonParseWayMs: t(totalParseMs), statWayMs: t(totalStatMs), per }
}

// ⑤ state.json 全量 stringify(单次 saveState 主体成本,写放大观测)
{
  let state
  try { state = readFileSync(join(dsh, 'dsh-opencli-state.json'), 'utf8') } catch {}
  const r = time(() => JSON.stringify(JSON.parse(state), null, 2))
  out.samples.state_json = { bytes: Buffer.byteLength(state), stringifyMs: r.ms }
}

// ⑥ adapters 单页 spawn(opencli list,冷构建一页 ≈ 一次完整 node CLI 启动;×估算 13 页)
{ try { const r = spawnOnce(['list']); out.samples.adapter_list_page_ms = { ms: r.ms, est_full_pagination_ms: t(r.ms * 13 + 13 * 750) } } catch (e) { out.samples.adapter_list_page_ms = { error: String(e).slice(0, 100) } } }

console.log(JSON.stringify(out, null, 1))
