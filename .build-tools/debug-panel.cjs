// 抓面板渲染错误:连接真实 Edge,收集 console 错误
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = process.argv[2] || '';
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/152.0.4191.53/msedge.exe'.replace('152.0.4191.53', (require('fs').readdirSync('C:/Program Files (x86)/Microsoft/Edge/Application').filter(d => /^\d+\./.test(d)).sort().reverse()[0] || '152.0.4191.53')),
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=C:/Users/20369/AppData/Local/Temp/pptr-dbg'],
    defaultViewport: { width: 1240, height: 1400 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:3123/?token=' + token, { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  const click = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, label);
  await click('设置'); await sleep(1200);
  await click('浏览器代理'); await sleep(15000);
  const blank = await page.evaluate(() => { const dlg = document.querySelector("[role='dialog']"); const p = dlg && [...dlg.querySelectorAll('div')].find(x => (x.innerText || '').includes('浏览器代理') && (x.innerText || '').includes('设置')); const r = dlg ? (dlg.querySelector('.o4') ? 'panel-root-exists' : 'no .o4 root') : 'no dialog'; const o4 = document.querySelector('.o4'); return { r, o4children: o4 ? o4.children.length : 0, o4text: o4 ? (o4.innerText || '').slice(0, 120) : '' }; });
  console.log('ERRORS:', JSON.stringify(errors.slice(0, 8), null, 1));
  console.log('STATE:', JSON.stringify(blank));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
