// v0.4/v0.5 全权审查测试:自管 Edge(CDP)+ puppeteer.connect,面板全流程逐项验证
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
// 保险:探测到的版本目录刚被更新移除时,回退根启动器
if (!fs.existsSync(EDGE)) EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'D:/CodingProjects/dsh-opencli-release/.design/video-frames';
const STATE = 'C:/Users/20369/.dsh/dsh-opencli-state.json';
const BASE = 'http://127.0.0.1:3123';
const TOKEN = process.argv[2] || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, detail = '') => { results.push(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`); };

(async () => {
  const port = 9333;
  const udd = 'C:/Users/20369/AppData/Local/Temp/pptr-review';
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  const edge = spawn(EDGE, [
    '--remote-debugging-port=' + port, '--user-data-dir=' + udd,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars',
    '--window-size=1240,1400', 'about:blank',
  ], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 24; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1500) });
      if (r.ok) { up = true; break; }
    } catch {}
    await sleep(500);
  }
  if (!up) { console.error('CDP not up'); process.exit(1); }

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  const clickBtn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, label);
  const has = (t) => page.evaluate((t) => (document.querySelector("[role='dialog']")?.innerText || '').includes(t), t);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

  ok('打开 设置 弹窗', await clickBtn('设置')); await sleep(1200);
  ok('打开 浏览器代理 分区', await clickBtn('浏览器代理'));
  for (let w = 0; w < 30; w++) { if (await has('一切正常') || (await has('检测中')) && w > 20) break; await sleep(1500); }
  await sleep(4000);

  ok('总览·健康绿条', await has('一切正常'));
  ok('总览·试试看卡', await has('试试看'));
  ok('总览·快捷含 site_batch', await has('site_batch hot'));
  ok('总览·登录态巡检', await has('登录态巡检'));
  await shot('R1-总览.png');

  // 试试看真跑
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('试试看'));
    const input = p && p.querySelector("input[placeholder*='想跑什么命令']");
    if (input) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(input, 'site zhihu hot'); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('试试看')); const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '运行'); if (b) b.click(); });
  for (let w = 0; w < 70; w++) { const done = await page.evaluate(() => (document.querySelector('.o4-tryout') !== null)); if (done) break; await sleep(1000); }
  await sleep(1200);
  const runOut = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('$ site zhihu hot')); if (!p) return 'NO-OUTPUT'; const t = p.innerText; const i = t.indexOf('$ site zhihu hot'); return t.slice(i, i + 260); });
  ok('试试看·真执行返回', !String(runOut).includes('NO-OUTPUT'), String(runOut).slice(0, 90).replace(/\n/g, ' '));
  await shot('R2-试试看.png');

  // 审批门 关→开(状态文件核对)
  const approvalBefore = JSON.parse(fs.readFileSync(STATE, 'utf8')).approval;
  await clickBtn('安全与设置'); await sleep(2500);
  const offClicked = await page.evaluate(() => { const sec = document.querySelector('.o4-sec'); const sw = sec && sec.querySelector('.o4-sw'); if (sw) { sw.click(); return true; } return false; });
  await sleep(2200);
  const approvalAfter = JSON.parse(fs.readFileSync(STATE, 'utf8')).approval;
  ok('审批门·关闭落盘', offClicked === true && approvalAfter === 'off', 'before=' + approvalBefore + ' after=' + approvalAfter);
  const onClicked = await page.evaluate(() => { const sec = document.querySelector('.o4-sec'); const sw = sec && sec.querySelector('.o4-sw'); if (sw) { sw.click(); return true; } return false; });
  await sleep(2200);
  const approvalBack = JSON.parse(fs.readFileSync(STATE, 'utf8')).approval;
  ok('审批门·恢复开启', onClicked === true && approvalBack === 'on');

  // 命令页
  await clickBtn('命令'); await sleep(2800);
  ok('命令页·176 计数', await has('176 · 176'));
  ok('命令页·品牌头像', await page.evaluate(() => document.querySelectorAll('.o4-ava svg, .o4-ava img').length > 0));
  await shot('R3-命令页.png');

  // 安全与设置 + 登录态桥卡(关键)
  await clickBtn('安全与设置'); await sleep(2800);
  ok('安全页·审批门卡', await has('审批门'));
  ok('安全页·四档模式', (await has('read-only')) && (await has('unrestricted')));
  ok('安全页·供应链自证', (await has('供应链自证')) && (await has('无遥测上传')));
  const bridge = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('登录态桥')); return p ? p.innerText.slice(p.innerText.indexOf('登录态桥'), p.innerText.indexOf('登录态桥') + 200) : null; });
  ok('安全页·登录态桥卡渲染', bridge !== null, String(bridge || '').slice(0, 80).replace(/\n/g, ' '));
  ok('安全页·桥卡含风险警示', await has('不经过 opencli 审批门'));
  await shot('R4-安全与设置.png');

  // browser-cdp RPC 真值
  const cdpTruth = await page.evaluate(async () => {
    const res = await fetch('/api/opencli/browser-cdp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'audit-' + Date.now(), method: 'opencli/browser-cdp', payload: { args: {} } }) });
    return (await res.text()).slice(0, 240);
  });
  ok('RPC·browser-cdp', String(cdpTruth).includes('browser-cdp') === false && String(cdpTruth).length > 40, String(cdpTruth).slice(0, 110));

  // 定时闭环
  await clickBtn('自动化'); await sleep(2800);
  await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('定时任务')); const site = p && p.querySelector("input[placeholder='site zhihu hot']"); if (site) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(site, 'site zhihu hot'); site.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('定时任务')); const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '创建'); if (b) b.click(); });
  await sleep(3000);
  const created = JSON.parse(fs.readFileSync(STATE, 'utf8')).schedules.length;
  ok('定时·创建落盘', created >= 1, 'schedules=' + created);
  await shot('R6-定时.png');
  await page.evaluate(async () => { const sleep = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 4; i++) { const d = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === '删'); if (!d.length) break; d[0].click(); await sleep(1600); } });
  const cleared = JSON.parse(fs.readFileSync(STATE, 'utf8')).schedules.length;
  ok('定时·删除落盘', cleared === 0, 'schedules=' + cleared);

  await browser.disconnect();
  fs.writeFileSync(path.join(OUT, '审查结果.json'), JSON.stringify(results, null, 1));
  console.log(results.join('\n'));
  console.log('EDGE_PID', edge.pid);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
