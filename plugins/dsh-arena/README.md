# dsh-arena · 比武台

> 一个任务，N 个 agent 各自 worktree 独立完成，diff/测试并排，选优合并。
> 方案与路线图：`docs` 待建，完整三层愿景见 `D:\CodingProjects\dsh-arena-方案文档.md`。

## 当前状态：M1 扇出引擎 ✅ · M2 裁决台 ✅ · M3 自动裁决+通知 ✅ · M4 dsh 挂载骨架 ✅（待真机验收）

- 真实 git 仓库夹具：三人扇出全绿（三树并行互不可见 / 各自交付 / 主树零污染）；
- **真机 dsh headless 同题竞速通过**：2 个真实队员（MiniMax-M3 / MiniMax）各自在 worktree 交付 hello.txt；
- 裁决台真实比赛端到端：收作业 → 统计/预合并 → 选优合并 → 清扫；测试失败自动回滚保留现场；
- 通知：飞书（sign）/钉钉（加签）机器人 webhook，卡片含胜者与裁决入口；
- 21 测试全绿（引擎/裁决/通知）。

## 用法（CLI）

```sh
pnpm install
pnpm test
pnpm arena run --repo <git 仓库根> --task "任务全文" \
  --member "alpha=dsh --profile headless {task}" \
  --member "beta=dsh --profile headless {task}"
# 全流程（验收 + 自动裁决 + 合并 + 通知）：
pnpm arena contest --repo <仓库根> --task "任务" \
  --member "alpha=dsh --profile headless {task}" \
  --member "beta=dsh --profile headless {task}" \
  --test-cmd "node --test" \
  --notify-config .arena-notify.json
pnpm arena verdict --repo <仓库根> --run-id <id>   # 裁决对比表
pnpm arena merge --repo <仓库根> --run-id <id> --member alpha --test-cmd "pnpm test"
```

- 队员命令 `{task}` 替换任务全文；任务同时经 `ARENA_TASK` 环境变量提供（不经 shell，无注入面）；
- 队员可带 `testCmd`（如 `pnpm test`）：通过者才具自动裁决资格，最快者胜；
- worktree 约定：`<repoRoot>/.dsh-worktrees/<runId>/<member>`，分支 `wt/arena-<runId>/<member>`；
- `.dsh-worktrees/` 自动写进 `.git/info/exclude`——主树零污染且不改被跟踪文件；
- 清单 `manifest.json` 两阶段落盘（running → finished）。

## 已知边界

- 垫片路径（shell:true）下 exit code 不可靠——M1/M2 以**交付物 + 主树零污染**为验收；M2 裁决台接真实运行状态需直连 node 或 dsh 会话 API；
- 比赛 Token 成本 ×N，定位「关键任务才开擂」；
- 非 git 仓库不适用（显式报错）；
- dsh 挂载层（cordis patch + client 面板）为骨架，**真机挂载验收待 dsh 0.1.5-alpha 环境**（experimental teams 包已上 npm alpha）。

## 路线图

M3 自动裁决+通知 ✅ → M4 宿主挂载骨架 ✅（真机验收待办）→ 二期远程队员 → 三期监控协作台。面向未来模型的进化方向见方案文档第九节。

