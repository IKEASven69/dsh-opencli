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
		var DSH_URL = "http://127.0.0.1:3080";
		var RELEASES_URL = "https://github.com/IKEASven69/dsh-opencli/releases";
		var STR = {
		  zh: {
		    title: "OpenCLI \u6D4F\u89C8\u5668\u4EE3\u7406",
		    desc: "\u9A71\u52A8\u4F60\u767B\u5F55\u6001\u7684\u771F\u5B9E\u6D4F\u89C8\u5668 \xB7 176 \u7AD9 / 200+ \u547D\u4EE4\u4E00\u6B65\u5F0F\u6267\u884C \xB7 \u7531 OpenCLI daemon \u9A71\u52A8",
		    tabOverview: "\u603B\u89C8",
		    tabCommands: "\u547D\u4EE4",
		    tabAuto: "\u81EA\u52A8\u5316",
		    tabSec: "\u5B89\u5168\u4E0E\u8BBE\u7F6E",
		    daemonRunning: "\u8FD0\u884C\u4E2D",
		    daemonDown: "\u672A\u8FD0\u884C",
		    daemonStale: "\u5931\u8054",
		    bridgeOn: "\u5DF2\u8FDE\u63A5",
		    bridgeOff: "\u672A\u8FDE\u63A5",
		    recheck: "\u91CD\u65B0\u5DE1\u68C0",
		    checking: "\u5DE1\u68C0\u4E2D\u2026",
		    diagAll: "\u4E00\u5207\u6B63\u5E38",
		    detail: "\u8BE6\u60C5",
		    tryT: "\u8BD5\u8BD5\u770B",
		    trySub: "\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5\u8BF4,\u6216\u5148\u5728\u8FD9\u91CC\u8DD1\u4E00\u6761 \xB7 \u70B9\u53F3\u4FA7\u5FEB\u6377/\u547D\u4EE4\u5FBD\u7AE0 \u2192 \u586B\u5165\u8F93\u5165\u6846",
		    run: "\u8FD0\u884C",
		    running: "\u8DD1\u8FD9",
		    copy: "\u590D\u5236",
		    rerun: "\u91CD\u8DD1",
		    copied: "\u5DF2\u590D\u5236",
		    quickT: "\u5B9E\u7528\u5FEB\u6377",
		    quickSub: "\u70B9\u51FB \u2192 \u586B\u5165\u8F93\u5165\u6846;Ctrl+Enter \u76F4\u63A5\u8DD1",
		    loginT: "\u767B\u5F55\u6001\u5DE1\u68C0",
		    loginSub: "\u7EFF=\u5DF2\u767B \u9EC4=\u8D85\u65F6 \u7EA2=\u672A\u767B \xB7 \u72B6\u6001\u6761\u53EA\u4EAE\u706F,\u64CD\u4F5C\u5728\u8FD9\u91CC",
		    online: "\u5728\u7EBF",
		    expired: "\u5931\u6548",
		    unknown: "\u672A\u77E5",
		    timeout: "\u8D85\u65F6",
		    openLogin: "\u6253\u5F00\u767B\u5F55",
		    secT: "\u5B89\u5168\u4E2D\u5FC3",
		    secSub: "\u5199\u64CD\u4F5C\u5168\u90E8\u7ECF\u8FC7\u4F60\u6279\u51C6",
		    lastBlocked: "\u6700\u8FD1\u62E6\u622A",
		    gateOn: "\u5F00\u542F",
		    gateOff: "\u5173\u95ED",
		    gateLabel: "\u5199\u5BA1\u6279\u95E8",
		    gateDesc: "\u5199\u547D\u4EE4(\u53D1\u5E16/\u70B9\u8D5E/\u4E0B\u5355)\u5148\u5F39\u5BA1\u6279,\u4F60\u70B9\u300C\u5141\u8BB8\u300D\u624D\u6267\u884C;\u6743\u9650\u4E0D\u660E\u7684\u547D\u4EE4\u4E00\u5F8B\u6309\u5199\u5904\u7406",
		    gateOnLabel: "\u5DF2\u5F00\u542F",
		    gateOffLabel: "\u5DF2\u5173\u95ED",
		    modeReadOnly: "\u6240\u6709\u5199\u547D\u4EE4\u76F4\u63A5\u62D2\u7EDD,\u96F6\u6253\u6270",
		    modeStandard: "\u5199\u547D\u4EE4\u9010\u6761\u5BA1\u6279(\u63A8\u8350)",
		    modeAuto: "\u767D\u540D\u5355\u7AD9\u70B9\u81EA\u52A8\u653E\u884C,\u5176\u4F59\u5BA1\u6279",
		    modeUnres: "\u5168\u90E8\u653E\u884C(\u4E0D\u5EFA\u8BAE)",
		    auditT: "\u62E6\u622A\u5BA1\u8BA1",
		    auditEmpty: "\u8FD1 7 \u5929\u6CA1\u6709\u62E6\u622A\u8BB0\u5F55",
		    auditN: (n) => `\u8FD1 7 \u5929\u62E6\u622A ${n} \u6B21`,
		    proofT: "\u4F9B\u5E94\u94FE\u81EA\u8BC1",
		    proofSub: "\u672C\u63D2\u4EF6\u7684\u5B89\u5168\u8FB9\u754C,\u53EF\u6838\u67E5",
		    proofNoTelemetry: "\u65E0\u9065\u6D4B\u4E0A\u4F20",
		    proofNoCurl: "\u65E0 curl | sh",
		    proofFailClosed: "\u5199\u547D\u4EE4 fail-closed",
		    proofClip: "\u8F93\u51FA\u622A\u65AD\u9632\u6CE8\u5165",
		    proofRel: "\u6765\u6E90 GitHub Releases",
		    verified: "\u5DF2\u6838\u9A8C",
		    rateT: "\u9650\u6D41\u4E0E\u9650\u57DF",
		    rateSub: "\u4FDD\u62A4\u4F60\u7684\u8D26\u53F7\u4E0D\u88AB\u98CE\u63A7",
		    shaLine: "sha256(\u672C\u6784\u5EFA)",
		    verT: "\u7248\u672C\u4E0E\u66F4\u65B0",
		    verNow: "\u5F53\u524D",
		    channel: "\u6E20\u9053 stable",
		    checkUpd: "\u68C0\u67E5\u66F4\u65B0",
		    upToDate: "\u5DF2\u662F\u6700\u65B0",
		    updAvail: "\u53EF\u66F4\u65B0\u5230",
		    updMarket: "\u7ECF dsh-market Update API",
		    updFallback: "\u672A\u88C5\u5E02\u573A\u63D2\u4EF6 \u2192 GitHub Releases \u68C0\u67E5",
		    updating: "\u68C0\u67E5\u4E2D\u2026",
		    cmdT: "\u547D\u4EE4",
		    cmdSearch: "\u641C\u7D22\u7AD9\u70B9\u6216\u547D\u4EE4,\u5982:\u70ED\u699C / search / bilibili",
		    cmdFmt: "\u70B9\u547D\u4EE4\u884C \u2192 \u590D\u5236\u8C03\u7528\u683C\u5F0F;\u7981\u7528\u9002\u914D\u5668\u4F1A\u5373\u65F6\u4ECE systemPrompt \u6536\u7F29\u76EE\u5F55(\u9700\u786E\u8BA4)",
		    disable: "\u7981\u7528",
		    enable: "\u542F\u7528",
		    commandsN: (n) => `${n} \u547D\u4EE4`,
		    autoT: "\u5B9A\u65F6\u4EFB\u52A1",
		    autoNew: "\u65B0\u5EFA",
		    autoSub: "\u6301\u4E45\u5316\u5230 dsh.schedule,\u91CD\u542F\u4E0D\u4E22 \xB7 \u5931\u8D25\u6309\u7B56\u7565\u91CD\u8BD5\u5E76\u901A\u77E5",
		    depDaemon: "daemon \u672A\u8FD0\u884C\u2014\u2014\u5B9A\u65F6\u4EFB\u52A1\u6682\u505C\u6267\u884C,\u6062\u590D\u540E\u81EA\u52A8\u8865\u8DD1",
		    fix: "\u4E00\u952E\u4FEE\u590D",
		    last: "\u4E0A\u6B21",
		    next: "\u4E0B\u6B21",
		    retryN: (n) => `\u91CD\u8BD5 \xD7${n}`,
		    notifyOn: "\u901A\u77E5 \u5F00",
		    notifyOff: "\u901A\u77E5 \u5173",
		    runNow: "\u7ACB\u5373\u8DD1",
		    running2: "\u6267\u884C\u4E2D\u2026",
		    del: "\u5220",
		    create: "\u521B\u5EFA",
		    recT: "\u5F55\u5236\u56DE\u653E",
		    recSub: "\u5F55\u5236 site / browser \u6B65\u9AA4,\u4E00\u952E\u56DE\u653E",
		    recStart: "\u5F00\u59CB\u5F55\u5236",
		    recStop: "\u505C\u6B62\u5F55\u5236",
		    recName: "\u5F55\u5236\u540D,\u5982:\u6BCF\u65E5\u77E5\u8BC6\u91C7\u96C6",
		    recStep: "\u4E00\u6761\u6B65\u9AA4,\u5982:site zhihu hot",
		    recAdd: "+ \u52A0\u6B65\u9AA4",
		    replay: "\u56DE\u653E",
		    assetT: "\u8D44\u4EA7\u5E93",
		    assetSub: "\u811A\u672C / \u914D\u65B9 / \u89C4\u5219\u5305",
		    assetSearch: "\u641C\u8D44\u4EA7(\u5982:arxiv)",
		    assetSearchBtn: "\u641C\u7D22",
		    builtinT: "\u5185\u7F6E\u811A\u672C",
		    recipes: "\u914D\u65B9",
		    rulepacks: "\u89C4\u5219\u5305",
		    browse: "\u6D4F\u89C8\u5168\u90E8",
		    v4host: "v4 host \u65B0\u589E;v0.3.8 \u5DF2\u6709\u589E\u5220/\u5F00\u5173/\u7ACB\u5373\u8DD1",
		    diagT: "\u8BCA\u65AD",
		    diagSub: "\u6700\u8FD1\u4E00\u6B21 shell/\u89E3\u6790\u5931\u8D25\u539F\u6587,\u7ED9\u4FEE\u590D\u4E0E\u53CD\u9988\u7528",
		    copyDiag: "\u590D\u5236\u8BCA\u65AD",
		    viewLog: "\u67E5\u770B\u65E5\u5FD7",
		    noLog: "opencli \u672A\u66B4\u9732\u65E5\u5FD7\u6587\u4EF6;\u4EE5\u4E0B\u4E3A\u6700\u8FD1\u8BCA\u65AD\u5FEB\u7167",
		    more: "\u66F4\u591A",
		    guide: "\u5B89\u88C5\u5F15\u5BFC",
		    guideD: "\u88C5 BrowserBridge \u6269\u5C55 / \u542F\u52A8 daemon",
		    profileT: "profile \u8BF4\u660E",
		    profileD: "\u767B\u5F55\u6001\u6765\u81EA\u4F60\u65E5\u5E38\u6D4F\u89C8\u5668,\u4E0E dsh \u5185\u7F6E\u6D4F\u89C8\u5668\u65E0\u5173",
		    jump: "\u8DF3\u8F6C dsh \u8BBE\u7F6E",
		    jumpD: "\u5728\u5BF9\u8BDD\u91CC\u7BA1\u7406\u63D2\u4EF6",
		    open: "\u6253\u5F00",
		    setupT: "\u672A\u68C0\u6D4B\u5230 opencli \u2014\u2014 \u4E09\u6B65\u63A5\u5165",
		    loading: "\u68C0\u6D4B\u4E2D\u2026",
		    step1: "\u5B89\u88C5 opencli CLI",
		    step1c: "npm i -g @jackwener/opencli(\u5B98\u65B9\u4E00\u7B49\u516C\u6C11\u8DEF\u5F84)",
		    step2: "\u542F\u52A8 daemon,\u88C5 Chrome \u6269\u5C55",
		    step2c: "opencli daemon restart",
		    step3: "\u56DE\u5230\u8FD9\u91CC\u70B9\u300C\u5237\u65B0/\u8BCA\u65AD\u300D",
		    siteEmpty: "\u9002\u914D\u5668\u8FD4\u56DE\u7A7A(\u53EF\u80FD\u672A\u767B\u5F55\u6216\u65E0\u6570\u636E)\u3002\u8BF7\u5148\u5728\u771F\u5B9E Chrome \u767B\u5F55\u540E\u91CD\u8BD5\u3002",
		    needLogin: "daemon \u672A\u8FD0\u884C\u6216\u6D4F\u89C8\u5668\u6865\u672A\u8FDE\u63A5\u2014\u2014\u70B9\u300C\u542F\u52A8 daemon\u300D\u540E\u91CD\u8BD5",
		    errReq: "\u8BF7\u6C42\u5931\u8D25",
		    confirmDisable: (n) => `\u7981\u7528 ${n}?\u76EE\u5F55\u5C06\u5373\u65F6\u4ECE systemPrompt \u6536\u7F29\u3002`,
		    enNote: "\u53CC\u8BED:i18n key \u65BD\u5DE5(zh \u9ED8\u8BA4)",
		    statesNote: "\u56DB\u6001:\u68C0\u6D4B\u4E2D/\u6B63\u5E38/\u4F9D\u8D56\u7F3A\u5931/RPC\u9519\u8BEF \u2014\u2014 \u8BE6\u89C1 .design/06 \u72B6\u6001\u673A\u89C4\u683C"
		  },
		  en: {
		    title: "OpenCLI Browser Proxy",
		    desc: "Drive your logged-in real browser \xB7 176 sites / 200+ commands one-shot \xB7 powered by the OpenCLI daemon",
		    tabOverview: "Overview",
		    tabCommands: "Commands",
		    tabAuto: "Automation",
		    tabSec: "Security",
		    daemonRunning: "running",
		    daemonDown: "not running",
		    daemonStale: "stale",
		    bridgeOn: "connected",
		    bridgeOff: "not connected",
		    recheck: "Re-check",
		    checking: "checking\u2026",
		    diagAll: "All good",
		    detail: "detail",
		    tryT: "Try it",
		    trySub: "Say it in chat, or run one here \xB7 click a quick pick/command badge to fill the input",
		    run: "Run",
		    running: "Run",
		    copy: "Copy",
		    rerun: "Re-run",
		    copied: "Copied",
		    quickT: "Quick picks",
		    quickSub: "Click \u2192 fill the input; Ctrl+Enter to run",
		    loginT: "Login check",
		    loginSub: "green=logged-in yellow=timeout red=expired \xB7 status bar shows dots, actions live here",
		    online: "online",
		    expired: "expired",
		    unknown: "unknown",
		    timeout: "timeout",
		    openLogin: "Open login",
		    secT: "Security center",
		    secSub: "Every write goes through your approval",
		    lastBlocked: "Blocked (7d)",
		    gateOn: "On",
		    gateOff: "Off",
		    gateLabel: "Write approval gate",
		    gateDesc: "Writes (post/like/order) ask first \u2014 nothing runs until you allow; unknown-access commands are treated as writes",
		    gateOnLabel: "On",
		    gateOffLabel: "Off",
		    modeReadOnly: "All writes rejected, zero interruptions",
		    modeStandard: "Each write asks (recommended)",
		    modeAuto: "Whitelisted sites auto-run, rest ask",
		    modeUnres: "Allow all (not recommended)",
		    auditT: "Interception audit",
		    auditEmpty: "No interceptions in 7 days",
		    auditN: (n) => `${n} blocked in 7 days`,
		    proofT: "Supply-chain self-attestation",
		    proofSub: "This plugin\u2019s security boundary, verifiable",
		    proofNoTelemetry: "no telemetry",
		    proofNoCurl: "no curl | sh",
		    proofFailClosed: "writes fail-closed",
		    proofClip: "output clipped anti-injection",
		    proofRel: "from GitHub Releases",
		    verified: "verified",
		    rateT: "Rate limit & domain fence",
		    rateSub: "Protects your accounts from bot controls",
		    shaLine: "sha256 (this build)",
		    verT: "Version & updates",
		    verNow: "current",
		    channel: "channel stable",
		    checkUpd: "Check updates",
		    upToDate: "up to date",
		    updAvail: "update available:",
		    updMarket: "via dsh-market Update API",
		    updFallback: "market plugin absent \u2192 check GitHub Releases",
		    updating: "checking\u2026",
		    cmdT: "Commands",
		    cmdSearch: "Search sites or commands, e.g. trending / search / bilibili",
		    cmdFmt: "Click a command row \u2192 copy call format; disabling a adapter shrinks the systemPrompt catalog (confirm first)",
		    disable: "Disable",
		    enable: "Enable",
		    commandsN: (n) => `${n} cmds`,
		    autoT: "Schedules",
		    autoNew: "New",
		    autoSub: "Persisted to dsh.schedule, survives restart \xB7 retries then notifies on failure",
		    depDaemon: "daemon not running \u2014 schedules paused, will catch up when it returns",
		    fix: "Fix",
		    last: "last",
		    next: "next",
		    retryN: (n) => `retry \xD7${n}`,
		    notifyOn: "notify on",
		    notifyOff: "notify off",
		    runNow: "Run now",
		    running2: "running\u2026",
		    del: "Del",
		    create: "Create",
		    recT: "Record & replay",
		    recSub: "Record site / browser steps, replay in one click",
		    recStart: "Record",
		    recStop: "Stop",
		    recName: "name, e.g. daily knowledge",
		    recStep: "one step, e.g. site zhihu hot",
		    recAdd: "+ add step",
		    replay: "Replay",
		    assetT: "Assets",
		    assetSub: "scripts / recipes / rulepacks",
		    assetSearch: "search assets (e.g. arxiv)",
		    assetSearchBtn: "Search",
		    builtinT: "Builtin scripts",
		    recipes: "recipes",
		    rulepacks: "rulepacks",
		    browse: "Browse all",
		    v4host: "v4 host additions; add/toggle/run-now RPCs shipped in v0.3.8",
		    diagT: "Diagnostics",
		    diagSub: "raw last shell/parse failure, for fixes and bug reports",
		    copyDiag: "Copy diagnostics",
		    viewLog: "View log",
		    noLog: "opencli exposes no log file; latest diagnostic snapshot below",
		    more: "More",
		    guide: "Setup guide",
		    guideD: "Install BrowserBridge extension / start daemon",
		    profileT: "profile note",
		    profileD: "Logins come from your everyday browser, unrelated to the built-in dsh browser",
		    jump: "Open dsh settings",
		    jumpD: "Manage plugins from chat",
		    open: "Open",
		    setupT: "opencli not detected \u2014 3 steps to connect",
		    loading: "detecting\u2026",
		    step1: "Install opencli CLI",
		    step1c: "npm i -g @jackwener/opencli",
		    step2: "Start daemon, install Chrome extension",
		    step2c: "opencli daemon restart",
		    step3: "Come back and hit Refresh",
		    siteEmpty: "Adapter returned empty (not logged in?). Log in on real Chrome first.",
		    needLogin: "daemon down or browser bridge not connected \u2014 click Start daemon and retry",
		    errReq: "request failed",
		    confirmDisable: (n) => `Disable ${n}? The catalog shrinks from systemPrompt immediately.`,
		    enNote: "i18n keys throughout (zh default)",
		    statesNote: "four states: loading/ok/dependency/error \u2014 see .design/06"
		  }
		};
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
		async function copyText(text) {
		  try {
		    const clip = globalThis.navigator?.clipboard;
		    if (clip?.writeText !== void 0) {
		      await clip.writeText(text);
		      return true;
		    }
		  } catch {
		  }
		  try {
		    const ta = document.createElement("textarea");
		    ta.value = text;
		    ta.style.position = "fixed";
		    ta.style.opacity = "0";
		    document.body.appendChild(ta);
		    ta.select();
		    const ok = document.execCommand("copy");
		    document.body.removeChild(ta);
		    return ok;
		  } catch {
		    return false;
		  }
		}
		var SPRITE = `<svg width="0" height="0" style="position:absolute">
		<linearGradient id="o4g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00e5a0"/><stop offset=".5" stop-color="#00b4d8"/><stop offset="1" stop-color="#7b61ff"/></linearGradient>
		<symbol id="i4-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></symbol>
		<symbol id="i4-zap" viewBox="0 0 24 24"><path d="M13 2.5 4.5 13.5H11L9.8 21.5 19.5 10H13z"/></symbol>
		<symbol id="i4-activity" viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></symbol>
		<symbol id="i4-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v5l3.2 2"/></symbol>
		<symbol id="i4-rec" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/></symbol>
		<symbol id="i4-layers" viewBox="0 0 24 24"><path d="m12 3.5 8.5 4.7L12 12.9 3.5 8.2z"/><path d="m4.8 12.4 7.2 4 7.2-4"/><path d="m4.8 16.2 7.2 4 7.2-4"/></symbol>
		<symbol id="i4-shield" viewBox="0 0 24 24"><path d="M12 2.8 19 5.6v5.2c0 4.9-3 8.1-7 9.6-4-1.5-7-4.7-7-9.6V5.6z"/><path d="m8.8 11.8 2.3 2.3 4.3-4.3"/></symbol>
		<symbol id="i4-sliders" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="15" cy="7" r="2.1"/><circle cx="8.5" cy="12" r="2.1"/><circle cx="17" cy="17" r="2.1"/></symbol>
		<symbol id="i4-plus" viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></symbol>
		<symbol id="i4-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M18.6 2.8v3.8h-3.8"/></symbol>
		<symbol id="i4-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/></symbol>
		<symbol id="i4-chev-r" viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></symbol>
		<symbol id="i4-chev-d" viewBox="0 0 24 24"><path d="m6 9.5 6 6 6-6"/></symbol>
		<symbol id="i4-alert" viewBox="0 0 24 24"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.8" r=".4" fill="currentColor"/></symbol>
		<symbol id="i4-check-c" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.5 2.5 4.9-5"/></symbol>
		<symbol id="i4-ext" viewBox="0 0 24 24"><path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M9.5 5.5H6.4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.1"/></symbol>
		<symbol id="i4-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 8.2h.01M12 11.4v5"/></symbol>
		<symbol id="i4-monitor" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/></symbol>
		<symbol id="i4-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
		</svg>`;
		var ic = (name, sm = false) => (0, import_react.createElement)("svg", {
		  className: sm ? "o4ic o4ic-s" : "o4ic",
		  dangerouslySetInnerHTML: {
		    __html: `<use href="#i4-${name}"/>`
		  }
		});
		var CSS = `
		.o4 { width:100%; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:10px; font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif; color:#E8EAED; }
		.o4ic { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex:none; }
		.o4ic-s { width:13px; height:13px; }
		.o4-head { display:flex; align-items:center; gap:11px; padding:13px 15px; background:#14171C; border:1px solid #262B33; border-radius:14px; flex-wrap:wrap; }
		.o4-logo { width:42px; height:42px; border-radius:11px; display:flex; align-items:center; justify-content:center; flex:none; }
		.o4-logo .o4ic { width:26px; height:26px; }
		.o4-h1 { font-size:17px; font-weight:700; white-space:nowrap; }
		.o4-desc { font-size:11px; color:#9AA3AD; margin-top:2px; }
		.o4-hr { margin-left:auto; display:flex; align-items:center; gap:7px; flex:none; }
		.o4-vchip { font-size:11px; color:#5F6873; border:1px solid #262B33; border-radius:999px; padding:3px 9px; }
		.o4-seg { display:flex; background:#1F242D; border:1px solid #313845; border-radius:8px; padding:2px; }
		.o4-seg button { border:0; background:transparent; color:#9AA3AD; font-size:11.5px; padding:4px 10px; border-radius:6px; cursor:pointer; white-space:nowrap; }
		.o4-seg button.on { background:#4A9EFF; color:#fff; }
		.o4-tabs { display:flex; gap:4px; background:#14171C; border:1px solid #262B33; border-radius:11px; padding:4px; }
		.o4-tabs button { flex:1; border:0; background:transparent; color:#9AA3AD; font-size:13px; padding:8px 0; border-radius:8px; cursor:pointer; }
		.o4-tabs button.on { background:#1F242D; color:#E8EAED; font-weight:600; box-shadow:inset 0 0 0 1px #313845; }
		.o4-status { display:flex; align-items:center; gap:7px; flex-wrap:wrap; padding:9px 13px; background:#14171C; border:1px solid #262B33; border-radius:11px; }
		.o4-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#9AA3AD; background:#1A1E25; border:1px solid #262B33; border-radius:999px; padding:3px 9px; }
		.o4-chip img { width:12px; height:12px; border-radius:3px; }
		.o4-chip .o4ic { width:12px; height:12px; }
		.o4-dot { width:7px; height:7px; border-radius:50%; flex:none; }
		.o4-dot.g { background:#34C759; box-shadow:0 0 5px rgba(52,199,89,.7); }
		.o4-dot.r { background:#FF453A; } .o4-dot.y { background:#FF9F0A; } .o4-dot.n { background:#313845; }
		.o4-sep { width:1px; height:15px; background:#313845; }
		.o4-diag { display:flex; align-items:center; gap:9px; padding:8px 13px; border-radius:11px; font-size:12px; cursor:pointer; }
		.o4-diag.ok { background:rgba(52,199,89,.08); border:1px solid rgba(52,199,89,.25); color:#7FD89A; }
		.o4-diag.bad { background:rgba(255,69,58,.08); border:1px solid rgba(255,69,58,.3); color:#FF8D85; }
		.o4-diag .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
		.o4-card { background:#1A1E25; border:1px solid #262B33; border-radius:12px; padding:13px 15px; }
		.o4-card + .o4-card { margin-top:12px; }
		.o4-h3 { font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:8px; }
		.o4-h3 .rt { margin-left:auto; display:flex; align-items:center; gap:8px; }
		.o4-sub { font-size:11.5px; color:#5F6873; margin:3px 0 10px; line-height:1.5; }
		.o4-miniico { width:23px; height:23px; border-radius:7px; background:rgba(74,158,255,.12); border:1px solid rgba(74,158,255,.35); color:#4A9EFF; display:inline-flex; align-items:center; justify-content:center; flex:none; }
		.o4-btn { border:0; border-radius:8px; background:#4A9EFF; color:#fff; font-size:12px; padding:6px 13px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
		.o4-btn:hover { background:#3A8AE8; }
		.o4-btn.ghost { background:#1F242D; border:1px solid #313845; color:#9AA3AD; font-weight:400; }
		.o4-btn.ghost:hover { background:#262B33; }
		.o4-btn.sm { padding:4px 10px; font-size:11.5px; }
		.o4-btn:disabled { opacity:.55; cursor:default; }
		.o4-in { flex:1; min-width:0; background:#14171C; border:1px solid #313845; color:#E8EAED; border-radius:8px; padding:7px 11px; font-size:12.5px; }
		.o4-in.mono { font-family:ui-monospace,Consolas,monospace; }
		.o4-in::placeholder { color:#5F6873; }
		.o4-tryout { margin-top:9px; background:#0A0C0F; border:1px solid #262B33; border-radius:8px; padding:9px 11px; font:11.5px/1.7 ui-monospace,Consolas,monospace; color:#A9C7EC; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow:auto; }
		.o4-tryout .k { color:#5F6873; }
		.o4-tryout .lnk { color:#4A9EFF; cursor:pointer; }
		.o4-micro { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; }
		.o4-mst { background:#14171C; border:1px solid #262B33; border-radius:7px; padding:6px 8px; font-size:10px; color:#5F6873; line-height:1.5; }
		.o4-mst b { display:block; font-size:10px; margin-bottom:2px; }
		.o4-mst .bar { height:6px; border-radius:3px; background:#313845; margin:3px 0; }
		.o4-mst.ok b { color:#34C759; } .o4-mst.err b { color:#FF6B5E; } .o4-mst.load b { color:#4A9EFF; }
		.o4-mst .fix { color:#4A9EFF; }
		.o4-qrow { display:flex; align-items:center; gap:8px; background:#14171C; border:1px solid #262B33; border-radius:8px; padding:7px 11px; font-size:12px; cursor:pointer; }
		.o4-qrow:hover { border-color:#313845; }
		.o4-qrow .mono { font-family:ui-monospace,Consolas,monospace; color:#A9C7EC; font-size:10.5px; margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%; }
		.o4-sites { display:flex; flex-wrap:wrap; gap:7px; }
		.o4-site { display:flex; align-items:center; gap:7px; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:5px 10px 5px 5px; font-size:12px; }
		.o4-ava { width:25px; height:25px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; flex:none; }
		.o4-ava img { width:14px; height:14px; }
		.o4-st { font-size:10.5px; }
		.o4-off { opacity:.6; }
		.o4-sec { border:1px solid rgba(74,158,255,.35); background:linear-gradient(180deg,rgba(74,158,255,.06),rgba(74,158,255,.015)); border-radius:12px; padding:14px 15px; }
		.o4-shield { width:44px; height:44px; border-radius:12px; background:rgba(52,199,89,.12); border:1px solid rgba(52,199,89,.35); color:#34C759; display:flex; align-items:center; justify-content:center; flex:none; }
		.o4-shield .o4ic { width:21px; height:21px; }
		.o4-cells { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:9px; }
		.o4-cell { background:#1A1E25; border:1px solid #262B33; border-radius:9px; padding:8px 11px; }
		.o4-cell .l { font-size:10.5px; color:#5F6873; margin-bottom:2px; }
		.o4-cell .v { font-size:12.5px; font-weight:600; }
		.o4-cell .v.on { color:#34C759; }
		.o4-cell .v.mut { color:#9AA3AD; font-weight:400; font-size:11px; }
		.o4-proof { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
		.o4-proof span { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:#7FD89A; background:rgba(52,199,89,.09); border:1px solid rgba(52,199,89,.22); border-radius:999px; padding:2px 9px; }
		.o4-proof .o4ic { width:10px; height:10px; stroke-width:2.2; }
		.o4-modes { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px; }
		.o4-mode { position:relative; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:8px 10px; cursor:pointer; }
		.o4-mode.on { border-color:#4A9EFF; background:rgba(74,158,255,.12); }
		.o4-mode .mi { display:flex; align-items:center; gap:6px; margin-bottom:2px; color:#9AA3AD; }
		.o4-mode.on .mi { color:#4A9EFF; }
		.o4-mode b { font-size:12px; }
		.o4-mode span { font-size:10px; color:#5F6873; line-height:1.45; display:block; margin-top:2px; }
		.o4-mchk { position:absolute; top:7px; right:7px; width:15px; height:15px; border-radius:50%; background:#4A9EFF; color:#fff; display:none; align-items:center; justify-content:center; }
		.o4-mode.on .o4-mchk { display:flex; }
		.o4-sw { width:34px; height:20px; border-radius:999px; background:#313845; position:relative; flex:none; cursor:pointer; border:0; padding:0; }
		.o4-sw::after { content:""; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:2px; left:2px; transition:left .15s; }
		.o4-sw.on { background:#34C759; } .o4-sw.on::after { left:16px; }
		.o4-row { display:flex; align-items:center; gap:8px; background:#14171C; border:1px solid #262B33; border-radius:10px; padding:8px 11px; flex-wrap:wrap; }
		.o4-row .meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:10.5px; color:#5F6873; width:100%; padding-left:2px; }
		.o4-row .grow { flex:1; min-width:0; }
		.o4-tt { font-size:12.5px; font-weight:600; }
		.o4-dd { font-size:11px; color:#5F6873; margin-top:1px; }
		.o4-hpts { display:flex; gap:3px; }
		.o4-hp { width:7px; height:7px; border-radius:50%; background:#34C759; }
		.o4-hp.f { background:#FF453A; } .o4-hp.n { background:#313845; }
		.o4-bdg { display:inline-flex; align-items:center; gap:4px; font-size:10px; border-radius:5px; padding:2px 7px; border:1px solid #313845; color:#9AA3AD; background:#1F242D; }
		.o4-bdg.w { color:#FFB340; border-color:rgba(255,179,64,.35); background:rgba(255,179,64,.08); }
		.o4-bdg.r { color:#FF8D85; border-color:rgba(255,69,58,.3); background:rgba(255,69,58,.07); }
		.o4-bdg.b { color:#4A9EFF; border-color:rgba(74,158,255,.35); background:rgba(74,158,255,.12); }
		.o4-cron { font:10.5px ui-monospace,Consolas,monospace; color:#9AA3AD; background:#1F242D; border:1px solid #262B33; border-radius:5px; padding:2px 6px; }
		.o4-stat { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid #262B33; font-size:12px; }
		.o4-stat:last-child { border-bottom:0; }
		.o4-stat span { color:#9AA3AD; } .o4-stat b { font:500 11.5px ui-monospace,Consolas,monospace; color:#C6CFDA; }
		.o4-vrow { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #262B33; font-size:12px; }
		.o4-vrow:last-child { border-bottom:0; }
		.o4-vrow .o4ic { color:#34C759; width:12px; height:12px; }
		.o4-vrow em { margin-left:auto; font-style:normal; font-size:9.5px; color:#34C759; border:1px solid rgba(52,199,89,.3); border-radius:999px; padding:1px 7px; flex:none; }
		.o4-hash { display:inline-block; font:10.5px ui-monospace,Consolas,monospace; color:#5F6873; background:#14171C; border:1px solid #262B33; border-radius:6px; padding:3px 8px; margin-top:8px; }
		.o4-audit { display:flex; align-items:center; gap:8px; margin-top:11px; background:#14171C; border:1px solid #262B33; border-radius:9px; padding:7px 11px; font-size:11.5px; color:#9AA3AD; flex-wrap:wrap; }
		.o4-acc { display:flex; align-items:center; gap:9px; padding:10px 13px; background:#14171C; border:1px solid #262B33; border-radius:10px; margin-bottom:8px; font-size:12.5px; color:#9AA3AD; cursor:pointer; }
		.o4-acc b { color:#E8EAED; font-weight:600; }
		.o4-acc .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:5px; font-size:11.5px; }
		.o4-diagopen { background:#1A1E25; border:1px solid rgba(255,69,58,.35); border-radius:12px; overflow:hidden; }
		.o4-diagopen .bar { display:flex; align-items:center; gap:8px; padding:9px 13px; background:rgba(255,69,58,.08); font-size:12px; color:#FF8D85; }
		.o4-diagopen .bar .o4arr { margin-left:auto; color:#5F6873; display:flex; align-items:center; gap:4px; }
		.o4-diagopen .body { padding:11px 13px; font-size:11.5px; color:#9AA3AD; }
		.o4-kv { display:grid; grid-template-columns:105px 1fr; gap:3px 11px; font:11px/1.7 ui-monospace,Consolas,monospace; }
		.o4-kv .k { color:#5F6873; } .o4-kv .v { color:#C6CFDA; word-break:break-all; }
		.o4-fixrow { display:flex; gap:8px; margin-top:9px; }
		.o4-load { color:#5F6873; font-size:12px; padding:10px 0; }
		.o4-skel { height:11px; border-radius:5px; background:#1F242D; margin:7px 0; }
		.o4-toast { position:fixed; right:16px; bottom:16px; background:#4DDB7A; color:#08210E; font-size:12px; font-weight:600; border-radius:9px; padding:8px 14px; z-index:50; }
		.o4-note { font-size:10.5px; color:#5F6873; margin-top:8px; }
		`;
		function Panel() {
		  const [lang, setLang] = (0, import_react.useState)("zh");
		  const t = (k) => STR[lang][k] ?? STR.zh[k];
		  const [tab, setTab] = (0, import_react.useState)("ov");
		  const [phase, setPhase] = (0, import_react.useState)("loading");
		  const [status, setStatus] = (0, import_react.useState)(null);
		  const [settings, setSettings] = (0, import_react.useState)(null);
		  const [adapters, setAdapters] = (0, import_react.useState)(null);
		  const [schedules, setSchedules] = (0, import_react.useState)([]);
		  const [autoMode, setAutoMode] = (0, import_react.useState)("standard");
		  const [audit, setAudit] = (0, import_react.useState)(null);
		  const [login, setLogin] = (0, import_react.useState)(null);
		  const [checking, setChecking] = (0, import_react.useState)(false);
		  const [toast, setToast] = (0, import_react.useState)(null);
		  const [runInput, setRunInput] = (0, import_react.useState)("site zhihu hot");
		  const [running, setRunning] = (0, import_react.useState)(false);
		  const [runOut, setRunOut] = (0, import_react.useState)(null);
		  const [query, setQuery] = (0, import_react.useState)("");
		  const [details, setDetails] = (0, import_react.useState)({});
		  const [copied, setCopied] = (0, import_react.useState)(null);
		  const [schedSite, setSchedSite] = (0, import_react.useState)("");
		  const [schedCron, setSchedCron] = (0, import_react.useState)("0 9 * * *");
		  const [schedBusy, setSchedBusy] = (0, import_react.useState)(false);
		  const [recordings, setRecordings] = (0, import_react.useState)(() => {
		    try {
		      return JSON.parse(localStorage.getItem("dsh-opencli-recordings") ?? "[]");
		    } catch {
		      return [];
		    }
		  });
		  const [isRec, setIsRec] = (0, import_react.useState)(false);
		  const [recName, setRecName] = (0, import_react.useState)("");
		  const [recSteps, setRecSteps] = (0, import_react.useState)([]);
		  const [assetHits, setAssetHits] = (0, import_react.useState)(null);
		  const [assetBusy, setAssetBusy] = (0, import_react.useState)(false);
		  const [scripts, setScripts] = (0, import_react.useState)(null);
		  const [diagOpen, setDiagOpen] = (0, import_react.useState)(false);
		  const [logTail, setLogTail] = (0, import_react.useState)(null);
		  const [starting, setStarting] = (0, import_react.useState)(false);
		  const [updState, setUpdState] = (0, import_react.useState)("idle");
		  const [msgInput, setMsgInput] = (0, import_react.useState)("");
		  const [toastQ, setToastQ] = (0, import_react.useState)(0);
		  const t2 = (k) => STR[lang][k] ?? STR.zh[k];
		  const showToast = (msg, ok) => {
		    setToast({
		      msg,
		      ok
		    });
		    setToastQ((q) => q + 1);
		    window.setTimeout(() => {
		      setToast((cur) => cur !== null && cur.msg === msg ? null : cur);
		    }, 1800);
		  };
		  const reload = async () => {
		    const [st, se, ad, mode, sch, au] = await Promise.all([
		      rpc("status"),
		      rpc("settings"),
		      rpc("adapters"),
		      rpc("automation-mode-get"),
		      rpc("schedule-list"),
		      rpc("audit-list")
		    ]);
		    if (st.ok && st.value !== void 0) setStatus(st.value);
		    if (se.ok && se.value !== void 0) setSettings(se.value);
		    if (ad.ok && ad.value !== void 0 && ad.value.ok) setAdapters(ad.value.adapters);
		    if (mode.ok && mode.value !== void 0) setAutoMode(mode.value.mode);
		    if (sch.ok && sch.value !== void 0) setSchedules(sch.value.schedules);
		    if (au.ok && au.value !== void 0) setAudit(au.value);
		    setPhase("ready");
		  };
		  (0, import_react.useEffect)(() => {
		    void reload();
		  }, []);
		  const runLoginCheck = async () => {
		    if (checking) return;
		    setChecking(true);
		    const r = await rpc("login-check");
		    setLogin(r.ok && r.value !== void 0 ? r.value : {
		      ok: false,
		      checkedAt: null,
		      results: [],
		      error: r.error?.message ?? t2("errReq")
		    });
		    setChecking(false);
		  };
		  const startDaemon = async () => {
		    if (starting) return;
		    setStarting(true);
		    const r = await rpc("daemon-start");
		    setStarting(false);
		    showToast(r.ok && r.value?.ok ? r.value.message ?? "ok" : r.ok ? r.value?.message ?? t2("errReq") : r.error?.message ?? t2("errReq"), r.ok && r.value?.ok === true);
		    await reload();
		  };
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
		  const setMode = async (mode) => {
		    const r = await rpc("automation-mode-set", {
		      request: {
		        mode
		      }
		    });
		    if (r.ok) setAutoMode(mode);
		  };
		  const runDemo = async (cmd) => {
		    const line = (cmd ?? runInput).trim();
		    if (line.length === 0 || running) return;
		    setRunning(true);
		    const r = await rpc("try-run", {
		      request: {
		        line
		      }
		    });
		    setRunning(false);
		    if (r.ok && r.value !== void 0 && r.value.ok) setRunOut({
		      cmd: line,
		      text: r.value.text ?? "",
		      ok: true
		    });
		    else {
		      const msg = r.ok ? r.value?.error ?? "" : r.error?.message ?? t2("errReq");
		      setRunOut({
		        cmd: line,
		        text: msg,
		        ok: false
		      });
		    }
		  };
		  const fillInput = (cmd) => {
		    setRunInput(cmd);
		    setTab("ov");
		  };
		  const toggleDisable = async (name, disabled) => {
		    if (disabled === false || window.confirm(t2("confirmDisable")(name))) {
		      const r = await rpc("adapter-disable", {
		        request: {
		          name,
		          disabled
		        }
		      });
		      if (r.ok && r.value !== void 0 && r.value.ok) setAdapters((prev) => prev === null ? prev : prev.map((a) => a.name === name ? {
		        ...a,
		        disabled
		      } : a));
		    }
		  };
		  const copyCmd = async (key, text) => {
		    const ok = await copyText(text);
		    if (ok) {
		      setCopied(key);
		      window.setTimeout(() => setCopied((c) => c === key ? null : c), 1400);
		    }
		  };
		  const expandDetail = async (name) => {
		    if (details[name] !== void 0) return;
		    const r = await rpc("adapter-detail", {
		      request: {
		        name
		      }
		    });
		    if (r.ok && r.value !== void 0) setDetails((d) => ({
		      ...d,
		      [name]: r.value
		    }));
		  };
		  const loadSchedules = async () => {
		    const r = await rpc("schedule-list");
		    if (r.ok && r.value !== void 0) setSchedules(r.value.schedules);
		  };
		  const addSchedule = async () => {
		    if (schedSite.trim().length === 0 || schedBusy) return;
		    setSchedBusy(true);
		    const r = await rpc("schedule-add", {
		      request: {
		        site: schedSite.trim(),
		        cron: schedCron,
		        retry: 3,
		        notify: true
		      }
		    });
		    setSchedBusy(false);
		    if (r.ok) {
		      setSchedSite("");
		      void loadSchedules();
		    } else showToast(r.error?.message ?? t2("errReq"), false);
		  };
		  const toggleSchedule = async (id, enabled) => {
		    const r = await rpc("schedule-toggle", {
		      request: {
		        id,
		        enabled
		      }
		    });
		    if (r.ok) void loadSchedules();
		  };
		  const removeSchedule = async (id) => {
		    const r = await rpc("schedule-remove", {
		      request: {
		        id
		      }
		    });
		    if (r.ok) void loadSchedules();
		  };
		  const runScheduleNow = async (id) => {
		    const r = await rpc("schedule-run-now", {
		      p: {
		        id
		      }
		    });
		    showToast(r.ok ? "run now \u2713" : r.error?.message ?? t2("errReq"), r.ok);
		    window.setTimeout(() => {
		      void loadSchedules();
		    }, 2500);
		  };
		  const persistRecordings = (next) => {
		    setRecordings(next);
		    try {
		      localStorage.setItem("dsh-opencli-recordings", JSON.stringify(next));
		    } catch {
		    }
		  };
		  const replayRecording = async (id) => {
		    const rec = recordings.find((x) => x.id === id);
		    if (rec === void 0) return;
		    for (const step of rec.steps) {
		      const s = step.trim();
		      if (s.length === 0) continue;
		      if (s.startsWith("browser_")) await rpc("replay", {
		        request: {
		          step: s
		        }
		      });
		      else await rpc("try-run", {
		        request: {
		          line: s
		        }
		      });
		    }
		    showToast("replay \u2713", true);
		  };
		  const promoteRecording = async (id) => {
		    const rec = recordings.find((x) => x.id === id);
		    if (rec === void 0) return;
		    await rpc("promote-recording", {
		      request: {
		        name: rec.name,
		        steps: rec.steps
		      }
		    });
		    void searchAssets("");
		  };
		  const searchAssets = async (q) => {
		    if (assetBusy) return;
		    setAssetBusy(true);
		    const r = await rpc("automation-search", {
		      request: {
		        query: q
		      }
		    });
		    setAssetBusy(false);
		    if (r.ok && r.value !== void 0) setAssetHits(r.value.hits);
		  };
		  const loadScripts = async () => {
		    if (scripts !== null) return;
		    const r = await rpc("script-catalog");
		    if (r.ok && r.value !== void 0) setScripts(r.value.scripts);
		  };
		  const openDiag = async () => {
		    setDiagOpen((v) => !v);
		    if (!diagOpen && logTail === null) {
		      const r = await rpc("logs-tail");
		      if (r.ok && r.value !== void 0) setLogTail(r.value);
		    }
		  };
		  const checkUpdate = async () => {
		    setUpdState("checking");
		    try {
		      const cap = await fetch("/dsh-market/api/v1/capabilities");
		      if (cap.ok) {
		        const upd = await fetch("/dsh-market/api/v1/updates?name=dsh-opencli");
		        if (upd.ok) {
		          const j = JSON.parse(await upd.text());
		          const target = j.result?.value?.targetVersion;
		          setUpdState(target !== void 0 && target !== "" ? `${t2("updAvail")} ${target}` : t2("upToDate"));
		          return;
		        }
		      }
		    } catch {
		    }
		    setUpdState(t2("updFallback"));
		  };
		  const loginResults = login?.results ?? [];
		  const daemonUp = status?.daemon?.running === true;
		  const binOk = status?.ok === true && status.bin !== null;
		  const loading = phase === "loading";
		  const chip = (icon, label, state, tip) => (0, import_react.createElement)("span", {
		    className: "o4-chip",
		    title: tip
		  }, icon !== null ? (0, import_react.createElement)("img", {
		    src: icon,
		    alt: ""
		  }) : null, label, (0, import_react.createElement)("span", {
		    className: `o4-dot ${state}`
		  }));
		  const renderOverview = () => {
		    const tryErr = runOut !== null && !runOut.ok;
		    const daemonOff = !daemonUp;
		    return (0, import_react.createElement)(
		      "div",
		      null,
		      // 试试看(通栏)
		      (0, import_react.createElement)("div", {
		        className: "o4-card"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-h3"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-miniico"
		      }, ic("play", true)), t2("tryT"), (0, import_react.createElement)("span", {
		        className: "rt"
		      }, (0, import_react.createElement)("button", {
		        className: "o4-btn",
		        disabled: running || !binOk,
		        onClick: () => {
		          void runDemo();
		        }
		      }, running ? t2("running2") : t2("run")))), (0, import_react.createElement)("div", {
		        className: "o4-sub"
		      }, t2("trySub")), (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          gap: "8px"
		        }
		      }, (0, import_react.createElement)("input", {
		        className: "o4-in mono",
		        value: runInput,
		        placeholder: "site zhihu hot",
		        onChange: (e) => setRunInput(e.target.value),
		        onKeyDown: (e) => {
		          if (e.key === "Enter") void runDemo();
		        }
		      }), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        onClick: () => {
		          void copyText(runInput).then((ok) => showToast(ok ? t2("copied") : t2("errReq"), ok));
		        }
		      }, t2("copy")), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        disabled: running,
		        onClick: () => {
		          void runDemo();
		        }
		      }, t2("rerun"))), runOut !== null ? (0, import_react.createElement)("div", {
		        className: "o4-tryout"
		      }, (0, import_react.createElement)("span", {
		        className: "k"
		      }, `$ ${runOut.cmd}
		`), runOut.text.length > 0 ? runOut.text : runOut.ok ? "\u2014" : t2("siteEmpty"), (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		        className: "lnk",
		        onClick: () => {
		          void copyText(`${runOut.cmd}
		${runOut.text}`);
		        }
		      }, t2("copy")), " ", (0, import_react.createElement)("span", {
		        className: "lnk",
		        onClick: () => {
		          void runDemo(runOut.cmd);
		        }
		      }, t2("rerun")))) : null),
		      // 快捷 + 巡检
		      (0, import_react.createElement)("div", {
		        style: {
		          display: "grid",
		          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
		          gap: "12px"
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "o4-card"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-h3"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-miniico"
		      }, ic("zap", true)), t2("quickT")), (0, import_react.createElement)("div", {
		        className: "o4-sub"
		      }, t2("quickSub")), (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          flexDirection: "column",
		          gap: "7px"
		        }
		      }, ...[
		        [
		          "\u77E5\u4E4E\u70ED\u699C",
		          "site zhihu hot"
		        ],
		        [
		          "B\u7AD9\u641C\u7D22",
		          "site bilibili search"
		        ],
		        [
		          "GitHub \u901A\u77E5",
		          "site github notifications"
		        ],
		        [
		          "\u4E09\u7AD9\u70ED\u699C",
		          "site_batch hot"
		        ]
		      ].map(([label, cmd]) => (0, import_react.createElement)("div", {
		        key: cmd,
		        className: "o4-qrow",
		        onClick: () => fillInput(cmd)
		      }, label, (0, import_react.createElement)("span", {
		        className: "mono"
		      }, cmd), (0, import_react.createElement)("span", {
		        className: "o4arr",
		        style: {
		          color: "#5F6873",
		          display: "flex"
		        }
		      }, ic("chev-r", true)))))), (0, import_react.createElement)("div", {
		        className: "o4-card"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-h3"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-miniico"
		      }, ic("activity", true)), t2("loginT")), (0, import_react.createElement)("div", {
		        className: "o4-sub"
		      }, t2("loginSub")), (0, import_react.createElement)("div", {
		        className: "o4-sites"
		      }, loginResults.length === 0 ? (0, import_react.createElement)("span", {
		        className: "o4-chip"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-dot n"
		      }), t2("unknown")) : loginResults.map((r) => (0, import_react.createElement)("span", {
		        key: r.site,
		        className: `o4-site${r.ok ? "" : " o4-off"}`
		      }, (0, import_react.createElement)("span", {
		        className: "o4-ava",
		        style: {
		          background: "#313845"
		        }
		      }, r.site.slice(0, 2)), r.site, (0, import_react.createElement)("span", {
		        className: "o4-st",
		        style: {
		          color: r.ok ? "#34C759" : r.timedOut ? "#FF9F0A" : "#FF453A"
		        }
		      }, r.ok ? t2("online") : r.timedOut ? t2("timeout") : t2("expired"))))), (0, import_react.createElement)("div", {
		        style: {
		          marginTop: "10px",
		          display: "flex",
		          gap: "8px"
		        }
		      }, (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        disabled: checking,
		        onClick: () => {
		          void runLoginCheck();
		        }
		      }, ic("refresh", true), checking ? t2("checking") : t2("recheck"))))),
		      // 健康卡(daemon 离线时降级为修复态)
		      (0, import_react.createElement)("div", {
		        className: "o4-card"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-h3"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-miniico"
		      }, ic("activity", true)), "opencli \u5065\u5EB7", status === null ? ` \xB7 ${t2("loading")}` : ""), (0, import_react.createElement)("div", {
		        className: "o4-sub"
		      }, `daemon ${status?.daemon?.version ?? "\u2014"} \xB7 extension ${status?.daemon?.extension ?? t2("unknown")} \xB7 sites ${adapters?.length ?? 0}`), (0, import_react.createElement)("div", {
		        className: "o4-cells"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, "daemon"), (0, import_react.createElement)("div", {
		        className: `v${daemonUp ? " on" : ""}`
		      }, status === null ? t2("loading") : daemonUp ? t2("daemonRunning") : t2("daemonDown"))), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, "version"), (0, import_react.createElement)("div", {
		        className: "v"
		      }, status === null ? "\u2026" : status.version ?? "\u2014")), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, "Chrome"), (0, import_react.createElement)("div", {
		        className: "v mut"
		      }, status === null ? "\u2026" : status.daemon?.extension ?? t2("unknown"))), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, "sites"), (0, import_react.createElement)("div", {
		        className: "v"
		      }, status === null ? "\u2026" : String(adapters?.length ?? 0)))), status?.ok === false && status.error !== void 0 ? (0, import_react.createElement)("div", {
		        className: "o4-tryout",
		        style: {
		          marginTop: "9px"
		        }
		      }, status.error) : null, daemonOff || !binOk ? (0, import_react.createElement)("div", {
		        style: {
		          marginTop: "10px"
		        }
		      }, (0, import_react.createElement)("button", {
		        className: "o4-btn",
		        disabled: starting,
		        onClick: () => {
		          void startDaemon();
		        }
		      }, ic("refresh", true), starting ? "\u2026" : t2("fix"))) : null),
		      // 安全中心摘要
		      (0, import_react.createElement)("div", {
		        className: "o4-sec"
		      }, (0, import_react.createElement)("div", {
		        style: {
		          display: "flex",
		          alignItems: "center",
		          gap: "12px",
		          marginBottom: "10px"
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "o4-shield"
		      }, ic("shield")), (0, import_react.createElement)("div", {
		        style: {
		          flex: "1"
		        }
		      }, (0, import_react.createElement)("div", {
		        style: {
		          fontSize: "14px",
		          fontWeight: "600"
		        }
		      }, t2("secT")), (0, import_react.createElement)("div", {
		        className: "o4-sub",
		        style: {
		          margin: "2px 0 0"
		        }
		      }, t2("secSub"), audit !== null && audit.count7d > 0 ? ` \xB7 ${t2("lastBlocked")} ${audit.count7d}` : "")), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        onClick: () => setTab("sec")
		      }, t2("tabSec"), ic("chev-r", true))), (0, import_react.createElement)("div", {
		        className: "o4-cells"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, t2("gateLabel")), (0, import_react.createElement)("div", {
		        className: `v${settings?.approvalOn === true ? " on" : ""}`
		      }, settings?.approvalOn === true ? t2("gateOn") : t2("gateOff"))), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, t2("tabAuto")), (0, import_react.createElement)("div", {
		        className: "v"
		      }, autoMode)), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, t2("rateT")), (0, import_react.createElement)("div", {
		        className: "v mut"
		      }, "750ms \xB7 \xD72 \xB7 30s")), (0, import_react.createElement)("div", {
		        className: "o4-cell"
		      }, (0, import_react.createElement)("div", {
		        className: "l"
		      }, t2("lastBlocked")), (0, import_react.createElement)("div", {
		        className: "v"
		      }, String(audit?.count7d ?? 0)))), (0, import_react.createElement)("div", {
		        className: "o4-proof"
		      }, ...[
		        t2("proofNoTelemetry"),
		        t2("proofNoCurl"),
		        t2("proofFailClosed"),
		        t2("proofClip"),
		        t2("proofRel")
		      ].map((p) => (0, import_react.createElement)("span", {
		        key: p
		      }, ic("check-c"), p)))),
		      // 更多
		      (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		        style: {
		          fontSize: "12px",
		          color: "#5F6873",
		          margin: "2px 2px 8px"
		        }
		      }, t2("more")), (0, import_react.createElement)("div", {
		        className: "o4-acc",
		        onClick: () => {
		          void openDiag();
		        }
		      }, (0, import_react.createElement)("b", null, t2("guide")), `\u2014\u2014 ${t2("guideD")}`, (0, import_react.createElement)("span", {
		        className: "o4arr"
		      }, t2("detail"), ic("chev-r", true))), (0, import_react.createElement)("div", {
		        className: "o4-acc"
		      }, (0, import_react.createElement)("b", null, t2("profileT")), `\u2014\u2014 ${t2("profileD")}`, (0, import_react.createElement)("span", {
		        className: "o4arr"
		      }, t2("detail"), ic("chev-r", true))), (0, import_react.createElement)("div", {
		        className: "o4-acc",
		        onClick: () => {
		          window.open(DSH_URL, "_blank");
		        }
		      }, (0, import_react.createElement)("b", null, t2("jump")), `\u2014\u2014 ${t2("jumpD")}`, (0, import_react.createElement)("span", {
		        className: "o4arr"
		      }, t2("open"), ic("ext", true)))),
		      daemonOff && !loading ? (0, import_react.createElement)("div", {
		        className: "o4-diag bad",
		        onClick: () => {
		          void startDaemon();
		        }
		      }, ic("alert", true), t2("depDaemon"), (0, import_react.createElement)("span", {
		        className: "o4arr"
		      }, t2("fix"), ic("chev-r", true))) : null
		    );
		  };
		  const renderCommands = () => {
		    const q = query.trim().toLowerCase();
		    const filtered = (adapters ?? []).filter((a) => q.length === 0 || a.name.toLowerCase().includes(q) || a.commands.some((c) => c.toLowerCase().includes(q)) || (a.sample ?? "").toLowerCase().includes(q));
		    return (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        gap: "9px",
		        alignItems: "center",
		        marginBottom: "6px"
		      }
		    }, (0, import_react.createElement)("div", {
		      style: {
		        flex: "1",
		        display: "flex",
		        alignItems: "center",
		        gap: "8px",
		        background: "#14171C",
		        border: "1px solid #313845",
		        borderRadius: "9px",
		        padding: "0 12px"
		      }
		    }, (0, import_react.createElement)("span", {
		      style: {
		        color: "#5F6873",
		        display: "flex"
		      }
		    }, ic("search", true)), (0, import_react.createElement)("input", {
		      className: "o4-in",
		      style: {
		        border: "0",
		        padding: "8px 0"
		      },
		      placeholder: t2("cmdSearch"),
		      value: query,
		      onChange: (e) => setQuery(e.target.value)
		    })), (0, import_react.createElement)("span", {
		      style: {
		        fontSize: "11.5px",
		        color: "#5F6873"
		      }
		    }, `${adapters?.length ?? 0} \xB7 ${(adapters ?? []).filter((a) => a.disabled !== true).length}`)), (0, import_react.createElement)("div", {
		      className: "o4-note",
		      style: {
		        margin: "0 0 10px"
		      }
		    }, t2("cmdFmt")), (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: "8px"
		      }
		    }, loading ? (0, import_react.createElement)("div", {
		      className: "o4-load"
		    }, t2("loading")) : null, !loading && filtered.map((a) => {
		      const detail = details[a.name];
		      return (0, import_react.createElement)("div", {
		        key: a.name
		      }, (0, import_react.createElement)("div", {
		        className: `o4-row${a.disabled === true ? " o4-off" : ""}`,
		        onClick: () => {
		          void expandDetail(a.name);
		        }
		      }, (0, import_react.createElement)("span", {
		        className: "o4-ava",
		        style: {
		          background: "#313845"
		        }
		      }, a.name.slice(0, 2)), (0, import_react.createElement)("div", {
		        className: "grow"
		      }, (0, import_react.createElement)("div", {
		        className: "o4-tt"
		      }, a.name, " ", a.sample !== void 0 && a.sample.length > 0 ? (0, import_react.createElement)("span", {
		        className: "o4-bdg b",
		        onClick: (e) => {
		          e.stopPropagation();
		          fillInput(`site ${a.name} ${a.sample}`);
		        }
		      }, a.sample, " ", ic("copy", true)) : null), (0, import_react.createElement)("div", {
		        className: "o4-dd"
		      }, t2("commandsN")(a.commandCount), a.disabled === true ? " \xB7 disabled" : "")), a.disabled === true ? null : (0, import_react.createElement)("span", {
		        className: "o4-bdg w"
		      }, `write ${a.kinds.filter((k) => k === "write").length}`), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        onClick: (e) => {
		          e.stopPropagation();
		          void toggleDisable(a.name, a.disabled !== true);
		        }
		      }, a.disabled === true ? t2("enable") : t2("disable"))), details[a.name] !== void 0 ? (0, import_react.createElement)("div", {
		        className: "o4-card",
		        style: {
		          marginTop: "6px",
		          padding: "8px 12px"
		        }
		      }, detail === void 0 ? (0, import_react.createElement)("div", {
		        className: "o4-load"
		      }, t2("loading")) : detail.ok ? detail.commands.map((c) => {
		        const cmdText = `site ${a.name} ${c.name}`;
		        const key = `${a.name}:${c.name}`;
		        return (0, import_react.createElement)("div", {
		          key: c.name,
		          className: "o4-qrow",
		          title: `${cmdText}
		${c.description}`,
		          onClick: () => {
		            void copyCmd(key, cmdText);
		          }
		        }, (0, import_react.createElement)("span", null, c.name), (0, import_react.createElement)("span", {
		          className: "o4-bdg",
		          style: {
		            marginLeft: "6px"
		          }
		        }, c.access), (0, import_react.createElement)("span", {
		          style: {
		            color: "#5F6873",
		            fontSize: "11px",
		            overflow: "hidden",
		            textOverflow: "ellipsis",
		            whiteSpace: "nowrap",
		            flex: "1"
		          }
		        }, c.description), copied === key ? (0, import_react.createElement)("span", {
		          className: "o4-bdg b"
		        }, t2("copied")) : (0, import_react.createElement)("span", {
		          style: {
		            color: "#5F6873",
		            display: "flex"
		          }
		        }, ic("copy", true)));
		      }) : (0, import_react.createElement)("div", {
		        className: "o4-load"
		      }, detail.error ?? t2("errReq"))) : null);
		    }), !loading && filtered.length === 0 ? (0, import_react.createElement)("div", {
		      className: "o4-load"
		    }, "\u2014") : null));
		  };
		  const renderAutomation = () => {
		    return (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "o4-card"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-h3"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("clock", true)), t2("autoT"), (0, import_react.createElement)("span", {
		      className: "rt"
		    }, (0, import_react.createElement)("button", {
		      className: "o4-btn sm",
		      onClick: () => fillInput("")
		    }, ic("plus", true), t2("autoNew")))), (0, import_react.createElement)("div", {
		      className: "o4-sub"
		    }, t2("autoSub")), !daemonUp ? (0, import_react.createElement)("div", {
		      className: "o4-diag bad",
		      style: {
		        marginBottom: "9px"
		      },
		      onClick: () => {
		        void startDaemon();
		      }
		    }, ic("alert", true), t2("depDaemon"), (0, import_react.createElement)("span", {
		      className: "o4arr"
		    }, t2("fix"), ic("chev-r", true))) : null, (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        gap: "8px",
		        marginBottom: "10px"
		      }
		    }, (0, import_react.createElement)("input", {
		      className: "o4-in",
		      placeholder: "site zhihu hot",
		      value: schedSite,
		      onChange: (e) => setSchedSite(e.target.value)
		    }), (0, import_react.createElement)("input", {
		      className: "o4-in cron",
		      style: {
		        maxWidth: "110px"
		      },
		      placeholder: "cron",
		      value: schedCron,
		      onChange: (e) => setSchedCron(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "o4-btn sm",
		      disabled: schedBusy,
		      onClick: () => {
		        void addSchedule();
		      }
		    }, t2("create"))), (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: "8px"
		      }
		    }, schedules.length === 0 ? (0, import_react.createElement)("div", {
		      className: "o4-load"
		    }, "\u2014") : null, schedules.map((s) => {
		      const hist = s.history ?? [];
		      const dots = [
		        0,
		        1,
		        2,
		        3,
		        4
		      ].map((i) => {
		        const h = hist[i];
		        return (0, import_react.createElement)("span", {
		          key: i,
		          className: `o4-hp${h === void 0 ? " n" : h.ok ? "" : " f"}`
		        });
		      });
		      const okN = hist.filter((h) => h.ok).length;
		      return (0, import_react.createElement)("div", {
		        key: s.id,
		        className: "o4-row"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-ava",
		        style: {
		          background: "#313845"
		        }
		      }, s.site.replace("site ", "").slice(0, 2)), (0, import_react.createElement)("div", {
		        className: "grow",
		        style: {
		          minWidth: "140px"
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "o4-tt"
		      }, s.site)), (0, import_react.createElement)("span", {
		        className: "o4-hpts"
		      }, dots), (0, import_react.createElement)("button", {
		        className: "o4-sw" + (s.enabled ? " on" : ""),
		        title: s.enabled ? "enabled" : "disabled",
		        onClick: () => {
		          void toggleSchedule(s.id, !s.enabled);
		        }
		      }), (0, import_react.createElement)("div", {
		        className: "meta"
		      }, (0, import_react.createElement)("span", {
		        className: "o4-cron"
		      }, s.cron), (0, import_react.createElement)("span", null, `${t2("last")} ${hist[0]?.at?.slice(5, 16) ?? "\u2014"} \xB7 ${okN}/${hist.length || 0} \u2713`), (0, import_react.createElement)("span", {
		        className: "o4-bdg b"
		      }, t2("retryN")(s.retry ?? 3)), (0, import_react.createElement)("span", {
		        className: "o4-bdg"
		      }, s.notify === false ? t2("notifyOff") : t2("notifyOn")), (0, import_react.createElement)("span", {
		        style: {
		          flex: "1"
		        }
		      }), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        onClick: () => {
		          void runScheduleNow(s.id);
		        }
		      }, t2("runNow")), (0, import_react.createElement)("button", {
		        className: "o4-btn ghost sm",
		        onClick: () => {
		          void removeSchedule(s.id);
		        }
		      }, t2("del"))));
		    })), (0, import_react.createElement)("div", {
		      className: "o4-note"
		    }, t2("v4host"))), (0, import_react.createElement)("div", {
		      style: {
		        display: "grid",
		        gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
		        gap: "12px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "o4-card"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-h3"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("rec", true)), t2("recT")), (0, import_react.createElement)("div", {
		      className: "o4-sub"
		    }, t2("recSub")), (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: "8px"
		      }
		    }, recordings.map((rec) => (0, import_react.createElement)("div", {
		      key: rec.id,
		      className: "o4-row"
		    }, (0, import_react.createElement)("div", {
		      className: "grow"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-tt"
		    }, rec.name), (0, import_react.createElement)("div", {
		      className: "o4-dd"
		    }, `${rec.steps.length} \u6B65 \xB7 ${rec.steps[0] ?? ""}`)), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => {
		        void replayRecording(rec.id);
		      }
		    }, t2("replay")), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => {
		        void promoteRecording(rec.id);
		      }
		    }, "\u2192")))), isRec ? (0, import_react.createElement)("div", {
		      style: {
		        marginTop: "9px",
		        display: "flex",
		        gap: "6px",
		        flexWrap: "wrap"
		      }
		    }, (0, import_react.createElement)("input", {
		      className: "o4-in",
		      style: {
		        maxWidth: "150px"
		      },
		      placeholder: t2("recName"),
		      value: recName,
		      onChange: (e) => setRecName(e.target.value)
		    }), (0, import_react.createElement)("input", {
		      className: "o4-in",
		      style: {
		        maxWidth: "190px"
		      },
		      placeholder: t2("recStep"),
		      value: recSteps[recSteps.length - 1] ?? "",
		      onChange: (e) => setRecSteps([
		        ...recSteps.slice(0, -1),
		        e.target.value
		      ])
		    }), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => setRecSteps([
		        ...recSteps,
		        ""
		      ])
		    }, t2("recAdd")), (0, import_react.createElement)("button", {
		      className: "o4-btn sm",
		      onClick: () => {
		        setIsRec(false);
		      }
		    }, t2("recStop"))) : (0, import_react.createElement)("div", {
		      style: {
		        marginTop: "9px"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => {
		        setIsRec(true);
		        setRecSteps([]);
		      }
		    }, ic("rec", true), t2("recStart")))), (0, import_react.createElement)("div", {
		      className: "o4-card"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-h3"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("layers", true)), t2("assetT")), (0, import_react.createElement)("div", {
		      className: "o4-sub"
		    }, t2("assetSub")), (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        gap: "7px",
		        marginBottom: "9px"
		      }
		    }, (0, import_react.createElement)("input", {
		      className: "o4-in",
		      placeholder: t2("assetSearch"),
		      onChange: (e) => {
		        if (e.target.value.length >= 2) void searchAssets(e.target.value);
		      }
		    }), (0, import_react.createElement)("button", {
		      className: "btn ghost sm",
		      onClick: () => {
		        void loadScripts();
		      }
		    }, t2("browse"))), (0, import_react.createElement)("div", {
		      className: "o4-cells",
		      style: {
		        gridTemplateColumns: "repeat(3,1fr)"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "o4-cell"
		    }, (0, import_react.createElement)("div", {
		      className: "l"
		    }, t2("builtinT")), (0, import_react.createElement)("div", {
		      className: "v"
		    }, String(scripts?.length ?? "\u2014"))), (0, import_react.createElement)("div", {
		      className: "o4-cell"
		    }, (0, import_react.createElement)("div", {
		      className: "l"
		    }, t2("recipes")), (0, import_react.createElement)("div", {
		      className: "v"
		    }, String(assetHits?.length ?? "\u2014"))), (0, import_react.createElement)("div", {
		      className: "o4-cell"
		    }, (0, import_react.createElement)("div", {
		      className: "l"
		    }, t2("rulepacks")), (0, import_react.createElement)("div", {
		      className: "v"
		    }, "\u2014"))))));
		  };
		  const renderSecurity = () => {
		    const modes = [
		      [
		        "read-only",
		        t2("modeReadOnly"),
		        "activity"
		      ],
		      [
		        "standard",
		        t2("modeStandard"),
		        "shield"
		      ],
		      [
		        "autonomous",
		        t2("modeAuto"),
		        "zap"
		      ],
		      [
		        "unrestricted",
		        t2("modeUnres"),
		        "alert"
		      ]
		    ];
		    const diagText = `bin: ${status?.bin ?? "\u2014"} | version: ${status?.version ?? "\u2014"} | mode: ${autoMode} | approval: ${settings?.approvalOn === true ? "on" : "off"} | daemon: ${daemonUp ? "running" : "down"}`;
		    return (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "o4-sec"
		    }, (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        alignItems: "flex-start",
		        gap: "12px",
		        marginBottom: "12px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "o4-shield"
		    }, ic("shield")), (0, import_react.createElement)("div", {
		      style: {
		        flex: "1"
		      }
		    }, (0, import_react.createElement)("div", {
		      style: {
		        fontSize: "14px",
		        fontWeight: "600"
		      }
		    }, t2("gateLabel")), (0, import_react.createElement)("div", {
		      className: "o4-sub",
		      style: {
		        margin: "3px 0 0"
		      }
		    }, t2("gateDesc"))), (0, import_react.createElement)("div", {
		      style: {
		        textAlign: "center"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: `o4-sw${settings?.approvalOn === true ? " on" : ""}`,
		      style: {
		        transform: "scale(1.12)"
		      },
		      onClick: () => {
		        void setApproval(!(settings?.approvalOn === true));
		      }
		    }), (0, import_react.createElement)("div", {
		      style: {
		        fontSize: "10px",
		        color: settings?.approvalOn === true ? "#34C759" : "#5F6873",
		        marginTop: "4px"
		      }
		    }, settings?.approvalOn === true ? t2("gateOnLabel") : t2("gateOffLabel")))), (0, import_react.createElement)("div", {
		      className: "o4-modes"
		    }, modes.map(([m, desc, icon]) => (0, import_react.createElement)("div", {
		      key: m,
		      className: `o4-mode${autoMode === m ? " on" : ""}`,
		      onClick: () => {
		        void setMode(m);
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "mi"
		    }, ic(icon, true), (0, import_react.createElement)("b", null, m)), (0, import_react.createElement)("span", null, desc), (0, import_react.createElement)("span", {
		      className: "o4-mchk"
		    }, ic("check-c", true)))))), (0, import_react.createElement)("div", {
		      style: {
		        display: "grid",
		        gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
		        gap: "12px",
		        marginBottom: "12px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "o4-card"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-h3"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("sliders", true)), t2("rateT")), (0, import_react.createElement)("div", {
		      className: "o4-sub"
		    }, t2("rateSub")), (0, import_react.createElement)("div", {
		      className: "o4-stat"
		    }, (0, import_react.createElement)("span", null, "minDelay"), (0, import_react.createElement)("b", null, "750 ms")), (0, import_react.createElement)("div", {
		      className: "o4-stat"
		    }, (0, import_react.createElement)("span", null, "maxConcurrency"), (0, import_react.createElement)("b", null, "2")), (0, import_react.createElement)("div", {
		      className: "o4-stat"
		    }, (0, import_react.createElement)("span", null, "burst / cooldown"), (0, import_react.createElement)("b", null, "3 / 30 s")), (0, import_react.createElement)("div", {
		      className: "o4-stat"
		    }, (0, import_react.createElement)("span", null, "maxPagesPerRun"), (0, import_react.createElement)("b", null, "20")), (0, import_react.createElement)("div", {
		      className: "o4-stat"
		    }, (0, import_react.createElement)("span", null, "authProfiles"), (0, import_react.createElement)("b", null, "allowedDomains \u2713"))), (0, import_react.createElement)("div", {
		      className: "o4-card"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-h3"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("check-c", true)), t2("proofT")), (0, import_react.createElement)("div", {
		      className: "o4-sub"
		    }, t2("proofSub")), ...[
		      t2("proofNoTelemetry"),
		      t2("proofNoCurl"),
		      t2("proofFailClosed"),
		      t2("proofClip"),
		      t2("proofRel")
		    ].map((p) => (0, import_react.createElement)("div", {
		      key: p,
		      className: "o4-vrow"
		    }, ic("check-c"), (0, import_react.createElement)("span", null, p), (0, import_react.createElement)("em", null, t2("verified")))), (0, import_react.createElement)("span", {
		      className: "o4-hash"
		    }, `${t2("shaLine")}: ${settings?.sha256 ?? "\u2014"}`))), (0, import_react.createElement)("div", {
		      className: "o4-card",
		      style: {
		        display: "flex",
		        alignItems: "center",
		        gap: "11px",
		        marginBottom: "12px"
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "o4-miniico"
		    }, ic("refresh", true)), (0, import_react.createElement)("div", {
		      style: {
		        flex: "1"
		      }
		    }, (0, import_react.createElement)("div", {
		      style: {
		        fontSize: "12.5px",
		        fontWeight: "600"
		      }
		    }, t2("verT")), (0, import_react.createElement)("div", {
		      style: {
		        fontSize: "11px",
		        color: "#5F6873"
		      }
		    }, `${t2("verNow")} v0.4.0 \xB7 ${t2("channel")} \xB7 ${t2("updMarket")}`)), (0, import_react.createElement)("span", {
		      className: "o4-bdg"
		    }, typeof updState === "string" && updState !== "idle" && updState !== "checking" ? updState : t2("upToDate")), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      disabled: updState === "checking",
		      onClick: () => {
		        void checkUpdate();
		      }
		    }, updState === "checking" ? t2("updating") : t2("checkUpd")), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => {
		        window.open(RELEASES_URL, "_blank");
		      }
		    }, ic("ext", true))), diagOpen ? (0, import_react.createElement)("div", {
		      className: "o4-diagopen"
		    }, (0, import_react.createElement)("div", {
		      className: "bar"
		    }, ic("alert", true), t2("diagT"), (0, import_react.createElement)("span", {
		      className: "o4arr",
		      onClick: () => {
		        void openDiag();
		      }
		    }, t2("detail"), ic("chev-d", true))), (0, import_react.createElement)("div", {
		      className: "body"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-kv"
		    }, (0, import_react.createElement)("span", {
		      className: "k"
		    }, t2("diagSub")), (0, import_react.createElement)("span", {
		      className: "v"
		    }, logTail?.hint ?? t2("noLog"))), (0, import_react.createElement)("div", {
		      className: "o4-tryout",
		      style: {
		        marginTop: "8px"
		      }
		    }, (logTail?.lines ?? []).join("\n") || diagText), (0, import_react.createElement)("div", {
		      className: "o4-fixrow"
		    }, (0, import_react.createElement)("button", {
		      className: "o4-btn sm",
		      onClick: () => {
		        void startDaemon();
		      }
		    }, t2("fix")), (0, import_react.createElement)("button", {
		      className: "o4-btn ghost sm",
		      onClick: () => {
		        void copyText(diagText + "\n" + (logTail?.lines ?? []).join("\n"));
		      }
		    }, t2("copyDiag"))))) : (0, import_react.createElement)("div", {
		      className: "o4-diag ok",
		      onClick: () => {
		        void openDiag();
		      }
		    }, ic("check-c", true), t2("diagAll"), (0, import_react.createElement)("span", {
		      className: "o4arr"
		    }, t2("detail"), ic("chev-d", true))), (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "o4-acc",
		      onClick: () => {
		        void openDiag();
		      }
		    }, (0, import_react.createElement)("b", null, t2("guide")), `\u2014\u2014 ${t2("guideD")}`, (0, import_react.createElement)("span", {
		      className: "o4arr"
		    }, t2("detail"), ic("chev-r", true))), (0, import_react.createElement)("div", {
		      className: "o4-acc"
		    }, (0, import_react.createElement)("b", null, t2("profileT")), `\u2014\u2014 ${t2("profileD")}`, (0, import_react.createElement)("span", {
		      className: "o4arr"
		    }, t2("detail"), ic("chev-r", true)))));
		  };
		  const loadingBlock = () => (0, import_react.createElement)("div", {
		    className: "o4-card"
		  }, (0, import_react.createElement)("div", {
		    className: "o4-load"
		  }, t2("loading")), (0, import_react.createElement)("div", {
		    className: "o4-skel"
		  }), (0, import_react.createElement)("div", {
		    className: "o4-skel",
		    style: {
		      width: "70%"
		    }
		  }), (0, import_react.createElement)("div", {
		    className: "o4-skel",
		    style: {
		      width: "85%"
		    }
		  }));
		  return (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		    style: {
		      display: "none"
		    },
		    dangerouslySetInnerHTML: {
		      __html: SPRITE
		    }
		  }), (0, import_react.createElement)("style", null, CSS), (0, import_react.createElement)(
		    "div",
		    {
		      className: "o4"
		    },
		    // 页头(品牌鲸标)
		    (0, import_react.createElement)("div", {
		      className: "o4-head"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-logo",
		      title: "OpenCLI \xD7 DeepSeek",
		      dangerouslySetInnerHTML: {
		        __html: '<svg viewBox="0 0 64 64" width="46" height="46"><rect width="64" height="64" rx="14" fill="#0a0a0f"/><defs><linearGradient id="o4gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00e5a0"/><stop offset=".5" stop-color="#00b4d8"/><stop offset="1" stop-color="#7b61ff"/></linearGradient></defs><path fill="#fff" fill-rule="evenodd" transform="translate(14,23) scale(1.5)" d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45"/><path d="M9 10.5 L15.5 15 L9 19.5" fill="none" stroke="url(#o4gl)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="18.5" y="10.5" width="3.6" height="9" rx="1.1" fill="url(#o4gl)"/></svg>'
		      }
		    }), (0, import_react.createElement)("div", null, (0, import_react.createElement)("div", {
		      className: "o4-h1"
		    }, t2("title")), (0, import_react.createElement)("div", {
		      className: "o4-desc"
		    }, t2("desc"))), (0, import_react.createElement)("div", {
		      className: "o4-hr"
		    }, (0, import_react.createElement)("div", {
		      className: "o4-seg"
		    }, (0, import_react.createElement)("button", {
		      className: lang === "zh" ? "on" : "",
		      onClick: () => setLang("zh")
		    }, "\u4E2D\u6587"), (0, import_react.createElement)("button", {
		      className: lang === "en" ? "on" : "",
		      onClick: () => setLang("en")
		    }, "EN")))),
		    // Tabs
		    (0, import_react.createElement)("div", {
		      className: "o4-tabs"
		    }, ...[
		      [
		        "ov",
		        t2("tabOverview")
		      ],
		      [
		        "cmd",
		        t2("tabCommands")
		      ],
		      [
		        "auto",
		        t2("tabAuto")
		      ],
		      [
		        "sec",
		        t2("tabSec")
		      ]
		    ].map(([k, label]) => (0, import_react.createElement)("button", {
		      key: k,
		      className: tab === k ? "on" : "",
		      onClick: () => setTab(k)
		    }, label))),
		    // 状态条(指示灯)
		    (0, import_react.createElement)("div", {
		      className: "o4-status"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-chip",
		      title: `daemon ${daemonUp ? t2("daemonRunning") : t2("daemonDown")}`
		    }, (0, import_react.createElement)("span", {
		      className: `o4-dot ${daemonUp ? "g" : "r"}`
		    }), "daemon"), (0, import_react.createElement)("span", {
		      className: "o4-chip",
		      title: "BrowserBridge connected"
		    }, (0, import_react.createElement)("span", {
		      className: "o4-dot g"
		    }), "Bridge"), (0, import_react.createElement)("span", {
		      className: "o4-chip",
		      title: "Chrome"
		    }, ic("monitor", true)), (0, import_react.createElement)("span", {
		      className: "o4-sep"
		    }), ...loginResults.length > 0 ? loginResults.map((r) => chip(null, r.site, r.ok ? "g" : r.timedOut ? "y" : "r", `${r.site}: ${r.ok ? t2("online") : r.timedOut ? t2("timeout") : t2("expired")}${r.detail !== null ? ` \xB7 ${r.detail}` : ""}`)) : [
		      chip(null, "zhihu", "n"),
		      chip(null, "bilibili", "n"),
		      chip(null, "github", "n")
		    ], (0, import_react.createElement)("span", {
		      className: "o4-chip",
		      style: {
		        marginLeft: "auto",
		        cursor: "pointer"
		      },
		      onClick: () => {
		        void runLoginCheck();
		      },
		      title: t2("recheck")
		    }, ic("refresh", true))),
		    // 诊断条
		    (0, import_react.createElement)("div", {
		      className: `o4-diag ${daemonUp && binOk ? "ok" : "bad"}`,
		      onClick: () => {
		        void openDiag();
		      }
		    }, ic(daemonUp && binOk ? "check-c" : "alert", true), daemonUp && binOk ? t2("diagAll") : t2("depDaemon"), (0, import_react.createElement)("span", {
		      className: "o4arr"
		    }, t2("detail"), ic("chev-d", true))),
		    // 内容
		    loading ? loadingBlock() : tab === "ov" ? renderOverview() : tab === "cmd" ? renderCommands() : tab === "auto" ? renderAutomation() : renderSecurity()
		  ), toast !== null ? (0, import_react.createElement)("div", {
		    className: "o4-toast",
		    style: {
		      background: toast.ok ? "#4DDB7A" : "#FF453A"
		    }
		  }, toast.msg) : null);
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
