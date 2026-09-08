/**
 * dsh-intelhub 浏览器半:设置页「本地知识库」。
 * 视觉对齐 OpenCLIApp 冷灰深色 + 蓝强调(#4A9EFF)——与 dsh-opencli 面板同一设计语言。
 * 职责:导入(文件/文件夹)→ 索引进度 → 语义+关键词混合检索预览 → 文件管理。
 * @module dsh-intelhub/client
 */

import { createElement, useEffect, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { DemoResult, FileEntry, ImportResult, ListResult, RemoveResult, SearchResult, StatusResult } from './types.ts'
// 仅类型面:拉入 settings.section 槽位声明
import type {} from '@deepseek-ai/dsh-client-ui-settings'

export const inject = ['betterSidebar', 'slots']

async function rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; value?: T; error?: { message: string } }> {
  try {
    const res = await fetch(`/api/intelhub/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
        method: `intelhub/${method}`,
        // host 方法都是单参数 p 的 SRC 签名:args 必须按形参名包一层
        payload: { args: Object.keys(args).length > 0 ? { p: args } : args },
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
.zkb { display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #F0F0F2; }
.zkb-head { display: flex; align-items: flex-start; gap: 14px; }
.zkb-icon { flex: none; width: 46px; height: 46px; border-radius: 12px; background: #4A9EFF;
  display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: #fff; }
.zkb-title { font-size: 20px; font-weight: 700; line-height: 1.35; }
.zkb-desc { font-size: 12.5px; color: #9A9AA0; margin-top: 3px; line-height: 1.55; }
.zkb-btn { flex: none; cursor: pointer; border: none; background: #3A3A3E; color: #F0F0F2;
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; transition: background .15s; white-space: nowrap; }
.zkb-btn:hover { background: #46464B; }
.zkb-btn:disabled { opacity: .6; cursor: default; }
.zkb-btn-pri { background: #4A9EFF; color: #fff; }
.zkb-btn-pri:hover { background: #3D8EE8; }
.zkb-card { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; padding: 4px 18px; }
.zkb-srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
.zkb-srow:last-child { border-bottom: none; }
.zkb-sk { color: #9A9AA0; flex: none; }
.zkb-sv { color: #F0F0F2; }
.zkb-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.zkb-ok { background: #34C759; }
.zkb-bad { background: #FF453A; }
.zkb-mid { background: #9A9AA0; }
.zkb-hint { font-size: 11.5px; color: #9A9AA0; line-height: 1.6; }
.zkb-input { flex: 1; min-width: 120px; background: #1C1C1F; border: 1px solid rgba(255,255,255,.09); color: #F0F0F2;
  border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; }
.zkb-input:focus { border-color: #4A9EFF; }
.zkb-files { max-height: 300px; overflow: auto; }
.zkb-frow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12.5px; }
.zkb-frow:last-child { border-bottom: none; }
.zkb-fpath { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.zkb-fmeta { flex: none; color: #9A9AA0; font-size: 11.5px; }
.zkb-hit { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
.zkb-hit:last-child { border-bottom: none; }
.zkb-hitref { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 12px; color: #4A9EFF; word-break: break-all; }
.zkb-hitscore { color: #9A9AA0; font-size: 11px; margin-left: 8px; }
.zkb-hitsnip { font-size: 12.5px; color: #C9C9CE; margin-top: 5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.zkb-badge { flex: none; border-radius: 5px; padding: 1px 7px; font-size: 11px; background: rgba(74,158,255,.16); color: #4A9EFF; }
.zkb-err { color: #FF6961; font-size: 12px; }
.zkb-drop { flex: 1; min-width: 160px; border: 1.5px dashed rgba(255,255,255,.18); border-radius: 10px; padding: 16px 14px;
  text-align: center; font-size: 12.5px; color: #9A9AA0; cursor: pointer; transition: border-color .15s, background .15s; }
.zkb-drop:hover, .zkb-drop.zkb-drop-on { border-color: #4A9EFF; background: rgba(74,158,255,.06); color: #C9C9CE; }
.zkb-demo-tag { display: inline-block; border-radius: 5px; padding: 1px 8px; font-size: 11px; margin-left: 8px; }
.zkb-demo-no { background: rgba(255,69,58,.15); color: #FF6961; }
.zkb-demo-yes { background: rgba(52,199,89,.15); color: #34C759; }
`

function Panel(): ReturnType<typeof createElement> {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [list, setList] = useState<ListResult | null>(null)
  const [path, setPath] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [busyImport, setBusyImport] = useState(false)
  const [busySearch, setBusySearch] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [demo, setDemo] = useState<DemoResult | null>(null)
  const [busyDemo, setBusyDemo] = useState(false)
  const [dragOn, setDragOn] = useState(false)
  const [workspaces, setWorkspaces] = useState<{ path: string; label: string }[]>([])
  const [wsPath, setWsPath] = useState('')
  const [schedules, setSchedules] = useState<{ name: string; kind: string; everyMin?: number; at?: string; enabled?: boolean }[]>([])
  const [schedName, setSchedName] = useState('')
  const [schedEvery, setSchedEvery] = useState('30')
  const [authorF, setAuthorF] = useState('')
  const [stageF, setStageF] = useState('')

  const TEXTLIKE = /\.(md|markdown|txt|log|csv|json|ya?ml|xml|html?|ts|tsx|js|mjs|cjs|py|go|rs|java|c|h|cpp|sh)$/i

  /** 浏览器端读取文本族文件(pdf/docx 走路径导入)。 */
  const readFiles = async (fl: FileList | File[]): Promise<{ name: string; text: string }[]> => {
    const out: { name: string; text: string }[] = []
    for (const f of Array.from(fl)) {
      if (!TEXTLIKE.test(f.name)) continue
      out.push({ name: f.name, text: await f.text() })
    }
    return out
  }

  const doUpload = async (fl: FileList | File[]): Promise<void> => {
    const files = await readFiles(fl)
    if (files.length === 0) {
      setErr('只识别文本类文件(md/txt/json/代码等);PDF、Word 请用下方路径导入。')
      return
    }
    setErr(null)
    const r = await rpc<ImportResult>('upload', { files })
    if (r.ok && r.value !== undefined && r.value.ok) await refresh()
    else setErr(r.value?.error ?? r.error?.message ?? '上传失败')
  }

  const doDemo = async (): Promise<void> => {
    setBusyDemo(true)
    setErr(null)
    const r = await rpc<DemoResult>('demo')
    if (r.ok && r.value !== undefined && r.value.ok) setDemo(r.value)
    else setErr(r.value?.error ?? r.error?.message ?? '演示失败')
    setBusyDemo(false)
    await refresh()
  }

  const refresh = async (): Promise<void> => {
    const s = await rpc<StatusResult>('status')
    if (s.ok && s.value !== undefined) setStatus(s.value)
    const l = await rpc<ListResult>('list')
    if (l.ok && l.value !== undefined) setList(l.value)
    const w = await rpc<{ ok: boolean; workspaces: { path: string; label: string }[] }>('workspace-list')
    if (w.ok && w.value !== undefined) setWorkspaces(w.value.workspaces)
    const sc = await rpc<{ ok: boolean; schedules: { name: string; kind: string; everyMin?: number; at?: string; enabled?: boolean }[] }>('schedule-list')
    if (sc.ok && sc.value !== undefined) setSchedules(sc.value.schedules)
  }

  useEffect(() => {
    void refresh()
  }, [])

  // 索引中 → 轮询进度
  useEffect(() => {
    if (status === null || status.indexing === 0) return
    const t = window.setInterval(() => { void refresh() }, 1500)
    return () => window.clearInterval(t)
  }, [status?.indexing])

  const doImport = async (): Promise<void> => {
    if (path.trim() === '') return
    setBusyImport(true)
    setErr(null)
    const r = await rpc<ImportResult>('import', { path })
    if (r.ok && r.value !== undefined && r.value.ok) {
      setPath('')
      await refresh()
    } else {
      setErr(r.value?.error ?? r.error?.message ?? '导入失败')
    }
    setBusyImport(false)
  }

  const doSearch = async (): Promise<void> => {
    if (query.trim() === '') return
    setBusySearch(true)
    setErr(null)
    const args: Record<string, unknown> = { query, topk: 5 }
    if (authorF.trim() !== '') args.author = authorF.trim()
    if (stageF.trim() !== '') args.stage = stageF.trim()
    const r = await rpc<SearchResult>('search', args)
    if (r.ok && r.value !== undefined) setResults(r.value)
    else setErr(r.error?.message ?? '检索失败')
    setBusySearch(false)
  }

  const doWsAdd = async (): Promise<void> => {
    if (wsPath.trim() === '') return
    const r = await rpc<{ ok: boolean; error?: string }>('workspace-add', { path: wsPath })
    if (r.ok && r.value !== undefined && r.value.ok) setWsPath('')
    else setErr(r.value?.error ?? r.error?.message ?? '注册失败')
    await refresh()
  }

  const doWsRemove = async (p: string): Promise<void> => {
    await rpc('workspace-remove', { path: p })
    await refresh()
  }

  const doSchedAdd = async (): Promise<void> => {
    if (schedName.trim() === '') return
    const r = await rpc<{ ok: boolean; error?: string }>('schedule-set', { name: schedName, kind: 'interval', everyMin: Number(schedEvery) || 30 })
    if (!(r.ok && r.value !== undefined && r.value.ok)) setErr(r.value?.error ?? r.error?.message ?? '设置失败')
    setSchedName('')
    await refresh()
  }

  const doSchedToggle = async (name: string, enabled: boolean): Promise<void> => {
    await rpc('schedule-toggle', { name, enabled })
    await refresh()
  }

  const doSchedRemove = async (name: string): Promise<void> => {
    await rpc('schedule-remove', { name })
    await refresh()
  }

  const [removing, setRemoving] = useState('')

  const doRemove = async (p: string): Promise<void> => {
    if (!window.confirm('从知识库移除「' + p.split(/[\\/]/).pop() + '」?(原文件不受影响)')) return
    setRemoving(p)
    const r = await rpc<RemoveResult>('remove', { path: p })
    setRemoving('')
    if (!(r.ok && r.value !== undefined && r.value.ok)) setErr(r.value?.error ?? r.error?.message ?? '删除失败')
    await refresh()
  }

  const modelDot = status?.model === 'ready' ? 'zkb-ok' : status?.model === 'loading' ? 'zkb-mid' : 'zkb-bad'
  const modelText = status?.model === 'ready' ? '就绪(本地 e5-small)' : status?.model === 'loading' ? '加载中…' : '不可用'

  const hitLines = (results?.hits ?? []).map((h, i) => {
    const bar = results !== null && results.hits.length > 0
      ? Math.max(6, Math.round((h.score / results.hits[0].score) * 100)) : 0
    return createElement('div', { className: 'zkb-hit', key: i },
      createElement('div', null,
        createElement('span', { className: 'zkb-hitref' }, h.ref),
        createElement('span', { className: 'zkb-hitscore' }, `相关度 ${bar}%`),
      ),
      createElement('div', { className: 'zkb-hitsnip' }, h.text.length > 260 ? h.text.slice(0, 260) + '…' : h.text),
    )
  })

  return createElement('div', { className: 'zkb' },
    createElement('style', null, CSS),
    // ── 页头 ──
    createElement('div', { className: 'zkb-head' },
      createElement('span', { className: 'zkb-icon' }, 'IH'),
      createElement('div', { style: { minWidth: 0 } },
        createElement('div', { className: 'zkb-title' }, '情报站 IntelHub'),
        createElement('div', { className: 'zkb-desc' }, '刷到的信息自动沉淀为可检索的知识:采集/文件夹/网页/笔记 → 语义+关键词混合检索带出处 → Obsidian 反哺。零守护进程·零 API key·文档不出本机。'),
      ),
    ),
    err !== null ? createElement('div', { className: 'zkb-err' }, err) : null,
    // ── 状态卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-sk' }, '已导入'),
        createElement('span', { className: 'zkb-sv' }, `${status?.files ?? '–'} 个文件 · ${status?.chunks ?? '–'} 块`),
        status !== null && status.indexing > 0 ? createElement('span', { className: 'zkb-badge' }, `索引中 ${status.indexing}`) : null,
      ),
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-sk' }, '检索模型'),
        createElement('span', { className: `zkb-dot ${modelDot}` }),
        createElement('span', { className: 'zkb-sv' }, modelText),
        createElement('span', { className: 'zkb-hint', style: { marginLeft: 'auto' } }, '首次导入时自动下载(约 30MB),全程本机'),
      ),
    ),
    // ── 空态演示卡(知识库为空时)──
    (status === null || (status.files === 0 && status.chunks === 0 && status.indexing === 0))
      ? createElement('div', { className: 'zkb-card' },
          createElement('div', { className: 'zkb-srow' },
            createElement('span', { className: 'zkb-sk' }, '第一次用?'),
            createElement('span', { className: 'zkb-hint', style: { flex: 1 } }, '30 秒看懂语义检索和关键词检索的差别——导入一份样例手册,问一个文档里"没写过"的问题。'),
            createElement('button', { className: 'zkb-btn zkb-btn-pri', disabled: busyDemo, onClick: () => { void doDemo() } }, busyDemo ? '准备中…' : '看演示'),
          ),
          demo !== null && demo.ok
            ? createElement('div', { className: 'zkb-srow', style: { display: 'block' } },
                createElement('div', { className: 'zkb-hint' }, `查询「${demo.query}」——样例手册里写的是"30 秒内无响应则会话中断",没有"超时"二字:`),
                createElement('div', { style: { marginTop: 8 } },
                  createElement('span', { className: 'zkb-demo-tag zkb-demo-no' }, `关键词检索 ${demo.fts.length} 条`),
                  demo.fts.length > 0 ? createElement('span', { className: 'zkb-hint' }, demo.fts.map((h) => h.ref).join(' ')) : null,
                ),
                createElement('div', { style: { marginTop: 6 } },
                  createElement('span', { className: 'zkb-demo-tag zkb-demo-yes' }, `语义混合检索 ${demo.hybrid.length} 条`),
                  demo.hybrid.slice(0, 2).map((h, i) => createElement('div', { key: i, style: { marginTop: 6 } },
                    createElement('span', { className: 'zkb-hitref' }, h.ref),
                    createElement('div', { className: 'zkb-hitsnip' }, h.text.length > 120 ? h.text.slice(0, 120) + '…' : h.text),
                  )),
                ),
              )
            : null,
        )
      : null,
    // ── 导入卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('div', {
          className: `zkb-drop${dragOn ? ' zkb-drop-on' : ''}`,
          onClick: () => {
            const inp = document.createElement('input')
            inp.type = 'file'
            inp.multiple = true
            inp.onchange = () => { if (inp.files !== null) void doUpload(inp.files) }
            inp.click()
          },
          onDragOver: (e: DragEvent) => { e.preventDefault(); setDragOn(true) },
          onDragLeave: () => setDragOn(false),
          onDrop: (e: DragEvent) => { e.preventDefault(); setDragOn(false); if (e.dataTransfer?.files !== undefined && e.dataTransfer.files.length > 0) void doUpload(e.dataTransfer.files) },
        }, '拖入文件(可多选,md/txt/json/代码)或点击选择'),
        createElement('input', { className: 'zkb-input', placeholder: '或输入路径(文件夹/单个文件,支持 ~;PDF、Word 走这里)', value: path, onChange: (e: { target: { value: string } }) => setPath(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') void doImport() } }),
        createElement('button', { className: 'zkb-btn zkb-btn-pri', disabled: busyImport || path.trim() === '', onClick: () => { void doImport() } }, busyImport ? '导入中…' : '导入'),
      ),
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-hint' }, 'Obsidian 库直接填库目录(自动跳过 .obsidian 内部文件);网页让 agent 用 kb_import_url 存档;对话里的长文/微博等社交内容由 agent 经 kb_note 写入。重复导入只处理新增与变更。'),
      ),
    ),
    // ── 检索预览卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('input', { className: 'zkb-input', placeholder: '试试语义检索:换个说法也能找到(如"怎么配置超时时间")', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') void doSearch() } }),
        createElement('button', { className: 'zkb-btn', disabled: busySearch || query.trim() === '', onClick: () => { void doSearch() } }, busySearch ? '检索中…' : '检索'),
      ),
      createElement('div', { className: 'zkb-srow' },
        createElement('input', { className: 'zkb-input', placeholder: '作者过滤(如 宝玉xp,可空)', value: authorF, onChange: (e: { target: { value: string } }) => setAuthorF(e.target.value) }),
        createElement('input', { className: 'zkb-input', placeholder: '阶段过滤(selected/raw,可空)', value: stageF, onChange: (e: { target: { value: string } }) => setStageF(e.target.value) }),
      ),
      results !== null && results.hits.length > 0
        ? createElement('div', { className: 'zkb-srow', style: { display: 'block' } }, ...hitLines)
        : results !== null
          ? createElement('div', { className: 'zkb-srow' }, createElement('span', { className: 'zkb-hint' }, `没有匹配${results.note !== undefined && results.note !== '' ? `(${results.note})` : ''}`))
          : null,
    ),
    // ── workspace 常驻目录卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-sk' }, '常驻目录'),
        createElement('span', { className: 'zkb-hint' }, '注册后自动跟随:采集脚本落盘 → 增量索引 → 即刻可问'),
      ),
      ...workspaces.map((w) => createElement('div', { className: 'zkb-frow', key: w.path },
        createElement('span', { className: 'zkb-dot zkb-ok' }),
        createElement('span', { className: 'zkb-fpath', title: w.path }, w.label + ' · ' + w.path),
        createElement('button', { className: 'zkb-btn', style: { padding: '4px 10px', fontSize: '11px' }, onClick: () => { void doWsRemove(w.path) } }, '移除'),
      )),
      createElement('div', { className: 'zkb-srow' },
        createElement('input', { className: 'zkb-input', placeholder: '新增常驻目录(绝对路径,如 D:/knowledge-base/collections)', value: wsPath, onChange: (e: { target: { value: string } }) => setWsPath(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') void doWsAdd() } }),
        createElement('button', { className: 'zkb-btn zkb-btn-pri', disabled: wsPath.trim() === '', onClick: () => { void doWsAdd() } }, '注册'),
      ),
    ),
    // ── 定时任务卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-sk' }, '定时任务'),
        createElement('span', { className: 'zkb-hint' }, '重启不丢;agent 可经 kb_schedule 设置(如按发博节奏定时扫描)'),
      ),
      ...schedules.map((sc) => createElement('div', { className: 'zkb-frow', key: sc.name },
        createElement('span', { className: `zkb-dot ${sc.enabled === true ? 'zkb-ok' : 'zkb-mid'}` }),
        createElement('span', { className: 'zkb-fpath' }, sc.name + ' · ' + (sc.kind === 'daily' ? `每天 ${sc.at ?? ''}` : `每 ${sc.everyMin ?? '?'} 分钟`) + ' · scan'),
        createElement('button', { className: 'zkb-btn', style: { padding: '4px 10px', fontSize: '11px' }, onClick: () => { void doSchedToggle(sc.name, !(sc.enabled === true)) } }, sc.enabled === true ? '停用' : '启用'),
        createElement('button', { className: 'zkb-btn', style: { padding: '4px 10px', fontSize: '11px' }, onClick: () => { void doSchedRemove(sc.name) } }, '删除'),
      )),
      createElement('div', { className: 'zkb-srow' },
        createElement('input', { className: 'zkb-input', placeholder: '任务名(如 晨间扫描)', value: schedName, onChange: (e: { target: { value: string } }) => setSchedName(e.target.value) }),
        createElement('input', { className: 'zkb-input', placeholder: '间隔分钟', value: schedEvery, onChange: (e: { target: { value: string } }) => setSchedEvery(e.target.value), style: { maxWidth: '110px' } }),
        createElement('button', { className: 'zkb-btn zkb-btn-pri', disabled: schedName.trim() === '', onClick: () => { void doSchedAdd() } }, '添加'),
      ),
    ),
    // ── 文件列表卡 ──
    createElement('div', { className: 'zkb-card' },
      createElement('div', { className: 'zkb-srow' },
        createElement('span', { className: 'zkb-sk' }, '已导入文件'),
        createElement('span', { className: 'zkb-hint', style: { marginLeft: 'auto' } }, '删除即从索引移除,原文件不受影响'),
      ),
      (list?.files ?? []).length === 0
        ? createElement('div', { className: 'zkb-srow' }, createElement('span', { className: 'zkb-hint' }, '还没有导入文件。'))
        : createElement('div', { className: 'zkb-files' },
            ...(list?.files ?? []).map((f: FileEntry) => createElement('div', { className: 'zkb-frow', key: f.path },
              createElement('span', { className: `zkb-dot ${f.status === 'done' ? 'zkb-ok' : f.status === 'failed' ? 'zkb-bad' : 'zkb-mid'}` }),
              createElement('span', { className: 'zkb-fpath', title: f.error !== undefined ? f.error : f.path }, f.path),
              createElement('span', { className: 'zkb-fmeta' }, f.status === 'done' ? `${f.chunks} 块` : f.status === 'indexing' ? '索引中' : '失败'),
              createElement('button', { className: 'zkb-btn', style: { padding: '4px 10px', fontSize: '11px' }, disabled: removing === f.path, onClick: () => { void doRemove(f.path) } }, removing === f.path ? '移除中' : '删除'),
            )),
          ),
    ),
  )
}

