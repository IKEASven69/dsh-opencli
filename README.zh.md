# dsh-opencli

[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-17695?logo=github&labelColor=555)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/tree/main/data/plugins/IKEASven69__dsh-opencli.yml)
[![dsh-plugin](https://img.shields.io/badge/GitHub%20topic-dsh--plugin-4D6BFE?style=flat-square)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/@cold777/dsh-opencli?label=npm&color=CB3837)](https://www.npmjs.com/package/@cold777/dsh-opencli)

[English](README.en.md) | 简体中文

**dsh 插件 · 登录态驱动的浏览器数据引擎。** 经 [OpenCLI](https://github.com/jackwener/OpenCLI) daemon + BrowserBridge 扩展驱动你日常使用的真实浏览器(Chrome/Edge),提供 170 站点一步式结构化命令、登录态网页原语、定时采集、真实性判定、推送通知与带出处的运行回放。dsh 内置 web 工具面向匿名检索;本插件补上账号视角的一半——所有数据来自你已登录的会话,所有写操作先经人工审批。

- 面向使用者:安装与面板操作见 [快速开始](#快速开始);全部能力清单见 [功能矩阵](#功能矩阵)
- 面向 agent:SKILL.md 已随包分发,会话内可直接发现并调用;命令行入口 `dsh-opencli-ctl`
- 面向贡献者:开发约定、审查流程与内部调研见 [docs/](docs/)

## 工作原理

```
dsh agent ─┬─ 工具调用(site / opencli_* / canvas_*)──┐
dsh 面板 ──┼─ 面板 RPC(定时/通知/画布/审计)─────────┤
任意会话 ──┴─ dsh-opencli-ctl(收件箱意图)────────┤
                                                    ▼
                              dsh-opencli 插件(审批门 · 真实性判定 · 快照 · 轨迹)
                                                    │
                                    OpenCLI daemon + BrowserBridge 扩展
                                                    │
                                          你的真实浏览器(登录态)
```

所有执行路径汇聚到同一个插件服务:写操作经审批门(fail-closed),采集结果经真实性判定(exit 0 不等于有效数据),每次运行落快照与轨迹供回放。

> npm 包为 **@cold777/dsh-opencli**——无作用域的 `dsh-opencli` 名已被一个无关的低层工具占用,搜索时请注意区分:本插件是 170+ 站点结构化命令 + 定时采集告警 + 审批门的完整产品;安装命令一律以本 README 为准。

## 与其他 browser 插件的选型

dsh 生态里的浏览器自动化插件大体两条技术路线,按场景选,不冲突:

- **CDP attach 类**(连已开浏览器的调试端口):适合脚本化的页面操控,轻、快;但没有站点语义层,也没有面向无人值守的产品层。
- **本插件(daemon + BrowserBridge 扩展)**:走你日常浏览器的登录态,价值在语义层之上的产品闭环——170+ 站点一步式命令、写操作审批门、采集真实性判定、定时采集 + 变化告警 + 多渠道推送、快照 diff、带出处报告与运行回放。适合"让 agent/定时任务持续用你的账号办事"的场景。

两者也可共存:调试端口的操控类插件管页面操作,本插件管数据产品与审批链。

## 快速开始

```sh
# ① OpenCLI 运行时(已装可跳过)
npm i -g @jackwener/opencli && opencli daemon restart

# ② BrowserBridge 扩展:https://github.com/jackwener/OpenCLI/releases
#    下载 opencli-extension-*.zip,浏览器开发者模式加载;在浏览器里登录常用站点

# ③ 本插件
npm i -g @cold777/dsh-opencli          # npm(含 dsh-opencli-ctl 命令面)
# 或
dsh plugin add IKEASven69/dsh-opencli   # GitHub tarball
```

装完重启 dsh,打开 **设置 → 浏览器代理**:五个 tab:总览 / 命令 / 自动化 / 安全与设置 / 画布。

## 核心能力

### 定时采集 → 推送

cron 持久化任务,到点用登录态真实采集:失败自动重试 ×3,成功落结构化快照(50 份轮转)。watch 关键词命中或内容增减(新增/消失/位移)时推送至飞书/钉钉/企微/Telegram 等渠道,附与上次相比的差异摘要。

### 真实性判定

`exit 0` 不等于有效数据。确定性规则 + 亚秒决策模型两层判定:空结果、风控页、登录墙被识别为"疑似静默失败",无人值守任务按失败重试。每份快照可回溯到采集命令与时间。

### 结构化站点命令

170 站 / 1200+ 命令预编译目录,蒸馏后注入 systemPrompt——agent 首轮即选对命令,不需要现场试错。每站附知识卡(已知坑 + 失败签名恢复表)。多站并行 `site_batch`。

### 网页原语与 canvas 位图

适配器未覆盖的页面用登录态原语(open/click/fill/extract/screenshot 等);eval 族经 daemon 直连传输,毫秒级往返。canvas 位图画布(图表/游戏/画板)三件套:discover 定位、read 读取为位图(自动落盘进画布)、click 坐标点击(写原语,经审批)。

### 运行回放

每条 browser/定时执行落 JSONL 轨迹;画布页将轨迹/证据/快照聚合为可平移缩放的卡片流,点卡片展开逐步回放(命令/截图/耗时)。失败步附输出摘录——复盘"上次为什么失败"不靠猜。

### 写操作审批门

发帖、删评等写命令默认弹审批窗,允许才执行;权限不明按写处理(fail-closed)。放行/拒绝前后截图入证据包。攻击表 22 行(含 5 条只读对照)+ 独立通道 3 项逐条回归,200 次可复现 fuzz,不变量:**凡 allow ⟹ 只读意图**(见 [安全不变量](#安全不变量))。

## 功能矩阵

| 模块 | 能力 |
|---|---|
| site 适配器 | 170 站 / 1200+ 命令;`site_batch` 多站并行;蒸馏目录注入 systemPrompt |
| 定时采集 | cron 持久化;失败重试 ×3;结构化快照(50 份轮转) |
| watch 推送 | 关键词命中/内容增减 → 飞书/钉钉/企微/Telegram/面板事件流 |
| 带出处报告 | 每节 = 命令 + 时间 + 快照路径;零模型改写 |
| 画布回放 | 轨迹/证据/快照聚合为卡片流,平移缩放,逐步回放 |
| canvas 位图操作 | discover/read/click 三件套;read 位图自动落盘进画布 |
| 真实性判定 | 确定性规则 + 亚秒决策模型;静默失败标注与重试 |
| 写操作审批 | 工具层 fail-closed 审批门;证据包(100 份轮转) |
| 执行轨迹 | 每条执行落 JSONL;面板复盘视图 |
| 冒烟基准 | 默认 5 站只读冒烟;成功率/真实性 P/耗时/直连加速对照 |
| 自动化模式 | read-only / standard / autonomous / unrestricted 四档 |
| 站点健康度 | 上游 issue 驱动受损站标注;canary top-20 只读漂移巡检 |
| MCP Resources | 站点知识经 `opencli://sites/{site}/knowledge` 暴露(dsh 0.2+) |
| 登录态巡检/桥 | 各站 cookie 级在线诊断;一键将 dsh 官方 Browser Use 接入登录态浏览器 |
| 拦截审计 | 审批拦截记录(近 7 天计数 + 明细) |
| 限流限域 | usagePolicy + 429/5xx 退避;authProfile 限域登录 |
| 中英双语 | 面板 EN/zh 切换 |

## 面向 agent

- **CLI agent 会话**(dsh CLI 或其他宿主的 CLI 会话):`site`、`opencli_*`、`canvas_*`、`so_*` 等工具随插件注册,SKILL.md 随包分发可被会话发现
- **面板聊天会话**:受 dsh 预设作用域限制,agent 工具不直接注册——但 agent 可用 shell 调 `dsh-opencli-ctl`(随 npm 包分发):`schedule add/list/run/remove`、`notify set/test`、`report build/export`、`status`;意图经收件箱由插件执行,白名单闭集校验,结果 JSON 回传;同步等待依赖 dsh 面板进程在线(超时会明确提示)
- **命令面示例**:`dsh-opencli-ctl schedule add --site "site juejin hot" --cron "0 9 * * *" --watch "AI"`

## 安装注意

- opencli ≤1.8.8 在插件目录内跑 `npm install` 会静默替换宿主链接([#2555](https://github.com/jackwener/opencli/issues/2555),2.0 已修复)——1.8.x 用户请在仓库外装依赖
- 升级 dsh 到 0.2 前自查 profile `cordis.patch.yml` 有无引用未安装的 bundle——0.2 对此静默退出
- 面板聊天会话不装载插件 agent 工具是 dsh 预设作用域架构所致,详见 [docs/RESEARCH-20261030-dsh-preset-and-env.md](docs/RESEARCH-20261030-dsh-preset-and-env.md)

## 配置

零配置开箱即用;微调项:

| 配置 | 方式 | 默认 |
|---|---|---|
| opencli 二进制路径 | 环境变量 `DSH_OPENCLI_BIN` | `opencli`(全局) |
| 写审批开关 | 面板「审批门」开关 | 开 |
| 自动化模式 | 面板四档 | standard |
| 限流策略 | `usagePolicy`(minDelay 750ms / 并发 2 / burst 3 / 冷却 30s) | 见左 |
| 限域登录 | `authProfiles`(`allowedDomains`/`storageStatePath`) | 无 |

## 安全不变量

write 审批门 fail-closed:权限不明按写处理。20 种绕过形态逐条回归 + 200 次可复现 fuzz,不变量:**凡 allow ⟹ 只读意图**。形态样本:

| 攻击形态 | 行为 |
|---|---|
| 原型链名(`constructor`)/ 路径形态(`../etc passwd`)/ NUL 截断 | 弹审批 |
| 尾部空格绕权限查询(`"zhihu "`) | 弹审批 |
| 通用网关 `opencli_run` 传写形态 | 弹审批(网关不豁免) |
| `site_batch` 混入写命令 | 整批拒绝,shell 零调用 |
| benchmark / canary 独立通道传写命令 | 自带只读门拦截 |

全部输出经截断与噪声剥离防上下文污染;限流 + 自动退避;限域登录跨域拒绝。

## 测试与验证

| 层面 | 方式 |
|---|---|
| 单元/回归 | vitest 450+ 用例:审批门不变量攻击表 + 200 次 fuzz / cron 回归 / 直连传输 / 快照 diff / 导出格式 / 机检器 |
| 真机审查套件 | 22 项逐项(渲染/真执行/状态对账/RPC 真值),`full-review.cjs` 一键复测,结果记录宿主 dsh 版本 |
| 全功能矩阵 | 全链路端到端(会话/直连/推送/导出/生态 ctl 全链),`full-matrix.cjs` |
| 前端走查 | 10 幕 27 断言(真实浏览器鼠标键盘),`ui-walkthrough.cjs` |
| 真模型 E2E | 会话调 site 命令/写拒绝/NL 映射闭环(经宿主 llm) |

## 文档

- [CHANGELOG](CHANGELOG.md) · [SKILL.md](SKILL.md)(agent 使用手册) · [AGENT_INSTALL.md](AGENT_INSTALL.md)(agent 自助安装)
- 开发文档:[docs/](docs/) — 设计稿、调研、验收记录与内部约定

## 定位

- 不替代 OpenCLIApp/daemon/扩展——那是引擎层,本插件是 dsh 里的数据驾驶舱
- 不替代 dsh 内置 web_search/web_fetch——内置管匿名检索,本插件管登录态数据
- 无真实浏览器的机器不适用

MIT License.
