// 真机 canvas VOM 三件套验收(2026-10-28):不经桩,走 CLI(2.0.0)→daemon(1.8.6)→扩展(1.0.26)→真实浏览器。
// 页面 JS 从「部署到 daemon 商店的 lib/index.js」运行时抽取——与产品字节严格一致,非手抄。
// CLI 输出按 unwrapCli2 同款双层解包:{"ok":true,"data":"<内层 JSON 字符串>"}。
// browser open 是驻留流式命令(exit 恒 null)——开火后用 discover 轮询验证 tab 真开了。
// 用法:node .build-tools/canvas-real-test.cjs
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')

const PORT = 18777
const STORE = path.join(os.homedir(), '.dsh/profiles/web/node_modules/dsh-opencli/lib/index.js')
const CLI_ENTRY = require('child_process').execSync('npm root -g').toString().trim() + '/@jackwener/opencli/dist/src/main.js'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1. 从部署包抽取三段 eval 桥 JS(字节级等于产品) ─────────────────
const bundle = fs.readFileSync(STORE, 'utf8')
function extractFn(name) {
  const i = bundle.indexOf('function ' + name + '(')
  const j = bundle.indexOf('\nfunction ', i + 10)
  if (i < 0 || j < 0) throw new Error('bundle 里找不到 ' + name)
  return new Function('return ' + bundle.slice(i, j).trim())()
}
const discoveryJs = extractFn('buildCanvasDiscoveryJs')()
const readJs0 = extractFn('buildCanvasReadJs')(0)
const readJsBad = extractFn('buildCanvasReadJs')(99)
const clickJs = extractFn('buildCoordClickJs')(410, 30)
const markerJs = `(function(){var m=document.getElementById('clicked-marker');return JSON.stringify({present:!!m,text:m?m.textContent:null})})()`
console.log('[extract] discovery ' + discoveryJs.length + 'B / read0 ' + readJs0.length + 'B / click ' + clickJs.length + 'B — 来源:部署包 ' + STORE)

// ── 2. 本地测试页:两块 canvas(一块带 id)+ 固定坐标点击按钮 ─────────
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
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML) })

// ── 3. CLI 调用(node 直调入口,绕开 .cmd 引用);unwrapCli2 同款解包 ──
function cliSync(args, timeout = 90_000) {
  const r = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', timeout })
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')) }
}
function browserEval(js) { return cliSync(['browser', 'eval', '--session', 'dsh', js]) }
// 双层解包:外层 {"ok":true,"data":"<json 字符串>"} → 内层对象;旧版裸输出 → 直接找 {}
function unwrap(out) {
  try {
    const o = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    if (o && typeof o.data === 'string') {
      try { return JSON.parse(o.data.slice(o.data.indexOf('{'), o.data.lastIndexOf('}') + 1)) } catch { return o }
    }
    return o
  } catch { return null }
}

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + detail : '')) }
  else { fail++; console.log('  FAIL ' + name + ' — ' + String(detail).slice(0, 300)) }
}

server.listen(PORT, '127.0.0.1', () => {
  (async () => {
    // 打开测试页:fire-and-forget(open 驻留流式不退出),用 discover 轮询验证 tab 真开
    spawn(process.execPath, [CLI_ENTRY, 'browser', 'open', '--session', 'dsh', `http://127.0.0.1:${PORT}/canvas-test`], { stdio: 'ignore', detached: true }).unref()
    console.log('[open] 已发起(fire-and-forget),轮询 discover 验证 tab…')
    let opened = false
    for (let i = 0; i < 8; i++) {
      await sleep(3000)
      const t = unwrap(browserEval(discoveryJs).out)
      if (t && t.count === 2) { opened = true; break }
    }
    check('测试页真实打开(session dsh 绑定本页)', opened)

    // ① discover:两块画布、带 id 的那块 index 0、几何合理(±2px 容差,边框 1px)
    const d = browserEval(discoveryJs)
    const dv = unwrap(d.out)
    console.log('[discover] exit=' + d.code + ' count=' + (dv && dv.count))
    check('discover exit 0', d.code === 0)
    check('discover count=2', dv && dv.count === 2)
    const c0 = dv && dv.canvases && dv.canvases[0]
    check('discover[0].id=board, x≈20 y≈20 w≈300(±2)', !!c0 && c0.id === 'board' && Math.abs(c0.x - 20) <= 2 && Math.abs(c0.y - 20) <= 2 && Math.abs(c0.w - 300) <= 2, JSON.stringify(c0))
    const c1 = dv && dv.canvases && dv.canvases[1]
    check('discover[1] 无 id 字段且 y≈200', !!c1 && c1.id === undefined && Math.abs(c1.y - 200) <= 2, JSON.stringify(c1))

    // ② read(0):PNG base64 头 + 缓冲分辨率
    const r0 = browserEval(readJs0)
    const rv = unwrap(r0.out)
    console.log('[read0] exit=' + r0.code + ' b64len=' + (rv && rv.b64 ? rv.b64.length : 'n/a') + ' w=' + (rv && rv.w) + ' h=' + (rv && rv.h))
    check('read(0) exit 0 且返回 b64', r0.code === 0 && !!rv && typeof rv.b64 === 'string' && rv.b64.length > 100)
    check('read(0) PNG 魔数(iVBOR)', !!rv && String(rv.b64).startsWith('iVBOR'), String(rv && rv.b64).slice(0, 24))
    check('read(0) w=300 h=150(缓冲分辨率,非 CSS)', !!rv && rv.w === 300 && rv.h === 150, JSON.stringify(rv && { w: rv.w, h: rv.h }))
    if (rv && typeof rv.b64 === 'string') {
      fs.writeFileSync(path.join(__dirname, '..', '.qa', '045-canvas-read-real.png'), Buffer.from(rv.b64, 'base64'))
      console.log('  ↳ 已落盘 .qa/045-canvas-read-real.png(人眼复核红方块)')
    }

    // ②b read(99):错误形态(页面只有 2 块)
    const rb = browserEval(readJsBad)
    check('read(99) 报 no canvas at index 99', rb.out.includes('no canvas at index 99'), rb.out.slice(0, 140).replace(/\n/g, ' '))

    // ③ coordClick(410,30):命中 hit 按钮 → 页面留下 CLICKED 标记
    const c = browserEval(clickJs)
    const cv = unwrap(c.out)
    console.log('[click] exit=' + c.code + ' ' + JSON.stringify(cv))
    check('click(410,30) clicked=true tag=BUTTON', !!cv && cv.clicked === true && cv.tag === 'BUTTON', JSON.stringify(cv))
    const m = browserEval(markerJs)
    const mv = unwrap(m.out)
    check('点击真实生效:页面 CLICKED 标记出现', !!mv && mv.present === true && /CLICKED @ \d+/.test(String(mv.text)), JSON.stringify(mv))

    console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
    server.close()
    process.exit(fail > 0 ? 1 : 0)
  })().catch((e) => { console.error('FATAL', e); server.close(); process.exit(1) })
})
