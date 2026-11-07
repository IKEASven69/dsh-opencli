// 0.1.2 新 UI 块真机走查(GUI 黑盒,补 ui-walkthrough.cjs 的覆盖缺口):
// 九幕主干盖住了 5 个 tab,但 0.1.2 新增的四块只有单元测试,未逐页真机断言——本脚本补上。
// 覆盖:自动化(静默/级别控件+批量管理条全流程)→安全(自检卡)→画布(证据卡)→双语抽检新块。
// 只做安全交互:不点「启用/停用所选」(会写任务状态),全选仅勾选后立即取消;过滤切换可逆还原。
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');

let EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
try { const root = 'C:/Program Files (x86)/Microsoft/Edge/Application'; const v = fs.readdirSync(root).filter(d => /^\d+\./.test(d)).sort().reverse(); if (v.length) EDGE = root + '/' + v[0] + '/msedge.exe'; } catch {}
const TOKEN = process.argv[2] || '';
const QA = 'D:/CodingProjects/dsh-opencli-release/.qa';
fs.mkdirSync(QA, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const rows = [];
const check = (scene, name, cond, detail) => {
  const icon = cond ? '✓' : '✗';
  rows.push(`${icon} [${scene}] ${name}${cond ? '' : ' — ' + String(detail).slice(0, 200)}`);
  cond ? pass++ : fail++;
};
// 轮询直至条件成立(React 异步渲染 + RPC 往返都靠它兜住)
const poll = async (fn, tries = 20, gap = 600) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(gap); } return null; };
const gotoTab = async (pg, label) => {
  await pg.evaluate((lb) => { const b = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === lb).pop(); if (b) b.click(); }, label);
  await sleep(1800);
};

