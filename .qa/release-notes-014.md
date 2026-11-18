## 0.1.4 — 2026-11-16

> 本段为发布前占位:各小节特性条目随实现与验收逐条补齐,正式描述以发布时为准。

### 通知通道
- **新增 push 类通道**:Bark(iOS/自host,POST /push,凭据只在请求体)、ntfy(自host 首选,topic 进请求体+Bearer 头)、Pushover(token/user 走请求体)——凭据一律不进请求 URL;Telegram 升级:429 限流读 retry_after 有界退避、可选 HTTPS 代理、可选 parse_mode
- **webhook 模板化**:{{title}}/{{body}}/{{ok}}/{{site}}/{{source}}/{{watchHits}}/{{at}} 值级 JSON 安全注入,渲染后校验非法 JSON 拒发(不静默回退);仅 generic webhook 生效
- **凭据卫生**:URL 内嵌凭据(如 https://api.day.app/<key>)入库时自动拆解为独立字段并以无凭据形态落盘;面板回显遮蔽中间段;错误文案不回显凭据

### 日报与归因
- **定时任务早报**:每日结算一张聚合卡(标题+首行总览计数+失败段/🔔watch 命中/📊变化/✓例行+尾行回执口径),同时落盘 ~/.dsh/opencli-reports/digest-<日期>.md|.json(各留 30 份);失败不静默;同签名连败折叠为「连续第 N 日」;quietHours 窗内顺延出窗补发;DSH_OPENCLI_DIGEST_DISABLE=1 可关
- **熔断自动归因**:系统级熔断开窗后自动单跑一次 canary 巡检,把「系统面 or 站点面 or 无法定论」结论写进 circuit-attribution 事件与早报失败段(启发式判定,非裁决)
- **连败降噪**:同签名失败按日历日计数(有界),失败推送带「连续第 N 日」,成功清零,重启从运行史重建

### MCP 读面
- **knowledge_list 过滤与分页**:status/domain/query/limit 参数+游标(nextCursor),默认页 50、上限 500——不再默认全量拉 171 站
- **新工具 knowledge_search(query)**:模糊查站名/域名/命令名/已知坑,档位排序返回站点摘要(补齐知识类 server 标准读面三件套:全量读/检索/按名取)
- **规范补全**:三工具附 outputSchema 与完整只读注解(idempotent/openWorld/destructive hint+title);knowledge_get 附 resource_link(目录内站);401 带 WWW-Authenticate;Host/Origin 校验(DNS 重绑定防护,后缀伪装不命中);MCP-Protocol-Version 头校验(不认识→400,初始化握手不验)

### 质量
- **收件箱(结果收件箱)**:run 级「已读/归档」语义——面板自动化页新收件箱卡(展开详情即标已读、全部标已读、单条归档、一键归档已读),归档无损降级(条目沉底仍可点开只读);无产出运行(ok 且空产出且无变化且无 watch 命中且非跳过)自动归档并在早报尾行计数;ctl schedule read/archive;收件箱回执文件轮转上限 100
- **旗舰行为回归测试入库**:熔断开窗/短路、翻转自愈、governor 并发收紧、schedMarkers 有界、收件箱重入守卫、自检撞名鉴别、shell 数组形态与转义——14 用例 109 断言从一次性脚本固化为仓库测试
- **四条语义修**:认证预检跳过行回执 stop_reason 归 null(命令未执行不再标 error);自愈退避窗内不再覆写 daemon 版本基线(退避过后同翻转仍可识别);notify=false 的任务也记录失败并参与熔断开窗(诊断面与通知面解耦);定时链路权限未知命令按写轨限频(与审批门同口径)
