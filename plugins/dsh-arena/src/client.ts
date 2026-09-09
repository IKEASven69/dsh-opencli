/**
 * dsh-arena client 半（M4 骨架，【待真机挂载验收】）：
 * classic script 经 window.__ModuleLoader__.load 注入；注册 better-sidebar「比武台」tab。
 * 已知坑（9 月实测）：无 shell 的 ENOENT 已由引擎处理；iframe 响应式用 ResizeObserver；
 * RPC envelope 必须是 payload:{args:{p:{...}}}（与 host 形参名一致）。
 */
if (typeof window !== 'undefined' && (window as any).__ModuleLoader__) {
  ;(window as any).__ModuleLoader__.load({
    id: 'arena',
    factory: () => ({
      inject: ['betterSidebar'],
      apply(ctx: any) {
        const el = document.createElement('div')
        el.style.cssText = 'padding:14px;font-family:inherit;color:inherit'
        el.innerHTML = `
          <h2 style="font-size:15px;margin:0 0 10px">比武台</h2>
          <div id="arena-run" style="font-size:12px;opacity:.75;margin-bottom:10px">加载中…</div>
          <div id="arena-table"></div>
        `
        let mounted = false
        const render = async () => {
          const box = el.querySelector('#arena-run')!
          try {
            const res = await fetch('/api/arena/verdict', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ payload: { args: { p: { repo: '' } } } }),
            })
            const data = await res.json()
            const rows = (data?.value?.rows ?? []) as { member: string; filesCount: number; mergeClean: boolean }[]
            box.textContent = rows.length ? `本场 ${rows.length} 名队员` : '当前无比赛'
            const table = el.querySelector('#arena-table')!
            table.innerHTML = rows
              .map(
                (r) =>
                  `<div style="display:flex;gap:8px;padding:6px 8px;border:1px solid rgba(128,128,128,.25);border-radius:8px;margin-bottom:6px;font-size:12px">
                     <b>${r.member}</b><span>files ${r.filesCount}</span>
                     <span style="margin-left:auto;color:${r.mergeClean ? '#43c78b' : '#e2ab3f'}">${r.mergeClean ? '可合并' : '冲突'}</span>
                   </div>`,
              )
              .join('')
          } catch (e) {
            box.textContent = `加载失败：${String(e)}`
          }
        }
        return {
          apply() {
            if (mounted) return
            mounted = true
            void render()
          },
        }
      },
    }),
  })
}
