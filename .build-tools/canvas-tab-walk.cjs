// canvas tab 专项走查(补前端走查漏项):画布 tab 的 canvas 命令卡片+缩放+子标题。
// 前置:测试页已绑定 session dsh;canvas eval 轨迹已落盘。
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
let EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
try { const root = 'C:/Program Files (x86)/Microsoft/Edge/Application'; const v = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse(); if (v.length) EDGE = root + '/' + v[0] + '/msedge.exe'; } catch {}
const TOKEN = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n + (d ? ' — ' + String(d).slice(0, 120) : '')) } else { fail++; console.log('  FAIL ' + n + ' — ' + String(d).slice(0, 200)) } }
;(async () => {
  const port = 9367, udd = 'C:/Users/20369/AppData/Local/Temp/pptr-cv-final';
  const edge = spawn(EDGE, ['--remote-debugging-port=' + port, '--user-data-dir=' + udd, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1240,1400', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 20; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1200) }); if (r.ok) break } catch {} await sleep(500) }
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  await page.goto('http://127.0.0.1:3123/?token=' + TOKEN, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(6000);
  await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press(','); await page.keyboard.up('Alt'); await page.keyboard.up('Control');
  await sleep(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=tab], div')].find(x => (x.textContent || '').trim() === '浏览器代理'); if (b) b.click() });
  let ready = false;
  for (let i = 0; i < 15 && !ready; i++) { await sleep(2000); ready = await page.evaluate(() => [...document.querySelectorAll('.o4-in')].some(x => x.placeholder === 'site zhihu hot')) }
  check('总览就绪', ready);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === '画布').pop(); if (b) b.click() });
  await sleep(4500);
  const c = await page.evaluate(() => ({
    title: [...document.querySelectorAll('.o4-h3, .o4 div')].some(x => (x.textContent || '').includes('画布')),
    cards: document.querySelectorAll('.o4-card').length,
    qrows: document.querySelectorAll('.o4-qrow').length,
    canvasEval: [...document.querySelectorAll('.o4 *')].some(x => (x.textContent || '').includes('querySelectorAll')),
    zoom: [...document.querySelectorAll('.o4-btn')].some(x => /放大|缩小/.test(x.textContent || '')),
    sub: [...document.querySelectorAll('.o4-sub')].some(x => (x.textContent || '').includes('canvas_read')),
  }));
  check('画布标题渲染', c.title);
  const zoomBtns = await page.evaluate(() => [...document.querySelectorAll('.o4-btn')].filter(x => /^[+-]$/.test((x.textContent || '').trim())).length);
  check('缩放控件(+/− 按钮)', zoomBtns >= 2, 'count=' + zoomBtns);
  check('副标题含 canvas_read(两层说明)', c.sub);
  const cvCards = await page.evaluate(() => document.querySelectorAll('.o4-cvcard').length);
  const cvText = await page.evaluate(() => { const el = document.querySelector('.o4-cvwrap'); return el ? (el.textContent || '').slice(0, 300) : '(no cvwrap)'; });
  console.log('cvwrap:', cvText.slice(0, 150));
  const hasSchedule = await page.evaluate(() => [...document.querySelectorAll('.o4-cvcard *')].some(x => (x.textContent || '').includes('site zhihu hot')));
  check('画布卡片渲染(.o4-cvcard)', cvCards > 0, 'cards=' + cvCards);
  check('采集卡含真实站点(zhihu)', hasSchedule);
  // canvas eval 轨迹卡分页验证:走 RPC 而不是翻 UI 页
  const traceOk = await page.evaluate(async () => { const r = await fetch('/api/opencli/trace-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'cv', method: 'opencli/trace-list', payload: { args: { request: { limit: 500 } } } }) }); const j = await r.json(); return (j.result?.value?.traces ?? []).some((x) => (x.cmd || '').includes('querySelectorAll')) });
  check('canvas eval 轨迹在数据源(traces)', traceOk);
  await page.screenshot({ path: 'D:/CodingProjects/dsh-opencli-release/.qa/046-ui-canvas.png' });
  console.log(`\ncanvas tab: ${pass} PASS / ${fail} FAIL`);
  await browser.disconnect(); edge.kill();
  process.exit(fail > 0 ? 1 : 0)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
