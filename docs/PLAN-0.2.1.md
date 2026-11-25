# 0.2.1 施工计划(对话侧 UX 主轴)

> 用户定调:对话 dsh 是用户主入口,对话时的调用必须出界面;从用户需求和实际体验出发。
> 纪律(用户明示,延续 0.2.0):可实装的功能全部当前版本做完,只有「等外部发布」或「尚未能实现」才允许后排。

## 一、范围与状态

| # | 项 | 状态 |
|---|---|---|
| 1 | **浏览器原语执行卡**:open/state/click/type/fill/extract/screenshot/scroll/wait/close/read 十一个原语对话输出卡化(徽章头+命令围栏+原文保留+耗时+shot 尾注;`browserPrimitiveCardRender`,run 包装回传 argv/ms 同源) | ✅ 实装,837/837(cards 新增 8 例) |
| 2 | **调度结果回对话(完成卡)**:无 session 的定时 run 完成后,结果以卡面回对话 | ⏳ 设计中(无 session 路径的回话通道是关键点) |
| 3 | **一键巡圈简报卡进对话**:巡圈完成后简报以卡面回对话 | ⏳ 排队(依赖 #2 的回话通道) |
| 4 | rc.5 client bundle 适配(原头部项) | ✅ **实测关闭**——0.2.0 报告的「面板 0 o4 节点」今日不复现(180 节点+样式生效,截图 `.qa/screenshots-021/01`);成因无法完全归因,以可复现现状为准 |
| 5 | schedule-list 路由 rc.1+0.2.0 "not found"(部分 RPC 注册缺失) | ⏳ 排查中(对比 0.1.8/0.2.0 注册表) |
| 6 | SKILL.md:103 微博配方修 + 配方门扩展 | ⏳ 排队 |
| 7 | rpc-bench 满载复测构造(事件档 5MB/快照 20×50) | ⏳ 可选 |

## 二、#1 施工记录(2026-11-25)

- src/cards.ts:`browserPrimitiveCardRender(verb, args, value)` + `msTail`(opencli_do 头部同步补耗时);失败分类复用 EXIT_FAIL( renderOut 是唯一格式化点,无扩展短路等一切失败路径都过它)。
- src/index.ts:`registerBrowserTools` 的 run 包装单点计时(Date.now 括弧,含补拍截图整段墙钟),回传 `{text, ms, argv, shot?}`;11 个页面动作原语 render 逐个接线;参考型工具(status/install/catalog/run/knowledge/chrome/画布族)保持透传。
- tests/cards.test.ts:8 例(成功头+命令+原文保留/耗时两档格式/session 入头/失败去重+接管提示/登录指引互斥/shot 文件名尾注且本机路径不进卡/老结果无 argv-ms 兜底/11 工具接线回声+参考型透传钉住)。全套 **837/837**(0.2.0 基线 824+13,其中 5 例为此前增量)。
- deploy.cjs:修 rc.5 scope 布局探测(`@cold777/dsh-opencli`),web020/web 双副本部署校验一致。

## 三、真机与环境(如实)

详见 REPORT-0.2.0-真机走查-web020.md §0.2.1 追记。要点:
- rc.5 面板可用性反转(#4 关闭依据);daemon 随宿主重启不自动拉起,面板横幅诚实示警,一键修复可拉起(本轮实测 2.0.3+扩展重连)。
- rc.1 web profile 对话栈宿主级受损(sandbox/shell 包导出偏斜,先于本插件加载,非本插件回归)。
- **对话侧执行卡实机对话截图待补**:模型面仅 DeepSeek 且账号配额 2026-11-19 起 QUOTA 耗尽,agent 轮次发不出;渲染契约已由测试钉住(render 值透传通道 0.1.8 已实机验证),待配额恢复补走查。
