# -*- coding: utf-8 -*-
# Premium 第二阶段:hero 化 + 入场动画 + 光影细节
import io

C = r'D:\CodingProjects\dsh-opencli-release\src\client.ts'
src = io.open(C, encoding='utf-8').read()

# ---------- CSS 追加/强化 ----------
css_add = r'''
/* premium 2:入场动画(阶梯式) */
.o4 > * { animation: o4in .5s cubic-bezier(.22,1,.36,1) backwards; }
.o4 > *:nth-child(1) { animation-delay: .03s; }
.o4 > *:nth-child(2) { animation-delay: .09s; }
.o4 > *:nth-child(3) { animation-delay: .15s; }
.o4 > *:nth-child(4) { animation-delay: .21s; }
.o4 > *:nth-child(5) { animation-delay: .27s; }
.o4 > *:nth-child(n+6) { animation-delay: .33s; }
@keyframes o4in { from { opacity: 0; transform: translateY(12px) scale(.995); } }
/* 卡片顶部高光(光落在上边缘) */
.o4-card, .o4-sec { position: relative; overflow: hidden; }
.o4-card::before, .o4-sec::before { content:""; position:absolute; top:0; left:12%; right:12%; height:1px;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); pointer-events:none; }
/* hero 健康卡:渐变网格底 + 大状态 */
.o4-hero { background:
  radial-gradient(ellipse at 85% -20%, rgba(74,158,255,.22), transparent 55%),
  radial-gradient(ellipse at 0% 120%, rgba(52,199,89,.10), transparent 50%),
  linear-gradient(180deg,#1D222B,#181C23);
  border:1px solid rgba(74,158,255,.28); border-radius:16px; padding:16px 17px;
  box-shadow:0 14px 40px -18px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06); }
.o4-hero .o4-big { font-size:26px; font-weight:700; letter-spacing:.3px; display:flex; align-items:center; gap:10px; line-height:1.1; }
.o4-hero .o4-big .o4-vchip { font-size:11px; }
.o4-pulse { width:12px; height:12px; border-radius:50%; background:#34C759; position:relative; flex:none; box-shadow:0 0 10px rgba(52,199,89,.8); }
.o4-pulse::after { content:""; position:absolute; inset:-5px; border-radius:50%; border:2px solid rgba(52,199,89,.45); animation:o4ping 1.8s ease-out infinite; }
@keyframes o4ping { from { transform:scale(.55); opacity:1; } to { transform:scale(1.7); opacity:0; } }
.o4-hero .o4-cell .v.big { font-size:21px; font-weight:700; display:flex; align-items:baseline; gap:5px; }
.o4-hero .o4-cell .v.big small { font-size:11px; font-weight:500; color:#5F6873; }
.o4-cell .v.dim { color:#5F6873; font-weight:500; }
'''
src = src.replace('.o4-note { font-size:10.5px; color:#5F6873; margin-top:8px; line-height:1.6; }',
                  '.o4-note { font-size:10.5px; color:#5F6873; margin-top:8px; line-height:1.6; }' + css_add, 1)

# ---------- JSX:健康卡 → hero ----------
old_hero = """      // 健康卡(daemon 离线时降级为修复态)
      createElement('div', { className: 'o4-card' },
        createElement('div', { className: 'o4-h3' }, createElement('span', { className: 'o4-miniico' }, ic('activity', true)), 'opencli 健康', status === null ? ` · ${t2('loading')}` : ''),
        createElement('div', { className: 'o4-sub' }, `daemon ${status?.daemon?.version ?? '—'} · extension ${status?.daemon?.extension ?? t2('unknown')} · sites ${adapters?.length ?? 0}`),
        createElement('div', { className: 'o4-cells' },
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'daemon'), createElement('div', { className: `v${daemonUp ? ' on' : ''}` }, status === null ? t2('loading') : (daemonUp ? t2('daemonRunning') : t2('daemonDown')))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'version'), createElement('div', { className: 'v' }, status === null ? '…' : (status.version ?? '—'))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'Chrome'), createElement('div', { className: 'v mut' }, status === null ? '…' : (status.daemon?.extension ?? t2('unknown')))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'sites'), createElement('div', { className: 'v' }, status === null ? '…' : String(adapters?.length ?? 0))),
        ),"""
assert old_hero in src, 'hero anchor missing'
new_hero = """      // 健康卡 → hero(daemon 离线时降级为修复态)
      createElement('div', { className: 'o4-hero' },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '13px' } },
          status === null
            ? createElement('span', { className: 'o4-dot n' })
            : (daemonUp ? createElement('span', { className: 'o4-pulse' }) : createElement('span', { className: 'o4-dot r', style: { width: '12px', height: '12px' } })),
          createElement('div', { className: 'o4-big' },
            status === null ? t2('loading') : (daemonUp ? 'daemon ' + t2('daemonRunning') : 'daemon ' + t2('daemonDown')),
            status?.version ? createElement('span', { className: 'o4-vchip' }, 'v' + String(status.version).replace(/^v/, '')) : null,
          ),
          createElement('button', { className: 'o4-btn ghost sm', style: { marginLeft: 'auto' }, disabled: starting, onClick: () => { void startDaemon() } },
            ic('refresh', true), starting ? '…' : t2('fix')),
        ),
        createElement('div', { className: 'o4-cells' },
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'sites'), createElement('div', { className: 'v big' }, status === null ? '…' : String(adapters?.length ?? 0), createElement('small', null, '站'))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, 'Chrome 扩展'), createElement('div', { className: `v big${status?.daemon?.extension === 'connected' ? ' on' : ''}` , style: status?.daemon?.extension === 'connected' ? { fontSize: '15px' } : { fontSize: '13px', color: '#5F6873', fontWeight: 500 } }, status === null ? '…' : (status.daemon?.extension ?? t2('unknown')))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, '审计(7d)'), createElement('div', { className: 'v big' }, String(audit?.count7d ?? 0), createElement('small', null, '次拦截'))),
          createElement('div', { className: 'o4-cell' }, createElement('div', { className: 'l' }, '自动化模式'), createElement('div', { className: 'v', style: { fontSize: '14px' } }, autoMode)),
        ),"""
src = src.replace(old_hero, new_hero)

io.open(C, 'w', encoding='utf-8', newline='\n').write(src)
print('premium phase-2 applied')
