// 0.1.3 自愈/熔断活体观测(闸门③):触发指定任务后轮询 inbox result 与 events.jsonl,
// 报告 daemon-selfheal / circuit-open / daemon-flip 事件与最新任务史行。用法:
//   node .build-tools/selfheal-observe.cjs <taskId>
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const taskId = process.argv[2]
if (!taskId) { console.error('need task id'); process.exit(1) }
const inbox = path.join(os.homedir(), '.dsh', 'opencli-inbox')
const evFile = path.join(os.homedir(), '.dsh', 'opencli-events.jsonl')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const t0 = Date.now()
  // 触发(ctl 写意图,插件 3s 轮询执行)
  const trig = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'dsh-opencli-ctl.cjs'), 'schedule', 'run', '--id', taskId], { encoding: 'utf8', timeout: 60_000 })
  console.log('trigger exit=' + trig.status + ' ' + (trig.stdout || trig.stderr || '').trim().slice(0, 100))
  // 轮询:等 schedule-run 的 result 落盘(自愈链最长 attempts×60s+restart+rerun,给 5 分钟窗)
  let runResult = null
  while (Date.now() - t0 < 300_000 && runResult === null) {
    await sleep(5000)
    const files = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((f) => f.endsWith('.result.json')) : []
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8'))
        if (j.kind === 'schedule-run' && new Date(j.at).getTime() > t0 - 60_000) { runResult = j; break }
      } catch {}
    }
  }
  // 结果落盘后再给事件面 3s 缓冲
  await sleep(3000)
  const evs = fs.existsSync(evFile) ? fs.readFileSync(evFile, 'utf8').trim().split('\n') : []
  const kinds = {}
  for (const line of evs) { try { const j = JSON.parse(line); kinds[j.kind] = (kinds[j.kind] || 0) + 1 } catch {} }
  const latest = evs.slice(-8).map((l) => { try { const j = JSON.parse(l); return { kind: j.kind, at: j.at, text: String(j.text || '').slice(0, 130) } } catch { return null } }).filter(Boolean)
  console.log(JSON.stringify({
    waitedSec: Math.round((Date.now() - t0) / 1000),
    runResultSeen: runResult !== null,
    runResultAt: runResult?.at ?? null,
    runResultValue: runResult ? String(JSON.stringify(runResult.value)).slice(0, 200) : null,
    eventKinds: kinds,
    latestEvents: latest,
  }, null, 1))
  // 判定:观测到自愈或熔断事件=行使;结果成功且无事件=路径未行使(环境健康,不算失败)
  const exercised = (kinds['daemon-selfheal'] ?? 0) > 0 || (kinds['circuit-open'] ?? 0) > 0
  console.log(runResult ? (exercised ? 'SELFHEAL-EXERCISED' : 'RAN-WITHOUT-SELFHEAL(路径未行使)') : 'NO-RESULT-IN-WINDOW')
  process.exit(runResult ? 0 : 1)
})().catch((e) => { console.error('OBS-ERR', e.message); process.exit(2) })
