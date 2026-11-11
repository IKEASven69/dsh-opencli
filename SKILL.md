# dsh-opencli:登录态数据采集与盯变化(人机协同手册)

> 你(dsh agent)在任何 dsh 会话——**包括面板聊天**——都能用本技能帮用户完成:查数据、建定时采集、盯关键词推送、出带出处报告。
> 有插件工具的会话(CLI/ZCode 等)直接用工具;没有工具的会话(面板聊天)用 shell 跑 `dsh-opencli-ctl`(下述,能力等价)。
> 核心优势:跑在用户**真实浏览器+真实登录态**上,数据带出处(命令+时间+快照),不是匿名爬取。

## 一句话 → 动作(场景路由)

| 用户说 | 你做 |
|---|---|
| "看看知乎/B站/掘金今天的热榜" | 有工具:`site zhihu hot`;无工具:shell `opencli zhihu hot`(JSON 输出) |
| "每天早9点把掘金热榜发到我飞书" | 两步:`ctl notify set --feishu <webhook url>` → `ctl schedule add --site "site juejin hot" --cron "0 9 * * *"` |
| "盯住热榜,'降价'一出现就告诉我" | `ctl schedule add --site "<站点命令>" --cron "<频率>" --watch "降价"`(watch 命中→🔔推送+面板事件) |
| "把这次的采集整理成报告,注明来源" | `ctl report build --id <scheduleId>`(每节=命令+时间+快照路径,零模型改写) |
| "上次那个任务跑成功了没" | `ctl schedule list`(含历史与成败摘要);面板"自动化"页有图形化时间线 |
| "昨晚的推送/失败我想回看" | 事件台账:`~/.dsh/opencli-events.jsonl`(逐行 JSON,5MB 轮转);面板自动化页有事件面板。kind 一看就懂:`watch-hit`(关键词命中)/`snap-diff`(变化)/`daemon-flip`(版本翻转)/`adapter-drift`(疑似改版)/`daemon-selfheal`(自愈 restart)/`circuit-open`(系统级熔断) |
| "这个任务用小号跑,别动我大号" | 建任务时带 `--profile <浏览器 profile 别名>`(上游 OpenCLI 原生多账号隔离;profile 未连接会如实失败,不会偷偷换号) |
| "帮我测一下通知通道通了没" | `ctl notify test`(诚实回报每个通道成败) |
| "这个网站没有你要的命令" | 见文末"现场创作适配器" |

## ctl 命令面(任何有 shell 的会话可用)

`dsh-opencli-ctl`(下称 ctl;npm 包 bin,若不在 PATH 用 `npx dsh-opencli-ctl` 或仓库 `bin/dsh-opencli-ctl.cjs`)。

原理:ctl 把意图写进 `~/.dsh/opencli-inbox/`,插件执行后回写结果;默认同步等待(45s),你直接拿 JSON 回话。

```
ctl schedule add --site "site juejin hot" --cron "0 9 * * *" [--watch "AI,大模型"] [--notify true|false] [--retry 3]
                   [--notify-level quiet] [--quiet-hours 23:00-07:00] [--preflight] [--keep 50] [--backoff-ms 15000] [--profile <别名|contextId>]
ctl schedule list            # 全部任务+运行历史
ctl schedule run --id <id>   # 立即跑一次(真实采集)
ctl schedule remove --id <id>
ctl notify set --feishu <url> | --dingtalk <url> | --wecom <url> | --telegram <url> | --webhook <url> | --dsh | --email-smtp <url> --email-to <addr>
ctl notify test
ctl report build --id <scheduleId>
ctl status                   # 插件版本/任务数/通道数
```

任务级可靠性旗标(按需加,不配也有合理默认):
- `--notify-level quiet`:只推命中/变化/失败,例行成功不刷屏;
- `--quiet-hours 23:00-07:00`:静默窗(跨夜 OK)——窗内通知暂存(上限 20),出窗首跑合并推送一条 😴 摘要;
- `--preflight`:每次采集前先 whoami 快检登录态,未登录→⏸ 跳过本 tick(任务保留,不烧重试);
- `--backoff-ms`:风控退避起点(默认 15s,下限 120s);`--keep`:快照留存份数(5-500,默认 50)。

cron 五段(分 时 日 月 周)。超时用 `--timeout <秒>` 调;若报"插件消费者未运行",提示用户打开 dsh 面板(插件随面板进程运行)。

安全提醒:ctl 只接受白名单结构化意图(建删任务/配通道/出报告/状态),**不能**执行任意代码;写命令类操作(发帖/删评)不在 ctl 面内——那些必须经插件工具的审批门,人工确认才执行。