export function apply(ctx: ClientContext): void {
  // 与 dsh-opencli 相同的注册路径;slots 的 'settings.section' 槽位名声明在宿主 ui-settings 包里,
  // 本包类型树拉不到该增强,这里局部收窄(运行时行为一致)
  const slots = ctx.slots as unknown as {
    inject: (slot: string, fn: () => unknown) => void
    register: (options: { name: string; id: string; order: number; label: string }, component: () => unknown) => () => void
  }
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'zvec-kb', order: 42, label: '情报站' },
    () => createElement(Panel),
  ))

  // ── dsh-better-sidebar 侧边栏 tab(可选生态集成)──────────
  // 装了 better-sidebar 才注册"情报站"侧边栏页(检索+来源+今日概览随手可及);
  // 服务就绪由 inject 声明保证;未装则静默跳过,设置页配置卡不受影响。
  type BetterSidebarApi = {
    registerTab(d: {
      id: string
      title: () => string
      icon: unknown
      order: number
      component: (props: Record<string, unknown>) => unknown
    }): () => void
  }
  const bsApi = (ctx as unknown as { betterSidebar?: BetterSidebarApi }).betterSidebar
  if (bsApi !== undefined) {
    try {
      bsApi.registerTab({
        id: 'dsh-intelhub:kb',
        title: () => '情报站',
        icon: createElement('span', { style: { fontWeight: '800', fontSize: '13px' } }, 'IH'),
        order: 50,
        component: () => createElement(SidebarKB),
      })
    } catch {
      /* better-sidebar 版本不兼容时静默放弃,不影响设置页 */
    }
  }
}

