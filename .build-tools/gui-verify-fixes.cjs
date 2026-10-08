// GUI 走查修复(2026-10-08)真机复验:与 full-review.cjs 同款自管 Edge(CDP)+ puppeteer.connect。
// 复验项:修复1a run-now 后行内状态自动刷新(采样行文本随时间变化)/ 修复1b verdict ✗ 渲染 /
// 修复2 时间线卡片独占整行不裁切 / 修复3 刷新芯片等高 / 修复4 占位文字对比度 /
// 修复5 定时执行写 trace(宿主侧已验,此处链路复跑)。
// 用法:node .build-tools/gui-verify-fixes.cjs <token>
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
try {
  const root = 'C:/Program Files (x86)/Microsoft/Edge/Application';
  const vers = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse();
  if (vers.length > 0) EDGE = root + '/' + vers[0] + '/msedge.exe';
} catch {}
if (!fs.existsSync(EDGE)) EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'D:/CodingProjects/dsh-opencli-release/.qa/gui-20261008';
const STATE = 'C:/Users/20369/.dsh/dsh-opencli-state.json';
const TRACE_DIR = 'C:/Users/20369/.dsh/opencli-traces';
const BASE = 'http://127.0.0.1:3123';
const TOKEN = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 9334;
  const udd = 'C:/Users/20369/AppData/Local/Temp/pptr-fixverify';
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  const edge = spawn(EDGE, [
    '--remote-debugging-port=' + port, '--user-data-dir=' + udd,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars',
    '--window-size=1240,1400', 'about:blank',
  ], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 24; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1500) }); if (r.ok) { up = true; break; } } catch {}
    await sleep(500);
  }
  if (!up) { console.error('CDP not up'); process.exit(1); }
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  const clickBtn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, label);
  const setNative = (el, v) => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const autoCardText = () => page.evaluate(() => { const row = [...document.querySelectorAll("[role='dialog'] .o4-row")].find(x => (x.innerText || '').includes('立即跑')); return row ? row.innerText.replace(/\n/g, '|').slice(0, 400) : '(row-not-found)'; });

  // 进面板 → 自动化
  const r1 = await clickBtn('设置'); await sleep(1200);
  const r2 = await clickBtn('浏览器代理'); await sleep(2000);
  // 等 daemon 预热完成(自动化 tab 出现 创建 按钮),最多 30s
  let r3 = false;
  for (let i = 0; i < 15; i++) {
    r3 = await clickBtn('自动化');
    const ready = await page.evaluate(() => { const dlg = document.querySelector("[role='dialog']"); return !!dlg && [...dlg.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '创建'); });
    if (r3 && ready) break;
    await sleep(2000);
  }
  console.log(`NAV set=${r1} proxy=${r2} auto=${r3}`);

  // GUI 建任务(与面板手动输入同路径);只填可见的那个 site 输入(自动化 tab 的,非总览试试看)
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input[placeholder='site zhihu hot']")].filter(i => i.offsetParent !== null).pop();
    if (inp) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(inp, 'site zhihu hot'); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  let created = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    await clickBtn('创建'); await sleep(3000);
    created = JSON.parse(fs.readFileSync(STATE, 'utf8')).schedules.find(s => s.site === 'site zhihu hot');
  }
  console.log(`CREATED id=${created ? created.id : 'none'}`);
  if (!created) { console.log('RESULT ' + JSON.stringify({ fail: 'schedule-not-created' })); await browser.disconnect(); edge.kill(); process.exit(1); }

  const t0 = await autoCardText();
  console.log(`ROW-T0 ${t0}`);
  await page.screenshot({ path: path.join(OUT, 'fix1-t0-创建后.png') });

  // 立即跑 → 采样行文本(修复1a:客户端 2.5s~240s 分散刷新,应在上次尝试落盘后自动更新行内状态)
  // 重试节奏:每次尝试 ~46s + 15s 间隔 → #1 落盘 ~46s,#2 ~107s,#3 ~168s;采样覆盖全程
  await clickBtn('立即跑');
  const runAt = Date.now();
  const samples = [];
  for (const waitSec of [40, 40, 45, 45, 45]) {
    await sleep(waitSec * 1000);
    const txt = await autoCardText();
    const elapsed = Math.round((Date.now() - runAt) / 1000);
    samples.push({ at: `${elapsed}s`, text: txt });
    console.log(`ROW@${elapsed}s ${txt.slice(0, 220)}`);
  }
  fs.writeFileSync(path.join(OUT, 'fix1-samples.json'), JSON.stringify(samples, null, 1));
  const before = samples[0].text, after = samples[samples.length - 1].text;
  const updated = !after.includes('上次 —') && after.includes('✗');
  console.log(`FIX1A rowAutoUpdated=${updated} (T0 含 '上次 —': ${before.includes('上次 —')}, 末采样含 '✗': ${after.includes('✗')})`);

  // 时间线展开(修复2:卡片应独占整行;修复4:占位文字对比度)截图取证
  await clickBtn('时间线'); await sleep(2600);
  await page.screenshot({ path: path.join(OUT, 'fix2-时间线展开.png') });
  const tl = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.o4-card')].find(c => c.innerText.includes('采集快照趋势'));
    if (!card) return { found: false };
    const row = card.closest('.o4-row');
    const r = card.getBoundingClientRect(), rowR = row ? row.getBoundingClientRect() : { left: r.left, right: r.right };
    const ph = [...card.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').includes('暂无快照'));
    const phColor = ph ? getComputedStyle(ph).color : null;
    return { found: true, cardW: Math.round(r.width), rowW: Math.round(rowR.width), spansRow: Math.abs(r.left - rowR.left) < 8 && Math.abs(r.right - rowR.right) < 8, phColor };
  });
  console.log(`FIX2/4 timeline: ${JSON.stringify(tl)}`);

  // 芯片行等高(修复3):切总览截图 + 几何读取
  await clickBtn('总览'); await sleep(1500);
  const chips = await page.evaluate(() => {
    const row = document.querySelector('.o4-status');
    if (!row) return null;
    const list = [...row.children].map(c => ({ h: Math.round(c.getBoundingClientRect().height), cls: c.className }));
    return list;
  });
  console.log(`FIX3 chips: ${JSON.stringify(chips)}`);
  await page.screenshot({ path: path.join(OUT, 'fix3-总览芯片行.png') });

  // 修复5 链路复跑:上次立即跑应已写 trace(读当日文件 schedule 行)
  const today = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const tf = path.join(TRACE_DIR, `trace-${today.getFullYear()}${p2(today.getMonth() + 1)}${p2(today.getDate())}.jsonl`);
  let schedTraces = [];
  try {
    schedTraces = fs.readFileSync(tf, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).filter(t => String(t.cmd).startsWith('schedule '));
  } catch {}
  console.log(`FIX5 schedule-traces-today=${schedTraces.length} last=${JSON.stringify(schedTraces[schedTraces.length - 1] ?? null)?.slice(0, 200)}`);

  // 清理:删任务,恢复现场
  await clickBtn('自动化'); await sleep(1200);
  await clickBtn('删'); await sleep(2000);
  const left = JSON.parse(fs.readFileSync(STATE, 'utf8')).schedules.length;
  console.log(`CLEANUP schedules-left=${left}`);
  console.log('RESULT ' + JSON.stringify({ fix1a: updated, fix2: tl.found && tl.spansRow, fix4ph: tl.phColor, fix5count: schedTraces.length }));
  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
