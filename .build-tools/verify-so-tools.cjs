// 终验:so_verify / so_pick 决策工具真调 SystemOne(用户 key)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = process.argv[2] || '';
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=C:/Users/20369/AppData/Local/Temp/pptr-vrf-67278'],
    defaultViewport: { width: 1240, height: 1400 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3123/?token=' + token, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const rpc = async (m, args) => {
    const res = await page.evaluate(async (m, args) => {
      const res = await fetch('/api/opencli/' + m, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'v-' + Math.random(), method: 'opencli/' + m, payload: { args } }) });
      return (await res.text()).slice(0, 400);
    }, m, args);
    return res;
  };
  console.log('VERIFY:', await rpc('so_verify', { request: { expectation: '页面显示的是知乎热榜列表', page_text: '1 某大厂宣布全员降薪 热度984万 2 新版个人信息保护法落地 热度761万 3 十一旅游推荐 热度 500万' } }));
  console.log('PICK:', await rpc('so_pick', { request: { goal: '用户想看知乎热榜,选最匹配的命令', state: '命令目录:zhihu hot=热榜 zhihu search=搜索 zhihu comment=发评论', options: ['site zhihu hot', 'site zhihu search', 'site zhihu comment'] } }));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
