# OpenCLI 下一步路线图(2026-09-22)

> 现状基线:v0.4.0 已发布(四 tab 面板 / 审批门审计 / 定时可靠性 / dsh 原生配色融合 / 品牌融合标 / Lucide+站点官方图标),47→49 测试绿,19 项全权审查套件全 PASS。
> 已验证:SystemOne API + 用户 key 实测 0.79s/610 tokens,choice confidence 1.0(命令选择全对)。

## 主线 A · SystemOne 决策层( JEV/Laya,已解封)

| 周 | 内容 | 验收 |
|---|---|---|
| W1 | `systemone.ts` 决策层封装:provider 三选一(typesafe / laya 本地 ONNX / passthrough 直通降级)+ key 配置 + 超时回退 | 单测:mock provider 决策/降级路径;真实 API 冒烟 |
| W2 | verify noul 化:browser_do 每步断言换 System One,置信 <0.7 回喂大模型 | 真机 A/B:判定一致率、时延对比数据 |
| W3 | 命令选择分层 choice:目录按站分组 → 先站后命令,低置信回落现有 systemPrompt 方案 | 首轮命令选择不再消耗目录 token;选对率对比 |
| W4 | 步骤决策(元素表→操作+目标一次请求)+ 审批 score 分级(第一版只提示不放行) | 决策审计进 audit-list;高危全部进人工门 |

provider 说明:typesafe(用户 key,云端)/ **laya**(@receptron/laya,Node.js+ONNX CPU 本地,免费离线隐私最优,权重 1.7GB 首次下载)/ passthrough。默认建议 laya(隐私+零成本),敏感页面强制本地。

## 主线 B · 登录态数据产品(条件监控 + 时间线)

| 周 | 内容 |
|---|---|
| M+1 | 采集结果落盘(每次定时执行存结构化快照) |
| M+1 | watch 条件触发:JEV noul/score 判断"是否有值得关注的变化"→ 通知 |
| M+2 | 面板时间线:每任务的采集历史可视化(diff/趋势) |

场景闭环:"知乎这个回答有新评论 / 价格低于 X / 掉粉就通知"——自然语言可编程的登录态监控,官方 Browser Use 永远不会做(无持久身份与存储)。

## 主线 C · 官方 Browser Use 融合(等 0.1.6/0.1.7 stable)

- CDP 探测 + `browser_cdp` RPC 已完成(v0.5 前置)
- stable 后:登录态桥一键(写 profile patch:`mode: attach` + endpoint)+ 面板明示审批门边界
- MCP Resources 知识注入(sitemap/pitfalls/commands 打包暴露)

## Tier 2 · 护城河加深

- 知识包生态:站点知识(sitemap/pitfalls)打包导出/安装/分享
- 多账号:OPENCLI_SITE_SESSION 透传 + 面板身份切换
- governor 竞态修复(P2,已复现:僵尸定时任务)

## 工程债

- opencli 1.8.8 跟进(undici CVE;npm 未发,等发布)
- Windows .cmd 已自动探测(resolveBin globalMain,已完成)
- 测试基建:面板 SWR 重做(上次回滚,待定位偶发空白主因)

## 节奏(未来几个月)

- **9 月底**:W1+W2(决策层封装 + verify noul 化)
- **10 月**:W3+W4 + 主线 B(监控/时间线)→ v0.5 发布
- **11 月**:知识包生态 + MCP Resources(dsh 0.1.6/0.1.7 stable 后)→ v0.6
- **12 月**:dsh stable 大版本回归 + 桥接正式化 → v1.0 候选
