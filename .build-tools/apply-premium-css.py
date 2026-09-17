# -*- coding: utf-8 -*-
# 将 client.ts 的 CSS 块整体替换为 v0.4 premium 设计系统
import io

P = r'D:\CodingProjects\dsh-opencli-release\src\client.ts'
src = io.open(P, encoding='utf-8').read()
start = src.find('const CSS = `')
end = src.find('`', start + len('const CSS = `'))
assert start >= 0 and end > start, 'CSS block markers not found'

new_css = r'''const CSS = `
.o4 { width:100%; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:11px; font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif; color:#E8EAED; position:relative; }
.o4::before { content:""; position:absolute; inset:-40px -40px auto -40px; height:220px; background:radial-gradient(ellipse at 30% 0%, rgba(74,158,255,.10), transparent 65%); pointer-events:none; }
.o4ic { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.o4ic-s { width:13px; height:13px; }
.o4-head { display:flex; align-items:center; gap:12px; padding:15px 17px; background:linear-gradient(180deg,rgba(31,36,45,.85),rgba(22,26,32,.9)); border:1px solid rgba(255,255,255,.07); border-radius:16px; flex-wrap:wrap; box-shadow:0 1px 2px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter:blur(10px); }
.o4-logo { width:44px; height:44px; border-radius:13px; display:flex; align-items:center; justify-content:center; flex:none; box-shadow:0 0 0 1px rgba(255,255,255,.08), 0 6px 20px -6px rgba(0,149,255,.35); }
.o4-h1 { font-size:17px; font-weight:700; white-space:nowrap; letter-spacing:.2px; background:linear-gradient(90deg,#F4F7FF,#C7D6F5); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.o4-desc { font-size:11px; color:#8B95A5; margin-top:3px; line-height:1.55; }
.o4-hr { margin-left:auto; display:flex; align-items:center; gap:7px; flex:none; }
.o4-vchip { font-size:11px; color:#5F6873; border:1px solid rgba(255,255,255,.07); border-radius:999px; padding:3px 9px; }
.o4-seg { display:flex; background:rgba(15,17,21,.7); border:1px solid rgba(255,255,255,.08); border-radius:9px; padding:2px; }
.o4-seg button { border:0; background:transparent; color:#8B95A5; font-size:11.5px; padding:4px 11px; border-radius:7px; cursor:pointer; white-space:nowrap; transition:all .18s ease; }
.o4-seg button.on { background:linear-gradient(135deg,#4A9EFF,#3B82F6); color:#fff; box-shadow:0 2px 8px -2px rgba(74,158,255,.6); }
.o4-seg button:not(.on):hover { color:#E8EAED; }
.o4-tabs { display:flex; gap:4px; background:rgba(20,23,28,.8); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:4px; backdrop-filter:blur(10px); }
.o4-tabs button { flex:1; border:0; background:transparent; color:#8B95A5; font-size:12.5px; padding:8px 0; border-radius:9px; cursor:pointer; transition:all .18s ease; }
.o4-tabs button:hover { color:#C7D6F5; }
.o4-tabs button.on { background:linear-gradient(180deg,#232936,#1D222B); color:#fff; font-weight:600; box-shadow:inset 0 0 0 1px rgba(74,158,255,.35), 0 2px 10px -4px rgba(0,0,0,.6); }
.o4-status { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 12px; background:rgba(20,23,28,.72); border:1px solid rgba(255,255,255,.06); border-radius:12px; backdrop-filter:blur(10px); }
.o4-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#8B95A5; background:rgba(26,30,37,.7); border:1px solid rgba(255,255,255,.05); border-radius:999px; padding:3px 9px; transition:border-color .18s ease; }
.o4-chip:hover { border-color:rgba(255,255,255,.14); }
.o4-chip img { width:12px; height:12px; border-radius:3px; }
.o4-chip .o4ic { width:12px; height:12px; }
.o4-dot { width:7px; height:7px; border-radius:50%; flex:none; }
.o4-dot.g { background:#34C759; box-shadow:0 0 6px rgba(52,199,89,.8); }
.o4-dot.r { background:#FF453A; box-shadow:0 0 6px rgba(255,69,58,.6); }
.o4-dot.y { background:#FF9F0A; } .o4-dot.n { background:#3A414D; }
.o4-sep { width:1px; height:14px; background:rgba(255,255,255,.08); }
.o4-diag { display:flex; align-items:center; gap:9px; padding:9px 13px; border-radius:12px; font-size:12px; cursor:pointer; transition:filter .18s ease; }
.o4-diag:hover { filter:brightness(1.12); }
.o4-diag.ok { background:linear-gradient(90deg,rgba(52,199,89,.10),rgba(52,199,89,.04)); border:1px solid rgba(52,199,89,.25); color:#7FD89A; }
.o4-diag.bad { background:linear-gradient(90deg,rgba(255,69,58,.10),rgba(255,69,58,.04)); border:1px solid rgba(255,69,58,.3); color:#FF8D85; }
.o4-diag .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
.o4-card { background:linear-gradient(180deg,#1D222B,#191D24); border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:13px 15px; box-shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 32px -18px rgba(0,0,0,.6); transition:border-color .18s ease, transform .18s ease; }
.o4-card:hover { border-color:rgba(255,255,255,.11); }
.o4-card + .o4-card { margin-top:11px; }
.o4-h3 { font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:8px; letter-spacing:.2px; }
.o4-h3 .rt { margin-left:auto; display:flex; align-items:center; gap:8px; }
.o4-sub { font-size:11.5px; color:#77808F; margin:4px 0 10px; line-height:1.55; }
.o4-miniico { width:24px; height:24px; border-radius:8px; background:linear-gradient(135deg,rgba(74,158,255,.18),rgba(74,158,255,.08)); border:1px solid rgba(74,158,255,.35); color:#6FB0FF; display:inline-flex; align-items:center; justify-content:center; flex:none; }
.o4-btn { border:0; border-radius:9px; background:linear-gradient(135deg,#4A9EFF,#3577E8); color:#fff; font-size:12px; padding:6px 14px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:6px; transition:all .18s ease; box-shadow:0 2px 10px -3px rgba(74,158,255,.55); }
.o4-btn:hover { background:linear-gradient(135deg,#5AA9FF,#3B82F6); transform:translateY(-1px); box-shadow:0 4px 14px -3px rgba(74,158,255,.6); }
.o4-btn:active { transform:translateY(0); }
.o4-btn.ghost { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); color:#A8B1BF; font-weight:500; box-shadow:none; }
.o4-btn.ghost:hover { background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.16); color:#E8EAED; transform:translateY(-1px); }
.o4-btn.sm { padding:4px 10px; font-size:11.5px; }
.o4-btn:disabled { opacity:.5; cursor:default; transform:none; }
.o4-in { flex:1; min-width:0; background:rgba(13,15,18,.8); border:1px solid rgba(255,255,255,.09); color:#E8EAED; border-radius:9px; padding:7px 11px; font-size:12.5px; transition:border-color .18s ease, box-shadow .18s ease; }
.o4-in:focus { outline:none; border-color:rgba(74,158,255,.55); box-shadow:0 0 0 3px rgba(74,158,255,.15); }
.o4-in.mono { font-family:ui-monospace,Consolas,monospace; }
.o4-in::placeholder { color:#525B67; }
.o4-tryout { margin-top:9px; background:linear-gradient(180deg,#0A0C0F,#0C0E12); border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:10px 12px; font:11.5px/1.7 ui-monospace,Consolas,monospace; color:#A9C7EC; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow:auto; box-shadow:inset 0 2px 8px rgba(0,0,0,.4); }
.o4-tryout::-webkit-scrollbar { width:6px; }
.o4-tryout::-webkit-scrollbar-thumb { background:#313845; border-radius:3px; }
.o4-tryout .k { color:#5F6873; }
.o4-tryout .lnk { color:#4A9EFF; cursor:pointer; }
.o4-tryout .lnk:hover { text-decoration:underline; }
.o4-qrow { display:flex; align-items:center; gap:8px; background:rgba(20,23,28,.7); border:1px solid rgba(255,255,255,.05); border-radius:9px; padding:8px 11px; font-size:12px; cursor:pointer; transition:all .16s ease; }
.o4-qrow:hover { border-color:rgba(74,158,255,.4); background:rgba(74,158,255,.06); transform:translateX(2px); }
.o4-qrow .mono { font-family:ui-monospace,Consolas,monospace; color:#7FA8DE; font-size:10.5px; margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%; }
.o4-sites { display:flex; flex-wrap:wrap; gap:7px; }
.o4-site { display:flex; align-items:center; gap:7px; background:rgba(20,23,28,.7); border:1px solid rgba(255,255,255,.05); border-radius:10px; padding:5px 10px 5px 5px; font-size:12px; transition:border-color .16s ease; }
.o4-site:hover { border-color:rgba(255,255,255,.14); }
.o4-ava { width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex:none; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
.o4-ava img { width:15px; height:15px; }
.o4-st { font-size:10.5px; }
.o4-off { opacity:.55; }
.o4-sec { border:1px solid rgba(74,158,255,.3); background:linear-gradient(160deg,rgba(74,158,255,.09),rgba(74,158,255,.02) 55%); border-radius:14px; padding:14px 15px; box-shadow:0 8px 30px -14px rgba(74,158,255,.25); }
.o4-shield { width:44px; height:44px; border-radius:13px; background:linear-gradient(135deg,rgba(52,199,89,.16),rgba(52,199,89,.07)); border:1px solid rgba(52,199,89,.35); color:#4DDB7A; display:flex; align-items:center; justify-content:center; flex:none; box-shadow:0 0 18px -6px rgba(52,199,89,.5); }
.o4-shield .o4ic { width:21px; height:21px; }
.o4-cells { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:9px; }
.o4-cell { background:rgba(13,15,18,.55); border:1px solid rgba(255,255,255,.05); border-radius:10px; padding:8px 11px; transition:border-color .16s ease; }
.o4-cell:hover { border-color:rgba(255,255,255,.12); }
.o4-cell .l { font-size:10.5px; color:#5F6873; margin-bottom:2px; }
.o4-cell .v { font-size:12.5px; font-weight:600; }
.o4-cell .v.on { color:#4DDB7A; }
.o4-cell .v.mut { color:#9AA3AD; font-weight:400; font-size:11px; }
.o4-proof { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
.o4-proof span { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:#7FD89A; background:rgba(52,199,89,.08); border:1px solid rgba(52,199,89,.2); border-radius:999px; padding:2.5px 9px; transition:all .16s ease; }
.o4-proof span:hover { background:rgba(52,199,89,.14); }
.o4-proof .o4ic { width:10px; height:10px; stroke-width:2.2; }
.o4-modes { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px; }
.o4-mode { position:relative; background:rgba(20,23,28,.75); border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:9px 11px; cursor:pointer; transition:all .18s ease; }
.o4-mode:hover { border-color:rgba(255,255,255,.16); }
.o4-mode.on { border-color:rgba(74,158,255,.55); background:linear-gradient(160deg,rgba(74,158,255,.14),rgba(74,158,255,.04)); box-shadow:0 4px 16px -6px rgba(74,158,255,.35); }
.o4-mode .mi { display:flex; align-items:center; gap:6px; margin-bottom:2px; color:#8B95A5; }
.o4-mode.on .mi { color:#6FB0FF; }
.o4-mode b { font-size:12px; }
.o4-mode span { font-size:10px; color:#5F6873; line-height:1.45; display:block; margin-top:2px; }
.o4-mchk { position:absolute; top:7px; right:7px; width:15px; height:15px; border-radius:50%; background:linear-gradient(135deg,#4A9EFF,#3577E8); color:#fff; display:none; align-items:center; justify-content:center; box-shadow:0 2px 6px -1px rgba(74,158,255,.6); }
.o4-mode.on .o4-mchk { display:flex; }
.o4-sw { width:36px; height:20px; border-radius:999px; background:#3A414D; position:relative; flex:none; cursor:pointer; border:0; padding:0; transition:background .2s ease; }
.o4-sw::after { content:""; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:2px; left:2px; transition:left .2s cubic-bezier(.4,0,.2,1); box-shadow:0 1px 3px rgba(0,0,0,.4); }
.o4-sw.on { background:linear-gradient(135deg,#34C759,#2FA84F); }
.o4-sw.on::after { left:18px; }
.o4-row { display:flex; align-items:center; gap:8px; background:rgba(20,23,28,.7); border:1px solid rgba(255,255,255,.05); border-radius:11px; padding:8px 11px; transition:all .16s ease; }
.o4-row:hover { border-color:rgba(255,255,255,.13); background:rgba(26,30,37,.8); }
.o4-row .grow { flex:1; min-width:0; }
.o4-tt { font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.o4-dd { font-size:11px; color:#5F6873; margin-top:1px; }
.o4-hpts { display:flex; gap:3px; align-items:center; }
.o4-hp { width:7px; height:7px; border-radius:50%; background:#34C759; }
.o4-hp.f { background:#FF453A; }
.o4-hp.n { background:#313845; }
.o4-bdg { display:inline-flex; align-items:center; gap:4px; font-size:10px; border-radius:6px; padding:2px 7px; border:1px solid rgba(255,255,255,.08); color:#9AA3AD; background:rgba(31,36,45,.8); }
.o4-bdg.w { color:#FFB340; border-color:rgba(255,179,64,.3); background:rgba(255,179,64,.07); }
.o4-bdg.r { color:#FF8D85; border-color:rgba(255,69,58,.3); background:rgba(255,69,58,.07); }
.o4-bdg.b { color:#6FB0FF; border-color:rgba(74,158,255,.35); background:rgba(74,158,255,.12); }
.o4-bdg.b:hover { background:rgba(74,158,255,.22); }
.o4-bdg .hn2 { font-style:normal; font-size:8.5px; color:#C58AF9; margin-left:4px; font-family:ui-monospace,monospace; }
.o4-cron { font:10.5px ui-monospace,Consolas,monospace; color:#9AA3AD; background:rgba(13,15,18,.8); border:1px solid rgba(255,255,255,.07); border-radius:6px; padding:2px 7px; }
.o4-stat { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7.5px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:12px; }
.o4-stat:last-child { border-bottom:0; padding-bottom:2px; }
.o4-stat span { color:#8B95A5; }
.o4-stat b { font:500 11.5px ui-monospace,Consolas,monospace; color:#C6CFDA; }
.o4-vrow { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:12px; }
.o4-vrow:last-child { border-bottom:0; padding-bottom:2px; }
.o4-vrow .o4ic { color:#4DDB7A; width:12px; height:12px; }
.o4-vrow em { margin-left:auto; font-style:normal; font-size:9.5px; color:#4DDB7A; border:1px solid rgba(52,199,89,.28); border-radius:999px; padding:1px 7px; flex:none; }
.o4-hash { display:inline-block; font:10.5px ui-monospace,Consolas,monospace; color:#5F6873; background:rgba(13,15,18,.7); border:1px solid rgba(255,255,255,.06); border-radius:7px; padding:3px 9px; margin-top:8px; }
.o4-audit { display:flex; align-items:center; gap:8px; margin-top:11px; background:rgba(13,15,18,.6); border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:8px 12px; font-size:11.5px; color:#9AA3AD; flex-wrap:wrap; }
.o4-audit .lnk { margin-left:auto; color:#6FB0FF; display:flex; align-items:center; gap:4px; cursor:pointer; font-size:11.5px; }
.o4-acc { display:flex; align-items:center; gap:9px; padding:10px 13px; background:rgba(20,23,28,.7); border:1px solid rgba(255,255,255,.05); border-radius:11px; margin-bottom:8px; font-size:12.5px; color:#8B95A5; cursor:pointer; transition:all .16s ease; }
.o4-acc:hover { border-color:rgba(255,255,255,.13); color:#C7D6F5; }
.o4-acc b { color:#E8EAED; font-weight:600; }
.o4-acc .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:5px; font-size:11.5px; }
.o4-diagopen { background:linear-gradient(180deg,#1D222B,#191D24); border:1px solid rgba(255,69,58,.35); border-radius:13px; overflow:hidden; box-shadow:0 8px 28px -14px rgba(255,69,58,.25); }
.o4-diagopen .bar { display:flex; align-items:center; gap:8px; padding:10px 13px; background:rgba(255,69,58,.08); font-size:12px; color:#FF8D85; }
.o4-diagopen .bar .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
.o4-diagopen .body { padding:11px 13px; font-size:11.5px; color:#9AA3AD; }
.o4-kv { display:grid; grid-template-columns:105px 1fr; gap:3px 11px; font:11px/1.7 ui-monospace,Consolas,monospace; }
.o4-kv .k { color:#5F6873; }
.o4-kv .v { color:#C6CFDA; word-break:break-all; }
.o4-fixrow { display:flex; gap:8px; margin-top:9px; }
.o4-load { color:#5F6873; font-size:12px; padding:10px 0; }
.o4-skel { height:11px; border-radius:5px; background:linear-gradient(90deg,#1F242D,#262C37,#1F242D); background-size:200% 100%; animation:o4shimmer 1.4s linear infinite; margin:7px 0; }
@keyframes o4shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
.o4-note { font-size:10.5px; color:#5F6873; margin-top:8px; line-height:1.6; }
.o4-toast { position:fixed; right:16px; bottom:16px; background:linear-gradient(135deg,#34C759,#2FA84F); color:#06210D; font-size:12px; font-weight:600; border-radius:10px; padding:9px 15px; z-index:50; box-shadow:0 8px 24px -6px rgba(52,199,89,.5); animation:o4toast .25s ease; }
@keyframes o4toast { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
'''
src = src[:start] + new_css + src[end:]
io.open(P, 'w', encoding='utf-8', newline='\n').write(src)
print('premium css installed:', len(new_css), 'chars')
