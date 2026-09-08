window.__ModuleLoader__.load({
	id: "dsh-intelhub",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// .build-tools/tmp-src/client.js
		var client_exports = {};
		__export(client_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(client_exports);
		var import_react = require("react");
		var inject = [
		  "betterSidebar",
		  "slots"
		];
		async function rpc(method, args = {}) {
		  try {
		    const res = await fetch(`/api/intelhub/${method}`, {
		      method: "POST",
		      headers: {
		        "Content-Type": "application/json"
		      },
		      body: JSON.stringify({
		        type: "client-request",
		        rpcId: globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
		        method: `intelhub/${method}`,
		        // host 方法都是单参数 p 的 SRC 签名:args 必须按形参名包一层
		        payload: {
		          args: Object.keys(args).length > 0 ? {
		            p: args
		          } : args
		        }
		      })
		    });
		    const msg = await res.json();
		    if (msg.result !== void 0 && msg.result.ok) return {
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
		var CSS = `
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
		`;
		function Panel() {
		  const [status, setStatus] = (0, import_react.useState)(null);
		  const [list, setList] = (0, import_react.useState)(null);
		  const [path, setPath] = (0, import_react.useState)("");
		  const [query, setQuery] = (0, import_react.useState)("");
		  const [results, setResults] = (0, import_react.useState)(null);
		  const [busyImport, setBusyImport] = (0, import_react.useState)(false);
		  const [busySearch, setBusySearch] = (0, import_react.useState)(false);
		  const [err, setErr] = (0, import_react.useState)(null);
		  const [demo, setDemo] = (0, import_react.useState)(null);
		  const [busyDemo, setBusyDemo] = (0, import_react.useState)(false);
		  const [dragOn, setDragOn] = (0, import_react.useState)(false);
		  const [workspaces, setWorkspaces] = (0, import_react.useState)([]);
		  const [wsPath, setWsPath] = (0, import_react.useState)("");
		  const [schedules, setSchedules] = (0, import_react.useState)([]);
		  const [schedName, setSchedName] = (0, import_react.useState)("");
		  const [schedEvery, setSchedEvery] = (0, import_react.useState)("30");
		  const [authorF, setAuthorF] = (0, import_react.useState)("");
		  const [stageF, setStageF] = (0, import_react.useState)("");
		  const [dash, setDash] = (0, import_react.useState)(null);
		  const TEXTLIKE = /\.(md|markdown|txt|log|csv|json|ya?ml|xml|html?|ts|tsx|js|mjs|cjs|py|go|rs|java|c|h|cpp|sh)$/i;
		  const readFiles = async (fl) => {
		    const out = [];
		    for (const f of Array.from(fl)) {
		      if (!TEXTLIKE.test(f.name)) continue;
		      out.push({
		        name: f.name,
		        text: await f.text()
		      });
		    }
		    return out;
		  };
		  const doUpload = async (fl) => {
		    const files = await readFiles(fl);
		    if (files.length === 0) {
		      setErr("\u53EA\u8BC6\u522B\u6587\u672C\u7C7B\u6587\u4EF6(md/txt/json/\u4EE3\u7801\u7B49);PDF\u3001Word \u8BF7\u7528\u4E0B\u65B9\u8DEF\u5F84\u5BFC\u5165\u3002");
		      return;
		    }
		    setErr(null);
		    const r = await rpc("upload", {
		      files
		    });
		    if (r.ok && r.value !== void 0 && r.value.ok) await refresh();
		    else setErr(r.value?.error ?? r.error?.message ?? "\u4E0A\u4F20\u5931\u8D25");
		  };
		  const doDemo = async () => {
		    setBusyDemo(true);
		    setErr(null);
		    const r = await rpc("demo");
		    if (r.ok && r.value !== void 0 && r.value.ok) setDemo(r.value);
		    else setErr(r.value?.error ?? r.error?.message ?? "\u6F14\u793A\u5931\u8D25");
		    setBusyDemo(false);
		    await refresh();
		  };
		  const refresh = async () => {
		    const s = await rpc("status");
		    if (s.ok && s.value !== void 0) setStatus(s.value);
		    const l = await rpc("list");
		    if (l.ok && l.value !== void 0) setList(l.value);
		    const w = await rpc("workspace-list");
		    if (w.ok && w.value !== void 0) setWorkspaces(w.value.workspaces);
		    const sc = await rpc("schedule-list");
		    if (sc.ok && sc.value !== void 0) setSchedules(sc.value.schedules);
		    const d = await rpc("dashboard");
		    if (d.ok && d.value !== void 0) setDash(d.value);
		  };
		  (0, import_react.useEffect)(() => {
		    void refresh();
		  }, []);
		  (0, import_react.useEffect)(() => {
		    if (status === null || status.indexing === 0) return;
		    const t = window.setInterval(() => {
		      void refresh();
		    }, 1500);
		    return () => window.clearInterval(t);
		  }, [
		    status?.indexing
		  ]);
		  const doImport = async () => {
		    if (path.trim() === "") return;
		    setBusyImport(true);
		    setErr(null);
		    const r = await rpc("import", {
		      path
		    });
		    if (r.ok && r.value !== void 0 && r.value.ok) {
		      setPath("");
		      await refresh();
		    } else {
		      setErr(r.value?.error ?? r.error?.message ?? "\u5BFC\u5165\u5931\u8D25");
		    }
		    setBusyImport(false);
		  };
		  const doSearch = async () => {
		    if (query.trim() === "") return;
		    setBusySearch(true);
		    setErr(null);
		    const args = {
		      query,
		      topk: 5
		    };
		    if (authorF.trim() !== "") args.author = authorF.trim();
		    if (stageF.trim() !== "") args.stage = stageF.trim();
		    const r = await rpc("search", args);
		    if (r.ok && r.value !== void 0) setResults(r.value);
		    else setErr(r.error?.message ?? "\u68C0\u7D22\u5931\u8D25");
		    setBusySearch(false);
		  };
		  const doWsAdd = async () => {
		    if (wsPath.trim() === "") return;
		    const r = await rpc("workspace-add", {
		      path: wsPath
		    });
		    if (r.ok && r.value !== void 0 && r.value.ok) setWsPath("");
		    else setErr(r.value?.error ?? r.error?.message ?? "\u6CE8\u518C\u5931\u8D25");
		    await refresh();
		  };
		  const doWsRemove = async (p) => {
		    await rpc("workspace-remove", {
		      path: p
		    });
		    await refresh();
		  };
		  const doSchedAdd = async () => {
		    if (schedName.trim() === "") return;
		    const r = await rpc("schedule-set", {
		      name: schedName,
		      kind: "interval",
		      everyMin: Number(schedEvery) || 30
		    });
		    if (!(r.ok && r.value !== void 0 && r.value.ok)) setErr(r.value?.error ?? r.error?.message ?? "\u8BBE\u7F6E\u5931\u8D25");
		    setSchedName("");
		    await refresh();
		  };
		  const doSchedToggle = async (name, enabled) => {
		    await rpc("schedule-toggle", {
		      name,
		      enabled
		    });
		    await refresh();
		  };
		  const doSchedRemove = async (name) => {
		    await rpc("schedule-remove", {
		      name
		    });
		    await refresh();
		  };
		  const [removing, setRemoving] = (0, import_react.useState)("");
		  const doRemove = async (p) => {
		    if (!window.confirm("\u4ECE\u77E5\u8BC6\u5E93\u79FB\u9664\u300C" + p.split(/[\\/]/).pop() + "\u300D?(\u539F\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD)")) return;
		    setRemoving(p);
		    const r = await rpc("remove", {
		      path: p
		    });
		    setRemoving("");
		    if (!(r.ok && r.value !== void 0 && r.value.ok)) setErr(r.value?.error ?? r.error?.message ?? "\u5220\u9664\u5931\u8D25");
		    await refresh();
		  };
		  const modelDot = status?.model === "ready" ? "zkb-ok" : status?.model === "loading" ? "zkb-mid" : "zkb-bad";
		  const modelText = status?.model === "ready" ? "\u5C31\u7EEA(\u672C\u5730 e5-small)" : status?.model === "loading" ? "\u52A0\u8F7D\u4E2D\u2026" : "\u4E0D\u53EF\u7528";
		  const hitLines = (results?.hits ?? []).map((h, i) => {
		    const bar = results !== null && results.hits.length > 0 ? Math.max(6, Math.round(h.score / results.hits[0].score * 100)) : 0;
		    return (0, import_react.createElement)("div", {
		      className: "zkb-hit",
		      key: i
		    }, (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "zkb-hitref"
		    }, h.ref), (0, import_react.createElement)("span", {
		      className: "zkb-hitscore"
		    }, `\u76F8\u5173\u5EA6 ${bar}%`)), (0, import_react.createElement)("div", {
		      className: "zkb-hitsnip"
		    }, h.text.length > 260 ? h.text.slice(0, 260) + "\u2026" : h.text));
		  });
		  return (0, import_react.createElement)(
		    "div",
		    {
		      className: "zkb"
		    },
		    (0, import_react.createElement)("style", null, CSS),
		    // ── 页头 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-head"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-icon"
		    }, "IH"), (0, import_react.createElement)("div", {
		      style: {
		        minWidth: 0
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-title"
		    }, "\u60C5\u62A5\u7AD9 IntelHub"), (0, import_react.createElement)("div", {
		      className: "zkb-desc"
		    }, "\u5237\u5230\u7684\u4FE1\u606F\u81EA\u52A8\u6C89\u6DC0\u4E3A\u53EF\u68C0\u7D22\u7684\u77E5\u8BC6:\u91C7\u96C6/\u6587\u4EF6\u5939/\u7F51\u9875/\u7B14\u8BB0 \u2192 \u8BED\u4E49+\u5173\u952E\u8BCD\u6DF7\u5408\u68C0\u7D22\u5E26\u51FA\u5904 \u2192 Obsidian \u53CD\u54FA\u3002\u96F6\u5B88\u62A4\u8FDB\u7A0B\xB7\u96F6 API key\xB7\u6587\u6863\u4E0D\u51FA\u672C\u673A\u3002"))),
		    err !== null ? (0, import_react.createElement)("div", {
		      className: "zkb-err"
		    }, err) : null,
		    // ── 仪表盘卡 ──
		    dash !== null && dash.ok ? (0, import_react.createElement)(
		      "div",
		      {
		        className: "zkb-card"
		      },
		      (0, import_react.createElement)("div", {
		        className: "zkb-srow"
		      }, (0, import_react.createElement)("span", {
		        className: "zkb-sk"
		      }, "\u77E5\u8BC6\u5E93\u4EEA\u8868\u76D8"), (0, import_react.createElement)("span", {
		        className: "zkb-badge",
		        style: {
		          marginLeft: "auto"
		        }
		      }, `\u4ECA\u65E5 +${dash.totals.todayFiles}`), dash.totals.rawPending > 0 ? (0, import_react.createElement)("span", {
		        className: "zkb-badge",
		        style: {
		          background: "rgba(255,165,61,0.15)",
		          color: "#E8A33D"
		        }
		      }, `\u5F85\u5206\u8BCA ${dash.totals.rawPending}`) : null),
		      // 14 天采集趋势(SVG 迷你柱状)
		      (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          alignItems: "flex-end",
		          gap: "4px",
		          height: "80px",
		          padding: "10px 4px 0"
		        }
		      }, ...(() => {
		        const max = Math.max(...dash.daily.map((d) => d.chunks), 1);
		        return dash.daily.map((d) => (0, import_react.createElement)("div", {
		          key: d.date,
		          title: `${d.date} \xB7 ${d.files} \u7BC7 / ${d.chunks} \u5757`,
		          style: {
		            flex: 1,
		            display: "flex",
		            flexDirection: "column",
		            justifyContent: "flex-end",
		            height: "100%",
		            alignItems: "center",
		            gap: "4px"
		          }
		        }, (0, import_react.createElement)("span", {
		          style: {
		            fontSize: "9px",
		            color: "#9A9EA8"
		          }
		        }, d.chunks > 0 ? String(d.chunks) : ""), (0, import_react.createElement)("div", {
		          style: {
		            width: "70%",
		            height: `${Math.max(3, d.chunks / max * 56)}px`,
		            background: d.chunks > 0 ? "linear-gradient(180deg,#4A9EFF,#2b5e9e)" : "#26262A",
		            borderRadius: "3px 3px 0 0"
		          }
		        }), (0, import_react.createElement)("span", {
		          style: {
		            fontSize: "8px",
		            color: "#6b7078",
		            transform: "rotate(-45deg)"
		          }
		        }, d.date.slice(5))));
		      })()),
		      (0, import_react.createElement)("div", {
		        style: {
		          fontSize: "11px",
		          color: "#6b7078",
		          padding: "2px 4px 8px"
		        }
		      }, "\u8FD1 14 \u5929\u91C7\u96C6\u8D8B\u52BF(\u5757)"),
		      // 渠道分布(水平堆叠条)
		      (0, import_react.createElement)("div", {
		        style: {
		          padding: "0 4px 10px"
		        }
		      }, (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          height: "14px",
		          borderRadius: "7px",
		          overflow: "hidden",
		          background: "#1C1C1F"
		        }
		      }, ...(() => {
		        const colors = [
		          "#4A9EFF",
		          "#E8A33D",
		          "#5BA8A0",
		          "#B48EAD",
		          "#8A8F98"
		        ];
		        const total = Math.max(dash.bySrc.reduce((s2, x) => s2 + x.chunks, 0), 1);
		        return dash.bySrc.map((x, i) => (0, import_react.createElement)("div", {
		          key: x.k,
		          title: `${x.k} \xB7 ${x.chunks} \u5757`,
		          style: {
		            width: `${x.chunks / total * 100}%`,
		            background: colors[i % colors.length]
		          }
		        }));
		      })()), (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          flexWrap: "wrap",
		          gap: "10px",
		          marginTop: "6px"
		        }
		      }, ...dash.bySrc.slice(0, 5).map((x, i) => {
		        const colors = [
		          "#4A9EFF",
		          "#E8A33D",
		          "#5BA8A0",
		          "#B48EAD",
		          "#8A8F98"
		        ];
		        return (0, import_react.createElement)("span", {
		          key: x.k,
		          style: {
		            fontSize: "10px",
		            color: "#9A9EA8"
		          }
		        }, "\u25A0 ", colors[i % colors.length] === "#4A9EFF" ? "" : "", `${x.k} \xB7 ${x.chunks}\u5757`);
		      }))),
		      // TOP 作者榜
		      dash.topAuthors.length > 0 ? (0, import_react.createElement)("div", {
		        style: {
		          padding: "0 4px 10px"
		        }
		      }, (0, import_react.createElement)("div", {
		        style: {
		          fontSize: "11px",
		          color: "#6b7078",
		          marginBottom: "4px"
		        }
		      }, "TOP \u4F5C\u8005(\u6309\u6700\u9AD8\u8D5E)"), ...dash.topAuthors.slice(0, 5).map((a, i) => (0, import_react.createElement)("div", {
		        key: a.author,
		        style: {
		          display: "flex",
		          alignItems: "center",
		          gap: "8px",
		          padding: "3px 0"
		        }
		      }, (0, import_react.createElement)("span", {
		        style: {
		          fontSize: "11px",
		          color: "#6b7078",
		          width: "16px"
		        }
		      }, `${i + 1}.`), (0, import_react.createElement)("span", {
		        style: {
		          fontSize: "12px",
		          color: "#ECEAE4",
		          flex: 1,
		          overflow: "hidden",
		          textOverflow: "ellipsis",
		          whiteSpace: "nowrap"
		        }
		      }, a.author), (0, import_react.createElement)("span", {
		        style: {
		          fontSize: "11px",
		          color: "#9A9EA8"
		        }
		      }, `${a.files} \u7BC7 \xB7 \u2665${a.likes}`)))) : null
		    ) : null,
		    // ── 状态卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u5DF2\u5BFC\u5165"), (0, import_react.createElement)("span", {
		      className: "zkb-sv"
		    }, `${status?.files ?? "\u2013"} \u4E2A\u6587\u4EF6 \xB7 ${status?.chunks ?? "\u2013"} \u5757`), status !== null && status.indexing > 0 ? (0, import_react.createElement)("span", {
		      className: "zkb-badge"
		    }, `\u7D22\u5F15\u4E2D ${status.indexing}`) : null), (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u68C0\u7D22\u6A21\u578B"), (0, import_react.createElement)("span", {
		      className: `zkb-dot ${modelDot}`
		    }), (0, import_react.createElement)("span", {
		      className: "zkb-sv"
		    }, modelText), (0, import_react.createElement)("span", {
		      className: "zkb-hint",
		      style: {
		        marginLeft: "auto"
		      }
		    }, "\u9996\u6B21\u5BFC\u5165\u65F6\u81EA\u52A8\u4E0B\u8F7D(\u7EA6 30MB),\u5168\u7A0B\u672C\u673A"))),
		    // ── 空态演示卡(知识库为空时)──
		    status === null || status.files === 0 && status.chunks === 0 && status.indexing === 0 ? (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u7B2C\u4E00\u6B21\u7528?"), (0, import_react.createElement)("span", {
		      className: "zkb-hint",
		      style: {
		        flex: 1
		      }
		    }, '30 \u79D2\u770B\u61C2\u8BED\u4E49\u68C0\u7D22\u548C\u5173\u952E\u8BCD\u68C0\u7D22\u7684\u5DEE\u522B\u2014\u2014\u5BFC\u5165\u4E00\u4EFD\u6837\u4F8B\u624B\u518C,\u95EE\u4E00\u4E2A\u6587\u6863\u91CC"\u6CA1\u5199\u8FC7"\u7684\u95EE\u9898\u3002'), (0, import_react.createElement)("button", {
		      className: "zkb-btn zkb-btn-pri",
		      disabled: busyDemo,
		      onClick: () => {
		        void doDemo();
		      }
		    }, busyDemo ? "\u51C6\u5907\u4E2D\u2026" : "\u770B\u6F14\u793A")), demo !== null && demo.ok ? (0, import_react.createElement)("div", {
		      className: "zkb-srow",
		      style: {
		        display: "block"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-hint"
		    }, `\u67E5\u8BE2\u300C${demo.query}\u300D\u2014\u2014\u6837\u4F8B\u624B\u518C\u91CC\u5199\u7684\u662F"30 \u79D2\u5185\u65E0\u54CD\u5E94\u5219\u4F1A\u8BDD\u4E2D\u65AD",\u6CA1\u6709"\u8D85\u65F6"\u4E8C\u5B57:`), (0, import_react.createElement)("div", {
		      style: {
		        marginTop: 8
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-demo-tag zkb-demo-no"
		    }, `\u5173\u952E\u8BCD\u68C0\u7D22 ${demo.fts.length} \u6761`), demo.fts.length > 0 ? (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, demo.fts.map((h) => h.ref).join(" ")) : null), (0, import_react.createElement)("div", {
		      style: {
		        marginTop: 6
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-demo-tag zkb-demo-yes"
		    }, `\u8BED\u4E49\u6DF7\u5408\u68C0\u7D22 ${demo.hybrid.length} \u6761`), demo.hybrid.slice(0, 2).map((h, i) => (0, import_react.createElement)("div", {
		      key: i,
		      style: {
		        marginTop: 6
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-hitref"
		    }, h.ref), (0, import_react.createElement)("div", {
		      className: "zkb-hitsnip"
		    }, h.text.length > 120 ? h.text.slice(0, 120) + "\u2026" : h.text))))) : null) : null,
		    // ── 导入卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("div", {
		      className: `zkb-drop${dragOn ? " zkb-drop-on" : ""}`,
		      onClick: () => {
		        const inp = document.createElement("input");
		        inp.type = "file";
		        inp.multiple = true;
		        inp.onchange = () => {
		          if (inp.files !== null) void doUpload(inp.files);
		        };
		        inp.click();
		      },
		      onDragOver: (e) => {
		        e.preventDefault();
		        setDragOn(true);
		      },
		      onDragLeave: () => setDragOn(false),
		      onDrop: (e) => {
		        e.preventDefault();
		        setDragOn(false);
		        if (e.dataTransfer?.files !== void 0 && e.dataTransfer.files.length > 0) void doUpload(e.dataTransfer.files);
		      }
		    }, "\u62D6\u5165\u6587\u4EF6(\u53EF\u591A\u9009,md/txt/json/\u4EE3\u7801)\u6216\u70B9\u51FB\u9009\u62E9"), (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u6216\u8F93\u5165\u8DEF\u5F84(\u6587\u4EF6\u5939/\u5355\u4E2A\u6587\u4EF6,\u652F\u6301 ~;PDF\u3001Word \u8D70\u8FD9\u91CC)",
		      value: path,
		      onChange: (e) => setPath(e.target.value),
		      onKeyDown: (e) => {
		        if (e.key === "Enter") void doImport();
		      }
		    }), (0, import_react.createElement)("button", {
		      className: "zkb-btn zkb-btn-pri",
		      disabled: busyImport || path.trim() === "",
		      onClick: () => {
		        void doImport();
		      }
		    }, busyImport ? "\u5BFC\u5165\u4E2D\u2026" : "\u5BFC\u5165")), (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, "Obsidian \u5E93\u76F4\u63A5\u586B\u5E93\u76EE\u5F55(\u81EA\u52A8\u8DF3\u8FC7 .obsidian \u5185\u90E8\u6587\u4EF6);\u7F51\u9875\u8BA9 agent \u7528 kb_import_url \u5B58\u6863;\u5BF9\u8BDD\u91CC\u7684\u957F\u6587/\u5FAE\u535A\u7B49\u793E\u4EA4\u5185\u5BB9\u7531 agent \u7ECF kb_note \u5199\u5165\u3002\u91CD\u590D\u5BFC\u5165\u53EA\u5904\u7406\u65B0\u589E\u4E0E\u53D8\u66F4\u3002"))),
		    // ── 检索预览卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: '\u8BD5\u8BD5\u8BED\u4E49\u68C0\u7D22:\u6362\u4E2A\u8BF4\u6CD5\u4E5F\u80FD\u627E\u5230(\u5982"\u600E\u4E48\u914D\u7F6E\u8D85\u65F6\u65F6\u95F4")',
		      value: query,
		      onChange: (e) => setQuery(e.target.value),
		      onKeyDown: (e) => {
		        if (e.key === "Enter") void doSearch();
		      }
		    }), (0, import_react.createElement)("button", {
		      className: "zkb-btn",
		      disabled: busySearch || query.trim() === "",
		      onClick: () => {
		        void doSearch();
		      }
		    }, busySearch ? "\u68C0\u7D22\u4E2D\u2026" : "\u68C0\u7D22")), (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u4F5C\u8005\u8FC7\u6EE4(\u5982 \u5B9D\u7389xp,\u53EF\u7A7A)",
		      value: authorF,
		      onChange: (e) => setAuthorF(e.target.value)
		    }), (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u9636\u6BB5\u8FC7\u6EE4(selected/raw,\u53EF\u7A7A)",
		      value: stageF,
		      onChange: (e) => setStageF(e.target.value)
		    })), results !== null && results.hits.length > 0 ? (0, import_react.createElement)("div", {
		      className: "zkb-srow",
		      style: {
		        display: "block"
		      }
		    }, ...hitLines) : results !== null ? (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, `\u6CA1\u6709\u5339\u914D${results.note !== void 0 && results.note !== "" ? `(${results.note})` : ""}`)) : null),
		    // ── workspace 常驻目录卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u5E38\u9A7B\u76EE\u5F55"), (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, "\u6CE8\u518C\u540E\u81EA\u52A8\u8DDF\u968F:\u91C7\u96C6\u811A\u672C\u843D\u76D8 \u2192 \u589E\u91CF\u7D22\u5F15 \u2192 \u5373\u523B\u53EF\u95EE")), ...workspaces.map((w) => (0, import_react.createElement)("div", {
		      className: "zkb-frow",
		      key: w.path
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-dot zkb-ok"
		    }), (0, import_react.createElement)("span", {
		      className: "zkb-fpath",
		      title: w.path
		    }, w.label + " \xB7 " + w.path), (0, import_react.createElement)("button", {
		      className: "zkb-btn",
		      style: {
		        padding: "4px 10px",
		        fontSize: "11px"
		      },
		      onClick: () => {
		        void doWsRemove(w.path);
		      }
		    }, "\u79FB\u9664"))), (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u65B0\u589E\u5E38\u9A7B\u76EE\u5F55(\u7EDD\u5BF9\u8DEF\u5F84,\u5982 D:/knowledge-base/collections)",
		      value: wsPath,
		      onChange: (e) => setWsPath(e.target.value),
		      onKeyDown: (e) => {
		        if (e.key === "Enter") void doWsAdd();
		      }
		    }), (0, import_react.createElement)("button", {
		      className: "zkb-btn zkb-btn-pri",
		      disabled: wsPath.trim() === "",
		      onClick: () => {
		        void doWsAdd();
		      }
		    }, "\u6CE8\u518C"))),
		    // ── 定时任务卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u5B9A\u65F6\u4EFB\u52A1"), (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, "\u91CD\u542F\u4E0D\u4E22;agent \u53EF\u7ECF kb_schedule \u8BBE\u7F6E(\u5982\u6309\u53D1\u535A\u8282\u594F\u5B9A\u65F6\u626B\u63CF)")), ...schedules.map((sc) => (0, import_react.createElement)("div", {
		      className: "zkb-frow",
		      key: sc.name
		    }, (0, import_react.createElement)("span", {
		      className: `zkb-dot ${sc.enabled === true ? "zkb-ok" : "zkb-mid"}`
		    }), (0, import_react.createElement)("span", {
		      className: "zkb-fpath"
		    }, sc.name + " \xB7 " + (sc.kind === "daily" ? `\u6BCF\u5929 ${sc.at ?? ""}` : `\u6BCF ${sc.everyMin ?? "?"} \u5206\u949F`) + " \xB7 scan"), (0, import_react.createElement)("button", {
		      className: "zkb-btn",
		      style: {
		        padding: "4px 10px",
		        fontSize: "11px"
		      },
		      onClick: () => {
		        void doSchedToggle(sc.name, !(sc.enabled === true));
		      }
		    }, sc.enabled === true ? "\u505C\u7528" : "\u542F\u7528"), (0, import_react.createElement)("button", {
		      className: "zkb-btn",
		      style: {
		        padding: "4px 10px",
		        fontSize: "11px"
		      },
		      onClick: () => {
		        void doSchedRemove(sc.name);
		      }
		    }, "\u5220\u9664"))), (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u4EFB\u52A1\u540D(\u5982 \u6668\u95F4\u626B\u63CF)",
		      value: schedName,
		      onChange: (e) => setSchedName(e.target.value)
		    }), (0, import_react.createElement)("input", {
		      className: "zkb-input",
		      placeholder: "\u95F4\u9694\u5206\u949F",
		      value: schedEvery,
		      onChange: (e) => setSchedEvery(e.target.value),
		      style: {
		        maxWidth: "110px"
		      }
		    }), (0, import_react.createElement)("button", {
		      className: "zkb-btn zkb-btn-pri",
		      disabled: schedName.trim() === "",
		      onClick: () => {
		        void doSchedAdd();
		      }
		    }, "\u6DFB\u52A0"))),
		    // ── 文件列表卡 ──
		    (0, import_react.createElement)("div", {
		      className: "zkb-card"
		    }, (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-sk"
		    }, "\u5DF2\u5BFC\u5165\u6587\u4EF6"), (0, import_react.createElement)("span", {
		      className: "zkb-hint",
		      style: {
		        marginLeft: "auto"
		      }
		    }, "\u5220\u9664\u5373\u4ECE\u7D22\u5F15\u79FB\u9664,\u539F\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD")), (list?.files ?? []).length === 0 ? (0, import_react.createElement)("div", {
		      className: "zkb-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "zkb-hint"
		    }, "\u8FD8\u6CA1\u6709\u5BFC\u5165\u6587\u4EF6\u3002")) : (0, import_react.createElement)("div", {
		      className: "zkb-files"
		    }, ...(list?.files ?? []).map((f) => (0, import_react.createElement)("div", {
		      className: "zkb-frow",
		      key: f.path
		    }, (0, import_react.createElement)("span", {
		      className: `zkb-dot ${f.status === "done" ? "zkb-ok" : f.status === "failed" ? "zkb-bad" : "zkb-mid"}`
		    }), (0, import_react.createElement)("span", {
		      className: "zkb-fpath",
		      title: f.error !== void 0 ? f.error : f.path
		    }, f.path), (0, import_react.createElement)("span", {
		      className: "zkb-fmeta"
		    }, f.status === "done" ? `${f.chunks} \u5757` : f.status === "indexing" ? "\u7D22\u5F15\u4E2D" : "\u5931\u8D25"), (0, import_react.createElement)("button", {
		      className: "zkb-btn",
		      style: {
		        padding: "4px 10px",
		        fontSize: "11px"
		      },
		      disabled: removing === f.path,
		      onClick: () => {
		        void doRemove(f.path);
		      }
		    }, removing === f.path ? "\u79FB\u9664\u4E2D" : "\u5220\u9664")))))
		  );
		}
		function apply(ctx) {
		  const slots = ctx.slots;
		  slots.inject("settings.section", () => slots.register({
		    name: "settings.section",
		    id: "zvec-kb",
		    order: 42,
		    label: "\u60C5\u62A5\u7AD9"
		  }, () => (0, import_react.createElement)(Panel)));
		  const bsApi = ctx.betterSidebar;
		  if (bsApi !== void 0) {
		    try {
		      bsApi.registerTab({
		        id: "dsh-intelhub:kb",
		        title: () => "\u60C5\u62A5\u7AD9",
		        icon: (0, import_react.createElement)("span", {
		          style: {
		            fontWeight: "800",
		            fontSize: "13px"
		          }
		        }, "IH"),
		        order: 50,
		        component: () => (0, import_react.createElement)(SidebarKB)
		      });
		    } catch {
		    }
		  }
		}
		function SidebarKB() {
		  const [query, setQuery] = (0, import_react.useState)("");
		  const [results, setResults] = (0, import_react.useState)(null);
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [today, setToday] = (0, import_react.useState)(null);
		  const doSearch = async () => {
		    if (query.trim() === "") return;
		    setBusy(true);
		    const r = await rpc("search", {
		      query,
		      topk: 5
		    });
		    if (r.ok && r.value !== void 0) setResults(r.value);
		    setBusy(false);
		  };
		  const loadToday = async () => {
		    const r = await rpc("today", {});
		    if (r.ok && r.value !== void 0) setToday(r.value.text);
		  };
		  (0, import_react.useEffect)(() => {
		    void loadToday();
		  }, []);
		  const hits = (results?.hits ?? []).map((h, i) => (0, import_react.createElement)("div", {
		    key: i,
		    style: {
		      padding: "8px 0",
		      borderBottom: "1px solid rgba(255,255,255,0.06)"
		    }
		  }, (0, import_react.createElement)("div", {
		    style: {
		      fontSize: "12px",
		      color: "#4A9EFF",
		      wordBreak: "break-all"
		    }
		  }, h.ref), (0, import_react.createElement)("div", {
		    style: {
		      fontSize: "12px",
		      color: "#C9C9CE",
		      marginTop: "4px",
		      lineHeight: 1.5
		    }
		  }, h.text.length > 140 ? h.text.slice(0, 140) + "\u2026" : h.text)));
		  return (0, import_react.createElement)("div", {
		    style: {
		      padding: "12px",
		      display: "flex",
		      flexDirection: "column",
		      gap: "10px",
		      height: "100%",
		      boxSizing: "border-box",
		      overflow: "auto"
		    }
		  }, (0, import_react.createElement)("div", {
		    style: {
		      fontWeight: 700,
		      fontSize: "15px"
		    }
		  }, "\u60C5\u62A5\u7AD9"), (0, import_react.createElement)("div", {
		    style: {
		      display: "flex",
		      gap: "8px"
		    }
		  }, (0, import_react.createElement)("input", {
		    placeholder: "\u8BED\u4E49\u68C0\u7D22(\u5E26\u51FA\u5904)",
		    value: query,
		    onChange: (e) => setQuery(e.target.value),
		    onKeyDown: (e) => {
		      if (e.key === "Enter") void doSearch();
		    },
		    style: {
		      flex: 1,
		      background: "#1C1C1F",
		      border: "1px solid rgba(255,255,255,0.09)",
		      color: "#ECEAE4",
		      borderRadius: "8px",
		      padding: "7px 10px",
		      fontSize: "13px",
		      outline: "none"
		    }
		  }), (0, import_react.createElement)("button", {
		    onClick: () => {
		      void doSearch();
		    },
		    disabled: busy || query.trim() === "",
		    style: {
		      background: "#4A9EFF",
		      color: "#fff",
		      border: "none",
		      borderRadius: "8px",
		      padding: "0 14px",
		      cursor: "pointer"
		    }
		  }, busy ? "\u2026" : "\u68C0\u7D22")), (0, import_react.createElement)("div", {
		    style: {
		      fontSize: "12px",
		      color: "#9A9EA8",
		      whiteSpace: "pre-wrap",
		      background: "rgba(255,255,255,0.03)",
		      borderRadius: "8px",
		      padding: "10px"
		    }
		  }, today ?? "\u4ECA\u65E5\u6982\u89C8\u52A0\u8F7D\u4E2D\u2026"), ...hits.length > 0 ? [
		    (0, import_react.createElement)("div", null, ...hits)
		  ] : [
		    (0, import_react.createElement)("div", {
		      style: {
		        fontSize: "12px",
		        color: "#9A9EA8"
		      }
		    }, results === null ? "\u8F93\u5165\u68C0\u7D22\u8BCD\u5F00\u59CB\u3002" : "\u6CA1\u6709\u5339\u914D\u3002")
		  ]);
		}
		// Annotate the CommonJS export names for ESM import in node:
		0 && (module.exports = {
		  apply,
		  inject
		});

		return module.exports;
	}
});
