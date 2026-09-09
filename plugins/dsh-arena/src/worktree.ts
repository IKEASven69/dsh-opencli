/**
 * worktree 编排原语：目录/分支命名约定、git worktree 增删查、主树零污染。
 * 目录约定对齐生态：<repoRoot>/.dsh-worktrees/<runId>/<member>（FlashingChen/dsh-worktree 同款前缀）。
 * 主树零污染：.dsh-worktrees/ 写进 .git/info/exclude（本地生效，不动被跟踪的 .gitignore）。
 * 全部 git 调用走 execFile 参数数组（无 shell），Windows 无引号地狱。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const pexec = promisify(execFile);

export async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function ensureGitRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
}

/** 比赛根目录：<repoRoot>/.dsh-worktrees/<runId> */
export function worktreeRoot(repoRoot: string, runId: string): string {
  return join(repoRoot, ".dsh-worktrees", runId);
}

/** 队员分支：wt/arena-<runId>/<member> */
export function branchFor(runId: string, member: string): string {
  return `wt/arena-${runId}/${member}`;
}

/** 队员 worktree 路径 */
export function worktreePathFor(repoRoot: string, runId: string, member: string): string {
  return join(worktreeRoot(repoRoot, runId), member);
}

/** 把 .dsh-worktrees/ 写进本地 exclude（.git/info/exclude），保证主树零污染且不改任何被跟踪文件。幂等。 */
export async function hideWorktreeDir(repoRoot: string): Promise<void> {
  const excludePath = join(repoRoot, ".git", "info", "exclude");
  await mkdir(dirname(excludePath), { recursive: true });
  let text = "";
  try {
    text = await readFile(excludePath, "utf8");
  } catch {
    /* 不存在则创建 */
  }
  const lines = text.split(/\r?\n/);
  if (!lines.includes(".dsh-worktrees/")) {
    const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    await appendFile(excludePath, `${prefix}.dsh-worktrees/\n`, "utf8");
  }
}

export interface WorktreeRef {
  path: string;
  branch: string;
}

/** 建队员 worktree：git worktree add -b <branch> <path>（分支不存在则新建） */
export async function addWorktree(repoRoot: string, runId: string, member: string): Promise<WorktreeRef> {
  const path = worktreePathFor(repoRoot, runId, member);
  const branch = branchFor(runId, member);
  await git(repoRoot, ["worktree", "add", "-b", branch, path]);
  return { path, branch };
}

/** 移除队员 worktree（裁决合并/废弃后清扫用，M2 接线） */
export async function removeWorktree(repoRoot: string, path: string, opts: { force?: boolean } = {}): Promise<void> {
  await git(repoRoot, ["worktree", "remove", ...(opts.force ? ["--force"] : []), path]);
}

/** 主树零污染检查：porcelain 输出为空 = 干净（.dsh-worktrees 已被 exclude 隐藏） */
export async function isMainTreeClean(repoRoot: string): Promise<boolean> {
  const out = await git(repoRoot, ["status", "--porcelain"]);
  return out.trim() === "";
}
