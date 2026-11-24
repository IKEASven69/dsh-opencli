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

(逐项追加:条目/行号/测试)
