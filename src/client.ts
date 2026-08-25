/**
 * dsh-opencli 浏览器半:设置页「浏览器代理」。
 * daemon/扩展状态卡 + 适配器搜索列表 + 刷新。RPC 走 fetch 直连 /api 桥。
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

const CSS = `
.oc-panel { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; font-size: 13px; }
.oc-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, 'JetBrains Mono', monospace; }
.oc-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.oc-title { font-weight: 700; font-size: 14px; letter-spacing: .3px; }
.oc-title .oc-dollar { color: #2ea043; margin-right: 6px; }
.oc-btn { cursor: pointer; border: 1px solid var(--border, rgba(128,128,128,.5)); background: transparent; color: inherit; border-radius: 6px; padding: 4px 10px; font-size: 12px; }
.oc-btn:hover { border-color: #2ea043; color: #2ea043; }
/* ── 终端窗口状态卡(OpenCLI 气质:跟随主题不成立,自带深色终端底) ── */
.oc-term { background: #0d1117; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 18px rgba(1,4,9,.35); }
.oc-term-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; }
.oc-term-dot { width: 11px; height: 11px; border-radius: 50%; }
.oc-term-title { margin-left: 8px; font-size: 11px; color: #8b949e; }
.oc-term-body { padding: 12px 14px; color: #c9d1d9; font-size: 12.5px; line-height: 1.75; }
.oc-prompt { color: #2ea043; }
.oc-cmd { color: #c9d1d9; }
.oc-key { color: #8b949e; }
.oc-val { color: #79c0ff; }
.oc-ok { color: #2ea043; }
.oc-bad { color: #f85149; }
.oc-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.oc-chip { background: #161b22; border: 1px solid #30363d; color: #7ee787; border-radius: 6px; padding: 3px 10px; font-size: 12px; }
/* ── 其余区跟随宿主主题 ── */
.oc-box { border: 1px solid var(--border, rgba(128,128,128,.35)); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.oc-box-error { border-color: rgba(248,81,73,.6); }
.oc-input { flex: 1; min-width: 0; font-size: 12px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, rgba(128,128,128,.4)); background: transparent; color: inherit; font-family: ui-monospace, Consolas, monospace; }
.oc-input:focus { border-color: #2ea043; outline: none; }
.oc-list { display: flex; flex-direction: column; gap: 3px; max-height: 420px; overflow: auto; }
.oc-item { font-size: 12px; line-height: 1.6; font-family: ui-monospace, Consolas, monospace; }
.oc-item:hover { color: #2ea043; }
.oc-n { color: #2ea043; font-weight: 600; }
.oc-c { color: var(--muted, rgba(128,128,128,.9)); }
.oc-dom { color: var(--muted, rgba(128,128,128,.7)); font-style: italic; }
.oc-muted { font-size: 12px; color: var(--muted, rgba(128,128,128,.9)); }
`

function Panel(): ReturnType<typeof createElement> {
  const [status, setStatus] = useState<OpencliStatus | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reload = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const [st, ad] = await Promise.all([rpc<OpencliStatus>('status'), rpc<AdaptersResult>('adapters')])
    if (st.ok && st.value !== undefined) setStatus(st.value)
    else setErr(st.error.message)
    if (ad.ok && ad.value !== undefined) setAdapters(ad.value.adapters)
    setBusy(false)
  }

  useEffect(() => { void reload() }, [])

  const filtered = (adapters ?? []).filter((a) => query.trim().length === 0 || a.name.includes(query.trim()) || (a.domain ?? '').includes(query.trim()))
  const d = status?.daemon
  const up = d?.running === true
  const totalCmds = (adapters ?? []).reduce((n, a) => n + a.commandCount, 0)
  return createElement('div', { className: 'oc-panel' },
    createElement('style', null, CSS),
    createElement('div', { className: 'oc-head' },
      createElement('span', { className: 'oc-title oc-mono' }, createElement('span', { className: 'oc-dollar' }, '$'), 'opencli', createElement('span', { className: 'oc-c', style: { fontWeight: 400 } }, ' — 浏览器代理')),
      createElement('button', { className: 'oc-btn oc-mono', onClick: reload, disabled: busy }, busy ? '↻ loading…' : '↻ 刷新/诊断'),
    ),
    err !== null ? createElement('div', { className: 'oc-box oc-box-error' },
      createElement('div', { className: 'oc-title oc-mono' }, '✗ opencli 不可用'),
      createElement('div', { className: 'oc-muted' }, err),
      createElement('div', { className: 'oc-muted' }, '安装:OpenCLIApp(推荐,https://opencli.info/download)或 npm i -g @jackwener/opencli;装好后点「刷新/诊断」。自定义二进制:设 DSH_OPENCLI_BIN 环境变量。'),
    ) : null,
    status !== null && status.ok
      ? createElement('div', { className: 'oc-term' },
          createElement('div', { className: 'oc-term-bar' },
            createElement('span', { className: 'oc-term-dot', style: { background: '#f85149' } }),
            createElement('span', { className: 'oc-term-dot', style: { background: '#d29922' } }),
            createElement('span', { className: 'oc-term-dot', style: { background: '#2ea043' } }),
            createElement('span', { className: 'oc-term-title oc-mono' }, 'opencli daemon status — bridge'),
          ),
          createElement('div', { className: 'oc-term-body oc-mono' },
            createElement('div', null, createElement('span', { className: 'oc-prompt' }, '~ $ '), createElement('span', { className: 'oc-cmd' }, 'opencli daemon status')),
            createElement('div', null,
              createElement('span', { className: up ? 'oc-ok' : 'oc-bad' }, up ? '✓ Daemon: running' : '✗ Daemon: not running'),
              d?.pid !== undefined ? createElement('span', { className: 'oc-key' }, `  (PID ${d.pid})`) : null),
            d !== null ? createElement('div', null,
              createElement('span', { className: 'oc-key' }, '  Extension: '),
              createElement('span', { className: d.extension === 'connected' ? 'oc-ok' : 'oc-val' }, d.extension ?? '?'),
              createElement('span', { className: 'oc-key' }, '  ·  Port: '),
              createElement('span', { className: 'oc-val' }, String(d.port ?? '?')),
              d.uptime !== undefined ? createElement('span', null, createElement('span', { className: 'oc-key' }, '  ·  Uptime: '), createElement('span', { className: 'oc-val' }, d.uptime)) : null,
            ) : null,
            createElement('div', { className: 'oc-chips' },
              createElement('span', { className: 'oc-chip' }, `v${status.version ?? '?'}`),
              createElement('span', { className: 'oc-chip' }, `${status.adapterSites ?? adapters?.length ?? '?'} sites`),
              createElement('span', { className: 'oc-chip' }, `${totalCmds} commands`),
              up ? null : createElement('span', { className: 'oc-chip', style: { color: '#f85149', borderColor: '#f85149' } }, 'browser_* 需启动 OpenCLIApp'),
            ),
          ),
        )
      : null,
    adapters !== null
      ? createElement('div', { className: 'oc-box' },
          createElement('input', { className: 'oc-input', placeholder: 'grep 适配器(名称/域名)…', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value) }),
          createElement('div', { className: 'oc-muted' }, `共 ${adapters.length} 个适配器,按命令数降序;模型经 site 工具调用,systemPrompt 已注入目录。没有的站可让模型现场创作(browser_do: analyze→init→verify)。`),
          createElement('div', { className: 'oc-list' },
            filtered.slice(0, 200).map((a) =>
              createElement('div', { key: a.name, className: 'oc-item' },
                createElement('span', { className: 'oc-n' }, a.name),
                createElement('span', { className: 'oc-c' }, ` [${a.commandCount}] `),
                `${a.commands.slice(0, 6).join(', ')}${a.commandCount > 6 ? ' …' : ''}`,
                a.domain !== undefined && a.domain !== 'null' ? createElement('span', { className: 'oc-dom' }, `  # ${a.domain}`) : null,
              ),
            ),
          ),
        )
      : null,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'opencli-proxy', order: 41, label: '浏览器代理' },
    () => createElement(Panel),
  ))
}
