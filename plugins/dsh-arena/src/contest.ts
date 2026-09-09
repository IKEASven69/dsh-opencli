/**
 * 自动裁决规则 + 完整比赛流程（扇出 → 验收 → 自动选优 → 合并 → 通知）。
 * 自动规则（M3）：只有验收通过的队员有资格；合格者中耗时最短者胜；无人合格 → 不自动合并，交人工。
 */
import { runArena, type ArenaMember, type ArenaRunResult } from "./runner.js";
import { mergeWinner } from "./verdict.js";

export interface ContestOptions {
  repoRoot: string;
  task: string;
  members: ArenaMember[];
  runId?: string;
  timeoutMs?: number;
  /** 全体队员共用的验收命令（在各自 worktree 内执行）；留空则无自动裁决资格判定 */
  testCmd?: string;
  /** 自动选优合并（默认 true；false 时只出裁决不合并） */
  autoMerge?: boolean;
  /** 比赛通知配置（文件或调用方注入） */
  notify?: NotifyConfig | null;
}

export interface ContestResult {
  run: ArenaRunResult;
  /** 自动规则选出的胜者；null = 无人合格（或未配置验收），交人工裁决 */
  autoWinner: string | null;
  mergedMember: string | null;
  reason: string;
}

export function pickWinner(results: ArenaRunResult["members"]): string | null {
  const eligible = results.filter((m) => m.test?.ran && m.test.pass && m.exitCode === 0);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (b.durationMs < a.durationMs ? b : a)).name;
}

export async function runContest(opts: ContestOptions): Promise<ContestResult> {
  const members: ArenaMember[] = opts.testCmd
    ? opts.members.map((m) => ({ ...m, testCmd: m.testCmd ?? opts.testCmd }))
    : opts.members;

  const run = await runArena({
    repoRoot: opts.repoRoot,
    task: opts.task,
    members,
    runId: opts.runId,
    timeoutMs: opts.timeoutMs,
  });

  const autoWinner = pickWinner(run.members);
  let mergedMember: string | null = null;
  let reason = "";

  if (autoWinner === null) {
    reason = run.members.some((m) => m.exitCode === 0)
      ? "无人通过验收 → 交人工裁决"
      : "全员失败 → 交人工处置";
  } else if (opts.autoMerge === false) {
    reason = `自动规则选出 ${autoWinner}，autoMerge=false 未合并`;
  } else {
    await mergeWinner(opts.repoRoot, run.runId, autoWinner, { cleanup: true });
    mergedMember = autoWinner;
    reason = `自动裁决：${autoWinner} 验收通过且最快，已合并`;
  }

  if (opts.notify) {
    try {
      const { notifyRaceFinished } = await import("./notify.js");
      await notifyRaceFinished(opts.notify, {
        runId: run.runId,
        task: opts.task,
        autoWinner,
        mergedMember,
        members: run.members.map((m) => ({
          name: m.name,
          verdict: m.spawnError ? "失败" : m.timedOut ? "超时" : m.test?.ran ? (m.test.pass ? "通过" : "未通过") : m.exitCode === 0 ? "完成" : "失败",
          durationMs: m.durationMs,
        })),
      });
    } catch (e) {
      reason += `（通知推送失败：${e instanceof Error ? e.message : String(e)}）`;
    }
  }

  return { run, autoWinner, mergedMember, reason };
}
