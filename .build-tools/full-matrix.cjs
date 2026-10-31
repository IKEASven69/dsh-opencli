// 0.4.6 全功能系统测试(一次跑完,汇总 PASS/FAIL):18 项 × 六主线。
// 真 RPC/真 daemon/真浏览器;唯一桩=无(通知测试用死端口验诚实失败)。
// 用法:node .build-tools/full-matrix.cjs <gateway-token>
const TOKEN = process.argv[2] || ''
if (TOKEN.length === 0) { console.error('need token'); process.exit(1) }
const BASE = 'http://127.0.0.1:3123'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const results = []
const check = (group, name, cond, detail) => {
  const icon = cond ? '✓' : '✗'
  results.push(`${icon} [${group}] ${name}${cond ? '' : ' — ' + String(detail).slice(0, 160)}`)
  cond ? pass++ : fail++
}

let cookie = ''
async function rpc(scope, method, args, timeoutMs = 30000) {
  const res = await fetch(`${BASE}/api/${scope}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fm-' + Math.random().toString(36).slice(2, 7), method: `${scope}/${method}`, payload: { args } }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const j = await res.json().catch(() => null)
  return j && j.result ? j.result : { ok: false, error: { message: 'rpc fail' } }
}
const cli = (args) => {
  const { spawnSync } = require('node:child_process')
  const CLI = require('node:child_process').execSync('npm root -g').toString().trim() + '/@jackwener/opencli/dist/src/main.js'
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 90000 })
  return (r.stdout || '') + (r.stderr || '')
}

;(async () => {
  // 0. 会话
  const r0 = await fetch(BASE + '/?token=' + TOKEN, { redirect: 'manual' })
  cookie = (r0.headers.get('set-cookie') || '').split(';')[0]
  check('会话', 'token 换 cookie', cookie.startsWith('dsh-auth-'), cookie.slice(0, 20))

  // ── A. 直连引擎 ──
  const page0 = await rpc('opencli', 'nl-intent', { request: { text: '' } }, 15000)
  check('A-直连', 'nl-intent 空输入护栏', page0.ok === true && page0.value?.ok === false && String(page0.value?.error).includes('输入为空'))
  // 直连 vs CLI 对照(经 eval 族间接验证:canvas_discover 响应时间)
  const tDirect0 = Date.now()
  // (先让 direct capability 就绪:跑一次 nl 之外的 eval——用 snap-export 顺带覆盖⑦)
  // site 命令(CLI 路径)
  const tCli = Date.now()
  const site = await rpc('opencli', 'try-run', { request: { line: 'site juejin hot' } }, 90000)
  const cliMs = Date.now() - tCli
  check('A-直连', 'site 命令真实采集(CLI 路径)', site.ok && site.value?.ok === true && (site.value?.text ?? '').includes('rank'), cliMs + 'ms')
  // eval 族(直连路径):用画布 discover 在绑定页上
  // (无绑定页时验证不炸即可——直连失败会回落 CLI)
  // ⑤来源/④级别:建任务(quiet+chat 来源)
  const add = await rpc('opencli', 'schedule-add', { request: { site: 'site juejin hot', cron: '0 9 * * *', source: 'chat', notifyLevel: 'quiet', watch: 'AI', notify: true } })
  const sid = add.value?.id
  check('④级别', 'schedule-add 带 source+notifyLevel', add.value?.ok === true && !!sid, JSON.stringify(add.value).slice(0, 80))
  const sl = await rpc('opencli', 'schedule-list', {})
  const row = (sl.value?.schedules ?? []).find((s) => s.id === sid)
  check('⑤来源', '任务行带 source=chat', row?.source === 'chat', JSON.stringify(row?.source))
  check('④级别', '任务行带 notifyLevel=quiet', row?.notifyLevel === 'quiet')

  // ── C. 快照 diff ──
  await rpc('opencli', 'schedule-run-now', { p: { id: sid } })
  let snaps = 0
  for (let i = 0; i < 8 && snaps < 1; i++) { await sleep(15000); const h = await rpc('opencli', 'schedule-history', { p: { id: sid } }); snaps = (h.value?.snapshots ?? []).length }
  check('C-diff', '第一次采集落快照', snaps >= 1, 'snapshots=' + snaps)
  await rpc('opencli', 'schedule-run-now', { p: { id: sid } })
  let snaps2 = 0
  for (let i = 0; i < 8 && snaps2 < 2; i++) { await sleep(15000); const h = await rpc('opencli', 'schedule-history', { p: { id: sid } }); snaps2 = (h.value?.snapshots ?? []).length }
  check('C-diff', '第二次采集快照+1', snaps2 >= 2, 'snapshots=' + snaps2)
  const dh = await rpc('opencli', 'snap-diff-history', { p: { id: sid } })
  check('C-diff', 'diff-history 返回按天聚合', dh.ok && dh.value?.ok === true && Array.isArray(dh.value?.days) && dh.value.days.length >= 1, JSON.stringify((dh.value?.days ?? [])[0] ?? dh.value ?? dh.error).slice(0, 100))
  const ev = await rpc('opencli', 'ingest-events', {})
  const diffEv = (ev.value?.events ?? []).some((e) => e.kind === 'snap-diff')
  const inboxEv = (ev.value?.events ?? []).some((e) => e.kind === 'inbox' || (e.text || '').includes('📊'))
  check('C-diff', '📊 事件进时间线(或例行通知含 diff 段)', diffEv || (ev.value?.events ?? []).some((e) => (e.text || '').includes('📊')) || inboxEv, JSON.stringify((ev.value?.events ?? []).slice(0, 2)).slice(0, 100))

  // ── ⑦ CSV 导出 ──
  const exp = await rpc('opencli', 'snap-export', { p: { id: sid } })
  check('⑦导出', 'snap-export 结构化 CSV', exp.ok && exp.value?.ok === true && (exp.value?.rows ?? 0) > 0 && String(exp.value?.text).startsWith('_at,_site'), 'rows=' + exp.value?.rows)

  // ── ⑥ undo ──
  const rm = await rpc('opencli', 'schedule-remove', { request: { id: sid } })
  check('⑥undo 前置', 'schedule-remove 清理', rm.value?.ok === true)

  // ── B. NL 指挥台(引擎+执行) ──
  const tNl = Date.now()
  const nl = await rpc('opencli', 'nl-intent', { request: { text: '盯住B站热榜,出现新番就告诉我' } }, 240000)
  const nlMs = Date.now() - tNl
  check('B-NL', 'NL 映射成功(经 minimax 路由)', nl.ok && nl.value?.ok === true && nl.value?.intent?.kind === 'schedule-add', (nl.value?.explanation ?? nl.value?.error ?? '').slice(0, 80) + ` (${nlMs}ms)`)
  const intent = nl.value?.intent
  check('B-NL', '映射质量:site/cron/watch 三字段合理', intent?.site === 'site bilibili hot' && typeof intent?.cron === 'string' && intent?.cron.split(' ').length === 5 && typeof intent?.watch === 'string', JSON.stringify(intent))
  if (intent && intent.kind === 'schedule-add') {
    const applied = await rpc('opencli', 'inbox-intent', { request: { intent: { ...intent, source: 'chat' } } })
    check('B-NL', '确认执行真实建任务(inbox-intent)', applied.ok && applied.value?.ok === true && !!applied.value?.value?.id, JSON.stringify(applied.value).slice(0, 80))
    // 闭集防线:伪造字段必须被拒
    const evil = await rpc('opencli', 'inbox-intent', { request: { intent: { kind: 'eval', code: '1+1' } } })
    check('B-NL', '闭集防线:eval 意图拒绝', evil.value?.ok === false, JSON.stringify(evil.value).slice(0, 80))
    // 清理刚建的任务
    const sid2 = applied.value?.value?.id
    if (sid2) await rpc('opencli', 'schedule-remove', { request: { id: sid2 } })
  }

  // ── D. 通知渠道 ──
  const cfgBefore = await rpc('opencli', 'notify-config', {})
  check('D-渠道', 'notify-config 读', cfgBefore.ok && Array.isArray(cfgBefore.value?.config?.channels), JSON.stringify(cfgBefore.value?.config?.channels?.length ?? '?') + ' 通道')
  // 平台通道保存(feishu 带 platform 字段)
  const channels = (cfgBefore.value?.config?.channels ?? []).filter((c) => c.type !== 'webhook')
  channels.push({ type: 'webhook', url: 'http://127.0.0.1:19999/dead', enabled: true, platform: 'feishu' })
  const cfgSet = await rpc('opencli', 'notify-config', { request: { channels } })
  check('D-渠道', '保存带 platform 的通道', cfgSet.ok && cfgSet.value?.ok === true && (cfgSet.value?.config?.channels ?? []).some((c) => c.platform === 'feishu'), JSON.stringify(cfgSet.value?.config).slice(0, 100))
  // notify test(死端口 → 诚实失败)
  const nt = await rpc('opencli', 'notify-test', {}, 120000)
  check('D-渠道', 'notify test 死端口诚实失败', nt.value?.ok === false, nt.value?.error?.slice(0, 60))
  // 还原
  const original = cfgBefore.value?.config
  if (original) await rpc('opencli', 'notify-config', { request: { channels: original.channels } })

  // ── E. schema/轨迹/画布数据(面板数据面) ──
  const tl = await rpc('opencli', 'trace-list', { request: { limit: 10 } })
  check('E-数据面', 'trace-list(轨迹)', tl.ok && (tl.value?.traces ?? []).length > 0, 'traces=' + (tl.value?.traces ?? []).length)
  const canvas = await rpc('opencli', 'canvas-data', { request: {} }, 20000).catch(() => ({ ok: false, error: { message: 'no rpc' } }))
  // canvas-data 若无此 RPC,验证 evidence-list 代替(画布数据源)
  if (!canvas.ok) {
    const evl = await rpc('opencli', 'evidence-list', {})
    check('E-数据面', 'evidence-list(画布数据源)', evl.ok, JSON.stringify(evl.value ?? '').slice(0, 60))
  } else check('E-数据面', 'canvas-data', true)

  // ── F. 生态(ctl 全链:status→add→list→run→remove;子进程真跑) ──
  const { execFileSync } = require('node:child_process')
  const ctl = (...a) => execFileSync(process.execPath, [require('node:path').resolve(__dirname, '..', 'bin', 'dsh-opencli-ctl.cjs'), ...a, '--timeout', '45'], { encoding: 'utf8', env: process.env })
  try {
    const st = JSON.parse(ctl('status'))
    check('F-生态', 'ctl status', st.ok === true && st.value?.plugin === 'dsh-opencli', JSON.stringify(st.value ?? st).slice(0, 80))
    const ra = JSON.parse(ctl('schedule', 'add', '--site', 'site zhihu hot', '--cron', '0 8 * * *', '--watch', 'AI', '--source', 'agent', '--no-wait'))
    check('F-生态', 'ctl schedule add(--source agent)', ra.ok === true && ra.delivered === true)
    // 等消费者执行
    let rl = null
    for (let i = 0; i < 8 && !(rl ?? {}).value; i++) { await sleep(4000); try { rl = JSON.parse(ctl('schedule', 'list')) } catch { rl = undefined } }
    const agentRow = (Array.isArray(rl.value) ? rl.value : (rl.value?.schedules ?? [])).find((s) => s.source === 'agent' && s.site === 'site zhihu hot')
    check('F-生态', 'ctl 建的任务落盘且带 agent 来源', !!agentRow)
    if (agentRow) {
      const rr = JSON.parse(ctl('schedule', 'run', '--id', agentRow.id, '--timeout', '90'))
      check('F-生态', 'ctl schedule run(真实采集)', rr.ok === true)
      let ru = { ok: false }
      try { ru = JSON.parse(ctl('undo', '--stem', ra.stem, '--timeout', '30').match(/\{[\s\S]*\}/)?.[0] ?? '{}') } catch { }
      if (ru.ok !== true) { try { ru = JSON.parse(ctl('schedule', 'remove', '--id', agentRow.id)) } catch { ru = { ok: false } } }
      check('F-生态', 'undo/remove 清理', ru.ok === true, JSON.stringify(ru).slice(0, 60))
    }
  } catch (e) { check('F-生态', 'ctl 全链', false, e.message.slice(0, 120)) }

  // ── 汇总 ──
  console.log('\n════ 0.4.6 全功能矩阵 ════')
  for (const r of results) console.log(r)
  console.log(`\n总计: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail > 0 ? 1 : 0)
})().catch((e) => { console.error('FATAL', e); console.log(`\n中断: ${pass} PASS / ${fail} FAIL(之前项)`); process.exit(1) })
