var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// .build-tools/tmp-src/index.js
import { Service } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";
import { homedir as homedir2 } from "node:os";
import { mkdir as mkdir2, readFile, writeFile as writeFile2 } from "node:fs/promises";
import { appendFileSync, existsSync, mkdirSync, readFileSync as readFileSync2, readdirSync as readdirSync2, renameSync, statSync, unlinkSync as unlinkSync2 } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join as join3, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// .build-tools/tmp-src/parsers.js
function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
function parseDaemonStatus(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const j = extractJsonObject(trimmed);
    const d = j?.ok === true && j.data && typeof j.data === "object" ? j.data : null;
    if (d !== null) {
      const extConnected = d.extensionConnected === true;
      const profilesRaw = Array.isArray(d.profiles) ? d.profiles : [];
      const profiles = profilesRaw.length > 0 ? profilesRaw.map((p) => `${String(p.contextId ?? "?")}${p.extensionVersion ? " " + String(p.extensionVersion) : ""}${p.extensionConnected === false ? " (\u672A\u8FDE)" : ""}`).join(", ") : void 0;
      const uptimeSec = typeof d.uptime === "number" ? d.uptime : null;
      const h = uptimeSec !== null ? Math.floor(uptimeSec / 3600) : null;
      const m = uptimeSec !== null ? Math.floor(uptimeSec % 3600 / 60) : null;
      return {
        running: d.running === true,
        version: typeof d.daemonVersion === "string" ? d.daemonVersion : void 0,
        pid: typeof d.pid === "number" ? d.pid : void 0,
        uptime: h !== null ? `${h}h ${m}m` : void 0,
        extension: extConnected ? d.profileRequired === true ? "connected, none selected" : "connected" : "not connected",
        profiles,
        port: typeof d.port === "number" ? d.port : void 0
      };
    }
  }
  const get = (re) => text.match(re)?.[1];
  const portRaw = get(/Port:\s*(\d+)/);
  const pidRaw = get(/PID\s*(\d+)/);
  return {
    running: /Daemon:\s*running/.test(text),
    version: get(/Version:\s*(\S+)/),
    pid: pidRaw !== void 0 ? Number(pidRaw) : void 0,
    uptime: get(/Uptime:\s*([^\n]+)/)?.trim(),
    extension: get(/Extension:\s*(\S+)/),
    profiles: get(/Profiles:\s*([^\n]+)/)?.trim(),
    port: portRaw !== void 0 ? Number(portRaw) : void 0
  };
}
function normalizeAdapterList(input) {
  if (!Array.isArray(input)) return [];
  const bySite = /* @__PURE__ */ new Map();
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const { site, name } = splitCommandEntry(raw);
    if (site === void 0 || site.length === 0) continue;
    let a = bySite.get(site);
    if (a === void 0) {
      a = {
        name: site,
        domain: raw.domain,
        commandCount: 0,
        commands: [],
        sample: "",
        kinds: [],
        _kinds: /* @__PURE__ */ new Set()
      };
      bySite.set(site, a);
    }
    if (a.domain === void 0 && raw.domain !== void 0) a.domain = raw.domain;
    const cmd = name ?? "";
    if (cmd.length > 0 && !a.commands.includes(cmd)) a.commands.push(cmd);
    if (raw.access !== void 0) a._kinds.add(raw.access);
    if (a.sample.length === 0 && raw.description !== void 0) a.sample = raw.description;
  }
  const out = [
    ...bySite.values()
  ].map((a) => {
    const { _kinds, ...rest } = a;
    void _kinds;
    return {
      ...rest,
      commandCount: rest.commands.length,
      kinds: [
        ...a._kinds
      ].sort()
    };
  });
  out.sort((x, y) => y.commandCount - x.commandCount || x.name.localeCompare(y.name));
  return out;
}
function buildAdapterDirectory(adapters, maxSites = 70, maxCmdsPerSite = 6) {
  if (adapters.length === 0) return "";
  const totalCmds = adapters.reduce((n, a) => n + a.commandCount, 0);
  const head = `opencli \u9002\u914D\u5668\u76EE\u5F55:\u5171 ${adapters.length} \u4E2A\u7AD9\u70B9/${totalCmds} \u6761\u547D\u4EE4,\u7ECF site \u5DE5\u5177\u8C03\u7528(adapter=\u7AD9\u70B9\u540D,command=\u547D\u4EE4\u540D)\u3002\u76EE\u5F55(\u6309\u547D\u4EE4\u6570\u964D\u5E8F,\u6700\u591A\u5217 ${maxSites} \u4E2A):`;
  const lines = adapters.slice(0, maxSites).map((a) => {
    const cmds = a.commands.slice(0, maxCmdsPerSite).join(", ");
    const more = a.commandCount > maxCmdsPerSite ? ` \u2026(\u5171${a.commandCount})` : "";
    return `- ${a.name} (${a.commandCount}): ${cmds}${more}`;
  });
  const tail = "\u672A\u5217\u51FA\u7684\u7AD9\u70B9\u540C\u6837\u53EF\u7528;\u5B8C\u6574\u6E05\u5355\u89C1\u8BBE\u7F6E\u9762\u677F\u300C\u6D4F\u89C8\u5668\u4EE3\u7406\u300D\u3002\u6CA1\u6709\u9002\u914D\u5668\u7684\u7F51\u7AD9:\u7528 browser_do(command=analyze/init/verify) \u73B0\u573A\u521B\u4F5C(\u89C1 SKILL.md)\u3002";
  return [
    head,
    ...lines,
    tail
  ].join("\n");
}
function commandAccess(input, adapter, command) {
  if (!Array.isArray(input)) return "unknown";
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const { site, name } = splitCommandEntry(raw);
    if (site !== adapter || name !== command) continue;
    if (raw.access === "write") return "write";
    if (raw.access === "read") return "read";
    return "unknown";
  }
  return "unknown";
}
function splitCommandEntry(raw) {
  let site = raw.site;
  let name = raw.name;
  if ((site === void 0 || name === void 0) && typeof raw.command === "string") {
    const slash = raw.command.split("/");
    if (slash.length >= 2 && slash[0] !== "" && slash[1] !== "") {
      if (site === void 0) site = slash[0];
      if (name === void 0) name = slash.slice(1).join("/");
    } else {
      const sp = raw.command.indexOf(" ");
      if (sp > 0) {
        if (site === void 0) site = raw.command.slice(0, sp);
        if (name === void 0) name = raw.command.slice(sp + 1);
      }
    }
  }
  return {
    site,
    name
  };
}
function sitesWithWhoami(input, limit = 40) {
  if (!Array.isArray(input)) return [];
  const sites = /* @__PURE__ */ new Map();
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const { site, name } = splitCommandEntry(raw);
    if (site === void 0 || name !== "whoami") continue;
    sites.set(site, (sites.get(site) ?? 0) + 1);
  }
  return [
    ...sites.keys()
  ].sort((a, b) => (sites.get(b) ?? 0) - (sites.get(a) ?? 0) || a.localeCompare(b)).slice(0, limit);
}
function approvalDecision(approvalOn, disabled, toolName, adapter, command, access) {
  if (toolName !== "site" || !approvalOn) return "allow";
  if (typeof adapter !== "string" || typeof command !== "string" || adapter.length === 0 || command.length === 0) return "allow";
  if (disabled.includes(adapter)) return "allow";
  if (access === "write") return "ask-write";
  if (access === "read") return "allow";
  return "ask-unknown";
}

// .build-tools/tmp-src/systemone.js
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var ENDPOINT = "https://api.typesafe.ai/v1/systemone";
var TIMEOUT_MS = 15e3;
function loadKeyFromFile() {
  try {
    return readFileSync(join(homedir(), ".dsh", "typesafe-key"), "utf8").trim();
  } catch {
    return "";
  }
}
var SystemOne = class {
  provider;
  key;
  endpoint;
  layaLoaded = false;
  layaLoading = null;
  layaEngine = null;
  constructor(opts) {
    this.provider = opts?.provider ?? "laya";
    this.key = opts?.key ?? loadKeyFromFile();
    this.endpoint = opts?.endpoint ?? ENDPOINT;
  }
  get configured() {
    return this.provider !== "typesafe" || this.key.length > 0;
  }
  /**
  * 就绪判定(热路径标注用):laya 需权重已入内存;typesafe/passthrough 无本地冷启动恒就绪。
  * site 工具的 noul 兜底只在本值为 true 时参与(verifyResult 的 warmOnly),预热窗口内标注缺席
  * 而不是把 ~60s 冷加载/权重下载挂进最高频工具调用。
  */
  get warm() {
    return this.provider !== "laya" || this.layaLoaded;
  }
  /** 后台预热:laya 权重冷加载约 60s,激活期就地把 1.6GB 装进内存,首次真调用才是亚秒。fire-and-forget,失败静默。 */
  async prewarm() {
    if (this.provider !== "laya" || this.layaLoaded) return;
    try {
      await this.ensureLaya();
    } catch {
    }
  }
  async ask(state, questions) {
    const t0 = Date.now();
    try {
      switch (this.provider) {
        case "laya":
          return await this.askLaya(state, questions);
        case "typesafe":
          return await this.askTypesafe(state, questions);
        default:
          return {
            ok: false,
            answers: {},
            latencyMs: 0,
            error: `\u672A\u77E5 provider: ${this.provider}`
          };
      }
    } catch (e) {
      return {
        ok: false,
        answers: {},
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
  /**
  * laya 单飞加载:并发调用(prewarm 与 askLaya)共享同一次 load——上游 Laya.load()
  * 每次重建 tokenizer+InferenceSession(约 1.6GB),无单飞会双开会话内存尖峰。
  * 失败清引用允许下次重试;永不 reject(调用方看 layaLoaded 判定结果)。
  */
  async ensureLaya() {
    if (this.layaLoaded) return true;
    if (this.layaLoading === null) {
      this.layaLoading = (async () => {
        const { Laya } = await import("@receptron/laya");
        this.layaEngine = await Laya.load();
        this.layaLoaded = true;
        return true;
      })().catch(() => {
        this.layaLoading = null;
        return false;
      });
    }
    return this.layaLoading;
  }
  /** laya 本地 ONNX:单次前向,不产生文本,亚秒。 */
  async askLaya(state, questions) {
    const t0 = Date.now();
    if (!this.layaLoaded) await this.ensureLaya();
    if (!this.layaLoaded || this.layaEngine === null) {
      return {
        ok: false,
        answers: {},
        latencyMs: Date.now() - t0,
        error: "laya \u672A\u5C31\u7EEA(\u6743\u91CD\u7F3A\u5931\u6216\u52A0\u8F7D\u5931\u8D25)"
      };
    }
    const raw = await this.layaEngine.systemOne({
      text: state
    }, questions);
    const answers = {};
    for (const [name, a] of Object.entries(raw.answers)) {
      if (a.choice !== void 0) answers[name] = {
        type: "choice",
        value: a.choice,
        confidence: a.confidence ?? 0.5,
        probabilities: a.probabilities
      };
      else if (a.noul !== void 0) answers[name] = {
        type: "noul",
        value: a.noul,
        confidence: a.confidence ?? 0.5
      };
      else if (a.score !== void 0) answers[name] = {
        type: "score",
        value: a.score,
        confidence: a.confidence ?? 0.5
      };
    }
    return {
      ok: true,
      answers,
      latencyMs: Date.now() - t0
    };
  }
  /** typesafe 官方 API:state+questions POST。响应与 laya 同一归一化形状({type,value,confidence}),读取方才不用分 provider。 */
  async askTypesafe(state, questions) {
    const t0 = Date.now();
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state,
        model: "jev-latest",
        questions
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return {
        ok: false,
        answers: {},
        latencyMs: Date.now() - t0,
        error: `HTTP ${res.status}: ${body}`
      };
    }
    const j = await res.json();
    const answers = {};
    for (const [name, a] of Object.entries(j.answers ?? {})) {
      if (a.choice !== void 0) answers[name] = {
        type: "choice",
        value: a.choice,
        confidence: a.confidence ?? 0.5,
        probabilities: a.probabilities
      };
      else if (a.noul !== void 0) answers[name] = {
        type: "noul",
        value: a.noul,
        confidence: a.confidence ?? 0.5
      };
      else if (a.score !== void 0) answers[name] = {
        type: "score",
        value: a.score,
        confidence: a.confidence ?? 0.5
      };
    }
    return {
      ok: true,
      answers,
      latencyMs: Date.now() - t0
    };
  }
};
function noulYes(a, threshold = 0.7) {
  return typeof a.value === "number" && a.value >= threshold && a.confidence >= 0.5;
}

// .build-tools/knowledge/pitfalls.json
var pitfalls_default = {
  xiaohongshu: [
    "\u5168\u7AD9\u98CE\u63A7\u6700\u51F6:V2EX \u6709\u591A\u8D77\u81EA\u52A8\u5316\u64CD\u4F5C\u5BFC\u81F4\u5C01\u53F7\u7684\u5B9E\u6D4B\u6848\u4F8B,\u5199\u64CD\u4F5C(\u53D1\u5E03/\u8BC4\u8BBA/\u70B9\u8D5E)\u52A1\u5FC5\u6781\u4F4E\u9891",
    "\u4E0A\u6E38\u8FD1\u671F\u53CD\u590D\u4FEE xsec \u7B7E\u540D\u4E0E\u98CE\u63A7(#2474/#2470 umbrella)\u2014\u2014\u641C\u7D22/\u7B14\u8BB0\u7C7B\u547D\u4EE4\u53EF\u80FD\u968F\u7AD9\u70B9\u6539\u7248\u5931\u6548",
    "\u51FA\u73B0\u9A8C\u8BC1\u7801\u6216\u98CE\u63A7\u5899\u7ACB\u5373\u505C\u6B62,\u51B7\u5374\u6570\u5206\u949F;\u5B9A\u65F6\u76D1\u63A7\u7C7B\u9700\u6C42\u5EFA\u8BAE\u53EA\u8BFB\u4E0D\u5199"
  ],
  weibo: [
    "\u70ED\u641C/\u65F6\u95F4\u7EBF\u8BFB\u64CD\u4F5C\u76F8\u5BF9\u7A33\u5B9A;\u53D1\u5E16/\u5220\u5E16\u4E3A\u5199\u64CD\u4F5C,\u8D70\u5BA1\u6279\u95E8\u4E14\u4F4E\u9891",
    "\u767B\u5F55 cookie \u6709\u6548\u671F\u504F\u77ED,watch \u7C7B\u957F\u671F\u4EFB\u52A1\u5EFA\u8BAE\u6BCF\u5468\u91CD\u767B\u4E00\u6B21"
  ],
  bilibili: [
    "\u5B98\u65B9 API \u76F8\u5BF9\u5BBD\u5BB9,\u8BFB\u64CD\u4F5C(\u70ED\u95E8/\u6392\u884C/\u641C\u7D22/\u5B57\u5E55/AI \u603B\u7ED3)\u7A33\u5B9A",
    "\u8BC4\u8BBA/\u5173\u6CE8\u4E3A\u5199\u64CD\u4F5C\u8D70\u5BA1\u6279\u95E8;download \u547D\u4EE4\u4F9D\u8D56\u672C\u673A yt-dlp"
  ],
  zhihu: [
    "\u672A\u767B\u5F55\u53EF\u8BFB\u90E8\u5206\u5185\u5BB9,\u5B8C\u6574\u6570\u636E\u9700\u767B\u5F55\u6001",
    "\u8FDE\u7EED\u7FFB\u9875/\u9AD8\u9891\u641C\u7D22\u6613\u89E6\u53D1\u53CD\u722C,\u547D\u4EE4\u95F4\u7559\u95F4\u9694"
  ],
  douban: [
    "\u5E7F\u64AD/\u5C0F\u7EC4\u5185\u5BB9\u9700\u767B\u5F55\u6001;\u6807\u8BB0\u7C7B\u5199\u64CD\u4F5C\u8D70\u5BA1\u6279\u95E8"
  ],
  taobao: [
    "\u4EA4\u6613\u7C7B\u7AD9\u70B9:add-cart \u7B49\u6D89\u53CA\u89C4\u683C\u9009\u62E9\u7684\u547D\u4EE4\u6613\u56E0\u9875\u9762\u6539\u7248\u5931\u6548(#2428)",
    "**\u4EFB\u4F55\u652F\u4ED8/\u4E0B\u5355\u73AF\u8282\u4E0D\u5F97\u81EA\u52A8\u5316**\u2014\u2014\u5199\u64CD\u4F5C\u5168\u90E8\u4EBA\u5DE5\u786E\u8BA4"
  ],
  jd: [
    "\u4EA4\u6613\u7C7B\u7AD9\u70B9,\u540C\u6DD8\u5B9D:\u5199\u64CD\u4F5C\u5168\u90E8\u4EBA\u5DE5\u786E\u8BA4,\u52FF\u81EA\u52A8\u5316\u652F\u4ED8\u73AF\u8282"
  ],
  twitter: [
    "\u56FD\u9645\u7AD9\u70B9,IP \u654F\u611F;\u767B\u5F55\u6001\u4E0E\u4EE3\u7406\u73AF\u5883\u5F3A\u76F8\u5173"
  ],
  youtube: [
    "\u7AD9\u70B9\u6539\u7248\u9891\u7E41(\u64AD\u653E\u5217\u8868\u7ED3\u6784\u8FC1\u79FB\u66FE\u81F4 EMPTY_RESULT #2497)\u2014\u2014\u7A7A\u7ED3\u679C\u5148\u6000\u7591\u6539\u7248\u800C\u975E\u767B\u5F55",
    "download \u4F9D\u8D56 yt-dlp"
  ],
  reddit: [
    "\u672A\u767B\u5F55\u53EF\u8BFB\u5927\u90E8\u5206\u5185\u5BB9;\u9AD8\u9891\u8BF7\u6C42\u6613 429,\u51B7\u5374\u540E\u518D\u8BD5"
  ]
};

// .build-tools/knowledge/health.json
var health_default = {
  xiaohongshu: {
    status: "notice",
    issues: [
      "2.0 \u4FEE\u590D captcha/search/comment(#2562 #2552 #2550 #2549 \u5DF2\u5173\u95ED)+\u65B0\u589E comment/comment-delete \u547D\u4EE4",
      "\u672C\u673A\u672A\u767B\u5F55 XHS,search \u5B9E\u6D4B\u62A5 search_input_not_available\u2014\u2014\u767B\u5F55\u540E\u590D\u9A8C"
    ],
    updated: "2026-10-20"
  },
  instagram: {
    status: "degraded",
    issues: [
      "#2553 /user /search \u62A5 SyntaxError\u2014\u2014\u4E0A\u6E38\u4ECD open"
    ],
    updated: "2026-10-20"
  },
  threads: {
    status: "unsupported",
    issues: [
      "#2564 \u65E0\u9002\u914D\u5668(\u9700\u6C42)"
    ],
    updated: "2026-10-03"
  }
};

// .build-tools/tmp-src/knowledge.js
var SITE_HEALTH_STATUS_LABELS = {
  degraded: "\u53D7\u635F",
  notice: "\u6CE8\u610F",
  unsupported: "\u672A\u652F\u6301"
};
var FAILURE_SIGNATURES = [
  {
    pattern: "EMPTY_RESULT / NO_DATA",
    meaning: "\u547D\u4EE4\u6210\u529F\u4F46\u7AD9\u70B9\u8FD4\u56DE\u7A7A\u2014\u2014\u591A\u4E3A\u672A\u767B\u5F55\u6216\u7AD9\u70B9\u6539\u7248",
    recovery: "`opencli <site> login` \u540E\u7528 whoami \u9A8C\u8BC1;\u4ECD\u7A7A\u5219\u6362\u547D\u4EE4\u6216 browser_* \u6D4F\u89C8\u5668\u515C\u5E95"
  },
  {
    pattern: "AUTH_REQUIRED / NOT_LOGGED_IN / \u8BF7\u5148\u767B\u5F55",
    meaning: "\u767B\u5F55\u6001\u5931\u6548\u6216\u88AB\u5224\u672A\u767B\u5F55(\u90E8\u5206\u7AD9\u98CE\u63A7\u8BEF\u62A5)",
    recovery: "\u5148 `opencli <site> whoami` \u786E\u8BA4;\u771F\u5931\u6548\u518D login"
  },
  {
    pattern: "RATE_LIMITED / 429",
    meaning: "\u8BF7\u6C42\u8FC7\u9891\u88AB\u9650\u6D41",
    recovery: "\u51B7\u5374 \u22652 \u5206\u949F\u518D\u8BD5;\u5B9A\u65F6\u4EFB\u52A1\u5DF2\u81EA\u52A8\u98CE\u63A7\u9000\u907F(120s)"
  },
  {
    pattern: "NAVIGATION_REJECTED",
    meaning: "\u9875\u9762\u62D2\u7EDD\u5BFC\u822A\u2014\u2014\u5076\u53D1\u4E3A\u65F6\u5E8F,\u6301\u7EED\u4E3A\u6269\u5C55/\u6D4F\u89C8\u5668\u72B6\u6001\u5F02\u5E38",
    recovery: "\u91CD\u8BD5\u4E00\u6B21;\u6301\u7EED\u51FA\u73B0\u8DD1 `opencli doctor` \u68C0\u67E5\u6269\u5C55\u8FDE\u63A5"
  },
  {
    pattern: "\u9A8C\u8BC1\u7801 / captcha / Verifying your browser / Just a moment",
    meaning: "\u98CE\u63A7\u5899(\u8F6F\u5C01\u7981)",
    recovery: "\u505C\u6B62\u81EA\u52A8\u5316,\u4EBA\u5DE5\u8FC7\u76FE;**\u964D\u4F4E\u9891\u7387**,\u5199\u64CD\u4F5C\u52A1\u5FC5\u4F4E\u9891"
  },
  {
    pattern: '{"error": ...}',
    meaning: "\u547D\u4EE4\u6267\u884C\u9519\u8BEF(\u7ED3\u6784\u5316\u9519\u8BEF JSON)",
    recovery: "\u8BFB error \u5B57\u6BB5\u5B9A\u4F4D;browser \u515C\u5E95"
  }
];
var PITFALLS = pitfalls_default;
var SITE_HEALTH = health_default;
function healthOf(site) {
  const h = SITE_HEALTH[site.trim().toLowerCase()];
  return h !== void 0 && typeof h === "object" && SITE_HEALTH_STATUS_LABELS[h.status] !== void 0 ? {
    status: h.status,
    issues: Array.isArray(h.issues) ? h.issues.map(String) : [],
    updated: String(h.updated ?? "")
  } : null;
}
function buildKnowledge(site, entries, generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const norm = site.trim().toLowerCase();
  const mine = entries.filter((e) => (e.site ?? e.command?.split("/")[0] ?? "").toLowerCase() === norm);
  if (mine.length === 0) return null;
  const commands = mine.map((e) => ({
    name: e.name ?? e.command?.split("/")[1] ?? "",
    access: e.access ?? "read",
    description: e.description ?? ""
  })).filter((c) => c.name.length > 0).sort((a, b) => a.access.localeCompare(b.access) || a.name.localeCompare(b.name));
  const domain = mine.find((e) => e.domain !== void 0)?.domain;
  const health = healthOf(norm);
  return {
    site: norm,
    ...domain !== void 0 ? {
      domain
    } : {},
    generatedAt,
    commandCount: commands.length,
    commands,
    pitfalls: PITFALLS[norm] ?? [],
    ...health !== null ? {
      health
    } : {}
  };
}
function renderKnowledgeMarkdown(k) {
  const lines = [];
  lines.push(`# \u7AD9\u70B9\u77E5\u8BC6\u5361:${k.site}${k.domain !== void 0 ? `(${k.domain})` : ""}`);
  lines.push("");
  lines.push(`\u751F\u6210\u4E8E ${k.generatedAt} \xB7 ${k.commandCount} \u6761\u7ED3\u6784\u5316\u547D\u4EE4\u3002**\u4F18\u5148\u7528 site \u547D\u4EE4,\u5931\u8D25\u518D\u9000\u6D4F\u89C8\u5668\u539F\u8BED**(\u7701 token\u3001\u53EF\u9A8C\u8BC1)\u3002`);
  if (k.pitfalls.length > 0) {
    lines.push("");
    lines.push("## \u26A0\uFE0F \u5DF2\u77E5\u5751");
    for (const p of k.pitfalls) lines.push(`- ${p}`);
  }
  if (k.health !== void 0) {
    lines.push("");
    const label = SITE_HEALTH_STATUS_LABELS[k.health.status] ?? k.health.status;
    const stale = k.health.updated !== "" ? `(\u6570\u636E ${k.health.updated})` : "";
    lines.push(`## \u{1FA7A} \u7AD9\u70B9\u5065\u5EB7\u5EA6:${label}${stale}`);
    if (k.health.status === "degraded") lines.push("\u4E0A\u6E38 issue \u5B9E\u6D4B\u6838\u5FC3\u547D\u4EE4\u5931\u6548\u2014\u2014\u4F18\u5148 browser_* \u539F\u8BED\u515C\u5E95,\u5931\u8D25\u522B\u53CD\u590D\u91CD\u8BD5\u3002");
    for (const i of k.health.issues) lines.push(`- ${i}`);
  }
  lines.push("");
  lines.push("## \u547D\u4EE4\u76EE\u5F55");
  for (const c of k.commands) {
    const flag = c.access === "write" ? " `[write]`" : "";
    lines.push(`- \`site ${k.site} ${c.name}\`${flag} \u2014 ${c.description}`);
  }
  lines.push("");
  lines.push("## \u5931\u8D25\u7B7E\u540D\u6062\u590D\u8868(\u8F93\u51FA\u5339\u914D\u5230\u7B7E\u540D\u65F6\u6309 recovery \u81EA\u6551)");
  for (const f of FAILURE_SIGNATURES) lines.push(`- **${f.pattern}** \u2192 ${f.meaning}\u3002\u6062\u590D:${f.recovery}`);
  return lines.join("\n");
}
function knowledgeResourceUri(site) {
  return `opencli://sites/${site}/knowledge`;
}
function handleMcpResourceRequest(req, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (req.method === "resources/list") {
    const sites = [
      ...new Set(list.map((e) => (e.site ?? e.command?.split("/")[0] ?? "").toLowerCase()).filter((s) => s.length > 0))
    ].sort();
    return {
      resources: sites.map((site) => {
        const h = healthOf(site);
        return {
          uri: knowledgeResourceUri(site),
          name: `${site} \u7AD9\u70B9\u77E5\u8BC6\u5361`,
          mimeType: "text/markdown",
          ...h !== null ? {
            description: `\u5065\u5EB7\u5EA6:${SITE_HEALTH_STATUS_LABELS[h.status] ?? h.status}(${h.issues.join(";")})`
          } : {}
        };
      })
    };
  }
  if (req.method === "resources/templates/list") {
    return {
      resourceTemplates: [
        {
          uriTemplate: "opencli://sites/{site}/knowledge",
          name: "\u7AD9\u70B9\u77E5\u8BC6\u5361(\u6309\u7AD9\u70B9\u540D\u5C55\u5F00)",
          mimeType: "text/markdown",
          description: "site \u6362\u6210\u9002\u914D\u5668\u540D(\u5982 opencli://sites/weibo/knowledge);\u5185\u5BB9=\u547D\u4EE4\u76EE\u5F55+\u5DF2\u77E5\u5751+\u5065\u5EB7\u5EA6+\u5931\u8D25\u7B7E\u540D\u6062\u590D\u8868"
        }
      ]
    };
  }
  const uri = String(req.uri ?? "");
  const m = uri.match(/^opencli:\/\/sites\/([\w@.-]+)\/knowledge$/);
  if (m === null) throw new Error(`\u672A\u77E5\u8D44\u6E90 URI:${uri}(\u5408\u6CD5\u5F62\u6001 opencli://sites/{site}/knowledge)`);
  const k = buildKnowledge(m[1], list);
  if (k === null) throw new Error(`\u76EE\u5F55\u91CC\u6CA1\u6709 ${m[1]}(URI:${uri})`);
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: renderKnowledgeMarkdown(k)
      }
    ]
  };
}

