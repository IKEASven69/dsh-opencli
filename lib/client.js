window.__ModuleLoader__.load({
	id: "dsh-opencli",
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
		  "slots"
		];
		async function rpc(method, args = {}) {
		  try {
		    const res = await fetch(`/api/opencli/${method}`, {
		      method: "POST",
		      headers: {
		        "Content-Type": "application/json"
		      },
		      body: JSON.stringify({
		        type: "client-request",
		        rpcId: globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
		        method: `opencli/${method}`,
		        payload: {
		          args
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
		.ocp { display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #F0F0F2; }
		.ocp-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
		/* \u2500\u2500 \u9875\u5934:iOS \u8BBE\u7F6E\u5F0F(\u56FE\u6807 + \u5927\u6807\u9898 + \u63CF\u8FF0)\u2500\u2500 */
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
		/* \u2500\u2500 \u8BBE\u7F6E\u5361\u7247(\u7CFB\u7EDF\u9875\u6837\u5F0F:\u5206\u7EC4\u5361 + \u5206\u9694\u884C)\u2500\u2500 */
		.ocp-card { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; padding: 4px 18px; }
		.ocp-srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
		.ocp-srow:last-child { border-bottom: none; }
		.ocp-sk { color: #9A9AA0; flex: none; }
		.ocp-sv { color: #F0F0F2; }
		.ocp-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
		.ocp-ok { background: #34C759; }
		.ocp-bad { background: #FF453A; }
		.ocp-mid { background: #9A9AA0; }
		.ocp-hint { font-size: 11.5px; color: #9A9AA0; }
		.ocp-login { max-height: 260px; overflow: auto; }
		.ocp-lrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12.5px; }
		.ocp-lrow:last-child { border-bottom: none; }
		.ocp-lsite { flex: none; min-width: 96px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-weight: 600; }
		.ocp-ldetail { flex: 1; min-width: 0; color: #9A9AA0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.ocp-link { color: #4A9EFF; font-size: 12px; text-decoration: none; }
		.ocp-link:hover { text-decoration: underline; }
		.ocp-code { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; color: #C9C9CF;
		  background: #1E1E20; border-radius: 6px; padding: 2px 8px; display: inline-block; }
		.ocp-err { font-size: 12px; color: #FF6B5E; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; word-break: break-all; line-height: 1.5; }
		/* \u2500\u2500 \u5B89\u88C5\u5F15\u5BFC(\u7CFB\u7EDF\u9875\u6062\u590D\u64CD\u4F5C\u6837\u5F0F;\u53EF\u6298\u53E0)\u2500\u2500 */
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
		/* \u2500\u2500 \u547D\u4EE4\u96C6\u5408:\u5206\u6BB5 tab(\u9AD8 42,\u5DE6\u5BF9\u9F50\u76F8\u90BB)\u2500\u2500 */
		.ocp-tabs { display: flex; gap: 6px; }
		.ocp-tab { cursor: pointer; border: none; background: transparent; color: #9A9AA0; font-size: 13px;
		  padding: 9px 15px; border-radius: 9px; display: inline-flex; gap: 7px; align-items: center; transition: background .15s; }
		.ocp-tab b { font-weight: 600; font-size: 12px; opacity: .85; }
		.ocp-tab:hover { background: #303036; color: #C9C9CF; }
		.ocp-tab-on { background: #1E3A5F; color: #EAF2FF; }
		.ocp-tab-on:hover { background: #1E3A5F; color: #EAF2FF; }
		.ocp-tab-on b { opacity: .8; }
		/* \u2500\u2500 \u641C\u7D22\u884C(\u9AD8\u8F93\u5165\u6846 + \u53F3\u5BF9\u9F50\u8BA1\u6570)\u2500\u2500 */
		.ocp-search { display: flex; align-items: center; gap: 12px; }
		.ocp-input { flex: 1; min-width: 0; height: 44px; font-size: 13px; padding: 0 14px; border-radius: 10px;
		  border: 1px solid rgba(255,255,255,.09); background: #1C1C1E; color: #F0F0F2; outline: none; transition: border-color .15s;
		  font-family: inherit; }
		.ocp-input:focus { border-color: rgba(74,158,255,.65); }
		.ocp-input::placeholder { color: #6A6A72; }
		.ocp-count { flex: none; font-size: 12px; color: #9A9AA0; }
		.ocp-count b { color: #F0F0F2; font-weight: 600; }
		/* \u2500\u2500 \u9002\u914D\u5668\u5361\u7247(\u72EC\u7ACB\u5361\u7247,\u95F4\u8DDD ~16,\u5185\u884C 67 \u7F29\u653E;\u968F\u5BBF\u4E3B\u6EDA\u52A8,\u4E0D\u5185\u6EDA)\u2500\u2500 */
		.ocp-sites { display: flex; flex-direction: column; gap: 12px; }
		.ocp-site { background: #26262A; border: 1px solid rgba(255,255,255,.05); border-radius: 13px; padding: 15px 16px;
		  cursor: pointer; transition: background .15s, border-color .15s; }
		.ocp-site:hover { background: #2B2B30; }
		.ocp-site-on { border-color: rgba(74,158,255,.4); background: #262B33; }
		.ocp-site-dis { opacity: .55; }
		.ocp-badge-dis { flex: none; background: rgba(255,69,58,.15); color: #FF6B5E; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
		.ocp-siterow { display: flex; align-items: center; gap: 12px; }
		.ocp-ava { flex: none; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
		  font-size: 14px; font-weight: 700; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; overflow: hidden; }
		.ocp-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
		.ocp-sname { font-size: 15px; font-weight: 600; white-space: nowrap; }
		.ocp-scount { font-size: 13px; color: #9A9AA0; white-space: nowrap; }
		.ocp-chev { margin-left: auto; flex: none; color: #9A9AA0; font-size: 14px; display: inline-block;
		  transition: transform .2s ease, color .15s; }
		.ocp-site-on .ocp-chev { color: #4A9EFF; transform: rotate(90deg); }
		/* \u2500\u2500 \u5C55\u5F00\u7684\u547D\u4EE4\u5217\u8868(\u5355\u884C:\u540D\u79F0 + \u622A\u65AD\u63CF\u8FF0 + browser/read|write \u5FBD\u7AE0;\u70B9\u51FB\u590D\u5236)\u2500\u2500 */
		.ocp-cmds { margin-top: 12px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 10px; display: flex; flex-direction: column; gap: 2px;
		  max-height: 300px; overflow: auto; }
		.ocp-cmdhint { font-size: 11px; color: #9A9AA0; margin-bottom: 7px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
		.ocp-cmdrow { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px;
		  cursor: pointer; transition: background .12s; }
		.ocp-cmdrow:hover { background: rgba(255,255,255,.05); }
		.ocp-cmdrow:active { background: rgba(74,158,255,.12); }
		.ocp-cname { flex: none; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		  font-size: 12px; font-weight: 600; color: #79B7FF; background: #1E1E20;
		  border: 1px solid rgba(255,255,255,.06); border-radius: 6px; padding: 2px 9px; }
		.ocp-cdesc { flex: 1; min-width: 0; color: #A6A6AE; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.ocp-tag { flex: none; font-size: 10.5px; font-weight: 600; letter-spacing: .3px; padding: 2px 8px; border-radius: 6px; }
		.ocp-tag-web { background: #333338; color: #9A9AA0; }
		.ocp-tag-read { background: rgba(74,158,255,.14); color: #4A9EFF; }
		.ocp-tag-write { background: rgba(229,132,90,.15); color: #E5845A; }
		.ocp-copied { flex: none; color: #34C759; font-size: 11px; font-weight: 600; }
		.ocp-load { font-size: 12px; color: #9A9AA0; padding: 6px 8px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
		`;
		function avatarHue(name) {
		  let h = 0;
		  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
		  return h;
		}
		function Panel() {
		  const [status, setStatus] = (0, import_react.useState)(null);
		  const [adapters, setAdapters] = (0, import_react.useState)(null);
		  const [query, setQuery] = (0, import_react.useState)("");
		  const [tab, setTab] = (0, import_react.useState)("site");
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [expanded, setExpanded] = (0, import_react.useState)(null);
		  const [details, setDetails] = (0, import_react.useState)({});
		  const [copied, setCopied] = (0, import_react.useState)(null);
		  const [setupOpen, setSetupOpen] = (0, import_react.useState)(true);
		  const [starting, setStarting] = (0, import_react.useState)(false);
		  const [daemonMsg, setDaemonMsg] = (0, import_react.useState)(null);
		  const [iconFail, setIconFail] = (0, import_react.useState)({});
		  const [settings, setSettings] = (0, import_react.useState)(null);
		  const [checking, setChecking] = (0, import_react.useState)(false);
		  const [login, setLogin] = (0, import_react.useState)(null);
		  const setApproval = async (enabled) => {
		    const r = await rpc("approval-set", {
		      request: {
		        enabled
		      }
		    });
		    if (r.ok && r.value !== void 0 && r.value.ok) setSettings((s) => s === null ? null : {
		      ...s,
		      approvalOn: enabled
		    });
		  };
		  const toggleDisable = async (name, disabled) => {
		    const r = await rpc("adapter-disable", {
		      request: {
		        name,
		        disabled
		      }
		    });
		    if (r.ok && r.value !== void 0 && r.value.ok) {
		      setAdapters((prev) => prev === null ? prev : prev.map((a) => a.name === name ? {
		        ...a,
		        disabled
		      } : a));
		    }
		  };
		  const runLoginCheck = async () => {
		    if (checking) return;
		    setChecking(true);
		    const r = await rpc("login-check");
		    setLogin(r.ok && r.value !== void 0 ? r.value : {
		      ok: false,
		      checkedAt: null,
		      results: [],
		      error: r.error?.message ?? "\u8BF7\u6C42\u5931\u8D25"
		    });
		    setChecking(false);
		  };
		  const startDaemon = async () => {
		    if (starting) return;
		    setStarting(true);
		    setDaemonMsg(null);
		    const r = await rpc("daemon-start");
		    setStarting(false);
		    if (r.ok && r.value !== void 0 && r.value.ok) {
		      if (r.value.started !== true && r.value.message !== null) setDaemonMsg(r.value.message);
		      void reload();
		    } else {
		      setDaemonMsg(r.ok ? r.value?.message ?? "\u542F\u52A8\u5931\u8D25" : r.error?.message ?? "\u8BF7\u6C42\u5931\u8D25");
		    }
		  };
		  const toggle = async (name, el) => {
		    if (expanded === name) {
		      setExpanded(null);
		      return;
		    }
		    setExpanded(name);
		    if (el !== void 0 && el !== null) window.setTimeout(() => {
		      el.scrollIntoView({
		        behavior: "smooth",
		        block: "nearest"
		      });
		    }, 140);
		    if (details[name] === void 0) {
		      const r = await rpc("adapter-detail", {
		        request: {
		          name
		        }
		      });
		      setDetails((prev) => ({
		        ...prev,
		        [name]: r.ok && r.value !== void 0 ? r.value : {
		          ok: false,
		          name,
		          domain: null,
		          commands: [],
		          error: r.error?.message ?? "\u8BF7\u6C42\u5931\u8D25"
		        }
		      }));
		    }
		  };
		  const copyCmd = (key, text) => {
		    const clip = globalThis.navigator?.clipboard;
		    if (clip?.writeText === void 0) return;
		    void clip.writeText(text).then(() => {
		      setCopied(key);
		      window.setTimeout(() => {
		        setCopied((c) => c === key ? null : c);
		      }, 1600);
		    }).catch(() => {
		    });
		  };
		  const reload = async () => {
		    if (busy) return;
		    setBusy(true);
		    const [st, ad, se] = await Promise.all([
		      rpc("status"),
		      rpc("adapters"),
		      rpc("settings")
		    ]);
		    if (st.ok && st.value !== void 0) setStatus(st.value);
		    else setStatus(st.value ?? {
		      ok: false,
		      bin: null,
		      version: null,
		      daemon: null,
		      adapterSites: null,
		      error: st.error.message
		    });
		    if (ad.ok && ad.value !== void 0) setAdapters(ad.value.adapters);
		    if (se.ok && se.value !== void 0) setSettings(se.value);
		    setBusy(false);
		  };
		  (0, import_react.useEffect)(() => {
		    void reload();
		  }, []);
		  const d = status?.daemon;
		  const up = d?.running === true;
		  const ext = d?.extension === "connected";
		  const missing = status !== null && !status.ok;
		  const whoamiCount = (adapters ?? []).filter((a) => a.commands.includes("whoami")).length;
		  const isAppAdapter = (a) => a.domain === void 0 || a.domain === "localhost" || a.domain === "127.0.0.1" || a.domain === "null";
		  const siteList = (adapters ?? []).filter((a) => !isAppAdapter(a));
		  const appList = (adapters ?? []).filter(isAppAdapter);
		  const siteCmds = siteList.reduce((n, a) => n + a.commandCount, 0);
		  const appCmds = appList.reduce((n, a) => n + a.commandCount, 0);
		  const active = tab === "site" ? siteList : appList;
		  const q = query.trim().toLowerCase();
		  const filtered = q.length === 0 ? active : active.filter((a) => a.name.toLowerCase().includes(q) || (a.domain ?? "").toLowerCase().includes(q) || a.commands.some((c) => c.toLowerCase().includes(q)));
		  return (0, import_react.createElement)(
		    "div",
		    {
		      className: "ocp"
		    },
		    (0, import_react.createElement)("style", null, CSS),
		    // ── 页头(图标 + 大标题 + 描述 + 刷新)──
		    (0, import_react.createElement)("div", {
		      className: "ocp-head"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-icon"
		    }, "OC"), (0, import_react.createElement)("div", {
		      style: {
		        minWidth: 0
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-title"
		    }, "OpenCLI \u7BA1\u7406\u4E2D\u5FC3"), (0, import_react.createElement)("div", {
		      className: "ocp-desc"
		    }, "\u6D4F\u89C8\u5185\u7F6E OpenCLI \u547D\u4EE4;dsh \u4F1A\u8BDD\u7ECF site \u5DE5\u5177\u76F4\u63A5\u8C03\u7528,\u7F3A\u5931\u7AD9\u70B9\u53EF\u8BA9\u6A21\u578B\u73B0\u573A\u521B\u4F5C\u3002")), (0, import_react.createElement)("button", {
		      className: "ocp-btn",
		      onClick: reload,
		      disabled: busy
		    }, busy ? "\u68C0\u6D4B\u4E2D\u2026" : "\u5237\u65B0/\u8BCA\u65AD")),
		    // ── 未安装:安装引导卡(第一职责;可折叠)──
		    missing ? (0, import_react.createElement)("div", {
		      className: "ocp-card ocp-setup"
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-setup-head",
		      onClick: () => {
		        setSetupOpen(!setupOpen);
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-setup-t"
		    }, "\u672A\u68C0\u6D4B\u5230 opencli \u2014\u2014 \u4E09\u6B65\u63A5\u5165"), (0, import_react.createElement)("span", {
		      className: `ocp-chev ${setupOpen ? "ocp-chev-on" : ""}`
		    }, "\u203A")), setupOpen ? (0, import_react.createElement)("div", {
		      className: "ocp-setup-body"
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-err"
		    }, status?.error ?? ""), (0, import_react.createElement)("div", {
		      className: "ocp-step"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-step-n"
		    }, "1"), (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "ocp-step-t"
		    }, "\u5B89\u88C5 opencli CLI"), (0, import_react.createElement)("div", {
		      className: "ocp-step-d"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, "npm i -g @jackwener/opencli"), " \u2014\u2014 \u5B98\u65B9\u4E00\u7B49\u516C\u6C11\u8DEF\u5F84\u3002\u4E0D\u60F3\u7BA1 daemon \u751F\u547D\u5468\u671F\u4E0E\u66F4\u65B0\u7684,\u53EF\u6539\u88C5 OpenCLIApp \u5168\u5BB6\u6258\u5E95:", (0, import_react.createElement)("a", {
		      className: "ocp-link",
		      href: "https://opencli.info/download",
		      target: "_blank",
		      rel: "noreferrer"
		    }, "opencli.info/download"), "\u3002"))), (0, import_react.createElement)("div", {
		      className: "ocp-step"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-step-n"
		    }, "2"), (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "ocp-step-t"
		    }, "\u542F\u52A8 daemon,\u88C5 Chrome \u6269\u5C55"), (0, import_react.createElement)("div", {
		      className: "ocp-step-d"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, "opencli daemon restart"), " \u542F\u52A8\u5B88\u62A4\u8FDB\u7A0B(\u91CD\u542F\u7535\u8111\u540E\u9700\u91CD\u8DD1,App \u8DEF\u7EBF\u5219\u81EA\u52A8\u4FDD\u6D3B);\u518D\u88C5 BrowserBridge \u6269\u5C55,\u5728 Chrome \u91CC\u767B\u5F55\u5E38\u7528\u7F51\u7AD9\u5373\u53EF\u3002"))), (0, import_react.createElement)("div", {
		      className: "ocp-step"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-step-n"
		    }, "3"), (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "ocp-step-t"
		    }, "\u56DE\u5230\u8FD9\u91CC\u70B9\u300C\u5237\u65B0/\u8BCA\u65AD\u300D"), (0, import_react.createElement)("div", {
		      className: "ocp-step-d"
		    }, "\u68C0\u6D4B\u901A\u8FC7\u540E,dsh \u4F1A\u8BDD\u5373\u53EF\u4F7F\u7528 browser_* \u5DE5\u5177\u4E0E ", (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, "site <\u9002\u914D\u5668> <\u547D\u4EE4>"), "\u3002\u81EA\u5B9A\u4E49\u8DEF\u5F84\u53EF\u8BBE ", (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, "DSH_OPENCLI_BIN"), "\u3002")))) : null) : null,
		    // ── 状态卡(系统页样式)──
		    status !== null && status.ok ? (0, import_react.createElement)("div", {
		      className: "ocp-card"
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: `ocp-dot ${up ? "ocp-ok" : "ocp-bad"}`
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "daemon"), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, up ? "\u8FD0\u884C\u4E2D" : "\u672A\u8FD0\u884C"), up ? null : (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: starting,
		      onClick: () => {
		        void startDaemon();
		      }
		    }, starting ? "\u542F\u52A8\u4E2D\u2026" : "\u542F\u52A8 daemon"), daemonMsg !== null ? (0, import_react.createElement)("span", {
		      className: "ocp-err"
		    }, daemonMsg) : null), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: `ocp-dot ${ext ? "ocp-ok" : "ocp-bad"}`
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "Chrome \u6269\u5C55"), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, d?.extension === "connected" ? "\u5DF2\u8FDE\u63A5" : d?.extension ?? "\u672A\u77E5")), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "write \u5BA1\u6279\u95E8"), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, settings === null ? "\u2026" : settings.approvalOn ? "\u5F00\u542F(site \u5199\u64CD\u4F5C\u5148\u7ECF\u786E\u8BA4)" : "\u5173\u95ED"), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void setApproval(!(settings?.approvalOn ?? true));
		      }
		    }, settings?.approvalOn === false ? "\u5F00\u542F" : "\u5173\u95ED")), whoamiCount > 0 ? (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "\u767B\u5F55\u6001"), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, `${whoamiCount} \u4E2A\u7AD9\u70B9\u53EF\u5DE1\u68C0`), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: checking,
		      onClick: () => {
		        void runLoginCheck();
		      }
		    }, checking ? "\u5DE1\u68C0\u4E2D\u2026" : "\u5DE1\u68C0\u767B\u5F55\u6001")) : null, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "\u73AF\u5883"), (0, import_react.createElement)("span", {
		      className: "ocp-sv ocp-mono",
		      style: {
		        fontSize: 12
		      }
		    }, `v${status.version ?? "?"}`, ` \xB7 ${status.adapterSites ?? adapters?.length ?? "?"} \u7AD9\u70B9`, ` \xB7 ${siteCmds + appCmds} \u547D\u4EE4`, d?.port !== void 0 ? ` \xB7 \u7AEF\u53E3 ${d.port}` : "", d?.uptime !== void 0 ? ` \xB7 \u2191 ${d.uptime}` : ""))) : null,
		    // ── 登录态巡检结果卡 ──
		    login !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "4px 18px 10px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-setup-t"
		    }, "\u767B\u5F55\u6001\u5DE1\u68C0"), login.ok ? (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, `${login.results.filter((r) => r.ok).length}/${login.results.length} \u5728\u7EBF \xB7 ${new Date(login.checkedAt ?? "").toLocaleTimeString()}`) : null, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        setLogin(null);
		      }
		    }, "\u6536\u8D77")), login.ok ? (0, import_react.createElement)("div", {
		      className: "ocp-login"
		    }, login.results.map((r) => (0, import_react.createElement)("div", {
		      key: r.site,
		      className: "ocp-lrow",
		      title: r.detail ?? ""
		    }, (0, import_react.createElement)("span", {
		      className: `ocp-dot ${r.timedOut ? "ocp-mid" : r.ok ? "ocp-ok" : "ocp-bad"}`
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-lsite"
		    }, r.site), (0, import_react.createElement)("span", {
		      className: "ocp-ldetail"
		    }, r.timedOut ? "\u63A2\u6D4B\u8D85\u65F6" : r.detail ?? "")))) : (0, import_react.createElement)("div", {
		      className: "ocp-err"
		    }, login.error ?? "\u5DE1\u68C0\u5931\u8D25")) : null,
		    // ── 命令集合(对齐 App 同名页面)──
		    adapters !== null ? (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: 12
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-tabs"
		    }, (0, import_react.createElement)("button", {
		      className: `ocp-tab ${tab === "site" ? "ocp-tab-on" : ""}`,
		      title: "\u7F51\u7AD9\u9002\u914D\u5668\u2014\u2014\u5728\u767B\u5F55\u6001 Chrome \u91CC\u6267\u884C",
		      onClick: () => {
		        setTab("site");
		        setExpanded(null);
		      }
		    }, "Site \u547D\u4EE4", (0, import_react.createElement)("b", null, String(siteCmds))), (0, import_react.createElement)("button", {
		      className: `ocp-tab ${tab === "app" ? "ocp-tab-on" : ""}`,
		      title: "\u672C\u5730\u684C\u9762\u5E94\u7528\u9002\u914D\u5668(Codex/Cursor/Trae \u7B49,\u7ECF CDP \u64CD\u63A7\u76EE\u6807\u5E94\u7528;\u9700\u672C\u673A\u88C5\u6709\u5BF9\u5E94\u5E94\u7528,\u4E0D\u4F9D\u8D56 OpenCLIApp)",
		      onClick: () => {
		        setTab("app");
		        setExpanded(null);
		      }
		    }, "App \u547D\u4EE4", (0, import_react.createElement)("b", null, String(appCmds)))), (0, import_react.createElement)("div", {
		      className: "ocp-search"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input",
		      placeholder: "\u641C\u7D22\u7AD9\u70B9\u3001\u547D\u4EE4\u6216\u63CF\u8FF0",
		      value: query,
		      onChange: (e) => setQuery(e.target.value)
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-count"
		    }, (0, import_react.createElement)("b", null, String(q.length > 0 ? filtered.length : tab === "site" ? siteCmds : appCmds)), " \u6761\u547D\u4EE4")), (0, import_react.createElement)("div", {
		      className: "ocp-sites"
		    }, filtered.slice(0, 200).map((a) => {
		      const open = expanded === a.name;
		      const detail = details[a.name];
		      const hue = avatarHue(a.name);
		      const hasDomain = a.domain !== void 0 && a.domain !== "localhost" && a.domain !== "127.0.0.1" && a.domain !== "null";
		      const useFavicon = hasDomain === true && iconFail[a.name] !== true;
		      return (0, import_react.createElement)("div", {
		        key: a.name,
		        className: `ocp-site ${open ? "ocp-site-on" : ""} ${a.disabled === true ? "ocp-site-dis" : ""}`,
		        onClick: (e) => {
		          void toggle(a.name, e.currentTarget);
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "ocp-siterow"
		      }, (0, import_react.createElement)("span", {
		        className: "ocp-ava",
		        style: useFavicon ? void 0 : {
		          background: `hsl(${hue} 42% 30%)`,
		          color: `hsl(${hue} 75% 78%)`
		        }
		      }, useFavicon ? (0, import_react.createElement)("img", {
		        src: `https://${a.domain}/favicon.ico`,
		        loading: "lazy",
		        alt: "",
		        onError: () => {
		          setIconFail((p) => ({
		            ...p,
		            [a.name]: true
		          }));
		        }
		      }) : a.name.slice(0, 1).toUpperCase()), (0, import_react.createElement)("span", {
		        className: "ocp-sname"
		      }, a.name), (0, import_react.createElement)("span", {
		        className: "ocp-scount"
		      }, String(a.commandCount)), a.disabled === true ? (0, import_react.createElement)("span", {
		        className: "ocp-badge-dis"
		      }, "\u5DF2\u7981\u7528") : null, (0, import_react.createElement)("span", {
		        className: "ocp-chev"
		      }, "\u203A")), open ? (0, import_react.createElement)("div", {
		        className: "ocp-cmds",
		        onClick: (e) => {
		          e.stopPropagation();
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "ocp-cmdhint"
		      }, (0, import_react.createElement)("span", null, "dsh \u4F1A\u8BDD\u8C03\u7528:"), (0, import_react.createElement)("span", {
		        className: "ocp-code"
		      }, `site ${a.name} <\u547D\u4EE4>`), (0, import_react.createElement)("span", null, "\xB7 \u70B9\u51FB\u884C\u590D\u5236\u5B8C\u6574\u547D\u4EE4"), (0, import_react.createElement)("button", {
		        className: "ocp-btn ocp-btn-sm",
		        style: {
		          marginLeft: "auto"
		        },
		        onClick: () => {
		          void toggleDisable(a.name, a.disabled !== true);
		        }
		      }, a.disabled === true ? "\u542F\u7528" : "\u7981\u7528")), detail === void 0 ? (0, import_react.createElement)("div", {
		        className: "ocp-load"
		      }, "loading\u2026") : detail.ok ? detail.commands.map((c) => {
		        const cmdText = c.example !== void 0 && c.example.length > 0 ? c.example : `opencli ${a.name} ${c.name}`;
		        const key = `${a.name}:${c.name}`;
		        const justCopied = copied === key;
		        return (0, import_react.createElement)("div", {
		          key: c.name,
		          className: "ocp-cmdrow",
		          title: `${cmdText}
		\u70B9\u51FB\u590D\u5236`,
		          onClick: () => {
		            copyCmd(key, cmdText);
		          }
		        }, (0, import_react.createElement)("span", {
		          className: "ocp-cname"
		        }, c.name), (0, import_react.createElement)("span", {
		          className: "ocp-cdesc"
		        }, c.description.length > 0 ? c.description : "\u2014"), (0, import_react.createElement)("span", {
		          className: "ocp-tag ocp-tag-web"
		        }, "browser"), (0, import_react.createElement)("span", {
		          className: `ocp-tag ${c.access === "write" ? "ocp-tag-write" : "ocp-tag-read"}`
		        }, c.access), justCopied ? (0, import_react.createElement)("span", {
		          className: "ocp-copied"
		        }, "\u5DF2\u590D\u5236") : null);
		      }) : (0, import_react.createElement)("div", {
		        className: "ocp-err"
		      }, detail.error ?? "\u52A0\u8F7D\u5931\u8D25")) : null);
		    }), filtered.length === 0 ? (0, import_react.createElement)("div", {
		      className: "ocp-load"
		    }, "\u6CA1\u6709\u5339\u914D\u7684\u7AD9\u70B9\u6216\u547D\u4EE4") : null)) : null
		  );
		}
		function apply(ctx) {
		  ctx.slots.inject("settings.section", () => ctx.slots.register({
		    name: "settings.section",
		    id: "opencli-proxy",
		    order: 41,
		    label: "\u6D4F\u89C8\u5668\u4EE3\u7406"
		  }, () => (0, import_react.createElement)(Panel)));
		}
		// Annotate the CommonJS export names for ESM import in node:
		0 && (module.exports = {
		  apply,
		  inject
		});

		return module.exports;
	}
});
