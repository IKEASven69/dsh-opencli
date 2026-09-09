#!/usr/bin/env node
/**
 * dsh-arena CLI：比武台的命令行入口（M1）。真机用法：
 *   dsh-arena run --repo <仓库> --task "任务全文" \
 *     --member "scout=dsh --profile headless {task}" \
 *     --member "builder=dsh --profile headless {task}"
 * 测试/试跑可用任意假队员命令（如 node -e ...），引擎不关心队员是什么。
 */
import { Command } from "commander";
import { runArena } from "./runner.js";
import { isMainTreeClean } from "./worktree.js";
import { listWorktreeRows } from "./list.js";

/** 剥一层包裹引号（bash 逃逸传参的痕迹）："x" / 'x' → x */
function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

const program = new Command();

program.name("dsh-arena").description("比武台：一任务 N 队员各自 worktree 竞速，选优合并").version("0.1.0");

program
  .command("run")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .requiredOption("--task <text>", "任务全文（替换队员命令里的 {task} 令牌）")
  .requiredOption("--member <spec...>", "队员，格式 name=command（空格分参，{task} 为任务占位）", (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option("--timeout-ms <n>", "单队员超时毫秒", "600000")
  .option("--run-id <id>", "指定 runId（缺省自动生成）")
  .action(async (opts) => {
    const members = opts.member.map((spec: string) => {
      const eq = spec.indexOf("=");
      if (eq <= 0) throw new Error(`--member 格式应为 name=command：「${spec}」`);
      const name = spec.slice(0, eq);
      const cmdline = spec.slice(eq + 1).trim();
      // bash 会把 \" 传成字面引号（node -e "..." 变成求值字符串字面量，静默无操作）——剥一层包裹引号
      const parts = cmdline.split(/\s+/).map(unquote);
      return { name, command: parts[0], args: parts.slice(1) };
    });
    const r = await runArena({
      repoRoot: opts.repo,
      task: opts.task,
      members,
      timeoutMs: Number(opts.timeoutMs),
      runId: opts.runId,
    });
    console.log(`runId: ${r.runId}`);
    for (const m of r.members) {
      const status = m.spawnError ? `spawn 失败(${m.spawnError})` : m.timedOut ? "超时" : `exit ${m.exitCode}`;
      console.log(`  [${m.name}] ${status} · ${Math.round(m.durationMs / 1000)}s · ${m.worktreePath}`);
      if (m.stdoutTail) console.log(`    ↳ ${m.stdoutTail.split(/\r?\n/).slice(-2).join(" | ").slice(0, 160)}`);
    }
    console.log(`主树零污染: ${r.mainClean ? "✓" : "✗ 被污染，检查 exclude"}`);
    console.log(`清单: ${r.manifestPath}`);
    process.exitCode = r.mainClean ? 0 : 1;
  });

program
  .command("list")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .action(async (opts) => {
    const rows = await listWorktreeRows(opts.repo);
    for (const r of rows) console.log(r);
  });

program
  .command("clean-check")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .action(async (opts) => {
    console.log(`主树零污染: ${await isMainTreeClean(opts.repo) ? "✓" : "✗"}`);
  });

program
  .command("verdict")
  .description("裁决对比表：逐队员改动统计 + 预合并预览（只读）")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .requiredOption("--run-id <id>", "比赛 runId")
  .option("--main-ref <ref>", "主分支引用", "main")
  .action(async (opts) => {
    const { buildVerdict } = await import("./verdict.js");
    const rows = await buildVerdict(opts.repo, opts.runId, opts.mainRef);
    console.log("队员   | 文件 | +/-      | 预合并 | 完整性令牌");
    for (const r of rows) {
      const mp = r.mergeClean ? "干净 ✓" : `冲突 ${r.conflicts.length}`;
      console.log(
        `${r.member.padEnd(8)} | ${String(r.filesCount).padStart(3)}  | +${r.insertions}/-${r.deletions} | ${mp.padEnd(9)} | ${r.receipt}`,
      );
      if (!r.mergeClean) for (const c of r.conflicts.slice(0, 5)) console.log(`    ⚠ 冲突: ${c}`);
    }
  });

program
  .command("merge")
  .description("选优合并：收作业 → 合并进主干 → 可选测试（失败回滚）→ 清扫队员树")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .requiredOption("--run-id <id>", "比赛 runId")
  .requiredOption("--member <name>", "胜出队员名")
  .option("--test-cmd <cmd>", "合并后在主树跑的验收命令（如 pnpm test）")
  .option("--no-auto-rollback", "测试失败时不自动回滚（保留现场）")
  .option("--no-cleanup", "不清扫队员 worktree（保留现场检查）")
  .action(async (opts) => {
    const { mergeWinner } = await import("./verdict.js");
    const r = await mergeWinner(opts.repo, opts.runId, opts.member, {
      testCmd: opts.testCmd,
      autoRollback: opts.autoRollback !== false,
      cleanup: opts.cleanup !== false,
    });
    if (!r.merged && !r.rolledBack && r.mergeCommit === null) {
      console.log("✗ 未合并：预合并发现冲突，主树未被触碰。请人工解决后重试或换队员。");
      console.log(`  现场保留: ${r.keptForInspection.length} 个 worktree`);
      process.exitCode = 2;
      return;
    }
    console.log(`合并: ${r.merged ? "✓" : "✗ 已回滚"} · 合并提交 ${r.mergeCommit ?? "—"}`);
    if (r.testOutput) console.log(`验收输出（尾部）: ${r.testOutput.slice(-300)}`);
    if (r.rolledBack) console.log("⚠ 测试未过 → 已自动回滚到合并前主干，队员树保留供检查");
    else console.log(`清扫: ${r.cleanedWorktrees.length} 个 worktree 已回收${r.keptForInspection.length ? `（${r.keptForInspection.length} 个保留）` : ""}`);
  });

program
  .command("contest")
  .description("全流程：扇出→验收→自动裁决→合并→通知（M3）")
  .requiredOption("--repo <path>", "目标 git 仓库根")
  .requiredOption("--task <text>", "任务全文")
  .requiredOption("--member <spec...>", "队员 name=command（{task} 占位）", (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option("--test-cmd <cmd>", "全员共用验收命令（队员内执行；自动裁决依据）")
  .option("--no-auto-merge", "只出裁决不自动合并")
  .option("--notify-config <path>", "通知配置 json：{feishu:{webhook,secret?},dingtalk:{webhook,secret?},panelUrl?}")
  .option("--timeout-ms <n>", "单队员超时毫秒", "600000")
  .action(async (opts) => {
    const { runContest } = await import("./contest.js");
    const { readFile } = await import("node:fs/promises");
    const members = (opts.member as string[]).map((spec) => {
      const eq = spec.indexOf("=");
      if (eq <= 0) throw new Error(`--member 格式应为 name=command：「${spec}」`);
      const name = spec.slice(0, eq);
      const parts = spec
        .slice(eq + 1)
        .trim()
        .split(/\s+/)
        .map(unquote);
      return { name, command: parts[0], args: parts.slice(1) };
    });
    let notify: unknown = null;
    if (opts.notifyConfig) {
      notify = JSON.parse(await readFile(opts.notifyConfig, "utf8"));
    }
    const r = await runContest({
      repoRoot: opts.repo,
      task: opts.task,
      members,
      testCmd: opts.testCmd,
      autoMerge: opts.autoMerge,
      timeoutMs: Number(opts.timeoutMs),
      notify: notify as never,
    });
    console.log(`runId: ${r.run.runId} · 主树零污染: ${r.run.mainClean ? "✓" : "✗"}`);
    for (const m of r.run.members) {
      const test = m.test?.ran ? (m.test.pass ? "✓验收" : "✗验收") : "无验收";
      const status = m.spawnError ? "spawn 失败" : m.timedOut ? "超时" : `exit ${m.exitCode}`;
      console.log(`  [${m.name}] ${status} · ${test} · ${Math.round(m.durationMs / 1000)}s`);
    }
    console.log(r.reason);
    if (r.mergedMember) process.exitCode = 0;
    else if (r.autoWinner === null) process.exitCode = 2;
  });

program.parseAsync();
