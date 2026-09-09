/**
 * 裁决台纯逻辑层：收作业（队员产出自动提交）、变更统计、merge-tree 预合并预览、
 * 完整性令牌、选优合并（含测试失败自动回滚）与废弃树清扫。
 * 原则：预合并/预览绝不动主树；合并前先收作业；回滚保守（回滚时保留现场不清扫）。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, removeWorktree } from "./worktree.js";

const pexecFile = promisify(execFile);
const exec = promisify(execFile);

/** 在指定目录跑 git（worktree 或主树） */
async function gitIn(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexecFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export interface MemberCommitInfo {
  committed: boolean;
  head: string | null;
}

/** 收作业：队员 worktree 里的全部改动（含未跟踪）自动提交到其分支。无改动则跳过。 */
export async function commitMemberWork(worktreePath: string, member: string): Promise<MemberCommitInfo> {
  await gitIn(worktreePath, ["add", "-A"]);
  let hasChanges = false;
  try {
    await gitIn(worktreePath, ["diff", "--cached", "--quiet"]);
  } catch {
    hasChanges = true; // --quiet 有差异时退出码 1
  }
  if (!hasChanges) {
    const head = (await gitIn(worktreePath, ["rev-parse", "HEAD"])).trim();
    return { committed: false, head };
  }
  await gitIn(worktreePath, ["commit", "-m", `arena: ${member} 交付物`]);
  const head = (await gitIn(worktreePath, ["rev-parse", "HEAD"])).trim();
  return { committed: true, head };
}

export interface MemberStats {
  files: string[];
  filesCount: number;
  insertions: number;
  deletions: number;
  uncommitted: boolean;
  receipt: string;
}

/** 队员分支相对 main 的变更统计 + 完整性令牌（提交后 = HEAD+tree 哈希）。 */
export async function memberStats(repoRoot: string, branch: string, mainRef = "main"): Promise<MemberStats> {
  const nameOnly = (await gitIn(repoRoot, ["diff", "--name-only", `${mainRef}...${branch}`])).trim();
  const files = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];
  const stat = (await gitIn(repoRoot, ["diff", "--stat", `${mainRef}...${branch}`])).trim();
  const last = stat.split("\n").pop() ?? "";
  const ins = last.match(/(\d+) insertion/);
  const del = last.match(/(\d+) deletion/);
  const head = (await gitIn(repoRoot, ["rev-parse", branch])).trim();
  const tree = (await gitIn(repoRoot, ["rev-parse", `${branch}^{tree}`])).trim();
  const receipt = createHash("sha256").update(`${head}\n${tree}`).digest("hex").slice(0, 16);
  return {
    files,
    filesCount: files.length,
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
    uncommitted: false,
    receipt,
  };
}

export interface MergePreview {
  clean: boolean;
  conflicts: string[];
}

