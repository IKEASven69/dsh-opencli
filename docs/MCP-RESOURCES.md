# MCP Resources 知识暴露(P1-3)

把站点知识卡(命令目录 + 已知坑 + 站点健康度 + 失败签名恢复表)以 **MCP Resources** 语义暴露:
外部消费者(模型会话 / 面板 / 其它插件)不需要跑 opencli 就能拿到一张"进站地形图"。
背景:上游 #2539 砍掉 sitemap 与外部 CLI hub,站点知识分发出现官方真空——本插件补位。

## 资源形态

```
URI 模板   opencli://sites/{site}/knowledge        (site = 适配器名,如 weibo)
MimeType   text/markdown
内容       renderKnowledgeMarkdown(src/knowledge.ts)——与 site_knowledge 工具、knowledge-export 同一数据源
```

## 路径 A(主路径):dsh 0.2 `ctx.mcpResources` seam

**调研结论(2026-10-03,类型树 `C:\Users\20369\.dsh\cli017\node_modules\@deepseek-ai\`):dsh 0.2 提供了该 seam。**

- 包:`@deepseek-ai/dsh-mcp-resources`(实测版本 0.2.0-rc.2),服务挂在 `ctx.mcpResources`(cordis `McpResourceRuntime`)。
- 注册口:`mcpResources.register(server, provider)` → `() => void`(disposer)。任何插件都能注册,不限于 mcp-client 连接。
- 注册后模型可见:systemPrompt 出现 `## MCP resource servers` 段(列出 `opencli`),共享工具
  `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` 以 `server: 'opencli'` 分发到本插件。
- provider 契约:`{ request(req, exec) }`,`req.method ∈ resources/list | resources/templates/list | resources/read`。

本插件实现(`src/index.ts` `OpencliService.registerKnowledgeResources`):

1. `[Service.init]` 里 `ctx.reflect.get('mcpResources', false)` **可选探测**——该包不在本插件 peerDependencies
   (0.1.x 宿主没有),静态 inject 会让老宿主加载失败(与 subprocess seam 同一策略)。
2. seam 在 → `register('opencli', provider)`;disposer 挂回本插件 `ctx.effect`,卸载即摘除,不留僵尸 server。
3. provider 每次请求从 adapterCache 取目录,转调**纯函数** `handleMcpResourceRequest(src/knowledge.ts)`:
   - `resources/list`:目录内全部站点各一张资源卡;健康度异常站(受损/注意)在 `description` 标出。
   - `resources/templates/list`:单一模板 `opencli://sites/{site}/knowledge`。
   - `resources/read`:按 URI 构建知识卡并渲染 markdown;URI 未知/站点不在目录 → 抛错(该次工具调用失败,不编造)。
4. seam 缺失 / 注册异常 → 静默跳过,插件主体与路径 B 不受影响。

## 路径 B(回退,常驻):`knowledge-get` RPC

`@Remote('knowledge-get')`(TypertRemoteService RPC,面板/外部经 `/api/opencli/knowledge-get` 可调):

```
请求  { sites?: string[] }        // 缺省 = 健康度异常(degraded/notice)且在目录内的站
响应  { ok, cards: [{ site, uri: 'opencli://sites/<site>/knowledge', markdown }], error? }
```

- 0.1.x 宿主上它是唯一路径;0.2 上与路径 A 并存(同一数据源,无状态分叉)。
- 单测直接调 `svc.knowledgeGet(...)` 并 mock `adapterCache`(不必起 MCP 栈)。

## 测试(`tests/mcp-resources.test.ts`)

- 纯函数 handler(src):list/templates/read 三操作 + 未知 URI 抛错 + 受损站 description 标注。
- RPC(lib):桩 ctx + mock adapterCache → 返回 markdown;未知站点 → ok:false。
- seam 注册:桩 `mcpResources` 服务(记录 register 调用)→ 插件加载后 server 名为 `opencli`,
  provider 转发 `resources/read` 返回知识卡 markdown;无 seam 的 ctx 上加载插件不抛错(降级)。

## 迁移路径备注

若未来 dsh 把 MCP server 侧暴露改成别的 seam(如官方 `ctx.mcp.server` / resources 注册器):

1. 数据层 `handleMcpResourceRequest` 是纯函数、零宿主依赖——换 seam 只动 `registerKnowledgeResources` 的接线;
2. `knowledge-get` RPC 形状已是 MCP resources/read 的子集(`cards[].uri` 即资源 URI),外部消费者无感;
3. 若 seam 永久缺失(0.1.x),路径 B 即终态,本文档作为"等 dsh seam 就绪"的接入说明仍然成立。
