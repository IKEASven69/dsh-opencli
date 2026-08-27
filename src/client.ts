/**
 * dsh-opencli 浏览器半:设置页「浏览器代理」——OpenCLI 管理中心。
 * 视觉对齐 OpenCLIApp 0.1.38「命令集合」页实测:冷灰深色 + 蓝强调(#4A9EFF)、
 * iOS 设置式页头(圆角图标 + 大标题 + 描述)、分段 tab(App/Site 命令)、
 * 独立适配器卡片(头像方块 + 名称 + 弱化计数 + 展开箭头)、单行命令行
 * (名称 + 截断描述 + browser/read/write 徽章)。
 * 职责:安装引导 → 桥接诊断 → 适配器管理。定位:不替代 OpenCLIApp(基础设施层),
 * 本面板是 OpenCLI 在 dsh 生态内的管理中心。
 * @module dsh-opencli/client
 */

import { createElement, useEffect, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { AdapterDetailResult, AdapterInfo, AdaptersResult, DaemonStartResult, OpencliStatus } from './types.ts'

export const inject = ['slots']

async function rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; value?: T; error: { message: string } }> {
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

/* ── OpenCLIApp 设计令牌(0.1.38 实测)── */
const CSS = `
.ocp { display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #F0F0F2; }
.ocp-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
/* ── 页头:iOS 设置式(图标 + 大标题 + 描述)── */
.ocp-head { display: flex; align-items: flex-start; gap: 14px; }
.ocp-icon { flex: none; width: 46px; height: 46px; border-radius: 12px; background: #4A9EFF;
  display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #fff; letter-spacing: .5px; }
.ocp-title { font-size: 20px; font-weight: 700; line-height: 1.35; }
.ocp-desc { font-size: 12.5px; color: #9A9AA0; margin-top: 3px; line-height: 1.55; }
.ocp-btn { flex: none; cursor: pointer; border: none; background: #3A3A3E; color: #F0F0F2;
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; margin-left: auto; transition: background .15s; white-space: nowrap; }
.ocp-btn:hover { background: #46464B; }
.ocp-btn:disabled { opacity: .6; cursor: default; }
.ocp-btn-sm { padding: 5px 11px; font-size: 11.5px; margin-left: auto; }
/* ── 设置卡片(系统页样式:分组卡 + 分隔行)── */
.ocp-card { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; padding: 4px 18px; }
.ocp-srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
.ocp-srow:last-child { border-bottom: none; }
.ocp-sk { color: #9A9AA0; flex: none; }
.ocp-sv { color: #F0F0F2; }
.ocp-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.ocp-ok { background: #34C759; }
.ocp-bad { background: #FF453A; }
.ocp-hint { font-size: 11.5px; color: #9A9AA0; }
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
.ocp-count { flex: none; font-size: 12px; color: #9A9AA0; }
.ocp-count b { color: #F0F0F2; font-weight: 600; }
/* ── 适配器卡片(独立卡片,间距 ~16,内行 67 缩放;随宿主滚动,不内滚)── */
.ocp-sites { display: flex; flex-direction: column; gap: 12px; }
.ocp-site { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 13px; padding: 15px 16px;
  cursor: pointer; transition: background .15s, border-color .15s; }
.ocp-site:hover { background: #2B2B30; }
.ocp-site-on { border-color: rgba(74,158,255,.4); background: #262B33; }
.ocp-siterow { display: flex; align-items: center; gap: 12px; }
.ocp-ava { flex: none; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.ocp-sname { font-size: 15px; font-weight: 600; white-space: nowrap; }
.ocp-scount { font-size: 13px; color: #9A9AA0; white-space: nowrap; }
.ocp-chev { margin-left: auto; flex: none; color: #9A9AA0; font-size: 14px; display: inline-block;
  transition: transform .2s ease, color .15s; }
.ocp-site-on .ocp-chev { color: #4A9EFF; transform: rotate(90deg); }
/* ── 展开的命令列表(单行:名称 + 截断描述 + browser/read|write 徽章;点击复制)── */
.ocp-cmds { margin-top: 12px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 10px; display: flex; flex-direction: column; gap: 2px;
  max-height: 300px; overflow: auto; }
.ocp-cmdrow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12.5px;
  cursor: pointer; transition: background .12s; }
.ocp-cmdrow:hover { background: rgba(255,255,255,.05); }
.ocp-cmdrow:active { background: rgba(74,158,255,.12); }
.ocp-cname { flex: none; min-width: 92px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 12.5px; font-weight: 600; color: #79B7FF; }
.ocp-cdesc { flex: 1; min-width: 0; color: #A6A6AE; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ocp-tag { flex: none; font-size: 10.5px; font-weight: 600; letter-spacing: .3px; padding: 2px 8px; border-radius: 6px; }
.ocp-tag-web { background: #333338; color: #9A9AA0; }
.ocp-tag-read { background: rgba(74,158,255,.14); color: #4A9EFF; }
.ocp-tag-write { background: rgba(229,132,90,.15); color: #E5845A; }
.ocp-copied { flex: none; color: #34C759; font-size: 11px; font-weight: 600; }
.ocp-load { font-size: 12px; color: #9A9AA0; padding: 6px 8px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
`

/* 站点名 → 稳定色相(模拟 App 的彩色 favicon 头像,低饱和双色调) */
function avatarHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

function Panel(): ReturnType<typeof createElement> {
  const [status, setStatus] = useState<OpencliStatus | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'site' | 'app'>('site')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, AdapterDetailResult>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(true)
  const [starting, setStarting] = useState(false)
  const [daemonMsg, setDaemonMsg] = useState<string | null>(null)

  const startDaemon = async (): Promise<void> => {
    if (starting) return
    setStarting(true)
    setDaemonMsg(null)
    const r = await rpc<DaemonStartResult>('daemon-start')
    setStarting(false)
    if (r.ok && r.value !== undefined && r.value.ok) {
      if (r.value.started !== true && r.value.message !== null) setDaemonMsg(r.value.message)
      void reload()
    } else {
      setDaemonMsg(r.ok ? (r.value?.message ?? '启动失败') : r.error.message)
    }
  }

  const toggle = async (name: string, el?: HTMLElement | null): Promise<void> => {
    if (expanded === name) { setExpanded(null); return }
    setExpanded(name)
    if (el !== undefined && el !== null) window.setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, 140)
    if (details[name] === undefined) {
      const r = await rpc<AdapterDetailResult>('adapter-detail', { request: { name } })
      setDetails((prev) => ({ ...prev, [name]: r.ok && r.value !== undefined ? r.value : { ok: false, name, domain: null, commands: [], error: r.error.message } }))
    }
  }

  const copyCmd = (key: string, text: string): void => {
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard
    if (clip?.writeText === undefined) return
    void clip.writeText(text).then(() => {
      setCopied(key)
      window.setTimeout(() => { setCopied((c) => (c === key ? null : c)) }, 1600)
    }).catch(() => { /* 剪贴板不可用则保持只读 */ })
  }

  const reload = async () => {
    if (busy) return
    setBusy(true)
    const [st, ad] = await Promise.all([rpc<OpencliStatus>('status'), rpc<AdaptersResult>('adapters')])
    if (st.ok && st.value !== undefined) setStatus(st.value)
    else setStatus(st.value ?? { ok: false, bin: null, version: null, daemon: null, adapterSites: null, error: st.error.message })
    if (ad.ok && ad.value !== undefined) setAdapters(ad.value.adapters)
    setBusy(false)
  }

  useEffect(() => { void reload() }, [])

  const d = status?.daemon
  const up = d?.running === true
  const ext = d?.extension === 'connected'
  const missing = status !== null && !status.ok
  const isAppAdapter = (a: AdapterInfo): boolean =>
    a.domain === undefined || a.domain === 'localhost' || a.domain === '127.0.0.1' || a.domain === 'null'
  const siteList = (adapters ?? []).filter((a) => !isAppAdapter(a))
  const appList = (adapters ?? []).filter(isAppAdapter)
  const siteCmds = siteList.reduce((n, a) => n + a.commandCount, 0)
  const appCmds = appList.reduce((n, a) => n + a.commandCount, 0)
  const active = tab === 'site' ? siteList : appList
  const q = query.trim().toLowerCase()
  const filtered = q.length === 0
    ? active
    : active.filter((a) => a.name.toLowerCase().includes(q) || (a.domain ?? '').toLowerCase().includes(q) || a.commands.some((c) => c.toLowerCase().includes(q)))

  return createElement('div', { className: 'ocp' },
    createElement('style', null, CSS),
    // ── 页头(图标 + 大标题 + 描述 + 刷新)──
    createElement('div', { className: 'ocp-head' },
      createElement('span', { className: 'ocp-icon' }, 'OC'),
      createElement('div', { style: { minWidth: 0 } },
        createElement('div', { className: 'ocp-title' }, 'OpenCLI 管理中心'),
        createElement('div', { className: 'ocp-desc' }, '浏览内置 OpenCLI 命令;dsh 会话经 site 工具直接调用,缺失站点可让模型现场创作。'),
      ),
      createElement('button', { className: 'ocp-btn', onClick: reload, disabled: busy }, busy ? '检测中…' : '刷新/诊断'),
    ),

    // ── 未安装:安装引导卡(第一职责;可折叠)──
    missing ? createElement('div', { className: 'ocp-card ocp-setup' },
      createElement('div', { className: 'ocp-setup-head', onClick: () => { setSetupOpen(!setupOpen) } },
        createElement('span', { className: 'ocp-setup-t' }, '未检测到 opencli —— 三步接入'),
        createElement('span', { className: `ocp-chev ${setupOpen ? 'ocp-chev-on' : ''}` }, '›'),
      ),
      setupOpen ? createElement('div', { className: 'ocp-setup-body' },
        createElement('div', { className: 'ocp-err' }, status?.error ?? ''),
      createElement('div', { className: 'ocp-step' },
        createElement('span', { className: 'ocp-step-n' }, '1'),
        createElement('div', null,
          createElement('div', { className: 'ocp-step-t' }, '安装 opencli CLI'),
          createElement('div', { className: 'ocp-step-d' }, createElement('span', { className: 'ocp-code' }, 'npm i -g @jackwener/opencli'), ' —— 官方一等公民路径。不想管 daemon 生命周期与更新的,可改装 OpenCLIApp 全家托底:', createElement('a', { className: 'ocp-link', href: 'https://opencli.info/download', target: '_blank', rel: 'noreferrer' }, 'opencli.info/download'), '。'),
        ),
      ),
      createElement('div', { className: 'ocp-step' },
        createElement('span', { className: 'ocp-step-n' }, '2'),
        createElement('div', null,
          createElement('div', { className: 'ocp-step-t' }, '启动 daemon,装 Chrome 扩展'),
          createElement('div', { className: 'ocp-step-d' }, createElement('span', { className: 'ocp-code' }, 'opencli daemon restart'), ' 启动守护进程(重启电脑后需重跑,App 路线则自动保活);再装 BrowserBridge 扩展,在 Chrome 里登录常用网站即可。'),
        ),
      ),
      createElement('div', { className: 'ocp-step' },
        createElement('span', { className: 'ocp-step-n' }, '3'),
        createElement('div', null,
          createElement('div', { className: 'ocp-step-t' }, '回到这里点「刷新/诊断」'),
          createElement('div', { className: 'ocp-step-d' }, '检测通过后,dsh 会话即可使用 browser_* 工具与 ', createElement('span', { className: 'ocp-code' }, 'site <适配器> <命令>'), '。自定义路径可设 ', createElement('span', { className: 'ocp-code' }, 'DSH_OPENCLI_BIN'), '。'),
        ),
      ),
      ) : null,
    ) : null,

    // ── 状态卡(系统页样式)──
    status !== null && status.ok ? createElement('div', { className: 'ocp-card' },
      createElement('div', { className: 'ocp-srow' },
        createElement('span', { className: `ocp-dot ${up ? 'ocp-ok' : 'ocp-bad'}` }),
        createElement('span', { className: 'ocp-sk' }, 'daemon'),
        createElement('span', { className: 'ocp-sv' }, up ? '运行中' : '未运行'),
        up ? null : createElement('button', {
          className: 'ocp-btn ocp-btn-sm', disabled: starting,
          onClick: () => { void startDaemon() },
        }, starting ? '启动中…' : '启动 daemon'),
        daemonMsg !== null ? createElement('span', { className: 'ocp-err' }, daemonMsg) : null,
      ),
      createElement('div', { className: 'ocp-srow' },
        createElement('span', { className: `ocp-dot ${ext ? 'ocp-ok' : 'ocp-bad'}` }),
        createElement('span', { className: 'ocp-sk' }, 'Chrome 扩展'),
        createElement('span', { className: 'ocp-sv' }, d?.extension === 'connected' ? '已连接' : (d?.extension ?? '未知')),
      ),
      createElement('div', { className: 'ocp-srow' },
        createElement('span', { className: 'ocp-sk' }, '环境'),
        createElement('span', { className: 'ocp-sv ocp-mono', style: { fontSize: 12 } },
          `v${status.version ?? '?'}`,
          ` · ${status.adapterSites ?? adapters?.length ?? '?'} 站点`,
          ` · ${(siteCmds + appCmds)} 命令`,
          d?.port !== undefined ? ` · 端口 ${d.port}` : '',
          d?.uptime !== undefined ? ` · ↑ ${d.uptime}` : '',
        ),
      ),
    ) : null,

    // ── 命令集合(对齐 App 同名页面)──
    adapters !== null ? createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      createElement('div', { className: 'ocp-tabs' },
        createElement('button', { className: `ocp-tab ${tab === 'site' ? 'ocp-tab-on' : ''}`, onClick: () => { setTab('site'); setExpanded(null) } },
          'Site 命令', createElement('b', null, String(siteCmds))),
        createElement('button', { className: `ocp-tab ${tab === 'app' ? 'ocp-tab-on' : ''}`, onClick: () => { setTab('app'); setExpanded(null) } },
          'App 命令', createElement('b', null, String(appCmds))),
      ),
      createElement('div', { className: 'ocp-search' },
        createElement('input', { className: 'ocp-input', placeholder: '搜索站点、命令或描述', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value) }),
        createElement('span', { className: 'ocp-count' }, createElement('b', null, String(q.length > 0 ? filtered.length : (tab === 'site' ? siteCmds : appCmds))), ' 条命令'),
      ),
      createElement('div', { className: 'ocp-sites' },
        filtered.slice(0, 200).map((a) => {
          const open = expanded === a.name
          const detail = details[a.name]
          const hue = avatarHue(a.name)
          return createElement('div', {
            key: a.name, className: `ocp-site ${open ? 'ocp-site-on' : ''}`,
            onClick: (e: Event) => { void toggle(a.name, e.currentTarget as HTMLElement | null) },
          },
            createElement('div', { className: 'ocp-siterow' },
              createElement('span', {
                className: 'ocp-ava',
                style: { background: `hsl(${hue} 42% 30%)`, color: `hsl(${hue} 75% 78%)` },
              }, a.name.slice(0, 1).toUpperCase()),
              createElement('span', { className: 'ocp-sname' }, a.name),
              createElement('span', { className: 'ocp-scount' }, String(a.commandCount)),
              createElement('span', { className: 'ocp-chev' }, '›'),
            ),
            open ? createElement('div', { className: 'ocp-cmds', onClick: (e: Event) => { e.stopPropagation() } },
              detail === undefined
                ? createElement('div', { className: 'ocp-load' }, 'loading…')
                : detail.ok
                  ? detail.commands.map((c) => {
                      const cmdText = c.example !== undefined && c.example.length > 0 ? c.example : `opencli ${a.name} ${c.name}`
                      const key = `${a.name}:${c.name}`
                      const justCopied = copied === key
                      return createElement('div', {
                        key: c.name, className: 'ocp-cmdrow', title: `${cmdText}\n点击复制`,
                        onClick: () => { copyCmd(key, cmdText) },
                      },
                        createElement('span', { className: 'ocp-cname' }, c.name),
                        createElement('span', { className: 'ocp-cdesc' }, c.description.length > 0 ? c.description : '—'),
                        createElement('span', { className: 'ocp-tag ocp-tag-web' }, 'browser'),
                        createElement('span', { className: `ocp-tag ${c.access === 'write' ? 'ocp-tag-write' : 'ocp-tag-read'}` }, c.access),
                        justCopied ? createElement('span', { className: 'ocp-copied' }, '已复制') : null,
                      )
                    })
                  : createElement('div', { className: 'ocp-err' }, detail.error ?? '加载失败'),
            ) : null,
          )
        }),
        filtered.length === 0 ? createElement('div', { className: 'ocp-load' }, '没有匹配的站点或命令') : null,
      ),
    ) : null,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'opencli-proxy', order: 41, label: '浏览器代理' },
    () => createElement(Panel),
  ))
}
