# opencli 适配器知识层 × dsh 官方 Browser Use — 防守性融合方案

> 2026-09-17 · 现状:dsh 0.1.6-alpha.1(09-15)引入实验性 Browser Use(Playwright MCP / Chrome DevTools MCP / Stagehand 三后端)+ 实验性 Computer Use。stable 只是时间问题,"通用网页自动化"将成为 dsh 原生能力。宜早不宜迟。

## 核心判断

不做"另一个浏览器自动化"(必被官方吞),做**官方能力缺失的三件事**——把 opencli 的两块独有资产(登录态浏览器 + 1333 条结构化命令的适配器知识)变成官方 Browser Use 的**前置依赖**。

## 事实核查(已验证,非推测)

1. **登录态 = 天生的 CDP 端点**。opencli launcher(launcher.js)拉起的 Chrome 带 `--remote-debugging-port`(候选 9222/9234/9236/9238),并有 `probeCDP(port)` 轮询 `http://127.0.0.1:{port}/json` 就绪。⇒ 用户登录态浏览器天生可被 CDP 自动化端点挂载。
2. **dsh 0.1.6 Browser Use = MCP 后端**。Playwright MCP / Chrome DevTools MCP / Stagehand 由 profile 的 MCP 配置接入;其中 Chrome DevTools MCP 支持连接**既有** CDP 端点。⇒ 把它指向 opencli 的 CDP,官方自动化就在用户登录态的 Chrome 里干活。
3. **0.1.6 MCP 支持资源发现与读取(含 URI 模板)**。⇒ 适配器知识可以 MCP Resources 形态暴露给任何 agent。

## 三层融合

### A. 登录态桥(最硬的防守)
插件探测 daemon Chrome 的 CDP 端口(移植 probeCDP,扫候选端口)→ 新增 `browser_cdp` RPC + 面板健康区展示端点 → 官方 Chrome DevTools MCP 的 browserUrl 指向它。
效果:**官方 Browser Use 在你登录态的 Chrome 里干活**。opencli 的登录态 + daemon 生命周期管理成为官方能力的前置设施。

### B. 知识注入(MCP Resources)
适配器知识层打包为 MCP Resources:
- `opencli://sites/<site>/sitemap` — 站点导航/页面状态/动作流(已有 sitemap 知识体系)
- `opencli://sites/<site>/pitfalls` — 反爬/登录点/已知坑
- `opencli://sites/<site>/commands` — 结构化命令目录(1333 条的语义)
任何 agent(含官方 Browser Use)浏览某站前先读"这个站怎么干"——通用自动化拿到地形图。

### C. 命令兜底(知识变流量)
目录内站点在知识层明示:**优先 `site <适配器> <命令>`,失败再退回自由浏览**。官方 Browser Use 越强,这条导流越有价值——它省下的 token 与失败率就是 opencli 的价值证明。

## 不做什么
- 不做通用自动化引擎(官方在做),不做私有协议对抗。
- 不在 0.1.6 alpha 上做实现级适配(alpha API 会动);A/C 两步无版本依赖可先行。

## 配置契约(2026-09-17 已从官方文档/npm 验证)

- 官方文档(docs/subsystems/browser-use.zh.md):提供方为**实验性公共 npm 包**(`@deepseek-ai/dsh-browser-use` + `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` 等,npm 均已发布 0.1.6-alpha.1),需显式挂载到 profile 组合。
- **attach 模式是官方一等公民**:`mode: attach` + `endpoint`(HTTP/WS 调试端点),官方原话——"让一个 Session 接入已有浏览器,**使用其现有标签页和登录状态**";清理只断开,外部浏览器保持运行。
- mount 形态 = profile patch 的 insert 行(与 opencli 自身 cordis.patch.yml 同机制):
  ```yaml
  - name: '@deepseek-ai/dsh-browser-use'
  - name: '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp'
    config:
      mode: attach
      endpoint: http://127.0.0.1:<daemon Chrome CDP 端口>
  ```
- 关键约束:①提供方注册全局唯一(第二个注册即使同名也失败)——opencli **不得**注册自己的 provider,只写官方的配置;②attach 连接被一个 Session 占用后,其他 Session 激活继续运行但不重试;③config 在激活期固定,改配置需重载;④**官方自动化不经过 opencli 审批门**——桥接开启时面板必须明示此风险。
- 依赖前提:浏览器实验包按 0.1.6-alpha.1 发布,需 host 运行 0.1.6-alpha+(0.1.5-rc.1 上未验证)。⇒ 该功能随 dsh 0.1.6 stable/r c 落地,v0.5 先交付探测+端点展示+配置生成器(生成 patch 片段给用户粘贴)。

## v0.5 落地顺序
1. probeCDP 移植 + `browser_cdp` RPC + 面板健康区展示 CDP 端点(半天,无版本依赖)
2. 适配器知识 → MCP Resources 文档形态(alpha 阶段先出语义,rc 后接实现)
3. 一键"把登录态桥给官方 Browser Use":自动写 profile MCP 配置 + **安全须知明示**(CDP 开放=本机进程可控该 Chrome;桥给官方扩大使用面,须用户知情)
4. systemPrompt 补"何时从自由浏览切换到结构化命令"的导流建议

## 风险
- CDP 端口本机任何进程可连(OpenCLI 现状即如此,敞口不变;桥接后使用面扩大,面板需明示)
- alpha 阶段 MCP 配置形态可能变动;B 步实现留到 rc
- Stagehand/Playwright 后端为干净上下文,无桥接价值;只桥 CDP
