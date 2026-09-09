/**
 * dsh-arena 宿主半：TypertRemoteService，把扇出引擎暴露为 Client→Host RPC。
 * 注意：本插件不依赖 experimental 包；引擎全部为 Node 内建 + git。
 * 【待真机验收】RPC 通路与挂载需在装了 dsh 运行时的环境里冒烟。
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/cordis' {
  interface Context {
    arena: ArenaService
  }
}

export interface ArenaMemberInput {
  name: string
  command: string
  args?: string[]
  testCmd?: string
}

export class ArenaService extends TypertRemoteService {
  static inject = []

  constructor(ctx: Context) {
    super(ctx, 'arena')
  }

  protected async [Service.init](): Promise<void> {
    // 引擎自足（node fs/git/子进程），无 ctx 服务依赖；此处预留通道/通知配置装载点
  }

  @Remote('contest')
  async contest(p: {
    repo: string
    task: string
    members: ArenaMemberInput[]
    testCmd?: string
    timeoutMs?: number
    autoMerge?: boolean
  }) {
    const { runContest } = await import('./contest.js')
    const r = await runContest({
      repoRoot: p.repo,
      task: p.task,
      members: p.members,
      testCmd: p.testCmd,
      timeoutMs: p.timeoutMs,
      autoMerge: p.autoMerge,
    })
    return {
      runId: r.run.runId,
      manifestPath: r.run.manifestPath,
      mainClean: r.run.mainClean,
      autoWinner: r.autoWinner ?? undefined,
      mergedMember: r.mergedMember ?? undefined,
      reason: r.reason,
    }
  }

  @Remote('verdict')
  async verdict(p: { repo: string; runId: string; mainRef?: string }) {
    const { buildVerdict } = await import('./verdict.js')
    const rows = await buildVerdict(p.repo, p.runId, p.mainRef)
    // typert 网关拒绝显式 undefined 键——整体清洗
    return JSON.parse(JSON.stringify({ rows }))
  }

  @Remote('merge')
  async merge(p: { repo: string; runId: string; member: string; testCmd?: string; autoRollback?: boolean; cleanup?: boolean }) {
    const { mergeWinner } = await import('./verdict.js')
    const r = await mergeWinner(p.repo, p.runId, p.member, {
      testCmd: p.testCmd,
      autoRollback: p.autoRollback,
      cleanup: p.cleanup,
    })
    return JSON.parse(JSON.stringify(r))
  }
}
