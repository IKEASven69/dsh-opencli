/**
 * dsh-opencli 浏览器半 v0.4:设置页「浏览器代理」——按 2026-09 施工图重排。
 * 四 tab(总览/命令/自动化/安全与设置)+ 状态机四态 + 真数据真 RPC(零 emoji)。
 * 视觉:冷灰深色 + #4A9EFF 界面强调,品牌鲸标(DS 鲸 × CLI 提示符),统一线性图标 sprite。
 * 施工注记(详见 .design/06-状态机规格):基宽 800 自适应;响应式按容器;host v0.4 新增
 * audit-list / logs-tail / schedule-run-now / sha256 / 定时重试通知均已接线。
 * @module dsh-opencli/client
 */

import { createElement, useEffect, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  AdapterDetailResult, AdapterDisableResult, AdapterInfo, AdaptersResult, ApprovalSetResult,
  AuditListResult, DaemonStartResult, LoginCheckResult, LogsTailResult, OpencliStatus, SettingsResult,
} from './types.ts'

export const inject = ['slots']

const DSH_URL = 'http://127.0.0.1:3080'
const RELEASES_URL = 'https://github.com/IKEASven69/dsh-opencli/releases'

type Lang = 'zh' | 'en'

const STR = {
  zh: {
    title: 'OpenCLI 浏览器代理',
    desc: '驱动你登录态的真实浏览器 · 176 站 / 200+ 命令一步式执行 · 由 OpenCLI daemon 驱动',
    tabOverview: '总览', tabCommands: '命令', tabAuto: '自动化', tabSec: '安全与设置',
    daemonRunning: '运行中', daemonDown: '未运行', daemonStale: '失联', bridgeOn: '已连接', bridgeOff: '未连接',
    recheck: '重新巡检', checking: '巡检中…', diagAll: '一切正常', detail: '详情',
    tryT: '试试看', trySub: '在对话里直接说,或先在这里跑一条 · 点右侧快捷/命令徽章 → 填入输入框',
    run: '运行', running: '跑这', copy: '复制', rerun: '重跑', copied: '已复制',
    quickT: '实用快捷', quickSub: '点击 → 填入输入框;Ctrl+Enter 直接跑',
    loginT: '登录态巡检', loginSub: '绿=已登 黄=超时 红=未登 · 状态条只亮灯,操作在这里',
    online: '在线', expired: '失效', unknown: '未知', timeout: '超时', openLogin: '打开登录',
    secT: '安全中心', secSub: '写操作全部经过你批准', lastBlocked: '最近拦截',
    gateOn: '开启', gateOff: '关闭', gateLabel: '写审批门', gateDesc: '写命令(发帖/点赞/下单)先弹审批,你点「允许」才执行;权限不明的命令一律按写处理',
    gateOnLabel: '已开启', gateOffLabel: '已关闭',
    modeReadOnly: '所有写命令直接拒绝,零打扰', modeStandard: '写命令逐条审批(推荐)',
    modeAuto: '白名单站点自动放行,其余审批', modeUnres: '全部放行(不建议)',
    auditT: '拦截审计', auditEmpty: '近 7 天没有拦截记录', auditN: (n: number) => `近 7 天拦截 ${n} 次`,
    proofT: '供应链自证', proofSub: '本插件的安全边界,可核查',
    proofNoTelemetry: '无遥测上传', proofNoCurl: '无 curl | sh', proofFailClosed: '写命令 fail-closed',
    proofClip: '输出截断防注入', proofRel: '来源 GitHub Releases', verified: '已核验',
    rateT: '限流与限域', rateSub: '保护你的账号不被风控',
    shaLine: 'sha256(本构建)', verT: '版本与更新', verNow: '当前', channel: '渠道 stable',
    checkUpd: '检查更新', upToDate: '已是最新', updAvail: '可更新到', updMarket: '经 dsh-market Update API',
    updFallback: '未装市场插件 → GitHub Releases 检查', updating: '检查中…',
    cmdT: '命令', cmdSearch: '搜索站点或命令,如:热榜 / search / bilibili',
    cmdFmt: '点命令行 → 复制调用格式;禁用适配器会即时从 systemPrompt 收缩目录(需确认)',
    disable: '禁用', enable: '启用', commandsN: (n: number) => `${n} 命令`,
    autoT: '定时任务', autoNew: '新建', autoSub: '持久化到 dsh.schedule,重启不丢 · 失败按策略重试并通知',
    depDaemon: 'daemon 未运行——定时任务暂停执行,恢复后自动补跑', fix: '一键修复',
    last: '上次', next: '下次', retryN: (n: number) => `重试 ×${n}`, notifyOn: '通知 开', notifyOff: '通知 关',
    runNow: '立即跑', running2: '执行中…', del: '删', create: '创建',
    recT: '录制回放', recSub: '录制 site / browser 步骤,一键回放', recStart: '开始录制', recStop: '停止录制',
    recName: '录制名,如:每日知识采集', recStep: '一条步骤,如:site zhihu hot', recAdd: '+ 加步骤', replay: '回放',
    assetT: '资产库', assetSub: '脚本 / 配方 / 规则包', assetSearch: '搜资产(如:arxiv)', assetSearchBtn: '搜索',
    builtinT: '内置脚本', recipes: '配方', rulepacks: '规则包', browse: '浏览全部',
    v4host: 'v4 host 新增;v0.3.8 已有增删/开关/立即跑',
    diagT: '诊断', diagSub: '最近一次 shell/解析失败原文,给修复与反馈用', copyDiag: '复制诊断', viewLog: '查看日志',
    noLog: 'opencli 未暴露日志文件;以下为最近诊断快照',
    more: '更多', guide: '安装引导', guideD: '装 BrowserBridge 扩展 / 启动 daemon',
    profileT: 'profile 说明', profileD: '登录态来自你日常浏览器,与 dsh 内置浏览器无关',
    jump: '跳转 dsh 设置', jumpD: '在对话里管理插件', open: '打开',
    setupT: '未检测到 opencli —— 三步接入', loading: '检测中…',
    step1: '安装 opencli CLI', step1c: 'npm i -g @jackwener/opencli(官方一等公民路径)',
    step2: '启动 daemon,装 Chrome 扩展', step2c: 'opencli daemon restart',
    step3: '回到这里点「刷新/诊断」',
    siteEmpty: '适配器返回空(可能未登录或无数据)。请先在真实 Chrome 登录后重试。',
    needLogin: 'daemon 未运行或浏览器桥未连接——点「启动 daemon」后重试',
    errReq: '请求失败', confirmDisable: (n: string) => `禁用 ${n}?目录将即时从 systemPrompt 收缩。`,
    enNote: '双语:i18n key 施工(zh 默认)', statesNote: '四态:检测中/正常/依赖缺失/RPC错误 —— 详见 .design/06 状态机规格',
  },
  en: {
    title: 'OpenCLI Browser Proxy',
    desc: 'Drive your logged-in real browser · 176 sites / 200+ commands one-shot · powered by the OpenCLI daemon',
    tabOverview: 'Overview', tabCommands: 'Commands', tabAuto: 'Automation', tabSec: 'Security',
    daemonRunning: 'running', daemonDown: 'not running', daemonStale: 'stale', bridgeOn: 'connected', bridgeOff: 'not connected',
    recheck: 'Re-check', checking: 'checking…', diagAll: 'All good', detail: 'detail',
    tryT: 'Try it', trySub: 'Say it in chat, or run one here · click a quick pick/command badge to fill the input',
    run: 'Run', running: 'Run', copy: 'Copy', rerun: 'Re-run', copied: 'Copied',
    quickT: 'Quick picks', quickSub: 'Click → fill the input; Ctrl+Enter to run',
    loginT: 'Login check', loginSub: 'green=logged-in yellow=timeout red=expired · status bar shows dots, actions live here',
    online: 'online', expired: 'expired', unknown: 'unknown', timeout: 'timeout', openLogin: 'Open login',
    secT: 'Security center', secSub: 'Every write goes through your approval', lastBlocked: 'Blocked (7d)',
    gateOn: 'On', gateOff: 'Off', gateLabel: 'Write approval gate', gateDesc: 'Writes (post/like/order) ask first — nothing runs until you allow; unknown-access commands are treated as writes',
    gateOnLabel: 'On', gateOffLabel: 'Off',
    modeReadOnly: 'All writes rejected, zero interruptions', modeStandard: 'Each write asks (recommended)',
    modeAuto: 'Whitelisted sites auto-run, rest ask', modeUnres: 'Allow all (not recommended)',
    auditT: 'Interception audit', auditEmpty: 'No interceptions in 7 days', auditN: (n: number) => `${n} blocked in 7 days`,
    proofT: 'Supply-chain self-attestation', proofSub: 'This plugin\u2019s security boundary, verifiable',
    proofNoTelemetry: 'no telemetry', proofNoCurl: 'no curl | sh', proofFailClosed: 'writes fail-closed',
    proofClip: 'output clipped anti-injection', proofRel: 'from GitHub Releases', verified: 'verified',
    rateT: 'Rate limit & domain fence', rateSub: 'Protects your accounts from bot controls',
    shaLine: 'sha256 (this build)', verT: 'Version & updates', verNow: 'current', channel: 'channel stable',
    checkUpd: 'Check updates', upToDate: 'up to date', updAvail: 'update available:', updMarket: 'via dsh-market Update API',
    updFallback: 'market plugin absent → check GitHub Releases', updating: 'checking…',
    cmdT: 'Commands', cmdSearch: 'Search sites or commands, e.g. trending / search / bilibili',
    cmdFmt: 'Click a command row → copy call format; disabling a adapter shrinks the systemPrompt catalog (confirm first)',
    disable: 'Disable', enable: 'Enable', commandsN: (n: number) => `${n} cmds`,
    autoT: 'Schedules', autoNew: 'New', autoSub: 'Persisted to dsh.schedule, survives restart · retries then notifies on failure',
    depDaemon: 'daemon not running — schedules paused, will catch up when it returns', fix: 'Fix',
    last: 'last', next: 'next', retryN: (n: number) => `retry ×${n}`, notifyOn: 'notify on', notifyOff: 'notify off',
    runNow: 'Run now', running2: 'running…', del: 'Del', create: 'Create',
    recT: 'Record & replay', recSub: 'Record site / browser steps, replay in one click', recStart: 'Record', recStop: 'Stop',
    recName: 'name, e.g. daily knowledge', recStep: 'one step, e.g. site zhihu hot', recAdd: '+ add step', replay: 'Replay',
    assetT: 'Assets', assetSub: 'scripts / recipes / rulepacks', assetSearch: 'search assets (e.g. arxiv)', assetSearchBtn: 'Search',
    builtinT: 'Builtin scripts', recipes: 'recipes', rulepacks: 'rulepacks', browse: 'Browse all',
    v4host: 'v4 host additions; add/toggle/run-now RPCs shipped in v0.3.8',
    diagT: 'Diagnostics', diagSub: 'raw last shell/parse failure, for fixes and bug reports', copyDiag: 'Copy diagnostics', viewLog: 'View log',
    noLog: 'opencli exposes no log file; latest diagnostic snapshot below',
    more: 'More', guide: 'Setup guide', guideD: 'Install BrowserBridge extension / start daemon',
    profileT: 'profile note', profileD: 'Logins come from your everyday browser, unrelated to the built-in dsh browser',
    jump: 'Open dsh settings', jumpD: 'Manage plugins from chat', open: 'Open',
    setupT: 'opencli not detected — 3 steps to connect', loading: 'detecting…',
    step1: 'Install opencli CLI', step1c: 'npm i -g @jackwener/opencli',
    step2: 'Start daemon, install Chrome extension', step2c: 'opencli daemon restart',
    step3: 'Come back and hit Refresh',
    siteEmpty: 'Adapter returned empty (not logged in?). Log in on real Chrome first.',
    needLogin: 'daemon down or browser bridge not connected — click Start daemon and retry',
    errReq: 'request failed', confirmDisable: (n: string) => `Disable ${n}? The catalog shrinks from systemPrompt immediately.`,
    enNote: 'i18n keys throughout (zh default)', statesNote: 'four states: loading/ok/dependency/error — see .design/06',
  },
} as const

