# dsh-opencli Skill:现场创作站点适配器(L3)

> 触发场景:用户要操作的网站**没有适配器**(systemPrompt 目录里查不到),或 site 工具报"未知适配器"。
> 目标:在会话内创作一个新适配器并通过 verify 验证,之后所有会话直接走 `site` 快速通道。

## 创作循环(全部经 browser_do 工具)

1. **侦察**:`browser_do(command="analyze", args=["<url>"])`
   返回:反爬厂商、真实数据 API 候选、站点模式(A/B/C/D)、**最接近的现有适配器**、建议下一步。
   若提示可参考的现有适配器,先读它的实现(`~/.opencli/clis/<name>/` 或 OpenCLI 仓库 `clis/<name>/`)。

2. **脚手架**:`browser_do(command="init", args=["<新适配器名>"])`
   在 `~/.opencli/clis/<name>/` 生成适配器骨架。

3. **编写**:按骨架填充命令定义(YAML/TS,遵循现有适配器的约定:命令描述、参数、columns 输出列、access 标注 read/write)。
   编码原则:优先用 `browser state/find/extract` 组合出确定性选择器;能走站点 API 的优先 API(`analyze` 的候选)。

4. **验证**:`browser_do(command="verify", args=["<name>"])`
   通过标准:输出可解析、字段符合 columns、退出码 0。失败则回到 3。

5. **入库**:验证通过后提醒用户——适配器在 `~/.opencli/clis/`,可提交到 OpenCLI 上游(或保留本地),
   并点设置→浏览器代理→「刷新/诊断」让新适配器进入目录。

## 约定

- 适配器名用小写连字符;登录类命令标 `access: write` 并带 `--timeout`;
- 永远不把账号密码写进适配器——登录态来自用户真实 Chrome(bind/persistent session);
- 完整方法论见 OpenCLI 仓库的 `opencli-adapter-author` 技能(本文件是其会话内精简版)。

## 本插件全部工具速查

| 工具 | 用途 | 什么时候用 |
|---|---|---|
| `site <站> <命令>` | 结构化命令(170+ 站) | 第一选择:省 token、结果可验证 |
| `site_knowledge <站>` | 知识卡:命令目录+已知坑+失败签名恢复表 | 对某站动手**前**先读 |
| `site_batch` | 多站同命令并行采集 | 2-6 站同命令;自带同域串行化(preflight)与"疑似静默失败"标注 |
| `browser_open/state/click/fill/...` | 通用网页原语 | 适配器没覆盖的页面/临时需求 |
| `script_run_builtin` / `recipe_run` | 只读脚本(article/links/jsonld/forms)/ 25 步配方 | 读正文/结构化抽取/可审计回放 |
| `so_verify` / `so_pick` | SystemOne 亚秒判定(noul 断言/封闭选项集选择) | 高频判定:verify/路由/选点;低置信(<0.7)再回大模型 |
| `opencli_run` / `opencli_catalog` | argv 网关 / 目录检索 | 除 unrestricted 外走审批;不确定命令先查目录 |

失败自救:输出命中 `EMPTY_RESULT/AUTH_REQUIRED/请先登录/验证码/NAVIGATION_REJECTED` 等签名时,按 `site_knowledge` 卡片里的恢复表行动(登录→`opencli <site> login`;风控→冷却 ≥2 分钟降频;改版→换命令或 browser 兜底)。
无人值守:定时任务在面板"自动化"页创建,可加 `watch` 关键词(命中即通知);风控墙自动 2 分钟退避;静默失败按失败重试。
