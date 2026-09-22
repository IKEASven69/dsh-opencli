// 终验:登录态桥卡 + CDP 状态 + 审批门开关(一次跑完)
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = require('fs');

(async () => {
  const token = process.argv[2] || '';
  const browser = await puppeteer.launch({
    executablePath: (() => {
      const root = 'C:/Program Files (x86)/Microsoft/Edge/Application';
      const vers = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse();
      return root + '/' + (vers[0] || '') + '/msedge.exe';
    })(),
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=C:/Users/20369/AppData/Local/Temp/pptr-final'],
    defaultViewport: { width: 1240, height: 1400 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3123/?token=' + token, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const click = (l) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, l);
  await click('设置'); await sleep(1200);
  await click('浏览器代理'); await sleep(20000);
  await click('安全与设置'); await sleep(4000);
  const bridge = await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('登录态桥'));
    return p ? p.innerText.slice(p.innerText.indexOf('登录态桥'), p.innerText.indexOf('登录态桥') + 260) : 'BRIDGE MISSING';
  });
  console.log('BRIDGE:', bridge.replace(/\n/g, ' ⏎ '));
  const cdp = await page.evaluate(async () => {
    const res = await fetch('/api/opencli/browser-cdp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'f-' + Date.now(), method: 'opencli/browser-cdp', payload: { args: {} } }) });
    return (await res.text()).slice(0, 220);
  });
  console.log('CDP RPC:', cdp);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