/** 侧边栏精简版:检索 + 来源结果(完整管理在设置页)。 */
function SidebarKB(): ReturnType<typeof createElement> {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState<string | null>(null)

  const doSearch = async (): Promise<void> => {
    if (query.trim() === '') return
    setBusy(true)
    const r = await rpc<SearchResult>('search', { query, topk: 5 })
    if (r.ok && r.value !== undefined) setResults(r.value)
    setBusy(false)
  }

  const loadToday = async (): Promise<void> => {
    const r = await rpc<{ text: string }>('today', {})
    if (r.ok && r.value !== undefined) setToday(r.value.text)
  }

  useEffect(() => { void loadToday() }, [])

  const hits = (results?.hits ?? []).map((h, i) => createElement('div', { key: i, style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
    createElement('div', { style: { fontSize: '12px', color: '#4A9EFF', wordBreak: 'break-all' } }, h.ref),
    createElement('div', { style: { fontSize: '12px', color: '#C9C9CE', marginTop: '4px', lineHeight: 1.5 } }, h.text.length > 140 ? h.text.slice(0, 140) + '…' : h.text),
  ))

  return createElement('div', { style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', boxSizing: 'border-box', overflow: 'auto' } },
    createElement('div', { style: { fontWeight: 700, fontSize: '15px' } }, '情报站'),
    createElement('div', { style: { display: 'flex', gap: '8px' } },
      createElement('input', { placeholder: '语义检索(带出处)', value: query, onChange: (e: { target: { value: string } }) => setQuery(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') void doSearch() }, style: { flex: 1, background: '#1C1C1F', border: '1px solid rgba(255,255,255,0.09)', color: '#ECEAE4', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', outline: 'none' } }),
      createElement('button', { onClick: () => { void doSearch() }, disabled: busy || query.trim() === '', style: { background: '#4A9EFF', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 14px', cursor: 'pointer' } }, busy ? '…' : '检索'),
    ),
    createElement('div', { style: { fontSize: '12px', color: '#9A9EA8', whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' } }, today ?? '今日概览加载中…'),
    ...(hits.length > 0 ? [createElement('div', null, ...hits)] : [createElement('div', { style: { fontSize: '12px', color: '#9A9EA8' } }, results === null ? '输入检索词开始。' : '没有匹配。')]),
  )
}
