// A2 真机验收:canvas 三件套全链走 daemon /command 直连(不经 CLI 进程)。
// 与 canvas-real-test.cjs 同语义(测试页/断言),差异:传输=直连母语(探针→导航→缓存 page→discover/read/click)。
// 验收点:协议往返/页面身份缓存复用/像素级/延迟数字(直连 vs CLI 对照)。
// 用法:node .build-tools/direct-real-test.cjs
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { spawn } = require('node:child_process')

const PORT = 18777
const BASE = 'http://127.0.0.1:19825/command'
const STORE = path.join(os.homedir(), '.dsh/profiles/web/node_modules/dsh-opencli/lib/index.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n + (d ? ' — ' + String(d).slice(0, 180) : '')) } else { fail++; console.log('  FAIL ' + n + ' — ' + String(d).slice(0, 260)) } }

// ── 直连原语(与 src/direct.ts 同形,独立实现以独立验证) ──
async function cmd(action, params, timeoutMs = 30000) {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenCLI': '1' },
      body: JSON.stringify({ id: 'direct-rt-' + Date.now().toString(36) + '-' + (++cmd.n), action, ...params }),
      signal: ctrl.signal,
    })
    const j = await res.json()
    return { j, ms: Date.now() - t0 }
  } finally { clearTimeout(timer) }
}
cmd.n = 0

// 测试页(同 canvas-real-test)
const HTML = `<!doctype html><html><body style="margin:0">
<canvas id="board" width="300" height="150" style="position:absolute;left:20px;top:20px;width:300px;height:150px;border:1px solid #ccc"></canvas>
<canvas width="200" height="100" style="position:absolute;left:20px;top:200px;width:200px;height:100px;border:1px solid #ddd"></canvas>
<button id="hit" style="position:absolute;left:400px;top:20px;width:60px;height:30px">hit</button>
<div id="clicked-marker" style="display:none"></div>
<script>
(function(){var c=document.getElementById('board').getContext('2d');c.fillStyle='#d00';c.fillRect(10,10,100,100);
var l=document.querySelectorAll('canvas')[1].getContext('2d');l.fillStyle='#00d';l.beginPath();l.arc(60,50,40,0,7);l.fill();
document.getElementById('hit').addEventListener('click',function(){var m=document.getElementById('clicked-marker');m.style.display='block';m.textContent='CLICKED @ '+Date.now()})})();
</script></body></html>`
require('node:http').createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(HTML) }).listen(PORT, '127.0.0.1')

// 从部署包抽取三段 eval 桥 JS(与产品字节一致)
const bundle = fs.readFileSync(STORE, 'utf8')
function grab(name) {
  let i = bundle.indexOf(name + '(')
  while (i >= 0) { const b = bundle.slice(Math.max(0, i - 30), i); if (/(\bstatic\s+|\basync\s+|\bfunction\s+)$/.test(b)) break; i = bundle.indexOf(name + '(', i + 1) }
  const b0 = bundle.indexOf('{', i)
  let d = 0, e = -1, str = null, esc = false
  for (let k = b0; k < bundle.length; k++) { const c = bundle[k]; if (esc) { esc = false; continue } if (c === '\\') { esc = true; continue } if (str) { if (c === str) str = null; continue } if (c === '"' || c === "'" || c === '`') { str = c; continue } if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { e = k + 1; break } } }
  const head = bundle.slice(i, b0).slice(name.length).replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const isA = /async\s*$/.test(bundle.slice(Math.max(0, i - 30), i))
  return new Function('return (' + (isA ? 'async ' : '') + 'function ' + name + head + bundle.slice(b0, e) + ')')()
}
const discoveryJs = grab('buildCanvasDiscoveryJs')()
const readJs0 = grab('buildCanvasReadJs')(0)
const clickJs = grab('buildCoordClickJs')(410, 30)
const markerJs = `(function(){var m=document.getElementById('clicked-marker');return JSON.stringify({present:!!m,text:m?m.textContent:null})})()`

