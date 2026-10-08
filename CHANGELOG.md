## 未发布

> GUI 走查五连修(浏览器环境模拟用户使用验收发现;详见 `docs/FIX-20261008-GUI走查修复.md`)。

### 修复
- **定时行内状态不更新**:立即跑后"上次/计数"整个重试周期(~2.5min)停在旧值——分散刷新 2.5s~240s 覆盖完整重试链;时间线展开期间 15s 轮询
- **行内 verdict 恒亮 ✓**:与时间线红失败行同屏矛盾——空史无符号/有成功绿 ✓/全失败红 ✗
- **时间线卡片溢出裁切**:`.o4-row` 允许换行 + 卡片 `flex:1 1 100%` 独占整行
- **刷新芯片与文字芯片不齐**:`boxSizing:border-box` + 等高 23px
- **占位文字对比度**:`.o4-load` 0.38 → 0.58
- **定时执行不落「运行轨迹」**:`runSiteCommand` 补 `recordTrace`(带 `schedule` 前缀与手动 browser 命令区分),复盘链路闭合

### 测试
- trace-get 断言改 browser 子集相对顺序(定时链路写 trace 后绝对首条假设失效);watch 用例新增"定时执行落 trace"回归断言;159 全绿

## 0.4.2 — 2026-10-08

> ⚠️ **升级必读:插件更新后必须重启 dsh daemon 才生效**(长驻进程不热加载插件构建)。