// .build-tools/tmp-src/reports.js
var STATUS_LABEL = {
  ok: "\u2713 \u6210\u529F",
  fail: "\u2717 \u5931\u8D25",
  silent: "\u26A0 \u7591\u4F3C\u9759\u9ED8\u5931\u8D25",
  suspect: "\u26A0 \u5185\u5BB9\u53EF\u7591"
};
function fence(text, max = 2e3) {
  const clipped = text.length > max ? `${text.slice(0, max)}
\u2026(\u622A\u65AD,\u5168\u6587\u89C1\u5FEB\u7167)` : text;
  return clipped.replace(/```/g, "``");
}
function buildReport(title, sources, genAt) {
  const okN = sources.filter((s) => s.status === "ok").length;
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`\u751F\u6210\u65F6\u95F4:${genAt} \xB7 \u6570\u636E\u6E90 ${sources.length} \u4E2A(\u6210\u529F ${okN})\u3002\u5168\u90E8\u6570\u5B57\u4E0E\u6587\u672C\u6765\u81EA\u91C7\u96C6\u539F\u6587,\u96F6\u6A21\u578B\u6539\u5199;\u9010\u8282\u51FA\u5904\u89C1\u4E0B\u3002`);
  lines.push("");
  lines.push("## \u7AD9\u70B9\u7ED3\u679C");
  for (const s of sources) {
    lines.push("");
    lines.push(`### ${s.site} \u2014 ${STATUS_LABEL[s.status]}${s.note !== void 0 && s.note.length > 0 ? `(${s.note})` : ""}`);
    lines.push("");
    lines.push(`- \u51FA\u5904\u547D\u4EE4:\`${s.command}\` \xB7 \u6267\u884C\u65F6\u95F4:${s.at}${s.source !== void 0 && s.source.length > 0 ? ` \xB7 \u5FEB\u7167:\`${s.source}\`` : ""}`);
    lines.push("");
    lines.push("```text");
    lines.push(fence(s.text));
    lines.push("```");
  }
  lines.push("");
  lines.push("## \u6570\u636E\u6E90\u4E0E\u7F3A\u53E3\u58F0\u660E");
  const fails = sources.filter((s) => s.status === "fail");
  const silents = sources.filter((s) => s.status === "silent");
  const suspects = sources.filter((s) => s.status === "suspect");
  lines.push(`- \u6210\u529F ${okN}/${sources.length};\u5931\u8D25 ${fails.length};\u7591\u4F3C\u9759\u9ED8\u5931\u8D25 ${silents.length};\u5185\u5BB9\u53EF\u7591 ${suspects.length}(\u5224\u5B9A\u4EC5\u63D0\u793A,\u539F\u6587\u672A\u6539)\u3002`);
  for (const f of fails) lines.push(`- \u5931\u8D25:${f.site}(\`${f.command}\`)\u2014\u2014\u539F\u6587\u9996\u884C:${f.text.split("\n")[0]?.slice(0, 120) || "(\u7A7A)"}`);
  for (const f of silents) lines.push(`- \u9759\u9ED8\u5931\u8D25:${f.site}(\`${f.command}\`)\u2014\u2014exit 0 \u4F46\u5185\u5BB9\u88AB\u5224\u65E0\u6548${f.note !== void 0 ? `(${f.note})` : ""},\u8BE5\u8282\u6570\u636E\u4E0D\u53EF\u4FE1`);
  for (const f of suspects) lines.push(`- \u53EF\u7591:${f.site}\u2014\u2014\u5224\u5B9A\u63D0\u793A\u590D\u6838,\u4F7F\u7528\u524D\u8BF7\u4EBA\u5DE5\u786E\u8BA4`);
  if (sources.length === 0) lines.push("- \u58F0\u660E:\u672C\u6B21\u65E0\u4EFB\u4F55\u6570\u636E\u6E90(\u5168\u90E8\u7F3A\u5E2D),\u62A5\u544A\u53EA\u6709\u9AA8\u67B6\u3002");
  lines.push("");
  lines.push("> \u751F\u6210\u4E8E dsh-opencli(\u767B\u5F55\u6001\u91C7\u96C6\xD7\u51FA\u5904\u53EF\u6EAF);\u6BCF\u8282\u56F4\u680F\u5185\u4E3A\u547D\u4EE4\u539F\u59CB\u8F93\u51FA\u3002");
  return lines.join("\n");
}

