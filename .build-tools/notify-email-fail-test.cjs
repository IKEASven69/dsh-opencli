// 真机 email 通道容错验收(2026-10-28):email 指向不存在的本地 SMTP(2525 无监听),
// 断言:该通道优雅失败 + webhook 通道照常送达(单通道故障不反噬群发)。测完还原 notify 配置原样。
// 用法:node .build-tools/notify-email-fail-test.cjs <gateway-token>
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const TOKEN = process.argv[2] || ''
const BASE = 'http://127.0.0.1:3123'
const PORT = 19999
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (TOKEN.length === 0) { console.error('need gateway token'); process.exit(1) }

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')) }
  else { fail++; console.log('  FAIL ' + name + ' — ' + String(detail).slice(0, 300)) }
}
const received = []
const server = http.createServer((req, res) => {
  let buf = ''
  req.on('data', (c) => { buf += c })
  req.on('end', () => { received.push(buf); res.writeHead(200); res.end('ok') })
})

let cookie = ''
async function rpc(m, args) {
  const res = await fetch(BASE + '/api/opencli/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: 'client-request', rpcId: 'e-' + Math.random().toString(36).slice(2, 8), method: 'opencli/' + m, payload: { args } }),
  })
  const j = await res.json().catch(() => null)
  return j && j.result ? j.result.value : j
}

server.listen(PORT, '127.0.0.1', () => {
  (async () => {
    const r0 = await fetch(BASE + '/?token=' + TOKEN, { redirect: 'manual' })
    cookie = (r0.headers.get('set-cookie') || '').split(';')[0]

    // 原配置存底(测完原样还原)
    const before = await rpc('notify-config', {})
    const original = before && before.config
    console.log('[原配置] ' + JSON.stringify(original))

    // 加一条必失败的 email 通道
    const withEmail = { channels: [...(original.channels || []), { type: 'email', url: 'smtp://127.0.0.1:2525', to: 'nobody@test.invalid', enabled: true }] }
    const set = await rpc('notify-config', { request: withEmail })
    check('配置写入(webhook+dsh+坏 email 三通道)', set && set.ok && set.config.channels.length === 3, JSON.stringify(set && set.config))

    // 跑一次真实调度
    const add = await rpc('schedule-add', { request: { site: 'site juejin hot', cron: '0 5 * * *', retry: 1, notify: true } })
    const sid = add && add.id
    await rpc('schedule-run-now', { p: { id: sid } })
    let hist = []
    for (let i = 0; i < 12; i++) {
      await sleep(15_000)
      const h = await rpc('schedule-history', { p: { id: sid } })
      hist = (h && h.history) || []
      if (hist.length > 0) break
    }
    check('采集完成', hist.length > 0)
    for (let i = 0; i < 6 && received.length === 0; i++) await sleep(3_000)
    check('坏 email 通道下 webhook 仍真送达', received.length > 0, 'received=' + received.length)
    const ev = await rpc('ingest-events', {})
    const evs = (ev && ev.events) || []
    check('dsh 通道事件也在(三通道并发各不拖累)', evs.length > 0 && evs.some((e) => e.kind === 'notify' || e.kind === 'watch-hit'), 'events=' + evs.length)
    check('daemon 未崩(调度/历史 RPC 继续可用)', hist.length > 0 && evs !== null)

    // 清理:移除任务 + 配置还原原样
    await rpc('schedule-remove', { request: { id: sid } })
    const restore = await rpc('notify-config', { request: original })
    const after = await rpc('notify-config', {})
    check('notify 配置已还原原样', JSON.stringify(after && after.config) === JSON.stringify(original), JSON.stringify(after && after.config))

    console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
    server.close()
    process.exit(fail > 0 ? 1 : 0)
  })().catch((e) => { console.error('FATAL', e); server.close(); process.exit(1) })
})
