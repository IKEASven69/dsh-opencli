# 设计:canvas 页面的 agent 可操作性(VOM 能力研究)

> 状态:设计稿(待评审)。研究日期:2026-10-21。
> 研究对象:canvas 页面(HTML5 游戏 / 图表 / 验证码)在 dsh-opencli 栈上的 agent 可操作性。
> 可行性结论:**partial**——"看"(截图/读数据面)上游今天就能用;"点"(坐标级 trusted 事件)需插件层补 CDP 通道,基础设施已就位;"语义解析/验证码对抗"属扩展层或红线,明确不做。
> 证据分四类,均在本研究中实跑/实读:①上游 CLI help 实测;②Tencent/BrowserSkill cli-v0.3.3 release body 实读;③本仓库插件层源码实读;④上游 opencli 安装目录(本机 `npm root -g`/`@jackwener/opencli/dist/src/`,下称 **上游/**)源码实读。未实测项逐条标注。

## 0. 问题与一句话结论

现状:opencli browser 的交互契约是**选择器优先**(ref/CSS/role/name/text),canvas 是一张位图——内部无 DOM 节点、无 aria 角色、无文本,`browser state` 对其不可见,`browser click` 无处可点。游戏(点画布内按钮)、图表(悬浮看 tooltip)、验证码(点图/滑块)三类页面在当前栈上**看得见但摸不着**。

一句话结论:**"看"已解决,"摸"走插件层 CDP 直连补 `Input.dispatchMouseEvent` + 区域截图,语义理解交宿主多模态模型,验证码不做**。该路径与 Tencent/BrowserSkill 已产品化的 VOM(Visual Object Model)能力栈同构,其 PR 序列(发现→区域截图→截图绑定坐标点选→身份校验)即现成施工图。

## 1. 实证记录

### 1.1 上游 CLI 能面实测(2026-10-21,本机 opencli v2.0.0 / 扩展 v1.0.24)

| 命令 | 实测输出要点 | 对 canvas 的含义 |
|---|---|---|
| `opencli browser click --help` | target 仅支持:数字 ref、CSS、`--role/--name/--label/--text/--testid/--nth` | **无坐标参数**;canvas 内部无匹配目标,不可用 |
| `opencli browser state --help` | `--source dom\|ax`(ax 为 prototype),`--diagnostics`,无 canvas 相关项 | 快照只覆盖 DOM/AX 树;canvas 内容不进观察面 |
| `opencli browser screenshot --help` | `--full-page`、`--annotate`(叠加 state ref 标签)、`--width/--height`(视口覆盖) | **无区域截图**(无 clip/region/x/y);`--annotate` 只标 DOM ref,对 canvas 内部无效 |
| `opencli browser --help` | 29 个子命令;`hover/drag/scroll/dblclick` 全部 selector-first;无 `mouse(x,y)` 类原语 | 全交互族均无坐标入口 |
| `opencli browser eval --help` | 页面上下文执行 JS,支持 `--frame`(跨源 iframe 索引) | **唯一能触及 canvas 数据面的通道**(读像素/读游戏状态/合成事件) |

### 1.2 上游 CDP 内部实读(通道B 的能力边界)

DESIGN-zero-config-fallback.md:14 已确立:CLI 进程内存在 `OPENCLI_CDP_ENDPOINT` → `CDPBridge` 通道。本次实读其源码确认三件事:

- `CDPBridge.send(method, params, timeoutMs=30s)`(**上游/browser/cdp.js:126**)是**通用 CDP send**——任意 CDP 命令都可过这条 WebSocket,不止 Page;
- 但全文件仅使用 `Page.*`/`Emulation.*`/`Network.*`;grep `mouse|click|Input\.` **零命中**——上游从未派发过坐标鼠标事件;
- `Page.captureScreenshot` 调用(**上游/browser/cdp.js:263-267**)参数只有 format/quality/captureBeyondViewport,**无 clip**——上游同样无区域截图。

推论:坐标交互在"CLI→daemon→扩展"与"CLI→CDP 直连"两条现有上游链路上**都不存在**;但 CDP 通道本身证明了 daemon 拉起的 Chrome 可被裸 CDP 控制(含 Input 域,只是没人调)。

### 1.3 Tencent/BrowserSkill VOM 能力栈归纳(实读 `gh api repos/Tencent/BrowserSkill/releases/tags/cli-v0.3.3` 的 body)

cli-v0.3.3 release body 汇总了 0.3.0→0.3.3 全量 PR 标题,其中 VOM 系列构成一条完整能力栈:

| 层 | PR(标题原文) | 能力 |
|---|---|---|
| 发现 | #205 `feat(vom): discover canvas candidates and resolve visible regions`(发现 canvas 候选并计算可见区域) | 观察时自动找出页面上的 canvas 及其可见几何 |
| 引用 | #209 `feat(vom): add typed visual refs and target identity validation`(类型化视觉 ref 与目标身份验证) | canvas 区域获得**类型化 ref**(与 DOM ref 同构的身份体系)+ 防陈旧校验 |
| 截图 | #211 `feat(vom): support visible-region screenshots for canvas visual refs`(按 Canvas visual ref 截取可见区域) | **区域截图**:只截 canvas 可见区域喂给模型 |
| 观察 | #217 `feat(vom): expose canvas visual refs in observations with cursor continuation`(观察结果中呈现 Canvas 视觉入口并支持翻页) | canvas 视觉入口进观察输出,内容过多分页 |
| 交互 | #220 `feat(vom): support screenshot-bound point interactions on canvas regions`(支持基于截图坐标的 canvas 点选操作) | **截图绑定坐标点选**:agent 在拿到的截图上选点,系统换算回页面坐标派发点击 |
| 修复 | #237 canvas visual geometry、#271 重复 label sibling scan 性能、#324 非模态侧边栏下保留页面动作 | 生产化打磨 |
| 几何基建 | #195 跨 frame 坐标与截图转换统一、#206 OOPIF 缩放×滚动条占位、#325 分数 DPI×非激活 tab 截图 | 坐标换算的坑位清单(DPR/OOPIF/滚动条) |
| 相邻能力 | #126 focus/blur 原语、#127 scroll-to-element、#128 真实滚轮、#412 视频录制+MP4 导出 | 输入原语族与帧级记录方向 |

核心设计模式(**本设计直接采纳**):**截图锚定坐标(screenshot-bound)**——agent 拿到的不是绝对页面坐标,而是"某张截图上的相对位置";执行时经几何换算(DPR/滚动/frame)映射回页面坐标再派发原生事件。配套**身份校验**(#209)防"截图已陈旧、页面已变化"的点错。这把坐标交互的陈旧引用问题收敛到与 DOM ref 同一问题域。

### 1.4 本仓库插件层既有基础设施(实读)

| 设施 | 位置 | 现状 |
|---|---|---|
| CDP 端点探测 | `probeCdp()` `src/index.ts:1599-1617`:并发探 9222/9234/9236/9238(+`OPENCLI_CDP_PORT`)的 `/json/version`,15s 缓存 | 已服务 `browser-cdp` RPC(`src/index.ts:1619-1626`)与零配置降级路由 |
| CDP env 注入先例 | `zeroCfgPlan()` `src/index.ts:1584-1588`:per-spawn 注入 `OPENCLI_CDP_ENDPOINT` | 证明插件层→CDP 的安全口径已有成文实践 |
| 端口安全不变量 | `src/index.ts:1586-1587` 注释:端点唯一来源是 probeCdp 候选表,**永不指向用户日常 Chrome** | canvas 坐标命令必须继承此不变量 |
| CDP 风险文案 | `src/client.ts:100`:"CDP 开放 = 本机进程可控该浏览器" | 审批门归类时的用户预期已有铺垫 |
| daemon Chrome 带调试端口 | `src/index.ts:1623` hint:"daemon 首条 browser 命令会带调试端口拉起 Chrome" | 插件层 CDP 直连的端点来源成立(**未实测** bind 用户自带 Chrome 的场景,见 §7) |
| puppeteer-core | `package.json:57`(devDependencies ^25.12.0) | 仅 dev/测试;运行时引入需转 dependencies,或手写薄 WS 客户端(上游 cdp.js 的 send 实现仅 ~15 行,可抄思路) |

## 2. 三档能力矩阵

| # | 能力 | 档 | 依据 | 备注 |
|---|---|---|---|---|
| 1 | 看整页/视口 canvas 渲染 | **A:上游已有** | `screenshot [--full-page]`,§1.1 | 宿主多模态模型直接看 |
| 2 | 读 canvas 数据面(像素/游戏状态/图表实例) | **A:上游已有** | `browser eval`,§1.1 | `toDataURL`/`getImageData`/`ECharts.getInstanceByDom` 等;eval 返回值大小需注意 |
| 3 | 图表页抓数据源(XHR) | **A:上游已有** | `browser network`,§1.1 子命令表 | 多数图表库数据来自接口,**优于读像素** |
| 4 | DOM/AX 回退型 canvas 的交互 | **A:上游已有** | `click/hover/keys/drag` + `state --source ax`,§1.1 | 图表库双渲染/aria-label/键盘可控游戏 |
| 5 | 静态 canvas 变化检测 | **A:上游已有(慢)** | screenshot 轮询 + `wait` | 帧级动态不做(§6) |
| 6 | canvas 候选发现+可见区域 | **B:插件层补** | eval 探测脚本(等价 BrowserSkill #205) | 落插件层 eval 封装,~20 行页面 JS |
| 7 | 区域截图 | **B:插件层补** | CDP `Page.captureScreenshot({clip})`(上游无,§1.2) | 或整图后插件层裁剪,规避 DPI 换算 |
| 8 | 坐标点击/hover(trusted) | **B:插件层补** | CDP `Input.dispatchMouseEvent`(上游零使用,§1.2) | **核心缺口**;trusted 事件过 `isTrusted` 检查 |
| 9 | 截图绑定坐标+身份校验 | **B:插件层补** | 等价 #209/#220 的轻量实现:eval 读 canvas fingerprint(width/height/dataURL 哈希) | 防陈旧点击 |
| 10 | 坐标拖拽序列/真滚轮 | **B:插件层补** | `Input.dispatchMouseEvent` mouseMoved 序列/type=mouseWheel(等价 #128/#220 延伸) | 滑块类交互的底层件(用途见"不做"边界 §6) |
| 11 | canvas→结构化语义(OCR/图表精确读数) | **C:扩展层/不做** | 插件层无视觉模型 | 职责在宿主多模态模型;插件层只承诺"截准、点准" |
| 12 | 验证码对抗(点选/滑块/行为链) | **C:红线不做** | 合规+对抗无尽头 | 见 §6 条件 1 |
| 13 | WebGL 3D hit-test | **C:不做** | 3D 拾取需页面侧 ray casting | 坐标事件可发,但"点中哪个物体"无通用解 |
| 14 | 用户日常 Chrome(无调试端口)上的坐标事件 | **C:做不了** | 硬不变量 `src/index.ts:1586-1587` | 报不可用,不绕 |
| 15 | 帧级动态 canvas(60fps 时序) | **C:不做** | 需视频流(BrowserSkill #412 方向) | 单点截图+坐标事件覆盖不了时序 |

## 3. 推荐路径:插件层 CDP 直连(不 fork 扩展、不等上游、不搬 BrowserSkill 代码)

**为什么不是另外两条路:**
- *给上游提 PR*(`browser click --at x,y`):能力上完全成立(扩展层 `chrome.debugger` 或 CLI 层 CDPBridge 均可承载),但节奏不可控,且上游 cdp.js 已 9 个月未演进坐标面——不能把 P0 需求押在别人发版上。作为**并行上报**项,不作为依赖。
- *换栈/引入 BrowserSkill*:VOM 与本设计目标同构,但引入第二套浏览器控制栈等于双 daemon 双扩展,与现有 opencli 审批门/trace 体系冲突。**只取其 PR 序列当施工图与坑位清单**(§1.3),零代码搬运。

**为什么插件层直连可行:** 端点(`probeCdp`)、安全口径(env 注入先例+端口不变量)、审批门、trace 全在插件层;daemon Chrome 常带调试端口(`src/index.ts:1623`);CDP 通道对该浏览器 Page/Input 全域可达已被上游 cdp.js 的用法侧面证明(§1.2)。

**架构草图(MVP 三件):**

```
agent ──DSH──▶ 插件层新工具 browser_canvas_*
                 │ 1. discover:eval 探测 canvas 候选+可见区域(#205 等价)→ 返回类型化 visual ref
                 │ 2. shot:CDP Page.captureScreenshot({clip:区域})(#211 等价)→ 截图+ref+指纹给模型
                 │ 3. point(ref, 截图坐标):指纹校验(#209 等价)→ DPI/滚动换算(§1.3 几何坑位)
                 │              → CDP Input.dispatchMouseEvent(#220 等价)→ 走插件层审批门+trace
                 └─ 连接管理:复用 probeCdp 端点;/json/list 按 targetId(URL 匹配 opencli tab);
                    懒连接+空闲回收;与扩展命令的并发契约见下
```

**并发契约(必须成文):** 同一 tab 上扩展(经 daemon)与插件层 CDP 是两个控制器。规定 canvas 点选序列(discover→shot→point)期间不得插入其他 browser_* 命令——插件层在工具描述与 systemPrompt 目录中声明该时序约束,trace 里记录序列号供事后审计。理由:坐标换算依赖截图时刻的几何,中间插入滚动/导航必然产生 §1.3 #195/#206 类漂移。

**审批门归类:** 坐标点击按 write 对待(它在用户登录态浏览器里产生真实副作用),过现有审批门;discover/shot 按 read。理由:`src/index.ts:1571` 已有先例原则——"没有用户身份的写不是降级是伪造",坐标点击同理不匿名降级。

## 4. 工作量估计

| 里程碑 | 内容 | 估计 |
|---|---|---|
| M1 | CDP 薄客户端(WS+send,参考上游 cdp.js:126 思路)或 puppeteer-core 转正 + tab 定位 + 连接生命周期 | 1.5 天 |
| M2 | discover(eval 探测)+ shot(clip 区域截图)+ trace 接入 | 2 天 |
| M3 | point(指纹校验+DPR/滚动换算+dispatchMouseEvent)+ 审批门归类 | 2.5 天 |
| M4 | 拖拽/滚轮序列 + 并发契约文案(systemPrompt 目录+工具描述) | 1.5 天 |
| M5 | 测试(含 DPI 分数缩放、多 tab 同 URL 歧义)+ sitemap/skill 文档 | 1.5 天 |
| 合计 | | **~9 个工作日** |

维护性成本:端口候选表与上游 launcher 同源约定(`src/index.ts:1510`),上游改端口需跟——列为发布前检查项。

## 5. "不做"的明确条件(触发即停,不绕)

1. **目标是验证码/反自动化对抗**(点选验证码、滑块拼图、行为链模拟):合规红线,且对抗升级无尽头——不做。canvas 点选原语不得在 skill/sitemap 文案中示例为验证码用途。
2. **要的是 canvas 语义结构化**(把图表变数值表、OCR 文字):插件层没有也不该有视觉模型——不做;正确分工是插件层截准区域,宿主多模态模型读图。
3. **目标浏览器无 CDP 端点**(bind 的用户日常 Chrome、显式关闭调试端口):硬不变量(`src/index.ts:1586-1587`)禁止指向用户日常 Chrome——诚实报不可用并引导,不找旁门。
4. **帧级时序需求**(音游/60fps 动作):截图+单点事件在时间维度上不构成控制回路——不做。
5. **上游未来原生提供 `click --at`/`screenshot --region`**:插件层 CDP 通道对应件退役切上游,避免双轨。

## 6. 风险与未决

- **bind 场景未实测**:用户 `browser bind` 自带 tab 时该 Chrome 是否带调试端口,本研究未开浏览器实测(避免在用户机器拉起窗口);实施 M1 时补测,不通则该场景走"不做"条件 3。
- **`state --source ax` 对 canvas 的实际表现未实测**:Chrome 会为部分 canvas 自动生成 AX 回退,能力矩阵 #4 的覆盖面(哪些图表库/游戏有)留待 M2 实测清单化。
- **eval 返回值大小**:canvas toDataURL 是大 base64,eval 通道若有截断需走文件落盘——M2 实测确认。
- **双控制器时序**:并发契约(§3)是约定不是机制;若实测发现扩展后台命令(如 watch)会打断序列,需升级为插件层命令队列。
- **上游升级漂移**:CLI v2.0.0→v2.0.1、扩展 v1.0.24→v1.0.26 可升(§1.1 help 尾部提示),升级后 M1-M5 的锚点需复核。

## 7. 验证清单(实施阶段逐条跑,本研究未跑)

1. `opencli browser open` 拉起 Chrome 后 `curl 127.0.0.1:9222/json/version` 命中(probeCdp 的前置)。
2. 一个 ECharts 页 + 一个 canvas 小游戏页:discover→shot→point 全链路,点选前后截图 diff 佐证。
3. DPI 125%/150% 下坐标换算正确性(§1.3 #325 同款坑)。
4. 指纹校验的阴性用例:截图后人为滚动页面,point 应拒绝并要求重截。
