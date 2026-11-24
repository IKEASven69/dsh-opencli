# 0.2.0 测试报告 · 单元与集成(2026-11-25)

## 结论

**824/824 全绿(54 文件),零 unhandled error。** 基线 0.1.8 终态 820 → 0.2.0 净增 4 例(host-integration 宿主原生集成套件),另有既有用例加固若干。

## 分层覆盖

| 层 | 套件(择要) | 覆盖 |
|---|---|---|
| 服务单元 | advanced/coexistence/task-health/savestate-order/hardening/fallback-drill-scrub/notify/knowledge/health-check/cli2/zerocfg/climajor/benchmark | 真实性判定三态徽章(含 0.2.0 ⚪ 空结果)/任务健康 stats+连败真值/保存写链串行/收窄纪律/cron 归因/CLI 共存 |
| 面板纯函数 | cards/flagship-regression | 卡片投影/站点图标 |
| E2E(宿主内) | cards 端到端/trace | site execute 判定标注流转/轨迹落盘 |
| **宿主原生集成(0.2.0 新增)** | host-integration.test.ts 4 例 | ①/health 路由 handler 实调断言 200+payload(version 断言实抓 version.ts 钉版漏改并促成修复)/②ctx.jobs 注册+label+结算 completed/守卫无服务照跑/①schedule add+remove 事件对 |

## 过程质量事件(全部闭环)

1. **benchmark canary 一次性 flake**(11-24):0.1.6 归档 reporter 首战抓获(`.qa/test-failures.jsonl`),3 连复跑绿;根因两个假设(跨实例写链/写盘吞错)列入 0.2.1 P1-4 深挖。
2. **fallback-drill-scrub 2 红**:本机 Node 24.21→26.13.1 升级后 `--experimental-transform-types` 旗标被移除——测试改双代自适应(旗标探测),演练脚本引源换 strip-only 干净的 scrub-rules.ts。
3. **health-check 6 红(0.2.0 PF4 缓存引出)**:daemonStatus 15s 缓存会漏检窗内版本翻转(#2761 正确性要求真值)——修订为「预检入口与流程内重探保持真探,缓存仅 status RPC/doctor/目录文案三处 entry 型路径」;PLAN 如实记录降级过程。
4. **coexistence ⑤/⑥ 红**:同款缓存渗透,测试按既有 flipCountCache 清理模式补齐。

## 基线与台账

- 测试基线:0.1.8 = 816 → 0.1.8 终 820 → 0.2.0 = 824(新增 host-integration 4 例)
- 失败归档:.qa/test-failures.jsonl(reporter 服役,轮转 5MB)
- 运行命令:`npx vitest run`(约 20s);构建:`npm run build:local`