// .build-tools/tmp-src/cards.js
var GLYPH = {
  ok: "\u2713",
  fail: "\u2717",
  warn: "\u26A0"
};
var EXIT_FAIL = /^命令失败\(退出码 (-?\d+)\):\n?/;
var VERIFY_NOTE = /\((⚠ 疑似静默失败:[^)]*|⚠ 内容可疑:[^)]*|实测有效 P=[\d.]+)\)/;
var TAKEOVER_HINT = "\u{1F449} \u72B6\u6001\u5F02\u5E38:\u5EFA\u8BAE\u4EBA\u5DE5\u63A5\u7BA1\u6216\u6539\u7528 browser_* \u539F\u8BED";
var HAS_LOGIN_HINT = /登录|login/i;
function asRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? x : null;
}
function textOf(value) {
  const v = asRecord(value);
  return v !== null && typeof v.text === "string" ? v.text : null;
}
function shellJoin(tokens) {
  return tokens.map((t) => /"|\s/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t).join(" ");
}
function fence2(body, lang = "") {
  const runs = body.match(/`{3,}/g);
  const n = runs === null ? 3 : Math.max(3, ...runs.map((r) => r.length)) + 1;
  const f = "`".repeat(n);
  return `${f}${lang}
${body}
${f}`;
}
function card(...parts) {
  return [
    {
      type: "text",
      text: parts.filter((p) => p.length > 0).join("\n\n")
    }
  ];
}
function siteStatusOf(text) {
  const ex = EXIT_FAIL.exec(text);
  if (ex !== null) return {
    status: "fail",
    label: `exit ${ex[1]}`
  };
  const note = VERIFY_NOTE.exec(text);
  if (note !== null && note[1].startsWith("\u26A0")) return {
    status: "warn",
    label: note[1].replace(/^⚠ /, "")
  };
  if (/疑似静默失败/.test(text)) return {
    status: "warn",
    label: "\u7591\u4F3C\u9759\u9ED8\u5931\u8D25"
  };
  if (/^适配器 \S+ 返回空/.test(text)) return {
    status: "warn",
    label: "\u7A7A\u7ED3\u679C(\u7591\u4F3C\u672A\u767B\u5F55)"
  };
  if (/导航被拒/.test(text)) return {
    status: "fail",
    label: "\u5BFC\u822A\u88AB\u62D2"
  };
  if (/已被禁用|^非法 adapter|^未知 authProfile:|^authProfile \S+ 不允许访问域/.test(text)) return {
    status: "fail",
    label: "\u88AB\u62E6\u622A"
  };
  if (note !== null) return {
    status: "ok",
    label: `exit 0 \xB7 ${note[1]}`
  };
  return {
    status: "ok",
    label: "exit 0"
  };
}
function siteCardRender(args, value) {
  const text = textOf(value);
  if (text === null) return [
    {
      type: "text",
      text: ""
    }
  ];
  const a = asRecord(args);
  const adapter = a !== null && typeof a.adapter === "string" ? a.adapter : "?";
  const command = a !== null && typeof a.command === "string" ? a.command : "?";
  const rest = a !== null && Array.isArray(a.args) ? a.args.map(String) : [];
  const st = siteStatusOf(text);
  const head = `\u25A3 site \xB7 ${adapter} \xB7 ${command} \u2014 ${GLYPH[st.status]} ${st.label}`;
  const cmd = fence2(`$ ${shellJoin([
    "site",
    adapter,
    command,
    ...rest
  ])}`, "console");
  const ex = EXIT_FAIL.exec(text);
  const payload = ex !== null ? text.slice(ex[0].length) : text;
  const hint = st.status === "fail" && !HAS_LOGIN_HINT.test(payload) ? [
    TAKEOVER_HINT
  ] : [];
  if (payload.trim().length === 0) return card(head, cmd, ...hint);
  return card(head, cmd, fence2(payload), ...hint);
}
function parseBatchText(text, knownSites) {
  const notes = [];
  const sections = [];
  const seen = /* @__PURE__ */ new Set();
  let cur = null;
  for (const line of text.split("\n")) {
    const h = /^== (\S+) (✓|✗)(.*?) ==$/.exec(line);
    if (h !== null && (knownSites === void 0 || knownSites.has(h[1]) && !seen.has(h[1]))) {
      seen.add(h[1]);
      if (cur !== null) sections.push(cur);
      cur = {
        site: h[1],
        ok: h[2] === "\u2713",
        badge: h[3],
        body: ""
      };
      continue;
    }
    if (cur === null) {
      if (line.trim().length > 0 && !/^批量采集 /.test(line)) notes.push(line);
      continue;
    }
    cur.body += cur.body.length === 0 ? line : `
${line}`;
  }
  if (cur !== null) sections.push(cur);
  for (const s of sections) {
    s.badge = s.badge.trim();
    s.body = s.body.replace(/^\n+/, "").replace(/\n+$/, "");
  }
  return {
    notes,
    sections
  };
}
function batchRow(s) {
  const p = /P=([\d.]+)/.exec(s.badge)?.[1] ?? "\u2014";
  if (!s.ok) return {
    glyph: GLYPH.fail,
    status: "fail",
    label: "\u5931\u8D25",
    p
  };
  if (s.badge.includes("\u7591\u4F3C\u9759\u9ED8\u5931\u8D25")) return {
    glyph: GLYPH.warn,
    status: "warn",
    label: "\u7591\u4F3C\u9759\u9ED8\u5931\u8D25",
    p
  };
  if (s.badge.includes("\u5185\u5BB9\u53EF\u7591")) return {
    glyph: GLYPH.warn,
    status: "warn",
    label: "\u5185\u5BB9\u53EF\u7591",
    p
  };
  if (s.badge.includes("\u5B9E\u6D4B\u6709\u6548")) return {
    glyph: GLYPH.ok,
    status: "ok",
    label: "\u6709\u6548",
    p
  };
  return {
    glyph: GLYPH.ok,
    status: "ok",
    label: "\u6210\u529F",
    p
  };
}
function siteBatchCardRender(args, value) {
  const text = textOf(value);
  if (text === null) return [
    {
      type: "text",
      text: ""
    }
  ];
  const a = asRecord(args);
  const command = a !== null && typeof a.command === "string" && a.command.length > 0 ? a.command : "?";
  const sitesArg = a !== null && Array.isArray(a.sites) ? a.sites.map(String) : [];
  const { notes, sections } = parseBatchText(text, sitesArg.length > 0 ? new Set(sitesArg) : void 0);
  if (sections.length === 0) {
    return card(`\u25A3 site_batch \xB7 ${command} \u2014 ${GLYPH.fail} \u88AB\u62D2\u7EDD`, text, ...HAS_LOGIN_HINT.test(text) ? [] : [
      TAKEOVER_HINT
    ]);
  }
  const rows = sections.map((s) => ({
    s,
    r: batchRow(s)
  }));
  const n = rows.length;
  const okN = rows.filter((x) => x.s.ok).length;
  const silentN = rows.filter((x) => x.r.label === "\u7591\u4F3C\u9759\u9ED8\u5931\u8D25").length;
  const status = silentN > 0 ? "warn" : okN === n ? "ok" : okN === 0 ? "fail" : "warn";
  const head = `\u25A3 site_batch \xB7 ${command} \xD7 ${n} \u7AD9 \u2014 ${GLYPH[status]} ${okN}/${n} \u7AD9\u6210\u529F${silentN > 0 ? ` \xB7 ${silentN} \u7591\u4F3C\u9759\u9ED8\u5931\u8D25` : ""}`;
  const table = [
    "| \u7AD9\u70B9 | \u72B6\u6001 | P |",
    "| --- | --- | --- |",
    ...rows.map((x) => `| ${x.s.site} | ${x.r.glyph} ${x.r.label} | ${x.r.p} |`)
  ].join("\n");
  const raw = sections.map((s) => `== ${s.site} ${s.ok ? "\u2713" : "\u2717"}${s.badge} ==
${s.body}`).join("\n\n");
  const failSections = sections.filter((s) => !s.ok);
  const hint = failSections.length > 0 && !failSections.every((s) => HAS_LOGIN_HINT.test(s.body)) ? [
    TAKEOVER_HINT
  ] : [];
  return card(head, ...notes.length > 0 ? [
    notes.join("\n")
  ] : [], table, fence2(raw), ...hint);
}
function shotNameOf(shot) {
  const seg = shot.split(/[\\/]/).filter((s) => s.length > 0);
  return seg.length > 0 ? seg[seg.length - 1] : shot;
}
function browserDoCardRender(args, value) {
  const text = textOf(value);
  if (text === null) return [
    {
      type: "text",
      text: ""
    }
  ];
  const a = asRecord(args);
  const command = a !== null && typeof a.command === "string" ? a.command : "?";
  const rest = a !== null && Array.isArray(a.args) ? a.args.map(String) : [];
  const session = a !== null && typeof a.session === "string" && a.session.length > 0 && a.session !== "dsh" ? a.session : null;
  const rec = asRecord(value);
  const shotHint = rec !== null && typeof rec.shot === "string" && rec.shot.length > 0 ? ` (shot: ${shotNameOf(rec.shot)})` : "";
  const ex = EXIT_FAIL.exec(text);
  const st = ex !== null ? {
    status: "fail",
    label: `exit ${ex[1]}`
  } : /^不允许的子命令/.test(text) ? {
    status: "fail",
    label: "\u5B50\u547D\u4EE4\u88AB\u62D2"
  } : {
    status: "ok",
    label: "exit 0"
  };
  const head = `\u25A3 browser_do \xB7 ${command}${session !== null ? ` \xB7 session ${session}` : ""} \u2014 ${GLYPH[st.status]} ${st.label}`;
  const cmdSeg = `**\u547D\u4EE4**
${fence2(`$ ${shellJoin([
    "browser_do",
    command,
    ...rest
  ])}${shotHint}`, "console")}`;
  const payload = ex !== null ? text.slice(ex[0].length) : text;
  const hint = st.status === "fail" && !HAS_LOGIN_HINT.test(payload) ? [
    TAKEOVER_HINT
  ] : [];
  if (payload.trim().length === 0) return card(head, cmdSeg, ...hint);
  return card(head, cmdSeg, `**\u7ED3\u679C**
${fence2(payload)}`, ...hint);
}

// .build-tools/tmp-src/benchmark.js
var DEFAULT_BENCH = [
  "juejin hot",
  "36kr hot",
  "hackernews best",
  "v2ex hot",
  "bilibili hot"
];
var BENCH_KEEP = 20;
function cell(text, max = 80) {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim().slice(0, max);
}
function buildBenchmarkReport(items, genAt) {
  const okN = items.filter((x) => x.ok).length;
  const lines = [];
  lines.push("# \u7AD9\u70B9\u5192\u70DF\u57FA\u51C6\u62A5\u544A");
  lines.push("");
  lines.push(`\u751F\u6210\u65F6\u95F4:${genAt} \xB7 \u7AD9\u70B9 ${items.length} \u4E2A(\u6210\u529F ${okN})\u3002\u7ED3\u679C/P/\u8017\u65F6\u5747\u4E3A\u5355\u6B21\u771F\u673A\u5B9E\u6D4B,\u96F6\u6A21\u578B\u6539\u5199;\u9010\u884C\u547D\u4EE4\u89C1\u5C3E\u90E8\u590D\u73B0\u5757\u3002`);
  lines.push("");
  lines.push("| \u7AD9\u70B9 | \u547D\u4EE4 | \u7ED3\u679C | \u771F\u5B9E\u6027 P | \u8017\u65F6 ms | \u9519\u8BEF\u6458\u8981 |");
  lines.push("|---|---|---|---|---|---|");
  for (const it of items) {
    lines.push(`| ${cell(it.site, 30)} | \`${cell(it.command, 60)}\` | ${it.ok ? "\u2713 ok" : "\u2717 \u5931\u8D25"} | ${it.p === null ? "\u2014" : it.p.toFixed(2)} | ${Math.max(0, Math.round(it.ms))} | ${it.ok || it.error === void 0 ? "" : cell(it.error)} |`);
  }
  lines.push("");
  lines.push("## \u590D\u73B0\u547D\u4EE4");
  lines.push("");
  lines.push("```bash");
  for (const it of items) lines.push(`opencli ${it.command}`);
  lines.push("```");
  lines.push("");
  lines.push('> \u514D\u8D23:\u5355\u6B21\u8FD0\u884C\u7ED3\u679C,\u7F51\u7EDC/\u767B\u5F55\u6001/\u9650\u6D41\u90FD\u5F71\u54CD\u6210\u8D25\u4E0E\u8017\u65F6(\u76F4\u8FDE\u7AD9\u70B9\u8D85\u65F6\u5C5E\u6B63\u5E38\u6CE2\u52A8);P \u4E3A SystemOne/\u89C4\u5219\u5C42\u5224\u5B9A,"\u2014"\u4E3A\u65E0\u5224\u5B9A;\u6A2A\u5411\u5BF9\u6BD4\u8BF7\u540C\u73AF\u5883\u591A\u8F6E\u53D6\u5747\u503C,\u52FF\u4EE5\u5355\u8F6E\u4E0B\u7ED3\u8BBA\u3002');
  return lines.join("\n");
}
function renderBenchmarkTable(items) {
  const flat = (s, max) => s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const rows = items.map((it) => ({
    site: flat(it.site, 20),
    cmd: flat(it.command, 24),
    ok: it.ok ? "ok" : "FAIL",
    p: it.p === null ? "-" : it.p.toFixed(2),
    ms: String(Math.max(0, Math.round(it.ms))),
    err: it.ok || it.error === void 0 ? "" : flat(it.error, 48)
  }));
  const head = {
    site: "site",
    cmd: "cmd",
    ok: "result",
    p: "P",
    ms: "ms",
    err: "error"
  };
  const w = (k) => Math.max(head[k].length, ...rows.map((r) => r[k].length));
  const okN = items.filter((x) => x.ok).length;
  const out = [
    `\u5192\u70DF\u57FA\u51C6:\u6210\u529F ${okN}/${items.length}(P \u4E3A\u771F\u5B9E\u6027\u5224\u5B9A,- \u4E3A\u65E0\u5224\u5B9A)`,
    ""
  ];
  if (rows.length > 0) {
    out.push([
      "site".padEnd(w("site")),
      "cmd".padEnd(w("cmd")),
      "result".padEnd(w("ok")),
      "P".padStart(4),
      "ms".padStart(6),
      "error"
    ].join("  "));
    for (const r of rows) {
      out.push([
        r.site.padEnd(w("site")),
        r.cmd.padEnd(w("cmd")),
        r.ok.padEnd(w("ok")),
        r.p.padStart(4),
        r.ms.padStart(6),
        r.err
      ].join("  "));
    }
  }
  return out.join("\n");
}
var CANARY_TOP = 20;
var CANARY_KEEP = 14;
var RESERVED_NAMESPACES = /* @__PURE__ */ new Set([
  "browser",
  "adapter",
  "daemon",
  "auth",
  "profile",
  "doctor",
  "extension",
  "chrome",
  "opencli",
  "canary",
  "benchmark"
]);
function pickCanaryCommands(adapters) {
  const hotWords = [
    "hot",
    "latest",
    "feed",
    "trending",
    "daily",
    "best",
    "home",
    "frontpage",
    "following",
    "notifications",
    "digest",
    "recommend"
  ];
  const ranked = [
    ...adapters
  ].filter((a) => !RESERVED_NAMESPACES.has(a.name)).sort((a, b) => b.commands.length - a.commands.length || a.name.localeCompare(b.name));
  const out = [];
  for (const a of ranked) {
    if (out.length >= CANARY_TOP) break;
    const hit = a.commands.find((c) => hotWords.some((w) => c === w)) ?? a.commands.find((c) => hotWords.some((w) => c.startsWith(w + "-") || c.endsWith("-" + w)));
    if (hit !== void 0) out.push(`${a.name} ${hit}`);
  }
  return out;
}
function parseCanarySnapshot(prevMd) {
  const m = /* @__PURE__ */ new Map();
  if (prevMd === null) return m;
  for (const line of prevMd.split("\n")) {
    const t = /^\| (\S+) \| `([^`]+)` \| (✓ ok|✗)/.exec(line.trim());
    if (t !== null) m.set(t[2], t[3] === "\u2713 ok");
  }
  return m;
}
function buildCanaryReport(items, prev, genAt) {
  const newFailures = items.filter((x) => !x.ok && prev.get(x.command) === true);
  const recovered = items.filter((x) => x.ok && prev.get(x.command) === false);
  const passN = items.filter((x) => x.ok).length;
  const head = [
    "# \u7AD9\u70B9\u6F02\u79FB canary \u62A5\u544A",
    "",
    `\u751F\u6210\u65F6\u95F4:${genAt} \xB7 \u7AD9\u70B9 ${items.length} \u4E2A(\u901A\u8FC7 ${passN})\u3002\u4E0A\u4E00\u8F6E\u57FA\u7EBF ${prev.size} \u6761;\u5168\u90E8\u6570\u5B57\u6765\u81EA\u91C7\u96C6\u539F\u6587,\u96F6\u6A21\u578B\u6539\u5199\u3002`,
    ""
  ];
  const drift = prev.size === 0 ? [
    "## \u6F02\u79FB(\u9996\u8DD1,\u5EFA\u7ACB\u57FA\u7EBF)",
    "",
    "\u65E0\u4E0A\u4E00\u8F6E\u53EF\u6BD4\u2014\u2014\u672C\u62A5\u544A\u5373\u57FA\u7EBF\u3002",
    ""
  ] : [
    "## \u6F02\u79FB(vs \u4E0A\u4E00\u8F6E)",
    "",
    newFailures.length > 0 ? `**\u65B0\u5931\u8D25 ${newFailures.length}:** ${newFailures.map((x) => `\`${x.command}\`(${x.error ?? "exit\u22600"})`).join("\u3001")}` : "\u65E0\u65B0\u5931\u8D25\u3002",
    "",
    recovered.length > 0 ? `**\u6062\u590D ${recovered.length}:** ${recovered.map((x) => `\`${x.command}\``).join("\u3001")}` : "\u65E0\u6062\u590D\u3002",
    ""
  ];
  const body = buildBenchmarkReport(items, genAt).replace(/^# 站点冒烟基准报告.*\n/, "");
  return [
    ...head,
    ...drift,
    "## \u9010\u7AD9\u660E\u7EC6",
    "",
    body
  ].join("\n") + "\n";
}

// .build-tools/tmp-src/evidence.js
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync, unlinkSync } from "node:fs";
import { join as join2 } from "node:path";
var EVIDENCE_KEEP = 100;
var EVIDENCE_FILE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([\w.@-]+)\.json$/;
function buildEvidence(input) {
  return {
    at: input.at ?? (/* @__PURE__ */ new Date()).toISOString(),
    command: String(input.command),
    argv: input.argv.map((x) => String(x)),
    approval: input.approval,
    beforeShot: input.beforeShot ?? null,
    afterShot: input.afterShot ?? null,
    shotNote: input.beforeShot != null || input.afterShot != null ? "\u8FD1\u4F3C\u53D6\u8BC1:\u622A\u56FE\u4E3A dsh \u4F1A\u8BDD\u5F53\u524D\u9875,\u975E\u547D\u4EE4\u5B9E\u9645\u4F5C\u7528\u9875(\u9002\u914D\u5668\u7ECF daemon \u6D4F\u89C8\u5668\u6267\u884C)" : null,
    result: {
      exitCode: Number(input.result.exitCode),
      head: String(input.result.head).slice(0, 200)
    },
    site: String(input.site)
  };
}
function evidenceStamp(at) {
  return at.replace(/[:.]/g, "-");
}
function evidenceFileName(at, site) {
  return `${evidenceStamp(at)}-${String(site).replace(/[^\w.@-]/g, "_")}.json`;
}
async function saveEvidence(dir, record, keep = EVIDENCE_KEEP) {
  await mkdir(dir, {
    recursive: true
  });
  const file = join2(dir, evidenceFileName(record.at, record.site));
  await writeFile(file, JSON.stringify(record, null, 2), "utf8");
  const olds = readdirSync(dir).filter((f) => EVIDENCE_FILE_RE.test(f)).sort();
  if (olds.length > keep) for (const f of olds.slice(0, olds.length - keep)) {
    try {
      unlinkSync(join2(dir, f));
    } catch {
    }
  }
  return file;
}
function parseEvidenceFileName(name) {
  const m = EVIDENCE_FILE_RE.exec(name);
  if (m === null) return null;
  const dashed = m[1];
  return {
    at: `${dashed.slice(0, 13)}:${dashed.slice(14, 16)}:${dashed.slice(17, 19)}.${dashed.slice(20, 23)}Z`,
    site: m[2]
  };
}

// .build-tools/tmp-src/index.js
function _apply_decs_2203_r(targetClass, memberDecs, classDecs, parentClass) {
  function createAddInitializerMethod(initializers, decoratorFinishedRef) {
    return function addInitializer(initializer) {
      assertNotFinished(decoratorFinishedRef, "addInitializer");
      assertCallable(initializer, "An initializer");
      initializers.push(initializer);
    };
  }
  function memberDec(dec, name, desc, initializers, kind, isStatic, isPrivate, metadata, value) {
    var kindStr;
    switch (kind) {
      case 1:
        kindStr = "accessor";
        break;
      case 2:
        kindStr = "method";
        break;
      case 3:
        kindStr = "getter";
        break;
      case 4:
        kindStr = "setter";
        break;
      default:
        kindStr = "field";
    }
    var ctx = {
      kind: kindStr,
      name: isPrivate ? "#" + name : name,
      static: isStatic,
      private: isPrivate,
      metadata
    };
    var decoratorFinishedRef = {
      v: false
    };
    ctx.addInitializer = createAddInitializerMethod(initializers, decoratorFinishedRef);
    var get, set;
    if (kind === 0) {
      if (isPrivate) {
        get = desc.get;
        set = desc.set;
      } else {
        get = function() {
          return this[name];
        };
        set = function(v) {
          this[name] = v;
        };
      }
    } else if (kind === 2) {
      get = function() {
        return desc.value;
      };
    } else {
      if (kind === 1 || kind === 3) {
        get = function() {
          return desc.get.call(this);
        };
      }
      if (kind === 1 || kind === 4) {
        set = function(v) {
          desc.set.call(this, v);
        };
      }
    }
    if (get) {
      var originalGet = get;
      get = function(target) {
        if (arguments.length === 0) {
          target = this;
        }
        return originalGet.call(target);
      };
    }
    if (set) {
      var originalSet = set;
      set = function(target, value2) {
        if (arguments.length === 1) {
          value2 = target;
          target = this;
        }
        return originalSet.call(target, value2);
      };
    }
    if (isPrivate) {
      ctx.access = get && set ? {
        get,
        set
      } : get ? {
        get
      } : {
        set
      };
    } else {
      var has = function(target) {
        return name in target;
      };
      ctx.access = get && set ? {
        has,
        get,
        set
      } : get ? {
        has,
        get
      } : {
        has,
        set
      };
    }
    var newValue = dec(value, ctx);
    decoratorFinishedRef.v = true;
    return newValue;
  }
  function assertNotFinished(decoratorFinishedRef, fnName) {
    if (decoratorFinishedRef.v) {
      throw new Error("attempted to call " + fnName + " after decoration was finished");
    }
  }
  function assertCallable(fn, hint) {
    if (typeof fn !== "function") {
      throw new TypeError(hint + " must be a function");
    }
  }
  function assertValidReturnValue(kind, value) {
    var type = typeof value;
    if (kind === 1) {
      if (type !== "object" || value === null) {
        throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");
      }
      if (value.get !== void 0) {
        assertCallable(value.get, "accessor.get");
      }
      if (value.set !== void 0) {
        assertCallable(value.set, "accessor.set");
      }
      if (value.init !== void 0) {
        assertCallable(value.init, "accessor.init");
      }
    } else if (type !== "function") {
      var hint;
      if (kind === 0) {
        hint = "field";
      } else if (kind === 10) {
        hint = "class";
      } else {
        hint = "method";
      }
      throw new TypeError(hint + " decorators must return a function or void 0");
    }
  }
  function applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers, metadata) {
    var decs = decInfo[0];
    var desc, init, value;
    if (isPrivate) {
      if (kind === 0 || kind === 1) {
        desc = {
          get: decInfo[3],
          set: decInfo[4]
        };
      } else if (kind === 3) {
        desc = {
          get: decInfo[3]
        };
      } else if (kind === 4) {
        desc = {
          set: decInfo[3]
        };
      } else {
        desc = {
          value: decInfo[3]
        };
      }
    } else if (kind !== 0) {
      desc = Object.getOwnPropertyDescriptor(base, name);
    }
    if (kind === 1) {
      value = {
        get: desc.get,
        set: desc.set
      };
    } else if (kind === 2) {
      value = desc.value;
    } else if (kind === 3) {
      value = desc.get;
    } else if (kind === 4) {
      value = desc.set;
    }
    var newValue, get, set;
    if (typeof decs === "function") {
      newValue = memberDec(decs, name, desc, initializers, kind, isStatic, isPrivate, metadata, value);
      if (newValue !== void 0) {
        assertValidReturnValue(kind, newValue);
        if (kind === 0) {
          init = newValue;
        } else if (kind === 1) {
          init = newValue.init;
          get = newValue.get || value.get;
          set = newValue.set || value.set;
          value = {
            get,
            set
          };
        } else {
          value = newValue;
        }
      }
    } else {
      for (var i = decs.length - 1; i >= 0; i--) {
        var dec = decs[i];
        newValue = memberDec(dec, name, desc, initializers, kind, isStatic, isPrivate, metadata, value);
        if (newValue !== void 0) {
          assertValidReturnValue(kind, newValue);
          var newInit;
          if (kind === 0) {
            newInit = newValue;
          } else if (kind === 1) {
            newInit = newValue.init;
            get = newValue.get || value.get;
            set = newValue.set || value.set;
            value = {
              get,
              set
            };
          } else {
            value = newValue;
          }
          if (newInit !== void 0) {
            if (init === void 0) {
              init = newInit;
            } else if (typeof init === "function") {
              init = [
                init,
                newInit
              ];
            } else {
              init.push(newInit);
            }
          }
        }
      }
    }
    if (kind === 0 || kind === 1) {
      if (init === void 0) {
        init = function(instance, init2) {
          return init2;
        };
      } else if (typeof init !== "function") {
        var ownInitializers = init;
        init = function(instance, init2) {
          var value2 = init2;
          for (var i2 = 0; i2 < ownInitializers.length; i2++) value2 = ownInitializers[i2].call(instance, value2);
          return value2;
        };
      } else {
        var originalInitializer = init;
        init = function(instance, init2) {
          return originalInitializer.call(instance, init2);
        };
      }
      ret.push(init);
    }
    if (kind !== 0) {
      if (kind === 1) {
        desc.get = value.get;
        desc.set = value.set;
      } else if (kind === 2) {
        desc.value = value;
      } else if (kind === 3) {
        desc.get = value;
      } else if (kind === 4) {
        desc.set = value;
      }
      if (isPrivate) {
        if (kind === 1) {
          ret.push(function(instance, args) {
            return value.get.call(instance, args);
          });
          ret.push(function(instance, args) {
            return value.set.call(instance, args);
          });
        } else if (kind === 2) {
          ret.push(value);
        } else {
          ret.push(function(instance, args) {
            return value.call(instance, args);
          });
        }
      } else {
        Object.defineProperty(base, name, desc);
      }
    }
  }
  function applyMemberDecs(Class, decInfos, metadata) {
    var ret = [];
    var protoInitializers;
    var staticInitializers;
    var existingProtoNonFields = /* @__PURE__ */ new Map();
    var existingStaticNonFields = /* @__PURE__ */ new Map();
    for (var i = 0; i < decInfos.length; i++) {
      var decInfo = decInfos[i];
      if (!Array.isArray(decInfo)) continue;
      var kind = decInfo[1];
      var name = decInfo[2];
      var isPrivate = decInfo.length > 3;
      var isStatic = kind >= 5;
      var base;
      var initializers;
      if (isStatic) {
        base = Class;
        kind = kind - 5;
        staticInitializers = staticInitializers || [];
        initializers = staticInitializers;
      } else {
        base = Class.prototype;
        protoInitializers = protoInitializers || [];
        initializers = protoInitializers;
      }
      if (kind !== 0 && !isPrivate) {
        var existingNonFields = isStatic ? existingStaticNonFields : existingProtoNonFields;
        var existingKind = existingNonFields.get(name) || 0;
        if (existingKind === true || existingKind === 3 && kind !== 4 || existingKind === 4 && kind !== 3) {
          throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + name);
        } else if (!existingKind && kind > 2) {
          existingNonFields.set(name, kind);
        } else {
          existingNonFields.set(name, true);
        }
      }
      applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers, metadata);
    }
    pushInitializers(ret, protoInitializers);
    pushInitializers(ret, staticInitializers);
    return ret;
  }
  function pushInitializers(ret, initializers) {
    if (initializers) {
      ret.push(function(instance) {
        for (var i = 0; i < initializers.length; i++) initializers[i].call(instance);
        return instance;
      });
    }
  }
  function applyClassDecs(targetClass2, classDecs2, metadata) {
    if (classDecs2.length > 0) {
      var initializers = [];
      var newClass = targetClass2;
      var name = targetClass2.name;
      for (var i = classDecs2.length - 1; i >= 0; i--) {
        var decoratorFinishedRef = {
          v: false
        };
        var nextNewClass = classDecs2[i](newClass, {
          kind: "class",
          name,
          addInitializer: createAddInitializerMethod(initializers, decoratorFinishedRef),
          metadata
        });
        decoratorFinishedRef.v = true;
        if (nextNewClass !== void 0) {
          assertValidReturnValue(10, nextNewClass);
          newClass = nextNewClass;
        }
      }
      return [
        defineMetadata(newClass, metadata),
        function() {
          for (var i2 = 0; i2 < initializers.length; i2++) initializers[i2].call(newClass);
        }
      ];
    }
  }
  function defineMetadata(Class, metadata) {
    return Object.defineProperty(Class, Symbol.metadata || /* @__PURE__ */ Symbol.for("Symbol.metadata"), {
      configurable: true,
      enumerable: true,
      value: metadata
    });
  }
  _apply_decs_2203_r = function(targetClass2, memberDecs2, classDecs2, parentClass2) {
    if (parentClass2 !== void 0) {
      var parentMetadata = parentClass2[Symbol.metadata || /* @__PURE__ */ Symbol.for("Symbol.metadata")];
    }
    var metadata = Object.create(parentMetadata === void 0 ? null : parentMetadata);
    var e = applyMemberDecs(targetClass2, memberDecs2, metadata);
    if (!classDecs2.length) defineMetadata(targetClass2, metadata);
    return {
      e,
      get c() {
        return applyClassDecs(targetClass2, classDecs2, metadata);
      }
    };
  };
  return _apply_decs_2203_r(targetClass, memberDecs, classDecs, parentClass);
}
var _computedKey;
var _dec;
var _dec1;
var _dec2;
var _dec3;
var _dec4;
var _dec5;
var _dec6;
var _dec7;
var _dec8;
var _dec9;
var _dec10;
var _dec11;
var _dec12;
var _dec13;
var _dec14;
var _dec15;
var _dec16;
var _dec17;
var _dec18;
var _dec19;
var _dec20;
var _dec21;
var _dec22;
var _dec23;
var _dec24;
var _dec25;
var _dec26;
var _dec27;
var _dec28;
var _dec29;
var _dec30;
var _dec31;
var _dec32;
var _dec33;
var _dec34;
var _dec35;
var _dec36;
var _dec37;
var _dec38;
var _dec39;
var _dec40;
var _dec41;
var _dec42;
var _dec43;
var _dec44;
var _initProto;
var BROWSER_DO_ALLOW = /* @__PURE__ */ new Set([
  "analyze",
  "back",
  "bind",
  "check",
  "close",
  "console",
  "dblclick",
  "dialog",
  "drag",
  "eval",
  "find",
  "focus",
  "frames",
  "get",
  "hover",
  "init",
  "keys",
  "network",
  "select",
  "tab",
  "unbind",
  "uncheck",
  "upload",
  "verify"
]);
var SHOT_TRIGGER_SUBS = /* @__PURE__ */ new Set([
  "open",
  "back",
  "click",
  "dblclick",
  "type",
  "fill",
  "select",
  "keys",
  "hover",
  "drag"
]);
var CHROME_METHODS_ALLOW = /* @__PURE__ */ new Set([
  "tabs.query",
  "tabs.get",
  "tabs.create",
  "tabs.duplicate",
  "tabs.update",
  "tabs.move",
  "tabs.remove",
  "tabs.group",
  "tabs.ungroup",
  "tabGroups.query",
  "tabGroups.get",
  "tabGroups.update",
  "tabGroups.move",
  "windows.get",
  "windows.getAll",
  "windows.create",
  "windows.update",
  "windows.remove"
]);
var OUTPUT_LIMIT = 16e3;
var ADAPTER_TTL_MS = 60 * 60 * 1e3;
var LOGIN_CHECK_TTL_MS = 10 * 60 * 1e3;
var LOGIN_CHECK_CONCURRENCY = 3;
function scanOpencliAcrossNodeVersions(roots) {
  let best = null;
  for (const root of roots) {
    let dirs = [];
    try {
      dirs = readdirSync2(root).map((d) => join3(root, d));
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const candidates = existsSync(join3(dir, "dist", "src", "main.js")) ? [
        join3(dir, "dist", "src", "main.js")
      ] : (() => {
        try {
          return readdirSync2(dir).map((d) => join3(dir, d, "dist", "src", "main.js"));
        } catch {
          return [];
        }
      })();
      for (const main of candidates) {
        if (!existsSync(main)) continue;
        const ver = (dir.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1) ?? [
          "0",
          "0",
          "0"
        ]).map(Number);
        if (best === null || ver > best.ver) best = {
          ver,
          main
        };
      }
    }
  }
  return best?.main ?? null;
}
_computedKey = Service.init, _dec = Remote("status"), _dec1 = Remote("adapters"), _dec2 = Remote("refresh"), _dec3 = Remote("daemon-start"), _dec4 = Remote("settings"), _dec5 = Remote("approval-set"), _dec6 = Remote("adapter-disable"), _dec7 = Remote("login-check"), _dec8 = Remote("adapter-detail"), _dec9 = Remote("schedule-add"), _dec10 = Remote("schedule-list"), _dec11 = Remote("ingest-events"), _dec12 = Remote("audit-list"), _dec13 = Remote("logs-tail"), _dec14 = Remote("trace-list"), _dec15 = Remote("trace-get"), _dec16 = Remote("trace-shot"), _dec17 = Remote("browser-cdp"), _dec18 = Remote("schedule-run-now"), _dec19 = Remote("schedule-history"), _dec20 = Remote("report-build"), _dec21 = Remote("benchmark-run"), _dec22 = Remote("schedule-toggle"), _dec23 = Remote("knowledge-export"), _dec24 = Remote("knowledge-get"), _dec25 = Remote("schedule-remove"), _dec26 = Remote("try-run"), _dec27 = Remote("replay"), _dec28 = Remote("script-catalog"), _dec29 = Remote("script-run-builtin"), _dec30 = Remote("crawl"), _dec31 = Remote("script-validate"), _dec32 = Remote("userscript-run"), _dec33 = Remote("recipe-run"), _dec34 = Remote("automation-search"), _dec35 = Remote("automation-develop"), _dec36 = Remote("automation-run"), _dec37 = Remote("automation-mode-get"), _dec38 = Remote("automation-mode-set"), _dec39 = Remote("promote-recording"), _dec40 = Remote("install-opencli-skill"), _dec41 = Remote("rulepacks-list"), _dec42 = Remote("rulepacks-set"), _dec43 = Remote("canary-run"), _dec44 = Remote("evidence-list");
var OpencliService = class _OpencliService extends TypertRemoteService {
  static {
    ({ e: [_initProto] } = _apply_decs_2203_r(this, [
      [
        _dec,
        2,
        "status"
      ],
      [
        _dec1,
        2,
        "adapters"
      ],
      [
        _dec2,
        2,
        "refresh"
      ],
      [
        _dec3,
        2,
        "daemonStart"
      ],
      [
        _dec4,
        2,
        "settings"
      ],
      [
        _dec5,
        2,
        "approvalSet"
      ],
      [
        _dec6,
        2,
        "adapterDisable"
      ],
      [
        _dec7,
        2,
        "loginCheck"
      ],
      [
        _dec8,
        2,
        "adapterDetail"
      ],
      [
        _dec9,
        2,
        "scheduleAdd"
      ],
      [
        _dec10,
        2,
        "scheduleList"
      ],
      [
        _dec11,
        2,
        "ingestEvents"
      ],
      [
        _dec12,
        2,
        "auditList"
      ],
      [
        _dec13,
        2,
        "logsTail"
      ],
      [
        _dec14,
        2,
        "traceList"
      ],
      [
        _dec15,
        2,
        "traceGet"
      ],
      [
        _dec16,
        2,
        "traceShot"
      ],
      [
        _dec17,
        2,
        "browserCdp"
      ],
      [
        _dec18,
        2,
        "scheduleRunNow"
      ],
      [
        _dec19,
        2,
        "scheduleHistory"
      ],
      [
        _dec20,
        2,
        "reportBuild"
      ],
      [
        _dec21,
        2,
        "benchmarkRun"
      ],
      [
        _dec22,
        2,
        "scheduleToggle"
      ],
      [
        _dec23,
        2,
        "knowledgeExport"
      ],
      [
        _dec24,
        2,
        "knowledgeGet"
      ],
      [
        _dec25,
        2,
        "scheduleRemove"
      ],
      [
        _dec26,
        2,
        "tryRun"
      ],
      [
        _dec27,
        2,
        "replay"
      ],
      [
        _dec28,
        2,
        "scriptCatalog"
      ],
      [
        _dec29,
        2,
        "scriptRunBuiltin"
      ],
      [
        _dec30,
        2,
        "crawl"
      ],
      [
        _dec31,
        2,
        "scriptValidate"
      ],
      [
        _dec32,
        2,
        "userscriptRun"
      ],
      [
        _dec33,
        2,
        "recipeRun"
      ],
      [
        _dec34,
        2,
        "automationSearch"
      ],
      [
        _dec35,
        2,
        "automationDevelop"
      ],
      [
        _dec36,
        2,
        "automationRun"
      ],
      [
        _dec37,
        2,
        "automationModeGet"
      ],
      [
        _dec38,
        2,
        "automationModeSet"
      ],
      [
        _dec39,
        2,
        "promoteRecording"
      ],
      [
        _dec40,
        2,
        "installOpencliSkill"
      ],
      [
        _dec41,
        2,
        "rulePacksList"
      ],
      [
        _dec42,
        2,
        "rulePacksSet"
      ],
      [
        _dec43,
        2,
        "canaryRun"
      ],
      [
        _dec44,
        2,
        "evidenceList"
      ]
    ], []));
  }
  static inject = [
    "shell",
    "tools",
    "systemPrompt"
  ];
  bin;
  adapterCache = (_initProto(this), null);
  lastShellError = null;
  state = {
    approval: "on",
    disabled: [],
    schedules: [],
    runHistory: {},
    audit: []
  };
  /** 面板通知事件(调度失败等;内存态,最近 30 条) */
  ingestEventList = [];
  /** 当前构建 sha256(懒计算) */
  sha256Cache = null;
  // 状态路径可用 DSH_OPENCLI_STATE 覆盖(单测隔离用):否则单测会把定时任务/审计写进真实用户状态文件
  statePath = process.env.DSH_OPENCLI_STATE !== void 0 && process.env.DSH_OPENCLI_STATE.length > 0 ? process.env.DSH_OPENCLI_STATE : join3(homedir2(), ".dsh", "dsh-opencli-state.json");
  // 运行轨迹目录可用 DSH_OPENCLI_TRACE_DIR 覆盖(单测隔离用,与 statePath 同款约定)
  traceDir = process.env.DSH_OPENCLI_TRACE_DIR !== void 0 && process.env.DSH_OPENCLI_TRACE_DIR.length > 0 ? process.env.DSH_OPENCLI_TRACE_DIR : join3(homedir2(), ".dsh", "opencli-traces");
  // 步骤截图目录可用 DSH_OPENCLI_SHOTS_DIR 覆盖(单测隔离用,与 traceDir 同款约定)
  shotsDir = process.env.DSH_OPENCLI_SHOTS_DIR !== void 0 && process.env.DSH_OPENCLI_SHOTS_DIR.length > 0 ? process.env.DSH_OPENCLI_SHOTS_DIR : join3(homedir2(), ".dsh", "opencli-shots");
  // 写命令证据包目录可用 DSH_OPENCLI_EVIDENCE_DIR 覆盖(单测隔离用,与 shotsDir 同款约定)
  evidenceDir = process.env.DSH_OPENCLI_EVIDENCE_DIR !== void 0 && process.env.DSH_OPENCLI_EVIDENCE_DIR.length > 0 ? process.env.DSH_OPENCLI_EVIDENCE_DIR : join3(homedir2(), ".dsh", "opencli-evidence");
  /** 步骤自动截图开关(默认开;宿主/单测可整体关闭,不做面板开关——截图是复盘增强,不值得一个设置项)。 */
  shotCapture = true;
  /** 冒烟基准的站间间隔(串行限流礼貌;单测可调 0 提速,不影响生产行为)。 */
  benchGapMs = 800;
  /** 截图序号(进程内单调,同秒多步防碰撞;跨进程/重启撞名由 existsSync 续拨兜底)。 */
  shotSeq = 0;
  loginCache = null;
  // usagePolicy：与 anweat 对齐的限流（并发/突发/冷却），默认与 anweat 一致
  usagePolicy = {
    minDelayMs: 750,
    maxConcurrency: 2,
    burst: 3,
    cooldownMs: 3e4,
    retryLimit: 2,
    maxPagesPerRun: 20,
    maxDepth: 2
  };
  callTimestamps = [];
  concurrent = 0;
  cooldownUntil = 0;
  queue = [];
  // 限域登录（与 anweat authProfiles 对齐）：按 profile 限 allowedDomains，默认只读不回写
  authProfiles = {};
  schedules = [];
  runHistory = {};
  automationMode = "standard";
  rulePacks = [];
  automationAssets = {
    persistenceMode: "suggest",
    activationMode: "manual"
  };
  constructor(ctx) {
    super(ctx, "opencli");
    this.bin = this.resolveBin();
  }
  resolveBin() {
    if (process.env.DSH_OPENCLI_BIN !== void 0 && process.env.DSH_OPENCLI_BIN.length > 0) return process.env.DSH_OPENCLI_BIN;
    try {
      const pkg = __require.resolve("@jackwener/opencli/package.json");
      const bin = join3(dirname(pkg), "dist", "src", "main.js");
      if (existsSync(bin)) return `node ${bin}`;
    } catch {
    }
    const globalMain = join3(dirname(process.execPath), "node_modules", "@jackwener", "opencli", "dist", "src", "main.js");
    if (existsSync(globalMain)) return `node "${globalMain}"`;
    const scanned = scanOpencliAcrossNodeVersions([
      join3(homedir2(), ".vfox", "cache", "nodejs"),
      join3(homedir2(), ".vfox", "sdks", "nodejs"),
      join3(homedir2(), ".nvm")
    ]);
    if (scanned !== null) return `node "${scanned}"`;
    return "opencli";
  }
  async [_computedKey]() {
    await this.loadState();
    this.registerBrowserTools();
    this.registerChromeTools();
    this.registerAdvancedTools();
    this.registerSiteTool();
    this.registerDecisionTools();
    this.registerDoctorTool();
    this.registerBenchmarkTool();
    if (this.toolConflicts.length > 0) {
      console.warn(`[dsh-opencli] \u53E6\u4E00\u63D2\u4EF6\u6CE8\u518C\u4E86\u540C\u540D\u5DE5\u5177,\u672C\u63D2\u4EF6\u5DF2\u8BA9\u4F4D\u8FD9\u4E9B\u547D\u4EE4:${this.toolConflicts.join(", ")}`);
    }
    this.registerApprovalGate();
    this.registerEvidenceListeners();
    this.registerKnowledgeResources();
    if (process.env.VITEST === void 0) void this.so.prewarm();
    void this.injectSystemPrompt();
    if (this.schedules.some((s) => s.enabled)) this.startScheduler();
    try {
      const proto = Object.getPrototypeOf(this);
      const facade = {};
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;
        const d = Object.getOwnPropertyDescriptor(proto, key);
        if (d !== void 0 && typeof d.value === "function") facade[key] = d.value.bind(this);
      }
      Object.defineProperty(facade, "typertRemote", {
        get: () => void 0
      });
      this.ctx.provide("browser", facade);
    } catch {
    }
  }
  // ── 模型工具 ──────────────────────────────────────────────
  /** 重名让位记账(被跳过的工具名):status.conflicts / doctor ⚠ 行 / 宿主 warn 三处可见。 */
  toolConflicts = [];
  /**
  * 重名防护:dsh 0.2.1 的 dsh-tools NamedEntries 对重名注册直接抛 "tool X is already
  * registered",不接住就是整个插件加载失败(Tencent/wqty123 两个插件都栽过 browser_* 撞名)。
  * 五个 register* 方法的全部工具注册走这里:撞名 → 记入 toolConflicts 让位(本插件后加载,
  * 先到先得);其他错误仍抛——真正的 bug 不许被吞。
  */
  registerToolSafe(def) {
    try {
      this.ctx.tools.register(defineTool(def));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already registered/i.test(msg)) throw e;
      this.toolConflicts.push(def.name);
    }
  }
  /** SystemOne 决策层:key 从环境变量或 ~/.dsh/typesafe-key;provider 可换(laya 本地 ONNX 同接口)。 */
  so = new SystemOne();
  /**
  * Agent 自助安装/自检工具(AGENT_INSTALL.md 的落地闭环):CLI→daemon→BrowserBridge 扩展→浏览器档案
  * 四层诊断,每层给状态与确切下一步命令。排障先跑这个,不盲试。
  */
  registerDoctorTool() {
    this.registerToolSafe({
      name: "opencli_doctor",
      description: "dsh-opencli \u4E00\u952E\u81EA\u68C0:CLI/daemon/BrowserBridge \u6269\u5C55/\u6D4F\u89C8\u5668\u6863\u6848\u56DB\u5C42\u8BCA\u65AD,\u8F93\u51FA\u6BCF\u5C42\u72B6\u6001\u4E0E\u4E0B\u4E00\u6B65\u547D\u4EE4\u3002\u5B89\u88C5\u4E0E\u6392\u969C\u65F6\u5148\u8DD1\u8FD9\u4E2A\u3002",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const lines = [
          "opencli_doctor \u56DB\u5C42\u81EA\u68C0:"
        ];
        const next = [];
        let cliOk = false;
        let vraw = "";
        try {
          const v = await this.runOpencli([
            "--version"
          ], 15e3);
          vraw = (v.stdout.trim() || v.stderr.trim()).split("\n")[0]?.trim() ?? "";
          cliOk = v.exitCode === 0 && vraw.length > 0;
        } catch {
        }
        lines.push(`${cliOk ? "\u2713" : "\u2717"} CLI:${cliOk ? vraw : `opencli \u4E0D\u53EF\u7528(${this.bin})`}`);
        if (!cliOk) next.push("\u5B89\u88C5 CLI:npm i -g @jackwener/opencli,\u7136\u540E opencli daemon restart(\u6216\u88C5 OpenCLIApp https://opencli.info/download)");
        if (cliOk) {
          const ds = await this.daemonStatus();
          const daemonRunning = ds?.running === true;
          lines.push(`${daemonRunning ? "\u2713" : "\u2717"} daemon:${daemonRunning ? (ds?.version ?? "") + (ds?.uptime ? " \xB7 " + ds.uptime : "") : "\u672A\u8FD0\u884C/\u65E0\u54CD\u5E94"}`);
          if (!daemonRunning) {
            next.push("opencli daemon restart");
          } else {
            const extLine = (ds?.extension ?? "").trim();
            const profilesLine = (ds?.profiles ?? "").trim();
            const extConnected = /^connected/.test(extLine) || /profiles connected/.test(extLine);
            const noneSelected = /none selected/i.test(extLine);
            if (extConnected && !noneSelected) {
              lines.push(`\u2713 BrowserBridge:${extLine || "connected"}`);
            } else if (extConnected && noneSelected) {
              lines.push(`\u26A0 BrowserBridge:\u591A\u6863\u6848\u672A\u9009\u9ED8\u8BA4(${profilesLine})`);
              next.push('opencli profile list \u540E opencli profile use <\u6863\u6848\u540D>;\u82E5\u9009\u5B8C\u4ECD\u62A5"Multiple profiles",\u5347\u7EA7 CLI:npm i -g @jackwener/opencli@latest(1.8.6 \u6709\u9009\u62E9\u4E0D\u751F\u6548\u7684 bug)');
            } else {
              lines.push("\u2717 BrowserBridge:\u6269\u5C55\u672A\u8FDE\u63A5");
              next.push('\u88C5\u6269\u5C55(\u9700\u4EBA\u5728\u6D4F\u89C8\u5668\u70B9\u4E00\u6B21):https://github.com/jackwener/OpenCLI/releases \u4E0B\u8F7D opencli-extension-*.zip \u89E3\u538B \u2192 Chrome/Edge \u6269\u5C55\u9875\u5F00"\u5F00\u53D1\u8005\u6A21\u5F0F"\u2192"\u52A0\u8F7D\u89E3\u538B\u7F29\u7684\u6269\u5C55";\u88C5\u5B8C\u7B49\u6269\u5C55\u81EA\u52A8\u91CD\u8FDE');
            }
          }
        }
        const sites = this.adapterCache !== null ? normalizeAdapterList(this.adapterCache.json).length : null;
        lines.push(`\u2713 \u63D2\u4EF6:${sites !== null ? `${sites} \u7AD9\u76EE\u5F55\u5DF2\u6CE8\u5165` : "\u7AD9\u70B9\u76EE\u5F55\u540E\u53F0\u52A0\u8F7D\u4E2D"} \xB7 \u5BA1\u6279\u95E8 ${this.state.approval === "on" ? "\u5F00" : "\u5173"}`);
        if (this.toolConflicts.length > 0) {
          lines.push(`\u26A0 \u5DE5\u5177\u91CD\u540D:${this.toolConflicts.join(", ")}\u2014\u2014\u53E6\u4E00\u63D2\u4EF6\u6CE8\u518C\u4E86\u540C\u540D\u5DE5\u5177,\u672C\u63D2\u4EF6\u5DF2\u8BA9\u4F4D\u8FD9\u4E9B\u547D\u4EE4`);
        }
        if (next.length === 0) {
          lines.push("", "\u5168\u7EFF\u3002\u5192\u70DF\u5EFA\u8BAE:site v2ex hot(\u65E0\u9700\u767B\u5F55);\u767B\u5F55\u6001\u7AD9\u70B9\u5148\u5728\u6D4F\u89C8\u5668\u767B\u5F55,\u518D\u7528\u9762\u677F\u300C\u91CD\u65B0\u5DE1\u68C0\u300D\u786E\u8BA4\u3002");
        } else {
          lines.push("", "\u4E0B\u4E00\u6B65(\u6309\u987A\u5E8F):", ...next.map((s, i) => `${i + 1}. ${s}`));
        }
        return {
          text: lines.join("\n").slice(0, 3e3)
        };
      }
    });
  }
  /** 一键冒烟基准(任务 C):固定无需登录的读命令集串行实测出成功率表,报告落盘可追溯。 */
  registerBenchmarkTool() {
    this.registerToolSafe({
      name: "benchmark",
      description: "\u8DD1\u7AD9\u70B9\u5192\u70DF\u57FA\u51C6\u51FA\u6210\u529F\u7387\u8868:\u9ED8\u8BA4 5 \u4E2A\u65E0\u9700\u767B\u5F55\u7684\u8BFB\u547D\u4EE4(juejin/36kr/hackernews/v2ex/bilibili)\u4E32\u884C\u5B9E\u6D4B,\u9010\u7AD9\u7ED3\u679C/\u771F\u5B9E\u6027P/\u8017\u65F6,\u62A5\u544A\u843D ~/.dsh/opencli-benchmarks/\u3002\u88C5\u5B8C\u73AF\u5883\u6216\u5347\u7EA7\u540E\u5148\u8DD1\u8FD9\u4E2A\u786E\u8BA4\u53EF\u7528\u9762",
      parameters: {
        sites: {
          type: "array",
          items: {
            type: "string"
          },
          description: `\u53EF\u9009,"\u7AD9\u70B9 \u547D\u4EE4"\u6761\u76EE(\u5982 ["juejin hot"]);\u7F3A\u7701\u7528\u9ED8\u8BA4\u96C6:${DEFAULT_BENCH.join(" / ")}`
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const sites = Array.isArray(a.sites) ? a.sites.map(String) : void 0;
        const r = await this.benchmarkRun(sites !== void 0 ? {
          sites
        } : {});
        if (!r.ok) return {
          text: `\u57FA\u51C6\u672A\u5B8C\u6210:${r.error ?? "\u672A\u77E5"}`
        };
        return {
          text: `${renderBenchmarkTable(r.results ?? []).slice(0, 4e3)}

\u62A5\u544A\u5DF2\u751F\u6210:${r.path ?? ""}`
        };
      }
    });
    this.registerToolSafe({
      name: "canary",
      description: '\u7AD9\u70B9\u6F02\u79FB\u5DE1\u68C0:top-20 \u7AD9(\u6309\u76EE\u5F55\u547D\u4EE4\u6570)\u53EA\u8BFB\u547D\u4EE4\u9010\u7AD9\u5B9E\u6D4B,\u4E0E\u4E0A\u4E00\u8F6E canary \u5BF9\u6BD4\u51FA\u65B0\u5931\u8D25/\u6062\u590D,\u62A5\u544A\u843D ~/.dsh/opencli-canary/\u3002\u8BCA\u65AD"\u54EA\u4E9B\u7AD9\u6700\u8FD1\u6539\u7248\u574F\u4E86"\u5148\u8DD1\u8FD9\u4E2A;\u5B9A\u65F6\u4EFB\u52A1\u586B canary \u53EF\u6BCF\u665A\u81EA\u52A8\u5DE1\u68C0',
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const r = await this.canaryRun();
        if (!r.ok && r.total === 0) return {
          text: `canary \u672A\u5B8C\u6210:${r.error ?? "\u672A\u77E5"}`
        };
        const drift = r.newFailures.length > 0 ? `
\u65B0\u5931\u8D25 ${r.newFailures.length}:${r.newFailures.slice(0, 6).join("\u3001")}` : "\n\u65E0\u65B0\u5931\u8D25";
        const rec = r.recovered.length > 0 ? `
\u6062\u590D ${r.recovered.length}:${r.recovered.slice(0, 6).join("\u3001")}` : "";
        return {
          text: `canary \u5DE1\u68C0:\u901A\u8FC7 ${r.passed}/${r.total}${drift}${rec}
\u62A5\u544A:${r.path ?? ""}`
        };
      }
    });
  }
  /** 决策工具(verify 断言 / 封闭选项集选择):亚秒返回,不消耗大模型 token。 */
  registerDecisionTools() {
    this.registerToolSafe({
      name: "so_verify",
      description: "SystemOne \u4E9A\u79D2\u5224\u5B9A:\u7ED9\u5B9A\u4EFB\u52A1\u9884\u671F\u4E0E\u9875\u9762\u6587\u672C,\u8FD4\u56DE P(\u7B26\u5408\u9884\u671F)\u3002\u6BD4 LLM \u65AD\u8A00\u7701 token\u3001\u5FEB 10 \u500D\u4EE5\u4E0A\u3002\u4F4E\u7F6E\u4FE1(<0.7)\u65F6\u8BF7\u56DE\u9000\u81EA\u884C\u5224\u65AD",
      parameters: {
        expectation: {
          type: "string",
          description: "\u4EFB\u52A1\u9884\u671F(\u81EA\u7136\u8BED\u8A00,\u5982:\u9875\u9762\u663E\u793A\u7684\u662F\u77E5\u4E4E\u70ED\u699C\u5217\u8868)"
        },
        page_text: {
          type: "string",
          description: "\u9875\u9762\u6587\u672C(\u622A\u53D6\u76F8\u5173\u90E8\u5206,\u5EFA\u8BAE \u22642000 \u5B57)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.so.ask(String(a.page_text ?? ""), {
          verify: {
            type: "noul",
            instructions: String(a.expectation ?? "\u9875\u9762\u72B6\u6001\u7B26\u5408\u4EFB\u52A1\u9884\u671F")
          }
        });
        if (!r.ok) return {
          text: `SystemOne \u4E0D\u53EF\u7528:${r.error ?? "\u672A\u77E5"}\u2014\u2014\u8BF7\u7528\u5E38\u89C4\u65B9\u5F0F\u81EA\u884C\u5224\u65AD`
        };
        const v = r.answers.verify;
        const p = typeof v?.value === "number" ? v.value : null;
        if (p === null) return {
          text: "\u5224\u5B9A\u5931\u8D25:\u6A21\u578B\u672A\u8FD4\u56DE\u6709\u6548\u6982\u7387,\u8BF7\u7528\u5E38\u89C4\u65B9\u5F0F\u81EA\u884C\u5224\u65AD"
        };
        const verdict = noulYes({
          value: p,
          confidence: 1
        }) ? "\u7B26\u5408\u9884\u671F" : "\u4E0D\u7B26\u5408\u9884\u671F";
        return {
          text: `\u5224\u5B9A:${verdict}(P=${p.toFixed(2)},\u7F6E\u4FE1 ${r.latencyMs}ms \u5185\u8FD4\u56DE)\u3002\u4F4E\u4E8E 0.7 \u65F6\u5EFA\u8BAE\u4EBA\u5DE5\u590D\u6838`
        };
      }
    });
    this.registerToolSafe({
      name: "so_pick",
      description: "SystemOne \u4E9A\u79D2\u9009\u62E9:\u7ED9\u5B9A\u76EE\u6807\u4E0E\u5C01\u95ED\u9009\u9879\u96C6,\u8FD4\u56DE\u6700\u4F18\u9009\u9879 + \u6BCF\u9879\u6982\u7387\u3002\u9002\u5408\u8DEF\u7531/\u5206\u7C7B/\u5143\u7D20\u64CD\u4F5C\u9009\u70B9",
      parameters: {
        goal: {
          type: "string",
          description: "\u76EE\u6807(\u81EA\u7136\u8BED\u8A00)"
        },
        state: {
          type: "string",
          description: "\u5F53\u524D\u72B6\u6001\u4E0A\u4E0B\u6587(\u5143\u7D20\u8868/\u9875\u9762\u6458\u8981,\u5EFA\u8BAE \u22642000 \u5B57)"
        },
        options: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u5C01\u95ED\u9009\u9879\u96C6(2-30 \u4E2A,\u518D\u591A\u8BF7\u5148\u5206\u5C42)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const options = Array.isArray(a.options) ? a.options.map(String).filter((o) => o.length > 0) : [];
        if (options.length < 2 || options.length > 30) return {
          text: `\u9009\u9879\u6570\u91CF\u9700\u5728 2-30 \u4E4B\u95F4(\u5F53\u524D ${options.length});\u8FC7\u591A\u8BF7\u5148\u5206\u5C42(\u5148\u9009\u7C7B\u76EE\u518D\u9009\u5177\u4F53)`
        };
        const r = await this.so.ask(String(a.state ?? ""), {
          pick: {
            type: "choice",
            instructions: String(a.goal ?? "\u9009\u51FA\u6700\u7B26\u5408\u76EE\u6807\u7684\u9009\u9879"),
            criteria: Object.fromEntries(options.map((o) => [
              o,
              o
            ]))
          }
        });
        if (!r.ok) return {
          text: `SystemOne \u4E0D\u53EF\u7528:${r.error ?? "\u672A\u77E5"}\u2014\u2014\u8BF7\u7528\u5E38\u89C4\u65B9\u5F0F\u81EA\u884C\u9009\u62E9`
        };
        const pick = r.answers.pick;
        const choice = typeof pick?.value === "string" ? pick.value : "";
        const probs = pick?.probabilities ?? {};
        const top = Object.entries(probs).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([o, p2]) => `${o} ${(Number(p2) * 100).toFixed(0)}%`).join(" / ");
        return {
          text: `\u9009\u62E9:${choice}
\u7F6E\u4FE1 ${(Number(pick?.confidence ?? 0) * 100).toFixed(0)}%
Top3:${top}`
        };
      }
    });
  }
  registerBrowserTools() {
    const run = async (session, argv) => {
      const out = await this.runBrowserTraced(session, argv);
      return out.shot !== void 0 ? {
        text: this.renderOut(out),
        shot: out.shot
      } : {
        text: this.renderOut(out)
      };
    };
    const s = "\u6D4F\u89C8\u5668\u4F1A\u8BDD\u540D(\u9ED8\u8BA4 dsh;bind \u8FC7\u7684\u4F1A\u8BDD\u590D\u7528\u767B\u5F55\u6001)";
    this.registerToolSafe({
      name: "browser_open",
      description: "\u5728\u7528\u6237\u5DF2\u767B\u5F55\u7684\u771F\u5B9E Chrome \u4E2D\u6253\u5F00 URL(daemon+\u6269\u5C55\u6865\u63A5,\u767B\u5F55\u6001\u5929\u7136\u53EF\u7528)",
      parameters: {
        url: {
          type: "string",
          description: "\u8981\u6253\u5F00\u7684\u5B8C\u6574 URL"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "open",
        String(a.url)
      ])
    });
    this.registerToolSafe({
      name: "browser_state",
      description: "\u83B7\u53D6\u5F53\u524D\u9875\u72B6\u6001\u5FEB\u7167:URL\u3001\u6807\u9898\u3001\u5E26 [N] \u7D22\u5F15\u7684\u4EA4\u4E92\u5143\u7D20\u6E05\u5355\u2014\u2014\u540E\u7EED click/type/fill \u7684 target \u76F4\u63A5\u7528 [N] \u7D22\u5F15\u6216\u6587\u672C",
      parameters: {
        session: {
          type: "string",
          description: s
        },
        source: {
          type: "string",
          enum: [
            "dom",
            "ax"
          ],
          description: "\u5FEB\u7167\u540E\u7AEF,\u9ED8\u8BA4 dom;ax \u4E3A\u65E0\u969C\u788D\u6811"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "state",
        ...a.source !== void 0 ? [
          "--source",
          a.source
        ] : []
      ])
    });
    this.registerToolSafe({
      name: "browser_click",
      description: '\u70B9\u51FB\u5143\u7D20\u3002target \u7528 browser_state \u91CC\u7684 [N] \u7D22\u5F15(\u5982 "12")\u6216\u53EF\u89C1\u6587\u672C/CSS',
      parameters: {
        target: {
          type: "string",
          description: "[N] \u7D22\u5F15 / \u6587\u672C / CSS \u9009\u62E9\u5668"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "click",
        String(a.target)
      ])
    });
    this.registerToolSafe({
      name: "browser_type",
      description: "\u70B9\u51FB\u5143\u7D20\u5E76\u8F93\u5165\u6587\u672C(\u9002\u5408\u641C\u7D22\u6846\u7B49)",
      parameters: {
        target: {
          type: "string",
          description: "[N] \u7D22\u5F15 / \u6587\u672C / CSS"
        },
        text: {
          type: "string",
          description: "\u8981\u8F93\u5165\u7684\u5185\u5BB9"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "type",
        String(a.target),
        String(a.text)
      ])
    });
    this.registerToolSafe({
      name: "browser_fill",
      description: "\u7CBE\u786E\u8BBE\u7F6E\u8F93\u5165\u6846\u5185\u5BB9\u5E76\u6821\u9A8C(\u4E0D\u6E05\u9664\u5176\u4ED6\u5B57\u6BB5)",
      parameters: {
        target: {
          type: "string",
          description: "[N] \u7D22\u5F15 / \u6587\u672C / CSS"
        },
        text: {
          type: "string",
          description: "\u8981\u8BBE\u7F6E\u7684\u503C"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "fill",
        String(a.target),
        String(a.text)
      ])
    });
    this.registerToolSafe({
      name: "browser_extract",
      description: "\u628A\u5F53\u524D\u9875\u6B63\u6587\u63D0\u53D6\u4E3A Markdown(\u957F\u9875\u81EA\u52A8\u5206\u6BB5),\u9002\u5408\u8BFB\u6587\u7AE0/\u5E16\u5B50/\u6587\u6863",
      parameters: {
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "extract"
      ])
    });
    this.registerToolSafe({
      name: "browser_screenshot",
      description: "\u5BF9\u5F53\u524D\u9875\u622A\u56FE\u4FDD\u5B58\u5230\u672C\u5730\u8DEF\u5F84(\u4EC5\u5728\u786E\u9700\u89C6\u89C9\u4FE1\u606F\u65F6\u4F7F\u7528,\u4F18\u5148 browser_state/extract)",
      parameters: {
        path: {
          type: "string",
          description: "\u4FDD\u5B58\u8DEF\u5F84(\u7EDD\u5BF9\u8DEF\u5F84)"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "screenshot",
        ...a.path !== void 0 ? [
          a.path
        ] : []
      ])
    });
    this.registerToolSafe({
      name: "browser_scroll",
      description: "\u6EDA\u52A8\u9875\u9762(up/down/left/right)",
      parameters: {
        direction: {
          type: "string",
          enum: [
            "up",
            "down",
            "left",
            "right"
          ],
          description: "\u6EDA\u52A8\u65B9\u5411,\u9ED8\u8BA4 down"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "scroll",
        a.direction ?? "down"
      ])
    });
    this.registerToolSafe({
      name: "browser_wait",
      description: '\u7B49\u5F85\u6761\u4EF6\u6210\u7ACB:selector(\u5982 ".loaded") / text / time(\u79D2) / xhr(\u5982 "/api/search") / download(\u6587\u4EF6\u540D)',
      parameters: {
        type: {
          type: "string",
          enum: [
            "selector",
            "text",
            "time",
            "xhr",
            "download"
          ],
          description: "\u7B49\u5F85\u7C7B\u578B"
        },
        value: {
          type: "string",
          description: "\u5BF9\u5E94\u7684\u503C"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "wait",
        String(a.type),
        ...a.value !== void 0 ? [
          a.value
        ] : []
      ])
    });
    this.registerToolSafe({
      name: "browser_do",
      description: `opencli browser \u901A\u7528\u5B50\u547D\u4EE4\u900F\u4F20(\u767D\u540D\u5355:${[
        ...BROWSER_DO_ALLOW
      ].join(" ")})\u3002\u5E38\u7528:analyze(\u4FA6\u5BDF\u7AD9\u70B9\u53CD\u722C/API)\u3001init(\u751F\u6210\u9002\u914D\u5668\u811A\u624B\u67B6)\u3001verify(\u9A8C\u8BC1\u9002\u914D\u5668)\u3001tab/find/network/keys/select/hover \u7B49`,
      parameters: {
        command: {
          type: "string",
          description: `\u5B50\u547D\u4EE4,\u5141\u8BB8\u503C:${[
            ...BROWSER_DO_ALLOW
          ].join("|")}`
        },
        args: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u5B50\u547D\u4EE4\u53C2\u6570(\u6309 opencli browser \u6587\u6863\u987A\u5E8F)"
        },
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: browserDoCardRender
      },
      execute: async (a) => {
        const cmd = String(a.command);
        if (!BROWSER_DO_ALLOW.has(cmd)) return {
          text: `\u4E0D\u5141\u8BB8\u7684\u5B50\u547D\u4EE4:${cmd}(\u767D\u540D\u5355\u89C1\u5DE5\u5177\u8BF4\u660E)`
        };
        return run(a.session, [
          cmd,
          ...a.args ?? []
        ]);
      }
    });
    this.registerToolSafe({
      name: "browser_close",
      description: "\u91CA\u653E\u5F53\u524D\u6D4F\u89C8\u5668\u4F1A\u8BDD\u7684 tab \u79DF\u7EA6\uFF08\u5BF9\u5E94 opencli browser <session> close\uFF09",
      parameters: {
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "close"
      ])
    });
    this.registerToolSafe({
      name: "browser_read",
      description: "\u8BFB\u5F53\u524D\u9875 URL/\u6807\u9898/\u6B63\u6587\uFF08browser_extract \u522B\u540D\uFF0C\u9002\u5408\u516C\u5F00\u7F51\u9875\u5FEB\u901F\u8BFB\u53D6\uFF09",
      parameters: {
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => run(a.session, [
        "extract"
      ])
    });
    this.registerToolSafe({
      name: "browser_status",
      description: "\u8FD0\u884C\u65F6\u72B6\u6001\uFF1Adaemon/\u6269\u5C55/\u9002\u914D\u5668\u6570/\u9650\u6D41\u4E0E\u5BA1\u6279\u7B56\u7565\uFF08\u5148\u8C03\u5B83\u518D\u9009\u5DE5\u5177\uFF09",
      parameters: {
        session: {
          type: "string",
          description: s
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const st = await this.status();
        return {
          text: JSON.stringify(st, null, 2).slice(0, 4e3)
        };
      }
    });
    this.registerToolSafe({
      name: "browser_install",
      description: "\u73AF\u5883\u81EA\u68C0\uFF1Adaemon/\u6269\u5C55/opencli \u4E09\u4EF6\u5957\u7F3A\u8C01\u8865\u8C01\uFF08daemon \u672A\u8DD1\u7ED9 restart \u547D\u4EE4\uFF0C\u6269\u5C55\u672A\u8FDE\u7ED9\u5B89\u88C5\u6307\u5F15\uFF09",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const st = await this.status();
        if (st.ok && st.daemon?.running === true) return {
          text: "\u73AF\u5883\u5C31\u7EEA\uFF1Adaemon \u8FD0\u884C\u4E2D\uFF0C\u6269\u5C55\u5DF2\u8FDE\u63A5\uFF0C\u65E0\u9700\u5B89\u88C5\u3002"
        };
        return {
          text: `\u73AF\u5883\u7F3A\u5931\uFF1A${st.error ?? "daemon \u672A\u8FD0\u884C"}\u3002\u8BF7\u5148 npm i -g @jackwener/opencli\uFF0C\u518D opencli daemon restart\uFF0C\u5E76\u5230 https://github.com/jackwener/opencli/releases \u88C5 BrowserBridge \u6269\u5C55\u3002`
        };
      }
    });
    this.registerToolSafe({
      name: "opencli_status",
      description: "OpenCLI \u8FDE\u63A5\u68C0\u67E5\uFF1A\u5B9E\u9645\u8DD1 doctor\uFF0C\u62A5\u544A daemon/extension/profile \u8FDE\u901A\u6027\uFF08\u4E0D\u8981\u53EA\u770B\u5F00\u5173\uFF0C\u770B\u8FD9\u4E2A\uFF09",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const st = await this.status();
        return {
          text: JSON.stringify(st, null, 2).slice(0, 4e3)
        };
      }
    });
    this.registerToolSafe({
      name: "site_batch",
      description: '\u6279\u91CF\u91C7\u96C6:\u4E00\u6761 site \u5B50\u547D\u4EE4 fan-out \u5230\u591A\u4E2A\u7AD9\u70B9\u5E76\u884C\u6267\u884C,\u6C47\u603B\u5404\u7AD9\u7ED3\u679C;\u6BCF\u7AD9\u7ED3\u679C\u7ECF SystemOne noul \u771F\u5B9E\u6027\u5224\u5B9A(\u7A7A\u7ED3\u679C/\u98CE\u63A7\u9875\u4F1A\u88AB\u6807"\u7591\u4F3C\u9759\u9ED8\u5931\u8D25")\u3002\u4F8B:sites=["zhihu","weibo","bilibili"], command="hot" \u540C\u65F6\u62C9\u4E09\u7AD9\u70ED\u699C\u3002',
      parameters: {
        command: {
          type: "string",
          description: "site \u5B50\u547D\u4EE4(\u4E0D\u542B\u7AD9\u70B9\u540D),\u5982 hot/search/recent"
        },
        sites: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u7AD9\u70B9\u540D\u5217\u8868(2-6 \u4E2A)"
        },
        args: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u53EF\u9009:\u547D\u4EE4\u53C2\u6570"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: siteBatchCardRender
      },
      execute: async (a) => {
        const command = String(a.command ?? "").trim();
        const sites = Array.isArray(a.sites) ? a.sites.map(String).slice(0, 6) : [];
        if (!command) return {
          text: "command \u4E0D\u80FD\u4E3A\u7A7A\u3002"
        };
        if (sites.length < 2) return {
          text: "sites \u81F3\u5C11 2 \u4E2A\u7AD9\u70B9\u3002"
        };
        if (sites.some((x) => !/^[\w.-]+$/.test(x))) return {
          text: "\u7AD9\u70B9\u540D\u542B\u975E\u6CD5\u5B57\u7B26\u3002"
        };
        let known = null;
        const domainOf = /* @__PURE__ */ new Map();
        if (this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS) {
          known = /* @__PURE__ */ new Set();
          for (const x of normalizeAdapterList(this.adapterCache.json)) {
            const n = String(x.name).toLowerCase();
            known.add(n);
            if (x.domain !== void 0) domainOf.set(n, String(x.domain).toLowerCase());
          }
        }
        const unknownSites = known === null ? [] : sites.filter((s2) => !known.has(s2));
        const byDomain = /* @__PURE__ */ new Map();
        for (const s2 of sites) {
          const d = domainOf.get(s2);
          if (d !== void 0) {
            const arr = byDomain.get(d) ?? [];
            arr.push(s2);
            byDomain.set(d, arr);
          }
        }
        const collisions = [
          ...byDomain.entries()
        ].filter(([, ss]) => ss.length > 1);
        const chained = new Set(collisions.flatMap(([, ss]) => ss));
        const preflightNote = collisions.length > 0 ? `preflight:\u540C\u57DF\u51B2\u7A81\u5DF2\u4E32\u884C\u5316(${collisions.map(([d, ss]) => `${ss.join(" + ")} \u2192 ${d}`).join(";")}),\u907F\u514D\u767B\u5F55\u6001/\u6807\u7B7E\u9875\u4E92\u8E29

` : "";
        const args = Array.isArray(a.args) ? a.args.map(String) : [];
        const runOne = async (site) => {
          try {
            const out = await this.runOpencli([
              site,
              command,
              ...args
            ], 45e3);
            if (out.exitCode !== 0) return {
              site,
              ok: false,
              badge: "",
              text: out.stderr.slice(0, 900)
            };
            const v = await this.verifyResult(site, command, out.stdout);
            return {
              site,
              ok: true,
              badge: this.verifyBadge(v),
              text: out.stdout.slice(0, 900)
            };
          } catch (err) {
            return {
              site,
              ok: false,
              badge: "",
              text: err instanceof Error ? err.message.slice(0, 200) : "failed"
            };
          }
        };
        const settled = await Promise.all([
          ...sites.filter((s2) => !chained.has(s2)).map(runOne),
          ...collisions.map(async ([, ss]) => {
            const out = [];
            for (const s2 of ss) out.push(await runOne(s2));
            return out;
          })
        ]);
        const results = settled.flat();
        results.sort((x, y) => sites.indexOf(x.site) - sites.indexOf(y.site));
        const okN = results.filter((r) => r.ok).length;
        const silentN = results.filter((r) => r.badge.includes("\u7591\u4F3C\u9759\u9ED8\u5931\u8D25")).length;
        const head = `\u6279\u91CF\u91C7\u96C6 ${okN}/${sites.length} \u7AD9\u6210\u529F${silentN > 0 ? `,\u5176\u4E2D ${silentN} \u7AD9\u7591\u4F3C\u9759\u9ED8\u5931\u8D25(exit 0 \u4F46\u5185\u5BB9\u65E0\u6548)` : ""}:

`;
        const pre = `${unknownSites.length > 0 ? `\u76EE\u5F55\u9884\u68C0:\u4EE5\u4E0B\u7AD9\u70B9\u4E0D\u5728\u9002\u914D\u5668\u76EE\u5F55,\u8BF7\u786E\u8BA4\u62FC\u5199:${unknownSites.join(", ")}

` : ""}${preflightNote}`;
        const body = results.map((r) => `== ${r.site} ${r.ok ? "\u2713" : "\u2717"}${r.badge} ==
${r.text}`).join("\n\n");
        let reportTail = "";
        try {
          const sources = results.map((r) => ({
            site: r.site,
            command: `site ${r.site} ${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
            at: (/* @__PURE__ */ new Date()).toISOString(),
            text: r.text,
            status: !r.ok ? "fail" : r.badge.includes("\u7591\u4F3C\u9759\u9ED8\u5931\u8D25") ? "silent" : r.badge.includes("\u5185\u5BB9\u53EF\u7591") ? "suspect" : "ok",
            ...r.badge.length > 0 ? {
              note: r.badge.replace(/^\(|\)$/g, "")
            } : {}
          }));
          const md = buildReport(`\u6279\u91CF\u91C7\u96C6\u62A5\u544A \xB7 ${command}`, sources, (/* @__PURE__ */ new Date()).toISOString());
          const dir = process.env.DSH_OPENCLI_REPORTS_DIR ?? join3(homedir2(), ".dsh", "opencli-reports");
          await mkdir2(dir, {
            recursive: true
          });
          const file = join3(dir, `batch-${Date.now()}.md`);
          await writeFile2(file, md, "utf8");
          reportTail = `

\u{1F4C4} \u62A5\u544A\u5DF2\u751F\u6210:${file}`;
        } catch {
        }
        return {
          text: pre + head + body + reportTail
        };
      }
    });
    this.registerToolSafe({
      name: "site_knowledge",
      description: "\u7AD9\u70B9\u77E5\u8BC6\u5361:\u5BF9\u67D0\u7AD9\u52A8\u624B\u524D\u5148\u8BFB\u2014\u2014\u7ED3\u6784\u5316\u547D\u4EE4\u76EE\u5F55+\u5DF2\u77E5\u5751+\u5931\u8D25\u7B7E\u540D\u6062\u590D\u8868\u3002\u547D\u4E2D\u5931\u8D25\u7B7E\u540D\u6309 recovery \u81EA\u6551,\u522B\u73B0\u573A\u8BD5\u9519\u3002\u77E5\u8BC6\u5206\u53D1\u4E0A\u6E38\u5DF2\u780D(#2539),\u672C\u5361\u662F\u8865\u4F4D",
      parameters: {
        site: {
          type: "string",
          description: "\u7AD9\u70B9\u540D(\u5982 weibo / xiaohongshu)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const site = String(a.site ?? a.value ?? "").trim();
        if (site.length === 0 || !/^[\w.-]+$/.test(site)) return {
          text: "\u7AD9\u70B9\u540D\u975E\u6CD5(\u5982 weibo)"
        };
        const list = await this.adapterList();
        if (list === null) return {
          text: `\u76EE\u5F55\u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
        };
        const raw = this.adapterCache?.json;
        const k = buildKnowledge(site, Array.isArray(raw) ? raw : []);
        if (k === null) return {
          text: `\u76EE\u5F55\u91CC\u6CA1\u6709 ${site}(\u7528 opencli_catalog \u786E\u8BA4\u62FC\u5199)\u3002\u4E0D\u5728\u76EE\u5F55\u7684\u901A\u7528\u9700\u6C42\u76F4\u63A5\u7528 browser_* \u539F\u8BED\u81EA\u7531\u6D4F\u89C8`
        };
        return {
          text: renderKnowledgeMarkdown(k).slice(0, 6e3)
        };
      }
    });
    this.registerToolSafe({
      name: "opencli_catalog",
      description: "\u6309 query/site/access \u8FC7\u6EE4 170+ \u9002\u914D\u5668\u76EE\u5F55\uFF0C\u5355\u6B21\u6700\u591A 100 \u6761\uFF08\u4E0D\u786E\u5B9A\u547D\u4EE4\u5148\u67E5\u5B83\uFF0C\u522B\u731C\uFF09",
      parameters: {
        query: {
          type: "string",
          description: "\u5173\u952E\u8BCD\uFF08\u5982 search\uFF09"
        },
        site: {
          type: "string",
          description: "\u7AD9\u70B9\u540D\uFF08\u5982 reddit\uFF09"
        },
        access: {
          type: "string",
          enum: [
            "read",
            "write"
          ],
          description: "\u6743\u9650\u8FC7\u6EE4"
        },
        limit: {
          type: "string",
          description: "\u8FD4\u56DE\u6761\u6570\uFF0C\u9ED8\u8BA4 10\uFF0C\u6700\u5927 100"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const list = await this.adapterList();
        if (list === null) return {
          text: `opencli list \u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
        };
        const q = a.query !== void 0 ? String(a.query).toLowerCase() : "";
        const site = a.site !== void 0 ? String(a.site).toLowerCase() : "";
        const filtered = list.filter((x) => (q.length === 0 || x.name.toLowerCase().includes(q)) && (site.length === 0 || x.name.toLowerCase().includes(site))).slice(0, 100);
        return {
          text: JSON.stringify(filtered.slice(0, 10), null, 2).slice(0, 4e3) + `
\u2026\u5171 ${filtered.length} \u6761`
        };
      }
    });
    this.registerToolSafe({
      name: "opencli_run",
      description: "\u901A\u7528 OpenCLI argv \u7F51\u5173\uFF08\u9664 unrestricted \u5916\u8D70\u5BA1\u6279\uFF1B\u5E38\u89C4\u641C\u7D22\u4F18\u5148 site \u76F4\u8C03\uFF09",
      parameters: {
        args: {
          type: "array",
          items: {
            type: "string"
          },
          description: 'argv \u6570\u7EC4\uFF08\u5982 ["reddit","search","DeepSeek Harness"]\uFF09\uFF0C\u4E0D\u62FC shell'
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const argv = Array.isArray(a.args) ? a.args.map(String) : [];
        if (argv.length === 0) return {
          text: "args \u4E3A\u7A7A"
        };
        const out = await this.runOpencli(argv);
        return {
          text: this.renderOut(out)
        };
      }
    });
  }
  // ── chrome_* 原生管理工具族(任务 B)──────────────────────
  /**
  * opencli 2.0 `browser chrome call <method> <args>` 免页面会话桥:原生 Chrome ID 管理标签/分组/窗口,
  * 不占 tab 租约、不建 browser session,与 browser_*(页面会话原语)互补。刻意不走 runBrowserTraced——
  * 那会强加 --session 并触发步骤补拍,chrome 通道两者都不该有;轨迹仍进「运行轨迹」,
  * 故单点 runChromeCall 手写 runOpencli + recordTrace(cmd 以 chrome 前缀区分 browser 步骤)。
  */
  registerChromeTools() {
    const out = (text) => ({
      text
    });
    const tabsAllow = [
      ...CHROME_METHODS_ALLOW
    ].filter((m) => m.startsWith("tabs."));
    const groupsAllow = [
      ...CHROME_METHODS_ALLOW
    ].filter((m) => m.startsWith("tabGroups.") || m === "tabs.group" || m === "tabs.ungroup");
    this.registerToolSafe({
      name: "chrome_tabs",
      description: '\u539F\u751F Chrome \u6807\u7B7E\u7BA1\u7406(\u514D\u9875\u9762\u4F1A\u8BDD,opencli 2.0):tabs.query \u5217\u51FA\u6807\u7B7E\u62FF tabId / tabs.create \u65B0\u5EFA / tabs.remove \u5173\u95ED / tabs.update \u6FC0\u6D3B\u9009\u4E2D;get/duplicate/move/group/ungroup \u4EA6\u53EF\u3002args \u4E3A\u8BE5\u65B9\u6CD5\u4F4D\u7F6E\u53C2\u6570\u7684 JSON \u6570\u7EC4\u5B57\u7B26\u4E32,\u5982 tabs.update \u4F20 [123, {"active": true}]',
      parameters: {
        // 不用 enum:dsh-tools 会在 wrapper 层校验拦截,模型只能看到通用报错;走 execute 内
        // 白名单才能给出"改用 chrome_raw"的确切指引(browser_do 同款约定)
        method: {
          type: "string",
          description: `tabs.* \u7BA1\u7406\u65B9\u6CD5,\u5141\u8BB8\u503C:${tabsAllow.join("|")}(\u5217\u51FA=tabs.query / \u65B0\u5EFA=tabs.create / \u5173\u95ED=tabs.remove / \u9009\u4E2D\u6FC0\u6D3B=tabs.update)`
        },
        args: {
          type: "string",
          description: "\u4F4D\u7F6E\u53C2\u6570 JSON \u6570\u7EC4\u5B57\u7B26\u4E32,\u7F3A\u7701 []"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const method = String(a.method ?? "");
        if (!CHROME_METHODS_ALLOW.has(method) || !method.startsWith("tabs.")) {
          return out(`\u4E0D\u5141\u8BB8\u7684 method:${method}\u3002chrome_tabs \u53EA\u6536 tabs.* \u7BA1\u7406\u65B9\u6CD5(${tabsAllow.join(" ")});windows.* \u6216\u767D\u540D\u5355\u5916\u65B9\u6CD5\u8D70 chrome_raw(\u9AD8\u5371,\u9700\u4EBA\u5DE5\u786E\u8BA4)`);
        }
        return await this.runChromeTool(method, a.args);
      }
    });
    this.registerToolSafe({
      name: "chrome_groups",
      description: '\u539F\u751F Chrome \u6807\u7B7E\u5206\u7EC4\u7BA1\u7406(\u514D\u9875\u9762\u4F1A\u8BDD,opencli 2.0):tabs.group \u5EFA\u7EC4\u5E76\u6536\u62E2\u6807\u7B7E / tabGroups.update \u6539\u540D/\u6362\u8272/\u6298\u53E0 / tabGroups.move \u6574\u7EC4\u79FB\u52A8;tabGroups.query/get \u5148\u67E5 groupId\u3002args \u4E3A\u4F4D\u7F6E\u53C2\u6570 JSON \u6570\u7EC4\u5B57\u7B26\u4E32,\u5982 tabGroups.update \u4F20 [456, {"title": "\u7814\u7A76", "color": "blue"}]',
      parameters: {
        method: {
          type: "string",
          description: `\u5206\u7EC4\u7BA1\u7406\u65B9\u6CD5,\u5141\u8BB8\u503C:${groupsAllow.join("|")}(\u5EFA\u7EC4\u6536\u62E2=tabs.group / \u6539\u540D\u6298\u53E0=tabGroups.update / \u6574\u7EC4\u79FB\u52A8=tabGroups.move)`
        },
        args: {
          type: "string",
          description: "\u4F4D\u7F6E\u53C2\u6570 JSON \u6570\u7EC4\u5B57\u7B26\u4E32,\u7F3A\u7701 []"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const method = String(a.method ?? "");
        if (!CHROME_METHODS_ALLOW.has(method) || !(method.startsWith("tabGroups.") || method === "tabs.group" || method === "tabs.ungroup")) {
          return out(`\u4E0D\u5141\u8BB8\u7684 method:${method}\u3002chrome_groups \u53EA\u6536 tabGroups.* \u4E0E tabs.group/ungroup(${groupsAllow.join(" ")});\u5176\u4F59\u65B9\u6CD5\u8D70 chrome_raw(\u9AD8\u5371,\u9700\u4EBA\u5DE5\u786E\u8BA4)`);
        }
        return await this.runChromeTool(method, a.args);
      }
    });
    this.registerToolSafe({
      name: "chrome_raw",
      description: "chrome \u539F\u751F\u65B9\u6CD5\u9003\u751F\u53E3(\u9AD8\u5371):\u4EFB\u610F method + JSON args \u76F4\u8C03 browser chrome call\u2014\u2014\u542B windows.* \u7A97\u53E3\u7BA1\u7406\u4E0E\u767D\u540D\u5355\u4E4B\u5916\u7684\u65B9\u6CD5,\u53EF\u80FD\u5173\u95ED\u7A97\u53E3/\u91CD\u6392\u771F\u5B9E\u6D4F\u89C8\u5668\u5E03\u5C40\u3002\u6BCF\u6B21\u8C03\u7528\u90FD\u4F1A\u5F39\u5BA1\u6279\u7A97\u4EBA\u5DE5\u786E\u8BA4(\u5199\u5BA1\u6279\u95E8\u8986\u76D6)",
      parameters: {
        method: {
          type: "string",
          description: "\u539F\u751F\u65B9\u6CD5\u540D(\u547D\u540D\u7A7A\u95F4.\u65B9\u6CD5,\u5982 windows.create/windows.remove)"
        },
        args: {
          type: "string",
          description: "\u4F4D\u7F6E\u53C2\u6570 JSON \u6570\u7EC4\u5B57\u7B26\u4E32,\u7F3A\u7701 []"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const method = String(a.method ?? "").trim();
        if (!/^[\w.]+$/.test(method)) return out(`method \u975E\u6CD5:${method}(\u5E94\u4E3A chrome \u539F\u751F\u65B9\u6CD5\u540D,\u5982 windows.getAll)`);
        return await this.runChromeTool(method, a.args);
      }
    });
  }
  /** chrome_* 三工具共用执行尾段:args 归一 → 1.x 门 → runChromeCall。 */
  async runChromeTool(method, rawArgs) {
    let args = [];
    if (Array.isArray(rawArgs)) args = rawArgs;
    else if (rawArgs !== void 0 && rawArgs !== null && String(rawArgs).trim().length > 0) {
      let parsed;
      try {
        parsed = JSON.parse(String(rawArgs));
      } catch (e) {
        return {
          text: `args \u4E0D\u662F\u5408\u6CD5 JSON:${e instanceof Error ? e.message : String(e)}(\u5E94\u4E3A\u4F4D\u7F6E\u53C2\u6570 JSON \u6570\u7EC4,\u5982 [123, {"active": true}])`
        };
      }
      if (!Array.isArray(parsed)) return {
        text: 'args \u9700\u4E3A JSON \u6570\u7EC4(\u4F4D\u7F6E\u53C2\u6570),\u5982 tabs.update \u4F20 [123, {"active": true}]'
      };
      args = parsed;
    }
    const major = await this.cliMajor();
    if (major < 2) {
      return {
        text: `chrome \u539F\u751F\u7BA1\u7406\u9700 opencli 2.0+(\u5F53\u524D\u5927\u7248\u672C ${major})\u3002\u5347\u7EA7:npm i -g @jackwener/opencli@latest \u540E opencli daemon restart`
      };
    }
    return await this.runChromeCall(method, args);
  }
  /**
  * browser chrome call 单点。CLI 签名为 `call <method> [args]`且 args 是"整个位置参数列表的
  * JSON 数组字符串"(实探 2.0.0 --help),故恒传显式 '[]' 保证 argv 确定性。输出经 runOpencli
  * 自带的 2.0 信封解包;扩展 1.0.24 及以前该通道报 "Browser session is required"——
  * 补升级指引而不是让用户面对裸错(本机真机实测 2026-10-20,describe 同款报错)。
  */
  async runChromeCall(method, args) {
    const started = Date.now();
    const out = await this.runOpencli([
      "browser",
      "chrome",
      "call",
      method,
      JSON.stringify(args)
    ], 3e4);
    this.recordTrace(`chrome ${method}`, out, Date.now() - started);
    const text = this.renderOut(out);
    if (/Browser session is required/i.test(`${out.stderr}
${out.stdout}`)) {
      return {
        text: `${text}

BrowserBridge \u6269\u5C55\u7248\u672C\u8FC7\u4F4E:chrome \u901A\u9053\u9700 1.0.25+(\u5F53\u524D 1.0.24 \u4E0D\u8BC6\u522B chrome-describe/chrome-call)\u3002\u5230 https://github.com/jackwener/opencli/releases \u66F4\u65B0\u6269\u5C55\u540E\u91CD\u8BD5\u3002`
      };
    }
    return {
      text
    };
  }
  registerAdvancedTools() {
    const out = (text) => ({
      text
    });
    this.registerToolSafe({
      name: "script_catalog",
      description: "\u5217\u51FA\u5185\u7F6E\u53EA\u8BFB\u811A\u672C article/links/jsonld/forms\uFF08\u4E0D\u8DD1\u5916\u6765\u4EE3\u7801\uFF0C\u8BFB\u6587\u7AE0\u6700\u7A33\uFF09",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => out("\u5185\u7F6E\u53EA\u8BFB\u811A\u672C\uFF1Aarticle\uFF08\u6B63\u6587Markdown\uFF09/ links\uFF08\u94FE\u63A5\uFF09/ jsonld / forms\uFF0C\u7528 script_run_builtin \u8FD0\u884C")
    });
    this.registerToolSafe({
      name: "script_run_builtin",
      description: "\u8FD0\u884C\u5185\u7F6E\u53EA\u8BFB\u811A\u672C\uFF08\u72EC\u7ACB context\uFF0C\u4E0D\u6267\u884C\u5916\u6765\u4EE3\u7801\uFF09",
      parameters: {
        name: {
          type: "string",
          description: "article|links|jsonld|forms"
        },
        url: {
          type: "string",
          description: "\u76EE\u6807 URL\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u5F53\u524D\u9875\uFF09"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.scriptRunBuiltin({
          name: String(a.command ?? a.value ?? "article"),
          url: a.url !== void 0 ? String(a.url) : void 0
        });
        return out(r.result ?? r.error ?? "ok");
      }
    });
    this.registerToolSafe({
      name: "script_validate",
      description: "\u6821\u9A8C\u5916\u90E8 UserScript\uFF08\u9700 @match + @grant none\uFF0C\u226464KB\uFF09\uFF0C\u4E0D\u6267\u884C",
      parameters: {
        code: {
          type: "string",
          description: "UserScript \u6E90\u7801"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.scriptValidate({
          code: String(a.text ?? "")
        });
        return out(JSON.stringify(r).slice(0, 2e3));
      }
    });
    this.registerToolSafe({
      name: "userscript_run",
      description: "\u8FD0\u884C\u5916\u90E8 UserScript\uFF08\u5F3A\u5236\u57DF\u540D\u5339\u914D\uFF0Cstandard \u9700\u5BA1\u6279\uFF0Cunrestricted \u76F4\u884C\uFF09",
      parameters: {
        code: {
          type: "string",
          description: "\u5DF2 validate \u901A\u8FC7\u7684\u6E90\u7801"
        },
        url: {
          type: "string",
          description: "\u76EE\u6807 URL"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.userscriptRun({
          code: String(a.text ?? ""),
          url: String(a.url ?? "")
        });
        return out(r.result ?? r.error ?? "ok");
      }
    });
    this.registerToolSafe({
      name: "recipe_run",
      description: "\u8DD1 25 \u6B65\u5185 Playwright Recipe\uFF08wait/click/fill/type/press/select/check/hover/scroll/extract/assert/screenshot\uFF0C\u53EF\u5BA1\u8BA1\uFF09",
      parameters: {
        steps: {
          type: "string",
          description: "JSON \u6570\u7EC4\u5B57\u7B26\u4E32"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        try {
          const steps = JSON.parse(String(a.text ?? a.value ?? "[]"));
          const r = await this.recipeRun({
            steps
          });
          return out(r.ok ? "recipe \u6267\u884C\u6210\u529F" : r.error ?? "\u5931\u8D25");
        } catch (e) {
          return out(`steps \u89E3\u6790\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
    this.registerToolSafe({
      name: "automation_search",
      description: "\u68C0\u7D22\u5DF2\u5B58\u81EA\u52A8\u5316\u8D44\u4EA7\uFF08\u5F55\u5236/\u5B9A\u65F6\uFF09\uFF0C\u53EA\u56DE ID+\u6458\u8981\uFF0C\u4E0D\u8FDB\u5168\u6587",
      parameters: {
        query: {
          type: "string",
          description: "\u5173\u952E\u8BCD"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.automationSearch({
          query: a.text !== void 0 ? String(a.text) : void 0
        });
        return out(JSON.stringify(r.hits).slice(0, 2e3));
      }
    });
    this.registerToolSafe({
      name: "automation_run",
      description: "\u6309 ID \u8FD0\u884C\u5DF2\u5B58\u8D44\u4EA7\uFF08\u5F55\u5236/\u5B9A\u65F6\uFF09\uFF0C\u9650\u57DF+\u9650\u6D41\u4ECD\u751F\u6548",
      parameters: {
        id: {
          type: "string",
          description: "\u8D44\u4EA7 ID"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.automationRun({
          id: String(a.value ?? a.text ?? "")
        });
        return out(r.ok ? "\u6267\u884C\u6210\u529F" : r.error ?? "\u5931\u8D25");
      }
    });
    this.registerToolSafe({
      name: "browser_crawl",
      description: "\u6709\u9650\u5E7F\u5EA6\u904D\u5386\uFF08\u540C\u6E90\u9ED8\u8BA4\uFF0CmaxPages 20 / maxDepth 2 \u786C\u9650\uFF0CusagePolicy \u9650\u6D41\uFF09",
      parameters: {
        url: {
          type: "string",
          description: "\u8D77\u59CB URL"
        },
        maxPages: {
          type: "string",
          description: "\u6700\u5927\u9875\u6570\uFF0C\u9ED8\u8BA4 20"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.crawl({
          url: String(a.url ?? ""),
          maxPages: Number(a.value ?? 20)
        });
        return out(r.ok ? "crawl \u5DF2\u542F\u52A8\uFF08MVP \u5355\u9875\uFF09" : r.error ?? "\u5931\u8D25");
      }
    });
    this.registerToolSafe({
      name: "trace_replay",
      description: '\u5F55\u5C4F\u56DE\u653E:\u6700\u8FD1 30 \u6B65 browser \u547D\u4EE4\u7684 markdown \u65F6\u95F4\u7EBF(\u65F6\u95F4/\u547D\u4EE4/exit/\u8017\u65F6,\u5931\u8D25\u6B65\u9644\u8F93\u51FA\u6458\u5F55)\u3002\u590D\u76D8"\u4E0A\u6B21\u4E3A\u4EC0\u4E48\u5931\u8D25"\u5148\u8C03\u5B83,\u522B\u76F2\u76EE\u91CD\u8BD5',
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => out(await this.renderTraceTimeline(30))
    });
  }
  registerSiteTool() {
    this.registerToolSafe({
      name: "site_route",
      description: "\u4E9A\u79D2\u547D\u4EE4\u8DEF\u7531:\u7ED9\u76EE\u6807(\u81EA\u7136\u8BED\u8A00),SystemOne \u4E24\u6B65 choice(\u5148\u9009\u7AD9\u518D\u9009\u547D\u4EE4)\u76F4\u63A5\u7ED9\u51FA site \u547D\u4EE4\u884C+\u5907\u9009\u3002\u4E0D\u786E\u5B9A\u547D\u4EE4\u540D\u65F6\u7528\u5B83,\u522B\u7FFB\u76EE\u5F55\u731C",
      parameters: {
        goal: {
          type: "string",
          description: "\u76EE\u6807(\u5982:\u770B\u5FAE\u535A\u70ED\u641C/\u641C B\u7AD9\u7F57\u7FD4\u89C6\u9891/\u67E5 arxiv agent \u8BBA\u6587)"
        },
        site: {
          type: "string",
          description: "\u53EF\u9009:\u5DF2\u77E5\u7AD9\u70B9\u540D\u5219\u9501\u5B9A\u8BE5\u7AD9,\u53EA\u505A\u547D\u4EE4\u5C42\u9009\u62E9"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const goal = String(a.goal ?? a.text ?? "").trim();
        if (goal.length === 0) return {
          text: "goal \u4E0D\u80FD\u4E3A\u7A7A"
        };
        const list = await this.adapterList();
        if (list === null) return {
          text: `\u76EE\u5F55\u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
        };
        let pool = list;
        if (typeof a.site === "string" && a.site.length > 0) {
          const lock = a.site.toLowerCase();
          pool = list.filter((x) => x.name.toLowerCase() === lock);
          if (pool.length === 0) return {
            text: `\u76EE\u5F55\u91CC\u6CA1\u6709 ${a.site}(\u7528 opencli_catalog \u786E\u8BA4)`
          };
        }
        let siteName = pool[0]?.name ?? "";
        if (pool.length > 1) {
          const cand = pool.slice(0, 24);
          const r1 = await this.so.ask(cand.map((x) => `${x.name}(${x.commandCount} \u547D\u4EE4,\u793A\u4F8B:${x.commands.slice(0, 3).join("/")})`).join("; "), {
            pickSite: {
              type: "choice",
              instructions: `\u76EE\u6807:${goal}\u3002\u9009\u51FA\u6700\u5408\u9002\u7684\u7AD9\u70B9`,
              criteria: Object.fromEntries(cand.map((x) => [
                x.name,
                `${x.commandCount} \u547D\u4EE4:${x.commands.slice(0, 5).join(",")}...`
              ]))
            }
          });
          if (r1.ok && typeof r1.answers.pickSite?.value === "string" && r1.answers.pickSite.value.length > 0) siteName = r1.answers.pickSite.value;
          else return {
            text: "\u8DEF\u7531\u4E0D\u53EF\u7528(SystemOne down)\u2014\u2014\u8BF7\u76F4\u63A5\u67E5 systemPrompt \u76EE\u5F55\u9009\u547D\u4EE4"
          };
        }
        const detail = await this.adapterDetail({
          name: siteName
        }).catch(() => null);
        const cmds = detail?.ok === true ? detail.commands.map((c) => ({
          n: c.name,
          d: c.description ?? ""
        })) : pool.find((x) => x.name === siteName)?.commands.slice(0, 24).map((c) => ({
          n: c,
          d: ""
        })) ?? [];
        if (cmds.length === 0) return {
          text: `${siteName} \u65E0\u547D\u4EE4\u76EE\u5F55`
        };
        const r2 = await this.so.ask(`\u7AD9\u70B9:${siteName}\u3002\u76EE\u6807:${goal}`, {
          pickCmd: {
            type: "choice",
            instructions: "\u9009\u51FA\u6700\u5408\u9002\u7684\u547D\u4EE4",
            criteria: Object.fromEntries(cmds.slice(0, 24).map((c) => [
              c.n,
              c.d
            ]))
          }
        });
        if (!r2.ok || typeof r2.answers.pickCmd?.value !== "string") return {
          text: `\u7AD9\u70B9\u9501\u5B9A ${siteName};\u547D\u4EE4\u5C42 SystemOne \u4E0D\u53EF\u7528,\u5907\u9009:${cmds.slice(0, 6).map((c) => c.n).join(", ")}`
        };
        const top = Object.entries(r2.answers.pickCmd.probabilities ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c, p]) => `${c} ${(Number(p) * 100).toFixed(0)}%`).join(" / ");
        return {
          text: `\u547D\u4EE4:\`site ${siteName} ${r2.answers.pickCmd.value}\`${top ? `
Top3:${top}` : ""}(\u4F4E\u7F6E\u4FE1\u6216\u4E0D\u5BF9\u65F6\u67E5 site_knowledge ${siteName} \u6216 systemPrompt \u76EE\u5F55)`
        };
      }
    });
    this.registerToolSafe({
      name: "site",
      description: "\u8C03\u7528\u7AD9\u70B9\u9002\u914D\u5668(\u5728\u7528\u6237\u767B\u5F55\u6001\u4E0A\u8FD4\u56DE\u7ED3\u6784\u5316\u7ED3\u679C,\u6BD4\u9010\u9875\u70B9\u51FB\u5FEB\u4E14\u7A33)\u3002adapter/command \u89C1 systemPrompt \u91CC\u7684\u9002\u914D\u5668\u76EE\u5F55;\u793A\u4F8B:site bilibili search \u5173\u952E\u8BCD=\u7F57\u7FD4\u3002authProfile \u9650\u57DF\uFF08\u9700\u914D\u7F6E allowedDomains\uFF09",
      parameters: {
        adapter: {
          type: "string",
          description: "\u9002\u914D\u5668\u540D(\u5982 bilibili/zhihu/arxiv)"
        },
        command: {
          type: "string",
          description: "\u9002\u914D\u5668\u5B50\u547D\u4EE4(\u5982 search/hot/top)"
        },
        args: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u5B50\u547D\u4EE4\u53C2\u6570"
        },
        authProfile: {
          type: "string",
          description: "\u9650\u57DF\u767B\u5F55\u6001 profile\uFF08\u9700\u5728\u914D\u7F6E\u4E2D\u9884\u8BBE allowedDomains\uFF0C\u9ED8\u8BA4\u4E0D\u56DE\u5199 Cookie\uFF09"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: siteCardRender
      },
      execute: async (a) => {
        const adapter = String(a.adapter);
        const command = String(a.command);
        if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) {
          return {
            text: `\u975E\u6CD5 adapter/command:${adapter} ${command}`
          };
        }
        if (this.state.disabled.includes(adapter)) {
          return {
            text: `\u9002\u914D\u5668 ${adapter} \u5DF2\u88AB\u7981\u7528(\u8BBE\u7F6E\u2192\u6D4F\u89C8\u5668\u4EE3\u7406 \u53EF\u91CD\u65B0\u542F\u7528)\u3002`
          };
        }
        const domain = await this.domainOf(adapter);
        const authErr = this.checkAuthProfile(domain, a.authProfile !== void 0 ? String(a.authProfile) : void 0);
        if (authErr !== null) return {
          text: authErr
        };
        const argv = [
          adapter,
          command,
          ...a.args ?? []
        ];
        const evidenceOn = await this.lookupAccess(adapter, command) !== "read";
        const beforeShot = evidenceOn ? await this.captureEvidenceShot() : void 0;
        const out = await this.runOpencli(argv);
        if (evidenceOn) await this.recordSiteEvidence(adapter, command, argv, out, beforeShot);
        const text = this.renderOut(out);
        if (text.trim() === "[]") return {
          text: `\u9002\u914D\u5668 ${adapter} \u8FD4\u56DE\u7A7A\uFF08\u53EF\u80FD\u672A\u767B\u5F55\u6216\u65E0\u6570\u636E\uFF09\u3002\u8BF7\u5148\u5728\u771F\u5B9E Chrome \u767B\u5F55 ${adapter}\uFF0C\u6216\u8FD0\u884C \`opencli ${adapter} login\` \u540E\u7528\u9762\u677F\u201C\u5DE1\u68C0\u767B\u5F55\u6001\u201D\u786E\u8BA4\u3002`
        };
        if (out.exitCode !== 0 && /Navigation rejected/i.test(text)) return {
          text: `\u5BFC\u822A\u88AB\u62D2\uFF08${adapter}\uFF09\uFF1A\u8BF7\u786E\u8BA4 Chrome \u6269\u5C55\u5DF2\u8FDE\u63A5\u4E14\u5DF2\u767B\u5F55 ${adapter}\uFF0C\u6216\u5148 \`opencli ${adapter} login\`\u3002\u539F\u9519\uFF1A${text.slice(0, 300)}`
        };
        if (out.exitCode === 0) {
          const badge = this.verifyBadge(await this.verifyResult(adapter, command, out.stdout, {
            warmOnly: true
          }));
          if (badge !== "") return {
            text: `${badge} ${text}`
          };
        }
        return {
          text
        };
      }
    });
  }
  // ── MCP Resources 知识暴露(dsh 0.2 seam;老宿主退化为 knowledge-get RPC) ──
  /**
  * 把知识卡注册为 MCP Resources:server='opencli',URI=opencli://sites/{site}/knowledge。
  * seam 缺失(0.1.x 宿主)/注册失败一律静默降级——插件主体与 knowledge-get RPC 不受影响。
  * 数据层是纯函数 handleMcpResourceRequest(src/knowledge.ts),此处只注入目录缓存。
  */
  registerKnowledgeResources() {
    let runtime;
    try {
      runtime = this.ctx.reflect?.get?.("mcpResources", false);
    } catch {
      runtime = void 0;
    }
    if (runtime === void 0 || typeof runtime.register !== "function") return;
    try {
      const dispose = runtime.register("opencli", {
        request: async (req) => {
          const list = await this.adapterList();
          if (list === null) throw new Error(`opencli \u76EE\u5F55\u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`);
          const raw = this.adapterCache?.json;
          return handleMcpResourceRequest(req, Array.isArray(raw) ? raw : void 0);
        }
      });
      this.ctx.effect?.(() => dispose);
    } catch {
    }
  }
  // ── systemPrompt:适配器目录(缓存 + TTL,组装时取最新) ─────
  directoryText = "\u6D4F\u89C8\u5668\u4EE3\u7406(dsh-opencli):\u9002\u914D\u5668\u76EE\u5F55\u52A0\u8F7D\u4E2D\u3002";
  async injectSystemPrompt() {
    this.ctx.systemPrompt.section({
      name: "opencli-proxy",
      order: 150,
      text: () => this.directoryText
    });
    void this.updateDirectory();
  }
  async updateDirectory() {
    const list = await this.adapterList();
    if (list === null) {
      this.directoryText = "\u6D4F\u89C8\u5668\u4EE3\u7406(dsh-opencli):\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684 opencli(browser_*/site \u5DE5\u5177\u4F1A\u5931\u8D25)\u3002\u8BF7\u7528\u6237\u5728\u8BBE\u7F6E\u2192\u6D4F\u89C8\u5668\u4EE3\u7406 \u8FD0\u884C\u8BCA\u65AD,\u6216\u5B89\u88C5 OpenCLI(OpenCLIApp / npm i -g @jackwener/opencli)\u3002";
      return;
    }
    const active = list.filter((a) => !this.state.disabled.includes(a.name));
    const daemon = await this.daemonStatus();
    const state = daemon !== null && daemon.running ? `daemon \u8FD0\u884C\u4E2D(\u6269\u5C55 ${daemon.extension ?? "?"})` : "daemon \u672A\u8FD0\u884C\u2014\u2014browser_* \u9700\u8981\u5B83:\u53EF\u5728 dsh \u8BBE\u7F6E\u2192\u6D4F\u89C8\u5668\u4EE3\u7406 \u4E00\u952E\u542F\u52A8,\u6216 opencli daemon restart";
    const gate = this.state.approval === "on" ? "site \u7684 write \u547D\u4EE4\u4F1A\u5148\u8BF7\u6C42\u7528\u6237\u5BA1\u6279\u3002" : "\u5BA1\u6279\u95E8\u5DF2\u5173\u95ED(write \u547D\u4EE4\u76F4\u63A5\u6267\u884C)\u3002";
    this.directoryText = `\u6D4F\u89C8\u5668\u4EE3\u7406(dsh-opencli):\u4F60\u5728 Chrome \u91CC\u767B\u5F55\u7684\u7F51\u7AD9,dsh \u90FD\u80FD\u7528\u3002170+ \u7AD9\u70B9\u9002\u914D\u5668(\u77E5\u4E4E/B\u7AD9/\u5FAE\u535A/arxiv/github/...),\u7528 site <\u9002\u914D\u5668> <\u547D\u4EE4>\u3002

\u6309\u7528\u6237\u539F\u8BDD\u9009:
- "\u77E5\u4E4E\u70ED\u699C\u524D10" / "B\u7AD9\u641C\u70ED\u699C" / "\u5FAE\u535A\u70ED\u641C"   \u2192 site zhihu hot / site bilibili search
- "\u6253\u5F00\u8FD9\u4E2A\u7F51\u9875"     \u2192 browser_open url \u2192 browser_state(\u62FF [N] \u7D22\u5F15)
- "GitHub \u627E X" / "arxiv \u627E agent"  \u2192 site github search X / site arxiv search agent
- "\u5728\u5FAE\u535A\u53D1..."     \u2192 site weibo post...(\u5199\u547D\u4EE4\u4F1A\u5F39\u5BA1\u6279,\u7528\u6237\u70B9\u5141\u8BB8\u624D\u53D1)
- "\u5F55\u4E00\u6BB5:\u6293 arxiv \u6BCF\u5929 AI \u8BBA\u6587"   \u2192 \u5F15\u5BFC\u7528\u6237\u70B9"\u5F00\u59CB\u5F55" \u2192 \u771F\u5B9E Chrome \u64CD\u4F5C

\u8F85\u52A9\u5DE5\u5177(\u90FD\u5728\u672C\u63D2\u4EF6,\u76F4\u63A5\u8C03):
- site_knowledge <\u7AD9> \u2192 \u52A8\u624B\u524D\u8BFB\u77E5\u8BC6\u5361(\u547D\u4EE4\u76EE\u5F55+\u5DF2\u77E5\u5751+\u5931\u8D25\u7B7E\u540D\u6062\u590D\u8868),\u522B\u73B0\u573A\u8BD5\u9519
- so_verify(\u9875\u9762\u6587\u672C+\u9884\u671F) / so_pick(\u76EE\u6807+\u9009\u9879\u96C6) \u2192 \u4E9A\u79D2\u5224\u5B9A,\u4E0D\u8017\u5927\u6A21\u578B token;\u4F4E\u7F6E\u4FE1\u518D\u81EA\u5DF1\u5224\u65AD
- site_batch \u2192 \u591A\u7AD9\u540C\u547D\u4EE4\u5E76\u884C\u91C7\u96C6,\u81EA\u5E26\u540C\u57DF\u51B2\u7A81\u4E32\u884C\u5316(preflight)\u4E0E"\u7591\u4F3C\u9759\u9ED8\u5931\u8D25"\u6807\u6CE8
- \u5B9A\u65F6\u4EFB\u52A1\u5EFA\u5728\u9762\u677F"\u81EA\u52A8\u5316"\u9875,\u53EF\u52A0 watch \u5173\u952E\u8BCD(\u547D\u4E2D\u5373\u{1F514}\u901A\u77E5);\u649E\u98CE\u63A7\u5899\u81EA\u52A8 2 \u5206\u949F\u9000\u907F

\u4E0D\u8981:\u5199\u547D\u4EE4\u4E0D\u5728\u7528\u6237\u767B\u5F55\u6001\u65F6\u8DD1(\u5148 opencli <site> login);cookie/\u5BC6\u7801\u4E0D\u653E\u5DE5\u5177\u53C2\u6570\u3002${state}\u3002${gate}
${buildAdapterDirectory(active)}`;
  }
  // ── RPC(面板) ────────────────────────────────────────────
  async status() {
    const version = await this.runOpencli([
      "--version"
    ]);
    if (version.exitCode !== 0) {
      return {
        ok: false,
        bin: null,
        version: null,
        daemon: null,
        adapterSites: null,
        error: `opencli \u4E0D\u53EF\u7528(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}`,
        ...this.toolConflicts.length > 0 ? {
          conflicts: [
            ...this.toolConflicts
          ]
        } : {}
      };
    }
    const daemon = await this.daemonStatus();
    const cached = this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS ? normalizeAdapterList(this.adapterCache.json) : null;
    void this.adapterList().catch(() => {
    });
    const list = cached;
    let vraw = (version.stdout.trim() || version.stderr.trim()).split("\n")[0]?.trim() ?? "";
    return {
      ok: true,
      bin: this.bin,
      version: vraw || null,
      daemon: daemon ?? null,
      adapterSites: list?.length ?? null,
      // 重名让位名单:面板/agent 据此知道这些命令不归本插件(空省略,不占字段)
      ...this.toolConflicts.length > 0 ? {
        conflicts: [
          ...this.toolConflicts
        ]
      } : {}
    };
  }
  async adapters() {
    const list = await this.adapterList();
    if (list === null) return {
      ok: false,
      total: 0,
      adapters: [],
      error: `opencli list \u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
    };
    const marked = list.map((a) => ({
      ...a,
      disabled: this.state.disabled.includes(a.name)
    }));
    return {
      ok: true,
      total: marked.length,
      adapters: marked
    };
  }
  async refresh() {
    this.adapterCache = null;
    const result = await this.adapters();
    void this.updateDirectory();
    return result;
  }
  /** daemon 未运行时由面板一键拉起;已在运行则不动作(避免干扰在用的桥接)。 */
  async daemonStart() {
    const before = await this.daemonStatus();
    if (before?.running === true) return {
      ok: true,
      started: false,
      message: "daemon \u5DF2\u5728\u8FD0\u884C"
    };
    const r = await this.runOpencli([
      "daemon",
      "restart"
    ], 3e4);
    const after = await this.daemonStatus();
    if (r.exitCode !== 0 && after?.running !== true) {
      return {
        ok: false,
        started: false,
        message: `\u542F\u52A8\u5931\u8D25(\u9000\u51FA\u7801 ${r.exitCode}):${clip(r.stderr || r.stdout, 300)}`
      };
    }
    return {
      ok: true,
      started: true,
      message: null
    };
  }
  async settings() {
    return {
      ok: true,
      approvalOn: this.state.approval === "on",
      disabled: [
        ...this.state.disabled
      ],
      sha256: this.buildSha256(),
      audit7d: this.auditCount7d()
    };
  }
  /** 当前构建的 sha256 前 16 位(供应链自证;读取失败给 null,绝不编造)。 */
  buildSha256() {
    if (this.sha256Cache !== null) return this.sha256Cache;
    try {
      const self = fileURLToPath(import.meta.url);
      this.sha256Cache = createHash("sha256").update(readFileSync2(self)).digest("hex").slice(0, 16);
    } catch {
      this.sha256Cache = null;
    }
    return this.sha256Cache;
  }
  auditCount7d() {
    const cut = Date.now() - 7 * 864e5;
    return (Array.isArray(this.state.audit) ? this.state.audit : []).filter((a) => new Date(a.at).getTime() >= cut).length;
  }
  recordAudit(command, reason) {
    if (!Array.isArray(this.state.audit)) this.state.audit = [];
    this.state.audit.unshift({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      command,
      reason,
      mode: this.automationMode
    });
    if (this.state.audit.length > 50) this.state.audit.length = 50;
    void this.saveState();
  }
  /**
  * 执行结果真实性判定:exit 0 ≠ 拿到有效数据——上游静默失败类 issue
  * (#2497 EMPTY_RESULT/#2469 600B 壳/#2520 假成功)的插件侧防线。site_batch/try-run/定时三处共用。
  * 两层:①确定性规则(opencli 失败词汇表/错误 JSON/空输出)——真机实测 laya 对这类文本判别力不足(P≈0.9),规则是主力;
  * ②laya noul 兜底判未知形态,只做标注。返回:null=不可用(调用方走原行为);verdict=false 即拦截级失败;
  * noul 0.35-0.7 可疑(verdict=true 但 p<0.7)。真机判别数据见 docs/USER-NEEDS-RESEARCH-20260925.md。
  */
  async verifyResult(site, command, text, opts) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed === "[]") return {
      verdict: false,
      p: 0,
      why: "\u7A7A\u8F93\u51FA"
    };
    const head = trimmed.slice(0, 2e3);
    const RULES = [
      [
        /EMPTY_RESULT|NO_DATA|AUTH_REQUIRED|NOT_LOGGED_IN|RATE_LIMITED|NAVIGATION_REJECTED|COMMAND_EXEC/i,
        "opencli \u5931\u8D25\u6807\u8BB0"
      ],
      [
        /请先登录|未登录|登录已过期|请完成验证|验证码|人机验证|扫码登录/,
        "\u767B\u5F55/\u98CE\u63A7\u5899"
      ],
      [
        /login (first|required)|please (log ?in|sign ?in)|access denied|verifying your browser|just a moment|challenge|captcha/i,
        "\u767B\u5F55/\u98CE\u63A7\u5899"
      ]
    ];
    for (const [re, why] of RULES) {
      if (re.test(head)) return {
        verdict: false,
        p: 0.05,
        why
      };
    }
    try {
      const j = JSON.parse(head);
      if (j !== null && typeof j === "object" && "error" in j) return {
        verdict: false,
        p: 0.05,
        why: "\u9519\u8BEF JSON"
      };
    } catch {
    }
    if (opts?.warmOnly === true && this.so.warm === false) return null;
    if (!this.so.configured) return null;
    const r = await this.so.ask(head, {
      valid: {
        type: "noul",
        instructions: `site ${site} ${command} \u7684\u8F93\u51FA\u5305\u542B\u771F\u5B9E\u7684\u7F51\u7AD9\u6570\u636E\u5185\u5BB9`
      }
    });
    if (!r.ok) return null;
    const v = r.answers.valid;
    const p = typeof v?.value === "number" ? v.value : null;
    if (p === null) return null;
    return {
      verdict: true,
      p,
      ...p < 0.7 ? {
        why: "\u6A21\u578B\u5F31\u6807\u6CE8:\u5185\u5BB9\u53EF\u7591(\u4EC5\u63D0\u793A)"
      } : {}
    };
  }
  /** 把判定结果翻译成人读的标注(无判定返回空串)。 */
  verifyBadge(v) {
    if (v === null) return "";
    if (!v.verdict) return `(\u26A0 \u7591\u4F3C\u9759\u9ED8\u5931\u8D25:${v.why ?? `P=${v.p.toFixed(2)}`})`;
    if (v.p < 0.7) return `(\u26A0 \u5185\u5BB9\u53EF\u7591:P=${v.p.toFixed(2)},\u5EFA\u8BAE\u590D\u6838)`;
    return `(\u5B9E\u6D4B\u6709\u6548 P=${v.p.toFixed(2)})`;
  }
  async approvalSet(request) {
    if (request === void 0) request = {};
    this.state.approval = request.enabled ? "on" : "off";
    await this.saveState();
    return {
      ok: true,
      enabled: request.enabled
    };
  }
  async adapterDisable(request) {
    const set = new Set(this.state.disabled);
    if (request.disabled) set.add(request.name);
    else set.delete(request.name);
    this.state.disabled = [
      ...set
    ];
    await this.saveState();
    void this.updateDirectory();
    return {
      ok: true,
      name: request.name,
      disabled: request.disabled
    };
  }
  /** 登录态巡检:对有 whoami 命令的站点并发探测(限流+10min 缓存)。 */
  async loginCheck() {
    const empty = {
      ok: false,
      checkedAt: null,
      results: []
    };
    if (this.loginCache !== null && Date.now() - this.loginCache.at < LOGIN_CHECK_TTL_MS) {
      return this.loginCache.results;
    }
    if (this.adapterCache === null) {
      const list = await this.adapterList();
      if (list === null) return {
        ...empty,
        error: this.lastShellError ?? "opencli list \u4E0D\u53EF\u7528"
      };
    }
    const sites = sitesWithWhoami(this.adapterCache?.json);
    if (sites.length === 0) return {
      ...empty,
      error: "\u6CA1\u6709\u5E26 whoami \u547D\u4EE4\u7684\u9002\u914D\u5668"
    };
    const results = await this.runPool(sites, LOGIN_CHECK_CONCURRENCY, async (site) => {
      try {
        const r = await this.runOpencli([
          site,
          "whoami"
        ], 45e3, 65536);
        const text = `${r.stdout}
${r.stderr}`.trim();
        const notLoggedIn = r.exitCode !== 0 || /^ok:\s*false/m.test(text) || /AUTH_REQUIRED|^logged_in:\s*false/m.test(text);
        const meaningful = text.split("\n").find((l) => /message:|screen_name|^user/.test(l)) ?? text.split("\n").find((l) => l.trim().length > 0) ?? "";
        return {
          site,
          ok: !notLoggedIn,
          timedOut: false,
          detail: clip(meaningful.trim(), 120) || null
        };
      } catch {
        return {
          site,
          ok: false,
          timedOut: true,
          detail: null
        };
      }
    });
    const value = {
      ok: true,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
      results
    };
    this.loginCache = {
      at: Date.now(),
      results: value
    };
    return value;
  }
  /** 单个适配器的完整命令详情(从缓存的原始 list JSON 过滤,面板展开时按需拉取)。 */
  async adapterDetail(request) {
    const empty = {
      ok: false,
      name: request.name,
      domain: null,
      commands: []
    };
    if (this.adapterCache === null) {
      const list = await this.adapterList();
      if (list === null) return {
        ...empty,
        error: this.lastShellError ?? "opencli list \u4E0D\u53EF\u7528"
      };
    }
    const raw = this.adapterCache?.json;
    if (!Array.isArray(raw)) return {
      ...empty,
      error: "\u7F13\u5B58\u65E0\u539F\u59CB\u6570\u636E"
    };
    const commands = [];
    let domain = null;
    for (const e of raw) {
      if (e === null || typeof e !== "object" || e.site !== request.name) continue;
      if (domain === null && typeof e.domain === "string" && e.domain !== "null") domain = e.domain;
      const args = Array.isArray(e.args) ? e.args.length : 0;
      commands.push({
        name: typeof e.name === "string" ? e.name : String(e.command ?? ""),
        description: typeof e.description === "string" ? e.description : "",
        access: typeof e.access === "string" ? e.access : "read",
        example: typeof e.example === "string" ? e.example : void 0,
        argCount: args
      });
    }
    if (commands.length === 0) return {
      ...empty,
      error: `\u672A\u627E\u5230\u9002\u914D\u5668:${request.name}`
    };
    commands.sort((a, b) => a.name.localeCompare(b.name));
    return {
      ok: true,
      name: request.name,
      domain,
      commands
    };
  }
  async scheduleAdd(request) {
    if (request === void 0) request = {};
    if (typeof request.site !== "string" || request.site.trim().length === 0) return {
      ok: false,
      error: "site \u4E0D\u80FD\u4E3A\u7A7A"
    };
    if (typeof request.cron !== "string" || request.cron.trim().length === 0) return {
      ok: false,
      error: "cron \u4E0D\u80FD\u4E3A\u7A7A"
    };
    const site = request.site.trim();
    const cron = request.cron.trim();
    const toks = cron.trim().split(/\s+/);
    if (toks.length !== 5 || !toks.every((t) => /^(\*|\d+|\*\/\d+|\d+(,\d+)*)$/.test(t))) return {
      ok: false,
      error: "cron \u975E\u6CD5:\u9700 5 \u6BB5(\u5206 \u65F6 \u65E5 \u6708 \u5468),\u652F\u6301 * \u6570\u5B57 */\u6B65\u957F \u9017\u53F7\u5217\u8868"
    };
    const CRON_RANGES = [
      [
        0,
        59
      ],
      [
        0,
        23
      ],
      [
        1,
        31
      ],
      [
        1,
        12
      ],
      [
        0,
        6
      ]
    ];
    for (let i = 0; i < 5; i++) {
      const t = toks[i];
      if (t === "*" || t.startsWith("*/")) continue;
      for (const p of t.split(",")) {
        const n = Number(p);
        if (n < CRON_RANGES[i][0] || n > CRON_RANGES[i][1]) return {
          ok: false,
          error: `cron \u5B57\u6BB5\u8D8A\u754C:\u7B2C${i + 1}\u6BB5 ${t} \u4E0D\u5728 ${CRON_RANGES[i][0]}-${CRON_RANGES[i][1]}`
        };
      }
    }
    const watch = typeof request.watch === "string" && request.watch.trim().length > 0 ? request.watch.trim().slice(0, 120) : void 0;
    const dup = this.schedules.find((s) => s.site === site && s.cron === cron);
    if (dup !== void 0) {
      if (watch !== void 0 && dup.watch !== watch) {
        dup.watch = watch;
        await this.saveState();
      }
      return {
        ok: true,
        id: dup.id
      };
    }
    const id = String(Date.now());
    const entry = {
      id,
      site,
      cron,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      enabled: true
    };
    if (typeof request.retry === "number" && Number.isFinite(request.retry)) entry.retry = Math.max(1, Math.min(5, Math.round(request.retry)));
    if (typeof request.notify === "boolean") entry.notify = request.notify;
    if (watch !== void 0) entry.watch = watch;
    this.schedules.push(entry);
    await this.saveState();
    this.startScheduler();
    return {
      ok: true,
      id
    };
  }
  async scheduleList() {
    return {
      ok: true,
      schedules: this.schedules.map((s) => ({
        ...s,
        history: (this.runHistory[s.id] ?? []).slice(0, 3)
      }))
    };
  }
  async ingestEvents() {
    return {
      ok: true,
      events: this.ingestEventList.slice(0, 30)
    };
  }
  async auditList() {
    return {
      ok: true,
      count7d: this.auditCount7d(),
      items: this.state.audit.slice(0, 20).map((a) => ({
        at: a.at,
        command: a.command,
        reason: a.reason,
        mode: a.mode
      }))
    };
  }
  async logsTail() {
    const candidates = [
      join3(homedir2(), ".opencli", "daemon.log"),
      join3(homedir2(), ".opencli", "logs", "daemon.log")
    ];
    for (const c of candidates) {
      try {
        const text = await readFile(c, "utf8");
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        return {
          ok: true,
          source: c,
          lines: lines.slice(-80)
        };
      } catch {
      }
    }
    const diag = [];
    if (this.lastShellError !== null && this.lastShellError !== "") diag.push(`lastShellError: ${this.lastShellError}`);
    diag.push(`bin: ${this.bin}`);
    diag.push(`mode: ${this.automationMode} \xB7 approval: ${this.state.approval} \xB7 schedules: ${this.schedules.length}`);
    return {
      ok: true,
      source: null,
      lines: diag,
      hint: 'opencli \u672A\u66B4\u9732\u65E5\u5FD7\u6587\u4EF6;\u4EE5\u4E0A\u4E3A\u6700\u8FD1\u8BCA\u65AD\u5FEB\u7167,\u53EF\u5728 dsh \u5BF9\u8BDD\u8BF4"opencli \u8BCA\u65AD"\u83B7\u53D6\u5B9E\u65F6\u65E5\u5FD7'
    };
  }
  /** 最近 browser 命令轨迹(倒序=最新在前,默认 50):跨当日与昨日等历史文件聚合,面板「运行轨迹」/trace_replay 共用。 */
  async traceList(request) {
    const limit = Math.max(1, Math.min(500, Math.floor(Number(request?.limit ?? 50)) || 50));
    let traces = [];
    try {
      const files = readdirSync2(this.traceDir).map((f) => /^trace-(\d{8})\.jsonl(\.1)?$/.exec(f)).filter((m) => m !== null).sort((a, b) => b[1].localeCompare(a[1]) || (a[2] !== void 0 ? 1 : 0) - (b[2] !== void 0 ? 1 : 0));
      for (const m of files) {
        traces = this.readTraceFile(join3(this.traceDir, m[0])).concat(traces);
        if (traces.length >= limit) break;
      }
    } catch {
    }
    return {
      ok: true,
      traces: traces.slice(-limit).reverse()
    };
  }
  /** 某日全量轨迹(date=yyyymmdd;当日轮转档 .1 在主档之前,保持时间序)。 */
  async traceGet(request) {
    const date = String(request?.date ?? "").trim();
    if (!/^\d{8}$/.test(date)) return {
      ok: false,
      traces: [],
      error: `date \u9700\u4E3A yyyymmdd(\u6536\u5230:${date.slice(0, 20)})`
    };
    const traces = [
      ...this.readTraceFile(this.traceFileOf(date, true)),
      ...this.readTraceFile(this.traceFileOf(date, false))
    ];
    if (traces.length === 0) return {
      ok: false,
      traces: [],
      error: `\u8BE5\u65E5(${date})\u65E0\u8F68\u8FF9`
    };
    return {
      ok: true,
      traces
    };
  }
  /**
  * 轨迹步骤截图直取(面板时间线缩略图):{path} 经 resolve 归一后必须位于 shotsDir 之下,
  * 杜绝 ../ 回溯与绝对路径穿越(traceGet 对日期键做严格白名单是同一思路);
  * 文件不存在/超大/读失败一律 ok:false,绝不抛错拖垮面板。
  */
  async traceShot(request) {
    const raw = String(request?.path ?? "");
    if (raw.trim().length === 0) return {
      ok: false,
      error: "path \u4E3A\u7A7A"
    };
    const norm = (s) => process.platform === "win32" ? s.toLowerCase() : s;
    const root = resolve(this.shotsDir);
    const p = resolve(raw);
    if (norm(p) !== norm(root) && !norm(p).startsWith(norm(root) + sep)) {
      return {
        ok: false,
        error: `path \u5FC5\u987B\u4F4D\u4E8E\u622A\u56FE\u76EE\u5F55(${root})\u4E4B\u4E0B`
      };
    }
    try {
      const st = statSync(p);
      if (!st.isFile()) return {
        ok: false,
        error: "\u4E0D\u662F\u5E38\u89C4\u6587\u4EF6"
      };
      if (st.size > 8 * 1024 * 1024) return {
        ok: false,
        error: `\u622A\u56FE\u8FC7\u5927(${st.size} \u5B57\u8282,\u4E0A\u9650 8MB)`
      };
      const buf = await readFile(p);
      return {
        ok: true,
        data: buf.toString("base64"),
        mime: "image/png"
      };
    } catch {
      return {
        ok: false,
        error: "\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB"
      };
    }
  }
  /** opencli launcher 启动 Chrome 时的 CDP 候选端口(launcher.js 同源)。 */
  static CDP_PORTS = [
    9222,
    9234,
    9236,
    9238
  ];
  cdpCache = null;
  /** 探测 daemon Chrome 的 CDP 端点:并发 probe /json/version,响应含 "Browser" 即命中。 */
  async probeCdp() {
    if (this.cdpCache !== null && Date.now() - this.cdpCache.at < 15e3) {
      return {
        found: this.cdpCache.found,
        port: this.cdpCache.port,
        browser: this.cdpCache.browser
      };
    }
    const envPort = Number(process.env.OPENCLI_CDP_PORT ?? 0);
    const ports = (envPort > 0 ? [
      envPort,
      ..._OpencliService.CDP_PORTS
    ] : _OpencliService.CDP_PORTS).slice(0, 6);
    const probeOne = async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(1200)
        });
        if (!res.ok) return null;
        const body = (await res.text()).trim();
        if (body.includes("Browser")) return {
          port,
          browser: body.slice(0, 200)
        };
        return null;
      } catch {
        return null;
      }
    };
    const hit = (await Promise.all(ports.map(probeOne))).find((x) => x !== null) ?? null;
    this.cdpCache = {
      at: Date.now(),
      found: hit !== null,
      port: hit?.port ?? null,
      browser: hit?.browser ?? null
    };
    return {
      found: hit !== null,
      port: hit?.port ?? null,
      browser: hit?.browser ?? null
    };
  }
  async browserCdp() {
    const c = await this.probeCdp();
    if (!c.found) {
      return {
        ok: true,
        found: false,
        endpoint: null,
        port: null,
        hint: "\u672A\u63A2\u6D4B\u5230 CDP\u2014\u2014\u5148\u542F\u52A8\u4E00\u6B21\u6D4F\u89C8\u5668\u4F1A\u8BDD(daemon \u9996\u6761 browser \u547D\u4EE4\u4F1A\u5E26\u8C03\u8BD5\u7AEF\u53E3\u62C9\u8D77 Chrome)"
      };
    }
    return {
      ok: true,
      found: true,
      endpoint: `http://127.0.0.1:${c.port}`,
      port: c.port,
      browser: c.browser
    };
  }
  async scheduleRunNow(p) {
    const sch = this.schedules.find((s) => s.id === String(p.id ?? ""));
    if (sch === void 0) return {
      ok: false,
      error: "\u672A\u627E\u5230"
    };
    void this.runSiteCommand(sch.site, sch.id);
    return {
      ok: true
    };
  }
  async scheduleHistory(p) {
    const id = String((p ?? {
      id: ""
    }).id ?? "");
    let snapshots;
    try {
      const dir = join3(homedir2(), ".dsh", "opencli-snapshots", id);
      snapshots = readdirSync2(dir).slice(-50).map((f) => {
        const stem = f.slice(0, f.length - 5);
        const at = stem.length >= 19 ? `${stem.slice(0, 10)}T${stem.slice(11, 13)}:${stem.slice(14, 16)}:${stem.slice(17, 19)}` : stem;
        let bytes = 0;
        try {
          bytes = JSON.parse(readFileSync2(join3(dir, f), "utf8")).bytes ?? 0;
        } catch {
        }
        return {
          at,
          bytes,
          file: f
        };
      });
    } catch {
    }
    return {
      ok: true,
      history: this.runHistory[id] ?? [],
      ...snapshots !== void 0 ? {
        snapshots
      } : {}
    };
  }
  /** 报告导出:定时任务的近期快照 → 带出处 markdown(每节=一次运行,出处=命令+时间+快照路径)。 */
  async reportBuild(request) {
    const id = String(request?.id ?? "");
    if (id.length === 0) return {
      ok: false,
      error: "id \u4E3A\u7A7A"
    };
    const sch = this.schedules.find((s) => s.id === id);
    const dir = join3(homedir2(), ".dsh", "opencli-snapshots", id);
    let files = [];
    try {
      files = readdirSync2(dir).slice(-5);
    } catch {
      return {
        ok: false,
        error: "\u8BE5\u4EFB\u52A1\u6682\u65E0\u5FEB\u7167\u2014\u2014\u5148\u8FD0\u884C\u4E00\u6B21\u91C7\u96C6"
      };
    }
    if (files.length === 0) return {
      ok: false,
      error: "\u8BE5\u4EFB\u52A1\u6682\u65E0\u5FEB\u7167"
    };
    const sources = [];
    for (const f of files) {
      try {
        const j = JSON.parse(readFileSync2(join3(dir, f), "utf8"));
        const stem = f.slice(0, f.length - 5);
        const at = j.at ?? stem;
        sources.push({
          site: String(j.site ?? sch?.site ?? id),
          command: String(j.site ?? sch?.site ?? ""),
          at,
          text: String(j.stdout ?? ""),
          status: "ok",
          note: "\u5FEB\u7167\u539F\u6587",
          source: join3(dir, f)
        });
      } catch {
      }
    }
    if (sources.length === 0) return {
      ok: false,
      error: "\u5FEB\u7167\u5168\u90E8\u635F\u574F"
    };
    const md = buildReport(`\u5B9A\u65F6\u91C7\u96C6\u62A5\u544A \xB7 ${sch?.site ?? id}`, sources, (/* @__PURE__ */ new Date()).toISOString());
    const rdir = process.env.DSH_OPENCLI_REPORTS_DIR ?? join3(homedir2(), ".dsh", "opencli-reports");
    await mkdir2(rdir, {
      recursive: true
    });
    const path = join3(rdir, `sched-${id}-${Date.now()}.md`);
    await writeFile2(path, md, "utf8");
    return {
      ok: true,
      path
    };
  }
  /**
  * 一键冒烟基准(任务 C):逐站串行 runOpencli(60s 超时)+ verifyResult 取 P,
  * 汇总写 ~/.dsh/opencli-benchmarks/bench-<时间戳>.md(目录自建,保留 20 份轮转)。
  * 串行 + 站间 800ms:基准数字要可比,并发会互相抢带宽、连发会撞限流,耗时与成败都失真。
  */
  async benchmarkRun(request) {
    const raw = request?.sites;
    const lines = Array.isArray(raw) && raw.length > 0 ? raw.map((s) => String(s).trim()) : [
      ...DEFAULT_BENCH
    ];
    if (lines.length === 0) return {
      ok: false,
      error: "sites \u4E3A\u7A7A"
    };
    if (lines.length > 10) return {
      ok: false,
      error: `\u5355\u6B21\u6700\u591A 10 \u7AD9(\u6536\u5230 ${lines.length})\u2014\u2014\u62C9\u957F\u6574\u8F6E\u53EA\u4F1A\u8BA9\u5148\u8DD1\u7684\u7AD9\u548C\u540E\u8DD1\u7684\u7AD9\u7F51\u7EDC\u6761\u4EF6\u66F4\u4E0D\u53EF\u6BD4`
    };
    for (const line of lines) {
      const toks = line.split(/\s+/);
      const [site, command] = toks;
      if (toks.length !== 2 || site === void 0 || site.length === 0 || command === void 0 || !/^[\w@.-]+$/.test(site) || !/^\w[\w-]*$/.test(command)) {
        return {
          ok: false,
          error: `\u7AD9\u70B9\u547D\u4EE4\u683C\u5F0F\u975E\u6CD5:"${line.slice(0, 40)}"(\u5E94\u4E3A "\u7AD9\u70B9 \u547D\u4EE4" \u4E24\u6BB5,\u5982 juejin hot)`
        };
      }
    }
    const offenders = [];
    for (const line of lines) {
      const [s2, c2] = line.split(/\s+/);
      const acc = await this.lookupAccess(s2, c2);
      if (acc !== "read") offenders.push(`${line}(${acc === "write" ? "\u5199\u547D\u4EE4" : "\u672A\u77E5\u6743\u9650"})`);
    }
    if (offenders.length > 0) {
      return {
        ok: false,
        error: `\u57FA\u51C6\u53EA\u63A5\u53D7\u53EA\u8BFB\u547D\u4EE4,\u4EE5\u4E0B\u884C\u88AB\u62D2:${offenders.join("\u3001")}\u3002\u5199\u547D\u4EE4\u8BF7\u8D70 site \u5DE5\u5177(\u5E26\u5BA1\u6279\u95E8\u4E0E\u8BC1\u636E\u5305)\u3002`
      };
    }
    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const [site, command] = lines[i].split(/\s+/);
      const started = Date.now();
      try {
        const out = await this.runOpencli([
          site,
          command
        ], 6e4);
        if (out.exitCode !== 0) {
          results.push({
            site,
            command: lines[i],
            ok: false,
            p: null,
            ms: Date.now() - started,
            error: clip(`${out.stderr}
${out.stdout}`.trim() || `\u9000\u51FA\u7801 ${out.exitCode}`, 160)
          });
        } else {
          const v = await this.verifyResult(site, command, out.stdout);
          const silent = v !== null && !v.verdict;
          results.push({
            site,
            command: lines[i],
            ok: !silent,
            p: v === null ? null : v.p,
            ms: Date.now() - started,
            ...silent ? {
              error: clip(`\u9759\u9ED8\u5931\u8D25:${v.why ?? ""}`, 160)
            } : {}
          });
        }
      } catch (e) {
        results.push({
          site,
          command: lines[i],
          ok: false,
          p: null,
          ms: Date.now() - started,
          error: clip(e instanceof Error ? e.message : String(e), 160)
        });
      }
      if (i < lines.length - 1 && this.benchGapMs > 0) await new Promise((res) => setTimeout(res, this.benchGapMs));
    }
    const md = buildBenchmarkReport(results, (/* @__PURE__ */ new Date()).toISOString());
    const dir = process.env.DSH_OPENCLI_BENCHMARKS_DIR ?? join3(homedir2(), ".dsh", "opencli-benchmarks");
    try {
      await mkdir2(dir, {
        recursive: true
      });
      const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const file = join3(dir, `bench-${stamp}.md`);
      await writeFile2(file, md, "utf8");
      const olds = readdirSync2(dir).filter((f) => /^bench-.+\.md$/.test(f)).sort();
      if (olds.length > BENCH_KEEP) for (const f of olds.slice(0, olds.length - BENCH_KEEP)) {
        try {
          unlinkSync2(join3(dir, f));
        } catch {
        }
      }
      return {
        ok: true,
        path: file,
        results
      };
    } catch (e) {
      return {
        ok: false,
        results,
        error: `\u62A5\u544A\u5199\u51FA\u5931\u8D25:${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
  async scheduleToggle(request) {
    if (request === void 0) request = {};
    const hit = this.schedules.find((s) => s.id === String(request.id ?? ""));
    if (hit === void 0) return {
      ok: false,
      error: "\u672A\u627E\u5230"
    };
    hit.enabled = request.enabled !== false;
    await this.saveState();
    if (hit.enabled) this.startScheduler();
    return {
      ok: true
    };
  }
  /** 知识包导出:全部/指定站的知识卡写 ~\.dsh\opencli-knowledge\,可分享/进版本库。
  * 上游 #2539 砍掉 sitemap 分发后的第三方补位;在线路径见 registerKnowledgeResources(MCP Resources)与 knowledge-get RPC。 */
  async knowledgeExport(request) {
    const list = await this.adapterList();
    if (list === null) return {
      ok: false,
      error: `\u76EE\u5F55\u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
    };
    const raw = this.adapterCache?.json;
    const entries = Array.isArray(raw) ? raw : [];
    if (entries.length === 0) return {
      ok: false,
      error: "\u76EE\u5F55\u7F13\u5B58\u4E3A\u7A7A"
    };
    const reqSites = request?.sites;
    if (request !== void 0 && Array.isArray(request.sites) && request.sites.length === 0) return {
      ok: false,
      error: "sites \u4E3A\u7A7A\u6570\u7EC4\u2014\u2014\u7A7A\u9009\u62E9\u4E0D\u652F\u6301,\u7701\u7565 sites \u624D\u5168\u91CF\u5BFC\u51FA"
    };
    const requested = Array.isArray(reqSites) && reqSites.length > 0 ? reqSites.map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 0) : [
      ...new Set(entries.map((e) => (e.site ?? e.command?.split("/")[0] ?? "").toLowerCase()).filter((s) => s.length > 0))
    ];
    const dir = join3(homedir2(), ".dsh", "opencli-knowledge");
    const paths = [];
    const at = (/* @__PURE__ */ new Date()).toISOString();
    for (const site of requested.slice(0, 200)) {
      const k = buildKnowledge(site, entries, at);
      if (k === null) continue;
      const file = join3(dir, `${site}.md`);
      try {
        await mkdir2(dir, {
          recursive: true
        });
        await writeFile2(file, renderKnowledgeMarkdown(k), "utf8");
        paths.push(file);
      } catch {
      }
    }
    if (paths.length === 0) return {
      ok: false,
      error: "\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u7AD9\u70B9(\u76EE\u5F55\u4E3A\u7A7A\u6216\u7AD9\u70B9\u540D\u4E0D\u5339\u914D)"
    };
    return {
      ok: true,
      paths
    };
  }
  /**
  * 知识卡直取 RPC(面板/外部可调,不经模型会话):sites 缺省返回健康度异常(degraded/notice)
  * 且在目录内的站。MCP resources seam 不可用的 0.1.x 宿主上的等价路径;机制与迁移路径见 docs/MCP-RESOURCES.md。
  */
  async knowledgeGet(request) {
    const list = await this.adapterList();
    if (list === null) return {
      ok: false,
      error: `\u76EE\u5F55\u4E0D\u53EF\u7528 | ${this.lastShellError ?? "\u672A\u77E5"}`
    };
    const raw = this.adapterCache?.json;
    const entries = Array.isArray(raw) ? raw : [];
    if (entries.length === 0) return {
      ok: false,
      error: "\u76EE\u5F55\u7F13\u5B58\u4E3A\u7A7A"
    };
    const reqSites = request?.sites;
    const requested = Array.isArray(reqSites) && reqSites.length > 0 ? [
      ...new Set(reqSites.map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 0))
    ] : [
      ...new Set(Object.entries(SITE_HEALTH).filter(([, h]) => h.status === "degraded" || h.status === "notice").map(([s]) => s).filter((s) => entries.some((e) => (e.site ?? e.command?.split("/")[0] ?? "").toLowerCase() === s)))
    ];
    const cards = [];
    for (const site of requested.slice(0, 30)) {
      const k = buildKnowledge(site, entries);
      if (k === null) continue;
      cards.push({
        site,
        uri: knowledgeResourceUri(site),
        markdown: renderKnowledgeMarkdown(k)
      });
    }
    if (cards.length === 0) return {
      ok: false,
      error: "\u6CA1\u6709\u53EF\u8FD4\u56DE\u7684\u77E5\u8BC6\u5361(\u76EE\u5F55\u4E3A\u7A7A\u6216\u7AD9\u70B9\u540D\u4E0D\u5339\u914D)"
    };
    return {
      ok: true,
      cards
    };
  }
  async scheduleRemove(request) {
    if (request === void 0) request = {};
    const i = this.schedules.findIndex((s) => s.id === String(request.id ?? ""));
    if (i < 0) return {
      ok: false,
      error: "\u672A\u627E\u5230"
    };
    this.schedules.splice(i, 1);
    delete this.runHistory[String(request.id ?? "")];
    await this.saveState();
    return {
      ok: true
    };
  }
  async tryRun(request) {
    if (request === void 0) request = {};
    const line = String(request.line ?? "").trim();
    if (!line) return {
      ok: false,
      error: "\u547D\u4EE4\u4E3A\u7A7A"
    };
    const [head, ...rest] = line.split(/\s+/);
    if (head !== "site" || rest.length < 2) return {
      ok: false,
      error: "\u53EA\u652F\u6301 site <\u9002\u914D\u5668> <\u547D\u4EE4> [\u53C2\u6570...]\uFF0C\u5982\uFF1Asite arxiv recent cs.AI"
    };
    const [adapter, command, ...args] = rest;
    if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) return {
      ok: false,
      error: `\u975E\u6CD5 adapter/command:${adapter} ${command}`
    };
    if (this.state.disabled.includes(adapter)) return {
      ok: false,
      error: `\u9002\u914D\u5668 ${adapter} \u5DF2\u88AB\u7981\u7528`
    };
    const out = await this.runOpencli([
      adapter,
      command,
      ...args
    ]);
    const text = this.renderOut(out);
    if (out.exitCode !== 0) {
      const raw = out.stdout + out.stderr;
      const kind = /BROWSER_CONNECT|extension not connected/i.test(raw) ? "\u6269\u5C55\u672A\u8FDE\u63A5\u2014\u2014\u8BF7\u6253\u5F00 Chrome \u5E76\u542F\u7528 OpenCLI \u6269\u5C55(\u88C5\u6CD5\u89C1 https://github.com/jackwener/opencli/releases),\u518D\u5728\u9762\u677F\u300C\u603B\u89C8\u300D\u5DE1\u68C0\u767B\u5F55\u6001" : /AUTH_REQUIRED|请先登录|NOT_LOGGED_IN/i.test(raw) ? "\u767B\u5F55\u6001\u7F3A\u5931\u2014\u2014\u5148\u5728\u771F\u5B9E Chrome \u767B\u5F55\u8BE5\u7AD9\u6216\u8FD0\u884C opencli <site> login" : /验证码|captcha|Verifying your browser/i.test(raw) ? "\u98CE\u63A7\u5899\u2014\u2014\u505C\u6B62\u81EA\u52A8\u5316,\u51B7\u5374\u540E\u4EBA\u5DE5\u8FC7\u76FE,\u5199\u64CD\u4F5C\u52A1\u5FC5\u4F4E\u9891" : null;
      return {
        ok: false,
        error: kind !== null ? "\u3010" + kind + "\u3011\u539F\u59CB\u8F93\u51FA:" + text.slice(0, 300) : text
      };
    }
    const v = await this.verifyResult(adapter, command, out.stdout);
    if (v !== null && !v.verdict) {
      return {
        ok: false,
        error: `\u9002\u914D\u5668 ${adapter} \u8FD4\u56DE\u7684\u5185\u5BB9\u88AB\u5224\u5B9A\u65E0\u6548(P=${v.p.toFixed(2)},${v.why ?? "\u5185\u5BB9\u5F02\u5E38"})\u3002\u8BF7\u5148\u5728\u771F\u5B9E Chrome \u767B\u5F55 ${adapter},\u6216\u8FD0\u884C \`opencli ${adapter} login\` \u540E\u7528\u9762\u677F\u201C\u5DE1\u68C0\u767B\u5F55\u6001\u201D\u786E\u8BA4\u3002\u539F\u6587:${text.slice(0, 300)}`
      };
    }
    const badge = this.verifyBadge(v);
    return {
      ok: true,
      text: badge ? `${badge} ${text}` : text
    };
  }
  async replay(request) {
    const step = typeof request.step === "string" ? request.step.trim() : "";
    if (step.length === 0) return {
      ok: false,
      error: "step \u4E3A\u7A7A"
    };
    const [head, ...rest] = step.split(" ");
    if (head === "site" && rest.length >= 2) {
      const [adapter, command, ...args] = rest;
      if (adapter !== void 0 && command !== void 0) {
        const out = await this.runOpencli([
          adapter,
          command,
          ...args
        ]);
        return {
          ok: out.exitCode === 0,
          error: out.exitCode !== 0 ? this.renderOut(out) : void 0
        };
      }
    }
    if (head.startsWith("browser_")) {
      const out = await this.runBrowserTraced("dsh", [
        head.replace("browser_", ""),
        ...rest
      ]);
      return {
        ok: out.exitCode === 0,
        error: out.exitCode !== 0 ? this.renderOut(out) : void 0
      };
    }
    return {
      ok: false,
      error: `\u672A\u77E5\u6B65\u9AA4:${step}`
    };
  }
  // L3 高级自动化：脚本/配方/泛爬（对齐 anweat 21 工具，MVP 桩 + 透传）
  async scriptCatalog() {
    return {
      ok: true,
      scripts: [
        {
          name: "article",
          sha256: "builtin-article",
          description: "\u53EA\u8BFB\uFF1A\u63D0\u53D6\u6B63\u6587\u4E3A Markdown"
        },
        {
          name: "links",
          sha256: "builtin-links",
          description: "\u53EA\u8BFB\uFF1A\u63D0\u53D6\u9875\u9762\u94FE\u63A5"
        },
        {
          name: "jsonld",
          sha256: "builtin-jsonld",
          description: "\u53EA\u8BFB\uFF1A\u63D0\u53D6 JSON-LD"
        },
        {
          name: "forms",
          sha256: "builtin-forms",
          description: "\u53EA\u8BFB\uFF1A\u63D0\u53D6\u8868\u5355\u7ED3\u6784"
        }
      ]
    };
  }
  async scriptRunBuiltin(request) {
    const name = String(request.name ?? "");
    if (![
      "article",
      "links",
      "jsonld",
      "forms"
    ].includes(name)) return {
      ok: false,
      error: `\u672A\u77E5\u5185\u7F6E\u811A\u672C:${name}`
    };
    const out = await this.runBrowserTraced("dsh", [
      "extract",
      ...request.url !== void 0 ? [
        request.url
      ] : []
    ]);
    return {
      ok: out.exitCode === 0,
      result: this.renderOut(out),
      error: out.exitCode !== 0 ? this.renderOut(out) : void 0
    };
  }
  async crawl(request) {
    const url = String(request.url ?? "").trim();
    if (url.length === 0) return {
      ok: false,
      error: "url \u4E3A\u7A7A"
    };
    const maxPages = Math.min(Number(request.maxPages ?? 20), this.usagePolicy.maxPagesPerRun ?? 20);
    const out = await this.runBrowserTraced("dsh", [
      "open",
      url
    ]);
    if (out.exitCode !== 0) return {
      ok: false,
      error: this.renderOut(out)
    };
    return {
      ok: true
    };
  }
  async scriptValidate(request) {
    const code = String(request.code ?? "");
    if (!code.includes("@match") || !code.includes("@grant none")) return {
      ok: false,
      error: "\u9700\u5305\u542B @match + @grant none"
    };
    if (code.length > 64 * 1024) return {
      ok: false,
      error: "\u6E90\u7801 >64KB"
    };
    const m = code.match(/@match\s+(\S+)/)?.[1] ?? "";
    return {
      ok: true,
      meta: {
        name: code.match(/@name\s+(.+)/)?.[1]?.trim() ?? "unnamed",
        match: m,
        grant: "none"
      }
    };
  }
  async userscriptRun(request) {
    const v = await this.scriptValidate({
      code: String(request.code ?? "")
    });
    if (!v.ok) return {
      ok: false,
      error: v.error
    };
    if (this.automationMode !== "unrestricted") return {
      ok: false,
      error: "\u9700 unrestricted \u6A21\u5F0F\u6216\u5BA1\u6279\uFF08\u5F53\u524D " + this.automationMode + "\uFF09"
    };
    const out = await this.runBrowserTraced("dsh", [
      "eval",
      String(request.code ?? "").slice(0, 200)
    ]);
    return {
      ok: out.exitCode === 0,
      result: this.renderOut(out)
    };
  }
  async recipeRun(request) {
    const steps = Array.isArray(request.steps) ? request.steps : [];
    if (steps.length === 0 || steps.length > 25) return {
      ok: false,
      error: "steps 1-25"
    };
    for (const s of steps) {
      const t = String(s.type ?? "");
      if (![
        "wait",
        "click",
        "fill",
        "type",
        "press",
        "select",
        "check",
        "hover",
        "scroll",
        "extract",
        "assert",
        "screenshot"
      ].includes(t)) return {
        ok: false,
        error: `\u672A\u77E5\u6B65\u9AA4:${t}`
      };
      const sel = s.selector !== void 0 ? String(s.selector) : void 0;
      const val = s.value !== void 0 ? String(s.value) : void 0;
      const argv = [
        t,
        ...sel !== void 0 ? [
          sel
        ] : [],
        ...val !== void 0 ? [
          val
        ] : []
      ];
      const out = await this.runBrowserTraced("dsh", argv);
      if (out.exitCode !== 0) return {
        ok: false,
        error: this.renderOut(out)
      };
    }
    return {
      ok: true
    };
  }
  async automationSearch(request) {
    const q = String(request.query ?? "").toLowerCase();
    const hits = this.schedules.filter((s) => s.site.toLowerCase().includes(q) || q.length === 0).slice(0, 5).map((s) => ({
      id: s.id,
      name: s.site
    }));
    return {
      ok: true,
      hits
    };
  }
  async automationDevelop(request) {
    if (request.action === "get" && typeof request.id === "string") {
      const hit = this.schedules.find((s) => s.id === request.id);
      return hit !== void 0 ? {
        ok: true
      } : {
        ok: false,
        error: "\u672A\u627E\u5230"
      };
    }
    if (request.action === "save") return {
      ok: true
    };
    if (request.action === "validate") return {
      ok: true
    };
    if (request.action === "test") return {
      ok: true
    };
    return {
      ok: false,
      error: `\u672A\u77E5 action:${String(request.action)}`
    };
  }
  async automationRun(request) {
    const hit = this.schedules.find((s) => s.id === String(request.id ?? ""));
    if (hit === void 0) return {
      ok: false,
      error: "\u672A\u627E\u5230"
    };
    return this.replay({
      step: `site ${hit.site}`
    });
  }
  async automationModeGet() {
    return {
      ok: true,
      mode: this.automationMode
    };
  }
  async automationModeSet(request) {
    const m = String(request.mode ?? "");
    if (![
      "read-only",
      "standard",
      "autonomous",
      "unrestricted"
    ].includes(m)) return {
      ok: false,
      error: `\u672A\u77E5\u6A21\u5F0F:${m}`
    };
    this.automationMode = m;
    return {
      ok: true
    };
  }
  async promoteRecording(request) {
    const name = String(request.name ?? "").trim();
    if (!name) return {
      ok: false,
      error: "name \u5FC5\u586B"
    };
    if (!Array.isArray(request.steps) || request.steps.length === 0) return {
      ok: false,
      error: "steps \u5FC5\u586B"
    };
    const id = `rec-${Date.now()}`;
    const recipe = {
      kind: "recipe",
      id,
      name,
      status: "draft",
      revision: 1,
      domains: [],
      tags: [
        "auto-promoted"
      ],
      inputNames: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "recording",
      originalSteps: request.steps
    };
    return {
      ok: true,
      recipeId: id
    };
  }
  async installOpencliSkill() {
    const path = `${homedir2()}\\.dsh\\opencli-skill-inbox.md`;
    const body = [
      "# opencli-skill \u88C5\u6E05\u5355",
      "",
      "1. \u627E\u5230 opencli \u4ED3\u7684 skills \u76EE\u5F55:",
      "   `~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/`",
      "2. \u628A\u5B83\u590D\u5236\u5230 dsh \u6280\u80FD\u76EE\u5F55:",
      "   `cp -r ~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/* ~/.dsh/skills/`",
      "3. \u91CD\u542F dsh web",
      '4. \u9A8C\u8BC1:\u5728 dsh \u5BF9\u8BDD\u6846\u8BF4"\u52A0\u8F7D opencli-usage skill"',
      "",
      "\u5B8C\u6210\u540E:\u4F60\uFF08dsh \u52A9\u624B\uFF09\u5373\u53EF\u8C03\u7528 opencli \u7684 6 \u4E2A skill\uFF08adapter-author / autofix / browser / browser-sitemap / sitemap-author / usage\uFF09"
    ].join("\n");
    try {
      const { writeFile: writeFile3, mkdir: mkdir3 } = await import("node:fs/promises");
      await mkdir3(`${homedir2()}\\.dsh`, {
        recursive: true
      });
      await writeFile3(path, body, "utf8");
      return {
        ok: true,
        path
      };
    } catch (e) {
      return {
        ok: false,
        error: String(e)
      };
    }
  }
  async rulePacksList() {
    return {
      ok: true,
      packs: [
        ...this.rulePacks
      ]
    };
  }
  async rulePacksSet(request) {
    if (!Array.isArray(request.packs)) return {
      ok: false,
      error: "packs \u9700\u4E3A\u6570\u7EC4"
    };
    for (const p of request.packs) {
      if (typeof p.initScriptSha256 !== "string" || String(p.initScriptSha256).length !== 64) return {
        ok: false,
        error: "initScriptSha256 \u9700 64 \u4F4D"
      };
      const s = p.initScriptPath;
      if (typeof s !== "string" || s.length === 0) return {
        ok: false,
        error: "initScriptPath \u4E0D\u80FD\u4E3A\u7A7A"
      };
    }
    this.rulePacks = request.packs;
    return {
      ok: true
    };
  }
  /** R1 审批门:site 的 write 命令(发帖/点赞/下单等)先经 dsh 原生审批(ask→allowed-once)。
  * 任何异常一律放行给 next(),绝不因审批门自身故障阻塞工具。 */
  registerApprovalGate() {
    this.ctx.on("tools/pre-execute", async (exec, next) => {
      try {
        if (this.automationMode === "unrestricted") return await next();
        if (exec.name === "chrome_raw") {
          const m = String((exec.arguments ?? {}).method ?? "?");
          const reason2 = `chrome_raw ${m} \u76F4\u8C03 Chrome \u539F\u751F API\u2014\u2014\u53EF\u80FD\u6539\u52A8\u771F\u5B9E\u6D4F\u89C8\u5668\u7684\u7A97\u53E3/\u6807\u7B7E\u5E03\u5C40,\u9700\u4EBA\u5DE5\u786E\u8BA4\u3002`;
          this.recordAudit(`chrome_raw ${m}`, reason2);
          return {
            kind: "ask",
            reason: reason2
          };
        }
        const a = exec.arguments ?? {};
        const argsOk = typeof a.adapter === "string" && typeof a.command === "string" && a.adapter.length > 0 && a.command.length > 0;
        if (this.automationMode === "read-only" && exec.name === "site" && argsOk) {
          const acc = await this.lookupAccess(a.adapter, a.command);
          if (acc !== "read") {
            const roReason = `\u53EA\u8BFB\u6A21\u5F0F\uFF1Asite ${String(a.adapter)} ${String(a.command)} \u4E3A\u5199\u64CD\u4F5C\uFF0C\u5DF2\u62E6\u622A\u3002`;
            this.recordAudit(`site ${String(a.adapter)} ${String(a.command)}`, roReason);
            return {
              kind: "ask",
              reason: roReason
            };
          }
          return await next();
        }
        const needsAccess = exec.name === "site" && this.state.approval === "on" && argsOk && !this.state.disabled.includes(a.adapter);
        const access = needsAccess ? await this.lookupAccess(a.adapter, a.command) : "unknown";
        const decision = approvalDecision(this.state.approval === "on", this.state.disabled, exec.name, a.adapter, a.command, access);
        if (decision === "allow") return await next();
        const reason = decision === "ask-write" ? `site ${String(a.adapter)} ${String(a.command)} \u662F\u5199\u64CD\u4F5C\u2014\u2014\u4F1A\u5728\u4F60\u7684\u767B\u5F55\u6001\u6D4F\u89C8\u5668\u91CC\u771F\u5B9E\u6267\u884C(\u53D1\u5E16/\u70B9\u8D5E/\u4E0B\u5355/\u6539\u6570\u636E)\u3002` : `site ${String(a.adapter)} ${String(a.command)} \u672A\u80FD\u786E\u8BA4\u6743\u9650\u7C7B\u578B,\u6309\u5199\u64CD\u4F5C\u5BA1\u6279\u3002`;
        this.recordAudit(`site ${String(a.adapter)} ${String(a.command)}`, reason);
        return {
          kind: "ask",
          reason
        };
      } catch {
        return await next();
      }
    });
  }
  async lookupAccess(adapter, command) {
    if (this.adapterCache === null) await this.adapterList();
    return commandAccess(this.adapterCache?.json, adapter, command);
  }
  /** canary 漂移巡检:top-20 站只读命令逐站跑,与上一轮 canary 报告对比出新失败/恢复。
  * 产物 ~/.dsh/opencli-canary/canary-<时间戳>.md(保留 14 份);可被定时任务
  * 以命令 "canary" 每晚触发——站点改版漂移当天可见,不依赖上游 issue 猜健康度。 */
  async canaryRun() {
    const list = await this.adapterList();
    if (list === null) return {
      ok: false,
      total: 0,
      passed: 0,
      newFailures: [],
      recovered: [],
      error: this.lastShellError ?? "\u76EE\u5F55\u4E0D\u53EF\u7528"
    };
    const lines = pickCanaryCommands(list);
    if (lines.length === 0) return {
      ok: false,
      total: 0,
      passed: 0,
      newFailures: [],
      recovered: [],
      error: "\u76EE\u5F55\u65E0\u53EA\u8BFB\u547D\u4EE4"
    };
    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const [site, command] = lines[i].split(/\s+/);
      const started = Date.now();
      try {
        const out = await this.runOpencli([
          site,
          command
        ], 45e3);
        if (out.exitCode !== 0) {
          results.push({
            site,
            command: lines[i],
            ok: false,
            p: null,
            ms: Date.now() - started,
            error: clip((out.stderr || out.stdout).trim().slice(0, 120) || `\u9000\u51FA\u7801 ${out.exitCode}`, 120)
          });
        } else {
          const v = await this.verifyResult(site, command, out.stdout);
          const silent = v !== null && !v.verdict;
          results.push({
            site,
            command: lines[i],
            ok: !silent,
            p: v === null ? null : v.p,
            ms: Date.now() - started,
            ...silent ? {
              error: clip(`\u9759\u9ED8\u5931\u8D25:${v.why ?? ""}`, 120)
            } : {}
          });
        }
      } catch (e) {
        results.push({
          site,
          command: lines[i],
          ok: false,
          p: null,
          ms: Date.now() - started,
          error: clip(e instanceof Error ? e.message : String(e), 120)
        });
      }
      if (i < lines.length - 1 && this.benchGapMs > 0) await new Promise((res) => setTimeout(res, this.benchGapMs));
    }
    const dir = process.env.DSH_OPENCLI_CANARY_DIR ?? join3(homedir2(), ".dsh", "opencli-canary");
    let prevText = null;
    try {
      mkdirSync(dir, {
        recursive: true
      });
      const olds = readdirSync2(dir).filter((f) => /^canary-.+\.md$/.test(f)).sort();
      prevText = olds.length > 0 ? await readFile(join3(dir, olds[olds.length - 1]), "utf8") : null;
    } catch {
    }
    const prev = parseCanarySnapshot(prevText);
    const md = buildCanaryReport(results, prev, (/* @__PURE__ */ new Date()).toISOString());
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const file = join3(dir, `canary-${stamp}.md`);
    try {
      await writeFile2(file, md, "utf8");
      const olds = readdirSync2(dir).filter((f) => /^canary-.+\.md$/.test(f)).sort();
      if (olds.length > CANARY_KEEP) for (const f of olds.slice(0, olds.length - CANARY_KEEP)) {
        try {
          unlinkSync2(join3(dir, f));
        } catch {
        }
      }
    } catch {
    }
    const failedCmds = new Set(results.filter((x) => !x.ok).map((x) => x.command));
    const prevMap = prev;
    const newFailures = results.filter((x) => !x.ok && prevMap.get(x.command) === true).map((x) => x.command);
    const recovered = results.filter((x) => x.ok && prevMap.get(x.command) === false).map((x) => x.command);
    const passed = results.filter((x) => x.ok).length;
    return {
      ok: failedCmds.size === 0,
      total: results.length,
      passed,
      newFailures,
      recovered,
      path: file
    };
  }
  // ── 写操作证据包(任务 D)──────────────────────────────────
  /** 审批拒绝在 host 落地的最终文本特征(dsh-tools serviceAsk 的四种非授权拒绝 + 本插件
  *  审批门的写操作/只读拦截理由——无审批服务时 ask.reason 会原样成为拒绝文本)。
  *  以 host 真实字符串为准(dsh-tools/lib/index.js 的 serviceAsk),别凭记忆改写。 */
  static APPROVAL_DENIED_RE = /requires approval|the user rejected tool|was cancelled|是写操作|只读模式/;
  /**
  * 证据包专用截图:force 必拍,落盘/防碰撞/跨版本 argv 形态全复用 captureStepShot(A-core);
  * 合成 exitCode:1 结果是双保险——即使 force 语义被改,失败命令的补拍路径仍然成立。
  * 会话固定 dsh(site 适配器经 daemon 自己的浏览器跑,插件侧只有默认会话可拍,近似但聊胜于无)。
  */
  async captureEvidenceShot() {
    return await this.captureStepShot("dsh", [
      "evidence"
    ], {
      exitCode: 1,
      stdout: "",
      stderr: ""
    }, await this.cliMajor(), true);
  }
  /** 放行写命令的证据落盘:after 截图 → buildEvidence → saveEvidence(100 份轮转)。失败也落。 */
  async recordSiteEvidence(adapter, command, argv, out, beforeShot) {
    try {
      const afterShot = await this.captureEvidenceShot();
      await saveEvidence(this.evidenceDir, buildEvidence({
        command: `site ${adapter} ${command}`,
        argv,
        approval: {
          mode: this.state.approval,
          reason: null
        },
        beforeShot: beforeShot ?? null,
        afterShot: afterShot ?? null,
        result: {
          exitCode: out.exitCode,
          head: `${out.stdout}
${out.stderr}`.trim().slice(0, 200)
        },
        site: adapter
      }));
    } catch {
    }
  }
  /** 被拒写命令的证据落盘:命令从未执行,无截图可言,result 记 -1 + 拒绝理由原文。 */
  async recordBlockedEvidence(adapter, command, args, denial) {
    try {
      await saveEvidence(this.evidenceDir, buildEvidence({
        command: `site ${adapter} ${command}`,
        argv: [
          adapter,
          command,
          ...args
        ],
        approval: {
          mode: this.state.approval,
          reason: "blocked"
        },
        beforeShot: null,
        afterShot: null,
        result: {
          exitCode: -1,
          head: denial.slice(0, 200)
        },
        site: adapter
      }));
    } catch {
    }
  }
  /**
  * 审批拒绝监听(任务 D):被拒的写命令执行体根本不会跑(site execute 无从得知),唯一
  * 可见点是 tools/post-execute 收到的 isError 结果——host 把 serviceAsk 的拒绝落成
  * error.message(派发前拒绝也走这条 waterfall,dsh-tools finalizeScheduledExecution)。
  * 命中拒绝特征且目录确认为写命令 → 补一包 approval.reason='blocked'。观察者姿态:
  * 异常自吞、恒回 next(),绝不改变门后行为。
  */
  registerEvidenceListeners() {
    this.ctx.on("tools/post-execute", async (exec, result, next) => {
      try {
        if (exec.name === "site" && result.isError) {
          const a = exec.arguments ?? {};
          if (typeof a.adapter === "string" && typeof a.command === "string") {
            const denial = result.error.message;
            if (_OpencliService.APPROVAL_DENIED_RE.test(denial) && await this.lookupAccess(a.adapter, a.command) !== "read") {
              await this.recordBlockedEvidence(a.adapter, a.command, Array.isArray(a.args) ? a.args.map(String) : [], denial);
            }
          }
        }
      } catch {
      }
      return await next();
    });
  }
  /** 最近写命令证据包(任务 D):文件名即元数据(时间戳+站点),不读全文;倒序取前 20。 */
  async evidenceList() {
    try {
      const names = readdirSync2(this.evidenceDir).filter((f) => EVIDENCE_FILE_RE.test(f)).sort().reverse().slice(0, 20);
      const items = [];
      for (const f of names) {
        const meta = parseEvidenceFileName(f);
        if (meta === null) continue;
        let bytes = 0;
        try {
          bytes = statSync(join3(this.evidenceDir, f)).size;
        } catch {
        }
        items.push({
          file: join3(this.evidenceDir, f),
          at: meta.at,
          site: meta.site,
          bytes
        });
      }
      return {
        ok: true,
        items
      };
    } catch {
      return {
        ok: true,
        items: []
      };
    }
  }
  // ── 基础设施 ──────────────────────────────────────────────
  async acquireGovernor() {
    const now = Date.now();
    if (now < this.cooldownUntil) await new Promise((res) => setTimeout(res, this.cooldownUntil - now));
    if (this.concurrent >= this.usagePolicy.maxConcurrency) {
      await new Promise((res) => {
        this.queue.push(res);
      });
    }
    this.concurrent++;
    const burstWindow = 1e3;
    this.callTimestamps = this.callTimestamps.filter((t) => Date.now() - t < burstWindow);
    if (this.callTimestamps.length >= this.usagePolicy.burst) {
      const oldest = this.callTimestamps[0] ?? 0;
      const wait = burstWindow - (Date.now() - oldest);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }
    const last = this.callTimestamps[this.callTimestamps.length - 1];
    if (last !== void 0) {
      const delay = this.usagePolicy.minDelayMs - (Date.now() - last);
      if (delay > 0) await new Promise((res) => setTimeout(res, delay));
    }
  }
  releaseGovernor() {
    this.concurrent = Math.max(0, this.concurrent - 1);
    this.callTimestamps.push(Date.now());
    const next = this.queue.shift();
    if (next !== void 0) next();
  }
  noteRateLimit(text) {
    if (/429|502|503|504|Retry-After/i.test(text)) this.cooldownUntil = Date.now() + this.usagePolicy.cooldownMs;
  }
  async domainOf(adapter) {
    const list = await this.adapterList();
    const hit = list?.find((a) => a.name === adapter);
    return hit?.domain ?? null;
  }
  checkAuthProfile(domain, authProfile) {
    if (authProfile === void 0 || authProfile.length === 0) return null;
    const prof = this.authProfiles[authProfile];
    if (prof === void 0) return `\u672A\u77E5 authProfile:${authProfile}`;
    if (domain === null || domain === "null" || domain === "localhost" || domain === "127.0.0.1") return null;
    if (!prof.allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return `authProfile ${authProfile} \u4E0D\u5141\u8BB8\u8BBF\u95EE\u57DF ${domain}\uFF08\u5141\u8BB8\uFF1A${prof.allowedDomains.join(", ")}\uFF09`;
    return null;
  }
  /** shell 调用形态(跨版本自探测锁定):resolved=shell.resolve(spec) 后执行;direct=直传 spec;array=command 传 argv 数组。 */
  shellMode = null;
  /** 调度去重 marker(每启动周期有效,不落盘;此前寄生 runHistory 造成 5055 键无限累积)。 */
  schedMarkers = /* @__PURE__ */ new Set();
  /**
  * 0.2.0+ 原生执行:ctx.subprocess.spawn(argv)(官方 bash 工具同款 seam;
  * 旧 ctx.shell.execute 在 0.2.0 需要 sandbox policy 管线,插件直调已不可靠)。
  * 返回 null = 该 seam 不可用,调用方回落老路径。
  */
  async runSubprocess(argv, timeoutMs, stdoutMaxBytes) {
    let sub;
    try {
      sub = this.ctx.reflect?.get?.("subprocess", false);
    } catch {
      return null;
    }
    if (sub === void 0 || typeof sub.spawn !== "function") return null;
    const argv0 = this.bin === "opencli" ? [
      "opencli"
    ] : (this.bin.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [
      this.bin
    ]).map((s) => s.replace(/^"|"$/g, ""));
    const h = sub.spawn({
      argv: [
        ...argv0,
        ...argv
      ],
      cwd: homedir2(),
      stdio: {
        stdin: "ignore",
        stdout: {
          maxBytes: stdoutMaxBytes
        },
        stderr: {
          maxBytes: 262144
        }
      },
      graceMs: 1e3,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const outcome = await h.done;
    const read = async (r) => {
      try {
        return String((await r?.readFrom(0))?.text ?? "");
      } catch {
        return "";
      }
    };
    return {
      exitCode: typeof outcome?.exitCode === "number" ? outcome.exitCode : 1,
      stdout: await read(h.collected?.stdout),
      stderr: await read(h.collected?.stderr)
    };
  }
  async runOpencli(argv, timeoutMs = 6e4, stdoutMaxBytes = 1048576) {
    const raw = await this.runOpencliRaw(argv, timeoutMs, stdoutMaxBytes);
    return this.unwrapCli2(argv, raw);
  }
  /** opencli 2.0 JSON 信封解包:`{"ok":true,"data":…}` → data 为 stdout;`{"ok":false,"error":{code,message,hint}}`
  *  → stderr + 真实退出码。只认输出形状不看版本号(托盘复活旧 daemon 等版本错配场景照样工作);
  *  list/daemon 两族有专用解析(分页/JSON 状态),在此跳过。1.x 文本输出无 `{"ok":` 前缀,原样透传。 */
  unwrapCli2(argv, out) {
    if (out.unavailable !== void 0) return out;
    if (argv[0] === "list" || argv[0] === "daemon") return out;
    const s = out.stdout.trimStart();
    if (!s.startsWith('{"ok"')) return out;
    const j = extractJsonObject(s);
    if (j === null || typeof j.ok !== "boolean") return out;
    if (j.ok === true) {
      const d = j.data;
      return {
        ...out,
        exitCode: 0,
        stdout: typeof d === "string" ? d : d === void 0 ? "" : JSON.stringify(d, null, 2)
      };
    }
    const e = j.error ?? {};
    const parts = [
      typeof e.code === "string" ? e.code : "UNKNOWN",
      typeof e.message === "string" ? e.message : "",
      typeof e.hint === "string" ? e.hint : ""
    ].filter((x) => x.length > 0);
    return {
      ...out,
      exitCode: typeof e.exitCode === "number" ? e.exitCode : 1,
      stdout: "",
      stderr: parts.join("\n")
    };
  }
  /** CLI 大版本(1/2),进程内缓存。决定 browser 会话语法与 adapter 命令族路由。 */
  cliMajorCache = null;
  async cliMajor() {
    if (this.cliMajorCache !== null) return this.cliMajorCache;
    try {
      const r = await this.runOpencliRaw([
        "--version"
      ], 15e3);
      const m = `${r.stdout}
${r.stderr}`.match(/(\d+)\.\d+/);
      this.cliMajorCache = m ? Number(m[1]) : 1;
    } catch {
      this.cliMajorCache = 1;
    }
    return this.cliMajorCache;
  }
  async runOpencliRaw(argv, timeoutMs = 6e4, stdoutMaxBytes = 1048576) {
    await this.acquireGovernor();
    try {
      let viaSub = null;
      for (let attempt = 0; attempt < 3 && viaSub === null; attempt++) {
        try {
          viaSub = await this.runSubprocess(argv, timeoutMs, stdoutMaxBytes);
        } catch {
          if (attempt < 2) await new Promise((res) => setTimeout(res, 400));
        }
      }
      if (viaSub !== null) {
        this.noteRateLimit(`${viaSub.stdout}
${viaSub.stderr}`);
        return viaSub;
      }
      const shellAny = this.ctx.shell;
      const runner = typeof shellAny.run === "function" ? shellAny.run.bind(shellAny) : typeof shellAny.execute === "function" ? shellAny.execute.bind(shellAny) : null;
      if (runner === null) return {
        exitCode: 1,
        stdout: "",
        stderr: "dsh shell \u80FD\u529B\u4E0D\u53EF\u7528(\u65E2\u65E0 run \u4E5F\u65E0 execute)"
      };
      const policy = {
        mode: "danger-full-access",
        workspaceRoot: homedir2()
      };
      const baseSpec = {
        command: [
          this.bin,
          ...argv
        ].join(" "),
        timeoutMs,
        stdoutMaxBytes,
        policy
      };
      const argvSpec = {
        ...baseSpec,
        command: [
          this.bin,
          ...argv
        ],
        policy
      };
      const attempts = this.shellMode !== null ? [
        this.shellMode
      ] : [
        "resolved",
        "direct",
        "array"
      ];
      let out = {
        exitCode: 1,
        stdout: "",
        stderr: ""
      };
      for (const mode of attempts) {
        let spec;
        let threw = false;
        try {
          spec = mode === "resolved" ? typeof shellAny.resolve === "function" ? shellAny.resolve({
            ...baseSpec
          }) : baseSpec : mode === "direct" ? baseSpec : argvSpec;
          const raw = await runner(spec);
          const asText = (x) => {
            if (x && typeof x === "object" && typeof x.text === "string") return x.text;
            return typeof x === "string" ? x : "";
          };
          out = {
            exitCode: typeof raw?.exitCode === "number" ? raw.exitCode : 1,
            stdout: asText(raw?.stdout),
            stderr: asText(raw?.stderr)
          };
        } catch (e) {
          threw = true;
          out = {
            exitCode: 1,
            stdout: "",
            stderr: e instanceof Error ? e.message : String(e)
          };
        }
        if (!threw && (out.stdout.length > 0 || out.stderr.length > 0 || out.exitCode === 0)) {
          this.shellMode = mode;
          break;
        }
      }
      this.noteRateLimit(`${out.stdout}
${out.stderr}`);
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/SandboxUnavailableError|no sandbox backend|ACL restricted-token/i.test(msg)) {
        return {
          exitCode: -1,
          stdout: "",
          stderr: msg.slice(0, 500),
          unavailable: msg.slice(0, 300)
        };
      }
      throw e;
    } finally {
      this.releaseGovernor();
    }
  }
  renderOut(out) {
    if (out.exitCode === 0) return clip(out.stdout, OUTPUT_LIMIT);
    return `\u547D\u4EE4\u5931\u8D25(\u9000\u51FA\u7801 ${out.exitCode}):
${clip(out.stdout, 2e3)}
${clip(out.stderr, 2e3)}`;
  }
  // ── 录屏回放:browser 命令运行轨迹(BrowserSkill #79 同款需求) ──
  /** 轨迹文件日期键(本地日期 yyyymmdd,recordTrace 写入与 trace-list/get 读取共用同一把尺)。 */
  static traceDateKey(d = /* @__PURE__ */ new Date()) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }
  /**
  * 轨迹时间列:at 是 UTC ISO,直接 slice(11,19) 显示会与用户本地时钟错位(东八区差 8h,
  * 凌晨命令对不上体感)——转本地 HH:MM:SS,与 traceDateKey 的本地分档同一时区体感。
  * 非法时间原样回退(形状校验后仍可能是垃圾字符串)。
  */
  static traceClock(at) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at.slice(11, 19);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  traceFileOf(dateKey, rotated = false) {
    return join3(this.traceDir, `trace-${dateKey}.jsonl${rotated ? ".1" : ""}`);
  }
  /**
  * browser 透传统一入口:runOpencli + recordTrace。browser_* 工具族(registerBrowserTools 的 run())
  * 与 replay / script-run-builtin / crawl / userscript-run / recipe-run 五个 RPC 透传都经此——
  * 任何入口执行的 browser 命令都进「运行轨迹」,复盘链路不断(评审:面板回放按钮曾绕过单点)。
  */
  async runBrowserTraced(session, argv) {
    const started = Date.now();
    const major = await this.cliMajor();
    let out;
    if (major >= 2) {
      const [head] = argv;
      if (head === "init" || head === "verify") {
        const sub = head === "verify" ? "check" : "init";
        out = await this.runOpencli([
          "adapter",
          sub,
          ...argv.slice(1)
        ]);
      } else if (head === "analyze") {
        out = {
          exitCode: 1,
          stdout: "",
          stderr: "opencli 2.0 \u5DF2\u79FB\u9664 analyze \u4FA6\u5BDF\u5DE5\u4F5C\u6D41;\u6539\u7528 browser state --diagnostics / browser network --static,\u6216 adapter init \u540E adapter check \u9A8C\u8BC1"
        };
      } else {
        out = await this.runOpencli([
          "browser",
          ...argv,
          "--session",
          session ?? "dsh"
        ]);
      }
    } else {
      out = await this.runOpencli([
        "browser",
        session ?? "dsh",
        ...argv
      ]);
    }
    const shot = await this.captureStepShot(session, argv, out, major);
    this.recordTrace(`browser ${session ?? "dsh"} ${argv.join(" ")}`, out, Date.now() - started, shot);
    return shot !== void 0 ? {
      ...out,
      shot
    } : out;
  }
  /** 截图文件名时间段(本地 hhmmss,无冒号——文件系统安全;与 traceDateKey 同一时区体感,回放时对得上墙钟)。 */
  static shotClock(d = /* @__PURE__ */ new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  /**
  * 步骤自动截图:页面变化类子命令(SHOT_TRIGGER_SUBS)或任何失败命令执行后补拍一张,落
  * <shotsDir>/<yyyymmdd>/<session>/step-<hhmmss>-<idx>.png。任何失败(建目录/CLI 报错/文件没落盘)
  * 一律静默返回 undefined——截图只是复盘增强,绝不阻断命令本身;CLI 已确认文件写出后才计入轨迹行,
  * 杜绝 shot 字段指向不存在文件的悬空引用。
  * force(证据包专用,任务 D):写命令的 before/after 必拍——证据链完整性优先于截图频率,
  * 绕过"页面变化才拍"触发门限。
  */
  async captureStepShot(session, argv, out, major, force = false) {
    if (!this.shotCapture) return void 0;
    const sub = String(argv[0] ?? "");
    if (!force && out.exitCode === 0 && !SHOT_TRIGGER_SUBS.has(sub)) return void 0;
    if (out.unavailable !== void 0) return void 0;
    try {
      const sid = (session ?? "dsh").replace(/[^\w.-]/g, "_");
      const now = /* @__PURE__ */ new Date();
      const dir = join3(this.shotsDir, _OpencliService.traceDateKey(now), sid);
      mkdirSync(dir, {
        recursive: true
      });
      const clock = _OpencliService.shotClock(now);
      let file = "";
      do {
        file = join3(dir, `step-${clock}-${++this.shotSeq}.png`);
      } while (existsSync(file));
      const shotArgv = major >= 2 ? [
        "browser",
        "screenshot",
        file,
        "--session",
        session ?? "dsh"
      ] : [
        "browser",
        session ?? "dsh",
        "screenshot",
        file
      ];
      const r = await this.runOpencli(shotArgv, 3e4);
      return r.exitCode === 0 && existsSync(file) ? file : void 0;
    } catch {
      return void 0;
    }
  }
  /**
  * 每条 browser 命令追加一行 JSONL 到 <traceDir>/trace-<yyyymmdd>.jsonl:
  * {at, cmd, exitCode, ms, outHead(输出前 200 字,失败时 stderr 优先)}。
  * 同步写(量级 ~300B/条,相对秒级浏览器操作可忽略,且对调用方可确定性断言);
  * 单文件超 5MB 轮转为 .1(旧 .1 丢弃,保留前一份);任何失败静默,绝不影响命令本身。
  */
  recordTrace(cmd, out, ms, shot) {
    try {
      try {
        mkdirSync(this.traceDir, {
          recursive: true
        });
      } catch {
        return;
      }
      const file = this.traceFileOf(_OpencliService.traceDateKey());
      try {
        if (statSync(file).size > 5 * 1024 * 1024) {
          try {
            unlinkSync2(`${file}.1`);
          } catch {
          }
          renameSync(file, `${file}.1`);
        }
      } catch {
      }
      const outHead = (out.exitCode === 0 ? out.stdout : `${out.stderr}
${out.stdout}`.trim()).slice(0, 200);
      const row = {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        cmd,
        exitCode: out.exitCode,
        ms,
        outHead,
        ...shot !== void 0 && shot.length > 0 ? {
          shot
        } : {}
      };
      appendFileSync(file, `${JSON.stringify(row)}
`, "utf8");
    } catch {
    }
  }
  /** 解析一个轨迹文件为行数组(缺文件/JSON 解析失败/**形状不对**的脏行一律跳过,不抛错)。 */
  readTraceFile(file) {
    const lines = [];
    let text = "";
    try {
      text = readFileSync2(file, "utf8");
    } catch {
      return lines;
    }
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        const v = JSON.parse(line);
        if (v === null || typeof v !== "object" || typeof v.at !== "string" || typeof v.cmd !== "string" || typeof v.exitCode !== "number" || typeof v.ms !== "number" || typeof v.outHead !== "string") continue;
        const t = v;
        if (t.shot !== void 0 && typeof t.shot !== "string") delete t.shot;
        lines.push(t);
      } catch {
      }
    }
    return lines;
  }
  /** trace_replay 的 markdown 时间线(新→旧):时间/命令/exit/耗时,失败步附输出摘录。 */
  async renderTraceTimeline(limit) {
    const r = await this.traceList({
      limit
    });
    if (!r.ok || r.traces.length === 0) return "\u6682\u65E0\u8FD0\u884C\u8F68\u8FF9(\u8FD8\u6CA1\u6709 browser \u547D\u4EE4\u6267\u884C\u8BB0\u5F55)\u3002\u8DD1\u4E00\u6761 browser_* \u540E\u518D\u6765\u770B\u3002";
    const esc = (s) => s.replace(/\r?\n/g, "\\n").replace(/\s+/g, " ").replace(/\|/g, "\\|");
    const out = [
      `\u6700\u8FD1 ${r.traces.length} \u6B65 browser \u547D\u4EE4(\u65B0\u2192\u65E7,exit\u22600 \u4E3A\u5931\u8D25):`,
      "",
      "| \u65F6\u95F4 | \u547D\u4EE4 | exit | \u8017\u65F6 |",
      "|---|---|---|---|",
      ...r.traces.map((t) => `| ${_OpencliService.traceClock(t.at)} | ${esc(t.cmd.slice(0, 80))} | ${t.exitCode} | ${t.ms}ms |`)
    ];
    const fails = r.traces.filter((t) => t.exitCode !== 0).slice(0, 3);
    if (fails.length > 0) {
      out.push("", "\u5931\u8D25\u6B65\u8F93\u51FA\u6458\u5F55(\u590D\u76D8\u8D77\u70B9):");
      for (const f of fails) out.push(`- [${_OpencliService.traceClock(f.at)}] ${esc(f.cmd.slice(0, 60))} \u2192 ${esc(f.outHead.slice(0, 120))}`);
    }
    return out.join("\n").slice(0, 4e3);
  }
  async daemonStatus() {
    const r = await this.runOpencli([
      "daemon",
      "status"
    ], 15e3);
    if (r.exitCode !== 0) return null;
    return parseDaemonStatus(r.stdout + "\n" + r.stderr);
  }
  async loadState() {
    try {
      const text = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(text);
      if (parsed.approval === "on" || parsed.approval === "off") this.state.approval = parsed.approval;
      if (Array.isArray(parsed.disabled)) this.state.disabled = parsed.disabled.filter((s) => typeof s === "string");
      if (Array.isArray(parsed.schedules)) this.schedules = parsed.schedules;
      if (parsed.runHistory !== void 0 && typeof parsed.runHistory === "object") this.runHistory = parsed.runHistory;
      for (const k of Object.keys(this.runHistory)) {
        if (k.includes(":")) delete this.runHistory[k];
      }
      if (Array.isArray(parsed.audit)) this.state.audit = parsed.audit.filter((a) => a !== null && typeof a === "object" && typeof a.at === "string");
    } catch {
    }
  }
  async saveState() {
    try {
      await mkdir2(join3(homedir2(), ".dsh"), {
        recursive: true
      });
      await writeFile2(this.statePath, JSON.stringify({
        ...this.state,
        schedules: this.schedules,
        runHistory: this.runHistory,
        audit: this.state.audit
      }, null, 2), "utf8");
    } catch {
    }
  }
  /** 简易 5 段 cron 匹配(分 时 日 月 周;支持 *、数字、星斜步长)。 */
  cronMatches(cron, now) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const vals = [
      now.getMinutes(),
      now.getHours(),
      now.getDate(),
      now.getMonth() + 1,
      now.getDay()
    ];
    const mins = [
      0,
      0,
      1,
      1,
      0
    ];
    const maxs = [
      59,
      23,
      31,
      12,
      6
    ];
    return parts.every((spec, i) => {
      if (spec === "*") return true;
      if (spec.startsWith("*/")) {
        const step = Number(spec.slice(2));
        if (!Number.isFinite(step) || step <= 0) return false;
        return (vals[i] - mins[i]) % step === 0;
      }
      return spec.split(",").some((tok) => {
        const n = Number(tok);
        return Number.isFinite(n) && n >= mins[i] && n <= maxs[i] && n === vals[i];
      });
    });
  }
  startScheduler() {
    if (this.schedTimer !== void 0) return;
    this.schedTimer = setInterval(() => {
      const now = /* @__PURE__ */ new Date();
      const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      for (const sch of this.schedules) {
        if (!sch.enabled) continue;
        const histKey = `${sch.id}:${minuteKey}`;
        if (this.schedMarkers.has(histKey)) continue;
        if (!this.cronMatches(sch.cron, now)) continue;
        this.schedMarkers.add(histKey);
        void this.runSiteCommand(sch.site, sch.id);
      }
    }, 15e3);
    try {
      this.schedTimer.unref?.();
    } catch {
    }
  }
  async runSiteCommand(siteCmd, id) {
    const sch = this.schedules.find((s) => s.id === id);
    const attempts = Math.max(1, Math.min(5, sch?.retry ?? 3));
    const notify = sch?.notify !== false;
    const hist = this.runHistory[id] ?? [];
    const norm = siteCmd.replace(/^\s*site\s+/i, "").trim();
    if (norm === "canary") {
      const r = await this.canaryRun();
      hist.unshift({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ok: r.ok,
        summary: r.ok ? `canary:${r.passed}/${r.total}${r.newFailures.length > 0 ? " \u65B0\u5931\u8D25:" + r.newFailures.slice(0, 3).join(",") : ""}` : `canary \u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
      });
      this.runHistory[id] = hist.slice(0, 5);
      await this.saveState();
      return;
    }
    const cmdLine = norm.length > 0 ? norm : siteCmd;
    const [sSite = "", sCmd = ""] = cmdLine.split(/\s+/);
    let lastOk = false;
    let lastSummary = "";
    let lastOut = "";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const started = Date.now();
        const r = await this.runOpencli(cmdLine.split(/\s+/), 6e4);
        this.recordTrace(`schedule ${cmdLine}`, r, Date.now() - started);
        lastOk = r.exitCode === 0;
        lastSummary = lastOk ? r.stdout.slice(0, 120) || "ok" : r.stderr.slice(0, 120) || `exit ${r.exitCode}`;
        lastOut = lastOk ? r.stdout : "";
        if (lastOk) {
          const v = await this.verifyResult(sSite, sCmd, r.stdout);
          if (v !== null) {
            if (!v.verdict) {
              lastOk = false;
              lastSummary = `\u9759\u9ED8\u5931\u8D25(${v.why ?? `P=${v.p.toFixed(2)}`}):${lastSummary}`;
            } else if (v.p < 0.7) {
              lastSummary = `\u26A0 \u53EF\u7591(P=${v.p.toFixed(2)}) ${lastSummary}`;
            }
          }
        }
      } catch (e) {
        lastOk = false;
        lastSummary = e instanceof Error ? e.message.slice(0, 120) : "failed";
      }
      hist.unshift({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ok: lastOk,
        summary: attempts > 1 ? `#${attempt}/${attempts} ${lastSummary}` : lastSummary
      });
      if (lastOk) break;
      if (attempt < attempts) {
        const riskWall = lastSummary.includes("\u767B\u5F55/\u98CE\u63A7\u5899");
        await new Promise((res) => setTimeout(res, riskWall ? 12e4 : 15e3));
      }
    }
    this.runHistory[id] = hist.slice(0, 5);
    if (lastOk && lastOut.length > 0) {
      try {
        const dir = join3(homedir2(), ".dsh", "opencli-snapshots", id);
        await mkdir2(dir, {
          recursive: true
        });
        const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
        await writeFile2(join3(dir, `${stamp}.json`), JSON.stringify({
          at: (/* @__PURE__ */ new Date()).toISOString(),
          site: siteCmd,
          bytes: lastOut.length,
          stdout: lastOut
        }), "utf8");
        const olds = readdirSync2(dir).sort();
        if (olds.length > 50) for (const f of olds.slice(0, olds.length - 50)) {
          try {
            unlinkSync2(join3(dir, f));
          } catch {
          }
        }
      } catch {
      }
    }
    if (lastOk && sch?.watch !== void 0 && sch.watch.length > 0) {
      const kws = sch.watch.split(/[,，\s]+/).filter((k) => k.length > 0);
      const low = lastOut.toLowerCase();
      const matched = kws.filter((k) => low.includes(k.toLowerCase()));
      if (matched.length > 0) {
        this.ingestEventList.unshift({
          at: (/* @__PURE__ */ new Date()).toISOString(),
          kind: "watch-hit",
          text: `\u{1F514} Watch \u547D\u4E2D:${siteCmd} \u51FA\u73B0 [${matched.join(", ")}]`
        });
        this.ingestEventList = this.ingestEventList.slice(0, 30);
      }
    }
    if (!lastOk && notify) {
      this.ingestEventList.unshift({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        kind: "schedule-failed",
        text: `\u5B9A\u65F6\u4EFB\u52A1\u8FDE\u7EED ${attempts} \u6B21\u5931\u8D25:${siteCmd} \u2014 ${lastSummary}`
      });
      this.ingestEventList = this.ingestEventList.slice(0, 30);
    }
    await this.saveState();
  }
  /** 简单并发池(登录巡检限流用)。 */
  async runPool(items, concurrency, fn) {
    const out = [];
    let cursor = 0;
    const workers = Array.from({
      length: Math.min(concurrency, items.length)
    }, async () => {
      for (; ; ) {
        const i = cursor++;
        if (i >= items.length) break;
        out.push(await fn(items[i]));
      }
    });
    await Promise.all(workers);
    return out;
  }
  async adapterList() {
    if (this.adapterCache !== null && Date.now() - this.adapterCache.at < ADAPTER_TTL_MS) {
      return normalizeAdapterList(this.adapterCache.json);
    }
    const major = await this.cliMajor();
    if (major >= 2) {
      const collected = [];
      let offset = 0;
      let total = null;
      for (let page = 0; page < 40; page++) {
        const r2 = await this.runOpencliRaw([
          "list",
          "--format",
          "json",
          "--limit",
          "100",
          "--offset",
          String(offset)
        ], 3e4, 4 * 1024 * 1024);
        if (r2.exitCode !== 0) {
          this.lastShellError = `list(${r2.exitCode})|out:${r2.stdout.slice(0, 200)}|err:${r2.stderr.slice(0, 200)}`;
          return null;
        }
        try {
          const s = r2.stdout.trimStart();
          const start = s.indexOf("{");
          const j = JSON.parse(start === -1 ? s : s.slice(start));
          if (j.ok !== true || !Array.isArray(j.data?.commands)) throw new Error(`envelope ok=${String(j.ok)} error=${j.error?.message?.slice(0, 120) ?? "\u65E0 data.commands"}`);
          collected.push(...j.data.commands);
          total = typeof j.data.total === "number" ? j.data.total : total;
          const next = typeof j.data.nextOffset === "number" ? j.data.nextOffset : 0;
          if (next <= offset || total !== null && collected.length >= total) break;
          offset = next;
        } catch (e) {
          this.lastShellError = `json(${e instanceof Error ? e.message.slice(0, 120) : "parse"})|head:${r2.stdout.slice(0, 200)}`;
          return null;
        }
      }
      if (collected.length === 0) {
        this.lastShellError = "list(2.0)|\u7FFB\u9875\u540E 0 \u547D\u4EE4";
        return null;
      }
      this.adapterCache = {
        at: Date.now(),
        json: collected
      };
      return normalizeAdapterList(collected);
    }
    const r = await this.runOpencliRaw([
      "list",
      "--format",
      "json"
    ], 3e4, 8 * 1024 * 1024);
    if (r.exitCode !== 0) {
      this.lastShellError = `list(${r.exitCode})|out:${r.stdout.slice(0, 200)}|err:${r.stderr.slice(0, 200)}`;
      return null;
    }
    try {
      const start = Math.min(...[
        "[",
        "{"
      ].map((c) => {
        const i = r.stdout.indexOf(c);
        return i === -1 ? Infinity : i;
      }));
      const json = JSON.parse(Number.isFinite(start) ? r.stdout.slice(start) : r.stdout);
      this.adapterCache = {
        at: Date.now(),
        json
      };
      return normalizeAdapterList(json);
    } catch (e) {
      this.lastShellError = `json(${e instanceof Error ? e.message.slice(0, 120) : "parse"})|head:${r.stdout.slice(0, 200)}`;
      return null;
    }
  }
};
function clip(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `
\u2026(\u5DF2\u622A\u65AD,\u539F\u6587 ${text.length} \u5B57\u7B26)`;
}
var index_default = OpencliService;
export {
  BENCH_KEEP,
  DEFAULT_BENCH,
  EVIDENCE_KEEP,
  OpencliService,
  browserDoCardRender,
  buildBenchmarkReport,
  buildEvidence,
  index_default as default,
  renderBenchmarkTable,
  saveEvidence,
  scanOpencliAcrossNodeVersions,
  siteBatchCardRender,
  siteCardRender
};
