// 0.4.7 A 线真机差分基准:每原语 CLI 冷启动 vs 直连组合,同机同页对照。
// 形状一致判定:两边信封顶层 {ok,data} 同形、data 关键字段一致(字符串信封逐字比,对象比 keys 并集)。
// 会话隔离:全程 session 'bench'(replay 的 session 参数),不碰用户 dsh 活页;
// close-window(释放租约,副作用大)不在本基准跑——单元已锁其信封逐字同文,真机语义由会话自然覆盖。
// 用法:node .build-tools/direct-compose-bench.cjs <gateway-token>
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const TOKEN = process.argv[2] || ''
if (!TOKEN) { console.error('need token'); process.exit(1) }
const BASE = 'http://127.0.0.1:3123'
const SESS = 'bench'
const URL0 = 'https://example.com/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let cookie = ''
async function replayStep(step) {
  const r = await rpc('replay', { request: { step, session: SESS } }, 90000)
  return r && r.value ? r.value : { ok: false, error: r?.error ?? 'no value' }
}
async function rpc(method, payload, timeoutMs = 60000) {
  // 回环 fetch 偶发瞬时抖动(连挂观测在案):3 次退避重试,真失败才返回错误体
  let lastErr = null
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${BASE}/api/opencli/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ type: 'client-request', rpcId: 'b-' + Math.random().toString(36).slice(2, 7), method: `opencli/${method}`, payload: { args: payload } }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const setc = res.headers.getSetCookie?.() ?? []
      for (const c of setc) { const kv = c.split(';')[0]; if (kv.startsWith('dsh-auth-')) cookie = kv }
      const j = await res.json().catch(() => null)
      return j && j.result ? j.result : { ok: false, error: 'rpc fail' }
    } catch (e) { lastErr = e; await sleep(1200 * (i + 1)) }
  }
  return { ok: false, error: 'rpc fail: ' + String(lastErr?.message ?? lastErr) }
}

const CLI = require('node:child_process').execSync('npm root -g').toString().trim() + '/@jackwener/opencli/dist/src/main.js'
function cli(args, timeout = 90000) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout })
  return { ms: Date.now() - t0, stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? 1 }
}

// CLI 2.0 会话形态:browser <sub> --session <s>(子命令在 --session 前)
const cliArgs = (parts) => ['browser', ...parts, '--session', SESS]

const parseEnv = (stdout) => { try { return JSON.parse(stdout) } catch { return null } }
// outHead 截 200 字:短信封(字符串/小对象)完整可解析;state/tab list 等长信封会被截断——
// 截断时退化为前缀形状判定(信封开头 + data 类型标记),不做逐字段比。
const isOkEnv = (s) => /^\{"ok":true,"data":/.test(s ?? '')
const envDataKind = (s) => {
  if (!isOkEnv(s)) return 'not-ok-env'
  const rest = (s ?? '').slice('{"ok":true,"data":'.length)
  if (rest.startsWith('"')) return 'string'
  if (rest.startsWith('[')) return 'array'
  if (rest.startsWith('{')) return 'object'
  return 'other'
}


/** 找 since 之后 cmd 前缀匹配的最新轨迹行(带重试:recordTrace 同步落盘,但 RPC 往返有时差)。 */
async function traceAfter(cmdPrefix, since, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const t = await rpc('trace-list', { request: { limit: 200 } }, 20000)
    const row = (t.value?.traces ?? []).find((x) => x.cmd.startsWith(cmdPrefix) && String(x.at || '').length > 0 && new Date(x.at).getTime() >= since - 1500)
    if (row) return row
    await sleep(700)
  }
  return null
}

