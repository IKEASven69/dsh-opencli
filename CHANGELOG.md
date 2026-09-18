# 更新日志

格式参考 Keep a Changelog;版本与 GitHub Releases 一一对应。

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
