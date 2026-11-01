// 检查 canvas tab 卡片父链与文本(诊断 o4-cvcard 在不在 cvwrap 里)
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
let EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
try { const root = 'C:/Program Files (x86)/Microsoft/Edge/Application'; const v = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse(); if (v.length) EDGE = root + '/' + v[0] + '/msedge.exe'; } catch {}
let TOKEN = '';
const ldir = process.env.HOME + '/.dsh/logs';
for (const f of fs.readdirSync(ldir).filter(x => x.startsWith('web-3123')).sort().reverse()) {
  const m = /token=([A-Za-z0-9_-]{20,})/.exec(fs.readFileSync(ldir + '/' + f, 'utf8'));
  if (m) { TOKEN = m[1]; break }
}
(async () => {
  const port = 9370, udd = 'C:/Users/20369/AppData/Local/Temp/pptr-cv8';
  const edge = spawn(EDGE, ['--remote-debugging-port=' + port, '--user-data-dir=' + udd, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1240,1400', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 20; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1200) }); if (r.ok) break } catch {} await new Promise(r => setTimeout(r, 500)) }
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  await page.goto('http://127.0.0.1:3123/?token=' + TOKEN, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));
  await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press(','); await page.keyboard.up('Alt'); await page.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=tab], div')].find(x => (x.textContent || '').trim() === '浏览器代理'); if (b) b.click() });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === '画布').pop(); if (b) b.click() });
  await new Promise(r => setTimeout(r, 4500));
  const info = await page.evaluate(() => {
    const card = document.querySelector('.o4-cvcard');
    if (!card) return { card: false };
    const chain = [];
    let el = card;
    while (el && chain.length < 8) { chain.push(String(el.className || el.tagName).slice(0, 40)); el = el.parentElement }
    const wrap = card.closest('.o4-cvwrap');
    return { card: true, chain, inWrap: !!wrap, sample: (card.textContent || '').slice(0, 120) };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'D:/CodingProjects/dsh-opencli-release/.qa/046-ui-canvas.png' });
  await browser.disconnect(); edge.kill();
})().catch(e => { console.error('FATAL', e.message.slice(0, 100)); process.exit(1) })
