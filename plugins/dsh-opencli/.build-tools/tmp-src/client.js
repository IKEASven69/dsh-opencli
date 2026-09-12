/**
 * dsh-opencli 浏览器半:设置页「浏览器代理」——OpenCLI 管理中心。
 * 视觉对齐 OpenCLIApp 0.1.38「命令集合」页实测:冷灰深色 + 蓝强调(#4A9EFF)、
 * iOS 设置式页头(圆角图标 + 大标题 + 描述)、分段 tab(App/Site 命令)、
 * 独立适配器卡片(头像方块 + 名称 + 弱化计数 + 展开箭头)、单行命令行
 * (名称 + 截断描述 + browser/read/write 徽章)。
 * 段落(对齐 prototype-v3.4,真数据 + 真 RPC,零 emoji):
 * 0 试试看(try-run) / 0.5 搜站点 + 命令集合 / 0.6 实用快捷 /
 * 1 健康 + 登录态 chips + 运行时 / 2 定时任务 / 3 录制回放 /
 * 3.5 资产库 / 4 跳 dsh / 5 安装引导 / 6 profile 说明。
 * 职责:安装引导 → 桥接诊断 → 适配器管理。定位:不替代 OpenCLIApp(基础设施层),
 * 本面板是 OpenCLI 在 dsh 生态内的管理中心。面板只展示已存,不替用户操作:
 * 新建/改/删一律去 dsh 对话说。
 * @module dsh-opencli/client
 */ import { createElement, useEffect, useState } from 'react';
