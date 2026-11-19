# 0.1.7 施工方案与勘察纪要(2026-11-20)

> 用户指令:直接施工,发布后置;调研要完全(dsh 整个市场 + B 站等社媒渠道);深挖 opencli 能力,配合其他插件或原生能力;做出让人眼前一亮的功能——提高工作效率或情绪价值。
> 输入:docs/RESEARCH-20261119-017.md(市场四路)+ 本日两路专项勘察(社媒命令面/原生能力面,见 §五存档要点)。

## 一、范围定稿

| 项 | 内容 | 依据 |
|---|---|---|
| **A. 任务健康面** | stats 计数(真实 run ok/fail)+ scheduleAdd 站点健康预警(knowledge healthOf+pitfalls)+ 面板成功率/连败/坏站 chips + 建任务 warning toast | 本机 4% 成功率、上游 108 open fix PR |
| **B. 一键巡圈** | 面板「一键巡圈」卡:默认清单 8 条 read-only 命令串行 try-run,逐站状态+结果就地渲染+一键复制;SKILL.md agent 深度版配方(3 个 site_batch + 交叉热点 + kb_note/notify 联动) | 勘察 A:跨站统一巡圈简报卡市场零玩家;B 站 feed 免 id 关注流;8 条清单避开全部已知坏点 |
| **C. 效率账单** | 自动化页顶部卡:N 任务/累计成功 M 次/省时折算(3 分钟/次估算,口径如实标注)/连败计数 | 情绪价值+真实数据;128 行 5 ok 的反面是"成功过的那些都在默默省时间" |
| **D. SKILL.md 社媒配方** | 巡圈三连 site_batch、追更配方按对象类型(B站免 id 路线/微博水位线增量/twitter device-follow/知乎逐个拉)、坑位清单、工作流组合(采集→知识库→判断) | 勘察 A 追更参数对照表 |

**明确不做(记入路线)**:宿主原生配合五件套(采集 run 挂 ctx.jobs / state 迁 ctx.storage+domain 事件 / webServer 挂自有路由 / 审批门迁 approval/request waterfall / UI 槽位全家桶)——勘察 B 已给出全部 path:line 与价值判断,是 **0.2.0 的架构级主题**(涉及持久层迁移与审批语义切换,不与功能版混车);MCP 迁移继续挂 0.2.2 stable。

## 二、勘察存档要点

**社媒命令面(子代理 A,manifest 1225 条逐条核)**:
- B 站 `feed` 不传 uid=关注时间线(免 id 追更全员成立);`user-videos` 必带 uid(精查单个 UP);**没有 user-dynamics 命令**(任务书勘误)
- 微博 `user-posts` 支持 start/end 日期过滤(天然水位线增量);`feed --type following`=关注流;cookie 短效周重登
- twitter `device-follow` 免参聚合通知流;`list-tweets` 必带 listId(多人聚合进 List 是正确姿势)
- 知乎无关注流命令(追更=逐 user 拉 answers/articles/pins);小红书 search 三连坏(#2786/#2791)走 feed 替代、creator-stats 恒空;reddit .json 全封锁整站不入圈
- 免登录兜底:仅 v2ex(8 条)+juejin(2 条)browser=false+public
- 市场:跨站统一巡圈简报卡零玩家(sxs_news_hot 只聚合热搜、daily-brief 偏 RSS);微博追更专属件=0(OpenCLI 弹药完整);B 站多 UP 新内容监控=0(bili-follow-doctor 只清僵尸);shawnclink/dsh-bookmarks「采集走 opencli」验证采集底可行性

**原生能力面(子代理 B,harness 0.2.2-rc 源码)**:
- 宿主无进程外 cron(dsh-jobs-local 纯内存、dsh-schedule 不在 bundle)——插件自建调度仍是无人值守唯一路径,不可替换
- 可升级项(v0.2 候选):ctx.jobs(宿主内可观测)+ctx.storage/domain(原子写+变更事件替 15s 轮询)+ctx.webServer(插件自有路由)+approval/request waterfall(审计日志)+settings.plugins.tab/sidebar.footer.action/session.header.actions(UI 槽位)
- 宿主无出站通知(28 渠道自建仍是必要品);shell.overlay 是唯一应用内浮层

## 三、验收

- A:tests/task-health.test.ts 4 例(预警落条目/干净站省键/幂等刷新/stats 计数与跳过不计)
- B+C:构建绿+面板渲染(渲染无组件测试基建,真机走查归用户下次打开面板);逻辑零新增 RPC(全部复用 try-run/site 既有链)
- 全量:0.1.6 基线 811 + 新增 4 → 815 预期

## 五、实机走查记录(2026-11-20,3080 实例)

**已验证**:①0.1.7 在宿主 0.2.2-rc.5 加载正常(插件页无异常标记;同机 billion-context-dsh/dsh-mystery-novelist/dsh-sensenova-image 三插件因 peer 要求旧 rc 被宿主拒载——#2582 形态,与本插件无关);②面板挂载:管理中心页头/五 tab/双语切换全渲染;③一键巡圈卡+按钮渲染(自动化 tab);④**真机实抓真 bug 并修复**:一键巡圈第一条 try-run 6 分钟零进展,同期 CLI 直跑 bilibili hot 秒回(上游无罪)→ 根因=verifyResult/site_pick/noul/so_pick 五处 SystemOne so.ask 无超时,宿主 provider 慢/挂时无限阻塞主链路 → soAskTimed 兜底(20s/30s/60s 分档,超时=标注缺席降级),`560951e` 已推送并部署。

**环境受限未走完**(如实):巡圈实点的简报渲染与效率账单卡首现(stats>0 触发)——opencli 浏览器桥持续间歇挂起(#2836 家族:bridge 命令挂起/commandResultUnknown,doctor 全绿;本日 CLI 直跑全绿而桥命令全挂),不是本插件缺陷;两处均属「用户下次打开面板第一眼可自验」项:实例已在 3080 运行 0.1.7(带 token),自动化页点「一键巡圈」即走完整链路(修复后单条最坏 60s+20s)。

**遗留**(下版候选):①面板连败 chip 显示上限 3(history 窗口)——可透真值 failStreaks;②saveState 并发乱序窗口(benchmark flake 根因,loadState 单调序号加固);③status RPC 每次 panel 刷新全量扫事件档(flip 计数已有 60s 缓存,status 其它段未缓存)。
