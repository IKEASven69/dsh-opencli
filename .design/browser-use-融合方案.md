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

## v0.5 落地顺序
1. probeCDP 移植 + `browser_cdp` RPC + 面板健康区展示 CDP 端点(半天,无版本依赖)
2. 适配器知识 → MCP Resources 文档形态(alpha 阶段先出语义,rc 后接实现)
3. 一键"把登录态桥给官方 Browser Use":自动写 profile MCP 配置 + **安全须知明示**(CDP 开放=本机进程可控该 Chrome;桥给官方扩大使用面,须用户知情)
4. systemPrompt 补"何时从自由浏览切换到结构化命令"的导流建议

## 风险
- CDP 端口本机任何进程可连(OpenCLI 现状即如此,敞口不变;桥接后使用面扩大,面板需明示)
- alpha 阶段 MCP 配置形态可能变动;B 步实现留到 rc
- Stagehand/Playwright 后端为干净上下文,无桥接价值;只桥 CDP
