/**
 * dsh-opencli 浏览器半:设置页「浏览器代理」——OpenCLI 管理中心。
 * 视觉对齐 opencli.info 设计系统(deep tech noir + 电光薄荷绿,玻璃拟态卡片)。
 * 职责:安装引导 → 桥接诊断 → 适配器管理。定位:不替代 OpenCLIApp(基础设施层),
 * 本面板是 OpenCLI 在 dsh 生态内的管理中心。
 * @module dsh-opencli/client
 */

import { createElement, useEffect, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { AdapterInfo, AdaptersResult, OpencliStatus } from './types.ts'

export const inject = ['slots']

async function rpc<T>(method: string): Promise<{ ok: boolean; value?: T; error: { message: string } }> {
  try {
    const res = await fetch(`/api/opencli/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
        method: `opencli/${method}`,
        payload: { args: {} },
      }),
    })
    const msg = await res.json() as { result?: { ok: boolean; value?: T; error?: { message?: string } } }
    if (msg.result !== undefined && msg.result.ok) return { ok: true, value: msg.result.value }
    return { ok: false, error: { message: msg.result?.error?.message ?? `HTTP ${res.status}` } }
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

/* ── OpenCLI 设计系统(opencli.info:deep tech noir + electric mint)── */
const CSS = `
.oc-panel { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; font-family: system-ui, 'Plus Jakarta Sans', sans-serif; }
.oc-mono { font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.oc-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.oc-logo { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: 16px; font-weight: 700; letter-spacing: .2px;
  background: linear-gradient(135deg, #00e5a0 0%, #00b4d8 50%, #7b61ff 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.oc-sub { font-size: 12px; color: #8b8ba3; margin-top: 2px; }
.oc-btn { cursor: pointer; border: 1px solid rgba(0,229,160,.25); background: rgba(0,229,160,.08); color: #00e5a0;
  border-radius: 10px; padding: 6px 14px; font-size: 12px; font-family: 'JetBrains Mono', ui-monospace, monospace;
  transition: all .25s cubic-bezier(.16,1,.3,1); white-space: nowrap; }
.oc-btn:hover { background: rgba(0,229,160,.16); box-shadow: 0 0 16px rgba(0,229,160,.25); }
/* ── 玻璃卡片(opencli.info feature-card)── */
.oc-card { position: relative; padding: 16px 18px; background: rgba(18,18,26,.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,.08); border-radius: 16px; transition: all .35s cubic-bezier(.16,1,.3,1); overflow: hidden; }
.oc-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(135deg, #00e5a0 0%, #00b4d8 50%, #7b61ff 100%); opacity: .6; }
.oc-card:hover { border-color: rgba(0,229,160,.25); transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,.3); }
/* ── 状态行 ── */
.oc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.oc-k { color: #5a5a72; font-size: 12px; }
.oc-v { color: #f0f0f5; font-size: 12.5px; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.oc-v-ok { color: #00e5a0; }
.oc-v-bad { color: #ff5f57; }
.oc-chip { background: rgba(0,229,160,.1); border: 1px solid rgba(0,229,160,.2); color: #00e5a0; border-radius: 999px;
  padding: 2px 10px; font-size: 11.5px; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.oc-chip-warn { background: rgba(255,200,0,.1); border-color: rgba(255,200,0,.25); color: #ffd86b; }
/* ── 安装引导(opencli.info 渐变边卡)── */
.oc-setup { display: flex; flex-direction: column; gap: 10px; }
.oc-step { display: flex; gap: 12px; align-items: flex-start; }
.oc-step-n { flex: none; width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; font-family: ui-monospace, monospace;
  background: linear-gradient(135deg, rgba(0,229,160,.18), rgba(123,97,255,.18)); border: 1px solid rgba(0,229,160,.3); color: #00e5a0; }
.oc-step-t { font-size: 13px; color: #f0f0f5; line-height: 1.5; }
.oc-step-d { font-size: 12px; color: #8b8ba3; margin-top: 2px; line-height: 1.5; }
.oc-code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: #00e5a0;
  background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.07); border-radius: 8px; padding: 3px 8px; display: inline-block; }
.oc-link { color: #00b4d8; font-size: 12px; text-decoration: underline; cursor: pointer; word-break: break-all; }
/* ── 适配器区(官网 PluginCard 行卡样式)── */
.oc-input { flex: 1; min-width: 0; font-size: 12.5px; padding: 7px 12px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.1); background: rgba(10,10,15,.5); color: #f0f0f5;
  font-family: 'JetBrains Mono', ui-monospace, monospace; outline: none; transition: border-color .25s; }
.oc-input:focus { border-color: rgba(0,229,160,.45); box-shadow: 0 0 12px rgba(0,229,160,.15); }
.oc-input::placeholder { color: #5a5a72; }
.oc-list { display: flex; flex-direction: column; max-height: 480px; overflow: auto; border-top: 1px solid rgba(255,255,255,.06); }
.oc-pcard { position: relative; padding: 12px 14px; background: rgba(18,18,26,.55);
  border-bottom: 1px solid rgba(255,255,255,.06); transition: all .3s cubic-bezier(.16,1,.3,1); }
.oc-pcard:first-child { border-top-left-radius: 12px; border-top-right-radius: 12px; }
.oc-pcard:last-child { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; border-bottom: none; }
.oc-pcard:hover { background: rgba(0,229,160,.04); }
.oc-ptop { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.oc-ptop-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.oc-pname { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; }
.oc-pauthor { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10.5px; font-weight: 600;
  color: #5a5a72; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-pstat { display: inline-flex; align-items: center; gap: 4px; font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px; font-weight: 600; color: #8b8ba3; white-space: nowrap; }
.oc-pstat b { color: #00e5a0; font-weight: 700; }
.oc-pdesc { color: #8b8ba3; font-size: 12px; line-height: 1.6; margin-bottom: 4px;
  font-family: 'JetBrains Mono', ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-pfoot { display: flex; align-items: center; gap: 8px; }
.oc-pbadge { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px; font-weight: 600;
  letter-spacing: .05em; border: 1px solid; border-radius: 999px; padding: 1px 8px; }
.oc-muted { font-size: 12px; color: #8b8ba3; line-height: 1.6; }
.oc-err { font-size: 12px; color: #ff5f57; font-family: 'JetBrains Mono', ui-monospace, monospace; word-break: break-all; }
`

function Panel(): ReturnType<typeof createElement> {
  const [status, setStatus] = useState<OpencliStatus | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

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
  const totalCmds = (adapters ?? []).reduce((n, a) => n + a.commandCount, 0)
  const filtered = (adapters ?? []).filter((a) => query.trim().length === 0 || a.name.includes(query.trim()) || (a.domain ?? '').includes(query.trim()))

  return createElement('div', { className: 'oc-panel' },
    createElement('style', null, CSS),
    // ── 头部 ──
    createElement('div', { className: 'oc-head' },
      createElement('div', null,
        createElement('div', { className: 'oc-logo' }, '$ opencli'),
        createElement('div', { className: 'oc-sub' }, '浏览器代理 · 登录态 Chrome + 站点适配器 · OpenCLI 管理中心'),
      ),
      createElement('button', { className: 'oc-btn', onClick: reload, disabled: busy }, busy ? '↻ 检测中…' : '↻ 刷新/诊断'),
    ),

    // ── 未安装:安装引导卡(第一职责)──
    missing ? createElement('div', { className: 'oc-card oc-setup' },
      createElement('div', { style: { fontSize: 14, fontWeight: 700, color: '#f0f0f5' } }, '未检测到 opencli —— 三步接入'),
      createElement('div', { className: 'oc-err' }, status?.error ?? ''),
      createElement('div', { className: 'oc-step' },
        createElement('span', { className: 'oc-step-n' }, '1'),
        createElement('div', null,
          createElement('div', { className: 'oc-step-t' }, '安装 OpenCLIApp(推荐)', createElement('span', { className: 'oc-link', onClick: () => { void 0 } }, '')),
          createElement('div', { className: 'oc-step-d' }, '下载: ', createElement('span', { className: 'oc-link' }, 'https://opencli.info/download'), ' — 托盘应用,内置 daemon、Chrome 扩展桥、登录态守护与自动更新。'),
        ),
      ),
      createElement('div', { className: 'oc-step' },
        createElement('span', { className: 'oc-step-n' }, '2'),
        createElement('div', null,
          createElement('div', { className: 'oc-step-t' }, '打开 App 并连接 Chrome 扩展'),
          createElement('div', { className: 'oc-step-d' }, '首次打开按引导装扩展并登录你常用的网站;之后 daemon 常驻,登录态自动保持。命令行用户也可 ', createElement('span', { className: 'oc-code' }, 'npm i -g @jackwener/opencli'), ' 再 ', createElement('span', { className: 'oc-code' }, 'opencli daemon restart'), '。'),
        ),
      ),
      createElement('div', { className: 'oc-step' },
        createElement('span', { className: 'oc-step-n' }, '3'),
        createElement('div', null,
          createElement('div', { className: 'oc-step-t' }, '回到这里点「刷新/诊断」'),
          createElement('div', { className: 'oc-step-d' }, '检测通过后,dsh 会话即可用 browser_* 工具与 ', createElement('span', { className: 'oc-code' }, 'site <适配器>'), ' 调用。自定义安装路径可设 ', createElement('span', { className: 'oc-code' }, 'DSH_OPENCLI_BIN'), ' 环境变量。'),
        ),
      ),
    ) : null,

    // ── 状态卡(玻璃)──
    status !== null && status.ok ? createElement('div', { className: 'oc-card' },
      createElement('div', { className: 'oc-row', style: { marginBottom: 8 } },
        createElement('span', { className: `oc-v ${up ? 'oc-v-ok' : 'oc-v-bad'}` }, up ? '● daemon 运行中' : '● daemon 未运行'),
        createElement('span', { className: `oc-v ${ext ? 'oc-v-ok' : 'oc-v-bad'}` }, `● 扩展 ${d?.extension ?? '?'}`),
        up ? null : createElement('span', { className: 'oc-chip oc-chip-warn' }, '启动 OpenCLIApp 或 opencli daemon restart'),
      ),
      createElement('div', { className: 'oc-row' },
        createElement('span', { className: 'oc-chip' }, `v${status.version ?? '?'}`),
        createElement('span', { className: 'oc-chip' }, `${status.adapterSites ?? adapters?.length ?? '?'} 站点`),
        createElement('span', { className: 'oc-chip' }, `${totalCmds} 命令`),
        d?.port !== undefined ? createElement('span', { className: 'oc-chip' }, `port ${d.port}`) : null,
        d?.uptime !== undefined ? createElement('span', { className: 'oc-chip' }, `↑ ${d.uptime}`) : null,
      ),
    ) : null,

    // ── 适配器卡(官网 PluginCard 行卡)──
    adapters !== null ? createElement('div', { className: 'oc-card' },
      createElement('input', { className: 'oc-input', placeholder: '搜索适配器(名称/域名)…', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value) }),
      createElement('div', { className: 'oc-muted' }, `共 ${adapters.length} 个适配器,按命令数降序。dsh 会话中:`, createElement('span', { className: 'oc-code' }, 'site zhihu hot'), ' 直接调用;没有的站让模型现场创作(browser_do: analyze → init → verify)。'),
      createElement('div', { className: 'oc-list' },
        filtered.slice(0, 200).map((a) => {
          const isApp = a.domain === 'localhost' || a.domain === '127.0.0.1' || a.domain === undefined || a.domain === 'null'
          const badgeColor = isApp ? '#7b61ff' : '#00b4d8'
          return createElement('div', { key: a.name, className: 'oc-pcard' },
            createElement('div', { className: 'oc-ptop' },
              createElement('div', { className: 'oc-ptop-l' },
                createElement('span', { className: 'oc-pname', style: { backgroundColor: badgeColor } }, a.name),
                createElement('span', { className: 'oc-pauthor' }, (isApp ? 'APP' : a.domain ?? '').toUpperCase()),
              ),
              createElement('span', { className: 'oc-pstat' }, createElement('b', null, String(a.commandCount)), ' cmds'),
            ),
            createElement('div', { className: 'oc-pdesc' }, a.commands.slice(0, 8).join(', ') + (a.commandCount > 8 ? ' …' : '')),
            createElement('div', { className: 'oc-pfoot' },
              createElement('span', { className: 'oc-pbadge', style: { borderColor: badgeColor, color: badgeColor } }, isApp ? 'APP' : 'SITE'),
              a.kinds.map((k) => createElement('span', {
                key: k, className: 'oc-pbadge',
                style: { borderColor: 'rgba(255,255,255,.15)', color: '#8b8ba3' },
              }, k.toUpperCase())),
            ),
          )
        }),
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
