// B3 走查:总览 NL 指挥台渲染 + token 层生效 + 动效基建存在。
// 截图 .qa/046-overview-nl.png 供人眼复核;断言 DOM 文本/类名/计算样式。
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
try { const root = 'C:/Program Files (x86)/Microsoft/Edge/Application'; const v = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse(); if (v.length) EDGE = root + '/' + v[0] + '/msedge.exe'; } catch {}
const TOKEN = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n + (d ? ' — ' + String(d).slice(0, 140) : '')) } else { fail++; console.log('  FAIL ' + n + ' — ' + String(d).slice(0, 240)) } };

(async () => {
  const port = 9341, udd = 'C:/Users/20369/AppData/Local/Temp/pptr-b3-walk';
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  const edge = spawn(EDGE, ['--remote-debugging-port=' + port, '--user-data-dir=' + udd, '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--window-size=1240,1500', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 24; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1200) }); if (r.ok) break; } catch {} await sleep(500); }
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1500 });
  await page.goto('http://127.0.0.1:3123/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  // 打开设置面板
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '设置'); if (b) b.click(); });
  await sleep(2500);
  // 总览就是第一个 tab;检查 NL 指挥台
  const nlTitle = await page.evaluate(() => { const els = [...document.querySelectorAll('.o4-h3')]; return els.some(x => (x.textContent || '').includes('自然语言指挥台')); });
  check('NL 指挥台标题渲染', nlTitle);
  const nlInput = await page.evaluate(() => { const i = [...document.querySelectorAll('.o4-in')].find(x => (x.placeholder || '').includes('每天早9点')); return i !== undefined; });
  check('NL 输入框(占位文案)', nlInput);
  const nlBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('.o4-btn')].find(x => (x.textContent || '').trim() === '映射'); return b !== undefined && b.disabled === true; });
  check('映射按钮初始禁用(空输入)', nlBtn);
  // token 层生效:任一 .o4 元素的 --c-accent 变量可读
  const token = await page.evaluate(() => { const el = document.querySelector('.o4'); return el ? getComputedStyle(el).getPropertyValue('--c-accent').trim() : ''; });
  check('设计 token 层生效(--c-accent)', token.length > 4, token);
  // 动效基建:keyframes 注入 + reduced-motion 规则存在
  const anim = await page.evaluate(() => {
    const style = [...document.querySelectorAll('style')].find(s => s.textContent.includes('o4-rise'));
    return style !== undefined && style.textContent.includes('prefers-reduced-motion');
  });
  check('动效基建(o4-rise + reduced-motion)', anim);
  // 输入一句话映射按钮变可用(不点——那会花模型额度)
  await page.type('.o4-in[placeholder*="每天早9点"]', '每天早9点看看掘金');
  await sleep(300);
  const btnOn = await page.evaluate(() => { const b = [...document.querySelectorAll('.o4-btn')].find(x => (x.textContent || '').trim() === '映射'); return b !== undefined && b.disabled === false; });
  check('输入后映射按钮可用', btnOn);
  // 试试看仍在(NL 不取代命令模式)
  const tryT = await page.evaluate(() => [...document.querySelectorAll('.o4-h3')].some(x => (x.textContent || '').includes('试试看')));
  check('命令模式保留(试试看卡)', tryT);
  // 截图存证
  fs.mkdirSync('D:/CodingProjects/dsh-opencli-release/.qa', { recursive: true });
  await page.screenshot({ path: 'D:/CodingProjects/dsh-opencli-release/.qa/046-overview-nl.png' });
  console.log('  ↳ 截图 .qa/046-overview-nl.png');
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
  await browser.disconnect(); edge.kill();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) });