let pass = 0, fail = 0
const rows = []
const check = (name, cond, detail) => { cond ? pass++ : fail++; rows.push(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }

;(async () => {
  // 前置:daemon ping + 面板 token→cookie 握手(没握手所有 replay RPC 都 401)
  try { const p = await fetch('http://127.0.0.1:19825/ping', { signal: AbortSignal.timeout(3000) }); if (!p.ok) throw 0 } catch { console.error('daemon 19825 不可达'); process.exit(1) }
  const r0 = await fetch(BASE + '/?token=' + TOKEN, { redirect: 'manual' })
  cookie = (r0.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie.startsWith('dsh-auth-')) { console.error('token 握手失败'); process.exit(1) }

  // 两阶段隔离(2026-11-04 实证:CLI 与直连同会话交错会互相拖慢——上游 CLI 带 runId 租约心跳,
  // 直连裸 /command 不带,交错语义未探明;故 CLI 基线与直连各占一个全新会话生命周期)
  const unbind = () => spawnSync(process.execPath, [CLI, 'browser', 'unbind', '--session', SESS], { encoding: 'utf8', timeout: 20000 })

  // ── 阶段 A:纯 CLI 基线 ──
  unbind()
  const cOpen = cli(cliArgs(['open', URL0]))
  const cState = cli(cliArgs(['state']))
  const refM = /\[(\d+)\]/.exec(parseEnv(cState.stdout)?.data?.snapshot ?? '')
  const REF = refM ? refM[1] : null
  // click 紧随 state(ref 映射新鲜;点击导航走 example.org,后续原语不依赖具体页面)
  // 注意:不能放在 tab new/close 之后——tab 关闭后会话活动页落在残留 about:blank 中间 tab
  // (上游行为,CLI/直连一致),ref 解析必然 not_found(2026-11-04 实证)
  const cClick = REF ? cli(cliArgs(['click', REF])) : null
  const cScroll = cli(cliArgs(['scroll', 'down']))
  const oDir0 = `${os.tmpdir()}/dsh-bench-${Date.now()}`; fs.mkdirSync(oDir0, { recursive: true })
  const fC = path.join(oDir0, 'cli.png')
  const cShot = cli(cliArgs(['screenshot', fC]))
  const cTabs = cli(cliArgs(['tab', 'list']))
  const cNew = cli(cliArgs(['tab', 'new', URL0]))
  const idC = parseEnv(cNew.stdout)?.data?.page
  const cClose = idC ? cli(cliArgs(['tab', 'close', idC])) : null

  // ── 阶段 B:纯直连(replay→插件 direct 路径;全新会话生命周期) ──
  unbind()
  const ms0 = Date.now()
  const rOpen = await replayStep(`browser_open ${URL0}`)
  const tOpen = await traceAfter(`browser ${SESS} open`, ms0)
  const rState = await replayStep('browser_state')
  const tState = await traceAfter(`browser ${SESS} state`, ms0)
  const rClick = REF ? await replayStep(`browser_click ${REF}`) : { ok: false }
  const tClick = REF ? await traceAfter(`browser ${SESS} click`, ms0) : null
  const rScroll = await replayStep('browser_scroll down')
  const tScroll = await traceAfter(`browser ${SESS} scroll down`, ms0)
  const fD = path.join(oDir0, 'direct.png')
  const rShot = await replayStep(`browser_screenshot ${fD}`)
  const tShot = await traceAfter(`browser ${SESS} screenshot`, ms0)
  const rTabs = await replayStep('browser_tab list')
  const tTabs = await traceAfter(`browser ${SESS} tab list`, ms0)
  const rNew = await replayStep(`browser_tab new ${URL0}`)
  const tNew = await traceAfter(`browser ${SESS} tab new`, ms0)
  const idD = parseEnv(tNew?.outHead ?? 'x')?.data?.page
  const rClose = idD ? await replayStep(`browser_tab close ${idD}`) : { ok: false }
  const tClose = idD ? await traceAfter(`browser ${SESS} tab close`, ms0) : null

  // ── 形状判定(直连 outHead 截 200 字,长信封退化为前缀形状) ──
  const cOpenData = parseEnv(cOpen.stdout)?.data
  check('open 形状一致({url,page})',
    cOpenData !== null && typeof cOpenData === 'object' && typeof cOpenData.url === 'string' && typeof cOpenData.page === 'string' &&
    envDataKind(tOpen?.outHead) === 'object' && /"page":"/.test(tOpen?.outHead ?? ''),
    `cli=${JSON.stringify(cOpenData)} directHead=${(tOpen?.outHead ?? '').slice(0, 60)}`)
  const dC = parseEnv(cState.stdout)
  check('state 形状一致(object{url,snapshot})',
    dC?.data !== null && typeof dC?.data === 'object' && typeof dC?.data?.snapshot === 'string' && typeof dC?.data?.url === 'string' &&
    envDataKind(tState?.outHead) === 'object' && /"url":"/.test(tState?.outHead ?? '') && /"snapshot":"/.test(tState?.outHead ?? ''),
    `cliData=${JSON.stringify(dC?.data)?.slice(0, 60)} directHead=${(tState?.outHead ?? '').slice(0, 60)}`)
  check('scroll 信封逐字同文', String(parseEnv(cScroll.stdout)?.data) === String(parseEnv(tScroll?.outHead ?? 'x')?.data) && String(parseEnv(cScroll.stdout)?.data).includes('Scrolled'), `cli="${parseEnv(cScroll.stdout)?.data}" direct="${parseEnv(tScroll?.outHead ?? 'x')?.data}"`)
  const png = (f) => { try { const b = fs.readFileSync(f); return b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 } catch { return false } }
  const savedC = String(parseEnv(cShot.stdout)?.data ?? '').startsWith('Screenshot saved to:')
  const savedD = String(parseEnv(tShot?.outHead ?? 'x')?.data ?? '').startsWith('Screenshot saved to:')
  check('screenshot 双方落盘 PNG + 同文案信封', png(fC) && png(fD) && savedC && savedD, `cli(${png(fC) ? fs.statSync(fC).size : 0}B,saved=${savedC}) direct(${png(fD) ? fs.statSync(fD).size : 0}B,saved=${savedD})`)
  const nC = Array.isArray(parseEnv(cTabs.stdout)?.data) ? parseEnv(cTabs.stdout).data.length : -1
  check('tab list 直连数组信封(CLI 侧长度≥1)', envDataKind(tTabs?.outHead) === 'array' && nC >= 1, `cli=${nC} directShape=${envDataKind(tTabs?.outHead)}`)
  check('tab new 返回 page 身份 + {page,url} 形状一致', typeof idC === 'string' && typeof idD === 'string' && envDataKind(tNew?.outHead) === 'object' && /"url":"/.test(tNew?.outHead ?? ''), `cli=${idC} direct=${idD} head=${(tNew?.outHead ?? '').slice(0, 60)}`)
  const closedD = parseEnv(tClose?.outHead ?? 'x')?.data?.closed
  check('tab close {closed:id} 形状一致', rClose.ok === true && closedD === idD && parseEnv(cClose?.stdout ?? 'x')?.data?.closed === idC, `direct.closed=${closedD} cli.closed=${parseEnv(cClose?.stdout ?? 'x')?.data?.closed}`)
  const cc = parseEnv(cClick?.stdout ?? 'x')
  const dcHead = tClick?.outHead ?? ''
  const clickDCheck = /"clicked":true/.test(dcHead) && /"click_method":"(cdp|js)"/.test(dcHead)
  check('click 双方 clicked:true + click_method', cc?.data?.clicked === true && typeof cc?.data?.click_method === 'string' && clickDCheck, `cli={m:${cc?.data?.click_method}} directHead=${dcHead.slice(0, 80)}`)

  // ── 延迟对照表 ──
  console.log('════ 0.4.7 A 线真机差分基准(两阶段隔离,session=' + SESS + ') ════')
  console.log('原语        CLI ms   直连 ms   加速')
  const line = (name, cMs, dMs) => console.log(`${name.padEnd(10)} ${String(cMs ?? '-').padStart(6)}   ${String(dMs ?? '-').padStart(6)}   ${cMs > 0 && dMs > 0 ? (cMs / dMs).toFixed(1) + 'x' : '—'}`)
  line('open', cOpen.ms, tOpen?.ms)
  line('state', cState.ms, tState?.ms)
  line('scroll', cScroll.ms, tScroll?.ms)
  line('screenshot', cShot.ms, tShot?.ms)
  line('tab list', cTabs.ms, tTabs?.ms)
  line('tab new', cNew.ms, tNew?.ms)
  line('tab close', cClose?.ms ?? null, tClose?.ms)
  if (tClick) line('click', cClick?.ms ?? null, tClick?.ms)
  console.log('')
  for (const r of rows) console.log(r)
  console.log(`
总计: ${pass} PASS / ${fail} FAIL`)
  try { fs.rmSync(oDir0, { recursive: true, force: true }) } catch {}
  process.exit(fail > 0 ? 1 : 0)
})().catch((e) => { console.error('BENCH FATAL', e.message); process.exit(1) })