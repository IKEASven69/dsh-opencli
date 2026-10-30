# 环境调查 · dsh 预设作用域与 opencli 运行环境（2026-10-29/30）

> **一句话**：面板聊天会话不装载插件工具是 dsh 0.2.1-rc.1 的**架构设计**（预设作用域），无配置通路绕过；
> opencli 的 daemon 版本战争是 CLI 与桌面 app 的互杀循环；Edge 代理栈断回环是本机环境两天断连的根因。
> 三项都直接约束 dsh-opencli 的产品处境（工具面只能给 CLI agent 会话），竞品分析见 PM-RESEARCH-20261030。

## 调查① 面板聊天会话不装载插件工具——设计使然，四道门实测

### 机制

dsh 0.2.1-rc.1 每个聊天会话运行在**预设作用域**（preset-scoped context）里。会话工具目录只含
预设清单（`dsh-web-app/presets/standard.patch.yml`，全是 `@deepseek-ai/dsh-tool-*` 框架件）上列出的
插件。dsh-opencli 作为 profile bundle 注册在根上下文：

- **RPC 面**（面板设置页五 tab / 定时 / 画布回放）由根上下文直接暴露 → 面板管理功能一直正常；
- **工具面**（site/canvas/浏览器原语）注册在根 ctx.tools → 永不流进预设作用域 → 面板聊天里 agent
  看不到任何插件工具（实测让 agent 列工具清单：只有 dsh 基础工具）。

### 接入通道实测（连闯四门，死在第四门）

| 门 | 障碍 | 实验结果 |
|---|---|---|
| ① 预设条目装第三方插件 | 无——机制支持任意 cordis 插件名 | dsh 真的去装载了 dsh-opencli ✓ |
| ② 与根 bundle 双装载 | "service opencli has been registered"（服务名冲突） | 从 profile bundles 摘掉根装载即过 ✓ |
| ③ isolate realm 要求 | "Preset services require isolate realms: browser, opencli" | 用 `cordis:group + isolate:{browser,opencli}` 包装后校验通过，会话创建成功 ✓ |
| ④ 工具注入主目录 | isolate realm 的工具不进会话工具目录 | **铁证：实验会话与纯净基线的 toolsTokens 完全一致（11885）** ✗ |

### 产品含义

- 插件是**两个产品面**：管理面（面板）+ 工具面（CLI agent 会话：ZCode/dsh CLI 等）。面板聊天用不了
  工具是 dsh 现版本既定行为，不是本插件缺陷。
- README 已加 FAQ 说明（本次提交）。
- 想进面板会话需 dsh 上游动作：预设装载非隔离第三方工具的机制，或给 isolate realm 定义工具注入语义。
  dsh-agent 预设系统的"Web 编辑器"入口（面板可改预设插件清单）是未来最顺的接入点。

## 调查② daemon 版本战争——CLI 与 app 互杀循环

- 全局 CLI 2.0.0 的 `ensureBrowserBridgeReady`（dist/src/browser/daemon-lifecycle.js）把
  `daemonVersion !== PKG_VERSION` 的运行中 daemon 判为 stale → SIGKILL → 拉起自己的 2.0.0；
- opencli-app 0.1.38（`D:\CodingSoftware\OpenCLI\OpenCLIApp`，内置 opencli **1.8.6**，另有 .bak-1.8.5）
  发现 19825 端口 daemon 死了就重生 1.8.6；
- 两个进程各按各自逻辑行事、谁后动手谁赢 → 拉锯（2026-10-29 实测一天内 daemon 版本多次翻转，
  扩展连接随每次翻转断裂）。
- 缓解：升级 opencli-app（新版内置 2.x 即对齐）或全局 opencli 暂回 1.8.6；根治需上游做同端口版本协商。

## 调查③ Edge 代理栈断回环（本机环境根因，卡了两天真机验证）

- 现象：扩展 service worker 里 `fetch('http://127.0.0.1:19825/ping')` **10/10 全失败**（1.5s 超时），
  换端口同样 0/6；Node 侧同端口全部秒回。
- 判别链：系统代理关闭且豁免表覆盖 127.*（排除 Clash）→ Edge 无 7897 连接（排除系统代理）→
  独立干净实例 `--user-data-dir + --no-proxy-server` 能通（锁定 Edge 代理栈）→ 主 profile 以
  `--no-proxy-server` 启动后**扩展 12 秒重连成功**（根因坐实）。
- 处理：扩展 `dist/background.js` 打了 `DAEMON_HOST: "localhost" → "127.0.0.1"` 一字补丁
  （原件备份 `background.js.bak-localhost`）；Edge 现以 `--no-proxy-server` 运行。系统代理本就关闭，
  日常浏览无感；正常重启 Edge 后若扩展再断连，需关 Edge Secure Network 或配代理豁免（Edge 侧问题）。
- 关联线索：本机 `localhost` 先解析 `::1`（daemon 只听 127.0.0.1），即使代理问题解决，上游扩展用
  `127.0.0.1` 硬编码也更稳。

## 附：API 驱动面板会话的语义（备查）

- 会话 RPC 命名空间 `session`；`session/create` 收 `{request:{cwd}}`（`session/list` 用 `_request` 键）。
- `session/prompt` 的 wire 模式枚举只有 **`queue`/`steer`**（steer 打断当前轮，queue 排队）；
  `requestId` 需 UUID、必带 `clientTimeZone`。
- 裸 API 发 queue/steer prompt **只入队不触发模型运行**（outputTokens 恒 0）——面板 UI 正常聊天可能
  依赖事件流订阅触发运行。API 驱动会话做端到端验证时勿踩此坑。

## 实验遗留物

- `~/.dsh/profiles/headless-opencli/`：调查建的 headless 试验 profile（npm pack 本地 tarball 安装），
  无害，可 `dsh` 直接使用或删除。
- `~/.dsh/profiles/web/cordis.patch.yml.bak-preset-exp`、`package.json.bak-preset-exp`：实验前备份，
  profile 已从备份还原并验证。
- `.build-tools/session-poll.cjs`：会话输出轮询器（本仓库）。
- 面板历史里有三个实验会话（标题 "hi"）。