## 外部消费者:MCP 自host 端点(0.1.3,只读知识面)

插件随面板进程起一个本机 MCP Streamable-HTTP 端点,供 dsh 之外的消费者(其他 agent/脚本)读站点知识:

- 发现:`~/.dsh/opencli-mcp-auth.json`(含 url/port/token,0600;停机即删);
- 认证:每请求 `Authorization: Bearer <token>`;工具只读两只:`knowledge_list` / `knowledge_get`,无写面;
- 三步:initialize → tools/list → tools/call;批请求上限 20 条,超出逐条回错不静默吞;客户端声明不认识的协议版本会被钳回服务端支持版本(不假兼容)。

```
curl -X POST http://127.0.0.1:<port>/mcp -H "authorization: Bearer <token>" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"knowledge_get","arguments":{"site":"zhihu"}}}'
```

## 无人值守可靠性(内置,无需配置)

任务健康预检(daemon 死→自动拉起;扩展断连→⏸ 诚实跳过任务保留);daemon 版本翻转/执行期断连→**单次自动 restart 重探重跑**(退避防循环);同签名系统级失败(断连/权限)→**跨任务熔断开窗**(默认 30 分钟,后续任务单行短路不刷屏,事件里给 canary 诊断入口);验证码类失败赠一次自解等待;以上全记事件台账,回看即知发生了什么。

## 有工具会话:全部工具速查

| 工具 | 用途 | 什么时候用 |
|---|---|---|
| `site <站> <命令>` | 结构化命令(170+ 站) | 第一选择:省 token、结果可验证 |
| `site_knowledge <站>` | 知识卡:命令目录+已知坑+失败签名恢复表 | 对某站动手**前**先读 |
| `site_batch` | 多站同命令并行采集 | 2-6 站同命令;自带同域串行化与"疑似静默失败"标注;**执行后自动生成带出处报告** |
| `opencli_open/state/click/fill/...` | 通用网页原语(2026-10 起 eval 族直连 daemon,毫秒级) | 适配器没覆盖的页面/临时需求 |
| `canvas_discover/read/click` | 网页内 canvas 位图三件套(图表/游戏/画板);read 位图自动落盘进面板「画布」页 | selector 够不到的位图页面;click 是写原语需审批 |
| `trace_replay` | 最近 30 步 browser 命令时间线 | 复盘"上次为什么失败"先调它,别盲目重试 |
| `script_run_builtin` / `recipe_run` | 只读脚本/25 步配方 | 读正文/结构化抽取/可审计回放 |
| `so_verify` / `so_pick` | SystemOne 亚秒判定 | 高频判定与路由 |
| `opencli_run` / `opencli_catalog` | argv 网关/目录检索 | 写命令走审批门;不确定命令先查目录 |

失败自救:输出命中 `EMPTY_RESULT/AUTH_REQUIRED/请先登录/验证码/NAVIGATION_REJECTED` 等签名时,按 `site_knowledge` 卡片恢复表行动(登录→`opencli <site> login`;风控→冷却 ≥2 分钟;改版→换命令或 browser 兜底)。

## 现场创作适配器(网站没被覆盖时)

1. 侦察:`opencli_do(command="analyze", args=["<url>"])`(反防爬厂商/API 候选/最近似适配器);
2. 脚手架:`opencli_do(command="init", args=["<名>"])` → 在 `~/.opencli/clis/<名>/` 填命令定义(优先站点 API;命令标 access: read/write);
3. 验证:`opencli_do(command="verify", args=["<名>"])`,通过后提醒用户入库/刷新目录。
约定:适配器名小写连字符;登录态来自用户真实浏览器(bind/persistent session),**永不**把账密写进适配器;完整方法论见上游 `opencli-adapter-author` 技能。

## 边界(对用户如实说)

- 定时/推送/画布回放跑在用户打开着的 dsh 面板进程里(关面板即停,重开续跑,任务持久化不丢);
- 站点适配器命令需要本机装了 OpenCLI(`opencli --version` 可查);浏览器命令需要 OpenCLI 扩展已连接;
- 扩展未连接时(零配置降级):`site` 纯 HTTP 只读命令(如 `site juejin hot`、`site hackernews best`)照常可跑;需浏览器会话的只读命令会如实返回"无法降级执行"——别反复重试,直接告诉用户装扩展或先改用纯 HTTP 命令;写命令/权限未知命令永不降级;`opencli_*`/`chrome_*` 执行前即返回"缺什么/怎么装/装好后立即可用"的指引,照转给用户即可。装好扩展自动重连,无需重启 dsh;
- 无人值守采集遇风控自动退避重试;"疑似静默失败"(exit 0 但内容是风控页)会被真实性判定标出并按失败重试。
