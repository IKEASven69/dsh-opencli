/** list.js：CLI 用的 worktree 列表读取（porcelain 解析，纯展示用途）。 */
import { join } from "node:path";
import { git } from "./worktree.js";

export async function listWorktreeRows(repoRoot: string): Promise<string[]> {
  const out = await git(repoRoot, ["worktree", "list", "--porcelain"]);
  const rows: string[] = [];
  let cur = "";
  for (const ln of out.split(/\r?\n/)) {
    if (ln.startsWith("worktree ")) {
      if (cur) rows.push(cur);
      cur = ln.slice("worktree ".length);
    } else if (ln.startsWith("branch ")) {
      cur += `  [${ln.slice("branch ".length)}]`;
    }
  }
  if (cur) rows.push(cur);
  void join;
  return rows;
}
