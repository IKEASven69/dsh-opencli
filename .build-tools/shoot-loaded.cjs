// 载入完整数据后面板截图(真实渲染验证)
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = process.argv[2] || '';
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/152.0.4191.53/msedge.exe',
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=C:/Users/20369/AppData/Local/Temp/pptr-shot'],
    defaultViewport: { width: 1240, height: 1400 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3123/?token=' + token, { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  const click = (l) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) { b.click(); return true; } return false; }, l);
  await click('设置'); await sleep(1200);
  await click('浏览器代理'); await sleep(22000); // 等全部 RPC(含 8MB 目录)
  const png = await page.screenshot({ path: 'D:/CodingProjects/dsh-opencli-release/.design/v04-面板真实渲染.png' });
  console.log('shot', png.toString().length || 'ok');
  const text = await page.evaluate(() => (document.querySelector("[role='dialog']")?.innerText || '').slice(0, 400));
  console.log(text.replace(/\n/g, ' | '));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
