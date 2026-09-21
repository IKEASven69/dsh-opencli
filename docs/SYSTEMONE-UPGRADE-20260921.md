# OpenCLI × TypeSafe System One(JEV)升级方案

> 起草:2026-09-21。依据:TypeSafe API 已公开发布(`POST https://api.typesafe.ai/v1/systemone`,
> Python/JS SDK 齐备,模型 `jev-latest`/`jev-1.13.0`,三种问题原语 choice/score/noul,
> 响应带 confidence + probabilities;官方文档 docs.typesafe.ai,含 intent-routing、
> confidence-gated routing、speculative fan-out 三个现成模式页)。
> 参照实现:browser-use/jev-ultrafast(12.4k★)已验证"元素表 → 一次决策"路线。

---

## 一、为什么是 OpenCLI

OpenCLI 的每一层"决策点"目前都由大模型承担:命令目录注入 systemPrompt 让模型第一轮选命令、
browser_do 的 analyze→init→verify 循环、write-approval 人工门前的风险判断、autofix 的去向决策。
这些全是**封闭选项集的结构化决策**——正是 System One 的靶心:

| 决策点 | 现状 | System One 化后 |
|---|---|---|
| 命令选择 | 目录全文注入 systemPrompt,大模型第一轮选(贵、慢、易选偏) | 分层 choice:先选站/类目,再选命令(官方 hierarchical_classification cookbook),一次调用,亚秒 |
| 执行步骤 | browser_do 循环内大模型逐步决策 | 元素表编号 → 操作 choice(CLICK/TYPE_TEXT/SELECT/SCROLL/WAIT/DONE/BLOCKED)+ 目标 choice,一次请求并行出两个答案(jev-ultrafast 同款,仅 TYPE_TEXT 才调文本模型) |
| verify 判定 | 大模型读页面断言 | noul:"页面状态符合预期吗?"——亚秒、零生成 |
| write-approval 门 | 静态规则+人工 | score 给风险分级,高危才升人工门 |
| autofix 去向 | 失败即进修复流程 | confidence-gated routing:高置信自动修,低置信才升级大模型 |
| site_batch 分发 | 固定并行 | 每站一个 noul(本次登录态/页面可用?)先体检再派发 |

收益预估:决策延迟从"每步一次 LLM 调用(2-15s)"降到 70-500ms;命令首轮选择不再消耗
systemPrompt 巨量 token;verify/巡检/体检类高频判定成本趋近于零。

## 二、接入形态

API 最小形状(完整参考 docs.typesafe.ai/api):

```json
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
{
  "state": "页面元素表/文本状态",
  "model": "jev-latest",
  "questions": {
    "operation": {"type":"choice","instructions":"…","criteria":{
      "CLICK":"…","TYPE_TEXT":"…","SELECT":"…","SCROLL_DOWN":"…","DONE":"…"}},
    "click_target": {"type":"choice","instructions":"…","criteria":{
      "[1]":"Change ticket type","[2]":"combobox Where from?","[3]":"…"}},
    "page_ok": {"type":"noul","instructions":"页面状态符合任务预期"}
  }
}
```

响应每个问题带 `choice/score/noul + confidence + probabilities`。
SDK:`pip install typesafe-sdk` / JS SDK 已发布;另有官方 Claude Code skill
(`npx skills add typesafe-ai/skills`)。**降级路径**:jaredpalmer/kev(Apache-2.0,
Qwen3.5 底座 0.8B/4B/9B)API 与官方兼容,可本地起服,把 base URL 指过去即可——
供应商风险由"API 兼容的开源平替"兜住。

## 三、落地步骤(建议四周)

1. **W1 · 决策层封装**:`src/systemone.ts`——Typesafe 客户端封装 + kev 本地端点适配 +
   超时/失败降级(任何 System One 失败都回退现有 LLM 路径,零功能损失上线)。
2. **W2 · verify 先行**(风险最小、频率最高):browser_do 循环里的每步断言换成 noul,
   低置信(<0.7)才回喂大模型。产出真机 A/B 数据:判定一致率、时延对比。
3. **W3 · 命令选择分层 choice**:命令目录按站分组预编译成 choice criteria;
   入口先 route(站/类目),再 route(命令), confidence 低于阈值回落现有 systemPrompt 方案。
4. **W4 · 步骤决策 + 审批分级**:browser_do 步骤循环改 jev-ultrafast 形态
   (操作+目标一次请求);write-approval 前置 score 分级,高危才进人工门。

## 四、风险与边界

- `jev-latest` 是黑盒:版本 jaggedness 官方自己都有专页(model-jaggedness/jev-1.13),
  关键路径必须 confidence 门+降级,不许裸切;
- choice 候选过多(200+ 命令)必须分层,单题候选建议 ≤30(官方 hierarchical 范式);
- 网络不可达环境(如内网)走 kev 本地端点;
- Typesafe 无公开定价页——接入前先在 console 确认计费,输出免费仅社区说法。


## 调用渠道调研(2026-09-21,决定:JEV 暂缓进 backlog)

| 渠道 | 结论 |
|---|---|
| 官方 API | 唯一真渠道;三道门槛:注册 console 拿 key / 计费未公开 / 国际链路偶发超时(实测时好时坏) |
| OpenRouter | ❌ 446 模型零命中,不承载 jev/typesafe |
| kev 本地 | ✅ 真实(Apache-2.0,HF 权重 0.8B/4B/9B,API 完全兼容)但需 CUDA/Apple Silicon + 大内存——本机性能带不动,否决 |

**零成本准备(先行)**:W1 的 `systemone.ts` 封装层先写"接口抽象 + 降级直通"(provider/endpoint/key 全可配,默认直通现有 LLM 路径)——不调真实 API 也能合入;任一渠道成熟(拿 key / kev CPU 量化版)即插即用。
**触发重估**:console 开放注册且计费明朗 / kev 出 CPU 量化版 / 国际链路稳定化。

