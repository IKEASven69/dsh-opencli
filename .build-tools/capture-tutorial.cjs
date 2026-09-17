// 教程视频素材采集:真机面板逐状态截图(puppeteer-core 驱动本机 Edge)
const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'D:/CodingProjects/dsh-opencli-release/.design/video-frames';
const BASE = 'http://127.0.0.1:3123';
const TOKEN = process.argv[2] || '';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars', '--no-first-run'],
    defaultViewport: { width: 1240, height: 1400 },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  const clickBtn = async (label) => page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === label);
    if (!b) return false;
    b.click(); return true;
  }, label);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot', name); };

  // 打开面板
  await clickBtn('设置'); await sleep(1000);
  await clickBtn('浏览器代理'); await sleep(16000); // 首轮 RPC(含 8MB 目录)

  // T1:健康全绿总览
  await shot('T1-总览健康.png');

  // T2:试试看真跑
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('试试看'));
    const input = p && p.querySelector("input[placeholder*='想跑什么命令']");
    if (input) {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(input, 'site zhihu hot');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('试试看'));
    const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '运行');
    if (b) b.click();
  });
  await sleep(28000); // 等 opencli 真跑(经 daemon → 你的 Chrome)
  await shot('T2-试试看真跑.png');

  // T3:审批门关闭(状态落盘)
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('审批门'));
    const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '关闭');
    if (b) { b.click(); await sleep(1800); }
  });
  await shot('T3-审批门关闭.png');
  await page.evaluate(async () => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('审批门'));
    const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '开启');
    if (b) { b.click(); await sleep(1800); }
  });

  // T4:命令页
  await clickBtn('命令'); await sleep(3500);
  await shot('T4-命令页.png');

  // T5:安全与设置
  await clickBtn('安全与设置'); await sleep(2500);
  await shot('T5-安全与设置.png');

  // T6:自动化页(建一条任务)
  await clickBtn('自动化'); await sleep(2500);
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('定时任务'));
    const site = p && p.querySelector("input[placeholder='site zhihu hot']");
    if (site) {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(site, 'site zhihu hot');
      site.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('div')].find(x => (x.innerText || '').includes('定时任务'));
    const b = p && [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '创建');
    if (b) b.click();
  });
  await sleep(3000);
  await shot('T6-定时任务.png');

  // 清理:删掉演示任务
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 3; i++) {
      const d = [...document.querySelectorAll("button")].filter(x => (x.textContent || '').trim() === '删');
      if (!d.length) break;
      d[0].click(); await sleep(1500);
    }
  });

  await browser.close();
  console.log('ALL DONE');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
