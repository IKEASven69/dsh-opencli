# 0.4.7 版本规划(2026-11-03 · 呈审)

> 基线:v0.4.6 已发(GitHub release + npm @cold777/dsh-opencli@0.1.0)。本期主题:**打磨与闭环收口**——
> 不开新大战线,把 0.4.6 的直连引擎铺满全原语族,把场景倒推第二批(变化时间线深化/通知静默时段)做完,
> 同时把对外交付面(npm/内容/上游关系)收拢。

## A. 直连传输铺满(0.4.6 A 线收口)

0.4.6 只接了 eval 族;本期把剩余原语族全部迁到 daemon 直连,统一走 `direct.ts` 能力探测+CLI 兜底:

| 原语 | 直连动作(daemon /command) | 备注 |
|---|---|---|
| opencli_state | `state`(返回结构化页面摘要,替代 outerHTML) | 高频,收益大 |
| opencli_screenshot | `screenshot` | 高频 |
| opencli_click | `click` | 写原语,审批门不变 |
| opencli_scroll | `scroll` | 高频 |
| opencli_tabs | `tabs` | tab 管理 |
| opencli_close | `close-window` | 低频 |
| browser cookies | `cookies` | 低频 |
| site 适配器命令 | **不走直连**(适配器逻辑在 CLI 侧),如实文档化 | — |

验收:每条原语直连往返毫秒级(基准报告带对照数字);审批门/轨迹/画布链路回归全绿。

## B. 场景倒推第二批

| 项 | 内容 | 场景 |
|---|---|---|
| B1 变化时间线深化 | 面板任务卡「📊 变化」展开已有;补 7 天聚合视图(每日一行:新增/消失/位移)+导出 CSV 含 diff 列 | 盯一周后想看趋势 |
| B2 通知静默时段 | 任务级 `quietHours`(如 23:00-07:00 静默,命中暂存早上合并推送)——高频任务夜间不再吵 | 手机放枕边的用户 |
| B3 通知级别 UI | `notifyLevel quiet` 已有后端(0.4.6),面板任务行加级别切换下拉 | 与 B2 配套 |

## C. npm/分发收口

| 项 | 内容 |
|---|---|
| C1 npm 0.1.1 | 双语 README 已进包(待用户跑 publish);发布后验证 dsh-market 目录版本更新 |
| C2 GitHub README 徽章 | npm 徽章已加;观察 dshmarket 双包并列截图(已存证)是否需要 README 说明区分 |
| C3 AGENT_INSTALL.md | 入 npm files 清单(已在 0.4.6 补强做了),验证 npm 副本链接可达 |

## D. 上游关系跟踪

| 项 | 状态 |
|---|---|
| opencli#2761 daemon 版本竞争 | 已提交,等响应;如上游修了,验证 A 线直连不受影响 |
| opencli#2762 回环可达性 | 同上;扩展 DAEMON_HOST 硬编码补丁我们已在本地验证 |
| dsh 预设作用域 | docs/RESEARCH-20261030 已记录;ctl+收件箱方案是绕行,等 dsh 上游生态位开放 |

## 排序

| 优先 | 项 |
|---|---|
| P0 | A 直连铺满(全原语族+基准对照) |
| P0 | C1 npm 0.1.1 发布(等你跑 publish)+收录验证 |
| P1 | B1 变化时间线深化 |
| P1 | B2/B3 通知静默时段+级别 UI |
| P2 | D 上游跟踪(被动) |

## 明确不做(本期)

- 远程网关/多设备同步——与"本机登录态"定位相抵
- canvas 类型化 visual ref(BrowserSkill 路线)——复盘面已独占,不追操作面
- 新站点适配器批量添加——上游 OpenCLI 负责适配器内容,我们负责工具化与产品层
