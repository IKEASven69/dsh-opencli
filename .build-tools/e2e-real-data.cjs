// 登录态真数据端到端验收(2026-10-09):桥已通(v1.8.8 + 扩展 + 档案 62fd4dgs)。
// 全部经插件产品面(3123 dsh web 网关 RPC)——不是裸 CLI:try-run 卡片 / 登录态巡检 /
// 定时任务→真实采集→快照落盘→时间线→报告生成。截图取证。
// 用法:node .build-tools/e2e-real-data.cjs <token>
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
const OUT = 'D:/CodingProjects/dsh-opencli-release/.qa/gui-20261009-realdata';
const SNAPDIR = 'C:/Users/20369/.dsh/opencli-snapshots';
const BASE = 'http://127.0.0.1:3123';
const TOKEN = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rpcBody = (m, args) => JSON.stringify({ type: 'client-request', rpcId: 'e2e-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), method: 'opencli/' + m, payload: { args } });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 9335;
  const udd = 'C:/Users/20369/AppData/Local/Temp/pptr-e2e-real';
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
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null, protocolTimeout: 600_000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  const clickBtn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, label);
  const openSettings = async () => { if (await clickBtn('设置')) return true; await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press(','); await page.keyboard.up('Alt'); await page.keyboard.up('Control'); await sleep(900); return page.evaluate(() => !!document.querySelector("[role='dialog']")); }; 
  // 页面上下文里发插件 RPC(与面板完全同通道)
  const rpc = (m, args) => page.evaluate(async ({ m, body }) => {
    const res = await fetch('/api/opencli/' + m, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return await res.text();
  }, { m, body: rpcBody(m, args) }).then((t) => { try { return JSON.parse(t).result; } catch { return { ok: false, raw: t.slice(0, 200) }; } });

  // 1) try-run 真数据卡片(试试看后端)
  const t1 = await rpc('try-run', { request: { line: 'site juejin hot' } });
  const t1v = t1 && t1.value ? t1.value : t1;
  console.log('TRY-RUN ok=' + (t1v && t1v.ok) + ' outLen=' + (t1v && t1v.output ? String(t1v.output).length : (t1v && t1v.stdout ? String(t1v.stdout).length : 'n/a')));
  console.log('TRY-RUN head=' + JSON.stringify(t1v).slice(0, 300));

  // 2) 登录态巡检(zhihu/bilibili/github 三站)
  const t2 = await rpc('login-check', {});
  console.log('LOGIN-CHECK ' + JSON.stringify(t2).slice(0, 400));

  // 3) 定时任务 → 立即跑(v2ex,真实采集)→ 快照
  const t3 = await rpc('schedule-add', { request: { site: 'site juejin hot', cron: '0 4 * * *', retry: 1, notify: false } });
  const sid = t3 && t3.value ? t3.value.id : null;
  console.log('SCHEDULE-ADD id=' + sid);
  if (sid) {
    await rpc('schedule-run-now', { p: { id: sid } });
    console.log('RUN-NOW fired, waiting for real collection...');
    for (let i = 0; i < 10; i++) {
      await sleep(15_000);
      const h = await rpc('schedule-history', { p: { id: sid } });
      const hist = h && h.value ? h.value.history : [];
      const snaps = h && h.value ? (h.value.snapshots ?? []) : [];
      console.log(`  @${(i + 1) * 15}s history=${hist.length} first=${hist[0] ? (hist[0].ok + ' ' + String(hist[0].summary).slice(0, 60).replace(/\n/g, ' ')) : '—'} snaps=${snaps.length}`);
      if (hist.length > 0 && snaps.length > 0) break;
    }
    // 4) 时间线面板真实渲染 + 报告生成
    await openSettings(); await sleep(1200);
    await clickBtn('浏览器代理'); await sleep(1800);
    await clickBtn('自动化'); await sleep(1200);
    const rowTxt = await page.evaluate(() => { const row = [...document.querySelectorAll("[role='dialog'] .o4-row")].find(x => (x.innerText || '').includes('立即跑')); return row ? row.innerText.replace(/\n/g, '|').slice(0, 200) : '(no-row)'; });
    console.log('PANEL-ROW ' + rowTxt);
    await clickBtn('时间线'); await sleep(2600);
    await page.screenshot({ path: path.join(OUT, 'real-时间线快照.png') });
    const tl = await page.evaluate(() => { const c = [...document.querySelectorAll('.o4-card')].find(x => x.innerText.includes('采集快照趋势')); return c ? c.innerText.replace(/\n/g, '|').slice(0, 300) : '(no-card)'; });
    console.log('TIMELINE ' + tl);
    // 5) 报告
    const t5 = await rpc('report-build', { request: { id: sid } });
    console.log('REPORT ' + JSON.stringify(t5).slice(0, 250));
    // 清理
    await rpc('schedule-remove', { request: { id: sid } });
    console.log('CLEANUP removed');
  }
  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
