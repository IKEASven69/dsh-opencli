// 会话输出轮询器:每 10s 读 projections,LLM 出字即停
// 用法:node .build-tools/session-poll.cjs <cookie文件> <sessionId>
const fs = require('node:fs')

const COOKIE = process.argv[2] || '/tmp/ck5.txt'
const SID = process.argv[3] || ''
if (!SID) { console.error('need sessionId'); process.exit(1) }
const cookieRaw = fs.readFileSync(COOKIE, 'utf8')
const line = cookieRaw.split('\n').find((l) => l.includes('dsh-auth')) || ''
const parts = line.trim().split(/\t/)
const cookie = parts.length >= 2 ? `${parts[parts.length - 2]}=${parts[parts.length - 1]}` : cookieRaw.trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rpc(method, args) {
  const res = await fetch('http://127.0.0.1:3123/api/session/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: 'poll-' + Math.random().toString(36).slice(2, 6), method: 'session/' + method, payload: { args } }),
  })
  return await res.text()
}

;(async () => {
  for (let i = 1; i <= 15; i++) {
    await sleep(10_000)
    const t = await rpc('projections', { request: { sessionId: SID } })
    let out = '?', turns = '?', resp = '(空)'
    try {
      const v = JSON.parse(t).result.value.values
      out = v.tokenUsage.outputTokens
      turns = v.sessionStats.turns
      const r0 = (v.turnOutline || []).map((x) => x.response || '').join('|')
      resp = r0.replace(/\n/g, ' ').slice(0, 150) || '(空)'
    } catch { /* 容错 */ }
    console.log(`@${i * 10}s out=${out} turns=${turns} resp=${resp}`)
    if (resp !== '(空)') { console.log('=== LLM 有输出 ==='); process.exit(0) }
  }
  console.log('=== 3 分钟无输出 ===')
  process.exit(1)
})()
