# 0.2.0 施工计划(2026-11-24 定稿,用户令:可实现的全部进本版,不做版本运营式排期)

> 输入:docs/RESEARCH-20261124-020.md(UX 45+性能 12+基准 5)+ RESEARCH-20261122-019.md C1(追更)+ 0.1.7 plan 遗留(五件套)。
> **挂账白名单(仅两种)**:等外部发布(0.2.3 适配/xray 反馈/npm 发布链);尚未可实现。其余全部进 0.2.0。

## 一、范围全量清单

| 块 | 项数 | 内容 |
|---|---|---|
| F 基准 | 5 | rpc-bench.cjs:daemon spawn/事件档整读/快照史读放大(adapters 冷构建/面板 TTFB 挂构造数据后补)——包前基线,包后复测 |
| A 诚实安全 | 8 | H9 webhook 按 platform 替换 · H3 删任务确认 · H4 回放失败即停如实报 · H14/M14 切换失败提示+回滚 · M15 凭据遮蔽 · M6 假占位 chip · M18 文案对齐 |
| B 性能 P0 | 3 | PF1 画布 statSync 替代 JSON.parse · PF2 adapters 在途去重+翻页 ungoverned · PF3 shots 按日淘汰 |
| C 长任务体面 | 8 | H1 巡圈取消+进度 · H4(归 A)· H5 立即跑执行态+清理 · H7 cron 校验+下次执行预览 · H12/M12 简报展开 · PF5 巡圈 2 泳道 |
| D 看得懂 | ~16 | H6 高级项收起 · H8 键盘可达×7 · M4 硬编码入表×4 · M8/M9 枚举本地化 · M13 title→可见 · L1/L10 记忆 · L17 首屏健康优先 · L5/L6/L13/L14/L15 等 |
| E 性能 P1/P2 | 8 | PF4 daemonStatus TTL · PF6 canary 双档 · PF7 尾部读 · PF8 收件箱退避 · PF9 删任务清残留 · PF10 报告/备份轮转 · PF11 state 体积观测 · PF12 面板侧 shot 懒加载 |
| G 追更一等公民 | 1 组 | 面板自动化 tab「追更」区:B站免 id 关注流/微博水位线(start-end)/twitter device-follow/知乎逐人拉 → 表单化一键建任务 + ctl `schedule add` 直通配方 + 与 watch/通知/可见性联动;SKILL 配方保留为 agent 深度版 |
| H 宿主原生五件套 | 5 | ①ctx.storage+domain:状态迁宿主持久层+变更事件替面板轮询(保留文件兜底)②ctx.jobs:调度器注册进宿主可观测面 ③ctx.webServer:面板数据面走自有路由(可选,RPC 已通则降级不做)④approval waterfall:审批记录进宿主审批流 ⑤UI 槽位:侧边栏/插件页直达入口(解「三层深」)。勘察底档:0.1.7 时代勘察 B(path:line) |

## 二、施工次序(避免返工)

1. **F 基准**(现行架构上测,数字进本文件)
2. **A**(bug 修,小,现行架构)
3. **B→C→D→E**(UX+性能,client.ts 为主,与 H 无冲突)
4. **H 五件套迁移**(架构)
5. **G 追更**(骑 H 的基座)
6. 全量测试+双评审+真机走查+CHANGELOG+真机部署

## 三、基准基线(F,包前实测 2026-11-24T03:24Z,rpc-bench.cjs)

| 项 | 实测 | 对应候选 |
|---|---|---|
| `--version` spawn | 中位 83.6ms(×5) | — |
| `daemon status` spawn | **中位 328ms**(×5;首拍 510ms 冷) | PF4:每任务 run 预检各付一次 |
| 事件档整读 | 0.54ms @ 15KB/76 行 | PF7:本机尚小,「随时间恶化」确认 |
| schedule-history 读放大 | 0.28ms @ 3 份/6B(JSON.parse 法)vs 0.12ms(stat 法) | PF1:本机数据太小无法复现满载,stat 法此在小数据已快 2.3×,满载推算维持需打点 |
| state.json | 29KB,stringify 0.13ms | PF11:仅观测 |
| adapters 单页 spawn | **351ms**;13 页+governor 间距 ≈ **14.3s 冷构建** | PF2:实锤 |

