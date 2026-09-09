"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// src/worktree.ts
async function git(repoRoot, args) {
  const { stdout } = await pexec2("git", args, { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
async function ensureGitRepo(repoRoot) {
  await git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
}
function worktreeRoot(repoRoot, runId) {
  return (0, import_node_path.join)(repoRoot, ".dsh-worktrees", runId);
}
function branchFor(runId, member) {
  return `wt/arena-${runId}/${member}`;
}
function worktreePathFor(repoRoot, runId, member) {
  return (0, import_node_path.join)(worktreeRoot(repoRoot, runId), member);
}
async function hideWorktreeDir(repoRoot) {
  const excludePath = (0, import_node_path.join)(repoRoot, ".git", "info", "exclude");
  await (0, import_promises.mkdir)((0, import_node_path.dirname)(excludePath), { recursive: true });
  let text = "";
  try {
    text = await (0, import_promises.readFile)(excludePath, "utf8");
  } catch {
  }
  const lines = text.split(/\r?\n/);
  if (!lines.includes(".dsh-worktrees/")) {
    const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    await (0, import_promises.appendFile)(excludePath, `${prefix}.dsh-worktrees/
`, "utf8");
  }
}
async function addWorktree(repoRoot, runId, member) {
  const path = worktreePathFor(repoRoot, runId, member);
  const branch = branchFor(runId, member);
  await git(repoRoot, ["worktree", "add", "-b", branch, path]);
  return { path, branch };
}
async function removeWorktree(repoRoot, path, opts = {}) {
  await git(repoRoot, ["worktree", "remove", ...opts.force ? ["--force"] : [], path]);
}
async function isMainTreeClean(repoRoot) {
  const out = await git(repoRoot, ["status", "--porcelain"]);
  return out.trim() === "";
}
var import_node_child_process, import_node_util, import_promises, import_node_path, pexec2;
var init_worktree = __esm({
  "src/worktree.ts"() {
    "use strict";
    import_node_child_process = require("node:child_process");
    import_node_util = require("node:util");
    import_promises = require("node:fs/promises");
    import_node_path = require("node:path");
    pexec2 = (0, import_node_util.promisify)(import_node_child_process.execFile);
  }
});

// src/runner.ts
function substituteTask(args, task) {
  return args.map((a) => a.replaceAll("{task}", task));
}
function validateMembers(members) {
  if (!Array.isArray(members) || members.length < 2) {
    throw new Error("\u6BD4\u8D5B\u81F3\u5C11\u9700\u8981 2 \u540D\u961F\u5458\uFF08--member \u81F3\u5C11\u4E24\u4E2A\uFF09");
  }
  if (members.length > 5) {
    throw new Error("\u961F\u5458\u4E0A\u9650 5\uFF08\u6210\u672C \xD7N\uFF0C\u65B9\u6848\u5B9A\u4F4D\u300C\u5173\u952E\u4EFB\u52A1\u624D\u5F00\u64C2\u300D\uFF09");
  }
  const names = /* @__PURE__ */ new Set();
  for (const m of members) {
    if (!m.name || /\s/.test(m.name)) throw new Error(`\u961F\u5458\u540D\u975E\u6CD5\uFF1A\u300C${m.name}\u300D\uFF08\u4E0D\u53EF\u4E3A\u7A7A/\u542B\u7A7A\u767D\uFF09`);
    if (names.has(m.name)) throw new Error(`\u961F\u5458\u540D\u91CD\u590D\uFF1A${m.name}`);
    names.add(m.name);
    if (!m.command) throw new Error(`\u961F\u5458 ${m.name} \u7F3A command`);
  }
}
async function writeManifest(path, doc) {
  await (0, import_promises2.mkdir)((0, import_node_path2.join)(path, ".."), { recursive: true });
  await (0, import_promises2.writeFile)(path, JSON.stringify(doc, null, 2), "utf8");
}
function runMember(member, cwd, branch, task, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const base = { name: member.name, worktreePath: cwd, branch };
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer;
    let useShell = false;
    const args = substituteTask(member.args ?? [], task);
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...base, durationMs: Date.now() - started, stdoutTail: stdout.slice(-TAIL_LIMIT), stderrTail: stderr.slice(-TAIL_LIMIT), ...r });
    };
    const start = () => {
      const child = (0, import_node_child_process2.spawn)(member.command, args, {
        cwd,
        env: { ...process.env, ARENA_TASK: task, ARENA_MEMBER: member.name },
        shell: useShell
      });
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout?.on("data", (d) => {
        stdout += d.toString("utf8");
        if (stdout.length > TAIL_LIMIT) stdout = stdout.slice(-TAIL_LIMIT);
      });
      child.stderr?.on("data", (d) => {
        stderr += d.toString("utf8");
        if (stderr.length > TAIL_LIMIT) stderr = stderr.slice(-TAIL_LIMIT);
      });
      child.on("error", (e) => {
        if (e.code === "ENOENT" && !useShell) {
          useShell = true;
          start();
          return;
        }
        done({ exitCode: null, timedOut: false, spawnError: String(e) });
      });
      child.on("close", async (code) => {
        if (code === 0 && member.testCmd) {
          const t0 = Date.now();
          try {
            await pexec(member.testCmd, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
            done({ exitCode: code, timedOut, test: { ran: true, pass: true, durationMs: Date.now() - t0, tail: "" } });
          } catch (e) {
            const err = e;
            done({
              exitCode: code,
              timedOut,
              test: {
                ran: true,
                pass: false,
                durationMs: Date.now() - t0,
                tail: ((err.stdout ?? "") + (err.stderr ?? "")).slice(-TAIL_LIMIT)
              }
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
async function runArena(opts) {
  validateMembers(opts.members);
  await ensureGitRepo(opts.repoRoot);
  await hideWorktreeDir(opts.repoRoot);
  const runId = opts.runId ?? `a${Date.now().toString(36)}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wtRoot = worktreeRoot(opts.repoRoot, runId);
  const manifestPath = (0, import_node_path2.join)(wtRoot, "manifest.json");
  const members = [];
  for (const m of opts.members) {
    const path = worktreePathFor(opts.repoRoot, runId, m.name);
    const branch = branchFor(runId, m.name);
    await addWorktree(opts.repoRoot, runId, m.name);
    members.push({ member: m, path, branch });
  }
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  await writeManifest(manifestPath, { runId, task: opts.task, status: "running", startedAt, members: [] });
  const results = await Promise.all(
    members.map((m) => runMember(m.member, m.path, m.branch, opts.task, timeoutMs))
  );
  const mainClean = await isMainTreeClean(opts.repoRoot);
  const anySpawnError = results.some((r) => r.spawnError !== void 0);
  await writeManifest(manifestPath, {
    runId,
    task: opts.task,
    status: anySpawnError ? "failed" : "finished",
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    members: results
  });
  return { runId, worktreeRoot: wtRoot, manifestPath, members: results, mainClean };
}
var import_node_child_process2, import_node_util2, import_promises2, import_node_path2, pexecFile, DEFAULT_TIMEOUT_MS, TAIL_LIMIT;
var init_runner = __esm({
  "src/runner.ts"() {
    "use strict";
    import_node_child_process2 = require("node:child_process");
    import_node_util2 = require("node:util");
    import_promises2 = require("node:fs/promises");
    import_node_path2 = require("node:path");
    init_worktree();
    pexecFile = (0, import_node_util2.promisify)(import_node_child_process2.execFile);
    DEFAULT_TIMEOUT_MS = 10 * 6e4;
    TAIL_LIMIT = 2e4;
  }
});

// src/verdict.ts
var verdict_exports = {};
__export(verdict_exports, {
  buildVerdict: () => buildVerdict,
  commitMemberWork: () => commitMemberWork,
  memberStats: () => memberStats,
  mergePreview: () => mergePreview,
  mergeWinner: () => mergeWinner,
  readManifest: () => readManifest
});
async function gitIn(cwd, args) {
  const { stdout } = await pexecFile2("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
async function commitMemberWork(worktreePath, member) {
  await gitIn(worktreePath, ["add", "-A"]);
  let hasChanges = false;
  try {
    await gitIn(worktreePath, ["diff", "--cached", "--quiet"]);
  } catch {
    hasChanges = true;
  }
  if (!hasChanges) {
    const head2 = (await gitIn(worktreePath, ["rev-parse", "HEAD"])).trim();
    return { committed: false, head: head2 };
  }
  await gitIn(worktreePath, ["commit", "-m", `arena: ${member} \u4EA4\u4ED8\u7269`]);
  const head = (await gitIn(worktreePath, ["rev-parse", "HEAD"])).trim();
  return { committed: true, head };
}
async function memberStats(repoRoot, branch, mainRef = "main") {
  const nameOnly = (await gitIn(repoRoot, ["diff", "--name-only", `${mainRef}...${branch}`])).trim();
  const files = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];
  const stat = (await gitIn(repoRoot, ["diff", "--stat", `${mainRef}...${branch}`])).trim();
  const last = stat.split("\n").pop() ?? "";
  const ins = last.match(/(\d+) insertion/);
  const del = last.match(/(\d+) deletion/);
  const head = (await gitIn(repoRoot, ["rev-parse", branch])).trim();
  const tree = (await gitIn(repoRoot, ["rev-parse", `${branch}^{tree}`])).trim();
  const receipt = (0, import_node_crypto.createHash)("sha256").update(`${head}
${tree}`).digest("hex").slice(0, 16);
  return {
    files,
    filesCount: files.length,
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
    uncommitted: false,
    receipt
  };
}
async function mergePreview(repoRoot, branch, mainRef = "main") {
  try {
    await pexecFile2("git", ["merge-tree", "--write-tree", "--name-only", mainRef, branch], {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024
    });
    return { clean: true, conflicts: [] };
  } catch (e) {
    const err = e;
    if (err.code === 1) {
      const lines = (err.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      return { clean: false, conflicts: lines.slice(1) };
    }
    if ((err.stderr ?? "").includes("unknown option") || (err.stderr ?? "").includes("Unknown option")) {
      throw new Error("git \u7248\u672C\u8FC7\u4F4E\uFF0C\u4E0D\u652F\u6301 merge-tree --write-tree\uFF08\u9700\u8981 git \u2265 2.38\uFF09");
    }
    throw e;
  }
}
async function readManifest(repoRoot, runId) {
  const p = (0, import_node_path3.join)(repoRoot, ".dsh-worktrees", runId, "manifest.json");
  return JSON.parse(await (0, import_promises3.readFile)(p, "utf8"));
}
async function buildVerdict(repoRoot, runId, mainRef = "main") {
  const manifest = await readManifest(repoRoot, runId);
  const rows = [];
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
      conflicts: mp.conflicts
    });
  }
  return rows;
}
async function mergeWinner(repoRoot, runId, member, opts = {}) {
  const mainRef = opts.mainRef ?? "main";
  const manifest = await readManifest(repoRoot, runId);
  const m = manifest.members.find((x) => x.name === member);
  if (!m) throw new Error(`run ${runId} \u4E2D\u6CA1\u6709\u961F\u5458\u300C${member}\u300D`);
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
      keptForInspection: manifest.members.map((x) => x.worktreePath)
    };
  }
  await gitIn(repoRoot, ["merge", "--no-ff", m.branch, "-m", `arena: \u9009\u4F18 ${member}\uFF08run ${runId}\uFF09`]);
  const mergeCommit = (await gitIn(repoRoot, ["rev-parse", "HEAD"])).trim();
  let testOutput = null;
  let rolledBack = false;
  if (opts.testCmd) {
    try {
      const r = await exec(opts.testCmd, { cwd: repoRoot, timeout: 3e5, maxBuffer: 16 * 1024 * 1024 });
      testOutput = (r.stdout + r.stderr).slice(-4e3);
    } catch (e) {
      const err = e;
      testOutput = ((err.stdout ?? "") + (err.stderr ?? "")).slice(-4e3);
      if (opts.autoRollback) {
        await gitIn(repoRoot, ["reset", "--hard", prevMainHead]);
        rolledBack = true;
      }
    }
  }
  const cleanedWorktrees = [];
  const keptForInspection = [];
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
var import_node_child_process3, import_node_util3, import_node_crypto, import_promises3, import_node_path3, pexecFile2, exec;
var init_verdict = __esm({
  "src/verdict.ts"() {
    "use strict";
    import_node_child_process3 = require("node:child_process");
    import_node_util3 = require("node:util");
    import_node_crypto = require("node:crypto");
    import_promises3 = require("node:fs/promises");
    import_node_path3 = require("node:path");
    init_worktree();
    pexecFile2 = (0, import_node_util3.promisify)(import_node_child_process3.execFile);
    exec = (0, import_node_util3.promisify)(import_node_child_process3.execFile);
  }
});

// src/notify.ts
var notify_exports = {};
__export(notify_exports, {
  notifyRaceFinished: () => notifyRaceFinished,
  renderRaceText: () => renderRaceText
});
function dingSign(secret, timestamp) {
  const stringToSign = `${timestamp}
${secret}`;
  return (0, import_node_crypto2.createHmac)("sha256", stringToSign).update("").digest("base64");
}
function feishuSign(secret, timestamp) {
  const stringToSign = `${timestamp}
${secret}`;
  return (0, import_node_crypto2.createHmac)("sha256", stringToSign).update("").digest("base64");
}
function renderRaceText(s) {
  const lines = [
    `**\u6BD4\u6B66\u53F0 \xB7 \u6BD4\u8D5B ${s.runId} \u7ED3\u675F**`,
    `\u4EFB\u52A1\uFF1A${s.task}`,
    ...s.members.map((m) => `- ${m.name}\uFF1A${m.verdict}\uFF08${Math.round(m.durationMs / 1e3)}s\uFF09`),
    s.mergedMember ? `\u{1F3C6} \u81EA\u52A8\u88C1\u51B3\uFF1A**${s.mergedMember}** \u5DF2\u5408\u5E76\u8FDB\u4E3B\u5E72` : s.autoWinner ? `\u81EA\u52A8\u89C4\u5219\u9009\u51FA ${s.autoWinner}\uFF08\u672A\u5408\u5E76\uFF0C\u7B49\u4EBA\u5DE5\u786E\u8BA4\uFF09` : "\u26A0 \u65E0\u4EBA\u901A\u8FC7\u9A8C\u6536\uFF0C\u4EA4\u4EBA\u5DE5\u88C1\u51B3"
  ];
  return lines.join("\n");
}
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
}
async function notifyRaceFinished(cfg, s) {
  const outcome = { dingtalk: "skipped", feishu: "skipped", errors: [] };
  const text = renderRaceText(s);
  if (cfg.dingtalk?.webhook) {
    try {
      const ts = Date.now();
      let url = cfg.dingtalk.webhook;
      if (cfg.dingtalk.secret) {
        url += `&timestamp=${ts}&sign=${encodeURIComponent(dingSign(cfg.dingtalk.secret, ts))}`;
      }
      const btns = cfg.panelUrl ? [{ title: "\u67E5\u770B\u88C1\u51B3", actionURL: cfg.panelUrl }] : [];
      await postJson(url, {
        msgtype: "actionCard",
        actionCard: {
          title: `\u6BD4\u6B66\u53F0 ${s.runId} \u7ED3\u675F`,
          text: `${text}

${cfg.panelUrl ? `[\u67E5\u770B\u88C1\u51B3](${cfg.panelUrl})` : ""}`,
          btnOrientation: "0",
          btns
        }
      });
      outcome.dingtalk = "sent";
    } catch (e) {
      outcome.dingtalk = "error";
      outcome.errors.push(`dingtalk: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (cfg.feishu?.webhook) {
    try {
      const ts = Math.floor(Date.now() / 1e3);
      const body = {
        timestamp: String(ts),
        msg_type: "text",
        content: { text }
      };
      if (cfg.feishu.secret) body.sign = feishuSign(cfg.feishu.secret, ts);
      await postJson(cfg.feishu.webhook, body);
      outcome.feishu = "sent";
    } catch (e) {
      outcome.feishu = "error";
      outcome.errors.push(`feishu: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return outcome;
}
var import_node_crypto2;
var init_notify = __esm({
  "src/notify.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
  }
});

// src/contest.ts
var contest_exports = {};
__export(contest_exports, {
  pickWinner: () => pickWinner,
  runContest: () => runContest
});
function pickWinner(results) {
  const eligible = results.filter((m) => m.test?.ran && m.test.pass && m.exitCode === 0);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => b.durationMs < a.durationMs ? b : a).name;
}
async function runContest(opts) {
  const members = opts.testCmd ? opts.members.map((m) => ({ ...m, testCmd: m.testCmd ?? opts.testCmd })) : opts.members;
  const run = await runArena({
    repoRoot: opts.repoRoot,
    task: opts.task,
    members,
    runId: opts.runId,
    timeoutMs: opts.timeoutMs
  });
  const autoWinner = pickWinner(run.members);
  let mergedMember = null;
  let reason = "";
  if (autoWinner === null) {
    reason = run.members.some((m) => m.exitCode === 0) ? "\u65E0\u4EBA\u901A\u8FC7\u9A8C\u6536 \u2192 \u4EA4\u4EBA\u5DE5\u88C1\u51B3" : "\u5168\u5458\u5931\u8D25 \u2192 \u4EA4\u4EBA\u5DE5\u5904\u7F6E";
  } else if (opts.autoMerge === false) {
    reason = `\u81EA\u52A8\u89C4\u5219\u9009\u51FA ${autoWinner}\uFF0CautoMerge=false \u672A\u5408\u5E76`;
  } else {
    await mergeWinner(opts.repoRoot, run.runId, autoWinner, { cleanup: true });
    mergedMember = autoWinner;
    reason = `\u81EA\u52A8\u88C1\u51B3\uFF1A${autoWinner} \u9A8C\u6536\u901A\u8FC7\u4E14\u6700\u5FEB\uFF0C\u5DF2\u5408\u5E76`;
  }
  if (opts.notify) {
    try {
      const { notifyRaceFinished: notifyRaceFinished2 } = await Promise.resolve().then(() => (init_notify(), notify_exports));
      await notifyRaceFinished2(opts.notify, {
        runId: run.runId,
        task: opts.task,
        autoWinner,
        mergedMember,
        members: run.members.map((m) => ({
          name: m.name,
          verdict: m.spawnError ? "\u5931\u8D25" : m.timedOut ? "\u8D85\u65F6" : m.test?.ran ? m.test.pass ? "\u901A\u8FC7" : "\u672A\u901A\u8FC7" : m.exitCode === 0 ? "\u5B8C\u6210" : "\u5931\u8D25",
          durationMs: m.durationMs
        }))
      });
    } catch (e) {
      reason += `\uFF08\u901A\u77E5\u63A8\u9001\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}\uFF09`;
    }
  }
  return { run, autoWinner, mergedMember, reason };
}
var init_contest = __esm({
  "src/contest.ts"() {
    "use strict";
    init_runner();
    init_verdict();
  }
});

// src/dsh.ts
var dsh_exports = {};
__export(dsh_exports, {
  ArenaService: () => ArenaService
});
module.exports = __toCommonJS(dsh_exports);
var import_cordis = require("@deepseek-ai/cordis");
var import_dsh_typert_protocol = require("@deepseek-ai/dsh-typert-protocol");
var ArenaService = class extends import_dsh_typert_protocol.TypertRemoteService {
  static inject = [];
  constructor(ctx) {
    super(ctx, "arena");
  }
  async [import_cordis.Service.init]() {
  }
  async contest(p) {
    const { runContest: runContest2 } = await Promise.resolve().then(() => (init_contest(), contest_exports));
    const r = await runContest2({
      repoRoot: p.repo,
      task: p.task,
      members: p.members,
      testCmd: p.testCmd,
      timeoutMs: p.timeoutMs,
      autoMerge: p.autoMerge
    });
    return {
      runId: r.run.runId,
      manifestPath: r.run.manifestPath,
      mainClean: r.run.mainClean,
      autoWinner: r.autoWinner ?? void 0,
      mergedMember: r.mergedMember ?? void 0,
      reason: r.reason
    };
  }
  async verdict(p) {
    const { buildVerdict: buildVerdict2 } = await Promise.resolve().then(() => (init_verdict(), verdict_exports));
    const rows = await buildVerdict2(p.repo, p.runId, p.mainRef);
    return JSON.parse(JSON.stringify({ rows }));
  }
  async merge(p) {
    const { mergeWinner: mergeWinner2 } = await Promise.resolve().then(() => (init_verdict(), verdict_exports));
    const r = await mergeWinner2(p.repo, p.runId, p.member, {
      testCmd: p.testCmd,
      autoRollback: p.autoRollback,
      cleanup: p.cleanup
    });
    return JSON.parse(JSON.stringify(r));
  }
};
__decorateClass([
  (0, import_dsh_typert_protocol.Remote)("contest")
], ArenaService.prototype, "contest", 1);
__decorateClass([
  (0, import_dsh_typert_protocol.Remote)("verdict")
], ArenaService.prototype, "verdict", 1);
__decorateClass([
  (0, import_dsh_typert_protocol.Remote)("merge")
], ArenaService.prototype, "merge", 1);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ArenaService
});
