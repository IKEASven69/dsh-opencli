// 缝合测试(2026-10-30):真实部署包的 saveCanvasReadShot + 真实 daemon 信封输出 → 真实落盘。
// 背景与边界:canvas_read 的完整工具链已由 tests/vom.test.ts 用「真 lib 服务实例 + 桩 shell」
// 验证(执行/落盘/轨迹 shot/文本提示);直连链路今日 11/11 真机全通。本脚本只补剩下的一条缝:
// 用「今天真 daemon 返回的真实信封字节」喂「部署包里的真实函数」,产物写进真实 shots 目录。
// 唯一模拟物:this 上下文(shotsDir/shotSeq)与两个静态方法的重建——函数体逐字节来自部署包。
// 用法:node .build-tools/derive-shot-bridge.cjs
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const zlib = require('node:zlib')

const STORE = path.join(os.homedir(), '.dsh/profiles/web/node_modules/dsh-opencli/lib/index.js')
const CLI = require('child_process').execSync('npm root -g').toString().trim() + '/@jackwener/opencli/dist/src/main.js'
const REAL_SHOTS = path.join(os.homedir(), '.dsh/opencli-shots')

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n + (d ? ' — ' + String(d).slice(0, 160) : '')) } else { fail++; console.log('  FAIL ' + n + ' — ' + String(d).slice(0, 220)) } }

// ── 1. 部署包抽取(saveCanvasReadShot + 两个静态方法源码) ─────────────
const bundle = fs.readFileSync(STORE, 'utf8')
/** 括号配平抓取:只认定义处(前面是 static/async/function 前缀),跳过 .name( 调用点 */
function grabFnExpr(name) {
  let idx = bundle.indexOf(name + '(')
  while (idx >= 0) {
    const before = bundle.slice(Math.max(0, idx - 30), idx)
    if (/(\bstatic\s+|\basync\s+|\bfunction\s+)$/.test(before)) break
    idx = bundle.indexOf(name + '(', idx + 1)
  }
  if (idx < 0) throw new Error('bundle 缺 ' + name + ' 的定义')
  const before = bundle.slice(Math.max(0, idx - 30), idx)
  const isAsync = /async\s*$/.test(before)
  // 从标识符后的第一个 '{' 配平到闭合(字符串/转义感知)
  const brace0 = bundle.indexOf('{', idx)
  let depth = 0, end = -1, inStr = null, esc = false
  for (let k = brace0; k < bundle.length; k++) {
    const c = bundle[k]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (inStr) { if (c === inStr) inStr = null; continue }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { end = k + 1; break } }
  }
  if (end < 0) throw new Error(name + ' 括号未闭合')
  // 参数表:标识符到 '{' 之间(剥掉 static/async 字样与注释)
  let params = bundle.slice(idx, brace0).slice(name.length)
  params = params.replace(/\/\*[\s\S]*?\*\//g, '').trim()
  return { isAsync, expr: `(${isAsync ? 'async ' : ''}function ${name}${params}${bundle.slice(brace0, end)})` }
}
// saveCanvasReadShot 引用 extractJsonObject(bundle 内函数)与 OpencliService/Buffer/fs 等——
// 打包器会带数字后缀改名(join3/writeFile2/Buffer2…),从源码动态收集真实标识符再逐一绑定真模块
const { mkdir: fsMkdir, writeFile: fsWriteFile } = require('node:fs/promises')
const extractJsonObject = new Function('return ' + grabFnExpr('extractJsonObject').expr)()
const saveExpr = grabFnExpr('saveCanvasReadShot')
// OpencliService 伪类:两个静态方法逐字节来自部署包
const OpencliService = {
  traceDateKey: new Function('return ' + grabFnExpr('traceDateKey').expr)(),
  shotClock: new Function('return ' + grabFnExpr('shotClock').expr)(),
}
// 依源码里的实际标识符(含改名后缀)构造形参并绑定真实现
const refMap = [
  [/^(mkdir\d*)$/, fsMkdir], [/^(writeFile\d*)$/, fsWriteFile], [/^(join\d*)$/, path.join],
  [/^(existsSync\d*)$/, fs.existsSync], [/^(Buffer\d*)$/, Buffer],
  [/^(extractJsonObject\d*)$/, extractJsonObject], [/^(_?OpencliService\S*)$/, OpencliService],
]
const ids = [...new Set(saveExpr.expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [])]
const names = [], values = []
for (const id of ids) {
  for (const [re, val] of refMap) { if (re.test(id)) { names.push(id); values.push(val); break } }
}
const realSave = new Function(...names, 'return ' + saveExpr.expr)(...values)
console.log('[extract] saveCanvasReadShot(' + saveExpr.isAsync + ') 绑定标识符: ' + names.join(','))
console.log('[extract] saveCanvasReadShot/traceDateKey/shotClock/extractJsonObject 全部取自部署包(async=' + saveExpr.isAsync + ') ' + STORE)
// ── 2. 真实 daemon 信封:此刻真发一次 canvas read eval ────────────────
const readJs = `(function(){try{var i=0,l=document.querySelectorAll('canvas'),c=l[i];if(!c)return JSON.stringify({error:'no canvas at index '+i+' (page has '+l.length+')'});var u=c.toDataURL('image/png');return JSON.stringify({index:i,w:c.width,h:c.height,b64:u.slice(u.indexOf(',')+1)})}catch(e){return JSON.stringify({error:String(e&&e.message||e)})}})()`
const r = spawnSync(process.execPath, [CLI, 'browser', 'eval', '--session', 'dsh', readJs], { encoding: 'utf8', timeout: 90_000 })
const realStdout = r.stdout || ''
console.log('[real-eval] exit=' + r.status + ' stdout 头=' + realStdout.slice(0, 120).replace(/\n/g, ' '))
check('真实 daemon 返回信封含 b64', realStdout.includes('iVBOR'))
// 解包调试:两层信封逐层可见
const dbgOuter = extractJsonObject(realStdout)
console.log('[dbg] outer: type=' + typeof dbgOuter + ' keys=' + (dbgOuter && Object.keys(dbgOuter).join(',')))
if (dbgOuter !== null && typeof dbgOuter === 'object' && typeof dbgOuter.data === 'string') {
  const dbgInner = extractJsonObject(dbgOuter.data)
  console.log('[dbg] inner: keys=' + (dbgInner && Object.keys(dbgInner).join(',')) + ' b64len=' + (dbgInner && typeof dbgInner.b64 === 'string' ? dbgInner.b64.length : 'n/a'))
}