/** merge-tree 预合并预览：完全不动主树与索引。需要 git ≥ 2.38（--write-tree 形态）。 */
export async function mergePreview(repoRoot: string, branch: string, mainRef = "main"): Promise<MergePreview> {
  try {
    await pexecFile("git", ["merge-tree", "--write-tree", "--name-only", mainRef, branch], {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { clean: true, conflicts: [] };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 1) {
      const lines = (err.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      return { clean: false, conflicts: lines.slice(1) }; // 首行是 tree oid
    }
    if ((err.stderr ?? "").includes("unknown option") || (err.stderr ?? "").includes("Unknown option")) {
      throw new Error("git 版本过低，不支持 merge-tree --write-tree（需要 git ≥ 2.38）");
    }
    throw e;
  }
}

export interface ManifestDoc {
  runId: string;
  task: string;
  status: string;
  members: { name: string; worktreePath: string; branch: string }[];
}

export async function readManifest(repoRoot: string, runId: string): Promise<ManifestDoc> {
  const p = join(repoRoot, ".dsh-worktrees", runId, "manifest.json");
  return JSON.parse(await readFile(p, "utf8")) as ManifestDoc;
}

export interface VerdictRow {
  member: string;
  branch: string;
  filesCount: number;
  insertions: number;
  deletions: number;
  receipt: string;
  mergeClean: boolean;
  conflicts: string[];
}

/** 裁决对比：逐队员统计 + 预合并预览（只读，不动任何东西）。 */
export async function buildVerdict(repoRoot: string, runId: string, mainRef = "main"): Promise<VerdictRow[]> {
  const manifest = await readManifest(repoRoot, runId);
  const rows: VerdictRow[] = [];
  for (const m of manifest.members) {
    await commitMemberWork(m.worktreePath, m.name);
    const st = await memberStats(repoRoot, m.branch, mainRef);
    const mp = await mergePreview(repoRoot, m.branch, mainRef);
    rows.push({
      member: m.name,
      branch: m.branch,
      filesCount: st.filesCount,
      insertions: st.insertions,
      deletions: st.deletions,
      receipt: st.receipt,
      mergeClean: mp.clean,
      conflicts: mp.conflicts,
    });
  }
  return rows;
}

export interface MergeOutcome {
  merged: boolean;
  rolledBack: boolean;
  prevMainHead: string;
  mergeCommit: string | null;
  testOutput: string | null;
  cleanedWorktrees: string[];
  keptForInspection: string[];
}

/** 选优合并：收作业 → 合并进主干 → 可选测试（失败自动回滚）→ 清扫全部队员树。 */
export async function mergeWinner(
  repoRoot: string,
  runId: string,
  member: string,
  opts: { mainRef?: string; testCmd?: string; autoRollback?: boolean; cleanup?: boolean } = {},
): Promise<MergeOutcome> {
  const mainRef = opts.mainRef ?? "main";
  const manifest = await readManifest(repoRoot, runId);
  const m = manifest.members.find((x) => x.name === member);
  if (!m) throw new Error(`run ${runId} 中没有队员「${member}」`);

  const prevMainHead = (await gitIn(repoRoot, ["rev-parse", "HEAD"])).trim();
  await commitMemberWork(m.worktreePath, m.name);

  const preview = await mergePreview(repoRoot, m.branch, mainRef);
  if (!preview.clean) {
    return {
      merged: false,
      rolledBack: false,
      prevMainHead,
      mergeCommit: null,
      testOutput: null,
      cleanedWorktrees: [],
      keptForInspection: manifest.members.map((x) => x.worktreePath),
    };
  }

  await gitIn(repoRoot, ["merge", "--no-ff", m.branch, "-m", `arena: 选优 ${member}（run ${runId}）`]);
  const mergeCommit = (await gitIn(repoRoot, ["rev-parse", "HEAD"])).trim();

  let testOutput: string | null = null;
  let rolledBack = false;
  if (opts.testCmd) {
    try {
      const r = await exec(opts.testCmd, { cwd: repoRoot, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
      testOutput = (r.stdout + r.stderr).slice(-4000);
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      testOutput = ((err.stdout ?? "") + (err.stderr ?? "")).slice(-4000);
      if (opts.autoRollback) {
        await gitIn(repoRoot, ["reset", "--hard", prevMainHead]);
        rolledBack = true;
      }
    }
  }

  const cleanedWorktrees: string[] = [];
  const keptForInspection: string[] = [];
  const cleanup = opts.cleanup ?? (rolledBack ? false : true);
  for (const x of manifest.members) {
    if (cleanup) {
      try {
        await removeWorktree(repoRoot, x.worktreePath, { force: true });
        await gitIn(repoRoot, ["branch", "-D", x.branch]);
        cleanedWorktrees.push(x.worktreePath);
      } catch {
        keptForInspection.push(x.worktreePath);
      }
    } else {
      keptForInspection.push(x.worktreePath);
    }
  }

  return { merged: !rolledBack, rolledBack, prevMainHead, mergeCommit, testOutput, cleanedWorktrees, keptForInspection };
}