基准壳已就位(满载构造数据后复测);PF1/PF7 的满载量级在本机不可复现,推算标注维持。

## 四、施工记录

### 阶段 1-3(F+A+B+C+D+E,~58 项,`96a6d22`/`b965d20`/`1fda2d9`)
- 全部落地(见提交信息);820/820 全绿
- 附带真修复:scrub 规则抽离 scrub-rules.ts(本机 Node 升 26.13.1 后 strip-only 不能加载 notify.ts 的参数属性类);selfHealDaemon 重探/updateDirectory 探测 catch(测试桩暴露的 unhandled 逃逸);PF4 修订(预检入口保持真探——缓存漏检翻转,测试实抓)
- benchmark canary 一次性 flake 被 0.1.6 归档 reporter 抓获(服役首战),3 连复跑绿,留双评审

### H 五件套(已落地,`host-integration.test.ts` 4 例钉住)
- **H⑤ UI 槽位:已落地**——settings.plugins.tab 槽(host settings 契约实有,list 槽 id/order/label)注册「浏览器代理」tab,插件页一击直达(原四层深);settings.section 原入口保留
- **H② jobs 可观测:已落地(守卫式)**——runSiteCommand 起点注册 ctx.jobs job(kind='opencli',label=命令行,unowned,终态输出型),终点 settle completed/failed+detail;守卫三连:ctx.get('jobs') 免注入读取/形状校验/start 失败或并发帽(未 owned 桶默认 10)→ null 采集照跑;测试:host-integration ②(注册+label+结算)+守卫例
- **H③ webServer 健康路由:已落地(守卫式)**——/opencli/health(exact)回 200 JSON(ok/version/at);服务缺席/路径冲突静默回现行为;测试:host-integration ①(handler 实调断言 200+payload)
- **H① schedule-changed 域事件:已落地(守卫式)**——add/remove/toggle/skip/run 五个变更点发 opencli/schedule-changed(cordis 事件总线,命名空间 'opencli/',事件只做通知不含状态详情,订阅方走既有 RPC 拉详情);测试:host-integration ③(add/remove 对)+②(run 终点)
- **H④ 审批 waterfall:结构性不适用于调度路径(如实记录,非遗弃)**——宿主 approval/request waterfall 按 agent/session 分派,调度运行无 session/agent 可挂(结构错配,非 API 缺席);交互路径本就双门(宿主工具审批+插件预检门,攻击表 22 行的回归基础),改为单门=安全回归。此判定有 dsh-user-approval 契约佐证(Scoped<ApprovalService> per-agent 分派)
- **附带**:version.ts 钉版修复(0.1.8 升版时漏改,PLUGIN_VERSION 停在 0.1.7——自检/更新卡报旧版;host-integration 测试实抓)

## 五、验证

- 824/824 全绿(0.1.8 基线 816 → 0.1.8 终 820 → 0.2.0 终 824);rpc-bench 基线在档
- 真机:0.2.0 已部署 web profile(文件+package.json);宿主 rc.5 启动失败为环境迁移问题(二分证实:无本插件同败、fresh profile 同败、双 node 版本同败、恢复网络后同败——`webserver(required)` 等 `webStartup`,rc.5 启动语义有变或全局安装不完整),宿主恢复后面板走查(追更卡/插件页 tab/两步删除/审计明细)即补

### G 追更一等公民(已落地)
- 自动化 tab 追更卡:三条免参数关注流配方(B站 feed 免 id/微博 feed --type following/twitter device-follow——manifest 实取核实),点击填入创建表单(cron 0 9,13,19 * * *),watch/可见性/静默表单再调;知乎逐人拉保持 SKILL.md agent 路径(参数形态不猜)