;(async () => {
  // ① 探针
  const probe = await cmd('exec', { session: 'dsh', surface: 'browser', code: '1' }, 3000)
  check('探针:协议在', probe.j.ok === true, JSON.stringify(probe.j).slice(0, 80))

  // ② 导航到测试页(直连 navigate;响应 page 身份)
  let page = undefined
  const nav = await cmd('navigate', { session: 'dsh', surface: 'browser', url: `http://127.0.0.1:${PORT}/canvas-test` }, 60000)
  check('导航:直连 navigate ok', nav.j.ok === true, JSON.stringify(nav.j).slice(0, 100))
  if (nav.j.ok && typeof nav.j.page === 'string') page = nav.j.page
  await sleep(1500)

  // ③ discover(带缓存 page)
  const d = await cmd('exec', { session: 'dsh', surface: 'browser', code: discoveryJs, ...(page !== undefined ? { page } : {}) })
  let dv = null
  try { const raw = typeof d.j.data === 'string' ? d.j.data : JSON.stringify(d.j.data); dv = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch {}
  if (d.j.ok && typeof d.j.page === 'string') page = d.j.page
  check('discover:count=2 且 id=board', dv && dv.count === 2 && dv.canvases && dv.canvases[0].id === 'board', JSON.stringify(dv).slice(0, 140))
  check('页面身份:响应持续刷新', typeof page === 'string' && page.length > 0, 'page=' + String(page).slice(0, 12) + '…')

  // ④ read(带最新 page)
  const r = await cmd('exec', { session: 'dsh', surface: 'browser', code: readJs0, page }, 60000)
  let rv = null
  try { const raw = typeof r.j.data === 'string' ? r.j.data : JSON.stringify(r.j.data); rv = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch {}
  check('read:PNG b64 + 300x150', r.j.ok && rv && String(rv.b64).startsWith('iVBOR') && rv.w === 300 && rv.h === 150, 'b64len=' + (rv && rv.b64 ? rv.b64.length : 'n/a'))
  if (r.j.ok && typeof r.j.page === 'string') page = r.j.page
  // 像素级采样(50,50) 应为 #d00
  if (rv && typeof rv.b64 === 'string') {
    const px = pixelAt(Buffer.from(rv.b64, 'base64'), 50, 50)
    check('像素级 (50,50)=[221,0,0] #d00', px && px[0] > 180 && px[1] < 60 && px[2] < 60, JSON.stringify(px))
  }

  // ⑤ click + marker
  const c = await cmd('exec', { session: 'dsh', surface: 'browser', code: clickJs, page })
  let cv = null
  try { const raw = typeof c.j.data === 'string' ? c.j.data : JSON.stringify(c.j.data); cv = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch {}
  check('click:BUTTON 命中', c.j.ok && cv && cv.clicked === true && cv.tag === 'BUTTON', JSON.stringify(cv))
  const m = await cmd('exec', { session: 'dsh', surface: 'browser', code: markerJs, page })
  let mv = null
  try { const raw = typeof m.j.data === 'string' ? m.j.data : JSON.stringify(m.j.data); mv = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch {}
  check('点击生效:CLICKED 标记', m.j.ok && mv && mv.present === true, JSON.stringify(mv))

  // ⑥ 延迟对照:同一条 discover 走 CLI vs 直连
  const CLI = require('child_process').execSync('npm root -g').toString().trim() + '/@jackwener/opencli/dist/src/main.js'
  const { spawnSync } = require('child_process')
  const t1 = Date.now()
  spawnSync(process.execPath, [CLI, 'browser', 'eval', '--session', 'dsh', discoveryJs], { encoding: 'utf8', timeout: 90000 })
  const cliMs = Date.now() - t1
  const dm = await cmd('exec', { session: 'dsh', surface: 'browser', code: discoveryJs, page })
  check('延迟对照:直连显著快于 CLI', dm.j.ok === true && dm.ms < cliMs, `直连 ${dm.ms}ms vs CLI ${cliMs}ms(${(cliMs / Math.max(dm.ms, 1)).toFixed(1)}×)`)

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail > 0 ? 1 : 0)
})().catch((e) => { console.error('FATAL', e); process.exit(1) })

function pixelAt(buf, x, y) {
  let pos = 8, idat = [], w, h
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8); if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12) } if (type === 'IDAT') idat.push(buf.slice(pos + 8, pos + 8 + len)); pos += len + 12 }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = 1 + 4 * w, lines = []
  function paeth(a, b, c2) { const p = a + b - c2, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c2); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c2 }
  for (let yy = 0; yy < h; yy++) { const f = raw[yy * stride], st = yy * stride + 1, line = new Uint8Array(4 * w); for (let xx = 0; xx < 4 * w; xx++) { const cur = raw[st + xx], left = xx >= 4 ? line[xx - 4] : 0, up = yy > 0 ? lines[yy - 1][xx] : 0, ul = (yy > 0 && xx >= 4) ? lines[yy - 1][xx - 4] : 0; line[xx] = f === 0 ? cur : f === 1 ? cur + left : f === 2 ? cur + up : f === 3 ? cur + ((left + up) >> 1) : cur + paeth(left, up, ul) } lines.push(line) }
  const i = x * 4
  return [lines[y][i], lines[y][i + 1], lines[y][i + 2]]
}
