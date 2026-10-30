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
| "帮我测一下通知通道通了没" | `ctl notify test`(诚实回报每个通道成败) |
| "这个网站没有你要的命令" | 见文末"现场创作适配器" |

## ctl 命令面(任何有 shell 的会话可用)

`dsh-opencli-ctl`(下称 ctl;npm 包 bin,若不在 PATH 用 `npx dsh-opencli-ctl` 或仓库 `bin/dsh-opencli-ctl.cjs`)。

原理:ctl 把意图写进 `~/.dsh/opencli-inbox/`,插件执行后回写结果;默认同步等待(45s),你直接拿 JSON 回话。

```
ctl schedule add --site "site juejin hot" --cron "0 9 * * *" [--watch "AI,大模型"] [--notify true|false] [--retry 3]
ctl schedule list            # 全部任务+运行历史
ctl schedule run --id <id>   # 立即跑一次(真实采集)
ctl schedule remove --id <id>
ctl notify set --feishu <url> | --dingtalk <url> | --wecom <url> | --telegram <url> | --webhook <url> | --dsh | --email-smtp <url> --email-to <addr>
ctl notify test
ctl report build --id <scheduleId>
ctl status                   # 插件版本/任务数/通道数
```

cron 五段(分 时 日 月 周)。超时用 `--timeout <秒>` 调;若报"插件消费者未运行",提示用户打开 dsh 面板(插件随面板进程运行)。

安全提醒:ctl 只接受白名单结构化意图(建删任务/配通道/出报告/状态),**不能**执行任意代码;写命令类操作(发帖/删评)不在 ctl 面内——那些必须经插件工具的审批门,人工确认才执行。

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
- 无人值守采集遇风控自动退避重试;"疑似静默失败"(exit 0 但内容是风控页)会被真实性判定标出并按失败重试。
