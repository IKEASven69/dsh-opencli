var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// dsh-plugin/plugins/dsh-opencli/.build-tools/tmp-src/index.js
import { Service } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// dsh-plugin/plugins/dsh-opencli/.build-tools/tmp-src/parsers.js
function parseDaemonStatus(text) {
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
    const site = raw.site ?? raw.command?.split("/")[0];
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
    const cmd = raw.name ?? raw.command?.split("/")[1] ?? "";
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
    const site = raw.site ?? raw.command?.split("/")[0];
    const name = raw.name ?? raw.command?.split("/")[1];
    if (site !== adapter || name !== command) continue;
    if (raw.access === "write") return "write";
    if (raw.access === "read") return "read";
    return "unknown";
  }
  return "unknown";
}
function sitesWithWhoami(input, limit = 40) {
  if (!Array.isArray(input)) return [];
  const sites = /* @__PURE__ */ new Map();
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const site = raw.site ?? raw.command?.split("/")[0];
    const name = raw.name ?? raw.command?.split("/")[1];
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

// dsh-plugin/plugins/dsh-opencli/.build-tools/tmp-src/index.js
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
    return Object.defineProperty(Class, Symbol.metadata || Symbol.for("Symbol.metadata"), {
      configurable: true,
      enumerable: true,
      value: metadata
    });
  }
  _apply_decs_2203_r = function(targetClass2, memberDecs2, classDecs2, parentClass2) {
    if (parentClass2 !== void 0) {
      var parentMetadata = parentClass2[Symbol.metadata || Symbol.for("Symbol.metadata")];
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
var OUTPUT_LIMIT = 16e3;
var ADAPTER_TTL_MS = 60 * 60 * 1e3;
var LOGIN_CHECK_TTL_MS = 10 * 60 * 1e3;
var LOGIN_CHECK_CONCURRENCY = 3;
_computedKey = Service.init, _dec = Remote("status"), _dec1 = Remote("adapters"), _dec2 = Remote("refresh"), _dec3 = Remote("daemon-start"), _dec4 = Remote("settings"), _dec5 = Remote("approval-set"), _dec6 = Remote("adapter-disable"), _dec7 = Remote("login-check"), _dec8 = Remote("adapter-detail"), _dec9 = Remote("schedule-add"), _dec10 = Remote("schedule-list"), _dec11 = Remote("replay"), _dec12 = Remote("script-catalog"), _dec13 = Remote("script-run-builtin"), _dec14 = Remote("crawl"), _dec15 = Remote("script-validate"), _dec16 = Remote("userscript-run"), _dec17 = Remote("recipe-run"), _dec18 = Remote("automation-search"), _dec19 = Remote("automation-develop"), _dec20 = Remote("automation-run"), _dec21 = Remote("automation-mode-get"), _dec22 = Remote("automation-mode-set"), _dec23 = Remote("rulepacks-list"), _dec24 = Remote("rulepacks-set");
var OpencliService = class extends TypertRemoteService {
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
        "replay"
      ],
      [
        _dec12,
        2,
        "scriptCatalog"
      ],
      [
        _dec13,
        2,
        "scriptRunBuiltin"
      ],
      [
        _dec14,
        2,
        "crawl"
      ],
      [
        _dec15,
        2,
        "scriptValidate"
      ],
      [
        _dec16,
        2,
        "userscriptRun"
      ],
      [
        _dec17,
        2,
        "recipeRun"
      ],
      [
        _dec18,
        2,
        "automationSearch"
      ],
      [
        _dec19,
        2,
        "automationDevelop"
      ],
      [
        _dec20,
        2,
        "automationRun"
      ],
      [
        _dec21,
        2,
        "automationModeGet"
      ],
      [
        _dec22,
        2,
        "automationModeSet"
      ],
      [
        _dec23,
        2,
        "rulePacksList"
      ],
      [
        _dec24,
        2,
        "rulePacksSet"
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
    disabled: []
  };
  statePath = join(homedir(), ".dsh", "dsh-opencli-state.json");
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
  automationMode = "standard";
  rulePacks = [];
  automationAssets = {
    persistenceMode: "suggest",
    activationMode: "manual"
  };
  constructor(ctx) {
    super(ctx, "opencli");
    this.bin = this.resolveBin();
    void this.loadState();
  }
  resolveBin() {
    if (process.env.DSH_OPENCLI_BIN !== void 0 && process.env.DSH_OPENCLI_BIN.length > 0) return process.env.DSH_OPENCLI_BIN;
    try {
      const pkg = __require.resolve("@jackwener/opencli/package.json");
      const bin = join(dirname(pkg), "dist", "src", "main.js");
      if (existsSync(bin)) return `node ${bin}`;
    } catch {
    }
    return "opencli";
  }
  async [_computedKey]() {
    this.registerBrowserTools();
    this.registerAdvancedTools();
    this.registerSiteTool();
    this.registerApprovalGate();
    void this.injectSystemPrompt();
    try {
      this.ctx.provide("browser", this);
    } catch {
    }
  }
  // ── 模型工具 ──────────────────────────────────────────────
  registerBrowserTools() {
    const t = this.ctx.tools;
    const run = async (session, argv) => {
      const out = await this.runOpencli([
        "browser",
        session ?? "dsh",
        ...argv
      ]);
      return {
        text: this.renderOut(out)
      };
    };
    const s = "\u6D4F\u89C8\u5668\u4F1A\u8BDD\u540D(\u9ED8\u8BA4 dsh;bind \u8FC7\u7684\u4F1A\u8BDD\u590D\u7528\u767B\u5F55\u6001)";
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
        const q = a.command !== void 0 ? String(a.command).toLowerCase() : "";
        const site = a.adapter !== void 0 ? String(a.adapter).toLowerCase() : "";
        const filtered = list.filter((x) => (q.length === 0 || x.name.toLowerCase().includes(q)) && (site.length === 0 || x.name.toLowerCase().includes(site))).slice(0, 100);
        return {
          text: JSON.stringify(filtered.slice(0, 10), null, 2).slice(0, 4e3) + `
\u2026\u5171 ${filtered.length} \u6761`
        };
      }
    }));
    t.register(defineTool({
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
    }));
  }
  registerAdvancedTools() {
    const t = this.ctx.tools;
    const out = (text) => ({
      text
    });
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
    t.register(defineTool({
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
    }));
  }
  registerSiteTool() {
    this.ctx.tools.register(defineTool({
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
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
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
        const out = await this.runOpencli([
          adapter,
          command,
          ...a.args ?? []
        ]);
        const text = this.renderOut(out);
        if (text.trim() === "[]") return {
          text: `\u9002\u914D\u5668 ${adapter} \u8FD4\u56DE\u7A7A\uFF08\u53EF\u80FD\u672A\u767B\u5F55\u6216\u65E0\u6570\u636E\uFF09\u3002\u8BF7\u5148\u5728\u771F\u5B9E Chrome \u767B\u5F55 ${adapter}\uFF0C\u6216\u8FD0\u884C \`opencli ${adapter} login\` \u540E\u7528\u9762\u677F\u201C\u5DE1\u68C0\u767B\u5F55\u6001\u201D\u786E\u8BA4\u3002`
        };
        if (out.exitCode !== 0 && /Navigation rejected/i.test(text)) return {
          text: `\u5BFC\u822A\u88AB\u62D2\uFF08${adapter}\uFF09\uFF1A\u8BF7\u786E\u8BA4 Chrome \u6269\u5C55\u5DF2\u8FDE\u63A5\u4E14\u5DF2\u767B\u5F55 ${adapter}\uFF0C\u6216\u5148 \`opencli ${adapter} login\`\u3002\u539F\u9519\uFF1A${text.slice(0, 300)}`
        };
        return {
          text
        };
      }
    }));
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
    this.directoryText = `\u6D4F\u89C8\u5668\u4EE3\u7406(dsh-opencli):\u64CD\u7EB5\u7528\u6237**\u5DF2\u767B\u5F55\u7684\u771F\u5B9E Chrome**\u3002\u6D41\u7A0B:browser_open \u2192 browser_state(\u62FF [N] \u7D22\u5F15)\u2192 browser_click/type/fill(target \u7528 [N])\u2192 browser_extract \u8BFB\u7ED3\u679C\u3002${state}\u3002${gate}
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
        error: `opencli \u4E0D\u53EF\u7528(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}`
      };
    }
    const daemon = await this.daemonStatus();
    const list = await this.adapterList();
    return {
      ok: true,
      bin: this.bin,
      version: version.stdout.trim().split("\n")[0] ?? null,
      daemon: daemon ?? null,
      adapterSites: list?.length ?? null
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
      ]
    };
  }
  async approvalSet(request) {
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
    if (typeof request.site !== "string" || request.site.trim().length === 0) return {
      ok: false,
      error: "site \u4E0D\u80FD\u4E3A\u7A7A"
    };
    if (typeof request.cron !== "string" || request.cron.trim().length === 0) return {
      ok: false,
      error: "cron \u4E0D\u80FD\u4E3A\u7A7A"
    };
    const id = String(Date.now());
    this.schedules.push({
      id,
      site: request.site.trim(),
      cron: request.cron.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return {
      ok: true,
      id
    };
  }
  async scheduleList() {
    return {
      ok: true,
      schedules: [
        ...this.schedules
      ]
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
      const out = await this.runOpencli([
        "browser",
        "dsh",
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
    const out = await this.runOpencli([
      "browser",
      "dsh",
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
    const out = await this.runOpencli([
      "browser",
      "dsh",
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
    const out = await this.runOpencli([
      "browser",
      "dsh",
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
      const out = await this.runOpencli([
        "browser",
        "dsh",
        ...argv
      ]);
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
        const a = exec.arguments ?? {};
        const argsOk = typeof a.adapter === "string" && typeof a.command === "string" && a.adapter.length > 0 && a.command.length > 0;
        if (this.automationMode === "read-only" && exec.name === "site" && argsOk) {
          const acc = await this.lookupAccess(a.adapter, a.command);
          if (acc !== "read") return {
            kind: "ask",
            reason: `\u53EA\u8BFB\u6A21\u5F0F\uFF1Asite ${String(a.adapter)} ${String(a.command)} \u4E3A\u5199\u64CD\u4F5C\uFF0C\u5DF2\u62E6\u622A\u3002`
          };
          return await next();
        }
        const needsAccess = exec.name === "site" && this.state.approval === "on" && argsOk && !this.state.disabled.includes(a.adapter);
        const access = needsAccess ? await this.lookupAccess(a.adapter, a.command) : "unknown";
        const decision = approvalDecision(this.state.approval === "on", this.state.disabled, exec.name, a.adapter, a.command, access);
        if (decision === "allow") return await next();
        const reason = decision === "ask-write" ? `site ${String(a.adapter)} ${String(a.command)} \u662F\u5199\u64CD\u4F5C\u2014\u2014\u4F1A\u5728\u4F60\u7684\u767B\u5F55\u6001\u6D4F\u89C8\u5668\u91CC\u771F\u5B9E\u6267\u884C(\u53D1\u5E16/\u70B9\u8D5E/\u4E0B\u5355/\u6539\u6570\u636E)\u3002` : `site ${String(a.adapter)} ${String(a.command)} \u672A\u80FD\u786E\u8BA4\u6743\u9650\u7C7B\u578B,\u6309\u5199\u64CD\u4F5C\u5BA1\u6279\u3002`;
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
  async runOpencli(argv, timeoutMs = 6e4, stdoutMaxBytes = 1048576) {
    await this.acquireGovernor();
    try {
      const spec = this.ctx.shell.resolve({
        command: [
          this.bin,
          ...argv
        ].join(" "),
        timeoutMs,
        stdoutMaxBytes
      });
      const r = await this.ctx.shell.run(spec);
      const out = {
        exitCode: r.exitCode ?? 1,
        stdout: r.stdout?.text ?? "",
        stderr: r.stderr?.text ?? ""
      };
      this.noteRateLimit(`${out.stdout}
${out.stderr}`);
      return out;
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
    } catch {
    }
  }
  async saveState() {
    try {
      await mkdir(join(homedir(), ".dsh"), {
        recursive: true
      });
      await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
    } catch {
    }
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
    const r = await this.runOpencli([
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
  OpencliService,
  index_default as default
};
