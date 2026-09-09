/**
 * 扇出运行器：一个任务 → N 队员各自 worktree 并行执行 → 过程/结果落清单。
 * 设计：
 * - spawn 不走 shell（参数数组 + {task} 令牌替换），Windows 无引号问题，任务文本不进命令行注入面；
 * - 队员命令失败/超时不炸整场，逐队员记录（exitCode=null + timedOut）；
 * - 清单 manifest.json 两阶段落盘（running → finished），外部可随时观测；
 * - spawnFn 可注入：测试用假队员命令，真机换 dsh headless。
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { addWorktree, branchFor, ensureGitRepo, hideWorktreeDir, isMainTreeClean, worktreePathFor, worktreeRoot } from "./worktree.js";

const pexecFile = promisify(execFile);

export interface ArenaMember {
  name: string;
  /** 命令行：程序 + 参数数组，{task} 令牌替换为任务全文 */
  command: string;
  args?: string[];
  /** 队员交付后的验收命令（在其 worktree 内 shell 执行），自动裁决依据 */
  testCmd?: string;
}

export interface ArenaRunOptions {
  repoRoot: string;
  task: string;
  members: ArenaMember[];
  runId?: string;
  /** 单队员超时，默认 10 分钟 */
  timeoutMs?: number;
}

export interface MemberResult {
  name: string;
  worktreePath: string;
  branch: string;
  exitCode: number | null;
  timedOut: boolean;
  spawnError?: string;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  /** 验收命令结果：ran=false 表示未配置 */
  test?: { ran: boolean; pass: boolean; durationMs: number; tail: string };
}

export interface ArenaRunResult {
  runId: string;
  worktreeRoot: string;
  manifestPath: string;
  members: MemberResult[];
  mainClean: boolean;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const TAIL_LIMIT = 20_000;

export function substituteTask(args: string[], task: string): string[] {
  return args.map((a) => a.replaceAll("{task}", task));
}

export function validateMembers(members: ArenaMember[]): void {
  if (!Array.isArray(members) || members.length < 2) {
    throw new Error("比赛至少需要 2 名队员（--member 至少两个）");
  }
  if (members.length > 5) {
    throw new Error("队员上限 5（成本 ×N，方案定位「关键任务才开擂」）");
  }
  const names = new Set<string>();
  for (const m of members) {
    if (!m.name || /\s/.test(m.name)) throw new Error(`队员名非法：「${m.name}」（不可为空/含空白）`);
    if (names.has(m.name)) throw new Error(`队员名重复：${m.name}`);
    names.add(m.name);
    if (!m.command) throw new Error(`队员 ${m.name} 缺 command`);
  }
}

interface ManifestDoc {
  runId: string;
  task: string;
  status: "running" | "finished" | "failed";
  startedAt: string;
  finishedAt?: string;
  members: MemberResult[];
}

async function writeManifest(path: string, doc: ManifestDoc): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(doc, null, 2), "utf8");
}

function runMember(member: ArenaMember, cwd: string, branch: string, task: string, timeoutMs: number): Promise<MemberResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const base = { name: member.name, worktreePath: cwd, branch };
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let useShell = false;
    const args = substituteTask(member.args ?? [], task);
    const done = (r: Partial<MemberResult>) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...base, durationMs: Date.now() - started, stdoutTail: stdout.slice(-TAIL_LIMIT), stderrTail: stderr.slice(-TAIL_LIMIT), ...r });
    };
    const start = () => {
      const child = spawn(member.command, args, {
        cwd,
        env: { ...process.env, ARENA_TASK: task, ARENA_MEMBER: member.name },
        shell: useShell,
      });
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
        if (stdout.length > TAIL_LIMIT) stdout = stdout.slice(-TAIL_LIMIT);
      });
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
        if (stderr.length > TAIL_LIMIT) stderr = stderr.slice(-TAIL_LIMIT);
      });
      child.on("error", (e) => {
        // Windows 垫片命令（如 dsh.cmd / npx）在无 shell spawn 下 ENOENT——用 shell 重试一次
        if ((e as NodeJS.ErrnoException).code === "ENOENT" && !useShell) {
          useShell = true;
          start();
          return;
        }
        done({ exitCode: null, timedOut: false, spawnError: String(e) });
      });
      child.on("close", async (code) => {
        // 队员验收命令（M3 自动裁决依据）：主命令成功且配置了 testCmd 才跑
        if (code === 0 && member.testCmd) {
          const t0 = Date.now();
          try {
            await pexec(member.testCmd, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
            done({ exitCode: code, timedOut, test: { ran: true, pass: true, durationMs: Date.now() - t0, tail: "" } });
          } catch (e) {
            const err = e as { stdout?: string; stderr?: string };
            done({
              exitCode: code,
              timedOut,
              test: {
                ran: true,
                pass: false,
                durationMs: Date.now() - t0,
                tail: ((err.stdout ?? "") + (err.stderr ?? "")).slice(-TAIL_LIMIT),
              },
            });
          }
          return;
        }
        done({ exitCode: code, timedOut });
      });
    };
    start();
  });
}

export async function runArena(opts: ArenaRunOptions): Promise<ArenaRunResult> {
  validateMembers(opts.members);
  await ensureGitRepo(opts.repoRoot);
  await hideWorktreeDir(opts.repoRoot);
  const runId = opts.runId ?? `a${Date.now().toString(36)}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wtRoot = worktreeRoot(opts.repoRoot, runId);
  const manifestPath = join(wtRoot, "manifest.json");

  const members: { member: ArenaMember; path: string; branch: string }[] = [];
  for (const m of opts.members) {
    const path = worktreePathFor(opts.repoRoot, runId, m.name);
    const branch = branchFor(runId, m.name);
    await addWorktree(opts.repoRoot, runId, m.name);
    members.push({ member: m, path, branch });
  }

  const startedAt = new Date().toISOString();
  await writeManifest(manifestPath, { runId, task: opts.task, status: "running", startedAt, members: [] });

  const results = await Promise.all(
    members.map((m) => runMember(m.member, m.path, m.branch, opts.task, timeoutMs)),
  );

  const mainClean = await isMainTreeClean(opts.repoRoot);
  const anySpawnError = results.some((r) => r.spawnError !== undefined);
  await writeManifest(manifestPath, {
    runId,
    task: opts.task,
    status: anySpawnError ? "failed" : "finished",
    startedAt,
    finishedAt: new Date().toISOString(),
    members: results,
  });

  return { runId, worktreeRoot: wtRoot, manifestPath, members: results, mainClean };
}
