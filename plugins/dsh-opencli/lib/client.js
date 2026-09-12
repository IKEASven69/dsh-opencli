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
		var STR = {
		  zh: {
		    title: "OpenCLI \u7BA1\u7406\u4E2D\u5FC3",
		    desc: "\u6D4F\u89C8\u5185\u7F6E OpenCLI \u547D\u4EE4;dsh \u4F1A\u8BDD\u7ECF site \u5DE5\u5177\u76F4\u63A5\u8C03\u7528,\u7F3A\u5931\u7AD9\u70B9\u53EF\u8BA9\u6A21\u578B\u73B0\u573A\u521B\u4F5C\u3002",
		    refresh: "\u5237\u65B0/\u8BCA\u65AD",
		    diagnosing: "\u68C0\u6D4B\u4E2D\u2026",
		    langName: "EN",
		    s0t: "0. \u8BD5\u8BD5\u770B",
		    s0tag: "\u7ACB\u523B\u80FD\u7528",
		    s0hint: "\u4E0D\u77E5\u9053\u5E72\u561B?\u70B9\u201C\u6211\u8DD1\u4E00\u4E0B\u201D,\u9762\u677F\u7ECF try-run \u771F\u8DD1\u4E00\u6761\u547D\u4EE4\u628A\u7ED3\u679C\u62FF\u56DE\u6765\u3002",
		    s0demo: "\u6211\u8DD1\u4E00\u4E0B",
		    s0run: "\u8DD1\u8FD9",
		    s0ph: "\u60F3\u8DD1\u4EC0\u4E48\u547D\u4EE4,\u5982:site arxiv recent cs.AI",
		    s05t: "0.5 \u641C\u7AD9\u70B9",
		    s05hint: "\u70B9\u7AD9\u70B9 tag \u586B\u8FDB\u641C\u7D22\u6846;\u641C\u7AD9\u70B9\u540D \u2192 \u590D\u5236 opencli \u547D\u4EE4\u3002",
		    s05searchPh: "\u641C\u7D22\u7AD9\u70B9\u3001\u547D\u4EE4\u6216\u63CF\u8FF0",
		    s05cmds: "\u6761\u547D\u4EE4",
		    s05empty: "\u6CA1\u6709\u5339\u914D\u7684\u7AD9\u70B9\u6216\u547D\u4EE4",
		    s05call: "dsh \u4F1A\u8BDD\u8C03\u7528:",
		    s05copyHint: "\xB7 \u70B9\u51FB\u884C\u590D\u5236\u5B8C\u6574\u547D\u4EE4",
		    s05disable: "\u7981\u7528",
		    s05enable: "\u542F\u7528",
		    s05disabled: "\u5DF2\u7981\u7528",
		    s05copied: "\u5DF2\u590D\u5236",
		    s05loading: "loading\u2026",
		    s05loadFail: "\u52A0\u8F7D\u5931\u8D25",
		    s05siteCmds: "Site \u547D\u4EE4",
		    s05appCmds: "App \u547D\u4EE4",
		    s05siteTitle: "\u7F51\u7AD9\u9002\u914D\u5668\u2014\u2014\u5728\u767B\u5F55\u6001 Chrome \u91CC\u6267\u884C",
		    s05appTitle: "\u672C\u5730\u684C\u9762\u5E94\u7528\u9002\u914D\u5668(Codex/Cursor/Trae \u7B49,\u7ECF CDP \u64CD\u63A7\u76EE\u6807\u5E94\u7528;\u9700\u672C\u673A\u88C5\u6709\u5BF9\u5E94\u5E94\u7528,\u4E0D\u4F9D\u8D56 OpenCLIApp)",
		    s06t: "0.6 \u5B9E\u7528\u5FEB\u6377",
		    s06tag: "\u65B0",
		    s06diag: "\u5931\u8D25\u8BCA\u65AD ?",
		    s06skill: "\u88C5 opencli skill",
		    s06patch: "\u5207\u5230 Patchright",
		    s06hon: "\u5F00 headless",
		    s06hoff: "\u5173 headless",
		    s06ro: "\u5207\u5230 read-only",
		    s06auto: "\u5207\u5230 autonomous",
		    s06hint: "\u70B9\u6309\u94AE \u2192 \u6587\u672C\u590D\u5236\u5230\u526A\u8D34\u677F + \u8DF3 dsh \u5BF9\u8BDD\u6846,\u53BB\u7C98\u8D34\u53D1\u9001\u3002\u5931\u8D25\u8BCA\u65AD\u4F1A\u5148\u5F39\u7A97\u518D\u8DF3\u3002",
		    s1t: "1. opencli \u5065\u5EB7",
		    s1daemon: "daemon",
		    s1running: "\u8FD0\u884C\u4E2D",
		    s1stopped: "\u672A\u8FD0\u884C",
		    s1start: "\u542F\u52A8 daemon",
		    s1starting: "\u542F\u52A8\u4E2D\u2026",
		    s1ext: "Chrome \u6269\u5C55",
		    s1extOn: "\u5DF2\u8FDE\u63A5",
		    s1approval: "write \u5BA1\u6279\u95E8",
		    s1approvalOn: "\u5F00\u542F(site \u5199\u64CD\u4F5C\u5148\u7ECF\u786E\u8BA4)",
		    s1approvalOff: "\u5173\u95ED",
		    s1on: "\u5F00\u542F",
		    s1off: "\u5173\u95ED",
		    s1loginCan: "\u4E2A\u7AD9\u70B9\u53EF\u5DE1\u68C0",
		    s1login: "\u767B\u5F55\u6001",
		    s1check: "\u5DE1\u68C0\u767B\u5F55\u6001",
		    s1checking: "\u5DE1\u68C0\u4E2D\u2026",
		    s1collapse: "\u6536\u8D77",
		    s1runtime: "\u8FD0\u884C\u65F6",
		    s1mode: "\u81EA\u52A8\u5316\u6863",
		    s1sites: "\u7AD9\u70B9",
		    s1cmds: "\u547D\u4EE4",
		    s1ver: "v",
		    s1okTag: "\u6B63\u5E38",
		    s1loginHint: "\u7EFF=\u5DF2\u767B \xB7 \u9EC4=\u8D85\u65F6 \xB7 \u7EA2=\u672A\u767B \xB7 5+ \u6298\u53E0 \xB7 \u6362\u767B\u5F55\u53BB dsh \u5BF9\u8BDD\u6846\u8BF4\u201C\u6362\u5FAE\u535A\u8D26\u53F7\u201D",
		    s1timeout: "\u63A2\u6D4B\u8D85\u65F6",
		    s1checkFail: "\u5DE1\u68C0\u5931\u8D25",
		    s2t: "2. \u5B9A\u65F6\u4EFB\u52A1",
		    s2hint: "\u65B0\u5EFA/\u6539/\u5220 \u2192 \u53BB dsh \u5BF9\u8BDD\u8BF4\u201C\u5EFA\u4E00\u4E2A\u6BCF\u59299\u70B9\u8DD1 arxiv \u7EFC\u8FF0\u201D",
		    s2sitePh: "site \u547D\u4EE4(\u5982:zhihu hot)",
		    s2cronPh: "cron",
		    s2create: "\u521B\u5EFA",
		    s2empty: "\u6682\u65E0\u5B9A\u65F6\u3002\u4E0A\u9762\u586B site \u547D\u4EE4 + cron \u70B9\u521B\u5EFA,\u6216\u53BB dsh \u5BF9\u8BDD\u8BF4\u3002\u521B\u5EFA\u540E\u53EF\u5728 dsh schedule list \u67E5\u770B\u3002",
		    s2run: "\u7ACB\u5373\u8DD1",
		    s2pause: "\u5173\u505C",
		    s2resume: "\u542F\u7528",
		    s2del: "\u5220",
		    s2paused: "\u5DF2\u6682\u505C",
		    s2on: "\u8FD0\u884C\u4E2D",
		    s2runOk: "\u5DF2\u89E6\u53D1",
		    s2hist: "\u67E5\u770B\u8FD0\u884C\u5386\u53F2:\u53BB dsh \u5BF9\u8BDD\u6846\u8BF4\u201C\u5B9A\u65F6\u5386\u53F2\u201D",
		    s3t: "3. \u5F55\u5236\u56DE\u653E",
		    s3hint: "\u5F55\u65B0/\u6539 \u2192 \u53BB dsh \u5BF9\u8BDD\u8BF4\u201C\u5F55\u4E00\u6BB5:\u6293 arxiv \u4ECA\u5929\u7684 AI \u8BBA\u6587\u201D",
		    s3start: "\u5F00\u59CB\u5F55\u5236",
		    s3stop: "\u505C\u6B62\u5F55\u5236",
		    s3namePh: "\u5F55\u5236\u540D\u79F0(\u5982:\u6BCF\u65E5\u77E5\u4E4E\u70ED\u699C)",
		    s3stepPh: "\u6DFB\u52A0\u6B65\u9AA4(\u56DE\u8F66\u786E\u8BA4,\u5982:site zhihu hot)",
		    s3recorded: "\u5DF2\u5F55",
		    s3replay: "\u56DE\u653E",
		    s3del: "\u5220\u9664",
		    s3promote: "\u751F\u6210\u4E3A recipe",
		    s3promoted: "\u5DF2\u664B\u5347\u4E3A recipe:",
		    s3empty: "\u6682\u65E0\u5F55\u5236\u3002\u70B9\u201C\u5F00\u59CB\u5F55\u5236\u201D\u624B\u52A8\u8F93\u5165\u6B65\u9AA4;\u771F\u5B9E Chrome \u64CD\u4F5C\u81EA\u52A8\u8FFD\u52A0\u8D70 dsh \u5BF9\u8BDD\u3002",
		    s3steps: "\u6B65",
		    s35t: "3.5 \u81EA\u52A8\u5316\u8D44\u4EA7\u5E93",
		    s35tag: "\u5BF9\u9F50 anweat",
		    s35hint: "\u65B0\u5EFA/\u6FC0\u6D3B/\u5F52\u6863 \u2192 \u53BB dsh \u5BF9\u8BDD\u8BF4\u201C\u65B0\u5EFA recipe\u201D",
		    s35searchPh: "\u641C\u8D44\u4EA7(\u5982:arxiv)",
		    s35search: "\u641C\u7D22",
		    s35run: "\u8FD0\u884C",
		    s35empty: "\u6682\u65E0\u8D44\u4EA7\u3002\u5148\u5728\u201C2. \u5B9A\u65F6\u4EFB\u52A1\u201D\u91CC\u5EFA,\u6216\u53BB dsh \u5BF9\u8BDD\u8BF4\u201C\u65B0\u5EFA recipe\u201D\u3002",
		    s35note: "\u8BF4\u660E:\u5B9E\u9A8C\u6027 \u2014 \u6A21\u578B\u53EA\u68C0\u7D22\u5DF2\u6FC0\u6D3B\u8D44\u4EA7\u7684\u6709\u754C\u6458\u8981(\u9ED8\u8BA4 top 5 \xB7 800 tokens \u9884\u7B97)\u3002\u8349\u7A3F\u9700\u5148\u771F\u5B9E\u56DE\u653E\u6210\u529F\u624D\u80FD\u6FC0\u6D3B\u3002",
		    s35mode: "\u81EA\u52A8\u5316\u81EA\u7531\u5EA6",
		    s35limit: "\u9650\u6D41",
		    s35limitV: "minDelay 750ms / \u5E76\u53D1 2 / \u7A81\u53D1 3 / \u51B7\u5374 30s",
		    s35limitOn: "\u5DF2\u542F\u7528",
		    s35auth: "\u9650\u57DF\u767B\u5F55",
		    s35authV: "authProfiles: allowedDomains \u9650\u57DF,\u9ED8\u8BA4\u53EA\u8BFB\u4E0D\u56DE\u5199",
		    s35scripts: "\u811A\u672C\u76EE\u5F55",
		    s35scriptUrlPh: "\u811A\u672C\u76EE\u6807 URL(\u53EF\u7A7A)",
		    s35scriptRun: "\u8FD0\u884C\u5185\u7F6E\u811A\u672C",
		    s35crawlUrlPh: "\u8981\u6293\u7684 URL",
		    s35crawlRun: "\u6CDB\u722C(\u5355\u9875\u63D0\u53D6)",
		    s35mReadonly: "\u53EA\u8BFB",
		    s35mStandard: "\u6807\u51C6(\u9ED8\u8BA4)",
		    s35mAuto: "\u81EA\u4E3B",
		    s35mUnrest: "\u65E0\u4EBA\u503C\u5B88",
		    s4t: "4. \u4F60\u8DDF dsh \u8BF4\u7684\u8BDD(\u8FD9\u624D\u662F\u771F\u6B63\u5728\u7528)",
		    s4lead: "\u70B9\u4E0B\u65B9\u84DD\u6309\u94AE \u2192 \u6587\u672C\u590D\u5236\u5230\u526A\u8D34\u677F + \u81EA\u52A8\u65B0\u5F00 dsh \u6807\u7B7E\u9875 \u2192 \u5728 dsh \u5BF9\u8BDD\u6846\u6309 Ctrl+V \u7C98\u4E0A\u53D1\u9001:",
		    s4jumpT: "\u2192 dsh \u5BF9\u8BDD\u6846(\u8F93\u5165\u6846 + \u53D1\u9001)",
		    s4send: "\u2192 \u590D\u5236 + \u6253\u5F00 dsh",
		    s4ph: "\u5728\u8FD9\u91CC\u8F93\u5165\u60F3\u8DDF dsh \u8BF4\u7684\u8BDD,\u5982\u201C\u6BCF\u59299\u70B9\u8DD1 site arxiv search agent\u201D",
		    s4jumpHint: "\u70B9\u4E00\u4E0B:\u5185\u5BB9\u8FDB\u526A\u8D34\u677F,\u65B0 tab \u6253\u5F00 http://127.0.0.1:3080,\u6309 Ctrl+V \u7C98\u5230 dsh \u5BF9\u8BDD\u6846 \u2192 \u53D1\u9001",
		    s4picksT: "\u5E38\u7528\u5FEB\u6377\u70B9(\u70B9\u4E00\u4E0B\u586B\u8FDB\u8F93\u5165\u6846):",
		    s4hint: "\u4E0D\u77E5\u9053\u8BF4\u5565?\u70B9\u4E0A\u9762\u7684\u5FEB\u6377\u6309\u94AE \u2192 \u6539\u6539 \u2192 \u70B9\u201C\u2192 \u590D\u5236 + \u6253\u5F00 dsh\u201D \u2192 \u5728 dsh \u5BF9\u8BDD\u6846 Ctrl+V \u53D1\u9001\u3002",
		    s4sent: "\u5DF2\u590D\u5236 + \u6253\u5F00 dsh",
		    s4empty: "\u8F93\u5165\u6846\u662F\u7A7A\u7684",
		    s4copyFail: "\u590D\u5236\u5931\u8D25,\u8BF7\u624B\u52A8\u590D\u5236",
		    s5t: "\u672A\u68C0\u6D4B\u5230 opencli \u2014\u2014 \u4E09\u6B65\u63A5\u5165",
		    s6t: "6. \u5F53\u524D dsh profile(\u7528\u9519 profile \u627E\u4E0D\u5230 opencli \u5DE5\u5177)",
		    s6profile: "dsh profile",
		    s6state: "dsh-opencli \u72B6\u6001",
		    s6mounted: "\u5DF2\u6302\u8F7D",
		    s6ok: "\u6B63\u786E",
		    s6hint: "\u82E5\u5207\u5230 headless / zvecbtest / intelhubtest \u7B49\u5176\u5B83 profile,opencli \u6CA1\u6302\u8F7D\u3002\u5207\u56DE web:dsh --profile web\u3002",
		    s5done: "\u5DF2\u7ECF\u88C5\u597D\u4E86,\u8DF3\u8FC7",
		    s5noop: "\u65E0\u9700\u64CD\u4F5C",
		    s5hint: "\u5982\u679C\u4F60\u770B\u5230\u7EA2\u5B57\u201C\u672A\u88C5\u201D,\u53BB dsh \u5BF9\u8BDD\u6846\u8BF4\u201C\u88C5 opencli\u201D,dsh \u81EA\u52A8\u8DD1 4 \u6B65 + \u81EA\u68C0\u3002",
		    diagT: "\u5931\u8D25\u8BCA\u65AD(5 \u5927\u5E38\u89C1\u539F\u56E0)",
		    diag1: "daemon \u672A\u8DD1:\u53BB dsh \u5BF9\u8BDD\u6846\u8BF4\u201C\u88C5 opencli\u201D,\u81EA\u68C0\u4F1A\u8DD1",
		    diag2: "\u6269\u5C55\u65AD\u8FDE:Chrome \u91CC\u70B9 BrowserBridge \u56FE\u6807,\u5E94\u4EAE",
		    diag3: "\u767B\u5F55\u8FC7\u671F:\u8BF4\u201C\u6362 {\u7F51\u7AD9} \u8D26\u53F7\u201D,dsh \u8C03 opencli \u5E2E\u4F60\u767B",
		    diag4: "\u7AD9\u70B9\u98CE\u63A7:\u8BF4\u201C\u5207\u5230 Patchright\u201D,\u5C11\u88AB\u53CD\u722C",
		    diag5: "\u547D\u4EE4\u5199\u9519:\u53BB 0.5 \u6BB5\u641C\u7AD9\u70B9\u590D\u5236\u6B63\u786E\u547D\u4EE4",
		    diagClose: "\u5173",
		    diagSend: "\u590D\u5236\u5230 dsh \u2192",
		    errReq: "\u8BF7\u6C42\u5931\u8D25"
		  },
		  en: {
		    title: "OpenCLI Control Center",
		    desc: "Browse built-in OpenCLI commands; dsh sessions call them via the site tool. Missing sites can be created live by the model.",
		    refresh: "Refresh/Diagnose",
		    diagnosing: "Checking\u2026",
		    langName: "\u4E2D\u6587",
		    s0t: "0. Try it",
		    s0tag: "Works now",
		    s0hint: "Not sure what to do? Hit \u201CRun demo\u201D \u2014 the panel really runs one command via try-run and shows the result.",
		    s0demo: "Run demo",
		    s0run: "Run",
		    s0ph: "Command to run, e.g.: site arxiv recent cs.AI",
		    s05t: "0.5 Find a site",
		    s05hint: "Click a site tag to fill the search box; find a site name \u2192 copy the opencli command.",
		    s05searchPh: "Search sites, commands or descriptions",
		    s05cmds: "commands",
		    s05empty: "No matching site or command",
		    s05call: "Call in dsh session:",
		    s05copyHint: "\xB7 click a row to copy the full command",
		    s05disable: "Disable",
		    s05enable: "Enable",
		    s05disabled: "Disabled",
		    s05copied: "Copied",
		    s05loading: "loading\u2026",
		    s05loadFail: "Load failed",
		    s05siteCmds: "Site commands",
		    s05appCmds: "App commands",
		    s05siteTitle: "Website adapters \u2014 run inside your logged-in Chrome",
		    s05appTitle: "Local desktop app adapters (Codex/Cursor/Trae etc., driven via CDP; the app must be installed locally, no OpenCLIApp needed)",
		    s06t: "0.6 Shortcuts",
		    s06tag: "New",
		    s06diag: "Failure diagnosis ?",
		    s06skill: "Install opencli skill",
		    s06patch: "Switch to Patchright",
		    s06hon: "Headless on",
		    s06hoff: "Headless off",
		    s06ro: "Switch to read-only",
		    s06auto: "Switch to autonomous",
		    s06hint: "Click a button \u2192 text copied to clipboard + dsh dialog opens; paste and send. Diagnosis pops up first.",
		    s1t: "1. opencli health",
		    s1daemon: "daemon",
		    s1running: "Running",
		    s1stopped: "Not running",
		    s1start: "Start daemon",
		    s1starting: "Starting\u2026",
		    s1ext: "Chrome extension",
		    s1extOn: "Connected",
		    s1approval: "write approval gate",
		    s1approvalOn: "On (site writes ask first)",
		    s1approvalOff: "Off",
		    s1on: "On",
		    s1off: "Off",
		    s1loginCan: "sites checkable",
		    s1login: "Login state",
		    s1check: "Check logins",
		    s1checking: "Checking\u2026",
		    s1collapse: "Collapse",
		    s1runtime: "Runtime",
		    s1mode: "Automation level",
		    s1sites: "sites",
		    s1cmds: "commands",
		    s1ver: "v",
		    s1okTag: "Healthy",
		    s1loginHint: "green=logged in \xB7 yellow=timeout \xB7 red=not logged in \xB7 5+ collapsed \xB7 to switch account tell dsh \u201Cswitch weibo account\u201D",
		    s1timeout: "Probe timeout",
		    s1checkFail: "Check failed",
		    s2t: "2. Schedules",
		    s2hint: "Create/edit/delete \u2192 tell dsh \u201Cschedule arxiv briefings daily at 9am\u201D",
		    s2sitePh: "site command (e.g.: zhihu hot)",
		    s2cronPh: "cron",
		    s2create: "Create",
		    s2empty: "No schedules yet. Fill site command + cron above, or ask in the dsh dialog. Then see them via dsh schedule list.",
		    s2run: "Run now",
		    s2pause: "Pause",
		    s2resume: "Resume",
		    s2del: "Delete",
		    s2paused: "Paused",
		    s2on: "Active",
		    s2runOk: "Triggered",
		    s2hist: "History: ask \u201Cschedule history\u201D in the dsh dialog",
		    s3t: "3. Record & replay",
		    s3hint: "Record new / edit \u2192 tell dsh \u201Crecord: grab today\u2019s arxiv AI papers\u201D",
		    s3start: "Start recording",
		    s3stop: "Stop recording",
		    s3namePh: "Recording name (e.g.: daily zhihu hot)",
		    s3stepPh: "Add step (Enter to confirm, e.g.: site zhihu hot)",
		    s3recorded: "recorded",
		    s3replay: "Replay",
		    s3del: "Delete",
		    s3promote: "Promote to recipe",
		    s3promoted: "Promoted to recipe:",
		    s3empty: "No recordings. Hit \u201CStart recording\u201D and type steps; real Chrome actions append via the dsh dialog.",
		    s3steps: "steps",
		    s35t: "3.5 Automation assets",
		    s35tag: "anweat parity",
		    s35hint: "New / activate / archive \u2192 tell dsh \u201Cnew recipe\u201D",
		    s35searchPh: "Search assets (e.g.: arxiv)",
		    s35search: "Search",
		    s35run: "Run",
		    s35empty: "No assets yet. Create one in \u201C2. Schedules\u201D first, or tell dsh \u201Cnew recipe\u201D.",
		    s35note: "Experimental \u2014 the model only retrieves bounded summaries of activated assets (default top 5 \xB7 800 token budget). Drafts must replay successfully before activation.",
		    s35mode: "Automation level",
		    s35limit: "Rate limit",
		    s35limitV: "minDelay 750ms / concurrency 2 / burst 3 / cooldown 30s",
		    s35limitOn: "Enabled",
		    s35auth: "Scoped login",
		    s35authV: "authProfiles: allowedDomains scoped, read-only by default",
		    s35scripts: "Script catalog",
		    s35scriptUrlPh: "Script target URL (optional)",
		    s35scriptRun: "Run builtin script",
		    s35crawlUrlPh: "URL to fetch",
		    s35crawlRun: "Crawl (single page)",
		    s35mReadonly: "read-only",
		    s35mStandard: "standard (default)",
		    s35mAuto: "autonomous",
		    s35mUnrest: "unrestricted",
		    s4t: "4. What you tell dsh (this is the real usage)",
		    s4lead: "Click the blue button below \u2192 text copied + a new dsh tab opens \u2192 Ctrl+V into the dsh dialog and send:",
		    s4jumpT: "\u2192 dsh dialog (input + send)",
		    s4send: "\u2192 Copy + open dsh",
		    s4ph: "Type what to tell dsh, e.g. \u201Crun site arxiv search agent daily at 9am\u201D",
		    s4jumpHint: "One click: content to clipboard, new tab opens http://127.0.0.1:3080, Ctrl+V into the dsh dialog \u2192 send",
		    s4picksT: "Quick picks (click to fill the input):",
		    s4hint: "Not sure what to say? Click a quick pick \u2192 edit \u2192 \u201C\u2192 Copy + open dsh\u201D \u2192 Ctrl+V in the dsh dialog.",
		    s4sent: "Copied + dsh opened",
		    s4empty: "Input is empty",
		    s4copyFail: "Copy failed, please copy manually",
		    s5t: "opencli not detected \u2014 3 steps to connect",
		    s6t: "6. Current dsh profile (wrong profile hides opencli tools)",
		    s6profile: "dsh profile",
		    s6state: "dsh-opencli state",
		    s6mounted: "Mounted",
		    s6ok: "Correct",
		    s6hint: "If you switch to headless / zvecbtest / intelhubtest etc., opencli is not mounted. Switch back to web: dsh --profile web.",
		    s5done: "Already installed, skip",
		    s5noop: "No action needed",
		    s5hint: "If you see red \u201Cmissing\u201D, tell dsh \u201Cinstall opencli\u201D \u2014 dsh runs 4 steps + self-check.",
		    diagT: "Failure diagnosis (5 common causes)",
		    diag1: "daemon not running: tell dsh \u201Cinstall opencli\u201D, self-check will run",
		    diag2: "extension disconnected: click the BrowserBridge icon in Chrome, it should light up",
		    diag3: "login expired: say \u201Cswitch {site} account\u201D, dsh re-logs you in via opencli",
		    diag4: "site bot protection: say \u201Cswitch to Patchright\u201D for fewer blocks",
		    diag5: "wrong command: find the right one in section 0.5",
		    diagClose: "Close",
		    diagSend: "Copy to dsh \u2192",
		    errReq: "Request failed"
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
		var CSS = `
		.ocp { display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #F0F0F2; }
		.ocp-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
		/* \u2500\u2500 \u9875\u5934:iOS \u8BBE\u7F6E\u5F0F(\u56FE\u6807 + \u5927\u6807\u9898 + \u63CF\u8FF0)\u2500\u2500 */
		.ocp-head { display: flex; align-items: flex-start; gap: 14px; }
		.ocp-icon { flex: none; width: 46px; height: 46px; border-radius: 12px; background: #4A9EFF;
		  display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #fff; letter-spacing: .5px; }
		.ocp-title { font-size: 20px; font-weight: 700; line-height: 1.35; }
		.ocp-desc { font-size: 12.5px; color: #9A9AA0; margin-top: 3px; line-height: 1.55; }
		.ocp-headbtns { margin-left: auto; display: flex; gap: 8px; flex: none; }
		.ocp-btn { flex: none; cursor: pointer; border: none; background: #3A3A3E; color: #F0F0F2;
		  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; transition: background .15s; white-space: nowrap; }
		.ocp-btn:hover { background: #46464B; }
		.ocp-btn:disabled { opacity: .6; cursor: default; }
		.ocp-btn-sm { padding: 5px 11px; font-size: 11.5px; }
		.ocp-btn-p { background: #4A9EFF; color: #fff; }
		.ocp-btn-p:hover { background: #3A8AE8; }
		.ocp-btn-w { background: #FF9F0A; color: #fff; }
		.ocp-btn-w:hover { background: #E08F08; }
		.ocp-btn-d { background: rgba(255,69,58,.2); color: #FF6B5E; }
		.ocp-sect { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; margin-bottom: 10px; flex-wrap: wrap; }
		.ocp-tag { flex: none; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: #333338; color: #9A9AA0; }
		.ocp-tag-g { background: rgba(52,199,89,.32); color: #4DDB7A; }
		.ocp-tag-y { background: rgba(255,159,10,.18); color: #FF9F0A; }
		.ocp-tag-r { background: rgba(255,69,58,.18); color: #FF6B5E; }
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
		.ocp-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
		.ocp-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; border-radius: 6px; padding: 2px 9px;
		  background: rgba(52,199,89,.32); color: #4DDB7A; border: 1px solid rgba(52,199,89,.5); }
		.ocp-chip-y { background: rgba(255,159,10,.18); color: #FF9F0A; border-color: rgba(255,159,10,.3); }
		.ocp-chip-r { background: rgba(255,69,58,.18); color: #FF6B5E; border-color: rgba(255,69,58,.3); }
		.ocp-chip .ocp-dot { width: 6px; height: 6px; }
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
		.ocp-input-sm { height: 36px; font-size: 12.5px; }
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
		.ocp-tag-web { background: #333338; color: #9A9AA0; }
		.ocp-tag-read { background: rgba(74,158,255,.14); color: #4A9EFF; }
		.ocp-tag-write { background: rgba(229,132,90,.15); color: #E5845A; }
		.ocp-copied { flex: none; color: #34C759; font-size: 11px; font-weight: 600; }
		.ocp-load { font-size: 12px; color: #9A9AA0; padding: 6px 8px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
		/* \u2500\u2500 v3.4 \u771F\u4EE3\u7801\u65B0\u589E:\u8BD5\u8BD5\u770B / \u5B9A\u65F6 / \u8D44\u4EA7 / \u8DF3 dsh / toast / \u5F39\u7A97 \u2500\u2500 */
		.ocp-demo { background: linear-gradient(180deg, rgba(255,159,10,.08), rgba(255,159,10,0)); border-color: rgba(255,159,10,.3); }
		.ocp-rowflex { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
		.ocp-runout { margin-top: 8px; background: #1C1C1E; border: 1px solid rgba(255,255,255,.06); border-radius: 8px;
		  padding: 10px 12px; font-size: 11.5px; line-height: 1.7; max-height: 280px; overflow: auto;
		  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #C9C9CF; white-space: pre-wrap; word-break: break-all; }
		.ocp-sched { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 0;
		  border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12.5px; }
		.ocp-sched:last-child { border-bottom: none; }
		.ocp-sched.off { opacity: .55; }
		.ocp-sched .ocp-sname2 { font-weight: 600; font-size: 13px; }
		.ocp-sched .ocp-meta { width: 100%; font-size: 11px; color: #9A9AA0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
		.ocp-sw { position: relative; width: 34px; height: 20px; background: #3A3A3E; border-radius: 10px; cursor: pointer; flex: none; border: none; padding: 0; }
		.ocp-sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #9A9AA0; border-radius: 50%; transition: all .15s; }
		.ocp-sw-on { background: #34C759; }
		.ocp-sw-on::after { left: 16px; background: #fff; }
		.ocp-jump { background: #1C1C1E; border: 1px solid rgba(74,158,255,.35); border-radius: 10px; padding: 14px; margin-top: 10px; }
		.ocp-jump-t { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #79B7FF; }
		.ocp-pick { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; background: transparent;
		  border: 1px solid rgba(74,158,255,.3); color: #79B7FF; padding: 3px 8px; border-radius: 4px; cursor: pointer; margin: 1px; }
		.ocp-pick:hover { background: rgba(74,158,255,.15); }
		.ocp-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); color: #0D0D0E;
		  padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 9999;
		  max-width: 80vw; word-break: break-all; }
		.ocp-modal-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.7);
		  display: flex; align-items: center; justify-content: center; z-index: 1000; }
		.ocp-modal { background: #1C1C1E; border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
		  padding: 24px; width: 520px; max-width: 90vw; }
		.ocp-modal-t { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
		.ocp-modal-b { font-size: 12.5px; line-height: 1.7; color: #C9C9CF; }
		.ocp-modal-b > div { margin-bottom: 6px; }
		.ocp-modal-f { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
		.ocp-num { color: #FF9F0A; }
		`;
		function avatarHue(name) {
		  let h = 0;
		  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
		  return h;
		}
		function Panel() {
		  const [lang, setLang] = (0, import_react.useState)("zh");
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
		  const [recordings, setRecordings] = (0, import_react.useState)(() => {
		    try {
		      return JSON.parse(localStorage.getItem("dsh-opencli-recordings") ?? "[]");
		    } catch {
		      return [];
		    }
		  });
		  const [isRecording, setIsRecording] = (0, import_react.useState)(false);
		  const [recordName, setRecordName] = (0, import_react.useState)("");
		  const [recordSteps, setRecordSteps] = (0, import_react.useState)([]);
		  const [scheduleSite, setScheduleSite] = (0, import_react.useState)("");
		  const [scheduleCron, setScheduleCron] = (0, import_react.useState)("0 9 * * *");
		  const [schedules, setSchedules] = (0, import_react.useState)([]);
		  const [schedBusy, setSchedBusy] = (0, import_react.useState)(false);
		  const [autoMode, setAutoMode] = (0, import_react.useState)("standard");
		  const [runInput, setRunInput] = (0, import_react.useState)("site arxiv recent cs.AI");
		  const [running, setRunning] = (0, import_react.useState)(false);
		  const [runOut, setRunOut] = (0, import_react.useState)(null);
		  const [msgInput, setMsgInput] = (0, import_react.useState)("arxiv \u641C\u6700\u8FD1 7 \u5929 AI \u7EFC\u8FF0");
		  const [toast, setToast] = (0, import_react.useState)(null);
		  const [diagOpen, setDiagOpen] = (0, import_react.useState)(false);
		  const [assetQuery, setAssetQuery] = (0, import_react.useState)("");
		  const [assetHits, setAssetHits] = (0, import_react.useState)(null);
		  const [assetBusy, setAssetBusy] = (0, import_react.useState)(false);
		  const [scriptList, setScriptList] = (0, import_react.useState)(null);
		  const [scriptUrl, setScriptUrl] = (0, import_react.useState)("");
		  const [scriptMsg, setScriptMsg] = (0, import_react.useState)(null);
		  const [crawlUrl, setCrawlUrl] = (0, import_react.useState)("");
		  const [crawlMsg, setCrawlMsg] = (0, import_react.useState)(null);
		  const t = (k) => STR[lang][k] ?? STR.zh[k];
		  const showToast = (msg, ok) => {
		    setToast({
		      msg,
		      ok
		    });
		    window.setTimeout(() => {
		      setToast((cur) => cur !== null && cur.msg === msg ? null : cur);
		    }, 1800);
		  };
		  const sendToDsh = async (text, okMsg) => {
		    const ok = await copyText(text);
		    if (ok) {
		      showToast(okMsg, true);
		      try {
		        window.open(DSH_URL, "_blank");
		      } catch {
		      }
		    } else {
		      showToast(t("s4copyFail"), false);
		    }
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
		      error: r.error?.message ?? t("errReq")
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
		      setDaemonMsg(r.ok ? r.value?.message ?? "\u542F\u52A8\u5931\u8D25" : r.error?.message ?? t("errReq"));
		    }
		  };
		  const persistRecordings = (next) => {
		    setRecordings(next);
		    try {
		      localStorage.setItem("dsh-opencli-recordings", JSON.stringify(next));
		    } catch {
		    }
		  };
		  const startRecording = () => {
		    setIsRecording(true);
		    setRecordSteps([]);
		  };
		  const stopRecording = () => {
		    if (recordName.trim().length === 0 || recordSteps.length === 0) {
		      setIsRecording(false);
		      return;
		    }
		    const next = [
		      ...recordings,
		      {
		        id: String(Date.now()),
		        name: recordName.trim(),
		        steps: [
		          ...recordSteps
		        ],
		        createdAt: (/* @__PURE__ */ new Date()).toISOString()
		      }
		    ];
		    persistRecordings(next);
		    setIsRecording(false);
		    setRecordName("");
		    setRecordSteps([]);
		  };
		  const replayRecording = async (id) => {
		    const r = recordings.find((x) => x.id === id);
		    if (r === void 0) return;
		    for (const step of r.steps) {
		      const s = step.trim();
		      if (s.length === 0) continue;
		      if (s.startsWith("browser_")) await rpc("replay", {
		        step: s
		      });
		      else await rpc("try-run", {
		        line: s
		      });
		    }
		    showToast(t("s2runOk"), true);
		  };
		  const promoteRecording = async (id) => {
		    const r = recordings.find((x) => x.id === id);
		    if (r === void 0) return;
		    const res = await rpc("promote-recording", {
		      name: r.name,
		      steps: r.steps
		    });
		    if (res.ok) {
		      showToast(`${t("s3promoted")} ${res.value?.recipeId ?? ""}`, true);
		      void searchAssets(assetQuery);
		    } else showToast(res.error?.message ?? t("errReq"), false);
		  };
		  const loadSchedules = async () => {
		    const r = await rpc("schedule-list");
		    if (r.ok && r.value !== void 0) setSchedules(r.value.schedules);
		  };
		  const addSchedule = async () => {
		    if (scheduleSite.trim().length === 0 || schedBusy) return;
		    setSchedBusy(true);
		    const r = await rpc("schedule-add", {
		      site: scheduleSite.trim(),
		      cron: scheduleCron
		    });
		    setSchedBusy(false);
		    if (r.ok) {
		      setScheduleSite("");
		      void loadSchedules();
		    } else showToast(r.error?.message ?? t("errReq"), false);
		  };
		  const toggleSchedule = async (id, enabled) => {
		    const r = await rpc("schedule-toggle", {
		      id,
		      enabled
		    });
		    if (r.ok) void loadSchedules();
		    else showToast(r.error?.message ?? t("errReq"), false);
		  };
		  const removeSchedule = async (id) => {
		    const r = await rpc("schedule-remove", {
		      id
		    });
		    if (r.ok) void loadSchedules();
		    else showToast(r.error?.message ?? t("errReq"), false);
		  };
		  const runScheduleNow = async (id) => {
		    const r = await rpc("automation-run", {
		      id
		    });
		    showToast(r.ok ? t("s2runOk") : r.error?.message ?? t("errReq"), r.ok);
		  };
		  const runDemo = async (cmd) => {
		    const line = cmd.trim() || "site arxiv recent cs.AI";
		    if (running) return;
		    setRunning(true);
		    setRunOut(null);
		    const r = await rpc("try-run", {
		      line
		    });
		    setRunning(false);
		    if (r.ok) setRunOut({
		      cmd: line,
		      text: (r.value?.text ?? "").slice(0, 4e3),
		      ok: true
		    });
		    else setRunOut({
		      cmd: line,
		      text: r.error?.message ?? t("errReq"),
		      ok: false
		    });
		  };
		  const searchAssets = async (q2) => {
		    if (assetBusy) return;
		    setAssetBusy(true);
		    const r = await rpc("automation-search", {
		      query: q2
		    });
		    setAssetBusy(false);
		    if (r.ok && r.value !== void 0) setAssetHits(r.value.hits);
		    else showToast(r.error?.message ?? t("errReq"), false);
		  };
		  const runAsset = async (id) => {
		    const r = await rpc("automation-run", {
		      id
		    });
		    showToast(r.ok ? t("s2runOk") : r.error?.message ?? t("errReq"), r.ok);
		  };
		  const loadScripts = async () => {
		    const r = await rpc("script-catalog");
		    if (r.ok && r.value !== void 0) setScriptList(r.value.scripts);
		    else showToast(r.error?.message ?? t("errReq"), false);
		  };
		  const runBuiltin = async (name) => {
		    setScriptMsg(null);
		    const r = await rpc("script-run-builtin", {
		      name,
		      ...scriptUrl.trim() ? {
		        url: scriptUrl.trim()
		      } : {}
		    });
		    setScriptMsg(r.ok ? (r.value?.result ?? t("s2runOk")).slice(0, 2e3) : r.error?.message ?? t("errReq"));
		  };
		  const runCrawl = async () => {
		    if (crawlUrl.trim().length === 0) return;
		    setCrawlMsg(null);
		    const r = await rpc("crawl", {
		      url: crawlUrl.trim()
		    });
		    setCrawlMsg(r.ok ? t("s2runOk") : r.error?.message ?? t("errReq"));
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
		          error: r.error?.message ?? t("errReq")
		        }
		      }));
		    }
		  };
		  const copyCmd = (key, text) => {
		    void copyText(text).then((ok) => {
		      if (!ok) return;
		      setCopied(key);
		      window.setTimeout(() => {
		        setCopied((c) => c === key ? null : c);
		      }, 1600);
		    });
		  };
		  const reload = async () => {
		    if (busy) return;
		    setBusy(true);
		    const [st, ad, se, am, sc] = await Promise.all([
		      rpc("status"),
		      rpc("adapters"),
		      rpc("settings"),
		      rpc("automation-mode-get"),
		      rpc("schedule-list")
		    ]);
		    if (st.ok && st.value !== void 0) setStatus(st.value);
		    else setStatus(st.value ?? {
		      ok: false,
		      bin: null,
		      version: null,
		      daemon: null,
		      adapterSites: null,
		      error: st.error?.message ?? "status failed"
		    });
		    if (ad.ok && ad.value !== void 0) setAdapters(ad.value.adapters);
		    if (se.ok && se.value !== void 0) setSettings(se.value);
		    if (am.ok && am.value !== void 0 && typeof am.value.mode === "string") setAutoMode(am.value.mode);
		    if (sc.ok && sc.value !== void 0) setSchedules(sc.value.schedules);
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
		  const loginOk = (login?.results ?? []).filter((r) => r.ok && !r.timedOut);
		  const loginWarn = (login?.results ?? []).filter((r) => r.timedOut);
		  const loginBad = (login?.results ?? []).filter((r) => !r.ok && !r.timedOut);
		  const picks = lang === "zh" ? [
		    "arxiv \u641C\u6700\u8FD1 7 \u5929 AI \u7EFC\u8FF0",
		    "github trending \u770B AI/ML \u4ECA\u65E5\u699C",
		    "hackernews \u641C deepseek",
		    "\u6BCF\u59299\u70B9\u8DD1 site arxiv search agent",
		    "\u5F55\u4E00\u6BB5:\u6293 arxiv \u4ECA\u5929\u7684 AI \u8BBA\u6587\u5230 Obsidian",
		    "\u5173\u6389\u6240\u6709\u5B9A\u65F6",
		    "huggingface \u627E\u6700\u8FD1 7 \u5929\u5927\u6A21\u578B",
		    "\u4FEE\u6539\u6D4F\u89C8\u5668\u914D\u7F6E:\u5207\u5230 Playwright headless",
		    "\u65B0\u5EFA recipe:\u6279\u91CF\u7D22\u5F15 github issues"
		  ] : [
		    "arxiv: AI surveys from the last 7 days",
		    "github trending: today\u2019s AI/ML chart",
		    "hackernews search deepseek",
		    "run site arxiv search agent daily at 9am",
		    "record: grab today\u2019s arxiv AI papers to Obsidian",
		    "pause all schedules",
		    "huggingface: notable models of the last 7 days",
		    "browser config: switch to Playwright headless",
		    "new recipe: batch-index github issues"
		  ];
		  return (0, import_react.createElement)(
		    "div",
		    {
		      className: "ocp"
		    },
		    (0, import_react.createElement)("style", null, CSS),
		    // ── 页头(图标 + 大标题 + 描述 + 语言 + 刷新)──
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
		    }, t("title")), (0, import_react.createElement)("div", {
		      className: "ocp-desc"
		    }, t("desc"))), (0, import_react.createElement)("div", {
		      className: "ocp-headbtns"
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn",
		      onClick: () => {
		        setLang(lang === "zh" ? "en" : "zh");
		      }
		    }, t("langName")), (0, import_react.createElement)("button", {
		      className: "ocp-btn",
		      onClick: reload,
		      disabled: busy
		    }, busy ? t("diagnosing") : t("refresh")))),
		    // ── 0. 试试看(真跑 try-run)──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card ocp-demo",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s0t"), (0, import_react.createElement)("span", {
		      className: "ocp-tag ocp-tag-y"
		    }, t("s0tag"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginBottom: "8px"
		      }
		    }, t("s0hint")), (0, import_react.createElement)("div", {
		      className: "ocp-rowflex"
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-w",
		      disabled: running,
		      onClick: () => {
		        void runDemo("site arxiv recent cs.AI");
		      }
		    }, running ? t("diagnosing") : t("s0demo")), (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      placeholder: t("s0ph"),
		      value: runInput,
		      onChange: (e) => setRunInput(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: running,
		      onClick: () => {
		        void runDemo(runInput);
		      }
		    }, t("s0run"))), runOut !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-runout"
		    }, (0, import_react.createElement)("div", {
		      style: {
		        color: "#9A9AA0",
		        marginBottom: "4px"
		      }
		    }, `$ ${runOut.cmd}`), runOut.ok ? runOut.text : (0, import_react.createElement)("span", {
		      style: {
		        color: "#FF6B5E"
		      }
		    }, runOut.text)) : null),
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
		    }, t("s5t")), (0, import_react.createElement)("span", {
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
		    // ── 1. 健康 + 登录态 chips + 运行时 ──
		    status !== null && status.ok ? (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s1t"), (0, import_react.createElement)("span", {
		      className: `ocp-tag ${up && ext ? "ocp-tag-g" : "ocp-tag-y"}`
		    }, up && ext ? t("s1okTag") : `${t("s1daemon")}:${up ? t("s1running") : t("s1stopped")}`)), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: `ocp-dot ${up ? "ocp-ok" : "ocp-bad"}`
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, "opencli"), (0, import_react.createElement)("span", {
		      className: "ocp-sv ocp-mono",
		      style: {
		        fontSize: 12
		      }
		    }, `${t("s1ver")}${status.version ?? "?"}`), (0, import_react.createElement)("span", {
		      className: "ocp-dot",
		      style: {
		        marginLeft: "8px",
		        background: up ? "#34C759" : "#FF453A"
		      }
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s1daemon")), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, up ? t("s1running") : t("s1stopped")), (0, import_react.createElement)("span", {
		      className: "ocp-dot",
		      style: {
		        marginLeft: "8px",
		        background: ext ? "#34C759" : "#FF453A"
		      }
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s1ext")), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, ext ? t("s1extOn") : d?.extension ?? "\u672A\u77E5"), up ? null : (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: starting,
		      onClick: () => {
		        void startDaemon();
		      }
		    }, starting ? t("s1starting") : t("s1start")), daemonMsg !== null ? (0, import_react.createElement)("span", {
		      className: "ocp-err"
		    }, daemonMsg) : null), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s1approval")), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, settings === null ? "\u2026" : settings.approvalOn ? t("s1approvalOn") : t("s1approvalOff")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void setApproval(!(settings?.approvalOn ?? true));
		      }
		    }, settings?.approvalOn === false ? t("s1on") : t("s1off"))), whoamiCount > 0 || login !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s1login")), login === null ? (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, `${whoamiCount} ${t("s1loginCan")}`) : (0, import_react.createElement)("div", {
		      className: "ocp-chips"
		    }, loginOk.slice(0, 5).map((r) => (0, import_react.createElement)("span", {
		      key: r.site,
		      className: "ocp-chip",
		      title: r.detail ?? ""
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-dot ocp-ok"
		    }), r.site)), loginWarn.slice(0, 2).map((r) => (0, import_react.createElement)("span", {
		      key: r.site,
		      className: "ocp-chip ocp-chip-y"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-dot",
		      style: {
		        background: "#FF9F0A"
		      }
		    }), `${r.site} (${t("s1timeout")})`)), loginBad.slice(0, 2).map((r) => (0, import_react.createElement)("span", {
		      key: r.site,
		      className: "ocp-chip ocp-chip-r"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-dot ocp-bad"
		    }), r.site)), (login?.results ?? []).length > 9 ? (0, import_react.createElement)("details", {
		      style: {
		        display: "inline"
		      }
		    }, (0, import_react.createElement)("summary", {
		      style: {
		        fontSize: "11px"
		      }
		    }, `+ ${(login?.results ?? []).length - 9}`), (0, import_react.createElement)("div", {
		      className: "ocp-login"
		    }, (login?.results ?? []).slice(9).map((r) => (0, import_react.createElement)("div", {
		      key: r.site,
		      className: "ocp-lrow",
		      title: r.detail ?? ""
		    }, (0, import_react.createElement)("span", {
		      className: `ocp-dot ${r.timedOut ? "ocp-mid" : r.ok ? "ocp-ok" : "ocp-bad"}`
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-lsite"
		    }, r.site), (0, import_react.createElement)("span", {
		      className: "ocp-ldetail"
		    }, r.timedOut ? t("s1timeout") : r.detail ?? ""))))) : null), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: checking,
		      onClick: () => {
		        void runLoginCheck();
		      }
		    }, checking ? t("s1checking") : t("s1check")), login !== null ? (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        setLogin(null);
		      }
		    }, t("s1collapse")) : null) : null, login !== null && !login.ok ? (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-err"
		    }, login.error ?? t("s1checkFail"))) : null, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s1runtime")), (0, import_react.createElement)("span", {
		      className: "ocp-sv ocp-mono",
		      style: {
		        fontSize: 12
		      }
		    }, `${status.adapterSites ?? adapters?.length ?? "?"} ${t("s1sites")}`, ` \xB7 ${siteCmds + appCmds} ${t("s1cmds")}`, d?.port !== void 0 ? ` \xB7 :${d.port}` : "", d?.uptime !== void 0 ? ` \xB7 \u2191 ${d.uptime}` : ""), (0, import_react.createElement)("span", {
		      className: "ocp-sk",
		      style: {
		        marginLeft: "8px"
		      }
		    }, t("s1mode")), (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, autoMode)), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        padding: "6px 0 8px"
		      }
		    }, t("s1loginHint"))) : null,
		    // ── 0.6 实用快捷 ──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s06t"), (0, import_react.createElement)("span", {
		      className: "ocp-tag"
		    }, t("s06tag"))), (0, import_react.createElement)("div", {
		      className: "ocp-rowflex"
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        setDiagOpen(true);
		      }
		    }, t("s06diag")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u88C5 opencli skill" : "dsh assistant, install the opencli skill", t("s4sent"));
		      }
		    }, t("s06skill")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u4FEE\u6539\u6D4F\u89C8\u5668\u914D\u7F6E:\u5207\u5230 Patchright" : "dsh assistant, browser config: switch to Patchright", t("s4sent"));
		      }
		    }, t("s06patch")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u4FEE\u6539\u6D4F\u89C8\u5668\u914D\u7F6E:\u5F00 headless" : "dsh assistant, browser config: headless on", t("s4sent"));
		      }
		    }, t("s06hon")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u4FEE\u6539\u6D4F\u89C8\u5668\u914D\u7F6E:\u5173 headless" : "dsh assistant, browser config: headless off", t("s4sent"));
		      }
		    }, t("s06hoff")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u4FEE\u6539\u81EA\u52A8\u5316\u6863:\u5207\u5230 read-only" : "dsh assistant, automation level: read-only", t("s4sent"));
		      }
		    }, t("s06ro")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u4FEE\u6539\u81EA\u52A8\u5316\u6863:\u5207\u5230 autonomous" : "dsh assistant, automation level: autonomous", t("s4sent"));
		      }
		    }, t("s06auto"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginTop: "8px"
		      }
		    }, t("s06hint"))),
		    // 失败诊断弹窗
		    diagOpen ? (0, import_react.createElement)("div", {
		      className: "ocp-modal-bg",
		      onClick: () => {
		        setDiagOpen(false);
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-modal",
		      onClick: (e) => {
		        e.stopPropagation();
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-modal-t"
		    }, t("diagT")), (0, import_react.createElement)("div", {
		      className: "ocp-modal-b"
		    }, (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "ocp-num"
		    }, "1. "), t("diag1")), (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "ocp-num"
		    }, "2. "), t("diag2")), (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "ocp-num"
		    }, "3. "), t("diag3")), (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "ocp-num"
		    }, "4. "), t("diag4")), (0, import_react.createElement)("div", null, (0, import_react.createElement)("span", {
		      className: "ocp-num"
		    }, "5. "), t("diag5"))), (0, import_react.createElement)("div", {
		      className: "ocp-modal-f"
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        setDiagOpen(false);
		      }
		    }, t("diagClose")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-p",
		      onClick: () => {
		        setDiagOpen(false);
		        void sendToDsh(lang === "zh" ? "dsh \u52A9\u624B,\u8BF7\u5E2E\u6211\u6392\u67E5\u5B9A\u65F6\u5931\u8D25" : "dsh assistant, help me diagnose the schedule failure", t("s4sent"));
		      }
		    }, t("diagSend"))))) : null,
		    // ── 2. 定时任务(真数据:host 内存 schedules + enabled 开关)──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, `${t("s2t")} `, (0, import_react.createElement)("span", {
		      className: "ocp-tag"
		    }, String(schedules.length))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginBottom: "8px"
		      }
		    }, t("s2hint")), schedules.length > 0 ? (0, import_react.createElement)("div", null, schedules.map((s) => (0, import_react.createElement)("div", {
		      key: s.id,
		      className: `ocp-sched ${s.enabled ? "" : "off"}`
		    }, (0, import_react.createElement)("button", {
		      className: `ocp-sw ${s.enabled ? "ocp-sw-on" : ""}`,
		      title: s.enabled ? t("s2pause") : t("s2resume"),
		      onClick: () => {
		        void toggleSchedule(s.id, !s.enabled);
		      }
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sname2"
		    }, s.site), (0, import_react.createElement)("span", {
		      className: `ocp-tag ${s.enabled ? "ocp-tag-g" : ""}`
		    }, s.enabled ? t("s2on") : t("s2paused")), (0, import_react.createElement)("span", {
		      className: "ocp-meta"
		    }, `cron: ${s.cron} \xB7 ${s.createdAt}`), (0, import_react.createElement)("span", {
		      style: {
		        marginLeft: "auto",
		        display: "flex",
		        gap: "6px"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-w",
		      onClick: () => {
		        void runScheduleNow(s.id);
		      }
		    }, t("s2run")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-d",
		      onClick: () => {
		        void removeSchedule(s.id);
		      }
		    }, t("s2del")))))) : (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        padding: "6px 0"
		      }
		    }, t("s2empty")), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        flex: 1
		      },
		      placeholder: t("s2sitePh"),
		      value: scheduleSite,
		      onChange: (e) => setScheduleSite(e.target.value)
		    }), (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        width: "130px",
		        flex: "none"
		      },
		      placeholder: t("s2cronPh"),
		      value: scheduleCron,
		      onChange: (e) => setScheduleCron(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: schedBusy,
		      onClick: () => {
		        void addSchedule();
		      }
		    }, t("s2create"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        paddingBottom: "8px"
		      }
		    }, t("s2hist"))),
		    // ── 3. 录制回放 ──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-srow",
		      style: {
		        paddingBottom: "10px"
		      }
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-setup-t"
		    }, `${t("s3t")} `), (0, import_react.createElement)("span", {
		      className: "ocp-tag"
		    }, `${recordings.length}`), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, t("s3hint")), (0, import_react.createElement)("span", {
		      style: {
		        marginLeft: "auto"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        if (isRecording) stopRecording();
		        else startRecording();
		      }
		    }, isRecording ? t("s3stop") : t("s3start")))), isRecording ? (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: "8px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      placeholder: t("s3namePh"),
		      value: recordName,
		      onChange: (e) => setRecordName(e.target.value)
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, `${t("s3recorded")} ${recordSteps.length}`)), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      placeholder: t("s3stepPh"),
		      onKeyDown: (e) => {
		        if (e.key === "Enter" && e.currentTarget.value.trim().length > 0) {
		          setRecordSteps((prev) => [
		            ...prev,
		            e.currentTarget.value.trim()
		          ]);
		          e.currentTarget.value = "";
		        }
		      }
		    })), recordSteps.length > 0 ? (0, import_react.createElement)("div", {
		      className: "ocp-hint"
		    }, recordSteps.map((s, i) => `${i + 1}. ${s}`).join("  |  ")) : null) : null, recordings.length > 0 ? (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        marginTop: "4px"
		      }
		    }, recordings.slice(0, 5).map((r) => (0, import_react.createElement)("div", {
		      key: r.id,
		      className: "ocp-sched"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sname2",
		      style: {
		        fontSize: "12px"
		      }
		    }, r.name), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, `${r.steps.length}${t("s3steps")} \xB7 ${new Date(r.createdAt).toLocaleDateString()}`), (0, import_react.createElement)("span", {
		      style: {
		        marginLeft: "auto",
		        display: "flex",
		        gap: "6px"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-w",
		      onClick: () => {
		        void replayRecording(r.id);
		      }
		    }, t("s3replay")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void promoteRecording(r.id);
		      }
		    }, t("s3promote")), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-d",
		      onClick: () => {
		        persistRecordings(recordings.filter((x) => x.id !== r.id));
		      }
		    }, t("s3del")))))) : (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        padding: "8px 0"
		      }
		    }, t("s3empty"))),
		    // ── 3.5 自动化资产库 ──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s35t"), (0, import_react.createElement)("span", {
		      className: "ocp-tag"
		    }, t("s35tag"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginBottom: "8px"
		      }
		    }, t("s35hint")), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s35mode")), (0, import_react.createElement)("select", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        width: "160px",
		        flex: "none"
		      },
		      value: autoMode,
		      onChange: async (e) => {
		        const m = e.target.value;
		        const r = await rpc("automation-mode-set", {
		          mode: m
		        });
		        if (r.ok) setAutoMode(m);
		      }
		    }, (0, import_react.createElement)("option", {
		      value: "read-only"
		    }, t("s35mReadonly")), (0, import_react.createElement)("option", {
		      value: "standard"
		    }, t("s35mStandard")), (0, import_react.createElement)("option", {
		      value: "autonomous"
		    }, t("s35mAuto")), (0, import_react.createElement)("option", {
		      value: "unrestricted"
		    }, t("s35mUnrest"))), (0, import_react.createElement)("span", {
		      className: "ocp-sk",
		      style: {
		        marginLeft: "8px"
		      }
		    }, t("s35limit")), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, t("s35limitV")), (0, import_react.createElement)("span", {
		      className: "ocp-tag ocp-tag-read",
		      style: {
		        marginLeft: "auto"
		      }
		    }, t("s35limitOn"))), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s35auth")), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, t("s35authV"))), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        flex: 1
		      },
		      placeholder: t("s35searchPh"),
		      value: assetQuery,
		      onChange: (e) => setAssetQuery(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      disabled: assetBusy,
		      onClick: () => {
		        void searchAssets(assetQuery);
		      }
		    }, assetBusy ? t("diagnosing") : t("s35search"))), assetHits === null ? (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        padding: "6px 0"
		      }
		    }, t("s35empty")) : assetHits.length === 0 ? (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        padding: "6px 0"
		      }
		    }, t("s35empty")) : (0, import_react.createElement)("div", null, assetHits.map((h) => (0, import_react.createElement)("div", {
		      key: h.id,
		      className: "ocp-sched"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-sname2",
		      style: {
		        fontSize: "12px"
		      }
		    }, h.name), (0, import_react.createElement)("span", {
		      className: "ocp-hint ocp-mono"
		    }, h.id), (0, import_react.createElement)("span", {
		      style: {
		        marginLeft: "auto"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-w",
		      onClick: () => {
		        void runAsset(h.id);
		      }
		    }, t("s35run")))))), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void loadScripts();
		      }
		    }, t("s35scripts")), (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        flex: 1
		      },
		      placeholder: t("s35scriptUrlPh"),
		      value: scriptUrl,
		      onChange: (e) => setScriptUrl(e.target.value)
		    })), scriptList !== null ? (0, import_react.createElement)("div", null, scriptList.map((s) => (0, import_react.createElement)("div", {
		      key: s.name,
		      className: "ocp-sched"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-cname"
		    }, s.name), (0, import_react.createElement)("span", {
		      className: "ocp-hint"
		    }, s.description), (0, import_react.createElement)("span", {
		      style: {
		        marginLeft: "auto"
		      }
		    }, (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void runBuiltin(s.name);
		      }
		    }, t("s35scriptRun")))))) : null, scriptMsg !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-runout",
		      style: {
		        marginTop: "6px",
		        maxHeight: "160px"
		      }
		    }, scriptMsg) : null, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        flex: 1
		      },
		      placeholder: t("s35crawlUrlPh"),
		      value: crawlUrl,
		      onChange: (e) => setCrawlUrl(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm",
		      onClick: () => {
		        void runCrawl();
		      }
		    }, t("s35crawlRun"))), crawlMsg !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        paddingBottom: "6px"
		      }
		    }, crawlMsg) : null, (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        paddingBottom: "8px"
		      }
		    }, t("s35note"))),
		    // ── 4. 跳到 dsh 对话框 ──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s4t")), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginBottom: "8px"
		      }
		    }, t("s4lead")), (0, import_react.createElement)("div", {
		      className: "ocp-jump"
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-jump-t"
		    }, t("s4jumpT")), (0, import_react.createElement)("div", {
		      className: "ocp-rowflex"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input ocp-input-sm",
		      style: {
		        flex: 1
		      },
		      placeholder: t("s4ph"),
		      value: msgInput,
		      onChange: (e) => setMsgInput(e.target.value)
		    }), (0, import_react.createElement)("button", {
		      className: "ocp-btn ocp-btn-sm ocp-btn-p",
		      style: {
		        height: "36px"
		      },
		      onClick: () => {
		        const text = msgInput.trim();
		        if (!text) {
		          showToast(t("s4empty"), false);
		          return;
		        }
		        void sendToDsh(text, t("s4sent"));
		      }
		    }, t("s4send"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginTop: "10px"
		      }
		    }, t("s4jumpHint"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginTop: "10px",
		        marginBottom: "6px"
		      }
		    }, t("s4picksT")), (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexWrap: "wrap",
		        gap: "2px"
		      }
		    }, picks.map((p) => (0, import_react.createElement)("button", {
		      key: p,
		      className: "ocp-pick",
		      onClick: () => {
		        setMsgInput(p);
		      }
		    }, p))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        marginTop: "8px",
		        paddingBottom: "6px"
		      }
		    }, t("s4hint"))),
		    // ── 已安装:一行确认(无需操作)──
		    !missing && status !== null && status.ok ? (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-dot ocp-mid"
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sv"
		    }, t("s5done")), (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, `opencli ${status.version ?? "?"}`), (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, `daemon ${up ? t("s1running") : t("s1stopped")}`), (0, import_react.createElement)("span", {
		      className: "ocp-code"
		    }, `extension ${d?.extension ?? "?"}`), (0, import_react.createElement)("span", {
		      className: "ocp-tag ocp-tag-g",
		      style: {
		        marginLeft: "auto"
		      }
		    }, t("s5noop"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        paddingBottom: "8px"
		      }
		    }, t("s5hint"))) : null,
		    // ── 6. 当前 dsh profile ──
		    (0, import_react.createElement)("div", {
		      className: "ocp-card",
		      style: {
		        padding: "12px 18px"
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s6t")), (0, import_react.createElement)("div", {
		      className: "ocp-srow"
		    }, (0, import_react.createElement)("span", {
		      className: "ocp-dot ocp-ok"
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-sk"
		    }, t("s6profile")), (0, import_react.createElement)("span", {
		      className: "ocp-sv ocp-mono"
		    }, "web"), (0, import_react.createElement)("span", {
		      className: "ocp-sk",
		      style: {
		        marginLeft: "8px"
		      }
		    }, t("s6state")), (0, import_react.createElement)("span", {
		      className: "ocp-sv",
		      style: {
		        color: "#4DDB7A",
		        fontWeight: 600
		      }
		    }, t("s6mounted")), (0, import_react.createElement)("span", {
		      className: "ocp-tag ocp-tag-g",
		      style: {
		        marginLeft: "auto"
		      }
		    }, t("s6ok"))), (0, import_react.createElement)("div", {
		      className: "ocp-hint",
		      style: {
		        paddingBottom: "8px"
		      }
		    }, t("s6hint"))),
		    // ── 0.5 命令集合(对齐 App 同名页面;真数据)──
		    adapters !== null ? (0, import_react.createElement)("div", {
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        gap: 12
		      }
		    }, (0, import_react.createElement)("div", {
		      className: "ocp-sect"
		    }, t("s05t"), (0, import_react.createElement)("span", {
		      className: "ocp-tag"
		    }, `${siteCmds + appCmds}`)), (0, import_react.createElement)("div", {
		      className: "ocp-chips",
		      style: {
		        marginBottom: "-4px"
		      }
		    }, siteList.slice(0, 8).map((a) => (0, import_react.createElement)("button", {
		      key: a.name,
		      className: "ocp-pick",
		      title: `${a.commandCount}`,
		      onClick: () => {
		        setTab("site");
		        setQuery(a.name);
		        setExpanded(null);
		      }
		    }, `${a.name} \xB7 ${a.commandCount}`))), (0, import_react.createElement)("div", {
		      className: "ocp-hint"
		    }, t("s05hint")), (0, import_react.createElement)("div", {
		      className: "ocp-tabs"
		    }, (0, import_react.createElement)("button", {
		      className: `ocp-tab ${tab === "site" ? "ocp-tab-on" : ""}`,
		      title: t("s05siteTitle"),
		      onClick: () => {
		        setTab("site");
		        setExpanded(null);
		      }
		    }, t("s05siteCmds"), (0, import_react.createElement)("b", null, String(siteCmds))), (0, import_react.createElement)("button", {
		      className: `ocp-tab ${tab === "app" ? "ocp-tab-on" : ""}`,
		      title: t("s05appTitle"),
		      onClick: () => {
		        setTab("app");
		        setExpanded(null);
		      }
		    }, t("s05appCmds"), (0, import_react.createElement)("b", null, String(appCmds)))), (0, import_react.createElement)("div", {
		      className: "ocp-search"
		    }, (0, import_react.createElement)("input", {
		      className: "ocp-input",
		      placeholder: t("s05searchPh"),
		      value: query,
		      onChange: (e) => setQuery(e.target.value)
		    }), (0, import_react.createElement)("span", {
		      className: "ocp-count"
		    }, (0, import_react.createElement)("b", null, String(q.length > 0 ? filtered.length : tab === "site" ? siteCmds : appCmds)), ` ${t("s05cmds")}`)), (0, import_react.createElement)("div", {
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
		      }, t("s05disabled")) : null, (0, import_react.createElement)("span", {
		        className: "ocp-chev"
		      }, "\u203A")), open ? (0, import_react.createElement)("div", {
		        className: "ocp-cmds",
		        onClick: (e) => {
		          e.stopPropagation();
		        }
		      }, (0, import_react.createElement)("div", {
		        className: "ocp-cmdhint"
		      }, (0, import_react.createElement)("span", null, t("s05call")), (0, import_react.createElement)("span", {
		        className: "ocp-code"
		      }, `site ${a.name} <\u547D\u4EE4>`), (0, import_react.createElement)("span", null, t("s05copyHint")), (0, import_react.createElement)("button", {
		        className: "ocp-btn ocp-btn-sm",
		        style: {
		          marginLeft: "auto"
		        },
		        onClick: () => {
		          void toggleDisable(a.name, a.disabled !== true);
		        }
		      }, a.disabled === true ? t("s05enable") : t("s05disable"))), detail === void 0 ? (0, import_react.createElement)("div", {
		        className: "ocp-load"
		      }, t("s05loading")) : detail.ok ? detail.commands.map((c) => {
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
		        }, t("s05copied")) : null);
		      }) : (0, import_react.createElement)("div", {
		        className: "ocp-err"
		      }, detail.error ?? t("s05loadFail"))) : null);
		    }), filtered.length === 0 ? (0, import_react.createElement)("div", {
		      className: "ocp-load"
		    }, t("s05empty")) : null)) : null,
		    // toast
		    toast !== null ? (0, import_react.createElement)("div", {
		      className: "ocp-toast",
		      style: {
		        background: toast.ok ? "#4DDB7A" : "#FF453A"
		      }
		    }, toast.msg) : null
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
