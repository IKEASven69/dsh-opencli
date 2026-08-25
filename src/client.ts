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
.oc-panel { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.oc-title { font-weight: 700; font-size: 14px; }
.oc-box { border: 1px solid var(--border, rgba(128,128,128,.35)); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.oc-box-error { border-color: rgba(217,48,37,.5); }
.oc-row { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; }
.oc-kv { color: var(--muted, rgba(128,128,128,.9)); }
.oc-input { flex: 1; min-width: 0; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border, rgba(128,128,128,.4)); background: transparent; color: inherit; }
.oc-btn { cursor: pointer; border: 1px solid var(--border, rgba(128,128,128,.5)); background: transparent; color: inherit; border-radius: 6px; padding: 4px 10px; font-size: 12px; }
.oc-btn-run { background: var(--accent, #2563eb); color: #fff; border-color: transparent; }
.oc-list { display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow: auto; }
.oc-item { font-size: 12px; line-height: 1.5; }
.oc-name { font-weight: 600; }
.oc-muted { font-size: 12px; color: var(--muted, rgba(128,128,128,.9)); }
.oc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.oc-ok { background: #15803d; }
.oc-bad { background: #d93025; }
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
  return createElement('div', { className: 'oc-panel' },
    createElement('style', null, CSS),
    createElement('div', { className: 'oc-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      createElement('span', { className: 'oc-title' }, '浏览器代理(登录态 Chrome + 站点适配器)'),
      createElement('button', { className: 'oc-btn', onClick: reload, disabled: busy }, busy ? '加载中…' : '刷新/诊断'),
    ),
    err !== null ? createElement('div', { className: 'oc-box oc-box-error' },
      createElement('div', { className: 'oc-title' }, 'opencli 不可用'),
      createElement('div', { className: 'oc-muted' }, err),
      createElement('div', { className: 'oc-muted' }, '安装:OpenCLIApp(推荐,https://opencli.info/download)或 npm i -g @jackwener/opencli;装好后点「刷新/诊断」。自定义二进制:设 DSH_OPENCLI_BIN 环境变量。'),
    ) : null,
    status !== null && status.ok
      ? createElement('div', { className: 'oc-box' },
          createElement('div', { className: 'oc-row' },
            createElement('span', null,
              createElement('span', { className: `oc-dot ${d?.running === true ? 'oc-ok' : 'oc-bad'}` }),
              d?.running === true ? `daemon 运行中 · 扩展${d.extension ?? '?'} · 端口 ${d.port ?? '?'}` : 'daemon 未运行——browser_* 工具不可用,请启动 OpenCLIApp 或运行 opencli daemon restart'),
          ),
          createElement('div', { className: 'oc-row' },
            createElement('span', null, createElement('span', { className: 'oc-kv' }, '版本: '), status.version ?? '?'),
            createElement('span', null, createElement('span', { className: 'oc-kv' }, '适配器: '), `${status.adapterSites ?? adapters?.length ?? '?'} 站 / ${(adapters ?? []).reduce((n, a) => n + a.commandCount, 0)} 命令`),
            d?.uptime !== undefined ? createElement('span', null, createElement('span', { className: 'oc-kv' }, '已运行: '), d.uptime) : null,
          ),
        )
      : null,
    adapters !== null
      ? createElement('div', { className: 'oc-box' },
          createElement('input', { className: 'oc-input', placeholder: '搜索适配器(名称/域名)…', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value) }),
          createElement('div', { className: 'oc-muted' }, `共 ${adapters.length} 个适配器,按命令数降序;模型经 site 工具调用,systemPrompt 已注入目录。`),
          createElement('div', { className: 'oc-list' },
            filtered.slice(0, 200).map((a) =>
              createElement('div', { key: a.name, className: 'oc-item' },
                createElement('span', { className: 'oc-name' }, a.name),
                ` (${a.commandCount}) ${a.commands.slice(0, 6).join(', ')}${a.commandCount > 6 ? ' …' : ''}`,
                a.domain !== undefined ? createElement('span', { className: 'oc-kv' }, `  ${a.domain}`) : null,
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