### 新功能
- **录屏回放**:browser_* 全族命令自动落盘 trace(~/.dsh/opencli-traces,jsonl+5MB 轮转);trace-list/trace-get RPC;**trace_replay 工具**(agent 复盘"上次为什么失败",跨日聚合+本地时区);面板「运行轨迹」卡(红绿状态点/耗时/展开原文)
- **对话内任务预览卡片**:site/site_batch/browser_do 输出结构化渲染(命令块+四态状态色 ✓✗⚠+汇总表+原文围栏,0.2 视觉)
- **报告导出(带出处)**:buildReport 纯渲染层——多站/定时快照合并为 markdown,每节**出处三元组(命令+时间+快照路径)+判定结论**,尾部"数据源与缺口声明"逐条列失败/静默失败/缺席,**零模型介入**;site_batch 自动落盘+report-build RPC+面板「生成报告」按钮
- **站点健康度**:上游 issue 实测数据(小红书/instagram 受损等)驱动命令页徽章+知识卡健康段,受损站自动提示 browser 兜底
- **MCP Resources 知识暴露**:dsh 0.2 ctx.mcpResources seam——opencli://sites/{site}/knowledge 资源;0.1.x 走 knowledge-get RPC 双路径
- **W3 分层命令路由 site_route**:SystemOne 两步 choice(先站后命令,≤24 候选)亚秒出命令行+Top3 概率
- **采集快照+时间线**:定时成功执行存结构化快照(50 份轮转);schedule-history 快照索引;面板时间线趋势柱状图+运行史
- **watch 关键词监控增强**:命中事件总览可见,大小写不敏感
- **SWR 面板缓存 v2**:重开秒显上次数据(损坏缓存全防护:try/catch+结构校验+版本键+12h 过期)
- **知识外移**:pitfalls/健康度独立为 knowledge/*.json 数据文件(知识更新不动代码)

### 样式(0.2 视觉对齐)
- tab 激活态品牌蓝渐变+内描边+顶部高光;卡片渐变表面+顶光+悬浮投影;输入框品牌焦点环;细滚动条;次要文字对比度提升;四档模式对勾语义修复;watch/健康徽章/轨迹卡/时间线全套新组件样式

### 性能
- laya 权重激活期后台预热(冷加载 60s 不再砸首次调用);卡片去 transform 降绘制;目录缓存+快路径

### 可靠性修复(全部经独立子代理真机复核)
- **[HIGH] cron 调度器从不与当前时间比较**——数字合法即每分钟触发,对站点高频轰炸(历史 state 累积 5055 个 marker 实锤);修复+字段越界拒收+逗号列表语义
- **任务 site 前缀剥离**:按面板占位符创建的任务此前 100% 失败(unknown command site)
- **laya noul 放弃阈值判失败**(实测错误文本同样 0.9+,拦截权收归确定性规则层;真数据 0.66-0.77 安全通过)
- **try-run exit≠0 恢复链**:扩展未连/登录缺失/风控墙归类+统一中文指引,不再裸 YAML 46 秒
- **opencli_catalog 过滤参数全失效修复**(query/site 真正生效)
- schedule-add cron 五段校验+越界拒绝;调度 marker 独立 Set 不落盘+loadState 自愈 5055 键
- 7 个 RPC 空 request 守卫;knowledge-export 空 sites 报错;快照时间戳 ISO 还原;EN 站点数动态化
- resolveBin 版本切换免疫(vfox/nvm 多版本目录扫描,活跃版本切走自动找回 opencli)
- 逗号运算符吞行/TimelinePanel 作用域/schedule-history 形参名 三连根因修复(时间线不渲染缺口)

### 工程与文档
- 159 单测(0.4.1 时 74);审查套件 21 项;竞品监控脚本 competitor-watch.cjs;PM-RESEARCH 竞品全景(官方注册表 4412 条实测);SKILL.md 全工具速查;部署断层教训入档

# 更新日志

格式参考 Keep a Changelog;版本与 GitHub Releases 一一对应。

## 0.4.1 — 2026-10-03
### dsh 0.2.0 适配(双版本兼容:0.1.5 与 0.2.0 同时 20/20)
- **新增 ctx.subprocess 原生执行路径**:0.2.0 把命令执行迁到 subprocess seam(官方 bash 工具同款),旧 ctx.shell.execute 需要沙箱 policy 管线且插件直调不可靠;经 reflect 旁路可选读取(刻意不放 static inject——cordis 对声明服务做加载期解析,0.1.x 宿主没有 subprocess 服务会导致整个插件加载失败)
- 0.1.x 回落路径升级为多形态自探测:resolve包裹/直传/argv数组,锁定首个真实产生输出的形态(异常文本不再被误当有效输出);spec 携带 danger-full-access 沙箱策略(可信进程内消费者,与 0.1.x 无沙箱行为一致)
- 适配事实清单:0.2.0 强制校验插件 peerDependencies(我们的宽范围 >=0.1.1-rc.2 <0.3.0-0 过闸,写死 ^0.1.x 的插件被拒载);0.2.0 对 patch 引用未安装 bundle 的 profile **静默退出**(0.1.5 容忍)——升级前自查 cordis.patch.yml;0.1.7+ 定时任务默认关闭(与我们无关,定时是自带实现)
- 审查套件健康检查改环境自适应(健康态"一切正常"/降级态"daemon 未运行"两态都算渲染成功)
- 验收:0.2.0-rc.2 全套 RPC+面板四 tab+179 知识卡导出 20/20;0.1.5-rc.1 回归 20/20;74 单测绿

### Agent 发现性与 1.8.8 跟进
- **SKILL.md 全工具速查表**:site/site_knowledge/site_batch/browser 原语/so_verify/so_pick 各自的使用时机 + 失败自救签名 + 无人值守说明
- **systemPrompt 注入更新**:目录文本新增辅助工具段(site_knowledge 先读/so_verify/so_pick 亚秒判定/site_batch preflight/watch 关键词+风控退避),agent 零配置发现新能力
- **上游 1.8.8 升级完成**(undici CVE 修复;站点 176→180):审查套件全过,插件兼容
- 审查套件 19→**20 项**:新增 knowledge-export RPC 真值(179 张卡真机导出)+ watch 关键词落盘;站点计数改为动态断言(不再钉死 176)
- 修复 knowledge-export 空 args 崩溃:**网关对空 args 传 undefined**,handler 参数必须可选链(真机 gateway/internal 复现)
- dsh017 profile 依赖从 GitHub tarball 切本地 file:tarball(网络不可靠);dsh 0.1.7-alpha.1 兼容实测进行中

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
