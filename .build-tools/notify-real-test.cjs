// 真机推送闭环验收(2026-10-28):本地 webhook 接收器收真 POST——调度→采集→dispatchScheduleNotify
// →WebhookChannel.send(daemon 进程真 fetch)→本机 19999 端口。零桩:通道、调度、状态全部真实。
// 隐私断言:送达正文不得含本机路径/用户名(scrubLocalPaths 在真实链路上的效力)。
// 用法:node .build-tools/notify-real-test.cjs <gateway-token>
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const TOKEN = process.argv[2] || ''
const BASE = 'http://127.0.0.1:3123'
const PORT = 19999
const EVID = path.join(__dirname, '..', '.qa', '045-notify-webhook-payload.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (TOKEN.length === 0) { console.error('need gateway token'); process.exit(1) }

const received = [] // {at, method, url, contentType, body}

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')) }
  else { fail++; console.log('  FAIL ' + name + ' — ' + String(detail).slice(0, 300)) }
}

// ── webhook 接收器(daemon 会 POST 到这里) ─────────────────────────
const server = http.createServer((req, res) => {
  let buf = ''
  req.on('data', (c) => { buf += c })
  req.on('end', () => {
    received.push({ at: new Date().toISOString(), method: req.method, url: req.url, contentType: req.headers['content-type'], body: buf })
    res.writeHead(200); res.end('ok')
  })
})

// ── RPC(cookie 会话:先 /?token= 换 cookie) ────────────────────────
let cookie = ''
async function rpc(m, args) {
  const res = await fetch(BASE + '/api/opencli/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: 'client-request', rpcId: 'n-' + Math.random().toString(36).slice(2, 8), method: 'opencli/' + m, payload: { args } }),
  })
  const j = await res.json().catch(() => null)
  return j && j.result ? j.result.value : j
}

server.listen(PORT, '127.0.0.1', () => {
  (async () => {
    // 会话交换
    const r0 = await fetch(BASE + '/?token=' + TOKEN, { redirect: 'manual' })
    cookie = (r0.headers.get('set-cookie') || '').split(';')[0]
    check('网关会话建立(cookie)', cookie.length > 0, cookie.slice(0, 24) + '…')

    // 前置:notify 配置里 webhook 指向 127.0.0.1:19999(上一轮验证留下的,正好复用)
    const cfg = await rpc('notify-config', {})
    const wh = cfg && cfg.config && cfg.config.channels && cfg.config.channels.find((c) => c.type === 'webhook' && c.enabled)
    check('notify 配置存在启用中的 webhook 通道', !!wh && String(wh.url).includes('19999'), JSON.stringify(wh))

    // 建任务:juejin hot + watch '的'(中文页面必命中,保证走 🔔 路径)+ notify:true
    const add = await rpc('schedule-add', { request: { site: 'site juejin hot', cron: '0 4 * * *', retry: 1, notify: true, watch: '的' } })
    const sid = add && add.id
    check('schedule-add 返回 id', !!sid, JSON.stringify(add))
    console.log('[run-now] 触发真实采集…')
    await rpc('schedule-run-now', { p: { id: sid } })

    let hist = []
    for (let i = 0; i < 12; i++) {
      await sleep(15_000)
      const h = await rpc('schedule-history', { p: { id: sid } })
      hist = (h && h.history) || []
      if (hist.length > 0) break
      console.log(`  @${(i + 1) * 15}s 尚无历史…`)
    }
    check('真实采集完成(history 出现)', hist.length > 0, JSON.stringify(hist[0] || null).slice(0, 160))

    // 通知是 saveState 之后 await 发的:history 落盘后最多再等几秒
    for (let i = 0; i < 6 && received.length === 0; i++) await sleep(3_000)
    check('webhook 收到真 POST', received.length > 0, `received=${received.length}`)

    if (received.length > 0) {
      const p = received[received.length - 1]
      check('POST 方法与 content-type', p.method === 'POST' && /application\/json/.test(String(p.contentType)), p.method + ' ' + p.contentType)
      let v = null; try { v = JSON.parse(p.body) } catch {}
      check('载荷字段 {title, body, at}', !!v && typeof v.title === 'string' && typeof v.body === 'string' && typeof v.at === 'string', JSON.stringify(v && { title: v.title, at: v.at }))
      check('标题含站点命令', !!v && v.title.includes('juejin'), v && v.title)
      check('正文含 🔔 Watch 命中(watch=的 必命中)', !!v && v.body.includes('🔔 Watch 命中'), v && v.body.slice(0, 120).replace(/\n/g, '|'))
      const all = p.body
      check('隐私:不含本机路径/用户名/盘符', !all.includes('20369') && !all.includes('C:\\') && !all.includes('D:\\') && !/Users\\\\/.test(all), '(scrubLocalPaths 真实链路)')
      fs.writeFileSync(EVID, JSON.stringify(received, null, 2))
      console.log('  ↳ 载荷已存证 ' + EVID)
    }

    // dsh 面板通道:watch-hit 事件进 ingest 时间线
    const ev = await rpc('ingest-events', {})
    const evs = (ev && ev.events) || []
    check('dsh 通道:ingest 出现 watch-hit 事件', evs.some((e) => String(e.text || '').includes('Watch 命中')), JSON.stringify(evs.slice(0, 2)).slice(0, 200))

    // 清理
    await rpc('schedule-remove', { request: { id: sid } })
    console.log('[cleanup] schedule 已移除(notify 配置未动)')

    console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
    server.close()
    process.exit(fail > 0 ? 1 : 0)
  })().catch((e) => { console.error('FATAL', e); server.close(); process.exit(1) })
})
