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
        switch(kind){
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
            metadata: metadata
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
            set = function(target, value) {
                if (arguments.length === 1) {
                    value = target;
                    target = this;
                }
                return originalSet.call(target, value);
            };
        }
        if (isPrivate) {
            ctx.access = get && set ? {
                get: get,
                set: set
            } : get ? {
                get: get
            } : {
                set: set
            };
        } else {
            var has = function(target) {
                return name in target;
            };
            ctx.access = get && set ? {
                has: has,
                get: get,
                set: set
            } : get ? {
                has: has,
                get: get
            } : {
                has: has,
                set: set
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
            if (value.get !== undefined) {
                assertCallable(value.get, "accessor.get");
            }
            if (value.set !== undefined) {
                assertCallable(value.set, "accessor.set");
            }
            if (value.init !== undefined) {
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
                        get: get,
                        set: set
                    };
                } else {
                    value = newValue;
                }
            }
        } else {
            for(var i = decs.length - 1; i >= 0; i--){
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
                            get: get,
                            set: set
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
                init = function(instance, init) {
                    return init;
                };
            } else if (typeof init !== "function") {
                var ownInitializers = init;
                init = function(instance, init) {
                    var value = init;
                    for(var i = 0; i < ownInitializers.length; i++)value = ownInitializers[i].call(instance, value);
                    return value;
                };
            } else {
                var originalInitializer = init;
                init = function(instance, init) {
                    return originalInitializer.call(instance, init);
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
        var existingProtoNonFields = new Map();
        var existingStaticNonFields = new Map();
        for(var i = 0; i < decInfos.length; i++){
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
                for(var i = 0; i < initializers.length; i++)initializers[i].call(instance);
                return instance;
            });
        }
    }
    function applyClassDecs(targetClass, classDecs, metadata) {
        if (classDecs.length > 0) {
            var initializers = [];
            var newClass = targetClass;
            var name = targetClass.name;
            for(var i = classDecs.length - 1; i >= 0; i--){
                var decoratorFinishedRef = {
                    v: false
                };
                var nextNewClass = classDecs[i](newClass, {
                    kind: "class",
                    name: name,
                    addInitializer: createAddInitializerMethod(initializers, decoratorFinishedRef),
                    metadata
                });
                decoratorFinishedRef.v = true;
                if (nextNewClass !== undefined) {
                    assertValidReturnValue(10, nextNewClass);
                    newClass = nextNewClass;
                }
            }
            return [
                defineMetadata(newClass, metadata),
                function() {
                    for(var i = 0; i < initializers.length; i++)initializers[i].call(newClass);
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
    _apply_decs_2203_r = function(targetClass, memberDecs, classDecs, parentClass) {
        if (parentClass !== void 0) {
            var parentMetadata = parentClass[Symbol.metadata || Symbol.for("Symbol.metadata")];
        }
        var metadata = Object.create(parentMetadata === void 0 ? null : parentMetadata);
        var e = applyMemberDecs(targetClass, memberDecs, metadata);
        if (!classDecs.length) defineMetadata(targetClass, metadata);
        return {
            e: e,
            get c () {
                return applyClassDecs(targetClass, classDecs, metadata);
            }
        };
    };
    return _apply_decs_2203_r(targetClass, memberDecs, classDecs, parentClass);
}
var _computedKey, _dec, _dec1, _dec2, _dec3, _dec4, _dec5, _dec6, _dec7, _dec8, _dec9, _dec10, _dec11, _dec12, _dec13, _dec14, _dec15, _dec16, _dec17, _dec18, _dec19, _dec20, _dec21, _dec22, _dec23, _dec24, _dec25, _dec26, _dec27, _dec28, _dec29, _initProto;
/**
 * dsh-opencli host 半:登录态浏览器代理。
 * - browser_* 工具族:包装 `opencli browser <session> …` 原语(open/state/click/type/fill/extract/screenshot/scroll/wait + browser_do 透传)
 * - site 工具:`opencli <adapter> <command> …` 适配器桥
 * - systemPrompt:适配器目录(缓存 + TTL)与使用要点
 * - TypertRemoteService RPC:status / adapters / refresh(面板用)
 * 全部调用经 ctx.shell;不打包 OpenCLI(doctor 缺失引导)。
 * @module dsh-opencli
 */ import { Service } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { approvalDecision, buildAdapterDirectory, commandAccess, normalizeAdapterList, parseDaemonStatus, sitesWithWhoami } from './parsers.js';
/** browser_do 允许透传的子命令白名单(其余高危命令不允许盲调)。 */ const BROWSER_DO_ALLOW = new Set([
    'analyze',
    'back',
    'bind',
    'check',
    'close',
    'console',
    'dblclick',
    'dialog',
    'drag',
    'eval',
    'find',
    'focus',
    'frames',
    'get',
    'hover',
    'init',
    'keys',
    'network',
    'select',
    'tab',
    'unbind',
    'uncheck',
    'upload',
    'verify'
]);
const OUTPUT_LIMIT = 16000;
const ADAPTER_TTL_MS = 60 * 60 * 1000;
const LOGIN_CHECK_TTL_MS = 10 * 60 * 1000;
const LOGIN_CHECK_CONCURRENCY = 3;
_computedKey = Service.init, _dec = Remote('status'), _dec1 = Remote('adapters'), _dec2 = Remote('refresh'), _dec3 = Remote('daemon-start'), _dec4 = Remote('settings'), _dec5 = Remote('approval-set'), _dec6 = Remote('adapter-disable'), _dec7 = Remote('login-check'), _dec8 = Remote('adapter-detail'), _dec9 = Remote('schedule-add'), _dec10 = Remote('schedule-list'), _dec11 = Remote('schedule-toggle'), _dec12 = Remote('schedule-remove'), _dec13 = Remote('try-run'), _dec14 = Remote('replay'), _dec15 = Remote('script-catalog'), _dec16 = Remote('script-run-builtin'), _dec17 = Remote('crawl'), _dec18 = Remote('script-validate'), _dec19 = Remote('userscript-run'), _dec20 = Remote('recipe-run'), _dec21 = Remote('automation-search'), _dec22 = Remote('automation-develop'), _dec23 = Remote('automation-run'), _dec24 = Remote('automation-mode-get'), _dec25 = Remote('automation-mode-set'), _dec26 = Remote('promote-recording'), _dec27 = Remote('install-opencli-skill'), _dec28 = Remote('rulepacks-list'), _dec29 = Remote('rulepacks-set');
export class OpencliService extends TypertRemoteService {
    static{
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
                "scheduleToggle"
            ],
            [
                _dec12,
                2,
                "scheduleRemove"
            ],
            [
                _dec13,
                2,
                "tryRun"
            ],
            [
                _dec14,
                2,
                "replay"
            ],
            [
                _dec15,
                2,
                "scriptCatalog"
            ],
            [
                _dec16,
                2,
                "scriptRunBuiltin"
            ],
            [
                _dec17,
                2,
                "crawl"
            ],
            [
                _dec18,
                2,
                "scriptValidate"
            ],
            [
                _dec19,
                2,
                "userscriptRun"
            ],
            [
                _dec20,
                2,
                "recipeRun"
            ],
            [
                _dec21,
                2,
                "automationSearch"
            ],
            [
                _dec22,
                2,
                "automationDevelop"
            ],
            [
                _dec23,
                2,
                "automationRun"
            ],
            [
                _dec24,
                2,
                "automationModeGet"
            ],
            [
                _dec25,
                2,
                "automationModeSet"
            ],
            [
                _dec26,
                2,
                "promoteRecording"
            ],
            [
                _dec27,
                2,
                "installOpencliSkill"
            ],
            [
                _dec28,
                2,
                "rulePacksList"
            ],
            [
                _dec29,
                2,
                "rulePacksSet"
            ]
        ], []));
    }
    static inject = [
        'shell',
        'tools',
        'systemPrompt'
    ];
    bin;
    adapterCache = (_initProto(this), null);
    lastShellError = null;
    state = {
        approval: 'on',
        disabled: []
    };
    statePath = join(homedir(), '.dsh', 'dsh-opencli-state.json');
    loginCache = null;
    // usagePolicy：与 anweat 对齐的限流（并发/突发/冷却），默认与 anweat 一致
    usagePolicy = {
        minDelayMs: 750,
        maxConcurrency: 2,
        burst: 3,
        cooldownMs: 30000,
        retryLimit: 2,
        maxPagesPerRun: 20,
        maxDepth: 2
    };
    callTimestamps = [];
    concurrent = 0;
    cooldownUntil = 0;
    queue = [];
    // 限域登录（与 anweat authProfiles 对齐）：按 profile 限 allowedDomains，默认只读不回写
    authProfiles = {
    };
    schedules = [];
    automationMode = 'standard';
    rulePacks = [];
    automationAssets = {
        persistenceMode: 'suggest',
        activationMode: 'manual'
    };
    constructor(ctx){
        super(ctx, 'opencli');
        this.bin = this.resolveBin();
        void this.loadState();
    }
    resolveBin() {
        if (process.env.DSH_OPENCLI_BIN !== undefined && process.env.DSH_OPENCLI_BIN.length > 0) return process.env.DSH_OPENCLI_BIN;
        // 优先插件本地依赖（与 anweat 同策略：本地优先/全局复用）
        try {
            // @ts-ignore - optional peer
            const pkg = require.resolve('@jackwener/opencli/package.json');
            const bin = join(dirname(pkg), 'dist', 'src', 'main.js');
            if (existsSync(bin)) return `node ${bin}`;
        } catch  {}
        return 'opencli';
    }
    async [_computedKey]() {
        this.registerBrowserTools();
        this.registerAdvancedTools();
        this.registerSiteTool();
        this.registerApprovalGate();
        void this.injectSystemPrompt();
        // 兼容 anweat 生态：其他插件 inject: ['browser'] 时共用本服务。
        // 不能把带 typertRemote 的原始实例直接 provide：网关遍历 ctx.reflect.props 时,
        // 'browser' 条目会在 namespace 过滤前走 readBinding,serviceKey('browser')≠绑定
        // 里的 'opencli' 直接抛 inconsistent binding。改为提供绑定方法的无门面副本
        // (无 typertRemote 属性,网关扫描时被自然跳过)。
        try {
            const proto = Object.getPrototypeOf(this);
            const facade = {};
            for (const key of Object.getOwnPropertyNames(proto)){
                if (key === 'constructor') continue;
                const d = Object.getOwnPropertyDescriptor(proto, key);
                if (d !== undefined && typeof d.value === 'function') facade[key] = d.value.bind(this);
            }
            Object.defineProperty(facade, 'typertRemote', {
                get: ()=>undefined
            });
            this.ctx.provide('browser', facade);
        } catch  {}
    }
    // ── 模型工具 ──────────────────────────────────────────────
    registerBrowserTools() {
        const t = this.ctx.tools;
        const run = async (session, argv)=>{
            const out = await this.runOpencli([
                'browser',
                session ?? 'dsh',
                ...argv
            ]);
            return {
                text: this.renderOut(out)
            };
        };
        const s = '浏览器会话名(默认 dsh;bind 过的会话复用登录态)';
        t.register(defineTool({
            name: 'browser_open',
            description: '在用户已登录的真实 Chrome 中打开 URL(daemon+扩展桥接,登录态天然可用)',
            parameters: {
                url: {
                    type: 'string',
                    description: '要打开的完整 URL'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'open',
                    String(a.url)
                ])
        }));
        t.register(defineTool({
            name: 'browser_state',
            description: '获取当前页状态快照:URL、标题、带 [N] 索引的交互元素清单——后续 click/type/fill 的 target 直接用 [N] 索引或文本',
            parameters: {
                session: {
                    type: 'string',
                    description: s
                },
                source: {
                    type: 'string',
                    enum: [
                        'dom',
                        'ax'
                    ],
                    description: '快照后端,默认 dom;ax 为无障碍树'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'state',
                    ...a.source !== undefined ? [
                        '--source',
                        a.source
                    ] : []
                ])
        }));
        t.register(defineTool({
            name: 'browser_click',
            description: '点击元素。target 用 browser_state 里的 [N] 索引(如 "12")或可见文本/CSS',
            parameters: {
                target: {
                    type: 'string',
                    description: '[N] 索引 / 文本 / CSS 选择器'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'click',
                    String(a.target)
                ])
        }));
        t.register(defineTool({
            name: 'browser_type',
            description: '点击元素并输入文本(适合搜索框等)',
            parameters: {
                target: {
                    type: 'string',
                    description: '[N] 索引 / 文本 / CSS'
                },
                text: {
                    type: 'string',
                    description: '要输入的内容'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'type',
                    String(a.target),
                    String(a.text)
                ])
        }));
        t.register(defineTool({
            name: 'browser_fill',
            description: '精确设置输入框内容并校验(不清除其他字段)',
            parameters: {
                target: {
                    type: 'string',
                    description: '[N] 索引 / 文本 / CSS'
                },
                text: {
                    type: 'string',
                    description: '要设置的值'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'fill',
                    String(a.target),
                    String(a.text)
                ])
        }));
        t.register(defineTool({
            name: 'browser_extract',
            description: '把当前页正文提取为 Markdown(长页自动分段),适合读文章/帖子/文档',
            parameters: {
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'extract'
                ])
        }));
        t.register(defineTool({
            name: 'browser_screenshot',
            description: '对当前页截图保存到本地路径(仅在确需视觉信息时使用,优先 browser_state/extract)',
            parameters: {
                path: {
                    type: 'string',
                    description: '保存路径(绝对路径)'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'screenshot',
                    ...a.path !== undefined ? [
                        a.path
                    ] : []
                ])
        }));
        t.register(defineTool({
            name: 'browser_scroll',
            description: '滚动页面(up/down/left/right)',
            parameters: {
                direction: {
                    type: 'string',
                    enum: [
                        'up',
                        'down',
                        'left',
                        'right'
                    ],
                    description: '滚动方向,默认 down'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'scroll',
                    a.direction ?? 'down'
                ])
        }));
        t.register(defineTool({
            name: 'browser_wait',
            description: '等待条件成立:selector(如 ".loaded") / text / time(秒) / xhr(如 "/api/search") / download(文件名)',
            parameters: {
                type: {
                    type: 'string',
                    enum: [
                        'selector',
                        'text',
                        'time',
                        'xhr',
                        'download'
                    ],
                    description: '等待类型'
                },
                value: {
                    type: 'string',
                    description: '对应的值'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'wait',
                    String(a.type),
                    ...a.value !== undefined ? [
                        a.value
                    ] : []
                ])
        }));
        t.register(defineTool({
            name: 'browser_do',
            description: `opencli browser 通用子命令透传(白名单:${[
                ...BROWSER_DO_ALLOW
            ].join(' ')})。常用:analyze(侦察站点反爬/API)、init(生成适配器脚手架)、verify(验证适配器)、tab/find/network/keys/select/hover 等`,
            parameters: {
                command: {
                    type: 'string',
                    description: `子命令,允许值:${[
                        ...BROWSER_DO_ALLOW
                    ].join('|')}`
                },
                args: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: '子命令参数(按 opencli browser 文档顺序)'
                },
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const cmd = String(a.command);
                if (!BROWSER_DO_ALLOW.has(cmd)) return {
                    text: `不允许的子命令:${cmd}(白名单见工具说明)`
                };
                return run(a.session, [
                    cmd,
                    ...a.args ?? []
                ]);
            }
        }));
        t.register(defineTool({
            name: 'browser_close',
            description: '释放当前浏览器会话的 tab 租约（对应 opencli browser <session> close）',
            parameters: {
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'close'
                ])
        }));
        t.register(defineTool({
            name: 'browser_read',
            description: '读当前页 URL/标题/正文（browser_extract 别名，适合公开网页快速读取）',
            parameters: {
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>run(a.session, [
                    'extract'
                ])
        }));
        t.register(defineTool({
            name: 'browser_status',
            description: '运行时状态：daemon/扩展/适配器数/限流与审批策略（先调它再选工具）',
            parameters: {
                session: {
                    type: 'string',
                    description: s
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async ()=>{
                const st = await this.status();
                return {
                    text: JSON.stringify(st, null, 2).slice(0, 4000)
                };
            }
        }));
        t.register(defineTool({
            name: 'browser_install',
            description: '环境自检：daemon/扩展/opencli 三件套缺谁补谁（daemon 未跑给 restart 命令，扩展未连给安装指引）',
            parameters: {},
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async ()=>{
                const st = await this.status();
                if (st.ok && st.daemon?.running === true) return {
                    text: '环境就绪：daemon 运行中，扩展已连接，无需安装。'
                };
                return {
                    text: `环境缺失：${st.error ?? 'daemon 未运行'}。请先 npm i -g @jackwener/opencli，再 opencli daemon restart，并到 https://github.com/jackwener/opencli/releases 装 BrowserBridge 扩展。`
                };
            }
        }));
        t.register(defineTool({
            name: 'opencli_status',
            description: 'OpenCLI 连接检查：实际跑 doctor，报告 daemon/extension/profile 连通性（不要只看开关，看这个）',
            parameters: {},
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async ()=>{
                const st = await this.status();
                return {
                    text: JSON.stringify(st, null, 2).slice(0, 4000)
                };
            }
        }));
        t.register(defineTool({
            name: 'opencli_catalog',
            description: '按 query/site/access 过滤 170+ 适配器目录，单次最多 100 条（不确定命令先查它，别猜）',
            parameters: {
                query: {
                    type: 'string',
                    description: '关键词（如 search）'
                },
                site: {
                    type: 'string',
                    description: '站点名（如 reddit）'
                },
                access: {
                    type: 'string',
                    enum: [
                        'read',
                        'write'
                    ],
                    description: '权限过滤'
                },
                limit: {
                    type: 'string',
                    description: '返回条数，默认 10，最大 100'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const list = await this.adapterList();
                if (list === null) return {
                    text: `opencli list 不可用 | ${this.lastShellError ?? '未知'}`
                };
                const q = a.command !== undefined ? String(a.command).toLowerCase() : '';
                const site = a.adapter !== undefined ? String(a.adapter).toLowerCase() : '';
                const filtered = list.filter((x)=>(q.length === 0 || x.name.toLowerCase().includes(q)) && (site.length === 0 || x.name.toLowerCase().includes(site))).slice(0, 100);
                return {
                    text: JSON.stringify(filtered.slice(0, 10), null, 2).slice(0, 4000) + `\n…共 ${filtered.length} 条`
                };
            }
        }));
        t.register(defineTool({
            name: 'opencli_run',
            description: '通用 OpenCLI argv 网关（除 unrestricted 外走审批；常规搜索优先 site 直调）',
            parameters: {
                args: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'argv 数组（如 ["reddit","search","DeepSeek Harness"]），不拼 shell'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const argv = Array.isArray(a.args) ? a.args.map(String) : [];
                if (argv.length === 0) return {
                    text: 'args 为空'
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
        const out = (text)=>({
                text
            });
        t.register(defineTool({
            name: 'script_catalog',
            description: '列出内置只读脚本 article/links/jsonld/forms（不跑外来代码，读文章最稳）',
            parameters: {},
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async ()=>out('内置只读脚本：article（正文Markdown）/ links（链接）/ jsonld / forms，用 script_run_builtin 运行')
        }));
        t.register(defineTool({
            name: 'script_run_builtin',
            description: '运行内置只读脚本（独立 context，不执行外来代码）',
            parameters: {
                name: {
                    type: 'string',
                    description: 'article|links|jsonld|forms'
                },
                url: {
                    type: 'string',
                    description: '目标 URL（可选，默认当前页）'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.scriptRunBuiltin({
                    name: String(a.command ?? a.value ?? 'article'),
                    url: a.url !== undefined ? String(a.url) : undefined
                });
                return out(r.result ?? r.error ?? 'ok');
            }
        }));
        t.register(defineTool({
            name: 'script_validate',
            description: '校验外部 UserScript（需 @match + @grant none，≤64KB），不执行',
            parameters: {
                code: {
                    type: 'string',
                    description: 'UserScript 源码'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.scriptValidate({
                    code: String(a.text ?? '')
                });
                return out(JSON.stringify(r).slice(0, 2000));
            }
        }));
        t.register(defineTool({
            name: 'userscript_run',
            description: '运行外部 UserScript（强制域名匹配，standard 需审批，unrestricted 直行）',
            parameters: {
                code: {
                    type: 'string',
                    description: '已 validate 通过的源码'
                },
                url: {
                    type: 'string',
                    description: '目标 URL'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.userscriptRun({
                    code: String(a.text ?? ''),
                    url: String(a.url ?? '')
                });
                return out(r.result ?? r.error ?? 'ok');
            }
        }));
        t.register(defineTool({
            name: 'recipe_run',
            description: '跑 25 步内 Playwright Recipe（wait/click/fill/type/press/select/check/hover/scroll/extract/assert/screenshot，可审计）',
            parameters: {
                steps: {
                    type: 'string',
                    description: 'JSON 数组字符串'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                try {
                    const steps = JSON.parse(String(a.text ?? a.value ?? '[]'));
                    const r = await this.recipeRun({
                        steps
                    });
                    return out(r.ok ? 'recipe 执行成功' : r.error ?? '失败');
                } catch (e) {
                    return out(`steps 解析失败：${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }));
        t.register(defineTool({
            name: 'automation_search',
            description: '检索已存自动化资产（录制/定时），只回 ID+摘要，不进全文',
            parameters: {
                query: {
                    type: 'string',
                    description: '关键词'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.automationSearch({
                    query: a.text !== undefined ? String(a.text) : undefined
                });
                return out(JSON.stringify(r.hits).slice(0, 2000));
            }
        }));
        t.register(defineTool({
            name: 'automation_run',
            description: '按 ID 运行已存资产（录制/定时），限域+限流仍生效',
            parameters: {
                id: {
                    type: 'string',
                    description: '资产 ID'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.automationRun({
                    id: String(a.value ?? a.text ?? '')
                });
                return out(r.ok ? '执行成功' : r.error ?? '失败');
            }
        }));
        t.register(defineTool({
            name: 'browser_crawl',
            description: '有限广度遍历（同源默认，maxPages 20 / maxDepth 2 硬限，usagePolicy 限流）',
            parameters: {
                url: {
                    type: 'string',
                    description: '起始 URL'
                },
                maxPages: {
                    type: 'string',
                    description: '最大页数，默认 20'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const r = await this.crawl({
                    url: String(a.url ?? ''),
                    maxPages: Number(a.value ?? 20)
                });
                return out(r.ok ? 'crawl 已启动（MVP 单页）' : r.error ?? '失败');
            }
        }));
    }
    registerSiteTool() {
        this.ctx.tools.register(defineTool({
            name: 'site',
            description: '调用站点适配器(在用户登录态上返回结构化结果,比逐页点击快且稳)。adapter/command 见 systemPrompt 里的适配器目录;示例:site bilibili search 关键词=罗翔。authProfile 限域（需配置 allowedDomains）',
            parameters: {
                adapter: {
                    type: 'string',
                    description: '适配器名(如 bilibili/zhihu/arxiv)'
                },
                command: {
                    type: 'string',
                    description: '适配器子命令(如 search/hot/top)'
                },
                args: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: '子命令参数'
                },
                authProfile: {
                    type: 'string',
                    description: '限域登录态 profile（需在配置中预设 allowedDomains，默认不回写 Cookie）'
                }
            },
            output: {
                schema: {
                    type: 'json'
                },
                render: (_a, v)=>[
                        {
                            type: 'text',
                            text: v.text
                        }
                    ]
            },
            execute: async (a)=>{
                const adapter = String(a.adapter);
                const command = String(a.command);
                if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) {
                    return {
                        text: `非法 adapter/command:${adapter} ${command}`
                    };
                }
                if (this.state.disabled.includes(adapter)) {
                    return {
                        text: `适配器 ${adapter} 已被禁用(设置→浏览器代理 可重新启用)。`
                    };
                }
                const domain = await this.domainOf(adapter);
                const authErr = this.checkAuthProfile(domain, a.authProfile !== undefined ? String(a.authProfile) : undefined);
                if (authErr !== null) return {
                    text: authErr
                };
                const out = await this.runOpencli([
                    adapter,
                    command,
                    ...a.args ?? []
                ]);
                const text = this.renderOut(out);
                if (text.trim() === '[]') return {
                    text: `适配器 ${adapter} 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 ${adapter}，或运行 \`opencli ${adapter} login\` 后用面板“巡检登录态”确认。`
                };
                if (out.exitCode !== 0 && /Navigation rejected/i.test(text)) return {
                    text: `导航被拒（${adapter}）：请确认 Chrome 扩展已连接且已登录 ${adapter}，或先 \`opencli ${adapter} login\`。原错：${text.slice(0, 300)}`
                };
                return {
                    text
                };
            }
        }));
    }
    // ── systemPrompt:适配器目录(缓存 + TTL,组装时取最新) ─────
    directoryText = '浏览器代理(dsh-opencli):适配器目录加载中。';
    async injectSystemPrompt() {
        this.ctx.systemPrompt.section({
            name: 'opencli-proxy',
            order: 150,
            text: ()=>this.directoryText
        });
        void this.updateDirectory();
    }
    async updateDirectory() {
        const list = await this.adapterList();
        if (list === null) {
            this.directoryText = '浏览器代理(dsh-opencli):未检测到可用的 opencli(browser_*/site 工具会失败)。请用户在设置→浏览器代理 运行诊断,或安装 OpenCLI(OpenCLIApp / npm i -g @jackwener/opencli)。';
            return;
        }
        const active = list.filter((a)=>!this.state.disabled.includes(a.name));
        const daemon = await this.daemonStatus();
        const state = daemon !== null && daemon.running ? `daemon 运行中(扩展 ${daemon.extension ?? '?'})` : 'daemon 未运行——browser_* 需要它:可在 dsh 设置→浏览器代理 一键启动,或 opencli daemon restart';
        const gate = this.state.approval === 'on' ? 'site 的 write 命令会先请求用户审批。' : '审批门已关闭(write 命令直接执行)。';
        this.directoryText = `浏览器代理(dsh-opencli):你在 Chrome 里登录的网站,dsh 都能用。170+ 站点适配器(知乎/B站/微博/arxiv/github/...),用 site <适配器> <命令>。

按用户原话选:
- "知乎热榜前10" / "B站搜热榜" / "微博热搜"   → site zhihu hot / site bilibili search
- "打开这个网页"     → browser_open url → browser_state(拿 [N] 索引)
- "GitHub 找 X" / "arxiv 找 agent"  → site github search X / site arxiv search agent
- "在微博发..."     → site weibo post...(写命令会弹审批,用户点允许才发)
- "录一段:抓 arxiv 每天 AI 论文"   → 引导用户点"开始录" → 真实 Chrome 操作

不要:写命令不在用户登录态时跑(先 opencli <site> login);cookie/密码不放工具参数。${state}。${gate}\n${buildAdapterDirectory(active)}`;
    }
    // ── RPC(面板) ────────────────────────────────────────────
    async status() {
        const version = await this.runOpencli([
            '--version'
        ]);
        if (version.exitCode !== 0) {
            return {
                ok: false,
                bin: null,
                version: null,
                daemon: null,
                adapterSites: null,
                error: `opencli 不可用(${this.bin}):${version.stderr.slice(0, 300) || version.stdout.slice(0, 300)}`
            };
        }
        const daemon = await this.daemonStatus();
        const list = await this.adapterList();
        return {
            ok: true,
            bin: this.bin,
            version: version.stdout.trim().split('\n')[0] ?? null,
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
            error: `opencli list 不可用 | ${this.lastShellError ?? '未知'}`
        };
        const marked = list.map((a)=>({
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
    /** daemon 未运行时由面板一键拉起;已在运行则不动作(避免干扰在用的桥接)。 */ async daemonStart() {
        const before = await this.daemonStatus();
        if (before?.running === true) return {
            ok: true,
            started: false,
            message: 'daemon 已在运行'
        };
        const r = await this.runOpencli([
            'daemon',
            'restart'
        ], 30000);
        const after = await this.daemonStatus();
        if (r.exitCode !== 0 && after?.running !== true) {
            return {
                ok: false,
                started: false,
                message: `启动失败(退出码 ${r.exitCode}):${clip(r.stderr || r.stdout, 300)}`
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
            approvalOn: this.state.approval === 'on',
            disabled: [
                ...this.state.disabled
            ]
        };
    }
    async approvalSet(request) {
        this.state.approval = request.enabled ? 'on' : 'off';
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
    /** 登录态巡检:对有 whoami 命令的站点并发探测(限流+10min 缓存)。 */ async loginCheck() {
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
                error: this.lastShellError ?? 'opencli list 不可用'
            };
        }
        const sites = sitesWithWhoami(this.adapterCache?.json);
        if (sites.length === 0) return {
            ...empty,
            error: '没有带 whoami 命令的适配器'
        };
        const results = await this.runPool(sites, LOGIN_CHECK_CONCURRENCY, async (site)=>{
            try {
                const r = await this.runOpencli([
                    site,
                    'whoami'
                ], 45000, 65536);
                const text = `${r.stdout}\n${r.stderr}`.trim();
                const notLoggedIn = r.exitCode !== 0 || /^ok:\s*false/m.test(text) || /AUTH_REQUIRED|^logged_in:\s*false/m.test(text);
                const meaningful = text.split('\n').find((l)=>/message:|screen_name|^user/.test(l)) ?? text.split('\n').find((l)=>l.trim().length > 0) ?? '';
                return {
                    site,
                    ok: !notLoggedIn,
                    timedOut: false,
                    detail: clip(meaningful.trim(), 120) || null
                };
            } catch  {
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
            checkedAt: new Date().toISOString(),
            results
        };
        this.loginCache = {
            at: Date.now(),
            results: value
        };
        return value;
    }
    /** 单个适配器的完整命令详情(从缓存的原始 list JSON 过滤,面板展开时按需拉取)。 */ async adapterDetail(request) {
        const empty = {
            ok: false,
            name: request.name,
            domain: null,
            commands: []
        };
        if (this.adapterCache === null) {
            // 面板冷启动后第一次展开:先触发一次缓存装载
            const list = await this.adapterList();
            if (list === null) return {
                ...empty,
                error: this.lastShellError ?? 'opencli list 不可用'
            };
        }
        const raw = this.adapterCache?.json;
        if (!Array.isArray(raw)) return {
            ...empty,
            error: '缓存无原始数据'
        };
        const commands = [];
        let domain = null;
        for (const e of raw){
            if (e === null || typeof e !== 'object' || e.site !== request.name) continue;
            if (domain === null && typeof e.domain === 'string' && e.domain !== 'null') domain = e.domain;
            const args = Array.isArray(e.args) ? e.args.length : 0;
            commands.push({
                name: typeof e.name === 'string' ? e.name : String(e.command ?? ''),
                description: typeof e.description === 'string' ? e.description : '',
                access: typeof e.access === 'string' ? e.access : 'read',
                example: typeof e.example === 'string' ? e.example : undefined,
                argCount: args
            });
        }
        if (commands.length === 0) return {
            ...empty,
            error: `未找到适配器:${request.name}`
        };
        commands.sort((a, b)=>a.name.localeCompare(b.name));
        return {
            ok: true,
            name: request.name,
            domain,
            commands
        };
    }
    async scheduleAdd(request) {
        if (typeof request.site !== 'string' || request.site.trim().length === 0) return {
            ok: false,
            error: 'site 不能为空'
        };
        if (typeof request.cron !== 'string' || request.cron.trim().length === 0) return {
            ok: false,
            error: 'cron 不能为空'
        };
        const id = String(Date.now());
        this.schedules.push({
            id,
            site: request.site.trim(),
            cron: request.cron.trim(),
            createdAt: new Date().toISOString(),
            enabled: true
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
    async scheduleToggle(request) {
        const hit = this.schedules.find((s)=>s.id === String(request.id ?? ''));
        if (hit === undefined) return {
            ok: false,
            error: '未找到'
        };
        hit.enabled = request.enabled !== false;
        return {
            ok: true
        };
    }
    async scheduleRemove(request) {
        const i = this.schedules.findIndex((s)=>s.id === String(request.id ?? ''));
        if (i < 0) return {
            ok: false,
            error: '未找到'
        };
        this.schedules.splice(i, 1);
        return {
            ok: true
        };
    }
    async tryRun(request) {
        const line = String(request.line ?? '').trim();
        if (!line) return {
            ok: false,
            error: '命令为空'
        };
        const [head, ...rest] = line.split(/\s+/);
        if (head !== 'site' || rest.length < 2) return {
            ok: false,
            error: '只支持 site <适配器> <命令> [参数...]，如：site arxiv recent cs.AI'
        };
        const [adapter, command, ...args] = rest;
        if (!/^[\w@.-]+$/.test(adapter) || !/^[\w-]+$/.test(command)) return {
            ok: false,
            error: `非法 adapter/command:${adapter} ${command}`
        };
        if (this.state.disabled.includes(adapter)) return {
            ok: false,
            error: `适配器 ${adapter} 已被禁用`
        };
        const out = await this.runOpencli([
            adapter,
            command,
            ...args
        ]);
        const text = this.renderOut(out);
        if (out.exitCode !== 0) return {
            ok: false,
            error: text
        };
        if (text.trim() === '[]') return {
            ok: false,
            error: `适配器 ${adapter} 返回空（可能未登录或无数据）。请先在真实 Chrome 登录 ${adapter}，或运行 \`opencli ${adapter} login\` 后用面板“巡检登录态”确认。`
        };
        return {
            ok: true,
            text
        };
    }
    async replay(request) {
        const step = typeof request.step === 'string' ? request.step.trim() : '';
        if (step.length === 0) return {
            ok: false,
            error: 'step 为空'
        };
        // MVP：仅回显步骤，真实回放走 site/browser_* 透传（与 client 的 localStorage 录制互补）
        const [head, ...rest] = step.split(' ');
        if (head === 'site' && rest.length >= 2) {
            const [adapter, command, ...args] = rest;
            if (adapter !== undefined && command !== undefined) {
                const out = await this.runOpencli([
                    adapter,
                    command,
                    ...args
                ]);
                return {
                    ok: out.exitCode === 0,
                    error: out.exitCode !== 0 ? this.renderOut(out) : undefined
                };
            }
        }
        if (head.startsWith('browser_')) {
            const out = await this.runOpencli([
                'browser',
                'dsh',
                head.replace('browser_', ''),
                ...rest
            ]);
            return {
                ok: out.exitCode === 0,
                error: out.exitCode !== 0 ? this.renderOut(out) : undefined
            };
        }
        return {
            ok: false,
            error: `未知步骤:${step}`
        };
    }
    // L3 高级自动化：脚本/配方/泛爬（对齐 anweat 21 工具，MVP 桩 + 透传）
    async scriptCatalog() {
        return {
            ok: true,
            scripts: [
                {
                    name: 'article',
                    sha256: 'builtin-article',
                    description: '只读：提取正文为 Markdown'
                },
                {
                    name: 'links',
                    sha256: 'builtin-links',
                    description: '只读：提取页面链接'
                },
                {
                    name: 'jsonld',
                    sha256: 'builtin-jsonld',
                    description: '只读：提取 JSON-LD'
                },
                {
                    name: 'forms',
                    sha256: 'builtin-forms',
                    description: '只读：提取表单结构'
                }
            ]
        };
    }
    async scriptRunBuiltin(request) {
        const name = String(request.name ?? '');
        if (![
            'article',
            'links',
            'jsonld',
            'forms'
        ].includes(name)) return {
            ok: false,
            error: `未知内置脚本:${name}`
        };
        // 透传为 browser extract 变体
        const out = await this.runOpencli([
            'browser',
            'dsh',
            'extract',
            ...request.url !== undefined ? [
                request.url
            ] : []
        ]);
        return {
            ok: out.exitCode === 0,
            result: this.renderOut(out),
            error: out.exitCode !== 0 ? this.renderOut(out) : undefined
        };
    }
    async crawl(request) {
        const url = String(request.url ?? '').trim();
        if (url.length === 0) return {
            ok: false,
            error: 'url 为空'
        };
        const maxPages = Math.min(Number(request.maxPages ?? 20), this.usagePolicy.maxPagesPerRun ?? 20);
        // MVP：单页提取，真实广度遍历后续接 browser_crawl
        const out = await this.runOpencli([
            'browser',
            'dsh',
            'open',
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
        const code = String(request.code ?? '');
        if (!code.includes('@match') || !code.includes('@grant none')) return {
            ok: false,
            error: '需包含 @match + @grant none'
        };
        if (code.length > 64 * 1024) return {
            ok: false,
            error: '源码 >64KB'
        };
        const m = code.match(/@match\s+(\S+)/)?.[1] ?? '';
        return {
            ok: true,
            meta: {
                name: code.match(/@name\s+(.+)/)?.[1]?.trim() ?? 'unnamed',
                match: m,
                grant: 'none'
            }
        };
    }
    async userscriptRun(request) {
        const v = await this.scriptValidate({
            code: String(request.code ?? '')
        });
        if (!v.ok) return {
            ok: false,
            error: v.error
        };
        if (this.automationMode !== 'unrestricted') return {
            ok: false,
            error: '需 unrestricted 模式或审批（当前 ' + this.automationMode + '）'
        };
        const out = await this.runOpencli([
            'browser',
            'dsh',
            'eval',
            String(request.code ?? '').slice(0, 200)
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
            error: 'steps 1-25'
        };
        for (const s of steps){
            const t = String(s.type ?? '');
            if (![
                'wait',
                'click',
                'fill',
                'type',
                'press',
                'select',
                'check',
                'hover',
                'scroll',
                'extract',
                'assert',
                'screenshot'
            ].includes(t)) return {
                ok: false,
                error: `未知步骤:${t}`
            };
            // MVP：逐条透传为 browser_*（抽取/点击等）
            const sel = s.selector !== undefined ? String(s.selector) : undefined;
            const val = s.value !== undefined ? String(s.value) : undefined;
            const argv = [
                t,
                ...sel !== undefined ? [
                    sel
                ] : [],
                ...val !== undefined ? [
                    val
                ] : []
            ];
            const out = await this.runOpencli([
                'browser',
                'dsh',
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
        const q = String(request.query ?? '').toLowerCase();
        const hits = this.schedules.filter((s)=>s.site.toLowerCase().includes(q) || q.length === 0).slice(0, 5).map((s)=>({
                id: s.id,
                name: s.site
            }));
        return {
            ok: true,
            hits
        };
    }
    async automationDevelop(request) {
        if (request.action === 'get' && typeof request.id === 'string') {
            const hit = this.schedules.find((s)=>s.id === request.id);
            return hit !== undefined ? {
                ok: true
            } : {
                ok: false,
                error: '未找到'
            };
        }
        if (request.action === 'save') return {
            ok: true
        };
        if (request.action === 'validate') return {
            ok: true
        };
        if (request.action === 'test') return {
            ok: true
        };
        return {
            ok: false,
            error: `未知 action:${String(request.action)}`
        };
    }
    async automationRun(request) {
        const hit = this.schedules.find((s)=>s.id === String(request.id ?? ''));
        if (hit === undefined) return {
            ok: false,
            error: '未找到'
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
        const m = String(request.mode ?? '');
        if (![
            'read-only',
            'standard',
            'autonomous',
            'unrestricted'
        ].includes(m)) return {
            ok: false,
            error: `未知模式:${m}`
        };
        this.automationMode = m;
        return {
            ok: true
        };
    }
    async promoteRecording(request) {
        const name = String(request.name ?? '').trim();
        if (!name) return {
            ok: false,
            error: 'name 必填'
        };
        if (!Array.isArray(request.steps) || request.steps.length === 0) return {
            ok: false,
            error: 'steps 必填'
        };
        const id = `rec-${Date.now()}`;
        const recipe = {
            kind: 'recipe',
            id,
            name,
            status: 'draft',
            revision: 1,
            domains: [],
            tags: [
                'auto-promoted'
            ],
            inputNames: [],
            createdAt: new Date().toISOString(),
            source: 'recording',
            originalSteps: request.steps
        };
        return {
            ok: true,
            recipeId: id
        };
    }
    async installOpencliSkill() {
        // 写 ~\.dsh\opencli-skill-inbox.md 让 dsh 助手读
        const path = `${homedir()}\\.dsh\\opencli-skill-inbox.md`;
        const body = [
            '# opencli-skill 装清单',
            '',
            '1. 找到 opencli 仓的 skills 目录:',
            '   `~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/`',
            '2. 把它复制到 dsh 技能目录:',
            '   `cp -r ~/.vfox/sdks/nodejs/node_modules/@jackwener/opencli/skills/* ~/.dsh/skills/`',
            '3. 重启 dsh web',
            '4. 验证:在 dsh 对话框说"加载 opencli-usage skill"',
            '',
            '完成后:你（dsh 助手）即可调用 opencli 的 6 个 skill（adapter-author / autofix / browser / browser-sitemap / sitemap-author / usage）'
        ].join('\n');
        try {
            const { writeFile, mkdir } = await import('node:fs/promises');
            await mkdir(`${homedir()}\\.dsh`, {
                recursive: true
            });
            await writeFile(path, body, 'utf8');
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
            error: 'packs 需为数组'
        };
        for (const p of request.packs){
            if (typeof p.initScriptSha256 !== 'string' || String(p.initScriptSha256).length !== 64) return {
                ok: false,
                error: 'initScriptSha256 需 64 位'
            };
            const s = p.initScriptPath;
            if (typeof s !== 'string' || s.length === 0) return {
                ok: false,
                error: 'initScriptPath 不能为空'
            };
        }
        this.rulePacks = request.packs;
        return {
            ok: true
        };
    }
    /** R1 审批门:site 的 write 命令(发帖/点赞/下单等)先经 dsh 原生审批(ask→allowed-once)。
   * 任何异常一律放行给 next(),绝不因审批门自身故障阻塞工具。 */ registerApprovalGate() {
        this.ctx.on('tools/pre-execute', async (exec, next)=>{
            try {
                if (this.automationMode === 'unrestricted') return await next();
                const a = exec.arguments ?? {};
                const argsOk = typeof a.adapter === 'string' && typeof a.command === 'string' && a.adapter.length > 0 && a.command.length > 0;
                if (this.automationMode === 'read-only' && exec.name === 'site' && argsOk) {
                    const acc = await this.lookupAccess(a.adapter, a.command);
                    if (acc !== 'read') return {
                        kind: 'ask',
                        reason: `只读模式：site ${String(a.adapter)} ${String(a.command)} 为写操作，已拦截。`
                    };
                    return await next();
                }
                // 只在确有可能 ask 时才付出缓存查询成本;其余情况 access 传占位值,判定函数自会放行
                const needsAccess = exec.name === 'site' && this.state.approval === 'on' && argsOk && !this.state.disabled.includes(a.adapter);
                const access = needsAccess ? await this.lookupAccess(a.adapter, a.command) : 'unknown';
                const decision = approvalDecision(this.state.approval === 'on', this.state.disabled, exec.name, a.adapter, a.command, access);
                if (decision === 'allow') return await next();
                const reason = decision === 'ask-write' ? `site ${String(a.adapter)} ${String(a.command)} 是写操作——会在你的登录态浏览器里真实执行(发帖/点赞/下单/改数据)。` : `site ${String(a.adapter)} ${String(a.command)} 未能确认权限类型,按写操作审批。`;
                return {
                    kind: 'ask',
                    reason
                };
            } catch  {
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
        // 冷却期
        const now = Date.now();
        if (now < this.cooldownUntil) await new Promise((res)=>setTimeout(res, this.cooldownUntil - now));
        // 并发
        if (this.concurrent >= this.usagePolicy.maxConcurrency) {
            await new Promise((res)=>{
                this.queue.push(res);
            });
        }
        this.concurrent++;
        // 突发 + minDelay
        const burstWindow = 1000;
        this.callTimestamps = this.callTimestamps.filter((t)=>Date.now() - t < burstWindow);
        if (this.callTimestamps.length >= this.usagePolicy.burst) {
            const oldest = this.callTimestamps[0] ?? 0;
            const wait = burstWindow - (Date.now() - oldest);
            if (wait > 0) await new Promise((res)=>setTimeout(res, wait));
        }
        const last = this.callTimestamps[this.callTimestamps.length - 1];
        if (last !== undefined) {
            const delay = this.usagePolicy.minDelayMs - (Date.now() - last);
            if (delay > 0) await new Promise((res)=>setTimeout(res, delay));
        }
    }
    releaseGovernor() {
        this.concurrent = Math.max(0, this.concurrent - 1);
        this.callTimestamps.push(Date.now());
        const next = this.queue.shift();
        if (next !== undefined) next();
    }
    noteRateLimit(text) {
        if (/429|502|503|504|Retry-After/i.test(text)) this.cooldownUntil = Date.now() + this.usagePolicy.cooldownMs;
    }
    async domainOf(adapter) {
        const list = await this.adapterList();
        const hit = list?.find((a)=>a.name === adapter);
        return hit?.domain ?? null;
    }
    checkAuthProfile(domain, authProfile) {
        if (authProfile === undefined || authProfile.length === 0) return null;
        const prof = this.authProfiles[authProfile];
        if (prof === undefined) return `未知 authProfile:${authProfile}`;
        if (domain === null || domain === 'null' || domain === 'localhost' || domain === '127.0.0.1') return null;
        if (!prof.allowedDomains.some((d)=>domain === d || domain.endsWith(`.${d}`))) return `authProfile ${authProfile} 不允许访问域 ${domain}（允许：${prof.allowedDomains.join(', ')}）`;
        return null;
    }
    async runOpencli(argv, timeoutMs = 60000, stdoutMaxBytes = 1048576) {
        await this.acquireGovernor();
        try {
            const spec = this.ctx.shell.resolve({
                command: [
                    this.bin,
                    ...argv
                ].join(' '),
                timeoutMs,
                stdoutMaxBytes
            });
            const r = await this.ctx.shell.run(spec);
            const out = {
                exitCode: r.exitCode ?? 1,
                stdout: r.stdout?.text ?? '',
                stderr: r.stderr?.text ?? ''
            };
            this.noteRateLimit(`${out.stdout}\n${out.stderr}`);
            return out;
        } finally{
            this.releaseGovernor();
        }
    }
    renderOut(out) {
        if (out.exitCode === 0) return clip(out.stdout, OUTPUT_LIMIT);
        return `命令失败(退出码 ${out.exitCode}):\n${clip(out.stdout, 2000)}\n${clip(out.stderr, 2000)}`;
    }
    async daemonStatus() {
        const r = await this.runOpencli([
            'daemon',
            'status'
        ], 15000);
        if (r.exitCode !== 0) return null;
        return parseDaemonStatus(r.stdout + '\n' + r.stderr);
    }
    async loadState() {
        try {
            const text = await readFile(this.statePath, 'utf8');
            const parsed = JSON.parse(text);
            if (parsed.approval === 'on' || parsed.approval === 'off') this.state.approval = parsed.approval;
            if (Array.isArray(parsed.disabled)) this.state.disabled = parsed.disabled.filter((s)=>typeof s === 'string');
        } catch  {}
    }
    async saveState() {
        try {
            await mkdir(join(homedir(), '.dsh'), {
                recursive: true
            });
            await writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
        } catch  {}
    }
    /** 简单并发池(登录巡检限流用)。 */ async runPool(items, concurrency, fn) {
        const out = [];
        let cursor = 0;
        const workers = Array.from({
            length: Math.min(concurrency, items.length)
        }, async ()=>{
            for(;;){
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
            'list',
            '--format',
            'json'
        ], 30000, 8 * 1024 * 1024);
        if (r.exitCode !== 0) {
            // 诊断通道:把 shell 失败的原始输出带回面板(临时)
            this.lastShellError = `list(${r.exitCode})|out:${r.stdout.slice(0, 200)}|err:${r.stderr.slice(0, 200)}`;
            return null;
        }
        try {
            // opencli 可能把"Update available"横幅等杂物混进输出,从首个 [ 或 { 起截取
            const start = Math.min(...[
                '[',
                '{'
            ].map((c)=>{
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
            this.lastShellError = `json(${e instanceof Error ? e.message.slice(0, 120) : 'parse'})|head:${r.stdout.slice(0, 200)}`;
            return null;
        }
    }
}
function clip(text, limit) {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + `\n…(已截断,原文 ${text.length} 字符)`;
}
export default OpencliService;
