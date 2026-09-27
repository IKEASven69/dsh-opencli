# 更新日志

格式参考 Keep a Changelog;版本与 GitHub Releases 一一对应。

## Unreleased

### 登录态 preflight + 面板知识卡入口
- **site_batch 登录态 preflight**:派发前按目录 domain 字段检测同域冲突(如 twitter + x 同属 twitter.com),同域站点自动改为组内串行并注明——对冲"同域并行互相踩登录态/标签页且无报错"(BrowserSkill #132,其用户求 preflight 而不得)
- 面板命令页新增「导出知识卡」按钮(knowledge-export RPC,toast 报告导出数量与路径)
- 修复 package.json description 双重编码乱码("登录态浏览器代理"曾显示为"鐧诲綍鎬佹祻…"),dsh-market 拉取的描述曾为乱码;补双语描述+keywords(score 合法抬分项)
- 修复 puppeteer-core 误入 runtime dependencies(构建工具,回 devDependencies,免得跟着插件装进商店)
- 74 测试绿,审查 19/19

### 站点知识包(P1:上游 #2539 砍掉 sitemap/CLI hub 后的知识分发真空)
- 新增 agent 工具 `site_knowledge <站>`:动手前读"地形图"——该站全部结构化命令(read/write 标记)+已知坑(风控/登录/改版,人工种子覆盖微博/B站/知乎/小红书/豆瓣/淘宝/京东/YouTube 等)+**失败签名恢复表**(EMPTY_RESULT/风控墙/429/NAVIGATION_REJECTED → 含义 → 恢复动作),命中签名按表自救,不现场试错
- 新增 `knowledge-export` RPC:全部/指定站知识卡导出为 markdown 到 `~/.dsh/opencli-knowledge/`,可分享、可进版本库;dsh 0.1.6+ MCP Resources 将复用同一数据源
- 知识三源:opencli 目录(实时)/失败签名表(与执行真实性层同源)/pitfalls 种子(宁缺勿造,未知站为空)
- 依据:browser-use #5841"每次会话从零重学站点"(10 评论正式提案)+ 上游退出知识分发
- README 补「固定命令 × 任意网页原语」双模式呈现(PM 调研 t/1225086 弃用理由);测试 64→72

### 风控感知退避(PM 调研直接驱动)
- 定时任务重试命中登录/风控墙时,重试间隔从 15s 提到 **2 分钟**(软封禁冷却);其他失败维持 15s
- 依据:小红书自动化封号是中文用户最真实恐惧(V2EX 两起封号帖;上游 30 天 3 个 XHS 风控 commit),撞墙后立刻重试等于加重风控信号

### Watch 关键词监控(主线 B 第一片,登录态数据产品)
- 定时任务新增 `watch` 字段(关键词,逗号/空格分隔,≤120 字符):每次采集成功后做确定性匹配,命中任一关键词 → ingest 事件 `watch-hit`(🔔 通知)
- 场景:微博热搜监控"出现'放假安排'就通知"/价格监控/舆情关键词——填 dsh-market 微博插件生态空白(≈0 个专用插件)
- v1 故意用确定性匹配,零误报;noul 模糊"值得关注的变化"判定留 v2(真机实测 laya 判别力不足,宁缺勿误报)
- 面板:自动化 tab 创建表单新增 watch 输入框;任务行内 🔔 徽章展示监控词
- schedule-add 幂等去重升级:重复 add 更新 watch 字段而非新建僵尸副本

### 执行真实性层(“失败要说真话”——W2 落地)
- 新增 `verifyResult` 两层判定,三处执行面共用:**site_batch**(每站结果标注 实测有效/疑似静默失败,汇总计数;派发前目录预检拼写错误)、**try-run**(面板“试试看”:空结果/风控页/登录墙直接报 ok:false 并给原因,不再假成功)、**定时任务**(规则命中或 noul 强失效按失败重试,可疑只标注)
- 第一层为确定性规则(opencli 失败词汇 EMPTY_RESULT/AUTH_REQUIRED/NAVIGATION_REJECTED + 登录墙/风控关键词 + 错误 JSON),零推理、零延迟
- 第二层 laya noul 兜底判未知形态;**真机实测:laya 对明显错误文本判别力不足(P≈0.9)**,故只对规则放行的文本做模型判定、可疑仅标注——判别数据见 docs/USER-NEEDS-RESEARCH-20260925.md
- 修复:typesafe/laya 两 provider 应答归一化不一致(choice/noul/score → 统一 {type,value,confidence}),此前 laya(默认 provider)下 so_verify/so_pick 运行时读不到结果、整层静默失效
- SystemOne 不可用时全部路径降级为原行为,零功能损失;测试 53→61 全绿

### SystemOne 决策层(亚秒决策,不耗大模型 token)
- 新增 agent 工具 `so_verify`(noul 断言:P(页面符合预期),亚秒)与 `so_pick`(choice:封闭选项集选点,2-30 项,返回 Top3 概率);低置信/不可用时提示回退常规判断,零功能损失
- provider 三选一:**laya**(默认,@receptron/laya 本地 ONNX,免费/离线/隐私,懒加载——未装权重时优雅降级)/ **typesafe**(官方 Jev API,key 取 `TYPESAFE_API_KEY` 或 `~/.dsh/typesafe-key`)/ passthrough
- 构建管线:@receptron/onnxruntime 原生模块标记 external,保持运行时动态导入(插件自带 node_modules 解析)

## 0.4.0 — 2026-09-18

### 面板(四 tab 重排:总览 / 命令 / 自动化 / 安全与设置)
- 品牌 fusion 标(OpenCLI `>_` × DeepSeek 官方鲸)+ Lucide 全套线性图标 + 48 站点官方品牌图标(品牌色圆角块)
- 健康区 hero 化:脉冲状态灯 + 大数字统计(站点/扩展/审计/模式)+ 渐变网格底
- 状态机四态:检测中骨架屏 / 正常 / 依赖缺失(一键修复)/ 错误(内嵌诊断,永不弹窗)
- 命令页:官方站点图标 + 命令徽章(点击复制调用格式)+ 禁用即时收缩目录
- 定时任务:两行布局 + 重试 ×3 + 通知 + 立即跑 + 运行历史圆点 + daemon 离线横幅
- 安全与设置:审批门 hero + 四档模式 + 限流限域清单 + 供应链自证(构建 sha256)+ 登录态桥(Browser Use)+ 版本与更新
- 章节手风琴全部可用(安装引导三步带复制/启动按钮;profile 说明)
- 配色与 dsh 原生融合(采样弹窗真实色:中性锌灰表面 + DeepSeek 蓝 #4D6BFE)
- 中英双语;全组件微交互(hover/focus/入场阶梯动画)

### host
- 新增 `browser-cdp`(探测 daemon Chrome 的 CDP 端点,登录态桥前置)
- 新增 `audit-list`(审批门拦截审计,近 7 天计数 + 最近 20 条)
- 新增 `logs-tail`(日志查看;opencli 未暴露日志文件时降级为诊断快照)
- `settings` 返回构建 sha256 + 审计计数
- 定时失败重试 ×3(15s 间隔)+ 通知事件;修复 `ingest-events` 未声明字段
- `status` 版本解析合并 stderr;健康区不再被 8MB 目录阻塞(后台异步预热)

### 修复
- **Windows:ctx.shell 为 pwsh 执行器**,无扩展 shim 静默不执行——`DSH_OPENCLI_BIN` 必须用 `.cmd`
- `runHistory` 未声明字段导致 scheduleList 崩溃;构造器 loadState 竞态冲掉定时任务
- 面板 12 处 RPC 形参包裹,适配 0.1.5 网关严格校验

## 0.3.8 — 2026-09-17
- 12 处面板 RPC 形参包裹(同上,提前修复部分);全权审查套件 19 项(`full-review.cjs`)

## 0.3.7 — 2026-09-16
- 修复 0.3.6 构建产物缺失:site_batch / 定时运行历史 / browser 门面进入 lib
- `runHistory` 字段声明 + loadState 竞态两处根治
- README 重写;站点品牌图标素材库

## 0.3.6 — 2026-09-15
- 定时任务持久化 + 真执行(dsh.schedule);site_batch 批量采集
- ⚠ 该版构建产物不完整(缺上述功能),建议直接使用 0.3.7+

## 0.3.5 / 0.3.4 — 2026-09-14
- browser 兼容门面(防 inconsistent binding);probeCDP 前置;限流与限域
