# 0.1.8 施工方案(2026-11-22)

> 用户令:开工。范围=0.1.7 两轮真机走查实抓的四条收尾(PLAN-0.1.7 §五遗留+观察)+ C4 xray 能力自证。
> 全部条目来自真机实证,不是拍脑袋;小版本,一天量级。

## 一、范围定稿

| 序 | 项 | 根因(真机/走查实证) | 设计 |
|---|---|---|---|
| ① | **真实性判定空结果徽章** | zhihu hot 返回 `[]` 面板标注「实测有效 P=1.00」——判定层把合法空数组当有效数据渲染(#2708 口径本身正确:合法空不重试;错在徽章措辞) | 判定语义不动(verdict=true/p=1 防无意义重试),**徽章区分**:why='空数组' 渲染 `⚪ 空结果`;顺带把精确匹配 `trimmed === '[]'` 放宽为 `/^\[\s*\]$/`(覆盖 pretty-print 空数组) |
| ② | **连败真值透面板** | 连败 chip/效率账单 stuck 从 `history.slice(0,3)` 头部数——窗口顶死上限 3,第 4 连败起显示失真 | schedule 新增持久字段 `failRunStreak`(run 失败 +1/成功清删/跳过不动),两处 stats 计数点同步维护;面板 chip 与 stuck 优先读真值,旧数据(无字段)回退 history 头部计算(现行为零变化);loadState 同款形状收窄 |
| ③ | **saveState 乱序窗口** | 并发写者各自 `await writeFile` 耗时不同 → rename 顺序≠调用顺序,旧状态快照可能后落盘覆盖新状态(benchmark flake 根因,归档在 .qa/test-failures.jsonl) | 写链串行化:`saveChain` promise 队列,body 在调用时捕获快照,链上按调用序落盘——最后调用者必胜;原子写(tmp+rename)与 tmp 序号保持不变 |
| ④ | **status RPC 缓存** | 面板每次 reload 付两次 CLI 子进程(--version + daemon status,秒级)——action 连发时成本翻倍;flip 事件档扫描已有 60s 缓存(0.1.6 复核),真正未缓存的是 spawn 对 | status 结果 15s TTL 缓存(仅 ok:true 路径缓存;失败不缓存立即重试);`daemon-start` 成功后清缓存;面板周期刷新/action 连发共用缓存,语义=秒级陈旧可接受(健康信号非秒级敏感) |
| C4 | **xray 能力自证对账** | dsh-xray 第三方扫描评 C3(7 flags:patch runtime/rewrite systemPrompt/gates tool execution/system commands ×51/eval ×7/base64 ×5)——后三类引自 `.build-tools/` 开发脚手架,发布物(npm files 白名单)根本不含 | docs/xray-capability-notes.md:逐条对账(是什么/为什么存在/发布物是否含/一条可复现命令自证);README 对照段**挂发布链呈批**(对外文案走纪律流程,本版不自行改 README) |

## 二、验收

- ①advanced.test.ts 补徽章断言(空数组 → ⚪ 空结果,非「实测有效」);verdict/p 既有断言(312 行)不动
- ②task-health.test.ts 补 failRunStreak 维护断言(fail 累积/ok 清删/跳过不动);loadState 坏形状丢弃
- ③schedule-state.test.ts(或就近文件)补串行序断言:并发 saveState(A 旧 B 新,A 后启动写盘慢)→ 落盘最终为 B
- ④status 缓存:单测二级(status 二连发只付一次 CLI;daemon-start 后再查重新付)
- 全量:0.1.7 基线 816 + 新增若干;构建绿

## 三、明确不做(记路线)

- digest 连败(日历日语义 FailStreakCounter)不动——面板 run 连败与早报日连败是两个口径,勿混
- runHistory 窗口(5 条)不动——failRunStreak 已把真值持久化,窗口只服务轨迹展示
- xray 侧 flags 数据源修正 PR(扫发布 tarball 而非 repo 树)——外部提交,须用户显式批准,本版只备料
- status 缓存不做跨进程失效(dsh 多实例同机各持各的缓存,无共享状态可失效)

## 四、施工记录(2026-11-22,全部落地)

- ①verifyResult `/^\[\s*\]$/` + verifyBadge 空结果徽章;advanced.test.ts 补 2 断言(多行空数组归类/徽章不含「实测有效」)
- ②failRunStreak 全链:type(schedule)+ canary/定时两计数点(成功清删省键)+ loadState 收窄 + 面板 chip/stuck 真值优先;task-health ④ 扩展断言(成功删/失败累积/跳过不动)
- ③saveState 写链:body 调用时快照 + saveChain 串行;新文件 tests/savestate-order.test.ts(12 并发非等待调用+同步变更→终态=最后调用者、无 tmp 残留;loadState 收窄三例)
- ④status 5s TTL + daemon-start 清缓存;coexistence.test.ts ⑤ 清缓存适配 + 新增 ⑥(TTL 内单次 spawn/清缓存重付/失败不缓存);climajor 的 status 全走失败路径(不缓存)无需改
- **意外实抓(第 5 个 bug)**:loadState 收窄循环原以「无 pendingCatchup 债则 continue」开头——0.1.7 加入的 stats 形状收窄对无债条目(大多数)是死代码;t-narrow 用例红着揪出来,改独立条件修复(schedule-catchup 全量回归过)
- 全量 820/820(基线 816+4)+ 构建绿;C4 对账文档 docs/xray-capability-notes.md 备料(npm pack 清单/eval 0/base64 游标 1/spawn 4 全部实测,README 对照段挂发布链呈批)