type StrKey = keyof typeof STR.zh

interface SchedItem { id: string; site: string; cron: string; createdAt: string; enabled: boolean; retry?: number; notify?: boolean; history?: Array<{ at: string; ok: boolean; summary: string }> }
interface AssetHit { id: string; name: string }
interface BuiltinScript { name: string; sha256: string; description: string }
interface ToastMsg { msg: string; ok: boolean }
interface Recording { id: string; name: string; steps: string[]; createdAt: string }

async function rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; value?: T; error?: { message: string } }> {
  try {
    const res = await fetch(`/api/opencli/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
        method: `opencli/${method}`,
        payload: { args },
      }),
    })
    const msg = await res.json() as { result?: { ok: boolean; value?: T; error?: { message?: string } } }
    if (msg.result !== undefined && msg.result.ok) return { ok: true, value: msg.result.value }
    return { ok: false, error: { message: msg.result?.error?.message ?? `HTTP ${res.status}` } }
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard
    if (clip?.writeText !== undefined) { await clip.writeText(text); return true }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

/* ── 统一线性图标 sprite(1.8 描边圆角)+ 品牌鲸标 ── */
const SPRITE = `<svg width="0" height="0" style="position:absolute">
<linearGradient id="o4g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00e5a0"/><stop offset=".5" stop-color="#00b4d8"/><stop offset="1" stop-color="#7b61ff"/></linearGradient>
<symbol id="i4-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></symbol>
<symbol id="i4-zap" viewBox="0 0 24 24"><path d="M13 2.5 4.5 13.5H11L9.8 21.5 19.5 10H13z"/></symbol>
<symbol id="i4-activity" viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></symbol>
<symbol id="i4-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v5l3.2 2"/></symbol>
<symbol id="i4-rec" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/></symbol>
<symbol id="i4-layers" viewBox="0 0 24 24"><path d="m12 3.5 8.5 4.7L12 12.9 3.5 8.2z"/><path d="m4.8 12.4 7.2 4 7.2-4"/><path d="m4.8 16.2 7.2 4 7.2-4"/></symbol>
<symbol id="i4-shield" viewBox="0 0 24 24"><path d="M12 2.8 19 5.6v5.2c0 4.9-3 8.1-7 9.6-4-1.5-7-4.7-7-9.6V5.6z"/><path d="m8.8 11.8 2.3 2.3 4.3-4.3"/></symbol>
<symbol id="i4-sliders" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="15" cy="7" r="2.1"/><circle cx="8.5" cy="12" r="2.1"/><circle cx="17" cy="17" r="2.1"/></symbol>
<symbol id="i4-plus" viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></symbol>
<symbol id="i4-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M18.6 2.8v3.8h-3.8"/></symbol>
<symbol id="i4-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/></symbol>
<symbol id="i4-chev-r" viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></symbol>
<symbol id="i4-chev-d" viewBox="0 0 24 24"><path d="m6 9.5 6 6 6-6"/></symbol>
<symbol id="i4-alert" viewBox="0 0 24 24"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.8" r=".4" fill="currentColor"/></symbol>
<symbol id="i4-check-c" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.5 2.5 4.9-5"/></symbol>
<symbol id="i4-ext" viewBox="0 0 24 24"><path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M9.5 5.5H6.4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.1"/></symbol>
<symbol id="i4-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 8.2h.01M12 11.4v5"/></symbol>
<symbol id="i4-monitor" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/></symbol>
<symbol id="i4-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
</svg>`

type IconName = 'play' | 'zap' | 'activity' | 'clock' | 'rec' | 'layers' | 'shield' | 'sliders' | 'plus' | 'refresh' | 'search' | 'chev-r' | 'chev-d' | 'alert' | 'check-c' | 'ext' | 'info' | 'monitor' | 'copy' | 'brand'

const ic = (name: IconName, sm = false): ReturnType<typeof createElement> =>
  createElement('svg', { className: sm ? 'o4ic o4ic-s' : 'o4ic', dangerouslySetInnerHTML: { __html: `<use href="#i4-${name}"/>` } })

/* ── v0.4 样式:基宽 800 自适应;冷灰深色 + #4A9EFF ── */
const CSS = `
.o4 { width:100%; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:10px; font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif; color:#E8EAED; }
.o4ic { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.o4ic-s { width:13px; height:13px; }
.o4-head { display:flex; align-items:center; gap:11px; padding:13px 15px; background:#14171C; border:1px solid #262B33; border-radius:14px; flex-wrap:wrap; }
.o4-logo { width:42px; height:42px; border-radius:11px; display:flex; align-items:center; justify-content:center; flex:none; }
.o4-logo .o4ic { width:26px; height:26px; }
.o4-h1 { font-size:17px; font-weight:700; white-space:nowrap; }
.o4-desc { font-size:11px; color:#9AA3AD; margin-top:2px; }
.o4-hr { margin-left:auto; display:flex; align-items:center; gap:7px; flex:none; }
.o4-vchip { font-size:11px; color:#5F6873; border:1px solid #262B33; border-radius:999px; padding:3px 9px; }
.o4-seg { display:flex; background:#1F242D; border:1px solid #313845; border-radius:8px; padding:2px; }
.o4-seg button { border:0; background:transparent; color:#9AA3AD; font-size:11.5px; padding:4px 10px; border-radius:6px; cursor:pointer; white-space:nowrap; }
.o4-seg button.on { background:#4A9EFF; color:#fff; }
.o4-tabs { display:flex; gap:4px; background:#14171C; border:1px solid #262B33; border-radius:11px; padding:4px; }
.o4-tabs button { flex:1; border:0; background:transparent; color:#9AA3AD; font-size:13px; padding:8px 0; border-radius:8px; cursor:pointer; }
.o4-tabs button.on { background:#1F242D; color:#E8EAED; font-weight:600; box-shadow:inset 0 0 0 1px #313845; }
.o4-status { display:flex; align-items:center; gap:7px; flex-wrap:wrap; padding:9px 13px; background:#14171C; border:1px solid #262B33; border-radius:11px; }
.o4-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#9AA3AD; background:#1A1E25; border:1px solid #262B33; border-radius:999px; padding:3px 9px; }
.o4-chip img { width:12px; height:12px; border-radius:3px; }
.o4-chip .o4ic { width:12px; height:12px; }
.o4-dot { width:7px; height:7px; border-radius:50%; flex:none; }
.o4-dot.g { background:#34C759; box-shadow:0 0 5px rgba(52,199,89,.7); }
.o4-dot.r { background:#FF453A; } .o4-dot.y { background:#FF9F0A; } .o4-dot.n { background:#313845; }
.o4-sep { width:1px; height:15px; background:#313845; }
.o4-diag { display:flex; align-items:center; gap:9px; padding:8px 13px; border-radius:11px; font-size:12px; cursor:pointer; }
.o4-diag.ok { background:rgba(52,199,89,.08); border:1px solid rgba(52,199,89,.25); color:#7FD89A; }
.o4-diag.bad { background:rgba(255,69,58,.08); border:1px solid rgba(255,69,58,.3); color:#FF8D85; }
.o4-diag .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
.o4-card { background:#1A1E25; border:1px solid #262B33; border-radius:12px; padding:13px 15px; }
.o4-card + .o4-card { margin-top:12px; }
.o4-h3 { font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:8px; }
.o4-h3 .rt { margin-left:auto; display:flex; align-items:center; gap:8px; }
.o4-sub { font-size:11.5px; color:#5F6873; margin:3px 0 10px; line-height:1.5; }
.o4-miniico { width:23px; height:23px; border-radius:7px; background:rgba(74,158,255,.12); border:1px solid rgba(74,158,255,.35); color:#4A9EFF; display:inline-flex; align-items:center; justify-content:center; flex:none; }
.o4-btn { border:0; border-radius:8px; background:#4A9EFF; color:#fff; font-size:12px; padding:6px 13px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
.o4-btn:hover { background:#3A8AE8; }
.o4-btn.ghost { background:#1F242D; border:1px solid #313845; color:#9AA3AD; font-weight:400; }
.o4-btn.ghost:hover { background:#262B33; }
.o4-btn.sm { padding:4px 10px; font-size:11.5px; }
.o4-btn:disabled { opacity:.55; cursor:default; }
.o4-in { flex:1; min-width:0; background:#14171C; border:1px solid #313845; color:#E8EAED; border-radius:8px; padding:7px 11px; font-size:12.5px; }
.o4-in.mono { font-family:ui-monospace,Consolas,monospace; }
.o4-in::placeholder { color:#5F6873; }
.o4-tryout { margin-top:9px; background:#0A0C0F; border:1px solid #262B33; border-radius:8px; padding:9px 11px; font:11.5px/1.7 ui-monospace,Consolas,monospace; color:#A9C7EC; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow:auto; }
.o4-tryout .k { color:#5F6873; }
.o4-tryout .lnk { color:#4A9EFF; cursor:pointer; }
.o4-micro { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; }
.o4-mst { background:#14171C; border:1px solid #262B33; border-radius:7px; padding:6px 8px; font-size:10px; color:#5F6873; line-height:1.5; }
.o4-mst b { display:block; font-size:10px; margin-bottom:2px; }
.o4-mst .bar { height:6px; border-radius:3px; background:#313845; margin:3px 0; }
.o4-mst.ok b { color:#34C759; } .o4-mst.err b { color:#FF6B5E; } .o4-mst.load b { color:#4A9EFF; }
.o4-mst .fix { color:#4A9EFF; }
.o4-qrow { display:flex; align-items:center; gap:8px; background:#14171C; border:1px solid #262B33; border-radius:8px; padding:7px 11px; font-size:12px; cursor:pointer; }
.o4-qrow:hover { border-color:#313845; }
.o4-qrow .mono { font-family:ui-monospace,Consolas,monospace; color:#A9C7EC; font-size:10.5px; margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%; }
.o4-sites { display:flex; flex-wrap:wrap; gap:7px; }
.o4-site { display:flex; align-items:center; gap:7px; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:5px 10px 5px 5px; font-size:12px; }
.o4-ava { width:25px; height:25px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; flex:none; }
.o4-ava img { width:14px; height:14px; }
.o4-st { font-size:10.5px; }
.o4-off { opacity:.6; }
.o4-sec { border:1px solid rgba(74,158,255,.35); background:linear-gradient(180deg,rgba(74,158,255,.06),rgba(74,158,255,.015)); border-radius:12px; padding:14px 15px; }
.o4-shield { width:44px; height:44px; border-radius:12px; background:rgba(52,199,89,.12); border:1px solid rgba(52,199,89,.35); color:#34C759; display:flex; align-items:center; justify-content:center; flex:none; }
.o4-shield .o4ic { width:21px; height:21px; }
.o4-cells { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:9px; }
.o4-cell { background:#1A1E25; border:1px solid #262B33; border-radius:9px; padding:8px 11px; }
.o4-cell .l { font-size:10.5px; color:#5F6873; margin-bottom:2px; }
.o4-cell .v { font-size:12.5px; font-weight:600; }
.o4-cell .v.on { color:#34C759; }
.o4-cell .v.mut { color:#9AA3AD; font-weight:400; font-size:11px; }
.o4-proof { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
.o4-proof span { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:#7FD89A; background:rgba(52,199,89,.09); border:1px solid rgba(52,199,89,.22); border-radius:999px; padding:2px 9px; }
.o4-proof .o4ic { width:10px; height:10px; stroke-width:2.2; }
.o4-modes { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px; }
.o4-mode { position:relative; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:8px 10px; cursor:pointer; }
.o4-mode.on { border-color:#4A9EFF; background:rgba(74,158,255,.12); }
.o4-mode .mi { display:flex; align-items:center; gap:6px; margin-bottom:2px; color:#9AA3AD; }
.o4-mode.on .mi { color:#4A9EFF; }
.o4-mode b { font-size:12px; }
.o4-mode span { font-size:10px; color:#5F6873; line-height:1.45; display:block; margin-top:2px; }
.o4-mchk { position:absolute; top:7px; right:7px; width:15px; height:15px; border-radius:50%; background:#4A9EFF; color:#fff; display:none; align-items:center; justify-content:center; }
.o4-mode.on .o4-mchk { display:flex; }
.o4-sw { width:34px; height:20px; border-radius:999px; background:#313845; position:relative; flex:none; cursor:pointer; border:0; padding:0; }
.o4-sw::after { content:""; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:2px; left:2px; transition:left .15s; }
.o4-sw.on { background:#34C759; } .o4-sw.on::after { left:16px; }
.o4-row { display:flex; align-items:center; gap:8px; background:#14171C; border:1px solid #262B33; border-radius:10px; padding:8px 11px; flex-wrap:wrap; }
.o4-row .meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:10.5px; color:#5F6873; width:100%; padding-left:2px; }
.o4-row .grow { flex:1; min-width:0; }
.o4-tt { font-size:12.5px; font-weight:600; }
.o4-dd { font-size:11px; color:#5F6873; margin-top:1px; }
.o4-hpts { display:flex; gap:3px; }
.o4-hp { width:7px; height:7px; border-radius:50%; background:#34C759; }
.o4-hp.f { background:#FF453A; } .o4-hp.n { background:#313845; }
.o4-bdg { display:inline-flex; align-items:center; gap:4px; font-size:10px; border-radius:5px; padding:2px 7px; border:1px solid #313845; color:#9AA3AD; background:#1F242D; }
.o4-bdg.w { color:#FFB340; border-color:rgba(255,179,64,.35); background:rgba(255,179,64,.08); }
.o4-bdg.r { color:#FF8D85; border-color:rgba(255,69,58,.3); background:rgba(255,69,58,.07); }
.o4-bdg.b { color:#4A9EFF; border-color:rgba(74,158,255,.35); background:rgba(74,158,255,.12); }
.o4-cron { font:10.5px ui-monospace,Consolas,monospace; color:#9AA3AD; background:#1F242D; border:1px solid #262B33; border-radius:5px; padding:2px 6px; }
.o4-stat { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid #262B33; font-size:12px; }
.o4-stat:last-child { border-bottom:0; }
.o4-stat span { color:#9AA3AD; } .o4-stat b { font:500 11.5px ui-monospace,Consolas,monospace; color:#C6CFDA; }
.o4-vrow { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #262B33; font-size:12px; }
.o4-vrow:last-child { border-bottom:0; }
.o4-vrow .o4ic { color:#34C759; width:12px; height:12px; }
.o4-vrow em { margin-left:auto; font-style:normal; font-size:9.5px; color:#34C759; border:1px solid rgba(52,199,89,.3); border-radius:999px; padding:1px 7px; flex:none; }
.o4-hash { display:inline-block; font:10.5px ui-monospace,Consolas,monospace; color:#5F6873; background:#14171C; border:1px solid #262B33; border-radius:6px; padding:3px 8px; margin-top:8px; }
.o4-audit { display:flex; align-items:center; gap:8px; margin-top:11px; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:7px 11px; font-size:11.5px; color:#9AA3AD; flex-wrap:wrap; }
.o4-acc { display:flex; align-items:center; gap:9px; padding:10px 13px; background:#14171C; border:1px solid #262B33; border-radius:10px; margin-bottom:8px; font-size:12.5px; color:#9AA3AD; cursor:pointer; }
.o4-acc b { color:#E8EAED; font-weight:600; }
.o4-acc .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:5px; font-size:11.5px; }
.o4-diagopen { background:#1A1E25; border:1px solid rgba(255,69,58,.35); border-radius:12px; overflow:hidden; }
.o4-diagopen .bar { display:flex; align-items:center; gap:8px; padding:9px 13px; background:rgba(255,69,58,.08); font-size:12px; color:#FF8D85; }
.o4-diagopen .bar .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
.o4-diagopen .body { padding:11px 13px; font-size:11.5px; color:#9AA3AD; }
.o4-kv { display:grid; grid-template-columns:105px 1fr; gap:3px 11px; font:11px/1.7 ui-monospace,Consolas,monospace; }
.o4-kv .k { color:#5F6873; } .o4-kv .v { color:#C6CFDA; word-break:break-all; }
.o4-fixrow { display:flex; gap:8px; margin-top:9px; }
.o4-load { color:#5F6873; font-size:12px; padding:10px 0; }
.o4-skel { height:11px; border-radius:5px; background:#1F242D; margin:7px 0; }
.o4-toast { position:fixed; right:16px; bottom:16px; background:#4DDB7A; color:#08210E; font-size:12px; font-weight:600; border-radius:9px; padding:8px 14px; z-index:50; }
.o4-note { font-size:10.5px; color:#5F6873; margin-top:8px; }
`

function Panel(): ReturnType<typeof createElement> {
  const [lang, setLang] = useState<Lang>('zh')
  const t = (k: StrKey): string => (STR[lang][k] ?? STR.zh[k]) as string
  const [tab, setTab] = useState<'ov' | 'cmd' | 'auto' | 'sec'>('ov')
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading')
  const [status, setStatus] = useState<OpencliStatus | null>(null)
  const [settings, setSettings] = useState<SettingsResult | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[] | null>(null)
  const [schedules, setSchedules] = useState<SchedItem[]>([])
  const [autoMode, setAutoMode] = useState('standard')
  const [audit, setAudit] = useState<AuditListResult | null>(null)
  const [login, setLogin] = useState<LoginCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  // 试试看
  const [runInput, setRunInput] = useState('site zhihu hot')
  const [running, setRunning] = useState(false)
  const [runOut, setRunOut] = useState<{ cmd: string; text: string; ok: boolean } | null>(null)
  // 命令
  const [query, setQuery] = useState('')
  const [details, setDetails] = useState<Record<string, AdapterDetailResult>>({})
  const [copied, setCopied] = useState<string | null>(null)
  // 自动化
  const [schedSite, setSchedSite] = useState('')
  const [schedCron, setSchedCron] = useState('0 9 * * *')
  const [schedBusy, setSchedBusy] = useState(false)
  const [recordings, setRecordings] = useState<Recording[]>(() => {
    try { return JSON.parse(localStorage.getItem('dsh-opencli-recordings') ?? '[]') as Recording[] } catch { return [] }
  })
  const [isRec, setIsRec] = useState(false)
  const [recName, setRecName] = useState('')
  const [recSteps, setRecSteps] = useState<string[]>([])
  const [assetHits, setAssetHits] = useState<AssetHit[] | null>(null)
  const [assetBusy, setAssetBusy] = useState(false)
  const [scripts, setScripts] = useState<BuiltinScript[] | null>(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [logTail, setLogTail] = useState<LogsTailResult | null>(null)
  const [starting, setStarting] = useState(false)
  const [updState, setUpdState] = useState<'idle' | 'checking' | 'latest' | string>('idle')
  const [msgInput, setMsgInput] = useState('')
  const [toastQ, setToastQ] = useState(0)

  const t2 = (k: keyof typeof STR.zh): string => (STR[lang][k] ?? STR.zh[k]) as string

  const showToast = (msg: string, ok: boolean): void => {
    setToast({ msg, ok })
    setToastQ((q) => q + 1)
    window.setTimeout(() => { setToast((cur) => (cur !== null && cur.msg === msg ? null : cur)) }, 1800)
  }

  const reload = async (): Promise<void> => {
    const [st, se, ad, mode, sch, au] = await Promise.all([
      rpc<OpencliStatus>('status'),
      rpc<SettingsResult>('settings'),
      rpc<AdaptersResult>('adapters'),
      rpc<{ mode: string }>('automation-mode-get'),
      rpc<{ schedules: SchedItem[] }>('schedule-list'),
      rpc<AuditListResult>('audit-list'),
    ])
    if (st.ok && st.value !== undefined) setStatus(st.value)
    if (se.ok && se.value !== undefined) setSettings(se.value)
    if (ad.ok && ad.value !== undefined && ad.value.ok) setAdapters(ad.value.adapters)
    if (mode.ok && mode.value !== undefined) setAutoMode(mode.value.mode)
    if (sch.ok && sch.value !== undefined) setSchedules(sch.value.schedules)
    if (au.ok && au.value !== undefined) setAudit(au.value)
    setPhase('ready')
  }

  useEffect(() => { void reload() }, [])

  const runLoginCheck = async (): Promise<void> => {
    if (checking) return
    setChecking(true)
    const r = await rpc<LoginCheckResult>('login-check')
    setLogin(r.ok && r.value !== undefined ? r.value : { ok: false, checkedAt: null, results: [], error: r.error?.message ?? t2('errReq') })
    setChecking(false)
  }

  const startDaemon = async (): Promise<void> => {
    if (starting) return
    setStarting(true)
    const r = await rpc<DaemonStartResult>('daemon-start')
    setStarting(false)
    showToast(r.ok && r.value?.ok ? (r.value.message ?? 'ok') : (r.ok ? (r.value?.message ?? t2('errReq')) : (r.error?.message ?? t2('errReq'))), r.ok && r.value?.ok === true)
    await reload()
  }

  const setApproval = async (enabled: boolean): Promise<void> => {
    const r = await rpc<ApprovalSetResult>('approval-set', { request: { enabled } })
    if (r.ok && r.value !== undefined && r.value.ok) setSettings((s) => (s === null ? null : { ...s, approvalOn: enabled }))
  }

  const setMode = async (mode: string): Promise<void> => {
    const r = await rpc('automation-mode-set', { request: { mode } } as unknown as Record<string, unknown>)
    if (r.ok) setAutoMode(mode)
  }

  const runDemo = async (cmd?: string): Promise<void> => {
    const line = (cmd ?? runInput).trim()
    if (line.length === 0 || running) return
    setRunning(true)
    const r = await rpc<{ text?: string; error?: string }>('try-run', { request: { line } } as unknown as Record<string, unknown>)
    setRunning(false)
    if (r.ok && r.value !== undefined && r.value.ok) setRunOut({ cmd: line, text: r.value.text ?? '', ok: true })
    else {
      const msg = r.ok ? (r.value?.error ?? '') : (r.error?.message ?? t2('errReq'))
      setRunOut({ cmd: line, text: msg, ok: false })
    }
  }

  const fillInput = (cmd: string): void => { setRunInput(cmd); setTab('ov') }

  const toggleDisable = async (name: string, disabled: boolean): Promise<void> => {
    if (disabled === false || window.confirm(t2('confirmDisable')(name))) {
      const r = await rpc<AdapterDisableResult>('adapter-disable', { request: { name, disabled } })
      if (r.ok && r.value !== undefined && r.value.ok) setAdapters((prev) => (prev === null ? prev : prev.map((a) => (a.name === name ? { ...a, disabled } : a))))
    }
  }

  const copyCmd = async (key: string, text: string): Promise<void> => {
    const ok = await copyText(text)
    if (ok) { setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400) }
  }

  const expandDetail = async (name: string): Promise<void> => {
    if (details[name] !== undefined) return
    const r = await rpc<AdapterDetailResult>('adapter-detail', { request: { name } })
    if (r.ok && r.value !== undefined) setDetails((d) => ({ ...d, [name]: r.value as AdapterDetailResult }))
  }

  const loadSchedules = async (): Promise<void> => {
    const r = await rpc<{ schedules: SchedItem[] }>('schedule-list')
    if (r.ok && r.value !== undefined) setSchedules(r.value.schedules)
  }
  const addSchedule = async (): Promise<void> => {
    if (schedSite.trim().length === 0 || schedBusy) return
    setSchedBusy(true)
    const r = await rpc<{ id?: string; error?: string }>('schedule-add', { request: { site: schedSite.trim(), cron: schedCron, retry: 3, notify: true } } as unknown as Record<string, unknown>)
    setSchedBusy(false)
    if (r.ok) { setSchedSite(''); void loadSchedules() } else showToast(r.error?.message ?? t2('errReq'), false)
  }
  const toggleSchedule = async (id: string, enabled: boolean): Promise<void> => {
    const r = await rpc('schedule-toggle', { request: { id, enabled } } as unknown as Record<string, unknown>)
    if (r.ok) void loadSchedules()
  }
  const removeSchedule = async (id: string): Promise<void> => {
    const r = await rpc('schedule-remove', { request: { id } } as unknown as Record<string, unknown>)
    if (r.ok) void loadSchedules()
  }
  const runScheduleNow = async (id: string): Promise<void> => {
    const r = await rpc('schedule-run-now', { p: { id } } as unknown as Record<string, unknown>)
    showToast(r.ok ? 'run now ✓' : (r.error?.message ?? t2('errReq')), r.ok)
    window.setTimeout(() => { void loadSchedules() }, 2500)
  }

  const persistRecordings = (next: Recording[]): void => {
    setRecordings(next)
    try { localStorage.setItem('dsh-opencli-recordings', JSON.stringify(next)) } catch { /* ignore */ }
  }
  const replayRecording = async (id: string): Promise<void> => {
    const rec = recordings.find((x) => x.id === id)
    if (rec === undefined) return
    for (const step of rec.steps) {
      const s = step.trim()
      if (s.length === 0) continue
      if (s.startsWith('browser_')) await rpc('replay', { request: { step: s } } as unknown as Record<string, unknown>)
      else await rpc('try-run', { request: { line: s } } as unknown as Record<string, unknown>)
    }
    showToast('replay ✓', true)
  }
  const promoteRecording = async (id: string): Promise<void> => {
    const rec = recordings.find((x) => x.id === id)
    if (rec === undefined) return
    await rpc('promote-recording', { request: { name: rec.name, steps: rec.steps } } as unknown as Record<string, unknown>)
    void searchAssets('')
  }

  const searchAssets = async (q: string): Promise<void> => {
    if (assetBusy) return
    setAssetBusy(true)
    const r = await rpc<{ hits: AssetHit[] }>('automation-search', { request: { query: q } } as unknown as Record<string, unknown>)
    setAssetBusy(false)
    if (r.ok && r.value !== undefined) setAssetHits(r.value.hits)
  }
  const loadScripts = async (): Promise<void> => {
    if (scripts !== null) return
    const r = await rpc<{ scripts: BuiltinScript[] }>('script-catalog')
    if (r.ok && r.value !== undefined) setScripts(r.value.scripts)
  }

  const openDiag = async (): Promise<void> => {
    setDiagOpen((v) => !v)
    if (!diagOpen && logTail === null) {
      const r = await rpc<LogsTailResult>('logs-tail')
      if (r.ok && r.value !== undefined) setLogTail(r.value)
    }
  }

  const checkUpdate = async (): Promise<void> => {
    setUpdState('checking')
    try {
      const cap = await fetch('/dsh-market/api/v1/capabilities')
      if (cap.ok) {
        const upd = await fetch('/dsh-market/api/v1/updates?name=dsh-opencli')
        if (upd.ok) {
          const j = JSON.parse(await upd.text()) as { result?: { value?: { targetVersion?: string; isForwardUpdate?: boolean } } }
          const target = j.result?.value?.targetVersion
          setUpdState(target !== undefined && target !== '' ? `${t2('updAvail')} ${target}` : t2('upToDate'))
          return
        }
      }
    } catch { /* 未装市场 → 降级 */ }
    setUpdState(t2('updFallback'))
  }

  const loginResults = login?.results ?? []
  const daemonUp = status?.daemon?.running === true
  const binOk = status?.ok === true && status.bin !== null
  const loading = phase === 'loading'

  const chip = (icon: string | null, label: string, state: 'g' | 'r' | 'y' | 'n', tip?: string): ReturnType<typeof createElement> =>
    createElement('span', { className: 'o4-chip', title: tip },
      icon !== null ? createElement('img', { src: icon, alt: '' }) : null,
      label,
      createElement('span', { className: `o4-dot ${state}` }),
    )

  /* ── 总览 ── */
  const renderOverview = (): ReturnType<typeof createElement> => {
    const tryErr = runOut !== null && !runOut.ok
    const daemonOff = !daemonUp
    return createElement('div', null,
      // 试试看(通栏)
      createElement('div', { className: 'o4-card' },
        createElement('div', { className: 'o4-h3' },
          createElement('span', { className: 'o4-miniico' }, ic('play', true)),
          t2('tryT'),
          createElement('span', { className: 'rt' },
            createElement('button', { className: 'o4-btn', disabled: running || !binOk, onClick: () => { void runDemo() } }, running ? t2('running2') : t2('run')),
          ),
        ),
        createElement('div', { className: 'o4-sub' }, t2('trySub')),
        createElement('div', { style: { display: 'flex', gap: '8px' } },
          createElement('input', { className: 'o4-in mono', value: runInput, placeholder: 'site zhihu hot', onChange: (e: { target: { value: string } }) => setRunInput(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') void runDemo() } }),
          createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void copyText(runInput).then((ok) => showToast(ok ? t2('copied') : t2('errReq'), ok)) } }, t2('copy')),
          createElement('button', { className: 'o4-btn ghost sm', disabled: running, onClick: () => { void runDemo() } }, t2('rerun')),
        ),
        runOut !== null
          ? createElement('div', { className: 'o4-tryout' },
              createElement('span', { className: 'k' }, `$ ${runOut.cmd}\n`),
              runOut.text.length > 0 ? runOut.text : (runOut.ok ? '—' : t2('siteEmpty')),
              createElement('div', null,
                createElement('span', { className: 'lnk', onClick: () => { void copyText(`${runOut.cmd}\n${runOut.text}`) } }, t2('copy')), ' ',
                createElement('span', { className: 'lnk', onClick: () => { void runDemo(runOut.cmd) } }, t2('rerun')),
              ),
            )
          : null,
      ),
      // 快捷 + 巡检
      createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '12px' } },
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('zap', true)), t2('quickT')),
          createElement('div', { className: 'o4-sub' }, t2('quickSub')),
          createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
            ...[['知乎热榜', 'site zhihu hot'], ['B站搜索', 'site bilibili search'], ['GitHub 通知', 'site github notifications'], ['三站热榜', 'site_batch hot']].map(([label, cmd]) =>
              createElement('div', { key: cmd, className: 'o4-qrow', onClick: () => fillInput(cmd) },
                label, createElement('span', { className: 'mono' }, cmd), createElement('span', { className: 'o4arr', style: { color: '#5F6873', display: 'flex' } }, ic('chev-r', true)),
              )),
          ),
        ),
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('activity', true)), t2('loginT')),
          createElement('div', { className: 'o4-sub' }, t2('loginSub')),
          createElement('div', { className: 'o4-sites' },
            loginResults.length === 0
              ? createElement('span', { className: 'o4-chip' }, createElement('span', { className: 'o4-dot n' }), t2('unknown'))
              : loginResults.map((r) => createElement('span', { key: r.site, className: `o4-site${r.ok ? '' : ' o4-off'}` },
                  createElement('span', { className: 'o4-ava', style: { background: '#313845' } }, r.site.slice(0, 2)),
                  r.site,
                  createElement('span', { className: 'o4-st', style: { color: r.ok ? '#34C759' : (r.timedOut ? '#FF9F0A' : '#FF453A') } }, r.ok ? t2('online') : (r.timedOut ? t2('timeout') : t2('expired'))),
                )),
          ),
          createElement('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } },
            createElement('button', { className: 'o4-btn ghost sm', disabled: checking, onClick: () => { void runLoginCheck() } }, ic('refresh', true), checking ? t2('checking') : t2('recheck')),
          ),
        ),
      ),
      // 健康卡(daemon 离线时降级为修复态)
      createElement('div', { className: 'o4-card' },
        createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('activity', true)), 'opencli 健康', status === null ? ` · ${t2('loading')}` : ''),
        createElement('div', { className: 'o4-sub' }, `daemon ${status?.daemon?.version ?? '—'} · extension ${status?.daemon?.extension ?? t2('unknown')} · sites ${adapters?.length ?? 0}`),
        createElement('div', { className: 'o4-cells' },
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'daemon'), createElement('div', { className: `v${daemonUp ? ' on' : ''}` }, status === null ? t2('loading') : (daemonUp ? t2('daemonRunning') : t2('daemonDown')))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'version'), createElement('div', { className: 'v' }, status === null ? '…' : (status.version ?? '—'))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'Chrome'), createElement('div', { className: 'v mut' }, status === null ? '…' : (status.daemon?.extension ?? t2('unknown')))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'sites'), createElement('div', { className: 'v' }, status === null ? '…' : String(adapters?.length ?? 0))),
        ),
        status?.ok === false && status.error !== undefined
          ? createElement('div', { className: 'o4-tryout', style: { marginTop: '9px' } }, status.error)
          : null,
        daemonOff || !binOk
          ? createElement('div', { style: { marginTop: '10px' } }, createElement('button', { className: 'o4-btn', disabled: starting, onClick: () => { void startDaemon() } }, ic('refresh', true), starting ? '…' : t2('fix')))
          : null,
      ),
      // 安全中心摘要
      createElement('div', { className: 'o4-sec' },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' } },
          createElement('div', { className: 'o4-shield' }, ic('shield')),
          createElement('div', { style: { flex: '1' } },
            createElement('div', { style: { fontSize: '14px', fontWeight: '600' } }, t2('secT')),
            createElement('div', { className: 'o4-sub', style: { margin: '2px 0 0' } }, t2('secSub'),
              audit !== null && audit.count7d > 0 ? ` · ${t2('lastBlocked')} ${audit.count7d}` : ''),
          ),
          createElement('button', { className: 'o4-btn ghost sm', onClick: () => setTab('sec') }, t2('tabSec'), ic('chev-r', true)),
        ),
        createElement('div', { className: 'o4-cells' },
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('gateLabel')), createElement('div', { className: `v${settings?.approvalOn === true ? ' on' : ''}` }, settings?.approvalOn === true ? t2('gateOn') : t2('gateOff'))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('tabAuto')), createElement('div', { className: 'v' }, autoMode)),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('rateT')), createElement('div', { className: 'v mut' }, '750ms · ×2 · 30s')),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('lastBlocked')), createElement('div', { className: 'v' }, String(audit?.count7d ?? 0))),
        ),
        createElement('div', { className: 'o4-proof' },
          ...[t2('proofNoTelemetry'), t2('proofNoCurl'), t2('proofFailClosed'), t2('proofClip'), t2('proofRel')].map((p) =>
            createElement('span', { key: p }, ic('check-c'), p)),
        ),
      ),
      // 更多
      createElement('div', null,
        createElement('div', { style: { fontSize: '12px', color: '#5F6873', margin: '2px 2px 8px' } }, t2('more')),
        createElement('div', { className: 'o4-acc', onClick: () => { void openDiag() } }, createElement('b', null, t2('guide')), `—— ${t2('guideD')}`, createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-r', true))),
        createElement('div', { className: 'o4-acc' }, createElement('b', null, t2('profileT')), `—— ${t2('profileD')}`, createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-r', true))),
        createElement('div', { className: 'o4-acc', onClick: () => { window.open(DSH_URL, '_blank') } }, createElement('b', null, t2('jump')), `—— ${t2('jumpD')}`, createElement('span', { className: 'o4arr' }, t2('open'), ic('ext', true))),
      ),
      daemonOff && !loading
        ? createElement('div', { className: 'o4-diag bad', onClick: () => { void startDaemon() } },
            ic('alert', true), t2('depDaemon'),
            createElement('span', { className: 'o4arr' }, t2('fix'), ic('chev-r', true)),
          )
        : null,
    )
  }

  /* ── 命令 ── */
  const renderCommands = (): ReturnType<typeof createElement> => {
    const q = query.trim().toLowerCase()
    const filtered = (adapters ?? []).filter((a) => q.length === 0 || a.name.toLowerCase().includes(q) || a.commands.some((c) => c.toLowerCase().includes(q)) || (a.sample ?? '').toLowerCase().includes(q))
    return createElement('div', null,
      createElement('div', { style: { display: 'flex', gap: '9px', alignItems: 'center', marginBottom: '6px' } },
        createElement('div', { style: { flex: '1', display: 'flex', alignItems: 'center', gap: '8px', background: '#14171C', border: '1px solid #313845', borderRadius: '9px', padding: '0 12px' } },
          createElement('span', { style: { color: '#5F6873', display: 'flex' } }, ic('search', true)),
          createElement('input', { className: 'o4-in', style: { border: '0', padding: '8px 0' }, placeholder: t2('cmdSearch'), value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value) }),
        ),
        createElement('span', { style: { fontSize: '11.5px', color: '#5F6873' } }, `${adapters?.length ?? 0} · ${(adapters ?? []).filter((a) => a.disabled !== true).length}`),
      ),
      createElement('div', { className: 'o4-note', style: { margin: '0 0 10px' } }, t2('cmdFmt')),
      createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        loading ? createElement('div', { className: 'o4-load' }, t2('loading')) : null,
        !loading && filtered.map((a) => {
          const detail = details[a.name]
          return createElement('div', { key: a.name },
            createElement('div', { className: `o4-row${a.disabled === true ? ' o4-off' : ''}`, onClick: () => { void expandDetail(a.name) } },
              createElement('span', { className: 'o4-ava', style: { background: '#313845' } }, a.name.slice(0, 2)),
              createElement('div', { className: 'grow' },
                createElement('div', { className: 'o4-tt' }, a.name, ' ', a.sample !== undefined && a.sample.length > 0 ? createElement('span', { className: 'o4-bdg b', onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); fillInput(`site ${a.name} ${a.sample}`) } }, a.sample, ' ', ic('copy', true)) : null),
                createElement('div', { className: 'o4-dd' }, t2('commandsN')(a.commandCount), a.disabled === true ? ' · disabled' : ''),
              ),
              a.disabled === true ? null : createElement('span', { className: 'o4-bdg w' }, `write ${a.kinds.filter((k) => k === 'write').length}`),
              createElement('button', { className: 'o4-btn ghost sm', onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); void toggleDisable(a.name, a.disabled !== true) } }, a.disabled === true ? t2('enable') : t2('disable')),
            ),
            details[a.name] !== undefined
              ? createElement('div', { className: 'o4-card', style: { marginTop: '6px', padding: '8px 12px' } },
                  detail === undefined
                    ? createElement('div', { className: 'o4-load' }, t2('loading'))
                    : detail.ok
                      ? detail.commands.map((c) => {
                          const cmdText = `site ${a.name} ${c.name}`
                          const key = `${a.name}:${c.name}`
                          return createElement('div', { key: c.name, className: 'o4-qrow', title: `${cmdText}\n${c.description}`, onClick: () => { void copyCmd(key, cmdText) } },
                            createElement('span', null, c.name),
                            createElement('span', { className: 'o4-bdg', style: { marginLeft: '6px' } }, c.access),
                            createElement('span', { style: { color: '#5F6873', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1' } }, c.description),
                            copied === key ? createElement('span', { className: 'o4-bdg b' }, t2('copied')) : createElement('span', { style: { color: '#5F6873', display: 'flex' } }, ic('copy', true)),
                          )
                        })
                      : createElement('div', { className: 'o4-load' }, detail.error ?? t2('errReq')),
                )
              : null,
          )
        }),
        !loading && filtered.length === 0 ? createElement('div', { className: 'o4-load' }, '—') : null,
      ),
    )
  }

  /* ── 自动化 ── */
  const renderAutomation = (): ReturnType<typeof createElement> => {
    return createElement('div', null,
      createElement('div', { className: 'o4-card' },
        createElement('div', { className: 'o4-h3' },
          createElement('span', { className: 'o4-miniico' }, ic('clock', true)), t2('autoT'),
          createElement('span', { className: 'rt' }, createElement('button', { className: 'o4-btn sm', onClick: () => fillInput('') }, ic('plus', true), t2('autoNew'))),
        ),
        createElement('div', { className: 'o4-sub' }, t2('autoSub')),
        !daemonUp ? createElement('div', { className: 'o4-diag bad', style: { marginBottom: '9px' }, onClick: () => { void startDaemon() } }, ic('alert', true), t2('depDaemon'), createElement('span', { className: 'o4arr' }, t2('fix'), ic('chev-r', true))) : null,
        createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
          createElement('input', { className: 'o4-in', placeholder: 'site zhihu hot', value: schedSite, onChange: (e: { target: { value: string } }) => setSchedSite(e.target.value) }),
          createElement('input', { className: 'o4-in cron', style: { maxWidth: '110px' }, placeholder: 'cron', value: schedCron, onChange: (e: { target: { value: string } }) => setSchedCron(e.target.value) }),
          createElement('button', { className: 'o4-btn sm', disabled: schedBusy, onClick: () => { void addSchedule() } }, t2('create')),
        ),
        createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          schedules.length === 0 ? createElement('div', { className: 'o4-load' }, '—') : null,
          schedules.map((s) => {
            const hist = s.history ?? []
            const dots = [0, 1, 2, 3, 4].map((i) => {
              const h = hist[i]
              return createElement('span', { key: i, className: `o4-hp${h === undefined ? ' n' : h.ok ? '' : ' f'}` })
            })
            const okN = hist.filter((h) => h.ok).length
            return createElement('div', { key: s.id, className: 'o4-row' },
              createElement('span', { className: 'o4-ava', style: { background: '#313845' } }, s.site.replace('site ', '').slice(0, 2)),
              createElement('div', { className: 'grow', style: { minWidth: '140px' } },
                createElement('div', { className: 'o4-tt' }, s.site),
              ),
              createElement('span', { className: 'o4-hpts' }, dots),
              createElement('button', { className: 'o4-sw' + (s.enabled ? ' on' : ''), title: s.enabled ? 'enabled' : 'disabled', onClick: () => { void toggleSchedule(s.id, !s.enabled) } }),
              createElement('div', { className: 'meta' },
                createElement('span', { className: 'o4-cron' }, s.cron),
                createElement('span', null, `${t2('last')} ${hist[0]?.at?.slice(5, 16) ?? '—'} · ${okN}/${hist.length || 0} ✓`),
                createElement('span', { className: 'o4-bdg b' }, t2('retryN')(s.retry ?? 3)),
                createElement('span', { className: 'o4-bdg' }, s.notify === false ? t2('notifyOff') : t2('notifyOn')),
                createElement('span', { style: { flex: '1' } }),
                createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void runScheduleNow(s.id) } }, t2('runNow')),
                createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void removeSchedule(s.id) } }, t2('del')),
              ),
            )
          }),
        ),
        createElement('div', { className: 'o4-note' }, t2('v4host')),
      ),
      createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '12px' } },
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('rec', true)), t2('recT')),
          createElement('div', { className: 'o4-sub' }, t2('recSub')),
          createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            recordings.map((rec) => createElement('div', { key: rec.id, className: 'o4-row' },
              createElement('div', { className: 'grow' },
                createElement('div', { className: 'o4-tt' }, rec.name),
                createElement('div', { className: 'o4-dd' }, `${rec.steps.length} 步 · ${rec.steps[0] ?? ''}`),
              ),
              createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void replayRecording(rec.id) } }, t2('replay')),
              createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void promoteRecording(rec.id) } }, '→'),
            )),
          ),
          isRec
            ? createElement('div', { style: { marginTop: '9px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                createElement('input', { className: 'o4-in', style: { maxWidth: '150px' }, placeholder: t2('recName'), value: recName, onChange: (e: { target: { value: string } }) => setRecName(e.target.value) }),
                createElement('input', { className: 'o4-in', style: { maxWidth: '190px' }, placeholder: t2('recStep'), value: recSteps[recSteps.length - 1] ?? '', onChange: (e: { target: { value: string } }) => setRecSteps([...recSteps.slice(0, -1), e.target.value]) }),
                createElement('button', { className: 'o4-btn ghost sm', onClick: () => setRecSteps([...recSteps, '']) }, t2('recAdd')),
                createElement('button', { className: 'o4-btn sm', onClick: () => { setIsRec(false) } }, t2('recStop')),
              )
            : createElement('div', { style: { marginTop: '9px' } }, createElement('button', { className: 'o4-btn ghost sm', onClick: () => { setIsRec(true); setRecSteps([]) } }, ic('rec', true), t2('recStart'))),
        ),
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('layers', true)), t2('assetT')),
          createElement('div', { className: 'o4-sub' }, t2('assetSub')),
          createElement('div', { style: { display: 'flex', gap: '7px', marginBottom: '9px' } },
            createElement('input', { className: 'o4-in', placeholder: t2('assetSearch'), onChange: (e: { target: { value: string } }) => { if (e.target.value.length >= 2) void searchAssets(e.target.value) } }),
            createElement('button', { className: 'btn ghost sm', onClick: () => { void loadScripts() } }, t2('browse')),
          ),
          createElement('div', { className: 'o4-cells', style: { gridTemplateColumns: 'repeat(3,1fr)' } },
            createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('builtinT')), createElement('div', { className: 'v' }, String(scripts?.length ?? '—'))),
            createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('recipes')), createElement('div', { className: 'v' }, String(assetHits?.length ?? '—'))),
            createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, t2('rulepacks')), createElement('div', { className: 'v' }, '—')),
          ),
        ),
      ),
    )
  }

  /* ── 安全与设置 ── */
  const renderSecurity = (): ReturnType<typeof createElement> => {
    const modes: Array<[string, string, IconName]> = [
      ['read-only', t2('modeReadOnly'), 'activity'],
      ['standard', t2('modeStandard'), 'shield'],
      ['autonomous', t2('modeAuto'), 'zap'],
      ['unrestricted', t2('modeUnres'), 'alert'],
    ]
    const diagText = `bin: ${status?.bin ?? '—'} | version: ${status?.version ?? '—'} | mode: ${autoMode} | approval: ${settings?.approvalOn === true ? 'on' : 'off'} | daemon: ${daemonUp ? 'running' : 'down'}`
    return createElement('div', null,
      createElement('div', { className: 'o4-sec' },
        createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' } },
          createElement('div', { className: 'o4-shield' }, ic('shield')),
          createElement('div', { style: { flex: '1' } },
            createElement('div', { style: { fontSize: '14px', fontWeight: '600' } }, t2('gateLabel')),
            createElement('div', { className: 'o4-sub', style: { margin: '3px 0 0' } }, t2('gateDesc')),
          ),
          createElement('div', { style: { textAlign: 'center' } },
            createElement('button', { className: `o4-sw${settings?.approvalOn === true ? ' on' : ''}`, style: { transform: 'scale(1.12)' }, onClick: () => { void setApproval(!(settings?.approvalOn === true)) } }),
            createElement('div', { style: { fontSize: '10px', color: settings?.approvalOn === true ? '#34C759' : '#5F6873', marginTop: '4px' } }, settings?.approvalOn === true ? t2('gateOnLabel') : t2('gateOffLabel')),
          ),
        ),
        createElement('div', { className: 'o4-modes' },
          modes.map(([m, desc, icon]) => createElement('div', { key: m, className: `o4-mode${autoMode === m ? ' on' : ''}`, onClick: () => { void setMode(m) } },
            createElement('span', { className: 'mi' }, ic(icon as IconName, true), createElement('b', null, m)),
            createElement('span', null, desc),
            createElement('span', { className: 'o4-mchk' }, ic('check-c', true)),
          )),
        ),
      ),
      createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '12px', marginBottom: '12px' } },
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('sliders', true)), t2('rateT')),
          createElement('div', { className: 'o4-sub' }, t2('rateSub')),
          createElement('div', { className: 'o4-stat' }, createElement('span', null, 'minDelay'), createElement('b', null, '750 ms')),
          createElement('div', { className: 'o4-stat' }, createElement('span', null, 'maxConcurrency'), createElement('b', null, '2')),
          createElement('div', { className: 'o4-stat' }, createElement('span', null, 'burst / cooldown'), createElement('b', null, '3 / 30 s')),
          createElement('div', { className: 'o4-stat' }, createElement('span', null, 'maxPagesPerRun'), createElement('b', null, '20')),
          createElement('div', { className: 'o4-stat' }, createElement('span', null, 'authProfiles'), createElement('b', null, 'allowedDomains ✓')),
        ),
        createElement('div', { className: 'o4-card' },
          createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('check-c', true)), t2('proofT')),
          createElement('div', { className: 'o4-sub' }, t2('proofSub')),
          ...[t2('proofNoTelemetry'), t2('proofNoCurl'), t2('proofFailClosed'), t2('proofClip'), t2('proofRel')].map((p) =>
            createElement('div', { key: p, className: 'o4-vrow' }, ic('check-c'), createElement('span', null, p), createElement('em', null, t2('verified')))),
          createElement('span', { className: 'o4-hash' }, `${t2('shaLine')}: ${settings?.sha256 ?? '—'}`),
        ),
      ),
      createElement('div', { className: 'o4-card', style: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '12px' } },
        createElement('span', { className: 'o4-miniico' }, ic('refresh', true)),
        createElement('div', { style: { flex: '1' } },
          createElement('div', { style: { fontSize: '12.5px', fontWeight: '600' } }, t2('verT')),
          createElement('div', { style: { fontSize: '11px', color: '#5F6873' } }, `${t2('verNow')} v0.4.0 · ${t2('channel')} · ${t2('updMarket')}`),
        ),
        createElement('span', { className: 'o4-bdg' }, typeof updState === 'string' && updState !== 'idle' && updState !== 'checking' ? updState : t2('upToDate')),
        createElement('button', { className: 'o4-btn ghost sm', disabled: updState === 'checking', onClick: () => { void checkUpdate() } }, updState === 'checking' ? t2('updating') : t2('checkUpd')),
        createElement('button', { className: 'o4-btn ghost sm', onClick: () => { window.open(RELEASES_URL, '_blank') } }, ic('ext', true)),
      ),
      diagOpen
        ? createElement('div', { className: 'o4-diagopen' },
            createElement('div', { className: 'bar' }, ic('alert', true), t2('diagT'), createElement('span', { className: 'o4arr', onClick: () => { void openDiag() } }, t2('detail'), ic('chev-d', true))),
            createElement('div', { className: 'body' },
              createElement('div', { className: 'o4-kv' },
                createElement('span', { className: 'k' }, t2('diagSub')),
                createElement('span', { className: 'v' }, logTail?.hint ?? t2('noLog')),
              ),
              createElement('div', { className: 'o4-tryout', style: { marginTop: '8px' } }, (logTail?.lines ?? []).join('\n') || diagText),
              createElement('div', { className: 'o4-fixrow' },
                createElement('button', { className: 'o4-btn sm', onClick: () => { void startDaemon() } }, t2('fix')),
                createElement('button', { className: 'o4-btn ghost sm', onClick: () => { void copyText(diagText + '\n' + (logTail?.lines ?? []).join('\n')) } }, t2('copyDiag')),
              ),
            ),
          )
        : createElement('div', { className: 'o4-diag ok', onClick: () => { void openDiag() } }, ic('check-c', true), t2('diagAll'), createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-d', true))),
      createElement('div', null,
        createElement('div', { className: 'o4-acc', onClick: () => { void openDiag() } }, createElement('b', null, t2('guide')), `—— ${t2('guideD')}`, createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-r', true))),
        createElement('div', { className: 'o4-acc' }, createElement('b', null, t2('profileT')), `—— ${t2('profileD')}`, createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-r', true))),
      ),
    )
  }

  const loadingBlock = (): ReturnType<typeof createElement> =>
    createElement('div', { className: 'o4-card' },
      createElement('div', { className: 'o4-load' }, t2('loading')),
      createElement('div', { className: 'o4-skel' }), createElement('div', { className: 'o4-skel', style: { width: '70%' } }), createElement('div', { className: 'o4-skel', style: { width: '85%' } }),
    )

  return createElement('div', null,
    createElement('div', { style: { display: 'none' }, dangerouslySetInnerHTML: { __html: SPRITE } }),
    createElement('style', null, CSS),
    createElement('div', { className: 'o4' },
      // 页头(品牌鲸标)
      createElement('div', { className: 'o4-head' },
        createElement('div', { className: 'o4-logo', title: 'OpenCLI × DeepSeek', dangerouslySetInnerHTML: { __html:
          '<svg viewBox="0 0 64 64" width="46" height="46"><rect width="64" height="64" rx="14" fill="#0a0a0f"/>' +
          '<path fill="#fff" fill-rule="evenodd" transform="translate(13,20) scale(1.6)" d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45"/>' +
          '<text x="32" y="13" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-weight="700" font-size="13" fill="url(#o4g)">&gt;_</text></svg>' } }),
        createElement('div', null,
          createElement('div', { className: 'o4-h1' }, t2('title')),
          createElement('div', { className: 'o4-desc' }, t2('desc')),
        ),
        createElement('div', { className: 'o4-hr' },
          createElement('div', { className: 'o4-seg' },
            createElement('button', { className: lang === 'zh' ? 'on' : '', onClick: () => setLang('zh') }, '中文'),
            createElement('button', { className: lang === 'en' ? 'on' : '', onClick: () => setLang('en') }, 'EN'),
          ),
        ),
      ),
      // Tabs
      createElement('div', { className: 'o4-tabs' },
        ...([['ov', t2('tabOverview')], ['cmd', t2('tabCommands')], ['auto', t2('tabAuto')], ['sec', t2('tabSec')]] as Array<[string, string]>).map(([k, label]) =>
          createElement('button', { key: k, className: tab === k ? 'on' : '', onClick: () => setTab(k as typeof tab) }, label)),
      ),
      // 状态条(指示灯)
      createElement('div', { className: 'o4-status' },
        createElement('span', { className: 'o4-chip', title: `daemon ${daemonUp ? t2('daemonRunning') : t2('daemonDown')}` }, createElement('span', { className: `o4-dot ${daemonUp ? 'g' : 'r'}` }), 'daemon'),
        createElement('span', { className: 'o4-chip', title: 'BrowserBridge connected' }, createElement('span', { className: 'o4-dot g' }), 'Bridge'),
        createElement('span', { className: 'o4-chip', title: 'Chrome' }, ic('monitor', true)),
        createElement('span', { className: 'o4-sep' }),
        ...(loginResults.length > 0
          ? loginResults.map((r) => chip(null, r.site, r.ok ? 'g' : (r.timedOut ? 'y' : 'r'), `${r.site}: ${r.ok ? t2('online') : (r.timedOut ? t2('timeout') : t2('expired'))}${r.detail !== null ? ` · ${r.detail}` : ''}`))
          : [chip(null, 'zhihu', 'n'), chip(null, 'bilibili', 'n'), chip(null, 'github', 'n')]),
        createElement('span', { className: 'o4-chip', style: { marginLeft: 'auto', cursor: 'pointer' }, onClick: () => { void runLoginCheck() }, title: t2('recheck') }, ic('refresh', true)),
      ),
      // 诊断条
      createElement('div', { className: `o4-diag ${daemonUp && binOk ? 'ok' : 'bad'}`, onClick: () => { void openDiag() } },
        ic(daemonUp && binOk ? 'check-c' : 'alert', true),
        daemonUp && binOk ? t2('diagAll') : t2('depDaemon'),
        createElement('span', { className: 'o4arr' }, t2('detail'), ic('chev-d', true)),
      ),
      // 内容
      loading
        ? loadingBlock()
        : tab === 'ov' ? renderOverview() : tab === 'cmd' ? renderCommands() : tab === 'auto' ? renderAutomation() : renderSecurity(),
    ),
    toast !== null ? createElement('div', { className: 'o4-toast', style: { background: toast.ok ? '#4DDB7A' : '#FF453A' } }, toast.msg) : null,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'opencli-proxy', order: 41, label: '浏览器代理' },
    () => createElement(Panel),
  ))
}