// ── 3. 真实函数吃真实信封(this=真实 shots 目录) ─────────────────────
;(async () => {
  const before = countPngs(REAL_SHOTS)
  const shotPath = await realSave.call({ shotsDir: REAL_SHOTS, shotSeq: 900 }, 'dsh', 0, { exitCode: 0, stdout: realStdout })
  check('真实函数返回落盘路径', typeof shotPath === 'string' && /canvas-\d{6}-\d+-i0\.png$/.test(String(shotPath).replaceAll('\\', '/')), String(shotPath))
  if (typeof shotPath === 'string') {
    const buf = fs.readFileSync(shotPath)
    check('PNG 魔数 89 50 4E 47', buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, buf.length + 'B')
    check('目录层级 = shots/<yyyymmdd>/dsh/', shotPath.replaceAll('\\', '/').includes('/' + todayKey() + '/dsh/canvas-'))
    // 像素级:解 PNG 采样 (50,50) 应为 #d00(测试页红方块)
    const px = pixelAt(buf, 50, 50)
    check('像素级 (50,50) = [221,0,0] #d00', px && px[0] > 180 && px[1] < 60 && px[2] < 60, JSON.stringify(px))
    console.log('  ↳ 产物: ' + shotPath)
  }
  // 失败出口:exit≠0 / 垃圾输出 → undefined 不落盘
  const bad = await realSave.call({ shotsDir: REAL_SHOTS, shotSeq: 901 }, 'dsh', 0, { exitCode: 1, stdout: realStdout })
  check('exit≠0 → undefined(回落常规链路)', bad === undefined)
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail > 0 ? 1 : 0)
})().catch((e) => { console.error('FATAL', e); process.exit(1) })

function countPngs(dir) { let n = 0; try { for (const d of fs.readdirSync(dir)) { try { n += fs.readdirSync(path.join(dir, d)).length } catch {} } } catch {} return n }
function todayKey() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }
function pixelAt(buf, x, y) {
  let pos = 8, idat = [], w, h
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12) }
    if (type === 'IDAT') idat.push(buf.slice(pos + 8, pos + 8 + len))
    pos += len + 12
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = 1 + 4 * w, lines = []
  function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
  for (let yy = 0; yy < h; yy++) {
    const f = raw[yy * stride], start = yy * stride + 1, line = new Uint8Array(4 * w)
    for (let xx = 0; xx < 4 * w; xx++) {
      const cur = raw[start + xx], left = xx >= 4 ? line[xx - 4] : 0, up = yy > 0 ? lines[yy - 1][xx] : 0, ul = (yy > 0 && xx >= 4) ? lines[yy - 1][xx - 4] : 0
      line[xx] = f === 0 ? cur : f === 1 ? cur + left : f === 2 ? cur + up : f === 3 ? cur + ((left + up) >> 1) : cur + paeth(left, up, ul)
    }
    lines.push(line)
  }
  const i = x * 4 // lines[y] 本身就是该行:像素 (x,y) 在行内偏移 x*4
  return [lines[y][i], lines[y][i + 1], lines[y][i + 2]]
}