(async () => {
  const port = 9360 + (Date.now() % 40), udd = 'C:/Users/20369/AppData/Local/Temp/pptr-ui-nb-' + String(Date.now()).slice(-6);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  const edge = spawn(EDGE, ['--remote-debugging-port=' + port, '--user-data-dir=' + udd, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--no-proxy-server', '--window-size=1240,1400', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 24; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1200) }); if (r.ok) break; } catch {} await sleep(500); }
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1400 });
  page.setDefaultNavigationTimeout(90_000)
  await page.goto('http://127.0.0.1:3123/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  // 入口同老九幕:Ctrl+Alt+, 开宿主设置 → 左侧「浏览器代理」进插件面板(宿主壳不直出面板)
  await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press(','); await page.keyboard.up('Alt'); await page.keyboard.up('Control');
  await sleep(2000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=tab], div')].find(x => (x.textContent || '').trim() === '浏览器代理'); if (b) b.click(); });
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) { await sleep(2000); ready = await page.evaluate(() => [...document.querySelectorAll('.o4-in')].some(x => x.placeholder === 'site zhihu hot')); }
  check('N0 打开', '设置→浏览器代理就绪(总览渲染)', ready);

  // ── N1 自动化·任务行静默/级别控件 + 建表单静默占位 ──
  await gotoTab(page, '自动化');
  const formQh = await page.evaluate(() => !!document.querySelector('input[placeholder*="静默 23:00"]'));
  check('N1 行控件', '建任务表单静默占位(😴 静默 23:00-07:00)', formQh);
  const rowCtrls = await page.evaluate(() => {
    const lv = [...document.querySelectorAll('select')].filter(s => (s.title || '').includes('只推命中'));
    const qh = [...document.querySelectorAll('select')].filter(s => (s.title || '').includes('窗内通知暂存'));
    const taskRows = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === '立即跑').length;
    return { lv: lv.length, qh: qh.length, rows: taskRows, lvOpts: lv[0] ? [...lv[0].options].map(o => o.textContent) : [] };
  });
  check('N1 行控件', '任务列表非空(有「立即跑」行)', rowCtrls.rows > 0, 'rows=' + rowCtrls.rows);
  if (rowCtrls.rows > 0) {
    check('N1 行控件', '每行「级别」下拉存在(all/quiet 两档)', rowCtrls.lv >= rowCtrls.rows, 'lv=' + rowCtrls.lv + '/rows=' + rowCtrls.rows);
    check('N1 行控件', '每行「静默」下拉存在', rowCtrls.qh >= rowCtrls.rows, 'qh=' + rowCtrls.qh);
    check('N1 行控件', '级别下拉选项齐全', rowCtrls.lvOpts.some(t => t.includes('全部')) && rowCtrls.lvOpts.some(t => t.includes('仅变化')), JSON.stringify(rowCtrls.lvOpts));
  } else {
    check('N1 行控件', '任务行控件抽检(列表为空,只验表单)', false, '列表空,行控件无从抽检');
  }
  await page.screenshot({ path: QA + '/049-ui-nb-1-rows.png' });

  // ── N2 自动化·批量管理条(全选→按钮浮现→取消→消失;来源过滤可逆) ──
  const batchBar = await page.evaluate(() => {
    const selAll = document.querySelector('input[type=checkbox][title="全选/取消全选"]');
    const src = [...document.querySelectorAll('select')].find(s => (s.title || '') === '来源');
    return { selAll: !!selAll, src: !!src, srcOpts: src ? [...src.options].map(o => o.value) : [] };
  });
  check('N2 批量条', '全选 checkbox + 来源过滤下拉都在', batchBar.selAll && batchBar.src, JSON.stringify(batchBar));
  check('N2 批量条', '来源过滤五档(all/agent/chat/panel/ctl)', ['all', 'agent', 'chat', 'panel', 'ctl'].every(v => batchBar.srcOpts.includes(v)), JSON.stringify(batchBar.srcOpts));
  // 选中浮现启停按钮(只浮现,不点——启停会写任务状态)
  await page.evaluate(() => { const c = document.querySelector('input[type=checkbox][title="全选/取消全选"]'); if (c && !c.checked) c.click(); });
  await sleep(600);
  const afterSel = await page.evaluate(() => ({
    en: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '启用所选'),
    dis: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '停用所选'),
  }));
  check('N2 批量条', '勾选全选后「启用所选/停用所选」浮现', afterSel.en && afterSel.dis, JSON.stringify(afterSel));
  await page.screenshot({ path: QA + '/049-ui-nb-2-batch.png' });
  await page.evaluate(() => { const c = document.querySelector('input[type=checkbox][title="全选/取消全选"]'); if (c && c.checked) c.click(); });
  await sleep(600);
  const afterUn = await page.evaluate(() => ({
    en: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '启用所选'),
  }));
  check('N2 批量条', '取消全选后启停按钮收起', !afterUn.en);
  // 来源过滤切 panel(React 受控 select:原生 setter + change 事件)
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find(s => (s.title || '') === '来源');
    if (!sel) return;
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    set.call(sel, 'panel');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1200);
  const filtered = await page.evaluate(() => {
    const runBtns = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === '立即跑').length;
    const badges = [...document.querySelectorAll('.o4-bdg')].map(b => (b.textContent || '').trim());
    const alien = badges.filter(t => t === 'agent' || t === 'chat' || t === 'ctl').length;
    return { runBtns, alien };
  });
  check('N2 批量条', '切 panel 过滤后无 agent/chat/ctl 徽章漏出', filtered.alien === 0, 'runBtns=' + filtered.runBtns + ' alien=' + filtered.alien);
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find(s => (s.title || '') === '来源');
    if (!sel) return;
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    set.call(sel, 'all');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1200);
  const restored = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === '立即跑').length);
  check('N2 批量条', '切回 all 行数还原', restored === rowCtrls.rows, restored + ' vs ' + rowCtrls.rows);

  // ── N3 安全·自检卡(等 self-check RPC 返回,注册点名+入口+版本) ──
  await gotoTab(page, '安全与设置');
  const sc = await poll(() => page.evaluate(() => {
    const all = document.body.textContent || '';
    // 自检卡整体渲染齐才算样本(RPC 往返有快有慢,采早了就是假阴性)
    if (!all.includes('插件自检') || !/当前 v\d+\.\d+\.\d+/.test(all)) return null;
    return {
      title: all.includes('插件自检'),
      sub: all.includes('工具注册点名'),
      tools: /个工具已注册/.test(all),
      entries: all.includes('ctl 收件箱') && all.includes('面板 RPC'),
      ver: /当前 v\d+\.\d+\.\d+/.test(all),
    };
  }), 22, 700);
  check('N3 自检卡', '自检卡标题+副题(工具注册点名…)', !!sc && sc.title && sc.sub);
  check('N3 自检卡', '工具点名 badge(N 个工具已注册)', !!sc && sc.tools);
  check('N3 自检卡', '入口在线:ctl 收件箱 + 面板 RPC', !!sc && sc.entries);
  check('N3 自检卡', '版本行(当前 v0.1.2)', !!sc && sc.ver);
  await page.screenshot({ path: QA + '/049-ui-nb-3-selfcheck.png' });

  // ── N4 画布·证据卡(evidence-get 独立源:badge 证据 + verdict + 前/后列) ──
  await gotoTab(page, '画布');
  const evd = await poll(() => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.o4-cvcard')];
    // 卡流没出来不采样,防止把「还在加载」判成「没有证据卡」
    if (cards.length === 0) return null;
    const ev = cards.filter(c => [...c.querySelectorAll('.o4-bdg')].some(b => (b.textContent || '').trim() === '证据'));
    const verdicts = ev.map(c => { const t = c.textContent || ''; const m = t.match(/执行成功|执行失败|审批拒绝/); return m ? m[0] : null; });
    return { ev: ev.length, okV: verdicts.filter(Boolean).length, anyCard: cards.length };
  }), 20, 700);
  check('N4 证据卡', '画布总卡流渲染(≥1 卡)', !!evd && evd.anyCard > 0, 'cards=' + (evd ? evd.anyCard : 0));
  check('N4 证据卡', '证据卡 ≥1(badge「证据」)', !!evd && evd.ev > 0, 'evCards=' + (evd ? evd.ev : 0));
  check('N4 证据卡', '证据卡带 verdict 徽章(执行成功/失败/审批拒绝)', !!evd && evd.okV > 0, 'okV=' + (evd ? evd.okV : 0));
  await page.screenshot({ path: QA + '/049-ui-nb-4-evidence.png' });

  // ── N5 双语抽检新块文案 ──
  await gotoTab(page, '安全与设置');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === 'EN').pop(); if (b) b.click(); });
  await sleep(1500);
  const enCheck1 = await page.evaluate(() => (document.body.textContent || '').includes('Plugin self-check'));
  check('N5 双语', 'EN:自检卡标题变英文', enCheck1);
  // 全选 checkbox 在自动化 tab——语言切完先过去再断言(EN 态 tab 标签也变英文)
  await gotoTab(page, 'Automation');
  const enCheck2 = await page.evaluate(() => { const c = document.querySelector('input[type=checkbox][title="Select all / none"]'); return c ? c.title : null; });
  check('N5 双语', 'EN:全选 checkbox title 变英文', !!enCheck2, enCheck2);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => (x.textContent || '').trim() === '中文').pop(); if (b) b.click(); });
  await sleep(1500);
  const zhBack = await page.evaluate(() => { const c = document.querySelector('input[type=checkbox][title="全选/取消全选"]'); return c ? c.title : null; });
  check('N5 双语', '切回中文还原', zhBack === '全选/取消全选', zhBack);
  await page.screenshot({ path: QA + '/049-ui-nb-5-en.png' });

  try { await browser.close(); } catch {}
  try { edge.kill(); } catch {}
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}

  console.log('\n════ 0.1.2 新 UI 块真机走查 ════');
  for (const r of rows) console.log(r);
  console.log(`\n总计: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('WALKTHROUGH-ERROR', e); process.exit(2); });