export const inject = [
    'slots'
];
const DSH_URL = 'http://127.0.0.1:3080';
/* ── i18n:面板内全部用户可见文案走这里,页头可切 zh/en ── */ const STR = {
    zh: {
        title: 'OpenCLI 管理中心',
        desc: '浏览内置 OpenCLI 命令;dsh 会话经 site 工具直接调用,缺失站点可让模型现场创作。',
        refresh: '刷新/诊断',
        diagnosing: '检测中…',
        langName: 'EN',
        s0t: '0. 试试看',
        s0tag: '立刻能用',
        s0hint: '不知道干嘛?点“我跑一下”,面板经 try-run 真跑一条命令把结果拿回来。',
        s0demo: '我跑一下',
        s0run: '跑这',
        s0ph: '想跑什么命令,如:site arxiv recent cs.AI',
        s05t: '0.5 搜站点',
        s05hint: '点站点 tag 填进搜索框;搜站点名 → 复制 opencli 命令。',
        s05searchPh: '搜索站点、命令或描述',
        s05cmds: '条命令',
        s05empty: '没有匹配的站点或命令',
        s05call: 'dsh 会话调用:',
        s05copyHint: '· 点击行复制完整命令',
        s05disable: '禁用',
        s05enable: '启用',
        s05disabled: '已禁用',
        s05copied: '已复制',
        s05loading: 'loading…',
        s05loadFail: '加载失败',
        s05siteCmds: 'Site 命令',
        s05appCmds: 'App 命令',
        s05siteTitle: '网站适配器——在登录态 Chrome 里执行',
        s05appTitle: '本地桌面应用适配器(Codex/Cursor/Trae 等,经 CDP 操控目标应用;需本机装有对应应用,不依赖 OpenCLIApp)',
        s06t: '0.6 实用快捷',
        s06tag: '新',
        s06diag: '失败诊断 ?',
        s06skill: '装 opencli skill',
        s06patch: '切到 Patchright',
        s06hon: '开 headless',
        s06hoff: '关 headless',
        s06ro: '切到 read-only',
        s06auto: '切到 autonomous',
        s06hint: '点按钮 → 文本复制到剪贴板 + 跳 dsh 对话框,去粘贴发送。失败诊断会先弹窗再跳。',
        s1t: '1. opencli 健康',
        s1daemon: 'daemon',
        s1running: '运行中',
        s1stopped: '未运行',
        s1start: '启动 daemon',
        s1starting: '启动中…',
        s1ext: 'Chrome 扩展',
        s1extOn: '已连接',
        s1approval: 'write 审批门',
        s1approvalOn: '开启(site 写操作先经确认)',
        s1approvalOff: '关闭',
        s1on: '开启',
        s1off: '关闭',
        s1loginCan: '个站点可巡检',
        s1login: '登录态',
        s1check: '巡检登录态',
        s1checking: '巡检中…',
        s1collapse: '收起',
        s1runtime: '运行时',
        s1mode: '自动化档',
        s1sites: '站点',
        s1cmds: '命令',
        s1ver: 'v',
        s1okTag: '正常',
        s1loginHint: '绿=已登 · 黄=超时 · 红=未登 · 5+ 折叠 · 换登录去 dsh 对话框说“换微博账号”',
        s1timeout: '探测超时',
        s1checkFail: '巡检失败',
        s2t: '2. 定时任务',
        s2hint: '新建/改/删 → 去 dsh 对话说“建一个每天9点跑 arxiv 综述”',
        s2sitePh: 'site 命令(如:zhihu hot)',
        s2cronPh: 'cron',
        s2create: '创建',
        s2empty: '暂无定时。上面填 site 命令 + cron 点创建,或去 dsh 对话说。创建后可在 dsh schedule list 查看。',
        s2run: '立即跑',
        s2pause: '关停',
        s2resume: '启用',
        s2del: '删',
        s2paused: '已暂停',
        s2on: '运行中',
        s2runOk: '已触发',
        s2hist: '查看运行历史:去 dsh 对话框说“定时历史”',
        s3t: '3. 录制回放',
        s3hint: '录新/改 → 去 dsh 对话说“录一段:抓 arxiv 今天的 AI 论文”',
        s3start: '开始录制',
        s3stop: '停止录制',
        s3namePh: '录制名称(如:每日知乎热榜)',
        s3stepPh: '添加步骤(回车确认,如:site zhihu hot)',
        s3recorded: '已录',
        s3replay: '回放',
        s3del: '删除',
        s3promote: '生成为 recipe',
        s3promoted: '已晋升为 recipe:',
        s3empty: '暂无录制。点“开始录制”手动输入步骤;真实 Chrome 操作自动追加走 dsh 对话。',
        s3steps: '步',
        s35t: '3.5 自动化资产库',
        s35tag: '对齐 anweat',
        s35hint: '新建/激活/归档 → 去 dsh 对话说“新建 recipe”',
        s35searchPh: '搜资产(如:arxiv)',
        s35search: '搜索',
        s35run: '运行',
        s35empty: '暂无资产。先在“2. 定时任务”里建,或去 dsh 对话说“新建 recipe”。',
        s35note: '说明:实验性 — 模型只检索已激活资产的有界摘要(默认 top 5 · 800 tokens 预算)。草稿需先真实回放成功才能激活。',
        s35mode: '自动化自由度',
        s35limit: '限流',
        s35limitV: 'minDelay 750ms / 并发 2 / 突发 3 / 冷却 30s',
        s35limitOn: '已启用',
        s35auth: '限域登录',
        s35authV: 'authProfiles: allowedDomains 限域,默认只读不回写',
        s35scripts: '脚本目录',
        s35scriptUrlPh: '脚本目标 URL(可空)',
        s35scriptRun: '运行内置脚本',
        s35crawlUrlPh: '要抓的 URL',
        s35crawlRun: '泛爬(单页提取)',
        s35mReadonly: '只读',
        s35mStandard: '标准(默认)',
        s35mAuto: '自主',
        s35mUnrest: '无人值守',
        s4t: '4. 你跟 dsh 说的话(这才是真正在用)',
        s4lead: '点下方蓝按钮 → 文本复制到剪贴板 + 自动新开 dsh 标签页 → 在 dsh 对话框按 Ctrl+V 粘上发送:',
        s4jumpT: '→ dsh 对话框(输入框 + 发送)',
        s4send: '→ 复制 + 打开 dsh',
        s4ph: '在这里输入想跟 dsh 说的话,如“每天9点跑 site arxiv search agent”',
        s4jumpHint: '点一下:内容进剪贴板,新 tab 打开 http://127.0.0.1:3080,按 Ctrl+V 粘到 dsh 对话框 → 发送',
        s4picksT: '常用快捷点(点一下填进输入框):',
        s4hint: '不知道说啥?点上面的快捷按钮 → 改改 → 点“→ 复制 + 打开 dsh” → 在 dsh 对话框 Ctrl+V 发送。',
        s4sent: '已复制 + 打开 dsh',
        s4empty: '输入框是空的',
        s4copyFail: '复制失败,请手动复制',
        s5t: '未检测到 opencli —— 三步接入',
        s6t: '6. 当前 dsh profile(用错 profile 找不到 opencli 工具)',
        s6profile: 'dsh profile',
        s6state: 'dsh-opencli 状态',
        s6mounted: '已挂载',
        s6ok: '正确',
        s6hint: '若切到 headless / zvecbtest / intelhubtest 等其它 profile,opencli 没挂载。切回 web:dsh --profile web。',
        s5done: '已经装好了,跳过',
        s5noop: '无需操作',
        s5hint: '如果你看到红字“未装”,去 dsh 对话框说“装 opencli”,dsh 自动跑 4 步 + 自检。',
        diagT: '失败诊断(5 大常见原因)',
        diag1: 'daemon 未跑:去 dsh 对话框说“装 opencli”,自检会跑',
        diag2: '扩展断连:Chrome 里点 BrowserBridge 图标,应亮',
        diag3: '登录过期:说“换 {网站} 账号”,dsh 调 opencli 帮你登',
        diag4: '站点风控:说“切到 Patchright”,少被反爬',
        diag5: '命令写错:去 0.5 段搜站点复制正确命令',
        diagClose: '关',
        diagSend: '复制到 dsh →',
        errReq: '请求失败'
    },
    en: {
        title: 'OpenCLI Control Center',
        desc: 'Browse built-in OpenCLI commands; dsh sessions call them via the site tool. Missing sites can be created live by the model.',
        refresh: 'Refresh/Diagnose',
        diagnosing: 'Checking…',
        langName: '中文',
        s0t: '0. Try it',
        s0tag: 'Works now',
        s0hint: 'Not sure what to do? Hit “Run demo” — the panel really runs one command via try-run and shows the result.',
        s0demo: 'Run demo',
        s0run: 'Run',
        s0ph: 'Command to run, e.g.: site arxiv recent cs.AI',
        s05t: '0.5 Find a site',
        s05hint: 'Click a site tag to fill the search box; find a site name → copy the opencli command.',
        s05searchPh: 'Search sites, commands or descriptions',
        s05cmds: 'commands',
        s05empty: 'No matching site or command',
        s05call: 'Call in dsh session:',
        s05copyHint: '· click a row to copy the full command',
        s05disable: 'Disable',
        s05enable: 'Enable',
        s05disabled: 'Disabled',
        s05copied: 'Copied',
        s05loading: 'loading…',
        s05loadFail: 'Load failed',
        s05siteCmds: 'Site commands',
        s05appCmds: 'App commands',
        s05siteTitle: 'Website adapters — run inside your logged-in Chrome',
        s05appTitle: 'Local desktop app adapters (Codex/Cursor/Trae etc., driven via CDP; the app must be installed locally, no OpenCLIApp needed)',
        s06t: '0.6 Shortcuts',
        s06tag: 'New',
        s06diag: 'Failure diagnosis ?',
        s06skill: 'Install opencli skill',
        s06patch: 'Switch to Patchright',
        s06hon: 'Headless on',
        s06hoff: 'Headless off',
        s06ro: 'Switch to read-only',
        s06auto: 'Switch to autonomous',
        s06hint: 'Click a button → text copied to clipboard + dsh dialog opens; paste and send. Diagnosis pops up first.',
        s1t: '1. opencli health',
        s1daemon: 'daemon',
        s1running: 'Running',
        s1stopped: 'Not running',
        s1start: 'Start daemon',
        s1starting: 'Starting…',
        s1ext: 'Chrome extension',
        s1extOn: 'Connected',
        s1approval: 'write approval gate',
        s1approvalOn: 'On (site writes ask first)',
        s1approvalOff: 'Off',
        s1on: 'On',
        s1off: 'Off',
        s1loginCan: 'sites checkable',
        s1login: 'Login state',
        s1check: 'Check logins',
        s1checking: 'Checking…',
        s1collapse: 'Collapse',
        s1runtime: 'Runtime',
        s1mode: 'Automation level',
        s1sites: 'sites',
        s1cmds: 'commands',
        s1ver: 'v',
        s1okTag: 'Healthy',
        s1loginHint: 'green=logged in · yellow=timeout · red=not logged in · 5+ collapsed · to switch account tell dsh “switch weibo account”',
        s1timeout: 'Probe timeout',
        s1checkFail: 'Check failed',
        s2t: '2. Schedules',
        s2hint: 'Create/edit/delete → tell dsh “schedule arxiv briefings daily at 9am”',
        s2sitePh: 'site command (e.g.: zhihu hot)',
        s2cronPh: 'cron',
        s2create: 'Create',
        s2empty: 'No schedules yet. Fill site command + cron above, or ask in the dsh dialog. Then see them via dsh schedule list.',
        s2run: 'Run now',
        s2pause: 'Pause',
        s2resume: 'Resume',
        s2del: 'Delete',
        s2paused: 'Paused',
        s2on: 'Active',
        s2runOk: 'Triggered',
        s2hist: 'History: ask “schedule history” in the dsh dialog',
        s3t: '3. Record & replay',
        s3hint: 'Record new / edit → tell dsh “record: grab today’s arxiv AI papers”',
        s3start: 'Start recording',
        s3stop: 'Stop recording',
        s3namePh: 'Recording name (e.g.: daily zhihu hot)',
        s3stepPh: 'Add step (Enter to confirm, e.g.: site zhihu hot)',
        s3recorded: 'recorded',
        s3replay: 'Replay',
        s3del: 'Delete',
        s3promote: 'Promote to recipe',
        s3promoted: 'Promoted to recipe:',
        s3empty: 'No recordings. Hit “Start recording” and type steps; real Chrome actions append via the dsh dialog.',
        s3steps: 'steps',
        s35t: '3.5 Automation assets',
        s35tag: 'anweat parity',
        s35hint: 'New / activate / archive → tell dsh “new recipe”',
        s35searchPh: 'Search assets (e.g.: arxiv)',
        s35search: 'Search',
        s35run: 'Run',
        s35empty: 'No assets yet. Create one in “2. Schedules” first, or tell dsh “new recipe”.',
        s35note: 'Experimental — the model only retrieves bounded summaries of activated assets (default top 5 · 800 token budget). Drafts must replay successfully before activation.',
        s35mode: 'Automation level',
        s35limit: 'Rate limit',
        s35limitV: 'minDelay 750ms / concurrency 2 / burst 3 / cooldown 30s',
        s35limitOn: 'Enabled',
        s35auth: 'Scoped login',
        s35authV: 'authProfiles: allowedDomains scoped, read-only by default',
        s35scripts: 'Script catalog',
        s35scriptUrlPh: 'Script target URL (optional)',
        s35scriptRun: 'Run builtin script',
        s35crawlUrlPh: 'URL to fetch',
        s35crawlRun: 'Crawl (single page)',
        s35mReadonly: 'read-only',
        s35mStandard: 'standard (default)',
        s35mAuto: 'autonomous',
        s35mUnrest: 'unrestricted',
        s4t: '4. What you tell dsh (this is the real usage)',
        s4lead: 'Click the blue button below → text copied + a new dsh tab opens → Ctrl+V into the dsh dialog and send:',
        s4jumpT: '→ dsh dialog (input + send)',
        s4send: '→ Copy + open dsh',
        s4ph: 'Type what to tell dsh, e.g. “run site arxiv search agent daily at 9am”',
        s4jumpHint: 'One click: content to clipboard, new tab opens http://127.0.0.1:3080, Ctrl+V into the dsh dialog → send',
        s4picksT: 'Quick picks (click to fill the input):',
        s4hint: 'Not sure what to say? Click a quick pick → edit → “→ Copy + open dsh” → Ctrl+V in the dsh dialog.',
        s4sent: 'Copied + dsh opened',
        s4empty: 'Input is empty',
        s4copyFail: 'Copy failed, please copy manually',
        s5t: 'opencli not detected — 3 steps to connect',
        s6t: '6. Current dsh profile (wrong profile hides opencli tools)',
        s6profile: 'dsh profile',
        s6state: 'dsh-opencli state',
        s6mounted: 'Mounted',
        s6ok: 'Correct',
        s6hint: 'If you switch to headless / zvecbtest / intelhubtest etc., opencli is not mounted. Switch back to web: dsh --profile web.',
        s5done: 'Already installed, skip',
        s5noop: 'No action needed',
        s5hint: 'If you see red “missing”, tell dsh “install opencli” — dsh runs 4 steps + self-check.',
        diagT: 'Failure diagnosis (5 common causes)',
        diag1: 'daemon not running: tell dsh “install opencli”, self-check will run',
        diag2: 'extension disconnected: click the BrowserBridge icon in Chrome, it should light up',
        diag3: 'login expired: say “switch {site} account”, dsh re-logs you in via opencli',
        diag4: 'site bot protection: say “switch to Patchright” for fewer blocks',
        diag5: 'wrong command: find the right one in section 0.5',
        diagClose: 'Close',
        diagSend: 'Copy to dsh →',
        errReq: 'Request failed'
    }
};
async function rpc(method, args = {}) {
    try {
        const res = await fetch(`/api/opencli/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'client-request',
                rpcId: globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
                method: `opencli/${method}`,
                payload: {
                    args
                }
            })
        });
        const msg = await res.json();
        if (msg.result !== undefined && msg.result.ok) return {
            ok: true,
            value: msg.result.value
        };
        return {
            ok: false,
            error: {
                message: msg.result?.error?.message ?? `HTTP ${res.status}`
            }
        };
    } catch (e) {
        return {
            ok: false,
            error: {
                message: e instanceof Error ? e.message : String(e)
            }
        };
    }
}
async function copyText(text) {
    try {
        const clip = globalThis.navigator?.clipboard;
        if (clip?.writeText !== undefined) {
            await clip.writeText(text);
            return true;
        }
    } catch  {}
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch  {
        return false;
    }
}
/* ── OpenCLIApp 设计令牌(0.1.38 实测) + v3.4 新增段落样式 ── */ const CSS = `
.ocp { display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #F0F0F2; }
.ocp-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
/* ── 页头:iOS 设置式(图标 + 大标题 + 描述)── */
.ocp-head { display: flex; align-items: flex-start; gap: 14px; }
.ocp-icon { flex: none; width: 46px; height: 46px; border-radius: 12px; background: #4A9EFF;
  display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #fff; letter-spacing: .5px; }
.ocp-title { font-size: 20px; font-weight: 700; line-height: 1.35; }
.ocp-desc { font-size: 12.5px; color: #9A9AA0; margin-top: 3px; line-height: 1.55; }
.ocp-headbtns { margin-left: auto; display: flex; gap: 8px; flex: none; }
.ocp-btn { flex: none; cursor: pointer; border: none; background: #3A3A3E; color: #F0F0F2;
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; transition: background .15s; white-space: nowrap; }
.ocp-btn:hover { background: #46464B; }
.ocp-btn:disabled { opacity: .6; cursor: default; }
.ocp-btn-sm { padding: 5px 11px; font-size: 11.5px; }
.ocp-btn-p { background: #4A9EFF; color: #fff; }
.ocp-btn-p:hover { background: #3A8AE8; }
.ocp-btn-w { background: #FF9F0A; color: #fff; }
.ocp-btn-w:hover { background: #E08F08; }
.ocp-btn-d { background: rgba(255,69,58,.2); color: #FF6B5E; }
.ocp-sect { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; margin-bottom: 10px; flex-wrap: wrap; }
.ocp-tag { flex: none; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: #333338; color: #9A9AA0; }
.ocp-tag-g { background: rgba(52,199,89,.32); color: #4DDB7A; }
.ocp-tag-y { background: rgba(255,159,10,.18); color: #FF9F0A; }
.ocp-tag-r { background: rgba(255,69,58,.18); color: #FF6B5E; }
/* ── 设置卡片(系统页样式:分组卡 + 分隔行)── */
.ocp-card { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; padding: 4px 18px; }
.ocp-srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
.ocp-srow:last-child { border-bottom: none; }
.ocp-sk { color: #9A9AA0; flex: none; }
.ocp-sv { color: #F0F0F2; }
.ocp-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.ocp-ok { background: #34C759; }
.ocp-bad { background: #FF453A; }
.ocp-mid { background: #9A9AA0; }
.ocp-hint { font-size: 11.5px; color: #9A9AA0; }
.ocp-login { max-height: 260px; overflow: auto; }
.ocp-lrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12.5px; }
.ocp-lrow:last-child { border-bottom: none; }
.ocp-lsite { flex: none; min-width: 96px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-weight: 600; }
.ocp-ldetail { flex: 1; min-width: 0; color: #9A9AA0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ocp-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ocp-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; border-radius: 6px; padding: 2px 9px;
  background: rgba(52,199,89,.32); color: #4DDB7A; border: 1px solid rgba(52,199,89,.5); }
.ocp-chip-y { background: rgba(255,159,10,.18); color: #FF9F0A; border-color: rgba(255,159,10,.3); }
.ocp-chip-r { background: rgba(255,69,58,.18); color: #FF6B5E; border-color: rgba(255,69,58,.3); }
.ocp-chip .ocp-dot { width: 6px; height: 6px; }
.ocp-link { color: #4A9EFF; font-size: 12px; text-decoration: none; }
.ocp-link:hover { text-decoration: underline; }
.ocp-code { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; color: #C9C9CF;
  background: #1E1E20; border-radius: 6px; padding: 2px 8px; display: inline-block; }
.ocp-err { font-size: 12px; color: #FF6B5E; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; word-break: break-all; line-height: 1.5; }
/* ── 安装引导(系统页恢复操作样式;可折叠)── */
.ocp-setup { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; }
.ocp-setup-head { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.ocp-setup-t { font-size: 14.5px; font-weight: 700; }
.ocp-setup-head .ocp-chev { margin-left: auto; }
.ocp-chev-on { transform: rotate(90deg); color: #4A9EFF; }
.ocp-setup-body { display: flex; flex-direction: column; gap: 14px; }
.ocp-step { display: flex; gap: 12px; align-items: flex-start; }
.ocp-step-n { flex: none; width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-size: 12.5px; font-weight: 700; background: rgba(74,158,255,.16); color: #4A9EFF; }
.ocp-step-t { font-size: 13px; color: #F0F0F2; line-height: 1.7; }
.ocp-step-d { font-size: 12px; color: #9A9AA0; margin-top: 2px; line-height: 1.65; }
/* ── 命令集合:分段 tab(高 42,左对齐相邻)── */
.ocp-tabs { display: flex; gap: 6px; }
.ocp-tab { cursor: pointer; border: none; background: transparent; color: #9A9AA0; font-size: 13px;
  padding: 9px 15px; border-radius: 9px; display: inline-flex; gap: 7px; align-items: center; transition: background .15s; }
.ocp-tab b { font-weight: 600; font-size: 12px; opacity: .85; }
.ocp-tab:hover { background: #303036; color: #C9C9CF; }
.ocp-tab-on { background: #1E3A5F; color: #EAF2FF; }
.ocp-tab-on:hover { background: #1E3A5F; color: #EAF2FF; }
.ocp-tab-on b { opacity: .8; }
/* ── 搜索行(高输入框 + 右对齐计数)── */
.ocp-search { display: flex; align-items: center; gap: 12px; }
.ocp-input { flex: 1; min-width: 0; height: 44px; font-size: 13px; padding: 0 14px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.09); background: #1C1C1E; color: #F0F0F2; outline: none; transition: border-color .15s;
  font-family: inherit; }
.ocp-input:focus { border-color: rgba(74,158,255,.65); }
.ocp-input::placeholder { color: #6A6A72; }
.ocp-input-sm { height: 36px; font-size: 12.5px; }
.ocp-count { flex: none; font-size: 12px; color: #9A9AA0; }
.ocp-count b { color: #F0F0F2; font-weight: 600; }
/* ── 适配器卡片(独立卡片,间距 ~16,内行 67 缩放;随宿主滚动,不内滚)── */
.ocp-sites { display: flex; flex-direction: column; gap: 12px; }
.ocp-site { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 13px; padding: 15px 16px;
  cursor: pointer; transition: background .15s, border-color .15s; }
.ocp-site:hover { background: #2B2B30; }
.ocp-site-on { border-color: rgba(74,158,255,.4); background: #262B33; }
.ocp-site-dis { opacity: .55; }
.ocp-badge-dis { flex: none; background: rgba(255,69,58,.15); color: #FF6B5E; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.ocp-siterow { display: flex; align-items: center; gap: 12px; }
.ocp-ava { flex: none; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; overflow: hidden; }
.ocp-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ocp-sname { font-size: 15px; font-weight: 600; white-space: nowrap; }
.ocp-scount { font-size: 13px; color: #9A9AA0; white-space: nowrap; }
.ocp-chev { margin-left: auto; flex: none; color: #9A9AA0; font-size: 14px; display: inline-block;
  transition: transform .2s ease, color .15s; }
.ocp-site-on .ocp-chev { color: #4A9EFF; transform: rotate(90deg); }
/* ── 展开的命令列表(单行:名称 + 截断描述 + browser/read|write 徽章;点击复制)── */
.ocp-cmds { margin-top: 12px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 10px; display: flex; flex-direction: column; gap: 2px;
  max-height: 300px; overflow: auto; }
.ocp-cmdhint { font-size: 11px; color: #9A9AA0; margin-bottom: 7px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ocp-cmdrow { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px;
  cursor: pointer; transition: background .12s; }
.ocp-cmdrow:hover { background: rgba(255,255,255,.05); }
.ocp-cmdrow:active { background: rgba(74,158,255,.12); }
.ocp-cname { flex: none; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 12px; font-weight: 600; color: #79B7FF; background: #1E1E20;
  border: 1px solid rgba(255,255,255,.06); border-radius: 6px; padding: 2px 9px; }
.ocp-cdesc { flex: 1; min-width: 0; color: #A6A6AE; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ocp-tag-web { background: #333338; color: #9A9AA0; }
.ocp-tag-read { background: rgba(74,158,255,.14); color: #4A9EFF; }
.ocp-tag-write { background: rgba(229,132,90,.15); color: #E5845A; }
.ocp-copied { flex: none; color: #34C759; font-size: 11px; font-weight: 600; }
.ocp-load { font-size: 12px; color: #9A9AA0; padding: 6px 8px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
/* ── v3.4 真代码新增:试试看 / 定时 / 资产 / 跳 dsh / toast / 弹窗 ── */
.ocp-demo { background: linear-gradient(180deg, rgba(255,159,10,.08), rgba(255,159,10,0)); border-color: rgba(255,159,10,.3); }
.ocp-rowflex { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ocp-runout { margin-top: 8px; background: #1C1C1E; border: 1px solid rgba(255,255,255,.06); border-radius: 8px;
  padding: 10px 12px; font-size: 11.5px; line-height: 1.7; max-height: 280px; overflow: auto;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #C9C9CF; white-space: pre-wrap; word-break: break-all; }
.ocp-sched { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 0;
  border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12.5px; }
.ocp-sched:last-child { border-bottom: none; }
.ocp-sched.off { opacity: .55; }
.ocp-sched .ocp-sname2 { font-weight: 600; font-size: 13px; }
.ocp-sched .ocp-meta { width: 100%; font-size: 11px; color: #9A9AA0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.ocp-sw { position: relative; width: 34px; height: 20px; background: #3A3A3E; border-radius: 10px; cursor: pointer; flex: none; border: none; padding: 0; }
.ocp-sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #9A9AA0; border-radius: 50%; transition: all .15s; }
.ocp-sw-on { background: #34C759; }
.ocp-sw-on::after { left: 16px; background: #fff; }
.ocp-jump { background: #1C1C1E; border: 1px solid rgba(74,158,255,.35); border-radius: 10px; padding: 14px; margin-top: 10px; }
.ocp-jump-t { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #79B7FF; }
.ocp-pick { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; background: transparent;
  border: 1px solid rgba(74,158,255,.3); color: #79B7FF; padding: 3px 8px; border-radius: 4px; cursor: pointer; margin: 1px; }
.ocp-pick:hover { background: rgba(74,158,255,.15); }
.ocp-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); color: #0D0D0E;
  padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 9999;
  max-width: 80vw; word-break: break-all; }
.ocp-modal-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000; }
.ocp-modal { background: #1C1C1E; border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
  padding: 24px; width: 520px; max-width: 90vw; }
.ocp-modal-t { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.ocp-modal-b { font-size: 12.5px; line-height: 1.7; color: #C9C9CF; }
.ocp-modal-b > div { margin-bottom: 6px; }
.ocp-modal-f { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
.ocp-num { color: #FF9F0A; }
`;
/* 站点名 → 稳定色相(模拟 App 的彩色 favicon 头像,低饱和双色调) */ function avatarHue(name) {
    let h = 0;
    for(let i = 0; i < name.length; i++)h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
}
function Panel() {
    const [lang, setLang] = useState('zh');
    const [status, setStatus] = useState(null);
    const [adapters, setAdapters] = useState(null);
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('site');
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const [details, setDetails] = useState({});
    const [copied, setCopied] = useState(null);
    const [setupOpen, setSetupOpen] = useState(true);
    const [starting, setStarting] = useState(false);
    const [daemonMsg, setDaemonMsg] = useState(null);
    const [iconFail, setIconFail] = useState({});
    const [settings, setSettings] = useState(null);
    const [checking, setChecking] = useState(false);
    const [login, setLogin] = useState(null);
    const [recordings, setRecordings] = useState(()=>{
        try {
            return JSON.parse(localStorage.getItem('dsh-opencli-recordings') ?? '[]');
        } catch  {
            return [];
        }
    });
    const [isRecording, setIsRecording] = useState(false);
    const [recordName, setRecordName] = useState('');
    const [recordSteps, setRecordSteps] = useState([]);
    const [scheduleSite, setScheduleSite] = useState('');
    const [scheduleCron, setScheduleCron] = useState('0 9 * * *');
    const [schedules, setSchedules] = useState([]);
    const [schedBusy, setSchedBusy] = useState(false);
    const [autoMode, setAutoMode] = useState('standard');
    // 0 段:试试看
    const [runInput, setRunInput] = useState('site arxiv recent cs.AI');
    const [running, setRunning] = useState(false);
    const [runOut, setRunOut] = useState(null);
    // 4 段:跳 dsh
    const [msgInput, setMsgInput] = useState('arxiv 搜最近 7 天 AI 综述');
    const [toast, setToast] = useState(null);
    const [diagOpen, setDiagOpen] = useState(false);
    // 3.5 段:资产库
    const [assetQuery, setAssetQuery] = useState('');
    const [assetHits, setAssetHits] = useState(null);
    const [assetBusy, setAssetBusy] = useState(false);
    const [scriptList, setScriptList] = useState(null);
    const [scriptUrl, setScriptUrl] = useState('');
    const [scriptMsg, setScriptMsg] = useState(null);
    const [crawlUrl, setCrawlUrl] = useState('');
    const [crawlMsg, setCrawlMsg] = useState(null);
    const t = (k)=>STR[lang][k] ?? STR.zh[k];
    const showToast = (msg, ok)=>{
        setToast({
            msg,
            ok
        });
        window.setTimeout(()=>{
            setToast((cur)=>cur !== null && cur.msg === msg ? null : cur);
        }, 1800);
    };
    const sendToDsh = async (text, okMsg)=>{
        const ok = await copyText(text);
        if (ok) {
            showToast(okMsg, true);
            try {
                window.open(DSH_URL, '_blank');
            } catch  {}
        } else {
            showToast(t('s4copyFail'), false);
        }
    };
    const setApproval = async (enabled)=>{
        const r = await rpc('approval-set', {
            request: {
                enabled
            }
        });
        if (r.ok && r.value !== undefined && r.value.ok) setSettings((s)=>s === null ? null : {
                ...s,
                approvalOn: enabled
            });
    };
    const toggleDisable = async (name, disabled)=>{
        const r = await rpc('adapter-disable', {
            request: {
                name,
                disabled
            }
        });
        if (r.ok && r.value !== undefined && r.value.ok) {
            setAdapters((prev)=>prev === null ? prev : prev.map((a)=>a.name === name ? {
                        ...a,
                        disabled
                    } : a));
        }
    };
    const runLoginCheck = async ()=>{
        if (checking) return;
        setChecking(true);
        const r = await rpc('login-check');
        setLogin(r.ok && r.value !== undefined ? r.value : {
            ok: false,
            checkedAt: null,
            results: [],
            error: r.error?.message ?? t('errReq')
        });
        setChecking(false);
    };
    const startDaemon = async ()=>{
        if (starting) return;
        setStarting(true);
        setDaemonMsg(null);
        const r = await rpc('daemon-start');
        setStarting(false);
        if (r.ok && r.value !== undefined && r.value.ok) {
            if (r.value.started !== true && r.value.message !== null) setDaemonMsg(r.value.message);
            void reload();
        } else {
            setDaemonMsg(r.ok ? r.value?.message ?? '启动失败' : r.error?.message ?? t('errReq'));
        }
    };
    const persistRecordings = (next)=>{
        setRecordings(next);
        try {
            localStorage.setItem('dsh-opencli-recordings', JSON.stringify(next));
        } catch  {}
    };
    const startRecording = ()=>{
        setIsRecording(true);
        setRecordSteps([]);
    };
    const stopRecording = ()=>{
        if (recordName.trim().length === 0 || recordSteps.length === 0) {
            setIsRecording(false);
            return;
        }
        const next = [
            ...recordings,
            {
                id: String(Date.now()),
                name: recordName.trim(),
                steps: [
                    ...recordSteps
                ],
                createdAt: new Date().toISOString()
            }
        ];
        persistRecordings(next);
        setIsRecording(false);
        setRecordName('');
        setRecordSteps([]);
    };
    // 修复:原先 site 步骤调了不存在的 'site-replay',统一走 host 真 RPC:
    // site 步 → try-run(整行透传,带空结果保护),browser_ 步 → replay。
    const replayRecording = async (id)=>{
        const r = recordings.find((x)=>x.id === id);
        if (r === undefined) return;
        for (const step of r.steps){
            const s = step.trim();
            if (s.length === 0) continue;
            if (s.startsWith('browser_')) await rpc('replay', {
                step: s
            });
            else await rpc('try-run', {
                line: s
            });
        }
        showToast(t('s2runOk'), true);
    };
    const promoteRecording = async (id)=>{
        const r = recordings.find((x)=>x.id === id);
        if (r === undefined) return;
        const res = await rpc('promote-recording', {
            name: r.name,
            steps: r.steps
        });
        if (res.ok) {
            showToast(`${t('s3promoted')} ${res.value?.recipeId ?? ''}`, true);
            void searchAssets(assetQuery);
        } else showToast(res.error?.message ?? t('errReq'), false);
    };
    const loadSchedules = async ()=>{
        const r = await rpc('schedule-list');
        if (r.ok && r.value !== undefined) setSchedules(r.value.schedules);
    };
    const addSchedule = async ()=>{
        if (scheduleSite.trim().length === 0 || schedBusy) return;
        setSchedBusy(true);
        const r = await rpc('schedule-add', {
            site: scheduleSite.trim(),
            cron: scheduleCron
        });
        setSchedBusy(false);
        if (r.ok) {
            setScheduleSite('');
            void loadSchedules();
        } else showToast(r.error?.message ?? t('errReq'), false);
    };
    const toggleSchedule = async (id, enabled)=>{
        const r = await rpc('schedule-toggle', {
            id,
            enabled
        });
        if (r.ok) void loadSchedules();
        else showToast(r.error?.message ?? t('errReq'), false);
    };
    const removeSchedule = async (id)=>{
        const r = await rpc('schedule-remove', {
            id
        });
        if (r.ok) void loadSchedules();
        else showToast(r.error?.message ?? t('errReq'), false);
    };
    const runScheduleNow = async (id)=>{
        const r = await rpc('automation-run', {
            id
        });
        showToast(r.ok ? t('s2runOk') : r.error?.message ?? t('errReq'), r.ok);
    };
    // 0 段:真跑一条 site 命令
    const runDemo = async (cmd)=>{
        const line = cmd.trim() || 'site arxiv recent cs.AI';
        if (running) return;
        setRunning(true);
        setRunOut(null);
        const r = await rpc('try-run', {
            line
        });
        setRunning(false);
        if (r.ok) setRunOut({
            cmd: line,
            text: (r.value?.text ?? '').slice(0, 4000),
            ok: true
        });
        else setRunOut({
            cmd: line,
            text: r.error?.message ?? t('errReq'),
            ok: false
        });
    };
    // 3.5 段:资产库
    const searchAssets = async (q)=>{
        if (assetBusy) return;
        setAssetBusy(true);
        const r = await rpc('automation-search', {
            query: q
        });
        setAssetBusy(false);
        if (r.ok && r.value !== undefined) setAssetHits(r.value.hits);
        else showToast(r.error?.message ?? t('errReq'), false);
    };
    const runAsset = async (id)=>{
        const r = await rpc('automation-run', {
            id
        });
        showToast(r.ok ? t('s2runOk') : r.error?.message ?? t('errReq'), r.ok);
    };
    const loadScripts = async ()=>{
        const r = await rpc('script-catalog');
        if (r.ok && r.value !== undefined) setScriptList(r.value.scripts);
        else showToast(r.error?.message ?? t('errReq'), false);
    };
    const runBuiltin = async (name)=>{
        setScriptMsg(null);
        const r = await rpc('script-run-builtin', {
            name,
            ...scriptUrl.trim() ? {
                url: scriptUrl.trim()
            } : {}
        });
        setScriptMsg(r.ok ? (r.value?.result ?? t('s2runOk')).slice(0, 2000) : r.error?.message ?? t('errReq'));
    };
    const runCrawl = async ()=>{
        if (crawlUrl.trim().length === 0) return;
        setCrawlMsg(null);
        const r = await rpc('crawl', {
            url: crawlUrl.trim()
        });
        setCrawlMsg(r.ok ? t('s2runOk') : r.error?.message ?? t('errReq'));
    };
    const toggle = async (name, el)=>{
        if (expanded === name) {
            setExpanded(null);
            return;
        }
        setExpanded(name);
        if (el !== undefined && el !== null) window.setTimeout(()=>{
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }, 140);
        if (details[name] === undefined) {
            const r = await rpc('adapter-detail', {
                request: {
                    name
                }
            });
            setDetails((prev)=>({
                    ...prev,
                    [name]: r.ok && r.value !== undefined ? r.value : {
                        ok: false,
                        name,
                        domain: null,
                        commands: [],
                        error: r.error?.message ?? t('errReq')
                    }
                }));
        }
    };
    const copyCmd = (key, text)=>{
        void copyText(text).then((ok)=>{
            if (!ok) return;
            setCopied(key);
            window.setTimeout(()=>{
                setCopied((c)=>c === key ? null : c);
            }, 1600);
        });
    };
    const reload = async ()=>{
        if (busy) return;
        setBusy(true);
        const [st, ad, se, am, sc] = await Promise.all([
            rpc('status'),
            rpc('adapters'),
            rpc('settings'),
            rpc('automation-mode-get'),
            rpc('schedule-list')
        ]);
        if (st.ok && st.value !== undefined) setStatus(st.value);
        else setStatus(st.value ?? {
            ok: false,
            bin: null,
            version: null,
            daemon: null,
            adapterSites: null,
            error: st.error?.message ?? 'status failed'
        });
        if (ad.ok && ad.value !== undefined) setAdapters(ad.value.adapters);
        if (se.ok && se.value !== undefined) setSettings(se.value);
        if (am.ok && am.value !== undefined && typeof am.value.mode === 'string') setAutoMode(am.value.mode);
        if (sc.ok && sc.value !== undefined) setSchedules(sc.value.schedules);
        setBusy(false);
    };
    useEffect(()=>{
        void reload();
    }, []);
    const d = status?.daemon;
    const up = d?.running === true;
    const ext = d?.extension === 'connected';
    const missing = status !== null && !status.ok;
    const whoamiCount = (adapters ?? []).filter((a)=>a.commands.includes('whoami')).length;
    const isAppAdapter = (a)=>a.domain === undefined || a.domain === 'localhost' || a.domain === '127.0.0.1' || a.domain === 'null';
    const siteList = (adapters ?? []).filter((a)=>!isAppAdapter(a));
    const appList = (adapters ?? []).filter(isAppAdapter);
    const siteCmds = siteList.reduce((n, a)=>n + a.commandCount, 0);
    const appCmds = appList.reduce((n, a)=>n + a.commandCount, 0);
    const active = tab === 'site' ? siteList : appList;
    const q = query.trim().toLowerCase();
    const filtered = q.length === 0 ? active : active.filter((a)=>a.name.toLowerCase().includes(q) || (a.domain ?? '').toLowerCase().includes(q) || a.commands.some((c)=>c.toLowerCase().includes(q)));
    const loginOk = (login?.results ?? []).filter((r)=>r.ok && !r.timedOut);
    const loginWarn = (login?.results ?? []).filter((r)=>r.timedOut);
    const loginBad = (login?.results ?? []).filter((r)=>!r.ok && !r.timedOut);
    const picks = lang === 'zh' ? [
        'arxiv 搜最近 7 天 AI 综述',
        'github trending 看 AI/ML 今日榜',
        'hackernews 搜 deepseek',
        '每天9点跑 site arxiv search agent',
        '录一段:抓 arxiv 今天的 AI 论文到 Obsidian',
        '关掉所有定时',
        'huggingface 找最近 7 天大模型',
        '修改浏览器配置:切到 Playwright headless',
        '新建 recipe:批量索引 github issues'
    ] : [
        'arxiv: AI surveys from the last 7 days',
        'github trending: today’s AI/ML chart',
        'hackernews search deepseek',
        'run site arxiv search agent daily at 9am',
        'record: grab today’s arxiv AI papers to Obsidian',
        'pause all schedules',
        'huggingface: notable models of the last 7 days',
        'browser config: switch to Playwright headless',
        'new recipe: batch-index github issues'
    ];
    return createElement('div', {
        className: 'ocp'
    }, createElement('style', null, CSS), // ── 页头(图标 + 大标题 + 描述 + 语言 + 刷新)──
    createElement('div', {
        className: 'ocp-head'
    }, createElement('span', {
        className: 'ocp-icon'
    }, 'OC'), createElement('div', {
        style: {
            minWidth: 0
        }
    }, createElement('div', {
        className: 'ocp-title'
    }, t('title')), createElement('div', {
        className: 'ocp-desc'
    }, t('desc'))), createElement('div', {
        className: 'ocp-headbtns'
    }, createElement('button', {
        className: 'ocp-btn',
        onClick: ()=>{
            setLang(lang === 'zh' ? 'en' : 'zh');
        }
    }, t('langName')), createElement('button', {
        className: 'ocp-btn',
        onClick: reload,
        disabled: busy
    }, busy ? t('diagnosing') : t('refresh')))), // ── 0. 试试看(真跑 try-run)──
    createElement('div', {
        className: 'ocp-card ocp-demo',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s0t'), createElement('span', {
        className: 'ocp-tag ocp-tag-y'
    }, t('s0tag'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginBottom: '8px'
        }
    }, t('s0hint')), createElement('div', {
        className: 'ocp-rowflex'
    }, createElement('button', {
        className: 'ocp-btn ocp-btn-w',
        disabled: running,
        onClick: ()=>{
            void runDemo('site arxiv recent cs.AI');
        }
    }, running ? t('diagnosing') : t('s0demo')), createElement('input', {
        className: 'ocp-input ocp-input-sm',
        placeholder: t('s0ph'),
        value: runInput,
        onChange: (e)=>setRunInput(e.target.value)
    }), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        disabled: running,
        onClick: ()=>{
            void runDemo(runInput);
        }
    }, t('s0run'))), runOut !== null ? createElement('div', {
        className: 'ocp-runout'
    }, createElement('div', {
        style: {
            color: '#9A9AA0',
            marginBottom: '4px'
        }
    }, `$ ${runOut.cmd}`), runOut.ok ? runOut.text : createElement('span', {
        style: {
            color: '#FF6B5E'
        }
    }, runOut.text)) : null), // ── 未安装:安装引导卡(第一职责;可折叠)──
    missing ? createElement('div', {
        className: 'ocp-card ocp-setup'
    }, createElement('div', {
        className: 'ocp-setup-head',
        onClick: ()=>{
            setSetupOpen(!setupOpen);
        }
    }, createElement('span', {
        className: 'ocp-setup-t'
    }, t('s5t')), createElement('span', {
        className: `ocp-chev ${setupOpen ? 'ocp-chev-on' : ''}`
    }, '›')), setupOpen ? createElement('div', {
        className: 'ocp-setup-body'
    }, createElement('div', {
        className: 'ocp-err'
    }, status?.error ?? ''), createElement('div', {
        className: 'ocp-step'
    }, createElement('span', {
        className: 'ocp-step-n'
    }, '1'), createElement('div', null, createElement('div', {
        className: 'ocp-step-t'
    }, '安装 opencli CLI'), createElement('div', {
        className: 'ocp-step-d'
    }, createElement('span', {
        className: 'ocp-code'
    }, 'npm i -g @jackwener/opencli'), ' —— 官方一等公民路径。不想管 daemon 生命周期与更新的,可改装 OpenCLIApp 全家托底:', createElement('a', {
        className: 'ocp-link',
        href: 'https://opencli.info/download',
        target: '_blank',
        rel: 'noreferrer'
    }, 'opencli.info/download'), '。'))), createElement('div', {
        className: 'ocp-step'
    }, createElement('span', {
        className: 'ocp-step-n'
    }, '2'), createElement('div', null, createElement('div', {
        className: 'ocp-step-t'
    }, '启动 daemon,装 Chrome 扩展'), createElement('div', {
        className: 'ocp-step-d'
    }, createElement('span', {
        className: 'ocp-code'
    }, 'opencli daemon restart'), ' 启动守护进程(重启电脑后需重跑,App 路线则自动保活);再装 BrowserBridge 扩展,在 Chrome 里登录常用网站即可。'))), createElement('div', {
        className: 'ocp-step'
    }, createElement('span', {
        className: 'ocp-step-n'
    }, '3'), createElement('div', null, createElement('div', {
        className: 'ocp-step-t'
    }, '回到这里点「刷新/诊断」'), createElement('div', {
        className: 'ocp-step-d'
    }, '检测通过后,dsh 会话即可使用 browser_* 工具与 ', createElement('span', {
        className: 'ocp-code'
    }, 'site <适配器> <命令>'), '。自定义路径可设 ', createElement('span', {
        className: 'ocp-code'
    }, 'DSH_OPENCLI_BIN'), '。')))) : null) : null, // ── 1. 健康 + 登录态 chips + 运行时 ──
    status !== null && status.ok ? createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s1t'), createElement('span', {
        className: `ocp-tag ${up && ext ? 'ocp-tag-g' : 'ocp-tag-y'}`
    }, up && ext ? t('s1okTag') : `${t('s1daemon')}:${up ? t('s1running') : t('s1stopped')}`)), createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: `ocp-dot ${up ? 'ocp-ok' : 'ocp-bad'}`
    }), createElement('span', {
        className: 'ocp-sk'
    }, 'opencli'), createElement('span', {
        className: 'ocp-sv ocp-mono',
        style: {
            fontSize: 12
        }
    }, `${t('s1ver')}${status.version ?? '?'}`), createElement('span', {
        className: 'ocp-dot',
        style: {
            marginLeft: '8px',
            background: up ? '#34C759' : '#FF453A'
        }
    }), createElement('span', {
        className: 'ocp-sk'
    }, t('s1daemon')), createElement('span', {
        className: 'ocp-sv'
    }, up ? t('s1running') : t('s1stopped')), createElement('span', {
        className: 'ocp-dot',
        style: {
            marginLeft: '8px',
            background: ext ? '#34C759' : '#FF453A'
        }
    }), createElement('span', {
        className: 'ocp-sk'
    }, t('s1ext')), createElement('span', {
        className: 'ocp-sv'
    }, ext ? t('s1extOn') : d?.extension ?? '未知'), up ? null : createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        disabled: starting,
        onClick: ()=>{
            void startDaemon();
        }
    }, starting ? t('s1starting') : t('s1start')), daemonMsg !== null ? createElement('span', {
        className: 'ocp-err'
    }, daemonMsg) : null), createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-sk'
    }, t('s1approval')), createElement('span', {
        className: 'ocp-sv'
    }, settings === null ? '…' : settings.approvalOn ? t('s1approvalOn') : t('s1approvalOff')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void setApproval(!(settings?.approvalOn ?? true));
        }
    }, settings?.approvalOn === false ? t('s1on') : t('s1off'))), whoamiCount > 0 || login !== null ? createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-sk'
    }, t('s1login')), login === null ? createElement('span', {
        className: 'ocp-sv'
    }, `${whoamiCount} ${t('s1loginCan')}`) : createElement('div', {
        className: 'ocp-chips'
    }, loginOk.slice(0, 5).map((r)=>createElement('span', {
            key: r.site,
            className: 'ocp-chip',
            title: r.detail ?? ''
        }, createElement('span', {
            className: 'ocp-dot ocp-ok'
        }), r.site)), loginWarn.slice(0, 2).map((r)=>createElement('span', {
            key: r.site,
            className: 'ocp-chip ocp-chip-y'
        }, createElement('span', {
            className: 'ocp-dot',
            style: {
                background: '#FF9F0A'
            }
        }), `${r.site} (${t('s1timeout')})`)), loginBad.slice(0, 2).map((r)=>createElement('span', {
            key: r.site,
            className: 'ocp-chip ocp-chip-r'
        }, createElement('span', {
            className: 'ocp-dot ocp-bad'
        }), r.site)), (login?.results ?? []).length > 9 ? createElement('details', {
        style: {
            display: 'inline'
        }
    }, createElement('summary', {
        style: {
            fontSize: '11px'
        }
    }, `+ ${(login?.results ?? []).length - 9}`), createElement('div', {
        className: 'ocp-login'
    }, (login?.results ?? []).slice(9).map((r)=>createElement('div', {
            key: r.site,
            className: 'ocp-lrow',
            title: r.detail ?? ''
        }, createElement('span', {
            className: `ocp-dot ${r.timedOut ? 'ocp-mid' : r.ok ? 'ocp-ok' : 'ocp-bad'}`
        }), createElement('span', {
            className: 'ocp-lsite'
        }, r.site), createElement('span', {
            className: 'ocp-ldetail'
        }, r.timedOut ? t('s1timeout') : r.detail ?? ''))))) : null), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        disabled: checking,
        onClick: ()=>{
            void runLoginCheck();
        }
    }, checking ? t('s1checking') : t('s1check')), login !== null ? createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            setLogin(null);
        }
    }, t('s1collapse')) : null) : null, login !== null && !login.ok ? createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-err'
    }, login.error ?? t('s1checkFail'))) : null, createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-sk'
    }, t('s1runtime')), createElement('span', {
        className: 'ocp-sv ocp-mono',
        style: {
            fontSize: 12
        }
    }, `${status.adapterSites ?? adapters?.length ?? '?'} ${t('s1sites')}`, ` · ${siteCmds + appCmds} ${t('s1cmds')}`, d?.port !== undefined ? ` · :${d.port}` : '', d?.uptime !== undefined ? ` · ↑ ${d.uptime}` : ''), createElement('span', {
        className: 'ocp-sk',
        style: {
            marginLeft: '8px'
        }
    }, t('s1mode')), createElement('span', {
        className: 'ocp-code'
    }, autoMode)), createElement('div', {
        className: 'ocp-hint',
        style: {
            padding: '6px 0 8px'
        }
    }, t('s1loginHint'))) : null, // ── 0.6 实用快捷 ──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s06t'), createElement('span', {
        className: 'ocp-tag'
    }, t('s06tag'))), createElement('div', {
        className: 'ocp-rowflex'
    }, createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            setDiagOpen(true);
        }
    }, t('s06diag')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,装 opencli skill' : 'dsh assistant, install the opencli skill', t('s4sent'));
        }
    }, t('s06skill')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,修改浏览器配置:切到 Patchright' : 'dsh assistant, browser config: switch to Patchright', t('s4sent'));
        }
    }, t('s06patch')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,修改浏览器配置:开 headless' : 'dsh assistant, browser config: headless on', t('s4sent'));
        }
    }, t('s06hon')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,修改浏览器配置:关 headless' : 'dsh assistant, browser config: headless off', t('s4sent'));
        }
    }, t('s06hoff')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,修改自动化档:切到 read-only' : 'dsh assistant, automation level: read-only', t('s4sent'));
        }
    }, t('s06ro')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void sendToDsh(lang === 'zh' ? 'dsh 助手,修改自动化档:切到 autonomous' : 'dsh assistant, automation level: autonomous', t('s4sent'));
        }
    }, t('s06auto'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginTop: '8px'
        }
    }, t('s06hint'))), // 失败诊断弹窗
    diagOpen ? createElement('div', {
        className: 'ocp-modal-bg',
        onClick: ()=>{
            setDiagOpen(false);
        }
    }, createElement('div', {
        className: 'ocp-modal',
        onClick: (e)=>{
            e.stopPropagation();
        }
    }, createElement('div', {
        className: 'ocp-modal-t'
    }, t('diagT')), createElement('div', {
        className: 'ocp-modal-b'
    }, createElement('div', null, createElement('span', {
        className: 'ocp-num'
    }, '1. '), t('diag1')), createElement('div', null, createElement('span', {
        className: 'ocp-num'
    }, '2. '), t('diag2')), createElement('div', null, createElement('span', {
        className: 'ocp-num'
    }, '3. '), t('diag3')), createElement('div', null, createElement('span', {
        className: 'ocp-num'
    }, '4. '), t('diag4')), createElement('div', null, createElement('span', {
        className: 'ocp-num'
    }, '5. '), t('diag5'))), createElement('div', {
        className: 'ocp-modal-f'
    }, createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            setDiagOpen(false);
        }
    }, t('diagClose')), createElement('button', {
        className: 'ocp-btn ocp-btn-sm ocp-btn-p',
        onClick: ()=>{
            setDiagOpen(false);
            void sendToDsh(lang === 'zh' ? 'dsh 助手,请帮我排查定时失败' : 'dsh assistant, help me diagnose the schedule failure', t('s4sent'));
        }
    }, t('diagSend'))))) : null, // ── 2. 定时任务(真数据:host 内存 schedules + enabled 开关)──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, `${t('s2t')} `, createElement('span', {
        className: 'ocp-tag'
    }, String(schedules.length))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginBottom: '8px'
        }
    }, t('s2hint')), schedules.length > 0 ? createElement('div', null, schedules.map((s)=>createElement('div', {
            key: s.id,
            className: `ocp-sched ${s.enabled ? '' : 'off'}`
        }, createElement('button', {
            className: `ocp-sw ${s.enabled ? 'ocp-sw-on' : ''}`,
            title: s.enabled ? t('s2pause') : t('s2resume'),
            onClick: ()=>{
                void toggleSchedule(s.id, !s.enabled);
            }
        }), createElement('span', {
            className: 'ocp-sname2'
        }, s.site), createElement('span', {
            className: `ocp-tag ${s.enabled ? 'ocp-tag-g' : ''}`
        }, s.enabled ? t('s2on') : t('s2paused')), createElement('span', {
            className: 'ocp-meta'
        }, `cron: ${s.cron} · ${s.createdAt}`), createElement('span', {
            style: {
                marginLeft: 'auto',
                display: 'flex',
                gap: '6px'
            }
        }, createElement('button', {
            className: 'ocp-btn ocp-btn-sm ocp-btn-w',
            onClick: ()=>{
                void runScheduleNow(s.id);
            }
        }, t('s2run')), createElement('button', {
            className: 'ocp-btn ocp-btn-sm ocp-btn-d',
            onClick: ()=>{
                void removeSchedule(s.id);
            }
        }, t('s2del')))))) : createElement('div', {
        className: 'ocp-hint',
        style: {
            padding: '6px 0'
        }
    }, t('s2empty')), createElement('div', {
        className: 'ocp-srow'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            flex: 1
        },
        placeholder: t('s2sitePh'),
        value: scheduleSite,
        onChange: (e)=>setScheduleSite(e.target.value)
    }), createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            width: '130px',
            flex: 'none'
        },
        placeholder: t('s2cronPh'),
        value: scheduleCron,
        onChange: (e)=>setScheduleCron(e.target.value)
    }), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        disabled: schedBusy,
        onClick: ()=>{
            void addSchedule();
        }
    }, t('s2create'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            paddingBottom: '8px'
        }
    }, t('s2hist'))), // ── 3. 录制回放 ──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-srow',
        style: {
            paddingBottom: '10px'
        }
    }, createElement('span', {
        className: 'ocp-setup-t'
    }, `${t('s3t')} `), createElement('span', {
        className: 'ocp-tag'
    }, `${recordings.length}`), createElement('span', {
        className: 'ocp-hint'
    }, t('s3hint')), createElement('span', {
        style: {
            marginLeft: 'auto'
        }
    }, createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            if (isRecording) stopRecording();
            else startRecording();
        }
    }, isRecording ? t('s3stop') : t('s3start')))), isRecording ? createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }
    }, createElement('div', {
        className: 'ocp-srow'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        placeholder: t('s3namePh'),
        value: recordName,
        onChange: (e)=>setRecordName(e.target.value)
    }), createElement('span', {
        className: 'ocp-hint'
    }, `${t('s3recorded')} ${recordSteps.length}`)), createElement('div', {
        className: 'ocp-srow'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        placeholder: t('s3stepPh'),
        onKeyDown: (e)=>{
            if (e.key === 'Enter' && e.currentTarget.value.trim().length > 0) {
                setRecordSteps((prev)=>[
                        ...prev,
                        e.currentTarget.value.trim()
                    ]);
                e.currentTarget.value = '';
            }
        }
    })), recordSteps.length > 0 ? createElement('div', {
        className: 'ocp-hint'
    }, recordSteps.map((s, i)=>`${i + 1}. ${s}`).join('  |  ')) : null) : null, recordings.length > 0 ? createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            marginTop: '4px'
        }
    }, recordings.slice(0, 5).map((r)=>createElement('div', {
            key: r.id,
            className: 'ocp-sched'
        }, createElement('span', {
            className: 'ocp-sname2',
            style: {
                fontSize: '12px'
            }
        }, r.name), createElement('span', {
            className: 'ocp-hint'
        }, `${r.steps.length}${t('s3steps')} · ${new Date(r.createdAt).toLocaleDateString()}`), createElement('span', {
            style: {
                marginLeft: 'auto',
                display: 'flex',
                gap: '6px'
            }
        }, createElement('button', {
            className: 'ocp-btn ocp-btn-sm ocp-btn-w',
            onClick: ()=>{
                void replayRecording(r.id);
            }
        }, t('s3replay')), createElement('button', {
            className: 'ocp-btn ocp-btn-sm',
            onClick: ()=>{
                void promoteRecording(r.id);
            }
        }, t('s3promote')), createElement('button', {
            className: 'ocp-btn ocp-btn-sm ocp-btn-d',
            onClick: ()=>{
                persistRecordings(recordings.filter((x)=>x.id !== r.id));
            }
        }, t('s3del')))))) : createElement('div', {
        className: 'ocp-hint',
        style: {
            padding: '8px 0'
        }
    }, t('s3empty'))), // ── 3.5 自动化资产库 ──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s35t'), createElement('span', {
        className: 'ocp-tag'
    }, t('s35tag'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginBottom: '8px'
        }
    }, t('s35hint')), createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-sk'
    }, t('s35mode')), createElement('select', {
        className: 'ocp-input ocp-input-sm',
        style: {
            width: '160px',
            flex: 'none'
        },
        value: autoMode,
        onChange: async (e)=>{
            const m = e.target.value;
            const r = await rpc('automation-mode-set', {
                mode: m
            });
            if (r.ok) setAutoMode(m);
        }
    }, createElement('option', {
        value: 'read-only'
    }, t('s35mReadonly')), createElement('option', {
        value: 'standard'
    }, t('s35mStandard')), createElement('option', {
        value: 'autonomous'
    }, t('s35mAuto')), createElement('option', {
        value: 'unrestricted'
    }, t('s35mUnrest'))), createElement('span', {
        className: 'ocp-sk',
        style: {
            marginLeft: '8px'
        }
    }, t('s35limit')), createElement('span', {
        className: 'ocp-hint'
    }, t('s35limitV')), createElement('span', {
        className: 'ocp-tag ocp-tag-read',
        style: {
            marginLeft: 'auto'
        }
    }, t('s35limitOn'))), createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-sk'
    }, t('s35auth')), createElement('span', {
        className: 'ocp-hint'
    }, t('s35authV'))), createElement('div', {
        className: 'ocp-srow'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            flex: 1
        },
        placeholder: t('s35searchPh'),
        value: assetQuery,
        onChange: (e)=>setAssetQuery(e.target.value)
    }), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        disabled: assetBusy,
        onClick: ()=>{
            void searchAssets(assetQuery);
        }
    }, assetBusy ? t('diagnosing') : t('s35search'))), assetHits === null ? createElement('div', {
        className: 'ocp-hint',
        style: {
            padding: '6px 0'
        }
    }, t('s35empty')) : assetHits.length === 0 ? createElement('div', {
        className: 'ocp-hint',
        style: {
            padding: '6px 0'
        }
    }, t('s35empty')) : createElement('div', null, assetHits.map((h)=>createElement('div', {
            key: h.id,
            className: 'ocp-sched'
        }, createElement('span', {
            className: 'ocp-sname2',
            style: {
                fontSize: '12px'
            }
        }, h.name), createElement('span', {
            className: 'ocp-hint ocp-mono'
        }, h.id), createElement('span', {
            style: {
                marginLeft: 'auto'
            }
        }, createElement('button', {
            className: 'ocp-btn ocp-btn-sm ocp-btn-w',
            onClick: ()=>{
                void runAsset(h.id);
            }
        }, t('s35run')))))), createElement('div', {
        className: 'ocp-srow'
    }, createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void loadScripts();
        }
    }, t('s35scripts')), createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            flex: 1
        },
        placeholder: t('s35scriptUrlPh'),
        value: scriptUrl,
        onChange: (e)=>setScriptUrl(e.target.value)
    })), scriptList !== null ? createElement('div', null, scriptList.map((s)=>createElement('div', {
            key: s.name,
            className: 'ocp-sched'
        }, createElement('span', {
            className: 'ocp-cname'
        }, s.name), createElement('span', {
            className: 'ocp-hint'
        }, s.description), createElement('span', {
            style: {
                marginLeft: 'auto'
            }
        }, createElement('button', {
            className: 'ocp-btn ocp-btn-sm',
            onClick: ()=>{
                void runBuiltin(s.name);
            }
        }, t('s35scriptRun')))))) : null, scriptMsg !== null ? createElement('div', {
        className: 'ocp-runout',
        style: {
            marginTop: '6px',
            maxHeight: '160px'
        }
    }, scriptMsg) : null, createElement('div', {
        className: 'ocp-srow'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            flex: 1
        },
        placeholder: t('s35crawlUrlPh'),
        value: crawlUrl,
        onChange: (e)=>setCrawlUrl(e.target.value)
    }), createElement('button', {
        className: 'ocp-btn ocp-btn-sm',
        onClick: ()=>{
            void runCrawl();
        }
    }, t('s35crawlRun'))), crawlMsg !== null ? createElement('div', {
        className: 'ocp-hint',
        style: {
            paddingBottom: '6px'
        }
    }, crawlMsg) : null, createElement('div', {
        className: 'ocp-hint',
        style: {
            paddingBottom: '8px'
        }
    }, t('s35note'))), // ── 4. 跳到 dsh 对话框 ──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s4t')), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginBottom: '8px'
        }
    }, t('s4lead')), createElement('div', {
        className: 'ocp-jump'
    }, createElement('div', {
        className: 'ocp-jump-t'
    }, t('s4jumpT')), createElement('div', {
        className: 'ocp-rowflex'
    }, createElement('input', {
        className: 'ocp-input ocp-input-sm',
        style: {
            flex: 1
        },
        placeholder: t('s4ph'),
        value: msgInput,
        onChange: (e)=>setMsgInput(e.target.value)
    }), createElement('button', {
        className: 'ocp-btn ocp-btn-sm ocp-btn-p',
        style: {
            height: '36px'
        },
        onClick: ()=>{
            const text = msgInput.trim();
            if (!text) {
                showToast(t('s4empty'), false);
                return;
            }
            void sendToDsh(text, t('s4sent'));
        }
    }, t('s4send'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginTop: '10px'
        }
    }, t('s4jumpHint'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginTop: '10px',
            marginBottom: '6px'
        }
    }, t('s4picksT')), createElement('div', {
        style: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px'
        }
    }, picks.map((p)=>createElement('button', {
            key: p,
            className: 'ocp-pick',
            onClick: ()=>{
                setMsgInput(p);
            }
        }, p))), createElement('div', {
        className: 'ocp-hint',
        style: {
            marginTop: '8px',
            paddingBottom: '6px'
        }
    }, t('s4hint'))), // ── 已安装:一行确认(无需操作)──
    !missing && status !== null && status.ok ? createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-dot ocp-mid'
    }), createElement('span', {
        className: 'ocp-sv'
    }, t('s5done')), createElement('span', {
        className: 'ocp-code'
    }, `opencli ${status.version ?? '?'}`), createElement('span', {
        className: 'ocp-code'
    }, `daemon ${up ? t('s1running') : t('s1stopped')}`), createElement('span', {
        className: 'ocp-code'
    }, `extension ${d?.extension ?? '?'}`), createElement('span', {
        className: 'ocp-tag ocp-tag-g',
        style: {
            marginLeft: 'auto'
        }
    }, t('s5noop'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            paddingBottom: '8px'
        }
    }, t('s5hint'))) : null, // ── 6. 当前 dsh profile ──
    createElement('div', {
        className: 'ocp-card',
        style: {
            padding: '12px 18px'
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s6t')), createElement('div', {
        className: 'ocp-srow'
    }, createElement('span', {
        className: 'ocp-dot ocp-ok'
    }), createElement('span', {
        className: 'ocp-sk'
    }, t('s6profile')), createElement('span', {
        className: 'ocp-sv ocp-mono'
    }, 'web'), createElement('span', {
        className: 'ocp-sk',
        style: {
            marginLeft: '8px'
        }
    }, t('s6state')), createElement('span', {
        className: 'ocp-sv',
        style: {
            color: '#4DDB7A',
            fontWeight: 600
        }
    }, t('s6mounted')), createElement('span', {
        className: 'ocp-tag ocp-tag-g',
        style: {
            marginLeft: 'auto'
        }
    }, t('s6ok'))), createElement('div', {
        className: 'ocp-hint',
        style: {
            paddingBottom: '8px'
        }
    }, t('s6hint'))), // ── 0.5 命令集合(对齐 App 同名页面;真数据)──
    adapters !== null ? createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 12
        }
    }, createElement('div', {
        className: 'ocp-sect'
    }, t('s05t'), createElement('span', {
        className: 'ocp-tag'
    }, `${siteCmds + appCmds}`)), createElement('div', {
        className: 'ocp-chips',
        style: {
            marginBottom: '-4px'
        }
    }, siteList.slice(0, 8).map((a)=>createElement('button', {
            key: a.name,
            className: 'ocp-pick',
            title: `${a.commandCount}`,
            onClick: ()=>{
                setTab('site');
                setQuery(a.name);
                setExpanded(null);
            }
        }, `${a.name} · ${a.commandCount}`))), createElement('div', {
        className: 'ocp-hint'
    }, t('s05hint')), createElement('div', {
        className: 'ocp-tabs'
    }, createElement('button', {
        className: `ocp-tab ${tab === 'site' ? 'ocp-tab-on' : ''}`,
        title: t('s05siteTitle'),
        onClick: ()=>{
            setTab('site');
            setExpanded(null);
        }
    }, t('s05siteCmds'), createElement('b', null, String(siteCmds))), createElement('button', {
        className: `ocp-tab ${tab === 'app' ? 'ocp-tab-on' : ''}`,
        title: t('s05appTitle'),
        onClick: ()=>{
            setTab('app');
            setExpanded(null);
        }
    }, t('s05appCmds'), createElement('b', null, String(appCmds)))), createElement('div', {
        className: 'ocp-search'
    }, createElement('input', {
        className: 'ocp-input',
        placeholder: t('s05searchPh'),
        value: query,
        onChange: (e)=>setQuery(e.target.value)
    }), createElement('span', {
        className: 'ocp-count'
    }, createElement('b', null, String(q.length > 0 ? filtered.length : tab === 'site' ? siteCmds : appCmds)), ` ${t('s05cmds')}`)), createElement('div', {
        className: 'ocp-sites'
    }, filtered.slice(0, 200).map((a)=>{
        const open = expanded === a.name;
        const detail = details[a.name];
        const hue = avatarHue(a.name);
        const hasDomain = a.domain !== undefined && a.domain !== 'localhost' && a.domain !== '127.0.0.1' && a.domain !== 'null';
        const useFavicon = hasDomain === true && iconFail[a.name] !== true;
        return createElement('div', {
            key: a.name,
            className: `ocp-site ${open ? 'ocp-site-on' : ''} ${a.disabled === true ? 'ocp-site-dis' : ''}`,
            onClick: (e)=>{
                void toggle(a.name, e.currentTarget);
            }
        }, createElement('div', {
            className: 'ocp-siterow'
        }, createElement('span', {
            className: 'ocp-ava',
            style: useFavicon ? undefined : {
                background: `hsl(${hue} 42% 30%)`,
                color: `hsl(${hue} 75% 78%)`
            }
        }, useFavicon ? createElement('img', {
            src: `https://${a.domain}/favicon.ico`,
            loading: 'lazy',
            alt: '',
            onError: ()=>{
                setIconFail((p)=>({
                        ...p,
                        [a.name]: true
                    }));
            }
        }) : a.name.slice(0, 1).toUpperCase()), createElement('span', {
            className: 'ocp-sname'
        }, a.name), createElement('span', {
            className: 'ocp-scount'
        }, String(a.commandCount)), a.disabled === true ? createElement('span', {
            className: 'ocp-badge-dis'
        }, t('s05disabled')) : null, createElement('span', {
            className: 'ocp-chev'
        }, '›')), open ? createElement('div', {
            className: 'ocp-cmds',
            onClick: (e)=>{
                e.stopPropagation();
            }
        }, createElement('div', {
            className: 'ocp-cmdhint'
        }, createElement('span', null, t('s05call')), createElement('span', {
            className: 'ocp-code'
        }, `site ${a.name} <命令>`), createElement('span', null, t('s05copyHint')), createElement('button', {
            className: 'ocp-btn ocp-btn-sm',
            style: {
                marginLeft: 'auto'
            },
            onClick: ()=>{
                void toggleDisable(a.name, a.disabled !== true);
            }
        }, a.disabled === true ? t('s05enable') : t('s05disable'))), detail === undefined ? createElement('div', {
            className: 'ocp-load'
        }, t('s05loading')) : detail.ok ? detail.commands.map((c)=>{
            const cmdText = c.example !== undefined && c.example.length > 0 ? c.example : `opencli ${a.name} ${c.name}`;
            const key = `${a.name}:${c.name}`;
            const justCopied = copied === key;
            return createElement('div', {
                key: c.name,
                className: 'ocp-cmdrow',
                title: `${cmdText}\n点击复制`,
                onClick: ()=>{
                    copyCmd(key, cmdText);
                }
            }, createElement('span', {
                className: 'ocp-cname'
            }, c.name), createElement('span', {
                className: 'ocp-cdesc'
            }, c.description.length > 0 ? c.description : '—'), createElement('span', {
                className: 'ocp-tag ocp-tag-web'
            }, 'browser'), createElement('span', {
                className: `ocp-tag ${c.access === 'write' ? 'ocp-tag-write' : 'ocp-tag-read'}`
            }, c.access), justCopied ? createElement('span', {
                className: 'ocp-copied'
            }, t('s05copied')) : null);
        }) : createElement('div', {
            className: 'ocp-err'
        }, detail.error ?? t('s05loadFail'))) : null);
    }), filtered.length === 0 ? createElement('div', {
        className: 'ocp-load'
    }, t('s05empty')) : null)) : null, // toast
    toast !== null ? createElement('div', {
        className: 'ocp-toast',
        style: {
            background: toast.ok ? '#4DDB7A' : '#FF453A'
        }
    }, toast.msg) : null);
}
export function apply(ctx) {
    ctx.slots.inject('settings.section', ()=>ctx.slots.register({
            name: 'settings.section',
            id: 'opencli-proxy',
            order: 41,
            label: '浏览器代理'
        }, ()=>createElement(Panel)));
}
