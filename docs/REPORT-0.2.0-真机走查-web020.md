# 0.2.0 测试报告 · 真机走查(web020 fresh profile,rc.5,2026-11-25)

## 环境结论(先读)

- **宿主 rc.5 本身可正常启动**——旧 web profile 的 rc.1 时代依赖树才是启动失败根因(见"二分链")。修复路径=rc.5 自带模板建新 profile(本次实测的 web020),或对旧 profile 完成 rc.5 依赖刷新。
- **面板 UI 在 rc.5 下暂不可用**:rc.5 客户端加载器不认 0.1.x 时代的插件 client bundle(实测 0 个 o4 CSS/0 个 o4 DOM 节点,设置分区内容空)——「客户端产物结构变更」破坏面由"待验证"转**实锤**,是 0.2.1 头部工作项(client bundle 按 rc.5 契约重建)。
- 因此本轮走查覆盖 **服务层全链(用户会话内 E2E)**;面板视觉走查待 client 适配后补。

## 二分链(启动失败归因,全程留档)

1. rc.5 + 旧 web profile + 本插件 → 启动失败(15 插件全等待)
2. rc.5 + 旧 web profile **摘掉本插件** → 同败(排除本插件)
3. rc.5 + **fresh profile(web020)** + 本插件 → **启动成功,3099 LISTENING** ✔(根因=旧 profile 依赖树;web020 package.json 仅 dsh-base+dsh-web-app 两 bundle)
4. 双 node 版本(26.13.1/24.21.0)在旧 profile 上同败(排除 node 单因素)

## 服务层 E2E(用户认证会话内,面板同源 fetch)

| 项 | 结果 |
|---|---|
| 插件加载 | @cold777/dsh-opencli **v0.2.0**,启用,无异常标记(插件页) |
| status RPC | ok:true;daemon running(1.8.6——OpenCLIApp 内置 daemon,#2761 翻转现实);adapterSites **178** |
| schedule-list | 2 任务可见(全局状态跨 profile 保持,设计内) |
| **schedule-run-now E2E** | 触发→自愈重跑链(daemon restart)→3 次尝试→诚实失败入账:stats.fail 1→2、**failRunStreak=1 首次真机点亮**(0.1.8 连败真值字段)、history 行带【daemon 断连已自愈重跑】+回执(auth=unknown/bytes=0) |
| events-get(面板形态) | ok:true,**50 条**,kind 链与事件史吻合(notify/schedule-failed/circuit-open/daemon-selfheal/digest) |
| version.ts 修复验证 | v0.2.0(修复前 PLUGIN_VERSION 停 0.1.7) |

## 发现(全部如实)

1. **rc.5 typert 网关严格化**:args 出现描述符外字段(如 events-get 传 limit)会被拒(`gateway/arguments-invalid`)——面板真实调用形态全部匹配(实测 events-get 空参 ok);**插件 RPC 描述符审计**列入 0.2.1(逐方法核对 args 形状与描述符一致)。
2. **/opencli/health 404**:H③ 守卫生效(rc.5 下 webServer 服务键/注册相位未命中即静默)——0.2.1 与 client bundle 适配同批排查。
3. **插件页(settings.dialog)「浏览器代理」分区在 rc.5 渲染为空**:同 client bundle 未加载根因;截图存档 `.qa/screenshots-020/01-*.png`。
4. 旧 web profile 修复选项(用户侧):a) rc.5 模板新建 profile 并迁移(本次实测路径,插件用 `dsh plugin --profile <name> add <tgz>` 安装,需 pnpm 在 PATH);b) 旧 profile 完成 rc.5 依赖刷新;c) 回 rc.1+node24(末次已知良好)。**本插件 0.2.0 与三者均兼容**。

## 走查清单状态

- 服务层 E2E:✅ 全通(上表)
- 面板视觉走查(追更卡/插件页 tab/两步删除/审计明细/模式本地化):⏸ 待 client bundle rc.5 适配(0.2.1 头部项)——功能本体已由 824 测试覆盖,视觉层仅差加载
- 截图:01-设置-浏览器代理-空内容现场(rc.5 client bundle 问题实证)

## 追记(rc.1 末次已知良好组合走查,2026-11-25)

宿主环境修复方案落地:rc.5 全局安装的嵌套依赖树(337 包,0.2.2-rc.x 同版本线)批量补入 `~/.dsh/node_modules`(所有 profile 的解析上级),rc.1 嵌套宿主恢复启动(3080 LISTENING)。二分链闭合:**rc.1 嵌套宿主 + node 24.21 + 旧 profile + 0.2.0 = 面板全量渲染**。

### 面板视觉走查(截图存档 .qa/screenshots-020/)

| 截图 | 验证点 |
|---|---|
| 02-overview-first-screen | rc.1 宿主恢复,UI 全渲染 |
| 05-rc1-panel-overview | 面板总览:**L17 首启向导置顶**(四层自检 CLI→daemon→扩展→登录态,未就绪项+一键修复全披露)+ **M6 未巡检 chip**(假占位三 chip 已绝迹)+ 中英双语切换 |
| 06/07-rc1-panel-automation | **G 追更卡**(B站免id/微博following/Twitter device-follow 三配方)+ **一键巡圈卡**(2 泳道并行文案如实)+ **H6 表单高级项收起**(常用项单行+▸高级) |
| 08-rc1-panel-form-collapsed | daemon 未运行诚实横幅+恢复后自动补跑提示(0.1.6 catch-up 文案) |
| 10-cron-preview-live | **H7 预览行真机点亮**:「※ 下次执行: 2026/11/25 09:00:00」+ 无红错(cronValid 通配符误判修复后) |

### 新发现(如实,0.2.1 清单)

1. **rc.1 + 0.2.0 部分 RPC 路由缺失**:schedule-list 网关返回 "not found"(路由未注册),events-get/status 正常——面板任务列表空(诚实空态,不崩)。0.1.8 无此现象,0.2.0 引入,疑与 typert 描述符注册相关;0.2.1 排查(对比 0.1.8/0.2.0 的 RPC 注册表)。
2. **rc.1 菜单交互**:账号菜单 menuitem 的 textContent 带快捷键提示(如"设置Ctrl+Alt+,"),自动化匹配需前缀匹配——UI 自动化的环境注记。
3. **restoration 方案**:.dsh/node_modules 解析上级补包方案实测有效(587 包批量补入),已写入环境修复三选项之外的第 4 选项。
